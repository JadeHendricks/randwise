import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PlanBuilderStore } from './core/plan/plan-builder.store';
import { FakeMatchMedia, installFakeMatchMedia } from './testing/fake-match-media';
import { provideTestData } from './testing/tax-data-fixtures';
import { App } from './app';
import { routes } from './app.routes';

// Structure checks for the whole app: landmarks, headings, accessible names and ARIA references.
// jsdom has no layout or CSS, so colour, focus rings and tab order are covered by the contrast
// spec (scripts/a11y) and the browser audit instead.

const ROUTES = routes.filter((route) => route.path !== '**');

/** Text a screen reader would read for a node: skips hidden and aria-hidden subtrees. */
function readableText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof Element)) return '';
  if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return '';
  const label = node.getAttribute('aria-label')?.trim();
  if (label) return label;
  if (node instanceof HTMLImageElement) return node.alt;
  return Array.from(node.childNodes).map(readableText).join(' ');
}

function idsOf(attribute: string | null): string[] {
  return (attribute ?? '').split(/\s+/).filter(Boolean);
}

function accessibleName(el: Element): string {
  const doc = el.ownerDocument;
  const labelledby = idsOf(el.getAttribute('aria-labelledby'))
    .map((id) => doc.getElementById(id))
    .filter((target): target is HTMLElement => target !== null)
    .map(readableText)
    .join(' ')
    .trim();
  if (labelledby) return labelledby;
  const label = el.getAttribute('aria-label')?.trim();
  if (label) return label;
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  ) {
    const fromLabels = Array.from(el.labels ?? [])
      .map((l) => {
        // The control's own value or options must not count as its label.
        const clone = l.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('input, select, textarea').forEach((inner) => inner.remove());
        return readableText(clone);
      })
      .join(' ')
      .trim();
    return fromLabels || (el.getAttribute('title')?.trim() ?? '');
  }
  const text = readableText(el).replace(/\s+/g, ' ').trim();
  return text || (el.getAttribute('title')?.trim() ?? '');
}

/** Elements that are not exposed because they, or an ancestor, carry the hidden attribute. */
function exposed<T extends Element>(root: ParentNode, selector: string): T[] {
  return Array.from(root.querySelectorAll<T>(selector)).filter(
    (el) => !el.closest('[hidden], [aria-hidden="true"]'),
  );
}

function describe_(el: Element): string {
  const classes = el.getAttribute('class')?.split(/\s+/)[0];
  return `<${el.tagName.toLowerCase()}${classes ? `.${classes}` : ''}>`;
}

/** Every structural problem found in the rendered app, as readable lines. */
function problems(root: HTMLElement, heading: string): string[] {
  const found: string[] = [];
  const report = (message: string) => found.push(message);

  const h1 = Array.from(root.querySelectorAll('h1'));
  if (h1.length !== 1) report(`expected one h1, found ${h1.length}`);
  else if (h1[0].textContent?.trim() !== heading)
    report(`h1 is "${h1[0].textContent}", not "${heading}"`);

  const main = root.querySelector('main');
  const outsideMain = (selector: string) =>
    Array.from(root.querySelectorAll(selector)).filter((el) => !el.closest('main'));
  if (root.querySelectorAll('main').length !== 1) report('expected exactly one main');
  if (outsideMain('header').length !== 1) report('expected exactly one banner header');
  if (outsideMain('footer').length !== 1) report('expected exactly one footer');

  const navs = Array.from(root.querySelectorAll('nav'));
  if (navs.length === 0) report('no nav landmark');
  const navNames = navs.map((nav) => nav.getAttribute('aria-label')?.trim() ?? '');
  if (navNames.some((name) => !name)) report('a nav has no aria-label');
  if (new Set(navNames).size !== navNames.length) report(`nav labels are not unique: ${navNames}`);

  // A route that failed to load would pass every check below on an empty main.
  if (!main?.querySelector('h2, h3')) report('main has no content headings');

  // Headings inside main start at h2 (the page h1 is in the header) and never skip a level.
  let previous = 1;
  for (const el of exposed<HTMLElement>(main ?? root, 'h1, h2, h3, h4, h5, h6')) {
    const level = Number(el.tagName.slice(1));
    if (!el.textContent?.trim()) report(`empty heading ${describe_(el)}`);
    if (level > previous + 1)
      report(`heading skips from h${previous} to h${level}: "${el.textContent?.trim()}"`);
    previous = level;
  }

  for (const el of exposed(root, 'input:not([type=hidden]), select, textarea')) {
    if (!accessibleName(el)) report(`unnamed form control ${describe_(el)}`);
  }
  for (const el of exposed(root, 'button, a[href], summary, [role=button], [role=link]')) {
    if (!accessibleName(el)) report(`unnamed ${describe_(el)}: "${el.outerHTML.slice(0, 80)}"`);
  }
  for (const el of exposed(root, '[role=img]')) {
    if (!el.getAttribute('aria-label')?.trim()) report(`image without aria-label ${describe_(el)}`);
  }
  for (const el of exposed(root, '[role=region], [role=group], [role=radiogroup], table')) {
    const role = el.getAttribute('role');
    if (role === 'region' && !accessibleName(el)) report(`unnamed region ${describe_(el)}`);
    if (el instanceof HTMLTableElement && !el.querySelector('caption') && !accessibleName(el)) {
      report(`table without caption or name ${describe_(el)}`);
    }
  }
  for (const el of Array.from(root.querySelectorAll('[tabindex]'))) {
    if (Number(el.getAttribute('tabindex')) > 0) report(`positive tabindex on ${describe_(el)}`);
  }

  const seen = new Set<string>();
  for (const el of Array.from(root.querySelectorAll('[id]'))) {
    if (seen.has(el.id)) report(`duplicate id "${el.id}"`);
    seen.add(el.id);
  }
  for (const attribute of ['aria-describedby', 'aria-labelledby', 'aria-controls']) {
    for (const el of Array.from(root.querySelectorAll(`[${attribute}]`))) {
      for (const id of idsOf(el.getAttribute(attribute))) {
        if (!root.ownerDocument.getElementById(id)) {
          report(`${attribute}="${id}" on ${describe_(el)} points at nothing`);
        }
      }
    }
  }

  // A chart is either a named image or sits beside a data table with the same numbers.
  for (const chart of Array.from(
    root.querySelectorAll('rw-line-chart, rw-breakdown-bar, rw-ring-gauge, rw-dot-matrix'),
  )) {
    const named = chart.querySelector('[role=img][aria-label]');
    const label = named?.getAttribute('aria-label')?.trim();
    if (!label && !chart.querySelector('table')) {
      report(`chart ${chart.tagName.toLowerCase()} has no text alternative`);
    }
  }
  return found;
}

describe('App accessibility structure', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideTestData({ today: '2026-10-22' }),
      ],
    });
  });

  afterEach(() => {
    fake.uninstall();
    document.documentElement.removeAttribute('data-theme');
  });

  async function open(url: string) {
    const fixture = TestBed.createComponent(App);
    const root = fixture.nativeElement as HTMLElement;
    // Attached so label lookups and id references resolve like in a browser.
    document.body.appendChild(root);
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
    return { fixture, root };
  }

  afterEach(() => document.body.replaceChildren());

  for (const route of ROUTES) {
    const url = `/${route.path}`;
    const heading = (route.data?.['heading'] as string) ?? 'Dashboard';

    it(`${url || '/'} has landmarks, one h1, named controls and valid references`, async () => {
      const { root } = await open(url);
      expect(problems(root, heading)).toEqual([]);
    });
  }

  it('the Plan summary keeps the same structure', async () => {
    TestBed.inject(PlanBuilderStore).update({ goal: 'pay-less-tax', surplusMonthly: 10_000 });
    TestBed.inject(PlanBuilderStore).finish();
    const { root } = await open('/plan');
    expect(root.querySelector('rw-plan-summary')).not.toBeNull();
    expect(problems(root, 'Plan')).toEqual([]);
  });

  it('reports a missing accessible name (the checks can fail)', async () => {
    const { root } = await open('/pay');
    const input = document.createElement('input');
    input.type = 'text';
    root.querySelector('main')!.appendChild(input);
    expect(problems(root, 'Pay')).toContain('unnamed form control <input>');
  });

  it('every route has a unique heading', () => {
    const headings = ROUTES.map((route) => route.data?.['heading']);
    expect(new Set(headings).size).toBe(headings.length);
    expect(ROUTES).toHaveLength(12);
  });
});
