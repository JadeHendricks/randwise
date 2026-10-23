/** Public API of the pure tax engine. No Angular imports anywhere under core/engine (lint enforced). */
export { MONTHS_PER_YEAR, roundRand } from './money';
export { toTaxTables } from './tax-tables';
export type {
  MedicalCreditRates,
  RetirementLimits,
  TaxBracket,
  TaxRebates,
  TaxTables,
  TaxThresholds,
  UifRates,
} from './tax-tables';
export { findBracket, incomeTax } from './income-tax';
export { rebates, taxAfterRebates } from './rebates';
export { medicalCredit, medicalCreditMonthly } from './medical-credit';
export { retirementDeduction } from './retirement';
export type { RetirementDeductionInput, RetirementDeductionResult } from './retirement';
export { uifMonthly } from './uif';
export { payslip } from './payslip';
export type { PayPeriod, Payslip, PayslipAmounts, PayslipInput, RetirementLine } from './payslip';
export { grossFromNet } from './gross-from-net';
export type { GrossFromNetInputs } from './gross-from-net';
export {
  MAX_RA_RETIREMENT_AGE,
  raCalculator,
  raHeadroom,
  raProjection,
  raRetirementAges,
  raTaxSaving,
  toRaRules,
} from './ra';
export type {
  RaHeadroom,
  RaInput,
  RaProjection,
  RaProjectionInput,
  RaResult,
  RaRetirementAges,
  RaRules,
  RaSalary,
  RaTaxSaving,
  RaTwoPot,
  RaYear,
} from './ra';
