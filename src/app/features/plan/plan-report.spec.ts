import { BROKEN_TEXT, reportStrings } from '../../testing/report-text';
import { PlanReportCard, buildPlanReport } from './plan-report';

const CARDS: PlanReportCard[] = [
  {
    index: 1,
    step: {
      title: 'Build an emergency fund of R 45 000',
      why: 'It stops a surprise bill becoming debt.',
      key: { label: 'Target' },
      notes: ['Keep it somewhere you can reach it.'],
    },
    keyValue: 'R 45 000',
    details: [{ label: 'Months of cover', value: '3 months' }],
  },
  {
    index: 2,
    step: {
      title: 'Save R 2 000 a month into an RA',
      why: 'It lowers your tax.',
      key: { label: 'Tax saved a year' },
      notes: [],
    },
    keyValue: 'R 9 000',
    details: [],
  },
];

const ANSWERS = [
  { label: 'Your goal', value: 'Retire early' },
  { label: 'Monthly income', value: 'R 30 000' },
];

describe('buildPlanReport', () => {
  const report = () =>
    buildPlanReport('You earn about R 30 000 a month.', ANSWERS, CARDS, [
      { text: 'Inflation is 4,5%.' },
    ]);

  it('is the plan report, with no charts and no warnings', () => {
    expect(report().id).toBe('plan');
    expect(report().title).toBe('Your plan');
    expect(report().subtitle).toBe('You earn about R 30 000 a month.');
    expect(report().charts).toEqual([]);
    expect(report().warnings).toEqual([]);
  });

  it('lists the answers as the inputs, as text', () => {
    expect(report().inputs).toEqual([
      {
        heading: 'Your answers',
        rows: [
          { label: 'Your goal', value: { kind: 'text', text: 'Retire early' } },
          { label: 'Monthly income', value: { kind: 'text', text: 'R 30 000' } },
        ],
      },
    ]);
  });

  it('makes one numbered section per step with the key figure first', () => {
    const [first, second] = report().results;
    expect(first.heading).toBe('1. Build an emergency fund of R 45 000');
    expect(first.rows[0]).toEqual({
      label: 'Target',
      value: { kind: 'text', text: 'R 45 000' },
      emphasis: true,
    });
    expect(first.rows[1]).toEqual({ label: 'Months of cover', value: { kind: 'text', text: '3 months' } });
    expect(first.paragraphs).toEqual([
      'It stops a surprise bill becoming debt.',
      'Keep it somewhere you can reach it.',
    ]);
    expect(second.heading).toBe('2. Save R 2 000 a month into an RA');
    expect(second.rows).toHaveLength(1);
  });

  it('puts the assumptions in the notes', () => {
    expect(report().notes).toEqual(['Inflation is 4,5%.']);
  });

  it('prints no NaN or undefined', () => {
    for (const piece of reportStrings(report())) expect(piece).not.toMatch(BROKEN_TEXT);
  });
});
