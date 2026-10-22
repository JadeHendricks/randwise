import { Injectable, computed, inject, linkedSignal, signal } from '@angular/core';
import { RatesService } from '../data/rates.service';
import { TaxYearService } from '../data/tax-year.service';
import { type RaRules, toRaRules } from '../engine';
import { type RaEstimate, estimateRa } from '../ra/estimate-ra';
import type { RaInputs } from '../ra/ra-inputs';
import { raPlanDefaults } from '../ra/ra-inputs';
import {
  type RaSlice,
  editRa,
  effectiveRaInputs,
  freshRaSlice,
  nextRaSlice,
  undoRa as undoRaSlice,
} from '../ra/ra-slice';
import { SalaryEstimator } from '../salary/salary-estimator';
import { SalaryInputsStore } from '../salary/salary-inputs.store';
import type {
  Handoff,
  HandoffSource,
  HandoffTarget,
  HandoffValuesByTarget,
  SendTargetId,
} from './handoff';
import { type PlanProfile, profileFromSalary, raHandoffFrom } from './plan-profile';

/** What other calculators (the dashboard now, Journey later) read from the RA. Full precision. */
export interface RaOutputs {
  readonly headroomAnnual: number;
  readonly headroomMonthly: number;
  readonly taxSavingAnnual: number;
}

/** One key per calculator that publishes figures; null when it has nothing to show. */
export interface PlanOutputs {
  readonly ra: RaOutputs | null;
}

type Handoffs = { readonly [T in HandoffTarget]?: Handoff<T> };

/**
 * The one place calculators share figures. It reads the Salary situation, carries "Send to"
 * handoffs, and holds each calculator's slice (the RA one for now). The slice logic lives in pure
 * files under `core/ra`, so this store is only wiring. In memory only: nothing is persisted.
 */
@Injectable({ providedIn: 'root' })
export class PlanContextStore {
  private readonly salary = inject(SalaryInputsStore);
  private readonly estimator = inject(SalaryEstimator);
  private readonly taxYears = inject(TaxYearService);
  // Read once: the bundled rates never change while the app runs.
  private readonly raPlanDefaults = raPlanDefaults(inject(RatesService).assumptions());

  private readonly handoffs = signal<Handoffs>({});
  private nextId = 1;

  /** The shared figures, read live from the Salary inputs and estimate. */
  readonly profile = computed<PlanProfile>(() =>
    profileFromSalary(this.salary.inputs(), this.estimator.estimate()),
  );

  readonly raHandoff = computed<Handoff<'ra'> | null>(() => this.handoffs().ra ?? null);

  // A new handoff (a new object) resets local salary edits to the sent values; see `nextRaSlice`.
  private readonly raSlice = linkedSignal<Handoff<'ra'> | null, RaSlice>({
    source: this.raHandoff,
    computation: (handoff, previous) => nextRaSlice(handoff, previous, this.raPlanDefaults),
  });

  /** The inputs the RA calculator works from: the Salary profile live until overridden. */
  readonly ra = computed<RaInputs>(() =>
    effectiveRaInputs(this.raSlice(), raHandoffFrom(this.profile())),
  );
  /** Who sent the figures in use, for the "From ..." chip. */
  readonly raFrom = computed<HandoffSource | null>(() => this.raSlice().from);
  readonly raCanUndo = computed(() => this.raSlice().undo !== null);
  /** True while the RA figures are the untouched example. */
  readonly raIsExample = computed(() => {
    const slice = this.raSlice();
    return !slice.planEdited && slice.profile === null && slice.from === null;
  });

  /** Two-pot split and earliest payout age from the selected tax year; null without tax data. */
  readonly raRules = computed<RaRules | null>(() => {
    const data = this.taxYears.taxYear();
    return data ? toRaRules(data) : null;
  });

  /** Null only when there is no tax data; a figure the engine rejects comes back as `ok: false`. */
  readonly raEstimate = computed<RaEstimate | null>(() => {
    const tables = this.estimator.tables();
    const rules = this.raRules();
    return tables && rules ? estimateRa(this.ra(), tables, rules) : null;
  });

  /** Figures other calculators and the dashboard can show. Full precision; round at the edge. */
  readonly outputs = computed<PlanOutputs>(() => {
    const estimate = this.raEstimate();
    if (!estimate?.ok) return { ra: null };
    const { headroom, taxSaving } = estimate.result;
    return {
      ra: {
        headroomAnnual: headroom.headroom,
        headroomMonthly: headroom.headroomMonthly,
        taxSavingAnnual: taxSaving.saving,
      },
    };
  });

  /** Sends figures to a calculator. Each call is a new handoff, even with identical values. */
  send<T extends HandoffTarget>(
    target: T,
    source: HandoffSource,
    values: HandoffValuesByTarget[T],
  ): void {
    const handoff: Handoff<T> = { id: this.nextId++, source, target, values };
    this.handoffs.update((all) => ({ ...all, [target]: handoff }));
  }

  /**
   * Sends the current Salary figures. Returns false, and changes nothing, for targets that are
   * not built yet.
   */
  sendFromSalary(target: SendTargetId): boolean {
    if (target !== 'ra') return false;
    this.send('ra', 'salary', raHandoffFrom(this.profile()));
    return true;
  }

  dismiss(target: HandoffTarget): void {
    this.handoffs.update((all) => ({ ...all, [target]: undefined }));
  }

  updateRa(patch: Partial<RaInputs>): void {
    this.raSlice.update((slice) => editRa(slice, patch, raHandoffFrom(this.profile())));
  }

  undoRa(): void {
    const slice = this.raSlice();
    if (!slice.undo) return;
    const restored = undoRaSlice(slice);
    // Why this order: dismissing changes the linkedSignal source, which queues a recomputation
    // that would keep the sent values. Setting AFTER the dismissal makes the restored state win,
    // because a linkedSignal `set` first brings the signal up to date and then overwrites it.
    this.dismiss('ra');
    this.raSlice.set(restored);
  }

  resetRa(): void {
    this.dismiss('ra');
    this.raSlice.set(freshRaSlice(this.raPlanDefaults));
  }
}
