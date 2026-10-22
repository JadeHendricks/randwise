import { TestBed } from '@angular/core/testing';

import { DeepMutable, makeTaxYear, provideTestData } from '../../testing/tax-data-fixtures';
import { TODAY } from './data-source';
import { TaxYearData } from './tax-year.schema';
import { TaxYearService } from './tax-year.service';

const file = (year: number, data: unknown = makeTaxYear(year)) => ({
  fileName: `${year}.json`,
  data,
});

function setup(today: string, taxYears = [file(2027)]): TaxYearService {
  TestBed.configureTestingModule({ providers: provideTestData({ today, taxYears }) });
  return TestBed.inject(TaxYearService);
}

describe('TaxYearService', () => {
  it('picks 2027 on 2026-10-22, current and not stale', () => {
    const service = setup('2026-10-22');
    expect(service.selectedYear()).toBe(2027);
    expect(service.taxYear()?.taxYear).toBe(2027);
    expect(service.isFallback()).toBe(false);
    expect(service.isStale()).toBe(false);
    expect(service.isDraft()).toBe(false);
    expect(service.carriedForwardFields()).toEqual([]);
    expect(service.validationErrors()).toEqual([]);
  });

  it('is not stale on the last day, 2027-02-28', () => {
    const service = setup('2027-02-28');
    expect(service.isStale()).toBe(false);
    expect(service.isFallback()).toBe(false);
  });

  it('falls back to 2027 and is stale on 2027-03-01', () => {
    const service = setup('2027-03-01');
    expect(service.selectedYear()).toBe(2027);
    expect(service.isFallback()).toBe(true);
    expect(service.isStale()).toBe(true);
  });

  it('uses the earliest year, not stale, when today is before every file', () => {
    const service = setup('2025-06-01');
    expect(service.selectedYear()).toBe(2027);
    expect(service.isFallback()).toBe(true);
    expect(service.isStale()).toBe(false);
  });

  it('excludes an invalid file, reports its errors and still uses the valid one', () => {
    const broken = makeTaxYear(2026) as DeepMutable<TaxYearData>;
    broken.incomeTaxBrackets.value[1].base += 1_000;
    const service = setup('2026-10-22', [file(2026, broken), file(2027)]);
    expect(service.availableYears()).toEqual([2027]);
    expect(service.taxYear()?.taxYear).toBe(2027);
    expect(service.validationErrors().length).toBeGreaterThan(0);
    expect(service.validationErrors().every((error) => error.startsWith('2026.json'))).toBe(true);
  });

  it('has no tax year when every file is invalid', () => {
    const service = setup('2026-10-22', [file(2027, { nonsense: true })]);
    expect(service.availableYears()).toEqual([]);
    expect(service.selectedYear()).toBeNull();
    expect(service.taxYear()).toBeNull();
    expect(service.isFallback()).toBe(false);
    expect(service.isStale()).toBe(false);
    expect(service.isDraft()).toBe(false);
    expect(service.carriedForwardFields()).toEqual([]);
    expect(service.validationErrors().length).toBeGreaterThan(0);
  });

  it('has no tax year when there are no files', () => {
    const service = setup('2026-10-22', []);
    expect(service.taxYear()).toBeNull();
    expect(service.validationErrors()).toEqual([]);
  });

  it('flags a draft file and lists its carried-forward fields by label', () => {
    const draft = makeTaxYear(2027, { status: 'draft' });
    draft.uif.carriedForward = true;
    draft.twoPot.carriedForward = true;
    const service = setup('2026-10-22', [file(2027, draft)]);
    expect(service.isDraft()).toBe(true);
    expect(service.carriedForwardFields()).toEqual(['UIF contributions', 'Two-pot retirement system']);
  });

  it('drops a second file for the same tax year with an error', () => {
    // Same name twice: each passes validation alone, so only the duplicate-year rule can reject one.
    const service = setup('2026-10-22', [file(2027), file(2027)]);
    expect(service.availableYears()).toEqual([2027]);
    expect(service.validationErrors()).toHaveLength(1);
    expect(service.validationErrors()[0]).toContain('already provided');
  });

  it('sorts available years ascending', () => {
    const service = setup('2026-10-22', [file(2027), file(2026)]);
    expect(service.availableYears()).toEqual([2026, 2027]);
  });

  describe('select()', () => {
    it('switches to an available year and ignores an unavailable one', () => {
      const service = setup('2026-10-22', [file(2026), file(2027)]);
      expect(service.selectedYear()).toBe(2027);

      service.select(2026);
      expect(service.selectedYear()).toBe(2026);
      expect(service.taxYear()?.taxYear).toBe(2026);
      expect(service.isStale()).toBe(true);
      // Chosen by hand, so it is not the automatic fallback.
      expect(service.isFallback()).toBe(false);

      service.select(1999);
      expect(service.selectedYear()).toBe(2026);
    });
  });

  it('uses the bundled 2027 file by default', () => {
    // Only the clock is pinned; DATA_SOURCE keeps its default.
    TestBed.configureTestingModule({
      providers: [{ provide: TODAY, useValue: () => new Date(2026, 9, 22) }],
    });
    const service = TestBed.inject(TaxYearService);
    expect(service.availableYears()).toEqual([2027]);
    expect(service.taxYear()?.taxYear).toBe(2027);
    expect(service.validationErrors()).toEqual([]);
  });
});
