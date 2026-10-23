import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  input,
} from '@angular/core';

import { ChartTone } from '../../charts/chart-tone';
import { clampNonNegative, shares } from '../../charts/chart-geometry';
import { formatPercent, formatRand } from '../../format/format-rand';

export interface BreakdownSegment {
  readonly label: string;
  readonly value: number;
  readonly tone: ChartTone;
}

interface BarRow {
  readonly label: string;
  readonly tone: ChartTone;
  readonly valueText: string;
  readonly percentText: string;
  /** Left edge and width in viewBox units (0-100). */
  readonly x: number;
  readonly width: number;
}

/**
 * Stacked horizontal bar showing how a total splits into parts.
 *
 * Negative, NaN and infinite segment values are clamped to 0 (shown as R0 in
 * the text alternative). An empty list or a zero total draws an empty track
 * and reads "<label>: no data". The visible legend is aria-hidden; the
 * visually hidden table is the screen reader version with exact numbers.
 */
@Component({
  selector: 'rw-breakdown-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-breakdown-bar' },
  template: `
    <svg
      class="rw-breakdown-bar__svg"
      viewBox="0 0 100 10"
      preserveAspectRatio="none"
      role="img"
      [attr.aria-label]="ariaLabel()"
    >
      <rect class="rw-breakdown-bar__track" x="0" y="0" width="100" height="10" />
      @for (row of drawn(); track $index) {
        <rect
          class="rw-breakdown-bar__segment rw-breakdown-bar__segment--{{ row.tone }}"
          [attr.x]="row.x"
          y="0"
          [attr.width]="row.width"
          height="10"
        />
      }
    </svg>
    @if (showLegend() && rows().length > 0) {
      <ul class="rw-breakdown-bar__legend" aria-hidden="true">
        @for (row of rows(); track $index) {
          <li class="rw-breakdown-bar__item">
            <span class="rw-breakdown-bar__swatch rw-breakdown-bar__swatch--{{ row.tone }}"></span>
            <span class="rw-breakdown-bar__name">{{ row.label }}</span>
            <span class="rw-breakdown-bar__value">{{ row.valueText }}</span>
            <span class="rw-breakdown-bar__percent">{{ row.percentText }}</span>
          </li>
        }
      </ul>
    }
    <div class="rw-visually-hidden">
      <table>
        <caption>
          {{ label() }}
        </caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Amount</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track $index) {
            <tr>
              <th scope="row">{{ row.label }}</th>
              <td>{{ row.valueText }}</td>
              <td>{{ row.percentText }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class BreakdownBar {
  /** What the bar shows, e.g. "Where your gross pay goes". */
  readonly label = input.required<string>();
  readonly segments = input.required<readonly BreakdownSegment[]>();
  readonly format = input<(amount: number) => string>(formatRand);
  readonly showLegend = input(true);

  // One row per input segment (zero rows included) so the text alternative
  // lists every part; only non-zero rows are drawn.
  protected readonly rows = computed<readonly BarRow[]>(() => {
    const segments = this.segments();
    const values = segments.map((s) => clampNonNegative(s.value));
    const fractions = shares(values);
    const format = this.format();
    let cursor = 0;
    return segments.map((segment, i) => {
      const width = fractions[i] * 100;
      const row: BarRow = {
        label: segment.label,
        tone: segment.tone,
        valueText: format(values[i]),
        percentText: formatPercent(fractions[i], 0),
        x: cursor,
        width,
      };
      cursor += width;
      return row;
    });
  });

  protected readonly drawn = computed(() => this.rows().filter((row) => row.width > 0));

  protected readonly ariaLabel = computed(() => {
    if (this.drawn().length === 0) return `${this.label()}: no data`;
    const parts = this.rows().map((r) => `${r.label} ${r.valueText} (${r.percentText})`);
    return `${this.label()}: ${parts.join(', ')}`;
  });
}
