import { formatRand } from '../../shared/format/format-rand';
import { ReportModel, ReportRow, percentPoints, rand, text } from '../../core/pdf/report-model';

interface Pair {
  readonly monthly: number;
  readonly annual: number;
}

/** The salary inputs the report lists. The store's `SalaryInputs` is assignable to this. */
export interface PayReportInputs {
  readonly basis: 'gross' | 'net';
  readonly amount: number;
  readonly age: number;
  readonly employeeRetirementMonthly: number;
  readonly employerRetirementMonthly: number;
  readonly otherDeductionsMonthly: number;
}

/** The fields of the page's `result()` the report reads. */
export interface PayReportResult {
  readonly net: Pair;
  readonly gross: Pair;
  readonly paye: Pair;
  readonly uif: Pair;
  readonly medicalCredit: Pair;
  readonly taxableIncome: Pair;
  readonly retirement: { readonly deductible: Pair; readonly excess: Pair; readonly headroom: Pair };
  readonly overLimit: boolean;
  readonly usedPercent: number;
  readonly marginalRate: string;
  readonly effectiveRate: string;
}

const pairRow = (label: string, pair: Pair, emphasis = false): ReportRow => ({
  label,
  value: rand(pair.monthly, 'a month'),
  detail: `${formatRand(pair.annual)} a year`,
  ...(emphasis ? { emphasis } : {}),
});

/** Formats the Pay page's existing results. Every number comes from `result`; nothing is recomputed. */
export function buildPayReport(
  inputs: PayReportInputs,
  result: PayReportResult,
  amountLabel: string,
  medicalWords: string,
): ReportModel {
  return {
    id: 'pay',
    title: 'Pay: take-home estimate',
    subtitle: `Based on ${formatRand(result.gross.monthly)} gross pay a month`,
    inputs: [
      {
        rows: [
          { label: amountLabel, value: rand(inputs.amount) },
          { label: 'Age at the end of the tax year', value: text(String(inputs.age)) },
          { label: 'People on your medical aid', value: text(medicalWords) },
          { label: 'Your retirement contributions', value: rand(inputs.employeeRetirementMonthly, 'a month') },
          {
            label: 'Employer retirement contributions',
            value: rand(inputs.employerRetirementMonthly, 'a month'),
          },
          { label: 'Other deductions', value: rand(inputs.otherDeductionsMonthly, 'a month') },
        ],
      },
    ],
    results: [
      {
        rows: [
          {
            label: 'Net pay',
            value: rand(result.net.monthly, 'a month'),
            detail: `${formatRand(result.net.annual)} a year`,
            emphasis: true,
          },
          ...(inputs.basis === 'net'
            ? [{ label: 'Gross pay needed', value: rand(result.gross.monthly, 'a month') }]
            : []),
          pairRow('PAYE', result.paye),
          pairRow('UIF', result.uif),
          pairRow('Medical credit', result.medicalCredit),
          pairRow('Taxable income', result.taxableIncome),
          { label: 'Marginal rate', value: text(result.marginalRate), detail: 'Tax on your next rand of income' },
          { label: 'Effective rate', value: text(result.effectiveRate), detail: 'PAYE as a share of gross pay' },
        ],
      },
      {
        heading: 'Retirement deduction',
        rows: [
          {
            label: 'Deductible this year',
            value: rand(result.retirement.deductible.annual, 'a year'),
            detail: `${formatRand(result.retirement.deductible.monthly)} a month`,
          },
          {
            label: 'Excess carried forward',
            value: rand(result.retirement.excess.annual, 'a year'),
            detail: `${formatRand(result.retirement.excess.monthly)} a month`,
          },
          {
            label: 'Remaining headroom',
            value: rand(result.retirement.headroom.annual, 'a year'),
            detail: `${formatRand(result.retirement.headroom.monthly)} a month`,
          },
          { label: 'Share of the limit used', value: percentPoints(result.usedPercent, 0) },
        ],
      },
    ],
    charts: [
      { id: 'pay-breakdown', title: 'Where your gross pay goes each month' },
      { id: 'pay-net-by-gross', title: 'Net pay by gross pay, per month' },
    ],
    warnings: result.overLimit
      ? [
          "You contribute more than this year's limit. The excess is not taxed now; it carries forward to later years.",
        ]
      : [],
    notes: [
      'PAYE uses the annual-equivalent method, so it can differ from your payslip by a few cents.',
    ],
  };
}
