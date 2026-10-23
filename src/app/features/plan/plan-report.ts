import { ReportModel, ReportSection, text } from '../../core/pdf/report-model';

/** One answered question, as the summary lists it (`AnswerRow`). */
export interface PlanReportAnswer {
  readonly label: string;
  readonly value: string;
}

/** One step of the plan, as the summary builds it (`StepCard`). Values are already formatted. */
export interface PlanReportCard {
  readonly index: number;
  readonly step: {
    readonly title: string;
    readonly why: string;
    readonly key: { readonly label: string };
    readonly notes: readonly string[];
  };
  readonly keyValue: string;
  readonly details: readonly { readonly label: string; readonly value: string }[];
}

export interface PlanReportNote {
  readonly text: string;
}

/**
 * Formats the plan the summary already shows. The step figures were formatted by the plan
 * (`formatPlanFigure`), so they are passed through as text.
 */
export function buildPlanReport(
  recap: string,
  answers: readonly PlanReportAnswer[],
  cards: readonly PlanReportCard[],
  assumptions: readonly PlanReportNote[],
): ReportModel {
  const steps = cards.map<ReportSection>((card) => ({
    heading: `${card.index}. ${card.step.title}`,
    rows: [
      {
        label: card.step.key.label,
        value: text(card.keyValue),
        emphasis: true,
      },
      ...card.details.map((detail) => ({ label: detail.label, value: text(detail.value) })),
    ],
    paragraphs: [card.step.why, ...card.step.notes],
  }));
  return {
    id: 'plan',
    title: 'Your plan',
    subtitle: recap,
    inputs: [
      {
        heading: 'Your answers',
        rows: answers.map((answer) => ({ label: answer.label, value: text(answer.value) })),
      },
    ],
    results: steps,
    charts: [],
    warnings: [],
    notes: assumptions.map((note) => note.text),
  };
}
