import type { Handoff, JourneyHandoffPayload } from '../plan/handoff';
import type { RaHandoffValues } from '../plan/plan-profile';
import type { JourneyPlanFields } from './journey-inputs';
import {
  type JourneySlice,
  editJourney,
  effectiveJourneyInputs,
  freshJourneySlice,
  nextJourneySlice,
  undoJourney,
} from './journey-slice';

const defaults: JourneyPlanFields = {
  retirementAge: 55,
  incomeEscalationPercent: 4.5,
  contributionMonthly: 2_000,
  escalationPercent: 5,
  startingBalance: 0,
  tfsaBalance: 0,
  tfsaLifetimeUsed: 0,
  tfsaTopUpMonthly: 1_000,
  returnPercent: 9.5,
  tfsaReturnPercent: 9.5,
  inflationPercent: 4.5,
  refundMode: 'refund',
  allowOverContribution: false,
};

const shared: RaHandoffValues = {
  grossMonthly: 30_000,
  age: 35,
  medicalMembers: 0,
  employeeRetirementMonthly: 0,
  employerRetirementMonthly: 0,
};

function handoff(
  id: number,
  values: Partial<JourneyHandoffPayload> = {},
  source: Handoff<'journey'>['source'] = 'salary',
): Handoff<'journey'> {
  return { id, source, target: 'journey', values: { ...shared, ...values } };
}

/** Runs the linkedSignal computation the way Angular does, threading `previous`. */
function step(
  h: Handoff<'journey'> | null,
  previous: { source: Handoff<'journey'> | null; value: JourneySlice } | undefined,
) {
  return { source: h, value: nextJourneySlice(h, previous, defaults) };
}

describe('freshJourneySlice', () => {
  it('starts with the defaults, following the shared profile', () => {
    expect(freshJourneySlice(defaults)).toEqual({
      plan: defaults,
      profile: null,
      planEdited: false,
      budgetContext: null,
      from: null,
      undo: null,
    });
  });
});

describe('nextJourneySlice', () => {
  it('starts fresh without a handoff', () => {
    expect(nextJourneySlice(null, undefined, defaults)).toEqual(freshJourneySlice(defaults));
  });

  it('applies a handoff that is already there on the first run', () => {
    const result = nextJourneySlice(handoff(1, { grossMonthly: 50_000 }), undefined, defaults);
    expect(result.profile?.grossMonthly).toBe(50_000);
    expect(result.from).toBe('salary');
  });

  it('keeps the plan edits when the handoff has only salary values', () => {
    const first = step(null, undefined);
    const edited = {
      ...first.value,
      plan: { ...defaults, contributionMonthly: 4_000 },
      planEdited: true,
    };
    const next = step(handoff(1), { source: null, value: edited });
    expect(next.value.plan.contributionMonthly).toBe(4_000);
    expect(next.value.planEdited).toBe(true);
    expect(next.value.undo?.plan.contributionMonthly).toBe(4_000);
  });

  it('replaces plan values the handoff carries', () => {
    const first = step(null, undefined);
    const next = step(
      handoff(1, { contributionMonthly: 3_000, tfsaTopUpMonthly: 2_000, refundMode: 'paye' }),
      first,
    );
    expect(next.value.plan.contributionMonthly).toBe(3_000);
    expect(next.value.plan.tfsaTopUpMonthly).toBe(2_000);
    expect(next.value.plan.refundMode).toBe('paye');
    expect(next.value.planEdited).toBe(true);
  });

  it('keeps the same slice for the same handoff', () => {
    const h = handoff(1);
    const first = step(h, step(null, undefined));
    expect(nextJourneySlice(h, first, defaults)).toBe(first.value);
  });

  it('records the budget a Budget send came from', () => {
    const next = step(
      handoff(1, { budgetNetMonthly: 25_141.88, budgetEmergencyMonthly: 1_000 }, 'budget'),
      step(null, undefined),
    );
    expect(next.value.budgetContext).toEqual({ netMonthly: 25_141.88, emergencyMonthly: 1_000 });
  });

  it('allows a budget send whose take-home could not be worked out', () => {
    const next = step(handoff(1, { budgetNetMonthly: null }, 'budget'), step(null, undefined));
    expect(next.value.budgetContext).toEqual({ netMonthly: null, emergencyMonthly: 0 });
  });

  it('has no budget note for a send from another page, even one that carries the keys', () => {
    const next = step(handoff(1, { budgetNetMonthly: 1_000 }, 'ra'), step(null, undefined));
    expect(next.value.budgetContext).toBeNull();
  });

  it('clears the chip and the Undo, but not the values, when the handoff is dismissed', () => {
    const sent = step(handoff(1, { contributionMonthly: 3_000 }), step(null, undefined));
    const dismissed = step(null, sent);
    expect(dismissed.value.from).toBeNull();
    expect(dismissed.value.undo).toBeNull();
    expect(dismissed.value.plan.contributionMonthly).toBe(3_000);
  });
});

describe('editJourney', () => {
  it('sets planEdited for plan keys and starts an override for salary keys from the shared values', () => {
    const fresh = freshJourneySlice(defaults);
    const planEdit = editJourney(fresh, { tfsaTopUpMonthly: 500 }, shared);
    expect(planEdit.planEdited).toBe(true);
    expect(planEdit.profile).toBeNull();
    const salaryEdit = editJourney(fresh, { grossMonthly: 45_000 }, shared);
    expect(salaryEdit.planEdited).toBe(false);
    expect(salaryEdit.profile).toEqual({ ...shared, grossMonthly: 45_000 });
  });

  it('sanitises values', () => {
    const next = editJourney(freshJourneySlice(defaults), { retirementAge: 300 }, shared);
    expect(next.plan.retirementAge).toBe(80);
  });
});

describe('effectiveJourneyInputs and undoJourney', () => {
  it('uses the shared profile until overridden', () => {
    const fresh = freshJourneySlice(defaults);
    expect(effectiveJourneyInputs(fresh, shared)).toEqual({ ...shared, ...defaults });
    const edited = editJourney(fresh, { age: 40 }, shared);
    expect(effectiveJourneyInputs(edited, { ...shared, age: 20 }).age).toBe(40);
  });

  it('puts back the state from before the handoff, including the budget note', () => {
    const before = step(null, undefined);
    const sent = step(
      handoff(1, { tfsaTopUpMonthly: 2_000, budgetNetMonthly: 1_000 }, 'budget'),
      before,
    );
    const restored = undoJourney(sent.value);
    expect(restored.plan).toEqual(defaults);
    expect(restored.budgetContext).toBeNull();
    expect(restored.from).toBeNull();
    expect(restored.undo).toBeNull();
  });

  it('does nothing without an Undo', () => {
    const fresh = freshJourneySlice(defaults);
    expect(undoJourney(fresh)).toBe(fresh);
  });
});
