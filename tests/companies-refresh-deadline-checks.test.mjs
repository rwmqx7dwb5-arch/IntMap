/* The weekly company refresh finishes inside its job, and keeps what it fetched when it does not.
 * MEASURED 2026-10-26, 11-02, 11-09: «querying OpenStreetMap…» was the last line for 88 minutes, the job's
 * timeout cancelled it, and actions/cache saved nothing — every week began again from nothing.
 * scripts/companies/osm.mjs (the deadline note) and .github/workflows/companies-refresh.yml. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { osmFacilities } from '../scripts/companies/osm.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('past its deadline, osmFacilities asks nothing and marks every company it did not reach as pending', async () => {
  /* QIDs no stored answer can hold, so a request — if one were made — would be the only way to an answer */
  const qids = ['Q999999999901', 'Q999999999902', 'Q999999999903'];
  const lines = [];
  const t0 = Date.now();
  const out = await osmFacilities(qids, { log: (s) => lines.push(s), deadline: Date.now() - 1 });
  assert.ok(Date.now() - t0 < 5000, 'returned at once — no request was made');
  assert.deepEqual([...(out.failed || [])].sort(), [...qids].sort(), 'each un-asked company is pending, not «no sites»');
  for (const q of qids) assert.deepEqual(out.get(q), []);
  assert.ok(lines.some((s) => /deadline is reached/.test(s)), 'the run says why it stopped asking');
});

test('the workflow gives the build a deadline and saves the cache whatever the job’s outcome', () => {
  const wf = yaml.load(fs.readFileSync(join(ROOT, '.github/workflows/companies-refresh.yml'), 'utf8'));
  const steps = wf.jobs.refresh.steps;
  const build = steps.findIndex((s) => /build\.mjs/.test(s.run || ''));
  assert.ok(build >= 0);
  assert.match(steps[build].run, /--osm-deadline /);
  const minutes = Number(steps[build].env && steps[build].env.OSM_MINUTES);
  assert.ok(minutes > 0 && minutes < wf.jobs.refresh['timeout-minutes'], 'the deadline falls inside the job');
  const save = steps.findIndex((s) => /^actions\/cache\/save@/.test(s.uses || ''));
  assert.ok(save > build, 'a save step follows the build');
  assert.match(String(steps[save].if), /always\(\)/, 'the save runs when the job fails or is cancelled');
  assert.ok(!steps.some((s) => /^actions\/cache@/.test(s.uses || '')), 'no post-step cache that saves only on success');
});
