/**
 * Money helpers for the tax engine. The engine works in full-precision rands and never rounds its
 * own outputs; callers round once, at presentation, with `roundRand`.
 */

export const MONTHS_PER_YEAR = 12;

/**
 * A tiny nudge (a millionth of a cent) so values like 1.005, stored as 1.00499999…, round the way a
 * person working on paper would.
 */
const CENT_NUDGE = 1e-6;

/**
 * Rounds rands to cents, half away from zero, and normalises -0 to 0.
 * The single rounding point for engine results: use it only at the presentation boundary.
 */
export function roundRand(amount: number): number {
  const cents = Math.round(Math.abs(amount) * 100 + CENT_NUDGE);
  const rounded = (Math.sign(amount) * cents) / 100;
  return rounded === 0 ? 0 : rounded;
}

/** Throws a RangeError naming the field unless `value` is a finite amount of 0 or more. */
export function assertAmount(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite amount of 0 or more, got ${value}`);
  }
}

/** Throws a RangeError naming the field unless `value` is a whole number from 0 to `max`. */
export function assertWholeNumber(
  name: string,
  value: number,
  max = Number.MAX_SAFE_INTEGER,
): void {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new RangeError(`${name} must be a whole number from 0 to ${max}, got ${value}`);
  }
}
