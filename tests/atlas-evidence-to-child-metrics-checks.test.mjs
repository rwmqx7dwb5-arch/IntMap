/* ============================================================================
 *  atlas-evidence-to-child — a page or search fetched ONCE reaches a delegated worker as text and addresses
 *  (one-pass-or-a-reason §2: «the result did not travel to the model that decides the next move»)
 *
 *  The host lane (js/atlas-console.js runReadCapability) used to hand a worker `html` + `meta` only. A re-read evidence record is a
 *  capability whose answer is its `exec` (what the parent is given as its observation); `html` is the reader's notice
 *  («re-read ev1 · title»). So the worker saw the notice and nothing else: no body, no address.
 *  Evaluated, not read: the real web.evidence row, the real store, runReadCapability lifted out of the console, the real worker loop.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { webEvidence } = await import('../js/atlas-web-evidence.js');
const { makeWorkerExecutor } = await import('../js/atlas-delegate.js');
const web = (await import('../js/atlas-cap-web.js')).default.find((c) => c.row[0] === 'web.evidence');

const CONSOLE = readFileSync(new URL('../js/atlas-console.js', import.meta.url), 'utf8');
const i0 = CONSOLE.indexOf('const runReadCapability = ');
const i1 = CONSOLE.indexOf('\n    /*', i0);
assert.ok(i0 > 0 && i1 > i0, 'runReadCapability is in the console');
const MARK = 'ZXQ-MARK-7731', URL1 = 'https://evidence.example.test/report/2026', URL2 = 'https://evidence.example.test/other';

/* the kernel's Result for a capability that answers through `exec`, as js/atlas-executor.js composes it */
const K = { R: (ok, html, o) => ({ ok, html, meta: o && o.meta, exec: o && o.exec }), warn: (x) => x, esc: (x) => x, L: (e) => e, note: (x) => x };
async function kernelExecute(id, args) {
  const r = await web.run(args, {}, K);
  return { status: r.ok ? 'completed' : 'failed', html: r.html, meta: r.meta, observed: r.exec ? { exec: r.exec } : {}, code: '' };
}
const runReadCapability = new Function('EXEC', '_curTurn', i0 === -1 ? '' : CONSOLE.slice(i0, i1) + '\nreturn runReadCapability;')({ execute: kernelExecute }, 't');

const FINAL = { summary: 'ok', findings: [{ claim: 'the figure', source: URL1, excerpt: MARK }] };
const ctx = () => ({ ev: [], signal: undefined, emit(k, d) { const e = { id: 'e' + this.ev.length, kind: k, data: d }; this.ev.push(e); return e; } });

test('a page fetched once is read by a worker as its text and its source addresses — nothing is searched again', async () => {
  let fetched = 0;
  const got = await webEvidence.acquire('page', URL1, async () => { fetched++; return { ok: true, url: URL1, title: 'The report', text: 'Population ' + MARK + ' people (2026).', sources: [{ url: URL1, title: 'The report' }, { url: URL2, title: 'Other' }] }; });
  assert.equal(fetched, 1);
  const seen = [];
  let step = 0;
  const ask = async (prompt) => { seen.push(prompt); return { data: step++ === 0 ? { call: { capability: 'web.evidence', args: { ref: got.entry.id } } } : FINAL, meta: { costUsd: 0 }, citations: [] }; };
  const ex = makeWorkerExecutor({ ask, parentTurn: 'p', maxCalls: 4, capability: { run: runReadCapability, classify: () => 'read', describe: () => '{}', find: async () => [] } });
  const r = await ex.run({ id: 't', goal: 'what does the stored page say', tools: ['web.evidence'] }, ctx());
  assert.equal(r.state, 'done');
  assert.equal(fetched, 1, 'the page was fetched once, by the first reader');
  assert.match(seen[1], new RegExp(MARK), 'the body is in what the worker\'s next model request holds');
  assert.ok(seen[1].includes(URL1) && seen[1].includes(URL2), 'and every source address');
});

test('a long record keeps its addresses in the part the worker is shown', async () => {
  const got = await webEvidence.acquire('page', 'https://evidence.example.test/long', async () => ({ ok: true, url: 'https://evidence.example.test/long', title: 'Long', text: 'x'.repeat(20000), sources: [{ url: URL2, title: 'Other' }] }));
  const out = await runReadCapability('web.evidence', { ref: got.entry.id, chars: 20000 }, {});
  assert.ok(out.exec && out.exec.web && out.exec.web.evidence, 'the lane carries the kernel\'s exec');
  const seen = [];
  let step = 0;
  const ask = async (p) => { seen.push(p); return { data: step++ === 0 ? { call: { capability: 'web.evidence', args: { ref: got.entry.id, chars: 20000 } } } : FINAL, meta: { costUsd: 0 }, citations: [] }; };
  await makeWorkerExecutor({ ask, parentTurn: 'p', maxCalls: 4, capability: { run: runReadCapability, classify: () => 'read', describe: () => '{}', find: async () => [] } }).run({ id: 't', goal: 'g', tools: ['web.evidence'] }, ctx());
  assert.ok(seen[1].includes(URL2), 'the address survives the cut of the text');
  assert.match(seen[1], /read_step/, 'and the cut text is re-readable by reference');
});

/* ── the turn's measurements, on the fixed inputs that exposed their defects ─────────────────────────────────────── */
const { makeTurnRecorder, buildTurnMetrics, summarize, markTurn } = await import('../js/atlas-turn-metrics.js');
const { shapeOf, findingBasis } = await import('../js/atlas-job-core.js');
const clock = () => { const c = { t: 0, now: () => c.t }; return c; };

test('first useful result: no operation and 8 s is the answer shown at 8 s, never 0; a failed operation then a plan shows nothing', () => {
  const c = clock();
  const r1 = makeTurnRecorder({ now: c.now, emit: () => {} });
  c.t = 8000;
  assert.equal(r1.recordAnswer({ completion: 'complete', text: 'the answer', trace: { executed: 0 } }, 'k1').first_useful_ms, 8000);
  const c2 = clock();
  const r2 = makeTurnRecorder({ now: c2.now, emit: () => {} });
  c2.t = 1500; r2.shown({ ok: false, meta: { produced: ['map'] } });   /* the operation failed */
  c2.t = 4200; r2.step({ step: 2, calls: ['plan'] });                  /* and a plan was written */
  c2.t = 9000;
  const row = r2.recordAnswer({ completion: 'partial', text: '', trace: { executed: 1 } }, 'k2');
  assert.equal(row.first_useful_ms, null); assert.equal(row.useful_shown, false);
  assert.equal(summarize([row]).no_useful_rate, 1, 'counted apart');
  assert.equal(summarize([row]).first_useful_ms.p50, null, 'and not as a short wait');
});

test('a finding that names an outlet and holds nothing the source says: one judgement, the worker and the answer agree', () => {
  const f = { claim: 'c', source: 'Some Outlet' };
  assert.deepEqual([findingBasis(f).cited, findingBasis(f).evidenced], [true, false]);
  const sh = shapeOf({ summary: 's', findings: [f] });
  assert.equal(sh.out.evidence.sourced, 0, 'the worker counts it unsourced');
  const m = buildTurnMetrics({ completion: 'complete', results: [{ meta: { delegated: [{ findings: sh.out.findings }] } }] }, {});
  assert.deepEqual([m.claims_total, m.claims_cited, m.claims_evidenced, m.claims_grounded], [1, 1, 0, 0], 'the answer\'s tally counts it cited, not grounded');
});

test('a finding backs the final answer when the answer names its source', () => {
  const findings = [{ claim: 'a', source: 'https://a.example.test/p', excerpt: 'x' }, { claim: 'b', source: 'https://b.example.test/p', excerpt: 'y' }];
  const m = buildTurnMetrics({ completion: 'complete', text: 'see https://www.a.example.test/p/', results: [{ meta: { delegated: [{ findings }] } }] }, { cites: [] });
  assert.equal(m.claims_evidenced, 2); assert.equal(m.claims_backing, 1);
});

test('cost per success is every attempt at the task over the successes, not the completed turns that reported a cost', () => {
  const rows = [
    { task_key: 'a', completion: 'none', cost_micros: 90000, cost_known: false },
    { task_key: 'a', completion: 'complete', cost_micros: 40000, cost_known: true },
    { task_key: 'b', completion: 'none', cost_micros: 20000, cost_known: true },
  ];
  const s = summarize(rows);
  assert.equal(s.cost_per_success_micros, 150000, '(90000 + 40000 + 20000) / one task that succeeded');
  assert.equal(s.cost_traced_rate, 2 / 3, 'and how much of it was actually priced');
});

test('the same request asked again after an unfinished try is one task; after a success it is a new one', () => {
  const mk = (q, key) => makeTurnRecorder({ question: q, turnKey: key, emit: () => {} });
  const a = mk('same words', 't1'); a.recordFailure(new Error('x'), 't1');
  const b = mk('same words', 't2'); assert.equal(b.row({}).task_key, 't1');
  b.recordAnswer({ completion: 'complete' }, 't2');
  assert.equal(mk('same words', 't3').row({}).task_key, 't3');
  assert.equal(mk('other words', 't4').row({}).task_key, 't4');
});

test('the two moments the parent\'s waiting is measured by are recorded once, by name, from anywhere', () => {
  const c = clock();
  const rec = makeTurnRecorder({ now: c.now, emit: () => {} });
  c.t = 2000; markTurn('evidence_arrived');
  c.t = 2600; markTurn('evidence_arrived'); markTurn('evidence_used');
  c.t = 5000;
  const row = rec.recordAnswer({ completion: 'complete' }, 'km');
  assert.deepEqual([row.evidence_arrived_ms, row.evidence_used_ms], [2000, 2600]);
  markTurn('evidence_arrived');   /* no turn running: nothing happens */
});
