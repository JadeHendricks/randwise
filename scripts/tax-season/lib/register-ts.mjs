// Lets plain Node import the app's pure TypeScript data modules (src/app/core/data/*.ts) without
// a build step or tsx. Entry points import this file first and load everything else with a
// dynamic import(), because static imports are all resolved before this hook is registered.
//
// Why not Node's built-in type stripping: the validators use parameter properties and mixed
// type/value imports, which stripping does not support. transpileModule handles both.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

const ts = createRequire(import.meta.url)('typescript');

const HAS_EXTENSION = /\.(?:js|mjs|cjs|ts|json)$/;

registerHooks({
  // TypeScript files import each other without an extension ('./tax-calendar'); map those to
  // the sibling .ts file. Anything else goes through Node's normal resolution.
  resolve(specifier, context, nextResolve) {
    const parent = context.parentURL;
    if (
      parent &&
      parent.endsWith('.ts') &&
      specifier.startsWith('.') &&
      !HAS_EXTENSION.test(specifier)
    ) {
      const url = new URL(`${specifier}.ts`, parent);
      if (existsSync(fileURLToPath(url))) {
        return { url: url.href, format: 'module', shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },

  load(url, context, nextLoad) {
    if (!url.endsWith('.ts')) return nextLoad(url, context);
    const source = readFileSync(fileURLToPath(url), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      fileName: fileURLToPath(url),
    });
    return { format: 'module', source: outputText, shortCircuit: true };
  },
});
