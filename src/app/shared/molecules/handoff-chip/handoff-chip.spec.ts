import { TestBed } from '@angular/core/testing';
import { FakeMatchMedia, installFakeMatchMedia } from '../../../testing/fake-match-media';
import { HandoffChip } from './handoff-chip';

describe('HandoffChip', () => {
  let fake: FakeMatchMedia;
  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
  });
  afterEach(() => fake.uninstall());

  async function render(source = 'Salary') {
    const fixture = TestBed.createComponent(HandoffChip);
    fixture.componentRef.setInput('source', source);
    const undone = vi.fn();
    fixture.componentInstance.undo.subscribe(undone);
    await fixture.whenStable();
    return { root: fixture.nativeElement as HTMLElement, undone };
  }

  it('is a status region showing where the figures came from', async () => {
    const { root } = await render();
    expect(root.classList).toContain('rw-handoff-chip');
    expect(root.getAttribute('role')).toBe('status');
    const chip = root.querySelector('rw-chip.rw-chip--success');
    expect(chip?.textContent?.trim()).toBe('From Salary');
  });

  it('has an Undo button with a descriptive name that emits once per click', async () => {
    const { root, undone } = await render();
    const button = root.querySelector<HTMLButtonElement>('button.rw-handoff-chip__undo');
    expect(button?.textContent?.trim()).toBe('Undo');
    expect(button?.getAttribute('aria-label')).toBe('Undo figures from Salary');
    expect(button?.classList).toContain('rw-button--ghost');
    button?.click();
    expect(undone).toHaveBeenCalledTimes(1);
  });
});
