import {
  EMERGENCY_HORIZON_MONTHS,
  type EmergencyFundInput,
  emergencyFund,
  thinSeries,
} from './emergency-fund';

/**
 * Goldens from plan.md section 4 (EF1..EF6). Expenses R10 000 and 3 months make a R30 000 target.
 * The rate is a nominal annual rate paid monthly (12% is 1% a month) and each month's
 * contribution lands at the END of the month, so it earns nothing until the next one.
 */
const base: EmergencyFundInput = {
  monthlyExpenses: 10_000,
  targetMonths: 3,
  currentSavings: 0,
  monthlyContribution: 1_000,
  annualRate: 0,
};

const run = (patch: Partial<EmergencyFundInput>) => emergencyFund({ ...base, ...patch });

describe('emergencyFund', () => {
  it('exposes a 600-month horizon', () => {
    expect(EMERGENCY_HORIZON_MONTHS).toBe(600);
  });

  it('EF1: savings of R6 000 leave a shortfall of R24 000 and 20% progress', () => {
    const result = run({ currentSavings: 6_000 });
    // target 3 × 10 000 = 30 000; shortfall 30 000 − 6 000 = 24 000; 6 000 / 30 000 = 20%
    expect(result.target).toBe(30_000);
    expect(result.hasTarget).toBe(true);
    expect(result.shortfall).toBe(24_000);
    expect(result.progressPercent).toBeCloseTo(20, 9);
    expect(result.reached).toBe(false);
  });

  it('EF1: savings at or above the target mean nothing to save, zero months and one point', () => {
    for (const currentSavings of [30_000, 45_000]) {
      const result = run({ currentSavings });
      expect(result.shortfall).toBe(0);
      expect(result.reached).toBe(true);
      expect(result.monthsToGoal).toBe(0);
      expect(result.monthsToGoalNoInterest).toBe(0);
      expect(result.progressPercent).toBe(100);
      expect(result.balanceAtGoal).toBe(currentSavings);
      expect(result.series).toEqual([
        { month: 0, balance: currentSavings, contributions: 0, interest: 0 },
      ]);
    }
  });

  it('EF1: no expenses means no target and no months to reach it', () => {
    const result = run({ monthlyExpenses: 0 });
    expect(result.target).toBe(0);
    expect(result.hasTarget).toBe(false);
    expect(result.reached).toBe(false);
    expect(result.monthsToGoal).toBeNull();
    expect(result.monthsToGoalNoInterest).toBeNull();
    expect(result.progressPercent).toBe(0);
    expect(result.series).toHaveLength(1);
  });

  it('EF2: zero rate hits the goal exactly, with no off-by-one', () => {
    const fromR6000 = run({ currentSavings: 6_000 });
    // 24 000 / 1 000 = 24 months exactly
    expect(fromR6000.monthsToGoal).toBe(24);
    expect(fromR6000.balanceAtGoal).toBe(30_000);
    expect(fromR6000.interestEarned).toBe(0);
    expect(fromR6000.contributionsToGoal).toBe(24_000);
    // 30 000 / 1 000 = 30 months from nothing
    expect(run({}).monthsToGoal).toBe(30);
    expect(run({}).balanceAtGoal).toBe(30_000);
  });

  it('EF3: 12% nominal from nothing needs 27 months and ends on R30 820.89', () => {
    const result = run({ annualRate: 0.12 });
    // balance after n months = 100 000 × (1.01^n − 1): n = 26 → 29 525.63 (short), n = 27 → 30 820.89
    expect(result.monthlyRate).toBeCloseTo(0.01, 12);
    expect(result.series[26].balance).toBeCloseTo(29_525.63, 2);
    expect(result.monthsToGoal).toBe(27);
    expect(result.balanceAtGoal).toBeCloseTo(30_820.89, 2);
    // interest earned 30 820.89 − 27 × 1 000 = 3 820.89; without interest it takes 30 months
    expect(result.contributionsToGoal).toBe(27_000);
    expect(result.interestEarned).toBeCloseTo(3_820.89, 2);
    expect(result.monthsToGoalNoInterest).toBe(30);
  });

  it('EF4: R6 000 already saved at 12% needs 21 months and ends on R30 633.55', () => {
    const result = run({ annualRate: 0.12, currentSavings: 6_000 });
    // balance = 6 000 × 1.01^n + 100 000 × (1.01^n − 1): n = 20 → 29 340.14 (short), n = 21 → 30 633.55
    expect(result.series[20].balance).toBeCloseTo(29_340.14, 2);
    expect(result.monthsToGoal).toBe(21);
    expect(result.balanceAtGoal).toBeCloseTo(30_633.55, 2);
    // interest earned 30 633.55 − 6 000 − 21 000 = 3 633.55; without interest 24 000 / 1 000 = 24
    expect(result.interestEarned).toBeCloseTo(3_633.55, 2);
    expect(result.monthsToGoalNoInterest).toBe(24);
  });

  it('EF5: interest alone takes 111 months to turn R10 000 into R30 000 at 12%', () => {
    const result = run({ annualRate: 0.12, currentSavings: 10_000, monthlyContribution: 0 });
    // ln 3 / ln 1.01 = 110.41 → 111 months; month 110 is 29 877.97 (short), month 111 30 176.75
    expect(result.series[110].balance).toBeCloseTo(29_877.97, 2);
    expect(result.monthsToGoal).toBe(111);
    expect(result.balanceAtGoal).toBeCloseTo(30_176.75, 2);
    expect(result.contributionsToGoal).toBe(0);
    // with no contribution and no interest the goal is never reached
    expect(result.monthsToGoalNoInterest).toBeNull();
  });

  it('EF5: no growth at all leaves the goal unreachable', () => {
    expect(
      run({ currentSavings: 0, monthlyContribution: 0, annualRate: 0.12 }).monthsToGoal,
    ).toBeNull();
    expect(
      run({ currentSavings: 5_000, monthlyContribution: 0, annualRate: 0 }).monthsToGoal,
    ).toBeNull();
  });

  it('EF6: R1 a month toward R30 000 at 0% is past the horizon', () => {
    const result = run({ monthlyContribution: 1 });
    // 30 000 months needed, horizon 600
    expect(result.monthsToGoal).toBeNull();
    expect(result.reached).toBe(false);
    expect(result.series).toHaveLength(EMERGENCY_HORIZON_MONTHS + 1);
    expect(result.series[EMERGENCY_HORIZON_MONTHS].balance).toBe(600);
    // The headline figures describe the end of the horizon when the goal is not reached.
    expect(result.balanceAtGoal).toBe(600);
  });

  it('reaching the goal on month 600 still counts', () => {
    const result = run({ monthlyContribution: 50 });
    expect(result.monthsToGoal).toBe(600);
    expect(result.series).toHaveLength(601);
  });

  it('accepts a goal missed by under half a cent as reached', () => {
    // four payments of 2 500 leave the target of 10 000.00001 a hundred-thousandth of a rand short
    const result = run({
      monthlyExpenses: 10_000.00001,
      targetMonths: 1,
      monthlyContribution: 2_500,
    });
    expect(result.monthsToGoal).toBe(4);
  });

  it('the series is month 0 plus one point per month, and adds up', () => {
    const result = run({ annualRate: 0.12, currentSavings: 6_000 });
    expect(result.series[0]).toEqual({ month: 0, balance: 6_000, contributions: 0, interest: 0 });
    result.series.forEach((point, index) => {
      expect(point.month).toBe(index);
      expect(point.balance).toBeCloseTo(6_000 + point.contributions + point.interest, 6);
    });
    expect(result.series.at(-1)?.month).toBe(result.monthsToGoal);
  });

  it('the iterated month count equals the closed form on a grid of inputs', () => {
    // Closed form (spec only): n = ln((T + P/i) / (S + P/i)) / ln(1 + i), and (T − S) / P at i = 0.
    // The engine iterates so the series and the headline can never disagree; this proves the
    // iteration is the same maths. Cases within 0.001 of a whole month are skipped, because a
    // balance within a few cents of the target is decided by the one-cent tolerance, not the maths.
    const closedForm = (target: number, saved: number, monthly: number, annual: number): number => {
      const i = annual / 12;
      if (i === 0) return (target - saved) / monthly;
      const p = monthly / i;
      return Math.log((target + p) / (saved + p)) / Math.log(1 + i);
    };
    let checked = 0;
    for (const expenses of [4_000, 12_345, 25_000])
      for (const months of [1, 3, 6, 12])
        for (const saved of [0, 1_500, 20_000])
          for (const monthly of [300, 1_000, 4_321])
            for (const annual of [0, 0.045, 0.0875, 0.12]) {
              const target = expenses * months;
              if (saved >= target) continue;
              const exact = closedForm(target, saved, monthly, annual);
              if (Math.abs(exact - Math.round(exact)) < 1e-3) continue;
              const result = emergencyFund({
                monthlyExpenses: expenses,
                targetMonths: months,
                currentSavings: saved,
                monthlyContribution: monthly,
                annualRate: annual,
              });
              // past the 600-month horizon the goal is reported as never reached
              expect(result.monthsToGoal).toBe(
                exact > EMERGENCY_HORIZON_MONTHS ? null : Math.ceil(exact),
              );
              checked++;
            }
    expect(checked).toBeGreaterThan(200);
  });

  it('throws a RangeError for figures it cannot work with', () => {
    expect(() => run({ monthlyExpenses: -1 })).toThrow(RangeError);
    expect(() => run({ targetMonths: Number.NaN })).toThrow(RangeError);
    expect(() => run({ currentSavings: -5 })).toThrow(RangeError);
    expect(() => run({ monthlyContribution: Number.POSITIVE_INFINITY })).toThrow(RangeError);
    expect(() => run({ annualRate: -0.01 })).toThrow(RangeError);
    expect(() => run({ annualRate: 1.5 })).toThrow(RangeError);
  });
});

describe('thinSeries', () => {
  const series = Array.from({ length: 601 }, (_, month) => ({ month, balance: month * 10 }));

  it('keeps the first and last point and no more than the maximum', () => {
    const thin = thinSeries(series, 50);
    expect(thin.length).toBeLessThanOrEqual(50);
    expect(thin[0]).toBe(series[0]);
    expect(thin.at(-1)).toBe(series[600]);
  });

  it('is strictly increasing in month', () => {
    for (const max of [2, 3, 7, 50, 600]) {
      const months = thinSeries(series, max).map((point) => point.month);
      expect(months.length).toBeLessThanOrEqual(max);
      months.slice(1).forEach((month, index) => expect(month).toBeGreaterThan(months[index]));
    }
  });

  it('returns a short series unchanged and handles tiny maximums', () => {
    const short = series.slice(0, 10);
    expect(thinSeries(short, 50)).toEqual(short);
    expect(thinSeries(series, 1).map((point) => point.month)).toEqual([0, 600]);
    expect(thinSeries([], 5)).toEqual([]);
  });
});
