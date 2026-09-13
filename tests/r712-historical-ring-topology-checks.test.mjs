import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function parser() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(new URL('../js/ohm-rings.js', import.meta.url), 'utf8'), context);
  return context.window.IntMapOhmRings;
}
const square = (x, y, side) => [[x,y],[x+side,y],[x+side,y+side],[x,y+side],[x,y]];
const way = (points, role = '') => ({ type: 'way', role, geometry: points.map(([lon, lat]) => ({ lon, lat })) });
const concave = [[0,0],[4,0],[4,1],[1,1],[1,4],[0,4],[0,0]];

test('a separate island inside the mainland bounding box remains land', () => {
  const R = parser();
  for (const role of ['', 'outer']) {
    const geo = R.geometryOf({ members: [way(concave, role), way(square(2,2,1), role)] });
    assert.equal(geo.type, 'MultiPolygon');
    assert.equal(geo.coordinates.length, 2);
    assert.ok(geo.coordinates.every(p => p.length === 1));
  }
});

test('actual holes and islands within holes retain their topology without source roles', () => {
  const R = parser();
  const polys = R.polysOf([square(0,0,10), square(2,2,6), square(3,3,1)]);
  assert.equal(polys.length, 2);
  assert.equal(polys[0].length, 2);
  assert.equal(polys[1].length, 1);
});

test('explicit outer roles are not converted to holes by spatial containment', () => {
  const R = parser();
  const geo = R.geometryOf({ members: [way(square(0,0,10), 'outer'), way(square(2,2,1), 'outer')] });
  assert.equal(geo.type, 'MultiPolygon');
  assert.equal(geo.coordinates.length, 2);
});

test('inner roles attach to the smallest containing shell', () => {
  const R = parser();
  const geo = R.geometryOf({ members: [way(square(0,0,10), 'outer'), way(square(2,2,6), 'inner'),
    way(square(3,3,3), 'outer'), way(square(4,4,1), 'inner')] });
  assert.equal(geo.type, 'MultiPolygon');
  assert.equal(geo.coordinates[0].length, 2);
  assert.equal(geo.coordinates[1].length, 2);
});

test('assembling touching boundaries does not join explicit inner and outer ways', () => {
  const R = parser();
  const outer = square(0,0,10), inner = [[0,0],[2,1],[1,2],[0,0]];
  const rings = R.ringsOf({ members: [way(outer.slice(0,3), 'outer'), way(inner, 'inner'), way(outer.slice(2), 'outer')] });
  assert.equal(rings.length, 2);
  assert.equal(R.polysOf(rings).length, 1);
  assert.equal(R.polysOf(rings)[0].length, 2);
});

test('role metadata leaves the existing coordinate-array serialization unchanged', () => {
  const R = parser(), points = square(0,0,1);
  assert.equal(JSON.stringify(R.ringsOf({ members: [way(points, 'outer')] })), JSON.stringify([points]));
});

test('an initially interior vertex does not turn an escaping ring into a hole', () => {
  const R = parser();
  const escaping = [[0.5,0.5],[3,0.5],[3,2],[0.5,0.5]];
  assert.equal(R.polysOf([concave, escaping]).length, 2);
});

test('edges cannot cross a concave shell even when vertices and midpoints are inside', () => {
  const R = parser();
  // A narrow notch sits off the crossing edge midpoint. Vertex-only and
  // midpoint-only containment both incorrectly classify the triangle as a hole.
  const notched = [[0,0],[10,0],[10,10],[3,10],[3,4],[2,4],[2,10],[0,10],[0,0]];
  const crossing = [[1,5],[9,5],[9,1],[1,5]];
  assert.equal(R.polysOf([notched, crossing]).length, 2);
});
