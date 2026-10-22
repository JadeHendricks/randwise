import { Injectable, computed, inject } from '@angular/core';

import { deriveAssumptions } from './assumptions';
import { DATA_SOURCE } from './data-source';
import { RatesFile } from './rates.schema';
import { validateRatesFile } from './rates.validator';

/** Validated SARB rates snapshot and the planning assumptions derived from it. Read-only, in memory. */
@Injectable({ providedIn: 'root' })
export class RatesService {
  // Validated once; the bundled data never changes while the app runs.
  private readonly source = inject(DATA_SOURCE).rates;
  private readonly result = validateRatesFile(this.source.data, this.source.fileName);
  private readonly file: RatesFile | null = this.result.ok ? this.result.value : null;

  /** Null when the file failed validation. */
  readonly rates = computed(() => this.file?.rates ?? null);
  /**
   * The date the snapshot was taken from SARB (`fetchedOn`), not any single rate's own date.
   * Each rate keeps its own `asOf` (CPI is monthly, yields lag a day). Task 11 refreshes the
   * file when this is older than 7 days.
   */
  readonly ratesAsOf = computed(() => this.file?.fetchedOn ?? null);
  /** Null when the rates are unavailable. */
  readonly assumptions = computed(() => {
    const rates = this.rates();
    return rates ? deriveAssumptions(rates) : null;
  });
  readonly validationErrors = computed<readonly string[]>(() =>
    this.result.ok ? [] : this.result.errors,
  );
}
