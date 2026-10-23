// Text output of the scout: a short console summary and the Markdown report in last-report.md.
// Loaded after register-ts.mjs (or inside Vitest), which is why the .ts import works.
import {
  TAX_YEAR_FIELD_KEYS,
  TAX_YEAR_FIELD_LABELS,
} from '../../../src/app/core/data/tax-year.schema.ts';
import { compareYears, formatPercentChange } from './checks.mjs';

const PREFIX = '[tax-season]';
const MAX_CONSOLE_CHANGES = 12;
const REPORT_LOCATION = 'scripts/tax-season/last-report.md';

const labelOf = (key) => TAX_YEAR_FIELD_LABELS[key] ?? key;

/** Every leaf that differs between last year's file and the new one, in field order. */
export function diffFiles(previous, file) {
  return TAX_YEAR_FIELD_KEYS.flatMap(
    (key) => compareYears(previous[key].value, file[key].value, { path: key }).changes,
  );
}

const show = (value) => (value === null || value === undefined ? 'none' : String(value));

function summary(file, decisions) {
  const carried = TAX_YEAR_FIELD_KEYS.filter((key) => file[key].carriedForward);
  const rejected = TAX_YEAR_FIELD_KEYS.filter((key) => decisions[key]?.rejected);
  return {
    carried,
    rejected,
    confirmed: TAX_YEAR_FIELD_KEYS.length - carried.length,
  };
}

/** Groups fields that were rejected for the same reasons (a unit), so one line covers the trio. */
function rejectedGroups(rejected, decisions) {
  const groups = new Map();
  for (const key of rejected) {
    const id = decisions[key].reasons.join('|');
    groups.set(id, [...(groups.get(id) ?? []), key]);
  }
  return [...groups.values()];
}

/**
 * The lines the scout prints, each starting with `[tax-season]`: the status line, up to 12
 * changed values, what was carried forward or rejected, and where the full report is.
 */
export function renderConsole({ year, previous, file, decisions, status }) {
  const { carried, rejected, confirmed } = summary(file, decisions);
  const lines = [
    `${year} tax year: ${status} (${confirmed} of ${TAX_YEAR_FIELD_KEYS.length} fields confirmed)`,
  ];

  const changes = diffFiles(previous, file);
  for (const change of changes.slice(0, MAX_CONSOLE_CHANGES)) {
    lines.push(
      `  ${change.path}  ${show(change.previous)} -> ${show(change.next)} ` +
        `(${formatPercentChange(change.pct)})`,
    );
  }
  if (changes.length > MAX_CONSOLE_CHANGES) {
    lines.push(`  ... and ${changes.length - MAX_CONSOLE_CHANGES} more changes (see the report)`);
  }

  if (carried.length > 0) lines.push(`carried forward: ${carried.map(labelOf).join(', ')}`);
  for (const group of rejectedGroups(rejected, decisions)) {
    lines.push(`rejected: ${group.map(labelOf).join(', ')} (${decisions[group[0]].reasons[0]})`);
  }
  lines.push(`report: ${REPORT_LOCATION}`);
  return lines.map((line) => `${PREFIX} ${line}`);
}

/**
 * The Markdown written to last-report.md. With `error` set (the scout stopped) it reports the
 * failure and the page fetch errors instead of a result.
 */
export function renderReport({
  year,
  today,
  previous,
  file = null,
  decisions = {},
  status = null,
  checks = [],
  fetchErrors = [],
  error = null,
}) {
  const out = [`# Tax-season scout report: ${year}`, '', `Date: ${today}`];

  if (error || !file) {
    out.push('', `Result: **stopped**. ${error ?? 'No file was produced.'}`);
  } else {
    const { carried, rejected, confirmed } = summary(file, decisions);
    out.push(
      `Status: **${status}** (${confirmed} of ${TAX_YEAR_FIELD_KEYS.length} fields confirmed)`,
    );

    out.push('', `## Changes vs ${year - 1}`, '');
    const changes = diffFiles(previous, file);
    if (changes.length === 0) {
      out.push('No value differs from last year.');
    } else {
      out.push(`| Value | ${year - 1} | ${year} | Change |`, '| --- | --- | --- | --- |');
      for (const c of changes) {
        out.push(
          `| ${c.path} | ${show(c.previous)} | ${show(c.next)} | ${formatPercentChange(c.pct)} |`,
        );
      }
    }

    out.push('', '## Carried forward', '');
    if (carried.length === 0) out.push('Nothing was carried forward.');
    for (const key of carried) {
      out.push(`- ${labelOf(key)} (${key}): ${decisions[key].reasons.join('; ')}`);
    }

    const kept = TAX_YEAR_FIELD_KEYS.filter((key) => decisions[key]?.origin === 'kept-from-draft');
    if (kept.length > 0) {
      out.push('', '## Kept from the existing draft', '');
      for (const key of kept)
        out.push(`- ${labelOf(key)} (${key}): confirmed earlier, left as it was`);
    }

    out.push('', '## Rejected by checks', '');
    if (rejected.length === 0) out.push('Nothing was rejected.');
    for (const group of rejectedGroups(rejected, decisions)) {
      out.push(`- ${group.map(labelOf).join(', ')}`);
      for (const key of group) {
        out.push(`  - scraped ${key}: \`${JSON.stringify(decisions[key].scraped)}\``);
      }
      for (const reason of decisions[group[0]].reasons) out.push(`  - ${reason}`);
    }

    const notes = TAX_YEAR_FIELD_KEYS.filter((key) => decisions[key]?.note);
    if (notes.length > 0) {
      out.push('', '## Notes', '');
      for (const key of notes) out.push(`- ${key}: ${decisions[key].note}`);
    }

    out.push('', '## Sources used', '');
    for (const source of file.sources) out.push(`- ${source}`);
  }

  out.push('', '## Page fetch errors', '');
  if (fetchErrors.length === 0) out.push('Every page was fetched.');
  for (const e of fetchErrors) out.push(`- ${e.page} (${e.url}): ${e.message}`);

  if (checks.length > 0 && file) {
    out.push('', '## Checks', '');
    for (const check of checks) {
      out.push(`- ${check.keys.join(' + ')}: ${check.ok ? 'passed' : 'failed'}`);
    }
  }

  return `${out.join('\n')}\n`;
}
