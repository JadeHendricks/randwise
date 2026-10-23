import { TestBed } from '@angular/core/testing';

import { TODAY } from '../data/data-source';
import { TaxYearService } from '../data/tax-year.service';
import { roundRand } from '../engine';
import { makeTaxYear, provideTestData } from '../../testing/tax-data-fixtures';
import { SalaryEstimator } from './salary-estimator';
import { SalaryInputsStore } from './salary-inputs.store';

// Pinned so the bundled 2027 file is the tax year in use whatever day the specs run.
const TODAY_PINNED = new Date(2026, 9, 22);

function setupBundled() {
  TestBed.configureTestingModule({
    providers: [{ provide: TODAY, useValue: () => new Date(TODAY_PINNED) }],
  });
  return {
    estimator: TestBed.inject(SalaryEstimator),
    store: TestBed.inject(SalaryInputsStore),
  };
}

function netPay(estimator: SalaryEstimator): number {
  const estimate = estimator.estimate();
  if (!estimate?.ok) throw new Error('expected an estimate');
  return roundRand(estimate.payslip.monthly.netPay);
}

describe('SalaryEstimator', () => {
  it('estimates the default R30 000 as R25 141.88 net', () => {
    const { estimator } = setupBundled();
    expect(estimator.tables()).not.toBeNull();
    expect(netPay(estimator)).toBe(25_141.88);
    expect(estimator.curve()?.points).toHaveLength(25);
  });

  it('recomputes when the store is edited', () => {
    const { estimator, store } = setupBundled();
    store.update({ age: 65 });
    expect(netPay(estimator)).toBe(25_955.63);
  });

  it('has no estimate or curve when there is no valid tax year', () => {
    TestBed.configureTestingModule({
      providers: provideTestData({ taxYears: [], today: TODAY_PINNED }),
    });
    const estimator = TestBed.inject(SalaryEstimator);
    expect(estimator.tables()).toBeNull();
    expect(estimator.estimate()).toBeNull();
    expect(estimator.curve()).toBeNull();
  });

  it('has a failed estimate and no curve for an impossible net amount', () => {
    const { estimator, store } = setupBundled();
    store.update({ basis: 'net', amount: 5e9 });
    expect(estimator.estimate()?.ok).toBe(false);
    expect(estimator.curve()).toBeNull();
  });

  it('switchBasis("net") turns R30 000 gross into R25 141.88 net, and back', () => {
    const { estimator, store } = setupBundled();
    estimator.switchBasis('net');
    expect(store.inputs().basis).toBe('net');
    expect(store.inputs().amount).toBe(25_141.88);
    expect(netPay(estimator)).toBe(25_141.88);

    estimator.switchBasis('gross');
    expect(store.inputs().basis).toBe('gross');
    expect(Math.abs(store.inputs().amount - 30_000)).toBeLessThanOrEqual(0.01);
  });

  it('switchBasis uses the annual figures when the period is annual', () => {
    const { estimator, store } = setupBundled();
    store.setPeriod('annual');
    estimator.switchBasis('net');
    expect(store.inputs().amount).toBe(301_702.56);
  });

  it('switchBasis only sets the basis when there is no estimate', () => {
    TestBed.configureTestingModule({
      providers: provideTestData({ taxYears: [], today: TODAY_PINNED }),
    });
    const estimator = TestBed.inject(SalaryEstimator);
    const store = TestBed.inject(SalaryInputsStore);
    estimator.switchBasis('net');
    expect(store.inputs().basis).toBe('net');
    expect(store.inputs().amount).toBe(30_000);
  });

  it('follows the tax year chosen on TaxYearService', () => {
    // Only the (fixture) medical credit differs: R600 instead of R100 for a main member.
    const richer = makeTaxYear(2028, {
      medicalCredits: {
        value: { mainMember: 600, firstDependant: 100, additionalDependant: 50 },
        carriedForward: false,
        source: 'https://example.org/randwise-test-data',
      },
    });
    TestBed.configureTestingModule({
      providers: provideTestData({
        today: TODAY_PINNED,
        taxYears: [
          { fileName: '2027.json', data: makeTaxYear(2027) },
          { fileName: '2028.json', data: richer },
        ],
      }),
    });
    const estimator = TestBed.inject(SalaryEstimator);
    const years = TestBed.inject(TaxYearService);
    TestBed.inject(SalaryInputsStore).update({ medicalMembers: 1 });
    const before = netPay(estimator);
    years.select(2028);
    expect(years.selectedYear()).toBe(2028);
    expect(netPay(estimator) - before).toBeCloseTo(500, 2);
  });
});
