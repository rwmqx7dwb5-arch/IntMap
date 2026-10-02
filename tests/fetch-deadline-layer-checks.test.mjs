/* ============================================================================
 *  fetch-deadline-layer — the shared reads end, say why, and cannot drift apart
 * ----------------------------------------------------------------------------
 *  ① js/wx-source.js guardedJSON — the one Open-Meteo client, 15 call sites and Atlas's _fetchJSON —
 *     read with a bare `fetch` and shared the promise through `inflight[url]`. One stalled read was
 *     therefore every caller of that URL waiting for the session. The SHIPPED file is evaluated
 *     (tests/helpers/load-wx-source.mjs, with the real js/fetch-deadline.js in its scope and the real
 *     clockFor) against a host that never answers and a mocked clock:
 *       · at the host's deadline every waiter gets null, the note says 'timeout', the entry is gone,
 *         and the next call starts a new read — before the deadline nothing has ended;
 *       · callers of one URL still share one read;
 *       · a caller's signal ends THAT caller's wait ('aborted'), leaves another caller's read alone,
 *         and aborts the shared read only when nobody is left waiting on it.
 *  ② the failure is named: 'http' (with the status), 'refused' (a 2xx carrying `error: true`),
 *     'parse', 'network' — and the null a caller that passes no note receives is unchanged.
 *  ③ js/fetch-deadline.js puts the reason on what it throws — 'timeout' / 'aborted' / 'network' /
 *     'http' / 'parse' — so every caller of the clock can tell them apart.
 *  ④ the cable and radar thumbnails read through the rows' OWN functions: js/layer-previews.js holds
 *     no read of those sources and calls layerReads.subcables / .radarIndex, which js/data-layers.js
 *     fills with fetchSubcables / rvFetch — the ladder whose order (relay first) the copy had reversed.
 *  ⑤ the ledger (scripts/fetch-deadlines.mjs, run by check:static) agrees with the tree, and goes
 *     red when a bare fetch is added to a real file, and when one is removed and the ledger is not
 *     lowered.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as acorn from 'acorn';
import { loadWxSource } from './helpers/load-wx-source.mjs';
import { clockFor } from '../js/proxy-fetch.js';
import { jsonWithin, readWithin } from '../js/fetch-deadline.js';
import { check, bareFetches, LEDGER } from '../scripts/fetch-deadlines.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
/* The clock in js/fetch-deadline.js is a chain of steps (it counts the host's silence, not the page's own
   freezes), and node's mock timers do not run a timer scheduled from inside the same tick() — so time is
   advanced one millisecond at a time, which is also how it passes in a browser. */
const advance = (t, ms) => { for (let left = ms; left > 0; left -= 1) t.mock.timers.tick(1); };
const URL_OM = 'https://api.open-meteo.com/v1/forecast?latitude=35.680&longitude=139.760&current=temperature_2m';

/* a host that accepts the connection and never answers — it ends only when the caller aborts */
function stalledHost() {
  const calls = [];
  const fetch = (url, opt) => {
    const call = { url, signal: opt && opt.signal, answer: null };
    calls.push(call);
    return new Promise((res, rej) => {
      call.answer = (status, body) => res({
        ok: status >= 200 && status < 300, status,
        headers: { get: () => 'application/json' },
        text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
      });
      if (call.signal) call.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
  };
  return { fetch, calls };
}
const answering = (status, body) => () => Promise.resolve({
  ok: status >= 200 && status < 300, status,
  headers: { get: () => 'application/json' },
  text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
});

test('① a stalled shared read ends at the host\'s deadline for every waiter, leaves the table, and the next call reads again', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const host = stalledHost();
  const Wx = loadWxSource(host.fetch);
  const ms = clockFor(URL_OM);
  assert.ok(Number.isFinite(ms) && ms > 0, 'clockFor gives Open-Meteo no deadline');

  const n1 = {}, n2 = {};
  const a = Wx.guardedJSON(URL_OM, 0, { note: n1 });
  const b = Wx.guardedJSON(URL_OM, 0, { note: n2 });
  await settle();
  assert.equal(host.calls.length, 1, 'two callers of one URL started two reads — the coalescing is gone');
  assert.ok(host.calls[0].signal, 'the read carries no signal — nothing can end it');

  let ended = false; a.then(() => { ended = true; });
  advance(t, ms - 1);
  await settle();
  assert.equal(ended, false, 'the read ended before its deadline');

  advance(t, 1);
  await settle();
  assert.equal(host.calls[0].signal.aborted, true, 'the deadline passed and the read was not aborted');
  assert.equal(await a, null);
  assert.equal(await b, null, 'the second waiter was left on the dead read');
  assert.equal(n1.reason, 'timeout', 'the note does not say the host stopped answering');
  assert.equal(n2.reason, 'timeout');

  Wx.guardedJSON(URL_OM, 0);
  await settle();
  assert.equal(host.calls.length, 2, 'the next call was handed the dead read instead of starting a new one');
  assert.equal(Wx.status().down, false, 'a stall tripped the day-long breaker — it is not a statement about the day');
});

test('① (cont.) a caller\'s signal ends its own wait, spares the others, and aborts the read only when nobody is left', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const host = stalledHost();
  const Wx = loadWxSource(host.fetch);

  /* two waiters, one leaves */
  const stop = new AbortController();
  const nA = {}, nB = {};
  const a = Wx.guardedJSON(URL_OM, 0, { signal: stop.signal, note: nA });
  const b = Wx.guardedJSON(URL_OM, 0, { note: nB });
  await settle();
  stop.abort();
  assert.equal(await a, null);
  assert.equal(nA.reason, 'aborted', 'a Stop was reported as something the host did');
  assert.equal(host.calls[0].signal.aborted, false, 'one caller\'s Stop cancelled the read another caller is still waiting on');
  host.calls[0].answer(200, { current: { temperature_2m: 21.5 } });
  const got = await b;
  assert.equal(got && got.current.temperature_2m, 21.5, 'the caller that stayed did not receive the answer');
  assert.equal(nB.reason, 'ok');

  /* the only waiter leaves: the read is abandoned and the next caller starts afresh */
  const U2 = URL_OM + '&x=2';
  const stop2 = new AbortController();
  const c = Wx.guardedJSON(U2, 0, { signal: stop2.signal });
  await settle();
  stop2.abort();
  assert.equal(await c, null);
  await settle();
  assert.equal(host.calls[1].signal.aborted, true, 'nobody was waiting and the read went on');
  Wx.guardedJSON(U2, 0);
  await settle();
  assert.equal(host.calls.length, 3, 'a caller after an abandoned read joined it instead of starting a new one');

  /* an already-aborted signal asks nothing */
  const gone = new AbortController(); gone.abort();
  const n3 = {};
  assert.equal(await Wx.guardedJSON(URL_OM + '&x=3', 0, { signal: gone.signal, note: n3 }), null);
  assert.equal(n3.reason, 'aborted');
  assert.equal(host.calls.length, 3, 'a caller that had already stopped still sent a request');
});

test('② every null says which nothing it is — and a caller passing no note sees exactly what it did before', async () => {
  const cases = [
    [answering(500, { error: true, reason: 'boom' }), 'http', 500],
    [answering(200, { error: true, reason: 'Parameter is invalid' }), 'refused', 200],
    [answering(200, '<html>not json'), 'parse', 200],
    [() => Promise.reject(new TypeError('Failed to fetch')), 'network', 0],
  ];
  for (const [f, reason, status] of cases) {
    const Wx = loadWxSource(f);
    const note = {};
    assert.equal(await Wx.guardedJSON(URL_OM, 0, { note }), null, reason + ': a failure returned something other than null');
    assert.equal(note.reason, reason);
    assert.equal(note.status, status);
    assert.equal(await Wx.guardedJSON(URL_OM + '&plain=1', 0), null, reason + ': the two-argument call changed its answer');
  }
  const Wx = loadWxSource(answering(200, { current: { temperature_2m: 3 } }));
  const n1 = {}, n2 = {};
  await Wx.guardedJSON(URL_OM, 60000, { note: n1 });
  await Wx.guardedJSON(URL_OM, 60000, { note: n2 });
  assert.equal(n1.reason, 'ok'); assert.equal(n1.cached, false);
  assert.equal(n2.reason, 'ok'); assert.equal(n2.cached, true, 'a cache hit is reported as a read');
});

test('③ the clock names what it throws: timeout, aborted, network, http, parse', async (t) => {
  const real = globalThis.fetch;
  t.after(() => { globalThis.fetch = real; });
  const reasonOf = async (p) => { try { await p; return 'resolved'; } catch (e) { return e && e.reason; } };

  globalThis.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
  assert.equal(await reasonOf(readWithin('https://x.invalid/', 1000)), 'network');
  globalThis.fetch = answering(503, 'down');
  const h = await jsonWithin('https://x.invalid/', 1000).catch((e) => e);
  assert.equal(h.reason, 'http'); assert.equal(h.status, 503);
  globalThis.fetch = answering(200, '{nope');
  assert.equal(await reasonOf(jsonWithin('https://x.invalid/', 1000)), 'parse');

  const host = stalledHost();
  globalThis.fetch = host.fetch;
  const stop = new AbortController();
  const p = readWithin('https://x.invalid/', 60000, { signal: stop.signal });
  stop.abort();
  const e = await p.catch((x) => x);
  assert.equal(e.reason, 'aborted', 'the caller\'s Stop was named as the host\'s failure');
  assert.equal(e.name, 'AbortError', 'the platform\'s error was replaced — a caller testing e.name no longer sees it');

  t.mock.timers.enable({ apis: ['setTimeout'] });
  const q = readWithin('https://x.invalid/', 500);
  advance(t, 500);
  assert.equal(await reasonOf(q), 'timeout');
});

/* ── ④ the thumbnails have no read of their own ─────────────────────────────────────────────────── */
const parse = (src) => acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
const walk = (n, f) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach((c) => walk(c, f)); return; } f(n); for (const k of Object.keys(n)) if (!['type', 'start', 'end', 'loc'].includes(k)) walk(n[k], f); };
const member = (n, obj, prop) => n.type === 'MemberExpression' && !n.computed && n.object.type === 'Identifier' && n.object.name === obj && n.property.name === prop;
const READERS = new Set(['fetch', 'readWithin', 'jsonWithin', 'fetchViaProxy']);

test('④ the cable and radar thumbnails call the rows\' own reads, and hold no read of those sources', () => {
  const LP = read('js/layer-previews.js');
  const lp = parse(LP);
  let imported = false;
  walk(lp, (n) => { if (n.type === 'ImportDeclaration' && n.source.value === './data-layers.js' && n.specifiers.some((s) => s.imported && s.imported.name === 'layerReads')) imported = true; });
  assert.ok(imported, 'js/layer-previews.js does not import layerReads from js/data-layers.js');

  /* the REAL painter for the cable row (REAL = the thumbnails drawn from live data; PAINT holds the offline sketch), and radarURL */
  const units = {};
  walk(lp, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.name === 'REAL' && n.init && n.init.type === 'ObjectExpression') {
      const p = n.init.properties.find((q) => q.type === 'Property' && (q.key.value || q.key.name) === 'dl-subcables');
      if (p) units.cables = p.value;
    }
    if (n.type === 'FunctionDeclaration' && n.id.name === 'radarURL') units.radar = n;
  });
  for (const [k, prop] of [['cables', 'subcables'], ['radar', 'radarIndex']]) {
    assert.ok(units[k], `the ${k} thumbnail was not found`);
    let calls = false; const own = [];
    walk(units[k], (n) => {
      if (member(n, 'layerReads', prop)) calls = true;
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && READERS.has(n.callee.name)) own.push(n.callee.name + '@' + n.loc.start.line);
    });
    assert.ok(calls, `the ${k} thumbnail does not call layerReads.${prop}`);
    assert.deepEqual(own, [], `the ${k} thumbnail reads the network itself`);
  }
  assert.doesNotMatch(LP, /submarinecablemap\.com|api\.rainviewer\.com\/public\/weather-maps/,
    'js/layer-previews.js still names a source the row owns — a second copy of how the layer gets its data');

  /* …and the rows fill those names with their own functions. (layer-packages) The two rows are layer packages
     now: js/data-layers.js exports the object, and the package that implements each row (js/layer-pkg-*.js, its
     declaration's `pkg`) assigns its function there — before that, js/data-layers.js forwards to the package */
  const filled = {};
  let exported = false;
  for (const f of ['js/data-layers.js', 'js/layer-pkg-subcables.js', 'js/layer-pkg-radar.js']) walk(parse(read(f)), (n) => {
    if (n.type === 'ExportNamedDeclaration' && n.declaration && n.declaration.declarations && n.declaration.declarations.some((d) => d.id.name === 'layerReads')) exported = true;
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.object.name === 'layerReads' && n.right.type === 'Identifier') filled[n.left.property.name] = n.right.name;
  });
  assert.ok(exported, 'js/data-layers.js does not export layerReads');
  assert.equal(filled.subcables, 'fetchSubcables', 'the cable thumbnail is not handed the row\'s own ladder');
  assert.equal(filled.radarIndex, 'rvFetch', 'the radar thumbnail is not handed the row\'s own frame-index read');
});

/* ── ⑤ the ledger ─────────────────────────────────────────────────────────────────────────────── */
test('⑤ the unbounded-fetch ledger agrees with the tree', () => {
  const r = check();
  assert.deepEqual(r.lines, [], r.lines.join('\n'));
  const L = JSON.parse(readFileSync(LEDGER, 'utf8'));
  assert.equal(L.total, Object.values(L.files).reduce((a, b) => a + b, 0), 'the ledger\'s total is not the sum of its files');
  assert.equal(r.total, L.total);
  assert.equal(r.files['js/wx-source.js'] || 0, 0, 'the shared weather client has a read with no end again');
});

test('⑤ (cont.) what counts as bounded is read from the call, not from a list', () => {
  const src = [
    "fetch('a');",                                                   /* bare */
    "window.fetch('b', { cache: 'no-store' });",                     /* bare — options but no signal */
    "fetch('c', { signal: AbortSignal.timeout(5000) });",
    "function f(u, init){ const opt = Object.assign({}, init); opt.signal = c.signal; return fetch(u, opt); }",
    "function g(u, s){ return fetch(u, Object.assign({ cache: 'no-store' }, { signal: s })); }",
    "x.fetch('d');",                                                 /* somebody's method, not the global */
  ].join('\n');
  assert.deepEqual(bareFetches(src, 't.js').map((b) => b.arg), ["'a'", "'b'"]);
});

test('⑤ (cont.) the gate goes red when a bare fetch is added to a real file, and when the ledger is not lowered', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fetch-ledger-'));
  try {
    mkdirSync(join(dir, 'js'));
    const real = read('js/wx-source.js');
    const ledger = join(dir, 'ledger.json');
    writeFileSync(join(dir, 'js', 'wx-source.js'), real);
    writeFileSync(ledger, JSON.stringify({ files: {} }));
    assert.equal(check(dir, ledger).ok, true, 'the shipped file does not agree with an empty ledger');

    /* the mutation: the defect this round removed, put back */
    writeFileSync(join(dir, 'js', 'wx-source.js'), real.replace('fl.p = readWithin(url, clockFor(url), init, { idle: true })', "fl.p = fetch(url, { cache: 'no-store' }).then(function (r) { return r.text().then(function (text) { return { ok: r.ok, status: r.status, text: text }; }); })"));
    const red = check(dir, ledger);
    assert.equal(red.ok, false, 'a bare fetch was added and the ledger did not notice');
    assert.match(red.lines.join('\n'), /js\/wx-source\.js: 1 fetch\(\) call\(s\) with no signal, ledger allows 0/);

    /* …and a ledger that still counts a read that is gone is a ledger that asserts nothing */
    writeFileSync(join(dir, 'js', 'wx-source.js'), real);
    writeFileSync(ledger, JSON.stringify({ files: { 'js/wx-source.js': 1 } }));
    const stale = check(dir, ledger);
    assert.equal(stale.ok, false);
    assert.match(stale.lines.join('\n'), /lower the ledger/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ── ⑥ the clock counts the host's silence, not this page's own freeze ─────────────────────────────
   Measured on the nightly deep tier (tests/restored-layer-before-style.spec.js): a tab restoring
   many layers froze its main thread for seconds while RainViewer had already answered in < 3 s; the
   single setTimeout(6000) fired the moment the thread came back, before the reply queued behind it,
   and the radar row was switched off as 「the host did not answer」. Here the host answers at 150 ms,
   the deadline is 100 ms, and the page freezes for 400 ms right after asking: the reply must win.
   A host that really stays silent must still end at the deadline. */
test('⑥ a freeze of the page is not charged to the host; real silence still ends at the deadline', async (t) => {
  const real = globalThis.fetch;
  t.after(() => { globalThis.fetch = real; });
  globalThis.fetch = (u, init) => new Promise((resolve, reject) => {
    const id = setTimeout(() => resolve({ ok: true, status: 200, headers: { get: () => 'application/json' }, text: () => Promise.resolve('{"v":1}') }), 150);
    init && init.signal && init.signal.addEventListener('abort', () => { clearTimeout(id); const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
  });
  const p = jsonWithin('https://x.invalid/frozen', 100);
  const until = Date.now() + 400; while (Date.now() < until) { /* the page is frozen */ }
  assert.deepEqual(await p, { v: 1 }, 'the page\'s own freeze was reported as the host\'s silence');

  globalThis.fetch = (u, init) => new Promise((resolve, reject) => {
    init && init.signal && init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
  });
  const t0 = Date.now();
  const e = await readWithin('https://x.invalid/silent', 200).catch((x) => x);
  assert.equal(e && e.reason, 'timeout', 'a host that never answers was not ended');
  assert.ok(Date.now() - t0 < 2000, 'a silent host was waited on far past its deadline');
});
