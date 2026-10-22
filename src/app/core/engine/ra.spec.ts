import taxYear2027 from '../../../assets/data/tax-years/2027.json';
import { makeTaxYear } from '../../testing/tax-data-fixtures';
import { deepFreeze, fixtureTaxTables, shippedTaxTables2027 } from '../../testing/tax-tables';
import { validateTaxYearFile } from '../data/tax-year.validator';
import { payslip } from './payslip';
import {
  MAX_RA_RETIREMENT_AGE,
  raCalculator,
  raHeadroom,
  raProjection,
  raRetirementAges,
  raTaxSaving,
  toRaRules,
} from './ra';
import type { RaInput, RaProjectionInput, RaRules } from './ra';

const tables = shippedTaxTables2027();
const shipped = validateTaxYearFile(taxYear2027, '2027.json');
if (!shipped.ok) throw new Error(`2027.json is invalid: ${shipped.errors.join('; ')}`);
const rules = toRaRules(shipped.value);
const fixtureRules = toRaRules(makeTaxYear(2027));

describe('toRaRules', () => {
  it('reads the two-pot split and earliest age from the shipped file', () => {
    expect(rules).toEqual({
      savingsShare: 0.3333333333333333,
      retirementShare: 0.6666666666666666,
      minimumWithdrawal: 2_000,
      withdrawalsPerTaxYear: 1,
      earliestRetirementAge: 55,
    });
  });

  it('reads the fixture values, not constants', () => {
    expect(fixtureRules).toEqual({
      savingsShare: 0.25,
      retirementShare: 0.75,
      minimumWithdrawal: 1_000,
      withdrawalsPerTaxYear: 2,
      earliestRetirementAge: 50,
    });
  });

  it('caps retirement at 80', () => {
    expect(MAX_RA_RETIREMENT_AGE).toBe(80);
  });
});

describe('raHeadroom (4a)', () => {
  it('H1: gross 30 000 and nothing else', () => {
    // remuneration 360 000; limit 0.275 × 360 000 = 99 000; headroom 99 000; monthly 8 250
    const result = raHeadroom({ grossMonthly: 30_000, age: 35 }, tables);
    expect(result.limit).toBeCloseTo(99_000, 2);
    expect(result.existingContributions).toBe(0);
    expect(result.existingDeductible).toBe(0);
    expect(result.existingExcess).toBe(0);
    expect(result.headroom).toBeCloseTo(99_000, 2);
    expect(result.headroomMonthly).toBeCloseTo(8_250, 2);
  });

  it('H2: existing contributions use up the limit first, and match the payslip', () => {
    // remuneration (30 000 + 2 000) × 12 = 384 000; limit 0.275 × 384 000 = 105 600
    // existing (3 000 + 2 000) × 12 = 60 000; headroom 45 600; monthly 3 800
    const salary = {
      grossMonthly: 30_000,
      age: 35,
      employeeRetirementMonthly: 3_000,
      employerRetirementMonthly: 2_000,
    };
    const result = raHeadroom(salary, tables);
    expect(result.limit).toBeCloseTo(105_600, 2);
    expect(result.existingContributions).toBeCloseTo(60_000, 2);
    expect(result.existingDeductible).toBeCloseTo(60_000, 2);
    expect(result.headroom).toBeCloseTo(45_600, 2);
    expect(result.headroomMonthly).toBeCloseTo(3_800, 2);

    const line = payslip(
      {
        gross: 30_000,
        period: 'monthly',
        age: 35,
        employeeRetirementMonthly: 3_000,
        employerRetirementMonthly: 2_000,
      },
      tables,
    ).annual.retirement;
    expect(result.existingDeductible).toBeCloseTo(line.deductible, 6);
    expect(result.existingExcess).toBeCloseTo(line.excess, 6);
    expect(result.headroom).toBeCloseTo(line.headroom, 6);
  });

  it('H3: the rand cap applies', () => {
    // 0.275 × 2 400 000 = 660 000 > 430 000, so limit 430 000; existing 360 000; headroom 70 000
    const result = raHeadroom(
      { grossMonthly: 200_000, age: 35, employeeRetirementMonthly: 30_000 },
      tables,
    );
    expect(result.limit).toBeCloseTo(430_000, 2);
    expect(result.headroom).toBeCloseTo(70_000, 2);
    expect(result.headroomMonthly).toBeCloseTo(5_833.33, 2);
  });
});

describe('raTaxSaving (4b)', () => {
  it('S1: the default example saves the marginal rate, no crossing', () => {
    // without: taxable 360 000, tax 44 118 + 0.26 × 114 900 = 73 992, PAYE 73 992 − 17 820 = 56 172
    // with: taxable 336 000, tax 44 118 + 0.26 × 90 900 = 67 752, PAYE 49 932
    const result = raTaxSaving({ grossMonthly: 30_000, age: 35 }, 2_000, tables);
    expect(result.payeWithout).toBeCloseTo(56_172, 2);
    expect(result.payeWith).toBeCloseTo(49_932, 2);
    expect(result.saving).toBeCloseTo(6_240, 2);
    expect(result.savingMonthly).toBeCloseTo(520, 2);
    expect(result.contribution).toBeCloseTo(24_000, 2);
    expect(result.deductible).toBeCloseTo(24_000, 2);
    expect(result.marginalRate).toBe(0.26);
    expect(result.marginalRateAfter).toBe(0.26);
    expect(result.approxSaving).toBeCloseTo(6_240, 2);
    expect(result.approxDifference).toBeCloseTo(0, 2);
    expect(result.crossesBracket).toBe(false);
    expect(result.netCost).toBeCloseTo(17_760, 2);
    expect(result.netCostMonthly).toBeCloseTo(1_480, 2);
    expect(result.remainingHeadroom).toBeCloseTo(75_000, 2);
    expect(result.carriedForward).toBeCloseTo(0, 2);
  });

  it('S2: crossing a bracket saves less than the marginal-rate estimate', () => {
    // without: 420 000, tax 79 998 + 0.31 × 36 900 = 91 437, PAYE 73 617, marginal 31%
    // with: 360 000, tax 73 992, PAYE 56 172, marginal 26%
    // saving 0.31 × 36 900 + 0.26 × 23 100 = 11 439 + 6 006 = 17 445
    // approx 60 000 × 0.31 = 18 600; difference 1 155 = 0.05 × 23 100
    const result = raTaxSaving({ grossMonthly: 35_000, age: 35 }, 5_000, tables);
    expect(result.payeWithout).toBeCloseTo(73_617, 2);
    expect(result.payeWith).toBeCloseTo(56_172, 2);
    expect(result.saving).toBeCloseTo(17_445, 2);
    expect(result.savingMonthly).toBeCloseTo(1_453.75, 2);
    expect(result.marginalRate).toBe(0.31);
    expect(result.marginalRateAfter).toBe(0.26);
    expect(result.approxSaving).toBeCloseTo(18_600, 2);
    expect(result.approxDifference).toBeCloseTo(1_155, 2);
    expect(result.crossesBracket).toBe(true);
    expect(result.carriedForward).toBeCloseTo(0, 2);
  });

  it('S3: the rebate floor stops the saving at the tax actually due', () => {
    // without: 108 000 × 0.18 = 19 440, PAYE 1 620; with: 96 000 × 0.18 = 17 280 < 17 820, PAYE 0
    // approx 12 000 × 0.18 = 2 160; difference 540
    const result = raTaxSaving({ grossMonthly: 9_000, age: 35 }, 1_000, tables);
    expect(result.payeWithout).toBeCloseTo(1_620, 2);
    expect(result.payeWith).toBeCloseTo(0, 2);
    expect(result.saving).toBeCloseTo(1_620, 2);
    expect(result.marginalRate).toBe(0.18);
    expect(result.marginalRateAfter).toBe(0);
    expect(result.approxSaving).toBeCloseTo(2_160, 2);
    expect(result.approxDifference).toBeCloseTo(540, 2);
    expect(result.crossesBracket).toBe(true);
  });

  it('S4: no tax to save below the threshold', () => {
    // 96 000 × 0.18 = 17 280 < 17 820, so PAYE is 0 with and without
    const result = raTaxSaving({ grossMonthly: 8_000, age: 35 }, 1_000, tables);
    expect(result.saving).toBe(0);
    expect(result.approxSaving).toBe(0);
    expect(result.marginalRate).toBe(0);
    expect(result.crossesBracket).toBe(false);
    expect(result.netCost).toBeCloseTo(12_000, 2);
  });

  it('S5: contributions over the 27.5% limit are carried forward', () => {
    // contribution 120 000, limit 99 000: deductible 99 000, carried forward 21 000, headroom 0
    // with: taxable 261 000, tax 44 118 + 0.26 × 15 900 = 48 252, PAYE 30 432
    // saving 56 172 − 30 432 = 25 740 = 99 000 × 0.26
    const result = raTaxSaving({ grossMonthly: 30_000, age: 35 }, 10_000, tables);
    expect(result.contribution).toBeCloseTo(120_000, 2);
    expect(result.deductible).toBeCloseTo(99_000, 2);
    expect(result.carriedForward).toBeCloseTo(21_000, 2);
    expect(result.remainingHeadroom).toBeCloseTo(0, 2);
    expect(result.payeWith).toBeCloseTo(30_432, 2);
    expect(result.saving).toBeCloseTo(25_740, 2);
    expect(result.approxSaving).toBeCloseTo(25_740, 2);
    expect(result.crossesBracket).toBe(false);
  });

  it('S6: exactly at the 27.5% limit carries nothing forward', () => {
    // limit 0.275 × 480 000 = 132 000 = 11 000 × 12
    // without: tax 79 998 + 0.31 × 96 900 = 110 037, PAYE 92 217
    // with: 348 000, tax 44 118 + 0.26 × 102 900 = 70 872, PAYE 53 052; saving 39 165
    // approx 132 000 × 0.31 = 40 920; difference 1 755 = 0.05 × 35 100
    const result = raTaxSaving({ grossMonthly: 40_000, age: 35 }, 11_000, tables);
    expect(result.deductible).toBeCloseTo(132_000, 2);
    expect(result.carriedForward).toBeCloseTo(0, 2);
    expect(result.remainingHeadroom).toBeCloseTo(0, 2);
    expect(result.payeWithout).toBeCloseTo(92_217, 2);
    expect(result.payeWith).toBeCloseTo(53_052, 2);
    expect(result.saving).toBeCloseTo(39_165, 2);
    expect(result.approxSaving).toBeCloseTo(40_920, 2);
    expect(result.approxDifference).toBeCloseTo(1_755, 2);
    expect(result.crossesBracket).toBe(true);
  });

  it('S7: one rand a month over the limit carries R12 forward and saves the same', () => {
    const result = raTaxSaving({ grossMonthly: 40_000, age: 35 }, 11_001, tables);
    expect(result.contribution).toBeCloseTo(132_012, 2);
    expect(result.deductible).toBeCloseTo(132_000, 2);
    expect(result.carriedForward).toBeCloseTo(12, 2);
    expect(result.saving).toBeCloseTo(39_165, 2);
  });

  it('S8: the rand cap limits the deductible part of the extra contribution', () => {
    // existing 360 000, extra 120 000, total 480 000 > cap 430 000: deductible part 70 000,
    // carried forward 50 000. without: taxable 2 040 000, tax 666 339 + 0.45 × 161 400 = 738 969;
    // with: 1 970 000, tax 666 339 + 0.45 × 91 400 = 707 469; saving 31 500 = 70 000 × 0.45
    const result = raTaxSaving(
      { grossMonthly: 200_000, age: 35, employeeRetirementMonthly: 30_000 },
      10_000,
      tables,
    );
    expect(result.deductible).toBeCloseTo(70_000, 2);
    expect(result.carriedForward).toBeCloseTo(50_000, 2);
    expect(result.remainingHeadroom).toBeCloseTo(0, 2);
    expect(result.saving).toBeCloseTo(31_500, 2);
    expect(result.savingMonthly).toBeCloseTo(2_625, 2);
    expect(result.approxSaving).toBeCloseTo(31_500, 2);
    expect(result.approxDifference).toBeCloseTo(0, 2);
    expect(result.marginalRate).toBe(0.45);
    expect(result.marginalRateAfter).toBe(0.45);
  });
});

describe('raRetirementAges (4c)', () => {
  it('A1: 35 retiring at 55 is 20 years with no flags', () => {
    expect(raRetirementAges(35, 55, rules)).toEqual({
      requested: 55,
      retirementAge: 55,
      years: 20,
      belowEarliest: false,
      aboveMax: false,
      pastRetirementAge: false,
    });
  });

  it('A2: asking for 50 projects to 55 and flags it', () => {
    const result = raRetirementAges(35, 50, rules);
    expect(result.requested).toBe(50);
    expect(result.retirementAge).toBe(55);
    expect(result.years).toBe(20);
    expect(result.belowEarliest).toBe(true);
  });

  it('A3: asking for 85 projects to 80 and flags it', () => {
    const result = raRetirementAges(35, 85, rules);
    expect(result.retirementAge).toBe(80);
    expect(result.years).toBe(45);
    expect(result.aboveMax).toBe(true);
    expect(result.belowEarliest).toBe(false);
  });

  it('A4: already past the retirement age gives 0 years', () => {
    const result = raRetirementAges(60, 55, rules);
    expect(result.retirementAge).toBe(55);
    expect(result.years).toBe(0);
    expect(result.pastRetirementAge).toBe(true);
  });

  it('A5: the earliest age comes from the data', () => {
    const result = raRetirementAges(35, 50, fixtureRules);
    expect(result.retirementAge).toBe(50);
    expect(result.years).toBe(15);
    expect(result.belowEarliest).toBe(false);
  });
});

// Constant-contribution closed form: FV = P × ((1 + i)^(12n) − 1) / i with i = (1 + R)^(1/12) − 1.
function closedForm(monthly: number, annualReturn: number, years: number): number {
  const i = (1 + annualReturn) ** (1 / 12) - 1;
  return (monthly * ((1 + i) ** (12 * years) - 1)) / i;
}

function projectionInput(patch: Partial<RaProjectionInput>): RaProjectionInput {
  return {
    monthlyContribution: 0,
    escalation: 0,
    startingBalance: 0,
    annualReturn: 0,
    inflation: 0,
    years: 1,
    ...patch,
  };
}

describe('raProjection (4d)', () => {
  it('P1: one year of R1 000 at 10% is R12 540.54', () => {
    // i = 1.1^(1/12) − 1 = 0.0079741404; FV = 1 000 × 0.1 / 0.0079741404 = 12 540.54
    const result = raProjection(
      projectionInput({ monthlyContribution: 1_000, annualReturn: 0.1 }),
      rules,
    );
    expect(result.monthlyRate).toBeCloseTo(0.0079741404, 9);
    expect(result.final.nominal).toBeCloseTo(12_540.54, 2);
    expect(result.final.contributions).toBeCloseTo(12_000, 2);
    expect(result.final.growth).toBeCloseTo(540.54, 2);
  });

  it('P1: matches the closed form for R2 000 at 9.5% over 20 years', () => {
    // i = 1.095^(1/12) − 1 = 0.0075915343; 1.095^20 = 6.1416121
    // FV = 2 000 × 5.1416121 / 0.0075915343 = 1 354 564.68; contributions 480 000
    const result = raProjection(
      projectionInput({ monthlyContribution: 2_000, annualReturn: 0.095, years: 20 }),
      rules,
    );
    expect(result.final.nominal).toBeCloseTo(closedForm(2_000, 0.095, 20), 4);
    expect(result.final.nominal).toBeCloseTo(1_354_564.68, 2);
    expect(result.final.contributions).toBeCloseTo(480_000, 2);
  });

  it('P2: two years is 26 335.13 and year 1 is on the series', () => {
    // (1 + i)^24 = 1.21; FV = 1 000 × 0.21 / 0.0079741404 = 26 335.13
    const result = raProjection(
      projectionInput({ monthlyContribution: 1_000, annualReturn: 0.1, years: 2 }),
      rules,
    );
    expect(result.final.nominal).toBeCloseTo(26_335.13, 2);
    expect(result.final.contributions).toBeCloseTo(24_000, 2);
    expect(result.final.growth).toBeCloseTo(2_335.13, 2);
    expect(result.series).toHaveLength(3);
    expect(result.series[1]?.nominal).toBeCloseTo(12_540.54, 2);
    expect(result.series.map((row) => row.year)).toEqual([0, 1, 2]);
  });

  it('P3: zero return adds contributions to the balance', () => {
    // 5 000 + 24 × 1 000 = 29 000
    const result = raProjection(
      projectionInput({ monthlyContribution: 1_000, startingBalance: 5_000, years: 2 }),
      rules,
    );
    expect(result.monthlyRate).toBe(0);
    expect(result.final.nominal).toBeCloseTo(29_000, 2);
    expect(result.final.growth).toBeCloseTo(0, 2);
    expect(result.final.real).toBeCloseTo(29_000, 2);
  });

  it('P4: zero years is just the start row', () => {
    const result = raProjection(
      projectionInput({
        monthlyContribution: 1_000,
        startingBalance: 50_000,
        annualReturn: 0.1,
        inflation: 0.05,
        years: 0,
      }),
      rules,
    );
    expect(result.series).toHaveLength(1);
    expect(result.series[0]).toEqual({
      year: 0,
      contributions: 0,
      growth: 0,
      nominal: 50_000,
      real: 50_000,
    });
    expect(result.final).toBe(result.series[0]);
    expect(result.twoPot.vestedPot).toBe(50_000);
    expect(result.twoPot.savingsPot).toBe(0);
    expect(result.twoPot.retirementPot).toBe(0);
  });

  it('P5: a lump sum grows by exactly the annual return', () => {
    // 100 000 × 1.1² = 121 000; year 1 = 110 000
    const result = raProjection(
      projectionInput({ startingBalance: 100_000, annualReturn: 0.1, years: 2 }),
      rules,
    );
    expect(result.final.nominal).toBeCloseTo(121_000, 2);
    expect(result.series[1]?.nominal).toBeCloseTo(110_000, 2);
  });

  it('P6: real values deflate by inflation each year', () => {
    // year 1: 110 000 / 1.05 = 104 761.90; year 2: 121 000 / 1.1025 = 109 750.57
    const result = raProjection(
      projectionInput({
        startingBalance: 100_000,
        annualReturn: 0.1,
        inflation: 0.05,
        years: 2,
      }),
      rules,
    );
    expect(result.series[1]?.real).toBeCloseTo(104_761.9, 2);
    expect(result.final.real).toBeCloseTo(109_750.57, 2);
  });

  it('P7: contributions rise once a year', () => {
    // year 1: 12 × 1 000 = 12 000; year 2: 12 × 1 100 = 13 200; total 25 200
    const result = raProjection(
      projectionInput({ monthlyContribution: 1_000, escalation: 0.1, years: 2 }),
      rules,
    );
    expect(result.series[1]?.contributions).toBeCloseTo(12_000, 2);
    expect(result.final.contributions).toBeCloseTo(25_200, 2);
    expect(result.final.nominal).toBeCloseTo(25_200, 2);
  });

  it('P8: two-pot split with no growth', () => {
    // contributions 36 000: savings 12 000, retirement 24 000, vested 10 000
    const result = raProjection(
      projectionInput({ monthlyContribution: 3_000, startingBalance: 10_000 }),
      rules,
    );
    expect(result.twoPot.savingsContributions).toBeCloseTo(12_000, 2);
    expect(result.twoPot.retirementContributions).toBeCloseTo(24_000, 2);
    expect(result.twoPot.savingsContributions + result.twoPot.retirementContributions).toBeCloseTo(
      result.final.contributions,
      6,
    );
    expect(result.twoPot.savingsPot).toBeCloseTo(12_000, 2);
    expect(result.twoPot.retirementPot).toBeCloseTo(24_000, 2);
    expect(result.twoPot.vestedPot).toBeCloseTo(10_000, 2);
    expect(pots(result.twoPot)).toBeCloseTo(46_000, 2);
    expect(pots(result.twoPot)).toBeCloseTo(result.final.nominal, 6);
  });

  it('P9: two-pot split with growth', () => {
    // contribution balance 3 000 × 0.1 / 0.0079741404 = 37 621.61: savings 12 540.54,
    // retirement 25 081.07; vested 10 000 × 1.1 = 11 000; nominal 48 621.61
    const result = raProjection(
      projectionInput({
        monthlyContribution: 3_000,
        startingBalance: 10_000,
        annualReturn: 0.1,
      }),
      rules,
    );
    expect(result.twoPot.savingsPot).toBeCloseTo(12_540.54, 2);
    expect(result.twoPot.retirementPot).toBeCloseTo(25_081.07, 2);
    expect(result.twoPot.vestedPot).toBeCloseTo(11_000, 2);
    expect(result.final.nominal).toBeCloseTo(48_621.61, 2);
    expect(pots(result.twoPot)).toBeCloseTo(result.final.nominal, 6);
  });

  it('P10: fixture shares of 25% and 75%', () => {
    const result = raProjection(projectionInput({ monthlyContribution: 3_000 }), fixtureRules);
    expect(result.twoPot.savingsContributions).toBeCloseTo(9_000, 2);
    expect(result.twoPot.retirementContributions).toBeCloseTo(27_000, 2);
  });
});

function pots(twoPot: { savingsPot: number; retirementPot: number; vestedPot: number }): number {
  return twoPot.savingsPot + twoPot.retirementPot + twoPot.vestedPot;
}

describe('raCalculator (4e)', () => {
  const example: RaInput = {
    salary: { grossMonthly: 30_000, age: 35 },
    contributionMonthly: 2_000,
    escalation: 0.05,
    startingBalance: 0,
    annualReturn: 0.095,
    inflation: 0.045,
    retirementAge: 55,
  };

  it('works out the default example end to end', () => {
    const result = raCalculator(example, tables, rules);
    const { projection } = result;
    // paid in 24 000 × (1.05^20 − 1) / 0.05 = 793 582.90
    // nominal Σ 2 000 × 1.05^k × 12.5139394 × 1.095^(19 − k) = 1 940 113.55
    // real 1 940 113.55 / 1.045^20 = 804 454.23; year 1 25 027.88 nominal, 23 950.12 real
    expect(result.ages.years).toBe(20);
    expect(projection.series).toHaveLength(21);
    expect(projection.final.contributions).toBeCloseTo(793_582.9, 2);
    expect(projection.final.nominal).toBeCloseTo(1_940_113.55, 2);
    expect(projection.final.growth).toBeCloseTo(1_146_530.66, 2);
    expect(projection.final.real).toBeCloseTo(804_454.23, 2);
    expect(projection.series[1]?.nominal).toBeCloseTo(25_027.88, 2);
    expect(projection.series[1]?.real).toBeCloseTo(23_950.12, 2);

    // two-pot: savings 1 940 113.55 / 3 = 646 704.52; retirement 1 293 409.04; vested 0
    expect(projection.twoPot.savingsPot).toBeCloseTo(646_704.52, 2);
    expect(projection.twoPot.retirementPot).toBeCloseTo(1_293_409.04, 2);
    expect(projection.twoPot.vestedPot).toBe(0);
    expect(pots(projection.twoPot)).toBeCloseTo(projection.final.nominal, 6);
    expect(
      projection.twoPot.savingsContributions + projection.twoPot.retirementContributions,
    ).toBeCloseTo(projection.final.contributions, 6);

    // headroom 99 000 a year / 8 250 a month; tax saving 6 240 / 520; cost after tax 1 480 a month
    expect(result.headroom.headroom).toBeCloseTo(99_000, 2);
    expect(result.headroom.headroomMonthly).toBeCloseTo(8_250, 2);
    expect(result.taxSaving.saving).toBeCloseTo(6_240, 2);
    expect(result.taxSaving.savingMonthly).toBeCloseTo(520, 2);
    expect(result.taxSaving.netCostMonthly).toBeCloseTo(1_480, 2);
    expect(result.taxSaving.remainingHeadroom).toBeCloseTo(75_000, 2);
  });

  it('projects to the earliest age when asked for less', () => {
    const result = raCalculator({ ...example, retirementAge: 45 }, tables, rules);
    expect(result.ages.belowEarliest).toBe(true);
    expect(result.projection.series).toHaveLength(21);
  });

  it('does not project when already past the retirement age', () => {
    const result = raCalculator(
      { ...example, salary: { grossMonthly: 30_000, age: 60 }, startingBalance: 10_000 },
      tables,
      rules,
    );
    expect(result.ages.pastRetirementAge).toBe(true);
    expect(result.projection.series).toHaveLength(1);
    expect(result.projection.final.nominal).toBe(10_000);
  });
});

describe('invalid input', () => {
  const salary = { grossMonthly: 30_000, age: 35 };

  it('rejects a negative contribution', () => {
    expect(() => raTaxSaving(salary, -1, tables)).toThrow(RangeError);
    expect(() => raProjection(projectionInput({ monthlyContribution: -1 }), rules)).toThrow(
      RangeError,
    );
  });

  it('rejects a non-finite or out-of-range rate', () => {
    expect(() => raProjection(projectionInput({ annualReturn: NaN }), rules)).toThrow(RangeError);
    expect(() => raProjection(projectionInput({ annualReturn: 1.5 }), rules)).toThrow(RangeError);
    expect(() => raProjection(projectionInput({ escalation: -0.1 }), rules)).toThrow(RangeError);
    expect(() => raProjection(projectionInput({ inflation: Infinity }), rules)).toThrow(RangeError);
  });

  it('rejects fractional or too many years', () => {
    expect(() => raProjection(projectionInput({ years: 1.5 }), rules)).toThrow(RangeError);
    expect(() => raProjection(projectionInput({ years: 101 }), rules)).toThrow(RangeError);
  });

  it('rejects a negative starting balance', () => {
    expect(() => raProjection(projectionInput({ startingBalance: -1 }), rules)).toThrow(RangeError);
  });

  it('rejects bad salary and age figures', () => {
    expect(() => raHeadroom({ grossMonthly: -1, age: 35 }, tables)).toThrow(RangeError);
    expect(() => raTaxSaving({ grossMonthly: 30_000, age: 35.5 }, 1_000, tables)).toThrow(
      RangeError,
    );
    expect(() => raRetirementAges(35, 55.5, rules)).toThrow(RangeError);
    expect(() => raRetirementAges(-1, 55, rules)).toThrow(RangeError);
  });
});

describe('purity', () => {
  it('does not mutate frozen inputs or tables', () => {
    const frozenTables = deepFreeze(fixtureTaxTables());
    const frozenRules: RaRules = deepFreeze({ ...fixtureRules });
    const input: RaInput = deepFreeze({
      salary: deepFreeze({ grossMonthly: 30_000, age: 35, medicalMembers: 2 }),
      contributionMonthly: 2_000,
      escalation: 0.05,
      startingBalance: 1_000,
      annualReturn: 0.095,
      inflation: 0.045,
      retirementAge: 55,
    });
    const first = raCalculator(input, frozenTables, frozenRules);
    const second = raCalculator(input, frozenTables, frozenRules);
    expect(second).toEqual(first);
    expect(frozenTables).toEqual(fixtureTaxTables());
  });
});
