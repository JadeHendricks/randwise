import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewEncapsulation,
  computed,
  inject,
  signal,
  viewChildren,
} from '@angular/core';

import { formatLongDate } from '../../../core/data/format-date';
import { RatesService } from '../../../core/data/rates.service';
import { taxYearLabel } from '../../../core/data/tax-calendar';
import { TaxYearService } from '../../../core/data/tax-year.service';
import { Icon, IconName } from '../../atoms/icon/icon';

type NoticeKind = 'validation' | 'draft' | 'stale';

interface Notice {
  readonly kind: NoticeKind;
  readonly tone: 'danger' | 'warning';
  /** Problems interrupt (alert); draft and stale are calm updates (status). */
  readonly role: 'alert' | 'status';
  readonly icon: IconName;
  readonly title: string;
  readonly body: string;
  readonly lines: readonly string[];
  /** Used in the dismiss button's accessible name. */
  readonly name: string;
}

/** Keeps the alert short so a badly broken file cannot push the page content off screen. */
const MAX_ERRORS = 5;

/**
 * Notices under the header about the tax data: validation problems, draft data and an
 * out-of-date tax year. Dismissals live in memory only, so a reload shows them again.
 */
@Component({
  selector: 'rw-data-banner',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-data-banner' },
  template: `
    @for (notice of notices(); track notice.kind) {
      <div
        class="rw-data-banner__notice"
        [class.rw-data-banner__notice--danger]="notice.tone === 'danger'"
        [class.rw-data-banner__notice--warning]="notice.tone === 'warning'"
        [attr.role]="notice.role"
      >
        <rw-icon class="rw-data-banner__icon" [name]="notice.icon" />
        <div class="rw-data-banner__content">
          <p class="rw-data-banner__title">{{ notice.title }}</p>
          <p class="rw-data-banner__text">{{ notice.body }}</p>
          @if (notice.lines.length > 0) {
            <ul class="rw-data-banner__list">
              @for (line of notice.lines; track $index) {
                <li class="rw-data-banner__item">{{ line }}</li>
              }
            </ul>
          }
        </div>
        <button
          #dismissButton
          type="button"
          class="rw-data-banner__dismiss"
          [attr.aria-label]="'Dismiss ' + notice.name"
          (click)="dismiss(notice.kind)"
        >
          <rw-icon name="close" size="sm" />
        </button>
      </div>
    }
  `,
})
export class DataBanner {
  private readonly taxYears = inject(TaxYearService);
  private readonly rates = inject(RatesService);
  private readonly dismissButtons = viewChildren<ElementRef<HTMLButtonElement>>('dismissButton');

  // In memory on purpose: the shell is never destroyed, so this lasts for the session.
  private readonly dismissed = signal<ReadonlySet<NoticeKind>>(new Set());

  private readonly all = computed<readonly Notice[]>(() => {
    const notices: Notice[] = [];

    const errors = [...this.taxYears.validationErrors(), ...this.rates.validationErrors()];
    if (errors.length > 0) {
      const lines = errors.slice(0, MAX_ERRORS);
      if (errors.length > MAX_ERRORS) {
        lines.push(`and ${errors.length - MAX_ERRORS} more`);
      }
      notices.push({
        kind: 'validation',
        tone: 'danger',
        role: 'alert',
        icon: 'warning',
        title: 'Some tax data could not be used',
        body: 'These files failed their checks, so their values are left out:',
        lines,
        name: 'data problem notice',
      });
    }

    const data = this.taxYears.taxYear();
    if (data !== null && this.taxYears.isDraft()) {
      const fields = this.taxYears.carriedForwardFields();
      notices.push({
        kind: 'draft',
        tone: 'warning',
        role: 'status',
        icon: 'info',
        title: 'Draft tax data',
        body:
          fields.length > 0
            ? `Tax year ${taxYearLabel(data.taxYear)} has values that could not be confirmed yet and are carried forward from the last official figures: ${fields.join(', ')}.`
            : `Tax year ${taxYearLabel(data.taxYear)} has not been fully confirmed yet, so figures may change.`,
        lines: [],
        name: 'draft data notice',
      });
    }

    if (data !== null && this.taxYears.isStale()) {
      notices.push({
        kind: 'stale',
        tone: 'warning',
        role: 'status',
        icon: 'info',
        title: 'Tax year has ended',
        body: `Tax year ${taxYearLabel(data.taxYear)} ended on ${formatLongDate(data.period.end)}. Figures still use its rules until the next year's data is added.`,
        lines: [],
        name: 'out-of-date data notice',
      });
    }

    return notices;
  });

  protected readonly notices = computed(() => {
    const hidden = this.dismissed();
    return this.all().filter((notice) => !hidden.has(notice.kind));
  });

  protected dismiss(kind: NoticeKind): void {
    const shown = this.notices();
    const index = shown.findIndex((notice) => notice.kind === kind);
    // The next notice's button stays in the DOM, so it can take focus right away.
    const next = this.dismissButtons()[index + 1]?.nativeElement;
    this.dismissed.update((set) => new Set(set).add(kind));
    if (next) {
      next.focus();
    } else {
      document.getElementById('main-content')?.focus();
    }
  }
}
