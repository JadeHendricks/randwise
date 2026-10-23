// What `npm start` runs first: keeps rates.json fresh and, from 20 February, scouts next year's
// tax-year file. Loaded after register-ts.mjs (or inside Vitest), which is why the .ts imports work.
import {
  nextTaxYearToScout,
  taxYearEndingOn,
} from '../../../src/app/core/data/tax-calendar.ts';
import { refreshRates } from './rates-refresh.mjs';
import { runScout } from './run-scout.mjs';

const silent = { info() {}, warn() {} };
const messageOf = (error) => (error instanceof Error ? error.message : String(error));

/**
 * Never throws: every step has its own try/catch, so a failure in one never stops the other
 * and never blocks the dev server. The caller must not exit the process either.
 */
export async function runCheck({
  today,
  fs,
  fetchText,
  sources,
  paths,
  scout = runScout,
  log = silent,
}) {
  await checkRates({ today, fs, fetchText, sources, paths, log });
  await checkSeason({ today, fs, fetchText, sources, paths, scout, log });
}

async function checkRates({ today, fs, fetchText, sources, paths, log }) {
  try {
    // refreshRates' own warning is muted: the one summary line below says the same thing.
    const result = await refreshRates({ today, fs, fetchText, sources, paths, log: silent });
    if (result.action === 'fresh') log.info(`rates: fresh (fetched ${result.fetchedOn})`);
    else if (result.action === 'updated') log.info('rates: updated from SARB');
    else if (result.fetchedOn) {
      log.warn(`rates: SARB unreachable, keeping ${result.fetchedOn} (${result.reason})`);
    } else log.warn(`rates: SARB unreachable and no saved rates (${result.reason})`);
  } catch (error) {
    log.warn(`rates: skipped (${messageOf(error)})`);
  }
}

async function checkSeason({ today, fs, fetchText, sources, paths, scout, log }) {
  try {
    const target = nextTaxYearToScout(today);
    if (target === null) {
      log.info(`tax data: current year ${taxYearEndingOn(today)}, scouting opens 20 Feb`);
      return;
    }

    const status = readStatus(await fs.readText(paths.taxYearFile(target)));
    if (status === 'verified' || status === 'verified-auto') {
      log.info(`tax data: ${target} already ${status}`);
      return;
    }

    // Missing, unreadable or draft: look for the new SARS figures.
    await scout({ year: target, today, fs, fetchText, sources, paths, log });
  } catch (error) {
    log.warn(`tax data: scout skipped (${messageOf(error)})`);
  }
}

/** The `status` of a tax-year file's text, or null when it is missing or unreadable. */
function readStatus(text) {
  if (text === null || text === undefined) return null;
  try {
    const status = JSON.parse(text)?.status;
    return typeof status === 'string' ? status : null;
  } catch {
    return null;
  }
}
