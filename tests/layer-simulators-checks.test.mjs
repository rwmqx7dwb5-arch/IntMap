/* ============================================================================
 *  The seismic, tsunami and insolation simulators
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r190-checks.test.mjs, tests/r204-checks.test.mjs, tests/r212-checks.test.mjs, tests/r215-checks.test.mjs, tests/r216-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r190-checks.test.mjs — 3 of its 10 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/seismic.js・js/tsunami.js・js/sims.js はパネル DOM・DEM・描画エンジンを前提に組み立てるファクトリで node では組み立てられない（津波ソルバは worker を vm で実行している） */
/* ============================================================================
 *  #R190 — static checks for the eight reports of this round
 * ----------------------------------------------------------------------------
 *  Same contract as every r1NN-checks file: these read the SOURCE and assert the
 *  structural decisions, so a later round cannot quietly undo one of them without
 *  a red test explaining what it was for. The numbers quoted in the assertions
 *  are the ones measured in the browser this round (see DEV-NOTES R190).
 * ==========================================================================*/

/* ── 7 · the seismic simulator ───────────────────────────────────────────────────────────────── */
test('R190 seismic: opacity, a compute button, LOS-style progress, and no borrowed draw panel', () => {
  const src = read('js/seismic.js');
  assert.match(src, /let fldOpacity=0\.85;/, 'the default fill is opaque enough to read the classes');
  assert.match(src, /function setFieldOpacity\(v\)\{/, 'and it is a control');
  assert.match(src, /class="sq-op"/, 'with a slider in the panel');
  /* (#R237) the run button's class is now BUILT (`_runBtnClass()`), because its two states are a
     class rather than a cssText — so the claim is that the class exists, wherever it is written. */
  assert.match(src, /sq-run/, 'the compute button');
  assert.match(src, /function markStale\(\)\{/, 'parameters mark the field stale instead of rebuilding');
  /* (#R196) …and it now also pushes the changed event to the propagation model next door, which is
     the whole of 「津波シミュレーターも、初期の地震しか対応していない」. The three things this test
     is about — draw, warm, mark stale — are unchanged and still in that order. */
  assert.match(src, /function touch\(\)\{ draw\(\); warmEpi\(\); markStale\(\); syncTsunamiSource\(\); \}/, '…for the panel’s own spinners');
  assert.match(src, /class="sq-progb"/, 'the LOS-style bar');
  assert.match(src, /fldPct\+'%'/, 'with a real percentage');
  /* (#R221) the call gained the tile-grid warm list, a deadline that scales with the tile count, and
     the PIN that stops the field evicting its own tiles. The progress callback — which is what this
     assertion is about — is unchanged. */
  /* ⚠ (#R671) THE PIN IS A LEASE NOW, so the fifth argument is the build's own token rather than
     the literal `true`. What this line asserts — the progress callback is the warm-up's own, and the
     call asks for a pin — is unchanged; only the spelling it used to fix has moved. */
  assert.match(src, /await warmDEMTiles\(warm,z,[^,]+,\(f\)=>prog\(6\+34\*\(\+f\|\|0\)\),[^)]+\)/,
    'driven by the DEM warm’s own progress, with a hold');
  /* the shared draw tool is borrowed without its panel.
     ⚠ (#R207) THIS PINNED THE CALL SITE'S SHAPE, NOT THE FACT. #R207 gave the same call a second
     option (`onFinish`, so the drawn loop becomes the rupture without a second button press) and
     therefore passes an options OBJECT rather than an object literal — the behaviour named here,
     "the rupture draw borrows the tool silently", is unchanged. Pin the option, not the expression. */
  assert.match(src, /silent:true/, 'the rupture draw hides the draw tool’s panel');
  assert.match(src, /DT\.start\(null,\s*opt\s*\)|DT\.start\(null,\{[^}]*silent:true/,
    '…and it is the shared tool that is started, not a private reimplementation');
  const mt = read('js/map-tools.js');
  assert.match(mt, /function renderPanel\(\)\{ const p=ensurePanel\(\); if\(silent\)\{ p\.style\.display='none'; return; \}/,
    '…which the tool itself implements, so nothing reaches into its DOM');
  assert.match(mt, /exit\(\)\{ state='off'; silent=false;/, 'and an ordinary Draw is unaffected afterwards');
});

test('R190 seismic: the field reaches the end of the lowest class and declares its extrapolation', () => {
  const src = read('js/seismic.js');
  assert.match(src, /const MMI_CALIB_KM=1000;/, 'where the regional law is calibrated');
  /* (#R191) 1,500 km is still the number this test was written about — it is the range the DEM can
     support, and #R190's measurement (3,000 km ⇒ 71 % of cells with no elevation at all) is exactly
     why. It is now called MMI_TERRAIN_KM, because #R191 separated "how far the terrain-driven field
     goes" from "where the lowest class ends" — the second was what the report was about, and it is
     MMI_MAX_KM. The rest of this test is unchanged and still passes. */
  assert.match(src, /const MMI_TERRAIN_KM=1500;/, 'and where the terrain-driven paint stops (measured: 3,000 km was 71 % no-DEM)');
  /* ⚠ (#R247) `rEdge` → `rEdgeSurf`. What this line pins — «the fine field is bounded by the terrain
     statement, not by the class» — is unchanged; the OTHER operand is. `rEdge` is read off the
     profile's own radius grid, which is the distance srcDistM() PRODUCES, and every use of it as a
     limit on a SURFACE distance was short by the implied rupture radius (140 km at M9.1). */
  assert.match(src, /const rFine=Math\.min\(rEdgeSurf,MMI_TERRAIN_KM\);/, 'the fine field is bounded by it');
  assert.match(src, /const inRange=rKm<=MMI_CALIB_KM;/,
    'the TABLE still refuses to print an intensity outside the calibrated range');
  assert.match(src, /if\(km>MMI_CALIB_KM\) beyondCalib\+\+;/, 'and the painted cells beyond it are counted');
  /* ⚠ the RINGS are quoted numbers, not a labelled picture, so they stay inside the calibrated range.
     Splitting the two constants moved them by accident; tests/r176 ⑤ caught it at 1,129 km. */
  assert.match(src, /const maxDeg=MMI_CALIB_KM\/\(RE\*D\);/, 'mmiRings stays inside the calibrated range');
  /* the readout cannot speak a scale the field was not painted in */
  /* (#R192) …and the a0 the JMA scale is computed from, beside it: the argument is unchanged (store
     the QUANTITY, not an intensity), it just needs two quantities now that the two scales read
     different bands of the same motion. */
  assert.match(src, /pgvArr=new Float32Array\(N\*N\), a0Arr=new Float32Array\(N\*N\)/,
    'the field stores the quantities, not the intensity of whichever scale was active');
  assert.match(src, /pgvAt\(lo,la\)\{/, 'and the readout converts it');
  assert.match(src, /function mmiOf\(pgv\)\{/, 'one MMI conversion, not two copies that can drift');
  const ro = read('js/map-readout.js');
  assert.match(ro, /S\.intensityAt\(HOST\._crLng,HOST\._crLat\)/,
    'the always-on corner readout asks the simulator, never a second computation');
  /* ⚠ (#R311) THE TITLE IS THE INVARIANT, AND IT STILL HOLDS. This used to quote the innerHTML
     the readout built; that readout is now assembled once and updated in place (the string was
     rebuilt on every mousemove, 15,000 nodes created and destroyed per 3,000 renders). What has
     to stay true is what the line above says: the COLOUR comes from the simulator's own value,
     not from a second table here — so that is what is asked. */
  assert.match(ro, /cr-seis/, 'the chip is still the .cr-seis one the stylesheet knows');
  assert.match(ro, /\.style\.color\s*=\s*q\.col/, 'and shows it in the class colour the simulator gave it');
});

test('R190 seismic: frequency-dependent Q, a slope measured at the DEM’s own spacing, tsunami hand-off', () => {
  const src = read('js/seismic.js');
  /* Q(f) = Q₀·f^η — Raoof, Herrmann & Malagnini 1999, and both numbers stay visible */
  assert.match(src, /let QS0=180, QETA=0\.45;/, 'the published southern-California crustal Q');
  assert.match(src, /QS0\*Math\.pow\(Math\.max\(0\.01,f\),QETA\)/, 'used as a frequency-dependent Q');
  assert.doesNotMatch(src, /QS=300/, 'the constant Q is gone');
  assert.match(src, /class="sq-q0[ "']/, 'and it is adjustable, like the stress drop');   /* (#R237) see .sq-spd */
  /* the Vs30 slope proxy stops inventing a 900 m gradient out of kilometre pixels */
  assert.match(src, /const demSpacingM=40075017\*Math\.max\(0\.05,cosC\)\/\(Math\.pow\(2,z\)\*256\);/,
    'the DEM’s real sample spacing');
  assert.match(src, /const dsM=Math\.max\(900,demSpacingM\*1\.25\), slopeUsable=demSpacingM<=2000;/,
    'the baseline follows it, and past 2 km the proxy is not used at all');
  assert.match(src, /else if\(!slopeUsable\)\{ coarse\+\+;/, '…and those cells are counted, not faked');
  /* the tsunami hand-off screens on the operational conditions and hands over a derived height */
  assert.match(src, /function tsunamiCase\(\)\{/, 'the screening');
  assert.match(src, /if\(!\(M>=6\.5\)\|\|!\(depthKm<=100\)\) return null;/, 'M≥6.5 and ≤100 km');
  assert.match(src, /if\(e0==null\|\|e0>0\) return null;/, 'and under the sea, read from the DEM');
  assert.match(src, /Math\.pow\(10,0\.5\*M-3\.3\)/, 'wave height from the Abe tsunami-magnitude relation');
  /* ⚠ (#R197) this used to assert the hand-off went to js/sims.js's `tsunami` hazard. That hazard has
     been removed — 「災害シミュレータからは津波シミュレータを削除しろ」 — and the hand-off now goes to the
     propagation model and nowhere else. The screening above is unchanged and is what this test is for. */
  assert.match(src, /const T=window\.IntMapTsunami; if\(!T\|\|!T\.open\) return false;/,
    'handed to the propagation model, and to nothing else');
  /* ⚠ the screening asks the DEM, and render() asks the screening — so it has to survive a tile that
     has not arrived yet. Measured before this: an offshore M9.0 screened correctly through the API
     and the BUTTON was never drawn, because render() had already asked and got "unknown". */
  assert.match(src, /function _epiSeaDepth\(\)\{/, 'the depth is asked for at every zoom that might be warm');
  assert.match(src, /if\(fld&&fld\.z\) zs\.push\(fld\.z\);/, 'the field’s own level first — its warm grid covers the epicentre');
  assert.match(src, /function warmEpi\(\)\{/, 'and one tile is warmed so the answer exists before it is needed');
  /* ⚠ measured on production: the button rendered and a screening call a moment later returned null,
     because the DEM LRU had evicted that tile while the field build warmed a thousand others. */
  assert.match(src, /if\(_epiElev&&_epiElev\.k===k\) return _epiElev\.v;/, 'a known sea depth is remembered…');
  assert.match(src, /\{ _epiElev=\{k,v:e\}; return e; \}/, '…keyed on the epicentre, so moving it re-reads');
  assert.doesNotMatch(src, /_epiElev=\{k,v:null\}/, 'and "not known yet" is never cached as an answer');
  assert.match(src, /_tsuShown=!!tsunamiCase\(\);/, 'render records what it drew…');
  assert.match(src, /if\(opened&&_t!==_tsuShown\)\{ _tsuShown=_t; render\(\); \}/,
    '…so the panel re-renders exactly once, when the availability flips');
  /* ⚠ (#R296) the second half of this assertion named `IntMapDisaster.open`, which took a hazard
     with the location so a hand-off could not run under the PREVIOUS hazard. 「災害シミュレーターは
     4つのうち、放射性物質拡散シミュレーションを残し全削除」 removed that module, so there is no second
     panel for a hand-off to land in the wrong state of — what is left to assert is that nothing in
     js/sims.js reaches for it, which is the same defect stated where it can still occur. */
  const sims = read('js/sims.js');
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');   /* (#R296) 21st round: a check for a removed name must not match the comment that explains the removal */
  assert.doesNotMatch(code(sims), /IntMapDisaster/, 'nothing hands off to a disaster panel any more');
});
}

/* ══════════ from tests/r204-checks.test.mjs — 4 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/seismic.js・js/tsunami.js・js/sims.js はパネル DOM・DEM・描画エンジンを前提に組み立てるファクトリで node では組み立てられない（津波ソルバは worker を vm で実行している） */
/* ============================================================================
 *  IntMap · R204 source-level checks
 * ----------------------------------------------------------------------------
 *  Node tests, no browser. Every assertion here is DERIVED from the source or RUN against it —
 *  #R203 lost two of its own pins by writing values (448) and file names (r203.spec.js) that the
 *  next round in the SAME direction had to change, so this file states relations and re-derives
 *  numbers from the files that own them.
 * ==========================================================================*/
const rd = read;

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
  /* (#R245) hoisted to FAR_N so buildField can snap its box onto this grid — same numbers
     ⚠ (#R668) the arm is chosen by the DEVICE now (js/mem-budget.js), not by a width media query;
     the numbers did not move, so the branches are what is read here. */
  const far = /const FAR_N=\(\)=>\((?:_phoneDev\(\)|window\.IntMapMemBudget\.deviceIsPhone\([^()]*\))\?(\d+):(\d+)\);/.exec(s);
  assert.ok(far, 'FAR_N is still a two-branch phone/desktop constant decided by the device');
  assert.ok(Number(far[2]) >= 1024 && Number(far[1]) >= 512, 'the far field is no coarser than #R203');
});

/* ── ⑤ THE TSUNAMI'S NEAR-SOURCE DOMAIN ───────────────────────────────────────────────────────
   Deferred in #R202 and #R203 on the grounds that a nested grid means a non-periodic solver. It does
   not, if the nest is a latitude BAND at the full circle — so the check that matters is that the
   solver is untouched and that the band's numbers are what the page claims. */
/* ⚠ (#R668) the two near-source constants kept their numbers and changed their PREDICATE: the arm a
   device takes is a question about the device (js/mem-budget.js `deviceIsPhone`), not about the
   window's width — the 768 px media query read an iPhone in landscape as a desktop and started the
   20 cells/° run on it. What these tests own is the pair of numbers, so the branches are what is
   read and the device predicate is required but not spelled out. */
const NEAR = (name) => new RegExp('const ' + name
  + "=\\(\\)=>\\((?:_phoneDev\\(\\)|window\\.IntMapMemBudget\\.deviceIsPhone\\([^()]*\\))\\?(\\d+):(\\d+)\\)");

test('R204 ⑤ the near-source scope is a finer grid on the SAME periodic solver', () => {
  const t = rd('js/tsunami.js'), w = rd('src/tsunami-worker.js');
  const cpd = NEAR('NEAR_CPD').exec(t);
  const band = NEAR('NEAR_BAND').exec(t);
  assert.ok(cpd && band,
    'the band and its resolution are declared, each as a two-branch phone/desktop constant '
    + 'decided by the device (_phoneDev()/IntMapMemBudget.deviceIsPhone)');
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
  const mCpd = NEAR('NEAR_CPD').exec(t), mBand = NEAR('NEAR_BAND').exec(t);
  assert.ok(mCpd && mBand, 'the band and its resolution are declared as two-branch device constants');
  const cpd = Number(mCpd[2]);
  const band = Number(mBand[2]);
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
}

/* ══════════ from tests/r212-checks.test.mjs — 3 of its 15 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/seismic.js・js/tsunami.js・js/sims.js はパネル DOM・DEM・描画エンジンを前提に組み立てるファクトリで node では組み立てられない（津波ソルバは worker を vm で実行している） */
/* (#R212) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

/* ── 8. the shadow slider is the shadow's alpha ────────────────────────────────────────────────── */
test('R212 ⑧: 100 % shadow is opaque — the alpha is baked, not scaled down', () => {
  const s = read('js/insolation.js');
  assert.match(s, /const a=Math\.round\(255\*Math\.max\(0\.05,Math\.min\(1,_shadowOp\)\)\)/,
    'the PNG alpha IS the requested opacity');
  assert.ok(!/_shadowOp\/0\.30/.test(s), 'the old "scale down from 0.30" mapping is gone');
  assert.match(s, /function setShadowOpacity\(v\)\{[\s\S]{0,220}paint\(_last\.g,_last\.mask\)/,
    'moving the slider re-bakes the last mask rather than recomputing the analysis');
  const sims = read('js/sims.js');
  assert.match(sims, /Math\.max\(0\.05,Math\.min\(1,\+v\|\|0\.30\)\)/, 'the panel’s own ceiling is 1, not 0.95');
  assert.match(sims, /class="sun-op" min="5" max="100"/, 'and the slider can reach it');
  assert.ok(!/background:var\(--popup-bg,#141414\)/.test(sims), 'the panels are opaque (--card-bg), not see-through');
});

/* ── 9. the earthquake panel: one epicentre control, and land below sea level is land ───────────── */
test('R212 ⑨: one epicenter control, and sub-sea-level LAND is painted', () => {
  const s = read('js/seismic.js');
  assert.ok(!/class="sq-pick"/.test(s), 'the separate "place the epicenter" button is gone');
  assert.ok(!/const PICKBTN=/.test(s), 'and so is the style that only it used');
  /* ⚠ (#R218) the segment gained an OFF state — 「もう一度クリックしたら選択解除されるように」 — so the
     handler is now a toggle. The claim this line makes is unchanged and still checked: pressing it ON
     both sets the click mode AND arms the pick, in that order, from the one control. */
  assert.match(s.replace(/\/\*[\s\S]*?\*\//g, ''), /\.sq-cm-epi'\)[\s\S]{0,400}setClickMode\('epi'\);\s*startPick\(\)/,
    'the one segment both sets the click mode and arms the pick');
  assert.match(s, /if\(clickMode==='epi'\) setClickMode\('none'\)/, '…and a second press turns it off');
  /* the land test is the MASK plus a depth bound, not the sign of the elevation */
  /* (#R215) same claim, finer answer — see js/coast-mask.js and tests/r215 ②b */
  assert.match(s, /landAt\(k,lo,la\)===true&&e0>-440/,
    'a cell below zero is land when the land answer says so and it is above the lowest dry land on Earth');
  /* a drawn rupture defines the source but does not start the solve */
  assert.match(s, /function _fCapture[\s\S]{0,400}render\(\); touch\(\); return true;/,
    'capturing the rupture marks the field stale — the ▶ button runs it');
});

/* ── 10. the tsunami takes the drawn rupture ───────────────────────────────────────────────────── */
test('R212 ⑩: a free-drawn rupture reaches the tsunami model and defines its fault plane', () => {
  const sq = read('js/seismic.js');
  assert.match(sq, /T\.follow\(\{[^}]*rupture:/, 'the seismic panel pushes the ring next door');
  const ts = read('js/tsunami.js');
  assert.match(ts, /const rupKey=/, 'the rupture is part of the source identity');
  assert.match(ts, /srcKey=\(\)=>[^;]*rupKey\(rupture\)/, 'so redrawing it is not mistaken for the same event');
  const w = read('src/tsunami-worker.js');
  assert.match(w, /function rupturePlane\(/);
  assert.match(w, /const drawn = rupturePlane\(m\.src\.rupture, srcLat\)/);
  assert.match(w, /const strike = drawn \? drawn\.strike/, 'the strike comes from the drawing when there is one');
  assert.match(w, /MU \* L \* W \* slip/, 'and the moment is μ·A·D̄, the same one the panel reports');
});
}

/* ══════════ from tests/r215-checks.test.mjs — 3 of its 19 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/seismic.js・js/tsunami.js・js/sims.js はパネル DOM・DEM・描画エンジンを前提に組み立てるファクトリで node では組み立てられない（津波ソルバは worker を vm で実行している） */
/* (#R215) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

/* ═══ ② THE COASTLINE IS DECIDED AT THE CALLER'S RESOLUTION ══════════════════════════════════
   「海抜0m以下の土地は…（なんか、海外線の境界部分が雑な処理になっている。大きなタイルでごまかすな。）」*/
test('R215 ②a: a fine coast mask exists, is loaded, and holds no geometry of its own', () => {
  assert.ok(existsSync(join(ROOT, 'js/coast-mask.js')), 'js/coast-mask.js exists');
  const cm = read('js/coast-mask.js');
  assert.match(read('src/main.js'), /coast-mask\.js/, 'it is imported by the bundle');
  assert.match(cm, /window\.countryGeo/, 'it reads the app’s own country outline rather than fetching a second one');
  assert.match(cm, /rasterize/, 'it answers a GRID, which is the whole point of it');
  /* it must not become a second land/sea authority: the bundled point mask is still the fallback */
  assert.match(cm, /IntMapLandMask/, 'the 19.5 km bundled mask remains the fallback, not a rival');
});

test('R215 ②b: the seismic fine field decides land through the grid answer, not through the 19.5 km mask', () => {
  const s = read('js/seismic.js');
  const i = s.indexOf('const landAt=');
  assert.ok(i > 0, 'the field has one land predicate');
  /* the below-sea-level branch — the one the report is about — must go through it */
  const below = s.slice(s.indexOf('else if(e0<=0){'), s.indexOf('else if(e0<=0){') + 260);
  assert.match(below, /landAt\(/, 'a cell below zero asks the fine answer');
  assert.equal(/landMask&&landMask\.isLand\(lo,la\)===true/.test(below), false,
    'it no longer reads the 19.5 km majority raster directly');
  assert.match(s, /coastSource:\s*coastSrc/, 'and the field DECLARES which coastline answered (#R185: no silent caps)');
});

/* ═══ ⑪ THE SIMULATOR WINDOWS ACTUALLY MINIMISE ══════════════════════════════════════════════
   「地震・津波シミュレータウィンドウは最小化可能に」 — #R210 added the buttons and both were no-ops:
   the inline style said `display:none;` when minimised and then unconditionally `…;display:flex;…`,
   so CSS's last-declaration-wins put the body straight back. MEASURED before the fix: the glyph
   flipped to ▢ and getComputedStyle(.sq-body).display stayed `flex`. */
for (const [file, cls] of [['js/seismic.js', 'sq-body'], ['js/tsunami.js', 'tsu-body']]) {
  test(`R215 ⑪: ${cls} declares display ONCE, and minimised drives it`, () => {
    const src = read(file);
    const i = src.indexOf(`class="${cls}" style=`);
    assert.ok(i > 0, `${cls} is built with an inline style`);
    /* the whole style string, up to the closing quote of the attribute */
    const style = src.slice(i, src.indexOf('">', i) + 2);
    const decls = (style.match(/display:/g) || []).length;
    assert.equal(decls, 1, `two display declarations in one style is how the minimise button became a no-op (found ${decls})`);
    assert.match(style, /display:'\+\(minimised\?'none':'flex'\)/,
      'and the one declaration is the state — not a prefix that a later default overrides');
  });
}
}

/* ══════════ from tests/r216-checks.test.mjs — 2 of its 23 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/seismic.js・js/tsunami.js・js/sims.js はパネル DOM・DEM・描画エンジンを前提に組み立てるファクトリで node では組み立てられない（津波ソルバは worker を vm で実行している） */
/* (#R216) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')
  : readFileSync(new URL('../' + p, import.meta.url), 'utf8'));

/* ── ⑬ the intensity field does not fall back to rings ──────────────────────────────── */
test('#R216 ⑬ seismic raises the DEM zoom instead of discarding the site term', () => {
  const s = read('js/seismic.js');
  assert.match(s, /while\(z<12&&\(40075017\*Math\.max\(0\.05,cosC\)\/\(Math\.pow\(2,z\)\*256\)\)>2000/,
    'the zoom is not raised to keep the slope baseline usable');
  /* (#R221) still bounded, now a LOOP rather than one pass: with the tile pin in place a retry KEEPS
     what it recovers, which is what makes retrying worth doing at all — before, the second pass
     re-fetched tiles the first had lost and lost them again to the same cache ceiling. */
  assert.match(s, /pass<2 && snap && snap\.missing>Math\.max\(4,snap\.want\*0\.08\)/,
    'a mostly-missing DEM is not retried');
});
test('#R216 ⑬ …and a drawn rupture is screened over its AREA, not at one point', () => {
  const s = read('js/seismic.js');
  assert.match(s, /function _rupSeaDepth\(\)/, 'the rupture is not sampled');
  assert.match(s, /function srcPoint\(\)/, 'the model is not centred on the wet part');
  assert.match(s, /const rs=_rupSeaDepth\(\);/, 'tsunamiCase still asks a single point');
  assert.match(s, /rs\.frac>=0\.25/, 'there is no submarine-fraction test');
  /* the point handed to the tsunami model is the one srcPoint decides */
  assert.match(s, /T\.open\(\{ lng:P\[0\], lat:P\[1\]/, 'openTsunami still hands over the raw epicentre');
  assert.match(s, /T\.follow\(\{ lng:P\[0\], lat:P\[1\]/, 'follow still hands over the raw epicentre');
});
}
