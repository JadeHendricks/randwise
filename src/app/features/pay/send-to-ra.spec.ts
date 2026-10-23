import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TODAY } from '../../core/data/data-source';
import { PlanContextStore } from '../../core/plan/plan-context.store';
import { FakeMatchMedia, installFakeMatchMedia } from '../../testing/fake-match-media';
import { normaliseSpaces } from '../../testing/text';
import { RaPage } from '../ra/ra-page';
import { PayPage } from './pay-page';

// Pinned so the bundled 2027 file is the year in use (the fixture UIF ceiling is fake).
const TODAY_PINNED = new Date(2026, 9, 22);

describe('Pay to RA flow', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'pay', component: PayPage },
          { path: 'ra', component: RaPage },
        ]),
        { provide: TODAY, useValue: () => new Date(TODAY_PINNED) },
      ],
    });
  });
  afterEach(() => fake.uninstall());

  const text = (el: Element | null | undefined) => normaliseSpaces(el?.textContent);

  function field(root: HTMLElement, label: string): HTMLInputElement {
    const host = Array.from(root.querySelectorAll('rw-amount-field')).find(
      (el) => text(el.querySelector('label')) === label,
    );
    const input = host?.querySelector<HTMLInputElement>('input[type=number]');
    if (!input) throw new Error(`no field "${label}"`);
    return input;
  }

  async function type(harness: RouterTestingHarness, label: string, value: number) {
    const input = field(harness.routeNativeElement as HTMLElement, label);
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await harness.fixture.whenStable();
  }

  it('sends the Salary figures to the RA page, shows From Salary, and Undo restores the old ones', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/ra');
    await type(harness, 'Gross pay per month', 50_000);
    expect(field(harness.routeNativeElement as HTMLElement, 'Gross pay per month').value).toBe(
      '50000',
    );

    await harness.navigateByUrl('/pay');
    await type(harness, 'Age at the end of the tax year', 40);

    const target = Array.from(
      (harness.routeNativeElement as HTMLElement).querySelectorAll('rw-send-to button'),
    ).find((b) => text(b).startsWith('Retirement annuity')) as HTMLButtonElement;
    target.click();
    await harness.fixture.whenStable();

    expect(TestBed.inject(PlanContextStore).raFrom()).toBe('salary');
    const root = harness.routeNativeElement as HTMLElement;
    expect(TestBed.inject(Router).url).toBe('/ra');
    expect(text(root.querySelector('rw-handoff-chip'))).toContain('From Salary');
    expect(field(root, 'Gross pay per month').value).toBe('30000');
    expect(field(root, 'Age at the end of the tax year').value).toBe('40');
    expect(text(root.querySelector('.ra__fact .rw-money__figure'))).toBe('R 99 000,00');

    root.querySelector<HTMLButtonElement>('.rw-handoff-chip__undo')?.click();
    await harness.fixture.whenStable();
    expect(field(root, 'Gross pay per month').value).toBe('50000');
    expect(field(root, 'Age at the end of the tax year').value).toBe('35');
    expect(root.querySelector('rw-handoff-chip')).toBeNull();
  });
});
