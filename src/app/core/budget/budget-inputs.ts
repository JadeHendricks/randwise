import {
  type BudgetCategory,
  applyPreset,
  defaultBudgetCategories,
  distributeToGroups,
  setCategoryAmount,
} from '../engine';
import { amountOr, wholeOr } from '../ra/ra-inputs';
import { SALARY_LIMITS } from '../salary/salary-inputs';

/** The Budget choices that are not part of the income or the lines. */
export interface BudgetSettings {
  /** Months of needs the emergency fund should cover. */
  readonly emergencyMonths: number;
  /** Rands already in the emergency fund. */
  readonly emergencySaved: number;
  /** TFSA contributions made in earlier years (growth excluded), rands. */
  readonly tfsaLifetimeUsed: number;
}

export const BUDGET_LIMITS = {
  age: SALARY_LIMITS.age,
  medicalMembers: SALARY_LIMITS.medicalMembers,
  // Why 1..12: the engine accepts 0..12 whole months; a fund for 0 months has no target to show.
  emergencyMonths: { min: 1, max: 12 },
} as const;

/** "3 to 6 months of needs" is the common guide, so the example starts at the low end. */
export const BUDGET_SETTINGS_DEFAULT: BudgetSettings = {
  emergencyMonths: 3,
  emergencySaved: 0,
  tfsaLifetimeUsed: 0,
};

/**
 * Applies `patch` to `current` like the other sanitisers: amounts must be finite and 0 or more
 * (an invalid one keeps its current value), the month count is rounded and clamped.
 */
export function sanitiseBudgetSettings(
  patch: Partial<BudgetSettings>,
  current: BudgetSettings,
): BudgetSettings {
  return {
    emergencyMonths: wholeOr(
      patch.emergencyMonths,
      current.emergencyMonths,
      BUDGET_LIMITS.emergencyMonths,
    ),
    emergencySaved: amountOr(patch.emergencySaved, current.emergencySaved),
    tfsaLifetimeUsed: amountOr(patch.tfsaLifetimeUsed, current.tfsaLifetimeUsed),
  };
}

/** The example budget: 50/30/20 of `net`, spread over the default lines by their shares. */
export function exampleCategories(net: number): BudgetCategory[] {
  return distributeToGroups(defaultBudgetCategories(), applyPreset(net, '50-30-20'));
}

/** Monthly RA, TFSA and emergency amounts sent from another page; they replace the matching budget lines. */
export interface BudgetSentLines {
  readonly raMonthly?: number;
  readonly tfsaMonthly?: number;
  readonly emergencyMonthly?: number;
}

/** Sets the first RA, TFSA and emergency lines to the sent amounts; other lines stay as they are. */
export function withSentLines(
  categories: readonly BudgetCategory[],
  sent: BudgetSentLines | null,
): BudgetCategory[] {
  let lines = [...categories];
  if (!sent) return lines;
  for (const [kind, amount] of [
    ['ra', sent.raMonthly],
    ['tfsa', sent.tfsaMonthly],
    ['emergency', sent.emergencyMonthly],
  ] as const) {
    const line = lines.find((candidate) => candidate.kind === kind);
    if (line && amount !== undefined) lines = setCategoryAmount(lines, line.id, amount);
  }
  return lines;
}
