import { TestBed } from '@angular/core/testing';

import { normaliseSpaces } from '../../../testing/text';
import { LineChart, LinePoint, LineSeries } from './line-chart';

describe('LineChart', () => {
  const NET: LineSeries = {
    name: 'Net pay',
    points: [
      { x: 0, y: 0 },
      { x: 10_000, y: 8_000 },
      { x: 30_000, y: 25_141.88 },
    ],
  };
  const GROSS: LineSeries = {
    name: 'Gross pay',
    points: [
      { x: 0, y: 0 },
      { x: 30_000, y: 30_000 },
    ],
  };

  async function create(series: LineSeries, inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(LineChart);
    fixture.componentRef.setInput('label', 'Net pay by gross pay');
    fixture.componentRef.setInput('series', series);
    for (const [key, val] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, val);
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const ariaLabel = (el: HTMLElement) =>
    normaliseSpaces(el.querySelector('[role="img"]')?.getAttribute('aria-label'));
  const primary = (el: HTMLElement) => el.querySelector('.rw-line-chart__line--primary');
  const commands = (path: Element | null) => (path?.getAttribute('d') ?? '').match(/[ML]/g) ?? [];
  const tables = (el: HTMLElement) => Array.from(el.querySelectorAll('.rw-visually-hidden table'));
  const rowsOf = (table: Element) =>
    Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.children).map((c) => normaliseSpaces(c.textContent)),
    );
  const pts = (...ys: number[]): LinePoint[] => ys.map((y, i) => ({ x: i, y }));
  const plain = (n: number) => String(n);

  it('draws one path command per point', async () => {
    const el = await create(NET);
    expect(commands(primary(el))).toHaveLength(3);
    expect(el.querySelector('svg')?.getAttribute('role')).toBe('img');
  });

  it('renders a second dashed path and a second table for a second series', async () => {
    const el = await create(NET, { secondSeries: GROSS });
    expect(commands(el.querySelector('.rw-line-chart__line--secondary'))).toHaveLength(2);
    expect(tables(el)).toHaveLength(2);
    expect(normaliseSpaces(tables(el)[1].querySelector('caption')?.textContent)).toBe('Gross pay');
    expect(ariaLabel(el)).toContain('Also shows Gross pay.');
  });

  it('shows "No data" for an empty series', async () => {
    const el = await create({ name: 'Net pay', points: [] });
    expect(el.querySelector('path')).toBeNull();
    expect(el.querySelector('.rw-line-chart__empty')?.textContent).toContain('No data');
    expect(ariaLabel(el)).toBe('Net pay by gross pay: no data');
  });

  it('shows "No data" for a single point', async () => {
    const el = await create({ name: 'Net pay', points: [{ x: 1, y: 1 }] });
    expect(el.querySelector('path')).toBeNull();
    expect(ariaLabel(el)).toBe('Net pay by gross pay: no data');
  });

  it('drops NaN and infinite points from the path and the table', async () => {
    const el = await create(
      {
        name: 'Net pay',
        points: [
          { x: 0, y: 1 },
          { x: Number.NaN, y: 5 },
          { x: 1, y: Number.POSITIVE_INFINITY },
          { x: 2, y: 3 },
        ],
      },
      { formatX: plain, formatY: plain },
    );
    expect(commands(primary(el))).toHaveLength(2);
    expect(rowsOf(tables(el)[0])).toEqual([
      ['0', '1'],
      ['2', '3'],
    ]);
    expect(el.querySelector('path')?.getAttribute('d')).not.toContain('NaN');
  });

  it('sorts points by x', async () => {
    const el = await create(
      {
        name: 'S',
        points: [
          { x: 2, y: 3 },
          { x: 0, y: 1 },
        ],
      },
      { formatX: plain, formatY: plain },
    );
    expect(rowsOf(tables(el)[0])).toEqual([
      ['0', '1'],
      ['2', '3'],
    ]);
  });

  it('extends the domain below zero for negative y and draws a zero line', async () => {
    const el = await create({ name: 'S', points: pts(-100, 50, 100) }, { formatX: plain, formatY: plain });
    expect(el.querySelector('.rw-line-chart__zero')).not.toBeNull();
    const ticks = Array.from(el.querySelectorAll('.rw-line-chart__y-axis .rw-line-chart__tick')).map((t) =>
      normaliseSpaces(t.textContent),
    );
    expect(ticks[0]).toBe('100');
    expect(ticks[ticks.length - 1]).toBe('-100');
    expect(rowsOf(tables(el)[0])[0]).toEqual(['0', '-100']);
  });

  it('has no zero line when nothing is negative', async () => {
    const el = await create(NET);
    expect(el.querySelector('.rw-line-chart__zero')).toBeNull();
  });

  it('does not divide by zero for an all-zero series', async () => {
    const el = await create({ name: 'S', points: pts(0, 0, 0) }, { formatX: plain, formatY: plain });
    const d = primary(el)?.getAttribute('d') ?? '';
    expect(d).not.toContain('NaN');
    expect(d).not.toContain('Infinity');
    const ticks = Array.from(el.querySelectorAll('.rw-line-chart__y-axis .rw-line-chart__tick')).map((t) =>
      normaliseSpaces(t.textContent),
    );
    expect(ticks[0]).toBe('1');
    expect(ticks[ticks.length - 1]).toBe('0');
  });

  it('copes with every point sharing one x', async () => {
    const el = await create({
      name: 'S',
      points: [
        { x: 5, y: 1 },
        { x: 5, y: 2 },
      ],
    });
    expect(primary(el)?.getAttribute('d')).not.toContain('NaN');
  });

  it('renders a marker circle and note when inside the domain', async () => {
    const marker = { x: 10_000, y: 8_000, label: 'You are here: R 10 000 gross' };
    const el = await create(NET, { marker });
    expect(el.querySelector('.rw-line-chart__marker')).not.toBeNull();
    expect(el.querySelector('.rw-line-chart__guide')).not.toBeNull();
    expect(normaliseSpaces(el.querySelector('.rw-line-chart__note')?.textContent)).toBe(marker.label);
    expect(ariaLabel(el)).toContain(marker.label);
    expect(normaliseSpaces(el.querySelector('.rw-visually-hidden p')?.textContent)).toBe(marker.label);
  });

  it('hides a marker outside the x domain', async () => {
    const marker = { x: 99_999, y: 1, label: 'Far away' };
    const el = await create(NET, { marker });
    expect(el.querySelector('.rw-line-chart__marker')).toBeNull();
    expect(el.querySelector('.rw-line-chart__note')).toBeNull();
    expect(ariaLabel(el)).not.toContain('Far away');
  });

  it('lists the exact formatted numbers for every point in the hidden table', async () => {
    const el = await create(NET);
    expect(rowsOf(tables(el)[0])).toEqual([
      ['R 0,00', 'R 0,00'],
      ['R 10 000,00', 'R 8 000,00'],
      ['R 30 000,00', 'R 25 141,88'],
    ]);
  });

  it('uses axis titles as table headings', async () => {
    const el = await create(NET, { xLabel: 'Gross per month', yLabel: 'Net per month' });
    const heads = Array.from(tables(el)[0].querySelectorAll('th')).map((h) => normaliseSpaces(h.textContent));
    expect(heads).toEqual(['Gross per month', 'Net per month']);
    expect(el.querySelector('.rw-line-chart__title--x')).not.toBeNull();
    expect(el.querySelector('.rw-line-chart__title--y')).not.toBeNull();
  });

  it('summarises the series in the aria-label', async () => {
    const el = await create(NET);
    expect(ariaLabel(el)).toBe(
      'Net pay by gross pay: Net pay runs from R 0,00 at R 0,00 to R 25 141,88 at R 30 000,00, peaking at R 25 141,88.',
    );
  });

  it('uses the tick formatters for axis text only', async () => {
    const tick = (n: number) => `t${n}`;
    const ticks = (el: HTMLElement, axis: string) =>
      Array.from(el.querySelectorAll(`.rw-line-chart__${axis}-axis .rw-line-chart__tick`)).map((t) =>
        normaliseSpaces(t.textContent),
      );
    const plainTicks = await create(NET);
    expect(ticks(plainTicks, 'x')[4]).toBe('R 30 000,00');

    const el = await create(NET, { formatXTick: tick, formatYTick: tick });
    expect(ticks(el, 'x')).toEqual(['t0', 't7500', 't15000', 't22500', 't30000']);
    expect(ticks(el, 'y')[0]).toBe('t50000');
    expect(rowsOf(tables(el)[0])[2]).toEqual(['R 30 000,00', 'R 25 141,88']);
    expect(ariaLabel(el)).toContain('R 25 141,88 at R 30 000,00');
  });

  describe('legend', () => {
    const legend = (el: HTMLElement) =>
      Array.from(el.querySelectorAll('.rw-line-chart__item')).map((item) =>
        normaliseSpaces(item.textContent),
      );

    it('names both series, with a dashed swatch for the second', async () => {
      const el = await create(NET, { secondSeries: GROSS });
      expect(legend(el)).toEqual(['Net pay', 'Gross pay']);
      expect(el.querySelector('.rw-line-chart__legend')?.getAttribute('aria-hidden')).toBe('true');
      expect(el.querySelectorAll('.rw-line-chart__swatch--secondary')).toHaveLength(1);
    });

    it('lists only the first series when there is no second series', async () => {
      expect(legend(await create(NET))).toEqual(['Net pay']);
    });

    it('is not shown in the empty state', async () => {
      const el = await create({ name: 'Net pay', points: [] }, { secondSeries: GROSS });
      expect(el.querySelector('.rw-line-chart__legend')).toBeNull();
    });
  });

  it('omits the area path when area is false', async () => {
    expect((await create(NET)).querySelector('.rw-line-chart__area')).not.toBeNull();
    expect((await create(NET, { area: false })).querySelector('.rw-line-chart__area')).toBeNull();
  });

  describe('secondArea', () => {
    it('draws exactly one area by default, even with a second series', async () => {
      const el = await create(NET, { secondSeries: GROSS });
      expect(el.querySelectorAll('.rw-line-chart__area')).toHaveLength(1);
      expect(el.querySelector('.rw-line-chart__area--secondary')).toBeNull();
    });

    it('fills under the second series after the first area and before the lines', async () => {
      const el = await create(NET, { secondSeries: GROSS, secondArea: true });
      const paths = Array.from(el.querySelectorAll('svg path'));
      const secondary = el.querySelector('.rw-line-chart__area--secondary');
      expect(secondary).not.toBeNull();
      expect(secondary?.getAttribute('d')).toMatch(/^M.* Z$/);
      expect(paths.indexOf(secondary as Element)).toBe(1);
      expect(paths[0].classList).toContain('rw-line-chart__area');
      expect(paths[2].classList).toContain('rw-line-chart__line--secondary');
    });

    it('draws no second area without a second series', async () => {
      const el = await create(NET, { secondArea: true });
      expect(el.querySelector('.rw-line-chart__area--secondary')).toBeNull();
      expect(el.querySelectorAll('.rw-line-chart__area')).toHaveLength(1);
    });
  });
});
