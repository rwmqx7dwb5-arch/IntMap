import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb } from './helpers/atlas-job-runner-db.mjs';
import { runJob } from '../supabase/functions/_shared/atlas-job-runner.js';
import { makeServerCaps } from '../supabase/functions/_shared/atlas-server-caps.js';
import { makeHeadlessGis } from '../supabase/functions/_shared/gis-headless.js';
import { loadGis } from '../supabase/functions/_shared/gis-loader.js';

const reply = data => ({ text: JSON.stringify(data), usage: {}, citations: [] });
const call = (capability, args) => ({ capability, args });
const read = (ref, offset, length) => call('read_step', { ref, offset, length });
const answer = 'read the original tool result';
const start = (db, capabilities, callModel, now = () => 0) => runJob({
  db, job: db.st.job, holder: db.st.job.lease_holder, capabilities, callModel, now,
  budgetMs: 30, leaseSeconds: 150, system: 'SYS',
  money: { estimate: () => 1000, actual: () => 500 },
});
const worker = tools => fakeDb([{ id: 'W', deps: [], key: 'contract', contract: { goal: 'Read the tool results', tools } }]);
const payload = out => String(out.text || '') + (out.data === undefined ? '' : '\nDATA: ' + JSON.stringify(out.data));

test('51 GIS rows are recallable from a new lease without running filter again', async t => {
  const id = 'data.gis';
  const url = 'https://data.example.org/points.geojson';
  const features = Array.from({ length: 51 }, (_, i) => ({
    type: 'Feature',
    properties: { row: i, name: i === 50 ? 'Tokyo at the end' : 'row ' + i, pad: '地'.repeat(70) },
    geometry: { type: 'Point', coordinates: [139 + i / 100, 35] },
  }));
  let fetches = 0, original;
  const gis = makeHeadlessGis({ loadGis, now: () => 0 });
  const caps = makeServerCaps({ gis, fetchGeoJson: async () => {
    fetches++;
    return { ok: true, json: { type: 'FeatureCollection', features } };
  } });
  const lane = { ...caps, run: async (...args) => { original = await caps.run(...args); return original; } };
  const args = { op: 'filter', inputs: [url], params: { where: [{ field: 'row', op: '>=', value: 0 }] } };
  const db = worker([id]);
  let now = 0;
  assert.deepEqual(await start(db, lane, async () => {
    now = 31;
    return reply({ calls: [call(id, args)] });
  }, () => now), { outcome: 'more' });
  const task = db.st.tasks.get('W');
  assert.equal(task.status, 'queued');
  const originalBody = payload(original);
  assert.equal(original.data.count, 51);
  assert.ok(originalBody.length > 6000);
  t.diagnostic(originalBody.length + ' UTF-16 units, ' + Buffer.byteLength(JSON.stringify(task.progress)) +
    ' checkpoint bytes, ' + Buffer.byteLength(JSON.stringify(db.st.artifacts[0].body)) + ' artifact bytes');
  const marker = 'Tokyo at the end';
  const offset = originalBody.indexOf(marker) - 8;
  assert.ok(offset >= 6000);
  const length = 70;
  db.st.job.lease_holder = 'h2';
  const prompts = [];
  await start(db, lane, async (_sys, prompt) => {
    prompts.push(prompt);
    if (prompts.length === 1) return reply({ calls: [read('tool:1', offset, length), read('tool:1', 5990, 20)] });
    return reply({ summary: answer, findings: [], gaps: [] });
  });
  assert.match(prompts[0], new RegExp('characters 0-6000 of ' + originalBody.length + ' shown'));
  assert.match(prompts[0], /"ref":"tool:1"/);
  assert.doesNotMatch(prompts[0], /Tokyo at the end/);
  assert.ok(prompts[1].includes(originalBody.slice(offset, offset + length)));
  assert.ok(prompts[1].includes('DATA: ' + originalBody.slice(5990, 6010)));
  assert.match(prompts[1], new RegExp('characters ' + offset + '-' + (offset + length) + ' of ' + originalBody.length));
  assert.equal(task.result.summary, answer);
  assert.equal(fetches, 1);
});

test('old previews can be recalled and ranges cross stored parts without losing Unicode', async t => {
  const id = 'test.read';
  const small = { ok: true, text: 'the small answer', data: { marker: 'the small answer tail' } };
  const large = { ok: true, text: Array.from({ length: 72000 }, (_, i) => i.toString(36).padStart(4, '0') + '🙂').join(''), data: { marker: 'last answer' } };
  const largeBody = payload(large);
  const db = worker([id]);
  const lane = { has: () => true, catalogue: () => [{ id }], run: async (_id, { i }) => i === 0 ? small : large };
  let step = 0, cross, focus;
  await start(db, lane, async (_sys, prompt) => {
    step++;
    if (step === 1) return reply({ calls: [0, 1, 2, 3].map(i => call(id, { i })) });
    if (step === 2) return reply({ calls: [call(id, { i: 4 })] });
    if (step === 3) {
      focus = prompt;
      const parts = db.st.artifacts.filter(x => x.task_id === 'W');
      const first = parts[0];
      if (first) cross = 6000 + JSON.parse(first.body.text).length - 5;
      return reply({ calls: [read('tool:1', 0), read('tool:2', cross || 6000, 40)] });
    }
    assert.ok(prompt.includes(payload(small)));
    assert.ok(prompt.includes('DATA: ' + largeBody.slice(cross, cross + 40)));
    return reply({ summary: answer });
  });
  assert.equal(db.st.tasks.get('W').result?.summary, answer);
  assert.match(focus, new RegExp('characters 0-0 of ' + payload(small).length + ' shown'));
  assert.ok(cross > 6000);
  const progressBytes = Buffer.byteLength(JSON.stringify(db.st.tasks.get('W').progress));
  const artifactBytes = db.st.artifacts.reduce((size, row) => size + Buffer.byteLength(JSON.stringify(row.body)), 0);
  assert.ok(progressBytes < artifactBytes / 3, 'checkpoints keep previews and refs, not the large answers');
  t.diagnostic(progressBytes + ' checkpoint bytes and ' + artifactBytes + ' artifact bytes for four large answers');
});

test('a missing saved part is reported as unreadable and does not return a partial range', async () => {
  const id = 'test.read';
  const db = worker([id]);
  const body = 'A'.repeat(200000) + 'B'.repeat(100000);
  const lane = { has: () => true, catalogue: () => [{ id }], run: async () => ({ ok: true, text: body }) };
  let step = 0;
  const prompts = [];
  await start(db, lane, async (_sys, prompt) => {
    prompts.push(prompt);
    if (++step === 1) return reply({ calls: [call(id)] });
    if (step === 2) {
      const boundary = 6000 + JSON.parse(db.st.artifacts[0].body.text).length;
      db.st.artifacts.pop();
      return reply({ calls: [read('tool:1', boundary - 20, 40)] });
    }
    return reply({ summary: 'range unavailable' });
  });
  assert.match(prompts[2], /read_step [^\n]+FAILED tool_result_unavailable/);
  assert.doesNotMatch(prompts[2], /\(the end\)/);
  assert.equal(db.st.tasks.get('W').result.summary, 'range unavailable');
});

test('an old checkpoint acknowledges the loss of an already-truncated result', async () => {
  const id = 'test.read';
  const db = worker([id]);
  db.st.tasks.get('W').progress = {
    v: 1, calls: 1, entries: [{ n: 1, key: id + '{}', capability: id, args: {}, ok: true, text: 'old', data: 'x'.repeat(6000) + '…[truncated]' }],
  };
  const lane = { has: () => true, catalogue: () => [{ id }] };
  let seen;
  await start(db, lane, async (_sys, prompt) => {
    seen = prompt;
    return reply({ summary: 'older result was incomplete' });
  });
  assert.match(seen, /Its full length and remaining text are unavailable/);
  assert.doesNotMatch(seen, /"ref":"tool:1"/);
});
