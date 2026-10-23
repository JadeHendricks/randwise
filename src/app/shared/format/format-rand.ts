const ZAR = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });

/** South African rand, e.g. `R 1 234,56` (Intl uses non-breaking spaces). */
export function formatRand(amount: number): string {
  return ZAR.format(amount);
}

/** A fraction (0.16 = 16%) as an en-ZA percentage with up to `maxDigits` decimals. */
export function formatPercent(fraction: number, maxDigits = 1): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'percent',
    maximumFractionDigits: maxDigits,
  }).format(fraction);
}
