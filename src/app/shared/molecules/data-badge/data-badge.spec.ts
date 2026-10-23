import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { formatShortDate } from '../../../core/data/format-date';
import { normaliseSpaces } from '../../../testing/text';
import { makeRates, makeTaxYear, provideTestData } from '../../../testing/tax-data-fixtures';
import { DataBanner } from '../data-banner/data-banner';
import { DataBadge } from './data-badge';

describe('DataBadge', () => {
  const VERIFIED_ON = formatShortDate('2026-03-01');
  const RATES_ON = formatShortDate('2026-10-22');

  async function setup(providers: Provider[] = provideTestData({ today: '2026-10-22' })) {
    TestBed.configureTestingModule({ providers });
    const fixture = TestBed.createComponent(DataBadge);
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      root,
      toggle: root.querySelector('button') as HTMLButtonElement,
      panel: root.querySelector('.rw-data-badge__panel') as HTMLElement,
      chip: root.querySelector('rw-chip') as HTMLElement,
      parts: () => Array.from(root.querySelectorAll('.rw-data-badge__part')).map((p) => normaliseSpaces(p.textContent)),
      text: () =>
        Array.from(root.querySelectorAll('.rw-data-badge__summary > span'))
          .map((p) => normaliseSpaces(p.textContent))
          .join(' '),
    };
  }

  afterEach(() => document.body.replaceChildren());

  it('shows the verified text and a success chip', async () => {
    const { text, chip } = await setup();
    expect(text()).toBe(`Tax year 2026/27 · verified ${VERIFIED_ON} · rates ${RATES_ON}`);
    expect(chip.textContent?.trim()).toBe('Verified');
    expect(chip.classList.contains('rw-chip--success')).toBe(true);
  });

  it('marks automatically verified data', async () => {
    const data = makeTaxYear(2027, { status: 'verified-auto' });
    const { chip } = await setup(
      provideTestData({ today: '2026-10-22', taxYears: [{ fileName: '2027.json', data }] }),
    );
    expect(chip.textContent?.trim()).toBe('Verified (auto)');
    expect(chip.classList.contains('rw-chip--success')).toBe(true);
  });

  it('shows a warning chip and "draft, checked" for draft data', async () => {
    const data = makeTaxYear(2027, { status: 'draft' });
    data.uif.carriedForward = true;
    const { text, chip } = await setup(
      provideTestData({ today: '2026-10-22', taxYears: [{ fileName: '2027.json', data }] }),
    );
    expect(text()).toContain(`draft, checked ${VERIFIED_ON}`);
    expect(text()).not.toContain('verified');
    expect(chip.textContent?.trim()).toBe('Draft');
    expect(chip.classList.contains('rw-chip--warning')).toBe(true);
  });

  it('says so when no tax year or no rates are available', async () => {
    const { text, chip } = await setup(
      provideTestData({
        today: '2026-10-22',
        taxYears: [],
        rates: { fileName: 'rates.json', data: {} },
      }),
    );
    expect(text()).toContain('Tax data unavailable · rates unavailable');
    expect(chip.textContent?.trim()).toBe('Unavailable');
    expect(chip.classList.contains('rw-chip--danger')).toBe(true);
  });

  it('toggles aria-expanded and the panel from the button', async () => {
    const { fixture, toggle, panel } = await setup();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.hidden).toBe(true);
    toggle.click();
    await fixture.whenStable();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    toggle.click();
    await fixture.whenStable();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
  });

  it('closes on Escape from inside the panel and returns focus to the button', async () => {
    const { fixture, toggle, panel } = await setup();
    toggle.click();
    await fixture.whenStable();
    const link = panel.querySelector('a') as HTMLAnchorElement;
    link.focus();
    link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  });

  it('lists the period, sources with safe link attributes, and rates with their own dates', async () => {
    const { fixture, toggle, panel } = await setup();
    toggle.click();
    await fixture.whenStable();
    const text = normaliseSpaces(panel.textContent ?? '');
    expect(text).toContain('Period: 1 March 2026 to 28 February 2027');
    const links = Array.from(panel.querySelectorAll('a'));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
    expect(links[0].textContent).toBe('sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals');
    expect(text).toContain(`CPI inflation: 4.5% (as of ${formatShortDate('2026-09-30')})`);
    expect(text).toContain(`Repo rate: 7% (as of ${RATES_ON})`);
  });

  it('says none were carried forward, or lists the fields that were', async () => {
    const verified = await setup();
    verified.toggle.click();
    await verified.fixture.whenStable();
    expect(normaliseSpaces(verified.panel.textContent ?? '')).toContain(
      'None, every value was confirmed for this tax year.',
    );
    TestBed.resetTestingModule();
    document.body.replaceChildren();

    const data = makeTaxYear(2027, { status: 'draft' });
    data.uif.carriedForward = true;
    const draft = await setup(
      provideTestData({ today: '2026-10-22', taxYears: [{ fileName: '2027.json', data }] }),
    );
    const items = Array.from(draft.panel.querySelectorAll('li')).map((li) => li.textContent?.trim());
    expect(items).toContain('UIF contributions');
  });

  it('lists the default assumptions as read-only text labelled Assumption', async () => {
    const { fixture, toggle, panel } = await setup(
      provideTestData({ today: '2026-10-22', rates: { fileName: 'rates.json', data: makeRates() } }),
    );
    toggle.click();
    await fixture.whenStable();
    const text = normaliseSpaces(panel.textContent ?? '');
    expect(text).toContain('Default assumptions');
    expect(text).toContain('Inflation: 4.5%');
    expect(text).toContain('Growth portfolio return: 9.5%');
    expect(text).toContain('Assumption: cash earns the repo rate');
    expect(panel.querySelector('input, textarea, select')).toBeNull();
  });

  describe('when the tax year has ended', () => {
    const STALE_TODAY = '2027-03-05';

    it('shows Out of date in the chip and the summary instead of verified', async () => {
      const { text, chip } = await setup(provideTestData({ today: STALE_TODAY }));
      expect(chip.textContent?.trim()).toBe('Out of date');
      expect(chip.classList.contains('rw-chip--warning')).toBe(true);
      expect(text()).toBe(
        `Tax year 2026/27 · out of date, ended ${formatShortDate('2027-02-28')} · rates ${RATES_ON}`,
      );
      expect(text()).not.toContain('verified');
    });

    it('keeps Out of date for a draft file and shows both sentences in the panel', async () => {
      const data = makeTaxYear(2027, { status: 'draft' });
      data.uif.carriedForward = true;
      const { fixture, toggle, panel, chip } = await setup(
        provideTestData({ today: STALE_TODAY, taxYears: [{ fileName: '2027.json', data }] }),
      );
      toggle.click();
      await fixture.whenStable();
      const text = normaliseSpaces(panel.textContent ?? '');
      expect(chip.textContent?.trim()).toBe('Out of date');
      expect(text).toContain('Out of date: tax year 2026/27 ended on 28 February 2027');
      expect(text).toContain('Draft:');
    });

    it('puts the visible words first in the accessible name', async () => {
      const { parts, toggle } = await setup(provideTestData({ today: STALE_TODAY }));
      const name = toggle.getAttribute('aria-label') ?? '';
      expect(name.startsWith(`${parts().join(', ')}. `)).toBe(true);
      expect(name).toContain('Status: Out of date');
    });

    it('is not out of date on the last day of the tax year', async () => {
      const { chip } = await setup(provideTestData({ today: '2027-02-28' }));
      expect(chip.textContent?.trim()).toBe('Verified');
    });

    it('still says Unavailable when there is no tax year', async () => {
      const { chip } = await setup(provideTestData({ today: STALE_TODAY, taxYears: [] }));
      expect(chip.textContent?.trim()).toBe('Unavailable');
    });

    it('stays Out of date after the banner notice is dismissed', async () => {
      TestBed.configureTestingModule({ providers: provideTestData({ today: STALE_TODAY }) });
      const banner = TestBed.createComponent(DataBanner);
      const badge = TestBed.createComponent(DataBadge);
      document.body.append(banner.nativeElement as HTMLElement, badge.nativeElement as HTMLElement);
      await banner.whenStable();
      await badge.whenStable();

      const dismiss = (banner.nativeElement as HTMLElement).querySelector(
        '[aria-label="Dismiss out-of-date data notice"]',
      ) as HTMLButtonElement;
      dismiss.click();
      await banner.whenStable();
      await badge.whenStable();

      const chip = (badge.nativeElement as HTMLElement).querySelector('rw-chip') as HTMLElement;
      expect(chip.textContent?.trim()).toBe('Out of date');
    });
  });

  it('has an accessible name that starts with the visible words', async () => {
    const { parts, toggle } = await setup();
    const name = toggle.getAttribute('aria-label') ?? '';
    expect(name.startsWith(`${parts().join(', ')}. `)).toBe(true);
    expect(name).toContain('Status: Verified');
    expect(name).toMatch(/Show data sources$/);
  });
});
