import { MONTHS_PER_YEAR, assertAmount, roundRand } from './money';

/**
 * Emergency fund: how long it takes to save a target of N months of expenses.
 *
 * Convention: the rate is a NOMINAL annual rate paid monthly (annual / 12), which is how South
 * African banks quote savings rates. Each month the balance earns interest on its opening value,
 * then the monthly contribution is added at the END of the month, so a contribution earns nothing
 * until the following month. Rands, full precision, pure; callers round for display.
 *
 * The month count comes from iterating the same months the series shows, so the headline and the
 * chart can never disagree. (The closed form `ln((T + P/i) / (S + P/i)) / ln(1 + i)` is only used
 * in the spec, to prove the iteration is the same maths.)
 */

/** How far ahead the fund is followed, in months (50 years). A product cap, not a tax rule. */
export const EMERGENCY_HORIZON_MONTHS = 600;

/** Tolerance for float dust in a month count, so 24.0000000001 months does not become 25. */
const MONTH_EPSILON = 1e-9;

export interface EmergencyFundInput {
  /** Rands spent on essentials in a month. */
  readonly monthlyExpenses: number;
  /** Months of expenses the fund should cover. */
  readonly targetMonths: number;
  readonly currentSavings: number;
  /** Rands added at the end of every month. */
  readonly monthlyContribution: number;
  /** Nominal annual rate as a fraction, 0..1 (0.12 is 12%). */
  readonly annualRate: number;
}

/** The fund at the end of a month; month 0 is today. */
export interface EmergencyFundPoint {
  readonly month: number;
  readonly balance: number;
  /** Contributions paid in so far (not counting the starting savings). */
  readonly contributions: number;
  /** Interest earned so far. */
  readonly interest: number;
}

export interface EmergencyFundResult {
  /** monthlyExpenses × targetMonths. */
  readonly target: number;
  /** False when the target is 0 (no expenses or no months), so there is nothing to aim for. */
  readonly hasTarget: boolean;
  /** max(0, target − currentSavings). */
  readonly shortfall: number;
  /** The target is met to the cent today. */
  readonly reached: boolean;
  /** currentSavings / target × 100, from 0 to 100; 0 when there is no target. */
  readonly progressPercent: number;
  /** Whole months until the balance reaches the target; 0 when it already has, null when it never does within the horizon. */
  readonly monthsToGoal: number | null;
  /** The same with a 0% rate (shortfall / contribution, rounded up); null when nothing is going in. */
  readonly monthsToGoalNoInterest: number | null;
  /** Balance at the last point of the series: the goal month, or the end of the horizon when it is missed. */
  readonly balanceAtGoal: number;
  /** Contributions paid in by that point. */
  readonly contributionsToGoal: number;
  /** Interest earned by that point. */
  readonly interestEarned: number;
  /** annualRate / 12. */
  readonly monthlyRate: number;
  /** Month 0 up to the goal month, or up to the horizon when the goal is not reached. */
  readonly series: readonly EmergencyFundPoint[];
}

function assertRate(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`annualRate must be a rate from 0 to 1, got ${value}`);
  }
}

/** Saves toward `targetMonths` of expenses and reports when the goal is reached. */
export function emergencyFund(input: EmergencyFundInput): EmergencyFundResult {
  const { monthlyExpenses, targetMonths, currentSavings, monthlyContribution, annualRate } = input;
  assertAmount('monthlyExpenses', monthlyExpenses);
  assertAmount('targetMonths', targetMonths);
  assertAmount('currentSavings', currentSavings);
  assertAmount('monthlyContribution', monthlyContribution);
  assertRate(annualRate);

  const target = monthlyExpenses * targetMonths;
  const hasTarget = target > 0;
  const shortfall = Math.max(0, target - currentSavings);
  // Why the cent: a balance within half a cent of the target is "there", the same test the Budget
  // uses, so float dust never costs an extra month.
  const metBy = (balance: number): boolean => hasTarget && roundRand(target - balance) <= 0;
  const reached = metBy(currentSavings);
  const monthlyRate = annualRate / MONTHS_PER_YEAR;

  const series: EmergencyFundPoint[] = [
    { month: 0, balance: currentSavings, contributions: 0, interest: 0 },
  ];
  let monthsToGoal: number | null = reached ? 0 : null;
  if (hasTarget && !reached) {
    let balance = currentSavings;
    let contributions = 0;
    let interest = 0;
    for (let month = 1; month <= EMERGENCY_HORIZON_MONTHS; month++) {
      const earned = balance * monthlyRate;
      balance += earned + monthlyContribution;
      interest += earned;
      contributions += monthlyContribution;
      series.push({ month, balance, contributions, interest });
      if (metBy(balance)) {
        monthsToGoal = month;
        break;
      }
    }
  }

  let monthsToGoalNoInterest: number | null = null;
  if (hasTarget) {
    if (reached) monthsToGoalNoInterest = 0;
    else if (monthlyContribution > 0) {
      monthsToGoalNoInterest = Math.ceil(shortfall / monthlyContribution - MONTH_EPSILON);
    }
  }

  const last = series[series.length - 1];
  return {
    target,
    hasTarget,
    shortfall,
    reached,
    progressPercent: hasTarget ? Math.min(100, Math.max(0, (currentSavings / target) * 100)) : 0,
    monthsToGoal,
    monthsToGoalNoInterest,
    balanceAtGoal: last.balance,
    contributionsToGoal: last.contributions,
    interestEarned: last.interest,
    monthlyRate,
    series,
  };
}

/**
 * At most `maxPoints` points of a series by month, always keeping the first and the last, for a
 * chart. The months stay strictly increasing. A series that is already short is returned as is.
 */
export function thinSeries<T extends { readonly month: number }>(
  series: readonly T[],
  maxPoints: number,
): T[] {
  const keep = Math.max(2, Math.floor(maxPoints));
  if (series.length <= keep) return [...series];
  const last = series.length - 1;
  const picked: T[] = [];
  let previous = -1;
  for (let slot = 0; slot < keep; slot++) {
    const index = slot === keep - 1 ? last : Math.round((slot * last) / (keep - 1));
    // The step is at least 1 here, so the indices only repeat through rounding; skip repeats.
    if (index > previous) {
      picked.push(series[index]);
      previous = index;
    }
  }
  return picked;
}
