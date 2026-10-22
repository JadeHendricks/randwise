import { incomeTax } from './income-tax';
import { assertWholeNumber } from './money';
import type { TaxTables } from './tax-tables';

/**
 * Why: the secondary rebate applies from age 65 and the tertiary from 75 (on top of the secondary),
 * judged by age on the last day of the tax year. These ages are fixed in the Income Tax Act, not
 * published per year, so they are constants here while the rebate amounts come from the tables.
 * Source: https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
 */
const SECONDARY_REBATE_AGE = 65;
const TERTIARY_REBATE_AGE = 75;

/** Annual rebate entitlement for an age on the last day of the tax year. */
export function rebates(age: number, tables: TaxTables): number {
  assertWholeNumber('age', age);
  const { primary, secondary, tertiary } = tables.rebates;
  return (
    primary +
    (age >= SECONDARY_REBATE_AGE ? secondary : 0) +
    (age >= TERTIARY_REBATE_AGE ? tertiary : 0)
  );
}

/**
 * Annual tax after rebates, floored at 0.
 * Why: rebates only reduce tax; they are not refundable, so income below the age threshold pays nothing.
 * Source: https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
 */
export function taxAfterRebates(taxableIncome: number, age: number, tables: TaxTables): number {
  return Math.max(0, incomeTax(taxableIncome, tables) - rebates(age, tables));
}
