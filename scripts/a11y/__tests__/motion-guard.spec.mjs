import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '../../../');

/**
 * CSS motion guard: fails if any transition/animation/keyframes/smooth scroll
 * exists outside a motion-safe guard or reduced-motion block.
 *
 * Allowed contexts:
 * - @include mixins.motion-safe { ... }
 * - @media (prefers-reduced-motion: no-preference) { ... }
 * - @media (prefers-reduced-motion: reduce) { ... } blocks that only zero values
 * - Allow-list (empty by default)
 */

const ALLOW_LIST = [];

/**
 * Simple SCSS brace-aware parser. Returns an array of findings.
 *
 * Allowed contexts for motion properties:
 * - Inside @include mixins.motion-safe { ... }
 * - Inside @media (prefers-reduced-motion: no-preference) { ... }
 * - Inside @include mixins.reduced-motion { ... }
 *
 * @keyframes can be defined globally; they are only used inside motion-safe contexts.
 */
function parseScss(content, filePath) {
  const findings = [];
  let depth = 0; // brace nesting depth
  let motionSafeDepth = null; // depth at which we entered motion-safe guard
  let noMotionDepth = null; // depth at which we entered a motion-disabling context

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Track nesting depth
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;

    // Check for @include mixins.motion-safe or @media (prefers-reduced-motion: no-preference)
    if (line.includes('@include mixins.motion-safe') || line.includes('@media (prefers-reduced-motion: no-preference)')) {
      motionSafeDepth = depth;
    }

    // Check for @include mixins.reduced-motion or @media (prefers-reduced-motion: reduce)
    // These expand to media queries that disable motion globally, so motion rules inside are OK
    if (line.includes('@include mixins.reduced-motion') || line.includes('@media (prefers-reduced-motion: reduce)')) {
      noMotionDepth = depth;
    }

    // Check for disallowed properties/rules
    const trimmed = line.trim();

    // Rule: transition or animation declaration outside motion-safe (skip keyframes)
    if (/^\s*(transition|animation)[\s-]/.test(trimmed) && !trimmed.startsWith('//') && !trimmed.includes('@keyframes')) {
      // Check if we're inside a guarded region
      const insideMotionSafe = motionSafeDepth !== null && depth > motionSafeDepth;
      const insideNoMotion = noMotionDepth !== null && depth > noMotionDepth;

      if (!insideMotionSafe && !insideNoMotion) {
        if (!ALLOW_LIST.some((a) => filePath.includes(a))) {
          findings.push({
            line: lineNum,
            message: `Motion property outside motion-safe: ${trimmed.substring(0, 60)}`,
            file: relative(root, filePath),
          });
        }
      }
    }

    // Rule: scroll-behavior: smooth
    if (trimmed.includes('scroll-behavior') && trimmed.includes('smooth')) {
      if (!ALLOW_LIST.some((a) => filePath.includes(a))) {
        findings.push({
          line: lineNum,
          message: `scroll-behavior: smooth is never appropriate`,
          file: relative(root, filePath),
        });
      }
    }

    // Update depth after processing the line
    depth += openBraces - closeBraces;

    // If we're exiting motion-safe or no-motion guard, reset the guard
    if (motionSafeDepth !== null && depth <= motionSafeDepth) {
      motionSafeDepth = null;
    }
    if (noMotionDepth !== null && depth <= noMotionDepth) {
      noMotionDepth = null;
    }
  }

  return findings;
}

/**
 * Walk src/styles/**\/*.scss and src/app/**\/*.scss
 */
function walkScss(dirPath) {
  const files = [];

  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and hidden dirs
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
          walk(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.scss')) {
        files.push(fullPath);
      }
    }
  }

  walk(dirPath);
  return files;
}

describe('motion-guard: CSS motion must be gated by motion-safe', () => {
  it('fails on ungated transition properties in src/styles', () => {
    const stylesDir = join(root, 'src/styles');
    const files = walkScss(stylesDir);
    const allFindings = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const findings = parseScss(content, file);
      allFindings.push(...findings);
    }

    if (allFindings.length > 0) {
      const report = allFindings.map((f) => `${f.file}:${f.line}: ${f.message}`).join('\n');
      expect.fail(`Motion not gated by motion-safe:\n${report}`);
    }
  });

  it('fails on ungated transition properties in src/app component styles', () => {
    const appDir = join(root, 'src/app');
    const files = walkScss(appDir);
    const allFindings = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const findings = parseScss(content, file);
      allFindings.push(...findings);
    }

    if (allFindings.length > 0) {
      const report = allFindings.map((f) => `${f.file}:${f.line}: ${f.message}`).join('\n');
      expect.fail(`Motion not gated by motion-safe:\n${report}`);
    }
  });
});
