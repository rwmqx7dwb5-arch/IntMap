/* ============================================================================
 *  atlas-autonomy — the environment Atlas solves in: parallel where work is independent, evaluated against the real map
 *  ① a task whose inputs are done starts while another still runs, even past the slice (supabase/functions/_shared/atlas-job-runner.js)
 *  ② one round's independent tool calls start together; the GIS (shared in-process state) keeps its turn; entries keep the asked order
 *  ③ the recorded concurrency is the most at one instant (js/atlas-run-ledger.js peakConcurrency)
 *  ④ the eval reads the drawn OBJECTS (id · colour · width · opacity · count), so a blue second line is not «the line made red»
 *  ⑤ a call that failed drew no control (scripts/atlas-eval/initiative.mjs)
 *  ⑥ the goal verifier is shown the data the map held and the turn never touched (js/atlas-held-data.js)
 *  ⑦ the reader's own cases are added and asked as open questions with their ideal outcome
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planJob } from '../js/atlas-job-core.js';
import { runJob, WORKER_WINDOW_MS } from '../supabase/functions/_shared/atlas-job-runner.js';
import { makeServerCaps } from '../supabase/functions/_shared/atlas-server-caps.js';
import { peakConcurrency } from '../js/atlas-run-ledger.js';
import { gradeMap, validateMapState, mapVocabulary, parseColour } from '../scripts/atlas-eval/map-state.mjs';
import { expressionOf, tookEffect, validateOpenQuestions } from '../scripts/atlas-eval/initiative.mjs';
import { heldUntouched, makeHeldObserver } from '../js/atlas-held-data.js';
import { addCase } from '../scripts/atlas-eval/add-case.mjs';
import { rubricRequest } from '../scripts/atlas-eval/grade.mjs';

function fakeDb(plan) {
  const st = {
    job: { id: 'job1', user_id: 'u1', status: 'running', lease_holder: 'h1', cancel_requested: false, enabled: true, cap: 1e9, spent: 0, reserved: 0, finished: null, amends: [], releases: 0 },
    tasks: new Map(plan.map((t) => [t.id, { task_id: t.id, status: 'queued', code: '', deps: t.deps, contract: t.contract, result: null, key: t.key }])),
    events: [],
  };
  const j = st.job; const mine = (h) => j.lease_holder === h && j.status === 'running';
  const rpcs = {
    atlas_job_checkpoint: (a) => (mine(a.p_holder) ? [{ ok: true, action: 'go', amends: [] }] : [{ ok: false, action: 'lost', amends: [] }]),
    atlas_job_reserve: (a) => { j.reserved += a.p_micros; return true; },
    atlas_job_settle: (a) => { j.reserved = Math.max(0, j.reserved - a.p_reserved); j.spent += a.p_actual; return true; },
    atlas_job_task_start: (a) => { const t = st.tasks.get(a.p_task); if (!t || t.status !== 'queued') return false; t.status = 'running'; return true; },
    atlas_job_task_finish: (a) => { const t = st.tasks.get(a.p_task); if (!t || t.status !== 'running') return false; t.status = a.p_status; t.code = a.p_code; t.result = a.p_result; return true; },
    atlas_job_task_block: (a) => { const t = st.tasks.get(a.p_task); t.status = 'failed'; t.code = a.p_code; return true; },
    atlas_job_finish: (a) => { j.status = a.p_status; j.finished = { status: a.p_status }; j.lease_holder = null; return true; },
    atlas_job_release: () => { j.lease_holder = null; j.releases += 1; return true; },
  };
  return {
    st,
    rpc: async (name, args) => ({ data: (rpcs[name] || (() => true))(args), error: null }),
    from: (table) => ({
      select: () => ({ eq: async () => ({ data: table === 'atlas_job_tasks' ? Array.from(st.tasks.values()).map((t) => ({ ...t })) : [], error: null }) }),
      insert: async (row) => { st.events.push(row); return { error: null }; },
    }),
  };
}
const good = (summary) => ({ text: JSON.stringify({ summary, findings: [{ claim: summary }], gaps: [] }), usage: { input: 1000, cached_read: 0, output: 500 }, citations: [], model: 'm' });
const money = { estimate: () => 1, actual: () => 1 };
const goal = (prompt) => /YOUR PIECE OF THE WORK:\n([^\n]+)/.exec(prompt)[1];
const base = (db, callModel, extra = {}) => ({ db, job: db.st.job, holder: 'h1', callModel, money, now: () => 0, budgetMs: 30000, leaseSeconds: 150, system: 'SYS', ...extra });
const tick = () => new Promise((r) => setImmediate(r));

/* ① */
test('① A ends past the slice while independent B still runs: C (needs only A) starts at once, and does not wait for B (hardMs states the wall)', async () => {
  const plan = planJob([{ id: 'a', goal: 'A' }, { id: 'b', goal: 'B' }, { id: 'c', goal: 'C', inputs: [{ from: 'a' }] }]).tasks;
  const db = fakeDb(plan);
  let t = 0; const started = []; const ended = []; let openB;
  const gateB = new Promise((r) => { openB = r; });
  const r = runJob(base(db, async (sys, prompt) => {
    const g = goal(prompt); started.push(g);
    if (g === 'A') t = 31000;          /* the mock clock: A takes 31 s, past the 30 s slice */
    if (g === 'B') await gateB;        /* B is the long one */
    ended.push(g); return good(g);
  }, { now: () => t, hardMs: 400000 }));
  for (let i = 0; i < 50; i++) await tick();
  assert.ok(started.includes('C'), 'C started while B was still running: ' + started.join(','));
  assert.ok(!ended.includes('B'));
  openB();
  const out = await r;
  assert.equal(out.outcome, 'finished');
  assert.deepEqual(ended.slice().sort(), ['A', 'B', 'C']);
});
test('① …but not when a whole worker window no longer fits before the wall, and a host that states no wall keeps the old rule', async () => {
  for (const hardMs of [0, 31000 + WORKER_WINDOW_MS - 1]) {
    const plan = planJob([{ id: 'a', goal: 'A' }, { id: 'b', goal: 'B' }, { id: 'c', goal: 'C', inputs: [{ from: 'a' }] }]).tasks;
    const db = fakeDb(plan); let t = 0; const asked = [];
    const r = await runJob(base(db, async (sys, prompt) => { const g = goal(prompt); asked.push(g); if (g === 'A') t = 31000; if (g === 'B') await tick(); return good(g); }, { now: () => t, hardMs }));
    assert.equal(r.outcome, 'more', 'hardMs ' + hardMs);
    assert.ok(!asked.includes('C'));
  }
});

/* ② */
function toolWorker(asked) {
  let n = 0;
  return async () => (n++ === 0 ? { text: JSON.stringify({ calls: asked }), usage: {}, citations: [], model: 'm' } : good('done'));
}
test('② independent reads of one round overlap; the GIS keeps its turn; entries are written in the order asked', async () => {
  const plan = planJob([{ id: 'w', goal: 'W', tools: ['sim.spaceWeather', 'world.object', 'data.gis'] }], { capabilityOk: () => true }).tasks;
  const db = fakeDb(plan);
  let live = 0, peak = 0, liveGis = 0, peakGis = 0;
  const lane = {
    catalogue: () => ['sim.spaceWeather', 'world.object', 'data.gis'].map((id) => ({ id, args: '{}' })),
    has: () => true,
    exclusive: (id) => id === 'data.gis',
    run: async (id, args) => {
      live++; peak = Math.max(peak, live);
      if (id === 'data.gis') { liveGis++; peakGis = Math.max(peakGis, liveGis); }
      await new Promise((r) => setTimeout(r, id === 'sim.spaceWeather' ? 30 : 5));
      live--; if (id === 'data.gis') liveGis--;
      return { ok: true, text: id + '#' + args.i, sources: [] };
    },
  };
  const calls = [{ capability: 'sim.spaceWeather', args: { i: 1 } }, { capability: 'world.object', args: { i: 2 } }, { capability: 'data.gis', args: { i: 3 } }, { capability: 'data.gis', args: { i: 4 } }];
  const prompts = [];
  const cm = toolWorker(calls);
  await runJob(base(db, async (s, p) => { prompts.push(p); return cm(); }, { capabilities: lane }));
  assert.ok(peak >= 3, 'the three kinds started together (peak ' + peak + ')');
  assert.equal(peakGis, 1, 'two GIS calls never ran at once');
  const last = prompts[prompts.length - 1];
  const at = (k) => last.indexOf('[' + k + ']');
  assert.ok(at(1) > -1 && at(1) < at(2) && at(2) < at(3) && at(3) < at(4), 'the answers are listed in the order they were asked: ' + [1, 2, 3, 4].map(at));
});
test('② the same call twice in one round runs once', async () => {
  const plan = planJob([{ id: 'w', goal: 'W', tools: ['world.object'] }], { capabilityOk: () => true }).tasks;
  const db = fakeDb(plan); let n = 0;
  const lane = { catalogue: () => [{ id: 'world.object', args: '{}' }], has: () => true, exclusive: () => false, run: async () => { n++; return { ok: true, text: 'x', sources: [] }; } };
  await runJob(base(db, toolWorker([{ capability: 'world.object', args: { q: 1 } }, { capability: 'world.object', args: { q: 1 } }]), { capabilities: lane }));
  assert.equal(n, 1);
});
test('② the real lane says which twin is exclusive: the GIS yes, a read twin no, an unknown id yes', () => {
  const lane = makeServerCaps({});
  assert.equal(lane.exclusive('data.gis'), true);
  assert.equal(lane.exclusive('sim.spaceWeather'), false);
  assert.equal(lane.exclusive('nope'), true);
});

/* ③ */
test('③ the peak is the most at one instant: A=[0,10], B=[0,4], C=[6,10] never ran three at once', () => {
  assert.equal(peakConcurrency([[0, 10], [0, 4], [6, 10]]), 2);
  assert.equal(peakConcurrency([[0, 5], [5, 9]]), 1, 'one ending where another begins do not overlap');
  assert.equal(peakConcurrency([[0, 5], [1, 6], [2, 7], [3, 8]]), 4);
  assert.equal(peakConcurrency([]), 0);
});

/* ④ */
const V = mapVocabulary();
const ms = { objects: [{ kind: 'line', count: { min: 1, max: 1 }, style: { color: { near: '#ff0000' }, width: { min: 4 }, opacity: { max: 0.95 } }, why: 'the same line, red, wide, see-through' }] };
const snapOf = (items) => ({ objects: { n: items.length, items } });
test('④ the restyled line is a match; another id beside it, a blue line, a thin one and an opaque one are each a mismatch', () => {
  assert.deepEqual(validateMapState(ms, V, 'q'), []);
  const ok = gradeMap(ms, snapOf([{ id: 'line_1', kind: 'line', color: '#ff0000', width: 6, opacity: 0.5 }]));
  assert.equal(ok.verdict, 'match', JSON.stringify(ok));
  assert.equal(gradeMap(ms, snapOf([{ id: 'line_1', kind: 'line', color: 'rgb(250, 10, 12)', width: 6, opacity: 0.5 }])).verdict, 'match');
  const second = gradeMap(ms, snapOf([{ id: 'line_1', kind: 'line', color: '#3b82f6', width: 2.6 }, { id: 'line_2', kind: 'line', color: '#ff0000', width: 6, opacity: 0.5 }]));
  assert.equal(second.verdict, 'mismatch');
  assert.match(second.criteria[0].detail, /at most 1/);
  assert.equal(gradeMap(ms, snapOf([{ id: 'line_1', kind: 'line', color: '#0000ff', width: 6, opacity: 0.5 }])).verdict, 'mismatch', 'blue');
  assert.equal(gradeMap(ms, snapOf([{ id: 'line_1', kind: 'line', color: '#ff0000', width: 2.6, opacity: 0.5 }])).verdict, 'mismatch', 'thin');
  assert.equal(gradeMap(ms, snapOf([{ id: 'line_1', kind: 'line', color: '#ff0000', width: 6, opacity: 1 }])).verdict, 'mismatch', 'opaque');
  assert.equal(gradeMap(ms, snapOf([{ id: 'line_1', kind: 'line', color: '#ff0000', width: 6 }])).verdict, 'unobserved', 'a style the snapshot does not carry is not a pass');
  assert.equal(gradeMap(ms, {}).verdict, 'unobserved');
});
test('④ the question in the key states the objects, and the key validates', () => {
  const q = JSON.parse(readFileSync(new URL('../scripts/atlas-eval/questions.json', import.meta.url), 'utf8')).questions.find((x) => x.id === 'restyle-drawn-line-across-turns');
  assert.equal(q.mapState.objects[0].count.max, 1);
  assert.deepEqual(validateMapState(q.mapState, V, q.id), []);
  assert.deepEqual(parseColour('#f00'), [255, 0, 0]);
  assert.ok(validateMapState({ objects: [{ kind: 'unicorn', count: { min: 1 }, why: 'x' }] }, V, 'q').length, 'a kind the product never draws is refused');
});

/* ⑤ */
test('⑤ a tabs call that failed is not «the reply drew tabs»; the same call that ran is', () => {
  const args = { items: [{ kind: 'tabs', options: [] }] };
  const failed = expressionOf({ operations: [{ capabilityId: 'ui.inlineControls', status: 'failed' }], calls: [{ args, resultText: JSON.stringify({ ok: false, error: 'bad' }) }] });
  assert.deepEqual(failed.controls, []);
  const ran = expressionOf({ operations: [{ capabilityId: 'ui.inlineControls', status: 'completed' }], calls: [{ args, resultText: JSON.stringify({ ok: true, status: 'completed' }) }] });
  assert.deepEqual(ran.controls, ['tabs']);
  assert.ok(ran.families.includes('interactive'));
  const cancelled = expressionOf({ operations: [{ capabilityId: 'ui.inlineControls', status: 'cancelled' }], calls: [{ args, resultText: JSON.stringify({ status: 'cancelled' }) }] });
  assert.deepEqual(cancelled.controls, []);
  assert.ok(!cancelled.capabilities.includes('ui.inlineControls'));
  assert.equal(tookEffect('not json'), true, 'an unreadable result states nothing');
});

/* ⑥ */
test('⑥ the held-data line lists what predates the turn and no result names; a dataset the turn used is left out; an unreadable registry says nothing', () => {
  const ds = [{ id: 'dem_1', title: 'Elevation', kind: 'raster', createdAt: 100 }, { id: 'lc_2', title: 'Land cover', count: 40, fields: [{ name: 'cls' }], createdAt: 150 }, { id: 'new_3', title: 'Made now', createdAt: 900 }];
  assert.deepEqual(heldUntouched(ds, [{ capability: 'data.gis', args: { inputs: ['lc_2'] } }], 500).map((d) => d.id), ['dem_1']);
  const lines = makeHeldObserver(500, { IntMapData: { list: () => ds } })({ results: [] });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Elevation \[dem_1\]/);
  assert.match(lines[0], /Land cover \[lc_2\]/);
  assert.ok(!/Made now/.test(lines[0]));
  assert.deepEqual(makeHeldObserver(500, {})({ results: [] }), []);
  assert.deepEqual(makeHeldObserver(500, { IntMapData: { list: () => { throw new Error('x'); } } })({ results: [] }), []);
  assert.deepEqual(makeHeldObserver(500, { IntMapData: { list: () => ds } })({ results: [{ args: 'dem_1 lc_2' }] }), []);
});
test('⑥ the verifier is told what the line is and when it matters, and the console hands it over', () => {
  assert.match(readFileSync(new URL('../js/atlas-goal-verify.js', import.meta.url), 'utf8'), /DATA THE MAP ALREADY HELD/);
  assert.match(readFileSync(new URL('../js/atlas-console.js', import.meta.url), 'utf8'), /makeHeldObserver\(since\)/);
});

/* ⑦ */
test('⑦ a case is added with its ideal outcome, asked as an open question, and the grader is shown the ideal as a reference', () => {
  const empty = { version: 1, questions: [] };
  assert.throws(() => addCase(empty, { text: 'q' }), /ideal/);
  const r = addCase(empty, { text: '北海道の山の稜線を挟んで植生が違うのはなぜ？', ideal: '両側を実際に比べ、分かったことと残る仮説が区別されている', today: '2026-11-27' });
  assert.equal(r.added.id, 'user-2026-11-27-1');
  assert.equal(r.added.lang, 'jp');
  const r2 = addCase(r.set, { text: 'Why do two slopes differ?', ideal: 'compared both', today: '2026-11-27' });
  assert.equal(r2.added.id, 'user-2026-11-27-2');
  assert.equal(r2.added.lang, 'en');
  assert.deepEqual(validateOpenQuestions(r2.set), []);
  assert.ok(validateOpenQuestions({ questions: [{ id: 'x', lang: 'en', text: 't', expect: {} }] }).length, 'an expectation is still refused in an open set');
  assert.match(rubricRequest({ text: 't', lang: 'en', ideal: 'compared both' }, 'reply').prompt, /compared both/);
  assert.ok(!/THE OUTCOME THE READER WOULD HAVE WANTED/.test(rubricRequest({ text: 't', lang: 'en' }, 'reply').prompt));
});

/* ⑧ */
test('⑧ a worker left running by wait:"any" and never asked about again still reaches the turn\'s cost when it ends', async () => {
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  const { makeRunLedger, lateCostSink } = await import('../js/atlas-run-ledger.js');
  const caps = (await import('../js/atlas-cap-research.js')).default;
  const e = caps.find((c) => c.row[0] === 'research.delegate');
  let open; const slow = new Promise((r) => { open = r; });
  const K = { R: (ok, html, extra) => Object.assign({ ok, html }, extra || null), L: (en) => en, esc: (x) => String(x), warn: (x) => x,
    _curTurnKey: 'ta-late-1', turnSignal: () => undefined, classifyCapability: () => 'read', runReadCapability: async () => ({ ok: true, text: 'x' }),
    _delegationPolicy: { mode: 'independent', maxChildren: null, childMaxCalls: null, maxConcurrent: null },
    askAIJSONEnvelope: async (prompt) => { if (/slowpiece/.test(prompt)) await slow; return { data: { summary: 's' }, meta: { costUsd: 0.25 } }; } };
  const ledger = makeRunLedger();
  lateCostSink.current = (usd) => ledger.late(usd);
  const first = await e.run({ tasks: [{ id: 'a', goal: 'fastpiece' }, { id: 'b', goal: 'slowpiece' }], wait: 'any' }, {}, K);
  ledger.tool({ name: 'research.delegate', delegatedCostUsd: first.meta.delegatedCostUsd, delegatedTasks: first.meta.delegated.length });
  assert.deepEqual(first.meta.pending, ['b']);
  assert.ok(Math.abs(ledger.summary().delegatedCostUsd - 0.25) < 1e-9, 'only the arrived worker so far');
  lateCostSink.current = null;   /* a later turn replaced the sink: this turn's cost must still go to THIS turn's ledger */
  open();
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(Math.abs(ledger.summary().delegatedCostUsd - 0.5) < 1e-9, 'the slow worker was paid when it ended: ' + ledger.summary().delegatedCostUsd);
  assert.equal(ledger.summary().delegatedTasks, 2, 'its task was counted once, when it was listed');
});
