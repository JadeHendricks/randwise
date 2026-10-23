import { type Payslip, type PayslipInput, payslip } from './payslip';
import type { TaxTables } from './tax-tables';

export type GrossFromNetInputs = Omit<PayslipInput, 'gross' | 'period'>;

/** Bisection stops once the bracket is this narrow (rands). Tighter than R0.01, so net is too. */
const GROSS_TOLERANCE = 0.001;
/** About 40 halvings are needed from R1bn to R0.001; this is a safety stop, not a tuning knob. */
const MAX_ITERATIONS = 200;
/** No realistic salary is above this per month; a target needing more is treated as impossible. */
const MAX_MONTHLY_GROSS = 1e9;

/**
 * The payslip whose monthly net pay meets `targetNetMonthly`, with every other input held fixed.
 * Why bisection: net pay rises strictly with gross (each extra rand loses at most 45% tax plus 1% UIF),
 * so there is exactly one answer and halving the search range always converges.
 * Throws RangeError for a target that is not a finite amount of 0 or more, or that needs a monthly
 * gross above R1bn.
 */
export function grossFromNet(
  targetNetMonthly: number,
  otherInputs: GrossFromNetInputs,
  tables: TaxTables,
): Payslip {
  if (!Number.isFinite(targetNetMonthly) || targetNetMonthly < 0) {
    throw new RangeError(
      `Target net pay must be a finite amount of 0 or more, got ${targetNetMonthly}`,
    );
  }
  const slipAt = (gross: number) => payslip({ ...otherInputs, gross, period: 'monthly' }, tables);
  const netAt = (gross: number) => slipAt(gross).monthly.netPay;

  const fixedMonthly =
    (otherInputs.employeeRetirementMonthly ?? 0) + (otherInputs.otherDeductionsMonthly ?? 0);
  let lo = 0;
  let hi = Math.min(Math.max(1, 2 * (targetNetMonthly + fixedMonthly)), MAX_MONTHLY_GROSS);
  while (netAt(hi) < targetNetMonthly) {
    if (hi >= MAX_MONTHLY_GROSS) {
      throw new RangeError(
        `Target net pay of ${targetNetMonthly} a month is too large: it needs a gross above ${MAX_MONTHLY_GROSS}`,
      );
    }
    lo = hi;
    hi = Math.min(hi * 2, MAX_MONTHLY_GROSS);
  }

  for (let i = 0; i < MAX_ITERATIONS && hi - lo > GROSS_TOLERANCE; i++) {
    const mid = (lo + hi) / 2;
    if (netAt(mid) < targetNetMonthly) lo = mid;
    else hi = mid;
  }
  if (hi - lo > GROSS_TOLERANCE) {
    throw new Error(`grossFromNet did not converge for a target of ${targetNetMonthly}`);
  }
  // `hi` always meets the target, so the returned net is never short of it.
  return slipAt(hi);
}
