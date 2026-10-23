import { TestBed } from '@angular/core/testing';

import { provideTestData } from '../../testing/tax-data-fixtures';
import { TODAY } from '../data/data-source';
import { PlanContextStore } from '../plan/plan-context.store';
import { SalaryInputsStore } from '../salary/salary-inputs.store';
import { ToolboxStore } from './toolbox.store';

// Pinned so the bundled 2027 file is the tax year in use whatever day the specs run.
const TODAY_PINNED = new Date(2026, 9, 22);

function setup() {
  TestBed.configureTestingModule({
    providers: [{ provide: TODAY, useValue: () => new Date(TODAY_PINNED) }],
  });
  return {
    toolbox: TestBed.inject(ToolboxStore),
    salary: TestBed.inject(SalaryInputsStore),
    plan: TestBed.inject(PlanContextStore),
  };
}

describe('ToolboxStore', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('defaults', () => {
    // The bundled rates: repo 7.25, prime 10.75, CPI 4.5, so growth is 4.5 + 5 = 9.5.
    it('follow the labelled assumptions', () => {
      const { toolbox } = setup();
      expect(toolbox.prime()).toBe(10.75);
      expect(toolbox.emergencyFundInputs().savingsRatePercent).toBe(7.25);
      expect(toolbox.homeLoanInputs().ratePercent).toBe(10.75);
      expect(toolbox.twoPotInputs()).toMatchObject({ realGrowthPercent: 5, inflationPercent: 4.5 });
      expect(toolbox.investmentInputs().returnPercent).toBe(9.5);
    });

    it('follow the Pay page: R30 000 gross, age 35 gives taxable R360 000 and marginal 26%', () => {
      const { toolbox } = setup();
      expect(toolbox.homeLoanInputs().grossMonthly).toBe(30_000);
      expect(toolbox.twoPotInputs()).toMatchObject({
        taxableIncomeAnnual: 360_000,
        age: 35,
        medicalMembers: 0,
      });
      expect(toolbox.investmentInputs()).toMatchObject({ marginalRatePercent: 26, age: 35 });
    });

    it('start every tool as the untouched example', () => {
      const { toolbox } = setup();
      expect(toolbox.emergencyFundIsExample()).toBe(true);
      expect(toolbox.homeLoanIsExample()).toBe(true);
      expect(toolbox.twoPotIsExample()).toBe(true);
      expect(toolbox.investmentIsExample()).toBe(true);
    });

    it('are 0 for the rate fields when the rates are unavailable', () => {
      TestBed.configureTestingModule({
        providers: provideTestData({
          today: TODAY_PINNED,
          rates: { fileName: 'rates.json', data: { broken: true } },
        }),
      });
      const toolbox = TestBed.inject(ToolboxStore);
      expect(toolbox.prime()).toBeNull();
      expect(toolbox.emergencyFundInputs().savingsRatePercent).toBe(0);
      expect(toolbox.homeLoanInputs().ratePercent).toBe(0);
      expect(toolbox.twoPotInputs()).toMatchObject({ realGrowthPercent: 0, inflationPercent: 0 });
      expect(toolbox.investmentInputs().returnPercent).toBe(0);
      // and the pages are told so
      const loan = toolbox.homeLoanEstimate();
      expect(loan?.ok && loan.warnings).toContain('rate-unavailable');
      const investment = toolbox.investmentEstimate();
      expect(investment?.ok && investment.warnings).toContain('rates-unavailable');
    });
  });

  describe('following the Pay page', () => {
    it('moves the untouched Pay-following fields when the Pay inputs change', () => {
      const { toolbox, salary } = setup();
      salary.update({ amount: 40_000, age: 50, medicalMembers: 2 });
      expect(toolbox.homeLoanInputs().grossMonthly).toBe(40_000);
      // 40 000 × 12 = 480 000 sits in the 31% bracket (383 100 to 530 200)
      expect(toolbox.twoPotInputs()).toMatchObject({
        taxableIncomeAnnual: 480_000,
        age: 50,
        medicalMembers: 2,
      });
      expect(toolbox.investmentInputs()).toMatchObject({ marginalRatePercent: 31, age: 50 });
    });

    it('stops following a field once it is overridden, and only that field', () => {
      const { toolbox, salary } = setup();
      toolbox.updateTwoPot({ taxableIncomeAnnual: 200_000 });
      salary.update({ amount: 40_000, age: 50 });
      expect(toolbox.twoPotInputs().taxableIncomeAnnual).toBe(200_000);
      expect(toolbox.twoPotInputs().age).toBe(50);
      expect(toolbox.twoPotIsExample()).toBe(false);

      toolbox.updateHomeLoan({ grossMonthly: 55_000 });
      salary.update({ amount: 60_000 });
      expect(toolbox.homeLoanInputs().grossMonthly).toBe(55_000);

      toolbox.updateInvestment({ marginalRatePercent: 18 });
      salary.update({ age: 61 });
      expect(toolbox.investmentInputs()).toMatchObject({ marginalRatePercent: 18, age: 61 });
    });

    it('does not pin a field when the typed value is rejected', () => {
      const { toolbox, salary } = setup();
      toolbox.updateHomeLoan({ grossMonthly: Number.NaN });
      toolbox.updateTwoPot({ age: Number.NaN });
      salary.update({ amount: 45_000, age: 44 });
      expect(toolbox.homeLoanInputs().grossMonthly).toBe(45_000);
      expect(toolbox.twoPotInputs().age).toBe(44);
      expect(toolbox.homeLoanIsExample()).toBe(true);
    });

    it('goes back to following after a reset', () => {
      const { toolbox, salary } = setup();
      toolbox.updateHomeLoan({ grossMonthly: 55_000, deposit: 10_000 });
      toolbox.resetHomeLoan();
      salary.update({ amount: 42_000 });
      expect(toolbox.homeLoanInputs().grossMonthly).toBe(42_000);
      expect(toolbox.homeLoanInputs().deposit).toBe(0);
      expect(toolbox.homeLoanIsExample()).toBe(true);
    });

    it('follows the Pay page, not the Budget, when the Budget has its own income', () => {
      const { toolbox, plan } = setup();
      plan.updateBudgetIncome({ amount: 99_000 });
      expect(toolbox.homeLoanInputs().grossMonthly).toBe(30_000);
    });
  });

  describe('updates', () => {
    it('sanitise: clamp, round and reject like the other pages', () => {
      const { toolbox } = setup();
      toolbox.updateEmergencyFund({
        targetMonths: 40,
        monthlyExpenses: -5,
        savingsRatePercent: 50,
      });
      expect(toolbox.emergencyFundInputs()).toMatchObject({
        targetMonths: 12,
        monthlyExpenses: 15_000,
        savingsRatePercent: 15,
      });
      toolbox.updateHomeLoan({ termYears: 99, mode: 'price' });
      expect(toolbox.homeLoanInputs()).toMatchObject({ termYears: 30, mode: 'price' });
      toolbox.updateTwoPot({ yearsToRetirement: 12.4 });
      expect(toolbox.twoPotInputs().yearsToRetirement).toBe(12);
    });

    it('keeps the dividend share inside what interest leaves', () => {
      const { toolbox } = setup();
      toolbox.updateInvestment({ interestPercent: 90 });
      expect(toolbox.investmentInputs()).toMatchObject({
        interestPercent: 90,
        dividendPercent: 10,
      });
      toolbox.updateInvestment({ dividendPercent: 50 });
      expect(toolbox.investmentInputs().dividendPercent).toBe(10);
    });

    it('resets one tool without touching the others', () => {
      const { toolbox } = setup();
      toolbox.updateEmergencyFund({ monthlyExpenses: 20_000 });
      toolbox.updateInvestment({ years: 25 });
      toolbox.resetEmergencyFund();
      expect(toolbox.emergencyFundIsExample()).toBe(true);
      expect(toolbox.emergencyFundInputs().monthlyExpenses).toBe(15_000);
      expect(toolbox.investmentInputs().years).toBe(25);
      toolbox.resetInvestment();
      expect(toolbox.investmentIsExample()).toBe(true);
      toolbox.updateTwoPot({ withdrawal: 30_000 });
      toolbox.resetTwoPot();
      expect(toolbox.twoPotInputs().withdrawal).toBe(20_000);
    });
  });

  describe('estimates', () => {
    it('emergency fund: three months of R15 000 saved at R2 000 a month', () => {
      const { toolbox } = setup();
      const estimate = toolbox.emergencyFundEstimate();
      expect(estimate.ok && estimate.result.target).toBe(45_000);
      expect(estimate.ok && estimate.result.monthsToGoal).toBe(22);
    });

    it('home loan: R30 000 gross leaves R9 000 of room and a take-home of R25 141.88', () => {
      const { toolbox } = setup();
      const estimate = toolbox.homeLoanEstimate();
      if (!estimate?.ok) throw new Error('no estimate');
      expect(estimate.result.roomForBond).toBe(9_000);
      expect(estimate.netMonthly).toBeCloseTo(25_141.88, 2);
      // prime 10.75% over 20 years: 9 000 × 98.49995 = 886 499.54
      expect(estimate.result.maxBond).toBeCloseTo(886_499.54, 2);
    });

    it('home loan: follows an edit to the price and the mode', () => {
      const { toolbox } = setup();
      toolbox.updateHomeLoan({ mode: 'price', purchasePrice: 1_000_000, ratePercent: 10.75 });
      const estimate = toolbox.homeLoanEstimate();
      if (!estimate?.ok) throw new Error('no estimate');
      expect(estimate.result.repayment).toBeCloseTo(10_152.29, 2);
      expect(estimate.result.repaymentShareOfNet).toBeCloseTo(0.4038, 4);
      expect(estimate.warnings).toEqual(['over-cap']);
    });

    it('two-pot: R20 000 on top of R360 000 stays in the 26% bracket', () => {
      const { toolbox } = setup();
      const estimate = toolbox.twoPotEstimate();
      if (!estimate?.ok || !estimate.result.accepted) throw new Error('no estimate');
      expect(estimate.result.tax).toBeCloseTo(5_200, 6);
      toolbox.updateTwoPot({ withdrawal: 1_000 });
      const below = toolbox.twoPotEstimate();
      expect(below?.ok && below.result.accepted).toBe(false);
    });

    it('investment: the example is capped by nothing and TFSA wins', () => {
      const { toolbox } = setup();
      const estimate = toolbox.investmentEstimate();
      if (!estimate?.ok) throw new Error('no estimate');
      expect(estimate.result.advantage).toBeGreaterThan(0);
      expect(estimate.warnings).toEqual([]);
    });

    it('recomputes when the Pay inputs change', () => {
      const { toolbox, salary } = setup();
      const before = toolbox.twoPotEstimate();
      salary.update({ amount: 80_000 });
      const after = toolbox.twoPotEstimate();
      const taxOf = (e: typeof before) => (e?.ok && e.result.accepted ? e.result.tax : null);
      expect(taxOf(after)).not.toBe(taxOf(before));
    });

    it('has no home loan, two-pot or investment estimate without tax data', () => {
      TestBed.configureTestingModule({
        providers: provideTestData({ taxYears: [], today: TODAY_PINNED }),
      });
      const toolbox = TestBed.inject(ToolboxStore);
      expect(toolbox.homeLoanEstimate()).toBeNull();
      expect(toolbox.twoPotEstimate()).toBeNull();
      expect(toolbox.investmentEstimate()).toBeNull();
      // the emergency fund needs no tax data
      expect(toolbox.emergencyFundEstimate().ok).toBe(true);
    });
  });

  describe('budgetNeeds', () => {
    it('is the Budget needs a month: 50% of the R25 141.88 take-home in the example', () => {
      const { toolbox } = setup();
      expect(toolbox.budgetNeeds()).toBeCloseTo(25_141.88 * 0.5, 2);
    });

    it('is null without a Budget estimate', () => {
      TestBed.configureTestingModule({
        providers: provideTestData({ taxYears: [], today: TODAY_PINNED }),
      });
      expect(TestBed.inject(ToolboxStore).budgetNeeds()).toBeNull();
    });

    it('follows the Budget lines', () => {
      const { toolbox, plan } = setup();
      plan.setBudgetAmount('housing', 9_000);
      const needs = toolbox.budgetNeeds();
      expect(needs).not.toBeNull();
      expect(needs).not.toBeCloseTo(25_141.88 * 0.5, 2);
    });
  });

  it('touches no storage', () => {
    const calls = [
      vi.spyOn(Storage.prototype, 'getItem'),
      vi.spyOn(Storage.prototype, 'setItem'),
      vi.spyOn(Storage.prototype, 'removeItem'),
      vi.spyOn(Storage.prototype, 'clear'),
    ];
    const { toolbox } = setup();
    toolbox.updateEmergencyFund({ monthlyExpenses: 12_000 });
    toolbox.updateHomeLoan({ deposit: 50_000 });
    toolbox.updateTwoPot({ withdrawal: 9_000 });
    toolbox.updateInvestment({ lumpSum: 10_000 });
    toolbox.emergencyFundEstimate();
    toolbox.homeLoanEstimate();
    toolbox.twoPotEstimate();
    toolbox.investmentEstimate();
    for (const spy of calls) expect(spy).not.toHaveBeenCalled();
  });
});
