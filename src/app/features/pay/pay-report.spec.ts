import { BROKEN_TEXT, findRow, reportStrings } from '../../testing/report-text';
import { PayReportInputs, PayReportResult, buildPayReport } from './pay-report';

const pair = (monthly: number, annual = monthly * 12) => ({ monthly, annual });

const INPUTS: PayReportInputs = {
  basis: 'gross',
  amount: 30000,
  age: 35,
  employeeRetirementMonthly: 1500,
  employerRetirementMonthly: 500,
  otherDeductionsMonthly: 200,
};

const RESULT: PayReportResult = {
  net: { monthly: 25141.88, annual: 301702.56 },
  gross: pair(30000),
  paye: pair(4000),
  uif: pair(177.12),
  medicalCredit: pair(0),
  taxableIncome: pair(28500),
  retirement: { deductible: pair(2000), excess: pair(0), headroom: pair(5000) },
  overLimit: false,
  usedPercent: 28.5,
  marginalRate: '26%',
  effectiveRate: '13,3%',
};

const build = (inputs = INPUTS, result = RESULT) =>
  buildPayReport(inputs, result, 'Gross pay per month', '2 members');

describe('buildPayReport', () => {
  it('names the report and the chart hosts the Pay template declares', () => {
    const report = build();
    expect(report.id).toBe('pay');
    expect(report.charts.map((chart) => chart.id)).toEqual(['pay-breakdown', 'pay-net-by-gross']);
  });

  it('passes the page result straight through: no recomputation', () => {
    const row = findRow(build().results, 'Net pay');
    expect(row?.value).toEqual({ kind: 'rand', amount: 25141.88, suffix: 'a month' });
    expect(row?.detail).toContain('301');
    expect(row?.emphasis).toBe(true);
    expect(findRow(build().results, 'PAYE')?.value).toMatchObject({ amount: 4000 });
    expect(findRow(build().results, 'Marginal rate')?.value).toEqual({ kind: 'text', text: '26%' });
  });

  it('lists the inputs as entered', () => {
    const inputs = build().inputs[0].rows;
    expect(inputs.map((row) => row.label)).toEqual([
      'Gross pay per month',
      'Age at the end of the tax year',
      'People on your medical aid',
      'Your retirement contributions',
      'Employer retirement contributions',
      'Other deductions',
    ]);
    expect(findRow(build().inputs, 'Gross pay per month')?.value).toMatchObject({ amount: 30000 });
  });

  it('shows the gross pay needed only when the amount is a take-home figure', () => {
    expect(findRow(build().results, 'Gross pay needed')).toBeUndefined();
    const net = build({ ...INPUTS, basis: 'net' });
    expect(findRow(net.results, 'Gross pay needed')?.value).toMatchObject({ amount: 30000 });
  });

  it('warns only when the retirement contribution is over the limit', () => {
    expect(build().warnings).toEqual([]);
    const over = build(INPUTS, { ...RESULT, overLimit: true });
    expect(over.warnings).toHaveLength(1);
    expect(over.warnings[0]).toContain("this year's limit");
  });

  it('prints no NaN or undefined', () => {
    for (const piece of reportStrings(build())) expect(piece).not.toMatch(BROKEN_TEXT);
  });
});
