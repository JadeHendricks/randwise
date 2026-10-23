import { describe, expect, it } from 'vitest';

import { diffFiles, renderConsole, renderReport } from '../lib/report.mjs';
import { shippedPrevious } from './helpers.mjs';

const previous = shippedPrevious();

/**
 * A 2028 file made from the shipped 2027 one: primary rebate +4.0%, tfsa rejected and carried,
 * and the four fields that were already carried forward still carried.
 */
function sample() {
  const file = structuredClone(previous);
  file.taxYear = 2028;
  file.period = { start: '2027-03-01', end: '2028-02-29' };
  file.verifiedOn = '2027-02-20';
  file.rebates.value.primary = 18533;
  file.tfsa.carriedForward = true;

  const decisions = {};
  for (const key of Object.keys(file)) {
    if (!file[key]?.source) continue;
    decisions[key] = {
      origin: file[key].carriedForward ? 'carried-forward' : 'scraped',
      reasons: [],
    };
    if (file[key].carriedForward) decisions[key].reasons = ['no HTML source'];
  }
  decisions.tfsa = {
    origin: 'carried-forward',
    reasons: ['tfsa.annualLimit changed by +27.8% (46000 to 58800), more than the 25% allowed.'],
    scraped: { annualLimit: 58800, lifetimeLimit: 500000, excessPenaltyRate: 0.4 },
    rejected: true,
  };
  return { year: 2028, today: '2027-02-20', previous, file, decisions, status: 'draft' };
}

describe('diffFiles', () => {
  it('lists every leaf that differs, with the percentage change', () => {
    const changes = diffFiles(previous, sample().file);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ path: 'rebates.primary', previous: 17820, next: 18533 });
  });
});

describe('renderConsole', () => {
  it('prefixes every line and shows the status, the change as +4.0%, and the report path', () => {
    const lines = renderConsole(sample());
    expect(lines.every((line) => line.startsWith('[tax-season] '))).toBe(true);
    expect(lines[0]).toBe('[tax-season] 2028 tax year: draft (11 of 16 fields confirmed)');
    expect(lines).toContain('[tax-season]   rebates.primary  17820 -> 18533 (+4.0%)');
    expect(lines.at(-1)).toBe('[tax-season] report: scripts/tax-season/last-report.md');
  });

  it('names the carried-forward fields and the rejected one with its first reason', () => {
    const text = renderConsole(sample()).join('\n');
    expect(text).toMatch(/carried forward: .*UIF contributions.*Tax-free savings limits/);
    expect(text).toMatch(
      /rejected: Tax-free savings limits \(tfsa\.annualLimit changed by \+27\.8%/,
    );
  });

  it('shows at most 12 changed values and counts the rest', () => {
    const input = sample();
    input.file.incomeTaxBrackets.value = input.file.incomeTaxBrackets.value.map((row) => ({
      ...row,
      above: row.above + 100,
      base: row.base + 100,
    }));
    const lines = renderConsole(input);
    const changeLines = lines.filter((line) => line.includes(' -> '));
    expect(changeLines).toHaveLength(12);
    expect(lines.join('\n')).toMatch(/\.\.\. and \d+ more changes/);
  });

  it('shows "new" for a value that was 0', () => {
    const input = sample();
    input.file.incomeTaxBrackets.value[0].base = 5;
    expect(renderConsole(input).join('\n')).toMatch(
      /incomeTaxBrackets\[0\]\.base {2}0 -> 5 \(new\)/,
    );
  });
});

describe('renderReport', () => {
  it('has the title, the changes table, the carried-forward and rejected sections and the sources', () => {
    const text = renderReport({
      ...sample(),
      fetchErrors: [{ page: 'uif', url: 'https://example.test/uif', message: 'answered 503' }],
      checks: [{ keys: ['tfsa'], ok: false, results: [] }],
    });
    expect(text).toContain('# Tax-season scout report: 2028');
    expect(text).toContain('Date: 2027-02-20');
    expect(text).toContain('Status: **draft** (11 of 16 fields confirmed)');
    expect(text).toContain('## Changes vs 2027');
    expect(text).toContain('| rebates.primary | 17820 | 18533 | +4.0% |');
    expect(text).toContain('## Carried forward');
    expect(text).toContain('- UIF contributions (uif): no HTML source');
    expect(text).toContain('## Rejected by checks');
    expect(text).toContain(
      'scraped tfsa: `{"annualLimit":58800,"lifetimeLimit":500000,"excessPenaltyRate":0.4}`',
    );
    expect(text).toContain('tfsa.annualLimit changed by +27.8%');
    expect(text).toContain('## Page fetch errors');
    expect(text).toContain('- uif (https://example.test/uif): answered 503');
    expect(text).toContain('## Sources used');
    expect(text).toContain('- https://www.sars.gov.za/tax-rates/medical-tax-credit-rates/');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('says so when nothing was rejected or carried', () => {
    const input = sample();
    input.file.tfsa.carriedForward = false;
    for (const key of Object.keys(input.decisions)) {
      input.file[key].carriedForward = false;
      input.decisions[key] = { origin: 'scraped', reasons: [] };
    }
    const text = renderReport(input);
    expect(text).toContain('Nothing was carried forward.');
    expect(text).toContain('Nothing was rejected.');
    expect(text).toContain('Every page was fetched.');
  });

  it('reports a stop with the error and the fetch errors, without a result', () => {
    const text = renderReport({
      year: 2028,
      today: '2027-02-20',
      previous,
      error: 'offline: none of the SARS pages could be fetched',
      fetchErrors: [{ page: 'individuals', url: 'https://example.test/i', message: 'timeout' }],
    });
    expect(text).toContain('Result: **stopped**. offline: none of the SARS pages could be fetched');
    expect(text).toContain('- individuals (https://example.test/i): timeout');
    expect(text).not.toContain('## Changes vs');
  });
});
