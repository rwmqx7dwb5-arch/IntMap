/* ============================================================================
 *  gis-scale — a result too big for the heap is held as chunks and answers what the in-memory path answers
 * ----------------------------------------------------------------------------
 *  ⚠ THE THRESHOLD IS LOWERED, THE ARITHMETIC IS NOT: `globalThis.IntMapGisScale` (js/gis-packed.js `limits()`)
 *  states a smaller world so 1,700 features cross it, and every comparison is against the SAME ops run with the
 *  default threshold (the legacy whole-array path). A chunked answer that differed by one byte, one dropped
 *  feature or one reordered row would fail JSON equality.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installNodeWorker } from './helpers/gis-buffer-worker-node.mjs';
import * as PACKED from '../js/gis-packed.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

async function boot() {
  const w = {};
  globalThis.window = w;
  delete globalThis.IntMapGisScale;
  new Function('window', read('js/geodesy.js'))(w);
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const { makeGisWorker } = await import('../js/gis-worker.js');
  const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps(), worker = makeGisWorker();
  await geometry.ready();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
  return { w, data, geometry, ops, worker };
}

function corpus(n) {
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const feats = [];
  for (let i = 0; i < n; i++) feats.push({ type: 'Feature', properties: { id: i, v: Math.round(rnd() * 100) }, geometry: { type: 'Point', coordinates: [120 + rnd() * 30, 20 + rnd() * 25] } });
  const ring = (cx, cy, rad, m) => { const o = []; for (let i = 0; i < m; i++) { const t = i / m * 2 * Math.PI; o.push([cx + rad * Math.cos(t) * (1 + 0.2 * Math.sin(5 * t)), cy + rad * Math.sin(t) * (1 + 0.2 * Math.sin(5 * t))]); } o.push(o[0]); return o; };
  for (let i = 0; i < 4; i++) {
    feats.push({ type: 'Feature', properties: { id: 'poly' + i, v: 1 }, geometry: { type: 'Polygon', coordinates: [ring(125 + i, 30, 0.6, 40), ring(125 + i, 30, 0.2, 12).reverse()] } });
    feats.push({ type: 'Feature', properties: { id: 'line' + i, v: 2 }, geometry: { type: 'LineString', coordinates: ring(140, 30 + i * 0.3, 0.4, 30).slice(0, 25) } });
  }
  feats.push({ type: 'Feature', properties: { id: 'seam', v: 3 }, geometry: { type: 'Point', coordinates: [179.95, 10] } });
  feats.push({ type: 'Feature', properties: { id: 'pole', v: 4 }, geometry: { type: 'Point', coordinates: [30, 89.95] } });
  feats.push({ type: 'Feature', properties: { id: 'multi', v: 5 }, geometry: { type: 'MultiPoint', coordinates: [[100, 10], [100.02, 10.01], [101, 11]] } });
  feats.push({ type: 'Feature', properties: { id: 'none', v: 6 }, geometry: null });
  return feats;
}
const zones = () => {
  const out = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = 120 + i * 7.5, y = 20 + j * 6.25;
    out.push({ type: 'Feature', properties: { zone: 'z' + i + j }, geometry: { type: 'Polygon', coordinates: [[[x, y], [x + 7.5, y], [x + 7.5, y + 6.25], [x, y + 6.25], [x, y]]] } });
  }
  return out;
};

test('packed codec: unpack(pack(g)) is g, number for number, for every shape it lays flat and the ones it leaves alone', () => {
  const gs = [
    null,
    { type: 'Point', coordinates: [1.5, -0] },
    { type: 'MultiPoint', coordinates: [[1, 2], [3, 4]] },
    { type: 'LineString', coordinates: [[0, 0], [1, 1], [2, 0.1]] },
    { type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]], [[5, 5], [6, 6], [7, 7]]] },
    { type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 4], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 1]]] },
    { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], [[[5, 5], [6, 5], [6, 6], [5, 5]], [[5.2, 5.2], [5.5, 5.2], [5.5, 5.5], [5.2, 5.2]]]] },
    { type: 'Point', coordinates: [1, 2, 300] },
    { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [1, 2] }] },
    { type: 'Polygon', coordinates: [] },
  ];
  const back = PACKED.unpackAll(PACKED.pack(gs));
  assert.equal(JSON.stringify(back), JSON.stringify(gs));
  assert.ok(Object.is(back[1].coordinates[1], -0), '-0 must survive');
  const p = PACKED.pack(gs);
  assert.equal(PACKED.typeOf(p, 6), 'MultiPolygon');
  assert.equal(PACKED.typeOf(p, 8), 'GeometryCollection');
  assert.equal(PACKED.typeOf(p, 0), null);
});

test('chunk store: chunks read back in the order they were added, shells keep their other members', () => {
  const st = PACKED.makeChunkStore();
  st.addFeatures([{ type: 'Feature', id: 'a', properties: { n: 1 }, geometry: { type: 'Point', coordinates: [1, 2] } }, { type: 'Feature', properties: {}, geometry: null }]);
  st.addFeatures([{ type: 'Feature', properties: { n: 3 }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }]);
  assert.equal(st.count, 3); assert.equal(st.chunkCount, 2);
  assert.deepEqual(st.chunk(0)[0], { type: 'Feature', id: 'a', properties: { n: 1 }, geometry: { type: 'Point', coordinates: [1, 2] } });
  assert.equal(st.chunk(1)[0].properties.n, 3);
});

async function referenceAndChunked(mount, radius) {
  const { w, data, ops, worker } = await boot();
  const ds = data.add({ kind: 'vector', title: 'c', features: corpus(1700) });
  const step = { op: 'buffer', inputs: [ds.id], params: { radiusKm: radius || 5 } };
  const want = await ops.run(step);
  assert.equal(want.ok, true);
  assert.ok(!want.dataset.chunks, 'the default threshold must keep the legacy path for this size');
  globalThis.IntMapGisScale = { chunkAbovePositions: 0 };
  if (mount) { mount.install(); w.IntMapGisWorker = mount.wrap(worker); } else w.IntMapGisWorker = undefined;
  const got = await ops.run(Object.assign({}, step, { id: 'chunked-out' }));
  delete globalThis.IntMapGisScale;
  return { w, data, ops, ds, want, got };
}

test('buffer, chunked, computed on this thread: the same rows as the whole-array path', async () => {
  const { want, got } = await referenceAndChunked(null);
  assert.equal(got.ok, true, JSON.stringify(got.why));
  assert.equal(typeof got.dataset.chunks, 'function', 'the result was not held as chunks');
  assert.ok(got.dataset.chunkedCount >= 2, 'one chunk is not a chunking');
  assert.match(got.stats.worker, /^not-used: /);
  assert.equal(JSON.stringify(got.dataset.features()), JSON.stringify(want.dataset.features()));
  assert.equal(got.dataset.count, want.dataset.count);
  assert.equal(got.dataset.geometryType, want.dataset.geometryType);
  assert.equal(JSON.stringify(got.dataset.fields), JSON.stringify(want.dataset.fields));
  assert.equal(got.dataset.withGeometry, want.dataset.withGeometry);
});

test('buffer, chunked, carried by real threads: the same rows as the whole-array path', async () => {
  const state = { spawned: 0 };
  const { want, got } = await referenceAndChunked({
    install: () => { Object.assign(state, installNodeWorker()); },
    wrap: (worker) => Object.assign({}, worker, { planBlocks: (spec) => worker.planBlocks(Object.assign({}, spec, { budgetBytes: 144 * 4000 })) }),
  });
  assert.equal(got.ok, true, JSON.stringify(got.why));
  assert.match(got.stats.worker, /^used: \d+ of \d+ features$/);
  assert.equal(JSON.stringify(got.dataset.features()), JSON.stringify(want.dataset.features()));
  const seen = []; for (const c of got.dataset.chunks()) seen.push(c.length);
  assert.equal(seen.reduce((a, b) => a + b, 0), want.dataset.count);
  assert.ok(seen.length >= 2);
});

test('a chunked record that is too large to build is refused by name, and its chunks still read', async () => {
  const { got } = await referenceAndChunked(null);
  globalThis.IntMapGisScale = { materializeMaxPositions: 10 };
  try {
    assert.throws(() => got.dataset.features(), (e) => e.why === 'too-large-to-materialize' && e.detail.rows === got.dataset.count);
    let n = 0; for (const c of got.dataset.chunks()) n += c.length;
    assert.equal(n, got.dataset.count);
  } finally { delete globalThis.IntMapGisScale; }
});

test('an op that is not chunk-mapped is refused by name above the ceiling, and runs below it', async () => {
  const { w, ops, got, data } = await referenceAndChunked(null);
  globalThis.IntMapGisScale = { materializeMaxPositions: 10 };
  try {
    const r = await ops.run({ op: 'dissolve', inputs: [got.dataset.id], params: {} });
    assert.equal(r.ok, false);
    assert.equal(r.why, 'input-too-large-for-op');
  } finally { delete globalThis.IntMapGisScale; }
  const small = await ops.run({ op: 'centroid', inputs: [got.dataset.id], params: {} });
  assert.equal(small.ok, true, JSON.stringify(small.why));
  assert.equal(small.dataset.count, got.dataset.count);
});

test('filter and spatialJoin over a chunked input are the whole-array answers, row for row', async () => {
  const { w, data, ops } = await boot();
  const pts = data.add({ kind: 'vector', title: 'pts', features: corpus(1700) });
  const zs = data.add({ kind: 'vector', title: 'zones', features: zones() });
  /* ⚠ makeGisWorker() publishes itself on window, and how many blocks a mounted pool cuts 1,700 features into depends on the machine's core count (CI: 1; a 16-core laptop: 3). The seam under test needs several chunks, so the pool is taken away and the blocks are the fixed inline size. */
  w.IntMapGisWorker = undefined;
  const buf = { op: 'buffer', inputs: [pts.id], params: { radiusKm: 5 } };
  const whole = await ops.run(buf);
  globalThis.IntMapGisScale = { chunkAbovePositions: 0 };
  const chunked = await ops.run(Object.assign({}, buf, { id: 'buf-chunked' }));
  assert.equal(typeof chunked.dataset.chunks, 'function');
  /* ⚠ groups of ~300 rows, so the op runs over several groups and the seams between them are the subject */
  globalThis.IntMapGisScale = { mapGroupPositions: 20000 };

  const cases = [
    (id) => ({ op: 'filter', inputs: [id], params: { where: [{ field: 'v', op: '>=', value: 50 }] } }),
    (id) => ({ op: 'spatialJoin', inputs: [id, zs.id], params: { predicate: 'intersects', cardinality: 'first' } }),
    (id) => ({ op: 'spatialJoin', inputs: [id, zs.id], params: { predicate: 'intersects', cardinality: 'all' } }),
  ];
  for (const mk of cases) {
    const a = await ops.run(mk(whole.dataset.id));
    const b = await ops.run(mk(chunked.dataset.id));
    assert.equal(a.ok, true, JSON.stringify(a.why)); assert.equal(b.ok, true, JSON.stringify(b.why));
    assert.equal(typeof b.dataset.chunks, 'function', 'the output of a chunked input is chunked');
    assert.ok(b.stats.groups > 1, 'one group is not a seam');
    assert.equal(JSON.stringify(b.dataset.features()), JSON.stringify(a.dataset.features()), mk('x').op + ' differs');
    for (const k of Object.keys(a.stats || {})) if (typeof a.stats[k] === 'number' && ['matched', 'unmatched', 'pairs', 'oneToMany', 'maxPartners'].includes(k)) assert.equal(b.stats[k], a.stats[k], k);
  }
});

test('cancel reaches the chunked pass and registers nothing', async () => {
  const { w, data, ops } = await boot();
  const ds = data.add({ kind: 'vector', title: 'c', features: corpus(1700) });
  globalThis.IntMapGisScale = { chunkAbovePositions: 0 };
  try {
    const ac = new AbortController();
    const before = data.ids().length;
    const got = await ops.run({ op: 'buffer', inputs: [ds.id], params: { radiusKm: 5 } }, { signal: ac.signal, onProgress: () => ac.abort() });
    assert.equal(got.ok, false);
    assert.equal(got.why, 'cancelled');
    assert.equal(data.ids().length, before);
  } finally { delete globalThis.IntMapGisScale; }
});

test('GeoJSON export of a chunked record is the whole-array export, built as a Blob', async () => {
  const { w, data, ops } = await boot();
  const { makeGisExport } = await import('../js/gis-export.js');
  const X = makeGisExport(); w.IntMapGisExport = X;
  const pts = data.add({ kind: 'vector', title: 'pts', features: corpus(1700) });
  const whole = await ops.run({ op: 'buffer', inputs: [pts.id], params: { radiusKm: 5 } });
  globalThis.IntMapGisScale = { chunkAbovePositions: 0 };
  const chunked = await ops.run({ op: 'buffer', inputs: [pts.id], params: { radiusKm: 5 }, id: 'chunked' });
  delete globalThis.IntMapGisScale;
  for (const pretty of [true, false]) {
    const a = X.write(whole.dataset.id, { format: 'geojson', pretty });
    const b = await X.writeAsync(chunked.dataset.id, { format: 'geojson', pretty });
    assert.equal(a.ok, true); assert.equal(b.ok, true, JSON.stringify(b));
    assert.ok(b.bytes instanceof Blob, 'the document must be a Blob, not one string');
    const ja = JSON.parse(a.text), jb = JSON.parse(await b.bytes.text());
    assert.equal(JSON.stringify(jb.features), JSON.stringify(ja.features));
    for (const j of [ja, jb]) { delete j.features; delete j.intmap.export; delete j.intmap.dataset.id; delete j.intmap.dataset.title; delete j.intmap.dataset.createdAt; delete j.intmap.provenance; delete j.provenance; }
    assert.equal(JSON.stringify(jb), JSON.stringify(ja));
    assert.equal(b.stated.features, a.stated.features);
    assert.equal(b.stated.rowsWithoutGeometry, a.stated.rowsWithoutGeometry);
  }
  /* a record that is not chunked goes through the same door unchanged */
  const plain = await X.writeAsync(whole.dataset.id, { format: 'geojson' });
  assert.equal(plain.ok, true); assert.equal(typeof plain.text, 'string');
});
