import { IsoDate, parseIsoDate } from './tax-calendar';

// Built once: constructing Intl formatters is comparatively expensive.
const SHORT = new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
const LONG = new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });

/** `2026-10-22` -> `22 Oct 2026`. */
export function formatShortDate(iso: IsoDate): string {
  return SHORT.format(parseIsoDate(iso));
}

/** `2026-10-22` -> `22 October 2026`. */
export function formatLongDate(iso: IsoDate): string {
  return LONG.format(parseIsoDate(iso));
}
