/** Intl output uses non-breaking spaces; normalise so specs can compare plain text. */
export function normaliseSpaces(value: string | null | undefined): string {
  return (value ?? '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
}
