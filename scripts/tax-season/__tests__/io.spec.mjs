import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createNodeFs } from '../lib/io.mjs';

describe('createNodeFs', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'randwise-io-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes and reads text back, creating missing folders', async () => {
    const fs = createNodeFs();
    const file = join(dir, 'a', 'b', 'data.json');
    await fs.writeText(file, '{"ok":true}\n');
    expect(await fs.readText(file)).toBe('{"ok":true}\n');
  });

  it('replaces an existing file and leaves no temporary file behind', async () => {
    const fs = createNodeFs();
    const file = join(dir, 'data.json');
    await fs.writeText(file, 'first');
    await fs.writeText(file, 'second');
    expect(await fs.readText(file)).toBe('second');
    expect(readdirSync(dir)).toEqual(['data.json']);
  });

  it('lists the names in a folder', async () => {
    const fs = createNodeFs();
    await fs.writeText(join(dir, '2027.json'), '{}');
    await fs.writeText(join(dir, '2028.json'), '{}');
    expect((await fs.listDir(dir)).sort()).toEqual(['2027.json', '2028.json']);
  });

  it('gives null for a missing file and [] for a missing folder', async () => {
    const fs = createNodeFs();
    expect(await fs.readText(join(dir, 'missing.json'))).toBeNull();
    expect(await fs.listDir(join(dir, 'missing'))).toEqual([]);
  });
});
