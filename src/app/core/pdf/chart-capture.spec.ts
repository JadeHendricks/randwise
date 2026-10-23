import { TestBed } from '@angular/core/testing';

import { BreakdownBar } from '../../shared/atoms/breakdown-bar/breakdown-bar';
import { LineChart } from '../../shared/atoms/line-chart/line-chart';
import { RingGauge } from '../../shared/atoms/ring-gauge/ring-gauge';
import { normaliseSpaces } from '../../testing/text';
import { captureChart } from './chart-capture';

describe('captureChart', () => {
  it('reads a line chart: kind, ticks, axis titles, legend and marker note', async () => {
    const fixture = TestBed.createComponent(LineChart);
    fixture.componentRef.setInput('label', 'Growth');
    fixture.componentRef.setInput('series', {
      name: 'Balance',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 1000 },
      ],
    });
    fixture.componentRef.setInput('secondSeries', {
      name: 'Paid in',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 600 },
      ],
    });
    fixture.componentRef.setInput('marker', { x: 5, y: 400, label: 'Halfway there' });
    fixture.componentRef.setInput('xLabel', 'Age');
    fixture.componentRef.setInput('yLabel', 'Balance');
    fixture.componentRef.setInput('formatX', (x: number) => `Age ${x}`);
    fixture.componentRef.setInput('formatXTick', (x: number) => String(x));
    await fixture.whenStable();

    const captured = captureChart(fixture.nativeElement);
    expect(captured?.kind).toBe('line');
    expect(captured?.svg.classList).toContain('rw-line-chart__svg');
    expect(captured?.xTicks).toEqual(['0', '2.5', '5', '7.5', '10']);
    expect(captured?.yTicks).toHaveLength(5);
    expect(captured?.yTicks.map(normaliseSpaces)[4]).toBe('R 0,00');
    expect(captured?.xLabel).toBe('Age');
    expect(captured?.yLabel).toBe('Balance');
    expect(captured?.legend).toEqual([
      { label: 'Balance', dashed: false },
      { label: 'Paid in', dashed: true },
    ]);
    expect(captured?.note).toBe('Halfway there');
  });

  it('reads a breakdown bar: legend rows with tone, value and share', async () => {
    const fixture = TestBed.createComponent(BreakdownBar);
    fixture.componentRef.setInput('label', 'Split');
    fixture.componentRef.setInput('segments', [
      { label: 'Net', value: 750, tone: 'accent' },
      { label: 'PAYE', value: 250, tone: 'rose' },
    ]);
    await fixture.whenStable();

    const captured = captureChart(fixture.nativeElement);
    expect(captured?.kind).toBe('bar');
    expect(
      captured?.legend.map((item) => ({
        label: item.label,
        tone: item.tone,
        value: normaliseSpaces(item.value),
        percent: normaliseSpaces(item.percent),
      })),
    ).toEqual([
      { label: 'Net', tone: 'accent', value: 'R 750,00', percent: '75%' },
      { label: 'PAYE', tone: 'rose', value: 'R 250,00', percent: '25%' },
    ]);
  });

  it('reads a ring gauge: centre text and caption', async () => {
    const fixture = TestBed.createComponent(RingGauge);
    fixture.componentRef.setInput('label', 'Used');
    fixture.componentRef.setInput('value', 40);
    fixture.componentRef.setInput('caption', 'of the limit');
    await fixture.whenStable();

    const captured = captureChart(fixture.nativeElement);
    expect(captured?.kind).toBe('ring');
    expect(captured?.centre).toBe('40%');
    expect(captured?.caption).toBe('of the limit');
  });

  it('is null for a line chart in its empty state (no svg)', async () => {
    const fixture = TestBed.createComponent(LineChart);
    fixture.componentRef.setInput('label', 'Growth');
    fixture.componentRef.setInput('series', { name: 'Balance', points: [{ x: 0, y: 0 }] });
    await fixture.whenStable();
    expect(captureChart(fixture.nativeElement)).toBeNull();
  });

  it('is null for an element that is not a chart', () => {
    const div = document.createElement('div');
    div.innerHTML = '<svg></svg>';
    expect(captureChart(div)).toBeNull();
  });
});
