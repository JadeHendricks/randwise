import taxYear2027 from '../../../assets/data/tax-years/2027.json';
import { makeTaxYear } from '../../testing/tax-data-fixtures';
import { deepFreeze, fixtureTaxTables, shippedTaxTables2027 } from '../../testing/tax-tables';
import { validateTaxYearFile } from '../data/tax-year.validator';
import { incomeTax } from './income-tax';
import { toRaRules } from './ra';
import {
  TwoPotAccepted,
  TwoPotWithdrawalInput,
  TwoPotWithdrawalResult,
  twoPotWithdrawal,
} from './two-pot';

/**
 * Goldens are hand-derived in plan.md section 2 from the shipped 2026/27 brackets:
 * 0-245 100 @18% base 0, 245 100-383 100 @26% base 44 118, 383 100-530 200 @31% base 79 998,
 * 530 200-695 800 @36% base 125 599, 695 800-887 000 @39% base 185 215,
 * 887 000-1 878 600 @41% base 259 783, above @45% base 666 339.
 * Rebates: primary 17 820, +9 765 from 65, +3 249 from 75.
 * Source: https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
 * A savings-pot withdrawal is added to taxable income and taxed at the marginal rate (not the
 * lump-sum tables): https://www.sars.gov.za/media-release/tax-implications-of-withdrawing-from-two-pot-retirement-system/
 */
const shipped = validateTaxYearFile(taxYear2027, '2027.json');
if (!shipped.ok) throw new Error(`2027.json is invalid: ${shipped.errors.join('; ')}`);
const rules = toRaRules(shipped.value);
const tables = shippedTaxTables2027();

const base: TwoPotWithdrawalInput = {
  withdrawal: 50_000,
  taxableIncome: 350_000,
  age: 40,
  yearsToRetirement: 20,
  realGrowth: 0.04,
  inflation: 0.05,
};

function accepted(result: TwoPotWithdrawalResult): TwoPotAccepted {
  if (!result.accepted) throw new Error('expected the withdrawal to be accepted');
  return result;
}

function run(patch: Partial<TwoPotWithdrawalInput>): TwoPotAccepted {
  return accepted(twoPotWithdrawal({ ...base, ...patch }, tables, rules));
}

function expectInvariants(result: TwoPotAccepted, input: TwoPotWithdrawalInput): void {
  const bandSum = result.bands.reduce((sum, band) => sum + band.tax, 0);
  const bare =
    incomeTax(input.taxableIncome + input.withdrawal, tables) -
    incomeTax(input.taxableIncome, tables);
  expect(bandSum).toBeCloseTo(bare, 6);
  expect(result.taxBeforeRebates).toBeCloseTo(bandSum, 6);
  expect(result.tax).toBeCloseTo(bandSum - result.absorbedByCredits, 6);
  expect(result.netCash + result.tax).toBeCloseTo(input.withdrawal, 6);
  expect(result.trueCostToday).toBeCloseTo(result.futureValueToday - result.netCash, 6);
  const banded = result.bands.reduce((sum, band) => sum + band.amount, 0);
  expect(banded).toBeCloseTo(input.withdrawal, 6);
}

describe('twoPotWithdrawal', () => {
  it('reads the minimum and withdrawals per year from the shipped file', () => {
    expect(rules.minimumWithdrawal).toBe(2_000);
    expect(rules.withdrawalsPerTaxYear).toBe(1);
  });

  it('TP1: a withdrawal crossing a bracket, R50 000 on R350 000 at 40', () => {
    const result = run({});
    // incomeTax(350 000) = 44 118 + 0.26 × 104 900 = 71 392; net 71 392 − 17 820 = 53 572
    expect(result.taxBeforeWithdrawal).toBeCloseTo(53_572, 6);
    // incomeTax(400 000) = 79 998 + 0.31 × 16 900 = 85 237; net 85 237 − 17 820 = 67 417
    expect(result.taxAfterWithdrawal).toBeCloseTo(67_417, 6);
    // 67 417 − 53 572 = 13 845 (= 85 237 − 71 392: the rebate is already used up)
    expect(result.tax).toBeCloseTo(13_845, 6);
    expect(result.taxBeforeRebates).toBeCloseTo(13_845, 6);
    expect(result.absorbedByCredits).toBeCloseTo(0, 6);
    // (350 000, 383 100] = 33 100 @26% = 8 606; (383 100, 400 000] = 16 900 @31% = 5 239
    expect(result.bands).toHaveLength(2);
    expect(result.bands[0]).toEqual({
      above: 350_000,
      upTo: 383_100,
      amount: 33_100,
      rate: 0.26,
      tax: expect.closeTo(8_606, 6),
    });
    expect(result.bands[1]).toEqual({
      above: 383_100,
      upTo: 400_000,
      amount: 16_900,
      rate: 0.31,
      tax: expect.closeTo(5_239, 6),
    });
    expect(result.startRate).toBe(0.26);
    expect(result.topRate).toBe(0.31);
    expect(result.crossesBracket).toBe(true);
    // 13 845 / 50 000 = 0.2769; net cash 50 000 − 13 845 = 36 155
    expect(result.effectiveRate).toBeCloseTo(0.2769, 10);
    expect(result.netCash).toBeCloseTo(36_155, 6);
    expect(result.minimum).toBe(2_000);
    expect(result.withdrawalsPerTaxYear).toBe(1);
    expect(result.yearsToRetirement).toBe(20);
    // 1.04^20 = 2.1911231430; 50 000 × 2.1911231430 = 109 556.157 in today's money
    expect(result.futureValueToday).toBeCloseTo(109_556.157, 3);
    expect(result.lostGrowthToday).toBeCloseTo(59_556.157, 3);
    // 13 845 + 59 556.157 = 73 401.157; per rand received 73 401.157 / 36 155 = 2.03018
    expect(result.trueCostToday).toBeCloseTo(73_401.157, 3);
    expect(result.costPerRandReceived).toBeCloseTo(2.03018, 5);
    // (1.04 × 1.05)^20 = 1.092^20 = 5.813702 (= 2.1911231 × 2.6532977); 50 000 × that = 290 685.100
    expect(result.futureValueNominal).toBeCloseTo(290_685.1, 3);
    expect(result.lostGrowthNominal).toBeCloseTo(240_685.1, 3);
    // 13 845 + 240 685.100 = 254 530.100 (tax in today's rand plus growth lost in future rand)
    expect(result.trueCostNominal).toBeCloseTo(254_530.1, 3);
    expectInvariants(result, base);
  });

  it('TP2: the R2 000 minimum is inclusive and read from data', () => {
    // 1 999.99 < 2 000: rejected, no money fields
    expect(twoPotWithdrawal({ ...base, withdrawal: 1_999.99 }, tables, rules)).toEqual({
      accepted: false,
      reason: 'below-minimum',
      withdrawal: 1_999.99,
      minimum: 2_000,
      withdrawalsPerTaxYear: 1,
    });
    const zero = twoPotWithdrawal({ ...base, withdrawal: 0 }, tables, rules);
    expect(zero.accepted).toBe(false);
    expect(zero).not.toHaveProperty('tax');

    // 2 000 at R350 000 sits wholly in the 26% row: tax 0.26 × 2 000 = 520, net 1 480
    const atMinimum = run({ withdrawal: 2_000 });
    expect(atMinimum.tax).toBeCloseTo(520, 6);
    expect(atMinimum.effectiveRate).toBeCloseTo(0.26, 10);
    expect(atMinimum.netCash).toBeCloseTo(1_480, 6);

    expect(() => twoPotWithdrawal({ ...base, withdrawal: -1 }, tables, rules)).toThrow(RangeError);
    expect(() => twoPotWithdrawal({ ...base, withdrawal: Number.NaN }, tables, rules)).toThrow(
      RangeError,
    );
  });

  it('TP2: the fixture minimum of R1 000 accepts R1 500 (no hard-coded minimum)', () => {
    const fixtureRules = toRaRules(makeTaxYear(2027));
    expect(fixtureRules.minimumWithdrawal).toBe(1_000);
    const result = twoPotWithdrawal(
      { ...base, withdrawal: 1_500 },
      fixtureTaxTables(),
      fixtureRules,
    );
    // 1 500 in the 26% row: tax 390
    expect(accepted(result).tax).toBeCloseTo(390, 6);
    expect(accepted(result).minimum).toBe(1_000);
    expect(accepted(result).withdrawalsPerTaxYear).toBe(2);
    expect(
      twoPotWithdrawal({ ...base, withdrawal: 999 }, fixtureTaxTables(), fixtureRules),
    ).toEqual({
      accepted: false,
      reason: 'below-minimum',
      withdrawal: 999,
      minimum: 1_000,
      withdrawalsPerTaxYear: 2,
    });
  });

  it('TP3: income exactly on an upper bound starts at the next rate', () => {
    const input = { ...base, taxableIncome: 383_100, withdrawal: 10_000 };
    const result = run(input);
    // before 79 998 − 17 820 = 62 178; incomeTax(393 100) = 79 998 + 0.31 × 10 000 = 83 098,
    // net 65 278; tax 3 100
    expect(result.taxBeforeWithdrawal).toBeCloseTo(62_178, 6);
    expect(result.taxAfterWithdrawal).toBeCloseTo(65_278, 6);
    expect(result.tax).toBeCloseTo(3_100, 6);
    // one band (383 100, 393 100] @31%; start 0.31, not the 26% row findBracket(383 100) returns
    expect(result.bands).toHaveLength(1);
    expect(result.bands[0].above).toBe(383_100);
    expect(result.bands[0].upTo).toBe(393_100);
    expect(result.startRate).toBe(0.31);
    expect(result.topRate).toBe(0.31);
    expect(result.crossesBracket).toBe(false);
    expect(result.effectiveRate).toBeCloseTo(0.31, 10);
    expectInvariants(result, input);
  });

  it('TP4: the rebate floor absorbs part of the tax (bare difference would say 9 000)', () => {
    const input = { ...base, taxableIncome: 90_000, withdrawal: 50_000 };
    const result = run(input);
    // incomeTax(90 000) = 16 200 < 17 820, net 0; incomeTax(140 000) = 25 200, net 7 380
    expect(result.taxBeforeWithdrawal).toBe(0);
    expect(result.taxAfterWithdrawal).toBeCloseTo(7_380, 6);
    expect(result.tax).toBeCloseTo(7_380, 6);
    // one band (90 000, 140 000] @18% = 9 000; absorbed 9 000 − 7 380 = 1 620 (= 17 820 − 16 200)
    expect(result.bands).toHaveLength(1);
    expect(result.bands[0].tax).toBeCloseTo(9_000, 6);
    expect(result.taxBeforeRebates).toBeCloseTo(9_000, 6);
    expect(result.absorbedByCredits).toBeCloseTo(1_620, 6);
    // 7 380 / 50 000 = 0.1476
    expect(result.effectiveRate).toBeCloseTo(0.1476, 10);
    expectInvariants(result, input);
  });

  it('TP5: the secondary rebate starts at 65', () => {
    const input = { ...base, taxableIncome: 150_000, withdrawal: 20_000, age: 66 };
    const senior = run(input);
    // rebates 17 820 + 9 765 = 27 585; incomeTax(150 000) = 27 000 (net 0),
    // incomeTax(170 000) = 30 600 (net 3 015); band 18% = 3 600; absorbed 585
    expect(senior.taxBeforeWithdrawal).toBe(0);
    expect(senior.tax).toBeCloseTo(3_015, 6);
    expect(senior.absorbedByCredits).toBeCloseTo(585, 6);
    expectInvariants(senior, input);

    // age 64: rebate 17 820; net before 9 180, after 12 780; tax 3 600, absorbed 0
    const younger = run({ ...input, age: 64 });
    expect(younger.taxBeforeWithdrawal).toBeCloseTo(9_180, 6);
    expect(younger.taxAfterWithdrawal).toBeCloseTo(12_780, 6);
    expect(younger.tax).toBeCloseTo(3_600, 6);
    expect(younger.absorbedByCredits).toBeCloseTo(0, 6);

    // age 65 is the first age with the extra rebate
    expect(run({ ...input, age: 65 }).tax).toBeCloseTo(3_015, 6);
  });

  it('TP6: the medical credit absorbs all the tax', () => {
    const input = {
      ...base,
      taxableIncome: 100_000,
      withdrawal: 10_000,
      medicalCreditAnnual: 4_512,
    };
    const result = run(input);
    // 4 512 = 376 × 12; incomeTax(100 000) = 18 000, incomeTax(110 000) = 19 800,
    // both below 17 820 + 4 512 = 22 332, so net before and after are 0
    expect(result.taxBeforeWithdrawal).toBe(0);
    expect(result.taxAfterWithdrawal).toBe(0);
    expect(result.tax).toBe(0);
    // band 18% = 1 800, all absorbed
    expect(result.bands[0].tax).toBeCloseTo(1_800, 6);
    expect(result.absorbedByCredits).toBeCloseTo(1_800, 6);
    expect(result.effectiveRate).toBe(0);
    expect(result.netCash).toBe(10_000);
    expectInvariants(result, input);
  });

  it('TP7: two brackets from a low start', () => {
    const input = { ...base, taxableIncome: 240_000, withdrawal: 100_000 };
    const result = run(input);
    // (240 000, 245 100] 5 100 @18% = 918; (245 100, 340 000] 94 900 @26% = 24 674
    expect(result.bands.map((band) => band.amount)).toEqual([5_100, 94_900]);
    expect(result.bands[0].tax).toBeCloseTo(918, 6);
    expect(result.bands[1].tax).toBeCloseTo(24_674, 6);
    // incomeTax(340 000) = 68 792, incomeTax(240 000) = 43 200, difference 25 592
    expect(result.tax).toBeCloseTo(25_592, 6);
    expect(result.startRate).toBe(0.18);
    expect(result.topRate).toBe(0.26);
    expect(result.crossesBracket).toBe(true);
    expectInvariants(result, input);
  });

  it('TP8: into the top bracket', () => {
    const input = { ...base, taxableIncome: 1_800_000, withdrawal: 200_000 };
    const result = run(input);
    // (1 800 000, 1 878 600] 78 600 @41% = 32 226; (1 878 600, 2 000 000] 121 400 @45% = 54 630
    expect(result.bands).toHaveLength(2);
    expect(result.bands[0].tax).toBeCloseTo(32_226, 6);
    expect(result.bands[1].upTo).toBe(2_000_000);
    expect(result.bands[1].tax).toBeCloseTo(54_630, 6);
    // 720 969 − 634 113 = 86 856
    expect(result.tax).toBeCloseTo(86_856, 6);
    expect(result.startRate).toBe(0.41);
    expect(result.topRate).toBe(0.45);
    expectInvariants(result, input);
  });

  it('TP9: zero years, zero growth and zero inflation', () => {
    // years 0: FV today = withdrawal, lost growth 0, true cost = tax
    const noYears = run({ yearsToRetirement: 0 });
    expect(noYears.futureValueToday).toBe(50_000);
    expect(noYears.lostGrowthToday).toBe(0);
    expect(noYears.trueCostToday).toBeCloseTo(13_845, 6);
    expect(noYears.futureValueNominal).toBe(50_000);

    const noGrowth = run({ realGrowth: 0 });
    expect(noGrowth.futureValueToday).toBe(50_000);
    expect(noGrowth.lostGrowthToday).toBe(0);
    expect(noGrowth.trueCostToday).toBeCloseTo(13_845, 6);

    // inflation 0: nominal equals today's money
    const noInflation = run({ inflation: 0 });
    expect(noInflation.futureValueNominal).toBeCloseTo(noInflation.futureValueToday, 6);
    expect(noInflation.trueCostNominal).toBeCloseTo(noInflation.trueCostToday, 6);
  });

  it('TP10: rejects bad input with RangeError', () => {
    const bad: Partial<TwoPotWithdrawalInput>[] = [
      { age: 40.5 },
      { age: -1 },
      { yearsToRetirement: 2.5 },
      { yearsToRetirement: 61 },
      { yearsToRetirement: -1 },
      { taxableIncome: -1 },
      { taxableIncome: Number.NaN },
      { medicalCreditAnnual: -1 },
      { realGrowth: -0.01 },
      { realGrowth: 1.01 },
      { realGrowth: Number.NaN },
      { inflation: -0.01 },
      { inflation: 1.01 },
    ];
    for (const patch of bad) {
      expect(
        () => twoPotWithdrawal({ ...base, ...patch }, tables, rules),
        JSON.stringify(patch),
      ).toThrow(RangeError);
    }
    expect(run({ yearsToRetirement: 60 }).yearsToRetirement).toBe(60);
  });

  it('TP10: does not mutate its inputs, tables or rules', () => {
    const input = deepFreeze({ ...base });
    const frozenTables = deepFreeze(shippedTaxTables2027());
    const frozenRules = deepFreeze({ ...rules });
    expect(() => twoPotWithdrawal(input, frozenTables, frozenRules)).not.toThrow();
    expect(input).toEqual(base);
  });
});
