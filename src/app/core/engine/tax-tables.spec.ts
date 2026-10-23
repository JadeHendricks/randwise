import { makeTaxYear } from '../../testing/tax-data-fixtures';
import { deepFreeze, fixtureTaxTables, shippedTaxTables2027 } from '../../testing/tax-tables';
import { toTaxTables } from './tax-tables';

describe('toTaxTables', () => {
  it('unwraps the shipped 2027.json into plain engine tables', () => {
    expect(shippedTaxTables2027()).toEqual({
      taxYear: 2027,
      brackets: [
        { above: 0, upTo: 245_100, base: 0, rate: 0.18 },
        { above: 245_100, upTo: 383_100, base: 44_118, rate: 0.26 },
        { above: 383_100, upTo: 530_200, base: 79_998, rate: 0.31 },
        { above: 530_200, upTo: 695_800, base: 125_599, rate: 0.36 },
        { above: 695_800, upTo: 887_000, base: 185_215, rate: 0.39 },
        { above: 887_000, upTo: 1_878_600, base: 259_783, rate: 0.41 },
        { above: 1_878_600, upTo: null, base: 666_339, rate: 0.45 },
      ],
      rebates: { primary: 17_820, secondary: 9_765, tertiary: 3_249 },
      thresholds: { under65: 99_000, age65to74: 153_250, age75plus: 171_300 },
      medicalCredits: { mainMember: 376, firstDependant: 376, additionalDependant: 254 },
      uif: { rate: 0.01, monthlyCeiling: 17_712 },
      retirement: { rate: 0.275, annualCap: 430_000 },
    });
  });

  it('reads medical, UIF and retirement figures from the file rather than hardcoding them', () => {
    const tables = fixtureTaxTables();
    expect(tables.medicalCredits).toEqual({
      mainMember: 100,
      firstDependant: 100,
      additionalDependant: 50,
    });
    expect(tables.uif).toEqual({ rate: 0.01, monthlyCeiling: 10_000 });
    expect(tables.retirement).toEqual({ rate: 0.25, annualCap: 100_000 });
  });

  it('copies the bracket rows so the tables never alias the file', () => {
    const file = makeTaxYear(2027);
    const tables = toTaxTables(file);
    file.incomeTaxBrackets.value[0].rate = 0.5;
    expect(tables.brackets[0].rate).toBe(0.18);
    expect(tables.brackets).not.toBe(file.incomeTaxBrackets.value);
  });

  it('works on a deep-frozen file', () => {
    const file = deepFreeze(makeTaxYear(2027));
    expect(() => toTaxTables(file)).not.toThrow();
  });
});
