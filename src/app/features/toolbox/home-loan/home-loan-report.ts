import { ReportModel, ReportRow, percentPoints, rand, text } from '../../../core/pdf/report-model';

export interface HomeLoanReportInputs {
  readonly grossMonthly: number;
  readonly existingDebtMonthly: number;
  readonly deposit: number;
  readonly ratePercent: number;
  readonly termYears: number;
  readonly mode: 'afford' | 'price';
  readonly purchasePrice: number;
  readonly ratesAndLeviesMonthly: number;
  readonly insuranceMonthly: number;
}

/** The fields of the page's `result()` the report reads. */
export interface HomeLoanReportResult {
  readonly eyebrow: string;
  readonly figure: number;
  readonly lead: string;
  readonly loan: number;
  readonly repayment: number;
  readonly repaymentSecondary: string;
  readonly interest: number;
  readonly totalPaid: string;
  readonly monthlyCost: number;
  readonly ringPercent: number;
  readonly ruleText: string;
  readonly warnings: readonly string[];
}

/**
 * Formats the Home loan page's existing results. Every number comes from `result`.
 * `modeLabel` is the on-screen label of the chosen mode.
 */
export function buildHomeLoanReport(
  inputs: HomeLoanReportInputs,
  result: HomeLoanReportResult,
  modeLabel: string,
): ReportModel {
  const inputRows: ReportRow[] = [
    { label: 'Gross pay', value: rand(inputs.grossMonthly, 'a month') },
    { label: 'Other debt repayments', value: rand(inputs.existingDebtMonthly, 'a month') },
    { label: 'Deposit', value: rand(inputs.deposit) },
    { label: 'Bond interest rate per year', value: percentPoints(inputs.ratePercent, 2) },
    { label: 'Bond term', value: text(`${inputs.termYears} years`) },
    { label: 'Show me', value: text(modeLabel) },
    ...(inputs.mode === 'price'
      ? [{ label: 'Purchase price', value: rand(inputs.purchasePrice) }]
      : []),
    { label: 'Rates and levies', value: rand(inputs.ratesAndLeviesMonthly, 'a month') },
    { label: 'Home insurance', value: rand(inputs.insuranceMonthly, 'a month') },
  ];
  return {
    id: 'home-loan',
    title: 'Home loan',
    subtitle: result.lead,
    inputs: [{ rows: inputRows }],
    results: [
      {
        rows: [
          { label: result.eyebrow, value: rand(result.figure), detail: result.lead, emphasis: true },
          { label: 'Loan amount', value: rand(result.loan) },
          {
            label: 'Monthly repayment',
            value: rand(result.repayment),
            ...(result.repaymentSecondary ? { detail: result.repaymentSecondary } : {}),
          },
          { label: 'Total interest', value: rand(result.interest), detail: result.totalPaid },
          { label: 'Total monthly cost', value: rand(result.monthlyCost), detail: 'Repayment plus rates, levies and insurance.' },
          { label: 'Debt repayments as a share of gross pay', value: percentPoints(result.ringPercent, 0) },
        ],
        paragraphs: [result.ruleText],
      },
    ],
    charts: [
      { id: 'home-loan-first-year', title: 'Your first year of repayments' },
      { id: 'home-loan-balance', title: 'What you still owe' },
    ],
    warnings: result.warnings,
    notes: [
      'The bond rate is a yearly rate paid monthly (divided by 12). Banks run their own affordability checks and may count rates, levies and insurance, which this rule of thumb does not.',
    ],
  };
}
