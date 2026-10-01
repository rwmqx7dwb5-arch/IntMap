/* ============================================================================
 *  unobserved-is-not-refused — a read that ran out of time does not switch a row off
 * ----------------------------------------------------------------------------
 *  MEASURED (nightly deep tier, run 36493764477, tests/restored-layer-before-style.spec.js:127):
 *  「通常起動にはあり hold した起動には無いレイヤー = ["lyr-radar"]」. The RainViewer frame index timed out
 *  on a loaded runner and the radar row's failure arm — written for a refusal — toasted, unticked the
 *  box and never asked again. .agents/rules/one-pass-or-a-reason.md §5: 「could not observe」 is not
 *  「failed」.
 *
 *  ① js/fetch-deadline.js `isUnobserved` is the one reading of a failure: the clock running out is
 *     unobserved; a status, a network refusal, a bad body and the caller's own Stop are not.
 *     js/proxy-fetch.js's clock is not exported, so ① also reads that it tags with the same vocabulary.
 *  ② `untilObserved` — the policy — evaluated: an unobserved failure is retried with the clock doubled
 *     (each retry does something the last did not), paused by the failed attempt's clock, recorded
 *     through onWait; an observed failure is re-thrown at once with ONE read made; the last unobserved
 *     retry re-throws with `retries`; `wanted() === false` ends the wait as 'aborted'.
 *  ③ js/runtime.js `afterTick` fires once and leaves nothing on the timer register.
 *  ④ THE SHIPPED RADAR BRANCH of js/data-layers.js `toggleLayer`, with the shipped rowUntilObserved,
 *     rvFetch and rvRead (extracted with acorn, evaluated with the real jsonWithin / untilObserved /
 *     afterTick), against a stubbed fetch:
 *       · a host that does not answer in time → the box stays ticked, the row says aria-busy, the
 *         count is on the box, one 「still waiting」 toast, and a second read IS made with a longer
 *         clock; when it answers the layer is drawn and the busy mark is gone;
 *       · a host that answers 404 → exactly as before: the 「unavailable」 toast and the box unticked,
 *         after one read;
 *       · the reader unticks while the row waits → nothing is drawn, the box is not touched again.
 *  ⑤ every row in js/data-layers.js that goes through the policy is found from the source, not listed:
 *     each call of rowUntilObserved names a box, and no failure arm of those rows unticks on a throw
 *     it has not classified.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';
import { jsonWithin, readWithin, isUnobserved, untilObserved, UNOBSERVED_RETRIES } from '../js/fetch-deadline.js';
import { afterTick, tickKey, stopEarlyTimers } from '../js/runtime.js';
import { liftFunction } from './helpers/lift-function.mjs';
import { codeOnly as stripComments } from '../scripts/code-only.mjs';
import { readLF } from '../scripts/eol.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const timeoutError = () => Object.assign(new Error('deadline'), { reason: 'timeout' });

/* ── ① the classifier ─────────────────────────────────────────────────────────────────────────── */
test('① isUnobserved: the clock is unobserved; a status, a refusal, a bad body and a Stop are not', async (t) => {
  const real = globalThis.fetch;
  t.after(() => { globalThis.fetch = real; });
  const thrown = async (p) => { try { await p; return null; } catch (e) { return e; } };

  globalThis.fetch = (u, init) => new Promise((res, rej) => {
    init && init.signal && init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const slow = await thrown(readWithin('https://x.invalid/silent', 40));
  assert.equal(isUnobserved(slow), true, 'the deadline was not read as unobserved');

  const stop = new AbortController();
  const p = readWithin('https://x.invalid/stopped', 60000, { signal: stop.signal });
  stop.abort();
  assert.equal(isUnobserved(await thrown(p)), false, 'the caller\'s own Stop was read as the host being unobserved');

  globalThis.fetch = () => Promise.resolve({ ok: false, status: 404, headers: { get: () => 'text/plain' }, text: () => Promise.resolve('no') });
  assert.equal(isUnobserved(await thrown(jsonWithin('https://x.invalid/404', 1000))), false, 'a 404 is an answer');
  globalThis.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
  assert.equal(isUnobserved(await thrown(readWithin('https://x.invalid/refused', 1000))), false, 'a network refusal is an answer of the platform');
  globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, headers: { get: () => 'application/json' }, text: () => Promise.resolve('{nope') });
  assert.equal(isUnobserved(await thrown(jsonWithin('https://x.invalid/parse', 1000))), false, 'a body that is not JSON is an answer');
  assert.equal(isUnobserved(null), false);
  assert.equal(isUnobserved(new Error('untagged')), false, 'an error nobody classified is not silently promoted to 「retry」');

  /* js/proxy-fetch.js's clock tags what it throws with the same words (its function is private) */
  const PF = read('js/proxy-fetch.js');
  const body = PF.slice(PF.indexOf('const fetchDeadline ='), PF.indexOf('const NO_DATA ='));
  for (const w of ["'timeout'", "'aborted'", "'network'", "'http'"]) assert.ok(body.includes(w), `js/proxy-fetch.js fetchDeadline does not tag ${w}`);
});

/* ── ② the policy ─────────────────────────────────────────────────────────────────────────────── */
test('② untilObserved: unobserved → again with a longer clock and a record; observed → at once, one read', async () => {
  const waits = [], scales = [], rec = [];
  const wait = (ms) => { waits.push(ms); return Promise.resolve(); };

  let n = 0;
  const v = await untilObserved((s) => { scales.push(s); if (++n < 3) throw timeoutError(); return 'data'; },
    { base: 100, wait, onWait: (w) => rec.push([w.attempt, w.scale, w.delay]) });
  assert.equal(v, 'data');
  assert.deepEqual(scales, [1, 2, 4], 'a retry did not do something the last attempt did not (its clock)');
  assert.deepEqual(waits, [100, 200], 'the pause is the failed attempt\'s clock');
  assert.deepEqual(rec, [[1, 2, 100], [2, 4, 200]], 'the retries are not recorded');

  let reads = 0;
  const e404 = Object.assign(new Error('http 404'), { reason: 'http', status: 404 });
  const got = await untilObserved(() => { reads++; throw e404; }, { base: 100, wait }).catch((e) => e);
  assert.equal(got, e404, 'an observed failure was not handed back untouched');
  assert.equal(reads, 1, 'an observed failure was asked again — a retry that can only get the same answer');

  reads = 0;
  const last = await untilObserved(() => { reads++; throw timeoutError(); }, { base: 1, wait }).catch((e) => e);
  assert.equal(reads, UNOBSERVED_RETRIES + 1);
  assert.equal(last.reason, 'timeout'); assert.equal(last.retries, UNOBSERVED_RETRIES, 'the count is not on the final error');

  reads = 0;
  const off = await untilObserved(() => { reads++; throw timeoutError(); }, { base: 1, wait, wanted: () => false }).catch((e) => e);
  assert.equal(off.reason, 'aborted', 'a row that is no longer wanted was not ended as the caller\'s own stop');
  assert.equal(reads, 1, 'a row nobody wants any more was read again');
});

/* ── ③ the wheel's one-shot ───────────────────────────────────────────────────────────────────── */
test('③ afterTick fires once and leaves nothing armed', async () => {
  let fired = 0;
  await Promise.race([afterTick(tickKey('unobserved-test'), 20).then(() => { fired++; }), new Promise((r) => setTimeout(r, 2000))]);
  assert.equal(fired, 1, 'afterTick did not fire');
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(fired, 1);
  assert.equal(stopEarlyTimers(), 0, 'afterTick left an interval on the register after firing');
});

/* ── ④ the shipped radar row ──────────────────────────────────────────────────────────────────── */
const DL = read('js/data-layers.js');
const AST = acorn.parse(DL, { ecmaVersion: 'latest', sourceType: 'module' });
const walk = (n, f, parent) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach((c) => walk(c, f, parent)); return; } f(n, parent); for (const k of Object.keys(n)) if (!['type', 'start', 'end', 'loc'].includes(k)) walk(n[k], f, n); };
const src = (n) => DL.slice(n.start, n.end);
function fnDecl(name) { let hit = null; walk(AST, (n) => { if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) hit = n; }); assert.ok(hit, name + ' not found in js/data-layers.js'); return src(hit); }
function varDecl(name) { let hit = null; walk(AST, (n) => { if (n.type === 'VariableDeclaration' && n.declarations.some((d) => d.id.name === name)) hit = n; }); assert.ok(hit, name + ' not declared in js/data-layers.js'); return src(hit); }
function radarBranch() {
  let hit = null;
  walk(AST, (n) => { if (n.type === 'IfStatement' && n.test.type === 'BinaryExpression' && n.test.left.name === 'id' && n.test.right.value === 'radar' && /req=/.test(src(n.consequent))) hit = n.consequent; });
  assert.ok(hit, 'the radar arm of toggleLayer was not found');
  return src(hit);
}

function radarRow({ fetch: fakeFetch }) {
  const toasts = [], drawn = [];
  const row = { attrs: {}, classList: { remove() {}, add() {} }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
  const cb = { id: 'dl-radar', checked: true, dataset: {}, closest: () => row };
  const document = { getElementById: (id) => (id === 'dl-radar' ? cb : null) };
  const window = { IntMapLang: { t: (_l, en) => en } };
  const lgdRadar = { style: { display: '' } };
  /* the host table is replaced (so the test does not wait 6 s per clock); every function that decides is the shipped one.
     (module-graph) the lifted code reads the registry as its imported binding `IntMapLang`, handed in by name */
  const clockFor = () => 120;
  const code = [
    varDecl('_unobsGen'), fnDecl('rowUntilObserved'),
    varDecl('RV_INDEX_URL'), 'let _rvData=null,_rvAt=0,_rvPending=null;', varDecl('_rvWhy'), fnDecl('rvFetch'), fnDecl('rvRead'),
    'return function toggleRadar(){ let req; const id="radar";', radarBranch(), 'return req; };',
  ].join('\n');
  const make = new Function('document', 'window', 'HOST', 'satToast', 'lgdRadar', 'tileLegends', 'whenStyleReady', 'clockFor',
    'jsonWithin', 'untilObserved', 'afterTick', 'tickKey', 'rvRefreshFrames', 'addRainViewer', 'rvAutoRefresh', 'IntMapLang', code);
  const toggle = make(document, window, { lang: 'en' }, (m) => toasts.push(m), lgdRadar, () => {}, () => Promise.resolve(), clockFor,
    jsonWithin, untilObserved, afterTick, tickKey, () => {}, () => { drawn.push('lyr-radar'); return true; }, () => {}, window.IntMapLang);
  const real = globalThis.fetch;
  globalThis.fetch = fakeFetch;
  return { toggle, cb, row, toasts, drawn, restore: () => { globalThis.fetch = real; } };
}
const INDEX = { host: 'https://tilecache.rainviewer.com', radar: { past: [{ time: 1, path: '/v2/radar/1' }], nowcast: [] } };
const answer = (status, body) => Promise.resolve({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, text: () => Promise.resolve(JSON.stringify(body)) });
/* polls a condition — the clock and the pause are timers, and Windows' timer granularity is ~16 ms */
const waitFor = async (f, ms = 3000) => { const end = Date.now() + ms; while (!f() && Date.now() < end) await new Promise((r) => setTimeout(r, 5)); return f(); };
const silentUntilAborted = (init) => new Promise((res, rej) => { init && init.signal && init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))); });

test('④ radar: a read that was not observed keeps the box and asks again with a longer clock', async (t) => {
  const reads = [];
  const R = radarRow({ fetch: (u, init) => { reads.push(Date.now()); return reads.length === 1 ? silentUntilAborted(init) : answer(200, INDEX); } });
  t.after(R.restore);
  const req = R.toggle();
  assert.ok(await waitFor(() => R.toasts.length > 0), 'the first read never ended');   /* past the clock, inside the pause */
  assert.equal(reads.length, 1, 'the second read was not paused');
  assert.equal(R.cb.checked, true, 'the box was unticked because the page read nothing in time');
  assert.equal(R.row.attrs['aria-busy'], 'true', 'the row does not say it is still being fetched');
  assert.equal(R.cb.dataset.imUnobserved, '1', 'the retry is not recorded on the box');
  assert.deepEqual(R.toasts, ['Still waiting for the data — asking again']);
  await Promise.race([req, new Promise((r) => setTimeout(r, 3000))]);
  assert.equal(reads.length, 2, 'no second read was made');
  assert.deepEqual(R.drawn, ['lyr-radar'], 'the answer to the second read was not drawn');
  assert.equal(R.cb.checked, true);
  assert.equal(R.row.attrs['aria-busy'], undefined, 'the busy mark outlived the wait');
  assert.ok(!R.toasts.some((m) => /unavailable/.test(m)), 'an unobserved read was reported as the data being unavailable');
});

test('④ radar: a 404 is an answer — unticked and toasted exactly as before, after one read', async (t) => {
  let reads = 0;
  const R = radarRow({ fetch: () => { reads++; return answer(404, 'no'); } });
  t.after(R.restore);
  await R.toggle();
  assert.equal(reads, 1, 'a refusal was asked again');
  assert.equal(R.cb.checked, false, 'a refused layer stayed ticked over nothing');
  assert.deepEqual(R.toasts, ['Live weather data unavailable']);
  assert.deepEqual(R.drawn, []);
});

test('④ radar: unticked while waiting → nothing drawn, the box is not touched again', async (t) => {
  let reads = 0;
  const R = radarRow({ fetch: (u, init) => { reads++; return reads === 1 ? silentUntilAborted(init) : answer(200, INDEX); } });
  t.after(R.restore);
  const req = R.toggle();
  assert.ok(await waitFor(() => R.cb.dataset.imUnobserved === '1'), 'the first read never ended');
  R.cb.checked = false;   /* the reader switches it off during the pause */
  await Promise.race([req, new Promise((r) => setTimeout(r, 3000))]);
  assert.equal(reads, 1, 'a row nobody wants any more was read again');
  assert.deepEqual(R.drawn, [], 'a layer was drawn behind a box that is off (CONSTITUTION §3)');
  assert.ok(!R.toasts.some((m) => /unavailable/.test(m)));
});

/* ── ⑤ which rows go through it — found, not listed ───────────────────────────────────────────── */
test('⑤ every row that goes through the policy names its box, and the policy is not copied', () => {
  const boxes = [];
  walk(AST, (n) => { if (n.type === 'CallExpression' && n.callee.name === 'rowUntilObserved') { const a = n.arguments[0]; assert.equal(a && a.type, 'Literal', 'rowUntilObserved is called without a literal box id'); boxes.push(a.value); } });
  assert.ok(boxes.length >= 2, 'the radar and cable rows no longer go through the policy: ' + boxes.join(','));
  for (const b of boxes) assert.ok(DL.includes(`'${b}'`) && /^dl-/.test(b), b + ' is not a data-layer box');
  /* the retry decision exists once: the rows ask js/fetch-deadline.js isUnobserved rather than spelling `reason==='timeout'` themselves */
  assert.doesNotMatch(DL, /reason\s*===?\s*['"]timeout['"]/, 'js/data-layers.js spells the timeout test itself instead of asking isUnobserved');
});

/* ══ ⑥ THE PATHS THAT DO NOT UNTICK — a late answer is not saved or shown as «none» ══════════════════
   The five reads that treated a timeout as «no data» without unticking: the fertility row,
   js/precip-annual.js, js/wb-layers.js, js/layer-packs.js's single-year World Bank read (which CACHED the
   empty answer for the session) and js/countries-ui.js. Each is evaluated from the shipped source (lifted
   from the comment-stripped file, run in a scope whose unknown names are inert stand-ins), against a
   stubbed fetch. */
const LATE = 'The data did not arrive in time — try again';
function inertScope(over) {
  const inert = () => new Proxy(function () {}, {
    get: (_, k) => (k === Symbol.toPrimitive ? () => '' : (k === 'then' || typeof k === 'symbol') ? undefined : inert()),
    set: () => true, apply: () => inert(),
  });
  return new Proxy(over, {
    has: (t, k) => typeof k === 'string' && (k in t || !(k in globalThis)),
    get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : (t[k] = inert()))),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}
const CODE = (p) => stripComments(readLF(join(ROOT, p)));
const silent = (init) => new Promise((res, rej) => { if (init && init.signal) init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))); });
const WB_ROWS = (iso, v) => [{ page: 1 }, [{ countryiso3code: iso, date: '2020', value: v }]];

test('⑥ wb-layers: a silent half of a summed indicator is not cached as the series; a refusal is still an empty answer', async (t) => {
  const real = globalThis.fetch;
  t.after(() => { globalThis.fetch = real; stopEarlyTimers(); });
  const src = CODE('js/wb-layers.js');
  const prelude = 'const wbCache={}, wbSeriesCache={}; const WB_FROM=1990; const _wbKey=(code)=>Array.isArray(code)?code.join("+"):code;\n';
  const mk = () => new Function('scope', 'with (scope) { ' + prelude + liftFunction(src, 'wbSeries') + '\nreturn { wbSeries, wbSeriesCache }; }')(
    inertScope({ readWithin, clockFor: () => 30, isUnobserved, untilObserved, afterTick, tickKey }));
  /* A answers, B never does: before, B was `[]` and A alone was cached as «A+B» */
  let W = mk();
  globalThis.fetch = (u, init) => (/indicator\/A\?/.test(u) ? answer(200, WB_ROWS('JPN', 1)) : silent(init));
  const e = await W.wbSeries(['A', 'B']).catch((x) => x);
  assert.equal(isUnobserved(e), true, 'a host silent through every retry did not reject as unobserved');
  assert.deepEqual(Object.keys(W.wbSeriesCache), [], 'a partial sum was cached as the series');
  /* the next call reads again, and this time both answer */
  globalThis.fetch = (u) => answer(200, WB_ROWS('JPN', /indicator\/A\?/.test(u) ? 1 : 2));
  const S = await W.wbSeries(['A', 'B']);
  assert.equal(S.by['2020'].JPN, 3, 'the retry did not read both halves');
  /* an observed refusal is still `[]` → no series, as before, after ONE read */
  W = mk(); let reads = 0;
  globalThis.fetch = () => { reads++; return answer(404, { message: 'not found' }); };
  assert.equal(await W.wbSeries('C'), null);
  assert.equal(reads, 1, 'a refusal was asked again');
});

test('⑥ layer-packs: a single-year read that ran out of time is said to be late, not «could not load», and nothing is kept', async (t) => {
  const real = globalThis.fetch;
  t.after(() => { globalThis.fetch = real; });
  const src = CODE('js/layer-packs.js');
  const toasts = [];
  const run = (series, fetchImpl) => {
    globalThis.fetch = fetchImpl;
    const cache = {};
    const scope = inertScope({ readWithin, clockFor: () => 30, isUnobserved, cache, state: {}, wbYr: {},
      WB: { k: { ind: 'X', ids: ['wb-k-fill'], src: 'src-wb-k', score: (v) => v } },
      _imCanDraw: () => true, imToast: (m) => toasts.push(m), HOST: { lang: 'en', countryGeo: { features: [] } },
      IntMapLang: { t: (_l, en) => en },   /* (module-graph) the lifted code reads its imported registry binding */
      window: { IntMapLang: { t: (_l, en) => en }, IntMapWB: { series, get: () => ({}) } } });
    const wbToggle = new Function('scope', 'with (scope) { ' + liftFunction(src, 'wbToggle') + '\nreturn wbToggle; }')(scope);
    wbToggle('k', true);
    return cache;
  };
  const late = () => Promise.reject(Object.assign(new Error('deadline'), { reason: 'timeout' }));
  let cache = run(late, (u, init) => silent(init));
  assert.ok(await waitFor(() => toasts.length > 0), 'the late read said nothing');
  assert.deepEqual(toasts, [LATE]);
  assert.equal('wb_k' in cache, false, 'the empty answer of a read that ran out of time was cached — the layer would never ask again');
  /* a refusal is an answer, said as before (「Could not load the data」); an empty answer was never cached — the
     branch returns before the cache line — so both leave the next switch-on free to read again */
  toasts.length = 0;
  cache = run(() => Promise.resolve(null), () => answer(404, { message: 'not found' }));
  assert.ok(await waitFor(() => toasts.length > 0), 'a refused read said nothing');
  assert.deepEqual(toasts, ['Could not load the data'], 'a refusal was reported as a late answer');
  assert.equal('wb_k' in cache, false);
});

test('⑥ precip-annual: a silent manifest is asked again while the row is on, shared by its callers, and nothing is kept', async (t) => {
  const real = globalThis.fetch;
  t.after(() => { globalThis.fetch = real; stopEarlyTimers(); });
  const src = CODE('js/precip-annual.js');
  const decl = /let manifestFail = null, manifestErr = null, manifestP = null;/.exec(src);
  assert.ok(decl, 'the manifest state was not found');
  const make = () => new Function('scope', 'with (scope) { let mm=null, yr=null, on=true;\n' + decl[0] + '\n' + liftFunction(src, 'manifests')
    + '\nreturn { manifests, off: () => { on = false; }, got: () => [mm, yr, manifestFail] }; }')(
    inertScope({ jsonWithin, clockFor: () => 30, untilObserved, afterTick, tickKey, url: (f) => 'https://intmap.invalid/' + f }));
  let n = 0;
  globalThis.fetch = (u, init) => { n++; return n <= 2 ? silent(init) : answer(200, { ok: 1 }); };   /* the first attempt's two reads are silent */
  const P = make();
  const a = P.manifests(), b = P.manifests();
  assert.equal(a, b, 'two callers started two attempts');
  assert.equal(await a, true, 'a manifest that answered on the retry was not taken');
  assert.equal(n, 4, 'the silent attempt was not asked again (or was asked more than once)');
  /* switched off while it waits → ends as the caller's own stop, keeps nothing */
  const Q = make();
  globalThis.fetch = (u, init) => silent(init);
  const q = Q.manifests(); Q.off();
  assert.equal(await q, false);
  assert.deepEqual(Q.got(), [null, null, 'aborted'], 'a manifest nobody wants any more was kept or reported as the host\'s failure');
});

test('⑥ countries-ui and the fertility row: the classifier reaches the classic script, and the row goes through the policy', () => {
  const AB = read('js/app-body.js');
  assert.match(AB, /window\.IntMapFetchWithin = \{[^}]*\bisUnobserved\b[^}]*\};/, 'window.IntMapFetchWithin does not carry isUnobserved');
  assert.match(CODE('js/countries-ui.js'), /FWu\.isUnobserved\(grabErr\)/, 'js/countries-ui.js does not ask the classifier why its last rung failed');
  const boxes = [];
  walk(AST, (n) => { if (n.type === 'CallExpression' && n.callee.name === 'rowUntilObserved') boxes.push(n.arguments[0].value); });
  assert.ok(boxes.includes('dl-tfr'), 'the fertility row does not go through the policy');
});
