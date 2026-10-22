import { makeRates } from '../../testing/tax-data-fixtures';
import { validateRatesFile } from './rates.validator';

function errorsOf(data: unknown): readonly string[] {
  const result = validateRatesFile(data, 'rates.json');
  return result.ok ? [] : result.errors;
}

describe('validateRatesFile', () => {
  it('accepts the fixture', () => {
    expect(validateRatesFile(makeRates(), 'rates.json').ok).toBe(true);
  });

  it('rejects a missing entry', () => {
    const data = makeRates();
    delete (data.rates as Partial<typeof data.rates>).zaronia;
    expect(errorsOf(data)).toEqual(['rates.json: rates.zaronia is missing.']);
  });

  it('rejects a negative value', () => {
    const data = makeRates();
    data.rates.prime.valuePercent = -1;
    const errors = errorsOf(data);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('rates.prime.valuePercent');
  });

  it('rejects a value above 100', () => {
    const data = makeRates();
    data.rates.cpi.valuePercent = 450;
    expect(errorsOf(data)[0]).toContain('rates.cpi.valuePercent');
  });

  it('rejects a bad date', () => {
    const data = makeRates();
    data.rates.repo.asOf = '2026-02-30';
    expect(errorsOf(data)).toEqual([
      'rates.json: rates.repo.asOf must be a real date as YYYY-MM-DD (found "2026-02-30").',
    ]);
  });

  it('rejects an asOf after fetchedOn', () => {
    const data = makeRates();
    data.rates.r2030.asOf = '2026-10-23';
    expect(errorsOf(data)).toEqual([
      'rates.json: rates.r2030.asOf (2026-10-23) is after fetchedOn (2026-10-22).',
    ]);
  });

  it('rejects a non-https source and empty labels', () => {
    const data = makeRates({ source: 'http://example.org' });
    data.rates.r209.label = ' ';
    data.rates.r209.seriesCode = '';
    const errors = errorsOf(data);
    expect(errors.length).toBe(3);
    expect(errors.join('\n')).toContain('source');
    expect(errors.join('\n')).toContain('rates.r209.label');
    expect(errors.join('\n')).toContain('rates.r209.seriesCode');
  });
});
