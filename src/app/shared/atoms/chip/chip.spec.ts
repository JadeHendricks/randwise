import { TestBed } from '@angular/core/testing';

import { Chip } from './chip';

describe('Chip', () => {
  function create(dismissible: boolean) {
    const fixture = TestBed.createComponent(Chip);
    fixture.componentRef.setInput('label', 'Salary');
    fixture.componentRef.setInput('dismissible', dismissible);
    return fixture;
  }

  it('shows no dismiss button by default', async () => {
    const fixture = create(false);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Salary');
    expect(host.querySelector('button')).toBeNull();
  });

  it('emits dismiss from a labelled native button', async () => {
    const fixture = create(true);
    const spy = vi.fn();
    fixture.componentInstance.dismiss.subscribe(spy);
    await fixture.whenStable();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Remove Salary');
    button.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
