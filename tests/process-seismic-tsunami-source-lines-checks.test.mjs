/* ============================================================================
 *  IntMap · the earthquake and tsunami simulators: the lines their correctness rests on
 * ----------------------------------------------------------------------------
 *  ⚠ Source-level pins. The row→latitude maps live on the two engine adapters and the painters in
 *  DOM/worker closures, so a Node test cannot call them; the constants that ARE numbers are read
 *  out of the source and reasoned about (mesh cell size, bytes per cell, patch resolution).
 *
 *  Each block below was one round-numbered file until the tests were regrouped by subject. A block
 *  keeps that file's helpers private to it (a `{ … }` scope), so two rounds' `docFacts()` or
 *  `scenario()` cannot shadow each other; the helpers every block shared — ROOT, rd/read and the
 *  line-ending-tolerant anchor — are declared once above. Titles keep their round tag so a failure
 *  still names the round whose record explains it.
 *
 *  Was: tests/r195 ②, r205 ②⑥⑦
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs, { readdirSync, readFileSync } from 'node:fs';
import path, { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { allSpecs, CORE_ALWAYS, CORE_MAX_S, coreNames, fixedCoreNames, tierSpecs } from '../scripts/tiers.mjs';
import { localCommands } from './helpers/ci-reach.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const read = rd;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R195 — was tests/r195-checks.test.mjs ②
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R195 — the source-level invariants behind this round's four changes.
 *
 *  These are the claims a browser test cannot make cheaply: that a literal is
 *  written in exactly two places and they agree, that a moved body really moved,
 *  and that the one value a split module cannot inherit is handed to it.
 * ==========================================================================*/

const appBody = rd('js/app-body.js');
/* (#R200) the session/tab subject left js/app-body.js for its own real ES module. These assertions
   are pointed at the file that HOLDS each half now rather than at a concatenation: if the snapshot
   ever moves again, "not in this file" is a failure, which is what a source-level guard is for. */
const sessionTabs = rd('js/session-tabs.js');
const mapUi = rd('js/map-ui.js');
const geoEngine = rd('js/geo-engine.js');
const cesium = rd('js/cesium-engine.js');
const tsunami = rd('js/tsunami.js');
const satProto = rd('js/sat-proto.js');
const countries = rd('js/countries-ui.js');
const mainJs = rd('src/main.js');

/* ── ② the dynamic image is parameterised by the engine, not by latitude ──────────────────────── */
test('R195 ②: both engines answer "what latitude is image row r", and differently', () => {
  assert.match(geoEngine, /imageRowLatitudes\(coordinates,height\)/, 'the MapLibre adapter implements it');
  assert.match(cesium, /imageRowLatitudes\(coordinates,height\)/, 'the Cesium adapter implements it');
  /* MapLibre's is the Mercator inverse; Cesium's is linear in latitude. If these two ever became the
     same expression, the bug this round fixed would be back on one of the engines. */
  assert.match(geoEngine, /Math\.log\(Math\.tan\(Math\.PI\s*\/\s*4\s*\+/, 'MapLibre maps rows through Mercator Y');
  assert.match(geoEngine, /2\s*\*\s*Math\.atan\(Math\.exp\(y\)\)/, '…and inverts it to get the latitude back');
  assert.match(cesium, /out\[r\]=n\+\(s-n\)\*\(r\+0\.5\)\/H/, 'a Cesium rectangle is geographic');
  assert.doesNotMatch(cesium.slice(cesium.indexOf('imageRowLatitudes'), cesium.indexOf('imageRowLatitudes') + 900),
    /Math\.log\(Math\.tan/, 'the geographic engine must NOT apply a Mercator transform');
  /* and it is reachable through the contract, not only on the adapter */
  assert.match(geoEngine, /imageRowLatitudes:\(c,h\)=>A\(\)\.imageRowLatitudes/, 'exposed on the MapLibre facade');
  assert.match(cesium, /imageRowLatitudes\(c,h\)\{ const v=V\(\)/, 'exposed on the Cesium facade');
});

test('R195 ②: the tsunami painter asks for the row map instead of assuming N−1−j', () => {
  assert.match(tsunami, /GE\(\)\.layers\.imageRowLatitudes\(c,/, 'the painter asks the engine');
  /* ⚠ (#R197) THE GRID GOT A SECOND RESOLUTION, SO THE ROW WIDTH IS NOT `N` ANY MORE. The model is
     1440 × 640 and the PICTURE is decimated from it (a full-resolution Int8 frame is 921 KB and a run
     is 140 of them), so the painter's stride is the display width FX. The property under test is
     unchanged and is still the one that matters: the row a pixel is painted from is the row the
     ENGINE says is drawn there, not N−1−j. */
  assert.match(tsunami, /const src=rowOf\[r\]\*FX, dst=r\*FX/, 'it paints the grid row that belongs at each image row');
  /* the old, wrong mapping must be gone from the draw path */
  assert.doesNotMatch(tsunami, /const src=j\*(N|FX), dst=\((N|FX)-1-j\)\*(N|FX)/,
    'the latitude-indexed image row is what put the wave 8° from its epicentre');
  /* the canvas is sized from the row map, not pinned to the grid */
  assert.match(tsunami, /height:imgH/, 'the texture height comes from chooseImgH()');
  assert.match(tsunami, /Math\.min\(2048,Math\.ceil\(NY2\*worst\)\)/, 'and it is capped');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R205 — was tests/r205-checks.test.mjs ②⑥⑦
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  IntMap · R205 source-level checks
 * ----------------------------------------------------------------------------
 *  Node tests, no browser. Every assertion is DERIVED from the source or RUN against it — #R203 and
 *  #R204 between them lost seven of their own pins by writing VALUES and FILE NAMES that the next
 *  round, moving in the same direction, had to change. So: relations, not literals; and where a
 *  number is unavoidable it is read out of the file that owns it.
 * ==========================================================================*/

/* ── ② 「地震シミュレータは、別の震源地を選びなおせない。地図に白い丸が出るだけ」 ────────────── */
test('R205 ② the map click has a stated owner and it defaults to the epicentre', () => {
  const s = rd('js/seismic.js');
  /* ══ ⚠⚠ (#R240) THE DEFAULT IS NOW 'none', AND THAT IS THIS TEST'S OWN ARGUMENT KEPT ═══════════
     #R205's finding was 「地震シミュレータは、別の震源地を選びなおせない」 — a map click had to MEAN
     something, and the epicentre is what it should mean. That still holds and is unchanged: when the
     panel opens with no epicentre, `open()` arms 'epi' (asserted below), so the one gesture there is
     to make is live and the map HUD says so.
     What changed is the case #R205 did not have: opening onto an earthquake that is ALREADY loaded.
     Measured on the shipped build, the panel came up with step ② armed, its button reading 「解除」,
     a banner saying 「地図をタップして震源地を置いてください」 and the row above it printing the
     coordinates of the hypocentre that was already there — 「手順や流れが全く理解できない。フローが
     破綻している。」 So the declaration is 'none' and the ARMING is a decision `open()` makes from
     state, which is what this pair of assertions now pins. */
  assert.match(s, /let clickMode='none';/, "the declared default arms nothing — see open()");
  assert.match(s, /if\(!epi&&clickMode==='none'\)\{ setClickMode\('epi'\); \}/,
    "…and opening with no epicentre still arms the epicentre, which is #R205's finding");
  /* ⚠ declared with the rest of the panel state, ABOVE render() — #R200 lost a whole boot to a `let`
     that a function could reach before its declaration had been evaluated */
  assert.ok(s.indexOf("let clickMode='none';") < s.indexOf('function render()'),
    'clickMode must be declared before render() reads it');
  const oc = /function onClick\(e\)\{[\s\S]*?GE\(\)\.events\.on\('click',onClick\);/.exec(s);
  assert.ok(oc, 'onClick was not found');
  assert.match(oc[0], /clickMode==='station'/);
  /* ⚠ (#R210) the CLAIM is "the default branch moves the epicentre", not the assignment's spelling.
     It goes through setEpi() now, because moving the epicentre also has to clear the observation
     points («地震が変われば観測地点はリセットされるように»). Both forms are accepted. */
  /* (#R236) …and it goes through a named point now, because with a rupture drawn the click is
     first tested for containment («震央を震源域の範囲内に配置»). Still the same claim: the default
     branch is the one that moves the epicentre. */
  assert.match(oc[0], /(?:epi=|setEpi\(\s*)(?:\[e\.lngLat\.lng,e\.lngLat\.lat\]|p\))/,
    'the default branch must move the epicentre');
  assert.match(oc[0], /const p=\[e\.lngLat\.lng,e\.lngLat\.lat\];|\[e\.lngLat\.lng,e\.lngLat\.lat\]/,
    '…from the clicked position');
  /* the station table is NOT removed — the white circle layer and the push are both still there */
  assert.match(oc[0], /stations\.push/);
  assert.match(s, /id:'seis-sta'/);
  /* both halves are reachable from the panel and from a call (the Atlas rule) */
  assert.match(s, /\.sq-cm-epi/); assert.match(s, /\.sq-cm-sta/);
  assert.match(s, /\n      setClickMode,/);
  /* five languages for both new labels and the hint under them */
  /* (#R210) American English: epicentre -> epicenter across every user-facing string. */
  /* (#R212) the two ◎ controls were merged, so the segment's label is now the merged one */
  /* (#R236) …and the merged label was renamed when the rupture area came first: with an area drawn,
     the point being placed is the NUCLEATION point on that plane, so the control says hypocenter.
     The claim is unchanged — the control exists and is given in five languages. */
  /* ⚠ (#R238) THE CLAIM IS THE CONTROL AND ITS FIVE LANGUAGES, NOT THE SENTENCE ON THE BUTTON.
     #R238 turned the three controls into a numbered STEP LIST, so what the reader reads is now split
     between the step's TITLE (「震央」 / 「観測地点」) and a button whose word is the next action for
     that step (Place / Move / Cancel, Add / Done). 「Place the hypocenter」 as one string no longer
     exists — nothing was dropped, it was re-cut — so the check follows the titles, which are the
     names of the two things this test is about, and still demands five languages for each. */
  for (const en of ['Hypocenter', 'Observation points']) {
    const i = s.indexOf("L('" + en + "'");
    assert.ok(i > 0, `${en} is missing`);
    const call = s.slice(i, i + 400);
    assert.equal((call.match(/','/g) || []).length >= 4, true, `${en} must be given in five languages`);
  }
  /* and both step buttons still carry the class the click handler grabs */
  for (const cls of ['sq-cm-epi', 'sq-cm-sta']) assert.ok(s.indexOf('class="' + cls) >= 0, cls + ' is emitted');
});

/* ── ⑥ 「津波…精度をもっと高く。特に震源付近は高解像度シミュレーションに」 ───────────────────── */
test('R205 ⑥ the source region gets a measured sea floor, and the bundled one is still the fallback', () => {
  const w = rd('src/tsunami-worker.js');
  assert.match(w, /function seaFloor\(bathy, nx, ny, lat0, lat1, fine\)/);
  assert.match(w, /seaFloor\(m\.bathy, nx, ny, lat0, lat1, m\.fine\)/);
  /* the patch decides a cell only when enough of that cell answered; otherwise the old path runs */
  assert.match(w, /if \(nKnown >= 4\)/);
  assert.match(w, /if \(frac == null\) \{/, 'the bundled floor must remain the fallback');
  /* the wet/dry rule itself is unchanged — this round refines the INPUT, not the physics */
  assert.match(w, /if \(frac >= 0\.5 && d > 10\)/);
  const t = rd('js/tsunami.js');
  assert.match(t, /async function fineFloor\(my\)/);
  const c = /const FINE_BOX_DEG=(\d+), FINE_CPD=(\d+), FINE_Z=(\d+)/.exec(t);
  assert.ok(c, 'the patch constants were not found');
  const cpd = +c[2];
  /* ⚠ the DEM zoom has to be able to ARRIVE. z7 measured 1 of 64 tiles in 9 s while the earthquake
     panel was pulling z8 through the same six connections — see js/tsunami.js. */
  assert.ok(+c[3] <= 6, `the patch asks for z${c[3]}; z7 was measured as unreachable during a run`);
  /* a patch that covers part of the box is kept: the worker decides per cell */
  assert.match(t, /FINE_MIN_FRAC=0?\.\d+/);
  assert.match(t, /fineWhy/, 'an absent patch must say why (#R194)');
  /* the patch has to be finer than BOTH grids it can be asked to feed, or it teaches nothing */
  assert.ok(1 / cpd < 0.25, `the patch cell (1/${cpd}°) must be finer than the bundled 0.25° floor`);
  /* ⚠ (#R668) NEAR_CPD kept its numbers and changed its predicate — the arm is chosen by the DEVICE
     (js/mem-budget.js `deviceIsPhone`) rather than by a 768 px media query. What this line needs is
     the desktop resolution, so it reads the branches and accepts either spelling of the predicate. */
  const mNear = /const NEAR_CPD=\(\)=>\((?:_phoneDev\(\)|window\.IntMapMemBudget\.deviceIsPhone\([^()]*\))\?(\d+):(\d+)\)/.exec(t);
  assert.ok(mNear, 'NEAR_CPD is still a two-branch phone/desktop constant decided by the device');
  const nearCpd = +mNear[2];
  assert.ok(cpd > nearCpd, `the patch (${cpd}/°) must be finer than #R204's near grid (${nearCpd}/°)`);
  /* it is handed over and transferred, and a run without it is the previous round's run */
  assert.match(t, /fine:fine\?\{ w:fine\.w/);
  assert.match(rd('src/tsunami-worker-client.js'), /xfer\.push\(o\.fine\.d\.buffer\)/);
  assert.match(t, /catch\(_\)\{ fine=null; \}/);
});

/* ── ⑦ 「震度分布のメッシュをより高画質に」 ─────────────────────────────────────────────────── */
test('R205 ⑦ the intensity mesh can actually reach the cell size it aims at', () => {
  const s = rd('js/seismic.js');
  const m = /const CELL_KM=([\d.]+), N_MIN=\(_mob\?(\d+):(\d+)\), N_MAX=\(_mob\?(\d+):(\d+)\);/.exec(s);
  assert.ok(m, 'the mesh sizing line was not found');
  const cell = +m[1], nMaxMob = +m[4], nMax = +m[5];
  /* the measured worst case: an M8.5 spans 2,771 km. The ceiling must let THAT reach the target. */
  assert.ok(2771 / nMax <= cell + 0.1, `a 2,771 km field gets ${(2771 / nMax).toFixed(2)} km cells against a ${cell} km target`);
  /* …and it is strictly finer than #R204's, which is what "more detailed" means */
  assert.ok(nMax > 1280, `#R204 shipped 1280; this round has ${nMax}`);
  assert.ok(nMaxMob > 512 && nMaxMob < nMax, 'the phone moves too, and by less');
  /* the ceiling is memory, so the memory per cell had to come down for it to move */
  assert.match(s, /const vs=new Int16Array\(N\*N\), pgvArr=new Float32Array\(N\*N\), a0Arr=new Float32Array\(N\*N\);/);
  /* ⚠⚠ (#R226) THE INVARIANT IS BYTES PER CELL, AND IT WAS WRITTEN AS A TOTAL. #R205's own sentence
     above is «the ceiling is memory, so the memory PER CELL had to come down for it to move», and the
     line below then compared the TOTAL against a constant 2 — a number that is #R205's own result
     (1,792² × 10 / 1,280² × 12 = 1.63) rather than the principle. #R226 raised the ceiling to 2,560
     for a measured reason and the per-cell cost did not move at all, yet the total ratio is 3.33 and
     this failed. The picture itself grew 4×, so by the sentence's own words nothing is wrong.
     So the per-cell figure is what is asserted, derived from the declaration rather than restated:
     Int16 + Float32 + Float32 = 10 bytes, and it may go down but never up. */
  const arrays = [...s.matchAll(/new (Int8|Uint8|Int16|Uint16|Int32|Uint32|Float32|Float64)Array\(N\*N\)/g)]
    .map((m) => ({ Int8: 1, Uint8: 1, Int16: 2, Uint16: 2, Int32: 4, Uint32: 4, Float32: 4, Float64: 8 }[m[1]]));
  assert.ok(arrays.length >= 3, 'the retained field is still three arrays over the grid');
  const perCell = arrays.reduce((a, b) => a + b, 0);
  assert.ok(perCell <= 10, `the retained field costs ${perCell} B a cell; #R205 brought it to 10`);
});
}
