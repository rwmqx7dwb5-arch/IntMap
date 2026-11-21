/* ============================================================================
 *  IntMap · goal-and-evidence — 操作の成功と調査目的の達成を分け、根拠の系譜を永続・統合する
 * ----------------------------------------------------------------------------
 *  ① 成果物の被覆: 20 都市中 8 都市しか人口が無い表は「ok」でも欠けとして数えられ、期待が分かれば不足が計算される
 *  ② 独立した根拠: 同じ出典を 3 回引いても独立 1、別の出典が同じ値を述べれば corroborated、記録に無い数値は model_only
 *  ③ 完了判定へ: goal verifier は観測した事実を受け取り、観測が投げても判定は続く
 *  ④ 更新の影響: 出典が動いた瞬間に、触れた GIS 結果・回答の数値・ノートが名指しで返る
 *  ⑤ 永続化: pending/ack で失敗しても失わず、pull は置換せず合流する
 *  ⑥ 統合: ニュース・ノートが節になり、回答の呼び出し元（datasets）が graphRef 付きの事実を渡す
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeEvidenceGraph } from '../js/evidence-graph.js';
import { bindGis, recordAnswer, recordNews, recordNote, datasetFacts, evidenceRefsForTurn, makeTurnObserver } from '../js/evidence-graph-record.js';
import { assessDataset, assessSupport, assessDeliverable, observationLines, originOf } from '../js/evidence-graph-deliver.js';
import { syncEvidenceGraph, deleteEvidenceGraph, EVIDENCE_TABLE } from '../js/evidence-graph-sync.js';
import { makeGoalVerify, GOAL_VERIFY_RULES } from '../js/atlas-goal-verify.js';
import { makeGisDatasets } from '../js/gis-datasets.js';
import { makeAtlasEvidence } from '../js/atlas-evidence.js';
import { normalize } from '../js/atlas-notebook-store.js';

const pt = (x, y, props) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: props || {} });
const cities = (n, withPop) => Array.from({ length: n }, (_, i) => pt(i, i, i < withPop ? { name: 'c' + i, pop: 1000 + i } : { name: 'c' + i }));

test('① 20 rows of which 8 carry a population is reported as such, and a known target gives the shortfall', () => {
  const data = makeGisDatasets();
  const rec = data.add({ title: 'Cities', features: cities(20, 8), provenance: { kind: 'layer', layer: 'cities' } });
  const d = assessDataset(data.get(rec.id));
  assert.equal(d.count, 20);
  assert.deepEqual(d.partial, [{ name: 'pop', filled: 8, total: 20 }]);
  const lines = observationLines({ datasets: [d], conclusions: [] });
  assert.match(lines[0], /20 rows; values present for pop 8\/20/);
  /* the caller that knows the target gets the shortfall; a dataset that has none is not «incomplete» by guess */
  const e = assessDataset(data.get(rec.id), { expected: { count: 20, fields: ['pop', 'gdp'] } });
  assert.deepEqual(e.shortfall.fields.map((f) => [f.name, f.have, f.need, !!f.absent]), [['pop', 8, 20, false], ['gdp', 0, 20, true]]);
  const full = data.add({ title: 'Full', features: cities(5, 5), provenance: { kind: 'layer', layer: 'full' } });
  assert.deepEqual(assessDataset(data.get(full.id)).partial, []);
  assert.equal(assessDataset({ id: 'x', title: 'x', count: 3 }).observed, false);          /* columns not measured ≠ missing */
  assert.match(observationLines({ datasets: [assessDataset({ id: 'x', title: 'x', count: 3 })] })[0], /columns not measured/);
});

test('② one origin cited three times is one witness; a model figure no record states is model_only', () => {
  const g = makeEvidenceGraph();
  const reg = makeAtlasEvidence().makeEvidenceRegistry({ callId: 'c1', retrievedAt: '2026-11-20' });
  const [a, b, c] = reg.addClientSources([
    { url: 'https://stats.example.org/a', title: 'A', date: '2026-01-01', supportFacts: [{ concept: 'pop', value: 100, unit: 'n' }] },
    { url: 'https://www.stats.example.org/b', title: 'B', date: '2026-01-02', supportFacts: [{ concept: 'pop', value: 100, unit: 'n' }] },
    { url: 'https://other.example.net/c', title: 'C', date: '2026-01-03', supportFacts: [{ concept: 'pop', value: 100, unit: 'n' }] },
  ]);
  const claims = [
    { id: 'one', metric: { value: 100, unit: 'n', concept: 'same host' }, evidenceIds: [a.id, b.id] },
    { id: 'two', metric: { value: 100, unit: 'n', concept: 'two hosts' }, evidenceIds: [a.id, c.id] },
    { id: 'mod', metric: { value: 55, unit: 'n', concept: 'invented' }, evidenceIds: [a.id] },
  ];
  const r = recordAnswer(g, { registry: reg, claims, callId: 'c1', turnId: 't1' });
  const s = assessSupport(g, r.recorded);
  assert.equal(originOf(g.get(g.get(r.recorded[0]).inputs[0].id)), 'web:stats.example.org');
  assert.equal(s[0].citations, 2); assert.equal(s[0].independent, 1); assert.equal(s[0].support, 'single');
  assert.equal(s[1].independent, 2); assert.equal(s[1].support, 'corroborated');
  assert.equal(s[2].support, 'model_only');
  const rep = assessDeliverable({ graph: g, datasets: [], answerNodes: r.recorded });
  assert.deepEqual(rep.gaps.map((x) => x.kind).sort(), ['conclusion-single-origin', 'conclusion-unsupported']);
  assert.match(observationLines(rep).join('\n'), /built from 2 citations that are ONE origin/);
  assert.match(observationLines(rep).join('\n'), /the model's own figure/);
  assert.deepEqual(evidenceRefsForTurn(g, 't1').sort(), r.recorded.slice().sort());
  assert.equal(assessSupport(g, ['nope'])[0].support, 'unobserved');
});

test('③ the goal verifier is shown what the outputs hold, and an observer that throws changes nothing', async () => {
  let seen = '';
  const ask = async (prompt) => { seen = prompt; return { data: { unmet: [{ need: '20 cities', why: 'pop for 8' }] } }; };
  const v = makeGoalVerify({ ask, observe: () => ['Cities: 20 rows; values present for pop 8/20'] });
  const out = await v({ request: '20 都市の人口を比較して', text: 'done', results: [{ capability: 'gis.import', ok: true }] });
  assert.match(seen, /WHAT THE OUTPUTS ACTUALLY HOLD[^]*pop 8\/20/);
  assert.deepEqual(out.unmet.map((u) => u.need), ['20 cities']);
  const v2 = makeGoalVerify({ ask, observe: () => { throw new Error('boom'); } });
  assert.ok(await v2({ request: 'x', text: 'y', results: [] }));
  assert.doesNotMatch(seen, /ACTUALLY HOLD/);
  assert.match(GOAL_VERIFY_RULES, /returned ok is not a part met/);
  /* the turn observer reads the registry and the graph, scoped to the turn */
  const data = makeGisDatasets(); const scope = { IntMapData: data };
  const since = Date.now();
  data.add({ title: 'Cities', features: cities(4, 1), provenance: { kind: 'layer', layer: 'cities-obs' } });
  assert.match(makeTurnObserver(since, scope)().join('\n'), /Cities: 4 rows; values present for pop 1\/4/);
  assert.deepEqual(makeTurnObserver(Date.now() + 60000, scope)(), []);
});

test('④ an update to a source names the GIS result, the answer figure and the note it touches', () => {
  const g = makeEvidenceGraph(), data = makeGisDatasets();
  const bind = bindGis(g, data);
  const a = data.add({ title: 'Wards', features: [pt(0, 0)], provenance: { kind: 'layer', layer: 'wards' } });
  const b = data.add({ title: 'Count', features: [pt(0, 0, { n: 42 })], provenance: { kind: 'op', op: 'aggregate', inputs: [a.id], params: { stat: 'count' } } });
  const reg = makeAtlasEvidence().makeEvidenceRegistry({ callId: 'c1', retrievedAt: '2026-11-20' });
  const rec = reg.addAppData({ title: 'GIS', graphRef: bind.refOf(b.id), supportFacts: [{ concept: 'count', value: 42, unit: 'n' }] });
  const r = recordAnswer(g, { registry: reg, claims: [{ id: 'k', metric: { value: 42, unit: 'n', concept: 'count' }, evidenceIds: [rec.id] }], callId: 'c1', turnId: 't9' });
  const note = recordNote(g, { id: 'nb-abc123-0001', title: 'wards', question: 'how many', answer: '42', evidenceRefs: evidenceRefsForTurn(g, 't9') });
  assert.equal(note.ok, true);
  assert.equal(recordNote(g, { id: 'nb-abc123-0002', question: 'q' }).why, 'nothing-cited');
  const seen = []; const off = g.onSourceChanged((rep) => seen.push(rep));
  data.add({ title: 'Wards', features: [pt(0, 0), pt(1, 1)], provenance: { kind: 'layer', layer: 'wards' } });   /* the layer is replaced */
  assert.equal(seen.length, 1);
  const rep = seen[0];
  assert.equal(rep.source, 'src:dataset:wards'); assert.notEqual(rep.from, rep.to);
  assert.deepEqual(rep.datasets, [b.id]);
  assert.equal(rep.answers.length, 1); assert.equal(rep.answers[0].value, 42); assert.equal(rep.answers[0].id, r.recorded[0]);
  assert.ok(rep.affected.some((x) => x.id === note.id && x.hops === 3 && x.stale === true));
  assert.equal(g.updates().length, 1); off();
  data.add({ title: 'Wards', features: [pt(5, 5)], provenance: { kind: 'layer', layer: 'wards' } });
  assert.equal(seen.length, 1);                                  /* unsubscribed */
});

test('⑤ push is pending until acknowledged; a failed push loses nothing; pull merges without replacing', async () => {
  const rows = new Map();   /* a stub of the supabase table, per user */
  let failNext = false;
  const db = { from(t) {
    assert.equal(t, EVIDENCE_TABLE);
    const q = { del: false,
      select() { return q; }, eq() { return q; }, order() { return q; },
      range(a, b) { return Promise.resolve({ data: Array.from(rows.values()).slice(a, b + 1).map((r) => ({ id: r.id, payload: r.payload })), error: null }); },
      upsert(part) { if (failNext) return Promise.resolve({ error: { message: 'net' } }); part.forEach((r) => rows.set(r.id, r)); return Promise.resolve({ error: null }); },
      delete() { q.del = true; return q; },
      then(res, rej) { if (q.del) rows.clear(); return Promise.resolve({ error: null }).then(res, rej); } };
    return q; } };
  const user = { id: 'u1' };
  const g1 = makeEvidenceGraph();
  const s = g1.putSource({ type: 'dataset', key: 'k', version: '1' });
  const d1 = g1.putDerived({ type: 'metric', inputs: [s.id], calc: { op: 'x' }, output: { value: 1 } });
  assert.equal(g1.pending().nodes.length, 2);
  failNext = true;
  const bad = await syncEvidenceGraph({ graph: g1, db, user });
  assert.equal(bad.ok, false); assert.equal(g1.pending().nodes.length, 2);            /* still pending */
  failNext = false;
  const ok = await syncEvidenceGraph({ graph: g1, db, user });
  assert.equal(ok.ok, true); assert.equal(ok.pushed, 2); assert.equal(g1.pending().nodes.length, 0); assert.equal(rows.size, 2);
  /* a second device: pull rebuilds the lineage; its own newer version of the source is kept and pushed */
  const g2 = makeEvidenceGraph();
  g2.putSource({ type: 'dataset', key: 'k', version: '2' });
  const pulled = await syncEvidenceGraph({ graph: g2, db, user });
  assert.equal(pulled.pulled, 1);                                       /* the derived node came in */
  assert.deepEqual(g2.get('src:dataset:k').versions.map((v) => v.version).sort(), ['1', '2']);
  assert.equal(g2.staleness(d1.id).cause, 'input-version-changed');
  assert.equal(rows.get('src:dataset:k').payload.versions.length, 2);   /* the account holds both versions */
  assert.equal((await syncEvidenceGraph({ graph: g2, db: null, user })).error, 'not-signed-in');
  assert.equal(await deleteEvidenceGraph({ db, user }), true); assert.equal(rows.size, 0);
  assert.equal(g2.size(), 2);                                            /* the page's graph is untouched */
  /* derived-before-derived arrival order merges in rounds */
  const d2 = g1.putDerived({ type: 'metric', inputs: [d1.id], calc: { op: 'y' }, output: { value: 2 } });
  const snap = g1.snapshot(); snap.nodes.reverse();
  const g3 = makeEvidenceGraph();
  assert.equal(g3.merge(snap).orphan.length, 0); assert.equal(g3.size(), 3); assert.ok(d2.ok);
  assert.equal(g3.merge({ graphVersion: 2, nodes: [] }).why, 'bad-snapshot');
  assert.equal(g3.pending().nodes.length, 0);                            /* merged-in nodes came from the store */
});

test('⑥ news become source nodes (a retrieval clock is no publication date); notebook entries carry their refs; datasets reach the answer with a graphRef', () => {
  const g = makeEvidenceGraph();
  const ids = recordNews(g, [{ url: 'https://news.example.com/x', title: 'X', publishedAt: '2026-11-19' }, { url: 'https://news.example.com/y', title: 'Y' }, { title: 'no url' }, { url: 'javascript:1' }]);
  assert.equal(ids.length, 2);
  assert.equal(g.get(ids[0]).versions[0].version, '2026-11-19');
  assert.equal(g.get(ids[1]).versions[0].version, 'unversioned');
  const n = recordNote(g, { id: 'nb-abc123-0003', title: 't', question: 'q', answer: 'a', sources: [{ url: 'https://news.example.com/x', title: 'X' }] });
  assert.equal(n.ok, true); assert.deepEqual(g.trace(n.id).sources.map((s) => s.key), ['https://news.example.com/x']);
  const e = normalize({ id: 'nb-abc123-0003', at: 1, question: 'q', evidenceRefs: ['drv:x:1', '', 5] });
  assert.deepEqual(e.evidenceRefs, ['drv:x:1', '5']);
  assert.deepEqual(normalize({ id: 'nb-abc123-0004', at: 1, question: 'q' }).evidenceRefs, []);
  const data = makeGisDatasets(); const bind = bindGis(g, data);
  const d = data.add({ title: 'Cities', features: cities(6, 6), provenance: { kind: 'layer', layer: 'cities-y' } });
  const facts = datasetFacts(data, [d.id, 'ds-missing'], bind.refOf);
  assert.equal(facts.length, 1); assert.equal(facts[0].graphRef, 'src:dataset:cities-y');
  assert.ok(facts[0].supportFacts.some((f) => f.concept === 'rows' && f.value === 6));
  assert.ok(facts[0].supportFacts.some((f) => f.concept === 'pop max' && f.value === 1005));
  const reg = makeAtlasEvidence().makeEvidenceRegistry({ callId: 'c', retrievedAt: '2026-11-20' });
  const rec = reg.addAppData(facts[0]);
  assert.equal(rec.graphRef, 'src:dataset:cities-y');
  const r = recordAnswer(g, { registry: reg, claims: [{ id: 'c', metric: { value: 1005, unit: '', concept: 'pop max' }, evidenceIds: [rec.id] }], callId: 'c' });
  assert.equal(g.get(r.recorded[0]).type, 'answer_number');
  assert.deepEqual(g.trace(r.recorded[0]).sources.map((s) => s.key), ['cities-y']);
});
