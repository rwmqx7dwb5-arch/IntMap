import test from 'node:test';
import assert from 'node:assert/strict';
import mapEntries from '../js/atlas-cap-map.js';
import { preflight, normalizeGeo } from '../js/atlas-geoplan.js';
import { makeAtlasEvidence } from '../js/atlas-evidence.js';
import { assessSupport } from '../js/evidence-graph-deliver.js';
import { bindGis, recordAnswer } from '../js/evidence-graph-record.js';
import { makeEvidenceGraph } from '../js/evidence-graph.js';
import { makeGisDatasets } from '../js/gis-datasets.js';
import { delegationKey, makeDelegation, makeWorkerExecutor } from '../js/atlas-delegate.js';
import { makeCapabilityExecutor } from '../js/atlas-orchestrate.js';
import { inputView, shapeOf } from '../supabase/functions/_shared/atlas-job-core.js';
import { gradeAnswer } from '../scripts/atlas-eval/grade.mjs';
import { makeRunHistory, makeRunLedger } from '../js/atlas-run-ledger.js';
import { gradeMap } from '../scripts/atlas-eval/map-state.mjs';
import { turnReach } from '../scripts/atlas-eval/reach.mjs';
import { capOfCall, verdictOf } from '../scripts/atlas-eval/judge.mjs';

test('a map input changes delegation identity; incomplete capability data is delivered and can be refreshed', async () => {
  const tasks = [{ id: 'measure', kind: 'capability', capability: 'data.populationIn', args: { target: 'drawn' } }];
  const first = { points: [[1, 1], [2, 1], [1, 2]], time: '2024' };
  assert.notEqual(delegationKey(tasks, null, first), delegationKey(tasks, null, { ...first, points: [[3, 3], [4, 3], [3, 4]] }));
  assert.notEqual(delegationKey(tasks, null, first), delegationKey(tasks, null, { ...first, time: '2026' }));
  let tilesOk = 2, calls = 0;
  const executor = makeCapabilityExecutor({ classify: () => 'read', run: async () => {
    calls++;
    const status = tilesOk === 4 ? 'completed' : 'partial';
    return { ok: status === 'completed', status, code: 'coverage', exec: { status, tilesOk, tiles: 4 } };
  } });
  const initial = makeDelegation({ executor });
  const [partial] = await initial.run(tasks);
  assert.equal(partial.state, 'partial');
  assert.equal(partial.data.exec.tilesOk, 2);
  tilesOk = 4;
  const [complete] = await makeDelegation({ executor, resume: initial.snapshot() }).run(tasks);
  assert.equal(complete.state, 'done');
  assert.equal(complete.data.exec.tilesOk, 4);
  assert.equal(calls, 2);
});

test('an equal number on other subjects cannot corroborate and a syndicated statistic counts one original', () => {
  const graph = makeEvidenceGraph(), registry = makeAtlasEvidence().makeEvidenceRegistry({});
  const fact = { value: 62, concept: 'Water area', unit: 'km²', period: '2018', geography: 'Test Lake' };
  const add = (url, supportFacts, primarySource) => registry.addClientSources([{ url, supportFacts, primarySource }])[0].id;
  const wrong = [add('https://one.example/report', [{ ...fact, geography: 'Another Lake' }]),
    add('https://two.example/report', [{ ...fact, unit: 'mm' }]),
    add('https://three.example/report', [{ ...fact, period: '' }])];
  const [onlyWrong] = recordAnswer(graph, { registry, claims: [{ id: 'wrong', metric: fact, evidenceIds: wrong }] }).recorded;
  assert.equal(assessSupport(graph, [onlyWrong])[0].support, 'model_only');
  const syndicated = ['https://one.example/replica', 'https://two.example/replica'].map((url) => add(url, [fact], 'https://three.example/original'));
  const [orig] = recordAnswer(graph, { registry, claims: [{ id: 'syndicated', metric: fact, evidenceIds: syndicated }] }).recorded;
  const [support] = assessSupport(graph, [orig]);
  assert.equal(support.independent, 1);
  assert.equal(support.publications.length, 2);
});

test('Python table lineage pins the original input and carries the code identity', () => {
  const graph = makeEvidenceGraph(), data = makeGisDatasets(), bound = bindGis(graph, data);
  const columns = [{ type: 'Feature', geometry: null, properties: { measurement: 15 } }];
  const source = data.add({ features: columns, provenance: { kind: 'url', url: 'https://archive.example/station', version: '2022' } });
  const table = data.add({ features: columns, provenance: { kind: 'compute', inputs: [source.id], runtime: 'python-engine@1', codeSha256: 'known', output: 'result' } });
  const reference = bound.refOf(table.id);
  assert.equal(graph.get(reference).calc.params.codeSha256, 'known');
  assert.equal(graph.get(reference).inputs[0].version, '2022');
  assert.deepEqual(graph.trace(reference).sources.map((row) => row.key), ['https://archive.example/station']);
  data.add({ features: columns, provenance: { kind: 'url', url: 'https://archive.example/station', version: '2023' } });
  assert.ok(graph.impact(bound.refOf(source.id)).derived.includes(reference));
});

test('line painting retains adjacent sections and polygon painting refuses an unresolved vertex', async () => {
  const old = globalThis.window;
  let paints = 0;
  globalThis.window = { _imHlLines: { tagId: (object) => 'id-' + object.geo.coordinates[0][0] } };
  try {
    const K = { R: (ok, html, extra) => ({ ok, html, ...extra }), warn: String, note: String, L: (en) => en,
      geocode: async (place) => place === 'missing' ? null : { lng: Number(place), lat: 20 },
      _hlLines: [], _hlPolys: [], paintLines: () => (++paints, true), paintPolys: () => (++paints, true), esc: String };
    const context = { source: 'atlas', turnId: 3 };
    const find = (name) => mapEntries.find((e) => e.row[0] === name);
    const line = await find('map.drawLine').run({ places: ['1', '2', 'missing', '4', '5'] }, context, K);
    assert.equal(line.exec.status, 'partial');
    assert.deepEqual(line.objectIds, ['id-1', 'id-4']);
    assert.deepEqual(K._hlLines.map((l) => l.geo.coordinates.map(([lng]) => lng)), [[1, 2], [4, 5]]);
    assert.deepEqual(line.meta.painted.lines, K._hlLines.map((section) => section.key));
    assert.equal(K._hlLines[0].provenance.turnId, 3);
    const polygon = await find('map.drawPolygon').run({ places: ['1', '2', 'missing', '4'] }, context, K);
    assert.equal(polygon.ok, false);
    assert.deepEqual(polygon.exec.unresolved, ['missing']);
    assert.equal(paints, 1);
  } finally { globalThis.window = old; }
});

test('held data preflight reports incompatible coverage and unknown metadata', async () => {
  const { spec } = normalizeGeo({
    region: { bounds: [130, 30, 140, 40] }, time: { at: '2024' },
    needs: [{ id: 'x', source: { kind: 'dataset', ref: 'observations' }, resolution: { value: 10, unit: 'm' }, completeness: 'any' }],
  });
  const mismatch = await preflight(spec, { describe: () => ({
    bounds: [-120, 25, -111, 32], extent: { time: [['2010-01-01', '2010-12-31']] },
    resolution: { min: 1000, max: 1000, unit: 'm' },
  }) });
  assert.equal(mismatch.runnable, false);
  assert.deepEqual(mismatch.needs[0].matches, { spatial: 'outside', temporal: 'outside', resolution: 'misses' });
  const unknown = await preflight(spec, { describe: () => ({ bounds: [130, 30, 140, 40] }) });
  assert.equal(unknown.runnable, null);
  assert.equal(unknown.needs[0].state, 'unknown');
});

test('server worker facts and search gaps remain in the input visible to a dependent worker', () => {
  const result = shapeOf({ summary: 'A year found', status: 'partial',
    facts: [{ subject: { name: 'Harbour' }, attribute: 'cargo', value: 84, unit: 'thousand tonnes', at: '2021', source: 'https://archive.example/cargo' }],
    notFound: [{ looked: 'second quarter', where: 'port statistics' }],
  });
  assert.equal(result.partial, true);
  const view = JSON.parse(inputView({ ...result.out, from: 'A', state: 'partial' }).text);
  assert.equal(view.state, 'partial');
  assert.equal(view.facts[0].value, 84);
  assert.equal(view.facts[0].unit, 'thousand tonnes');
  assert.equal(view.notFound[0].where, 'port statistics');
});

test('assessment rejects a withdrawn answer and an incomplete run', () => {
  const answer = { kind: 'number', unit: 'minutes', value: 141 };
  assert.equal(gradeAnswer(answer, '141分というのは誤りです。正解は999分です。').verdict, 'incorrect');
  assert.equal(gradeAnswer(answer, '141 minutes is incorrect. The correct answer is 999 minutes.').verdict, 'incorrect');
  assert.equal(verdictOf({ turns: [{ measured: true, failures: [] }, { unmeasured: 'deadline' }], probes: [] }), 'incomplete');
});

test('worker cost and late updates preserve the observed amount, unknown calls and answer time', async () => {
  const errors = [
    Object.assign(new Error('charged'), { meta: { costUsd: 0.013 } }),
    new Error('not observed'),
  ];
  for (const [index, error] of errors.entries()) {
    const executor = makeWorkerExecutor({ ask: async () => { throw error; } });
    const [result] = await makeDelegation({ executor }).run([{ goal: 'Read the original publication' }]);
    assert.equal(result.costUsd, index === 0 ? 0.013 : 0);
    assert.equal(result.costUnknownCalls, index);
  }
  let now = 100;
  const ledger = makeRunLedger({ now: () => now });
  await ledger.ask(async () => ({ meta: { modelServed: 'reader', reasoningEffort: 'high', costUsd: 0.05 } }), 'vision_read');
  now = 150;
  const history = makeRunHistory();
  const atAnswer = ledger.summary();
  const row = history.add(atAnswer, 'image analysis');
  now = 300;
  ledger.late(0.2, 1);
  row.update({ ...ledger.summary(), wallMs: atAnswer.wallMs, costUpdatedMs: now - 100 });
  assert.equal(history.all()[0].costUsd, 0.25);
  assert.equal(history.all()[0].costUnknownCalls, 1);
  assert.equal(history.all()[0].wallMs, 50);
  assert.deepEqual(history.all()[0].stages, [{ task: 'vision_read', model: 'reader', effort: 'high' }]);
});

test('evaluation keeps capability search, selection and execution distinct', () => {
  const trace = {
    calls: [{ name: 'find_capability', args: { query: 'shoreline data' }, result: { matches: [{ id: 'data.gis' }, { id: 'map.drawLine' }] } },
      { name: 'run_capability', args: { id: 'data.gis' } }],
    operations: [{ capabilityId: 'data.gis', status: 'failed', code: 'coverage' }],
  };
  const [gis, drawing] = turnReach([{ id: 'data.gis', rank: null }, { id: 'map.drawLine', rank: 3 }], trace, capOfCall);
  assert.equal(gis.originalLexicalRank, null);
  assert.equal(gis.searches[0].rank, 1);
  assert.equal(gis.selected, true);
  assert.equal(gis.execution[0].status, 'failed');
  assert.equal(drawing.searches[0].rank, 2);
  assert.equal(drawing.selected, false);
});

test('the requested year on the clock does not pass when only modern subdivisions are present', () => {
  const question = { era: { year: 1750, in: [130, 30, 145, 45], includes: ['Earlier District'] } };
  const snapshot = { viewport: { west: 130, south: 30, east: 145, north: 45 },
    time: { live: false, travelDate: '1750-07-01' }, eraAdmin: { active: true, names: ['Modern District'], presentOn: true } };
  const ctx = { observeEra: true, eraReference: () => [{ key: 'earlier', name: 'Earlier District' }] };
  assert.equal(gradeMap(question, snapshot, ctx).verdict, 'mismatch');
  assert.equal(gradeMap(question, { ...snapshot, eraAdmin: null }, ctx).verdict, 'unobserved');
  assert.equal(gradeMap(question, { ...snapshot, eraAdmin: { active: true, names: ['Earlier District'] } }, ctx).verdict, 'match');
});
