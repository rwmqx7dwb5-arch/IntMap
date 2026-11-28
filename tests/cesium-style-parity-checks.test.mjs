// Cesium style interpreter parity — the operators MapLibre evaluates that the Cesium interpreter
// (js/cesium-style.js) either implements or declares unsupported. The declaration is a claim that the
// app never writes the operator; this file is what makes the claim checkable.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const ctx = vm.createContext({ window: {}, console });
vm.runInContext(read('js/cesium-style.js'), ctx);
const S = ctx.window.IntMapStyle;

test('every operator the interpreter declares unsupported is one the app never writes', () => {
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(new URL(d, root), { withFileTypes: true })) {
      const p = d + e.name;
      if (e.isDirectory()) walk(p + '/'); else if (/\.m?js$/.test(e.name)) files.push(p);
    }
  })('js/');
  const hits = [];
  const re = new RegExp('\\[\\s*[\'"`](' + S.UNSUPPORTED.join('|') + ')[\'"`]\\s*[,\\]]', 'g');
  /* the sweep must be able to see something, or it passes on an empty match */
  assert.ok(re.test("['pitch']") && (re.lastIndex = 0, true), 'the pattern matches an expression');
  assert.ok(files.length > 100, 'the sweep reads the app, not an empty list');
  for (const f of files) {
    if (f === 'js/cesium-style.js') continue;
    const src = read(f);
    /* a plain substring test first: the regex over 27 MB of source is what costs 30 s */
    if (!S.UNSUPPORTED.some((op) => src.includes(op))) continue;
    for (const m of src.matchAll(re)) hits.push(`${f}: ['${m[1]}', …]`);
  }
  assert.deepEqual(hits, [], 'the app writes an operator the Cesium interpreter does not implement — implement it, then take it off UNSUPPORTED');
});

test('distance: the era-name guard of js/hist-cities.js answers the way MapLibre does', () => {
  const near = (lon, lat, g) => ['<=', ['distance', { type: 'Point', coordinates: [lon, lat] }], g];
  const pt = (lon, lat) => ({ geometry: { type: 'Point', coordinates: [lon, lat] } });
  // Kochi city (Japan) vs Kochi (India): the same spelling, ~7,000 km apart
  assert.equal(S.evaluate(near(133.531, 33.559, 20000), pt(133.54, 33.56)), true);
  assert.equal(S.evaluate(near(133.531, 33.559, 20000), pt(76.267, 9.931)), false);
  // one degree of latitude is ~111.2 km
  const d = S.evaluate(['distance', { type: 'Point', coordinates: [0, 0] }], pt(0, 1));
  assert.ok(Math.abs(d - 111195) < 200, `got ${d}`);
  // line and polygon features
  const line = { geometry: { type: 'LineString', coordinates: [[-1, 1], [1, 1]] } };
  assert.ok(Math.abs(S.evaluate(['distance', { type: 'Point', coordinates: [0, 0] }], line) - 111195) < 400);
  const poly = { geometry: { type: 'Polygon', coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]] } };
  assert.equal(S.evaluate(['distance', { type: 'Point', coordinates: [0, 0] }], poly), 0);
  // no geometry in the context → unknown, so the guard fails rather than passing
  assert.equal(S.evaluate(near(0, 0, 1e9), {}), false);
  // and it is feature-dependent, so a layer is not evaluated once for all features
  assert.equal(S.dependsOnFeature(near(0, 0, 1)), true);
  assert.ok(!S.UNSUPPORTED.includes('distance'));
});

test('cesium-layers hands the feature geometry to the evaluator', () => {
  assert.match(read('js/cesium-layers.js'), /state:state\|\|\{\},\s*geometry:f\.geometry/);
});

test('Cesium applies opacity to both parts of a circle, to label ink and halo, and to icons', () => {
  vm.runInContext(read('js/cesium-layers.js'), ctx);
  class Color {
    constructor(_r, _g, _b, alpha = 1) { this.alpha = alpha; }
  }
  const renderer = ctx.window.IntMapCesiumLayers.makeVectorRenderer({
    Color, Cartesian3: { fromDegrees: (...v) => v }, Matrix4: class {}, Cartesian4: class {},
    HeightReference: { NONE: 0, CLAMP_TO_GROUND: 1 },
    LabelStyle: { FILL: 0, FILL_AND_OUTLINE: 1 },
    HorizontalOrigin: { CENTER: 0 }, VerticalOrigin: { CENTER: 0 },
  });
  const values = [];
  const ds = { entities: {
    values, removeAll: () => { values.length = 0; }, add: (v) => { values.push(v); return v; },
    suspendEvents: () => {}, resumeEvents: () => {},
  } };
  const opacity = ['get', 'opacity'];
  const circle = { id: 'circles', type: 'circle', paint: {
    'circle-opacity': opacity, 'circle-stroke-color': 'rgba(255,255,255,0.8)', 'circle-stroke-opacity': opacity,
  } };
  const symbol = { id: 'labels', type: 'symbol', layout: { 'text-field': 'A', 'icon-image': 'mark' }, paint: {
    'text-opacity': opacity, 'text-halo-color': 'rgba(255,255,255,0.8)', 'icon-opacity': opacity,
  } };
  const env = { zoom: 3, maxFeatures: 5, images: { mark: {} } };
  for (const alpha of [0, 0.5, 1]) {
    const features = [{ properties: { opacity: alpha }, geometry: { type: 'Point', coordinates: [0, 0] } }];
    renderer.update(ds, circle, features, env);
    assert.equal(values[0].point.color.alpha, alpha);
    assert.equal(values[0].point.outlineColor.alpha, alpha * 0.8);
    renderer.update(ds, symbol, features, env);
    assert.equal(values[0].label.fillColor.alpha, alpha);
    assert.equal(values[0].label.outlineColor.alpha, alpha * 0.8);
    assert.equal(values[0].billboard.color.alpha, alpha);
  }
});

test('interpolate evaluates only the two paint outputs spanning the zoom', () => {
  const steps = ['interpolate', ['linear'], ['zoom']];
  const seen = [], properties = {};
  for (let stop = 0; stop <= 200; stop++) {
    Object.defineProperty(properties, 's' + stop, { get() { seen.push(stop); return stop; } });
    steps.push(stop / 10, ['get', 's' + stop]);
  }
  assert.equal(S.evaluate(steps, { properties, zoom: 4.05 }), 40.5);
  assert.deepEqual(seen.splice(0), [40, 41]);
  assert.equal(S.evaluate(steps, { properties, zoom: 22 }), 200);
  assert.deepEqual(seen, [200]);
});

test('collator / number-format / resolved-locale / within answer the way MapLibre does', () => {
  const ev = (e, c) => S.evaluate(e, c);
  // collator: case/diacritic-insensitive equality and ordering as the third argument
  const ci = ['collator', { 'case-sensitive': false, 'diacritic-sensitive': false }];
  assert.equal(ev(['==', 'Café', 'cafe', ci]), true);
  assert.equal(ev(['==', 'Café', 'cafe']), false);
  assert.equal(ev(['<', 'apple', 'Banana', ci]), true);
  assert.equal(typeof ev(['resolved-locale', ['collator', { locale: 'ja' }]]), 'string');
  // number-format
  assert.equal(ev(['number-format', 1234.5, { locale: 'en-US', 'min-fraction-digits': 2 }]), '1,234.50');
  assert.equal(ev(['number-format', 'x', {}]), '');
  // within: a point feature inside / outside a polygon, and it is feature-dependent
  const poly = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] };
  const pt = (x, y) => ({ geometry: { type: 'Point', coordinates: [x, y] } });
  assert.equal(ev(['within', poly], pt(5, 5)), true);
  assert.equal(ev(['within', poly], pt(15, 5)), false);
  assert.equal(ev(['within', poly], {}), false);
  assert.equal(S.dependsOnFeature(['within', poly]), true);
  for (const op of ['collator', 'number-format', 'resolved-locale', 'within']) assert.ok(!S.UNSUPPORTED.includes(op), op);
});
