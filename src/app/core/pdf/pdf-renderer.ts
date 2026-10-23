import { CapturedChart, LegendEntry } from './chart-capture';
import { PdfDoc, SvgBox } from './pdf-libs';
import { GAP, PAGE, PRINT, SIZE, TONE_COLOURS } from './pdf-theme';
import { pdfSafeText } from './pdf-text';
import {
  ReportModel,
  ReportRow,
  ReportSection,
  formatReportValue,
} from './report-model';

/** The one line every footer carries, apart from the shared disclaimer. */
export interface RenderMeta {
  /** e.g. `Data: tax year 2026/27 (verified, checked 22 Oct 2026). SARB rates as of 22 Oct 2026.` */
  readonly dataSourceLine: string;
  /** e.g. `23 Oct 2026`. */
  readonly generatedOn: string;
}

export interface RenderChart {
  readonly title: string;
  readonly captured: CapturedChart;
}

/** Draws a captured chart's svg into `box` (vector). Supplied by the service. */
export type DrawSvg = (captured: CapturedChart, box: SvgBox) => Promise<void>;

export const DISCLAIMER = 'Estimates only, not financial advice.';

const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;
const LEFT = PAGE.margin;
const RIGHT = PAGE.width - PAGE.margin;
const CONTENT_BOTTOM = PAGE.height - PAGE.footerReserve;
const LABEL_WIDTH = CONTENT_WIDTH * 0.58;
const VALUE_WIDTH = CONTENT_WIDTH - LABEL_WIDTH - 14;
const Y_GUTTER = 52;
const LINE_ASPECT = 260 / 600;
const RING_SIZE = 110;
const BAR_HEIGHT = 18;
const LEGEND_ROW = 13;

const lineHeight = (size: number): number => size * GAP.line;

/**
 * Lays a report out on a PDF document: header, INPUTS, RESULTS, CHARTS, WARNINGS, NOTES, then
 * a footer on every page. It only positions and formats what the ReportModel already holds.
 */
export async function renderReport(
  doc: PdfDoc,
  report: ReportModel,
  charts: readonly RenderChart[],
  drawSvg: DrawSvg,
  meta: RenderMeta,
): Promise<void> {
  const painter = new Painter(doc, report.title, drawSvg);
  painter.header(report.title, report.subtitle);
  painter.sections('Inputs', report.inputs);
  painter.sections('Results', report.results);
  await painter.charts(charts);
  painter.warnings(report.warnings);
  painter.notes(report.notes);
  painter.footers(meta);
}

class Painter {
  private y: number = PAGE.margin;

  constructor(
    private readonly doc: PdfDoc,
    private readonly title: string,
    private readonly drawSvg: DrawSvg,
  ) {}

  header(title: string, subtitle: string): void {
    const { doc } = this;
    this.font('bold', SIZE.brand, PRINT.accent);
    doc.text('Randwise', LEFT, this.y + SIZE.brand);
    this.y += SIZE.brand + 8;
    this.font('bold', SIZE.title, PRINT.ink);
    for (const line of this.wrap(title, CONTENT_WIDTH)) {
      this.y += lineHeight(SIZE.title);
      doc.text(line, LEFT, this.y);
    }
    this.font('normal', SIZE.subtitle, PRINT.muted);
    for (const line of this.wrap(subtitle, CONTENT_WIDTH)) {
      this.y += lineHeight(SIZE.subtitle) + 1;
      doc.text(line, LEFT, this.y);
    }
    this.y += 8;
    this.rule(PRINT.accent, 1);
    this.y += GAP.section - 4;
  }

  sections(label: string, sections: readonly ReportSection[]): void {
    const visible = sections.filter((s) => s.rows.length > 0 || (s.paragraphs?.length ?? 0) > 0);
    if (visible.length === 0) return;
    this.sectionHeading(label);
    for (const section of visible) {
      this.section(section);
    }
  }

  async charts(charts: readonly RenderChart[]): Promise<void> {
    if (charts.length === 0) return;
    this.sectionHeading('Charts', 150);
    for (const chart of charts) {
      await this.chart(chart);
    }
  }

  warnings(warnings: readonly string[]): void {
    if (warnings.length === 0) return;
    this.sectionHeading('Warnings');
    for (const warning of warnings) {
      // The bold "Warning:" prefix means colour is never the only signal.
      this.font('bold', SIZE.paragraph, PRINT.warningText);
      const prefix = 'Warning:';
      const indent = this.doc.getTextWidth(prefix) + 4;
      this.font('normal', SIZE.paragraph, PRINT.warningText);
      const lines = this.wrap(warning, CONTENT_WIDTH - indent);
      const height = lines.length * lineHeight(SIZE.paragraph) + GAP.row;
      this.ensure(height);
      this.font('bold', SIZE.paragraph, PRINT.warningText);
      this.doc.text(prefix, LEFT, this.y + SIZE.paragraph);
      this.font('normal', SIZE.paragraph, PRINT.warningText);
      lines.forEach((line, i) => {
        this.doc.text(line, LEFT + indent, this.y + SIZE.paragraph + i * lineHeight(SIZE.paragraph));
      });
      this.y += height;
    }
  }

  notes(notes: readonly string[]): void {
    if (notes.length === 0) return;
    this.sectionHeading('Notes');
    for (const note of notes) this.paragraph(note);
  }

  /** Draws the footer on every page. Runs last, once the page count is known. */
  footers(meta: RenderMeta): void {
    const { doc } = this;
    const total = doc.getNumberOfPages();
    for (let page = 1; page <= total; page++) {
      doc.setPage(page);
      const top = PAGE.height - 66;
      doc.setDrawColor(PRINT.rule);
      doc.setLineWidth(0.5);
      doc.line(LEFT, top, RIGHT, top);
      this.font('normal', SIZE.footer, PRINT.muted);
      const source = this.wrap(meta.dataSourceLine, CONTENT_WIDTH).slice(0, 3);
      source.forEach((line, i) => doc.text(line, LEFT, top + 9 + i * 10));
      const disclaimerY = top + 10 + source.length * 10;
      this.font('bold', SIZE.footer, PRINT.ink);
      doc.text(DISCLAIMER, LEFT, disclaimerY);
      this.font('normal', SIZE.footer, PRINT.muted);
      doc.text(`Generated ${meta.generatedOn}`, LEFT, disclaimerY + 10);
      doc.text(`Page ${page} of ${total}`, RIGHT, disclaimerY + 10, { align: 'right' });
    }
  }

  // --- blocks -------------------------------------------------------------------------

  private sectionHeading(label: string, keepWith = 60): void {
    this.ensure(SIZE.section + keepWith);
    this.font('bold', SIZE.section, PRINT.accent);
    this.doc.text(label.toUpperCase(), LEFT, this.y + SIZE.section);
    this.y += SIZE.section + 4;
    this.rule(PRINT.accent, 0.75);
    this.y += 8;
  }

  private section(section: ReportSection): void {
    if (section.heading) {
      this.ensure(SIZE.subheading + 40);
      this.font('bold', SIZE.subheading, PRINT.ink);
      this.doc.text(this.safe(section.heading), LEFT, this.y + SIZE.subheading);
      this.y += lineHeight(SIZE.subheading) + 4;
    }
    for (const row of section.rows) this.row(row);
    for (const paragraph of section.paragraphs ?? []) this.paragraph(paragraph);
    this.y += GAP.block;
  }

  private row(row: ReportRow): void {
    const { doc } = this;
    const size = row.emphasis ? SIZE.rowEmphasis : SIZE.row;
    const style = row.emphasis ? 'bold' : 'normal';
    this.font(style, size, PRINT.ink);
    const labelLines = this.wrap(row.label, LABEL_WIDTH);
    this.font('bold', size, PRINT.ink);
    const valueLines = this.wrap(formatReportValue(row.value), VALUE_WIDTH);
    this.font('normal', SIZE.detail, PRINT.muted);
    const detailLines = row.detail ? this.wrap(row.detail, LABEL_WIDTH) : [];

    const mainHeight = Math.max(labelLines.length, valueLines.length) * lineHeight(size);
    const detailHeight = detailLines.length * lineHeight(SIZE.detail);
    const height = mainHeight + detailHeight + GAP.row * 2;
    this.ensure(height);

    const top = this.y + GAP.row;
    this.font(style, size, PRINT.ink);
    labelLines.forEach((line, i) => doc.text(line, LEFT, top + size + i * lineHeight(size)));
    this.font('bold', size, PRINT.ink);
    valueLines.forEach((line, i) =>
      doc.text(line, RIGHT, top + size + i * lineHeight(size), { align: 'right' }),
    );
    this.font('normal', SIZE.detail, PRINT.muted);
    detailLines.forEach((line, i) =>
      doc.text(line, LEFT, top + mainHeight + SIZE.detail + i * lineHeight(SIZE.detail)),
    );
    this.y += height;
    this.rule(PRINT.rule, 0.5);
  }

  private paragraph(value: string): void {
    this.font('normal', SIZE.paragraph, PRINT.ink);
    const lines = this.wrap(value, CONTENT_WIDTH);
    this.y += 2;
    for (const line of lines) {
      this.ensure(lineHeight(SIZE.paragraph));
      this.font('normal', SIZE.paragraph, PRINT.ink);
      this.doc.text(line, LEFT, this.y + SIZE.paragraph);
      this.y += lineHeight(SIZE.paragraph);
    }
    this.y += GAP.row;
  }

  // --- charts -------------------------------------------------------------------------

  private async chart({ title, captured }: RenderChart): Promise<void> {
    switch (captured.kind) {
      case 'line':
        return this.lineChart(title, captured);
      case 'bar':
        return this.barChart(title, captured);
      case 'ring':
        return this.ringChart(title, captured);
    }
  }

  /** Draws the svg first so a failing chart leaves no stray title or legend behind. */
  private async tryDraw(captured: CapturedChart, box: SvgBox): Promise<boolean> {
    try {
      await this.drawSvg(captured, box);
      return true;
    } catch {
      return false;
    }
  }

  private chartTitle(title: string): void {
    this.font('bold', SIZE.subheading, PRINT.ink);
    this.doc.text(this.safe(title), LEFT, this.y + SIZE.subheading);
    this.y += lineHeight(SIZE.subheading) + 4;
  }

  private async lineChart(title: string, chart: CapturedChart): Promise<void> {
    const { doc } = this;
    const plotX = LEFT + Y_GUTTER;
    const plotW = CONTENT_WIDTH - Y_GUTTER;
    const plotH = Math.round(plotW * LINE_ASPECT);
    this.font('normal', SIZE.detail, PRINT.muted);
    const noteLines = chart.note ? this.wrap(chart.note, CONTENT_WIDTH) : [];
    const legendRows = chart.legend.length > 0 ? 1 + Math.floor(chart.legend.length / 3) : 0;
    const height =
      lineHeight(SIZE.subheading) + 4 +
      (chart.yLabel ? 12 : 0) +
      plotH +
      14 +
      (chart.xLabel ? 13 : 0) +
      legendRows * LEGEND_ROW +
      noteLines.length * lineHeight(SIZE.detail) +
      GAP.section;
    this.ensure(height);

    const top = this.y + lineHeight(SIZE.subheading) + 4 + (chart.yLabel ? 12 : 0);
    if (!(await this.tryDraw(chart, { x: plotX, y: top, width: plotW, height: plotH }))) return;

    this.chartTitle(title);
    this.font('normal', SIZE.detail, PRINT.muted);
    if (chart.yLabel) {
      doc.text(this.safe(chart.yLabel), LEFT, this.y + SIZE.detail);
      this.y += 12;
    }
    const plotTop = this.y;
    chart.yTicks.forEach((tick, i) => {
      const at = plotTop + (i / Math.max(1, chart.yTicks.length - 1)) * plotH;
      const baseline = Math.min(plotTop + plotH, Math.max(plotTop + 6, at + 3));
      doc.text(this.safe(tick), plotX - 6, baseline, { align: 'right' });
    });
    const axisY = plotTop + plotH + 11;
    chart.xTicks.forEach((tick, i, all) => {
      const last = all.length - 1;
      const at = plotX + (i / Math.max(1, last)) * plotW;
      const align = i === 0 ? 'left' : i === last ? 'right' : 'center';
      doc.text(this.safe(tick), at, axisY, { align });
    });
    this.y = plotTop + plotH + 14;
    if (chart.xLabel) {
      doc.text(this.safe(chart.xLabel), plotX + plotW / 2, this.y + SIZE.detail, { align: 'center' });
      this.y += 13;
    }
    this.lineLegend(chart.legend);
    this.font('normal', SIZE.detail, PRINT.muted);
    noteLines.forEach((line) => {
      doc.text(line, LEFT, this.y + SIZE.detail);
      this.y += lineHeight(SIZE.detail);
    });
    this.y += GAP.section;
  }

  private lineLegend(legend: readonly LegendEntry[]): void {
    if (legend.length === 0) return;
    const { doc } = this;
    let x = LEFT;
    this.font('normal', SIZE.detail, PRINT.ink);
    for (const item of legend) {
      const name = this.safe(item.label);
      const width = 22 + doc.getTextWidth(name) + 16;
      if (x + width > RIGHT && x > LEFT) {
        x = LEFT;
        this.y += LEGEND_ROW;
      }
      doc.setDrawColor(item.dashed ? PRINT.muted : PRINT.accent);
      doc.setLineWidth(item.dashed ? 1.5 : 2);
      doc.setLineDashPattern(item.dashed ? [3, 2] : [], 0);
      doc.line(x, this.y + 5, x + 16, this.y + 5);
      doc.setLineDashPattern([], 0);
      this.font('normal', SIZE.detail, PRINT.ink);
      doc.text(name, x + 22, this.y + 8);
      x += width;
    }
    this.y += LEGEND_ROW + 4;
  }

  private async barChart(title: string, chart: CapturedChart): Promise<void> {
    const { doc } = this;
    const height =
      lineHeight(SIZE.subheading) + 4 + BAR_HEIGHT + 8 + chart.legend.length * LEGEND_ROW + GAP.section;
    this.ensure(height);
    const top = this.y + lineHeight(SIZE.subheading) + 4;
    if (!(await this.tryDraw(chart, { x: LEFT, y: top, width: CONTENT_WIDTH, height: BAR_HEIGHT }))) {
      return;
    }
    this.chartTitle(title);
    this.y += BAR_HEIGHT + 8;
    for (const item of chart.legend) {
      doc.setFillColor(TONE_COLOURS[item.tone ?? 'muted'] ?? PRINT.muted);
      doc.rect(LEFT, this.y + 1, 8, 8, 'F');
      this.font('normal', SIZE.detail + 0.5, PRINT.ink);
      doc.text(this.safe(item.label), LEFT + 14, this.y + 8);
      if (item.value) doc.text(this.safe(item.value), RIGHT - 44, this.y + 8, { align: 'right' });
      if (item.percent) doc.text(this.safe(item.percent), RIGHT, this.y + 8, { align: 'right' });
      this.y += LEGEND_ROW;
    }
    this.y += GAP.section;
  }

  private async ringChart(title: string, chart: CapturedChart): Promise<void> {
    const { doc } = this;
    const height = lineHeight(SIZE.subheading) + 4 + RING_SIZE + GAP.section;
    this.ensure(height);
    const top = this.y + lineHeight(SIZE.subheading) + 4;
    if (!(await this.tryDraw(chart, { x: LEFT, y: top, width: RING_SIZE, height: RING_SIZE }))) return;

    this.chartTitle(title);
    const centreX = LEFT + RING_SIZE / 2;
    const centreY = top + RING_SIZE / 2;
    let size = 14;
    this.font('bold', size, PRINT.ink);
    const centre = this.safe(chart.centre);
    if (doc.getTextWidth(centre) > RING_SIZE * 0.62) {
      size = 10;
      this.font('bold', size, PRINT.ink);
    }
    doc.text(centre, centreX, centreY + size / 3, { align: 'center' });
    if (chart.caption) {
      this.font('normal', SIZE.paragraph, PRINT.ink);
      const lines = this.wrap(chart.caption, CONTENT_WIDTH - RING_SIZE - 16);
      const startY = centreY - ((lines.length - 1) * lineHeight(SIZE.paragraph)) / 2 + 3;
      lines.forEach((line, i) => {
        doc.text(line, LEFT + RING_SIZE + 16, startY + i * lineHeight(SIZE.paragraph));
      });
    }
    this.y = top + RING_SIZE + GAP.section;
  }

  // --- primitives ---------------------------------------------------------------------

  private font(style: 'normal' | 'bold', size: number, colour: string): void {
    this.doc.setFont('helvetica', style);
    this.doc.setFontSize(size);
    this.doc.setTextColor(colour);
  }

  private safe(value: string): string {
    return pdfSafeText(value);
  }

  /** Wraps with the CURRENT font, so set the font first. */
  private wrap(value: string, width: number): string[] {
    const safe = this.safe(value);
    return safe === '' ? [] : this.doc.splitTextToSize(safe, width);
  }

  private rule(colour: string, width: number): void {
    this.doc.setDrawColor(colour);
    this.doc.setLineWidth(width);
    this.doc.line(LEFT, this.y, RIGHT, this.y);
  }

  /** Starts a new page when `height` would run into the footer. Blocks never split mid-row. */
  private ensure(height: number): void {
    if (this.y + height <= CONTENT_BOTTOM) return;
    // A block taller than a page cannot be helped by a break; draw it from the top.
    if (this.y <= PAGE.margin + 40) return;
    this.doc.addPage();
    this.y = PAGE.margin;
    this.font('normal', SIZE.continuation, PRINT.muted);
    this.doc.text(this.safe(`Randwise: ${this.title}`), LEFT, this.y + SIZE.continuation);
    this.y += SIZE.continuation + 6;
    this.rule(PRINT.rule, 0.5);
    this.y += 12;
  }
}
