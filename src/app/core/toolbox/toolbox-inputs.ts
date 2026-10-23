import { type Assumptions, GROWTH_PREMIUM_PP } from '../data/assumptions';
import { amountOr, percentOr, wholeOr } from '../ra/ra-inputs';
import { SALARY_LIMITS } from '../salary/salary-inputs';

/**
 * The inputs of the four Toolbox calculators, as the pages hold them: percents mean 5 for 5%, the
 * estimators turn them into fractions. Each tool has defaults from the published-rate assumptions
 * (0 when rates are unavailable, like every other page) and a sanitiser that never lets a bad
 * figure through to the engine.
 */

/** How the home loan is worked out: the largest bond a salary supports, or the cost of a price. */
export type HomeLoanMode = 'afford' | 'price';

export interface EmergencyFundInputs {
  /** Essentials, rands a month. */
  readonly monthlyExpenses: number;
  /** Months of essentials to cover, a whole number. */
  readonly targetMonths: number;
  readonly currentSavings: number;
  /** Rands put aside every month. */
  readonly monthlyContribution: number;
  /** Nominal yearly savings rate, as a percent. */
  readonly savingsRatePercent: number;
}

export interface HomeLoanInputs {
  /** Follows the Pay page until edited. */
  readonly grossMonthly: number;
  readonly existingDebtMonthly: number;
  readonly deposit: number;
  /** Nominal yearly bond rate, as a percent. */
  readonly ratePercent: number;
  readonly termYears: number;
  readonly mode: HomeLoanMode;
  /** Used in 'price' mode. */
  readonly purchasePrice: number;
  readonly ratesAndLeviesMonthly: number;
  readonly insuranceMonthly: number;
}

export interface TwoPotInputs {
  /** Rands taken from the savings pot. */
  readonly withdrawal: number;
  /** Follows the Pay page until edited. */
  readonly taxableIncomeAnnual: number;
  /** Follows the Pay page until edited. */
  readonly age: number;
  /** Follows the Pay page until edited: sets the medical credit. */
  readonly medicalMembers: number;
  readonly yearsToRetirement: number;
  /** Growth above inflation, as a percent. */
  readonly realGrowthPercent: number;
  readonly inflationPercent: number;
}

export interface InvestmentInputs {
  readonly lumpSum: number;
  readonly yearlyContribution: number;
  readonly years: number;
  /** Effective yearly return, as a percent. */
  readonly returnPercent: number;
  /** Share of the return that is interest, as a percent. An illustrative assumption. */
  readonly interestPercent: number;
  /** Share of the return that is dividends, as a percent. Capital growth is the rest. */
  readonly dividendPercent: number;
  /** Follows the Pay page until edited. */
  readonly marginalRatePercent: number;
  /** Follows the Pay page until edited. */
  readonly age: number;
  /** TFSA contributions already made (growth excluded). */
  readonly tfsaLifetimeUsed: number;
}

/** The fields that follow the Pay page until the user edits them. */
export type HomeLoanPayKeys = 'grossMonthly';
export type TwoPotPayKeys = 'taxableIncomeAnnual' | 'age' | 'medicalMembers';
export type InvestmentPayKeys = 'marginalRatePercent' | 'age';

export const EMERGENCY_FUND_LIMITS = {
  targetMonths: { min: 1, max: 12 },
  savingsRatePercent: { min: 0, max: 15 },
} as const;

export const HOME_LOAN_LIMITS = {
  ratePercent: { min: 0, max: 30 },
  termYears: { min: 1, max: 30 },
} as const;

export const TWO_POT_LIMITS = {
  age: SALARY_LIMITS.age,
  medicalMembers: SALARY_LIMITS.medicalMembers,
  yearsToRetirement: { min: 0, max: 50 },
  realGrowthPercent: { min: 0, max: 15 },
  inflationPercent: { min: 0, max: 15 },
} as const;

export const INVESTMENT_LIMITS = {
  years: { min: 1, max: 50 },
  returnPercent: { min: 0, max: 20 },
  interestPercent: { min: 0, max: 100 },
  dividendPercent: { min: 0, max: 100 },
  marginalRatePercent: { min: 0, max: 100 },
  age: SALARY_LIMITS.age,
} as const;

/** The example the tool starts from: three months of R15 000, nothing saved, R2 000 a month. */
export const EMERGENCY_FUND_EXAMPLE = {
  monthlyExpenses: 15_000,
  targetMonths: 3,
  currentSavings: 0,
  monthlyContribution: 2_000,
} as const;

export const HOME_LOAN_EXAMPLE = {
  existingDebtMonthly: 0,
  deposit: 0,
  termYears: 20,
  mode: 'afford',
  purchasePrice: 1_500_000,
  ratesAndLeviesMonthly: 0,
  insuranceMonthly: 0,
} as const;

export const TWO_POT_EXAMPLE = {
  withdrawal: 20_000,
  yearsToRetirement: 20,
} as const;

export const INVESTMENT_EXAMPLE = {
  lumpSum: 46_000,
  yearlyContribution: 0,
  years: 10,
  interestPercent: 30,
  dividendPercent: 20,
  tfsaLifetimeUsed: 0,
} as const;

/** Savings earn the repo rate (the cash return assumption); 0 without rates. */
export function emergencyFundDefaults(assumptions: Assumptions | null): EmergencyFundInputs {
  return {
    ...EMERGENCY_FUND_EXAMPLE,
    savingsRatePercent: assumptions
      ? percentOr(assumptions.cashReturn.valuePercent, 0, EMERGENCY_FUND_LIMITS.savingsRatePercent)
      : 0,
  };
}

/** The bond rate starts at prime; 0 when prime is unavailable. The Pay-following field is left out. */
export function homeLoanDefaults(
  primePercent: number | null,
): Omit<HomeLoanInputs, HomeLoanPayKeys> {
  return {
    ...HOME_LOAN_EXAMPLE,
    ratePercent:
      primePercent === null ? 0 : percentOr(primePercent, 0, HOME_LOAN_LIMITS.ratePercent),
  };
}

/**
 * Growth above inflation starts at the growth assumption's premium over CPI (5 points) and
 * inflation at CPI; both are 0 without rates. The Pay-following fields are left out.
 */
export function twoPotDefaults(assumptions: Assumptions | null): Omit<TwoPotInputs, TwoPotPayKeys> {
  return {
    ...TWO_POT_EXAMPLE,
    realGrowthPercent: assumptions
      ? percentOr(GROWTH_PREMIUM_PP, 0, TWO_POT_LIMITS.realGrowthPercent)
      : 0,
    inflationPercent: assumptions
      ? percentOr(assumptions.inflation.valuePercent, 0, TWO_POT_LIMITS.inflationPercent)
      : 0,
  };
}

/** The return starts at the growth portfolio assumption; 0 without rates. The Pay-following fields are left out. */
export function investmentDefaults(
  assumptions: Assumptions | null,
): Omit<InvestmentInputs, InvestmentPayKeys> {
  return {
    ...INVESTMENT_EXAMPLE,
    returnPercent: assumptions
      ? percentOr(assumptions.growthReturn.valuePercent, 0, INVESTMENT_LIMITS.returnPercent)
      : 0,
  };
}

/**
 * Applies `patch` to `current`: amounts must be finite and 0 or more (an invalid one keeps its
 * current value and is never capped), whole numbers are rounded and clamped, percents are clamped
 * and not rounded. The same rules apply to the other three sanitisers below.
 */
export function sanitiseEmergencyFund(
  patch: Partial<EmergencyFundInputs>,
  current: EmergencyFundInputs,
): EmergencyFundInputs {
  return {
    monthlyExpenses: amountOr(patch.monthlyExpenses, current.monthlyExpenses),
    targetMonths: wholeOr(
      patch.targetMonths,
      current.targetMonths,
      EMERGENCY_FUND_LIMITS.targetMonths,
    ),
    currentSavings: amountOr(patch.currentSavings, current.currentSavings),
    monthlyContribution: amountOr(patch.monthlyContribution, current.monthlyContribution),
    savingsRatePercent: percentOr(
      patch.savingsRatePercent,
      current.savingsRatePercent,
      EMERGENCY_FUND_LIMITS.savingsRatePercent,
    ),
  };
}

const isHomeLoanMode = (value: unknown): value is HomeLoanMode =>
  value === 'afford' || value === 'price';

export function sanitiseHomeLoan(
  patch: Partial<HomeLoanInputs>,
  current: HomeLoanInputs,
): HomeLoanInputs {
  return {
    grossMonthly: amountOr(patch.grossMonthly, current.grossMonthly),
    existingDebtMonthly: amountOr(patch.existingDebtMonthly, current.existingDebtMonthly),
    deposit: amountOr(patch.deposit, current.deposit),
    ratePercent: percentOr(patch.ratePercent, current.ratePercent, HOME_LOAN_LIMITS.ratePercent),
    termYears: wholeOr(patch.termYears, current.termYears, HOME_LOAN_LIMITS.termYears),
    mode: isHomeLoanMode(patch.mode) ? patch.mode : current.mode,
    purchasePrice: amountOr(patch.purchasePrice, current.purchasePrice),
    ratesAndLeviesMonthly: amountOr(patch.ratesAndLeviesMonthly, current.ratesAndLeviesMonthly),
    insuranceMonthly: amountOr(patch.insuranceMonthly, current.insuranceMonthly),
  };
}

export function sanitiseTwoPot(patch: Partial<TwoPotInputs>, current: TwoPotInputs): TwoPotInputs {
  return {
    withdrawal: amountOr(patch.withdrawal, current.withdrawal),
    taxableIncomeAnnual: amountOr(patch.taxableIncomeAnnual, current.taxableIncomeAnnual),
    age: wholeOr(patch.age, current.age, TWO_POT_LIMITS.age),
    medicalMembers: wholeOr(
      patch.medicalMembers,
      current.medicalMembers,
      TWO_POT_LIMITS.medicalMembers,
    ),
    yearsToRetirement: wholeOr(
      patch.yearsToRetirement,
      current.yearsToRetirement,
      TWO_POT_LIMITS.yearsToRetirement,
    ),
    realGrowthPercent: percentOr(
      patch.realGrowthPercent,
      current.realGrowthPercent,
      TWO_POT_LIMITS.realGrowthPercent,
    ),
    inflationPercent: percentOr(
      patch.inflationPercent,
      current.inflationPercent,
      TWO_POT_LIMITS.inflationPercent,
    ),
  };
}

/**
 * Also keeps the return split valid: interest and dividends are shares of the same return, so
 * dividends are clamped to what interest leaves (dividendPercent <= 100 - interestPercent).
 */
export function sanitiseInvestment(
  patch: Partial<InvestmentInputs>,
  current: InvestmentInputs,
): InvestmentInputs {
  const interestPercent = percentOr(
    patch.interestPercent,
    current.interestPercent,
    INVESTMENT_LIMITS.interestPercent,
  );
  const dividendPercent = Math.min(
    100 - interestPercent,
    percentOr(patch.dividendPercent, current.dividendPercent, INVESTMENT_LIMITS.dividendPercent),
  );
  return {
    lumpSum: amountOr(patch.lumpSum, current.lumpSum),
    yearlyContribution: amountOr(patch.yearlyContribution, current.yearlyContribution),
    years: wholeOr(patch.years, current.years, INVESTMENT_LIMITS.years),
    returnPercent: percentOr(
      patch.returnPercent,
      current.returnPercent,
      INVESTMENT_LIMITS.returnPercent,
    ),
    interestPercent,
    dividendPercent,
    marginalRatePercent: percentOr(
      patch.marginalRatePercent,
      current.marginalRatePercent,
      INVESTMENT_LIMITS.marginalRatePercent,
    ),
    age: wholeOr(patch.age, current.age, INVESTMENT_LIMITS.age),
    tfsaLifetimeUsed: amountOr(patch.tfsaLifetimeUsed, current.tfsaLifetimeUsed),
  };
}

/**
 * The share of the return that is capital growth, as a percent: whatever the interest and dividend
 * shares leave. Worked in whole percent points so 30 + 20 leaves exactly 50.
 */
export function growthPercent(
  inputs: Pick<InvestmentInputs, 'interestPercent' | 'dividendPercent'>,
): number {
  return Math.max(0, 100 - inputs.interestPercent - inputs.dividendPercent);
}

/** Rounds to 2 decimal places, so 0.1075 × 100 does not show as 10.750000000000002. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

/** The bond rate for a margin over prime: prime 10.75 and margin -0.5 give 10.25. */
export function rateFromMargin(primePercent: number, marginPercent: number): number {
  return round2(primePercent + marginPercent);
}

/** The margin over prime for a bond rate: the inverse of `rateFromMargin`. */
export function marginFromRate(primePercent: number, ratePercent: number): number {
  return round2(ratePercent - primePercent);
}

/** A rate as a fraction (0.26) in percent (26), rounded to 2 decimal places. */
export function percentFromFraction(fraction: number): number {
  return round2(fraction * 100);
}

/**
 * The overrides after an edit: a key is overridden when the sanitised value moved (including a
 * clamp that knocked on to another field) or when the user typed exactly the value that was kept.
 * A rejected value (not a number, negative) changes nothing, so a field that follows the Pay page
 * keeps following it.
 */
export function overridesAfter<T extends object>(
  overrides: Partial<T>,
  patch: Partial<T>,
  before: T,
  after: T,
): Partial<T> {
  const next: Partial<T> = { ...overrides };
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (after[key] !== before[key] || (patch[key] !== undefined && patch[key] === after[key])) {
      next[key] = after[key];
    }
  }
  return next;
}
