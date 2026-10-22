import type { Assumptions } from '../data/assumptions';
import type { RaHandoffValues } from '../plan/plan-profile';
import { SALARY_LIMITS } from '../salary/salary-inputs';

/** The RA choices that are not part of a Salary handoff. */
export interface RaPlanFields {
  /** The EXTRA RA contribution being explored, rands a month. */
  readonly contributionMonthly: number;
  /** Yearly rise in the contribution, as a percent (5 means 5%). */
  readonly escalationPercent: number;
  /** Rands already in the RA, treated as the vested pot. */
  readonly startingBalance: number;
  /** Effective yearly return, as a percent. */
  readonly returnPercent: number;
  /** Effective yearly inflation, as a percent. */
  readonly inflationPercent: number;
  readonly retirementAge: number;
}

/** Everything the RA calculator works from: the Salary figures plus the RA choices. */
export type RaInputs = RaHandoffValues & RaPlanFields;

export const RA_LIMITS = {
  age: SALARY_LIMITS.age,
  medicalMembers: SALARY_LIMITS.medicalMembers,
  // Why 40: the field has to reach below the earliest payout age (55) so the "too early" warning
  // can show. The 80 maximum is a product cap and matches the engine's MAX_RA_RETIREMENT_AGE.
  retirementAge: { min: 40, max: 80 },
  escalationPercent: { min: 0, max: 20 },
  returnPercent: { min: 0, max: 20 },
  inflationPercent: { min: 0, max: 15 },
} as const;

/** The example the RA page starts from: R2 000 extra a month, rising 5% a year, retiring at 55. */
export const RA_PLAN_EXAMPLE = {
  contributionMonthly: 2_000,
  escalationPercent: 5,
  startingBalance: 0,
  retirementAge: 55,
} as const;

interface Limits {
  readonly min: number;
  readonly max: number;
}

/** Return and inflation come from the published-rate assumptions; both are 0 when rates are unavailable. */
export function raPlanDefaults(assumptions: Assumptions | null): RaPlanFields {
  return {
    ...RA_PLAN_EXAMPLE,
    returnPercent: assumptions
      ? percentOr(assumptions.growthReturn.valuePercent, 0, RA_LIMITS.returnPercent)
      : 0,
    inflationPercent: assumptions
      ? percentOr(assumptions.inflation.valuePercent, 0, RA_LIMITS.inflationPercent)
      : 0,
  };
}

/**
 * Applies `patch` to `current` the way `sanitiseSalaryInputs` does: amounts must be finite and 0
 * or more (an invalid one keeps its current value and is never capped), the retirement age is
 * rounded and clamped, percents are clamped to their limits and not rounded.
 */
export function sanitiseRaPlan(patch: Partial<RaPlanFields>, current: RaPlanFields): RaPlanFields {
  return {
    contributionMonthly: amountOr(patch.contributionMonthly, current.contributionMonthly),
    escalationPercent: percentOr(
      patch.escalationPercent,
      current.escalationPercent,
      RA_LIMITS.escalationPercent,
    ),
    startingBalance: amountOr(patch.startingBalance, current.startingBalance),
    returnPercent: percentOr(patch.returnPercent, current.returnPercent, RA_LIMITS.returnPercent),
    inflationPercent: percentOr(
      patch.inflationPercent,
      current.inflationPercent,
      RA_LIMITS.inflationPercent,
    ),
    retirementAge: wholeOr(patch.retirementAge, current.retirementAge, RA_LIMITS.retirementAge),
  };
}

/** The Salary side of the RA inputs, sanitised like the Salary inputs themselves. */
export function sanitiseRaProfile(
  patch: Partial<RaHandoffValues>,
  current: RaHandoffValues,
): RaHandoffValues {
  return {
    grossMonthly: amountOr(patch.grossMonthly, current.grossMonthly),
    age: wholeOr(patch.age, current.age, RA_LIMITS.age),
    medicalMembers: wholeOr(patch.medicalMembers, current.medicalMembers, RA_LIMITS.medicalMembers),
    employeeRetirementMonthly: amountOr(
      patch.employeeRetirementMonthly,
      current.employeeRetirementMonthly,
    ),
    employerRetirementMonthly: amountOr(
      patch.employerRetirementMonthly,
      current.employerRetirementMonthly,
    ),
  };
}

function amountOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function percentOr(value: number | undefined, fallback: number, limits: Limits): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(limits.max, Math.max(limits.min, value));
}

function wholeOr(value: number | undefined, fallback: number, limits: Limits): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(limits.max, Math.max(limits.min, Math.round(value)));
}
