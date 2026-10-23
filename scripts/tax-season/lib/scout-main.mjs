// Real adapters for scout.mjs. Loaded with import() after register-ts.mjs.
import {
  isIsoDate,
  nextTaxYearToScout,
  taxYearEndingOn,
  toLocalIsoDate,
} from '../../../src/app/core/data/tax-calendar.ts';
import { createFetchText, createNodeFs } from './io.mjs';
import { PATHS } from './paths.mjs';
import { runScout } from './run-scout.mjs';

const SARS_TIMEOUT_MS = 10_000;

/** `TAX_SEASON_TODAY=YYYY-MM-DD` overrides today for manual testing. */
function resolveToday() {
  const override = process.env.TAX_SEASON_TODAY;
  if (override === undefined || override === '') return toLocalIsoDate(new Date());
  if (!isIsoDate(override)) throw new Error('TAX_SEASON_TODAY must be a real date as YYYY-MM-DD.');
  return override;
}

/** Runs the scout for `requestedYear` (a number) or, when null, the year starting next 1 March. */
export async function main(requestedYear) {
  const today = resolveToday();
  const year = requestedYear ?? nextTaxYearToScout(today) ?? taxYearEndingOn(today) + 1;

  const fs = createNodeFs();
  const sourcesText = await fs.readText(PATHS.sources);
  if (sourcesText === null) throw new Error(`${PATHS.sources} is missing.`);

  await runScout({
    year,
    today,
    fs,
    fetchText: createFetchText({ timeoutMs: SARS_TIMEOUT_MS }),
    sources: JSON.parse(sourcesText),
    paths: PATHS,
    log: { info: (line) => console.log(line), warn: (line) => console.warn(line) },
  });
}
