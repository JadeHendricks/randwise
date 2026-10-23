import {
  AFFORDABILITY_SHARE,
  type HomeLoanInput,
  homeLoan,
  loanForRepayment,
  monthlyRepayment,
} from './home-loan';

/**
 * Goldens from plan.md section 4 (HL1..HL6). The rate is a nominal annual rate paid monthly, so
 * R1 000 000 at 10.75% over 20 years has r = 0.1075 / 12 = 0.00895833 and n = 240, and the
 * annuity factor (1 − (1 + r)^−n) / r is 98.49995.
 *
 * The brief's "about R10 164" is an arithmetic slip: the instalment is 1 000 000 / 98.49995 =
 * R10 152.29, so that is what these specs pin.
 */
const FACTOR = 98.49994891177091;

const base: HomeLoanInput = {
  grossMonthly: 50_000,
  existingDebtMonthly: 5_000,
  deposit: 100_000,
  annualRate: 0.1075,
  termYears: 20,
  purchasePrice: null,
  ratesAndLeviesMonthly: 0,
  insuranceMonthly: 0,
  netMonthly: null,
};

const run = (patch: Partial<HomeLoanInput>) => homeLoan({ ...base, ...patch });

describe('monthlyRepayment', () => {
  it('HL1: R1 000 000 at 10.75% over 20 years is R10 152.29 a month, not R10 164', () => {
    // ln(1 + r) = 0.008918445; × 240 = 2.140427; (1 + r)^240 = 8.503067; factor (1 − 0.117605) / r
    // = 98.49995; 1 000 000 / 98.49995 = 10 152.2895
    const repayment = monthlyRepayment(1_000_000, 0.1075, 20);
    expect(repayment).toBeCloseTo(10_152.2895, 3);
    expect(repayment).toBeCloseTo(1_000_000 / FACTOR, 6);
    expect(repayment).not.toBeCloseTo(10_164, 0);
    // total paid 10 152.2895 × 240 = 2 436 549.49
    expect(repayment * 240).toBeCloseTo(2_436_549.49, 2);
  });

  it('HL2: zero interest is the loan over the months', () => {
    // 1 000 000 / 240 = 4 166.67
    expect(monthlyRepayment(1_000_000, 0, 20)).toBeCloseTo(4_166.6667, 4);
  });

  it('is 0 for a loan of 0', () => {
    expect(monthlyRepayment(0, 0.1075, 20)).toBe(0);
  });

  it('throws a RangeError for a loan, rate or term it cannot work with', () => {
    expect(() => monthlyRepayment(-1, 0.1, 20)).toThrow(RangeError);
    expect(() => monthlyRepayment(Number.NaN, 0.1, 20)).toThrow(RangeError);
    expect(() => monthlyRepayment(1_000, -0.01, 20)).toThrow(RangeError);
    expect(() => monthlyRepayment(1_000, 1.01, 20)).toThrow(RangeError);
    expect(() => monthlyRepayment(1_000, 0.1, 0)).toThrow(RangeError);
    expect(() => monthlyRepayment(1_000, 0.1, 31)).toThrow(RangeError);
    expect(() => monthlyRepayment(1_000, 0.1, 12.5)).toThrow(RangeError);
  });
});

describe('loanForRepayment', () => {
  it('HL5: is the inverse of monthlyRepayment, also at rate 0', () => {
    for (const rate of [0, 0.0475, 0.1075, 0.2]) {
      for (const term of [1, 20, 30]) {
        const repayment = monthlyRepayment(850_000, rate, term);
        expect(loanForRepayment(repayment, rate, term)).toBeCloseTo(850_000, 4);
      }
    }
  });

  it('HL3: R10 000 a month buys a bond of R984 999.49', () => {
    // 10 000 × 98.49995 = 984 999.49
    expect(loanForRepayment(10_000, 0.1075, 20)).toBeCloseTo(984_999.49, 2);
  });

  it('throws a RangeError for a negative repayment', () => {
    expect(() => loanForRepayment(-1, 0.1, 20)).toThrow(RangeError);
  });
});

describe('AFFORDABILITY_SHARE', () => {
  it('is the 30% rule of thumb', () => {
    expect(AFFORDABILITY_SHARE).toBe(0.3);
  });
});

describe('homeLoan, what can I afford', () => {
  it('HL3: gross R50 000 and R5 000 of debt leave R10 000 of room and a R984 999.49 bond', () => {
    const result = run({});
    // cap 0.3 × 50 000 = 15 000; room 15 000 − 5 000 = 10 000; bond 10 000 × 98.49995
    expect(result.affordabilityCap).toBe(15_000);
    expect(result.roomForBond).toBe(10_000);
    expect(result.maxBond).toBeCloseTo(984_999.49, 2);
    // plus the R100 000 deposit
    expect(result.maxPrice).toBeCloseTo(1_084_999.49, 2);
    expect(result.purchasePrice).toBeCloseTo(1_084_999.49, 2);
    expect(result.loanAmount).toBeCloseTo(984_999.49, 2);
    expect(result.repayment).toBeCloseTo(10_000, 6);
    expect(result.withinCap).toBe(true);
    expect(result.overCapBy).toBe(0);
    expect(result.debtShareOfGross).toBeCloseTo(0.3, 9);
  });

  it('HL3: debt of R15 000 or more leaves no room', () => {
    for (const existingDebtMonthly of [15_000, 40_000]) {
      const result = run({ existingDebtMonthly });
      expect(result.roomForBond).toBe(0);
      expect(result.maxBond).toBe(0);
      expect(result.maxPrice).toBe(100_000);
      expect(result.repayment).toBe(0);
      expect(result.schedule).toEqual([]);
    }
  });

  it('HL3: a gross of 0 gives zeros and no division by zero', () => {
    const result = run({ grossMonthly: 0, existingDebtMonthly: 0, deposit: 0 });
    expect(result.affordabilityCap).toBe(0);
    expect(result.maxBond).toBe(0);
    expect(result.maxPrice).toBe(0);
    expect(result.repayment).toBe(0);
    expect(result.debtShareOfGross).toBe(0);
    expect(result.withinCap).toBe(true);
    expect(result.firstYear).toBeNull();
  });

  it('HL6: rates, levies and insurance add to the monthly cost but not to the bond', () => {
    const withCosts = run({ ratesAndLeviesMonthly: 1_500, insuranceMonthly: 500 });
    const without = run({});
    expect(withCosts.maxBond).toBe(without.maxBond);
    expect(withCosts.totalMonthlyCost).toBeCloseTo(withCosts.repayment + 2_000, 9);
    expect(without.totalMonthlyCost).toBeCloseTo(without.repayment, 9);
  });
});

describe('homeLoan, repayment for a price', () => {
  const price = { purchasePrice: 1_100_000 };

  it('HL4: R1 100 000 less a R100 000 deposit is a R10 152.29 instalment, R152.29 over the cap', () => {
    const result = run(price);
    expect(result.purchasePrice).toBe(1_100_000);
    expect(result.loanAmount).toBe(1_000_000);
    expect(result.repayment).toBeCloseTo(10_152.29, 2);
    // (5 000 + 10 152.29) / 50 000 = 0.30305
    expect(result.debtShareOfGross).toBeCloseTo(0.30305, 5);
    expect(result.withinCap).toBe(false);
    expect(result.overCapBy).toBeCloseTo(152.29, 2);
    // the cap and the largest bond do not depend on the price
    expect(result.maxBond).toBeCloseTo(984_999.49, 2);
  });

  it('HL1: total interest and the first month', () => {
    const result = run(price);
    expect(result.totalPaid).toBeCloseTo(2_436_549.49, 2);
    expect(result.totalInterest).toBeCloseTo(1_436_549.49, 2);
    // month 1: interest 1 000 000 × r = 8 958.33; principal 10 152.29 − 8 958.33 = 1 193.96
    expect(result.firstMonth.interest).toBeCloseTo(8_958.3333, 3);
    expect(result.firstMonth.principal).toBeCloseTo(1_193.956, 2);
  });

  it('HL1: the first year repays R15 054.91 of principal and pays R106 772.56 of interest', () => {
    const year = run(price).firstYear;
    // (1 + r)^12 = 1.112958; closing 1 000 000 × 1.112958 − 10 152.2895 × (0.112958 / r) = 984 945.09
    expect(year?.year).toBe(1);
    expect(year?.opening).toBe(1_000_000);
    expect(year?.closing).toBeCloseTo(984_945.09, 2);
    expect(year?.principal).toBeCloseTo(15_054.91, 2);
    expect(year?.interest).toBeCloseTo(106_772.56, 2);
  });

  it('HL2: zero interest repays R50 000 of principal in the first year and pays no interest', () => {
    const result = run({ ...price, annualRate: 0 });
    expect(result.repayment).toBeCloseTo(4_166.6667, 4);
    expect(result.totalInterest).toBeCloseTo(0, 6);
    expect(result.firstYear?.principal).toBeCloseTo(50_000, 6);
    expect(result.firstYear?.interest).toBeCloseTo(0, 6);
  });

  it('HL5: a price below the deposit means no loan and no repayment', () => {
    const result = run({ purchasePrice: 80_000 });
    expect(result.loanAmount).toBe(0);
    expect(result.repayment).toBe(0);
    expect(result.totalInterest).toBe(0);
    expect(result.withinCap).toBe(true);
    expect(result.overCapBy).toBe(0);
    expect(result.schedule).toEqual([]);
    expect(result.firstYear).toBeNull();
  });

  it('a price inside the cap is within it', () => {
    const result = run({ purchasePrice: 900_000 });
    expect(result.loanAmount).toBe(800_000);
    expect(result.withinCap).toBe(true);
    expect(result.overCapBy).toBe(0);
  });

  it('HL7: reports the repayment as a share of take-home pay when given', () => {
    // gross 30 000 → net 25 141.88 (the payslip, tested in estimate-home-loan); 10 152.29 / 25 141.88
    const result = run({ ...price, netMonthly: 25_141.88 });
    expect(result.repaymentShareOfNet).toBeCloseTo(0.4038, 4);
    expect(run(price).repaymentShareOfNet).toBeNull();
    expect(run({ ...price, netMonthly: 0 }).repaymentShareOfNet).toBeNull();
  });
});

describe('homeLoan year schedule', () => {
  for (const [rate, term] of [
    [0.1075, 20],
    [0.0925, 30],
    [0.2, 7],
    [0, 15],
    [0.1075, 1],
  ] as const) {
    it(`keeps its invariants at ${rate * 100}% over ${term} years`, () => {
      const result = run({ purchasePrice: 1_100_000, annualRate: rate, termYears: term });
      const { schedule } = result;
      expect(schedule).toHaveLength(term);
      let owed = result.loanAmount;
      let principal = 0;
      let interest = 0;
      schedule.forEach((year, index) => {
        expect(year.year).toBe(index + 1);
        expect(year.opening).toBeCloseTo(owed, 6);
        expect(year.closing).toBeGreaterThanOrEqual(0);
        expect(year.closing).toBeLessThanOrEqual(year.opening);
        expect(year.opening - year.closing).toBeCloseTo(year.principal, 6);
        expect(year.principal + year.interest).toBeCloseTo(result.repayment * 12, 6);
        owed = year.closing;
        principal += year.principal;
        interest += year.interest;
      });
      expect(Math.abs(schedule[term - 1].closing)).toBeLessThan(0.01);
      expect(principal).toBeCloseTo(result.loanAmount, 4);
      expect(interest).toBeCloseTo(result.totalInterest, 4);
    });
  }
});

describe('homeLoan validation', () => {
  it('throws a RangeError for figures it cannot work with', () => {
    expect(() => run({ grossMonthly: -1 })).toThrow(RangeError);
    expect(() => run({ existingDebtMonthly: Number.NaN })).toThrow(RangeError);
    expect(() => run({ deposit: -1 })).toThrow(RangeError);
    expect(() => run({ purchasePrice: -1 })).toThrow(RangeError);
    expect(() => run({ ratesAndLeviesMonthly: -1 })).toThrow(RangeError);
    expect(() => run({ insuranceMonthly: -1 })).toThrow(RangeError);
    expect(() => run({ netMonthly: -1 })).toThrow(RangeError);
    expect(() => run({ annualRate: 1.2 })).toThrow(RangeError);
    expect(() => run({ annualRate: -0.1 })).toThrow(RangeError);
    expect(() => run({ termYears: 0 })).toThrow(RangeError);
    expect(() => run({ termYears: 31 })).toThrow(RangeError);
    expect(() => run({ termYears: 20.5 })).toThrow(RangeError);
  });
});
