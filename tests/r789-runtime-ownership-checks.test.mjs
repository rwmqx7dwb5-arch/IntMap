/* ============================================================================
 *  R789 — the runtime's lifecycle has a generation, and a scope owns what a capability acquires
 * ----------------------------------------------------------------------------
 *  Stage 2 of the ownership refactor (DEV-NOTES #R789). Before this round js/runtime.js could not
 *  tell "the load that just finished" from "the load started before the panel was closed", kept a
 *  failed load memoised, and had no owner for anything a capability registered outside its four
 *  verbs. Each property below is exercised on the real makeRuntime() in Node — the same object the
 *  browser builds — with the sequences that used to be allowed:
 *    open → (loading…) → close → load completes        must NOT reactivate
 *    open → load fails → open again                     must try again
 *    open/close × N                                     must not grow any register
 *    a result arriving after release                    must be dropped, not applied
 * ==========================================================================*/
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/* the runtime touches window / document / requestAnimationFrame only inside try/catch — a bare
   Node process is enough, and what it cannot find it does without */
let current = null;
async function runtime() {
  const { makeRuntime } = await import('../js/runtime.js');
  return (current = makeRuntime({}));
}
afterEach(() => { if (current) done(current); current = null; });
const tick = () => new Promise((r) => setTimeout(r, 0));
/* every test gives its capabilities back, so no wheel is left armed when the file ends */
const done = (RT) => { for (const n of RT.capabilities()) RT.dispose(n); for (const k of ['anon:timer', 'owned:timer']) RT.clearEvery(k); };

/* a tiny emitter of the shape the engine's `events` has */
function emitter() {
  const m = new Map();
  return {
    on(ev, fn) { (m.get(ev) || m.set(ev, new Set()).get(ev)).add(fn); },
    off(ev, fn) { const s = m.get(ev); if (s) s.delete(fn); },
    count(ev) { const s = m.get(ev); return s ? s.size : 0; },
    emit(ev, x) { for (const fn of Array.from(m.get(ev) || [])) fn(x); },
  };
}

test('① a load that completes after dispose does not activate the capability', async () => {
  const RT = await runtime();
  let resolveLoad; const loading = new Promise((r) => { resolveLoad = r; });
  const calls = { load: 0, activate: 0, suspend: 0, dispose: 0 };
  RT.define('cap.slow', {
    load: () => { calls.load++; return loading; },
    activate: () => { calls.activate++; return 'on'; },
    suspend: () => { calls.suspend++; },
    dispose: () => { calls.dispose++; },
  });
  const p = RT.activate('cap.slow');          /* open */
  await tick();
  assert.equal(RT.stateOf('cap.slow'), 'loading');
  RT.dispose('cap.slow');                     /* …and close, before the load lands */
  resolveLoad({ catalogue: 1 });              /* the old load lands now */
  const r = await p;
  assert.equal(r, null, 'the stale activation returns nothing');
  assert.equal(calls.activate, 0, 'def.activate never ran for a closed panel');
  assert.equal(RT.stateOf('cap.slow'), 'disposed', 'the state is what the user did last, not what the network did last');
  assert.equal(RT.stats().suspended, 0, 'a disposed capability is not left in the suspended set');
});

test('① a stale load does not overwrite a newer one either', async () => {
  const RT = await runtime();
  const resolvers = [];
  RT.define('cap.twice', { load: () => new Promise((r) => resolvers.push(r)), activate: (arg, v) => v });
  const first = RT.activate('cap.twice');
  await tick();
  RT.dispose('cap.twice');
  const second = RT.activate('cap.twice');
  await tick();
  assert.equal(resolvers.length, 2, 'the reopen started a NEW load rather than waiting on the old one');
  resolvers[0]('old');                        /* the first load lands late */
  resolvers[1]('new');
  assert.equal(await first, null);
  assert.equal(await second, 'new', 'the activation that is current sees the value that is current');
  assert.equal(RT.stateOf('cap.twice'), 'active');
});

test('② a failed load is not memoised — the next activate tries again', async () => {
  const RT = await runtime();
  let attempts = 0;
  RT.define('cap.flaky', { load: () => { attempts++; return attempts === 1 ? Promise.reject(new Error('upstream 503')) : Promise.resolve('ok'); }, activate: (a, v) => v });
  assert.equal(await RT.activate('cap.flaky'), null);
  assert.equal(RT.stateOf('cap.flaky'), 'failed');
  assert.equal(await RT.activate('cap.flaky'), 'ok', 'the second open loads again instead of returning the first failure');
  assert.equal(attempts, 2);
  assert.equal(RT.stateOf('cap.flaky'), 'active');
});

test('③ the active scope gives back listeners, timers and frame work on suspend — open/close × 50 grows nothing', async () => {
  const RT = await runtime();
  const E = emitter();
  const dom = { listeners: 0, addEventListener() { this.listeners++; }, removeEventListener() { this.listeners--; } };
  RT.define('cap.live', {
    activate: (arg, v, S) => {
      S.on(E, 'move', () => { });
      S.on(dom, 'resize', () => { });
      S.every('tick', 1000, () => { });
      S.onCamera('follow', () => { });
      S.frame('paint', () => { });
      S.idle('warm', () => { });
      S.timeout(100000, () => { });
      return true;
    },
  });
  const before = RT.stats();
  for (let i = 0; i < 50; i++) {
    await RT.activate('cap.live');
    assert.equal(E.count('move'), 1, 'one emitter listener while open');
    assert.equal(dom.listeners, 1, 'one DOM listener while open');
    assert.equal(RT.stats().timers, before.timers + 1, 'one timer while open');
    RT.suspend('cap.live');
    assert.equal(E.count('move'), 0, 'the emitter listener is gone after close');
    assert.equal(dom.listeners, 0, 'the DOM listener is gone after close');
  }
  const after = RT.stats();
  for (const k of ['reads', 'writes', 'camera', 'timers']) assert.equal(after[k], before[k], k + ' did not grow across 50 open/close cycles');
  assert.equal(after.unowned, before.unowned, 'registrations through a scope are owned — none of them counted as unowned');
});

test('③ registrations WITHOUT an owner are counted, so the number can be driven to zero', async () => {
  const RT = await runtime();
  const n0 = RT.stats().unowned;
  RT.every('anon:timer', 1000, () => { });
  RT.frame('anon:frame', () => { });
  RT.onCamera('anon:cam', () => { });
  RT.idle('anon:idle', () => { });
  assert.equal(RT.stats().unowned, n0 + 4);
  RT.every('owned:timer', 1000, () => { }, { capability: 'x' });
  assert.equal(RT.stats().unowned, n0 + 4, 'a registration that names its owner is not counted');
});

test('④ the loaded scope lives across suspend and dies on dispose; keys are prefixed with the owner', async () => {
  const RT = await runtime();
  const E = emitter();
  let disposedWorker = 0;
  RT.define('cap.keep', {
    load: (host, L) => { L.on(E, 'styledata', () => { }); L.own({ terminate() { disposedWorker++; } }); return 'catalogue'; },
    activate: (a, v, A) => { A.every('tick', 500, () => { }); return v; },
  });
  await RT.activate('cap.keep');
  assert.equal(E.count('styledata'), 1);
  assert.ok(RT.scope('cap.keep').alive(), 'the loaded scope is alive');
  assert.ok(RT.scope('cap.keep', 'active').alive(), 'the active scope is alive');
  RT.suspend('cap.keep');
  assert.equal(E.count('styledata'), 1, 'suspend keeps what load acquired (fast resume)');
  assert.equal(disposedWorker, 0);
  assert.equal(RT.scope('cap.keep', 'active'), null, 'the active scope is gone after suspend');
  RT.dispose('cap.keep');
  assert.equal(E.count('styledata'), 0, 'dispose gives back what load acquired');
  assert.equal(disposedWorker, 1, 'an owned worker is terminated exactly once');
  assert.equal(RT.scope('cap.keep'), null);
  /* keys are namespaced by the owner, so two capabilities cannot replace each other's timer */
  RT.define('cap.a', { activate: (a, v, S) => S.every('tick', 100, () => { }) });
  RT.define('cap.b', { activate: (a, v, S) => S.every('tick', 100, () => { }) });
  const t0 = RT.stats().timers;
  await RT.activate('cap.a'); await RT.activate('cap.b');
  assert.equal(RT.stats().timers, t0 + 2, 'cap.a:tick and cap.b:tick are two timers');
});

test('⑤ guard() drops a result that lands after release; the scope\'s signal is aborted on release', async () => {
  const RT = await runtime();
  let painted = 0, S0 = null;
  RT.define('cap.fetching', {
    activate: (a, v, S) => { S0 = S; new Promise((r) => setTimeout(r, 5)).then(S.guard(() => { painted++; })); return true; },
  });
  await RT.activate('cap.fetching');
  RT.suspend('cap.fetching');                 /* closed before the answer lands */
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(painted, 0, 'the continuation of a released scope did not paint');
  assert.ok(S0.signal && S0.signal.aborted, 'an in-flight fetch through the scope would have been aborted');
  assert.equal(S0.alive(), false);
  /* …and a scope that is still alive lets the result through */
  let painted2 = 0;
  RT.define('cap.fetching2', { activate: (a, v, S) => { new Promise((r) => setTimeout(r, 5)).then(S.guard(() => { painted2++; })); return true; } });
  await RT.activate('cap.fetching2');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(painted2, 1);
});

test('⑥ generation moves on dispose only; suspend/activate keep it; activate while active releases the old active scope', async () => {
  const RT = await runtime();
  const E = emitter();
  RT.define('cap.gen', { activate: (a, v, S) => { S.on(E, 'click', () => { }); return true; } });
  const g0 = RT.generationOf('cap.gen');
  await RT.activate('cap.gen');
  await RT.activate('cap.gen');
  assert.equal(E.count('click'), 1, 'activating twice does not stack listeners');
  RT.suspend('cap.gen');
  assert.equal(RT.generationOf('cap.gen'), g0, 'suspend is not a generation change');
  RT.dispose('cap.gen');
  assert.equal(RT.generationOf('cap.gen'), g0 + 1);
  await RT.activate('cap.gen');
  assert.equal(RT.stateOf('cap.gen'), 'active', 'reopen after dispose works (#R322)');
  assert.equal(E.count('click'), 1);
});

test('⑦ the early-timer memo is an ordinary module-scope Map and is still adopted', async () => {
  const src = readFileSync(join(ROOT, 'js', 'runtime.js'), 'utf8');
  assert.ok(!/everyTick\.pending/.test(src), 'the memo no longer hangs off the function');
  assert.ok(/const PENDING_TICKS = new Map\(\)/.test(src), 'it is a module-scope const');
  assert.ok(/adoptEarlyTimers\(API\)/.test(src), 'and makeRuntime still adopts it');
  const { tickKey } = await import('../js/runtime.js');
  const a = tickKey('p'), b = tickKey('p');
  assert.notEqual(a, b, 'tickKey still serialises');
});

test('⑧ the three defined capabilities still supply their verbs, and the satellites take the active scope', () => {
  for (const [file, cap] of [['js/weather.js', 'wx.wind'], ['js/tsunami.js', 'sim.tsunami'], ['js/satellites-live.js', 'sat.live']]) {
    const s = readFileSync(join(ROOT, file), 'utf8');
    assert.ok(s.includes(`RT.define('${cap}'`), file + ' still defines ' + cap);
  }
  const sats = readFileSync(join(ROOT, 'js', 'satellites-live.js'), 'utf8');
  assert.ok(/function start\(\s*_arg\s*,\s*_v\s*,\s*S\s*\)/.test(sats), 'start() takes the active scope');
  assert.ok(/S\.on\(E\.events,\s*'mousemove'/.test(sats) && /S\.on\(E\.events,\s*'click'/.test(sats) && /S\.on\(E\.events,\s*'moveend'/.test(sats),
    'the three map listeners are owned by the scope');
  assert.ok(/S\.every\('tick'/.test(sats), 'the tick is owned by the scope');
  assert.ok(/S\.guard\(/.test(sats), 'the catalogue load that lands after close is guarded');
  assert.ok(!/function unwire\(\)/.test(sats), 'the hand-written unwire() is gone — release() is the one way back');
});
