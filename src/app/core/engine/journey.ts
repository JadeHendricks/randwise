import type { TaxYearData } from '../data/tax-year.schema';
import { MONTHS_PER_YEAR, assertAmount, assertWholeNumber, roundRand } from './money';
import { raProjection, raRetirementAges, raTaxSaving, toRaRules } from './ra';
import type { RaProjection, RaRetirementAges, RaRules, RaSalary } from './ra';
import type { TaxTables } from './tax-tables';
import { tfsaContribution, toTfsaRules } from './tfsa';
import type { TfsaRules } from './tfsa';

/**
 * Journey engine: a year-by-year view of an RA contribution, the tax it saves and where that saving
 * goes (a TFSA), up to the retirement age. Rands, full precision, pure; callers round for display.
 *
 * Timing convention:
 * - Row `year` 1..n is a tax year; `age = currentAge + year − 1`. Income, payroll retirement
 *   contributions and the RA contribution rise once a year, at the start of each year after the first.
 * - RA balances come from ONE `raProjection` over the whole journey: its payments
 *   `contribution × (1 + escalation)^y` are exactly the journey's RA contributions.
 * - TFSA: each year is a one-year `raProjection` step (monthly top-up paid at the end of each month,
 *   from the opening balance). In 'refund' mode the tax saving arrives as a refund on assessment, a
 *   lump at the END of the year it relates to, counted against THAT year's TFSA limit. In 'paye' mode
 *   the saving arrives as lower PAYE spread over the 12 months, so it goes in monthly with the top-up.
 * - Within a year's TFSA limit the top-up goes in before the refund.
 *
 * Simplifications:
 * - Future years use this year's tables (brackets, rebates, s11F cap, TFSA limits). With income
 *   escalation that is bracket creep, so later tax savings are on the high side.
 * - A non-deductible RA excess is reported per year and not carried into later years' deduction.
 * - Without `allowOverContribution` the TFSA excess is not invested: the refund part of it is the
 *   `unallocatedRefund` and `tfsaPenalty` is the exposure (what SARS would charge if it went in).
 *   With it, everything goes in and the penalty is incurred (a tax cost, not taken from the TFSA).
 */

export type RefundMode = 'refund' | 'paye';

/** The RA and TFSA rules a journey needs from the tax-year file. */
export interface JourneyRules
  extends Pick<RaRules, 'savingsShare' | 'retirementShare' | 'earliestRetirementAge'>,
    TfsaRules {}

/** Reads the journey rules from a tax-year file already accepted by `validateTaxYearFile`. */
export function toJourneyRules(file: TaxYearData): JourneyRules {
  const { savingsShare, retirementShare, earliestRetirementAge } = toRaRules(file);
  return { savingsShare, retirementShare, earliestRetirementAge, ...toTfsaRules(file) };
}

/** Rates are fractions (0.05 means 5%), effective per year. Rands a month unless stated. */
export interface JourneyInput {
  /** Today's salary: year 1. */
  readonly salary: RaSalary;
  readonly retirementAge: number;
  /** Yearly rise in income and payroll retirement contributions. */
  readonly incomeEscalation: number;
  /** The EXTRA RA contribution in year 1. */
  readonly contributionMonthly: number;
  /** Yearly rise in the RA contribution. */
  readonly escalation: number;
  /** Rands in the RA today. */
  readonly startingBalance: number;
  /** Rands in the TFSA today. */
  readonly tfsaBalance: number;
  /** TFSA contributions already made in earlier years (growth excluded). */
  readonly tfsaLifetimeUsed: number;
  /** Flat monthly TFSA top-up from take-home pay. */
  readonly tfsaTopUpMonthly: number;
  readonly raReturn: number;
  readonly tfsaReturn: number;
  readonly inflation: number;
  readonly refundMode: RefundMode;
  readonly allowOverContribution: boolean;
}

/** One tax year. Annual rands unless the name ends in Monthly; balances are at the year's end. */
export interface JourneyYear {
  readonly year: number;
  readonly age: number;
  readonly grossMonthly: number;
  readonly grossAnnual: number;
  readonly raContribution: number;
  readonly raDeductible: number;
  readonly raNonDeductible: number;
  /** `raTaxSaving(...).saving` for that year. */
  readonly taxSaving: number;
  /** The top-up wanted this year. */
  readonly tfsaTopUp: number;
  /** What went into the TFSA this year. */
  readonly tfsaContribution: number;
  readonly tfsaExcess: number;
  readonly tfsaPenalty: number;
  /** Tax saving that did not fit under the TFSA limit (0 when over-contribution is allowed). */
  readonly unallocatedRefund: number;
  readonly tfsaBalance: number;
  readonly tfsaBalanceReal: number;
  readonly raBalance: number;
  readonly raBalanceReal: number;
  readonly cumulativeTaxSaved: number;
  /** tfsaLifetimeUsed plus everything invested so far. */
  readonly lifetimeContributions: number;
  readonly headroomFullyUsed: boolean;
  readonly annualCapHit: boolean;
  readonly lifetimeCapReached: boolean;
}

export type JourneyMilestoneKind =
  | 'start'
  | 'headroom-used'
  | 'tfsa-annual-cap'
  | 'tfsa-lifetime-cap'
  | 'retirement';

export interface JourneyMilestone {
  readonly kind: JourneyMilestoneKind;
  readonly year: number;
  readonly age: number;
}

export interface JourneyTotals {
  readonly taxSaved: number;
  readonly raContributions: number;
  readonly raNonDeductible: number;
  readonly tfsaContributions: number;
  readonly tfsaExcess: number;
  readonly penalty: number;
  /** True when over-contribution is allowed and a penalty is due. */
  readonly penaltyIncurred: boolean;
  readonly unallocatedRefund: number;
}

export interface JourneyResult {
  readonly ages: RaRetirementAges;
  readonly years: readonly JourneyYear[];
  readonly ra: RaProjection;
  readonly totals: JourneyTotals;
  readonly final: {
    readonly raBalance: number;
    readonly raReal: number;
    readonly tfsaBalance: number;
    readonly tfsaReal: number;
  };
  /** Sorted by year, then in the order of `JourneyMilestoneKind`. */
  readonly milestones: readonly JourneyMilestone[];
  /** Final lifetime contributions as a share of the lifetime limit, 0 to 100. */
  readonly lifetimePercent: number;
}

const MILESTONE_ORDER: readonly JourneyMilestoneKind[] = [
  'start',
  'headroom-used',
  'tfsa-annual-cap',
  'tfsa-lifetime-cap',
  'retirement',
];

/**
 * Year-by-year RA contribution, tax saving and TFSA growth to the retirement age (see the module
 * comment for the timing convention). All tax maths comes from `raTaxSaving` and `tfsaContribution`;
 * all growth from `raProjection`.
 * Sources: s11F https://www.sars.gov.za/faq/faq-what-are-s11f-annual-allowable-deductions/ and TFSA
 * https://www.sars.gov.za/types-of-tax/personal-income-tax/tax-free-investments/
 */
export function journey(input: JourneyInput, tables: TaxTables, rules: JourneyRules): JourneyResult {
  assertInput(input);
  const { salary } = input;
  const ages = raRetirementAges(salary.age, input.retirementAge, rules);
  const ra = raProjection(
    {
      monthlyContribution: input.contributionMonthly,
      escalation: input.escalation,
      startingBalance: input.startingBalance,
      annualReturn: input.raReturn,
      inflation: input.inflation,
      years: ages.years,
    },
    rules,
  );

  const topUpAnnual = input.tfsaTopUpMonthly * MONTHS_PER_YEAR;
  const years: JourneyYear[] = [];
  let tfsa = input.tfsaBalance;
  let lifetimeUsed = input.tfsaLifetimeUsed;
  let cumulativeTaxSaved = 0;

  for (let y = 0; y < ages.years; y++) {
    const g = (1 + input.incomeEscalation) ** y;
    // Why: payroll retirement contributions are a share of pay, so they rise with the income.
    const salaryY: RaSalary = {
      grossMonthly: salary.grossMonthly * g,
      age: salary.age + y,
      medicalMembers: salary.medicalMembers,
      employeeRetirementMonthly: (salary.employeeRetirementMonthly ?? 0) * g,
      employerRetirementMonthly: (salary.employerRetirementMonthly ?? 0) * g,
    };
    // Same payment raProjection uses for this year.
    const raMonthly = input.contributionMonthly * (1 + input.escalation) ** y;
    const ts = raTaxSaving(salaryY, raMonthly, tables);
    const c = tfsaContribution({ desired: topUpAnnual + ts.saving, lifetimeUsed }, rules);

    const invested = input.allowOverContribution ? c.desired : c.allowed;
    // Top-up first, then the refund (decision 13).
    const topUpIn = Math.min(topUpAnnual, invested);
    const refundIn = invested - topUpIn;
    const unallocatedRefund = input.allowOverContribution ? 0 : ts.saving - refundIn;
    const [monthly, lump] =
      input.refundMode === 'refund'
        ? [topUpIn / MONTHS_PER_YEAR, refundIn]
        : [invested / MONTHS_PER_YEAR, 0];
    // One-year step: the monthly money grows with the opening balance; the refund lands at year end.
    tfsa =
      raProjection(
        {
          monthlyContribution: monthly,
          escalation: 0,
          startingBalance: tfsa,
          annualReturn: input.tfsaReturn,
          inflation: 0,
          years: 1,
        },
        rules,
      ).final.nominal + lump;
    lifetimeUsed += invested;
    cumulativeTaxSaved += ts.saving;

    const raYear = ra.series[y + 1];
    const raBalance = raYear?.nominal ?? 0;
    years.push({
      year: y + 1,
      age: salaryY.age,
      grossMonthly: salaryY.grossMonthly,
      grossAnnual: salaryY.grossMonthly * MONTHS_PER_YEAR,
      raContribution: ts.contribution,
      raDeductible: ts.deductible,
      raNonDeductible: ts.contribution - ts.deductible,
      taxSaving: ts.saving,
      tfsaTopUp: topUpAnnual,
      tfsaContribution: invested,
      tfsaExcess: c.excess,
      tfsaPenalty: c.penalty,
      unallocatedRefund,
      tfsaBalance: tfsa,
      tfsaBalanceReal: tfsa / (1 + input.inflation) ** (y + 1),
      raBalance,
      raBalanceReal: raYear?.real ?? 0,
      cumulativeTaxSaved,
      lifetimeContributions: lifetimeUsed,
      headroomFullyUsed: raMonthly > 0 && roundRand(ts.remainingHeadroom) === 0,
      annualCapHit: roundRand(c.allowed) >= rules.annualLimit,
      lifetimeCapReached: roundRand(lifetimeUsed) >= rules.lifetimeLimit,
    });
  }

  const totals = sumTotals(years, input.allowOverContribution);
  return {
    ages,
    years,
    ra,
    totals,
    final: {
      raBalance: ra.final.nominal,
      raReal: ra.final.real,
      tfsaBalance: tfsa,
      tfsaReal: tfsa / (1 + input.inflation) ** ages.years,
    },
    milestones: milestones(years, salary.age, ages),
    lifetimePercent:
      rules.lifetimeLimit > 0
        ? Math.min(100, Math.max(0, (lifetimeUsed / rules.lifetimeLimit) * 100))
        : 0,
  };
}

function sumTotals(years: readonly JourneyYear[], allowOver: boolean): JourneyTotals {
  const sum = (pick: (y: JourneyYear) => number) => years.reduce((acc, y) => acc + pick(y), 0);
  const penalty = sum((y) => y.tfsaPenalty);
  return {
    taxSaved: sum((y) => y.taxSaving),
    raContributions: sum((y) => y.raContribution),
    raNonDeductible: sum((y) => y.raNonDeductible),
    tfsaContributions: sum((y) => y.tfsaContribution),
    tfsaExcess: sum((y) => y.tfsaExcess),
    penalty,
    penaltyIncurred: allowOver && roundRand(penalty) > 0,
    unallocatedRefund: sum((y) => y.unallocatedRefund),
  };
}

function milestones(
  years: readonly JourneyYear[],
  currentAge: number,
  ages: RaRetirementAges,
): JourneyMilestone[] {
  const list: JourneyMilestone[] = [{ kind: 'start', year: 0, age: currentAge }];
  const first = (kind: JourneyMilestoneKind, hit: (y: JourneyYear) => boolean) => {
    const row = years.find(hit);
    if (row) list.push({ kind, year: row.year, age: row.age });
  };
  first('headroom-used', (y) => y.headroomFullyUsed);
  first('tfsa-annual-cap', (y) => y.annualCapHit);
  first('tfsa-lifetime-cap', (y) => y.lifetimeCapReached);
  list.push({ kind: 'retirement', year: ages.years, age: ages.retirementAge });
  return list.sort(
    (a, b) => a.year - b.year || MILESTONE_ORDER.indexOf(a.kind) - MILESTONE_ORDER.indexOf(b.kind),
  );
}

function assertInput(input: JourneyInput): void {
  const { salary } = input;
  // Checked up front so a journey with no years left still rejects bad input.
  assertAmount('grossMonthly', salary.grossMonthly);
  assertWholeNumber('age', salary.age);
  assertWholeNumber('medicalMembers', salary.medicalMembers ?? 0);
  assertAmount('employeeRetirementMonthly', salary.employeeRetirementMonthly ?? 0);
  assertAmount('employerRetirementMonthly', salary.employerRetirementMonthly ?? 0);
  assertAmount('contributionMonthly', input.contributionMonthly);
  assertAmount('startingBalance', input.startingBalance);
  assertAmount('tfsaBalance', input.tfsaBalance);
  assertAmount('tfsaLifetimeUsed', input.tfsaLifetimeUsed);
  assertAmount('tfsaTopUpMonthly', input.tfsaTopUpMonthly);
  assertRate('incomeEscalation', input.incomeEscalation);
  assertRate('escalation', input.escalation);
  assertRate('raReturn', input.raReturn);
  assertRate('tfsaReturn', input.tfsaReturn);
  assertRate('inflation', input.inflation);
  if (input.refundMode !== 'refund' && input.refundMode !== 'paye') {
    throw new RangeError(`refundMode must be 'refund' or 'paye', got ${String(input.refundMode)}`);
  }
}

/** Throws a RangeError naming the field unless `value` is a finite rate from 0 to 1 (a fraction). */
function assertRate(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a rate from 0 to 1, got ${value}`);
  }
}
