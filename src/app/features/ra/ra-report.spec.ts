import { BROKEN_TEXT, findRow, reportStrings } from '../../testing/report-text';
import { RaReportInputs, RaReportResult, buildRaReport } from './ra-report';

const INPUTS: RaReportInputs = {
  grossMonthly: 40000,
  age: 35,
  medicalMembers: 1,
  employeeRetirementMonthly: 0,
  employerRetirementMonthly: 0,
  contributionMonthly: 2000,
  escalationPercent: 5,
  startingBalance: 0,
  returnPercent: 9.5,
  inflationPercent: 4.5,
  retirementAge: 55,
};

const RESULT: RaReportResult = {
  retirementAge: 55,
  years: 20,
  nominal: 1234567.89,
  real: 700000,
  paidIn: 800000,
  growth: 434567.89,
  savings: 100000,
  retirementPot: 300000,
  vested: 0,
  usedPercent: 40,
  overCap: false,
  overCapAmount: 'R 0,00',
  belowEarliest: false,
  earliestAge: 55,
  pastAge: false,
  limit: 350000,
  room: 300000,
  left: 276000,
  saving: 9000,
  savingMonthly: 'R 750,00 a month',
  netCostMonthly: 1250,
  marginal: '31% \u2192 26%',
  approxWhy: null,
  twoPotNote: 'New contributions go 33% to the savings pot.',
  sentence: 'After 20 years at 9,50% a year with 4,50% inflation.',
};

describe('buildRaReport', () => {
  it('names the report and the chart hosts the RA template declares', () => {
    const report = buildRaReport(INPUTS, RESULT);
    expect(report.id).toBe('ra');
    expect(report.charts.map((chart) => chart.id)).toEqual(['ra-growth', 'ra-two-pot']);
  });

  it('passes the page result straight through', () => {
    const report = buildRaReport(INPUTS, RESULT);
    const headline = report.results[0].rows[0];
    expect(headline.value).toEqual({ kind: 'rand', amount: 1234567.89 });
    expect(headline.emphasis).toBe(true);
    expect(headline.detail).toBe(RESULT.sentence);
    expect(findRow(report.results, "In today's money")?.value).toMatchObject({ amount: 700000 });
    expect(findRow(report.results, 'Tax saving')?.detail).toBe('R 750,00 a month');
    expect(findRow(report.results, 'Savings pot')?.value).toMatchObject({ amount: 100000 });
  });

  it('keeps the marginal rate text, whose arrow the PDF layer rewrites', () => {
    const row = findRow(buildRaReport(INPUTS, RESULT).results, 'Marginal rate');
    expect(row?.value).toEqual({ kind: 'text', text: '31% \u2192 26%' });
  });

  it('hides the projection sentence when there is no projection', () => {
    const report = buildRaReport(INPUTS, { ...RESULT, years: 0 });
    expect(report.results[0].rows[0].detail).toBeUndefined();
  });

  it('adds a warning for each flag, and none otherwise', () => {
    expect(buildRaReport(INPUTS, RESULT).warnings).toEqual([]);
    const flagged = buildRaReport(INPUTS, {
      ...RESULT,
      overCap: true,
      overCapAmount: 'R 12 000,00',
      belowEarliest: true,
      pastAge: true,
    });
    expect(flagged.warnings).toHaveLength(3);
    expect(flagged.warnings[0]).toContain('R 12 000,00');
    expect(flagged.warnings[1]).toContain('age 55');
  });

  it('adds the quick-estimate explanation to the notes only when there is one', () => {
    expect(buildRaReport(INPUTS, RESULT).notes).toEqual([RESULT.twoPotNote]);
    const withWhy = buildRaReport(INPUTS, { ...RESULT, approxWhy: 'A quick estimate differs.' });
    expect(withWhy.notes).toEqual(['A quick estimate differs.', RESULT.twoPotNote]);
  });

  it('lists the RA inputs and the salary profile', () => {
    const report = buildRaReport(INPUTS, RESULT);
    expect(findRow(report.inputs, 'Extra RA contribution')?.value).toMatchObject({ amount: 2000 });
    expect(findRow(report.inputs, 'Gross pay')?.value).toMatchObject({ amount: 40000 });
    expect(findRow(report.inputs, 'Expected return per year')?.value).toEqual({
      kind: 'percent',
      fraction: 0.095,
      digits: 2,
    });
  });

  it('prints no NaN or undefined', () => {
    for (const piece of reportStrings(buildRaReport(INPUTS, RESULT))) {
      expect(piece).not.toMatch(BROKEN_TEXT);
    }
  });
});
