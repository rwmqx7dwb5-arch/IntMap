import test from 'node:test';
import assert from 'node:assert/strict';
import research from '../js/atlas-cap-research.js';
import { makeAtlasPlan } from '../js/atlas-plan.js';
import { makeAtlasWorkingMemory } from '../js/atlas-working-memory.js';

test('browser delegation publishes the selected second result and all findings to sibling tasks and parent readback', async () => {
  const delegate = research.find((cap) => cap.row[0] === 'research.delegate');
  const source = 'https://example.org/selected.geojson';
  const geometry = { type: 'Point', coordinates: [140, 36] };
  const result = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry, properties: { text: 'x'.repeat(22000) + 'PAYLOAD-END' } }] };
  const findings = Array.from({ length: 48 }, (_, i) => ({ claim: 'Finding ' + (i + 1), source, excerpt: String(i + 1) }));
  const rounds = [
    { calls: ['other', 'chosen'].map((name) => ({ capability: 'data.gis', args: { name } })) },
    { summary: 'Selected the surveyed result.', findings, output: '@2:data.result' },
  ];
  let sawSibling = false;
  let askedReader = 0;
  const K = {
    R: (ok, html, extra) => ({ ok, html, ...extra }), L: (en) => en, esc: String, warn: String,
    _curTurnKey: 'ta-full-browser-handoff', classifyCapability: () => 'read',
    _delegationPolicy: { childMaxCalls: 3 },
    async askAIJSONEnvelope(prompt) {
      if (prompt.includes('Return the survey.')) return { data: rounds.shift() };
      assert.match(prompt, /Read the full survey material/);
      if (askedReader++ === 0) {
        assert.match(prompt, /"findings":48/);
        assert.doesNotMatch(prompt, /PAYLOAD-END/);
        return { data: { calls: [{ capability: 'read_step', args: { ref: 'input:survey', offset: 22000, length: 12000 } }] } };
      }
      assert.match(prompt, /PAYLOAD-END/);
      return { data: { summary: 'Read the last range.', status: 'partial', gaps: ['The rest of the survey still needs review.'] } };
    },
    async runReadCapability(id, args) {
      if (id === 'data.check') {
        assert.deepEqual(args.collection, result);
        assert.equal(args.lastFinding, 'Finding 48');
        assert.equal(args.artifact.origin.ref, '@2:data.result');
        assert.equal(args.artifact.origin.resultKey, 'survey-chosen');
        assert.equal(args.artifact.origin.revision, 7);
        assert.deepEqual(args.artifact.provenance, [{ url: source }]);
        sawSibling = true;
        return { ok: true, text: 'Read all rows.' };
      }
      return { ok: true, text: 'Survey result.', meta: args.name === 'chosen'
        ? { result, resultKey: 'survey-chosen', artifact: { revision: 7 }, provenance: [{ url: source }] }
        : { result: { type: 'FeatureCollection', features: [] }, resultKey: 'survey-other' } };
    },
  };
  const tasks = [
    { id: 'survey', goal: 'Return the survey.', tools: ['data.gis'] },
    { id: 'inspect', kind: 'capability', capability: 'data.check', inputs: [{ from: 'survey' }],
      args: { collection: '@survey:data.result', lastFinding: '@survey:findings.47.claim', artifact: '@survey:artifact' } },
    { id: 'read', goal: 'Read the full survey material.', inputs: [{ from: 'survey' }] },
  ];
  const reply = await delegate.run({ tasks, fresh: true }, {}, K);
  assert.equal(reply.meta.status, 'partial');
  assert.equal(reply.meta.delegated.find((result) => result.id === 'read').state, 'partial');
  assert.ok(sawSibling);
  assert.equal(askedReader, 2);
  const head = reply.meta.delegated[0];
  assert.equal(head.findingCount, 48);
  assert.equal(head.findings.length, 40);
  assert.equal(head.data, undefined);
  assert.equal(head.dataRef.count, 1);
  assert.deepEqual(head.dataRef.geometryTypes, ['Point']);
  assert.equal(reply.meta.delegatedMaterial.survey.findings.at(-1).claim, 'Finding 48');
  assert.deepEqual(reply.meta.delegatedMaterial.survey.data.result, result);
  assert.doesNotMatch(reply.html, /PAYLOAD-END/);
});

test('plan IDs isolate new work and invalid revisions leave geo, coverage and active step unchanged', () => {
  const plan = makeAtlasPlan();
  const scope = { operation: 'catchment', inputs: { terrain: 'v1' } };
  plan.beginTurn();
  const old = plan.declare({ action: 'new', goal: 'Volga', steps: ['Fetch the boundary'], scope, geo: { question: 'Volga', check: true } }).plan;
  plan.started('volga', { step: 0, capability: 'data.lookup' });
  plan.settled('volga', { ok: true, capability: 'data.lookup' });
  plan.endTurn('answered');
  plan.beginTurn();
  assert.equal(plan.declare({ current: 1 }).error, 'plan_id_mismatch');
  const before = plan.snapshot();
  assert.equal(plan.declare({ action: 'new', goal: 'Kiso', steps: ['Fetch the boundary'], current: 5, scope }).error, 'no_such_step');
  assert.deepEqual(plan.snapshot(), before);
  const next = plan.declare({ action: 'new', goal: 'Kiso', steps: ['Fetch the boundary'], scope }).plan;
  assert.notEqual(next.planId, old.planId);
  assert.equal(plan.snapshot().geo, null);
  assert.equal(plan.geoPending(), false);
  assert.equal(plan.snapshot().steps[0].ops.length, 0);
  assert.equal(plan.declare({ action: 'revise', planId: old.planId, geo: { question: 'Volga' } }).error, 'plan_id_mismatch');
  plan.endTurn('answered');
  assert.equal(plan.snapshot().steps[0].state, 'noop');
  plan.beginTurn();
  assert.equal(plan.declare({ action: 'continue', planId: next.planId, current: 1 }).ok, true);
  assert.match(plan.promptBlock(), new RegExp('Plan ID: ' + next.planId));
});

test('a partially successful batch covers only its observed rows and required output modality', () => {
  const plan = makeAtlasPlan();
  plan.beginTurn();
  const base = { id: 'catalog', step: 1, label: 'Catalog', receipts: [{ result: { details: { rows: [{ feature: 'A', kind: 'population', year: 2020 }] } } }] };
  const want = { id: 'show', step: 2, label: 'Map feature A', receipts: [{ ...base.receipts[0], mode: 'map' }] };
  const mixed = { id: 'other', step: 2, label: 'Feature B in 2020', receipts: [{ result: { details: { rows: [{ feature: 'B', kind: 'population', year: 2020 }] } } }] };
  plan.declare({ action: 'new', steps: ['Catalog', 'Draw'], requirements: [base, want, mixed] });
  plan.started('batch', { step: 0, capability: 'data.query' });
  plan.settled('batch', { ok: false, status: 'partial', capability: 'data.query', producedModes: ['table'],
    details: { rows: [{ feature: 'A', kind: 'population', year: 2020 }, { feature: 'B', kind: 'population', year: 2021 }] } });
  assert.deepEqual(plan.snapshot().coverage, { completed: 1, total: 3, missing: ['show', 'other'] });
  assert.equal(plan.declare({ current: 99 }).error, 'no_such_step');
  assert.deepEqual(plan.snapshot().coverage, { completed: 1, total: 3, missing: ['show', 'other'] });
});

test('working memory preserves a partial result and its numerical data when ok is false', () => {
  const memory = makeAtlasWorkingMemory();
  memory.beginTurn(1, 'Show all rows');
  const ref = memory.noteResult(1, 'batch', 'data.query', {}, { ok: false, status: 'partial', details: { count: 1 } });
  memory.beginTurn(2, 'Continue the work');
  assert.equal(memory.snapshot().done[0].status, 'partial');
  assert.equal(memory.snapshot().results[ref].status, 'partial');
  assert.match(memory.snapshot().results[ref].text, /"count":1/);
});
