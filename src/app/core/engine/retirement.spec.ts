import { fixtureTaxTables, shippedTaxTables2027 } from '../../testing/tax-tables';
import { retirementDeduction } from './retirement';

const tables = shippedTaxTables2027();

describe('retirementDeduction (s11F, 27.5% capped at R430 000 from the 2027 data)', () => {
  it('deducts contributions within the limit and reports the headroom', () => {
    // limit 0.275 × 360 000 = 99 000; headroom 99 000 − 36 000 = 63 000
    const result = retirementDeduction(
      { contributions: 36_000, remuneration: 360_000, taxableIncomeBeforeDeduction: 360_000 },
      tables,
    );
    expect(result.limit).toBeCloseTo(99_000, 2);
    expect(result.deductible).toBeCloseTo(36_000, 2);
    expect(result.excess).toBeCloseTo(0, 2);
    expect(result.headroom).toBeCloseTo(63_000, 2);
  });

  it('carries forward contributions above the limit', () => {
    // 120 000 − 99 000 = 21 000 excess
    const result = retirementDeduction(
      { contributions: 120_000, remuneration: 360_000, taxableIncomeBeforeDeduction: 360_000 },
      tables,
    );
    expect(result.deductible).toBeCloseTo(99_000, 2);
    expect(result.excess).toBeCloseTo(21_000, 2);
    expect(result.headroom).toBeCloseTo(0, 2);
  });

  it('uses the greater of remuneration and taxable income', () => {
    // 0.275 × 300 000 = 82 500 either way round; 90 000 − 82 500 = 7 500 excess
    for (const [remuneration, taxable] of [
      [200_000, 300_000],
      [300_000, 200_000],
    ]) {
      const result = retirementDeduction(
        { contributions: 90_000, remuneration, taxableIncomeBeforeDeduction: taxable },
        tables,
      );
      expect(result.limit).toBeCloseTo(82_500, 2);
      expect(result.deductible).toBeCloseTo(82_500, 2);
      expect(result.excess).toBeCloseTo(7_500, 2);
    }
  });

  it.each([
    // 0.275 × 2 400 000 = 660 000 > 430 000, so the cap applies.
    [430_000, 430_000, 0, 0],
    [480_000, 430_000, 50_000, 0], // 480 000 − 430 000
    [500_000, 430_000, 70_000, 0], // no extra deduction above the cap
  ])(
    'caps at R430 000: contributions R%d -> deductible R%d, excess R%d, headroom R%d',
    (contributions, deductible, excess, headroom) => {
      const result = retirementDeduction(
        { contributions, remuneration: 2_400_000, taxableIncomeBeforeDeduction: 2_400_000 },
        tables,
      );
      expect(result.limit).toBeCloseTo(430_000, 2);
      expect(result.deductible).toBeCloseTo(deductible, 2);
      expect(result.excess).toBeCloseTo(excess, 2);
      expect(result.headroom).toBeCloseTo(headroom, 2);
    },
  );

  it('switches to the cap exactly where 27.5% crosses it', () => {
    const limitAt = (remuneration: number) =>
      retirementDeduction(
        { contributions: 0, remuneration, taxableIncomeBeforeDeduction: remuneration },
        tables,
      ).limit;
    expect(limitAt(1_563_636)).toBeCloseTo(429_999.9, 2); // 0.275 × 1 563 636
    expect(limitAt(1_600_000)).toBeCloseTo(430_000, 2); // 0.275 × 1 600 000 = 440 000 > cap
  });

  it('leaves the whole limit as headroom when nothing is contributed', () => {
    const result = retirementDeduction(
      { contributions: 0, remuneration: 360_000, taxableIncomeBeforeDeduction: 360_000 },
      tables,
    );
    expect(result.deductible).toBe(0);
    expect(result.excess).toBe(0);
    expect(result.headroom).toBeCloseTo(99_000, 2);
  });

  it('reads the rate and cap from the tables', () => {
    // Fixture: 25%, cap 100 000. 0.25 × 360 000 = 90 000; 120 000 − 90 000 = 30 000 excess
    const result = retirementDeduction(
      { contributions: 120_000, remuneration: 360_000, taxableIncomeBeforeDeduction: 360_000 },
      fixtureTaxTables(),
    );
    expect(result.limit).toBeCloseTo(90_000, 2);
    expect(result.deductible).toBeCloseTo(90_000, 2);
    expect(result.excess).toBeCloseTo(30_000, 2);
  });

  it('rejects negative and non-finite amounts', () => {
    const valid = { contributions: 0, remuneration: 0, taxableIncomeBeforeDeduction: 0 };
    expect(() => retirementDeduction({ ...valid, contributions: -1 }, tables)).toThrow(RangeError);
    expect(() => retirementDeduction({ ...valid, remuneration: Number.NaN }, tables)).toThrow(
      RangeError,
    );
    expect(() =>
      retirementDeduction({ ...valid, taxableIncomeBeforeDeduction: -1 }, tables),
    ).toThrow(RangeError);
  });
});
