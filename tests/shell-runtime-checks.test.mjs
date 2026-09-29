/* ============================================================================
 *  shell-runtime-checks — js/runtime.js — the wheel, capabilities, ownership, early timers
 * ----------------------------------------------------------------------------
 *  One subject, gathered from the round-numbered files that each held a piece of it:
 *  tests/r408-checks.test.mjs
 *  tests/r796-runtime-ownership-checks.test.mjs
 *  tests/r799-unowned-live-count-checks.test.mjs
 *  Every test keeps its original title (led by the round that wrote it), and every round's own
 *  account of WHY its checks exist is kept above them. Each round's checks sit in their own block
 *  so the helpers it wrote for itself stay its own; the file root and the plain text reader are
 *  shared below.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ═══════════════════════ #R408 · from r408-checks.test.mjs ═══════════════════════ */
/* (#R408 — the round's own account of why these checks exist heads its other half, in tests/shell-layer-panel-checks.test.mjs) */
{
const rd = read;
function lineOf(src, pos) { return src.slice(0, pos).split('\n').length; }

/* ⚠ 素の grep はコメントと文字列を読む。この回の調査で実際に外している——`js/app-body.js:168` の
   **ブロックコメントの中の説明例**が「99番目の機能ファクトリ」として数えられ、外部の監査もその
   99を引用した（実体は98）。だから数えるものは AST から取る。 */
/* 呼び出し名の全数。`setInterval(...)` も `window.setInterval(...)` も同じ名前で返す。 */
function callsNamed(rel, want) {
  const src = rd(rel);
  const out = [];
  walk.simple(acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }), {
    CallExpression(node) {
      const c = node.callee;
      const n = (c.type === 'Identifier' && c.name)
        || (c.type === 'MemberExpression' && c.property && c.property.name);
      if (n === want) out.push(lineOf(src, node.start));
    },
  });
  return out;
}

const JS = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f);

/* ── ② THE WHEEL HAS CALLERS NOW, AND NOTHING ELSE ARMS A TIMER ───────────────────────────────
   ⚠ 二つの主張を1つの検査にしないこと。「生の `setInterval` が0件」だけでは、**全部消しても緑**
   になる（#R402 ⑬ と同じ形）。だから「ホイールに呼び出し元が N 件以上ある」を必ず並べて置く。 */
test('R408 ②a: js/ に生の setInterval は無い（js/runtime.js のフォールバックを除く）', () => {
  const offenders = [];
  for (const f of JS) {
    if (f === 'js/runtime.js') continue;          /* ホイール自身の内側 — 下の ②c が中身を見る */
    for (const ln of callsNamed(f, 'setInterval')) offenders.push(`${f}:${ln}`);
  }
  assert.deepEqual(offenders, [],
    'これらは js/runtime.js の everyTick() を通っていないので、hidden なタブでも起き続ける');
});

test('R408 ②b: そのホイールに実際の呼び出し元がある（宣言だけの機構にしない）', () => {
  const users = JS.filter((f) => /\bfrom\s+'\.\/runtime\.js'/.test(rd(f)) && /\beveryTick\s*\(/.test(rd(f)));
  assert.ok(users.length >= 25,
    `everyTick を呼ぶファイルが ${users.length} 件しかない — #R234 から呼び出し元0件だったのが、この回の当の欠陥`);
  /* ⚠ 半分だけ変換したファイルがいちばん危ない。停止関数を `clearInterval` に渡すと**黙って無視**
     され、タイマーはタブの寿命ぶん生き残る。だから everyTick を使うファイルに clearInterval は許さない。 */
  const mixed = [];
  for (const f of users) for (const ln of callsNamed(f, 'clearInterval')) mixed.push(`${f}:${ln}`);
  assert.deepEqual(mixed, [],
    'everyTick が返すのは停止関数であって数値ハンドルではない — stopTick() を使うこと');
});

test('R408 ②c: ホイールは hidden を見ており、取りこぼしをまとめて走らせない', async () => {
  /* (tests-by-topic) 綴りではなく挙動で測る。本物の makeRuntime() を、hidden を切り替えられる
     document と window の上で動かし、呼ばれた時刻を記録する。グローバルは test の中で立てて戻す。 */
  const { makeRuntime, everyTick, stopTick, stopEarlyTimers } = await import('../js/runtime.js');
  assert.equal(typeof everyTick, 'function', 'everyTick が export されている');
  assert.equal(typeof stopTick, 'function', 'stopTick が export されている');
  const own = (k) => Object.prototype.hasOwnProperty.call(globalThis, k);
  const saved = { window: [own('window'), globalThis.window], document: [own('document'), globalThis.document] };
  const onVisible = [];
  const doc = { hidden: true, addEventListener: (ev, fn) => { if (ev === 'visibilitychange') onVisible.push(fn); } };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  globalThis.document = doc;
  globalThis.window = {};
  let RT = null;
  try {
    stopEarlyTimers();
    RT = makeRuntime({});
    const at = [];
    everyTick('r408:hidden', 40, () => { at.push(Date.now()); });
    /* Runtime が無いときに黙って何もしない実装は #R170 の欠陥（フォールバックは ②d が鳴らして測る）。
       Runtime が在るなら、呼び出しはホイールへ載る——生 interval ではない。 */
    assert.equal(RT.stats().timers, 1, 'everyTick は Runtime があればホイールへ委譲する');
    assert.equal(stopEarlyTimers(), 0, 'Runtime が在るのに生の interval が張られていない');
    await wait(260);                                        /* ≈ 6 周期ぶん hidden */
    assert.equal(at.length, 0, 'hidden の間は tick を飛ばす');
    const back = Date.now();
    doc.hidden = false; onVisible.forEach((f) => f());
    await wait(200);
    assert.ok(at.length >= 1, '復帰すれば鳴る');
    assert.ok(at[0] >= back, '最初の1回は復帰のあと');
    for (let i = 1; i < at.length; i++) {
      assert.ok(at[i] - at[i - 1] >= 30,
        `飛ばした分をまとめて走らせない — 復帰後の呼び出し間隔 ${at[i] - at[i - 1]} ms は周期 40 ms を守る`);
    }
    assert.ok(at.length <= 200 / 40 + 1, `復帰後 200 ms で ${at.length} 回 — 取りこぼしの分が足されている`);
  } finally {
    if (RT) RT.clearEvery('r408:hidden');
    stopEarlyTimers();                     /* a raw interval must not outlive the test either */
    for (const [k, [had, v]] of Object.entries(saved)) { if (had) globalThis[k] = v; else delete globalThis[k]; }
  }
});

test('R408 ②d: register より先に鳴った時計を、register ができた瞬間に引き取る', async () => {
  const rt = rd('js/runtime.js');
  /* ⚠⚠⚠ これが無いと、この回の門は**緑のまま嘘をつく**。`js/theme-sky.js` の `makeThemeSky` は
     `js/app-body.js:500` で走り、`makeRuntime` は同じ関数の :756——つまり everyTick はフォールバック
     の生 interval を張る。ソースに `setInterval` の綴りは残らないので ②a は緑、しかしタイマーは
     hidden なタブで回り続ける。#R394 の「走っていない機構を名乗る列」を、その次のラウンドで
     自分で作るところだった。
     (#R795/#R796) 綴りではなく挙動で測る。以前は `everyTick.pending.set(key, { … h: setInterval(fn, p) })`
     と引き取りループの正規表現を固定していたが、メモは module-scope の Map になり、名前は
     この検査の主題ではない。主題は 3 つ: 早い呼び出しは黙らず実際に鳴る／register ができた瞬間に
     同じ鍵でホイールへ載る／生 interval はそのとき止まる（ホイールの外で鳴り続けない）。 */
  const { makeRuntime, everyTick, stopEarlyTimers } = await import('../js/runtime.js');
  stopEarlyTimers();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let n = 0;
  everyTick('r408:early', 16, () => { n++; });          /* no register yet (Node has no window.IntMapRuntime) */
  await wait(80);
  assert.ok(n > 0, '早すぎた登録は黙って無効にならず、実際に鳴る');
  const RT = makeRuntime({});
  assert.equal(RT.stats().timers, 1, 'register ができた瞬間に、同じ鍵でホイールへ載る');
  RT.clearEvery('r408:early');
  const n1 = n;
  await wait(80);
  assert.equal(n, n1, '引き取られた生 interval は止まっている — ホイールの外で鳴り続けない');
  assert.equal(stopEarlyTimers(), 0, 'メモは引き取りで空になっている');
  /* 引き取りは window.IntMapRuntime を公開したあとでなければ、載せ直した先が誰にも見えない。 */
  const pub = rt.indexOf('window.IntMapRuntime = API');
  const adopt = rt.indexOf('adoptEarlyTimers(API)');
  assert.ok(pub > 0 && adopt > pub, '引き取りは register を公開したあとに走る');

  /* ⚠ そして「早い呼び出しが実在する」ことも見る。0件になったら、この機構は次の改修で
     「使われていないから」と消される側になる（#R402 で実際にそう判断した前例がある）。 */
  const early = JS.filter((f) => /\bfrom\s+'\.\/runtime\.js'/.test(rd(f)) && /\beveryTick\s*\(/.test(rd(f)))
    .filter((f) => /js\/(theme-sky|perf-hud)\.js/.test(f));
  assert.equal(early.length, 2,
    'register 生成前に鳴く2件（theme-sky / perf-hud）がホイールを呼んでいる — 引き取りが効く相手である');
});
}

/* ═══════════════════════ #R796 · from r796-runtime-ownership-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  R796 — the runtime's lifecycle has a generation, and a scope owns what a capability acquires
 * ----------------------------------------------------------------------------
 *  Stage 2 of the ownership refactor (DEV-NOTES #R796). Before this round js/runtime.js could not
 *  tell "the load that just finished" from "the load started before the panel was closed", kept a
 *  failed load memoised, and had no owner for anything a capability registered outside its four
 *  verbs. Each property below is exercised on the real makeRuntime() in Node — the same object the
 *  browser builds — with the sequences that used to be allowed:
 *    open → (loading…) → close → load completes        must NOT reactivate
 *    open → load fails → open again                     must try again
 *    open/close × N                                     must not grow any register
 *    a result arriving after release                    must be dropped, not applied
 * ==========================================================================*/
{
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

test('#R796 ① a load that completes after dispose does not activate the capability', async () => {
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

test('#R796 ① a stale load does not overwrite a newer one either', async () => {
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

test('#R796 ② a failed load is not memoised — the next activate tries again', async () => {
  const RT = await runtime();
  let attempts = 0;
  RT.define('cap.flaky', { load: () => { attempts++; return attempts === 1 ? Promise.reject(new Error('upstream 503')) : Promise.resolve('ok'); }, activate: (a, v) => v });
  assert.equal(await RT.activate('cap.flaky'), null);
  assert.equal(RT.stateOf('cap.flaky'), 'failed');
  assert.equal(await RT.activate('cap.flaky'), 'ok', 'the second open loads again instead of returning the first failure');
  assert.equal(attempts, 2);
  assert.equal(RT.stateOf('cap.flaky'), 'active');
});

test('#R796 ③ the active scope gives back listeners, timers and frame work on suspend — open/close × 50 grows nothing', async () => {
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

test('#R796 ③ registrations WITHOUT an owner are counted, so the number can be driven to zero', async () => {
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

test('#R796 ④ the loaded scope lives across suspend and dies on dispose; keys are prefixed with the owner', async () => {
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

test('#R796 ⑤ guard() drops a result that lands after release; the scope\'s signal is aborted on release', async () => {
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

test('#R796 ⑥ generation moves on dispose only; suspend/activate keep it; activate while active releases the old active scope', async () => {
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

test('#R796 ⑦ the early-timer memo is an ordinary module-scope Map and is still adopted', async () => {
  const src = readFileSync(join(ROOT, 'js', 'runtime.js'), 'utf8');
  assert.ok(!/everyTick\.pending/.test(src), 'the memo no longer hangs off the function');
  assert.ok(/const PENDING_TICKS = new Map\(\)/.test(src), 'it is a module-scope const');
  assert.ok(/adoptEarlyTimers\(API\)/.test(src), 'and makeRuntime still adopts it');
  const { tickKey } = await import('../js/runtime.js');
  const a = tickKey('p'), b = tickKey('p');
  assert.notEqual(a, b, 'tickKey still serialises');
});

/* spelling kept: browser script (js/weather.js, js/tsunami.js, js/satellites-live.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R796 ⑧ the three defined capabilities still supply their verbs, and the satellites take the active scope', () => {
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
}

/* ═══════════════════════ #R799 · from r799-unowned-live-count-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  R799 — `stats().unowned` counts LIVE registrations, and the satellite legend timer has an owner
 * ----------------------------------------------------------------------------
 *  Production verification of #R796 measured `unowned` rising by one on every satellite toggle and
 *  never coming down: it was a counter of registrations ever made, not of the ones alive now.
 *  A number that only rises cannot be driven to zero, which is the only thing it exists for.
 *  The one registration doing the rising was js/data-layers.js's legend timer, made with no owner.
 * ==========================================================================*/
{
test('#R799 unowned is the number of live unowned registrations — it falls when they are cleared', async () => {
  const { makeRuntime } = await import('../js/runtime.js');
  const RT = makeRuntime({});
  const n0 = RT.stats().unowned;
  RT.every('anon:a', 1000, () => { });
  RT.frame('anon:b', () => { });
  RT.onCamera('anon:c', () => { });
  assert.equal(RT.stats().unowned, n0 + 3, 'three live unowned registrations');
  RT.clearEvery('anon:a'); RT.offCamera('anon:c');
  assert.equal(RT.stats().unowned, n0 + 1, 'clearing them brings the number down — it is not cumulative');
  assert.ok(RT.stats().unownedEver >= n0 + 3, 'the cumulative count is still available under its own name');
  /* an owned registration never counts, and toggling it fifty times leaves the number where it was */
  RT.define('cap.x', { activate: (a, v, S) => { S.every('t', 1000, () => { }); return true; } });
  const n1 = RT.stats().unowned;
  for (let i = 0; i < 50; i++) { await RT.activate('cap.x'); RT.suspend('cap.x'); }
  assert.equal(RT.stats().unowned, n1);
  RT.dispose('cap.x'); RT.clearEvery('anon:a');
});

/* spelling kept: the source text is the subject (what a file carries, or that a copy is absent). */
test('#R799 the satellite legend timer names its owner', () => {
  const src = readFileSync(join(ROOT, 'js', 'data-layers.js'), 'utf8');
  const m = /everyTick\('data-layers:sat-legend',\s*\d+,\s*[A-Za-z_$][\w$]*\s*,\s*\{[^}]*capability\s*:\s*'sat\.live'/.exec(src);
  assert.ok(m, "the legend timer is registered with { capability: 'sat.live' } — suspended with the layer, swept with it");
});
}
