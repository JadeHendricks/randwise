import { ReportModel, percentPoints, rand, text } from '../../../core/pdf/report-model';

export interface TwoPotReportInputs {
  readonly withdrawal: number;
  readonly taxableIncomeAnnual: number;
  readonly age: number;
  readonly medicalMembers: number;
  readonly yearsToRetirement: number;
  readonly realGrowthPercent: number;
  readonly inflationPercent: number;
}

/** The fields of the page's `result()` the report reads. */
export interface TwoPotReportResult {
  readonly figure: number;
  readonly lead: string;
  readonly perRand: string;
  readonly tax: number;
  readonly effectiveRate: string;
  readonly netCash: number;
  readonly lostGrowth: number;
  readonly lostGrowthFuture: string;
  readonly rate: string;
  readonly bands: readonly {
    readonly from: string;
    readonly to: string;
    readonly amount: string;
    readonly rate: string;
    readonly tax: string;
  }[];
  readonly growthText: string;
  readonly warnings: readonly string[];
}

/** Formats the Two-pot page's existing results. Every number comes from `result`. */
export function buildTwoPotReport(
  inputs: TwoPotReportInputs,
  result: TwoPotReportResult,
): ReportModel {
  return {
    id: 'two-pot-withdrawal',
    title: 'Two-pot withdrawal: what it really costs',
    subtitle: result.lead,
    inputs: [
      {
        rows: [
          { label: 'Amount to withdraw', value: rand(inputs.withdrawal) },
          { label: 'Taxable income per year', value: rand(inputs.taxableIncomeAnnual, 'a year') },
          { label: 'Your age', value: text(String(inputs.age)) },
          { label: 'Medical aid members', value: text(String(inputs.medicalMembers)) },
          { label: 'Years until you retire', value: text(String(inputs.yearsToRetirement)) },
          { label: 'Growth above inflation per year', value: percentPoints(inputs.realGrowthPercent, 2) },
          { label: 'Inflation per year', value: percentPoints(inputs.inflationPercent, 2) },
        ],
      },
    ],
    results: [
      {
        rows: [
          {
            label: "True cost in today's money",
            value: rand(result.figure),
            detail: result.lead,
            emphasis: true,
          },
          { label: 'Tax on the withdrawal', value: rand(result.tax), detail: result.effectiveRate },
          { label: 'Cash you receive', value: rand(result.netCash) },
          {
            label: 'Growth you give up',
            value: rand(result.lostGrowth),
            detail: result.lostGrowthFuture,
          },
          { label: 'Tax rate on the withdrawal', value: text(result.rate) },
        ],
        paragraphs: [...(result.perRand ? [result.perRand] : []), result.growthText],
      },
      {
        heading: 'Tax by bracket',
        rows: result.bands.map((band) => ({
          label: `${band.from} to ${band.to}`,
          value: text(band.tax),
          detail: `${band.rate} on ${band.amount}`,
        })),
      },
    ],
    charts: [{ id: 'two-pot-parts', title: 'What the money could have become' }],
    warnings: result.warnings,
    notes: [
      'SARS adds the withdrawal to your other income and taxes it at your marginal rate. Your fund may hold back tax at a different rate and the difference is settled when SARS assesses you. Fund fees are not included.',
    ],
  };
}
