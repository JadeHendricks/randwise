import { BROKEN_TEXT, findRow, reportStrings } from '../../../testing/report-text';
import {
  HomeLoanReportInputs,
  HomeLoanReportResult,
  buildHomeLoanReport,
} from './home-loan-report';

const INPUTS: HomeLoanReportInputs = {
  grossMonthly: 40000,
  existingDebtMonthly: 0,
  deposit: 100000,
  ratePercent: 10.5,
  termYears: 20,
  mode: 'afford',
  purchasePrice: 1500000,
  ratesAndLeviesMonthly: 0,
  insuranceMonthly: 0,
};

const RESULT: HomeLoanReportResult = {
  eyebrow: 'The most you could borrow',
  figure: 1234567,
  lead: 'That is a home of up to R 1 334 567,00 with your R 100 000,00 deposit.',
  loan: 1234567,
  repayment: 12000,
  repaymentSecondary: '40% of your take-home pay',
  interest: 1600000,
  totalPaid: 'Total paid back R 2 834 567,00',
  monthlyCost: 12000,
  ringPercent: 30,
  ruleText: 'Your debt repayments would be 30% of your gross pay.',
  warnings: [],
};

const build = (inputs = INPUTS, result = RESULT) =>
  buildHomeLoanReport(inputs, result, 'What can I afford');

describe('buildHomeLoanReport', () => {
  it('names the report and the chart hosts the template declares', () => {
    const report = build();
    expect(report.id).toBe('home-loan');
    expect(report.charts.map((chart) => chart.id)).toEqual([
      'home-loan-first-year',
      'home-loan-balance',
    ]);
  });

  it('labels the headline with the page eyebrow and passes the figure straight through', () => {
    const headline = build().results[0].rows[0];
    expect(headline.label).toBe('The most you could borrow');
    expect(headline.value).toEqual({ kind: 'rand', amount: 1234567 });
    expect(headline.detail).toBe(RESULT.lead);
  });

  it('lists the purchase price only in price mode', () => {
    expect(findRow(build().inputs, 'Purchase price')).toBeUndefined();
    const price = buildHomeLoanReport(
      { ...INPUTS, mode: 'price' },
      { ...RESULT, eyebrow: 'Monthly repayment' },
      'Repayment for a price',
    );
    expect(findRow(price.inputs, 'Purchase price')?.value).toMatchObject({ amount: 1500000 });
    expect(findRow(price.inputs, 'Show me')?.value).toEqual({
      kind: 'text',
      text: 'Repayment for a price',
    });
  });

  it('shows the repayment share only when the page has one', () => {
    expect(findRow(build().results, 'Monthly repayment')?.detail).toBe('40% of your take-home pay');
    const none = build(INPUTS, { ...RESULT, repaymentSecondary: '' });
    expect(findRow(none.results, 'Monthly repayment')?.detail).toBeUndefined();
  });

  it('passes the page warnings and rule text through', () => {
    const report = build(INPUTS, { ...RESULT, warnings: ['Over the cap.'] });
    expect(report.warnings).toEqual(['Over the cap.']);
    expect(report.results[0].paragraphs).toEqual([RESULT.ruleText]);
  });

  it('prints no NaN or undefined', () => {
    for (const piece of reportStrings(build())) expect(piece).not.toMatch(BROKEN_TEXT);
  });
});
