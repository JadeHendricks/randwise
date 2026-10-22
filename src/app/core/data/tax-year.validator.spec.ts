import { makeTaxYear } from '../../testing/tax-data-fixtures';
import { taxYearPeriod } from './tax-calendar';
import { validateTaxYearFile } from './tax-year.validator';

function errorsOf(data: unknown, fileName = '2027.json'): readonly string[] {
  const result = validateTaxYearFile(data, fileName);
  return result.ok ? [] : result.errors;
}

/** Expect exactly one error that mentions every given fragment. */
function expectError(data: unknown, ...fragments: string[]) {
  const errors = errorsOf(data);
  expect(errors.length, errors.join('\n')).toBe(1);
  for (const fragment of fragments) expect(errors[0]).toContain(fragment);
}

describe('validateTaxYearFile', () => {
  it('accepts the fixture', () => {
    const result = validateTaxYearFile(makeTaxYear(), '2027.json');
    expect(result.ok).toBe(true);
  });

  it('prefixes every error with the file name', () => {
    expect(errorsOf(null, '2027.json')).toEqual(['2027.json: is not a JSON object.']);
  });

  it('rejects a missing field', () => {
    const data: Record<string, unknown> = makeTaxYear();
    delete data['medicalCredits'];
    expectError(data, 'medicalCredits', 'missing');
  });

  it('rejects a field without carriedForward', () => {
    const data = makeTaxYear();
    delete (data.uif as Partial<typeof data.uif>).carriedForward;
    expectError(data, 'uif.carriedForward');
  });

  it('rejects a source that is not listed in sources', () => {
    const data = makeTaxYear();
    data.cgt.source = 'https://www.sars.gov.za/somewhere-else/';
    expectError(data, 'cgt.source', 'not listed in sources');
  });

  it('rejects a non-https source', () => {
    const data = makeTaxYear();
    data.tfsa.source = 'http://www.sars.gov.za/';
    expectError(data, 'tfsa.source', 'https');
  });

  it('rejects a gap between brackets', () => {
    const data = makeTaxYear();
    data.incomeTaxBrackets.value[2].above = 383_200;
    const errors = errorsOf(data);
    expect(errors.some((e) => e.includes('incomeTaxBrackets row 3') && e.includes('a gap'))).toBe(
      true,
    );
  });

  it('rejects overlapping brackets', () => {
    const data = makeTaxYear();
    data.withdrawalLumpSum.value[1].above = 9_000;
    const errors = errorsOf(data);
    expect(
      errors.some((e) => e.includes('withdrawalLumpSum row 2') && e.includes('an overlap')),
    ).toBe(true);
  });

  it('rejects a rate that does not rise', () => {
    const data = makeTaxYear();
    data.retirementLumpSum.value[1].rate = 0;
    expectError(data, 'retirementLumpSum row 2 rate');
  });

  it('allows a base off by R1 but not by R2', () => {
    const offByOne = makeTaxYear();
    offByOne.incomeTaxBrackets.value[2].base = 79_999;
    expect(errorsOf(offByOne)).toEqual([]);

    const offByTwo = makeTaxYear();
    offByTwo.incomeTaxBrackets.value[2].base = 80_000;
    expectError(offByTwo, 'incomeTaxBrackets row 3 base', 'R80 000', 'R79 998');
  });

  it('rejects a first row that does not start at 0 with base 0', () => {
    const data = makeTaxYear();
    data.incomeTaxBrackets.value[0].base = 5;
    expect(errorsOf(data).some((e) => e.includes('incomeTaxBrackets row 1 base must be 0'))).toBe(
      true,
    );
  });

  it('requires only the last row to be open-ended', () => {
    const data = makeTaxYear();
    data.retirementLumpSum.value[1].upTo = 200_000;
    expectError(data, 'retirementLumpSum row 2', 'upTo null');
  });

  it('allows a threshold off by R1 but not by R2', () => {
    const offByOne = makeTaxYear();
    offByOne.thresholds.value.under65 = 99_001;
    expect(errorsOf(offByOne)).toEqual([]);

    const offByTwo = makeTaxYear();
    offByTwo.thresholds.value.age65to74 = 153_252;
    expectError(offByTwo, 'thresholds.age65to74', 'R153 252', 'R153 250');
  });

  it('rejects negative numbers', () => {
    const data = makeTaxYear();
    data.medicalCredits.value.additionalDependant = -1;
    expectError(data, 'medicalCredits.additionalDependant', 'negative');
  });

  it('rejects rates above 1', () => {
    const data = makeTaxYear();
    data.dividendsWithholdingRate.value = 20;
    expectError(data, 'dividendsWithholdingRate', 'between 0 and 1');
  });

  it('rejects an impossible date', () => {
    const data = makeTaxYear();
    data.verifiedOn = '2026-02-30';
    expectError(data, 'verifiedOn', '2026-02-30');
  });

  it('rejects a period that is not 1 March to the end of February', () => {
    const data = makeTaxYear();
    data.period = { start: '2026-03-01', end: '2027-03-01' };
    expectError(data, 'period', '2026-03-01 to 2027-02-28');
  });

  it('requires 29 February in a leap year', () => {
    const wrong = makeTaxYear(2028);
    wrong.period = { start: '2027-03-01', end: '2028-02-28' };
    const result = validateTaxYearFile(wrong, '2028.json');
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.errors.join()).toContain('2028-02-29');

    expect(taxYearPeriod(2028).end).toBe('2028-02-29');
    expect(validateTaxYearFile(makeTaxYear(2028), '2028.json').ok).toBe(true);
  });

  it('rejects an unknown status', () => {
    const data: Record<string, unknown> = makeTaxYear();
    data['status'] = 'final';
    expectError(data, 'status', 'final');
  });

  it('rejects a file name that does not match the tax year', () => {
    expect(errorsOf(makeTaxYear(2027), '2028.json')).toEqual([
      '2028.json: taxYear is 2027 but the file name says 2028.',
    ]);
    expect(errorsOf(makeTaxYear(2027), 'tax-2027.json')[0]).toContain('file name');
  });

  it('rejects two-pot shares that do not add up to 1', () => {
    const data = makeTaxYear();
    data.twoPot.value.savingsShare = 0.3;
    expectError(data, 'twoPot', 'add up to 1');
  });

  it('rejects a drawdown range where min is not below max', () => {
    const data = makeTaxYear();
    data.livingAnnuityDrawdown.value.minRate = 0.2;
    expectError(data, 'livingAnnuityDrawdown');
  });

  it('requires whole-number counts', () => {
    const data = makeTaxYear();
    data.twoPot.value.withdrawalsPerTaxYear = 1.5;
    data.earliestRaRetirementAge.value = 0;
    const errors = errorsOf(data);
    expect(errors.some((e) => e.includes('twoPot.withdrawalsPerTaxYear'))).toBe(true);
    expect(errors.some((e) => e.includes('earliestRaRetirementAge'))).toBe(true);
  });

  it('reports every problem at once', () => {
    const data: Record<string, unknown> = makeTaxYear();
    data['status'] = 'nope';
    data['verifiedOn'] = 'yesterday';
    delete data['cgt'];
    const errors = errorsOf(data);
    expect(errors.length).toBe(3);
    expect(errors.join('\n')).toContain('status');
    expect(errors.join('\n')).toContain('verifiedOn');
    expect(errors.join('\n')).toContain('cgt');
  });
});
