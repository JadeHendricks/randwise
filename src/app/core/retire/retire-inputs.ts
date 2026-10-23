import type { Assumptions } from '../data/assumptions';
import { MAX_RA_RETIREMENT_AGE } from '../engine';
import type { RaHandoffValues } from '../plan/plan-profile';
import { amountOr, percentOr, wholeOr } from '../ra/ra-inputs';
import { SALARY_LIMITS } from '../salary/salary-inputs';

/** The Retire at 55 choices that are not part of a Salary handoff. */
export interface RetirePlanFields {
  /** The take-home income wanted in retirement, rands a month in today's money. */
  readonly goalNetMonthly: number;
  readonly retirementAge: number;
  /** Effective yearly inflation, as a percent (4.5 means 4.5%). */
  readonly inflationPercent: number;
  /** Effective yearly return before retirement, as a percent. */
  readonly returnPercent: number;
  /** Effective yearly return once retired, as a percent. */
  readonly retirementReturnPercent: number;
  /** Share of the balance drawn in the first retirement year, as a percent. */
  readonly drawdownPercent: number;
  /** Whether one third of the RA is taken as a cash lump sum at retirement. */
  readonly takeLumpSum: boolean;
  /** Rands already in the RA. */
  readonly startingBalance: number;
  /** The RA contribution being made now, rands a month. */
  readonly contributionMonthly: number;
  /** Yearly rise in the contribution, as a percent. */
  readonly escalationPercent: number;
}

/** Everything the Retire page works from: the Salary figures plus the retirement choices. */
export type RetireInputs = RaHandoffValues & RetirePlanFields;

export const RETIRE_LIMITS = {
  age: SALARY_LIMITS.age,
  medicalMembers: SALARY_LIMITS.medicalMembers,
  // Why 40: the field has to reach below the earliest payout age (55) so the "too early" message
  // can show. The maximum is the engine's product cap (same as the RA page).
  retirementAge: { min: 40, max: MAX_RA_RETIREMENT_AGE },
  inflationPercent: { min: 0, max: 15 },
  returnPercent: { min: 0, max: 20 },
  retirementReturnPercent: { min: 0, max: 20 },
  // Why 1..20: wider than the legal 2,5% to 17,5% so a value outside the law can be typed and
  // explained by the engine check instead of being silently clamped.
  drawdownPercent: { min: 1, max: 20 },
  escalationPercent: { min: 0, max: 20 },
} as const;

/** The example the Retire page starts from: R50 000 a month at 55, R2 000 a month saved today. */
export const RETIRE_PLAN_EXAMPLE = {
  goalNetMonthly: 50_000,
  retirementAge: 55,
  drawdownPercent: 5,
  takeLumpSum: false,
  startingBalance: 0,
  contributionMonthly: 2_000,
  escalationPercent: 5,
} as const;

/** Percentage points added to CPI for the return while retired: a more cautious mix. */
export const RETIREMENT_PREMIUM_PP = 3;

/** Avoids float noise such as 4.5 + 3 = 7.500000000000001. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The default return in retirement: CPI plus 3 percentage points. It lives here, not in
 * `assumptions.ts`, so the shared assumptions panel stays as it is. Null without rates.
 */
export function retirementReturnAssumption(
  assumptions: Assumptions | null,
): { readonly valuePercent: number; readonly description: string } | null {
  if (!assumptions) return null;
  const valuePercent = round2(assumptions.inflation.valuePercent + RETIREMENT_PREMIUM_PP);
  return {
    valuePercent,
    description: `Assumption: in retirement your money earns CPI plus ${RETIREMENT_PREMIUM_PP} percentage points (${valuePercent}%), a more cautious mix than before retirement.`,
  };
}

/** Inflation and returns come from the published-rate assumptions; all are 0 without rates. */
export function retirePlanDefaults(assumptions: Assumptions | null): RetirePlanFields {
  const retirement = retirementReturnAssumption(assumptions);
  return {
    ...RETIRE_PLAN_EXAMPLE,
    inflationPercent: assumptions
      ? percentOr(assumptions.inflation.valuePercent, 0, RETIRE_LIMITS.inflationPercent)
      : 0,
    returnPercent: assumptions
      ? percentOr(assumptions.growthReturn.valuePercent, 0, RETIRE_LIMITS.returnPercent)
      : 0,
    retirementReturnPercent: retirement
      ? percentOr(retirement.valuePercent, 0, RETIRE_LIMITS.retirementReturnPercent)
      : 0,
  };
}

/**
 * Applies `patch` to `current` the way `sanitiseRaPlan` does: amounts must be finite and 0 or
 * more (an invalid one keeps its current value and is never capped), the retirement age is rounded
 * and clamped, percents are clamped to their limits and not rounded. The lump-sum choice must be
 * a boolean; anything else keeps the current choice.
 */
export function sanitiseRetirePlan(
  patch: Partial<RetirePlanFields>,
  current: RetirePlanFields,
): RetirePlanFields {
  return {
    goalNetMonthly: amountOr(patch.goalNetMonthly, current.goalNetMonthly),
    retirementAge: wholeOr(patch.retirementAge, current.retirementAge, RETIRE_LIMITS.retirementAge),
    inflationPercent: percentOr(
      patch.inflationPercent,
      current.inflationPercent,
      RETIRE_LIMITS.inflationPercent,
    ),
    returnPercent: percentOr(
      patch.returnPercent,
      current.returnPercent,
      RETIRE_LIMITS.returnPercent,
    ),
    retirementReturnPercent: percentOr(
      patch.retirementReturnPercent,
      current.retirementReturnPercent,
      RETIRE_LIMITS.retirementReturnPercent,
    ),
    drawdownPercent: percentOr(
      patch.drawdownPercent,
      current.drawdownPercent,
      RETIRE_LIMITS.drawdownPercent,
    ),
    takeLumpSum:
      typeof patch.takeLumpSum === 'boolean' ? patch.takeLumpSum : current.takeLumpSum,
    startingBalance: amountOr(patch.startingBalance, current.startingBalance),
    contributionMonthly: amountOr(patch.contributionMonthly, current.contributionMonthly),
    escalationPercent: percentOr(
      patch.escalationPercent,
      current.escalationPercent,
      RETIRE_LIMITS.escalationPercent,
    ),
  };
}
