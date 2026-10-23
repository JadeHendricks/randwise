// Turns what the parser found into a complete tax-year file, never guessing.
// Loaded after register-ts.mjs (or inside Vitest), which is why the .ts imports work.
import { taxYearPeriod } from '../../../src/app/core/data/tax-calendar.ts';
import { TAX_YEAR_FIELD_KEYS } from '../../../src/app/core/data/tax-year.schema.ts';
import { checkUnit } from './checks.mjs';

const UNCHANGED = 'table (unchanged per SARS)';

/*
 * A unit is the smallest group of fields that is accepted or rejected together. The brackets,
 * rebates and thresholds cross-check each other, so they move as one; every other field stands
 * alone.
 */
const TRIO = ['incomeTaxBrackets', 'rebates', 'thresholds'];
export const UNITS = [
  TRIO,
  ...TAX_YEAR_FIELD_KEYS.filter((key) => !TRIO.includes(key)).map((key) => [key]),
];

const isKeepable = (existing, key) => {
  const field = existing?.[key];
  return (
    typeof field === 'object' &&
    field !== null &&
    field.carriedForward === false &&
    'value' in field &&
    typeof field.source === 'string'
  );
};

/** Why a field of a unit that was never checked falls back. */
function notScrapedReasons(key, missing, notes) {
  if (missing.includes(key)) {
    return [notes.find((note) => note.key === key)?.reason ?? 'not found'];
  }
  // Found, but a field it must be checked with was not.
  return [`${missing.join(', ')} not found, and ${key} is only accepted together with it`];
}

/**
 * Builds the file for `year`.
 *
 * - `previous`: last year's validated file. `existing`: an earlier draft of this year or null.
 * - `extracted`: `{ field: { value, source, how } }` from parse-sars.mjs (absent = not found).
 * - `notes`: optional `[{ key, reason }]` from parse-sars.mjs, used as the reason a field was
 *   not scraped.
 *
 * A unit is scraped only when all its fields were found and every check passes. Otherwise the
 * whole unit falls back, in this order: the value already confirmed in an existing draft, then
 * last year's value flagged `carriedForward: true`. The status is `verified-auto` only when every
 * field was scraped this run; anything else is `draft`.
 *
 * Returns `{ file, decisions, checks, status }`. `decisions[field]` is `{ origin, reasons,
 * scraped?, rejected? }` with `origin` one of `scraped`, `unchanged-per-sars`, `kept-from-draft`,
 * `carried-forward`; `scraped` holds a value that was found but rejected, and `rejected` is true
 * for it. `checks` lists each unit that was checked, with its results.
 */
export function buildCandidate({ year, today, previous, existing = null, extracted, notes = [] }) {
  const fields = {};
  const decisions = {};
  const checks = [];

  for (const unit of UNITS) {
    const missing = unit.filter((key) => !extracted[key]);
    let reasons = [];
    let rejectedValues = null;

    if (missing.length === 0) {
      const scrapedValues = Object.fromEntries(unit.map((key) => [key, extracted[key].value]));
      const sourcesForUnit = Object.fromEntries(unit.map((key) => [key, extracted[key].source]));
      const result = checkUnit(unit, scrapedValues, previous, { year, today, sourcesForUnit });
      checks.push({ keys: unit, ok: result.ok, results: result.results });

      if (result.ok) {
        for (const key of unit) {
          fields[key] = {
            value: extracted[key].value,
            carriedForward: false,
            source: extracted[key].source,
          };
          decisions[key] = {
            origin: extracted[key].how === UNCHANGED ? 'unchanged-per-sars' : 'scraped',
            reasons: [],
            ...(extracted[key].note ? { note: extracted[key].note } : {}),
          };
        }
        continue;
      }
      reasons = result.results.flatMap((r) => r.messages);
      rejectedValues = scrapedValues;
    }

    // Fallback for the whole unit.
    const keep = unit.every((key) => isKeepable(existing, key));
    for (const key of unit) {
      if (keep) {
        const { value, source } = existing[key];
        fields[key] = { value: structuredClone(value), carriedForward: false, source };
      } else {
        fields[key] = {
          value: structuredClone(previous[key].value),
          carriedForward: true,
          source: previous[key].source,
        };
      }
      decisions[key] = {
        origin: keep ? 'kept-from-draft' : 'carried-forward',
        reasons: rejectedValues !== null ? reasons : notScrapedReasons(key, missing, notes),
        ...(rejectedValues !== null
          ? { scraped: structuredClone(rejectedValues[key]), rejected: true }
          : {}),
      };
    }
  }

  const ordered = Object.fromEntries(TAX_YEAR_FIELD_KEYS.map((key) => [key, fields[key]]));
  const sources = [...new Set(TAX_YEAR_FIELD_KEYS.map((key) => ordered[key].source))];
  const allScraped = TAX_YEAR_FIELD_KEYS.every((key) =>
    ['scraped', 'unchanged-per-sars'].includes(decisions[key].origin),
  );

  const file = {
    taxYear: year,
    period: taxYearPeriod(year),
    status: allScraped ? 'verified-auto' : 'draft',
    verifiedOn: today,
    sources,
    ...ordered,
  };
  return { file, decisions, checks, status: file.status };
}
