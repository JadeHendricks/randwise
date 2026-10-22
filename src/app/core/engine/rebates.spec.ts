import taxYear2027 from '../../../assets/data/tax-years/2027.json';
import { shippedTaxTables2027 } from '../../testing/tax-tables';
import { validateTaxYearFile } from '../data/tax-year.validator';
import { roundRand } from './money';
import { rebates, taxAfterRebates } from './rebates';

const tables = shippedTaxTables2027();

/** Tax after rebates should be exactly zero at a threshold, without float noise leaking through. */
function expectZeroTax(amount: number): void {
  expect(amount).toBeGreaterThanOrEqual(0);
  expect(amount).toBeCloseTo(0, 2);
  expect(roundRand(amount)).toBe(0);
}

describe('rebates', () => {
  it.each([
    [35, 17_820], // primary
    [64, 17_820], // primary
    [65, 27_585], // 17 820 + 9 765
    [74, 27_585],
    [75, 30_834], // 27 585 + 3 249
    [90, 30_834],
  ])('age %d gets R%d', (age, expected) => {
    expect(rebates(age, tables)).toBe(expected);
  });

  it('rejects a fractional or negative age', () => {
    expect(() => rebates(1.5, tables)).toThrow(RangeError);
    expect(() => rebates(-1, tables)).toThrow(RangeError);
  });
});

describe('taxAfterRebates', () => {
  it.each([
    [35, 99_000], // 0.18 × 99 000 = 17 820 − 17 820
    [65, 153_250], // 0.18 × 153 250 = 27 585 − 27 585
    [75, 171_300], // 0.18 × 171 300 = 30 834 − 30 834
  ])('is zero at the age-%d threshold R%d and R0.18 one rand above', (age, threshold) => {
    expectZeroTax(taxAfterRebates(threshold, age, tables));
    expect(taxAfterRebates(threshold + 1, age, tables)).toBeCloseTo(0.18, 2);
  });

  it('is zero at the thresholds published in the shipped file', () => {
    const result = validateTaxYearFile(taxYear2027, '2027.json');
    if (!result.ok) throw new Error(result.errors.join('; '));
    const { under65, age65to74, age75plus } = result.value.thresholds.value;
    expectZeroTax(taxAfterRebates(under65, 64, tables));
    expectZeroTax(taxAfterRebates(age65to74, 65, tables));
    expectZeroTax(taxAfterRebates(age75plus, 75, tables));
  });

  it('stacks the secondary and tertiary rebates at 65 and 75', () => {
    // At 153 250: age 64 gets only the primary, 27 585 − 17 820 = 9 765; age 65 pays nothing.
    expect(taxAfterRebates(153_250, 64, tables)).toBeCloseTo(9_765, 2);
    expectZeroTax(taxAfterRebates(153_250, 65, tables));
    // At 171 300: age 74 has no tertiary, 30 834 − 27 585 = 3 249; age 75 pays nothing.
    expect(taxAfterRebates(171_300, 74, tables)).toBeCloseTo(3_249, 2);
    expectZeroTax(taxAfterRebates(171_300, 75, tables));
  });

  it('never goes negative', () => {
    // 0.18 × 50 000 = 9 000 − 17 820 would be −8 820; floored at 0.
    expect(taxAfterRebates(50_000, 35, tables)).toBe(0);
  });

  it('matches the worked R360 000 example', () => {
    // 73 992 − 17 820
    expect(taxAfterRebates(360_000, 35, tables)).toBeCloseTo(56_172, 2);
  });
});
