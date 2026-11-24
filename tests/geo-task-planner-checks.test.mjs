/* ============================================================================
 *  geo-task-planner — the spec of a geospatial analysis, its gaps, and what exists (node --test)
 * ----------------------------------------------------------------------------
 *  js/atlas-geoplan.js is pure; js/atlas-plan.js stores the spec on Atlas's plan; the loop
 *  (js/atlas-agent.js) awaits the preflight after a `geo.check` declaration. What this holds:
 *    ① the spec is normalised, never filled in: a missing field is a GAP, an unknown word is returned;
 *    ② availability comes from the sources, with the three answers kept apart:
 *       found / not there / could not ask — and a catalogue cannot prove full coverage;
 *    ③ an environment with no capability is said to have none;
 *    ④ the spec rides the plan through the real loop, and is carried back to the model;
 *    ⑤ nothing is blocked: no call is refused, no ceiling is touched.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importModule, swappable } from './helpers/import-module.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

const G = await import('../js/atlas-geoplan.js');
const { makeAtlasPlan } = await import('../js/atlas-plan.js');
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const engineSeat = swappable();
const { makeAtlasCapabilities } = await importModule('js/atlas-capabilities.js', { mocks: { 'js/geo-engine.js': { IntMapGeoEngine: engineSeat.value } } });
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');

const FULL = {
  question: 'Population exposed to flooding, northern Vietnam, 2020',
  region: { name: 'Northern Vietnam', bounds: [102, 20, 108, 24] },
  time: { at: '2020' },
  needs: [
    { id: 'flood', what: 'flood extent', source: { kind: 'stac', ref: 'flood' }, completeness: 'all', resolution: { value: 30, unit: 'm' } },
    { id: 'pop', what: 'population density', source: { kind: 'layer', ref: 'layer:population' }, completeness: 'all', resolution: { value: 1, unit: 'km' } },
  ],
  method: { ops: ['zonal'] },
  environment: 'browser-gis',
  outputs: ['map', 'table'],
};
const collection = (spatial, temporal = 'overlaps') => ({ ref: 'earth-search/flood', title: 'Flood', match: { spatial, temporal }, rights: { license: 'CC-BY-4.0' } });
const doors = (o = {}) => Object.assign({
  describe: async (ref) => (ref === 'layer:population' ? { ref, undeclared: [{ slot: 'time.axis' }] } : null),
  discover: async () => ({ ok: true, entries: [collection('covers')], catalogs: [{ id: 'es', answered: true, complete: true }] }),
  hasCapability: (id) => id === 'data.gis' || id === 'compute.run',
}, o);

/* ── ① ───────────────────────────────────────────────────────────────────────────────────────── */
test('geo-task-planner ① a complete spec has no gaps; an empty one lists every missing part and defaults none', () => {
  const full = G.normalizeGeo(FULL);
  assert.deepEqual(full.unrecognised, []);
  assert.deepEqual(G.gapsOf(full.spec), []);
  const empty = G.gapsOf(G.normalizeGeo({}).spec).map((x) => x.code);
  for (const c of ['region-not-stated', 'time-not-stated', 'needs-not-stated', 'method-not-stated', 'environment-not-stated', 'outputs-not-stated'])
    assert.ok(empty.includes(c), c);
  const e = G.normalizeGeo({}).spec;
  assert.equal(e.region, null); assert.equal(e.time, null); assert.equal(e.environment, null);
});

test('geo-task-planner ① unknown words are returned, not guessed into a value; unreadable resolution is a gap', () => {
  const n = G.normalizeGeo({ environment: 'gpu-farm', needs: [{ id: 'x', what: 'w', source: { kind: 'wms' }, completeness: 'mostly', resolution: 'fine' }], outputs: ['hologram'], region: { bounds: [1, 2, 3] } });
  assert.equal(n.spec.environment, null);
  assert.equal(n.spec.needs[0].source.kind, null);
  assert.equal(n.spec.needs[0].completeness, null);
  assert.deepEqual(n.unrecognised.map((u) => u.path).sort(), ['environment', 'needs[0].completeness', 'needs[0].source.kind', 'outputs[0]', 'region.bounds']);
  assert.ok(G.gapsOf(n.spec).some((g) => g.code === 'need-resolution-unreadable'));
});

test('geo-task-planner ① a later call states only what changed', () => {
  const a = G.mergeGeo(null, FULL);
  const b = G.mergeGeo(a, { environment: 'python' });
  assert.equal(b.spec.environment, 'python');
  assert.equal(b.spec.needs.length, 2);
  assert.deepEqual(b.spec.region.bounds, [102, 20, 108, 24]);
});

/* ── ② ───────────────────────────────────────────────────────────────────────────────────────── */
test('geo-task-planner ② found / not there / could not ask are three different answers', async () => {
  const spec = G.normalizeGeo(FULL).spec;
  const ok = await G.preflight(spec, doors());
  assert.equal(ok.needs.find((n) => n.id === 'pop').state, 'available');
  assert.equal(ok.needs.find((n) => n.id === 'flood').state, 'available');

  const none = await G.preflight(spec, doors({ describe: async () => null }));
  assert.equal(none.needs.find((n) => n.id === 'pop').state, 'unavailable');
  assert.equal(none.runnable, false, 'a need that is not in IntMap makes the analysis not runnable');

  const quiet = await G.preflight(spec, doors({ discover: async () => ({ ok: true, entries: [], catalogs: [{ id: 'es', answered: false, why: 'timeout' }] }) }));
  assert.equal(quiet.needs.find((n) => n.id === 'flood').state, 'unknown', 'a catalogue that did not answer is not "nothing there"');
  assert.equal(quiet.runnable, null);

  const empty = await G.preflight(spec, doors({ discover: async () => ({ ok: true, entries: [], catalogs: [{ id: 'es', answered: true, complete: true }] }) }));
  assert.equal(empty.needs.find((n) => n.id === 'flood').state, 'unavailable');
  assert.equal(empty.runnable, false);

  const threw = await G.preflight(spec, doors({ discover: async () => { throw new Error('net'); } }));
  assert.equal(threw.needs.find((n) => n.id === 'flood').state, 'unknown');
});

test('geo-task-planner ② full coverage is never confirmed on a catalogue\'s say-so', async () => {
  const spec = G.normalizeGeo(FULL).spec;
  const r = await G.preflight(spec, doors());
  assert.equal(r.runnable, null, 'completeness:"all" with no source stating it is unproven, not runnable:true');
  assert.ok(r.reasons.some((x) => /full coverage/.test(x)));
  const sample = G.normalizeGeo(Object.assign({}, FULL, { needs: FULL.needs.map((n) => Object.assign({}, n, { completeness: 'sample' })) })).spec;
  assert.equal((await G.preflight(sample, doors())).runnable, true);
});

test('geo-task-planner ② a collection that only overlaps is partial; the question carries region and time to the catalogue', async () => {
  const seen = [];
  const spec = G.normalizeGeo(FULL).spec;
  const r = await G.preflight(spec, doors({ discover: async (q) => { seen.push(q); return { ok: true, entries: [collection('overlaps')], catalogs: [{ id: 'es', answered: true }] }; } }));
  assert.equal(r.needs.find((n) => n.id === 'flood').state, 'partial');
  assert.deepEqual(seen[0].bounds, [102, 20, 108, 24]);
  assert.equal(seen[0].time, '2020');
  assert.deepEqual(seen[0].kinds, ['stac']);
});

test('geo-task-planner ② overture and uploads are not asked of any catalogue: unknown, never unavailable', async () => {
  const s = G.normalizeGeo({ needs: [{ id: 'b', what: 'buildings', source: { kind: 'overture' } }, { id: 'u', what: 'x', source: { kind: 'upload' } }] }).spec;
  const r = await G.preflight(s, doors());
  assert.deepEqual(r.needs.map((n) => n.state), ['unknown', 'unknown']);
});

/* ── ③ ───────────────────────────────────────────────────────────────────────────────────────── */
test('geo-task-planner ③ an environment with no capability is said to have none', async () => {
  const sample = G.normalizeGeo(Object.assign({}, FULL, { needs: [{ id: 'p', what: 'p', source: { kind: 'layer', ref: 'layer:population' }, completeness: 'sample' }] }));
  for (const [env, expectRunnable] of [['browser-gis', true], ['python', true], ['server', false], ['job', false]]) {
    const r = await G.preflight(Object.assign({}, sample.spec, { environment: env }), doors());
    assert.equal(r.runnable, expectRunnable, env);
  }
  const r2 = await G.preflight(Object.assign({}, sample.spec, { environment: 'python' }), doors({ hasCapability: () => false }));
  assert.equal(r2.runnable, false);
  assert.ok(r2.reasons.some((x) => /compute\.run/.test(x)));
});

test('geo-task-planner ③ the environment table names real registry ids', () => {
  const caps = makeAtlasCapabilities({});
  for (const [env, id] of Object.entries(G.ENVIRONMENT_CAPABILITY)) if (id) assert.ok(caps.has(id), env + ' -> ' + id);
});

/* ── ④ ───────────────────────────────────────────────────────────────────────────────────────── */
const AGENT = makeAtlasAgent();
const CAPS = makeAtlasCapabilities({});
const SCHEMAS = makeAtlasSchemas();
async function turn(script, plan) {
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction: async () => ({ ok: true, html: '<div>x</div>', meta: { status: 'completed' } }) });
  const tools = surface.baseTools();
  const seen = []; let i = 0;
  const model = async (req) => { seen.push(req); const r = script[Math.min(i, script.length - 1)]; i++; return r; };
  const out = await AGENT.runTurn({ model, tools, execute: surface.makeExecute(tools, AGENT), footprint: (c) => surface.footprintOf(c, tools),
    promote: surface.promotionsOf, system: 'sys', messages: [{ role: 'user', content: 'q' }], plan });
  return { out, seen };
}
const callsOf = (...cs) => ({ text: '', turnState: 'continuing', toolCalls: cs.map((c) => ({ id: c.id, name: c.name, arguments: c.args || {} })) });

test('geo-task-planner ④ through the real loop: the gaps come back at once, the check is awaited, the spec rides every later step', async () => {
  const plan = makeAtlasPlan({ geoProbe: doors() });
  const { seen } = await turn([
    callsOf({ id: 'p1', name: 'plan', args: { goal: 'g', steps: ['find data', 'analyse'], current: 1, geo: { question: 'q', region: { name: 'Vietnam', bounds: [102, 20, 108, 24] }, needs: [{ id: 'pop', what: 'population', source: { kind: 'layer', ref: 'layer:population' } }], check: true } } }),
    { text: 'done', turnState: 'final', toolCalls: [] },
  ], plan);
  const toolMsg = JSON.stringify(seen[1].messages);
  assert.match(toolMsg, /time-not-stated/, 'the gaps are in the plan\'s answer');
  assert.match(toolMsg, /"runnable"/, 'the awaited check is in the same answer');
  assert.match(toolMsg, /pop/);
  assert.match(plan.promptBlock(), /Geo analysis: q | not stated: .*availability: runnable=true/, 'the prompt block every later step is shown carries the spec and its availability');
  const snap = plan.snapshot();
  assert.ok(snap.geo && snap.geo.check && snap.geo.check.needs[0].state === 'available');
});

test('geo-task-planner ④ without check:true nothing is asked of any source', async () => {
  let asked = 0;
  const plan = makeAtlasPlan({ geoProbe: doors({ describe: async () => { asked++; return null; }, discover: async () => { asked++; return { ok: true, entries: [], catalogs: [] }; } }) });
  plan.beginTurn();
  const rec = plan.declare({ steps: ['a'], geo: { needs: [{ id: 'x', what: 'w', source: { kind: 'layer', ref: 'layer:x' } }] } });
  assert.equal(rec.ok, true); assert.ok(rec.geo.gaps.length);
  assert.equal(await plan.preflight(), null);
  assert.equal(asked, 0);
  assert.match(plan.promptBlock(), /availability: not checked/);
});

test('geo-task-planner ④ a changed spec drops the earlier check; revising the steps keeps the spec', async () => {
  const plan = makeAtlasPlan({ geoProbe: doors() });
  plan.beginTurn();
  plan.declare({ steps: ['a'], geo: FULL });
  plan.declare({ geo: { check: true } });   /* nothing but a request to check */
  await plan.preflight();
  assert.ok(plan.snapshot().geo.check);
  plan.declare({ geo: { environment: 'python' } });
  assert.equal(plan.snapshot().geo.check, null, 'the check answered another spec');
  plan.declare({ steps: ['a', 'b'] });
  assert.equal(plan.snapshot().geo.spec.environment, 'python');
});

test('geo-task-planner ④ a plan with no geo is unchanged (no geo in the answer, none in the prompt)', () => {
  const plan = makeAtlasPlan(); plan.beginTurn();
  const rec = plan.declare({ goal: 'g', steps: ['a'] });
  assert.equal('geo' in rec, false);
  assert.doesNotMatch(plan.promptBlock(), /Geo analysis/);
  assert.equal(plan.snapshot().geo, null);
});

/* ── ⑤ ───────────────────────────────────────────────────────────────────────────────────────── */
test('geo-task-planner ⑤ nothing is blocked: the module and its wiring decide no call, step or ceiling', () => {
  const src = readFileSync(join(ROOT, 'js/atlas-geoplan.js'), 'utf8');
  assert.doesNotMatch(codeOnly(src), /maxSteps|TURN_MAX_CALLS|throw new Error\('refus/);
  assert.match(readFileSync(join(ROOT, 'js/atlas-agent.js'), 'utf8'), /PLAN\.geoPending/);
});
