import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HERO_MUTED_GUARD,
  composite,
  contrastRatio,
  failures,
  measureAll,
  parseColor,
  parseTokens,
  readTokens,
  relativeLuminance,
} from '../contrast.mjs';

const SRC = fileURLToPath(new URL('../../../src', import.meta.url));

function walk(dir, accept) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path, accept);
    return accept(path) ? [path] : [];
  });
}

describe('contrast maths', () => {
  it('matches the WCAG reference ratios', () => {
    expect(contrastRatio(parseColor('#000'), parseColor('#fff'))).toBeCloseTo(21, 5);
    expect(contrastRatio(parseColor('#fff'), parseColor('#fff'))).toBeCloseTo(1, 5);
    // #767676 on white is the classic 4.54:1 boundary.
    expect(contrastRatio(parseColor('#767676'), parseColor('#fff'))).toBeCloseTo(4.54, 2);
    expect(relativeLuminance(parseColor('#fff'))).toBeCloseTo(1, 5);
  });

  it('parses hex, short hex, rgb with percent alpha and transparent', () => {
    expect(parseColor('#0f1a15')).toEqual({ r: 15, g: 26, b: 21, a: 1 });
    expect(parseColor('#111')).toEqual({ r: 17, g: 17, b: 17, a: 1 });
    expect(parseColor('rgb(255 255 255 / 55%)')).toEqual({ r: 255, g: 255, b: 255, a: 0.55 });
    expect(parseColor('transparent').a).toBe(0);
    expect(() => parseColor('hsl(0 0% 0%)')).toThrow();
  });

  it('composites a translucent colour over an opaque one', () => {
    const out = composite({ r: 255, g: 255, b: 255, a: 0.5 }, { r: 0, g: 0, b: 0, a: 1 });
    expect(out.r).toBeCloseTo(127.5, 5);
  });
});

describe('token parser', () => {
  it('reads both theme blocks, ignores nested blocks and comments, and lets dark inherit', () => {
    const tokens = parseTokens(`
      // :root { --rw-color-fake: #000; }
      :root {
        --rw-color-text: #111; // trailing comment
        --rw-color-bg: #fff;
        @include foo { --rw-color-nested: #222; }
      }
      [data-theme='dark'] {
        --rw-color-text: #eee;
      }
    `);
    expect(tokens.light['--rw-color-text']).toBe('#111');
    expect(tokens.light['--rw-color-nested']).toBeUndefined();
    expect(tokens.light['--rw-color-fake']).toBeUndefined();
    expect(tokens.dark['--rw-color-text']).toBe('#eee');
    expect(tokens.dark['--rw-color-bg']).toBe('#fff');
  });
});

describe('design token contrast', () => {
  const rows = measureAll(readTokens());

  it('measures both themes', () => {
    expect(new Set(rows.map((r) => r.theme))).toEqual(new Set(['light', 'dark']));
  });

  it('covers the pairs the audit requires in both themes', () => {
    for (const theme of ['light', 'dark']) {
      const names = new Set(rows.filter((r) => r.theme === theme).map((r) => r.name));
      for (const name of [
        'text',
        'text-muted',
        'accent (text)',
        'on-ink',
        'on-hero',
        'on-card-dark',
        'border-control',
        'focus ring',
        'chart-accent',
        'chart-sun',
        'chart-sky',
        'chart-rose',
        'chart-violet',
        'chart-muted',
        'success text',
        'warning text',
        'danger text',
        'success border',
        'warning border',
        'danger border',
      ]) {
        expect(names.has(name), `${theme}: ${name}`).toBe(true);
      }
    }
  });

  for (const theme of ['light', 'dark']) {
    describe(`${theme} theme`, () => {
      const themeRows = rows.filter((r) => r.theme === theme && !r.guard);

      it('keeps text at 4.5:1 or better', () => {
        for (const r of themeRows.filter((row) => row.min === 4.5)) {
          expect(r.ratio, `${r.name} on ${r.bg}`).toBeGreaterThanOrEqual(4.5);
        }
      });

      // Control borders, focus ring, status borders and chart series (WCAG 1.4.11).
      it('keeps non-text parts at 3:1 or better', () => {
        for (const r of themeRows.filter((row) => row.min === 3)) {
          expect(r.ratio, `${r.name} on ${r.bg}`).toBeGreaterThanOrEqual(3);
        }
      });

      it('keeps the control border visible on every surface it can sit on', () => {
        const borders = themeRows.filter((r) => r.name === 'border-control');
        expect(borders.map((r) => r.bg).sort()).toEqual(
          ['bg-end', 'bg-start', 'glass/bg-end', 'glass/bg-start', 'solid'].sort(),
        );
      });
    });
  }

  it('reports no unguarded failure', () => {
    expect(failures(rows)).toEqual([]);
  });
});

describe('surfaces the token ratios do not cover', () => {
  const templates = walk(join(SRC, 'app'), (p) => /\.(html|ts)$/.test(p) && !p.endsWith('.spec.ts'))
    .map((path) => ({ path, text: readFileSync(path, 'utf8') }))
    .filter((f) => f.text.includes('<rw-card'));

  /** Markup of every <rw-card> opened with the given static variant, up to its closing tag. */
  function cardsOf(variant) {
    const found = [];
    for (const file of templates) {
      const open = new RegExp(`<rw-card\\b[^>]*\\bvariant="${variant}"[^>]*>`, 'g');
      for (const match of file.text.matchAll(open)) {
        const end = file.text.indexOf('</rw-card>', match.index);
        found.push({ path: file.path, markup: file.text.slice(match.index, end) });
      }
    }
    return found;
  }

  // The light-theme focus ring is 1.21:1 on the dark card and the light chart colours measure
  // 2.27:1 to 3.21:1 there, so nothing focusable and no chart may sit in one.
  it('keeps links, buttons, inputs and charts out of dark cards', () => {
    const dark = cardsOf('dark');
    expect(dark.length).toBeGreaterThan(0);
    const banned =
      /<(a|button|input|select|textarea|summary|rw-button|rw-amount-field|rw-segmented-control|rw-choice-list|rw-line-chart|rw-breakdown-bar|rw-ring-gauge|rw-dot-matrix)\b|routerLink|\(click\)|tabindex/;
    for (const card of dark) {
      expect(card.markup, card.path).not.toMatch(banned);
    }
  });

  // text-muted is 4.16:1 on the dark-theme hero, so the guarded rows above hold only while no
  // muted text sits in a hero card. Use --rw-color-on-hero there instead.
  it('keeps text-muted classes out of hero cards', () => {
    expect(HERO_MUTED_GUARD).toBe('hero-muted');
    const muted = new Set();
    const styles = walk(SRC, (p) => p.endsWith('.scss'));
    for (const path of styles) {
      const text = readFileSync(path, 'utf8');
      const block = /^\.([\w-]+)\s*\{/m.exec(text)?.[1];
      if (!block) continue;
      const rule = /((?:&__[\w-]+\s*,\s*)*&__[\w-]+)\s*\{([^{}]*)\}/g;
      for (const match of text.matchAll(rule)) {
        if (!match[2].includes('--rw-color-text-muted')) continue;
        for (const name of match[1].matchAll(/&__([\w-]+)/g)) muted.add(`${block}__${name[1]}`);
      }
    }
    expect(muted.size).toBeGreaterThan(5);
    const heroes = cardsOf('hero-yellow');
    expect(heroes.length).toBeGreaterThanOrEqual(9);
    for (const card of heroes) {
      const classes = [...card.markup.matchAll(/class="([^"]*)"/g)].flatMap((m) =>
        m[1].split(/\s+/),
      );
      expect(
        classes.filter((c) => muted.has(c)),
        card.path,
      ).toEqual([]);
    }
  });
});
