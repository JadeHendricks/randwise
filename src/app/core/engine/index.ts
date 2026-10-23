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
export {
  MAX_COMMUTATION_SHARE,
  MAX_RETIRE_HORIZON_AGE,
  RETIRE_HORIZON_AGE,
  annuityIncomeTax,
  capitalAtRetirement,
  commuteOneThird,
  drawdownIssue,
  grossAnnuityFromNet,
  inflateToRetirement,
  livingAnnuityCapital,
  netCostOfContribution,
  requiredAnnualReturn,
  requiredMonthlyContribution,
  retireIssues,
  retirePlan,
  retirementLumpSumTax,
  simulateDrawdown,
  toRetireRules,
} from './retire';
export type {
  AnnuityIncome,
  DrawdownInput,
  DrawdownIssue,
  DrawdownResult,
  DrawdownYear,
  LumpSum,
  RetireCapital,
  RetireInput,
  RetireIssue,
  RetireResult,
  RetireRules,
} from './retire';
export { tfsaContribution, toTfsaRules } from './tfsa';
export type { TfsaContribution, TfsaContributionInput, TfsaRules } from './tfsa';
export { twoPotWithdrawal } from './two-pot';
export type {
  TwoPotAccepted,
  TwoPotBand,
  TwoPotRejected,
  TwoPotRules,
  TwoPotWithdrawalInput,
  TwoPotWithdrawalResult,
} from './two-pot';
export {
  cgtOnDisposal,
  dividendTax,
  interestExemption,
  interestTax,
  toInvestmentTaxRules,
} from './investment-tax';
export type { InvestmentTaxRules } from './investment-tax';
export { MAX_COMPARISON_YEARS, compareTfsaDiscretionary } from './tfsa-vs-discretionary';
export type {
  ComparisonYear,
  InvestmentComparison,
  InvestmentComparisonInput,
  ReturnSplit,
  ScenarioTax,
} from './tfsa-vs-discretionary';
export {
  BUDGET_GROUPS,
  BUDGET_PRESETS,
  addCategory,
  applyPreset,
  defaultBudgetCategories,
  distributeToGroups,
  limitWarnings,
  percentOfNet,
  removeCategory,
  renameCategory,
  setCategoryAmount,
  setCategoryPercent,
  summarise,
} from './budget';
export type {
  BudgetCategory,
  BudgetEmergency,
  BudgetGroup,
  BudgetGroupSummary,
  BudgetKind,
  BudgetLimitSettings,
  BudgetLimits,
  BudgetLineSummary,
  BudgetPresetId,
  BudgetRaLimit,
  BudgetSplit,
  BudgetStatus,
  BudgetSummary,
  BudgetTfsaLimit,
  BudgetWarning,
} from './budget';
export { journey, toJourneyRules } from './journey';
export type {
  JourneyInput,
  JourneyMilestone,
  JourneyMilestoneKind,
  JourneyResult,
  JourneyRules,
  JourneyTotals,
  JourneyYear,
  RefundMode,
} from './journey';
