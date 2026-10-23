import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { routes } from '../../../app.routes';
import { TODAY } from '../../../core/data/data-source';
import { LIVE_REGION_SETTLE_MS } from '../../../shared/atoms/live-region/live-region';
import { FakeMatchMedia, installFakeMatchMedia } from '../../../testing/fake-match-media';
import { provideTestData } from '../../../testing/tax-data-fixtures';
import { normaliseSpaces } from '../../../testing/text';
import { TwoPotPage } from './two-pot-page';

// Pinned so the bundled 2027 file is the year in use (the fixture UIF ceiling is fake).
const TODAY_PINNED = new Date(2026, 9, 22);

describe('TwoPotPage', () => {
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
    const fixture = TestBed.createComponent(TwoPotPage);
    await fixture.whenStable();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  const text = (el: Element | null | undefined) => normaliseSpaces(el?.textContent);
  const hero = (root: HTMLElement) =>
    text(root.querySelector('.tool__hero .rw-money--hero .rw-money__figure'));
  const warnings = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('.tool__warning')).map((el) => text(el));

  /** The rand figure on the stat card with this label. */
  function stat(root: HTMLElement, label: string): string {
    const card = Array.from(root.querySelectorAll('rw-stat-card')).find(
      (el) => text(el.querySelector('.rw-stat-card__label')) === label,
    );
    if (!card) throw new Error(`no stat card "${label}"`);
    return text(card.querySelector('.rw-money__figure, .rw-stat-card__text'));
  }

  function inputByLabel(root: HTMLElement, label: string): HTMLInputElement {
    const found = Array.from(root.querySelectorAll('label')).find((el) => text(el) === label);
    const input = found?.htmlFor ? root.ownerDocument.getElementById(found.htmlFor) : null;
    if (!(input instanceof HTMLInputElement)) throw new Error(`no field "${label}"`);
    return input;
  }

  async function type(fixture: ComponentFixture<TwoPotPage>, label: string, value: number) {
    const input = inputByLabel(fixture.nativeElement, label);
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  }

  /** TP1: R350 000 taxable, R50 000 out, age 40, 20 years, 4% real growth, 5% inflation. */
  async function typeTp1(fixture: ComponentFixture<TwoPotPage>) {
    await type(fixture, 'Taxable income per year', 350_000);
    await type(fixture, 'Amount to withdraw', 50_000);
    await type(fixture, 'Your age', 40);
    await type(fixture, 'Medical aid members', 0);
    await type(fixture, 'Years until you retire', 20);
    await type(fixture, 'Growth above inflation per year', 4);
    await type(fixture, 'Inflation per year', 5);
  }

  it('starts as an example that follows the Pay page income', async () => {
    const { root } = await render();
    expect(text(root.querySelector('rw-chip'))).toBe('Example');
    expect(Number(inputByLabel(root, 'Taxable income per year').value)).toBeGreaterThan(0);
    expect(inputByLabel(root, 'Amount to withdraw').value).toBe('20000');
    expect(inputByLabel(root, 'Years until you retire').value).toBe('20');
    expect(root.querySelector('[role=alert]')).toBeNull();
    expect(hero(root)).toMatch(/^R [\d ]+,\d\d$/);
  });

  it('gives tax R 13 845,00, cash R 36 155,00 and a true cost of R 73 401,16 (TP1)', async () => {
    const { fixture, root } = await render();
    await typeTp1(fixture);
    // Tax: 71 392 -> 85 237 on the tables, 13 845 after the same R17 820 rebate both times.
    expect(stat(root, 'Tax on the withdrawal')).toBe('R 13 845,00');
    expect(stat(root, 'Cash you receive')).toBe('R 36 155,00');
    // 50 000 x 1,04^20 = 109 556,16 today; lost growth 59 556,16; 13 845 + 59 556,16 = 73 401,16.
    expect(hero(root)).toBe('R 73 401,16');
    expect(text(root.querySelector('.tool__lead'))).toBe(
      'Tax now R 13 845,00 plus lost growth R 59 556,16.',
    );
    expect(stat(root, 'Growth you give up')).toBe('R 59 556,16');
    expect(text(root.querySelector('rw-stat-card .rw-stat-card__secondary'))).toBe(
      '27,7% of the withdrawal',
    );
    expect(stat(root, 'Tax rate on the withdrawal')).toBe('26% to 31%');
    // Future rand: 50 000 x 1,092^20 = 290 685,10, less the 50 000 taken out.
    expect(text(root)).toContain('In future rand: R 240 685,10');
  });

  it('lists the brackets the withdrawal lands in and warns that it crosses one', async () => {
    const { fixture, root } = await render();
    await typeTp1(fixture);
    const rows = Array.from(root.querySelectorAll('.tool-table__table tbody tr'));
    expect(rows.length).toBe(2);
    // (350 000, 383 100] R33 100 at 26% = 8 606; (383 100, 400 000] R16 900 at 31% = 5 239.
    expect(Array.from(rows[0].children).map((el) => text(el))).toEqual([
      'R 350 000,00',
      'R 383 100,00',
      'R 33 100,00',
      '26%',
      'R 8 606,00',
    ]);
    expect(Array.from(rows[1].children).map((el) => text(el))).toEqual([
      'R 383 100,00',
      'R 400 000,00',
      'R 16 900,00',
      '31%',
      'R 5 239,00',
    ]);
    expect(warnings(root)).toEqual([
      'Part of this withdrawal lands in a higher tax bracket: the first rands are taxed at 26% and the last at 31%.',
    ]);
    expect(root.querySelector('.tool-table__table caption')).not.toBeNull();
    for (const th of Array.from(root.querySelectorAll('.tool-table__table th'))) {
      expect(th.getAttribute('scope')).toMatch(/^(col|row)$/);
    }
    expect(root.querySelector('.tool-table__scroll')?.getAttribute('tabindex')).toBe('0');
  });

  it('splits the value at retirement into cash, tax and lost growth', async () => {
    const { fixture, root } = await render();
    await typeTp1(fixture);
    const label = root.querySelector('rw-breakdown-bar svg')?.getAttribute('aria-label') ?? '';
    // 36 155 + 13 845 + 59 556,16 = 109 556,16, the value in today's money.
    for (const part of [
      'Cash you receive',
      'Tax now',
      'Lost growth',
      '36 155,00',
      '13 845,00',
      '59 556,16',
    ]) {
      expect(normaliseSpaces(label), part).toContain(part);
    }
    expect(text(root)).toContain("could grow to R 109 556,16 in today's money");
  });

  it('shows only an alert and no figures below the R2 000 minimum', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Amount to withdraw', 1_999);
    const alert = root.querySelector('[role=alert]');
    expect(text(alert)).toContain('The smallest savings withdrawal is R 2 000');
    expect(root.querySelector('.tool__hero')).toBeNull();
    expect(root.querySelector('rw-money')).toBeNull();
    expect(root.querySelector('rw-stat-card')).toBeNull();
    expect(root.querySelector('table')).toBeNull();
    expect(root.querySelector('rw-breakdown-bar')).toBeNull();
    expect(text(root.querySelector('[aria-live=polite]'))).toBe('');
  });

  it('accepts exactly R2 000', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Taxable income per year', 350_000);
    await type(fixture, 'Amount to withdraw', 2_000);
    expect(root.querySelector('[role=alert]')).toBeNull();
    // 26% of R2 000 = R520.
    expect(stat(root, 'Tax on the withdrawal')).toBe('R 520,00');
    expect(stat(root, 'Cash you receive')).toBe('R 1 480,00');
  });

  it('taxes R7 380,00 when rebates absorb the first rands (TP4)', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Taxable income per year', 90_000);
    await type(fixture, 'Amount to withdraw', 50_000);
    await type(fixture, 'Your age', 40);
    await type(fixture, 'Medical aid members', 0);
    // 18% of 50 000 is 9 000, but R1 620 of the R17 820 rebate was unused: 9 000 - 1 620 = 7 380.
    expect(stat(root, 'Tax on the withdrawal')).toBe('R 7 380,00');
    expect(warnings(root)).toEqual([
      'Your tax rebate and medical credit, which cannot be paid out as cash, cancel R 1 620,00 of the tax on this withdrawal because your income is low.',
    ]);
    expect(stat(root, 'Tax rate on the withdrawal')).toBe('18%');
  });

  it('describes the rules: marginal rate, SARS source, once a tax year, savings pot only', async () => {
    const { root } = await render();
    const notes = text(root.querySelector('.tool__list'));
    expect(notes).toContain('one savings withdrawal in a tax year');
    expect(notes).toContain('only up to what your savings pot holds');
    expect(notes).toContain('taxes it at your marginal rate');
    expect(notes).toContain('not with the lump-sum tables');
    expect(notes).toContain('sars.gov.za');
    expect(notes).toContain('hold back tax at a different rate');
    expect(notes).toContain('Fund fees are not included');
  });

  it('labels the growth rate as an assumption', async () => {
    const { root } = await render();
    expect(text(root)).toContain('Assumption: your savings grow 5 percentage points faster');
    expect(text(root)).toContain('Assumption: inflation stays at the latest CPI rate');
  });

  it('offers only working links: Pay, RA and back to the Toolbox', async () => {
    const { root } = await render();
    const hrefs = Array.from(root.querySelectorAll('a[href]')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/toolbox', '/pay', '/ra']);
    const paths = new Set(routes.map((route) => route.path));
    for (const href of hrefs) {
      expect(paths.has((href ?? '').replace(/^\//, '')), `route for ${href}`).toBe(true);
    }
    expect(root.querySelector('rw-send-to')).toBeNull();
  });

  it('resets to the example', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Amount to withdraw', 50_000);
    expect(root.querySelector('rw-chip')).toBeNull();
    Array.from(root.querySelectorAll('button'))
      .find((b) => text(b) === 'Reset to example')
      ?.click();
    await fixture.whenStable();
    expect(inputByLabel(root, 'Amount to withdraw').value).toBe('20000');
    expect(text(root.querySelector('rw-chip'))).toBe('Example');
  });

  it('has a polite live region for the headline', async () => {
    const { fixture, root } = await render();
    await typeTp1(fixture);
    expect(text(root.querySelector('[aria-live=polite]'))).toContain(
      "True cost in today's money: R 73 401,16.",
    );
  });

  it('labels every input', async () => {
    const { root } = await render();
    const inputs = Array.from(root.querySelectorAll('input'));
    // Each amount field has a number box and a slider, both labelled.
    expect(inputs.length).toBeGreaterThanOrEqual(7);
    for (const input of inputs) {
      const label = input.id
        ? root.querySelector(`label[for="${input.id}"]`)
        : input.closest('label');
      const name = input.getAttribute('aria-label') || text(label);
      expect(name, `an input of type ${input.type} has no label`).not.toBe('');
    }
  });

  it('starts growth and inflation at 0 and says so when rates are unavailable', async () => {
    const { root } = await render('no-rates');
    expect(inputByLabel(root, 'Growth above inflation per year').value).toBe('0');
    expect(inputByLabel(root, 'Inflation per year').value).toBe('0');
    expect(text(root)).toContain('Rates are unavailable');
  });

  it('shows a card, not figures, when there is no tax data', async () => {
    const { root } = await render('no-tax');
    expect(text(root.querySelector('.tool__unavailable'))).toBe(
      'Tax data is unavailable, so the tax on a withdrawal cannot be worked out.',
    );
    expect(root.querySelector('.tool__hero')).toBeNull();
    expect(text(root.querySelector('[aria-live=polite]'))).toBe('');
  });
});
