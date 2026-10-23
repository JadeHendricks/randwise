import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  linkedSignal,
  viewChild,
} from '@angular/core';

import { PlanAnswers, PlanGoal, RISK_LEVELS, riskReturnPercent } from '../../core/plan/plan-answers';
import { PlanBuilderStore } from '../../core/plan/plan-builder.store';
import type { PayPeriod } from '../../core/engine';
import { RETIRE_LIMITS } from '../../core/retire/retire-inputs';
import { BUDGET_LIMITS } from '../../core/budget/budget-inputs';
import { type AmountBasis, SALARY_LIMITS } from '../../core/salary/salary-inputs';
import { AmountField } from '../../shared/atoms/amount-field/amount-field';
import { Button } from '../../shared/atoms/button/button';
import { Card } from '../../shared/atoms/card/card';
import { LiveRegion } from '../../shared/atoms/live-region/live-region';
import { formatRandWhole } from '../../shared/format/format-rand';
import { ChoiceList, ChoiceOption } from '../../shared/molecules/choice-list/choice-list';
import {
  SegmentedControl,
  SegmentedOption,
} from '../../shared/molecules/segmented-control/segmented-control';
import { StepProgress } from '../../shared/molecules/step-progress/step-progress';
import { GOAL_OPTIONS, QUESTION_COPY } from './plan-format';

// Field limits. Money steps are 1 so a typed amount is never snapped to a coarser step.
const MONEY_STEP = 1;
const GROSS_MAX: Record<PayPeriod, number> = { monthly: 500_000, annual: 6_000_000 };
const RETIRE_INCOME_MAX = 500_000;
const SURPLUS_MAX = 200_000;
const BALANCE_MAX = 20_000_000;
const TFSA_TARGET_MAX = 10_000_000;
const FALLBACK_EARLIEST_AGE = 55;

const AMOUNT_TEXT = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 2 });

const BASIS_OPTIONS: readonly SegmentedOption<AmountBasis>[] = [
  { value: 'gross', label: 'Gross pay' },
  { value: 'net', label: 'Take-home pay' },
];
const PERIOD_OPTIONS: readonly SegmentedOption<PayPeriod>[] = [
  { value: 'monthly', label: 'Per month' },
  { value: 'annual', label: 'Per year' },
];

type NumberAnswer =
  | 'raBalance'
  | 'tfsaBalance'
  | 'emergencySaved'
  | 'retireAge'
  | 'retireIncomeMonthly'
  | 'tfsaTarget'
  | 'tfsaMonthly'
  | 'emergencyMonths'
  | 'surplusMonthly';

let nextId = 0;

/**
 * The guided questions, one at a time. The store holds the answers and the position; this
 * component shows the current question, validates through the store, and manages focus: after a
 * move the person made, the heading takes focus so a screen reader starts at the new question.
 */
@Component({
  selector: 'rw-plan-wizard',
  imports: [AmountField, Button, Card, ChoiceList, LiveRegion, SegmentedControl, StepProgress],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-wizard.html',
  styleUrl: './plan-wizard.scss',
})
export class PlanWizard {
  protected readonly plan = inject(PlanBuilderStore);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  protected readonly headingId = `rw-plan-wizard-heading-${nextId++}`;
  protected readonly step = MONEY_STEP;
  protected readonly ageLimits = SALARY_LIMITS.age;
  protected readonly retireAgeLimits = RETIRE_LIMITS.retirementAge;
  protected readonly monthsLimits = BUDGET_LIMITS.emergencyMonths;
  protected readonly retireIncomeMax = RETIRE_INCOME_MAX;
  protected readonly surplusMax = SURPLUS_MAX;
  protected readonly balanceMax = BALANCE_MAX;
  protected readonly tfsaTargetMax = TFSA_TARGET_MAX;
  protected readonly basisOptions = BASIS_OPTIONS;
  protected readonly periodOptions = PERIOD_OPTIONS;
  protected readonly goalOptions = GOAL_OPTIONS;

  protected readonly question = this.plan.currentQuestion;
  protected readonly copy = computed(() => QUESTION_COPY[this.question()]);
  protected readonly answers = this.plan.answers;

  // The error shows only after a failed Next, and goes away when the question changes. A plain
  // `computed` would also reset on every edit; the link to `question` keeps it to moves.
  protected readonly attempted = linkedSignal({ source: this.question, computation: () => false });
  protected readonly showError = computed(() => this.attempted() && this.plan.problem() !== null);

  protected readonly isLast = computed(
    () =>
      this.answers().goal !== null && this.plan.position() === this.plan.questions().length - 1,
  );
  protected readonly nextLabel = computed(() => (this.isLast() ? 'See my plan' : 'Next'));

  // Read out politely after each move; the heading focus announces it too, so this covers
  // screen readers that do not move their cursor to a focused heading.
  protected readonly announcement = computed(
    () =>
      `Step ${this.plan.position() + 1} of ${this.plan.progressTotal()}: ${this.copy().title}`,
  );

  protected readonly incomeLabel = computed(() => {
    const { basis, period } = this.answers().income;
    return `${basis === 'gross' ? 'Gross pay' : 'Take-home pay'} per ${period === 'monthly' ? 'month' : 'year'}`;
  });
  protected readonly incomeMax = computed(() => GROSS_MAX[this.answers().income.period]);

  /** What the income works out to, from the Pay engine through the store. Null while nothing is entered. */
  protected readonly derived = computed(() => {
    const { income } = this.answers();
    if (income.amount <= 0) return null;
    const basics = this.plan.basics();
    if (!basics) {
      return {
        failed: true,
        text:
          this.plan.rules() === null
            ? 'Tax data is unavailable, so your take-home pay cannot be worked out.'
            : 'We could not work that out. Check the amount and try again.',
      };
    }
    return {
      failed: false,
      text:
        income.basis === 'gross'
          ? `That is about ${formatRandWhole(basics.netMonthly)} take-home a month (${formatRandWhole(basics.netAnnual)} a year).`
          : `That works back to about ${formatRandWhole(basics.grossMonthly)} gross a month.`,
    };
  });

  protected readonly earliestAge = computed(
    () => this.plan.rules()?.ra.earliestRetirementAge ?? FALLBACK_EARLIEST_AGE,
  );
  protected readonly retireAgeHint = computed(
    () => `An RA pays out from age ${this.earliestAge()} at the earliest.`,
  );
  protected readonly tfsaHint = computed(() => {
    const rules = this.plan.rules();
    return rules
      ? `You can put in ${formatRandWhole(rules.journey.annualLimit)} a year and ${formatRandWhole(rules.journey.lifetimeLimit)} in your lifetime. Anything above that is taxed.`
      : '';
  });

  protected readonly riskOptions = computed<readonly ChoiceOption<PlanAnswers['risk']>[]>(() => {
    const assumptions = this.plan.assumptions();
    return RISK_LEVELS.map((level) => ({
      value: level.id,
      label: level.label,
      description: `CPI plus ${level.premiumPp} percentage points (${AMOUNT_TEXT.format(riskReturnPercent(level.id, assumptions))}% a year)`,
    }));
  });

  protected readonly surplusValue = computed(
    () => this.answers().surplusMonthly ?? this.plan.basics()?.suggestedSurplus ?? 0,
  );
  protected readonly surplusHint = computed(() => {
    const basics = this.plan.basics();
    const suggestion = basics
      ? `We suggest ${formatRandWhole(basics.suggestedSurplus)}, which is 20% of your take-home pay. `
      : '';
    return `${suggestion}Enter 0 if nothing is left over.`;
  });

  constructor() {
    // Arriving from the summary by a user-driven move (Change, Back, Start again) focuses the
    // heading. A first visit has no request, so focus stays where it was.
    afterNextRender(() => {
      if (this.plan.takeHeadingFocus()) this.heading().nativeElement.focus();
    });
  }

  protected setAge(age: number): void {
    this.plan.update({ age });
  }

  protected setIncomeAmount(amount: number): void {
    this.plan.update({ income: { ...this.answers().income, amount } });
  }

  protected setGoal(goal: PlanGoal | null): void {
    if (goal !== null) this.plan.update({ goal });
  }

  protected setRisk(risk: PlanAnswers['risk']): void {
    this.plan.update({ risk });
  }

  protected setNumber(field: NumberAnswer, value: number): void {
    this.plan.update({ [field]: value });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (!this.plan.next()) {
      this.attempted.set(true);
      return;
    }
    this.moveFocus();
  }

  protected onBack(): void {
    this.plan.back();
    this.moveFocus();
  }

  protected onSkip(): void {
    this.plan.finish();
    this.moveFocus();
  }

  // After a move the person made, put focus on the heading. When the move leaves the wizard
  // (the summary takes over), ask the summary to do it instead; this component is about to go.
  private moveFocus(): void {
    if (this.plan.onSummary()) {
      this.plan.requestHeadingFocus();
      return;
    }
    afterNextRender(() => this.heading().nativeElement.focus(), { injector: this.injector });
  }
}
