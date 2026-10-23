// Small text helpers for reading numbers out of SARS and SARB pages.

/** Non-breaking, narrow non-breaking and thin spaces become a plain space; runs collapse. */
export function norm(text) {
  return String(text ?? '')
    .replace(/[\u00a0\u202f\u2009]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * `'R17 820'` -> 17820. Only whole rands written as digits with spaces are accepted, so
 * `'R2.7 million'` gives null instead of a wrong 2.
 */
export function parseRand(text) {
  const match = /^R?\s*(\d+(?: \d{3})*)(?![\d.,])/.exec(norm(text));
  return match ? Number(match[1].replace(/ /g, '')) : null;
}

/** `'27.5%'` -> 0.275 (rounded to 6 places so 0.18 stays 0.18). */
export function parsePercent(text) {
  const match = /(\d+(?:[.,]\d+)?)\s*%/.exec(norm(text));
  if (!match) return null;
  return Number((Number(match[1].replace(',', '.')) / 100).toFixed(6));
}

/** `'245 101 – 383 100'` -> [245101, 383100]. Accepts an en dash, an em dash or a hyphen. */
export function splitRange(text) {
  const parts = norm(text).split(/\s*[\u2013\u2014-]\s*/);
  if (parts.length !== 2) return null;
  const [from, to] = parts.map(parseRand);
  return from === null || to === null ? null : [from, to];
}
