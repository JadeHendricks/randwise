import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TODAY } from '../../core/data/data-source';
import { SalaryInputsStore } from '../../core/salary/salary-inputs.store';
import { FakeMatchMedia, installFakeMatchMedia } from '../../testing/fake-match-media';
import { provideTestData } from '../../testing/tax-data-fixtures';
import { normaliseSpaces } from '../../testing/text';
import { PayPage } from './pay-page';

// Pinned so the bundled 2027 file (status draft, checked 22 Oct 2026) is the year in use.
const TODAY_PINNED = new Date(2026, 9, 22);

describe('PayPage', () => {
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
    const fixture = TestBed.createComponent(PayPage);
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

  function fact(root: HTMLElement, label: string): string {
    const item = Array.from(root.querySelectorAll('.pay__fact')).find(
      (el) => text(el.querySelector('dt')) === label,
    );
    return text(item?.querySelector('.rw-money__figure'));
  }

  function heroNet(root: HTMLElement): string {
    return text(root.querySelector('.pay__hero .rw-money--hero .rw-money__figure'));
  }

  function tableRow(root: HTMLElement, label: string): string[] {
    const row = Array.from(root.querySelectorAll('.pay__table tbody tr')).find(
      (tr) => text(tr.querySelector('th')) === label,
    );
    return Array.from(row?.querySelectorAll('td') ?? []).map((td) => text(td));
  }

  function field(root: HTMLElement, label: string): HTMLInputElement {
    const host = Array.from(root.querySelectorAll('rw-amount-field')).find(
      (el) => text(el.querySelector('label')) === label,
    );
    const input = host?.querySelector<HTMLInputElement>('input[type=number]');
    if (!input) throw new Error(`no field "${label}"`);
    return input;
  }

  async function type(fixture: ComponentFixture<PayPage>, label: string, value: number) {
    const input = field(fixture.nativeElement, label);
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  }

  function radio(root: HTMLElement, label: string): HTMLInputElement {
    const found = Array.from(root.querySelectorAll<HTMLInputElement>('input[type=radio]')).find(
      (r) => text(r.labels?.[0]) === label,
    );
    if (!found) throw new Error(`no radio "${label}"`);
    return found;
  }

  it('shows the example salary results: net R 25 141,88, PAYE R 4 681,00, UIF R 177,12', async () => {
    const { root } = await render();
    expect(heroNet(root)).toBe('R 25 141,88');
    expect(text(root.querySelector('.pay__hero .rw-money--md .rw-money__figure'))).toBe(
      'R 301 702,56',
    );
    expect(statMoney(root, 'PAYE')).toBe('R 4 681,00');
    expect(statMoney(root, 'UIF')).toBe('R 177,12');
    expect(statMoney(root, 'Taxable income')).toBe('R 30 000,00');
    expect(statMoney(root, 'Medical credit')).toBe('R 0,00');
    expect(text(stat(root, 'Medical credit'))).toContain('No medical aid');
    expect(text(stat(root, 'Marginal rate').querySelector('.rw-stat-card__text'))).toBe('26%');
    expect(text(stat(root, 'Effective rate').querySelector('.rw-stat-card__text'))).toBe('15,6%');
    expect(root.querySelector('.pay__needed')).toBeNull();
  });

  it('labels the defaults as an example that can be changed', async () => {
    const { fixture, root } = await render();
    expect(text(root.querySelector('.pay__inputs rw-chip'))).toBe('Example');
    expect(text(root.querySelector('.pay__intro'))).toContain(
      'This is an example salary of R30 000 a month.',
    );
    await type(fixture, 'Age at the end of the tax year', 40);
    expect(root.querySelector('.pay__intro')).toBeNull();
    const reset = Array.from(root.querySelectorAll('button')).find(
      (b) => text(b) === 'Reset to example',
    ) as HTMLButtonElement;
    reset.click();
    await fixture.whenStable();
    expect(root.querySelector('.pay__intro')).not.toBeNull();
    expect(field(root, 'Age at the end of the tax year').value).toBe('35');
  });

  it('shows the tax year, data status and method note, without a second data banner', async () => {
    const { root } = await render();
    const note = text(root.querySelector('.pay__note'));
    expect(note).toContain('Based on tax year 2026/27, draft data checked 22 Oct 2026.');
    expect(note).toContain('PAYE uses the annual-equivalent method');
    expect(root.querySelector('rw-data-banner')).toBeNull();
  });

  it('updates PAYE for age 65 and 75', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Age at the end of the tax year', 65);
    expect(statMoney(root, 'PAYE')).toBe('R 3 867,25');
    expect(heroNet(root)).toBe('R 25 955,63');
    await type(fixture, 'Age at the end of the tax year', 75);
    expect(statMoney(root, 'PAYE')).toBe('R 3 596,50');
  });

  it.each([
    [1, 'R 376,00', 'R 4 305,00', '1 member'],
    [2, 'R 752,00', 'R 3 929,00', '2 members'],
    [3, 'R 1 006,00', 'R 3 675,00', '3 members'],
  ])('medical aid with %i member(s) gives credit %s and PAYE %s', async (n, credit, paye, words) => {
    const { fixture, root } = await render();
    await type(fixture, 'People on your medical aid', n);
    expect(statMoney(root, 'Medical credit')).toBe(credit);
    expect(statMoney(root, 'PAYE')).toBe(paye);
    expect(text(stat(root, 'Medical credit').querySelector('.rw-stat-card__hint'))).toBe(words);
  });

  it('shows retirement headroom for an RA of R5 000 a month', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Your retirement contributions per month', 5000);
    expect(fact(root, 'Deductible this year')).toBe('R 60 000,00');
    expect(fact(root, 'Excess carried forward')).toBe('R 0,00');
    expect(fact(root, 'Remaining headroom')).toBe('R 39 000,00');
    expect(text(root.querySelector('.rw-ring-gauge__centre'))).toBe('61%');
    expect(root.querySelector('.rw-chip--warning')).toBeNull();
    expect(statMoney(root, 'PAYE')).toBe('R 3 381,00');
  });

  it('flags an RA of R10 000 a month as over the limit', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Your retirement contributions per month', 10_000);
    expect(fact(root, 'Excess carried forward')).toBe('R 21 000,00');
    expect(fact(root, 'Remaining headroom')).toBe('R 0,00');
    expect(text(root.querySelector('.rw-chip--warning'))).toBe('Over the limit');
    expect(text(root.querySelector('.pay__text'))).toContain('carries forward');
    expect(text(root.querySelector('.rw-ring-gauge__centre'))).toBe('100%');
  });

  it('leaves net pay unchanged for an employer contribution of R2 000 a month', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Employer retirement contributions per month', 2000);
    expect(heroNet(root)).toBe('R 25 141,88');
    expect(fact(root, 'Deductible this year')).toBe('R 24 000,00');
    expect(tableRow(root, 'Employer retirement contribution (benefit, not cash)')).toEqual([
      'R 2 000,00',
      'R 24 000,00',
    ]);
  });

  it('round-trips take-home pay back to the R30 000 gross', async () => {
    const { fixture, root } = await render();
    radio(root, 'Take-home pay').click();
    await fixture.whenStable();
    expect(TestBed.inject(SalaryInputsStore).inputs().amount).toBe(25_141.88);
    expect(field(root, 'Take-home pay per month').value).toBe('25141.88');
    expect(heroNet(root)).toBe('R 25 141,88');
    expect(tableRow(root, 'Gross pay')[0]).toBe('R 30 000,00');
    expect(statMoney(root, 'PAYE')).toBe('R 4 681,00');
    expect(text(root.querySelector('.pay__needed'))).toBe('Gross pay needed: R 30 000,00 a month');
  });

  it('shows an inline alert, not results, for an impossible take-home amount', async () => {
    const { fixture, root } = await render();
    TestBed.inject(SalaryInputsStore).update({ basis: 'net', amount: 5e9 });
    // TestBed rethrows render errors, so reaching the assertions means nothing threw.
    await fixture.whenStable();
    const alert = root.querySelector('[role=alert]');
    expect(alert?.classList).toContain('pay__error');
    expect(text(alert)).toBe(
      'That take-home amount is too high to work back to a salary. Try a smaller amount.',
    );
    expect(root.querySelector('.pay__hero')).toBeNull();
    expect(root.querySelector('rw-line-chart')).toBeNull();
  });

  it('switches the amount to per year', async () => {
    const { fixture, root } = await render();
    radio(root, 'Per year').click();
    await fixture.whenStable();
    const amount = field(root, 'Gross pay per year');
    expect(amount.value).toBe('360000');
    expect(amount.max).toBe('6000000');
    expect(heroNet(root)).toBe('R 25 141,88');
  });

  it('shows an unavailable card when there is no tax data', async () => {
    const { root } = await render(false);
    expect(text(root.querySelector('.pay__unavailable'))).toBe(
      'Tax data is unavailable, so tax figures cannot be shown.',
    );
    expect(root.querySelector('.pay__hero')).toBeNull();
    expect(root.querySelector('[role=alert]')).toBeNull();
    expect(root.querySelector('.pay__note')).toBeNull();
  });

  it('gives every input an accessible label', async () => {
    const { root } = await render();
    const inputs = Array.from(root.querySelectorAll('input'));
    expect(inputs.length).toBeGreaterThan(10);
    for (const input of inputs) {
      const named =
        (input.labels?.length ?? 0) > 0 || !!input.getAttribute('aria-label')?.trim();
      expect(named, `${input.type} input`).toBe(true);
    }
    expect(Array.from(root.querySelectorAll('legend')).map((l) => text(l))).toEqual([
      'Amount is',
      'Show amounts',
    ]);
  });

  it('renders one of each chart as a labelled svg image with a data table', async () => {
    const { root } = await render();
    for (const block of ['rw-breakdown-bar', 'rw-line-chart', 'rw-ring-gauge']) {
      const svgs = root.querySelectorAll(`${block} svg[role=img]`);
      expect(svgs.length, block).toBe(1);
      expect(svgs[0].getAttribute('aria-label')?.trim(), block).toBeTruthy();
      expect(root.querySelector(`${block} .rw-visually-hidden table`), block).not.toBeNull();
    }
    expect(normaliseSpaces(root.querySelector('rw-line-chart svg')?.getAttribute('aria-label'))).toContain(
      'Your gross pay of R 30 000,00 gives R 25 141,88 net.',
    );
    expect(normaliseSpaces(root.querySelector('rw-breakdown-bar svg')?.getAttribute('aria-label'))).toContain(
      'Net pay R 25 141,88',
    );
  });

  it('names both lines of the net-vs-gross chart in a visible legend', async () => {
    const { root } = await render();
    const items = Array.from(root.querySelectorAll('rw-line-chart .rw-line-chart__item')).map((i) =>
      text(i),
    );
    expect(items).toEqual(['Net pay', 'Gross pay']);
  });

  it('announces the result politely and says typed amounts are rounded to the rand', async () => {
    const { fixture, root } = await render();
    const live = root.querySelector('[aria-live=polite]') as HTMLElement;
    expect(live.classList).toContain('rw-visually-hidden');
    expect(text(live)).toBe('Net pay R 25 141,88 a month, PAYE R 4 681,00 a month.');
    await type(fixture, 'Age at the end of the tax year', 65);
    expect(text(live)).toBe('Net pay R 25 955,63 a month, PAYE R 3 867,25 a month.');
    expect(text(root.querySelector('rw-amount-field .rw-amount-field__hint'))).toBe(
      'Typed amounts are rounded to the nearest rand.',
    );
  });

  it('has a monthly and annual table with scoped headers', async () => {
    const { root } = await render();
    const table = root.querySelector('.pay__table') as HTMLTableElement;
    expect(text(table.caption)).toBe('Monthly and annual values');
    expect(table.querySelectorAll('thead th[scope=col]').length).toBe(3);
    expect(table.querySelectorAll('tbody th[scope=row]').length).toBe(9);
    expect(tableRow(root, 'Net pay')).toEqual(['R 25 141,88', 'R 301 702,56']);
    expect(tableRow(root, 'PAYE')).toEqual(['R 4 681,00', 'R 56 172,00']);
  });

  it('does not touch browser storage', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const { fixture } = await render();
    await type(fixture, 'Age at the end of the tax year', 65);
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    get.mockRestore();
    set.mockRestore();
  });
});
