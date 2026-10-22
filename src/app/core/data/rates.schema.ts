import { IsoDate } from './tax-calendar';

/** Shape of `src/assets/data/rates.json`, a snapshot of SARB's published home-page rates. */

export interface RateEntry {
  readonly label: string;
  /** Percentage points as published by SARB, e.g. 7.25 for 7.25%. */
  readonly valuePercent: number;
  /** The date SARB gives for this value (CPI is monthly, yields lag a day). */
  readonly asOf: IsoDate;
  /** SARB time-series code, e.g. MMRD002A for the policy (repo) rate. */
  readonly seriesCode: string;
}

export interface Rates {
  readonly repo: RateEntry;
  readonly prime: RateEntry;
  readonly cpi: RateEntry;
  readonly r2030: RateEntry;
  readonly r209: RateEntry;
  readonly zaronia: RateEntry;
}

export type RateKey = keyof Rates;

export const RATE_KEYS: readonly RateKey[] = ['repo', 'prime', 'cpi', 'r2030', 'r209', 'zaronia'];

export interface RatesFile {
  readonly source: string;
  /** The date the snapshot was taken from SARB. */
  readonly fetchedOn: IsoDate;
  readonly rates: Rates;
}
