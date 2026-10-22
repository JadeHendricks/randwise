import { assertAmount } from './money';
import type { TaxTables } from './tax-tables';

/**
 * Employee UIF contribution for a month.
 * Why: the employee pays a fixed share of remuneration, but only up to a monthly earnings ceiling,
 * so above the ceiling the contribution stays flat. Rate and ceiling come from the tables.
 * Source: https://www.sars.gov.za/types-of-tax/unemployment-insurance-fund/
 */
export function uifMonthly(monthlyRemuneration: number, tables: TaxTables): number {
  assertAmount('monthlyRemuneration', monthlyRemuneration);
  const { rate, monthlyCeiling } = tables.uif;
  return rate * Math.min(monthlyRemuneration, monthlyCeiling);
}
