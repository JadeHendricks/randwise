import { estimateEmergencyFund } from './estimate-emergency-fund';
import type { EmergencyFundInputs } from './toolbox-inputs';

// Engine EF3: R10 000 a month for 3 months is a R30 000 target; R1 000 a month at 12% takes 27 months.
const EF3: EmergencyFundInputs = {
  monthlyExpenses: 10_000,
  targetMonths: 3,
  currentSavings: 0,
  monthlyContribution: 1_000,
  savingsRatePercent: 12,
};

function ok(inputs: EmergencyFundInputs) {
  const estimate = estimateEmergencyFund(inputs);
  if (!estimate.ok) throw new Error(`failed: ${estimate.message}`);
  return estimate;
}

describe('estimateEmergencyFund', () => {
  it('turns the percent into a fraction: 12 means 1% a month, so 27 months', () => {
    const { result, warnings } = ok(EF3);
    expect(result.monthlyRate).toBeCloseTo(0.01, 12);
    expect(result.monthsToGoal).toBe(27);
    expect(result.balanceAtGoal).toBeCloseTo(30_820.89, 2);
    expect(warnings).toEqual([]);
  });

  it('at 0% the months are the shortfall over the contribution, rounded up', () => {
    // 3 × 15 000 = 45 000; 45 000 / 2 000 = 22.5 → 23
    const { result } = ok({
      monthlyExpenses: 15_000,
      targetMonths: 3,
      currentSavings: 0,
      monthlyContribution: 2_000,
      savingsRatePercent: 0,
    });
    expect(result.monthsToGoal).toBe(23);
  });

  it('warns when there are no expenses to cover', () => {
    expect(ok({ ...EF3, monthlyExpenses: 0 }).warnings).toEqual(['no-expenses']);
  });

  it('warns when the goal is never reached', () => {
    expect(ok({ ...EF3, monthlyContribution: 0 }).warnings).toEqual(['not-reachable']);
    expect(ok({ ...EF3, monthlyContribution: 1, savingsRatePercent: 0 }).warnings).toEqual([
      'not-reachable',
    ]);
  });

  it('does not warn when the goal is already met', () => {
    const { result, warnings } = ok({ ...EF3, currentSavings: 40_000 });
    expect(result.reached).toBe(true);
    expect(warnings).toEqual([]);
  });

  it('returns a plain sentence for a figure the engine rejects', () => {
    for (const bad of [
      { savingsRatePercent: -5 },
      { savingsRatePercent: 500 },
      { monthlyExpenses: -1 },
      { monthlyContribution: Number.NaN },
    ]) {
      const estimate = estimateEmergencyFund({ ...EF3, ...bad });
      expect(estimate.ok).toBe(false);
      if (!estimate.ok) {
        expect(estimate.message).toBe(
          'Those figures could not be worked out. Check the amounts and try again.',
        );
      }
    }
  });
});
