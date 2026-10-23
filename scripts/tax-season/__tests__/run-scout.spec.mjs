import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { validateTaxYearFile } from '../../../src/app/core/data/tax-year.validator.ts';
import { PATHS } from '../lib/paths.mjs';
import { ScoutError, runScout } from '../lib/run-scout.mjs';
import { MEMORY_PATHS, createMemoryFs, fakeFetch, loadFixture } from './helpers.mjs';

const sources = JSON.parse(readFileSync(PATHS.sources, 'utf8'));
const previousText = readFileSync(PATHS.taxYearFile(2027), 'utf8');
const TODAY = '2027-02-20';

/** Fixture page per sources.sars key, served at that key's URL. */
const FIXTURES = {
  individuals: 'sars-individuals.html',
  medicalCredits: 'sars-medical.html',
  uif: 'sars-uif.html',
  tfsa: 'sars-tfsa.html',
  retirementLumpSum: 'sars-lump-sum.html',
  interestAndDividends: 'sars-interest.html',
  cgt: 'sars-cgt.html',
  dividendsTax: 'sars-dividends.html',
  twoPot: 'sars-two-pot.html',
  annuitisation: 'sars-annuitisation.html',
};

function servedPages(overrides = {}) {
  const responses = {};
  for (const [key, url] of Object.entries(sources.sars)) {
    responses[url] = overrides[key] ?? loadFixture(FIXTURES[key]);
  }
  return responses;
}

function setup({ files = {}, pages = servedPages() } = {}) {
  const fs = createMemoryFs({ [MEMORY_PATHS.taxYearFile(2027)]: previousText, ...files });
  const fetchText = fakeFetch(pages);
  const lines = [];
  const warnings = [];
  const log = { info: (line) => lines.push(line), warn: (line) => warnings.push(line) };
  const run = (year = 2028, today = TODAY) =>
    runScout({ year, today, fs, fetchText, sources, paths: MEMORY_PATHS, log });
  return { fs, fetchText, lines, warnings, run };
}

const writtenFile = (fs) => JSON.parse(fs.files.get(MEMORY_PATHS.taxYearFile(2028)));

describe('runScout end to end (fixtures, memory file system)', () => {
  it('writes a draft 2028.json with the four unsourced fields carried and the rest confirmed', async () => {
    const { fs, run, fetchText } = setup();
    const result = await run();

    expect(result).toMatchObject({ year: 2028, status: 'draft', written: true, confirmed: 12 });
    expect(result.carried).toEqual([
      'retirementDeduction',
      'livingAnnuityDrawdown',
      'cgt',
      'earliestRaRetirementAge',
    ]);
    expect(result.rejected).toEqual([]);
    expect(fetchText.calls.sort()).toEqual(Object.values(sources.sars).sort());

    const file = writtenFile(fs);
    expect(validateTaxYearFile(file, '2028.json')).toMatchObject({ ok: true });
    expect(file.status).toBe('draft');
    expect(file.verifiedOn).toBe(TODAY);
    expect(file.incomeTaxBrackets.value[1]).toEqual({
      above: 255000,
      upTo: 398400,
      base: 45900,
      rate: 0.26,
    });
    expect(file.incomeTaxBrackets.carriedForward).toBe(false);
    expect(file.retirementDeduction.carriedForward).toBe(true);
    expect(file.retirementDeduction.source).toBe(
      JSON.parse(previousText).retirementDeduction.source,
    );
    expect(fs.files.get(MEMORY_PATHS.taxYearFile(2028)).endsWith('}\n')).toBe(true);
  });

  it('regenerates bundled-data.ts with both years', async () => {
    const { fs, run } = setup();
    await run();
    const bundled = fs.files.get(MEMORY_PATHS.bundledData);
    expect(bundled).toContain(
      "import taxYear2027 from '../../../assets/data/tax-years/2027.json';",
    );
    expect(bundled).toContain(
      "import taxYear2028 from '../../../assets/data/tax-years/2028.json';",
    );
    expect(bundled).toContain("{ fileName: '2028.json', data: taxYear2028 },");
  });

  it('writes last-report.md with the diff and the carried-forward list, and prints a summary', async () => {
    const { fs, run, lines } = setup();
    await run();
    const report = fs.files.get(MEMORY_PATHS.report);
    expect(report).toContain('# Tax-season scout report: 2028');
    expect(report).toContain('## Changes vs 2027');
    expect(report).toContain('| rebates.primary | 17820 | 18400 | +3.3% |');
    expect(report).toContain(
      '- Retirement fund contribution deduction (retirementDeduction): no HTML source',
    );
    expect(lines[0]).toBe('[tax-season] 2028 tax year: draft (12 of 16 fields confirmed)');
    expect(lines.at(-1)).toBe('[tax-season] report: scripts/tax-season/last-report.md');
  });

  it('skips a draft that was already checked today and fetches nothing', async () => {
    const { run, fetchText } = setup();
    await run();
    const calls = fetchText.calls.length;
    const second = await run();
    expect(second).toEqual({ year: 2028, skipped: 'already checked today', written: false });
    expect(fetchText.calls).toHaveLength(calls);
  });

  it('re-scouts a draft from an earlier day and keeps a field a person confirmed', async () => {
    const first = setup();
    await first.run();
    const draft = writtenFile(first.fs);
    draft.verifiedOn = '2027-02-19';
    draft.retirementDeduction = {
      value: { rate: 0.275, annualCap: 450000 },
      carriedForward: false,
      source: draft.retirementDeduction.source,
    };
    const second = setup({ files: { [MEMORY_PATHS.taxYearFile(2028)]: JSON.stringify(draft) } });
    const result = await second.run();

    const file = writtenFile(second.fs);
    expect(result.status).toBe('draft');
    expect(file.retirementDeduction.value.annualCap).toBe(450000);
    expect(file.retirementDeduction.carriedForward).toBe(false);
    expect(file.verifiedOn).toBe(TODAY);
    expect(result.confirmed).toBe(13);
  });

  it('refuses to overwrite a file that is not a draft', async () => {
    const verified = { ...JSON.parse(previousText), taxYear: 2028, status: 'verified' };
    const { fs, run, fetchText } = setup({
      files: { [MEMORY_PATHS.taxYearFile(2028)]: JSON.stringify(verified) },
    });
    await expect(run()).rejects.toThrow(ScoutError);
    await expect(run()).rejects.toThrow(
      '2028.json is already verified; delete it first to re-scout',
    );
    expect(fetchText.calls).toEqual([]);
    expect(JSON.parse(fs.files.get(MEMORY_PATHS.taxYearFile(2028))).status).toBe('verified');
  });

  it('throws "offline" when every page fails and writes nothing to the tax-years folder', async () => {
    const failing = Object.fromEntries(
      Object.values(sources.sars).map((url) => [url, new Error('network down')]),
    );
    const { fs, run } = setup({ pages: failing });
    await expect(run()).rejects.toThrow(/^offline/);
    expect(fs.files.has(MEMORY_PATHS.taxYearFile(2028))).toBe(false);
    expect([...fs.files.keys()].filter((key) => key.startsWith(MEMORY_PATHS.taxYearsDir))).toEqual([
      MEMORY_PATHS.taxYearFile(2027),
    ]);
    // The report is still written, with the reason and the per-page errors.
    const report = fs.files.get(MEMORY_PATHS.report);
    expect(report).toContain('Result: **stopped**. offline');
    expect(report).toContain('network down');
  });

  it('throws when the previous year file is missing or invalid', async () => {
    const missing = setup();
    missing.fs.files.delete(MEMORY_PATHS.taxYearFile(2027));
    await expect(missing.run()).rejects.toThrow(
      'cannot scout 2028: the 2027 file is missing or invalid',
    );
    expect(missing.fetchText.calls).toEqual([]);

    const invalid = setup({ files: { [MEMORY_PATHS.taxYearFile(2027)]: '{"taxYear": 2027}' } });
    await expect(invalid.run()).rejects.toThrow(ScoutError);
  });

  it('carries only the fields of a page that failed; the others are still scraped', async () => {
    const pages = servedPages();
    pages[sources.sars.medicalCredits] = new Error('answered 503');
    const { fs, run } = setup({ pages });
    const result = await run();

    const file = writtenFile(fs);
    expect(file.medicalCredits.carriedForward).toBe(true);
    expect(file.medicalCredits.value).toEqual(JSON.parse(previousText).medicalCredits.value);
    expect(file.rebates.carriedForward).toBe(false);
    expect(result.carried).toContain('medicalCredits');
    expect(result.confirmed).toBe(11);
    const report = fs.files.get(MEMORY_PATHS.report);
    expect(report).toContain('page not fetched');
    expect(report).toContain('medicalCredits');
    expect(report).toContain('answered 503');
  });

  it('carries a unit that fails a check and lists it as rejected', async () => {
    const pages = servedPages({
      tfsa: loadFixture('sars-tfsa.html').replace('<td>47 500</td>', '<td>60 000</td>'),
    });
    const { fs, run, lines } = setup({ pages });
    const result = await run();

    expect(result.rejected).toEqual(['tfsa']);
    expect(writtenFile(fs).tfsa.carriedForward).toBe(true);
    expect(fs.files.get(MEMORY_PATHS.report)).toContain('scraped tfsa:');
    expect(lines.join('\n')).toMatch(
      /rejected: Tax-free savings limits \(tfsa\.annualLimit changed by/,
    );
  });
});
