import taxYear2027 from '../../../assets/data/tax-years/2027.json';
import { shippedTaxTables2027 } from '../../testing/tax-tables';
import { validateTaxYearFile } from '../data/tax-year.validator';
import { toRetireRules } from '../engine';
import { estimateRetire } from './estimate-retire';
import type { RetireInputs } from './retire-inputs';

const tables = shippedTaxTables2027();
const shipped = validateTaxYearFile(taxYear2027, '2027.json');
if (!shipped.ok) throw new Error(`2027.json is invalid: ${shipped.errors.join('; ')}`);
const rules = toRetireRules(shipped.value);

// The default Retire page example (plan.md G10): R30 000 salary, R50 000 a month goal at 55.
const EXAMPLE: RetireInputs = {
  grossMonthly: 30_000,
  age: 35,
  medicalMembers: 0,
  employeeRetirementMonthly: 0,
  employerRetirementMonthly: 0,
  goalNetMonthly: 50_000,
  retirementAge: 55,
  inflationPercent: 4.5,
  returnPercent: 9.5,
  retirementReturnPercent: 7.5,
  drawdownPercent: 5,
  takeLumpSum: false,
  startingBalance: 0,
  contributionMonthly: 2_000,
  escalationPercent: 5,
};

function ok(inputs: RetireInputs) {
  const estimate = estimateRetire(inputs, tables, rules);
  if (!estimate.ok) throw new Error(`failed: ${estimate.problems.join(', ')}`);
  return estimate;
}

describe('estimateRetire', () => {
  it('works the default example out from percents (G10)', () => {
    const { result, warnings } = ok(EXAMPLE);
    expect(result.requiredContribution.monthly).toBeCloseTo(46_864.264013, 2);
    expect(result.current.fundedPercent).toBeCloseTo(4.267644, 4);
    expect(result.capital.total).toBeCloseTo(45_460_996.9055, 2);
    expect(warnings).toEqual(['high-required-return', 'drawdown-cap']);
  });

  it('reports a drawdown below 2,5% as the only problem', () => {
    expect(estimateRetire({ ...EXAMPLE, drawdownPercent: 2.4 }, tables, rules)).toEqual({
      ok: false,
      problems: ['drawdown-too-low'],
    });
  });

  it('reports a drawdown above 17,5%', () => {
    expect(estimateRetire({ ...EXAMPLE, drawdownPercent: 17.6 }, tables, rules)).toEqual({
      ok: false,
      problems: ['drawdown-too-high'],
    });
  });

  it('accepts the edges of the drawdown range', () => {
    expect(estimateRetire({ ...EXAMPLE, drawdownPercent: 2.5 }, tables, rules).ok).toBe(true);
    expect(estimateRetire({ ...EXAMPLE, drawdownPercent: 17.5 }, tables, rules).ok).toBe(true);
  });

  it('reports a retirement age below 55', () => {
    expect(estimateRetire({ ...EXAMPLE, retirementAge: 50 }, tables, rules)).toEqual({
      ok: false,
      problems: ['retirement-age-too-early'],
    });
  });

  it('reports every issue at once, in the engine order', () => {
    expect(
      estimateRetire({ ...EXAMPLE, retirementAge: 50, drawdownPercent: 20 }, tables, rules),
    ).toEqual({ ok: false, problems: ['retirement-age-too-early', 'drawdown-too-high'] });
  });

  it('reports a person already at the retirement age', () => {
    expect(estimateRetire({ ...EXAMPLE, age: 60 }, tables, rules)).toEqual({
      ok: false,
      problems: ['already-at-retirement-age'],
    });
  });

  it('turns a RangeError into invalid-figures', () => {
    expect(estimateRetire({ ...EXAMPLE, returnPercent: 150 }, tables, rules)).toEqual({
      ok: false,
      problems: ['invalid-figures'],
    });
  });

  it('warns about a high return before or in retirement', () => {
    expect(ok({ ...EXAMPLE, returnPercent: 13 }).warnings).toContain('high-return');
    expect(ok({ ...EXAMPLE, retirementReturnPercent: 13 }).warnings).toContain('high-return');
    expect(ok({ ...EXAMPLE, returnPercent: 12 }).warnings).not.toContain('high-return');
  });

  it('flags that the whole RA could be commuted when it is small (de minimis)', () => {
    // inflation 0, goal R900 a month: net 10 800 a year is below the R99 000 tax threshold at 55
    // (rebate 17 820 / 18% = 99 000), so gross = net = 10 800. At 5% the annuity is
    // 10 800 / 0.05 = 216 000 and with a lump sum the total is 216 000 x 3/2 = 324 000, which is
    // not above the R360 000 de minimis amount.
    const { result, warnings } = ok({
      ...EXAMPLE,
      inflationPercent: 0,
      goalNetMonthly: 900,
      drawdownPercent: 5,
      takeLumpSum: true,
    });
    expect(result.income.grossAnnual).toBeCloseTo(10_800, 2);
    expect(result.capital.total).toBeCloseTo(324_000, 2);
    expect(warnings).toContain('de-minimis');
  });

  it('does not flag de minimis for a large RA', () => {
    expect(ok(EXAMPLE).warnings).not.toContain('de-minimis');
  });

  it('has no warnings for a goal of zero', () => {
    const { result, warnings } = ok({ ...EXAMPLE, goalNetMonthly: 0 });
    expect(result.requiredContribution.monthly).toBe(0);
    expect(warnings).toEqual([]);
  });
});
