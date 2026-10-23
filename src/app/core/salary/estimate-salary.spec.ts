import { roundRand } from '../engine';
import { shippedTaxTables2027 } from '../../testing/tax-tables';
import { estimateSalary } from './estimate-salary';
import { DEFAULT_SALARY_INPUTS, type SalaryInputs } from './salary-inputs';

const tables = shippedTaxTables2027();

function ok(patch: Partial<SalaryInputs> = {}) {
  const result = estimateSalary({ ...DEFAULT_SALARY_INPUTS, ...patch }, tables);
  if (!result.ok) throw new Error(`expected an estimate, got: ${result.message}`);
  return result;
}

describe('estimateSalary', () => {
  it('works out the default R30 000 payslip', () => {
    const { payslip, retirementUsedPercent } = ok();
    expect(roundRand(payslip.monthly.paye)).toBe(4_681);
    expect(roundRand(payslip.monthly.uif)).toBe(177.12);
    expect(roundRand(payslip.monthly.netPay)).toBe(25_141.88);
    expect(roundRand(payslip.annual.netPay)).toBe(301_702.56);
    expect(payslip.annual.taxableIncome).toBe(360_000);
    expect(payslip.marginalRate).toBe(0.26);
    expect(payslip.effectiveRate).toBeCloseTo(0.156, 3);
    expect(payslip.annual.retirement.headroom).toBeCloseTo(99_000, 6);
    expect(payslip.annual.retirement.deductible).toBe(0);
    expect(retirementUsedPercent).toBe(0);
  });

  it.each([
    { name: 'age 65', patch: { age: 65 }, paye: 3_867.25, net: 25_955.63 },
    { name: 'age 75', patch: { age: 75 }, paye: 3_596.5, net: 26_226.38 },
    { name: 'medical 1', patch: { medicalMembers: 1 }, paye: 4_305, net: 25_517.88 },
    { name: 'medical 2', patch: { medicalMembers: 2 }, paye: 3_929, net: 25_893.88 },
    { name: 'medical 3', patch: { medicalMembers: 3 }, paye: 3_675, net: 26_147.88 },
    { name: 'RA R5 000', patch: { employeeRetirementMonthly: 5_000 }, paye: 3_381, net: 21_441.88 },
    {
      name: 'RA R10 000',
      patch: { employeeRetirementMonthly: 10_000 },
      paye: 2_536,
      net: 17_286.88,
    },
    {
      name: 'employer R2 000',
      patch: { employerRetirementMonthly: 2_000 },
      paye: 4_681,
      net: 25_141.88,
    },
  ])('matches the expected figures for $name', ({ patch, paye, net }) => {
    const { payslip } = ok(patch);
    expect(roundRand(payslip.monthly.paye)).toBe(paye);
    expect(roundRand(payslip.monthly.uif)).toBe(177.12);
    expect(roundRand(payslip.monthly.netPay)).toBe(net);
  });

  it('reports the retirement lines and ring percentage', () => {
    const ra5 = ok({ employeeRetirementMonthly: 5_000 });
    expect(ra5.payslip.annual.retirement).toMatchObject({ deductible: 60_000, excess: 0 });
    expect(ra5.payslip.annual.retirement.headroom).toBeCloseTo(39_000, 6);
    expect(Math.round(ra5.retirementUsedPercent)).toBe(61);

    const ra10 = ok({ employeeRetirementMonthly: 10_000 });
    expect(ra10.payslip.annual.retirement.deductible).toBeCloseTo(99_000, 6);
    expect(ra10.payslip.annual.retirement.excess).toBeCloseTo(21_000, 6);
    expect(ra10.payslip.annual.retirement.headroom).toBe(0);
    expect(ra10.retirementUsedPercent).toBe(100);

    const employer = ok({ employerRetirementMonthly: 2_000 });
    expect(employer.payslip.annual.retirement.deductible).toBeCloseTo(24_000, 6);
    expect(employer.payslip.annual.retirement.headroom).toBeCloseTo(81_600, 6);
    expect(Math.round(employer.retirementUsedPercent)).toBe(23);
  });

  it('gives the same answer for an annual amount as the monthly one', () => {
    const monthly = ok({ employeeRetirementMonthly: 2_000, medicalMembers: 2 });
    const annual = ok({
      period: 'annual',
      amount: 360_000,
      employeeRetirementMonthly: 2_000,
      medicalMembers: 2,
    });
    expect(roundRand(annual.payslip.monthly.netPay)).toBe(
      roundRand(monthly.payslip.monthly.netPay),
    );
    expect(roundRand(annual.payslip.annual.paye)).toBe(roundRand(monthly.payslip.annual.paye));
  });

  it('works back from net: R25 141.88 a month is R30 000 gross', () => {
    const { payslip } = ok({ basis: 'net', amount: 25_141.88 });
    expect(roundRand(payslip.monthly.gross)).toBe(30_000);
    expect(roundRand(payslip.monthly.paye)).toBe(4_681);
    expect(roundRand(payslip.monthly.netPay)).toBe(25_141.88);
  });

  it('works back from an annual net amount', () => {
    const { payslip } = ok({ basis: 'net', period: 'annual', amount: 301_702.56 });
    // The solver works in months (tolerance R0.001), so the annual figure can be a cent out.
    expect(roundRand(payslip.monthly.gross)).toBe(30_000);
    expect(Math.abs(payslip.annual.gross - 360_000)).toBeLessThan(0.02);
  });

  it('returns a friendly failure, not a throw, for a net amount that is too high', () => {
    const result = estimateSalary({ ...DEFAULT_SALARY_INPUTS, basis: 'net', amount: 5e9 }, tables);
    expect(result).toEqual({
      ok: false,
      message: 'That take-home amount is too high to work back to a salary. Try a smaller amount.',
    });
  });

  it('returns a generic failure when the payslip itself rejects the figures', () => {
    // Bypasses the store's sanitising on purpose: the engine's RangeError must still be caught.
    const result = estimateSalary({ ...DEFAULT_SALARY_INPUTS, amount: NaN }, tables);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toMatch(/NaN|must be/);
  });

  it('does not swallow errors that are not RangeErrors', () => {
    expect(() =>
      estimateSalary(DEFAULT_SALARY_INPUTS, undefined as unknown as typeof tables),
    ).toThrow(TypeError);
  });

  it.each([
    {},
    { employeeRetirementMonthly: 5_000, otherDeductionsMonthly: 750.55 },
    { employeeRetirementMonthly: 10_000, medicalMembers: 3 },
    { employerRetirementMonthly: 2_000, age: 70 },
    { amount: 12_345.67 },
  ])('has a breakdown that adds up to the cash gross (%o)', (patch) => {
    const { breakdown, payslip } = ok(patch);
    expect(breakdown.map((line) => line.key)).toEqual([
      'net',
      'paye',
      'uif',
      'retirement',
      'other',
    ]);
    expect(breakdown.map((line) => line.label)).toEqual([
      'Net pay',
      'PAYE',
      'UIF',
      'Retirement (RA)',
      'Other deductions',
    ]);
    const sum = breakdown.reduce((total, line) => total + line.monthly, 0);
    expect(Math.abs(sum - roundRand(payslip.monthly.gross))).toBeLessThanOrEqual(0.0101);
  });

  it('keeps the employer contribution out of the cash breakdown', () => {
    const { breakdown } = ok({ employerRetirementMonthly: 2_000 });
    expect(breakdown.find((line) => line.key === 'retirement')?.monthly).toBe(0);
  });
});
