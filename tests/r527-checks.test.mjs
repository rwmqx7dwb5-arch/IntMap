/* ============================================================================
 *  R527 — FINDING WHERE A PHOTOGRAPH WAS TAKEN, FROM ITS SKYLINE
 * ----------------------------------------------------------------------------
 *  These drive the SHIPPED modules (js/photo-geo-terrain.js, -skyline.js, -match.js, -search.js,
 *  -exif.js) over synthetic terrain and a hand-built JPEG header. Nothing here is a copy of the
 *  implementation, and every number asserted below is either analytic (the dip of the sea horizon
 *  from a known eye height) or was MEASURED during #R527 and is recorded in
 *  docs/PHOTO-GEOLOCATION.md.
 *
 *  ⚠ THE ONES THAT MATTER MOST ARE ④, ⑥ AND ⑨. Each fixes a bug that shipped-looking code had:
 *  ④ the property the whole 360-degree search rests on; ⑥ the rule that picks a field of view, which was wrong twice in opposite
 *  directions before real photographs settled it (and ⑥b pins why it is NOT the rule that ranks
 *  candidates against one another); ⑨ the rule that an EXIF coordinate is
 *  never allowed to become an answer.
 * ==========================================================================*/
import test from 'node:test';
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
const T = globalThis.IntMapPhotoTerrain, M = globalThis.IntMapPhotoMatch,
  S = globalThis.IntMapPhotoSkyline, Q = globalThis.IntMapPhotoSearch, X = globalThis.IntMapPhotoExif;

const src = (f) => readFileSync(join(ROOT, f), 'utf8');

/* a tile store whose every tile is one elevation — enough to make analytic terrain */
function flatStore(metres) {
  /* ⚠ ONE array, handed back for every tile. buildField asks the store once per CELL, and a store
     that allocates 65,536 floats per call turns a two-second test into an unfinishable one. */
  const tile = new Float32Array(65536).fill(metres);
  return { get: () => tile };
}
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
  const loader = src('js/lazy-modules.js');
  assert.match(loader, /photoGeo: 'IntMapPhotoGeo'/, 'the loader knows which global it publishes');
  assert.ok(loader.includes("case 'photoGeo': return import('./photo-geo.js');"),
    'the fetch case is a single-quoted literal, which is what scripts/static-checks.mjs reads');
  assert.ok(loader.includes("window.IntMapPhotoGeo=window.IntMapModules.photoGeo(IM_HOST);"),
    'and the mount instantiates the factory');
  const entry = src('src/main.js');
  assert.match(entry, /const LAZY_FACTORIES = \[[^\]]*'photoGeo'/, 'the boot guard knows it is deferred…');
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
