// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'rw',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: ['element', 'attribute'],
          prefix: 'rw',
          style: 'kebab-case',
        },
      ],
    },
  },
  {
    // jspdf and svg2pdf.js are large. Only pdf-libs.ts may import them (with `await import`), so
    // they stay in a lazy chunk and never reach the initial bundle.
    files: ['src/**/*.ts'],
    ignores: ['src/app/core/pdf/pdf-libs.ts', '**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['jspdf', 'jspdf/*', 'svg2pdf.js'],
              message:
                'Load the PDF libraries only through core/pdf/pdf-libs.ts so they stay in a lazy chunk.',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  {
    // The tax engine must stay pure TypeScript so it can be unit-tested and reused without Angular.
    files: ['src/app/core/engine/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@angular/*', 'rxjs', 'rxjs/*'],
              message: 'core/engine is pure TypeScript: no Angular or RxJS imports.',
            },
          ],
        },
      ],
    },
  },
  {
    // Plan composition is pure so it can be unit-tested without Angular. The store that wraps it
    // (plan-builder.store.ts) is not listed here.
    files: [
      'src/app/core/plan/plan-answers.ts',
      'src/app/core/plan/plan-builder.ts',
      'src/app/core/plan/plan-steps.ts',
    ],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@angular/*', 'rxjs', 'rxjs/*'],
              message: 'plan composition is pure TypeScript: no Angular or RxJS imports.',
            },
          ],
        },
      ],
    },
  },
  {
    // The tax-season scripts load these modules in plain Node (scripts/tax-season/lib/register-ts.mjs).
    files: [
      'src/app/core/data/tax-calendar.ts',
      'src/app/core/data/tax-year.schema.ts',
      'src/app/core/data/tax-year.validator.ts',
      'src/app/core/data/rates.schema.ts',
      'src/app/core/data/rates.validator.ts',
      'src/app/core/data/validation.ts',
      'src/app/core/data/bracket-checks.ts',
    ],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@angular/*', 'rxjs', 'rxjs/*'],
              message:
                'these data modules are loaded by the tax-season scripts: no Angular or RxJS imports.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
