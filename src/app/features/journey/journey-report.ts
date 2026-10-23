import { ReportModel, ReportSection, percentPoints, rand, text } from '../../core/pdf/report-model';
import { ProfileInputs, profileRows } from '../profile-report';

/** The Journey inputs the report lists. The context store's `JourneyInputs` is assignable. */
export interface JourneyReportInputs extends ProfileInputs {
  readonly retirementAge: number;
  readonly incomeEscalationPercent: number;
  readonly contributionMonthly: number;
  readonly escalationPercent: number;
  readonly startingBalance: number;
  readonly tfsaBalance: number;
  readonly tfsaLifetimeUsed: number;
  readonly tfsaTopUpMonthly: number;
  readonly returnPercent: number;
  readonly tfsaReturnPercent: number;
  readonly inflationPercent: number;
  readonly allowOverContribution: boolean;
}

/** The fields of the page's `result()` the report reads. */
export interface JourneyReportResult {
  readonly retirementAge: number;
  readonly taxSaved: number;
  readonly tfsaSentence: string;
  readonly raSentence: string;
  readonly timeline: readonly { readonly title: string; readonly detail: string }[];
  readonly ringPercent: number;
  readonly lifetimeText: string;
  readonly warnings: readonly string[];
}

/**
 * Formats the Journey page's existing results. Every number comes from `result`.
 * `refundModeLabel` is the on-screen label of the chosen refund mode.
 */
export function buildJourneyReport(
  inputs: JourneyReportInputs,
  result: JourneyReportResult,
  refundModeLabel: string,
): ReportModel {
  const milestones: ReportSection = {
    heading: 'Your milestones',
    rows: [],
    paragraphs: result.timeline.map((item) => `${item.title}: ${item.detail}`),
  };
  return {
    id: 'journey',
    title: 'Journey: RA and TFSA to retirement',
    subtitle: `${result.raSentence}. ${result.tfsaSentence}`,
    inputs: [
      {
        rows: [
          { label: 'RA contribution', value: rand(inputs.contributionMonthly, 'a month') },
          { label: 'Yearly increase in RA contributions', value: percentPoints(inputs.escalationPercent, 2) },
          { label: 'RA balance today', value: rand(inputs.startingBalance) },
          { label: 'TFSA balance today', value: rand(inputs.tfsaBalance) },
          { label: 'TFSA contributions so far', value: rand(inputs.tfsaLifetimeUsed) },
          { label: 'TFSA top-up', value: rand(inputs.tfsaTopUpMonthly, 'a month') },
          { label: 'RA return per year', value: percentPoints(inputs.returnPercent, 2) },
          { label: 'TFSA return per year', value: percentPoints(inputs.tfsaReturnPercent, 2) },
          { label: 'Inflation per year', value: percentPoints(inputs.inflationPercent, 2) },
          { label: 'Income growth per year', value: percentPoints(inputs.incomeEscalationPercent, 2) },
          { label: 'Retirement age', value: text(String(inputs.retirementAge)) },
          { label: 'Tax refund', value: text(refundModeLabel) },
          { label: 'Allow over-contribution', value: text(inputs.allowOverContribution ? 'Yes' : 'No') },
        ],
      },
      { heading: 'Your salary (used for tax)', rows: profileRows(inputs) },
    ],
    results: [
      {
        rows: [
          {
            label: `Tax saved by ${result.retirementAge}`,
            value: rand(result.taxSaved),
            emphasis: true,
          },
          {
            label: 'TFSA lifetime limit used by retirement',
            value: percentPoints(result.ringPercent, 0),
            detail: result.lifetimeText,
          },
        ],
        paragraphs: [result.raSentence, result.tfsaSentence],
      },
      milestones,
    ],
    charts: [
      { id: 'journey-balances', title: 'Your balances over time' },
      { id: 'journey-lifetime', title: 'TFSA lifetime limit' },
    ],
    warnings: result.warnings,
    notes: [],
  };
}
