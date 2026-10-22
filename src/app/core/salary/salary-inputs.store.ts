import { Injectable, computed, signal } from '@angular/core';

import { MONTHS_PER_YEAR, type PayPeriod, roundRand } from '../engine';
import { DEFAULT_SALARY_INPUTS, type SalaryInputs, sanitiseSalaryInputs } from './salary-inputs';

/**
 * The one Salary situation shared by the Pay page and the dashboard card.
 * Held in memory only: nothing is written to storage, so a reload starts from the example again.
 */
@Injectable({ providedIn: 'root' })
export class SalaryInputsStore {
  private readonly state = signal<SalaryInputs>(DEFAULT_SALARY_INPUTS);
  private readonly edited = signal(false);

  readonly inputs = this.state.asReadonly();
  /** True until the first edit, so screens can label the figures as an example. */
  readonly isExample = computed(() => !this.edited());

  /** Merges a patch after sanitising it (see `sanitiseSalaryInputs`). */
  update(patch: Partial<SalaryInputs>): void {
    this.state.update((current) => sanitiseSalaryInputs(patch, current));
    this.edited.set(true);
  }

  /** Switches between monthly and annual, converting `amount` so the same salary is described. */
  setPeriod(period: PayPeriod): void {
    const { period: current, amount } = this.state();
    if (period === current) return;
    // Why: round to cents so toggling back and forth never drifts.
    const converted = period === 'annual' ? amount * MONTHS_PER_YEAR : amount / MONTHS_PER_YEAR;
    this.update({ period, amount: roundRand(converted) });
  }

  reset(): void {
    this.state.set(DEFAULT_SALARY_INPUTS);
    this.edited.set(false);
  }
}
