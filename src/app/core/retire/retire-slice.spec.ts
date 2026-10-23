import type { Handoff, RetireHandoffPayload } from '../plan/handoff';
import type { RaHandoffValues } from '../plan/plan-profile';
import type { RetirePlanFields } from './retire-inputs';
import {
  type RetireSlice,
  editRetire,
  effectiveRetireInputs,
  freshRetireSlice,
  nextRetireSlice,
  undoRetire,
} from './retire-slice';

const defaults: RetirePlanFields = {
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
};

const shared: RaHandoffValues = {
  grossMonthly: 30_000,
  age: 35,
  medicalMembers: 0,
  employeeRetirementMonthly: 0,
  employerRetirementMonthly: 0,
};

function handoff(id: number, values: Partial<RetireHandoffPayload> = {}): Handoff<'retire'> {
  return { id, source: 'salary', target: 'retire', values: { ...shared, ...values } };
}

/** Runs the linkedSignal computation the way Angular does, threading `previous`. */
function step(
  h: Handoff<'retire'> | null,
  previous: { source: Handoff<'retire'> | null; value: RetireSlice } | undefined,
) {
  return { source: h, value: nextRetireSlice(h, previous, defaults) };
}

describe('freshRetireSlice', () => {
  it('starts with the defaults, following the shared profile', () => {
    expect(freshRetireSlice(defaults)).toEqual({
      plan: defaults,
      profile: null,
      planEdited: false,
      from: null,
      undo: null,
    });
  });
});

describe('nextRetireSlice', () => {
  it('starts fresh without a handoff', () => {
    expect(nextRetireSlice(null, undefined, defaults)).toEqual(freshRetireSlice(defaults));
  });

  it('receives a salary handoff: sets the profile, from and an undo, and keeps the plan', () => {
    const edited = editRetire(freshRetireSlice(defaults), { goalNetMonthly: 20_000 }, shared);
    const first = step(null, undefined);
    const result = nextRetireSlice(
      handoff(1, { grossMonthly: 50_000 }),
      { source: first.source, value: edited },
      defaults,
    );
    expect(result.profile?.grossMonthly).toBe(50_000);
    expect(result.from).toBe('salary');
    expect(result.plan.goalNetMonthly).toBe(20_000);
    expect(result.planEdited).toBe(true);
    expect(result.undo).toEqual({ plan: edited.plan, profile: null, planEdited: true });
  });

  it('applies plan keys in the payload and flags planEdited', () => {
    const result = nextRetireSlice(
      handoff(1, { contributionMonthly: 3_000, startingBalance: 100_000, retirementAge: 60 }),
      undefined,
      defaults,
    );
    expect(result.plan).toEqual({
      ...defaults,
      contributionMonthly: 3_000,
      startingBalance: 100_000,
      retirementAge: 60,
    });
    expect(result.planEdited).toBe(true);
    expect(result.profile).toEqual(shared);
    expect(result.undo).toEqual({ plan: defaults, profile: null, planEdited: false });
  });

  it('sanitises plan keys from a payload', () => {
    const result = nextRetireSlice(
      handoff(1, { retirementAge: 200, contributionMonthly: -5 }),
      undefined,
      defaults,
    );
    expect(result.plan.retirementAge).toBe(80);
    expect(result.plan.contributionMonthly).toBe(2_000);
  });

  it('leaves planEdited alone when the payload has only salary values', () => {
    const result = nextRetireSlice(handoff(1, { age: 44 }), undefined, defaults);
    expect(result.profile?.age).toBe(44);
    expect(result.planEdited).toBe(false);
    expect(result.plan).toBe(defaults);
  });

  it('keeps the value when the same handoff is seen again', () => {
    const h = handoff(1);
    const first = step(h, undefined);
    const edited = editRetire(first.value, { grossMonthly: 60_000 }, shared);
    expect(nextRetireSlice(h, { source: h, value: edited }, defaults)).toBe(edited);
  });

  it('resets local profile edits when a second handoff arrives', () => {
    const first = step(handoff(1), undefined);
    const edited = {
      source: first.source,
      value: editRetire(first.value, { grossMonthly: 60_000 }, shared),
    };
    const second = nextRetireSlice(handoff(2, { grossMonthly: 45_000 }), edited, defaults);
    expect(second.profile?.grossMonthly).toBe(45_000);
    expect(second.undo?.profile?.grossMonthly).toBe(60_000);
  });

  it('clears from and undo when dismissed, but keeps the values', () => {
    const received = step(handoff(1, { grossMonthly: 50_000 }), undefined);
    const result = nextRetireSlice(null, received, defaults);
    expect(result.from).toBeNull();
    expect(result.undo).toBeNull();
    expect(result.profile?.grossMonthly).toBe(50_000);
  });
});

describe('editRetire', () => {
  const fresh = freshRetireSlice(defaults);

  it('splits plan keys from profile keys and flags planEdited only for plan keys', () => {
    const profileOnly = editRetire(fresh, { grossMonthly: 40_000 }, shared);
    expect(profileOnly.planEdited).toBe(false);
    expect(profileOnly.profile?.grossMonthly).toBe(40_000);
    expect(profileOnly.plan).toBe(fresh.plan);

    const planOnly = editRetire(fresh, { takeLumpSum: true }, shared);
    expect(planOnly.planEdited).toBe(true);
    expect(planOnly.plan.takeLumpSum).toBe(true);
    expect(planOnly.profile).toBeNull();
  });

  it('copies the shared profile first when a profile edit starts from following', () => {
    const shared2 = { ...shared, age: 41, employerRetirementMonthly: 900 };
    const result = editRetire(fresh, { grossMonthly: 40_000 }, shared2);
    expect(result.profile).toEqual({ ...shared2, grossMonthly: 40_000 });
  });

  it('sanitises and leaves from and undo alone', () => {
    const received = nextRetireSlice(handoff(1), undefined, defaults);
    const result = editRetire(
      received,
      { retirementAge: 200, drawdownPercent: Number.NaN, grossMonthly: Number.NaN },
      shared,
    );
    expect(result.plan.retirementAge).toBe(80);
    expect(result.plan.drawdownPercent).toBe(5);
    expect(result.profile?.grossMonthly).toBe(30_000);
    expect(result.from).toBe('salary');
    expect(result.undo).toBe(received.undo);
  });
});

describe('undoRetire', () => {
  it('restores plan, profile and planEdited and clears from and undo', () => {
    const before = editRetire(
      freshRetireSlice(defaults),
      { grossMonthly: 50_000, age: 45, goalNetMonthly: 30_000 },
      shared,
    );
    const received = nextRetireSlice(
      handoff(1, { contributionMonthly: 9_000 }),
      { source: null, value: before },
      defaults,
    );
    expect(received.plan.contributionMonthly).toBe(9_000);
    expect(undoRetire(received)).toEqual({ ...before, from: null, undo: null });
  });

  it('does nothing without an undo', () => {
    const fresh = freshRetireSlice(defaults);
    expect(undoRetire(fresh)).toBe(fresh);
  });
});

describe('effectiveRetireInputs', () => {
  it('uses the shared profile while following', () => {
    expect(
      effectiveRetireInputs(freshRetireSlice(defaults), { ...shared, grossMonthly: 40_000 }),
    ).toEqual({ ...shared, grossMonthly: 40_000, ...defaults });
  });

  it('uses the override when there is one', () => {
    const slice = editRetire(freshRetireSlice(defaults), { grossMonthly: 55_000 }, shared);
    expect(effectiveRetireInputs(slice, { ...shared, grossMonthly: 1 }).grossMonthly).toBe(55_000);
  });
});
