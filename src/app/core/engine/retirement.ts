import { assertAmount } from './money';
import type { TaxTables } from './tax-tables';

/** Annual rands. */
export interface RetirementDeductionInput {
  /** Employee contributions plus employer contributions (which count as the employee's). */
  readonly contributions: number;
  readonly remuneration: number;
  readonly taxableIncomeBeforeDeduction: number;
}

/** Annual rands. */
export interface RetirementDeductionResult {
  readonly contributions: number;
  /** The most that may be deducted this year. */
  readonly limit: number;
  readonly deductible: number;
  /** Contributions above the limit; carried forward to the next year. */
  readonly excess: number;
  /** How much more could be contributed and still be deducted this year. */
  readonly headroom: number;
}

/**
 * s11F retirement fund contribution deduction.
 * Why: the deduction is limited to a percentage of the greater of remuneration and taxable income
 * (before this deduction), and to an annual rand cap. Anything above the limit is not lost: it is
 * carried forward to later years. The percentage and cap come from the tables.
 * Sources: https://www.sars.gov.za/faq/faq-what-are-s11f-annual-allowable-deductions/ and
 * https://www.sars.gov.za/wp-content/uploads/Docs/Budget/Budget2026/Budget-tax-guide-2026-online-version-for-printing.pdf
 */
export function retirementDeduction(
  input: RetirementDeductionInput,
  tables: TaxTables,
): RetirementDeductionResult {
  const { contributions, remuneration, taxableIncomeBeforeDeduction } = input;
  assertAmount('contributions', contributions);
  assertAmount('remuneration', remuneration);
  assertAmount('taxableIncomeBeforeDeduction', taxableIncomeBeforeDeduction);
  const { rate, annualCap } = tables.retirement;
  const limit = Math.min(rate * Math.max(remuneration, taxableIncomeBeforeDeduction), annualCap);
  const deductible = Math.min(contributions, limit);
  return {
    contributions,
    limit,
    deductible,
    excess: contributions - deductible,
    headroom: limit - deductible,
  };
}
