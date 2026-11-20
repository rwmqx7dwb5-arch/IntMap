/* ============================================================================
 *  gis-scale-spill — (1) a chunked result's positions can leave the heap and come back, (2) the predicates' box
 *  fast path only ever agrees with the sweep line, (3) a chain over a spilled result answers what the whole-array
 *  chain answers.
 * ----------------------------------------------------------------------------
 *  ⚠ THE FAST PATH IS TESTED AGAINST THE THING IT SKIPS: `globalThis.IntMapGisNoFace` turns it off, and the same
 *  pairs are asked both ways. Pairs are built to sit on the cases a shortcut gets wrong — a shape touching an
 *  edge, a corner, a hole's rim, straddling an edge, a window a few thousandths of a degree away, near the seam
 *  and the pole, inside a concave notch — not only the easy ones. A fast path that decided one pair differently
 *  would fail here by name.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
  await geometry.ready();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops; w.IntMapGisWorker = undefined;
  return { w, data, geometry, ops };
}

let seed = 99; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const box = (x, y, w, h) => ({ type: 'Polygon', coordinates: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]] });
const disk = (cx, cy, r, m) => { const o = []; for (let i = 0; i < m; i++) { const t = i / m * 2 * Math.PI; o.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); } o.push(o[0]); return { type: 'Polygon', coordinates: [o] }; };

function areas() {
  const L = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [6, 10], [6, 4], [4, 4], [4, 10], [0, 10], [0, 0]]] }; /* a notch */
  const holed = { type: 'Polygon', coordinates: [box(0, 0, 10, 10).coordinates[0], [[3, 3], [3, 7], [7, 7], [7, 3], [3, 3]]] };
  const multi = { type: 'MultiPolygon', coordinates: [box(0, 0, 4, 4).coordinates, box(6, 6, 4, 4).coordinates] };
  return [box(0, 0, 10, 10), L, holed, multi, disk(5, 5, 3, 24), box(170, 10, 9.9999, 5), box(-20, 80, 30, 9.99999), box(100, 0, 1e-6, 1e-6)];
}

function shapes() {
  const out = [];
  for (let i = 0; i < 260; i++) {
    const x = -2 + rnd() * 14, y = -2 + rnd() * 14, k = i % 5;
    if (k === 0) out.push({ type: 'Point', coordinates: [x, y] });
    else if (k === 1) out.push(disk(x, y, 0.05 + rnd() * 0.8, 16));
    else if (k === 2) out.push({ type: 'LineString', coordinates: [[x, y], [x + rnd() * 3 - 1.5, y + rnd() * 3 - 1.5], [x + rnd() * 3, y + rnd() * 3]] });
    else if (k === 3) out.push(box(x, y, rnd() * 2, rnd() * 2));
    else out.push({ type: 'MultiPoint', coordinates: [[x, y], [x + rnd() * 6, y + rnd() * 6]] });
  }
  /* on the rim, on a vertex, a hair inside and outside an edge, on a hole's rim, the notch's mouth */
  for (const d of [0, 1e-9, -1e-9, 1e-7, -1e-7, 1e-6, -1e-6, 1e-3, -1e-3]) {
    out.push({ type: 'Point', coordinates: [d, 5] }); out.push({ type: 'Point', coordinates: [10 + d, 10 + d] }); out.push({ type: 'Point', coordinates: [3 + d, 5] });
    out.push(box(d, 1, 2, 2)); out.push(box(10 + d - 1, 4, 1, 1)); out.push(box(3 + d, 3 + d, 4, 4)); out.push(disk(5, 5, 2 + d, 12)); out.push(disk(5, 7, 1 + d, 12));
    out.push({ type: 'LineString', coordinates: [[d, 0], [d, 10]] }); out.push({ type: 'LineString', coordinates: [[4 + d, 4], [6 + d, 4]] });
  }
  /* seam, pole, windows beside each range's limit */
  out.push({ type: 'Point', coordinates: [179.9999999, 12] }, box(179, 11, 1.2, 2), box(-180, 11, 1, 1), box(170.5, 11, 8, 2), disk(175, 12, 3, 12));
  out.push({ type: 'Point', coordinates: [0, 89.99999999] }, box(-5, 89, 10, 1), box(-15, 80.5, 20, 9), { type: 'Point', coordinates: [100.0000005, 0.0000005] });
  out.push({ type: 'Polygon', coordinates: [[[-179, 11], [179, 11], [179, 12], [-179, 12], [-179, 11]]] }); /* written across the whole world */
  out.push({ type: 'Point', coordinates: [1, 2, 300] }, { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [5, 5] }] }, { type: 'Polygon', coordinates: [] });
  return out;
}

test('predicates: the box fast path answers exactly what the sweep line answers, on every pair', () => {
  return (async () => {
    const { geometry } = await boot();
    const A = areas(), S = shapes();
    const names = ['intersects', 'contains', 'within', 'disjoint'];
    let pairs = 0, tr = 0, fl = 0, refused = 0;
    for (const a of A) for (const b of S) for (const nm of names) {
      for (const [x, y] of [[a, b], [b, a]]) {
        delete globalThis.IntMapGisNoFace;
        const fast = geometry.attempt[nm](x, y);
        globalThis.IntMapGisNoFace = true;
        const slow = geometry.attempt[nm](x, y);
        delete globalThis.IntMapGisNoFace;
        assert.equal(JSON.stringify(fast), JSON.stringify(slow), nm + ' differs: ' + JSON.stringify(x) + ' | ' + JSON.stringify(y));
        pairs++; if (!fast.ok) refused++; else if (fast.value) tr++; else fl++;
      }
    }
    assert.ok(pairs > 10000, 'pairs: ' + pairs);
    assert.ok(tr > 500 && fl > 500, 'both verdicts must be well represented: ' + tr + '/' + fl);
    assert.ok(refused >= 0);
  })();
});

test('chunk store: positions spilled to a backend read back whole, in order, and the sync door says what left', async () => {
  const be = PACKED.memoryBackend();
  globalThis.IntMapGisScale = { residentBytes: 600, backend: be };
  try {
    const st = PACKED.makeChunkStore();
    const mk = (i) => ({ type: 'Feature', id: 'f' + i, properties: { n: i, s: 'x'.repeat(i) }, geometry: i % 3 === 2 ? null : (i % 3 === 0 ? { type: 'Polygon', coordinates: [[[0, i], [4, i], [4, i + 4], [0, i + 4], [0, i]], [[1, i + 1], [2, i + 1], [2, i + 2], [1, i + 1]]] } : { type: 'Point', coordinates: [i, -0] }) });
    const all = [];
    for (let c = 0; c < 6; c++) { const rows = []; for (let j = 0; j < 7; j++) rows.push(mk(c * 7 + j)); all.push(rows); st.addFeatures(rows); await st.settle(); }
    assert.ok(st.spilledCount >= 3, 'nothing was spilled: ' + st.spilledCount);
    assert.ok(st.residentBytes <= 600 + 2000, 'resident ' + st.residentBytes);
    assert.equal(be.size(), st.spilledCount);
    assert.throws(() => st.chunk(0), (e) => e.why === 'chunk-spilled');
    for (let c = 0; c < 6; c++) assert.equal(JSON.stringify(await st.chunkAsync(c)), JSON.stringify(all[c]), 'chunk ' + c);
    const stubs = st.stubs();
    assert.equal(stubs.length, 42);
    assert.equal(stubs[0].geometry.type, 'Polygon'); assert.equal(stubs[2].geometry, null);
    await st.dispose();
    assert.equal(be.size(), 0, 'the backend kept chunks after dispose');
  } finally { delete globalThis.IntMapGisScale; }
});

test('chunk store: a backend that refuses a write leaves the result in memory and says so', async () => {
  const bad = { name: 'bad', put: async () => { throw new Error('quota'); }, get: async () => null, del: async () => { } };
  globalThis.IntMapGisScale = { residentBytes: 10, backend: bad };
  try {
    const st = PACKED.makeChunkStore();
    for (let c = 0; c < 3; c++) { st.addFeatures([{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [c, c] } }]); await st.settle(); }
    assert.equal(st.spilledCount, 0);
    assert.match(String(st.spillError), /quota/);
    assert.equal(st.chunk(0)[0].geometry.coordinates[0], 0);
  } finally { delete globalThis.IntMapGisScale; }
});

test('a lost or corrupt spilled chunk is a named refusal, not a wrong answer', async () => {
  const be = PACKED.memoryBackend();
  globalThis.IntMapGisScale = { residentBytes: 1, backend: be };
  try {
    const st = PACKED.makeChunkStore();
    for (let c = 0; c < 3; c++) { st.addFeatures([{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[c, 0], [c, 1], [c, 2]] } }]); await st.settle(); }
    assert.ok(st.spilledCount >= 2);
    const [k0, k1] = be.keys();
    await be.del(k0);
    await assert.rejects(() => st.chunkAsync(0), (e) => e.why === 'chunk-lost');
    await be.put(k1, new ArrayBuffer(16));
    await assert.rejects(() => st.chunkAsync(1), (e) => e.why === 'chunk-corrupt');
  } finally { delete globalThis.IntMapGisScale; }
});

function corpus(n) {
  const feats = [];
  for (let i = 0; i < n; i++) feats.push({ type: 'Feature', properties: { id: i, v: Math.round(rnd() * 100) }, geometry: { type: 'Point', coordinates: [120 + rnd() * 30, 20 + rnd() * 25] } });
  return feats;
}
const zones = () => { const out = []; for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { const x = 120 + i * 5, y = 20 + j * 25 / 6; out.push({ type: 'Feature', properties: { zone: 'z' + i + j }, geometry: box(x, y, 5, 25 / 6) }); } return out; };

test('buffer → spatialJoin → export over a result that is spilled: the whole-array chain, row for row', async () => {
  const { w, data, ops } = await boot();
  const { makeGisExport } = await import('../js/gis-export.js');
  const X = makeGisExport(); w.IntMapGisExport = X;
  const pts = data.add({ kind: 'vector', title: 'pts', features: corpus(1500) });
  const zs = data.add({ kind: 'vector', title: 'zones', features: zones() });
  const join = (id) => ({ op: 'spatialJoin', inputs: [id, zs.id], params: { predicate: 'within', cardinality: 'first' } });
  const buf = await ops.run({ op: 'buffer', inputs: [pts.id], params: { radiusKm: 30 } });
  const wantJoin = await ops.run(join(buf.dataset.id));
  assert.equal(buf.ok && wantJoin.ok, true);
  const wantJson = JSON.stringify(wantJoin.dataset.features());

  const be = PACKED.memoryBackend();
  globalThis.IntMapGisScale = { chunkAbovePositions: 0, residentBytes: 40000, backend: be, mapGroupPositions: 20000 };
  try {
    const cb = await ops.run({ op: 'buffer', inputs: [pts.id], params: { radiusKm: 30 }, id: 'buf-spilled' });
    assert.equal(cb.ok, true, JSON.stringify(cb.why));
    assert.ok(cb.dataset.spilled() >= 1, 'the buffer result was not spilled');
    const cj = await ops.run(Object.assign(join(cb.dataset.id), { id: 'join-spilled' }));
    assert.equal(cj.ok, true, JSON.stringify(cj.why));
    assert.ok(cj.stats.groups > 1);
    const rows = []; const it = cj.dataset.chunksAsync();
    for (let n = await it.next(); !n.done; n = await it.next()) for (const f of n.value) rows.push(f);
    assert.equal(JSON.stringify(rows), wantJson);
    assert.equal(cj.dataset.count, wantJoin.dataset.count);
    const a = X.write(wantJoin.dataset.id, { format: 'geojson', pretty: false });
    const b = await X.writeAsync(cj.dataset.id, { format: 'geojson', pretty: false });
    assert.equal(b.ok, true, JSON.stringify(b));
    assert.equal(JSON.stringify(JSON.parse(await b.bytes.text()).features), JSON.stringify(JSON.parse(a.text).features));
    const held = be.size();
    assert.ok(held >= 1);
    data.remove(cb.dataset.id);
    assert.ok(be.size() < held, 'removing the record must let its spilled chunks go');
  } finally { delete globalThis.IntMapGisScale; }
});
