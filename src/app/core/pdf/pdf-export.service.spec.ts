import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FakePdf, FakePdfDoc, fakePdfLibs } from '../../testing/fake-pdf';
import { makeTaxYear, provideTestData } from '../../testing/tax-data-fixtures';
import { BreakdownBar } from '../../shared/atoms/breakdown-bar/breakdown-bar';
import { LineChart } from '../../shared/atoms/line-chart/line-chart';
import { PdfExportService } from './pdf-export.service';
import { DISCLAIMER } from './pdf-renderer';
import { ReportModel, ReportRow, percent, rand, text } from './report-model';

const TODAY = new Date(2026, 9, 23);
const VERIFIED_LINE =
  'Data: tax year 2026/27 (verified, checked 01 Mar 2026). SARB rates as of 22 Oct 2026.';

function report(patch: Partial<ReportModel> = {}): ReportModel {
  return {
    id: 'pay',
    title: 'Pay: take-home estimate',
    subtitle: 'Based on R 30 000,00 gross pay a month',
    inputs: [
      {
        rows: [
          { label: 'Gross pay', value: rand(30000, 'a month') },
          { label: 'Age at the end of the tax year', value: text('35') },
        ],
      },
    ],
    results: [
      {
        rows: [
          {
            label: 'Net pay',
            value: rand(25141.88, 'a month'),
            emphasis: true,
            detail: 'R 301 702,56 a year',
          },
          { label: 'Marginal rate', value: percent(0.26, 1) },
        ],
      },
    ],
    charts: [],
    warnings: [],
    notes: [],
    ...patch,
  };
}

describe('PdfExportService', () => {
  let fake: FakePdf;

  function setup(
    options: Parameters<typeof fakePdfLibs>[0] = {},
    data: Parameters<typeof provideTestData>[0] = { today: TODAY },
  ): PdfExportService {
    fake = fakePdfLibs(options);
    TestBed.configureTestingModule({ providers: [provideTestData(data), fake.provider] });
    return TestBed.inject(PdfExportService);
  }

  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('[data-pdf-chart]').forEach((el) => el.remove());
  });

  describe('content', () => {
    it('writes the brand, title, subtitle, section headings and every row', async () => {
      const service = setup();
      const result = await service.download(report());
      expect(result.ok).toBe(true);

      const written = fake.doc().allText();
      expect(written).toEqual(
        expect.arrayContaining([
          'Randwise',
          'Pay: take-home estimate',
          'Based on R 30 000,00 gross pay a month',
          'INPUTS',
          'RESULTS',
          'Gross pay',
          'R 30 000,00 a month',
          'Net pay',
          'R 25 141,88 a month',
          'R 301 702,56 a year',
          'Marginal rate',
          '26%',
        ]),
      );
      // The rows come in the order the model lists them.
      expect(written.indexOf('INPUTS')).toBeLessThan(written.indexOf('Gross pay'));
      expect(written.indexOf('Gross pay')).toBeLessThan(written.indexOf('RESULTS'));
      expect(written.indexOf('RESULTS')).toBeLessThan(written.indexOf('Net pay'));
    });

    it('right-aligns values and uses plain spaces, never Unicode ones', async () => {
      const service = setup();
      await service.download(report());
      const value = fake.doc().texts.find((t) => t.text === 'R 25 141,88 a month');
      expect(value?.align).toBe('right');
      expect(fake.doc().allText().join('')).not.toMatch(/[\u00a0\u202f]/);
    });

    it('prints section headings, paragraphs and warnings with a Warning: prefix', async () => {
      const service = setup();
      await service.download(
        report({
          results: [
            {
              heading: 'Retirement deduction',
              rows: [{ label: 'Excess', value: rand(1000) }],
              paragraphs: ['Carried forward to later years.'],
            },
          ],
          warnings: ['You contribute more than this limit.'],
          notes: ['PAYE uses the annual-equivalent method.'],
        }),
      );
      const written = fake.doc().allText();
      expect(written).toEqual(
        expect.arrayContaining([
          'Retirement deduction',
          'Carried forward to later years.',
          'WARNINGS',
          'Warning:',
          'You contribute more than this limit.',
          'NOTES',
          'PAYE uses the annual-equivalent method.',
        ]),
      );
    });

    it('omits the warnings and notes sections when there are none', async () => {
      const service = setup();
      await service.download(report());
      const written = fake.doc().allText();
      expect(written).not.toContain('WARNINGS');
      expect(written).not.toContain('NOTES');
      expect(written).not.toContain('CHARTS');
    });

    it('sets the document properties', async () => {
      const service = setup();
      await service.download(report());
      expect(fake.doc().properties).toEqual({
        title: 'Pay: take-home estimate',
        subject: 'Randwise estimate',
        creator: 'Randwise',
      });
    });
  });

  describe('footer', () => {
    it('is on a single-page report with the source line, disclaimer, date and page number', async () => {
      const service = setup();
      await service.download(report());
      const page = fake.doc().textsOnPage(1);
      expect(page).toEqual(
        expect.arrayContaining([VERIFIED_LINE, DISCLAIMER, 'Generated 23 Oct 2026', 'Page 1 of 1']),
      );
    });

    it('is on every page of a long report', async () => {
      const service = setup();
      const rows: ReportRow[] = Array.from({ length: 90 }, (_, i) => ({
        label: `Line ${i + 1}`,
        value: rand(1000 + i),
        detail: 'A small note under the label',
      }));
      await service.download(report({ results: [{ heading: 'Many rows', rows }] }));

      const doc = fake.doc();
      expect(doc.pages).toBeGreaterThan(1);
      for (let page = 1; page <= doc.pages; page++) {
        const onPage = doc.textsOnPage(page);
        expect(onPage, `page ${page}`).toEqual(
          expect.arrayContaining([
            VERIFIED_LINE,
            'Estimates only, not financial advice.',
            'Generated 23 Oct 2026',
            `Page ${page} of ${doc.pages}`,
          ]),
        );
      }
    });

    it('never splits a row across pages and repeats a small header on later pages', async () => {
      const service = setup();
      const rows: ReportRow[] = Array.from({ length: 90 }, (_, i) => ({
        label: `Line ${i + 1}`,
        value: rand(1000 + i),
      }));
      await service.download(report({ results: [{ rows }] }));
      const doc = fake.doc();
      for (const row of rows) {
        const label = doc.texts.filter((t) => t.text === row.label);
        expect(label).toHaveLength(1);
      }
      expect(doc.textsOnPage(2)).toContain('Randwise: Pay: take-home estimate');
    });
  });

  describe('data-source line', () => {
    it('says verified with the check date and the rates date', () => {
      const service = setup();
      expect(service.dataSourceLine()).toBe(VERIFIED_LINE);
    });

    it('says draft', () => {
      const service = setup(
        {},
        {
          today: TODAY,
          taxYears: [{ fileName: '2027.json', data: makeTaxYear(2027, { status: 'draft' }) }],
        },
      );
      expect(service.dataSourceLine()).toContain('(draft, checked 01 Mar 2026)');
    });

    it('says verified (auto)', () => {
      const service = setup(
        {},
        {
          today: TODAY,
          taxYears: [{ fileName: '2027.json', data: makeTaxYear(2027, { status: 'verified-auto' }) }],
        },
      );
      expect(service.dataSourceLine()).toContain('(verified (auto), checked 01 Mar 2026)');
    });

    it('says out of date once the tax year has ended', () => {
      const service = setup({}, { today: new Date(2027, 2, 5) });
      expect(service.dataSourceLine()).toContain(
        'Data: tax year 2026/27 (out of date, ended 28 Feb 2027).',
      );
    });

    it('says tax data is unavailable when there is no valid file', () => {
      const service = setup({}, { today: TODAY, taxYears: [] });
      expect(service.dataSourceLine()).toBe(
        'Data: tax data unavailable. SARB rates as of 22 Oct 2026.',
      );
    });

    it('says rates are unavailable when the rates file is invalid', () => {
      const service = setup({}, { today: TODAY, rates: { fileName: 'rates.json', data: {} } });
      expect(service.dataSourceLine()).toBe(
        'Data: tax year 2026/27 (verified, checked 01 Mar 2026). Rates unavailable.',
      );
    });
  });

  describe('download', () => {
    it('saves once, with a slug and the local date', async () => {
      const service = setup();
      const result = await service.download(report());
      expect(result).toEqual({ ok: true, fileName: 'randwise-pay-2026-10-23.pdf' });
      expect(fake.doc().saved).toEqual(['randwise-pay-2026-10-23.pdf']);
    });

    it('uses the report id in the slug', async () => {
      const service = setup();
      const result = await service.download(report({ id: 'retire-at-55' }));
      expect(result).toEqual({ ok: true, fileName: 'randwise-retire-at-55-2026-10-23.pdf' });
    });

    it('loads the libraries once for repeated downloads', async () => {
      const service = setup();
      await service.download(report());
      await service.download(report());
      expect(fake.loads).toBe(1);
      expect(fake.docs).toHaveLength(2);
    });
  });

  describe('failures', () => {
    it('returns load-failed, without throwing or saving, when the libraries cannot load', async () => {
      const service = setup({ failLoad: true });
      const result = await service.download(report());
      expect(result).toEqual({
        ok: false,
        reason: 'load-failed',
        message: 'Could not load the PDF tools. Check your connection and try again.',
      });
      expect(fake.docs).toHaveLength(0);
    });

    it('retries the load after a failure', async () => {
      const service = setup({ failLoad: true });
      expect((await service.download(report())).ok).toBe(false);
      fake.options.failLoad = false;
      const second = await service.download(report());
      expect(second.ok).toBe(true);
      expect(fake.loads).toBe(2);
      expect(fake.doc().saved).toHaveLength(1);
    });

    it('returns render-failed when the document cannot be created', async () => {
      const service = setup({ failCreate: true });
      const result = await service.download(report());
      expect(result).toEqual({
        ok: false,
        reason: 'render-failed',
        message: 'Could not create the PDF. Try again.',
      });
    });

    it('returns render-failed, without saving, when drawing throws', async () => {
      const service = setup();
      vi.spyOn(FakePdfDoc.prototype, 'text').mockImplementation(() => {
        throw new Error('boom');
      });
      const result = await service.download(report());
      expect(result).toMatchObject({ ok: false, reason: 'render-failed' });
      expect(fake.doc().saved).toEqual([]);
    });
  });

  describe('charts', () => {
    function mountLine(id: string): ComponentFixture<LineChart> {
      const fixture = TestBed.createComponent(LineChart);
      fixture.componentRef.setInput('label', 'Growth');
      fixture.componentRef.setInput('series', {
        name: 'Balance',
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 1000 },
        ],
      });
      fixture.componentRef.setInput('xLabel', 'Age');
      fixture.componentRef.setInput('yLabel', 'Balance');
      fixture.nativeElement.setAttribute('data-pdf-chart', id);
      return fixture;
    }
    it('succeeds with a model that has no charts, drawing none', async () => {
      const service = setup();
      const result = await service.download(report({ charts: [] }));
      expect(result.ok).toBe(true);
      expect(fake.svgCalls).toHaveLength(0);
    });

    it('skips a chart whose host is not on the page, with no CHARTS heading', async () => {
      const service = setup();
      const result = await service.download(
        report({ charts: [{ id: 'missing', title: 'Missing chart' }] }),
      );
      expect(result.ok).toBe(true);
      expect(fake.svgCalls).toHaveLength(0);
      expect(fake.doc().allText()).not.toContain('CHARTS');
      expect(fake.doc().allText()).not.toContain('Missing chart');
    });

    it('skips a chart in its empty state (no svg)', async () => {
      const service = setup();
      const fixture = TestBed.createComponent(LineChart);
      fixture.componentRef.setInput('label', 'Growth');
      fixture.componentRef.setInput('series', { name: 'Balance', points: [] });
      fixture.nativeElement.setAttribute('data-pdf-chart', 'empty');
      await fixture.whenStable();
      const result = await service.download(report({ charts: [{ id: 'empty', title: 'Empty' }] }));
      expect(result.ok).toBe(true);
      expect(fake.svgCalls).toHaveLength(0);
    });

    it('draws a chart that is on the page from a detached-after clone', async () => {
      const service = setup();
      const fixture = mountLine('growth');
      await fixture.whenStable();
      const original = fixture.nativeElement.querySelector('svg') as SVGSVGElement;

      const result = await service.download(
        report({ charts: [{ id: 'growth', title: 'How your RA grows' }] }),
      );

      expect(result.ok).toBe(true);
      expect(fake.svgCalls).toHaveLength(1);
      const call = fake.svgCalls[0];
      expect(call.svg).not.toBe(original);
      expect(call.svg.getAttribute('class')).toBeNull();
      // svg2pdf needs the svg in the document while it draws, then it must be cleaned up.
      expect(call.connected).toBe(true);
      expect(call.svg.isConnected).toBe(false);
      expect(call.box.x).toBe(92);
      expect(call.box.width).toBeCloseTo(463.28, 1);
      expect(call.box.height).toBe(Math.round(call.box.width * (260 / 600)));
      expect(original.isConnected).toBe(true);

      const written = fake.doc().allText();
      expect(written).toContain('CHARTS');
      expect(written).toContain('How your RA grows');
      // Axis ticks and titles are printed as text next to the vector chart.
      expect(written).toEqual(expect.arrayContaining(['Age', 'Balance']));
    });

    it('draws a bar chart with a legend', async () => {
      const service = setup();
      const fixture = TestBed.createComponent(BreakdownBar);
      fixture.componentRef.setInput('label', 'Split');
      fixture.componentRef.setInput('segments', [
        { label: 'Net', value: 750, tone: 'accent' },
        { label: 'PAYE', value: 250, tone: 'rose' },
      ]);
      fixture.nativeElement.setAttribute('data-pdf-chart', 'split');
      await fixture.whenStable();

      await service.download(report({ charts: [{ id: 'split', title: 'Where it goes' }] }));

      expect(fake.svgCalls).toHaveLength(1);
      expect(fake.svgCalls[0].box.height).toBe(18);
      expect(fake.doc().allText()).toEqual(expect.arrayContaining(['Net', 'PAYE', '75%', '25%']));
      // One colour swatch per legend row.
      expect(fake.doc().rects).toHaveLength(2);
    });

    it('skips a chart that fails to draw but still finishes the PDF', async () => {
      const service = setup({ failSvg: true });
      const fixture = mountLine('growth');
      await fixture.whenStable();

      const result = await service.download(
        report({ charts: [{ id: 'growth', title: 'How your RA grows' }] }),
      );

      expect(result.ok).toBe(true);
      expect(fake.svgCalls).toHaveLength(1);
      expect(fake.doc().saved).toEqual(['randwise-pay-2026-10-23.pdf']);
      expect(fake.doc().allText()).not.toContain('How your RA grows');
      expect(fake.doc().allText()).toContain('Net pay');
      // The mounted clone is removed even when drawing fails.
      expect(document.body.querySelectorAll('div[aria-hidden="true"] > svg')).toHaveLength(0);
    });
  });
});
