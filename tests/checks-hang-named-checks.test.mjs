/* checks-hang-named — a hang in the checks suite is named, not cancelled.
 *   ① a test that never ends is NAMED as a failure by the checks runner, instead of holding its shard until the
 *     job's timeout cancels it without a name (PR #1143 Regression 3/3 and PR #1145 Regression 1/3, 2026-11-15). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { testTimeoutMs } from '../scripts/test-checks.mjs';
import { readLedger } from '../scripts/checks-shards.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('checks-hang-named ① the ceiling follows the ledger: 3 × its slowest file, none without a ledger', () => {
  assert.equal(testTimeoutMs({ a: 10, b: 120.5 }), 361500);
  assert.equal(testTimeoutMs({}), null);
  const ms = testTimeoutMs(readLedger().seconds);
  assert.ok(ms > 0, 'the shipped ledger yields no ceiling — a hang would again cancel its shard unnamed');
  assert.ok(ms < 60 * 60 * 1000, `the ceiling ${ms} ms is not inside the 60-minute Regression job — the hang would still be cancelled unnamed`);
});

test('checks-hang-named ① a hanging test is reported by name through the shipped runner', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'im-hang-'));
  try {
    fs.writeFileSync(path.join(dir, 'hang.test.mjs'),
      "import test from 'node:test';\ntest('never-ends', () => new Promise(() => { setInterval(() => {}, 1000); }));\n");
    const env = Object.assign({}, process.env, { IM_CHECKS_GLOB: path.join(dir, '*.test.mjs') });
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/test-checks.mjs'), '--test-timeout=1500'],
      { cwd: ROOT, encoding: 'utf8', env, timeout: 60000 });
    const out = (r.stdout || '') + (r.stderr || '');
    assert.notEqual(r.status, 0, 'the run of a hanging test passed');
    assert.match(out, /never-ends/, 'the failure does not name the test that hung');
    const m = /never-ends \((\d+(?:\.\d+)?)ms\)/.exec(out);
    assert.ok(m && Number(m[1]) < 30000, 'the hang was not ended by the per-test timeout (' + (m && m[1]) + ' ms)');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
