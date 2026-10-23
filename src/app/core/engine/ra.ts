import type { TaxYearData } from '../data/tax-year.schema';
import { MONTHS_PER_YEAR, assertAmount, assertWholeNumber } from './money';
import { payslip } from './payslip';
import { retirementDeduction } from './retirement';
import type { TaxTables } from './tax-tables';

/**
 * Retirement annuity (RA) engine: s11F headroom, the tax saved by an extra contribution, the
 * retirement age to project to, and a month-by-month growth projection.
 *
 * Everything here is full precision and pure; callers round with `roundRand` only for display.
 */

/**
 * The oldest retirement age the RA calculator projects to. A product cap to keep projections
 * sensible, not a tax rule.
 */
export const MAX_RA_RETIREMENT_AGE = 80;

const MAX_AGE = 130;
const MAX_YEARS = 100;

/** The RA rules that live in the tax-year file but not in `TaxTables`. */
export interface RaRules {
  /** Fraction of new contributions that go to the savings pot. */
  readonly savingsShare: number;
  /** Fraction of new contributions that go to the retirement pot. */
  readonly retirementShare: number;
  /** Rands: the least that can be taken from the savings pot in one withdrawal. */
  readonly minimumWithdrawal: number;
  readonly withdrawalsPerTaxYear: number;
  /** The youngest age an RA can pay out. */
  readonly earliestRetirementAge: number;
}

/**
 * Reads the two-pot split and the earliest RA retirement age from a tax-year file already accepted
 * by `validateTaxYearFile` (not re-checked).
 * Why a separate function: `TaxTables` is pinned by tax-tables.spec, so adding fields to it would
 * change an existing engine function's output.
 * Sources: https://www.sars.gov.za/latest-news/tax-directives-enhancements-and-tax-implications-of-the-two-pot-retirement-system/
 * and https://www.sars.gov.za/wp-content/uploads/Docs/Budget/Budget2026/Budget-tax-guide-2026-online-version-for-printing.pdf
 */
export function toRaRules(file: TaxYearData): RaRules {
  const { savingsShare, retirementShare, minimumWithdrawal, withdrawalsPerTaxYear } =
    file.twoPot.value;
  return {
    savingsShare,
    retirementShare,
    minimumWithdrawal,
    withdrawalsPerTaxYear,
    earliestRetirementAge: file.earliestRaRetirementAge.value,
  };
}

/** The Salary side of an RA calculation. Monthly rands. */
export interface RaSalary {
  /** Cash salary per month. */
  readonly grossMonthly: number;
  readonly age: number;
  readonly medicalMembers?: number;
  readonly employeeRetirementMonthly?: number;
  readonly employerRetirementMonthly?: number;
}

/** Annual rands unless the name ends in Monthly. */
export interface RaHeadroom {
  /** The most that may be deducted this year (s11F). */
  readonly limit: number;
  /** Employee plus employer retirement contributions already being made. */
  readonly existingContributions: number;
  readonly existingDeductible: number;
  readonly existingExcess: number;
  /** How much more could be contributed and still be deducted this year. */
  readonly headroom: number;
  readonly headroomMonthly: number;
}

/**
 * How much more can go into an RA this year and still be tax deductible, after the contributions
 * already being made. Uses `retirementDeduction` with the same wiring as `payslip`.
 * Sources: https://www.sars.gov.za/faq/faq-what-are-s11f-annual-allowable-deductions/ and
 * https://www.sars.gov.za/wp-content/uploads/Docs/Budget/Budget2026/Budget-tax-guide-2026-online-version-for-printing.pdf
 */
export function raHeadroom(salary: RaSalary, tables: TaxTables): RaHeadroom {
  assertSalary(salary);
  const { grossMonthly, employeeRetirementMonthly = 0, employerRetirementMonthly = 0 } = salary;
  // Why: the employer's contribution is a taxable fringe benefit, so it counts towards remuneration
  // and, treated as the employee's own, towards the s11F contributions (as payslip does).
  const remuneration = (grossMonthly + employerRetirementMonthly) * MONTHS_PER_YEAR;
  const deduction = retirementDeduction(
    {
      contributions: (employeeRetirementMonthly + employerRetirementMonthly) * MONTHS_PER_YEAR,
      remuneration,
      taxableIncomeBeforeDeduction: remuneration,
    },
    tables,
  );
  return {
    limit: deduction.limit,
    existingContributions: deduction.contributions,
    existingDeductible: deduction.deductible,
    existingExcess: deduction.excess,
    headroom: deduction.headroom,
    headroomMonthly: deduction.headroom / MONTHS_PER_YEAR,
  };
}

/** Annual rands unless the name ends in Monthly. */
export interface RaTaxSaving {
  /** The extra contribution for the year. */
  readonly contribution: number;
  /** The part of it that is deductible this year. */
  readonly deductible: number;
  /** Total s11F excess this year with the extra contribution, including any existing excess. */
  readonly carriedForward: number;
  /** Headroom left after the extra contribution. */
  readonly remainingHeadroom: number;
  readonly payeWithout: number;
  readonly payeWith: number;
  /** PAYE reduction: lower PAYE if paid through payroll, or the same amount as a refund on filing. */
  readonly saving: number;
  readonly savingMonthly: number;
  /** Bracket rate before and after the extra contribution (0 when no tax is due). */
  readonly marginalRate: number;
  readonly marginalRateAfter: number;
  /** The quick estimate: deductible part × marginal rate before the contribution. */
  readonly approxSaving: number;
  /** approxSaving − saving: what the quick estimate overstates. */
  readonly approxDifference: number;
  /** True when the contribution moves the taxpayer into a lower bracket (or out of tax). */
  readonly crossesBracket: boolean;
  /** contribution − saving. */
  readonly netCost: number;
  readonly netCostMonthly: number;
}

/**
 * The tax an extra monthly RA contribution saves: annual PAYE without it minus annual PAYE with it,
 * both worked out by `payslip` so every rule (s11F limit, rebates, medical credit) is the same one
 * the Pay page uses. The marginal-rate figure is the quick estimate people do on paper; the two
 * differ when the deduction spans a bracket boundary.
 * Why carried forward: contributions above the s11F limit are not lost, they roll to the next year.
 * Sources: https://www.sars.gov.za/faq/faq-what-are-s11f-annual-allowable-deductions/ and
 * https://www.sars.gov.za/wp-content/uploads/Docs/Budget/Budget2026/Budget-tax-guide-2026-online-version-for-printing.pdf
 */
export function raTaxSaving(
  salary: RaSalary,
  contributionMonthly: number,
  tables: TaxTables,
): RaTaxSaving {
  assertSalary(salary);
  assertAmount('contributionMonthly', contributionMonthly);
  const { employeeRetirementMonthly = 0 } = salary;
  const input = {
    gross: salary.grossMonthly,
    period: 'monthly',
    age: salary.age,
    medicalMembers: salary.medicalMembers,
    employeeRetirementMonthly,
    employerRetirementMonthly: salary.employerRetirementMonthly,
  } as const;
  const without = payslip(input, tables);
  const withExtra = payslip(
    { ...input, employeeRetirementMonthly: employeeRetirementMonthly + contributionMonthly },
    tables,
  );

  const contribution = contributionMonthly * MONTHS_PER_YEAR;
  const deductible = withExtra.annual.retirement.deductible - without.annual.retirement.deductible;
  const saving = without.annual.paye - withExtra.annual.paye;
  const approxSaving = deductible * without.marginalRate;
  const netCost = contribution - saving;
  return {
    contribution,
    deductible,
    carriedForward: withExtra.annual.retirement.excess,
    remainingHeadroom: withExtra.annual.retirement.headroom,
    payeWithout: without.annual.paye,
    payeWith: withExtra.annual.paye,
    saving,
    savingMonthly: saving / MONTHS_PER_YEAR,
    marginalRate: without.marginalRate,
    marginalRateAfter: withExtra.marginalRate,
    approxSaving,
    approxDifference: approxSaving - saving,
    crossesBracket: without.marginalRate !== withExtra.marginalRate,
    netCost,
    netCostMonthly: netCost / MONTHS_PER_YEAR,
  };
}

export interface RaRetirementAges {
  /** What the user asked for. */
  readonly requested: number;
  /** What is projected to: the request, raised to the earliest age and capped at the maximum. */
  readonly retirementAge: number;
  /** Years from the current age to `retirementAge`; 0 when already there. */
  readonly years: number;
  readonly belowEarliest: boolean;
  readonly aboveMax: boolean;
  readonly pastRetirementAge: boolean;
}

/**
 * The age to project to and how many years that is.
 * Why: an RA cannot pay out before the earliest retirement age in the tax data, so a younger request
 * is projected to that age instead (and flagged); the maximum is a product cap.
 * Source: https://www.sars.gov.za/wp-content/uploads/Docs/Budget/Budget2026/Budget-tax-guide-2026-online-version-for-printing.pdf
 */
export function raRetirementAges(
  currentAge: number,
  requestedRetirementAge: number,
  rules: Pick<RaRules, 'earliestRetirementAge'>,
): RaRetirementAges {
  assertWholeNumber('age', currentAge, MAX_AGE);
  assertWholeNumber('retirementAge', requestedRetirementAge, MAX_AGE);
  const retirementAge = Math.min(
    MAX_RA_RETIREMENT_AGE,
    Math.max(rules.earliestRetirementAge, requestedRetirementAge),
  );
  return {
    requested: requestedRetirementAge,
    retirementAge,
    years: Math.max(0, retirementAge - currentAge),
    belowEarliest: requestedRetirementAge < rules.earliestRetirementAge,
    aboveMax: requestedRetirementAge > MAX_RA_RETIREMENT_AGE,
    pastRetirementAge: currentAge >= retirementAge,
  };
}

/** Rates are fractions (0.05 means 5%), effective per year. */
export interface RaProjectionInput {
  /** Contribution per month in the first year, rands. */
  readonly monthlyContribution: number;
  /** Yearly rise in the contribution. */
  readonly escalation: number;
  /** Rands already in the RA; treated as the vested pot. */
  readonly startingBalance: number;
  readonly annualReturn: number;
  readonly inflation: number;
  readonly years: number;
}

export interface RaYear {
  /** 0 is the start; year n is the end of year n. */
  readonly year: number;
  /** Cumulative contributions paid in (excludes the starting balance). */
  readonly contributions: number;
  /** nominal − startingBalance − contributions. */
  readonly growth: number;
  readonly nominal: number;
  /** nominal in today's money: nominal / (1 + inflation)^year. */
  readonly real: number;
}

export interface RaTwoPot {
  readonly savingsContributions: number;
  readonly retirementContributions: number;
  readonly savingsPot: number;
  readonly retirementPot: number;
  /** The starting balance, grown. Not split. */
  readonly vestedPot: number;
}

export interface RaProjection {
  /** (1 + annualReturn)^(1/12) − 1. */
  readonly monthlyRate: number;
  /** `years + 1` rows; series[0] is the start. */
  readonly series: readonly RaYear[];
  readonly final: RaYear;
  readonly twoPot: RaTwoPot;
}

/**
 * Month-by-month growth of an RA.
 *
 * Convention: return, escalation and inflation are effective annual rates. The monthly rate is
 * (1 + R)^(1/12) − 1, so a lump sum grows by exactly R in a year. Contributions are paid at the END
 * of each month (an ordinary annuity) and rise by the escalation once a year, from month 13. With no
 * escalation this matches FV = P × ((1 + i)^(12n) − 1) / i (P × 12n when i = 0). Real values divide
 * by (1 + inflation)^year.
 *
 * Two-pot simplification: new contributions split by the data's shares; the starting balance is the
 * vested pot and is not split. All pots grow at the same rate and no withdrawals are modelled.
 * Source: https://www.sars.gov.za/latest-news/tax-directives-enhancements-and-tax-implications-of-the-two-pot-retirement-system/
 */
export function raProjection(
  input: RaProjectionInput,
  rules: Pick<RaRules, 'savingsShare' | 'retirementShare'>,
): RaProjection {
  const { monthlyContribution, escalation, startingBalance, annualReturn, inflation, years } =
    input;
  assertAmount('monthlyContribution', monthlyContribution);
  assertAmount('startingBalance', startingBalance);
  assertRate('escalation', escalation);
  assertRate('annualReturn', annualReturn);
  assertRate('inflation', inflation);
  assertWholeNumber('years', years, MAX_YEARS);

  const monthlyRate = (1 + annualReturn) ** (1 / MONTHS_PER_YEAR) - 1;
  const start: RaYear = {
    year: 0,
    contributions: 0,
    growth: 0,
    nominal: startingBalance,
    real: startingBalance,
  };
  const series: RaYear[] = [start];

  // Two balances so the two-pot split is exact: new money, and the opening balance (vested).
  let contributionBalance = 0;
  let vested = startingBalance;
  let contributions = 0;
  for (let year = 0; year < years; year++) {
    const payment = monthlyContribution * (1 + escalation) ** year;
    for (let month = 0; month < MONTHS_PER_YEAR; month++) {
      contributionBalance = contributionBalance * (1 + monthlyRate) + payment;
      vested *= 1 + monthlyRate;
      contributions += payment;
    }
    const nominal = contributionBalance + vested;
    series.push({
      year: year + 1,
      contributions,
      growth: nominal - startingBalance - contributions,
      nominal,
      real: nominal / (1 + inflation) ** (year + 1),
    });
  }

  return {
    monthlyRate,
    series,
    final: series[series.length - 1] ?? start,
    twoPot: {
      savingsContributions: contributions * rules.savingsShare,
      retirementContributions: contributions * rules.retirementShare,
      savingsPot: contributionBalance * rules.savingsShare,
      retirementPot: contributionBalance * rules.retirementShare,
      vestedPot: vested,
    },
  };
}

export interface RaInput {
  readonly salary: RaSalary;
  /** The EXTRA contribution being explored, rands a month. */
  readonly contributionMonthly: number;
  readonly escalation: number;
  readonly startingBalance: number;
  readonly annualReturn: number;
  readonly inflation: number;
  /** The age asked for; the projection uses `ages.retirementAge`. */
  readonly retirementAge: number;
}

export interface RaResult {
  readonly headroom: RaHeadroom;
  readonly taxSaving: RaTaxSaving;
  readonly ages: RaRetirementAges;
  readonly projection: RaProjection;
}

/** Headroom, tax saving, retirement ages and the projection for one set of RA choices. */
export function raCalculator(input: RaInput, tables: TaxTables, rules: RaRules): RaResult {
  const ages = raRetirementAges(input.salary.age, input.retirementAge, rules);
  return {
    headroom: raHeadroom(input.salary, tables),
    taxSaving: raTaxSaving(input.salary, input.contributionMonthly, tables),
    ages,
    projection: raProjection(
      {
        monthlyContribution: input.contributionMonthly,
        escalation: input.escalation,
        startingBalance: input.startingBalance,
        annualReturn: input.annualReturn,
        inflation: input.inflation,
        years: ages.years,
      },
      rules,
    ),
  };
}

function assertSalary(salary: RaSalary): void {
  assertAmount('grossMonthly', salary.grossMonthly);
  assertWholeNumber('age', salary.age, MAX_AGE);
  assertWholeNumber('medicalMembers', salary.medicalMembers ?? 0);
  assertAmount('employeeRetirementMonthly', salary.employeeRetirementMonthly ?? 0);
  assertAmount('employerRetirementMonthly', salary.employerRetirementMonthly ?? 0);
}

/** Throws a RangeError naming the field unless `value` is a finite rate from 0 to 1 (a fraction). */
function assertRate(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a rate from 0 to 1, got ${value}`);
  }
}
