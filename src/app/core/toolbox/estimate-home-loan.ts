import { type HomeLoanResult, type TaxTables, homeLoan, payslip, roundRand } from '../engine';
import type { RaHandoffValues } from '../plan/plan-profile';
import type { HomeLoanInputs } from './toolbox-inputs';

/** Things worth telling the user about, in plain words on the page. */
export type HomeLoanWarning = 'over-cap' | 'no-room' | 'rate-unavailable';

/**
 * The Pay figures take-home pay is worked out from: age, medical aid and retirement contributions.
 * The gross comes from the home loan inputs (the user may have edited it).
 */
export type HomeLoanPay = Omit<RaHandoffValues, 'grossMonthly'>;

export interface HomeLoanEstimateOk {
  readonly ok: true;
  /** Full precision, straight from the engine. Round with `roundRand` only for display. */
  readonly result: HomeLoanResult;
  /** Take-home pay a month from the payslip for the gross, or null when it is 0 or less. */
  readonly netMonthly: number | null;
  readonly warnings: readonly HomeLoanWarning[];
}

export interface HomeLoanEstimateFailed {
  readonly ok: false;
  readonly message: string;
}

export type HomeLoanEstimate = HomeLoanEstimateOk | HomeLoanEstimateFailed;

const GENERIC_FAILURE_MESSAGE =
  'Those figures could not be worked out. Check the amounts and try again.';

/**
 * The home loan for the page inputs. The rate is a percent (10.75 means 10.75%); the engine takes
 * a fraction. Take-home pay comes from `payslip`, the same engine as the Pay page, so the
 * repayment's share of take-home matches it. `ratesAvailable` is false when the published rates
 * could not be read, so a bond rate of 0 is a missing default rather than a choice. Never throws
 * for bad figures: a RangeError from the engine becomes `{ ok: false, message }`.
 */
export function estimateHomeLoan(
  inputs: HomeLoanInputs,
  pay: HomeLoanPay,
  tables: TaxTables,
  ratesAvailable = true,
): HomeLoanEstimate {
  let result: HomeLoanResult;
  let netMonthly: number | null;
  try {
    const net = payslip(
      {
        gross: inputs.grossMonthly,
        period: 'monthly',
        age: pay.age,
        medicalMembers: pay.medicalMembers,
        employeeRetirementMonthly: pay.employeeRetirementMonthly,
        employerRetirementMonthly: pay.employerRetirementMonthly,
      },
      tables,
    ).monthly.netPay;
    netMonthly = net > 0 ? net : null;
    result = homeLoan({
      grossMonthly: inputs.grossMonthly,
      existingDebtMonthly: inputs.existingDebtMonthly,
      deposit: inputs.deposit,
      annualRate: inputs.ratePercent / 100,
      termYears: inputs.termYears,
      purchasePrice: inputs.mode === 'price' ? inputs.purchasePrice : null,
      ratesAndLeviesMonthly: inputs.ratesAndLeviesMonthly,
      insuranceMonthly: inputs.insuranceMonthly,
      netMonthly,
    });
  } catch (error) {
    // Why: the engine signals a figure it cannot work with with a RangeError. That is the user's
    // input, so it gets a plain sentence; anything else is a bug and must not be hidden.
    if (error instanceof RangeError) return { ok: false, message: GENERIC_FAILURE_MESSAGE };
    throw error;
  }

  const warnings: HomeLoanWarning[] = [];
  if (inputs.mode === 'price' && !result.withinCap) warnings.push('over-cap');
  // Rounded to cents so float dust never raises a warning about "R 0,00".
  if (roundRand(result.roomForBond) === 0) warnings.push('no-room');
  if (!ratesAvailable && inputs.ratePercent === 0) warnings.push('rate-unavailable');
  return { ok: true, result, netMonthly, warnings };
}
