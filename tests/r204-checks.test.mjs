/* ============================================================================
 *  IntMap · R204 source-level checks
 * ----------------------------------------------------------------------------
 *  Node tests, no browser. Every assertion here is DERIVED from the source or RUN against it —
 *  #R203 lost two of its own pins by writing values (448) and file names (r203.spec.js) that the
 *  next round in the SAME direction had to change, so this file states relations and re-derives
 *  numbers from the files that own them.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { allSpecs, coreNames, currentRoundSpec, tierSpecs, isDeep, CORE_MAX_S, CORE_ALWAYS } from '../scripts/tiers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── ① THE GATE IS A PRICE, NOT A LIST ────────────────────────────────────────────────────────
   「毎回毎回、テストに時間がかかりすぎ…明らかにテストが過剰。大幅に過剰。簡易でいい。」 */
test('R204 ① every spec in the gate is cheap, or is one of the two documented exceptions', () => {
  const dur = JSON.parse(rd('tests/durations.json'));
  const bare = (f) => path.basename(String(f)).replace(/\.spec\.js$/, '');
  const cur = currentRoundSpec();
  for (const f of tierSpecs('core')) {
    const n = bare(f), t = dur['tests/' + n + '.spec.js'];
    if (CORE_ALWAYS.includes(n) || n === cur) continue;
    assert.ok(!(t > CORE_MAX_S), `${n} costs ${t}s and is neither always-on nor the current round`);
  }
  /* …and the exceptions are exactly the two the header names */
  for (const n of CORE_ALWAYS) assert.ok(!isDeep('tests/' + n + '.spec.js'), `${n} must gate`);
  assert.ok(cur && !isDeep('tests/' + cur + '.spec.js'), 'the current round gates its own spec');
});

test('R204 ①b the gate got much cheaper and the whole suite did not grow', () => {
  const dur = JSON.parse(rd('tests/durations.json'));
  const times = Object.entries(dur).filter(([, v]) => typeof v === 'number').map(([, v]) => v).sort((a, b) => a - b);
  const p75 = times[Math.floor(times.length * 0.75)];
  const cost = (f) => (typeof dur[f] === 'number' ? dur[f] : p75);
  const core = tierSpecs('core').reduce((a, f) => a + cost(f), 0);
  const whole = allSpecs().reduce((a, f) => a + cost(f), 0);
  /* #R203 shipped a 484 s gate; this round is about that number being still too big */
  assert.ok(core < 484, `the gate is ${core}s, and #R203 already had 484s`);
  /* the ceilings: the gate's own, and the TOTAL — which is what stops "fix the gate by moving files" */
  const b = rd('scripts/test-budget.mjs');
  const cap = Number(/const BUDGET_S = (\d+);/.exec(b)[1]);
  const tot = Number(/const TOTAL_BUDGET_S = (\d+);/.exec(b)[1]);
  assert.ok(cap <= 200, `the gate ceiling is ${cap}s`);
  assert.ok(core <= cap, `the gate is ${core}s against its ${cap}s ceiling`);
  assert.ok(whole <= tot, `the suite is ${whole}s against its ${tot}s ceiling`);
  /* ⚠ #R203's two ceilings added up to 5,250; this round must not have created headroom */
  assert.ok(tot <= 5250, `the total ceiling is ${tot}s; #R203's two ceilings came to 5,250`);
  /* and nothing was deleted to get there */
  assert.ok(allSpecs().length >= 57, `${allSpecs().length} spec files — nothing may be deleted for speed`);
  assert.equal(tierSpecs('core').length + tierSpecs('deep').length, allSpecs().length);
});

test('R204 ①c the tier split is derived, not written down twice', () => {
  const t = rd('scripts/tiers.mjs');
  assert.doesNotMatch(t, /raw\.deep/, 'the explicit deep list is gone — the rule is the price');
  const dur = JSON.parse(rd('tests/durations.json'));
  assert.equal(dur.deep, undefined, 'and tests/durations.json no longer carries one');
  /* the newest rNNN spec is the current round, computed rather than named */
  const nums = allSpecs().map((f) => /^r(\d+)$/.exec(path.basename(f).replace(/\.spec\.js$/, ''))).filter(Boolean).map((m) => +m[1]);
  assert.equal(currentRoundSpec(), 'r' + Math.max(...nums));
  assert.ok(coreNames().includes(currentRoundSpec()));
});

/* ── ② THE LAUNCH SCREEN IS EXACTLY WHAT #R186 ASKED FOR ─────────────────────────────────────
   ⚠ #R204 rebuilt this element on a WRONG DIAGNOSIS of 「起動したときに地図が真っ暗になっている場合が
   ある」: it found the launch screen sitting opaque over a drawn map on a slow network and split its
   backdrop out into a scrim. The user's environment is MapLibre and the report is 「地図の領域が全面
   まっ黒（何も見えない）」 — the MAP is black, not the cover. The change was reverted; what this test
   guards now is that it STAYED reverted, because #R186 asked for an opaque screen until ready and
   #R190 fixed it lifting early, and neither of those is this round's to trade away. */
test('R204 ② the launch screen is opaque until a milestone ends it, and nothing thins it early', () => {
  const html = rd('index.html'), css = rd('css/intmap.css'), body = rd('js/app-body.js');
  assert.match(css, /\.boot-splash\{[^}]*background:var\(--bg-color\)/, 'the cover paints, as #R186 asked');
  assert.doesNotMatch(css, /\.boot-back\b/, 'no separate scrim layer');
  assert.doesNotMatch(html, /boot-live|boot-back/, 'and no scrim state on the element');
  assert.doesNotMatch(body, /__imBoot\.live/, 'the app does not thin the cover');
  /* the endings #R190 made a contract are untouched */
  assert.match(body, /const go=\(why\)=>\{ if\(ended\) return; ended=true; try\{ window\.__imBoot\.done\(why\|\|'idle'\)/);
  assert.match(html, /no ready signal after 20 s/, 'and the failsafe is still there');
});

/* ── ③ THE SATELLITE JPEG IS DECODED OFF THE MAIN THREAD ──────────────────────────────────────── */
test('R204 ③ the tile worker answers with a bitmap, and keeps the bytes as the fallback', () => {
  const w = rd('src/sat-worker.js');
  assert.match(w, /async function decode\(buf\)/, 'the worker decodes');
  assert.match(w, /bitmap = await decode\(r\.buf\)/, 'on the path that used to return bytes');
  assert.match(w, /if \(!bitmap\) buf = r\.buf\.slice\(0\)/, 'and the bytes remain the fallback');
  /* ⚠ no colour-management shortcut: #R190 matched these tiles to the floor underneath them */
  assert.doesNotMatch(w, /colorSpaceConversion/, 'decode speed may not change the colours (#R190)');
});

/* ── ④ THE SHAKING MESH IS A CELL SIZE NOW, WITH A FLOOR AND A CEILING ────────────────────────── */
test('R204 ④ the intensity mesh is finer than #R203 at its coarsest, and finer still where it can be', () => {
  const s = rd('js/seismic.js');
  const m = /const CELL_KM=([\d.]+), N_MIN=\(_mob\?(\d+):(\d+)\), N_MAX=\(_mob\?(\d+):(\d+)\);/.exec(s);
  assert.ok(m, 'js/seismic.js states a cell size with a floor and a ceiling');
  const [, cell, mobMin, deskMin, mobMax, deskMax] = m.map(Number.isNaN ? String : (x) => x);
  assert.ok(Number(deskMin) >= 640, `desktop floor ${deskMin}, #R203 shipped 640`);
  assert.ok(Number(mobMin) >= 288, `mobile floor ${mobMin}, #R203 shipped 288`);
  assert.ok(Number(deskMax) > Number(deskMin), 'and the ceiling is above the floor');
  assert.ok(Number(mobMax) > Number(mobMin));
  /* the relation the file claims: a 2,000 km field lands under #R203's 3.1 km cell */
  const N = Math.max(Number(deskMin), Math.min(Number(deskMax), Math.round(2000 / Number(cell))));
  assert.ok(2000 / N < 3.1, `a 2,000 km field gets ${(2000 / N).toFixed(2)} km cells; #R203 gave 3.1`);
  /* …and a narrow field is NOT made finer for nothing — the floor still governs it */
  assert.equal(Math.max(Number(deskMin), Math.min(Number(deskMax), Math.round(200 / Number(cell)))), Number(deskMin));
  const far = /const NF=\(typeof isMobile==='function'&&isMobile\(\)\)\?(\d+):(\d+);/.exec(s);
  assert.ok(Number(far[2]) >= 1024 && Number(far[1]) >= 512, 'the far field is no coarser than #R203');
});

/* ── ⑤ THE TSUNAMI'S NEAR-SOURCE DOMAIN ───────────────────────────────────────────────────────
   Deferred in #R202 and #R203 on the grounds that a nested grid means a non-periodic solver. It does
   not, if the nest is a latitude BAND at the full circle — so the check that matters is that the
   solver is untouched and that the band's numbers are what the page claims. */
test('R204 ⑤ the near-source scope is a finer grid on the SAME periodic solver', () => {
  const t = rd('js/tsunami.js'), w = rd('src/tsunami-worker.js');
  assert.match(t, /const NEAR_CPD=\(\)=>\(\(typeof isMobile==='function'&&isMobile\(\)\)\?(\d+):(\d+)\)/);
  const cpd = /const NEAR_CPD=\(\)=>\(\(typeof isMobile==='function'&&isMobile\(\)\)\?(\d+):(\d+)\)/.exec(t);
  const band = /const NEAR_BAND=\(\)=>\(\(typeof isMobile==='function'&&isMobile\(\)\)\?(\d+):(\d+)\)/.exec(t);
  assert.ok(cpd && band, 'the band and its resolution are declared');
  /* the global grid is 1440 columns over 360° = 4 cells a degree; the near scope must be finer */
  const NX = Number(/const NX=(\d+), NY=(\d+)/.exec(t)[1]);
  for (const i of [1, 2]) assert.ok(Number(cpd[i]) > NX / 360, `near resolution ${cpd[i]}/° is not finer than ${NX / 360}/°`);
  /* the run is bounded by its own walls rather than by the global menu */
  assert.match(t, /const NEAR_MAX_H=(\d+)/);
  assert.match(t, /function hourChoices\(\)\{ return scope==='near'\?\[[\d, ]+\]/);
  /* ⚠ AND THE SOLVER IS NOT TOUCHED: longitude stays periodic in all three equations */
  assert.match(w, /const dLam = \(2 \* Math\.PI\) \/ nx;/, 'the solver is still the whole circle');
  assert.doesNotMatch(w, /periodic/, 'no periodicity flag was introduced');
  /* the source quadrature got finer, which is the other half of 「精度をもっと高く」 */
  const sub = /const SUB_N = (\d+), subR/.exec(w);
  assert.ok(sub && Number(sub[1]) >= 5, `SUB_N is ${sub && sub[1]}; #R202 measured 3 as 1.5 % off convergence`);
});

test('R204 ⑤b the near-source band is a real band, and the run is one the light cone can afford', () => {
  /* re-derive nearDomain() from the file rather than copying its arithmetic */
  const t = rd('js/tsunami.js');
  const cpd = Number(/const NEAR_CPD=\(\)=>\(\(typeof isMobile==='function'&&isMobile\(\)\)\?(\d+):(\d+)\)/.exec(t)[2]);
  const band = Number(/const NEAR_BAND=\(\)=>\(\(typeof isMobile==='function'&&isMobile\(\)\)\?(\d+):(\d+)\)/.exec(t)[2]);
  const dom = (lat) => { let a = Math.max(-80, Math.min(80 - 2 * band, lat - band)); let b = Math.min(80, a + 2 * band); a = Math.max(-80, b - 2 * band); return { nx: Math.round(360 * cpd), ny: Math.round((b - a) * cpd), lat0: a, lat1: b }; };
  for (const lat of [-79, -35, 0, 38.1, 79]) {
    const d = dom(lat);
    assert.equal(d.lat1 - d.lat0, 2 * band, `the band is ${d.lat1 - d.lat0}° at latitude ${lat}`);
    assert.ok(d.lat0 >= -80 && d.lat1 <= 80, 'and stays inside the solver domain');
    assert.equal(d.ny, 2 * band * cpd);
  }
  /* the source is inside the band wherever it can be */
  for (const lat of [-35, 0, 38.1]) { const d = dom(lat); assert.ok(lat > d.lat0 && lat < d.lat1); }
  /* memory: six Float32 fields over nx·ny stays under what #R197's global grid already holds ×3 */
  const d = dom(38.1);
  assert.ok(d.nx * d.ny * 4 * 6 < 80e6, `${Math.round(d.nx * d.ny * 4 * 6 / 1e6)} MB of field arrays`);
});

test('R204 ⑤c the near-source solve really is finer, and the wave still travels at √(gh)', () => {
  /* the worker, run in Node over a flat ocean — the harness tests/r197-checks.test.mjs established.
     The point is that a BAND domain gives the same physics as the global one, only finer. */
  const ctx = {
    self: { postMessage: () => {} },
    performance: { now: () => Number(process.hrtime.bigint() / 1000n) / 1000 },
    console, Math, Float32Array, Float64Array, Int32Array, Int16Array, Int8Array, Uint8Array,
    Number, Object, Array, isFinite, String, Error
  };
  vm.createContext(ctx);
  vm.runInContext(rd('src/tsunami-worker.js') + '\n;globalThis.__api={run};', ctx, { filename: 'tsunami-worker.js' });
  const depth = 4000, w = 360, h = 180;
  const rgb = new Uint8Array(w * h * 3);
  for (let k = 0; k < w * h; k++) { rgb[k * 3] = depth >> 8; rgb[k * 3 + 1] = depth & 255; rgb[k * 3 + 2] = 255; }
  const band = { id: 1, nx: 720, ny: 60, lat0: 5, lat1: 25, dec: 4, hours: 1.2, frames: 24,
    bathy: { w, h, rgb }, src: { lng: 0, lat: 15, mw: 8.0, depthKm: 20 }, filtLat: 60 };
  const out = ctx.__api.run(band);
  assert.ok(out && !out.err, `the band run returned ${out && out.err}`);
  /* ⚠ THIS GRID IS DELIBERATELY SMALLER THAN THE ONE THAT SHIPS. What is being checked here is that a
     LATITUDE BAND is a domain this solver already answers correctly — the resolution the near scope
     actually uses is checked against js/tsunami.js in ⑤, where it costs nothing to assert. */
  assert.ok(band.lat1 - band.lat0 < 160, 'the domain really is a band rather than the whole sphere');
  assert.equal(out.nx, band.nx);
  /* first arrival along the source's own latitude: t = d / √(gh), to a few per cent */
  const c = Math.sqrt(9.80665 * depth);
  const row = Math.round((15 - band.lat0) / (band.lat1 - band.lat0) * band.ny);
  const col0 = Math.round(((0 + 180) % 360) / 360 * band.nx);
  const degPerCell = 360 / band.nx, mPerDeg = 111320 * Math.cos(15 * Math.PI / 180);
  /* ⚠ THE QUANTITY IS THE FRONT SPEED, NOT THE ABSOLUTE ARRIVAL TIME — and #R193 is why. The initial
     Okada sea surface is not a point: for Mw 8 it is still 3 cm several hundred kilometres out, which
     is over the 1 cm a DART buoy calls an arrival, so `tarr` there is the STATIC displacement being
     there already rather than a wave getting there. Measured on this very run: 5/8/12/16 cells give
     842/1684/2779/3958 s against 1357/2172/3257/4343 s — a CONSTANT ~490 s head start, i.e. an offset
     and not a wrong speed. Differencing removes it, and what is left is the physics this check is
     about: (16−8) cells in (3958−1684) s is 189 m/s against √(g·4000) = 198. */
  const tAt = (cells) => out.tarr[row * band.nx + ((col0 + cells) % band.nx)];
  const [near, far] = [8, 16];
  const t1 = tAt(near), t2 = tAt(far);
  assert.ok(t1 > 0 && t2 > t1, `the front did not reach both sample ranges (${t1}, ${t2})`);
  const speed = (far - near) * degPerCell * mPerDeg / (t2 - t1);
  const rel = Math.abs(speed - c) / c;
  assert.ok(rel < 0.12, `the front travels at ${speed.toFixed(0)} m/s against √(gh) = ${c.toFixed(0)} (${(100 * rel).toFixed(1)}%)`);
  /* and it is a FRONT: further away is later */
  assert.ok(tAt(12) > t1 && tAt(12) < t2, 'the arrival field is monotone in range');
});

/* ── ⑥ THE PLATE LAYER ────────────────────────────────────────────────────────────────────────── */
test('R204 ⑥ the plate name is the biggest a non-place label may be, and stays under a place name', async () => {
  const lp = rd('js/layer-packs.js');
  assert.match(lp, /'text-size':window\.IntMapLabelScale\.sub\(1\)/, 'the plate label asks for the top of the sub ladder');
  assert.match(lp, /'text-font':\['Noto Sans Bold'\]/, 'as a plain font stack (js/cesium-layers fontOf reads spec[0])');
  /* …and the plate label's own line no longer uses the ['literal', …] form that reached Cesium as a
     font family called "literal". (Other layers in this file still use it; that is their round.) */
  const plateLbl = /id:'eco-plates-lbl'[\s\S]*?\}\}\);/.exec(lp);
  assert.ok(plateLbl, 'the plate label layer is declared');
  assert.doesNotMatch(plateLbl[0], /\['literal',/, "the plate label carries no ['literal', …] stack");
  /* the relation #R198 owns, re-derived from js/label-scale.js rather than quoted */
  const ls = rd('js/label-scale.js');
  const REF = JSON.parse(/const REF=(\[\[.*?\]\]);/.exec(ls)[1].replace(/\s/g, ''));
  const ratio = Number(/const SUB_RATIO=([\d.]+);/.exec(ls)[1]);
  for (const [z, px] of REF) {
    const sub = Math.floor(px * ratio * 10) / 10;
    assert.ok(sub < px, `at z${z} the plate label would be ${sub}px against a place name's ${px}px`);
  }
});

test('R204 ⑥b the plate layer retries instead of waiting for an idle that may never come', () => {
  const lp = rd('js/layer-packs.js');
  assert.match(lp, /function retry\(fn\)\{ let n=0;/, 'there is a bounded poll');
  assert.match(lp, /else if\(which==='plates'\)\{ retry\(/, 'and the plate toggle uses it');
  assert.match(lp, /if\(which==='worldcover'\)\{ retry\(/, 'as does the land-cover toggle');
  /* the data is KEPT and installed idempotently — #R204 measured it being dropped 1 run in 3 */
  assert.match(lp, /let plateGJ=null, plateBD=null;/);
  assert.match(lp, /function installPlates\(\)/);
  assert.match(lp, /platesLoaded=true; platesLoading=false;\s*\n\s*installPlates\(\);/,
    'loadPlates installs what it fetched rather than dropping it when the source is late');
  /* ⚠ the ONE sanitizer (#R138). `escapeHtml` does not exist and threw silently. */
  assert.match(lp, /window\.IntMapSafe\.html\(String\(s\)\)/);
  assert.doesNotMatch(lp, /IntMapSafe\.escapeHtml/, 'IntMapSafe has no escapeHtml');
});

/* ── ⑦ TIME ZONES ─────────────────────────────────────────────────────────────────────────────── */
test('R204 ⑦ pressing an offset highlights every band on it', () => {
  const lp = rd('js/layer-packs.js');
  assert.match(lp, /properties:\{label:offLabel\(b\.z\)\+'\\n'\+zoneTime\(b\.z\),zone:b\.z\}/,
    'the label feature carries the offset it names');
  assert.match(lp, /id:'tzl-hl',type:'fill'/, 'there is a highlight fill');
  assert.match(lp, /filter:\['==',\['get','zone'\],-1e9\]/, 'selecting nothing by default');
  assert.match(lp, /\[\['tzl-time',true\],\['tzl-fill',false\]\]\.forEach/, 'and both the text and the polygon answer a click');
  /* ⚠ …with the LABEL winning. One press lands on both — the label is anchored over its zone's
     largest polygon, which at low zoom is often drawn across a neighbour — and the fill's handler
     ran last. Measured: pressing 「UTC+8」 highlighted zone 7. */
  assert.match(lp, /if\(e && e\.__tzTaken\) return;/, 'the fill stands down when the label took the click');
  assert.match(lp, /if\(fromLabel && e\) e\.__tzTaken=true;/);
  assert.ok(lp.indexOf("['tzl-time',true]") < lp.indexOf("['tzl-fill',false]"), 'the label is wired first');
  assert.match(lp, /setHighlight\(\(hlZone!=null&&\+z===hlZone\)\?null:z\)/, 'a second press clears it');
  assert.match(lp, /window\.IntMapTimeZones=\{ highlight:/, 'published so Atlas and the tests can ask');
});

/* ── ⑦b THE BUILD STAMP — the EXACT pin lives in the current round's file (#R202) ─────────────── */
test('R204 ⑦b both build stamps name this round', () => {
  const idx = rd('index.html');
  assert.match(idx, /window\.__imBuild='R204';/);
  assert.match(idx, /window\.INTMAP_BUILD='2026-08-09-R204';/);
});

/* ── ⑧ THE RIGHT-CLICK MENU ───────────────────────────────────────────────────────────────────── */
test('R204 ⑧ the context menu is grouped, in five languages, and nothing was dropped', () => {
  const tp = rd('js/tool-panel.js');
  const heads = [...tp.matchAll(/\{h:L\((.*?)\),head:true\}/g)];
  assert.ok(heads.length >= 3, `${heads.length} section headings`);
  for (const h of heads) assert.equal(h[1].split("','").length, 5, `heading ${h[1]} is not five languages`);
  /* every entry that existed before still exists — counted by its action target */
  for (const m of ['IntMapStreetView', 'addPin', 'ctxCopy', 'IntMapShare', 'openComposeModal', 'setTool',
    '_radiusFromPoint', 'IntMapWeather', 'RunwaySearch', 'IntMapLOS', 'IntMapIsochrone',
    'IntMapTerrainWater', 'IntMapSeismic', 'IntMapSun', 'clearAllPins', 'askHere'])
    assert.ok(tp.includes(m), `the context menu lost ${m}`);
  /* ⚠ the button index is its position, not indexOf — two identical labels would collide */
  assert.match(tp, /items\.map\(\(it,i\)=>\{/);
  assert.match(tp, /return `<button data-act="\$\{i\}">/);
  assert.doesNotMatch(tp, /data-act="\$\{items\.indexOf\(it\)\}"/);
});
