import { shippedTaxTables2027 } from '../../testing/tax-tables';
import { payslip } from '../engine';
import { type HomeLoanPay, estimateHomeLoan } from './estimate-home-loan';
import type { HomeLoanInputs } from './toolbox-inputs';

const tables = shippedTaxTables2027();

// The Pay page's default person: R30 000 gross, age 35, no medical aid or retirement.
const pay: HomeLoanPay = {
  age: 35,
  medicalMembers: 0,
  employeeRetirementMonthly: 0,
  employerRetirementMonthly: 0,
};

// plan.md HL7: R1 000 000 at 10.75% over 20 years is R10 152.29 a month.
const HL7: HomeLoanInputs = {
  grossMonthly: 30_000,
  existingDebtMonthly: 0,
  deposit: 0,
  ratePercent: 10.75,
  termYears: 20,
  mode: 'price',
  purchasePrice: 1_000_000,
  ratesAndLeviesMonthly: 0,
  insuranceMonthly: 0,
};

function ok(inputs: HomeLoanInputs, ratesAvailable = true, person: HomeLoanPay = pay) {
  const estimate = estimateHomeLoan(inputs, person, tables, ratesAvailable);
  if (!estimate.ok) throw new Error(`failed: ${estimate.message}`);
  return estimate;
}

describe('estimateHomeLoan', () => {
  it('HL7: the repayment is 0.4038 of the R25 141.88 take-home on R30 000 gross', () => {
    const { result, netMonthly } = ok(HL7);
    // payslip: gross 30 000, age 35 → net 25 141.88 (README); 10 152.29 / 25 141.88 = 0.4038
    expect(netMonthly).toBeCloseTo(25_141.88, 2);
    expect(result.repayment).toBeCloseTo(10_152.29, 2);
    expect(result.repaymentShareOfNet).toBeCloseTo(0.4038, 4);
  });

  it('works take-home out with payslip from the Pay profile', () => {
    const person: HomeLoanPay = {
      age: 52,
      medicalMembers: 2,
      employeeRetirementMonthly: 3_000,
      employerRetirementMonthly: 1_000,
    };
    const direct = payslip(
      {
        gross: 45_000,
        period: 'monthly',
        age: 52,
        medicalMembers: 2,
        employeeRetirementMonthly: 3_000,
        employerRetirementMonthly: 1_000,
      },
      tables,
    ).monthly.netPay;
    expect(ok({ ...HL7, grossMonthly: 45_000 }, true, person).netMonthly).toBe(direct);
  });

  it('turns the percent into a fraction and passes the term and costs through', () => {
    const { result } = ok({ ...HL7, ratesAndLeviesMonthly: 1_500, insuranceMonthly: 500 });
    expect(result.totalInterest).toBeCloseTo(1_436_549.49, 2);
    expect(result.totalMonthlyCost).toBeCloseTo(10_152.29 + 2_000, 2);
  });

  it('"what can I afford" ignores the price and sizes the bond from the salary', () => {
    const { result, warnings } = ok({ ...HL7, mode: 'afford', purchasePrice: 5 });
    // cap 0.3 × 30 000 = 9 000; bond 9 000 × 98.49995 = 886 499.54
    expect(result.roomForBond).toBe(9_000);
    expect(result.maxBond).toBeCloseTo(886_499.54, 2);
    expect(result.loanAmount).toBeCloseTo(886_499.54, 2);
    expect(result.withinCap).toBe(true);
    expect(warnings).toEqual([]);
  });

  it('warns over-cap in price mode when the instalment passes the room', () => {
    // 10 152.29 against 9 000 of room
    const { result, warnings } = ok(HL7);
    expect(result.withinCap).toBe(false);
    expect(result.overCapBy).toBeCloseTo(1_152.29, 2);
    expect(warnings).toEqual(['over-cap']);
  });

  it('does not warn over-cap in afford mode', () => {
    expect(ok({ ...HL7, mode: 'afford' }).warnings).not.toContain('over-cap');
  });

  it('warns there is no room when existing debt takes the whole cap', () => {
    expect(ok({ ...HL7, mode: 'afford', existingDebtMonthly: 9_000 }).warnings).toEqual([
      'no-room',
    ]);
    expect(ok({ ...HL7, existingDebtMonthly: 12_000 }).warnings).toEqual(['over-cap', 'no-room']);
  });

  it('warns that the rate is unavailable only when rates are missing and the rate is 0', () => {
    expect(ok({ ...HL7, ratePercent: 0 }, false).warnings).toContain('rate-unavailable');
    expect(ok({ ...HL7, ratePercent: 0 }, true).warnings).not.toContain('rate-unavailable');
    expect(ok(HL7, false).warnings).not.toContain('rate-unavailable');
  });

  it('has no take-home share for a gross of 0', () => {
    const { result, netMonthly } = ok({ ...HL7, grossMonthly: 0 });
    expect(netMonthly).toBeNull();
    expect(result.repaymentShareOfNet).toBeNull();
  });

  it('returns a plain sentence for a figure the engine rejects', () => {
    for (const bad of [
      { ratePercent: -1 },
      { ratePercent: 150 },
      { termYears: 0 },
      { deposit: -5 },
    ]) {
      const estimate = estimateHomeLoan({ ...HL7, ...bad }, pay, tables);
      expect(estimate.ok).toBe(false);
      if (!estimate.ok) {
        expect(estimate.message).toBe(
          'Those figures could not be worked out. Check the amounts and try again.',
        );
      }
    }
  });
});
