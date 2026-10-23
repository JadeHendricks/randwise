import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TODAY } from '../../core/data/data-source';
import { PlanContextStore } from '../../core/plan/plan-context.store';
import { FakeMatchMedia, installFakeMatchMedia } from '../../testing/fake-match-media';
import { normaliseSpaces } from '../../testing/text';
import { JourneyPage } from '../journey/journey-page';
import { PayPage } from '../pay/pay-page';
import { RaPage } from '../ra/ra-page';
import { RetirePage } from '../retire/retire-page';
import { BudgetPage } from './budget-page';

// Pinned so the bundled 2027 file is the year in use (the fixture UIF ceiling is fake).
const TODAY_PINNED = new Date(2026, 9, 22);

describe('Handoffs into the Budget', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'pay', component: PayPage },
          { path: 'ra', component: RaPage },
          { path: 'retire', component: RetirePage },
          { path: 'budget', component: BudgetPage },
          { path: 'journey', component: JourneyPage },
        ]),
        { provide: TODAY, useValue: () => new Date(TODAY_PINNED) },
      ],
    });
  });
  afterEach(() => fake.uninstall());

  const text = (el: Element | null | undefined) => normaliseSpaces(el?.textContent);
  const rootOf = (harness: RouterTestingHarness) => harness.routeNativeElement as HTMLElement;
  const hero = (root: HTMLElement) =>
    text(root.querySelector('.budget__hero .rw-money--hero .rw-money__figure'));

  function field(root: HTMLElement, label: string): HTMLInputElement {
    const host = Array.from(root.querySelectorAll('rw-amount-field')).find(
      (el) => text(el.querySelector('label')) === label,
    );
    const input = host?.querySelector<HTMLInputElement>('input[type=number]');
    if (!input) throw new Error(`no field "${label}"`);
    return input;
  }

  async function type(harness: RouterTestingHarness, label: string, value: number) {
    const input = field(rootOf(harness), label);
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await harness.fixture.whenStable();
  }

  async function sendTo(harness: RouterTestingHarness, label: string) {
    const target = Array.from(rootOf(harness).querySelectorAll('rw-send-to button')).find((b) =>
      text(b).startsWith(label),
    ) as HTMLButtonElement | undefined;
    if (!target) throw new Error(`no send-to target "${label}"`);
    target.click();
    await harness.fixture.whenStable();
  }

  async function undo(harness: RouterTestingHarness) {
    rootOf(harness).querySelector<HTMLButtonElement>('.rw-handoff-chip__undo')?.click();
    await harness.fixture.whenStable();
  }

  it('Pay to Budget replaces the income, shows From Salary, and Undo brings the earlier income back', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/budget');
    await type(harness, 'Gross pay per month', 50_000);
    // 600 000: 125 599 + 0.36 x 69 800 = 150 727 - 17 820 = 132 907 -> 11 075.58; 50 000 - 11 075.58 - 177.12.
    expect(hero(rootOf(harness))).toBe('R 38 747,30');

    await harness.navigateByUrl('/pay');
    await type(harness, 'Age at the end of the tax year', 40);
    await type(harness, 'Gross pay per month', 40_000);
    await sendTo(harness, 'Budget');

    const root = rootOf(harness);
    expect(TestBed.inject(Router).url).toBe('/budget');
    expect(TestBed.inject(PlanContextStore).budgetFrom()).toBe('salary');
    expect(text(root.querySelector('rw-handoff-chip'))).toContain('From Salary');
    // 480 000: 79 998 + 0.31 x 96 900 = 110 037 - 17 820 = 92 217 -> 7 684.75; 40 000 - 7 684.75 - 177.12.
    expect(hero(root)).toBe('R 32 138,13');

    await undo(harness);
    expect(hero(root)).toBe('R 38 747,30');
    expect(root.querySelector('rw-handoff-chip')).toBeNull();
  });

  it('Journey to Budget sets the RA line to the journey contribution and shows From Journey', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/journey');
    await type(harness, 'Monthly RA contribution now', 3_000);
    await sendTo(harness, 'Budget');

    const root = rootOf(harness);
    expect(TestBed.inject(Router).url).toBe('/budget');
    expect(text(root.querySelector('rw-handoff-chip'))).toContain('From Journey');
    expect(field(root, 'Retirement annuity (RA) per month').value).toBe('3000');
    // The journey's TFSA top-up of R1 000 a month becomes the TFSA line.
    expect(field(root, 'Tax-free savings (TFSA) per month').value).toBe('1000');

    await undo(harness);
    expect(field(root, 'Retirement annuity (RA) per month').value).toBe('1508.51');
  });

  it('RA to Budget sets the RA line to the extra contribution', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/ra');
    await type(harness, 'Extra RA contribution per month', 2_500);
    await sendTo(harness, 'Budget');

    const root = rootOf(harness);
    expect(TestBed.inject(Router).url).toBe('/budget');
    expect(text(root.querySelector('rw-handoff-chip'))).toContain('From RA');
    expect(field(root, 'Retirement annuity (RA) per month').value).toBe('2500');
  });

  it('Retire at 55 to Budget sets the RA line to the contribution the plan needs', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/retire');
    await sendTo(harness, 'Budget');

    const root = rootOf(harness);
    expect(TestBed.inject(Router).url).toBe('/budget');
    expect(text(root.querySelector('rw-handoff-chip'))).toContain('From Retire at 55');
    expect(field(root, 'Retirement annuity (RA) per month').value).toBe('46864.26');
  });
});
