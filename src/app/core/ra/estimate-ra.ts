import { type RaResult, type RaRules, type TaxTables, raCalculator, roundRand } from '../engine';
import type { RaInputs } from './ra-inputs';

/** Things worth telling the user about, in plain words on the page. */
export type RaWarning = 'over-cap' | 'below-earliest-age' | 'past-retirement-age';

export interface RaEstimateOk {
  readonly ok: true;
  /** Full precision, straight from the engine. Round with `roundRand` only for display. */
  readonly result: RaResult;
  /** 0-100: the deduction used (existing plus this RA) against this year's s11F limit. */
  readonly usedPercent: number;
  readonly warnings: readonly RaWarning[];
}

export interface RaEstimateFailed {
  readonly ok: false;
  readonly message: string;
}

export type RaEstimate = RaEstimateOk | RaEstimateFailed;

const GENERIC_FAILURE_MESSAGE =
  'Those figures could not be worked out. Check the amounts and try again.';

/**
 * The RA result for the page inputs. The inputs hold percents (5 means 5%); the engine takes
 * fractions, so they are divided by 100 here. Never throws for bad figures: a RangeError from the
 * engine becomes `{ ok: false, message }`, like `estimateSalary`.
 */
export function estimateRa(inputs: RaInputs, tables: TaxTables, rules: RaRules): RaEstimate {
  let result: RaResult;
  try {
    result = raCalculator(
      {
        salary: {
          grossMonthly: inputs.grossMonthly,
          age: inputs.age,
          medicalMembers: inputs.medicalMembers,
          employeeRetirementMonthly: inputs.employeeRetirementMonthly,
          employerRetirementMonthly: inputs.employerRetirementMonthly,
        },
        contributionMonthly: inputs.contributionMonthly,
        escalation: inputs.escalationPercent / 100,
        startingBalance: inputs.startingBalance,
        annualReturn: inputs.returnPercent / 100,
        inflation: inputs.inflationPercent / 100,
        retirementAge: inputs.retirementAge,
      },
      tables,
      rules,
    );
  } catch (error) {
    // Why: the engine signals a figure it cannot work with with a RangeError. That is the user's
    // input, so it gets a plain sentence; anything else is a bug and must not be hidden.
    if (error instanceof RangeError) return { ok: false, message: GENERIC_FAILURE_MESSAGE };
    throw error;
  }

  return {
    ok: true,
    result,
    usedPercent: usedPercent(result),
    warnings: warningsOf(result),
  };
}

/**
 * Why: the ring shows the deduction in use with this RA (existing contributions plus the part of
 * the extra one that is deductible) against the limit. It cannot pass 100 because the deduction
 * never exceeds the limit.
 */
function usedPercent({ headroom, taxSaving }: RaResult): number {
  if (headroom.limit <= 0) return 0;
  const used = headroom.existingDeductible + taxSaving.deductible;
  return Math.min(100, (used / headroom.limit) * 100);
}

function warningsOf({ taxSaving, ages }: RaResult): RaWarning[] {
  const warnings: RaWarning[] = [];
  // Rounded to cents so float dust never raises a warning about "R 0,00".
  if (roundRand(taxSaving.carriedForward) > 0) warnings.push('over-cap');
  if (ages.belowEarliest) warnings.push('below-earliest-age');
  if (ages.pastRetirementAge) warnings.push('past-retirement-age');
  return warnings;
}
