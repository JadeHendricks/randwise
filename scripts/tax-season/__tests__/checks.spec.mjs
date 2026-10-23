import { describe, expect, it } from 'vitest';

import {
  checkBrackets,
  checkThresholds,
  checkUnit,
  compareYears,
  formatPercentChange,
} from '../lib/checks.mjs';
import { shippedPrevious } from './helpers.mjs';

const previous = shippedPrevious();
const SOURCE = 'https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/';

// Invented 2028 figures (see the fixtures): brackets +4%, rebates +3.3%.
const goodBrackets = () => [
  { above: 0, upTo: 255000, base: 0, rate: 0.18 },
  { above: 255000, upTo: 398400, base: 45900, rate: 0.26 },
  { above: 398400, upTo: 551400, base: 83184, rate: 0.31 },
  { above: 551400, upTo: 723600, base: 130614, rate: 0.36 },
  { above: 723600, upTo: 922500, base: 192606, rate: 0.39 },
  { above: 922500, upTo: 1953900, base: 270177, rate: 0.41 },
  { above: 1953900, upTo: null, base: 693051, rate: 0.45 },
];
const goodRebates = () => ({ primary: 18400, secondary: 10100, tertiary: 3360 });
const goodThresholds = () => ({ under65: 102222, age65to74: 158333, age75plus: 177000 });

const trio = () => ({
  incomeTaxBrackets: goodBrackets(),
  rebates: goodRebates(),
  thresholds: goodThresholds(),
});

function checkTrio(values) {
  return checkUnit(['incomeTaxBrackets', 'rebates', 'thresholds'], values, previous, {
    year: 2028,
    today: '2027-02-20',
    sourcesForUnit: { incomeTaxBrackets: SOURCE, rebates: SOURCE, thresholds: SOURCE },
  });
}

const failing = (outcome) => outcome.results.filter((result) => !result.ok);
const messagesOf = (outcome) => failing(outcome).flatMap((result) => result.messages);

describe('formatPercentChange', () => {
  it('formats to one decimal with a sign', () => {
    expect(formatPercentChange(4.04)).toBe('+4.0%');
    expect(formatPercentChange(-12)).toBe('-12.0%');
    expect(formatPercentChange(34.7)).toBe('+34.7%');
    expect(formatPercentChange(0.01)).toBe('0.0%');
    expect(formatPercentChange(null)).toBe('new');
  });
});

describe('the invented 2028 trio', () => {
  it('passes every check', () => {
    const outcome = checkTrio(trio());
    expect(messagesOf(outcome)).toEqual([]);
    expect(outcome.ok).toBe(true);
    expect(outcome.results.map((result) => result.id)).toEqual([
      'brackets',
      'thresholds',
      'year-on-year',
      'validator',
    ]);
  });

  it('fails the brackets check for a base that does not match the lower rows', () => {
    const values = trio();
    values.incomeTaxBrackets[2].base = 83284;
    const outcome = checkTrio(values);
    expect(outcome.ok).toBe(false);
    expect(failing(outcome).map((result) => result.id)).toContain('brackets');
    expect(messagesOf(outcome).join(' ')).toMatch(/incomeTaxBrackets row 3 base is R83 284/);
  });

  it('fails the brackets check for a rate that does not rise', () => {
    const values = trio();
    values.incomeTaxBrackets[3].rate = 0.3;
    const outcome = checkTrio(values);
    expect(failing(outcome).map((result) => result.id)).toContain('brackets');
    expect(messagesOf(outcome).join(' ')).toMatch(/row 4 rate 0\.3 must be higher/);
  });

  it('fails the brackets check for a gap between brackets', () => {
    const values = trio();
    values.incomeTaxBrackets[1].above = 256000;
    const outcome = checkTrio(values);
    expect(messagesOf(outcome).join(' ')).toMatch(/leaving a gap/);
  });

  it('fails the thresholds check for a threshold that does not match the rebate', () => {
    const values = trio();
    values.thresholds.under65 = 105000;
    const outcome = checkTrio(values);
    expect(failing(outcome).map((result) => result.id)).toContain('thresholds');
    expect(messagesOf(outcome).join(' ')).toMatch(/thresholds\.under65 is R105 000/);
  });

  it('fails the year-on-year check for a rebate that jumps 34.7%', () => {
    const values = trio();
    values.rebates.primary = 24000;
    values.thresholds.under65 = Math.round(24000 / 0.18);
    values.thresholds.age65to74 = Math.round((24000 + 10100) / 0.18);
    values.thresholds.age75plus = Math.round((24000 + 10100 + 3360) / 0.18);
    const outcome = checkTrio(values);
    expect(failing(outcome).map((result) => result.id)).toEqual(['year-on-year']);
    expect(messagesOf(outcome)[0]).toMatch(
      /rebates\.primary changed by \+34\.7% \(17820 to 24000\)/,
    );
  });

  it('fails when the number of bracket rows changes', () => {
    const values = trio();
    values.incomeTaxBrackets.splice(6, 0, {
      above: 1953900,
      upTo: 2000000,
      base: 693051,
      rate: 0.44,
    });
    values.incomeTaxBrackets[7] = { above: 2000000, upTo: null, base: 713000, rate: 0.46 };
    const outcome = checkTrio(values);
    expect(outcome.ok).toBe(false);
    expect(messagesOf(outcome).join(' ')).toMatch(/structure changed: 7 rows last year, 8 now/);
  });

  it('catches a negative number with the probe validator', () => {
    const outcome = checkUnit(
      ['tfsa'],
      { tfsa: { annualLimit: -5, lifetimeLimit: 500000, excessPenaltyRate: 0.4 } },
      previous,
      {
        year: 2028,
        today: '2027-02-20',
        sourcesForUnit: { tfsa: SOURCE },
      },
    );
    const validator = outcome.results.find((result) => result.id === 'validator');
    expect(validator.ok).toBe(false);
    expect(validator.messages.join(' ')).toMatch(/tfsa\.annualLimit must not be negative/);
  });
});

describe('compareYears', () => {
  it('passes a +4% change and lists the changed leaves', () => {
    const outcome = compareYears(
      { primary: 17820, secondary: 9765 },
      { primary: 18533, secondary: 9765 },
      { path: 'rebates' },
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.changes).toHaveLength(1);
    expect(outcome.changes[0]).toMatchObject({
      path: 'rebates.primary',
      previous: 17820,
      next: 18533,
    });
    expect(outcome.changes[0].pct).toBeCloseTo(4.0, 1);
  });

  it('allows exactly 25% and rejects more', () => {
    expect(compareYears(100, 125).ok).toBe(true);
    expect(compareYears(100, 75).ok).toBe(true);
    expect(compareYears(100, 125.5).ok).toBe(false);
  });

  it('rejects a value that was 0 and is not any more, and accepts 0 to 0', () => {
    const outcome = compareYears(0, 5, { path: 'x' });
    expect(outcome.ok).toBe(false);
    expect(outcome.problems[0]).toMatch(/x was 0 last year and is 5 now/);
    expect(compareYears(0, 0).ok).toBe(true);
  });

  it('names leaves inside arrays', () => {
    const outcome = compareYears([{ base: 100 }, { base: 200 }], [{ base: 100 }, { base: 400 }], {
      path: 'rows',
    });
    expect(outcome.problems[0]).toMatch(/^rows\[1\]\.base changed by \+100\.0%/);
  });

  it('reports different keys and requires null to stay null', () => {
    expect(compareYears({ a: 1 }, { b: 1 }, { path: 'f' }).problems[0]).toMatch(
      /structure changed/,
    );
    expect(compareYears({ a: null }, { a: null }).ok).toBe(true);
    expect(compareYears({ a: null }, { a: 5 }).ok).toBe(false);
  });
});

describe('checkBrackets and checkThresholds', () => {
  it('pass for the shipped 2027 values', () => {
    expect(checkBrackets('incomeTaxBrackets', previous.incomeTaxBrackets.value)).toEqual([]);
    expect(
      checkThresholds(
        previous.incomeTaxBrackets.value,
        previous.rebates.value,
        previous.thresholds.value,
      ),
    ).toEqual([]);
  });

  it('label each problem with the check that found it', () => {
    const rows = goodBrackets();
    rows[2].base = 83284;
    const problems = checkBrackets('incomeTaxBrackets', rows);
    expect(problems.map((problem) => problem.id)).toEqual(['brackets-base']);
  });
});
