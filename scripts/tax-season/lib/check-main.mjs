// Real adapters for check.mjs. Loaded with import() after register-ts.mjs.
import { isIsoDate, toLocalIsoDate } from '../../../src/app/core/data/tax-calendar.ts';
import { createFetchText, createNodeFs } from './io.mjs';
import { PATHS } from './paths.mjs';
import { runCheck } from './run-check.mjs';

const PREFIX = '[tax-season]';

/** `TAX_SEASON_TODAY=YYYY-MM-DD` overrides today for manual testing; anything invalid is ignored. */
function resolveToday() {
  const override = process.env.TAX_SEASON_TODAY;
  return isIsoDate(override) ? override : toLocalIsoDate(new Date());
}

const tag = (line) => (line.startsWith(PREFIX) ? line : `${PREFIX} ${line}`);

export async function main() {
  const fs = createNodeFs();
  const sourcesText = await fs.readText(PATHS.sources);
  if (sourcesText === null) throw new Error(`${PATHS.sources} is missing.`);
  const sources = JSON.parse(sourcesText);

  // SARB answers fast and is one request; SARS pages are slower, so they get longer.
  const sarbFetch = createFetchText({ timeoutMs: 8000 });
  const pageFetch = createFetchText({ timeoutMs: 10000 });
  const fetchText = (url) => (url === sources.sarb.url ? sarbFetch(url) : pageFetch(url));

  await runCheck({
    today: resolveToday(),
    fs,
    fetchText,
    sources,
    paths: PATHS,
    log: {
      info: (line) => console.log(tag(line)),
      warn: (line) => console.warn(tag(line)),
    },
  });
}
