import test from 'node:test';
import assert from 'node:assert/strict';
import jobCaps from '../js/atlas-cap-jobs.js';
import { applyParked, makeJobsClient } from '../js/atlas-jobs-client.js';
import { runJob } from '../supabase/functions/_shared/atlas-job-runner.js';
import { fakeDb } from './helpers/atlas-job-runner-db.mjs';

const modelReply = (data, citations = []) => ({ text: JSON.stringify(data), usage: {}, citations });
const asks = (capability, args) => modelReply({ calls: [{ capability, args }] });
const capability = (id, name, args = {}, deps = []) => ({ id, deps, contract: { kind: 'capability', capability: name, args } });
const worker = (id, tools = []) => ({ id, deps: [], contract: { goal: 'Find the requested data', tools } });
const lane = (id, run) => ({ has: name => name === id, catalogue: () => [{ id }], run });
const start = (db, callModel, capabilities, now = () => 0) => runJob({
  db, job: db.st.job, holder: db.st.job.lease_holder, now, callModel, capabilities,
  budgetMs: 30, leaseSeconds: 150, system: 'SYS',
  money: { estimate: () => 1000, actual: () => 500 },
});

test('a parked map operation receives resolved coordinates on the page', async () => {
  const db = fakeDb([
    capability('A', 'test.coordinates'),
    capability('B', 'view.flyTo', { lat: '@A:data.coordinates.1', lng: '@A:data.coordinates.0', zoom: 9 }, ['A']),
    capability('C', 'view.flyTo', { lat: '@A:data.missing', lng: 12 }, ['A']),
  ]);
  await start(db, () => assert.fail('no worker needed'), lane('test.coordinates', async () => ({ ok: true, data: { coordinates: [12.75, 48.125] } })));
  const applied = [];
  const facts = await makeJobsClient({ sb: db }).get(db.st.job.id);
  await applyParked(facts, async op => {
    applied.push(op);
    return { ok: true };
  });
  assert.deepEqual(applied, [{ capability: 'view.flyTo', args: { lat: 48.125, lng: 12.75, zoom: 9 } }]);
  assert.equal(db.st.tasks.get('C').code, 'input_ref_unresolved');
});

test('a partial worker contributes its answer and appears in job incomplete', async () => {
  const db = fakeDb([worker('A'), worker('B')]);
  let requests = 0;
  await start(db, async (_sys, prompt, opts) => {
    if (opts.web && requests++ < 2) throw Object.assign(new Error('timeout'), { timeout: true, status: 504 });
    return modelReply({ summary: 'The sources could not be checked', findings: [], gaps: ['Four measurements are missing'] });
  });
  const finished = db.st.job.finished;
  assert.equal(db.st.tasks.get('A').status, 'partial');
  assert.equal(finished.status, 'partial');
  assert.deepEqual(finished.result.incomplete.map(x => [x.id, x.state, x.code]), [['A', 'partial', 'degraded'], ['B', 'partial', 'degraded']]);
  assert.match(finished.result.summary, /The sources could not be checked/);
  const facts = await makeJobsClient({ sb: db }).get(db.st.job.id);
  assert.deepEqual(facts.incomplete, finished.result.incomplete);
  assert.deepEqual(facts.tasks[0].gaps.slice(0, 1), ['Four measurements are missing']);
});

test('a cancelled job does not apply a saved map operation on return', async () => {
  const op = { id: 'A', state: 'done', parked: { capability: 'view.flyTo', args: { lat: 10, lng: 20 } } };
  const applied = [];
  const result = await applyParked({ id: 'job', status: 'cancelled', tasks: [op] }, async action => {
    applied.push(action);
    return { ok: true };
  });
  assert.deepEqual(applied, []);
  assert.deepEqual(result, []);
});

test('renaming missing references yields the same diagnostic across leases', async () => {
  const db = fakeDb([worker('W', ['test.read'])]);
  let now = 0;
  let requests = 0;
  const prompts = [];
  const capabilities = lane('test.read', async () => {
    assert.fail('unresolved arguments must never reach the tool');
  });
  const callModel = async (_sys, prompt) => {
    prompts.push(prompt);
    requests++;
    if (requests === 1) now = 31;
    return requests < 5 ? asks('test.read', { data: '@missing' + requests + ':data.result' }) : modelReply({ summary: 'No input was retrieved' });
  };
  assert.deepEqual(await start(db, callModel, capabilities, () => now), { outcome: 'more' });
  db.st.job.lease_holder = 'h2';
  await start(db, callModel, capabilities, () => now);
  assert.equal(db.st.tasks.get('W').progress.dup, 2);
  assert.match(prompts[3], /RESULTS OR DIAGNOSTICS STOPPED CHANGING/);
  assert.equal(db.st.events.filter(e => e.kind === 'task.tool_call').length, 3);
});

test('real pages, range advancement and new citations count as progress', async () => {
  const db = fakeDb([worker('W', ['test.read'])]);
  const capabilities = lane('test.read', async (_id, { page }) => ({ ok: true, text: 'page', data: { value: page } }));
  const prompts = [];
  await start(db, async (_sys, prompt) => {
    prompts.push(prompt);
    const n = prompts.length;
    if (n <= 4) return asks('test.read', { page: n });
    if (n <= 7) return asks('read_step', { ref: 'tool:1', offset: (n - 5) * 5, length: 5 });
    if (n === 8) return asks('read_step', { ref: 'tool:1', offset: 1, length: 8 });
    if (n === 9) return modelReply({ calls: [{ capability: 'test.read', args: { page: 4 } }] }, [{ url: 'https://example.org/source' }]);
    return modelReply({ summary: 'Pages read' });
  }, capabilities);
  assert.equal(prompts.length, 10);
  assert.doesNotMatch(prompts[7], /YOU HAVE ALL THE ANSWERS/);
  assert.match(prompts[8], /RESULTS OR DIAGNOSTICS STOPPED CHANGING/);
  assert.equal(db.st.tasks.get('W').progress.dup, 0);
  assert.deepEqual(db.st.tasks.get('W').result.sources.map(source => source.url), ['https://example.org/source']);
});

test('the same saved data with different request phrasing or key order does not advance the worker', async () => {
  const db = fakeDb([worker('W', ['test.read'])]);
  const capabilities = lane('test.read', async (_id, { q }) => ({
    ok: true,
    text: 'Fetched for ' + q,
    data: q % 2 ? { x: 101, y: 202 } : { y: 202, x: 101 },
  }));
  const prompts = [];
  await start(db, async (_sys, prompt) => {
    prompts.push(prompt);
    return prompts.length < 4 ? asks('test.read', { q: prompts.length }) : modelReply({ summary: 'The existing result is enough' });
  }, capabilities);
  assert.match(prompts[3], /YOU HAVE ALL THE ANSWERS/);
  assert.match(prompts[3], /Available argument references: @1:data, @2:data, @3:data\./);
  assert.equal(db.st.tasks.get('W').progress.dup, 2);
});

test('a saved range can be read once its formerly missing reference exists', async () => {
  const db = fakeDb([worker('W', ['test.read'])]);
  const capabilities = lane('test.read', async (_id, { page }) => ({ ok: true, text: 'page ' + page }));
  const prompts = [];
  await start(db, async (_sys, prompt) => {
    prompts.push(prompt);
    const n = prompts.length;
    if (n === 1 || n === 3) return asks('test.read', { page: n });
    if (n === 2 || n === 4) return asks('read_step', { ref: 'tool:3', offset: 0, length: 4 });
    return modelReply({ summary: 'Read the saved range' });
  }, capabilities);
  assert.match(prompts[2], /FAILED unknown_ref/);
  assert.match(prompts[4], /\[4\] read_step [^\n]+→ ok: characters 0-4 of 6/);
  assert.equal(db.st.tasks.get('W').progress.dup, 0);
});

test('a durable worker publishes an exact JSON value and its findings for dependent tasks', async () => {
  const source = { url: 'https://example.org/orchard-survey', title: 'Orchard survey' };
  const third = { id: 'three', parcels: 27, annotation: 'x'.repeat(1600000) + 'LAST' };
  const findings = Array.from({ length: 48 }, (_, i) => ({ claim: 'Row ' + i, source: source.url, excerpt: String(i) }));
  const db = fakeDb([
    worker('A', ['test.read']),
    capability('B', 'test.read', { row: '@A:data.rows.2', last: '@A:findings.47.claim', artifact: '@A:artifact' }, ['A']),
    capability('C', 'view.flyTo', { lat: '@B:data.point.1', lng: '@B:data.point.0' }, ['B']),
  ]);
  let calls = 0;
  const caps = lane('test.read', async (_id, args) => {
    if (!args.row) return { ok: true, text: 'Survey table', data: { rows: [{ id: 'one' }, { id: 'two' }, third], provenance: { publisher: 'Orchard survey' } }, sources: [source] };
    assert.deepEqual(args.row, third);
    assert.equal(args.last, 'Row 47');
    assert.equal(args.artifact.count, 1);
    assert.deepEqual(args.artifact.sources, [source.url]);
    assert.deepEqual(args.artifact.provenance, { publisher: 'Orchard survey' });
    return { ok: true, data: { point: [11.5, 53.25] } };
  });
  await start(db, async () => ++calls === 1
    ? asks('test.read', {})
    : modelReply({ summary: 'One orchard is still missing', findings, status: 'partial', gaps: ['Fourth orchard missing'], output: '@1:data.rows.2' }), caps);

  const a = db.st.tasks.get('A');
  assert.equal(a.status, 'partial');
  assert.equal(a.result.data.output.stored, 'artifact');
  assert.notEqual(a.result.data.output.first, 0, 'the output follows the source call transcript');
  assert.equal(a.result.findings.length, 48);
  assert.equal(db.st.job.status, 'partial');
  assert.deepEqual(db.st.job.result.incomplete.map(t => t.id), ['A']);
  const facts = await makeJobsClient({ sb: db }).get(db.st.job.id);
  assert.deepEqual(facts.tasks.find(t => t.id === 'C').parked.args, { lat: 53.25, lng: 11.5 });
  const output = await makeJobsClient({ sb: db }).output(db.st.job.id, 'A');
  assert.equal(output.ok, true);
  assert.deepEqual(output.value, third);
  assert.deepEqual(output.sources, [source]);
  assert.equal(output.output.version, a.result.data.output.version);

  const oldWindow = globalThis.window;
  try {
    globalThis.window = { sb: db, SUPABASE_URL: 'https://example.test' };
    const status = jobCaps.find((cap) => cap.row[0] === 'jobs.status');
    const visible = await status.run({ id: db.st.job.id, outputTask: 'A' }, {}, {
      R: (ok, html, details) => ({ ok, ...details }), L: (en) => en, esc: String, warn: String,
    });
    assert.equal(visible.ok, true);
    assert.deepEqual(visible.meta.data, third);
    assert.equal(visible.meta.output.version, output.output.version);
  } finally {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  }
});
