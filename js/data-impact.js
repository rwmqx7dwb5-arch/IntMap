/* ============================================================================
 *  IntMap · DATA IMPACT — 上流データが更新されたとき、どの分析を作り直すべきか
 * ----------------------------------------------------------------------------
 *  「元データの版が変わった」を検出する側（鮮度・上流の指紋）と、「その元データから何が作られたか」を
 *  覚えている側（js/evidence-graph.js の依存グラフ）は別々に存在した。この 1 枚がその間を埋める:
 *
 *      observed 版の観測 [{type,key,version}]          ─ diffObserved ─▶ updates（グラフの現在版と食い違うものだけ）
 *      updates                                         ─ planRefresh  ─▶ 作り直し候補（上流から順に・動かす前に読むだけ）
 *      updates                                         ─ applyUpdates ─▶ 版を進め、候補が本当に stale になったか照合
 *      plan + runner                                   ─ executePlan  ─▶ 上流から順に再実行（失敗の下流は blocked）
 *
 *  ⚠ 判定はグラフの wouldStale / staleness のものを使い、ここに 2 つ目の「何が古いか」の規則を持たない。
 *  ⚠ 版が分からない（unversioned）元データは、更新を検出できない。黙って「更新なし」にせず `unwatched` に
 *    数える（.agents/rules/one-pass-or-a-reason.md §5: 確認できなかったは失敗でも無事でもない）。
 *  ⚠ 再実行は 1 回だけ。失敗は失敗として返し、同じ手を黙って繰り返さない。実際に何を走らせるかは
 *    呼び出し側の runner が決める（Atlas が決定権を持つ）。ここは「何が候補か」と「順序」と「結果の記録」だけ。
 *  純粋・DOM なし・I/O なし。
 * ==========================================================================*/

const DEFAULT_RERUN_TYPES = ['gis_op'];

const srcId = (u) => (u && u.id) || (u && u.key ? 'src:' + (u.type || 'dataset') + ':' + u.key : null);

/** observed: [{type,key,version}] → updates: those whose version differs from the graph's current one (new sources are not updates). */
export function diffObserved(graph, observed) {
  const out = [], unknown = [];
  for (const o of Array.isArray(observed) ? observed : []) {
    const id = srcId(o);
    const n = id && graph.get(id);
    if (!n || n.kind !== 'source') { unknown.push(id || null); continue; }
    const cur = n.versions[n.versions.length - 1].version;
    const v = o.version == null || o.version === '' ? graph.UNVERSIONED : String(o.version);
    if (v !== cur) out.push({ id, type: n.type, key: n.key, version: v, versionBasis: o.versionBasis || 'stated', from: cur });
  }
  return { updates: out, unknown };
}

/** the session dataset id a node was recorded from (a source keeps it on its newest version, a derived node on itself) */
const datasetOf = (n) => !n ? null : n.kind === 'source'
  ? ((n.versions[n.versions.length - 1].meta || {}).dataset || null)
  : ((n.meta && n.meta.dataset) || null);

/** longest chain from a source to each entry, so an entry always follows every stale entry it reads */
function orderEntries(graph, ids) {
  const set = new Set(ids), depth = new Map();
  const d = (id) => {
    if (depth.has(id)) return depth.get(id);
    depth.set(id, 0);
    const n = graph.get(id);
    let m = 0;
    for (const i of (n && n.inputs) || []) if (set.has(i.id)) m = Math.max(m, d(i.id) + 1);
    depth.set(id, m);
    return m;
  };
  ids.forEach(d);
  return ids.slice().sort((a, b) => depth.get(a) - depth.get(b) || (a < b ? -1 : 1)).map((id) => ({ id, depth: depth.get(id) }));
}

/**
 * planRefresh(graph, updates, {rerunTypes}) → {ok, updates, entries, unwatched, counts}
 * Read-only: nothing is moved. Each entry: {id, depth, type, label, action: 'rerun'|'review', op, params, dataset, inputs, because:[sourceIds]}.
 *   rerun   a derived node whose recipe (op + params + inputs) can be replayed — a GIS op output
 *   review  a derived node that is a number somebody read (metric, answer number, model inference) — re-ask, don't recompute
 */
export function planRefresh(graph, updates, opts) {
  const rerunTypes = (opts && opts.rerunTypes) || DEFAULT_RERUN_TYPES;
  const seen = [], unwatched = [], hit = new Map();
  for (const u of Array.isArray(updates) ? updates : []) {
    const id = srcId(u), n = id && graph.get(id);
    if (!n || n.kind !== 'source') { seen.push({ id, status: 'unknown-source' }); continue; }
    const cur = n.versions[n.versions.length - 1].version;
    const v = u.version == null || u.version === '' ? graph.UNVERSIONED : String(u.version);
    if (v === cur) { seen.push({ id, status: 'unchanged', version: cur }); continue; }
    seen.push({ id, status: 'changed', from: cur, to: v });
    for (const d of graph.wouldStale(id, v).derived) { if (!hit.has(d)) hit.set(d, new Set()); hit.get(d).add(id); }
  }
  /* a source with no stated version can never be seen to move: say so for the ones that feed anything */
  for (const n of graph.all()) {
    if (n.kind === 'source' && n.versions[n.versions.length - 1].version === graph.UNVERSIONED && graph.impact(n.id).derived.length) unwatched.push(n.id);
  }
  const entries = orderEntries(graph, Array.from(hit.keys())).map(({ id, depth }) => {
    const n = graph.get(id), p = n.calc || {};
    const replay = rerunTypes.indexOf(n.type) >= 0 && !!p.op;
    return {
      id, depth, type: n.type, label: n.label, action: replay ? 'rerun' : 'review',
      op: p.op || null, params: p.params || null, dataset: datasetOf(n),
      inputs: n.inputs.map((i) => i.id), inputDatasets: n.inputs.map((i) => datasetOf(graph.get(i.id))), because: Array.from(hit.get(id)),
    };
  });
  const counts = { changed: seen.filter((s) => s.status === 'changed').length, rerun: entries.filter((e) => e.action === 'rerun').length, review: entries.filter((e) => e.action === 'review').length };
  return { ok: true, updates: seen, entries, unwatched, counts };
}

/**
 * applyUpdates(graph, updates) → {ok, plan, moved, confirmed, mismatch}
 * Plans BEFORE moving, moves the sources, then asks the graph's own staleness() whether exactly the planned nodes went stale.
 * `mismatch` is the disagreement (planned-not-stale / stale-not-planned) — empty when the prediction held.
 */
export function applyUpdates(graph, updates, opts) {
  const plan = planRefresh(graph, updates, opts);
  const moved = [];
  for (const u of Array.isArray(updates) ? updates : []) {
    const id = srcId(u), n = id && graph.get(id);
    if (!n || n.kind !== 'source') continue;
    const r = graph.putSource({ type: n.type, key: n.key, label: n.label, version: u.version, versionBasis: u.versionBasis || 'stated', meta: u.meta });
    if (r.ok && r.changed) moved.push({ id, from: r.previous, to: r.version });
  }
  const planned = new Set(plan.entries.map((e) => e.id));
  const confirmed = graph.all().filter((n) => n.kind === 'derived' && graph.staleness(n.id)).map((n) => n.id);
  const cs = new Set(confirmed);
  const mismatch = {
    plannedNotStale: Array.from(planned).filter((i) => !cs.has(i)),
    staleNotPlanned: confirmed.filter((i) => !planned.has(i)),
  };
  return { ok: true, plan, moved, confirmed, mismatch };
}

/**
 * executePlan(plan, runner, {actions}) → {ok, results:[{id, status:'done'|'failed'|'blocked'|'skipped', …}], counts}
 * runner(entry, ctx) → Promise<{ok, id?, why?}>. Entries run upstream-first, one at a time, once each. An entry that reads
 * a failed or blocked entry is `blocked` (its input is not fresh, so computing it would be a stale answer with a new date).
 * Entries whose action is not in `actions` (default ['rerun']) are `skipped` — they stay candidates for a person or Atlas.
 */
export async function executePlan(plan, runner, opts) {
  const actions = (opts && opts.actions) || ['rerun'];
  const bad = new Set(), results = [];
  for (const e of plan.entries) {
    if (actions.indexOf(e.action) < 0) { results.push({ id: e.id, status: 'skipped', action: e.action }); continue; }
    if (e.inputs.some((i) => bad.has(i))) { bad.add(e.id); results.push({ id: e.id, status: 'blocked', action: e.action }); continue; }
    let r;
    try { r = await runner(e, { results }); } catch (err) { r = { ok: false, why: 'threw', detail: String(err && err.message || err) }; }
    if (r && r.ok) results.push({ id: e.id, status: 'done', action: e.action, output: r.id || null });
    else { bad.add(e.id); results.push({ id: e.id, status: 'failed', action: e.action, why: (r && r.why) || 'failed', detail: (r && r.detail) || null }); }
  }
  const c = (s) => results.filter((r) => r.status === s).length;
  return { ok: results.every((r) => r.status === 'done' || r.status === 'skipped'), results, counts: { done: c('done'), failed: c('failed'), blocked: c('blocked'), skipped: c('skipped') } };
}
