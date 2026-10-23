import { formatRand } from '../../../shared/format/format-rand';
import {
  ReportModel,
  percentPoints,
  rand,
  text,
} from '../../../core/pdf/report-model';

export interface EmergencyFundReportInputs {
  readonly monthlyExpenses: number;
  readonly targetMonths: number;
  readonly currentSavings: number;
  readonly monthlyContribution: number;
  readonly savingsRatePercent: number;
}

/** The fields of the page's `result()` the report reads. */
export interface EmergencyFundReportResult {
  readonly target: number;
  readonly lead: string;
  readonly goalMonths: string;
  readonly goalSpan: string;
  readonly withoutInterest: string;
  readonly shortfall: number;
  readonly interestSentence: string;
  readonly ringPercent: number;
  readonly progressText: string;
  readonly warnings: readonly string[];
}

/** Formats the Emergency fund page's existing results. Every number comes from `result`. */
export function buildEmergencyFundReport(
  inputs: EmergencyFundReportInputs,
  result: EmergencyFundReportResult,
): ReportModel {
  return {
    id: 'emergency-fund',
    title: 'Emergency fund',
    subtitle: `${inputs.targetMonths} months of essentials, ${formatRand(inputs.monthlyExpenses)} a month`,
    inputs: [
      {
        rows: [
          { label: 'Essential expenses per month', value: rand(inputs.monthlyExpenses, 'a month') },
          { label: 'Months to cover', value: text(String(inputs.targetMonths)) },
          { label: 'Savings so far', value: rand(inputs.currentSavings) },
          { label: 'Saved each month', value: rand(inputs.monthlyContribution, 'a month') },
          { label: 'Savings interest rate per year', value: percentPoints(inputs.savingsRatePercent, 2) },
        ],
      },
    ],
    results: [
      {
        rows: [
          {
            label: 'Your emergency fund target',
            value: rand(result.target),
            detail: result.lead,
            emphasis: true,
          },
          { label: 'Still to save', value: rand(result.shortfall) },
          {
            label: 'Time to your goal',
            value: text(result.goalMonths),
            detail: [result.goalSpan, result.withoutInterest].filter(Boolean).join('. '),
          },
          { label: 'Saved so far', value: percentPoints(result.ringPercent, 0), detail: 'of the target' },
        ],
        paragraphs: [result.progressText, ...(result.interestSentence ? [result.interestSentence] : [])],
      },
    ],
    charts: [{ id: 'emergency-balance', title: 'Your balance over time' }],
    warnings: result.warnings,
    notes: [
      "Interest is worked out each month at the yearly rate divided by 12, and each month's saving is added at the end of the month.",
    ],
  };
}
