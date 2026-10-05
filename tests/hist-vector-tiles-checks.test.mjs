/* ============================================================================
 *  hist-vector-tiles — the historical records are read as time-cut tiles, and every reader
 *  receives exactly what the whole file gave it   (js/hist-bundles.js, scripts/build-hist-tiles.mjs)
 * ----------------------------------------------------------------------------
 *  Before: the first travel into the past fetched each record WHOLE (data/hist-admin1.js 41.5 MB,
 *  data/cshapes.js 13.0 MB, …) although one instant needs only the records in force on that day.
 *  Now the build cuts each record into an index and an archive of gzip members, and the door reads
 *  only the chunks an instant needs, with Range requests. The measurement is in
 *  dev-notes/2026-10-01-hist-vector-tiles.md.
 *
 *  What is held here:
 *    ① THE SAME ANSWER: for every record and every year the history gates name, the door reading
 *       tiles returns the same rows in force, and its page copy holds the same rows, the same rings
 *       (every coordinate the identical double), the same dates and the same head as the door reading
 *       the whole file — the gap records spliced into the first tier included, ring origins and all;
 *    ② the change dates (`edges`), the war span (`during`) and every era sheet (`snap`) likewise;
 *    ③ IT READS LESS: 1900 reads a fraction of each record, in a handful of Range requests;
 *    ④ a server with no tiles, an index for another record, or bytes that are not the chunk asked for
 *       fall back to the whole file — and the answer is still the same;
 *    ⑤ the builder proves its output: a chunk altered after cutting is refused;
 *    ⑥ scripts/serve.mjs answers Range the way GitHub Pages does (a range of the bytes as sent);
 *    ⑦ the service worker lets the archive's Range requests through to the network;
 *    ⑧ the tile names come from the door's own `tilesOf`, for every record the builder discovers.
 * ==========================================================================*/
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Worker as NodeWorker } from 'node:worker_threads';
import { buildTiles, loadDoor, tileRecord, verifyRecord } from '../scripts/build-hist-tiles.mjs';
import { HIST_ADMIN_GAPS } from '../js/border-coast.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const YEARS = [-200, 1000, 1600, 1871, 1900, 1918, 1945, 2000];
const t615 = (y) => y * 10000 + 615;
/* (hist-coverage-depth) the gap records are HIST_ADMIN_GAPS (js/border-coast.js) — the one the page imports —
   narrowed to the ones built here: a record absent from data/ is one the page also opens without */
const GAPS = HIST_ADMIN_GAPS.filter((g) => existsSync(join(ROOT, g.file)));
const RECORDS = [
  { file: 'data/cshapes.js', global: '__CSHAPES', end: 'inclusive' },
  { file: 'data/hist-borders.js', global: '__HISTB', end: 'exclusive' },
  { file: 'data/hist-admin1.js', global: '__HISTADM1', end: 'exclusive', gaps: GAPS },
  { file: 'data/hist-admin2.js', global: '__HISTADM2', end: 'exclusive' },
  { file: 'data/hist-admin3.js', global: '__HISTADM3', end: 'exclusive' },
];

let OUT = null, BUILT = [];
before(async () => {
  OUT = mkdtempSync(join(tmpdir(), 'intmap-hvt-'));
  BUILT = await buildTiles({ outDir: join(OUT, 'data', 'hvt'), log: () => {} });
});
process.on('exit', () => { try { if (OUT) rmSync(OUT, { recursive: true, force: true }); } catch (_) { /* best effort */ } });

/* the app's clocked reader (js/fetch-deadline.js readWithin), serving data/ from the repository and
   data/hvt/ from the build — with Range, as a server that honours it does. `mangle(url, a, b, buf)`
   lets a check hand back something else. */
function reader({ tiles = true, mangle = null } = {}) {
  const log = [];
  const file = (url) => {
    const m = /(data\/[^?#]+)/.exec(String(url));
    if (!m) return null;
    try { return readFileSync(m[1].startsWith('data/hvt/') ? join(OUT, m[1]) : join(ROOT, m[1])); } catch (_) { return null; }
  };
  return {
    log,
    clockFor: () => 60000,
    readWithin: async (url, ms, init, opts) => {
      let buf = /data\/hvt\//.test(url) && !tiles ? null : file(url);
      if (!buf) return { ok: false, status: 404, text: 'no', bytes: new ArrayBuffer(0) };
      const rg = init && init.headers && /^bytes=(\d+)-(\d+)$/.exec(init.headers.Range || '');
      let status = 200;
      if (rg) {
        const a = +rg[1], b = +rg[2];
        buf = buf.subarray(a, b + 1); status = 206;
        if (mangle) buf = mangle(url, a, b, buf);
      }
      log.push({ url: String(url), bytes: buf.length, range: !!rg });
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      return opts && opts.bytes ? { ok: true, status, bytes: ab } : { ok: true, status, text: buf.toString('utf8') };
    },
  };
}
function door(FW, { spawn: sp } = {}) {
  const w = {};
  vm.runInNewContext(rd('js/hist-bundles.js'), { window: w, URL, Response, Blob, DecompressionStream, TextDecoder, console });
  return w.IntMapHistBundles.make({ win: {}, spawn: sp, fetchWithin: FW });
}
/* a real second thread, the shape js/hist-bundles.js expects of a Worker */
function nodeSpawn(src) {
  return () => {
    const shim = 'const { parentPort } = require("node:worker_threads");\n' +
      'const self = { postMessage: (m, t) => parentPort.postMessage(m, t) };\n' +
      'parentPort.on("message", (data) => self.onmessage({ data }));\n';
    const nw = new NodeWorker(shim + src, { eval: true });
    const it = { onmessage: null, onerror: null, onmessageerror: null, postMessage: (m, t) => nw.postMessage(m, t), terminate: () => nw.terminate() };
    nw.on('message', (data) => { if (it.onmessage) it.onmessage({ data }); });
    nw.on('error', (e) => it.onerror && it.onerror(e));
    nw.unref();
    return it;
  };
}
const J = (x) => JSON.stringify(x);
function sameRing(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) { if (a[k].length !== b[k].length) return false; for (let j = 0; j < a[k].length; j++) if (!Object.is(a[k][j], b[k][j])) return false; }
  return true;
}
/* everything a reader can read off the page copy for the rows `idx`: the rows, their rings (by value
   AND by the origin js/border-coast.js marks them with), their dates, the head */
function compareCopies(label, A, B, dA, dB, idx) {
  const head = (M) => { const o = {}; for (const k of Object.keys(M)) if (!['rings', 'feats', 'dates', 'gapPools', 'snaps'].includes(k)) o[k] = M[k]; return o; };
  assert.equal(J(head(dB)), J(head(dA)), `${label}: the head differs`);
  assert.equal(J(Object.keys(dB)), J(Object.keys(dA)), `${label}: the copy's keys differ`);
  assert.equal(dB.rings.length, dA.rings.length, `${label}: the ring pool length differs`);
  assert.equal(dB.feats.length, dA.feats.length, `${label}: the row count differs`);
  if (dA.gapPools) assert.equal(J(dB.gapPools.map((g) => g && { ...g, view: undefined })), J(dA.gapPools.map((g) => g && { ...g, view: undefined })), `${label}: the gap pools differ`);
  for (const i of idx) {
    assert.equal(J(dB.feats[i]), J(dA.feats[i]), `${label}: row ${i} differs`);
    for (const poly of dA.feats[i][8] || []) for (const ri of poly) {
      assert.ok(sameRing(dB.rings[ri], dA.rings[ri]), `${label}: ring ${ri} differs`);
      assert.equal(J(B.ringOrigin(dB.rings[ri])), J(A.ringOrigin(dA.rings[ri])), `${label}: ring ${ri} has another origin`);
    }
    if (dA.dates && dA.feats[i][10] != null) assert.equal(J(dB.dates[dA.feats[i][10]]), J(dA.dates[dA.feats[i][10]]), `${label}: dates of row ${i} differ`);
    const g = dA.feats[i][12];
    if (g != null) assert.equal(J(dB.gapPools[g].view.feats[dA.feats[i][11]]), J(dA.gapPools[g].view.feats[dA.feats[i][11]]), `${label}: the gap view of row ${i} differs`);
  }
}

for (const R of RECORDS) {
  test(`① ${R.file}: the tiles answer every named year with the whole file's rows, rings, dates and head`, async () => {
    const A = door(reader({ tiles: false })), B = door(reader());
    const hA = await A.open({ file: R.file, global: R.global, gaps: R.gaps }), hB = await B.open({ file: R.file, global: R.global, gaps: R.gaps });
    assert.equal(A.mode(R.global), 'whole');
    assert.equal(B.mode(R.global), 'tiled', 'the door read the tiles, not the whole file');
    for (const y of YEARS) {
      const a = await hA.at(t615(y), R.end), b = await hB.at(t615(y), R.end);
      assert.equal(J(b), J(a), `${R.file} ${y}: another set of rows is in force`);
      compareCopies(`${R.file} ${y}`, A, B, hA.data, hB.data, a);
    }
    const lo = -1300000, hi = 99991231;
    assert.equal(J(await hB.edges(R.end, lo, hi)), J(await hA.edges(R.end, lo, hi)), `${R.file}: the change dates differ`);
    assert.equal(B.counts().fellBack, 0, 'nothing fell back to the whole file');
  });
}

test('② the war span (`during`) and every era sheet come back the same', async () => {
  const A = door(reader({ tiles: false })), B = door(reader());
  const cA = await A.open({ file: 'data/cshapes.js', global: '__CSHAPES' }), cB = await B.open({ file: 'data/cshapes.js', global: '__CSHAPES' });
  const a = await cA.during(19140728, 19450902), b = await cB.during(19140728, 19450902);
  assert.ok(a.length > 100, 'the war span holds the polities of both wars');
  assert.equal(J(b), J(a));
  compareCopies('cshapes during', A, B, cA.data, cB.data, a);
  const eA = await A.open({ file: 'data/hist-eras.js', global: '__HISTERAS' }), eB = await B.open({ file: 'data/hist-eras.js', global: '__HISTERAS' });
  assert.equal(B.mode('__HISTERAS'), 'tiled');
  const years = eA.data.snaps.map((s) => s.y);
  assert.ok(years.length > 40, 'the era record holds its sheets');
  for (const y of years) {
    const sa = await eA.snap(y), sb = await eB.snap(y);
    assert.equal(J(sb), J(sa), `era sheet ${y} differs`);
    const rings = new Set([...(sa.feats || []).flatMap((x) => x[2].flat()), ...(sa.blank || []).flat(2)]);
    for (const ri of rings) assert.ok(sameRing(eB.data.rings[ri], eA.data.rings[ri]), `era ${y}: ring ${ri} differs`);
  }
  /* the same answer is not enough — a fallback to the whole file gives it too (it did: a sheet's `blank`
     rings were listed nowhere, every sheet fell back, and only this line could see it) */
  assert.equal(B.mode('__HISTERAS'), 'tiled', 'the era record was still being read as tiles after every sheet');
  assert.equal(B.mode('__CSHAPES'), 'tiled');
  assert.equal(B.counts().fellBack, 0, 'no question fell back to the whole file');
});

test('①′ on a real second thread (bytes transferred, answers in slices) the copy is the same', async () => {
  const A = door(reader({ tiles: false }));
  const W0 = door(reader());
  const B = door(reader(), { spawn: nodeSpawn(W0.workerSource()) });
  const spec = { file: 'data/hist-admin1.js', global: '__HISTADM1', gaps: GAPS };
  const hA = await A.open(spec), hB = await B.open(spec);
  for (const y of [1871, 1900]) {
    const a = await hA.at(t615(y), 'exclusive'), b = await hB.at(t615(y), 'exclusive');
    assert.equal(J(b), J(a));
    compareCopies(`admin1 on a thread ${y}`, A, B, hA.data, hB.data, a);
  }
  const c = B.counts();
  assert.equal(c.thread, true, 'the questions were asked on the second thread');
  assert.ok(c.worker > 0 && c.page === 0, 'nothing was answered on the page');
});

test('③ 1900 reads a fraction of each record, in a handful of requests', async () => {
  const FW = reader(), B = door(FW);
  const out = [];
  for (const R of [RECORDS[0], RECORDS[2]]) {
    const h = await B.open({ file: R.file, global: R.global, gaps: R.gaps });
    const before0 = FW.log.length;
    await h.at(t615(1900), R.end);
    const reads = FW.log.slice(before0);
    const whole = readFileSync(join(ROOT, R.file)).length + (R.gaps || []).reduce((n, g) => n + readFileSync(join(ROOT, g.file)).length, 0);
    const bytes = reads.reduce((n, r) => n + r.bytes, 0);
    out.push({ file: R.file, bytes, whole, requests: reads.length });
    assert.ok(reads.every((r) => r.range), `${R.file}: every chunk was read with a Range request`);
    assert.ok(bytes < whole / 5, `${R.file}: 1900 read ${bytes} bytes of a ${whole}-byte record`);
    assert.ok(reads.length <= 40, `${R.file}: 1900 took ${reads.length} requests`);
  }
  /* a second question on the same instant reads nothing more */
  const FW2 = reader(), B2 = door(FW2);
  const h2 = await B2.open({ file: 'data/cshapes.js', global: '__CSHAPES' });
  await h2.at(t615(1900), 'inclusive');
  const n = FW2.log.length;
  await h2.at(t615(1900), 'inclusive');
  assert.equal(FW2.log.length - n, 0, 'an instant already read is not read again');
});

test('④ no tiles, an index for another record, or bytes that are not the chunk → the whole file, and the same answer', async () => {
  const A = door(reader({ tiles: false }));
  const hA = await A.open({ file: 'data/cshapes.js', global: '__CSHAPES' });
  const want = await hA.at(t615(1918), 'inclusive');
  /* bytes that are not the chunk: a range of another chunk — gzip and the chunk's own name both refuse it */
  const shifted = reader({ mangle: (url, a, b, buf) => readFileSync(join(OUT, /(data\/[^?#]+)/.exec(url)[1])).subarray(0, buf.length) });
  const B = door(shifted);
  const hB = await B.open({ file: 'data/cshapes.js', global: '__CSHAPES' });
  assert.equal(B.mode('__CSHAPES'), 'tiled');
  const got = await hB.at(t615(1918), 'inclusive');
  assert.equal(J(got), J(want));
  compareCopies('cshapes after a bad range', A, B, hA.data, hB.data, want);
  assert.equal(B.mode('__CSHAPES'), 'whole', 'the door read the whole file after the archive failed');
  assert.ok(B.counts().fellBack >= 1);
  /* no tiles on this server (npm run dev) */
  const C = door(reader({ tiles: false }));
  const hC = await C.open({ file: 'data/cshapes.js', global: '__CSHAPES' });
  assert.equal(J(await hC.at(t615(1918), 'inclusive')), J(want));
  assert.equal(C.mode('__CSHAPES'), 'whole');
  /* an index that names another record is not this record */
  const wrong = reader();
  const rw = wrong.readWithin;
  wrong.readWithin = async (url, ms, init, opts) => (/hvt\/cshapes\.idx\.json/.test(url) ? rw(url.replace('cshapes.idx', 'hist-borders.idx'), ms, init, opts) : rw(url, ms, init, opts));
  const D = door(wrong);
  const hD = await D.open({ file: 'data/cshapes.js', global: '__CSHAPES' });
  assert.equal(D.mode('__CSHAPES'), 'whole');
  assert.equal(J(await hD.at(t615(1918), 'inclusive')), J(want));
});

test('⑤ the builder refuses tiles that do not read back as the record', async () => {
  const door0 = loadDoor();
  const bytes = readFileSync(join(ROOT, 'data/hist-admin3.js'));
  const t = await tileRecord(door0, { file: 'hist-admin3.js', global: '__HISTADM3', bytes });
  assert.equal(await verifyRecord(door0, t, bytes), true);
  /* one coordinate moved by one unit of the record's last decimal, inside an otherwise valid member */
  const ci = t.index.chunks.findIndex(([o, n]) => { const x = JSON.parse(gunzipSync(t.archive.subarray(o, o + n))); return x.r && x.r.length; });
  const [o, n] = t.index.chunks[ci];
  const obj = JSON.parse(gunzipSync(t.archive.subarray(o, o + n)));
  obj.r[0][1][0] += 1;
  const z = gzipSync(Buffer.from(JSON.stringify(obj) + '\n'));
  const archive = Buffer.concat([t.archive.subarray(0, o), z, t.archive.subarray(o + n)]);
  const chunks = t.index.chunks.map(([oo, nn], k) => (k < ci ? [oo, nn] : k === ci ? [o, z.length] : [oo + z.length - n, nn]));
  await assert.rejects(verifyRecord(door0, { index: { ...t.index, chunks }, archive }, bytes), /does not come back/);
  /* …and an index that does not send the door to a chunk a row reads: every chunk is right, the answer
     through a fallback would be right, and the build still refuses it */
  const rowRings = t.index.rowRings.map((l) => l.slice());
  const i = rowRings.findIndex((l) => l.length > 1);
  rowRings[i] = rowRings[i].slice(1);
  await assert.rejects(verifyRecord(door0, { index: { ...t.index, rowRings }, archive: t.archive }, bytes), /does not list/);
});

test('⑥ scripts/serve.mjs answers a Range the way Pages does', async () => {
  const srv = spawn(process.execPath, [join(ROOT, 'scripts/serve.mjs'), '--port', '0', '--root', OUT], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const port = await new Promise((res, rej) => {
      let s = '';
      srv.stdout.on('data', (b) => { s += b; const m = /:(\d{2,5})\b/.exec(s); if (m) res(+m[1]); });
      srv.on('exit', () => rej(new Error('serve.mjs exited: ' + s)));
      setTimeout(() => rej(new Error('serve.mjs did not start: ' + s)), 15000);
    });
    const name = BUILT.find((b) => b.global === '__CSHAPES').archive;
    const whole = readFileSync(join(OUT, 'data', 'hvt', name));
    const r = await fetch(`http://127.0.0.1:${port}/data/hvt/${name}`, { headers: { Range: 'bytes=100-199', 'Accept-Encoding': 'gzip' } });
    assert.equal(r.status, 206);
    assert.equal(r.headers.get('content-range'), `bytes 100-199/${whole.length}`);
    assert.equal(r.headers.get('content-encoding'), null, 'a .gz archive is a gzip BODY, never re-encoded');
    assert.ok(Buffer.from(await r.arrayBuffer()).equals(whole.subarray(100, 200)));
    /* a compressible type: the range is of the gzipped stream, as on Pages — which is why the archive is .gz */
    const idx = BUILT.find((b) => b.global === '__HISTADM2').index;
    const ri = await fetch(`http://127.0.0.1:${port}/data/hvt/${idx}`, { headers: { Range: 'bytes=0-99', 'Accept-Encoding': 'gzip' } });
    assert.equal(ri.status, 206);
    assert.equal(ri.headers.get('content-encoding'), 'gzip');
    assert.notEqual(ri.headers.get('content-range'), `bytes 0-99/${readFileSync(join(OUT, 'data', 'hvt', idx)).length}`);
    await ri.arrayBuffer();
    const bad = await fetch(`http://127.0.0.1:${port}/data/hvt/${name}`, { headers: { Range: `bytes=${whole.length + 10}-${whole.length + 20}` } });
    assert.equal(bad.status, 416);
    await bad.arrayBuffer();
  } finally { srv.kill(); }
});

test('⑦ the service worker lets the archive and its Range requests through to the network', () => {
  const listeners = {};
  const self = { addEventListener: (t, fn) => { listeners[t] = fn; }, skipWaiting() {}, clients: { claim: async () => {} }, location: { origin: 'https://example.test' } };
  vm.runInNewContext(rd('sw.js'), { self, caches: {}, console, URL, Request: class {}, Response: class {}, Headers: class {}, fetch: async () => { throw new Error('offline'); }, setTimeout, clearTimeout, Date, Promise, Math, Map, Set, JSON });
  for (const url of ['https://example.test/IntMap/data/hvt/cshapes.jsonl.gz', 'https://example.test/IntMap/data/hvt/cshapes.idx.json']) {
    let answered = false;
    listeners.fetch({ request: { method: 'GET', url, headers: new Map([['range', 'bytes=0-9']]) }, respondWith: () => { answered = true; }, waitUntil() {} });
    assert.equal(answered, false, `${url} is answered by the worker — a cached whole body would answer a Range with the wrong bytes`);
  }
});

test('⑧ every discovered record is tiled under the name the door derives', () => {
  const D = loadDoor();
  assert.ok(BUILT.length >= 8, 'the builder discovered the eight ring-pooled records');
  for (const b of BUILT) {
    assert.equal('data/hvt/' + b.index, D.tilesOf(b.file), `${b.file}: the index is not where the door looks`);
    assert.equal(b.archive, b.index.replace(/\.idx\.json$/, '.jsonl.gz'));
  }
  for (const R of RECORDS) assert.ok(BUILT.some((b) => b.global === R.global), `${R.file} was not tiled`);
});
