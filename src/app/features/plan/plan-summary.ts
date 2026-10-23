import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';

import type { ReportModel } from '../../core/pdf/report-model';
import type { PlanGoal, PlanQuestionId } from '../../core/plan/plan-answers';
import type { PlanFigure, PlanStep } from '../../core/plan/plan-builder';
import { PlanBuilderStore } from '../../core/plan/plan-builder.store';
import { Button } from '../../shared/atoms/button/button';
import { Card } from '../../shared/atoms/card/card';
import { LiveRegion } from '../../shared/atoms/live-region/live-region';
import { formatRandWhole } from '../../shared/format/format-rand';
import { DownloadPdf } from '../../shared/molecules/download-pdf/download-pdf';
import { PlanStepCard, PlanStepDetail } from '../../shared/molecules/plan-step/plan-step';
import { CALCULATOR_LABELS, answerRows, formatPlanFigure } from './plan-format';
import { buildPlanReport } from './plan-report';

const GOAL_PHRASES: Record<PlanGoal, string> = {
  'retire-early': 'retire early',
  'pay-less-tax': 'pay less tax',
  'build-tfsa': 'build your tax-free savings',
  'emergency-fund': 'build an emergency fund',
  'buy-home': 'plan for a home',
};

interface StepCard {
  readonly id: string;
  readonly index: number;
  readonly step: PlanStep;
  readonly keyValue: string;
  readonly details: readonly PlanStepDetail[];
  readonly actionLabel: string;
}

const detailOf = (figure: PlanFigure): PlanStepDetail => ({
  label: figure.label,
  value: formatPlanFigure(figure),
});

/**
 * The plan: the ordered steps, what they assume, and the answers behind them. Every number comes
 * from the store's steps; this component only formats them and opens a step's calculator.
 */
@Component({
  selector: 'rw-plan-summary',
  imports: [Button, Card, DownloadPdf, LiveRegion, PlanStepCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-summary.html',
  styleUrl: './plan-summary.scss',
})
export class PlanSummary {
  protected readonly plan = inject(PlanBuilderStore);
  private readonly router = inject(Router);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  protected readonly cards = computed<readonly StepCard[]>(() =>
    this.plan.steps().map((step, position) => ({
      id: `rw-plan-step-title-${step.id}`,
      index: position + 1,
      step,
      keyValue: formatPlanFigure(step.key),
      details: step.details.map(detailOf),
      actionLabel: CALCULATOR_LABELS[step.calculator],
    })),
  );

  protected readonly unavailable = computed(() => this.cards().length === 0);
  protected readonly unavailableMessage = computed(() =>
    this.plan.rules() === null
      ? 'Tax data is unavailable, so your plan cannot be worked out.'
      : 'We could not work out a plan from those answers. Check your income and try again.',
  );

  protected readonly recap = computed(() => {
    const { goal } = this.plan.answers();
    const basics = this.plan.basics();
    if (!goal || !basics || this.unavailable()) return '';
    return `You earn about ${formatRandWhole(basics.grossMonthly)} a month before tax and want to ${GOAL_PHRASES[goal]}. These are your steps, in order.`;
  });

  protected readonly rows = computed(() => answerRows(this.plan.answers(), this.plan.basics()));
  protected readonly notes = this.plan.assumptionNotes;

  // PDF export: formats the steps and answers this page already shows.
  protected readonly report = computed<ReportModel | null>(() =>
    this.unavailable() ? null : buildPlanReport(this.recap(), this.rows(), this.cards(), this.notes()),
  );

  protected readonly announcement = computed(() =>
    this.unavailable() ? '' : `Your plan is ready: ${this.cards().length} steps.`,
  );

  constructor() {
    // Arriving from the wizard by a user-driven move focuses the heading. Opening the page again
    // later has no request, so focus stays where it was.
    afterNextRender(() => {
      if (this.plan.takeHeadingFocus()) this.heading().nativeElement.focus();
    });
  }

  protected open(step: PlanStep): void {
    const route = this.plan.open(step);
    void this.router.navigateByUrl(route);
  }

  protected change(id: PlanQuestionId): void {
    this.plan.goTo(id);
    this.plan.requestHeadingFocus();
  }

  protected backToQuestions(): void {
    this.plan.back();
    this.plan.requestHeadingFocus();
  }

  protected startAgain(): void {
    this.plan.restart();
    this.plan.requestHeadingFocus();
  }
}
