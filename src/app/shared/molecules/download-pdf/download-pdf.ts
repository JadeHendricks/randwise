import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  ViewEncapsulation,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

import { PdfExportService } from '../../../core/pdf/pdf-export.service';
import { ReportModel } from '../../../core/pdf/report-model';
import { Button } from '../../atoms/button/button';
import { Icon } from '../../atoms/icon/icon';

const UNEXPECTED = 'Could not create the PDF. Try again.';

/**
 * "Download PDF" button for a result area. It loads the PDF libraries on the first click, shows
 * a busy state while the file is made, and shows an inline error if that fails.
 *
 * `report` is null while the page has no result, which keeps the button disabled.
 */
@Component({
  selector: 'rw-download-pdf',
  imports: [Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-download-pdf' },
  template: `
    <button
      #button
      type="button"
      rw-button
      variant="secondary"
      size="sm"
      class="rw-download-pdf__button"
      [disabled]="busy() || report() === null"
      [attr.aria-busy]="busy()"
      (click)="download()"
    >
      <rw-icon name="download" size="sm" />
      @if (busy()) {
        <span class="rw-download-pdf__spinner" aria-hidden="true"></span>
        Preparing PDF
      } @else {
        {{ label() }}
      }
    </button>
    <span class="rw-visually-hidden" role="status">{{ status() }}</span>
    @if (error(); as message) {
      <p class="rw-download-pdf__error" role="alert">{{ message }}</p>
    }
  `,
})
export class DownloadPdf {
  readonly report = input.required<ReportModel | null>();
  readonly label = input('Download PDF');

  private readonly exporter = inject(PdfExportService);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly button = viewChild.required<ElementRef<HTMLButtonElement>>('button');

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly status = signal('');

  protected async download(): Promise<void> {
    const report = this.report();
    if (this.busy() || report === null) return;

    // A button that becomes disabled loses focus in browsers, so put it back afterwards.
    const hadFocus = this.host.nativeElement.contains(this.document.activeElement);
    this.error.set(null);
    this.busy.set(true);
    this.status.set('Preparing your PDF');

    try {
      const result = await this.exporter.download(report);
      if (result.ok) {
        this.status.set('PDF downloaded');
      } else {
        this.status.set('');
        this.error.set(result.message);
      }
    } catch {
      this.status.set('');
      this.error.set(UNEXPECTED);
    } finally {
      this.busy.set(false);
      if (hadFocus) {
        afterNextRender(() => this.button().nativeElement.focus(), { injector: this.injector });
      }
    }
  }
}
