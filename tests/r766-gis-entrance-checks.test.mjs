/* ============================================================================
 *  R766 — 「データと分析」を開くボタンが、試したどの幅でも押せなかった
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ THE REACHABILITY ITSELF IS NOT MEASURED HERE. It is measured in the browser, in
 *  `tests/smoke.spec.js` (R766 ①②③), because 「a finger landing on this button reaches it」 is a
 *  question only a laid-out page can answer — `document.elementFromPoint`, per
 *  [[intmap-visible-is-not-unoccluded]]. Reading the source is exactly how this defect survived
 *  three rounds and every gate: the button was in the document, its handler was right, its OS
 *  action was registered, and its rect was 0×0 at all 18 widths measured on production R765.
 *
 *  What is here is the handful of facts a source can actually answer, kept because they are cheap
 *  and they fail LOUDLY where the browser test would fail confusingly:
 *
 *    ① a node CARRIED into a container must be rescued before that container is thrown away
 *    ② the twin-dedupe must stay COMPUTED from two declarations, never a written pairing of ids
 *    ③ every declaration must name a command that exists, or the dedupe silently stops matching
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const mapUi = read('js/map-ui.js');
const dataLayers = read('js/data-layers.js');

/* ① `#layer-tools` is a REAL node moved into the tile browser's tools section, not a copy of one.
   `buildTiles` replaces the whole `.lst-root`, so the strip has to be lifted out BEFORE that or it
   is detached — and a detached node is one `document.getElementById` can no longer find, which is
   how #btn-correlate / #edu-mount / #lyr-presets vanished for the rest of the session on a 375px
   phone while this round was being written. The rescue is worth pinning as an ORDER because the
   order is the whole of it: the same two statements the other way round lose the strip every time.
   ⚠ This reads textual order in one statement sequence, which here IS the evaluation order — it is
   not the kind of claim #R505 warns about (a source check cannot see which BRANCH runs). */
test('R766 ① the carried strip is lifted out before the root that holds it is discarded', () => {
  const discard = mapUi.indexOf("old.replaceWith(root)");
  assert.ok(discard > 0, 'buildTiles still replaces the tile root');
  const before = mapUi.slice(0, discard);
  const rescue = before.lastIndexOf("querySelector('#layer-tools')");
  assert.ok(rescue > 0,
    'the strip is looked for before the root is replaced — without this the carried node is detached');
  /* and the rescue must belong to THIS replacement, not to something far above it */
  assert.ok(discard - rescue < 600,
    'the rescue sits with the replacement it protects, not several blocks above it');
  /* it is parked somewhere invisible, never in document.body where it would be drawn on the map */
  const near = mapUi.slice(rescue, discard);
  assert.match(near, /getElementById\('layer-dropdown'\)/,
    'the rescued strip is parked in the classic dropdown (hidden), not in document.body');
});

/* ② The two surfaces over the same commands must agree by COMPUTATION. #R242→#R243 and
   #R666→#R670 each answered this instruction by naming one more id, and naming ids is what made
   the third round necessary (`.agents/rules/no-ad-hoc-hardcoding.md` §1). So the overlap is read
   off `data-os-act` (on the button) and `data-act` (on the row) at run time. */
test('R766 ② the twin-dedupe is computed from declarations, not from a written pairing of ids', () => {
  assert.match(mapUi, /querySelectorAll\('\.lst-toolrow\[data-act\]'\)/,
    'the rows are asked which command they press');
  assert.match(mapUi, /querySelectorAll\('\[data-os-act\]'\)/,
    'the strip buttons are asked which command they press');
  /* the failure this guards: a pairing written as a literal id-to-id map anywhere in the placement */
  const place = mapUi.slice(mapUi.indexOf('window._placeLayerTools'), mapUi.indexOf('window._placeLayerTools') + 1800);
  assert.ok(place.length > 200, 'the placement function is still here');
  assert.ok(!/btn-seismic-sim|btn-pandemic-sim|btn-gis-panel|btn-compare|btn-edu|lp-save/.test(place),
    'the placement names no button by id — it would rescue that one and leave the next one dark');
});

/* ③ A declaration that names a command nobody registers silences nothing, and it does so QUIETLY:
   the twin simply appears twice. So every `data-os-act` must match a tool row's own `id:`. */
test('R766 ③ every data-os-act names a command the tile browser actually offers', () => {
  const declared = [...dataLayers.matchAll(/dataset\.osAct\s*=\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(declared.length > 0, 'the buttons that have a twin declare the command they press');
  const rowIds = new Set([...mapUi.matchAll(/\{\s*id:\s*'([a-zA-Z][\w.]*)'/g)].map((m) => m[1]));
  for (const act of declared) {
    assert.ok(rowIds.has(act),
      `${act} is declared on a button but no tool row offers it — the twin would be shown twice`);
  }
});

/* ④ The placement has to run after every path that can move or detach the strip. Naming the call
   sites is naming a list, so what is pinned is the WEAKER, honest fact: each of the three places
   that re-append or discard the strip is followed by a placement call. */
test('R766 ④ the strip is re-placed after each rebuild that moves it', () => {
  assert.match(dataLayers, /_placeLayerTools/,
    'reorganizeLayerPanel re-appends the strip into the dropdown, so it must re-place it after');
  const calls = (mapUi.match(/window\._placeLayerTools&&window\._placeLayerTools\(\)/g) || []).length;
  assert.ok(calls >= 3,
    `the tile browser re-places the strip after a rebuild, an open and a close (found ${calls})`);
});
