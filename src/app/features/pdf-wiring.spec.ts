import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { routes } from '../app.routes';
import { TODAY } from '../core/data/data-source';
import { PdfExportService } from '../core/pdf/pdf-export.service';
import { ReportId, ReportModel } from '../core/pdf/report-model';
import { PlanBuilderStore } from '../core/plan/plan-builder.store';
import { FakeMatchMedia, installFakeMatchMedia } from '../testing/fake-match-media';
import { findRow } from '../testing/report-text';

// Pinned so the bundled 2027 file is the year in use (the same date the page specs use).
const TODAY_PINNED = new Date(2026, 9, 22);

const PAGES: readonly (readonly [string, ReportId])[] = [
  ['/pay', 'pay'],
  ['/ra', 'ra'],
  ['/retire', 'retire-at-55'],
  ['/budget', 'budget'],
  ['/journey', 'journey'],
  ['/plan', 'plan'],
  ['/toolbox/emergency-fund', 'emergency-fund'],
  ['/toolbox/home-loan', 'home-loan'],
  ['/toolbox/two-pot-withdrawal', 'two-pot-withdrawal'],
  ['/toolbox/tfsa-vs-taxable', 'tfsa-vs-taxable'],
];

describe('PDF export on every result area', () => {
  let fake: FakeMatchMedia;
  const download = vi.fn<(report: ReportModel) => Promise<{ ok: true; fileName: string }>>();

  beforeEach(() => {
    fake = installFakeMatchMedia({ reducedMotion: true });
    download.mockReset();
    download.mockResolvedValue({ ok: true, fileName: 'x.pdf' });
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: TODAY, useValue: () => new Date(TODAY_PINNED) },
        { provide: PdfExportService, useValue: { download } },
      ],
    });
  });
  afterEach(() => fake.uninstall());

  async function open(url: string): Promise<{ root: HTMLElement; harness: RouterTestingHarness }> {
    if (url === '/plan') {
      const plan = TestBed.inject(PlanBuilderStore);
      plan.update({ goal: 'pay-less-tax', surplusMonthly: 10_000 });
      plan.finish();
    }
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await harness.fixture.whenStable();
    return { root: harness.routeNativeElement as HTMLElement, harness };
  }

  describe.each(PAGES)('%s', (url, id) => {
    it('shows exactly one labelled Download PDF button', async () => {
      const { root } = await open(url);
      const buttons = root.querySelectorAll('rw-download-pdf button');
      expect(buttons).toHaveLength(1);
      expect(buttons[0].textContent?.trim()).toBe('Download PDF');
      expect((buttons[0] as HTMLButtonElement).disabled).toBe(false);
    });

    it('exports a report with the right id when the button is clicked', async () => {
      const { root, harness } = await open(url);
      (root.querySelector('rw-download-pdf button') as HTMLButtonElement).click();
      await harness.fixture.whenStable();
      expect(download).toHaveBeenCalledTimes(1);
      expect(download.mock.calls[0][0].id).toBe(id);
    });

    it('has a chart host on the page for every chart in the report', async () => {
      const { root, harness } = await open(url);
      (root.querySelector('rw-download-pdf button') as HTMLButtonElement).click();
      await harness.fixture.whenStable();
      const report = download.mock.calls[0][0];
      for (const chart of report.charts) {
        expect(
          root.querySelector(`[data-pdf-chart="${chart.id}"]`),
          `chart host ${chart.id}`,
        ).not.toBeNull();
      }
    });
  });

  it('takes the Pay numbers straight from the page result', async () => {
    const { root, harness } = await open('/pay');
    (root.querySelector('rw-download-pdf button') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    const report = download.mock.calls[0][0];
    // The same figure the page shows for the default R 30 000 example.
    expect(findRow(report.results, 'Net pay')?.value).toMatchObject({ kind: 'rand', amount: 25141.88 });
  });

  it('has no button on the Toolbox landing page, which has no results', async () => {
    const { root } = await open('/toolbox');
    expect(root.querySelectorAll('rw-download-pdf')).toHaveLength(0);
  });
});
