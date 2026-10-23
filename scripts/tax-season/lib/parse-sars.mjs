// Reads the SARS pages with cheerio and returns the tax-year values the scout can confirm.
// Loaded after register-ts.mjs (or inside Vitest), which is why the .ts import works.
//
// Rules this file follows:
//  - An extractor returns a value or null. It never throws on a missing section and never guesses:
//    a pattern that is absent, or that finds two different values, gives null and the scout carries
//    the field forward from last year instead.
//  - Every table is found by what it says (row labels, year headings), not by its position.
import * as cheerio from 'cheerio';

import { taxYearPeriod } from '../../../src/app/core/data/tax-calendar.ts';
import { norm, parsePercent, parseRand, splitRange } from './text.mjs';

const UNCHANGED = 'table (unchanged per SARS)';

const MARKER = /^(\d{4}) tax year \(/;
const MARKER_ANYWHERE = /\b\d{4} tax year \(/g;
// Longer text is page prose, not a heading line such as "2027 tax year (...) - No changes".
const MARKER_MAX_LENGTH = 250;

const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

// "R" and an amount written with spaces as thousands separators: 17 712 or 17712.
const RAND = String.raw`R\s?(\d+(?: \d{3})*)`;

const toInt = (text) => Number(text.replace(/ /g, ''));

// ---------------------------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------------------------

/** A parsed page with lazily built text and table records. */
function openPage(html) {
  const $ = cheerio.load(html);
  // Without these spaces neighbouring blocks would run together ("R2000" + "2026" -> "R20002026").
  $('br').replaceWith(' ');
  $('p,div,li,h1,h2,h3,h4,tr,td,th').append(' ');
  let text = null;
  let records = null;
  return {
    $,
    get text() {
      return (text ??= norm($.root().text()));
    },
    get records() {
      return (records ??= collectTableRecords($));
    },
  };
}

/**
 * Walks the page in document order and pairs every table with the year headings that sit above
 * it. SARS puts a table below the newest year it applies to and gives the older years that did
 * not change only a heading marked "No changes". Tables are often inside wrapper divs rather than
 * next to their heading, so document order is the only reliable relationship.
 *
 * Rule T: of the headings waiting for a table, the last one claims it; a heading above it claims
 * it too when it and every heading between them are marked "No changes".
 *
 * Returns `[{ group, claims: Map<year, unchangedPerSars>, table }]`. `group` is the text of the
 * last heading that is not a year heading ("Tax Rebates"), or null before the first one.
 */
function collectTableRecords($) {
  const tokens = [];
  const accepted = new Set();

  $('h2,h3,h4,p,div,li,table').each((_, element) => {
    const $element = $(element);
    if (
      $element
        .parents()
        .toArray()
        .some((parent) => accepted.has(parent))
    )
      return;

    if (element.name === 'table') {
      if ($element.parents('table').length === 0) tokens.push({ type: 'table', table: $element });
      return;
    }
    // A wrapper around a table: its children are visited on their own.
    if ($element.find('table').length > 0) return;

    const text = norm($element.text());
    if (!text) return;

    const marker = MARKER.exec(text);
    const yearHeadings = text.match(MARKER_ANYWHERE) ?? [];
    if (marker && text.length <= MARKER_MAX_LENGTH && yearHeadings.length === 1) {
      accepted.add(element);
      tokens.push({
        type: 'marker',
        year: Number(marker[1]),
        noChanges: /no changes/i.test(text),
      });
      return;
    }
    if (/^h[234]$/.test(element.name)) {
      tokens.push({ type: 'group', text });
      return;
    }
    // "12 March 2025 - No changes" sits in its own line under a heading.
    if ((element.name === 'p' || element.name === 'li') && text.length <= MARKER_MAX_LENGTH) {
      if (/no changes/i.test(text)) tokens.push({ type: 'note' });
    }
  });

  const records = [];
  let group = null;
  let waiting = [];
  for (const token of tokens) {
    if (token.type === 'group') {
      group = token.text;
      waiting = [];
    } else if (token.type === 'marker') {
      waiting.push({ year: token.year, noChanges: token.noChanges });
    } else if (token.type === 'note') {
      if (waiting.length > 0) waiting[waiting.length - 1].noChanges = true;
    } else {
      const claims = new Map();
      if (waiting.length > 0) {
        const last = waiting[waiting.length - 1];
        claims.set(last.year, last.noChanges);
        for (let i = waiting.length - 2; i >= 0 && waiting[i].noChanges; i--) {
          claims.set(waiting[i].year, true);
        }
      }
      records.push({ group, claims, table: token.table });
      waiting = [];
    }
  }
  return records;
}

// ---------------------------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------------------------

/** Every cell's normalised text, row by row. */
function tableRows($, table) {
  return $(table)
    .find('tr')
    .toArray()
    .map((row) =>
      $(row)
        .children('td,th')
        .toArray()
        .map((cell) => norm($(cell).text())),
    );
}

// "45 900 + 26% of taxable income above 255 000", "18% of taxable income above 27 500",
// "0% of taxable income" and "0%".
const TAX_TEXT = new RegExp(
  String.raw`^(?:R?\s*(\d+(?: \d+)*)\s*\+\s*)?(\d+(?:[.,]\d+)?)\s*%` +
    String.raw`(?:\s+of taxable income(?:\s+above\s+R?\s*(\d+(?: \d+)*))?)?$`,
  'i',
);

function parseBracketRow(cells, isFirst) {
  if (cells.length !== 2) return null;
  const [rangeText, taxText] = cells;

  let start;
  let upTo;
  const open = /^R?\s*(\d+(?: \d+)*)\s+and above$/i.exec(rangeText);
  if (open) {
    start = toInt(open[1]);
    upTo = null;
  } else {
    const range = splitRange(rangeText);
    if (!range) return null;
    [start, upTo] = range;
  }

  const tax = TAX_TEXT.exec(taxText);
  if (!tax) return null;
  const rate = parsePercent(`${tax[2]}%`);
  const base = tax[1] === undefined ? 0 : toInt(tax[1]);

  let above;
  if (tax[3] !== undefined) above = toInt(tax[3]);
  else if (isFirst) above = 0;
  else return null;

  // "245 101 - 383 100" must follow "above 245 100"; anything else is a misread table.
  if (rate === null || start - 1 !== above) return null;
  return { above, upTo, base, rate };
}

/** Bracket rows of one table, or null when any row does not read cleanly. */
function parseBracketTable($, table) {
  const bodyRows = $(table)
    .find('tr')
    .toArray()
    .filter((row) => $(row).find('th').length === 0)
    .map((row) =>
      $(row)
        .children('td')
        .toArray()
        .map((cell) => norm($(cell).text())),
    )
    .filter((cells) => cells.length > 0);
  if (bodyRows.length < 2) return null;

  const rows = [];
  for (const [i, cells] of bodyRows.entries()) {
    const row = parseBracketRow(cells, i === 0);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

/** The bracket table for `year` in a group of the page (rule T), as `{ value, how }`. */
function bracketsFor(page, year, inGroup) {
  for (const record of page.records) {
    if (!inGroup(record.group) || !record.claims.has(year)) continue;
    const rows = parseBracketTable(page.$, record.table);
    if (!rows) return null;
    return { value: rows, how: record.claims.get(year) ? UNCHANGED : 'table' };
  }
  return null;
}

/**
 * Values from a table with one column per tax year. The table is the first one whose first
 * column has a row for every label; the column is the one headed by the year in its first two
 * rows. Returns the amounts in label order, or null.
 */
function columnYearValues(page, year, labels) {
  for (const table of page.$('table').toArray()) {
    const rows = tableRows(page.$, table);
    const labelled = labels.map((label) => rows.find((cells) => label.test(cells[0] ?? '')));
    if (labelled.some((row) => row === undefined)) continue;

    let column = -1;
    for (const cells of rows.slice(0, 2)) {
      const index = cells.indexOf(String(year));
      if (index > 0) {
        column = index;
        break;
      }
    }
    if (column < 0) continue;

    const values = labelled.map((cells) => parseRand(cells[column] ?? ''));
    return values.some((value) => value === null) ? null : values;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Prose
// ---------------------------------------------------------------------------------------------

/**
 * The one value `pattern` finds in `text`. Null when it finds nothing or two different values,
 * because an ambiguous page is not something to guess about.
 */
function onlyValue(text, pattern, convert = (match) => match[1]) {
  const found = new Set();
  for (const match of text.matchAll(new RegExp(pattern.source, 'g'))) {
    const value = convert(match);
    if (value === null || value === undefined || Number.isNaN(value)) return null;
    found.add(value);
  }
  return found.size === 1 ? [...found][0] : null;
}

const percentValue = (match) => parsePercent(`${match[1]}%`);
const randValue = (match) => toInt(match[1]);

// ---------------------------------------------------------------------------------------------
// Field extractors: (page, year) -> { value, how, note? } | null
// ---------------------------------------------------------------------------------------------

const rebates = (page, year) => {
  const values = columnYearValues(page, year, [/^Primary/i, /^Secondary/i, /^Tertiary/i]);
  if (!values) return null;
  const [primary, secondary, tertiary] = values;
  return { value: { primary, secondary, tertiary }, how: 'table' };
};

const thresholds = (page, year) => {
  const values = columnYearValues(page, year, [/^Under 65/i, /^65 and older/i, /^75 and older/i]);
  if (!values) return null;
  const [under65, age65to74, age75plus] = values;
  return { value: { under65, age65to74, age75plus }, how: 'table' };
};

const medicalCredits = (page, year) => {
  const values = columnYearValues(page, year, [
    /^For the taxpayer;/i,
    /^For the taxpayer and one dependant/i,
    /^For each additional dependant/i,
  ]);
  if (!values) return null;
  const [mainMember, withTaxpayerAndOne, additionalDependant] = values;
  // SARS publishes the combined figure for the taxpayer plus one dependant.
  const firstDependant = withTaxpayerAndOne - mainMember;
  if (firstDependant < 0) return null;
  return {
    value: { mainMember, firstDependant, additionalDependant },
    how: 'table',
    note: 'firstDependant derived: the taxpayer plus one dependant row minus the taxpayer row',
  };
};

const interestExemption = (page, year) => {
  const values = columnYearValues(page, year, [
    /^Person younger than 65/i,
    /^Person 65 and older/i,
  ]);
  if (!values) return null;
  const [under65, age65plus] = values;
  return { value: { under65, age65plus }, how: 'table' };
};

const uif = (page, year) => {
  const employeeRate = onlyValue(
    page.text,
    /must be (\d+(?:\.\d+)?)% of the remuneration/,
    percentValue,
  );
  if (employeeRate === null) return null;

  // The ceiling in force is the latest one that took effect by the end of the tax year.
  const periodEnd = taxYearPeriod(year).end;
  const entries = [];
  for (const match of page.text.matchAll(
    new RegExp(
      String.raw`With effect from (\d{1,2}) (\w+) (\d{4}) [\u2013-] ${RAND} per month`,
      'g',
    ),
  )) {
    const month = MONTHS[match[2].toLowerCase()];
    if (!month) return null;
    const date = `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    if (date <= periodEnd) entries.push({ date, amount: toInt(match[4]) });
  }
  if (entries.length === 0) return null;
  const latest = entries.reduce((a, b) => (b.date > a.date ? b : a)).date;
  const amounts = new Set(entries.filter((e) => e.date === latest).map((e) => e.amount));
  if (amounts.size !== 1) return null;

  return { value: { employeeRate, monthlyEarningsCeiling: [...amounts][0] }, how: 'prose' };
};

const tfsa = (page, year) => {
  // The illustration table lists one row per year: year | invested this year | accumulated.
  const limits = new Set();
  for (const table of page.$('table').toArray()) {
    for (const cells of tableRows(page.$, table)) {
      if (cells[0] === String(year)) limits.add(parseRand(cells[1] ?? ''));
    }
  }
  if (limits.size !== 1 || limits.has(null)) return null;

  const lifetimeLimit = onlyValue(
    page.text,
    new RegExp(String.raw`lifetime limit (?:of |\()${RAND}`),
    randValue,
  );
  const excessPenaltyRate = onlyValue(
    page.text,
    /penalty[^.]{0,80}?of (\d+(?:\.\d+)?)%/,
    percentValue,
  );
  if (lifetimeLimit === null || excessPenaltyRate === null) return null;

  return { value: { annualLimit: [...limits][0], lifetimeLimit, excessPenaltyRate }, how: 'prose' };
};

const twoPot = (page) => {
  if (!/One-third of the member/.test(page.text)) return null;
  const minimumWithdrawal = onlyValue(page.text, new RegExp(`minimum of ${RAND}`), randValue);
  if (minimumWithdrawal === null || !/once every tax year/.test(page.text)) return null;
  return {
    value: {
      savingsShare: 1 / 3,
      // Written as 2/3 (not 1 - 1/3) so it equals the shipped value exactly.
      retirementShare: 2 / 3,
      minimumWithdrawal,
      withdrawalsPerTaxYear: 1,
    },
    how: 'prose',
  };
};

const annuitisationDeMinimis = (page, year) => {
  // The page lists each increase "from 1 March <year>"; only the one for this tax year counts.
  const pattern = new RegExp(String.raw`equal or less than ${RAND} from 1 March (\d{4})`, 'g');
  const amounts = new Set();
  for (const match of page.text.matchAll(pattern)) {
    if (Number(match[2]) === year - 1) amounts.add(toInt(match[1]));
  }
  return amounts.size === 1 ? { value: [...amounts][0], how: 'prose' } : null;
};

const dividendsWithholdingRate = (page) => {
  const rate = onlyValue(
    page.text,
    /Dividends Tax increased from \d+(?:\.\d+)?% to (\d+(?:\.\d+)?)%/,
    percentValue,
  );
  return rate === null ? null : { value: rate, how: 'prose' };
};

/** Field -> the SARS page it is read from and how. */
const EXTRACTORS = {
  incomeTaxBrackets: {
    page: 'individuals',
    run: (page, year) => bracketsFor(page, year, (group) => group === null),
  },
  rebates: { page: 'individuals', run: rebates },
  thresholds: { page: 'individuals', run: thresholds },
  medicalCredits: { page: 'medicalCredits', run: medicalCredits },
  uif: { page: 'uif', run: uif },
  tfsa: { page: 'tfsa', run: tfsa },
  retirementLumpSum: {
    page: 'retirementLumpSum',
    run: (page, year) =>
      bracketsFor(page, year, (group) => /retirement fund lump sum benefits/i.test(group ?? '')),
  },
  withdrawalLumpSum: {
    page: 'retirementLumpSum',
    run: (page, year) => bracketsFor(page, year, (group) => /withdrawal/i.test(group ?? '')),
  },
  twoPot: { page: 'twoPot', run: twoPot },
  annuitisationDeMinimis: { page: 'annuitisation', run: annuitisationDeMinimis },
  interestExemption: { page: 'interestAndDividends', run: interestExemption },
  dividendsWithholdingRate: { page: 'dividendsTax', run: dividendsWithholdingRate },
};

/*
 * Fields with no extractor. The scout carries them forward from last year (draft status) until a
 * person confirms them. To add a source for one of them:
 *   1. add the page URL under "sars" in sources.json,
 *   2. write an extractor above and register it in EXTRACTORS,
 *   3. add a fixture page and a spec for it.
 */
export const NO_HTML_SOURCE = {
  // The rate and cap are only in the Budget tax guide PDF. The HTML FAQ still says R350 000, so
  // scraping it would put an out-of-date figure into the file.
  retirementDeduction:
    'no HTML source: the rate and cap are only in the Budget tax guide PDF (the SARS FAQ page still shows an old cap)',
  // The 2.5% and 17.5% limits are only in a gov.za PDF.
  livingAnnuityDrawdown: 'no HTML source: the drawdown limits are only in a gov.za PDF',
  // Only in the Budget tax guide PDF.
  earliestRaRetirementAge: 'no HTML source: only in the Budget tax guide PDF',
  // The CGT page states the annual exclusion but no inclusion rate (it only lists effective
  // rates). The field is one unit, so without the inclusion rate it is not scraped at all.
  cgt: 'no HTML source: the CGT page shows the annual exclusion but no inclusion rate',
};

/** Field key -> the key of the SARS page it is read from (for reports). */
export const FIELD_PAGES = Object.fromEntries(
  Object.entries(EXTRACTORS).map(([key, { page }]) => [key, page]),
);

/**
 * Reads every field it can from the fetched pages for tax year `year`.
 *
 * `pagesByKey` maps a `sources.sars` key to its HTML (a page that failed to download is simply
 * absent). `sourceUrls` is `sources.sars`, used for each value's `source`.
 *
 * Returns `{ extracted, notes }`. `extracted[field]` is `{ value, source, how, note? }` for the
 * fields that were found; every other field has an entry in `notes` (`{ key, reason }`).
 * Never throws.
 */
export function extractAll(pagesByKey, year, sourceUrls = {}) {
  const extracted = {};
  const notes = [];
  const pages = new Map();
  const open = (key) => {
    if (!pages.has(key)) {
      let page = null;
      try {
        if (typeof pagesByKey[key] === 'string') page = openPage(pagesByKey[key]);
      } catch {
        page = null;
      }
      pages.set(key, page);
    }
    return pages.get(key);
  };

  for (const [key, { page: pageKey, run }] of Object.entries(EXTRACTORS)) {
    const page = open(pageKey);
    if (!page) {
      notes.push({ key, reason: 'page not fetched' });
      continue;
    }
    let result = null;
    try {
      result = run(page, year);
    } catch {
      result = null;
    }
    if (!result) {
      notes.push({ key, reason: `not found on the page for tax year ${year}` });
      continue;
    }
    extracted[key] = {
      value: result.value,
      source: sourceUrls[pageKey] ?? pageKey,
      how: result.how,
      ...(result.note ? { note: result.note } : {}),
    };
  }

  for (const [key, reason] of Object.entries(NO_HTML_SOURCE)) notes.push({ key, reason });
  return { extracted, notes };
}
