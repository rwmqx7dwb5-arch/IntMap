/* ============================================================================
 *  IntMap · FINDING WHERE A PHOTOGRAPH WAS TAKEN, FROM ITS SKYLINE
 *  (js/photo-geo-terrain.js, -skyline.js, -match.js, -search.js, -exif.js, -vision.js, photo-geo.js)
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r527-checks, tests/r537-checks and tests/r547-checks.
 *
 *  #R527 — these drive the SHIPPED modules over synthetic terrain and a hand-built JPEG header.
 *  Nothing here is a copy of the implementation, and every number asserted below is either analytic
 *  (the dip of the sea horizon from a known eye height) or was MEASURED during #R527 and is recorded
 *  in docs/PHOTO-GEOLOCATION.md.
 *  ⚠ THE ONES THAT MATTER MOST ARE R527 ④, ⑥ AND ⑨. Each fixes a bug that shipped-looking code had:
 *  ④ the property the whole 360-degree search rests on; ⑥ the rule that picks a field of view, which
 *  was wrong twice in opposite directions before real photographs settled it (and ⑥b pins why it is
 *  NOT the rule that ranks candidates against one another); ⑨ the rule that an EXIF coordinate is
 *  never allowed to become an answer.
 *
 *  #R537 — THE STOP BUTTON THAT WAS UNREACHABLE, AND TWO OTHER THINGS #R527 SHIPPED WRONG. Verifying
 *  #R527 ON PRODUCTION found three defects that every gate had passed, all the same shape: code that
 *  is correct where it was written and never reached where it runs.
 *   ① THE STOP BUTTON. js/photo-geo-search.js asked `hooks.shouldAbort()` on every point — from a
 *     SYNCHRONOUS loop. In a Worker the flag is set by `self.onmessage`, and a worker running a
 *     synchronous loop never returns to its event loop. MEASURED on production three times: stop
 *     pressed during the sweep, ignored every time, run completed and reported `done`/`match`.
 *   ② `state()` THREW between the drop and the decode (`state.orig` arrives about a second after
 *     `state.file`), and Atlas polls that accessor.
 *   ③ A BARE `{"type":"photoLocate"}` STARTED A REAL SEARCH — 625 points, 280 tiles, ~12 MB — with
 *     no confirmation, and (because of ①) no way to stop it.
 *
 *  #R547 — ASKING A VISION MODEL WHERE THE SKY STOPS. #R505 is the round where a suite that read
 *  source text stayed green while production answered 500 to every request, and #R527's own trace
 *  had never had a test that looked at what it produced. So: synthetic images go in, real traces
 *  come out, and the assertions are about the traces.
 *
 *  ⚠ ISOLATION: the modules publish onto `window`, which is this process's globalThis (set once,
 *  below, before anything is imported). No test replaces a global.
 * ==========================================================================*/
import test from 'node:test';
import { LAZY_REGISTRY, LAZY_NAMES } from '../js/lazy-modules.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
await import('../js/photo-geo-terrain.js');
await import('../js/photo-geo-match.js');
await import('../js/photo-geo-skyline.js');
await import('../js/photo-geo-search.js');
await import('../js/photo-geo-exif.js');
await import('../js/photo-geo-vision.js');
const T = globalThis.IntMapPhotoTerrain, M = globalThis.IntMapPhotoMatch,
  S = globalThis.IntMapPhotoSkyline, Q = globalThis.IntMapPhotoSearch, X = globalThis.IntMapPhotoExif;
const V = globalThis.IntMapPhotoVision;
const SEARCH = Q;

const src = (f) => readFileSync(join(ROOT, f), 'utf8');
const rd = src;

/* a tile store whose every tile is one elevation — enough to make analytic terrain */
function flatStore(metres) {
  /* ⚠ ONE array, handed back for every tile. buildField asks the store once per CELL, and a store
     that allocates 65,536 floats per call turns a two-second test into an unfinishable one. */
  const tile = new Float32Array(65536).fill(metres);
  return { get: () => tile };
}

/* ══════════════════ #R527 — the skyline search ══════════════════ */
function rgba(px) {
  const d = new Uint8ClampedArray(px.length * 4);
  px.forEach((p, i) => { d[i * 4] = p[0]; d[i * 4 + 1] = p[1]; d[i * 4 + 2] = p[2]; d[i * 4 + 3] = p.length > 3 ? p[3] : 255; });
  return d;
}

test('R527 ①: the terrarium decoder knows a void, a spike and the sea from a depth', () => {
  /* 0 m is (128,0,0); a void tile pixel is (0,0,0,255) and an untouched canvas pixel (0,0,0,0) */
  const enc = (m) => { const v = m + 32768; const r = Math.floor(v / 256); const g = Math.floor(v - r * 256); return [r, g, Math.round((v - r * 256 - g) * 256)]; };
  const flat = Array.from({ length: 256 * 256 }, () => enc(100));
  const one = (i, px) => { const a = flat.slice(); a[i] = px; return a; };

  assert.equal(T.decodeTerrarium(rgba(flat)).el[0], 100, 'a plain elevation survives');

  /* the sea-surface rule: bathymetry is raised to 0, a real depression is not */
  let r = T.decodeTerrarium(rgba(one(500, enc(-4292))));
  assert.equal(r.el[500], 0, 'ocean floor is read as the sea SURFACE, which is what a camera sees');
  r = T.decodeTerrarium(rgba(one(500, enc(-412))));
  assert.equal(r.el[500], -412, 'the Dead Sea shore is real land and is left alone');
  assert.ok(T.SEA_CLAMP_M < -430, 'the clamp sits below the deepest exposed land on earth');

  /* a void is NaN, never 32.8 km down */
  r = T.decodeTerrarium(rgba(one(500, [0, 0, 0, 255])));
  assert.ok(Number.isNaN(r.el[500]), 'a void terrarium pixel is no data');
  r = T.decodeTerrarium(rgba(one(500, [0, 0, 0, 0])));
  assert.ok(Number.isNaN(r.el[500]), 'an untouched canvas pixel is no data too');

  /* ⚠ THE MEASURED ARTEFACT: tile z9/451/199 carries 32,767 m on the Toyama coastline */
  r = T.decodeTerrarium(rgba(one(500, [255, 255, 255])));
  assert.ok(Number.isNaN(r.el[500]), '32,767 m is not a place on earth');
  /* and the contextual one: a cell standing 900 m above all four neighbours */
  const spikeAt = 130 * 256 + 130;
  r = T.decodeTerrarium(rgba(one(spikeAt, enc(1000))));
  assert.ok(Number.isNaN(r.el[spikeAt]), 'a cell 900 m above all four neighbours is an artefact, not a needle');
  assert.equal(r.spikes, 1, 'and it is counted rather than silently dropped');
  /* a cliff is NOT a spike: its uphill neighbour is as high as it is */
  const half = flat.slice();
  for (let y = 0; y < 256; y++) for (let x = 128; x < 256; x++) half[y * 256 + x] = enc(1000);
  const rc = T.decodeTerrarium(rgba(half));
  assert.equal(rc.spikes, 0, 'a 900 m cliff face survives, because a cliff has a top');
});

test('R527 ②: the horizon over a flat sea is the dip its eye height implies', () => {
  const area = { south: -0.02, north: 0.02, west: -0.02, east: 0.02 };
  /* ⚠ THE BAND MUST REACH THE HORIZON IT IS BEING ASKED ABOUT. The sea horizon for an eye h metres
     up lies at sqrt(2*k*R*h): 4.8 km at 1.6 m but 54 km at 200 m. Carrying terrain only to 14 km
     and asking about a 200 m eye reported -0.878 degrees against an analytic -0.427 — not a bug in
     the walk but the honest answer to a different question, because the last water the ray met was
     14 km away and only 13.6 m below the tangent plane. Bands here reach past the horizon of every
     eye height tested; the truncation itself is asserted separately below. */
  const BANDS = [{ r: 3000, z: 13 }, { r: 30000, z: 11 }];
  const field = T.buildField({ lat: 0, lon: 0 }, area, flatStore(0), { bands: BANDS });
  for (const eye of [1.6, 20]) {
    const H = T.horizon(field, 0, 0, { nAz: 32, observerHeightM: eye });
    assert.ok(H, 'flat terrain still produces a horizon');
    const want = T.horizonDipDeg(eye);
    for (let i = 0; i < H.nAz; i++) {
      assert.ok(Math.abs(H.elev[i] - want) < 0.004,
        `eye ${eye} m: azimuth ${i} read ${H.elev[i].toFixed(4)}, analytic dip ${want.toFixed(4)}`);
    }
    assert.equal(H.coverage, 1, 'and every azimuth was answered');
    assert.equal(H.groundM, 0);
    assert.equal(H.eyeM, eye);
  }
  /* the dip is negative and deepens with height — a sanity direction, not a magnitude */
  assert.ok(T.horizonDipDeg(200) < T.horizonDipDeg(2), 'a higher eye sees further down');

  /* …and the truncation itself, stated rather than left to be discovered: a horizon radius shorter
     than the eye's own sea horizon reports a steeper dip, because the furthest water the ray met
     has not yet fallen the whole way. This is why the shipped BANDS reach 150 km. */
  const shortField = T.buildField({ lat: 0, lon: 0 }, area, flatStore(0), { bands: [{ r: 3000, z: 13 }, { r: 14000, z: 11 }] });
  const truncated = T.horizon(shortField, 0, 0, { nAz: 8, observerHeightM: 200 });
  assert.ok(truncated.elev[0] < T.horizonDipDeg(200) - 0.2,
    `a 14 km field reports a 200 m eye's horizon too low (${truncated.elev[0].toFixed(3)} vs ${T.horizonDipDeg(200).toFixed(3)})`);
  assert.ok(T.BANDS[T.BANDS.length - 1].r >= 150000, 'the shipped bands reach 150 km');
});

test('R527 ③: the camera model round-trips a pixel through a direction and back', () => {
  let worst = 0;
  for (const yaw of [0, 37, 190, 359]) for (const pitch of [-15, 0, 12]) for (const roll of [-10, 0, 8]) {
    const cam = M.basis(yaw, pitch, roll), f = M.focalFromHFov(1200, 55);
    for (const [u, v] of [[10, 10], [600, 400], [1190, 790], [300, 700]]) {
      const d = M.pixelToDir(u, v, cam, f, 600, 400);
      const p = M.dirToPixel(d.az, d.elev, cam, f, 600, 400);
      assert.ok(p.front, 'a pixel inside the frame is in front of the camera');
      worst = Math.max(worst, Math.hypot(p.u - u, p.v - v));
    }
  }
  assert.ok(worst < 1e-6, `worst round-trip error ${worst}`);
  assert.ok(Math.abs(M.hFovFromFocal(1000, M.focalFromHFov(1000, 63)) - 63) < 1e-9);
});

test('R527 ④: yaw is a pure shift in azimuth — the property the 360-degree search rests on', () => {
  /* Rotating a camera about the VERTICAL adds a constant to every azimuth and changes no elevation.
     That is what lets the photograph be turned into angles ONCE and matched at 360 bearings by
     lookup. If this ever stops holding, the search is not merely slower, it is wrong. */
  for (const pitch of [-12, 0, 9]) for (const roll of [-7, 0, 5]) {
    const f = M.focalFromHFov(800, 48);
    const a = M.basis(0, pitch, roll), b = M.basis(73.5, pitch, roll);
    for (const [u, v] of [[20, 30], [400, 300], [780, 560]]) {
      const da = M.pixelToDir(u, v, a, f, 400, 300);
      const db = M.pixelToDir(u, v, b, f, 400, 300);
      const shift = ((db.az - da.az) % 360 + 360) % 360;
      assert.ok(Math.abs(shift - 73.5) < 1e-9, `azimuth shifted by ${shift}, not by the yaw`);
      assert.ok(Math.abs(db.elev - da.elev) < 1e-9, 'elevation is untouched by yaw');
    }
  }
});

/* a horizon with real structure, built directly — these tests are about SCORING, not terrain */
function synthHorizon(nAz) {
  const elev = new Float32Array(nAz), dist = new Float32Array(nAz);
  for (let i = 0; i < nAz; i++) {
    const a = i * 2 * Math.PI / nAz;
    elev[i] = 6 * Math.sin(3 * a) + 3 * Math.sin(7 * a + 1) + 2 * Math.sin(11 * a + 2);
    dist[i] = 10000;
  }
  return { nAz, elev, dist, coverage: 1 };
}

test('R527 ⑤: a photo curve carries the sky it spans, and a masked column is not evidence', () => {
  const w = 400, h = 300;
  const sky = new Int32Array(w).fill(150), use = new Uint8Array(w).fill(1);
  const c1 = M.photoCurve(sky, use, w, h, { hfovDeg: 60, samples: 64 });
  assert.ok(Math.abs(c1.spanDeg - 60) < 3, `a 60 degree lens spans about 60 degrees, got ${c1.spanDeg}`);
  const cNarrow = M.photoCurve(sky, use, w, h, { hfovDeg: 20, samples: 64 });
  assert.ok(cNarrow.spanDeg < c1.spanDeg / 2, 'a narrower lens spans proportionally less sky');
  /* masking removes columns from the evidence entirely */
  for (let x = 0; x < 200; x++) use[x] = 0;
  const c2 = M.photoCurve(sky, use, w, h, { hfovDeg: 60, samples: 64 });
  assert.ok(c2.columnsUsed === 200, 'masked columns are gone, not merely discounted');
  assert.ok(c2.spanDeg < c1.spanDeg * 0.8, 'and the sky the fit can speak for shrinks with them');
});

test('R527 ⑥: degrees of skyline explained, not agreement per column, is what picks the LENS', () => {
  /* ⚠ THE BUG THIS FIXES SHIPPED TWICE, IN OPPOSITE DIRECTIONS.
     Ranked by mean agreement per column, a NARROW hypothesis wins: it asks the terrain a smaller
     question, and a smaller question is easier to answer. MEASURED on real photographs, every
     winner came back at the narrowest rung offered (14-18 degrees) and the top candidate was
     3.5 km from the truth. Ranked by degrees explained, the same data put it 0.40 km out.
     Here the same thing is shown analytically: a curve that matches 60 degrees at 70% agreement is
     stronger evidence than one that matches 15 degrees perfectly, and `score` cannot say so. */
  const H = synthHorizon(1440);
  const w = 900, h = 600;
  const sky = new Int32Array(w), use = new Uint8Array(w).fill(1);
  /* render a skyline from H at a known camera, so the WIDE hypothesis is the true one */
  const TRUE_FOV = 60, TRUE_YAW = 100;
  const cam = M.basis(TRUE_YAW, 0, 0), f = M.focalFromHFov(w, TRUE_FOV);
  for (let x = 0; x < w; x++) {
    let lo = 0, hi = h - 1;
    const g = (v) => { const d = M.pixelToDir(x + 0.5, v + 0.5, cam, f, w / 2, h / 2); return d.elev - M.horizonAt(H, d.az); };
    if (!(g(lo) > 0 && g(hi) < 0)) { use[x] = 0; sky[x] = 0; continue; }
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (g(m) > 0) lo = m; else hi = m; }
    sky[x] = Math.round((lo + hi) / 2);
  }
  const wide = M.photoCurve(sky, use, w, h, { hfovDeg: TRUE_FOV, samples: 96 });
  const narrow = M.photoCurve(sky, use, w, h, { hfovDeg: 15, samples: 96 });
  const rw = M.searchYaw(wide, H, { nYaw: 720 });
  const rn = M.searchYaw(narrow, H, { nYaw: 720 });
  assert.ok(Math.abs(((rw.yawDeg - TRUE_YAW) % 360 + 540) % 360 - 180) < 2,
    `the true field of view recovers the true bearing (got ${rw.yawDeg}, true ${TRUE_YAW})`);
  assert.ok(rw.explainedDeg > rn.explainedDeg,
    `the true wide fit must explain more sky (${rw.explainedDeg.toFixed(1)}) than a narrow one (${rn.explainedDeg.toFixed(1)})`);
  assert.ok(rw.explainedDeg > 40, 'and it explains most of the frame');
  /* the leash that keeps `explainedDeg` honest — without it the optimiser just widens the lens */
  assert.ok(M.REFINE_FOV_BAND > 0 && M.REFINE_FOV_BAND < 0.5, 'the refinement is leashed to its rung');
  assert.ok(M.FOV_LADDER.length >= 6 && M.FOV_LADDER[0] < 25 && M.FOV_LADDER[M.FOV_LADDER.length - 1] > 90,
    'the ladder spans telephoto to ultra-wide');
});

test('R527 ⑥b: the two ranking keys are DIFFERENT on purpose, and neither may be tidied into the other', () => {
  /* ⚠ READ, NOT RUN: the asymmetry of the two keys is a recorded design decision in the source; its behavioural half is the suppressNearby calls at the end. */
  /* ⚠ THIS TEST EXISTS BECAUSE THE "OBVIOUS" CLEANUP WAS MADE AND MEASURED, AND IT WAS WORSE.
     A candidate's LENS is chosen by `explainedDeg` (model selection between hypotheses that use
     different amounts of evidence); the candidates are then ranked against each other by `score`
     (a fit question, asked once the lens is fixed, where every candidate uses the same columns).
     Making both keys the same read tidier and, over the twelve evaluation photographs, turned
     «3 confident answers, two of them inside 1 km» into «6 confident answers, none inside 1 km».
     A future round that notices the asymmetry should read js/photo-geo-search.js before removing it. */
  const search = src('js/photo-geo-search.js');
  const match = src('js/photo-geo-match.js');
  assert.match(search, /var RANK = o\.rankBy \|\| 'score';/,
    'candidates are ranked against one another by score');
  assert.match(match, /if \(!best \|\| got\.explainedDeg > best\.explainedDeg\)/,
    'but the field-of-view hypothesis for one candidate is chosen by degrees explained');
  assert.match(match, /function suppressNearby\(cands, minSeparationM, key\)/,
    'the key is passed in rather than assumed, so the two callers can differ out loud');
  assert.match(search, /TWO QUESTIONS, TWO ANSWERS/,
    'and the measurement that settled it is recorded where the choice is made');
  /* the ordering really does follow the key it is given */
  const mk = (e, n, score, explainedDeg) => ({ e, n, score, explainedDeg });
  const cands = [mk(0, 0, 0.9, 10), mk(5000, 0, 0.5, 40)];
  assert.equal(M.suppressNearby(cands, 400, 'score')[0].explainedDeg, 10);
  assert.equal(M.suppressNearby(cands, 400, 'explainedDeg')[0].explainedDeg, 40);
  assert.equal(M.suppressNearby(cands, 400)[0].explainedDeg, 10, 'the default key is score');
});

test('R527 ⑦: the verdict is allowed to say no, and says which kind of no', () => {
  const ok = {
    score: 0.7, agreement: 0.7, inlierFrac: 0.7, evaluatedFrac: 1,
    explainedDeg: 40, reliefDeg: 6, z: 9
  };
  assert.equal(M.verdict([ok]).code, 'match');
  assert.equal(M.verdict([]).code, 'no_match', 'nothing scored is not a match');
  assert.equal(M.verdict([{ ...ok, evaluatedFrac: 0.2 }]).code, 'insufficient_evidence');
  assert.equal(M.verdict([{ ...ok, reliefDeg: 0.4 }]).code, 'insufficient_evidence',
    'a skyline that is nearly a straight line cannot identify a place');
  assert.equal(M.verdict([{ ...ok, explainedDeg: 5 }]).code, 'insufficient_evidence',
    'five degrees of agreeing sky is not a location');
  assert.equal(M.verdict([{ ...ok, score: 0.05, inlierFrac: 0.05 }]).code, 'no_match');
  assert.equal(M.verdict([{ ...ok, z: 1 }]).code, 'no_match',
    'a bearing no better than an arbitrary one is not a bearing');
  /* the margin travels with a match so the caller can show the rival rather than hide it */
  const v = M.verdict([ok, { ...ok, score: 0.699 }]);
  assert.equal(v.code, 'match');
  assert.ok(v.relMargin < 0.01, 'a close second is reported as a close second');
  /* and every threshold is reported with the verdict, never applied invisibly */
  for (const k of ['minScore', 'minInlierFrac', 'minEvaluatedFrac', 'minExplainedDeg', 'minReliefDeg', 'minZ'])
    assert.ok(v.thresholds[k] != null, `threshold ${k} travels with the verdict`);
});

test('R527 ⑧: the plan is stated before the search, and a coordinate carries the grid it came from', () => {
  /* ⚠ READ, NOT RUN: the plan is run above; the spacing caption is printed by the panel (js/photo-geo.js), which needs a DOM. */
  const area = { south: 46.5, north: 46.6, west: 8.0, east: 8.1 };
  const p = Q.plan(area);
  assert.ok(p.spacingM > 0 && p.coarsePoints > 0, 'the reader is told the spacing and the point count');
  assert.ok(p.tiles > 0 && p.approxDownloadBytes > 0 && p.approxTerrainMemoryBytes > 0,
    'and what it will cost to fetch and to hold');
  assert.ok(p.horizonRadiusM >= 100000,
    'terrain is read far BEYOND the camera rectangle — the two rectangles are not the same');
  /* a larger rectangle widens the spacing rather than silently sampling the same grid */
  const big = Q.plan({ south: 46, north: 47, west: 8, east: 9 });
  assert.ok(big.spacingM > p.spacingM * 3, 'a ten-times-wider area widens the grid, it does not pretend');
  assert.equal(big.spacingIsCoarse, true, 'and it says so');
  /* the honest-coordinate rule, asserted on the shipped source */
  const s = src('js/photo-geo-search.js');
  assert.match(s, /foundAtSpacingM/, 'every candidate carries the spacing it was found on');
  assert.match(src('js/photo-geo.js'), /foundAtSpacingM/, 'and the panel prints it beside the coordinate');
});

test('R527 ⑨: EXIF is read for orientation and lens — and its coordinate never becomes an answer', () => {
  /* ⚠ READ, NOT RUN: the parser is run above; the rule that EXIF never reaches the search lives in the panel (DOM factory). */
  /* the parser, over a hand-built header: both hemispheres, an orientation that swaps the axes,
     a 35 mm equivalent, and rubbish that must not throw */
  const jpeg = buildExifJpeg({ orientation: 6, focalLength35mm: 28, gps: { lat: -45.0312, lon: -168.6626, imgDirectionDeg: 187.4 } });
  const ex = X.parse(jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength));
  assert.equal(ex.orientation, 6);
  assert.equal(X.orientationTransform(6).swap, true, 'orientation 6 swaps width and height');
  assert.ok(Math.abs(ex.gps.lat + 45.0312) < 1e-6 && Math.abs(ex.gps.lon + 168.6626) < 1e-6,
    'southern and western hemispheres keep their sign');
  assert.ok(Math.abs(ex.gps.imgDirectionDeg - 187.4) < 0.01);
  const fov = X.fieldOfView(ex, 4000, 3000);
  assert.ok(Math.abs(fov.hfovDeg - 65.47) < 0.1, `28 mm on 35 mm film is about 65.5 degrees, got ${fov.hfovDeg}`);
  for (const junk of [new Uint8Array(0), new Uint8Array([0xFF, 0xD8]), new Uint8Array(3000).fill(0xAB)]) {
    const r = X.parse(junk.buffer.slice(junk.byteOffset, junk.byteOffset + junk.byteLength));
    assert.ok(!r.gps, 'a malformed file yields no coordinate and no exception');
  }

  /* ⚠ AND THE RULE ITSELF, ON THE SHIPPED SOURCE. Reporting an EXIF coordinate as the result would
     be a lie about the method: nothing would have been recognised, a number would have been copied
     out of a file header. The panel shows it, labelled; the search never receives it. */
  const panel = src('js/photo-geo.js');
  const gpsUses = panel.split('\n').filter(l => /\.gps\b/.test(l) && !/^\s*\/?\*/.test(l));
  for (const line of gpsUses) {
    assert.ok(!/setArea|state\.area\s*=|search\(|req\s*=|options:/.test(line),
      'an EXIF coordinate must not reach the search or the rectangle: ' + line.trim());
  }
  assert.match(panel, /IntMap does not use it/, 'and the reader is told, in the panel, that it is not used');
  assert.match(src('js/photo-geo-exif.js'), /seeds the rectangle/,
    'the rule is recorded where the coordinate is parsed');
});

test('R527 ⑩: the feature is registered everywhere one has to be, and nothing of it is eager', () => {
  /* ⚠ READ, NOT RUN: registration is a property of the loader, the entry and the ledgers, not of anything that executes here. */
  const loader = src('js/lazy-modules.js');
  assert.equal(LAZY_REGISTRY["photoGeo"].publishes, 'IntMapPhotoGeo', 'the loader knows which global it publishes');   /* (#R798) */
  assert.ok(loader.includes("import('./photo-geo.js')"),
    'the fetch is a single-quoted literal, which is what scripts/static-checks.mjs reads');
  assert.ok(loader.includes("window.IntMapPhotoGeo=window.IntMapModules.photoGeo(IM_HOST);"),
    'and the mount instantiates the factory');
  const entry = src('src/main.js');
  assert.ok(LAZY_NAMES.includes('photoGeo'), 'the boot guard knows it is deferred…');   /* (#R798) derived from the registry */
  assert.ok(!/const MODULE_FACTORIES = \[[^\]]*'photoGeo'/.test(entry), '…and does not expect it at boot');
  /* nothing may pull the computation into the shell */
  for (const f of ['photo-geo.js', 'photo-geo-terrain.js', 'photo-geo-match.js', 'photo-geo-search.js',
    'photo-geo-skyline.js', 'photo-geo-exif.js', 'photo-geo-worker-client.js', 'photo-geo-worker.js'])
    assert.ok(!entry.includes(f), `src/main.js must not import ${f} — it would land in the boot bundle`);
  /* the worker is named the one way the bundler can see */
  const client = src('src/photo-geo-worker-client.js');
  assert.match(client, /new Worker\(new URL\('\.\/photo-geo-worker\.js', import\.meta\.url\), \{ type: 'module' \}\)/,
    'the worker asset is named with new URL(..., import.meta.url) so the bundler emits it');
  assert.match(client, /onerror/, 'and a worker that dies falls back rather than taking the search with it');
  /* the ledger */
  const files = src('docs/FILES.md');
  for (const f of ['photo-geo.js', 'photo-geo-terrain.js', 'photo-geo-skyline.js', 'photo-geo-match.js',
    'photo-geo-search.js', 'photo-geo-exif.js'])
    assert.ok(files.includes(f), `docs/FILES.md carries a row for ${f}`);
  /* the way in */
  assert.match(src('js/map-ui.js'), /id:'tool\.photoLocate'/, 'there is a menu row that opens it');
});

/* ── a minimal JPEG carrying EXIF, so ⑨ can test the branches no fixture file has ─────────────── */
function buildExifJpeg(opt) {
  const entries0 = [], entriesExif = [], entriesGps = [], heap = [];
  let heapLen = 0;
  const RATIONAL = 5, SHORT = 3, LONG = 4, ASCII = 2;
  const pushHeap = (b) => { const at = heapLen; heap.push(b); heapLen += b.length; return at; };
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0, 0); return b; };
  const rational = (n, d) => Buffer.concat([u32(n), u32(d)]);
  if (opt.orientation) entries0.push([0x0112, SHORT, 1, { short: opt.orientation }]);
  if (opt.focalLength35mm) entriesExif.push([0xA405, SHORT, 1, { short: opt.focalLength35mm }]);
  if (opt.gps) {
    const dms = (v) => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = (a - d - m / 60) * 3600; return Buffer.concat([rational(d, 1), rational(m, 1), rational(Math.round(s * 10000), 10000)]); };
    entriesGps.push([1, ASCII, 2, { heap: Buffer.from((opt.gps.lat < 0 ? 'S' : 'N') + '\0', 'latin1') }]);
    entriesGps.push([2, RATIONAL, 3, { heap: dms(opt.gps.lat) }]);
    entriesGps.push([3, ASCII, 2, { heap: Buffer.from((opt.gps.lon < 0 ? 'W' : 'E') + '\0', 'latin1') }]);
    entriesGps.push([4, RATIONAL, 3, { heap: dms(opt.gps.lon) }]);
    if (opt.gps.imgDirectionDeg != null) {
      entriesGps.push([16, ASCII, 2, { heap: Buffer.from('T\0', 'latin1') }]);
      entriesGps.push([17, RATIONAL, 1, { heap: rational(Math.round(opt.gps.imgDirectionDeg * 100), 100) }]);
    }
  }
  const n0 = entries0.length + (entriesExif.length ? 1 : 0) + (entriesGps.length ? 1 : 0);
  const ifd0At = 8, ifd0Size = 2 + n0 * 12 + 4;
  const exifSize = entriesExif.length ? 2 + entriesExif.length * 12 + 4 : 0;
  const gpsSize = entriesGps.length ? 2 + entriesGps.length * 12 + 4 : 0;
  const exifAt = ifd0At + ifd0Size, gpsAt = exifAt + exifSize, heapAt = gpsAt + gpsSize;
  const writeIFD = (list) => {
    const b = Buffer.alloc(2 + list.length * 12 + 4);
    b.writeUInt16BE(list.length, 0);
    list.forEach(([tag, type, count, val], i) => {
      const e = 2 + i * 12;
      b.writeUInt16BE(tag, e); b.writeUInt16BE(type, e + 2); b.writeUInt32BE(count, e + 4);
      if (val.short != null) b.writeUInt16BE(val.short, e + 8);
      else if (val.long != null) b.writeUInt32BE(val.long, e + 8);
      /* ⚠ a value that FITS in four bytes is stored inline; only a longer one is an offset */
      else if (val.heap.length <= 4) val.heap.copy(b, e + 8);
      else b.writeUInt32BE(heapAt + pushHeap(val.heap), e + 8);
    });
    return b;
  };
  const extra0 = [];
  if (entriesExif.length) extra0.push([0x8769, LONG, 1, { long: exifAt }]);
  if (entriesGps.length) extra0.push([0x8825, LONG, 1, { long: gpsAt }]);
  const b0 = writeIFD(entries0.concat(extra0));
  const bE = entriesExif.length ? writeIFD(entriesExif) : Buffer.alloc(0);
  const bG = entriesGps.length ? writeIFD(entriesGps) : Buffer.alloc(0);
  const hdr = Buffer.alloc(8);
  hdr.write('MM', 0, 'latin1'); hdr.writeUInt16BE(42, 2); hdr.writeUInt32BE(ifd0At, 4);
  const tiff = Buffer.concat([hdr, b0, bE, bG, ...heap]);
  const app1 = Buffer.concat([Buffer.from([0xFF, 0xE1]), Buffer.alloc(2), Buffer.from('Exif\0\0', 'latin1'), tiff]);
  app1.writeUInt16BE(app1.length - 2, 2);
  return Buffer.concat([Buffer.from([0xFF, 0xD8]), app1, Buffer.from([0xFF, 0xD9])]);
}

/* ══════════════════ #R537 — the stop button, state(), and the gate ══════════════════ */
/* a photograph-shaped input: a flat traced skyline across a small frame */
function photoOf(w, h) {
  return { sky: new Int32Array(w).fill(Math.round(h * 0.4)), use: new Uint8Array(w).fill(1), w, h };
}

test('R537 ①: the sweep yields, so a stop set from OUTSIDE the loop actually stops it', async () => {
  /* This is the production bug, reproduced without a worker: the abort flag is flipped from a
     MACROTASK, exactly as `self.onmessage` would flip it. A loop that never yields can never see
     it — before the fix this test ran to completion and reported aborted:false. */
  const area = { south: 0, north: 0.012, west: 0, east: 0.012 };
  const BANDS = [{ r: 700, z: 13 }, { r: 2500, z: 11 }];
  const field = T.buildField({ lat: 0.006, lon: 0.006 }, area, flatStore(300), { bands: BANDS });
  const photo = photoOf(240, 180);

  let stop = false;
  setTimeout(() => { stop = true; }, 30);          /* a macrotask, like a worker message */
  const res = await Q.run(field, photo, { spacingM: 90, bands: BANDS, tickEvery: 1 }, {
    tick: () => new Promise(r => setTimeout(r, 0)),
    shouldAbort: () => stop
  });
  assert.ok(res, 'the run returns a result');
  assert.equal(res.aborted, true, 'a stop raised from outside the loop must be seen');
  assert.ok(res.stats.coarsePointsVisited < res.stats.coarsePointsPlanned,
    `it must stop EARLY (visited ${res.stats.coarsePointsVisited} of ${res.stats.coarsePointsPlanned})`);
  /* …and an aborted run still returns what it had, because a stop button that throws the work away
     is a destructive button */
  assert.ok(Array.isArray(res.candidates), 'an aborted run still reports its candidates');
  assert.ok(res.verdict && res.verdict.code, 'and still carries a verdict');

  /* ⚠ AND THE SAME RUN WITHOUT THE YIELD CANNOT STOP — which is the bug, stated as a fact rather
     than left to be trusted. Identical setup, identical flag, no `tick`: the loop never returns to
     the event loop, the timer that flips the flag never fires, and the sweep runs to the end. If
     this half ever starts aborting, the yield has stopped being what makes the difference and the
     first half above is no longer testing anything. */
  let stop2 = false;
  setTimeout(() => { stop2 = true; }, 30);
  const blind = await Q.run(field, photo, { spacingM: 90, bands: BANDS }, {
    shouldAbort: () => stop2                      /* no tick: nothing yields */
  });
  assert.equal(blind.aborted, false, 'without a yield the flag cannot arrive — this is the defect');
  assert.equal(blind.stats.coarsePointsVisited, blind.stats.coarsePointsPlanned,
    'and the sweep runs to the very end');
});

test('R537 ①b: run is async and every caller awaits it — a floating promise would be silent', () => {
  /* ⚠ READ, NOT RUN: the behaviour is ① above; this pins that the two Worker entry points (which need a Worker) await the same sweep. */
  const s = src('js/photo-geo-search.js');
  assert.match(s, /async function run\(field, photo, opts, hooks\)/, 'the sweep is async');
  assert.match(s, /if \(hk\.tick\) await hk\.tick\(\);/, 'and it awaits the caller between slices');
  assert.match(s, /MEASURED on production three\s*\n?\s*\*?\s*times/,
    'the measurement that forced this is recorded where the loop is');
  for (const f of ['src/photo-geo-worker.js', 'src/photo-geo-worker-client.js']) {
    const c = src(f);
    assert.match(c, /await Q\.run\(/, f + ' awaits the sweep');
    /* ⚠ the yield must be a MACROTASK: a microtask drains promises and leaves the message queued */
    assert.match(c, /setTimeout\(r, 0\)/, f + ' yields on a macrotask, not a microtask');
  }
});

test('R537 ②: state() answers during the window between the drop and the decode', () => {
  /* ⚠ READ, NOT RUN: state() lives inside the panel factory, which builds DOM on construction. */
  /* the accessor is inside a factory that needs a DOM, so this reads the shipped source for the
     guard rather than instantiating a panel — the failure was a null dereference, and the fix is
     that `state.orig` is checked before it is read. */
  const s = src('js/photo-geo.js');
  const line = s.split('\n').find(l => /photo: \(state\.file && state\.orig\)/.test(l));
  assert.ok(line, 'the photo section of state() checks state.orig before reading it');
  assert.match(s, /decoding: true/, 'and says so, rather than pretending there is no photograph');
  assert.match(s, /skyline: \(state\.skyline && state\.analysis\)/,
    'the skyline section is guarded the same way');
  assert.ok(!/width: state\.orig\.width, height: state\.orig\.height, hasExifGps[^}]*\}\s*:\s*null/.test(
    s.replace(/\(state\.file && state\.orig\)[\s\S]{0,400}?decoding: true \}/, '')),
    'no unguarded read of state.orig survives');
});

test('R537 ③: opening the tool does not start a search that costs minutes', () => {
  /* ⚠ READ, NOT RUN: the gate is a branch inside js/atlas-console.js's dispatcher, which needs the whole Atlas kernel and a map. */
  const s = src('js/atlas-console.js');
  assert.match(s, /if\(pgAct!=='search'\) return R\(true,note\(L\('The photograph and the search area are both ready/,
    'a call without action:"search" reports readiness instead of sweeping');
  /* the sweep is still reachable — this is a gate, not a removal */
  assert.match(s, /const pgP=PG\.search\(\);/, 'action:"search" still runs it');
  /* and the model is told, where it reads what the call does */
  const cat = src('js/atlas-catalog-text.js');
  assert.match(cat, /THE SWEEP IS NOT STARTED BY OPENING THE TOOL/,
    'the catalogue says the sweep needs to be asked for');
  assert.match(cat, /"photoLocate"/, 'and the spelling the dispatcher answers to is still quoted');
});

/* ══════════════════ #R547 — the vision model draws the guide, the pixels decide ══════════════════ */
/* a picture with a known answer: bright sky over a sawtooth ridge, plus — where asked — a DARK
   FOREGROUND BAND well below it, which is the thing every edge detector in this feature's history
   has mistaken for the mountain */
function scene(w, h, ridge, treeTop) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const sky = y < ridge(x);
      const tree = treeTop != null && y >= treeTop(x);
      d[i] = tree ? 12 : (sky ? 150 : 40);
      d[i + 1] = tree ? 30 : (sky ? 190 : 70);
      d[i + 2] = tree ? 10 : (sky ? 245 : 45);
      d[i + 3] = 255;
    }
  }
  return { width: w, height: h, data: d };
}
const RIDGE = (x) => Math.round(34 + 12 * Math.sin(x / 13) + 5 * Math.sin(x / 4));
const meanErr = (sk, truth, w) => {
  let e = 0; for (let x = 0; x < w; x++) e += Math.abs(sk.sky[x] - truth(x));
  return e / w;
};

/* ── ① the automatic detector still does what #R527 built it to do ────────────────────────────── */
test('#R547 ① extract() still traces the ridge from pixels alone, and stamps itself `auto`', () => {
  const W = 160, H = 100;
  const sk = S.extract(scene(W, H, RIDGE));
  assert.equal(sk.source, 'auto', 'the trace must say which detector produced it');
  assert.ok(meanErr(sk, RIDGE, W) < 1.5, 'auto trace mean error ' + meanErr(sk, RIDGE, W).toFixed(2) + ' px');
  assert.equal(S.usableColumns(sk), W);
  assert.ok(sk.quality.separation > 1, 'a clean two-colour picture must separate cleanly');
});

/* ── ② the band is the whole safety of the model path ─────────────────────────────────────────
   A guide pointing at the RIDGE must survive a picture whose strongest edge is the tree line
   below it — and a guide pointing at the tree line must NOT be dragged up to the ridge. Both
   directions, because a band that only ever agrees with the pixels is not a band. */
test('#R547 ② refineFromBoundary() cannot leave the guide by more than the band, in either direction', () => {
  const W = 160, H = 120;
  const TREE = (x) => RIDGE(x) + 45;
  const img = scene(W, H, RIDGE, TREE);

  const atRidge = new Int32Array(W); for (let x = 0; x < W; x++) atRidge[x] = RIDGE(x) + 3;
  const a = S.refineFromBoundary(img, atRidge, { bandPx: 5 });
  assert.equal(a.source, 'llm');
  for (let x = 0; x < W; x++) assert.ok(Math.abs(a.sky[x] - atRidge[x]) <= 5, 'column ' + x + ' left the band');
  assert.ok(meanErr(a, RIDGE, W) < 2.5, 'inside the band it should snap ONTO the ridge, err=' + meanErr(a, RIDGE, W).toFixed(2));

  const atTree = new Int32Array(W); for (let x = 0; x < W; x++) atTree[x] = TREE(x);
  const b = S.refineFromBoundary(img, atTree, { bandPx: 5 });
  for (let x = 0; x < W; x++) assert.ok(Math.abs(b.sky[x] - atTree[x]) <= 5, 'the band did not hold at column ' + x);
  assert.ok(meanErr(b, RIDGE, W) > 30, 'a guide on the tree line must STAY there — the band is not advisory');
});

test('#R547 ② b — with no band the same guide is ignored, which is why the band has to exist', () => {
  const W = 160, H = 120;
  const TREE = (x) => RIDGE(x) + 45;
  const img = scene(W, H, RIDGE, TREE);
  const atTree = new Int32Array(W); for (let x = 0; x < W; x++) atTree[x] = TREE(x);
  const free = S.refineFromBoundary(img, atTree, {});
  assert.ok(meanErr(free, TREE, W) > 8,
    'without a band the dynamic program follows the pixels, not the guide — if this ever fails, ② is proving nothing');
});

/* ── ③ a guide the trace cannot follow is an empty search, not a tight one ─────────────────────── */
test('#R547 ③ slopeLimit() makes every band reachable, so a vertical polyline still produces a trace', () => {
  const W = 120, H = 100;
  const img = scene(W, H, RIDGE);
  const cliff = new Int32Array(W);
  for (let x = 0; x < W; x++) cliff[x] = x < 60 ? 10 : 88;   /* 78 rows in one column */
  const sk = S.refineFromBoundary(img, cliff, { bandPx: 3 });
  assert.ok(sk, 'a jumping guide must still produce a trace');
  for (let x = 0; x < W; x++) assert.ok(Number.isFinite(sk.sky[x]) && sk.sky[x] >= 0 && sk.sky[x] < H,
    'column ' + x + ' has no finite row — the bands did not overlap');
  const D = Math.max(2, Math.round(H * S.MAX_SLOPE_FRAC));
  const lim = S.slopeLimit(cliff, W, D);
  for (let x = 1; x < W; x++) assert.ok(Math.abs(lim[x] - lim[x - 1]) <= D, 'slopeLimit left a jump at ' + x);
});

/* ── ④ a column nobody has an opinion about is skipped, not filed under «ground» ──────────────── */
test('#R547 ④ a guide of -1 takes no part in the colour model', () => {
  const W = 80, H = 60;
  const img = scene(W, H, RIDGE);
  const half = new Int32Array(W);
  for (let x = 0; x < W; x++) half[x] = x < 40 ? RIDGE(x) : -1;
  const sk = S.refineFromBoundary(img, half, { bandPx: 4 });
  assert.ok(sk.quality.separation > 1,
    'the unguided half must be ignored by separation(); clamping -1 to 0 would file it all as ground and collapse it');
  for (let x = 0; x < 40; x++) assert.ok(Math.abs(sk.sky[x] - RIDGE(x)) <= 4);
});

/* ── ⑤ the reply is checked here, and «no skyline» is an answer ───────────────────────────────── */
test('#R547 ⑤ normalise() refuses what is not a traced ridge, with a reason', () => {
  const W = 900, H = 600;
  assert.equal(V.normalise(null, W, H).why, 'unreadable');
  assert.equal(V.normalise('a curve', W, H).why, 'unreadable');
  assert.equal(V.normalise({ hasSkyline: false, points: [], excluded: [], note: 'a cat' }, W, H).why, 'no_skyline',
    '«there is no skyline here» must survive as its own answer — the whole false-positive control of #R527 §5.3 rests on it');
  assert.equal(V.normalise({ hasSkyline: true, points: [{ x: 1, y: 1 }, { x: 900, y: 300 }], excluded: [], note: '' }, W, H).why,
    'too_few_points');
  const narrow = [];
  for (let i = 0; i < 20; i++) narrow.push({ x: 400 + i, y: 300 });
  assert.equal(V.normalise({ hasSkyline: true, points: narrow, excluded: [], note: '' }, W, H).why, 'too_narrow');
});

test('#R547 ⑤ b — a good reply lands in analysis pixels, sorted, with duplicate columns merged', () => {
  const W = 1000, H = 500;   /* one analysis pixel per box unit in x, so the mapping is readable */
  const pts = [{ x: 900, y: 100 }, { x: 0, y: 200 }, { x: 500, y: 300 }, { x: 500, y: 500 }, { x: 250, y: 0 }];
  const n = V.normalise({ hasSkyline: true, confidence: 1.7, points: pts, excluded: [{ x0: 800, x1: 700, why: 'trees' }], note: 'ok' }, W, H);
  assert.equal(n.ok, true);
  for (let i = 1; i < n.points.length; i++) assert.ok(n.points[i][0] >= n.points[i - 1][0], 'points must come back left to right');
  const at500 = n.points.find((p) => p[0] === Math.round(500 / V.BOX * (W - 1)));
  assert.ok(at500 && Math.abs(at500[1] - (400 / V.BOX * (H - 1))) < 1,
    'two points in one column are one point at their mean, not whichever the model emitted first');
  assert.equal(n.confidence, 1, 'confidence is clamped into 0..1 rather than trusted');
  assert.equal(n.excluded.length, 1);
  assert.ok(n.excluded[0].x0 < n.excluded[0].x1, 'a reversed span is a span');
});

/* ── ⑥ excluded stretches are excluded from the EVIDENCE, not merely from the drawing ──────────── */
test('#R547 ⑥ toGuide() + refineFromBoundary() drop hidden columns from `use`', () => {
  const W = 200, H = 120;
  const img = scene(W, H, RIDGE);
  const pts = [];
  for (let x = 0; x <= 190; x += 10) pts.push({ x: Math.round(x / (W - 1) * V.BOX), y: Math.round(RIDGE(x) / (H - 1) * V.BOX) });
  const n = V.normalise({
    hasSkyline: true, confidence: 0.8, points: pts, note: 'ridge',
    excluded: [{ x0: Math.round(50 / (W - 1) * V.BOX), x1: Math.round(90 / (W - 1) * V.BOX), why: 'conifers' }]
  }, W, H);
  assert.equal(n.ok, true);
  const g = V.toGuide(n, W, H);
  for (let x = 51; x <= 89; x++) assert.equal(g.use[x], 0, 'column ' + x + ' is hidden and must not count as evidence');
  assert.ok(g.guide[10] >= 0 && g.guide[60] >= 0, 'a hidden column is still GUIDED, so the trace stays sane across it');
  assert.equal(g.guide[199], -1, 'outside the polyline the guide has no opinion');
  const sk = S.refineFromBoundary(img, g.guide, { bandPx: g.bandPx, use: g.use });
  for (let x = 51; x <= 89; x++) assert.equal(sk.use[x], 0, 'the exclusion must reach the trace, not stop at the guide');
  assert.ok(S.usableColumns(sk) < W && S.usableColumns(sk) > W * 0.5);
});

/* ── ⑦ the two claims that must never be written by hand ──────────────────────────────────────── */
test('#R547 ⑦ the photograph is not sent without recorded consent, and the claim is derived from the trace', () => {
  assert.equal(V.gate({ consent: false, online: true }).allowed, false);
  assert.equal(V.gate({ consent: false, online: true }).why, 'needs_consent');
  assert.equal(V.gate({ consent: true, online: false }).allowed, false);
  assert.equal(V.gate({ consent: true, online: true }).allowed, true);
  assert.equal(V.gate({}).allowed, false, 'an empty state is not consent');

  assert.equal(V.privacyNote('llm'), 'sent_to_provider');
  assert.equal(V.privacyNote('auto'), 'stayed_on_device');
  assert.equal(V.privacyNote(undefined), 'stayed_on_device');
  /* and the panel must ASK it rather than carry two sentences of its own */
  const panel = rd('js/photo-geo.js');
  assert.ok(/privacyNote\(/.test(panel), 'js/photo-geo.js must derive the provenance sentence, not choose it');
  const stayed = panel.match(/stayed on this device/g) || [];
  assert.equal(stayed.length, 1, 'exactly one «stayed on this device» sentence, reachable only through privacyNote');
});

/* ── ⑧ the schema and the task are ones ai-proxy actually accepts ──────────────────────────────
   The numbers are READ OUT OF ai-proxy, not copied here: a limit that moved would otherwise leave
   this test green while the schema was silently dropped and the reply stopped being checked. */
test('#R547 ⑧ the request ai-proxy is asked for is one ai-proxy allows', () => {
  const px = rd('supabase/functions/ai-proxy/index.ts');
  /* ⚠ the limits are written as `16 * 1024`, so reading the first integer would have called the
     ceiling 16 bytes and passed anything. Take the whole right-hand side and multiply it out. */
  const num = (name) => {
    const m = px.match(new RegExp('\\b' + name + '\\s*=\\s*([0-9_ *]+);'));
    assert.ok(m, name + ' is gone from ai-proxy (or is no longer a plain product) — this check has lost its footing');
    return m[1].split('*').reduce((a, part) => a * Number(part.replace(/[_ ]/g, '')), 1);
  };
  const json = JSON.stringify(V.SCHEMA);
  assert.ok(Buffer.byteLength(json) < num('MAX_SCHEMA_BYTES'), 'the schema is over ai-proxy\'s size limit and would be dropped');
  const depth = (o) => (o && typeof o === 'object')
    ? 1 + Math.max(0, ...Object.values(o).map(depth)) : 0;
  assert.ok(depth(V.SCHEMA) <= num('MAX_SCHEMA_DEPTH'), 'the schema is deeper than ai-proxy accepts');
  const keys = (o) => (o && typeof o === 'object')
    ? Object.keys(o).length + Object.values(o).reduce((a, v) => a + keys(v), 0) : 0;
  assert.ok(keys(V.SCHEMA) <= num('MAX_SCHEMA_KEYS'), 'the schema has more keys than ai-proxy accepts');

  const opts = V.callOptions();
  assert.equal(opts.task, 'vision_read');
  assert.ok(new RegExp('JSON_TASKS[\\s\\S]{0,400}[\'"]' + opts.task + '[\'"]').test(px),
    'the task must be one ai-proxy puts in JSON mode, or the schema is never attached');
  assert.equal(opts.webMode, 'off', 'tracing a ridge is not a web search');
  /* the picture is sent as a JPEG data URL (js/photo-geo.js state.orig.url) */
  const mime = px.match(/IMAGE_MIME\s*=\s*([\s\S]{0,200}?);/);
  assert.ok(mime && /jpeg/.test(mime[1]), 'ai-proxy no longer accepts image/jpeg — the panel sends one');

  /* ⚠ strict structured output requires every property to be required and no extras, at every
     level. A schema that fails this is DOWNGRADED silently, so assert it rather than hope. */
  (function strict(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false, 'every object in the schema must forbid extras');
      assert.deepEqual([...(node.required || [])].sort(), Object.keys(node.properties || {}).sort(),
        'every property must be required');
    }
    Object.values(node).forEach(strict);
  })(V.SCHEMA);
});

/* ── ⑨ the list is ordered by the number it prints ────────────────────────────────────────────── */
test('#R547 ⑨ the panel reads which quantity ordered the candidates instead of naming one', () => {
  assert.equal(typeof SEARCH.rankValue, 'function');
  const cands = [{ score: 0.9, agreement: 0.4 }, { score: 0.7, agreement: 0.95 }, { score: 0.5, agreement: 0.6 }];
  const res = { rankedBy: 'score', candidates: cands };
  assert.equal(SEARCH.rankValue(res, cands[0]), 0.9);
  assert.equal(SEARCH.orderedByRank(res), true, 'ranked by score, this list is in order');
  assert.equal(SEARCH.orderedByRank({ rankedBy: 'agreement', candidates: cands }), false,
    'the same list read as «agreement» is NOT in order — that mismatch is what the reader was seeing');
  assert.equal(SEARCH.rankValue({}, cands[1]), 0.7, 'a result from before rankedBy existed was ranked by score');
  assert.ok(/rankedBy:\s*RANK/.test(rd('js/photo-geo-search.js')), 'the search must publish the key it sorted on');
  assert.ok(/rankValue\(/.test(rd('js/photo-geo.js')), 'the panel must print the ranked quantity, not one of its own choosing');
});

/* ── ⑩ registration: the new module is reachable, shipped and written down ─────────────────────── */
test('#R547 ⑩ js/photo-geo-vision.js is imported by the panel and listed in both ledgers', () => {
  /* ⚠ READ, NOT RUN: registration is a property of the import graph and the ledgers. */
  assert.ok(/import '\.\/photo-geo-vision\.js';/.test(rd('js/photo-geo.js')),
    'the module must ride the photoGeo chunk, not be fetched by itself');
  assert.ok(/photo-geo-vision\.js/.test(rd('docs/FILES.md')), 'docs/FILES.md must carry a line for it');
  assert.ok(/photo-geo-vision\.js/.test(rd('Architecture.md')), 'Architecture.md §2.4 must carry a row for it');
  assert.ok(/photo-geo-vision\.js/.test(rd('docs/PHOTO-GEOLOCATION.md')), 'the feature document must describe it');
});
