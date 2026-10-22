import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  input,
} from '@angular/core';

import { ChartTone } from '../../charts/chart-tone';
import { formatPercent } from '../../format/format-rand';

/**
 * Circular progress gauge for a percentage.
 *
 * `value` is a percent from 0 to 100. NaN, infinite and negative values are
 * clamped to 0 and anything above 100 is capped at 100. The centre text is an
 * HTML overlay (so it stays readable at any size) and is aria-hidden because
 * the svg label and the visually hidden table already say the same thing.
 */
@Component({
  selector: 'rw-ring-gauge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-ring-gauge' },
  template: `
    <div class="rw-ring-gauge__figure">
      <svg
        class="rw-ring-gauge__svg"
        viewBox="0 0 120 120"
        role="img"
        [attr.aria-label]="ariaLabel()"
      >
        <circle class="rw-ring-gauge__track" cx="60" cy="60" r="52" />
        <circle
          class="rw-ring-gauge__value rw-ring-gauge__value--{{ tone() }}"
          cx="60"
          cy="60"
          r="52"
          pathLength="100"
          [attr.stroke-dasharray]="dash()"
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div class="rw-ring-gauge__text" aria-hidden="true">
        <span class="rw-ring-gauge__centre">{{ centre() }}</span>
        @if (caption()) {
          <span class="rw-ring-gauge__caption">{{ caption() }}</span>
        }
      </div>
    </div>
    <div class="rw-visually-hidden">
      <table>
        <caption>
          {{ label() }}
        </caption>
        <tbody>
          <tr>
            <th scope="row">Value</th>
            <td>{{ percentText() }}</td>
          </tr>
          <tr>
            <th scope="row">Centre label</th>
            <td>{{ centre() }}</td>
          </tr>
          @if (caption()) {
            <tr>
              <th scope="row">Caption</th>
              <td>{{ caption() }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class RingGauge {
  readonly label = input.required<string>();
  /** Percent, 0 to 100 (clamped). */
  readonly value = input.required<number>();
  /** Text in the middle; defaults to the whole-number percent. */
  readonly centreLabel = input<string | null>(null);
  readonly caption = input('');
  readonly tone = input<ChartTone>('accent');

  protected readonly clamped = computed(() => {
    const v = this.value();
    return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0;
  });

  protected readonly percentText = computed(() => formatPercent(this.clamped() / 100, 1));
  protected readonly centre = computed(
    () => this.centreLabel() ?? formatPercent(this.clamped() / 100, 0),
  );
  // pathLength="100" on the circle makes the dash length equal the percent.
  protected readonly dash = computed(() => `${this.clamped()} 100`);
  protected readonly ariaLabel = computed(() => `${this.label()}: ${this.percentText()}`);
}
