import { formatPercent } from '../../shared/format/format-rand';
import { ReportModel, ReportSection, percentPoints, rand, text } from '../../core/pdf/report-model';

/** The income inputs the report lists. The store's `SalaryInputs` is assignable to this. */
export interface BudgetReportIncome {
  readonly amount: number;
  readonly age: number;
  readonly medicalMembers: number;
  readonly employeeRetirementMonthly: number;
  readonly otherDeductionsMonthly: number;
}

export interface BudgetReportSettings {
  readonly emergencyMonths: number;
  readonly emergencySaved: number;
  readonly tfsaLifetimeUsed: number;
}

/** The fields of the page's `result()` the report reads. */
export interface BudgetReportResult {
  readonly net: number;
  readonly status: 'balanced' | 'under' | 'over';
  readonly sentence: string;
  readonly overText: string;
  readonly groups: readonly {
    readonly heading: string;
    readonly lines: readonly {
      readonly name: string;
      readonly amount: number;
      readonly percent: number;
    }[];
  }[];
  readonly checks: readonly { readonly text: string; readonly warn: boolean }[];
  readonly emergencyPercent: number;
  readonly emergencyText: string;
}

/** Formats the Budget page's existing results. Every number comes from `result`. */
export function buildBudgetReport(
  income: BudgetReportIncome,
  settings: BudgetReportSettings,
  result: BudgetReportResult,
  amountLabel: string,
): ReportModel {
  const groups = result.groups.map<ReportSection>((group) => ({
    heading: group.heading,
    rows: group.lines.map((line) => ({
      label: line.name,
      value: rand(line.amount, 'a month'),
      detail: `${formatPercent(line.percent / 100, 2)} of take-home`,
    })),
  }));
  const info = result.checks.filter((check) => !check.warn).map((check) => check.text);
  const warnings = result.checks.filter((check) => check.warn).map((check) => check.text);
  if (result.status === 'over') warnings.push(result.overText);

  return {
    id: 'budget',
    title: 'Budget: where your take-home goes',
    subtitle: result.sentence,
    inputs: [
      {
        rows: [
          { label: amountLabel, value: rand(income.amount) },
          { label: 'Age at the end of the tax year', value: text(String(income.age)) },
          { label: 'People on your medical aid', value: text(String(income.medicalMembers)) },
          { label: 'Your retirement contributions', value: rand(income.employeeRetirementMonthly, 'a month') },
          { label: 'Other deductions', value: rand(income.otherDeductionsMonthly, 'a month') },
          { label: 'Emergency fund target', value: text(`${settings.emergencyMonths} months of needs`) },
          { label: 'Emergency fund saved so far', value: rand(settings.emergencySaved) },
          { label: 'TFSA contributions so far', value: rand(settings.tfsaLifetimeUsed) },
        ],
      },
    ],
    results: [
      {
        rows: [
          {
            label: 'Monthly take-home',
            value: rand(result.net, 'a month'),
            detail: result.sentence,
            emphasis: true,
          },
        ],
      },
      ...groups,
      {
        heading: 'Emergency fund',
        rows: [{ label: 'Saved so far', value: percentPoints(result.emergencyPercent, 0), detail: 'of target' }],
        paragraphs: [result.emergencyText],
      },
      ...(info.length > 0 ? [{ heading: 'Savings checks', rows: [], paragraphs: info }] : []),
    ],
    charts: [
      { id: 'budget-split', title: 'Where your take-home goes' },
      { id: 'budget-emergency', title: 'Emergency fund saved so far' },
    ],
    warnings,
    notes: [],
  };
}
