import { assertAmount, assertWholeNumber, roundRand } from './money';

describe('roundRand', () => {
  it.each([
    [4_681, 4_681],
    // 1.005 is stored as 1.00499999…, so a naive round gives 1.00; the nudge gives 1.01.
    [1.005, 1.01],
    // 0.1 + 0.2 = 0.30000000000000004
    [0.1 + 0.2, 0.3],
    // Half away from zero on the negative side too.
    [-1.005, -1.01],
    // 25 141.875 is exact in binary; half a cent rounds up.
    [25_141.875, 25_141.88],
  ])('rounds %d to %d', (amount, expected) => {
    expect(roundRand(amount)).toBe(expected);
  });

  it('normalises negative zero to 0', () => {
    expect(Object.is(roundRand(-0.001), 0)).toBe(true);
  });
});

describe('assertAmount', () => {
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('rejects %d and names the field', (value) => {
    expect(() => assertAmount('gross', value)).toThrow(RangeError);
    expect(() => assertAmount('gross', value)).toThrow(/gross/);
  });

  it('accepts 0 and positive amounts', () => {
    expect(() => assertAmount('gross', 0)).not.toThrow();
    expect(() => assertAmount('gross', 12.34)).not.toThrow();
  });
});

describe('assertWholeNumber', () => {
  it('rejects fractions, negatives and values above the max', () => {
    expect(() => assertWholeNumber('age', 1.5)).toThrow(RangeError);
    expect(() => assertWholeNumber('age', -1)).toThrow(/age/);
    expect(() => assertWholeNumber('months', 13, 12)).toThrow(RangeError);
  });

  it('accepts 0 and the max', () => {
    expect(() => assertWholeNumber('age', 0)).not.toThrow();
    expect(() => assertWholeNumber('months', 12, 12)).not.toThrow();
  });
});
