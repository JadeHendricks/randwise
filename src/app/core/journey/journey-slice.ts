import type { Handoff, HandoffSource } from '../plan/handoff';
import type { RaHandoffValues } from '../plan/plan-profile';
import { sanitiseRaProfile } from '../ra/ra-inputs';
import { type JourneyInputs, type JourneyPlanFields, sanitiseJourneyPlan } from './journey-inputs';

/** What a Budget send tells the Journey about the budget it came from. Shown, not used in maths. */
export interface BudgetContext {
  /** Take-home pay a month, or null when the budget could not be worked out. */
  readonly netMonthly: number | null;
  /** The emergency-fund line, rands a month. */
  readonly emergencyMonthly: number;
}

/** What the user has changed on the Journey page; this is what Undo puts back. */
export interface JourneyLocalState {
  readonly plan: JourneyPlanFields;
  /** Null means "follow the shared Salary profile live". */
  readonly profile: RaHandoffValues | null;
  readonly planEdited: boolean;
  readonly budgetContext: BudgetContext | null;
}

export interface JourneySlice extends JourneyLocalState {
  /** Who sent the figures now in use, for the "From ..." chip. */
  readonly from: HandoffSource | null;
  /** The local state from just before the last handoff arrived. */
  readonly undo: JourneyLocalState | null;
}

/** The slice before the user has done anything. */
export function freshJourneySlice(planDefaults: JourneyPlanFields): JourneySlice {
  return {
    plan: planDefaults,
    profile: null,
    planEdited: false,
    budgetContext: null,
    from: null,
    undo: null,
  };
}

const PLAN_KEYS: readonly (keyof JourneyPlanFields)[] = [
  'retirementAge',
  'incomeEscalationPercent',
  'contributionMonthly',
  'escalationPercent',
  'startingBalance',
  'tfsaBalance',
  'tfsaLifetimeUsed',
  'tfsaTopUpMonthly',
  'returnPercent',
  'tfsaReturnPercent',
  'inflationPercent',
  'refundMode',
  'allowOverContribution',
];

/**
 * The computation of the slice's linkedSignal, with the Journey handoff as its source.
 * - First run: a fresh slice, with the handoff applied if one is already there.
 * - Same handoff as before: nothing to do.
 * - A new handoff: local salary edits are replaced by the sent values (new context resets them),
 *   journey plan edits are kept unless the handoff carries plan values, and the pre-handoff state
 *   is remembered for Undo.
 * - Handoff dismissed: the chip and the Undo go, the values stay.
 */
export function nextJourneySlice(
  handoff: Handoff<'journey'> | null,
  previous:
    | { readonly source: Handoff<'journey'> | null; readonly value: JourneySlice }
    | undefined,
  planDefaults: JourneyPlanFields,
): JourneySlice {
  if (!previous) {
    const base = freshJourneySlice(planDefaults);
    return handoff ? receive(base, handoff) : base;
  }
  if (handoff === previous.source) return previous.value;
  if (handoff) return receive(previous.value, handoff);
  return { ...previous.value, from: null, undo: null };
}

function localStateOf(slice: JourneySlice): JourneyLocalState {
  const { plan, profile, planEdited, budgetContext } = slice;
  return { plan, profile, planEdited, budgetContext };
}

function receive(slice: JourneySlice, handoff: Handoff<'journey'>): JourneySlice {
  const v = handoff.values;
  const planPatch: Partial<JourneyPlanFields> = {};
  for (const key of PLAN_KEYS) {
    const value = v[key];
    if (value !== undefined) Object.assign(planPatch, { [key]: value });
  }
  const hasPlanKey = Object.keys(planPatch).length > 0;
  // Why only from the Budget: the note describes that budget, so a send from anywhere else must
  // not leave a stale one on the page.
  const budgetContext: BudgetContext | null =
    handoff.source === 'budget' && v.budgetNetMonthly !== undefined
      ? { netMonthly: v.budgetNetMonthly, emergencyMonthly: v.budgetEmergencyMonthly ?? 0 }
      : null;
  return {
    plan: hasPlanKey ? sanitiseJourneyPlan(planPatch, slice.plan) : slice.plan,
    profile: sanitiseRaProfile(v, slice.profile ?? v),
    planEdited: slice.planEdited || hasPlanKey,
    budgetContext,
    from: handoff.source,
    undo: localStateOf(slice),
  };
}

/** The inputs the calculator uses: the override if there is one, otherwise the shared profile. */
export function effectiveJourneyInputs(
  slice: JourneySlice,
  shared: RaHandoffValues,
): JourneyInputs {
  return { ...(slice.profile ?? shared), ...slice.plan };
}

/**
 * Applies an edit. Plan keys set `planEdited`. Salary keys become an override; while following,
 * the override starts from the shared profile so the fields that were not touched keep their values.
 */
export function editJourney(
  slice: JourneySlice,
  patch: Partial<JourneyInputs>,
  shared: RaHandoffValues,
): JourneySlice {
  const planPatch: Partial<JourneyPlanFields> = {};
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
    plan: hasPlanKey ? sanitiseJourneyPlan(planPatch, slice.plan) : slice.plan,
    planEdited: slice.planEdited || hasPlanKey,
    profile: hasProfileKey
      ? sanitiseRaProfile(profilePatch, slice.profile ?? shared)
      : slice.profile,
  };
}

/** Puts back the state from before the last handoff and clears the chip. No-op without an Undo. */
export function undoJourney(slice: JourneySlice): JourneySlice {
  return slice.undo ? { ...slice.undo, from: null, undo: null } : slice;
}
