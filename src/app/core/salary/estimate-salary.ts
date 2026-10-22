import {
  MONTHS_PER_YEAR,
  type Payslip,
  type TaxTables,
  grossFromNet,
  payslip,
  roundRand,
} from '../engine';
import type { SalaryInputs } from './salary-inputs';

export type BreakdownKey = 'net' | 'paye' | 'uif' | 'retirement' | 'other';

export interface BreakdownLine {
  readonly key: BreakdownKey;
  readonly label: string;
  /** Rands a month, rounded to cents for display. */
  readonly monthly: number;
}

export interface SalaryEstimateOk {
  readonly ok: true;
  /** Full precision, straight from the engine. Round with `roundRand` only for display. */
  readonly payslip: Payslip;
  /** 0-100: how much of the s11F retirement limit is used. 0 when there is no limit to use. */
  readonly retirementUsedPercent: number;
  /** Net, PAYE, UIF, retirement and other deductions; they add up to the cash gross. */
  readonly breakdown: readonly BreakdownLine[];
}

export interface SalaryEstimateFailed {
  readonly ok: false;
  readonly message: string;
}

export type SalaryEstimate = SalaryEstimateOk | SalaryEstimateFailed;

const NET_TOO_HIGH_MESSAGE =
  'That take-home amount is too high to work back to a salary. Try a smaller amount.';
const GENERIC_FAILURE_MESSAGE =
  'Those figures could not be worked out. Check the amounts and try again.';

/**
 * The payslip for the shared Salary inputs: forwards a gross amount to `payslip`, or works a
 * take-home amount back to its gross with `grossFromNet`. Never throws for bad figures: a
 * RangeError from the engine becomes `{ ok: false, message }` with a friendly sentence.
 */
export function estimateSalary(inputs: SalaryInputs, tables: TaxTables): SalaryEstimate {
  const { basis, period, amount, age, medicalMembers } = inputs;
  const others = {
    age,
    medicalMembers,
    employeeRetirementMonthly: inputs.employeeRetirementMonthly,
    employerRetirementMonthly: inputs.employerRetirementMonthly,
    otherDeductionsMonthly: inputs.otherDeductionsMonthly,
  };

  let slip: Payslip;
  try {
    slip =
      basis === 'net'
        ? grossFromNet(period === 'annual' ? amount / MONTHS_PER_YEAR : amount, others, tables)
        : payslip({ ...others, gross: amount, period }, tables);
  } catch (error) {
    // Why: the engine signals a figure it cannot work with (such as a take-home above what any
    // salary could produce) with a RangeError. That is the user's input, so it gets a plain
    // sentence; anything else is a bug and must not be hidden.
    if (error instanceof RangeError) {
      return {
        ok: false,
        message: basis === 'net' ? NET_TOO_HIGH_MESSAGE : GENERIC_FAILURE_MESSAGE,
      };
    }
    throw error;
  }

  return {
    ok: true,
    payslip: slip,
    retirementUsedPercent: retirementUsedPercent(slip),
    breakdown: breakdownOf(slip),
  };
}

/**
 * Why: the ring shows the deduction actually used against the room the s11F limit gave
 * (used + still free). Contributions over the limit do not push it past 100.
 */
function retirementUsedPercent(slip: Payslip): number {
  const { deductible, headroom } = slip.annual.retirement;
  const room = deductible + headroom;
  return room > 0 ? (deductible / room) * 100 : 0;
}

function breakdownOf(slip: Payslip): BreakdownLine[] {
  const m = slip.monthly;
  // The employer contribution is a fringe benefit, not cash, so it is not part of this split.
  return [
    { key: 'net', label: 'Net pay', monthly: roundRand(m.netPay) },
    { key: 'paye', label: 'PAYE', monthly: roundRand(m.paye) },
    { key: 'uif', label: 'UIF', monthly: roundRand(m.uif) },
    { key: 'retirement', label: 'Retirement (RA)', monthly: roundRand(m.employeeRetirement) },
    { key: 'other', label: 'Other deductions', monthly: roundRand(m.otherDeductions) },
  ];
}
