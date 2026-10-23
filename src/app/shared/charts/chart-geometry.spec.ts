import { clampNonNegative, niceCeil, scale, shares } from './chart-geometry';

describe('chart-geometry', () => {
  describe('clampNonNegative', () => {
    it('keeps positive finite values', () => {
      expect(clampNonNegative(12.5)).toBe(12.5);
      expect(clampNonNegative(0)).toBe(0);
    });

    it('turns negative, NaN and infinite values into 0', () => {
      expect(clampNonNegative(-3)).toBe(0);
      expect(clampNonNegative(Number.NaN)).toBe(0);
      expect(clampNonNegative(Number.POSITIVE_INFINITY)).toBe(0);
      expect(clampNonNegative(Number.NEGATIVE_INFINITY)).toBe(0);
    });
  });

  describe('shares', () => {
    it('returns fractions that sum to 1', () => {
      const result = shares([1, 1, 2]);
      expect(result).toEqual([0.25, 0.25, 0.5]);
      expect(result.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    });

    it('returns all zeros for an empty list or a zero total', () => {
      expect(shares([])).toEqual([]);
      expect(shares([0, 0, 0])).toEqual([0, 0, 0]);
    });

    it('treats negative and NaN values as 0', () => {
      expect(shares([-5, Number.NaN, 10])).toEqual([0, 0, 1]);
    });
  });

  describe('niceCeil', () => {
    it('rounds up to 1, 2 or 5 times a power of ten', () => {
      expect(niceCeil(1.2)).toBe(2);
      expect(niceCeil(3)).toBe(5);
      expect(niceCeil(5)).toBe(5);
      expect(niceCeil(5.1)).toBe(10);
      expect(niceCeil(30_000)).toBe(50_000);
      expect(niceCeil(45_000)).toBe(50_000);
      expect(niceCeil(62_000)).toBe(100_000);
      expect(niceCeil(1000)).toBe(1000);
    });

    it('never goes below 1 and survives bad input', () => {
      expect(niceCeil(0)).toBe(1);
      expect(niceCeil(-10)).toBe(1);
      expect(niceCeil(0.2)).toBe(1);
      expect(niceCeil(Number.NaN)).toBe(1);
      expect(niceCeil(Number.POSITIVE_INFINITY)).toBe(1);
    });
  });

  describe('scale', () => {
    it('maps linearly between ranges', () => {
      expect(scale(5, 0, 10, 0, 100)).toBe(50);
      expect(scale(0, -10, 10, 0, 200)).toBe(100);
    });

    it('supports an inverted output range (svg y axis)', () => {
      expect(scale(0, 0, 10, 260, 0)).toBe(260);
      expect(scale(10, 0, 10, 260, 0)).toBe(0);
    });

    it('returns the output minimum for a zero-width domain', () => {
      expect(scale(4, 4, 4, 10, 20)).toBe(10);
    });
  });
});
