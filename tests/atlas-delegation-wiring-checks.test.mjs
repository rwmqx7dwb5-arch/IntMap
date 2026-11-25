/* ============================================================================
 *  atlas-delegation-wiring — research.delegate as the page runs it, EVALUATED
 *  js/atlas-cap-research.js (the entry) · js/atlas-console.js (the host lanes) · js/atlas-toolsurface.js (what Atlas is told)
 *  js/atlas-delegate.js and js/atlas-orchestrate.js have their own checks (atlas-delegation, atlas-orchestration); this file is
 *  the seam between them and the page: which executor the entry builds, what it hands the server's policy, what a capability
 *  task may be, what stops a running task, what the reader sees while it runs, and what Atlas is given back.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const caps = (await import('../js/atlas-cap-research.js')).default;
const entry = caps.find((c) => c.row[0] === 'research.delegate');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { installAtlasKernel } = await import('../js/atlas-executor.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { makeAtlasAgent } = await import('../js/atlas-agent.js');

const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));
const abortErr = () => { const e = new Error('aborted'); e.name = 'AbortError'; return e; };
const okEnv = (summary, extra) => Object.assign({ data: { summary, findings: [] }, meta: { costUsd: 0.01 } }, extra || null);

/* the K a run is given, as far as research.delegate reads it */
function makeK(over) {
  const K = {
    R: (ok, html, extra) => Object.assign({ ok, html }, extra || null), L: (en) => en, esc: (x) => String(x), warn: (x) => x,
    _curTurnKey: 't7-1', turnSignal: () => undefined,
    askAIJSONEnvelope: async () => okEnv('s'),
    _delegationPolicy: { mode: 'independent', maxChildren: 4, childMaxCalls: 3 },
    classifyCapability: (id) => (id === 'weather.now' ? 'read' : id === 'nope' ? 'unknown' : 'other'),
    runReadCapability: async (id, args) => ({ ok: true, html: '<b>' + id + '</b> ' + (args.place || ''), meta: { place: args.place, tempC: 21 } }),
  };
  return Object.assign(K, over || null);
}

test('① a capability task is described to Atlas and validates without a goal; a worker task still needs one', () => {
  const doc = entry.doc.map((d) => d.text).join('\n');
  assert.match(doc, /"kind":"capability"/);
  assert.match(doc, /NO model and NO cost/);
  assert.match(doc, /not read-only[\s\S]*capability_not_read_only/, 'it says what is refused');
  assert.match(doc, /"integrated"/);
  const sch = entry.schema();
  const item = sch.properties.tasks.items;
  assert.deepEqual(item.properties.kind.enum, ['worker', 'capability']);
  assert.ok(item.properties.capability && item.properties.args);
  assert.ok(!(item.required || []).includes('goal'), 'goal is the worker task\'s, not every task\'s');
  /* the kernel's own validator accepts a capability task with no goal; the worker task with no goal is refused at the contract */
  const OS = {};
  const exec = installAtlasKernel(OS, {}, { capabilities: makeAtlasCapabilities({}) });
  return Promise.resolve(exec).then((k) => {
    assert.equal(k.exec.validateArgs(sch, { tasks: [{ kind: 'capability', capability: 'weather.now', args: { place: 'Oslo' } }] }).ok, true);
    assert.equal(k.exec.validateArgs(sch, { tasks: [{ goal: 'a' }] }).ok, true);
  });
});

test('② the executor is the ROUTER: a worker task reaches the model, a capability task reaches the capability, a host without the lane refuses the kind', async () => {
  let asked = 0, ran = 0;
  const K = makeK({ askAIJSONEnvelope: async () => { asked++; return okEnv('w'); }, runReadCapability: async () => { ran++; return { ok: true, html: 'x', meta: { n: 1 } }; } });
  const r = await entry.run({ tasks: [{ id: 'w1', goal: 'research a' }, { id: 'c1', kind: 'capability', capability: 'weather.now', args: { place: 'Oslo' } }] }, {}, K);
  assert.equal(asked, 1); assert.equal(ran, 1);
  assert.deepEqual(r.meta.delegated.map((d) => d.state), ['done', 'done']);
  const bare = makeK({ runReadCapability: undefined });
  const r2 = await entry.run({ tasks: [{ id: 'c1', kind: 'capability', capability: 'weather.now' }] }, {}, bare);
  assert.equal(r2.meta.delegated[0].state, 'refused'); assert.equal(r2.meta.delegated[0].code, 'kind_unsupported');
});

test('③ the server\'s childMaxCalls bounds a worker\'s requests AND turns the retry on; without it nothing is retried', async () => {
  const transient = () => { const e = new Error('down'); e.code = 'provider_unavailable'; e.status = 503; return e; };
  const make = (log) => async (p, s, i, o) => { log.push(o); if (log.length === 1) throw transient(); return okEnv('second try'); };
  const withPolicy = [];
  const a = await entry.run({ tasks: [{ id: 'w', goal: 'g' }] }, {}, makeK({ askAIJSONEnvelope: make(withPolicy) }));
  assert.equal(withPolicy.length, 2, 'an observed transient failure was tried again (the server allows 3)');
  assert.equal(a.meta.delegated[0].state, 'done');
  const without = [];
  const b = await entry.run({ tasks: [{ id: 'w', goal: 'g' }] }, {}, makeK({ askAIJSONEnvelope: make(without), _delegationPolicy: { mode: 'independent', maxChildren: 4 } }));
  assert.equal(without.length, 1, 'no policy number → no retry (the earlier behaviour)');
  assert.equal(b.meta.delegated[0].state, 'failed');
  const tight = [];
  const c = await entry.run({ tasks: [{ id: 'w', goal: 'g' }] }, {}, makeK({ askAIJSONEnvelope: make(tight), _delegationPolicy: { mode: 'independent', maxChildren: 4, childMaxCalls: 1 } }));
  assert.equal(tight.length, 1, 'a server that allows one request is asked once');
  assert.equal(c.meta.delegated[0].state, 'failed');
});

test('④ a capability task is run only when the host classifies it `read`; otherwise it is refused with the reason, and never run', async () => {
  const seen = [];
  const K = makeK({ runReadCapability: async (id, args) => { seen.push(id); return { ok: true, html: '<i>ok</i>', meta: { id, args } }; } });
  const r = await entry.run({ tasks: [
    { id: 'ok', kind: 'capability', capability: 'weather.now', args: { place: 'Oslo' } },
    { id: 'draw', kind: 'capability', capability: 'map.drawLine', args: {} },
    { id: 'ghost', kind: 'capability', capability: 'nope' },
  ] }, {}, K);
  assert.deepEqual(seen, ['weather.now']);
  const by = Object.fromEntries(r.meta.delegated.map((d) => [d.id, d]));
  assert.equal(by.ok.state, 'done');
  assert.deepEqual(by.ok.data, { id: 'weather.now', args: { place: 'Oslo' } }, 'a capability\'s own answer reaches meta.delegated[].data');
  assert.equal(by.ok.costUsd, 0); assert.equal(by.ok.calls, 0);
  assert.equal(by.draw.state, 'refused'); assert.equal(by.draw.code, 'capability_not_read_only');
  assert.equal(by.ghost.state, 'refused'); assert.equal(by.ghost.code, 'capability_unknown');
  assert.equal(r.meta.status, 'partial');
});

test('⑤ aborting the turn cancels the running tasks and the capability returns promptly; the listener does not outlive the run', async () => {
  const ctl = new AbortController();
  const waits = (signal) => new Promise((_, rej) => { if (signal.aborted) rej(abortErr()); else signal.addEventListener('abort', () => rej(abortErr()), { once: true }); });   /* like fetch: an already-aborted signal rejects at once */
  const K = makeK({
    turnSignal: () => ctl.signal,
    askAIJSONEnvelope: (p, s, i, o) => waits(o.signal),
    runReadCapability: (id, a, o) => waits(o.signal),
  });
  const t0 = Date.now();
  const p = entry.run({ tasks: [{ id: 'w', goal: 'slow' }, { id: 'c', kind: 'capability', capability: 'weather.now' }] }, {}, K);
  await tick(20);
  ctl.abort();
  const r = await p;
  assert.ok(Date.now() - t0 < 1500, 'returned promptly, not after a timeout');
  assert.deepEqual(r.meta.delegated.map((d) => d.state), ['cancelled', 'cancelled']);
  assert.equal(r.ok, false);
  /* a signal already aborted when the capability starts: every task still ends, cancelled */
  const r2 = await entry.run({ tasks: [{ id: 'w', goal: 'slow' }] }, {}, K);
  assert.equal(r2.meta.delegated[0].state, 'cancelled');
  /* the listener of a finished run is gone: a signal that is live and only aborted after the run does nothing and throws nothing */
  const ctl2 = new AbortController();
  let removed = 0; const sig = ctl2.signal; const rm = sig.removeEventListener.bind(sig);
  sig.removeEventListener = (...a) => { removed++; return rm(...a); };
  await entry.run({ tasks: [{ id: 'w', goal: 'quick' }] }, {}, makeK({ turnSignal: () => sig }));
  assert.ok(removed >= 1, 'the abort listener was removed when the run ended');
  ctl2.abort();
});

test('⑥ progress: the trace is told, per task, running → done/refused, with the running cost, as the events arrive', async () => {
  const texts = [];
  const K = makeK({ askAIJSONEnvelope: async () => { await tick(5); return okEnv('w'); } });
  await entry.run({ tasks: [{ id: 'w', goal: 'g' }, { id: 'draw', kind: 'capability', capability: 'map.drawLine' }, { id: 'c', kind: 'capability', capability: 'weather.now' }] },
    { progress: (p) => texts.push(p) }, K);
  assert.ok(texts.length >= 6, 'updates arrived as events did, not once at the end: ' + texts.length);
  assert.ok(texts.some((p) => /w running/.test(p.text)), 'a worker is shown running');
  assert.ok(texts.some((p) => /draw refused/.test(p.text)), 'a refusal is shown as one');
  const last = texts[texts.length - 1];
  assert.match(last.text, /w done/); assert.match(last.text, /c done/);
  assert.equal(last.total, 3); assert.equal(last.done, 3);
  assert.ok(last.costUsd > 0 && /\$0\.01/.test(last.text), 'the worker\'s cost is in the line');
  assert.ok(texts.some((p) => p.done < 3), 'and it was not only the final line');
  /* no progress callback (a host without a trace): runs the same */
  const r = await entry.run({ tasks: [{ id: 'w', goal: 'g' }] }, undefined, K);
  assert.equal(r.ok, true);
});

test('⑦ integrated: slim (no findings/gaps repeated), duplicates and differing figures named, sources deduplicated, the unreturned said with their state', async () => {
  const claim = (c, place, src) => ({ claim: c, place, source: src });
  const envs = {
    a: { data: { summary: 'A', findings: [claim('Port Hedland shipped 540 Mt in 2023', 'Port Hedland', 'https://x.example/p?utm_source=a'), claim('Dampier shipped 170 Mt', 'Dampier', 'https://y.example/d')], gaps: ['no 2024 data'] }, meta: { costUsd: 0.02 }, citations: [{ url: 'https://x.example/p', title: 'X' }] },
    b: { data: { summary: 'B', findings: [claim('Port Hedland shipped 540 Mt in 2023', 'Port Hedland', 'https://www.x.example/p/'), claim('Dampier shipped 120 Mt', 'Dampier', 'https://z.example/d')] }, meta: { costUsd: 0.03 } },
  };
  const net = new Error('net'); net.code = 'network'; net.status = 0;
  const K = makeK({ askAIJSONEnvelope: async (p, s, i, o) => { const id = o.turnId.split('~')[1]; if (id === 'c') throw net; return envs[id]; } });
  const r = await entry.run({ tasks: [{ id: 'a', goal: 'ga' }, { id: 'b', goal: 'gb' }, { id: 'c', goal: 'gc' }] }, {}, K);
  const I = r.meta.integrated;
  assert.ok(I, 'meta.integrated is present');
  for (const k of ['findings']) assert.ok(!(k in I), k + ' is carried by delegated, not repeated here');
  assert.ok(I.gaps.every((g) => g.task && g.gap), 'gaps are named by task');
  assert.deepEqual(I.duplicateFindings.map((d) => d.tasks.sort()), [['a', 'b']]);
  assert.match(I.duplicateFindings[0].claim, /Port Hedland/);
  const differ = I.placeOverlaps.filter((p) => p.numbersDiffer).map((p) => p.place);
  assert.deepEqual(differ, ['Dampier'], 'the place where the workers\' figures disagree');
  assert.ok(I.placeOverlaps.every((p) => !('claims' in p)), 'overlaps do not repeat the claims');
  assert.equal(I.sources.filter((s) => /x\.example/.test(s.url)).length, 1, 'one page cited three ways is one source');
  assert.deepEqual(I.sources.find((s) => /x\.example/.test(s.url)).citedBy.sort(), ['a', 'b']);
  assert.deepEqual(I.unreturned, [{ task: 'c', state: 'unobservable', code: 'network', summary: I.unreturned[0].summary }], 'unobservable is not failed');
  assert.equal(I.coverage.tasks, 3); assert.equal(I.coverage.usable, 2);
  assert.ok(Math.abs(I.cost.usd - 0.05) < 1e-9);
  /* the card says what a reader should look at */
  assert.match(r.html, /1 finding\(s\) were found by more than one worker/);
  assert.match(r.html, /Figures differ between workers at: Dampier/);
  assert.match(r.html, /Did not return: c \(no answer came back, network\)/);
  /* every field the per-task entry always had is still there */
  for (const k of ['id', 'state', 'code', 'detail', 'summary', 'findings', 'gaps', 'sources', 'costUsd', 'calls', 'ms']) assert.ok(k in r.meta.delegated[0], k);
});

test('⑧ what Atlas is given back: toolsurface carries meta.integrated and the capability tasks\' data, like delegated', async () => {
  const CAPS = makeAtlasCapabilities({});
  const AGENT = makeAtlasAgent();
  const delegated = [{ id: 'c', state: 'done', summary: 'x', data: { tempC: 21 }, costUsd: 0, calls: 0 }];
  const integrated = { coverage: { tasks: 1, usable: 1 }, duplicateFindings: [{ claim: 'k', tasks: ['a', 'b'] }], sources: [], unreturned: [] };
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: makeAtlasSchemas(),
    runAction: async () => ({ ok: true, html: '<div class="atl-deleg">x</div>', meta: { delegated, delegatedCostUsd: 0, integrated } }) });
  const tools = surface.baseTools();
  const out = await surface.makeExecute(tools, AGENT)({ name: 'run_capability', arguments: { id: 'research.delegate', args: { tasks: [{ kind: 'capability', capability: 'weather.now', args: {} }] } } });
  assert.deepEqual(out.integrated, integrated, 'what the results say together reaches the model');
  assert.deepEqual(out.delegated[0].data, { tempC: 21 }, 'a capability task\'s data reaches the model');
  /* and a result that did not delegate carries neither */
  const plain = makeAtlasToolSurface({ capabilities: CAPS, schemas: makeAtlasSchemas(), runAction: async () => ({ ok: true, html: '<p>hi</p>', meta: {} }) });
  const o2 = await plain.makeExecute(plain.baseTools(), AGENT)({ name: 'run_capability', arguments: { id: 'research.delegate', args: { tasks: [{ goal: 'g' }] } } });
  assert.equal(o2.integrated, undefined);
});

/* ── the host lanes, evaluated from the console's own text against the real registry and the real kernel ── */
const CONSOLE = readFileSync(new URL('../js/atlas-console.js', import.meta.url), 'utf8');
function lane(name) {
  const i = CONSOLE.indexOf('const ' + name + ' = ');
  assert.ok(i > 0, name + ' is defined in the console');
  const j = CONSOLE.indexOf('\n    const ', i + 10) > 0 ? Math.min(...['\n    const ', '\n    /*', '\n    function '].map((m) => { const k = CONSOLE.indexOf(m, i + 10); return k < 0 ? Infinity : k; })) : CONSOLE.length;
  return CONSOLE.slice(i, j);
}
const laneSrc = lane('classifyCapability') + '\n' + lane('runReadCapability');

test('⑨ classifyCapability is read off the registry: `read` exactly when its facets say it changes nothing, asks nobody, shows nothing, saves nothing and starts no model work', () => {
  const CAPS = makeAtlasCapabilities({});
  const { classifyCapability } = new Function('CAPS', 'EXEC', '_curTurn', laneSrc + '\nreturn { classifyCapability };')(CAPS, null, 0);
  const all = CAPS.all();
  const expect = (c) => (((c.facets.changesSeen === false && !c.facets.showsUI) || c.facets.headless === true) && !c.facets.asksUser && !c.facets.savesFile && !c.facets.delegates && c.confirmation === 'none') ? 'read' : 'other';   /* (worker-reach) the rule as the lane states it */
  all.forEach((c) => assert.equal(classifyCapability(c.id), expect(c), c.id));
  assert.ok(all.filter((c) => classifyCapability(c.id) === 'read').length >= 5, 'a real set of read capabilities exists to fan out');
  assert.ok(all.some((c) => c.effects.writes.length && classifyCapability(c.id) === 'other'), 'writers are other');
  assert.equal(classifyCapability('research.delegate'), 'other', 'no recursion');
  assert.equal(classifyCapability('no.such.capability'), 'unknown');
  assert.equal(classifyCapability(''), 'unknown');
});

test('⑩ runReadCapability goes through the kernel (source atlas-worker, the turn, the signal) and returns the kernel\'s own verdict', async () => {
  const seen = [];
  const exec = { execute: async (id, args, o) => { seen.push({ id, args, o }); return id === 'a' ? { status: 'completed', html: '<p>fine</p>', meta: { n: 1 }, code: '' } : { status: 'failed', code: 'bad_args', html: '' }; } };
  const { runReadCapability } = new Function('CAPS', 'EXEC', '_curTurn', laneSrc + '\nreturn { runReadCapability };')(null, exec, 42);
  const ctl = new AbortController();
  const ok = await runReadCapability('a', { q: 1 }, { signal: ctl.signal });
  assert.deepEqual({ ok: ok.ok, html: ok.html, meta: ok.meta, status: ok.status }, { ok: true, html: '<p>fine</p>', meta: { n: 1 }, status: 'completed' });
  assert.equal(seen[0].o.source, 'atlas-worker'); assert.equal(seen[0].o.turnId, 42); assert.equal(seen[0].o.signal, ctl.signal);
  const bad = await runReadCapability('b', {});
  assert.equal(bad.ok, false); assert.equal(bad.code, 'bad_args'); assert.equal(bad.status, 'failed');
  /* the K object exposes both, next to turnSignal */
  assert.match(CONSOLE, /get runReadCapability\(\)\{ return runReadCapability; \}, get classifyCapability\(\)\{ return classifyCapability; \}/);
});

test('⑪ the progress reaches the row: the executor hands a capability progress(p), the trace writes p.text onto that operation\'s row', () => {
  const caps = readFileSync(new URL('../js/atlas-capabilities.js', import.meta.url), 'utf8');
  assert.match(caps, /progress: \(opts && typeof opts\.progress === 'function'\) \? opts\.progress : undefined/);
  const prog = readFileSync(new URL('../js/atlas-progress.js', import.meta.url), 'utf8');
  assert.match(prog, /ev\.phase === 'progress' && ev\.progress && typeof ev\.progress\.text === 'string'/);
});

/* ── the list is read whole, a step is handed what the step before it made, and a claim can be checked by a second worker ── */
test('㉑ research.delegate: forward names, an @ref between capability tasks, and the doc says how', async () => {
  const doc = entry.doc.map((d) => d.text).join('\n');
  assert.match(doc, /any order/);
  assert.match(doc, /@<task id>:data\./);
  assert.match(doc, /input_cycle/);
  assert.match(doc, /"verify":true/);
  const made = [];
  const K = makeK({
    classifyCapability: () => 'read',
    runReadCapability: async (id, args) => { made.push(args); return args.inputs ? { ok: true, html: 'used', meta: { used: args.inputs } } : { ok: true, html: 'made', meta: { gis: { dataset: 'ds-9' } } }; },
  });
  const res = await entry.run({ tasks: [
    { id: 'use', kind: 'capability', capability: 'data.gis', args: { op: 'buffer', inputs: ['@acq:data.gis.dataset'] }, inputs: [{ from: 'acq' }] },
    { id: 'acq', kind: 'capability', capability: 'data.gis', args: { acquire: {} } },
  ] }, {}, K);
  assert.equal(res.ok, true);
  assert.deepEqual(made[1], { op: 'buffer', inputs: ['ds-9'] });
  assert.deepEqual(res.meta.delegated.find((d) => d.id === 'use').data, { used: ['ds-9'] });
});

test('㉒ research.delegate verify:true — a second worker checks the first one’s claims and the verdicts reach Atlas; a claim it did not repeat stays unchecked', async () => {
  const prompts = [];
  const K = makeK({
    askAIJSONEnvelope: async (prompt) => {
      prompts.push(prompt);
      if (/Independently check/.test(prompt)) return { data: { summary: 'checked', findings: [{ claim: 'The strait is 33 km wide at its narrowest', verdict: 'supported', source: 'https://ex.org/a' }], gaps: [] }, meta: { costUsd: 0.02 } };
      return { data: { summary: 'found', findings: [{ claim: 'The strait is 33 km wide at its narrowest' }, { claim: 'It carries a fifth of the world’s oil' }], gaps: [] }, meta: { costUsd: 0.03 } };
    },
  });
  const res = await entry.run({ tasks: [{ id: 'a', goal: 'research the strait', verify: true }, { id: 'b', goal: 'research another' }] }, {}, K);
  const v = res.meta.integrated.verification;
  assert.deepEqual(v.counts, { supported: 1, unsupported: 0, contradicted: 0, unchecked: 1 });
  assert.equal(v.verifiers[0].of, 'a');
  assert.ok(Math.abs(v.costUsd - 0.02) < 1e-9);
  assert.equal(prompts.filter((p) => /Independently check/.test(p)).length, 1, 'only the task that asked was checked');
  assert.match(res.html, /Checked by a second worker: 1 supported/);
  assert.equal(res.meta.delegated.length, 2, 'the checker is not one of the tasks Atlas listed');
});

test('㉓ a checker the server refuses leaves every claim unchecked and says why', async () => {
  const K = makeK({
    askAIJSONEnvelope: async (prompt) => {
      if (/Independently check/.test(prompt)) throw Object.assign(new Error('full'), { code: 'delegation_children' });
      return { data: { summary: 'found', findings: [{ claim: 'a claim' }], gaps: [] }, meta: { costUsd: 0.01 } };
    },
  });
  const res = await entry.run({ tasks: [{ id: 'a', goal: 'g', verify: true }] }, {}, K);
  const v = res.meta.integrated.verification;
  assert.deepEqual(v.counts, { supported: 0, unsupported: 0, contradicted: 0, unchecked: 1 });
  assert.equal(v.verifiers[0].state, 'refused');
  assert.equal(v.verifiers[0].code, 'delegation_children');
});
