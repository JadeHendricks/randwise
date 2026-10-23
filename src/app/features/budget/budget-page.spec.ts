import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TODAY } from '../../core/data/data-source';
import { PlanContextStore } from '../../core/plan/plan-context.store';
import { LIVE_REGION_SETTLE_MS } from '../../shared/atoms/live-region/live-region';
import { FakeMatchMedia, installFakeMatchMedia } from '../../testing/fake-match-media';
import { provideTestData } from '../../testing/tax-data-fixtures';
import { normaliseSpaces } from '../../testing/text';
import { BudgetPage } from './budget-page';

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

describe('BudgetPage', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
  });
  afterEach(() => fake.uninstall());

  async function render(withData = true) {
    TestBed.configureTestingModule({
      providers: [
        { provide: LIVE_REGION_SETTLE_MS, useValue: 0 },
        provideRouter([]),
        withData
          ? { provide: TODAY, useValue: () => new Date(TODAY_PINNED) }
          : provideTestData({ taxYears: [], today: TODAY_PINNED }),
      ],
    });
    const fixture = TestBed.createComponent(BudgetPage);
    await fixture.whenStable();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  const text = (el: Element | null | undefined) => normaliseSpaces(el?.textContent);

  const hero = (root: HTMLElement) =>
    text(root.querySelector('.budget__hero .rw-money--hero .rw-money__figure'));

  function inputByLabel(root: HTMLElement, label: string): HTMLInputElement {
    const found = Array.from(root.querySelectorAll('label')).find((el) => text(el) === label);
    const input = found?.htmlFor ? root.ownerDocument.getElementById(found.htmlFor) : null;
    if (!(input instanceof HTMLInputElement)) throw new Error(`no field "${label}"`);
    return input;
  }

  async function type(fixture: ComponentFixture<BudgetPage>, label: string, value: number) {
    const input = inputByLabel(fixture.nativeElement, label);
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  }

  async function commit(fixture: ComponentFixture<BudgetPage>, label: string, value: string) {
    const input = inputByLabel(fixture.nativeElement, label);
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
  }

  function button(root: HTMLElement, label: string): HTMLButtonElement {
    // A Remove button has the visible text "Remove" and the line name in its aria-label.
    const found = Array.from(root.querySelectorAll('button')).find(
      (b) => text(b) === label || b.getAttribute('aria-label') === label,
    );
    if (!found) throw new Error(`no button "${label}"`);
    return found;
  }

  async function choose(fixture: ComponentFixture<BudgetPage>, label: string) {
    const radio = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLLabelElement>(
        'rw-segmented-control label',
      ),
    ).find((el) => text(el) === label);
    radio?.querySelector('input')?.click();
    await fixture.whenStable();
  }

  const headings = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('.budget__group > .budget__title')).map((h) => text(h));
  const checks = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('.budget__check')).map((el) => text(el));
  const rows = (root: HTMLElement) => root.querySelectorAll('rw-category-row').length;

  it('shows the default example: R 25 141,88 with every rand given a job', async () => {
    const { root } = await render();
    expect(text(root.querySelector('.budget__eyebrow'))).toBe('Monthly take-home');
    expect(hero(root)).toBe('R 25 141,88');
    expect(text(root.querySelector('.budget__lead'))).toBe('Every rand has a job');
    expect(root.querySelector('.budget__error')).toBeNull();
    expect(text(root.querySelector('rw-chip'))).toBe('Example');
  });

  it('splits the example 50/30/20 and shows each group with its amount and share', async () => {
    const { root } = await render();
    // 25 141.88 x 0.5 = 12 570.94; x 0.3 = 7 542.564; x 0.2 = 5 028.376.
    expect(headings(root)).toEqual([
      'Needs R 12 570,94 (50%)',
      'Wants R 7 542,56 (30%)',
      'Savings R 5 028,38 (20%)',
    ]);
    expect(text(root.querySelector('.budget__hero .budget__text'))).toBe(
      'Needs R 12 570,94, Wants R 7 542,56, Savings R 5 028,38, Unallocated R 0,00.',
    );
  });

  it('puts R 5 028,38 in Housing, 20% of take-home, and the same figures in every line', async () => {
    const { root } = await render();
    // Housing is 0.4 of the needs: 12 570.94 x 0.4 = 5 028.376.
    expect(inputByLabel(root, 'Housing per month').value).toBe('5028.38');
    expect(inputByLabel(root, 'Housing share of take-home').value).toBe('20');
    expect(rows(root)).toBe(12);
  });

  it('shows the over-allocation and the TFSA penalty after typing R 4 000 for the TFSA', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Tax-free savings (TFSA) per month', 4_000);
    // 4 000 - 1 508.5128 = 2 491.4872 over; 48 000 against 46 000 is R2 000 over at 40% = R800.
    expect(text(root.querySelector('.budget__lead'))).toBe('Over-allocated by R 2 491,49');
    expect(text(root.querySelector('[role=alert]'))).toContain(
      'R 2 491,49 more than your take-home',
    );
    const list = checks(root);
    expect(list.some((line) => line.includes('R 2 000,00 over the R 46 000,00 annual limit'))).toBe(
      true,
    );
    expect(list.some((line) => line.includes('R 800,00'))).toBe(true);
    expect(root.querySelectorAll('.budget__check--warn rw-icon').length).toBe(2);
  });

  it('warns about RA contributions over the headroom and states the refund', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Retirement annuity (RA) per month', 9_000);
    const list = checks(root);
    // 108 000 a year against 99 000 of headroom: R9 000 gets no relief; saving 0.26 x 99 000 = 25 740.
    expect(list[0]).toContain('Your RA line is R 108 000,00 a year.');
    expect(list[0]).toContain('saves about R 25 740,00 a year in tax, paid to you as a refund');
    expect(list[1]).toContain('R 9 000,00 of your RA line is over the R 99 000,00 a year');
  });

  it('shows how long the emergency fund takes: 38 months at R 1 005,68 toward R 37 712,82', async () => {
    const { root } = await render();
    // 3 x needs 12 570.94 = 37 712.82; 37 712.82 / 1 005.6752 = 37.5 -> 38.
    expect(text(root.querySelector('.budget__facts'))).toContain(
      'Target R 37 712,82 (3 months of needs). At R 1 005,68 a month you reach it in 38 months.',
    );
    expect(text(root.querySelector('.rw-ring-gauge__centre'))).toBe('0%');
  });

  it('follows the emergency settings', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Already in your emergency fund', 10_000);
    expect(text(root.querySelector('.rw-ring-gauge__centre'))).toBe('27%');
    expect(text(root.querySelector('.budget__facts'))).toContain('in 28 months');
  });

  it('sets 60/20/20: Housing becomes R 6 034,05 and the pressed preset moves', async () => {
    const { fixture, root } = await render();
    button(root, '60/20/20').click();
    await fixture.whenStable();
    // 25 141.88 x 0.6 x 0.4 = 6 034.0512
    expect(inputByLabel(root, 'Housing per month').value).toBe('6034.05');
    expect(button(root, '60/20/20').getAttribute('aria-pressed')).toBe('true');
    expect(button(root, '50/30/20').getAttribute('aria-pressed')).toBe('false');
    expect(text(root.querySelector('.budget__lead'))).toBe('Every rand has a job');
  });

  it('marks the pressed preset with a tick as well as its fill colour', async () => {
    const { fixture, root } = await render();
    button(root, '60/20/20').click();
    await fixture.whenStable();
    expect(button(root, '60/20/20').querySelector('rw-icon')).not.toBeNull();
    expect(button(root, '50/30/20').querySelector('rw-icon')).toBeNull();
  });

  it('exposes the presets as a labelled group of toggle buttons and marks Custom after an edit', async () => {
    const { fixture, root } = await render();
    const group = root.querySelector('[role=group]');
    expect(group?.getAttribute('aria-label')).toBe('Start from a preset');
    const presets = Array.from(group?.querySelectorAll('button') ?? []);
    expect(presets.map((b) => text(b))).toEqual(['50/30/20', '60/20/20', '70/20/10']);
    expect(presets.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    expect(presets[1].getAttribute('aria-label')).toBe(
      '60/20/20 preset: 60% needs, 20% wants, 20% savings',
    );
    expect(group?.querySelector('rw-chip')).toBeNull();

    await type(fixture, 'Housing per month', 6_000);
    const after = Array.from(root.querySelectorAll('[role=group] button'));
    expect(after.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false']);
    expect(text(root.querySelector('[role=group] rw-chip'))).toBe('Custom');
  });

  it('sets a line from its share of take-home', async () => {
    const { fixture, root } = await render();
    await commit(fixture, 'Housing share of take-home', '10');
    // 10% of 25 141.88 = 2 514.188
    expect(inputByLabel(root, 'Housing per month').value).toBe('2514.19');
    // Housing falls from 5 028.376 to 2 514.188, so the difference is left unallocated.
    expect(text(root.querySelector('.budget__lead'))).toBe('Unallocated R 2 514,19');
  });

  it('adds, renames and removes a custom line and keeps the others as they were', async () => {
    const { fixture, root } = await render();
    button(root, 'Add a need').click();
    await fixture.whenStable();
    expect(rows(root)).toBe(13);
    expect(inputByLabel(root, 'New need per month').value).toBe('0');

    await commit(fixture, 'Name of New need', '  Pet food ');
    expect(inputByLabel(root, 'Pet food per month').value).toBe('0');
    expect(inputByLabel(root, 'Housing per month').value).toBe('5028.38');

    await type(fixture, 'Pet food per month', 400);
    expect(headings(root)[0]).toBe('Needs R 12 970,94 (51,6%)');

    button(root, 'Remove Pet food').click();
    await fixture.whenStable();
    expect(rows(root)).toBe(12);
    expect(headings(root)[0]).toBe('Needs R 12 570,94 (50%)');
    expect(inputByLabel(root, 'Housing per month').value).toBe('5028.38');
  });

  it('moves focus to the group Add button when a custom line is removed', async () => {
    const { fixture, root } = await render();
    // Focus only moves in an attached document.
    document.body.appendChild(root);
    try {
      button(root, 'Add a need').click();
      await fixture.whenStable();
      button(root, 'Remove New need').focus();
      button(root, 'Remove New need').click();
      await fixture.whenStable();
      expect(document.activeElement).toBe(button(root, 'Add a need'));
    } finally {
      root.remove();
    }
  });

  it('lets a line hold a sent amount above the take-home cap', async () => {
    const { fixture, root } = await render();
    // Take-home is R 25 141,88, so the shared cap is R 26 000; a handoff can carry more.
    TestBed.inject(PlanContextStore).setBudgetAmount('housing', 46_864);
    await fixture.whenStable();
    const field = inputByLabel(root, 'Housing per month');
    expect(field.value).toBe('46864');
    expect(Number(field.max)).toBeGreaterThanOrEqual(46_864);
    expect(Number(inputByLabel(root, 'Transport per month').max)).toBe(26_000);
  });

  it('shows R 32 138,13 for a gross pay of R40 000', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Gross pay per month', 40_000);
    // 480 000: 79 998 + 0.31 x 96 900 = 110 037 - 17 820 = 92 217 -> 7 684.75 a month;
    // 40 000 - 7 684.75 - 177.12 (UIF) = 32 138.13.
    expect(hero(root)).toBe('R 32 138,13');
    expect(text(root.querySelector('.budget__lead'))).toBe('Every rand has a job');
    expect(text(root.querySelector('rw-chip'))).toBe('');
    expect(button(root, 'Reset to example')).toBeTruthy();
  });

  it('keeps the same person when the amount switches to take-home pay', async () => {
    const { fixture, root } = await render();
    await choose(fixture, 'Take-home pay');
    expect(inputByLabel(root, 'Take-home pay per month').value).toBe('25141.88');
    expect(hero(root)).toBe('R 25 141,88');
    await choose(fixture, 'Per year');
    expect(inputByLabel(root, 'Take-home pay per year').value).toBe('301702.56');
    expect(hero(root)).toBe('R 25 141,88');
  });

  it('takes payroll contributions and other deductions out of the base', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Other deductions per month', 1_000);
    expect(hero(root)).toBe('R 24 141,88');
  });

  it('resets to the example', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Housing per month', 6_000);
    button(root, 'Reset to example').click();
    await fixture.whenStable();
    expect(inputByLabel(root, 'Housing per month').value).toBe('5028.38');
    expect(text(root.querySelector('rw-chip'))).toBe('Example');
  });

  it('shows the "From" chip for a handoff and Undo puts the earlier income back', async () => {
    const { fixture, root } = await render();
    TestBed.inject(PlanContextStore).send('budget', 'salary', SALARY);
    await fixture.whenStable();
    expect(text(root.querySelector('rw-handoff-chip rw-chip'))).toBe('From Salary');
    expect(inputByLabel(root, 'Gross pay per month').value).toBe('50000');
    // 600 000: 125 599 + 0.36 x 69 800 = 150 727 - 17 820 = 132 907 -> 11 075.58; 50 000 - 11 075.58 - 177.12.
    expect(hero(root)).toBe('R 38 747,30');
    button(root, 'Undo').click();
    await fixture.whenStable();
    expect(root.querySelector('rw-handoff-chip')).toBeNull();
    expect(hero(root)).toBe('R 25 141,88');
  });

  it('shows a salary failure as an alert and hides the budget', async () => {
    const { fixture, root } = await render();
    TestBed.inject(PlanContextStore).updateBudgetIncome({ basis: 'net', amount: 5e9 });
    await fixture.whenStable();
    expect(text(root.querySelector('[role=alert]'))).toBe(
      'That take-home amount is too high to work back to a salary. Try a smaller amount.',
    );
    expect(root.querySelector('.budget__hero')).toBeNull();
    expect(rows(root)).toBe(0);
  });

  it('offers to send the figures on, but not back to the Budget', async () => {
    const { root } = await render();
    const targets = Array.from(root.querySelectorAll('.rw-send-to__target')).map((el) => text(el));
    expect(targets[0]).toBe('Retirement annuity');
    expect(targets).not.toContain('Budget');
    expect(targets.some((label) => label.startsWith('Journey'))).toBe(true);
  });

  it('says what the budget is based on, with the tax year', async () => {
    const { root } = await render();
    const note = text(root.querySelector('.budget__results > .budget__note'));
    expect(note).toContain('Based on tax year');
    expect(note).toContain('draft');
    expect(note).toContain('built on your take-home pay');
    expect(note).toContain('R 46 000,00 a tax year and R 500 000,00 for life');
    expect(note).toContain('nothing is saved');
  });

  it('has a polite live region for the result', async () => {
    const { fixture, root } = await render();
    const live = root.querySelector('[aria-live=polite]');
    expect(text(live)).toBe('Take-home R 25 141,88 a month. Every rand has a job.');
    await type(fixture, 'Tax-free savings (TFSA) per month', 4_000);
    expect(text(live)).toBe('Take-home R 25 141,88 a month. Over-allocated by R 2 491,49.');
  });

  it('labels every input', async () => {
    const { root } = await render();
    const inputs = Array.from(root.querySelectorAll('input'));
    expect(inputs.length).toBeGreaterThan(30);
    for (const input of inputs) {
      const label = input.id
        ? root.querySelector(`label[for="${input.id}"]`)
        : input.closest('label');
      const name = input.getAttribute('aria-label') || text(label);
      expect(name, `an input of type ${input.type} has no label`).not.toBe('');
    }
  });

  it('shows a card, not figures, when there is no tax data', async () => {
    const { root } = await render(false);
    expect(text(root.querySelector('.budget__unavailable'))).toBe(
      'Tax data is unavailable, so the budget cannot be worked out.',
    );
    expect(root.querySelector('.budget__hero')).toBeNull();
    expect(root.querySelector('.budget__results > .budget__note')).toBeNull();
    expect(text(root.querySelector('[aria-live=polite]'))).toBe('');
  });
});
