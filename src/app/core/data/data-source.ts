import { InjectionToken } from '@angular/core';

import { BUNDLED_DATA } from './bundled-data';

/** One raw JSON file plus the name used to prefix its validation messages. */
export interface DataFile {
  readonly fileName: string;
  /** Untrusted until a validator has accepted it. */
  readonly data: unknown;
}

export interface DataSource {
  readonly taxYears: readonly DataFile[];
  readonly rates: DataFile;
}

/** Where the services read their data from. Defaults to the JSON bundled into the app. */
export const DATA_SOURCE = new InjectionToken<DataSource>('DATA_SOURCE', {
  providedIn: 'root',
  factory: () => BUNDLED_DATA,
});

/** Returns "now". A function so specs can pin the date without fake timers. */
export const TODAY = new InjectionToken<() => Date>('TODAY', {
  providedIn: 'root',
  factory: () => () => new Date(),
});
