import {
  type InvestmentComparison,
  type InvestmentTaxRules,
  compareTfsaDiscretionary,
  roundRand,
} from '../engine';
import type { InvestmentInputs } from './toolbox-inputs';

/** Things worth telling the user about, in plain words on the page. */
export type InvestmentWarning = 'capped' | 'interest-above-exemption' | 'rates-unavailable';

export interface InvestmentEstimateOk {
  readonly ok: true;
  /** Full precision, straight from the engine. Round with `roundRand` only for display. */
  readonly result: InvestmentComparison;
  readonly warnings: readonly InvestmentWarning[];
}

export interface InvestmentEstimateFailed {
  readonly ok: false;
  readonly message: string;
}

export type InvestmentEstimate = InvestmentEstimateOk | InvestmentEstimateFailed;

const GENERIC_FAILURE_MESSAGE =
  'Those figures could not be worked out. Check the amounts and try again.';

/**
 * The TFSA against a taxable account for the page inputs. Percents become fractions and capital
 * growth is whatever the interest and dividend shares leave. The marginal rate and age are
 * already resolved (the Pay page's, or the user's). `ratesAvailable` is false when the published
 * rates could not be read, so a return of 0 is a missing default rather than a choice. Never
 * throws for bad figures: a RangeError from the engine becomes `{ ok: false, message }`.
 */
export function estimateInvestment(
  inputs: InvestmentInputs,
  rules: InvestmentTaxRules,
  ratesAvailable = true,
): InvestmentEstimate {
  let result: InvestmentComparison;
  try {
    result = compareTfsaDiscretionary(
      {
        lumpSum: inputs.lumpSum,
        yearlyContribution: inputs.yearlyContribution,
        years: inputs.years,
        annualReturn: inputs.returnPercent / 100,
        split: {
          interest: inputs.interestPercent / 100,
          dividends: inputs.dividendPercent / 100,
          // Worked in whole percent points so 30 + 20 leaves exactly 50.
          growth: Math.max(0, 100 - inputs.interestPercent - inputs.dividendPercent) / 100,
        },
        marginalRate: inputs.marginalRatePercent / 100,
        age: inputs.age,
        tfsaLifetimeUsed: inputs.tfsaLifetimeUsed,
      },
      rules,
    );
  } catch (error) {
    // Why: the engine signals a figure it cannot work with with a RangeError. That is the user's
    // input, so it gets a plain sentence; anything else is a bug and must not be hidden.
    if (error instanceof RangeError) return { ok: false, message: GENERIC_FAILURE_MESSAGE };
    throw error;
  }

  const warnings: InvestmentWarning[] = [];
  if (result.capped) warnings.push('capped');
  // Rounded to cents so float dust never raises a warning about "R 0,00".
  if (roundRand(result.discretionary.tax.interest) > 0) warnings.push('interest-above-exemption');
  if (!ratesAvailable && inputs.returnPercent === 0) warnings.push('rates-unavailable');
  return { ok: true, result, warnings };
}
