import { PRINT, TONE_COLOURS } from './pdf-theme';

type Attributes = Readonly<Record<string, string>>;

/**
 * Print styles per chart class. svg2pdf reads presentation attributes and the svg's own
 * `<style>`, not the page's stylesheets, so the on-page classes are translated here. Fixed light
 * colours keep the PDF the same whatever theme is active. Stroke widths are in viewBox units
 * because `vector-effect: non-scaling-stroke` is not supported by svg2pdf.
 */
const PRINT_STYLES: Readonly<Record<string, Attributes>> = {
  'rw-line-chart__grid': { stroke: PRINT.grid, 'stroke-width': '0.75' },
  'rw-line-chart__zero': { stroke: PRINT.muted, 'stroke-width': '1' },
  'rw-line-chart__area': { fill: PRINT.accent, 'fill-opacity': '0.16', stroke: 'none' },
  'rw-line-chart__area--secondary': { fill: PRINT.muted, 'fill-opacity': '0.2' },
  'rw-line-chart__line': { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
  'rw-line-chart__line--primary': { stroke: PRINT.accent, 'stroke-width': '3' },
  'rw-line-chart__line--secondary': {
    stroke: PRINT.muted,
    'stroke-width': '2',
    'stroke-dasharray': '6 6',
  },
  'rw-line-chart__guide': { stroke: PRINT.muted, 'stroke-width': '1', 'stroke-dasharray': '4 4' },
  'rw-line-chart__marker': { fill: PRINT.accent, stroke: PRINT.white, 'stroke-width': '2' },
  'rw-breakdown-bar__track': { fill: PRINT.track },
  'rw-breakdown-bar__segment': { stroke: PRINT.white, 'stroke-width': '0.3' },
  'rw-ring-gauge__track': { fill: 'none', stroke: PRINT.track, 'stroke-width': '10' },
  'rw-ring-gauge__value': { fill: 'none', 'stroke-width': '10' },
  ...Object.fromEntries(
    Object.entries(TONE_COLOURS).flatMap(([tone, colour]) => [
      [`rw-breakdown-bar__segment--${tone}`, { fill: colour }],
      [`rw-ring-gauge__value--${tone}`, { stroke: colour }],
    ]),
  ),
};

/** Attributes that only matter on screen (accessibility, CSS hooks), dropped from the clone. */
const STRIPPED = ['class', 'role', 'aria-label', 'style', 'vector-effect', 'focusable'];

/**
 * A deep clone of a chart svg with every on-page class replaced by print attributes. The page's
 * own svg is never touched. The ring's `pathLength="100"` dash is converted to absolute lengths
 * because svg2pdf does not honour `pathLength`.
 */
export function preparePrintSvg(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  for (const el of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
    for (const token of Array.from(el.classList)) {
      for (const [name, value] of Object.entries(PRINT_STYLES[token] ?? {})) {
        el.setAttribute(name, value);
      }
    }
    if (el.hasAttribute('pathLength')) {
      convertPathLengthDash(el);
    }
    for (const name of STRIPPED) el.removeAttribute(name);
  }
  // An explicit size lets svg2pdf lay the clone out without CSS (it is mounted unstyled).
  const box = (clone.getAttribute('viewBox') ?? '').trim().split(/\s+/).map(Number);
  if (box.length === 4 && box.every(Number.isFinite)) {
    clone.setAttribute('width', String(box[2]));
    clone.setAttribute('height', String(box[3]));
  }
  return clone;
}

function convertPathLengthDash(el: Element): void {
  const radius = Number(el.getAttribute('r'));
  const dash = Number((el.getAttribute('stroke-dasharray') ?? '').split(' ')[0]);
  if (Number.isFinite(radius) && radius > 0 && Number.isFinite(dash)) {
    const circumference = 2 * Math.PI * radius;
    const filled = (Math.min(100, Math.max(0, dash)) / 100) * circumference;
    el.setAttribute('stroke-dasharray', `${filled.toFixed(2)} ${circumference.toFixed(2)}`);
  }
  el.removeAttribute('pathLength');
}
