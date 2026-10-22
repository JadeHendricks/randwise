import { IsoDate, TaxYearPeriod } from './tax-calendar';

/**
 * Shape of `src/assets/data/tax-years/<YYYY>.json`.
 *
 * Units: rates are decimal fractions (0.18 = 18%), money is whole rands,
 * `medicalCredits` and `uif.monthlyEarningsCeiling` are monthly amounts.
 */

/** 'verified-auto' is reserved for the automated tax-season scout. */
export type TaxYearStatus = 'verified' | 'verified-auto' | 'draft';

export const TAX_YEAR_STATUSES: readonly TaxYearStatus[] = ['verified', 'verified-auto', 'draft'];

/** Every data value carries where it was confirmed and whether it was carried forward unconfirmed. */
export interface Field<T> {
  readonly value: T;
  /** True when the value could not be confirmed for this tax year and the last official one is used. */
  readonly carriedForward: boolean;
  /** Official https URL the value was confirmed on; must also appear in the file's `sources`. */
  readonly source: string;
}

/** tax = base + rate × (income − above); `upTo` is null on the top row. */
export interface BracketRow {
  readonly above: number;
  readonly upTo: number | null;
  readonly base: number;
  readonly rate: number;
}

export interface Rebates {
  readonly primary: number;
  readonly secondary: number;
  readonly tertiary: number;
}

export interface Thresholds {
  readonly under65: number;
  readonly age65to74: number;
  readonly age75plus: number;
}

export interface MedicalCredits {
  readonly mainMember: number;
  readonly firstDependant: number;
  readonly additionalDependant: number;
}

export interface Uif {
  readonly employeeRate: number;
  readonly monthlyEarningsCeiling: number;
}

export interface RetirementDeduction {
  readonly rate: number;
  readonly annualCap: number;
}

export interface Tfsa {
  readonly annualLimit: number;
  readonly lifetimeLimit: number;
  readonly excessPenaltyRate: number;
}

export interface TwoPot {
  readonly savingsShare: number;
  readonly retirementShare: number;
  readonly minimumWithdrawal: number;
  readonly withdrawalsPerTaxYear: number;
}

export interface LivingAnnuityDrawdown {
  readonly minRate: number;
  readonly maxRate: number;
}

export interface InterestExemption {
  readonly under65: number;
  readonly age65plus: number;
}

export interface Cgt {
  readonly annualExclusion: number;
  readonly inclusionRate: number;
}

export interface TaxYearFields {
  readonly incomeTaxBrackets: Field<readonly BracketRow[]>;
  readonly rebates: Field<Rebates>;
  readonly thresholds: Field<Thresholds>;
  readonly medicalCredits: Field<MedicalCredits>;
  readonly uif: Field<Uif>;
  readonly retirementDeduction: Field<RetirementDeduction>;
  readonly tfsa: Field<Tfsa>;
  readonly retirementLumpSum: Field<readonly BracketRow[]>;
  readonly withdrawalLumpSum: Field<readonly BracketRow[]>;
  readonly twoPot: Field<TwoPot>;
  readonly annuitisationDeMinimis: Field<number>;
  readonly livingAnnuityDrawdown: Field<LivingAnnuityDrawdown>;
  readonly interestExemption: Field<InterestExemption>;
  readonly cgt: Field<Cgt>;
  readonly dividendsWithholdingRate: Field<number>;
  readonly earliestRaRetirementAge: Field<number>;
}

export type TaxYearFieldKey = keyof TaxYearFields;

export interface TaxYearData extends TaxYearFields {
  readonly taxYear: number;
  readonly period: TaxYearPeriod;
  readonly status: TaxYearStatus;
  readonly verifiedOn: IsoDate;
  readonly sources: readonly string[];
}

export const TAX_YEAR_FIELD_KEYS: readonly TaxYearFieldKey[] = [
  'incomeTaxBrackets',
  'rebates',
  'thresholds',
  'medicalCredits',
  'uif',
  'retirementDeduction',
  'tfsa',
  'retirementLumpSum',
  'withdrawalLumpSum',
  'twoPot',
  'annuitisationDeMinimis',
  'livingAnnuityDrawdown',
  'interestExemption',
  'cgt',
  'dividendsWithholdingRate',
  'earliestRaRetirementAge',
];

export const TAX_YEAR_FIELD_LABELS: Record<TaxYearFieldKey, string> = {
  incomeTaxBrackets: 'Income tax brackets',
  rebates: 'Tax rebates',
  thresholds: 'Tax thresholds',
  medicalCredits: 'Medical scheme fees tax credits',
  uif: 'UIF contributions',
  retirementDeduction: 'Retirement fund contribution deduction',
  tfsa: 'Tax-free savings limits',
  retirementLumpSum: 'Retirement lump sum tax table',
  withdrawalLumpSum: 'Withdrawal lump sum tax table',
  twoPot: 'Two-pot retirement system',
  annuitisationDeMinimis: 'Annuitisation de minimis',
  livingAnnuityDrawdown: 'Living annuity drawdown limits',
  interestExemption: 'Interest exemption',
  cgt: 'Capital gains tax',
  dividendsWithholdingRate: 'Dividends withholding tax',
  earliestRaRetirementAge: 'Earliest retirement annuity retirement age',
};
