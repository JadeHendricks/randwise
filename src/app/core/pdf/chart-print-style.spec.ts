import { TestBed } from '@angular/core/testing';

import { BreakdownBar } from '../../shared/atoms/breakdown-bar/breakdown-bar';
import { LineChart } from '../../shared/atoms/line-chart/line-chart';
import { RingGauge } from '../../shared/atoms/ring-gauge/ring-gauge';
import { preparePrintSvg } from './chart-print-style';

async function lineSvg(): Promise<SVGSVGElement> {
  const fixture = TestBed.createComponent(LineChart);
  fixture.componentRef.setInput('label', 'Growth');
  fixture.componentRef.setInput('series', {
    name: 'Balance',
    points: [
      { x: 0, y: 0 },
      { x: 5, y: 500 },
      { x: 10, y: 1500 },
    ],
  });
  fixture.componentRef.setInput('secondSeries', {
    name: 'Paid in',
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 1000 },
    ],
  });
  fixture.componentRef.setInput('marker', { x: 5, y: 500, label: 'Halfway' });
  await fixture.whenStable();
  return (fixture.nativeElement as HTMLElement).querySelector('svg') as SVGSVGElement;
}

async function barSvg(): Promise<SVGSVGElement> {
  const fixture = TestBed.createComponent(BreakdownBar);
  fixture.componentRef.setInput('label', 'Split');
  fixture.componentRef.setInput('segments', [
    { label: 'Net', value: 70, tone: 'accent' },
    { label: 'PAYE', value: 30, tone: 'rose' },
  ]);
  await fixture.whenStable();
  return (fixture.nativeElement as HTMLElement).querySelector('svg') as SVGSVGElement;
}

async function ringSvg(value = 50): Promise<SVGSVGElement> {
  const fixture = TestBed.createComponent(RingGauge);
  fixture.componentRef.setInput('label', 'Used');
  fixture.componentRef.setInput('value', value);
  fixture.componentRef.setInput('tone', 'sky');
  await fixture.whenStable();
  return (fixture.nativeElement as HTMLElement).querySelector('svg') as SVGSVGElement;
}

describe('preparePrintSvg', () => {
  it('strips screen-only attributes from every element', async () => {
    for (const svg of [await lineSvg(), await barSvg(), await ringSvg()]) {
      const clone = preparePrintSvg(svg);
      for (const el of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
        for (const name of ['class', 'role', 'aria-label', 'style', 'vector-effect']) {
          expect(el.hasAttribute(name), `${el.tagName} ${name}`).toBe(false);
        }
      }
    }
  });

  it('gives the clone an explicit size from its viewBox', async () => {
    const clone = preparePrintSvg(await lineSvg());
    expect(clone.getAttribute('width')).toBe('600');
    expect(clone.getAttribute('height')).toBe('260');
  });

  it('never touches the svg on the page', async () => {
    const svg = await lineSvg();
    const before = svg.outerHTML;
    preparePrintSvg(svg);
    expect(svg.outerHTML).toBe(before);
    expect(svg.classList).toContain('rw-line-chart__svg');
  });

  describe('line chart', () => {
    it('draws the primary line solid in the accent colour', async () => {
      const clone = preparePrintSvg(await lineSvg());
      const paths = Array.from(clone.querySelectorAll('path[stroke="#0b6b49"]'));
      expect(paths).toHaveLength(1);
      expect(paths[0].getAttribute('stroke-width')).toBe('3');
      expect(paths[0].getAttribute('fill')).toBe('none');
    });

    it('draws the second line dashed in the muted colour', async () => {
      const clone = preparePrintSvg(await lineSvg());
      const dashed = clone.querySelector('path[stroke-dasharray="6 6"]');
      expect(dashed?.getAttribute('stroke')).toBe('#435349');
    });

    it('draws the marker with a white outline', async () => {
      const clone = preparePrintSvg(await lineSvg());
      const marker = clone.querySelector('circle');
      expect(marker?.getAttribute('fill')).toBe('#0b6b49');
      expect(marker?.getAttribute('stroke')).toBe('#ffffff');
    });
  });

  describe('breakdown bar', () => {
    it('fills each segment with its tone colour', async () => {
      const clone = preparePrintSvg(await barSvg());
      const fills = Array.from(clone.querySelectorAll('rect'), (rect) => rect.getAttribute('fill'));
      // The track first, then the accent and rose segments.
      expect(fills).toEqual(['#dfe6e2', '#0b6b49', '#b3403a']);
    });

    it('keeps the non-uniform scaling the bar relies on', async () => {
      const clone = preparePrintSvg(await barSvg());
      expect(clone.getAttribute('preserveAspectRatio')).toBe('none');
    });
  });

  describe('ring gauge', () => {
    it('turns the percent dash into an absolute dash and drops pathLength', async () => {
      const clone = preparePrintSvg(await ringSvg(50));
      const value = clone.querySelectorAll('circle')[1];
      const circumference = 2 * Math.PI * 52;
      const [filled, total] = (value.getAttribute('stroke-dasharray') ?? '').split(' ').map(Number);
      expect(value.hasAttribute('pathLength')).toBe(false);
      expect(filled).toBeCloseTo(circumference / 2, 1);
      expect(total).toBeCloseTo(circumference, 1);
      expect(value.getAttribute('stroke')).toBe('#1d5fa8');
      expect(value.getAttribute('transform')).toBe('rotate(-90 60 60)');
    });

    it('draws the track as a pale ring', async () => {
      const clone = preparePrintSvg(await ringSvg());
      const track = clone.querySelectorAll('circle')[0];
      expect(track.getAttribute('stroke')).toBe('#dfe6e2');
      expect(track.getAttribute('fill')).toBe('none');
    });
  });
});
