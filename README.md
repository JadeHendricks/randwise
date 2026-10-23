# Randwise

A South African personal-finance planner. Frontend-only, runs locally, nothing is saved.
Estimates only, not financial advice.

## What it is

Randwise helps salaried South Africans plan their money in rand (ZAR). It is a frontend-only Angular app: no backend, no database, no API keys. Nothing is persisted or sent anywhere; theme override is in memory only and a reload starts fresh.

**Calculators** (with their routes):
- **Pay** (`/pay`): net pay from gross, with PAYE, UIF, medical aid credit, marginal and effective rates.
- **RA** (`/ra`): retirement annuity projection, tax deduction room, tax saving and two-pot split.
- **Retire at 55** (`/retire`): monthly contribution needed to retire on a target income, drawdown strategy and money longevity.
- **Budget** (`/budget`): spending plan from take-home with RA, TFSA and emergency-fund checks.
- **Journey** (`/journey`): RA and TFSA, year by year, with tax refunds invested.
- **Plan Builder** (`/plan`): guided wizard for your money goal, from age and income to a step-by-step plan.
- **Toolbox** (`/toolbox`): four tools—emergency fund, home loan, two-pot withdrawal, TFSA vs taxable account.
- **Dashboard** (`/`): quick view of your current take-home, RA, Retire at 55, Budget and Journey.
- **PDF export**: every calculator and plan can download its result as a PDF.

All calculators use the shared tax-year data and can send figures to each other. See each [calculator page](#pay-page-and-charts) for details.

## Requirements

- Node `^24.15` and npm

## Commands

```
npm install
npm start        # dev server at http://localhost:4200 (runs the tax-season check first)
npm test         # app unit tests, then the script tests, single run (Vitest)
npm run test:scripts            # only the tax-season script tests
npm run tax:scout -- --year 2028   # build a tax-year file from the SARS pages
npm run lint     # ESLint (angular-eslint)
npm run build    # production build into dist/
```

In PowerShell, run npm scripts that take options as `cmd /c "npm run tax:scout -- --year 2028"`.

## Folder layout

- `src/app/core`: services, stores and navigation data. `core/engine` holds the pure TypeScript tax engine (no Angular or RxJS imports, enforced by lint). `core/salary` holds the Pay inputs store and estimator.
- `src/app/core/pdf`: PDF export. `PdfExportService` and its `ReportModel` types, the layout code, and `pdf-libs.ts`, the only file allowed to import `jspdf` and `svg2pdf.js` (lint enforces it).
- `src/app/features`: one lazy folder per route. Each page that exports a PDF has a pure `*-report.ts` next to it.
- `src/app/shared`: `atoms`, `molecules` and `organisms`, plus `charts` (chart geometry helpers) and `format` (rand and percent formatters).
- `src/app/testing`: fakes and helpers for specs.
- `src/styles`: design tokens, mixins, base styles, and one partial per atom, molecule and organism.
- `scripts/tax-season`: Node scripts that update tax and rates JSON (see [How the data updates each tax season](#how-the-data-updates-each-tax-season)).
- `scripts/a11y`: accessibility guard specs (contrast, motion); run as part of `npm run test:scripts`.

## Tax and rates data

Tax rules and interest rates are plain JSON, checked at startup. Nothing is fetched at runtime.

- Tax years: `src/assets/data/tax-years/<YYYY>.json`, named after the year the tax year ends (`2027.json` is 1 March 2026 to 28 February 2027). Rates: `src/assets/data/rates.json`.
- The files are bundled with static imports in `src/app/core/data/bundled-data.ts`, not served as assets. The tax-season scout registers the files it writes there for you; a year you make by hand still needs one import and one entry.
- Money is whole rands and rates are decimal fractions (`0.18` is 18%). Every value is a field of the form `{ "value": ..., "carriedForward": false, "source": "https://..." }`. `source` is the official page it was confirmed on and must also be listed in the file's `sources`. `carriedForward: true` means it could not be confirmed for that year, so the last official value is used.
- `status` is `verified` (every field confirmed), `verified-auto` (written by the tax-season scout when it scraped every field and every check passed) or `draft` (at least one field carried forward). A `verified` or `verified-auto` file with any carried-forward field is rejected, so the scout writes `draft` whenever it had to carry a value forward. `verifiedOn` is the day the values were checked.
- The validator reports every problem at once and rejects a file for: missing or mistyped fields, a source that is not an https URL listed in `sources`, a file name that does not match its year, a period that is not 1 March to the last day of February, invalid dates, negative numbers, rates outside 0 to 1, bracket tables with gaps, overlaps, falling rates or a wrong cumulative base (more than R1 off), thresholds that do not match the rebates, and two-pot shares that do not add up to 1. An invalid file is left out and shown in the banner instead of being used.
- `TaxYearService` picks the file that covers today, or the nearest year when none does. `RatesService` holds the SARB snapshot. `ratesAsOf` is the day that snapshot was taken (`fetchedOn`); each rate also has its own `asOf` date.
- Default planning assumptions are derived from the rates: inflation is CPI, cash return is the repo rate, and the growth portfolio is CPI plus 5 percentage points. They are labelled as assumptions and listed read-only in the badge panel.
- The header badge shows the tax year, when it was verified and the rates date, with a status chip (Verified, Verified (auto), Draft, Out of date or Unavailable). It opens a panel with the period, sources, carried-forward fields, rates and assumptions. The banner under the header warns about invalid data (alert), draft data and an ended tax year (status). Dismissing a notice lasts until the page reloads.

## How the data updates each tax season

The app never fetches data itself. Two Node scripts in `scripts/tax-season` update the local JSON files for you. Every statement here matches the scripts, so read the [privacy](#privacy-1) section first if the automation concerns you.

### On `npm start`

`prestart` runs `scripts/tax-season/check.mjs` first. It does two things.

1. **Rates refresh.** It refreshes `src/assets/data/rates.json` from the [SARB HomePageRates endpoint](https://custom.resbank.co.za/SarbWebApi/WebIndicators/HomePageRates) when `fetchedOn` is more than 7 days old. The new rates are validated before anything is written.

2. **Next year's scout** (from 20 February only). If next year's `src/assets/data/tax-years/<YYYY>.json` is missing or `draft`, it runs the scout for it at most once a day.

It prints a short summary. If anything fails (no network, SARS or SARB changed a page) it warns and carries on, and it never blocks the dev server. It changes tracked JSON, so commit the refreshed files if you want to keep them.

### By hand

Run the scout with `npm run tax:scout -- --year 2028` (in PowerShell: `cmd /c "npm run tax:scout -- --year 2028"`). Elsewhere or on Node directly: `node scripts/tax-season/scout.mjs --year 2028`. The `--year` argument is the year the tax year ends (e.g. `2028` = 1 March 2027 to 29 February 2028).

The scout reads the SARS pages listed in `scripts/tax-season/sources.json`, parses them and then runs consistency checks: each bracket base equals the tax on the lower brackets (within R1), each threshold equals its rebate divided by the lowest rate (within R1), brackets are contiguous with strictly rising rates, and every value is within 25% of last year's. Then it writes the new file, registers it in `bundled-data.ts`, prints a diff against last year and writes `scripts/tax-season/last-report.md` (gitignored).

For manual testing of the check script, set `TAX_SEASON_TODAY=YYYY-MM-DD` in the shell before running `npm start` or `node scripts/tax-season/check.mjs` to override "today"'s date for checking whether to scout.

### Statuses: verified, verified-auto, draft

| Status | Meaning | UI |
| --- | --- | --- |
| `verified` | A person confirmed every value | Header: **Verified** chip (success); banner: (hidden unless other notices) |
| `verified-auto` | The scout scraped every value and every check passed | Header: **Verified (auto)** chip (success); banner: (hidden unless other notices) |
| `draft` | At least one value could not be scraped or failed a check, so it is copied from last year with `carriedForward: true` | Header: **Draft** chip (warning); banner: "Draft tax data" lists carried-forward fields |
| (year has ended) | The tax year's end date has passed | Header: **Out of date** chip (warning); banner: "Tax year has ended" |

The scout never guesses and never overwrites a `verified` file. Invalid files are left out of the bundle and shown in an alert banner.

**Known limit:** There is no HTML source today for the retirement deduction, the living-annuity drawdown limits, the earliest RA age and the CGT inclusion rate, so scout output stays `draft` until you confirm those by hand. Edit the file, set `carriedForward: false` and the real `source` on each, then set `status` to `verified`.

### When SARS moves a page

Open the page in a browser and copy the new address into the matching key under `sars` in `scripts/tax-season/sources.json`. Run the scout for the current year and read `last-report.md`. If a field now shows as "not found", the page layout changed: fix the matching extractor in `scripts/tax-season/lib/parse-sars.mjs` and update the fixture in `scripts/tax-season/__fixtures__/`.

### Privacy

Nothing is sent anywhere. The scripts only read public [SARS](https://www.sars.gov.za) and [SARB](https://www.resbank.co.za) pages and rewrite local JSON. The only endpoint contacted is `https://custom.resbank.co.za/SarbWebApi/WebIndicators/HomePageRates` for the rates refresh (read-only).

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

## Plan Builder

- The Plan Builder (`/plan`) is a short wizard. It asks your age, income (gross or take-home, per month or per year) and a goal: retire early, pay less tax, build tax-free savings, build an emergency fund or plan for a home. It then asks only what that goal needs, up to 6 questions: how much you can put away each month (a suggested amount is used if you skip it), your risk comfort, and goal details such as retirement age and income, a TFSA target and monthly amount, emergency-fund months and savings, and existing RA or TFSA balances. You can go back, change an answer from the summary, or start again.
- The summary lists the steps in order, each with a key figure and a short reason. Take-home pay always comes first.
  - Retire early: take-home, the monthly amount needed to retire on your target income, RA tax deduction, TFSA refund, budget fit.
  - Pay less tax: take-home, RA tax deduction, putting the refund into a TFSA, budget fit.
  - Build tax-free savings: take-home, the TFSA plan (age the target is reached), budget fit.
  - Emergency fund: take-home, the emergency-fund target and how long it takes, budget fit.
  - Buy a home: take-home and what housing can cost in your budget.
- Assumptions (listed on the summary): no medical aid and no other deductions. The risk choice maps to CPI plus 2, 5 or 7 percentage points and can be changed in the calculators. The retirement return is the lower of that and CPI plus 3. Essentials are taken as 50% of take-home pay. The TFSA balance you enter is treated as contributions already made. Planning horizons depend on the goal.
- Open in X: each step opens a calculator with the figures filled in. Retire at 55, RA, Budget and Journey receive them through `PlanContextStore` handoffs, with a "From Plan" chip and Undo. Pay has no chip because Pay owns the inputs, so "Open in Pay" sets the Salary inputs directly.
- Buy a home shows the housing share of your budget and has no "Open in" button. A note points to the Toolbox, which has a home-loan calculator (`/toolbox/home-loan`); the Plan Builder does not send figures to it.
- Answers live in memory only. The dashboard Plan tile shows where you are (start, continue or view your plan) and contains no money figures. Estimates only; nothing is persisted.

## Toolbox

- The Toolbox (`/toolbox`) lists four calculators, each its own lazy route: Emergency fund (`/toolbox/emergency-fund`), Home loan (`/toolbox/home-loan`), Two-pot withdrawal (`/toolbox/two-pot-withdrawal`) and TFSA vs taxable account (`/toolbox/tfsa-vs-taxable`). The rail keeps Toolbox lit on all of them. Each starts from an example until you change something; Reset returns to it. Nothing is saved.
- Engine modules in `core/engine` (pure TypeScript, tax numbers read from the tax-year file): `emergency-fund.ts`, `home-loan.ts`, `two-pot.ts`, `investment-tax.ts` (interest exemption, dividends tax, capital gains tax) and `tfsa-vs-discretionary.ts`. The `core/toolbox` folder holds the inputs and their limits, one estimator per tool and `ToolboxStore`. Pages only format what the store returns.
- Inputs that exist on the Pay page (gross pay, taxable income, age, medical members, marginal rate) follow it until you edit them on a tool, and then stop following. Rate defaults come from the rates data (savings at the repo rate, bond at prime, growth at CPI plus 5 points) and are 0 without rates.
- Emergency fund: the target is monthly essentials times the months you choose. Interest is a yearly rate divided by 12 and credited monthly, and each month's saving is paid in at the end of the month. It shows the months to the goal with and without interest, progress and a balance chart. "Use my Budget needs" fills the essentials from the Budget, and Send to Budget carries the months, savings so far and monthly saving to the Budget, which shows them with a "From Emergency fund" chip and Undo. Home loan, Two-pot and TFSA have no Send to; they offer plain links to Pay, Budget, RA and Journey.
- Home loan: the bond rate is a nominal yearly rate divided by 12 (the way banks quote it), and defaults to prime. "What can I afford" gives the largest bond that fits; "Repayment for a price" gives the instalment for a price and deposit. The 30% rule of thumb caps debt repayments at 30% of gross pay; rates, levies and insurance are shown in the monthly cost but not counted against it. It is a rule of thumb, not a bank guarantee, and banks run their own checks.
- Two-pot withdrawal: SARS adds a savings-pot withdrawal to taxable income and taxes it at the marginal rate, not with the retirement lump-sum tables ([SARS](https://www.sars.gov.za/media-release/tax-implications-of-withdrawing-from-two-pot-retirement-system/)). The minimum is R2 000 (read from the tax-year file; below it the page shows only a message), one withdrawal a tax year, and only what the savings pot holds. The tax is the difference in tax after rebates and the medical credit with and without the withdrawal, so unused rebates absorb the first rands. It shows the brackets the money lands in, net cash, the effective rate, and the true cost in today's money (tax now plus the growth the money would have earned to retirement). Growth is a real yearly rate on top of inflation. The fund may withhold at another rate and settle on assessment, and fund fees are not modelled.
- TFSA vs taxable account: money goes in at the start of each year and the return is an effective yearly rate. In the taxable account interest (above the age-based exemption) and dividends (withholding tax) are taxed every year, while capital gains are taxed once, at the end, with the yearly exclusion and inclusion rate. The split of the return into interest, dividends and growth is an illustration. A flat marginal rate is used. Money over the yearly or lifetime TFSA limit is invested in a taxable account in the TFSA column, so both columns invest the same cash; the 40% over-contribution penalty is not modelled here (the Journey shows it). Dividends are assumed local.
- Rate conventions: the Emergency fund and Home loan use a nominal yearly rate compounded monthly (rate / 12). The two-pot growth and the TFSA comparison use effective yearly rates, like the RA and Journey.
- Simplifications: all four are estimates on this year's tax tables with no fees. See the notes on each page.

## PDF export

- Where: a **Download PDF** button sits under the headline result on Pay, RA, Retire at 55, Budget and Journey, in the action row of the Plan summary, and under the headline result on the four Toolbox tools. The Toolbox landing page has no results, so it has no button.
- What a PDF holds (A4, light colours whatever the theme): the app name and report title, a subtitle, **Inputs** (what you entered), **Results** (key figures in en-ZA format, e.g. `R 25 141,88`), **Charts** (the charts on the page, as vector graphics), **Warnings** and **Notes**. Every page has a footer with the tax-year label, its status and the date it was checked, the SARB rates date, `Estimates only, not financial advice.`, the date generated and page numbers. Long reports run over several pages. The file is named like `randwise-pay-2026-10-23.pdf`.
- Left out: year-by-year tables (too wide for A4 portrait) and the Budget dot matrix (it repeats the bar). Text uses the built-in Helvetica font, so characters outside Windows-1252 are dropped and arrows are written as "to".
- Privacy and size: the PDF is built in your browser and saved as a local download. Nothing is sent anywhere or stored. `jspdf` and `svg2pdf.js` are the only runtime dependencies besides Angular, pinned to exact versions. They load with `await import()` on the first click, in separate lazy chunks that are never part of the initial bundle. If they fail to load (offline, say), the button shows an inline error and works again on the next click.
- The PDF layer only formats. Each page builds a plain `ReportModel` with a pure function from its own `inputs()` and `result()`, so no number is recomputed. Charts are found by `data-pdf-chart` on the chart element, serialised from a print-styled copy of the on-page svg, and drawn by svg2pdf. A chart that is missing or fails to draw is skipped and the rest of the PDF still downloads.
- Add PDF export to a new page: write a pure `build…Report(inputs, result)` returning a `ReportModel` (use `rand`, `percent`, `text` from `core/pdf/report-model`), add `protected readonly report = computed(...)` that returns `null` when there is no result, put `<rw-download-pdf [report]="report()" />` in the result area, and add `data-pdf-chart="<id>"` to each chart you list in `charts`.
- Tests fake the libraries through the `PDF_LIBS` token (`testing/fake-pdf.ts`), so no real PDF is made in specs and no bytes are asserted. Real layout is checked by eye: run `npm start`, open each page, click **Download PDF** and look at the file.

## Styling rules

- Atomic design: atoms, molecules, organisms, then page blocks.
- BEM names with an `rw-` prefix (`rw-card__title--muted`).
- Low specificity: one class per rule, no ids, no `!important`. Prefer a new modifier over a stronger selector.
- Design tokens are CSS custom properties in `_tokens.scss`. Dark overrides use the single `[data-theme='dark']` selector on `<html>`.
- Shared mixins (glass surface, focus ring, pill button, visually hidden, breakpoints, reduced motion) live in `_mixins.scss`.
- Shared UI uses `ViewEncapsulation.None` with styles in the global partials. Route-only styles sit next to their component.

## Accessibility

**Landmarks and keyboard support:** Skip-to-content link, header, navigation (`aria-label="Primary"`), main (id `main-content` with skip-link focus), footer. Every link and button is keyboard reachable and visually indicated. `aria-current="page"` on the active nav link. `Escape` closes the data-badge panel and returns focus.

**Text alternatives:** Every chart (`rw-line-chart`, `rw-breakdown-bar`, `rw-ring-gauge`, `rw-dot-matrix`) is an `<svg role="img" aria-label="...">` with a visually hidden data table sibling. Tables scroll in focusable `role="region" tabindex="0"` wrappers with `aria-label`.

**Live regions:** Every calculator page has a polite live region that announces the result when inputs change (throttled to reduce announcement bursts). Route changes announce the page heading.

**Reduced motion:** When `prefers-reduced-motion: reduce` is set, all CSS animations and transitions (600ms chart fade/grow, button hover, chevron rotate, stagger, spinner) are disabled. The Money count-up (JavaScript animation) switches off and shows the final value instantly. Animations never convey information on their own.

**Contrast:** Measured with `scripts/a11y/contrast.mjs` in both light and dark themes. All text and interactive elements meet WCAG 2.x AA (text 4.5:1, non-text parts 3:1). The unfilled slider/progress track (1.46–1.86:1) carries no information on its own (the value is also text). No focusable control sits on a dark-themed card, and no chart sits there either (both guarded by specs). Exemptions documented in `src/styles/_tokens.scss`.

**Guard specs:** Run as part of `npm run test:scripts` (included in `npm test`):
- `scripts/a11y/__tests__/contrast.spec.mjs`: every colour pair against solid and gradient backgrounds meets the ratio.
- `scripts/a11y/__tests__/motion-guard.spec.mjs`: every CSS animation/transition is inside `@include mixins.motion-safe` or `@include mixins.reduced-motion` blocks, never written inline.
- `src/app/app.a11y.spec.ts`: one h1 and it matches the route heading; every input/select/textarea has a label; every chart has an aria-label or data table; no tabindex > 0; no heading level skips; links and buttons have accessible names.

**Responsive:** The navigation bar fixes to the bottom on phones (under 640px) with scrollable items. Tables scroll in focusable regions with a sticky year/label column. Charts and form fields wrap and scale on small screens.

## Optional: Kiro review hook for a new tax-year file

This is an example of how to use Kiro Agent Hooks to review tax files. No hook file is committed to the repository, because the hook schema differs between Kiro versions (0.x uses `*.kiro.hook`, 1.x uses `.kiro/hooks/*.json`). To use it, check your Kiro version and create the hook in the Agent Hooks panel of your workspace, or paste the JSON into `.kiro/hooks/` using your version's schema.

The hook triggers when a new tax file is created under `src/assets/data/tax-years/`, asking the agent to cross-check it against that year's official SARS tax tables and Budget Review figures.

**Example hook definition (JSON):**

```json
{
  "event": "fileCreated",
  "patterns": ["src/assets/data/tax-years/*.json"],
  "action": "ask"
}
```

**Prompt for the agent:**

```
Your task: review a newly created tax-year file and cross-check it against official SARS tax tables and Budget Review figures.

1. Parse the tax-year JSON and read its `sources` field to find the official reference pages.
2. For each value in the file, compare it with its cited source page.
3. Only change a value when the official page shows a different number and you cite it in the `source` field.
4. When every field is confirmed and all values match their sources, set `status` to "verified" and `carriedForward` to false. Set `verifiedOn` to today (YYYY-MM-DD).
5. If some values could not be confirmed (field missing on the page, page layout changed, source is a PDF you cannot parse), leave the file as `draft` and list what is unconfirmed.
6. Never edit any file under `src/app/core/engine/**` or change the bundled-data.ts registrations.
7. When done, run `npm test` and report the result.
8. If the tests pass, the file is ready to commit. If any test fails, list the failures and suggest next steps.

Note: the tax-season scout writes draft files on `npm start` from 20 February onwards if the file is missing or draft, at most once a day. Each draft triggers this hook, so you may review the same year multiple times as it is improved.
```

**Installation:**
1. Open your Kiro workspace settings and find the Agent Hooks panel.
2. Click **Add hook** and paste the JSON definition above (or use your Kiro version's format).
3. Set the prompt text above (Kiro 1.x wraps it in an "ask" action).
4. Save and the hook will fire on the next `npm start` or `npm run tax:scout`.

Alternatively, place a hook file directly in `.kiro/hooks/` using your Kiro version's schema. This method requires manual file management and is less reliable than the panel.
