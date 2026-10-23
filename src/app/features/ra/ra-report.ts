import { formatRand } from '../../shared/format/format-rand';
import { ReportModel, ReportRow, percentPoints, rand, text } from '../../core/pdf/report-model';
import { ProfileInputs, profileRows } from '../profile-report';

/** The RA inputs the report lists. The context store's `RaInputs` is assignable to this. */
export interface RaReportInputs extends ProfileInputs {
  readonly contributionMonthly: number;
  readonly escalationPercent: number;
  readonly startingBalance: number;
  readonly returnPercent: number;
  readonly inflationPercent: number;
  readonly retirementAge: number;
}

/** The fields of the page's `result()` the report reads. */
export interface RaReportResult {
  readonly retirementAge: number;
  readonly years: number;
  readonly nominal: number;
  readonly real: number;
  readonly paidIn: number;
  readonly growth: number;
  readonly savings: number;
  readonly retirementPot: number;
  readonly vested: number;
  readonly usedPercent: number;
  readonly overCap: boolean;
  readonly overCapAmount: string;
  readonly belowEarliest: boolean;
  readonly earliestAge: number;
  readonly pastAge: boolean;
  readonly limit: number;
  readonly room: number;
  readonly left: number;
  readonly saving: number;
  readonly savingMonthly: string;
  readonly netCostMonthly: number;
  readonly marginal: string;
  readonly approxWhy: string | null;
  readonly twoPotNote: string;
  readonly sentence: string;
}

/** Formats the RA page's existing results. Every number comes from `result`; nothing is recomputed. */
export function buildRaReport(inputs: RaReportInputs, result: RaReportResult): ReportModel {
  const warnings: string[] = [];
  if (result.overCap) {
    warnings.push(
      `${result.overCapAmount} of your contributions this year is over the tax-deductible limit. It gets no deduction this year and carries forward to later years (this calculator does not model when it is used).`,
    );
  }
  if (result.belowEarliest) {
    warnings.push(
      `An RA cannot pay out before age ${result.earliestAge}, so the projection runs to ${result.earliestAge}.`,
    );
  }
  if (result.pastAge) {
    warnings.push(
      `You are already ${result.retirementAge} or older, so the projection shows today's balance.`,
    );
  }
  const results: ReportRow[] = [
    {
      label: `Projected RA balance at ${result.retirementAge}`,
      value: rand(result.nominal),
      // The page hides this sentence when there is no projection (already at retirement age).
      ...(result.years > 0 ? { detail: result.sentence } : {}),
      emphasis: true,
    },
    { label: "In today's money", value: rand(result.real) },
    { label: "Paid in (with today's balance)", value: rand(result.paidIn) },
    { label: 'Investment growth', value: rand(result.growth) },
    { label: 'Tax saving', value: rand(result.saving, 'a year'), detail: result.savingMonthly },
    { label: 'Cost after tax', value: rand(result.netCostMonthly, 'a month') },
    { label: 'Marginal rate', value: text(result.marginal) },
  ];
  return {
    id: 'ra',
    title: 'RA: retirement annuity projection',
    subtitle: `Based on ${formatRand(inputs.contributionMonthly)} a month until age ${inputs.retirementAge}`,
    inputs: [
      {
        rows: [
          { label: 'Extra RA contribution', value: rand(inputs.contributionMonthly, 'a month') },
          { label: 'Yearly increase in contributions', value: percentPoints(inputs.escalationPercent, 2) },
          { label: 'RA balance today', value: rand(inputs.startingBalance) },
          { label: 'Expected return per year', value: percentPoints(inputs.returnPercent, 2) },
          { label: 'Inflation per year', value: percentPoints(inputs.inflationPercent, 2) },
          { label: 'Retirement age', value: text(String(inputs.retirementAge)) },
        ],
      },
      { heading: 'Your salary (used for tax)', rows: profileRows(inputs) },
    ],
    results: [
      { rows: results },
      {
        heading: 'Tax-deductible room this year',
        rows: [
          { label: 'Limit this year', value: rand(result.limit) },
          { label: 'Room after existing contributions', value: rand(result.room) },
          { label: 'Left after this RA', value: rand(result.left) },
          { label: 'Share of the limit used', value: percentPoints(result.usedPercent, 0) },
        ],
      },
      {
        heading: `Two-pot split at ${result.retirementAge}`,
        rows: [
          { label: 'Savings pot', value: rand(result.savings) },
          { label: 'Retirement pot', value: rand(result.retirementPot) },
          { label: "Vested pot (today's balance)", value: rand(result.vested) },
        ],
      },
    ],
    charts: [
      { id: 'ra-growth', title: 'How your RA grows' },
      { id: 'ra-two-pot', title: `Two-pot split at ${result.retirementAge}` },
    ],
    warnings,
    notes: [...(result.approxWhy ? [result.approxWhy] : []), result.twoPotNote],
  };
}
