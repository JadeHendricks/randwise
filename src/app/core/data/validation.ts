/** Small shared helpers for the pure data validators. No Angular. */

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

const RAND = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 2 });

/** `79998` -> `R79 998` (spaces normalised so messages read the same everywhere). */
export function formatRand(amount: number): string {
  return `R${RAND.format(amount).replace(/[\u00a0\u202f]/g, ' ')}`;
}
