import { BracketRow, Rebates, Thresholds } from './tax-year.schema';
import { formatRand } from './validation';

/*
 * Consistency maths for income-tax bracket tables, shared by the tax-year validator and the
 * tax-season scripts. Pure TypeScript: the scripts load this file in plain Node, so it must
 * never import Angular or RxJS.
 */

/** Bases and thresholds are published rounded to whole rands, so allow R1 either way. */
export const RAND_TOLERANCE = 1;
// Absorbs floating-point noise so "off by exactly R1" passes reliably.
export const EPSILON = 1e-6;

export type BracketCheck = 'start' | 'limits' | 'contiguous' | 'rates' | 'base';

export interface BracketProblem {
  readonly check: BracketCheck;
  readonly message: string;
}

/*
 * Each bracket's base is the tax on all income below it, so it must equal the
 * running total of the lower rows (SARS rounds these to whole rands):
 * https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
 *
 * `rows` are already type-checked (finite, non-negative numbers). `key` prefixes every message,
 * for example `incomeTaxBrackets`. Problems come back in row order.
 */
export function findBracketProblems(key: string, rows: readonly BracketRow[]): BracketProblem[] {
  const problems: BracketProblem[] = [];
  const problem = (check: BracketCheck, message: string) => problems.push({ check, message });

  if (rows.length === 0) return problems;

  if (rows[0].above !== 0) {
    problem('start', `${key} row 1 must start at above 0 (found ${rows[0].above}).`);
  }
  if (rows[0].base !== 0) {
    problem('start', `${key} row 1 base must be 0 (found ${rows[0].base}).`);
  }

  let cumulative = 0;
  rows.forEach((row, i) => {
    const label = `${key} row ${i + 1}`;
    const isLast = i === rows.length - 1;
    if (row.upTo === null && !isLast) {
      problem('limits', `${label} has no upper limit but is not the last row.`);
    }
    if (row.upTo !== null && isLast) {
      problem('limits', `${label} is the last row and must have upTo null.`);
    }
    if (row.upTo !== null && !(row.upTo > row.above)) {
      problem('limits', `${label} upTo (${row.upTo}) must be greater than above (${row.above}).`);
    }

    if (i > 0) {
      const prev = rows[i - 1];
      if (prev.upTo !== null && row.above !== prev.upTo) {
        const kind = row.above > prev.upTo ? 'a gap' : 'an overlap';
        problem(
          'contiguous',
          `${label} starts above ${row.above} but row ${i} ends at ${prev.upTo}, leaving ${kind}.`,
        );
      }
      if (!(row.rate > prev.rate)) {
        problem(
          'rates',
          `${label} rate ${row.rate} must be higher than row ${i} rate ${prev.rate}.`,
        );
      }
      if (prev.upTo !== null) cumulative += prev.rate * (prev.upTo - prev.above);
      if (Math.abs(row.base - cumulative) > RAND_TOLERANCE + EPSILON) {
        problem(
          'base',
          `${label} base is ${formatRand(row.base)} but the lower rows add up to ` +
            `${formatRand(Math.round(cumulative))} (allowed difference R${RAND_TOLERANCE}).`,
        );
      }
    }
  });

  return problems;
}

/*
 * Tax thresholds are the income at which the rebates cancel the lowest-bracket tax:
 * https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
 * Returns null at a lowest rate of 0, where the division has no meaning.
 */
export function expectedThresholds(lowestRate: number, rebates: Rebates): Thresholds | null {
  if (lowestRate <= 0) return null;
  return {
    under65: rebates.primary / lowestRate,
    age65to74: (rebates.primary + rebates.secondary) / lowestRate,
    age75plus: (rebates.primary + rebates.secondary + rebates.tertiary) / lowestRate,
  };
}

const THRESHOLD_KEYS = ['under65', 'age65to74', 'age75plus'] as const;

export function findThresholdProblems(
  brackets: readonly BracketRow[],
  rebates: Rebates,
  thresholds: Record<string, number>,
): string[] {
  const expected = expectedThresholds(brackets[0].rate, rebates);
  if (!expected) return [];

  const problems: string[] = [];
  for (const key of THRESHOLD_KEYS) {
    const actual = thresholds[key];
    if (Math.abs(actual - expected[key]) > RAND_TOLERANCE + EPSILON) {
      problems.push(
        `thresholds.${key} is ${formatRand(actual)} but the rebates divided by the lowest rate ` +
          `give ${formatRand(Math.round(expected[key]))} (allowed difference R${RAND_TOLERANCE}).`,
      );
    }
  }
  return problems;
}
