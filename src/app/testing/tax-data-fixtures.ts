import { Provider } from '@angular/core';

import { DATA_SOURCE, DataFile, DataSource, TODAY } from '../core/data/data-source';
import { RatesFile } from '../core/data/rates.schema';
import { IsoDate, parseIsoDate, taxYearPeriod } from '../core/data/tax-calendar';
import { BracketRow, Field, TaxYearData } from '../core/data/tax-year.schema';

/** Lets specs break a fixture in place without casts on every line. */
export type DeepMutable<T> = T extends readonly (infer U)[]
  ? DeepMutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
    : T;

const SARS_INDIVIDUALS =
  'https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/';
/** Placeholder source for the obviously-fake values below. */
const TEST_SOURCE = 'https://example.org/randwise-test-data';

const field = <T>(value: T, source = TEST_SOURCE): DeepMutable<Field<T>> =>
  ({ value, carriedForward: false, source }) as DeepMutable<Field<T>>;

/** 2026/27 individual brackets, user-verified against SARS. */
const VERIFIED_BRACKETS: BracketRow[] = [
  { above: 0, upTo: 245_100, base: 0, rate: 0.18 },
  { above: 245_100, upTo: 383_100, base: 44_118, rate: 0.26 },
  { above: 383_100, upTo: 530_200, base: 79_998, rate: 0.31 },
  { above: 530_200, upTo: 695_800, base: 125_599, rate: 0.36 },
  { above: 695_800, upTo: 887_000, base: 185_215, rate: 0.39 },
  { above: 887_000, upTo: 1_878_600, base: 259_783, rate: 0.41 },
  { above: 1_878_600, upTo: null, base: 666_339, rate: 0.45 },
];

/**
 * A fresh, valid tax-year object. Brackets, rebates and thresholds are the real 2026/27 values;
 * every other figure is test data (round numbers) that only has to pass validation.
 */
export function makeTaxYear(
  endYear = 2027,
  patch: Partial<Record<keyof TaxYearData, unknown>> = {},
): DeepMutable<TaxYearData> {
  const period = taxYearPeriod(endYear);
  const base: DeepMutable<TaxYearData> = {
    taxYear: endYear,
    period: { ...period },
    status: 'verified',
    verifiedOn: period.start,
    sources: [SARS_INDIVIDUALS, TEST_SOURCE],
    incomeTaxBrackets: field(
      VERIFIED_BRACKETS.map((row) => ({ ...row })),
      SARS_INDIVIDUALS,
    ),
    rebates: field({ primary: 17_820, secondary: 9_765, tertiary: 3_249 }, SARS_INDIVIDUALS),
    thresholds: field(
      { under65: 99_000, age65to74: 153_250, age75plus: 171_300 },
      SARS_INDIVIDUALS,
    ),
    medicalCredits: field({ mainMember: 100, firstDependant: 100, additionalDependant: 50 }),
    uif: field({ employeeRate: 0.01, monthlyEarningsCeiling: 10_000 }),
    retirementDeduction: field({ rate: 0.25, annualCap: 100_000 }),
    tfsa: field({ annualLimit: 10_000, lifetimeLimit: 100_000, excessPenaltyRate: 0.4 }),
    retirementLumpSum: field([
      { above: 0, upTo: 100_000, base: 0, rate: 0 },
      { above: 100_000, upTo: null, base: 0, rate: 0.2 },
    ]),
    withdrawalLumpSum: field([
      { above: 0, upTo: 10_000, base: 0, rate: 0 },
      { above: 10_000, upTo: 110_000, base: 0, rate: 0.1 },
      { above: 110_000, upTo: null, base: 10_000, rate: 0.3 },
    ]),
    twoPot: field({
      savingsShare: 0.25,
      retirementShare: 0.75,
      minimumWithdrawal: 1_000,
      withdrawalsPerTaxYear: 2,
    }),
    annuitisationDeMinimis: field(100_000),
    livingAnnuityDrawdown: field({ minRate: 0.01, maxRate: 0.2 }),
    interestExemption: field({ under65: 10_000, age65plus: 20_000 }),
    cgt: field({ annualExclusion: 10_000, inclusionRate: 0.5 }),
    dividendsWithholdingRate: field(0.1),
    earliestRaRetirementAge: field(50),
  };
  return { ...base, ...patch } as DeepMutable<TaxYearData>;
}

export interface TestDataOptions {
  /** Defaults to one valid 2027.json fixture. */
  taxYears?: readonly DataFile[];
  /** Defaults to a valid rates.json fixture. */
  rates?: DataFile;
  /** The pretend current day: an ISO date (local midnight) or a Date. */
  today: IsoDate | Date;
}

/** Providers that replace the bundled data and the clock, so specs do not depend on real data or dates. */
export function provideTestData(options: TestDataOptions): Provider[] {
  const source: DataSource = {
    taxYears: options.taxYears ?? [{ fileName: '2027.json', data: makeTaxYear(2027) }],
    rates: options.rates ?? { fileName: 'rates.json', data: makeRates() },
  };
  const today = typeof options.today === 'string' ? parseIsoDate(options.today) : options.today;
  return [
    { provide: DATA_SOURCE, useValue: source },
    { provide: TODAY, useValue: () => new Date(today) },
  ];
}

/** A fresh, valid rates snapshot (test values). */
export function makeRates(
  patch: Partial<Record<keyof RatesFile, unknown>> = {},
): DeepMutable<RatesFile> {
  const asOf = '2026-10-22';
  const entry = (label: string, valuePercent: number, seriesCode: string) => ({
    label,
    valuePercent,
    asOf,
    seriesCode,
  });
  const base: DeepMutable<RatesFile> = {
    source: 'https://custom.resbank.co.za/SarbWebApi/WebIndicators/HomePageRates',
    fetchedOn: asOf,
    rates: {
      repo: entry('Repo rate', 7, 'MMRD002A'),
      prime: entry('Prime lending rate', 10.5, 'MMRD000A'),
      cpi: { ...entry('CPI inflation', 4.5, 'CPI1000F'), asOf: '2026-09-30' },
      r2030: entry('R2030 yield', 8, 'MMRD708A'),
      r209: entry('R209 yield', 8.5, 'MMRD709A'),
      zaronia: entry('ZARONIA', 7, 'MMRD855A'),
    },
  };
  return { ...base, ...patch } as DeepMutable<RatesFile>;
}
