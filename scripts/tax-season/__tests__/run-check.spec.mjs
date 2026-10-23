import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { validateRatesFile } from '../../../src/app/core/data/rates.validator.ts';
import { createNodeFs } from '../lib/io.mjs';
import { PATHS } from '../lib/paths.mjs';
import { parseSarbRates } from '../lib/rates-refresh.mjs';
import { runCheck } from '../lib/run-check.mjs';
import { MEMORY_PATHS, createMemoryFs, fakeFetch, loadFixture } from './helpers.mjs';

const sources = JSON.parse(readFileSync(PATHS.sources, 'utf8'));
const SARB_BODY = loadFixture('sarb-home-page-rates.json');

/** A valid rates.json taken on `fetchedOn` (asOf dates are capped so the file stays valid). */
function ratesText(fetchedOn) {
  const file = parseSarbRates(JSON.parse(SARB_BODY), { sources, today: '2026-10-23' });
  for (const entry of Object.values(file.rates)) {
    if (entry.asOf > fetchedOn) entry.asOf = fetchedOn;
  }
  return `${JSON.stringify({ ...file, fetchedOn }, null, 2)}\n`;
}

/** Days before an ISO date (UTC maths, so no daylight-saving surprises). */
function daysBefore(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

const yearFile = (status) => `${JSON.stringify({ taxYear: 2028, status })}\n`;

function setup({ today, files = {}, rates, responses } = {}) {
  const fs = createMemoryFs({
    [MEMORY_PATHS.ratesFile]: rates ?? ratesText(today),
    ...files,
  });
  const fetchText = fakeFetch(responses ?? { [sources.sarb.url]: SARB_BODY });
  const scout = vi.fn(async () => ({ written: false }));
  const lines = [];
  const log = {
    info: (line) => lines.push(line),
    warn: (line) => lines.push(line),
  };
  const run = () =>
    runCheck({ today, fs, fetchText, sources, paths: MEMORY_PATHS, scout, log });
  return { fs, fetchText, scout, lines, run };
}

describe('runCheck: when the scout runs', () => {
  it('does not scout the day before 20 February', async () => {
    const t = setup({ today: '2027-02-19' });
    await t.run();
    expect(t.scout).not.toHaveBeenCalled();
    expect(t.lines.join('\n')).toContain('scouting opens 20 Feb');
  });

  it('scouts the next year on 20 February when its file is missing', async () => {
    const t = setup({ today: '2027-02-20' });
    await t.run();
    expect(t.scout).toHaveBeenCalledTimes(1);
    const args = t.scout.mock.calls[0][0];
    expect(args).toMatchObject({ year: 2028, today: '2027-02-20', sources, paths: MEMORY_PATHS });
    expect(args.fs).toBe(t.fs);
    expect(args.fetchText).toBe(t.fetchText);
  });

  it('scouts when the next year is still a draft', async () => {
    const t = setup({
      today: '2027-02-25',
      files: { [MEMORY_PATHS.taxYearFile(2028)]: yearFile('draft') },
    });
    await t.run();
    expect(t.scout).toHaveBeenCalledTimes(1);
    expect(t.scout.mock.calls[0][0].year).toBe(2028);
  });

  it('scouts when the next year file cannot be read as JSON', async () => {
    const t = setup({
      today: '2027-02-25',
      files: { [MEMORY_PATHS.taxYearFile(2028)]: '{ not json' },
    });
    await t.run();
    expect(t.scout).toHaveBeenCalledTimes(1);
  });

  it.each(['verified', 'verified-auto'])('leaves a %s file alone', async (status) => {
    const t = setup({
      today: '2027-02-25',
      files: { [MEMORY_PATHS.taxYearFile(2028)]: yearFile(status) },
    });
    await t.run();
    expect(t.scout).not.toHaveBeenCalled();
    expect(t.lines.join('\n')).toContain(`2028 already ${status}`);
  });

  it('does not scout on 1 March, when the new year has started', async () => {
    const t = setup({ today: '2027-03-01' });
    await t.run();
    expect(t.scout).not.toHaveBeenCalled();
  });

  it('targets 2029 on 29 February 2028 (leap year)', async () => {
    const t = setup({ today: '2028-02-29' });
    await t.run();
    expect(t.scout).toHaveBeenCalledTimes(1);
    expect(t.scout.mock.calls[0][0].year).toBe(2029);
  });
});

describe('runCheck: rates', () => {
  const TODAY = '2026-11-01';

  it('does not fetch when the file is 7 days old', async () => {
    const original = ratesText(daysBefore(TODAY, 7));
    const t = setup({ today: TODAY, rates: original });
    await t.run();
    expect(t.fetchText.calls).toEqual([]);
    expect(t.fs.files.get(MEMORY_PATHS.ratesFile)).toBe(original);
    expect(t.lines[0]).toBe(`rates: fresh (fetched ${daysBefore(TODAY, 7)})`);
  });

  it('fetches and rewrites a file that is 8 days old', async () => {
    const t = setup({ today: TODAY, rates: ratesText(daysBefore(TODAY, 8)) });
    await t.run();
    expect(t.fetchText.calls).toEqual([sources.sarb.url]);
    const written = JSON.parse(t.fs.files.get(MEMORY_PATHS.ratesFile));
    expect(written.fetchedOn).toBe(TODAY);
    expect(validateRatesFile(written, 'rates.json').ok).toBe(true);
    expect(t.lines[0]).toBe('rates: updated from SARB');
  });

  describe('on a real disk', () => {
    let dir;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'randwise-check-'));
    });
    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('rewrites a stale rates.json as a valid file', async () => {
      const paths = { ...MEMORY_PATHS, ratesFile: join(dir, 'rates.json') };
      const fs = createNodeFs();
      await fs.writeText(paths.ratesFile, ratesText(daysBefore(TODAY, 8)));
      const scout = vi.fn();
      await runCheck({
        today: TODAY,
        fs,
        fetchText: fakeFetch({ [sources.sarb.url]: SARB_BODY }),
        sources,
        paths,
        scout,
      });
      const written = JSON.parse(readFileSync(paths.ratesFile, 'utf8'));
      expect(written.fetchedOn).toBe(TODAY);
      expect(validateRatesFile(written, 'rates.json').ok).toBe(true);
      expect(scout).not.toHaveBeenCalled();
    });
  });
});

describe('runCheck: failures never escape', () => {
  it('keeps going when the SARB fetch throws, and still scouts', async () => {
    const today = '2027-02-20';
    const original = ratesText(daysBefore(today, 30));
    const t = setup({
      today,
      rates: original,
      responses: { [sources.sarb.url]: new Error('offline') },
    });
    await expect(t.run()).resolves.toBeUndefined();
    expect(t.fs.files.get(MEMORY_PATHS.ratesFile)).toBe(original);
    expect(t.scout).toHaveBeenCalledTimes(1);
    expect(t.lines[0]).toContain(`SARB unreachable, keeping ${daysBefore(today, 30)}`);
  });

  it('keeps going when the scout throws, and the rates step already ran', async () => {
    const today = '2027-02-20';
    const t = setup({ today, rates: ratesText(daysBefore(today, 8)) });
    t.scout.mockRejectedValue(new Error('SARS changed'));
    await expect(t.run()).resolves.toBeUndefined();
    expect(JSON.parse(t.fs.files.get(MEMORY_PATHS.ratesFile)).fetchedOn).toBe(today);
    expect(t.lines.at(-1)).toContain('scout skipped (SARS changed)');
  });

  it('survives a rates step that throws outright', async () => {
    const t = setup({ today: '2027-02-20' });
    const readText = t.fs.readText;
    t.fs.readText = async (path) => {
      if (path === MEMORY_PATHS.ratesFile) throw new Error('disk on fire');
      return readText(path);
    };
    await expect(t.run()).resolves.toBeUndefined();
    expect(t.scout).toHaveBeenCalledTimes(1);
  });

  it('survives a season step that cannot read the tax-year file', async () => {
    const t = setup({ today: '2027-02-20' });
    const readText = t.fs.readText;
    t.fs.readText = async (path) => {
      if (path === MEMORY_PATHS.taxYearFile(2028)) throw new Error('locked');
      return readText(path);
    };
    await expect(t.run()).resolves.toBeUndefined();
    expect(t.lines.at(-1)).toContain('scout skipped (locked)');
  });
});

describe('runCheck: output', () => {
  it('prints a handful of short lines', async () => {
    const t = setup({ today: '2026-11-01' });
    await t.run();
    expect(t.lines).toHaveLength(2);
    for (const line of t.lines) expect(line.length).toBeLessThan(100);
    expect(t.lines[1]).toBe('tax data: current year 2027, scouting opens 20 Feb');
  });
});
