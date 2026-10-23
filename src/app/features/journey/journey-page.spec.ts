import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TODAY } from '../../core/data/data-source';
import { PlanContextStore } from '../../core/plan/plan-context.store';
import { FakeMatchMedia, installFakeMatchMedia } from '../../testing/fake-match-media';
import { provideTestData } from '../../testing/tax-data-fixtures';
import { normaliseSpaces } from '../../testing/text';
import { JourneyPage } from './journey-page';

// Pinned so the bundled 2027 file (status draft, checked 22 Oct 2026) is the year in use. The
// fixture UIF ceiling is fake, so money assertions use the bundled data, not provideTestData.
const TODAY_PINNED = new Date(2026, 9, 22);

const SALARY = {
  grossMonthly: 50_000,
  age: 40,
  medicalMembers: 0,
  employeeRetirementMonthly: 0,
  employerRetirementMonthly: 0,
};

describe('JourneyPage', () => {
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
    const fixture = TestBed.createComponent(JourneyPage);
    await fixture.whenStable();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  const text = (el: Element | null | undefined) => normaliseSpaces(el?.textContent);

  const hero = (root: HTMLElement) =>
    text(root.querySelector('.journey__hero .rw-money--hero .rw-money__figure'));

  function inputByLabel(root: HTMLElement, label: string): HTMLInputElement {
    const found = Array.from(root.querySelectorAll('label')).find((el) => text(el) === label);
    const input = found?.htmlFor ? root.ownerDocument.getElementById(found.htmlFor) : null;
    if (!(input instanceof HTMLInputElement)) throw new Error(`no field "${label}"`);
    return input;
  }

  async function type(fixture: ComponentFixture<JourneyPage>, label: string, value: number) {
    const input = inputByLabel(fixture.nativeElement, label);
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  }

  async function choose(fixture: ComponentFixture<JourneyPage>, label: string) {
    const radio = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLLabelElement>(
        'rw-segmented-control label',
      ),
    ).find((el) => text(el) === label);
    radio?.querySelector('input')?.click();
    await fixture.whenStable();
  }

  /** The hand-derived three-year journey (engine J1), typed in through the page. */
  async function typeJ1(fixture: ComponentFixture<JourneyPage>) {
    await type(fixture, 'Current age', 52);
    await type(fixture, 'Retirement age', 55);
    await type(fixture, 'Income increase per year', 10);
    await type(fixture, 'Inflation per year', 0);
    await type(fixture, 'Monthly RA contribution now', 2_000);
    await type(fixture, 'Yearly increase in RA contributions', 10);
    await type(fixture, 'RA return per year', 0);
    await type(fixture, 'Monthly TFSA top-up', 1_000);
    await type(fixture, 'TFSA return per year', 0);
  }

  const milestones = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('.rw-timeline__title')).map((el) => text(el));
  const warnings = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('.journey__warning')).map((el) => text(el));
  const tableRows = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('.journey__table tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('th, td')).map((cell) => text(cell)),
    );

  it('shows the default example with the tax saved and the TFSA at 55', async () => {
    const { root } = await render();
    expect(text(root.querySelector('.journey__eyebrow'))).toBe('Tax saved by 55');
    expect(text(root.querySelector('rw-chip'))).toBe('Example');
    expect(text(root.querySelector('.journey__lead'))).toMatch(
      /^TFSA at 55: R [\d ]+,\d\d \(R [\d ]+,\d\d in today's money\)$/,
    );
    const titles = milestones(root);
    expect(titles[0]).toBe('Age 35: today');
    expect(titles[titles.length - 1]).toBe('Age 55: retirement');
    expect(root.querySelector('.journey__error')).toBeNull();
  });

  it('renders the hand-checked three-year journey: R 22 751,40 saved, TFSA R 58 751,40, RA R 79 440,00', async () => {
    const { fixture, root } = await render();
    await typeJ1(fixture);
    // Tax saved 6 240 + 7 509 + 9 002.40 = 22 751.40.
    expect(hero(root)).toBe('R 22 751,40');
    // TFSA 18 240 + 19 509 + 21 002.40 = 58 751.40; RA 24 000 + 26 400 + 29 040 = 79 440.
    expect(text(root.querySelector('.journey__lead'))).toBe(
      "TFSA at 55: R 58 751,40 (R 58 751,40 in today's money)",
    );
    expect(text(root.querySelector('.journey__hero .journey__text'))).toBe(
      "RA at 55: R 79 440,00 (R 79 440,00 in today's money)",
    );
    expect(milestones(root)).toEqual(['Age 52: today', 'Age 55: retirement']);
    expect(warnings(root)).toEqual([]);
  });

  it('lists the years in a table inside a details element, closed by default', async () => {
    const { fixture, root } = await render();
    await typeJ1(fixture);
    const details = root.querySelector('details');
    expect(details?.open).toBe(false);
    expect(text(details?.querySelector('summary'))).toBe('Year by year');
    expect(details?.querySelector('table caption')).not.toBeNull();
    const rows = tableRows(root);
    expect(rows.length).toBe(3);
    // Age 52: income 30 000, RA 24 000, saved 6 240, TFSA in 18 240 (12 000 top-up + 6 240).
    expect(rows[0]).toEqual([
      '52',
      'R 30 000,00',
      'R 24 000,00',
      'R 24 000,00',
      'R 0,00',
      'R 6 240,00',
      'R 18 240,00',
      'R 0,00',
      'R 18 240,00',
      'R 24 000,00',
      'R 18 240,00',
    ]);
    // Age 54: income 36 300, RA 29 040, saved 9 002.40, TFSA 58 751.40.
    expect(rows[2].slice(0, 2)).toEqual(['54', 'R 36 300,00']);
    expect(rows[2][5]).toBe('R 9 002,40');
    expect(rows[2][8]).toBe('R 58 751,40');
    for (const th of Array.from(root.querySelectorAll('.journey__table th'))) {
      expect(th.getAttribute('scope')).toMatch(/^(col|row)$/);
    }
  });

  it('gives the same totals when the tax saving arrives as lower PAYE at 0% returns', async () => {
    const { fixture, root } = await render();
    await typeJ1(fixture);
    await choose(fixture, 'Lower PAYE each month');
    expect(text(root.querySelector('.journey__lead'))).toBe(
      "TFSA at 55: R 58 751,40 (R 58 751,40 in today's money)",
    );
  });

  it('keeps the TFSA inside the limits, shows the 40% exposure, and flips it when over-contribution is allowed', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Monthly TFSA top-up', 4_000);
    // 48 000 + the 6 240 refund against R46 000 a year: the extra is not invested.
    const exposure = warnings(root).find((w) => w.includes('would tax it at 40%'));
    expect(exposure).toBeDefined();
    expect(warnings(root).some((w) => w.includes('did not fit under the TFSA limits'))).toBe(true);
    expect(warnings(root).some((w) => w.includes('You chose to over-contribute'))).toBe(false);
    for (const row of tableRows(root)) expect(row[6]).not.toBe('R 54 240,00');

    await choose(fixture, 'Yes');
    expect(warnings(root).some((w) => w.includes('You chose to over-contribute'))).toBe(true);
    expect(warnings(root).some((w) => w.includes('would tax it at 40%'))).toBe(false);
  });

  it('stops at the lifetime limit: milestones in order and the ring at 100%', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Monthly RA contribution now', 0);
    await type(fixture, 'Monthly TFSA top-up', 4_000);
    await type(fixture, 'Inflation per year', 0);
    await type(fixture, 'TFSA return per year', 0);
    // 4 000 x 12 = 48 000 is over R46 000, so the yearly limit is hit in year 1 (age 35). Ten
    // years of 46 000 is 460 000; year 11 (age 45) has 40 000 of lifetime room left.
    expect(milestones(root)).toEqual([
      'Age 35: today',
      'Age 35: TFSA yearly limit reached',
      'Age 45: TFSA lifetime limit reached',
      'Age 55: retirement',
    ]);
    const rows = tableRows(root);
    expect(rows[0][6]).toBe('R 46 000,00');
    expect(rows[10][0]).toBe('45');
    expect(rows[10][6]).toBe('R 40 000,00');
    expect(rows[11][6]).toBe('R 0,00');
    expect(text(root.querySelector('.journey__lead'))).toBe(
      "TFSA at 55: R 500 000,00 (R 500 000,00 in today's money)",
    );
    expect(text(root.querySelector('.rw-ring-gauge__centre'))).toBe('100%');
    expect(text(root.querySelector('.journey__track .journey__text'))).toBe(
      'R 500 000,00 of the R 500 000,00 lifetime limit.',
    );
  });

  it('warns when the RA is above the room you can deduct', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Monthly RA contribution now', 9_000);
    expect(warnings(root).some((w) => w.includes('gets no tax relief'))).toBe(true);
    expect(milestones(root)).toContain('Age 35: RA deduction limit used');
  });

  it('warns about a retirement age below the earliest payout age', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Retirement age', 50);
    expect(warnings(root).some((w) => w.includes('cannot pay out before age 55'))).toBe(true);
  });

  it('draws the two balances in one chart with a text alternative', async () => {
    const { root } = await render();
    const chart = root.querySelector('rw-line-chart');
    expect(chart).not.toBeNull();
    expect(chart?.textContent).toContain("RA balance (today's money)");
    expect(chart?.textContent).toContain("TFSA balance (today's money)");
  });

  it('offers to send the figures on, but not back to the Journey', async () => {
    const { root } = await render();
    const targets = Array.from(root.querySelectorAll('.rw-send-to__target')).map((el) => text(el));
    expect(targets.some((label) => label.startsWith('Retirement annuity'))).toBe(true);
    expect(targets.some((label) => label.startsWith('Retire at 55'))).toBe(true);
    expect(targets.some((label) => label.startsWith('Budget'))).toBe(true);
    expect(targets.some((label) => label.startsWith('Journey'))).toBe(false);
  });

  it('shows the "From" chip for a Budget send with its note, and Undo puts the earlier figures back', async () => {
    const { fixture, root } = await render();
    TestBed.inject(PlanContextStore).send('journey', 'budget', {
      ...SALARY,
      tfsaTopUpMonthly: 2_000,
      budgetNetMonthly: 38_747.3,
      budgetEmergencyMonthly: 1_500,
    });
    await fixture.whenStable();
    expect(text(root.querySelector('rw-handoff-chip rw-chip'))).toBe('From Budget');
    expect(inputByLabel(root, 'Monthly TFSA top-up').value).toBe('2000');
    expect(inputByLabel(root, 'Gross pay per month').value).toBe('50000');
    expect(text(root.querySelector('.journey__results > .journey__text'))).toBe(
      'Your budget has R 38 747,30 a month to spend. R 1 500,00 a month goes to your emergency fund. The journey does not use these figures.',
    );
    const buttons = Array.from(root.querySelectorAll('button'));
    buttons.find((b) => text(b) === 'Undo')?.click();
    await fixture.whenStable();
    expect(root.querySelector('rw-handoff-chip')).toBeNull();
    expect(inputByLabel(root, 'Monthly TFSA top-up').value).toBe('1000');
    expect(inputByLabel(root, 'Gross pay per month').value).toBe('30000');
    expect(root.querySelector('.journey__results > .journey__text')).toBeNull();
  });

  it('resets to the example', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Monthly TFSA top-up', 3_000);
    expect(text(root.querySelector('rw-chip'))).toBe('');
    const reset = Array.from(root.querySelectorAll('button')).find(
      (b) => text(b) === 'Reset to example',
    );
    reset?.click();
    await fixture.whenStable();
    expect(inputByLabel(root, 'Monthly TFSA top-up').value).toBe('1000');
    expect(text(root.querySelector('rw-chip'))).toBe('Example');
  });

  it('says what the journey is based on, with the tax year and the timing', async () => {
    const { root } = await render();
    const note = text(root.querySelector('.journey__results > .journey__note'));
    expect(note).toContain('Based on tax year');
    expect(note).toContain('draft');
    expect(note).toContain('R 46 000,00 a year, R 500 000,00 for life');
    expect(note).toContain('not raised for inflation');
    expect(note).toContain('nothing is saved');
  });

  it('has a polite live region for the result', async () => {
    const { fixture, root } = await render();
    await typeJ1(fixture);
    expect(text(root.querySelector('[aria-live=polite]'))).toBe(
      "Tax saved by 55: R 22 751,40. TFSA at 55: R 58 751,40 (R 58 751,40 in today's money).",
    );
  });

  it('labels every input and both choices', async () => {
    const { root } = await render();
    const inputs = Array.from(root.querySelectorAll('input'));
    expect(inputs.length).toBeGreaterThan(15);
    for (const input of inputs) {
      const label = input.id
        ? root.querySelector(`label[for="${input.id}"]`)
        : input.closest('label');
      const name = input.getAttribute('aria-label') || text(label);
      expect(name, `an input of type ${input.type} has no label`).not.toBe('');
    }
    const legends = Array.from(root.querySelectorAll('legend')).map((el) => text(el));
    expect(legends).toEqual(['Tax saving arrives as', 'Allow TFSA over-contribution']);
  });

  it('shows a card, not figures, when there is no tax data', async () => {
    const { root } = await render(false);
    expect(text(root.querySelector('.journey__unavailable'))).toBe(
      'Tax data is unavailable, so the journey cannot be worked out.',
    );
    expect(root.querySelector('.journey__hero')).toBeNull();
    expect(root.querySelector('.journey__results > .journey__note')).toBeNull();
    expect(text(root.querySelector('[aria-live=polite]'))).toBe('');
  });
});
