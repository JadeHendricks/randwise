import { TestBed } from '@angular/core/testing';

import { DEFAULT_SALARY_INPUTS } from './salary-inputs';
import { SalaryInputsStore } from './salary-inputs.store';

function setup(): SalaryInputsStore {
  TestBed.configureTestingModule({});
  return TestBed.inject(SalaryInputsStore);
}

describe('SalaryInputsStore', () => {
  it('starts with R30 000 gross a month, age 35, as an example', () => {
    const store = setup();
    expect(store.inputs()).toEqual({
      basis: 'gross',
      period: 'monthly',
      amount: 30_000,
      age: 35,
      medicalMembers: 0,
      employeeRetirementMonthly: 0,
      employerRetirementMonthly: 0,
      otherDeductionsMonthly: 0,
    });
    expect(store.isExample()).toBe(true);
  });

  it('merges an update and stops being an example', () => {
    const store = setup();
    store.update({ amount: 45_000, age: 40 });
    expect(store.inputs().amount).toBe(45_000);
    expect(store.inputs().age).toBe(40);
    expect(store.inputs().period).toBe('monthly');
    expect(store.isExample()).toBe(false);
  });

  it('rounds and clamps age, ignoring NaN', () => {
    const store = setup();
    store.update({ age: 17.6 });
    expect(store.inputs().age).toBe(18);
    store.update({ age: 150 });
    expect(store.inputs().age).toBe(100);
    store.reset();
    store.update({ age: NaN });
    expect(store.inputs().age).toBe(35);
  });

  it('rounds and clamps medical members', () => {
    const store = setup();
    store.update({ medicalMembers: -3 });
    expect(store.inputs().medicalMembers).toBe(0);
    store.update({ medicalMembers: 12 });
    expect(store.inputs().medicalMembers).toBe(10);
    store.update({ medicalMembers: 2.4 });
    expect(store.inputs().medicalMembers).toBe(2);
  });

  it('ignores negative and non-finite amounts, keeping the current value', () => {
    const store = setup();
    store.update({
      amount: -1,
      employeeRetirementMonthly: NaN,
      employerRetirementMonthly: Infinity,
      otherDeductionsMonthly: -50,
    });
    expect(store.inputs()).toEqual(DEFAULT_SALARY_INPUTS);
  });

  it('ignores an unknown basis or period', () => {
    const store = setup();
    store.update({ basis: 'bogus', period: 'weekly' } as never);
    expect(store.inputs().basis).toBe('gross');
    expect(store.inputs().period).toBe('monthly');
  });

  it('accepts a huge finite amount so the net-mode error path is reachable', () => {
    const store = setup();
    store.update({ amount: 5e9 });
    expect(store.inputs().amount).toBe(5e9);
  });

  it('converts the amount when the period changes, and back', () => {
    const store = setup();
    store.setPeriod('annual');
    expect(store.inputs().period).toBe('annual');
    expect(store.inputs().amount).toBe(360_000);
    store.setPeriod('monthly');
    expect(store.inputs().period).toBe('monthly');
    expect(store.inputs().amount).toBe(30_000);
  });

  it('keeps the other fields when the period changes', () => {
    const store = setup();
    store.update({ age: 50, medicalMembers: 2, basis: 'net' });
    store.setPeriod('annual');
    expect(store.inputs()).toMatchObject({ age: 50, medicalMembers: 2, basis: 'net' });
  });

  it('does nothing when the period is unchanged', () => {
    const store = setup();
    store.setPeriod('monthly');
    expect(store.inputs()).toEqual(DEFAULT_SALARY_INPUTS);
    expect(store.isExample()).toBe(true);
  });

  it('restores the defaults and the example flag on reset', () => {
    const store = setup();
    store.update({ amount: 80_000, age: 60 });
    store.reset();
    expect(store.inputs()).toEqual(DEFAULT_SALARY_INPUTS);
    expect(store.isExample()).toBe(true);
  });

  it('is one root instance shared by every injection in the same TestBed', () => {
    const store = setup();
    const again = TestBed.inject(SalaryInputsStore);
    store.update({ amount: 55_000 });
    expect(again).toBe(store);
    expect(again.inputs().amount).toBe(55_000);
  });

  it('never touches localStorage or sessionStorage', () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    const read = vi.spyOn(Storage.prototype, 'getItem');
    const store = setup();
    store.update({ amount: 40_000 });
    store.setPeriod('annual');
    store.reset();
    expect(local).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
