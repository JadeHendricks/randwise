import taxYear2027 from '../../../assets/data/tax-years/2027.json';
import { makeTaxYear } from '../../testing/tax-data-fixtures';
import { deepFreeze, shippedTaxTables2027 } from '../../testing/tax-tables';
import { validateTaxYearFile } from '../data/tax-year.validator';
import { raProjection } from './ra';
import {
  MAX_COMMUTATION_SHARE,
  MAX_RETIRE_HORIZON_AGE,
  RETIRE_HORIZON_AGE,
  annuityIncomeTax,
  capitalAtRetirement,
  commuteOneThird,
  drawdownIssue,
  grossAnnuityFromNet,
  inflateToRetirement,
  livingAnnuityCapital,
  netCostOfContribution,
  requiredAnnualReturn,
  requiredMonthlyContribution,
  retireIssues,
  retirePlan,
  retirementLumpSumTax,
  simulateDrawdown,
  toRetireRules,
} from './retire';
import type { DrawdownInput, RetireInput } from './retire';

const tables = shippedTaxTables2027();
const shipped = validateTaxYearFile(taxYear2027, '2027.json');
if (!shipped.ok) throw new Error(`2027.json is invalid: ${shipped.errors.join('; ')}`);
const rules = toRetireRules(shipped.value);
const fixtureRules = toRetireRules(makeTaxYear(2027));

// 1.045^20, used for today's money throughout.
const INFLATION_FACTOR_20 = 2.4117140248;

describe('retire constants', () => {
  it('uses a horizon of 100 (max 120) and a one-third commutation', () => {
    expect(RETIRE_HORIZON_AGE).toBe(100);
    expect(MAX_RETIRE_HORIZON_AGE).toBe(120);
    expect(MAX_COMMUTATION_SHARE).toBe(1 / 3);
  });
});

describe('G12 toRetireRules', () => {
  it('reads the shipped file', () => {
    expect(rules).toEqual({
      savingsShare: 0.3333333333333333,
      retirementShare: 0.6666666666666666,
      earliestRetirementAge: 55,
      drawdownMin: 0.025,
      drawdownMax: 0.175,
      annuitisationDeMinimis: 360_000,
      lumpSumTable: [
        { above: 0, upTo: 550_000, base: 0, rate: 0 },
        { above: 550_000, upTo: 770_000, base: 0, rate: 0.18 },
        { above: 770_000, upTo: 1_155_000, base: 39_600, rate: 0.27 },
        { above: 1_155_000, upTo: null, base: 143_550, rate: 0.36 },
      ],
    });
  });

  it('reads the fixture values, not constants', () => {
    expect(fixtureRules).toEqual({
      savingsShare: 0.25,
      retirementShare: 0.75,
      earliestRetirementAge: 50,
      drawdownMin: 0.01,
      drawdownMax: 0.2,
      annuitisationDeMinimis: 100_000,
      lumpSumTable: [
        { above: 0, upTo: 100_000, base: 0, rate: 0 },
        { above: 100_000, upTo: null, base: 0, rate: 0.2 },
      ],
    });
  });

  it('copies the lump-sum rows instead of aliasing the file', () => {
    const file = makeTaxYear(2027);
    const copied = toRetireRules(file);
    expect(copied.lumpSumTable[0]).not.toBe(file.retirementLumpSum.value[0]);
    expect(copied.lumpSumTable).not.toBe(file.retirementLumpSum.value);
  });
});

describe('G1 inflateToRetirement', () => {
  it('compounds once a year', () => {
    // 50 000 × 1.05^20 = 50 000 × 2.6532977051 = 132 664.885257
    expect(inflateToRetirement(50_000, 0.05, 20)).toBeCloseTo(132_664.885257, 2);
    // years 0 → unchanged
    expect(inflateToRetirement(50_000, 0.05, 0)).toBe(50_000);
    // 50 000 × 1.045^20 = 50 000 × 2.4117140248 = 120 585.701242
    expect(inflateToRetirement(50_000, 0.045, 20)).toBeCloseTo(120_585.701242, 2);
  });

  it('rejects bad inputs', () => {
    expect(() => inflateToRetirement(-1, 0.05, 20)).toThrowError(RangeError);
    expect(() => inflateToRetirement(50_000, 1.5, 20)).toThrowError(RangeError);
    expect(() => inflateToRetirement(50_000, 0.05, 1.5)).toThrowError(RangeError);
  });
});

describe('G2 annuityIncomeTax', () => {
  it('applies the rebate for the age (T1-T3 figures)', () => {
    // incomeTax(200 000) = 0.18 × 200 000 = 36 000
    // 55: 36 000 − 17 820 = 18 180; 64: still primary only = 18 180
    expect(annuityIncomeTax(200_000, 55, tables)).toBeCloseTo(18_180, 2);
    expect(annuityIncomeTax(200_000, 64, tables)).toBeCloseTo(18_180, 2);
    // 65: 36 000 − (17 820 + 9 765) = 36 000 − 27 585 = 8 415
    expect(annuityIncomeTax(200_000, 65, tables)).toBeCloseTo(8_415, 2);
    // 75: 36 000 − (27 585 + 3 249) = 36 000 − 30 834 = 5 166
    expect(annuityIncomeTax(200_000, 75, tables)).toBeCloseTo(5_166, 2);
  });

  it('takes the s6A credit off after rebates, capped at the tax', () => {
    // 1 member: 376 × 12 = 4 512; 55: 18 180 − 4 512 = 13 668; 65: 8 415 − 4 512 = 3 903
    expect(annuityIncomeTax(200_000, 55, tables, 1)).toBeCloseTo(13_668, 2);
    expect(annuityIncomeTax(200_000, 65, tables, 1)).toBeCloseTo(3_903, 2);
    // 50 000: max(0, 9 000 − 17 820) = 0, and the credit cannot take it below 0
    expect(annuityIncomeTax(50_000, 55, tables)).toBe(0);
    expect(annuityIncomeTax(50_000, 55, tables, 1)).toBe(0);
  });
});

describe('G2 grossAnnuityFromNet', () => {
  // Bracket algebra: in (a, u] with base b, rate r, rebate R, credit C:
  // net = G − (b + r(G − a) − R − C) ⇒ G = (net + b − r·a − R − C) / (1 − r)

  it('returns the net exactly when no tax is due', () => {
    // 0.18 × 90 000 = 16 200 < 17 820 → no tax
    const low = grossAnnuityFromNet(90_000, 55, tables);
    expect(low.grossAnnual).toBe(90_000);
    expect(low.taxAnnual).toBe(0);
    // 0.18 × 99 000 = 17 820 − 17 820 = 0 → no tax, exactly on the threshold
    expect(grossAnnuityFromNet(99_000, 55, tables).grossAnnual).toBe(99_000);
    // 65: 150 000 < threshold 153 250 → no tax
    const older = grossAnnuityFromNet(150_000, 65, tables);
    expect(older.grossAnnual).toBe(150_000);
    expect(older.taxAnnual).toBe(0);
  });

  it('grosses up in the first bracket', () => {
    // 55, net 200 000: (200 000 − 17 820) / 0.82 = 182 180 / 0.82 = 222 170.731707
    const at55 = grossAnnuityFromNet(200_000, 55, tables);
    expect(at55.age).toBe(55);
    expect(at55.grossAnnual).toBeCloseTo(222_170.731707, 2);
    expect(at55.taxAnnual).toBeCloseTo(22_170.731707, 2);
    expect(at55.netAnnual).toBeCloseTo(200_000, 2);
    // 65, net 200 000: (200 000 − 27 585) / 0.82 = 172 415 / 0.82 = 210 262.195122
    const at65 = grossAnnuityFromNet(200_000, 65, tables);
    expect(at65.grossAnnual).toBeCloseTo(210_262.195122, 2);
    expect(at65.taxAnnual).toBeCloseTo(10_262.195122, 2);
    // 75, net 200 000: (200 000 − 30 834) / 0.82 = 169 166 / 0.82 = 206 300
    const at75 = grossAnnuityFromNet(200_000, 75, tables);
    expect(at75.grossAnnual).toBeCloseTo(206_300, 2);
    expect(at75.taxAnnual).toBeCloseTo(6_300, 2);
    // 1 medical member (4 512 a year): (200 000 − 17 820 − 4 512) / 0.82 = 177 668 / 0.82
    expect(grossAnnuityFromNet(200_000, 55, tables, 1).grossAnnual).toBeCloseTo(216_668.292683, 2);
  });

  it('grosses up in higher brackets', () => {
    // 55, net 300 000 (bracket 2): (300 000 + 44 118 − 0.26 × 245 100 − 17 820) / 0.74
    // = (300 000 + 44 118 − 63 726 − 17 820) / 0.74 = 262 572 / 0.74 = 354 827.027027
    const b2 = grossAnnuityFromNet(300_000, 55, tables);
    expect(b2.grossAnnual).toBeCloseTo(354_827.027027, 2);
    expect(b2.taxAnnual).toBeCloseTo(54_827.027027, 2);
    // 65, net 300 000: (300 000 + 44 118 − 63 726 − 27 585) / 0.74 = 252 807 / 0.74
    // (55 vs 65 difference 9 765 / 0.74 = 13 195.945946)
    const b2at65 = grossAnnuityFromNet(300_000, 65, tables);
    expect(b2at65.grossAnnual).toBeCloseTo(341_631.081081, 2);
    expect(b2.grossAnnual - b2at65.grossAnnual).toBeCloseTo(13_195.945946, 2);
    // 55, net 600 000 (bracket 5): (600 000 + 185 215 − 0.39 × 695 800 − 17 820) / 0.61
    // = (600 000 + 185 215 − 271 362 − 17 820) / 0.61 = 496 033 / 0.61 = 813 168.852459
    expect(grossAnnuityFromNet(600_000, 55, tables).grossAnnual).toBeCloseTo(813_168.852459, 2);
  });

  it('grosses up the default goal in the top bracket', () => {
    // net annual 120 585.701242 × 12 = 1 447 028.414902 (bracket 7):
    // (1 447 028.414902 + 666 339 − 0.45 × 1 878 600 − 17 820) / 0.55
    // = (1 447 028.414902 + 666 339 − 845 370 − 17 820) / 0.55 = 1 250 177.414902 / 0.55
    // = 2 273 049.845277; tax 826 021.430375; monthly 189 420.820440 and 68 835.119198
    const income = grossAnnuityFromNet(1_447_028.414902, 55, tables);
    expect(income.grossAnnual).toBeCloseTo(2_273_049.845277, 2);
    expect(income.taxAnnual).toBeCloseTo(826_021.430375, 2);
    expect(income.grossMonthly).toBeCloseTo(189_420.82044, 2);
    expect(income.taxMonthly).toBeCloseTo(68_835.119198, 2);
    expect(income.netMonthly).toBeCloseTo(120_585.701242, 2);
  });

  it('is monotonic and never short of the net', () => {
    for (const age of [55, 65]) {
      let previous = -1;
      for (let net = 0; net <= 3_000_000; net += 50_000) {
        const income = grossAnnuityFromNet(net, age, tables);
        expect(income.grossAnnual).toBeGreaterThan(previous);
        expect(income.grossAnnual - income.taxAnnual).toBeGreaterThanOrEqual(net);
        expect(income.grossAnnual - income.taxAnnual - net).toBeLessThan(0.01);
        previous = income.grossAnnual;
      }
    }
  });

  it('rejects a negative or non-finite target', () => {
    expect(() => grossAnnuityFromNet(-1, 55, tables)).toThrowError(RangeError);
    expect(() => grossAnnuityFromNet(Number.NaN, 55, tables)).toThrowError(RangeError);
    expect(() => grossAnnuityFromNet(Number.POSITIVE_INFINITY, 55, tables)).toThrowError(
      RangeError,
    );
  });
});

describe('G3 retirementLumpSumTax', () => {
  const table = rules.lumpSumTable;

  it('applies the cumulative table', () => {
    expect(retirementLumpSumTax(0, table)).toBe(0);
    expect(retirementLumpSumTax(550_000, table)).toBe(0);
    // 0.18 × 0.01 = 0.0018
    expect(retirementLumpSumTax(550_000.01, table)).toBeCloseTo(0.0018, 6);
    // 0.18 × 50 000 = 9 000
    expect(retirementLumpSumTax(600_000, table)).toBeCloseTo(9_000, 2);
    // 0.18 × 220 000 = 39 600
    expect(retirementLumpSumTax(770_000, table)).toBeCloseTo(39_600, 2);
    // 39 600 + 0.27 × 0.01 = 39 600.0027
    expect(retirementLumpSumTax(770_000.01, table)).toBeCloseTo(39_600.0027, 6);
    // 39 600 + 0.27 × 130 000 = 74 700
    expect(retirementLumpSumTax(900_000, table)).toBeCloseTo(74_700, 2);
    // 39 600 + 0.27 × 385 000 = 143 550
    expect(retirementLumpSumTax(1_155_000, table)).toBeCloseTo(143_550, 2);
    // 143 550 + 0.36 × 0.01 = 143 550.0036
    expect(retirementLumpSumTax(1_155_000.01, table)).toBeCloseTo(143_550.0036, 6);
    // 143 550 + 0.36 × 345 000 = 267 750
    expect(retirementLumpSumTax(1_500_000, table)).toBeCloseTo(267_750, 2);
    // 143 550 + 0.36 × 1 245 000 = 591 750
    expect(retirementLumpSumTax(2_400_000, table)).toBeCloseTo(591_750, 2);
  });

  it('has no jump at a bracket boundary and never falls', () => {
    table.forEach((row, index) => {
      const next = table[index + 1];
      if (row.upTo === null || !next) return;
      const jump =
        retirementLumpSumTax(row.upTo + 0.01, table) - retirementLumpSumTax(row.upTo, table);
      expect(Math.abs(jump)).toBeLessThanOrEqual(0.01 * next.rate + 1e-9);
    });
    let previous = -1;
    for (let lump = 0; lump <= 3_000_000; lump += 10_000) {
      const tax = retirementLumpSumTax(lump, table);
      expect(tax).toBeGreaterThanOrEqual(previous);
      previous = tax;
    }
  });

  it('reads the table it is given', () => {
    // fixture: 0.2 × (150 000 − 100 000) = 10 000
    expect(retirementLumpSumTax(150_000, fixtureRules.lumpSumTable)).toBeCloseTo(10_000, 2);
  });

  it('rejects a negative lump sum', () => {
    expect(() => retirementLumpSumTax(-1, table)).toThrowError(RangeError);
  });
});

describe('G4 livingAnnuityCapital', () => {
  it('divides the gross income by the drawdown rate', () => {
    // 240 000 / 0.05, / 0.04, / 0.025, / 0.175
    expect(livingAnnuityCapital(240_000, 0.05, rules)).toBeCloseTo(4_800_000, 2);
    expect(livingAnnuityCapital(240_000, 0.04, rules)).toBeCloseTo(6_000_000, 2);
    expect(livingAnnuityCapital(240_000, 0.025, rules)).toBeCloseTo(9_600_000, 2);
    expect(livingAnnuityCapital(240_000, 0.175, rules)).toBeCloseTo(1_371_428.571429, 2);
  });
});

describe('G5 drawdownIssue', () => {
  it('checks the shipped 2.5%-17.5% range inclusively', () => {
    expect(drawdownIssue(0.024, rules)).toBe('drawdown-too-low');
    expect(drawdownIssue(0.176, rules)).toBe('drawdown-too-high');
    for (const rate of [0.025, 0.05, 0.175, 2.5 / 100, 17.5 / 100]) {
      expect(drawdownIssue(rate, rules)).toBeNull();
    }
  });

  it('makes livingAnnuityCapital throw outside the range', () => {
    expect(() => livingAnnuityCapital(240_000, 0.024, rules)).toThrowError(RangeError);
    expect(() => livingAnnuityCapital(240_000, 0.176, rules)).toThrowError(RangeError);
    expect(() => drawdownIssue(Number.NaN, rules)).toThrowError(RangeError);
  });

  it('reads the range from the data', () => {
    // fixture 1%-20%
    expect(drawdownIssue(0.015, fixtureRules)).toBeNull();
    expect(drawdownIssue(0.009, fixtureRules)).toBe('drawdown-too-low');
  });
});

describe('G6 lump sum and de minimis', () => {
  it('grosses the annuity capital up by 3/2 and commutes a third', () => {
    // total 4 800 000 × 3/2 = 7 200 000; lump 7 200 000 / 3 = 2 400 000; tax 591 750 (G3)
    const result = capitalAtRetirement(4_800_000, true, rules);
    expect(result.takeLumpSum).toBe(true);
    expect(result.total).toBeCloseTo(7_200_000, 2);
    expect(result.lumpSum.gross).toBeCloseTo(2_400_000, 2);
    expect(result.lumpSum.tax).toBeCloseTo(591_750, 2);
    expect(result.lumpSum.net).toBeCloseTo(1_808_250, 2);
    expect(result.annuityCapital).toBeCloseTo(4_800_000, 2);
    expect(result.wholeMayBeCommuted).toBe(false);
  });

  it('taxes a smaller lump sum in the 27% band', () => {
    // total 1 800 000 × 3/2 = 2 700 000; lump 900 000; tax 39 600 + 0.27 × 130 000 = 74 700
    const result = capitalAtRetirement(1_800_000, true, rules);
    expect(result.total).toBeCloseTo(2_700_000, 2);
    expect(result.lumpSum.gross).toBeCloseTo(900_000, 2);
    expect(result.lumpSum.tax).toBeCloseTo(74_700, 2);
    expect(result.lumpSum.net).toBeCloseTo(825_300, 2);
  });

  it('takes nothing without a lump sum', () => {
    const result = capitalAtRetirement(4_800_000, false, rules);
    expect(result.takeLumpSum).toBe(false);
    expect(result.total).toBe(4_800_000);
    expect(result.lumpSum).toEqual({ gross: 0, tax: 0, net: 0 });
    expect(result.annuityCapital).toBe(4_800_000);
  });

  it('flags a total that does not exceed the de minimis', () => {
    // 200 000 × 3/2 = 300 000 <= 360 000; lump 100 000 untaxed (< 550 000)
    const small = capitalAtRetirement(200_000, true, rules);
    expect(small.total).toBeCloseTo(300_000, 2);
    expect(small.wholeMayBeCommuted).toBe(true);
    expect(small.lumpSum.gross).toBeCloseTo(100_000, 2);
    expect(small.lumpSum.tax).toBe(0);
    // 240 000 × 3/2 = exactly 360 000 → "does not exceed" → true
    expect(capitalAtRetirement(240_000, true, rules).wholeMayBeCommuted).toBe(true);
    expect(commuteOneThird(360_000.01, true, rules).wholeMayBeCommuted).toBe(false);
    expect(commuteOneThird(0, true, rules).wholeMayBeCommuted).toBe(false);
    // the note does not depend on the toggle
    expect(commuteOneThird(360_000, false, rules).wholeMayBeCommuted).toBe(true);
  });

  it('commutes the RA golden balance', () => {
    // 1 940 113.554078 / 3 = 646 704.518026; tax 0.18 × (646 704.518026 − 550 000)
    // = 0.18 × 96 704.518026 = 17 406.813245; annuity 1 940 113.554078 − 646 704.518026
    const result = commuteOneThird(1_940_113.554078, true, rules);
    expect(result.lumpSum.gross).toBeCloseTo(646_704.518026, 2);
    expect(result.lumpSum.tax).toBeCloseTo(17_406.813245, 2);
    expect(result.annuityCapital).toBeCloseTo(1_293_409.036052, 2);
  });

  it('keeps lump + annuity = total', () => {
    for (const total of [0, 1, 360_000, 1_000_000, 7_200_000, 45_460_996.9055]) {
      const result = commuteOneThird(total, true, rules);
      expect(Math.abs(result.lumpSum.gross - total / 3)).toBeLessThan(1e-6);
      expect(Math.abs(total - result.lumpSum.gross - result.annuityCapital)).toBeLessThan(1e-6);
    }
  });
});

describe('G7 solvers', () => {
  const plan = { escalation: 0, startingBalance: 0, annualReturn: 0.1, years: 10 };

  it('solves the monthly contribution', () => {
    // i = 1.1^(1/12) − 1 = 0.0079741404; 1.1^10 = 2.5937424601
    // P = 1 000 000 × i / (1.1^10 − 1) = 5 003.405901
    expect(requiredMonthlyContribution(1_000_000, plan, rules)).toBeCloseTo(5_003.405901, 2);
    // balance 100 000 grows to 259 374.246010; P = 740 625.753990 × i / 1.5937424601
    expect(
      requiredMonthlyContribution(1_000_000, { ...plan, startingBalance: 100_000 }, rules),
    ).toBeCloseTo(3_705.651268, 2);
    // r 0: 1 000 000 / 120 = 8 333.333333
    expect(requiredMonthlyContribution(1_000_000, { ...plan, annualReturn: 0 }, rules)).toBeCloseTo(
      8_333.333333,
      2,
    );
    // the balance alone gets there → 0
    expect(
      requiredMonthlyContribution(500_000, { ...plan, startingBalance: 1_000_000 }, rules),
    ).toBe(0);
  });

  it('round-trips the RA golden', () => {
    // raProjection(2 000, esc 5%, 9.5%, 20 y).final.nominal = 1 940 113.554078
    const target = raProjection(
      {
        monthlyContribution: 2_000,
        escalation: 0.05,
        startingBalance: 0,
        annualReturn: 0.095,
        inflation: 0,
        years: 20,
      },
      rules,
    ).final.nominal;
    expect(target).toBeCloseTo(1_940_113.554078, 2);
    const monthly = requiredMonthlyContribution(
      target,
      { escalation: 0.05, startingBalance: 0, annualReturn: 0.095, years: 20 },
      rules,
    );
    expect(Math.abs(monthly - 2_000)).toBeLessThan(0.01);
  });

  it('solves the annual return', () => {
    // balance 100 000 doubling over 10 y: 2^(1/10) − 1 = 0.0717734625
    expect(
      requiredAnnualReturn(
        200_000,
        { monthlyContribution: 0, escalation: 0, startingBalance: 100_000, years: 10 },
        rules,
      ),
    ).toBeCloseTo(0.0717734625, 6);
    // 1 000 × 1.5937424601 / i = 199 863.856714 at 10% → 0.1
    expect(
      requiredAnnualReturn(
        199_863.856714,
        { monthlyContribution: 1_000, escalation: 0, startingBalance: 0, years: 10 },
        rules,
      ),
    ).toBeCloseTo(0.1, 6);
    // RA golden round trip → 0.095
    expect(
      requiredAnnualReturn(
        1_940_113.554078,
        { monthlyContribution: 2_000, escalation: 0.05, startingBalance: 0, years: 20 },
        rules,
      ),
    ).toBeCloseTo(0.095, 6);
    // 100 000 < 120 000 paid in → 0
    expect(
      requiredAnnualReturn(
        100_000,
        { monthlyContribution: 1_000, escalation: 0, startingBalance: 0, years: 10 },
        rules,
      ),
    ).toBe(0);
  });

  it('rejects zero years, unreachable targets and bad inputs', () => {
    const returnPlan = { monthlyContribution: 1_000, escalation: 0, startingBalance: 0, years: 10 };
    expect(() => requiredMonthlyContribution(1_000, { ...plan, years: 0 }, rules)).toThrowError(
      RangeError,
    );
    expect(() => requiredAnnualReturn(1_000, { ...returnPlan, years: 0 }, rules)).toThrowError(
      RangeError,
    );
    // even 100% a year cannot turn R1 000 a month for 10 years into R1e12
    expect(() => requiredAnnualReturn(1e12, returnPlan, rules)).toThrowError(RangeError);
    // nothing paid in, nothing to grow
    expect(() =>
      requiredAnnualReturn(1, { ...returnPlan, monthlyContribution: 0 }, rules),
    ).toThrowError(RangeError);
    // 1e15 in one year needs far more than R1e9 a month
    expect(() => requiredMonthlyContribution(1e15, { ...plan, years: 1 }, rules)).toThrowError(
      RangeError,
    );
    expect(() => requiredMonthlyContribution(-1, plan, rules)).toThrowError(RangeError);
    expect(() => requiredMonthlyContribution(Number.NaN, plan, rules)).toThrowError(RangeError);
    expect(() => requiredAnnualReturn(-1, returnPlan, rules)).toThrowError(RangeError);
    expect(() => requiredAnnualReturn(Number.NaN, returnPlan, rules)).toThrowError(RangeError);
  });

  it('gives the cost after the tax refund', () => {
    // RA S1: (24 000 − 6 240) / 12 = 1 480
    expect(netCostOfContribution({ grossMonthly: 30_000, age: 35 }, 2_000, tables)).toBeCloseTo(
      1_480,
      2,
    );
  });
});

function retireInput(patch: Partial<RetireInput> = {}): RetireInput {
  return {
    salary: { grossMonthly: 30_000, age: 35 },
    goalNetMonthlyToday: 50_000,
    retirementAge: 55,
    inflation: 0.045,
    returnBeforeRetirement: 0.095,
    returnInRetirement: 0.075,
    drawdownRate: 0.05,
    takeLumpSum: false,
    startingBalance: 0,
    monthlyContribution: 2_000,
    escalation: 0.05,
    ...patch,
  };
}

describe('G8 surplus vs shortfall', () => {
  const flat = {
    inflation: 0,
    returnBeforeRetirement: 0,
    returnInRetirement: 0,
    monthlyContribution: 0,
    escalation: 0,
    goalNetMonthlyToday: 10_000,
  };
  // goal 10 000: net annual 120 000; G = (120 000 − 17 820) / 0.82 = 102 180 / 0.82
  // = 124 609.756098; capital = / 0.05 = 2 492 195.121951

  it('reports a surplus', () => {
    // gap 3 000 000 − 2 492 195.121951 = 507 804.878049; funded 3 000 000 / 2 492 195.121951
    const result = retirePlan(retireInput({ ...flat, startingBalance: 3_000_000 }), tables, rules);
    expect(result.income.grossAnnual).toBeCloseTo(124_609.756098, 2);
    expect(result.capital.total).toBeCloseTo(2_492_195.121951, 2);
    expect(result.current.gapNominal).toBeCloseTo(507_804.878049, 2);
    expect(result.current.gapToday).toBeCloseTo(507_804.878049, 2);
    expect(result.current.fundedPercent).toBeCloseTo(120.375807, 5);
    expect(result.current.ringPercent).toBe(100);
    expect(result.requiredContribution.monthly).toBe(0);
    expect(result.requiredReturn).toEqual({ status: 'already-funded', rate: 0 });
  });

  it('reports a shortfall', () => {
    // gap 2 000 000 − 2 492 195.121951 = −492 195.121951; funded 80.250538
    // required (2 492 195.121951 − 2 000 000) / 240 = 2 050.813008
    // return (2 492 195.121951 / 2 000 000)^(1/20) − 1 = 0.0110615675
    const result = retirePlan(retireInput({ ...flat, startingBalance: 2_000_000 }), tables, rules);
    expect(result.current.gapNominal).toBeCloseTo(-492_195.121951, 2);
    expect(result.current.fundedPercent).toBeCloseTo(80.250538, 5);
    expect(result.current.ringPercent).toBeCloseTo(80.250538, 5);
    expect(result.requiredContribution.monthly).toBeCloseTo(2_050.813008, 2);
    expect(result.requiredReturn.status).toBe('solved');
    expect(result.requiredReturn.rate).toBeCloseTo(0.0110615675, 6);
  });

  it('treats a zero goal as fully funded', () => {
    // capital 0 → required 0, funded 100 by definition, nothing drawn so it never runs out
    const result = retirePlan(
      retireInput({ ...flat, goalNetMonthlyToday: 0, startingBalance: 0 }),
      tables,
      rules,
    );
    expect(result.capital.total).toBe(0);
    expect(result.requiredContribution.monthly).toBe(0);
    expect(result.current.fundedPercent).toBe(100);
    expect(result.current.gapNominal).toBe(0);
    expect(result.drawdown.runsOutAge).toBeNull();
  });

  it('reports an unreachable return when nothing is paid in', () => {
    // contribution 0 and balance 0: final.nominal is 0 at any return < capital > 0
    const result = retirePlan(retireInput({ ...flat, startingBalance: 0 }), tables, rules);
    expect(result.requiredReturn).toEqual({ status: 'unreachable', rate: null });
    // still a required contribution: 2 492 195.121951 / 240 = 10 384.146341
    expect(result.requiredContribution.monthly).toBeCloseTo(10_384.146341, 2);
  });
});

function drawdownInput(patch: Partial<DrawdownInput> = {}): DrawdownInput {
  return {
    capital: 1_000_000,
    firstYearIncome: 50_000,
    inflation: 0,
    annualReturn: 0,
    retirementAge: 55,
    horizonAge: 100,
    maxRate: 0.175,
    yearsBeforeRetirement: 0,
    ...patch,
  };
}

describe('G9 simulateDrawdown', () => {
  it('D1: no inflation, no growth', () => {
    // K_t = 1 000 000 − 50 000 t; K_20 = 0 < 50 000 → runs out at 75
    // 50 000 > 0.175 K_t ⇔ K_t < 285 714.29 ⇔ t >= 15 → 70
    const result = simulateDrawdown(drawdownInput(), tables);
    expect(result.horizonAge).toBe(100);
    expect(result.series).toHaveLength(46);
    expect(result.runsOutAge).toBe(75);
    expect(result.maxRateExceededAge).toBe(70);
    const row75 = result.series[20];
    expect(row75?.age).toBe(75);
    expect(row75?.balance).toBeCloseTo(0, 6);
    expect(row75?.income).toBe(0);
    for (const row of result.series.slice(20)) {
      expect(row.balance).toBe(0);
      expect(row.income).toBe(0);
    }
    expect(result.series[45]?.income).toBe(0);
    // 50 000: 9 000 − 17 820 < 0 → tax 0
    for (const row of result.series.slice(0, 20)) {
      expect(row.income).toBeCloseTo(50_000, 6);
      expect(row.tax).toBe(0);
      expect(row.net).toBeCloseTo(50_000, 6);
    }
  });

  it('D2: 5% inflation, no growth', () => {
    // K_t = 1 000 000 − 50 000 × (1.05^t − 1) / 0.05; runs out at the first t with
    // 1.05^(t+1) > 2 ⇒ t + 1 = 15 → 69
    const result = simulateDrawdown(drawdownInput({ inflation: 0.05 }), tables);
    expect(result.runsOutAge).toBe(69);
    expect(result.series[13]?.balance).toBeCloseTo(114_350.857677, 2);
    const row69 = result.series[14];
    expect(row69?.balance).toBeCloseTo(20_068.400561, 2);
    // due 50 000 × 1.05^14 = 98 996.579972 > balance → pays what is left
    expect(row69?.income).toBeCloseTo(20_068.400561, 2);
    // t = 9: 77 566 / 448 671 = 17.29% no; t = 10: 81 444.73 / 371 105.35 = 21.95% → 65
    expect(result.maxRateExceededAge).toBe(65);
  });

  it('D3: 4.5% inflation, 7.5% growth', () => {
    // K_1 = (1 000 000 − 50 000) × 1.075 = 1 021 250; K_2 = (1 021 250 − 52 250) × 1.075
    // real v = 1.045 / 1.075; t + 1 > ln(1 − 20 × 0.0279069767) / ln v = 28.857 → t = 28 → 83
    // due / balance 15.82% at 77 and 18.27% at 78 → 78
    const result = simulateDrawdown(
      drawdownInput({ inflation: 0.045, annualReturn: 0.075 }),
      tables,
    );
    expect(result.series[1]?.balance).toBeCloseTo(1_021_250, 2);
    expect(result.series[2]?.balance).toBeCloseTo(1_041_675, 2);
    expect(result.runsOutAge).toBe(83);
    expect(result.series[28]?.balance).toBeCloseTo(147_253.46, 1);
    expect(result.maxRateExceededAge).toBe(78);
  });

  it('D4: growth covers the income for good', () => {
    // fixed point 40 000 × 1.05 / 0.05 = 840 000 < 1 000 000 → the balance grows
    const result = simulateDrawdown(
      drawdownInput({ firstYearIncome: 40_000, annualReturn: 0.05 }),
      tables,
    );
    expect(result.runsOutAge).toBeNull();
    expect(result.maxRateExceededAge).toBeNull();
  });

  it('T1: tax falls at 65 as the secondary rebate starts', () => {
    // 4 000 000 / 200 000 = 20 years → runs out at 75
    // 55-64: 36 000 − 17 820 = 18 180, net 181 820; 65-74: 36 000 − 27 585 = 8 415, net 191 585
    const result = simulateDrawdown(
      drawdownInput({ capital: 4_000_000, firstYearIncome: 200_000 }),
      tables,
    );
    expect(result.runsOutAge).toBe(75);
    for (const row of result.series.slice(0, 10)) {
      expect(row.tax).toBeCloseTo(18_180, 2);
      expect(row.net).toBeCloseTo(181_820, 2);
    }
    for (const row of result.series.slice(10, 20)) {
      expect(row.tax).toBeCloseTo(8_415, 2);
      expect(row.net).toBeCloseTo(191_585, 2);
    }
    expect(result.series[20]?.income).toBe(0);
    expect(result.series[20]?.tax).toBe(0);
  });

  it('T2: tax falls again at 75 with the tertiary rebate', () => {
    // 6 000 000 / 200 000 = 30 years → 85; 75-84: 36 000 − 30 834 = 5 166, net 194 834
    const result = simulateDrawdown(
      drawdownInput({ capital: 6_000_000, firstYearIncome: 200_000 }),
      tables,
    );
    expect(result.runsOutAge).toBe(85);
    for (const row of result.series.slice(20, 30)) {
      expect(row.tax).toBeCloseTo(5_166, 2);
      expect(row.net).toBeCloseTo(194_834, 2);
    }
  });

  it('T3: the medical credit applies every year', () => {
    // 18 180 − 4 512 = 13 668; 8 415 − 4 512 = 3 903
    const result = simulateDrawdown(
      drawdownInput({ capital: 4_000_000, firstYearIncome: 200_000, medicalMembers: 1 }),
      tables,
    );
    for (const row of result.series.slice(0, 10)) expect(row.tax).toBeCloseTo(13_668, 2);
    for (const row of result.series.slice(10, 20)) expect(row.tax).toBeCloseTo(3_903, 2);
  });

  it("shows the balance in today's money", () => {
    // 1 000 000 / 1.045^20 = 1 000 000 / 2.4117140248 = 414 642.859685
    const result = simulateDrawdown(
      drawdownInput({ inflation: 0.045, yearsBeforeRetirement: 20 }),
      tables,
    );
    expect(result.series[0]?.real).toBeCloseTo(414_642.859685, 2);
  });

  it('defaults the horizon to 100', () => {
    const result = simulateDrawdown(
      {
        capital: 1_000_000,
        firstYearIncome: 50_000,
        inflation: 0,
        annualReturn: 0,
        retirementAge: 55,
        maxRate: 0.175,
        yearsBeforeRetirement: 0,
      },
      tables,
    );
    expect(result.horizonAge).toBe(100);
    expect(result.series).toHaveLength(46);
  });

  it('rejects bad inputs', () => {
    expect(() => simulateDrawdown(drawdownInput({ horizonAge: 55 }), tables)).toThrowError(
      RangeError,
    );
    expect(() => simulateDrawdown(drawdownInput({ horizonAge: 121 }), tables)).toThrowError(
      RangeError,
    );
    expect(() => simulateDrawdown(drawdownInput({ capital: -1 }), tables)).toThrowError(RangeError);
    expect(() => simulateDrawdown(drawdownInput({ inflation: 2 }), tables)).toThrowError(
      RangeError,
    );
  });
});

describe('G10 retirePlan default', () => {
  const result = retirePlan(retireInput(), tables, rules);

  it('inflates the goal and grosses it up', () => {
    // 20 years; 1.045^20 = 2.4117140248; 50 000 × that = 120 585.701242; × 12
    expect(result.currentAge).toBe(35);
    expect(result.retirementAge).toBe(55);
    expect(result.years).toBe(20);
    expect(result.inflationFactor).toBeCloseTo(INFLATION_FACTOR_20, 9);
    expect(result.goal.todayMonthly).toBe(50_000);
    expect(result.goal.nominalMonthly).toBeCloseTo(120_585.701242, 2);
    expect(result.goal.nominalAnnual).toBeCloseTo(1_447_028.414902, 2);
    // G2 default: 2 273 049.845277 a year; 189 420.820440 and 68 835.119198 a month
    expect(result.income.grossAnnual).toBeCloseTo(2_273_049.845277, 2);
    expect(result.income.grossMonthly).toBeCloseTo(189_420.82044, 2);
    expect(result.income.taxMonthly).toBeCloseTo(68_835.119198, 2);
    expect(result.income.netMonthly).toBeCloseTo(120_585.701242, 2);
  });

  it('works out the capital and the required contribution', () => {
    // 2 273 049.845277 / 0.05 = 45 460 996.9055; / 2.4117140248 = 18 850 077.7613
    expect(result.capital.total).toBeCloseTo(45_460_996.9055, 2);
    expect(result.capital.annuityCapital).toBeCloseTo(45_460_996.9055, 2);
    expect(result.capitalToday).toBeCloseTo(18_850_077.7613, 2);
    // F = s × (1.095^20 − 1.05^20) / 0.045, s = 0.095 / i₉.₅ = 12.5139393914 → 970.056777
    // 45 460 996.9055 / 970.056777 = 46 864.264013
    expect(Math.abs(result.requiredContribution.monthly - 46_864.264013)).toBeLessThan(0.01);
    // limit 99 000 binds (RA S5): saving 25 740 a year = 2 145 a month
    expect(result.requiredContribution.taxSaving.saving).toBeCloseTo(25_740, 2);
    expect(Math.abs(result.requiredContribution.netCostMonthly - 44_719.264013)).toBeLessThan(0.01);
    // plan.final.nominal reaches the capital and overshoots by under R0.05
    expect(result.plan.final.nominal).toBeGreaterThanOrEqual(result.capital.total);
    expect(result.plan.final.nominal - result.capital.total).toBeLessThan(0.05);
  });

  it('compares the current contribution', () => {
    // 2 000 × F = 1 940 113.554078; real / 2.4117140248 = 804 454.232176
    expect(result.current.projection.final.nominal).toBeCloseTo(1_940_113.554078, 2);
    expect(result.current.projection.final.real).toBeCloseTo(804_454.232176, 2);
    // gap 1 940 113.554078 − 45 460 996.9055 = −43 520 883.3522; today −18 045 623.5292
    expect(result.current.gapNominal).toBeCloseTo(-43_520_883.3522, 2);
    expect(result.current.gapToday).toBeCloseTo(-18_045_623.5292, 2);
    // 1 940 113.554078 / 45 460 996.9055 × 100 = 4.267644
    expect(result.current.fundedPercent).toBeCloseTo(4.267644, 5);
    expect(result.current.ringPercent).toBeCloseTo(4.267644, 5);
    // RA S1: 1 480
    expect(result.current.netCostMonthly).toBeCloseTo(1_480, 2);
    expect(result.current.taxSaving.saving).toBeCloseTo(6_240, 2);
    // the projection itself is commuted (no lump sum here): all of it is annuity capital
    expect(result.current.capital.annuityCapital).toBeCloseTo(1_940_113.554078, 2);
  });

  it('solves the required return', () => {
    // bisection on raProjection(2 000, 5%, r, 20 y) = 45 460 996.9055 → 0.367263
    expect(result.requiredReturn.status).toBe('solved');
    expect(result.requiredReturn.rate).toBeCloseTo(0.367263, 5);
  });

  it('simulates both retirement phases', () => {
    // first-year income is 5% of capital, scale-free → as D3: 83 and 78
    expect(result.drawdown.runsOutAge).toBe(83);
    expect(result.drawdown.maxRateExceededAge).toBe(78);
    const first = result.drawdown.series[0];
    expect(first?.income).toBeCloseTo(2_273_049.845277, 2);
    expect(Math.abs((first?.net ?? 0) - 1_447_028.414902)).toBeLessThan(0.01);
    const row65 = result.drawdown.series[10];
    expect(row65?.age).toBe(65);
    const income65 = row65?.income ?? 0;
    expect(row65?.tax).toBeCloseTo(annuityIncomeTax(income65, 65, tables), 6);
    // the secondary rebate, income far above the threshold
    expect(row65?.tax).toBeCloseTo(annuityIncomeTax(income65, 64, tables) - 9_765, 6);
    // today's money starts after 20 years: capital / 2.4117140248
    expect(first?.real).toBeCloseTo(18_850_077.7613, 2);

    // current: 1 940 113.554078 < 2 273 049.845277 → runs out in the first year
    // tax 666 339 + 0.45 × (1 940 113.554078 − 1 878 600) − 17 820 = 676 200.099335
    expect(result.current.drawdown.runsOutAge).toBe(55);
    expect(result.current.drawdown.series[0]?.income).toBeCloseTo(1_940_113.554078, 2);
    expect(result.current.drawdown.series[0]?.tax).toBeCloseTo(676_200.099335, 2);
  });

  it('adds the lump sum on top', () => {
    // total 45 460 996.9055 × 3/2 = 68 191 495.3594; lump / 3 = 22 730 498.4531
    // tax 143 550 + 0.36 × (22 730 498.4531 − 1 155 000) = 7 910 729.4431; net 14 819 769.0100
    // today 68 191 495.3594 / 2.4117140248 = 28 275 116.6420; required / F = 70 296.396019
    // funded 1 940 113.554078 / 68 191 495.3594 = 2.845096%; gap today −27 470 662.4098
    const lump = retirePlan(retireInput({ takeLumpSum: true }), tables, rules);
    expect(lump.capital.total).toBeCloseTo(68_191_495.3594, 2);
    expect(lump.capital.lumpSum.gross).toBeCloseTo(22_730_498.4531, 2);
    expect(lump.capital.lumpSum.tax).toBeCloseTo(7_910_729.4431, 2);
    expect(lump.capital.lumpSum.net).toBeCloseTo(14_819_769.01, 2);
    expect(lump.capital.annuityCapital).toBeCloseTo(45_460_996.9055, 2);
    expect(lump.capitalToday).toBeCloseTo(28_275_116.642, 2);
    expect(Math.abs(lump.requiredContribution.monthly - 70_296.396019)).toBeLessThan(0.01);
    expect(lump.current.fundedPercent).toBeCloseTo(2.845096, 5);
    expect(lump.current.gapToday).toBeCloseTo(-27_470_662.4098, 2);
    // the current projection is commuted too (G6)
    expect(lump.current.capital.lumpSum.gross).toBeCloseTo(646_704.518026, 2);
  });

  it('handles a goal in bracket 5', () => {
    // 20 000 × 2.4117140248 = 48 234.280497; × 12 = 578 811.365964
    // (578 811.365964 + 185 215 − 271 362 − 17 820) / 0.61 = 778 433.386821
    // capital / 0.05 = 15 568 667.7364; required / F = 16 049.233515
    const smaller = retirePlan(retireInput({ goalNetMonthlyToday: 20_000 }), tables, rules);
    expect(smaller.goal.nominalMonthly).toBeCloseTo(48_234.280497, 2);
    expect(smaller.income.grossAnnual).toBeCloseTo(778_433.386821, 2);
    expect(smaller.capital.total).toBeCloseTo(15_568_667.7364, 2);
    expect(Math.abs(smaller.requiredContribution.monthly - 16_049.233515)).toBeLessThan(0.01);
  });
});

describe('G11 retireIssues and boundary errors', () => {
  it('rejects a retirement age before the earliest', () => {
    const input = retireInput({ retirementAge: 54 });
    expect(retireIssues(input, rules)).toEqual(['retirement-age-too-early']);
    expect(() => retirePlan(input, tables, rules)).toThrowError(RangeError);
  });

  it('accepts 55 and 80 but not 81', () => {
    expect(retireIssues(retireInput({ retirementAge: 55 }), rules)).toEqual([]);
    expect(retireIssues(retireInput({ retirementAge: 80 }), rules)).toEqual([]);
    expect(() => retirePlan(retireInput({ retirementAge: 80 }), tables, rules)).not.toThrow();
    expect(retireIssues(retireInput({ retirementAge: 81 }), rules)).toEqual([
      'retirement-age-too-late',
    ]);
  });

  it('rejects being at the retirement age already', () => {
    const input = retireInput({ salary: { grossMonthly: 30_000, age: 55 } });
    expect(retireIssues(input, rules)).toEqual(['already-at-retirement-age']);
    expect(() => retirePlan(input, tables, rules)).toThrowError(RangeError);
  });

  it('reports the drawdown issue', () => {
    expect(retireIssues(retireInput({ drawdownRate: 0.024 }), rules)).toEqual(['drawdown-too-low']);
    expect(retireIssues(retireInput({ drawdownRate: 0.176 }), rules)).toEqual([
      'drawdown-too-high',
    ]);
  });

  it('lists every issue in order', () => {
    expect(retireIssues(retireInput({ retirementAge: 54, drawdownRate: 0.2 }), rules)).toEqual([
      'retirement-age-too-early',
      'drawdown-too-high',
    ]);
  });

  it('reads the earliest age from the data', () => {
    // fixture earliest 50
    expect(retireIssues(retireInput({ retirementAge: 52 }), fixtureRules)).toEqual([]);
  });
});

describe('purity', () => {
  it('does not mutate its inputs and repeats exactly', () => {
    const input = deepFreeze(retireInput({ takeLumpSum: true }));
    const frozenTables = deepFreeze(shippedTaxTables2027());
    const frozenRules = deepFreeze(toRetireRules(shipped.value));
    const first = retirePlan(input, frozenTables, frozenRules);
    const second = retirePlan(input, frozenTables, frozenRules);
    expect(second).toEqual(first);

    const drawdown = deepFreeze(drawdownInput({ inflation: 0.045, annualReturn: 0.075 }));
    expect(simulateDrawdown(drawdown, frozenTables)).toEqual(
      simulateDrawdown(drawdown, frozenTables),
    );
  });
});
