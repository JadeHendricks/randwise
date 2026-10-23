import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { RatesService } from '../../../core/data/rates.service';
import {
  EMERGENCY_HORIZON_MONTHS,
  MONTHS_PER_YEAR,
  roundRand,
  thinSeries,
} from '../../../core/engine';
import { EmergencyFundWarning } from '../../../core/toolbox/estimate-emergency-fund';
import {
  EMERGENCY_FUND_LIMITS,
  EmergencyFundInputs,
} from '../../../core/toolbox/toolbox-inputs';
import { ToolboxStore } from '../../../core/toolbox/toolbox.store';
import { SEND_TARGETS } from '../../../core/plan/handoff';
import { PlanContextStore } from '../../../core/plan/plan-context.store';
import { AmountField } from '../../../shared/atoms/amount-field/amount-field';
import { Button } from '../../../shared/atoms/button/button';
import { Card } from '../../../shared/atoms/card/card';
import { Chip } from '../../../shared/atoms/chip/chip';
import { Icon } from '../../../shared/atoms/icon/icon';
import { LineChart, LinePoint, LineSeries } from '../../../shared/atoms/line-chart/line-chart';
import { Money } from '../../../shared/atoms/money/money';
import { RingGauge } from '../../../shared/atoms/ring-gauge/ring-gauge';
import { formatPercent, formatRand, formatRandCompact } from '../../../shared/format/format-rand';
import { SendTo } from '../../../shared/molecules/send-to/send-to';
import { StatCard } from '../../../shared/molecules/stat-card/stat-card';

// Field limits. Money steps are 1 so a typed amount is never snapped to a coarser step.
const MONEY_STEP = 1;
const PERCENT_STEP = 0.01;
const EXPENSES_MAX = 500_000;
const SAVINGS_MAX = 20_000_000;
const CONTRIBUTION_MAX = 500_000;
// The chart needs a shape, not 600 monthly points.
const CHART_POINTS = 24;
// How far ahead the engine follows the fund, for the not-reached messages.
const HORIZON_YEARS = EMERGENCY_HORIZON_MONTHS / MONTHS_PER_YEAR;

/** "27 months", or "1 month". */
function monthsText(months: number): string {
  return `${months} ${months === 1 ? 'month' : 'months'}`;
}

/** "2 years 3 months" for a month count; whole years read as "2 years". */
function spanText(months: number): string {
  const years = Math.floor(months / MONTHS_PER_YEAR);
  const rest = months % MONTHS_PER_YEAR;
  const yearPart = `${years} ${years === 1 ? 'year' : 'years'}`;
  if (years === 0) return monthsText(rest);
  return rest === 0 ? yearPart : `${yearPart} ${monthsText(rest)}`;
}

/**
 * The Emergency fund page. Every figure is a computed() over the ToolboxStore estimate (which runs
 * the pure engine); this component only rounds and formats, and sends edits back to the store.
 */
@Component({
  selector: 'rw-emergency-fund-page',
  imports: [
    AmountField,
    Button,
    Card,
    Chip,
    Icon,
    LineChart,
    Money,
    RingGauge,
    RouterLink,
    SendTo,
    StatCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './emergency-fund-page.html',
  styleUrls: ['../tool-page.scss'],
})
export class EmergencyFundPage {
  protected readonly store = inject(ToolboxStore);
  private readonly context = inject(PlanContextStore);
  private readonly rates = inject(RatesService);

  protected readonly limits = EMERGENCY_FUND_LIMITS;
  protected readonly step = MONEY_STEP;
  protected readonly percentStep = PERCENT_STEP;
  protected readonly expensesMax = EXPENSES_MAX;
  protected readonly savingsMax = SAVINGS_MAX;
  protected readonly contributionMax = CONTRIBUTION_MAX;
  // Only the Budget can take these figures, so it is the only send target offered.
  protected readonly budgetTarget = SEND_TARGETS.filter((target) => target.id === 'budget');
  protected readonly compactRand = formatRandCompact;
  protected readonly monthText = (month: number) => `Month ${Math.round(month)}`;
  protected readonly plain = (value: number) => String(Math.round(value));

  protected readonly inputs = this.store.emergencyFundInputs;

  protected readonly intro = computed(() => {
    const { monthlyExpenses, targetMonths, monthlyContribution } = this.inputs();
    return `This is an example: ${formatRand(monthlyExpenses)} of essentials for ${targetMonths} months, saving ${formatRand(monthlyContribution)} a month. Change any value; nothing is saved.`;
  });

  protected readonly rateHint = computed(() => {
    const a = this.rates.assumptions();
    return a
      ? `${a.cashReturn.description} You can change it.`
      : 'Rates are unavailable, so enter the rate your savings earn.';
  });

  protected readonly needsLabel = computed(() => {
    const needs = this.store.budgetNeeds();
    return needs === null ? null : `Use my Budget needs (${formatRand(roundRand(needs))})`;
  });

  protected readonly failure = computed(() => {
    const estimate = this.store.emergencyFundEstimate();
    return estimate.ok ? null : estimate.message;
  });

  protected readonly result = computed(() => {
    const estimate = this.store.emergencyFundEstimate();
    if (!estimate.ok) return null;
    const inputs = this.inputs();
    const { result, warnings } = estimate;
    const rand = (value: number) => formatRand(roundRand(value));

    const lead = result.reached
      ? 'You already have your emergency fund.'
      : result.monthsToGoal === null
        ? `Not reached within ${HORIZON_YEARS} years at this saving rate.`
        : `${monthsText(result.monthsToGoal)} to reach your goal`;
    const goalMonths =
      result.monthsToGoal === null ? 'Not reached' : monthsText(result.monthsToGoal);
    const withoutInterest =
      result.monthsToGoalNoInterest === null
        ? 'Without interest: never, as nothing is going in'
        : `Without interest: ${monthsText(result.monthsToGoalNoInterest)}`;

    const balance: LineSeries = {
      name: 'Emergency fund balance',
      points: thinSeries(result.series, CHART_POINTS).map(
        (point): LinePoint => ({ x: point.month, y: roundRand(point.balance) }),
      ),
    };
    const lastMonth = result.series[result.series.length - 1].month;
    const target: LineSeries = {
      name: 'Target',
      points: [
        { x: 0, y: roundRand(result.target) },
        { x: lastMonth, y: roundRand(result.target) },
      ],
    };

    const warningText: Record<EmergencyFundWarning, string> = {
      'no-expenses': 'Enter your monthly essential expenses to see a target.',
      'not-reachable': `At this saving rate the goal is not reached within ${HORIZON_YEARS} years. Save more each month or lower the number of months.`,
    };

    return {
      target: roundRand(result.target),
      lead,
      goalMonths,
      goalSpan:
        result.monthsToGoal !== null && result.monthsToGoal > 0
          ? `About ${spanText(result.monthsToGoal)}`
          : '',
      withoutInterest,
      shortfall: roundRand(result.shortfall),
      interestSentence:
        result.monthsToGoal !== null && result.monthsToGoal > 0
          ? `Interest adds ${rand(result.interestEarned)} on top of the ${rand(result.contributionsToGoal)} you save.`
          : '',
      ringPercent: result.progressPercent,
      ringCentre: formatPercent(result.progressPercent / 100, 0),
      progressText: `${rand(inputs.currentSavings)} of the ${rand(result.target)} target is saved.`,
      hasChart: result.series.length >= 2,
      balance,
      targetSeries: target,
      warnings: warnings.map((warning) => warningText[warning]),
    };
  });

  // Read out politely after each edit; empty while there is no result (the alert covers errors).
  protected readonly announcement = computed(() => {
    const r = this.result();
    return r ? `Emergency fund target ${formatRand(r.target)}. ${r.lead}.` : '';
  });

  protected set(field: keyof EmergencyFundInputs, value: number): void {
    this.store.updateEmergencyFund({ [field]: value });
  }

  protected useBudgetNeeds(): void {
    const needs = this.store.budgetNeeds();
    if (needs !== null) this.store.updateEmergencyFund({ monthlyExpenses: roundRand(needs) });
  }

  // SendTo navigates to the Budget after this runs, and the Budget shows the "From" chip.
  protected sendToBudget(): void {
    const { targetMonths, currentSavings, monthlyContribution } = this.inputs();
    this.context.sendFromEmergencyFund({
      months: targetMonths,
      saved: currentSavings,
      monthly: monthlyContribution,
    });
  }
}
