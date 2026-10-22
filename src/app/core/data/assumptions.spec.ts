import { makeRates } from '../../testing/tax-data-fixtures';
import { GROWTH_PREMIUM_PP, deriveAssumptions } from './assumptions';
import { formatShortDate } from './format-date';

describe('deriveAssumptions', () => {
  it('uses CPI for inflation, repo for cash and CPI + 5 pp for growth', () => {
    const rates = makeRates().rates; // CPI 4.5, repo 7
    const assumptions = deriveAssumptions(rates);
    expect(GROWTH_PREMIUM_PP).toBe(5);
    expect(assumptions.inflation.valuePercent).toBe(4.5);
    expect(assumptions.cashReturn.valuePercent).toBe(7);
    expect(assumptions.growthReturn.valuePercent).toBe(9.5);
  });

  it('rounds away float noise', () => {
    const rates = makeRates().rates;
    rates.cpi.valuePercent = 4.1;
    expect(deriveAssumptions(rates).growthReturn.valuePercent).toBe(9.1);
  });

  it('describes each assumption as an assumption and names its source rate and date', () => {
    const { inflation, cashReturn, growthReturn } = deriveAssumptions(makeRates().rates);
    for (const assumption of [inflation, cashReturn, growthReturn]) {
      expect(assumption.description.startsWith('Assumption:')).toBe(true);
    }
    expect(inflation.description).toContain('CPI');
    // Month abbreviations come from Intl ("Sept" in en-ZA), so build the expectation the same way.
    expect(inflation.description).toContain(formatShortDate('2026-09-30'));
    expect(cashReturn.description).toContain('repo');
    expect(cashReturn.description).toContain(formatShortDate('2026-10-22'));
    expect(growthReturn.description).toContain('CPI');
    expect(growthReturn.description).toContain(formatShortDate('2026-09-30'));
  });

  it('gives each assumption a stable id and label', () => {
    const assumptions = deriveAssumptions(makeRates().rates);
    expect(assumptions.inflation.id).toBe('inflation');
    expect(assumptions.cashReturn.id).toBe('cashReturn');
    expect(assumptions.growthReturn.id).toBe('growthReturn');
    expect(assumptions.growthReturn.label).toBe('Growth portfolio return');
  });
});
