import taxYear2027 from '../../../assets/data/tax-years/2027.json';
import { deepFreeze, shippedTaxTables2027 } from '../../testing/tax-tables';
import { validateTaxYearFile } from '../data/tax-year.validator';
import {
  BUDGET_GROUPS,
  BUDGET_PRESETS,
  addCategory,
  applyPreset,
  defaultBudgetCategories,
  distributeToGroups,
  limitWarnings,
  percentOfNet,
  removeCategory,
  renameCategory,
  setCategoryAmount,
  setCategoryPercent,
  summarise,
} from './budget';
import type { BudgetCategory, BudgetLimitSettings } from './budget';
import { roundRand } from './money';
import { payslip } from './payslip';
import type { RaSalary } from './ra';
import { toTfsaRules } from './tfsa';

const tables = shippedTaxTables2027();
const shipped = validateTaxYearFile(taxYear2027, '2027.json');
if (!shipped.ok) throw new Error(`2027.json is invalid: ${shipped.errors.join('; ')}`);
const tfsaRules = toTfsaRules(shipped.value);

/** Default Salary net: 30 000 − PAYE 4 681 − UIF 177.12. */
const NET = 25_141.88;
const PROFILE: RaSalary = { grossMonthly: 30_000, age: 35 };
const SETTINGS: BudgetLimitSettings = {
  net: NET,
  tfsaLifetimeUsed: 0,
  emergencyMonths: 3,
  emergencySaved: 0,
};

function amountOf(categories: readonly BudgetCategory[], id: string): number {
  const line = categories.find((category) => category.id === id);
  if (!line) throw new Error(`no line ${id}`);
  return line.amount;
}

/** The B3 lines: 50/30/20 of the default net spread over the default lines. */
function b3(): BudgetCategory[] {
  return distributeToGroups(defaultBudgetCategories(), applyPreset(NET, '50-30-20'));
}

/** Defaults with only the given lines set. */
function withAmounts(amounts: Record<string, number>): BudgetCategory[] {
  return Object.entries(amounts).reduce(
    (lines, [id, amount]) => setCategoryAmount(lines, id, amount),
    defaultBudgetCategories(),
  );
}

describe('budget presets and defaults', () => {
  it('lists the groups and the preset fractions', () => {
    expect(BUDGET_GROUPS).toEqual(['needs', 'wants', 'savings']);
    expect(BUDGET_PRESETS).toEqual({
      '50-30-20': { needs: 0.5, wants: 0.3, savings: 0.2 },
      '60-20-20': { needs: 0.6, wants: 0.2, savings: 0.2 },
      '70-20-10': { needs: 0.7, wants: 0.2, savings: 0.1 },
    });
  });

  it('builds the default lines with fixed ids, names, groups and shares at 0', () => {
    const lines = defaultBudgetCategories();
    expect(lines.map(({ id, name, group, kind, share }) => [id, name, group, kind, share])).toEqual(
      [
        ['housing', 'Housing', 'needs', 'housing', 0.4],
        ['groceries', 'Groceries', 'needs', 'groceries', 0.2],
        ['transport', 'Transport', 'needs', 'transport', 0.15],
        ['insurance', 'Insurance', 'needs', 'insurance', 0.1],
        ['utilities', 'Utilities', 'needs', 'utilities', 0.1],
        ['needs-other', 'Other needs', 'needs', 'needs-other', 0.05],
        ['wants', 'Wants', 'wants', 'wants', 1],
        ['ra', 'Retirement annuity (RA)', 'savings', 'ra', 0.3],
        ['tfsa', 'Tax-free savings (TFSA)', 'savings', 'tfsa', 0.3],
        ['emergency', 'Emergency fund', 'savings', 'emergency', 0.2],
        ['debt', 'Debt repayment', 'savings', 'debt', 0.1],
        ['savings-other', 'Other savings', 'savings', 'savings-other', 0.1],
      ],
    );
    expect(lines.every((line) => line.amount === 0)).toBe(true);
    // A fresh array each call, so callers can never share state.
    expect(defaultBudgetCategories()).not.toBe(lines);
  });

  it('B1: 50/30/20 of R25 141,88', () => {
    // 25 141.88 × 0.5 = 12 570.94; × 0.3 = 7 542.564; × 0.2 = 5 028.376
    const split = applyPreset(NET, '50-30-20');
    expect(split.needs).toBeCloseTo(12_570.94, 6);
    expect(split.wants).toBeCloseTo(7_542.564, 6);
    expect(split.savings).toBeCloseTo(5_028.376, 6);
    // Rounded at cents: 12 570.94 + 7 542.56 + 5 028.38 = 25 141.88
    expect(roundRand(split.needs) + roundRand(split.wants) + roundRand(split.savings)).toBeCloseTo(
      NET,
      6,
    );
  });

  it('B2: 60/20/20 and 70/20/10', () => {
    // 25 141.88 × 0.6 = 15 085.128; × 0.2 = 5 028.376
    const sixty = applyPreset(NET, '60-20-20');
    expect(sixty.needs).toBeCloseTo(15_085.128, 6);
    expect(sixty.wants).toBeCloseTo(5_028.376, 6);
    expect(sixty.savings).toBeCloseTo(5_028.376, 6);
    // × 0.7 = 17 599.316; × 0.2 = 5 028.376; × 0.1 = 2 514.188
    const seventy = applyPreset(NET, '70-20-10');
    expect(seventy.needs).toBeCloseTo(17_599.316, 6);
    expect(seventy.wants).toBeCloseTo(5_028.376, 6);
    expect(seventy.savings).toBeCloseTo(2_514.188, 6);
  });
});

describe('distributeToGroups', () => {
  it('B3: empty groups split by the default shares', () => {
    const lines = b3();
    // needs 12 570.94 × 0.4 / 0.2 / 0.15 / 0.1 / 0.1 / 0.05
    expect(amountOf(lines, 'housing')).toBeCloseTo(5_028.376, 6);
    expect(amountOf(lines, 'groceries')).toBeCloseTo(2_514.188, 6);
    expect(amountOf(lines, 'transport')).toBeCloseTo(1_885.641, 6);
    expect(amountOf(lines, 'insurance')).toBeCloseTo(1_257.094, 6);
    expect(amountOf(lines, 'utilities')).toBeCloseTo(1_257.094, 6);
    expect(amountOf(lines, 'needs-other')).toBeCloseTo(628.547, 6);
    // wants 7 542.564 × 1
    expect(amountOf(lines, 'wants')).toBeCloseTo(7_542.564, 6);
    // savings 5 028.376 × 0.3 / 0.3 / 0.2 / 0.1 / 0.1
    expect(amountOf(lines, 'ra')).toBeCloseTo(1_508.5128, 6);
    expect(amountOf(lines, 'tfsa')).toBeCloseTo(1_508.5128, 6);
    expect(amountOf(lines, 'emergency')).toBeCloseTo(1_005.6752, 6);
    expect(amountOf(lines, 'debt')).toBeCloseTo(502.8376, 6);
    expect(amountOf(lines, 'savings-other')).toBeCloseTo(502.8376, 6);

    const summary = summarise(lines, NET);
    // total = 12 570.94 + 7 542.564 + 5 028.376 = 25 141.88; float dust is not "over"
    expect(summary.total).toBeCloseTo(NET, 6);
    expect(summary.status).toBe('balanced');
    expect(summary.groups.map((group) => group.group)).toEqual(['needs', 'wants', 'savings']);
    expect(summary.groups[0]?.percent).toBeCloseTo(50, 6);
    expect(summary.groups[1]?.percent).toBeCloseTo(30, 6);
    expect(summary.groups[2]?.percent).toBeCloseTo(20, 6);
    expect(summary.lines.map((line) => line.id)).toEqual(lines.map((line) => line.id));
  });

  it('B4: a second preset keeps each line in proportion to its current amount', () => {
    const lines = distributeToGroups(b3(), applyPreset(NET, '60-20-20'));
    // housing was 0.4 of needs: 15 085.128 × 0.4 = 6 034.0512
    expect(amountOf(lines, 'housing')).toBeCloseTo(6_034.0512, 6);
    // wants 25 141.88 × 0.2 = 5 028.376
    expect(amountOf(lines, 'wants')).toBeCloseTo(5_028.376, 6);
    // savings stays at 20%: RA 5 028.376 × 0.3 = 1 508.5128
    expect(amountOf(lines, 'ra')).toBeCloseTo(1_508.5128, 6);
  });

  it('B4: proportional beats the default shares once lines have amounts', () => {
    // needs lines: housing 3 000, groceries 1 000, rest 0 → 3/4 and 1/4 of 2 000
    const lines = distributeToGroups(withAmounts({ housing: 3_000, groceries: 1_000 }), {
      needs: 2_000,
      wants: 0,
      savings: 0,
    });
    expect(amountOf(lines, 'housing')).toBeCloseTo(1_500, 6);
    expect(amountOf(lines, 'groceries')).toBeCloseTo(500, 6);
    expect(amountOf(lines, 'transport')).toBe(0);
  });

  it('B5: custom lines with no amount and no share split equally', () => {
    const lines = addCategory(addCategory([], { id: 'custom-1', name: 'A', group: 'needs' }), {
      id: 'custom-2',
      name: 'B',
      group: 'needs',
    });
    // 1 000 / 2 lines = 500 each
    const result = distributeToGroups(lines, { needs: 1_000, wants: 0, savings: 0 });
    expect(result.map((line) => line.amount)).toEqual([500, 500]);
  });

  it('B5: a group with no lines leaves its part unallocated', () => {
    const noWants = defaultBudgetCategories().filter((line) => line.group !== 'wants');
    const summary = summarise(distributeToGroups(noWants, applyPreset(NET, '50-30-20')), NET);
    // 30% has nowhere to go: 25 141.88 × 0.3 = 7 542.564
    expect(summary.status).toBe('under');
    expect(summary.unallocated).toBeCloseTo(7_542.564, 6);
  });
});

describe('amounts and percents', () => {
  it('B6: percent and amount stay in sync', () => {
    // 25 141.88 × 10 / 100 = 2 514.188
    const lines = setCategoryPercent(defaultBudgetCategories(), 'housing', 10, NET);
    expect(amountOf(lines, 'housing')).toBeCloseTo(2_514.188, 6);
    expect(percentOfNet(2_514.188, NET)).toBeCloseTo(10, 6);
    // Negative amounts become 0; NaN or an unknown id leaves the lines as they were
    expect(amountOf(setCategoryAmount(lines, 'housing', -5), 'housing')).toBe(0);
    expect(setCategoryAmount(lines, 'housing', Number.NaN)).toEqual(lines);
    expect(setCategoryAmount(lines, 'nope', 100)).toEqual(lines);
    expect(setCategoryPercent(lines, 'housing', Number.NaN, NET)).toEqual(lines);
    expect(amountOf(setCategoryPercent(lines, 'housing', -5, NET), 'housing')).toBe(0);
    // Net 0: the percent of anything is 0 and a percent gives 0 rands
    expect(percentOfNet(100, 0)).toBe(0);
    expect(amountOf(setCategoryPercent(lines, 'housing', 10, 0), 'housing')).toBe(0);
  });

  it('B7: the total percent is not a sum of rounded parts', () => {
    // net 300, three lines of 100 → each 33.333…%; three rounded 33,33% would read 99,99%
    const lines = (['custom-1', 'custom-2', 'custom-3'] as const).reduce(
      (acc, id) => setCategoryAmount(addCategory(acc, { id, name: id, group: 'wants' }), id, 100),
      [] as BudgetCategory[],
    );
    const summary = summarise(lines, 300);
    for (const line of summary.lines) expect(line.percent).toBeCloseTo(100 / 3, 6);
    expect(summary.percentAllocated).toBeCloseTo(100, 6);
    expect(summary.status).toBe('balanced');
  });

  it('B8: over-allocation', () => {
    // total 26 000 against 25 141.88: unallocated −858.12, over by 858.12
    const lines = withAmounts({ housing: 26_000 });
    const summary = summarise(lines, NET);
    expect(summary.total).toBe(26_000);
    expect(summary.unallocated).toBeCloseTo(-858.12, 6);
    expect(summary.overAllocated).toBeCloseTo(858.12, 6);
    expect(summary.status).toBe('over');
    const limits = limitWarnings(lines, PROFILE, tables, tfsaRules, SETTINGS);
    expect(limits.overAllocated).toBeCloseTo(858.12, 6);
    expect(limits.warnings).toEqual(['over-allocated']);
  });
});

describe('limitWarnings', () => {
  it('B9: RA at the s11F headroom is fine', () => {
    // gross 30 000, no payroll: limit 0.275 × 360 000 = 99 000 = 8 250 a month
    const limits = limitWarnings(withAmounts({ ra: 8_250 }), PROFILE, tables, tfsaRules, SETTINGS);
    expect(limits.ra.monthly).toBe(8_250);
    expect(limits.ra.annual).toBe(99_000);
    expect(limits.ra.headroomAnnual).toBeCloseTo(99_000, 6);
    expect(limits.ra.headroomMonthly).toBeCloseTo(8_250, 6);
    expect(roundRand(limits.ra.nonDeductibleAnnual)).toBe(0);
    expect(limits.ra.over).toBe(false);
    expect(limits.warnings).toEqual([]);
  });

  it('B9: one cent a month over the headroom warns', () => {
    // 8 250.01 × 12 = 99 000.12; deductible 99 000; non-deductible 0.12
    const limits = limitWarnings(
      withAmounts({ ra: 8_250.01 }),
      PROFILE,
      tables,
      tfsaRules,
      SETTINGS,
    );
    expect(limits.ra.nonDeductibleAnnual).toBeCloseTo(0.12, 6);
    expect(limits.ra.over).toBe(true);
    expect(limits.warnings).toEqual(['ra-over-headroom']);
  });

  it('B9: RA 9 000 a month, deduction and tax saving', () => {
    // contribution 108 000, deductible 99 000, non-deductible 9 000
    // PAYE without: 44 118 + 0.26 × 114 900 = 73 992 − 17 820 = 56 172
    // PAYE with: taxable 261 000 → 44 118 + 0.26 × 15 900 = 48 252 − 17 820 = 30 432
    // saving 56 172 − 30 432 = 25 740 (= 0.26 × 99 000)
    const limits = limitWarnings(withAmounts({ ra: 9_000 }), PROFILE, tables, tfsaRules, SETTINGS);
    expect(limits.ra.annual).toBe(108_000);
    expect(limits.ra.deductibleAnnual).toBeCloseTo(99_000, 6);
    expect(limits.ra.nonDeductibleAnnual).toBeCloseTo(9_000, 6);
    expect(limits.ra.taxSavingAnnual).toBeCloseTo(25_740, 6);
    expect(limits.ra.over).toBe(true);
  });

  it('B10: payroll contributions use up headroom first', () => {
    // remuneration (30 000 + 2 000) × 12 = 384 000; limit 0.275 × 384 000 = 105 600
    // existing (3 000 + 2 000) × 12 = 60 000; headroom 45 600 = 3 800 a month
    // RA line 4 000 → 48 000; non-deductible 48 000 − 45 600 = 2 400
    const profile: RaSalary = {
      grossMonthly: 30_000,
      age: 35,
      employeeRetirementMonthly: 3_000,
      employerRetirementMonthly: 2_000,
    };
    const limits = limitWarnings(withAmounts({ ra: 4_000 }), profile, tables, tfsaRules, SETTINGS);
    expect(limits.ra.headroomAnnual).toBeCloseTo(45_600, 6);
    expect(limits.ra.headroomMonthly).toBeCloseTo(3_800, 6);
    expect(limits.ra.deductibleAnnual).toBeCloseTo(45_600, 6);
    expect(limits.ra.nonDeductibleAnnual).toBeCloseTo(2_400, 6);
    expect(limits.warnings).toEqual(['ra-over-headroom']);
  });

  it('B10: the budget base is payslip net; the employer contribution is not cash', () => {
    // remuneration 384 000, deduction 60 000, taxable 324 000 → 44 118 + 0.26 × 78 900 = 64 632
    // PAYE 64 632 − 17 820 = 46 812 = 3 901 a month
    // net 30 000 − 3 000 − 3 901 − 177.12 = 22 921.88
    const withEmployer = payslip(
      {
        gross: 30_000,
        period: 'monthly',
        age: 35,
        employeeRetirementMonthly: 3_000,
        employerRetirementMonthly: 2_000,
      },
      tables,
    );
    expect(roundRand(withEmployer.monthly.netPay)).toBe(22_921.88);
    // employer 0: remuneration 360 000, deduction 36 000, taxable also 324 000 → same net
    const withoutEmployer = payslip(
      { gross: 30_000, period: 'monthly', age: 35, employeeRetirementMonthly: 3_000 },
      tables,
    );
    expect(roundRand(withoutEmployer.monthly.netPay)).toBe(22_921.88);
  });

  it('B11: TFSA annual limit boundary at cents', () => {
    // 3 833.33 × 12 = 45 999.96, under 46 000
    const under = limitWarnings(
      withAmounts({ tfsa: 3_833.33 }),
      PROFILE,
      tables,
      tfsaRules,
      SETTINGS,
    );
    expect(under.tfsa.annual).toBeCloseTo(45_999.96, 6);
    expect(under.tfsa.annualLimit).toBe(46_000);
    expect(under.tfsa.annualLimitMonthly).toBeCloseTo(3_833.333333, 5);
    expect(under.warnings).toEqual([]);

    // 3 833.34 × 12 = 46 000.08; excess 0.08; penalty 0.08 × 0.4 = 0.032
    const over = limitWarnings(
      withAmounts({ tfsa: 3_833.34 }),
      PROFILE,
      tables,
      tfsaRules,
      SETTINGS,
    );
    expect(over.tfsa.contribution.excess).toBeCloseTo(0.08, 6);
    expect(over.tfsa.contribution.penalty).toBeCloseTo(0.032, 6);
    expect(over.warnings).toEqual(['tfsa-over-annual']);

    // 46 000 / 12 a month is exactly the limit once rounded at cents
    const exact = limitWarnings(
      withAmounts({ tfsa: 46_000 / 12 }),
      PROFILE,
      tables,
      tfsaRules,
      SETTINGS,
    );
    expect(exact.warnings).toEqual([]);

    // 4 000 × 12 = 48 000; excess 2 000; penalty 800
    const four = limitWarnings(withAmounts({ tfsa: 4_000 }), PROFILE, tables, tfsaRules, SETTINGS);
    expect(four.tfsa.contribution.excess).toBeCloseTo(2_000, 6);
    expect(four.tfsa.contribution.penalty).toBeCloseTo(800, 6);
  });

  it('B11: TFSA lifetime limit', () => {
    // used 480 000; 3 000 × 12 = 36 000; room 20 000; excess 16 000; penalty 6 400
    const limits = limitWarnings(withAmounts({ tfsa: 3_000 }), PROFILE, tables, tfsaRules, {
      ...SETTINGS,
      tfsaLifetimeUsed: 480_000,
    });
    expect(limits.tfsa.contribution.lifetimeRoom).toBe(20_000);
    expect(limits.tfsa.contribution.excess).toBeCloseTo(16_000, 6);
    expect(limits.tfsa.contribution.penalty).toBeCloseTo(6_400, 6);
    expect(limits.warnings).toEqual(['tfsa-over-lifetime']);
  });

  it('B11: years to the lifetime limit', () => {
    const years = (monthly: number) =>
      limitWarnings(withAmounts({ tfsa: monthly }), PROFILE, tables, tfsaRules, SETTINGS).tfsa
        .yearsToLifetime;
    // 500 000 / min(46 000, 46 000) = 10.8696
    expect(years(46_000 / 12)).toBeCloseTo(10.869565, 5);
    // 500 000 / 36 000 = 13.8889
    expect(years(3_000)).toBeCloseTo(13.888889, 5);
    // above the annual limit the limit is what counts: 500 000 / 46 000
    expect(years(4_000)).toBeCloseTo(10.869565, 5);
    expect(years(0)).toBeNull();
  });

  it('lists every warning in the order of the type', () => {
    // over-allocated (20 000 + 9 000 + 4 000 = 33 000 > net), RA 9 000 over 8 250,
    // TFSA 48 000 over 46 000 and over the 20 000 lifetime room
    const limits = limitWarnings(
      withAmounts({ housing: 20_000, ra: 9_000, tfsa: 4_000 }),
      PROFILE,
      tables,
      tfsaRules,
      { ...SETTINGS, tfsaLifetimeUsed: 480_000 },
    );
    expect(limits.warnings).toEqual([
      'over-allocated',
      'ra-over-headroom',
      'tfsa-over-annual',
      'tfsa-over-lifetime',
    ]);
  });

  it('B12: emergency fund target and months to get there', () => {
    // needs 12 570.94 × 3 months = 37 712.82; monthly 1 005.6752;
    // 37 712.82 / 1 005.6752 = 37.5 → 38 months
    const lines = b3();
    const empty = limitWarnings(lines, PROFILE, tables, tfsaRules, SETTINGS).emergency;
    expect(empty.monthly).toBeCloseTo(1_005.6752, 6);
    expect(empty.months).toBe(3);
    expect(empty.needsMonthly).toBeCloseTo(12_570.94, 6);
    expect(empty.target).toBeCloseTo(37_712.82, 6);
    expect(empty.saved).toBe(0);
    expect(empty.progressPercent).toBe(0);
    expect(empty.monthsToTarget).toBe(38);
    expect(empty.reached).toBe(false);

    // saved 10 000: 10 000 / 37 712.82 = 26.5162%; 27 712.82 / 1 005.6752 = 27.556 → 28
    const some = limitWarnings(lines, PROFILE, tables, tfsaRules, {
      ...SETTINGS,
      emergencySaved: 10_000,
    }).emergency;
    expect(some.progressPercent).toBeCloseTo(26.5162, 3);
    expect(some.monthsToTarget).toBe(28);
    expect(some.reached).toBe(false);

    // saved 40 000 ≥ 37 712.82: done
    const done = limitWarnings(lines, PROFILE, tables, tfsaRules, {
      ...SETTINGS,
      emergencySaved: 40_000,
    }).emergency;
    expect(done.progressPercent).toBe(100);
    expect(done.reached).toBe(true);
    expect(done.monthsToTarget).toBe(0);

    // nothing going in and not reached: no date
    const none = limitWarnings(
      setCategoryAmount(lines, 'emergency', 0),
      PROFILE,
      tables,
      tfsaRules,
      SETTINGS,
    ).emergency;
    expect(none.monthsToTarget).toBeNull();
  });

  it('rejects invalid settings', () => {
    const lines = defaultBudgetCategories();
    expect(() =>
      limitWarnings(lines, PROFILE, tables, tfsaRules, { ...SETTINGS, tfsaLifetimeUsed: -1 }),
    ).toThrow(RangeError);
    expect(() =>
      limitWarnings(lines, PROFILE, tables, tfsaRules, { ...SETTINGS, emergencyMonths: 1.5 }),
    ).toThrow(RangeError);
    expect(() =>
      limitWarnings(lines, PROFILE, tables, tfsaRules, { ...SETTINGS, emergencySaved: Number.NaN }),
    ).toThrow(RangeError);
  });
});

describe('custom lines', () => {
  const gym = { id: 'custom-1', name: 'Gym', group: 'wants' } as const;

  it('adds a custom line at the end with amount 0 and share 0', () => {
    const lines = addCategory(defaultBudgetCategories(), gym);
    expect(lines.at(-1)).toEqual({ ...gym, kind: 'custom', amount: 0, share: 0 });
    expect(lines.slice(0, -1)).toEqual(defaultBudgetCategories());
  });

  it('ignores a duplicate id', () => {
    const lines = addCategory(defaultBudgetCategories(), gym);
    expect(addCategory(lines, { ...gym, name: 'Again' })).toEqual(lines);
    expect(addCategory(lines, { id: 'housing', name: 'Second home', group: 'needs' })).toEqual(
      lines,
    );
  });

  it('renames custom lines only, trimmed, ignoring empty names', () => {
    const lines = addCategory(defaultBudgetCategories(), gym);
    expect(nameOf(renameCategory(lines, 'custom-1', '  Gym fees  '), 'custom-1')).toBe('Gym fees');
    expect(renameCategory(lines, 'custom-1', '   ')).toEqual(lines);
    expect(renameCategory(lines, 'housing', 'Rent')).toEqual(lines);
  });

  it('removes custom lines only and keeps the other ids', () => {
    const lines = addCategory(addCategory(defaultBudgetCategories(), gym), {
      id: 'custom-2',
      name: 'Books',
      group: 'wants',
    });
    const removed = removeCategory(lines, 'custom-1');
    expect(removed.map((line) => line.id)).toEqual([
      ...defaultBudgetCategories().map((line) => line.id),
      'custom-2',
    ]);
    expect(removeCategory(lines, 'housing')).toEqual(lines);
  });

  it('never mutates its inputs', () => {
    const lines = deepFreeze(addCategory(b3(), gym));
    const snapshot = structuredClone(lines);
    const settings = deepFreeze({ ...SETTINGS });
    const profile = deepFreeze({ ...PROFILE });
    const split = deepFreeze(applyPreset(NET, '60-20-20'));
    expect(() => {
      distributeToGroups(lines, split);
      setCategoryAmount(lines, 'housing', 1);
      setCategoryPercent(lines, 'housing', 1, NET);
      addCategory(lines, { id: 'custom-9', name: 'X', group: 'needs' });
      renameCategory(lines, 'custom-1', 'Y');
      removeCategory(lines, 'custom-1');
      summarise(lines, NET);
      limitWarnings(lines, profile, tables, tfsaRules, settings);
    }).not.toThrow();
    expect(lines).toEqual(snapshot);
  });
});

function nameOf(categories: readonly BudgetCategory[], id: string): string | undefined {
  return categories.find((category) => category.id === id)?.name;
}
