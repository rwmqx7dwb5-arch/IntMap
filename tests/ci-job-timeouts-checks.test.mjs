/* Every job in every workflow declares timeout-minutes.
 * MEASURED 2026-10-13: a regression shard hung and ran to GitHub's 360-minute ceiling — no job declared one.
 * docs/TESTING.md, «Every job has a timeout». */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows');

test('every job of every workflow declares timeout-minutes below GitHub’s own 360', () => {
  const files = fs.readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.length > 5, 'the workflows were found');
  const missing = [];
  for (const f of files) {
    const w = yaml.load(fs.readFileSync(join(DIR, f), 'utf8'));
    for (const [id, job] of Object.entries(w.jobs || {})) {
      if (job.uses) continue;   /* a reusable workflow call carries its jobs' limits in the called file */
      const m = job['timeout-minutes'];
      if (!(Number.isFinite(m) && m > 0 && m < 360)) missing.push(`${f}:${id} (${m})`);
    }
  }
  assert.deepEqual(missing, []);
});
