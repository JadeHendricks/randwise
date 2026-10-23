import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { routes } from '../../../app.routes';
import { TODAY } from '../../../core/data/data-source';
import { FakeMatchMedia, installFakeMatchMedia } from '../../../testing/fake-match-media';
import { provideTestData } from '../../../testing/tax-data-fixtures';
import { normaliseSpaces } from '../../../testing/text';
import { TfsaComparePage } from './tfsa-compare-page';

// Pinned so the bundled 2027 file is the year in use (the fixture UIF ceiling is fake).
const TODAY_PINNED = new Date(2026, 9, 22);

describe('TfsaComparePage', () => {
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
      providers: [provideRouter([]), dataProviders[data]],
    });
    const fixture = TestBed.createComponent(TfsaComparePage);
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
    return text(card.querySelector('.rw-money__figure'));
  }

  function inputByLabel(root: HTMLElement, label: string): HTMLInputElement {
    const found = Array.from(root.querySelectorAll('label')).find((el) => text(el) === label);
    const input = found?.htmlFor ? root.ownerDocument.getElementById(found.htmlFor) : null;
    if (!(input instanceof HTMLInputElement)) throw new Error(`no field "${label}"`);
    return input;
  }

  async function type(fixture: ComponentFixture<TfsaComparePage>, label: string, value: number) {
    const input = inputByLabel(fixture.nativeElement, label);
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  }

  /** The shipped-rules case: R1 000 000 for 1 year at 10%, 41% marginal, age 40. */
  async function typeBase(fixture: ComponentFixture<TfsaComparePage>) {
    await type(fixture, 'Lump sum to invest now', 1_000_000);
    await type(fixture, 'Years to invest', 1);
    await type(fixture, 'Return per year', 10);
    await type(fixture, 'Your marginal tax rate', 41);
    await type(fixture, 'Your age', 40);
  }

  /** TD3: all of the return is interest. */
  async function typeTd3(fixture: ComponentFixture<TfsaComparePage>) {
    await typeBase(fixture);
    await type(fixture, 'Share of the return paid as interest', 100);
    await type(fixture, 'Share of the return paid as dividends', 0);
  }

  /** TD4: all of the return is capital growth. */
  async function typeTd4(fixture: ComponentFixture<TfsaComparePage>) {
    await typeBase(fixture);
    await type(fixture, 'Share of the return paid as interest', 0);
    await type(fixture, 'Share of the return paid as dividends', 0);
  }

  it('starts as an example that follows the Pay page marginal rate', async () => {
    const { root } = await render();
    expect(text(root.querySelector('rw-chip'))).toBe('Example');
    expect(inputByLabel(root, 'Lump sum to invest now').value).toBe('46000');
    expect(inputByLabel(root, 'Years to invest').value).toBe('10');
    // Pay page default: R30 000 gross, which is in the 26% bracket.
    expect(Number(inputByLabel(root, 'Your marginal tax rate').value)).toBeGreaterThan(0);
    expect(hero(root)).toMatch(/^R [\d ]+,\d\d$/);
  });

  it('shows an advantage of R 1 886,00 when interest is above the exemption (TD3)', async () => {
    const { fixture, root } = await render();
    await typeTd3(fixture);
    // The TFSA column ends on 1 070 644; the taxable account on 1 068 758: 4 600 x 41% = 1 886.
    expect(hero(root)).toBe('R 1 886,00');
    expect(stat(root, 'Value in the TFSA')).toBe('R 1 070 644,00');
    expect(stat(root, 'Value in a taxable account')).toBe('R 1 068 758,00');
    // Only one year, so no growth on the tax: the saving is the whole advantage.
    expect(text(root.querySelector('.tool__lead'))).toBe(
      'Over 1 year, using the TFSA saves R 1 886,00 in tax. The growth you would have lost on that tax adds R 0,00.',
    );
  });

  it('shows R 754,40 when all of the return is capital growth (TD4)', async () => {
    const { fixture, root } = await render();
    await typeTd4(fixture);
    // 4 600 x 40% inclusion x 41% = 754,40: the R50 000 exclusion is used once in each column.
    expect(hero(root)).toBe('R 754,40');
    expect(stat(root, 'Value in the TFSA')).toBe('R 1 092 554,40');
    expect(stat(root, 'Value in a taxable account')).toBe('R 1 091 800,00');
  });

  it('still shows R 1 886,00 at 65, where the exemption is bigger (TD5)', async () => {
    const { fixture, root } = await render();
    await typeTd3(fixture);
    await type(fixture, 'Your age', 65);
    expect(hero(root)).toBe('R 1 886,00');
    expect(stat(root, 'Value in a taxable account')).toBe('R 1 073 145,00');
  });

  it('shows the caps note when the lump sum is over the yearly limit, and not otherwise', async () => {
    const { fixture, root } = await render();
    expect(warnings(root).filter((w) => w.includes('fits under the TFSA limits'))).toEqual([]);
    await type(fixture, 'Lump sum to invest now', 46_000);
    expect(warnings(root).filter((w) => w.includes('fits under the TFSA limits'))).toEqual([]);
    await typeTd3(fixture);
    expect(warnings(root)).toContain(
      'Only R 46 000,00 of the R 1 000 000,00 you put in fits under the TFSA limits (R 46 000 a year and R 500 000 for life). The other R 954 000,00 is invested in a taxable account in the TFSA column, so both columns invest the same cash.',
    );
    // The interest in the taxable account is above the exemption.
    expect(warnings(root).some((w) => w.includes('above the yearly interest exemption'))).toBe(
      true,
    );
  });

  it('shows the growth share as text and keeps dividends within what interest leaves', async () => {
    const { fixture, root } = await render();
    expect(text(root)).toContain('Capital growth is the rest of the return: 50%');
    await type(fixture, 'Share of the return paid as interest', 90);
    expect(inputByLabel(root, 'Share of the return paid as dividends').value).toBe('10');
    expect(text(root)).toContain('Capital growth is the rest of the return: 0%');
  });

  it('splits the taxable account tax into interest, dividends and capital gains', async () => {
    const { fixture, root } = await render();
    await typeTd3(fixture);
    const label = root.querySelector('rw-breakdown-bar svg')?.getAttribute('aria-label') ?? '';
    for (const part of ['Tax on interest', 'Dividends tax', 'Capital gains tax', '31 242,00']) {
      expect(normaliseSpaces(label), part).toContain(part);
    }
  });

  it('draws both balances and lists the years in a closed details element', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Years to invest', 3);
    expect(root.querySelector('rw-line-chart svg')?.getAttribute('aria-label')).toContain(
      'TFSA and taxable account balances over the years',
    );
    const details = root.querySelector('details');
    expect(details?.open).toBe(false);
    expect(text(details?.querySelector('summary'))).toBe('Year by year');
    expect(details?.querySelector('table caption')).not.toBeNull();
    const rows = Array.from(root.querySelectorAll('.tool-table__table tbody tr'));
    expect(rows.length).toBe(3);
    expect(text(rows[0].querySelector('th'))).toBe('1');
    for (const th of Array.from(root.querySelectorAll('.tool-table__table th'))) {
      expect(th.getAttribute('scope')).toMatch(/^(col|row)$/);
    }
    expect(root.querySelector('.tool-table__scroll')?.getAttribute('tabindex')).toBe('0');
  });

  it('lists the assumptions, with the limits read from the data', async () => {
    const { root } = await render();
    const items = Array.from(root.querySelectorAll('.tool__list li')).map((el) => text(el));
    expect(items).toEqual([
      'The TFSA limits are R 46 000 a year and R 500 000 for life. Money over a limit goes to a taxable account in the TFSA column.',
      'The split of the return into interest, dividends and capital growth is an illustration. Real investments differ.',
      'One flat marginal tax rate is used for interest and capital gains in every year.',
      'Capital gains are realised once, at the end of the last year, so capital gains tax is charged once.',
      'The interest exemption is not shared with other interest you earn.',
      'Dividends are local dividends with 20% dividends tax.',
      'Money goes in at the start of each year, and the return is a yearly rate before fees.',
    ]);
  });

  it('labels the return as an assumption', async () => {
    const { root } = await render();
    expect(text(root)).toContain(
      'Assumption: a growth portfolio returns CPI plus 5 percentage points',
    );
  });

  it('offers only working links: Journey and back to the Toolbox', async () => {
    const { root } = await render();
    const hrefs = Array.from(root.querySelectorAll('a[href]')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/toolbox', '/journey']);
    const paths = new Set(routes.map((route) => route.path));
    for (const href of hrefs) {
      expect(paths.has((href ?? '').replace(/^\//, '')), `route for ${href}`).toBe(true);
    }
    expect(root.querySelector('rw-send-to')).toBeNull();
  });

  it('resets to the example', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Lump sum to invest now', 100_000);
    expect(root.querySelector('rw-chip')).toBeNull();
    Array.from(root.querySelectorAll('button'))
      .find((b) => text(b) === 'Reset to example')
      ?.click();
    await fixture.whenStable();
    expect(inputByLabel(root, 'Lump sum to invest now').value).toBe('46000');
    expect(text(root.querySelector('rw-chip'))).toBe('Example');
  });

  it('has a polite live region for the headline', async () => {
    const { fixture, root } = await render();
    await typeTd3(fixture);
    expect(text(root.querySelector('[aria-live=polite]'))).toContain('TFSA advantage: R 1 886,00.');
  });

  it('labels every input', async () => {
    const { root } = await render();
    const inputs = Array.from(root.querySelectorAll('input'));
    // Each amount field has a number box and a slider, both labelled.
    expect(inputs.length).toBeGreaterThanOrEqual(9);
    for (const input of inputs) {
      const label = input.id
        ? root.querySelector(`label[for="${input.id}"]`)
        : input.closest('label');
      const name = input.getAttribute('aria-label') || text(label);
      expect(name, `an input of type ${input.type} has no label`).not.toBe('');
    }
  });

  it('says so when rates are unavailable and the return starts at 0', async () => {
    const { root } = await render('no-rates');
    expect(inputByLabel(root, 'Return per year').value).toBe('0');
    expect(text(root)).toContain('Rates are unavailable');
    expect(warnings(root).some((w) => w.includes('expected return is unavailable'))).toBe(true);
  });

  it('shows a card, not figures, when there is no tax data', async () => {
    const { root } = await render('no-tax');
    expect(text(root.querySelector('.tool__unavailable'))).toBe(
      'Tax data is unavailable, so the tax rules cannot be applied.',
    );
    expect(root.querySelector('.tool__hero')).toBeNull();
    expect(text(root.querySelector('[aria-live=polite]'))).toBe('');
  });
});
