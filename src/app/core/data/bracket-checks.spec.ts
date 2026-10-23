import { makeTaxYear } from '../../testing/tax-data-fixtures';
import {
  BracketCheck,
  expectedThresholds,
  findBracketProblems,
  findThresholdProblems,
} from './bracket-checks';
import { BracketRow } from './tax-year.schema';

const REBATES = { primary: 17_820, secondary: 9_765, tertiary: 3_249 };
const THRESHOLDS = { under65: 99_000, age65to74: 153_250, age75plus: 171_300 };

function goodTable(): BracketRow[] {
  return makeTaxYear().incomeTaxBrackets.value.map((row) => ({ ...row }));
}

function problemsFor(rows: BracketRow[]) {
  return findBracketProblems('incomeTaxBrackets', rows);
}

function checksOf(rows: BracketRow[]): BracketCheck[] {
  return problemsFor(rows).map((p) => p.check);
}

describe('findBracketProblems', () => {
  it('accepts the 2027 table', () => {
    expect(problemsFor(goodTable())).toEqual([]);
  });

  it('reports a first row that does not start at zero', () => {
    const rows = goodTable();
    rows[0] = { ...rows[0], above: 1 };
    const [problem] = problemsFor(rows);
    expect(problem.check).toBe('start');
    expect(problem.message).toBe('incomeTaxBrackets row 1 must start at above 0 (found 1).');
  });

  it('reports a first row with a base', () => {
    const rows = goodTable();
    rows[0] = { ...rows[0], base: 500 };
    expect(problemsFor(rows).map((p) => p.message)).toContain(
      'incomeTaxBrackets row 1 base must be 0 (found 500).',
    );
  });

  it('reports an open-ended row that is not last, and a closed last row', () => {
    const rows = goodTable();
    rows[1] = { ...rows[1], upTo: null };
    expect(problemsFor(rows).map((p) => p.message)).toContain(
      'incomeTaxBrackets row 2 has no upper limit but is not the last row.',
    );

    const closed = goodTable();
    const last = closed.length - 1;
    closed[last] = { ...closed[last], upTo: closed[last].above + 1 };
    expect(problemsFor(closed).map((p) => p.message)).toContain(
      `incomeTaxBrackets row ${last + 1} is the last row and must have upTo null.`,
    );
  });

  it('reports an upper limit that is not above the lower one', () => {
    const rows = goodTable();
    rows[0] = { ...rows[0], upTo: 0 };
    const problem = problemsFor(rows).find((p) => p.check === 'limits');
    expect(problem?.message).toBe(
      'incomeTaxBrackets row 1 upTo (0) must be greater than above (0).',
    );
  });

  it('reports a gap between rows', () => {
    const rows = goodTable();
    rows[1] = { ...rows[1], above: rows[1].above + 100 };
    const problem = problemsFor(rows).find((p) => p.check === 'contiguous');
    expect(problem?.message).toContain('leaving a gap');
  });

  it('reports an overlap between rows', () => {
    const rows = goodTable();
    rows[1] = { ...rows[1], above: rows[1].above - 100 };
    const problem = problemsFor(rows).find((p) => p.check === 'contiguous');
    expect(problem?.message).toContain('leaving an overlap');
  });

  it('reports a rate that does not rise', () => {
    const rows = goodTable();
    rows[3] = { ...rows[3], rate: rows[2].rate };
    const problem = problemsFor(rows).find((p) => p.check === 'rates');
    expect(problem?.message).toContain('incomeTaxBrackets row 4 rate');
    expect(problem?.message).toContain('must be higher than row 3 rate');
  });

  it('reports a base that is not the tax on the lower rows', () => {
    const rows = goodTable();
    rows[2] = { ...rows[2], base: rows[2].base + 100 };
    expect(checksOf(rows)).toEqual(['base']);
    expect(problemsFor(rows)[0].message).toContain('incomeTaxBrackets row 3 base is R');
    expect(problemsFor(rows)[0].message).toContain('(allowed difference R1)');
  });

  it('allows a base that is off by R1 for rounding', () => {
    const rows = goodTable();
    rows[2] = { ...rows[2], base: rows[2].base + 1 };
    expect(problemsFor(rows)).toEqual([]);
  });

  it('prefixes messages with the given key', () => {
    const rows = goodTable();
    rows[0] = { ...rows[0], above: 5 };
    expect(findBracketProblems('withdrawalLumpSum', rows)[0].message).toMatch(
      /^withdrawalLumpSum row 1 /,
    );
  });
});

describe('expectedThresholds', () => {
  it('divides the cumulative rebates by the lowest rate', () => {
    const expected = expectedThresholds(0.18, REBATES);
    expect(expected?.under65).toBeCloseTo(99_000, 6);
    expect(expected?.age65to74).toBeCloseTo((17_820 + 9_765) / 0.18, 6);
    expect(expected?.age75plus).toBeCloseTo((17_820 + 9_765 + 3_249) / 0.18, 6);
  });

  it('returns null at a lowest rate of 0', () => {
    expect(expectedThresholds(0, REBATES)).toBeNull();
  });
});

describe('findThresholdProblems', () => {
  it('accepts thresholds that match the rebates for 2027', () => {
    expect(findThresholdProblems(goodTable(), REBATES, THRESHOLDS)).toEqual([]);
  });

  it('reports a mismatch with a readable message', () => {
    const problems = findThresholdProblems(goodTable(), REBATES, {
      ...THRESHOLDS,
      under65: 105_000,
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('thresholds.under65 is');
    expect(problems[0]).toContain('the rebates divided by the lowest rate give');
    expect(problems[0]).toContain('(allowed difference R1)');
  });

  it('reports each threshold that is off', () => {
    const problems = findThresholdProblems(goodTable(), REBATES, {
      under65: 1,
      age65to74: 2,
      age75plus: 3,
    });
    expect(problems).toHaveLength(3);
  });

  it('skips the check when the lowest rate is 0', () => {
    const rows = goodTable();
    rows[0] = { ...rows[0], rate: 0 };
    expect(
      findThresholdProblems(rows, REBATES, { under65: 1, age65to74: 2, age75plus: 3 }),
    ).toEqual([]);
  });
});
