import { formatRand } from '../../shared/format/format-rand';
import { ReportModel, ReportRow, percentPoints, rand, text } from '../../core/pdf/report-model';
import { ProfileInputs, profileRows } from '../profile-report';

/** The Retire at 55 inputs the report lists. The context store's `RetireInputs` is assignable. */
export interface RetireReportInputs extends ProfileInputs {
  readonly goalNetMonthly: number;
  readonly retirementAge: number;
  readonly inflationPercent: number;
  readonly returnPercent: number;
  readonly retirementReturnPercent: number;
  readonly drawdownPercent: number;
  readonly takeLumpSum: boolean;
  readonly startingBalance: number;
  readonly contributionMonthly: number;
  readonly escalationPercent: number;
}

interface IncomeRow {
  readonly age: number;
  readonly before: string;
  readonly tax: string;
  readonly after: string;
}

/** The fields of the page's `result()` the report reads. */
export interface RetireReportResult {
  readonly retirementAge: number;
  readonly requiredMonthly: number;
  readonly goalSentence: string;
  readonly returnSentence: string;
  readonly warnings: readonly string[];
  readonly ringPercent: number;
  readonly projectedNominal: number;
  readonly projectedReal: string;
  readonly surplus: boolean;
  readonly gapAmount: number;
  readonly capitalTotal: number;
  readonly capitalToday: number;
  readonly incomeBeforeMonthly: number;
  readonly incomeTaxMonthly: number;
  readonly incomeAfterMonthly: number;
  readonly drawdownSentence: string;
  readonly incomeRows: readonly IncomeRow[];
  readonly takeLumpSum: boolean;
  readonly lumpGross: number;
  readonly lumpTax: number;
  readonly lumpNet: number;
  readonly annuityCapital: number;
  readonly netCostMonthly: number;
  readonly lastsText: string;
  readonly lastsCurrentText: string;
  readonly neededReturn: string;
}

const yesNo = (value: boolean): string => (value ? 'Yes' : 'No');

/** Formats the Retire at 55 page's existing results. Every number comes from `result`. */
export function buildRetireReport(
  inputs: RetireReportInputs,
  result: RetireReportResult,
): ReportModel {
  const at = result.retirementAge;
  const lumpRows: ReportRow[] = result.takeLumpSum
    ? [
        { label: 'Lump sum', value: rand(result.lumpGross) },
        { label: 'Tax on the lump sum', value: rand(result.lumpTax) },
        { label: 'Lump sum after tax', value: rand(result.lumpNet) },
        { label: 'Left to buy the living annuity', value: rand(result.annuityCapital) },
      ]
    : [];
  return {
    id: 'retire-at-55',
    title: `Retire at ${at}: contribution needed`,
    subtitle: `Goal: ${formatRand(inputs.goalNetMonthly)} a month after tax, retiring at ${at}`,
    inputs: [
      {
        rows: [
          { label: "Monthly income goal after tax (today's money)", value: rand(inputs.goalNetMonthly) },
          { label: 'Retirement age', value: text(String(inputs.retirementAge)) },
          { label: 'Your RA contribution', value: rand(inputs.contributionMonthly, 'a month') },
          { label: 'Yearly increase in contributions', value: percentPoints(inputs.escalationPercent, 2) },
          { label: 'Balance today', value: rand(inputs.startingBalance) },
          { label: 'Inflation per year', value: percentPoints(inputs.inflationPercent, 2) },
          { label: 'Return before retirement', value: percentPoints(inputs.returnPercent, 2) },
          { label: 'Return in retirement', value: percentPoints(inputs.retirementReturnPercent, 2) },
          { label: 'First-year drawdown', value: percentPoints(inputs.drawdownPercent, 2) },
          { label: 'Take a one-third lump sum', value: text(yesNo(inputs.takeLumpSum)) },
        ],
      },
      { heading: 'Your salary (used for tax)', rows: profileRows(inputs) },
    ],
    results: [
      {
        rows: [
          {
            label: 'Required monthly contribution',
            value: rand(result.requiredMonthly, 'a month'),
            detail: result.goalSentence,
            emphasis: true,
          },
          { label: `Capital needed at ${at}`, value: rand(result.capitalTotal) },
          { label: "Capital needed in today's money", value: rand(result.capitalToday) },
          {
            label: `Projected at ${at} at your current contribution`,
            value: rand(result.projectedNominal),
            detail: `${result.projectedReal} in today's money`,
          },
          {
            label: result.surplus ? "Surplus in today's money" : "Shortfall in today's money",
            value: rand(result.gapAmount),
          },
          { label: 'On track', value: percentPoints(result.ringPercent, 0) },
          { label: 'Cost after tax', value: rand(result.netCostMonthly, 'a month') },
          { label: 'Return needed at your current contribution', value: text(result.neededReturn) },
          { label: 'Money lasts until', value: text(result.lastsText), detail: result.lastsCurrentText },
        ],
      },
      {
        heading: `Income at ${at}`,
        rows: [
          { label: 'Income before tax', value: rand(result.incomeBeforeMonthly, 'a month') },
          { label: 'Tax on that income', value: rand(result.incomeTaxMonthly, 'a month') },
          { label: 'Income after tax', value: rand(result.incomeAfterMonthly, 'a month') },
        ],
      },
      ...(lumpRows.length > 0 ? [{ heading: 'One-third lump sum', rows: lumpRows }] : []),
      ...(result.incomeRows.length > 0
        ? [
            {
              heading: 'Monthly income by age',
              rows: result.incomeRows.map<ReportRow>((row) => ({
                label: `Age ${row.age}`,
                value: text(`${row.after} after tax`),
                detail: `Before tax ${row.before}, tax ${row.tax}`,
              })),
            },
          ]
        : []),
    ],
    charts: [{ id: 'retire-balance', title: 'Your balance over time' }],
    warnings: result.warnings,
    notes: [result.returnSentence, result.drawdownSentence],
  };
}
