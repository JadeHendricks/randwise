import { ReportModel, ReportRow, ReportSection, formatReportValue } from '../core/pdf/report-model';

/** Every row of every section, inputs first. */
export function allRows(report: ReportModel): ReportRow[] {
  return [...report.inputs, ...report.results].flatMap((section) => [...section.rows]);
}

export function findRow(sections: readonly ReportSection[], label: string): ReportRow | undefined {
  return sections.flatMap((section) => [...section.rows]).find((row) => row.label === label);
}

/** All the text the report would print, one string per piece, as the PDF layer formats it. */
export function reportStrings(report: ReportModel): string[] {
  const sectionStrings = (section: ReportSection) => [
    ...(section.heading ? [section.heading] : []),
    ...section.rows.flatMap((row) => [
      row.label,
      formatReportValue(row.value),
      ...(row.detail ? [row.detail] : []),
    ]),
    ...(section.paragraphs ?? []),
  ];
  return [
    report.title,
    report.subtitle,
    ...report.inputs.flatMap(sectionStrings),
    ...report.results.flatMap(sectionStrings),
    ...report.charts.flatMap((chart) => [chart.id, chart.title]),
    ...report.warnings,
    ...report.notes,
  ];
}

/** A value in the report that would be a bug on paper. */
export const BROKEN_TEXT = /NaN|undefined|\[object/;
