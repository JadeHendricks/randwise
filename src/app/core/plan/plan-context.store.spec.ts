import { TestBed } from '@angular/core/testing';
import { makeRates, provideTestData } from '../../testing/tax-data-fixtures';
import { TODAY } from '../data/data-source';
import { SalaryInputsStore } from '../salary/salary-inputs.store';
import { PlanContextStore } from './plan-context.store';

// Pinned so the bundled 2027 file is the tax year in use whatever day the specs run.
const TODAY_PINNED = new Date(2026, 9, 22);

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

    it.each(['retire', 'budget', 'journey'] as const)(
      'returns false for %s and sends nothing',
      (id) => {
        const { plan } = setup();
        expect(plan.sendFromSalary(id)).toBe(false);
        expect(plan.raHandoff()).toBeNull();
        expect(plan.raFrom()).toBeNull();
      },
    );

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
