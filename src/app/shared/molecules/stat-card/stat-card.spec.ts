import { TestBed } from '@angular/core/testing';

import { FakeMatchMedia, installFakeMatchMedia } from '../../../testing/fake-match-media';
import { normaliseSpaces } from '../../../testing/text';
import { StatCard } from './stat-card';

describe('StatCard', () => {
  let fake: FakeMatchMedia;

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
  });
  afterEach(() => fake.uninstall());

  async function render(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(StatCard);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the label, a money value, the second line and the hint on a card', async () => {
    const root = await render({
      label: 'PAYE',
      value: 4681,
      secondary: 'R 56 172,00 a year',
      hint: 'Income tax taken each month',
    });
    expect(root.classList).toContain('rw-stat-card');
    expect(root.querySelector('rw-card.rw-card--glass')).not.toBeNull();
    expect(root.querySelector('.rw-stat-card__label')?.textContent).toBe('PAYE');
    expect(normaliseSpaces(root.querySelector('.rw-money__figure')?.textContent)).toBe('R 4 681,00');
    expect(root.querySelector('.rw-stat-card__secondary')?.textContent).toBe('R 56 172,00 a year');
    expect(root.querySelector('.rw-stat-card__hint')?.textContent).toBe('Income tax taken each month');
    expect(root.querySelector('.rw-stat-card__text')).toBeNull();
  });

  it('shows a zero amount as money rather than falling back to text', async () => {
    const root = await render({ label: 'Medical credit', value: 0 });
    expect(normaliseSpaces(root.querySelector('.rw-money__figure')?.textContent)).toBe('R 0,00');
  });

  it('shows free text when there is no money value, and omits empty lines', async () => {
    const root = await render({ label: 'Marginal rate', text: '26%' });
    expect(root.querySelector('rw-money')).toBeNull();
    expect(root.querySelector('.rw-stat-card__text')?.textContent).toBe('26%');
    expect(root.querySelector('.rw-stat-card__secondary')).toBeNull();
    expect(root.querySelector('.rw-stat-card__hint')).toBeNull();
  });

  it('passes the card variant through', async () => {
    const root = await render({ label: 'UIF', value: 177.12, variant: 'plain' });
    expect(root.querySelector('rw-card.rw-card--plain')).not.toBeNull();
  });
});
