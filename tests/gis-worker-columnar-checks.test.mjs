/* ============================================================================
 *  gis-worker-columnar — a spatial join's pairs may run on another thread, and the answer is the same one
 * ----------------------------------------------------------------------------
 *  ⚠ THE CARRIED RUN IS HELD AGAINST THE RUN THAT NEVER LEAVES THIS THREAD, row for row, for every predicate and
 *  cardinality — not against a number written in this file. `globalThis.IntMapGisScale.joinCarryFloorMs` states a
 *  smaller world (the product waits for a join projected to take a second); the arithmetic is the product's own,
 *  on real node:worker_threads running src/gis-buffer-worker.js.
 *  ⚠ A WORKER THAT ANSWERS WRONG IS PART OF THE TEST: a thread that returns the wrong number of rows must not make a
 *  table that looks finished — the block is asked again here, by the same kernel, and the answer is still the same.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installNodeWorker } from './helpers/gis-buffer-worker-node.mjs';

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
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops; w.IntMapGisWorker = undefined;
  return { w, data, geometry, ops, worker };
}

let seed = 4242; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const ring = (cx, cy, rad, m) => { const o = []; for (let i = 0; i < m; i++) { const t = i / m * 2 * Math.PI; o.push([cx + rad * Math.cos(t), cy + rad * Math.sin(t)]); } o.push(o[0]); return o; };
function lefts(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = 120 + rnd() * 30, y = 20 + rnd() * 25, k = i % 6;
    let geometry;
    if (k === 0 || k === 1 || k === 2) geometry = { type: 'Point', coordinates: [x, y] };
    else if (k === 3) geometry = { type: 'Polygon', coordinates: [ring(x, y, 0.2 + rnd() * 1.5, 14)] };
    else if (k === 4) geometry = { type: 'LineString', coordinates: [[x, y], [x + rnd() * 3, y + rnd() * 3], [x + rnd() * 5, y]] };
    else geometry = (i % 12 === 5) ? null : { type: 'MultiPoint', coordinates: [[x, y], [x + 2, y + 1]] };
    out.push({ type: 'Feature', properties: { id: i }, geometry });
  }
  /* on the edge, on a corner, across the seam of the zones */
  out.push({ type: 'Feature', properties: { id: 'edge' }, geometry: { type: 'Point', coordinates: [127.5, 26] } });
  out.push({ type: 'Feature', properties: { id: 'corner' }, geometry: { type: 'Point', coordinates: [135, 32.25] } });
  return out;
}
function zones() {
  const out = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = 120 + i * 7.5, y = 20 + j * 6.25;
    out.push({ type: 'Feature', properties: { zone: 'z' + i + j, pop: i * 10 + j }, geometry: { type: 'Polygon', coordinates: [[[x, y], [x + 7.5, y], [x + 7.5, y + 6.25], [x, y + 6.25], [x, y]]] } });
  }
  out.push({ type: 'Feature', properties: { zone: 'nogeom', pop: -1 }, geometry: null });
  return out;
}
const cases = [
  { predicate: 'within', cardinality: 'first' },
  { predicate: 'within', cardinality: 'all', unmatched: 'drop' },
  { predicate: 'intersects', cardinality: 'all' },
  { predicate: 'contains', cardinality: 'first' },
  { predicate: 'nearer-than', maxKm: 200, cardinality: 'all' },
];

async function run(mount, params, n) {
  seed = 4242;   /* the same world for every run, so two runs are comparable */
  const { w, data, ops, worker } = await boot();
  const L = data.add({ kind: 'vector', title: 'L', features: lefts(n) }), Z = data.add({ kind: 'vector', title: 'Z', features: zones() });
  let state = null;
  if (mount) { state = mount.install(); w.IntMapGisWorker = mount.wrap ? mount.wrap(worker) : worker; }
  globalThis.IntMapGisScale = { joinCarryFloorMs: mount ? 0 : 1e12 };
  try {
    const r = await ops.run({ op: 'spatialJoin', inputs: [L.id, Z.id], params });
    return { r, state };
  } finally { delete globalThis.IntMapGisScale; }
}
const rowsOf = (r) => JSON.stringify(r.dataset.features());
const small = (worker) => Object.assign({}, worker, { planBlocks: (spec) => worker.planBlocks(Object.assign({}, spec, { budgetBytes: 144 * 600 })) });

for (const params of cases) {
  test('spatialJoin carried by real threads is the in-thread answer, row for row: ' + JSON.stringify(params), async () => {
    const want = await run(null, params, 900);
    assert.equal(want.r.ok, true, JSON.stringify(want.r.why));
    assert.match(want.r.stats.worker, /^not-used: /);
    const got = await run({ install: () => installNodeWorker(), wrap: small }, params, 900);
    assert.equal(got.r.ok, true, JSON.stringify(got.r.why));
    assert.match(got.r.stats.worker, /^carried: \d+ blocks on \d+ lanes$/, got.r.stats.worker);
    assert.ok(got.r.stats.carriedRows > 100, 'almost nothing was carried: ' + got.r.stats.carriedRows);
    assert.ok(got.state.spawned >= 1, 'no thread started');
    assert.equal(rowsOf(got.r), rowsOf(want.r));
    for (const k of ['matched', 'unmatched', 'pairs', 'oneToMany', 'maxPartners']) assert.equal(got.r.stats[k], want.r.stats[k], k);
  });
}

test('a worker that answers the wrong shape is not believed: the block is asked again here, by the same kernel', async () => {
  const params = { predicate: 'within', cardinality: 'first' };
  const want = await run(null, params, 700);
  const liar = () => {
    globalThis.Worker = class { constructor() { } postMessage(m) { setTimeout(() => this.onmessage && this.onmessage({ data: { id: m.id, ok: true, relate: { hits: [], dist: null, failed: 0, why: null, detail: null } } }), 0); } terminate() { } };
    return {};
  };
  const got = await run({ install: liar, wrap: small }, params, 700);
  assert.equal(got.r.ok, true, JSON.stringify(got.r.why));
  assert.match(got.r.stats.worker, /computed here/, got.r.stats.worker);
  assert.equal(rowsOf(got.r), rowsOf(want.r));
});

test('a thread that cannot start is a stated reason, and the table is the same', async () => {
  const params = { predicate: 'intersects', cardinality: 'all' };
  const want = await run(null, params, 700);
  const none = () => { delete globalThis.Worker; return {}; };
  const got = await run({ install: none }, params, 700);
  assert.equal(got.r.ok, true);
  assert.match(got.r.stats.worker, /^(not-used: |carried: )/);
  assert.equal(rowsOf(got.r), rowsOf(want.r));
});

test('a reader\'s cancel reaches the carried join and registers nothing', async () => {
  const { w, data, ops, worker } = await boot();
  const L = data.add({ kind: 'vector', title: 'L', features: lefts(6000) }), Z = data.add({ kind: 'vector', title: 'Z', features: zones() });
  installNodeWorker(); w.IntMapGisWorker = small(worker);
  globalThis.IntMapGisScale = { joinCarryFloorMs: 0 };
  try {
    const ac = new AbortController();
    const before = data.ids().length;
    const got = await ops.run({ op: 'spatialJoin', inputs: [L.id, Z.id], params: { predicate: 'within', cardinality: 'first' } }, { signal: ac.signal, onProgress: () => ac.abort() });
    assert.equal(got.ok, false);
    assert.equal(got.why, 'cancelled');
    assert.equal(data.ids().length, before);
  } finally { delete globalThis.IntMapGisScale; }
});

test('the pair predicate is one function: relateBlock answers what the per-pair doors answer', async () => {
  const { geometry } = await boot();
  const Z = zones().filter((z) => z.geometry).map((z) => z.geometry);
  const Ls = lefts(300).map((f) => f.geometry);
  const cands = Ls.map(() => Z.map((_, i) => i));
  for (const p of ['intersects', 'within', 'contains']) {
    const got = geometry.relateBlock(Z, Ls, cands, p, null);
    assert.equal(got.failed, 0);
    for (let i = 0; i < Ls.length; i++) {
      const want = [];
      if (Ls[i]) for (let k = 0; k < Z.length; k++) { const r = geometry.attempt[p](Ls[i], Z[k]); if (r.ok && r.value) want.push(k); }
      assert.deepEqual(got.hits[i], want, p + ' row ' + i);
    }
  }
});

/* ══ the rows, held by column ═══════════════════════════════════════════════════════════════════ */
import * as PACKED from '../js/gis-packed.js';

test('shells by column: expand(compact(x)) is x — keys in order, -0 / NaN / Infinity / null / mixed cells kept', () => {
  const shells = [
    { type: 'Feature', properties: { id: 0, name: 'a', v: -0, flag: true, none: null }, geometry: null },
    { type: 'Feature', properties: { id: 1, name: 'b', v: NaN, flag: false, none: null }, geometry: null },
    { type: 'Feature', properties: { id: 2, name: 3, v: Infinity, flag: true, none: null }, geometry: null },
  ];
  const cm = PACKED.compactShells(shells);
  assert.ok(cm, 'uniform primitive rows must compact');
  const back = PACKED.expandShells(cm);
  assert.equal(back.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(Object.keys(back[i]), Object.keys(shells[i]));
    assert.deepEqual(Object.keys(back[i].properties), Object.keys(shells[i].properties));
    for (const k of Object.keys(shells[i].properties)) assert.ok(Object.is(back[i].properties[k], shells[i].properties[k]), k + ' row ' + i);
    assert.equal(back[i].geometry, null);
  }
  assert.equal(cm.cols.find((c) => c.prop === 'id').kind, 'f64');
  assert.equal(cm.cols.find((c) => c.prop === 'none').kind, 'const');
  assert.equal(cm.cols.find((c) => c.prop === 'name').kind, 'arr');
});

test('shells by column: a chunk it cannot lay out is held as rows, never changed', () => {
  const ok = (p) => ({ type: 'Feature', properties: p, geometry: null });
  assert.equal(PACKED.compactShells([ok({ a: 1, b: 2 }), ok({ b: 2, a: 1 })]), null, 'keys in a different order');
  assert.equal(PACKED.compactShells([ok({ a: 1, b: 2 }), ok({ b: 1, c: 3 }), ok({ c: 3, a: 1 })]), null, 'a union that no row order agrees with');
  assert.equal(PACKED.compactShells([ok({ a: { n: 1 } })]), null, 'an object cell');
  assert.equal(PACKED.compactShells([ok({ a: [1, 2] })]), null, 'an array cell');
  assert.equal(PACKED.compactShells([ok({ a: undefined })]), null, 'an undefined cell');
  assert.equal(PACKED.compactShells([{ type: 'Feature', properties: { a: 1 }, geometry: { type: 'Point', coordinates: [1, 2] } }]), null, 'a geometry still on the shell');
  assert.equal(PACKED.compactShells([ok({ a: 1 }), 5]), null, 'a non-object row');
  assert.equal(PACKED.compactShells([]), null);
  const odd = PACKED.makeChunkStore();
  const rows = [{ type: 'Feature', properties: { a: { n: 1 } }, geometry: { type: 'Point', coordinates: [1, 2] } }];
  odd.addFeatures(rows);
  assert.equal(odd.shellsCompacted, 0);
  assert.equal(JSON.stringify(odd.chunk(0)), JSON.stringify(rows));
});

test('shells by column: the store hands back the rows it was given, JSON for JSON, and weighs far less than the rows', () => {
  let s = 31; const r = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const rows = [];
  for (let i = 0; i < 3000; i++) rows.push({ type: 'Feature', id: 'f' + i, properties: { id: i, v: r() * 100, zone: 'z' + (i % 7), _joinPartners: 1 }, geometry: i % 5 ? { type: 'Point', coordinates: [r(), r()] } : null });
  const st = PACKED.makeChunkStore();
  st.addFeatures(rows.slice(0, 1500)); st.addFeatures(rows.slice(1500));
  assert.equal(st.shellsCompacted, 2);
  assert.equal(JSON.stringify([].concat(st.chunk(0), st.chunk(1))), JSON.stringify(rows));
  const stubs = st.stubs();
  assert.equal(stubs.length, 3000);
  assert.equal(stubs[7].properties.id, 7);
  assert.equal(stubs[7].geometry && stubs[7].geometry.type, 'Point');
  assert.ok(st.shellBytes < 3000 * 64, 'the columns weigh ' + st.shellBytes + ' B for 3000 rows');
});

test('only what is on screen: a slice of rows across chunks is built without reading a position back', async () => {
  const rows = [];
  for (let i = 0; i < 2000; i++) rows.push({ type: 'Feature', properties: { id: i, zone: 'z' + (i % 3) }, geometry: { type: 'Point', coordinates: [i, i] } });
  globalThis.IntMapGisScale = { residentBytes: 1, backend: PACKED.memoryBackend() };
  try {
    const st = PACKED.makeChunkStore();
    for (let k = 0; k < 4; k++) { st.addFeatures(rows.slice(k * 500, (k + 1) * 500)); await st.settle(); }
    assert.ok(st.spilledCount >= 2, 'the positions did not leave: ' + st.spilledCount);
    const got = st.attributeRows(450, 700);
    assert.equal(got.length, 700);
    assert.deepEqual(got.map((r) => r.properties.id), rows.slice(450, 1150).map((r) => r.properties.id));
    assert.ok(got.every((r) => r.geometry === null), 'a slice must not claim a geometry it did not read');
    assert.equal(st.attributeRows(1990, 100).length, 10, 'past the end is the rows that exist');
    assert.equal(st.attributeRows(5000, 10).length, 0);
    assert.equal(st.attributeRows(0, 0).length, 0);
  } finally { delete globalThis.IntMapGisScale; }
});

test('a registered chunked result answers attributeRows, and the record keeps its true count', async () => {
  const { w, data, ops } = await boot();
  const pts = []; for (let i = 0; i < 1700; i++) pts.push({ type: 'Feature', properties: { id: i }, geometry: { type: 'Point', coordinates: [120 + (i % 97) * 0.3, 20 + (i % 89) * 0.25] } });
  const L = data.add({ kind: 'vector', title: 'L', features: pts });
  globalThis.IntMapGisScale = { chunkAbovePositions: 0, materializeMaxPositions: 10 };
  try {
    const r = await ops.run({ op: 'buffer', inputs: [L.id], params: { radiusKm: 5 } });
    assert.equal(r.ok, true);
    assert.throws(() => r.dataset.features(), (e) => e.why === 'too-large-to-materialize');
    const rows = r.dataset.attributeRows(10, 5);
    assert.equal(rows.length, 5);
    assert.equal(rows[0].properties.id, 10);
    assert.equal(r.dataset.count, r.dataset.attributeRows(0, 1e9).length);
  } finally { delete globalThis.IntMapGisScale; }
});

test('shells by column: a key a row does not have stays absent — an unmatched row of a join reads back as it was', () => {
  const rows = [
    { type: 'Feature', properties: { id: 0, v: 1.5 }, geometry: null },
    { type: 'Feature', properties: { id: 1, v: 2.5, zone: 'z1', _joinPartners: 1 }, geometry: null },
    { type: 'Feature', properties: { id: 2, v: -0 }, geometry: null },
    { type: 'Feature', properties: { id: 3, v: 4, zone: 'z2', _joinPartners: 2 }, geometry: null },
  ];
  const cm = PACKED.compactShells(rows);
  assert.ok(cm, 'a join output with unmatched rows must compact');
  const back = PACKED.expandShells(cm);
  assert.equal(JSON.stringify(back), JSON.stringify(rows));
  assert.ok(!('zone' in back[0].properties) && !('_joinPartners' in back[2].properties), 'an absent key came back as present');
  assert.ok(Object.is(back[2].properties.v, -0));
  assert.equal(cm.cols.find((c) => c.prop === 'v').kind, 'f64');
  assert.equal(cm.cols.find((c) => c.prop === 'zone').kind, 'arr');
});

test('shells by column: the same top-level keys in another order are a variant, and each row reads back in its own order', () => {
  const rows = [
    { type: 'Feature', geometry: null, properties: { id: 0, zone: 'a' } },
    { type: 'Feature', properties: { id: 1 }, geometry: null },
    { type: 'Feature', geometry: null, properties: { id: 2, zone: 'b' } },
  ];
  const cm = PACKED.compactShells(rows);
  assert.ok(cm, 'two key orders must compact');
  const back = PACKED.expandShells(cm);
  assert.equal(JSON.stringify(back), JSON.stringify(rows));
  assert.deepEqual(Object.keys(back[1]), ['type', 'properties', 'geometry']);
  assert.deepEqual(Object.keys(back[0]), ['type', 'geometry', 'properties']);
  assert.equal(PACKED.compactShells([rows[0], { type: 'Feature', geometry: null, properties: { id: 1 }, extra: 1 }]), null, 'a different key set is not a variant');
});

/* ══ where an op runs: this GIS by default, a registered engine only when asked ═════════════════ */
test('engines: nothing is registered, local is the default, and an unknown engine is refused by name', async () => {
  const { data, ops } = await boot();
  assert.deepEqual(ops.engines(), []);
  const L = data.add({ kind: 'vector', title: 'L', features: lefts(60) }), Z = data.add({ kind: 'vector', title: 'Z', features: zones() });
  const step = { op: 'spatialJoin', inputs: [L.id, Z.id], params: { predicate: 'within', cardinality: 'first' } };
  const a = await ops.run(step);
  assert.equal(a.ok, true);
  assert.ok(!('engine' in a.stats), 'the default run named an engine');
  const b = await ops.run(step, { engine: 'duckdb' });
  assert.equal(b.ok, false); assert.equal(b.why, 'engine-unknown');
  assert.equal((await ops.run(step, { engine: 'auto' })).ok, true, 'auto with nothing registered is this GIS');
  assert.equal(ops.registerEngine({ name: 'local', ops: ['spatialJoin'], accepts: () => ({ ok: true }), run: () => null }).ok, false);
  assert.equal(ops.registerEngine({ name: 'x', ops: ['nope'], accepts: () => ({ ok: true }), run: () => null }).why, 'engine-op-unknown');
});

test('engines: a registered engine answers when named or when it accepts the size, and the answer says who computed it', async () => {
  const { data, ops } = await boot();
  const L = data.add({ kind: 'vector', title: 'L', features: lefts(60) }), Z = data.add({ kind: 'vector', title: 'Z', features: zones() });
  const step = { op: 'spatialJoin', inputs: [L.id, Z.id], params: { predicate: 'within', cardinality: 'first' } };
  const seen = [];
  assert.equal(ops.registerEngine({
    name: 'big', ops: ['spatialJoin'],
    accepts: (info) => ({ ok: info.rows >= 50, why: 'rows ' + info.rows }),
    run: (q) => { seen.push(q.op); return { ok: true, features: [{ type: 'Feature', geometry: null, properties: { from: 'big' } }], stats: { rows: 1 } }; },
  }).ok, true);
  const named = await ops.run(step, { engine: 'big' });
  assert.equal(named.ok, true); assert.equal(named.stats.engine, 'big');
  assert.equal(named.dataset.provenance.computedBy, 'big');
  assert.equal(named.dataset.count, 1);
  const auto = await ops.run(step, { engine: 'auto' });
  assert.equal(auto.stats.engine, 'big');
  const local = await ops.run(step);
  assert.ok(!('engine' in local.stats) && local.dataset.count > 1, 'the default must stay this GIS');
  assert.ok(!('computedBy' in local.dataset.provenance));
  assert.deepEqual(seen, ['spatialJoin', 'spatialJoin']);
});

test('engines: an engine that declines or throws hands the same step back to this GIS, and says why', async () => {
  const { data, ops } = await boot();
  const L = data.add({ kind: 'vector', title: 'L', features: lefts(60) }), Z = data.add({ kind: 'vector', title: 'Z', features: zones() });
  const step = { op: 'spatialJoin', inputs: [L.id, Z.id], params: { predicate: 'within', cardinality: 'first' } };
  const want = await ops.run(step);
  ops.registerEngine({ name: 'no', ops: ['spatialJoin'], accepts: () => ({ ok: true }), run: () => ({ ok: false, why: 'too-big-for-me' }) });
  const d = await ops.run(step, { engine: 'no' });
  assert.equal(d.ok, true); assert.equal(d.stats.engineDeclined, 'no: too-big-for-me');
  assert.equal(JSON.stringify(d.dataset.features()), JSON.stringify(want.dataset.features()));
  ops.unregisterEngine('no');
  ops.registerEngine({ name: 'boom', ops: ['spatialJoin'], accepts: () => ({ ok: true }), run: () => { throw new Error('kaput'); } });
  const t = await ops.run(step, { engine: 'boom' });
  assert.equal(t.ok, true); assert.match(t.stats.engineDeclined, /^boom: engine-threw$/);
  assert.equal(JSON.stringify(t.dataset.features()), JSON.stringify(want.dataset.features()));
});
