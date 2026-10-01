/* ============================================================================
 *  IntMap · terrain editing and water routing — one model, one lattice, one clock, one raster
 *  (js/terrain-water.js, js/water-dynamics.js, the DEM decode in js/map-readout.js)
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r176-checks ④, tests/r265-checks ①–⑧, tests/r267-checks and
 *  tests/r270-checks ①. (#R265 ⑨, the data-centre layer, is in tests/legend-keys-and-shelves-checks.)
 *
 *  #R176 ④ — measured: dropping 20 million m³ into a dug pit reported ZERO inflow.
 *  #R265 — a hole in the published elevation data is not ground · water takes time to get there.
 *  #R267 — ONE MODEL, ONE LATTICE, ONE CLOCK, ONE RASTER
 *  「地形編集・水流でたまに、直線で地形を完全無視するクソ区間がある。経過時間に対する水の動きが、
 *    現実と乖離しすぎ。リアルなモデルにしろ。上流から下流まで全部同じモデル、描画にしろと言っている。」
 *
 *  The third time that last sentence has been given (#R211 「上流と下流でモデルと表示方法を変えず…」,
 *  #R255 「上流から下流まですべて同じ計算・描画方法にしろ」). The first two rounds made the two halves
 *  AGREE — same palette, same primitive, same friction constant — and left them as two halves:
 *
 *    inside the working rectangle — shallow water, integrated in time, drawn as a depth field
 *    outside it                   — a walk down the raw DEM producing a polyline, sized by Manning
 *                                   cross-sections, labelled with ∫ds/c, drawn complete at t = 0
 *
 *  MEASURED on the shipped build with nothing but a click:
 *
 *      from                  km      travel time    mean speed   longest straight run   its relief
 *      Kofu basin → sea      99.2    184.8 days     0.0062 m/s     1,120 m (48 cells)      5.9 m
 *      Alps → Po            362.9    566.4 days     0.0074 m/s     4,249 m (215 cells)     4.1 m
 *      W-Siberia            135.6    432.8 days     0.0036 m/s     2,267 m (159 cells)    14.7 m
 *      Lake Biwa            190.1    229.6 days     0.0096 m/s    12,773 m (547 cells)     1.1 m
 *
 *  A river runs at 0.5–2 m/s. BOTH reported symptoms belong to that second half and to nothing
 *  else, so this round deleted it: the basin is the working rectangle's own lattice, extended cell
 *  by cell wherever the water actually runs.
 *
 *  ⚠ THESE TESTS ASSERT PROPERTIES, NOT SOURCE TEXT. Seven rounds running, the previous round's
 *  tests made a correct change look like a regression by pinning the mechanism that produced the
 *  answer ([[intmap-recurring-lessons]]). Where a source assertion is unavoidable it is an ABSENCE
 *  (a thing that must not come back), which survives a rewrite of whatever replaced it.
 *  #R270 ① — the terrain & water panel opened underneath the sidebar, in a z-band this app does not have.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';
import { tokens as zTokens } from '../scripts/z-layers.mjs';
import { lazyFiles, factoryCalls } from './app-source.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = root;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const R = read;
const join = path.join;
const existsSync = fs.existsSync;
/* ⚠ (#R267) THE EXECUTABLE TEXT ONLY — block and line comments AND quoted strings removed. An
   assertion about what the code DOES must not be answerable by what the code SAYS; see R265 ⑥. */
function executableOnly(src){
  return codeOnly(src)
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}
const load = (p) => { const w = {}; new Function('window', read(p))(w); return w; };
const entry = read('src/main.js');
const LAZY = lazyFiles(new URL('../', import.meta.url));
const reached = (rel) => entry.includes(`import '../${rel}';`) || LAZY.includes(rel);
/* (module-graph) a factory is an export now, CALLED by name with IM_HOST from js/app-body.js or from a
   lazy entry's mount — factoryCalls() reads those calls off the AST */
const FACTORIES = factoryCalls(new URL('../', import.meta.url));
const instantiated = (file, name) => (FACTORIES[file] || []).includes(name);
const water = read('js/terrain-water.js');

/* ── ④ the terrain/water solver ─────────────────────────────────────────────────────────────────
   Measured: dropping 20 million m³ into a dug pit reported ZERO inflow, because the basin's inflow was
   read at "the first cell whose drainage parent is outside it" and a basin can have several. */
test('R176 ④: water is priority-flood + volume routing, and the inflow is exact', () => {
  /* ⚠ READ, NOT RUN: the routing solver lives inside the terrain panel factory together with its DEM fetch and renderer images; the shallow-water physics that replaced most of it is run in #R265/#R267 below. */
  assert.ok(existsSync(join(ROOT, 'js/terrain-water.js')), 'the simulator has its own file');
  assert.ok(reached('js/terrain-water.js'), 'loaded by the Vite entry, or fetched on demand by js/lazy-modules.js');
  assert.ok(instantiated('js/terrain-water.js', 'terrainWater'), 'and instantiated');
  assert.match(read('js/lazy-modules.js'), /m\.terrainWater\((IM_HOST)\);/, '…with the host');
  assert.match(water, /function Heap\(cap\)\{/, 'a real min-heap, so the flood is O(n log n)');
  assert.match(water, /filled\[nk\]=Math\.max\(surf\[nk\],filled\[k\]\);/, 'priority-flood fills to the spill level');
  assert.match(water, /parent\[nk\]=k;/, 'and the pop order doubles as the drainage tree');
  assert.match(water, /for\(let q=cnt-1;q>=0;q--\)\{\s*\n?\s*const k=order\[q\]; const v=own\[k\]\+inflow\[k\]; through\[k\]=v;/,
    'one reverse sweep routes every cubic metre downstream');
  /* (#R186) The FIX this test was written for — "a basin's inflow is what reaches it, not what one
     outlet cell happens to carry" — is now stated more strongly than the R176 form it pinned. Every
     cell inside a basin hands its water to the BASIN, so the sum has no outlet in it at all, and the
     basin is settled once (when the last of its cells has been visited) rather than read off a cell.
     Same guarantee, expressed by the code that replaced it. */
  assert.match(water, /const depIn=new Float64Array\(deps\.length\);/, 'inflow is accumulated per basin, exactly');
  assert.match(water, /if\(myDep>=0\)\{ depIn\[myDep\]\+=v;/, 'every cell inside a basin contributes to the basin, not to a neighbour');
  assert.match(water, /if\(depOrder\[myDep\]===q\) settle\(myDep\)/, 'and the level is solved once its inflow is complete');
  assert.doesNotMatch(water, /vin=through\[dp\.outlet\];/, 'and never read off a single outlet cell again');
  /* the products the request names */
  assert.match(water, /dp\.level=dp\.spill; dp\.over=vin-dp\.capacity;/, '決壊: a full basin overtops by exactly the excess');
  /* ⚠ (#R211) THE ARROW STAYS, THE NUMBER BESIDE IT DOES NOT — 「体積の赤字表示を消す」. The 決壊方向
     is what this assertion is for and it is unchanged; what a later instruction removed is the red
     volume that was rendered next to it. The volumes are still reported (in the panel's details),
     so nothing was lost except a figure in alarm-red on the map. */
  /* ⚠ (#R212) THE ARROW IS GONE TOO. 「また、赤い矢印はいらない。一切不要。」 — #R211 read the earlier
     「体積の赤字表示を消す」 as "keep the arrow, drop the number"; the follow-up settled it. What this
     test was really about survives and is asserted instead: the spill is still COMPUTED and still
     reported, so nothing about the answer was lost — only a second, louder drawing of it. */
  assert.ok(!/kind:'breach'/.test(water), 'the red spill arrows are not drawn (#R212)');
  assert.ok(!/label:'➤ '\+fmtM3/.test(water), 'nor the red volume beside them (#R211)');
  assert.match(water, /result\.breaches\.length/, 'the spill points are still counted and reported in words');
  assert.match(water, /function stampLevees\(out\)\{/, '堤防・ダム are stamped into the same height field');
  assert.match(water, /sculpt\[j\*G\.NX\+i\]\+=amp\*0\.5\*\(1\+Math\.cos\(Math\.PI\*d\)\);/, 'the brush is a raised cosine');
});

/* ══════════════════ #R265 ══════════════════ */
/* ── ① A VOID TILE IS NOT −32,768 m OF GROUND ────────────────────────────────────────────────────
   The fifth report of 「直線で地形を完全無視するクソ区間」, and the first four rounds all looked at the
   walk. MEASURED: terrarium/14/9101/5896.png loads, is fully opaque, and every one of its 65,536
   pixels is RGB(0,0,0) — which the decode turned into −32,768 m. 14 of 49 z14 tiles around the Sava
   floodplain are like that; 0 of 49 at Lake Biwa, Death Valley, W-Siberia, Tokyo Bay and Geneva.
   ⚠ THE THRESHOLD IS ASSERTED AS A RELATION, NOT AS A LITERAL (#R264's lesson): it has to sit below
   anything the Earth can be and above what the encoding can express, or it either passes fiction or
   rejects the deep ocean. */
test('R265 ① the DEM decode rejects the terrarium void, on a physical threshold', () => {
  /* EVALUATED: `_decodeTile` and the constants it reads are lifted out of the comment-stripped
     js/map-readout.js and run on a 256×256 tile whose pixels the test writes, through a canvas stub
     that hands back exactly those bytes. */
  const s = codeOnly(read('js/map-readout.js'));
  const k = /const DEM_NODATA_BELOW=[^;]+;/.exec(s);
  assert.ok(k, 'the floor is one named constant');
  const decode = (fill) => {
    const data = new Uint8ClampedArray(65536 * 4);
    fill(data);
    const ctx = { clearRect() {}, drawImage() {}, getImageData: () => ({ data }) };
    const document = { createElement: () => ({ getContext: () => ctx }) };
    return new Function('document', 'let _decCv=null, _decCtx=null;\n' + k[0] + '\nconst _demVoid={ tiles:0, holedTiles:0, cells:0, fallbacks:0, unfilled:0 };\n'
      + liftFunction(s, '_decodeTile') + '\nreturn { r: _decodeTile({}), _demVoid };')(document);
  };
  const enc = (m) => { const v = m + 32768, r = Math.floor(v / 256), g = Math.floor(v - r * 256); return [r, g, Math.round((v - r * 256 - g) * 256)]; };
  const put = (d, i, [r, g, b], a = 255) => { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = a; };
  const CHALLENGER_DEEP = -10935;      // the deepest point on Earth
  const { r, _demVoid } = decode((d) => {
    for (let i = 0; i < 65536; i++) put(d, i, enc(120));
    put(d, 1, enc(CHALLENGER_DEEP));   // the deepest real place must survive
    put(d, 2, [0, 0, 0], 255);         // a terrarium void pixel: −32,768 m
    put(d, 3, [0, 0, 0], 0);           // an untouched pixel of the cleared canvas
    put(d, 4, enc(-420));              // the Dead Sea shore
    put(d, 5, enc(120), 0);            // a transparent pixel is not a measurement, whatever its colour
  });
  assert.equal(r.el[0], 120);
  assert.equal(r.el[1], CHALLENGER_DEEP, 'the floor must be below the Challenger Deep');
  assert.equal(r.el[4], -420);
  assert.ok(Number.isNaN(r.el[2]), '…and above the void it rejects (−32,768): a void pixel is no-data, not 32.8 km down');
  assert.ok(Number.isNaN(r.el[3]), 'an untouched canvas pixel is no-data too');
  assert.ok(Number.isNaN(r.el[5]), 'a pixel with no alpha is no-data, whatever its colour');
  assert.equal(r.voids, 3, 'the decode marks them, rather than passing the number through');
  assert.equal(_demVoid.cells, 3, 'and the holes are counted');
  /* a wholly void tile — the measured terrarium/14/9101/5896.png, all RGB(0,0,0) — is counted as one */
  const all = decode((d) => { for (let i = 0; i < 65536; i++) put(d, i, [0, 0, 0]); });
  assert.equal(all.r.voids, 65536);
  assert.equal(all._demVoid.tiles, 1, 'a tile with no data at all is reported as such');
  /* nothing decodes without the guard any more.
     ⚠ READ, NOT RUN: «there is no second decode» is a property of the file's text. */
  const decodes = s.match(/\(d\[o\]\*256\+d\[o\+1\]\+d\[o\+2\]\/256\)-32768/g) || [];
  assert.equal(decodes.length, 1, 'there is exactly one terrarium decode, and it is the guarded one');
});

/* ── ② …AND A HOLE IS NOT AN ENDING: the sampler steps down the pyramid ──────────────────────────
   The same place reads 85.61 m at z12 where z14 is void, so the answer is coarser data, not none. */
test('R265 ② a no-data sample falls back to the parent tile, bounded, and counts what it cannot fill', () => {
  /* ⚠ READ, NOT RUN: demElevAt walks the tile pyramid through the async tile cache and image decode of a page. */
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
  /* ⚠⚠ (#R267) THIS ASSERTION USED TO PIN THE LINE THAT READ `MANNING_N` INTO THE CROSS-SECTION
     SOLVE. #R265's claim was «one friction law for both halves»; #R267 removed the second half
     altogether, so the claim is now stronger and simpler: js/terrain-water.js does not have a
     friction law of its own AT ALL — it has no Manning exponent, no bed-roughness constant and no
     velocity formula, because every one of those lives in the solver. Pinning the old line would
     have made a change that deletes the second law look like a regression, which is what the last
     six rounds of this file kept doing. */
  /* ══ ⚠⚠⚠ AND THIS ASSERTION IS ABOUT CODE, NOT ABOUT PROSE ═════════════════════════════════════
     Two drafts of it in a row caught the file's own writing instead of its behaviour: first the
     bare string `0.035` (which the panel legitimately prints, because the reader is told what n
     is), then `= 0.035` (which matched 「マニング粗度 n = 0.035」 in that same sentence). That is the
     failure [[intmap-recurring-lessons]] has now recorded TEN times — 自分の検査が自分のコメントに
     当たる — and the fix that finally generalises is not a cleverer pattern but a different input:
     strip the comments and the string literals, then ask the question of what is left. */
  const code = executableOnly(t);
  assert.doesNotMatch(code, /0\.035/, 'no roughness constant appears in the executable text');
  assert.doesNotMatch(code, /Math\.sqrt\(slope/, 'and no velocity is computed from a slope here');
  assert.doesNotMatch(code, /manningV\(/, '…nor read out of the solver to be used as a second law');
  assert.match(t, /WD\(\)&&WD\(\)\.MANNING_N/, 'the number the panel reports comes from the solver');
  /* the manning velocity is written down once */
  assert.equal((w.match(/function manningV\(/g) || []).length, 1);
});

/* ── ⑦ THE CLOCK DRIVES THE WATER ───────────────────────────────────────────────────────────────
   The tick used to re-solve the steady state; now it integrates. And the panel's own description of
   the model has to stop saying the opposite (「波の到達速度は扱いません」). */
test('R265 ⑦ the pour tick advances the shallow-water state, and ⏭ is the steady state', () => {
  /* ⚠ READ, NOT RUN: the tick, the clock and the taps are closures of the panel factory, driven by requestAnimationFrame. */
  const s = read('js/terrain-water.js');
  assert.match(s, /import '\.\/water-dynamics\.js';/, 'the solver is a real dependency of this chunk');
  assert.match(s, /stepSim\(dt\*timeScale\);/, 'the transport advances the model by the simulated interval');
  assert.doesNotMatch(s, /solve\(\);\s+\/\* redraws and re-reports/,
    'and no longer re-solves the steady state on every tick');
  /* ⚠ ONE CLOCK. The elapsed time and the taps' delivery both follow what the model MANAGED to
     integrate, not what the tick asked for — two clocks for one simulation is this round's own
     defect in miniature (measured: the footer read «2.0 h» while the details read «35 min»). */
  assert.match(s, /pourSimS\+=r\.simS;/, "the clock is the water's clock");
  /* ⚠⚠ (#R267 追記) …AND WHAT THE TAPS DELIVER IS NOW TIED TO THE INTEGRATION MORE TIGHTLY STILL.
     #R265 credited a tap once per TICK, with what the model managed to integrate — which kept the
     two clocks together but still handed the interval'''s water over as a parcel. MEASURED IN
     PRODUCTION: 60,000 m³/s advanced by half an hour reported 「max depth 21,290.1 m」, which is
     1.08e8 m³ / (71.2 m)² to the metre. A discharge is a RATE, so it is delivered per STEP. */
  assert.match(s, /const r=S\.advance\(sec,maxSteps\|\|SIM_MAX_STEPS,arguments\.length>2\?arguments\[2\]:180,feedTaps\);/,
    'the solver calls back for the taps on every step');
  assert.match(s, /sc\.m3=Math\.max\(0,\+sc\.m3\|\|0\)\+give;/,
    '…and the running total the panel prints advances by the same amount at the same time');
  assert.doesNotMatch(s, /x\.m3\+=Math\.max\(0,\+x\.rate\|\|pourRate\)\*r\.simS;/,
    'nothing credits a tap for a whole interval at once any more');
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
  /* the water is delivered once, however many times the routing re-reads the running total.
     ⚠ (#R275) `_fed` IS GONE AND THE PROPERTY IS STRONGER. It existed because `x.m3` was a target
     the routing kept re-reading, so the delivery needed a second number to remember itself by. `m3`
     IS the delivery now — for both kinds of source — and `owed()` is what is left to give, so
     «delivered once» is arithmetic rather than book-keeping: a source that has delivered its
     capacity owes nothing and `feedTaps` skips it. */
  assert.match(s, /const owed=\(x\)=>Math\.max\(0,srcCap\(x\)-Math\.max\(0,\+\(\(x\|\|\{\}\)\.m3\)\|\|0\)\);/);
  assert.ok(!/_fed/.test(s), 'nothing needs a second number for what has been delivered');
  assert.match(s, /const left=owed\(sc\); if\(!\(left>0\)\) return;/, 'and a source that owes nothing is skipped');
  /* a hole the relaxation could not reach is no longer filled with sea level */
  assert.doesNotMatch(s, /for\(let k=0;k<a\.length;k\+\+\) if\(isNaN\(a\[k\]\)\) a\[k\]=0;/);
});

/* ── ⑧ …AND THE COURSE CARRIES AN ARRIVAL TIME ──────────────────────────────────────────────────
   「上に加えて下流トレースにも到達時刻」. It has to be derived from the same friction law, and the
   discharge it used has to be visible, or the number is unreadable. */
test('R265 ⑧ the traced course reports when the water gets there, and what it assumed', () => {
  /* ⚠ READ, NOT RUN: the arrival read-out lives in the panel factory; the arrival clock itself (tArr) is run in R267 ①/②. */
  const s = read('js/terrain-water.js');
  /* ⚠⚠⚠ (#R267) 「上に加えて下流トレースにも到達時刻」 IS STILL THE REQUIREMENT — AND THE ANSWER MOVED
     FROM A FORMULA TO A MEASUREMENT. #R265 integrated ∫ds/c along a polyline with the kinematic
     celerity c = (5/3)v, which is the right formula for the object it had; MEASURED on the shipped
     build it put 99.2 km of the Fuji valley 184.8 days away, because the geometry it integrated
     over was not the geometry the water runs on. The arrival time is now `tArr` — the clock at the
     step the cell first held drawable water, i.e. a fact about the run that drew the picture. So
     what this test asserts is the PROPERTY (there is a per-point arrival time, Atlas can ask for it,
     the panel prints it) and, positively, the absence of a second travel-time calculation. */
  assert.doesNotMatch(s, /5\s*\/\s*3/, 'no second wave-speed formula outside the solver');
  assert.match(s, /travelTime:\(\)=>\{/, 'Atlas can ask for it');
  assert.match(s, /at:\(lng,lat\)=>\{/, '…for any point, not only for a distance along a line');
  assert.match(s, /sim\.tArr\[k\]/, 'and the answer is read off the integration');
  assert.match(s, /Travel time','到達時間'/, 'and the panel prints it');
});

/* ══════════════════ #R267 ══════════════════ */
/* the solver runs in Node — no renderer, no DOM, one `window` assignment (#R265) */
function loadWD() {
  const src = read('js/water-dynamics.js');
  const g = { window: {} };
  new Function('window', src)(g.window);
  return g.window.IntMapWaterDynamics;
}

/* a valley that slopes south with rough shoulders: water runs, and it stays in the picture */
function valley(NX, NY) {
  const z = new Float32Array(NX * NY);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const d = Math.abs(i - (NX - 1) / 2);
    z[j * NX + i] = 300 - j * 0.35 + d * d * 0.05 + Math.sin(i * 0.9 + j * 0.3) * 0.6;
  }
  return z;
}

/* ── ① THE LATTICE GROWS AND THE STATE SURVIVES IT EXACTLY ──────────────────────────────────────
   This is the whole trick. If a growth loses, gains or smears water then the «one model» claim is
   a claim about code layout rather than about the answer. */
test('R267 ① growing the lattice moves the water, and only the water', () => {
  const WD = loadWD();
  const NX = 60, NY = 60, dx = 50;
  const z = valley(NX, NY);
  const S = WD.create(z, NX, NY, dx);
  S.pool(8 * NX + 30, 4e5);
  for (let n = 0; n < 120; n++) S.step(S.dtFor());

  const before = S.stats();
  const hBefore = Array.from(S.h);
  const tBefore = Array.from(S.tArr);

  /* grow 17 cells west and 23 south; the new ground continues the same valley */
  const padW = 17, padS = 23, nNX = NX + padW, nNY = NY + padS;
  const nz = new Float32Array(nNX * nNY);
  for (let j = 0; j < nNY; j++) for (let i = 0; i < nNX; i++) {
    const gi = i - padW;
    nz[j * nNX + i] = (gi >= 0 && gi < NX && j < NY) ? z[j * NX + gi] : 500;
  }
  assert.equal(S.grow(nNX, nNY, padW, 0, nz), true, 'the growth is accepted');

  const after = S.stats();
  assert.equal(after.NX, nNX);
  assert.equal(after.NY, nNY);
  /* ⚠ MASS IS NOT «ROUGHLY» CONSERVED ACROSS A GROWTH — it is copied, so it is EXACT. A tolerance
     here would hide an interpolation, which is precisely the seam this round removed. */
  assert.equal(after.totalM3, before.totalM3, 'not one cubic metre is created or lost');
  assert.equal(after.outM3, before.outM3, 'and nothing is booked as having left');
  assert.equal(S.tS, before.tS, 'the clock does not move');
  let moved = 0, arrivals = 0;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const o = j * NX + i, n = j * nNX + (i + padW);
    if (S.h[n] !== hBefore[o]) moved++;
    const a = tBefore[o], b = S.tArr[n];
    if (!(a === b || (Number.isNaN(a) && Number.isNaN(b)))) arrivals++;
  }
  assert.equal(moved, 0, 'every depth is where it was, cell for cell');
  assert.equal(arrivals, 0, '…and so is every arrival time');
});

/* ── ② THE REPORTED SYMPTOM, ASKED OF THE FIELD ─────────────────────────────────────────────────
   「直線で地形を完全無視するクソ区間がある」 — six reports. #R258/#R261/#R264/#R265 each fixed a real
   defect in the POLYLINE that had chords; the drawn thing is a depth field now, and the same
   question has a provable answer: fluxes only move water between face neighbours, so no cell can
   hold water unless a neighbour got wet no later than it did — or water was placed there. */
test('R267 ② no water gets anywhere without crossing the ground in between', () => {
  const WD = loadWD();
  const NX = 80, NY = 80, dx = 40;
  const S = WD.create(valley(NX, NY), NX, NY, dx);
  S.pool(6 * NX + 40, 4e5);
  const seen = [];
  for (const n of [1, 10, 60, 200, 600]) {
    while (S.stats().steps < n) S.step(S.dtFor());
    const j = S.jumpCells();
    seen.push(j);
    assert.equal(j.jumps, 0, `step ${n}: ${j.jumps} cells hold water that did not flow into them`);
  }
  assert.ok(seen.some(j => j.wetCells > 100), 'and the run really did wet a lot of ground');
  /* a tap opened later into dry ground is a PLACEMENT, not a jump — the instrument has to be able
     to tell those apart or it is the «my check cannot catch me» shape again */
  S.addVolume([70 * NX + 10], 5e4);
  const j2 = S.jumpCells();
  assert.equal(j2.jumps, 0, 'a newly placed source is not a jump');
  assert.ok(j2.placedCells > 0, '…because it is counted as placed');
});

/* ── ③ THE ACTIVE WINDOW IS AN OPTIMISATION, NOT AN APPROXIMATION ──────────────────────────────
   The step sweeps a box around the wet cells. If that box can ever be behind the water, the model
   silently clips its own flood — so the claim under test is that the same problem, embedded in a
   much larger lattice, produces the same answer. */
test('R267 ③ padding the lattice with dry ground changes nothing about the water', () => {
  const WD = loadWD();
  const NX = 50, NY = 50, dx = 45, PAD = 60;
  /* ⚠ THE RIM HAS TO MEAN THE SAME THING ON BOTH, OR THE TEST MEASURES THE OUTFALL INSTEAD. The
     first version left the small lattice's edge as the outfall it is and walled the big one in;
     measured, the interiors then differed by 3.42 m — correctly, because water leaving one and
     backing up in the other is a real difference. Ringing the small lattice makes both closed. */
  const zSmall = valley(NX, NY);
  for (let i = 0; i < NX; i++) { zSmall[i] = 900; zSmall[(NY - 1) * NX + i] = 900; }
  for (let j = 0; j < NY; j++) { zSmall[j * NX] = 900; zSmall[j * NX + NX - 1] = 900; }
  const A = WD.create(zSmall, NX, NY, dx);

  const bNX = NX + 2 * PAD, bNY = NY + 2 * PAD;
  const zBig = new Float32Array(bNX * bNY);
  for (let j = 0; j < bNY; j++) for (let i = 0; i < bNX; i++) {
    const gi = i - PAD, gj = j - PAD;
    zBig[j * bNX + i] = (gi >= 0 && gi < NX && gj >= 0 && gj < NY) ? zSmall[gj * NX + gi] : 900;
  }
  const B = WD.create(zBig, bNX, bNY, dx);

  A.pool(8 * NX + 25, 3e5);
  B.pool((8 + PAD) * bNX + (25 + PAD), 3e5);
  for (let n = 0; n < 300; n++) { const dt = Math.min(A.dtFor(), B.dtFor()); A.step(dt); B.step(dt); }

  let worst = 0;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const d = Math.abs(A.h[j * NX + i] - B.h[(j + PAD) * bNX + (i + PAD)]);
    if (d > worst) worst = d;
  }
  /* the two differ only in what the RIM does — the small grid's edge is an outfall, the big one's
     is 900 m of wall — so the interior must agree to the metre it is measured in */
  assert.ok(worst < 1e-9, `the interior must not depend on the padding (worst ${worst})`);
  const box = B.activeBox;
  assert.ok(box.i1 - box.i0 < bNX - 1, 'and the big lattice really was swept partially');
});

/* ── ④ ⏭ IS THIS MODEL RUN TO REST, AND SAYS SO WHEN IT COULD NOT ──────────────────────────────
   #R265's ⏭ copied the routing's t → ∞ field in, which is a different model's answer. */
test('R267 ④ the resting state is one the integration reached', () => {
  const WD = loadWD();
  const NX = 40, NY = 40, dx = 40;
  /* a closed bowl: water put in has somewhere to settle and nowhere to leave */
  const z = new Float32Array(NX * NY);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const r = Math.hypot(i - 20, j - 20);
    z[j * NX + i] = 100 + Math.max(0, 18 - r) * -1.2 + Math.max(0, r - 15) * 6;
  }
  const S = WD.create(z, NX, NY, dx);
  S.pool(20 * NX + 20, 6e5);
  const v0 = S.stats().totalM3;
  const r = S.settle({ maxSteps: 20000 });
  assert.equal(r.capped, false, 'a bowl settles inside the budget');
  assert.equal(r.still, true);
  assert.ok(r.simS > 0, 'and it took simulated time to do it');
  assert.ok(Math.abs(S.stats().totalM3 - v0) < v0 * 1e-9, 'nothing is lost getting there');

  /* ⚠ AND A BUDGET THAT BITES IS REPORTED, NEVER SILENT (#R185) */
  const T = WD.create(valley(60, 60), 60, 60, 40);
  T.addRain(400);
  const r2 = T.settle({ maxSteps: 40 });
  assert.equal(r2.capped, true, 'forty steps cannot settle a rained-on hillside');
  assert.equal(r2.still, false, '…and it does not claim to be at rest');
});

/* ── ⑤ ONE LATTICE AND ONE RASTER, IN THE TOOL ─────────────────────────────────────────────────
   Source-level, and every assertion is either «exactly one of these exists» or «this must not come
   back» — both survive a rewrite of the thing that satisfies them. */
test('R267 ⑤ the tool has one water model, one lattice and one drawing of it', () => {
  const src = read('js/terrain-water.js');
  /* the basin IS the working rectangle's lattice, extended */
  assert.match(src, /B=\{ NX:G\.NX, NY:G\.NY, xW:G\.xW, yN:G\.yN, dx:G\.dx, dy:G\.dy, cellM:G\.cellM,/);
  assert.match(src, /areaM2:G\.areaM2, z:G\.z, offI:0, offJ:0 \}/, 'same cells, same DEM level, same origin');
  assert.match(src, /sim\.grow\(nNX,nNY,padW,padN,nZ\)/, 'and it is extended, not restarted');
  /* exactly one thing paints water, over the basin's own extent */
  assert.equal((src.match(/paintImg\(IMG_WATER/g) || []).length, 1, 'water is painted in exactly one place');
  assert.match(src, /const bb=basinBBox\(\);/, 'over the lattice the model covers');
  /* the answers that used to be a second model, gone by name */
  for (const dead of ['traceDownstream', 'channelSections', 'flowImage', 'refineCrossing',
                      'windowRoute', 'channelChain', 'pitEscape', 'escalMult', 'TRACE_Z_NEAR']) {
    assert.ok(!src.includes(dead), `${dead} belongs to the second model and must not come back`);
  }
  /* …and there is no second friction law, no second wave speed, no second clock */
  assert.ok(!/Math\.sqrt\(slope/.test(src), 'no velocity is computed here');
  assert.ok(!/5\s*\/\s*3/.test(src), 'and no kinematic celerity');
  assert.match(src, /pourSimS\+=r\.simS;/, 'the clock is what the water was integrated for');
  assert.match(src, /pourSimS=S\.tS;/, '…and ⏭ leaves it reading the solver');
  /* the extent is budgeted, and a budget that bites is printed (#R185) */
  assert.match(src, /function basinMaxCells\(\)/);
  assert.match(src, /basinCapped=true; return;/, 'growth stops at the budget');
  assert.match(src, /result\.sim&&result\.sim\.capped/, '…and the panel says so');
  assert.match(src, /result\.sim&&result\.sim\.jumps/, 'and the reported symptom is printed if it ever appears');
});

/* ── ⑥ THE TRAVEL TIME IS A READING, NOT A FORMULA ─────────────────────────────────────────────
   184.8 days for 99.2 km is what a formula over the wrong geometry produces. */
test('R267 ⑥ «when does it get here» is read off the run that drew it', () => {
  const src = read('js/terrain-water.js');
  assert.match(src, /t=sim\.tArr\[k\];/, 'the answer is the arrival clock of the cell');
  assert.match(src, /at:\(lng,lat\)=>\{/, 'for any point, not for a distance along a line');
  assert.match(src, /trace&&trace\.frontTS>0/, 'and the panel prints it for the front');
  const w = read('js/water-dynamics.js');
  assert.match(w, /if\(h\[k\]>0&&!\(tArr\[k\]===tArr\[k\]\)\) tArr\[k\]=tNext;/,
    'written once, when the leading edge reaches the cell');
  /* ⚠ AND NOT AT THE DRAWING THRESHOLD. Measured on the Fuji valley, stamping the arrival when a
     cell became DRAWABLE made ② report 1 wet cell in 33,450 as a jump — correctly, because on any
     bed falling more than 2 cm per cell an upstream cell holding 1 cm fills its neighbour past
     2 cm without ever crossing 2 cm itself. Any water at all is the only threshold under which a
     face-coupled scheme can promise the invariant. */
  assert.match(w, /const H_DRAW=0\.02;/, 'the DRAWING threshold keeps its own name');
  assert.ok(!/tArr\[k\]=tNext;[\s\S]{0,40}H_DRAW/.test(w), 'and the two are not the same number');
  /* the model's own description has to describe the model that is there (#R265 ⑦'s rule) */
  assert.match(src, /上流から下流まで同じモデルです/, 'the panel says so in Japanese too');
  for (const f of ['fr', 'ko', 'zh', 'zh-hans']) {
    assert.ok(read(`js/locales/ui.${f}.js`).includes('Run on until the water stops moving'),
      `${f} has the ⏭ label`);
  }
});

/* ══════════════════ #R270 ① — the panel is a floating window ══════════════════ */
/* ── ① the terrain & water panel is a floating window like every other one ──────────────────── */
test('R270 ① the terrain panel joins the window band and is placed against a MEASURED sidebar', () => {
  /* ⚠ READ, NOT RUN: placement measures live DOM rects and the window manager's z-band. */
  const s = codeOnly(read('js/terrain-water.js'));
  assert.ok(!/z-index:1402/.test(s),
    'the panel must not carry a z-index of its own outside the app’s floating-window band');
  assert.match(s, /HOST\.registerWindow/,
    'the panel must be registered with the window manager, which is what keeps it in the band');
  assert.match(s, /HOST\.bringToFront/, 'opening it must raise it, like every other window');
  /* the placement reads the DOM rather than assuming a width — #R252's 「動く障害物は矩形を実測しろ」 */
  const m = /function placeClear\(\)\{([\s\S]*?)\n    \}/.exec(s);
  assert.ok(m, 'placeClear() must exist');
  assert.match(m[1], /getBoundingClientRect/, 'the free space must be measured, not assumed');
  assert.match(m[1], /#sidebar/, 'the left sidebar is the thing that covered it');
  assert.match(m[1], /_twMoved/, 'a position the reader chose must not be overwritten');

  /* the band itself is the stacking owner's (js/ui-stack.js, ui-layer-owner): the --z-window layer of
     css/intmap.css, under --z-shell-front — the panel asks the owner for a level inside it */
  const tok = zTokens(read('css/intmap.css'));
  const z = /panel\.style\.zIndex=window\.IntMapStack\.z\('window',\s*(\d+)\)/.exec(s);
  assert.ok(z, 'the panel must take its z-index from the stacking owner');
  const lv = tok['--z-window'] + (+z[1]);
  assert.ok(lv > tok['--z-window'] && lv < tok['--z-shell-front'],
    `the panel's z-index (${lv}) must be inside the window band ${tok['--z-window']}–${tok['--z-shell-front'] - 1}`);
});

test('R270 ① one row height in the panel, and the disclosures are on the list', () => {
  /* ⚠ READ, NOT RUN: the row rhythm is CSS text injected by the panel. */
  const s = codeOnly(read('js/terrain-water.js'));
  /* ⚠ (#R275) ONE ROW HEIGHT IS STILL THE POINT; the NUMBER is now a declaration shared with the
     block and the disclosure, and it differs between a thumb and a desktop legend column (see the
     note on TW_ROW). Pinning 44 made a fix to the SCALE look like a regression of the RHYTHM. */
  const row = /'\.tw-row\{[\s\S]{0,320}/.exec(s);
  assert.ok(row, '.tw-row must be styled here');
  assert.match(row[0], /min-height:'\+TW_ROW\+'/, 'the grouped-list row height is the one declaration');
  for (const sel of ['.tw-blk', '.tw-note > summary'])
    assert.ok(s.indexOf("'" + sel + '{') > 0 || s.indexOf(sel) > 0, sel + ' must be styled here');
  assert.equal((s.match(/min-height:'\+TW_ROW\+'/g) || []).length, 3,
    'the row, the prose block and the disclosure summary all read the same height');
  assert.match(s, /'\.tw-val \.tw-segwrap\{/, 'a segmented control inside a row must be sized for it');
  /* the two <details> are cards, so their text starts on the same left edge as every row.
     ⚠ these declarations are written as CONCATENATED string literals, so a rule is the run of
     source from its selector to the closing brace — not one quoted string. */
  const rule = (sel) => { const i = s.indexOf("'" + sel + '{'); assert.ok(i > 0, sel + ' must be styled here');
    return s.slice(i, s.indexOf('}', i)).split("'+'").join(''); };
  const note = rule('.tw-note'), card = rule('.tw-card');
  assert.match(note, /border-radius/, '.tw-note must be a card');
  /* ⚠⚠ (#R273) THE INSET MOVED FROM THE CARD TO THE SUMMARY, and it had to: with the padding on the
     card the two disclosures came out 37.0 and 36.5 px tall against a 44 px row — a card is a card
     but it was not on the rhythm. The summary is a ROW now (44 px, inset 12 like every other row
     inside a bordered card), so what #R270 asserted — one left edge — is asserted of the element
     that actually carries the text. */
  /* (#R275) …and the rhythm is a declaration, not a number — see the note above `row`. */
  const sum = rule('.tw-note > summary');
  assert.match(sum, /min-height:'\+TW_ROW\+'/, 'a disclosure sits on the row rhythm');
  /* (#R275) the inset is `TW_INSET`, the SAME token the caption and the block read, which is what
     「one left edge」 means once the panel has two device scales. */
  assert.match(sum, /padding:0 '\+TW_INSET\+'px/, '.tw-note > summary must state its inset');
  assert.match(rule('.tw-cap'), /padding:0 '\+TW_INSET\+'px/, '…and it is the caption’s inset too');
  assert.match(card, /border-radius/, '.tw-card is the shape .tw-note now matches');
});

