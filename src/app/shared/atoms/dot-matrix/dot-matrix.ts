import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  input,
} from '@angular/core';

import { clampNonNegative } from '../../charts/chart-geometry';
import { formatRand } from '../../format/format-rand';

export interface DotColumn {
  readonly label: string;
  readonly value: number;
}

interface Dot {
  readonly cx: number;
  readonly cy: number;
  readonly on: boolean;
}

interface DotColumnView {
  readonly label: string;
  readonly valueText: string;
  readonly index: number;
  readonly highlighted: boolean;
  readonly dimmed: boolean;
  readonly dots: readonly Dot[];
}

const DEFAULT_ROWS = 8;
const MAX_ROWS = 20;
// Distance between dot centres in viewBox units, and dot radius.
const STEP = 10;
const RADIUS = 3.5;

/**
 * Dot-matrix bar chart: one column of dots per value, filled from the bottom.
 *
 * Negative, NaN and infinite values are clamped to 0. A positive value always
 * shows at least one dot and never more than `rows`. `rows` is rounded and
 * kept between 1 and 20. All-zero or empty data leaves every dot off and reads
 * "<label>: no data". Dots use currentColor so the chart inherits the text
 * colour of the card it sits on; the highlight is also written in the label and
 * table, never colour alone.
 */
@Component({
  selector: 'rw-dot-matrix',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-dot-matrix' },
  template: `
    <svg
      class="rw-dot-matrix__svg"
      [attr.viewBox]="viewBox()"
      role="img"
      [attr.aria-label]="ariaLabel()"
    >
      @for (column of view(); track $index) {
        <g
          class="rw-dot-matrix__column"
          [class.rw-dot-matrix__column--dim]="column.dimmed"
          [class.rw-dot-matrix__column--highlight]="column.highlighted"
          [style.--rw-dot-column]="column.index"
        >
          @for (dot of column.dots; track $index) {
            <circle
              class="rw-dot-matrix__dot"
              [class.rw-dot-matrix__dot--on]="dot.on"
              [class.rw-dot-matrix__dot--off]="!dot.on"
              [attr.cx]="dot.cx"
              [attr.cy]="dot.cy"
              [attr.r]="radius"
            />
          }
        </g>
      }
    </svg>
    <div class="rw-visually-hidden">
      <table>
        <caption>
          {{ label() }}
        </caption>
        <thead>
          <tr>
            <th scope="col">Column</th>
            <th scope="col">Value</th>
            <th scope="col">Highlighted</th>
          </tr>
        </thead>
        <tbody>
          @for (column of view(); track $index) {
            <tr>
              <th scope="row">{{ column.label }}</th>
              <td>{{ column.valueText }}</td>
              <td>{{ column.highlighted ? 'Yes' : 'No' }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class DotMatrix {
  readonly label = input.required<string>();
  readonly columns = input.required<readonly DotColumn[]>();
  /** Dots per column; rounded and clamped to 1-20. */
  readonly rows = input(DEFAULT_ROWS);
  /** Value that fills a whole column; null uses the largest value. */
  readonly max = input<number | null>(null);
  /** Index of the column to emphasise; an index outside the data is ignored. */
  readonly highlight = input<number | null>(null);
  readonly format = input<(amount: number) => string>(formatRand);

  protected readonly radius = RADIUS;

  private readonly rowCount = computed(() => {
    const rows = Math.round(this.rows());
    return Number.isFinite(rows) ? Math.min(MAX_ROWS, Math.max(1, rows)) : DEFAULT_ROWS;
  });

  private readonly highlightIndex = computed(() => {
    const index = this.highlight();
    return index !== null && Number.isInteger(index) && index >= 0 && index < this.columns().length
      ? index
      : null;
  });

  private readonly values = computed(() => this.columns().map((c) => clampNonNegative(c.value)));

  private readonly hasData = computed(() => this.values().some((v) => v > 0));

  protected readonly viewBox = computed(
    () => `0 0 ${Math.max(1, this.columns().length) * STEP} ${this.rowCount() * STEP}`,
  );

  protected readonly view = computed<readonly DotColumnView[]>(() => {
    const rows = this.rowCount();
    const values = this.values();
    const format = this.format();
    const highlight = this.highlightIndex();
    const requested = this.max();
    const fullScale =
      requested !== null && Number.isFinite(requested) && requested > 0
        ? requested
        : Math.max(0, ...values);

    return this.columns().map((column, index) => {
      const value = values[index];
      // At least one dot for any positive value so small amounts stay visible.
      const filled =
        value > 0 && fullScale > 0
          ? Math.min(rows, Math.max(1, Math.round((value / fullScale) * rows)))
          : 0;
      const dots: Dot[] = Array.from({ length: rows }, (_, row) => ({
        cx: index * STEP + STEP / 2,
        // Row 0 is the bottom dot; SVG y grows downwards.
        cy: (rows - 1 - row) * STEP + STEP / 2,
        on: row < filled,
      }));
      return {
        label: column.label,
        valueText: format(value),
        index,
        highlighted: highlight === index,
        dimmed: highlight !== null && highlight !== index,
        dots,
      };
    });
  });

  protected readonly ariaLabel = computed(() => {
    if (!this.hasData()) return `${this.label()}: no data`;
    const parts = this.view().map((c) => `${c.label} ${c.valueText}`).join(', ');
    const index = this.highlightIndex();
    const highlighted = index === null ? '' : `; highlighted: ${this.columns()[index].label}`;
    return `${this.label()}: ${parts}${highlighted}`;
  });
}
