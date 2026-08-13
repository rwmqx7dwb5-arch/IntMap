/* ============================================================================
 *  IntMap · R205 source-level checks
 * ----------------------------------------------------------------------------
 *  Node tests, no browser. Every assertion is DERIVED from the source or RUN against it — #R203 and
 *  #R204 between them lost seven of their own pins by writing VALUES and FILE NAMES that the next
 *  round, moving in the same direction, had to change. So: relations, not literals; and where a
 *  number is unavoidable it is read out of the file that owns it.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allSpecs, coreNames, tierSpecs, CORE_MAX_S, CORE_ALWAYS } from '../scripts/tiers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── ① 「プレート境界レイヤーのプレート名は透過するな」 ───────────────────────────────────────
   The 0.3 came from #R20's per-layer default travelling through _applyGenericOpacity, which dimmed a
   symbol layer's TEXT along with the fill the default was about. */
test('R205 ① a layer can keep its text opaque while its fill follows the opacity slider', () => {
  const dl = rd('js/data-layers.js');
  assert.match(dl, /_opacityOpaqueText/, 'js/data-layers.js must own the opt-out registry');
  /* the symbol branch consults it for BOTH text and icon, and the non-symbol branch is untouched */
  const branch = /if\(L\.type==='symbol'\)\{[\s\S]{0,400}?return;\s*\}/.exec(dl);
  assert.ok(branch, 'the symbol branch of _applyGenericOpacity was not found');
  assert.match(branch[0], /_opacityOpaqueText\[lid\]/);
  assert.match(branch[0], /'text-opacity',keep\?1:v/);
  assert.match(branch[0], /'icon-opacity',keep\?1:v/);

  const lp = rd('js/layer-packs.js');
  /* the plate label declares itself, and does so where the layer is created (so the declaration
     cannot be later than the first apply) */
  const add = /GE\(\)\.layers\.add\(\{id:'eco-plates-lbl'[\s\S]{0,900}?\}\);/.exec(lp);
  assert.ok(add, "the eco-plates-lbl layer definition was not found");
  assert.match(add[0], /'text-opacity':1/, 'the label states its own opacity as well');
  assert.match(add[0], /'text-halo-color':'rgba\(0,0,0,1\)'/, 'the halo does not let the map through');
  const after = lp.slice(lp.indexOf(add[0]) + add[0].length, lp.indexOf(add[0]) + add[0].length + 300);
  assert.match(after, /_opacityOpaqueText[\s\S]{0,60}eco-plates-lbl/);
  /* ⚠ and #R204's answer to the previous instruction is still in place — this round does not undo it */
  assert.match(add[0], /IntMapLabelScale\.sub\(1\)/, "#R204's size must survive");
  assert.match(add[0], /Noto Sans Bold/, "#R204's weight must survive");
});

/* ── ② 「地震シミュレータは、別の震源地を選びなおせない。地図に白い丸が出るだけ」 ────────────── */
test('R205 ② the map click has a stated owner and it defaults to the epicentre', () => {
  const s = rd('js/seismic.js');
  assert.match(s, /let clickMode='epi';/, "the default must be the epicentre, and must be declared with the panel state");
  /* ⚠ declared with the rest of the panel state, ABOVE render() — #R200 lost a whole boot to a `let`
     that a function could reach before its declaration had been evaluated */
  assert.ok(s.indexOf("let clickMode='epi';") < s.indexOf('function render()'),
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

/* ── ③ 「ライトモードかつMapを選択した場合、昼の箇所がまぶしすぎて何も見えない」 ─────────────── */
test('R205 ③ the light basemap gets its own, much weaker atmosphere — and the other two are untouched', () => {
  const t = rd('js/theme-sky.js');
  assert.match(t, /function _mapIsLight\(\)/, 'the light/dark map rule must exist once, as a function');
  /* (#R227) the three ramps now sit behind `limb?0:` — where the app draws the Earth's edge itself
     the renderer's own atmosphere pass is switched off so the two do not add. The ramps themselves,
     which is what this test is about, are unchanged. */
  const blend = /'atmosphere-blend':\((?:limb\?0:\()?sat[\s\S]{0,700}?\)\}\);/.exec(t);
  assert.ok(blend, "the atmosphere-blend expression was not found");
  assert.match(blend[0], /_mapIsLight\(\)/, 'the map basemap branch must ask which colour it is');
  const ramps = [...blend[0].matchAll(/\['interpolate',\['linear'\],\['zoom'\],([^\]]+)\]/g)]
    .map((m) => m[1].split(',').map(Number));
  assert.equal(ramps.length, 3, 'three ramps: satellite, light map, dark map');
  const stops = (a) => { const o = {}; for (let i = 0; i + 1 < a.length; i += 2) o[a[i]] = a[i + 1]; return o; };
  const [sat, light, dark] = ramps.map(stops);
  /* ⚠ #R187's 0.55 for satellite and #R196/#R202's 0.80 for the dark map are previous rounds'
     measured answers. This round may not move them. */
  assert.equal(sat[0], 0.55, "#R187's satellite strength must not change");
  assert.equal(dark[0], 0.80, "the dark basemap's strength must not change");
  for (const z of Object.keys(dark)) {
    assert.ok(light[z] != null, `the light ramp is missing the z${z} stop`);
    assert.ok(light[z] <= dark[z], `light z${z} (${light[z]}) must not exceed dark (${dark[z]})`);
  }
  assert.ok(light[0] <= 0.16, `the light z0 strength is ${light[0]}; 0.20 already put 69 % of the globe above luminance 235`);
  /* the ramp keeps its shape rather than being flattened to a constant */
  assert.ok(light[0] > light[4] && light[4] > light[7] && light[15] === 0);
});

/* ── ④ 「ライトモード時に表示する読み込み画面でのロゴはIntMap.Icon_BW-inverted.pngに」 ───────── */
test('R205 ④ the launch screen picks its mark from the SAVED theme, before the first paint', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'IntMap.Icon_BW-inverted.png')), 'the light mark must be in the repository');
  const html = rd('index.html');
  /* the early attribute script reads the app's own setting, not only the OS */
  const early = /<script>\(function\(\)\{var t='auto';[\s\S]{0,600}?<\/script>/.exec(html);
  assert.ok(early, 'the early data-theme script was not found');
  assert.match(early[0], /intmap_settings/);
  assert.match(early[0], /prefers-color-scheme: dark/);
  assert.match(early[0], /setAttribute\('data-theme',t\)/);
  assert.ok(html.indexOf(early[0]) < html.indexOf('<body>'), 'it must run before the body is parsed');
  /* ONE file is fetched, not two: the mark is a background whose declaration the cascade picks */
  assert.match(html, /<div class="boot-icon" role="img" aria-label="IntMap"><\/div>/);
  assert.ok(!/boot-icon[^>]*>\s*<img/.test(html), 'two <img> tags would fetch both marks');
  const css = rd('css/intmap.css');
  assert.match(css, /\.boot-icon\{[^}]*IntMap\.Icon\.png/);
  assert.match(css, /:root\[data-theme="light"\] \.boot-icon\{[^}]*IntMap\.Icon_BW-inverted\.png/);
});

/* ── ⑤ 「衛星画像の読み込み時の動作を、極限までシームレスに」「ズームのfpsを劇的に」 ─────────── */
test('R205 ⑤ a tile request made while the zoom is changing waits instead of fetching', () => {
  const s = rd('js/sat-proto.js');
  assert.match(s, /function _satZoomHold\(z,signal\)/);
  /* it is the ZOOM, not any movement: a pan asks for tiles it is going to keep */
  const wire = /function _satWireZoom\(\)\{[\s\S]{0,500}?\n    \}/.exec(s);
  assert.ok(wire, '_satWireZoom was not found');
  assert.match(wire[0], /E\.on\('zoomstart'/); assert.match(wire[0], /E\.on\('zoomend'/);
  assert.ok(!/movestart|dragstart/.test(wire[0]), 'holding a pan would be a pure delay');
  const hold = /function _satZoomHold\(z,signal\)\{[\s\S]{0,900}?\n    \}/.exec(s);
  assert.match(hold[0], /signal&&signal\.aborted/, "MapLibre's own abort is what selects the level");
  assert.match(hold[0], /AbortError/, 'an aborted tile must go to unloaded, not errored');
  assert.match(hold[0], /_SAT_MAX_HOLD/, 'a pinch that never settles must still show imagery');
  /* the gate is off for the cheap shared low zooms, and the hold is applied before any fetch */
  assert.match(s, /_SAT_HOLD_MINZ\s*=\s*[1-9]/);
  const proto = /addProtocol\('imapsat',[\s\S]*?window\.__imSatProto=true;/.exec(s);
  assert.ok(proto, 'the imapsat protocol registration was not found');
  assert.ok(proto[0].indexOf('_satZoomHold') < proto[0].indexOf('_satViaWorker'), 'the hold must precede the fetch');
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
  const nearCpd = +/const NEAR_CPD=\(\)=>\(\(typeof isMobile==='function'&&isMobile\(\)\)\?(\d+):(\d+)\)/.exec(t)[2];
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

/* ── ⑧ 「毎回毎回、テストに時間がかかりすぎ…簡易でいい」 ───────────────────────────────────── */
test('R205 ⑧ the gate is cheaper than the round before it, and nothing was deleted to do it', () => {
  const dur = JSON.parse(rd('tests/durations.json'));
  const times = Object.values(dur).filter((v) => typeof v === 'number').sort((a, b) => a - b);
  const p75 = times[Math.floor(times.length * 0.75)];
  const cost = (f) => (typeof dur[f] === 'number' ? dur[f] : p75);
  const core = tierSpecs('core').reduce((a, f) => a + cost(f), 0);
  /* ⚠ MEASURED files only for the comparison. An unmeasured spec is charged p75 by the budget, which
     is the right direction for a CEILING and the wrong quantity for "did the gate get cheaper" — a
     brand-new file would otherwise make any round look like a regression until CI has timed it. */
  const coreMeasured = tierSpecs('core').filter((f) => typeof dur[f] === 'number').reduce((a, f) => a + dur[f], 0);
  assert.ok(CORE_MAX_S < 10, `the price was 10 s in #R204 and is ${CORE_MAX_S}`);
  assert.ok(coreMeasured < 173, `the gate's measured files come to ${coreMeasured}s and #R204 shipped 173 s`);
  assert.ok(tierSpecs('core').length < 17, `${tierSpecs('core').length} files in the gate; #R204 had 17`);
  /* ⚠ AND THE ROUND EXCEPTION IS BOUNDED TO EXACTLY ONE FILE. It is the reason the gate does not grow
     a spec per round, and it is derived (currentRoundSpec), so the previous round's spec demotes
     itself the moment a higher number appears — which is where 49 of #R204's 173 s went. */
  const t = rd('scripts/tiers.mjs');
  const fn = /export function coreNames\(\)\s*\{[\s\S]{0,900}?\n\}/.exec(t);
  assert.ok(fn, 'coreNames was not found');
  assert.match(fn[0], /n === cur/);
  assert.match(t, /export function currentRoundSpec\(\)/);
  const roundSpecsInCore = coreNames().filter((n) => /^r\d+$/.test(n) && !CORE_ALWAYS.includes(n));
  assert.ok(roundSpecsInCore.length <= 7, `${roundSpecsInCore.length} per-round specs are in the gate`);
  /* nothing removed, and both tiers still partition the suite */
  assert.ok(allSpecs().length >= 58, `${allSpecs().length} spec files — nothing may be deleted for speed`);
  assert.equal(tierSpecs('core').length + tierSpecs('deep').length, allSpecs().length);
  for (const n of CORE_ALWAYS) assert.ok(coreNames().includes(n), `${n} must gate`);
  /* the ceilings still bind, and the TOTAL did not gain headroom */
  const b = rd('scripts/test-budget.mjs');
  const cap = Number(/const BUDGET_S = (\d+);/.exec(b)[1]);
  const tot = Number(/const TOTAL_BUDGET_S = (\d+);/.exec(b)[1]);
  assert.ok(cap < 180, `the gate ceiling is ${cap}s; #R204's was 180`);
  assert.ok(allSpecs().length >= 59, `${allSpecs().length} spec files`);
  assert.ok(core <= cap, `the gate is ${core}s against its ${cap}s ceiling`);
  assert.ok(tot <= 5250, `the total ceiling is ${tot}s`);
});

test('R205 ⑧b `npm test` runs its two independent halves at the same time', () => {
  const pkg = JSON.parse(rd('package.json'));
  assert.equal(pkg.scripts.test, 'node scripts/test-parallel.mjs');
  /* the old sequential order is kept as an escape hatch rather than deleted */
  assert.match(pkg.scripts['test:seq'], /static-checks[\s\S]*run-tests/);
  const r = rd('scripts/test-parallel.mjs');
  assert.match(r, /Promise\.all\(HALVES\.map\(runHalf\)\)/);
  /* both halves always run — a static-check failure must not hide a browser regression */
  assert.ok(!/Promise\.race/.test(r));
  assert.match(r, /results\.some\(\(r\) => r\.code !== 0\)/);
  /* every step of the old chain is still there */
  for (const s of ['static-checks.mjs', 'engine-coupling.mjs', 'test-budget.mjs', 'test:checks', 'run-tests.mjs']) {
    assert.ok(r.includes(s), `${s} must still run`);
  }
});
