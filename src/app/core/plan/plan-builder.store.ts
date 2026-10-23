import { Injectable, computed, inject, signal } from '@angular/core';

import { switchIncomeBasis, switchIncomePeriod } from '../budget/budget-slice';
import { RatesService } from '../data/rates.service';
import { TaxYearService } from '../data/tax-year.service';
import type { PayPeriod } from '../engine';
import { estimateSalary } from '../salary/estimate-salary';
import { SalaryEstimator } from '../salary/salary-estimator';
import { type AmountBasis, DEFAULT_SALARY_INPUTS, type SalaryInputs } from '../salary/salary-inputs';
import { SalaryInputsStore } from '../salary/salary-inputs.store';
import { SEND_TARGETS, type SendTargetId } from './handoff';
import {
  DEFAULT_PLAN_ANSWERS,
  MAX_PLAN_QUESTIONS,
  type PlanAnswers,
  type PlanQuestionId,
  planQuestions,
  questionProblem,
  sanitisePlanAnswers,
} from './plan-answers';
import {
  type PlanStep,
  buildPlan,
  planAssumptionNotes,
  planBasics,
  planRules,
} from './plan-builder';
import { PlanContextStore } from './plan-context.store';

// Used until the tax-year file says otherwise, or when there is no tax data.
const FALLBACK_EARLIEST_RETIREMENT_AGE = 55;

/**
 * The Plan Builder's state: the answers, where the wizard is, and the plan built from them.
 * It is a root service, not part of PlanContextStore, so the answers survive a trip to a
 * calculator and back. Held in memory only: nothing is written to storage.
 */
@Injectable({ providedIn: 'root' })
export class PlanBuilderStore {
  private readonly context = inject(PlanContextStore);
  private readonly salary = inject(SalaryInputsStore);
  private readonly estimator = inject(SalaryEstimator);
  private readonly taxYears = inject(TaxYearService);
  private readonly rates = inject(RatesService);

  private readonly answersState = signal<PlanAnswers>(DEFAULT_PLAN_ANSWERS);
  private readonly positionState = signal(0);
  private readonly startedState = signal(false);
  private readonly reachedSummaryState = signal(false);

  readonly answers = this.answersState.asReadonly();
  /** Index into `questions()`. A value past the last question means the summary. */
  readonly position = this.positionState.asReadonly();
  /** True once any answer has been given or the person has moved on. */
  readonly started = this.startedState.asReadonly();
  /** True once the person has seen the summary, so the wizard can offer "Skip to my plan". */
  readonly reachedSummary = this.reachedSummaryState.asReadonly();

  /** RA, retirement and TFSA rules from the tax-year file; null without tax data. */
  readonly rules = computed(() => {
    const data = this.taxYears.taxYear();
    return data ? planRules(data) : null;
  });
  readonly assumptions = this.rates.assumptions;

  /** Take-home, gross and the savings suggestion for the income answered; null if they cannot be worked out. */
  readonly basics = computed(() => {
    const tables = this.estimator.tables();
    return tables ? planBasics(this.answersState(), tables) : null;
  });

  /** The ordered plan. Empty without tax data, without a goal, or when the income fails. */
  readonly steps = computed<readonly PlanStep[]>(() => {
    const tables = this.estimator.tables();
    const rules = this.rules();
    if (!tables || !rules) return [];
    return buildPlan(this.answersState(), tables, rules, this.assumptions());
  });

  readonly assumptionNotes = computed(() =>
    planAssumptionNotes(this.answersState(), this.basics(), this.assumptions()),
  );

  readonly questions = computed(() => planQuestions(this.answersState()));
  /** The exact count once a goal is chosen; the longest list until then. */
  readonly progressTotal = computed(() =>
    this.answersState().goal ? this.questions().length : MAX_PLAN_QUESTIONS,
  );
  /** The question on screen. On the summary it stays on the last question. */
  readonly currentQuestion = computed<PlanQuestionId>(() => {
    const questions = this.questions();
    return questions[Math.min(this.positionState(), questions.length - 1)];
  });
  readonly onSummary = computed(
    () => this.answersState().goal !== null && this.positionState() >= this.questions().length,
  );
  /** Why the current question cannot be left yet, or null. */
  readonly problem = computed(() =>
    questionProblem(
      this.currentQuestion(),
      this.answersState(),
      this.rules()?.ra.earliestRetirementAge ?? FALLBACK_EARLIEST_RETIREMENT_AGE,
    ),
  );

  // The income as the Salary inputs the shared helpers expect, and its estimate. Switching basis
  // or period uses them so the amount keeps describing the same person, as Pay and Budget do.
  private readonly incomeInputs = computed<SalaryInputs>(() => {
    const { age, income } = this.answersState();
    return { ...DEFAULT_SALARY_INPUTS, age, ...income };
  });
  private readonly incomeEstimate = computed(() => {
    const tables = this.estimator.tables();
    return tables ? estimateSalary(this.incomeInputs(), tables) : null;
  });

  // Set by a user-driven move that swaps the wizard and the summary. The component that appears
  // takes it and focuses its heading. A plain flag, not a signal: nothing renders from it, and a
  // component created without a request (first visit, coming back from a calculator) must not
  // steal focus.
  private headingFocusPending = false;

  requestHeadingFocus(): void {
    this.headingFocusPending = true;
  }

  /** True once, after `requestHeadingFocus`. */
  takeHeadingFocus(): boolean {
    const pending = this.headingFocusPending;
    this.headingFocusPending = false;
    return pending;
  }

  /** Merges a patch into the answers after sanitising it. */
  update(patch: Partial<PlanAnswers>): void {
    this.answersState.update((current) => sanitisePlanAnswers(patch, current));
    this.startedState.set(true);
  }

  setIncomeBasis(basis: AmountBasis): void {
    const income = this.answersState().income;
    const change = switchIncomeBasis(this.incomeInputs(), this.incomeEstimate(), basis);
    this.update({ income: { ...income, basis, amount: change.amount ?? income.amount } });
  }

  setIncomePeriod(period: PayPeriod): void {
    const income = this.answersState().income;
    const change = switchIncomePeriod(this.incomeInputs(), period);
    this.update({ income: { ...income, period, amount: change.amount ?? income.amount } });
  }

  /** Moves to the next question (or the summary after the last). False, with no move, when it cannot be left yet. */
  next(): boolean {
    if (this.onSummary() || this.problem() !== null) return false;
    const position = this.positionState() + 1;
    this.positionState.set(position);
    this.startedState.set(true);
    if (position >= this.questions().length) this.reachedSummaryState.set(true);
    return true;
  }

  /** One step back; from the summary this returns to the last question. */
  back(): void {
    this.positionState.update((position) => Math.max(0, position - 1));
  }

  /** Jumps to a question, for "Change" on the summary. Ignored when that question is not asked. */
  goTo(id: PlanQuestionId): void {
    const index = this.questions().indexOf(id);
    if (index >= 0) this.positionState.set(index);
  }

  /** "Skip to my plan": the first question that still needs an answer, otherwise the summary. */
  finish(): void {
    const answers = this.answersState();
    const earliest = this.rules()?.ra.earliestRetirementAge ?? FALLBACK_EARLIEST_RETIREMENT_AGE;
    const questions = this.questions();
    const blocked = questions.findIndex((id) => questionProblem(id, answers, earliest) !== null);
    if (blocked >= 0) {
      this.positionState.set(blocked);
      return;
    }
    this.positionState.set(questions.length);
    this.reachedSummaryState.set(true);
  }

  restart(): void {
    // The sanitiser ignores a null goal, so a chosen goal can only be cleared by starting over.
    this.answersState.set(DEFAULT_PLAN_ANSWERS);
    this.positionState.set(0);
    this.startedState.set(false);
    this.reachedSummaryState.set(false);
  }

  /**
   * Sends a step's figures to its calculator and returns the route to open. Pay owns the Salary
   * inputs and has no "From" chip, so it is written to the Salary store; the other calculators
   * receive a handoff with the source `plan`.
   */
  open(step: PlanStep): string {
    const open = step.open;
    switch (open.calculator) {
      case 'pay':
        this.salary.update(open.salary);
        return '/pay';
      case 'ra':
        this.context.send('ra', 'plan', open.values);
        return routeOf('ra');
      case 'retire':
        this.context.send('retire', 'plan', open.values);
        return routeOf('retire');
      case 'budget':
        this.context.send('budget', 'plan', open.values);
        return routeOf('budget');
      case 'journey':
        this.context.send('journey', 'plan', open.values);
        return routeOf('journey');
    }
  }
}

function routeOf(id: SendTargetId): string {
  return SEND_TARGETS.find((target) => target.id === id)?.route ?? `/${id}`;
}
