import { pdfSafeText, reportFileName } from './pdf-text';

describe('pdfSafeText', () => {
  it('turns the non-breaking spaces Intl uses into plain spaces', () => {
    expect(pdfSafeText('R\u00a025\u202f141,88')).toBe('R 25 141,88');
  });

  it('writes arrows and minus signs in ASCII', () => {
    expect(pdfSafeText('31% \u2192 36%')).toBe('31% to 36%');
    expect(pdfSafeText('\u2212R 5')).toBe('-R 5');
  });

  it('drops characters the built-in font cannot draw', () => {
    expect(pdfSafeText('Tick \u2713 done \u{1F600}')).toBe('Tick done');
  });

  it('keeps characters WinAnsi can draw', () => {
    const kept = 'R 12,5% \u00b7 2 \u00d7 3 \u201cquoted\u201d it\u2019s \u2013 ok';
    expect(pdfSafeText(kept)).toBe(kept);
  });

  it('collapses repeated spaces and trims', () => {
    expect(pdfSafeText('  a   b  ')).toBe('a b');
  });

  it('is empty for empty input', () => {
    expect(pdfSafeText('')).toBe('');
  });
});

describe('reportFileName', () => {
  it('builds a slug with the report id and the date', () => {
    expect(reportFileName('pay', '2026-10-23')).toBe('randwise-pay-2026-10-23.pdf');
    expect(reportFileName('retire-at-55', '2027-03-01')).toBe('randwise-retire-at-55-2027-03-01.pdf');
  });
});
