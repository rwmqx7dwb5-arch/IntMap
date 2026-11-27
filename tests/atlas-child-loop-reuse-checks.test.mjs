/* ============================================================================
 *  atlas-child-loop-reuse — the defects an external audit (2026-11-27, main@638897c) reproduced in Atlas's child workers and parent loop
 * ----------------------------------------------------------------------------
 *  Each test is the audit's own pass condition, run against the implementation itself (model replies and outside data are fixed):
 *    ① a refusal for want of a grant is not reused once the grant holds the capability; a failure of the moment is retried
 *    ② a worker reads the rest of a material it holds whole, whatever else it was granted
 *    ③ a step's state counts pieces of work (capability + arguments), not capabilities
 *    ④ a number the working memory indexed is read by its path after the body was dropped
 *    ⑤ the composed input stays within the proxy's characters AND items, call and answer together, from one set of numbers
 *    ⑥ a checker started under an answer that returned early is paid into the same turn's ledger
 *    ⑦ the turn records the instants a change to waiting is judged by
 *    ⑧ a search that named nothing lists every match in one line and spells out only what fits what the model holds and wants
 *  Nothing here is about one question or one capability: the capability ids are whatever the real registry holds.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeWorkerExecutor } = await import('../js/atlas-delegate.js');
const { priorStands, failureWhy } = await import('../js/atlas-job-core.js');
const { makeAtlasPlan } = await import('../js/atlas-plan.js');
const { makeAtlasWorkingMemory } = await import('../js/atlas-working-memory.js');
const AGENT = (await import('../js/atlas-agent.js')).makeAtlasAgent();
const SERVER = await import('../supabase/functions/ai-proxy/turn.ts');
const { INPUT_LIMITS } = await import('../supabase/functions/_shared/atlas-input-limits.js');
const { makeRunLedger, lateCostSink, runMarkSink } = await import('../js/atlas-run-ledger.js');

const READ = 'data.value';
const ctx = () => { const ev = []; return { ev, signal: undefined, emit: (kind, data) => { const e = { id: 'e' + ev.length, kind, data }; ev.push(e); return e; } }; };
const env = (data) => ({ data, meta: { costUsd: 0.01 }, citations: [] });
function scripted(answers, seen) { let i = 0; return async (prompt) => { seen.push(prompt); return env(answers[Math.min(i++, answers.length - 1)]); }; }
const FINAL = { summary: 'done', findings: [{ claim: 'c', source: 'data.value', excerpt: '124500000' }] };

/* ── ① ───────────────────────────────────────────────────────────────────────────────────── */
test('① search and use in ONE request, the same call again in the next: the read runs exactly once, and a third time is answered from it', async () => {
  const seen = [], fetched = [];
  const lane = { classify: (id) => (id === READ ? 'read' : 'unknown'), describe: () => '{"country":"string"}', find: async () => [READ],
    run: async (id, args) => { fetched.push([id, args]); return { ok: true, text: 'Japan 124,500,000' }; } };
  const call = { capability: READ, args: { country: 'Japan', metric: 'population' } };
  const ex = makeWorkerExecutor({ ask: scripted([
    { calls: [{ capability: 'find_capability', args: { query: 'country value' } }, call] },
    { calls: [call] },
    { calls: [call] },
    FINAL], seen), parentTurn: 'p', maxCalls: 8, capability: lane });
  const r = await ex.run({ id: 't', goal: 'population of Japan', tools: ['find_capability'] }, ctx());
  assert.equal(r.state, 'done');
  assert.equal(fetched.length, 1, 'the real fetch ran exactly once (it ran ' + fetched.length + ' times)');
  assert.match(seen[1], /a search in this same request may grant it: if it does, call it in your next one/, 'the first request was told why it was refused');
  assert.match(seen[2], /Japan 124,500,000/, 'the second request ran the read and its answer reached the model');
  assert.match(seen[3], /ALREADY ANSWERED[^\n]*Japan 124,500,000/, 'a third identical call is answered from the success');
});

test('① the reason decides: a success and the capability\'s own answer hold, a refusal holds only while the grant lacks it, a failure of the moment does not', () => {
  assert.equal(priorStands({ ok: true }, false), true);
  assert.equal(priorStands({ ok: false, why: 'grant' }, false), true, 'still not granted: the refusal is the answer');
  assert.equal(priorStands({ ok: false, why: 'grant' }, true), false, 'granted since: run it');
  assert.equal(priorStands({ ok: false, why: 'transient' }, true), false, 'a failure of the moment is retried');
  assert.equal(priorStands({ ok: false, why: '' }, true), true, 'the capability\'s own answer (no data, a bad argument) holds');
  assert.equal(failureWhy({ ok: false, meta: { category: 'transient' } }), 'transient');
  assert.equal(failureWhy({ ok: false, meta: { category: 'input', retryable: true } }), '', 'an input failure is retried with OTHER arguments: a different call');
  assert.equal(failureWhy({ ok: true, meta: { category: 'transient' } }), '');
});

test('① a read that threw is made again on request; the same failure twice is not progress', async () => {
  const seen = []; let n = 0;
  const lane = { classify: () => 'read', describe: () => '', run: async () => { n++; if (n === 1) throw new Error('upstream 503'); return { ok: true, text: 'value 7' }; } };
  const call = { capability: READ, args: { country: 'Japan' } };
  const ex = makeWorkerExecutor({ ask: scripted([{ calls: [call] }, { calls: [call] }, FINAL], seen), parentTurn: 'p', maxCalls: 8, capability: lane });
  const r = await ex.run({ id: 't', goal: 'g', tools: [READ] }, ctx());
  assert.equal(r.state, 'done');
  assert.equal(n, 2, 'the retry after an observed failure ran');
  assert.match(seen[2], /value 7/);
});

test('① the server\'s worker loop asks the same rule (one rule, two loops)', () => {
  const src = readFileSync(new URL('../supabase/functions/_shared/atlas-job-runner.js', import.meta.url), 'utf8');
  assert.match(src, /priorStands\(prior,/, 'the server reuses an answer only while its reason holds');
  assert.match(src, /why = !failed \? "" : \(out && out\.code === "twin_threw"\) \? "transient"/, 'a twin that threw is recorded as a failure of the moment');
});

/* ── ② ───────────────────────────────────────────────────────────────────────────────────── */
test('② a worker with no capability reads the end of a long material it was handed — by the ref and the read the prompt names', async () => {
  const seen = [];
  const tail = 'THE-END-OF-THE-MATERIAL';
  const findings = []; for (let i = 0; i < 120; i++) findings.push({ claim: 'finding ' + i + ' ' + 'x'.repeat(100) });
  findings.push({ claim: tail });
  const input = { from: 'a', summary: 's', findings, gaps: [], data: null };
  const whole = JSON.stringify({ summary: input.summary, findings: input.findings, gaps: input.gaps, data: input.data });
  assert.ok(whole.length > 13000, 'the material is long (' + whole.length + ')');
  const at = whole.indexOf(tail);
  const ex = makeWorkerExecutor({ ask: scripted([{ calls: [{ capability: 'read_step', args: { ref: 'input:a', offset: at - 50, length: 200 } }] }, FINAL], seen), parentTurn: 'p', maxCalls: 4 });
  const r = await ex.run({ id: 't', goal: 'read what a found', inputs: [input] }, ctx());
  assert.equal(r.state, 'done');
  assert.doesNotMatch(seen[0], /the rest was NOT given to you/, 'the page worker holds it whole and is not told otherwise');
  assert.match(seen[0], /"capability":"read_step","args":\{"ref":"input:a"/, 'it is told the ref and how to read');
  assert.match(seen[1], new RegExp(tail), 'the end of the material reached the model');
});

test('② a server worker that holds only what it was shown is told the range it was given', async () => {
  const core = await import('../js/atlas-job-core.js');
  const findings = []; for (let i = 0; i < 140; i++) findings.push({ claim: 'f' + i + ' ' + 'y'.repeat(100) });
  const v = core.inputView({ from: 'a', summary: 's', findings, gaps: [] }, { read: false });
  assert.match(v.text, /only characters 0-\d+ of \d+ are shown; the rest was NOT given to you/);
});

/* ── ③ ───────────────────────────────────────────────────────────────────────────────────── */
function stepOf(results) {
  const P = makeAtlasPlan({ geoProbe: {} });
  P.beginTurn();
  P.declare({ goal: 'g', steps: ['five countries'], current: 1 });
  results.forEach(([country, ok], i) => {
    const key = 'call:capability:' + READ + ':country=' + JSON.stringify(country);
    P.started('c' + i, { step: 0, capability: READ, key, work: JSON.stringify({ country }) });
    P.settled('c' + i, { capability: READ, ok, status: ok ? 'completed' : 'failed', code: ok ? '' : 'no_data' });
  });
  P.endTurn('answered');
  return { state: P.snapshot().steps[0].state, model: P.forModel().steps[0].operations.join(' | ') };
}
test('③ five countries, four failed and one succeeded (in either order), is not 「completed」 — and the model is told which four', () => {
  const C = ['JPN', 'DEU', 'FRA', 'ITA', 'GBR'];
  const a = stepOf(C.map((c, i) => [c, i === 4]));
  assert.equal(a.state, 'partial');
  assert.match(a.model, /data\.value: 1 of 5 completed; not completed: \{"country":"JPN"\} failed/);
  ['DEU', 'FRA', 'ITA'].forEach((c) => assert.match(a.model, new RegExp(c)));
  const b = stepOf(C.map((c, i) => [c, i !== 4]));
  assert.equal(b.state, 'partial', 'four done and one failed is partly done, not failed');
  assert.match(b.model, /4 of 5 completed; not completed: \{"country":"GBR"\} failed/);
});
test('③ a retry of the SAME piece replaces its failure; another piece\'s success does not', () => {
  const a = stepOf([['JPN', false], ['DEU', false], ['JPN', true]]);
  assert.equal(a.state, 'partial', 'Germany is still not done');
  assert.match(a.model, /1 of 2 completed; not completed: \{"country":"DEU"\}/);
  const b = stepOf([['JPN', false], ['JPN', true]]);
  assert.equal(b.state, 'completed', 'the retry of Japan stands for Japan');
});
test('③ the loop hands the plan the call\'s identity', () => {
  const src = readFileSync(new URL('../js/atlas-agent.js', import.meta.url), 'utf8');
  assert.equal((src.match(/PLAN\.started\(call\.id, \{ step: p\.planStep, capability: capOfCall\(p\.routed\), key: p\.ckey, work: p\.work \}/g) || []).length, 2);
});

/* ── ④ ───────────────────────────────────────────────────────────────────────────────────── */
test('④ after the body was dropped, a path the index holds is answered with its value', () => {
  const mem = makeAtlasWorkingMemory({ limits: { bodyChars: 6000 } });
  const figures = []; for (let i = 0; i < 12; i++) figures.push(1000 + i);
  const ref = mem.noteResult(1, 'a', 'data.series', {}, { ok: true, figures, note: 'z'.repeat(5000) });
  mem.noteResult(2, 'b', 'data.series', {}, { ok: true, note: 'w'.repeat(5000) });   /* the newer body pushes the older one out */
  const r0 = mem.recall(ref);
  assert.equal(r0.error, 'body_evicted', 'the premise: the body was dropped');
  const hit = mem.recall(ref, 'figures[11]');
  assert.equal(hit.ok, true, JSON.stringify(hit));
  assert.match(hit.text, /= 1011/);
  assert.equal(mem.recall(ref, 'figures.11').ok, true, 'the same address spelled with a dot');
  assert.equal(mem.recall(ref, 'figures[99]').error, 'body_evicted', 'an address the index does not hold still says the body is gone');
});

/* ── ⑤ ───────────────────────────────────────────────────────────────────────────────────── */
const FENCE = { wrap: (s) => '<<' + s + '>>' };
const countChars = (input) => input.reduce((a, it) => a + (it.type === 'message' ? it.content.length : it.type === 'function_call' ? it.arguments.length : it.type === 'function_call_output' ? it.output.length : 0), 0);
function paired(input) {
  const calls = new Set(input.filter((i) => i.type === 'function_call').map((i) => i.call_id));
  const outs = new Set(input.filter((i) => i.type === 'function_call_output').map((i) => i.call_id));
  return [...calls].every((c) => outs.has(c)) && [...outs].every((c) => calls.has(c));
}
test('⑤ the client\'s numbers and the server\'s are one object, and the server sits at twice the client', () => {
  assert.equal(SERVER.MAX_INPUT_CHARS, INPUT_LIMITS.SERVER.chars);
  assert.equal(SERVER.MAX_ITEM_CHARS, INPUT_LIMITS.SERVER.item);
  assert.equal(SERVER.MAX_INPUT_ITEMS, INPUT_LIMITS.SERVER.items);
  assert.deepEqual({ ...AGENT.INPUT_BUDGET }, { ...INPUT_LIMITS.CLIENT });
  assert.ok(INPUT_LIMITS.SERVER.chars >= 2 * INPUT_LIMITS.CLIENT.total && INPUT_LIMITS.SERVER.item >= 2 * INPUT_LIMITS.CLIENT.item && INPUT_LIMITS.SERVER.items >= 2 * INPUT_LIMITS.CLIENT.items);
});
for (const n of [8, 12]) test('⑤ one step that gathered ' + n + ' results of 45,000 characters is accepted by the server, every result readable on', () => {
  const tr = [{ role: 'user', content: 'q' }, { role: 'assistant', content: '', toolCalls: Array.from({ length: n }, (_, i) => ({ id: 'k' + i, name: 'run_capability', arguments: { id: READ } })) },
    { role: 'tool', content: Array.from({ length: n }, (_, i) => ({ id: 'k' + i, ok: true, text: String(i).repeat(45000) + 'END' + i })) }];
  const built = AGENT.composeInput({ history: [], request: '[REQUEST] q', transcript: tr, fence: FENCE });
  assert.ok(countChars(built.input) <= INPUT_LIMITS.CLIENT.total + 2000, 'within the client budget (' + countChars(built.input) + ')');
  assert.ok(paired(built.input));
  const srv = SERVER.normalizeTurn({ protocol: 2, input: built.input, tools: [] });
  assert.ok(srv && !srv.error, 'the server accepts it (' + (srv && srv.error) + ')');
  if (n === 12) {
    assert.equal(built.cut, true, 'what was cut is said, so read_result is offered');
    built.trim.squeezed.forEach((t) => assert.match(built.input.find((x) => x.call_id === t.call_id && x.type === 'function_call_output').output, /read_result/));
  }
});
test('⑤ 4 calls × 75 steps stays under the item count the server reads, call beside answer, the latest step whole', () => {
  const tr = [{ role: 'user', content: 'q' }];
  for (let s = 0; s < 75; s++) {
    tr.push({ role: 'assistant', content: '', toolCalls: [0, 1, 2, 3].map((j) => ({ id: 's' + s + 'c' + j, name: 'run_capability', arguments: { id: READ, n: s * 4 + j } })) });
    tr.push({ role: 'tool', content: [0, 1, 2, 3].map((j) => ({ id: 's' + s + 'c' + j, ok: true, text: 'r' + (s * 4 + j) })) });
  }
  const built = AGENT.composeInput({ history: [], request: '[REQUEST] q', transcript: tr, fence: FENCE, tail: '[STATE] now' });
  assert.ok(built.input.length <= INPUT_LIMITS.CLIENT.items, built.input.length + ' items');
  assert.ok(paired(built.input), 'no call is parted from its answer');
  assert.ok(built.trim.foldedSteps > 0 && built.cut === true);
  const text = built.input.filter((i) => i.type === 'message').map((i) => i.content).join('\n');
  assert.match(text, /step 1 call s0c0 run_capability/, 'a folded call is still in front of the model');
  assert.match(text, /step 1 result s0c0: <<.*r0/, '…beside its own answer');
  for (let j = 0; j < 4; j++) assert.ok(built.input.some((i) => i.type === 'function_call_output' && i.call_id === 's74c' + j), 'the latest step\'s answers are items');
  assert.equal(built.input[built.input.length - 2].content, '[STATE] now', 'the current state is there');
  const srv = SERVER.normalizeTurn({ protocol: 2, input: built.input, tools: [] });
  assert.ok(srv && !srv.error && srv.items.some((i) => i.type === 'function_call_output' && i.call_id === 's74c3'), 'the server keeps the end');
});
test('⑤ a server handed more items than it reads drops the oldest conversation and keeps the end — never the turn\'s last answers', () => {
  const input = [];
  for (let i = 0; i < 700; i++) input.push({ type: 'message', role: i % 2 ? 'assistant' : 'user', content: 'h' + i });
  input.push({ type: 'attachments', channels: ['docs'] }, { type: 'message', role: 'user', content: 'REQ' },
    { type: 'function_call', call_id: 'z1', name: 'f', arguments: '{}' }, { type: 'function_call_output', call_id: 'z1', output: 'LAST' });
  const r = SERVER.normalizeTurn({ protocol: 2, input, tools: [] });
  assert.ok(r && !r.error);
  assert.ok(r.items.length <= SERVER.MAX_INPUT_ITEMS);
  assert.equal(r.items[r.items.length - 1].output, 'LAST');
  assert.match(r.items[0].content, /EARLIER CONVERSATION NOT SHOWN/);
});

/* ── ⑥ ⑦ ───────────────────────────────────────────────────────────────────────────────── */
test('⑥⑦ a fast worker, a slow worker and the fast one\'s checker at 0.25 each: the turn pays 0.75, and the first usable arrival is recorded', async () => {
  const caps = (await import('../js/atlas-cap-research.js')).default;
  const e = caps.find((c) => c.row[0] === 'research.delegate');
  let open; const slow = new Promise((r) => { open = r; });
  let checkerOpen; const checkerGate = new Promise((r) => { checkerOpen = r; });
  const K = { R: (ok, html, extra) => Object.assign({ ok, html }, extra || null), L: (en) => en, esc: (x) => String(x), warn: (x) => x,
    _curTurnKey: 'ta-late-verify', turnSignal: () => undefined, classifyCapability: () => 'read', runReadCapability: async () => ({ ok: true, text: 'x' }),
    _delegationPolicy: { mode: 'independent', maxChildren: null, childMaxCalls: null, maxConcurrent: null },
    askAIJSONEnvelope: async (prompt) => {
      if (/slowpiece/.test(prompt)) { await slow; return { data: { summary: 's' }, meta: { costUsd: 0.25 } }; }
      if (/fastpiece/.test(prompt) && !/claim-to-check/.test(prompt)) return { data: { summary: 'f', findings: [{ id: 'f1', claim: 'claim-to-check', source: 'https://example.org/a', excerpt: 'q' }] }, meta: { costUsd: 0.25 } };
      await checkerGate; return { data: { summary: 'checked', verdicts: [{ id: 'f1', verdict: 'supported' }] }, meta: { costUsd: 0.25 } };
    } };
  const ledger = makeRunLedger();
  lateCostSink.current = (usd) => ledger.late(usd);
  runMarkSink.current = (name) => ledger.mark(name);
  const first = await e.run({ tasks: [{ id: 'a', goal: 'fastpiece', verify: true }, { id: 'b', goal: 'slowpiece' }], wait: 'any' }, {}, K);
  ledger.tool({ name: 'research.delegate', delegatedCostUsd: first.meta.delegatedCostUsd, delegatedTasks: first.meta.delegated.length });
  assert.deepEqual(first.meta.pending, ['b']);
  assert.ok(ledger.marked('firstUsefulData'), 'the first usable arrival is on the record');
  lateCostSink.current = null; runMarkSink.current = null;
  open(); checkerOpen();
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(Math.abs(ledger.summary().delegatedCostUsd - 0.75) < 1e-9, 'the slow worker AND the checker reached the turn: ' + ledger.summary().delegatedCostUsd);
});
test('⑦ the instants are the first of each, and the loop records the parent receiving and the next analysis', () => {
  let t = 0; const L = makeRunLedger({ now: () => t });
  t = 5; L.mark('parentReceived'); t = 9; L.mark('parentReceived');
  assert.equal(L.summary().marks.parentReceived, 5);
  const src = readFileSync(new URL('../js/atlas-agent.js', import.meta.url), 'utf8');
  assert.match(src, /ledger\.mark\('parentReceived'\)/);
  assert.match(src, /ledger\.mark\('nextAnalysisStart'\)/);
  assert.match(src, /runMarkSink\.current = \(name\) =>/);
});

/* ── ⑧ ───────────────────────────────────────────────────────────────────────────────────── */
test('⑧ a search that named nothing lists every match in one line; want/have spell out the fits with schemas; a named one is unchanged', async () => {
  const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
  const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
  const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
  const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
  const docs = makeAtlasCatalogText({}, {});
  const caps = makeAtlasCapabilities({ docs }); caps.bindRuntime({ docs });
  const surface = makeAtlasToolSurface({ capabilities: caps, schemas: makeAtlasSchemas(), runAction: async () => ({}) });
  /* a request whose only shared word is a category hint — no capability is named by it */
  const q = '稜線の両側の植生を比較';
  const lex = caps.search(q, { want: 3, min: 1 });
  assert.equal(lex.strong.length, 0, 'the premise: nothing strong');
  const res = await surface.find(q, {});
  assert.equal(res.matches.length, lex.ranked.length, 'every candidate is still listed');
  assert.ok(res.matches.every((m) => m.id && m.detail), 'each in one line, with how to read on');
  assert.ok(JSON.stringify(res).length < 30000, 'the answer is what it lists (' + JSON.stringify(res).length + ')');
  assert.match(res.note, /"want"/);
  const want = caps.resolve(res.matches[0].id).produces[0];
  const hinted = await surface.find(q, { want: [want] });
  const whole = hinted.matches.filter((m) => m.schema !== undefined);
  assert.ok(whole.length > 0 && whole.every((m) => caps.resolve(m.id).produces.includes(want)), 'the fits are spelled out with their schemas');
  assert.equal(hinted.matches.length, lex.ranked.length, 'and nothing else is dropped');
  /* named: the strong ones arrive whole, as before */
  const named = await surface.find(READ, {});
  assert.ok(named.matches.find((m) => m.id === READ).schema !== undefined);
  /* the vocabulary is the registry's own */
  const decl = surface.baseTools ? surface.baseTools().find_capability : null;
  if (decl) for (const p of new Set(caps.all().flatMap((c) => c.produces))) assert.match(decl.parameters.properties.want.description, new RegExp('\\b' + p + '\\b'));
});
