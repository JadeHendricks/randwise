import { ReportModel, percentPoints, rand, text } from '../../../core/pdf/report-model';

export interface TfsaCompareReportInputs {
  readonly lumpSum: number;
  readonly yearlyContribution: number;
  readonly years: number;
  readonly returnPercent: number;
  readonly interestPercent: number;
  readonly dividendPercent: number;
  readonly marginalRatePercent: number;
  readonly age: number;
  readonly tfsaLifetimeUsed: number;
}

/** The fields of the page's `result()` the report reads. */
export interface TfsaCompareReportResult {
  readonly figure: number;
  readonly lead: string;
  readonly tfsaEnd: number;
  readonly tfsaEndSecondary: string;
  readonly taxableEnd: number;
  readonly taxableEndSecondary: string;
  readonly warnings: readonly string[];
}

/**
 * Formats the TFSA vs taxable page's existing results. Every number comes from `result`.
 * `assumptions` are the sentences the page lists under "What this assumes".
 */
export function buildTfsaCompareReport(
  inputs: TfsaCompareReportInputs,
  result: TfsaCompareReportResult,
  assumptions: readonly string[],
): ReportModel {
  return {
    id: 'tfsa-vs-taxable',
    title: 'TFSA vs a taxable account',
    subtitle: result.lead,
    inputs: [
      {
        rows: [
          { label: 'Lump sum to invest now', value: rand(inputs.lumpSum) },
          { label: 'Added at the start of every year', value: rand(inputs.yearlyContribution, 'a year') },
          { label: 'Years to invest', value: text(String(inputs.years)) },
          { label: 'Return per year', value: percentPoints(inputs.returnPercent, 2) },
          { label: 'Share of the return paid as interest', value: percentPoints(inputs.interestPercent, 0) },
          { label: 'Share of the return paid as dividends', value: percentPoints(inputs.dividendPercent, 0) },
          { label: 'Your marginal tax rate', value: percentPoints(inputs.marginalRatePercent, 1) },
          { label: 'Your age', value: text(String(inputs.age)) },
          { label: 'Already put into a TFSA', value: rand(inputs.tfsaLifetimeUsed) },
        ],
      },
    ],
    results: [
      {
        rows: [
          {
            label: 'What the TFSA gains you',
            value: rand(result.figure),
            detail: result.lead,
            emphasis: true,
          },
          {
            label: 'Value in the TFSA',
            value: rand(result.tfsaEnd),
            detail: result.tfsaEndSecondary,
          },
          {
            label: 'Value in a taxable account',
            value: rand(result.taxableEnd),
            detail: result.taxableEndSecondary,
          },
        ],
      },
    ],
    charts: [
      { id: 'tfsa-tax', title: 'Tax paid in the taxable account' },
      { id: 'tfsa-growth', title: 'How the two grow' },
    ],
    warnings: result.warnings,
    notes: assumptions,
  };
}
