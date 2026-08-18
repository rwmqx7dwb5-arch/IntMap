/* ============================================================================
 *  #R267 — ONE MODEL, ONE LATTICE, ONE CLOCK, ONE RASTER
 * ----------------------------------------------------------------------------
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
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

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
