import { Provider } from '@angular/core';

import { PDF_LIBS, PdfDoc, PdfLibs, PdfTextOptions, SvgBox } from '../core/pdf/pdf-libs';

export interface RecordedText {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly page: number;
  readonly align: string;
}

/** A PdfDoc that records what was drawn instead of making a PDF. */
export class FakePdfDoc implements PdfDoc {
  readonly texts: RecordedText[] = [];
  readonly rects: { page: number; fill: string }[] = [];
  readonly lines: { page: number }[] = [];
  properties: { title?: string; subject?: string; creator?: string } | null = null;
  saved: string[] = [];
  pages = 1;
  /** Throws on the n-th call to `text` (1-based) when set. */
  failTextAt: number | null = null;
  private current = 1;
  private size = 10;
  private fill = '';

  /** Every string on one page, in draw order. */
  textsOnPage(page: number): string[] {
    return this.texts.filter((t) => t.page === page).map((t) => t.text);
  }

  allText(): string[] {
    return this.texts.map((t) => t.text);
  }

  text(text: string | string[], x: number, y: number, options?: PdfTextOptions): void {
    if (this.failTextAt !== null && this.texts.length + 1 >= this.failTextAt) {
      throw new Error('text failed');
    }
    for (const line of Array.isArray(text) ? text : [text]) {
      this.texts.push({ text: line, x, y, page: this.current, align: options?.align ?? 'left' });
    }
  }

  // Styling calls are not recorded; the specs assert on text, pages and the save call.
  setFont(): void {
    /* not recorded */
  }
  setFontSize(size: number): void {
    this.size = size;
  }
  setTextColor(): void {
    /* not recorded */
  }
  setFillColor(colour: string): void {
    this.fill = colour;
  }
  setDrawColor(): void {
    /* not recorded */
  }
  setLineWidth(): void {
    /* not recorded */
  }
  setLineDashPattern(): void {
    /* not recorded */
  }

  rect(): void {
    this.rects.push({ page: this.current, fill: this.fill });
  }

  line(): void {
    this.lines.push({ page: this.current });
  }

  addPage(): void {
    this.pages += 1;
    this.current = this.pages;
  }

  setPage(page: number): void {
    this.current = page;
  }

  getNumberOfPages(): number {
    return this.pages;
  }

  // About half an em per character is close enough to wrap predictably.
  getTextWidth(text: string): number {
    return text.length * this.size * 0.5;
  }

  splitTextToSize(text: string, maxWidth: number): string[] {
    const perLine = Math.max(1, Math.floor(maxWidth / (this.size * 0.5)));
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line === '' ? word : `${line} ${word}`;
      if (next.length > perLine && line !== '') {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line !== '') lines.push(line);
    return lines;
  }

  setProperties(properties: { title?: string; subject?: string; creator?: string }): void {
    this.properties = properties;
  }

  save(fileName: string): void {
    this.saved.push(fileName);
  }
}

export interface SvgCall {
  readonly svg: SVGSVGElement;
  readonly box: SvgBox;
  /** Whether the svg was attached to the document at the moment it was drawn. */
  readonly connected: boolean;
}

export interface FakePdfOptions {
  failLoad?: boolean;
  failSvg?: boolean;
  /** Makes `createDoc` throw. */
  failCreate?: boolean;
}

export interface FakePdf {
  readonly provider: Provider;
  readonly options: FakePdfOptions;
  readonly docs: FakePdfDoc[];
  readonly svgCalls: SvgCall[];
  /** How many times the loader was invoked. */
  loads: number;
  doc(): FakePdfDoc;
}

/** Replaces the lazy PDF libraries with fakes. No real PDF is ever generated. */
export function fakePdfLibs(options: FakePdfOptions = {}): FakePdf {
  const docs: FakePdfDoc[] = [];
  const svgCalls: SvgCall[] = [];
  const state: FakePdf = {
    options,
    docs,
    svgCalls,
    loads: 0,
    doc: () => {
      const doc = docs[docs.length - 1];
      if (!doc) throw new Error('no document was created');
      return doc;
    },
    provider: {
      provide: PDF_LIBS,
      useValue: (): Promise<PdfLibs> => {
        state.loads += 1;
        if (options.failLoad) return Promise.reject(new Error('chunk failed to load'));
        return Promise.resolve({
          createDoc: () => {
            if (options.failCreate) throw new Error('createDoc failed');
            const doc = new FakePdfDoc();
            docs.push(doc);
            return doc;
          },
          renderSvg: (svg, _doc, box) => {
            svgCalls.push({ svg, box, connected: svg.isConnected });
            return options.failSvg ? Promise.reject(new Error('svg failed')) : Promise.resolve();
          },
        });
      },
    },
  };
  return state;
}
