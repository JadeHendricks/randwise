import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewEncapsulation,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { formatLongDate, formatShortDate } from '../../../core/data/format-date';
import { RATE_KEYS, RateEntry } from '../../../core/data/rates.schema';
import { RatesService } from '../../../core/data/rates.service';
import { taxYearLabel } from '../../../core/data/tax-calendar';
import { TaxYearData, TaxYearStatus } from '../../../core/data/tax-year.schema';
import { TaxYearService } from '../../../core/data/tax-year.service';
import { Icon } from '../../atoms/icon/icon';
import { Chip, ChipTone } from '../../atoms/chip/chip';

interface StatusView {
  readonly label: string;
  readonly tone: ChipTone;
}

interface SourceLink {
  readonly href: string;
  readonly text: string;
}

interface RateRow {
  readonly key: string;
  readonly label: string;
  readonly valuePercent: number;
  readonly asOf: string;
}

const STATUS: Record<TaxYearStatus | 'unavailable', StatusView> = {
  verified: { label: 'Verified', tone: 'success' },
  'verified-auto': { label: 'Verified (auto)', tone: 'success' },
  draft: { label: 'Draft', tone: 'warning' },
  unavailable: { label: 'Unavailable', tone: 'danger' },
};

let nextPanelId = 0;

/** "https://www.sars.gov.za/tax-rates/" -> "sars.gov.za/tax-rates". Falls back to the raw text. */
function sourceText(url: string): string {
  try {
    const { host, pathname } = new URL(url);
    return host.replace(/^www\./, '') + pathname.replace(/\/$/, '');
  } catch {
    return url;
  }
}

/**
 * Header badge that says which tax year and rates the figures use, with a disclosure
 * panel for sources, carried-forward values, rates and default assumptions.
 */
@Component({
  selector: 'rw-data-badge',
  imports: [Chip, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-data-badge', '(keydown.escape)': 'onEscape($event)' },
  template: `
    <button
      #toggle
      type="button"
      class="rw-data-badge__toggle"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="panelId"
      [attr.aria-label]="accessibleName()"
      (click)="open.set(!open())"
    >
      <span class="rw-data-badge__summary">
        @for (part of parts(); track $index) {
          @if ($index > 0) {
            <span class="rw-data-badge__separator" aria-hidden="true">·</span>
          }
          <span class="rw-data-badge__part">{{ part }}</span>
        }
      </span>
      <rw-chip [label]="status().label" [tone]="status().tone" />
      <rw-icon
        class="rw-data-badge__chevron"
        [class.rw-data-badge__chevron--open]="open()"
        name="chevron-down"
        size="sm"
      />
    </button>

    <div class="rw-data-badge__panel" [id]="panelId" [hidden]="!open()">
      <p class="rw-data-badge__status">{{ statusSentence() }}</p>
      @if (taxYear(); as data) {
        <p class="rw-data-badge__text">
          Period: {{ longDate(data.period.start) }} to {{ longDate(data.period.end) }}.
        </p>
      }

      <h2 class="rw-data-badge__heading">Sources</h2>
      @if (sources().length > 0) {
        <ul class="rw-data-badge__list">
          @for (link of sources(); track link.href) {
            <li class="rw-data-badge__item">
              <a
                class="rw-data-badge__link"
                [href]="link.href"
                target="_blank"
                rel="noopener noreferrer"
                >{{ link.text }}</a
              >
            </li>
          }
        </ul>
      } @else {
        <p class="rw-data-badge__text">No tax-year sources are available.</p>
      }

      @if (taxYear()) {
        <h2 class="rw-data-badge__heading">Carried forward</h2>
        @if (carriedForward().length > 0) {
          <ul class="rw-data-badge__list">
            @for (field of carriedForward(); track field) {
              <li class="rw-data-badge__item">{{ field }}</li>
            }
          </ul>
        } @else {
          <p class="rw-data-badge__text">None, every value was confirmed for this tax year.</p>
        }
      }

      <h2 class="rw-data-badge__heading">Rates</h2>
      @if (rateRows().length > 0) {
        <ul class="rw-data-badge__list">
          @for (row of rateRows(); track row.key) {
            <li class="rw-data-badge__item">
              {{ row.label }}: {{ row.valuePercent }}% (as of {{ shortDate(row.asOf) }})
            </li>
          }
        </ul>
      } @else {
        <p class="rw-data-badge__text">Rates are unavailable.</p>
      }

      @if (assumptions(); as list) {
        <h2 class="rw-data-badge__heading">Default assumptions</h2>
        <ul class="rw-data-badge__list">
          @for (item of list; track item.id) {
            <li class="rw-data-badge__item">
              <strong class="rw-data-badge__item-title"
                >{{ item.label }}: {{ item.valuePercent }}%</strong
              >
              <span class="rw-data-badge__item-note">{{ item.description }}</span>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class DataBadge {
  private readonly taxYears = inject(TaxYearService);
  private readonly ratesService = inject(RatesService);
  private readonly toggle = viewChild.required<ElementRef<HTMLButtonElement>>('toggle');

  protected readonly panelId = `rw-data-badge-panel-${nextPanelId++}`;
  protected readonly open = signal(false);

  protected readonly taxYear = this.taxYears.taxYear;
  protected readonly carriedForward = this.taxYears.carriedForwardFields;

  protected readonly status = computed<StatusView>(() => STATUS[this.taxYear()?.status ?? 'unavailable']);

  /** The words shown on the button, split so separators can be hidden from assistive tech. */
  protected readonly parts = computed<readonly string[]>(() => {
    const data = this.taxYear();
    const asOf = this.ratesService.ratesAsOf();
    const rates = asOf ? `rates ${formatShortDate(asOf)}` : 'rates unavailable';
    if (data === null) {
      return ['Tax data unavailable', rates];
    }
    const checked =
      data.status === 'draft'
        ? `draft, checked ${formatShortDate(data.verifiedOn)}`
        : `verified ${formatShortDate(data.verifiedOn)}`;
    return [`Tax year ${taxYearLabel(data.taxYear)}`, checked, rates];
  });

  // Starts with the visible words (WCAG 2.5.3) and adds the status and the action.
  protected readonly accessibleName = computed(
    () =>
      `${this.parts().join(', ')}. Status: ${this.status().label}. ${this.open() ? 'Hide' : 'Show'} data sources`,
  );

  protected readonly statusSentence = computed(() => {
    const data = this.taxYear();
    if (data === null) {
      return 'Tax-year data is unavailable, so tax figures cannot be shown.';
    }
    return this.describeStatus(data);
  });

  protected readonly sources = computed<readonly SourceLink[]>(
    () => this.taxYear()?.sources.map((href) => ({ href, text: sourceText(href) })) ?? [],
  );

  protected readonly rateRows = computed<readonly RateRow[]>(() => {
    const rates = this.ratesService.rates();
    if (rates === null) return [];
    return RATE_KEYS.map((key) => {
      const entry: RateEntry = rates[key];
      return { key, label: entry.label, valuePercent: entry.valuePercent, asOf: entry.asOf };
    });
  });

  protected readonly assumptions = computed(() => {
    const found = this.ratesService.assumptions();
    return found ? [found.inflation, found.cashReturn, found.growthReturn] : null;
  });

  protected shortDate(iso: string): string {
    return formatShortDate(iso);
  }

  protected longDate(iso: string): string {
    return formatLongDate(iso);
  }

  protected onEscape(event: Event): void {
    if (!this.open()) return;
    event.stopPropagation();
    this.open.set(false);
    this.toggle().nativeElement.focus();
  }

  private describeStatus(data: TaxYearData): string {
    const on = formatLongDate(data.verifiedOn);
    switch (data.status) {
      case 'verified':
        return `Verified: every value was confirmed against official sources on ${on}.`;
      case 'verified-auto':
        return `Verified automatically: every value was checked against official sources on ${on}.`;
      case 'draft':
        return `Draft: some values could not be confirmed for this tax year (last checked ${on}), so figures may change.`;
    }
  }
}
