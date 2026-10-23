import { type EmergencyFundResult, emergencyFund } from '../engine';
import type { EmergencyFundInputs } from './toolbox-inputs';

/** Things worth telling the user about, in plain words on the page. */
export type EmergencyFundWarning = 'not-reachable' | 'no-expenses';

export interface EmergencyFundEstimateOk {
  readonly ok: true;
  /** Full precision, straight from the engine. Round with `roundRand` only for display. */
  readonly result: EmergencyFundResult;
  readonly warnings: readonly EmergencyFundWarning[];
}

export interface EmergencyFundEstimateFailed {
  readonly ok: false;
  readonly message: string;
}

export type EmergencyFundEstimate = EmergencyFundEstimateOk | EmergencyFundEstimateFailed;

const GENERIC_FAILURE_MESSAGE =
  'Those figures could not be worked out. Check the amounts and try again.';

/**
 * The emergency fund for the page inputs. The inputs hold a percent (5 means 5%); the engine takes
 * a fraction, so it is divided by 100 here. Never throws for bad figures: a RangeError from the
 * engine becomes `{ ok: false, message }`, like `estimateJourney`.
 */
export function estimateEmergencyFund(inputs: EmergencyFundInputs): EmergencyFundEstimate {
  let result: EmergencyFundResult;
  try {
    result = emergencyFund({
      monthlyExpenses: inputs.monthlyExpenses,
      targetMonths: inputs.targetMonths,
      currentSavings: inputs.currentSavings,
      monthlyContribution: inputs.monthlyContribution,
      annualRate: inputs.savingsRatePercent / 100,
    });
  } catch (error) {
    // Why: the engine signals a figure it cannot work with with a RangeError. That is the user's
    // input, so it gets a plain sentence; anything else is a bug and must not be hidden.
    if (error instanceof RangeError) return { ok: false, message: GENERIC_FAILURE_MESSAGE };
    throw error;
  }

  const warnings: EmergencyFundWarning[] = [];
  if (!result.hasTarget) warnings.push('no-expenses');
  else if (result.monthsToGoal === null) warnings.push('not-reachable');
  return { ok: true, result, warnings };
}
