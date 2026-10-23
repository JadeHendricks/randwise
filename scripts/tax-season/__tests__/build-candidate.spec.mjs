import { describe, expect, it } from 'vitest';

import { TAX_YEAR_FIELD_KEYS } from '../../../src/app/core/data/tax-year.schema.ts';
import { validateTaxYearFile } from '../../../src/app/core/data/tax-year.validator.ts';
import { UNITS, buildCandidate } from '../lib/build-candidate.mjs';
import { shippedPrevious } from './helpers.mjs';

const previous = shippedPrevious();
const YEAR = 2028;
const TODAY = '2027-02-20';

const grow = (amount) => Math.round(amount * 1.04);

/** Bracket rows with every rand amount +4% (rounded to 100) and the bases worked out again. */
function growBrackets(rows) {
  const grown = rows.map((row) => ({
    ...row,
    above: Math.round((row.above * 1.04) / 100) * 100,
    upTo: row.upTo === null ? null : Math.round((row.upTo * 1.04) / 100) * 100,
  }));
  let cumulative = 0;
  return grown.map((row, i) => {
    if (i > 0) cumulative += grown[i - 1].rate * (grown[i - 1].upTo - grown[i - 1].above);
    return { ...row, base: Math.round(cumulative) };
  });
}

/** Every field "found" with the shipped 2027 values moved +4% on money, each unit consistent. */
function fullExtraction() {
  const values = {
    incomeTaxBrackets: [
      { above: 0, upTo: 255000, base: 0, rate: 0.18 },
      { above: 255000, upTo: 398400, base: 45900, rate: 0.26 },
      { above: 398400, upTo: 551400, base: 83184, rate: 0.31 },
      { above: 551400, upTo: 723600, base: 130614, rate: 0.36 },
      { above: 723600, upTo: 922500, base: 192606, rate: 0.39 },
      { above: 922500, upTo: 1953900, base: 270177, rate: 0.41 },
      { above: 1953900, upTo: null, base: 693051, rate: 0.45 },
    ],
    rebates: { primary: 18400, secondary: 10100, tertiary: 3360 },
    thresholds: { under65: 102222, age65to74: 158333, age75plus: 177000 },
    medicalCredits: { mainMember: 391, firstDependant: 391, additionalDependant: 264 },
    uif: { employeeRate: 0.01, monthlyEarningsCeiling: grow(17712) },
    retirementDeduction: { rate: 0.275, annualCap: grow(430000) },
    tfsa: { annualLimit: grow(46000), lifetimeLimit: 500000, excessPenaltyRate: 0.4 },
    retirementLumpSum: growBrackets(previous.retirementLumpSum.value),
    withdrawalLumpSum: growBrackets(previous.withdrawalLumpSum.value),
    twoPot: previous.twoPot.value,
    annuitisationDeMinimis: grow(360000),
    livingAnnuityDrawdown: previous.livingAnnuityDrawdown.value,
    interestExemption: { under65: grow(23800), age65plus: grow(34500) },
    cgt: { annualExclusion: grow(50000), inclusionRate: 0.4 },
    dividendsWithholdingRate: 0.2,
    earliestRaRetirementAge: 55,
  };
  return Object.fromEntries(
    TAX_YEAR_FIELD_KEYS.map((key) => [
      key,
      { value: structuredClone(values[key]), source: previous[key].source, how: 'table' },
    ]),
  );
}

const build = (extracted, existing = null, notes = []) =>
  buildCandidate({ year: YEAR, today: TODAY, previous, existing, extracted, notes });

const carriedKeys = (file) => TAX_YEAR_FIELD_KEYS.filter((key) => file[key].carriedForward);

describe('UNITS', () => {
  it('has the trio first and every other field alone, in field order', () => {
    expect(UNITS[0]).toEqual(['incomeTaxBrackets', 'rebates', 'thresholds']);
    expect(UNITS.flat()).toEqual(TAX_YEAR_FIELD_KEYS);
    expect(UNITS).toHaveLength(14);
  });
});

describe('a fully scraped extraction', () => {
  it('is verified-auto with nothing carried forward and passes the validator', () => {
    const { file, status, decisions } = build(fullExtraction());
    expect(status).toBe('verified-auto');
    expect(file.status).toBe('verified-auto');
    expect(carriedKeys(file)).toEqual([]);
    expect(validateTaxYearFile(file, '2028.json')).toMatchObject({ ok: true });
    expect(file.taxYear).toBe(2028);
    expect(file.period).toEqual({ start: '2027-03-01', end: '2028-02-29' });
    expect(file.verifiedOn).toBe(TODAY);
    for (const key of TAX_YEAR_FIELD_KEYS) {
      expect(decisions[key].origin).toBe('scraped');
      expect(file.sources).toContain(file[key].source);
    }
    expect(new Set(file.sources).size).toBe(file.sources.length);
  });

  it('counts a table SARS marked "No changes" as scraped', () => {
    const extracted = fullExtraction();
    extracted.withdrawalLumpSum.how = 'table (unchanged per SARS)';
    extracted.withdrawalLumpSum.value = structuredClone(previous.withdrawalLumpSum.value);
    const { file, status, decisions } = build(extracted);
    expect(decisions.withdrawalLumpSum.origin).toBe('unchanged-per-sars');
    expect(status).toBe('verified-auto');
    expect(file.withdrawalLumpSum.carriedForward).toBe(false);
  });

  it('writes keys in the same order as 2027.json', () => {
    const { file } = build(fullExtraction());
    expect(Object.keys(file)).toEqual(Object.keys(previous));
    for (const key of TAX_YEAR_FIELD_KEYS) {
      expect(Object.keys(file[key])).toEqual(['value', 'carriedForward', 'source']);
    }
  });

  it('does not touch the previous file it was given', () => {
    const snapshot = structuredClone(previous);
    build(fullExtraction());
    expect(previous).toEqual(snapshot);
  });
});

describe('a field that was not found', () => {
  it('becomes a draft and copies that field from last year with its old source', () => {
    const extracted = fullExtraction();
    delete extracted.medicalCredits;
    const { file, status, decisions } = build(extracted, null, [
      { key: 'medicalCredits', reason: 'page not fetched' },
    ]);
    expect(status).toBe('draft');
    expect(carriedKeys(file)).toEqual(['medicalCredits']);
    expect(file.medicalCredits).toEqual({
      value: previous.medicalCredits.value,
      carriedForward: true,
      source: previous.medicalCredits.source,
    });
    expect(decisions.medicalCredits).toEqual({
      origin: 'carried-forward',
      reasons: ['page not fetched'],
    });
    expect(validateTaxYearFile(file, '2028.json')).toMatchObject({ ok: true });
  });

  it('carries the whole trio when one of its fields is missing', () => {
    const extracted = fullExtraction();
    delete extracted.thresholds;
    const { file, decisions } = build(extracted);
    expect(carriedKeys(file)).toEqual(['incomeTaxBrackets', 'rebates', 'thresholds']);
    expect(decisions.rebates.reasons[0]).toMatch(/thresholds not found/);
    expect(validateTaxYearFile(file, '2028.json')).toMatchObject({ ok: true });
  });

  it('uses "not found" when nothing says why', () => {
    const extracted = fullExtraction();
    delete extracted.uif;
    expect(build(extracted).decisions.uif.reasons).toEqual(['not found']);
  });
});

describe('a unit that fails a check', () => {
  it('carries the whole trio forward and records the rejected values', () => {
    const extracted = fullExtraction();
    extracted.thresholds.value = { ...extracted.thresholds.value, under65: 105000 };
    const { file, status, decisions, checks } = build(extracted);

    expect(status).toBe('draft');
    expect(carriedKeys(file)).toEqual(['incomeTaxBrackets', 'rebates', 'thresholds']);
    expect(file.rebates.value).toEqual(previous.rebates.value);
    for (const key of ['incomeTaxBrackets', 'rebates', 'thresholds']) {
      expect(decisions[key].rejected).toBe(true);
      expect(decisions[key].origin).toBe('carried-forward');
      expect(decisions[key].reasons.join(' ')).toMatch(/thresholds\.under65 is R105 000/);
    }
    expect(decisions.thresholds.scraped).toEqual({ ...extracted.thresholds.value });
    expect(checks.find((check) => check.keys[0] === 'incomeTaxBrackets').ok).toBe(false);
    expect(validateTaxYearFile(file, '2028.json')).toMatchObject({ ok: true });
  });

  it('rejects and carries a TFSA limit that jumped 27.8%', () => {
    const extracted = fullExtraction();
    extracted.tfsa.value = { ...extracted.tfsa.value, annualLimit: 58800 };
    const { file, status, decisions } = build(extracted);
    expect(status).toBe('draft');
    expect(carriedKeys(file)).toEqual(['tfsa']);
    expect(file.tfsa.value).toEqual(previous.tfsa.value);
    expect(decisions.tfsa.scraped.annualLimit).toBe(58800);
    expect(decisions.tfsa.reasons.join(' ')).toMatch(/tfsa\.annualLimit changed by \+27\.8%/);
  });
});

describe('an existing draft', () => {
  const draftWith = (overrides) => {
    const draft = structuredClone(previous);
    draft.taxYear = YEAR;
    draft.status = 'draft';
    Object.assign(draft, overrides);
    return draft;
  };

  it('keeps a field a person confirmed and stays a draft', () => {
    const confirmed = {
      value: { rate: 0.275, annualCap: 450000 },
      carriedForward: false,
      source: previous.retirementDeduction.source,
    };
    const extracted = fullExtraction();
    delete extracted.retirementDeduction;
    const { file, status, decisions } = build(
      extracted,
      draftWith({ retirementDeduction: confirmed }),
    );

    expect(status).toBe('draft');
    expect(file.retirementDeduction).toEqual(confirmed);
    expect(decisions.retirementDeduction.origin).toBe('kept-from-draft');
    expect(carriedKeys(file)).toEqual([]);
    expect(validateTaxYearFile(file, '2028.json')).toMatchObject({ ok: true });
  });

  it('prefers a value scraped now over the one in the draft', () => {
    const stale = {
      value: { rate: 0.275, annualCap: 450000 },
      carriedForward: false,
      source: previous.retirementDeduction.source,
    };
    const { file, status } = build(fullExtraction(), draftWith({ retirementDeduction: stale }));
    expect(file.retirementDeduction.value.annualCap).toBe(grow(430000));
    expect(status).toBe('verified-auto');
  });

  it('does not keep a draft field that was itself carried forward', () => {
    const extracted = fullExtraction();
    delete extracted.uif;
    const draft = draftWith({
      uif: {
        value: { employeeRate: 0.01, monthlyEarningsCeiling: 99999 },
        carriedForward: true,
        source: previous.uif.source,
      },
    });
    const { file, decisions } = build(extracted, draft);
    expect(file.uif.value).toEqual(previous.uif.value);
    expect(decisions.uif.origin).toBe('carried-forward');
  });

  it('keeps the draft values of the trio only when all three were confirmed', () => {
    const extracted = fullExtraction();
    delete extracted.rebates;
    const draft = draftWith({
      rebates: { ...previous.rebates, carriedForward: false },
      thresholds: { ...previous.thresholds, carriedForward: true },
    });
    const { file } = build(extracted, draft);
    expect(carriedKeys(file)).toEqual(['incomeTaxBrackets', 'rebates', 'thresholds']);
  });
});
