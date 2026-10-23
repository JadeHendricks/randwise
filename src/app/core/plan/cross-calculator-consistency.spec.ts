import { TestBed } from '@angular/core/testing';

import { fixtureTaxTables } from '../../testing/tax-tables';
import { makeTaxYear, provideTestData } from '../../testing/tax-data-fixtures';
import { estimateBudget } from '../budget/estimate-budget';
import {
  type TaxTables,
  type TfsaRules,
  type RaRules,
  type JourneyRules,
  roundRand,
  raHeadroom,
  raTaxSaving,
  toJourneyRules,
  toRaRules,
  toTfsaRules,
} from '../engine';
import { estimateJourney } from '../journey/estimate-journey';
import { estimateRa } from '../ra/estimate-ra';
import { estimateSalary } from '../salary/estimate-salary';
import type { SalaryInputs } from '../salary/salary-inputs';
import { SalaryInputsStore } from '../salary/salary-inputs.store';
import { PlanContextStore } from './plan-context.store';

/**
 * The anti-drift guard (Task 14, item 2). One representative profile must yield the SAME shared
 * derived figures — net pay, PAYE, taxable income, RA headroom, RA tax saving — everywhere they
 * surface: driven straight through the engine, through each per-calculator estimator, and through
 * the one sharing seam (`PlanContextStore`). Everything is compared to the cent via `roundRand`,
 * because that is the precision the UI shows. This spec only READS outputs; it never changes engine
 * code or tax numbers.
 *
 * The profile: age 35, R30 000/month gross, medical main + 2 dependants (`medicalMembers: 3`),
 * R3 000/month existing payroll RA (`employeeRetirementMonthly: 3000`). Fixtures from
 * `tax-data-fixtures` make the figures deterministic regardless of the bundled data.
 */

// Pinned so the fixture 2027 file is the tax year in use whatever day the specs run.
const TODAY_PINNED = new Date(2026, 9, 22);

/** The one representative Salary situation every calculator starts from. */
const PROFILE: SalaryInputs = {
  basis: 'gross',
  period: 'monthly',
  amount: 30_000,
  age: 35,
  medicalMembers: 3,
  employeeRetirementMonthly: 3_000,
  employerRetirementMonthly: 0,
  otherDeductionsMonthly: 0,
};

/** The extra RA contribution the RA/Journey calculators explore, on top of the R3 000 payroll RA. */
const EXTRA_RA_MONTHLY = 2_000;

const cents = (value: number) => roundRand(value);

describe('cross-calculator number consistency', () => {
  const tables: TaxTables = fixtureTaxTables();
  const raRules: RaRules = toRaRules(makeTaxYear(2027));
  const tfsaRules: TfsaRules = toTfsaRules(makeTaxYear(2027));
  const journeyRules: JourneyRules = toJourneyRules(makeTaxYear(2027));

  // The reference figures, straight from the shared engine for the representative profile.
  const salary = estimateSalary(PROFILE, tables);
  if (!salary.ok) throw new Error('representative profile should produce a valid payslip');
  const slip = salary.payslip;
  const engineSalary = {
    grossMonthly: PROFILE.amount,
    age: PROFILE.age,
    medicalMembers: PROFILE.medicalMembers,
    employeeRetirementMonthly: PROFILE.employeeRetirementMonthly,
    employerRetirementMonthly: PROFILE.employerRetirementMonthly,
  };
  const headroom = raHeadroom(engineSalary, tables);
  const extraSaving = raTaxSaving(engineSalary, EXTRA_RA_MONTHLY, tables);

  // The shared figures, to the cent, as the UI shows them.
  const expected = {
    netMonthly: cents(slip.monthly.netPay),
    payeMonthly: cents(slip.monthly.paye),
    payeAnnual: cents(slip.annual.paye),
    taxableAnnual: cents(slip.annual.taxableIncome),
    headroomAnnual: cents(headroom.headroom),
    headroomMonthly: cents(headroom.headroomMonthly),
    extraSavingAnnual: cents(extraSaving.saving),
  };

  it('has sensible non-zero reference figures for the representative profile', () => {
    // A guard: if the profile ever stops producing tax (e.g. below threshold) the rest is vacuous.
    expect(expected.netMonthly).toBeGreaterThan(0);
    expect(expected.payeMonthly).toBeGreaterThan(0);
    expect(expected.headroomAnnual).toBeGreaterThan(0);
    expect(expected.extraSavingAnnual).toBeGreaterThan(0);
  });

  it('the RA estimator reports the same headroom and tax saving as the engine', () => {
    const estimate = estimateRa(
      {
        ...engineSalary,
        contributionMonthly: EXTRA_RA_MONTHLY,
        escalationPercent: 5,
        startingBalance: 0,
        returnPercent: 9,
        inflationPercent: 5,
        retirementAge: 55,
      },
      tables,
      raRules,
    );
    expect(estimate.ok).toBe(true);
    if (!estimate.ok) return;
    expect(cents(estimate.result.headroom.headroom)).toBe(expected.headroomAnnual);
    expect(cents(estimate.result.headroom.headroomMonthly)).toBe(expected.headroomMonthly);
    expect(cents(estimate.result.taxSaving.saving)).toBe(expected.extraSavingAnnual);
    // The RA's own view of the base pay must match Pay's PAYE to the cent.
    expect(cents(estimate.result.taxSaving.payeWithout)).toBe(expected.payeAnnual);
  });

  it('the Budget starts from exactly Pay net pay and PAYE for the same profile', () => {
    const estimate = estimateBudget(
      {
        income: PROFILE,
        categories: null,
        sentLines: null,
        settings: { emergencyMonths: 3, emergencySaved: 0, tfsaLifetimeUsed: 0 },
      },
      tables,
      tfsaRules,
    );
    expect(estimate.ok).toBe(true);
    if (!estimate.ok) return;
    expect(cents(estimate.net)).toBe(expected.netMonthly);
    // The Budget keeps the full Salary estimate, so its PAYE and taxable income match too.
    expect(cents(estimate.salary.payslip.monthly.paye)).toBe(expected.payeMonthly);
    expect(cents(estimate.salary.payslip.annual.taxableIncome)).toBe(expected.taxableAnnual);
  });

  it('the Journey year 1 reports the same RA tax saving as the engine for the same contribution', () => {
    const estimate = estimateJourney(
      {
        ...engineSalary,
        retirementAge: 55,
        incomeEscalationPercent: 0,
        contributionMonthly: EXTRA_RA_MONTHLY,
        escalationPercent: 0,
        startingBalance: 0,
        tfsaBalance: 0,
        tfsaLifetimeUsed: 0,
        tfsaTopUpMonthly: 0,
        returnPercent: 9,
        tfsaReturnPercent: 9,
        inflationPercent: 5,
        refundMode: 'refund',
        allowOverContribution: false,
      },
      tables,
      journeyRules,
    );
    expect(estimate.ok).toBe(true);
    if (!estimate.ok) return;
    const year1 = estimate.result.years[0];
    expect(year1).toBeDefined();
    // Year 1 has no income escalation, so its salary is the base profile: same saving as the engine.
    expect(cents(year1.taxSaving)).toBe(expected.extraSavingAnnual);
  });

  it('the PlanContextStore surfaces the same net, headroom and tax saving as the engine', () => {
    TestBed.configureTestingModule({
      providers: provideTestData({ today: TODAY_PINNED }),
    });
    const plan = TestBed.inject(PlanContextStore);
    const salaryStore = TestBed.inject(SalaryInputsStore);
    salaryStore.update({
      amount: PROFILE.amount,
      age: PROFILE.age,
      medicalMembers: PROFILE.medicalMembers,
      employeeRetirementMonthly: PROFILE.employeeRetirementMonthly,
    });
    // Explore the same extra RA contribution the engine reference used.
    plan.updateRa({ contributionMonthly: EXTRA_RA_MONTHLY });

    // The shared profile net pay = Pay's net.
    expect(cents(plan.profile().netMonthly ?? 0)).toBe(expected.netMonthly);

    // RA outputs (what the dashboard and other calculators read) = the engine's headroom/saving.
    const outputs = plan.outputs().ra;
    expect(outputs).not.toBeNull();
    if (!outputs) return;
    expect(cents(outputs.headroomAnnual)).toBe(expected.headroomAnnual);
    expect(cents(outputs.headroomMonthly)).toBe(expected.headroomMonthly);
    expect(cents(outputs.taxSavingAnnual)).toBe(expected.extraSavingAnnual);

    // The Budget slice, fed the same Salary, starts from exactly Pay's net.
    const budget = plan.budgetEstimate();
    expect(budget?.ok).toBe(true);
    if (budget?.ok) expect(cents(budget.net)).toBe(expected.netMonthly);
  });
});
