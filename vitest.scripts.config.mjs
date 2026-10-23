import { defineConfig } from 'vitest/config';

// Tests for scripts/tax-season. They run in plain Node (the app's specs run through
// `ng test`, which bundles for the browser and cannot load node:fs or cheerio).
export default defineConfig({
  test: {
    include: ['scripts/**/*.spec.mjs'],
    environment: 'node',
  },
});
