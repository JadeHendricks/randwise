/** Public API of the pure tax engine. No Angular imports anywhere under core/engine (lint enforced). */
export { roundRand } from './money';
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
