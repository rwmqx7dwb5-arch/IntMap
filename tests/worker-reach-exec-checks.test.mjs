/* worker-reach — a delegated worker on the page makes several capability calls in one request (run at the same time, answered in
   order), may be given a larger output budget by its contract, and may be shown the reader's attached images or the turn's map
   frames. Real code (js/atlas-delegate.js, js/atlas-job-core.js) with a fake ask and a fake lane: no network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorkerExecutor, makeDelegation, normaliseContract, contractKey, toolCallsOf, resolveTaskImages, IMAGE_VIEW } from '../js/atlas-delegate.js';
import { planJob } from '../js/atlas-job-core.js';

const ctx = () => { const ev = []; return { ev, signal: undefined, emit: (kind, data) => { const e = { id: 'e' + ev.length, kind, data }; ev.push(e); return e; } }; };
const FINAL = { summary: 'looked', findings: [{ claim: 'c', source: 'data.a', excerpt: '1' }] };
const env = (data) => ({ data, meta: { costUsd: 0 }, citations: [] });
/* a fake ask that answers from a script and records every argument it was given */
function scripted(answers) {
  const seen = []; let i = 0;
  const ask = async (prompt, system, images, opts) => { seen.push({ prompt, system, images, opts }); return env(answers[Math.min(i++, answers.length - 1)]); };
  ask.seen = seen;
  return ask;
}
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const JPG = 'data:image/jpeg;base64,/9j/4AAQ';

test('two independent calls in one request both run, at the same time, and come back in the order asked', async () => {
  const spans = [];
  const lane = { classify: () => 'read', run: async (id, args) => {
    const t0 = Date.now(); spans.push({ id, start: t0, end: null });
    await new Promise((r) => setTimeout(r, id === 'data.a' ? 120 : 40));   /* the first one asked is the slower one */
    spans.find((x) => x.id === id).end = Date.now();
    return { ok: true, text: 'answer of ' + id + ' ' + JSON.stringify(args) };
  } };
  const ask = scripted([{ calls: [{ capability: 'data.a', args: { q: 1 } }, { capability: 'data.b', args: { q: 2 } }] }, FINAL]);
  const r = await makeWorkerExecutor({ ask, parentTurn: 'p', maxCalls: null, capability: lane }).run({ id: 't', goal: 'g', tools: ['data.a', 'data.b'] }, ctx());
  assert.equal(r.state, 'done');
  assert.equal(spans.length, 2, 'both calls ran');
  const [a, b] = spans;
  assert.ok(b.start < a.end && a.start < b.end, 'the two runs overlapped in time');
  const p = ask.seen[1].prompt;
  assert.ok(p.indexOf('1. data.a') >= 0 && p.indexOf('2. data.b') > p.indexOf('1. data.a'), 'results are listed in the order asked, not the order they finished');
  assert.match(p, /answer of data\.a \{"q":1\}/); assert.match(p, /answer of data\.b \{"q":2\}/);
  assert.equal(ask.seen.length, 2, 'one request asked for both, one more returned the findings');
});

test('the single {"call":…} form still works', async () => {
  const log = [];
  const lane = { classify: () => 'read', run: async (id, args) => { log.push([id, args]); return { ok: true, text: 'x' }; } };
  const ask = scripted([{ call: { capability: 'data.a', args: { n: 1 } } }, FINAL]);
  const r = await makeWorkerExecutor({ ask, parentTurn: 'p', maxCalls: 4, capability: lane }).run({ id: 't', goal: 'g', tools: ['data.a'] }, ctx());
  assert.equal(r.state, 'done');
  assert.deepEqual(log, [['data.a', { n: 1 }]]);
  assert.deepEqual(toolCallsOf({ call: { capability: 'x', args: {} } }), [{ capability: 'x', args: {} }]);
  assert.equal(toolCallsOf({ summary: 's' }), null);
});

test('the same call twice in one request runs once; a request of only answered calls is no progress', async () => {
  const log = [];
  const lane = { classify: () => 'read', run: async (id, args) => { log.push([id, args]); return { ok: true, text: 'once' }; } };
  const dup = { capability: 'data.a', args: { n: 1 } };
  const ask = scripted([{ calls: [dup, dup] }, { calls: [dup] }, { calls: [dup] }]);
  const r = await makeWorkerExecutor({ ask, parentTurn: 'p', maxCalls: null, capability: lane }).run({ id: 't', goal: 'g', tools: ['data.a'] }, ctx());
  assert.equal(log.length, 1, 'run once, every repeat answered from the first');
  assert.match(ask.seen[1].prompt, /earlier in this list; not run again/);
  assert.equal(r.code, 'repeated_calls');
});

test('the prompt tells the worker to put independent calls in one request (page and shared worker text)', async () => {
  const ask = scripted([FINAL]);
  await makeWorkerExecutor({ ask, parentTurn: 'p', capability: { classify: () => 'read', run: async () => ({ ok: true }) } }).run({ id: 't', goal: 'g', tools: ['data.a'] }, ctx());
  assert.match(ask.seen[0].prompt, /\{"calls":\[/);
  assert.match(ask.seen[0].prompt, /ONE request/);
  assert.match(ask.seen[0].system, /in the SAME request/);
});

test('a stated output size reaches ask as maxOutputHint; an unstated one leaves the server default', async () => {
  const nc = normaliseContract({ goal: 'g', maxOutput: 9000 });
  assert.equal(nc.contract.maxOutput, 9000);
  assert.equal('maxOutput' in normaliseContract({ goal: 'g', maxOutput: -3 }).contract, false);
  assert.equal('maxOutput' in normaliseContract({ goal: 'g', maxOutput: 'big' }).contract, false);
  const ask = scripted([FINAL]);
  const D = makeDelegation({ executor: makeWorkerExecutor({ ask, parentTurn: 'p' }) });
  await D.run([{ id: 'a', goal: 'g', maxOutput: 9000 }]);
  assert.equal(ask.seen[0].opts.maxOutputHint, 9000, 'the contract carries it through makeDelegation to the ask');
  const ask2 = scripted([FINAL]);
  await makeDelegation({ executor: makeWorkerExecutor({ ask: ask2, parentTurn: 'p' }) }).run([{ id: 'a', goal: 'g' }]);
  assert.equal(ask2.seen[0].opts.maxOutputHint, undefined);
  assert.notEqual(contractKey(nc.contract), contractKey(normaliseContract({ goal: 'g' }).contract), 'a larger budget is different work, not answered from the cut one');
  assert.equal(contractKey(normaliseContract({ goal: 'g' }).contract), JSON.stringify(['worker', 'g', '', [], '', null, [], '']), 'a contract without the new fields keeps the key it always had');
});

test('an image named by the task reaches ask\'s images argument, on every request, and is named in the prompt', async () => {
  const source = {
    attachment: (n) => (n === 'image-1' ? { kind: 'image', name: 'image-1', dataUrl: PNG } : n === 'paper.pdf' ? { kind: 'doc', name: 'paper.pdf', mime: 'application/pdf' } : null),
    attachmentNames: () => ['image-1', 'paper.pdf'],
    frames: () => [JPG],
    framesText: () => 'image 1 = view-frame-1 · zoom 9',
  };
  const ask = scripted([{ not: 'shape' }, FINAL]);
  const D = makeDelegation({ executor: makeWorkerExecutor({ ask, parentTurn: 'p', images: source }) });
  const [r] = await D.run([{ id: 'a', goal: 'g', images: ['image-1', IMAGE_VIEW, 'paper.pdf', 'nope.png'] }]);
  assert.deepEqual(ask.seen[0].images, [PNG, JPG]);
  assert.deepEqual(ask.seen[1].images, [PNG, JPG], 'the repair request carries them too');
  assert.match(ask.seen[0].prompt, /image 1 = image-1/); assert.match(ask.seen[0].prompt, /image 2 = @view/); assert.match(ask.seen[0].prompt, /zoom 9/);
  assert.match(r.gaps.join(' '), /paper\.pdf" is application\/pdf, not an image/);
  assert.match(r.gaps.join(' '), /No attachment is called "nope\.png" \(this conversation has: image-1, paper\.pdf\)/);
});

test('with no image dependency, a task that names images is told so explicitly — no images are sent', async () => {
  const ask = scripted([FINAL]);
  const r = await makeWorkerExecutor({ ask, parentTurn: 'p' }).run({ id: 't', goal: 'g', images: ['image-1', IMAGE_VIEW] }, ctx());
  assert.equal(ask.seen[0].images, null);
  assert.match(r.gaps.join(' '), /"image-1" could not be shown: this host gives workers no access to the reader's attachments/);
  assert.match(r.gaps.join(' '), /map frames \("@view"\) could not be shown/);
  assert.match(ask.seen[0].prompt, /IMAGES YOU WERE TO SEE BUT ARE NOT SHOWN/);
  const none = resolveTaskImages([IMAGE_VIEW], { frames: () => null });
  assert.equal(none.urls.length, 0); assert.match(none.notes[0], /No map frame had been captured/);
});

test('a worker without images or a size asks exactly as before', async () => {
  const ask = scripted([FINAL]);
  await makeWorkerExecutor({ ask, parentTurn: 'p', images: { frames: () => [JPG] } }).run({ id: 't', goal: 'g' }, ctx());
  assert.equal(ask.seen[0].images, null);
  assert.doesNotMatch(ask.seen[0].prompt, /IMAGES/);
  assert.equal(ask.seen[0].opts.maxOutputHint, undefined);
});

test('the server job planner refuses what its runner does not carry, by name', () => {
  assert.equal(planJob([{ goal: 'g', images: ['image-1'] }]).error, 'images_unsupported_on_server');
  assert.equal(planJob([{ goal: 'g', maxOutput: 8000 }]).error, 'output_size_unsupported_on_server');
  assert.equal(planJob([{ goal: 'g', maxOutput: 8000 }], { maxOutput: true }).ok, true);
  assert.equal(planJob([{ goal: 'g' }]).ok, true);
});
