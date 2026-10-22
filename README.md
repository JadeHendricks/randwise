# Randwise
A South African personal-finance planner (RA, TFSA, tax, budgeting). Frontend-only, runs locally, nothing is saved.
Estimates only, not financial advice.

## What it is

Randwise helps salaried South Africans explore their money in rand (ZAR). It is a frontend-only Angular app: no backend, database or API keys, and nothing is persisted. The theme follows your system setting, the toggle overrides it in memory only, and a reload starts fresh.

So far it has the app shell and design system (a left icon rail, a bento dashboard, lazy feature routes, and light and dark themes), the tax-year and rates data layer behind a status badge in the header, and the Pay page, which turns a salary into take-home pay. The dashboard's yellow card shows the same estimate. RA, Retire at 55, Budget, Journey, Plan and Toolbox still show themed "coming soon" cards.

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

- `src/app/core`: services, stores and navigation data. `core/engine` holds the pure TypeScript tax engine (no Angular or RxJS imports, enforced by lint). `core/salary` holds the Pay inputs store and estimator.
- `src/app/features`: one lazy folder per route.
- `src/app/shared`: `atoms`, `molecules` and `organisms`, plus `charts` (chart geometry helpers) and `format` (rand and percent formatters).
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

## Tax engine

`src/app/core/engine` (public API in `index.ts`) works out a salaried employee's tax. The Pay page and the dashboard card use it through core/salary.

- It computes income tax from the brackets, age rebates (65 and 75), the s6A medical scheme fees credit, the s11F retirement deduction (with employer contributions taxed as a fringe benefit that also counts toward the deduction, and the excess and headroom reported), employee UIF, a monthly and annual `payslip` with marginal and effective rates, and `grossFromNet`, which finds the gross for a target net pay.
- Every figure comes from the tax-year file through `toTaxTables(file)`. The engine itself holds no tax numbers.
- Simplifications: PAYE uses the annual-equivalent method (monthly PAYE = annual tax / 12, so it can differ from SARS's monthly tables by cents). The s6B additional medical credit is ignored, as PAYE does. UIF is on cash salary only. The marginal rate is 0 while no tax is due after rebates.
- Rounding: everything is full precision inside the engine. Round once, at display, with `roundRand` (to cents, half away from zero).

## Pay page and charts

- The Pay page (`/pay`) takes a gross or take-home amount, per month or per year, plus age, medical aid members, your retirement contributions, employer retirement contributions and other deductions. It shows net pay (monthly and annual), PAYE, UIF, the medical credit, taxable income, marginal and effective rates, retirement headroom, a breakdown bar, a net-versus-gross line chart and a table of every figure.
- Example defaults: R30 000 gross a month, age 35, no medical aid, no retirement or other deductions. That gives PAYE R4 681,00, UIF R177,12 and net pay R25 141,88 a month on the bundled 2026/27 data. These show as an example until you change something; Reset returns to them.
- Medical members map straight to the engine: 0 is none, 1 is the main member, 2 adds the first dependant and each further member adds one additional dependant. On the shipped data that is a monthly credit of R376, R752, then R1 006 for 3. The credit is non-refundable and cannot push PAYE below zero.
- `SalaryInputsStore` (`core/salary`) holds the inputs as signals in memory. `SalaryEstimator` turns them into a payslip, breakdown and chart curve with the engine, or reports that there is no tax data or the figures could not be worked out. The Pay page and the dashboard card read the same estimator, so they always agree. Components only bind its outputs; the maths stays in the engine.
- Dashboard: the yellow hero card shows the same net pay, labelled "Example take-home pay" until you edit the inputs and "Your take-home pay" afterwards, with a dot matrix of the gross split and a link to the Pay page. Without tax data it shows text instead of a figure.
- Chart atoms live in `shared/atoms` and are plain SVG with no chart library: `rw-breakdown-bar`, `rw-ring-gauge`, `rw-line-chart` and `rw-dot-matrix`. Each draws an `svg` with `role="img"` and a full `aria-label`, and sits beside a visually hidden data table with the same numbers. Negative, NaN and infinite values are clamped to 0 and positive values always stay visible. Colours come from the `--rw-chart-*` tokens (at least 3:1 against the surface in both themes) and animations switch off with reduced motion.
- Nothing is persisted: inputs live in memory and a reload returns to the example.
## Styling rules

- Atomic design: atoms, molecules, organisms, then page blocks.
- BEM names with an `rw-` prefix (`rw-card__title--muted`).
- Low specificity: one class per rule, no ids, no `!important`. Prefer a new modifier over a stronger selector.
- Design tokens are CSS custom properties in `_tokens.scss`. Dark overrides use the single `[data-theme='dark']` selector on `<html>`.
- Shared mixins (glass surface, focus ring, pill button, visually hidden, breakpoints, reduced motion) live in `_mixins.scss`.
- Shared UI uses `ViewEncapsulation.None` with styles in the global partials. Route-only styles sit next to their component.

## Accessibility

Skip-to-content link, header/nav/main/footer landmarks, `aria-current` on the active nav link, labelled inputs, visible focus rings, AA contrast in both themes, and reduced-motion support (count-up animation and transitions switch off).
