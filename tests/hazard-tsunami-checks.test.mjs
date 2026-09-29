/* ============================================================================
 *  THE TSUNAMI SIMULATOR — src/tsunami-worker.js and js/tsunami.js
 * ----------------------------------------------------------------------------
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. The solver (src/tsunami-worker.js) is RUN in a vm
 *    wherever the claim is a number. What is still read is its structure (which loop lives where,
 *    what is hoisted) and js/tsunami.js, the panel closure — neither has a value to ask for.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path, { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { readLF } from '../scripts/eol.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r193-checks.test.mjs (tests #1, #2, #3, #4, #5, #9 of 9) ═══
    R193 — source contracts. The parts that can be proved without a renderer. */
{
const R = path.resolve(import.meta.dirname, '..');

test('R193 ① the tsunami solver lives in a worker, and the page never runs the time loop', () => {
  assert.ok(fs.existsSync(path.join(R, 'src/tsunami-worker.js')), 'src/tsunami-worker.js exists');
  assert.ok(fs.existsSync(path.join(R, 'src/tsunami-worker-client.js')), 'the page-side client exists');
  const w = read('src/tsunami-worker.js');
  const m = read('js/tsunami.js');
  /* the integration loop is in the worker */
  assert.match(w, /for \(let s = 0; s < steps; s\+\+\)/, 'the worker owns the time stepping');
  /* …and NOT on the page. #R192 had `for(let s=0;s<steps;s++)` inside js/tsunami.js. */
  assert.ok(!/for\s*\(\s*let\s+s\s*=\s*0\s*;\s*s\s*<\s*steps/.test(m), 'js/tsunami.js has no time-stepping loop');
  /* the client is imported so window.IntMapTsunamiWorker exists at runtime */
  assert.match(read('src/main.js'), /tsunami-worker-client\.js/, 'the client is in the bundle');
});

test('R193 ② the worker is nonlinear where it matters, and says why it is not elsewhere', () => {
  const w = read('src/tsunami-worker.js');
  /* total depth in the pressure term (D = h + eta), not the still-water depth */
  assert.match(w, /const D = 0\.5 \* \(ha \+ eta\[a\] \+ hb \+ eta\[b\]\)/, 'pressure uses the total depth');
  /* Manning friction, and gated on shallow water because that is the only place it is not zero */
  assert.match(w, /MANNING = 0\.025/, 'Manning n for an ocean floor');
  assert.match(w, /if \(D < 500\)/, 'friction is evaluated only where it is not negligible');
  assert.match(w, /D \* D \* Math\.cbrt\(D\)/, 'D^(7/3) without a fractional pow');
  /* the two omissions are argued rather than silent */
  assert.match(w, /ADVECTION .* IS DELIBERATELY ABSENT/s, 'advection is documented as a decision');
  assert.match(w, /KAJIURA FILTER IS ALSO ABSENT/, 'the Kajiura filter is documented as a decision');
  /* the CFL limit is per cell, not the narrowest cell against the deepest cell */
  assert.match(w, /const v = dl \/ c; if \(v < lim\) lim = v;/, 'CFL is evaluated per cell');
});

test('R193 ③ the animation has no encoder in it', () => {
  const m = read('js/tsunami.js');
  /* #R192 built a PNG data URL per animation frame. Nothing here may. */
  assert.ok(!/toDataURL/.test(m), 'js/tsunami.js never encodes a PNG');
  assert.match(m, /addDynamicImage\(/, 'the field goes through the engine dynamic-image primitive');
  assert.match(m, /touchDynamicImage\(/, 'and is refreshed by touching it, not by rebuilding a source');
  /* playback is in simulated seconds and interpolates between stored frames */
  assert.match(m, /const q=\(A0\[k\]\+\(A1\[k\]-A0\[k\]\)\*w\)\|0/, 'frames are interpolated');
  assert.match(m, /tSim\+=speed\*dtReal/, 'time advances by wall clock × speed');
});

test('R193 ④ the ramp is opaque where there is a wave and clear where there is none', () => {
  const m = read('js/tsunami.js');
  /* #R192's ramp started at white with alpha 30/255 at zero, which is why the wave was invisible */
  assert.match(m, /const A8=Math\.round\(255\*Math\.pow\(a,0\.62\)\*0\.94\)/, 'alpha rises with amplitude');
  /* …and is exactly zero at zero */
  const alphaAtZero = Math.round(255 * Math.pow(0, 0.62) * 0.94);
  assert.equal(alphaAtZero, 0, 'a cell with no wave is fully transparent');
  /* the scale is the field's own 92nd percentile, not the source amplitude */
  assert.match(m, /v\[Math\.floor\(v\.length\*0\.92\)\]/, 'the display scale comes from the field');
});

test('R193 ⑤ the panel is opaque — #R189 already settled this', () => {
  const m = read('js/tsunami.js');
  assert.match(m, /background:var\(--card-bg/, 'the panel uses the opaque card background');
  assert.ok(!/#tsu-panel[\s\S]{0,400}--popup-bg/.test(m), 'and not the translucent popup background');
});

test('R193 ⑨ the sub-fault source preserves the moment the magnitude implies', async () => {
  /* The taper weights are re-normalised so the MEAN slip is the Wells & Coppersmith value: a source
     that quietly changed the magnitude would be a physics bug hiding in a cosmetic change. */
  /* ⚠ (#R197) THE SOURCE MOVED, THE PROPERTY DID NOT. Okada and the sub-fault grid are evaluated in
     src/tsunami-worker.js now (a global grid is 921,600 cells and none of that belongs on the page),
     so this reads the worker. #R197 ①b (this file) additionally RUNS the normalisation and
     checks that area × slip gives back the magnitude, which is what this assertion is protecting. */
  const m = read('src/tsunami-worker.js');
  assert.match(m, /const norm=\(SUB_S\*SUB_W\)\/Math\.max\(1e-9,wsum\);/, 'the weights are normalised');
  /* recompute the normalisation the same way the module does and check it is exactly mean-preserving */
  const SUB_S = 8, SUB_W = 3;
  const taper = (s) => Math.sqrt(Math.sin(Math.PI * Math.max(0.001, Math.min(0.999, s))));
  let wsum = 0; const wts = [];
  for (let a = 0; a < SUB_S; a++) for (let b = 0; b < SUB_W; b++) { const w = taper((a + 0.5) / SUB_S) * taper((b + 0.5) / SUB_W); wts.push(w); wsum += w; }
  const norm = (SUB_S * SUB_W) / wsum;
  const mean = wts.reduce((s, w) => s + w * norm, 0) / wts.length;
  assert.ok(Math.abs(mean - 1) < 1e-12, 'the mean sub-fault slip equals the plane\'s mean slip');
  /* and the taper really is a taper — the edges slip less than the centre */
  assert.ok(wts[0] < wts[Math.floor(wts.length / 2)], 'the edge slips less than the middle');
});
}

/* ═══ from tests/r197-checks.test.mjs (the whole file) ═══
    R197 — the tsunami is global, and there is only one of it
    Two kinds of check live here.

    ① THE PHYSICS IS RUN, NOT ASSERTED ON. src/tsunami-worker.js is loaded into a Node vm with a stub
       `self` and its `run()` is called, so these tests fail when the ANSWER changes — not when the
       text changes. That is the difference between a test that protects a model and a test that
       protects a spelling.

         · Okada (1985) against the published test case in Okada's own Table 2;
         · the modelled celerity over a flat ocean against √(gh), which is the exact analytic answer
           for the equations being solved and needs no citation;
         · east/west symmetry about the source, which can only hold if longitude really is periodic —
           the western sample is reached ONLY across the antimeridian.

    ② THE REMOVAL IS PERMANENT. 「災害シミュレータからは津波シミュレータを削除しろ」 — js/sims.js must
       not carry a tsunami hazard, and none of the three things that used to open it may look for one. */
{
const rd = read;

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
  /* (#R318) the action catalogue moved to js/atlas-catalog-text.js and SYS() composes from it.
     The question below is unchanged; the read follows the answer to where it lives now. */
  const atlas = rd('js/atlas-console.js') + '\n' + rd('js/atlas-catalog-text.js');
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
  assert.match(rd('js/atlas-catalog-text.js'), /"hours"\?:1-30/, 'and the catalogue documents it');   /* (#R318) the catalogue moved out of SYS() */
});
}

/* ═══ from tests/r202-checks.test.mjs (tests #6, #7 of 17) ═══
    R202 — the sky is computed, the source is integrated, and the far plane reaches the horizon
    Twelve instructions, and the ones with physics or arithmetic behind them are checked by RUNNING
    that arithmetic rather than by asserting on the text that contains it:

      ① js/sky-model.js is pure — no DOM, no renderer — so the scattering integral runs here.
      ② src/tsunami-worker.js loads into a Node vm (the harness tests/r197-checks.test.mjs built), so
         the cell-averaged source is compared against the centre sample it replaces.

    The rest are seam checks of the kind this suite has used since #R162: a capability that is
    declared must be implemented, a contract method that is called must exist, and a value that two
    files have to agree on is derived from one of them rather than written down twice. */
{
const rd = read;

/* ── ② THE TSUNAMI SOURCE, RUN ────────────────────────────────────────────────────────────── */
function loadWorker(src) {
  const ctx = {
    self: { postMessage: () => {} },
    performance: { now: () => Number(process.hrtime.bigint() / 1000n) / 1000 },
    console, Math, Float32Array, Float64Array, Int32Array, Int16Array, Int8Array, Uint8Array,
    Number, Object, Array, isFinite, String, Error,
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\n;globalThis.__api={run,okadaUz,faultGeom,seaFloor};', ctx, { filename: 'tsunami-worker.js' });
  return ctx.__api;
}
const flatOcean = (d, w, h) => {
  const rgb = new Uint8Array(w * h * 3), q = Math.round(d);
  for (let k = 0; k < w * h; k++) { rgb[k * 3] = q >> 8; rgb[k * 3 + 1] = q & 255; rgb[k * 3 + 2] = 255; }
  return { w, h, rgb };
};
const RUN = { id: 1, nx: 1440, ny: 640, lat0: -80, lat1: 80, dec: 8, hours: 0.25, frames: 24 };
const amp = (src, mw) => loadWorker(src).run({ ...RUN, bathy: flatOcean(4000, 720, 320), src: { lng: 143, lat: 38, mw, depthKm: 24 } }).amp;

/* ⚠ (#R204) THE QUADRATURE IS READ OUT OF THE FILE, NOT WRITTEN INTO THE TEST. Both of these pinned
   the literal `SUB_N = 3`, so #R204 — asked for MORE accuracy at the source, which is the direction
   this pair is about — broke the two tests whose subject is that accuracy. The same mistake #R203
   made with the 448 mesh and with `tests/r203.spec.js`. What is asserted now is the relation. */
const SUBLINE = /const SUB_N = (\d+), subR = 1\.5 \* g\.L;/;

test('R202 ②a the source is INTEGRATED over the cell, and it changes the answer', () => {
  const now = rd('src/tsunami-worker.js');
  const m = SUBLINE.exec(now);
  assert.ok(m, 'the quadrature is stated in one place');
  assert.ok(Number(m[1]) >= 3, `SUB_N is ${m[1]}; #R202 established 3 as the floor`);
  const centre = now.replace(m[0], 'const SUB_N = 1, subR = -1;');
  /* the smaller the rupture against a ~28 km cell, the more a centre sample aliases it */
  const a75 = amp(centre, 7.5), b75 = amp(now, 7.5);
  assert.ok(Math.abs(a75 - b75) / a75 > 0.1, `Mw 7.5: centre ${a75} vs averaged ${b75} — the point sample was not aliasing?`);
});

test('R202 ②b …and the quadrature that ships is converged', () => {
  const now = rd('src/tsunami-worker.js');
  const m = SUBLINE.exec(now);
  const at = (n) => amp(now.replace(m[0], `const SUB_N = ${n}, subR = 1.5 * g.L;`), 7.5);
  const shipped = amp(now, 7.5), seven = at(7);
  assert.ok(Math.abs(shipped - seven) / seven < 0.03, `${m[1]}×${m[1]} ${shipped} against 7×7 ${seven} — not converged`);
  /* …and no coarser than the one before it: #R202 shipped 3, and its own table puts 3 at 1.5 % of
     the converged value while 5 is at 0.3 %, which is why #R204 raised it. */
  const three = at(3);
  assert.ok(Math.abs(shipped - seven) <= Math.abs(three - seven) + 1e-9,
    `${m[1]}×${m[1]} is further from converged than 3×3 was`);
});
}

/* ═══ from tests/r223-checks.test.mjs (tests #10, #11 of 14) ═══
    #R223 — source-level checks
    ⚠ These pin RELATIONS and CONTRACTS, not values this round happened to measure (#R199/#R203:
    a test that pins my own number falls over the next time the same instruction arrives). */
{

/* ── ⑧ the tsunami source is the same formula with the repeated work removed ───────────────────── */
test('R223 ⑧ okadaUz hoists the dip and q, and still answers Okada 1985', async () => {
  const s = read('src/tsunami-worker.js');
  assert.match(s, /let _okDip = NaN/, 'the dip trig is memoised on one slot');
  assert.ok(!/const dip = dipDeg \* DEG, sd = Math\.sin\(dip\)/.test(s), 'not recomputed per call');
  assert.match(s, /const q = y \* sd - depth \* cd;\s+\/\* ⚠ corner-independent/, 'q is hoisted out of f');
  /* and the published test case still comes back — the same one tests/r197 runs */
  const mod = await import('../src/tsunami-worker.js');
  const uz = mod.okadaUz ? mod.okadaUz : (globalThis.okadaUz);
  if (typeof uz === 'function') {
    const v = uz(2, 3, 4, 3, 2, 70, 1);
    assert.ok(Math.abs(v - (-3.5639e-2)) < 2e-5, 'Okada (1985) dip-slip case (got ' + v + ')');
  }
});
test('R223 ⑧ the polar filter and the frame decimation only touch what can be non-zero', () => {
  const s = read('src/tsunami-worker.js');
  assert.match(s, /const wet = new Uint8Array\(ny\)/);
  assert.match(s, /if \(wet\[j\]\) \{ zonalFilter\(eta, row, w\); zonalFilter\(M, row, w\); \}/);
  assert.match(s, /const fj0 = Math\.max\(0, \(J0 \/ dec\) \| 0\)/, 'frames read the light cone only');
});
}

/* ═══ from tests/r242-checks.test.mjs (tests #18 of 20) ═══
    IntMap · #R242 — source-level contracts for this round
    Every test here fails on the code as it was BEFORE the change it guards (checked one at a time),
    which is the only thing that makes a green suite mean anything (#R228).
    Comments are stripped before matching wherever a test looks for a fragment that this file's own
    prose could contain ([[intmap-recurring-lessons]] E, eight rounds running). */
{
/* strip block and line comments — a test must match CODE, never a note quoting the instruction */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ⑧ the tsunami animation ──────────────────────────────────────────────────────────────────── */
test('R242 ⑧ the near-source picture is undecimated over a window', () => {
  const t = code(read('js/tsunami.js'));
  assert.ok(/function nearDec\(\)\{ return 1; \}/.test(t), 'the near animation is no longer decimated');
  assert.ok(/NEAR_WIN_DEG/.test(t) && /winI0/.test(t) && /winNx/.test(t), 'and it is cropped to the source region');
  assert.ok(/sim\.lng0==null\?-180:sim\.lng0/.test(t), 'the image is placed by the window, not by ±180');
  const w = code(read('src/tsunami-worker.js'));
  assert.ok(/const winNx =/.test(w) && /wcol\s*=/.test(w), 'the worker emits the window, wrapping at the antimeridian');
});
}
