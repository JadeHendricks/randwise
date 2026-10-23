// No network or egress: the PDF is built in memory and saved with jsPDF's local Blob download.
// This is the only file allowed to import jspdf and svg2pdf.js (ESLint enforces it), and it
// imports them with `await import(...)` so they ship in a separate lazy chunk, loaded on the
// first "Download PDF" click and never part of the initial bundle.
//
// Charts are drawn as VECTOR with svg2pdf.js. If svg2pdf ever proves brittle for a chart, the
// fallback is to rasterise that chart's cloned svg: load it as an `Image` from a
// `data:image/svg+xml` URL, draw it on an offscreen canvas, then `doc.addImage(canvas.toDataURL())`.
// That fallback is not shipped (a failed chart is skipped; its numbers are also printed as text).
import { InjectionToken } from '@angular/core';
import type { jsPDF } from 'jspdf';

export interface PdfTextOptions {
  readonly align?: 'left' | 'center' | 'right';
}

/** The subset of jsPDF the renderer calls. The real jsPDF satisfies it; specs fake it. */
export interface PdfDoc {
  text(text: string | string[], x: number, y: number, options?: PdfTextOptions): unknown;
  setFont(name: string, style?: string): unknown;
  setFontSize(size: number): unknown;
  setTextColor(colour: string): unknown;
  setFillColor(colour: string): unknown;
  setDrawColor(colour: string): unknown;
  setLineWidth(width: number): unknown;
  setLineDashPattern(dash: number[], phase: number): unknown;
  rect(x: number, y: number, width: number, height: number, style?: string): unknown;
  line(x1: number, y1: number, x2: number, y2: number): unknown;
  addPage(): unknown;
  setPage(page: number): unknown;
  getNumberOfPages(): number;
  splitTextToSize(text: string, maxWidth: number): string[];
  getTextWidth(text: string): number;
  setProperties(properties: { title?: string; subject?: string; creator?: string }): unknown;
  save(fileName: string): unknown;
}

export interface SvgBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PdfLibs {
  /** A4 portrait document in points. */
  createDoc(): PdfDoc;
  /** Draws an svg (already mounted in the document) into `box` as vector graphics. */
  renderSvg(svg: SVGSVGElement, doc: PdfDoc, box: SvgBox): Promise<void>;
}

async function loadPdfLibs(): Promise<PdfLibs> {
  const [{ jsPDF: JsPdf }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  return {
    createDoc: () =>
      new JsPdf({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true }) as PdfDoc,
    renderSvg: async (svg, doc, box) => {
      // loadExternalStyleSheets and loadImages are off so svg2pdf never makes a request.
      await svg2pdf(svg, doc as unknown as jsPDF, {
        ...box,
        loadExternalStyleSheets: false,
        loadImages: false,
      });
    },
  };
}

/** Loads the PDF libraries. A token so specs can supply a fake loader instead of the real ones. */
export const PDF_LIBS = new InjectionToken<() => Promise<PdfLibs>>('PDF_LIBS', {
  providedIn: 'root',
  factory: () => loadPdfLibs,
});
