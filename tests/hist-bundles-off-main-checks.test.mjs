/* ============================================================================
 *  hist-bundles-off-main — the historical records are asked on another thread, and the page
 *  receives what one instant draws  (js/hist-bundles.js)
 * ----------------------------------------------------------------------------
 *  Before: js/time-borders.js, js/time-admin1.js and js/war-layer.js each injected a ring-pooled
 *  record (data/cshapes.js, data/hist-borders.js, data/hist-eras.js, data/hist-admin1.js,
 *  data/hist-admin2.js, data/hist-admin3.js and the gap records) as a <script> tag, so the first
 *  travel evaluated 13-41 MB of object literal on the thread that paints. The measurement is in
 *  dev-notes/2026-09-30-hist-bundles-off-main.md.
 *
 *  What is held here, and how:
 *    ① the door answers «which records are in force on this day» exactly as the rule says, for every
 *       record, on the days the history gates name — compared with the rule RESTATED over the whole
 *       shipped file, not with the job's own arithmetic read back to itself;
 *    ② the change dates (the epoch index) are every start and every end (or day after an inclusive
 *       end), in range;
 *    ③ the page's copy is the bundle's own rows and rings, each ring sent ONCE and kept by identity,
 *       and on the Worker path in slices no larger than the stated SLICE_POINTS;
 *    ④ the gap records are spliced where the record is, with the columns js/time-admin1.js and
 *       js/border-coast.js read, and the page's view of each gap record is that record by its own
 *       indices;
 *    ⑤ an era sheet arrives whole;
 *    ⑥⑦ THE MODULES DRAW THE SAME THING THROUGH THE DOOR AS FROM A WHOLE BUNDLE: js/time-borders.js
 *       and js/time-admin1.js are run twice — once over bundles published whole on `window` (what the
 *       page had before), once opening them through the door as the page does now — and every source
 *       they write (polygons, border runs, labels, the gap line) must be identical, year by year;
 *    ⑧ no page file injects a ring-pooled record as a <script> any more, and each is opened through
 *       the door (the records are DISCOVERED from data/border-coast.js's own registry of pools).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync, openSync, readSync, closeSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker as NodeWorker } from 'node:worker_threads';
/* (module-graph) this file's own clock. The imported-module harness (scripts/histeras/time-borders.mjs,
   ⑥) installs the BROWSER it runs in on globalThis — inert timers included — and those globals stay for
   the rest of the file, so ⑦'s waits and its pages' timers are the process's real ones, by name. */
import { setTimeout as realSetTimeout, clearTimeout as realClearTimeout } from 'node:timers';
import { timeBorders } from '../scripts/histeras/time-borders.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { asClassicScript } from './app-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
/* the years the history gates and the task name (historical-verification.md §2: name the years) */
const YEARS = [-200, 1000, 1600, 1871, 1900, 1918, 1945, 2000];

/* ── the shipped files, read the way a browser evaluates them (independent of the door's parse) ── */
const _bundles = new Map();
function bundle(file) {
  if (_bundles.has(file)) return _bundles.get(file);
  const w = {};
  new Function('window', rd('data/' + file))(w);   /* this realm, so its arrays compare with ours */
  const d = Object.values(w)[0];
  _bundles.set(file, d);
  return d;
}
/* a fetch that serves the repository's own data/ files */
const serve = async (url) => {
  const m = /(data\/[^?#]+)/.exec(String(url));
  try { return new Response(readFileSync(join(ROOT, m[1])), { status: 200 }); } catch (_) { return new Response('no', { status: 404 }); }
};
/* the app's clocked reader (js/fetch-deadline.js readWithin, reached through window.IntMapFetchWithin),
   serving the repository's own files — the door reads every record's bytes through it */
const FW = { clockFor: () => 60000, readWithin: async (u) => { const r = await serve(u); return { ok: r.ok, status: r.status, bytes: await r.arrayBuffer() }; } };
/* one door, answering on this thread (no Worker in a vm context) or on a real second thread */
function door({ spawn } = {}) {
  const w = {};
  vm.runInNewContext(rd('js/hist-bundles.js'), { window: w, Response, TextDecoder, console });
  return w.IntMapHistBundles.make({ win: {}, spawn, fetchWithin: FW });
}
function nodeSpawn(src, parts) {
  return () => {
    const shim = 'const { parentPort, workerData } = require("node:worker_threads");\n' +
      'const fs = require("node:fs"), path = require("node:path");\n' +
      'globalThis.fetch = async (u) => { const m = /(data\\/[^?#]+)/.exec(String(u)); try { return new Response(fs.readFileSync(path.join(workerData, m[1])), { status: 200 }); } catch (_) { return new Response("no", { status: 404 }); } };\n' +
      'const self = { postMessage: (m, t) => parentPort.postMessage(m, t) };\n' +
      'parentPort.on("message", (data) => self.onmessage({ data }));\n';
    const nw = new NodeWorker(shim + src, { eval: true, workerData: ROOT });
    const it = { onmessage: null, onerror: null, onmessageerror: null,
      postMessage: (m) => nw.postMessage(m), terminate: () => nw.terminate() };
    nw.on('message', (data) => { if (data && data.part && parts) parts.push(data.part); if (it.onmessage) it.onmessage({ data }); });
    nw.on('error', (e) => it.onerror && it.onerror(e));
    nw.unref();
    return it;
  };
}
/* the OLD splice of js/time-admin1.js (before this change), restated: gap rows appended with their
   ring indices shifted, column 10 null, column 11 their own index, column 12 which gap record */
function oldSplice(base, gaps) {
  const d = Object.assign({}, base, { rings: base.rings.slice(), feats: base.feats.slice() });
  gaps.forEach((X, gi) => {
    const off = d.rings.length;
    for (const r of X.rings) d.rings.push(r);
    X.feats.forEach((f, k) => d.feats.push([f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7],
      f[8].map((p) => p.map((ri) => ri + off)), f[9], null, k, gi]));
    d.gapSrcs = (d.gapSrcs || []).concat(X.src ? [X.src] : []);
    d.gapSrc = d.gapSrcs.join(' · ') || null;
  });
  return d;
}
/* the rule, restated: in force on t — start <= t, and t <= end (inclusive) or t < end (exclusive) */
const inForce = (d, t, end) => d.feats.map((f, i) => [f, i])
  .filter(([f]) => ymd(f[2], f[3], f[4]) <= t && (end === 'inclusive' ? ymd(f[5], f[6], f[7]) >= t : ymd(f[5], f[6], f[7]) > t))
  .map(([, i]) => i);
const GAPS = [{ file: 'data/hist-kuni.js', global: '__HISTKUNI' }, { file: 'data/hist-admin-fill.js', global: '__HISTADMFILL' }];
const RECORDS = [
  { file: 'cshapes.js', global: '__CSHAPES', end: 'inclusive' },
  { file: 'hist-borders.js', global: '__HISTB', end: 'exclusive' },
  { file: 'hist-admin1.js', global: '__HISTADM1', end: 'exclusive', gaps: GAPS },
];
const full = (r) => (r.gaps ? oldSplice(bundle(r.file), r.gaps.map((g) => bundle(g.file.slice(5)))) : bundle(r.file));
const plain = (x) => JSON.parse(JSON.stringify(x));

test('hist-bundles-off-main ①③: the records in force are the rule\'s, and the page receives exactly those rows and rings', async () => {
  const D = door();
  for (const r of RECORDS) {
    const F = full(r);
    const h = await D.open({ file: 'data/' + r.file, global: r.global, gaps: r.gaps });
    assert.ok(h, r.file + ' did not open');
    assert.equal(h.data.feats.length, F.feats.length, r.file + ': the mirror is not the record\'s length');
    assert.equal(h.data.rings.length, F.rings.length);
    for (const y of YEARS) for (const [m, dd] of [[6, 15], [1, 1]]) {
      const t = ymd(y, m, dd);
      const got = await h.at(t, r.end);
      assert.deepEqual([...got], inForce(F, t, r.end), `${r.file} ${y}-${m}-${dd}: the door's answer is not the rule's`);
      for (const i of got) {
        assert.deepEqual(plain(h.data.feats[i]), plain(F.feats[i]), `${r.file} row ${i} is not the record's row`);
        for (const p of h.data.feats[i][8]) for (const ri of p) assert.deepEqual(plain(h.data.rings[ri]), F.rings[ri], `${r.file} ring ${ri}`);
        if (F.dates && h.data.feats[i][10] != null) assert.deepEqual(plain(h.data.dates[h.data.feats[i][10]]), F.dates[h.data.feats[i][10]]);
      }
    }
    /* ⚠ THE PAGE HOLDS WHAT WAS DRAWN, NOT THE RECORD */
    const held = h.data.rings.filter((x) => x !== undefined).length;
    assert.ok(held < F.rings.length, `${r.file}: the page holds every ring (${held}) — the whole bundle crossed`);
  }
});

test('hist-bundles-off-main ②: the change dates are every edge of every record, in range', async () => {
  const D = door();
  for (const r of RECORDS) {
    const F = full(r);
    const h = await D.open({ file: 'data/' + r.file, global: r.global, gaps: r.gaps });
    const lo = ymd(1500, 1, 1), hi = ymd(2019, 12, 31), want = new Set();
    for (const f of F.feats) {
      want.add(ymd(f[2], f[3], f[4]));
      if (r.end === 'inclusive') { const t = new Date(0); t.setUTCFullYear(f[5], f[6] - 1, f[7]); t.setUTCDate(t.getUTCDate() + 1); want.add(ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())); }
      else want.add(ymd(f[5], f[6], f[7]));
    }
    assert.deepEqual([...await h.edges(r.end, lo, hi)], [...want].filter((k) => k >= lo && k <= hi).sort((a, b) => a - b), r.file);
  }
});

test('hist-bundles-off-main ③: on a real second thread — same answer, each ring once, kept by identity, sent in slices', async () => {
  const parts = [];
  const W = door({ spawn: nodeSpawn(door().workerSource(), parts) });
  const P = door();
  const hw = await W.open({ file: 'data/cshapes.js', global: '__CSHAPES' });
  const hp = await P.open({ file: 'data/cshapes.js', global: '__CSHAPES' });
  assert.ok(W.counts().worker > 0 && W.counts().page === 0, 'the thread did not answer');
  const a = await hw.at(ymd(1900, 6, 15), 'inclusive');
  assert.deepEqual([...a], [...await hp.at(ymd(1900, 6, 15), 'inclusive')], 'the thread and the page disagree');
  for (const i of a) assert.deepEqual(hw.data.feats[i], plain(hp.data.feats[i]));
  const sent1 = parts.flatMap((p) => p.rings.map((x) => x[0]));
  assert.equal(new Set(sent1).size, sent1.length, 'a ring was sent twice in one answer');
  const cap = W.SLICE_POINTS;
  for (const p of parts) {
    const pts = p.rings.reduce((s, x) => s + x[1].length, 0);
    assert.ok(pts <= cap || p.rings.length === 1, `a slice carried ${pts} pairs in ${p.rings.length} rings — past the ${cap} it may, and not because one ring is larger`);
  }
  assert.ok(parts.length > 1, 'the first travel into 1900 arrived as one message — one long task on the page');
  const ringObj = hw.data.rings[hw.data.feats[a[0]][8][0][0]];
  parts.length = 0;
  const b = await hw.at(ymd(1901, 6, 15), 'inclusive');
  const sent2 = parts.flatMap((p) => p.rings.map((x) => x[0]));
  assert.deepEqual(sent2.filter((ri) => sent1.includes(ri)), [], 'a ring the page already holds was sent again');
  assert.ok(b.includes(a[0]), 'sanity: the first 1900 record is still in force in 1901');
  assert.equal(hw.data.rings[hw.data.feats[a[0]][8][0][0]], ringObj, 'the ring the page held was replaced — every geometry memo keyed on it is orphaned');
});

test('hist-bundles-off-main ④: the gap records are spliced where the record is, and the page sees each by its own indices', async () => {
  const D = door();
  const h = await D.open({ file: 'data/hist-admin1.js', global: '__HISTADM1', gaps: GAPS });
  const own = bundle('hist-admin1.js'), gaps = GAPS.map((g) => bundle(g.file.slice(5)));
  assert.equal(h.data.gapPools.length, 2);
  assert.equal(h.data.gapSrc, gaps.map((g) => g.src).join(' · '), 'the credit the gap line carries');
  let seen = 0;
  for (const y of [1000, 1600, 1871, 1990]) {
    for (const i of await h.at(ymd(y, 6, 15), 'exclusive')) {
      if (i < own.feats.length) continue;
      const row = h.data.feats[i], gi = row[12], k = row[11];
      assert.equal(row[10], null, 'a gap row claims a relation id');
      const g = h.data.gapPools[gi], X = gaps[gi];
      assert.deepEqual(plain(g.view.feats[k][8]), plain(X.feats[k][8]), 'the view does not address the gap record\'s own rings');
      for (const p of g.view.feats[k][8]) for (const ri of p) {
        assert.deepEqual(plain(g.view.rings[ri]), X.rings[ri]);
        assert.deepEqual(plain(D.ringOrigin(g.view.rings[ri])), [GAPS[gi].global, ri, X.rings.length], 'the ring does not say which record marks it');
      }
      assert.equal(D.globalOf(g.view), GAPS[gi].global);
      seen++;
    }
  }
  assert.ok(seen > 10, 'only ' + seen + ' gap rows were in force on the four dates — the check is not seeing the splice');
});

test('hist-bundles-off-main ⑤: an era sheet arrives whole, rings and all', async () => {
  const D = door(), E = bundle('hist-eras.js');
  const h = await D.open({ file: 'data/hist-eras.js', global: '__HISTERAS' });
  assert.deepEqual(plain(h.data.snaps.map((s) => s.y)), E.snaps.map((s) => s.y), 'the sheet years the page holds are not the record\'s');
  for (const s of E.snaps.filter((x, i) => i % 9 === 0)) {
    const got = await h.snap(s.y);
    assert.deepEqual(plain(got.feats), s.feats, 'sheet ' + s.key);
    assert.deepEqual(plain(got.blank), s.blank || []);
    for (const ids of [...s.feats.map((f) => f[2]), ...(s.blank || [])]) for (const p of ids) for (const ri of p) assert.deepEqual(plain(h.data.rings[ri]), E.rings[ri]);
  }
});

/* ═══ ⑥⑦ the modules, run both ways ════════════════════════════════════════════════════════════ */
const recordOf = (fc) => JSON.stringify(fc);

test('hist-bundles-off-main ⑥: js/time-borders.js draws the same collections through the door as from whole bundles', async () => {
  const whole = await timeBorders({ lang: 'en', fetch: serve });
  whole.window.__CSHAPES = bundle('cshapes.js'); whole.window.__HISTB = bundle('hist-borders.js'); whole.window.__HISTERAS = bundle('hist-eras.js');
  const door = await timeBorders({ lang: 'en', fetch: serve });
  /* (module-graph) the two pages are IMPORTED instances, and an ES module reads the one process-global
     `window` — so each page is driven with ITS window installed as the page's (otherwise both would read
     the last one installed, and «whole» would silently go through the door too). js/border-coast.js is
     the real module now (one per process, imported by js/time-borders.js): both pages hold the shipped
     marks, as the page does once data/border-coast.js has loaded, so neither waits on a <script> tag
     this context never fires. */
  for (const page of [whole, door]) page.window.__IMBCOAST = bundle('border-coast.js');
  const on = (page) => { globalThis.window = page.window; return page.api; };
  for (const y of YEARS) {
    await on(whole)._go(y); await on(door)._go(y);
    assert.equal(String(door.api.current()), String(whole.api.current()), y + ': a different record/epoch answered');
    const a = whole.api.currentFC(), b = door.api.currentFC();
    assert.ok(a && a.features.length > 0, y + ': nothing was drawn from the whole bundles');
    assert.equal(recordOf(b), recordOf(a), y + ': the collection drawn through the door differs');
  }
  /* the stepper's dates, which walk every record, are the same list */
  const doorDates = [...(await on(door).changeDates())].map((d) => d.toISOString());
  const wholeDates = [...(await on(whole).changeDates())].map((d) => d.toISOString());
  assert.deepEqual(doorDates, wholeDates);
});

function adminHarness({ publish }) {
  const sources = new Map(), layers = new Map();
  const L = {
    hasSource: (id) => sources.has(id), addSource: (id, s) => sources.set(id, s.data),
    setSourceData: (id, d) => { if (sources.has(id)) sources.set(id, d); },
    has: (id) => layers.has(id), add: (spec) => layers.set(spec.id, spec), setLayout: () => {}, setFilter: () => {},
  };
  const GE = { hasRenderer: () => true, ready: () => true, whenCanDraw: () => new Promise(() => {}), layers: L,
    events: { on: () => {}, once: () => {}, off: () => {} }, camera: { getZoom: () => 3, getBounds: () => null },
    coords: { queryRenderedFeatures: () => [] } };
  const win = { IntMapGeoEngine: GE, addEventListener: () => {},
    IntMapTime: { on: () => {}, onIntent: () => {}, min: 1 },
    IntMapLang: { pickArgs: () => ((...a) => a), pick: () => ({ arr: (a) => a[0] }), htmlTag: () => 'en' },
    IntMapMemBudget: { maySpeculate: () => false } };
  win.window = win;
  win.IntMapFetchWithin = FW;
  const ctx = vm.createContext({ window: win, console, navigator: {}, fetch: serve, Response, TextDecoder,
    document: { getElementById: () => ({ checked: true, closest: () => null }), createElement: () => ({ style: {} }), head: { appendChild: () => {} } },
    setTimeout: (f, ms) => { const t = realSetTimeout(f, ms); if (t.unref) t.unref(); return t; }, clearTimeout: realClearTimeout });
  /* (module-graph) ⚠ STILL A vm CONTEXT, ON PURPOSE: this check runs TWO pages side by side (the whole
     bundles and the door) whose async work interleaves, and each page needs its own `window`. An ES
     module reads the one process global, so two imported instances would read each other's records.
     js/border-coast.js and js/time-admin1.js are modules now; `asClassicScript` drops their import/export
     lines and binds each imported name to what THIS page's window holds under it — js/time-admin1.js's
     IntMapBorderCoast is the instance evaluated here (in a scope of its own on the same page, since both
     files now declare that name at their top level), reading this page's marks. */
  for (const p of ['js/hist-scale.js', 'js/hist-bundles.js']) vm.runInContext(rd(p), ctx, { filename: p });
  const bc = vm.createContext({ window: win, document: ctx.document, console });
  vm.runInContext(asClassicScript(rd('js/border-coast.js')), bc, { filename: 'js/border-coast.js' });
  win.IntMapBorderCoast = bc.IntMapBorderCoast;
  win.__IMBCOAST = bundle('border-coast.js');
  if (publish) {
    win.__HISTADM1 = oldSplice(bundle('hist-admin1.js'), GAPS.map((g) => bundle(g.file.slice(5))));
    for (const g of GAPS) win[g.global] = bundle(g.file.slice(5));
  }
  vm.runInContext(asClassicScript(rd('js/time-admin1.js')), ctx, { filename: 'js/time-admin1.js' });
  const mod = ctx.timeAdmin1({ canDraw: () => true, lang: 'en', isMobile: () => true });   /* (module-graph) the exported factory */
  return { mod, sources, win, ctx };
}
async function adminAt(H, y) {
  const before = H.mod.current();
  H.mod._go(vm.runInContext(`(() => { const d = new Date(2000, 5, 15, 12); d.setFullYear(${y}); return d; })()`, H.ctx));
  for (let i = 0; i < 600; i++) { await new Promise((r) => realSetTimeout(r, 25)); if (H.mod.current() != null && H.mod.current() !== before) break; }
}

test('hist-bundles-off-main ⑦: js/time-admin1.js writes the same polygons, border runs and gap line through the door', async () => {
  const whole = adminHarness({ publish: true }), viaDoor = adminHarness({ publish: false });
  for (const y of YEARS) {
    await adminAt(whole, y); await adminAt(viaDoor, y);
    assert.equal(viaDoor.mod.current(), whole.mod.current(), y + ': a different epoch');
    for (const id of ['imta-src', 'imta-ln-src', 'imta-gap-src']) {
      const a = whole.sources.get(id), b = viaDoor.sources.get(id);
      assert.ok(a && a.features, y + ' ' + id + ': nothing written from the whole bundle');
      if (id === 'imta-src') assert.ok(a.features.length > 0, y + ': no subdivision in force');
      assert.equal(recordOf(b), recordOf(a), `${y} ${id}: what the door drew differs from what the whole bundle drew`);
    }
    assert.equal(viaDoor.mod.coverage().units, whole.mod.coverage().units);
  }
});

/* ═══ ⑧ the rule, as a fact about the tree ══════════════════════════════════════════════════════ */
test('hist-bundles-off-main ⑧: no page file injects a ring-pooled record; each is opened through the door', () => {
  /* the pools are DISCOVERED: data/border-coast.js marks every ring-pooled record and names the global
     its file assigns; the file is found by its first bytes */
  const pools = Object.values(bundle('border-coast.js').sets).map((s) => s.global);
  const head = (f) => { const fd = openSync(join(ROOT, 'data', f), 'r'); const b = Buffer.alloc(64); readSync(fd, b, 0, 64, 0); closeSync(fd); return b.toString('utf8'); };
  const files = new Map();
  for (const f of readdirSync(join(ROOT, 'data')).filter((x) => x.endsWith('.js'))) {
    const m = /^window\.(__[A-Z0-9_]+)\s*=/.exec(head(f));
    if (m && pools.includes(m[1])) files.set(m[1], 'data/' + f);
  }
  assert.ok(files.size >= 8, 'only ' + files.size + ' ring-pooled records found — the discovery is not seeing them');
  const js = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js') && f !== 'hist-bundles.js')
    .map((f) => ({ f, s: codeOnly(rd('js/' + f)) }));
  for (const [global, file] of files) {
    const users = js.filter(({ s }) => s.includes("'" + file + "'"));
    assert.ok(users.length, file + ' is not read by any page file');
    for (const { f, s } of users) {
      for (let at = s.indexOf("'" + file + "'"); at >= 0; at = s.indexOf("'" + file + "'", at + 1)) {
        const near = s.slice(Math.max(0, at - 160), at);
        assert.ok(!/createElement\(\s*['"]script['"]\s*\)/.test(near), `js/${f} injects ${file} as a <script> — the main thread evaluates it`);
        assert.match(near, /file:\s*$/, `js/${f} names ${file} other than as the file of an open`);
      }
      assert.ok(!new RegExp('window\\.' + global + '\\s*=').test(s), `js/${f} publishes ${global} on window`);
    }
  }
  /* and the three readers open through the door */
  for (const f of ['time-borders.js', 'time-admin1.js', 'war-layer.js']) assert.match(rd('js/' + f), /IntMapHistBundles\.open\(|HB\(\)\.open\(/, 'js/' + f);
});
