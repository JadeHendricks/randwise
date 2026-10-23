const ZAR = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });

/** South African rand, e.g. `R 1 234,56` (Intl uses non-breaking spaces). */
export function formatRand(amount: number): string {
  return ZAR.format(amount);
}

const ZAR_WHOLE = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
});

/** South African rand without cents, e.g. `R 8 250`. For plan sentences, not exact figures. */
export function formatRandWhole(amount: number): string {
  return ZAR_WHOLE.format(amount);
}

const ZAR_COMPACT = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Short rand for chart axes, e.g. `R 12,5K`, `R 1,5M`. Not for figures people read as exact. */
export function formatRandCompact(amount: number): string {
  return ZAR_COMPACT.format(amount);
}

/** A fraction (0.16 = 16%) as an en-ZA percentage with up to `maxDigits` decimals. */
export function formatPercent(fraction: number, maxDigits = 1): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'percent',
    maximumFractionDigits: maxDigits,
  }).format(fraction);
}
