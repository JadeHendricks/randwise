import {
  type RetireInput,
  type RetireIssue,
  type RetireResult,
  type RetireRules,
  type TaxTables,
  retireIssues,
  retirePlan,
} from '../engine';
import type { RetireInputs } from './retire-inputs';

/** Things worth telling the user about, in plain words on the page. */
export type RetireWarning =
  | 'de-minimis'
  | 'high-return'
  | 'high-required-return'
  | 'required-return-unreachable'
  | 'drawdown-cap';

/** Why no result can be shown: an engine issue, or figures the engine could not work with. */
export type RetireProblem = RetireIssue | 'invalid-figures';

export interface RetireEstimateOk {
  readonly ok: true;
  /** Full precision, straight from the engine. Round with `roundRand` only for display. */
  readonly result: RetireResult;
  readonly warnings: readonly RetireWarning[];
}

export interface RetireEstimateFailed {
  readonly ok: false;
  readonly problems: readonly RetireProblem[];
}

export type RetireEstimate = RetireEstimateOk | RetireEstimateFailed;

/** A product threshold for the soft "return looks high" warning. Not a tax rule. */
export const HIGH_RETURN = 0.12;

/**
 * The retirement plan for the page inputs. The inputs hold percents (5 means 5%); the engine takes
 * fractions, so they are divided by 100 here. Never throws for bad figures: the engine issues come
 * back first as `problems`, and a RangeError becomes `['invalid-figures']`, like `estimateRa`.
 */
export function estimateRetire(
  inputs: RetireInputs,
  tables: TaxTables,
  rules: RetireRules,
): RetireEstimate {
  const input: RetireInput = {
    salary: {
      grossMonthly: inputs.grossMonthly,
      age: inputs.age,
      medicalMembers: inputs.medicalMembers,
      employeeRetirementMonthly: inputs.employeeRetirementMonthly,
      employerRetirementMonthly: inputs.employerRetirementMonthly,
    },
    goalNetMonthlyToday: inputs.goalNetMonthly,
    retirementAge: inputs.retirementAge,
    inflation: inputs.inflationPercent / 100,
    returnBeforeRetirement: inputs.returnPercent / 100,
    returnInRetirement: inputs.retirementReturnPercent / 100,
    drawdownRate: inputs.drawdownPercent / 100,
    takeLumpSum: inputs.takeLumpSum,
    startingBalance: inputs.startingBalance,
    monthlyContribution: inputs.contributionMonthly,
    escalation: inputs.escalationPercent / 100,
  };

  let result: RetireResult;
  try {
    const issues = retireIssues(input, rules);
    if (issues.length > 0) return { ok: false, problems: issues };
    result = retirePlan(input, tables, rules);
  } catch (error) {
    // Why: the engine signals a figure it cannot work with (a rate outside 0..1, a figure beyond
    // the solver's limits) with a RangeError. That is the user's input, so it gets a plain
    // sentence; anything else is a bug and must not be hidden.
    if (error instanceof RangeError) return { ok: false, problems: ['invalid-figures'] };
    throw error;
  }

  return { ok: true, result, warnings: warningsOf(input, result) };
}

function warningsOf(input: RetireInput, result: RetireResult): RetireWarning[] {
  const warnings: RetireWarning[] = [];
  const { requiredReturn } = result;
  if (result.capital.wholeMayBeCommuted) warnings.push('de-minimis');
  if (input.returnBeforeRetirement > HIGH_RETURN || input.returnInRetirement > HIGH_RETURN) {
    warnings.push('high-return');
  }
  if (requiredReturn.status === 'solved' && (requiredReturn.rate ?? 0) > HIGH_RETURN) {
    warnings.push('high-required-return');
  }
  if (requiredReturn.status === 'unreachable') warnings.push('required-return-unreachable');
  if (result.drawdown.maxRateExceededAge !== null) warnings.push('drawdown-cap');
  return warnings;
}
