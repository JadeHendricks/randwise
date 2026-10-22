import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  input,
} from '@angular/core';

import { niceCeil, scale } from '../../charts/chart-geometry';
import { formatRand } from '../../format/format-rand';

export interface LinePoint {
  readonly x: number;
  readonly y: number;
}

export interface LineSeries {
  readonly name: string;
  readonly points: readonly LinePoint[];
}

export interface LineMarker {
  readonly x: number;
  readonly y: number;
  readonly label: string;
}

interface Tick {
  /** Text shown on the axis. */
  readonly text: string;
}

interface LegendItem {
  readonly name: string;
  /** Solid swatch for the first series, dashed for the second. */
  readonly kind: 'primary' | 'secondary';
}

interface SeriesTable {
  readonly name: string;
  readonly rows: readonly { readonly x: string; readonly y: string }[];
}

// viewBox geometry. The plot is inset by a hair so strokes on the edges are not clipped.
const WIDTH = 600;
const HEIGHT = 260;
const INSET_X = 2;
const INSET_Y = 2;
const TICKS = 5;

/**
 * Line chart with an optional area fill and a second dashed reference series.
 *
 * Points with a non-finite x or y are dropped and the rest are sorted by x.
 * Negative y values are supported: the y domain runs from min(0, lowest y) to
 * a "nice" ceiling above the highest y and a zero line is drawn. Fewer than two
 * plottable points in the first series shows a "No data" state.
 *
 * Axis tick labels and titles are HTML rather than SVG text so they keep a
 * readable size when the chart shrinks on a phone. The svg label summarises
 * the data and a visually hidden table per series holds the exact numbers.
 * A visible (aria-hidden) legend names each drawn series, so the dashed line
 * is never unexplained for sighted users.
 */
@Component({
  selector: 'rw-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-line-chart' },
  template: `
    @if (yLabel()) {
      <p class="rw-line-chart__title rw-line-chart__title--y" aria-hidden="true">{{ yLabel() }}</p>
    }
    <div class="rw-line-chart__plot">
      @if (view().empty) {
        <div class="rw-line-chart__empty" role="img" [attr.aria-label]="ariaLabel()">No data</div>
      } @else {
        <div class="rw-line-chart__y-axis" aria-hidden="true">
          @for (tick of view().yTicks; track $index) {
            <span class="rw-line-chart__tick">{{ tick.text }}</span>
          }
        </div>
        <svg
          class="rw-line-chart__svg"
          viewBox="0 0 600 260"
          role="img"
          [attr.aria-label]="ariaLabel()"
        >
          @for (y of view().gridYs; track $index) {
            <line class="rw-line-chart__grid" x1="0" x2="600" [attr.y1]="y" [attr.y2]="y" />
          }
          @if (view().zeroY !== null) {
            <line
              class="rw-line-chart__zero"
              x1="0"
              x2="600"
              [attr.y1]="view().zeroY"
              [attr.y2]="view().zeroY"
            />
          }
          @if (area() && view().areaPath) {
            <path class="rw-line-chart__area" [attr.d]="view().areaPath" />
          }
          @if (view().secondPath) {
            <path
              class="rw-line-chart__line rw-line-chart__line--secondary"
              [attr.d]="view().secondPath"
            />
          }
          <path class="rw-line-chart__line rw-line-chart__line--primary" [attr.d]="view().path" />
          @if (view().marker; as m) {
            <line
              class="rw-line-chart__guide"
              [attr.x1]="m.x"
              [attr.x2]="m.x"
              y1="0"
              y2="260"
            />
            <circle class="rw-line-chart__marker" [attr.cx]="m.x" [attr.cy]="m.y" r="5" />
          }
        </svg>
        <div class="rw-line-chart__x-axis" aria-hidden="true">
          @for (tick of view().xTicks; track $index) {
            <span class="rw-line-chart__tick">{{ tick.text }}</span>
          }
        </div>
      }
    </div>
    @if (xLabel() && !view().empty) {
      <p class="rw-line-chart__title rw-line-chart__title--x" aria-hidden="true">{{ xLabel() }}</p>
    }
    @if (view().legend.length > 0) {
      <ul class="rw-line-chart__legend" aria-hidden="true">
        @for (item of view().legend; track $index) {
          <li class="rw-line-chart__item">
            <span class="rw-line-chart__swatch rw-line-chart__swatch--{{ item.kind }}"></span>
            <span class="rw-line-chart__name">{{ item.name }}</span>
          </li>
        }
      </ul>
    }
    @if (view().marker; as m) {
      <p class="rw-line-chart__note" aria-hidden="true">{{ m.label }}</p>
    }
    <div class="rw-visually-hidden">
      @for (table of view().tables; track $index) {
        <table>
          <caption>
            {{ table.name }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ xLabel() || 'X' }}</th>
              <th scope="col">{{ yLabel() || 'Y' }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of table.rows; track $index) {
              <tr>
                <td>{{ row.x }}</td>
                <td>{{ row.y }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
      @if (view().marker; as m) {
        <p>{{ m.label }}</p>
      }
    </div>
  `,
})
export class LineChart {
  readonly label = input.required<string>();
  readonly series = input.required<LineSeries>();
  /** Drawn dashed in the muted tone, e.g. a "gross" reference line. */
  readonly secondSeries = input<LineSeries | null>(null);
  readonly xLabel = input('');
  readonly yLabel = input('');
  /** A highlighted point; hidden when its x is outside the plotted x range. */
  readonly marker = input<LineMarker | null>(null);
  readonly formatX = input<(x: number) => string>(formatRand);
  readonly formatY = input<(y: number) => string>(formatRand);
  /**
   * Axis tick text only (defaults to formatX / formatY). Lets a narrow chart use short labels
   * such as "R 50K" while the aria-label and hidden tables keep the exact formatted numbers.
   */
  readonly formatXTick = input<((x: number) => string) | null>(null);
  readonly formatYTick = input<((y: number) => string) | null>(null);
  /** Fill under the first series. */
  readonly area = input(true);

  protected readonly view = computed(() => {
    const first = cleanPoints(this.series().points);
    const secondInput = this.secondSeries();
    const second = secondInput ? cleanPoints(secondInput.points) : [];
    const formatX = this.formatX();
    const formatY = this.formatY();

    const tables: SeriesTable[] = [];
    if (first.length > 0) tables.push(toTable(this.series().name, first, formatX, formatY));
    if (secondInput && second.length > 0) {
      tables.push(toTable(secondInput.name, second, formatX, formatY));
    }

    const empty = first.length < 2;
    if (empty) {
      return {
        empty,
        tables,
        yTicks: [] as Tick[],
        xTicks: [] as Tick[],
        gridYs: [] as number[],
        zeroY: null as number | null,
        path: '',
        areaPath: '',
        secondPath: '',
        marker: null as { x: number; y: number; label: string } | null,
        summary: '',
        legend: [] as LegendItem[],
      };
    }

    const all = [...first, ...second];
    const xMin = Math.min(...all.map((p) => p.x));
    const xMax = Math.max(...all.map((p) => p.x));
    // Include 0 so the baseline is always on the chart and negatives extend below it.
    const yMin = Math.min(0, ...all.map((p) => p.y));
    const yMax = niceCeil(Math.max(0, ...all.map((p) => p.y)));

    const px = (x: number) => scale(x, xMin, xMax, INSET_X, WIDTH - INSET_X);
    // SVG y grows downwards, so the output range is flipped.
    const py = (y: number) => scale(y, yMin, yMax, HEIGHT - INSET_Y, INSET_Y);
    const toPath = (points: readonly LinePoint[]) =>
      points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.x).toFixed(2)} ${py(p.y).toFixed(2)}`).join(' ');

    const path = toPath(first);
    const baseline = py(0).toFixed(2);
    const areaPath = `${path} L${px(first[first.length - 1].x).toFixed(2)} ${baseline} L${px(first[0].x).toFixed(2)} ${baseline} Z`;

    const steps = Array.from({ length: TICKS }, (_, i) => i / (TICKS - 1));
    const tickX = this.formatXTick() ?? formatX;
    const tickY = this.formatYTick() ?? formatY;
    const yTicks = steps.map((t) => ({ text: tickY(yMin + t * (yMax - yMin)) })).reverse();
    const xTicks = steps.map((t) => ({ text: tickX(xMin + t * (xMax - xMin)) }));
    const gridYs = steps.map((t) => py(yMin + t * (yMax - yMin)));

    const m = this.marker();
    const showMarker = m !== null && Number.isFinite(m.x) && Number.isFinite(m.y) && m.x >= xMin && m.x <= xMax;

    const a = first[0];
    const b = first[first.length - 1];
    const peak = Math.max(...first.map((p) => p.y));
    let summary =
      `${this.series().name} runs from ${formatY(a.y)} at ${formatX(a.x)} ` +
      `to ${formatY(b.y)} at ${formatX(b.x)}, peaking at ${formatY(peak)}.`;
    if (secondInput && second.length > 0) summary += ` Also shows ${secondInput.name}.`;
    if (showMarker) summary += ` ${m.label}`;

    return {
      empty,
      tables,
      yTicks,
      xTicks,
      gridYs,
      zeroY: yMin < 0 ? py(0) : null,
      path,
      areaPath,
      secondPath: second.length >= 2 ? toPath(second) : '',
      marker: showMarker ? { x: px(m.x), y: Math.min(HEIGHT, Math.max(0, py(m.y))), label: m.label } : null,
      summary,
      // Only a second series that is actually drawn gets a legend entry.
      legend: [
        { name: this.series().name, kind: 'primary' },
        ...(secondInput && second.length >= 2 ? [{ name: secondInput.name, kind: 'secondary' }] : []),
      ] as LegendItem[],
    };
  });

  protected readonly ariaLabel = computed(() => {
    const view = this.view();
    return view.empty ? `${this.label()}: no data` : `${this.label()}: ${view.summary}`;
  });
}

// Non-finite points would produce NaN path commands, so they are dropped.
function cleanPoints(points: readonly LinePoint[]): LinePoint[] {
  return points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.x - b.x);
}

function toTable(
  name: string,
  points: readonly LinePoint[],
  formatX: (x: number) => string,
  formatY: (y: number) => string,
): SeriesTable {
  return { name, rows: points.map((p) => ({ x: formatX(p.x), y: formatY(p.y) })) };
}
