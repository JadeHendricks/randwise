import type { PayPeriod } from '../engine';

/** Is `amount` the gross salary (before tax) or the take-home (net) pay? */
export type AmountBasis = 'gross' | 'net';

/**
 * The Salary situation shared by the Pay page and the dashboard.
 *
 * `medicalMembers` is passed unchanged to the engine as `PayslipInput.medicalMembers`: the main
 * member plus dependants. 0 is no medical aid, 1 is the main member only, 2 adds the first
 * dependant, and each member from 3 up adds one additional dependant.
 *
 * Later hand-off tasks extend this via `SalaryInputsStore.update`.
 */
export interface SalaryInputs {
  /** Is `amount` the gross or the take-home? */
  readonly basis: AmountBasis;
  readonly period: PayPeriod;
  /** Rands for `period`; finite and 0 or more. */
  readonly amount: number;
  /** Age on the last day of the tax year, a whole number from 18 to 100. */
  readonly age: number;
  /** Main member plus dependants, a whole number from 0 to 10. */
  readonly medicalMembers: number;
  readonly employeeRetirementMonthly: number;
  readonly employerRetirementMonthly: number;
  readonly otherDeductionsMonthly: number;
}

/** An illustrative starting point: R30 000 gross a month, age 35, nothing else. */
export const DEFAULT_SALARY_INPUTS: SalaryInputs = {
  basis: 'gross',
  period: 'monthly',
  amount: 30_000,
  age: 35,
  medicalMembers: 0,
  employeeRetirementMonthly: 0,
  employerRetirementMonthly: 0,
  otherDeductionsMonthly: 0,
};

export const SALARY_LIMITS = {
  age: { min: 18, max: 100 },
  medicalMembers: { min: 0, max: 10 },
} as const;

const BASES: readonly AmountBasis[] = ['gross', 'net'];
const PERIODS: readonly PayPeriod[] = ['monthly', 'annual'];

/**
 * Applies `patch` to `current` and returns inputs the engine can always accept.
 * Age and members are rounded to whole numbers and clamped to SALARY_LIMITS. Amounts must be finite
 * and 0 or more; an invalid patched field is ignored and keeps its current value, so the engine
 * never receives NaN. Amounts are deliberately NOT capped: a huge finite amount passes through so
 * the "too high to work back" path stays reachable. Unknown basis or period values are ignored too.
 */
export function sanitiseSalaryInputs(
  patch: Partial<SalaryInputs>,
  current: SalaryInputs,
): SalaryInputs {
  return {
    basis: pickOf(BASES, patch.basis, current.basis),
    period: pickOf(PERIODS, patch.period, current.period),
    amount: amountOr(patch.amount, current.amount),
    age: wholeOr(patch.age, current.age, SALARY_LIMITS.age),
    medicalMembers: wholeOr(
      patch.medicalMembers,
      current.medicalMembers,
      SALARY_LIMITS.medicalMembers,
    ),
    employeeRetirementMonthly: amountOr(
      patch.employeeRetirementMonthly,
      current.employeeRetirementMonthly,
    ),
    employerRetirementMonthly: amountOr(
      patch.employerRetirementMonthly,
      current.employerRetirementMonthly,
    ),
    otherDeductionsMonthly: amountOr(patch.otherDeductionsMonthly, current.otherDeductionsMonthly),
  };
}

function pickOf<T>(allowed: readonly T[], value: T | undefined, fallback: T): T {
  return value !== undefined && allowed.includes(value) ? value : fallback;
}

function amountOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function wholeOr(
  value: number | undefined,
  fallback: number,
  limits: { readonly min: number; readonly max: number },
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(limits.max, Math.max(limits.min, Math.round(value)));
}
