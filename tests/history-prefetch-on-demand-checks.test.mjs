/* ============================================================================
 *  history-prefetch-on-demand — the history bundles wait for the reader's intent
 * ----------------------------------------------------------------------------
 *  「デスクトップの全セッションが、歴史機能に触れなくても起動直後に約 55 MB の歴史データを
 *   先読みして main thread で parse する」のをやめ、時代 UI の最初の利用（の意図）に結びつける。
 *
 *  Everything here is EVALUATED, not read:
 *    ① js/chronos.js `intent` / `onIntent` / `intended` — once, late subscribers called at once,
 *       a past year set on the clock counts, a future instant and the present do not, and a
 *       pointerdown inside an element declaring `data-time-intent` counts while one elsewhere does not;
 *    ② js/mem-budget.js `maySpeculate` — the one answer to «may I fetch ahead» (Data Saver, 2G,
 *       a phone by the DEVICE, and the width fallback before the shell has published its class);
 *    ③ the two `warm` blocks as they ship, lifted and run against stubs: nothing at evaluation
 *       time, nothing on a phone / metered connection after the intent, the head start after the
 *       intent on a desktop — through an idle callback, never synchronously — and the second
 *       subdivision tier never.
 *  The browser half (no request in the boot window, a request after the Chronos button, borders
 *  drawn at 1900) is tests/history-prefetch-on-demand.spec.js.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/* a document that records its capture listeners, so a pointerdown can be dispatched by hand */
function fakeDocument() {
  const L = [];
  return {
    L,
    addEventListener(t, f, c) { L.push({ t, f, c }); },
    removeEventListener(t, f) { const i = L.findIndex((x) => x.t === t && x.f === f); if (i >= 0) L.splice(i, 1); },
    fire(t, target) { for (const x of L.slice()) if (x.t === t) x.f({ type: t, target }); },
  };
}
const el = (declares) => ({ closest: (sel) => (sel === '[data-time-intent]' && declares ? {} : null) });

function loadClock(withDoc = true) {
  const document = withDoc ? fakeDocument() : undefined;
  const window = {};
  const ctx = { window, Date, Math, Number, String, Object, console };
  if (document) ctx.document = document;
  vm.createContext(ctx);
  vm.runInContext(rd('js/chronos.js'), ctx);
  return { T: window.IntMapTime, document };
}

test('① intent fires once; a late subscriber is called at once; unsubscribe works', () => {
  const { T } = loadClock();
  assert.equal(T.intended(), null, 'nothing is intended at evaluation');
  let a = 0, b = 0, c = 0;
  T.onIntent(() => a++);
  const off = T.onIntent(() => b++);
  off();
  T.intent('test'); T.intent('again');
  assert.equal(a, 1, 'a subscriber is called exactly once');
  assert.equal(b, 0, 'an unsubscribed function is not called');
  assert.equal(T.intended().source, 'test', 'the FIRST source is what is recorded');
  T.onIntent(() => c++);
  assert.equal(c, 1, 'a subscriber arriving after the intent is called at once — import order must not decide a warm-up');
});

test('① the clock: a past year is an intent; the present, a future instant and this year are not', () => {
  const { T } = loadClock(false);   /* also proves the kernel still evaluates with no document (workers, node) */
  let n = 0; T.onIntent(() => n++);
  T.setNow({ source: 'ui' });
  T.set(new Date(Date.now() + 3 * 864e5), { allowFuture: true, source: 'tides' });
  const thisYear = new Date(); thisYear.setDate(1); thisYear.setMonth(0); thisYear.setHours(0, 0, 0, 0);
  thisYear.setTime(thisYear.getTime() + 36e5);   /* one hour into January 1st of the current year */
  if (thisYear.getTime() < Date.now()) T.set(thisYear, { source: 'ui' });
  assert.equal(n, 0, 'none of those is a journey into the past');
  T.setYear(1900, { source: 'os' });
  assert.equal(n, 1, 'setting a past year counts');
  assert.equal(T.intended().source, 'clock:os', 'and records who moved the clock');
});

test('① the UI: a pointerdown or focus inside [data-time-intent] counts, elsewhere does not, then the listeners go', () => {
  const { T, document } = loadClock();
  const before = document.L.length;
  assert.ok(document.L.some((x) => x.t === 'pointerdown' && x.c === true), 'a capture pointerdown listener is installed');
  assert.ok(document.L.some((x) => x.t === 'focusin' && x.c === true), 'and a capture focusin listener');
  document.fire('pointerdown', el(false));
  document.fire('focusin', null);
  assert.equal(T.intended(), null, 'a touch outside the time UI is not an intent');
  document.fire('focusin', el(true));
  assert.equal(T.intended().source, 'ui:focusin');
  assert.ok(document.L.length < before, 'once fired, the document listeners are removed');
});

test('① the time UI declares itself (the kernel names no control)', () => {
  const idx = rd('index.html');
  assert.match(idx, /<button[^>]*id="ntl-toggle"[^>]*data-time-intent/, 'the Chronos button declares data-time-intent');
  assert.match(codeOnly(rd('js/data-layers.js')), /row\.className='dl-clockrow';\s*row\.setAttribute\('data-time-intent',''\)/,
    'the legend year row declares data-time-intent');
  assert.doesNotMatch(codeOnly(rd('js/chronos.js')), /ntl-toggle|dl-clock/, 'the kernel does not name a control');
});

/* ── ② one answer to «may I fetch ahead» ─────────────────────────────────────────────────────────── */
function loadBudget(navigator, phoneClass) {
  const g = { navigator };
  if (phoneClass !== undefined) g._imPhoneClass = () => phoneClass;
  const ctx = vm.createContext({ globalThis: g, self: g, Math, Object, Array });
  vm.runInContext(rd('js/mem-budget.js'), ctx);
  return g.IntMapMemBudget;
}

test('② maySpeculate: desktop yes; Data Saver, 2G, slow-2g, a phone (by the device, or by the fallback before the shell is up) no', () => {
  assert.equal(loadBudget({ connection: { effectiveType: '4g' } }, false).maySpeculate(() => true), true,
    'a desktop DEVICE is a desktop even when the width fallback says phone — the device wins once published');
  assert.equal(loadBudget({}, false).maySpeculate(() => false), true, 'no connection API = not known to be metered');
  assert.equal(loadBudget({ connection: { saveData: true, effectiveType: '4g' } }, false).maySpeculate(() => false), false, 'Data Saver');
  assert.equal(loadBudget({ connection: { effectiveType: '2g' } }, false).maySpeculate(() => false), false, '2g');
  assert.equal(loadBudget({ connection: { effectiveType: 'slow-2g' } }, false).maySpeculate(() => false), false, 'slow-2g');
  assert.equal(loadBudget({ connection: { effectiveType: '3g' } }, false).maySpeculate(() => false), true, '3g is not the rule\'s concern');
  assert.equal(loadBudget({}, true).maySpeculate(() => false), false, 'a phone held sideways (844 px) is still a phone (#R668)');
  assert.equal(loadBudget({}, undefined).maySpeculate(() => true), false, 'before the shell publishes its class, the caller\'s width test decides');
  assert.equal(loadBudget({}, undefined).maySpeculate(() => false), true);
});

test('② the rule lives in one place: neither history file carries its own copy of it', () => {
  for (const f of ['js/time-borders.js', 'js/time-admin1.js']) {
    const s = codeOnly(rd(f));
    assert.doesNotMatch(s, /saveData|effectiveType/, f + ' re-derives the connection rule');
    assert.match(liftFunction(s, 'warm'), /IntMapMemBudget\.maySpeculate\(/, f + ' asks the one owner');
  }
});

/* ── ③ the shipped warm blocks, run ─────────────────────────────────────────────────────────────── */
function runWarm(file, { may, extra }) {
  const src = liftFunction(codeOnly(rd(file)), 'warm');
  const { T } = loadClock(false);
  const calls = [], idle = [];
  const env = Object.assign({
    window: { IntMapTime: T, IntMapMemBudget: { maySpeculate: () => may } },
    HOST: { isMobile: () => false },
    requestIdleCallback: (fn, o) => { idle.push(o); calls.push('idle'); fn(); },
    setTimeout: () => { calls.push('timer'); },
  }, extra(calls));
  const ctx = vm.createContext(env);
  vm.runInContext('(' + src + ')()', ctx);
  return { T, calls, idle };
}
const TB_STUBS = (calls) => ({
  bcLoad: () => calls.push('bcLoad'), hnLoad: () => calls.push('hnLoad'),
  csLoad: () => { calls.push('csLoad'); return { then: () => {} }; }, erLoad: () => calls.push('erLoad'),
  YEARS: [], fetchFC: () => calls.push('fetchFC'),
});
const TA_STUBS = (calls) => ({
  T1: { load: () => { calls.push('T1'); return Promise.resolve(); } },
  T2: { load: () => { calls.push('T2'); return Promise.resolve(); } },
  T3: { load: () => { calls.push('T3'); return Promise.resolve(); } },
});

for (const [file, stubs, first] of [['js/time-borders.js', TB_STUBS, 'csLoad'], ['js/time-admin1.js', TA_STUBS, 'T1']]) {
  test('③ ' + file + ': nothing at boot; after the intent, the head start through an idle callback', () => {
    const r = runWarm(file, { may: true, extra: stubs });
    assert.deepEqual(r.calls, [], 'evaluating the module fetched something before any intent');
    r.T.intent('test');
    assert.equal(r.calls[0], 'idle', 'the warm-up must go through requestIdleCallback, not run on the intent\'s own event');
    assert.ok(r.calls.includes(first), 'the bundle is warmed after the intent');
    assert.ok(r.idle[0] && r.idle[0].timeout > 0, 'with a ceiling, so a permanently busy page still gets it');
    if (file === 'js/time-admin1.js') assert.ok(!r.calls.includes('T2') && !r.calls.includes('T3'), 'the deeper tiers are never warmed');
  });
  test('③ ' + file + ': a phone or a metered connection gets no speculative copy even after the intent', () => {
    const r = runWarm(file, { may: false, extra: stubs });
    r.T.intent('test');
    assert.deepEqual(r.calls, [], 'maySpeculate said no, and something was fetched anyway');
  });
}
