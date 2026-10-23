import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/** The repository root, whatever directory the script was started from. */
export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export const PATHS = {
  sources: join(ROOT, 'scripts', 'tax-season', 'sources.json'),
  taxYearsDir: join(ROOT, 'src', 'assets', 'data', 'tax-years'),
  ratesFile: join(ROOT, 'src', 'assets', 'data', 'rates.json'),
  bundledData: join(ROOT, 'src', 'app', 'core', 'data', 'bundled-data.ts'),
  report: join(ROOT, 'scripts', 'tax-season', 'last-report.md'),
  /** Path of one tax-year file, for example `taxYearFile(2027)` -> `.../tax-years/2027.json`. */
  taxYearFile(year) {
    return join(PATHS.taxYearsDir, `${year}.json`);
  },
};
