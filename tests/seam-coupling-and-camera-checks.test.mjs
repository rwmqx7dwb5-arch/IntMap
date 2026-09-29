/* ============================================================================
 *  IntMap · the renderer seam — who may hold MapLibre, and the camera geometry behind the contract
 *  (scripts/engine-coupling.mjs, js/geo-engine.js, js/camera-math.js, the three sub-views)
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r179-checks and tests/r176-checks ①.
 * ==========================================================================*/
// R179 source-level checks (deterministic, no browser).
//
// The renderer seam. #R178 finished with the coupling gate reading 0 and that was true of what it
// counted — member access under the names `map`, `__imap`, `maplibregl`. Two whole classes of
// reference sat outside that: the renderer HELD or TESTED as a value (measured 327), and the raw
// handle kept under a local name after ui.createView returned it (106 calls in compare.js, 8 in
// playground.js, 5 in flight-sim.js). These pin the widened gate, the fact that it can still FAIL,
// and the per-view shape that lets an additional view stop naming the renderer at all.
//
// R176 ① — the eye-anchored tilt must be solved in the renderer's own geometry, not metres-per-degree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import * as acorn from 'acorn';
import { makeCameraMath } from '../js/camera-math.js';
import { scanAll, scanFile, VALUE_BUDGET, PRIMARY_VIEW_FILE, ENGINE_FILE, IMAP_GLOBAL_FILES } from '../scripts/engine-coupling.mjs';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const engine = read('js/geo-engine.js');
/* (#R178/#R322) the application body is app-body + the engine + the camera maths */
const body = [read('js/app-body.js'), read('js/geo-engine.js'), read('js/camera-math.js')].join(String.fromCharCode(10));

/* CODE ONLY — comments blanked out, keeping every offset so line numbers still mean something.
   Necessary rather than fastidious: the first run of the checks below failed on `cmap.getProjection`
   and `setupMaplibre(maplibregl)`, both of which live in COMMENTS explaining why they are gone. That
   is #R178's 「正規表現は嘘をつく」 arriving in the tests instead of the tool. */
const codeOnly = src => {
  const spans = [];
  try {
    acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module',
      onComment: (block, text, start, end) => spans.push([start, end]) });
  } catch { return src; }
  const out = src.split('');
  for (const [a, b] of spans) for (let i = a; i < b; i++) if (out[i] !== '\n') out[i] = ' ';
  return out.join('');
};

/* ── ① the widened gate actually measures the thing it claims ─────────────────────────────── */
test('R179: the gate counts the renderer held or tested as a VALUE, not only member access', () => {
  const all = scanAll();
  const outside = all.filter(r => !r.file.endsWith(ENGINE_FILE));
  const member = outside.reduce((n, r) => n + r.hits.length, 0);
  const values = outside.reduce((n, r) => n + (r.values || []).length, 0);
  assert.equal(member, 0, 'member access outside the adapter must stay at zero');
  assert.ok(values <= VALUE_BUDGET,
    `value references (${values}) must stay within the budget (${VALUE_BUDGET}); the ratchet only goes down`);
  /* (#R180) …and the budget is now 1 — the app no longer holds or tests the renderer anywhere
     except the single line that hands the primary view to the engine. #R179 asserted here that the
     live sources still contained a `tested` and a `held` reference, which was a fair description of
     the work outstanding THEN and would now fail for the right reason. What still has to be
     guarded is the CLASSIFIER, not the app's remaining coupling, so it is proven on a probe: a
     scanner that silently stopped recognising either shape would let the whole category back in
     with the count reading 0, which is exactly the #R178 blind spot this test exists for. */
  const dir = mkdtempSync(join(tmpdir(), 'imkinds-'));
  const f = join(dir, 'probe.js');
  try {
    writeFileSync(f, `window.IntMapModules.probe=function(map,HOST){
      if(!map) return; if(typeof maplibregl!=='undefined') other(map);
    };\n`);
    const kinds = new Set((scanFile(f).values || []).map(v => v.kind));
    assert.ok(kinds.has('tested'), 'existence tests are classified — they are the mechanical half');
    assert.ok(kinds.has('held'), 'and handles passed as arguments — the half that needed somewhere to go');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ── (#R180) …and the OTHER door into the same hole ────────────────────────────────────────── */
test('R180: the global handle window.__imap is gated to the adapter and the one line that publishes it', () => {
  const all = scanAll();
  const stray = all.filter(r => (r.imaps || []).length && !IMAP_GLOBAL_FILES.has(basename(r.file)));
  assert.deepEqual(stray.map(r => r.file), [],
    'reading window.__imap into a local is the same coupling under a name no scan can predict — ' +
    '#R180 found three subsystems doing exactly that (IntMapLocate drove getSource/addLayer/on/project/flyTo ' +
    'through `M()`), invisible to both counts above');
  /* and it can still fail */
  const dir = mkdtempSync(join(tmpdir(), 'imglobal-'));
  const f = join(dir, 'probe.js');
  try {
    writeFileSync(f, `const M=()=>window.__imap; M();\n`);
    assert.equal((scanFile(f).imaps || []).length, 1, 'a bare read of the global is counted');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('R179: `arr.map(...)` is not counted as renderer coupling', () => {
  /* #R178 learned that a regex reports `When`/`It`/`The` as APIs. Asking an AST the wrong question
     fails the same way from the other side: a first pass here counted 932 references, 605 of which
     were Array.prototype.map. A property position is not a reference to the renderer. */
  const dir = mkdtempSync(join(tmpdir(), 'imcoupling-'));
  const f = join(dir, 'probe.js');
  try {
    writeFileSync(f, `window.IntMapModules.probe=function(HOST){
      const xs=[1,2,3].map(n=>n*2); const o={map:1}; const q=xs.map(String);
      return {xs,q,o};
    };\n`);
    const r = scanFile(f);
    assert.equal(r.hits.length, 0, 'no member access');
    assert.equal((r.values || []).length, 0, '…and `.map(` / a property called `map` is not a reference either');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('R179: the gate can still FAIL — a stray createView is caught', () => {
  /* A gate that cannot fail is decoration. ui.createView hands back the renderer's own handle, so
     exactly one caller may exist; anything else must take ui.createSubView. */
  const dir = mkdtempSync(join(tmpdir(), 'imcoupling-'));
  const f = join(dir, 'stray.js');
  try {
    writeFileSync(f, `window.IntMapModules.stray=function(HOST){
      const GE=()=>window.IntMapGeoEngine;
      const v=GE().ui.createView({container:'x'});
      return v;
    };\n`);
    const r = scanFile(f);
    assert.equal((r.views || []).length, 1, 'asking for the raw handle is recorded');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  /* …and in the real tree only the primary view does it */
  const all = scanAll();
  const callers = all.filter(r => !r.file.endsWith(ENGINE_FILE) && (r.views || []).length);
  assert.deepEqual(callers.map(r => r.file.split('/').pop()), [PRIMARY_VIEW_FILE],
    'only the file that constructs the PRIMARY view may hold the renderer handle');
  assert.equal(callers[0].views.length, 1, 'and only once');
});

/* ── ② the per-view shape ─────────────────────────────────────────────────────────────────── */
test('R179: the adapter is built per view, with its own state', () => {
  /* ⚠ READ, NOT RUN: the adapter factory needs a constructed MapLibre map; where its state lives is asked of the factory text. */
  assert.match(engine, /function makeMapLibreAdapter\(_m\)\{/,
    'the adapter is a factory over a map GETTER, so a second view gets a second one');
  assert.match(engine, /const MapLibreAdapter=makeMapLibreAdapter\(_m\);/,
    "…and the engine's own is bound to the handle app-body publishes");
  /* the state that must NOT be shared between two views. Two maps sharing one _eyePivot or one
     _solids registry is #R178's lesson ⑥ (「同じ性質の値は所有者を1つに」) waiting to happen. */
  const factory = engine.slice(engine.indexOf('function makeMapLibreAdapter(_m){'),
                               engine.indexOf('const MapLibreAdapter=makeMapLibreAdapter(_m);'));
  for (const v of ['const _solids={}', 'let _pd=null', 'let _appMinZoom=null, _eyePivot=false',
                   'let _decl=null', 'let _ugShim=null', 'let _demSrc=null'])
    assert.ok(factory.includes(v), `per-view state must live INSIDE the factory: ${v}`);
  /* …and the pure geometry must stay OUT of it: it takes its arguments and remembers nothing, so
     one copy is correct and a second would be the two-disagreeing-copies bug of #R176/#R177.
     ⚠ (#R322) IT LEFT THE FILE ENTIRELY — js/camera-math.js — which satisfies this claim more
     strongly than sitting above the factory did, and the claim is therefore restated rather than
     relocated: ONE copy, and it is not inside the per-view factory. Asserting that the factory does
     not contain it is the half that matters; asserting WHICH file holds it would pin a location,
     which is the mistake #R203 named and this round hit five times. */
  const geom = read('js/camera-math.js');
  for (const g of ['function gEye(', 'function gSolveAt(', 'function gLimitPitch(', 'function gLimitZoom(']) {
    assert.ok(!factory.includes(g), `shared geometry must not be inside the per-view factory: ${g}`);
    const copies = (engine.split(g).length - 1) + (geom.split(g).length - 1);
    assert.equal(copies, 1, `there is exactly ONE copy of the shared geometry: ${g} (found ${copies})`);
  }
});

test('R179: the contract is one object, handed out twice', () => {
  /* ⚠ READ, NOT RUN: engineFacade is built over a live adapter; the claim is about which adapter it may reach. */
  assert.match(engine, /function engineFacade\(A\)\{/,
    'the facade is a function of an adapter getter, so a sub-view gets the same object');
  assert.match(engine, /createSubView\(o\)\{/, 'an additional view is a first-class contract call');
  assert.match(engine, /const view=engineFacade\(\(\)=>sub\);/, '…built from a second adapter');
  assert.match(engine, /view\.destroy=/, '…and the caller still owns its lifetime');
  /* the facade must not reach for the ENGINE's adapter — a sub-view has to answer about itself */
  const facade = engine.slice(engine.indexOf('function engineFacade(A){'),
                              engine.indexOf('return Object.assign({'));
  assert.ok(!/_adapter/.test(facade),
    'engineFacade must go through A(), never the engine-level _adapter, or a sub-view answers about the wrong map');
  assert.match(engine, /use\(a\)\{ if\(a&&a\.id\) _adapter=a; return _adapter; \}/,
    'swapping the engine adapter (how Cesium arrives) stays engine-level');
});

/* ── ③ the three additional views really went through the seam ────────────────────────────── */
for (const [file, handle] of [['js/compare.js', 'cmap'], ['js/playground.js', 'gmap'], ['js/flight-sim.js', 'minimap']]) {
  test(`R179: ${file.replace('js/', '')} drives its view through the contract, not the handle`, () => {
  /* ⚠ READ, NOT RUN: the three sub-views are DOM/renderer factories; every remaining handle.x is enumerated from their code. */
    const src = read(file);
    assert.match(src, new RegExp(`${handle}\\s*=\\s*GE\\(\\)\\.ui\\.createSubView\\(`),
      'the view is created as a scoped engine');
    /* every remaining `handle.x` must be one of the contract's sections. Before this round these
       were raw renderer calls — 106 of them in compare.js — and no count could see them. */
    const OK = new Set(['camera', 'coords', 'layers', 'scene', 'ui', 'render', 'input', 'events',
                        'ready', 'canDraw', 'hasRenderer', 'destroy', 'raw', 'id', 'capabilities', 'can']);
    const bad = [...codeOnly(src).matchAll(new RegExp(`\\b${handle}\\.([A-Za-z_$][\\w$]*)`, 'g'))]
      .map(m => m[1]).filter(p => !OK.has(p));
    assert.deepEqual([...new Set(bad)], [], `raw renderer calls left on ${handle}`);
  });
}

test('R179: nothing outside the adapter names the map library any more', () => {
  /* ⚠ READ, NOT RUN: the contour protocol registration needs maplibregl itself. */
  /* `setupMaplibre(maplibregl)` in js/data-layers.js was the last bare identifier: maplibre-contour
     has to be handed the renderer's namespace to register its tile protocol. That is a renderer
     detail, so scene.demContourSource owns it now. */
  assert.match(engine, /demContourSource\(o\)\{/, 'the engine derives contour tiles');
  assert.match(engine, /_demSrc\.setupMaplibre\(maplibregl\)/, '…and it is the one place that hands over the namespace');
  const dl = codeOnly(read('js/data-layers.js'));
  assert.match(dl, /GE\(\)\.scene\.demContourSource\(\{/, 'the caller asks the engine for a contour tile URL');
  assert.ok(!/setupMaplibre/.test(dl), 'and no longer registers the protocol itself');
  assert.ok(!/_mlcDem/.test(dl), '…nor caches the DEM source (that state moved with it)');
});

test('R179: renderer-owned UI attaches to a VIEW, not to a handle', () => {
  /* ⚠ READ, NOT RUN: markers and popups are renderer objects. */
  assert.match(engine, /addMarker\(o,lngLat\)\{/, 'a marker can be created and attached in one call');
  assert.match(engine, /addPopup\(o,lngLat,html\)\{/, '…and a popup');
  const pg = codeOnly(read('js/playground.js'));
  assert.match(pg, /gmap\.ui\.addMarker\(/, 'the guess map places its pins on ITS view');
  assert.ok(!/\.addTo\(gmap\)/.test(pg), 'and no longer passes the handle to addTo');
});

/* ══════════════════ #R176 ① — the camera geometry the seam carries ══════════════════ */
/* ── ① the tilt anchor lives in Mercator units ──────────────────────────────────────────────────
   Measured before the fix, on a real ctrl-drag with the ceiling lifted: the viewpoint moved 22,218 km
   at z3 and 58,506 m at z6 over Tromsø, with a 23,152 km single-frame snap when the old |lat|>89.5
   guard declined a frame. Both come from the same cause — the solve converted metres to degrees with
   110,574 and 111,320·cos(lat), a tangent plane, while the look distance at z3 is 8,573 km. */
/* (#R177) SUPERSEDED IN MECHANISM, KEPT IN INTENT — and this time the mechanism was only half right.
   Mercator units ARE the renderer's camera model, but only for one of the two transforms `globe`
   owns: it draws vertical-perspective below z12 and mercator above, and a vertical-perspective
   camera pivots about a point welded to the SPHERE, which no plane algebra describes. Measured on
   the #R176 build against the matrix MapLibre draws with — 7,115 km of drift at globe z3, 475 km at
   z6, 64.4 km at flat z6 Tromsø — while #R176's own ruler read 0 m for all of them, because that
   ruler was the fix's equation. The intent below is unchanged: solve where the renderer's camera
   really is, and never decline a frame. */
test('R176 ①: the eye anchor is solved in the renderer’s own geometry, with no bail-out frame', () => {
  /* EVALUATED: js/camera-math.js is imported and its two halves are run against each other on both
     camera models — `gEye` (where the eye is, for a camera) and `gSolveAt` (where the camera has to be,
     for an eye held fixed while the tilt changes). Holding the eye while tilting from 10° to 55° and
     then asking where the eye is must return the SAME eye, on the sphere and on the plane, at the
     zooms and latitudes #R176/#R177 measured the drift at. The independent ruler — the renderer's own
     inverted matrix — is tests/r177.spec.js; this is the identity the two halves owe each other. */
  const M = makeCameraMath();
  const c2c = 900 / 2 / Math.tan(0.6435011087932844 / 2);   /* the renderer's default 36.87° vertical fov at 900 px */
  const CASES = [[139.7, 35.68, 3], [139.7, 35.68, 6], [18.95, 69.65, 6], [139.7, 35.68, 10]];
  for (const sphere of [true, false]) for (const [lng, lat, zoom] of CASES) {
    const cam = { lng, lat, zoom, pitch: 10, bearing: 20 };
    const eye = M.gEye(cam, c2c, 512, sphere, 1);
    assert.ok(eye && isFinite(eye.alt), `no eye for ${sphere ? 'globe' : 'flat'} z${zoom} ${lat}`);
    const sol = M.gSolveAt(eye, 55, 20, c2c, 512, zoom, sphere, cam);
    assert.ok(sol && sol.ok && isFinite(sol.lng) && isFinite(sol.lat), `the solve declined ${sphere ? 'globe' : 'flat'} z${zoom} ${lat}`);
    /* on the sphere the pivot is on the surface, so the ZOOM is what a tilt spends; on the plane it is the elevation */
    if (sphere) { assert.ok(isFinite(sol.zoom) && sol.elevation === 0, 'on the sphere a tilt spends zoom'); }
    else assert.ok(isFinite(sol.elevation), 'on the plane a tilt spends elevation');
    const again = M.gEye({ lng: sol.lng, lat: sol.lat, zoom: sphere ? sol.zoom : zoom, pitch: 55, bearing: 20, elevation: sol.elevation }, c2c, 512, sphere, 1);
    /* haversine: acos loses ~0.1 m of precision at these separations, which is the size of the claim */
    const km = (a, b) => { const r = Math.PI / 180, s1 = Math.sin((b.lat - a.lat) * r / 2), s2 = Math.sin((b.lng - a.lng) * r / 2);
      return 2 * 6371.0088 * Math.asin(Math.sqrt(s1 * s1 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * s2 * s2)); };
    assert.ok(km(eye, again) < 1e-6 && Math.abs(eye.alt - again.alt) < 1e-3,
      `${sphere ? 'globe' : 'flat'} z${zoom} at ${lat}°: the eye moved ${km(eye, again).toFixed(6)} km and ${Math.abs(eye.alt - again.alt).toFixed(3)} m while the tilt changed`);
  }
  /* THE regression that produced the jerk: a declined frame applies the proposal verbatim (#R173).
     Past 89.5° the solve used to answer `{}`; out-of-world is CLAMPED, never declined. */
  for (const sphere of [true, false]) {
    const cam = { lng: 139.7, lat: 89.7, zoom: 5, pitch: 10, bearing: 20 };
    const sol = M.gSolveAt(M.gEye(cam, c2c, 512, sphere, 1), 55, 20, c2c, 512, 5, sphere, cam);
    assert.ok(sol && isFinite(sol.lng) && isFinite(sol.lat), 'a polar eye still gets an answer, not an empty frame');
    assert.ok(Math.abs(sol.lat) <= 85.051129 + 1e-9, 'and that answer is clamped to the world the renderer draws');
  }
  /* ⚠ READ, NOT RUN: the renderer reports its eye through the same function — the engine's
     `eyePosition` is wired to a live transform (maplibre-6-migration: `_tr(m)`). */
  assert.match(body, /return gEye\(cam,gC2C\(t,t\),tile,gSpherical\(t\),1\);/,
    'eyePosition reports the eye from the same geometry the anchor solves, so they cannot disagree');
  assert.doesNotMatch(body, /const mLat=110574, mLng=\(111320\*Math\.cos\(c\.lat\*r\)\)\|\|1;/, 'no metres-per-degree left in eyePosition');
});

