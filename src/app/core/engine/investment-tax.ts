import type { TaxYearData } from '../data/tax-year.schema';
import { assertAmount, assertWholeNumber } from './money';
import { TfsaRules, toTfsaRules } from './tfsa';

/**
 * Tax on investment income outside a TFSA: the interest exemption, dividends withholding tax and
 * capital gains tax on a disposal. Rands, full precision, pure.
 */

/**
 * Why: the larger interest exemption applies from age 65, judged by age on the last day of the tax
 * year (the same rule as the secondary rebate). The age is fixed in the Income Tax Act, not
 * published per year, so it is a constant here while the amounts come from the tax-year file.
 * Source: https://www.sars.gov.za/tax-rates/income-tax/interest-and-dividends/
 */
const INTEREST_EXEMPTION_SENIOR_AGE = 65;

/** The investment-tax rules from the tax-year file, plus the TFSA limits. */
export interface InvestmentTaxRules extends TfsaRules {
  /** Rands of local interest a year that are tax-free under 65. */
  readonly interestExemptionUnder65: number;
  /** The same from 65. */
  readonly interestExemption65Plus: number;
  /** Rands of net capital gain a year that are not taxed. */
  readonly cgtAnnualExclusion: number;
  /** Fraction of the net gain added to taxable income. */
  readonly cgtInclusionRate: number;
  /** Final withholding tax on local dividends, as a fraction. */
  readonly dividendsWithholdingRate: number;
}

/**
 * Reads the investment-tax rules from a tax-year file already accepted by `validateTaxYearFile`.
 * Why a separate function: `TaxTables` is pinned by tax-tables.spec (same reason as `toTfsaRules`).
 * Sources: https://www.sars.gov.za/tax-rates/income-tax/interest-and-dividends/
 * and https://www.sars.gov.za/tax-rates/income-tax/capital-gains-tax-cgt/
 */
export function toInvestmentTaxRules(file: TaxYearData): InvestmentTaxRules {
  return {
    ...toTfsaRules(file),
    interestExemptionUnder65: file.interestExemption.value.under65,
    interestExemption65Plus: file.interestExemption.value.age65plus,
    cgtAnnualExclusion: file.cgt.value.annualExclusion,
    cgtInclusionRate: file.cgt.value.inclusionRate,
    dividendsWithholdingRate: file.dividendsWithholdingRate.value,
  };
}

function assertRate(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a rate from 0 to 1, got ${value}`);
  }
}

/** The yearly interest exemption for an age on the last day of the tax year. */
export function interestExemption(age: number, rules: InvestmentTaxRules): number {
  assertWholeNumber('age', age);
  return age >= INTEREST_EXEMPTION_SENIOR_AGE
    ? rules.interestExemption65Plus
    : rules.interestExemptionUnder65;
}

/**
 * Tax on a year's local interest.
 * Why: only interest above the yearly exemption is taxable, at the person's marginal rate. This
 * assumes it is the person's only interest income (the exemption is per person, not per account).
 * Source: https://www.sars.gov.za/tax-rates/income-tax/interest-and-dividends/
 */
export function interestTax(
  interest: number,
  age: number,
  marginalRate: number,
  rules: InvestmentTaxRules,
): { exempt: number; taxable: number; tax: number } {
  assertAmount('interest', interest);
  assertRate('marginalRate', marginalRate);
  const exempt = Math.min(interest, interestExemption(age, rules));
  const taxable = interest - exempt;
  return { exempt, taxable, tax: taxable * marginalRate };
}

/**
 * Dividends withholding tax on local dividends.
 * Why: local dividends carry a final withholding tax (20% in 2026/27) and no further income tax.
 * Foreign dividends are taxed differently and are not modelled.
 * Source: https://www.sars.gov.za/tax-rates/income-tax/interest-and-dividends/
 */
export function dividendTax(dividends: number, rules: InvestmentTaxRules): number {
  assertAmount('dividends', dividends);
  return dividends * rules.dividendsWithholdingRate;
}

/**
 * Capital gains tax on one disposal in a tax year.
 * Why: the annual exclusion comes off the gain first, then the inclusion rate (40% for
 * individuals) decides how much is added to taxable income, taxed at the marginal rate. A loss
 * is floored at 0 here (losses are not carried forward).
 * Source: https://www.sars.gov.za/tax-rates/income-tax/capital-gains-tax-cgt/
 */
export function cgtOnDisposal(
  gain: number,
  marginalRate: number,
  rules: InvestmentTaxRules,
): { gain: number; exclusionUsed: number; netGain: number; included: number; tax: number } {
  if (!Number.isFinite(gain)) throw new RangeError(`gain must be finite, got ${gain}`);
  assertRate('marginalRate', marginalRate);
  const positive = Math.max(0, gain);
  const exclusionUsed = Math.min(positive, rules.cgtAnnualExclusion);
  const netGain = positive - exclusionUsed;
  const included = netGain * rules.cgtInclusionRate;
  return { gain, exclusionUsed, netGain, included, tax: included * marginalRate };
}
