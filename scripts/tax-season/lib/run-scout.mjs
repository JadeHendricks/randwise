// The scout: reads the SARS pages, builds next year's tax-year file and writes it.
// Loaded after register-ts.mjs (or inside Vitest), which is why the .ts imports work.
import { validateTaxYearFile } from '../../../src/app/core/data/tax-year.validator.ts';
import { buildCandidate } from './build-candidate.mjs';
import { extractAll } from './parse-sars.mjs';
import { registerNewYears } from './render-bundled-data.mjs';
import { renderConsole, renderReport } from './report.mjs';

const silent = { info() {}, warn() {} };

/** A failure the person running the scout can act on (message is shown as it is). */
export class ScoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ScoutError';
  }
}

const messageOf = (error) => (error instanceof Error ? error.message : String(error));

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** A validated tax-year file, or null when it is missing or invalid. */
async function readValidTaxYear(fs, path, fileName) {
  const text = await fs.readText(path);
  if (text === null) return null;
  const checked = validateTaxYearFile(parseJson(text), fileName);
  return checked.ok ? checked.value : null;
}

/**
 * Scouts tax year `year`.
 *
 * Reads last year's file (required), fetches every page in `sources.sars`, builds the new file
 * and writes `<year>.json`, regenerates bundled-data.ts and writes the report. It never
 * overwrites a verified file, skips a draft already checked today, and writes nothing to the
 * tax-years folder unless the finished file passes validateTaxYearFile. The report is written on
 * every run that gets past loading last year's file, even one that stops with an error.
 *
 * Returns `{ year, status, written, confirmed, carried, rejected, reportPath }`, or
 * `{ year, skipped, written: false }` when the draft was already checked today.
 */
export async function runScout({ year, today, fs, fetchText, sources, paths, log = silent }) {
  const previousYear = year - 1;

  const previous = await readValidTaxYear(
    fs,
    paths.taxYearFile(previousYear),
    `${previousYear}.json`,
  );
  if (!previous) {
    throw new ScoutError(`cannot scout ${year}: the ${previousYear} file is missing or invalid`);
  }

  let existing = null;
  const existingText = await fs.readText(paths.taxYearFile(year));
  if (existingText !== null) {
    const parsed = parseJson(existingText);
    if (parsed === null || typeof parsed !== 'object') {
      throw new ScoutError(`${year}.json is not valid JSON; fix or delete it first`);
    }
    if (parsed.status !== 'draft') {
      throw new ScoutError(`${year}.json is already ${parsed.status}; delete it first to re-scout`);
    }
    if (parsed.verifiedOn === today) {
      log.info(`[tax-season] ${year}.json is a draft already checked today, skipping`);
      return { year, skipped: 'already checked today', written: false };
    }
    existing = parsed;
  }

  // Everything below can fail after the pages were fetched; the report still gets written.
  const fetchErrors = [];
  const writeFailureReport = async (error) => {
    try {
      await fs.writeText(
        paths.report,
        renderReport({ year, today, previous, fetchErrors, error: messageOf(error) }),
      );
    } catch (writeError) {
      log.warn(`[tax-season] could not write the report (${messageOf(writeError)})`);
    }
  };

  const pages = {};
  const urls = Object.entries(sources.sars);
  const settled = await Promise.allSettled(
    urls.map(([, url]) => Promise.resolve().then(() => fetchText(url))),
  );
  settled.forEach((result, i) => {
    const [page, url] = urls[i];
    if (result.status === 'fulfilled') pages[page] = result.value;
    else fetchErrors.push({ page, url, message: messageOf(result.reason) });
  });

  let candidate;
  let notes;
  try {
    if (Object.keys(pages).length === 0) {
      throw new ScoutError('offline: none of the SARS pages could be fetched');
    }
    const extraction = extractAll(pages, year, sources.sars);
    notes = extraction.notes;
    candidate = buildCandidate({
      year,
      today,
      previous,
      existing,
      extracted: extraction.extracted,
      notes,
    });

    const checked = validateTaxYearFile(candidate.file, `${year}.json`);
    if (!checked.ok) {
      throw new ScoutError(
        `the ${year} file built from the SARS pages failed validation, so nothing was written:\n` +
          checked.errors.map((error) => `  - ${error}`).join('\n'),
      );
    }
  } catch (error) {
    await writeFailureReport(error);
    throw error;
  }

  const { file, decisions, checks, status } = candidate;
  await fs.writeText(paths.taxYearFile(year), `${JSON.stringify(file, null, 2)}\n`);
  await registerNewYears({ fs, paths });
  await fs.writeText(
    paths.report,
    renderReport({ year, today, previous, file, decisions, status, checks, fetchErrors }),
  );
  for (const line of renderConsole({ year, previous, file, decisions, status })) log.info(line);

  const carried = Object.keys(file).filter((key) => file[key]?.carriedForward === true);
  return {
    year,
    status,
    written: true,
    confirmed: Object.keys(decisions).length - carried.length,
    carried,
    rejected: Object.keys(decisions).filter((key) => decisions[key].rejected),
    reportPath: paths.report,
  };
}
