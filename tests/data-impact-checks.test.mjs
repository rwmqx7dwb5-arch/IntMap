/* ============================================================================
 *  IntMap · data-impact — 上流データの更新 → 作り直すべき分析の特定と再実行
 * ----------------------------------------------------------------------------
 *  ① 版の観測はグラフの現在版と突き合わされ、食い違うものだけが更新になる（新規・同版は更新でない）
 *  ② 候補は動かす前に出て、上流から順に並び、動かしたあと graph.staleness と過不足なく一致する
 *  ③ 再実行は 1 回だけ・上流順。失敗の下流は blocked（古い入力で新しい日付の答えを作らない）
 *  ④ 実データ: 533 社のプロファイルの工場拠点 → 格子 → 集計（産業集積）が、拠点の更新で候補に挙がり、
 *     本物の GIS 演算で作り直され、結果が変わる
 * ==========================================================================*/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test, after } from 'node:test';
import { makeEvidenceGraph, fingerprint } from '../js/evidence-graph.js';
import { bindGis } from '../js/evidence-graph-record.js';
import { diffObserved, planRefresh, applyUpdates, executePlan } from '../js/data-impact.js';

const _saved = { window: globalThis.window };
after(() => { globalThis.window = _saved.window; });

test('① diffObserved: only a differing version is an update', () => {
  const g = makeEvidenceGraph();
  g.putSource({ type: 'dataset', key: 'a', version: 'v1' });
  g.putSource({ type: 'dataset', key: 'u' });
  const r = diffObserved(g, [{ type: 'dataset', key: 'a', version: 'v1' }, { type: 'dataset', key: 'u', version: 'v9' }, { type: 'dataset', key: 'never', version: 'x' }]);
  assert.deepEqual(r.updates.map((u) => u.key), ['u']);
  assert.equal(r.updates[0].from, 'unversioned');
  assert.deepEqual(r.unknown, ['src:dataset:never']);
});

function chain() {
  const g = makeEvidenceGraph();
  const s = g.putSource({ type: 'dataset', key: 'fac', version: 'v1', meta: { dataset: 'ds-1' } });
  const o = g.putSource({ type: 'dataset', key: 'other', version: 'o1', meta: { dataset: 'ds-0' } });
  const a = g.putDerived({ type: 'gis_op', label: 'grid', inputs: [s.id], calc: { op: 'grid', params: { cellKm: 1 } }, output: { count: 1 }, meta: { dataset: 'ds-2' } });
  const b = g.putDerived({ type: 'gis_op', label: 'agg', inputs: [a.id, s.id], calc: { op: 'aggregate', params: { stat: 'count' } }, output: { count: 2 }, meta: { dataset: 'ds-3' } });
  const m = g.putDerived({ type: 'metric', label: 'share', inputs: [b.id], calc: { op: 'share' }, output: { value: 4 } });
  const free = g.putDerived({ type: 'gis_op', label: 'untouched', inputs: [o.id], calc: { op: 'buffer' }, output: { count: 1 }, meta: { dataset: 'ds-4' } });
  return { g, s, o, a, b, m, free };
}

test('② plan is read-only, ordered upstream-first, and equals what staleness then finds', () => {
  const { g, s, a, b, m, free } = chain();
  const u = [{ id: s.id, version: 'v2' }];
  const plan = planRefresh(g, u);
  assert.equal(g.staleness(b.id), null, 'planning moves nothing');
  assert.deepEqual(plan.entries.map((e) => e.id), [a.id, b.id, m.id]);
  assert.deepEqual(plan.entries.map((e) => e.depth), [0, 1, 2]);
  assert.deepEqual(plan.entries.map((e) => e.action), ['rerun', 'rerun', 'review']);
  assert.ok(!plan.entries.some((e) => e.id === free.id));
  assert.deepEqual(plan.entries[1].inputDatasets, ['ds-2', 'ds-1']);
  const ap = applyUpdates(g, u);
  assert.deepEqual(ap.mismatch, { plannedNotStale: [], staleNotPlanned: [] });
  assert.equal(ap.moved.length, 1);
  assert.equal(planRefresh(g, u).entries.length, 0, 'already at v2: nothing to plan');
});

test('② an unversioned source feeding results is reported as unwatched, not as fine', () => {
  const g = makeEvidenceGraph();
  const s = g.putSource({ type: 'dataset', key: 'x' });
  g.putDerived({ type: 'gis_op', inputs: [s.id], calc: { op: 'buffer' }, output: { count: 1 } });
  assert.deepEqual(planRefresh(g, []).unwatched, [s.id]);
});

test('③ executePlan runs once, upstream-first; a failure blocks what reads it; review is skipped', async () => {
  const { g, s } = chain();
  const plan = planRefresh(g, [{ id: s.id, version: 'v2' }]);
  const calls = [];
  const ok = await executePlan(plan, async (e) => { calls.push(e.op); return { ok: true, id: 'n-' + e.op }; });
  assert.deepEqual(calls, ['grid', 'aggregate']);
  assert.deepEqual(ok.counts, { done: 2, failed: 0, blocked: 0, skipped: 1 });
  const bad = await executePlan(plan, async (e) => (e.op === 'grid' ? { ok: false, why: 'upstream-5xx' } : { ok: true }));
  assert.deepEqual(bad.results.map((r) => r.status), ['failed', 'blocked', 'skipped']);
  assert.equal(bad.ok, false);
  const thrown = await executePlan(plan, async () => { throw new Error('boom'); });
  assert.equal(thrown.results[0].why, 'threw');
});

test('④ real data: company factory sites → grid → aggregate is a candidate on update, re-run with the real GIS ops', async () => {
  const w = {}; globalThis.window = w;
  new Function('window', fs.readFileSync(new URL('../js/geodesy.js', import.meta.url), 'utf8'))(w);
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
  assert.equal(await geometry.ready(), true);

  const dir = new URL('../data/companies/profiles/', import.meta.url);
  const facs = [];
  for (const f of fs.readdirSync(dir)) {
    const p = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
    for (const x of p.facilities || []) if (x.group === 'factory' && isFinite(x.lon) && isFinite(x.lat)) facs.push({ co: p.id, id: x.id, lon: x.lon, lat: x.lat });
  }
  assert.ok(facs.length > 500, 'the bundle really carries factory sites: ' + facs.length);
  const feats = (a) => a.map((x) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x.lon, x.lat] }, properties: { id: x.id, co: x.co } }));
  const ver = (a) => fingerprint(a.map((x) => x.id).sort());
  const KEY = 'companies:factories';

  const g = makeEvidenceGraph();
  const bind = bindGis(g, data, { opVersion: () => ops.version() });
  const ds = data.add({ title: 'factories', features: feats(facs), provenance: { kind: 'layer', layer: KEY, sourceVersion: ver(facs) } });
  const grid = await ops.run({ op: 'grid', inputs: [ds.id], params: { shape: 'square', cellKm: 300 } });
  const agg = await ops.run({ op: 'aggregate', inputs: [grid.dataset.id, ds.id], params: { stat: 'count', outName: 'n' } });
  assert.ok(grid.ok && agg.ok);

  /* the upstream moves: 2 new sites, 1 closed */
  const next = facs.slice(1).concat([{ co: 'x', id: 'new-1', lon: 139.7, lat: 35.6 }, { co: 'x', id: 'new-2', lon: 139.8, lat: 35.7 }]);
  const { updates } = diffObserved(g, [{ type: 'dataset', key: KEY, version: ver(next) }]);
  assert.equal(updates.length, 1);
  const plan = planRefresh(g, updates);
  assert.deepEqual(plan.entries.map((e) => e.op), ['grid', 'aggregate']);
  assert.deepEqual(applyUpdates(g, updates).mismatch, { plannedNotStale: [], staleNotPlanned: [] });

  const dsNew = data.add({ title: 'factories', features: feats(next), provenance: { kind: 'layer', layer: KEY, sourceVersion: ver(next) } });
  const made = new Map([[ds.id, dsNew.id]]);
  const res = await executePlan(plan, async (e) => {
    const r = await ops.run({ op: e.op, inputs: e.inputDatasets.map((d) => made.get(d) || d), params: e.params });
    if (r.ok) made.set(e.dataset, r.dataset.id);
    return { ok: r.ok, id: r.ok ? r.dataset.id : null, why: r.why };
  });
  assert.equal(res.ok, true, JSON.stringify(res.results));
  const newAgg = made.get(agg.dataset.id);
  assert.ok(newAgg && newAgg !== agg.dataset.id, 'a new output, not the old one overwritten');
  /* the re-run output is itself current in the graph; the old one is the stale one */
  assert.equal(g.staleness(bind.refOf(newAgg)), null);
  assert.ok(g.staleness(bind.refOf(agg.dataset.id)));
});

test('⑤ the page-shared graph exposes the refresh API over the one graph', async () => {
  const { sharedEvidenceGraph } = await import('../js/evidence-graph-record.js');
  const s = sharedEvidenceGraph({});
  const src = s.graph.putSource({ type: 'dataset', key: 'shared-probe', version: 'v1' });
  s.graph.putDerived({ type: 'gis_op', inputs: [src.id], calc: { op: 'buffer' }, output: { count: 1 } });
  const { updates } = s.refresh.diff([{ type: 'dataset', key: 'shared-probe', version: 'v2' }]);
  assert.equal(s.refresh.plan(updates).entries.length, 1);
});
