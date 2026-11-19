/* ============================================================================
 *  delegate-child-loop — a delegated worker that FINDS the capabilities it may call, and a delegation that
 *  survives the page being closed
 *  js/atlas-delegate.js (makeWorkerExecutor's search grant · makeDelegationStore · delegationKey · pageDelegationStore) ·
 *  js/atlas-console.js (findCapabilities / classifyCapability / describeCapability — the host lane, EVALUATED from the page's
 *  own source) · js/atlas-cap-research.js research.delegate (resume, fresh, the card)
 *
 *  #1250 gave a worker the read capabilities its parent names (`tools`) and the {"call":{…}} protocol to call them. Two
 *  things it left undone are measured here:
 *    ① a worker granted `find_capability` searches the registry itself; read-only matches join its grant, others come
 *       back with the reason; a capability that changes something, or research.delegate itself, never runs
 *    ② a contract without the grant is what it was
 *    ③ resume: what a closed page had finished is answered from the store — not run, not paid for — and the rest runs
 *    ④ the store answers exactly as long as ai-proxy keeps a turn, and survives IndexedDB refusing
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { makeWorkerExecutor, makeDelegationStore, delegationKey, useDelegationStore, pageDelegationStore } = await import('../js/atlas-delegate.js');
const { memoryBackend } = await import('../js/atlas-notebook-store.js');
const { TURN_TTL_S } = await import('../supabase/functions/ai-proxy/config.ts');
const caps = (await import('../js/atlas-cap-research.js')).default;
const entry = caps.find((c) => c.row[0] === 'research.delegate');

/* THE HOST LANE AS THE PAGE BUILDS IT: the three functions are lifted out of js/atlas-console.js and evaluated over the real
   registry and the real tool surface — so the search, the read-only rule and the schemas are the page's, not this file's */
const CONSOLE = readFileSync(new URL('../js/atlas-console.js', import.meta.url), 'utf8');
function lift(name) {
  const i = CONSOLE.indexOf('const ' + name + ' = ');
  assert.ok(i > 0, name + ' is defined in the console');
  const j = Math.min(...['\n    const ', '\n    /*', '\n    function '].map((m) => { const k = CONSOLE.indexOf(m, i + 10); return k < 0 ? Infinity : k; }));
  return CONSOLE.slice(i, j);
}
const CAPS = makeAtlasCapabilities({});
const TOOLS = makeAtlasToolSurface({ capabilities: CAPS, schemas: makeAtlasSchemas(), runAction: () => { throw new Error('a worker reached the page dispatch'); } });
const HOST = new Function('CAPS', 'TOOLS', ['classifyCapability', 'describeCapability', 'findCapabilities'].map(lift).join('\n')
  + '\nreturn { classifyCapability, describeCapability, findCapabilities };')(CAPS, TOOLS);
const READ = 'data.value', WRITE = 'map.drawLine';
const lane = (log) => ({ classify: HOST.classifyCapability, describe: HOST.describeCapability, find: HOST.findCapabilities,
  run: async (id, args) => { log.push([id, args]); return { ok: true, text: 'Japan population 124,500,000 (2024)', meta: { value: 124500000 } }; } });

const ctx = () => { const ev = []; return { ev, signal: undefined, emit: (kind, data) => { const e = { id: 'e' + ev.length, kind, data }; ev.push(e); return e; } }; };
const FINAL = { summary: 'Japan has about 124.5 million people.', findings: [{ claim: 'Japan population 124.5 million' }] };
const env = (data) => ({ data, meta: { costUsd: 0.01 }, citations: [] });
function scripted(answers, seen) { let i = 0; return async (prompt, sys, img, opts) => { seen.push(prompt); if (opts) seen.opts = (seen.opts || []).concat([opts]); return env(answers[Math.min(i++, answers.length - 1)]); }; }

test('the host lane is the page\'s: the registry search finds a read capability, and the rule says which matches may run', async () => {
  assert.ok((await HOST.findCapabilities(READ)).includes(READ));
  assert.ok((await HOST.findCapabilities(WRITE)).includes(WRITE));
  assert.equal(HOST.classifyCapability(READ), 'read');
  assert.equal(HOST.classifyCapability(WRITE), 'other');
  assert.match(HOST.describeCapability(READ), /"properties":{"country"/, 'a granted capability is described by its real schema (js/atlas-schemas.js), not an empty string');
  assert.equal(CAPS.resolve('research.delegate').risk, 'read-only', 'its row alone would admit it…');
  assert.equal(HOST.classifyCapability('research.delegate'), 'other', '…and the rule does not: no recursion');
});

test('① a worker granted find_capability searches, is granted what is read-only, calls it, and answers', async () => {
  const seen = [], log = [];
  const ex = makeWorkerExecutor({ ask: scripted([
    { call: { capability: 'find_capability', args: { query: READ } } },
    { call: { capability: READ, args: { country: 'Japan', metric: 'population' } } },
    FINAL], seen), parentTurn: 'p', maxCalls: 8, capability: lane(log) });
  const c = ctx();
  const r = await ex.run({ id: 't', goal: 'Population of Japan', tools: ['find_capability'] }, c);
  assert.equal(r.state, 'done'); assert.equal(r.calls, 3);
  assert.match(seen[0], /CAPABILITIES YOU MAY CALL[^\n]*\(none yet\)/, 'nothing is granted before it searches');
  assert.match(seen[0], /"capability":"find_capability","args":\{"query"/, 'it is told how to search');
  assert.match(seen[1], new RegExp(READ.replace('.', '\\.') + ' — you may call it now'), 'the search result reached the next request');
  assert.match(seen[1], new RegExp('CAPABILITIES YOU MAY CALL[^\\n]*' + READ.replace('.', '\\.')), '…and the match is in the grant');
  assert.match(seen[1], new RegExp(READ.replace('.', '\\.') + ' arguments: \\{'), '…with its schema from the registry');
  assert.deepEqual(log, [[READ, { country: 'Japan', metric: 'population' }]]);
  assert.ok(c.ev.some((e) => e.kind === 'effect.done' && e.data.capability === 'find_capability' && e.data.costUsd === 0), 'the search is on the record, at no cost');
});

test('① what the search finds that is not read-only is named with the reason and never runs — called directly, it is refused with the reason too', async () => {
  const seen = [], log = [];
  const ex = makeWorkerExecutor({ ask: scripted([
    { call: { capability: 'find_capability', args: { query: WRITE } } },
    { call: { capability: WRITE, args: { points: [[0, 0], [1, 1]] } } },
    { call: { capability: 'research.delegate', args: { tasks: [{ goal: 'again' }] } } },
    FINAL], seen), parentTurn: 'p', maxCalls: 8, capability: lane(log) });
  const r = await ex.run({ id: 't', goal: 'Draw the route', tools: ['find_capability'] }, ctx());
  assert.equal(r.state, 'done');
  assert.equal(log.length, 0, 'nothing that changes the map ran, and no delegation was opened from inside the worker');
  assert.match(seen[1], new RegExp(WRITE.replace('.', '\\.') + ' — you may NOT call it: it is not read-only \\(capability_not_read_only\\)'));
  assert.doesNotMatch(seen[1], new RegExp('CAPABILITIES YOU MAY CALL[^\\n]*' + WRITE.replace('.', '\\.')), 'it did not join the grant');
  assert.match(seen[2], /FAILED: not in your grant[^\n]*capability_not_read_only/, 'the direct call is refused, with the reason');
  assert.match(seen[3], /research\.delegate[^\n]*FAILED: not in your grant[^\n]*capability_not_read_only/, 'and so is the recursion');
});

test('① a search on the last request is not run, and an empty query is answered, not run', async () => {
  const seen = [];
  let searched = 0;
  const L = Object.assign(lane([]), { find: async (q) => { searched++; return HOST.findCapabilities(q); } });
  const ex = makeWorkerExecutor({ ask: scripted([{ call: { capability: 'find_capability', args: {} } }, { call: { capability: 'find_capability', args: { query: READ } } }], seen), parentTurn: 'p', maxCalls: 2, capability: L });
  const r = await ex.run({ id: 't', goal: 'g', tools: ['find_capability'] }, ctx());
  assert.equal(seen.length, 2); assert.equal(searched, 0, 'no search ran: the first had no words, the second came on the last request');
  assert.match(seen[1], /give the words to search for in args\.query/);
  assert.match(seen[1], /THIS IS YOUR LAST REQUEST/);
  assert.notEqual(r.state, 'done');
});

test('② without the grant, or without a search in the lane, the worker is what #1250 left it', async () => {
  const seen = [];
  await makeWorkerExecutor({ ask: scripted([FINAL], seen), parentTurn: 'p', capability: lane([]) }).run({ id: 't', goal: 'g', tools: [READ] }, ctx());
  assert.match(seen[0], /CAPABILITIES YOU MAY CALL/); assert.doesNotMatch(seen[0], /find_capability/, 'a plain grant is not a search grant');
  const noFind = Object.assign(lane([]), { find: undefined });
  await makeWorkerExecutor({ ask: scripted([FINAL], seen), parentTurn: 'p', capability: noFind }).run({ id: 't', goal: 'g', tools: ['find_capability'] }, ctx());
  assert.doesNotMatch(seen[1], /CAPABILITIES YOU MAY CALL/, 'a lane with no search grants nothing to search with');
  await makeWorkerExecutor({ ask: scripted([FINAL], seen), parentTurn: 'p', capability: lane([]) }).run({ id: 't', goal: 'g' }, ctx());
  assert.doesNotMatch(seen[2], /CAPABILITIES YOU MAY CALL/, 'no tools: research only');
});

/* the K research.delegate reads, as far as it reads it */
function makeK(over) {
  return Object.assign({
    R: (ok, html, extra) => Object.assign({ ok, html }, extra || null), L: (en) => en, esc: (x) => String(x), warn: (x) => x,
    _curTurnKey: 'root-1', turnSignal: () => undefined,
    _delegationPolicy: { mode: 'independent', maxChildren: 2, childMaxCalls: 8 },
    runReadCapability: lane([]).run, classifyCapability: HOST.classifyCapability, describeCapability: HOST.describeCapability, findCapabilities: HOST.findCapabilities,
  }, over || null);
}

test('③ resume: a closed page\'s finished task is answered from the store — not run, not paid for — and the rest runs', async () => {
  assert.equal(pageDelegationStore(), null, 'node has no IndexedDB: nothing is kept unless a store is handed in');
  const store = useDelegationStore(makeDelegationStore(memoryBackend()));
  try {
    const tasks = [{ id: 'pop', goal: 'Population of Japan', tools: ['find_capability'] }, { id: 'web', goal: 'What changed in Japanese census policy?' }];
    /* FIRST RUN: `pop` finishes; the reader closes the page while `web` is still out */
    const ctl = new AbortController();
    let popDone; const popFinished = new Promise((r) => { popDone = r; });
    let first1 = { pop: 0, web: 0 };
    const ask1 = async (prompt, sys, img, opts) => {
      if (/Population of Japan/.test(prompt)) { first1.pop++; setTimeout(popDone, 0); return env(FINAL); }
      first1.web++;
      await popFinished;
      setTimeout(() => ctl.abort(), 10);
      return new Promise((_, rej) => { opts.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }, { once: true }); });
    };
    const first = await entry.run({ tasks }, {}, makeK({ askAIJSONEnvelope: ask1, turnSignal: () => ctl.signal }));
    const by1 = Object.fromEntries(first.meta.delegated.map((d) => [d.id, d]));
    assert.equal(by1.pop.state, 'done'); assert.equal(by1.web.state, 'cancelled');
    assert.equal(first.meta.resume.saved, true, 'the record was written as each task ended');

    /* SECOND RUN: a new page — new executor, new delegation, new turn key — and the same list */
    const asked = { pop: 0, web: 0 };
    const ask2 = async (prompt) => {
      if (/Population of Japan/.test(prompt)) { asked.pop++; return env({ summary: 'should not run' }); }
      asked.web++; return env({ summary: 'The 2025 census moved online.', findings: [{ claim: 'census moved online in 2025' }] });
    };
    const second = await entry.run({ tasks }, {}, makeK({ _curTurnKey: 'root-2', askAIJSONEnvelope: ask2 }));
    const by2 = Object.fromEntries(second.meta.delegated.map((d) => [d.id, d]));
    assert.equal(asked.pop, 0, 'the finished task made no model call');
    assert.equal(by2.pop.resumed, true); assert.equal(by2.pop.state, 'done'); assert.match(by2.pop.summary, /124\.5 million/);
    assert.equal(by2.pop.costUsd, 0, 'what it cost was paid the first time');
    assert.equal(asked.web, 1, 'the task the closed page had not finished runs');
    assert.equal(by2.web.state, 'done'); assert.ok(!by2.web.resumed);
    assert.equal(second.meta.resume.resumed, 1);
    assert.match(second.html, /from the earlier run, not run again/, 'the reader sees which task was not run again');

    /* fresh:true runs everything again */
    const asked3 = { pop: 0 };
    await entry.run({ tasks, fresh: true }, {}, makeK({ askAIJSONEnvelope: async (p) => { if (/Population of Japan/.test(p)) asked3.pop++; return env(FINAL); } }));
    assert.equal(asked3.pop, 1, 'fresh:true is a new run');
    /* the list's identity: whole, with the tools grant (contractKey) and the verify flag */
    assert.equal(delegationKey(tasks), delegationKey(JSON.parse(JSON.stringify(tasks))));
    assert.notEqual(delegationKey(tasks), delegationKey([tasks[0]]), 'a list is identified whole');
    assert.notEqual(delegationKey(tasks), delegationKey([Object.assign({}, tasks[0], { tools: [READ] }), tasks[1]]), 'a different grant is different work');
    assert.notEqual(delegationKey(tasks), delegationKey([tasks[0], Object.assign({}, tasks[1], { verify: true })]), '…and so is a different request to check it');
  } finally { useDelegationStore(null); }
});

test('④ the store answers exactly as long as ai-proxy keeps a turn, and survives IndexedDB refusing', async () => {
  let t = 1_000_000;
  const store = makeDelegationStore(memoryBackend(), { now: () => t });
  assert.ok(await store.save('k', { v: 1, results: [] }));
  t += TURN_TTL_S * 1000 - 1;
  assert.ok(await store.get('k'), 'inside TURN_TTL_S it answers');
  t += 1;
  assert.equal(await store.get('k'), null, 'at TURN_TTL_S it is gone — the server would not replay that turn either');
  const refusing = { all: async () => { throw new Error('indexeddb-open-failed'); }, put: async () => { throw new Error('indexeddb-open-failed'); }, del: async () => {}, clear: async () => {} };
  const s2 = makeDelegationStore(refusing, { fallback: memoryBackend() });
  assert.equal(await s2.save('k', { v: 1, results: [] }), true, 'a refused write lands in the fallback');
  assert.equal(s2.state(), 'fallback');
  assert.ok(await s2.get('k'));
  const none = makeDelegationStore(refusing);
  assert.equal(await none.save('k', { results: [] }), false, 'with nowhere to write it says so, and throws nothing');
  assert.equal(await none.get('k'), null);
});
