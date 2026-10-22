# Randwise
A South African personal-finance planner (RA, TFSA, tax, budgeting). Frontend-only, runs locally, nothing is saved.
Estimates only, not financial advice.

## What it is

Randwise helps salaried South Africans explore their money in rand (ZAR). It is a frontend-only Angular app: no backend, database or API keys, and nothing is persisted. The theme follows your system setting, the toggle overrides it in memory only, and a reload starts fresh.

So far it has the app shell and design system (a left icon rail, a bento dashboard, lazy feature routes for Pay, RA, Retire at 55, Budget, Journey, Plan and Toolbox that show themed "coming soon" cards, and light and dark themes) and the tax-year and rates data layer behind a status badge in the header. The calculators themselves are still to come.

## Requirements

- Node `^24.15` and npm

## Commands

```
npm install
npm start        # dev server at http://localhost:4200
npm test         # unit tests, single run (Vitest)
npm run lint     # ESLint (angular-eslint)
npm run build    # production build into dist/
```

## Folder layout

- `src/app/core`: services, stores and navigation data. `core/engine` is reserved for pure TypeScript finance maths (no Angular imports) and is added with the first calculator.
- `src/app/features`: one lazy folder per route.
- `src/app/shared`: `atoms`, `molecules` and `organisms`.
- `src/app/testing`: fakes and helpers for specs.
- `src/styles`: design tokens, mixins, base styles, and one partial per atom, molecule and organism.

## Tax and rates data

Tax rules and interest rates are plain JSON, checked at startup. Nothing is fetched at runtime.

- Tax years: `src/assets/data/tax-years/<YYYY>.json`, named after the year the tax year ends (`2027.json` is 1 March 2026 to 28 February 2027). Rates: `src/assets/data/rates.json`.
- The files are bundled with static imports in `src/app/core/data/bundled-data.ts`, not served as assets. To add a year, drop in the new file and add one import and one entry there.
- Money is whole rands and rates are decimal fractions (`0.18` is 18%). Every value is a field of the form `{ "value": ..., "carriedForward": false, "source": "https://..." }`. `source` is the official page it was confirmed on and must also be listed in the file's `sources`. `carriedForward: true` means it could not be confirmed for that year, so the last official value is used.
- `status` is `verified` (every field confirmed), `verified-auto` (reserved for the automated tax-season check) or `draft` (at least one field carried forward). `verifiedOn` is the day the values were checked.
- The validator reports every problem at once and rejects a file for: missing or mistyped fields, a source that is not an https URL listed in `sources`, a file name that does not match its year, a period that is not 1 March to the last day of February, invalid dates, negative numbers, rates outside 0 to 1, bracket tables with gaps, overlaps, falling rates or a wrong cumulative base (more than R1 off), thresholds that do not match the rebates, and two-pot shares that do not add up to 1. An invalid file is left out and shown in the banner instead of being used.
- `TaxYearService` picks the file that covers today, or the nearest year when none does. `RatesService` holds the SARB snapshot. `ratesAsOf` is the day that snapshot was taken (`fetchedOn`); each rate also has its own `asOf` date.
- Default planning assumptions are derived from the rates: inflation is CPI, cash return is the repo rate, and the growth portfolio is CPI plus 5 percentage points. They are labelled as assumptions and listed read-only in the badge panel.
- The header badge shows the tax year, when it was verified and the rates date, with a status chip (Verified, Verified (auto), Draft or Unavailable). It opens a panel with the period, sources, carried-forward fields, rates and assumptions. The banner under the header warns about invalid data (alert), draft data and an ended tax year (status). Dismissing a notice lasts until the page reloads.

## Styling rules

- Atomic design: atoms, molecules, organisms, then page blocks.
- BEM names with an `rw-` prefix (`rw-card__title--muted`).
- Low specificity: one class per rule, no ids, no `!important`. Prefer a new modifier over a stronger selector.
- Design tokens are CSS custom properties in `_tokens.scss`. Dark overrides use the single `[data-theme='dark']` selector on `<html>`.
- Shared mixins (glass surface, focus ring, pill button, visually hidden, breakpoints, reduced motion) live in `_mixins.scss`.
- Shared UI uses `ViewEncapsulation.None` with styles in the global partials. Route-only styles sit next to their component.

## Accessibility

Skip-to-content link, header/nav/main/footer landmarks, `aria-current` on the active nav link, labelled inputs, visible focus rings, AA contrast in both themes, and reduced-motion support (count-up animation and transitions switch off).
