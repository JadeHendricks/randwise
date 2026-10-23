# Randwise
A South African personal-finance planner (RA, TFSA, tax, budgeting). Frontend-only, runs locally, nothing is saved.
Estimates only, not financial advice.

## What it is

Randwise helps salaried South Africans explore their money in rand (ZAR). It is a frontend-only Angular app: no backend, database or API keys, and nothing is persisted. The theme follows your system setting, the toggle overrides it in memory only, and a reload starts fresh.

So far it has the app shell and design system (a left icon rail, a bento dashboard, lazy feature routes, and light and dark themes), the tax-year and rates data layer behind a status badge in the header, the Pay page, which turns a salary into take-home pay, and the RA calculator, which projects a retirement annuity and its tax saving. The dashboard's yellow card shows the same take-home estimate, and its RA, Retire at 55, Budget and Journey tiles show live figures. Retire at 55 is live too: it works out the monthly contribution needed to retire on a target income and how that income holds up through retirement. Budget turns your take-home pay into a spending plan with RA, TFSA and emergency-fund checks, and Journey follows an RA contribution, its tax refund and a TFSA year by year to retirement. Pay, RA, Retire at 55, Budget and Journey can send figures to each other. Plan and Toolbox still show themed "coming soon" cards.

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
## RA calculator and handoff
- The RA page (`/ra`) projects a retirement annuity: tax-deductible room this year, the tax saving from a monthly contribution, and the balance at retirement in future and today's money, with a growth chart, a two-pot split and a year-by-year table. It starts from an example (R2 000 a month, rising 5% a year, retiring at 55) until you change something.
- Engine: `core/engine/ra.ts` is pure TypeScript. Rates are effective annual rates, converted to a monthly rate with `(1 + R)^(1/12) - 1`. Contributions are paid at the end of each month and rise once a year. Today's money is nominal / (1 + inflation)^t.
- Headroom comes from the s11F deduction (the same calculation as the Pay page). The tax saving is the PAYE difference with and without the RA, worked out with `payslip`. A quick estimate (contribution x marginal rate) is shown when it differs, which happens when the contribution crosses a bracket or when rebates and the medical credit already reduce your tax.
- Contributions over the limit get no deduction this year. The excess is shown as carried forward, but using it in later years is not modelled.
- Retirement age runs from 55 to 80. Below 55 the projection stops at 55 and a warning shows; at or past the chosen age it shows today's balance.
- Two-pot: new contributions are split between the savings and retirement pots using the shares in the tax-year file. Your opening balance is treated as the vested pot and is not split, which is a simplification. No withdrawals are modelled.
- Assumptions come from the rates data: inflation is CPI, the return is CPI plus 5 percentage points, and "Use cash return" switches to the repo rate. If rates are unavailable both start at 0.
- `PlanContextStore` (`core/plan`) is where calculators share figures. Its profile wraps the Salary inputs and estimate and stays live. A "Send to" handoff carries the Salary figures, with their source, to the RA page, which shows a "From Salary" chip and an Undo button that restores your earlier RA figures. Outputs (RA headroom and tax saving) feed the dashboard.
- `rw-send-to` appears on the Pay, RA, Retire at 55, Budget and Journey results. Every target works (Retirement annuity, Retire at 55, Budget and Journey), and each page leaves itself out. The component can still show a target without a route as "Coming soon", but none of the shipped targets does.
- Dashboard: the RA tile reads the store and is labelled "Illustrative RA" until you change or send figures, then "Your RA". It is plain text, so the dashboard still has one money figure.
- Nothing is persisted: the handoff and RA edits live in memory and a reload returns to the examples. Estimates only.
## Retire at 55
- The Retire at 55 page (`/retire`) starts from an example (R50 000 a month after tax from age 55, on a R30 000 salary, R2 000 a month saved today) and works out the monthly RA contribution that reaches it, the capital needed at retirement, how on track the current contribution is, the return you would need to keep today's contribution, and how long the money lasts. Nothing is saved.
- Engine: `core/engine/retire.ts` is pure TypeScript. Accumulation reuses `raProjection` from the RA engine (yearly rates compounded monthly, contributions at the end of each month rising once a year), so there is one compounding loop. The contribution and return solvers are bounded bisections over that projection.
- Order of the maths: the net income goal is inflated to the retirement year, grossed up for annuity tax, divided by the drawdown rate to get the living annuity capital, and, if a lump sum is taken, grossed up again so that two thirds still buy that annuity. The result is also shown in today's money.
- Tax on annuity income uses the tax-year file: the income tax brackets, the rebates for the age in each year, and the s6A medical scheme fees credit capped at the tax. There is no UIF and no s11F deduction, because annuity income is neither remuneration nor a retirement contribution. The gross-up is solved by bisection.
- Simplification: future income is taxed with this year's tax tables, which are not raised for inflation. Tax in later years is therefore overstated, and the capital needed is on the high side. The page says so.
- Retirement phase: a year-by-year model from the retirement age to age 100. Income is paid at the start of each year and rises with inflation. Tax is worked out each year with that age's rebates, so the 65 and 75 step-ups show as lower tax and higher take-home. The money runs out when the balance cannot pay the year's income. Age 100 is a product choice, not a tax rule.
- Living annuity: you draw a share of the balance each year. The law allows 2,5% to 17,5% (read from the tax-year file); a value outside that range is explained on the page, not silently changed. The page warns from the first age at which the income is more than the maximum share of the balance.
- One-third lump sum: up to one third of the RA can be taken as cash and the rest buys an annuity. The lump sum is taxed on the retirement lump sum table from the tax-year file. That table is cumulative over a lifetime, so the page assumes this is your only retirement or withdrawal lump sum; earlier ones would raise the tax. If the whole value is at or below the de minimis amount (R360 000), a note says you may be allowed to take it all as cash, but the plan still assumes a living annuity.
- Two-pot: the one-third rule is applied to the whole RA value, which is a simplification of the two-pot rules.
- Defaults come from the rates data: inflation is CPI, the return before retirement is CPI plus 5 percentage points, and the return in retirement is CPI plus 3 percentage points. If rates are unavailable they start at 0. Retirement age runs from 55 to 80; the field reaches 40 so the "before 55" message can show.
- Handoffs: Pay can send the Salary figures to Retire at 55 ("From Salary"). RA sends its contribution, yearly increase, balance, returns and retirement age ("From RA"). Retire at 55 sends the solved contribution (to the cent) and the same plan figures to RA ("From Retire at 55"). Each send shows a chip with Undo that restores the earlier figures. Sending from Salary to RA is unchanged.
- Dashboard: the Retire at 55 tile reads the store and is labelled "Illustrative plan" until you change or send figures, then "Your plan". It shows the contribution needed and "On track" as plain text, so the dashboard still has one money figure.
- Estimates only; nothing is persisted.
## Budget

- The Budget page (`/budget`) starts from an example: a 50/30/20 split of the take-home pay on the Salary figures (R25 141,88 on the bundled data) until you change something. You can enter a gross or a take-home amount, per month or per year. Switching keeps the same person.
- The base is take-home pay from the Pay engine (`estimateSalary`). Your own payroll retirement contributions and other deductions are already out of it. An employer retirement contribution is not cash, so it is not in it either.
- Lines: Needs (housing, groceries, transport, insurance, utilities, other), Wants, and Savings (RA, TFSA, emergency fund, debt, other savings). You can add, rename and remove your own lines in any group. Each has a stable id, so editing one never moves another.
- Amounts are monthly rands kept at full precision and are the single source of truth. A percent is derived (`amount / take-home`), and typing a percent sets the amount. Amount fields show cents, percents show two decimals, and the group totals and status come from the full-precision figures, so the shown percents may not add to exactly 100%.
- Presets (50/30/20, 60/20/20, 70/20/10) spread the three group totals over the lines, keeping how each group is already split. A group with only zero lines uses the default shares, then equal shares; a group with no lines leaves its part unallocated. "Custom" shows once the amounts are not a preset.
- Status: "Every rand has a job", "Unallocated R x" or "Over-allocated by R x". The status is worked out on amounts rounded to cents, so float dust never says "over by R 0,00".
- RA check: the RA line is paid from take-home on top of any payroll contributions, so it is measured against your remaining s11F room (`raHeadroom`). The part above the room gets no deduction. The yearly tax saving (from `raTaxSaving`) comes back as a refund when you are assessed.
- TFSA check: the line times 12 is measured against the yearly limit (R46 000) and the lifetime limit (R500 000, less the "TFSA contributions made so far" input, which counts contributions, not growth). SARS taxes the excess at 40%. The tax is charged once, on the larger excess, so a rand is never penalised twice.
- Emergency fund: the target is the months you choose (1 to 12, default 3) times your needs. The page shows progress and how many months until you reach it at the current line.
- Send to: the Budget sends its income and RA line to RA and Retire at 55, and its RA line, TFSA line, TFSA contributions so far and a note about the budget to the Journey. A chip with Undo shows when figures arrive from another page.
- Estimates only; nothing is persisted.

## Journey

- The Journey page (`/journey`) follows an RA contribution, the tax refund it earns and a TFSA, year by year, from now to the retirement age. The example is R2 000 a month to an RA (rising 5% a year) and R1 000 a month to a TFSA until 55, on the Salary figures. The refund goes into the TFSA.
- Engine: `core/engine/journey.ts` is pure TypeScript and reuses `raTaxSaving`, `raProjection` and the shared `core/engine/tfsa.ts`. Rates are effective yearly rates compounded monthly.
- Timing: year 1 is the current tax year and `age = current age + year - 1`. Income, payroll retirement contributions and the RA contribution rise once a year. RA contributions and the TFSA top-up are paid at the end of each month. RA balances come from one `raProjection` over the whole journey. TFSA balances step one year at a time from the opening balance.
- Refund or lower PAYE: by default the tax saving arrives as a refund after filing, so it goes into the TFSA as a lump at the end of the year it relates to and counts against that year's limit. "Lower PAYE each month" spreads it over the year and invests it monthly with the top-up. At 0% returns the two give the same balance.
- Limits: the monthly top-up goes in first, then the refund. Each year is clamped to the yearly TFSA limit and the lifetime limit (R500 000 of contributions). By default the excess is not invested: the refund part is reported as "did not fit under the TFSA limits" (your RA or emergency fund could take it) and the 40% tax is shown as an exposure. "Allow TFSA over-contribution" invests it anyway and reports the 40% tax as incurred; the tax is not taken from the balance shown.
- Milestones: today, the first year the RA uses all the deduction room, the first year the TFSA reaches its yearly limit, the year the lifetime limit is reached, and retirement. They show as an ordered timeline, and the year table sits in a collapsed `details` element.
- Simplifications: every year is taxed with this year's tax tables, which are not raised for inflation, so with income growth later tax savings are on the high side. Payroll retirement contributions rise with income. An RA excess above the deduction room is reported each year but not carried forward to later years. The RA opening balance is not split into the two pots.
- Inputs added for the TFSA: its opening balance, "TFSA contributions made so far" and its own return. Defaults come from the rates data: inflation and income growth are CPI, and both returns are CPI plus 5 percentage points (0 without rates). The retirement age runs from 55 to 80; the field reaches 40 so the "before 55" message can show.
- Handoffs: Journey sends the salary side and the RA plan to RA and Retire at 55, and its RA and TFSA amounts to the Budget. A Budget send adds a note about the budget that is shown but not used in the maths.
- Dashboard: the Budget and Journey tiles read the store, are labelled "Illustrative" until you change or send figures, then "Your budget" and "Your journey", and are plain text, so the dashboard still has one money figure.
- Estimates only; nothing is persisted.
## Styling rules

- Atomic design: atoms, molecules, organisms, then page blocks.
- BEM names with an `rw-` prefix (`rw-card__title--muted`).
- Low specificity: one class per rule, no ids, no `!important`. Prefer a new modifier over a stronger selector.
- Design tokens are CSS custom properties in `_tokens.scss`. Dark overrides use the single `[data-theme='dark']` selector on `<html>`.
- Shared mixins (glass surface, focus ring, pill button, visually hidden, breakpoints, reduced motion) live in `_mixins.scss`.
- Shared UI uses `ViewEncapsulation.None` with styles in the global partials. Route-only styles sit next to their component.

## Accessibility

Skip-to-content link, header/nav/main/footer landmarks, `aria-current` on the active nav link, labelled inputs, visible focus rings, AA contrast in both themes, and reduced-motion support (count-up animation and transitions switch off).
