/* ============================================================================
 *  chronos-prefetch — the history door reads one step ahead of the reader, and that never changes an answer
 * ----------------------------------------------------------------------------
 *  「時計で年や日付を動かすと、その時点の国境・地方区分を取り直すまで待ちが出る」
 *  js/hist-bundles.js `follow`: once a record has answered `at(a)` then `at(b)`, the chunks `at(b + (b - a))` reads
 *  are read into the THREAD in a one-connection lane. What this file holds it to:
 *   ① the next instant is the same step again — in years when the step keeps the month and day, in days otherwise,
 *     across year 0 and the leap day;
 *   ② A WALK WITH THE READ-AHEAD ANSWERS EXACTLY WHAT THE SAME WALK WITHOUT IT ANSWERS, AND THE PAGE HOLDS EXACTLY
 *     THE SAME ROWS — the instant read ahead is never on the page before it is asked (no instant's rows mixed into
 *     another's), for a day-exact record with an inclusive end and the subdivision record with its gap records;
 *   ③ …and the step it guessed needs no read of its own (the point of it);
 *   ④ nothing is read ahead where a speculative copy is dear (js/mem-budget.js `maySpeculate` false);
 *   ⑤ a read ahead that fails costs the question the reader asks nothing — it reads its chunk itself and the door
 *     does not fall back to the whole file;
 *   ⑥ the same through a real second thread.
 *  Tiles are cut by scripts/build-hist-tiles.mjs as tests/hist-vector-tiles-checks.test.mjs cuts them.
 * ==========================================================================*/
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker as NodeWorker } from 'node:worker_threads';
import { buildTiles } from '../scripts/build-hist-tiles.mjs';
import { HIST_ADMIN_GAPS } from '../js/border-coast.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const t615 = (y) => y * 10000 + 615;
const GAPS = HIST_ADMIN_GAPS.filter((g) => existsSync(join(ROOT, g.file)));
const CS = { file: 'data/cshapes.js', global: '__CSHAPES', end: 'inclusive' };
const A1 = { file: 'data/hist-admin1.js', global: '__HISTADM1', end: 'exclusive', gaps: GAPS };

let OUT = null;
before(async () => {
  OUT = mkdtempSync(join(tmpdir(), 'intmap-hvt-prefetch-'));
  await buildTiles({ outDir: join(OUT, 'data', 'hvt'), log: () => {} });
});
process.on('exit', () => { try { if (OUT) rmSync(OUT, { recursive: true, force: true }); } catch (_) { /* best effort */ } });

/* the clocked reader, serving data/ from the repository and data/hvt/ from the cut above, with Range.
   `fail(url, a, b)` true → that read is answered 503 (an observed failure). */
function reader({ fail = null } = {}) {
  const log = [];
  return {
    log,
    clockFor: () => 60000,
    readWithin: async (url, ms, init, opts) => {
      const m = /(data\/[^?#]+)/.exec(String(url));
      let buf = null;
      try { buf = readFileSync(m[1].startsWith('data/hvt/') ? join(OUT, m[1]) : join(ROOT, m[1])); } catch (_) { buf = null; }
      if (!buf) return { ok: false, status: 404, bytes: new ArrayBuffer(0) };
      const rg = init && init.headers && /^bytes=(\d+)-(\d+)$/.exec(init.headers.Range || '');
      let status = 200;
      if (rg) {
        const a = +rg[1], b = +rg[2];
        if (fail && fail(String(url), a, b)) { log.push({ url: String(url), a, b, failed: true }); return { ok: false, status: 503, bytes: new ArrayBuffer(0) }; }
        buf = buf.subarray(a, b + 1); status = 206;
        log.push({ url: String(url), a, b });
      }
      return opts && opts.bytes ? { ok: true, status, bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } : { ok: true, status, text: buf.toString('utf8') };
    },
  };
}
function door(FW, { speculate = false, spawn = () => null } = {}) {
  const w = {};
  vm.runInNewContext(rd('js/hist-bundles.js'), { window: w, URL, Response, Blob, DecompressionStream, TextDecoder, console });
  return w.IntMapHistBundles.make({ win: {}, spawn, fetchWithin: FW, maySpeculate: () => speculate });
}
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
/* the door has nothing in flight and nothing queued — the read ahead (if any) has landed */
async function settle(D) {
  for (let i = 0; i < 400; i++) { const c = D.counts(); if (c.inFlight === 0 && c.reading === 0) { await new Promise((r) => setTimeout(r, 20)); const k = D.counts(); if (k.inFlight === 0 && k.reading === 0) return; } await new Promise((r) => setTimeout(r, 10)); }
  throw new Error('the door did not settle');
}
const J = (x) => JSON.stringify(x);
const held = (M) => { const o = []; for (let i = 0; i < M.feats.length; i++) if (M.feats[i] !== undefined) o.push(i); return o; };
const heldRings = (M) => { let n = 0; for (let i = 0; i < M.rings.length; i++) if (M.rings[i] !== undefined) n++; return n; };

test('① the instant one step ahead is the same step again', async () => {
  const D = door(reader());
  /* the job answers on the page here (no thread); the arithmetic is the job's, the same on a thread */
  const next = (a, b) => D.histJob({}, { op: 'next', a, b });
  assert.equal(next(t615(1900), t615(1901)), t615(1902), 'a year forward');
  assert.equal(next(t615(1925), t615(1924)), t615(1923), 'a year back');
  assert.equal(next(t615(1200), t615(1210)), t615(1220), 'a decade');
  assert.equal(next(t615(-1), t615(0)), t615(1), 'across year 0 (YYYYMMDD with a negative year, as js/hist-scale.js writes it)');
  assert.equal(next(t615(-323), t615(-322)), t615(-321), 'BCE');
  assert.equal(next(19000630, 19000701), 19000702, 'a day, across a month end');
  assert.equal(next(19040228, 19040229), 19040301, 'a day, across the leap day');
  assert.equal(next(19001231, 19010101), 19010102, 'a day, across a year end');
  assert.equal(next(19040229, 19050301), 19060302, 'a step that keeps neither month nor day is taken in days (366 of them)');
});

async function walk(R, years, opts) {
  const FW = reader(opts && opts.fail ? { fail: opts.fail } : {});
  const D = door(FW, opts);
  const h = await D.open({ file: R.file, global: R.global, gaps: R.gaps });
  assert.equal(D.mode(R.global), 'tiled', `${R.file}: the door read the tiles`);
  const steps = [];
  for (const y of years) {
    const before = FW.log.filter((x) => !x.failed).length;
    const ix = await h.at(t615(y), R.end);
    const asked = FW.log.filter((x) => !x.failed).length - before;   /* reads made while THIS question was answered */
    const M = h.data;
    steps.push({ y, ix: J(ix), held: J(held(M)), rings: heldRings(M), rows: J(ix.map((i) => M.feats[i])), asked });
    await settle(D);
  }
  return { D, FW, steps };
}

for (const [R, years] of [[CS, [1900, 1901, 1902, 1903, 1904, 1903, 1902]], [A1, [1866, 1867, 1868, 1869, 1870, 1869, 1868]]]) {
  test(`② ③ ${R.file}: with the read-ahead the answers and the page copy are the same, and the guessed step reads nothing`, async () => {
    const off = await walk(R, years, { speculate: false });
    const on = await walk(R, years, { speculate: true });
    for (let k = 0; k < years.length; k++) {
      const a = off.steps[k], b = on.steps[k];
      assert.equal(b.ix, a.ix, `${R.file} ${years[k]}: the rows in force differ`);
      assert.equal(b.rows, a.rows, `${R.file} ${years[k]}: the rows themselves differ`);
      /* ⚠ THE MIXING CLAIM: the page holds exactly what the walk without the read-ahead holds — the instant
         read ahead has not reached the page (its rows would be here before they were asked for) */
      assert.equal(b.held, a.held, `${R.file} ${years[k]}: the page holds other rows than the same walk without the read-ahead`);
      assert.equal(b.rings, a.rings, `${R.file} ${years[k]}: the page holds another number of rings`);
    }
    assert.ok(on.D.counts().prefetchChunks > 0, `${R.file}: something was read ahead`);
    assert.equal(off.D.counts().prefetchChunks, 0);
    /* ③ every step that continued the previous one in the same direction was read ahead: it asks nothing itself */
    for (let k = 2; k < years.length; k++) {
      const same = (years[k] - years[k - 1]) === (years[k - 1] - years[k - 2]);
      if (same) assert.equal(on.steps[k].asked, 0, `${R.file} ${years[k]}: the step the reader kept taking still read ${on.steps[k].asked} range(s)`);
    }
    assert.ok(off.steps.slice(2).some((s) => s.asked > 0), `${R.file}: the walk without the read-ahead reads on its steps — otherwise ③ proves nothing`);
  });
}

test('④ nothing is read ahead where a speculative copy is dear', async () => {
  const { D, steps } = await walk(CS, [1900, 1901, 1902, 1903], { speculate: false });
  assert.equal(D.counts().prefetchChunks, 0);
  assert.equal(D.counts().prefetchBytes, 0);
  assert.ok(steps[3].asked > 0, 'each step reads its own chunks');
});

test('⑤ a read ahead that fails is not the answer\'s failure', async () => {
  /* every Range read of the CShapes archive fails while the door is reading AHEAD of 1902 — i.e. after the
     answer for 1902 — and succeeds again once the reader asks for 1903 itself */
  let phase = 'walk';
  const FW = reader({ fail: (url) => phase === 'ahead' && /cshapes/.test(url) });
  const D = door(FW, { speculate: true });
  const h = await D.open({ file: CS.file, global: CS.global });
  await h.at(t615(1900), CS.end); await settle(D);
  await h.at(t615(1901), CS.end); await settle(D);
  phase = 'ahead';
  const ix2 = await h.at(t615(1902), CS.end);
  await settle(D);
  assert.ok(FW.log.some((x) => x.failed), 'the read ahead was made and failed');
  phase = 'walk';
  const ix3 = await h.at(t615(1903), CS.end);
  assert.equal(D.mode(CS.global), 'tiled', 'the door did not fall back to the whole file');
  assert.equal(D.counts().fellBack, 0);
  const ref = door(reader());
  const r = await ref.open({ file: CS.file, global: CS.global });
  assert.equal(J(ix3), J(await r.at(t615(1903), CS.end)));
  assert.ok(ix2.length > 0);
});

test('⑥ the same on a real second thread', async () => {
  const off = door(reader(), { speculate: false, spawn: () => null });
  const src = off.workerSource();
  const FW = reader();
  const D = door(FW, { speculate: true, spawn: nodeSpawn(src) });
  const h = await D.open({ file: CS.file, global: CS.global });
  const hr = await off.open({ file: CS.file, global: CS.global });
  for (const y of [1910, 1911, 1912]) {
    const n0 = FW.log.length;
    const ix = await h.at(t615(y), CS.end);
    if (y === 1912) assert.equal(FW.log.length - n0, 0, '1912 was read ahead on the thread');
    assert.equal(J(ix), J(await hr.at(t615(y), CS.end)));
    assert.equal(J(held(h.data)), J(held(hr.data)), `${y}: the page holds the same rows`);
    await settle(D);
  }
  assert.ok(D.counts().worker > 0 && D.counts().prefetchChunks > 0);
});

test('⑦ `warm` reads the instant into the thread only: the page holds nothing new, and the question after it reads nothing', async () => {
  const FW = reader();
  const D = door(FW, { speculate: false });
  const h = await D.open({ file: A1.file, global: A1.global, gaps: A1.gaps });
  await h.at(t615(1750), A1.end); await settle(D);
  const before = J(held(h.data)), rings = heldRings(h.data), n0 = FW.log.length;
  await h.warm(t615(1900), A1.end);
  assert.ok(FW.log.length > n0, 'warm read the chunks 1900 needs');
  assert.equal(J(held(h.data)), before, 'warm put rows on the page before anybody asked for 1900');
  assert.equal(heldRings(h.data), rings, 'warm put rings on the page before anybody asked for 1900');
  const n1 = FW.log.length;
  const ix = await h.at(t615(1900), A1.end);
  assert.equal(FW.log.length, n1, 'the question after warm read again');
  const ref = door(reader());
  const r = await ref.open({ file: A1.file, global: A1.global, gaps: A1.gaps });
  assert.equal(J(ix), J(await r.at(t615(1900), A1.end)));
  assert.equal(J(ix.map((i) => h.data.feats[i])), J(ix.map((i) => r.data.feats[i])), 'the rows of 1900 differ after warm');
});

test('⑦′ a warm read that fails is not the answer\'s failure', async () => {
  let failing = true;
  const FW = reader({ fail: (url) => failing && /hist-admin1\.jsonl/.test(url) });
  const D = door(FW, { speculate: false });
  const h = await D.open({ file: A1.file, global: A1.global, gaps: A1.gaps });
  const w = h.warm(t615(1880), A1.end);
  failing = false;
  const ix = await h.at(t615(1880), A1.end);   /* asked while the warm reads are in flight or failed */
  await w;
  assert.equal(D.mode(A1.global), 'tiled');
  assert.equal(D.counts().fellBack, 0);
  const ref = door(reader());
  const r = await ref.open({ file: A1.file, global: A1.global, gaps: A1.gaps });
  assert.equal(J(ix), J(await r.at(t615(1880), A1.end)));
});
