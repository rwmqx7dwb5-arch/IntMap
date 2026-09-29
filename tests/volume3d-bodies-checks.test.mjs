/* ============================================================================
 *  IntMap · the 3-D volume tool keeps a store of bodies (js/volume3d.js, js/tool-panel.js)
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r183-checks (volume).
 * ==========================================================================*/
// (#R183) THE THINGS THAT WERE SILENTLY WRONG, PINNED SO THEY CANNOT GO WRONG SILENTLY AGAIN.
//
// Three defects this round fixed had the same shape: something failed, nothing said so, and the
// UI kept rendering a plausible-looking value. A test that only asserts "the happy path works"
// would have passed on every one of them. So these tests aim at the FAILURE modes:
//   · a weather fetch that returns HTTP 429 with a valid JSON error body
//   · a sunrise calculation that answers for the wrong DAY
//   · a search result whose bounding box is a synthetic stub, or spans the globe
//   · a counter that started counting parts instead of aircraft
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

/* ── js/volume3d.js — more than one body ──────────────────────────────────────────────────────── */
const V3D = read('js/volume3d.js');
const TP = read('js/tool-panel.js');

test('R183: the volume tool keeps a STORE of bodies, each with its own layers', () => {
  /* ⚠ READ, NOT RUN: the store lives in the volume factory, which paints solids through the renderer on every commit. */
  // The old limitation was not a rendering one — the engine's solid contract is already keyed by
  // layer id — it was that `ring`/`baseM`/`topM` were single variables, so a second body could only
  // destroy the first. Per-object layer ids are what make several bodies drawable at once.
  assert.match(V3D, /let saved=\[\]/, 'a store of saved bodies');
  assert.match(V3D, /const SS=id=>|SL=id=>|SB=id=>/, 'layer ids are derived per object, not constant');
  for (const fn of ['commit', 'selectObj', 'setObjVisible', 'removeObj', 'updateObj', 'pickAt']) {
    assert.ok(V3D.includes('function ' + fn + '('), `${fn} exists`);
  }
  assert.match(V3D, /totalVolumeM3/, 'the running total is part of the contract, not the panel');
});

test('R183: committing keeps the settings and clears only the footprint', () => {
  /* ⚠ READ, NOT RUN: commit() calls paintSaved()/hide(), both renderer calls; what it resets is asked of its body. */
  // Re-entering the altitudes and colour for every body in a series is the friction this feature
  // exists to remove — the same reasoning as #R18 keeping the line-of-sight numbers across sites.
  const body = V3D.slice(V3D.indexOf('function commit('), V3D.indexOf('function find('));
  assert.match(body, /ring=\[\]/, 'the footprint is cleared');
  assert.doesNotMatch(body, /\bbaseM=/, 'the altitude band is NOT reset');
  assert.doesNotMatch(body, /\bcolor=/, 'the colour is NOT reset');
});

test('R183: a hidden body does not swallow a click meant for the one underneath', () => {
  /* EVALUATED: `pickAt` and the `pointInRing` it uses are lifted out of the comment-stripped
     js/volume3d.js and asked about a store of three stacked squares. */
  const s = codeOnly(V3D);
  const pickWith = (saved) => new Function('saved', liftFunction(s, 'pointInRing') + '\n' + liftFunction(s, 'pickAt') + '\nreturn pickAt;')(saved);
  const sq = (x0, y0, d) => [[x0, y0], [x0 + d, y0], [x0 + d, y0 + d], [x0, y0 + d]];
  const store = [
    { id: 'v1', ring: sq(0, 0, 10), visible: true },
    { id: 'v2', ring: sq(2, 2, 6), visible: true },
    { id: 'v3', ring: sq(4, 4, 2), visible: false },
  ];
  const pickAt = pickWith(store);
  assert.equal(pickAt(3, 3), 'v2', 'newest first — the one drawn last is on top');
  assert.equal(pickAt(5, 5), 'v2', 'hidden bodies are skipped — the click reaches the one underneath');
  assert.equal(pickAt(1, 1), 'v1');
  assert.equal(pickAt(20, 20), null, 'a click on empty map picks nothing');
  store[2].visible = true;
  assert.equal(pickAt(5, 5), 'v3', 'and a body that is shown again is on top again');
});
test('R183: each saved body reads the ground under ITS OWN centroid', () => {
  /* ⚠ READ, NOT RUN: objGround reads the renderer's 3-D terrain at the centroid. */
  // With 3-D terrain on, the renderer's metres are above the GROUND. Two bodies can sit on opposite
  // sides of a mountain, so one shared offset would put one of them at the wrong altitude — which is
  // exactly the defect this whole tool exists to prevent (see the file header).
  assert.match(V3D, /function objGround\(o\)/);
  assert.match(V3D, /o\.ground=objGround\(o\)/);
});

test('R183: editing a saved body refreshes text in place, never rebuilding the field being typed in', () => {
  /* ⚠ READ, NOT RUN: the list is DOM inside js/tool-panel.js, re-rendered on keystrokes. */
  // #R171's defect: the panel re-renders on every keystroke, and rebuilding the inputs throws the
  // caret out of the one under the cursor.
  const list = TP.slice(TP.indexOf('const v3dList='), TP.indexOf('sync();', TP.indexOf('const v3dList=')));
  assert.match(list, /const retext=/, 'a text-only refresh exists');
  const applyO = list.slice(list.indexOf('const applyO='), list.indexOf('const applyO=') + 200);
  assert.ok(applyO.includes('retext()'), 'typing refreshes text only');
  assert.ok(!applyO.includes('v3dList()'), 'typing must NOT rebuild the field under the cursor');
});

