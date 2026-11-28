import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAtlasPlan } from '../js/atlas-plan.js';
import { makeAtlasWorkingMemory, wmTurnRecord } from '../js/atlas-working-memory.js';
import { makeAtlasAgent } from '../js/atlas-agent.js';
import { makeAtlasAnswerSources } from '../js/atlas-answer-sources.js';
import { numberEvidence } from '../js/atlas-number-evidence.js';
import { applyParked, deviceJobFacts, jobFacts, makeJobsClient, mountJobCards } from '../js/atlas-jobs-client.js';
import { productsOfJob } from '../js/atlas-job-products.js';
import { planJob } from '../js/atlas-job-core.js';
import { runJob } from '../supabase/functions/_shared/atlas-job-runner.js';
import { makeServerCaps } from '../supabase/functions/_shared/atlas-server-caps.js';
import { capClass } from '../supabase/functions/_shared/atlas-cap-classes.js';
import { fakeDb } from './helpers/atlas-job-runner-db.mjs';

test('representative points leave classified areas and verification owed across a separate question', () => {
  const memory = makeAtlasWorkingMemory();
  const plan = makeAtlasPlan();
  const question = 'Draw the area classified as wetland, independently verify it, and provide the table.';
  const conditions = { target: 'Sample area', classification: 'wetland', representation: 'area' };
  const wanted = [
    { id: 'shape', step: 1, label: 'Wetland area', output: 'map', ...conditions, receipts: [{ result: { features: [conditions] } }] },
    { id: 'verify', step: 2, label: 'Independently verify the wetland', ...conditions, verification: true, receipts: [{ result: { features: [{ ...conditions, verified: true }] } }] },
    { id: 'table', step: 3, label: 'Results table', receipts: [{ result: { details: { table: true } } }] },
  ];
  const finish = (turn, asked) => {
    plan.endTurn();
    memory.recordTurn(wmTurnRecord(turn, asked, {}, {}, plan.snapshot(), {}));
  };
  const settle = (id, step, result) => {
    plan.started(id, { step, capability: 'test.result' });
    plan.settled(id, { ok: true, capability: 'test.result', ...result });
  };
  plan.beginTurn({ request: question });
  plan.declare({ steps: ['Map', 'Check', 'Table'], requirements: wanted });
  const planId = plan.snapshot().id;
  settle('point', 0, { producedModes: ['map'], features: [{ ...conditions, representation: 'point' }] });
  finish(1, question);
  assert.deepEqual(plan.snapshot().coverage.missing, ['shape', 'verify', 'table']);

  plan.beginTurn({ request: 'Which units are in the legend?' });
  plan.declare({ action: 'new', steps: ['Read legend'] });
  finish(2, 'Which units are in the legend?');
  assert.equal(memory.stats().open, 3);

  plan.beginTurn({ resumePlanId: planId });
  settle('area', 0, { producedModes: ['map'], features: [conditions] });
  settle('table', 2, { details: { table: true } });
  finish(3, 'Continue.');
  assert.equal(plan.snapshot().request, question);
  assert.deepEqual(memory.state().open.filter((row) => row.state === 'open').map((row) => row.deliverable), ['verify']);
});

test('a transport stop keeps a committed drawing and a resume reuses it only while it exists', async () => {
  const agent = makeAtlasAgent();
  const plan = makeAtlasPlan();
  let attempts = 0;
  const drawing = { id: 'draw', name: 'draw', arguments: { name: 'sample' } };
  const run = (options) => agent.runTurn({
    plan, tools: { draw: { name: 'draw', parameters: { type: 'object', properties: { name: { type: 'string' } } } } }, messages: [{ role: 'user', content: 'Draw and verify' }],
    execute: async () => { attempts++; return { ok: true, status: 'completed', capability: 'map.draw', producedModes: ['map'], objectIds: ['sample'] }; },
    ...options,
  });
  let at = 0;
  const first = await run({ model: async () => {
    if (!at++) return { text: '', turnState: 'continuing', toolCalls: [drawing] };
    throw Object.assign(new Error('connection lost'), { code: 'unreachable', retryable: false });
  }, verify: async () => null });
  assert.equal(first.stopped, 'transport');
  assert.equal(first.verificationPending, true);
  assert.equal(first.completion, 'partial');
  assert.equal(attempts, 1);
  for (const present of [true, false]) {
    at = 0;
    await run({
      resume: { request: 'Draw and verify', mapReceipts: first.mapReceipts },
      drawingPresent: (ids) => present && ids.join() === 'sample',
      model: async () => !at++ ? { text: '', turnState: 'continuing', toolCalls: [drawing] } : { text: 'Checked.', turnState: 'final' },
    });
    assert.equal(attempts, present ? 1 : 2);
  }
});

test('late table rows can be read after the diagnostic body was evicted and the tab reloaded', () => {
  const values = new Map();
  const store = { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) };
  const options = { store, limits: { bodyChars: 200 } };
  const memory = makeAtlasWorkingMemory(options);
  const rows = Array.from({ length: 51 }, (_, i) => ({ value: i, unit: 'km', year: 2021, source: 'dataset' }));
  memory.noteResult(1, 'query', 'data.query', {}, { details: { query: { rows, columns: ['value', 'unit', 'year', 'source'] } } });
  memory.save();
  const reloaded = makeAtlasWorkingMemory(options);
  assert.equal(reloaded.load(), true);
  const row = reloaded.recall('t1.query', 'details.query.rows[50]');
  assert.equal(row.fromTable, true);
  assert.match(row.text, /"value":50,"unit":"km","year":2021,"source":"dataset"/);
});

const caps = makeServerCaps();
const planner = { kinds: ['worker', 'capability'], capabilityOk: (id) => caps.has(id), datasetSlots: (id) => caps.datasetSlots(id), parkable: (id) => capClass(id) === 'parkable' };

test('job planner names the browser dependency before a server GIS task can launch', () => {
  const browser = { id: 'read', kind: 'capability', capability: 'web.fetchFile', args: { url: 'https://example.invalid/geography.geojson' } };
  const gis = { id: 'count', kind: 'capability', capability: 'data.gis', args: { inputs: ['@read:data.result'] } };
  assert.deepEqual(planJob([browser, gis], planner), {
    ok: false, error: 'browser_input_required', at: 1, task: 'count', from: 'read', capability: 'web.fetchFile',
  });
  assert.equal(planJob([{ ...gis, args: { inputs: [browser.args.url] } }], planner).ok, true);
});

test('background research hands back numbers, searches done, version and cost certainty', async () => {
  const contracts = ['low', 'xhigh'].map((effort) => ({ id: effort, goal: 'Inspect a series', effort }));
  const sb = fakeDb(planJob(contracts, planner).tasks);
  const readEffort = new Set();
  const facts = [{ subject: { name: 'Sample' }, attribute: 'length', value: 123456, unit: 'km', year: 2020, source: 'https://example.invalid/report', sourceVersion: 'v4' }];
  const notFound = [{ looked: 'series notes', where: 'publisher archive' }];
  await runJob({ db: sb, job: sb.st.job, holder: 'h1', now: () => 0, budgetMs: 100, leaseSeconds: 60, system: '',
    money: { estimate: () => 500, actual: (usage) => usage ? 35 : null },
    callModel: async (_system, _prompt, options) => {
      readEffort.add(options.effort);
      if (options.effort === 'low') throw Object.assign(new Error('connection lost'), { code: 'provider_unavailable', effort: options.effort });
      return { text: JSON.stringify({ summary: 'Read annual figures', facts, notFound }), usage: {}, effort: options.effort, model: 'unit-test' };
    },
  });
  assert.deepEqual([...readEffort].sort(), ['low', 'xhigh']);
  const reports = sb.st.events.filter((e) => e.kind === 'task.provider').map((e) => e.data);
  assert.ok(reports.some((r) => r.requestedEffort === 'low' && r.effectiveEffort === 'low' && r.confirmedMicros === null && r.releasedMicros === 500));
  assert.ok(reports.some((r) => r.requestedEffort === 'xhigh' && r.effectiveEffort === 'xhigh' && r.confirmedMicros === 35 && r.execution === 'server'));
  const client = makeJobsClient({ sb });
  const status = await client.get(sb.st.job.id);
  const saved = status.tasks.find((t) => t.id === 'xhigh');
  const got = await client.output(sb.st.job.id, 'xhigh', 'research');
  assert.deepEqual(got.output, saved.research);
  assert.deepEqual(got.value.facts, facts);
  assert.deepEqual(got.value.notFound, notFound);
  assert.equal(productsOfJob(status).find((p) => p.kind === 'table').content.rows[0][3], 123456);
});

test('status differentiates an empty task list from a failed read and shares pending requests', async () => {
  let reads = 0, failed = true;
  const sb = { from: (table) => ({
    select() { return this; }, eq() { return this; },
    maybeSingle: async () => ({ data: { id: 'job', status: 'done', tasks_total: failed ? 1 : 0 } }),
    async order() { reads++; return failed ? { error: Error('network') } : { data: [] }; },
  }) };
  const client = makeJobsClient({ sb });
  const states = await Promise.all([client.get('job'), client.get('job'), client.get('job')]);
  assert.equal(reads, 1);
  assert.ok(states.every((s) => s.tasksError === 'tasks_unavailable' && s.tasksEnded === null));
  failed = false;
  const empty = await client.get('job');
  assert.equal(empty.tasksEnded, 0);
  assert.equal(empty.tasksError, '');
});

test('browser changes become complete after one observed application and each job has one monitor', async () => {
  const raw = jobFacts({ id: 'job', status: 'done', tasks_total: 1, tasks_done: 1 }, [
    { task_id: 'draw', status: 'done', code: 'parked', result: { parked: { capability: 'map.drawLine', args: {} } } },
  ]);
  const memory = new Set();
  assert.equal(deviceJobFacts(raw, memory).status, 'awaiting_application');
  assert.equal(deviceJobFacts(raw, memory).incomplete[0].id, 'draw');
  let applied = 0;
  const receipts = await applyParked(raw, async () => { applied++; return { ok: true }; }, memory);
  assert.equal(deviceJobFacts(raw, memory, receipts).status, 'done');
  await applyParked(raw, async () => { applied++; return { ok: true }; }, memory);
  assert.equal(applied, 1);

  const actualObserver = globalThis.MutationObserver;
  let mounted = 0, reads = 0;
  globalThis.MutationObserver = class { observe() { mounted++; } disconnect() {} };
  try {
    const cards = Array.from({ length: 2 }, () => ({
      isConnected: true, getAttribute: () => 'job', querySelector: () => null, addEventListener() {},
    }));
    const root = { querySelectorAll: () => cards };
    const client = { get: async () => { reads++; return raw; } };
    const h = { L: (en) => en, memory };
    const mount = mountJobCards(() => client, h, { root });
    mountJobCards(() => client, h, { root });
    mountJobCards(() => client, h, { root });
    await new Promise(setImmediate);
    assert.equal(mounted, 1);
    assert.equal(reads, 1);
    assert.ok(cards.every((el) => /applied on this device/.test(el.innerHTML)));
    mount.stop();
  } finally {
    globalThis.MutationObserver = actualObserver;
  }
});

test('an explicit number ID follows the value and unit independently of word order', () => {
  const surface = makeAtlasAnswerSources({ esc: (s) => s });
  const provenance = { kind: 'number', source: 'Report', what: 'length', unit: 'km', values: [7, 27], date: '2020', version: 'page-2' };
  const records = numberEvidence(provenance);
  const sources = surface.collect([{ meta: { provenance: [provenance] } }]);
  const ref = (at) => '[[num:' + records[at].id + ']]';
  assert.match(surface.linkNumbers('<p>They measured 7 km ' + ref(0) + ' of length.</p>', sources, 'n'), /7 km<sup.*of length/);
  assert.doesNotMatch(surface.linkNumbers('<p>They measured 7 km ' + ref(1) + '.</p>', sources, 'n'), /<sup|\[\[num:/);
  assert.doesNotMatch(surface.linkNumbers('<p>They measured 7 mi ' + ref(0) + '.</p>', sources, 'n'), /<sup|\[\[num:/);
});
