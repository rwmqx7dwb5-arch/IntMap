/* js/geo-ml-run.js — 登録簿（fake）に結んだ 4 つの op。撮影日を述べないデータセットは系列にも Chronos の選択にも入らない。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeoMl } from '../js/geo-ml-run.js';
import { FEATURES } from '../js/geo-similar.js';

const rngOf = (seed) => { let a = seed; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; };
const nrm = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
function fakeD() {
  const m = new Map(); let n = 0;
  return {
    get: (id) => m.get(id) || null,
    add(spec) {
      const id = spec.id || 'ds-' + (++n);
      const rec = spec.kind === 'raster' ? { ...spec, id, raster: () => rec } : { ...spec, id, kind: 'vector', geometryType: (spec.features[0] && spec.features[0].geometry.type) || null, features: () => spec.features };
      m.set(id, rec); return rec;
    },
  };
}
const grid = { west: 0, north: 4, pixelLng: 1, pixelLat: 1 };
const raster = (D, id, data, prov) => D.add({ id, kind: 'raster', title: id, width: 4, height: 4, grid, bands: [{ name: 'v', nodata: null }], read: () => data, provenance: prov || { kind: 'x' } });

test('trend: only datasets that state an acquisition date enter, and the answer lists the rest', async () => {
  const D = fakeD(), r = rngOf(1);
  const years = [2016, 2017, 2018, 2019, 2020, 2021];
  years.forEach((y) => raster(D, 'r' + y, Float32Array.from({ length: 16 }, (_, i) => (i < 8 ? (y >= 2019 ? 1 : 0) : 0.05 * (y - 2016)) + 0.01 * nrm(r)), { kind: 'cog', evidence: { images: [{ date: y + '-07-01' }] } }));
  raster(D, 'mystery', new Float32Array(16));
  const a = await runGeoMl({ op: 'trend', observations: years.map((y) => ({ dataset: 'r' + y })).concat([{ dataset: 'mystery' }, { dataset: 'ghost' }]) }, { D });
  assert.ok(a.ok, JSON.stringify(a).slice(0, 300));
  assert.equal(a.nObservations, 6);
  assert.ok(a.rejected.some((x) => x.id === 'mystery' && x.reason === 'no-date'));
  assert.ok(a.rejected.some((x) => x.id === 'ghost' && x.reason === 'no-such-dataset'));
  const out = D.get(a.dataset); assert.equal(out.kind, 'raster'); assert.equal(out.bands.length, 7);
  assert.equal(out.read(5)[0], a.patternCodes.abrupt); assert.equal(out.read(5)[15], a.patternCodes.gradual);
  assert.equal(out.provenance.evidence.basis, 'image-derived');
});

test('trend with asOf selects only among dated observations and refuses a far one', async () => {
  const D = fakeD();
  raster(D, 'dated', new Float32Array(16), { evidence: { images: [{ date: '2020-06-01' }] } });
  raster(D, 'undated', new Float32Array(16));
  const o = [{ dataset: 'dated' }, { dataset: 'undated', date: '2020-06-10', dateBasis: 'file-name' }];
  assert.equal((await runGeoMl({ op: 'trend', asOf: '2020-06-12', observations: o }, { D })).selected.dataset, 'dated');
  const no = await runGeoMl({ op: 'trend', asOf: '2022-06-12', observations: o }, { D });
  assert.equal(no.ok, false); assert.equal(no.selected, null);
});

test('trend refuses too few dated observations and drops a grid that differs', async () => {
  const D = fakeD();
  ['2018', '2019', '2020', '2021', '2022'].forEach((y) => raster(D, 'g' + y, new Float32Array(16), { evidence: { images: [{ date: y + '-05-01' }] } }));
  D.add({ id: 'odd', kind: 'raster', title: 'odd', width: 2, height: 2, grid: { west: 0, north: 2, pixelLng: 2, pixelLat: 2 }, bands: [{ name: 'v' }], read: () => new Float32Array(4), provenance: { evidence: { images: [{ date: '2023-05-01' }] } } });
  const a = await runGeoMl({ op: 'trend', observations: ['g2018', 'g2019', 'g2020', 'g2021', 'g2022', 'odd'].map((d) => ({ dataset: d })) }, { D });
  assert.ok(a.ok); assert.ok(a.rejected.some((x) => x.id === 'odd' && /grid-differs/.test(x.reason)));
  assert.equal((await runGeoMl({ op: 'trend', observations: [{ dataset: 'g2018' }, { dataset: 'g2019' }] }, { D })).code, 'TOO_FEW_DATED_OBSERVATIONS');
});

test('classify: measured regions get a class and a recorded dataset; examples add a leave-one-out accuracy', async () => {
  const D = fakeD();
  const counts = (o) => FEATURES.map((f) => o[f.id] || 0);
  const world = (lat) => (lat < 10 ? counts({ port: 30, port_land: 4, cranes: 10, industrial: 50 }) : lat < 20 ? counts({ residential: 800, roads_local: 150 }) : counts({}));
  const env = { D, counts: async (bb) => world((bb[1] + bb[3]) / 2), farmland: async (bb) => ((bb[1] + bb[3]) / 2 > 20 ? 300 : 0) };
  const a = await runGeoMl({ op: 'classify', regions: [{ name: 'p', lat: 5, lng: 0 }, { name: 'h', lat: 15, lng: 0 }, { name: 'f', lat: 25, lng: 0 }] }, env);
  assert.ok(a.ok, JSON.stringify(a).slice(0, 200));
  assert.deepEqual(a.results.map((x) => x.class), ['port', 'residential', 'agricultural']);
  assert.equal(D.get(a.dataset).features().length, 3);
  const ex = [];
  for (let i = 0; i < 4; i++) { ex.push({ lat: 5 + i * 0.01, lng: 0, label: 'harbour' }, { lat: 15 + i * 0.01, lng: 0, label: 'housing' }); }
  const b = await runGeoMl({ op: 'classify', regions: [{ lat: 5, lng: 1 }], examples: ex }, env);
  assert.equal(b.supervised.ok, true); assert.ok(b.supervised.looAccuracy >= 0.99); assert.equal(b.results[0].supervised.class, 'harbour');
  assert.equal((await runGeoMl({ op: 'classify', regions: [{ lat: 25, lng: 0 }], examples: ex.slice(0, 2) }, env)).supervised.code, 'TOO_FEW_LABELLED');
});

test('classify: a region with nothing mapped is unclassified, not rural', async () => {
  const D = fakeD(), env = { D, counts: async () => FEATURES.map(() => 0) };
  const a = await runGeoMl({ op: 'classify', regions: [{ lat: 1, lng: 1 }] }, env);
  assert.equal(a.results[0].class, 'unclassified'); assert.equal(a.results[0].why, 'mapped-nothing');
});

test('interpret passes the change window through and never calls it a cause', async () => {
  const r = await runGeoMl({ op: 'interpret', change: { bbox: [0, 0, 1, 1], from: '2019-06-01', to: '2020-06-01' }, facilities: [{ name: 'x', lat: 0.5, lng: 0.5, openedAt: '2019-09-01' }] }, {});
  assert.ok(r.ok); assert.equal(r.evidence[0].usable, true); assert.ok(r.caveats.includes('coincidence-in-place-and-time-is-not-cause'));
});

test('model: target + raster features -> validated, interval-bearing predictions registered as a dataset', async () => {
  const D = fakeD(), r = rngOf(6);
  const W = 40, H = 40, data = new Float32Array(W * H); for (let i = 0; i < data.length; i++) data[i] = nrm(r);
  D.add({ id: 'cov', kind: 'raster', title: 'cov', width: W, height: H, grid: { west: 0, north: 40, pixelLng: 1, pixelLat: 1 }, bands: [{ name: 'v', nodata: null }], read: () => data, provenance: {} });
  const feats = [];
  for (let i = 0; i < 160; i++) { const lng = 0.5 + r() * 38, lat = 0.5 + r() * 38, px = data[(39 - Math.floor(lat)) * W + Math.floor(lng)]; feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { y: 3 * px + 0.3 * nrm(r), year: 2015 + (i % 8) } }); }
  D.add({ id: 'obs', title: 'obs', features: feats });
  const a = await runGeoMl({ op: 'model', target: { dataset: 'obs', field: 'y', timeField: 'year' }, features: [{ dataset: 'cov', name: 'cov' }] }, { D });
  assert.ok(a.ok, JSON.stringify(a).slice(0, 300));
  assert.equal(a.warnings.filter((w) => /does-not-beat/.test(w)).length, 0);
  assert.ok(a.validation.temporal.ok);
  assert.ok(a.interval.halfWidth > 0 && a.interval.empiricalCoverage > 0.75);
  const out = D.get(a.dataset); assert.equal(out.features().length, a.predicted);
  assert.ok(out.features().every((f) => f.properties.lower < f.properties.prediction && f.properties.prediction < f.properties.upper));
  assert.equal(out.provenance.op, 'model');
  assert.equal((await runGeoMl({ op: 'model', target: { dataset: 'nope', field: 'y' } }, { D })).code, 'NEEDS_INPUT');
});
