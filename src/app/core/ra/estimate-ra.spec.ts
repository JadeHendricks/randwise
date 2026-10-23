import taxYear2027 from '../../../assets/data/tax-years/2027.json';
import { shippedTaxTables2027 } from '../../testing/tax-tables';
import { validateTaxYearFile } from '../data/tax-year.validator';
import { roundRand, toRaRules } from '../engine';
import { estimateRa } from './estimate-ra';
import type { RaInputs } from './ra-inputs';

const tables = shippedTaxTables2027();
const shipped = validateTaxYearFile(taxYear2027, '2027.json');
if (!shipped.ok) throw new Error(`2027.json is invalid: ${shipped.errors.join('; ')}`);
const rules = toRaRules(shipped.value);

// The default RA page example (plan.md 4e): R30 000 salary, R2 000 extra a month.
const EXAMPLE: RaInputs = {
  grossMonthly: 30_000,
  age: 35,
  medicalMembers: 0,
  employeeRetirementMonthly: 0,
  employerRetirementMonthly: 0,
  contributionMonthly: 2_000,
  escalationPercent: 5,
  startingBalance: 0,
  returnPercent: 9.5,
  inflationPercent: 4.5,
  retirementAge: 55,
};

function ok(inputs: RaInputs) {
  const estimate = estimateRa(inputs, tables, rules);
  if (!estimate.ok) throw new Error(estimate.message);
  return estimate;
}

describe('estimateRa', () => {
  it('works the default example out from percents', () => {
    const { result, usedPercent, warnings } = ok(EXAMPLE);
    expect(result.projection.final.nominal).toBeCloseTo(1_940_113.55, 2);
    expect(result.projection.final.real).toBeCloseTo(804_454.23, 2);
    expect(result.headroom.headroom).toBeCloseTo(99_000, 2);
    expect(result.headroom.headroomMonthly).toBeCloseTo(8_250, 2);
    expect(result.taxSaving.saving).toBeCloseTo(6_240, 2);
    // 24 000 deductible against a 99 000 limit.
    expect(usedPercent).toBeCloseTo((24_000 / 99_000) * 100, 6);
    expect(warnings).toEqual([]);
  });

  it('counts existing contributions in the share of the limit used', () => {
    // H2 limit 105 600 with 60 000 existing, plus 24 000 more = 84 000.
    const { usedPercent } = ok({
      ...EXAMPLE,
      employeeRetirementMonthly: 3_000,
      employerRetirementMonthly: 2_000,
    });
    expect(usedPercent).toBeCloseTo((84_000 / 105_600) * 100, 6);
  });

  it('S5: warns that R21 000 is over the limit and caps the ring at 100%', () => {
    const { result, usedPercent, warnings } = ok({ ...EXAMPLE, contributionMonthly: 10_000 });
    expect(roundRand(result.taxSaving.carriedForward)).toBe(21_000);
    expect(usedPercent).toBe(100);
    expect(warnings).toEqual(['over-cap']);
  });

  it('flags a retirement age below the earliest and projects to 55', () => {
    const { result, warnings } = ok({ ...EXAMPLE, retirementAge: 50 });
    expect(warnings).toEqual(['below-earliest-age']);
    expect(result.ages.retirementAge).toBe(55);
    expect(result.projection.series).toHaveLength(21);
  });

  it('flags a person already at or past the retirement age', () => {
    const { result, warnings } = ok({ ...EXAMPLE, age: 60 });
    expect(warnings).toEqual(['past-retirement-age']);
    expect(result.ages.years).toBe(0);
  });

  it('can raise more than one warning', () => {
    const { warnings } = ok({ ...EXAMPLE, contributionMonthly: 10_000, retirementAge: 50 });
    expect(warnings).toEqual(['over-cap', 'below-earliest-age']);
  });

  it('has a used share of 0 when there is no limit', () => {
    const { usedPercent } = ok({ ...EXAMPLE, grossMonthly: 0 });
    expect(usedPercent).toBe(0);
  });

  it('turns a RangeError into a friendly failure', () => {
    const estimate = estimateRa({ ...EXAMPLE, returnPercent: 150 }, tables, rules);
    expect(estimate).toEqual({
      ok: false,
      message: 'Those figures could not be worked out. Check the amounts and try again.',
    });
  });
});
