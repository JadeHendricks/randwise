import { BROKEN_TEXT, findRow, reportStrings } from '../../testing/report-text';
import { JourneyReportInputs, JourneyReportResult, buildJourneyReport } from './journey-report';

const INPUTS: JourneyReportInputs = {
  grossMonthly: 40000,
  age: 35,
  medicalMembers: 0,
  employeeRetirementMonthly: 0,
  employerRetirementMonthly: 0,
  retirementAge: 55,
  incomeEscalationPercent: 4.5,
  contributionMonthly: 2000,
  escalationPercent: 5,
  startingBalance: 0,
  tfsaBalance: 0,
  tfsaLifetimeUsed: 0,
  tfsaTopUpMonthly: 1000,
  returnPercent: 9.5,
  tfsaReturnPercent: 9.5,
  inflationPercent: 4.5,
  allowOverContribution: false,
};

const RESULT: JourneyReportResult = {
  retirementAge: 55,
  taxSaved: 123456.78,
  tfsaSentence: "TFSA at 55: R 900 000,00 (R 400 000,00 in today's money)",
  raSentence: "RA at 55: R 1 200 000,00 (R 500 000,00 in today's money)",
  timeline: [
    { title: 'Age 35: today', detail: 'You start with R 0,00 in your RA.' },
    { title: 'Age 55: retirement', detail: 'RA R 1 200 000,00 and TFSA R 900 000,00.' },
  ],
  ringPercent: 100,
  lifetimeText: 'R 500 000,00 of the R 500 000,00 lifetime limit.',
  warnings: ['You chose to over-contribute.'],
};

const build = (inputs = INPUTS, result = RESULT) =>
  buildJourneyReport(inputs, result, 'Refund after filing');

describe('buildJourneyReport', () => {
  it('names the report and the chart hosts the Journey template declares', () => {
    const report = build();
    expect(report.id).toBe('journey');
    expect(report.charts.map((chart) => chart.id)).toEqual(['journey-balances', 'journey-lifetime']);
  });

  it('passes the tax saved straight through', () => {
    const headline = build().results[0].rows[0];
    expect(headline.value).toEqual({ kind: 'rand', amount: 123456.78 });
    expect(headline.emphasis).toBe(true);
    expect(headline.label).toBe('Tax saved by 55');
  });

  it('prints the lifetime limit use with its explanation', () => {
    const row = findRow(build().results, 'TFSA lifetime limit used by retirement');
    expect(row?.value).toEqual({ kind: 'percent', fraction: 1, digits: 0 });
    expect(row?.detail).toBe(RESULT.lifetimeText);
  });

  it('lists the milestones as title: detail', () => {
    const milestones = build().results.find((s) => s.heading === 'Your milestones');
    expect(milestones?.paragraphs).toEqual([
      'Age 35: today: You start with R 0,00 in your RA.',
      'Age 55: retirement: RA R 1 200 000,00 and TFSA R 900 000,00.',
    ]);
  });

  it('passes the page warnings through', () => {
    expect(build().warnings).toEqual(['You chose to over-contribute.']);
    expect(build(INPUTS, { ...RESULT, warnings: [] }).warnings).toEqual([]);
  });

  it('prints the refund mode label and the over-contribution choice', () => {
    expect(findRow(build().inputs, 'Tax refund')?.value).toEqual({
      kind: 'text',
      text: 'Refund after filing',
    });
    expect(findRow(build().inputs, 'Allow over-contribution')?.value).toEqual({
      kind: 'text',
      text: 'No',
    });
    const yes = build({ ...INPUTS, allowOverContribution: true });
    expect(findRow(yes.inputs, 'Allow over-contribution')?.value).toEqual({
      kind: 'text',
      text: 'Yes',
    });
  });

  it('prints no NaN or undefined', () => {
    for (const piece of reportStrings(build())) expect(piece).not.toMatch(BROKEN_TEXT);
  });
});
