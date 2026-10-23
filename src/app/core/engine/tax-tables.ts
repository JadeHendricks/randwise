import type { TaxYearData } from '../data/tax-year.schema';

/**
 * The plain tables the engine reads, unwrapped from the tax-year file's `Field<T>` wrappers.
 * Every tax figure the engine uses comes from here; the engine itself contains none.
 */

/** tax = base + rate × (income − above), for income in (above, upTo]. `upTo` is null on the top row. */
export interface TaxBracket {
  readonly above: number;
  readonly upTo: number | null;
  readonly base: number;
  readonly rate: number;
}

/** Annual rands. */
export interface TaxRebates {
  readonly primary: number;
  readonly secondary: number;
  readonly tertiary: number;
}

/** Annual taxable income below which no tax is due, per age band. Implied by brackets and rebates. */
export interface TaxThresholds {
  readonly under65: number;
  readonly age65to74: number;
  readonly age75plus: number;
}

/** Monthly rands. */
export interface MedicalCreditRates {
  readonly mainMember: number;
  readonly firstDependant: number;
  readonly additionalDependant: number;
}

export interface UifRates {
  /** Employee share as a fraction of monthly remuneration. */
  readonly rate: number;
  /** Monthly remuneration above which UIF stops growing. */
  readonly monthlyCeiling: number;
}

export interface RetirementLimits {
  /** Fraction of the greater of remuneration and taxable income. */
  readonly rate: number;
  /** Annual rands. */
  readonly annualCap: number;
}

export interface TaxTables {
  readonly taxYear: number;
  readonly brackets: readonly TaxBracket[];
  readonly rebates: TaxRebates;
  readonly thresholds: TaxThresholds;
  readonly medicalCredits: MedicalCreditRates;
  readonly uif: UifRates;
  readonly retirement: RetirementLimits;
}

/**
 * Builds engine tables from a tax-year file already accepted by `validateTaxYearFile` (not re-checked).
 * Copies every value so the tables never alias the file.
 */
export function toTaxTables(file: TaxYearData): TaxTables {
  const { primary, secondary, tertiary } = file.rebates.value;
  const { under65, age65to74, age75plus } = file.thresholds.value;
  const { mainMember, firstDependant, additionalDependant } = file.medicalCredits.value;
  return {
    taxYear: file.taxYear,
    brackets: file.incomeTaxBrackets.value.map(({ above, upTo, base, rate }) => ({
      above,
      upTo,
      base,
      rate,
    })),
    rebates: { primary, secondary, tertiary },
    thresholds: { under65, age65to74, age75plus },
    medicalCredits: { mainMember, firstDependant, additionalDependant },
    uif: {
      rate: file.uif.value.employeeRate,
      monthlyCeiling: file.uif.value.monthlyEarningsCeiling,
    },
    retirement: {
      rate: file.retirementDeduction.value.rate,
      annualCap: file.retirementDeduction.value.annualCap,
    },
  };
}
