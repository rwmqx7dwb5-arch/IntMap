/* ============================================================================
 *  R799 — `stats().unowned` counts LIVE registrations, and the satellite legend timer has an owner
 * ----------------------------------------------------------------------------
 *  Production verification of #R796 measured `unowned` rising by one on every satellite toggle and
 *  never coming down: it was a counter of registrations ever made, not of the ones alive now.
 *  A number that only rises cannot be driven to zero, which is the only thing it exists for.
 *  The one registration doing the rising was js/data-layers.js's legend timer, made with no owner.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

test('unowned is the number of live unowned registrations — it falls when they are cleared', async () => {
  const { makeRuntime } = await import('../js/runtime.js');
  const RT = makeRuntime({});
  const n0 = RT.stats().unowned;
  RT.every('anon:a', 1000, () => { });
  RT.frame('anon:b', () => { });
  RT.onCamera('anon:c', () => { });
  assert.equal(RT.stats().unowned, n0 + 3, 'three live unowned registrations');
  RT.clearEvery('anon:a'); RT.offCamera('anon:c');
  assert.equal(RT.stats().unowned, n0 + 1, 'clearing them brings the number down — it is not cumulative');
  assert.ok(RT.stats().unownedEver >= n0 + 3, 'the cumulative count is still available under its own name');
  /* an owned registration never counts, and toggling it fifty times leaves the number where it was */
  RT.define('cap.x', { activate: (a, v, S) => { S.every('t', 1000, () => { }); return true; } });
  const n1 = RT.stats().unowned;
  for (let i = 0; i < 50; i++) { await RT.activate('cap.x'); RT.suspend('cap.x'); }
  assert.equal(RT.stats().unowned, n1);
  RT.dispose('cap.x'); RT.clearEvery('anon:a');
});

test('the satellite legend timer names its owner', () => {
  const src = readFileSync(join(ROOT, 'js', 'data-layers.js'), 'utf8');
  const m = /everyTick\('data-layers:sat-legend',\s*\d+,\s*[A-Za-z_$][\w$]*\s*,\s*\{[^}]*capability\s*:\s*'sat\.live'/.exec(src);
  assert.ok(m, "the legend timer is registered with { capability: 'sat.live' } — suspended with the layer, swept with it");
});
