/* ============================================================================
 *  IntMap · the shipped era set is still the whole upstream set
 * ----------------------------------------------------------------------------
 *  The upstream comparison is a function with an injectable listing, evaluated here; the live
 *  network half runs in the nightly.
 *
 *  Each block below was one round-numbered file until the tests were regrouped by subject. A block
 *  keeps that file's helpers private to it (a `{ … }` scope), so two rounds' `docFacts()` or
 *  `scenario()` cannot shadow each other; the helpers every block shared — ROOT, rd/read and the
 *  line-ending-tolerant anchor — are declared once above. Titles keep their round tag so a failure
 *  still names the round whose record explains it.
 *
 *  Was: tests/r707
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { astroYear, upstreamGap } from '../scripts/build-hist-eras.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const read = rd;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R707 — was tests/r707-chronos-upstream-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  IntMap · #R707 — the shipped era set is still the WHOLE upstream set
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ WHAT THIS GUARDS IS A BLIND SPOT, NOT A NUMBER. scripts/build-hist-eras.mjs discovers the
 *  upstream directory rather than listing it by hand, and `--check` deliberately tests properties
 *  so that upstream GROWING never turns the offline gate red. Both are right, and together they
 *  meant that when upstream added `world_1878.geojson` after #R679 read the listing, the bundle
 *  stayed at 53 of 54 with every gate green — for as long as nobody happened to run `--fetch`.
 *  MEASURED #R707: shipped 53, upstream 54.
 *
 *  So the comparison is a function with an INJECTABLE listing, and this file evaluates that
 *  function (#R505 — reading the source would not tell you which way the verdict falls). The live
 *  network half runs in the nightly, not here: a test that asks GitHub would fail on a flaky
 *  runner and say «upstream published something» when it meant «the network was down».
 * ==========================================================================*/

/** the committed bundle's own snapshot keys — read, never typed. */
function shippedKeys() {
  const w = {};
  new Function('window', readFileSync(join(ROOT, 'data', 'hist-eras.js'), 'utf8'))(w);
  return (w.__HISTERAS.snaps || []).map((s) => s.key);
}
const fileFor = (k) => 'world_' + k + '.geojson';

test('#R707 ① the committed bundle carries every snapshot in a listing built from itself', async () => {
  const keys = shippedKeys();
  assert.ok(keys.length > 0, 'data/hist-eras.js ships no snapshots at all');
  const g = await upstreamGap({ shipped: keys, listing: keys.map(fileFor).concat(['README.md', 'places.geojson']) });
  assert.deepEqual(g.missing, [], 'a listing made of the bundle\u2019s own keys reported gaps');
  assert.deepEqual(g.extra, [], 'a listing made of the bundle\u2019s own keys reported extras');
  assert.equal(g.upstream, keys.length, 'non-world_* files leaked into the upstream count');
});

test('#R707 ② a snapshot upstream has and the bundle lacks is reported as MISSING — the #R707 defect itself', async () => {
  const keys = shippedKeys();
  assert.ok(keys.includes('1878'), 'the bundle no longer carries world_1878 — #R707 added it');
  const without = keys.filter((k) => k !== '1878');
  const g = await upstreamGap({ shipped: without, listing: keys.map(fileFor) });
  assert.deepEqual(g.missing, ['1878'], 'removing a sheet from the shipped set did not report it missing');
  assert.equal(g.extra.length, 0);
});

test('#R707 ③ missing snapshots come back in clock order, oldest first', async () => {
  const keys = shippedKeys();
  const drop = ['1878', 'bc10000', '1500'].filter((k) => keys.includes(k));
  assert.equal(drop.length, 3, 'the bundle no longer carries the three keys this case drops');
  const g = await upstreamGap({ shipped: keys.filter((k) => !drop.includes(k)), listing: keys.map(fileFor) });
  const years = g.missing.map(astroYear);
  assert.deepEqual(years, years.slice().sort((a, b) => a - b), 'missing sheets were not ordered by year');
  assert.equal(g.missing.length, 3);
});

test('#R707 ④ a sheet upstream WITHDREW is reported separately, never as missing', async () => {
  const keys = shippedKeys();
  const g = await upstreamGap({ shipped: keys, listing: keys.filter((k) => k !== '1878').map(fileFor) });
  assert.deepEqual(g.missing, [], 'a withdrawn sheet was counted as a gap in our coverage');
  assert.deepEqual(g.extra, ['1878'], 'a withdrawn sheet was not reported at all');
});

test('#R707 ⑤ a listing that answers but matches nothing is a change of shape, not an empty directory', async () => {
  const keys = shippedKeys();
  const g = await upstreamGap({ shipped: keys, listing: ['README.md', 'LICENSE', 'geojson/world_1500.geojson'] });
  assert.equal(g.shapeChanged, true, 'a listing with no world_*.geojson at the top level was not flagged');
  assert.equal(g.upstream, 0);
});

test('#R707 ⑥ an empty listing is NOT a change of shape — it is an answer with nothing in it', async () => {
  const g = await upstreamGap({ shipped: shippedKeys(), listing: [] });
  assert.equal(g.shapeChanged, false);
});
}
