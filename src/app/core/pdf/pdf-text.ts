import { ReportId } from './report-model';

// jsPDF's built-in Helvetica is WinAnsi (Windows-1252). Beyond Latin-1 it only has these.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

/**
 * Makes text safe for the built-in PDF font: Unicode spaces (Intl en-ZA uses U+00A0 and U+202F)
 * become a plain space, arrows and minus signs become ASCII, and anything WinAnsi cannot draw is
 * dropped instead of printing as garbage.
 */
export function pdfSafeText(value: string): string {
  let out = '';
  for (const char of value.normalize('NFC')) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x2192) out += 'to';
    else if (code === 0x2212) out += '-';
    else if (code === 0x2009 || code === 0x00a0 || code === 0x202f || (code >= 0x2000 && code <= 0x200a))
      out += ' ';
    else if (code === 0x200b || code === 0x200d || code === 0xfeff || code === 0x00ad) continue;
    else if (code === 0x09 || code === 0x0a) out += ' ';
    else if (code < 0x20) continue;
    else if (code <= 0xff || WIN_ANSI_EXTRA.has(char)) out += char;
    else continue;
  }
  return out.replace(/ {2,}/g, ' ').trim();
}

/** `randwise-pay-2026-10-23.pdf` */
export function reportFileName(id: ReportId, isoDate: string): string {
  return `randwise-${id}-${isoDate}.pdf`;
}
