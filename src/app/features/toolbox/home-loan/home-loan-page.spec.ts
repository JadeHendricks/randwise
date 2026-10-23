import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { routes } from '../../../app.routes';
import { TODAY } from '../../../core/data/data-source';
import { LIVE_REGION_SETTLE_MS } from '../../../shared/atoms/live-region/live-region';
import { FakeMatchMedia, installFakeMatchMedia } from '../../../testing/fake-match-media';
import { provideTestData } from '../../../testing/tax-data-fixtures';
import { normaliseSpaces } from '../../../testing/text';
import { HomeLoanPage } from './home-loan-page';

// Pinned so the bundled 2027 file is the year in use (the fixture UIF ceiling is fake).
const TODAY_PINNED = new Date(2026, 9, 22);

describe('HomeLoanPage', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
  });
  afterEach(() => fake.uninstall());

  async function render(data: 'bundled' | 'no-tax' | 'no-rates' = 'bundled') {
    const dataProviders = {
      bundled: { provide: TODAY, useValue: () => new Date(TODAY_PINNED) },
      'no-tax': provideTestData({ taxYears: [], today: TODAY_PINNED }),
      'no-rates': provideTestData({
        today: TODAY_PINNED,
        rates: { fileName: 'rates.json', data: { broken: true } },
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: LIVE_REGION_SETTLE_MS, useValue: 0 },
        dataProviders[data],
      ],
    });
    const fixture = TestBed.createComponent(HomeLoanPage);
    await fixture.whenStable();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  const text = (el: Element | null | undefined) => normaliseSpaces(el?.textContent);
  const hero = (root: HTMLElement) =>
    text(root.querySelector('.tool__hero .rw-money--hero .rw-money__figure'));
  const warnings = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('.tool__warning')).map((el) => text(el));

  function inputByLabel(root: HTMLElement, label: string): HTMLInputElement {
    const found = Array.from(root.querySelectorAll('label')).find((el) => text(el) === label);
    const input = found?.htmlFor ? root.ownerDocument.getElementById(found.htmlFor) : null;
    if (!(input instanceof HTMLInputElement)) throw new Error(`no field "${label}"`);
    return input;
  }

  async function type(fixture: ComponentFixture<HomeLoanPage>, label: string, value: number) {
    const input = inputByLabel(fixture.nativeElement, label);
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  }

  async function choose(fixture: ComponentFixture<HomeLoanPage>, label: string) {
    const radio = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLLabelElement>(
        'rw-segmented-control label',
      ),
    ).find((el) => text(el) === label);
    radio?.querySelector('input')?.click();
    await fixture.whenStable();
  }

  /** HL3: R50 000 gross, R5 000 other debt, R100 000 deposit, 10.75% over 20 years. */
  async function typeHl3(fixture: ComponentFixture<HomeLoanPage>) {
    await type(fixture, 'Gross pay per month', 50_000);
    await type(fixture, 'Other debt repayments per month', 5_000);
    await type(fixture, 'Deposit', 100_000);
    await type(fixture, 'Bond interest rate per year', 10.75);
    await type(fixture, 'Bond term in years', 20);
  }

  it('starts as an example that follows the Pay page gross', async () => {
    const { root } = await render();
    expect(text(root.querySelector('rw-chip'))).toBe('Example');
    expect(inputByLabel(root, 'Gross pay per month').value).toBe('30000');
    // Prime from the bundled rates.
    expect(inputByLabel(root, 'Bond interest rate per year').value).toBe('10.75');
    // 30% of R30 000 is R9 000 of room: 9 000 x 98.49995 = R886 499.54.
    expect(hero(root)).toBe('R 886 499,54');
  });

  it('gives a max bond of R 984 999,49 and a price of R 1 084 999,49 (HL3)', async () => {
    const { fixture, root } = await render();
    await typeHl3(fixture);
    // Room is 30% x 50 000 - 5 000 = 10 000; 10 000 x 98.49995 = 984 999.49; plus the deposit.
    expect(text(root.querySelector('.tool__eyebrow'))).toBe('The most you could borrow');
    expect(hero(root)).toBe('R 984 999,49');
    expect(text(root.querySelector('.tool__lead'))).toContain('R 1 084 999,49');
    expect(warnings(root)).toEqual([]);
  });

  it('gives a repayment of R 10 152,29 for a R 1 100 000 price and warns it is over the cap (HL4)', async () => {
    const { fixture, root } = await render();
    await typeHl3(fixture);
    await choose(fixture, 'Repayment for a price');
    await type(fixture, 'Purchase price', 1_100_000);
    // R1 000 000 borrowed: 1 000 000 / 98.49995 = 10 152.29, R152.29 over the R10 000 of room.
    expect(text(root.querySelector('.tool__eyebrow'))).toBe('Monthly repayment');
    expect(hero(root)).toBe('R 10 152,29');
    expect(warnings(root)).toEqual([
      'This repayment is R 152,29 a month more than the R 10 000,00 the 30% rule leaves for a bond.',
    ]);
  });

  it('shows the price field only in price mode', async () => {
    const { fixture, root } = await render();
    expect(() => inputByLabel(root, 'Purchase price')).toThrow();
    await choose(fixture, 'Repayment for a price');
    expect(inputByLabel(root, 'Purchase price').value).toBe('1500000');
  });

  it('labels the 30% rule as a rule of thumb, not a bank guarantee', async () => {
    const { root } = await render();
    expect(text(root.querySelector('.tool__card .tool__title'))).toBe('The 30% rule of thumb');
    expect(text(root)).toContain('rule of thumb, not a bank guarantee');
    expect(text(root.querySelector('.tool__results > .tool__note'))).toContain(
      'may count rates, levies and insurance',
    );
  });

  it('warns there is no room when other debt already uses the 30%', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Other debt repayments per month', 9_000);
    expect(warnings(root)).toEqual([
      'Your existing debt repayments already use up 30% of your gross pay, so the rule leaves no room for a new bond.',
    ]);
    expect(hero(root)).toBe('R 0,00');
  });

  it('keeps the rate and the margin to prime in step', async () => {
    const { fixture, root } = await render();
    expect(inputByLabel(root, 'Margin to prime').value).toBe('0');
    await type(fixture, 'Margin to prime', -0.5);
    expect(inputByLabel(root, 'Bond interest rate per year').value).toBe('10.25');
    await type(fixture, 'Bond interest rate per year', 11.25);
    expect(inputByLabel(root, 'Margin to prime').value).toBe('0.5');
  });

  it('lists the years in a closed details element and draws the balance and first-year split', async () => {
    const { fixture, root } = await render();
    await typeHl3(fixture);
    const details = root.querySelector('details');
    expect(details?.open).toBe(false);
    expect(text(details?.querySelector('summary'))).toBe('Year by year');
    expect(details?.querySelector('table caption')).not.toBeNull();
    const rows = Array.from(root.querySelectorAll('.tool-table__table tbody tr'));
    expect(rows.length).toBe(20);
    expect(text(rows[0].querySelector('th'))).toBe('1');
    // The balance falls to nothing at the end of the term.
    expect(text(rows[19].querySelectorAll('td')[3])).toBe('R 0,00');
    for (const th of Array.from(root.querySelectorAll('.tool-table__table th'))) {
      expect(th.getAttribute('scope')).toMatch(/^(col|row)$/);
    }
    expect(root.querySelector('.tool-table__scroll')?.getAttribute('tabindex')).toBe('0');
    expect(root.querySelector('rw-line-chart svg')?.getAttribute('aria-label')).toContain(
      'Bond balance over the term',
    );
    expect(root.querySelector('rw-breakdown-bar svg')?.getAttribute('aria-label')).toContain(
      'Capital repaid',
    );
    expect(root.querySelector('rw-ring-gauge svg')?.getAttribute('aria-label')).toContain(
      'Debt repayments as a share of gross pay',
    );
  });

  it('offers only working links: Pay, Budget and back to the Toolbox', async () => {
    const { root } = await render();
    const hrefs = Array.from(root.querySelectorAll('a[href]')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/toolbox', '/pay', '/budget']);
    const paths = new Set(routes.map((route) => route.path));
    for (const href of hrefs) {
      expect(paths.has((href ?? '').replace(/^\//, '')), `route for ${href}`).toBe(true);
    }
    // No Send to here: a Budget line for the instalment would need a new kind of sent line.
    expect(root.querySelector('rw-send-to')).toBeNull();
  });

  it('resets to the example', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Deposit', 50_000);
    expect(root.querySelector('rw-chip')).toBeNull();
    Array.from(root.querySelectorAll('button'))
      .find((b) => text(b) === 'Reset to example')
      ?.click();
    await fixture.whenStable();
    expect(inputByLabel(root, 'Deposit').value).toBe('0');
    expect(text(root.querySelector('rw-chip'))).toBe('Example');
  });

  it('has a polite live region for the headline', async () => {
    const { fixture, root } = await render();
    await typeHl3(fixture);
    expect(text(root.querySelector('[aria-live=polite]'))).toContain(
      'The most you could borrow: R 984 999,49.',
    );
  });

  it('labels every input and the mode choice', async () => {
    const { root } = await render();
    const inputs = Array.from(root.querySelectorAll('input'));
    expect(inputs.length).toBeGreaterThan(10);
    for (const input of inputs) {
      const label = input.id
        ? root.querySelector(`label[for="${input.id}"]`)
        : input.closest('label');
      const name = input.getAttribute('aria-label') || text(label);
      expect(name, `an input of type ${input.type} has no label`).not.toBe('');
    }
    expect(Array.from(root.querySelectorAll('legend')).map((el) => text(el))).toEqual([
      'What do you want to work out',
    ]);
  });

  it('says so when prime is unavailable and drops the margin field', async () => {
    const { root } = await render('no-rates');
    expect(inputByLabel(root, 'Bond interest rate per year').value).toBe('0');
    expect(() => inputByLabel(root, 'Margin to prime')).toThrow();
    expect(warnings(root).some((w) => w.includes('prime rate is unavailable'))).toBe(true);
  });

  it('shows a card, not figures, when there is no tax data', async () => {
    const { root } = await render('no-tax');
    expect(text(root.querySelector('.tool__unavailable'))).toBe(
      'Tax data is unavailable, so take-home pay cannot be worked out.',
    );
    expect(root.querySelector('.tool__hero')).toBeNull();
    expect(text(root.querySelector('[aria-live=polite]'))).toBe('');
  });
});
