import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TODAY } from '../../core/data/data-source';
import { PlanContextStore } from '../../core/plan/plan-context.store';
import { FakeMatchMedia, installFakeMatchMedia } from '../../testing/fake-match-media';
import { provideTestData } from '../../testing/tax-data-fixtures';
import { normaliseSpaces } from '../../testing/text';
import { RetirePage } from './retire-page';

// Pinned so the bundled 2027 file (status draft, checked 22 Oct 2026) is the year in use. The
// fixture UIF ceiling is fake, so money assertions use the bundled data, not provideTestData.
const TODAY_PINNED = new Date(2026, 9, 22);

describe('RetirePage', () => {
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
    const fixture = TestBed.createComponent(RetirePage);
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
  const statText = (root: HTMLElement, label: string) =>
    text(stat(root, label).querySelector('.rw-stat-card__text'));
  const statSecondary = (root: HTMLElement, label: string) =>
    text(stat(root, label).querySelector('.rw-stat-card__secondary'));

  function factOf(root: HTMLElement, label: string): Element {
    const item = Array.from(root.querySelectorAll('.retire__fact')).find(
      (el) => text(el.querySelector('dt')) === label,
    );
    if (!item) throw new Error(`no fact "${label}"`);
    return item;
  }
  const fact = (root: HTMLElement, label: string) =>
    text(factOf(root, label).querySelector('.rw-money__figure'));
  const factNote = (root: HTMLElement, label: string) =>
    text(factOf(root, label).querySelector('.retire__fact-note'));
  const hasFact = (root: HTMLElement, label: string) =>
    Array.from(root.querySelectorAll('.retire__fact')).some(
      (el) => text(el.querySelector('dt')) === label,
    );

  const hero = (root: HTMLElement) =>
    text(root.querySelector('.retire__hero .rw-money--hero .rw-money__figure'));

  function field(root: HTMLElement, label: string): HTMLInputElement {
    const host = Array.from(root.querySelectorAll('rw-amount-field')).find(
      (el) => text(el.querySelector('label')) === label,
    );
    const input = host?.querySelector<HTMLInputElement>('input[type=number]');
    if (!input) throw new Error(`no field "${label}"`);
    return input;
  }

  async function type(fixture: ComponentFixture<RetirePage>, label: string, value: number) {
    const input = field(fixture.nativeElement, label);
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  }

  async function chooseLump(fixture: ComponentFixture<RetirePage>, label: 'Yes' | 'No') {
    const radio = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLLabelElement>(
        'rw-segmented-control label',
      ),
    ).find((el) => text(el) === label);
    radio?.querySelector('input')?.click();
    await fixture.whenStable();
  }

  function button(root: HTMLElement, label: string): HTMLButtonElement {
    const found = Array.from(root.querySelectorAll('button')).find((b) => text(b) === label);
    if (!found) throw new Error(`no button "${label}"`);
    return found;
  }

  const warnings = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('.retire__warning')).map((w) => text(w));

  const incomeRows = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('.retire__table tbody tr')).map((tr) =>
      Array.from(tr.children).map((c) => text(c)),
    );

  it('shows the default example: R 46 864,26 a month to retire at 55 on R 50 000', async () => {
    const { root } = await render();
    expect(text(root.querySelector('.retire__eyebrow'))).toBe('Required monthly contribution');
    expect(hero(root)).toBe('R 46 864,26');
    const heroText = text(root.querySelector('.retire__hero'));
    expect(heroText).toContain("to retire at 55 on R 50 000 a month in today's money.");
    expect(heroText).toContain(
      'Or keep R 2 000 a month and earn 36,7% a year before retirement.',
    );
  });

  it('shows the capital needed, in future and today’s money, and the income at 55', async () => {
    const { root } = await render();
    expect(text(root.querySelectorAll('.retire__card .retire__title')[1])).toBe(
      'Capital you need at 55',
    );
    expect(fact(root, 'In future money')).toBe('R 45 460 996,91');
    expect(fact(root, "In today's money")).toBe('R 18 850 077,76');
    expect(fact(root, 'Income before tax at 55')).toBe('R 189 420,82');
    expect(factNote(root, 'Income before tax at 55')).toBe('a month');
    expect(fact(root, 'Tax on that income')).toBe('R 68 835,12');
    expect(fact(root, 'Income after tax at 55')).toBe('R 120 585,70');
  });

  it('shows how on track the current contribution is', async () => {
    const { root } = await render();
    expect(text(root.querySelector('.rw-ring-gauge__centre'))).toBe('4%');
    expect(text(root.querySelector('.rw-ring-gauge__caption'))).toBe('on track');
    expect(fact(root, 'Projected at 55 at your current contribution')).toBe('R 1 940 113,55');
    expect(factNote(root, 'Projected at 55 at your current contribution')).toBe(
      "R 804 454,23 in today's money",
    );
    expect(fact(root, "Shortfall in today's money")).toBe('R 18 045 623,53');
    expect(hasFact(root, "Surplus in today's money")).toBe(false);
  });

  it('shows the stats: cost after tax, how long the money lasts and the return needed', async () => {
    const { root } = await render();
    // 46 864.264013 - 2 145 tax saving = 44 719.264013 (plan G10).
    expect(statMoney(root, 'Cost after tax')).toBe('R 44 719,26');
    expect(statSecondary(root, 'Cost after tax')).toBe('a month in the first year');
    expect(statText(root, 'Money lasts until')).toBe('Age 83');
    expect(statSecondary(root, 'Money lasts until')).toBe('At your current contribution: age 55');
    expect(statText(root, 'Return needed at your current contribution')).toBe('36,7%');
  });

  it('warns about the unrealistic required return and the drawdown cap, naming age 78', async () => {
    const { root } = await render();
    const list = warnings(root);
    expect(list).toHaveLength(2);
    expect(list[0]).toContain('36,7% a year');
    expect(list[0]).toContain('far above what is usually realistic');
    expect(list[1]).toBe(
      'From age 78 this income is more than 17,5% of the balance, so a living annuity would have to pay less.',
    );
  });

  it('lists the income at 55, 65 and 75 with the age rebates applied', async () => {
    const { root } = await render();
    expect(text(root.querySelector('.retire__table caption'))).toBe('Your income in retirement');
    expect(incomeRows(root)).toEqual([
      ['55', 'R 189 420,82', 'R 68 835,12', 'R 120 585,70'],
      ['65', 'R 294 164,74', 'R 115 156,13', 'R 179 008,61'],
      ['75', 'R 456 828,85', 'R 188 084,23', 'R 268 744,62'],
    ]);
    expect(text(root.querySelector('.retire__card:has(.retire__table)'))).toContain(
      'From 65 and again from 75 extra age rebates lower the tax.',
    );
  });

  it('leaves out income rows from the year the money runs out', async () => {
    const { fixture, root } = await render();
    // No inflation and no growth in retirement: a 5% first-year drawdown is a flat 5% of the
    // capital a year, so 20 years of income empties it and the money runs out at 55 + 20 = 75.
    // The row at 75 is not an income year any more, so only 55 and 65 are listed.
    await type(fixture, 'Inflation per year', 0);
    await type(fixture, 'Return in retirement per year', 0);
    expect(text(stat(root, 'Money lasts until').querySelector('.rw-stat-card__text'))).toBe('Age 75');
    expect(incomeRows(root).map((row) => row[0])).toEqual(['55', '65']);
  });

  it('recalculates when the goal changes: R 20 000 needs R 16 049,23 a month', async () => {
    const { fixture, root } = await render();
    await type(fixture, "Monthly income you want in retirement (today's money)", 20_000);
    expect(hero(root)).toBe('R 16 049,23');
    expect(text(root.querySelector('.retire__hero'))).toContain(
      "on R 20 000 a month in today's money",
    );
  });

  it('shows a range alert for a drawdown outside 2,5% to 17,5% and recovers at the edge', async () => {
    const { fixture, root } = await render();
    for (const value of [2.4, 17.6]) {
      await type(fixture, 'Living annuity drawdown per year', value);
      const alert = root.querySelector('[role=alert]');
      expect(text(alert), `drawdown ${value}`).toContain('between 2,5% and 17,5%');
      expect(root.querySelector('.retire__hero'), `drawdown ${value}`).toBeNull();
      expect(text(root.querySelector('[aria-live=polite]'))).toBe('');
    }
    await type(fixture, 'Living annuity drawdown per year', 17.5);
    expect(root.querySelector('[role=alert]')).toBeNull();
    expect(root.querySelector('.retire__hero')).not.toBeNull();
  });

  it('shows an alert for a retirement age before 55', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Retirement age', 50);
    const alert = text(root.querySelector('[role=alert]'));
    expect(alert).toContain('before age 55');
    expect(alert).toContain('Choose a retirement age of 55 or more.');
    expect(root.querySelector('.retire__hero')).toBeNull();
  });

  it('shows an alert when the person is already at the retirement age', async () => {
    const { fixture, root } = await render();
    await type(fixture, 'Current age', 60);
    expect(text(root.querySelector('[role=alert]'))).toBe(
      'Your retirement age must be later than your current age.',
    );
  });

  it('shows the one-third lump sum card when it is switched on', async () => {
    const { fixture, root } = await render();
    expect(hasFact(root, 'Lump sum')).toBe(false);
    expect(text(root.querySelector('.retire__results'))).toContain(
      'You can take up to one third of your RA as a cash lump sum',
    );

    await chooseLump(fixture, 'Yes');
    expect(fact(root, 'In future money')).toBe('R 68 191 495,36');
    expect(fact(root, 'Lump sum')).toBe('R 22 730 498,45');
    expect(fact(root, 'Tax on the lump sum')).toBe('R 7 910 729,44');
    expect(fact(root, 'Lump sum after tax')).toBe('R 14 819 769,01');
    expect(fact(root, 'Left to buy the living annuity')).toBe('R 45 460 996,91');
    expect(hero(root)).toBe('R 70 296,40');
    expect(text(root.querySelector('.retire__results'))).toContain('only lump sum');

    await chooseLump(fixture, 'No');
    expect(hero(root)).toBe('R 46 864,26');
    expect(hasFact(root, 'Lump sum')).toBe(false);
  });

  it('shows a surplus and a full ring when no income is needed', async () => {
    const { fixture, root } = await render();
    await type(fixture, "Monthly income you want in retirement (today's money)", 0);
    expect(hero(root)).toBe('R 0,00');
    expect(text(root.querySelector('.rw-ring-gauge__centre'))).toBe('100%');
    expect(fact(root, "Surplus in today's money")).toBe('R 804 454,23');
    expect(hasFact(root, "Shortfall in today's money")).toBe(false);
    expect(warnings(root)).toEqual([]);
  });

  it('labels the defaults as an example that can be reset', async () => {
    const { fixture, root } = await render();
    expect(text(root.querySelector('.retire__inputs rw-chip'))).toBe('Example');
    expect(text(root.querySelector('.retire__intro'))).toContain(
      "This is an example: R 50 000 a month in today's money from age 55, on a R 30 000 salary.",
    );
    await type(fixture, 'Monthly RA contribution now', 3000);
    expect(root.querySelector('.retire__intro')).toBeNull();
    expect(root.querySelector('.retire__inputs rw-chip')).toBeNull();
    button(root, 'Reset to example').click();
    await fixture.whenStable();
    expect(root.querySelector('.retire__intro')).not.toBeNull();
    expect(field(root, 'Monthly RA contribution now').value).toBe('2000');
  });

  it('takes inflation and returns from the rates and says they can be changed', async () => {
    const { root } = await render();
    expect(field(root, 'Inflation per year').value).toBe('4.5');
    expect(field(root, 'Return before retirement per year').value).toBe('9.5');
    expect(field(root, 'Return in retirement per year').value).toBe('7.5');
    expect(field(root, 'Living annuity drawdown per year').value).toBe('5');
    const block = text(root.querySelector('.retire__assumptions'));
    expect(block).toContain('latest CPI rate');
    expect(block).toContain('CPI plus 5 percentage points');
    expect(block).toContain('in retirement your money earns CPI plus 3 percentage points (7.5%)');
  });

  it('builds the hints from the tax data', async () => {
    const { root } = await render();
    const hints = Array.from(root.querySelectorAll('.rw-amount-field__hint')).map((h) => text(h));
    expect(hints).toContain('An RA pays out from age 55 at the earliest.');
    expect(hints).toContain(
      'The share of the balance you draw each year. The law allows 2,5% to 17,5%.',
    );
  });

  it('shows a From Salary chip after a handoff and Undo restores the earlier local values', async () => {
    const { fixture, root } = await render();
    const plan = TestBed.inject(PlanContextStore);
    plan.updateRetire({ age: 45, grossMonthly: 50_000 });
    plan.send('retire', 'salary', {
      grossMonthly: 30_000,
      age: 40,
      medicalMembers: 0,
      employeeRetirementMonthly: 0,
      employerRetirementMonthly: 0,
    });
    await fixture.whenStable();
    expect(text(root.querySelector('rw-handoff-chip'))).toContain('From Salary');
    expect(field(root, 'Current age').value).toBe('40');

    const undo = root.querySelector<HTMLButtonElement>('.rw-handoff-chip__undo');
    expect(undo?.getAttribute('aria-label')).toBe('Undo figures from Salary');
    undo?.click();
    await fixture.whenStable();
    expect(field(root, 'Current age').value).toBe('45');
    expect(field(root, 'Gross pay per month').value).toBe('50000');
    expect(root.querySelector('rw-handoff-chip')).toBeNull();
  });

  it('gives every input an accessible label', async () => {
    const { root } = await render();
    const inputs = Array.from(root.querySelectorAll('input'));
    // 14 amount fields (a number input and a slider each) and the two lump-sum radios.
    expect(inputs.length).toBe(30);
    for (const input of inputs) {
      const named = (input.labels?.length ?? 0) > 0 || !!input.getAttribute('aria-label')?.trim();
      expect(named, `${input.type} input`).toBe(true);
    }
    expect(text(root.querySelector('rw-segmented-control legend'))).toBe(
      'Take a one-third lump sum at retirement',
    );
  });

  it('groups the inputs under clear headings', async () => {
    const { root } = await render();
    const headings = Array.from(root.querySelectorAll('h3')).map((h) => text(h));
    expect(headings).toEqual([
      'Your RA today',
      'Assumptions you can change',
      'Your salary (used for tax)',
    ]);
  });

  it('renders each chart as a labelled svg image with a data table', async () => {
    const { root } = await render();
    for (const block of ['rw-line-chart', 'rw-ring-gauge']) {
      const svgs = root.querySelectorAll(`${block} svg[role=img]`);
      expect(svgs.length, block).toBe(1);
      expect(svgs[0].getAttribute('aria-label')?.trim(), block).toBeTruthy();
      expect(root.querySelector(`${block} .rw-visually-hidden table`), block).not.toBeNull();
    }
    expect(root.querySelectorAll('rw-line-chart .rw-visually-hidden table')).toHaveLength(2);
  });

  it('draws the plan and the current contribution, with the runs-out marker at 83', async () => {
    const { root } = await render();
    const items = Array.from(root.querySelectorAll('rw-line-chart .rw-line-chart__item')).map((i) =>
      text(i),
    );
    expect(items).toEqual(["Plan balance (today's money)", 'At your current contribution']);
    expect(text(root.querySelector('rw-line-chart .rw-line-chart__title--x'))).toBe('Age');
    expect(text(root.querySelector('rw-line-chart .rw-line-chart__title--y'))).toBe(
      "Balance in today's money",
    );
    expect(text(root.querySelector('rw-line-chart .rw-line-chart__note'))).toBe(
      'Money runs out at 83',
    );
    expect(root.querySelector('rw-line-chart .rw-line-chart__marker')).not.toBeNull();
  });

  it('has an income table with a caption and scoped headers', async () => {
    const { root } = await render();
    const table = root.querySelector('.retire__table') as HTMLTableElement;
    expect(text(table.caption)).toBe('Your income in retirement');
    expect(table.querySelectorAll('thead th[scope=col]').length).toBe(4);
    expect(table.querySelectorAll('tbody th[scope=row]').length).toBe(3);
  });

  it('announces the result politely', async () => {
    const { fixture, root } = await render();
    const live = root.querySelector('[aria-live=polite]') as HTMLElement;
    expect(live.classList).toContain('rw-visually-hidden');
    expect(text(live)).toBe('Required contribution R 46 864,26 a month. On track 4%.');
    // Goal R20 000: capital 15 568 667.74; the current contribution reaches 1 940 113.55 of it,
    // 1 940 113.55 / 15 568 667.74 = 12.46%.
    await type(fixture, "Monthly income you want in retirement (today's money)", 20_000);
    expect(text(live)).toBe('Required contribution R 16 049,23 a month. On track 12%.');
  });

  it('shows the tax year note and the method', async () => {
    const { root } = await render();
    const note = text(root.querySelector('.retire__note'));
    expect(note).toContain('Based on tax year 2026/27, draft data checked 22 Oct 2026.');
    expect(note).toContain('not raised for inflation');
    expect(note).toContain('nothing is saved');
  });

  it('shows an unavailable card without tax data', async () => {
    const { root } = await render(false);
    expect(text(root.querySelector('.retire__unavailable'))).toBe(
      'Tax data is unavailable, so retirement figures cannot be shown.',
    );
    expect(root.querySelector('.retire__hero')).toBeNull();
    expect(root.querySelector('[role=alert]')).toBeNull();
    expect(root.querySelector('.retire__note')).toBeNull();
  });

  it('does not touch browser storage', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const { fixture } = await render();
    await type(fixture, 'Retirement age', 60);
    await chooseLump(fixture, 'Yes');
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    get.mockRestore();
    set.mockRestore();
  });
});
