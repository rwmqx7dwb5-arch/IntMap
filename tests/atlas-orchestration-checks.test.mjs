/* Atlas orchestration — the substrate's additions (js/atlas-delegate.js) and what is built on it (js/atlas-orchestrate.js).
   Every check evaluates the code with a fake executor or a fake `ask`; none reads source text to decide. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDelegation, makeWorkerExecutor, normaliseContract, contractKey, isTransientFailure, stable } from '../js/atlas-delegate.js';
import { integrate, fanOut, verifyContract, htmlToText, canonicalUrl, fold, makeCapabilityExecutor, makeRouterExecutor } from '../js/atlas-orchestrate.js';

const ok = (summary, extra) => Object.assign({ state: 'done', summary, findings: [], gaps: [], sources: [], costUsd: 0.01, calls: 1 }, extra || {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('① a watcher sees each event as it is written, in order, and a throwing watcher breaks nothing', async () => {
  const seen = [];
  const D = makeDelegation({ executor: { id: 'x', run: async () => ok('a') } });
  const off = D.subscribe((e) => seen.push(e.kind));
  D.subscribe(() => { throw new Error('boom'); });
  const [r] = await D.run([{ goal: 'g' }]);
  assert.equal(r.state, 'done');
  assert.deepEqual(seen, ['task.created', 'task.lease', 'task.ended']);
  off();
  await D.run([{ goal: 'g2' }]);
  assert.equal(seen.length, 3, 'an unsubscribed watcher hears nothing more');
});

test('② the executor’s own events reach the watcher too (live progress is the log, read)', async () => {
  const seen = [];
  const D = makeDelegation({ executor: { id: 'x', run: async (_t, ctx) => { ctx.emit('effect.intent', { n: 1 }); return ok('a'); } } });
  D.subscribe((e) => seen.push(e.kind));
  await D.run([{ goal: 'g' }]);
  assert.ok(seen.includes('effect.intent'));
});

test('③ cancel(id) stops one task and leaves the others; its dependent ends input_unavailable', async () => {
  const D = makeDelegation({ executor: { id: 'x', run: (t, ctx) => new Promise((res) => {
    if (t.goal === 'slow') ctx.signal.addEventListener('abort', () => res({ state: 'cancelled' }));
    else res(ok('fast'));
  }) } });
  const slow = D.start({ id: 'slow', goal: 'slow' });
  const fast = D.start({ id: 'fast', goal: 'fast' });
  const dep = D.start({ id: 'dep', goal: 'after', inputs: [{ from: 'slow' }] });
  await sleep(5);
  assert.equal(D.cancel('slow'), true);
  assert.equal(D.cancel('nope'), false);
  const [a, b, c] = await Promise.all([slow.promise, fast.promise, dep.promise]);
  assert.equal(a.state, 'cancelled');
  assert.equal(b.state, 'done');
  assert.equal(c.state, 'failed');
  assert.equal(c.code, 'input_unavailable');
});

test('④ snapshot is plain JSON and resume answers a finished task from the record without running it or re-spending', async () => {
  let ran = 0;
  const ex = { id: 'x', run: async () => { ran += 1; return ok('found', { findings: [{ claim: 'c' }], costUsd: 0.5, calls: 2 }); } };
  const D1 = makeDelegation({ executor: ex, parent: 'p' });
  await D1.run([{ goal: 'g1' }, { goal: 'g2' }]);
  assert.equal(ran, 2);
  const snap = JSON.parse(JSON.stringify(D1.snapshot()));
  assert.equal(snap.v, 1);
  assert.equal(snap.results.length, 2);
  const D2 = makeDelegation({ executor: ex, parent: 'p', resume: snap });
  const out = await D2.run([{ goal: 'g1' }, { goal: 'g3' }]);
  assert.equal(ran, 3, 'only the new piece of work ran');
  assert.equal(out[0].resumed, true);
  assert.equal(out[0].summary, 'found');
  assert.equal(out[0].costUsd, 0, 'what the first run spent is not spent again');
  assert.equal(out[1].resumed, false);
  assert.equal(D2.spendUsd(), 0, 'resumed work adds no spend to the second log');
  assert.ok(D2.log.all().some((e) => e.kind === 'task.resumed' && e.data.costUsd === 0.5), 'the record keeps what it cost the first time');
});

test('⑤ resume does not carry a task that did not end usable', async () => {
  let ran = 0;
  const D1 = makeDelegation({ executor: { id: 'x', run: async () => ({ state: 'failed', code: 'e' }) } });
  await D1.run([{ goal: 'g' }]);
  const D2 = makeDelegation({ executor: { id: 'x', run: async () => { ran += 1; return ok('now'); } }, resume: D1.snapshot() });
  const [r] = await D2.run([{ goal: 'g' }]);
  assert.equal(ran, 1);
  assert.equal(r.state, 'done');
});

test('⑥ a capability contract needs a capability, bounds its arguments and has an identity that ignores key order', () => {
  assert.equal(normaliseContract({ kind: 'capability' }).error, 'capability_missing');
  assert.equal(normaliseContract({ kind: 'capability', capability: 'data.weather', args: { x: 'y'.repeat(5000) } }).error, 'args_too_large');
  const a = normaliseContract({ kind: 'capability', capability: 'data.weather', args: { city: 'Tokyo', units: 'c' } }).contract;
  const b = normaliseContract({ kind: 'capability', capability: 'data.weather', args: { units: 'c', city: 'Tokyo' } }).contract;
  assert.equal(contractKey(a), contractKey(b));
  assert.notEqual(contractKey(a), contractKey(normaliseContract({ goal: 'data.weather' }).contract), 'a worker task is not the same work as a capability task');
  assert.equal(stable({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
});

test('⑦ the same capability asked twice in one delegation is one task (the repeat is answered, not re-run)', async () => {
  let ran = 0;
  const D = makeDelegation({ executor: { id: 'x', run: async () => { ran += 1; return ok('w'); } } });
  const out = await D.run([{ kind: 'capability', capability: 'data.weather', args: { c: 1 } }, { kind: 'capability', capability: 'data.weather', args: { c: 1 } }]);
  assert.equal(ran, 1);
  assert.equal(out[1].reused, true);
});

test('⑧ data a capability returns rides on the result; data past the bound is dropped and the result says so', async () => {
  const D = makeDelegation({ executor: { id: 'x', run: async (t) => ok('s', { data: t.goal === 'big' ? { blob: 'z'.repeat(30000) } : { v: 3 } }) } });
  const [small, big] = await D.run([{ goal: 'small' }, { goal: 'big' }]);
  assert.deepEqual(small.data, { v: 3 });
  assert.equal(big.data, undefined);
  assert.ok(big.gaps.some((g) => /too large/.test(g)));
});

test('⑨ the capability executor refuses what is not read-only, what is unknown, and everything when it cannot classify', async () => {
  const calls = [];
  const run = async (id, args) => { calls.push(id); return { ok: true, html: '<div><b>Tokyo</b> 18&deg; &amp; clear</div>', meta: { temp: 18 } }; };
  const ex = makeCapabilityExecutor({ run, classify: (id) => (id === 'data.weather' ? 'read' : id === 'ghost' ? 'unknown' : 'other') });
  const D = makeDelegation({ executor: makeRouterExecutor({ capability: ex }) });
  const out = await D.run([
    { kind: 'capability', capability: 'data.weather', args: { city: 'Tokyo' } },
    { kind: 'capability', capability: 'layers.set', args: {} },
    { kind: 'capability', capability: 'ghost', args: {} },
  ]);
  assert.equal(out[0].state, 'done');
  assert.match(out[0].summary, /Tokyo/);
  assert.deepEqual(out[0].data, { temp: 18 });
  assert.equal(out[0].costUsd, 0);
  assert.equal(out[1].state, 'refused');
  assert.equal(out[1].code, 'capability_not_read_only');
  assert.equal(out[2].code, 'capability_unknown');
  assert.deepEqual(calls, ['data.weather'], 'a refused capability was never run');
  const blind = makeCapabilityExecutor({ run });
  const r = await blind.run({ capability: 'data.weather' }, { emit: () => ({ id: 'e' }) });
  assert.equal(r.code, 'capability_not_read_only', 'no classifier, no run');
});

test('⑩ a capability that fails or throws is `failed` with its own code; an abort is `cancelled`', async () => {
  const mk = (run) => makeDelegation({ executor: makeRouterExecutor({ capability: makeCapabilityExecutor({ run, classify: () => 'read' }) }) });
  const [a] = await mk(async () => ({ ok: false, code: 'no_data', text: 'nothing there' })).run([{ kind: 'capability', capability: 'c' }]);
  assert.equal(a.state, 'failed'); assert.equal(a.code, 'no_data'); assert.equal(a.summary, 'nothing there');
  const [b] = await mk(async () => { throw new Error('kernel down'); }).run([{ kind: 'capability', capability: 'c' }]);
  assert.equal(b.state, 'failed'); assert.equal(b.code, 'capability_threw');
  const D = mk((_id, _a, { signal }) => new Promise((_res, rej) => { signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' }))); }));
  const h = D.start({ kind: 'capability', capability: 'c' });
  await sleep(2); h.cancel();
  assert.equal((await h.promise).state, 'cancelled');
});

test('⑪ the router refuses a kind it has no executor for instead of running it as another kind', async () => {
  const D = makeDelegation({ executor: makeRouterExecutor({ worker: { id: 'w', run: async () => ok('w') } }) });
  const [r] = await D.run([{ kind: 'capability', capability: 'c' }]);
  assert.equal(r.state, 'refused');
  assert.equal(r.code, 'kind_unsupported');
});

/* ── the worker's retry ─────────────────────────────────────────────────────────────────────────────────────── */
const env = (data, extra) => Object.assign({ data, text: '', citations: [], meta: { costUsd: 0.02 } }, extra || {});
const goodData = { summary: 'fine', findings: [{ claim: 'a claim' }], gaps: [] };
const fail = (code, extra) => Object.assign(new Error(code), { code }, extra || {});

test('⑫ transient failures are told apart from refusals, network loss and ordinary errors', () => {
  assert.equal(isTransientFailure('provider_unavailable', {}), true);
  assert.equal(isTransientFailure('x', { timeout: true }), true);
  assert.equal(isTransientFailure('x', { status: 503 }), true);
  assert.equal(isTransientFailure('x', { status: 400 }), false);
  assert.equal(isTransientFailure('bad_task', {}), false);
});

test('⑬ after an OBSERVED transient failure the worker asks again — a different request — within the server’s call bound', async () => {
  const reqs = [];
  const ask = async (prompt, _sys, _img, o) => { reqs.push({ prompt, webMode: o.webMode }); if (reqs.length === 1) throw fail('provider_unavailable', { status: 503 }); return env(goodData); };
  const D = makeDelegation({ executor: makeWorkerExecutor({ ask, parentTurn: 'p', maxCalls: 3 }) });
  const [r] = await D.run([{ goal: 'g' }]);
  assert.equal(reqs.length, 2);
  assert.notEqual(reqs[0].prompt, reqs[1].prompt, 'the retry is not the same request');
  assert.equal(r.state, 'done');
  assert.equal(r.calls, 2);
  assert.ok(D.log.all().some((e) => e.kind === 'effect.retry' && e.data.change === 'concise'));
});

test('⑭ a web search that timed out is retried WITHOUT the web, and the result says it is unverified (partial/degraded)', async () => {
  const reqs = [];
  const ask = async (_p, _s, _i, o) => { reqs.push(o.webMode); if (reqs.length === 1) throw fail('provider_unavailable', { status: 503, meta: { timeout: true } }); return env(goodData); };
  const [r] = await makeDelegation({ executor: makeWorkerExecutor({ ask, parentTurn: 'p', maxCalls: 3 }) }).run([{ goal: 'g' }]);
  assert.deepEqual(reqs, ['auto', 'off']);
  assert.equal(r.state, 'partial');
  assert.equal(r.code, 'degraded');
  assert.match(r.gaps[0], /without it/);
});

test('⑮ no retry when the bound is spent, for a refusal, or for a request that never came back', async () => {
  const count = async (err, maxCalls) => { let n = 0; await makeDelegation({ executor: makeWorkerExecutor({ ask: async () => { n += 1; throw err; }, parentTurn: 'p', maxCalls }) }).run([{ goal: 'g' }]); return n; };
  assert.equal(await count(fail('provider_unavailable', { status: 503 }), 1), 1, 'maxCalls 1 → one request');
  assert.equal(await count(fail('provider_unavailable', { status: 503 }), 2), 2, 'the second is the retry, then it stops');
  assert.equal(await count(fail('delegation_children'), 3), 1, 'a refusal is the server’s decision');
  assert.equal(await count(fail('network', { status: 0 }), 3), 1, 'unobservable is not known to have failed');
});

test('⑯ without maxCalls the worker still does what it did before: one request and one repair of a wrong shape', async () => {
  let n = 0;
  const [r] = await makeDelegation({ executor: makeWorkerExecutor({ ask: async () => { n += 1; return env({ nope: 1 }, { text: 'raw' }); }, parentTurn: 'p' }) }).run([{ goal: 'g' }]);
  assert.equal(n, 2);
  assert.equal(r.state, 'partial');
  assert.equal(r.code, 'shape');
});

/* ── integrate ──────────────────────────────────────────────────────────────────────────────────────────────── */
test('⑰ integrate: one finding per claim with who else found it; one source per page however it was spelled', () => {
  const r1 = ok('s1', { id: 'a', findings: [{ claim: 'Ras Tanura loads 6.5 million barrels a day', place: 'Ras Tanura', source: 'https://www.example.com/x/?utm_source=a#top' }], sources: [{ url: 'https://example.com/x', title: 'Example' }] });
  const r2 = ok('s2', { id: 'b', findings: [{ claim: 'Ras  Tanura loads 6.5 million barrels a day!', place: 'ras tanura' }], sources: [{ url: 'http://EXAMPLE.com/x/', title: '' }, { url: 'https://other.org/y', title: 'Other' }] });
  const m = integrate([r1, r2]);
  assert.equal(m.findings.length, 1);
  assert.deepEqual(m.findings[0].alsoFoundBy, ['b']);
  assert.equal(m.sources.length, 2);
  assert.deepEqual(m.sources.find((x) => /example/.test(x.url)).citedBy.sort(), ['a', 'b']);
  assert.equal(m.placeOverlaps.length, 1);
  assert.equal(m.placeOverlaps[0].numbersDiffer, false);
});

test('⑱ integrate: two workers on one place with different figures are flagged, not resolved', () => {
  const m = integrate([
    ok('s', { id: 'a', findings: [{ claim: 'Hormuz carries 21 million barrels a day', place: 'Strait of Hormuz' }] }),
    ok('s', { id: 'b', findings: [{ claim: 'Hormuz carried 17.8 million barrels a day', place: 'strait of hormuz' }] }),
  ]);
  assert.equal(m.findings.length, 2, 'neither claim is dropped');
  assert.equal(m.placeOverlaps[0].numbersDiffer, true);
  assert.deepEqual(m.placeOverlaps[0].tasks.sort(), ['a', 'b']);
});

test('⑲ integrate: who did not return is named with the way they did not (failed ≠ unobservable ≠ refused); gaps carry their task; cost and wall clock are read off the results', () => {
  const m = integrate([
    ok('s', { id: 'a', gaps: ['no 2024 figure'], costUsd: 0.1, calls: 2, ms: 4000 }),
    { id: 'b', state: 'failed', code: 'provider_unavailable', summary: '', costUsd: 0, calls: 1, ms: 9000, findings: [], gaps: [], sources: [] },
    { id: 'c', state: 'unobservable', code: 'network', summary: '', costUsd: 0, calls: 1, ms: 100, findings: [], gaps: [], sources: [] },
    { id: 'd', state: 'refused', code: 'delegation_children', summary: '', costUsd: 0, calls: 0, ms: 5, findings: [], gaps: [], sources: [] },
  ]);
  assert.deepEqual(m.unreturned.map((u) => u.state), ['failed', 'unobservable', 'refused']);
  assert.deepEqual(m.gaps, [{ task: 'a', gap: 'no 2024 figure' }]);
  assert.equal(m.coverage.usable, 1);
  assert.equal(m.coverage.tasks, 4);
  assert.equal(m.cost.wallMs, 9000);
  assert.equal(m.cost.workMs, 13105);
  assert.ok(Math.abs(m.cost.usd - 0.1) < 1e-9);
  assert.equal(integrate(null).coverage.tasks, 0, 'nothing in, nothing out — no throw');
});

test('⑳ fanOut makes ids a later task can name; verifyContract names the checked task as its input and the delegation runs it after', async () => {
  const cs = fanOut(['Japan', { name: 'Korea' }], 'Find the 2023 port throughput of {item}', { prefix: 'p' });
  assert.deepEqual(cs.map((c) => c.id), ['p1', 'p2']);
  assert.match(cs[1].goal, /Korea/);
  const order = [];
  const D = makeDelegation({ executor: { id: 'x', run: async (t) => { order.push(t.id); await sleep(t.id === 'p1' ? 8 : 0); return ok('r ' + t.id, { findings: [{ claim: 'c' }] }); } } });
  const v = verifyContract('p1');
  assert.deepEqual(v.inputs, [{ from: 'p1' }]);
  const out = await D.run([cs[0], v]);
  assert.deepEqual(order, ['p1', 'verify-p1'], 'the checker started only after what it checks had ended');
  assert.equal(out[1].state, 'done');
});

test('㉑ text helpers: htmlToText, canonicalUrl and fold', () => {
  assert.equal(htmlToText('<p>A &amp; B</p><ul><li>one</li><li>two</li></ul><script>x()</script>'), 'A & B\none\ntwo');
  assert.equal(canonicalUrl('https://www.Example.com/a/b/?utm_medium=x&b=2&a=1#f'), 'example.com/a/b?a=1&b=2');
  assert.equal(canonicalUrl(''), '');
  assert.equal(fold('  東京、 Tokyo!! '), '東京 tokyo');
});

test('㉒ every worker request carries a key that is the request’s identity: same request same key, repair/retry/another call with the same task id a different one', async () => {
  const { requestKey } = await import('../js/atlas-delegate.js');
  const KEY_OK = /^[A-Za-z0-9._:-]{8,120}$/;   /* ai-proxy config.ts REPLAY_KEY_OK */
  assert.ok(KEY_OK.test(requestKey('p', 'auto')));
  assert.equal(requestKey('p', 'auto'), requestKey('p', 'auto'));
  assert.notEqual(requestKey('p', 'auto'), requestKey('p', 'off'));
  assert.notEqual(requestKey('p', 'auto'), requestKey('q', 'auto'));
  const keys = [];
  const ask = async (_p, _s, _i, o) => { keys.push(o.replayKey); if (keys.length === 1) throw fail('provider_unavailable', { status: 503 }); return env(goodData); };
  await makeDelegation({ executor: makeWorkerExecutor({ ask, parentTurn: 'p', maxCalls: 3 }) }).run([{ id: 'task1', goal: 'one' }]);
  await makeDelegation({ executor: makeWorkerExecutor({ ask: async (_p, _s, _i, o) => { keys.push(o.replayKey); return env(goodData); }, parentTurn: 'p' }) }).run([{ id: 'task1', goal: 'two' }]);
  assert.equal(keys.length, 3);
  assert.equal(new Set(keys).size, 3, 'the first attempt, its retry, and a second delegation reusing the id "task1" all hold different keys');
  assert.ok(keys.every((k) => KEY_OK.test(k)));
});

/* ── the list is read whole: forward names, cycles, argument references ─────────────────────────────────────── */
test('㉓ a task may name an input that comes LATER in the same list; it waits for it', async () => {
  const order = [];
  const D = makeDelegation({ executor: { id: 'x', run: async (t) => { order.push(t.id); await sleep(t.id === 'a' ? 10 : 0); return ok('r ' + t.id); } } });
  const out = await D.run([{ id: 'b', goal: 'second', inputs: [{ from: 'a' }] }, { id: 'a', goal: 'first' }]);
  assert.deepEqual(order, ['a', 'b'], 'b started only after a, though b is listed first');
  assert.deepEqual(out.map((r) => r.state), ['done', 'done']);
});

test('㉔ a cycle is ended `input_cycle` at once, for every member, and what only depends on it ends input_unavailable', async () => {
  const D = makeDelegation({ executor: { id: 'x', run: async () => ok('r') } });
  const out = await Promise.race([
    D.run([{ id: 'a', goal: 'a', inputs: [{ from: 'b' }] }, { id: 'b', goal: 'b', inputs: [{ from: 'a' }] }, { id: 'c', goal: 'c', inputs: [{ from: 'a' }] }, { id: 'd', goal: 'd' }, { id: 'e', goal: 'e', inputs: [{ from: 'e' }] }]),
    sleep(500).then(() => 'DEADLOCK'),
  ]);
  assert.notEqual(out, 'DEADLOCK');
  assert.deepEqual(out.map((r) => r.code || r.state), ['input_cycle', 'input_cycle', 'input_unavailable', 'done', 'input_cycle']);
});

test('㉕ a name that is no task of the list is still input_unknown (a forward name is only a name in THIS list)', async () => {
  const D = makeDelegation({ executor: { id: 'x', run: async () => ok('r') } });
  const out = await D.run([{ id: 'a', goal: 'a', inputs: [{ from: 'ghost' }] }]);
  assert.equal(out[0].code, 'input_unknown');
});

test('㉖ resolveArgs: a reference is replaced by what the input holds; a literal @ stays; an undeclared or dangling reference refuses the step', async () => {
  const { resolveArgs } = await import('../js/atlas-delegate.js');
  const inputs = [{ from: 'acq', data: { gis: { dataset: 'ds-7', count: 12 } }, summary: 'made it' }];
  assert.deepEqual(resolveArgs({ inputs: ['@acq:data.gis.dataset'], params: { n: '@acq:data.gis.count', s: '@acq:summary' }, lit: '@@keep' }, inputs),
    { ok: true, args: { inputs: ['ds-7'], params: { n: 12, s: 'made it' }, lit: '@keep' } });
  assert.equal(resolveArgs({ x: '@other:data.a' }, inputs).ok, false, 'not an input');
  assert.match(resolveArgs({ x: '@acq:data.gis.nope' }, inputs).why, /nope/);
  assert.deepEqual(resolveArgs({ plain: 'text with @ inside', n: 3 }, inputs), { ok: true, args: { plain: 'text with @ inside', n: 3 } });
});

test('㉗ one analysis step is handed the dataset the step before it made (capability tasks chained through @ref)', async () => {
  const seen = [];
  const ex = makeCapabilityExecutor({ classify: () => 'read', run: async (cap, args) => { seen.push([cap, args]); return cap === 'data.gis' && !args.inputs ? { ok: true, html: 'made', meta: { gis: { dataset: 'ds-1' } } } : { ok: true, html: 'used', meta: { used: args.inputs } }; } });
  const D = makeDelegation({ executor: makeRouterExecutor({ capability: ex }) });
  const out = await D.run([
    { id: 'use', kind: 'capability', capability: 'data.gis', args: { op: 'buffer', inputs: ['@make:data.gis.dataset'] }, inputs: [{ from: 'make' }] },
    { id: 'make', kind: 'capability', capability: 'data.gis', args: { acquire: { layer: 'ports' } } },
  ]);
  assert.deepEqual(out.map((r) => r.state), ['done', 'done']);
  assert.deepEqual(seen[1], ['data.gis', { op: 'buffer', inputs: ['ds-1'] }]);
  assert.deepEqual(out[0].data, { used: ['ds-1'] });
  const bad = await makeDelegation({ executor: makeRouterExecutor({ capability: ex }) }).run([
    { id: 'm', kind: 'capability', capability: 'data.gis', args: {} },
    { id: 'u', kind: 'capability', capability: 'data.gis', args: { inputs: ['@m:data.gis.missing'] }, inputs: [{ from: 'm' }] },
  ]);
  assert.equal(bad[1].code, 'input_ref_unresolved');
});

test('㉘ a worker that is handed a capability task’s data sees it in its prompt', async () => {
  let prompt = '';
  const exw = makeWorkerExecutor({ ask: async (p) => { prompt = p; return env(goodData); }, parentTurn: 'p' });
  const cap = makeCapabilityExecutor({ classify: () => 'read', run: async () => ({ ok: true, text: 'weather', meta: { temp: 18 } }) });
  await makeDelegation({ executor: makeRouterExecutor({ worker: exw, capability: cap }) }).run([
    { id: 'w', kind: 'capability', capability: 'data.weather', args: {} },
    { id: 'r', goal: 'interpret', inputs: [{ from: 'w' }] },
  ]);
  assert.match(prompt, /"temp":18/);
});

test('㉙ verifyOutcome: a verdict is found by the claim ID, not its wording; everything else is unchecked, never guessed', async () => {
  const { verifyOutcome } = await import('../js/atlas-orchestrate.js');
  const of = ok('s', { id: 'a', findings: [{ claim: 'Hormuz carries 21 mb/d' }, { claim: 'Malacca is 2.8 km wide' }, { claim: 'Suez opened in 1869' }] });
  /* the checker rewords claim 1 (it would have been «unchecked» when matched by text), and answers an id nobody asked about */
  const by = ok('s', { id: 'verify-a', findings: [{ id: 'a#1', claim: 'about 21 million barrels a day pass Hormuz', verdict: 'supported', source: 'https://x.org' }, { id: 'a#3', claim: 'Suez opened in 1869', verdict: 'contradicted' }, { id: 'zzz#9', claim: 'unrelated', verdict: 'supported' }] });
  const o = verifyOutcome([{ of, by }]);
  assert.deepEqual(o.counts, { supported: 1, unsupported: 0, contradicted: 1, unchecked: 1 });
  assert.equal(o.checked.find((c) => c.id === 'a#2').verdict, 'unchecked');
  assert.equal(o.checked.find((c) => c.id === 'a#1').verdict, 'supported');
  assert.equal(o.checked.find((c) => c.id === 'a#1').basis, 'model');
  const dead = verifyOutcome([{ of, by: { id: 'verify-a', state: 'refused', code: 'delegation_children', findings: [] } }]);
  assert.deepEqual(dead.counts, { supported: 0, unsupported: 0, contradicted: 0, unchecked: 3 });
  assert.equal(dead.verifiers[0].state, 'refused');
  assert.equal(verifyOutcome([{ of, by: null }]).verifiers[0].state, 'not_started');
  const odd = verifyOutcome([{ of, by: ok('s', { id: 'verify-a', findings: [{ id: 'a#1', verdict: 'probably' }] }) }]);
  assert.equal(odd.counts.unchecked, 3, 'a verdict that is not one of the three words is not a verdict');
});

test('㉚ a worker finding keeps a verdict only when it is one of the three words', async () => {
  const { shapeOf } = await import('../js/atlas-delegate.js');
  const r = shapeOf({ summary: 's', findings: [{ claim: 'a', verdict: 'supported' }, { claim: 'b', verdict: 'probably' }] });
  assert.equal(r.out.findings[0].verdict, 'supported');
  assert.equal(r.out.findings[1].verdict, undefined);
});
