import { Injectable, computed, inject } from '@angular/core';

import { TaxYearService } from '../data/tax-year.service';
import { toTaxTables, roundRand } from '../engine';
import { type SalaryEstimate, estimateSalary } from './estimate-salary';
import { type NetVsGross, netVsGross } from './net-vs-gross';
import type { AmountBasis } from './salary-inputs';
import { SalaryInputsStore } from './salary-inputs.store';

/**
 * The shared answer for the Salary inputs. The Pay page and the dashboard card both read this one
 * root service, so they cannot disagree. All the maths is in the pure functions it calls.
 */
@Injectable({ providedIn: 'root' })
export class SalaryEstimator {
  private readonly store = inject(SalaryInputsStore);
  private readonly taxYears = inject(TaxYearService);

  /** Engine tables for the selected tax year, or null when no valid tax year exists. */
  readonly tables = computed(() => {
    const data = this.taxYears.taxYear();
    return data ? toTaxTables(data) : null;
  });

  /** Null only when there is no tax data; a figure the engine rejects comes back as `ok: false`. */
  readonly estimate = computed<SalaryEstimate | null>(() => {
    const tables = this.tables();
    return tables ? estimateSalary(this.store.inputs(), tables) : null;
  });

  /** Net pay against gross for the chart; null unless there is a good estimate. */
  readonly curve = computed<NetVsGross | null>(() => {
    const tables = this.tables();
    const estimate = this.estimate();
    if (!tables || !estimate?.ok) return null;
    return netVsGross(this.store.inputs(), tables, estimate.payslip.monthly.gross);
  });

  /**
   * Changes whether `amount` is gross or take-home, keeping the same person: the amount becomes the
   * rounded equivalent from the latest estimate (30 000 gross becomes 25 141.88 net, not "30 000 net").
   * Without a good estimate only the basis changes.
   */
  switchBasis(basis: AmountBasis): void {
    const estimate = this.estimate();
    if (!estimate?.ok) {
      this.store.update({ basis });
      return;
    }
    const amounts = estimate.payslip[this.store.inputs().period];
    this.store.update({
      basis,
      amount: roundRand(basis === 'net' ? amounts.netPay : amounts.gross),
    });
  }
}
