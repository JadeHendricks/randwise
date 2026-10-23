import { formatPercent, formatRand, formatRandWhole } from '../../shared/format/format-rand';

/** Which report this is. Doubles as the file name slug. */
export type ReportId =
  | 'pay'
  | 'ra'
  | 'retire-at-55'
  | 'budget'
  | 'journey'
  | 'plan'
  | 'emergency-fund'
  | 'home-loan'
  | 'two-pot-withdrawal'
  | 'tfsa-vs-taxable';

/** A value already produced by an engine or page, to be formatted en-ZA by the PDF layer. */
export type ReportValue =
  | {
      readonly kind: 'rand';
      readonly amount: number;
      readonly suffix?: string;
      readonly whole?: boolean;
    }
  /** `fraction` is 0.16 for 16%. */
  | { readonly kind: 'percent'; readonly fraction: number; readonly digits?: number }
  | { readonly kind: 'text'; readonly text: string };

export interface ReportRow {
  readonly label: string;
  readonly value: ReportValue;
  /** Bold and slightly larger: the headline number. */
  readonly emphasis?: boolean;
  /** Small muted line under the label. */
  readonly detail?: string;
}

export interface ReportSection {
  readonly heading?: string;
  readonly rows: readonly ReportRow[];
  readonly paragraphs?: readonly string[];
}

export interface ReportChartRef {
  /** Matches the `data-pdf-chart` attribute on the chart in the page. */
  readonly id: string;
  readonly title: string;
}

/** Plain data a page hands to the PDF export. No DOM, no Angular, no engine calls. */
export interface ReportModel {
  readonly id: ReportId;
  readonly title: string;
  /** One line, e.g. "Based on a R 30 000,00 gross salary a month". */
  readonly subtitle: string;
  readonly inputs: readonly ReportSection[];
  readonly results: readonly ReportSection[];
  readonly charts: readonly ReportChartRef[];
  readonly warnings: readonly string[];
  /** Simplifications and assumptions the page already states on screen. */
  readonly notes: readonly string[];
}

export function rand(amount: number, suffix?: string): ReportValue {
  return suffix === undefined ? { kind: 'rand', amount } : { kind: 'rand', amount, suffix };
}

export function randWhole(amount: number, suffix?: string): ReportValue {
  return suffix === undefined
    ? { kind: 'rand', amount, whole: true }
    : { kind: 'rand', amount, whole: true, suffix };
}

/** `fraction` is 0.16 for 16%. */
export function percent(fraction: number, digits?: number): ReportValue {
  return digits === undefined ? { kind: 'percent', fraction } : { kind: 'percent', fraction, digits };
}

/** Percentage points as the pages store them (7 means 7%), converted the way the pages do. */
export function percentPoints(points: number, digits?: number): ReportValue {
  return percent(points / 100, digits);
}

export function text(value: string): ReportValue {
  return { kind: 'text', text: value };
}

/** The en-ZA text for a value, e.g. `R 25 141,88`, `R 25 141,88 a month` or `16,5%`. */
export function formatReportValue(value: ReportValue): string {
  switch (value.kind) {
    case 'rand': {
      const formatted = value.whole ? formatRandWhole(value.amount) : formatRand(value.amount);
      return value.suffix ? `${formatted} ${value.suffix}` : formatted;
    }
    case 'percent':
      return formatPercent(value.fraction, value.digits ?? 1);
    case 'text':
      return value.text;
  }
}
