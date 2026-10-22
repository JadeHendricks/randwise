import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { normaliseSpaces } from '../../../testing/text';
import { makeRates, makeTaxYear, provideTestData } from '../../../testing/tax-data-fixtures';
import { DataBanner } from './data-banner';

describe('DataBanner', () => {
  const IN_YEAR = '2026-10-22';
  const AFTER_YEAR = '2027-03-15';

  function draftFile() {
    const data = makeTaxYear(2027, { status: 'draft' });
    data.uif.carriedForward = true;
    return { fileName: '2027.json', data };
  }

  async function setup(providers: Provider[]) {
    TestBed.configureTestingModule({ providers });
    const fixture = TestBed.createComponent(DataBanner);
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      root,
      notices: () => Array.from(root.querySelectorAll<HTMLElement>('.rw-data-banner__notice')),
    };
  }

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('renders nothing when the data is verified and current', async () => {
    const { root, notices } = await setup(provideTestData({ today: IN_YEAR }));
    expect(notices()).toEqual([]);
    expect(root.textContent?.trim()).toBe('');
  });

  it('shows a draft notice as a status that names the carried-forward fields', async () => {
    const { notices } = await setup(
      provideTestData({ today: IN_YEAR, taxYears: [draftFile()] }),
    );
    expect(notices().length).toBe(1);
    const [draft] = notices();
    expect(draft.getAttribute('role')).toBe('status');
    expect(draft.classList.contains('rw-data-banner__notice--warning')).toBe(true);
    expect(normaliseSpaces(draft.textContent)).toContain('Draft tax data');
    expect(normaliseSpaces(draft.textContent)).toContain('UIF contributions');
  });

  it('shows a stale notice as a status with the end date', async () => {
    const { notices } = await setup(provideTestData({ today: AFTER_YEAR }));
    expect(notices().length).toBe(1);
    const [stale] = notices();
    expect(stale.getAttribute('role')).toBe('status');
    expect(normaliseSpaces(stale.textContent)).toContain(
      "Tax year 2026/27 ended on 28 February 2027. Figures still use its rules until the next year's data is added.",
    );
  });

  it('shows validation problems as an alert, up to five then a count of the rest', async () => {
    const bad = makeTaxYear(2027);
    bad.incomeTaxBrackets.value[1].base = 1;
    const second = { fileName: '2028.json', data: makeTaxYear(2027) };
    const { notices } = await setup(
      provideTestData({
        today: IN_YEAR,
        taxYears: [{ fileName: '2027.json', data: bad }, second],
        rates: { fileName: 'rates.json', data: makeRates({ fetchedOn: 'nope' }) },
      }),
    );
    const alert = notices().find((n) => n.getAttribute('role') === 'alert') as HTMLElement;
    expect(alert.classList.contains('rw-data-banner__notice--danger')).toBe(true);
    const items = Array.from(alert.querySelectorAll('li')).map((li) => li.textContent?.trim());
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.length).toBeLessThanOrEqual(6);
    expect(items.join(' ')).toContain('2027.json');
  });

  it('adds "and N more" when there are more than five problems', async () => {
    const taxYears = Array.from({ length: 7 }, (_, i) => ({
      fileName: `${2030 + i}.json`,
      data: { broken: true },
    }));
    const { notices } = await setup(provideTestData({ today: IN_YEAR, taxYears }));
    const alert = notices().find((n) => n.getAttribute('role') === 'alert') as HTMLElement;
    const items = Array.from(alert.querySelectorAll('li')).map((li) => li.textContent?.trim() ?? '');
    expect(items.length).toBe(6);
    expect(items[5]).toMatch(/^and \d+ more$/);
  });

  it('dismisses only the chosen notice without touching storage and moves focus on', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { fixture, root, notices } = await setup(
      provideTestData({ today: AFTER_YEAR, taxYears: [draftFile()] }),
    );
    expect(notices().length).toBe(2);
    const buttons = () => Array.from(root.querySelectorAll('button'));
    expect(buttons().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Dismiss draft data notice',
      'Dismiss out-of-date data notice',
    ]);

    buttons()[0].click();
    await fixture.whenStable();
    expect(notices().length).toBe(1);
    expect(normaliseSpaces(notices()[0].textContent)).toContain('Tax year has ended');
    expect(document.activeElement).toBe(buttons()[0]);

    const main = document.createElement('main');
    main.id = 'main-content';
    main.tabIndex = -1;
    document.body.appendChild(main);
    buttons()[0].click();
    await fixture.whenStable();
    expect(notices()).toEqual([]);
    expect(document.activeElement).toBe(main);
    expect(setItem).not.toHaveBeenCalled();
  });
});
