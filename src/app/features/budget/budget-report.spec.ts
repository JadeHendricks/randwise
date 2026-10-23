import { BROKEN_TEXT, findRow, reportStrings } from '../../testing/report-text';
import {
  BudgetReportIncome,
  BudgetReportResult,
  BudgetReportSettings,
  buildBudgetReport,
} from './budget-report';

const INCOME: BudgetReportIncome = {
  amount: 30000,
  age: 35,
  medicalMembers: 0,
  employeeRetirementMonthly: 0,
  otherDeductionsMonthly: 0,
};

const SETTINGS: BudgetReportSettings = { emergencyMonths: 3, emergencySaved: 5000, tfsaLifetimeUsed: 0 };

const RESULT: BudgetReportResult = {
  net: 25141.88,
  status: 'balanced',
  sentence: 'Every rand has a job',
  overText: 'Your lines add up to R 30 000,00, which is R 4 858,12 more than your take-home.',
  groups: [
    {
      heading: 'Needs R 12 570,94 (50,0%)',
      lines: [
        { name: 'Rent', amount: 9000, percent: 35.8 },
        { name: 'Groceries', amount: 3570.94, percent: 14.2 },
      ],
    },
    { heading: 'Savings R 5 000,00 (19,9%)', lines: [{ name: 'RA', amount: 5000, percent: 19.9 }] },
  ],
  checks: [
    { text: 'Your RA line is R 60 000,00 a year.', warn: false },
    { text: 'Your TFSA line is over the annual limit.', warn: true },
  ],
  emergencyPercent: 33.3,
  emergencyText: 'Target R 37 712,82 (3 months of needs).',
};

describe('buildBudgetReport', () => {
  it('names the report and the chart hosts the Budget template declares', () => {
    const report = buildBudgetReport(INCOME, SETTINGS, RESULT, 'Take-home pay per month');
    expect(report.id).toBe('budget');
    expect(report.charts.map((chart) => chart.id)).toEqual(['budget-split', 'budget-emergency']);
  });

  it('passes the take-home straight through with the status sentence', () => {
    const report = buildBudgetReport(INCOME, SETTINGS, RESULT, 'Take-home pay per month');
    const headline = report.results[0].rows[0];
    expect(headline.value).toEqual({ kind: 'rand', amount: 25141.88, suffix: 'a month' });
    expect(headline.detail).toBe('Every rand has a job');
  });

  it('makes one section per group, with each line and its share', () => {
    const report = buildBudgetReport(INCOME, SETTINGS, RESULT, 'x');
    const needs = report.results.find((s) => s.heading === 'Needs R 12 570,94 (50,0%)');
    expect(needs?.rows.map((row) => row.label)).toEqual(['Rent', 'Groceries']);
    expect(needs?.rows[0].value).toMatchObject({ amount: 9000 });
    expect(needs?.rows[0].detail).toMatch(/^35,80?%/);
  });

  it('puts informational checks in the results and warning checks in the warnings', () => {
    const report = buildBudgetReport(INCOME, SETTINGS, RESULT, 'x');
    expect(report.warnings).toEqual(['Your TFSA line is over the annual limit.']);
    const checks = report.results.find((s) => s.heading === 'Savings checks');
    expect(checks?.paragraphs).toEqual(['Your RA line is R 60 000,00 a year.']);
  });

  it('adds the over-allocation text to the warnings only when over', () => {
    expect(buildBudgetReport(INCOME, SETTINGS, RESULT, 'x').warnings).not.toContain(RESULT.overText);
    const over = buildBudgetReport(INCOME, SETTINGS, { ...RESULT, status: 'over' }, 'x');
    expect(over.warnings).toContain(RESULT.overText);
  });

  it('skips the checks section when every check is a warning', () => {
    const report = buildBudgetReport(
      INCOME,
      SETTINGS,
      { ...RESULT, checks: [{ text: 'Over.', warn: true }] },
      'x',
    );
    expect(report.results.map((s) => s.heading)).not.toContain('Savings checks');
  });

  it('lists the inputs as entered', () => {
    const report = buildBudgetReport(INCOME, SETTINGS, RESULT, 'Take-home pay per month');
    expect(findRow(report.inputs, 'Take-home pay per month')?.value).toMatchObject({ amount: 30000 });
    expect(findRow(report.inputs, 'Emergency fund saved so far')?.value).toMatchObject({
      amount: 5000,
    });
  });

  it('prints no NaN or undefined', () => {
    const report = buildBudgetReport(INCOME, SETTINGS, RESULT, 'x');
    for (const piece of reportStrings(report)) expect(piece).not.toMatch(BROKEN_TEXT);
  });
});
