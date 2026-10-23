import type { TaxYearData } from '../data/tax-year.schema';
import { findBracket, incomeTax } from './income-tax';
import { medicalCredit } from './medical-credit';
import { MONTHS_PER_YEAR, assertAmount, assertWholeNumber } from './money';
import {
  type RaProjection,
  type RaProjectionInput,
  type RaRules,
  type RaSalary,
  type RaTaxSaving,
  MAX_RA_RETIREMENT_AGE,
  raProjection,
  raTaxSaving,
} from './ra';
import { rebates } from './rebates';
import type { TaxBracket, TaxTables } from './tax-tables';

/**
 * Retire at 55 engine: the income a goal needs, the capital that buys it, the lump sum, the
 * contribution or return that gets there, and a year-by-year retirement phase.
 *
 * Everything here is full precision and pure; callers round with `roundRand` only for display.
 * All accumulation goes through `raProjection`, so the RA page and this one can never disagree.
 *
 * Why un-indexed tables: future income is taxed with THIS year's brackets and rebates on the
 * inflated nominal income. Real brackets usually rise over time, so this overstates the tax (a
 * conservative answer). The retirement phase uses the same tables so its first year reproduces the
 * goal exactly.
 * Source: https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
 */

/** The age the retirement phase is modelled to. A product choice, not a tax rule. */
export const RETIRE_HORIZON_AGE = 100;
export const MAX_RETIRE_HORIZON_AGE = 120;

/**
 * Why: at retirement up to one-third of an RA may be taken as a cash lump sum; the rest must buy an
 * annuity (here a living annuity).
 * Sources: https://www.sars.gov.za/tax-rates/income-tax/retirement-lump-sum-benefits/ and
 * https://www.sars.gov.za/latest-news/tax-directives-legislative-changes-and-system-enhancements/
 */
export const MAX_COMMUTATION_SHARE = 1 / 3;

const MAX_AGE = 130;
const MAX_YEARS = 100;
/** Bisection limits. Wide enough for any realistic plan; beyond them the answer is "unreachable". */
const MAX_GROSS_ANNUAL = 1e11;
const GROSS_TOLERANCE = 0.0001;
const MAX_ITERATIONS = 200;
const CONTRIBUTION_START = 1_000;
const MAX_CONTRIBUTION_MONTHLY = 1e9;
const CONTRIBUTION_TOLERANCE = 1e-6;
const RETURN_TOLERANCE = 1e-10;
/** Float noise allowed on drawdown limits so 2.5 / 100 and 17.5 / 100 are accepted. */
const RATE_EPSILON = 1e-9;
/** Float noise allowed before the money is treated as run out. */
const BALANCE_EPSILON = 1e-6;

/** The retirement rules that live in the tax-year file but not in `TaxTables`. */
export interface RetireRules extends Pick<
  RaRules,
  'savingsShare' | 'retirementShare' | 'earliestRetirementAge'
> {
  /** Lowest living-annuity drawdown, a fraction of the capital a year. */
  readonly drawdownMin: number;
  /** Highest living-annuity drawdown. */
  readonly drawdownMax: number;
  /** Rands: a total at or below this may be taken entirely in cash. */
  readonly annuitisationDeMinimis: number;
  /** Retirement lump-sum tax table (cumulative over a lifetime). */
  readonly lumpSumTable: readonly TaxBracket[];
}

/**
 * Reads the retirement rules from a tax-year file already accepted by `validateTaxYearFile` (not
 * re-checked). Copies every row so the rules never alias the file.
 * Why a separate function: `TaxTables` is pinned by tax-tables.spec (same reason as `toRaRules`).
 */
export function toRetireRules(file: TaxYearData): RetireRules {
  const { savingsShare, retirementShare } = file.twoPot.value;
  const { minRate, maxRate } = file.livingAnnuityDrawdown.value;
  return {
    savingsShare,
    retirementShare,
    earliestRetirementAge: file.earliestRaRetirementAge.value,
    drawdownMin: minRate,
    drawdownMax: maxRate,
    annuitisationDeMinimis: file.annuitisationDeMinimis.value,
    lumpSumTable: file.retirementLumpSum.value.map(({ above, upTo, base, rate }) => ({
      above,
      upTo,
      base,
      rate,
    })),
  };
}

/** amountToday × (1 + inflation)^years; inflation 0..1, years whole 0..100. */
export function inflateToRetirement(amountToday: number, inflation: number, years: number): number {
  assertAmount('amountToday', amountToday);
  assertRate('inflation', inflation);
  assertWholeNumber('years', years, MAX_YEARS);
  return amountToday * (1 + inflation) ** years;
}

/**
 * Annual tax on living-annuity income at `age`: tax − rebates(age), floored at 0, then the s6A
 * medical credit, capped at the tax left.
 * Why no UIF: annuity income is not remuneration for UIF. Why no s11F: nothing is contributed in
 * retirement. Rebates follow the age, so the 65 and 75 step-ups lower the tax later on.
 * Sources: https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/ and
 * https://www.sars.gov.za/tax-rates/medical-tax-credit-rates/
 */
export function annuityIncomeTax(
  grossAnnual: number,
  age: number,
  tables: TaxTables,
  medicalMembers = 0,
): number {
  assertAmount('grossAnnual', grossAnnual);
  const afterRebates = Math.max(0, incomeTax(grossAnnual, tables) - rebates(age, tables));
  return afterRebates - Math.min(afterRebates, medicalCredit(medicalMembers, tables));
}

export interface AnnuityIncome {
  readonly age: number;
  readonly grossAnnual: number;
  readonly taxAnnual: number;
  readonly netAnnual: number;
  readonly grossMonthly: number;
  readonly taxMonthly: number;
  readonly netMonthly: number;
}

/**
 * Gross annual annuity income whose net (after `annuityIncomeTax`) meets `netAnnual`.
 * Why bisection: net = G − tax(G) rises strictly with G (the top marginal rate is 45%), so the
 * answer is unique. Returns the high side, so the net is never short. `grossFromNet` is not used:
 * it works on payslips and applies UIF.
 */
export function grossAnnuityFromNet(
  netAnnual: number,
  age: number,
  tables: TaxTables,
  medicalMembers = 0,
): AnnuityIncome {
  assertAmount('netAnnual', netAnnual);
  const netOf = (gross: number): number =>
    gross - annuityIncomeTax(gross, age, tables, medicalMembers);

  if (netOf(netAnnual) >= netAnnual) return annuityIncome(netAnnual, age, tables, medicalMembers);

  let lo = netAnnual;
  let hi = Math.max(1, 2 * netAnnual);
  while (netOf(hi) < netAnnual) {
    if (hi >= MAX_GROSS_ANNUAL) {
      throw new RangeError(`netAnnual ${netAnnual} needs more than R${MAX_GROSS_ANNUAL} a year`);
    }
    lo = hi;
    hi = Math.min(hi * 2, MAX_GROSS_ANNUAL);
  }
  for (let i = 0; i < MAX_ITERATIONS && hi - lo > GROSS_TOLERANCE; i++) {
    const mid = (lo + hi) / 2;
    if (netOf(mid) >= netAnnual) hi = mid;
    else lo = mid;
  }
  return annuityIncome(hi, age, tables, medicalMembers);
}

function annuityIncome(
  grossAnnual: number,
  age: number,
  tables: TaxTables,
  medicalMembers: number,
): AnnuityIncome {
  const taxAnnual = annuityIncomeTax(grossAnnual, age, tables, medicalMembers);
  const netAnnual = grossAnnual - taxAnnual;
  return {
    age,
    grossAnnual,
    taxAnnual,
    netAnnual,
    grossMonthly: grossAnnual / MONTHS_PER_YEAR,
    taxMonthly: taxAnnual / MONTHS_PER_YEAR,
    netMonthly: netAnnual / MONTHS_PER_YEAR,
  };
}

export type DrawdownIssue = 'drawdown-too-low' | 'drawdown-too-high';

/**
 * Whether a living-annuity drawdown rate is inside the range in the data (inclusive).
 * Why: a living annuity must pay between 2.5% and 17.5% of its value each year.
 * Source: https://www.gov.za/sites/default/files/gcis_document/201409/32005290.pdf
 */
export function drawdownIssue(
  rate: number,
  rules: Pick<RetireRules, 'drawdownMin' | 'drawdownMax'>,
): DrawdownIssue | null {
  if (!Number.isFinite(rate)) throw new RangeError(`drawdownRate must be finite, got ${rate}`);
  if (rate < rules.drawdownMin - RATE_EPSILON) return 'drawdown-too-low';
  if (rate > rules.drawdownMax + RATE_EPSILON) return 'drawdown-too-high';
  return null;
}

/** Living-annuity capital that pays `grossAnnualIncome` at `drawdownRate`: income / rate. */
export function livingAnnuityCapital(
  grossAnnualIncome: number,
  drawdownRate: number,
  rules: Pick<RetireRules, 'drawdownMin' | 'drawdownMax'>,
): number {
  assertAmount('grossAnnualIncome', grossAnnualIncome);
  const issue = drawdownIssue(drawdownRate, rules);
  if (issue) throw new RangeError(`drawdownRate ${drawdownRate}: ${issue}`);
  return grossAnnualIncome / drawdownRate;
}

/**
 * Tax on a retirement lump sum: base + rate × (lump − bracket floor), with `findBracket`'s
 * (above, upTo] convention.
 * Why single lump sum: the table is cumulative over a lifetime, so earlier retirement or
 * withdrawal lump sums would push this one into higher bands. None are assumed.
 * Source: https://www.sars.gov.za/tax-rates/income-tax/retirement-lump-sum-benefits/
 */
export function retirementLumpSumTax(lumpSum: number, table: readonly TaxBracket[]): number {
  assertAmount('lumpSum', lumpSum);
  const row = findBracket(lumpSum, table);
  return row.base + row.rate * (lumpSum - row.above);
}

export interface LumpSum {
  readonly gross: number;
  readonly tax: number;
  readonly net: number;
}

export interface RetireCapital {
  readonly takeLumpSum: boolean;
  /** RA value at retirement. */
  readonly total: number;
  /** All 0 without a lump sum. */
  readonly lumpSum: LumpSum;
  /** total − lumpSum.gross: buys the living annuity. */
  readonly annuityCapital: number;
  /** 0 < total <= de minimis: the whole RA may be taken in cash. A note only. */
  readonly wholeMayBeCommuted: boolean;
}

/**
 * Splits a total RA value: lump = total × 1/3 when `takeLumpSum`, else 0; the rest buys the annuity.
 * The only place the split happens.
 * Why "does not exceed": the Act lets the whole value be commuted when it does not exceed the de
 * minimis (R360 000), so exactly R360 000 qualifies. The plan still annuitises two-thirds.
 * Two-pot simplification: the one-third rule is applied to the whole value (no separate savings
 * pot withdrawal is modelled).
 * Sources: https://www.sars.gov.za/latest-news/tax-directives-legislative-changes-and-system-enhancements/
 * and https://www.sars.gov.za/latest-news/tax-directives-enhancements-and-tax-implications-of-the-two-pot-retirement-system/
 */
export function commuteOneThird(
  total: number,
  takeLumpSum: boolean,
  rules: Pick<RetireRules, 'annuitisationDeMinimis' | 'lumpSumTable'>,
): RetireCapital {
  assertAmount('total', total);
  const gross = takeLumpSum ? total * MAX_COMMUTATION_SHARE : 0;
  const tax = takeLumpSum ? retirementLumpSumTax(gross, rules.lumpSumTable) : 0;
  return {
    takeLumpSum,
    total,
    lumpSum: { gross, tax, net: gross - tax },
    annuityCapital: total - gross,
    wholeMayBeCommuted: total > 0 && total <= rules.annuitisationDeMinimis,
  };
}

/**
 * The RA value needed at retirement so `annuityCapital` is left for the annuity: total =
 * annuityCapital × 3/2 with a lump sum (else annuityCapital), split by `commuteOneThird`.
 */
export function capitalAtRetirement(
  annuityCapital: number,
  takeLumpSum: boolean,
  rules: Pick<RetireRules, 'annuitisationDeMinimis' | 'lumpSumTable'>,
): RetireCapital {
  assertAmount('annuityCapital', annuityCapital);
  // 3/2 = 1 / (1 − MAX_COMMUTATION_SHARE), written exactly so round totals stay round (e.g. the
  // R360 000 de minimis edge).
  const total = takeLumpSum ? annuityCapital * (3 / 2) : annuityCapital;
  return commuteOneThird(total, takeLumpSum, rules);
}

/**
 * Smallest first-year monthly contribution with raProjection's final.nominal >= target; 0 when the
 * starting balance alone gets there. Bisection over raProjection (no compounding of its own).
 */
export function requiredMonthlyContribution(
  target: number,
  plan: Omit<RaProjectionInput, 'monthlyContribution' | 'inflation'>,
  rules: Pick<RaRules, 'savingsShare' | 'retirementShare'>,
): number {
  assertAmount('target', target);
  assertSolverYears(plan.years);
  const finalAt = (monthlyContribution: number): number =>
    raProjection({ ...plan, monthlyContribution, inflation: 0 }, rules).final.nominal;

  if (finalAt(0) >= target) return 0;
  let lo = 0;
  let hi = CONTRIBUTION_START;
  while (finalAt(hi) < target) {
    if (hi >= MAX_CONTRIBUTION_MONTHLY) {
      throw new RangeError(`target ${target} needs more than R${MAX_CONTRIBUTION_MONTHLY} a month`);
    }
    lo = hi;
    hi = Math.min(hi * 2, MAX_CONTRIBUTION_MONTHLY);
  }
  for (let i = 0; i < MAX_ITERATIONS && hi - lo > CONTRIBUTION_TOLERANCE; i++) {
    const mid = (lo + hi) / 2;
    if (finalAt(mid) >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Smallest annual return in [0, 1] (raProjection's range) with final.nominal >= target; 0 when it is
 * reached with no growth. RangeError when even 100% a year falls short.
 */
export function requiredAnnualReturn(
  target: number,
  plan: Omit<RaProjectionInput, 'annualReturn' | 'inflation'>,
  rules: Pick<RaRules, 'savingsShare' | 'retirementShare'>,
): number {
  assertAmount('target', target);
  assertSolverYears(plan.years);
  const finalAt = (annualReturn: number): number =>
    raProjection({ ...plan, annualReturn, inflation: 0 }, rules).final.nominal;

  if (finalAt(0) >= target) return 0;
  if (finalAt(1) < target) {
    throw new RangeError(`target ${target} is out of reach even at a 100% return`);
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < MAX_ITERATIONS && hi - lo > RETURN_TOLERANCE; i++) {
    const mid = (lo + hi) / 2;
    if (finalAt(mid) >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** What a monthly RA contribution costs after the tax it saves: raTaxSaving(...).netCostMonthly. */
export function netCostOfContribution(
  salary: RaSalary,
  contributionMonthly: number,
  tables: TaxTables,
): number {
  return raTaxSaving(salary, contributionMonthly, tables).netCostMonthly;
}

export interface DrawdownInput {
  /** Nominal at retirement (the annuity capital). */
  readonly capital: number;
  /** Gross, nominal, paid at the start of year 0. */
  readonly firstYearIncome: number;
  /** The income rises by this each year. */
  readonly inflation: number;
  /** Growth in retirement. */
  readonly annualReturn: number;
  readonly retirementAge: number;
  /** Default 100; above retirementAge, at most 120. */
  readonly horizonAge?: number;
  /** rules.drawdownMax. */
  readonly maxRate: number;
  /** For today's money. */
  readonly yearsBeforeRetirement: number;
  readonly medicalMembers?: number;
}

export interface DrawdownYear {
  readonly age: number;
  /** Start of year, before the income, nominal. */
  readonly balance: number;
  /** Gross paid this year (0 on the horizon row and after running out). */
  readonly income: number;
  /** annuityIncomeTax(income, age, tables, medicalMembers). */
  readonly tax: number;
  readonly net: number;
  /** balance / (1 + inflation)^(yearsBeforeRetirement + t). */
  readonly real: number;
}

export interface DrawdownResult {
  /** horizonAge − retirementAge + 1 rows. */
  readonly series: readonly DrawdownYear[];
  /** null = lasts to the horizon. */
  readonly runsOutAge: number | null;
  /** First age, before running out, where the income is more than maxRate of the balance. */
  readonly maxRateExceededAge: number | null;
  readonly horizonAge: number;
}

/**
 * The retirement phase, a year at a time.
 * Stepping: the income is paid at the START of each year (annuity-due) and rises with inflation;
 * what is left grows at `annualReturn`. When the balance cannot pay the year's income, that year
 * pays what is left and later years pay nothing. Depletion runs on the GROSS income.
 * Why tax every year: rebates follow the age that year (secondary from 65, tertiary from 75), so the
 * tax falls and the net rises at those ages.
 * Why maxRateExceededAge: a real living annuity cannot pay more than the maximum drawdown, so from
 * that age the income would have to drop.
 * Sources: https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/ and
 * https://www.gov.za/sites/default/files/gcis_document/201409/32005290.pdf
 */
export function simulateDrawdown(input: DrawdownInput, tables: TaxTables): DrawdownResult {
  const {
    capital,
    firstYearIncome,
    inflation,
    annualReturn,
    retirementAge,
    horizonAge = RETIRE_HORIZON_AGE,
    maxRate,
    yearsBeforeRetirement,
    medicalMembers = 0,
  } = input;
  assertAmount('capital', capital);
  assertAmount('firstYearIncome', firstYearIncome);
  assertRate('inflation', inflation);
  assertRate('annualReturn', annualReturn);
  assertRate('maxRate', maxRate);
  assertWholeNumber('retirementAge', retirementAge, MAX_RETIRE_HORIZON_AGE);
  assertWholeNumber('horizonAge', horizonAge, MAX_RETIRE_HORIZON_AGE);
  assertWholeNumber('yearsBeforeRetirement', yearsBeforeRetirement, MAX_YEARS);
  assertWholeNumber('medicalMembers', medicalMembers);
  if (horizonAge <= retirementAge) {
    throw new RangeError(`horizonAge ${horizonAge} must be above retirementAge ${retirementAge}`);
  }

  const series: DrawdownYear[] = [];
  let runsOutAge: number | null = null;
  let maxRateExceededAge: number | null = null;
  let balance = capital;
  for (let t = 0; t <= horizonAge - retirementAge; t++) {
    const age = retirementAge + t;
    const due = age < horizonAge ? firstYearIncome * (1 + inflation) ** t : 0;
    let income: number;
    if (runsOutAge !== null) {
      income = 0;
    } else if (balance < due - BALANCE_EPSILON) {
      runsOutAge = age;
      income = balance;
    } else {
      income = due;
      if (maxRateExceededAge === null && due > maxRate * balance + RATE_EPSILON) {
        maxRateExceededAge = age;
      }
    }
    const tax = annuityIncomeTax(income, age, tables, medicalMembers);
    series.push({
      age,
      balance,
      income,
      tax,
      net: income - tax,
      real: balance / (1 + inflation) ** (yearsBeforeRetirement + t),
    });
    balance = Math.max(0, balance - income) * (1 + annualReturn);
  }
  return { series, runsOutAge, maxRateExceededAge, horizonAge };
}

export interface RetireInput {
  /** salary.age is the current age; medicalMembers is also used in retirement. */
  readonly salary: RaSalary;
  readonly goalNetMonthlyToday: number;
  readonly retirementAge: number;
  readonly inflation: number;
  readonly returnBeforeRetirement: number;
  readonly returnInRetirement: number;
  readonly drawdownRate: number;
  readonly takeLumpSum: boolean;
  readonly startingBalance: number;
  /** The current contribution, rands a month. */
  readonly monthlyContribution: number;
  readonly escalation: number;
  readonly horizonAge?: number;
}

export type RetireIssue =
  | 'retirement-age-too-early'
  | 'retirement-age-too-late'
  | 'already-at-retirement-age'
  | DrawdownIssue;

/**
 * Every reason a plan cannot be worked out, in this order: before the earliest RA retirement age
 * (from the data), after the product cap of 80, already at or past the retirement age, drawdown
 * outside the range.
 */
export function retireIssues(
  input: Pick<RetireInput, 'salary' | 'retirementAge' | 'drawdownRate'>,
  rules: RetireRules,
): RetireIssue[] {
  assertWholeNumber('age', input.salary.age, MAX_AGE);
  assertWholeNumber('retirementAge', input.retirementAge, MAX_AGE);
  const issues: RetireIssue[] = [];
  if (input.retirementAge < rules.earliestRetirementAge) issues.push('retirement-age-too-early');
  if (input.retirementAge > MAX_RA_RETIREMENT_AGE) issues.push('retirement-age-too-late');
  if (input.salary.age >= input.retirementAge) issues.push('already-at-retirement-age');
  const drawdown = drawdownIssue(input.drawdownRate, rules);
  if (drawdown) issues.push(drawdown);
  return issues;
}

export interface RetireResult {
  readonly currentAge: number;
  readonly retirementAge: number;
  readonly years: number;
  /** (1 + inflation)^years. */
  readonly inflationFactor: number;
  readonly goal: {
    readonly todayMonthly: number;
    readonly nominalMonthly: number;
    readonly nominalAnnual: number;
  };
  /** First year, at retirementAge, nominal. */
  readonly income: AnnuityIncome;
  /** Required, nominal at retirement. */
  readonly capital: RetireCapital;
  /** capital.total / inflationFactor. */
  readonly capitalToday: number;
  readonly requiredContribution: {
    readonly monthly: number;
    readonly taxSaving: RaTaxSaving;
    readonly netCostMonthly: number;
  };
  readonly requiredReturn: {
    readonly status: 'solved' | 'already-funded' | 'unreachable';
    readonly rate: number | null;
  };
  readonly current: {
    /** Current contribution at returnBeforeRetirement. */
    readonly projection: RaProjection;
    /** commuteOneThird(projection.final.nominal, takeLumpSum). */
    readonly capital: RetireCapital;
    readonly taxSaving: RaTaxSaving;
    readonly netCostMonthly: number;
    /** Projected − required total: + surplus, − shortfall. */
    readonly gapNominal: number;
    readonly gapToday: number;
    /** projected / required × 100 (100 when required is 0); may exceed 100. */
    readonly fundedPercent: number;
    /** fundedPercent clamped to 0..100. */
    readonly ringPercent: number;
    /** From current.capital.annuityCapital with the same first-year income. */
    readonly drawdown: DrawdownResult;
  };
  /** At the required contribution. */
  readonly plan: RaProjection;
  /** From capital.annuityCapital, firstYearIncome = income.grossAnnual. */
  readonly drawdown: DrawdownResult;
}

/**
 * The whole Retire at 55 plan: inflate the net goal to retirement, gross it up for tax at the
 * retirement age, buy it with a living annuity, add the lump sum, then solve the contribution and
 * the return that reach that capital, and model both the plan and the current path in retirement.
 * RangeError when `retireIssues` is not empty (it lists them) or a figure is invalid.
 */
export function retirePlan(
  input: RetireInput,
  tables: TaxTables,
  rules: RetireRules,
): RetireResult {
  const issues = retireIssues(input, rules);
  if (issues.length > 0) throw new RangeError(`Cannot plan retirement: ${issues.join(', ')}`);

  const { salary, retirementAge, inflation, escalation, startingBalance, takeLumpSum } = input;
  const medicalMembers = salary.medicalMembers ?? 0;
  const years = retirementAge - salary.age;
  const inflationFactor = (1 + inflation) ** years;
  const nominalMonthly = inflateToRetirement(input.goalNetMonthlyToday, inflation, years);
  const nominalAnnual = nominalMonthly * MONTHS_PER_YEAR;

  const income = grossAnnuityFromNet(nominalAnnual, retirementAge, tables, medicalMembers);
  const annuity = livingAnnuityCapital(income.grossAnnual, input.drawdownRate, rules);
  const capital = capitalAtRetirement(annuity, takeLumpSum, rules);

  const accumulation = {
    escalation,
    startingBalance,
    annualReturn: input.returnBeforeRetirement,
    years,
  };
  const requiredMonthly = requiredMonthlyContribution(capital.total, accumulation, rules);
  const requiredTaxSaving = raTaxSaving(salary, requiredMonthly, tables);

  const returnPlan = {
    monthlyContribution: input.monthlyContribution,
    escalation,
    startingBalance,
    years,
  };
  const requiredReturn = solveReturn(capital.total, returnPlan, rules);

  const current = raProjection(
    { ...accumulation, monthlyContribution: input.monthlyContribution, inflation },
    rules,
  );
  const plan = raProjection(
    { ...accumulation, monthlyContribution: requiredMonthly, inflation },
    rules,
  );
  const currentCapital = commuteOneThird(current.final.nominal, takeLumpSum, rules);
  const currentTaxSaving = raTaxSaving(salary, input.monthlyContribution, tables);
  const gapNominal = current.final.nominal - capital.total;
  const fundedPercent = capital.total === 0 ? 100 : (current.final.nominal / capital.total) * 100;

  const drawdownBase = {
    firstYearIncome: income.grossAnnual,
    inflation,
    annualReturn: input.returnInRetirement,
    retirementAge,
    horizonAge: input.horizonAge,
    maxRate: rules.drawdownMax,
    yearsBeforeRetirement: years,
    medicalMembers,
  };

  return {
    currentAge: salary.age,
    retirementAge,
    years,
    inflationFactor,
    goal: { todayMonthly: input.goalNetMonthlyToday, nominalMonthly, nominalAnnual },
    income,
    capital,
    capitalToday: capital.total / inflationFactor,
    requiredContribution: {
      monthly: requiredMonthly,
      taxSaving: requiredTaxSaving,
      netCostMonthly: requiredTaxSaving.netCostMonthly,
    },
    requiredReturn,
    current: {
      projection: current,
      capital: currentCapital,
      taxSaving: currentTaxSaving,
      netCostMonthly: currentTaxSaving.netCostMonthly,
      gapNominal,
      gapToday: gapNominal / inflationFactor,
      fundedPercent,
      ringPercent: Math.min(100, Math.max(0, fundedPercent)),
      drawdown: simulateDrawdown(
        { ...drawdownBase, capital: currentCapital.annuityCapital },
        tables,
      ),
    },
    plan,
    drawdown: simulateDrawdown({ ...drawdownBase, capital: capital.annuityCapital }, tables),
  };
}

/** Pre-checks the [0, 1] range so the page gets a status instead of an error. */
function solveReturn(
  target: number,
  plan: Omit<RaProjectionInput, 'annualReturn' | 'inflation'>,
  rules: Pick<RaRules, 'savingsShare' | 'retirementShare'>,
): RetireResult['requiredReturn'] {
  const finalAt = (annualReturn: number): number =>
    raProjection({ ...plan, annualReturn, inflation: 0 }, rules).final.nominal;
  if (finalAt(0) >= target) return { status: 'already-funded', rate: 0 };
  if (finalAt(1) < target) return { status: 'unreachable', rate: null };
  return { status: 'solved', rate: requiredAnnualReturn(target, plan, rules) };
}

function assertSolverYears(years: number): void {
  assertWholeNumber('years', years, MAX_YEARS);
  if (years < 1) throw new RangeError(`years must be at least 1, got ${years}`);
}

/** Throws a RangeError naming the field unless `value` is a finite rate from 0 to 1 (a fraction). */
function assertRate(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a rate from 0 to 1, got ${value}`);
  }
}
