import { MONTHS_PER_YEAR, assertWholeNumber } from './money';
import type { TaxTables } from './tax-tables';

/**
 * Monthly s6A medical scheme fees tax credit for `members` people on the scheme (main member plus
 * dependants; 0 means no medical aid).
 * Why: s6A gives one amount for the main member, the same for the first dependant, and a smaller
 * amount for each further dependant. s6B (additional medical expenses credit) is only worked out on
 * assessment, so PAYE ignores it and so does this engine.
 * Source: https://www.sars.gov.za/tax-rates/medical-tax-credit-rates/
 */
export function medicalCreditMonthly(members: number, tables: TaxTables): number {
  assertWholeNumber('medicalMembers', members);
  const { mainMember, firstDependant, additionalDependant } = tables.medicalCredits;
  if (members === 0) return 0;
  if (members === 1) return mainMember;
  return mainMember + firstDependant + (members - 2) * additionalDependant;
}

/** s6A credit entitlement for `months` months of cover (default a full year). */
export function medicalCredit(
  members: number,
  tables: TaxTables,
  months = MONTHS_PER_YEAR,
): number {
  assertWholeNumber('months', months, MONTHS_PER_YEAR);
  return medicalCreditMonthly(members, tables) * months;
}
