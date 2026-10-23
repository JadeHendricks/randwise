import { MONTHS_PER_YEAR, assertAmount, assertWholeNumber, roundRand } from './money';
import { raHeadroom, raTaxSaving } from './ra';
import type { RaSalary } from './ra';
import type { TaxTables } from './tax-tables';
import { tfsaContribution } from './tfsa';
import type { TfsaContribution, TfsaRules } from './tfsa';

/**
 * Budget engine: presets, spreading a preset over the budget lines, amount and percent sync,
 * custom lines, the summary, and the RA, TFSA and emergency-fund checks.
 *
 * Amounts are monthly rands in full precision and are the single source of truth; percents are
 * derived from them (amount / net × 100). Nothing here rounds except status and warning
 * decisions, which compare at cents with `roundRand` so float dust never reads as "over by R0,00".
 * Callers round for display only. Every function is pure and returns new arrays; inputs are never
 * mutated.
 */

export type BudgetGroup = 'needs' | 'wants' | 'savings';
export const BUDGET_GROUPS: readonly BudgetGroup[] = ['needs', 'wants', 'savings'];

export type BudgetKind =
  | 'housing'
  | 'groceries'
  | 'transport'
  | 'insurance'
  | 'utilities'
  | 'needs-other'
  | 'wants'
  | 'ra'
  | 'tfsa'
  | 'emergency'
  | 'debt'
  | 'savings-other'
  | 'custom';

export interface BudgetCategory {
  readonly id: string;
  readonly name: string;
  readonly group: BudgetGroup;
  readonly kind: BudgetKind;
  /** Rands a month, full precision, never negative. */
  readonly amount: number;
  /** Weight inside its group when the group is empty (see `distributeToGroups`); 0 for custom lines. */
  readonly share: number;
}

export type BudgetPresetId = '50-30-20' | '60-20-20' | '70-20-10';

export interface BudgetSplit {
  readonly needs: number;
  readonly wants: number;
  readonly savings: number;
}

/** Fractions of net pay per group. */
export const BUDGET_PRESETS: Readonly<Record<BudgetPresetId, BudgetSplit>> = {
  '50-30-20': { needs: 0.5, wants: 0.3, savings: 0.2 },
  '60-20-20': { needs: 0.6, wants: 0.2, savings: 0.2 },
  '70-20-10': { needs: 0.7, wants: 0.2, savings: 0.1 },
};

const DEFAULT_LINES: readonly (readonly [BudgetKind, string, BudgetGroup, number])[] = [
  ['housing', 'Housing', 'needs', 0.4],
  ['groceries', 'Groceries', 'needs', 0.2],
  ['transport', 'Transport', 'needs', 0.15],
  ['insurance', 'Insurance', 'needs', 0.1],
  ['utilities', 'Utilities', 'needs', 0.1],
  ['needs-other', 'Other needs', 'needs', 0.05],
  ['wants', 'Wants', 'wants', 1],
  ['ra', 'Retirement annuity (RA)', 'savings', 0.3],
  ['tfsa', 'Tax-free savings (TFSA)', 'savings', 0.3],
  ['emergency', 'Emergency fund', 'savings', 0.2],
  ['debt', 'Debt repayment', 'savings', 0.1],
  ['savings-other', 'Other savings', 'savings', 0.1],
];

/** The built-in lines at 0 rands. Ids equal the kind, so they are stable across sessions. */
export function defaultBudgetCategories(): BudgetCategory[] {
  return DEFAULT_LINES.map(([kind, name, group, share]) => ({
    id: kind,
    name,
    group,
    kind,
    amount: 0,
    share,
  }));
}

/** Rands per group for a preset: net × the preset's fraction. A net below 0 budgets nothing. */
export function applyPreset(net: number, preset: BudgetPresetId): BudgetSplit {
  assertFinite('net', net);
  const base = Math.max(0, net);
  const split = BUDGET_PRESETS[preset];
  return {
    needs: base * split.needs,
    wants: base * split.wants,
    savings: base * split.savings,
  };
}

/**
 * Spreads each group's target over that group's lines.
 * Why this order: keeping the current proportions means a second preset rescales the user's own
 * split instead of wiping it; an empty group falls back to the default shares, and custom-only
 * groups (all shares 0) split equally. A group with no lines leaves its target unallocated.
 */
export function distributeToGroups(
  categories: readonly BudgetCategory[],
  targets: BudgetSplit,
): BudgetCategory[] {
  for (const group of BUDGET_GROUPS) assertAmount(group, targets[group]);
  const weights = new Map<BudgetGroup, (line: BudgetCategory) => number>();
  for (const group of BUDGET_GROUPS) {
    const lines = categories.filter((line) => line.group === group);
    const amounts = sum(lines.map((line) => line.amount));
    const shares = sum(lines.map((line) => line.share));
    weights.set(
      group,
      amounts > 0
        ? (line) => line.amount / amounts
        : shares > 0
          ? (line) => line.share / shares
          : () => 1 / lines.length,
    );
  }
  return categories.map((line) => ({
    ...line,
    amount: targets[line.group] * (weights.get(line.group)?.(line) ?? 0),
  }));
}

/** Sets one line's amount; below 0 becomes 0. A non-finite amount or unknown id changes nothing. */
export function setCategoryAmount(
  categories: readonly BudgetCategory[],
  id: string,
  amount: number,
): BudgetCategory[] {
  if (!Number.isFinite(amount)) return [...categories];
  return categories.map((line) =>
    line.id === id ? { ...line, amount: Math.max(0, amount) } : line,
  );
}

/** Sets one line from a percent of net: amount = net × max(0, percent) / 100. */
export function setCategoryPercent(
  categories: readonly BudgetCategory[],
  id: string,
  percent: number,
  net: number,
): BudgetCategory[] {
  if (!Number.isFinite(percent) || !Number.isFinite(net)) return [...categories];
  return setCategoryAmount(categories, id, (Math.max(0, net) * Math.max(0, percent)) / 100);
}

/** amount / net × 100; 0 when there is no net to divide by. */
export function percentOfNet(amount: number, net: number): number {
  return net > 0 ? (amount / net) * 100 : 0;
}

/** Appends a custom line at 0 rands. A duplicate id changes nothing. */
export function addCategory(
  categories: readonly BudgetCategory[],
  line: { readonly id: string; readonly name: string; readonly group: BudgetGroup },
): BudgetCategory[] {
  if (categories.some((existing) => existing.id === line.id)) return [...categories];
  return [
    ...categories,
    { id: line.id, name: line.name, group: line.group, kind: 'custom', amount: 0, share: 0 },
  ];
}

/** Renames a custom line (trimmed). Built-in lines and empty names change nothing. */
export function renameCategory(
  categories: readonly BudgetCategory[],
  id: string,
  name: string,
): BudgetCategory[] {
  const trimmed = name.trim();
  if (trimmed === '') return [...categories];
  return categories.map((line) =>
    line.id === id && line.kind === 'custom' ? { ...line, name: trimmed } : line,
  );
}

/** Removes a custom line. Built-in lines stay (set them to 0 instead). */
export function removeCategory(
  categories: readonly BudgetCategory[],
  id: string,
): BudgetCategory[] {
  return categories.filter((line) => line.id !== id || line.kind !== 'custom');
}

export type BudgetStatus = 'balanced' | 'under' | 'over';

export interface BudgetLineSummary {
  readonly id: string;
  readonly amount: number;
  readonly percent: number;
}

export interface BudgetGroupSummary {
  readonly group: BudgetGroup;
  readonly amount: number;
  readonly percent: number;
}

export interface BudgetSummary {
  readonly net: number;
  readonly total: number;
  /** net − total; negative when over. */
  readonly unallocated: number;
  /** max(0, net − total): what is still free to give a job. */
  readonly underAllocated: number;
  /** max(0, total − net). */
  readonly overAllocated: number;
  readonly percentAllocated: number;
  readonly status: BudgetStatus;
  /** needs, wants, savings order. */
  readonly groups: readonly BudgetGroupSummary[];
  /** Input order. */
  readonly lines: readonly BudgetLineSummary[];
}

/**
 * Totals, groups and per-line percents, all from full-precision amounts (the total percent is
 * not a sum of rounded parts). Status compares net and total at cents.
 */
export function summarise(categories: readonly BudgetCategory[], net: number): BudgetSummary {
  assertFinite('net', net);
  const total = sum(categories.map((line) => line.amount));
  const difference = roundRand(net - total);
  return {
    net,
    total,
    unallocated: net - total,
    underAllocated: Math.max(0, net - total),
    overAllocated: Math.max(0, total - net),
    percentAllocated: percentOfNet(total, net),
    status: difference > 0 ? 'under' : difference < 0 ? 'over' : 'balanced',
    groups: BUDGET_GROUPS.map((group) => {
      const amount = groupTotal(categories, group);
      return { group, amount, percent: percentOfNet(amount, net) };
    }),
    lines: categories.map((line) => ({
      id: line.id,
      amount: line.amount,
      percent: percentOfNet(line.amount, net),
    })),
  };
}

export interface BudgetLimitSettings {
  readonly net: number;
  /** TFSA contributions made in earlier years (growth excluded). */
  readonly tfsaLifetimeUsed: number;
  /** Months of needs the emergency fund should cover. */
  readonly emergencyMonths: number;
  /** Rands already in the emergency fund. */
  readonly emergencySaved: number;
}

/** Annual rands unless the name ends in Monthly (`monthly` is the budget line). */
export interface BudgetRaLimit {
  readonly monthly: number;
  readonly annual: number;
  readonly headroomAnnual: number;
  readonly headroomMonthly: number;
  readonly deductibleAnnual: number;
  readonly nonDeductibleAnnual: number;
  /** Lower PAYE through payroll, or the same amount as a refund on assessment. */
  readonly taxSavingAnnual: number;
  readonly over: boolean;
}

export interface BudgetTfsaLimit {
  readonly monthly: number;
  readonly annual: number;
  readonly annualLimit: number;
  readonly annualLimitMonthly: number;
  readonly contribution: TfsaContribution;
  /** Years at this pace (capped at the annual limit) to fill the lifetime room; null when 0. */
  readonly yearsToLifetime: number | null;
}

export interface BudgetEmergency {
  readonly monthly: number;
  readonly months: number;
  readonly needsMonthly: number;
  /** months × needs a month. */
  readonly target: number;
  readonly saved: number;
  /** saved / target × 100, from 0 to 100 (0 when there is no target). */
  readonly progressPercent: number;
  /** Whole months to the target; 0 when reached, null when nothing is going in. */
  readonly monthsToTarget: number | null;
  readonly reached: boolean;
}

export type BudgetWarning =
  | 'over-allocated'
  | 'ra-over-headroom'
  | 'tfsa-over-annual'
  | 'tfsa-over-lifetime';

export interface BudgetLimits {
  readonly ra: BudgetRaLimit;
  readonly tfsa: BudgetTfsaLimit;
  readonly emergency: BudgetEmergency;
  readonly overAllocated: number;
  /** In the order of `BudgetWarning`. */
  readonly warnings: readonly BudgetWarning[];
}

const MAX_EMERGENCY_MONTHS = 12;
/** Tolerance for float dust in a month count, so 28.0000000001 months does not become 29. */
const MONTH_EPSILON = 1e-9;

/**
 * The checks the Budget page shows: over-allocation, the RA line against the s11F headroom left
 * after payroll contributions, the TFSA line against the annual and lifetime limits, and the
 * emergency fund. RA and TFSA maths reuse `raHeadroom`, `raTaxSaving` and `tfsaContribution`.
 * Why the RA line is "on top of" payroll: it is a voluntary RA paid from take-home pay, so the
 * payroll contributions in `profile` have already used part of the headroom.
 */
export function limitWarnings(
  categories: readonly BudgetCategory[],
  profile: RaSalary,
  tables: TaxTables,
  rules: TfsaRules,
  settings: BudgetLimitSettings,
): BudgetLimits {
  const { net, tfsaLifetimeUsed, emergencyMonths, emergencySaved } = settings;
  assertAmount('tfsaLifetimeUsed', tfsaLifetimeUsed);
  assertWholeNumber('emergencyMonths', emergencyMonths, MAX_EMERGENCY_MONTHS);
  assertAmount('emergencySaved', emergencySaved);
  const summary = summarise(categories, net);

  const raMonthly = kindTotal(categories, 'ra');
  const headroom = raHeadroom(profile, tables);
  const saving = raTaxSaving(profile, raMonthly, tables);
  const nonDeductibleAnnual = saving.contribution - saving.deductible;
  const ra: BudgetRaLimit = {
    monthly: raMonthly,
    annual: saving.contribution,
    headroomAnnual: headroom.headroom,
    headroomMonthly: headroom.headroomMonthly,
    deductibleAnnual: saving.deductible,
    nonDeductibleAnnual,
    taxSavingAnnual: saving.saving,
    over: roundRand(nonDeductibleAnnual) > 0,
  };

  const tfsaMonthly = kindTotal(categories, 'tfsa');
  const tfsaAnnual = tfsaMonthly * MONTHS_PER_YEAR;
  const contribution = tfsaContribution(
    { desired: tfsaAnnual, lifetimeUsed: tfsaLifetimeUsed },
    rules,
  );
  const tfsa: BudgetTfsaLimit = {
    monthly: tfsaMonthly,
    annual: tfsaAnnual,
    annualLimit: rules.annualLimit,
    annualLimitMonthly: rules.annualLimit / MONTHS_PER_YEAR,
    contribution,
    yearsToLifetime:
      tfsaAnnual > 0 ? contribution.lifetimeRoom / Math.min(tfsaAnnual, rules.annualLimit) : null,
  };

  const emergency = emergencyFund(
    kindTotal(categories, 'emergency'),
    groupTotal(categories, 'needs'),
    emergencyMonths,
    emergencySaved,
  );

  const warnings: BudgetWarning[] = [];
  if (summary.status === 'over') warnings.push('over-allocated');
  if (ra.over) warnings.push('ra-over-headroom');
  if (contribution.overAnnual) warnings.push('tfsa-over-annual');
  if (contribution.overLifetime) warnings.push('tfsa-over-lifetime');

  return { ra, tfsa, emergency, overAllocated: summary.overAllocated, warnings };
}

function emergencyFund(
  monthly: number,
  needsMonthly: number,
  months: number,
  saved: number,
): BudgetEmergency {
  const target = months * needsMonthly;
  const remaining = Math.max(0, target - saved);
  const reached = target > 0 && roundRand(remaining) === 0;
  const progressPercent = target > 0 ? Math.min(100, Math.max(0, (saved / target) * 100)) : 0;
  let monthsToTarget: number | null = null;
  if (reached) monthsToTarget = 0;
  else if (remaining > 0 && monthly > 0) {
    monthsToTarget = Math.ceil(remaining / monthly - MONTH_EPSILON);
  }
  return { monthly, months, needsMonthly, target, saved, progressPercent, monthsToTarget, reached };
}

function groupTotal(categories: readonly BudgetCategory[], group: BudgetGroup): number {
  return sum(categories.filter((line) => line.group === group).map((line) => line.amount));
}

function kindTotal(categories: readonly BudgetCategory[], kind: BudgetKind): number {
  return sum(categories.filter((line) => line.kind === kind).map((line) => line.amount));
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Throws a RangeError naming the field unless `value` is finite (net pay can be below 0). */
function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite amount, got ${value}`);
  }
}
