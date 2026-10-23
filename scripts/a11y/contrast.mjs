// WCAG contrast measurement for the design tokens in src/styles/_tokens.scss.
//
// Pure functions are exported for scripts/a11y/__tests__/contrast.spec.mjs. Run
// `node scripts/a11y/contrast.mjs` to print every measured pair in both themes.
//
// Deliberate exemptions (do not add them to PAIRS):
// - --rw-color-track (unfilled slider, progress and ring tracks) is decorative. The value it
//   frames is always also given as text (number input, "x% used", progress text), and the fill
//   is measured against it by the chart colours below.
// - --rw-chart-grid and the --rw-chart-area* fills are decorative too.
// - Glass borders (--rw-color-border-glass) only decorate card edges. Control boundaries use
//   --rw-color-border-control instead.
// - A rw-card variant="dark" must not hold links, buttons or inputs, and no chart may sit on
//   it: in the light theme the focus ring measures 1.21:1 there and the light chart colours
//   fall under 3:1. The spec scans templates for this.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TOKENS_PATH = fileURLToPath(new URL('../../src/styles/_tokens.scss', import.meta.url));

/** Index of the brace that closes the block opened at `open` (brace-aware, skips comments). */
function closingBrace(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source.startsWith('//', i)) {
      i = source.indexOf('\n', i);
      if (i === -1) break;
    } else if (source[i] === '{') {
      depth += 1;
    } else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('Unbalanced braces in tokens file');
}

/** Custom properties declared directly in a block body; nested blocks (@include etc.) are skipped. */
function declarations(body) {
  const out = {};
  let depth = 0;
  let statement = '';
  const flush = () => {
    const match = /^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(statement);
    if (match) out[match[1]] = match[2].replace(/\s+/g, ' ');
    statement = '';
  };
  for (let i = 0; i < body.length; i += 1) {
    if (body.startsWith('//', i)) {
      const end = body.indexOf('\n', i);
      i = end === -1 ? body.length : end;
    } else if (body[i] === '{') {
      depth += 1;
      statement = '';
    } else if (body[i] === '}') {
      depth -= 1;
      statement = '';
    } else if (depth === 0 && body[i] === ';') {
      flush();
    } else if (depth === 0) {
      statement += body[i];
    }
  }
  return out;
}

/** Raw custom properties per theme. Dark inherits every light token it does not override. */
export function parseTokens(raw) {
  // Drop comments first so a selector or brace mentioned in one cannot be mistaken for code.
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const read = (selector) => {
    const start = source.indexOf(`${selector} {`);
    if (start === -1) throw new Error(`Missing ${selector} block`);
    const open = source.indexOf('{', start);
    return declarations(source.slice(open + 1, closingBrace(source, open)));
  };
  const light = read(':root');
  const dark = { ...light, ...read("[data-theme='dark']") };
  return { light, dark };
}

export function readTokens(path = TOKENS_PATH) {
  return parseTokens(readFileSync(path, 'utf8'));
}

/** Parses #rgb, #rrggbb, rgb(r g b / a%) and transparent into { r, g, b, a } (0..255, a 0..1). */
export function parseColor(value) {
  const text = value.trim().toLowerCase();
  if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:\s*[/,]\s*([\d.]+)(%?))?\s*\)$/.exec(text);
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : rgb[5] ? Number(rgb[4]) / 100 : Number(rgb[4]);
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: alpha };
  }
  throw new Error(`Unsupported colour: ${value}`);
}

/** Source-over compositing of `top` onto an opaque `bottom`. */
export function composite(top, bottom) {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

export function relativeLuminance({ r, g, b }) {
  const channel = (value) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export const HERO_MUTED_GUARD = 'hero-muted';
const TEXT = 4.5;
const NON_TEXT = 3;
const STATUSES = ['success', 'warning', 'danger'];
const CHARTS = ['accent', 'sun', 'sky', 'rose', 'violet', 'muted'];

/**
 * Surfaces a token can sit on. `glass` is the translucent card surface composited over each end
 * of the page gradient, because the real backdrop varies between the two.
 */
function surfaces(theme) {
  const colour = (name) => parseColor(theme[name]);
  const start = colour('--rw-color-bg-start');
  const end = colour('--rw-color-bg-end');
  const glass = colour('--rw-color-surface-glass');
  return {
    solid: colour('--rw-color-surface-solid'),
    'bg-start': start,
    'bg-end': end,
    'glass/bg-start': composite(glass, start),
    'glass/bg-end': composite(glass, end),
  };
}

/** Every measured pair for one theme as { name, fg, bg, ratio, min }. */
export function measureTheme(theme) {
  const colour = (name) => parseColor(theme[name]);
  const pages = surfaces(theme);
  const rows = [];
  const add = (name, fg, bgName, bg, min, guard) => {
    rows.push({ name, bg: bgName, ratio: contrastRatio(parseColor(fg), bg), min, guard });
  };
  const ratioOf = (token) => colour(token);

  for (const [surface, bg] of Object.entries(pages)) {
    add('text', theme['--rw-color-text'], surface, bg, TEXT);
    add('text-muted', theme['--rw-color-text-muted'], surface, bg, TEXT);
    add('accent (text)', theme['--rw-color-accent'], surface, bg, TEXT);
    add('border-control', theme['--rw-color-border-control'], surface, bg, NON_TEXT);
    add('focus ring', theme['--rw-color-focus'], surface, bg, NON_TEXT);
  }
  for (const key of CHARTS) {
    for (const [surface, bg] of Object.entries(pages)) {
      add(`chart-${key}`, theme[`--rw-chart-${key}`], surface, bg, NON_TEXT);
    }
  }
  // Accent text sits on the soft accent wash (selected chips, active nav item).
  const accentSoft = composite(colour('--rw-color-accent-soft'), pages.solid);
  add('accent on accent-soft', theme['--rw-color-accent'], 'accent-soft/solid', accentSoft, TEXT);

  const pair = (name, fgToken, bgToken, min, guard) => {
    add(name, theme[fgToken], bgToken.replace('--rw-color-', ''), ratioOf(bgToken), min, guard);
  };
  pair('on-ink', '--rw-color-on-ink', '--rw-color-ink', TEXT);
  pair('on-hero', '--rw-color-on-hero', '--rw-color-hero', TEXT);
  pair('on-hero', '--rw-color-on-hero', '--rw-color-hero-end', TEXT);
  // Muted text is dimmer than on-hero and can miss 4.5:1 on the dark hero. No muted text sits in a
  // hero card, so these rows are enforced by a template scan (guard) instead of a ratio.
  pair('text-muted', '--rw-color-text-muted', '--rw-color-hero', TEXT, HERO_MUTED_GUARD);
  pair('text-muted', '--rw-color-text-muted', '--rw-color-hero-end', TEXT, HERO_MUTED_GUARD);
  pair('on-card-dark', '--rw-color-on-card-dark', '--rw-color-card-dark', TEXT);
  // The dashboard privacy copy is on-card-dark at opacity 0.85.
  const cardDark = colour('--rw-color-card-dark');
  const dimmed = composite({ ...colour('--rw-color-on-card-dark'), a: 0.85 }, cardDark);
  add(
    'on-card-dark at 85% opacity',
    `rgb(${Math.round(dimmed.r)} ${Math.round(dimmed.g)} ${Math.round(dimmed.b)})`,
    'card-dark',
    cardDark,
    TEXT,
  );
  pair('focus ring', '--rw-color-focus', '--rw-color-hero', NON_TEXT);
  pair('focus ring', '--rw-color-focus', '--rw-color-hero-end', NON_TEXT);
  for (const tone of STATUSES) {
    const surface = `--rw-color-${tone}-surface`;
    pair(`${tone} text`, `--rw-color-${tone}-text`, surface, TEXT);
    pair(`${tone} border`, `--rw-color-${tone}-border`, surface, NON_TEXT);
  }
  return rows;
}

/** Measured rows for both themes, each tagged with its theme name. */
export function measureAll(tokens = readTokens()) {
  return ['light', 'dark'].flatMap((name) =>
    measureTheme(tokens[name]).map((row) => ({ theme: name, ...row })),
  );
}

/** Rows covered by a template scan instead of a ratio are reported but never count as failures. */
export function verdict(row) {
  if (row.ratio >= row.min) return 'pass';
  return row.guard ? `scan-guarded (${row.guard})` : 'FAIL';
}

export function failures(rows) {
  return rows.filter((r) => r.ratio < r.min && !r.guard);
}

export function formatTable(rows) {
  const header =
    '| Theme | Pair | On | Ratio | Needs | Result |\n| --- | --- | --- | --- | --- | --- |';
  const lines = rows.map(
    (r) =>
      `| ${r.theme} | ${r.name} | ${r.bg} | ${r.ratio.toFixed(2)} | ${r.min}:1 | ${verdict(r)} |`,
  );
  return `${header}\n${lines.join('\n')}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rows = measureAll();
  console.log(formatTable(rows));
  const failing = failures(rows).length;
  console.log(`\n${rows.length} pairs measured, ${failing} below their minimum.`);
  process.exitCode = failing === 0 ? 0 : 1;
}
