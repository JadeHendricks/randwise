import {
  type BudgetCategory,
  type BudgetGroup,
  type BudgetPresetId,
  MONTHS_PER_YEAR,
  type PayPeriod,
  addCategory,
  removeCategory,
  roundRand,
} from '../engine';
import type { Handoff, HandoffSource } from '../plan/handoff';
import type { SalaryEstimate } from '../salary/estimate-salary';
import {
  type AmountBasis,
  DEFAULT_SALARY_INPUTS,
  type SalaryInputs,
  sanitiseSalaryInputs,
} from '../salary/salary-inputs';
import {
  BUDGET_SETTINGS_DEFAULT,
  type BudgetSentLines,
  type BudgetSettings,
  sanitiseBudgetSettings,
} from './budget-inputs';

/** What the user has changed on the Budget page; this is what Undo puts back. */
export interface BudgetLocalState {
  /** Null means "follow the shared Salary inputs live". */
  readonly income: SalaryInputs | null;
  /** Null means the example: 50/30/20 of the live take-home on the default lines. */
  readonly categories: readonly BudgetCategory[] | null;
  /** RA and TFSA amounts sent from another page, applied over the lines until the first edit. */
  readonly sentLines: BudgetSentLines | null;
  readonly presetId: BudgetPresetId | 'custom';
  readonly settings: BudgetSettings;
  readonly edited: boolean;
  /** Next number for a custom line id. It only goes up, so a removed id is never reused. */
  readonly nextCustomId: number;
}

export interface BudgetSlice extends BudgetLocalState {
  /** Who sent the figures now in use, for the "From ..." chip. */
  readonly from: HandoffSource | null;
  /** The local state from just before the last handoff arrived. */
  readonly undo: BudgetLocalState | null;
}

/** The slice before the user has done anything. */
export function freshBudgetSlice(): BudgetSlice {
  return {
    income: null,
    categories: null,
    sentLines: null,
    presetId: '50-30-20',
    settings: BUDGET_SETTINGS_DEFAULT,
    edited: false,
    nextCustomId: 1,
    from: null,
    undo: null,
  };
}

/**
 * The computation of the slice's linkedSignal, with the Budget handoff as its source.
 * - First run: a fresh slice, with the handoff applied if one is already there.
 * - Same handoff as before: nothing to do.
 * - A new handoff: the income and any sent lines are replaced by the sent values (a new context
 *   resets them), and the pre-handoff state is remembered for Undo.
 * - Handoff dismissed: the chip and the Undo go, the values stay.
 */
export function nextBudgetSlice(
  handoff: Handoff<'budget'> | null,
  previous: { readonly source: Handoff<'budget'> | null; readonly value: BudgetSlice } | undefined,
): BudgetSlice {
  if (!previous) {
    const base = freshBudgetSlice();
    return handoff ? receive(base, handoff) : base;
  }
  if (handoff === previous.source) return previous.value;
  if (handoff) return receive(previous.value, handoff);
  return { ...previous.value, from: null, undo: null };
}

function localStateOf(slice: BudgetSlice): BudgetLocalState {
  const { income, categories, sentLines, presetId, settings, edited, nextCustomId } = slice;
  return { income, categories, sentLines, presetId, settings, edited, nextCustomId };
}

/** A sent amount, or undefined when it is missing or not a usable rand amount. */
function usable(amount: number | undefined): number | undefined {
  return amount !== undefined && Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

function receive(slice: BudgetSlice, handoff: Handoff<'budget'>): BudgetSlice {
  const v = handoff.values;
  const income = sanitiseSalaryInputs(
    {
      basis: 'gross',
      period: 'monthly',
      amount: v.grossMonthly,
      age: v.age,
      medicalMembers: v.medicalMembers,
      employeeRetirementMonthly: v.employeeRetirementMonthly,
      employerRetirementMonthly: v.employerRetirementMonthly,
      otherDeductionsMonthly: v.otherDeductionsMonthly ?? 0,
    },
    slice.income ?? DEFAULT_SALARY_INPUTS,
  );
  const raMonthly = usable(v.raMonthly);
  const tfsaMonthly = usable(v.tfsaMonthly);
  const hasSentLines = raMonthly !== undefined || tfsaMonthly !== undefined;
  return {
    ...slice,
    income,
    sentLines: hasSentLines ? { raMonthly, tfsaMonthly } : slice.sentLines,
    // Why 'custom': a sent line, or an income that no longer matches the saved amounts, means the
    // lines are no longer a preset.
    presetId: hasSentLines || slice.categories !== null ? 'custom' : slice.presetId,
    settings:
      v.tfsaLifetimeUsed === undefined
        ? slice.settings
        : sanitiseBudgetSettings({ tfsaLifetimeUsed: v.tfsaLifetimeUsed }, slice.settings),
    from: handoff.source,
    undo: localStateOf(slice),
  };
}

/** The income the page works from: the override if there is one, otherwise the shared Salary inputs. */
export function effectiveBudgetIncome(slice: BudgetSlice, shared: SalaryInputs): SalaryInputs {
  return slice.income ?? shared;
}

/**
 * Applies an income edit. While following, the override starts from the shared Salary inputs so
 * the fields that were not touched keep their values. Once the lines are saved, a changed income
 * leaves them as they were, so they stop being a preset.
 */
export function editIncome(
  slice: BudgetSlice,
  patch: Partial<SalaryInputs>,
  shared: SalaryInputs,
): BudgetSlice {
  return {
    ...slice,
    income: sanitiseSalaryInputs(patch, slice.income ?? shared),
    presetId: slice.categories === null ? slice.presetId : 'custom',
    edited: true,
  };
}

/** Applies a settings edit (sanitised). */
export function editSettings(slice: BudgetSlice, patch: Partial<BudgetSettings>): BudgetSlice {
  return { ...slice, settings: sanitiseBudgetSettings(patch, slice.settings), edited: true };
}

/**
 * Saves `next` as the lines. `next` is built from the effective list (example or saved, with any
 * sent amounts applied), so the first edit turns the example into real lines and the sent amounts
 * are baked in, which is why `sentLines` clears.
 */
export function editCategories(
  slice: BudgetSlice,
  next: readonly BudgetCategory[],
  presetId: BudgetPresetId | 'custom',
): BudgetSlice {
  return { ...slice, categories: next, sentLines: null, presetId, edited: true };
}

const NEW_LINE_NAMES: Record<BudgetGroup, string> = {
  needs: 'New need',
  wants: 'New want',
  savings: 'New saving',
};

/** Adds a custom line at 0 rands to `group`, with an id that has never been used. */
export function addLine(
  slice: BudgetSlice,
  effective: readonly BudgetCategory[],
  group: BudgetGroup,
): BudgetSlice {
  const line = { id: `custom-${slice.nextCustomId}`, name: NEW_LINE_NAMES[group], group };
  return {
    ...editCategories(slice, addCategory(effective, line), slice.presetId),
    nextCustomId: slice.nextCustomId + 1,
  };
}

/**
 * Removes a custom line. Taking away a line that held money means the amounts no longer follow
 * the preset.
 */
export function removeLine(
  slice: BudgetSlice,
  effective: readonly BudgetCategory[],
  id: string,
): BudgetSlice {
  const removed = effective.find((line) => line.id === id);
  const held = removed?.kind === 'custom' && removed.amount > 0;
  return editCategories(
    slice,
    removeCategory(effective, id),
    held ? 'custom' : slice.presetId,
  );
}

/** Puts back the state from before the last handoff and clears the chip. No-op without an Undo. */
export function undoBudget(slice: BudgetSlice): BudgetSlice {
  return slice.undo ? { ...slice.undo, from: null, undo: null } : slice;
}

/**
 * The income change for switching between gross and take-home: the amount becomes the rounded
 * equivalent from the latest estimate, so the same person is described (like the Pay page).
 * Without a good estimate only the basis changes.
 */
export function switchIncomeBasis(
  income: SalaryInputs,
  estimate: SalaryEstimate | null,
  basis: AmountBasis,
): Partial<SalaryInputs> {
  if (!estimate?.ok) return { basis };
  const amounts = estimate.payslip[income.period];
  return { basis, amount: roundRand(basis === 'net' ? amounts.netPay : amounts.gross) };
}

/** The income change for switching between monthly and yearly, rounded to cents so toggling never drifts. */
export function switchIncomePeriod(income: SalaryInputs, period: PayPeriod): Partial<SalaryInputs> {
  if (period === income.period) return {};
  const converted =
    period === 'annual' ? income.amount * MONTHS_PER_YEAR : income.amount / MONTHS_PER_YEAR;
  return { period, amount: roundRand(converted) };
}
