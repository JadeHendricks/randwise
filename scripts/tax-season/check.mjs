// Runs before `npm start` (prestart). Refreshes rates.json when it is over 7 days old and, from
// 20 February, scouts next year's tax-year file. It must never stop the dev server from starting,
// so every problem becomes a warning and the exit code is always 0.
// The TypeScript hook must be registered before anything that imports the app's data modules,
// so everything else is loaded with dynamic import() below.
import './lib/register-ts.mjs';

try {
  const { main } = await import('./lib/check-main.mjs');
  await main();
} catch (error) {
  console.warn(`[tax-season] skipped: ${error instanceof Error ? error.message : error}`);
}
process.exitCode = 0;
