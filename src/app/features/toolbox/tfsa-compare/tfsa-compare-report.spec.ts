import { BROKEN_TEXT, findRow, reportStrings } from '../../../testing/report-text';
import {
  TfsaCompareReportInputs,
  TfsaCompareReportResult,
  buildTfsaCompareReport,
} from './tfsa-compare-report';

const INPUTS: TfsaCompareReportInputs = {
  lumpSum: 46000,
  yearlyContribution: 0,
  years: 10,
  returnPercent: 9.5,
  interestPercent: 30,
  dividendPercent: 20,
  marginalRatePercent: 31,
  age: 35,
  tfsaLifetimeUsed: 0,
};

const RESULT: TfsaCompareReportResult = {
  figure: 12345.67,
  lead: 'Over 10 years, using the TFSA saves R 9 000,00 in tax.',
  tfsaEnd: 112345,
  tfsaEndSecondary: 'You put in R 46 000,00. Tax paid: R 0,00',
  taxableEnd: 100000,
  taxableEndSecondary: 'Tax paid: R 9 000,00',
  warnings: ['The interest is above the yearly interest exemption.'],
};

const ASSUMPTIONS = ['The TFSA limits are R 46 000 a year.', 'One flat marginal rate is used.'];

describe('buildTfsaCompareReport', () => {
  const report = () => buildTfsaCompareReport(INPUTS, RESULT, ASSUMPTIONS);

  it('names the report and the chart hosts the template declares', () => {
    expect(report().id).toBe('tfsa-vs-taxable');
    expect(report().charts.map((chart) => chart.id)).toEqual(['tfsa-tax', 'tfsa-growth']);
  });

  it('passes the advantage and both end values straight through', () => {
    const rows = report().results[0].rows;
    expect(rows[0].value).toEqual({ kind: 'rand', amount: 12345.67 });
    expect(rows[0].emphasis).toBe(true);
    expect(findRow(report().results, 'Value in the TFSA')?.value).toMatchObject({ amount: 112345 });
    expect(findRow(report().results, 'Value in a taxable account')?.detail).toBe(
      'Tax paid: R 9 000,00',
    );
  });

  it('uses the assumptions the page lists as the notes', () => {
    expect(report().notes).toEqual(ASSUMPTIONS);
  });

  it('passes the page warnings through and lists the inputs', () => {
    expect(report().warnings).toEqual(RESULT.warnings);
    expect(findRow(report().inputs, 'Lump sum to invest now')?.value).toMatchObject({
      amount: 46000,
    });
    expect(findRow(report().inputs, 'Your marginal tax rate')?.value).toEqual({
      kind: 'percent',
      fraction: 0.31,
      digits: 1,
    });
  });

  it('prints no NaN or undefined', () => {
    for (const piece of reportStrings(report())) expect(piece).not.toMatch(BROKEN_TEXT);
  });
});
