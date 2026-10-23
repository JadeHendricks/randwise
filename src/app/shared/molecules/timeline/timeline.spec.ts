import { TestBed } from '@angular/core/testing';

import { normaliseSpaces } from '../../../testing/text';
import { Timeline } from './timeline';

describe('Timeline', () => {
  async function render(items: { id: string; title: string; detail: string }[]) {
    const fixture = TestBed.createComponent(Timeline);
    fixture.componentRef.setInput('items', items);
    await fixture.whenStable();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  const text = (el: Element | null | undefined) => normaliseSpaces(el?.textContent);

  it('renders an ordered list with a title and detail per step, in order', async () => {
    const { root } = await render([
      { id: 'a', title: 'Today', detail: 'Age 35' },
      { id: 'b', title: 'Retirement', detail: 'Age 55' },
    ]);
    expect(root.querySelector('ol')).not.toBeNull();
    const items = Array.from(root.querySelectorAll('.rw-timeline__item'));
    expect(items.map((li) => text(li.querySelector('.rw-timeline__title')))).toEqual([
      'Today',
      'Retirement',
    ]);
    expect(items.map((li) => text(li.querySelector('.rw-timeline__detail')))).toEqual([
      'Age 35',
      'Age 55',
    ]);
  });

  it('hides the decorative marker from assistive technology', async () => {
    const { root } = await render([{ id: 'a', title: 'Today', detail: 'Age 35' }]);
    expect(root.querySelector('.rw-timeline__marker')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps a step when another is added, tracking by id', async () => {
    const { fixture, root } = await render([{ id: 'a', title: 'Today', detail: 'x' }]);
    const first = root.querySelector('.rw-timeline__item');
    fixture.componentRef.setInput('items', [
      { id: 'a', title: 'Today', detail: 'x' },
      { id: 'b', title: 'Later', detail: 'y' },
    ]);
    await fixture.whenStable();
    expect(root.querySelector('.rw-timeline__item')).toBe(first);
    expect(root.querySelectorAll('.rw-timeline__item').length).toBe(2);
  });
});
