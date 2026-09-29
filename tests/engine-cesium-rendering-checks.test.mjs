// Cesium rendering — the style interpreter, the layers, vector-tile geometry, the DEM cache and the
// lifetime of what the view creates.
//
// Gathered from tests/r180-checks ② (js/cesium-style.js — the STYLE LANGUAGE INTERPRETER, the real cost
// of a second engine; pure by design, so it is run here against the same inputs MapLibre is given
// rather than looked at through a browser where a wrong colour is a screenshot nobody diffs),
// tests/r705-chronos-basemap-checks (the Cesium half: the background, the imagery floor, MVT polygon
// clipping, fills vs outlines, visualizer replacement, idempotent restyles) and
// tests/r708-dem-lifecycle-checks (the DEM cache, destroy(), overlays). The Chronos basemap's
// engine-independent half is in tests/engine-basemap-checks. Titles keep the round that wrote them.
//
// Everything here RUNS: modules that publish on `window` are evaluated with one; CesiumView methods are
// lifted out of the class with the parser and called against a view stub; where Cesium's own objects
// are the subject (ImageryLayerCollection, entities) the real @cesium/engine package is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';
import { simple } from 'acorn-walk';
import polygonClipping from 'polygon-clipping';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

/* one sandbox for the window-publishing modules this file drives */
const ctx = vm.createContext({ window: {}, console });
for (const file of ['js/historical-basemap.js', 'js/cesium-style.js', 'js/cesium-vector-tiles.js']) vm.runInContext(read(file), ctx);
const S = ctx.window.IntMapStyle;
const projectPolygons = ctx.window.IntMapVectorTiles.polygonGeometry;

/* CesiumView's methods by name, as a prototype — `deps` are the free names they may use */
function cesiumViewMethods(names, deps = {}) {
  const source = read('js/cesium-engine.js');
  let cls;
  simple(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }), { ClassDeclaration(n) { if (n.id.name === 'CesiumView') cls = n; } });
  const code = cls.body.body.filter((n) => n.key && names.includes(n.key.name)).map((n) => source.slice(n.start, n.end)).join('\n');
  const keys = Object.keys(deps);
  return new Function(...keys, `return class {${code}}.prototype;`)(...keys.map((k) => deps[k]));
}

/* ══ #R180 ② THE STYLE-LANGUAGE INTERPRETER ═══════════════════════════════════════════════════ */

test('R180 ②: colours parse in every spelling the app writes them in', () => {
  const near = (a, b) => Math.abs(a - b) < 0.004;
  const c1 = S.parseColor('#ff3b30');
  assert.ok(near(c1.r, 1) && near(c1.g, 0x3b / 255) && near(c1.b, 0x30 / 255) && c1.a === 1);
  assert.ok(near(S.parseColor('#0a84ff88').a, 0x88 / 255), '8-digit hex carries alpha');
  assert.ok(near(S.parseColor('#f00').r, 1), '3-digit hex');
  assert.ok(near(S.parseColor('rgba(0,122,255,0.18)').a, 0.18), 'rgba()');
  assert.ok(near(S.parseColor('rgb(255,255,255)').g, 1), 'rgb()');
  assert.ok(near(S.parseColor('hsl(120,100%,50%)').g, 1), 'hsl()');
  assert.ok(near(S.parseColor('white').b, 1), 'a CSS name');
  assert.equal(S.parseColor('transparent').a, 0);
  assert.equal(S.parseColor('not-a-colour'), null, 'and an unparseable value says so rather than guessing');
});

test('R180 ②: the operators the app actually uses evaluate correctly', () => {
  const c = { properties: { kind: 'a', n: 7, name: 'Tokyo' }, geometryType: 'Point', id: 3,
              zoom: 6, state: { hover: true } };
  const e = (x) => S.evaluate(x, c);
  assert.equal(e(['get', 'kind']), 'a');
  assert.equal(e(['get', 'missing']), null);
  assert.equal(e(['has', 'n']), true);
  assert.equal(e(['geometry-type']), 'Point');
  assert.equal(e(['id']), 3);
  assert.equal(e(['zoom']), 6);
  assert.equal(e(['feature-state', 'hover']), true);
  assert.equal(e(['==', ['get', 'kind'], 'a']), true);
  assert.equal(e(['!=', ['get', 'kind'], 'a']), false);
  assert.equal(e(['all', ['==', ['get', 'kind'], 'a'], ['>', ['get', 'n'], 3]]), true);
  assert.equal(e(['any', ['==', ['get', 'kind'], 'z'], ['<', ['get', 'n'], 3]]), false);
  assert.equal(e(['!', ['has', 'nope']]), true);
  assert.equal(e(['coalesce', ['get', 'missing'], ['get', 'kind']]), 'a');
  assert.equal(e(['case', ['==', ['get', 'kind'], 'b'], 'B', ['==', ['get', 'kind'], 'a'], 'A', 'Z']), 'A');
  assert.equal(e(['match', ['get', 'kind'], 'x', 1, ['a', 'b'], 2, 0]), 2, 'a match label may be a LIST');
  assert.equal(e(['in', 'ok', ['literal', ['no', 'ok']]]), true);
  assert.equal(e(['concat', 'x', ['get', 'n']]), 'x7');
  assert.equal(e(['to-number', '12.5']), 12.5);
  assert.equal(e(['literal', [1, 2]]).length, 2);
  assert.equal(e(['+', 1, 2, 3]), 6);
  assert.equal(e(['step', ['get', 'n'], 'lo', 5, 'mid', 10, 'hi']), 'mid');
  assert.equal(e(['let', 'v', 4, ['*', ['var', 'v'], 3]]), 12);
  /* a text-font stack is an ARRAY LITERAL whose first element is a string — it must not be
     mistaken for an operator, which is what makes `literal` optional in most of the style */
  assert.deepEqual(e(['Noto Sans Regular']), ['Noto Sans Regular']);
});

test('R180 ②: interpolate matches the arithmetic MapLibre does', () => {
  const at = (n) => S.evaluate(['interpolate', ['linear'], ['get', 'n'], 0, 4, 10, 18],
    { properties: { n }, zoom: 0 });
  assert.equal(at(0), 4);
  assert.equal(at(10), 18);
  assert.equal(at(7), 4 + 14 * 0.7, 'linear between the bracketing stops');
  assert.equal(at(-5), 4, 'clamped below the first stop');
  assert.equal(at(99), 18, 'and above the last');
  /* colours interpolate as colours, not as strings */
  const mid = S.parseColor(S.evaluate(['interpolate', ['linear'], ['zoom'], 0, '#000000', 10, '#ffffff'], { zoom: 5 }));
  assert.ok(Math.abs(mid.r - 0.5) < 0.01, 'a colour ramp mixes channel-wise');
  /* exponential with base 2: halfway in INPUT is not halfway in output */
  const ex = S.evaluate(['interpolate', ['exponential', 2], ['zoom'], 0, 0, 10, 100], { zoom: 5 });
  assert.ok(ex > 0 && ex < 50, `exponential must bend below the linear midpoint, got ${ex}`);
});

test('R180 ②: both filter spellings compile, including $type', () => {
  const P = { properties: { kind: 'equator' }, geometryType: 'LineString' };
  const Q = { properties: { kind: 'minor' }, geometryType: 'Point' };
  /* the LEGACY form, which is what the boot style and every tool layer are written in */
  const legacy = ['all', ['==', '$type', 'LineString'], ['!=', 'kind', 'equator']];
  assert.ok(S.isLegacyFilter(legacy), 'recognised as legacy: the second element is a KEY, not an expression');
  const f1 = S.compileFilter(legacy);
  assert.equal(f1(P), false, 'the equator line is excluded by name');
  assert.equal(f1({ properties: { kind: 'major' }, geometryType: 'LineString' }), true);
  assert.equal(f1(Q), false, 'and a Point is excluded by $type');
  /* …and the MODERN form, which is not legacy because its second element is an expression */
  const modern = ['==', ['get', 'kind'], 'equator'];
  assert.equal(S.isLegacyFilter(modern), false);
  assert.equal(S.compileFilter(modern)(P), true);
  assert.equal(S.compileFilter(null)(Q), true, 'no filter passes everything');
  /* `in` and `!in` legacy forms */
  assert.equal(S.compileFilter(['in', 'kind', 'a', 'equator'])(P), true);
  assert.equal(S.compileFilter(['!in', 'kind', 'equator'])(P), false);
  assert.equal(S.compileFilter(['has', 'kind'])(P), true);
});

test('R180 ②: a constant is told from an expression, and a zoom-only one from a per-feature one', () => {
  assert.equal(S.isExpression('#ff0000'), false);
  assert.equal(S.isExpression([2, 2]), false, 'a dash array is data, not an expression');
  assert.equal(S.isExpression(['get', 'x']), true);
  /* this is what keeps 49 circle layers from being re-evaluated per point per frame */
  assert.equal(S.dependsOnFeature(['interpolate', ['linear'], ['zoom'], 0, 1, 10, 5]), false);
  assert.equal(S.dependsOnFeature(['case', ['==', ['get', 'k'], 1], 'a', 'b']), true);
  assert.equal(S.dependsOnZoom(['interpolate', ['linear'], ['zoom'], 0, 1, 10, 5]), true);
  assert.equal(S.dependsOnZoom(['get', 'k']), false);
});

test('R180 ②: the legacy {stops} function still resolves — the choropleths emit it', () => {
  const fn = { property: 'v', type: 'interval', stops: [[0, '#eee'], [10, '#aaa'], [20, '#333']] };
  assert.equal(S.resolve(fn, { properties: { v: 12 }, zoom: 4 }), '#aaa');
  assert.equal(S.resolve(fn, { properties: { v: 0 }, zoom: 4 }), '#eee');
  const cat = { property: 'k', type: 'categorical', stops: [['a', 1], ['b', 2]], default: 9 };
  assert.equal(S.resolve(cat, { properties: { k: 'b' } }), 2);
  assert.equal(S.resolve(cat, { properties: { k: 'zz' } }), 9, 'and falls to its own default');
});

test('R180 ②: a broken expression costs one wrong value, never the layer', () => {
  assert.equal(S.evaluate(['get'], {}), null);
  assert.deepEqual(S.evaluate(['nonsense-op', 1, 2], {}), ['nonsense-op', 1, 2],
    'an unknown leading string is an ARRAY LITERAL, not a broken operator — which is exactly why ' +
    "a text-font stack like ['Noto Sans Regular'] needs no `literal` wrapper");
  assert.equal(S.evaluate(null, {}), null);
  assert.equal(S.resolveNum(['/', 1, 0], {}, 42), 42, 'and a fallback is used rather than NaN reaching the GPU');
  /* what it knows it cannot do is REPORTED, not hidden (#R162) */
  assert.ok(Array.isArray(S.UNSUPPORTED) && S.UNSUPPORTED.includes('within'));
});

/* ══ #R705 THE BACKGROUND, THE IMAGERY FLOOR AND VECTOR-TILE GEOMETRY UNDER CHRONOS ════════════ */

test('#R705 Cesium background respects visibility, order, paint changes and restores its default', () => {
  const methods = ['_applyBackground', '_sameStyleValue', 'setVisible', 'setPaint', 'removeLayer', 'moveLayer'];
  const proto = cesiumViewMethods(methods, { Cesium: { Color: class { constructor(r, g, b, a) { Object.assign(this, { r, g, b, a }); } } }, S: () => S });
  const fallback = { default: true };
  const mk = (id, color, visibility = 'visible') => ({ kind: 'background', def: { id, paint: { 'background-color': color }, layout: { visibility } } });
  const a = mk('a', '#112233'), b = mk('b', '#aabbcc', 'none');
  const view = Object.assign(Object.create(proto), { _layers: [a, b], _layerById: new Map([['a', a], ['b', b]]), _globe: {}, _defaultBaseColor: fallback, _scene: { requestRender() {} }, getZoom: () => 4, _schedule() {}, _teardownLayer() {}, fire() {}, _reorderImagery() {}, _buildLayer() { this._applyBackground(); } });
  view._applyBackground(); assert.equal(view._globe.baseColor.r, 17 / 255);
  view.setVisible('b', true); assert.equal(view._globe.baseColor.r, 170 / 255);
  view.setPaint('a', 'background-color', '#ff0000'); assert.equal(view._globe.baseColor.r, 170 / 255);
  view.moveLayer('b', 'a'); assert.equal(view._globe.baseColor.r, 1);
  view.setVisible('a', false); assert.equal(view._globe.baseColor.r, 170 / 255);
  view.removeLayer('b'); assert.equal(view._globe.baseColor, fallback);
});

test('#R705 Cesium partial imagery never owns the stretching base-layer role', async () => {
  const C = await import('@cesium/engine');
  const source = read('js/cesium-engine.js');
  let method;
  simple(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }), { MethodDefinition(n) { if (n.key.name === '_installImageryFloor') method = n; } });
  const document = { createElement: () => ({ toDataURL: () => 'data:image/png;base64,' }) };
  const proto = new Function('Cesium', 'document', `return class {${source.slice(method.start, method.end)}}.prototype;`)(C, document);
  const coll = new C.ImageryLayerCollection();
  const view = Object.assign(Object.create(proto), { _scene: { imageryLayers: coll } });
  const cap = new C.ImageryLayer(new C.SingleTileImageryProvider({ url: 'data:image/png;base64,', tileWidth: 1, tileHeight: 1, rectangle: C.Rectangle.fromDegrees(-180, 85, 180, 90) }));
  coll.add(cap); assert.equal(cap.isBaseLayer(), true, 'reproduces Cesium stretching a partial cap');
  view._installImageryFloor();
  assert.equal(view._imageryFloor.isBaseLayer(), true);
  assert.equal(cap.isBaseLayer(), false);
  assert.equal(view._imageryFloor.imageryProvider.rectangle, C.Rectangle.MAX_VALUE);
  view._installImageryFloor(); assert.equal(coll.length, 2, 'idempotent installation');
  cap.show = false; coll._update(); cap.show = true; coll._update();
  assert.equal(cap.isBaseLayer(), false, 'theme and satellite visibility cannot promote the cap');
  coll.destroy();
});

test('#R705 MVT polygon buffers are clipped before spherical rendering with holes and multiple pieces intact', () => {
  const g = { type: 'MultiPolygon', coordinates: [[[[-182.8125, -2.8114], [2.8125, -2.8114], [2.8125, 85.2879], [-182.8125, 85.2879], [-182.8125, -2.8114]], [[-80, 10], [-70, 10], [-70, 20], [-80, 20], [-80, 10]]]] };
  const original = JSON.stringify(g);
  const result = projectPolygons(g, 0, 0, 1, polygonClipping);
  assert.equal(JSON.stringify(g), original, 'source coordinates remain intact');
  assert.ok(result.coordinates.length >= 4);
  assert.ok(result.coordinates.some((p) => p.length > 1), 'the island hole survives clipping');
  for (const poly of result.coordinates) {
    const points = poly.flat(); const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    assert.ok(Math.min(...xs) >= -180 - 1e-10 && Math.max(...xs) <= 1e-10);
    assert.ok(Math.min(...ys) >= -1e-10 && Math.max(...ys) <= 85.0511287798066 + 1e-10);
    assert.ok(Math.max(...xs) - Math.min(...xs) <= 90 + 1e-10, 'no hemisphere-spanning local triangulation');
    for (const ring of poly) { assert.deepEqual(ring[0], ring.at(-1)); for (let i = 1; i < ring.length; i++) assert.ok(Math.abs(ring[i][0] - ring[i - 1][0]) <= 1.000001); }
  }
});

test('#R705 world and date-line MVT polygons stay bounded; lines and labels remain unchanged', () => {
  const g = { type: 'Polygon', coordinates: [[[-182, -86], [182, -86], [182, 86], [-182, 86], [-182, -86]]] };
  for (const [x, y, z] of [[0, 0, 0], [1, 0, 1], [3, 1, 2]]) {
    const result = projectPolygons(g, x, y, z, polygonClipping); assert.ok(result.coordinates.length);
    const lo = -180 + x * 360 / 2 ** z, hi = -180 + (x + 1) * 360 / 2 ** z;
    for (const p of result.coordinates) { const xs = p.flat().map((c) => c[0]); assert.ok(Math.min(...xs) >= lo - 1e-9 && Math.max(...xs) <= hi + 1e-9); assert.ok(Math.max(...xs) - Math.min(...xs) <= 90 + 1e-9); }
  }
  for (const line of [{ type: 'LineString', coordinates: [[-182, 0], [182, 0]] }, { type: 'Point', coordinates: [12, 34] }]) assert.equal(projectPolygons(line, 0, 0, 0, polygonClipping), line);
});

test('#R705 Cesium fills use clipped geometry but outlines keep original edges and fill alpha', async () => {
  const C = await import('@cesium/engine');
  vm.runInContext(read('js/cesium-layers.js'), ctx);
  const r = ctx.window.IntMapCesiumLayers.makeVectorRenderer(C);
  const feature = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] }, fillGeometry: { type: 'MultiPolygon', coordinates: [[[[0, 0], [5, 0], [5, 10], [0, 10], [0, 0]]], [[[5, 0], [10, 0], [10, 10], [5, 10], [5, 0]]]] } };
  const env = { zoom: 2, maxFeatures: 100 };
  const fill = r.build({ id: 'fill', type: 'fill', paint: { 'fill-color': '#000000', 'fill-opacity': 0.001 } }, [feature], env);
  const line = r.build({ id: 'line', type: 'line', paint: { 'line-color': '#ffffff' } }, [feature], env);
  assert.equal(fill.entities.values.length, 2, 'two clipped fill pieces');
  assert.equal(line.entities.values.length, 1, 'one original outline without the artificial partition');
  assert.equal(line.entities.values[0].polyline.positions.getValue().length, 5);
  assert.equal(fill.entities.values[0].polygon.material.color.getValue().alpha, 0.001);
});

test('#R705 Cesium visualizers receive replacement entities rather than retaining a prior era', async () => {
  const C = await import('@cesium/engine');
  vm.runInContext(read('js/cesium-layers.js'), ctx);
  const r = ctx.window.IntMapCesiumLayers.makeVectorRenderer(C);
  const def = { id: 'era', type: 'line', paint: { 'line-color': '#ffffff' } };
  const feature = (x) => ({ type: 'Feature', properties: { year: x }, geometry: { type: 'LineString', coordinates: [[x, 0], [x + 1, 1]] } });
  const env = { zoom: 2, maxFeatures: 100 };
  const ds = r.build(def, [feature(0)], env), old = ds.entities.values[0], events = [];
  ds.entities.collectionChanged.addEventListener((s, a, d) => events.push({ added: [...a], removed: [...d] }));
  r.update(ds, def, [feature(30)], env);
  assert.equal(events.length, 2);
  assert.equal(events[0].removed[0], old);
  assert.equal(events[1].added[0], ds.entities.values[0]);
  assert.notEqual(ds.entities.values[0], old);
  assert.equal(ds.entities.values[0].properties.year.getValue(), 30);
  assert.ok(Math.abs(C.Cartographic.fromCartesian(ds.entities.values[0].polyline.positions.getValue()[0]).longitude - C.Math.toRadians(30)) < 1e-10);
  r.update(ds, def, [feature(0)], env);
  assert.equal(events.length, 4, 'return to the prior era also detaches stale geometry');
  assert.equal(ds.entities.values[0].properties.year.getValue(), 0);
  ds.show = false;
  assert.equal(ds.entities.values[0].isShowing, false);
});

test('#R705 reasserting the same Cesium style does not continually replace pending primitives', () => {
  const proto = cesiumViewMethods(['_sameStyleValue', 'setVisible', 'setPaint', 'setLayout', 'setFilter']);
  const rec = { def: { layout: { visibility: 'visible' }, paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 2] }, filter: ['==', ['get', 'x'], 1] }, ds: { show: true } };
  let scheduled = 0;
  const view = Object.assign(Object.create(proto), { _layerById: new Map([['x', rec]]), _dirty: new Set(), _schedule() { scheduled++; } });
  for (let i = 0; i < 5; i++) { view.setVisible('x', true); view.setPaint('x', 'line-width', JSON.parse(JSON.stringify(rec.def.paint['line-width']))); view.setLayout('x', 'visibility', 'visible'); view.setFilter('x', ['==', ['get', 'x'], 1]); }
  assert.equal(scheduled, 0); assert.equal(view._dirty.size, 0);
  view.setPaint('x', 'line-width', 2); assert.equal(scheduled, 1); assert.ok(view._dirty.has('x'));
});

/* ══ #R708 THE DEM CACHE AND WHAT A DESTROYED VIEW LEAVES BEHIND ═══════════════════════════════ */

function demHarness() {
  const pending = [];
  const c = vm.createContext({ Float32Array, Map, Symbol, AbortController,
    fetch: () => new Promise((resolve) => pending.push(resolve)),
    createImageBitmap: async () => ({ width: 256, close() {} }),
    OffscreenCanvas: class { getContext() { return { drawImage() {}, getImageData() { return { data: new Uint8Array(256 * 256 * 4) }; } }; } },
  });
  c.window = c; vm.runInContext(read('js/mem-budget.js'), c); vm.runInContext(read('js/cesium-layers.js'), c);
  const complete = () => pending.shift()({ ok: true, blob: async () => ({}) });
  return { ctx: c, complete, make: () => c.IntMapCesiumLayers.makeDemCache() };
}
test('#R708 independent DEM views are counted and releasing one preserves the other', async () => {
  const h = demHarness(), a = h.make(), b = h.make();
  let p = a.get(1, 0, 0); h.complete(); await p;
  p = b.get(1, 1, 0); h.complete(); await p;
  assert.equal(h.ctx.IntMapMemBudget.heldBytes(), 2 * 262144);
  a.destroy(); assert.equal(h.ctx.IntMapMemBudget.heldBytes(), 262144);
  b.destroy(); assert.equal(h.ctx.IntMapMemBudget.heldBytes(), 0);
  assert.equal(h.ctx.IntMapMemBudget.stores().length, 0);
});
test('#R708 a cleared DEM request cannot repopulate cache or erase its replacement', async () => {
  const h = demHarness(), a = h.make(); const old = a.get(1, 0, 0); a.clear();
  const fresh = a.get(1, 0, 0); h.complete(); await old;
  assert.equal(a.size(), 0);
  assert.equal(a.get(1, 0, 0), fresh);
  h.complete(); const data = await fresh; assert.equal(data.length, 65536); assert.equal(a.size(), 1);
});
test('#R708 destroy rejects late DEM completions, unregisters, and cannot start new work', async () => {
  const h = demHarness(), a = h.make(); const pending = a.get(2, 1, 1); a.destroy(); h.complete();
  assert.equal(await pending, null); assert.equal(a.size(), 0);
  assert.equal(h.ctx.IntMapMemBudget.stores().length, 0);
  assert.equal(await a.get(2, 1, 1), null);
});
test('#R708 destroyed view stops external timers, clock subscription and child resources once', () => {
  const src = read('js/cesium-engine.js'), ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  let cls; const walkAll = (n) => { if (!n || typeof n !== 'object') return; if (n.type === 'ClassDeclaration' && n.id.name === 'CesiumView') cls = n; for (const v of Object.values(n)) if (Array.isArray(v)) v.forEach(walkAll); else if (v && typeof v === 'object') walkAll(v); }; walkAll(ast);
  const methods = cls.body.body.filter((n) => ['destroy', '_airHalt'].includes(n.key?.name)).map((n) => src.slice(n.start, n.end)).join(',');
  const stopped = [], released = []; const proto = vm.runInNewContext('({' + methods + '})', { stopTick: (k) => stopped.push(k), clearTimeout() {} });
  const view = Object.assign(Object.create(proto), { _skyTick: 'sky', _airTimer: 'air', _timeOff: () => released.push('clock'), _dem: { destroy: () => released.push('dem') }, _sources: new Map([['v', { vt: { destroy: () => released.push('vector') } }]]), _dsDisplay: { destroy: () => released.push('display') }, _widget: { destroy: () => released.push('widget') } });
  view.destroy(); view.destroy();
  assert.deepEqual(stopped.sort(), ['air', 'sky']); assert.deepEqual(released.sort(), ['clock', 'dem', 'display', 'vector', 'widget']);
});
function overlayHarness() {
  const src = read('js/cesium-engine.js'); let fn;
  function walkAll(n) { if (!n || typeof n !== 'object') return; if (n.type === 'FunctionDeclaration' && n.id.name === 'makeOverlay') fn = n; for (const v of Object.values(n)) if (Array.isArray(v)) v.forEach(walkAll); else if (v && typeof v === 'object') walkAll(v); }
  walkAll(parse(src, { ecmaVersion: 'latest', sourceType: 'module' }));
  function element() { return { style: {}, children: [], listeners: new Map(), appendChild(c) { this.children.push(c); c.parentNode = this; }, setAttribute() {}, addEventListener(k, f) { this.listeners.set(k, f); }, remove() { this.parentNode = null; } }; }
  const frames = new Map(); let next = 0;
  const make = vm.runInNewContext('(' + src.slice(fn.start, fn.end) + ')', {
    document: { createElement: element, documentElement: { lang: 'en' } }, window: { IntMapLang: { t: () => '' } },
    normLngLat: (ll) => ll, requestAnimationFrame: (f) => { frames.set(++next, f); return next; }, cancelAnimationFrame: (id) => frames.delete(id),
  });
  function view() {
    const events = new Map(), host = element();
    return { _widget: {}, getContainer: () => host,
      on(k, f) { if (!events.has(k)) events.set(k, []); events.get(k).push(f); },
      off(k, f) { events.set(k, (events.get(k) || []).filter((x) => x !== f)); },
      count: () => [...events.values()].reduce((a, b) => a + b.length, 0), fire(k) { for (const f of (events.get(k) || []).slice()) f(); } };
  }
  return { make, frames, view };
}
test('#R708 removed overlays return all view listeners and queued frames after repeated reuse', () => {
  const h = overlayHarness(), v = h.view(), p = h.make(() => v, 'popup', {});
  p.setLngLat([0, 0]); assert.equal(h.frames.size, 0);
  for (let i = 0; i < 100; i++) {
    p.addTo(v).addTo(v); assert.equal(v.count(), 4); assert.equal(h.frames.size, 1);
    p.remove(); assert.equal(v.count(), 0); assert.equal(h.frames.size, 0);
  }
});
test('#R708 overlay migration detaches previous view and preserves close-on-click options and button', () => {
  const h = overlayHarness(), a = h.view(), b = h.view(); let closes = 0;
  const p = h.make(() => a, 'popup', { onClose: () => closes++ });
  p.addTo(a).addTo(b); assert.equal(a.count(), 0); assert.equal(b.count(), 4);
  a.fire('click'); assert.equal(p.isOpen(), true);
  b.fire('click'); assert.equal(p.isOpen(), false); assert.equal(closes, 1); assert.equal(b.count(), 0);
  const pinned = h.make(() => a, 'popup', { closeOnClick: false }); pinned.addTo(a);
  assert.equal(a.count(), 3); a.fire('click'); assert.equal(pinned.isOpen(), true);
  const content = pinned.getElement().children[1], button = content.children[0]; button.listeners.get('click')();
  assert.equal(pinned.isOpen(), false); assert.equal(a.count(), 0); assert.equal(h.frames.size, 0);
});
