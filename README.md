# Randwise
A South African personal-finance planner (RA, TFSA, tax, budgeting). Frontend-only, runs locally, nothing is saved.
Estimates only, not financial advice.

## What it is

Randwise helps salaried South Africans explore their money in rand (ZAR). It is a frontend-only Angular app: no backend, database or API keys, and nothing is persisted. The theme follows your system setting, the toggle overrides it in memory only, and a reload starts fresh.

This first slice is the app shell and design system: a left icon rail, a bento dashboard, lazy feature routes (Pay, RA, Retire at 55, Budget, Journey, Plan, Toolbox) that show themed "coming soon" cards, and light and dark themes.

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

## Styling rules

- Atomic design: atoms, molecules, organisms, then page blocks.
- BEM names with an `rw-` prefix (`rw-card__title--muted`).
- Low specificity: one class per rule, no ids, no `!important`. Prefer a new modifier over a stronger selector.
- Design tokens are CSS custom properties in `_tokens.scss`. Dark overrides use the single `[data-theme='dark']` selector on `<html>`.
- Shared mixins (glass surface, focus ring, pill button, visually hidden, breakpoints, reduced motion) live in `_mixins.scss`.
- Shared UI uses `ViewEncapsulation.None` with styles in the global partials. Route-only styles sit next to their component.

## Accessibility

Skip-to-content link, header/nav/main/footer landmarks, `aria-current` on the active nav link, labelled inputs, visible focus rings, AA contrast in both themes, and reduced-motion support (count-up animation and transitions switch off).
