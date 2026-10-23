import type { Handoff, HandoffSource } from '../plan/handoff';
import type { RaHandoffValues } from '../plan/plan-profile';
import { sanitiseRaProfile } from '../ra/ra-inputs';
import { type RetireInputs, type RetirePlanFields, sanitiseRetirePlan } from './retire-inputs';

/** What the user has changed on the Retire page; this is what Undo puts back. */
export interface RetireLocalState {
  readonly plan: RetirePlanFields;
  /** Null means "follow the shared Salary profile live". */
  readonly profile: RaHandoffValues | null;
  readonly planEdited: boolean;
}

export interface RetireSlice extends RetireLocalState {
  /** Who sent the figures now in use, for the "From ..." chip. */
  readonly from: HandoffSource | null;
  /** The local state from just before the last handoff arrived. */
  readonly undo: RetireLocalState | null;
}

/** The slice before the user has done anything. */
export function freshRetireSlice(planDefaults: RetirePlanFields): RetireSlice {
  return { plan: planDefaults, profile: null, planEdited: false, from: null, undo: null };
}

const PLAN_KEYS: readonly (keyof RetirePlanFields)[] = [
  'goalNetMonthly',
  'retirementAge',
  'inflationPercent',
  'returnPercent',
  'retirementReturnPercent',
  'drawdownPercent',
  'takeLumpSum',
  'startingBalance',
  'contributionMonthly',
  'escalationPercent',
];

/**
 * The computation of the slice's linkedSignal, with the Retire handoff as its source.
 * - First run: a fresh slice, with the handoff applied if one is already there.
 * - Same handoff as before: nothing to do.
 * - A new handoff: local salary edits are replaced by the sent values (new context resets them),
 *   retirement plan edits are kept unless the handoff carries plan values, and the pre-handoff
 *   state is remembered for Undo.
 * - Handoff dismissed: the chip and the Undo go, the values stay.
 */
export function nextRetireSlice(
  handoff: Handoff<'retire'> | null,
  previous: { readonly source: Handoff<'retire'> | null; readonly value: RetireSlice } | undefined,
  planDefaults: RetirePlanFields,
): RetireSlice {
  if (!previous) {
    const base = freshRetireSlice(planDefaults);
    return handoff ? receive(base, handoff) : base;
  }
  if (handoff === previous.source) return previous.value;
  if (handoff) return receive(previous.value, handoff);
  return { ...previous.value, from: null, undo: null };
}

function receive(slice: RetireSlice, handoff: Handoff<'retire'>): RetireSlice {
  const planPatch: Partial<RetirePlanFields> = {};
  for (const key of PLAN_KEYS) {
    const value = handoff.values[key];
    if (value !== undefined) Object.assign(planPatch, { [key]: value });
  }
  const hasPlanKey = Object.keys(planPatch).length > 0;
  return {
    plan: hasPlanKey ? sanitiseRetirePlan(planPatch, slice.plan) : slice.plan,
    profile: sanitiseRaProfile(handoff.values, slice.profile ?? handoff.values),
    planEdited: slice.planEdited || hasPlanKey,
    from: handoff.source,
    undo: { plan: slice.plan, profile: slice.profile, planEdited: slice.planEdited },
  };
}

/** The inputs the calculator uses: the override if there is one, otherwise the shared profile. */
export function effectiveRetireInputs(slice: RetireSlice, shared: RaHandoffValues): RetireInputs {
  return { ...(slice.profile ?? shared), ...slice.plan };
}

/**
 * Applies an edit. Plan keys set `planEdited`. Salary keys become an override; while following,
 * the override starts from the shared profile so the fields that were not touched keep their values.
 */
export function editRetire(
  slice: RetireSlice,
  patch: Partial<RetireInputs>,
  shared: RaHandoffValues,
): RetireSlice {
  const planPatch: Partial<RetirePlanFields> = {};
  const profilePatch: Partial<RaHandoffValues> = {};
  const hasPlanKey = PLAN_KEYS.some((key) => patch[key] !== undefined);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if ((PLAN_KEYS as readonly string[]).includes(key)) {
      Object.assign(planPatch, { [key]: value });
    } else {
      Object.assign(profilePatch, { [key]: value });
    }
  }
  const hasProfileKey = Object.keys(profilePatch).length > 0;
  return {
    ...slice,
    plan: hasPlanKey ? sanitiseRetirePlan(planPatch, slice.plan) : slice.plan,
    planEdited: slice.planEdited || hasPlanKey,
    profile: hasProfileKey
      ? sanitiseRaProfile(profilePatch, slice.profile ?? shared)
      : slice.profile,
  };
}

/** Puts back the state from before the last handoff and clears the chip. No-op without an Undo. */
export function undoRetire(slice: RetireSlice): RetireSlice {
  return slice.undo ? { ...slice.undo, from: null, undo: null } : slice;
}
