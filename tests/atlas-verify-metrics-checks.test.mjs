/* (atlas-verify-metrics) what a program decides about a claim before a model is asked; the id a claim is checked under; the per-answer metrics. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { codeOnly } from '../scripts/code-only.mjs';
import { decideClaims, claimId, claimsOf, checkerGoal, findSpatial } from '../js/atlas-claim-check.js';
import { verifyContract, verifyOutcome } from '../js/atlas-orchestrate.js';
import { buildTurnMetrics, summarize, makeTurnRecorder, installTurnMetricsSink, TURN_METRICS_EVENT } from '../js/atlas-turn-metrics.js';
import { compare, FIGURES } from '../scripts/atlas-metrics-report.mjs';

const mk = (id, extra) => Object.assign({ id, state: 'done', findings: [], facts: [], gaps: [], sources: [] }, extra || {});

async function kernels() {
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisUnits } = await import('../js/gis-units.js');
  return { geometry: makeGisGeometry(), units: makeGisUnits() };
}

test('a claim is named by task and position, not by its words', () => {
  assert.equal(claimId('a', 0), 'a#1');
  const r = mk('a', { findings: [{ claim: 'x' }, { claim: '' }, 'plain string', { note: 'no claim' }] });
  assert.deepEqual(claimsOf(r).map((c) => c.id), ['a#1', 'a#3']);
});

test('a coordinate out of range contradicts the claim by program, and the checker is not asked about it', async () => {
  const K = await kernels();
  const r = mk('a', { findings: [{ claim: 'The port is at 123, 10', lat: 123, lon: 10 }, { claim: 'Its name is X' }, { claim: 'Berth at', location: { latitude: 35.1, longitude: 139.2 } }] });
  const d = decideClaims(r, K);
  assert.equal(d.byClaim['a#1'].verdict, 'contradicted');
  assert.equal(d.byClaim['a#1'].defects[0].code, 'latitude_out_of_range');
  assert.deepEqual(d.undecided, ['a#2', 'a#3'], 'no claim is called supported by a program');
  assert.equal(d.byClaim['a#3'].passed[0], 'structure', 'a well-formed value is noted, never counted as true');
  const goal = checkerGoal('a', d.claims.filter((c) => d.undecided.includes(c.id)));
  assert.match(goal, /\[a#2\] Its name is X/);
  assert.doesNotMatch(goal, /\[a#1\]/);
});

test('a polygon that is not a polygon is found by the geometry kernel', async () => {
  const K = await kernels();
  const bad = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] };
  const good = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
  const r = mk('g', { findings: [{ claim: 'zone A', geometry: bad }, { claim: 'zone B', geometry: good }] });
  const d = decideClaims(r, K);
  assert.equal(d.byClaim['g#1'].verdict, 'contradicted');
  assert.equal(d.byClaim['g#2'].verdict, undefined);
  assert.deepEqual(d.undecided, ['g#2']);
  assert.equal(findSpatial({ a: { b: good } }).geoms.length, 1);
});

test('units: one quantity in two dimensions is a defect; an unknown unit only says the program does not know it', async () => {
  const K = await kernels();
  const f = (unit, value) => ({ subject: { name: 'Port of X' }, attribute: 'throughput', value, unit });
  const r = mk('u', { findings: [{ claim: 'c' }], facts: [f('kg', 14), f('km', 3)] });
  assert.ok(decideClaims(r, K).resultDefects.some((x) => x.code === 'unit_dimension_mismatch'));
  const r2 = mk('u2', { findings: [{ claim: 'c' }], facts: [f('m', 1000), f('km', 1)] });
  assert.equal(decideClaims(r2, K).resultDefects.length, 0, 'convertible units of one dimension are comparable, not a defect');
  const r3 = mk('u3', { findings: [{ claim: 'c' }], facts: [f('furlongs-of-nonsense', 1)] });
  assert.equal(decideClaims(r3, K).resultDefects[0].soft, true);
  assert.equal(decideClaims(r3, null).resultDefects.length, 0, 'without a kernel the check says nothing');
});

test('verifyOutcome: a program verdict and a model verdict are told apart; a reworded claim is still found by its id', async () => {
  const K = await kernels();
  const of = mk('a', { findings: [{ claim: 'bad place', lat: 200, lon: 0 }, { claim: 'Suez opened in 1869' }, { claim: 'never repeated' }] });
  const det = decideClaims(of, K);
  const by = mk('verify-a', { findings: [{ id: 'a#2', claim: 'The Suez Canal opened 1869', verdict: 'supported', source: 'https://x.org' }] });
  const o = verifyOutcome([{ of, by, det }]);
  assert.deepEqual(o.counts, { supported: 1, unsupported: 0, contradicted: 1, unchecked: 1 });
  assert.deepEqual(o.basis, { program: 1, model: 1 });
  assert.equal(o.checked[0].basis, 'program');
  const only = mk('b', { findings: [{ claim: 'bad', lat: 91, lon: 0 }] });
  const o2 = verifyOutcome([{ of: only, by: null, det: decideClaims(only, K) }]);
  assert.equal(o2.verifiers.length, 0);
  assert.equal(decideClaims(only, K).needsModel, false);
});

test('verifyContract hands the checker the ids; without claims it still asks for a verdict per claim', () => {
  const c = verifyContract('a', { claims: [{ id: 'a#2', claim: 'Suez opened in 1869' }] });
  assert.match(c.goal, /\[a#2\]/);
  assert.match(c.returns, /"id"/);
  assert.deepEqual(c.inputs, [{ from: 'a' }]);
  assert.match(verifyContract('a').goal, /Independently check/);
});

test('the claim checker holds no window and no network', () => {
  const src = codeOnly(fs.readFileSync(new URL('../js/atlas-claim-check.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(src, /\bwindow\b|\bdocument\b|\bfetch\(/);
});

test('turn metrics: counts and milliseconds from a finished turn, ratios null when nothing was measured', () => {
  const out = {
    completion: 'complete', stopped: 'answered', trace: { calls: 10, executed: 8, reused: 2, rejected: 1, unknownTool: 1 },
    run: { wallMs: 20000, modelMs: 12000, modelCalls: 5, costUsd: 0.05, costUnknownCalls: 0, delegatedCostUsd: 0.02, delegatedTasks: 2, tools: [{ id: 'research.delegate', ms: 6000 }, { id: 'map.draw', ms: 900 }] },
    results: [{ meta: { delegated: [{ findings: [{ claim: 'a', source: 'https://x' }, { claim: 'b' }] }], integrated: { verification: { basis: { program: 1, model: 1 }, counts: { unchecked: 0 } } } } }],
  };
  const m = buildTurnMetrics(out, { totalMs: 21000, firstUsefulMs: 4000 });
  assert.equal(m.total_ms, 21000); assert.equal(m.first_useful_ms, 4000); assert.equal(m.cost_micros, 50000);
  assert.equal(m.claims_total, 2); assert.equal(m.claims_grounded, 1); assert.equal(m.verify_program, 1);
  assert.equal(m.critical_tool, 'research.delegate'); assert.equal(m.ops_unknown_tool, 1);
  assert.equal(JSON.stringify(m).includes('https://x'), false, 'no url, no text travels');
  const s = summarize([m, buildTurnMetrics({}, {})]);
  assert.equal(s.duplicate_op_rate, 0.2); assert.equal(s.capability_found_rate, 0.9); assert.equal(s.grounded_claim_rate, 0.5);
  assert.equal(summarize([]).completion_rate, null);
  assert.equal(summarize([buildTurnMetrics({}, {})]).first_useful_ms.p50, null);
});

test('the recorder fixes the first useful result when the step after an operation begins, ignores plan-only steps, and announces once', () => {
  let t = 0; const heard = [];
  const rec = makeTurnRecorder({ now: () => t, notWork: ['plan'], emit: (d) => heard.push(d) });
  t = 1000; rec.step({ step: 1, calls: ['plan'] });
  t = 3000; rec.step({ step: 2, calls: ['map.draw'] });
  t = 9000; rec.step({ step: 3, calls: [] });
  t = 12000;
  const row = rec.recordAnswer({ completion: 'complete', trace: {}, run: {} }, 't1-123');
  assert.equal(row.first_useful_ms, 9000); assert.equal(row.total_ms, 12000);
  assert.equal(heard.length, 1); assert.equal(heard[0].turn, 't1-123');
  assert.equal(makeTurnRecorder({ emit: (d) => heard.push(d) }).recordAnswer({}, '').total_ms >= 0, true);
  assert.equal(heard.length, 1, 'no turn key, nothing announced');
});

test('the sink writes an announced row once for the signed-in account, and a signed-out reader writes nothing', async () => {
  const calls = [];
  const target = { fn: null };
  installTurnMetricsSink((n, f) => { assert.equal(n, TURN_METRICS_EVENT); target.fn = f; }, () => ({ rpc: async (n, a) => { calls.push([n, a]); return { error: null }; } }));
  target.fn({ detail: { turn: 't9', row: { total_ms: 5 } } });
  target.fn({ detail: { turn: '', row: {} } });
  await Promise.resolve();
  assert.deepEqual(calls, [['log_atlas_turn_metrics', { p_turn: 't9', p_row: { total_ms: 5 } }]]);
  const off = { fn: null };
  installTurnMetricsSink((n, f) => { off.fn = f; }, () => null);
  assert.doesNotThrow(() => off.fn({ detail: { turn: 't1', row: {} } }));
});

test('the comparison report says which way is better and never invents a missing figure', () => {
  const rows = compare({ turns: { total_ms_p50: 20000, duplicate_op_rate: null } }, { turns: { total_ms_p50: 15000, duplicate_op_rate: 0.1 } });
  const t = rows.find((r) => r.path === 'turns.total_ms_p50');
  assert.equal(t.verdict, 'better'); assert.equal(t.change, -0.25);
  assert.equal(rows.find((r) => r.path === 'turns.duplicate_op_rate').verdict, 'not measured');
  assert.ok(FIGURES.length >= 20);
});

test('the metrics migration: one row per turn, no text columns, admin-only read', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/20261130100000_atlas_turn_metrics.sql', import.meta.url), 'utf8');
  assert.match(sql, /unique \(user_id, turn_key\)/);
  assert.match(sql, /if not public\.is_admin\(\) then raise exception/);
  assert.match(sql, /revoke all on public\.atlas_turn_metrics from public, anon, authenticated/);
  assert.match(sql, /insert into public\.account_data_catalog/);
  const cols = sql.slice(sql.indexOf('create table if not exists public.atlas_turn_metrics'), sql.indexOf('comment on table public.atlas_turn_metrics'));
  assert.doesNotMatch(cols, /\b(question|answer|prompt|query|url|place)\b\s+text/i);
});

test('a capability run by a delegated worker asks the model under the worker\'s child key, with the reader\'s turn as parent', () => {
  const read = (f) => fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');
  assert.match(read('atlas-delegate.js'), /cap\.run\(w\.capability, w\.args, \{ signal: controller\.signal, turnKey: childKey \}\)/);
  assert.match(read('atlas-executor.js'), /turnKey: op\.turnKey/);
  assert.match(read('atlas-console.js'), /turnKey:\(o&&o\.turnKey\)\|\|undefined/);
  const r = read('atlas-cap-research.js');
  assert.match(r, /const callKey = \(dctx, K\) => \(dctx && dctx\.turnKey \? \{ turnId: dctx\.turnKey, parentTurnId: K\._curTurnKey \} : \{ turnId: K\._curTurnKey \}\)/);
  assert.equal((r.match(/callKey\(dctx,K\)/g) || []).length, 2, 'both model-asking capabilities use the one rule');
  assert.match(read('atlas-answer-pipeline.js'), /parentTurnId: opts\.parentTurnId \|\| undefined/);
});
