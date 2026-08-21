/* ============================================================================
 *  R197 — the tsunami is global, and there is only one of it
 * ----------------------------------------------------------------------------
 *  Two kinds of check live here.
 *
 *  ① THE PHYSICS IS RUN, NOT ASSERTED ON. src/tsunami-worker.js is loaded into a Node vm with a stub
 *     `self` and its `run()` is called, so these tests fail when the ANSWER changes — not when the
 *     text changes. That is the difference between a test that protects a model and a test that
 *     protects a spelling.
 *
 *       · Okada (1985) against the published test case in Okada's own Table 2;
 *       · the modelled celerity over a flat ocean against √(gh), which is the exact analytic answer
 *         for the equations being solved and needs no citation;
 *       · east/west symmetry about the source, which can only hold if longitude really is periodic —
 *         the western sample is reached ONLY across the antimeridian.
 *
 *  ② THE REMOVAL IS PERMANENT. 「災害シミュレータからは津波シミュレータを削除しろ」 — js/sims.js must
 *     not carry a tsunami hazard, and none of the three things that used to open it may look for one.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── load the worker as code, with a stub for the one global it touches ─────────────────────── */
function loadWorker(onMsg) {
  const ctx = {
    self: { postMessage: (o) => { if (onMsg) onMsg(o); } },
    performance: { now: () => Number(process.hrtime.bigint() / 1000n) / 1000 },
    console, Math, Float32Array, Float64Array, Int32Array, Int16Array, Int8Array, Uint8Array,
    Number, Object, Array, isFinite, String, Error
  };
  vm.createContext(ctx);
  vm.runInContext(rd('src/tsunami-worker.js') + '\n;globalThis.__api={run,okadaUz,faultGeom,seaFloor};',
    ctx, { filename: 'tsunami-worker.js' });
  return ctx.__api;
}
/* a synthetic ocean of one constant depth, sea everywhere — encoded exactly as data/bathymetry.png is */
function flatOcean(depthM, w, h) {
  const rgb = new Uint8Array(w * h * 3), d = Math.round(depthM);
  for (let k = 0; k < w * h; k++) { rgb[k * 3] = d >> 8; rgb[k * 3 + 1] = d & 255; rgb[k * 3 + 2] = 255; }
  return { w, h, rgb };
}

test('R197 ①a Okada (1985) — the published dip-slip test case, run rather than quoted', () => {
  const api = loadWorker();
  /* Okada 1985, Table 2: L = 3, W = 2, d = 4, δ = 70°, observation point (2, 3), unit dip slip.
     The published vertical displacement is −3.564e−2. */
  const uz = api.okadaUz(2, 3, 4, 3, 2, 70, 1);
  assert.ok(Math.abs(uz - (-3.564e-2)) < 5e-6, `Okada uz = ${uz}, published −3.564e−2`);
  /* and it must DECAY, which is the whole point of the principal-value arctan (#R192): far behind a
     finite source the static field is zero, not a plateau of slip·sinδ */
  assert.ok(Math.abs(api.okadaUz(400, 300, 4, 3, 2, 70, 1)) < 1e-6, 'the far field decays to zero');
});

test('R197 ①b Wells & Coppersmith — the moment the magnitude implies is the moment carried', () => {
  const api = loadWorker();
  for (const mw of [7.0, 8.0, 9.1]) {
    const g = api.faultGeom(mw);
    const M0 = 3.0e10 * g.L * g.W * g.slip;              /* μ·A·D */
    const back = (Math.log10(M0) - 9.1) / 1.5;
    assert.ok(Math.abs(back - mw) < 0.01, `Mw ${mw} → area × slip gives back ${back.toFixed(3)}`);
  }
});

test('R197 ①c the sea floor reads its own encoding, and the sea fraction decides wet from dry', () => {
  const api = loadWorker();
  const w = 8, h = 4, rgb = new Uint8Array(w * h * 3);
  const put = (i, j, d, frac) => { const o = (j * w + i) * 3; rgb[o] = d >> 8; rgb[o + 1] = d & 255; rgb[o + 2] = frac; };
  for (let k = 0; k < w * h; k++) { rgb[k * 3] = 0; rgb[k * 3 + 1] = 0; rgb[k * 3 + 2] = 0; }
  put(3, 1, 4321, 255);                                   /* deep open sea */
  put(4, 1, 4321, 100);                                   /* mostly land — a wall despite the depth */
  put(5, 1, 5, 255);                                      /* all sea but 5 m — a beach, also a wall */
  const sf = api.seaFloor({ w, h, rgb }, w, h, -90, 90);
  const at = (i, j) => j * w + i;                         /* seaFloor counts rows NORTH from lat0 */
  const jN = h - 1 - 1;                                   /* image row 1 → model row h−1−1 */
  assert.equal(sf.h[at(3, jN)], 4321, 'the depth survives the round trip exactly');
  assert.equal(sf.land[at(3, jN)], 0, 'a full-sea deep cell is water');
  assert.equal(sf.land[at(4, jN)], 1, 'a cell that is 39 % sea is a wall');
  assert.equal(sf.land[at(5, jN)], 1, 'a 5 m cell is a beach, not water this grid can carry');
});

test('R197 ①d the modelled celerity is √(gh), and longitude is periodic', () => {
  /* A flat ocean is the one case with an exact answer: long waves travel at √(gh) regardless of
     everything else in the file. 1° cells keep this test under a second while still resolving it. */
  const nx = 360, ny = 160, lat0 = -80, lat1 = 80, DEPTH = 4000;
  const c = Math.sqrt(9.80665 * DEPTH), RE = 6371000;
  const frames = [];
  let model = null;
  const api = loadWorker((o) => { if (o.type === 'model') model = o; if (o.type === 'frames') for (const f of o.frames) frames.push(f); });
  const out = api.run({
    id: 1, nx, ny, lat0, lat1, dec: 1, hours: 18, frames: 90, filtLat: 60,
    bathy: flatOcean(DEPTH, nx, ny * 9 / 8), src: { lng: 140, lat: 0, mw: 9.0, depthKm: 20 }
  });
  assert.ok(out && !out.err, 'the run completed: ' + (out && out.err));
  assert.ok(model, 'the model was reported before the first step');

  const row = Math.floor((0 - lat0) / (lat1 - lat0) * ny);
  const col = (lo) => Math.floor(((((lo + 180) % 360) + 360) % 360) / 360 * nx);
  /* The FRONT, taken at half of each point's own eventual peak, so the amplitude decay does not bias
     the timing the way a fixed threshold would.
     ⚠ AND A REAL PEAK, NOT ANY PEAK. A leapfrog stencil moves information one cell a step — 868 m/s
     on this grid — so a SUB-MILLIMETRE numerical precursor runs ahead of the 198 m/s physical wave.
     Measured here at 85° from the source: |q| = 7 of 127, i.e. ~0.2 mm, arriving at 472 min against a
     physical 795 min. It is four orders below the 1 cm the arrival field triggers on and it is
     invisible in the picture, but "half of the peak" finds it if the peak itself is that small. So a
     point counts as reached only once it carries |q| ≥ 15, about 3 cm here. */
  const front = (lo) => {
    const k = row * nx + col(lo);
    let pk = 0; for (const f of frames) { const v = Math.abs(f.q[k]); if (v > pk) pk = v; }
    if (pk < 15) return -1;
    for (const f of frames) if (Math.abs(f.q[k]) >= pk * 0.5) return f.t;
    return -1;
  };
  const pts = [];
  for (let d = 40; d <= 110; d += 10) { const t = front(140 + d); if (t > 0) pts.push([RE * d * Math.PI / 180, t]); }
  assert.ok(pts.length >= 5, `the wave reached the far field (${pts.length} samples)`);
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [d, t] of pts) { sx += d; sy += t; sxx += d * d; sxy += d * t; }
  const cModel = 1 / ((pts.length * sxy - sx * sy) / (pts.length * sxx - sx * sx));
  assert.ok(Math.abs(cModel / c - 1) < 0.04,
    `modelled celerity ${cModel.toFixed(1)} m/s against sqrt(gh) ${c.toFixed(1)} m/s`);

  /* ⚠ PERIODICITY. 140 E + 110° is 250 E = 110 W; going the other way is 30 E. Both are 110° from the
     source, and the western one is reached ONLY by crossing the antimeridian. If the grid had an edge
     in longitude, these two would not agree — one of them would never arrive at all. */
  for (const d of [60, 110]) {
    const e = front(140 + d), w = front(140 - d);
    assert.ok(e > 0 && w > 0, `both directions arrive at ±${d}°`);
    assert.ok(Math.abs(e - w) / e < 0.06, `east ${(e / 60).toFixed(1)} min vs west ${(w / 60).toFixed(1)} min at ±${d}°`);
  }
});

test('R197 ①e a divergent run is reported, never drawn', () => {
  const api = loadWorker();
  const src = rd('src/tsunami-worker.js');
  assert.match(src, /const SANE = 500;/, 'the bound exists');
  assert.match(src, /if \(!\(mx < SANE\)\) \{ diverged = true; break; \}/, 'and it stops the run');
  assert.match(src, /if \(diverged\) return \{ err: 'diverged' \};/, 'and reports rather than returns a picture');
  assert.match(rd('js/tsunami.js'), /lastErr==='diverged'/, 'and the panel says so in five languages');
});

test('R197 ②a the disaster simulator has no tsunami hazard at all', () => {
  const sims = rd('js/sims.js');
  /* ⚠ (#R296) #R197's subject was 「災害シミュレータからは津波シミュレータを削除しろ」 and its check was
     that the hazard list has no tsunami and that `setHazard` refuses an unknown one. 「災害シミュレー
     ターは4つのうち、放射性物質拡散シミュレーションを残し全削除」 removed the list, the setter and the
     module. The requirement survives its implementation: nothing in js/sims.js may offer a tsunami. */
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');   /* (#R296) 21st round: a check for a removed name must not match the comment that explains the removal */
  assert.doesNotMatch(code(sims), /hazard/i, 'there is no hazard list left to put a tsunami in');
  assert.doesNotMatch(code(sims), /IntMapTsunami/, 'and js/sims.js does not open the propagation model either');
});

test('R197 ②b nothing opens a tsunami inside the disaster simulator', () => {
  const seis = rd('js/seismic.js');
  assert.match(seis, /const T=window\.IntMapTsunami; if\(!T\|\|!T\.open\) return false;/,
    'the seismic hand-off goes to the propagation model');
  assert.doesNotMatch(seis, /hazard:'tsunami'/, 'and never to the disaster panel');
  const tsu = rd('js/tsunami.js');
  assert.doesNotMatch(tsu, /IntMapDisaster/, 'the propagation panel does not open the disaster panel either');
  assert.doesNotMatch(tsu, /openInundation/, 'and the button that did is gone');
  const atlas = rd('js/atlas-console.js');
  assert.match(atlas, /case 'tsunami': case 'tsunamiSim': case 'tsunamiPropagation':/,
    'Atlas routes tsunami to its own model');
  /* ⚠ (#R296) the free-text forward stood in the `disaster` case, which is gone with its module —
     a sentence saying 「tsunami」 reaches the model by naming it, and there is no longer a nearer
     hazard for it to be captured by. The SYS entry keeps its subject and loses the comparison. */
  assert.doesNotMatch(atlas, /case 'disaster':/, 'and there is no disaster case to capture it first');
  assert.match(atlas, /TSUNAMI PROPAGATION \(its own model/,
    'and the SYS catalogue says which model it is (#R115: an action the catalogue omits does not exist)');
});

test('R197 ②c the global model: one grid, every device, and a sea floor with no holes', () => {
  const tsu = rd('js/tsunami.js');
  assert.match(tsu, /const NX=1440, NY=640, LAT0=-80, LAT1=80;/, 'the domain is fixed and global');
  assert.doesNotMatch(tsu, /halfLng|reachKm/, 'nothing sizes a box from the run length any more');
  /* ⚠ (#R205) THIS PIN SAID "NO DEM TILES", AND THE INVARIANT IS NARROWER THAN THAT. What #R197
     established, and what still has to hold, is that THE MODEL'S FLOOR CANNOT HAVE HOLES: it does not
     depend on ninety DEM tiles arriving, because the bundled 0.25° image answers for every cell.
     #R205 adds a LOCAL patch of measured DEM around the epicentre, which refines cells the bundled
     image already answered for and is simply absent when the tiles do not arrive — so the property
     #R197 cared about is unchanged, and the property this test asserted (the word does not appear)
     was a proxy for it. The proxy is replaced by the thing itself. */
  assert.match(tsu, /const B=window\.IntMapBathymetry;/, 'the sea floor is the bundled one');
  assert.match(tsu, /if\(!B\)\{ lastErr='nobathy'/, 'and without it the run refuses rather than guessing');
  assert.match(tsu, /bathy:B\.slice\(\)/, 'every run is handed the bundled floor');
  /* any DEM use must be a REFINEMENT that fails soft: caught, nullable, and never a precondition */
  if (/warmDEMTiles/.test(tsu)) {
    assert.match(tsu, /try\{ fine=await fineFloor\(my\); \}catch\(_\)\{ fine=null; \}/,
      'a DEM patch that fails must leave the run exactly as it was');
    assert.match(tsu, /fine:fine\?\{/, 'and it is passed as an optional extra, not as the floor');
    const worker = rd('src/tsunami-worker.js');
    assert.match(worker, /if \(frac == null\) \{/, 'the worker falls back to the bundled floor per cell');
  }
  /* the manifest the loader and the builder both agree on */
  const man = JSON.parse(rd('data/bathymetry.json'));
  assert.equal(man.width, 1440); assert.equal(man.height, 720);
  assert.equal(man.degrees, 0.25);
  assert.ok(man.seaCellFraction > 0.6 && man.seaCellFraction < 0.75, `sea fraction ${man.seaCellFraction}`);
  assert.ok(man.maxDepthM > 8000, `deepest cell ${man.maxDepthM} m`);
  const bm = rd('js/bathymetry.js');
  assert.match(bm, /const W=1440, H=720;/, 'the loader is built for the same raster');
  assert.ok(fs.statSync(path.join(ROOT, 'data/bathymetry.png')).size < 3_000_000, 'and it stays under 3 MB');
});

test('R197 ②d thirty hours, everywhere it is written down', () => {
  const tsu = rd('js/tsunami.js');
  assert.match(tsu, /\[3,6,9,12,18,24,30\]/, 'the panel offers it');
  assert.match(tsu, /setHours\(h\)\{ hours=Math\.max\(1,Math\.min\(30,\+h\|\|6\)\); /, 'the API accepts it');
  assert.match(rd('src/tsunami-worker.js'), /Math\.min\(30, m\.hours\)/, 'and the solver honours it');
  assert.match(rd('js/atlas-console.js'), /"hours"\?:1-30/, 'and the catalogue documents it');
});
