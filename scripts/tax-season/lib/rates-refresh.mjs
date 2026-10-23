// Refreshes src/assets/data/rates.json from the SARB home-page rates endpoint.
// Loaded after register-ts.mjs (or inside Vitest), which is why the .ts imports work.
import { RATE_KEYS } from '../../../src/app/core/data/rates.schema.ts';
import { validateRatesFile } from '../../../src/app/core/data/rates.validator.ts';
import { daysBetween } from '../../../src/app/core/data/tax-calendar.ts';

/** The snapshot is refreshed once it is older than this many days. */
const MAX_AGE_DAYS = 7;

const silent = { info() {}, warn() {} };

export class RatesRefreshError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RatesRefreshError';
  }
}

/**
 * Turns the SARB HomePageRates array into a rates.json object.
 * The array also holds rows we ignore (PPI, exchange rates, ...). Throws RatesRefreshError when
 * a wanted series is missing or the result fails the app's own validation, so a changed SARB
 * response never reaches the file.
 */
export function parseSarbRates(rows, { sources, today }) {
  if (!Array.isArray(rows)) throw new RatesRefreshError('SARB answer is not a list of rates.');

  const byCode = new Map();
  for (const row of rows) {
    if (row && typeof row === 'object' && typeof row.TimeseriesCode === 'string') {
      byCode.set(row.TimeseriesCode, row);
    }
  }

  const rates = {};
  for (const key of RATE_KEYS) {
    const seriesCode = sources.sarb.series[key];
    const row = byCode.get(seriesCode);
    if (!row) throw new RatesRefreshError(`SARB answer has no row for ${key} (${seriesCode}).`);
    rates[key] = {
      label: row.Name,
      valuePercent: Number(row.Value),
      asOf: String(row.Date).slice(0, 10),
      seriesCode,
    };
  }

  const file = { source: sources.sarb.url, fetchedOn: today, rates };
  const checked = validateRatesFile(file, 'rates.json');
  if (!checked.ok) {
    // An asOf after today means this computer's clock is behind SARB's.
    throw new RatesRefreshError(`SARB rates failed validation: ${checked.errors.join(' ')}`);
  }
  return file;
}

/** Whether the file text should be replaced: it is missing, invalid, or older than 7 days. */
export function ratesNeedRefresh(existingText, today) {
  if (existingText === null || existingText === undefined) {
    return { refresh: true, reason: 'missing' };
  }
  let data;
  try {
    data = JSON.parse(existingText);
  } catch {
    return { refresh: true, reason: 'invalid' };
  }
  const checked = validateRatesFile(data, 'rates.json');
  if (!checked.ok) return { refresh: true, reason: 'invalid' };

  const age = daysBetween(checked.value.fetchedOn, today);
  if (age > MAX_AGE_DAYS) return { refresh: true, reason: `${age} days old` };
  return { refresh: false, reason: `fetched ${checked.value.fetchedOn}` };
}

/**
 * Brings rates.json up to date when it is stale. Never throws and never damages the file:
 * on any failure the old file stays as it was.
 * Returns `{ action: 'fresh' | 'updated' | 'failed', reason, fetchedOn }`, where `fetchedOn` is
 * the date of the file now on disk (null when there is none).
 */
export async function refreshRates({ today, fs, fetchText, sources, paths, log = silent }) {
  let existing = null;
  try {
    existing = await fs.readText(paths.ratesFile);
    const need = ratesNeedRefresh(existing, today);
    const currentDate = readFetchedOn(existing);
    if (!need.refresh) return { action: 'fresh', reason: need.reason, fetchedOn: currentDate };

    const rows = JSON.parse(await fetchText(sources.sarb.url));
    const file = parseSarbRates(rows, { sources, today });
    await fs.writeText(paths.ratesFile, `${JSON.stringify(file, null, 2)}\n`);
    return { action: 'updated', reason: need.reason, fetchedOn: today };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.warn(`rates: could not refresh from SARB (${reason})`);
    return { action: 'failed', reason, fetchedOn: readFetchedOn(existing) };
  }
}

function readFetchedOn(text) {
  try {
    const value = JSON.parse(text)?.fetchedOn;
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}
