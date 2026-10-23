import { MONTHS_PER_YEAR, assertAmount, roundRand } from './money';

/**
 * Home loan: the monthly instalment on a bond, how big a bond a salary supports, and the year-by-year
 * balance. Rands, full precision, pure; callers round for display.
 *
 * Convention: the rate is a NOMINAL annual rate compounded monthly (`r = annual / 12`), which is how
 * South African banks quote bond rates, over `n = termYears × 12` equal instalments:
 * `P = PV × r / (1 − (1 + r)^−n)`, and `PV / n` when `r` is 0.
 */

/**
 * The share of gross monthly income a household's total debt repayments are held to when sizing a
 * bond. A rule of thumb, NOT a tax rule or a bank guarantee: lenders run their own affordability
 * tests (and may count rates, levies and insurance), so the real limit can be higher or lower.
 */
export const AFFORDABILITY_SHARE = 0.3;

/** The longest bond term the tool follows, in years. */
const MAX_TERM_YEARS = 30;

export interface HomeLoanInput {
  /** Gross income before tax, rands a month. */
  readonly grossMonthly: number;
  /** Repayments already being made on other debt, rands a month. */
  readonly existingDebtMonthly: number;
  readonly deposit: number;
  /** Nominal annual rate as a fraction, 0..1 (0.1075 is 10.75%). */
  readonly annualRate: number;
  /** Whole years, 1..30. */
  readonly termYears: number;
  /** The price to buy at, or null for "what can I afford". */
  readonly purchasePrice: number | null;
  /** Municipal rates and levies, rands a month. Shown in the cost, not counted against the cap. */
  readonly ratesAndLeviesMonthly: number;
  /** Home insurance, rands a month. Shown in the cost, not counted against the cap. */
  readonly insuranceMonthly: number;
  /** Take-home pay a month, for the repayment's share of it; null when unknown. */
  readonly netMonthly: number | null;
}

export interface HomeLoanYear {
  /** 1 for the first year of the bond. */
  readonly year: number;
  readonly opening: number;
  /** Interest paid in the year. */
  readonly interest: number;
  /** Capital repaid in the year. */
  readonly principal: number;
  readonly closing: number;
}

export interface HomeLoanResult {
  /** AFFORDABILITY_SHARE × gross income. */
  readonly affordabilityCap: number;
  /** max(0, cap − existing debt): what a new bond may cost a month. */
  readonly roomForBond: number;
  /** The bond that room pays off over the term. */
  readonly maxBond: number;
  /** maxBond + deposit. */
  readonly maxPrice: number;
  readonly purchasePrice: number;
  readonly loanAmount: number;
  /** The monthly instalment on `loanAmount`. */
  readonly repayment: number;
  readonly totalPaid: number;
  readonly totalInterest: number;
  /** repayment + rates and levies + insurance. */
  readonly totalMonthlyCost: number;
  /** (existing debt + repayment) / gross income; 0 when there is no income. */
  readonly debtShareOfGross: number;
  /** The new instalment fits in `roomForBond` to the cent. */
  readonly withinCap: boolean;
  /** max(0, repayment − roomForBond). */
  readonly overCapBy: number;
  /** repayment / take-home pay; null when no take-home pay was given. */
  readonly repaymentShareOfNet: number | null;
  readonly firstMonth: { readonly interest: number; readonly principal: number };
  /** One entry per year of the term; empty when there is no loan. */
  readonly schedule: readonly HomeLoanYear[];
  readonly firstYear: HomeLoanYear | null;
}

function assertTerms(annualRate: number, termYears: number): void {
  if (!Number.isFinite(annualRate) || annualRate < 0 || annualRate > 1) {
    throw new RangeError(`annualRate must be a rate from 0 to 1, got ${annualRate}`);
  }
  if (!Number.isInteger(termYears) || termYears < 1 || termYears > MAX_TERM_YEARS) {
    throw new RangeError(
      `termYears must be a whole number from 1 to ${MAX_TERM_YEARS}, got ${termYears}`,
    );
  }
}

/** The annuity factor `(1 − (1 + r)^−n) / r`, or `n` at a rate of 0: what 1 rand a month pays off. */
function annuityFactor(annualRate: number, termYears: number): number {
  const months = termYears * MONTHS_PER_YEAR;
  const r = annualRate / MONTHS_PER_YEAR;
  return r === 0 ? months : (1 - (1 + r) ** -months) / r;
}

/** The equal monthly instalment that repays `principal` over `termYears` at a nominal annual rate. */
export function monthlyRepayment(principal: number, annualRate: number, termYears: number): number {
  assertAmount('principal', principal);
  assertTerms(annualRate, termYears);
  return principal / annuityFactor(annualRate, termYears);
}

/** The loan a monthly instalment pays off over `termYears`: the inverse of `monthlyRepayment`. */
export function loanForRepayment(repayment: number, annualRate: number, termYears: number): number {
  assertAmount('repayment', repayment);
  assertTerms(annualRate, termYears);
  return repayment * annuityFactor(annualRate, termYears);
}

/** Month-by-month balance summed into years. */
function yearSchedule(loan: number, repayment: number, annualRate: number, termYears: number) {
  const r = annualRate / MONTHS_PER_YEAR;
  const schedule: HomeLoanYear[] = [];
  let balance = loan;
  for (let year = 1; year <= termYears; year++) {
    const opening = balance;
    let interest = 0;
    let principal = 0;
    for (let month = 0; month < MONTHS_PER_YEAR; month++) {
      const monthInterest = balance * r;
      const monthPrincipal = repayment - monthInterest;
      interest += monthInterest;
      principal += monthPrincipal;
      balance -= monthPrincipal;
    }
    // Why the floor: the last instalment leaves float dust either side of 0, never a real balance.
    balance = Math.max(0, balance);
    schedule.push({ year, opening, interest, principal, closing: balance });
  }
  return schedule;
}

/**
 * The bond a salary supports and the cost of a bond.
 *
 * With no `purchasePrice` the loan is the largest bond that fits the room under the affordability
 * cap. With a price the loan is price − deposit (never below 0) and the result says whether its
 * instalment fits the room. Only the instalment is held to the cap: rates, levies and insurance are
 * shown in the total monthly cost but not counted against it.
 */
export function homeLoan(input: HomeLoanInput): HomeLoanResult {
  const {
    grossMonthly,
    existingDebtMonthly,
    deposit,
    annualRate,
    termYears,
    purchasePrice,
    ratesAndLeviesMonthly,
    insuranceMonthly,
    netMonthly,
  } = input;
  assertAmount('grossMonthly', grossMonthly);
  assertAmount('existingDebtMonthly', existingDebtMonthly);
  assertAmount('deposit', deposit);
  assertAmount('ratesAndLeviesMonthly', ratesAndLeviesMonthly);
  assertAmount('insuranceMonthly', insuranceMonthly);
  if (purchasePrice !== null) assertAmount('purchasePrice', purchasePrice);
  if (netMonthly !== null) assertAmount('netMonthly', netMonthly);
  assertTerms(annualRate, termYears);

  const affordabilityCap = AFFORDABILITY_SHARE * grossMonthly;
  const roomForBond = Math.max(0, affordabilityCap - existingDebtMonthly);
  const maxBond = loanForRepayment(roomForBond, annualRate, termYears);
  const maxPrice = maxBond + deposit;

  const price = purchasePrice ?? maxPrice;
  const loanAmount = purchasePrice === null ? maxBond : Math.max(0, price - deposit);
  const repayment = monthlyRepayment(loanAmount, annualRate, termYears);
  const totalPaid = repayment * termYears * MONTHS_PER_YEAR;
  const overCapBy = Math.max(0, repayment - roomForBond);
  const schedule = loanAmount > 0 ? yearSchedule(loanAmount, repayment, annualRate, termYears) : [];
  const firstMonthInterest = (loanAmount * annualRate) / MONTHS_PER_YEAR;

  return {
    affordabilityCap,
    roomForBond,
    maxBond,
    maxPrice,
    purchasePrice: price,
    loanAmount,
    repayment,
    totalPaid,
    totalInterest: totalPaid - loanAmount,
    totalMonthlyCost: repayment + ratesAndLeviesMonthly + insuranceMonthly,
    debtShareOfGross: grossMonthly > 0 ? (existingDebtMonthly + repayment) / grossMonthly : 0,
    // Why the cent: in "what can I afford" the instalment equals the room up to float dust.
    withinCap: roundRand(overCapBy) === 0,
    overCapBy,
    repaymentShareOfNet: netMonthly !== null && netMonthly > 0 ? repayment / netMonthly : null,
    firstMonth: { interest: firstMonthInterest, principal: repayment - firstMonthInterest },
    schedule,
    firstYear: schedule[0] ?? null,
  };
}
