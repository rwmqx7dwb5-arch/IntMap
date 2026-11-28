import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveShape, geometryRange, mapAuthorship, shapeAnchor, tallyShapes } from '../js/atlas-shape-resolve.js';
import { gradeMap } from '../scripts/atlas-eval/map-state.mjs';
import { completionRateOf, deliverablesOfTurn } from '../scripts/atlas-eval/deliverables.mjs';

const course = { type: 'LineString', coordinates: [[174, 5], [175, 5], [-176, 5]] };
const area = { type: 'Polygon', coordinates: [[[10, 50], [11, 50], [11, 51], [10, 50]]] };
const q = (kind, name) => ({ id: name, mapState: { drawn: [{ path: 'atlas.shapes.' + kind + ':real', min: 1, named: [name] }] } });
const snap = (...features) => ({ atlas: { shapes: tallyShapes(features) } });
const feature = (geo, name, extra = {}) => ({ geo, id: name, name, author: 'atlas', basis: 'real', source: 'Regional Survey', ...extra });

test('the requested feature itself must have the matching geometry, basis, source and creator', () => {
  const { mapState } = q('line', 'Cedar River');
  const other = feature(course, 'Birch River');
  assert.equal(gradeMap(mapState, snap(other, feature(area, 'Cedar River'))).verdict, 'mismatch');
  assert.equal(gradeMap(mapState, snap(other, feature(course, 'Cedar River', { basis: 'derived' }))).verdict, 'mismatch');
  assert.equal(gradeMap(mapState, snap(other, feature(course, 'Cedar River', { author: 'user' }))).verdict, 'mismatch');
  assert.equal(gradeMap(mapState, snap(other, feature(course, 'Cedar River', { source: undefined }))).verdict, 'unobserved');
  assert.equal(gradeMap(mapState, snap(other, feature(course, 'Cedar River North'))).verdict, 'mismatch');
  assert.equal(gradeMap(mapState, snap(other, feature(course, 'Cedar River'))).verdict, 'match');
  assert.equal(gradeMap(mapState, { atlas: { shapes: { n: 2, 'line:real': 1, names: ['Cedar River', 'Birch River'] } } }).verdict, 'unobserved');
});

test('a real basin is observed complete and a false incomplete claim is counted', async () => {
  const sourceShape = { ok: true, geometry: area, basis: 'real', source: 'National Watersheds', sourceId: 'basin-73', sourceVersion: '2025', method: 'watershed_outline', transformation: 'published geometry' };
  const shape = await resolveShape('Holly catchment', 'area', { basin: async () => sourceShape, area: () => assert.fail('basin should use hydrology') });
  assert.equal(shape.target, 'Holly catchment');
  const { geometry: geo, ...provenance } = shape;
  const snapshot = snap({ id: 'shape-73', geo, ...provenance, ...mapAuthorship({ source: 'atlas', turnId: 31 }) });
  assert.deepEqual(snapshot.atlas.shapes.items.map(({ id, target, sourceId, sourceVersion, transformation, turnId }) =>
    ({ id, target, sourceId, sourceVersion, transformation, turnId })), [{ id: 'shape-73', target: 'Holly catchment', sourceId: 'basin-73', sourceVersion: '2025', transformation: 'published geometry', turnId: 31 }]);
  const turn = deliverablesOfTurn(q('area', shape.target), { completion: 'partial', snapshot });
  assert.equal(turn.finished, true);
  assert.deepEqual(completionRateOf([turn]).falseIncomplete, [shape.target]);
});

test('line ranges and distance label anchors cross the antimeridian without using the opposite hemisphere', () => {
  assert.deepEqual(geometryRange(course), { endpoints: [[174, 5], [-176, 5]], bounds: [174, 5, -176, 5] });
  const anchor = shapeAnchor(course);
  assert.ok(Math.abs(anchor.lng - 179) < 0.02, JSON.stringify(anchor));
  const split = { type: 'MultiLineString', coordinates: [[[174, 0], [180, 0]], [[-180, 0], [-176, 0]]] };
  assert.ok(Math.abs(shapeAnchor(split).lng - 179) < 1e-6);
});
