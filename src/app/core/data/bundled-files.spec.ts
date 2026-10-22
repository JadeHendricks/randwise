import rates from '../../../assets/data/rates.json';
import taxYear2027 from '../../../assets/data/tax-years/2027.json';
import { validateRatesFile } from './rates.validator';
import { TAX_YEAR_FIELD_KEYS } from './tax-year.schema';
import { validateTaxYearFile } from './tax-year.validator';

describe('bundled data files', () => {
  it('2027.json passes the tax-year validator', () => {
    const result = validateTaxYearFile(taxYear2027, '2027.json');
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it('rates.json passes the rates validator', () => {
    const result = validateRatesFile(rates, 'rates.json');
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  // Golden check against the values the user verified on the SARS individuals page.
  it('2027 brackets, rebates and thresholds match the verified SARS values exactly', () => {
    expect(taxYear2027.incomeTaxBrackets.value).toEqual([
      { above: 0, upTo: 245_100, base: 0, rate: 0.18 },
      { above: 245_100, upTo: 383_100, base: 44_118, rate: 0.26 },
      { above: 383_100, upTo: 530_200, base: 79_998, rate: 0.31 },
      { above: 530_200, upTo: 695_800, base: 125_599, rate: 0.36 },
      { above: 695_800, upTo: 887_000, base: 185_215, rate: 0.39 },
      { above: 887_000, upTo: 1_878_600, base: 259_783, rate: 0.41 },
      { above: 1_878_600, upTo: null, base: 666_339, rate: 0.45 },
    ]);
    expect(taxYear2027.rebates.value).toEqual({
      primary: 17_820,
      secondary: 9_765,
      tertiary: 3_249,
    });
    expect(taxYear2027.thresholds.value).toEqual({
      under65: 99_000,
      age65to74: 153_250,
      age75plus: 171_300,
    });
  });

  it('is draft exactly when some field is carried forward', () => {
    const anyCarried = TAX_YEAR_FIELD_KEYS.some((key) => taxYear2027[key].carriedForward);
    expect(taxYear2027.status === 'draft').toBe(anyCarried);
  });
});
