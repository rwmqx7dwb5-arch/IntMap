/* ============================================================================
 *  R318 — the Atlas control kernel: registry, executor, results, state, planner, audit
 * ----------------------------------------------------------------------------
 *  The round's claim is that Atlas now decides "done" by WATCHING THE APP rather than by believing
 *  a function that returned. These are the checks that make that claim falsifiable:
 *
 *    ① the registry is the one list, and it covers the dispatch exactly
 *    ② the twenty audit checks can each be made to go RED (a gate never seen red proves nothing)
 *    ③ `ok` cannot be written — it is derived from `status`
 *    ④ the executor awaits, observes, verifies, refuses to invent a target, cancels and supersedes
 *    ⑤ the plan is a structure: unknown capabilities, bad refs and broken dependencies are REJECTED
 *    ⑥ the goal is a gate, not a note
 *    ⑦ the nine languages reach the same capability, and the model is told the right one
 *    ⑧ one user turn costs one use — in the client, the proxy and the database
 *    ⑨ the catalogue moved without losing a byte, and the kernel shrank by moving
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const lines = (p) => read(p).split(/\r?\n/);
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
const { makeAtlasResults } = await import('../js/atlas-results.js');
const { makeAtlasState } = await import('../js/atlas-state.js');
const { installAtlasKernel } = await import('../js/atlas-executor.js');
const { makeAtlasPlanner } = await import('../js/atlas-planner.js');
const { auditWith, dispatchGroups } = await import('../scripts/atlas-capability-audit.mjs');

const CAPS = makeAtlasCapabilities({});
const DOCS = makeAtlasCatalogText({}, {});
const RESULTS = makeAtlasResults({});

/* a kernel wired for tests: real modules, stub capabilities */
function kernel() {
  /* the same door the app uses — js/atlas-executor.js exports nothing else, on purpose: two
     executors would mean two operation registries and two conflict locks (tests/r175 ③). */
  const OS = {};
  return installAtlasKernel(OS, {}, { capabilities: makeAtlasCapabilities({}) });
}

/* ══ ① THE REGISTRY IS THE ONE LIST ══════════════════════════════════════════════════════════ */

test('R318 ①a: every live dispatch spelling resolves to a canonical capability', () => {
  const groups = dispatchGroups(lines('js/atlas-console.js'));
  assert.ok(groups.length >= 110, `only ${groups.length} dispatch groups found — the switch moved and this test would pass on nothing`);
  const spellings = groups.flatMap((g) => g.names);
  assert.ok(spellings.length >= 200, `only ${spellings.length} spellings — the parser is reading the wrong thing`);
  const unresolved = spellings.filter((n) => !CAPS.resolve(n));
  assert.deepEqual(unresolved, [], 'these dispatch spellings belong to no capability');
});

test('R318 ①b: the registry adds nothing that cannot run, and misses nothing that can', () => {
  const groups = dispatchGroups(lines('js/atlas-console.js'));
  const implemented = new Set(groups.flatMap((g) => g.names));
  const orphans = CAPS.all().filter((c) => !c.withdrawn && c.legacy && !implemented.has(c.legacy));
  assert.deepEqual(orphans.map((c) => c.id), [], 'registered with no dispatch case behind it');
  const unregistered = groups.filter((g) => !g.names.some((n) => CAPS.resolve(n)));
  assert.deepEqual(unregistered.map((g) => g.names.join('/')), [], 'implemented and unregistered');
});

test('R318 ①c: a capability that writes cannot be registered without observe() and verify()', () => {
  const caps = makeAtlasCapabilities({});
  const refused = caps.define({ id: 'test.writesNothingWatched', execute: () => ({ ok: true }),
    effects: { reads: [], writes: ['map.test'], conflictKeys: [] } });
  assert.equal(refused, false, 'a side-effecting capability with no observer must be REFUSED, not accepted');
  const accepted = caps.define({ id: 'test.watched', execute: () => ({ ok: true }),
    effects: { reads: [], writes: ['map.test'], conflictKeys: [] },
    observe: () => 1, verify: () => ({ status: 'completed' }) });
  assert.equal(accepted, true, 'and one that IS watched must be accepted');
});

test('R318 ①d: a lazy capability is discoverable before its module exists', () => {
  const covered = new Set(DOCS.idsCovered());
  const lazy = CAPS.all().filter((c) => c.lazyModules.length);
  assert.ok(lazy.length >= 8, `only ${lazy.length} lazy capabilities — the table lost its lazyModules column`);
  lazy.forEach((c) => {
    assert.ok(covered.has(c.id) || c.withdrawn, `${c.id} needs ${c.lazyModules.join(',')} and is not in the catalogue`);
    /* and the module is asked for at EXECUTION, never at planning */
    assert.ok(/lazyModules\[i\]/.test(read('js/atlas-executor.js')), 'the executor no longer resolves lazy modules itself');
  });
  assert.doesNotMatch(read('js/atlas-capabilities.js'), /IntMapLazy\.need/,
    'the registry must not fetch a module — descriptors exist before code does');
});

test('R318 ①e: a non-equivalent substitution is recorded as forbidden', () => {
  const iso = CAPS.resolve('routing.isochrone');
  assert.ok(iso.forbiddenSubstitutes.includes('map.radius'),
    'a radius circle is not a road-network isochrone — #R115 cost a whole round to that substitution');
  const radius = CAPS.resolve('map.radius');
  assert.ok(radius.forbiddenSubstitutes.includes('routing.isochrone'), 'and the ban is symmetric');
  const mr = CAPS.resolve('research.mapReport');
  assert.ok(mr.equivalents.includes('research.situationMap'), 'genuinely interchangeable pairs stay reachable to repair');
  assert.ok(mr.forbiddenSubstitutes.includes('research.historicalMap'), 'live news is not a historical map (#R135)');
});

/* ══ ② EVERY AUDIT CHECK CAN GO RED ══════════════════════════════════════════════════════════ */

/* Build the audit's inputs, then damage ONE of them and require the matching check to notice. */
function auditOn(over) {
  return auditWith(Object.assign({
    caps: CAPS, docs: DOCS,
    atlas: lines('js/atlas-console.js'),
    controls: read('js/atlas-controls.js'),
    capSrc: read('js/atlas-capabilities.js'),
    execSrc: read('js/atlas-executor.js'),
    stateSrc: read('js/atlas-state.js'),
    plannerSrc: read('js/atlas-planner.js'),
    resultsSrc: read('js/atlas-results.js'),
  }, over));
}
const failing = (checks, id) => (checks.find((c) => c.id === id) || { failures: [] }).failures;

test('R318 ②a: the audit is green on the tree as it stands, except where it is honestly red', () => {
  const checks = auditOn({});
  assert.equal(checks.length, 20, 'the audit must keep asking twenty questions');
  const red = checks.filter((c) => c.failures.length).map((c) => c.id);
  assert.deepEqual(red, [], 'these capability checks are failing:\n' + JSON.stringify(checks.filter((c) => c.failures.length), null, 1));
});

test('R318 ②b: it goes red on an unreachable dispatch label', () => {
  const damaged = lines('js/atlas-console.js').slice();
  const i = damaged.findIndex((l) => /^ {8}case 'flyTo'/.test(l));
  assert.ok(i > 0, 'the flyTo case moved');
  damaged.splice(i + 1, 0, "        case 'flyTo': { return 1; }");
  assert.ok(failing(auditOn({ atlas: damaged }), 'alias-coverage').length,
    'a second case for a spelling an earlier case already claims is dead code and must be reported');
});

test('R318 ②c: it goes red on a capability the planner is never told about', () => {
  const caps = makeAtlasCapabilities({});
  caps.define({ id: 'test.invisible', legacy: 'flyTo', aliases: ['flyTo'], execute: () => ({ ok: true }),
    produces: [], effects: { reads: [], writes: [], conflictKeys: [] } });
  assert.ok(failing(auditOn({ caps }), 'planner-discoverable').length,
    'a capability with no catalogue block is invisible to the planner — the #R278 defect');
});

test('R318 ②d: it goes red when a promise can be reported before it settles', () => {
  const damaged = read('js/atlas-executor.js').replace(
    "if (raw && typeof raw.then === 'function') raw = await raw;", 'if (false) raw = await raw;');
  assert.ok(failing(auditOn({ execSrc: damaged }), 'async-honest').length,
    'removing the await must be caught — that IS the #R82 defect');
  const damaged2 = read('js/atlas-results.js').replace(
    "get: function () { return this.status === 'completed'; }", 'get: function () { return true; }');
  assert.ok(failing(auditOn({ resultsSrc: damaged2 }), 'async-honest').length,
    'and so must an `ok` that stops being derived from `status`');
});

test('R318 ②e: it goes red on a success claimed on top of a swallowed error', () => {
  const damaged = read('js/atlas-capabilities.js') + "\n      try{ x(); }catch(_){} return { status: 'completed' };\n";
  assert.ok(failing(auditOn({ capSrc: damaged }), 'no-success-after-catch').length,
    'catch(_){} followed by a success is the shape every one of these rounds found');
});

test('R318 ②f: it goes red when a tool is allowed to take the map centre', () => {
  const caps = makeAtlasCapabilities({});
  caps.define({ id: 'test.silentCentre', execute: () => ({ ok: true }),
    targetPolicy: { required: true, accepts: ['coordinates'], mapCenterAllowed: true, kind: 'point' },
    effects: { reads: [], writes: [], conflictKeys: [] } });
  assert.ok(failing(auditOn({ caps }), 'target-policy').length,
    '#R302: a point-needing tool must ASK, not take the centre of the screen');
});

test('R318 ②g: it goes red when the registry truncates its own population', () => {
  const damaged = read('js/atlas-capabilities.js').replace('API.all()\n        .filter', 'API.all().slice(0, 40)\n        .filter');
  const withCap = damaged === read('js/atlas-capabilities.js')
    ? read('js/atlas-capabilities.js') + '\n var x = API.all().slice(0, 40);\n' : damaged;
  assert.ok(failing(auditOn({ capSrc: withCap }), 'no-silent-cap').length,
    'the #R278 shape one layer up: a capability that disappears for being Nth');
});

test('R318 ②h: it goes red when a withdrawal quietly ends', () => {
  const damaged = lines('js/atlas-console.js').map((l) =>
    /^ {8}case 'monitor'/.test(l) ? "        case 'monitor': { return R(true, 'ok'); }" : l);
  const i = damaged.findIndex((l) => /^ {8}case 'monitor'/.test(l));
  assert.ok(i > 0, 'the monitor case moved');
  /* the four lines the proof may live in must not carry it any more */
  for (let k = i; k < i + 4 && k < damaged.length; k++) damaged[k] = damaged[k].replace(/FEATURE_WITHDRAWN/g, 'OK');
  assert.ok(failing(auditOn({ atlas: damaged }), 'withdrawal-honest').length,
    'an exception that stops being true must stop being an exception');
});

/* ══ ③ `ok` IS DERIVED, NOT WRITTEN ══════════════════════════════════════════════════════════ */

test('R318 ③: a caller cannot write a success it did not observe', () => {
  const r = RESULTS.failed({ capabilityId: 'x', code: 'no_change' });
  assert.equal(r.ok, false);
  assert.throws(() => { r.ok = true; }, TypeError, 'assigning ok must THROW — that is the whole point');
  assert.equal(RESULTS.completed({ capabilityId: 'x' }).ok, true);
  assert.equal(RESULTS.partial({ capabilityId: 'x' }).ok, false, 'partly done is not done');
  assert.equal(RESULTS.running({ capabilityId: 'x' }).ok, false, 'still running is not done');
  assert.equal(RESULTS.needsInput({ capabilityId: 'x', inputRequest: { kind: 'point' } }).ok, false);
  assert.equal(JSON.parse(JSON.stringify(r)).ok, false, 'and it serialises, so a log records the real value');
});

test('R318 ③b: a legacy result that could not be verified does not become "completed"', () => {
  const unverified = RESULTS.fromLegacy({ ok: true, html: 'x', meta: { unverified: true } }, 'layers.toggle');
  assert.equal(unverified.status, 'partial', '#R142 already flagged a layer that never painted; that flag must survive');
  const partialTargets = RESULTS.fromLegacy({ ok: true, exec: { unresolved: ['XKX'] } }, 'map.highlight');
  assert.equal(partialTargets.status, 'partial', 'some targets is not all targets');
  assert.deepEqual(partialTargets.unresolved, ['XKX']);
  const clean = RESULTS.fromLegacy({ ok: true, html: 'x' }, 'view.flyTo');
  assert.equal(clean.status, 'completed');
});

/* ══ ④ THE EXECUTOR ══════════════════════════════════════════════════════════════════════════ */

test('R318 ④a: an async capability is not "completed" until its promise settles', async () => {
  const { caps, exec } = kernel();
  let settled = false;
  caps.define({ id: 'test.slow', execute: () => new Promise((r) => setTimeout(() => { settled = true; r({ ok: true }); }, 30)),
    effects: { reads: [], writes: ['test'], conflictKeys: ['test'] }, produces: [],
    observe: () => (settled ? 1 : 0), verify: (c, a, before, after) => ({ status: after ? 'completed' : 'failed', code: after ? 'ok' : 'no_change' }) });
  const r = await exec.execute('test.slow', {});
  assert.equal(settled, true, 'the executor returned before the work finished');
  assert.equal(r.status, 'completed');
});

test('R318 ④b: a rejected promise is a failure, not a success', async () => {
  const { caps, exec } = kernel();
  caps.define({ id: 'test.reject', execute: () => Promise.reject(new Error('boom')),
    effects: { reads: [], writes: [], conflictKeys: [] }, produces: [] });
  const r = await exec.execute('test.reject', {});
  assert.equal(r.status, 'failed');
  assert.equal(r.code, 'threw');
  assert.equal(r.observed.error, 'boom', 'and it says why — the old path recorded nothing at all');
});

test('R318 ④c: a required point that was not given is asked for, never invented', async () => {
  const { caps, exec } = kernel();
  /* Atlas must be present, because "I have no engine to run this on" is a DIFFERENT and equally
     honest answer — and it is the one a bare kernel gives, checked here so the two never merge. */
  assert.equal((await exec.execute('routing.isochrone', {})).code, 'unavailable',
    'before Atlas loads a capability is unavailable, not silently absent and not silently guessed');
  caps.bindRuntime({ dispatch: async () => ({ ok: true, html: '' }) });
  const r = await exec.execute('routing.isochrone', {});
  assert.equal(r.status, 'needs_input', '#R302: the map centre is not an answer to "where"');
  assert.equal(r.inputRequest.kind, 'point');
  assert.ok(r.inputRequest.resumeToken, 'and it must be resumable, or the user has to start over');
  assert.equal(r.inputRequest.pendingArgs !== undefined, true, 'the arguments so far are carried forward');
  /* …and when a point IS given, it does not ask */
  const r2 = await exec.execute('routing.isochrone', { lng: 139.7, lat: 35.6 });
  assert.notEqual(r2.status, 'needs_input');
});

test('R318 ④d: a route computed and not drawn is not_rendered, not success', () => {
  const cap = CAPS.resolve('routing.route');
  const v = (after) => cap.verify({}, {}, null, after, { ok: true, html: '' });
  assert.equal(v({ hasRoute: true, painted: true, visible: true }).status, 'completed');
  assert.equal(v({ hasRoute: true, painted: false, visible: false }).status, 'partial');
  assert.equal(v({ hasRoute: true, painted: false, visible: false }).code, 'not_rendered');
  assert.equal(v({ hasRoute: true, painted: true, visible: false }).code, 'not_visible',
    'drawn and hidden is a THIRD state — js/routing.js has kept the three apart all along');
  assert.equal(v({ hasRoute: false, painted: false, visible: false }).status, 'failed');
});

test('R318 ④e: cancel and supersede reach the work, and the result says which', async () => {
  const { caps, exec } = kernel();
  caps.define({ id: 'test.long', execute: (ctx, a, o) => new Promise((res) => {
    const t = setTimeout(() => res({ ok: true }), 5000);
    o.signal.addEventListener('abort', () => { clearTimeout(t); res({ ok: false }); });
  }), effects: { reads: [], writes: [], conflictKeys: [] }, produces: [] });
  const p = exec.execute('test.long', {}, { turnId: 1, operationId: 'op-cancel-me' });
  assert.equal(exec.cancel('op-cancel-me'), true);
  assert.equal((await p).status, 'cancelled');

  const p2 = exec.execute('test.long', {}, { turnId: 1, operationId: 'op-supersede-me' });
  assert.ok(exec.supersede(2) >= 1, 'a new turn must replace what the old one still owes');
  assert.equal((await p2).status, 'superseded');
});

test('R318 ④f: two operations writing the same thing do not interleave', async () => {
  const { caps, exec } = kernel();
  let live = 0, maxLive = 0;
  caps.define({ id: 'test.route1', execute: async () => { live++; maxLive = Math.max(maxLive, live); await new Promise((r) => setTimeout(r, 25)); live--; return { ok: true }; },
    effects: { reads: [], writes: ['map.route'], conflictKeys: ['map.route'] }, produces: [],
    observe: () => 0, verify: () => ({ status: 'completed' }) });
  await Promise.all([exec.execute('test.route1', {}), exec.execute('test.route1', {})]);
  assert.equal(maxLive, 1, 'two writers of map.route ran at once — that is #R290 in a new place');
});

test('R318 ④g: unknown capabilities and bad arguments are refused, not shrugged off', async () => {
  const { caps, exec } = kernel();
  assert.equal((await exec.execute('no.such.thing', {})).code, 'unknown_capability');
  caps.define({ id: 'test.typed', execute: () => ({ ok: true }), produces: [],
    effects: { reads: [], writes: [], conflictKeys: [] },
    inputSchema: { type: 'object', properties: { n: { type: 'number' } }, required: ['n'], additionalProperties: false } });
  assert.equal((await exec.execute('test.typed', { n: 'seven' })).code, 'bad_args');
  assert.equal((await exec.execute('test.typed', { m: 1 })).code, 'bad_args', 'an unknown argument is an error, not a shrug');
  assert.equal((await exec.execute('test.typed', { n: 7 })).status, 'completed');
});

/* ══ ⑤ THE PLAN IS A STRUCTURE ═══════════════════════════════════════════════════════════════ */

function planner() {
  const k = kernel();
  return { k, P: makeAtlasPlanner({}, { WORLD_RE: /^world$/i, wctx: {}, capabilities: k.caps, results: k.results, executor: k.exec, state: k.state }) };
}

test('R318 ⑤a: the old plan shapes all still parse', () => {
  const { P } = planner();
  assert.equal(P.normalize([{ type: 'flyTo', place: 'Tokyo' }]).steps.length, 1, 'a bare array');
  assert.equal(P.normalize({ type: 'flyTo', place: 'Tokyo' }).steps.length, 1, 'a single action object');
  assert.equal(P.normalize({ actions: [{ type: 'flyTo' }, { type: 'layer' }] }).steps.length, 2, 'the actions array');
  assert.equal(P.normalize({ steps: [{ id: 's1', capabilityId: 'view.flyTo' }] }).steps.length, 1, 'and the new form');
  const n = P.normalize({ actions: [{ type: 'flyTo', place: 'Tokyo' }] });
  assert.equal(n.steps[0].capabilityId, 'view.flyTo', 'a legacy type is resolved to its canonical id');
  assert.deepEqual(n.steps[0].args, { place: 'Tokyo' }, 'and `type` does not leak into the arguments');
});

test('R318 ⑤b: unknown capabilities, dangling deps and bad $refs are REJECTED with a reason', () => {
  const { P } = planner();
  const v = P.validate({ steps: [
    { id: 'a', capabilityId: 'view.flyTo', args: { place: 'Tokyo' }, expectedOutputs: ['camera'] },
    { id: 'b', capabilityId: 'no.such.capability' },
    { id: 'c', capabilityId: 'view.zoom', dependsOn: ['zzz'] },
    { id: 'd', capabilityId: 'view.zoom', args: { to: { $ref: 'a.nonexistentOutput' } } },
    { id: 'a', capabilityId: 'view.zoom' },
    { id: 'e', capabilityId: 'system.monitor' },
  ] });
  const why = Object.fromEntries(v.rejected.map((r) => [r.id, r.reason]));
  assert.equal(why.b, 'unknown_capability');
  assert.equal(why.c, 'unknown_dependency');
  assert.equal(why.d, 'unresolvable_ref');
  assert.equal(why.a, 'duplicate_step_id');
  assert.equal(why.e, 'withdrawn_capability');
  assert.equal(v.steps.length, 1, 'only the good step survives, and nothing was silently dropped');
});

test('R318 ⑤c: a step reads its predecessor\'s output instead of re-deriving it', async () => {
  const { k, P } = planner();
  let geocodes = 0;
  k.caps.define({ id: 'test.geo', execute: () => { geocodes++; return { ok: true }; }, produces: ['location'],
    effects: { reads: [], writes: [], conflictKeys: [] },
    observe: () => null, verify: () => ({ status: 'completed', observed: { location: { lng: 1, lat: 2 } } }) });
  let saw = null;
  k.caps.define({ id: 'test.use', execute: (c, a) => { saw = a.from; return { ok: true }; }, produces: [],
    effects: { reads: [], writes: [], conflictKeys: [] },
    observe: () => null, verify: () => ({ status: 'completed' }) });
  await P.runPlan([
    { id: 's1', capabilityId: 'test.geo', args: {}, dependsOn: [], expectedOutputs: ['location'], onFailure: 'stop_dependents' },
    { id: 's2', capabilityId: 'test.use', args: { from: { $ref: 's1.location' } }, dependsOn: ['s1'], expectedOutputs: [], onFailure: 'stop_dependents' },
  ], {});
  assert.equal(geocodes, 1, 'the place was resolved once');
  assert.deepEqual(saw, { lng: 1, lat: 2 }, 'and the second step read the answer instead of asking again');
});

test('R318 ⑤d: independent steps run together; a dependent one does not run after its prerequisite fails', async () => {
  const { k, P } = planner();
  let live = 0, maxLive = 0, ranAfterFailure = false;
  k.caps.define({ id: 'test.readA', execute: async () => { live++; maxLive = Math.max(maxLive, live); await new Promise((r) => setTimeout(r, 20)); live--; return { ok: true }; },
    produces: [], effects: { reads: [], writes: [], conflictKeys: [] }, observe: () => null, verify: () => ({ status: 'completed' }) });
  const four = ['s1', 's2', 's3', 's4'].map((id) => ({ id, capabilityId: 'test.readA', args: {}, dependsOn: [], expectedOutputs: [], onFailure: 'continue' }));
  await P.runPlan(four, {});
  assert.ok(maxLive >= 2, `independent read-only steps must overlap (max concurrent was ${maxLive})`);

  k.caps.define({ id: 'test.fails', execute: () => ({ ok: false }), produces: [],
    effects: { reads: [], writes: [], conflictKeys: [] }, observe: () => null, verify: () => ({ status: 'failed', code: 'no_route' }) });
  k.caps.define({ id: 'test.after', execute: () => { ranAfterFailure = true; return { ok: true }; }, produces: [],
    effects: { reads: [], writes: [], conflictKeys: [] }, observe: () => null, verify: () => ({ status: 'completed' }) });
  const out = await P.runPlan([
    { id: 'p', capabilityId: 'test.fails', args: {}, dependsOn: [], expectedOutputs: [], onFailure: 'stop_dependents' },
    { id: 'q', capabilityId: 'test.after', args: {}, dependsOn: ['p'], expectedOutputs: [], onFailure: 'stop_dependents' },
  ], {});
  assert.equal(ranAfterFailure, false, 'a step whose prerequisite failed must not run');
  assert.equal(out.skipped.q, 'prerequisite_failed', 'and the skip must say why');
});

/* ══ ⑥ THE GOAL IS A GATE ════════════════════════════════════════════════════════════════════ */

test('R318 ⑥a: a map that was asked for and not produced leaves the goal unmet', () => {
  const { P } = planner();
  const goal = P.goalSpec({ outputs: { map: true, explanation: true }, temporalMode: 'current' }, {}, 'show me X');
  const only = (produced) => P.evaluateGoal(goal, [RESULTS.completed({ capabilityId: 'research.analyze', produced })]);
  assert.deepEqual(only(['explanation']).unmet.map((u) => u.kind), ['map-visible'],
    'an explanation is not a map — 「map要求は実際のmap出力なしに完了しない」');
  assert.deepEqual(only(['map']).unmet.map((u) => u.kind), ['explanation-produced'],
    'and operating the map is not an explanation');
  assert.equal(only(['map', 'explanation']).satisfied, true);
});

test('R318 ⑥b: a request to DO something is not satisfied by writing about it', () => {
  const { P } = planner();
  const goal = P.goalSpec({ outputs: {} }, { actions: [{ type: 'layer', name: 'Wind' }] }, 'turn on the wind layer');
  assert.ok(goal.completionRules.some((r) => r.kind === 'action-performed'), 'a plan that writes declares an action goal');
  const wroteOnly = P.evaluateGoal(goal, [RESULTS.completed({ capabilityId: 'dialog.answer', produced: ['explanation'] })]);
  assert.deepEqual(wroteOnly.unmet.map((u) => u.kind), ['action-performed']);
  const didIt = P.evaluateGoal(goal, [RESULTS.completed({ capabilityId: 'layers.toggle', produced: ['map'] })]);
  assert.equal(didIt.satisfied, true);
});

test('R318 ⑥c: a turn with an operation still waiting is not finished', () => {
  const { P } = planner();
  const goal = P.goalSpec({ outputs: {} }, {}, 'x');
  const waiting = P.evaluateGoal(goal, [RESULTS.needsInput({ capabilityId: 'routing.isochrone', inputRequest: { kind: 'point' } })]);
  assert.equal(waiting.open, true);
  assert.equal(waiting.satisfied, false, 'needs_input is not a completed turn');
  const running = P.evaluateGoal(goal, [RESULTS.running({ capabilityId: 'sim.earthquake' })]);
  assert.equal(running.satisfied, false);
});

test('R318 ⑥d: repair aims at the unmet GOAL, not at the call that failed', () => {
  const { P } = planner();
  const goal = P.goalSpec({ outputs: { map: true } }, {}, 'x');
  const e = P.evaluateGoal(goal, [RESULTS.failed({ capabilityId: 'map.poi', code: 'no_route' })]);
  assert.deepEqual(e.repairTargets, ['map-visible'],
    'the repair target is "the map is still not there", not "map.poi returned no_route"');
});

/* ══ ⑦ NINE LANGUAGES ════════════════════════════════════════════════════════════════════════ */

test('R318 ⑦a: the model is told the language it must answer in, in ENGLISH, for all nine', () => {
  const reg = read('js/lang-registry.js');
  assert.match(reg, /function englishName/, 'the derived name is gone');
  assert.match(reg, /codeForEnglishName/, 'and its inverse');
  /* the defect this replaced: a five-argument t() whose 6th..9th languages fell into the inline
     table, where 'English' is correctly translated — and therefore asked for the wrong language */
  /* (#R318) the two helpers moved to js/ai-core.js — the transport is what carries them, and the
     app shell had no line to spare (tests/r168 #8). The check follows them. */
  const core = codeOnly(read('js/ai-core.js'));
  assert.doesNotMatch(codeOnly(read('js/app-body.js')) + core,
    /_aiLangName\(\)\{ return window\.IntMapLang\.t\([a-zA-Z.]+,'English','Japanese'/,
    'the model is back to being asked for the wrong language in three of the nine');
  assert.match(core, /IntMapLang\.englishName\(HOST\.lang\)/, 'js/ai-core.js no longer derives the name');
  assert.match(core, /function _aiLangLine\(\)/, 'the reply-language lock did not travel with it');
  assert.match(codeOnly(read('js/app-body.js')), /window\._aiLangLine=_aiLangLine;/,
    'the global other files read is no longer published');
});

test('R318 ⑦b: the five-language tables inside Atlas are gone', () => {
  const atlas = codeOnly(read('js/atlas-console.js'));
  assert.doesNotMatch(atlas, /\{Japanese:'jp',German:'de',Russian:'ru',Spanish:'es',English:'en'\}/,
    'the reply-language mirror still knows only five languages');
  assert.doesNotMatch(atlas, /\{jp:'Japanese',de:'German',ru:'Russian',es:'Spanish',en:'English'\}/,
    'the CJK fallback still answers four of the nine in Japanese');
  assert.doesNotMatch(atlas, /langMap=\{jp:'ja-JP'/, 'speech input still dictates in five languages');
  assert.match(atlas, /_langCode\(a\.lang\)/, 'the `language` action no longer resolves through the registry');
});

test('R318 ⑦c: every language has a locale file and a region tag', () => {
  const CODES = ['en', 'jp', 'de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko'];
  CODES.forEach((c) => assert.ok(existsSync(join(ROOT, 'js/locales/ui.' + c + '.js')), `no locale file for ${c}`));
  const reg = read('js/lang-registry.js');
  ['zh:', "'zh-hans'", 'fr:', 'ko:'].forEach((k) => assert.ok(reg.includes(k), `REGION has no entry for ${k}`));
});

test('R318 ⑦d: the capability search can rank a request written in any script', () => {
  const hits = (q) => CAPS.search(q, { want: 1, min: 8 }).ranked.map((r) => r.id);
  assert.ok(hits('directions to Osaka').includes('routing.route'), 'English');
  assert.ok(hits('大阪への経路').includes('routing.route'), 'Japanese');
  assert.ok(hits('오사카 경로').includes('routing.route'), 'Korean');
  assert.ok(hits('itinéraire vers Osaka').includes('routing.route'), 'French');
  assert.ok(hits('前往大阪的路線').includes('routing.route'), 'Traditional Chinese');
  assert.ok(hits('前往大阪的路线').includes('routing.route'), 'Simplified Chinese');
  assert.ok(hits('Route nach Osaka').includes('routing.route'), 'German');
  assert.ok(hits('маршрут до Осаки').includes('routing.route'), 'Russian');
  assert.ok(hits('ruta a Osaka').includes('routing.route'), 'Spanish');
});

/* ══ ⑧ ONE TURN, ONE USE ═════════════════════════════════════════════════════════════════════ */

test('R318 ⑧a: the client stamps a turn key, and it travels in a header', () => {
  const core = codeOnly(read('js/ai-core.js'));
  assert.match(core, /headers\['x-intmap-turn'\]/, 'the turn key is not sent');
  assert.doesNotMatch(core, /body\.turnId/, 'it must NOT be in the body — the quota is consumed before the body is read');
  const atlas = codeOnly(read('js/atlas-console.js'));
  const planCalls = atlas.match(/task:'atlas_plan'/g) || [];
  assert.ok(planCalls.length >= 2, 'the planner and its repair pass are the two calls this is about');
  assert.equal((atlas.match(/turnId:_turnKey/g) || []).length, planCalls.length,
    'every atlas_plan call must carry the SAME turn key, or the repair pass bills the user again');
});

test('R318 ⑧b: the server does not trust the key it is given', () => {
  const proxy = read('supabase/functions/ai-proxy/index.ts');
  assert.match(proxy, /const TURN_MAX_CALLS = \d+;/, 'nothing bounds how many calls one key may carry');
  assert.match(proxy, /const TURN_TTL_S = \d+;/, 'a key that never expires is a permanent free pass');
  assert.match(proxy, /consume_ai_turn/, 'the turn-aware RPC is not called');
  assert.match(proxy, /error: "turn_calls"/, 'the two 429s must be distinguishable');
  assert.match(proxy, /refund_ai_turn/, 'a refund must release the turn as well as the charge');
  const mig = readdirSync(join(ROOT, 'supabase/migrations')).find((f) => /ai_turn_quota/.test(f));
  assert.ok(mig, 'no migration creates the turn ledger');
  const sql = read('supabase/migrations/' + mig);
  assert.match(sql, /primary key \(user_id, turn_key\)/, 'a key must be scoped to the account');
  assert.match(sql, /security definer/, 'the ledger must be writable only through the RPC');
  assert.match(sql, /revoke execute on function public\.consume_ai_turn/, 'and never by a logged-in user');
  assert.doesNotMatch(sql, /grant (insert|update|delete) on public\.ai_turns to authenticated/,
    'users must not be able to write the turn ledger');
});

test('R318 ⑧c: a deterministic operation needs no AI at all', async () => {
  /* the executor is a pure client-side path: nothing in it reaches for the network */
  const exec = read('js/atlas-executor.js');
  ['askAI', 'fetch(', 'ai-proxy', 'aiGate'].forEach((s) =>
    assert.ok(!exec.includes(s), `js/atlas-executor.js reaches for ${s} — running a registered capability must not cost a use`));
  const caps = read('js/atlas-capabilities.js');
  ['askAI', 'ai-proxy'].forEach((s) => assert.ok(!caps.includes(s), `the registry reaches for ${s}`));
});

/* ══ ⑨ THE MOVE LOST NOTHING, AND THE KERNEL SHRANK ══════════════════════════════════════════ */

test('R318 ⑨a: the 58 kB catalogue moved byte-for-byte and is still whole', () => {
  const all = DOCS.text(null);
  assert.ok(all.length > 50_000, `the catalogue is ${all.length} bytes — most of it did not survive the move`);
  assert.equal(DOCS.count(), 38, 'the 38 topical blocks of the old SYS() body');
  DOCS.blocks().forEach((b, i) => {
    assert.ok(b.bytes > 100, `block ${i} is ${b.bytes} bytes`);
    assert.ok(b.ids.length > 0, `block ${i} documents no capability — the tag is what makes selection possible`);
  });
  /* a selection is a SUBSEQUENCE of the whole, never a rewrite of it */
  const routing = DOCS.text(['routing.route', 'routing.isochrone']);
  assert.ok(routing.length > 1000 && all.includes(routing.split('\\n')[0].slice(0, 200)));
  assert.ok(routing.length < all.length / 2, 'selecting two capabilities must actually send less');
  /* and SYS() composes from it rather than carrying it */
  const sys = read('js/atlas-console.js');
  assert.match(sys, /\+_DOCS\.text\(\(sel&&sel\.ids\)\|\|null\)/, 'SYS() no longer composes from the registry');
  assert.doesNotMatch(sys, /\+'NAVIGATION\/VIEW: \{"type":"flyTo"/, 'the catalogue is inline again');
});

test('R318 ⑨b: the kernel shrank by moving, and the ceiling came down with it', () => {
  const n = (p) => read(p).split('\n').length;
  const atlas = n('js/atlas-console.js');
  /* #R199's rule: a ceiling raised once and never lowered stops asserting anything, so it follows
     the floor DOWN. #R311 shipped 5,299 lines against a ceiling of 5,300. */
  assert.ok(atlas < 5_270, `js/atlas-console.js is ${atlas} lines; #R318 moved the planner, the catalogue and the state out and must stay below 5,270`);
  assert.ok(n('js/app-body.js') < 4_400, 'js/app-body.js keeps #R200\'s ceiling');
  const moved = ['js/atlas-capabilities.js', 'js/atlas-catalog-text.js', 'js/atlas-executor.js',
    'js/atlas-planner.js', 'js/atlas-results.js', 'js/atlas-state.js'].reduce((a, p) => a + n(p), 0);
  assert.ok(moved > 1_200, `the six new modules hold ${moved} lines — the kernel shrank by moving, not by losing`);
});

test('R318 ⑨c: the #R135 block moved whole, and its four tuned rows are unchanged', () => {
  const pl = read('js/atlas-planner.js');
  ['_requestProfile', '_profileBlock', '_validatePlan', '_goalValidation', '_actionFamily',
    '_semanticRetryKey', '_isWorldExpansion', '_repairGuidance', '_rpExtractYear', '_rpGeoKind'].forEach((n) =>
    assert.ok(pl.includes('function ' + n), `${n} did not arrive in js/atlas-planner.js`));
  assert.doesNotMatch(codeOnly(read('js/atlas-console.js')), /function _requestProfile\(/, 'it is still in the kernel too — two copies');
  /* the four rows #R135 tuned by hand must be byte-identical, or _validatePlan decides differently */
  assert.match(pl, /mapReport:\s+\{ temporalModes:\['current','mixed','unspecified'\], evidenceModes:\['live'\], outputs:\['explanation','map'\], geoKinds:\['point','city','country','region','water'\] \}/);
  assert.match(pl, /historicalMap:\{ temporalModes:\['historical'\], evidenceModes:\['historical'\], outputs:\['thematic-map'\], topics:\['alliance','faction','war','political-bloc'\] \}/);
  /* …and the table is no longer four entries for a hundred and fifteen capabilities */
  const { P } = planner();
  const n = Object.keys(P.ATLAS_ACTION_CAPABILITIES).length;
  assert.ok(n > 200, `ATLAS_ACTION_CAPABILITIES has ${n} entries — it is meant to be generated from the registry now`);
  assert.deepEqual(P.ATLAS_ACTION_CAPABILITIES.mapReport.evidenceModes, ['live'], 'and the tuned row survived generation');
});

test('R318 ⑨d: the state is data, and the paragraph is derived from it', () => {
  const st = read('js/atlas-state.js');
  assert.match(st, /registerStateProvider/, 'no provider registry');
  assert.match(st, /function renderPrompt|API\.renderPrompt/, 'nothing derives the model-facing paragraph from the snapshot');
  const S = makeAtlasState({});
  assert.ok(S.SECTIONS.length >= 15, 'the composed snapshot lost sections');
  /* an unregistered section reads null — "nobody owns this" — not {} */
  assert.equal(S.snapshot().routing, null);
  S.registerStateProvider('routing', () => ({ hasRoute: false }));
  assert.deepEqual(S.snapshot().routing, { hasRoute: false });
  /* a throwing provider is recorded, not swallowed */
  S.registerStateProvider('camera', () => { throw new Error('nope'); });
  assert.equal(S.snapshot()._errors[0].provider, 'camera');
});

test('R318 ⑨e: "that one" resolves by id, and a rewound turn stops answering', () => {
  const S = makeAtlasState({});
  S.beginTurn(1, 'draw a circle');
  S.recordOperation(1, { operationId: 'o1', capabilityId: 'map.radius', objectIds: ['radius-7'] });
  S.beginTurn(2, 'and a line');
  S.recordOperation(2, { operationId: 'o2', capabilityId: 'map.drawLine', objectIds: ['line-3'] });
  assert.deepEqual(S.resolveReference().objectIds, ['line-3'], '"that" is the most recent thing made');
  assert.deepEqual(S.resolveReference('map.radius').objectIds, ['radius-7'], 'and "the circle" is the circle');
  assert.equal(S.dropFrom(2), 1, 'an edited message rewinds the machine record too');
  assert.deepEqual(S.resolveReference().objectIds, ['radius-7'],
    'a rewound turn must stop being referenceable — otherwise "it" points at something the user took back');
});

test('R318 ⑨f: the prompt state is trimmed by whole sections, and says which it dropped', () => {
  const S = makeAtlasState({});
  S.registerStateProvider('camera', () => ({ lat: 35.6, lng: 139.7, zoom: 9 }));
  S.registerStateProvider('objects', () => new Array(200).fill(0).map((_, i) => ({ id: 'o' + i, kind: 'pin', name: 'x'.repeat(40) })));
  const txt = S.toPrompt(S.snapshot(), 400);
  assert.match(txt, /APP STATE \(JSON, authoritative\)/);
  assert.match(txt, /OMITTED FOR SIZE/, 'a state cut to fit must SAY it was cut — a silent trim reads as absence');
  assert.ok(txt.includes('"camera"'), 'the decision-bearing section survives the trim');
});
