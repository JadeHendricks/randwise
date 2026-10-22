import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TODAY } from '../../core/data/data-source';
import { PlanContextStore } from '../../core/plan/plan-context.store';
import { FakeMatchMedia, installFakeMatchMedia } from '../../testing/fake-match-media';
import { provideTestData } from '../../testing/tax-data-fixtures';
import { normaliseSpaces } from '../../testing/text';
import { RaPage } from './ra-page';

// Pinned so the bundled 2027 file (status draft, checked 22 Oct 2026) is the year in use. The
// fixture UIF ceiling is fake, so money assertions use the bundled data, not provideTestData.
const TODAY_PINNED = new Date(2026, 9, 22);

describe('RaPage', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
  });
  afterEach(() => fake.uninstall());

  async function render(withData = true) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        withData
          ? { provide: TODAY, useValue: () => new Date(TODAY_PINNED) }
          : provideTestData({ taxYears: [], today: TODAY_PINNED }),
      ],
    });
    const fixture = TestBed.createComponent(RaPage);
    await fixture.whenStable();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  const text = (el: Element | null | undefined) => normaliseSpaces(el?.textContent);

  function stat(root: HTMLElement, label: string): HTMLElement {
    const card = Array.from(root.querySelectorAll<HTMLElement>('rw-stat-card')).find(
      (el) => text(el.querySelector('.rw-stat-card__label')) === label,
    );
    if (!card) throw new Error(`no stat card "${label}"`);
    return card;
  }
  const statMoney = (root: HTMLElement, label: string) =>
    text(stat(root, label).querySelector('.rw-money__figure'));

  function factOf(root: HTMLElement, label: string): Element {
    const item = Array.from(root.querySelectorAll('.ra__fact')).find(
      (el) => text(el.querySelector('dt')) === label,
    );
    if (!item) throw new Error(`no fact "${label}"`);
    return item;
  }
  const fact = (root: HTMLElement, label: string) =>
    text(factOf(root, label).querySelector('.rw-money__figure'));
  const factNote = (root: HTMLElement, label: string) =>
    text(factOf(root, label).querySelector('.ra__fact-note'));

  const heroNominal = (root: HTMLElement) =>
    text(root.querySelector('.ra__hero .rw-money--hero .rw-money__figure'));
  const heroReal = (root: HTMLElement) =>
    text(root.querySelector('.ra__hero .rw-money--md .rw-money__figure'));

  function field(root: HTMLElement, label: string): HTMLInputElement {
    const host = Array.from(root.querySelectorAll('rw-amount-field')).find(
      (el) => text(el.querySelector('label')) === label,
    );
    const input = host?.querySelector<HTMLInputElement>('input[type=number]');
    if (!input) throw new Error(`no field "${label}"`);
    return input;
  }

  async function type(fixture: ComponentFixture<RaPage>, label: string, value: number) {
    const input = field(fixture.nativeElement, label);
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  }

  function button(root: HTMLElement, label: string): HTMLButtonElement {
    const found = Array.from(root.querySelectorAll('button')).find((b) => text(b) === label);
    if (!found) throw new Error(`no button "${label}"`);
    return found;
  }

  const warnings = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('.ra__warning')).map((w) => text(w));

  it("shows the default example: R 1 940 113,55 at 55, R 804 454,23 in today's money", async () => {
    const { root } = await render();
    expect(text(root.querySelector('.ra__eyebrow'))).toBe('Projected RA balance at 55');
    expect(heroNominal(root)).toBe('R 1 940 113,55');
    expect(heroReal(root)).toBe('R 804 454,23');
    expect(text(root.querySelector('.ra__hero'))).toContain("in today's money");
    expect(text(root.querySelector('.ra__hero'))).toContain(
      'After 20 years at 9,5% a year with 4,5% inflation.',
    );
    expect(warnings(root)).toEqual([]);
  });

  it('shows headroom, tax saving and the growth split for the example', async () => {
    const { root } = await render();
    expect(fact(root, 'Limit this year')).toBe('R 99 000,00');
    expect(fact(root, 'Room after existing contributions')).toBe('R 99 000,00');
    expect(factNote(root, 'Room after existing contributions')).toBe('R 8 250,00 a month');
    expect(fact(root, 'Left after this RA')).toBe('R 75 000,00');
    expect(factNote(root, 'Left after this RA')).toBe('R 6 250,00 a month');
    expect(text(root.querySelector('.rw-ring-gauge__centre'))).toBe('24%');

    expect(statMoney(root, 'Tax saving')).toBe('R 6 240,00');
    expect(text(stat(root, 'Tax saving').querySelector('.rw-stat-card__secondary'))).toBe(
      'R 520,00 a month',
    );
    expect(statMoney(root, 'Cost after tax')).toBe('R 1 480,00');
    expect(text(stat(root, 'Marginal rate').querySelector('.rw-stat-card__text'))).toBe('26%');
    // The quick estimate matches the real saving, so there is nothing to explain.
    expect(root.querySelector('.ra__approx')).toBeNull();

    expect(fact(root, "Paid in (with today's balance)")).toBe('R 793 582,90');
    expect(fact(root, 'Investment growth')).toBe('R 1 146 530,66');
  });

  it('splits the balance into two pots, with nothing vested', async () => {
    const { root } = await render();
    const label = normaliseSpaces(
      root.querySelector('rw-breakdown-bar svg')?.getAttribute('aria-label'),
    );
    expect(label).toContain('Savings pot R 646 704,52');
    expect(label).toContain('Retirement pot R 1 293 409,04');
    expect(label).toContain("Vested pot (today's balance) R 0,00");
    const note = text(root.querySelector('.ra__card .ra__text:last-child'));
    expect(note).toContain(
      'New contributions go 33% to the savings pot and 67% to the retirement pot.',
    );
    expect(note).toContain('at most 1 withdrawal a tax year');
    expect(note).toContain('of at least R 2 000,00');
  });

  it('lists the first and last years of the year-by-year table', async () => {
    const { root } = await render();
    const rows = Array.from(root.querySelectorAll('.ra__table tbody tr')).map((tr) =>
      Array.from(tr.children).map((c) => text(c)),
    );
    expect(rows).toHaveLength(21);
    expect(rows[0]).toEqual(['35', 'R 0,00', 'R 0,00', 'R 0,00', 'R 0,00']);
    expect(rows[1][3]).toBe('R 25 027,88');
    expect(rows[1][4]).toBe('R 23 950,12');
    expect(rows[20][0]).toBe('55');
    expect(rows[20][3]).toBe('R 1 940 113,55');
    expect(rows[20][4]).toBe('R 804 454,23');
  });

  it('labels the defaults as an example that can be reset', async () => {
    const { fixture, root } = await render();
    expect(text(root.querySelector('.ra__inputs rw-chip'))).toBe('Example');
    expect(text(root.querySelector('.ra__intro'))).toBe(
      'This is an example: R2 000 a month on a R30 000 salary. Change any value; nothing is saved.',
    );
    await type(fixture, 'Extra RA contribution per month', 3000);
    expect(root.querySelector('.ra__intro')).toBeNull();
    expect(root.querySelector('.ra__inputs rw-chip')).toBeNull();
    button(root, 'Reset to example').click();
    await fixture.whenStable();
    expect(root.querySelector('.ra__intro')).not.toBeNull();
    expect(field(root, 'Extra RA contribution per month').value).toBe('2000');
  });

  it('takes return and inflation from the rates and says they can be changed', async () => {
    const { fixture, root } = await render();
    expect(field(root, 'Expected return per year').value).toBe('9.5');
    expect(field(root, 'Inflation per year').value).toBe('4.5');
    const block = text(root.querySelector('.ra__assumptions'));
    expect(block).toContain('CPI plus 5 percentage points');
    expect(block).toContain('repo rate (7.25%');
    expect(text(root.querySelector('.ra__block'))).toContain('Assumptions you can change');
    expect(button(root, 'Use growth return (9,5%)')).toBeTruthy();

    button(root, 'Use cash return (7,25%)').click();
    await fixture.whenStable();
    expect(field(root, 'Expected return per year').value).toBe('7.25');
    button(root, 'Use growth return (9,5%)').click();
    await fixture.whenStable();
    expect(field(root, 'Expected return per year').value).toBe('9.5');
  });

  it('updates the outputs when the salary and contribution change (S6: exactly at the limit)', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Gross pay per month', 40_000);
    await type(fixture, 'Extra RA contribution per month', 11_000);
    expect(statMoney(root, 'Tax saving')).toBe('R 39 165,00');
    expect(fact(root, 'Left after this RA')).toBe('R 0,00');
    expect(fact(root, 'Limit this year')).toBe('R 132 000,00');
    const approx = text(root.querySelector('.ra__approx'));
    expect(approx).toContain('R 40 920,00');
    expect(approx).toContain('R 39 165,00');
    expect(warnings(root)).toEqual([]);
    expect(text(stat(root, 'Marginal rate').querySelector('.rw-stat-card__text'))).toBe(
      '31% → 26%',
    );
  });

  it('S2: explains why the quick estimate R 18 600,00 differs from the real R 17 445,00', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Gross pay per month', 35_000);
    await type(fixture, 'Extra RA contribution per month', 5000);
    const approx = text(root.querySelector('.ra__approx'));
    expect(approx).toContain('R 18 600,00');
    expect(approx).toContain('R 17 445,00');
    expect(approx).toContain('income taxed at a lower rate');
    expect(statMoney(root, 'Tax saving')).toBe('R 17 445,00');
  });

  it('warns in plain words when contributions go over the limit', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Extra RA contribution per month', 10_000);
    const list = warnings(root);
    expect(list).toHaveLength(1);
    expect(list[0]).toContain(
      'R 21 000,00 of your contributions this year is over the tax-deductible limit',
    );
    expect(list[0]).toContain('carries forward');
    expect(text(root.querySelector('.rw-ring-gauge__centre'))).toBe('100%');
    expect(fact(root, 'Left after this RA')).toBe('R 0,00');
  });

  it('warns that an RA cannot pay out before 55 and projects to 55', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Retirement age', 50);
    expect(warnings(root)).toEqual([
      'An RA cannot pay out before age 55, so the projection runs to 55.',
    ]);
    expect(text(root.querySelector('.ra__eyebrow'))).toBe('Projected RA balance at 55');
    expect(heroNominal(root)).toBe('R 1 940 113,55');
  });

  it('shows the already-retired warning and no chart when the age has passed', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Age at the end of the tax year', 60);
    expect(warnings(root)).toEqual([
      "You are already 55 or older, so the projection shows today's balance.",
    ]);
    expect(root.querySelector('rw-line-chart')).toBeNull();
    expect(text(root.querySelector('.ra__results'))).toContain(
      'No projection: you are already at retirement age.',
    );
    expect(root.querySelector('.ra__hero')).not.toBeNull();
  });

  it('shows a From Salary chip after a handoff and Undo restores the earlier local values', async () => {
    const { fixture, root } = await render();
    const plan = TestBed.inject(PlanContextStore);
    plan.updateRa({ grossMonthly: 50_000 });
    plan.sendFromSalary('ra');
    await fixture.whenStable();
    expect(text(root.querySelector('rw-handoff-chip'))).toContain('From Salary');
    expect(field(root, 'Gross pay per month').value).toBe('30000');

    const undo = root.querySelector<HTMLButtonElement>('.rw-handoff-chip__undo');
    expect(undo?.getAttribute('aria-label')).toBe('Undo figures from Salary');
    undo?.click();
    await fixture.whenStable();
    expect(field(root, 'Gross pay per month').value).toBe('50000');
    expect(root.querySelector('rw-handoff-chip')).toBeNull();
  });

  it('sends nowhere yet: three Coming soon targets and no RA target', async () => {
    const { root } = await render();
    const targets = Array.from(root.querySelectorAll('.rw-send-to__target')).map((t) => text(t));
    expect(targets).toEqual([
      'Retire at 55 Coming soon',
      'Budget Coming soon',
      'Journey Coming soon',
    ]);
    for (const target of Array.from(root.querySelectorAll('.rw-send-to__target'))) {
      expect(target.getAttribute('aria-disabled')).toBe('true');
    }
  });

  it('gives every input an accessible label', async () => {
    const { root } = await render();
    const inputs = Array.from(root.querySelectorAll('input'));
    expect(inputs.length).toBe(22);
    for (const input of inputs) {
      const named = (input.labels?.length ?? 0) > 0 || !!input.getAttribute('aria-label')?.trim();
      expect(named, `${input.type} input`).toBe(true);
    }
  });

  it('labels the salary block as local to this page', async () => {
    const { root } = await render();
    const headings = Array.from(root.querySelectorAll('h3')).map((h) => text(h));
    expect(headings).toEqual(['Assumptions you can change', 'Your salary (used for tax)']);
    expect(text(root.querySelectorAll('.ra__block')[1])).toContain(
      'Changes here only affect this page. Use Send to RA on the Pay page',
    );
  });

  it('renders each chart as a labelled svg image with a data table', async () => {
    const { root } = await render();
    for (const block of ['rw-breakdown-bar', 'rw-line-chart', 'rw-ring-gauge']) {
      const svgs = root.querySelectorAll(`${block} svg[role=img]`);
      expect(svgs.length, block).toBe(1);
      expect(svgs[0].getAttribute('aria-label')?.trim(), block).toBeTruthy();
      expect(root.querySelector(`${block} .rw-visually-hidden table`), block).not.toBeNull();
    }
  });

  it('draws the balance and money paid in, with the gap between them shaded', async () => {
    const { root } = await render();
    expect(root.querySelector('rw-line-chart .rw-line-chart__area--secondary')).not.toBeNull();
    const items = Array.from(root.querySelectorAll('rw-line-chart .rw-line-chart__item')).map((i) =>
      text(i),
    );
    expect(items).toEqual(['Balance', "Paid in (with today's balance)"]);
    expect(text(root.querySelector('rw-line-chart .rw-line-chart__title--x'))).toBe('Age');
    expect(text(root.querySelector('.ra__card .ra__text'))).toContain(
      'The shaded gap between the lines is investment growth.',
    );
  });

  it('has a year table with a caption and scoped headers', async () => {
    const { root } = await render();
    const table = root.querySelector('.ra__table') as HTMLTableElement;
    expect(text(table.caption)).toBe('Year by year');
    expect(table.querySelectorAll('thead th[scope=col]').length).toBe(5);
    expect(table.querySelectorAll('tbody th[scope=row]').length).toBe(21);
  });

  it('announces the result politely', async () => {
    const { fixture, root } = await render();
    const live = root.querySelector('[aria-live=polite]') as HTMLElement;
    expect(live.classList).toContain('rw-visually-hidden');
    expect(text(live)).toBe(
      "Projected balance R 1 940 113,55 at 55, R 804 454,23 in today's money.",
    );
    await type(fixture, 'Inflation per year', 0);
    expect(text(live)).toBe(
      "Projected balance R 1 940 113,55 at 55, R 1 940 113,55 in today's money.",
    );
  });

  it('shows the tax year note and the method', async () => {
    const { root } = await render();
    const note = text(root.querySelector('.ra__note'));
    expect(note).toContain('Based on tax year 2026/27, draft data checked 22 Oct 2026.');
    expect(note).toContain('contributions are paid at the end of each month');
  });

  it('shows an unavailable card without tax data', async () => {
    const { root } = await render(false);
    expect(text(root.querySelector('.ra__unavailable'))).toBe(
      'Tax data is unavailable, so RA figures cannot be shown.',
    );
    expect(root.querySelector('.ra__hero')).toBeNull();
    expect(root.querySelector('[role=alert]')).toBeNull();
    expect(root.querySelector('.ra__note')).toBeNull();
  });

  it('does not touch browser storage', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const { fixture } = await render();
    await type(fixture, 'Retirement age', 60);
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    get.mockRestore();
    set.mockRestore();
  });
});
