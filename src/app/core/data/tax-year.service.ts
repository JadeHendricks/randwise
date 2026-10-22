import { Injectable, computed, inject, linkedSignal } from '@angular/core';

import { DATA_SOURCE, TODAY } from './data-source';
import { pickTaxYear, toLocalIsoDate } from './tax-calendar';
import { TAX_YEAR_FIELD_KEYS, TAX_YEAR_FIELD_LABELS, TaxYearData } from './tax-year.schema';
import { validateTaxYearFile } from './tax-year.validator';

/**
 * Validated tax-year files, which one applies today, and how trustworthy it is.
 * Reads data only through DATA_SOURCE and today only through TODAY; nothing is persisted.
 */
@Injectable({ providedIn: 'root' })
export class TaxYearService {
  /** Read once: the app does not roll over at midnight while open. */
  private readonly today = toLocalIsoDate(inject(TODAY)());

  // Each file is validated once; the data never changes while the app runs.
  private readonly loaded = this.load();

  /** Years with a valid file, ascending. */
  readonly availableYears = computed<readonly number[]>(() => this.loaded.years);
  /** Human-readable problems from every rejected file (invalid or duplicate year). */
  readonly validationErrors = computed<readonly string[]>(() => this.loaded.errors);

  private readonly selection = linkedSignal<number | null>(
    () => pickTaxYear(this.availableYears(), this.today)?.year ?? null,
  );
  /** The year in use: today's by default, or the one chosen with `select()`. Null if no valid file. */
  readonly selectedYear = this.selection.asReadonly();

  readonly taxYear = computed<TaxYearData | null>(() => {
    const year = this.selectedYear();
    return year === null ? null : (this.loaded.byYear.get(year) ?? null);
  });
  /** True when no file covers today, so a nearby year's rules are used instead. */
  readonly isFallback = computed(() => {
    const pick = pickTaxYear(this.availableYears(), this.today);
    return pick !== null && this.selectedYear() === pick.year && pick.fallback;
  });
  /** Today is after the selected year's last day (28/29 Feb): its rules are out of date. */
  readonly isStale = computed(() => {
    const data = this.taxYear();
    return data !== null && this.today > data.period.end;
  });
  readonly isDraft = computed(() => this.taxYear()?.status === 'draft');
  /** Labels of fields whose values could not be confirmed for this tax year. */
  readonly carriedForwardFields = computed<readonly string[]>(() => {
    const data = this.taxYear();
    if (data === null) return [];
    return TAX_YEAR_FIELD_KEYS.filter((key) => data[key].carriedForward).map(
      (key) => TAX_YEAR_FIELD_LABELS[key],
    );
  });

  /** Switches year. Years without a valid file are ignored. */
  select(year: number): void {
    if (this.availableYears().includes(year)) {
      this.selection.set(year);
    }
  }

  private load() {
    const byYear = new Map<number, TaxYearData>();
    const errors: string[] = [];
    for (const file of inject(DATA_SOURCE).taxYears) {
      const result = validateTaxYearFile(file.data, file.fileName);
      if (!result.ok) {
        errors.push(...result.errors);
      } else if (byYear.has(result.value.taxYear)) {
        errors.push(
          `${file.fileName}: tax year ${result.value.taxYear} is already provided by another file, so this one is ignored.`,
        );
      } else {
        byYear.set(result.value.taxYear, result.value);
      }
    }
    const years = [...byYear.keys()].sort((a, b) => a - b);
    return { byYear, years, errors };
  }
}
