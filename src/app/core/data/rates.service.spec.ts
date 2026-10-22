import { TestBed } from '@angular/core/testing';

import { makeRates, provideTestData } from '../../testing/tax-data-fixtures';
import { TODAY } from './data-source';
import { RatesService } from './rates.service';

describe('RatesService', () => {
  it('exposes a valid snapshot, its fetch date and the derived assumptions', () => {
    TestBed.configureTestingModule({
      providers: provideTestData({
        today: '2026-10-22',
        rates: { fileName: 'rates.json', data: makeRates({ fetchedOn: '2026-10-23' }) },
      }),
    });
    const service = TestBed.inject(RatesService);
    expect(service.rates()?.repo.valuePercent).toBe(7);
    // The snapshot date, not the individual rate dates (those are 2026-10-22 / 2026-09-30).
    expect(service.ratesAsOf()).toBe('2026-10-23');
    expect(service.assumptions()?.growthReturn.valuePercent).toBe(9.5);
    expect(service.validationErrors()).toEqual([]);
  });

  it('returns nulls and the errors for an invalid file', () => {
    TestBed.configureTestingModule({
      providers: provideTestData({
        today: '2026-10-22',
        rates: { fileName: 'rates.json', data: { source: 'nope' } },
      }),
    });
    const service = TestBed.inject(RatesService);
    expect(service.rates()).toBeNull();
    expect(service.ratesAsOf()).toBeNull();
    expect(service.assumptions()).toBeNull();
    expect(service.validationErrors().length).toBeGreaterThan(0);
    expect(service.validationErrors()[0]).toContain('rates.json');
  });

  it('uses the bundled file by default', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: TODAY, useValue: () => new Date(2026, 9, 22) }],
    });
    const service = TestBed.inject(RatesService);
    expect(service.validationErrors()).toEqual([]);
    expect(service.rates()?.repo.seriesCode).toBe('MMRD002A');
    expect(service.ratesAsOf()).not.toBeNull();
    expect(service.assumptions()).not.toBeNull();
  });
});
