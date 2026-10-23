import { Injectable, computed, inject, signal } from '@angular/core';

import { RatesService } from '../data/rates.service';
import { TaxYearService } from '../data/tax-year.service';
import {
  type InvestmentTaxRules,
  type TwoPotRules,
  roundRand,
  toInvestmentTaxRules,
  toRaRules,
} from '../engine';
import { PlanContextStore } from '../plan/plan-context.store';
import { SalaryEstimator } from '../salary/salary-estimator';
import { type EmergencyFundEstimate, estimateEmergencyFund } from './estimate-emergency-fund';
import { type HomeLoanEstimate, estimateHomeLoan } from './estimate-home-loan';
import { type InvestmentEstimate, estimateInvestment } from './estimate-investment';
import { type TwoPotEstimate, estimateTwoPot } from './estimate-two-pot';
import {
  type EmergencyFundInputs,
  type HomeLoanInputs,
  type InvestmentInputs,
  type TwoPotInputs,
  emergencyFundDefaults,
  homeLoanDefaults,
  investmentDefaults,
  overridesAfter,
  percentFromFraction,
  sanitiseEmergencyFund,
  sanitiseHomeLoan,
  sanitiseInvestment,
  sanitiseTwoPot,
  twoPotDefaults,
} from './toolbox-inputs';

/**
 * The inputs and answers of the four Toolbox calculators. Each tool keeps an `overrides` object
 * with only the fields the user typed, and its inputs are `{ ...defaults, ...overrides }`, so a
 * field that has not been touched keeps following the published-rate assumptions and the Pay page
 * (income, age, medical aid, marginal rate) and stops following once it is edited. This store is
 * wiring only: the maths is in the pure files under `core/toolbox` and `core/engine`. In memory
 * only: nothing is persisted.
 */
@Injectable({ providedIn: 'root' })
export class ToolboxStore {
  private readonly rates = inject(RatesService);
  private readonly taxYears = inject(TaxYearService);
  private readonly estimator = inject(SalaryEstimator);
  private readonly plan = inject(PlanContextStore);

  /** Prime lending rate as a percent, or null when the rates are unavailable. */
  readonly prime = computed<number | null>(() => this.rates.rates()?.prime.valuePercent ?? null);

  /**
   * What the Budget counts as needs, rands a month, for the emergency fund target; null while the
   * Budget has no good estimate.
   */
  readonly budgetNeeds = computed<number | null>(() => {
    const estimate = this.plan.budgetEstimate();
    return estimate?.ok ? estimate.limits.emergency.needsMonthly : null;
  });

  /** The Pay page figures the tools follow, resolved once. */
  private readonly pay = computed(() => {
    const profile = this.plan.profile();
    const estimate = this.estimator.estimate();
    const slip = estimate?.ok ? estimate.payslip : null;
    return {
      grossMonthly: profile.grossMonthly,
      age: profile.age,
      medicalMembers: profile.medicalMembers,
      employeeRetirementMonthly: profile.employeeRetirementMonthly,
      employerRetirementMonthly: profile.employerRetirementMonthly,
      // Without a good Pay estimate there is no taxable income or marginal rate to follow.
      taxableIncomeAnnual: slip ? roundRand(slip.annual.taxableIncome) : 0,
      marginalRatePercent: slip ? percentFromFraction(slip.marginalRate) : 0,
    };
  });

  /** True when the published rates could not be read, so rate defaults start at 0. */
  private readonly ratesUnavailable = computed(() => this.rates.assumptions() === null);

  /** Two-pot withdrawal rules and the investment tax rules; null without tax data. */
  private readonly twoPotRules = computed<TwoPotRules | null>(() => {
    const data = this.taxYears.taxYear();
    return data ? toRaRules(data) : null;
  });
  private readonly investmentRules = computed<InvestmentTaxRules | null>(() => {
    const data = this.taxYears.taxYear();
    return data ? toInvestmentTaxRules(data) : null;
  });

  // Emergency fund ----------------------------------------------------------------------------

  private readonly emergencyFundOverrides = signal<Partial<EmergencyFundInputs>>({});

  readonly emergencyFundInputs = computed<EmergencyFundInputs>(() => ({
    ...emergencyFundDefaults(this.rates.assumptions()),
    ...this.emergencyFundOverrides(),
  }));
  /** True while no field has been edited. */
  readonly emergencyFundIsExample = computed(
    () => Object.keys(this.emergencyFundOverrides()).length === 0,
  );
  /** Needs no tax data, so it is never null. */
  readonly emergencyFundEstimate = computed<EmergencyFundEstimate>(() =>
    estimateEmergencyFund(this.emergencyFundInputs()),
  );

  updateEmergencyFund(patch: Partial<EmergencyFundInputs>): void {
    const before = this.emergencyFundInputs();
    const after = sanitiseEmergencyFund(patch, before);
    this.emergencyFundOverrides.update((all) => overridesAfter(all, patch, before, after));
  }

  resetEmergencyFund(): void {
    this.emergencyFundOverrides.set({});
  }

  // Home loan ---------------------------------------------------------------------------------

  private readonly homeLoanOverrides = signal<Partial<HomeLoanInputs>>({});

  readonly homeLoanInputs = computed<HomeLoanInputs>(() => ({
    ...homeLoanDefaults(this.prime()),
    grossMonthly: this.pay().grossMonthly,
    ...this.homeLoanOverrides(),
  }));
  readonly homeLoanIsExample = computed(() => Object.keys(this.homeLoanOverrides()).length === 0);
  /** Null only without tax data (take-home pay needs the tables). */
  readonly homeLoanEstimate = computed<HomeLoanEstimate | null>(() => {
    const tables = this.estimator.tables();
    return tables
      ? estimateHomeLoan(this.homeLoanInputs(), this.pay(), tables, this.prime() !== null)
      : null;
  });

  updateHomeLoan(patch: Partial<HomeLoanInputs>): void {
    const before = this.homeLoanInputs();
    const after = sanitiseHomeLoan(patch, before);
    this.homeLoanOverrides.update((all) => overridesAfter(all, patch, before, after));
  }

  resetHomeLoan(): void {
    this.homeLoanOverrides.set({});
  }

  // Two-pot withdrawal ------------------------------------------------------------------------

  private readonly twoPotOverrides = signal<Partial<TwoPotInputs>>({});

  readonly twoPotInputs = computed<TwoPotInputs>(() => {
    const { taxableIncomeAnnual, age, medicalMembers } = this.pay();
    return {
      ...twoPotDefaults(this.rates.assumptions()),
      taxableIncomeAnnual,
      age,
      medicalMembers,
      ...this.twoPotOverrides(),
    };
  });
  readonly twoPotIsExample = computed(() => Object.keys(this.twoPotOverrides()).length === 0);
  /** Null only without tax data. */
  readonly twoPotEstimate = computed<TwoPotEstimate | null>(() => {
    const tables = this.estimator.tables();
    const rules = this.twoPotRules();
    return tables && rules ? estimateTwoPot(this.twoPotInputs(), tables, rules) : null;
  });

  updateTwoPot(patch: Partial<TwoPotInputs>): void {
    const before = this.twoPotInputs();
    const after = sanitiseTwoPot(patch, before);
    this.twoPotOverrides.update((all) => overridesAfter(all, patch, before, after));
  }

  resetTwoPot(): void {
    this.twoPotOverrides.set({});
  }

  // TFSA against a taxable account ------------------------------------------------------------

  private readonly investmentOverrides = signal<Partial<InvestmentInputs>>({});

  readonly investmentInputs = computed<InvestmentInputs>(() => {
    const { marginalRatePercent, age } = this.pay();
    return {
      ...investmentDefaults(this.rates.assumptions()),
      marginalRatePercent,
      age,
      ...this.investmentOverrides(),
    };
  });
  readonly investmentIsExample = computed(
    () => Object.keys(this.investmentOverrides()).length === 0,
  );
  /** Null only without tax data. */
  readonly investmentEstimate = computed<InvestmentEstimate | null>(() => {
    const rules = this.investmentRules();
    return rules
      ? estimateInvestment(this.investmentInputs(), rules, !this.ratesUnavailable())
      : null;
  });

  updateInvestment(patch: Partial<InvestmentInputs>): void {
    const before = this.investmentInputs();
    const after = sanitiseInvestment(patch, before);
    this.investmentOverrides.update((all) => overridesAfter(all, patch, before, after));
  }

  resetInvestment(): void {
    this.investmentOverrides.set({});
  }
}
