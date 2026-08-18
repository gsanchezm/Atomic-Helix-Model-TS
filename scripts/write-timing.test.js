import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeTiming } from './write-timing.js';

test('writeTiming writes the expected shape and filename', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ahm-timing-'));
  try {
    const file = await writeTiming({
      reportsDir: dir,
      runId: 'run-1',
      tool: 'playwright',
      category: 'web_ui',
      subtype: 'desktop',
      startedAt: '2026-07-20T10:00:00.000Z',
      endedAt: '2026-07-20T10:04:03.000Z',
    });
    assert.equal(file, path.join(dir, 'run-1', 'timing', 'playwright-desktop.json'));
    const written = JSON.parse(await readFile(file, 'utf8'));
    assert.deepEqual(written, {
      tool: 'playwright',
      category: 'web_ui',
      subtype: 'desktop',
      startedAt: '2026-07-20T10:00:00.000Z',
      endedAt: '2026-07-20T10:04:03.000Z',
      durationMs: 243000,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
