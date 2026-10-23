import { shippedTaxTables2027 } from '../../testing/tax-tables';
import { estimateSalary } from '../salary/estimate-salary';
import { DEFAULT_SALARY_INPUTS, type SalaryInputs } from '../salary/salary-inputs';
import { HANDOFF_SOURCE_LABELS, SEND_TARGETS } from './handoff';
import { profileFromSalary, raHandoffFrom } from './plan-profile';

const tables = shippedTaxTables2027();

function profileFor(patch: Partial<SalaryInputs>) {
  const inputs = { ...DEFAULT_SALARY_INPUTS, ...patch };
  return profileFromSalary(inputs, estimateSalary(inputs, tables));
}

describe('profileFromSalary', () => {
  it('describes the default R30 000 salary', () => {
    expect(profileFor({})).toEqual({
      age: 35,
      grossMonthly: 30_000,
      netMonthly: 25_141.88,
      medicalMembers: 0,
      employeeRetirementMonthly: 0,
      employerRetirementMonthly: 0,
      otherDeductionsMonthly: 0,
    });
  });

  it('turns an annual salary into a monthly gross', () => {
    expect(profileFor({ period: 'annual', amount: 360_000 }).grossMonthly).toBe(30_000);
  });

  it('works a take-home amount back to its rounded gross', () => {
    expect(profileFor({ basis: 'net', amount: 25_141.88 }).grossMonthly).toBe(30_000);
  });

  it('gives a zero gross and no net when the take-home cannot be worked back', () => {
    const profile = profileFor({ basis: 'net', amount: 5e9 });
    expect(profile.grossMonthly).toBe(0);
    expect(profile.netMonthly).toBeNull();
  });

  it('uses the typed gross when there is no estimate', () => {
    const annual = { ...DEFAULT_SALARY_INPUTS, period: 'annual', amount: 360_000 } as const;
    expect(profileFromSalary(annual, null).grossMonthly).toBe(30_000);
    expect(profileFromSalary(DEFAULT_SALARY_INPUTS, null).grossMonthly).toBe(30_000);
    expect(profileFromSalary(DEFAULT_SALARY_INPUTS, null).netMonthly).toBeNull();
  });

  it('gives a zero gross for a take-home entry with no estimate', () => {
    expect(
      profileFromSalary({ ...DEFAULT_SALARY_INPUTS, basis: 'net', amount: 20_000 }, null)
        .grossMonthly,
    ).toBe(0);
  });

  it('carries the Salary extras through', () => {
    const profile = profileFor({
      age: 45,
      medicalMembers: 2,
      employeeRetirementMonthly: 3_000,
      employerRetirementMonthly: 2_000,
      otherDeductionsMonthly: 500,
    });
    expect(profile).toMatchObject({
      age: 45,
      medicalMembers: 2,
      employeeRetirementMonthly: 3_000,
      employerRetirementMonthly: 2_000,
      otherDeductionsMonthly: 500,
    });
  });
});

describe('raHandoffFrom', () => {
  it('keeps only what the RA page uses', () => {
    expect(raHandoffFrom(profileFor({ age: 40, employeeRetirementMonthly: 1_000 }))).toEqual({
      grossMonthly: 30_000,
      age: 40,
      medicalMembers: 0,
      employeeRetirementMonthly: 1_000,
      employerRetirementMonthly: 0,
    });
  });
});

describe('SEND_TARGETS', () => {
  it('lists RA, Retire at 55, Budget and Journey, each with a route', () => {
    expect(SEND_TARGETS.map((t) => [t.id, t.label, t.route])).toEqual([
      ['ra', 'Retirement annuity', '/ra'],
      ['retire', 'Retire at 55', '/retire'],
      ['budget', 'Budget', '/budget'],
      ['journey', 'Journey', '/journey'],
    ]);
  });

  it('labels every source', () => {
    expect(HANDOFF_SOURCE_LABELS).toEqual({
      salary: 'Salary',
      ra: 'RA',
      retire: 'Retire at 55',
      budget: 'Budget',
      journey: 'Journey',
    });
  });
});
