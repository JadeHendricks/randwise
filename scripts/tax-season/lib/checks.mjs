// Consistency checks on scraped values. Pure: no I/O, so every rule is easy to test.
// Loaded after register-ts.mjs (or inside Vitest), which is why the .ts imports work.
import {
  findBracketProblems,
  findThresholdProblems,
} from '../../../src/app/core/data/bracket-checks.ts';
import { taxYearPeriod } from '../../../src/app/core/data/tax-calendar.ts';
import { validateTaxYearFile } from '../../../src/app/core/data/tax-year.validator.ts';

/** A value that moved more than this from last year is treated as a misread, not a real change. */
export const MAX_YEAR_CHANGE = 0.25;

const BRACKET_KEYS = ['incomeTaxBrackets', 'retirementLumpSum', 'withdrawalLumpSum'];
const TRIO = ['incomeTaxBrackets', 'rebates', 'thresholds'];

/** `4.04` -> `'+4.0%'`, `-12` -> `'-12.0%'`, null (last year was 0) -> `'new'`. */
export function formatPercentChange(pct) {
  if (pct === null) return 'new';
  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0) return '0.0%';
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}%`;
}

const isContainer = (value) => typeof value === 'object' && value !== null;

/**
 * Compares last year's value with the new one, leaf by leaf (`incomeTaxBrackets[1].base`).
 * A leaf that moved more than `tolerance` (25%) is a problem, as is a leaf that was 0 and is not
 * any more, a changed shape (different keys or a different number of bracket rows), or a null that
 * is not null on both sides. `changes` lists every leaf that differs, for the report.
 *
 * Returns `{ ok, problems: string[], changes: [{ path, previous, next, pct }] }`; `pct` is the
 * change in percent (null when last year was 0).
 */
export function compareYears(
  previousValue,
  nextValue,
  { tolerance = MAX_YEAR_CHANGE, path = 'value' } = {},
) {
  const problems = [];
  const changes = [];

  function walk(previous, next, at) {
    if (isContainer(previous) || isContainer(next)) {
      if (Array.isArray(previous) && Array.isArray(next)) {
        if (previous.length !== next.length) {
          problems.push(
            `${at} structure changed: ${previous.length} rows last year, ${next.length} now.`,
          );
          return;
        }
        previous.forEach((item, i) => walk(item, next[i], `${at}[${i}]`));
        return;
      }
      if (
        isContainer(previous) &&
        isContainer(next) &&
        !Array.isArray(previous) &&
        !Array.isArray(next)
      ) {
        const before = Object.keys(previous).sort();
        const after = Object.keys(next).sort();
        if (before.join() !== after.join()) {
          problems.push(
            `${at} structure changed: it had ${before.join(', ')} last year and has ` +
              `${after.join(', ')} now.`,
          );
          return;
        }
        before.forEach((key) => walk(previous[key], next[key], `${at}.${key}`));
        return;
      }
      problems.push(`${at} structure changed: its shape is different from last year.`);
      return;
    }

    if (typeof previous === 'number' && typeof next === 'number') {
      if (previous === next) return;
      const pct = previous === 0 ? null : ((next - previous) / Math.abs(previous)) * 100;
      changes.push({ path: at, previous, next, pct });
      if (previous === 0) {
        problems.push(`${at} was 0 last year and is ${next} now.`);
      } else if (Math.abs(next - previous) / Math.abs(previous) > tolerance + 1e-9) {
        problems.push(
          `${at} changed by ${formatPercentChange(pct)} (${previous} to ${next}), more than ` +
            `the ${Math.round(tolerance * 100)}% allowed in one year.`,
        );
      }
      return;
    }

    if (previous !== next) {
      changes.push({ path: at, previous, next, pct: null });
      problems.push(`${at} changed from ${String(previous)} to ${String(next)}.`);
    }
  }

  walk(previousValue, nextValue, path);
  return { ok: problems.length === 0, problems, changes };
}

/** Bracket-table problems as `{ id: 'brackets-<check>', message }`. */
export function checkBrackets(key, rows) {
  return findBracketProblems(key, rows).map((problem) => ({
    id: `brackets-${problem.check}`,
    message: problem.message,
  }));
}

/** Threshold problems (thresholds = rebates / lowest rate) as `{ id: 'thresholds', message }`. */
export function checkThresholds(brackets, rebates, thresholds) {
  return findThresholdProblems(brackets, rebates, thresholds).map((message) => ({
    id: 'thresholds',
    message,
  }));
}

/**
 * Runs every check for one unit (see build-candidate.mjs) on its scraped values:
 *  1. brackets: the table rules for each bracket table in the unit,
 *  2. thresholds: only for the brackets + rebates + thresholds trio,
 *  3. year-on-year: each field against last year,
 *  4. validator: a copy of last year's file with only this unit swapped in must pass the app's
 *     own validateTaxYearFile.
 *
 * `scrapedValues` maps field key -> value, `sourcesForUnit` maps field key -> source URL.
 * Returns `{ ok, results: [{ id, ok, messages }] }`.
 */
export function checkUnit(unitKeys, scrapedValues, previousFile, { year, today, sourcesForUnit }) {
  const results = [];
  const add = (id, messages) => results.push({ id, ok: messages.length === 0, messages });

  const bracketKeys = unitKeys.filter((key) => BRACKET_KEYS.includes(key));
  if (bracketKeys.length > 0) {
    add(
      'brackets',
      bracketKeys.flatMap((key) =>
        checkBrackets(key, scrapedValues[key]).map((problem) => problem.message),
      ),
    );
  }

  if (TRIO.every((key) => unitKeys.includes(key))) {
    add(
      'thresholds',
      checkThresholds(
        scrapedValues.incomeTaxBrackets,
        scrapedValues.rebates,
        scrapedValues.thresholds,
      ).map((problem) => problem.message),
    );
  }

  add(
    'year-on-year',
    unitKeys.flatMap(
      (key) => compareYears(previousFile[key].value, scrapedValues[key], { path: key }).problems,
    ),
  );

  const probe = {
    ...previousFile,
    taxYear: year,
    period: taxYearPeriod(year),
    status: 'draft',
    verifiedOn: today,
    sources: [...new Set([...previousFile.sources, ...Object.values(sourcesForUnit)])],
  };
  for (const key of unitKeys) {
    probe[key] = { value: scrapedValues[key], carriedForward: false, source: sourcesForUnit[key] };
  }
  const validated = validateTaxYearFile(probe, `${year}.json`);
  add('validator', validated.ok ? [] : validated.errors);

  return { ok: results.every((result) => result.ok), results };
}
