/* ============================================================================
 *  #R819 · 同じプロセスの中に、互いに干渉しない GIS を複数持てるか
 * ----------------------------------------------------------------------------
 *  #R783 gave the GIS an assembler with no screen. What it did NOT give it was more than one:
 *  js/gis-runtime.js held a single `MOUNTED` slot, and a caller handing over a second scope in a
 *  realm that already had one was refused `scope-conflict` — forever, because nothing could ever
 *  take the first assembly back off its scope again.
 *
 *  ⚠⚠ THE INVARIANTS ARE WRITTEN AS THE DEFECT, NOT AS THE FIX ([[intmap-restate-the-defect-not-
 *  the-fix]]). 「複数の runtime を作れる」 is a sentence about an implementation, and it would pass
 *  over a build where two runtimes share one registry — which is the exact failure `scope-conflict`
 *  exists to refuse and which this round must NOT introduce. What is measured is what a caller loses:
 *
 *    ① two jobs that use THE SAME dataset id answer each other's numbers — measured in two real
 *       realms (worker threads), with the same id carrying different data on each side. ⚠ An
 *       in-process 「別の runtime のつもり」 would measure this test's own bookkeeping: the kernels
 *       resolve each other by bare global name, so a realm is the unit that can hold a GIS.
 *    ② finishing with one job disturbs the other — terminating A's realm and releasing A's handle
 *       must leave B answering the same numbers it answered before.
 *    ③ a call left in flight when its job is released never settles, and a caller waiting forever
 *       re-runs work that already happened (.agents/rules/one-pass-or-a-reason.md §2-2).
 *    ④ the single-runtime path moves. Reuse, the refusals, the browser door and the instances the
 *       page reaches must be what #R783 shipped.
 *    ⑤ `scope-conflict` stops protecting what it protects: two sets of kernels under one set of
 *       global names, where a dataset id resolves in one of them and not the other. It is refused
 *       BEFORE anything is written, and what the realm already holds keeps working afterwards.
 *    ⑥ a released context leaves its kernels on the scope — under the names the next assembly is
 *       about to publish — or takes away something that was never its to remove.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORE_URL = pathToFileURL(join(ROOT, 'js/gis-core.js')).href;

/* The geodesy, as an injected dependency — the real one, the way #R783's checks take it: a stub
   would make two matching answers that are nobody's product. */
function geodesyModule() {
  const o = {};
  new Function('window', readFileSync(join(ROOT, 'js/geodesy.js'), 'utf8'))(o);
  return o.IntMapGeodesy;
}

/* ⚠ ONE REALM, MANY TESTS. node:test runs this file in one process, so every test starts by letting
   go of whatever the previous one mounted — which is itself the mechanism under test (⑥), and the
   reason these tests can be written at all. */
async function core() {
  const mod = await import('../js/gis-core.js');
  for (const c of mod.makeGisRuntime.contexts()) mod.makeGisRuntime.release(c.id);
  delete globalThis.window;
  return mod;
}

const FEATURES = (n) => Array.from({ length: n }, (_, i) => ({
  type: 'Feature', properties: { name: 'f' + i, n: i },
  geometry: { type: 'Point', coordinates: [135 + i * 0.5, 35 + i * 0.25] },
}));

/* ══ ① 同じ id を持つ 2 つのジョブが、別々のデータ・別々の状態・別々の結果になる ════════════════ */

async function spawn(mod, id, rows) {
  const ws = mod.makeGisRuntime.workerSource({ coreUrl: CORE_URL, contextId: id });
  assert.equal(ws.ok, true, ws.why);
  const worker = new Worker(ws.source, { eval: true });
  const at = mod.makeGisRuntime.attach(worker, { id: id });
  assert.equal(at.ok, true, at.why);
  const hello = await at.job.ready;
  assert.equal(hello.ok, true, JSON.stringify(hello));
  assert.equal(hello.context.id, id, 'the realm did not take the name it was given');
  /* THE SAME dataset id on both sides. That is the whole point: 「id が衝突しても混ざらない」. */
  const add = await at.job.call(['data', 'add'], [{
    id: 'src', title: 'job ' + id, features: FEATURES(rows),
    provenance: { kind: 'import', file: 'fixture.geojson', format: 'geojson', readAt: 1700000000000 },
  }]);
  /* ⚠ A DATASET IS A LIVE OBJECT OF ITS REALM. It cannot cross, and the refusal says so BY NAME and
     states that the call ran — a plain failure here would tell the caller to add it again. */
  assert.equal(add.ok, false, 'a live dataset crossed a realm boundary');
  assert.equal(add.why, 'result-not-transferable');
  assert.equal(add.detail.performed, true, 'the refusal does not say that the call ran');
  return { worker, job: at.job };
}

async function measure(job) {
  const cat = await job.call(['flow', 'find']);
  assert.equal(cat.ok, true, JSON.stringify(cat));
  const rows = (cat.value.datasets || []).filter((d) => d.id === 'src');
  const run = await job.call(['flow', 'run'], [{ op: 'filter', inputs: ['src'], params: { where: [{ field: 'n', op: '>=', value: 2 }] } }]);
  assert.equal(run.ok, true, JSON.stringify(run));
  assert.equal(run.value.ok, true, JSON.stringify(run.value));
  return {
    titles: rows.map((r) => r.title), held: rows.length ? rows[0].count : 0,
    filtered: run.value.dataset.count,
    /* ⚠ THE NEW DATASET'S ID IS NOT PART OF 「同じ答え」: each run makes one, so it advances, and it
       advances on THIS realm's own counter. Comparing it would measure the test's own call order. */
    made: run.value.dataset.id,
  };
}

test('① 同じ dataset id を持つ 2 つのジョブが、別々のデータ・別々の結果を持つ', async () => {
  const mod = await core();
  const a = await spawn(mod, 'job-a', 3);
  const b = await spawn(mod, 'job-b', 7);
  try {
    const ma = await measure(a.job);
    const mb = await measure(b.job);
    assert.deepEqual(ma.titles, ['job job-a'], '片方の registry に、もう片方の dataset が見えている');
    assert.deepEqual(mb.titles, ['job job-b'], '片方の registry に、もう片方の dataset が見えている');
    assert.equal(ma.held, 3);
    assert.equal(mb.held, 7);
    assert.equal(ma.filtered, 1, JSON.stringify(ma));
    assert.equal(mb.filtered, 5, JSON.stringify(mb));
    /* ⚠ AND THE STATE IS SEPARATE, NOT JUST THE ANSWER. Running again on one side must not change
       what the other side holds — two registries under one name is exactly the failure where a
       second 'src' overwrites the first. */
    await a.job.call(['data', 'add'], [{ id: 'src2', title: 'only-a', features: FEATURES(2), provenance: { kind: 'import', file: 'x.geojson' } }]);
    const again = await b.job.call(['flow', 'find']);
    assert.equal(again.value.datasets.some((d) => d.id === 'src2'), false, 'a dataset added in one realm appeared in the other');
  } finally {
    a.job.release(); b.job.release();
    await a.worker.terminate(); await b.worker.terminate();
  }
});

/* ══ ② 片方を中止・破棄しても、もう片方は影響を受けない ════════════════════════════════════════ */

test('② 片方のジョブを破棄し realm ごと止めても、もう片方は同じ答えを出し続ける', async () => {
  const mod = await core();
  const a = await spawn(mod, 'doomed', 3);
  const b = await spawn(mod, 'survivor', 7);
  try {
    const before = await measure(b.job);
    const rel = a.job.release();
    assert.equal(rel.ok, true);
    await a.worker.terminate();
    const after = await measure(b.job);
    assert.equal(after.filtered, before.filtered, 'もう片方の答えが、隣の realm の終了で変わった');
    assert.equal(after.held, before.held, 'もう片方の registry が、隣の realm の終了で変わった');
    assert.deepEqual(after.titles, before.titles);
    assert.notEqual(after.made, before.made, '2 度目の run が新しい dataset を作っていない（realm の状態が進んでいない）');
    /* The released handle answers, rather than hanging or throwing. */
    const dead = await a.job.call(['flow', 'find']);
    assert.equal(dead.ok, false);
    assert.equal(dead.why, 'job-released');
  } finally {
    b.job.release(); await b.worker.terminate(); await a.worker.terminate();
  }
});

/* ══ ③ 飛んでいる呼び出しは、破棄で必ず答えを返す（黙って待たせない） ═══════════════════════════ */

test('③ 破棄したとき、待っている呼び出しは全部 job-released で settle する', async () => {
  const mod = await core();
  const a = await spawn(mod, 'inflight', 5);
  try {
    const p1 = a.job.call(['flow', 'run'], [{ op: 'filter', inputs: ['src'], params: { where: [{ field: 'n', op: '>=', value: 1 }] } }]);
    const p2 = a.job.call(['flow', 'find']);
    assert.equal(a.job.waiting(), 2, '飛んでいる呼び出しが数えられていない');
    const rel = a.job.release();
    assert.equal(rel.released.pendingSettled, 2, JSON.stringify(rel));
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(r1.why, 'job-released');
    assert.equal(r2.why, 'job-released');
    assert.equal(a.job.waiting(), 0);
  } finally {
    await a.worker.terminate();
  }
});

/* ══ ③b 経路の解決は、実物の上で行われる — 手書きの転送一覧を持たない ═════════════════════════ */

test('③b 呼び出しは組み立てた実物の path で解決し、prototype へは歩かない', async () => {
  const mod = await core();
  const a = await spawn(mod, 'paths', 2);
  try {
    const unknown = await a.job.call(['flow', 'nope']);
    assert.equal(unknown.why, 'path-unknown');
    assert.equal(unknown.detail.at, 'nope');
    const proto = await a.job.call(['__proto__', 'constructor']);
    assert.equal(proto.why, 'path-refused');
    const notFn = await a.job.call(['flow']);
    assert.equal(notFn.why, 'path-not-callable');
    /* 実装が在ることの証: 同じ面の上の本物の関数は答える。 */
    const ops = await a.job.call(['ops', 'ops']);
    assert.equal(ops.ok, true, JSON.stringify(ops));
    assert.ok(ops.value.length >= 5, 'the op catalogue did not cross');
  } finally {
    a.job.release(); await a.worker.terminate();
  }
});

/* ══ ④ 単一 runtime の既存の使い方は、変更前と同じ ══════════════════════════════════════════ */

test('④ 同じ scope と同じ host で二度呼べば、同じ組が返る（#R783 ③ と同じ事実）', async () => {
  const { makeGisRuntime } = await core();
  const scope = {}; scope.IntMapGeodesy = geodesyModule();
  const host = { lang: 'en' };
  const a = makeGisRuntime({ scope: scope, host: host });
  assert.equal(a.ok, true, a.why);
  assert.equal(a.scopeInstalled, true);
  assert.equal(a.reused, false);
  assert.equal(a.externals.supplier, 'scope');
  const b = makeGisRuntime({ scope: scope, host: host });
  assert.equal(b.reused, true, '二度目が「もう済んでいる」と述べていない');
  assert.equal(b.gis, a.gis, '二度目が別の組を作った（同じ global に 2 つの registry）');
  a.gis.data.add({ id: 'one', title: 'one', features: [] });
  assert.ok(b.gis.data.get('one'), '二度目の組から、一度目に入れた dataset が見えない');
  /* The kernels are reachable exactly as before — the assembly IS the globals. */
  assert.equal(scope.IntMapData, a.gis.data);
  assert.equal(scope.IntMapGis, a.gis);
  assert.equal(globalThis.window, scope);
});

test('④ 断り方は #R783 のまま — 依存の欠落・注入していないものの拾い食い・scope 無し', async () => {
  const { makeGisRuntime } = await core();
  const miss = makeGisRuntime({ scope: {}, externals: {} });
  assert.equal(miss.why, 'dependency-missing');
  assert.equal(miss.detail.missing[0].name, 'geodesy');
  assert.equal(typeof globalThis.window, 'undefined', '拒否が window を据え置いた');

  const carries = makeGisRuntime({ scope: { IntMapLayers: { state: () => null } }, externals: { geodesy: geodesyModule() } });
  assert.equal(carries.why, 'scope-carries-uninjected');
  assert.deepEqual(carries.detail.deps.map((d) => d.name), ['layers']);

  const none = makeGisRuntime({ host: null });
  assert.equal(none.why, 'scope-missing');
  assert.equal(makeGisRuntime.contexts().length, 0, '断りが context 表に残骸を残した');
});

test('④ ブラウザ入口は同じもの — window があるだけで組み上がり、context は既定の名前を持つ', async () => {
  const mod = await core();
  const w = {}; w.IntMapGeodesy = geodesyModule();
  globalThis.window = w;
  const gis = mod.makeGisRuntime({ host: { lang: 'en' } });
  assert.equal(gis.ok, true, gis.why);
  assert.equal(gis.scopeInstalled, false, 'page の window に対して install したことにしている');
  assert.equal(gis.context.scopeSource, 'live');
  assert.equal(gis.gis.context, w.IntMapGisContext, 'scope が名乗る context と、面が名乗る context が別物');
  assert.equal(gis.gis.context.id, gis.context.id);
  mod.makeGisRuntime.release(gis);
  delete globalThis.window;
});

/* ══ ⑤ scope-conflict は今も、同じものを守っている ═══════════════════════════════════════════ */

test('⑤ 同じ realm に 2 つ目の scope は入れない — 断る前に何も書かず、先客は壊れない', async () => {
  const { makeGisRuntime } = await core();
  const first = makeGisRuntime({ scope: {}, externals: { geodesy: geodesyModule() }, contextId: 'first' });
  assert.equal(first.ok, true, first.why);
  first.gis.data.add({ id: 'kept', title: 'kept', features: [] });

  const second = { IntMapGeodesy: geodesyModule() };
  const r = makeGisRuntime({ scope: second, externals: { geodesy: geodesyModule() }, contextId: 'second' });
  assert.equal(r.ok, false, '2 つ目のカーネル一式が、同じ global 名の上に載った');
  assert.equal(r.why, 'scope-conflict');
  assert.deepEqual(r.detail.heldBy, ['first'], '誰が持っているかを述べていない');
  assert.ok(r.detail.instead.length > 20, '次の手を述べていない');

  /* ⚠ THE REFUSAL WROTE NOTHING. A scope that came back carrying half an assembly would be the
     「拒否が自分で作った状態を理由に次を断る」 shape #R783 measured. */
  assert.equal(typeof second.IntMapData, 'undefined');
  assert.equal(typeof second.IntMapGis, 'undefined');
  assert.equal(makeGisRuntime.contexts().length, 1);

  /* And what it protects: the realm's globals still resolve to the FIRST assembly, so an id that
     was registered there still resolves there. */
  assert.equal(globalThis.window.IntMapData, first.gis.data);
  assert.ok(first.gis.data.get('kept'));
  assert.equal(makeGisRuntime.contexts()[0].ambient, true);
  makeGisRuntime.release('first');
});

test('⑤ 同じ scope に 2 つ目を載せると、1 つ目は ambient でなくなる — 信じるのではなく測る', async () => {
  const { makeGisRuntime } = await core();
  const scope = {}; scope.IntMapGeodesy = geodesyModule();
  const a = makeGisRuntime({ scope: scope, host: { lang: 'en' }, contextId: 'host-a' });
  const b = makeGisRuntime({ scope: scope, host: { lang: 'jp' }, contextId: 'host-b' });
  assert.equal(a.ok, true, a.why);
  assert.equal(b.ok, true, b.why);
  assert.notEqual(a.gis, b.gis, 'host が違えば別の組 — #R783 の契約');
  const live = makeGisRuntime.contexts();
  assert.equal(live.length, 2);
  assert.deepEqual(live.map((c) => c.ambient), [false, true],
    '2 つの組が同時に ambient だと報告された（bare global を読むカーネルには不可能な状態）');
  /* ⚠ AND THAT IS WHY 「同じ realm に 2 つ」 IS NOT ISOLATION: a itself can no longer find its own
     registry, because the names it published now hold b's kernels. */
  assert.equal(scope.IntMapData, b.gis.data);
  const taken = makeGisRuntime({ scope: scope, host: { lang: 'de' }, contextId: 'host-a' });
  assert.equal(taken.why, 'context-id-taken');
  makeGisRuntime.release('host-a');
  makeGisRuntime.release('host-b');
});

/* ══ ⑥ 片付けは、自分が置いたものだけを、置いた先から取る ══════════════════════════════════════ */

test('⑥ release は自分の publish だけを外し、realm を次の組へ開け直す', async () => {
  const { makeGisRuntime } = await core();
  const scope = {};
  const mine = geodesyModule();
  const a = makeGisRuntime({ scope: scope, externals: { geodesy: mine }, contextId: 'a' });
  assert.equal(a.ok, true, a.why);
  assert.equal(scope.IntMapGeodesy, mine, '注入した依存が scope に載っていない');

  const rel = makeGisRuntime.release(a);
  assert.equal(rel.ok, true, rel.why);
  /* ⚠ THE LIST IS THE MOUNT'S, NOT A COPY: every kernel the assembly published comes off, including
     the one added most recently. A hand-written list here would leave that one behind. */
  assert.ok(rel.released.unpublished.includes('IntMapGis'));
  assert.ok(rel.released.unpublished.includes('IntMapGisContext'));
  /* ⚠ js/gis-panel.js PUBLISHES ITSELF AND WAS IN NEITHER LIST until this check was first run: it is
     the one kernel the mount's reachability loop has never verified, so a released context left
     IntMapGisPanel sitting on the scope under the name the NEXT assembly publishes. */
  assert.ok(rel.released.unpublished.includes('IntMapGisPanel'), 'panel が scope に置き去りにされた');
  assert.deepEqual(rel.released.externalsRemoved, ['geodesy'], '注入したものが scope に残った');
  assert.deepEqual(rel.released.keptForeign, []);
  assert.equal(rel.released.windowUninstalled, true);
  assert.equal(typeof globalThis.window, 'undefined');
  /* ⚠ IntMapModules IS THE ONE THING LEFT, DELIBERATELY: it is the door to the ASSEMBLER, not part of
     this assembly, and taking it off would remove a working door from a page because one runtime on
     it finished. Everything the assembly itself published is gone. */
  const left = Object.keys(scope).filter((k) => k.indexOf('IntMap') === 0);
  assert.deepEqual(left, ['IntMapModules'], JSON.stringify(left));
  assert.equal(typeof scope.IntMapModules.gisCore, 'function', '組み立て器への扉ごと消した');
  assert.equal(makeGisRuntime.contexts().length, 0);

  /* The realm is open again — which is the whole reason `scope-conflict` is now a condition rather
     than a life sentence. */
  const b = makeGisRuntime({ scope: {}, externals: { geodesy: geodesyModule() }, contextId: 'b' });
  assert.equal(b.ok, true, b.why);
  makeGisRuntime.release('b');
  assert.equal(makeGisRuntime.release('b').why, 'context-unknown', '二度目の release が黙って成功を返した');
});

test('⑥ 他人のものは外さない — 上書きされた名前は消さずに名指しで報告する', async () => {
  const { makeGisRuntime } = await core();
  const scope = {}; scope.IntMapGeodesy = geodesyModule();
  const a = makeGisRuntime({ scope: scope, contextId: 'owner' });
  assert.equal(a.ok, true, a.why);
  const foreign = { mine: true };
  scope.IntMapGisOps = foreign;   /* somebody else took the name after we published on it */
  const rel = makeGisRuntime.release('owner');
  assert.equal(scope.IntMapGisOps, foreign, '自分のものでない値を消した');
  assert.ok(rel.released.keptForeign.includes('IntMapGisOps'), '消さなかったことを述べていない');
  assert.equal(rel.released.unpublished.includes('IntMapGisOps'), false);
  /* The geodesy was the scope's own, never injected by this call — so it stays. */
  assert.ok(scope.IntMapGeodesy, 'page が持っていた依存を、こちらが片付けで持ち去った');
  delete globalThis.window;
});

/* ══ ⑦ 一覧は宣言から導く — 転送先も供給元も手書きしない ═══════════════════════════════════════ */

test('⑦ worker の source は EXTERNALS と 1 つの URL から導かれる', async () => {
  const { makeGisRuntime } = await core();
  assert.equal(makeGisRuntime.workerSource({}).why, 'core-url-missing',
    'どこに js/gis-core.js があるかを推測した（束ねられた chunk の中では相対パスは何も指さない）');
  const ws = makeGisRuntime.workerSource({ coreUrl: 'https://example.test/js/gis-core.js' });
  assert.equal(ws.ok, true, ws.why);
  const declared = makeGisRuntime.externals.filter((d) => d.module).map((d) => d.name);
  assert.deepEqual(ws.suppliers.map((s) => s.name), declared, '供給元の一覧が宣言と別に書かれている');
  for (const s of ws.suppliers) assert.ok(ws.source.includes(s.url), s.name + ' が source に入っていない');
  assert.ok(ws.source.includes('https://example.test/js/geodesy.js'), '供給元の URL が 1 つの入力から導かれていない');
  /* ⚠ NO TOP-LEVEL await: the text must run as a module AND as the CommonJS body Node evaluates for
     `new Worker(src, { eval: true })`. */
  assert.ok(/\(async \(\) => \{/.test(ws.source), 'top-level await に戻ると eval worker で走らない');
  assert.equal(/^\s*import\s/m.test(ws.source), false, '静的 import は eval worker では評価できない');
});
