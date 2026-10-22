import type { Handoff, HandoffSource } from '../plan/handoff';
import type { RaHandoffValues } from '../plan/plan-profile';
import { type RaInputs, type RaPlanFields, sanitiseRaPlan, sanitiseRaProfile } from './ra-inputs';

/** What the user has changed on the RA page; this is what Undo puts back. */
export interface RaLocalState {
  readonly plan: RaPlanFields;
  /** Null means "follow the shared Salary profile live". */
  readonly profile: RaHandoffValues | null;
  readonly planEdited: boolean;
}

export interface RaSlice extends RaLocalState {
  /** Who sent the figures now in use, for the "From ..." chip. */
  readonly from: HandoffSource | null;
  /** The local state from just before the last handoff arrived. */
  readonly undo: RaLocalState | null;
}

/** The slice before the user has done anything. */
export function freshRaSlice(planDefaults: RaPlanFields): RaSlice {
  return { plan: planDefaults, profile: null, planEdited: false, from: null, undo: null };
}

const PLAN_KEYS: readonly (keyof RaPlanFields)[] = [
  'contributionMonthly',
  'escalationPercent',
  'startingBalance',
  'returnPercent',
  'inflationPercent',
  'retirementAge',
];

/**
 * The computation of the slice's linkedSignal, with the RA handoff as its source.
 * - First run: a fresh slice, with the handoff applied if one is already there.
 * - Same handoff as before: nothing to do.
 * - A new handoff: local salary edits are replaced by the sent values (new context resets them),
 *   RA plan edits are kept, and the pre-handoff state is remembered for Undo.
 * - Handoff dismissed: the chip and the Undo go, the values stay.
 */
export function nextRaSlice(
  handoff: Handoff<'ra'> | null,
  previous: { readonly source: Handoff<'ra'> | null; readonly value: RaSlice } | undefined,
  planDefaults: RaPlanFields,
): RaSlice {
  if (!previous) {
    const base = freshRaSlice(planDefaults);
    return handoff ? receive(base, handoff) : base;
  }
  if (handoff === previous.source) return previous.value;
  if (handoff) return receive(previous.value, handoff);
  return { ...previous.value, from: null, undo: null };
}

function receive(slice: RaSlice, handoff: Handoff<'ra'>): RaSlice {
  return {
    plan: slice.plan,
    profile: sanitiseRaProfile(handoff.values, slice.profile ?? handoff.values),
    planEdited: slice.planEdited,
    from: handoff.source,
    undo: { plan: slice.plan, profile: slice.profile, planEdited: slice.planEdited },
  };
}

/** The inputs the calculator uses: the override if there is one, otherwise the shared profile. */
export function effectiveRaInputs(slice: RaSlice, shared: RaHandoffValues): RaInputs {
  return { ...(slice.profile ?? shared), ...slice.plan };
}

/**
 * Applies an edit. Plan keys set `planEdited`. Salary keys become an override; while following,
 * the override starts from the shared profile so the fields that were not touched keep their values.
 */
export function editRa(slice: RaSlice, patch: Partial<RaInputs>, shared: RaHandoffValues): RaSlice {
  const planPatch: Partial<RaPlanFields> = {};
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
    plan: hasPlanKey ? sanitiseRaPlan(planPatch, slice.plan) : slice.plan,
    planEdited: slice.planEdited || hasPlanKey,
    profile: hasProfileKey
      ? sanitiseRaProfile(profilePatch, slice.profile ?? shared)
      : slice.profile,
  };
}

/** Puts back the state from before the last handoff and clears the chip. No-op without an Undo. */
export function undoRa(slice: RaSlice): RaSlice {
  return slice.undo ? { ...slice.undo, from: null, undo: null } : slice;
}
