/* ============================================================================
 *  #R819 · 正しい再計算と、正しい再利用の両立 — js/gis-project.js の結果キャッシュ
 * ----------------------------------------------------------------------------
 *  js/gis-project.js holds RECIPES and recomputes, on purpose: a stored answer beside a changed input
 *  is the one state it exists to prevent. As analyses grow, 「再現できること」 and 「毎回ぜんぶ計算し
 *  直すこと」 have to come apart — and the danger in taking them apart is exactly the state the file
 *  was built to refuse.
 *
 *  ⚠ THE INVARIANTS BELOW ARE WRITTEN AS THE DEFECT, NOT AS THE FIX
 *  ([[intmap-restate-the-defect-not-the-fix]]). 「キャッシュが効く」 is a sentence about an
 *  implementation and it would pass over a cache that hands back yesterday's answer for today's data.
 *  What is measured is what a reader would lose:
 *
 *    ① a question already answered under conditions NOTHING has moved is not computed a second time —
 *       and the module says which steps those were, rather than reporting them as recomputed
 *    ②–⑥ each of the five conditions, moved ONE AT A TIME, makes the answer a different answer:
 *       the inputs' content, the parameters, the kernel versions, what the reader declared the data
 *       MEANS, and which upstream the bytes came from. ⚠ Measured against a control: two identical
 *       chains produce the SAME key, so «always different» cannot pass these five
 *    ⑦ with the cache switched off, the path and the answer are the ones this module had before —
 *       identical features, and not one reuse
 *    ⑧ a project reopened from its recipe gives the same answer whether or not the cache was warm
 *    ⑨ a reused record carries everything the computed one carried — including the unit a column
 *       inherited, which nothing in the payload can re-derive — and where the round trip does NOT
 *       reproduce the record the op made, THE ENTRY IS DROPPED AND THE KERNEL RUNS. A disagreement
 *       between recipe and memory has to be unreachable rather than unlikely
 *    ⑩ an engine that cannot be measured gets NO key: 「測れなかった」 is not 「同じ」 here either,
 *       and the run takes the path it took before
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* Same boot as tests/r749-gis-persistence-checks: js/geodesy.js publishes onto `window` at top level
   and exports nothing, so it is evaluated the way a browser evaluates it. */
function installWindow() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  return w;
}

/* The in-memory IndexedDB of tests/r749-gis-persistence-checks — enough for save()/load() and nothing
   else. ⚠ The cache itself needs none of it: it is this tab's memory, not a second file on disk. */
function fakeIDB(store) {
  const fire = (obj, name, arg) => { setTimeout(() => { const h = obj['on' + name]; if (h) h(arg || { target: obj }); }, 0); };
  function req(result) { const r = { result, error: null }; fire(r, 'success'); return r; }
  const os = {
    put: (v) => { store.set(v.id, JSON.parse(JSON.stringify(v))); return req(v.id); },
    get: (k) => req(store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : undefined),
    delete: (k) => { const had = store.delete(k); return req(had); },
    getAll: () => req(Array.from(store.values()).map((v) => JSON.parse(JSON.stringify(v)))),
    openCursor: () => {
      const rows = Array.from(store.values()); let i = 0;
      const r = { result: null, error: null };
      const step = () => {
        if (i >= rows.length) { r.result = null; }
        else { const v = JSON.parse(JSON.stringify(rows[i++])); r.result = { value: v, key: v.id, continue: () => { step(); } }; }
        fire(r, 'success');
      };
      step(); return r;
    },
  };
  return {
    open: () => {
      const db = {
        objectStoreNames: { contains: () => true },
        createObjectStore: () => os,
        transaction: () => { const tx = { objectStore: () => os, oncomplete: null, onerror: null, onabort: null, error: null }; setTimeout(() => fire(tx, 'complete'), 0); return tx; },
        close: () => { },
      };
      const r = { result: db, error: null, onupgradeneeded: null };
      setTimeout(() => { if (r.onupgradeneeded) r.onupgradeneeded({ target: r }); if (r.onsuccess) r.onsuccess({ target: r }); }, 0);
      return r;
    },
  };
}

async function boot(store) {
  const w = installWindow();
  w.indexedDB = globalThis.indexedDB = fakeIDB(store || new Map());
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const { makeGisProject } = await import('../js/gis-project.js');
  const data = makeGisDatasets();
  const geometry = makeGisGeometry();
  const ops = makeGisOps();
  const project = makeGisProject();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisProject = project;
  /* The ops are mounted through a counter, because 「使い回した」 is only a claim if 「走らなかった」
     can be measured. version() is passed through: it is what makes the engine measurable. */
  const runs = { n: 0 };
  w.IntMapGisOps = Object.assign({}, ops, { run: (s, o) => { runs.n++; return ops.run(s, o); } });
  await geometry.ready();
  return { w, data, geometry, ops, project, runs };
}

const feat = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
const pt = (lng, lat, p) => feat({ type: 'Point', coordinates: [lng, lat] }, p);

const WHERE = [{ field: 'pop', op: '>=', value: 100 }];

/* One chain — an import, a step made from it, and the key of a SECOND step made from that. Every axis
   test moves exactly one thing in here and asks for the key again. ⚠ The step being keyed reads an OP
   as its input, which is what separates 「入力の中身」 from 「その入力がどの上流から来たか」: the
   upstream moves without the op's own description or bytes moving at all. */
async function chainKey(mut) {
  const m = mut || {};
  const B = await boot();
  const src = B.data.add({
    id: 'src', title: 'src',
    provenance: m.provenance || { kind: 'import', file: 'pop.csv', retrievedAt: '2026-01-01' },
    features: [
      pt(139.7, 35.6, { name: 'a', pop: m.pop == null ? 240 : m.pop }),
      pt(135.5, 34.7, { name: 'b', pop: 80 }),
    ],
  });
  if (m.declare) assert.equal(B.data.declareField(src.id, m.declare.field, m.declare.spec).ok, true);
  const mid = await B.ops.run({ id: 'mid', op: 'filter', inputs: [src.id], params: { where: WHERE } });
  assert.equal(mid.ok, true, JSON.stringify(mid));
  if (m.opsVersion) B.w.IntMapGisOps = Object.assign({}, B.ops, { version: () => m.opsVersion });
  const k = await B.project.cache.keyFor({ op: 'filter', inputs: ['mid'], params: { where: m.where || WHERE } });
  return k;
}

/* ══ ① 条件が全部一致すれば、二度目は計算されない ═══════════════════════════════════════════ */

test('R819 ① a question already answered under unmoved conditions is not computed again', async () => {
  const B = await boot();
  const src = B.data.add({ title: 'sites', provenance: { kind: 'import', file: 'a.csv' }, features: [pt(0, 0, { pop: 240 }), pt(1, 1, { pop: 80 })] });
  const buf = await B.ops.run({ op: 'buffer', inputs: [src.id], params: { radiusKm: 5 } });
  assert.equal(buf.ok, true, JSON.stringify(buf));
  const id = buf.dataset.id;

  const first = await B.project.setParams(id, { radiusKm: 10 });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.deepEqual(first.reused, [], 'nothing had been remembered under these conditions yet');
  const back = await B.project.setParams(id, { radiusKm: 5 });
  assert.equal(back.ok, true, JSON.stringify(back));

  const runsBefore = B.runs.n;
  const again = await B.project.setParams(id, { radiusKm: 10 });
  assert.equal(again.ok, true, JSON.stringify(again));
  assert.deepEqual(again.rebuilt, [id], 'the step is still rebuilt — its record is new, whoever produced the numbers');
  assert.deepEqual(again.reused, [id], 'and the module says WHICH steps were not recomputed');
  assert.equal(B.runs.n, runsBefore, 'the kernel was asked again for an answer it had already given');

  /* The reused answer is the answer, not a lighter version of it. */
  const area = B.ops.areaKm2(B.data.get(id).features()[0].geometry);
  assert.ok(area > 250 && area < 380, '10 km buffer ≈ 314 km², got ' + area);
  assert.deepEqual(B.data.get(id).provenance.params, { radiusKm: 10 }, 'the recipe is still the recipe');
  assert.ok(B.project.cache.stats().hits >= 1, 'the receipt says it was used');
});

/* ══ ②–⑥ 5 つの条件を 1 つずつ動かす（＋動かさない対照） ═══════════════════════════════════ */

test('R819 ②–⑥ each of the five conditions, moved alone, makes it a different answer', async () => {
  const base = await chainKey(null);
  assert.equal(base.ok, true, JSON.stringify(base));
  assert.equal(typeof base.key, 'string');

  /* ⚠ THE CONTROL COMES FIRST. Without it, a key that were simply random would pass all five. */
  const same = await chainKey(null);
  assert.equal(same.key, base.key, 'two identical chains must key the same, or the five tests below measure nothing');

  /* ② 入力の中身 — one property value, nothing else */
  const content = await chainKey({ pop: 241 });
  assert.notEqual(content.key, base.key, 'a changed input value must not be answered out of the old answer');

  /* ③ 処理パラメーター */
  const params = await chainKey({ where: [{ field: 'pop', op: '>=', value: 101 }] });
  assert.notEqual(params.key, base.key, 'a changed parameter is a different question');

  /* ④ 計算カーネルの版 — #R743 changed what `union` and the distance prefilter RETURN */
  const kernel = await chainKey({ opsVersion: 'ops-999' });
  assert.notEqual(kernel.key, base.key, 'the same recipe on a different kernel is not the same answer');

  /* ⑤ 解析条件 — the same bytes, declared to MEAN something else. Nothing in the payload moves. */
  const declared = await chainKey({ declare: { field: 'pop', spec: { type: 'number', unit: '人' } } });
  assert.notEqual(declared.key, base.key, 'a column that now means 人 is not the column it was');

  /* ⑥ 外部データの版 — the ancestor's upstream moved; the input's own bytes and description did not */
  const upstream = await chainKey({ provenance: { kind: 'import', file: 'pop.csv', retrievedAt: '2026-06-01' } });
  assert.notEqual(upstream.key, base.key, 'bytes that hashed the same are not the same acquisition');
});

/* ══ ⑦ 無効にしたときは、いまとまったく同じ経路・同じ答え ═════════════════════════════════════ */

test('R819 ⑦ with the cache off, the path and the answer are the ones this module had before', async () => {
  const B = await boot();
  const src = B.data.add({ title: 'sites', provenance: { kind: 'import', file: 'a.csv' }, features: [pt(0, 0, { pop: 240 }), pt(1, 1, { pop: 80 })] });
  const buf = await B.ops.run({ op: 'buffer', inputs: [src.id], params: { radiusKm: 5 } });
  const id = buf.dataset.id;

  /* warm, then off */
  await B.project.setParams(id, { radiusKm: 10 });
  await B.project.setParams(id, { radiusKm: 5 });
  const warm = JSON.parse(JSON.stringify(B.data.get(id).features()));

  assert.equal(B.project.cache.setEnabled(false), false);
  assert.equal(B.project.cache.stats().entries, 0, 'a cache nobody may consult is not a saving — it is forgotten');
  const runsBefore = B.runs.n;
  const off = await B.project.setParams(id, { radiusKm: 10 });
  assert.equal(off.ok, true, JSON.stringify(off));
  assert.deepEqual(off.reused, [], 'nothing is reused when the cache is off');
  assert.equal(B.runs.n, runsBefore + 1, 'the kernel ran, exactly as it did before this round');
  const cold = JSON.parse(JSON.stringify(B.data.get(id).features()));

  await B.project.setParams(id, { radiusKm: 5 });
  assert.deepEqual(JSON.parse(JSON.stringify(B.data.get(id).features())), warm, 'the same recipe gives the same answer with the cache off');
  assert.ok(cold.length > 0);
  B.project.cache.setEnabled(true);
});

/* ══ ⑧ レシピからの再計算は、キャッシュの有無に関わらず同じ答え ═══════════════════════════════ */

test('R819 ⑧ a project reopened from its recipe answers the same, warm or cold', async () => {
  const store = new Map();
  const B = await boot(store);
  if (!B.project.available()) { assert.ok(true, 'IndexedDB shim not accepted — the store says so rather than pretending'); return; }
  const src = B.data.add({ title: 'sites', provenance: { kind: 'import', file: 'a.csv' }, features: [pt(0, 0, { pop: 240 }), pt(1, 1, { pop: 80 })] });
  const f = await B.ops.run({ op: 'filter', inputs: [src.id], params: { where: WHERE } });
  assert.equal(f.ok, true, JSON.stringify(f));
  const saved = await B.project.save('p');
  assert.equal(saved.ok, true, JSON.stringify(saved));

  /* cold: nothing has been remembered, so every step is run */
  B.data.clear();
  const cold = await B.project.load(saved.id);
  assert.equal(cold.ok, true, JSON.stringify(cold));
  assert.deepEqual(cold.reused, [], 'the first open computes');
  const coldFeatures = JSON.parse(JSON.stringify(B.data.get(f.dataset.id).features()));
  const coldDesc = B.data.describe(f.dataset.id);

  /* warm: the same project, the same inputs, the same kernels */
  B.data.clear();
  const runsBefore = B.runs.n;
  const warm = await B.project.load(saved.id);
  assert.equal(warm.ok, true, JSON.stringify(warm));
  assert.deepEqual(warm.reused, [f.dataset.id], 'the op step came back without being recomputed');
  assert.equal(B.runs.n, runsBefore, 'and the kernel was not asked');
  const warmFeatures = JSON.parse(JSON.stringify(B.data.get(f.dataset.id).features()));
  const warmDesc = B.data.describe(f.dataset.id);

  assert.deepEqual(warmFeatures, coldFeatures, 'the same recipe, two openings, one answer');
  delete coldDesc.createdAt; delete warmDesc.createdAt;
  assert.deepEqual(warmDesc, coldDesc, 'and the record around it is the same record, field for field');
});

/* ══ ⑨ 使い回した記録は、計算した記録が持っていたものを全部持つ／持たないなら使わない ═══════════ */

test('R819 ⑨ a reused record carries what the computed one carried, and a disagreement is never used', async () => {
  const B = await boot();
  const src = B.data.add({ title: 'pop', provenance: { kind: 'import', file: 'pop.csv' }, features: [pt(0, 0, { pop: 240 }), pt(1, 1, { pop: 80 })] });
  /* 「この列は 人 で数えている」 — nothing in the digits can re-derive it, and an op's output carries
     it as `inherited`. A cache that rebuilt the record from its features alone would lose exactly
     this, which is why the restore is CHECKED against the description rather than trusted. */
  assert.equal(B.data.declareField(src.id, 'pop', { type: 'number', unit: '人' }).ok, true);
  const f = await B.ops.run({ op: 'filter', inputs: [src.id], params: { where: WHERE } });
  assert.equal(f.ok, true, JSON.stringify(f));
  const id = f.dataset.id;
  const unitThen = B.data.describe(id).fields.find((c) => c.name === 'pop');
  assert.equal(unitThen.unit, '人', 'the op carried the unit onto its own output');
  assert.equal(unitThen.unitStated, 'inherited');

  /* warm the entry for `where: WHERE`, then come back to it */
  await B.project.setParams(id, { where: [{ field: 'pop', op: '>=', value: 1 }] });
  await B.project.setParams(id, { where: WHERE });
  const runsBefore = B.runs.n;
  const hit = await B.project.setParams(id, { where: [{ field: 'pop', op: '>=', value: 1 }] });
  assert.deepEqual(hit.reused, [id], JSON.stringify(hit));
  assert.equal(B.runs.n, runsBefore, 'reused rather than recomputed');
  const unitNow = B.data.describe(id).fields.find((c) => c.name === 'pop');
  assert.equal(unitNow.unit, '人', 'a reused record must not come back meaning nothing');
  assert.equal(unitNow.unitStated, 'inherited');
  assert.equal(unitNow.unitStatedAt, unitThen.unitStatedAt, 'and who said it in the first place is still on it');
  assert.equal(unitNow.unitFrom, unitThen.unitFrom);

  /* ⚠ NOW MAKE THE ROUND TRIP DISAGREE. The registry is wrapped so that THIS record describes itself
     differently from the way it did when the entry was written — the shape a cache would otherwise
     hand over quietly. The entry must be dropped and the kernel must run. */
  const real = B.data;
  B.w.IntMapData = Object.assign({}, real, {
    describe: (which) => { const d = real.describe(which); if (d && which === id) d.title = 'tampered'; return d; },
  });
  const mismBefore = B.project.cache.stats().mismatched;
  const runsBefore2 = B.runs.n;
  const after = await B.project.setParams(id, { where: WHERE });
  assert.equal(after.ok, true, JSON.stringify(after));
  assert.deepEqual(after.reused, [], 'a record that does not come back the way it went in is not an answer');
  assert.equal(B.project.cache.stats().mismatched, mismBefore + 1, 'and the disagreement is counted, not swallowed');
  assert.equal(B.runs.n, runsBefore2 + 1, 'the kernel decided it');
  assert.equal(real.get(id).features().length, 1, 'and the answer is the recipe\'s own: one row over 100');
  B.w.IntMapData = real;
});

/* ══ ⑩ 測れないエンジンには鍵が無い ═══════════════════════════════════════════════════════════ */

test('R819 ⑩ an engine that cannot be measured gets no key, and the run is the run it always was', async () => {
  const B = await boot();
  const src = B.data.add({ title: 'sites', provenance: { kind: 'import', file: 'a.csv' }, features: [pt(0, 0, { pop: 240 }), pt(1, 1, { pop: 80 })] });
  const f = await B.ops.run({ op: 'filter', inputs: [src.id], params: { where: WHERE } });
  const id = f.dataset.id;

  /* A kernel that states a version of null is 「測れなかった」 — compareEngine's third answer, and the
     one this module must never report as 「同じ」. */
  B.w.IntMapGisOps = Object.assign({}, B.ops, { run: (s, o) => { B.runs.n++; return B.ops.run(s, o); }, version: () => null });
  const k = await B.project.cache.keyFor({ op: 'filter', inputs: [src.id], params: { where: WHERE } });
  assert.equal(k.ok, false);
  assert.equal(k.reason, 'engine-unmeasurable');

  const runsBefore = B.runs.n;
  const a = await B.project.setParams(id, { where: [{ field: 'pop', op: '>=', value: 1 }] });
  const b = await B.project.setParams(id, { where: WHERE });
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(b.ok, true, JSON.stringify(b));
  assert.deepEqual(b.reused, [], 'nothing is reused when the conditions cannot be stated');
  assert.equal(B.runs.n, runsBefore + 2, 'both ran');
  assert.equal(B.data.get(id).features().length, 1);

  /* The cache says so rather than pretending: an unkeyable run is counted. */
  assert.ok(B.project.cache.stats().unkeyable >= 2);
});

/* ══ 部分結果の受け皿（#R819 の warp が窓単位で書き出すもの） ═════════════════════════════════
   ⚠ NOTHING IN js/gis-project.js PRODUCES ONE. What is measured here is that the door exists in the
   shape a producer of pieces would need: the same five axes plus WHICH piece, so a window's result is
   never keyed by a second vocabulary for 「同じ条件か」. */

test('R819 ⑪ a piece of a step keys off the same conditions plus which piece it is', async () => {
  const B = await boot();
  const src = B.data.add({ title: 'grid-src', provenance: { kind: 'import', file: 'a.csv' }, features: [pt(0, 0, { pop: 240 })] });
  const step = { op: 'filter', inputs: [src.id], params: { where: WHERE } };

  const whole = await B.project.cache.keyFor(step);
  const w1 = await B.project.cache.keyFor(step, { window: { x: 0, y: 0, w: 256, h: 256 } });
  const w2 = await B.project.cache.keyFor(step, { window: { x: 256, y: 0, w: 256, h: 256 } });
  assert.equal(whole.ok, true);
  assert.equal(w1.ok, true);
  assert.notEqual(w1.key, whole.key, 'a piece is not the whole');
  assert.notEqual(w1.key, w2.key, 'and one piece is not another');

  assert.equal(B.project.cache.putValue(w1.key, { tile: [1, 2, 3] }), true);
  assert.deepEqual(B.project.cache.getValue(w1.key), { tile: [1, 2, 3] }, 'what was put under those conditions comes back');
  assert.equal(B.project.cache.getValue(w2.key), null, 'and nothing comes back under conditions nobody wrote');
});
