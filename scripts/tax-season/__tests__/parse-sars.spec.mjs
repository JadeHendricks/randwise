import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { NO_HTML_SOURCE, extractAll } from '../lib/parse-sars.mjs';
import { PATHS } from '../lib/paths.mjs';
import { loadFixture, shippedPrevious } from './helpers.mjs';

const sars = JSON.parse(readFileSync(PATHS.sources, 'utf8')).sars;
const previous = shippedPrevious();

// 2028 figures in the fixtures are invented (see the comment at the top of each fixture).
const BRACKETS_2028 = [
  { above: 0, upTo: 255000, base: 0, rate: 0.18 },
  { above: 255000, upTo: 398400, base: 45900, rate: 0.26 },
  { above: 398400, upTo: 551400, base: 83184, rate: 0.31 },
  { above: 551400, upTo: 723600, base: 130614, rate: 0.36 },
  { above: 723600, upTo: 922500, base: 192606, rate: 0.39 },
  { above: 922500, upTo: 1953900, base: 270177, rate: 0.41 },
  { above: 1953900, upTo: null, base: 693051, rate: 0.45 },
];

const fixturePages = () => ({
  individuals: loadFixture('sars-individuals.html'),
  medicalCredits: loadFixture('sars-medical.html'),
  uif: loadFixture('sars-uif.html'),
  tfsa: loadFixture('sars-tfsa.html'),
  retirementLumpSum: loadFixture('sars-lump-sum.html'),
  interestAndDividends: loadFixture('sars-interest.html'),
  cgt: loadFixture('sars-cgt.html'),
  dividendsTax: loadFixture('sars-dividends.html'),
  twoPot: loadFixture('sars-two-pot.html'),
  annuitisation: loadFixture('sars-annuitisation.html'),
});

const extract = (pages, year) => extractAll(pages, year, sars);

/** A page made of the given HTML only, for rule T and prose edge cases. */
const page = (html) => `<div>${html}</div>`;
const bracketRows = `
  <tr><th>Taxable income (R)</th><th>Rates of tax (R)</th></tr>
  <tr><td>1 &#8211; 100 000</td><td>10% of taxable income</td></tr>
  <tr><td>100 001 and above</td><td>10 000 + 20% of taxable income above 100 000</td></tr>`;

describe('income tax brackets, rebates and thresholds (individuals page)', () => {
  it('reads exactly the invented 2028 figures', () => {
    const { extracted } = extract(fixturePages(), 2028);
    expect(extracted.incomeTaxBrackets).toEqual({
      value: BRACKETS_2028,
      source: sars.individuals,
      how: 'table',
    });
    expect(extracted.rebates.value).toEqual({ primary: 18400, secondary: 10100, tertiary: 3360 });
    expect(extracted.thresholds.value).toEqual({
      under65: 102222,
      age65to74: 158333,
      age75plus: 177000,
    });
    expect(extracted.rebates.source).toBe(sars.individuals);
  });

  it('reads the shipped 2027 values for 2027 from the same page', () => {
    const { extracted } = extract(fixturePages(), 2027);
    expect(extracted.incomeTaxBrackets.value).toEqual(previous.incomeTaxBrackets.value);
    expect(extracted.rebates.value).toEqual(previous.rebates.value);
    expect(extracted.thresholds.value).toEqual(previous.thresholds.value);
  });

  it('finds nothing for 2028 on a page without a 2028 marker or column', () => {
    const pages = { individuals: loadFixture('sars-individuals-no-2028.html') };
    const { extracted, notes } = extract(pages, 2028);
    expect(extracted.incomeTaxBrackets).toBeUndefined();
    expect(extracted.rebates).toBeUndefined();
    expect(extracted.thresholds).toBeUndefined();
    expect(notes).toEqual(
      expect.arrayContaining([
        { key: 'incomeTaxBrackets', reason: 'not found on the page for tax year 2028' },
        { key: 'rebates', reason: 'not found on the page for tax year 2028' },
        { key: 'thresholds', reason: 'not found on the page for tax year 2028' },
      ]),
    );
  });

  it('uses the table below a "No changes" year and flags it as unchanged per SARS', () => {
    const pages = { individuals: loadFixture('sars-individuals-2028-no-changes.html') };
    const unchanged = extract(pages, 2028).extracted.incomeTaxBrackets;
    expect(unchanged.value).toEqual(previous.incomeTaxBrackets.value);
    expect(unchanged.how).toBe('table (unchanged per SARS)');
    // The year that owns the table is not "unchanged".
    expect(extract(pages, 2027).extracted.incomeTaxBrackets.how).toBe('table');
  });

  it('gives a "No changes" year nothing when no bracket table follows it', () => {
    const { extracted } = extract({ individuals: loadFixture('sars-individuals.html') }, 2026);
    // 2026 says "No changes" but only the rebates heading follows it, not a bracket table.
    expect(extracted.incomeTaxBrackets).toBeUndefined();
  });

  it('returns null for a table whose rows do not add up', () => {
    const broken = page(`<h2>2028 tax year (1 March 2027 &#8211; 29 February 2028)</h2>
      <table>${bracketRows.replace('100 001 and above', '100 005 and above')}</table>`);
    expect(extract({ individuals: broken }, 2028).extracted.incomeTaxBrackets).toBeUndefined();
  });

  it('returns null for a table with a single row', () => {
    const one = page(`<h2>2028 tax year (1 March 2027 &#8211; 29 February 2028)</h2>
      <table><tr><td>1 &#8211; 100 000</td><td>10% of taxable income</td></tr></table>`);
    expect(extract({ individuals: one }, 2028).extracted.incomeTaxBrackets).toBeUndefined();
  });
});

describe('rule T (which table a year heading owns)', () => {
  const heading = (year, line) =>
    `<h2>${year} tax year (1 March ${year - 1} &#8211; 28 February ${year})</h2><p>${line}</p>`;

  it('lets every "No changes" year above a table share it with the year that owns it', () => {
    const html = page(
      `${heading(2029, 'No changes')}${heading(2028, 'No changes')}${heading(2027, 'See changes:')}
       <table>${bracketRows}</table>`,
    );
    for (const year of [2029, 2028, 2027]) {
      expect(extract({ individuals: html }, year).extracted.incomeTaxBrackets).toBeDefined();
    }
    expect(extract({ individuals: html }, 2026).extracted.incomeTaxBrackets).toBeUndefined();
  });

  it('stops at a year that changed: it does not own the table of the year below it', () => {
    const html = page(
      `${heading(2029, 'See changes:')}${heading(2028, 'See changes:')}
       <table>${bracketRows}</table>`,
    );
    expect(extract({ individuals: html }, 2028).extracted.incomeTaxBrackets).toBeDefined();
    expect(extract({ individuals: html }, 2029).extracted.incomeTaxBrackets).toBeUndefined();
  });

  it('does not pass a year heading on to a table in another group', () => {
    const html = page(
      `${heading(2028, 'No changes')}<h2>Tax Rebates</h2><table>${bracketRows}</table>`,
    );
    expect(extract({ individuals: html }, 2028).extracted.incomeTaxBrackets).toBeUndefined();
  });
});

describe('medical credits', () => {
  it('derives the first dependant from the taxpayer-plus-one-dependant row', () => {
    const { extracted } = extract(fixturePages(), 2028);
    expect(extracted.medicalCredits.value).toEqual({
      mainMember: 390,
      firstDependant: 390,
      additionalDependant: 262,
    });
    expect(extracted.medicalCredits.note).toMatch(/derived/);
    expect(extracted.medicalCredits.source).toBe(sars.medicalCredits);
  });

  it('reproduces the shipped 2027 values', () => {
    const { extracted } = extract(fixturePages(), 2027);
    expect(extracted.medicalCredits.value).toEqual(previous.medicalCredits.value);
  });

  it('gives null when the combined figure is below the taxpayer figure', () => {
    const html = loadFixture('sars-medical.html').replace('R780', 'R300');
    expect(extract({ medicalCredits: html }, 2028).extracted.medicalCredits).toBeUndefined();
  });
});

describe('retirement lump sum groups', () => {
  it('maps each group heading to its own field', () => {
    const { extracted } = extract(fixturePages(), 2028);
    expect(extracted.withdrawalLumpSum.value).toEqual(previous.withdrawalLumpSum.value);
    expect(extracted.retirementLumpSum.value).toEqual(previous.retirementLumpSum.value);
    expect(extracted.withdrawalLumpSum.value).not.toEqual(extracted.retirementLumpSum.value);
    expect(extracted.retirementLumpSum.how).toBe('table (unchanged per SARS)');
    expect(extracted.retirementLumpSum.source).toBe(sars.retirementLumpSum);
  });
});

describe('column-year and prose fields', () => {
  it('reads the interest exemption', () => {
    const { extracted } = extract(fixturePages(), 2028);
    expect(extracted.interestExemption.value).toEqual({ under65: 24700, age65plus: 35800 });
    expect(extract(fixturePages(), 2027).extracted.interestExemption.value).toEqual(
      previous.interestExemption.value,
    );
  });

  it('reads UIF as the rate and the ceiling in force at the end of the year', () => {
    const { extracted } = extract(fixturePages(), 2028);
    expect(extracted.uif).toEqual({
      value: { employeeRate: 0.01, monthlyEarningsCeiling: 17712 },
      source: sars.uif,
      how: 'prose',
    });
    expect(extracted.uif.value).toEqual(previous.uif.value);
  });

  it('ignores a UIF ceiling that takes effect after the tax year ends', () => {
    const html = loadFixture('sars-uif.html').replace(
      '</div>',
      '<p>With effect from 1 June 2030 &#8211; R 25 000 per month</p></div>',
    );
    expect(extract({ uif: html }, 2028).extracted.uif.value.monthlyEarningsCeiling).toBe(17712);
  });

  it('reads TFSA limits from the year row and the prose', () => {
    expect(extract(fixturePages(), 2028).extracted.tfsa.value).toEqual({
      annualLimit: 47500,
      lifetimeLimit: 500000,
      excessPenaltyRate: 0.4,
    });
    expect(extract(fixturePages(), 2027).extracted.tfsa.value).toEqual(previous.tfsa.value);
  });

  it('gives null for TFSA when the year has no row', () => {
    expect(extract(fixturePages(), 2029).extracted.tfsa).toBeUndefined();
  });

  it('reads the two-pot rules', () => {
    expect(extract(fixturePages(), 2028).extracted.twoPot.value).toEqual(previous.twoPot.value);
  });

  it('gives null for two-pot when one of the four facts is missing', () => {
    const html = loadFixture('sars-two-pot.html').replace(/once\s+every\s+tax\s+year/, 'sometimes');
    expect(extract({ twoPot: html }, 2028).extracted.twoPot).toBeUndefined();
  });

  it('reads the annuitisation amount that applies from 1 March of the previous year', () => {
    expect(extract(fixturePages(), 2028).extracted.annuitisationDeMinimis.value).toBe(375000);
    expect(extract(fixturePages(), 2027).extracted.annuitisationDeMinimis.value).toBe(360000);
  });

  it('gives null for annuitisation when no sentence names the right year', () => {
    expect(extract(fixturePages(), 2029).extracted.annuitisationDeMinimis).toBeUndefined();
    expect(extract(fixturePages(), 2026).extracted.annuitisationDeMinimis).toBeUndefined();
  });

  it('reads the dividends tax rate', () => {
    expect(extract(fixturePages(), 2028).extracted.dividendsWithholdingRate.value).toBe(0.2);
  });
});

describe('ambiguity and missing input', () => {
  it('gives null when a pattern finds two different values', () => {
    const html = page(
      `<p>The rate of Dividends Tax increased from 15% to 20% on 22 February 2017.</p>
       <p>The rate of Dividends Tax increased from 20% to 25% later.</p>`,
    );
    expect(
      extract({ dividendsTax: html }, 2028).extracted.dividendsWithholdingRate,
    ).toBeUndefined();
  });

  it('accepts the same value stated twice', () => {
    const html = page(
      `<p>The rate of Dividends Tax increased from 15% to 20% on 22 February 2017.</p>
       <p>Again: the rate of Dividends Tax increased from 15% to 20% since then.</p>`,
    );
    expect(extract({ dividendsTax: html }, 2028).extracted.dividendsWithholdingRate.value).toBe(
      0.2,
    );
  });

  it('gives null for UIF when two ceilings share the latest date', () => {
    const html = page(
      `<p>The contribution by the employee must be 1% of the remuneration.</p>
       <p>With effect from 1 June 2021 &#8211; R 17 712 per month</p>
       <p>With effect from 1 June 2021 &#8211; R 18 000 per month</p>`,
    );
    expect(extract({ uif: html }, 2028).extracted.uif).toBeUndefined();
  });

  it('reports every field as "page not fetched" when no page is given, and does not throw', () => {
    const { extracted, notes } = extract({}, 2028);
    expect(extracted).toEqual({});
    expect(notes.filter((note) => note.reason === 'page not fetched')).toHaveLength(12);
  });

  it('survives pages that are not the expected shape', () => {
    const pages = Object.fromEntries(Object.keys(sars).map((key) => [key, '<p>moved</p>']));
    expect(() => extract(pages, 2028)).not.toThrow();
    expect(extract(pages, 2028).extracted).toEqual({});
    expect(() => extract({ individuals: '' }, 2028)).not.toThrow();
  });
});

describe('fields without an HTML source', () => {
  it('never extracts them, even when their page is present', () => {
    const { extracted, notes } = extract(fixturePages(), 2028);
    for (const key of Object.keys(NO_HTML_SOURCE)) {
      expect(extracted[key]).toBeUndefined();
      expect(notes.find((note) => note.key === key).reason).toMatch(/^no HTML source/);
    }
    expect(Object.keys(NO_HTML_SOURCE).sort()).toEqual([
      'cgt',
      'earliestRaRetirementAge',
      'livingAnnuityDrawdown',
      'retirementDeduction',
    ]);
  });

  it('extracts the other twelve fields from the fixtures', () => {
    expect(Object.keys(extract(fixturePages(), 2028).extracted)).toHaveLength(12);
  });
});
