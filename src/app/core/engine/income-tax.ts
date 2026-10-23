import { assertAmount } from './money';
import type { TaxBracket, TaxTables } from './tax-tables';

/**
 * The bracket an annual taxable income falls in.
 * Why: SARS prints ranges like "245 101 – 383 100", meaning income in (245 100, 383 100]. So an income
 * exactly on an upper bound uses the lower row, and anything above it (even R0.01, which happens with
 * annualised monthly pay) uses the next row.
 * Source: https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
 */
export function findBracket(taxableIncome: number, brackets: readonly TaxBracket[]): TaxBracket {
  const bracket = brackets.find((row) => row.upTo === null || taxableIncome <= row.upTo);
  if (!bracket) throw new Error(`No tax bracket covers a taxable income of ${taxableIncome}`);
  return bracket;
}

/**
 * Annual income tax before rebates: base + rate × (income − bracket floor).
 * Source: https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
 */
export function incomeTax(taxableIncome: number, tables: TaxTables): number {
  assertAmount('taxableIncome', taxableIncome);
  const bracket = findBracket(taxableIncome, tables.brackets);
  return bracket.base + bracket.rate * (taxableIncome - bracket.above);
}
