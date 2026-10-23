/**
 * Reads what a chart atom shows on the page (its svg plus the HTML parts around it: axis
 * ticks, legend, centre text) so the PDF can draw the same chart without recomputing any data.
 */

export type ChartKind = 'bar' | 'line' | 'ring';

export interface LegendEntry {
  readonly label: string;
  /** Colour name such as `accent`; absent for line series. */
  readonly tone?: string;
  readonly value?: string;
  readonly percent?: string;
  /** True for the dashed second line series. */
  readonly dashed?: boolean;
}

export interface CapturedChart {
  readonly kind: ChartKind;
  readonly svg: SVGSVGElement;
  readonly legend: readonly LegendEntry[];
  readonly xTicks: readonly string[];
  readonly yTicks: readonly string[];
  readonly xLabel: string;
  readonly yLabel: string;
  /** The marker caption under a line chart. */
  readonly note: string;
  /** Ring centre text. */
  readonly centre: string;
  /** Ring caption. */
  readonly caption: string;
}

const clean = (el: Element | null | undefined): string =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

const texts = (host: Element, selector: string): string[] =>
  Array.from(host.querySelectorAll(selector), clean);

function toneOf(swatch: Element | null, prefix: string): string | undefined {
  if (swatch === null) return undefined;
  for (const token of Array.from(swatch.classList)) {
    if (token.startsWith(prefix)) return token.slice(prefix.length);
  }
  return undefined;
}

function kindOf(host: Element): ChartKind | null {
  if (host.classList.contains('rw-line-chart')) return 'line';
  if (host.classList.contains('rw-breakdown-bar')) return 'bar';
  if (host.classList.contains('rw-ring-gauge')) return 'ring';
  return null;
}

/**
 * The chart's svg and surrounding text, or null when the host is not a known chart or has no
 * svg (the line chart's "No data" state renders a div, not an svg).
 */
export function captureChart(host: Element): CapturedChart | null {
  const kind = kindOf(host);
  const svg = host.querySelector('svg.rw-line-chart__svg, svg.rw-breakdown-bar__svg, svg.rw-ring-gauge__svg');
  if (kind === null || !(svg instanceof SVGSVGElement)) return null;

  const empty: CapturedChart = {
    kind,
    svg,
    legend: [],
    xTicks: [],
    yTicks: [],
    xLabel: '',
    yLabel: '',
    note: '',
    centre: '',
    caption: '',
  };

  switch (kind) {
    case 'bar':
      return {
        ...empty,
        legend: Array.from(host.querySelectorAll('.rw-breakdown-bar__item'), (item) => ({
          label: clean(item.querySelector('.rw-breakdown-bar__name')),
          tone: toneOf(item.querySelector('.rw-breakdown-bar__swatch'), 'rw-breakdown-bar__swatch--'),
          value: clean(item.querySelector('.rw-breakdown-bar__value')),
          percent: clean(item.querySelector('.rw-breakdown-bar__percent')),
        })),
      };
    case 'line':
      return {
        ...empty,
        legend: Array.from(host.querySelectorAll('.rw-line-chart__item'), (item) => ({
          label: clean(item.querySelector('.rw-line-chart__name')),
          dashed: item.querySelector('.rw-line-chart__swatch--secondary') !== null,
        })),
        yTicks: texts(host, '.rw-line-chart__y-axis .rw-line-chart__tick'),
        xTicks: texts(host, '.rw-line-chart__x-axis .rw-line-chart__tick'),
        xLabel: clean(host.querySelector('.rw-line-chart__title--x')),
        yLabel: clean(host.querySelector('.rw-line-chart__title--y')),
        note: clean(host.querySelector('.rw-line-chart__note')),
      };
    case 'ring':
      return {
        ...empty,
        centre: clean(host.querySelector('.rw-ring-gauge__centre')),
        caption: clean(host.querySelector('.rw-ring-gauge__caption')),
      };
  }
}
