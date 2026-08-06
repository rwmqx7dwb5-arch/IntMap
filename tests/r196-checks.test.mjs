/* ============================================================================
 *  R196 — the source-level and browser-free guards for this round.
 *
 *  The things a real renderer has to answer live in tests/r196.spec.js. What is
 *  here is what can be proved without one: that the two splits are byte-for-byte
 *  moves, that the geometry they carried still behaves at the antimeridian and
 *  over the poles, and that the four numbers this round changed are the numbers
 *  it says it changed.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appShell } from './app-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── ① THE SPLITS ARE MOVES, NOT REWRITES ──────────────────────────────────────────────────────
   #R194's lesson: a "pure transport" is a claim until a machine compares the bytes. Both blocks
   below were lifted whole, so every line of the moved body must still exist verbatim in its new
   file — and must NOT still exist in the shell (a leftover inline copy of a moved function
   declaration WINS over the module, which is the failure mode #R168 #8 was written for). */
test('R196 ①a js/geodesy.js carries the antimeridian block verbatim, and the shell does not', () => {
  const g = rd('js/geodesy.js');
  const shell = rd('js/app-body.js');
  const needles = [
    'const _R_EARTH_KM=6371.0088, _HALF_CIRCUM=Math.PI*_R_EARTH_KM;',
    'function _clipHalf(poly,x,keepGE){',
    'function _splitPolyToWindows(poly){',
    'function _splitLineToWindows(line){',
    'function diskFillPolys(center,radiusKm,steps){',
    'function diskOutlineLines(center,radiusKm,steps){',
    'function sanitizeFeatures(feats){',
  ];
  for (const n of needles) {
    assert.ok(g.includes(n), `js/geodesy.js must carry «${n}»`);
    assert.ok(!shell.includes(n), `js/app-body.js must NOT still hold «${n}»`);
  }
  /* …and the shell re-binds them under their ORIGINAL names, because IM_HOST publishes them and
     four other modules read them through it */
  /* ⚠ AS HOISTED FUNCTION DECLARATIONS. Five of the six are bound AT FACTORY TIME through IM_HOST by
     js/tool-panel.js, js/seismic.js, js/dash-extended.js and js/atlas-console.js, and a factory can
     run before a `const` further down the closure exists — #R167's dead-zone rule, which caught the
     first version of this split. */
  for (const n of ['_gcRingUnwrapped', '_splitPolyToWindows', '_splitLineToWindows', 'diskFillPolys', 'diskOutlineLines', 'sanitizeFeatures']) {
    assert.match(shell, new RegExp(`\\n  function ${n}\\(\\)\\{ return window\\.IntMapGeodesy\\.${n}\\.apply\\(null,arguments\\); \\}`),
      `${n} must be a hoisted function declaration delegating to window.IntMapGeodesy`);
  }
});

test('R196 ①b js/tile-warm.js carries the prefetch block, and takes its five values through IM_HOST', () => {
  const w = rd('js/tile-warm.js');
  const shell = rd('js/app-body.js');
  for (const n of ['function registerTileSW(){', 'function predictivePrefetch(aggressive){', "postMessage({type:'prefetch',urls:uniq})"]) {
    assert.ok(w.includes(n), `js/tile-warm.js must carry «${n}»`);
    assert.ok(!shell.includes(n), `js/app-body.js must NOT still hold «${n}»`);
  }
  /* ⚠ the free references are the whole risk of a split (#R194) — they arrive through the host */
  assert.match(w, /HOST\.mapType!=='sat'/, 'the basemap is read from IM_HOST, not closed over');
  assert.match(w, /HOST\.satState\.providerId/, 'the provider is read from IM_HOST');
  assert.match(shell, /get satBuildTiles\(\)\{ return satBuildTiles; \}/, 'IM_HOST must publish satBuildTiles');
  assert.match(shell, /window\.IntMapModules\.tileWarm\(IM_HOST\)/, 'the shell calls the factory where the code used to be');
  assert.ok(rd('src/main.js').includes("import '../js/tile-warm.js';"), 'the entry imports it');
  assert.ok(rd('src/main.js').includes("import '../js/geodesy.js';"), 'the entry imports js/geodesy.js');
  assert.match(rd('src/main.js'), /'satProto', 'tileWarm',/, 'the factory guard knows about tileWarm');
});

/* ── ② THE GEOMETRY STILL WORKS — IN NODE, WITHOUT A BROWSER ───────────────────────────────────
   This is the point of moving it: the block is a pure function of coordinates, so its two hardest
   cases (a circle that crosses ±180°, and one that swallows a pole) can be asserted here rather
   than only through a rendered map. */
test('R196 ② the pole-safe geometry: a seam-crossing disk splits, a pole-swallowing one caps', async () => {
  const src = rd('js/geodesy.js');
  /* evaluate the module body with a `window` of our own — it publishes onto it and nothing else */
  const box = { window: {} };
  // eslint-disable-next-line no-new-func
  new Function('window', src)(box.window);
  const G = box.window.IntMapGeodesy;
  assert.ok(G && typeof G.diskFillPolys === 'function', 'the module publishes window.IntMapGeodesy');

  /* a 500 km disk sitting ON the antimeridian must come back as pieces that each stay in range */
  const seam = G.diskFillPolys([179.8, 0], 500, 96);
  assert.ok(seam.length >= 2, `a disk over ±180° must be split into pieces; got ${seam.length}`);
  for (const poly of seam) for (const ring of poly) for (const [lng] of ring)
    assert.ok(lng >= -180.001 && lng <= 180.001, `every vertex stays inside [-180,180]; saw ${lng}`);

  /* a disk big enough to contain the north pole must still be drawable — and must reach it */
  const cap = G.diskFillPolys([0, 85], 1500, 96);
  assert.ok(cap.length >= 1, 'a pole-swallowing disk still produces geometry');
  let maxLat = -90;
  for (const poly of cap) for (const ring of poly) for (const [, lat] of ring) if (lat > maxLat) maxLat = lat;
  assert.ok(maxLat > 89, `the polar cap must reach the pole; the highest vertex was ${maxLat}`);

  /* and the ordinary case is unchanged: a small disk is one piece, closed, at the right radius */
  const plain = G.diskFillPolys([139.7, 35.7], 100, 64);
  assert.equal(plain.length, 1, 'a small disk is one polygon');
  const ring0 = plain[0][0];
  assert.deepEqual(ring0[0], ring0[ring0.length - 1], 'the ring is closed');
});

/* ── ③ THE FOUR NUMBERS THIS ROUND CHANGED ─────────────────────────────────────────────────────
   Each one is a fact a future round would otherwise have to re-derive from a screenshot. */
test('R196 ③a the flight simulator sets NO distance fog', () => {
  const fs = rd('js/flight-sim.js');
  const m = /setSky\(\{'sky-color':'#3f78c2'[^}]*\}\)/.exec(fs);
  assert.ok(m, 'the cockpit sky block is still set in one place');
  assert.match(m[0], /'horizon-fog-blend':0\b/, "horizon-fog-blend 0 = the horizon band is the horizon colour");
  assert.match(m[0], /'fog-ground-blend':1\b/, 'fog-ground-blend 1 = fog only exactly at the horizon');
  assert.match(m[0], /'sky-color':'#3f78c2'/, 'the SKY half of the #R99 spec is untouched');
});

test('R196 ③b the sky is set for EVERY basemap, and set3D no longer fights it', () => {
  const shell = appShell(new URL('../', import.meta.url));
  assert.doesNotMatch(shell, /if\(currentProj!=='globe'\)\{ try\{ GE\(\)\.scene\.setSky/,
    'set3D must not install a second sky — one owner (#R196)');
  assert.match(shell, /'sky-horizon-blend':0\.55/, 'the atmosphere band is declared');
  assert.match(shell, /'fog-ground-blend':1/, 'no ground fog on the map either');
  /* the horizon colour follows the Sun, so it cannot be a constant */
  assert.match(shell, /function _horizonColour\(\)/);
  assert.match(shell, /function _sunElevAtCentre\(\)/);
  /* …and the early return that made this satellite-only is gone */
  assert.doesNotMatch(shell, /if\(!sat\)\{ if\(_applySkyAtmosphere\._on\)/, 'the satellite-only gate is gone');
});

test('R196 ③c the tile prefetch remembers what it has already asked for', () => {
  const w = rd('js/tile-warm.js');
  assert.match(w, /const _pfSeen=new Set\(\);/, 'the memo exists');
  /* ⚠ declared ABOVE its reader — #R189: a const below the function that reads it is a TDZ waiting
     for the one early call, and every call site here is inside a try/catch that would swallow it */
  assert.ok(w.indexOf('const _pfSeen=new Set();') < w.indexOf('function predictivePrefetch('),
    'the memo must be declared before the function that reads it');
  assert.match(w, /\.filter\(u=>!_pfSeen\.has\(u\)\)/, 'the ring is filtered against the memo');
});

test('R196 ③d a satellite tile fetch is not abortable, and in-flight requests are shared', () => {
  for (const f of ['src/sat-worker.js', 'js/sat-proto.js']) {
    const s = rd(f);
    assert.doesNotMatch(s, /fetch\((?:url\(z, y, x\)|_satUrl\(z,y,x\)),\s*\{\s*signal/,
      `${f}: the HTTP fetch must not carry the abort signal — cancelling it guarantees a refetch`);
    assert.ok(/inflight|_satFly/.test(s), `${f}: concurrent requests for one tile share a promise`);
    assert.match(s, /signal\s*&&\s*signal\.aborted/, `${f}: the abort still stops the ancestor walk`);
  }
});

/* ── ④ THE NIGHT SIDE ──────────────────────────────────────────────────────────────────────── */
test('R196 ④ the night side is a zoom expression, and builds nothing until it would be visible', () => {
  const n = rd('js/night-side.js');
  /* ⚠ the defect that shipped in the first version: a zoom expression may only be the OUTERMOST
     one, and addLayer swallows the rejection, so the layer silently did not exist */
  assert.doesNotMatch(n, /\['\*',\['get','a'\],RAMP\]/, 'no zoom expression nested inside another');
  assert.match(n, /const ramp=\(k\)=>\['interpolate',\['linear'\],\['zoom'\]\]/, 'the scale multiplies the STOPS');
  assert.match(n, /if\(!GE\(\)\.layers\.has\(LYR\)\) return false;/, 'a rejected paint expression is caught');
  assert.match(n, /imageRowLatitudes/, 'the lights image is placed through the engine’s row→latitude map (#R195)');
  assert.match(n, /if\(zoomNow\(\)>ZMAX\+0\.4\)\{ return; \}/, 'nothing is built until the camera is wide enough');
  assert.ok(existsSync(join(ROOT, 'js/night-side.js')));
  assert.ok(rd('src/main.js').includes("import '../js/night-side.js';"), 'the entry imports it');
});

/* ── ⑤ THE PICK GESTURE ────────────────────────────────────────────────────────────────────── */
test('R196 ⑤ every "place this on the map" button steps its panel aside', () => {
  const p = rd('js/map-pick.js');
  assert.match(p, /_hide\(panel\)/, 'the requesting panel is hidden for the duration');
  assert.match(p, /GE\(\)\.events\.once\('click',s\.h\)/, 'the delivery mechanism is unchanged');
  assert.match(p, /e\.key==='Escape'/, 'Esc cancels');
  /* the four callers, each still keeping its old path as a fallback */
  const seismic = rd('js/seismic.js');
  assert.match(seismic, /const P=window\.IntMapPick;\s*\n\s*if\(P&&P\.start\)\{/, 'the seismic epicentre uses it');
  assert.match(seismic, /picking=false; epi=\[ll\.lng,ll\.lat\]/, 'and sets the epicentre from the pick');
  const sims = rd('js/sims.js');
  assert.equal((sims.match(/window\.IntMapPick/g) || []).length, 6, 'the three pickers in js/sims.js use it');
});

/* ── ⑥ THE TSUNAMI FOLLOWS THE EARTHQUAKE ──────────────────────────────────────────────────── */
test('R196 ⑥ the propagation model follows the seismic panel, debounced', () => {
  const t = rd('js/tsunami.js');
  assert.match(t, /function follow\(o\)\{/, 'there is a follow()');
  assert.match(t, /if\(!opened\|\|o\.lng==null/, 'it does nothing unless the panel is open');
  assert.match(t, /setTimeout\(\(\)=>\{ srcPending=false; if\(!opened\) return; ranKey=srcKey\(\); build\(\); \},900\)/,
    'it debounces — a magnitude spinner must not start a solve per keystroke');
  assert.match(t, /return \{ open, close, play, pause, setFrame, setTime:setTimeS, at, follow,/, 'it is on the public API');
  const s = rd('js/seismic.js');
  assert.match(s, /function syncTsunamiSource\(\)\{/);
  assert.match(s, /function refresh\(\)\{ draw\(\); warmEpi\(\); schedField\(\); syncTsunamiSource\(\); \}/);
  assert.match(s, /function touch\(\)\{ draw\(\); warmEpi\(\); markStale\(\); syncTsunamiSource\(\); \}/);
});

test('R196 ⑧ the build stamps name this round', () => {
  const idx = rd('index.html');
  assert.match(idx, /window\.__imBuild='R196';/);
  assert.match(idx, /window\.INTMAP_BUILD='2026-08-06-R196';/);
});

/* ── ⑦ THE LOCAL RUN IS PLANNED ────────────────────────────────────────────────────────────── */
test('R196 ⑦ npm test runs the browser suite through the measured plan', () => {
  const pkg = JSON.parse(rd('package.json'));
  assert.match(pkg.scripts.test, /node scripts\/run-tests\.mjs$/, 'the browser half goes through the runner');
  const r = rd('scripts/run-tests.mjs');
  assert.match(r, /poolFiles\('rest'\)/);
  assert.match(r, /run\(solo, 1,/, 'the solo pool gets one worker, as CI gives it one machine');
  assert.match(r, /running the whole directory instead/, 'it degrades to the old behaviour rather than to a subset');
});
