import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PdfExportResult, PdfExportService } from '../../../core/pdf/pdf-export.service';
import { ReportModel } from '../../../core/pdf/report-model';
import { FakeMatchMedia, installFakeMatchMedia } from '../../../testing/fake-match-media';
import { normaliseSpaces } from '../../../testing/text';
import { DownloadPdf } from './download-pdf';

const REPORT: ReportModel = {
  id: 'pay',
  title: 'Pay',
  subtitle: 'Sub',
  inputs: [],
  results: [],
  charts: [],
  warnings: [],
  notes: [],
};

/** A PdfExportService whose result the test controls. */
class FakeExporter {
  readonly download = vi.fn<(report: ReportModel) => Promise<PdfExportResult>>();
  private resolver: ((result: PdfExportResult) => void) | null = null;

  pending(): void {
    this.download.mockImplementation(
      () =>
        new Promise<PdfExportResult>((resolve) => {
          this.resolver = resolve;
        }),
    );
  }

  /** Resolves the pending export and lets the component react to it. */
  async finish(result: PdfExportResult): Promise<void> {
    this.resolver?.(result);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('DownloadPdf', () => {
  let fake: FakeMatchMedia;
  let exporter: FakeExporter;

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
    exporter = new FakeExporter();
    TestBed.configureTestingModule({
      providers: [{ provide: PdfExportService, useValue: exporter }],
    });
  });
  afterEach(() => fake.uninstall());

  async function render(report: ReportModel | null = REPORT) {
    const fixture: ComponentFixture<DownloadPdf> = TestBed.createComponent(DownloadPdf);
    fixture.componentRef.setInput('report', report);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      root,
      button: () => root.querySelector<HTMLButtonElement>('button') as HTMLButtonElement,
      alert: () => root.querySelector('[role="alert"]'),
      status: () => normaliseSpaces(root.querySelector('[role="status"]')?.textContent),
    };
  }

  it('renders a real, labelled button that is in the tab order', async () => {
    const { button, root } = await render();
    expect(root.classList).toContain('rw-download-pdf');
    expect(button().tagName).toBe('BUTTON');
    expect(button().type).toBe('button');
    expect(normaliseSpaces(button().textContent)).toBe('Download PDF');
    expect(button().getAttribute('tabindex')).toBeNull();
    expect(button().tabIndex).toBe(0);
    expect(button().disabled).toBe(false);
    expect(button().getAttribute('aria-busy')).toBe('false');
    expect(root.querySelector('rw-icon')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('exports the report when clicked', async () => {
    exporter.download.mockResolvedValue({ ok: true, fileName: 'randwise-pay-2026-10-23.pdf' });
    const { button, fixture, status } = await render();
    button().click();
    await fixture.whenStable();
    expect(exporter.download).toHaveBeenCalledTimes(1);
    expect(exporter.download).toHaveBeenCalledWith(REPORT);
    expect(status()).toBe('PDF downloaded');
  });

  it('is disabled and busy while it works, and ignores a second click', async () => {
    exporter.pending();
    const { button, fixture, status } = await render();
    button().click();
    await fixture.whenStable();

    expect(button().disabled).toBe(true);
    expect(button().getAttribute('aria-busy')).toBe('true');
    expect(normaliseSpaces(button().textContent)).toBe('Preparing PDF');
    expect(fixture.nativeElement.querySelector('.rw-download-pdf__spinner')).not.toBeNull();
    expect(status()).toBe('Preparing your PDF');

    button().click();
    expect(exporter.download).toHaveBeenCalledTimes(1);

    await exporter.finish({ ok: true, fileName: 'x.pdf' });
    await fixture.whenStable();
    expect(button().disabled).toBe(false);
    expect(button().getAttribute('aria-busy')).toBe('false');
    expect(normaliseSpaces(button().textContent)).toBe('Download PDF');
    expect(fixture.nativeElement.querySelector('.rw-download-pdf__spinner')).toBeNull();
    expect(status()).toBe('PDF downloaded');
  });

  it('shows the failure inline as an alert, and the button works again', async () => {
    exporter.download.mockResolvedValue({
      ok: false,
      reason: 'load-failed',
      message: 'Could not load the PDF tools. Check your connection and try again.',
    });
    const { button, alert, fixture, status } = await render();
    button().click();
    await fixture.whenStable();

    expect(alert()?.textContent?.trim()).toBe(
      'Could not load the PDF tools. Check your connection and try again.',
    );
    expect(alert()?.tagName).toBe('P');
    expect(button().disabled).toBe(false);
    expect(status()).toBe('');
  });

  it('clears the old error when the next attempt starts', async () => {
    exporter.download.mockResolvedValueOnce({
      ok: false,
      reason: 'render-failed',
      message: 'Could not create the PDF. Try again.',
    });
    const { button, alert, fixture } = await render();
    button().click();
    await fixture.whenStable();
    expect(alert()).not.toBeNull();

    exporter.pending();
    button().click();
    await fixture.whenStable();
    expect(alert()).toBeNull();

    await exporter.finish({ ok: true, fileName: 'x.pdf' });
    await fixture.whenStable();
    expect(alert()).toBeNull();
  });

  it('also shows an alert if the service rejects unexpectedly', async () => {
    exporter.download.mockRejectedValue(new Error('unexpected'));
    const { button, alert, fixture } = await render();
    button().click();
    await fixture.whenStable();
    expect(alert()?.textContent?.trim()).toBe('Could not create the PDF. Try again.');
    expect(button().disabled).toBe(false);
  });

  it('is disabled and never calls the service while there is no report', async () => {
    const { button, fixture } = await render(null);
    expect(button().disabled).toBe(true);
    button().click();
    await fixture.whenStable();
    expect(exporter.download).not.toHaveBeenCalled();
  });

  it('puts focus back on the button after the export, because disabling drops it', async () => {
    exporter.pending();
    const { button, fixture } = await render();
    document.body.appendChild(fixture.nativeElement);
    button().focus();
    expect(document.activeElement).toBe(button());

    button().click();
    await fixture.whenStable();
    // jsdom keeps focus on a disabled button, so move it away the way a browser does.
    button().blur();

    await exporter.finish({ ok: true, fileName: 'x.pdf' });
    await fixture.whenStable();
    expect(document.activeElement).toBe(button());
  });

  it('leaves focus alone when the button was not focused', async () => {
    exporter.pending();
    const { button, fixture } = await render();
    document.body.appendChild(fixture.nativeElement);
    button().click();
    await fixture.whenStable();
    await exporter.finish({ ok: true, fileName: 'x.pdf' });
    await fixture.whenStable();
    expect(document.activeElement).not.toBe(button());
  });

  it('uses a custom label when given', async () => {
    const fixture = TestBed.createComponent(DownloadPdf);
    fixture.componentRef.setInput('report', REPORT);
    fixture.componentRef.setInput('label', 'Save as PDF');
    await fixture.whenStable();
    expect(normaliseSpaces(fixture.nativeElement.querySelector('button').textContent)).toBe(
      'Save as PDF',
    );
  });
});
