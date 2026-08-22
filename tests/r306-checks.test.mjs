/* ============================================================================
 *  IntMap · #R306 — source-level checks
 * ----------------------------------------------------------------------------
 *  「警報レイヤー、何も発令されていないのに、灰色に塗られていない場所がある。」 — third pass.
 *
 *  MEASURED on production, z2, 3,400 land samples, after each of the two previous passes:
 *      after #R305          275 painted by nothing (8.09 %)   CAN 140 · RUS 83 · SAU 15 · DZA 13 · KAZ 13
 *      after #R305 追記     285 (8.38 %)                       CAN 146 · RUS 83 · SAU 23 · DZA 13 · KAZ  9
 *  Russia did not move, because the 追記 asked 「is this warning one of our own units?」 by OUTLINE,
 *  which can only fire where the warnings and the units come from the SAME index. Russia's do not:
 *  the tap card names the warned area 「Murmansk Region」 and the quiet units 「Kaliningrad」 — two
 *  separately published boundary sets.
 *
 *  THE CAUSE: `centroidOf` is the average vertex of the largest ring. It is cheap and it is NOT a
 *  point of the polygon — for anything concave, C-shaped or spread over islands it lands outside its
 *  own outline, very often inside a NEIGHBOUR. Both containment questions this file asks were asked
 *  with it, so both were answered about the wrong shape, and the answer is used to throw a quiet
 *  unit's grey away.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
/* ⚠ comments are stripped first — this file's own notes quote the spellings it replaced */
const noComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const WP = () => noComments(read('js/world-packs.js'));

/* ── ① a point that is really in the shape ───────────────────────────────────────────────────*/
test('R306 ① the containment tests ask with a point that is inside its own polygon', () => {
  const s = WP();
  assert.match(s, /function _ringInsidePoint\(ring\)\{/, 'the scan line exists');
  /* the middle of the ring's own latitude range, and the widest interior span across it */
  assert.match(s, /const y=\(s\+n\)\/2, xs=\[\];/, 'the line is the middle of the ring, not of the world');
  assert.match(s, /if\(\(a\[1\]>y\)!==\(b\[1\]>y\)\) xs\.push\(a\[0\]\+\(y-a\[1\]\)\*\(b\[0\]-a\[0\]\)\/\(b\[1\]-a\[1\]\)\);/,
    'every edge that crosses it contributes its crossing');
  assert.match(s, /for\(let i=0;i\+1<xs\.length;i\+=2\)\{ const d=xs\[i\+1\]-xs\[i\]; if\(d>w\)\{ w=d; x=\(xs\[i\]\+xs\[i\+1\]\)\/2; \} \}/,
    'and the answer is the midpoint of the widest INTERIOR span (pairs, not any two crossings)');
  /* ⚠ the line can cross a hole — the geometry has the last word */
  assert.match(s, /if\(pt&&!inGeom\(pt,g\)\) pt=null;/,
    'a point the geometry does not accept is thrown away');
  assert.match(s, /return _stash\(g,'__ip',pt\|\|geomCentre\(g\)\);/,
    '…and the old centroid is the fallback, never the first answer');
});

/* ── ② …and BOTH containment questions use it ────────────────────────────────────────────────*/
test('R306 ② the warning index and the unit test both moved to it', () => {
  const s = WP();
  assert.match(s, /const wc=geomInside\(f\.geometry\);/,
    'a warning is bucketed by a point that is really in the warning');
  assert.match(s, /const c=geomInside\(g\);/,
    '…and a unit is tested by a point that is really in the unit');
  /* the bucket lookup has to use the same point it was filed under */
  assert.match(s, /if\(wc\)\{ const k=Math\.floor\(wc\[0\]\)\+':'\+Math\.floor\(wc\[1\]\); \(rec\.pts\[k\]\|\|\(rec\.pts\[k\]=\[\]\)\)\.push\(\{c:wc,g:f\.geometry\}\); \}/,
    'the cell key is derived from that same point');
});

/* ── ③ the old centroid keeps the jobs it is right for ───────────────────────────────────────
   ⚠ NOT EVERY USE OF A CENTRE IS A CONTAINMENT TEST. `dedupeSameShape` and the tap card ask about
   IDENTITY and PROXIMITY, where the average vertex is the right cheap answer and 「is it inside」 is
   not the question. Replacing those too would have been a change nobody asked for. */
test('R306 ③ identity and proximity still use the cheap centroid', () => {
  const s = WP();
  assert.match(s, /function centroidOf\(g\)\{/, 'the average-vertex centroid still exists');
  assert.match(s, /function geomCentre\(g\)\{[\s\S]{0,200}?_stash\(g,'__ac',centroidOf\(g\)\)/,
    '…and is still what geomCentre caches');
});

/* ── ④ a window measured in CHARACTERS is measured in line endings too ───────────────────────
   `tests/r293 ⑥` pinned `/askUnitsInView[\s\S]{0,600}upgradeUnitsInView\(\);/`. That body is 604
   bytes with LF and **615 with CRLF**, so #R305 — which added two lines to it — turned the check
   red on every Windows checkout while CI stayed green. #R283 wrote this lesson for two other tests;
   this is the third. */
test('R306 ④ the view-pass check is asked of the function, not of a byte count', () => {
  const t = read('tests/r293-checks.test.mjs');
  assert.match(t, /function askUnitsInView\\\(\\\)\\\{\[\\s\\S\]\{0,1200\}\?upgradeUnitsInView/,
    'the relation is pinned to the function body');
  assert.ok(!/askUnitsInView\[\\s\\S\]\{0,600\}upgradeUnitsInView/.test(t),
    'the raw 600-character window is gone');
  /* and the thing it is about is still true of the source */
  const s = WP();
  assert.match(s, /function askUnitsInView\(\)\{[\s\S]{0,1200}?upgradeUnitsInView\(\); \}/,
    'the view pass still ends by running the upgrade');
});
