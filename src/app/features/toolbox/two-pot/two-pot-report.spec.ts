import { BROKEN_TEXT, findRow, reportStrings } from '../../../testing/report-text';
import { TwoPotReportInputs, TwoPotReportResult, buildTwoPotReport } from './two-pot-report';

const INPUTS: TwoPotReportInputs = {
  withdrawal: 20000,
  taxableIncomeAnnual: 360000,
  age: 35,
  medicalMembers: 0,
  yearsToRetirement: 20,
  realGrowthPercent: 5,
  inflationPercent: 4.5,
};

const RESULT: TwoPotReportResult = {
  figure: 30000,
  lead: 'Tax now R 5 200,00 plus lost growth R 24 800,00.',
  perRand: "Counting both, every R1,00 you receive costs about R 2,03 in today's money.",
  tax: 5200,
  effectiveRate: '26% of the withdrawal',
  netCash: 14800,
  lostGrowth: 24800,
  lostGrowthFuture: 'In future rand: R 90 000,00',
  rate: '26%',
  bands: [
    { from: 'R 0,00', to: 'R 20 000,00', amount: 'R 20 000,00', rate: '26%', tax: 'R 5 200,00' },
  ],
  growthText: 'Left in your retirement fund for 20 years, R 20 000,00 could grow.',
  warnings: ['Part of this withdrawal lands in a higher tax bracket.'],
};

describe('buildTwoPotReport', () => {
  it('names the report and the chart host the template declares', () => {
    const report = buildTwoPotReport(INPUTS, RESULT);
    expect(report.id).toBe('two-pot-withdrawal');
    expect(report.charts.map((chart) => chart.id)).toEqual(['two-pot-parts']);
  });

  it('passes the true cost straight through', () => {
    const headline = buildTwoPotReport(INPUTS, RESULT).results[0].rows[0];
    expect(headline.value).toEqual({ kind: 'rand', amount: 30000 });
    expect(headline.detail).toBe(RESULT.lead);
    expect(headline.emphasis).toBe(true);
  });

  it('lists the tax by bracket with the rate and amount as detail', () => {
    const bands = buildTwoPotReport(INPUTS, RESULT).results.find((s) => s.heading === 'Tax by bracket');
    expect(bands?.rows).toEqual([
      {
        label: 'R 0,00 to R 20 000,00',
        value: { kind: 'text', text: 'R 5 200,00' },
        detail: '26% on R 20 000,00',
      },
    ]);
  });

  it('drops the per-rand sentence when there is none', () => {
    expect(buildTwoPotReport(INPUTS, RESULT).results[0].paragraphs).toEqual([
      RESULT.perRand,
      RESULT.growthText,
    ]);
    const none = buildTwoPotReport(INPUTS, { ...RESULT, perRand: '' });
    expect(none.results[0].paragraphs).toEqual([RESULT.growthText]);
  });

  it('passes the page warnings through and lists the inputs', () => {
    const report = buildTwoPotReport(INPUTS, RESULT);
    expect(report.warnings).toEqual(RESULT.warnings);
    expect(findRow(report.inputs, 'Amount to withdraw')?.value).toMatchObject({ amount: 20000 });
  });

  it('prints no NaN or undefined', () => {
    for (const piece of reportStrings(buildTwoPotReport(INPUTS, RESULT))) {
      expect(piece).not.toMatch(BROKEN_TEXT);
    }
  });
});
