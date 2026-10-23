import { deriveAssumptions } from '../data/assumptions';
import { makeRates } from '../../testing/tax-data-fixtures';
import {
  RA_PLAN_EXAMPLE,
  type RaPlanFields,
  raPlanDefaults,
  sanitiseRaPlan,
  sanitiseRaProfile,
} from './ra-inputs';

const plan: RaPlanFields = {
  contributionMonthly: 2_000,
  escalationPercent: 5,
  startingBalance: 0,
  returnPercent: 9.5,
  inflationPercent: 4.5,
  retirementAge: 55,
};

const profile = {
  grossMonthly: 30_000,
  age: 35,
  medicalMembers: 0,
  employeeRetirementMonthly: 0,
  employerRetirementMonthly: 0,
};

describe('raPlanDefaults', () => {
  it('takes return and inflation from the assumptions', () => {
    expect(raPlanDefaults(deriveAssumptions(makeRates().rates))).toEqual({
      ...RA_PLAN_EXAMPLE,
      returnPercent: 9.5,
      inflationPercent: 4.5,
    });
  });

  it('uses zero return and inflation without rates', () => {
    expect(raPlanDefaults(null)).toEqual({
      ...RA_PLAN_EXAMPLE,
      returnPercent: 0,
      inflationPercent: 0,
    });
  });
});

describe('sanitiseRaPlan', () => {
  it('applies valid values', () => {
    expect(
      sanitiseRaPlan(
        { contributionMonthly: 3_000, startingBalance: 100_000, escalationPercent: 7.25 },
        plan,
      ),
    ).toEqual({
      ...plan,
      contributionMonthly: 3_000,
      startingBalance: 100_000,
      escalationPercent: 7.25,
    });
  });

  it('ignores NaN, infinite and negative amounts and does not cap large ones', () => {
    expect(sanitiseRaPlan({ contributionMonthly: Number.NaN }, plan).contributionMonthly).toBe(
      2_000,
    );
    expect(sanitiseRaPlan({ contributionMonthly: -1 }, plan).contributionMonthly).toBe(2_000);
    expect(sanitiseRaPlan({ startingBalance: Infinity }, plan).startingBalance).toBe(0);
    expect(sanitiseRaPlan({ startingBalance: 5e9 }, plan).startingBalance).toBe(5e9);
  });

  it('clamps percents to their limits without rounding them', () => {
    const result = sanitiseRaPlan(
      { escalationPercent: 50, returnPercent: -3, inflationPercent: 15.5 },
      plan,
    );
    expect(result.escalationPercent).toBe(20);
    expect(result.returnPercent).toBe(0);
    expect(result.inflationPercent).toBe(15);
    expect(sanitiseRaPlan({ returnPercent: 7.25 }, plan).returnPercent).toBe(7.25);
    expect(sanitiseRaPlan({ returnPercent: Number.NaN }, plan).returnPercent).toBe(9.5);
  });

  it('rounds the retirement age and clamps it to 40 to 80', () => {
    expect(sanitiseRaPlan({ retirementAge: 60.6 }, plan).retirementAge).toBe(61);
    expect(sanitiseRaPlan({ retirementAge: 10 }, plan).retirementAge).toBe(40);
    expect(sanitiseRaPlan({ retirementAge: 200 }, plan).retirementAge).toBe(80);
    expect(sanitiseRaPlan({ retirementAge: Number.NaN }, plan).retirementAge).toBe(55);
  });
});

describe('sanitiseRaProfile', () => {
  it('ignores bad amounts and keeps the current value', () => {
    const result = sanitiseRaProfile(
      { grossMonthly: Number.NaN, employeeRetirementMonthly: -5, employerRetirementMonthly: 1_000 },
      profile,
    );
    expect(result.grossMonthly).toBe(30_000);
    expect(result.employeeRetirementMonthly).toBe(0);
    expect(result.employerRetirementMonthly).toBe(1_000);
  });

  it('rounds and clamps age and medical members', () => {
    expect(sanitiseRaProfile({ age: 17.6 }, profile).age).toBe(18);
    expect(sanitiseRaProfile({ age: 150 }, profile).age).toBe(100);
    expect(sanitiseRaProfile({ medicalMembers: 3.4 }, profile).medicalMembers).toBe(3);
    expect(sanitiseRaProfile({ medicalMembers: 99 }, profile).medicalMembers).toBe(10);
    expect(sanitiseRaProfile({ age: Number.NaN }, profile).age).toBe(35);
  });
});
