import {
  type BudgetCategory,
  type BudgetLimits,
  type BudgetSummary,
  type TaxTables,
  type TfsaRules,
  limitWarnings,
  summarise,
} from '../engine';
import { type SalaryEstimateOk, estimateSalary } from '../salary/estimate-salary';
import type { SalaryInputs } from '../salary/salary-inputs';
import {
  type BudgetSentLines,
  type BudgetSettings,
  exampleCategories,
  withSentLines,
} from './budget-inputs';

/** What the Budget estimate works from: the income, the saved lines (or null) and the settings. */
export interface BudgetEstimateInput {
  readonly income: SalaryInputs;
  /** Null means the example: 50/30/20 of the take-home. */
  readonly categories: readonly BudgetCategory[] | null;
  readonly sentLines: BudgetSentLines | null;
  readonly settings: BudgetSettings;
}

export interface BudgetEstimateOk {
  readonly ok: true;
  /** The Salary estimate the budget base comes from. */
  readonly salary: SalaryEstimateOk;
  /** Take-home pay a month, full precision: the base of the budget. */
  readonly net: number;
  /** Gross pay a month, full precision. */
  readonly gross: number;
  /** The lines in use: saved or example, with any sent amounts applied. */
  readonly categories: readonly BudgetCategory[];
  readonly summary: BudgetSummary;
  readonly limits: BudgetLimits;
}

export interface BudgetEstimateFailed {
  readonly ok: false;
  readonly message: string;
}

export type BudgetEstimate = BudgetEstimateOk | BudgetEstimateFailed;

const GENERIC_FAILURE_MESSAGE =
  'Those figures could not be worked out. Check the amounts and try again.';

/**
 * The budget for the page inputs. The base is take-home pay from `estimateSalary` (payroll
 * retirement and other deductions are already out of it; the employer contribution is not cash).
 * Never throws for bad figures: a Salary failure comes back with the Salary message, and a
 * RangeError from the engine becomes a plain sentence, like `estimateRetire`.
 */
export function estimateBudget(
  input: BudgetEstimateInput,
  tables: TaxTables,
  rules: TfsaRules,
): BudgetEstimate {
  const salary = estimateSalary(input.income, tables);
  if (!salary.ok) return { ok: false, message: salary.message };

  const { netPay: net, gross } = salary.payslip.monthly;
  try {
    const categories = withSentLines(input.categories ?? exampleCategories(net), input.sentLines);
    const summary = summarise(categories, net);
    const limits = limitWarnings(
      categories,
      {
        grossMonthly: gross,
        age: input.income.age,
        medicalMembers: input.income.medicalMembers,
        employeeRetirementMonthly: input.income.employeeRetirementMonthly,
        employerRetirementMonthly: input.income.employerRetirementMonthly,
      },
      tables,
      rules,
      { net, ...input.settings },
    );
    return { ok: true, salary, net, gross, categories, summary, limits };
  } catch (error) {
    // Why: the engine signals a figure it cannot work with with a RangeError. That is the user's
    // input, so it gets a plain sentence; anything else is a bug and must not be hidden.
    if (error instanceof RangeError) return { ok: false, message: GENERIC_FAILURE_MESSAGE };
    throw error;
  }
}
