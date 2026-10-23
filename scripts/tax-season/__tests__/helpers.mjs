// Shared test helpers. Nothing here touches the network; the only disk reads are fixtures and
// the shipped 2027.json.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');

const slashes = (path) => path.replace(/\\/g, '/');

/** In-memory stand-in for createNodeFs(). `files` maps a path to its text. */
export function createMemoryFs(initial = {}) {
  const files = new Map(Object.entries(initial).map(([path, text]) => [slashes(path), text]));
  return {
    files,
    async readText(path) {
      return files.get(slashes(path)) ?? null;
    },
    async writeText(path, text) {
      files.set(slashes(path), text);
    },
    async listDir(path) {
      const dir = slashes(path).replace(/\/$/, '');
      return [...files.keys()]
        .filter((key) => key.startsWith(`${dir}/`) && !key.slice(dir.length + 1).includes('/'))
        .map((key) => key.slice(dir.length + 1));
    },
  };
}

/** Paths for a pretend repository, so memory-fs tests never share names with the real one. */
export const MEMORY_PATHS = {
  sources: '/repo/scripts/tax-season/sources.json',
  taxYearsDir: '/repo/src/assets/data/tax-years',
  ratesFile: '/repo/src/assets/data/rates.json',
  bundledData: '/repo/src/app/core/data/bundled-data.ts',
  report: '/repo/scripts/tax-season/last-report.md',
  taxYearFile: (year) => `/repo/src/assets/data/tax-years/${year}.json`,
};

/** Text of a file in scripts/tax-season/__fixtures__. */
export function loadFixture(name) {
  return readFileSync(join(ROOT, 'scripts', 'tax-season', '__fixtures__', name), 'utf8');
}

/** The shipped 2027.json, parsed, for specs that need "last year". */
export function shippedPrevious() {
  const text = readFileSync(join(ROOT, 'src', 'assets', 'data', 'tax-years', '2027.json'), 'utf8');
  return JSON.parse(text);
}

/**
 * A fetchText fake. `responses` maps a URL to the text to return, or to an Error to throw.
 * An unknown URL throws, so a test cannot reach the network by accident. `.calls` lists the URLs.
 */
export function fakeFetch(responses) {
  const calls = [];
  async function fetchText(url) {
    calls.push(url);
    if (!Object.hasOwn(responses, url)) throw new Error(`no fake response for ${url}`);
    const response = responses[url];
    if (response instanceof Error) throw response;
    return response;
  }
  fetchText.calls = calls;
  return fetchText;
}
