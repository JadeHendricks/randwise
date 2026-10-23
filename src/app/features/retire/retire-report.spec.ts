import { BROKEN_TEXT, findRow, reportStrings } from '../../testing/report-text';
import { RetireReportInputs, RetireReportResult, buildRetireReport } from './retire-report';

const INPUTS: RetireReportInputs = {
  grossMonthly: 40000,
  age: 35,
  medicalMembers: 0,
  employeeRetirementMonthly: 0,
  employerRetirementMonthly: 0,
  goalNetMonthly: 50000,
  retirementAge: 55,
  inflationPercent: 4.5,
  returnPercent: 9.5,
  retirementReturnPercent: 7.5,
  drawdownPercent: 5,
  takeLumpSum: false,
  startingBalance: 0,
  contributionMonthly: 2000,
  escalationPercent: 5,
};

const RESULT: RetireReportResult = {
  retirementAge: 55,
  requiredMonthly: 8123.45,
  goalSentence: "to retire at 55 on R 50 000 a month in today's money.",
  returnSentence: 'Or keep R 2 000 a month and earn 14% a year.',
  warnings: ['A return above 15% a year is hard to rely on.'],
  ringPercent: 24.6,
  projectedNominal: 1000000,
  projectedReal: 'R 400 000,00',
  surplus: false,
  gapAmount: 3000000,
  capitalTotal: 9000000,
  capitalToday: 3400000,
  incomeBeforeMonthly: 60000,
  incomeTaxMonthly: 10000,
  incomeAfterMonthly: 50000,
  drawdownSentence: 'Drawing 5% of the balance in the first year pays R 60 000,00 a month.',
  incomeRows: [
    { age: 55, before: 'R 60 000,00', tax: 'R 10 000,00', after: 'R 50 000,00' },
    { age: 65, before: 'R 62 000,00', tax: 'R 9 000,00', after: 'R 53 000,00' },
  ],
  takeLumpSum: false,
  lumpGross: 0,
  lumpTax: 0,
  lumpNet: 0,
  annuityCapital: 0,
  netCostMonthly: 5500,
  lastsText: 'Age 85',
  lastsCurrentText: 'At your current contribution: age 70',
  neededReturn: '14%',
};

describe('buildRetireReport', () => {
  it('names the report and the chart host the Retire template declares', () => {
    const report = buildRetireReport(INPUTS, RESULT);
    expect(report.id).toBe('retire-at-55');
    expect(report.charts.map((chart) => chart.id)).toEqual(['retire-balance']);
  });

  it('passes the headline through with its goal sentence', () => {
    const headline = buildRetireReport(INPUTS, RESULT).results[0].rows[0];
    expect(headline.value).toEqual({ kind: 'rand', amount: 8123.45, suffix: 'a month' });
    expect(headline.detail).toBe(RESULT.goalSentence);
    expect(headline.emphasis).toBe(true);
  });

  it('labels the gap as a shortfall or a surplus', () => {
    const short = buildRetireReport(INPUTS, RESULT);
    expect(findRow(short.results, "Shortfall in today's money")?.value).toMatchObject({
      amount: 3000000,
    });
    expect(findRow(short.results, "Surplus in today's money")).toBeUndefined();
    const surplus = buildRetireReport(INPUTS, { ...RESULT, surplus: true });
    expect(findRow(surplus.results, "Surplus in today's money")).toBeDefined();
  });

  it('adds the lump-sum section only when a lump sum is taken', () => {
    expect(buildRetireReport(INPUTS, RESULT).results.map((s) => s.heading)).not.toContain(
      'One-third lump sum',
    );
    const withLump = buildRetireReport(
      { ...INPUTS, takeLumpSum: true },
      { ...RESULT, takeLumpSum: true, lumpGross: 1000000, lumpTax: 100000, lumpNet: 900000, annuityCapital: 2000000 },
    );
    const section = withLump.results.find((s) => s.heading === 'One-third lump sum');
    expect(section?.rows.map((row) => row.label)).toEqual([
      'Lump sum',
      'Tax on the lump sum',
      'Lump sum after tax',
      'Left to buy the living annuity',
    ]);
    expect(findRow(withLump.inputs, 'Take a one-third lump sum')?.value).toEqual({
      kind: 'text',
      text: 'Yes',
    });
  });

  it('lists the income by age as text rows', () => {
    const section = buildRetireReport(INPUTS, RESULT).results.find(
      (s) => s.heading === 'Monthly income by age',
    );
    expect(section?.rows[0]).toEqual({
      label: 'Age 55',
      value: { kind: 'text', text: 'R 50 000,00 after tax' },
      detail: 'Before tax R 60 000,00, tax R 10 000,00',
    });
    expect(section?.rows).toHaveLength(2);
  });

  it('skips the income-by-age section when no row pays an income', () => {
    const report = buildRetireReport(INPUTS, { ...RESULT, incomeRows: [] });
    expect(report.results.map((s) => s.heading)).not.toContain('Monthly income by age');
  });

  it('passes the page warnings and sentences through', () => {
    const report = buildRetireReport(INPUTS, RESULT);
    expect(report.warnings).toEqual(RESULT.warnings);
    expect(report.notes).toEqual([RESULT.returnSentence, RESULT.drawdownSentence]);
  });

  it('prints no NaN or undefined', () => {
    for (const piece of reportStrings(buildRetireReport(INPUTS, RESULT))) {
      expect(piece).not.toMatch(BROKEN_TEXT);
    }
  });
});
