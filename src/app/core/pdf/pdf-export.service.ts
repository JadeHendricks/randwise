import { DOCUMENT } from '@angular/common';
import { Injectable, Signal, computed, inject } from '@angular/core';

import { TODAY } from '../data/data-source';
import { formatShortDate } from '../data/format-date';
import { RatesService } from '../data/rates.service';
import { taxYearLabel, toLocalIsoDate } from '../data/tax-calendar';
import { TaxYearService } from '../data/tax-year.service';
import { CapturedChart, captureChart } from './chart-capture';
import { preparePrintSvg } from './chart-print-style';
import { PDF_LIBS, PdfDoc, PdfLibs, SvgBox } from './pdf-libs';
import { RenderChart, renderReport } from './pdf-renderer';
import { reportFileName } from './pdf-text';
import { ReportModel } from './report-model';

export type PdfExportResult =
  | { readonly ok: true; readonly fileName: string }
  | {
      readonly ok: false;
      readonly reason: 'load-failed' | 'render-failed';
      readonly message: string;
    };

const LOAD_FAILED = 'Could not load the PDF tools. Check your connection and try again.';
const RENDER_FAILED = 'Could not create the PDF. Try again.';

/**
 * Builds a PDF from a page-supplied ReportModel and downloads it. Generic on purpose: it knows
 * nothing about finance, it only formats and lays out what the page hands over.
 *
 * No network or egress: jspdf and svg2pdf.js are loaded on the first call from a lazy chunk of
 * this app, the document is built in memory and saved as a local Blob download.
 */
@Injectable({ providedIn: 'root' })
export class PdfExportService {
  private readonly loadLibs = inject(PDF_LIBS);
  private readonly taxYears = inject(TaxYearService);
  private readonly rates = inject(RatesService);
  private readonly today = inject(TODAY);
  private readonly document = inject(DOCUMENT);

  /** Cached after a successful load, cleared after a failed one so a retry can work. */
  private libs: Promise<PdfLibs> | null = null;

  /** The footer's data-source line: tax year, its status and check date, and the SARB rates date. */
  readonly dataSourceLine: Signal<string> = computed(() => {
    const data = this.taxYears.taxYear();
    let tax: string;
    if (data === null) {
      tax = 'Data: tax data unavailable.';
    } else {
      let status: string;
      if (this.taxYears.isStale()) {
        status = `out of date, ended ${formatShortDate(data.period.end)}`;
      } else {
        const word = data.status === 'verified-auto' ? 'verified (auto)' : data.status;
        status = `${word}, checked ${formatShortDate(data.verifiedOn)}`;
      }
      tax = `Data: tax year ${taxYearLabel(data.taxYear)} (${status}).`;
    }
    const asOf = this.rates.ratesAsOf();
    const rates = asOf ? `SARB rates as of ${formatShortDate(asOf)}.` : 'Rates unavailable.';
    return `${tax} ${rates}`;
  });

  /** Never throws: failures come back as `{ ok: false }` so the UI can show a message. */
  async download(report: ReportModel): Promise<PdfExportResult> {
    let libs: PdfLibs;
    try {
      libs = await this.getLibs();
    } catch {
      return { ok: false, reason: 'load-failed', message: LOAD_FAILED };
    }

    try {
      const doc = libs.createDoc();
      doc.setProperties({ title: report.title, subject: 'Randwise estimate', creator: 'Randwise' });
      const isoDate = toLocalIsoDate(this.today());
      await renderReport(
        doc,
        report,
        this.captureCharts(report),
        (captured, box) => this.drawSvg(libs, doc, captured, box),
        { dataSourceLine: this.dataSourceLine(), generatedOn: formatShortDate(isoDate) },
      );
      const fileName = reportFileName(report.id, isoDate);
      // Saved locally as a Blob download. Nothing is sent anywhere.
      doc.save(fileName);
      return { ok: true, fileName };
    } catch {
      return { ok: false, reason: 'render-failed', message: RENDER_FAILED };
    }
  }

  private getLibs(): Promise<PdfLibs> {
    this.libs ??= this.loadLibs().catch((error: unknown) => {
      this.libs = null;
      throw error;
    });
    return this.libs;
  }

  /** Charts whose host is missing from the page, or that have no svg (empty state), are skipped. */
  private captureCharts(report: ReportModel): RenderChart[] {
    const charts: RenderChart[] = [];
    for (const ref of report.charts) {
      const host = this.document.querySelector(`[data-pdf-chart="${ref.id}"]`);
      const captured = host ? captureChart(host) : null;
      if (captured) charts.push({ title: ref.title, captured });
    }
    return charts;
  }

  /** svg2pdf needs the svg in the document, so mount the print clone off-screen while it draws. */
  private async drawSvg(
    libs: PdfLibs,
    doc: PdfDoc,
    captured: CapturedChart,
    box: SvgBox,
  ): Promise<void> {
    const container = this.document.createElement('div');
    container.setAttribute('aria-hidden', 'true');
    container.style.cssText =
      'position:absolute;left:-10000px;top:0;width:700px;height:400px;overflow:hidden;';
    const clone = preparePrintSvg(captured.svg);
    container.appendChild(clone);
    this.document.body.appendChild(container);
    try {
      await libs.renderSvg(clone, doc, box);
    } finally {
      container.remove();
    }
  }
}
