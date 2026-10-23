import taxYear2027 from '../../../assets/data/tax-years/2027.json';
import { shippedTaxTables2027 } from '../../testing/tax-tables';
import { validateTaxYearFile } from '../data/tax-year.validator';
import { payslip, toRaRules } from '../engine';
import { type TwoPotEstimate, estimateTwoPot } from './estimate-two-pot';
import type { TwoPotInputs } from './toolbox-inputs';

const tables = shippedTaxTables2027();
const shipped = validateTaxYearFile(taxYear2027, '2027.json');
if (!shipped.ok) throw new Error(`2027.json is invalid: ${shipped.errors.join('; ')}`);
const rules = toRaRules(shipped.value);

// plan.md TP1: taxable R350 000, withdrawal R50 000, age 40, 20 years, 4% real growth, 5% inflation.
const TP1: TwoPotInputs = {
  withdrawal: 50_000,
  taxableIncomeAnnual: 350_000,
  age: 40,
  medicalMembers: 0,
  yearsToRetirement: 20,
  realGrowthPercent: 4,
  inflationPercent: 5,
};

function ok(inputs: TwoPotInputs) {
  const estimate: TwoPotEstimate = estimateTwoPot(inputs, tables, rules);
  if (!estimate.ok) throw new Error(`failed: ${estimate.message}`);
  const { result } = estimate;
  if (!result.accepted) throw new Error('rejected');
  return { result, warnings: estimate.warnings };
}

describe('estimateTwoPot', () => {
  it('TP1: turns percents into fractions and warns that the withdrawal crosses a bracket', () => {
    const { result, warnings } = ok(TP1);
    // 8 606 @26% + 5 239 @31% = 13 845; 50 000 × 1.04^20 = 109 556.16 in today's money
    expect(result.tax).toBeCloseTo(13_845, 6);
    expect(result.futureValueToday).toBeCloseTo(109_556.157, 2);
    expect(result.futureValueNominal).toBeCloseTo(290_685.1, 0);
    expect(warnings).toEqual(['crosses-bracket']);
  });

  it('TP4: low pay lets the rebate absorb part of the tax, and says so', () => {
    const { result, warnings } = ok({ ...TP1, taxableIncomeAnnual: 90_000 });
    // the unused R1 620 of the R17 820 rebate: tax 7 380, not the bare 9 000
    expect(result.tax).toBeCloseTo(7_380, 6);
    expect(result.absorbedByCredits).toBeCloseTo(1_620, 6);
    expect(warnings).toEqual(['absorbed-by-credits']);
  });

  it('TP6: one medical member takes the credit from medicalCredit (R4 512 a year)', () => {
    const { result, warnings } = ok({
      ...TP1,
      withdrawal: 10_000,
      taxableIncomeAnnual: 100_000,
      medicalMembers: 1,
    });
    // incomeTax(110 000) = 19 800 is below 17 820 + 4 512, so the whole R1 800 is absorbed
    expect(result.tax).toBe(0);
    expect(result.absorbedByCredits).toBeCloseTo(1_800, 6);
    expect(warnings).toEqual(['absorbed-by-credits']);
  });

  it('TP3: no warning when the withdrawal stays in one bracket above the rebates', () => {
    const { warnings } = ok({ ...TP1, withdrawal: 10_000, taxableIncomeAnnual: 383_100 });
    expect(warnings).toEqual([]);
  });

  it('TP2: a withdrawal below the minimum is a result, not a warning or a failure', () => {
    const estimate = estimateTwoPot({ ...TP1, withdrawal: 1_999.99 }, tables, rules);
    expect(estimate).toMatchObject({
      ok: true,
      result: { accepted: false, reason: 'below-minimum', minimum: 2_000 },
      warnings: [],
    });
  });

  it('pins the Pay-derived defaults for the R30 000 example: taxable R360 000, marginal 26%', () => {
    const slip = payslip({ gross: 30_000, period: 'monthly', age: 35 }, tables);
    expect(slip.annual.taxableIncome).toBe(360_000);
    expect(slip.marginalRate).toBe(0.26);
    // R20 000 on top of R360 000 stays in the 26% bracket: tax 5 200
    const { result } = ok({
      ...TP1,
      withdrawal: 20_000,
      taxableIncomeAnnual: slip.annual.taxableIncome,
      age: 35,
    });
    expect(result.startRate).toBe(0.26);
    expect(result.tax).toBeCloseTo(5_200, 6);
  });

  it('returns a plain sentence for a figure the engine rejects', () => {
    for (const bad of [
      { realGrowthPercent: -1 },
      { inflationPercent: 250 },
      { withdrawal: -10 },
      { yearsToRetirement: 90 },
      { medicalMembers: -1 },
    ]) {
      const estimate = estimateTwoPot({ ...TP1, ...bad }, tables, rules);
      expect(estimate.ok).toBe(false);
      if (!estimate.ok) {
        expect(estimate.message).toBe(
          'Those figures could not be worked out. Check the amounts and try again.',
        );
      }
    }
  });
});
