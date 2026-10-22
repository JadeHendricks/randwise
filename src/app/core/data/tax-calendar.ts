/**
 * South African tax-year calendar helpers. Pure functions, no Angular.
 *
 * A tax year (year of assessment) runs from 1 March to the last day of February
 * and is named by the calendar year it ends in: the 2027 tax year is
 * 1 March 2026 to 28 February 2027, shown as "2026/27".
 */

/** A calendar date as `YYYY-MM-DD`. Compared as plain strings (lexical order = date order). */
export type IsoDate = string;

export interface TaxYearPeriod {
  readonly start: IsoDate;
  readonly end: IsoDate;
}

export interface TaxYearPick {
  readonly year: number;
  /** True when no available file covers `today`, so a nearby year is used instead. */
  readonly fallback: boolean;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (n: number) => String(n).padStart(2, '0');

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function lastDayOfFebruary(year: number): number {
  return isLeapYear(year) ? 29 : 28;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return lastDayOfFebruary(year);
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Strict `YYYY-MM-DD` that is also a real calendar date (`2026-02-30` fails). */
export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/**
 * The local calendar date of `date`. Built from local Y/M/D on purpose:
 * `toISOString()` is UTC and would report the previous day between 00:00 and 02:00 SAST.
 */
export function toLocalIsoDate(date: Date): IsoDate {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Local midnight of an ISO date. Throws on an invalid date so bad data never renders silently. */
export function parseIsoDate(iso: IsoDate): Date {
  if (!isIsoDate(iso)) throw new Error(`Not a valid ISO date: ${iso}`);
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** The tax year (by end year) that contains `iso`: March onwards belongs to the next year. */
export function taxYearEndingOn(iso: IsoDate): number {
  const date = parseIsoDate(iso);
  const year = date.getFullYear();
  return date.getMonth() + 1 >= 3 ? year + 1 : year;
}

export function taxYearPeriod(endYear: number): TaxYearPeriod {
  return {
    start: `${endYear - 1}-03-01`,
    end: `${endYear}-02-${lastDayOfFebruary(endYear)}`,
  };
}

/** `2027` -> `2026/27`, `2100` -> `2099/00`. */
export function taxYearLabel(endYear: number): string {
  return `${endYear - 1}/${pad2(endYear % 100)}`;
}

/**
 * Which tax-year file to use on `today`:
 * the file covering today; else the latest year that already ended (stale data);
 * else, when every file is in the future, the earliest one. Empty list -> null.
 */
export function pickTaxYear(available: readonly number[], today: IsoDate): TaxYearPick | null {
  if (available.length === 0) return null;
  const current = taxYearEndingOn(today);
  if (available.includes(current)) return { year: current, fallback: false };

  const ended = available.filter((year) => taxYearPeriod(year).end < today);
  if (ended.length > 0) return { year: Math.max(...ended), fallback: true };

  return { year: Math.min(...available), fallback: true };
}
