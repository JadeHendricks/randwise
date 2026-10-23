import { TestBed } from '@angular/core/testing';
import { makeRates, provideTestData } from '../../testing/tax-data-fixtures';
import { TODAY } from '../data/data-source';
import { SalaryInputsStore } from '../salary/salary-inputs.store';
import { PlanContextStore } from './plan-context.store';

// Pinned so the bundled 2027 file is the tax year in use whatever day the specs run.
const TODAY_PINNED = new Date(2026, 9, 22);

/** Nothing was sent to any calculator. */
function expectNothingSent(plan: PlanContextStore) {
  expect(plan.raHandoff()).toBeNull();
  expect(plan.retireHandoff()).toBeNull();
  expect(plan.budgetHandoff()).toBeNull();
  expect(plan.journeyHandoff()).toBeNull();
}

function setup() {
  TestBed.configureTestingModule({
    providers: [{ provide: TODAY, useValue: () => new Date(TODAY_PINNED) }],
  });
  return { plan: TestBed.inject(PlanContextStore), salary: TestBed.inject(SalaryInputsStore) };
}

describe('PlanContextStore', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('profile', () => {
    it('mirrors the default Salary', () => {
      const { plan } = setup();
      expect(plan.profile()).toEqual({
        age: 35,
        grossMonthly: 30_000,
        netMonthly: 25_141.88,
        medicalMembers: 0,
        employeeRetirementMonthly: 0,
        employerRetirementMonthly: 0,
        otherDeductionsMonthly: 0,
      });
    });

    it('works a take-home amount back to a gross', () => {
      const { plan, salary } = setup();
      salary.update({ basis: 'net', amount: 25_141.88 });
      expect(plan.profile().grossMonthly).toBe(30_000);
    });
  });

  describe('ra while following Salary', () => {
    it('follows the Salary profile live', () => {
      const { plan, salary } = setup();
      expect(plan.ra().grossMonthly).toBe(30_000);
      salary.update({ amount: 40_000 });
      expect(plan.ra().grossMonthly).toBe(40_000);
      expect(plan.raFrom()).toBeNull();
      expect(plan.raCanUndo()).toBe(false);
    });
  });

  describe('sendFromSalary', () => {
    it('sends to RA, marks the source and snapshots the figures', () => {
      const { plan, salary } = setup();
      expect(plan.sendFromSalary('ra')).toBe(true);
      expect(plan.raFrom()).toBe('salary');
      expect(plan.raHandoff()?.source).toBe('salary');
      expect(plan.raCanUndo()).toBe(true);
      salary.update({ amount: 60_000 });
      expect(plan.ra().grossMonthly).toBe(30_000);
    });

    it('sends the Salary figures to Retire at 55 and leaves RA alone', () => {
      const { plan, salary } = setup();
      salary.update({ amount: 40_000 });
      expect(plan.sendFromSalary('retire')).toBe(true);
      expect(plan.retireFrom()).toBe('salary');
      expect(plan.retire().grossMonthly).toBe(40_000);
      expect(plan.retireCanUndo()).toBe(true);
      expect(plan.raHandoff()).toBeNull();
    });

    it('resets local salary edits on every new send, twice in a row', () => {
      const { plan, salary } = setup();
      salary.update({ amount: 40_000 });
      plan.sendFromSalary('ra');
      plan.updateRa({ grossMonthly: 55_000 });
      expect(plan.ra().grossMonthly).toBe(55_000);
      plan.sendFromSalary('ra');
      expect(plan.ra().grossMonthly).toBe(40_000);
      plan.updateRa({ grossMonthly: 56_000 });
      plan.sendFromSalary('ra');
      expect(plan.ra().grossMonthly).toBe(40_000);
    });

    it('keeps RA plan edits across a send', () => {
      const { plan } = setup();
      plan.updateRa({ contributionMonthly: 3_000 });
      plan.sendFromSalary('ra');
      expect(plan.ra().contributionMonthly).toBe(3_000);
      expect(plan.raIsExample()).toBe(false);
    });
  });

  describe('sendFromRa', () => {
    it('sends the salary side and the contribution plan to Retire at 55', () => {
      const { plan } = setup();
      plan.updateRa({
        grossMonthly: 50_000,
        age: 40,
        contributionMonthly: 3_000,
        escalationPercent: 6,
        startingBalance: 100_000,
        returnPercent: 8,
        inflationPercent: 5,
        retirementAge: 60,
      });
      expect(plan.sendFromRa('retire')).toBe(true);
      expect(plan.retireFrom()).toBe('ra');
      expect(plan.retire()).toMatchObject({
        grossMonthly: 50_000,
        age: 40,
        contributionMonthly: 3_000,
        escalationPercent: 6,
        startingBalance: 100_000,
        returnPercent: 8,
        inflationPercent: 5,
        retirementAge: 60,
        // Not carried by the RA, so the Retire defaults stay.
        goalNetMonthly: 50_000,
        drawdownPercent: 5,
      });
      expect(plan.raHandoff()).toBeNull();
    });

    it('returns false for its own id and sends nothing', () => {
      const { plan } = setup();
      expect(plan.sendFromRa('ra')).toBe(false);
      expectNothingSent(plan);
    });
  });

  describe('sendFromRetire', () => {
    it('sends the solved contribution rounded to the cent, with the plan figures', () => {
      const { plan } = setup();
      plan.updateRetire({ startingBalance: 0, retirementAge: 55 });
      expect(plan.sendFromRetire('ra')).toBe(true);
      expect(plan.raFrom()).toBe('retire');
      expect(plan.ra().contributionMonthly).toBe(46_864.26);
      expect(plan.ra()).toMatchObject({
        grossMonthly: 30_000,
        age: 35,
        escalationPercent: 5,
        startingBalance: 0,
        returnPercent: 9.5,
        inflationPercent: 4.5,
        retirementAge: 55,
      });
      expect(plan.raCanUndo()).toBe(true);
      expect(plan.retireHandoff()).toBeNull();
    });

    it('sends the current contribution when the figures fail', () => {
      const { plan } = setup();
      plan.updateRetire({ drawdownPercent: 2.4, contributionMonthly: 2_500 });
      expect(plan.retireOutputs()).toBeNull();
      expect(plan.sendFromRetire('ra')).toBe(true);
      expect(plan.ra().contributionMonthly).toBe(2_500);
    });

    it('returns false for its own id and sends nothing', () => {
      const { plan } = setup();
      expect(plan.sendFromRetire('retire')).toBe(false);
      expectNothingSent(plan);
    });
  });

  describe('undoRa', () => {
    it('restores the exact pre-handoff local values and clears the chip', () => {
      const { plan } = setup();
      plan.updateRa({ grossMonthly: 50_000, age: 45 });
      plan.sendFromSalary('ra');
      expect(plan.ra().grossMonthly).toBe(30_000);
      expect(plan.ra().age).toBe(35);

      plan.undoRa();
      expect(plan.ra().grossMonthly).toBe(50_000);
      expect(plan.ra().age).toBe(45);
      expect(plan.raFrom()).toBeNull();
      expect(plan.raHandoff()).toBeNull();
      expect(plan.raCanUndo()).toBe(false);
    });

    it('is a no-op the second time', () => {
      const { plan } = setup();
      plan.updateRa({ grossMonthly: 50_000 });
      plan.sendFromSalary('ra');
      plan.undoRa();
      plan.undoRa();
      expect(plan.ra().grossMonthly).toBe(50_000);
      expect(plan.raFrom()).toBeNull();
    });

    it('does nothing when there was no handoff', () => {
      const { plan } = setup();
      plan.updateRa({ grossMonthly: 50_000 });
      plan.undoRa();
      expect(plan.ra().grossMonthly).toBe(50_000);
    });

    it('returns to following Salary when the user was following before the send', () => {
      const { plan, salary } = setup();
      plan.sendFromSalary('ra');
      plan.undoRa();
      salary.update({ amount: 45_000 });
      expect(plan.ra().grossMonthly).toBe(45_000);
    });
  });

  describe('raIsExample', () => {
    it('is true by default, false after any edit and true again after a reset', () => {
      const { plan } = setup();
      expect(plan.raIsExample()).toBe(true);
      plan.updateRa({ grossMonthly: 31_000 });
      expect(plan.raIsExample()).toBe(false);
      plan.resetRa();
      expect(plan.raIsExample()).toBe(true);
      expect(plan.ra().grossMonthly).toBe(30_000);
      plan.updateRa({ returnPercent: 7 });
      expect(plan.raIsExample()).toBe(false);
    });

    it('is false while figures have been sent, and resetRa clears the handoff', () => {
      const { plan } = setup();
      plan.sendFromSalary('ra');
      expect(plan.raIsExample()).toBe(false);
      plan.resetRa();
      expect(plan.raIsExample()).toBe(true);
      expect(plan.raHandoff()).toBeNull();
      expect(plan.raFrom()).toBeNull();
    });
  });

  describe('defaults from the rates', () => {
    it('uses return 9.5 and inflation 4.5 on the bundled data', () => {
      const { plan } = setup();
      expect(plan.ra()).toMatchObject({
        contributionMonthly: 2_000,
        escalationPercent: 5,
        startingBalance: 0,
        returnPercent: 9.5,
        inflationPercent: 4.5,
        retirementAge: 55,
      });
    });

    it('follows CPI when the rates change', () => {
      const base = makeRates();
      const rates = makeRates({
        rates: { ...base.rates, cpi: { ...base.rates.cpi, valuePercent: 6 } },
      });
      TestBed.configureTestingModule({
        providers: provideTestData({
          today: '2026-10-22',
          rates: { fileName: 'rates.json', data: rates },
        }),
      });
      const plan = TestBed.inject(PlanContextStore);
      expect(plan.ra().returnPercent).toBe(11);
      expect(plan.ra().inflationPercent).toBe(6);
    });
  });

  describe('RA estimate and outputs', () => {
    it('publishes headroom and tax saving for the default example', () => {
      const { plan } = setup();
      const { ra } = plan.outputs();
      expect(ra?.headroomAnnual).toBeCloseTo(99_000, 2);
      expect(ra?.headroomMonthly).toBeCloseTo(8_250, 2);
      expect(ra?.taxSavingAnnual).toBeCloseTo(6_240, 2);
      expect(plan.raRules()?.earliestRetirementAge).toBe(55);
    });

    it('follows the Salary profile while not overridden', () => {
      const { plan, salary } = setup();
      salary.update({ amount: 40_000 });
      // 0.275 x 480 000 = 132 000; 24 000 at 31% = 7 440.
      expect(plan.outputs().ra?.headroomAnnual).toBeCloseTo(132_000, 2);
      expect(plan.outputs().ra?.taxSavingAnnual).toBeCloseTo(7_440, 2);
    });

    it('has no RA outputs when the estimate fails', () => {
      const { plan } = setup();
      plan.updateRa({ grossMonthly: Number.MAX_VALUE });
      expect(plan.raEstimate()?.ok).toBe(false);
      expect(plan.outputs()).toEqual({ ra: null });
    });

    it('has no estimate, rules or outputs without tax data', () => {
      TestBed.configureTestingModule({
        providers: provideTestData({ taxYears: [], today: TODAY_PINNED }),
      });
      const plan = TestBed.inject(PlanContextStore);
      expect(plan.raRules()).toBeNull();
      expect(plan.raEstimate()).toBeNull();
      expect(plan.outputs()).toEqual({ ra: null });
    });
  });

  describe('retire at 55', () => {
    it('starts as the example with the defaults from the rates', () => {
      const { plan } = setup();
      expect(plan.retire()).toMatchObject({
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
        grossMonthly: 30_000,
        age: 35,
      });
      expect(plan.retireIsExample()).toBe(true);
      expect(plan.retireFrom()).toBeNull();
      expect(plan.retireCanUndo()).toBe(false);
      expect(plan.retireRules()?.earliestRetirementAge).toBe(55);
    });

    it('follows CPI when the rates change: 6 gives return 11 and retirement return 9', () => {
      const base = makeRates();
      const rates = makeRates({
        rates: { ...base.rates, cpi: { ...base.rates.cpi, valuePercent: 6 } },
      });
      TestBed.configureTestingModule({
        providers: provideTestData({
          today: '2026-10-22',
          rates: { fileName: 'rates.json', data: rates },
        }),
      });
      const plan = TestBed.inject(PlanContextStore);
      expect(plan.retire().inflationPercent).toBe(6);
      expect(plan.retire().returnPercent).toBe(11);
      expect(plan.retire().retirementReturnPercent).toBe(9);
    });

    it('follows the Salary profile live until overridden', () => {
      const { plan, salary } = setup();
      salary.update({ amount: 40_000 });
      expect(plan.retire().grossMonthly).toBe(40_000);
      plan.updateRetire({ grossMonthly: 55_000 });
      salary.update({ amount: 45_000 });
      expect(plan.retire().grossMonthly).toBe(55_000);
    });

    it('keeps its own slice apart from the RA slice', () => {
      const { plan } = setup();
      plan.updateRetire({ contributionMonthly: 3_000, grossMonthly: 50_000 });
      expect(plan.ra().contributionMonthly).toBe(2_000);
      expect(plan.ra().grossMonthly).toBe(30_000);
      expect(plan.raIsExample()).toBe(true);
      plan.updateRa({ contributionMonthly: 4_000 });
      expect(plan.retire().contributionMonthly).toBe(3_000);
    });

    it('publishes the required contribution and how funded the plan is (G10)', () => {
      const { plan } = setup();
      const outputs = plan.retireOutputs();
      expect(outputs?.requiredMonthly).toBeCloseTo(46_864.264013, 2);
      expect(outputs?.fundedPercent).toBeCloseTo(4.267644, 4);
      expect(outputs?.ringPercent).toBeCloseTo(4.267644, 4);
      expect(outputs?.retirementAge).toBe(55);
      expect(outputs?.goalNetMonthly).toBe(50_000);
    });

    it('does not change the RA outputs shape', () => {
      const { plan } = setup();
      expect(Object.keys(plan.outputs())).toEqual(['ra']);
    });

    it('has no outputs when the figures fail, but still has an estimate', () => {
      const { plan } = setup();
      plan.updateRetire({ drawdownPercent: 2.4 });
      expect(plan.retireEstimate()?.ok).toBe(false);
      expect(plan.retireOutputs()).toBeNull();
    });

    it('has no rules, estimate or outputs without tax data', () => {
      TestBed.configureTestingModule({
        providers: provideTestData({ taxYears: [], today: TODAY_PINNED }),
      });
      const plan = TestBed.inject(PlanContextStore);
      expect(plan.retireRules()).toBeNull();
      expect(plan.retireEstimate()).toBeNull();
      expect(plan.retireOutputs()).toBeNull();
    });

    it('flags the example as edited after a change and back after a reset', () => {
      const { plan } = setup();
      plan.updateRetire({ goalNetMonthly: 20_000 });
      expect(plan.retireIsExample()).toBe(false);
      expect(plan.retireOutputs()?.requiredMonthly).toBeCloseTo(16_049.233515, 2);
      plan.resetRetire();
      expect(plan.retireIsExample()).toBe(true);
      expect(plan.retire().goalNetMonthly).toBe(50_000);
      plan.updateRetire({ takeLumpSum: true });
      expect(plan.retireIsExample()).toBe(false);
    });

    it('takes a handoff, marks the source and Undo restores the earlier local values', () => {
      const { plan } = setup();
      plan.updateRetire({ grossMonthly: 50_000, age: 45 });
      plan.send('retire', 'salary', {
        grossMonthly: 30_000,
        age: 40,
        medicalMembers: 0,
        employeeRetirementMonthly: 0,
        employerRetirementMonthly: 0,
      });
      expect(plan.retireFrom()).toBe('salary');
      expect(plan.retireCanUndo()).toBe(true);
      expect(plan.retireIsExample()).toBe(false);
      expect(plan.retire().age).toBe(40);

      plan.undoRetire();
      expect(plan.retire().grossMonthly).toBe(50_000);
      expect(plan.retire().age).toBe(45);
      expect(plan.retireFrom()).toBeNull();
      expect(plan.retireHandoff()).toBeNull();
      expect(plan.retireCanUndo()).toBe(false);

      plan.undoRetire();
      expect(plan.retire().age).toBe(45);
    });

    it('applies plan values carried by a handoff', () => {
      const { plan } = setup();
      plan.send('retire', 'salary', {
        grossMonthly: 30_000,
        age: 35,
        medicalMembers: 0,
        employeeRetirementMonthly: 0,
        employerRetirementMonthly: 0,
        contributionMonthly: 3_000,
        startingBalance: 100_000,
      });
      expect(plan.retire().contributionMonthly).toBe(3_000);
      expect(plan.retire().startingBalance).toBe(100_000);
      plan.undoRetire();
      expect(plan.retire().contributionMonthly).toBe(2_000);
      expect(plan.retire().startingBalance).toBe(0);
      expect(plan.retireIsExample()).toBe(true);
    });

    it('resetRetire clears a handoff and its chip', () => {
      const { plan } = setup();
      plan.send('retire', 'salary', {
        grossMonthly: 30_000,
        age: 40,
        medicalMembers: 0,
        employeeRetirementMonthly: 0,
        employerRetirementMonthly: 0,
      });
      plan.resetRetire();
      expect(plan.retireHandoff()).toBeNull();
      expect(plan.retireFrom()).toBeNull();
      expect(plan.retire().age).toBe(35);
    });

    it('touches no storage', () => {
      const calls = [
        vi.spyOn(Storage.prototype, 'getItem'),
        vi.spyOn(Storage.prototype, 'setItem'),
        vi.spyOn(Storage.prototype, 'removeItem'),
        vi.spyOn(Storage.prototype, 'clear'),
      ];
      const { plan } = setup();
      plan.updateRetire({ goalNetMonthly: 20_000 });
      plan.undoRetire();
      plan.resetRetire();
      for (const spy of calls) expect(spy).not.toHaveBeenCalled();
    });
  });
  describe('budget', () => {
    const salaryValues = {
      grossMonthly: 50_000,
      age: 40,
      medicalMembers: 0,
      employeeRetirementMonthly: 0,
      employerRetirementMonthly: 0,
    };

    function lines(plan: PlanContextStore) {
      const estimate = plan.budgetEstimate();
      if (!estimate?.ok) throw new Error('no budget estimate');
      return estimate.categories;
    }
    const amountOf = (plan: PlanContextStore, id: string) =>
      lines(plan).find((line) => line.id === id)?.amount;

    it('starts as the example: Salary income, 50/30/20 of R25 141,88', () => {
      const { plan } = setup();
      expect(plan.budgetIsExample()).toBe(true);
      expect(plan.budgetFrom()).toBeNull();
      expect(plan.budgetCanUndo()).toBe(false);
      expect(plan.budgetPresetId()).toBe('50-30-20');
      expect(plan.budgetSettings()).toEqual({
        emergencyMonths: 3,
        emergencySaved: 0,
        tfsaLifetimeUsed: 0,
      });
      expect(plan.tfsaRules()).toEqual({
        annualLimit: 46_000,
        lifetimeLimit: 500_000,
        penaltyRate: 0.4,
      });
      const outputs = plan.budgetOutputs();
      expect(outputs?.netMonthly).toBeCloseTo(25_141.88, 2);
      expect(outputs?.status).toBe('balanced');
      expect(outputs?.groupPercents.needs).toBeCloseTo(50, 6);
      expect(outputs?.groupPercents.wants).toBeCloseTo(30, 6);
      expect(outputs?.groupPercents.savings).toBeCloseTo(20, 6);
      // 25 141.88 x 0.2 = 5 028.376 for savings; RA takes 0.3 (1 508.5128), emergency 0.2.
      expect(outputs?.raMonthly).toBeCloseTo(1_508.5128, 4);
      expect(outputs?.tfsaMonthly).toBeCloseTo(1_508.5128, 4);
      expect(outputs?.emergencyMonthly).toBeCloseTo(1_005.6752, 4);
    });

    it('follows the Salary inputs live while nothing is edited', () => {
      const { plan, salary } = setup();
      expect(plan.budgetIncome().amount).toBe(30_000);
      salary.update({ amount: 40_000 });
      expect(plan.budgetIncome().amount).toBe(40_000);
      // 480 000: 79 998 + 0.31 x 96 900 = 110 037 - 17 820 = 92 217 -> 7 684.75; 40 000 - 7 684.75 - 177.12.
      expect(plan.budgetOutputs()?.netMonthly).toBeCloseTo(32_138.13, 2);
      expect(plan.budgetIsExample()).toBe(true);
      expect(amountOf(plan, 'housing')).toBeCloseTo(32_138.13 * 0.5 * 0.4, 2);
    });

    it('keeps its own income apart from Salary once edited', () => {
      const { plan, salary } = setup();
      plan.updateBudgetIncome({ amount: 40_000 });
      salary.update({ amount: 60_000 });
      expect(plan.budgetIncome().amount).toBe(40_000);
      expect(plan.budgetIsExample()).toBe(false);
      expect(salary.inputs().amount).toBe(60_000);
    });

    it('turns the example into saved lines on the first edit', () => {
      const { plan, salary } = setup();
      plan.setBudgetAmount('housing', 6_000);
      expect(plan.budgetIsExample()).toBe(false);
      expect(plan.budgetPresetId()).toBe('custom');
      expect(amountOf(plan, 'housing')).toBe(6_000);
      // Saved lines no longer move with the Salary take-home.
      const groceries = amountOf(plan, 'groceries');
      salary.update({ amount: 40_000 });
      expect(amountOf(plan, 'groceries')).toBe(groceries);
      expect(plan.budgetIsExample()).toBe(false);
    });

    it('sets a line from a percent of take-home', () => {
      const { plan } = setup();
      plan.setBudgetPercent('housing', 10);
      // 10% of 25 141.88 = 2 514.188
      expect(amountOf(plan, 'housing')).toBeCloseTo(2_514.188, 6);
    });

    it('applies a preset, keeping the proportions inside each group (engine B4)', () => {
      const { plan } = setup();
      plan.applyBudgetPreset('60-20-20');
      expect(plan.budgetPresetId()).toBe('60-20-20');
      // 25 141.88 x 0.6 x 0.4 = 6 034.0512
      expect(amountOf(plan, 'housing')).toBeCloseTo(6_034.0512, 4);
      expect(amountOf(plan, 'wants')).toBeCloseTo(5_028.376, 4);
      expect(plan.budgetOutputs()?.status).toBe('balanced');
    });

    it('adds, renames and removes a custom line and keeps the other ids', () => {
      const { plan } = setup();
      const builtIn = lines(plan).map((line) => line.id);
      plan.addBudgetLine('needs');
      plan.addBudgetLine('wants');
      expect(lines(plan).map((line) => line.id)).toEqual([...builtIn, 'custom-1', 'custom-2']);
      plan.renameBudgetLine('custom-1', '  Pet food ');
      expect(lines(plan).find((line) => line.id === 'custom-1')?.name).toBe('Pet food');
      plan.renameBudgetLine('housing', 'Rent');
      expect(lines(plan).find((line) => line.id === 'housing')?.name).toBe('Housing');
      plan.removeBudgetLine('custom-1');
      plan.removeBudgetLine('housing');
      expect(lines(plan).map((line) => line.id)).toEqual([...builtIn, 'custom-2']);
      plan.addBudgetLine('needs');
      expect(lines(plan).at(-1)?.id).toBe('custom-3');
    });

    it('changes the settings and flags the budget as edited', () => {
      const { plan } = setup();
      plan.updateBudgetSettings({ emergencyMonths: 6 });
      expect(plan.budgetSettings().emergencyMonths).toBe(6);
      expect(plan.budgetIsExample()).toBe(false);
    });

    it('switches basis and period without changing the person', () => {
      const { plan } = setup();
      plan.switchBudgetBasis('net');
      expect(plan.budgetIncome()).toMatchObject({ basis: 'net', amount: 25_141.88 });
      expect(plan.budgetOutputs()?.netMonthly).toBeCloseTo(25_141.88, 2);
      plan.setBudgetPeriod('annual');
      expect(plan.budgetIncome()).toMatchObject({ period: 'annual', amount: 301_702.56 });
      expect(plan.budgetOutputs()?.netMonthly).toBeCloseTo(25_141.88, 2);
    });

    it('takes a handoff: sets the income and the chip, and Undo restores the earlier state', () => {
      const { plan, salary } = setup();
      plan.setBudgetAmount('housing', 6_000);
      plan.send('budget', 'salary', salaryValues);
      expect(plan.budgetFrom()).toBe('salary');
      expect(plan.budgetCanUndo()).toBe(true);
      expect(plan.budgetIsExample()).toBe(false);
      expect(plan.budgetIncome()).toMatchObject({ basis: 'gross', amount: 50_000, age: 40 });
      // The sent income is a snapshot: Salary changes no longer move it.
      salary.update({ amount: 45_000 });
      expect(plan.budgetIncome().amount).toBe(50_000);

      plan.undoBudget();
      expect(plan.budgetFrom()).toBeNull();
      expect(plan.budgetHandoff()).toBeNull();
      expect(plan.budgetCanUndo()).toBe(false);
      expect(plan.budgetIncome().amount).toBe(45_000);
      expect(amountOf(plan, 'housing')).toBe(6_000);

      plan.undoBudget();
      expect(amountOf(plan, 'housing')).toBe(6_000);
    });

    it('returns to the example on Undo when nothing was edited before the send', () => {
      const { plan } = setup();
      plan.send('budget', 'salary', salaryValues);
      plan.undoBudget();
      expect(plan.budgetIsExample()).toBe(true);
      expect(plan.budgetIncome().amount).toBe(30_000);
    });

    it('applies RA and TFSA amounts and TFSA contributions made, carried by a handoff', () => {
      const { plan } = setup();
      plan.send('budget', 'ra', {
        ...salaryValues,
        raMonthly: 3_000,
        tfsaMonthly: 2_000,
        tfsaLifetimeUsed: 120_000,
      });
      expect(plan.budgetOutputs()?.raMonthly).toBe(3_000);
      expect(plan.budgetOutputs()?.tfsaMonthly).toBe(2_000);
      expect(plan.budgetSettings().tfsaLifetimeUsed).toBe(120_000);
      expect(plan.budgetPresetId()).toBe('custom');
      expect(plan.budgetFrom()).toBe('ra');
      plan.undoBudget();
      expect(plan.budgetOutputs()?.raMonthly).toBeCloseTo(1_508.5128, 4);
      expect(plan.budgetSettings().tfsaLifetimeUsed).toBe(0);
      expect(plan.budgetPresetId()).toBe('50-30-20');
    });

    it('resetBudget clears the handoff, the edits and the chip', () => {
      const { plan } = setup();
      plan.setBudgetAmount('housing', 6_000);
      plan.send('budget', 'salary', salaryValues);
      plan.resetBudget();
      expect(plan.budgetIsExample()).toBe(true);
      expect(plan.budgetHandoff()).toBeNull();
      expect(plan.budgetFrom()).toBeNull();
      expect(plan.budgetIncome().amount).toBe(30_000);
    });

    it('keeps its slice apart from RA and Retire', () => {
      const { plan } = setup();
      plan.send('budget', 'salary', salaryValues);
      expect(plan.raHandoff()).toBeNull();
      expect(plan.retireHandoff()).toBeNull();
      expect(plan.ra().grossMonthly).toBe(30_000);
      expect(plan.raIsExample()).toBe(true);
    });

    it('returns false for its own id and sends nothing', () => {
      const { plan } = setup();
      expect(plan.sendFromBudget('budget')).toBe(false);
      expectNothingSent(plan);
    });

    it('has an estimate that fails, no outputs and edits that do nothing for a take-home that is too high', () => {
      const { plan } = setup();
      plan.updateBudgetIncome({ basis: 'net', amount: 5e9 });
      expect(plan.budgetEstimate()?.ok).toBe(false);
      expect(plan.budgetOutputs()).toBeNull();
      plan.setBudgetAmount('housing', 100);
      plan.addBudgetLine('needs');
      plan.applyBudgetPreset('70-20-10');
      plan.updateBudgetIncome({ basis: 'gross', amount: 30_000 });
      expect(plan.budgetIsExample()).toBe(false);
      expect(amountOf(plan, 'housing')).toBeCloseTo(25_141.88 * 0.5 * 0.4, 2);
    });

    it('has no rules, estimate or outputs without tax data', () => {
      TestBed.configureTestingModule({
        providers: provideTestData({ taxYears: [], today: TODAY_PINNED }),
      });
      const plan = TestBed.inject(PlanContextStore);
      expect(plan.tfsaRules()).toBeNull();
      expect(plan.budgetEstimate()).toBeNull();
      expect(plan.budgetOutputs()).toBeNull();
    });

    it('touches no storage', () => {
      const calls = [
        vi.spyOn(Storage.prototype, 'getItem'),
        vi.spyOn(Storage.prototype, 'setItem'),
        vi.spyOn(Storage.prototype, 'removeItem'),
        vi.spyOn(Storage.prototype, 'clear'),
      ];
      const { plan } = setup();
      plan.setBudgetAmount('housing', 6_000);
      plan.undoBudget();
      plan.resetBudget();
      for (const spy of calls) expect(spy).not.toHaveBeenCalled();
    });
  });
  describe('send matrix: every other target is live and each id refuses itself', () => {
    const RA_PLAN = {
      grossMonthly: 50_000,
      age: 40,
      contributionMonthly: 3_000,
      escalationPercent: 6,
      startingBalance: 100_000,
      returnPercent: 8,
      inflationPercent: 5,
      retirementAge: 60,
    };

    it('Salary to Budget carries the income and the other deductions', () => {
      const { plan, salary } = setup();
      salary.update({ otherDeductionsMonthly: 500 });
      expect(plan.sendFromSalary('budget')).toBe(true);
      expect(plan.budgetFrom()).toBe('salary');
      expect(plan.budgetIncome()).toMatchObject({
        basis: 'gross',
        period: 'monthly',
        amount: 30_000,
        age: 35,
        otherDeductionsMonthly: 500,
      });
    });

    it('Salary to Journey carries the salary side', () => {
      const { plan, salary } = setup();
      salary.update({ amount: 40_000 });
      expect(plan.sendFromSalary('journey')).toBe(true);
      expect(plan.journeyFrom()).toBe('salary');
      expect(plan.journey().grossMonthly).toBe(40_000);
      expect(plan.journeyBudgetContext()).toBeNull();
    });

    it('RA to Budget carries the salary side and the contribution as the RA line', () => {
      const { plan } = setup();
      plan.updateRa(RA_PLAN);
      expect(plan.sendFromRa('budget')).toBe(true);
      expect(plan.budgetFrom()).toBe('ra');
      expect(plan.budgetIncome()).toMatchObject({ amount: 50_000, age: 40 });
      expect(plan.budgetOutputs()?.raMonthly).toBe(3_000);
    });

    it('RA to Journey carries the salary side and the six RA values', () => {
      const { plan } = setup();
      plan.updateRa(RA_PLAN);
      expect(plan.sendFromRa('journey')).toBe(true);
      expect(plan.journeyFrom()).toBe('ra');
      expect(plan.journey()).toMatchObject(RA_PLAN);
      // Not carried by the RA, so the Journey defaults stay.
      expect(plan.journey()).toMatchObject({ tfsaTopUpMonthly: 1_000, refundMode: 'refund' });
    });

    it('Retire at 55 to Budget carries the solved contribution as the RA line', () => {
      const { plan } = setup();
      plan.updateRetire({ startingBalance: 0, retirementAge: 55 });
      expect(plan.sendFromRetire('budget')).toBe(true);
      expect(plan.budgetFrom()).toBe('retire');
      expect(plan.budgetOutputs()?.raMonthly).toBe(46_864.26);
    });

    it('Retire at 55 to Journey carries the solved contribution and the plan figures', () => {
      const { plan } = setup();
      plan.updateRetire({ startingBalance: 0, retirementAge: 55 });
      expect(plan.sendFromRetire('journey')).toBe(true);
      expect(plan.journeyFrom()).toBe('retire');
      expect(plan.journey()).toMatchObject({
        grossMonthly: 30_000,
        contributionMonthly: 46_864.26,
        escalationPercent: 5,
        returnPercent: 9.5,
        inflationPercent: 4.5,
        retirementAge: 55,
      });
    });

    it('Budget to RA and Retire at 55 carry the budget income and the RA line', () => {
      const { plan } = setup();
      plan.updateBudgetIncome({ amount: 50_000, age: 40 });
      // 50 000 gross -> take-home 38 747.30 -> savings 20% -> RA 30%: 38 747.30 x 0.2 x 0.3 = 2 324.838.
      expect(plan.sendFromBudget('ra')).toBe(true);
      expect(plan.raFrom()).toBe('budget');
      expect(plan.ra()).toMatchObject({
        grossMonthly: 50_000,
        age: 40,
        contributionMonthly: 2_324.84,
      });
      expect(plan.sendFromBudget('retire')).toBe(true);
      expect(plan.retireFrom()).toBe('budget');
      expect(plan.retire()).toMatchObject({ grossMonthly: 50_000, contributionMonthly: 2_324.84 });
    });

    it('Budget to Journey carries the lines, the TFSA contributions so far and a note', () => {
      const { plan } = setup();
      plan.updateBudgetSettings({ tfsaLifetimeUsed: 120_000 });
      expect(plan.sendFromBudget('journey')).toBe(true);
      expect(plan.journeyFrom()).toBe('budget');
      expect(plan.journey()).toMatchObject({
        grossMonthly: 30_000,
        contributionMonthly: 1_508.51,
        tfsaTopUpMonthly: 1_508.51,
        tfsaLifetimeUsed: 120_000,
      });
      // Emergency line: 25 141.88 x 0.2 x 0.2 = 1 005.6752.
      expect(plan.journeyBudgetContext()).toEqual({
        netMonthly: 25_141.88,
        emergencyMonthly: 1_005.68,
      });
    });

    it('Budget sends only the income when its figures fail', () => {
      const { plan } = setup();
      plan.updateBudgetIncome({ basis: 'net', amount: 5e9 });
      expect(plan.sendFromBudget('journey')).toBe(true);
      expect(plan.journeyBudgetContext()).toEqual({ netMonthly: null, emergencyMonthly: 0 });
      expect(plan.journey().contributionMonthly).toBe(2_000);
    });

    it('Journey to RA and Retire at 55 carry the salary side and the six RA values', () => {
      const { plan } = setup();
      plan.updateJourney(RA_PLAN);
      expect(plan.sendFromJourney('ra')).toBe(true);
      expect(plan.raFrom()).toBe('journey');
      expect(plan.ra()).toMatchObject(RA_PLAN);
      expect(plan.sendFromJourney('retire')).toBe(true);
      expect(plan.retireFrom()).toBe('journey');
      expect(plan.retire()).toMatchObject(RA_PLAN);
    });

    it('Journey to Budget carries the RA line, the TFSA line and the TFSA contributions so far', () => {
      const { plan } = setup();
      plan.updateJourney({ ...RA_PLAN, tfsaTopUpMonthly: 2_500, tfsaLifetimeUsed: 90_000 });
      expect(plan.sendFromJourney('budget')).toBe(true);
      expect(plan.budgetFrom()).toBe('journey');
      expect(plan.budgetIncome()).toMatchObject({ amount: 50_000, age: 40 });
      const outputs = plan.budgetOutputs();
      expect(outputs?.raMonthly).toBe(3_000);
      expect(outputs?.tfsaMonthly).toBe(2_500);
      expect(plan.budgetSettings().tfsaLifetimeUsed).toBe(90_000);
    });

    it('each id refuses itself and sends nothing', () => {
      const { plan } = setup();
      expect(plan.sendFromJourney('journey')).toBe(false);
      expect(plan.sendFromBudget('budget')).toBe(false);
      expect(plan.sendFromRa('ra')).toBe(false);
      expect(plan.sendFromRetire('retire')).toBe(false);
      expectNothingSent(plan);
    });

    it('a send to a target does not touch the other targets', () => {
      const { plan } = setup();
      plan.sendFromRa('journey');
      expect(plan.raHandoff()).toBeNull();
      expect(plan.retireHandoff()).toBeNull();
      expect(plan.budgetHandoff()).toBeNull();
    });
  });

  describe('journey', () => {
    const salaryValues = {
      grossMonthly: 50_000,
      age: 40,
      medicalMembers: 0,
      employeeRetirementMonthly: 0,
      employerRetirementMonthly: 0,
    };
    // The hand-derived three-year journey (engine J1): age 52 to 55, income and RA up 10% a year.
    const J1 = {
      age: 52,
      retirementAge: 55,
      incomeEscalationPercent: 10,
      contributionMonthly: 2_000,
      escalationPercent: 10,
      tfsaTopUpMonthly: 1_000,
      returnPercent: 0,
      tfsaReturnPercent: 0,
      inflationPercent: 0,
    };

    it('starts as the example with the defaults from the rates', () => {
      const { plan } = setup();
      expect(plan.journeyIsExample()).toBe(true);
      expect(plan.journeyFrom()).toBeNull();
      expect(plan.journeyCanUndo()).toBe(false);
      expect(plan.journeyBudgetContext()).toBeNull();
      expect(plan.journey()).toMatchObject({
        grossMonthly: 30_000,
        age: 35,
        retirementAge: 55,
        incomeEscalationPercent: 4.5,
        contributionMonthly: 2_000,
        escalationPercent: 5,
        tfsaTopUpMonthly: 1_000,
        tfsaBalance: 0,
        tfsaLifetimeUsed: 0,
        returnPercent: 9.5,
        tfsaReturnPercent: 9.5,
        inflationPercent: 4.5,
        refundMode: 'refund',
        allowOverContribution: false,
      });
      expect(plan.journeyRules()).toMatchObject({ annualLimit: 46_000, lifetimeLimit: 500_000 });
    });

    it('publishes the hand-checked outputs for the three-year journey', () => {
      const { plan } = setup();
      plan.updateJourney(J1);
      const outputs = plan.journeyOutputs();
      // 6 240 + 7 509 + 9 002.40 tax saved; TFSA 18 240 + 19 509 + 21 002.40; RA 24 000 + 26 400 + 29 040.
      expect(outputs?.taxSaved).toBeCloseTo(22_751.4, 6);
      expect(outputs?.tfsaAtRetirement).toBeCloseTo(58_751.4, 6);
      expect(outputs?.raAtRetirement).toBeCloseTo(79_440, 6);
      expect(outputs?.retirementAge).toBe(55);
      expect(outputs?.lifetimePercent).toBeCloseTo((58_751.4 / 500_000) * 100, 6);
    });

    it('follows the Salary inputs live while nothing is edited', () => {
      const { plan, salary } = setup();
      salary.update({ amount: 40_000 });
      expect(plan.journey().grossMonthly).toBe(40_000);
      expect(plan.journeyIsExample()).toBe(true);
    });

    it('keeps the salary side apart from Salary once edited', () => {
      const { plan, salary } = setup();
      plan.updateJourney({ grossMonthly: 45_000 });
      salary.update({ amount: 60_000 });
      expect(plan.journey().grossMonthly).toBe(45_000);
      expect(plan.journeyIsExample()).toBe(false);
    });

    it('sanitises edits and rejects an unknown tax-saving mode', () => {
      const { plan } = setup();
      plan.updateJourney({ retirementAge: 200, contributionMonthly: -5 });
      expect(plan.journey().retirementAge).toBe(80);
      expect(plan.journey().contributionMonthly).toBe(2_000);
      plan.updateJourney({ refundMode: 'bad' as never });
      expect(plan.journey().refundMode).toBe('refund');
    });

    it('applies a Journey handoff, records the budget it came from and Undo restores both', () => {
      const { plan } = setup();
      plan.updateJourney({ tfsaTopUpMonthly: 1_000 });
      plan.send('journey', 'budget', {
        ...salaryValues,
        contributionMonthly: 3_000,
        tfsaTopUpMonthly: 2_000,
        tfsaLifetimeUsed: 10_000,
        budgetNetMonthly: 38_747.3,
        budgetEmergencyMonthly: 1_500,
      });
      expect(plan.journeyFrom()).toBe('budget');
      expect(plan.journey()).toMatchObject({
        grossMonthly: 50_000,
        age: 40,
        contributionMonthly: 3_000,
        tfsaTopUpMonthly: 2_000,
        tfsaLifetimeUsed: 10_000,
      });
      expect(plan.journeyBudgetContext()).toEqual({
        netMonthly: 38_747.3,
        emergencyMonthly: 1_500,
      });
      expect(plan.journeyCanUndo()).toBe(true);

      plan.undoJourney();
      expect(plan.journeyFrom()).toBeNull();
      expect(plan.journeyBudgetContext()).toBeNull();
      expect(plan.journey()).toMatchObject({
        grossMonthly: 30_000,
        contributionMonthly: 2_000,
        tfsaTopUpMonthly: 1_000,
        tfsaLifetimeUsed: 0,
      });
    });

    it('drops the budget note when the figures come from somewhere else', () => {
      const { plan } = setup();
      plan.send('journey', 'budget', { ...salaryValues, budgetNetMonthly: 10_000 });
      expect(plan.journeyBudgetContext()).not.toBeNull();
      plan.send('journey', 'salary', salaryValues);
      expect(plan.journeyBudgetContext()).toBeNull();
    });

    it('resets to the example', () => {
      const { plan } = setup();
      plan.updateJourney({ contributionMonthly: 5_000 });
      plan.resetJourney();
      expect(plan.journeyIsExample()).toBe(true);
      expect(plan.journey().contributionMonthly).toBe(2_000);
    });

    it('has no rules, estimate or outputs without tax data', () => {
      TestBed.configureTestingModule({
        providers: provideTestData({ taxYears: [], today: TODAY_PINNED }),
      });
      const plan = TestBed.inject(PlanContextStore);
      expect(plan.journeyRules()).toBeNull();
      expect(plan.journeyEstimate()).toBeNull();
      expect(plan.journeyOutputs()).toBeNull();
    });

    it('touches no storage', () => {
      const calls = [
        vi.spyOn(Storage.prototype, 'getItem'),
        vi.spyOn(Storage.prototype, 'setItem'),
        vi.spyOn(Storage.prototype, 'removeItem'),
        vi.spyOn(Storage.prototype, 'clear'),
      ];
      const { plan } = setup();
      plan.updateJourney({ contributionMonthly: 3_000 });
      plan.undoJourney();
      plan.resetJourney();
      for (const spy of calls) expect(spy).not.toHaveBeenCalled();
    });
  });

  it('touches no storage and is one root instance', () => {
    const calls = [
      vi.spyOn(Storage.prototype, 'getItem'),
      vi.spyOn(Storage.prototype, 'setItem'),
      vi.spyOn(Storage.prototype, 'removeItem'),
      vi.spyOn(Storage.prototype, 'clear'),
    ];
    const { plan } = setup();
    plan.updateRa({ grossMonthly: 50_000 });
    plan.sendFromSalary('ra');
    plan.undoRa();
    plan.resetRa();
    for (const spy of calls) expect(spy).not.toHaveBeenCalled();
    expect(TestBed.inject(PlanContextStore)).toBe(plan);
  });
});
