import { shippedTaxTables2027 } from '../../testing/tax-tables';
import { findBracket, incomeTax } from './income-tax';

const tables = shippedTaxTables2027();

describe('incomeTax (2026/27 brackets)', () => {
  // tax = base + rate × (income − above). An income exactly on an upper bound stays in the lower row.
  it.each([
    [0, 0], // 0 + 0.18 × 0
    [1, 0.18], // 0.18 × 1
    [245_100, 44_118], // 0.18 × 245 100
    [245_100.5, 44_118.13], // 44 118 + 0.26 × 0.5 (fractional income moves to row 2)
    [245_101, 44_118.26], // 44 118 + 0.26 × 1
    [360_000, 73_992], // 44 118 + 0.26 × 114 900 = 44 118 + 29 874
    [383_100, 79_998], // 44 118 + 0.26 × 138 000 = 44 118 + 35 880
    [383_101, 79_998.31], // 79 998 + 0.31 × 1
    [530_200, 125_599], // 79 998 + 0.31 × 147 100 = 79 998 + 45 601
    [530_201, 125_599.36], // 125 599 + 0.36 × 1
    [695_800, 185_215], // 125 599 + 0.36 × 165 600 = 125 599 + 59 616
    [695_801, 185_215.39], // 185 215 + 0.39 × 1
    [887_000, 259_783], // 185 215 + 0.39 × 191 200 = 185 215 + 74 568
    [887_001, 259_783.41], // 259 783 + 0.41 × 1
    [1_878_600, 666_339], // 259 783 + 0.41 × 991 600 = 259 783 + 406 556
    [1_878_601, 666_339.45], // 666 339 + 0.45 × 1
    [2_000_000, 720_969], // 666 339 + 0.45 × 121 400 = 666 339 + 54 630
  ])('taxes R%d at R%d', (income, expected) => {
    expect(incomeTax(income, tables)).toBeCloseTo(expected, 2);
  });

  it('rebuilds every bracket base from the lower brackets of the shipped data', () => {
    const rows = tables.brackets;
    let cumulative = 0;
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      cumulative += prev.rate * ((prev.upTo as number) - prev.above);
      expect(rows[i].base).toBeCloseTo(cumulative, 2);
      // The schedule is continuous: tax at the previous upper bound equals this row's base.
      expect(incomeTax(prev.upTo as number, tables)).toBeCloseTo(rows[i].base, 2);
    }
  });

  it('rejects negative and non-finite income', () => {
    expect(() => incomeTax(-1, tables)).toThrow(RangeError);
    expect(() => incomeTax(Number.NaN, tables)).toThrow(RangeError);
  });
});

describe('findBracket', () => {
  it('keeps an income on an upper bound in that row and moves anything above it to the next', () => {
    const rows = tables.brackets;
    for (let i = 0; i < rows.length - 1; i++) {
      const upTo = rows[i].upTo as number;
      expect(findBracket(upTo, rows)).toBe(rows[i]);
      expect(findBracket(upTo + 0.01, rows)).toBe(rows[i + 1]);
    }
  });

  it('uses the open top row for very high incomes', () => {
    expect(findBracket(10_000_000, tables.brackets)).toBe(tables.brackets[6]);
  });

  it('throws on a table with no row for the income', () => {
    expect(() => findBracket(10, [{ above: 0, upTo: 5, base: 0, rate: 0.1 }])).toThrow(Error);
  });
});
