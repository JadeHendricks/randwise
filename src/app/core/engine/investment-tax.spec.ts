import taxYear2027 from '../../../assets/data/tax-years/2027.json';
import { makeTaxYear } from '../../testing/tax-data-fixtures';
import { deepFreeze } from '../../testing/tax-tables';
import { validateTaxYearFile } from '../data/tax-year.validator';
import {
  cgtOnDisposal,
  dividendTax,
  interestExemption,
  interestTax,
  toInvestmentTaxRules,
} from './investment-tax';

/**
 * Goldens from plan.md section 3 (helper goldens ID1..ID3), shipped 2026/27 rules:
 * interest exemption 23 800 under 65 / 34 500 at 65+, dividends WHT 20%
 * (https://www.sars.gov.za/tax-rates/income-tax/interest-and-dividends/), CGT annual exclusion
 * 50 000 and inclusion 40% (https://www.sars.gov.za/tax-rates/income-tax/capital-gains-tax-cgt/).
 */
const shipped = validateTaxYearFile(taxYear2027, '2027.json');
if (!shipped.ok) throw new Error(`2027.json is invalid: ${shipped.errors.join('; ')}`);
const rules = toInvestmentTaxRules(shipped.value);

describe('toInvestmentTaxRules', () => {
  it('reads the shipped exemption, CGT, dividend and TFSA values', () => {
    expect(rules).toEqual({
      interestExemptionUnder65: 23_800,
      interestExemption65Plus: 34_500,
      cgtAnnualExclusion: 50_000,
      cgtInclusionRate: 0.4,
      dividendsWithholdingRate: 0.2,
      annualLimit: 46_000,
      lifetimeLimit: 500_000,
      penaltyRate: 0.4,
    });
  });

  it('reads the fixture values, not constants', () => {
    const fixture = toInvestmentTaxRules(makeTaxYear(2027));
    expect(fixture).toEqual({
      interestExemptionUnder65: 10_000,
      interestExemption65Plus: 20_000,
      cgtAnnualExclusion: 10_000,
      cgtInclusionRate: 0.5,
      dividendsWithholdingRate: 0.1,
      annualLimit: 10_000,
      lifetimeLimit: 100_000,
      penaltyRate: 0.4,
    });
    // interest 15 000 under 65 at 40%: taxable 15 000 − 10 000 = 5 000, tax 2 000
    expect(interestTax(15_000, 40, 0.4, fixture).tax).toBeCloseTo(2_000, 6);
    // dividends 1 000 × 0.1 = 100
    expect(dividendTax(1_000, fixture)).toBeCloseTo(100, 6);
    // gain 30 000: net 20 000, included × 0.5 = 10 000, tax × 0.4 = 4 000
    expect(cgtOnDisposal(30_000, 0.4, fixture).tax).toBeCloseTo(4_000, 6);
  });
});

describe('interestExemption', () => {
  it('uses the 65+ exemption from age 65', () => {
    expect(interestExemption(64, rules)).toBe(23_800);
    expect(interestExemption(65, rules)).toBe(34_500);
    expect(interestExemption(80, rules)).toBe(34_500);
  });

  it('rejects a non-whole age', () => {
    expect(() => interestExemption(40.5, rules)).toThrow(RangeError);
    expect(() => interestExemption(-1, rules)).toThrow(RangeError);
  });
});

describe('interestTax (ID1)', () => {
  it('taxes nothing at or below the exemption', () => {
    // 10 000 < 23 800: exempt 10 000, taxable 0, tax 0
    expect(interestTax(10_000, 40, 0.41, rules)).toEqual({ exempt: 10_000, taxable: 0, tax: 0 });
    // exactly 23 800: tax 0
    expect(interestTax(23_800, 40, 0.41, rules).tax).toBe(0);
  });

  it('taxes interest above the exemption at the marginal rate', () => {
    // 40 000 − 23 800 = 16 200; 16 200 × 0.41 = 6 642
    const result = interestTax(40_000, 40, 0.41, rules);
    expect(result.exempt).toBe(23_800);
    expect(result.taxable).toBe(16_200);
    expect(result.tax).toBeCloseTo(6_642, 6);
  });

  it('uses the larger exemption at 65 (age 64 still uses 23 800)', () => {
    // 40 000 − 34 500 = 5 500; 5 500 × 0.41 = 2 255
    const senior = interestTax(40_000, 65, 0.41, rules);
    expect(senior.taxable).toBe(5_500);
    expect(senior.tax).toBeCloseTo(2_255, 6);
    expect(interestTax(40_000, 64, 0.41, rules).tax).toBeCloseTo(6_642, 6);
  });

  it('rejects bad input', () => {
    expect(() => interestTax(-1, 40, 0.41, rules)).toThrow(RangeError);
    expect(() => interestTax(Number.NaN, 40, 0.41, rules)).toThrow(RangeError);
    expect(() => interestTax(1_000, 40, -0.1, rules)).toThrow(RangeError);
    expect(() => interestTax(1_000, 40, 1.1, rules)).toThrow(RangeError);
  });
});

describe('dividendTax (ID2)', () => {
  it('withholds 20% of local dividends', () => {
    // 920 × 0.2 = 184; 1 000 000 × 0.2 = 200 000
    expect(dividendTax(920, rules)).toBeCloseTo(184, 6);
    expect(dividendTax(1_000_000, rules)).toBeCloseTo(200_000, 6);
    expect(dividendTax(0, rules)).toBe(0);
  });

  it('rejects bad input', () => {
    expect(() => dividendTax(-1, rules)).toThrow(RangeError);
    expect(() => dividendTax(Number.POSITIVE_INFINITY, rules)).toThrow(RangeError);
  });
});

describe('cgtOnDisposal (ID3)', () => {
  it('applies the exclusion, then the inclusion rate, then the marginal rate', () => {
    // exclusion 50 000; net 50 000; included 50 000 × 0.4 = 20 000; tax 20 000 × 0.41 = 8 200
    expect(cgtOnDisposal(100_000, 0.41, rules)).toEqual({
      gain: 100_000,
      exclusionUsed: 50_000,
      netGain: 50_000,
      included: 20_000,
      tax: expect.closeTo(8_200, 6),
    });
  });

  it('taxes nothing at or below the exclusion', () => {
    // 40 000 < 50 000; exactly 50 000 -> 0
    expect(cgtOnDisposal(40_000, 0.41, rules).tax).toBe(0);
    expect(cgtOnDisposal(40_000, 0.41, rules).exclusionUsed).toBe(40_000);
    expect(cgtOnDisposal(50_000, 0.41, rules).tax).toBe(0);
  });

  it('works to the cent on a non-round gain', () => {
    // 95 400 − 50 000 = 45 400; × 0.4 = 18 160; × 0.41 = 7 445.60
    const result = cgtOnDisposal(95_400, 0.41, rules);
    expect(result.netGain).toBe(45_400);
    expect(result.included).toBeCloseTo(18_160, 6);
    expect(result.tax).toBeCloseTo(7_445.6, 6);
  });

  it('floors a loss at 0 (losses are not carried)', () => {
    // gain −1 000 -> nothing to tax
    const result = cgtOnDisposal(-1_000, 0.41, rules);
    expect(result.exclusionUsed).toBe(0);
    expect(result.netGain).toBe(0);
    expect(result.tax).toBe(0);
  });

  it('caps the effective rate at 18% of the net gain', () => {
    // 150 000 − 50 000 = 100 000; × 0.4 = 40 000; × 0.45 = 18 000 (18% of the net gain)
    const result = cgtOnDisposal(150_000, 0.45, rules);
    expect(result.included).toBeCloseTo(40_000, 6);
    expect(result.tax).toBeCloseTo(18_000, 6);
  });

  it('rejects bad input', () => {
    expect(() => cgtOnDisposal(Number.NaN, 0.41, rules)).toThrow(RangeError);
    expect(() => cgtOnDisposal(1_000, 1.5, rules)).toThrow(RangeError);
  });

  it('does not mutate the rules', () => {
    const frozen = deepFreeze({ ...rules });
    expect(() => cgtOnDisposal(100_000, 0.41, frozen)).not.toThrow();
    expect(() => interestTax(40_000, 40, 0.41, frozen)).not.toThrow();
    expect(() => dividendTax(920, frozen)).not.toThrow();
  });
});
