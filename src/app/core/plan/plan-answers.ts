import { BUDGET_LIMITS } from '../budget/budget-inputs';
import type { Assumptions } from '../data/assumptions';
import type { PayPeriod } from '../engine';
import { amountOr, wholeOr } from '../ra/ra-inputs';
import { RETIRE_LIMITS, RETIREMENT_PREMIUM_PP } from '../retire/retire-inputs';
import { type AmountBasis, SALARY_LIMITS } from '../salary/salary-inputs';

/**
 * What the Plan Builder asks and how the answers become numbers. Pure TypeScript (lint enforced):
 * the wizard store holds the answers, this file only knows how to clean them and what to ask next.
 */

export type PlanGoal =
  | 'retire-early'
  | 'pay-less-tax'
  | 'build-tfsa'
  | 'emergency-fund'
  | 'buy-home';
export type PlanRisk = 'cautious' | 'balanced' | 'adventurous';

export interface PlanIncome {
  readonly basis: AmountBasis;
  readonly period: PayPeriod;
  /** Rands for `period`; finite and 0 or more. */
  readonly amount: number;
}

export interface PlanAnswers {
  /** 18..100 (`SALARY_LIMITS.age`). */
  readonly age: number;
  readonly income: PlanIncome;
  readonly goal: PlanGoal | null;
  readonly risk: PlanRisk;
  /** Rands a month that can be invested. Null means use the suggestion (20% of take-home). */
  readonly surplusMonthly: number | null;
  readonly raBalance: number;
  readonly tfsaBalance: number;
  readonly emergencySaved: number;
  /** 40..80 (`RETIRE_LIMITS.retirementAge`). */
  readonly retireAge: number;
  /** Take-home wanted in retirement, rands a month in today's money. */
  readonly retireIncomeMonthly: number;
  readonly tfsaTarget: number;
  readonly tfsaMonthly: number;
  /** 1..12 (`BUDGET_LIMITS.emergencyMonths`). */
  readonly emergencyMonths: number;
}

/** The Salary example (R30 000 gross a month, age 35), no goal yet and a balanced risk. */
export const DEFAULT_PLAN_ANSWERS: PlanAnswers = {
  age: 35,
  income: { basis: 'gross', period: 'monthly', amount: 30_000 },
  goal: null,
  risk: 'balanced',
  surplusMonthly: null,
  raBalance: 0,
  tfsaBalance: 0,
  emergencySaved: 0,
  retireAge: 55,
  retireIncomeMonthly: 50_000,
  tfsaTarget: 100_000,
  tfsaMonthly: 1_000,
  emergencyMonths: 3,
};

const GOALS: readonly PlanGoal[] = [
  'retire-early',
  'pay-less-tax',
  'build-tfsa',
  'emergency-fund',
  'buy-home',
];
const RISKS: readonly PlanRisk[] = ['cautious', 'balanced', 'adventurous'];
const BASES: readonly AmountBasis[] = ['gross', 'net'];
const PERIODS: readonly PayPeriod[] = ['monthly', 'annual'];

function pickOf<T>(allowed: readonly T[], value: T | undefined | null, fallback: T): T {
  return value !== undefined && value !== null && allowed.includes(value) ? value : fallback;
}

/** Null stays null (use the suggestion); otherwise a finite amount of 0 or more, else the current value. */
function surplusOr(value: number | null | undefined, fallback: number | null): number | null {
  if (value === null) return null;
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * Applies `patch` to `current` like `sanitiseRaPlan` does: amounts must be finite and 0 or more
 * (an invalid one keeps its current value), whole-number fields are rounded and clamped, and the
 * goal, risk, basis and period must be known values. `surplusMonthly` also accepts null.
 */
export function sanitisePlanAnswers(
  patch: Partial<PlanAnswers>,
  current: PlanAnswers,
): PlanAnswers {
  return {
    age: wholeOr(patch.age, current.age, SALARY_LIMITS.age),
    income: {
      basis: pickOf(BASES, patch.income?.basis, current.income.basis),
      period: pickOf(PERIODS, patch.income?.period, current.income.period),
      amount: amountOr(patch.income?.amount, current.income.amount),
    },
    goal: pickOf<PlanGoal | null>(GOALS, patch.goal, current.goal),
    risk: pickOf(RISKS, patch.risk, current.risk),
    surplusMonthly: surplusOr(patch.surplusMonthly, current.surplusMonthly),
    raBalance: amountOr(patch.raBalance, current.raBalance),
    tfsaBalance: amountOr(patch.tfsaBalance, current.tfsaBalance),
    emergencySaved: amountOr(patch.emergencySaved, current.emergencySaved),
    retireAge: wholeOr(patch.retireAge, current.retireAge, RETIRE_LIMITS.retirementAge),
    retireIncomeMonthly: amountOr(patch.retireIncomeMonthly, current.retireIncomeMonthly),
    tfsaTarget: amountOr(patch.tfsaTarget, current.tfsaTarget),
    tfsaMonthly: amountOr(patch.tfsaMonthly, current.tfsaMonthly),
    emergencyMonths: wholeOr(
      patch.emergencyMonths,
      current.emergencyMonths,
      BUDGET_LIMITS.emergencyMonths,
    ),
  };
}

/** How much growth a risk comfort assumes, in percentage points over CPI. */
export const RISK_LEVELS: readonly {
  readonly id: PlanRisk;
  readonly label: string;
  readonly premiumPp: number;
}[] = [
  { id: 'cautious', label: 'Cautious', premiumPp: 2 },
  { id: 'balanced', label: 'Balanced', premiumPp: 5 },
  { id: 'adventurous', label: 'Adventurous', premiumPp: 7 },
];

/** Avoids float noise such as 4.5 + 5 = 9.500000000000002. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/** CPI as a percent, or 0 when the published rates are not available (like the rest of the app). */
function cpiPercent(assumptions: Assumptions | null): number {
  return assumptions ? assumptions.inflation.valuePercent : 0;
}

/** The yearly return before retirement for a risk comfort: CPI plus its premium. */
export function riskReturnPercent(risk: PlanRisk, assumptions: Assumptions | null): number {
  const level = RISK_LEVELS.find((candidate) => candidate.id === risk) ?? RISK_LEVELS[1];
  return round2(cpiPercent(assumptions) + level.premiumPp);
}

/**
 * The yearly return once retired: never above the return before retirement, so a cautious saver
 * is not assumed to earn less before retirement than after it. Balanced gives the Retire page's
 * own default (CPI plus 3).
 */
export function retirementReturnPercent(risk: PlanRisk, assumptions: Assumptions | null): number {
  return Math.min(
    riskReturnPercent(risk, assumptions),
    round2(cpiPercent(assumptions) + RETIREMENT_PREMIUM_PP),
  );
}

export type PlanQuestionId =
  | 'age'
  | 'income'
  | 'goal'
  | 'retire-details'
  | 'tfsa-details'
  | 'emergency-details'
  | 'risk'
  | 'money';

/** The longest question list any goal produces. The progress total shows this before a goal is chosen. */
export const MAX_PLAN_QUESTIONS = 6;

const DETAILS_BY_GOAL: Partial<Record<PlanGoal, PlanQuestionId>> = {
  'retire-early': 'retire-details',
  'build-tfsa': 'tfsa-details',
  'emergency-fund': 'emergency-details',
};
const RISK_GOALS: readonly PlanGoal[] = ['retire-early', 'pay-less-tax', 'build-tfsa'];

/**
 * The questions to ask, in order. The first three are always asked; after the goal is chosen the
 * list adapts: the goal's own details, a risk question where growth matters, and the money
 * question for every goal except buying a home.
 */
export function planQuestions(answers: PlanAnswers): readonly PlanQuestionId[] {
  const { goal } = answers;
  if (goal === null) return ['age', 'income', 'goal'];
  const questions: PlanQuestionId[] = ['age', 'income', 'goal'];
  const details = DETAILS_BY_GOAL[goal];
  if (details) questions.push(details);
  if (RISK_GOALS.includes(goal)) questions.push('risk');
  if (goal !== 'buy-home') questions.push('money');
  return questions;
}

/**
 * A plain-English reason the question cannot be left yet, or null when it can.
 * Why `earliestRetirementAge` is a parameter: it comes from the tax-year file, which this module
 * does not read.
 */
export function questionProblem(
  id: PlanQuestionId,
  answers: PlanAnswers,
  earliestRetirementAge: number,
): string | null {
  switch (id) {
    case 'income':
      return answers.income.amount > 0 ? null : 'Enter your income to continue.';
    case 'goal':
      return answers.goal === null ? 'Choose a goal to continue.' : null;
    case 'retire-details':
      if (answers.retireAge <= answers.age) {
        return `Choose a retirement age after ${answers.age}.`;
      }
      if (answers.retireAge < earliestRetirementAge) {
        return `An RA pays out from age ${earliestRetirementAge} at the earliest.`;
      }
      return answers.retireIncomeMonthly > 0 ? null : 'Enter the monthly income you want.';
    case 'tfsa-details':
      return answers.tfsaTarget > 0 && answers.tfsaMonthly > 0
        ? null
        : 'Enter a target and a monthly amount.';
    default:
      return null;
  }
}
