import {
  type JourneyInput,
  type JourneyResult,
  type JourneyRules,
  type TaxTables,
  journey,
  roundRand,
} from '../engine';
import type { JourneyInputs } from './journey-inputs';

/** Things worth telling the user about, in plain words on the page. */
export type JourneyWarning =
  | 'penalty-exposure'
  | 'penalty-incurred'
  | 'headroom-clamp'
  | 'unallocated-refund'
  | 'below-earliest-age'
  | 'past-retirement-age';

export interface JourneyEstimateOk {
  readonly ok: true;
  /** Full precision, straight from the engine. Round with `roundRand` only for display. */
  readonly result: JourneyResult;
  readonly warnings: readonly JourneyWarning[];
}

export interface JourneyEstimateFailed {
  readonly ok: false;
  readonly message: string;
}

export type JourneyEstimate = JourneyEstimateOk | JourneyEstimateFailed;

const GENERIC_FAILURE_MESSAGE =
  'Those figures could not be worked out. Check the amounts and try again.';

/**
 * The journey for the page inputs. The inputs hold percents (5 means 5%); the engine takes
 * fractions, so they are divided by 100 here. Never throws for bad figures: a RangeError from the
 * engine becomes `{ ok: false, message }`, like `estimateRa`.
 */
export function estimateJourney(
  inputs: JourneyInputs,
  tables: TaxTables,
  rules: JourneyRules,
): JourneyEstimate {
  const input: JourneyInput = {
    salary: {
      grossMonthly: inputs.grossMonthly,
      age: inputs.age,
      medicalMembers: inputs.medicalMembers,
      employeeRetirementMonthly: inputs.employeeRetirementMonthly,
      employerRetirementMonthly: inputs.employerRetirementMonthly,
    },
    retirementAge: inputs.retirementAge,
    incomeEscalation: inputs.incomeEscalationPercent / 100,
    contributionMonthly: inputs.contributionMonthly,
    escalation: inputs.escalationPercent / 100,
    startingBalance: inputs.startingBalance,
    tfsaBalance: inputs.tfsaBalance,
    tfsaLifetimeUsed: inputs.tfsaLifetimeUsed,
    tfsaTopUpMonthly: inputs.tfsaTopUpMonthly,
    raReturn: inputs.returnPercent / 100,
    tfsaReturn: inputs.tfsaReturnPercent / 100,
    inflation: inputs.inflationPercent / 100,
    refundMode: inputs.refundMode,
    allowOverContribution: inputs.allowOverContribution,
  };

  let result: JourneyResult;
  try {
    result = journey(input, tables, rules);
  } catch (error) {
    // Why: the engine signals a figure it cannot work with with a RangeError. That is the user's
    // input, so it gets a plain sentence; anything else is a bug and must not be hidden.
    if (error instanceof RangeError) return { ok: false, message: GENERIC_FAILURE_MESSAGE };
    throw error;
  }
  return { ok: true, result, warnings: warningsOf(result) };
}

function warningsOf({ totals, ages }: JourneyResult): JourneyWarning[] {
  const warnings: JourneyWarning[] = [];
  // Rounded to cents so float dust never raises a warning about "R 0,00".
  const penalty = roundRand(totals.penalty) > 0;
  if (penalty && totals.penaltyIncurred) warnings.push('penalty-incurred');
  if (penalty && !totals.penaltyIncurred) warnings.push('penalty-exposure');
  if (roundRand(totals.raNonDeductible) > 0) warnings.push('headroom-clamp');
  if (roundRand(totals.unallocatedRefund) > 0) warnings.push('unallocated-refund');
  if (ages.belowEarliest) warnings.push('below-earliest-age');
  if (ages.pastRetirementAge) warnings.push('past-retirement-age');
  return warnings;
}
