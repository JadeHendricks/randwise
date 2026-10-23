// Writes src/app/core/data/bundled-data.ts. A tax-year JSON file is invisible to the app until
// that file imports it, so the scout regenerates it whenever it adds a year.
//
// The output for [2027] must equal the committed file exactly (a golden spec checks it), so
// change this template and bundled-data.ts together.

const YEAR_FILE = /^(\d{4})\.json$/;

/** Source text of bundled-data.ts for the given tax years (any order, duplicates ignored). */
export function renderBundledData(years) {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  if (sorted.length === 0 || sorted.some((year) => !Number.isInteger(year) || year <= 0)) {
    throw new Error('renderBundledData needs at least one positive whole tax year.');
  }

  const imports = [
    "import rates from '../../../assets/data/rates.json';",
    ...sorted.map(
      (year) => `import taxYear${year} from '../../../assets/data/tax-years/${year}.json';`,
    ),
    "import type { DataSource } from './data-source';",
  ];

  const entries = sorted.map((year) => `{ fileName: '${year}.json', data: taxYear${year} }`);
  // Prettier keeps one object on the line and breaks a longer list into one entry per line.
  const taxYears =
    entries.length === 1
      ? `  taxYears: [${entries[0]}],`
      : ['  taxYears: [', ...entries.map((entry) => `    ${entry},`), '  ],'].join('\n');

  return [
    ...imports,
    '',
    '/**',
    ' * The JSON shipped inside the app. Static imports keep loading synchronous (no HTTP, no loading',
    ' * state, works offline). The tax-season scout (scripts/tax-season) rewrites this file when it',
    ' * adds a tax year, so edit the data files rather than this one.',
    ' */',
    'export const BUNDLED_DATA: DataSource = {',
    taxYears,
    "  rates: { fileName: 'rates.json', data: rates },",
    '};',
    '',
  ].join('\n');
}

/**
 * Rewrites bundled-data.ts from the tax-year files on disk. Writes only when the text changed
 * and keeps the existing file's line endings. Returns `{ years, written }`.
 */
export async function registerNewYears({ fs, paths }) {
  const names = await fs.listDir(paths.taxYearsDir);
  const years = names
    .map((name) => YEAR_FILE.exec(name))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  if (years.length === 0) return { years: [], written: false };

  const existing = await fs.readText(paths.bundledData);
  const eol = existing?.includes('\r\n') ? '\r\n' : '\n';
  const next = renderBundledData(years).replace(/\n/g, eol);
  if (existing === next) return { years, written: false };

  await fs.writeText(paths.bundledData, next);
  return { years, written: true };
}
