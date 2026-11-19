#!/usr/bin/env node
/* GIS scale bench — how long and how much memory the SHIPPED ops take as the feature count grows.
   Measures; asserts nothing (a number is an observation, dev-notes records it with the date).
   usage: node --expose-gc scripts/gis-scale-bench.mjs [--sizes 10000,100000,1000000] [--ops filter,buffer,spatialJoin] [--worker]
   --worker mounts the product's buffer worker (src/gis-buffer-worker.js on node:worker_threads) and prints the longest stretch the main thread was held (lagMs) */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const sizes = arg('sizes', '10000,100000').split(',').map(Number);
const only = arg('ops', 'filter,buffer,spatialJoin,aggregate').split(',');
/* bufferJoin = buffer, then spatialJoin over the buffer's own output (the chain the chunked path exists for) */

const w = {}; globalThis.window = w;
new Function('window', readFileSync(join(ROOT, 'js/geodesy.js'), 'utf8'))(w);
const { makeGisDatasets } = await import('../js/gis-datasets.js');
const { makeGisGeometry } = await import('../js/gis-geometry.js');
const { makeGisOps } = await import('../js/gis-ops.js');
const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
await geometry.ready();
let threads = null;
if (process.argv.includes('--worker')) {
  const { installNodeWorker } = await import('../tests/helpers/gis-buffer-worker-node.mjs');
  const { makeGisWorker } = await import('../js/gis-worker.js');
  threads = installNodeWorker(); w.IntMapGisWorker = makeGisWorker();
}
let lag = 0, lastBeat = performance.now(), peakRss = 0, peakHeap = 0;
/* peaks are sampled every 100 ms, not read once at the end: the end is after the garbage collector has run */
setInterval(() => { const m = process.memoryUsage(); peakRss = Math.max(peakRss, m.rss); peakHeap = Math.max(peakHeap, m.heapUsed); }, 100).unref();
setInterval(() => { const n = performance.now(); lag = Math.max(lag, n - lastBeat - 10); lastBeat = n; }, 10).unref();

let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const points = (n) => Array.from({ length: n }, (_, i) => ({ type: 'Feature', properties: { id: i, v: rnd() * 100 }, geometry: { type: 'Point', coordinates: [120 + rnd() * 30, 20 + rnd() * 25] } }));
const cells = (k) => { const out = []; const s = Math.ceil(Math.sqrt(k)); for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) { const x = 120 + i * 30 / s, y = 20 + j * 25 / s, dx = 30 / s, dy = 25 / s; out.push({ type: 'Feature', properties: { zone: i * s + j }, geometry: { type: 'Polygon', coordinates: [[[x, y], [x + dx, y], [x + dx, y + dy], [x, y + dy], [x, y]]] } }); } return out; };
const mb = () => { if (globalThis.gc) globalThis.gc(); return Math.round(process.memoryUsage().heapUsed / 1048576); };

const plan = {
  filter: (pid) => ({ op: 'filter', inputs: [pid], params: { where: [{ field: 'v', op: '>=', value: 50 }] } }),
  buffer: (pid) => ({ op: 'buffer', inputs: [pid], params: { radiusKm: 5 } }),
  spatialJoin: (pid, zid) => ({ op: 'spatialJoin', inputs: [pid, zid], params: { predicate: 'within', cardinality: 'first' } }),
  aggregate: (pid, zid) => ({ op: 'aggregate', inputs: [zid, pid], params: { stat: 'mean', field: 'v' } }),
};
const rows = [];
for (const n of sizes) {
  const base = mb();
  const p = data.add({ kind: 'vector', title: 'pts' + n, features: points(n) });
  const z = data.add({ kind: 'vector', title: 'zones' + n, features: cells(Math.min(400, Math.max(16, Math.round(n / 250)))) });
  for (const name of only) {
    const t0 = performance.now(); let r, err = null, extra = {}; lag = 0; lastBeat = performance.now(); const elu0 = performance.eventLoopUtilization();
    peakRss = 0; peakHeap = 0;
    try {
      if (name === 'bufferJoin') {
        const b = await ops.run(plan.buffer(p.id)); r = b;
        if (b.ok) { r = await ops.run({ op: 'spatialJoin', inputs: [b.dataset.id, z.id], params: { predicate: 'within', cardinality: 'first' } }); extra = { bufferChunks: b.dataset.chunkedCount || 0, bufferPositions: b.dataset.positions || 0 }; data.remove(b.dataset.id); }
      } else r = await ops.run(plan[name](p.id, z.id));
    } catch (e) { err = String(e && e.message || e); }
    const ms = Math.round(performance.now() - t0);
    rows.push({ n, op: name, ms, ok: !!(r && r.ok), why: err || (r && !r.ok ? r.why : null), heapMB: mb() - base, peakHeapMB: Math.round(peakHeap / 1048576), peakRssMB: Math.round(peakRss / 1048576), outRows: r && r.dataset ? r.dataset.count : null, outPositions: r && r.dataset ? (r.dataset.positions || null) : null, chunks: r && r.dataset ? (r.dataset.chunkedCount || 0) : 0, ...extra, lagMs: Math.round(lag), mainBusyMs: Math.round(performance.eventLoopUtilization(elu0).active), worker: (r && r.stats) ? r.stats.worker : null, threads: threads ? threads.spawned : 0 });
    console.log(JSON.stringify(rows[rows.length - 1]));
  }
  data.remove && data.remove(p.id); data.remove && data.remove(z.id);
}
