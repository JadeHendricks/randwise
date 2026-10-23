import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { validateRatesFile } from '../../../src/app/core/data/rates.validator.ts';
import { createNodeFs } from '../lib/io.mjs';
import { PATHS } from '../lib/paths.mjs';
import {
  RatesRefreshError,
  parseSarbRates,
  ratesNeedRefresh,
  refreshRates,
} from '../lib/rates-refresh.mjs';
import { MEMORY_PATHS, createMemoryFs, fakeFetch, loadFixture } from './helpers.mjs';

const sources = JSON.parse(readFileSync(PATHS.sources, 'utf8'));
const rows = () => JSON.parse(loadFixture('sarb-home-page-rates.json'));
const TODAY = '2026-10-23';

/** A valid rates.json whose snapshot was taken on `fetchedOn`. */
function ratesText(fetchedOn) {
  const file = parseSarbRates(rows(), { sources, today: TODAY });
  // A snapshot cannot hold values dated after the day it was taken, so cap each asOf.
  for (const entry of Object.values(file.rates)) {
    if (entry.asOf > fetchedOn) entry.asOf = fetchedOn;
  }
  return `${JSON.stringify({ ...file, fetchedOn }, null, 2)}\n`;
}

const sarbResponse = (body) => ({ [sources.sarb.url]: body });

describe('parseSarbRates', () => {
  it('turns the SARB fixture into a file that passes validateRatesFile', () => {
    const file = parseSarbRates(rows(), { sources, today: TODAY });
    expect(validateRatesFile(file, 'rates.json').ok).toBe(true);
    expect(file.source).toBe(sources.sarb.url);
    expect(file.fetchedOn).toBe(TODAY);
    expect(Object.keys(file.rates)).toEqual(['repo', 'prime', 'cpi', 'r2030', 'r209', 'zaronia']);
    expect(file.rates.repo).toEqual({
      label: 'SARB Policy Rate',
      valuePercent: 7.25,
      asOf: '2026-10-23',
      seriesCode: 'MMRD002A',
    });
    expect(file.rates.cpi).toEqual({
      label: 'CPI',
      valuePercent: 4.5,
      asOf: '2026-09-30',
      seriesCode: 'CPI1000F',
    });
    expect(file.rates.r2030.valuePercent).toBe(8.035);
    expect(file.rates.r209.valuePercent).toBe(8.745);
    expect(file.rates.zaronia.valuePercent).toBe(7.104);
    expect(file.rates.prime.valuePercent).toBe(10.75);
  });

  it('ignores rows it does not need', () => {
    const file = parseSarbRates(rows(), { sources, today: TODAY });
    expect(JSON.stringify(file)).not.toContain('PPI');
    expect(JSON.stringify(file)).not.toContain('Sabor');
  });

  it('throws naming the missing series code', () => {
    const withoutPrime = rows().filter((row) => row.TimeseriesCode !== 'MMRD000A');
    expect(() => parseSarbRates(withoutPrime, { sources, today: TODAY })).toThrow(/MMRD000A/);
    expect(() => parseSarbRates(withoutPrime, { sources, today: TODAY })).toThrow(
      RatesRefreshError,
    );
  });

  it('throws when the answer is not a list', () => {
    expect(() => parseSarbRates({ rows: [] }, { sources, today: TODAY })).toThrow(
      RatesRefreshError,
    );
  });

  it('fails when a value is dated after today (the computer clock is behind)', () => {
    expect(() => parseSarbRates(rows(), { sources, today: '2026-10-22' })).toThrow(
      /after fetchedOn/,
    );
  });

  it('fails on a value that is not a sensible percentage', () => {
    const broken = rows().map((row) =>
      row.TimeseriesCode === 'CPI1000F' ? { ...row, Value: -1 } : row,
    );
    expect(() => parseSarbRates(broken, { sources, today: TODAY })).toThrow(/valuePercent/);
  });
});

describe('ratesNeedRefresh', () => {
  it('keeps a file that is 7 days old', () => {
    expect(ratesNeedRefresh(ratesText('2026-10-16'), TODAY).refresh).toBe(false);
  });

  it('refreshes a file that is 8 days old', () => {
    expect(ratesNeedRefresh(ratesText('2026-10-15'), TODAY).refresh).toBe(true);
  });

  it('keeps a file dated today', () => {
    expect(ratesNeedRefresh(ratesText(TODAY), TODAY).refresh).toBe(false);
  });

  it('refreshes a missing file, unreadable JSON and a file that fails validation', () => {
    expect(ratesNeedRefresh(null, TODAY)).toEqual({ refresh: true, reason: 'missing' });
    expect(ratesNeedRefresh('{ not json', TODAY)).toEqual({ refresh: true, reason: 'invalid' });
    expect(ratesNeedRefresh('{"fetchedOn":"2026-10-22"}', TODAY)).toEqual({
      refresh: true,
      reason: 'invalid',
    });
  });
});

describe('refreshRates', () => {
  const run = (fs, fetchText, log) =>
    refreshRates({ today: TODAY, fs, fetchText, sources, paths: MEMORY_PATHS, log });

  it('does not fetch when the file is 7 days old', async () => {
    const original = ratesText('2026-10-16');
    const fs = createMemoryFs({ [MEMORY_PATHS.ratesFile]: original });
    const fetchText = fakeFetch({});
    const result = await run(fs, fetchText);
    expect(result).toMatchObject({ action: 'fresh', fetchedOn: '2026-10-16' });
    expect(fetchText.calls).toEqual([]);
    expect(fs.files.get(MEMORY_PATHS.ratesFile)).toBe(original);
  });

  it('fetches and rewrites a file that is 8 days old', async () => {
    const fs = createMemoryFs({ [MEMORY_PATHS.ratesFile]: ratesText('2026-10-15') });
    const fetchText = fakeFetch(sarbResponse(loadFixture('sarb-home-page-rates.json')));
    const result = await run(fs, fetchText);
    expect(result).toMatchObject({ action: 'updated', fetchedOn: TODAY });
    expect(fetchText.calls).toEqual([sources.sarb.url]);
    expect(JSON.parse(fs.files.get(MEMORY_PATHS.ratesFile)).fetchedOn).toBe(TODAY);
  });

  it('writes the file when it is missing', async () => {
    const fs = createMemoryFs();
    const fetchText = fakeFetch(sarbResponse(loadFixture('sarb-home-page-rates.json')));
    expect(await run(fs, fetchText)).toMatchObject({ action: 'updated', reason: 'missing' });
    expect(fs.files.has(MEMORY_PATHS.ratesFile)).toBe(true);
  });

  it('replaces an invalid file', async () => {
    const fs = createMemoryFs({ [MEMORY_PATHS.ratesFile]: '{}' });
    const fetchText = fakeFetch(sarbResponse(loadFixture('sarb-home-page-rates.json')));
    expect(await run(fs, fetchText)).toMatchObject({ action: 'updated', reason: 'invalid' });
  });

  it('writes a valid file that ends with a newline in the same layout as the shipped one', async () => {
    const fs = createMemoryFs();
    const fetchText = fakeFetch(sarbResponse(loadFixture('sarb-home-page-rates.json')));
    await run(fs, fetchText);

    const written = fs.files.get(MEMORY_PATHS.ratesFile);
    expect(written.endsWith('}\n')).toBe(true);
    expect(validateRatesFile(JSON.parse(written), 'rates.json').ok).toBe(true);

    // Same layout: the shipped file re-serialised the same way gives back its own text.
    const shipped = readFileSync(PATHS.ratesFile, 'utf8').replace(/\r\n/g, '\n');
    expect(`${JSON.stringify(JSON.parse(shipped), null, 2)}\n`).toBe(shipped);
    expect(Object.keys(JSON.parse(written))).toEqual(Object.keys(JSON.parse(shipped)));
    expect(Object.keys(JSON.parse(written).rates.repo)).toEqual(
      Object.keys(JSON.parse(shipped).rates.repo),
    );
  });

  describe('when something goes wrong', () => {
    const stale = ratesText('2026-10-01');

    async function expectUntouched(responses, fsOverride) {
      const fs = fsOverride ?? createMemoryFs({ [MEMORY_PATHS.ratesFile]: stale });
      const log = { info: vi.fn(), warn: vi.fn() };
      const result = await run(fs, fakeFetch(responses), log);
      expect(result.action).toBe('failed');
      expect(fs.files.get(MEMORY_PATHS.ratesFile)).toBe(stale);
      expect(log.warn).toHaveBeenCalledTimes(1);
      return result;
    }

    it('leaves the file alone when the fetch fails', async () => {
      const result = await expectUntouched(sarbResponse(new Error('offline')));
      expect(result.fetchedOn).toBe('2026-10-01');
      expect(result.reason).toBe('offline');
    });

    it('leaves the file alone when the answer is not JSON', async () => {
      await expectUntouched(sarbResponse('<html>maintenance</html>'));
    });

    it('leaves the file alone when a series is missing, naming it', async () => {
      const without = rows().filter((row) => row.TimeseriesCode !== 'MMRD708A');
      const result = await expectUntouched(sarbResponse(JSON.stringify(without)));
      expect(result.reason).toContain('MMRD708A');
    });

    it('leaves the file alone when a value is dated after today', async () => {
      const future = rows().map((row) => ({ ...row, Date: '2026-12-31' }));
      await expectUntouched(sarbResponse(JSON.stringify(future)));
    });

    it('does not throw when the file cannot be read', async () => {
      const fs = createMemoryFs();
      fs.readText = async () => {
        throw new Error('disk on fire');
      };
      const log = { info: vi.fn(), warn: vi.fn() };
      const result = await run(fs, fakeFetch({}), log);
      expect(result).toMatchObject({ action: 'failed', reason: 'disk on fire', fetchedOn: null });
    });
  });

  describe('on a real disk', () => {
    let dir;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'randwise-rates-'));
    });
    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('writes atomically and leaves no temporary file', async () => {
      const paths = { ...MEMORY_PATHS, ratesFile: join(dir, 'data', 'rates.json') };
      const fetchText = fakeFetch(sarbResponse(loadFixture('sarb-home-page-rates.json')));
      const result = await refreshRates({
        today: TODAY,
        fs: createNodeFs(),
        fetchText,
        sources,
        paths,
      });
      expect(result.action).toBe('updated');
      expect(readdirSync(join(dir, 'data'))).toEqual(['rates.json']);
      expect(
        validateRatesFile(JSON.parse(readFileSync(paths.ratesFile, 'utf8')), 'rates.json').ok,
      ).toBe(true);
    });
  });
});
