import { fixtureTaxTables, shippedTaxTables2027 } from '../../testing/tax-tables';
import { uifMonthly } from './uif';

const tables = shippedTaxTables2027();

describe('uifMonthly (1% up to the R17 712 ceiling in the 2027 data)', () => {
  it.each([
    [0, 0],
    [10_000, 100], // 0.01 × 10 000, below the ceiling
    [17_712, 177.12], // 0.01 × 17 712, at the ceiling
    [17_712.01, 177.12], // capped
    [17_713, 177.12],
    [30_000, 177.12],
  ])('R%d a month -> R%d', (remuneration, expected) => {
    expect(uifMonthly(remuneration, tables)).toBeCloseTo(expected, 2);
  });

  it('reads the rate and ceiling from the tables', () => {
    // Fixture ceiling 10 000: 0.01 × 10 000
    expect(uifMonthly(20_000, fixtureTaxTables())).toBeCloseTo(100, 2);
  });

  it('rejects a negative amount', () => {
    expect(() => uifMonthly(-1, tables)).toThrow(RangeError);
  });
});
