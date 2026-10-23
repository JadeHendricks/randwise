import { makeRates } from '../../testing/tax-data-fixtures';
import { deriveAssumptions } from '../data/assumptions';
import {
  JOURNEY_PLAN_EXAMPLE,
  type JourneyPlanFields,
  journeyPlanDefaults,
  sanitiseJourneyPlan,
} from './journey-inputs';

const plan: JourneyPlanFields = {
  retirementAge: 55,
  incomeEscalationPercent: 4.5,
  contributionMonthly: 2_000,
  escalationPercent: 5,
  startingBalance: 0,
  tfsaBalance: 0,
  tfsaLifetimeUsed: 0,
  tfsaTopUpMonthly: 1_000,
  returnPercent: 9.5,
  tfsaReturnPercent: 9.5,
  inflationPercent: 4.5,
  refundMode: 'refund',
  allowOverContribution: false,
};

describe('journeyPlanDefaults', () => {
  it('uses the example figures with CPI for inflation and income, CPI + 5 for both returns', () => {
    expect(journeyPlanDefaults(deriveAssumptions(makeRates().rates))).toEqual(plan);
  });

  it('follows CPI: 6 gives inflation and income rise 6, returns 11', () => {
    const base = makeRates();
    const defaults = journeyPlanDefaults(
      deriveAssumptions({ ...base.rates, cpi: { ...base.rates.cpi, valuePercent: 6 } }),
    );
    expect(defaults.inflationPercent).toBe(6);
    expect(defaults.incomeEscalationPercent).toBe(6);
    expect(defaults.returnPercent).toBe(11);
    expect(defaults.tfsaReturnPercent).toBe(11);
  });

  it('uses zero rates without rates data', () => {
    expect(journeyPlanDefaults(null)).toEqual({
      ...JOURNEY_PLAN_EXAMPLE,
      inflationPercent: 0,
      incomeEscalationPercent: 0,
      returnPercent: 0,
      tfsaReturnPercent: 0,
    });
  });
});

describe('sanitiseJourneyPlan', () => {
  it('applies valid values and leaves the rest alone', () => {
    expect(
      sanitiseJourneyPlan({ contributionMonthly: 3_000, tfsaTopUpMonthly: 2_500 }, plan),
    ).toEqual({ ...plan, contributionMonthly: 3_000, tfsaTopUpMonthly: 2_500 });
  });

  it('keeps the current amount for a negative, NaN or infinite one and never caps it', () => {
    expect(sanitiseJourneyPlan({ startingBalance: -1, tfsaBalance: Number.NaN }, plan)).toEqual(
      plan,
    );
    expect(sanitiseJourneyPlan({ tfsaLifetimeUsed: 9e9 }, plan).tfsaLifetimeUsed).toBe(9e9);
  });

  it('rounds and clamps the retirement age to 40..80', () => {
    expect(sanitiseJourneyPlan({ retirementAge: 62.6 }, plan).retirementAge).toBe(63);
    expect(sanitiseJourneyPlan({ retirementAge: 10 }, plan).retirementAge).toBe(40);
    expect(sanitiseJourneyPlan({ retirementAge: 200 }, plan).retirementAge).toBe(80);
  });

  it('clamps percents to their limits without rounding them', () => {
    const next = sanitiseJourneyPlan(
      { inflationPercent: 99, returnPercent: -3, tfsaReturnPercent: 7.255, escalationPercent: 50 },
      plan,
    );
    expect(next.inflationPercent).toBe(15);
    expect(next.returnPercent).toBe(0);
    expect(next.tfsaReturnPercent).toBe(7.255);
    expect(next.escalationPercent).toBe(20);
  });

  it('accepts only the two tax-saving modes and a boolean over-contribution choice', () => {
    expect(sanitiseJourneyPlan({ refundMode: 'paye' }, plan).refundMode).toBe('paye');
    expect(sanitiseJourneyPlan({ refundMode: 'nope' as never }, plan).refundMode).toBe('refund');
    expect(sanitiseJourneyPlan({ allowOverContribution: true }, plan).allowOverContribution).toBe(
      true,
    );
    expect(
      sanitiseJourneyPlan({ allowOverContribution: 'yes' as never }, plan).allowOverContribution,
    ).toBe(false);
  });

  it('does not change its inputs', () => {
    const frozen = Object.freeze({ ...plan });
    expect(() => sanitiseJourneyPlan({ retirementAge: 60 }, frozen)).not.toThrow();
  });
});
