import type { Assumptions } from '../data/assumptions';
import { MAX_RA_RETIREMENT_AGE, type RefundMode } from '../engine';
import type { RaHandoffValues } from '../plan/plan-profile';
import { amountOr, percentOr, wholeOr } from '../ra/ra-inputs';
import { SALARY_LIMITS } from '../salary/salary-inputs';

/** The Journey choices that are not part of a Salary handoff. */
export interface JourneyPlanFields {
  readonly retirementAge: number;
  /** Yearly rise in income and payroll retirement contributions, as a percent (5 means 5%). */
  readonly incomeEscalationPercent: number;
  /** The EXTRA RA contribution in year 1, rands a month. */
  readonly contributionMonthly: number;
  /** Yearly rise in the RA contribution, as a percent. */
  readonly escalationPercent: number;
  /** Rands already in the RA. */
  readonly startingBalance: number;
  /** Rands already in the TFSA. */
  readonly tfsaBalance: number;
  /** TFSA contributions already made (growth excluded); the lifetime limit counts these. */
  readonly tfsaLifetimeUsed: number;
  /** Flat TFSA top-up from take-home pay, rands a month. */
  readonly tfsaTopUpMonthly: number;
  /** Effective yearly return on the RA, as a percent. */
  readonly returnPercent: number;
  /** Effective yearly return on the TFSA, as a percent. */
  readonly tfsaReturnPercent: number;
  readonly inflationPercent: number;
  /** Whether the tax saving arrives as a refund after filing or as lower PAYE each month. */
  readonly refundMode: RefundMode;
  /** Whether money above a TFSA limit is invested anyway (and taxed 40%). */
  readonly allowOverContribution: boolean;
}

/** Everything the Journey page works from: the Salary figures plus the journey choices. */
export type JourneyInputs = RaHandoffValues & JourneyPlanFields;

export const JOURNEY_LIMITS = {
  age: SALARY_LIMITS.age,
  medicalMembers: SALARY_LIMITS.medicalMembers,
  // Why 40: the field has to reach below the earliest payout age (55) so the "too early" warning
  // can show. The maximum is the engine's product cap.
  retirementAge: { min: 40, max: MAX_RA_RETIREMENT_AGE },
  incomeEscalationPercent: { min: 0, max: 20 },
  escalationPercent: { min: 0, max: 20 },
  returnPercent: { min: 0, max: 20 },
  tfsaReturnPercent: { min: 0, max: 20 },
  inflationPercent: { min: 0, max: 15 },
} as const;

/** The example the Journey starts from: R2 000 to the RA and R1 000 to the TFSA a month, to 55. */
export const JOURNEY_PLAN_EXAMPLE = {
  retirementAge: 55,
  contributionMonthly: 2_000,
  escalationPercent: 5,
  startingBalance: 0,
  tfsaBalance: 0,
  tfsaLifetimeUsed: 0,
  tfsaTopUpMonthly: 1_000,
  refundMode: 'refund',
  allowOverContribution: false,
} as const;

/**
 * Inflation and income escalation follow CPI, and both returns follow the growth assumption
 * (CPI + 5 percentage points). All are 0 without rates.
 */
export function journeyPlanDefaults(assumptions: Assumptions | null): JourneyPlanFields {
  const cpi = assumptions
    ? percentOr(assumptions.inflation.valuePercent, 0, JOURNEY_LIMITS.inflationPercent)
    : 0;
  const growth = assumptions
    ? percentOr(assumptions.growthReturn.valuePercent, 0, JOURNEY_LIMITS.returnPercent)
    : 0;
  return {
    ...JOURNEY_PLAN_EXAMPLE,
    inflationPercent: cpi,
    incomeEscalationPercent: percentOr(cpi, 0, JOURNEY_LIMITS.incomeEscalationPercent),
    returnPercent: growth,
    tfsaReturnPercent: growth,
  };
}

const isRefundMode = (value: unknown): value is RefundMode =>
  value === 'refund' || value === 'paye';

/**
 * Applies `patch` to `current` the way `sanitiseRetirePlan` does: amounts must be finite and 0 or
 * more (an invalid one keeps its current value and is never capped), the retirement age is
 * rounded and clamped, percents are clamped and not rounded. The tax-saving mode must be one of
 * the two known modes and the over-contribution choice a boolean; anything else keeps the
 * current value.
 */
export function sanitiseJourneyPlan(
  patch: Partial<JourneyPlanFields>,
  current: JourneyPlanFields,
): JourneyPlanFields {
  return {
    retirementAge: wholeOr(
      patch.retirementAge,
      current.retirementAge,
      JOURNEY_LIMITS.retirementAge,
    ),
    incomeEscalationPercent: percentOr(
      patch.incomeEscalationPercent,
      current.incomeEscalationPercent,
      JOURNEY_LIMITS.incomeEscalationPercent,
    ),
    contributionMonthly: amountOr(patch.contributionMonthly, current.contributionMonthly),
    escalationPercent: percentOr(
      patch.escalationPercent,
      current.escalationPercent,
      JOURNEY_LIMITS.escalationPercent,
    ),
    startingBalance: amountOr(patch.startingBalance, current.startingBalance),
    tfsaBalance: amountOr(patch.tfsaBalance, current.tfsaBalance),
    tfsaLifetimeUsed: amountOr(patch.tfsaLifetimeUsed, current.tfsaLifetimeUsed),
    tfsaTopUpMonthly: amountOr(patch.tfsaTopUpMonthly, current.tfsaTopUpMonthly),
    returnPercent: percentOr(
      patch.returnPercent,
      current.returnPercent,
      JOURNEY_LIMITS.returnPercent,
    ),
    tfsaReturnPercent: percentOr(
      patch.tfsaReturnPercent,
      current.tfsaReturnPercent,
      JOURNEY_LIMITS.tfsaReturnPercent,
    ),
    inflationPercent: percentOr(
      patch.inflationPercent,
      current.inflationPercent,
      JOURNEY_LIMITS.inflationPercent,
    ),
    refundMode: isRefundMode(patch.refundMode) ? patch.refundMode : current.refundMode,
    allowOverContribution:
      typeof patch.allowOverContribution === 'boolean'
        ? patch.allowOverContribution
        : current.allowOverContribution,
  };
}
