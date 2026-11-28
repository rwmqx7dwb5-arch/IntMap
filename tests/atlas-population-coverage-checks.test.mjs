import assert from 'node:assert/strict';
import test from 'node:test';
import * as turf from '@turf/turf';
import clip from 'polygon-clipping';
import capabilities from '../js/atlas-cap-data.js';
import { popArea } from '../js/sims.js';

const run = capabilities.find(entry => entry.row[0] === 'data.populationIn').run;
const close = points => [...points, points[0]];
const polygon = (...rings) => ({ type: 'Polygon', coordinates: rings });
const multi = (...polygons) => ({ type: 'MultiPolygon', coordinates: polygons.map(p => p.coordinates) });
const parts = geom => geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
const area = geom => turf.area(geom) / 1e6;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, actual + ' vs ' + expected);
const sameFootprint = (actual, expected) => {
  near(area({ type: 'MultiPolygon', coordinates: clip.xor(parts(actual), parts(expected)) }), 0);
};

function harness(t, tileFails = () => false) {
  const requests = [];
  const successful = [];
  const objects = [];
  let painted = [];
  const window = { _imHlPolys: { tagId: p => p.id ||= 'poly-' + objects.length } };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.worldpop.org/v3/population');
    const { geojson, year } = JSON.parse(options.body);
    const geometry = geojson;
    requests.push(geometry);
    assert.ok(area(geometry) > 0, 'only positive-area pieces are submitted');
    if (tileFails(geometry)) return { ok: false, status: 503, json: async () => ({ error: 'test outage' }) };
    successful.push(geometry);
    return { ok: true, status: 200, json: async () => ({
      total_population: area(geometry) * 100, data_year: year, data_source: 'WorldPop test fixture'
    }) };
  });
  t.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) =>
    realSetTimeout(callback, delay < 60000 ? 0 : delay, ...args));
  Object.assign(globalThis, { window, turf });
  popArea({});
  return {
    requests, successful, estimate: window.IntMapPopArea.estimate, circleGeom: window.IntMapPopArea.circleGeom,
    painted: () => painted,
    K: {
      HOST: { measurePoints: [], radiusItems: [] },
      _hlPolys: objects,
      paintPolys: () => { painted = objects.map(p => p.geo); return true; },
      _verifyPolyPaint: expected => ({ ok: painted.length === expected }),
      L: en => en, R: (ok, html, extra) => ({ ok, html, ...extra }),
      note: s => s, warn: s => s, esc: s => s,
    },
  };
}
const realSetTimeout = globalThis.setTimeout;

function densify(points, edge) {
  const from = points[edge];
  const to = points[(edge + 1) % points.length];
  const mid = Array.from({ length: 255 }, (_, i) => from.map((n, axis) => n + (to[axis] - n) * (i + 1) / 256));
  return [...points.slice(0, edge + 1), ...mid, ...points.slice(edge + 1)];
}

test('atlas-population-coverage: inserting vertices along an edge preserves requests, population and coverage on different shapes', async t => {
  const h = harness(t);
  const rectangle = [[12, 41], [12.125, 41], [12.125, 41.125], [12, 41.125]];
  const triangle = [[151, -33], [151.125, -32.9375], [151.03125, -32.875]];
  const concave = [[-71, -33], [-70.75, -33], [-70.75, -32.75], [-70.8125, -32.75],
    [-70.8125, -32.9375], [-70.9375, -32.9375], [-70.9375, -32.75], [-71, -32.75]];
  const hole = close([[-70.984375, -32.921875], [-70.953125, -32.921875],
    [-70.953125, -32.875], [-70.984375, -32.875]]);
  const island = polygon(close([[-70.71875, -32.9], [-70.6875, -32.9], [-70.7, -32.85]]));
  for (const [outline, edge, geometry] of [
    [rectangle, 0, ring => polygon(ring)],
    [triangle, 0, ring => polygon(ring)],
    [concave, 2, ring => multi(polygon(ring, hole), island)],
  ]) {
    const original = geometry(close(outline));
    const dense = geometry(close(densify(outline, edge)));
    const a = await h.estimate(original, null, 2024);
    const sent = h.requests.splice(0);
    const b = await h.estimate(dense, null, 2024);
    assert.equal(b.pop, a.pop);
    near(b.areaKm2, a.areaKm2);
    sameFootprint(b.geometry, original);
    sameFootprint({ type: 'MultiPolygon', coordinates: clip.union(...h.requests.splice(0).map(parts)) }, original);
    sameFootprint({ type: 'MultiPolygon', coordinates: clip.union(...sent.map(parts)) }, original);
  }
});

test('atlas-population-coverage: explicit targets choose their own shape and missing targets never count a different shape', async t => {
  const h = harness(t);
  const points = [[22, 38], [22.125, 38], [22.06, 38.095]];
  const circles = [{ center: [23, 39], radiusKm: 8 }, { center: [23.05, 39], radiusKm: 5 }];
  h.K.HOST.measurePoints = points;
  h.K.HOST.radiusItems = circles;
  const call = args => run({ year: 2024, ...args }, {}, h.K);

  const radius = await call({ target: 'radius', place: 'not the requested target' });
  assert.equal(radius.ok, true);
  assert.equal(radius.exec.population.requestedTarget, 'radius');
  assert.equal(radius.exec.population.sumOfCircles, true);
  assert.equal(radius.objectIds.length, 2);
  assert.match(radius.html, /overlaps counted twice/);
  for (const [i, c] of circles.entries()) {
    sameFootprint(h.painted()[i], h.circleGeom(c.center, c.radiusKm));
    near(radius.exec.population.areas[i].areaKm2, area(h.painted()[i]));
  }
  near(radius.exec.population.areaKm2, h.painted().reduce((sum, geometry) => sum + area(geometry), 0));

  const drawn = await call({ target: 'drawn' });
  assert.equal(drawn.ok, true);
  assert.equal(drawn.exec.population.requestedTarget, 'drawn');
  assert.equal(drawn.objectIds.length, 1);
  sameFootprint(h.painted()[2], polygon(close(points)));
  const repeat = await call({ target: 'polygon' });
  assert.deepEqual(repeat.objectIds, drawn.objectIds);
  assert.equal(h.painted().length, 3);

  const n = h.requests.length;
  h.K.HOST.measurePoints = [];
  const noPolygon = await call({ target: 'drawn' });
  assert.equal(noPolygon.ok, false);
  assert.match(noPolygon.html, /Draw a polygon/);
  h.K.HOST.measurePoints = points;
  h.K.HOST.radiusItems = [];
  const noCircle = await call({ target: 'radius' });
  assert.equal(noCircle.ok, false);
  assert.match(noCircle.html, /Place a radius circle/);
  assert.equal(h.requests.length, n);
  assert.equal(h.painted().length, 3);
});

test('atlas-population-coverage: the partial result measures and highlights only successful WorldPop requests', async t => {
  const h = harness(t, geometry => turf.bbox(geometry)[0] >= 23.0625);
  h.K.HOST.measurePoints = [[23, 42], [23.125, 42], [23.125, 42.125], [23, 42.125]];
  const a = { target: 'drawn', year: 2024 };
  const r = await run(a, {}, h.K);
  const result = r.exec.population;
  const extent = { type: 'MultiPolygon', coordinates: clip.union(...h.successful.map(parts)) };
  assert.equal(r.ok, true);
  assert.equal(result.partial, true);
  assert.equal(r.exec.status, 'partial');
  assert.equal(result.areas[0].tilesOk, 2);
  assert.equal(result.areas[0].tiles, 4);
  assert.ok(result.areaKm2 < result.areas[0].requestedAreaKm2);
  sameFootprint(h.painted()[0], extent);
  near(result.areaKm2, area(extent));
  assert.equal(result.pop, Math.round(h.successful.reduce((n, geometry) => n + area(geometry) * 100, 0)));

  const before = h.requests.length;
  const headless = await run(a, { source: 'atlas-worker' }, h.K);
  assert.equal(headless.ok, true);
  assert.ok(h.requests.length > before, 'partial sums are not cached');
  assert.equal(headless.exec.population.areaKm2, result.areaKm2);
  assert.deepEqual(headless.objectIds, []);
  assert.equal(h.painted().length, 1);
});

test('atlas-population-coverage: an unavailable circle leaves another circle’s observed contribution available', async t => {
  const h = harness(t, geometry => turf.bbox(geometry)[0] > 25);
  h.K.HOST.radiusItems = [{ center: [23, 42], radiusKm: 5 }, { center: [27, 42], radiusKm: 9 }];
  const r = await run({ target: 'radius', year: 2024 }, {}, h.K);
  assert.equal(r.exec.status, 'partial');
  assert.equal(r.meta.code, 'partial_coverage');
  assert.deepEqual(r.exec.population.areas.map(a => a.index), [0]);
  assert.deepEqual(r.exec.population.missingAreas.map(a => a.index), [1]);
  assert.equal(r.objectIds.length, 1);
});
