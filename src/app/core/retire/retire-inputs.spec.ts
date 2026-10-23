import { makeRates } from '../../testing/tax-data-fixtures';
import { deriveAssumptions } from '../data/assumptions';
import {
  RETIRE_PLAN_EXAMPLE,
  type RetirePlanFields,
  retirePlanDefaults,
  retirementReturnAssumption,
  sanitiseRetirePlan,
} from './retire-inputs';

const plan: RetirePlanFields = {
  goalNetMonthly: 50_000,
  retirementAge: 55,
  inflationPercent: 4.5,
  returnPercent: 9.5,
  retirementReturnPercent: 7.5,
  drawdownPercent: 5,
  takeLumpSum: false,
  startingBalance: 0,
  contributionMonthly: 2_000,
  escalationPercent: 5,
};

function assumptionsWithCpi(cpi: number) {
  const base = makeRates();
  return deriveAssumptions({
    ...base.rates,
    cpi: { ...base.rates.cpi, valuePercent: cpi },
  });
}

describe('retirePlanDefaults', () => {
  it('uses the example figures with CPI, CPI + 5 and CPI + 3 from the bundled rates', () => {
    expect(retirePlanDefaults(deriveAssumptions(makeRates().rates))).toEqual(plan);
  });

  it('follows CPI: 6 gives inflation 6, growth 11 and retirement return 9', () => {
    const defaults = retirePlanDefaults(assumptionsWithCpi(6));
    expect(defaults.inflationPercent).toBe(6);
    expect(defaults.returnPercent).toBe(11);
    expect(defaults.retirementReturnPercent).toBe(9);
  });

  it('uses zero inflation and returns without rates', () => {
    expect(retirePlanDefaults(null)).toEqual({
      ...RETIRE_PLAN_EXAMPLE,
      inflationPercent: 0,
      returnPercent: 0,
      retirementReturnPercent: 0,
    });
  });
});

describe('retirementReturnAssumption', () => {
  it('is CPI plus 3 percentage points with an Assumption: description', () => {
    const assumption = retirementReturnAssumption(assumptionsWithCpi(4.5));
    expect(assumption?.valuePercent).toBe(7.5);
    expect(assumption?.description).toBe(
      'Assumption: in retirement your money earns CPI plus 3 percentage points (7.5%), a more cautious mix than before retirement.',
    );
  });

  it('is null without rates', () => {
    expect(retirementReturnAssumption(null)).toBeNull();
  });
});

describe('sanitiseRetirePlan', () => {
  it('applies valid values', () => {
    expect(
      sanitiseRetirePlan(
        { goalNetMonthly: 20_000, startingBalance: 100_000, drawdownPercent: 4.25, takeLumpSum: true },
        plan,
      ),
    ).toEqual({
      ...plan,
      goalNetMonthly: 20_000,
      startingBalance: 100_000,
      drawdownPercent: 4.25,
      takeLumpSum: true,
    });
  });

  it('ignores NaN, infinite and negative amounts and does not cap large ones', () => {
    expect(sanitiseRetirePlan({ goalNetMonthly: Number.NaN }, plan).goalNetMonthly).toBe(50_000);
    expect(sanitiseRetirePlan({ contributionMonthly: -1 }, plan).contributionMonthly).toBe(2_000);
    expect(sanitiseRetirePlan({ startingBalance: Infinity }, plan).startingBalance).toBe(0);
    expect(sanitiseRetirePlan({ startingBalance: 5e9 }, plan).startingBalance).toBe(5e9);
  });

  it('clamps percents to their limits without rounding them', () => {
    const result = sanitiseRetirePlan(
      {
        inflationPercent: 50,
        returnPercent: -3,
        retirementReturnPercent: 25,
        escalationPercent: 21,
      },
      plan,
    );
    expect(result.inflationPercent).toBe(15);
    expect(result.returnPercent).toBe(0);
    expect(result.retirementReturnPercent).toBe(20);
    expect(result.escalationPercent).toBe(20);
    expect(sanitiseRetirePlan({ returnPercent: 7.25 }, plan).returnPercent).toBe(7.25);
  });

  it('clamps the drawdown to 1..20 so 2.4 and 17.6 still reach the engine check', () => {
    expect(sanitiseRetirePlan({ drawdownPercent: 2.4 }, plan).drawdownPercent).toBe(2.4);
    expect(sanitiseRetirePlan({ drawdownPercent: 17.6 }, plan).drawdownPercent).toBe(17.6);
    expect(sanitiseRetirePlan({ drawdownPercent: 0.2 }, plan).drawdownPercent).toBe(1);
    expect(sanitiseRetirePlan({ drawdownPercent: 40 }, plan).drawdownPercent).toBe(20);
  });

  it('rounds the retirement age and clamps it to 40 to 80', () => {
    expect(sanitiseRetirePlan({ retirementAge: 60.6 }, plan).retirementAge).toBe(61);
    expect(sanitiseRetirePlan({ retirementAge: 10 }, plan).retirementAge).toBe(40);
    expect(sanitiseRetirePlan({ retirementAge: 200 }, plan).retirementAge).toBe(80);
  });

  it('keeps the current value for invalid input', () => {
    const result = sanitiseRetirePlan(
      { retirementAge: Number.NaN, drawdownPercent: Number.NaN, returnPercent: Number.NaN },
      plan,
    );
    expect(result).toEqual(plan);
  });

  it('ignores a takeLumpSum that is not a boolean', () => {
    const odd = { takeLumpSum: 'yes' } as unknown as Partial<RetirePlanFields>;
    expect(sanitiseRetirePlan(odd, plan).takeLumpSum).toBe(false);
    expect(sanitiseRetirePlan(odd, { ...plan, takeLumpSum: true }).takeLumpSum).toBe(true);
  });
});
