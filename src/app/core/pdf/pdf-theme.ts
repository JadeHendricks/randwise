/**
 * Print palette and page layout for the PDF. Hex values mirror the LIGHT tokens in
 * `src/styles/_tokens.scss`: the PDF is always printed light, whatever theme the page is in.
 * Text colours measure at least 4.5:1 on white and chart colours at least 3:1.
 */
export const PRINT = {
  ink: '#0f1a15',
  muted: '#435349',
  accent: '#0b6b49',
  rule: '#c9d6ce',
  track: '#dfe6e2',
  grid: '#d5ddd8',
  white: '#ffffff',
  dangerText: '#8a1c17',
  warningText: '#6b4a00',
} as const;

/** Chart series colours by tone (the `--rw-chart-*` tokens, light theme). */
export const TONE_COLOURS: Readonly<Record<string, string>> = {
  accent: '#0b6b49',
  sun: '#8f6a00',
  sky: '#1d5fa8',
  rose: '#b3403a',
  violet: '#6a3fb5',
  muted: '#5b6b62',
};

/** Points. A4 portrait. */
export const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 40,
  /** Space kept clear at the bottom of every page for the footer. */
  footerReserve: 74,
} as const;

/** Font sizes in points. */
export const SIZE = {
  brand: 20,
  title: 16,
  subtitle: 10,
  section: 11,
  subheading: 10,
  row: 10,
  rowEmphasis: 12,
  detail: 8.5,
  paragraph: 9.5,
  footer: 8,
  continuation: 9,
} as const;

/** Spacing in points. */
export const GAP = {
  line: 1.3,
  row: 5,
  section: 16,
  block: 10,
} as const;
