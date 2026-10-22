import type { Handoff } from '../plan/handoff';
import type { RaHandoffValues } from '../plan/plan-profile';
import type { RaPlanFields } from './ra-inputs';
import {
  type RaSlice,
  editRa,
  effectiveRaInputs,
  freshRaSlice,
  nextRaSlice,
  undoRa,
} from './ra-slice';

const defaults: RaPlanFields = {
  contributionMonthly: 2_000,
  escalationPercent: 5,
  startingBalance: 0,
  returnPercent: 9.5,
  inflationPercent: 4.5,
  retirementAge: 55,
};

const shared: RaHandoffValues = {
  grossMonthly: 30_000,
  age: 35,
  medicalMembers: 0,
  employeeRetirementMonthly: 0,
  employerRetirementMonthly: 0,
};

function handoff(id: number, values: Partial<RaHandoffValues> = {}): Handoff<'ra'> {
  return { id, source: 'salary', target: 'ra', values: { ...shared, ...values } };
}

/** Runs the linkedSignal computation the way Angular does, threading `previous`. */
function step(
  h: Handoff<'ra'> | null,
  previous: { source: Handoff<'ra'> | null; value: RaSlice } | undefined,
) {
  return { source: h, value: nextRaSlice(h, previous, defaults) };
}

describe('freshRaSlice', () => {
  it('starts with the defaults, following the shared profile', () => {
    expect(freshRaSlice(defaults)).toEqual({
      plan: defaults,
      profile: null,
      planEdited: false,
      from: null,
      undo: null,
    });
  });
});

describe('nextRaSlice', () => {
  it('starts fresh without a handoff', () => {
    expect(nextRaSlice(null, undefined, defaults)).toEqual(freshRaSlice(defaults));
  });

  it('receives a handoff: sets the profile, from and an undo, and keeps the plan', () => {
    const edited = editRa(freshRaSlice(defaults), { contributionMonthly: 3_000 }, shared);
    const first = step(null, undefined);
    const edit = { source: first.source, value: edited };
    const result = nextRaSlice(handoff(1, { grossMonthly: 50_000 }), edit, defaults);
    expect(result.profile?.grossMonthly).toBe(50_000);
    expect(result.from).toBe('salary');
    expect(result.plan.contributionMonthly).toBe(3_000);
    expect(result.planEdited).toBe(true);
    expect(result.undo).toEqual({ plan: edited.plan, profile: null, planEdited: true });
  });

  it('applies a handoff that is already there on the first run', () => {
    const result = nextRaSlice(handoff(1, { age: 44 }), undefined, defaults);
    expect(result.profile?.age).toBe(44);
    expect(result.from).toBe('salary');
    expect(result.undo).toEqual({ plan: defaults, profile: null, planEdited: false });
  });

  it('keeps the value when the same handoff is seen again', () => {
    const h = handoff(1);
    const first = step(h, undefined);
    const edited = editRa(first.value, { grossMonthly: 60_000 }, shared);
    expect(nextRaSlice(h, { source: h, value: edited }, defaults)).toBe(edited);
  });

  it('resets local profile edits when a second handoff arrives', () => {
    const first = step(handoff(1), undefined);
    const edited = {
      source: first.source,
      value: editRa(first.value, { grossMonthly: 60_000 }, shared),
    };
    const second = nextRaSlice(handoff(2, { grossMonthly: 45_000 }), edited, defaults);
    expect(second.profile?.grossMonthly).toBe(45_000);
    // Undo goes back to the state just before THIS handoff.
    expect(second.undo?.profile?.grossMonthly).toBe(60_000);
  });

  it('clears from and undo when dismissed, but keeps the values', () => {
    const h = handoff(1, { grossMonthly: 50_000 });
    const received = step(h, undefined);
    const result = nextRaSlice(null, received, defaults);
    expect(result.from).toBeNull();
    expect(result.undo).toBeNull();
    expect(result.profile?.grossMonthly).toBe(50_000);
  });
});

describe('editRa', () => {
  const fresh = freshRaSlice(defaults);

  it('splits plan keys from profile keys and flags planEdited only for plan keys', () => {
    const profileOnly = editRa(fresh, { grossMonthly: 40_000 }, shared);
    expect(profileOnly.planEdited).toBe(false);
    expect(profileOnly.profile?.grossMonthly).toBe(40_000);
    expect(profileOnly.plan).toBe(fresh.plan);

    const planOnly = editRa(fresh, { returnPercent: 7.25 }, shared);
    expect(planOnly.planEdited).toBe(true);
    expect(planOnly.plan.returnPercent).toBe(7.25);
    expect(planOnly.profile).toBeNull();
  });

  it('copies the shared profile first when a profile edit starts from following', () => {
    const shared2 = { ...shared, age: 41, employerRetirementMonthly: 900 };
    const result = editRa(fresh, { grossMonthly: 40_000 }, shared2);
    expect(result.profile).toEqual({ ...shared2, grossMonthly: 40_000 });
  });

  it('edits the existing override rather than the shared profile', () => {
    const once = editRa(fresh, { grossMonthly: 40_000 }, shared);
    const twice = editRa(once, { age: 50 }, { ...shared, grossMonthly: 99 });
    expect(twice.profile).toEqual({ ...shared, grossMonthly: 40_000, age: 50 });
  });

  it('sanitises and leaves from and undo alone', () => {
    const received = nextRaSlice(handoff(1), undefined, defaults);
    const result = editRa(received, { retirementAge: 200, grossMonthly: Number.NaN }, shared);
    expect(result.plan.retirementAge).toBe(80);
    expect(result.profile?.grossMonthly).toBe(30_000);
    expect(result.from).toBe('salary');
    expect(result.undo).toBe(received.undo);
  });
});

describe('undoRa', () => {
  it('restores plan, profile and planEdited and clears from and undo', () => {
    const before = editRa(freshRaSlice(defaults), { grossMonthly: 50_000, age: 45 }, shared);
    const received = nextRaSlice(handoff(1), { source: null, value: before }, defaults);
    const restored = undoRa(received);
    expect(restored).toEqual({ ...before, from: null, undo: null });
  });

  it('does nothing without an undo', () => {
    const fresh = freshRaSlice(defaults);
    expect(undoRa(fresh)).toBe(fresh);
  });
});

describe('effectiveRaInputs', () => {
  it('uses the shared profile while following', () => {
    expect(effectiveRaInputs(freshRaSlice(defaults), { ...shared, grossMonthly: 40_000 })).toEqual({
      ...shared,
      grossMonthly: 40_000,
      ...defaults,
    });
  });

  it('uses the override when there is one', () => {
    const slice = editRa(freshRaSlice(defaults), { grossMonthly: 55_000 }, shared);
    expect(effectiveRaInputs(slice, { ...shared, grossMonthly: 1 }).grossMonthly).toBe(55_000);
  });
});
