/* hist-modern-admin — a past date's subdivisions that are still today's are drawn by today's supply
   (js/admin-present.js), and the clock no longer opens a card on the map.
   The predicate is EVALUATED, not read (#R505): the defect was a behaviour, not a spelling. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeRegion, clipLines, ownPieces, rowIsOpen, tileBox, PRESENT_EPS_KM } from '../js/admin-present.js';

const sq = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
const unit = (g, open) => ({ type: 'Feature', geometry: g, properties: { _open: open ? 1 : 0 } });
/* three units on the equator, 1° (~111 km) wide: A and B still in force today, C since ended; sea to the north */
const A = unit(sq(0, 0, 1, 1), true), B = unit(sq(1, 0, 2, 1), true), C = unit(sq(2, 0, 3, 1), false);
const kmLng = 111.32;

test('where every unit in force is still in force today, today\'s line stands in — and only there', () => {
  const r = makeRegion([A, B, C]);
  assert.equal(r.empty, false);
  assert.equal(r.modernAt(0.5, 0.5), true, 'inside an unchanged unit');
  assert.equal(r.modernAt(1.0, 0.5), true, 'on the boundary between two unchanged units');
  assert.equal(r.modernAt(1.0, 1 + 2 / 110.6), true, 'just out to sea from an unchanged unit (the record\'s coast is coarser than today\'s)');
  assert.equal(r.modernAt(2.5, 0.5), false, 'inside a unit that has since ended');
  assert.equal(r.modernAt(2 - 3 / kmLng, 0.5), false, 'within the seam of a changed unit — its record draws that boundary');
  assert.equal(r.modernAt(2 - (PRESENT_EPS_KM * 2) / kmLng, 0.5), true, 'well clear of the changed unit');
  assert.equal(r.modernAt(0.5, 3), false, 'far out to sea: no record speaks for it, so nothing modern either');
  assert.equal(r.inPresent(0.5, 0.5), true);
  assert.equal(r.inPresent(2.5, 0.5), false);
});

test('a date with no unit still in force today hands nothing to today\'s supply', () => {
  const r = makeRegion([C]);
  assert.equal(r.empty, true);
  assert.equal(r.modernAt(2.5, 0.5), false);
  assert.equal(makeRegion([]).modernAt(0, 0), false);
});

test('the era line and today\'s line partition every segment: never both, never neither', () => {
  const r = makeRegion([A, B, C]);
  /* a line across all three units and out to sea */
  const pts = []; for (let x = -0.2; x <= 3.2; x += 0.01) pts.push([x, 0.5 + 0.6 * Math.sin(x * 3)]);
  const line = [{ type: 'Feature', geometry: { type: 'LineString', coordinates: pts }, properties: {} }];
  const now = clipLines(line, (x, y) => r.modernAt(x, y)), era = clipLines(line, (x, y) => !r.modernAt(x, y));
  const segs = fc => fc.reduce((n, f) => n + f.geometry.coordinates.length - 1, 0);
  assert.equal(segs(now) + segs(era), pts.length - 1);
  assert.ok(segs(now) > 0 && segs(era) > 0);
});

test('clipLines keeps runs whole and properties with them', () => {
  const f = { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] }, properties: { k: 1 } };
  const out = clipLines([f], x => x < 1 || x > 3);
  assert.deepEqual(out.map(g => g.geometry.coordinates), [[[0, 0], [1, 0]], [[3, 0], [4, 0]]]);
  assert.equal(out[0].properties.k, 1);
});

test('a line read back from several tiles is struck once (deepest tile owns each segment)', () => {
  const [w, s, e, n] = tileBox(2, 2, 1);   /* 0..90°E, 0..66.5°N */
  const mid = (s + n) / 2;
  const across = [[w - 5, mid], [w + 10, mid], [e - 10, mid], [e + 5, mid]];   /* runs into both neighbours' buffers */
  const piece = (z, x, y) => ({ _z: z, _x: x, _y: y, geometry: { type: 'LineString', coordinates: across }, properties: {} });
  const out = ownPieces([piece(2, 2, 1), piece(2, 1, 1), piece(2, 3, 1)]);
  const segs = out.reduce((k, f) => k + f.geometry.coordinates.length - 1, 0);
  assert.equal(segs, across.length - 1, 'three copies of the same line become one');
  /* a parent beside its own child: the child owns its quarter */
  const child = tileBox(3, 4, 2);
  const inChild = [[child[0] + 1, (child[1] + child[3]) / 2], [child[2] - 1, (child[1] + child[3]) / 2]];
  const out2 = ownPieces([{ _z: 2, _x: 2, _y: 1, geometry: { type: 'LineString', coordinates: inChild }, properties: {} },
                          { _z: 3, _x: 4, _y: 2, geometry: { type: 'LineString', coordinates: inChild }, properties: {} }]);
  assert.equal(out2.length, 1);
});

test('an open span is the builders\' year 9999', () => {
  assert.equal(rowIsOpen(['x', 4, 1872, 9, 28, 9999, 12, 31]), true);
  assert.equal(rowIsOpen(['x', 6, 1879, 5, 16, 2004, 9, 30]), false);
});

test('moving the clock opens no card on the map', () => {
  const src = fs.readFileSync(new URL('../js/layer-time-kernel.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /createElement\('div'\)[^\n]*data-legend/, 'js/layer-time-kernel.js builds a floating legend again');
});

test('a record that draws today\'s outline counts as today\'s unit even on a row cut short', async () => {
  const { rowIsToday } = await import('../js/admin-present.js');
  const { HIST_ADMIN_GAPS } = await import('../js/border-coast.js');
  const fill = HIST_ADMIN_GAPS.find((e) => e.file === 'data/hist-admin-fill.js');
  /* 岡山県's row in data/hist-admin-fill.js ends 1966-11-01, where another record speaks — the unit is still today's */
  assert.equal(rowIsToday(['Okayama', 4, 1943, 7, 1, 1966, 11, 1], fill), true);
  /* a derived historical record (令制国) is not today's, whatever its span */
  const kuni = HIST_ADMIN_GAPS.find((e) => e.file === 'data/hist-kuni.js');
  assert.equal(rowIsToday(['隠岐国', 4, 701, 1, 1, 1871, 8, 29], kuni), false);
  assert.equal(rowIsToday(['x', 4, 1872, 9, 28, 9999, 12, 31], null), true);
});
