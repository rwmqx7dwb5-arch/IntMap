/* ============================================================================
 *  #R265 — the round's own contracts, checked in Node
 * ----------------------------------------------------------------------------
 *  A hole in the published elevation data is not ground · water takes time to get there · the
 *  data-centre layer stops answering about the view.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const load = (p) => { const w = {}; new Function('window', read(p))(w); return w; };

/* ── ① A VOID TILE IS NOT −32,768 m OF GROUND ────────────────────────────────────────────────────
   The fifth report of 「直線で地形を完全無視するクソ区間」, and the first four rounds all looked at the
   walk. MEASURED: terrarium/14/9101/5896.png loads, is fully opaque, and every one of its 65,536
   pixels is RGB(0,0,0) — which the decode turned into −32,768 m. 14 of 49 z14 tiles around the Sava
   floodplain are like that; 0 of 49 at Lake Biwa, Death Valley, W-Siberia, Tokyo Bay and Geneva.
   ⚠ THE THRESHOLD IS ASSERTED AS A RELATION, NOT AS A LITERAL (#R264's lesson): it has to sit below
   anything the Earth can be and above what the encoding can express, or it either passes fiction or
   rejects the deep ocean. */
test('R265 ① the DEM decode rejects the terrarium void, on a physical threshold', () => {
  const s = read('js/map-readout.js');
  const m = s.match(/const DEM_NODATA_BELOW=(-?\d+);/);
  assert.ok(m, 'the floor is one named constant');
  const floor = Number(m[1]);
  const CHALLENGER_DEEP = -10935;      // the deepest point on Earth
  const ENCODING_MIN = -32768;         // terrarium's own minimum, i.e. the void itself
  assert.ok(floor < CHALLENGER_DEEP, `the floor (${floor}) must be below the Challenger Deep`);
  assert.ok(floor > ENCODING_MIN, `…and above the void it rejects (${ENCODING_MIN})`);
  /* the decode marks them, rather than passing the number through */
  assert.match(s, /if\(d\[o\+3\]===0\|\|!\(v>DEM_NODATA_BELOW\)\)\{ out\[i\]=NaN; voids\+\+; \}/,
    'a void pixel and an untouched canvas pixel are both no-data');
  /* nothing decodes without the guard any more */
  const decodes = s.match(/\(d\[o\]\*256\+d\[o\+1\]\+d\[o\+2\]\/256\)-32768/g) || [];
  assert.equal(decodes.length, 1, 'there is exactly one terrarium decode, and it is the guarded one');
});

/* ── ② …AND A HOLE IS NOT AN ENDING: the sampler steps down the pyramid ──────────────────────────
   The same place reads 85.61 m at z12 where z14 is void, so the answer is coarser data, not none. */
test('R265 ② a no-data sample falls back to the parent tile, bounded, and counts what it cannot fill', () => {
  const s = read('js/map-readout.js');
  assert.match(s, /if\(raw!==raw\)\{[^]*?return demElevAt\(lng,lat,onReady,z-1,st\+1\);/,
    'a NaN sample is retried one level down');
  assert.match(s, /_demVoid\.unfilled\+\+; return null;/, 'and a hole no level can answer is counted');
  const steps = Number((s.match(/const DEM_VOID_STEPS=(\d+);/) || [])[1]);
  const minZ = Number((s.match(/const DEM_VOID_MIN_Z=(\d+);/) || [])[1]);
  assert.ok(steps >= 1 && steps <= 8, 'the fallback is bounded');
  assert.ok(minZ >= 3, 'and never goes below a level the bucket has');
  /* the parent is requested as soon as a holed tile decodes, so the fallback has something to read */
  assert.match(s, /if\(r&&r\.voids&&z>DEM_VOID_MIN_Z\)\{ try\{ demElevAt\(lng,lat,onReady,z-1,0\); \}catch\(_\)\{\} \}/);
  /* one void corner must not poison a bilinear blend — that is where Lake Biwa's −7,800 m came from */
  assert.match(s, /if\(!\(wsum>0\)\) return demElevAt\(lng,lat,null,z\);/, 'demElevBilinear renormalises');
  assert.match(s, /if\(a===a&&b===b&&c===c&&e===e\) return \(a\*tx1\+b\*tx\)\*ty1\+\(c\*tx1\+e\*tx\)\*ty;/,
    'and the snapshot row sampler is the ORIGINAL expression when there is no hole');
  /* it is reportable rather than silent (#R185) */
  assert.match(s, /function demVoidStats\(\)\{ return Object\.assign\(\{\},_demVoid\); \}/);
  assert.match(read('js/app-body.js'), /get demVoidStats\(\)\{ return demVoidStats; \}/);
});

/* ── ③ THE SHALLOW-WATER SOLVER IS THE PUBLISHED ONE, AND IT REPRODUCES NORMAL DEPTH ────────────
   「経過時間に対する水の動きが、現実と乖離しすぎ。リアルなモデルにしろ。」 The one closed-form answer a
   2-D flood model must reproduce is Manning's normal depth for a uniform flow down a plane. If this
   drifts, the front speeds and the arrival times drift with it and nothing else would say so. */
test('R265 ③ uniform flow down a plane converges on Manning normal depth', () => {
  const WD = load('js/water-dynamics.js').IntMapWaterDynamics;
  const n = WD.MANNING_N, q = 2.0;
  for (const S0 of [0.0005, 0.001, 0.005, 0.02]) {
    const NX = 6, NY = 140, dx = 20;
    const z = new Float32Array(NX * NY);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) z[j * NX + i] = (NY - 1 - j) * dx * S0;
    const S = WD.create(z, NX, NY, dx);
    let t = 0;
    while (t < 40000) { const dt = Math.min(S.dtFor(), 5); for (let i = 0; i < NX; i++) S.h[i] += q * dt / dx; S.step(dt); t += dt; }
    let hh = 0, c = 0;
    for (let j = 40; j < 120; j++) { hh += S.h[j * NX + 3]; c++; }
    hh /= c;
    const hn = Math.pow(q * n / Math.sqrt(S0), 0.6);
    assert.ok(Math.abs(hh / hn - 1) < 0.02, `S0=${S0}: modelled ${hh.toFixed(4)} m vs Manning ${hn.toFixed(4)} m`);
  }
});

/* ── ④ …AND IT IS WELL-BALANCED, CONSERVATIVE, AND CANNOT GO NEGATIVE ───────────────────────────
   A lake at rest that creeps is the classic failure of an unbalanced scheme, and it would look
   exactly like «the water moves for no reason» — the complaint this round is answering. */
test('R265 ④ still water stays still, and mass is conserved', () => {
  const WD = load('js/water-dynamics.js').IntMapWaterDynamics;
  const NX = 60, NY = 60, dx = 50;
  const z = new Float32Array(NX * NY);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    z[j * NX + i] = 100 + Math.max(0, Math.hypot(i - 30, j - 30) - 12) * 4;
  }
  const S = WD.create(z, NX, NY, dx);
  for (let k = 0; k < NX * NY; k++) if (z[k] < 120) S.h[k] = 120 - z[k];
  const v0 = S.stats().storedM3;
  for (let n = 0; n < 400; n++) S.step(S.dtFor());
  const st = S.stats();
  let maxq = 0;
  for (let k = 0; k < NX * NY; k++) maxq = Math.max(maxq, Math.abs(S.qx[k]), Math.abs(S.qy[k]));
  assert.equal(maxq, 0, 'a lake at rest generates no flux at all');
  assert.equal(st.outM3, 0, 'and nothing leaves');
  assert.ok(Math.abs(st.storedM3 - v0) < v0 * 1e-6, 'the volume is the volume');

  /* a release on rough ground: everything that came in is either standing or accounted as having left */
  const NX2 = 120, NY2 = 120, dx2 = 40;
  const z2 = new Float32Array(NX2 * NY2);
  for (let j = 0; j < NY2; j++) for (let i = 0; i < NX2; i++) z2[j * NX2 + i] = 200 - j * 0.6 + 8 * Math.sin(i / 7) * Math.cos(j / 5);
  const T = WD.create(z2, NX2, NY2, dx2);
  const placed = T.pool(30 * NX2 + 60, 5e6);
  assert.ok(Math.abs(placed / 5e6 - 1) < 1e-6, `a placed volume is the volume asked for (${placed})`);
  let t = 0; while (t < 7200) t += T.advance(600, 4000).simS;
  const s2 = T.stats();
  /* ⚠ `storedM3` is what is DRAWN (deeper than 2 cm) — the conserved quantity is `totalM3`. Asking
     the drawn number reads as a 0.33 % leak that is really a sheet of water thinner than the ramp
     shows, which is exactly the shape of instrument error this project keeps paying for. */
  assert.ok(Math.abs((s2.totalM3 + s2.outM3) - placed) < placed * 1e-6,
    `mass is conserved through the run (${((s2.totalM3 + s2.outM3 - placed) / placed).toExponential(2)})`);
  for (let k = 0; k < NX2 * NY2; k++) assert.ok(T.h[k] >= 0, 'no cell is ever negative');
});

/* ── ⑤ A FLOOD WAVE TAKES THE TIME A FLOOD WAVE TAKES ───────────────────────────────────────────
   This is the round's whole subject stated as a number: with a steady-state solver the front was at
   the far end at t = 0⁺, so the assertion is that it is NOT — and that the speed it does travel at
   is the physical one (between the water's own velocity and the kinematic celerity 5/3·v). */
test('R265 ⑤ the front advances at the kinematic celerity, not instantly', () => {
  const WD = load('js/water-dynamics.js').IntMapWaterDynamics;
  const NX = 8, NY = 300, dx = 50, S0 = 0.002, q = 3.0;
  const z = new Float32Array(NX * NY);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) z[j * NX + i] = (NY - 1 - j) * dx * S0;
  const S = WD.create(z, NX, NY, dx);
  let t = 0, arrived = null;
  while (t < 12 * 3600 && arrived == null) {
    const dt = Math.min(S.dtFor(), 8);
    for (let i = 0; i < NX; i++) S.h[i] += q * dt / dx;
    S.step(dt); t += dt;
    if (S.h[(NY - 1) * NX + 4] > 0.05) arrived = t;
  }
  const km = (NY - 1) * dx / 1000;
  assert.ok(arrived != null, 'the front does reach the far end');
  const v = km * 1000 / arrived;
  const hn = Math.pow(q * WD.MANNING_N / Math.sqrt(S0), 0.6), vn = q / hn;
  assert.ok(arrived > 1800, `${km} km cannot be crossed in ${Math.round(arrived)} s — that is the defect`);
  assert.ok(v > vn * 0.5 && v < vn * 5 / 3 * 1.5,
    `front ${v.toFixed(2)} m/s against normal-depth ${vn.toFixed(2)} m/s and celerity ${(vn * 5 / 3).toFixed(2)} m/s`);
});

/* ── ⑥ THE CONSTANTS ARE THE PUBLISHED ONES, AND THERE IS ONLY ONE FRICTION LAW ─────────────────
   #R189 sized the traced channel from v = 40·√S, a Chézy-like bulk factor with no source, while the
   grid now runs on Manning. Two friction laws for one tool is #R255's defect exactly. */
test('R265 ⑥ one Manning n for the grid and for the traced course, and no Chézy factor left', () => {
  const WD = load('js/water-dynamics.js').IntMapWaterDynamics;
  /* Chow (1959) Table 5-6: natural streams 0.025–0.045, floodplain pasture 0.030–0.035 */
  assert.ok(WD.MANNING_N >= 0.025 && WD.MANNING_N <= 0.045, 'n is inside the published band');
  assert.ok(WD.CFL > 0 && WD.CFL <= 1, 'the CFL coefficient is a fraction (Bates 2010 §2.3)');
  const w = read('js/water-dynamics.js');
  assert.match(w, /Bates, Horritt &\s+\*?\s*Fewtrell \(2010\)/, 'the scheme names its source');
  assert.match(w, /de Almeida, Bates, Freer & Souvignet \(2012\)/, 'and so does the stabilisation');
  assert.match(w, /const THETA=0\.7;/);
  const t = read('js/terrain-water.js');
  /* ⚠ THE IDENTIFIER, ANYWHERE — including in a comment. A note that spells the old name out is an
     occurrence, and js/terrain-water.js says so where the constant used to be declared. */
  assert.doesNotMatch(t, /CHEZY_K/, 'the unsourced bulk-speed factor is gone, name and all');
  assert.match(t, /const NM=\(window\.IntMapWaterDynamics&&window\.IntMapWaterDynamics\.MANNING_N\)\|\|0\.035;/,
    'the course reads the grid\'s own n');
  /* the manning velocity is written down once */
  assert.equal((w.match(/function manningV\(/g) || []).length, 1);
});

/* ── ⑦ THE CLOCK DRIVES THE WATER ───────────────────────────────────────────────────────────────
   The tick used to re-solve the steady state; now it integrates. And the panel's own description of
   the model has to stop saying the opposite (「波の到達速度は扱いません」). */
test('R265 ⑦ the pour tick advances the shallow-water state, and ⏭ is the steady state', () => {
  const s = read('js/terrain-water.js');
  assert.match(s, /import '\.\/water-dynamics\.js';/, 'the solver is a real dependency of this chunk');
  assert.match(s, /stepSim\(dt\*timeScale\);/, 'the transport advances the model by the simulated interval');
  assert.doesNotMatch(s, /solve\(\);\s+\/\* redraws and re-reports/,
    'and no longer re-solves the steady state on every tick');
  /* ⚠ ONE CLOCK. The elapsed time and the taps' delivery both follow what the model MANAGED to
     integrate, not what the tick asked for — two clocks for one simulation is this round's own
     defect in miniature (measured: the footer read «2.0 h» while the details read «35 min»). */
  assert.match(s, /pourSimS\+=r\.simS;/, "the clock is the water's clock");
  assert.match(s, /if\(x\.cont\) x\.m3\+=Math\.max\(0,\+x\.rate\|\|pourRate\)\*r\.simS;/,
    '…and so is what the taps deliver');
  assert.doesNotMatch(s, /pourSimS\+=add;/, 'nothing advances the clock by the requested interval');
  /* and clearing the water clears the shallow-water state with it */
  assert.match(s, /clearWater\(\)\{ pushUndo\(\); pourStop\(\); sources=\[\]; rainMm=0; resetSim\(\);/);
  assert.match(s, /function settleSim\(\)\{/, 'the t → ∞ answer is one call…');
  assert.match(s, /class="tw-play tw-settle"/, '…with a control of its own');
  assert.match(s, /settle\(\)\{ pourStop\(\); return settleSim\(\); \}/, 'reachable from Atlas');
  assert.match(s, /advance\(seconds\)\{/, 'and so is «run it for N simulated seconds»');
  /* the model note must describe the model that is there */
  assert.doesNotMatch(s, /波の到達速度は扱いません/, 'the note no longer denies what the model now does');
  assert.match(s, /局所慣性形：Bates 2010／q中心化 de Almeida 2012/, 'it names the scheme, in Japanese too');
  /* the water is delivered once, however many times the routing re-reads the running total */
  assert.match(s, /if\(want<=had\)\{ sc\._fed=want; return; \}/);
  /* a hole the relaxation could not reach is no longer filled with sea level */
  assert.doesNotMatch(s, /for\(let k=0;k<a\.length;k\+\+\) if\(isNaN\(a\[k\]\)\) a\[k\]=0;/);
});

/* ── ⑧ …AND THE COURSE CARRIES AN ARRIVAL TIME ──────────────────────────────────────────────────
   「上に加えて下流トレースにも到達時刻」. It has to be derived from the same friction law, and the
   discharge it used has to be visible, or the number is unreadable. */
test('R265 ⑧ the traced course reports when the water gets there, and what it assumed', () => {
  const s = read('js/terrain-water.js');
  assert.match(s, /tSum\+=ds\[m\]\/\(v\*5\/3\);/, 'the arrival runs at the kinematic celerity');
  assert.match(s, /travelS:tSum, vMaxMs:vMax, vMinMs:isFinite\(vMin\)\?vMin:0, manningN:NM,/);
  assert.match(s, /dischargeM3s:Qs, dischargeFrom:qFrom/, 'and the discharge is reported with its origin');
  assert.match(s, /travelTime:\(\)=>\{/, 'Atlas can ask for it');
  assert.match(s, /Travel time','到達時間'/, 'and the panel prints it');
  /* the section level is solved for a DISCHARGE now, not for a scaled 1/√S area */
  assert.match(s, /return g\.area\*Math\.pow\(g\.area\/g\.wid,2\/3\)\*sq\/NM;/);
});

/* ── ⑨ THE DATA-CENTRE LAYER STOPS ANSWERING ABOUT THE VIEW ─────────────────────────────────────
   「データセンター、AIインフラレイヤーに表示範囲内のものを表示する機能はいらない。」 Deleted, not hidden —
   and nothing else about the layer is reduced with it. */
test('R265 ⑨ the in-view summary is gone, and the layer keeps everything else', () => {
  const s = read('js/datacenters.js');
  for (const re of [/件（表示範囲内）/, /sites in view/, /Largest published capacity in view/,
    /No site in view publishes a capacity figure/, /function inView\(/, /byOrigin/]) {
    assert.doesNotMatch(s, re, `${re} belongs to the deleted summary`);
  }
  assert.doesNotMatch(s, /setTimeout\(\(\)=>dcRender\(\),320\)/, 'and so does the repaint that kept it current');
  /* what stays: the OSM fetch for the view (that is how the layer gets data), the card, the filter */
  assert.match(s, /GE\(\)\.events\.on\('moveend',\(\)=>\{ if\(on\)\{ setTimeout\(\(\)=>refresh\(\),250\); \} \}\)/);
  assert.match(s, /id='dc-detail'/);
  assert.match(s, /toggleKey\(k\)\{/);
  assert.match(s, /key:\(\)=>KEY_ROWS\(\)\.map/, 'the colour key, which is also the class switch, survives');
  const c = read('js/layer-packs.js');
  assert.match(c, /k\.querySelectorAll\('\.dc-keyrow'\)\.forEach/, 'and the legend rows still switch classes off');
});
