/* The domain where a planar engine (DuckDB Spatial) is allowed to answer a join — see js/gis-engine-domain.js.
   The measured table is held here as the cases themselves: every geometry the equivalence script found DIFFERING must be
   OUTSIDE the domain, every class it found the SAME must be INSIDE. When DUCKDB_MODULE points at a DuckDB binding the
   script itself is run too, so the table cannot drift from the engine (it is skipped, not green, where there is none). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { planarEquivalent, outsidePlanarDomain, EQUIVALENT_PREDICATES } from '../js/gis-engine-domain.js';

const P = (x, y) => ({ type: 'Point', coordinates: [x, y] });
const poly = (...r) => ({ type: 'Polygon', coordinates: r });
const sq = (a, b, c, d) => [[a, b], [c, b], [c, d], [a, d], [a, b]];

test('classes measured SAME are inside the domain', () => {
  assert.deepEqual(planarEquivalent([P(5, 0), P(10, 5), poly(sq(0, 0, 10, 10)), poly(sq(0, 0, 20, 20), sq(5, 5, 15, 15))]), { ok: true });
  assert.deepEqual(planarEquivalent([{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[1, 1], [9, 9]] } }, null]), { ok: true });
  assert.deepEqual(planarEquivalent([poly([[-60, 55], [60, 55], [60, 70], [-60, 70], [-60, 55]])]), { ok: true });
});

test('classes measured DIFFERENT are outside it, with the reason', () => {
  assert.equal(outsidePlanarDomain(poly(sq(170, -10, 190, 10))), 'seam');            /* written past 180 */
  assert.equal(outsidePlanarDomain(P(180, 0)), 'seam');
  assert.equal(outsidePlanarDomain(P(-180, 0)), 'seam');
  assert.equal(outsidePlanarDomain({ type: 'MultiPolygon', coordinates: [[sq(170, -10, 180, 10)]] }), 'seam');
  assert.equal(outsidePlanarDomain(P(0, 90)), 'pole');
  assert.equal(outsidePlanarDomain(poly([[-180, 85], [180, 85], [180, 90], [-180, 90], [-180, 85]])), 'seam');
  const r = planarEquivalent([P(1, 1), P(2, 2), P(0, 90)]);
  assert.deepEqual(r, { ok: false, why: 'engine-outside-equivalence-domain:pole', at: 2 });
});

test('what was not measured is refused rather than assumed', () => {
  assert.equal(outsidePlanarDomain({ type: 'GeometryCollection', geometries: [] }), 'unsupported-type');
  assert.equal(outsidePlanarDomain({ type: 'Point', coordinates: [NaN, 1] }), 'bad-position');
  assert.equal(outsidePlanarDomain({ type: 'Polygon', coordinates: [[[1]]] }), 'bad-position');
  assert.deepEqual([...EQUIVALENT_PREDICATES], ['intersects', 'within', 'contains']);   /* nearer-than is geodesic here, degrees there */
});

test('live: every pair the engine and this GIS disagree on lies outside the domain (needs DUCKDB_MODULE)', { skip: !process.env.DUCKDB_MODULE }, () => {
  const r = spawnSync(process.execPath, ['scripts/gis-engine-equivalence.mjs', '--json'], { encoding: 'utf8', maxBuffer: 1e8, env: process.env, cwd: new URL('..', import.meta.url) });
  assert.equal(r.status, 0, r.stderr);
  const rows = JSON.parse(r.stdout);
  const differing = rows.filter((x) => x.onlyIntMap + x.onlyDuckDB > 0).map((x) => x.class);
  for (const c of differing) assert.match(c, /±180|pole/, 'a class that differs must be one the domain excludes: ' + c);
  assert.ok(rows.filter((x) => x.onlyIntMap + x.onlyDuckDB === 0).length >= 20);
});
