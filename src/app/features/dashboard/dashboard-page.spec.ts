import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TODAY } from '../../core/data/data-source';
import { roundRand } from '../../core/engine';
import { PlanBuilderStore } from '../../core/plan/plan-builder.store';
import { PlanContextStore } from '../../core/plan/plan-context.store';
import { SalaryInputsStore } from '../../core/salary/salary-inputs.store';
import { formatRand } from '../../shared/format/format-rand';
import { FakeMatchMedia, installFakeMatchMedia } from '../../testing/fake-match-media';
import { normaliseSpaces } from '../../testing/text';
import { provideTestData } from '../../testing/tax-data-fixtures';
import { DashboardPage } from './dashboard-page';

const pinned = new Date(2026, 9, 22);

describe('DashboardPage', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
    // Bundled data with only TODAY pinned: the test fixture has a fake UIF ceiling.
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: TODAY, useValue: () => new Date(pinned) }],
    });
  });
  afterEach(() => fake.uninstall());

  async function render() {
    const fixture = TestBed.createComponent(DashboardPage);
    await fixture.whenStable();
    return fixture;
  }

  function hero(root: HTMLElement) {
    return root.querySelector('.dashboard__hero') as HTMLElement;
  }

  it('shows the example take-home pay and links to the Pay page', async () => {
    const root = (await render()).nativeElement as HTMLElement;
    const card = hero(root);
    expect(normaliseSpaces(card.querySelector('.rw-money__figure')?.textContent)).toBe(
      'R 25 141,88',
    );
    expect(normaliseSpaces(card.querySelector('.dashboard__eyebrow')?.textContent)).toBe(
      'Example take-home pay',
    );
    const link = card.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/pay');
    expect(normaliseSpaces(link.textContent)).toBe('Open the Pay page');
    const lead = normaliseSpaces(card.querySelector('.dashboard__lead')?.textContent);
    expect(lead).toContain('R30 000');
    expect(lead).toContain('Example only. Change it on the Pay page.');
  });

  it('follows the Pay page inputs', async () => {
    const fixture = await render();
    TestBed.inject(SalaryInputsStore).update({ age: 65 });
    await fixture.whenStable();
    const card = hero(fixture.nativeElement as HTMLElement);
    expect(normaliseSpaces(card.querySelector('.rw-money__figure')?.textContent)).toBe(
      'R 25 955,63',
    );
    expect(normaliseSpaces(card.querySelector('.dashboard__eyebrow')?.textContent)).toBe(
      'Your take-home pay',
    );
    expect(card.textContent).not.toContain('Example only');
  });

  it('draws the gross split as an accessible dot matrix', async () => {
    const root = (await render()).nativeElement as HTMLElement;
    const svg = hero(root).querySelector('svg[role="img"]') as SVGElement;
    expect(svg.getAttribute('aria-label')).toContain('Net pay');
    expect(hero(root).querySelector('.rw-dot-matrix .rw-visually-hidden table')).not.toBeNull();
  });

  it('names the dot matrix columns in a visible caption', async () => {
    const root = (await render()).nativeElement as HTMLElement;
    expect(normaliseSpaces(root.querySelector('.dashboard__caption')?.textContent)).toBe(
      'Net pay (highlighted), PAYE, UIF, Retirement (RA), Other deductions',
    );
  });

  it('shows the estimator message instead of a figure when the estimate fails', async () => {
    const fixture = await render();
    TestBed.inject(SalaryInputsStore).update({ basis: 'net', amount: 5e9 });
    await fixture.whenStable();
    const card = hero(fixture.nativeElement as HTMLElement);
    expect(normaliseSpaces(card.querySelector('.dashboard__lead')?.textContent)).toBe(
      'That take-home amount is too high to work back to a salary. Try a smaller amount.',
    );
    expect(card.querySelector('.rw-money__figure')).toBeNull();
    expect(card.querySelector('.rw-dot-matrix')).toBeNull();
    expect(card.querySelector('.dashboard__caption')).toBeNull();
  });

  it('keeps one figure and no currency in the other tiles', async () => {
    const root = (await render()).nativeElement as HTMLElement;
    expect(root.querySelectorAll('.rw-money__figure').length).toBe(1);
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelector('.dashboard__hero')?.remove();
    // The RA, Retire at 55, Budget and Journey tiles are live now, so this covers the placeholder
    // tiles only.
    for (const live of ['ra', 'retire', 'budget', 'journey']) {
      clone.querySelector('.dashboard__' + live)?.remove();
    }
    expect(normaliseSpaces(clone.textContent)).not.toMatch(/R\s?\d/);
  });

  const raTile = (root: HTMLElement) =>
    normaliseSpaces(root.querySelector('.dashboard__ra')?.textContent);

  it('shows a live illustrative RA tile with headroom and tax saving', async () => {
    const root = (await render()).nativeElement as HTMLElement;
    const tile = raTile(root);
    expect(tile).toContain('Illustrative RA');
    expect(tile).toContain('R 99 000,00 a year (R 8 250,00 a month) of tax-deductible room');
    expect(tile).toContain('R 2 000 a month saves about R 6 240,00 tax a year');
    // The text sits between the description and the link.
    const card = root.querySelector('.dashboard__ra .rw-bento-tile__card') as HTMLElement;
    const order = Array.from(card.children).map((c) => c.className);
    expect(order.indexOf('rw-bento-tile__text')).toBeLessThan(
      order.findIndex((c) => c.includes('dashboard__ra-label')),
    );
  });

  it('lets the RA tile follow the Salary amount', async () => {
    const fixture = await render();
    TestBed.inject(SalaryInputsStore).update({ amount: 40_000 });
    await fixture.whenStable();
    const tile = raTile(fixture.nativeElement as HTMLElement);
    expect(tile).toContain('R 132 000,00');
    expect(tile).toContain('R 7 440,00');
  });

  const retireTile = (root: HTMLElement) =>
    normaliseSpaces(root.querySelector('.dashboard__retire')?.textContent);

  it('shows a live illustrative Retire at 55 tile with the required contribution', async () => {
    const root = (await render()).nativeElement as HTMLElement;
    const tile = retireTile(root);
    expect(tile).toContain('Illustrative plan');
    expect(tile).toContain("R 46 864 a month to retire at 55 on R 50 000 a month (today's money)");
    expect(tile).toContain('On track: 4%');
    // Plain text only: the dashboard keeps one money figure.
    expect(root.querySelector('.dashboard__retire .rw-money__figure')).toBeNull();
    const card = root.querySelector('.dashboard__retire .rw-bento-tile__card') as HTMLElement;
    const order = Array.from(card.children).map((c) => c.className);
    expect(order.indexOf('rw-bento-tile__text')).toBeLessThan(
      order.findIndex((c) => c.includes('dashboard__retire-label')),
    );
  });

  it('labels the Retire at 55 tile "Your plan" once the plan is edited', async () => {
    const fixture = await render();
    TestBed.inject(PlanContextStore).updateRetire({ goalNetMonthly: 20_000 });
    await fixture.whenStable();
    const tile = retireTile(fixture.nativeElement as HTMLElement);
    expect(tile).toContain('Your plan');
    expect(tile).not.toContain('Illustrative plan');
    expect(tile).toContain("R 16 049 a month to retire at 55 on R 20 000 a month (today's money)");
    expect(tile).toContain('On track: 12%');
  });

  it('asks to check the figures when the Retire at 55 plan fails', async () => {
    const fixture = await render();
    TestBed.inject(PlanContextStore).updateRetire({ drawdownPercent: 2.4 });
    await fixture.whenStable();
    const tile = retireTile(fixture.nativeElement as HTMLElement);
    expect(tile).toContain('Check the figures on the Retire at 55 page.');
    expect(tile).not.toContain('a month to retire at');
  });

  const budgetTile = (root: HTMLElement) =>
    normaliseSpaces(root.querySelector('.dashboard__budget')?.textContent);

  it('shows a live illustrative Budget tile: R 25 141,88 split 50/30/20 with every rand given a job', async () => {
    const root = (await render()).nativeElement as HTMLElement;
    const tile = budgetTile(root);
    expect(tile).toContain('Illustrative budget');
    expect(tile).toContain('R 25 141,88 take-home: needs 50%, wants 30%, savings 20%');
    expect(tile).toContain('Every rand has a job');
    // Plain text only: the dashboard keeps one money figure.
    expect(root.querySelector('.dashboard__budget .rw-money__figure')).toBeNull();
    const card = root.querySelector('.dashboard__budget .rw-bento-tile__card') as HTMLElement;
    const order = Array.from(card.children).map((c) => c.className);
    expect(order.indexOf('rw-bento-tile__text')).toBeLessThan(
      order.findIndex((c) => c.includes('dashboard__budget-label')),
    );
  });

  it('labels the Budget tile "Your budget" and reports what is unallocated or over', async () => {
    const fixture = await render();
    const plan = TestBed.inject(PlanContextStore);
    plan.setBudgetAmount('housing', 4_000);
    await fixture.whenStable();
    // Housing falls from 5 028.376 to 4 000: R1 028.38 unallocated.
    let tile = budgetTile(fixture.nativeElement as HTMLElement);
    expect(tile).toContain('Your budget');
    expect(tile).not.toContain('Illustrative budget');
    expect(tile).toContain('R 1 028,38 unallocated');

    plan.setBudgetAmount('housing', 7_000);
    await fixture.whenStable();
    // 7 000 - 5 028.376 = R1 971.62 over.
    tile = budgetTile(fixture.nativeElement as HTMLElement);
    expect(tile).toContain('Over by R 1 971,62');
  });

  it('asks to check the figures when the Budget income fails', async () => {
    const fixture = await render();
    TestBed.inject(PlanContextStore).updateBudgetIncome({ basis: 'net', amount: 5e9 });
    await fixture.whenStable();
    const tile = budgetTile(fixture.nativeElement as HTMLElement);
    expect(tile).toContain('Check the figures on the Budget page.');
    expect(tile).not.toContain('take-home:');
  });

  const journeyTile = (root: HTMLElement) =>
    normaliseSpaces(root.querySelector('.dashboard__journey')?.textContent);

  it('shows a live illustrative Journey tile with the engine figures', async () => {
    const fixture = await render();
    const root = fixture.nativeElement as HTMLElement;
    const outputs = TestBed.inject(PlanContextStore).journeyOutputs();
    if (!outputs) throw new Error('no journey outputs');
    const tile = journeyTile(root);
    const rand = (value: number) => normaliseSpaces(formatRand(roundRand(value)));
    expect(tile).toContain('Illustrative journey');
    expect(tile).toContain(`Saves about ${rand(outputs.taxSaved)} in tax by 55`);
    expect(tile).toContain(`TFSA at 55: ${rand(outputs.tfsaAtRetirement)}`);
    expect(outputs.taxSaved).toBeGreaterThan(0);
    expect(outputs.tfsaAtRetirement).toBeGreaterThan(0);
    expect(root.querySelector('.dashboard__journey .rw-money__figure')).toBeNull();
    expect(root.querySelectorAll('.rw-money__figure').length).toBe(1);
  });

  it('labels the Journey tile "Your journey" and shows the hand-checked J1 figures once edited', async () => {
    const fixture = await render();
    TestBed.inject(PlanContextStore).updateJourney({
      age: 52,
      retirementAge: 55,
      incomeEscalationPercent: 10,
      contributionMonthly: 2_000,
      escalationPercent: 10,
      tfsaTopUpMonthly: 1_000,
      returnPercent: 0,
      tfsaReturnPercent: 0,
      inflationPercent: 0,
    });
    await fixture.whenStable();
    const tile = journeyTile(fixture.nativeElement as HTMLElement);
    expect(tile).toContain('Your journey');
    expect(tile).toContain('Saves about R 22 751,40 in tax by 55');
    expect(tile).toContain('TFSA at 55: R 58 751,40');
  });
  const planTile = (root: HTMLElement) => root.querySelector('.dashboard__plan') as HTMLElement;

  it('invites you to start the Plan Builder', async () => {
    const root = (await render()).nativeElement as HTMLElement;
    const tile = planTile(root);
    expect(normaliseSpaces(tile.querySelector('.dashboard__plan-label')?.textContent)).toBe(
      'Plan Builder',
    );
    expect(normaliseSpaces(tile.querySelector('.dashboard__plan-text')?.textContent)).toBe(
      'Answer a few short questions and get a step-by-step plan.',
    );
    const link = tile.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/plan');
    expect(normaliseSpaces(link.textContent)).toBe('Start the Plan Builder');
  });

  it('offers to continue once the Plan Builder has answers', async () => {
    const fixture = await render();
    TestBed.inject(PlanBuilderStore).update({ age: 40 });
    await fixture.whenStable();
    const tile = planTile(fixture.nativeElement as HTMLElement);
    expect(normaliseSpaces(tile.querySelector('.dashboard__plan-text')?.textContent)).toMatch(
      /^Step \d+ of \d+ is waiting for you\.$/,
    );
    expect(normaliseSpaces(tile.querySelector('a')?.textContent)).toBe('Continue your plan');
  });

  it('offers to view the plan once the summary is reached', async () => {
    const fixture = await render();
    const store = TestBed.inject(PlanBuilderStore);
    store.update({ goal: 'buy-home' });
    store.finish();
    await fixture.whenStable();
    const tile = planTile(fixture.nativeElement as HTMLElement);
    expect(normaliseSpaces(tile.querySelector('.dashboard__plan-text')?.textContent)).toMatch(
      /^Your plan has \d+ steps\.$/,
    );
    expect(normaliseSpaces(tile.querySelector('a')?.textContent)).toBe('View your plan');
  });

  it('links to every other lazy route and keeps the privacy card', async () => {
    const root = (await render()).nativeElement as HTMLElement;
    const hrefs = Array.from(root.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    for (const path of ['/pay', '/ra', '/retire', '/budget', '/journey', '/plan', '/toolbox']) {
      expect(hrefs).toContain(path);
    }
    expect(root.querySelector('.dashboard__privacy')?.textContent).toContain('Nothing is saved');
  });
});

describe('DashboardPage without tax data', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideTestData({ taxYears: [], today: pinned })],
    });
  });
  afterEach(() => fake.uninstall());

  it('shows text instead of a figure', async () => {
    const fixture = TestBed.createComponent(DashboardPage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.rw-money__figure')).toBeNull();
    expect(root.querySelector('.rw-dot-matrix')).toBeNull();
    expect(root.querySelector('.dashboard__hero')?.textContent).toContain(
      'Tax data is unavailable',
    );
    expect(normaliseSpaces(root.querySelector('.dashboard__ra')?.textContent)).toContain(
      'Tax data is unavailable.',
    );
    expect(normaliseSpaces(root.querySelector('.dashboard__retire')?.textContent)).toContain(
      'Tax data is unavailable.',
    );
    for (const live of ['budget', 'journey']) {
      expect(normaliseSpaces(root.querySelector('.dashboard__' + live)?.textContent)).toContain(
        'Tax data is unavailable.',
      );
    }
  });
});
