/* ============================================================================
 *  gis-buffer-worker — buffer carried to another thread answers what the page's kernel answers
 * ----------------------------------------------------------------------------
 *  ⚠ THE OTHER THREAD IS REAL: a node:worker_threads thread running src/gis-buffer-worker.js itself (the file
 *  the bundler emits), reached through src/gis-buffer-worker-client.js — the product's own pool — via a
 *  `Worker` global that adapts the node thread to the web API. What is measured is not 「used」 (the op's note
 *  says that, and an op that buffered here and said so would pass) but that every output row is the answer the
 *  page kernel gives for the same input, to the byte (許容幅 0), and that each way of NOT carrying ends in the
 *  same table with the reason in the note.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installNodeWorker } from './helpers/gis-buffer-worker-node.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

let threads = { spawned: 0 };
function installWebWorker() { threads = installNodeWorker(); }

async function boot() {
  const w = {};
  globalThis.window = w;
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

/* A budget this small makes the corpus several blocks, so the pool and the block window are the subject and not
   a multiplier of one block. */
function smallBudget(worker, bytes) {
  return Object.assign({}, worker, {
    planBlocks: (spec) => worker.planBlocks(Object.assign({}, spec, { budgetBytes: bytes })),
  });
}

function corpus(n) {
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const feats = [];
  for (let i = 0; i < n; i++) feats.push({ type: 'Feature', properties: { id: i }, geometry: { type: 'Point', coordinates: [120 + rnd() * 30, 20 + rnd() * 25] } });
  const ring = (cx, cy, rad, m) => { const o = []; for (let i = 0; i < m; i++) { const t = i / m * 2 * Math.PI; o.push([cx + rad * Math.cos(t) * (1 + 0.2 * Math.sin(5 * t)), cy + rad * Math.sin(t) * (1 + 0.2 * Math.sin(5 * t))]); } o.push(o[0]); return o; };
  for (let i = 0; i < 4; i++) {
    feats.push({ type: 'Feature', properties: { id: 'poly' + i }, geometry: { type: 'Polygon', coordinates: [ring(125 + i, 30, 0.6, 40), ring(125 + i, 30, 0.2, 12).reverse()] } });
    feats.push({ type: 'Feature', properties: { id: 'line' + i }, geometry: { type: 'LineString', coordinates: ring(140, 30 + i * 0.3, 0.4, 30).slice(0, 25) } });
  }
  feats.push({ type: 'Feature', properties: { id: 'seam' }, geometry: { type: 'Point', coordinates: [179.95, 10] } });
  feats.push({ type: 'Feature', properties: { id: 'pole' }, geometry: { type: 'Point', coordinates: [30, 89.95] } });
  feats.push({ type: 'Feature', properties: { id: 'multi' }, geometry: { type: 'MultiPoint', coordinates: [[100, 10], [100.02, 10.01], [101, 11]] } });
  feats.push({ type: 'Feature', properties: { id: 'none' }, geometry: null });
  return feats;
}

/* the rows the run registered — read from the dataset, so an answer that is simply absent cannot compare equal to itself */
const rowsOf = (r) => r.dataset.features();
const stable = (r) => { const rows = rowsOf(r); assert.ok(rows.length > 0, "the run registered no rows"); return JSON.stringify(rows); };

test('buffer: the carried answer is the page kernel\'s answer, feature for feature', async () => {
  const { w, data, ops, worker } = await boot();
  const ds = data.add({ kind: 'vector', title: 'c', features: corpus(1700) });
  const step = { op: 'buffer', inputs: [ds.id], params: { radiusKm: 5 } };

  /* THE REFERENCE FIRST, with no door mounted — also the measurement that the default path did not move. */
  w.IntMapGisWorker = undefined;
  const want = await ops.run(step);
  assert.equal(want.ok, true);
  assert.equal(want.stats.worker, 'not-used: worker-not-mounted');

  installWebWorker();
  w.IntMapGisWorker = smallBudget(worker, 144 * 4000);
  const got = await ops.run(step);
  assert.equal(got.ok, true, JSON.stringify(got.why));
  assert.match(got.stats.worker, /^used: \d+ of \d+ features$/);
  assert.ok(threads.spawned >= 2, 'the corpus was not split across threads (' + threads.spawned + ')');
  assert.equal(stable(got), stable(want), 'carried and page answers differ');
  assert.equal(rowsOf(got).length, rowsOf(want).length);
});

test('buffer: a thread that cannot start is a stated reason and the same table', async () => {
  const { w, data, ops, worker } = await boot();
  const ds = data.add({ kind: 'vector', title: 'c', features: corpus(1700) });
  const step = { op: 'buffer', inputs: [ds.id], params: { radiusKm: 5 } };
  w.IntMapGisWorker = undefined;
  const want = await ops.run(step);

  globalThis.Worker = class { constructor() { throw new Error('no threads here'); } };
  w.IntMapGisWorker = worker;
  const got = await ops.run(step);
  assert.equal(got.ok, true);
  assert.equal(got.stats.worker, 'not-used: worker-unavailable');
  assert.equal(stable(got), stable(want));
});

test('buffer: too little work does not start a thread', async () => {
  const { w, data, ops, worker } = await boot();
  const ds = data.add({ kind: 'vector', title: 'few', features: corpus(3).slice(0, 3) });
  installWebWorker();
  w.IntMapGisWorker = worker;
  const got = await ops.run({ op: 'buffer', inputs: [ds.id], params: { radiusKm: 5 } });
  assert.equal(got.ok, true);
  assert.equal(got.stats.worker, 'not-used: nothing-large-enough');
  assert.equal(threads.spawned, 0, 'a thread was started for nothing');
});

test('buffer: a reader\'s cancel reaches the carried pass and registers nothing', async () => {
  const { w, data, ops, worker } = await boot();
  const ds = data.add({ kind: 'vector', title: 'c', features: corpus(1700) });
  installWebWorker();
  w.IntMapGisWorker = smallBudget(worker, 144 * 4000);
  const ac = new AbortController();
  const got = await ops.run({ op: 'buffer', inputs: [ds.id], params: { radiusKm: 5 } }, { signal: ac.signal, onProgress: () => ac.abort() });
  assert.equal(got.ok, false);
  assert.equal(got.why, 'cancelled');
});
