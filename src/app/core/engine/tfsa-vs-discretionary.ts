import { InvestmentTaxRules, cgtOnDisposal, dividendTax, interestTax } from './investment-tax';
import { assertAmount, assertWholeNumber } from './money';
import { tfsaContribution } from './tfsa';

/**
 * TFSA versus a taxable (discretionary) account over N years. Rands, full precision, pure.
 *
 * Timing convention (one choice, used everywhere here):
 * - Contributions go in at the START of each year (the lump sum and the yearly contribution in
 *   year 1, the yearly contribution in later years). Each year's return is earned on the
 *   start-of-year balance at an effective annual rate.
 * - The return is split into interest, dividends and capital growth. In a taxable account interest
 *   and dividends are taxed EVERY year and the tax is paid out of the account; the net interest and
 *   dividends are reinvested and count as base cost.
 * - Capital growth is untaxed until a single disposal at the END of the last year, when CGT is
 *   charged once (the annual exclusion is used once). The final series point is net of that CGT.
 * - Age moves up one a year from `age` in year 1, so the interest exemption follows the 65 rule.
 * - In the TFSA scenario, money that does not fit under the annual or lifetime limit goes to a
 *   taxable account run the same way, so both scenarios invest the same cash. The over-limit
 *   penalty is not modelled here.
 */

/** The longest comparison, in years. A product cap, not a tax rule. */
export const MAX_COMPARISON_YEARS = 50;

/** Tolerance for the split summing to 1. */
const SPLIT_TOLERANCE = 1e-9;

/** Shares of the total return, each 0..1 and summing to 1. */
export interface ReturnSplit {
  readonly interest: number;
  readonly dividends: number;
  readonly growth: number;
}

export interface InvestmentComparisonInput {
  /** Rands invested at the start of year 1. */
  readonly lumpSum: number;
  /** Rands invested at the start of every year, including year 1. */
  readonly yearlyContribution: number;
  /** Whole years, 1..MAX_COMPARISON_YEARS. */
  readonly years: number;
  /** Effective annual return as a fraction, 0..1. */
  readonly annualReturn: number;
  readonly split: ReturnSplit;
  /** Flat marginal rate for interest and the included capital gain, 0..1. */
  readonly marginalRate: number;
  /** Age on the last day of year 1's tax year. */
  readonly age: number;
  /** TFSA contributions already made in earlier years. */
  readonly tfsaLifetimeUsed: number;
}

export interface ScenarioTax {
  readonly interest: number;
  readonly dividends: number;
  readonly capitalGains: number;
  readonly total: number;
}

export interface ComparisonYear {
  readonly year: number;
  readonly contribution: number;
  readonly tfsaIn: number;
  readonly overflow: number;
  readonly overAnnual: boolean;
  readonly overLifetime: boolean;
  /** Year-end value; the last year is net of CGT. */
  readonly tfsaScenarioValue: number;
  readonly discretionaryValue: number;
  /** Tax paid in that year (CGT lands in the last year). */
  readonly discretionaryTax: number;
  readonly tfsaScenarioTax: number;
}

export interface InvestmentComparison {
  readonly totalContributed: number;
  readonly tfsaContributed: number;
  readonly overflowContributed: number;
  readonly lifetimeUsedAfter: number;
  /** True when any year's money did not all fit in the TFSA. */
  readonly capped: boolean;
  readonly tfsaScenario: {
    readonly endValue: number;
    readonly tfsaBalance: number;
    readonly overflowNetValue: number;
    readonly tax: ScenarioTax;
  };
  readonly discretionary: { readonly endValue: number; readonly tax: ScenarioTax };
  /** tfsaScenario.endValue − discretionary.endValue. */
  readonly advantage: number;
  /** discretionary.tax.total − tfsaScenario.tax.total. */
  readonly taxSavedByTfsa: number;
  /** advantage − taxSavedByTfsa: growth forgone on tax already paid. */
  readonly taxDragGrowth: number;
  readonly years: readonly ComparisonYear[];
}

interface TaxableRun {
  /** Year-end values; the last is net of CGT. */
  readonly values: readonly number[];
  readonly taxByYear: readonly number[];
  readonly endValue: number;
  readonly tax: ScenarioTax;
}

function assertRate(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a rate from 0 to 1, got ${value}`);
  }
}

function assertSplit(split: ReturnSplit): void {
  assertRate('split.interest', split.interest);
  assertRate('split.dividends', split.dividends);
  assertRate('split.growth', split.growth);
  const sum = split.interest + split.dividends + split.growth;
  if (Math.abs(sum - 1) > SPLIT_TOLERANCE) {
    throw new RangeError(`split must sum to 1, got ${sum}`);
  }
}

/** A taxable account fed by `contributions[y]` at the start of each year, sold at the end. */
function simulateTaxable(
  contributions: readonly number[],
  input: InvestmentComparisonInput,
  rules: InvestmentTaxRules,
): TaxableRun {
  const { annualReturn, split, marginalRate, age } = input;
  const values: number[] = [];
  const taxByYear: number[] = [];
  let balance = 0;
  let baseCost = 0;
  let interestTotal = 0;
  let dividendsTotal = 0;

  contributions.forEach((contribution, index) => {
    balance += contribution;
    baseCost += contribution;
    const yearReturn = balance * annualReturn;
    const interest = yearReturn * split.interest;
    const dividends = yearReturn * split.dividends;
    const iTax = interestTax(interest, age + index, marginalRate, rules).tax;
    const dTax = dividendTax(dividends, rules);
    // Why: interest and dividend tax is paid every year from the account, and what is reinvested
    // after tax is money already taxed, so it adds to the base cost for CGT.
    // Source: https://www.sars.gov.za/tax-rates/income-tax/capital-gains-tax-cgt/
    balance = balance + yearReturn - iTax - dTax;
    baseCost = baseCost + interest + dividends - iTax - dTax;
    interestTotal += iTax;
    dividendsTotal += dTax;
    values.push(balance);
    taxByYear.push(iTax + dTax);
  });

  // Why: growth is taxed once, on a single disposal at the end, so the annual exclusion is used once.
  // Source: https://www.sars.gov.za/tax-rates/income-tax/capital-gains-tax-cgt/
  const cgt = cgtOnDisposal(balance - baseCost, marginalRate, rules).tax;
  const last = values.length - 1;
  values[last] -= cgt;
  taxByYear[last] += cgt;
  return {
    values,
    taxByYear,
    endValue: values[last],
    tax: {
      interest: interestTotal,
      dividends: dividendsTotal,
      capitalGains: cgt,
      total: interestTotal + dividendsTotal + cgt,
    },
  };
}

/** The same cash in a TFSA (with any over-limit money in a taxable account) versus all taxable. */
export function compareTfsaDiscretionary(
  input: InvestmentComparisonInput,
  rules: InvestmentTaxRules,
): InvestmentComparison {
  const { lumpSum, yearlyContribution, years, annualReturn, marginalRate, age } = input;
  assertAmount('lumpSum', lumpSum);
  assertAmount('yearlyContribution', yearlyContribution);
  assertAmount('tfsaLifetimeUsed', input.tfsaLifetimeUsed);
  assertWholeNumber('years', years, MAX_COMPARISON_YEARS);
  if (years < 1) throw new RangeError(`years must be at least 1, got ${years}`);
  assertRate('annualReturn', annualReturn);
  assertRate('marginalRate', marginalRate);
  assertWholeNumber('age', age);
  assertSplit(input.split);

  const contributions = Array.from(
    { length: years },
    (_, index) => (index === 0 ? lumpSum : 0) + yearlyContribution,
  );

  // Why: a TFSA takes at most the annual limit each tax year and the lifetime limit in total
  // (contributions, not growth); interest, dividends and gains inside it are not taxed.
  // Source: https://www.sars.gov.za/types-of-tax/personal-income-tax/tax-free-investments/
  let lifetimeUsed = input.tfsaLifetimeUsed;
  let tfsaBalance = 0;
  const tfsaBalances: number[] = [];
  const allocations = contributions.map((desired) => {
    const room = tfsaContribution({ desired, lifetimeUsed }, rules);
    lifetimeUsed += room.allowed;
    tfsaBalance = (tfsaBalance + room.allowed) * (1 + annualReturn);
    tfsaBalances.push(tfsaBalance);
    return room;
  });

  const discretionary = simulateTaxable(contributions, input, rules);
  const overflow = simulateTaxable(
    allocations.map((room) => room.excess),
    input,
    rules,
  );

  const tfsaContributed = allocations.reduce((sum, room) => sum + room.allowed, 0);
  const overflowContributed = allocations.reduce((sum, room) => sum + room.excess, 0);
  const tfsaEndValue = tfsaBalance + overflow.endValue;
  const advantage = tfsaEndValue - discretionary.endValue;
  const taxSavedByTfsa = discretionary.tax.total - overflow.tax.total;

  return {
    totalContributed: contributions.reduce((sum, amount) => sum + amount, 0),
    tfsaContributed,
    overflowContributed,
    lifetimeUsedAfter: lifetimeUsed,
    capped: allocations.some((room) => room.excess > 0),
    tfsaScenario: {
      endValue: tfsaEndValue,
      tfsaBalance,
      overflowNetValue: overflow.endValue,
      tax: overflow.tax,
    },
    discretionary: { endValue: discretionary.endValue, tax: discretionary.tax },
    advantage,
    taxSavedByTfsa,
    taxDragGrowth: advantage - taxSavedByTfsa,
    years: allocations.map((room, index) => ({
      year: index + 1,
      contribution: contributions[index],
      tfsaIn: room.allowed,
      overflow: room.excess,
      overAnnual: room.overAnnual,
      overLifetime: room.overLifetime,
      tfsaScenarioValue: tfsaBalances[index] + overflow.values[index],
      discretionaryValue: discretionary.values[index],
      discretionaryTax: discretionary.taxByYear[index],
      tfsaScenarioTax: overflow.taxByYear[index],
    })),
  };
}
