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
  assert.ok(re.test("['within', 1]") && (re.lastIndex = 0, true), 'the pattern matches an expression');
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
