import { findBracket, incomeTax } from './income-tax';
import { medicalCredit } from './medical-credit';
import { MONTHS_PER_YEAR, assertAmount, assertWholeNumber, roundRand } from './money';
import { rebates } from './rebates';
import { retirementDeduction } from './retirement';
import type { TaxTables } from './tax-tables';
import { uifMonthly } from './uif';

export type PayPeriod = 'monthly' | 'annual';

export interface PayslipInput {
  /** Cash salary for the `period`. */
  readonly gross: number;
  readonly period: PayPeriod;
  /** Age on the last day of the tax year. */
  readonly age: number;
  /** People on the medical scheme: main member plus dependants. 0 (default) means none. */
  readonly medicalMembers?: number;
  /** Employee contribution to an RA or pension fund, per month. */
  readonly employeeRetirementMonthly?: number;
  /** Employer contribution to a retirement fund on the employee's behalf, per month. */
  readonly employerRetirementMonthly?: number;
  /** Other deductions taken after tax, per month. */
  readonly otherDeductionsMonthly?: number;
}

export interface RetirementLine {
  readonly deductible: number;
  /** Contributions above the s11F limit, carried forward. */
  readonly excess: number;
  /** Room left under the s11F limit. */
  readonly headroom: number;
}

/** One period's amounts in full precision. Round with `roundRand` only for display. */
export interface PayslipAmounts {
  /** Cash salary. */
  readonly gross: number;
  /** Employer retirement contribution, taxed as a fringe benefit (not cash). */
  readonly fringeBenefit: number;
  /** gross + fringeBenefit. */
  readonly remuneration: number;
  readonly retirement: RetirementLine;
  readonly taxableIncome: number;
  readonly taxBeforeRebates: number;
  /** Rebates actually used (never more than the tax). */
  readonly rebates: number;
  /** s6A credit actually used (never more than the tax left after rebates). */
  readonly medicalCredit: number;
  /** taxBeforeRebates − rebates − medicalCredit. */
  readonly paye: number;
  readonly uif: number;
  readonly employeeRetirement: number;
  readonly otherDeductions: number;
  /** gross − employeeRetirement − paye − uif − otherDeductions. */
  readonly netPay: number;
}

export interface Payslip {
  readonly monthly: PayslipAmounts;
  readonly annual: PayslipAmounts;
  /** Bracket rate on taxable income, or 0 when no tax is due after rebates. */
  readonly marginalRate: number;
  /** Annual PAYE / annual cash gross; 0 when gross is 0. */
  readonly effectiveRate: number;
}

/**
 * A monthly and annual payslip for one employee.
 *
 * PAYE uses the annual-equivalent method: annualise the salary, work out the year's tax, and take
 * monthly PAYE as annual tax / 12. SARS's monthly deduction tables round per period, so a real
 * payslip can differ from this by cents.
 * Source: https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
 */
export function payslip(input: PayslipInput, tables: TaxTables): Payslip {
  const {
    gross,
    period,
    age,
    medicalMembers = 0,
    employeeRetirementMonthly = 0,
    employerRetirementMonthly = 0,
    otherDeductionsMonthly = 0,
  } = input;
  assertAmount('gross', gross);
  assertWholeNumber('age', age);
  assertWholeNumber('medicalMembers', medicalMembers);
  assertAmount('employeeRetirementMonthly', employeeRetirementMonthly);
  assertAmount('employerRetirementMonthly', employerRetirementMonthly);
  assertAmount('otherDeductionsMonthly', otherDeductionsMonthly);

  const grossAnnual = period === 'monthly' ? gross * MONTHS_PER_YEAR : gross;
  const employeeRetirement = employeeRetirementMonthly * MONTHS_PER_YEAR;
  const otherDeductions = otherDeductionsMonthly * MONTHS_PER_YEAR;

  // Why: an employer's retirement fund contribution is a taxable fringe benefit, so it is added to
  // remuneration, and it is then treated as the employee's own contribution for s11F.
  // Sources: https://www.sars.gov.za/faq/faq-what-are-s11f-annual-allowable-deductions/ and
  // https://www.sars.gov.za/wp-content/uploads/Docs/Budget/Budget2026/Budget-tax-guide-2026-online-version-for-printing.pdf
  const fringeBenefit = employerRetirementMonthly * MONTHS_PER_YEAR;
  const remuneration = grossAnnual + fringeBenefit;
  // The payslip has no other income, so taxable income before s11F is the remuneration itself.
  const retirement = retirementDeduction(
    {
      contributions: employeeRetirement + fringeBenefit,
      remuneration,
      taxableIncomeBeforeDeduction: remuneration,
    },
    tables,
  );
  const taxableIncome = remuneration - retirement.deductible;

  const taxBeforeRebates = incomeTax(taxableIncome, tables);
  // Report the amounts used rather than the entitlement, so the lines add up to PAYE.
  const rebatesUsed = Math.min(rebates(age, tables), taxBeforeRebates);
  const taxAfterRebates = taxBeforeRebates - rebatesUsed;
  // Why: the s6A credit is non-refundable; it can bring tax to 0 but never below.
  // Source: https://www.sars.gov.za/tax-rates/medical-tax-credit-rates/
  const medicalCreditUsed = Math.min(medicalCredit(medicalMembers, tables), taxAfterRebates);
  const paye = taxAfterRebates - medicalCreditUsed;

  // Simplification: UIF is worked out on cash salary; the employer fringe benefit is left out.
  // It only matters below the UIF ceiling.
  const uif = uifMonthly(grossAnnual / MONTHS_PER_YEAR, tables) * MONTHS_PER_YEAR;
  const netPay = grossAnnual - employeeRetirement - paye - uif - otherDeductions;

  const annual: PayslipAmounts = {
    gross: grossAnnual,
    fringeBenefit,
    remuneration,
    retirement: {
      deductible: retirement.deductible,
      excess: retirement.excess,
      headroom: retirement.headroom,
    },
    taxableIncome,
    taxBeforeRebates,
    rebates: rebatesUsed,
    medicalCredit: medicalCreditUsed,
    paye,
    uif,
    employeeRetirement,
    otherDeductions,
    netPay,
  };

  return {
    monthly: perMonth(annual),
    annual,
    marginalRate: marginalRate(taxableIncome, taxAfterRebates, tables),
    effectiveRate: grossAnnual === 0 ? 0 : paye / grossAnnual,
  };
}

/**
 * The rate on the next rand of taxable income: the bracket rate, or 0 while income is at or below the
 * age threshold (no tax after rebates). The medical credit is ignored here on purpose, so the figure
 * reflects the tax schedule rather than a person's medical aid.
 * Tax under half a cent counts as none, so float noise exactly at a threshold cannot flip the result.
 */
function marginalRate(taxableIncome: number, taxAfterRebates: number, tables: TaxTables): number {
  if (roundRand(taxAfterRebates) === 0) return 0;
  return findBracket(taxableIncome, tables.brackets).rate;
}

function perMonth(annual: PayslipAmounts): PayslipAmounts {
  const month = (amount: number) => amount / MONTHS_PER_YEAR;
  return {
    gross: month(annual.gross),
    fringeBenefit: month(annual.fringeBenefit),
    remuneration: month(annual.remuneration),
    retirement: {
      deductible: month(annual.retirement.deductible),
      excess: month(annual.retirement.excess),
      headroom: month(annual.retirement.headroom),
    },
    taxableIncome: month(annual.taxableIncome),
    taxBeforeRebates: month(annual.taxBeforeRebates),
    rebates: month(annual.rebates),
    medicalCredit: month(annual.medicalCredit),
    paye: month(annual.paye),
    uif: month(annual.uif),
    employeeRetirement: month(annual.employeeRetirement),
    otherDeductions: month(annual.otherDeductions),
    netPay: month(annual.netPay),
  };
}
