/* ============================================================================
 *  atlas-early-results — what arrives first is usable first, and what is still running is said to be (node --test)
 *
 *  ① research.delegate wait:"any" waits for the NEXT arrival: asked again after one task was handed over, it does not
 *     return at once with the same answer (the earlier `firstUsable` was already satisfied); nothing is asked twice
 *  ② web.search wait:"any": answers at the first question that has an answer, lists the rest "running", and the same
 *     queries asked again JOIN them (one request each) and return at the next one
 *  ③ the loop: a partial that states a different `progressKey` is not "the same verdict again"; and a step records how long
 *     its earliest result waited before the model was asked again (firstDoneAt → usedAt)
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const gate = () => { let open; const p = new Promise((r) => { open = r; }); return { p, open }; };

test('① delegate wait:"any" returns at each next arrival, never at one already handed over, and pays once', async () => {
  const caps = (await import('../js/atlas-cap-research.js')).default;
  const e = caps.find((c) => c.row[0] === 'research.delegate');
  const gB = gate(), gC = gate();
  let asked = 0;
  const K = { R: (ok, html, extra) => Object.assign({ ok, html }, extra || null), L: (en) => en, esc: (x) => String(x), warn: (x) => x,
    _curTurnKey: 'ta-early-1', turnSignal: () => undefined, classifyCapability: () => 'read', runReadCapability: async () => ({ ok: true, text: 'x' }),
    _delegationPolicy: { mode: 'independent', maxChildren: null, childMaxCalls: null, maxConcurrent: null },
    askAIJSONEnvelope: async (prompt) => { asked++; if (/pieceB/.test(prompt)) await gB.p; if (/pieceC/.test(prompt)) await gC.p; return { data: { summary: 's' }, meta: { costUsd: 0.1 } }; } };
  const tasks = [{ id: 'a', goal: 'pieceA' }, { id: 'b', goal: 'pieceB' }, { id: 'c', goal: 'pieceC' }];
  const first = await e.run({ tasks, wait: 'any' }, {}, K);
  assert.deepEqual(first.meta.pending, ['b', 'c']);
  assert.equal(first.meta.status, 'partial');
  assert.ok(first.meta.progressKey && /b,c/.test(first.meta.progressKey));

  const second = e.run({ tasks, wait: 'any' }, {}, K);
  let early = false; second.then(() => { early = true; });
  await tick(30);
  assert.equal(early, false, 'the second ask waits — "a" was already handed over, so it does not satisfy it');
  gB.open();
  const got2 = await second;
  assert.deepEqual(got2.meta.pending, ['c'], 'it returned at the next arrival (b) with c still running');
  assert.notEqual(got2.meta.progressKey, first.meta.progressKey, 'a different standing is a different verdict');
  assert.ok(got2.meta.delegated.find((r) => r.id === 'b').arrivedSecAgo >= 0, 'each arrival carries when it arrived');

  const third = e.run({ tasks, wait: 'any' }, {}, K);
  gC.open();
  const got3 = await third;
  assert.equal(got3.meta.status, 'completed');
  assert.equal(asked, 3, 'nothing was asked twice');
  assert.ok(Math.abs(first.meta.delegatedCostUsd + got2.meta.delegatedCostUsd + got3.meta.delegatedCostUsd - 0.3) < 1e-9, 'each task paid for once');
});

test('② web.search wait:"any": the first answer now, the rest joined and delivered at the next arrival', async () => {
  const { default: list } = await import('../js/atlas-cap-web.js');
  const search = list.find((c) => c.row[0] === 'web.search');
  const { webEvidence } = await import('../js/atlas-web-evidence.js');
  webEvidence.clear();
  const gSlow = gate(), gSlower = gate();
  const asked = [];
  const askAIJSONEnvelope = async (prompt) => {
    asked.push(prompt);
    if (/slower/.test(prompt)) await gSlower.p; else if (/slow/.test(prompt)) await gSlow.p;
    return { text: 'Answer ' + prompt.slice(0, 30), citations: [{ url: 'https://s.example/' + asked.length, title: 'S' }], meta: { webUsed: true, webSearches: 1 } };
  };
  const K = { R: (ok, html, o) => ({ ok, html, ...(o || {}) }), warn: (x) => x, esc: (x) => String(x), L: (en) => en, note: (x) => x, _curTurnKey: 'turn-early', askAIJSONEnvelope };
  const queries = [{ q: 'fast one' }, { q: 'slow one' }, { q: 'slower one' }];
  const r1 = await search.run({ queries, wait: 'any' }, {}, K);
  const s1 = r1.exec.web.searches;
  assert.deepEqual(s1.map((x) => x.state), ['ok', 'running', 'running']);
  assert.equal(r1.meta.status, 'partial'); assert.equal(r1.meta.code, 'searches_still_running');

  const p2 = search.run({ queries, wait: 'any' }, {}, K);
  let early = false; p2.then(() => { early = true; });
  await tick(30);
  assert.equal(early, false, 'the fast one was already handed over — the second ask waits for the next');
  gSlow.open();
  const r2 = await p2;
  assert.deepEqual(r2.exec.web.searches.map((x) => x.state), ['ok', 'ok', 'running']);
  gSlower.open();
  const r3 = await search.run({ queries }, {}, K);
  assert.deepEqual(r3.exec.web.searches.map((x) => x.state), ['ok', 'ok', 'ok']);
  assert.equal(r3.meta.status, undefined, 'every question answered: not partial');
  assert.equal(asked.length, 3, 'each question was searched once — later asks joined or read the store');
});

test('③ the loop: a different progressKey is not a repeated verdict; a step records how long its first result waited', async () => {
  const { makeAtlasAgent } = await import('../js/atlas-agent.js');
  const AGENT = makeAtlasAgent();
  let t = 1000; const now = () => t;
  const replies = [
    { text: '', toolCalls: [{ id: 'c1', name: 'fast', arguments: {} }, { id: 'c2', name: 'slow', arguments: {} }] },
    { text: '', toolCalls: [{ id: 'c3', name: 'wait', arguments: { wait: 'any' } }] },
    { text: '', toolCalls: [{ id: 'c4', name: 'wait', arguments: { wait: 'any' } }] },
    { text: 'done', toolCalls: [] },
  ];
  let i = 0; const seen = [];
  const model = async () => { seen.push(t); return replies[Math.min(i++, replies.length - 1)]; };
  const standing = ['pending:b,c', 'pending:c'];
  let w = 0;
  const T = (name, props) => [name, { name, description: '', parameters: { type: 'object', properties: props || {} } }];
  const tools = Object.fromEntries([T('fast'), T('slow'), T('wait', { wait: { type: 'string' } })]);
  const execute = async (call) => {
    if (call.name === 'fast') { t += 100; return { ok: true }; }
    if (call.name === 'slow') { t += 900; return { ok: true }; }
    return { ok: true, status: 'partial', code: 'tasks_still_running', progressKey: standing[w++] };
  };
  const out = await AGENT.runTurn({ model, tools, execute, system: '', messages: [{ role: 'user', content: 'q' }], now });
  const rec = out.results.filter((r) => r.name === "wait");
  assert.equal(rec.length, 2);
  assert.ok(!rec[1].repeatedPartialCallThisTurn, 'the second partial states a different standing: not the same verdict again');
  const st = out.trace.stepTiming[0];
  assert.ok(st.firstDoneAt != null && st.lastDoneAt >= st.firstDoneAt);
  assert.ok(typeof st.firstResultHeldMs === 'number' && st.usedAt >= st.lastDoneAt, 'usedAt is stamped when the model is asked again');
});
