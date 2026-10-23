import { makeRates } from '../../testing/tax-data-fixtures';
import { GROWTH_PREMIUM_PP, deriveAssumptions } from '../data/assumptions';
import {
  type EmergencyFundInputs,
  type HomeLoanInputs,
  type InvestmentInputs,
  type TwoPotInputs,
  emergencyFundDefaults,
  growthPercent,
  homeLoanDefaults,
  investmentDefaults,
  marginFromRate,
  overridesAfter,
  percentFromFraction,
  rateFromMargin,
  sanitiseEmergencyFund,
  sanitiseHomeLoan,
  sanitiseInvestment,
  sanitiseTwoPot,
  twoPotDefaults,
} from './toolbox-inputs';

// The fixture rates: repo 7, prime 10.5, CPI 4.5, so the growth assumption is 4.5 + 5 = 9.5.
const assumptions = deriveAssumptions(makeRates().rates);

const emergency: EmergencyFundInputs = {
  monthlyExpenses: 15_000,
  targetMonths: 3,
  currentSavings: 0,
  monthlyContribution: 2_000,
  savingsRatePercent: 7,
};

const loan: HomeLoanInputs = {
  grossMonthly: 30_000,
  existingDebtMonthly: 0,
  deposit: 0,
  ratePercent: 10.5,
  termYears: 20,
  mode: 'afford',
  purchasePrice: 1_500_000,
  ratesAndLeviesMonthly: 0,
  insuranceMonthly: 0,
};

const twoPot: TwoPotInputs = {
  withdrawal: 20_000,
  taxableIncomeAnnual: 360_000,
  age: 35,
  medicalMembers: 0,
  yearsToRetirement: 20,
  realGrowthPercent: 5,
  inflationPercent: 4.5,
};

const investment: InvestmentInputs = {
  lumpSum: 46_000,
  yearlyContribution: 0,
  years: 10,
  returnPercent: 9.5,
  interestPercent: 30,
  dividendPercent: 20,
  marginalRatePercent: 26,
  age: 35,
  tfsaLifetimeUsed: 0,
};

describe('defaults', () => {
  it('emergency fund: the savings rate is the repo rate, 0 without rates', () => {
    expect(emergencyFundDefaults(assumptions)).toEqual(emergency);
    expect(emergencyFundDefaults(null).savingsRatePercent).toBe(0);
    expect(emergencyFundDefaults(null).monthlyExpenses).toBe(15_000);
  });

  it('home loan: the bond rate is prime, 0 without rates', () => {
    expect(homeLoanDefaults(10.5)).toEqual({ ...loan, grossMonthly: undefined });
    expect('grossMonthly' in homeLoanDefaults(10.5)).toBe(false);
    expect(homeLoanDefaults(null).ratePercent).toBe(0);
    expect(homeLoanDefaults(45).ratePercent).toBe(30);
  });

  it('two-pot: real growth is the 5-point premium and inflation is CPI, 0 without rates', () => {
    expect(GROWTH_PREMIUM_PP).toBe(5);
    expect(twoPotDefaults(assumptions)).toEqual({
      withdrawal: 20_000,
      yearsToRetirement: 20,
      realGrowthPercent: 5,
      inflationPercent: 4.5,
    });
    expect(twoPotDefaults(null)).toMatchObject({ realGrowthPercent: 0, inflationPercent: 0 });
  });

  it('investment: the return is the growth assumption, 0 without rates', () => {
    expect(investmentDefaults(assumptions)).toEqual({
      lumpSum: 46_000,
      yearlyContribution: 0,
      years: 10,
      returnPercent: 9.5,
      interestPercent: 30,
      dividendPercent: 20,
      tfsaLifetimeUsed: 0,
    });
    expect(investmentDefaults(null).returnPercent).toBe(0);
  });
});

describe('sanitiseEmergencyFund', () => {
  it('applies valid values, rounding the months and clamping the percent', () => {
    expect(
      sanitiseEmergencyFund(
        { monthlyExpenses: 20_000, targetMonths: 5.6, savingsRatePercent: 40 },
        emergency,
      ),
    ).toEqual({ ...emergency, monthlyExpenses: 20_000, targetMonths: 6, savingsRatePercent: 15 });
  });

  it('clamps the months to 1..12', () => {
    expect(sanitiseEmergencyFund({ targetMonths: 0 }, emergency).targetMonths).toBe(1);
    expect(sanitiseEmergencyFund({ targetMonths: 99 }, emergency).targetMonths).toBe(12);
  });

  it('keeps the current value for a negative, NaN or infinite amount', () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        sanitiseEmergencyFund(
          { monthlyExpenses: bad, currentSavings: bad, monthlyContribution: bad },
          emergency,
        ),
      ).toEqual(emergency);
    }
    expect(sanitiseEmergencyFund({ savingsRatePercent: Number.NaN }, emergency)).toEqual(emergency);
  });

  it('does not cap a huge amount', () => {
    expect(sanitiseEmergencyFund({ monthlyExpenses: 5e9 }, emergency).monthlyExpenses).toBe(5e9);
  });
});

describe('sanitiseHomeLoan', () => {
  it('clamps the rate to 0..30 and the term to a whole 1..30', () => {
    expect(sanitiseHomeLoan({ ratePercent: 99, termYears: 45 }, loan)).toMatchObject({
      ratePercent: 30,
      termYears: 30,
    });
    expect(sanitiseHomeLoan({ ratePercent: -3, termYears: 0.2 }, loan)).toMatchObject({
      ratePercent: 0,
      termYears: 1,
    });
    expect(sanitiseHomeLoan({ termYears: 17.6 }, loan).termYears).toBe(18);
  });

  it('accepts only the two known modes', () => {
    expect(sanitiseHomeLoan({ mode: 'price' }, loan).mode).toBe('price');
    expect(sanitiseHomeLoan({ mode: 'rent' as never }, loan).mode).toBe('afford');
  });

  it('keeps the current value for an invalid amount', () => {
    expect(
      sanitiseHomeLoan({ grossMonthly: -5, deposit: Number.NaN, purchasePrice: -1 }, loan),
    ).toEqual(loan);
  });
});

describe('sanitiseTwoPot', () => {
  it('clamps the age, members, years and percents', () => {
    expect(
      sanitiseTwoPot(
        {
          age: 150,
          medicalMembers: 20,
          yearsToRetirement: 80,
          realGrowthPercent: 50,
          inflationPercent: -2,
        },
        twoPot,
      ),
    ).toMatchObject({
      age: 100,
      medicalMembers: 10,
      yearsToRetirement: 50,
      realGrowthPercent: 15,
      inflationPercent: 0,
    });
  });

  it('allows 0 years to retirement and rounds to a whole number', () => {
    expect(sanitiseTwoPot({ yearsToRetirement: 0 }, twoPot).yearsToRetirement).toBe(0);
    expect(sanitiseTwoPot({ yearsToRetirement: 12.4 }, twoPot).yearsToRetirement).toBe(12);
  });

  it('keeps the current value for an invalid amount', () => {
    expect(sanitiseTwoPot({ withdrawal: -1, taxableIncomeAnnual: Number.NaN }, twoPot)).toEqual(
      twoPot,
    );
  });
});

describe('sanitiseInvestment', () => {
  it('clamps the years to a whole 1..50 and the return to 0..20', () => {
    expect(sanitiseInvestment({ years: 80, returnPercent: 35 }, investment)).toMatchObject({
      years: 50,
      returnPercent: 20,
    });
    expect(sanitiseInvestment({ years: 0 }, investment).years).toBe(1);
  });

  it('clamps dividends to what interest leaves (dividends <= 100 - interest)', () => {
    expect(sanitiseInvestment({ dividendPercent: 90 }, investment).dividendPercent).toBe(70);
    expect(sanitiseInvestment({ interestPercent: 90 }, investment)).toMatchObject({
      interestPercent: 90,
      dividendPercent: 10,
    });
    expect(
      sanitiseInvestment({ interestPercent: 60, dividendPercent: 40 }, investment),
    ).toMatchObject({ interestPercent: 60, dividendPercent: 40 });
    expect(sanitiseInvestment({ interestPercent: 100 }, investment).dividendPercent).toBe(0);
  });

  it('clamps the percents and age, and keeps the current value for a bad amount', () => {
    expect(
      sanitiseInvestment({ interestPercent: -4, marginalRatePercent: 250 }, investment),
    ).toMatchObject({
      interestPercent: 0,
      marginalRatePercent: 100,
    });
    expect(sanitiseInvestment({ age: 12 }, investment).age).toBe(18);
    expect(sanitiseInvestment({ lumpSum: -1, tfsaLifetimeUsed: Number.NaN }, investment)).toEqual(
      investment,
    );
  });
});

describe('rateFromMargin and marginFromRate', () => {
  it('turns a margin over prime into a rate and back, to 2 decimal places', () => {
    expect(rateFromMargin(10.75, -0.5)).toBe(10.25);
    expect(rateFromMargin(10.75, 0)).toBe(10.75);
    expect(rateFromMargin(10.1, 0.2)).toBe(10.3);
    expect(marginFromRate(10.75, 10.25)).toBe(-0.5);
    expect(marginFromRate(10.75, 11.5)).toBe(0.75);
    expect(marginFromRate(10.1, 10.3)).toBe(0.2);
  });
});

describe('growthPercent', () => {
  it('is whatever the interest and dividend shares leave', () => {
    expect(growthPercent({ interestPercent: 30, dividendPercent: 20 })).toBe(50);
    expect(growthPercent({ interestPercent: 100, dividendPercent: 0 })).toBe(0);
    expect(growthPercent({ interestPercent: 0, dividendPercent: 0 })).toBe(100);
    // Never below 0, even if a caller skips the sanitiser.
    expect(growthPercent({ interestPercent: 80, dividendPercent: 40 })).toBe(0);
  });
});

describe('percentFromFraction', () => {
  it('turns a rate into a clean percent', () => {
    expect(percentFromFraction(0.26)).toBe(26);
    expect(percentFromFraction(0.07)).toBe(7);
    expect(percentFromFraction(0.1075)).toBe(10.75);
    expect(percentFromFraction(0)).toBe(0);
  });
});

describe('overridesAfter', () => {
  it('records the keys that were typed, not the ones that only followed', () => {
    const before = { ...twoPot };
    const after = sanitiseTwoPot({ withdrawal: 50_000 }, before);
    expect(overridesAfter<TwoPotInputs>({}, { withdrawal: 50_000 }, before, after)).toEqual({
      withdrawal: 50_000,
    });
  });

  it('records the clamped value of a typed key', () => {
    const after = sanitiseTwoPot({ age: 150 }, twoPot);
    expect(overridesAfter<TwoPotInputs>({}, { age: 150 }, twoPot, after)).toEqual({ age: 100 });
  });

  it('records a typed value that equals what was already shown', () => {
    const after = sanitiseTwoPot({ age: 35 }, twoPot);
    expect(overridesAfter<TwoPotInputs>({}, { age: 35 }, twoPot, after)).toEqual({ age: 35 });
  });

  it('ignores a rejected value so a field that follows the Pay page keeps following', () => {
    const after = sanitiseTwoPot({ age: Number.NaN, taxableIncomeAnnual: -1 }, twoPot);
    expect(
      overridesAfter<TwoPotInputs>({}, { age: Number.NaN, taxableIncomeAnnual: -1 }, twoPot, after),
    ).toEqual({});
  });

  it('also records a field the split clamp moved', () => {
    const after = sanitiseInvestment({ interestPercent: 90 }, investment);
    expect(
      overridesAfter<InvestmentInputs>({}, { interestPercent: 90 }, investment, after),
    ).toEqual({ interestPercent: 90, dividendPercent: 10 });
  });

  it('keeps earlier overrides', () => {
    const after = sanitiseTwoPot({ withdrawal: 9_000 }, twoPot);
    expect(overridesAfter<TwoPotInputs>({ age: 40 }, { withdrawal: 9_000 }, twoPot, after)).toEqual(
      { age: 40, withdrawal: 9_000 },
    );
  });
});
