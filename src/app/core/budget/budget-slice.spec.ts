import { deepFreeze, shippedTaxTables2027 } from '../../testing/tax-tables';
import { setCategoryAmount } from '../engine';
import type { BudgetHandoffPayload, Handoff } from '../plan/handoff';
import { type SalaryEstimate, estimateSalary } from '../salary/estimate-salary';
import { DEFAULT_SALARY_INPUTS, type SalaryInputs } from '../salary/salary-inputs';
import { exampleCategories } from './budget-inputs';
import {
  type BudgetSlice,
  addLine,
  editCategories,
  editIncome,
  editSettings,
  effectiveBudgetIncome,
  freshBudgetSlice,
  nextBudgetSlice,
  removeLine,
  switchIncomeBasis,
  switchIncomePeriod,
  undoBudget,
} from './budget-slice';

const NET = 25_141.88;
const shared: SalaryInputs = DEFAULT_SALARY_INPUTS;
const salaryValues = {
  grossMonthly: 30_000,
  age: 35,
  medicalMembers: 0,
  employeeRetirementMonthly: 0,
  employerRetirementMonthly: 0,
};

function handoff(id: number, values: Partial<BudgetHandoffPayload> = {}): Handoff<'budget'> {
  return { id, source: 'salary', target: 'budget', values: { ...salaryValues, ...values } };
}

function step(
  h: Handoff<'budget'> | null,
  previous: { source: Handoff<'budget'> | null; value: BudgetSlice } | undefined,
) {
  return { source: h, value: nextBudgetSlice(h, previous) };
}

describe('freshBudgetSlice', () => {
  it('follows Salary with the example lines, 50/30/20 and the default settings', () => {
    expect(freshBudgetSlice()).toEqual({
      income: null,
      categories: null,
      sentLines: null,
      presetId: '50-30-20',
      settings: { emergencyMonths: 3, emergencySaved: 0, tfsaLifetimeUsed: 0 },
      edited: false,
      nextCustomId: 1,
      from: null,
      undo: null,
    });
  });
});

describe('nextBudgetSlice', () => {
  it('starts fresh without a handoff', () => {
    expect(nextBudgetSlice(null, undefined)).toEqual(freshBudgetSlice());
  });

  it('applies a handoff that is already there on the first run', () => {
    const result = nextBudgetSlice(handoff(1, { grossMonthly: 50_000 }), undefined);
    expect(result.income?.amount).toBe(50_000);
    expect(result.from).toBe('salary');
  });

  it('receives a Salary handoff as a gross monthly income override with an undo', () => {
    const received = nextBudgetSlice(
      handoff(1, { grossMonthly: 50_000, age: 41, otherDeductionsMonthly: 700 }),
      undefined,
    );
    expect(received.income).toEqual({
      ...DEFAULT_SALARY_INPUTS,
      basis: 'gross',
      period: 'monthly',
      amount: 50_000,
      age: 41,
      otherDeductionsMonthly: 700,
    });
    expect(received.from).toBe('salary');
    expect(received.undo).toEqual({
      income: null,
      categories: null,
      sentLines: null,
      presetId: '50-30-20',
      settings: freshBudgetSlice().settings,
      edited: false,
      nextCustomId: 1,
    });
  });

  it('keeps the current other deductions when the payload has none', () => {
    const edited = editIncome(freshBudgetSlice(), { otherDeductionsMonthly: 900 }, shared);
    const received = nextBudgetSlice(handoff(1), { source: null, value: edited });
    expect(received.income?.otherDeductionsMonthly).toBe(900);
  });

  it('keeps the live Salary deductions when the Budget was following them', () => {
    const received = nextBudgetSlice(handoff(1), undefined, {
      ...shared,
      otherDeductionsMonthly: 2_000,
    });
    expect(received.income?.otherDeductionsMonthly).toBe(2_000);
  });

  it('replaces the other deductions when the payload carries them, even at 0', () => {
    const edited = editIncome(freshBudgetSlice(), { otherDeductionsMonthly: 900 }, shared);
    const withSome = nextBudgetSlice(handoff(1, { otherDeductionsMonthly: 400 }), {
      source: null,
      value: edited,
    });
    expect(withSome.income?.otherDeductionsMonthly).toBe(400);
    const withNone = nextBudgetSlice(handoff(2, { otherDeductionsMonthly: 0 }), {
      source: null,
      value: edited,
    });
    expect(withNone.income?.otherDeductionsMonthly).toBe(0);
  });

  it('keeps the deductions through a Salary send followed by a send that has none', () => {
    const first = step(
      handoff(1, { grossMonthly: 50_000, otherDeductionsMonthly: 2_000 }),
      undefined,
    );
    const second = nextBudgetSlice(handoff(2, { grossMonthly: 45_000 }), first);
    expect(second.income?.amount).toBe(45_000);
    expect(second.income?.otherDeductionsMonthly).toBe(2_000);
  });

  it('turns a net or yearly income into a gross monthly one when a handoff arrives', () => {
    const edited = editIncome(freshBudgetSlice(), { basis: 'net', period: 'annual' }, shared);
    const received = nextBudgetSlice(handoff(1), { source: null, value: edited });
    expect(received.income).toMatchObject({ basis: 'gross', period: 'monthly', amount: 30_000 });
  });

  it('keeps sent RA and TFSA amounts as sent lines, marks the lines custom and keeps the example', () => {
    const received = nextBudgetSlice(
      handoff(1, { raMonthly: 3_000, tfsaMonthly: 2_000 }),
      undefined,
    );
    expect(received.sentLines).toEqual({ raMonthly: 3_000, tfsaMonthly: 2_000 });
    expect(received.presetId).toBe('custom');
    expect(received.categories).toBeNull();
  });

  it('ignores a sent amount that is negative or not a number', () => {
    const received = nextBudgetSlice(
      handoff(1, { raMonthly: -5, tfsaMonthly: Number.NaN }),
      undefined,
    );
    expect(received.sentLines).toBeNull();
    expect(received.presetId).toBe('50-30-20');
  });

  it('stores TFSA contributions made so far in the settings', () => {
    const received = nextBudgetSlice(handoff(1, { tfsaLifetimeUsed: 120_000 }), undefined);
    expect(received.settings.tfsaLifetimeUsed).toBe(120_000);
    expect(received.settings.emergencyMonths).toBe(3);
  });

  it('applies the emergency months, amount saved and monthly line, and Undo restores them', () => {
    const received = nextBudgetSlice(
      handoff(1, { emergencyMonths: 6, emergencySaved: 1_000, emergencyMonthly: 2_000 }),
      undefined,
    );
    expect(received.settings).toEqual({
      emergencyMonths: 6,
      emergencySaved: 1_000,
      tfsaLifetimeUsed: 0,
    });
    expect(received.sentLines).toEqual({
      raMonthly: undefined,
      tfsaMonthly: undefined,
      emergencyMonthly: 2_000,
    });
    expect(received.presetId).toBe('custom');
    const restored = undoBudget(received);
    expect(restored.settings).toEqual(freshBudgetSlice().settings);
    expect(restored.sentLines).toBeNull();
  });

  it('sanitises the emergency settings: months are rounded and clamped', () => {
    expect(
      nextBudgetSlice(handoff(1, { emergencyMonths: 40 }), undefined).settings.emergencyMonths,
    ).toBe(12);
    expect(
      nextBudgetSlice(handoff(1, { emergencyMonths: 5.6 }), undefined).settings.emergencyMonths,
    ).toBe(6);
  });

  it('ignores invalid emergency values', () => {
    const received = nextBudgetSlice(
      handoff(1, {
        emergencyMonths: Number.NaN,
        emergencySaved: -5,
        emergencyMonthly: -1,
      }),
      undefined,
    );
    expect(received.settings).toEqual(freshBudgetSlice().settings);
    expect(received.sentLines).toBeNull();
    expect(received.presetId).toBe('50-30-20');
  });

  it('leaves the settings object untouched when a send carries no settings fields', () => {
    const base = editSettings(freshBudgetSlice(), { emergencyMonths: 9, emergencySaved: 4_000 });
    const received = nextBudgetSlice(handoff(1, { raMonthly: 3_000 }), {
      source: null,
      value: base,
    });
    expect(received.settings).toBe(base.settings);
  });

  it('keeps the emergency settings when only the TFSA lifetime amount is sent', () => {
    const base = editSettings(freshBudgetSlice(), { emergencyMonths: 9, emergencySaved: 4_000 });
    const received = nextBudgetSlice(handoff(1, { tfsaLifetimeUsed: 7_000 }), {
      source: null,
      value: base,
    });
    expect(received.settings).toEqual({
      emergencyMonths: 9,
      emergencySaved: 4_000,
      tfsaLifetimeUsed: 7_000,
    });
  });

  it('marks saved lines custom, because the new income no longer matches their amounts', () => {
    const saved = editCategories(freshBudgetSlice(), exampleCategories(NET), '50-30-20');
    const received = nextBudgetSlice(handoff(1), { source: null, value: saved });
    expect(received.presetId).toBe('custom');
    expect(received.categories).toBe(saved.categories);
  });

  it('keeps the value when the same handoff is seen again', () => {
    const h = handoff(1);
    const first = step(h, undefined);
    const edited = editIncome(first.value, { age: 50 }, shared);
    expect(nextBudgetSlice(h, { source: h, value: edited })).toBe(edited);
  });

  it('resets the local income when a second handoff arrives', () => {
    const first = step(handoff(1), undefined);
    const edited = {
      source: first.source,
      value: editIncome(first.value, { amount: 60_000 }, shared),
    };
    const second = nextBudgetSlice(handoff(2, { grossMonthly: 45_000 }), edited);
    expect(second.income?.amount).toBe(45_000);
    expect(second.undo?.income?.amount).toBe(60_000);
  });

  it('clears from and undo when dismissed, but keeps the values', () => {
    const received = step(handoff(1, { grossMonthly: 50_000, raMonthly: 3_000 }), undefined);
    const result = nextBudgetSlice(null, received);
    expect(result.from).toBeNull();
    expect(result.undo).toBeNull();
    expect(result.income?.amount).toBe(50_000);
    expect(result.sentLines).toEqual({ raMonthly: 3_000, tfsaMonthly: undefined });
  });
});

describe('editIncome', () => {
  it('copies the shared Salary inputs first, so untouched fields keep their values', () => {
    const result = editIncome(freshBudgetSlice(), { amount: 40_000 }, { ...shared, age: 44 });
    expect(result.income).toEqual({ ...shared, age: 44, amount: 40_000 });
    expect(result.edited).toBe(true);
  });

  it('sanitises: a NaN or negative amount keeps the current one', () => {
    const result = editIncome(freshBudgetSlice(), { amount: Number.NaN, age: 500 }, shared);
    expect(result.income?.amount).toBe(30_000);
    expect(result.income?.age).toBe(100);
  });

  it('leaves the example lines and the preset alone, and marks saved lines custom', () => {
    expect(editIncome(freshBudgetSlice(), { amount: 40_000 }, shared).presetId).toBe('50-30-20');
    const saved = editCategories(freshBudgetSlice(), exampleCategories(NET), '60-20-20');
    expect(editIncome(saved, { amount: 40_000 }, shared).presetId).toBe('custom');
  });
});

describe('effectiveBudgetIncome', () => {
  it('uses the shared inputs while following and the override otherwise', () => {
    const following = freshBudgetSlice();
    const other = { ...shared, amount: 77_000 };
    expect(effectiveBudgetIncome(following, other)).toBe(other);
    const overridden = editIncome(following, { amount: 40_000 }, shared);
    expect(effectiveBudgetIncome(overridden, other).amount).toBe(40_000);
  });
});

describe('editSettings', () => {
  it('sanitises the patch and flags the budget as edited', () => {
    const result = editSettings(freshBudgetSlice(), { emergencyMonths: 99, emergencySaved: -1 });
    expect(result.settings).toEqual({
      emergencyMonths: 12,
      emergencySaved: 0,
      tfsaLifetimeUsed: 0,
    });
    expect(result.edited).toBe(true);
  });
});

describe('editCategories', () => {
  it('saves the lines, clears the sent lines and sets the preset', () => {
    const received = nextBudgetSlice(handoff(1, { raMonthly: 3_000 }), undefined);
    const lines = setCategoryAmount(exampleCategories(NET), 'ra', 3_000);
    const result = editCategories(received, lines, 'custom');
    expect(result.categories).toBe(lines);
    expect(result.sentLines).toBeNull();
    expect(result.presetId).toBe('custom');
    expect(result.edited).toBe(true);
    expect(result.from).toBe('salary');
  });
});

describe('addLine and removeLine', () => {
  const base = freshBudgetSlice();
  const effective = deepFreeze(exampleCategories(NET));

  it('adds a custom line named for its group, with ids that count up', () => {
    const first = addLine(base, effective, 'needs');
    const second = addLine(first, first.categories ?? [], 'wants');
    const third = addLine(second, second.categories ?? [], 'savings');
    expect(first.categories?.at(-1)).toMatchObject({
      id: 'custom-1',
      name: 'New need',
      group: 'needs',
      kind: 'custom',
      amount: 0,
    });
    expect(second.categories?.at(-1)).toMatchObject({ id: 'custom-2', name: 'New want' });
    expect(third.categories?.at(-1)).toMatchObject({ id: 'custom-3', name: 'New saving' });
    expect(third.nextCustomId).toBe(4);
    expect(third.edited).toBe(true);
    // The built-in ids are untouched.
    expect(third.categories?.slice(0, effective.length).map((line) => line.id)).toEqual(
      effective.map((line) => line.id),
    );
  });

  it('never reuses the id of a removed line', () => {
    const added = addLine(base, effective, 'needs');
    const removed = removeLine(added, added.categories ?? [], 'custom-1');
    const again = addLine(removed, removed.categories ?? [], 'needs');
    expect(again.categories?.at(-1)?.id).toBe('custom-2');
  });

  it('keeps the preset when a line is added or an empty line is removed', () => {
    const added = addLine({ ...base, presetId: '60-20-20' }, effective, 'needs');
    expect(added.presetId).toBe('60-20-20');
    const removed = removeLine(added, added.categories ?? [], 'custom-1');
    expect(removed.presetId).toBe('60-20-20');
  });

  it('marks the lines custom when a line that held money is removed', () => {
    const added = addLine(base, effective, 'needs');
    const funded = setCategoryAmount(added.categories ?? [], 'custom-1', 500);
    const removed = removeLine(editCategories(added, funded, '50-30-20'), funded, 'custom-1');
    expect(removed.presetId).toBe('custom');
    expect(removed.categories?.some((line) => line.id === 'custom-1')).toBe(false);
  });

  it('cannot remove a built-in line', () => {
    const removed = removeLine(base, effective, 'housing');
    expect(removed.categories?.length).toBe(effective.length);
  });

  it('clears the sent lines, because they are now part of the saved lines', () => {
    const sent = nextBudgetSlice(handoff(1, { raMonthly: 3_000 }), undefined);
    expect(addLine(sent, effective, 'needs').sentLines).toBeNull();
  });
});

describe('undoBudget', () => {
  it('restores income, lines, preset, settings and the counter, and clears from and undo', () => {
    let before = editIncome(freshBudgetSlice(), { amount: 50_000 }, shared);
    before = editSettings(before, { emergencyMonths: 6 });
    before = addLine(before, exampleCategories(NET), 'needs');
    const received = nextBudgetSlice(
      handoff(1, { grossMonthly: 20_000, raMonthly: 900, tfsaLifetimeUsed: 5_000 }),
      { source: null, value: before },
    );
    expect(received.income?.amount).toBe(20_000);
    expect(undoBudget(received)).toEqual({ ...before, from: null, undo: null });
  });

  it('does nothing without an undo', () => {
    const fresh = freshBudgetSlice();
    expect(undoBudget(fresh)).toBe(fresh);
  });
});

describe('switchIncomeBasis and switchIncomePeriod', () => {
  const tables = shippedTaxTables2027();
  const estimate = estimateSalary(DEFAULT_SALARY_INPUTS, tables);

  it('converts the amount to the equivalent on the other basis, rounded to cents', () => {
    expect(switchIncomeBasis(DEFAULT_SALARY_INPUTS, estimate, 'net')).toEqual({
      basis: 'net',
      amount: NET,
    });
  });

  it('uses the yearly figures when the income is yearly', () => {
    const yearly: SalaryInputs = { ...DEFAULT_SALARY_INPUTS, period: 'annual', amount: 360_000 };
    const patch = switchIncomeBasis(yearly, estimateSalary(yearly, tables), 'net');
    // 12 x 25 141.88 = 301 702.56
    expect(patch.amount).toBeCloseTo(301_702.56, 2);
  });

  it('only changes the basis without a good estimate', () => {
    const failed: SalaryEstimate = { ok: false, message: 'no' };
    expect(switchIncomeBasis(DEFAULT_SALARY_INPUTS, failed, 'net')).toEqual({ basis: 'net' });
    expect(switchIncomeBasis(DEFAULT_SALARY_INPUTS, null, 'net')).toEqual({ basis: 'net' });
  });

  it('converts between monthly and yearly and does not drift on a round trip', () => {
    const yearly = switchIncomePeriod(DEFAULT_SALARY_INPUTS, 'annual');
    expect(yearly).toEqual({ period: 'annual', amount: 360_000 });
    const back = switchIncomePeriod({ ...DEFAULT_SALARY_INPUTS, ...yearly }, 'monthly');
    expect(back).toEqual({ period: 'monthly', amount: 30_000 });
  });

  it('changes nothing for the same period', () => {
    expect(switchIncomePeriod(DEFAULT_SALARY_INPUTS, 'monthly')).toEqual({});
  });
});
