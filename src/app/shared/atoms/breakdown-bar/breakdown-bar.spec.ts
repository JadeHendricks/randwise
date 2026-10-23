import { TestBed } from '@angular/core/testing';

import { normaliseSpaces } from '../../../testing/text';
import { BreakdownBar, BreakdownSegment } from './breakdown-bar';

describe('BreakdownBar', () => {
  const SPLIT: BreakdownSegment[] = [
    { label: 'Net', value: 25141.88, tone: 'accent' },
    { label: 'PAYE', value: 4681, tone: 'rose' },
    { label: 'UIF', value: 177.12, tone: 'sun' },
  ];

  async function create(segments: readonly BreakdownSegment[], inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(BreakdownBar);
    fixture.componentRef.setInput('label', 'Where your gross pay goes');
    fixture.componentRef.setInput('segments', segments);
    for (const [key, val] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, val);
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const rects = (el: HTMLElement) => Array.from(el.querySelectorAll('.rw-breakdown-bar__segment'));
  const ariaLabel = (el: HTMLElement) => normaliseSpaces(el.querySelector('svg')?.getAttribute('aria-label'));
  const tableRows = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('.rw-visually-hidden tbody tr')).map((tr) =>
      Array.from(tr.children).map((c) => normaliseSpaces(c.textContent)),
    );

  it('renders one rect per non-zero segment with its tone class', async () => {
    const el = await create([...SPLIT, { label: 'Nothing', value: 0, tone: 'sky' }]);
    const drawn = rects(el);
    expect(drawn).toHaveLength(3);
    expect(drawn[0].classList).toContain('rw-breakdown-bar__segment--accent');
    expect(drawn[1].classList).toContain('rw-breakdown-bar__segment--rose');
    expect(drawn[2].classList).toContain('rw-breakdown-bar__segment--sun');
  });

  it('gives the svg an image role and an aria-label naming every segment', async () => {
    const el = await create(SPLIT);
    expect(el.querySelector('svg')?.getAttribute('role')).toBe('img');
    expect(ariaLabel(el)).toBe(
      'Where your gross pay goes: Net R 25 141,88 (84%), PAYE R 4 681,00 (16%), UIF R 177,12 (1%)',
    );
  });

  it('lists exact numbers in a hidden table, zero rows included', async () => {
    const el = await create([...SPLIT, { label: 'Nothing', value: 0, tone: 'sky' }]);
    expect(normaliseSpaces(el.querySelector('caption')?.textContent)).toBe('Where your gross pay goes');
    expect(tableRows(el)).toEqual([
      ['Net', 'R 25 141,88', '84%'],
      ['PAYE', 'R 4 681,00', '16%'],
      ['UIF', 'R 177,12', '1%'],
      ['Nothing', 'R 0,00', '0%'],
    ]);
  });

  it('shows an empty track and "no data" for an empty array', async () => {
    const el = await create([]);
    expect(rects(el)).toHaveLength(0);
    expect(el.querySelector('.rw-breakdown-bar__track')).not.toBeNull();
    expect(ariaLabel(el)).toBe('Where your gross pay goes: no data');
  });

  it('shows "no data" when every value is zero', async () => {
    const el = await create([
      { label: 'A', value: 0, tone: 'accent' },
      { label: 'B', value: 0, tone: 'sky' },
    ]);
    expect(rects(el)).toHaveLength(0);
    expect(ariaLabel(el)).toBe('Where your gross pay goes: no data');
    expect(tableRows(el)).toHaveLength(2);
  });

  it('clamps negative, NaN and infinite values to R0', async () => {
    const el = await create([
      { label: 'Good', value: 100, tone: 'accent' },
      { label: 'Negative', value: -50, tone: 'rose' },
      { label: 'Nan', value: Number.NaN, tone: 'sun' },
      { label: 'Infinite', value: Number.POSITIVE_INFINITY, tone: 'sky' },
    ]);
    expect(rects(el)).toHaveLength(1);
    expect(tableRows(el)).toEqual([
      ['Good', 'R 100,00', '100%'],
      ['Negative', 'R 0,00', '0%'],
      ['Nan', 'R 0,00', '0%'],
      ['Infinite', 'R 0,00', '0%'],
    ]);
  });

  it('sizes segment widths in viewBox units that sum to 100', async () => {
    const el = await create(SPLIT);
    const widths = rects(el).map((r) => Number(r.getAttribute('width')));
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 8);
    expect(Number(rects(el)[0].getAttribute('x'))).toBe(0);
    expect(Number(rects(el)[1].getAttribute('x'))).toBeCloseTo(widths[0], 8);
  });

  it('uses a custom format function', async () => {
    const el = await create([{ label: 'Hours', value: 8, tone: 'sky' }], {
      format: (n: number) => `${n} h`,
    });
    expect(tableRows(el)[0][1]).toBe('8 h');
    expect(ariaLabel(el)).toContain('Hours 8 h (100%)');
  });

  it('hides only the legend when showLegend is false', async () => {
    const withLegend = await create(SPLIT);
    expect(withLegend.querySelector('.rw-breakdown-bar__legend')?.getAttribute('aria-hidden')).toBe('true');
    expect(withLegend.querySelectorAll('.rw-breakdown-bar__item')).toHaveLength(3);

    const without = await create(SPLIT, { showLegend: false });
    expect(without.querySelector('.rw-breakdown-bar__legend')).toBeNull();
    expect(rects(without)).toHaveLength(3);
    expect(tableRows(without)).toHaveLength(3);
  });
});
