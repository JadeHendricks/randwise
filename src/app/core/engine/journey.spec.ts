import taxYear2027 from '../../../assets/data/tax-years/2027.json';
import { makeTaxYear } from '../../testing/tax-data-fixtures';
import { deepFreeze, shippedTaxTables2027 } from '../../testing/tax-tables';
import { validateTaxYearFile } from '../data/tax-year.validator';
import { journey, toJourneyRules } from './journey';
import type { JourneyInput, JourneyMilestone } from './journey';
import { raProjection } from './ra';

const tables = shippedTaxTables2027();
const shipped = validateTaxYearFile(taxYear2027, '2027.json');
if (!shipped.ok) throw new Error(`2027.json is invalid: ${shipped.errors.join('; ')}`);
const rules = toJourneyRules(shipped.value);

/**
 * F(R) = R / i with i = (1 + R)^(1/12) − 1: the 12-month end-of-month annuity factor, because
 * (1 + i)^12 = 1 + R. For R = 12%: i = 0.0094887929, F = 12.6464979084.
 */
const F12 = 12.6464979084;

/** Shipped rules, earliest RA age 55; everything off so each case switches on only what it tests. */
const base: JourneyInput = {
  salary: { grossMonthly: 30_000, age: 52 },
  retirementAge: 55,
  incomeEscalation: 0,
  contributionMonthly: 0,
  escalation: 0,
  startingBalance: 0,
  tfsaBalance: 0,
  tfsaLifetimeUsed: 0,
  tfsaTopUpMonthly: 0,
  raReturn: 0,
  tfsaReturn: 0,
  inflation: 0,
  refundMode: 'refund',
  allowOverContribution: false,
};

/** J1: age 52 to 55, gross 30 000 +10% a year, RA 2 000 +10% a year, top-up 1 000. */
const j1: JourneyInput = {
  ...base,
  incomeEscalation: 0.1,
  contributionMonthly: 2_000,
  escalation: 0.1,
  tfsaTopUpMonthly: 1_000,
};

function kinds(milestones: readonly JourneyMilestone[]): string[] {
  return milestones.map((m) => `${m.kind}@${m.year}/${m.age}`);
}

describe('toJourneyRules', () => {
  it('reads the RA and TFSA rules from the shipped file', () => {
    expect(rules).toEqual({
      savingsShare: 0.3333333333333333,
      retirementShare: 0.6666666666666666,
      earliestRetirementAge: 55,
      annualLimit: 46_000,
      lifetimeLimit: 500_000,
      penaltyRate: 0.4,
    });
  });

  it('reads the fixture values, not constants', () => {
    expect(toJourneyRules(makeTaxYear(2027))).toEqual({
      savingsShare: 0.25,
      retirementShare: 0.75,
      earliestRetirementAge: 50,
      annualLimit: 10_000,
      lifetimeLimit: 100_000,
      penaltyRate: 0.4,
    });
  });
});

describe('journey', () => {
  describe('J1: three years by hand', () => {
    it('works out each year with income and contribution escalation', () => {
      const result = journey(j1, tables, rules);
      expect(result.ages.years).toBe(3);
      const [y1, y2, y3] = result.years;

      // Y1: gross 360 000; RA 24 000; saving 56 172 − 49 932 = 6 240 (ra.spec S1)
      expect(y1?.year).toBe(1);
      expect(y1?.age).toBe(52);
      expect(y1?.grossMonthly).toBeCloseTo(30_000, 6);
      expect(y1?.grossAnnual).toBeCloseTo(360_000, 6);
      expect(y1?.raContribution).toBeCloseTo(24_000, 6);
      expect(y1?.raDeductible).toBeCloseTo(24_000, 6);
      expect(y1?.raNonDeductible).toBeCloseTo(0, 6);
      expect(y1?.taxSaving).toBeCloseTo(6_240, 6);

      // Y2: gross 33 000 → 396 000; RA 2 200 → 26 400.
      // Without: 79 998 + 0.31 × 12 900 = 83 997 → PAYE 66 177.
      // With: taxable 369 600 → 44 118 + 0.26 × 124 500 = 76 488 → PAYE 58 668.
      // Saving 7 509 (= 0.31 × 12 900 + 0.26 × 13 500, crosses into the 26% bracket).
      expect(y2?.age).toBe(53);
      expect(y2?.grossAnnual).toBeCloseTo(396_000, 6);
      expect(y2?.raContribution).toBeCloseTo(26_400, 6);
      expect(y2?.taxSaving).toBeCloseTo(7_509, 6);

      // Y3: gross 36 300 → 435 600; RA 2 420 → 29 040.
      // Without: 79 998 + 0.31 × 52 500 = 96 273 → 78 453.
      // With: 406 560 → 79 998 + 0.31 × 23 460 = 87 270.6 → 69 450.6. Saving 9 002.4.
      expect(y3?.age).toBe(54);
      expect(y3?.grossAnnual).toBeCloseTo(435_600, 6);
      expect(y3?.raContribution).toBeCloseTo(29_040, 6);
      expect(y3?.taxSaving).toBeCloseTo(9_002.4, 6);

      // TFSA in: 12 000 + saving each year, all under 46 000
      expect(y1?.tfsaTopUp).toBeCloseTo(12_000, 6);
      expect(y1?.tfsaContribution).toBeCloseTo(18_240, 6);
      expect(y2?.tfsaContribution).toBeCloseTo(19_509, 6);
      expect(y3?.tfsaContribution).toBeCloseTo(21_002.4, 6);
      expect(y3?.tfsaExcess).toBeCloseTo(0, 6);
      expect(y3?.unallocatedRefund).toBeCloseTo(0, 6);

      // cumulative 6 240, 6 240 + 7 509 = 13 749, + 9 002.4 = 22 751.4
      expect(y1?.cumulativeTaxSaved).toBeCloseTo(6_240, 6);
      expect(y2?.cumulativeTaxSaved).toBeCloseTo(13_749, 6);
      expect(y3?.cumulativeTaxSaved).toBeCloseTo(22_751.4, 6);
      // 18 240 + 19 509 + 21 002.4 = 58 751.4
      expect(y3?.lifetimeContributions).toBeCloseTo(58_751.4, 6);
      expect(result.totals.taxSaved).toBeCloseTo(22_751.4, 6);
      expect(result.totals.raContributions).toBeCloseTo(79_440, 6);
      expect(result.totals.tfsaContributions).toBeCloseTo(58_751.4, 6);
      expect(result.totals.penalty).toBeCloseTo(0, 6);
      expect(result.totals.penaltyIncurred).toBe(false);
    });

    it('at 0% returns the balances are the sums paid in', () => {
      const result = journey(j1, tables, rules);
      // TFSA 18 240, 18 240 + 19 509 = 37 749, + 21 002.4 = 58 751.4
      expect(result.years.map((y) => y.tfsaBalance)).toEqual([
        expect.closeTo(18_240, 6),
        expect.closeTo(37_749, 6),
        expect.closeTo(58_751.4, 6),
      ]);
      // RA 24 000, + 26 400 = 50 400, + 29 040 = 79 440
      expect(result.years.map((y) => y.raBalance)).toEqual([
        expect.closeTo(24_000, 6),
        expect.closeTo(50_400, 6),
        expect.closeTo(79_440, 6),
      ]);
    });

    it('at 12% matches the hand-worked balances (refund at year end)', () => {
      const result = journey({ ...j1, raReturn: 0.12, tfsaReturn: 0.12 }, tables, rules);
      // B1 = 1 000·F + 6 240 = 18 886.4979
      // B2 = 1.12·B1 + 1 000·F + 7 509 = 41 308.3756
      // B3 = 1.12·B2 + 1 000·F + 9 002.4 = 67 914.2785
      expect(result.years.map((y) => y.tfsaBalance)).toEqual([
        expect.closeTo(18_886.4979, 3),
        expect.closeTo(41_308.3756, 3),
        expect.closeTo(67_914.2785, 3),
      ]);
      // R3 = F × (2 000 × 1.12² + 2 200 × 1.12 + 2 420) = F × 7 392.8 = 93 493.0297
      expect(result.final.raBalance).toBeCloseTo(93_493.0297, 3);
      expect(result.final.tfsaBalance).toBeCloseTo(67_914.2785, 3);
      expect(1_000 * F12 + 6_240).toBeCloseTo(18_886.4979, 3);
      // ...and equals one raProjection over the whole journey
      const ra = raProjection(
        {
          monthlyContribution: 2_000,
          escalation: 0.1,
          startingBalance: 0,
          annualReturn: 0.12,
          inflation: 0,
          years: 3,
        },
        rules,
      );
      expect(result.ra.final.nominal).toBe(ra.final.nominal);
      expect(result.years[2]?.raBalance).toBe(ra.final.nominal);
    });

    it('in lower-PAYE mode the saving goes in monthly with the top-up', () => {
      const result = journey(
        { ...j1, raReturn: 0.12, tfsaReturn: 0.12, refundMode: 'paye' },
        tables,
        rules,
      );
      // monthly 18 240 / 12 = 1 520, 19 509 / 12 = 1 625.75, 21 002.4 / 12 = 1 750.2
      // P1 = 1 520·F = 19 222.6768; P2 = 1.12·P1 + 1 625.75·F = 42 089.4420;
      // P3 = 1.12·P2 + 1 750.2·F = 69 274.0757
      expect(result.years.map((y) => y.tfsaBalance)).toEqual([
        expect.closeTo(19_222.6768, 3),
        expect.closeTo(42_089.442, 3),
        expect.closeTo(69_274.0757, 3),
      ]);
    });

    it('at 0% lower-PAYE mode equals refund mode', () => {
      // no growth, so timing does not matter: 58 751.4 either way
      const result = journey({ ...j1, refundMode: 'paye' }, tables, rules);
      expect(result.final.tfsaBalance).toBeCloseTo(58_751.4, 6);
    });

    it('has only the start and retirement milestones', () => {
      const result = journey(j1, tables, rules);
      expect(kinds(result.milestones)).toEqual(['start@0/52', 'retirement@3/55']);
    });
  });

  describe('J2: annual cap clamp', () => {
    // age 35 (projected to the earliest age 55), gross 30 000, RA 2 000 → saving 6 240, top-up 4 000
    const j2: JourneyInput = {
      ...base,
      salary: { grossMonthly: 30_000, age: 35 },
      retirementAge: 36,
      contributionMonthly: 2_000,
      tfsaTopUpMonthly: 4_000,
    };

    it('puts the top-up in first and holds the refund back', () => {
      const result = journey(j2, tables, rules);
      const y1 = result.years[0];
      // desired 48 000 + 6 240 = 54 240; allowed 46 000 (top-up first: 46 000, refund 0)
      expect(y1?.taxSaving).toBeCloseTo(6_240, 6);
      expect(y1?.tfsaContribution).toBeCloseTo(46_000, 6);
      // excess 54 240 − 46 000 = 8 240; penalty 8 240 × 0.4 = 3 296
      expect(y1?.tfsaExcess).toBeCloseTo(8_240, 6);
      expect(y1?.tfsaPenalty).toBeCloseTo(3_296, 6);
      // the whole refund is held back: 6 240 − 0
      expect(y1?.unallocatedRefund).toBeCloseTo(6_240, 6);
      expect(y1?.annualCapHit).toBe(true);
      expect(result.milestones).toContainEqual({ kind: 'tfsa-annual-cap', year: 1, age: 35 });
      expect(result.totals.penaltyIncurred).toBe(false);
    });

    it('with over-contribution allowed invests everything and incurs the penalty', () => {
      const result = journey({ ...j2, allowOverContribution: true }, tables, rules);
      const y1 = result.years[0];
      expect(y1?.tfsaContribution).toBeCloseTo(54_240, 6);
      expect(y1?.tfsaPenalty).toBeCloseTo(3_296, 6);
      expect(y1?.unallocatedRefund).toBeCloseTo(0, 6);
      expect(result.totals.penaltyIncurred).toBe(true);
    });
  });

  it('J3: the refund fills the last cents under the annual limit', () => {
    // top-up 3 833.33 → 45 999.96 + 6 240 = 52 239.96; allowed 46 000; refund in 0.04;
    // unallocated 6 240 − 0.04 = 6 239.96; excess 6 239.96; penalty 6 239.96 × 0.4 = 2 495.984
    const result = journey(
      {
        ...base,
        salary: { grossMonthly: 30_000, age: 54 },
        contributionMonthly: 2_000,
        tfsaTopUpMonthly: 3_833.33,
      },
      tables,
      rules,
    );
    const y1 = result.years[0];
    expect(y1?.tfsaContribution).toBeCloseTo(46_000, 6);
    expect(y1?.unallocatedRefund).toBeCloseTo(6_239.96, 6);
    expect(y1?.tfsaExcess).toBeCloseTo(6_239.96, 6);
    expect(y1?.tfsaPenalty).toBeCloseTo(2_495.984, 6);
    // refund in = invested − top-up in = 46 000 − 45 999.96 = 0.04, at 0% the balance is 46 000
    expect(y1?.tfsaBalance).toBeCloseTo(46_000, 6);
  });

  describe('J4: lifetime cap reached exactly', () => {
    // age 35 to 55 (20 years), RA 0, top-up 46 000 / 12, 0% returns
    const j4: JourneyInput = {
      ...base,
      salary: { grossMonthly: 30_000, age: 35 },
      tfsaTopUpMonthly: 46_000 / 12,
    };

    it('fills the lifetime limit in year 11 and holds back the rest', () => {
      const result = journey(j4, tables, rules);
      expect(result.years).toHaveLength(20);
      // years 1..10 invest 46 000 each → 460 000
      expect(result.years[9]?.lifetimeContributions).toBeCloseTo(460_000, 6);
      // year 11 (age 45): room 40 000 → invest 40 000, excess 6 000, penalty 2 400
      const y11 = result.years[10];
      expect(y11?.age).toBe(45);
      expect(y11?.tfsaContribution).toBeCloseTo(40_000, 6);
      expect(y11?.tfsaExcess).toBeCloseTo(6_000, 6);
      expect(y11?.tfsaPenalty).toBeCloseTo(2_400, 6);
      expect(y11?.lifetimeContributions).toBeCloseTo(500_000, 6);
      expect(y11?.lifetimeCapReached).toBe(true);
      expect(result.years[9]?.lifetimeCapReached).toBe(false);
      // years 12..20 invest 0, excess 46 000, penalty 18 400 each
      const y12 = result.years[11];
      expect(y12?.tfsaContribution).toBeCloseTo(0, 6);
      expect(y12?.tfsaExcess).toBeCloseTo(46_000, 6);
      expect(y12?.tfsaPenalty).toBeCloseTo(18_400, 6);

      // totals: 500 000 in; excess 20 × 46 000 − 500 000 = 420 000;
      // penalty 2 400 + 9 × 18 400 = 168 000 (exposure only)
      expect(result.totals.tfsaContributions).toBeCloseTo(500_000, 6);
      expect(result.totals.tfsaExcess).toBeCloseTo(420_000, 6);
      expect(result.totals.penalty).toBeCloseTo(168_000, 6);
      expect(result.totals.penaltyIncurred).toBe(false);
      expect(result.final.tfsaBalance).toBeCloseTo(500_000, 6);
      expect(result.lifetimePercent).toBe(100);
      expect(result.milestones).toContainEqual({ kind: 'tfsa-annual-cap', year: 1, age: 35 });
      expect(result.milestones).toContainEqual({ kind: 'tfsa-lifetime-cap', year: 11, age: 45 });
      expect(kinds(result.milestones)).toEqual([
        'start@0/35',
        'tfsa-annual-cap@1/35',
        'tfsa-lifetime-cap@11/45',
        'retirement@20/55',
      ]);
    });

    it('with over-contribution allowed invests everything and incurs the penalty', () => {
      // 20 × 46 000 = 920 000 at 0%; penalty is the same 168 000, now incurred
      const result = journey({ ...j4, allowOverContribution: true }, tables, rules);
      expect(result.final.tfsaBalance).toBeCloseTo(920_000, 6);
      expect(result.totals.penalty).toBeCloseTo(168_000, 6);
      expect(result.totals.penaltyIncurred).toBe(true);
      expect(result.lifetimePercent).toBe(100);
      expect(result.milestones).toContainEqual({ kind: 'tfsa-lifetime-cap', year: 11, age: 45 });
    });
  });

  describe('J5: s11F headroom clamp', () => {
    it('reports the non-deductible part and the headroom milestone', () => {
      // gross 30 000, RA 9 000: contribution 108 000, deductible 99 000 (0.275 × 360 000),
      // non-deductible 9 000, saving 56 172 − 30 432 = 25 740 (budget.spec B9)
      const result = journey(
        { ...base, salary: { grossMonthly: 30_000, age: 54 }, contributionMonthly: 9_000 },
        tables,
        rules,
      );
      const y1 = result.years[0];
      expect(y1?.raContribution).toBeCloseTo(108_000, 6);
      expect(y1?.raDeductible).toBeCloseTo(99_000, 6);
      expect(y1?.raNonDeductible).toBeCloseTo(9_000, 6);
      expect(y1?.taxSaving).toBeCloseTo(25_740, 6);
      expect(y1?.headroomFullyUsed).toBe(true);
      expect(result.totals.raNonDeductible).toBeCloseTo(9_000, 6);
      expect(result.milestones).toContainEqual({ kind: 'headroom-used', year: 1, age: 54 });
    });

    it('with no RA contribution the headroom is never used', () => {
      const result = journey({ ...base, salary: { grossMonthly: 30_000, age: 54 } }, tables, rules);
      expect(result.years[0]?.headroomFullyUsed).toBe(false);
      expect(result.milestones.some((m) => m.kind === 'headroom-used')).toBe(false);
    });
  });

  describe('J6: retirement-age stop', () => {
    it('runs one row per year to the retirement age', () => {
      const result = journey({ ...base, salary: { grossMonthly: 30_000, age: 53 } }, tables, rules);
      expect(result.years.map((y) => y.age)).toEqual([53, 54]);
    });

    it('raises a request below the earliest age to 55', () => {
      const result = journey(
        { ...base, salary: { grossMonthly: 30_000, age: 53 }, retirementAge: 50 },
        tables,
        rules,
      );
      expect(result.ages.belowEarliest).toBe(true);
      expect(result.years).toHaveLength(2);
    });

    it('with no years left keeps the opening balances', () => {
      const result = journey(
        {
          ...base,
          salary: { grossMonthly: 30_000, age: 55 },
          contributionMonthly: 2_000,
          tfsaTopUpMonthly: 1_000,
          startingBalance: 50_000,
          tfsaBalance: 20_000,
          tfsaLifetimeUsed: 20_000,
          inflation: 0.05,
        },
        tables,
        rules,
      );
      expect(result.ages.pastRetirementAge).toBe(true);
      expect(result.years).toHaveLength(0);
      expect(result.totals).toEqual({
        taxSaved: 0,
        raContributions: 0,
        raNonDeductible: 0,
        tfsaContributions: 0,
        tfsaExcess: 0,
        penalty: 0,
        penaltyIncurred: false,
        unallocatedRefund: 0,
      });
      expect(result.final).toEqual({
        raBalance: 50_000,
        raReal: 50_000,
        tfsaBalance: 20_000,
        tfsaReal: 20_000,
      });
      // 20 000 / 500 000 = 4%
      expect(result.lifetimePercent).toBeCloseTo(4, 6);
      expect(kinds(result.milestones)).toEqual(['start@0/55', 'retirement@0/55']);
    });
  });

  describe('J7: zero-return and constant-return closed forms', () => {
    // age 45 to 55: 10 years
    const ra10: JourneyInput = {
      ...base,
      salary: { grossMonthly: 30_000, age: 45 },
      contributionMonthly: 1_500,
    };
    const tfsa10: JourneyInput = {
      ...base,
      salary: { grossMonthly: 30_000, age: 45 },
      tfsaTopUpMonthly: 2_000,
    };

    it('at 0% the balances are the sums paid in', () => {
      // RA 1 500 × 120 = 180 000; TFSA 2 000 × 120 = 240 000
      expect(journey(ra10, tables, rules).final.raBalance).toBeCloseTo(180_000, 6);
      expect(journey(tfsa10, tables, rules).final.tfsaBalance).toBeCloseTo(240_000, 6);
    });

    it('at 9.5% they match the annuity formula', () => {
      // i = 1.095^(1/12) − 1 = 0.0075915343; 1.095^10 = 2.4782276135
      // RA 1 500 × (1.095^10 − 1) / i = 292 080.8015
      // TFSA 2 000 × (1.095^10 − 1) / i = 389 441.0687
      const ra = journey({ ...ra10, raReturn: 0.095 }, tables, rules);
      const tfsa = journey({ ...tfsa10, tfsaReturn: 0.095 }, tables, rules);
      expect(ra.final.raBalance).toBeCloseTo(292_080.8015, 3);
      expect(tfsa.final.tfsaBalance).toBeCloseTo(389_441.0687, 3);
    });
  });

  it('J8: opening balance and contributions already made', () => {
    // RA 0, so no refund. Opening 100 000 at 0%, used 480 000, top-up 2 000 → desired 24 000;
    // room 20 000; allowed 20 000; excess 4 000; penalty 1 600; balance 120 000; lifetime 500 000
    const result = journey(
      {
        ...base,
        salary: { grossMonthly: 30_000, age: 54 },
        tfsaBalance: 100_000,
        tfsaLifetimeUsed: 480_000,
        tfsaTopUpMonthly: 2_000,
      },
      tables,
      rules,
    );
    const y1 = result.years[0];
    expect(y1?.tfsaContribution).toBeCloseTo(20_000, 6);
    expect(y1?.tfsaExcess).toBeCloseTo(4_000, 6);
    expect(y1?.tfsaPenalty).toBeCloseTo(1_600, 6);
    expect(y1?.tfsaBalance).toBeCloseTo(120_000, 6);
    expect(y1?.lifetimeContributions).toBeCloseTo(500_000, 6);
    expect(y1?.unallocatedRefund).toBeCloseTo(0, 6);
    expect(result.milestones).toContainEqual({ kind: 'tfsa-lifetime-cap', year: 1, age: 54 });
  });

  it('J9: real values divide by inflation', () => {
    // RA 0, top-up 2 000, one year, 0% return, inflation 5%: 24 000; real 24 000 / 1.05 = 22 857.1429
    const result = journey(
      {
        ...base,
        salary: { grossMonthly: 30_000, age: 54 },
        tfsaTopUpMonthly: 2_000,
        inflation: 0.05,
      },
      tables,
      rules,
    );
    expect(result.years[0]?.tfsaBalance).toBeCloseTo(24_000, 6);
    expect(result.years[0]?.tfsaBalanceReal).toBeCloseTo(22_857.1429, 3);
    expect(result.final.tfsaReal).toBeCloseTo(22_857.1429, 3);
  });

  it('J10: payroll contributions rise with income', () => {
    // gross 30 000, employee 3 000, income +10%, RA 6 000 flat, two years (age 53 to 55)
    const result = journey(
      {
        ...base,
        salary: { grossMonthly: 30_000, age: 53, employeeRetirementMonthly: 3_000 },
        incomeEscalation: 0.1,
        contributionMonthly: 6_000,
      },
      tables,
      rules,
    );
    const [y1, y2] = result.years;
    // Y1: limit 0.275 × 360 000 = 99 000; existing 36 000; room 63 000;
    // RA 72 000 → deductible 63 000, non-deductible 72 000 − 63 000 = 9 000
    expect(y1?.raContribution).toBeCloseTo(72_000, 6);
    expect(y1?.raDeductible).toBeCloseTo(63_000, 6);
    expect(y1?.raNonDeductible).toBeCloseTo(9_000, 6);
    // Y2: gross 33 000, employee 3 300: limit 0.275 × 396 000 = 108 900; existing 39 600;
    // room 69 300 → deductible 69 300, non-deductible 72 000 − 69 300 = 2 700
    expect(y2?.raContribution).toBeCloseTo(72_000, 6);
    expect(y2?.raDeductible).toBeCloseTo(69_300, 6);
    expect(y2?.raNonDeductible).toBeCloseTo(2_700, 6);
    // 9 000 + 2 700, not carried forward into year 2's deduction
    expect(result.totals.raNonDeductible).toBeCloseTo(11_700, 6);
  });

  describe('purity and validation', () => {
    it('does not mutate its inputs', () => {
      const input = deepFreeze({ ...j1, salary: { ...j1.salary } });
      const frozenRules = deepFreeze({ ...rules });
      expect(() => journey(input, tables, frozenRules)).not.toThrow();
      expect(input.salary).toEqual({ grossMonthly: 30_000, age: 52 });
    });

    it.each([
      'incomeEscalation',
      'escalation',
      'raReturn',
      'tfsaReturn',
      'inflation',
    ] as const)('rejects an out-of-range %s', (key) => {
      for (const bad of [-0.01, 1.01, Number.NaN]) {
        expect(() => journey({ ...base, [key]: bad }, tables, rules)).toThrow(RangeError);
      }
    });

    it.each([
      'contributionMonthly',
      'startingBalance',
      'tfsaBalance',
      'tfsaLifetimeUsed',
      'tfsaTopUpMonthly',
    ] as const)('rejects a negative or non-finite %s', (key) => {
      for (const bad of [-1, Number.NaN]) {
        expect(() => journey({ ...base, [key]: bad }, tables, rules)).toThrow(RangeError);
      }
    });

    it('rejects a bad salary even with no years to run', () => {
      expect(() =>
        journey({ ...base, salary: { grossMonthly: -1, age: 55 } }, tables, rules),
      ).toThrow(RangeError);
      expect(() =>
        journey({ ...base, salary: { grossMonthly: 30_000, age: 52.5 } }, tables, rules),
      ).toThrow(RangeError);
    });
  });
});
