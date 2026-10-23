import { incomeTax } from './income-tax';
import { assertAmount, assertWholeNumber } from './money';
import type { RaRules } from './ra';
import { rebates } from './rebates';
import type { TaxTables } from './tax-tables';

/**
 * Two-pot savings withdrawal: the tax on taking money out of the savings pot now, and what that
 * money would have grown to by retirement. Rands, full precision, pure.
 *
 * Compounding is yearly: `FV = W × (1 + g)^y` in today's money (g is a real rate) and future rands
 * multiply that by `(1 + inflation)^y`. Nothing is added or withdrawn between now and retirement.
 * The nominal true cost adds tax paid in today's rands to growth lost in future rands; the
 * today's-money figure is the headline. Fund admin fees are not modelled.
 */

/** The longest projection to retirement, in years. A product cap, not a tax rule. */
const MAX_YEARS_TO_RETIREMENT = 60;

/** The two-pot rules the withdrawal needs, from `toRaRules(file)`. */
export type TwoPotRules = Pick<RaRules, 'minimumWithdrawal' | 'withdrawalsPerTaxYear'>;

export interface TwoPotWithdrawalInput {
  /** Rands taken from the savings pot. */
  readonly withdrawal: number;
  /** Annual taxable income before the withdrawal. */
  readonly taxableIncome: number;
  /** Age on the last day of the tax year. */
  readonly age: number;
  /** s6A medical credit for the year, in rands (default 0). */
  readonly medicalCreditAnnual?: number;
  readonly yearsToRetirement: number;
  /** Real (after-inflation) yearly growth as a fraction, 0..1. */
  readonly realGrowth: number;
  /** Yearly inflation as a fraction, 0..1. */
  readonly inflation: number;
}

/** The slice of the withdrawal that falls in one tax bracket: income in (above, upTo]. */
export interface TwoPotBand {
  readonly above: number;
  readonly upTo: number;
  readonly amount: number;
  readonly rate: number;
  /** amount × rate, before rebates and credits. */
  readonly tax: number;
}

export interface TwoPotRejected {
  readonly accepted: false;
  readonly reason: 'below-minimum';
  readonly withdrawal: number;
  readonly minimum: number;
  readonly withdrawalsPerTaxYear: number;
}

export interface TwoPotAccepted {
  readonly accepted: true;
  readonly withdrawal: number;
  readonly minimum: number;
  readonly withdrawalsPerTaxYear: number;
  /** Tax after rebates and the medical credit on the income without the withdrawal. */
  readonly taxBeforeWithdrawal: number;
  /** The same with the withdrawal added. */
  readonly taxAfterWithdrawal: number;
  /** taxAfterWithdrawal − taxBeforeWithdrawal: the tax the withdrawal costs. */
  readonly tax: number;
  /** incomeTax(ti + w) − incomeTax(ti): the sum of the band taxes. */
  readonly taxBeforeRebates: number;
  /** The part of taxBeforeRebates that unused rebates and medical credit soak up. */
  readonly absorbedByCredits: number;
  readonly bands: readonly TwoPotBand[];
  /** Rate on the first rand of the withdrawal. */
  readonly startRate: number;
  /** Rate on the last rand of the withdrawal. */
  readonly topRate: number;
  readonly crossesBracket: boolean;
  /** tax / withdrawal. */
  readonly effectiveRate: number;
  /** withdrawal − tax. */
  readonly netCash: number;
  readonly yearsToRetirement: number;
  /** What the withdrawal would grow to by retirement, in today's money. */
  readonly futureValueToday: number;
  /** The same in future rands. */
  readonly futureValueNominal: number;
  readonly lostGrowthToday: number;
  readonly lostGrowthNominal: number;
  /** tax + lostGrowthToday (= futureValueToday − netCash). */
  readonly trueCostToday: number;
  readonly trueCostNominal: number;
  /** trueCostToday / netCash; 0 when netCash is 0. */
  readonly costPerRandReceived: number;
}

export type TwoPotWithdrawalResult = TwoPotRejected | TwoPotAccepted;

function assertFraction(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a rate from 0 to 1, got ${value}`);
  }
}

/** The slices of (from, to] that fall in each bracket row. */
function bandsBetween(from: number, to: number, tables: TaxTables): TwoPotBand[] {
  const bands: TwoPotBand[] = [];
  for (const row of tables.brackets) {
    const above = Math.max(from, row.above);
    const upTo = Math.min(to, row.upTo ?? Number.POSITIVE_INFINITY);
    if (upTo <= above) continue;
    const amount = upTo - above;
    bands.push({ above, upTo, amount, rate: row.rate, tax: amount * row.rate });
  }
  return bands;
}

/** Tax on a savings-pot withdrawal at the member's marginal rate, and its cost in lost growth. */
export function twoPotWithdrawal(
  input: TwoPotWithdrawalInput,
  tables: TaxTables,
  rules: TwoPotRules,
): TwoPotWithdrawalResult {
  const { withdrawal, taxableIncome, age, yearsToRetirement, realGrowth, inflation } = input;
  const medicalCreditAnnual = input.medicalCreditAnnual ?? 0;
  assertAmount('withdrawal', withdrawal);
  assertAmount('taxableIncome', taxableIncome);
  assertAmount('medicalCreditAnnual', medicalCreditAnnual);
  assertWholeNumber('age', age);
  assertWholeNumber('yearsToRetirement', yearsToRetirement, MAX_YEARS_TO_RETIREMENT);
  assertFraction('realGrowth', realGrowth);
  assertFraction('inflation', inflation);

  const minimum = rules.minimumWithdrawal;
  const { withdrawalsPerTaxYear } = rules;
  // Why: a savings-pot withdrawal must be at least the minimum (R2 000 in 2026/27, read from the
  // tax-year file), up to the savings-pot balance, and allowed once per tax year. The boundary is
  // inclusive: exactly the minimum may be taken.
  // Source: https://www.sars.gov.za/latest-news/tax-directives-enhancements-and-tax-implications-of-the-two-pot-retirement-system/
  if (withdrawal < minimum) {
    return { accepted: false, reason: 'below-minimum', withdrawal, minimum, withdrawalsPerTaxYear };
  }

  // Why: a savings-pot withdrawal is added to taxable income and taxed at the member's marginal
  // rate through the normal income-tax tables. The retirement and withdrawal lump-sum tables apply
  // at retirement or resignation, NOT to savings-pot withdrawals. The fund's directive withholds
  // the tax; the final figure is settled on assessment.
  // Sources: https://www.sars.gov.za/media-release/tax-implications-of-withdrawing-from-two-pot-retirement-system/
  // and https://www.sars.gov.za/tax-rates/income-tax/retirement-lump-sum-benefits/ (lump-sum contrast)
  //
  // Why the floor: rebates and the s6A medical credit are non-refundable, so unused credits absorb
  // the first rands of the withdrawal before any tax is due. A bare incomeTax difference would
  // overstate the tax for low incomes.
  // Sources: https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
  // and https://www.sars.gov.za/tax-rates/medical-tax-credit-rates/
  const credits = rebates(age, tables) + medicalCreditAnnual;
  const net = (income: number): number => Math.max(0, incomeTax(income, tables) - credits);
  const after = taxableIncome + withdrawal;
  const taxBeforeWithdrawal = net(taxableIncome);
  const taxAfterWithdrawal = net(after);
  const tax = taxAfterWithdrawal - taxBeforeWithdrawal;
  const taxBeforeRebates = incomeTax(after, tables) - incomeTax(taxableIncome, tables);

  // Why bands, not findBracket(ti): SARS ranges are (above, upTo], so income exactly on an upper
  // bound sits in the lower row while the next rand is taxed at the higher rate.
  // Source: https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
  const bands = bandsBetween(taxableIncome, after, tables);
  const nextRow =
    tables.brackets.find((row) => row.upTo === null || taxableIncome < row.upTo) ??
    tables.brackets[tables.brackets.length - 1];
  const startRate = bands.length > 0 ? bands[0].rate : nextRow.rate;
  const topRate = bands.length > 0 ? bands[bands.length - 1].rate : nextRow.rate;

  const netCash = withdrawal - tax;
  const futureValueToday = withdrawal * (1 + realGrowth) ** yearsToRetirement;
  const futureValueNominal = futureValueToday * (1 + inflation) ** yearsToRetirement;
  const lostGrowthToday = futureValueToday - withdrawal;
  const lostGrowthNominal = futureValueNominal - withdrawal;
  const trueCostToday = tax + lostGrowthToday;

  return {
    accepted: true,
    withdrawal,
    minimum,
    withdrawalsPerTaxYear,
    taxBeforeWithdrawal,
    taxAfterWithdrawal,
    tax,
    taxBeforeRebates,
    absorbedByCredits: taxBeforeRebates - tax,
    bands,
    startRate,
    topRate,
    crossesBracket: bands.length > 1,
    effectiveRate: withdrawal > 0 ? tax / withdrawal : 0,
    netCash,
    yearsToRetirement,
    futureValueToday,
    futureValueNominal,
    lostGrowthToday,
    lostGrowthNominal,
    trueCostToday,
    trueCostNominal: tax + lostGrowthNominal,
    costPerRandReceived: netCash > 0 ? trueCostToday / netCash : 0,
  };
}
