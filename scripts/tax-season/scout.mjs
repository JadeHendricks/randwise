// `npm run tax:scout -- --year 2028`: builds the tax-year file for a year from the SARS pages.
// The TypeScript hook must be registered before anything that imports the app's data modules,
// so everything else is loaded with dynamic import() below.
import './lib/register-ts.mjs';

const USAGE = `Usage: npm run tax:scout -- [--year YYYY]

  --year YYYY   the tax year to scout, by the year it ends (2028 = 1 March 2027 to 29 February 2028).
                Default: the year starting next 1 March.

Reads the SARS pages listed in scripts/tax-season/sources.json and writes
src/assets/data/tax-years/<YYYY>.json. A verified file is never overwritten.`;

/** `['--year', '2028']` or `['--year=2028']` -> 2028; no option -> null; anything else -> undefined. */
function parseYear(args) {
  if (args.length === 0) return null;
  let text;
  if (args.length === 2 && args[0] === '--year') text = args[1];
  else if (args.length === 1 && args[0].startsWith('--year=')) text = args[0].slice(7);
  else return undefined;
  return /^\d{4}$/.test(text) ? Number(text) : undefined;
}

const requested = parseYear(process.argv.slice(2));
if (requested === undefined) {
  console.error(USAGE);
  process.exitCode = 1;
} else {
  try {
    const { main } = await import('./lib/scout-main.mjs');
    await main(requested);
  } catch (error) {
    console.error(`[tax-season] ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
