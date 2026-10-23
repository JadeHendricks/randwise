import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { StepProgress } from './step-progress';

@Component({
  imports: [StepProgress],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<rw-step-progress [current]="current()" [total]="total()" label="Plan progress" />',
})
class Host {
  readonly current = signal(2);
  readonly total = signal(6);
}

describe('StepProgress', () => {
  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    return { fixture, root, bar: () => root.querySelector<HTMLElement>('[role=progressbar]')! };
  }

  it('shows the step text and a named progress bar with values', async () => {
    const { root, bar } = await render();
    expect(root.querySelector('.rw-step-progress__text')?.textContent?.trim()).toBe('Step 2 of 6');
    expect(bar().getAttribute('aria-label')).toBe('Plan progress');
    expect(bar().getAttribute('aria-valuemin')).toBe('1');
    expect(bar().getAttribute('aria-valuemax')).toBe('6');
    expect(bar().getAttribute('aria-valuenow')).toBe('2');
    expect(bar().getAttribute('aria-valuetext')).toBe('Step 2 of 6');
  });

  it('sets the fill as a custom property', async () => {
    const { fixture, bar } = await render();
    expect(bar().style.getPropertyValue('--rw-step-fill')).toBe('33.33333333333333%');
    fixture.componentInstance.current.set(6);
    await fixture.whenStable();
    expect(bar().style.getPropertyValue('--rw-step-fill')).toBe('100%');
  });

  it('keeps the current step inside 1..total', async () => {
    const { fixture, root, bar } = await render();
    fixture.componentInstance.current.set(9);
    await fixture.whenStable();
    expect(root.querySelector('.rw-step-progress__text')?.textContent?.trim()).toBe('Step 6 of 6');
    expect(bar().getAttribute('aria-valuenow')).toBe('6');

    fixture.componentInstance.current.set(0);
    await fixture.whenStable();
    expect(bar().getAttribute('aria-valuenow')).toBe('1');
  });

  it('follows a changed total', async () => {
    const { fixture, root, bar } = await render();
    fixture.componentInstance.total.set(3);
    await fixture.whenStable();
    expect(root.querySelector('.rw-step-progress__text')?.textContent?.trim()).toBe('Step 2 of 3');
    expect(bar().getAttribute('aria-valuemax')).toBe('3');
  });
});
