import {
  type TaxTables,
  type TwoPotRules,
  type TwoPotWithdrawalResult,
  medicalCredit,
  roundRand,
  twoPotWithdrawal,
} from '../engine';
import type { TwoPotInputs } from './toolbox-inputs';

/**
 * Things worth telling the user about, in plain words on the page. A withdrawal below the minimum
 * is a result (`accepted: false`), not a warning.
 */
export type TwoPotWarning = 'crosses-bracket' | 'absorbed-by-credits';

export interface TwoPotEstimateOk {
  readonly ok: true;
  /** Full precision, straight from the engine. Round with `roundRand` only for display. */
  readonly result: TwoPotWithdrawalResult;
  readonly warnings: readonly TwoPotWarning[];
}

export interface TwoPotEstimateFailed {
  readonly ok: false;
  readonly message: string;
}

export type TwoPotEstimate = TwoPotEstimateOk | TwoPotEstimateFailed;

const GENERIC_FAILURE_MESSAGE =
  'Those figures could not be worked out. Check the amounts and try again.';

/**
 * The tax on a two-pot savings withdrawal for the page inputs. Percents become fractions, and the
 * s6A medical credit entitlement for the medical members comes from `medicalCredit`. The taxable
 * income is already resolved (the Pay page's, or the user's). Never throws for bad figures: a
 * RangeError from the engine becomes `{ ok: false, message }`.
 */
export function estimateTwoPot(
  inputs: TwoPotInputs,
  tables: TaxTables,
  rules: TwoPotRules,
): TwoPotEstimate {
  let result: TwoPotWithdrawalResult;
  try {
    result = twoPotWithdrawal(
      {
        withdrawal: inputs.withdrawal,
        taxableIncome: inputs.taxableIncomeAnnual,
        age: inputs.age,
        medicalCreditAnnual: medicalCredit(inputs.medicalMembers, tables),
        yearsToRetirement: inputs.yearsToRetirement,
        realGrowth: inputs.realGrowthPercent / 100,
        inflation: inputs.inflationPercent / 100,
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

  const warnings: TwoPotWarning[] = [];
  if (result.accepted) {
    if (result.crossesBracket) warnings.push('crosses-bracket');
    // Rounded to cents so float dust never raises a warning about "R 0,00".
    if (roundRand(result.absorbedByCredits) > 0) warnings.push('absorbed-by-credits');
  }
  return { ok: true, result, warnings };
}
