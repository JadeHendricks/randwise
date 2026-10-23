/** Negative, NaN and infinite values become 0 so a bad input can never draw a negative width. */
export function clampNonNegative(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Fractions of the (clamped) total. They sum to 1, or are all 0 when the total
 * is 0 so callers never divide by zero.
 */
export function shares(values: readonly number[]): number[] {
  const clamped = values.map(clampNonNegative);
  const total = clamped.reduce((sum, v) => sum + v, 0);
  return total > 0 ? clamped.map((v) => v / total) : clamped.map(() => 0);
}

/** Next 1, 2 or 5 times a power of ten at or above `n`; never below 1. */
export function niceCeil(n: number): number {
  if (!Number.isFinite(n) || n <= 1) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(n)));
  // Rounding noise (e.g. 1000.0000000001) must not jump a whole step.
  const ratio = n / power - 1e-9;
  const step = ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10;
  return step * power;
}

/** Linear map of `value` from [min, max] to [outMin, outMax]; a zero-width domain maps to `outMin`. */
export function scale(value: number, min: number, max: number, outMin: number, outMax: number): number {
  if (max === min) return outMin;
  return outMin + ((value - min) / (max - min)) * (outMax - outMin);
}
