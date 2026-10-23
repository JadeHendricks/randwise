// Adapters for the outside world. Everything else in scripts/tax-season takes these as
// parameters, so tests can pass in-memory fakes and never touch the disk or the network.
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const isMissing = (error) => error?.code === 'ENOENT';

/**
 * `readText` gives null for a missing file, `listDir` gives [] for a missing folder, and
 * `writeText` writes to a temporary file first, so a crash never leaves a half-written JSON file.
 */
export function createNodeFs() {
  return {
    async readText(path) {
      try {
        return await readFile(path, 'utf8');
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },

    async writeText(path, text) {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.tmp-${process.pid}`;
      try {
        await writeFile(temporary, text, 'utf8');
        await rename(temporary, path);
      } catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
      }
    },

    async listDir(path) {
      try {
        return await readdir(path);
      } catch (error) {
        if (isMissing(error)) return [];
        throw error;
      }
    },
  };
}

/** A GET that returns the body text. Throws on a non-2xx answer or when `timeoutMs` passes. */
export function createFetchText({
  timeoutMs,
  userAgent = 'Randwise tax-season check (local; reads public pages)',
}) {
  return async function fetchText(url) {
    const response = await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: '*/*' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return response.text();
  };
}
