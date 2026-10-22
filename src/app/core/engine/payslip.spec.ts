import { deepFreeze, shippedTaxTables2027 } from '../../testing/tax-tables';
import { Payslip, PayslipAmounts, PayslipInput, payslip } from './payslip';

const tables = shippedTaxTables2027();

type Extras = Omit<PayslipInput, 'gross' | 'period' | 'age'> & { readonly age?: number };

/** Monthly salary, age 35, no medical and no retirement unless overridden. */
function monthlyInput(gross: number, extras: Extras = {}): PayslipInput {
  return { gross, period: 'monthly', age: 35, ...extras };
}

const slip = (gross: number, extras: Extras = {}) => payslip(monthlyInput(gross, extras), tables);

const AMOUNT_KEYS = [
  'gross',
  'fringeBenefit',
  'remuneration',
  'taxableIncome',
  'taxBeforeRebates',
  'rebates',
  'medicalCredit',
  'paye',
  'uif',
  'employeeRetirement',
  'otherDeductions',
  'netPay',
] as const;

/** Checks every invariant that must hold for any payslip. */
function expectConsistent(result: Payslip): void {
  const { monthly, annual } = result;
  expect(annual.taxBeforeRebates - annual.rebates - annual.medicalCredit).toBeCloseTo(
    annual.paye,
    2,
  );
  for (const key of AMOUNT_KEYS) expect(monthly[key] * 12).toBeCloseTo(annual[key], 2);
  for (const key of ['deductible', 'excess', 'headroom'] as const) {
    expect(monthly.retirement[key] * 12).toBeCloseTo(annual.retirement[key], 2);
  }
}

function expectAmounts(
  actual: PayslipAmounts,
  expected: Partial<Record<keyof PayslipAmounts, number>>,
) {
  for (const [key, value] of Object.entries(expected)) {
    expect(actual[key as keyof PayslipAmounts], key).toBeCloseTo(value as number, 2);
  }
}

describe('payslip', () => {
  it('A: R30 000 a month, age 35, no medical, no retirement', () => {
    const result = slip(30_000);
    // annual 360 000; tax 44 118 + 0.26 × 114 900 = 73 992; less 17 820 = 56 172
    expectAmounts(result.annual, {
      gross: 360_000,
      fringeBenefit: 0,
      remuneration: 360_000,
      taxableIncome: 360_000,
      taxBeforeRebates: 73_992,
      rebates: 17_820,
      medicalCredit: 0,
      paye: 56_172,
      uif: 2_125.44, // 177.12 × 12
      netPay: 301_702.56, // 360 000 − 56 172 − 2 125.44
    });
    expect(result.annual.retirement.deductible).toBe(0);
    expect(result.annual.retirement.excess).toBe(0);
    expect(result.annual.retirement.headroom).toBeCloseTo(99_000, 2); // 0.275 × 360 000
    // 56 172 / 12 = 4 681; UIF 0.01 × 17 712; net 30 000 − 4 681 − 177.12
    expectAmounts(result.monthly, { gross: 30_000, paye: 4_681, uif: 177.12, netPay: 25_141.88 });
    expect(result.marginalRate).toBe(0.26);
    expect(result.effectiveRate).toBeCloseTo(0.1560333, 6); // 56 172 / 360 000
    expectConsistent(result);
  });

  it('A as an annual gross gives the same payslip', () => {
    expect(payslip({ gross: 360_000, period: 'annual', age: 35 }, tables)).toEqual(slip(30_000));
  });

  it('B: A plus medical aid for main member and two dependants', () => {
    const result = slip(30_000, { medicalMembers: 3 });
    // credit 376 + 376 + 254 = 1 006 a month, 12 072 a year; PAYE 56 172 − 12 072 = 44 100
    expectAmounts(result.annual, { medicalCredit: 12_072, paye: 44_100 });
    // 44 100 / 12 = 3 675; net 30 000 − 3 675 − 177.12
    expectAmounts(result.monthly, { medicalCredit: 1_006, paye: 3_675, netPay: 26_147.88 });
    expect(result.marginalRate).toBe(0.26);
    expect(result.effectiveRate).toBeCloseTo(0.1225, 6); // 44 100 / 360 000
    expectConsistent(result);
  });

  it('C: A plus R3 000 a month to an RA saves tax at the marginal rate', () => {
    const result = slip(30_000, { employeeRetirementMonthly: 3_000 });
    // contributions 36 000 < limit 99 000; taxable 324 000
    // tax 44 118 + 0.26 × 78 900 = 44 118 + 20 514 = 64 632; PAYE 64 632 − 17 820 = 46 812
    expect(result.annual.retirement.deductible).toBeCloseTo(36_000, 2);
    expect(result.annual.retirement.excess).toBeCloseTo(0, 2);
    expect(result.annual.retirement.headroom).toBeCloseTo(63_000, 2);
    expectAmounts(result.annual, {
      taxableIncome: 324_000,
      taxBeforeRebates: 64_632,
      paye: 46_812,
      employeeRetirement: 36_000,
    });
    // 46 812 / 12 = 3 901; net 30 000 − 3 000 − 3 901 − 177.12
    expectAmounts(result.monthly, { paye: 3_901, netPay: 22_921.88 });
    // Saving vs A: 4 681 − 3 901 = 780 = 3 000 × 0.26, so net falls by only 2 220 for R3 000 saved.
    const withoutRa = slip(30_000);
    expect(withoutRa.monthly.paye - result.monthly.paye).toBeCloseTo(780, 2);
    expect(withoutRa.monthly.netPay - result.monthly.netPay).toBeCloseTo(2_220, 2);
    expect(result.effectiveRate).toBeCloseTo(0.1300333, 6); // 46 812 / 360 000
    expectConsistent(result);
  });

  it('D: an employer contribution is a taxable fringe benefit that also counts to the deduction', () => {
    const result = slip(30_000, { employerRetirementMonthly: 2_000 });
    // fringe 24 000; remuneration 384 000; limit 0.275 × 384 000 = 105 600; deductible 24 000
    expectAmounts(result.annual, {
      gross: 360_000,
      fringeBenefit: 24_000,
      remuneration: 384_000,
      taxableIncome: 360_000, // 384 000 − 24 000
    });
    expect(result.annual.remuneration).toBeGreaterThan(result.annual.gross);
    expect(result.annual.retirement.deductible).toBeCloseTo(24_000, 2);
    expect(result.annual.retirement.headroom).toBeCloseTo(81_600, 2); // 105 600 − 24 000
    // Taxable income is unchanged, so PAYE matches A; the fringe benefit is not cash, so net matches A.
    expectAmounts(result.monthly, {
      fringeBenefit: 2_000,
      paye: 4_681,
      uif: 177.12,
      netPay: 25_141.88,
    });
    expectConsistent(result);
  });

  it('D2: employer R2 000 plus employee R3 000', () => {
    const result = slip(30_000, {
      employerRetirementMonthly: 2_000,
      employeeRetirementMonthly: 3_000,
    });
    // contributions 60 000 < 105 600; headroom 45 600; taxable 384 000 − 60 000 = 324 000 (as C)
    expect(result.annual.retirement.deductible).toBeCloseTo(60_000, 2);
    expect(result.annual.retirement.headroom).toBeCloseTo(45_600, 2);
    expectAmounts(result.annual, { taxableIncome: 324_000 });
    // net 30 000 − 3 000 − 3 901 − 177.12
    expectAmounts(result.monthly, { paye: 3_901, netPay: 22_921.88 });
    expectConsistent(result);
  });

  it('D3: a large employer contribution raises taxable income above cash pay', () => {
    const result = slip(10_000, { employerRetirementMonthly: 5_000 });
    // fringe 60 000; remuneration 180 000; limit 0.275 × 180 000 = 49 500; contributions 60 000
    // deductible 49 500, excess 10 500; taxable 130 500; tax 0.18 × 130 500 = 23 490
    // PAYE 23 490 − 17 820 = 5 670
    expect(result.annual.retirement.deductible).toBeCloseTo(49_500, 2);
    expect(result.annual.retirement.excess).toBeCloseTo(10_500, 2);
    expect(result.annual.retirement.headroom).toBeCloseTo(0, 2);
    expectAmounts(result.annual, {
      fringeBenefit: 60_000,
      remuneration: 180_000,
      taxableIncome: 130_500,
      taxBeforeRebates: 23_490,
      paye: 5_670,
    });
    expect(result.annual.taxableIncome).toBeGreaterThan(result.annual.gross);
    // 5 670 / 12 = 472.50; UIF on cash gross 0.01 × 10 000 = 100; net 10 000 − 472.50 − 100
    expectAmounts(result.monthly, { paye: 472.5, uif: 100, netPay: 9_427.5 });
    expect(result.marginalRate).toBe(0.18);
    expectConsistent(result);
  });

  it('E: above the R430 000 cap a high earner gets no extra deduction', () => {
    const result = slip(200_000, { employeeRetirementMonthly: 40_000 });
    // 0.275 × 2 400 000 = 660 000 > 430 000; contributions 480 000; excess 50 000
    // taxable 2 400 000 − 430 000 = 1 970 000; tax 666 339 + 0.45 × 91 400 = 707 469
    // PAYE 707 469 − 17 820 = 689 649
    expect(result.annual.retirement.deductible).toBeCloseTo(430_000, 2);
    expect(result.annual.retirement.excess).toBeCloseTo(50_000, 2);
    expect(result.annual.retirement.headroom).toBeCloseTo(0, 2);
    expectAmounts(result.annual, {
      taxableIncome: 1_970_000,
      taxBeforeRebates: 707_469,
      paye: 689_649,
    });
    // 689 649 / 12 = 57 470.75; net 200 000 − 40 000 − 57 470.75 − 177.12
    expectAmounts(result.monthly, { paye: 57_470.75, netPay: 102_352.13 });
    expect(result.marginalRate).toBe(0.45);
    expect(result.effectiveRate).toBeCloseTo(0.28735375, 6); // 689 649 / 2 400 000

    // E2: R45 000 a month changes nothing but the excess (540 000 − 430 000) and net pay.
    const more = slip(200_000, { employeeRetirementMonthly: 45_000 });
    expect(more.annual.retirement.excess).toBeCloseTo(110_000, 2);
    expectAmounts(more.monthly, { paye: 57_470.75, netPay: 97_352.13 });
    expectConsistent(result);
    expectConsistent(more);
  });

  it('F: the medical credit cannot make tax negative', () => {
    const result = slip(10_000, { medicalMembers: 4 });
    // tax 0.18 × 120 000 = 21 600; after rebate 3 780; entitlement 1 260 × 12 = 15 120 but only
    // 3 780 can be used, so PAYE is 0 (not 3 780 − 15 120 = −11 340).
    expectAmounts(result.annual, {
      taxBeforeRebates: 21_600,
      rebates: 17_820,
      medicalCredit: 3_780,
      paye: 0,
    });
    // net 10 000 − 0 − 100
    expectAmounts(result.monthly, { uif: 100, netPay: 9_900 });
    // Tax after rebates is positive, so the bracket rate applies (medical credit ignored).
    expect(result.marginalRate).toBe(0.18);
    expectConsistent(result);
  });

  it('G: below the tax threshold', () => {
    const result = slip(5_000);
    // tax 0.18 × 60 000 = 10 800; the 17 820 rebate is capped at 10 800; PAYE 0
    expectAmounts(result.annual, { taxBeforeRebates: 10_800, rebates: 10_800, paye: 0 });
    // UIF 0.01 × 5 000 = 50; net 5 000 − 50
    expectAmounts(result.monthly, { uif: 50, netPay: 4_950 });
    expect(result.marginalRate).toBe(0);
    expect(result.effectiveRate).toBe(0);
    expectConsistent(result);
  });

  it('H: at the threshold no tax and a 0 marginal rate; R1 above it 18%', () => {
    const atThreshold = slip(8_250); // 8 250 × 12 = 99 000
    expect(atThreshold.annual.paye).toBeCloseTo(0, 2);
    expect(atThreshold.marginalRate).toBe(0);
    const above = payslip({ gross: 99_001, period: 'annual', age: 35 }, tables);
    expect(above.annual.paye).toBeCloseTo(0.18, 2); // 0.18 × 99 001 − 17 820
    expect(above.marginalRate).toBe(0.18);
    expectConsistent(atThreshold);
    expectConsistent(above);
  });

  it.each([
    // 15 000 × 12 = 180 000; tax 0.18 × 180 000 = 32 400; UIF 150
    [64, 1_215, 13_635], // (32 400 − 17 820) / 12; 15 000 − 1 215 − 150
    [65, 401.25, 14_448.75], // (32 400 − 27 585) / 12; 15 000 − 401.25 − 150
    [74, 401.25, 14_448.75],
    [75, 130.5, 14_719.5], // (32 400 − 30 834) / 12; 15 000 − 130.50 − 150
  ])('I: age %d on R15 000 a month pays R%d PAYE, nets R%d', (age, paye, net) => {
    const result = slip(15_000, { age });
    expectAmounts(result.monthly, { paye, uif: 150, netPay: net });
    expectConsistent(result);
  });

  it('J: other deductions come off net pay only', () => {
    const result = slip(30_000, { otherDeductionsMonthly: 1_000 });
    // PAYE as A; net 25 141.88 − 1 000
    expectAmounts(result.monthly, { paye: 4_681, otherDeductions: 1_000, netPay: 24_141.88 });
    expectConsistent(result);
  });

  it('does not mutate frozen inputs or tables', () => {
    const input = deepFreeze(
      monthlyInput(30_000, {
        medicalMembers: 3,
        employeeRetirementMonthly: 3_000,
        employerRetirementMonthly: 2_000,
        otherDeductionsMonthly: 500,
      }),
    );
    const frozenTables = deepFreeze(shippedTaxTables2027());
    const before = JSON.stringify([input, frozenTables]);
    expect(() => payslip(input, frozenTables)).not.toThrow();
    expect(JSON.stringify([input, frozenTables])).toBe(before);
  });

  it('rejects invalid input', () => {
    expect(() => slip(-1)).toThrow(RangeError);
    expect(() => slip(30_000, { age: 1.5 })).toThrow(RangeError);
    expect(() => slip(30_000, { medicalMembers: -1 })).toThrow(RangeError);
    expect(() => slip(30_000, { employeeRetirementMonthly: Number.NaN })).toThrow(RangeError);
    expect(() => slip(30_000, { employerRetirementMonthly: -1 })).toThrow(RangeError);
    expect(() => slip(30_000, { otherDeductionsMonthly: Number.POSITIVE_INFINITY })).toThrow(
      RangeError,
    );
  });
});
