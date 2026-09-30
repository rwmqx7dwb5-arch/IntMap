/* ============================================================================
 *  heal-waits-for-inflight — «not painted yet» is not «could not paint», EVALUATED
 * ----------------------------------------------------------------------------
 *  Production, 2026-09-27, a normal boot: the radar row was ticked and waited for
 *  RainViewer's frame index before it could add its layer. The #R109 post-toggle
 *  look (js/data-layers.js) came 2.8 s after the tick, found no layer, pulsed the
 *  box off→on — one `toggle-heal` in IntMapLayerAudit.log() — and the pulse
 *  aborted the 34 radar tiles the first request had already started. The box
 *  ended ticked and drawn; the pulse had only re-asked for the request that was
 *  already on its way. `observable()` (the previous round) knew about a change
 *  HELD before its row; nothing knew about a request STILL BEING ANSWERED after it.
 *
 *  Each claim is asked of the shipped code, not of its spelling:
 *    ① js/layer-rows.js `inFlight()` — the registry itself, imported.
 *    ② the post-toggle look (`toggleLook`) and ③ the periodic `audit`, lifted out
 *       of the shipped file and RUN against the real registry and a fake map.
 *    ④ `toggleLayer`, lifted and run branch by branch: every branch that starts
 *       asynchronous work returns a request that is pending until that work ends —
 *       and the code every branch shares after the switch (the #R30 orphan guard)
 *       still runs. The branches are discovered from the function, not listed here.
 *    ⑤ `withCountries` — the helper eight rows wait on — settles with its callback,
 *       waits on a promise the callback returns, and settles when it gives up.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { inFlight } from '../js/layer-rows.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DL = codeOnly(readLF(join(ROOT, 'js/data-layers.js')));
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; };
const state = (p) => { let s = 'pending'; p.then(() => { s = 'fulfilled'; }, () => { s = 'rejected'; }); return () => s; };

/* ── ① the registry ─────────────────────────────────────────────────────────────────────────────── */
test('① a tracked request is in flight until it settles — fulfilled or rejected', async () => {
  const F = inFlight();
  const a = deferred();
  F.track('dl-radar', a.p);
  assert.equal(F.has('dl-radar'), true);
  assert.deepEqual(F.pending(), ['dl-radar']);
  a.resolve(); await flush();
  assert.equal(F.has('dl-radar'), false, 'a fulfilled request stayed in flight');

  const b = deferred();
  F.track('dl-radar', b.p);
  b.reject(new Error('the index did not come')); await flush();
  assert.equal(F.has('dl-radar'), false, 'a rejected request stayed in flight — the box would never be judged again');
});

test('① (cont.) the newest change for a box is the one in flight', async () => {
  const F = inFlight();
  const old = deferred(), neu = deferred();
  F.track('dl-x', old.p);
  F.track('dl-x', neu.p);
  old.resolve(); await flush();
  assert.equal(F.has('dl-x'), true, 'an older request finishing late cleared a newer one');
  /* a change answered at once (the «off» branch returns nothing) replaces what was in flight */
  F.track('dl-x', undefined);
  assert.equal(F.has('dl-x'), false);
  /* idle() waits on whichever request is in flight when it resolves, not only the first */
  const r1 = deferred(), r2 = deferred();
  F.track('dl-y', r1.p);
  const idle = state(F.idle('dl-y'));
  F.track('dl-y', r2.p);
  r1.resolve(); await flush();
  assert.equal(idle(), 'pending', 'idle() resolved while a newer request was still in flight');
  r2.reject(new Error('x')); await flush();
  assert.equal(idle(), 'fulfilled', 'idle() does not resolve after a rejected request');
  const none = state(F.idle('dl-none')); await flush();
  assert.equal(none(), 'fulfilled', 'idle() does not resolve for a box with nothing in flight');
});

/* ── ②③ the reconciler, as shipped ──────────────────────────────────────────────────────────────── */
const RECONCILER = ['inFlightNow', 'toggleLook', 'audit'].map((n) => liftFunction(DL, n)).join('\n');
const DEPS = ['layerInflight', 'observable', 'heldNow', '_canDraw', 'idsFor', 'painted', 'healed', 'sus', 'log', 'BASE',
  'fireSyn', 'rearm', 'userTouched', '_auditLearned', 'GE', 'document', 'window'];

function rig() {
  const F = inFlight();
  const drawn = new Set();
  const boxes = [];
  const env = {
    layerInflight: F,
    observable: () => true, heldNow: () => false, _canDraw: () => true,
    idsFor: (id) => (id === 'dl-radar' ? ['lyr-radar'] : null),
    painted: (ids) => ids.some((l) => drawn.has(l)),
    healed: {}, sus: {}, log: [], BASE: {},
    pulses: [],
    userTouched: () => false, _auditLearned: () => {},
    GE: () => ({ layers: { has: () => false, setLayout: () => {} } }),
    document: { querySelectorAll: () => boxes },
    window: {},
  };
  env.fireSyn = (cb) => env.pulses.push(['fire', cb.id]);
  env.rearm = (cb) => env.pulses.push(['rearm', cb.id]);
  /* eslint-disable no-new-func */
  const fns = new Function(...DEPS, RECONCILER + '\nreturn { toggleLook, audit, inFlightNow };')(...DEPS.map((k) => env[k]));
  const box = { id: 'dl-radar', checked: true };
  boxes.push(box);
  return { env, F, drawn, box, ...fns };
}

test('② the look 2.8 s after a tick does not judge a box whose request is still being answered', async () => {
  const R = rig();
  const req = deferred();
  R.F.track(R.box.id, req.p);
  R.toggleLook(R.box, Date.now());
  await flush();
  assert.deepEqual(R.env.pulses, [], 'the box was pulsed while its request was in flight — the production defect');
  assert.deepEqual(R.env.log, []);
  /* the request lands and draws: the look that was waiting finds it painted and does nothing */
  R.drawn.add('lyr-radar');
  req.resolve(); await flush();
  assert.deepEqual(R.env.pulses, []);
  assert.deepEqual(R.env.log, []);
});

test('② (cont.) when the request settles and nothing was drawn, the look acts ONCE', async () => {
  for (const how of ['resolve', 'reject']) {
    const R = rig();
    const req = deferred();
    R.F.track(R.box.id, req.p);
    R.toggleLook(R.box, Date.now());
    await flush();
    assert.deepEqual(R.env.pulses, [], how);
    req[how](new Error('the upstream said no')); await flush();
    assert.equal(R.inFlightNow(R.box), false, `${how}: the box is still in flight after its request ${how === 'reject' ? 'rejected' : 'settled'}`);
    assert.deepEqual(R.env.pulses, [['rearm', 'dl-radar']], `${how}: one look after the request settled`);
    assert.deepEqual(R.env.log.map((e) => e.fix), ['toggle-heal']);
    await flush();
    assert.equal(R.env.pulses.length, 1, `${how}: looked more than once`);
  }
});

test('② (cont.) with nothing in flight the look is what it was — a blank box is healed at once', async () => {
  const R = rig();
  R.toggleLook(R.box, Date.now());
  await flush();
  assert.deepEqual(R.env.pulses, [['rearm', 'dl-radar']]);
  /* …and a box the reader unticked is still left alone */
  const U = rig(); U.box.checked = false;
  U.toggleLook(U.box, Date.now()); await flush();
  assert.deepEqual(U.env.pulses, []);
});

test('③ the periodic audit does not count a box in flight, and judges it as before once it has settled', async () => {
  const R = rig();
  const req = deferred();
  R.F.track(R.box.id, req.p);
  for (let i = 0; i < 5; i++) R.audit();
  assert.deepEqual(R.env.pulses, [], 'the audit pulsed a box whose request was still being answered');
  assert.equal(R.env.sus['dl-radar'], 0);
  req.resolve(); await flush();
  R.audit();
  assert.deepEqual(R.env.pulses, [], 'the 2-hit debounce is kept — one look is not a finding');
  R.audit();
  assert.deepEqual(R.env.pulses, [['rearm', 'dl-radar']]);
});

/* ── ④ toggleLayer returns the request each branch started ──────────────────────────────────────── */
const TOGGLE = liftFunction(DL, 'toggleLayer');
/* every id the function branches on — read from the function, so a new branch is covered by being written */
const BRANCH_IDS = [...new Set([...TOGGLE.matchAll(/\bid===\s*'([^']+)'/g)].map((m) => m[1]))];

/* Anything the function reaches that is not overridden below is an inert stand-in: callable, every
   property another stand-in, and NOT thenable — so no stand-in can pose as a request. */
function inert() {
  const memo = new Map();
  const p = new Proxy(function () {}, {
    get(_, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k === 'then' || typeof k === 'symbol') return undefined;
      if (!memo.has(k)) memo.set(k, inert()); return memo.get(k);
    },
    set() { return true; },
    apply() { return inert(); },
  });
  return p;
}
function runToggle(id) {
  const gate = deferred();
  const timers = [];
  let asked = 0;
  const wait = () => { asked++; return gate.p; };
  const over = {
    /* the asynchronous steps a branch can start — each one waits on this run's gate */
    whenStyleReady: wait,
    withCountries: (cb) => wait().then(cb),
    addKoppen: wait, applyMilMode: wait, startSats: wait,
    /* (remove-synthetic-planes) the aircraft layer's start is the GPU platform's (js/data-layers.js
       _av2Start — a lazy module, then the worker's config), and the row returns it; the ships half of
       startTraffic starts its stream synchronously and returns nothing, as it always has */
    startTraffic: (id) => (id === 'planes' ? wait() : undefined),
    rvFetch: () => Promise.resolve(),
    fetch: () => gate.p,
    setTimeout: (fn, ms) => { timers.push(ms); return 0; },
    requestAnimationFrame: () => 0,
  };
  const scope = new Proxy(over, {
    has: (t, k) => typeof k === 'string' && (k in t || !(k in globalThis)),
    get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : (t[k] = inert()))),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  /* eslint-disable no-new-func */
  const toggleLayer = new Function('scope', 'with (scope) { ' + TOGGLE + '\nreturn toggleLayer; }')(scope);
  const out = toggleLayer(id, true);
  return { out, asked, gate, timers };
}

test('④ every branch that starts asynchronous work returns it, pending until the work ends', async () => {
  assert.ok(BRANCH_IDS.includes('radar'), 'the reported row is one of the branches read');
  const async = [];
  for (const id of BRANCH_IDS) {
    const { out, asked, gate, timers } = runToggle(id);
    assert.ok(timers.includes(3200), `${id}: the shared tail after the switch (the #R30 orphan guard) did not run`);
    if (!asked) { assert.equal(out, undefined, `${id}: a branch that draws at once returned something`); continue; }
    async.push(id);
    assert.ok(out && typeof out.then === 'function', `${id}: started asynchronous work and returned no request — it would be judged while it is still arriving`);
    const s = state(out); await flush();
    assert.equal(s(), 'pending', `${id}: the request settled before the work it waits on`);
    gate.resolve(); await flush();
    assert.equal(s(), 'fulfilled', `${id}: the request did not settle when its work did`);
  }
  assert.ok(async.includes('radar'), 'the radar branch did not start its asynchronous work');
});

/* ── ⑤ withCountries ─────────────────────────────────────────────────────────────────────────────── */
function runWithCountries({ ready }) {
  const timers = [];
  const env = {
    loadCountryData: () => Promise.resolve(),
    _canDraw: () => true, HOST: { countryGeo: ready ? {} : null },
    GE: () => ({ layers: { hasSource: () => ready } }),
    addCountryLayers: () => {}, _hiResCountries: () => {},
    window: {}, console: { warn: () => {} },
    setTimeout: (fn) => { timers.push(fn); return 0; },
  };
  const names = Object.keys(env);
  const withCountries = new Function(...names, liftFunction(DL, 'withCountries') + '\nreturn withCountries;')(...names.map((k) => env[k]));
  return { withCountries, timers };
}

test('⑤ withCountries settles after its callback, waits on a promise the callback returns, and settles when it gives up', async () => {
  {
    const { withCountries } = runWithCountries({ ready: true });
    const inner = deferred();
    const s = state(withCountries(() => inner.p)); await flush();
    assert.equal(s(), 'pending', 'settled before the callback\'s own request');
    inner.resolve(); await flush();
    assert.equal(s(), 'fulfilled');
  }
  {
    const { withCountries, timers } = runWithCountries({ ready: false });
    let called = false;
    const s = state(withCountries(() => { called = true; })); await flush();
    /* the wait's own bound — run its ticks until it gives up */
    for (let i = 0; i < 1000 && timers.length; i++) timers.shift()();
    await flush();
    assert.equal(called, false);
    assert.equal(s(), 'fulfilled', 'a wait that gave up left its row in flight for ever');
  }
});
