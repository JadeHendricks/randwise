import { BROKEN_TEXT, findRow, reportStrings } from '../../../testing/report-text';
import {
  EmergencyFundReportInputs,
  EmergencyFundReportResult,
  buildEmergencyFundReport,
} from './emergency-fund-report';

const INPUTS: EmergencyFundReportInputs = {
  monthlyExpenses: 15000,
  targetMonths: 3,
  currentSavings: 0,
  monthlyContribution: 2000,
  savingsRatePercent: 7,
};

const RESULT: EmergencyFundReportResult = {
  target: 45000,
  lead: '21 months to reach your goal',
  goalMonths: '21 months',
  goalSpan: 'About 1 year 9 months',
  withoutInterest: 'Without interest: 23 months',
  shortfall: 45000,
  interestSentence: 'Interest adds R 2 000,00 on top of the R 43 000,00 you save.',
  ringPercent: 0,
  progressText: 'R 0,00 of the R 45 000,00 target is saved.',
  warnings: [],
};

describe('buildEmergencyFundReport', () => {
  it('names the report and the chart host the template declares', () => {
    const report = buildEmergencyFundReport(INPUTS, RESULT);
    expect(report.id).toBe('emergency-fund');
    expect(report.charts.map((chart) => chart.id)).toEqual(['emergency-balance']);
  });

  it('passes the target straight through', () => {
    const headline = buildEmergencyFundReport(INPUTS, RESULT).results[0].rows[0];
    expect(headline.value).toEqual({ kind: 'rand', amount: 45000 });
    expect(headline.detail).toBe(RESULT.lead);
    expect(headline.emphasis).toBe(true);
  });

  it('joins the span and the no-interest note under the time to goal', () => {
    const row = findRow(buildEmergencyFundReport(INPUTS, RESULT).results, 'Time to your goal');
    expect(row?.detail).toBe('About 1 year 9 months. Without interest: 23 months');
    const noSpan = findRow(
      buildEmergencyFundReport(INPUTS, { ...RESULT, goalSpan: '' }).results,
      'Time to your goal',
    );
    expect(noSpan?.detail).toBe('Without interest: 23 months');
  });

  it('drops the interest sentence when there is none', () => {
    const report = buildEmergencyFundReport(INPUTS, { ...RESULT, interestSentence: '' });
    expect(report.results[0].paragraphs).toEqual([RESULT.progressText]);
  });

  it('passes the page warnings through', () => {
    const report = buildEmergencyFundReport(INPUTS, { ...RESULT, warnings: ['Not reached.'] });
    expect(report.warnings).toEqual(['Not reached.']);
  });

  it('prints no NaN or undefined', () => {
    for (const piece of reportStrings(buildEmergencyFundReport(INPUTS, RESULT))) {
      expect(piece).not.toMatch(BROKEN_TEXT);
    }
  });
});
