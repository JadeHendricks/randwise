import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { roundRand } from '../../core/engine';
import { NAV_ITEMS } from '../../core/navigation/nav-items';
import { PlanBuilderStore } from '../../core/plan/plan-builder.store';
import { PlanContextStore } from '../../core/plan/plan-context.store';
import { SalaryEstimator } from '../../core/salary/salary-estimator';
import { SalaryInputsStore } from '../../core/salary/salary-inputs.store';
import { Button } from '../../shared/atoms/button/button';
import { Card } from '../../shared/atoms/card/card';
import { DotMatrix, type DotColumn } from '../../shared/atoms/dot-matrix/dot-matrix';
import { Icon } from '../../shared/atoms/icon/icon';
import { Money } from '../../shared/atoms/money/money';
import { formatPercent, formatRand } from '../../shared/format/format-rand';
import { BentoTile } from '../../shared/molecules/bento-tile/bento-tile';

// Whole rands where possible ("R30 000"); cents only when the amount has them.
const AMOUNT = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 2 });
// The RA contribution is a whole-rand input, so it reads "R 2 000" like the plan text.
const WHOLE_RAND = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
});

@Component({
  selector: 'rw-dashboard-page',
  imports: [BentoTile, Button, Card, DotMatrix, Icon, Money, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  // The hero CTA already leads to Pay and the dashboard is this page, so neither gets a tile.
  protected readonly tiles = NAV_ITEMS.filter((item) => item.path !== '' && item.path !== 'pay');

  protected readonly store = inject(SalaryInputsStore);
  protected readonly context = inject(PlanContextStore);
  private readonly estimator = inject(SalaryEstimator);
  private readonly planBuilder = inject(PlanBuilderStore);

  // Why: reachedSummary stays true after Back, so only onSummary means the plan is ready to view.
  protected readonly planStatus = computed<'new' | 'progress' | 'ready'>(() => {
    if (this.planBuilder.onSummary()) return 'ready';
    return this.planBuilder.started() ? 'progress' : 'new';
  });
  protected readonly planText = computed(() => {
    switch (this.planStatus()) {
      case 'ready':
        // steps() is lazy, so it is only read once the plan is ready.
        return `Your plan has ${this.planBuilder.steps().length} steps.`;
      case 'progress':
        return `Step ${this.planBuilder.position() + 1} of ${this.planBuilder.progressTotal()} is waiting for you.`;
      default:
        return 'Answer a few short questions and get a step-by-step plan.';
    }
  });
  protected readonly planAction = computed(() => {
    switch (this.planStatus()) {
      case 'ready':
        return 'View your plan';
      case 'progress':
        return 'Continue your plan';
      default:
        return 'Start the Plan Builder';
    }
  });

  // Null when there is no tax data or the engine rejected the figures.
  protected readonly net = computed(() => {
    const estimate = this.estimator.estimate();
    return estimate?.ok ? (estimate.breakdown.find((l) => l.key === 'net')?.monthly ?? null) : null;
  });

  protected readonly summary = computed(() => {
    const { basis, period, amount, age } = this.store.inputs();
    const what = basis === 'gross' ? 'gross salary' : 'take-home pay';
    const per = period === 'monthly' ? 'a month' : 'a year';
    return `Based on a R${AMOUNT.format(amount)} ${what} ${per}, age ${age}.`;
  });

  protected readonly split = computed<readonly DotColumn[]>(() => {
    const estimate = this.estimator.estimate();
    return estimate?.ok
      ? estimate.breakdown.map((line) => ({ label: line.label, value: line.monthly }))
      : [];
  });

  // Columns run left to right in breakdown order, with the highlighted first column marked.
  protected readonly splitCaption = computed(() =>
    this.split()
      .map((column, i) => (i === 0 ? `${column.label} (highlighted)` : column.label))
      .join(', '),
  );

  // Plain text, not rw-money: the dashboard keeps exactly one money figure (the hero).
  protected readonly raFigures = computed(() => {
    const ra = this.context.outputs().ra;
    if (!ra) return null;
    return {
      headroomAnnual: formatRand(roundRand(ra.headroomAnnual)),
      headroomMonthly: formatRand(roundRand(ra.headroomMonthly)),
      saving: formatRand(roundRand(ra.taxSavingAnnual)),
      contribution: WHOLE_RAND.format(this.context.ra().contributionMonthly),
    };
  });

  // Plain text too. Null when there is no tax data or the Retire at 55 figures fail.
  protected readonly retireFigures = computed(() => {
    const retire = this.context.retireOutputs();
    if (!retire) return null;
    return {
      required: WHOLE_RAND.format(retire.requiredMonthly),
      goal: WHOLE_RAND.format(retire.goalNetMonthly),
      age: retire.retirementAge,
      onTrack: formatPercent(retire.ringPercent / 100, 0),
    };
  });
  // Plain text too. Null when there is no tax data or the Budget figures fail.
  protected readonly budgetFigures = computed(() => {
    const budget = this.context.budgetOutputs();
    if (!budget) return null;
    const percent = (value: number) => formatPercent(value / 100, 0);
    const balance =
      budget.status === 'balanced'
        ? 'Every rand has a job'
        : budget.status === 'under'
          ? `${formatRand(roundRand(budget.unallocated))} unallocated`
          : `Over by ${formatRand(roundRand(budget.overAllocated))}`;
    return {
      net: formatRand(roundRand(budget.netMonthly)),
      needs: percent(budget.groupPercents.needs),
      wants: percent(budget.groupPercents.wants),
      savings: percent(budget.groupPercents.savings),
      balance,
    };
  });
  protected readonly budgetUnavailable = computed(() =>
    this.context.budgetEstimate() === null
      ? 'Tax data is unavailable.'
      : 'Check the figures on the Budget page.',
  );

  // Plain text too. Null when there is no tax data or the Journey figures fail.
  protected readonly journeyFigures = computed(() => {
    const journey = this.context.journeyOutputs();
    if (!journey) return null;
    return {
      age: journey.retirementAge,
      taxSaved: formatRand(roundRand(journey.taxSaved)),
      tfsa: formatRand(roundRand(journey.tfsaAtRetirement)),
    };
  });
  protected readonly journeyUnavailable = computed(() =>
    this.context.journeyEstimate() === null
      ? 'Tax data is unavailable.'
      : 'Check the figures on the Journey page.',
  );
  // Why: the estimate is null for "no tax data"; any other missing output means the figures failed.
  protected readonly retireUnavailable = computed(() =>
    this.context.retireEstimate() === null
      ? 'Tax data is unavailable.'
      : 'Check the figures on the Retire at 55 page.',
  );
  // Why: the estimator returns null for "no tax data" and a message for a failed estimate.
  protected readonly unavailable = computed(() => {
    const estimate = this.estimator.estimate();
    if (!estimate) return 'Tax data is unavailable, so there is no estimate to show.';
    return estimate.ok ? null : estimate.message;
  });
}
