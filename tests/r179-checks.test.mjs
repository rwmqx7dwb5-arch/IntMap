// R179 source-level checks (deterministic, no browser).
//
// The renderer seam. #R178 finished with the coupling gate reading 0 and that was true of what it
// counted — member access under the names `map`, `__imap`, `maplibregl`. Two whole classes of
// reference sat outside that: the renderer HELD or TESTED as a value (measured 327), and the raw
// handle kept under a local name after ui.createView returned it (106 calls in compare.js, 8 in
// playground.js, 5 in flight-sim.js). These pin the widened gate, the fact that it can still FAIL,
// and the per-view shape that lets an additional view stop naming the renderer at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as acorn from 'acorn';
import { scanAll, scanFile, VALUE_BUDGET, PRIMARY_VIEW_FILE, ENGINE_FILE } from '../scripts/engine-coupling.mjs';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const engine = read('js/geo-engine.js');

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
  assert.ok(values > 0, 'and the value references must be VISIBLE — reporting 0 for them is the #R178 blind spot');
  assert.ok(values <= VALUE_BUDGET,
    `value references (${values}) must stay within the budget (${VALUE_BUDGET}); the ratchet only goes down`);
  const kinds = new Set();
  outside.forEach(r => (r.values || []).forEach(v => kinds.add(v.kind)));
  assert.ok(kinds.has('tested'), 'existence tests are classified — they are the mechanical half');
  assert.ok(kinds.has('held'), 'and handles passed as arguments — the half that needs somewhere to go');
});

test('R179: `arr.map(...)` is not counted as renderer coupling', () => {
  /* #R178 learned that a regex reports `When`/`It`/`The` as APIs. Asking an AST the wrong question
     fails the same way from the other side: a first pass here counted 932 references, 605 of which
     were Array.prototype.map. A property position is not a reference to the renderer. */
  const dir = mkdtempSync(join(tmpdir(), 'imcoupling-'));
  const f = join(dir, 'probe.js');
  try {
    writeFileSync(f, `window.IntMapModules.probe=function(map,HOST){
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
     one copy is correct and a second would be the two-disagreeing-copies bug of #R176/#R177. */
  const preamble = engine.slice(0, engine.indexOf('function makeMapLibreAdapter(_m){'));
  for (const g of ['function gEye(', 'function gSolveAt(', 'function gLimitPitch(', 'function gLimitZoom('])
    assert.ok(preamble.includes(g), `shared geometry stays above the factory: ${g}`);
});

test('R179: the contract is one object, handed out twice', () => {
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
  assert.match(engine, /addMarker\(o,lngLat\)\{/, 'a marker can be created and attached in one call');
  assert.match(engine, /addPopup\(o,lngLat,html\)\{/, '…and a popup');
  const pg = codeOnly(read('js/playground.js'));
  assert.match(pg, /gmap\.ui\.addMarker\(/, 'the guess map places its pins on ITS view');
  assert.ok(!/\.addTo\(gmap\)/.test(pg), 'and no longer passes the handle to addTo');
});
