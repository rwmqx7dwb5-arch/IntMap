/* ============================================================================
 *  atlas-plan-on-map — Atlas's plan, its observed states, and what each step drew (node --test)
 * ----------------------------------------------------------------------------
 *  Drives js/atlas-agent.js runTurn — the loop the browser runs — over the real registry, schemas and
 *  tool surface with a scripted model, and the plan ledger js/atlas-plan.js the console hands it.
 *  What it holds:
 *    ① the plan is Atlas's: offered only as a tool, applied in call order, and nothing is planned for it;
 *    ② a step's state is the executor's verdict — unobserved and partial are never 「完了」;
 *    ③ the plan is carried back: to the next step, and to the next turn («手順 2 をやり直して»);
 *    ④ the ceilings are not touched; a plan call touches no app state;
 *    ⑤ what a step drew is found by looking at the map (pure helpers), and the console wires it.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importModule, swappable } from './helpers/import-module.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const engineSeat = swappable();
const { makeAtlasCapabilities } = await importModule('js/atlas-capabilities.js', { mocks: { 'js/geo-engine.js': { IntMapGeoEngine: engineSeat.value } } });
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { makeAtlasPlan, PLAN_TOOL, opState, drawnDiff, bboxOf } = await import('../js/atlas-plan.js');

const AGENT = makeAtlasAgent();
const CAPS = makeAtlasCapabilities({});
const SCHEMAS = makeAtlasSchemas();

async function turn(script, act, extra = {}) {
  const ran = [];
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS,
    runAction: async (action) => { ran.push(action); return act(action); } });
  const tools = surface.baseTools();
  const seen = [];
  let i = 0;
  const model = async (req) => {
    seen.push({ step: req.step, tools: req.tools.map((t) => t.name), messages: req.messages });
    const r = script[Math.min(i, script.length - 1)]; i++;
    return typeof r === 'function' ? r(req) : r;
  };
  const out = await AGENT.runTurn(Object.assign({ model, tools, execute: surface.makeExecute(tools, AGENT),
    footprint: (c) => surface.footprintOf(c, tools), promote: surface.promotionsOf,
    system: 'sys', messages: [{ role: 'user', content: 'q' }] }, extra));
  return { out, ran, seen, tools };
}
const calls = (...cs) => ({ text: '', turnState: 'continuing', toolCalls: cs.map((c) => ({ id: c.id, name: c.name, arguments: c.args || {} })) });
const answer = (t) => ({ text: t, turnState: 'final', toolCalls: [] });
const verdict = (status, produced = ['map'], ok = status === 'completed' || status === 'partial') =>
  ({ ok, html: '<div>' + status + '</div>', meta: { status, code: status === 'completed' ? undefined : status + '_code', produced } });

/* ── ① ─────────────────────────────────────────────────────────────────────────────────────── */

test('atlas-plan-on-map ① the plan tool is offered only when a ledger is kept, after the base tools and before any promotion', async () => {
  const none = await turn([answer('ok')], async () => verdict('completed'));
  assert.ok(!none.seen[0].tools.includes('plan'), 'no ledger: the tool list is exactly what it was');
  const PLAN = makeAtlasPlan();
  const withPlan = await turn([answer('ok')], async () => verdict('completed'), { plan: PLAN });
  const names = withPlan.seen[0].tools;
  assert.equal(names.indexOf('plan'), Object.keys(withPlan.tools).length, 'fixed position: right after the base tools (the cached prefix)');
  assert.equal(PLAN.snapshot(), null, 'nothing is planned FOR Atlas: a turn that declared nothing has no plan');
});

test('atlas-plan-on-map ① a plan call is applied in call order: the calls after it in the same reply serve the step it names', async () => {
  const PLAN = makeAtlasPlan();
  const { out, ran } = await turn([
    calls({ id: 'p1', name: 'plan', args: { goal: '台湾海峡の封鎖の影響', steps: ['海峡を示す', '航路を描く', '答える'], current: 1 } },
      { id: 'a1', name: 'map_view', args: { place: 'Taiwan Strait' } }),
    calls({ id: 'p2', name: 'plan', args: { current: 2 } }, { id: 'a2', name: 'highlight', args: { country: 'Taiwan' } }),
    answer('影響は…'),
  ], async () => verdict('completed'), { plan: PLAN });
  assert.equal(ran.length, 2, 'the plan calls reached no dispatch — they touch no app state');
  const s = out.plan;
  assert.equal(s.goal, '台湾海峡の封鎖の影響');
  assert.deepEqual(s.steps.map((x) => x.state), ['completed', 'completed', 'pending']);
  assert.deepEqual(s.steps.map((x) => x.ops.map((o) => o.callId)), [['a1'], ['a2'], []]);
  assert.equal(out.stopped, 'answered');
});

test('atlas-plan-on-map ① a plan call that cannot be carried out is a typed note, and nothing changes', () => {
  const P = makeAtlasPlan(); P.beginTurn();
  assert.equal(P.declare({ current: 2 }).error, 'no_plan');
  P.declare({ goal: 'g', steps: ['a', 'b'] });
  const r = P.declare({ current: 5 });
  assert.equal(r.error, 'no_such_step');
  assert.equal(P.snapshot().current, 1);
  assert.ok(PLAN_TOOL.parameters && !PLAN_TOOL.parameters.required, 'every field is optional — each call says only what changed');
});

/* ── ② ─────────────────────────────────────────────────────────────────────────────────────── */

test('atlas-plan-on-map ② the state is the executor\'s verdict: unobserved and partial are never done, a failed retry is replaced by its success', async () => {
  assert.equal(opState({ ok: false, status: 'unobserved' }), 'unobserved');
  assert.equal(opState({ ok: true, status: 'partial' }), 'partial');
  assert.equal(opState({ ok: false, status: 'failed' }), 'failed');
  assert.equal(opState({ ok: false, status: 'needs_input' }), 'waiting');
  assert.equal(opState({ ok: true }), 'completed');

  const PLAN = makeAtlasPlan();
  let n = 0;
  const { out } = await turn([
    calls({ id: 'p1', name: 'plan', args: { goal: 'g', steps: ['見えないもの', '一部', '失敗して直す', '失敗のまま'], current: 1 } },
      { id: 'a1', name: 'map_view', args: { place: 'Tokyo' } }),
    calls({ id: 'p2', name: 'plan', args: { current: 2 } }, { id: 'a2', name: 'highlight', args: { country: 'Japan' } }),
    calls({ id: 'p3', name: 'plan', args: { current: 3 } }, { id: 'a3', name: 'highlight', args: { country: 'Korea' } }),
    calls({ id: 'a4', name: 'highlight', args: { country: 'South Korea' } }),
    calls({ id: 'p4', name: 'plan', args: { current: 4 } }, { id: 'a5', name: 'map_view', args: { place: 'Nowhere' } }),
    answer('done'),
  ], async () => { n++; return [verdict('unobserved', [], false), verdict('partial'), verdict('failed', [], false), verdict('completed'), verdict('failed', [], false)][n - 1]; }, { plan: PLAN });
  assert.deepEqual(out.plan.steps.map((x) => x.state), ['unobserved', 'partial', 'completed', 'failed']);
  assert.ok(!out.plan.steps.slice(0, 2).some((x) => x.state === 'completed'), '「観測できず」 is not ✓');
});

test('atlas-plan-on-map ② a step made current with nothing run under it says so; one never reached stays not started', () => {
  const P = makeAtlasPlan(); P.beginTurn();
  P.declare({ goal: 'g', steps: ['a', 'b', 'c'], current: 1 });
  assert.equal(P.snapshot().steps[0].state, 'running', 'the current step of a live turn is being worked on');
  P.declare({ current: 2 });
  P.endTurn('answered');
  assert.deepEqual(P.snapshot().steps.map((x) => x.state), ['noop', 'noop', 'pending']);
});

test('atlas-plan-on-map ② a call still in flight when the turn ends was not seen to finish', () => {
  const P = makeAtlasPlan(); P.beginTurn();
  P.declare({ goal: 'g', steps: ['a', 'b'], current: 1 });
  P.started('x1', { step: 0, capability: 'map.highlight' });
  P.endTurn('aborted');
  assert.equal(P.snapshot().steps[0].state, 'stopped');
  P.beginTurn(); P.declare({ current: 2 });
  P.started('x2', { step: 1, capability: 'view.flyTo' });
  P.endTurn('answered');
  assert.equal(P.snapshot().steps[1].state, 'unobserved');
});

/* ── ③ ─────────────────────────────────────────────────────────────────────────────────────── */

test('atlas-plan-on-map ③ the plan goes back to the model: in the plan call\'s result, and as a block every later step and turn', async () => {
  const PLAN = makeAtlasPlan();
  const r1 = await turn([
    calls({ id: 'p1', name: 'plan', args: { goal: 'g', steps: ['移動', '強調'], current: 1 } }, { id: 'a1', name: 'map_view', args: { place: 'Tokyo' } }),
    calls({ id: 'p2', name: 'plan', args: { current: 2 } }, { id: 'a2', name: 'highlight', args: { country: 'Japan' } }),
    answer('done'),
  ], async (a) => (a.country ? verdict('failed', [], false) : verdict('completed')), { plan: PLAN });
  const toolMsg = r1.seen[1].messages.find((m) => m.role === 'tool');
  assert.equal(toolMsg.content[0].ok, true);
  assert.equal(toolMsg.content[0].plan.steps.length, 2, 'the plan call answers with the plan as recorded');
  const block = PLAN.promptBlock();
  assert.match(block, /1\. 移動 — completed/);
  assert.match(block, /2\. 強調 — failed: map\.highlight failed/);

  /* the next turn: 「手順 2 をやり直して」 — a call made without naming a step is not filed under one */
  const r2 = await turn([
    calls({ id: 'b0', name: 'map_view', args: { place: 'Osaka' } }),
    calls({ id: 'p3', name: 'plan', args: { current: 2 } }, { id: 'b1', name: 'highlight', args: { country: 'Japan' } }),
    answer('やり直しました'),
  ], async () => verdict('completed'), { plan: PLAN });
  assert.deepEqual(r2.out.plan.steps.map((x) => x.state), ['completed', 'completed'], 'the retry in the later turn replaced the failure');
  assert.ok(!r2.out.plan.steps.some((x) => x.ops.some((o) => o.callId === 'b0')), 'a call made before the turn named a step serves none');
  assert.match(PLAN.promptBlock(), /\[earlier turn\]/, 'what an earlier turn did is marked as such');
});

test('atlas-plan-on-map ③ a revision keeps what was observed for the steps it did not rename', () => {
  const P = makeAtlasPlan(); P.beginTurn();
  P.declare({ goal: 'g', steps: ['a', 'b'], current: 1 });
  P.started('x1', { step: 0, capability: 'view.flyTo' }); P.settled('x1', { ok: true, status: 'completed', capability: 'view.flyTo' });
  P.declare({ steps: ['a', 'c', 'd'], current: 2 });
  const s = P.snapshot();
  assert.equal(s.goal, 'g');
  assert.deepEqual(s.steps.map((x) => x.ops.length), [1, 0, 0]);
  assert.equal(s.steps[0].state, 'completed');
});

/* ── ④ ─────────────────────────────────────────────────────────────────────────────────────── */

test('atlas-plan-on-map ④ the ceilings are not moved, and the loop does not read the server\'s budget', () => {
  const src = rd('js/atlas-agent.js');
  assert.equal(AGENT.LIMITS.maxSteps, 8);
  assert.equal(AGENT.LIMITS.maxToolCalls, 32);
  assert.ok(!/TURN_MAX_CALLS = \d/.test(src));
  assert.ok(!/maxSteps|maxToolCalls|TURN_MAX_CALLS/.test(codeOnly(rd('js/atlas-plan.js'))), 'the plan module reads no ceiling');
});

/* ── ⑤ ─────────────────────────────────────────────────────────────────────────────────────── */

test('atlas-plan-on-map ⑤ what a call drew is what appeared or changed between its start and its verdict', () => {
  const d = drawnDiff({ surfaces: { a: '1|x', b: '2|y' }, objects: ['o1'] }, { surfaces: { a: '1|x', b: '3|z', c: '1|w' }, objects: ['o1', 'o2'] });
  assert.deepEqual(d, { surfaces: ['b', 'c'], objects: ['o2'] });
  assert.deepEqual(bboxOf([{ geometry: { type: 'Point', coordinates: [120, 24] } }, { geometry: { type: 'LineString', coordinates: [[119, 23], [122, 26]] } }]), [[119, 23], [122, 26]]);
  assert.equal(bboxOf([]), null);
});

test('atlas-plan-on-map ⑤ the console keeps ONE ledger, hands it to the loop and the HUD, and puts its block in every step', () => {
  const c = rd('js/atlas-console.js');
  assert.equal((c.match(/makeAtlasPlan\(\)/g) || []).length, 1);
  assert.match(c, /makeAtlasLive\(HOST,\{[^}]*plan:PLAN/);
  assert.match(c, /AGENT\.runTurn\(\{[\s\S]{0,1200}plan:PLAN/);
  assert.match(c, /tail\+=PLAN\.promptBlock\(\)/);
  const live = rd('js/atlas-live.js');
  assert.match(live, /makePlanView\(deps\.plan/);
  assert.match(live, /\+ ATLAS_PLAN_CSS/);
});
