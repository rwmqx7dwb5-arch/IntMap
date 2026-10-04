/* ============================================================================
 *  js/atlas-capabilities.js — the registry, the executor, and what Atlas can reach
 * ----------------------------------------------------------------------------
 *  The one list and its audit made to go red (#R318), the ranked and counted fallbacks (#R320), the
 *  removals made permanent (#R406, #R475), the index Atlas sees when it decides (#R582), search
 *  ranking (#R727, #R728), every declared argument reaching dispatch (#R783) and the confirm and
 *  ingests columns (#R801).
 *
 *  Consolidated from the round files named in each section banner below. Every test keeps the title
 *  it had there (untagged titles now carry the round they came from, #R<N>), and every section keeps
 *  its own history comment: why the check exists and what was measured. Each section is its own
 *  block, so its helpers stay its own; what every section shared (the repository root) is declared
 *  once below the imports.
 *
 *  Checks that used to READ a file for a spelling and can be RUN were rewritten to run the shipped
 *  code; the ones that still read say, in one line, why running is not possible (「read, not run: …」).
 * ==========================================================================*/
import { aiProxySource } from './helpers/ai-proxy-source.mjs';
/* (atlas-core-split) the task registry, evaluated — what a task is, is each tasks/<task>.ts */
const { TASKS } = await import('../supabase/functions/ai-proxy/tasks/index.ts');
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { join, dirname, resolve } from 'node:path';
import { LAZY_REGISTRY, LAZY_NAMES } from '../js/lazy-modules.js';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { declaredCapabilityIds } from './helpers/atlas-registry.mjs';
import { makeAtlasCapabilities } from '../js/atlas-capabilities.js';
import { parse } from 'acorn';
import { liftFunction } from './helpers/lift-function.mjs';
import { importModule, langRegistry } from './helpers/import-module.mjs';

/* the repository root, shared by every section below (each used to derive its own) */
const ROOT = fileURLToPath(new URL('../', import.meta.url));

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r318-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R318 — the Atlas control kernel: registry, executor, results, state, audit
 * ----------------------------------------------------------------------------
 *  The round's claim is that Atlas now decides "done" by WATCHING THE APP rather than by believing
 *  a function that returned. These are the checks that make that claim falsifiable:
 *
 *    ① the registry is the one list, and it covers the dispatch exactly
 *    ② the twenty-two audit checks can each be made to go RED (a gate never seen red proves nothing)
 *    ③ `ok` cannot be written — it is derived from `status`
 *    ④ the executor awaits, observes, verifies, refuses to invent a target, cancels and supersedes
 *    ⑦ the nine languages reach the same capability, and the model is told the right one
 *    ⑧ one user turn costs one use — in the client, the proxy and the database
 *    ⑨ the catalogue is still whole and still reachable, and the kernel shrank by moving
 *
 *  ⚠ ⑤ (the plan structure) and ⑥ (the goal gate) are gone: #R406 deleted js/atlas-planner.js —
 *  the regular expressions that decided what a sentence MEANT, and a dependency-graph executor
 *  production never called. The turn is a tool-calling loop now (tests/r406-agent.test.mjs).
 * ==========================================================================*/

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const lines = (p) => read(p).split(/\r?\n/);

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
const { makeAtlasResults } = await import('../js/atlas-results.js');
const { makeAtlasState } = await import('../js/atlas-state.js');
const { installAtlasKernel } = await import('../js/atlas-executor.js');
const { auditWith, dispatchGroups, kernelLines } = await import('../scripts/atlas-capability-audit.mjs');

const CAPS = makeAtlasCapabilities({});
const DOCS = makeAtlasCatalogText({}, {});
const RESULTS = makeAtlasResults({});
/* (#R406) the argument schemas, loaded EXACTLY the way scripts/atlas-capability-audit.mjs loads
   them: a missing module yields `null`, which is what makes its `argument-schemas` check red
   rather than making the whole audit unrunnable. Loading it differently here would mean the test
   and the gate audit different inputs. */
const SCHEMAS = await (async () => {
  try { return (await import('../js/atlas-schemas.js')).makeAtlasSchemas(); } catch (_) { return null; }
})();

/* a kernel wired for tests: real modules, stub capabilities */
function kernel() {
  /* the same door the app uses — js/atlas-executor.js exports nothing else, on purpose: two
     executors would mean two operation registries and two conflict locks (tests/r175 ③). */
  const OS = {};
  return installAtlasKernel(OS, {}, { capabilities: makeAtlasCapabilities({}) });
}

/* ══ ① THE REGISTRY IS THE ONE LIST ══════════════════════════════════════════════════════════ */

test('R318 ①a: every live dispatch spelling resolves to a canonical capability', () => {
  const groups = dispatchGroups();   /* (atlas-capability-modules) one group per capability entry — what the dispatch's lookup reads */
  assert.ok(groups.length >= 110, `only ${groups.length} dispatch groups found — the entries moved and this test would pass on nothing`);
  /* (atlas-one-declaration) a case carries one spelling now; the others reach it through the row that declares them, so the
     spellings the dispatch answers are the labels plus every declared spelling the dispatch's own resolver sends to one of them */
  const labels = groups.flatMap((g) => g.names), live = new Set(labels);
  const spellings = labels.concat(CAPS.all().flatMap((c) => (c.legacy ? c.aliases.filter((a) => a !== c.legacy && live.has(CAPS.dispatchName(a))) : [])));
  assert.ok(spellings.length >= 200, `only ${spellings.length} spellings — the parser is reading the wrong thing`);
  const unresolved = spellings.filter((n) => !CAPS.resolve(n));
  assert.deepEqual(unresolved, [], 'these dispatch spellings belong to no capability');
});

test('R318 ①b: the registry adds nothing that cannot run, and misses nothing that can', () => {
  const groups = dispatchGroups();
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

test('R318 ①d: a lazy capability is discoverable before its module exists', async () => {
  /* the loader is replaced by a recorder for the length of this test and put back after, so the other
     checks in this file see the window they always saw (consolidation — this file used to run alone). */
  const hadLazy = window.IntMapLazy; const asked = [];
  window.IntMapLazy = { need: async (m) => { asked.push(m); } };
  try {
    /* building the registry and reading every descriptor fetches nothing — descriptors exist before code does */
    const fresh = makeAtlasCapabilities({});
    const covered = new Set(DOCS.idsCovered());
    const lazy = fresh.all().filter((c) => c.lazyModules.length);
    assert.ok(lazy.length >= 8, `only ${lazy.length} lazy capabilities — the table lost its lazyModules column`);
    lazy.forEach((c) => {
      assert.ok(covered.has(c.id) || c.withdrawn, `${c.id} needs ${c.lazyModules.join(',')} and is not in the catalogue`);
    });
    assert.deepEqual(asked, [], 'the registry must not fetch a module — descriptors exist before code does');
    /* and the module is asked for at EXECUTION, never at planning: RUN through the executor */
    const { caps, exec } = kernel();
    let ranAfter = null;
    caps.define({ id: 'test.lazy', lazyModules: ['modA', 'modB'], execute: () => { ranAfter = asked.slice(); return { ok: true }; },
      effects: { reads: [], writes: [], conflictKeys: [] }, produces: [] });
    await exec.execute('test.lazy', {});
    assert.deepEqual(ranAfter, ['modA', 'modB'], 'the executor no longer resolves lazy modules itself, before the capability runs');
  } finally { if (hadLazy === undefined) delete window.IntMapLazy; else window.IntMapLazy = hadLazy; }
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
    atlas: kernelLines(),   /* (atlas-capability-modules) the kernel is js/atlas-console.js and its capability modules */
    groups: dispatchGroups(),
    controls: read('js/atlas-controls.js'),
    capSrc: read('js/atlas-capabilities.js'),
    execSrc: read('js/atlas-executor.js'),
    stateSrc: read('js/atlas-state.js'),
    resultsSrc: read('js/atlas-results.js'),
    toolsSrc: read('js/atlas-toolsurface.js'),
    schemas: SCHEMAS,
  }, over));
}
const failing = (checks, id) => (checks.find((c) => c.id === id) || { failures: [] }).failures;

test('R318 ②a: the audit is green on the tree as it stands, except where it is honestly red', () => {
  const checks = auditOn({});
  /* ⚠ (#R802) THE SAME NUMBER LIVES IN tests/r320-checks.test.mjs ④, and this round moved only that
     copy first — CI found this one. It is a guard, not a policy ([[intmap-ceiling-guards-are-not-policies]]):
     it exists so a check that quietly stops running is noticed, and it moves when one is deliberately added.
     #R406 added argument-schemas and required-arguments; #R802 added catalogue-subject, which asks of every
     capability whether its own catalogue block says what it is ABOUT — measured on production that round,
     「天気予報」 reached nothing because js/atlas-catalog-text.js carried the word 「天気」 zero times. */
  assert.equal(checks.length, 23, 'a capability check was added or lost');
  const red = checks.filter((c) => c.failures.length).map((c) => c.id);
  assert.deepEqual(red, [], 'these capability checks are failing:\n' + JSON.stringify(checks.filter((c) => c.failures.length), null, 1));
});

test('R318 ②b: it goes red on an unreachable dispatch label', () => {
  /* (atlas-capability-modules) js/atlas-caps.js refuses a second entry for one spelling at load, so the defect is
     handed to the audit as DATA — the check must still name it if the groups ever carry it */
  const damaged = dispatchGroups().slice();
  const i = damaged.findIndex((g) => g.names.includes('flyTo'));
  assert.ok(i >= 0, 'the flyTo entry moved');
  damaged.splice(i + 1, 0, { names: ['flyTo'], id: 'view.flyTo', file: '(fixture)', line: '(fixture)', src: 'return 1;' });
  assert.ok(failing(auditOn({ groups: damaged }), 'alias-coverage').length,
    'a second case for a spelling an earlier case already claims is dead code and must be reported');
});

test('R318 ②c: it goes red on a capability Atlas is never told about', () => {
  const caps = makeAtlasCapabilities({});
  caps.define({ id: 'test.invisible', legacy: 'flyTo', aliases: ['flyTo'], execute: () => ({ ok: true }),
    produces: [], effects: { reads: [], writes: [], conflictKeys: [] } });
  /* (#R406) the check was `planner-discoverable`; the planner is gone and the three ways to reach a
     capability are a catalogue block find_capability can return, a seat in the core tool surface,
     or the always-sent rules. This one has none of them. */
  assert.ok(failing(auditOn({ caps }), 'atlas-discoverable').length,
    'a capability nothing documents and no tool carries is unreachable — the #R278 defect');
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
  /* (monitors-retire) The witness was the area monitors' entry, whose run answered FEATURE_WITHDRAWN; the
     feature is removed and no capability is withdrawn today. The rule is the audit's, not that entry's,
     so the withdrawal is now a FIXTURE: a registry that withdraws one spelling with a proof code, and a
     dispatch entry for it — once carrying the proof (green), once answering success (red). */
  const retired = { id: 'test.retired', legacy: 'retired', withdrawn: { why: 'a fixture withdrawal', proofCode: 'FEATURE_WITHDRAWN' } };
  const fakeCaps = Object.assign(Object.create(CAPS), {
    withdrawn: () => [retired.id],
    resolve: (id) => (id === retired.id ? retired : CAPS.resolve(id)),
  });
  const entry = (src) => [...dispatchGroups(), { names: ['retired'], id: retired.id, file: 'fixture', line: 'fixture:1', src }];
  assert.deepEqual(failing(auditOn({ caps: fakeCaps, groups: entry("return R(false, warn('gone'), {meta:{code:'FEATURE_WITHDRAWN'}});") }), 'withdrawal-honest'), [],
    'a withdrawal whose run still carries its proof is honest — the fixture is not red by construction');
  assert.ok(failing(auditOn({ caps: fakeCaps, groups: entry("return R(true, 'ok');") }), 'withdrawal-honest').length,
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

test('R318 ④d: a route computed and not drawn is not_rendered, not success', async () => {
  /* (module-graph) the registry IMPORTS the engine now; this verdict is the route observer's own, so the
     engine edge is handed «no renderer to ask» (null) — what an absent window.IntMapGeoEngine used to be.
     The real engine with no map answers observable:false, which (rightly) turns a negative into unobserved. */
  const { makeAtlasCapabilities: noEngine } = await importModule('js/atlas-capabilities.js', { mocks: { 'js/geo-engine.js': { IntMapGeoEngine: null } } });
  const cap = noEngine({}).resolve('routing.route');
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

/* R318 ⑤a-⑤d (plan normalize / $ref / runPlan) and ⑥a-⑥d (goalSpec / evaluateGoal / repairTargets) removed in #R406: js/atlas-planner.js is deleted — the dependency-graph executor had no production caller and the goal spec was derived from a regular-expression reading of the sentence. The turn loop is covered by tests/r406-agent.test.mjs. */

/* ══ ⑦ NINE LANGUAGES ════════════════════════════════════════════════════════════════════════ */

test('R318 ⑦a: the model is told the language it must answer in, in ENGLISH, for all nine', async () => {
  /* RUN, not read (consolidation). (module-graph) The registry is js/lang-registry.js itself with the
     shipped language list declared, and js/ai-core.js is IMPORTED — its own import of the registry is that
     same instance — and the line the model receives is asked for each code. */
  const IntMapLang = langRegistry();
  const { aiCore } = await importModule('js/ai-core.js');
  const WANT = { en: 'English', jp: 'Japanese', de: 'German', ru: 'Russian', es: 'Spanish',
    zh: 'Traditional Chinese', 'zh-hans': 'Simplified Chinese', fr: 'French', ko: 'Korean' };
  assert.deepEqual(Object.keys(WANT).sort(), [...IntMapLang.codes()].sort(), 'the nine are the registry\'s nine');
  for (const [code, name] of Object.entries(WANT)) {
    assert.equal(IntMapLang.englishName(code), name, 'the derived name is gone');
    assert.equal(IntMapLang.codeForEnglishName(name), code, 'and its inverse');
    /* the defect this replaced: a five-argument t() whose 6th..9th languages fell into the inline
       table, where 'English' is correctly translated — and therefore asked for the wrong language.
       (#R318) the two helpers moved to js/ai-core.js — the transport is what carries them. */
    const AI = aiCore({ lang: code, aiConfig: {} });
    assert.equal(AI._aiLangName(), name, 'js/ai-core.js no longer derives the name — ' + code + ' is asked for ' + AI._aiLangName());
    assert.ok(AI._aiLangLine().includes('in ' + name + ' only'), 'the reply-language lock did not travel with it (' + code + ')');
  }
  /* read, not run: the shell (js/app-body.js) boots only in a browser — its own copy of the name and
     the global it publishes are asked of its text. */
  assert.doesNotMatch(codeOnly(read('js/app-body.js')),
    /_aiLangName\(\)\{ return window\.IntMapLang\.t\([a-zA-Z.]+,'English','Japanese'/,
    'the model is back to being asked for the wrong language in three of the nine');
  assert.match(codeOnly(read('js/app-body.js')), /window\._aiLangLine=_aiLangLine;/,
    'the global other files read is no longer published');
});

test('R318 ⑦b: the five-language tables inside Atlas are gone', () => {
  /* read, not run: the tables were in the Atlas kernel (js/atlas-console.js), a closure over the whole
     HOST that only a browser can build; the claim is that they are absent. */
  const atlas = codeOnly(kernelLines().join('\n'));   /* (atlas-capability-modules) the `language` action's run is in js/atlas-cap-settings.js */
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
  /* RUN, not read (consolidation): the registry is evaluated and ASKED for each code's tag. A code with
     no REGION entry answers with its bare html tag (`fr`), which is the defect — so a region is `xx-YY`.
     (module-graph) the registry is the shipped module with the shipped language list, not a vm copy. */
  const IntMapLang = langRegistry();
  CODES.forEach((c) => assert.match(IntMapLang.locale(c), /^[a-z]{2}-[A-Z][A-Za-z]+$/, `REGION has no entry for ${c}`));
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
  /* read, not run: the header is set on a request to the ai-proxy (network + a signed-in session) and
     the turn key is stamped inside the kernel, which only a browser can build. */
  const core = codeOnly(read('js/ai-core.js'));
  assert.match(core, /headers\['x-intmap-turn'\]/, 'the turn key is not sent');
  assert.doesNotMatch(core, /body\.turnId/, 'it must NOT be in the body — the quota is consumed before the body is read');
  const atlas = codeOnly(read('js/atlas-console.js'));
  /* (#R406) the two calls used to be the plan and its repair pass. The agent loop asks the model
     once per tool round instead — an unbounded number of calls through ONE call site — so the claim
     is unchanged and harder: every one of them carries the same key. */
  const turnCalls = atlas.match(/task:'atlas_turn'/g) || [];
  assert.ok(turnCalls.length >= 1, 'the turn call is gone — this check would pass on nothing');
  assert.equal((atlas.match(/turnId:_turnKey/g) || []).length, turnCalls.length,
    'every atlas_turn call must carry the SAME turn key, or a multi-step turn bills the user once per step');
});

test('R318 ⑧b: the server does not trust the key it is given', () => {
  /* read, not run: the proxy is a Deno edge function node cannot import, and the ledger is SQL that
     needs a database (supabase test db runs it). */
  const proxy = aiProxySource();
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
  /* read, not run: 「nothing reaches for the network」 is universal over the two files; a run can only
     show that one path did not. */
  /* the executor is a pure client-side path: nothing in it reaches for the network */
  const exec = read('js/atlas-executor.js');
  ['askAI', 'fetch(', 'ai-proxy', 'aiGate'].forEach((s) =>
    assert.ok(!exec.includes(s), `js/atlas-executor.js reaches for ${s} — running a registered capability must not cost a use`));
  const caps = read('js/atlas-capabilities.js');
  ['askAI', 'ai-proxy'].forEach((s) => assert.ok(!caps.includes(s), `the registry reaches for ${s}`));
});

/* ══ ⑨ THE MOVE LOST NOTHING, AND THE KERNEL SHRANK ══════════════════════════════════════════ */

test('R318 ⑨a: the 58 kB catalogue moved byte-for-byte and is still whole', () => {
  /* read, not run: the catalogue half is RUN (DOCS.text); the wiring lives in the kernel (bindRuntime /
     SYS), which only a browser can build. */
  const all = DOCS.text(null);
  assert.ok(all.length > 50_000, `the catalogue is ${all.length} bytes — most of it did not survive the move`);
  /* ⚠ (#R347) THIS NUMBER IS A FLOOR, NOT AN EQUALITY. #R318's move had to be byte-for-byte, so an
     exact count was right ON THE DAY OF THE MOVE. It is wrong afterwards: the catalogue is where a
     new capability becomes visible to the planner, and scripts/atlas-catalog.mjs FAILS the build if
     a dispatch case has no block — so «the catalogue grew» is the system working, and an equality
     here turns every future capability into a red test in a file about a past refactor.
     What must not happen is the catalogue SHRINKING (that is a capability going invisible), and
     that is what a floor says. #R347 added one block and made it 39. */
  assert.ok(DOCS.count() >= 38, `the catalogue has ${DOCS.count()} blocks; #R318 moved 38 and none may be lost`);
  DOCS.blocks().forEach((b, i) => {
    assert.ok(b.bytes > 100, `block ${i} is ${b.bytes} bytes`);
    assert.ok(b.ids.length > 0, `block ${i} documents no capability — the tag is what makes selection possible`);
  });
  /* a selection is a SUBSEQUENCE of the whole, never a rewrite of it */
  const routing = DOCS.text(['routing.route', 'routing.isochrone']);
  assert.ok(routing.length > 1000 && all.includes(routing.split('\\n')[0].slice(0, 200)));
  assert.ok(routing.length < all.length / 2, 'selecting two capabilities must actually send less');
  /* …and it is still REACHED, now by being pulled rather than pushed. (#R406) SYS() carries the
     tools; the blocks are handed to the registry at bindRuntime, and `find_capability` reads them
     from there. The catalogue moved out of the prompt, not out of the product. */
  const sys = codeOnly(read('js/atlas-console.js'));
  assert.match(sys, /bindRuntime\(\{[^}]*docs:_DOCS/,
    'the registry is no longer given the catalogue, so find_capability has nothing to read');
  /* ⚠ (#R413) THE CLAIM IS UNCHANGED AND THE SPELLING IS NOT. It used to be `catalogText([cap.id])`
     — once per match — and that repeated the same shared block for every capability it documents:
     ten matches on 「現在地から大阪駅までの経路」 came back as 60,935 bytes of which 19,865 were
     distinct, and the 1,400-character clip on each copy was how that was paid for. `catalogText(ids)`
     asks once for all of them and de-duplicates. The prose still reaches Atlas — whole, now. */
  assert.match(codeOnly(read('js/atlas-toolsurface.js')), /CAPS\.catalogText\(ids\)/,
    'find_capability no longer returns the catalogue prose for what it found');
  assert.doesNotMatch(sys, /_DOCS\.text\(/, 'the catalogue is pasted into every prompt again');
  assert.doesNotMatch(sys, /\+'NAVIGATION\/VIEW: \{"type":"flyTo"/, 'the catalogue is inline again');
});

test('R318 ⑨b: the kernel shrank by moving, and the ceiling came down with it', () => {
  const n = (p) => read(p).split('\n').length;
  const atlas = n('js/atlas-console.js');
  /* #R199's rule: a ceiling raised once and never lowered stops asserting anything, so it follows
     the floor DOWN. #R311 shipped 5,299 lines against a ceiling of 5,300. */
  /* (#R795) the line ceiling that stood here is retired: LINES measured the file's length, not what it costs or reaches. `npm run check:perf` ratchets the eager bundle and `npm run check:surface` ratchets IM_HOST / window.* — see tests/r168 #8. */
  assert.ok(atlas > 0);
  const moved = ['js/atlas-agent.js', 'js/atlas-capabilities.js', 'js/atlas-catalog-text.js',
    'js/atlas-executor.js', 'js/atlas-results.js', 'js/atlas-state.js', 'js/atlas-toolsurface.js'].reduce((a, p) => a + n(p), 0);
  assert.ok(moved > 1_200, `the seven modules hold ${moved} lines — the kernel shrank by moving, not by losing`);
});

/* R318 ⑨c (the #R135 request-profile block and ATLAS_ACTION_CAPABILITIES) removed in #R406: the file it checked had arrived in, js/atlas-planner.js, is deleted along with every function it named. */

test('R318 ⑨d: the state is data, and the paragraph is derived from it', () => {
  const S = makeAtlasState({});
  /* RUN, not read (consolidation): the registry and the derivation are asked, not spelt */
  assert.equal(typeof S.registerStateProvider, 'function', 'no provider registry');
  const D = makeAtlasState({});
  D.registerStateProvider('routing', () => ({ hasRoute: true, mode: 'car' }));
  const para = D.renderPrompt(D.snapshot());
  assert.ok(typeof para === 'string' && /mode=car/.test(para), 'nothing derives the model-facing paragraph from the snapshot');
  D.registerStateProvider('routing', () => ({ hasRoute: true, mode: 'walk' }));
  assert.ok(/mode=walk/.test(D.renderPrompt(D.snapshot())), 'the paragraph follows the snapshot it is handed');
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
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r320-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R320 — the two fallbacks stop being a place where a capability can disappear
 * ----------------------------------------------------------------------------
 *  #R318's audit listed five disagreeing catalogues of "what IntMap can do" and replaced four of
 *  them with one registry. The fifth was left standing and named as a debt:
 *
 *    · `controlCatalog()` took the first 140 controls IN DOM ORDER, so a control at position 141
 *      was, to the planner, a control IntMap did not have — and nothing said so;
 *    · `moduleCatalog()` walked `Object.keys(window)`, so eight subsystems that load on demand
 *      (#R209) were subsystems IntMap did not have until something else happened to fetch them,
 *      and `doModule` answered 「Module/method not found」 for every one of them;
 *    · `doControl` pressed the top-scoring match however close the runner-up was.
 *
 *  This is that debt paid. The cap stays — the prompt has a real byte budget — but it RANKS against
 *  the request and it SAYS what it left out, which is the difference between a budget and a hole.
 * ==========================================================================*/

const read = (p) => readFileSync(join(ROOT, p), 'utf8');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { auditWith, dispatchGroups, kernelLines } = await import('../scripts/atlas-capability-audit.mjs');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
/* (#R406) the audit reads the real argument schemas the same way scripts/atlas-capability-audit.mjs does */
const SCHEMAS = (await import('../js/atlas-schemas.js')).makeAtlasSchemas();
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');

const CONTROLS = read('js/atlas-controls.js');
const catBody = (CONTROLS.match(/function controlCatalog\([\s\S]*?\n    \}/) || [''])[0];

/* ── (consolidation) ①a–③b used to read the text of js/atlas-controls.js. They now RUN the shipped
   factory over a small DOM — exactly the surface it touches on these paths (the same shape
   tests/atlas-outward-effects-checks builds) — installed for one test and taken down after it, so
   no other check in this file ever sees a document. ──────────────────────────────────────────── */
const { makeAtlasControls } = await import('../js/atlas-controls.js');
function ctlEl(tag, attrs, text) {
  const a = Object.assign({}, attrs || {});
  const e = {
    tagName: tag.toUpperCase(), textContent: text || '', disabled: false, offsetParent: {}, presses: 0,
    get id() { return a.id || ''; },
    get type() { return a.type || (tag === 'input' ? 'text' : ''); },
    get placeholder() { return a.placeholder || ''; },
    value: '',
    getAttribute: (k) => (k in a ? String(a[k]) : null),
    setAttribute: (k, v) => { a[k] = String(v); },
    closest: () => null,
    click() { e.presses++; },
    focus() {},
    dispatchEvent() { return true; },
  };
  return e;
}
async function withControls(els, fn) {
  const had = { document: globalThis.document, KeyboardEvent: globalThis.KeyboardEvent, addEventListener: globalThis.addEventListener };
  if (typeof globalThis.addEventListener !== 'function') globalThis.addEventListener = () => {};
  globalThis.document = {
    querySelectorAll: () => els.slice(), querySelector: () => null,
    getElementById: (id) => els.find((x) => x.id === id) || null,
  };
  if (typeof globalThis.KeyboardEvent === 'undefined') globalThis.KeyboardEvent = class { constructor(t) { this.type = t; } };
  /* the factory arms a naming sweep and a periodic wheel on timers; neither is under test here */
  const st = globalThis.setTimeout; globalThis.setTimeout = () => 0;
  let C;
  try {
    C = makeAtlasControls({ lang: 'en', user: null }, {
      L: (en) => en, R: (ok, html, extra) => Object.assign({ ok: !!ok, html: html || '' }, extra || null),
      _ctlTogHtml: () => '', esc: (s) => String(s == null ? '' : s), note: (s) => s, warn: (s) => s,
    });
  } finally { globalThis.setTimeout = st; }
  try { return await fn(C); } finally {
    for (const k of Object.keys(had)) { if (had[k] === undefined) delete globalThis[k]; else globalThis[k] = had[k]; }
  }
}
/* a screen with more controls than the catalogue may list, and the one the request is about far down it */
function crowd(n, at, target) {
  const els = [];
  for (let i = 0; i < n; i++) els.push(i === at ? target : ctlEl('button', { id: 'tool-' + i }, 'Tool ' + i));
  return els;
}

/* ── ① the control catalogue ranks, and admits what it dropped ─────────────────────────────── */

test('R320 ①a: controlCatalog caps against the REQUEST, not against document order', async () => {
  const sat = ctlEl('button', { id: 'sat-img' }, 'Satellite imagery');
  await withControls(crowd(200, 190, sat), (C) => {
    assert.ok(C.controlCatalog('satellite imagery').includes('Satellite imagery [#sat-img]'),
      'the catalogue no longer sees the request it is being built for — and no longer scores against it');
    assert.ok(!C.controlCatalog('').includes('Satellite imagery'),
      'with no request the same control is past the cap — which is what makes the line above a ranking and not luck');
  });
  /* read, not run: that the cap is a NAME and not a bare number is a fact about how the source is
     written — the running catalogue cannot say which. */
  assert.match(catBody, /CTL_MAX/, 'the cap is an unnamed literal again');
});

test('R320 ①b: a dropped control is COUNTED and SAID, because a silent cap reads as completeness', async () => {
  await withControls(crowd(200, 5, ctlEl('button', { id: 'x' }, 'Something')), (C) => {
    const cat = C.controlCatalog('something');
    const m = /… and (\d+) more on-screen control\(s\) not listed here/.exec(cat);
    assert.ok(m, 'the catalogue truncates without telling the planner that it did:\n' + cat.slice(-200));
    const listed = cat.slice(0, m.index).split('; ').length;
    assert.equal(+m[1] + listed, 200, 'nothing counts what was left out — the count must be exactly what was not listed');
    /* …and naming one anyway must still work: the cap is a PROMPT budget, not a reachability rule */
    assert.match(cat, /will still be found/, 'the note must say the unlisted ones are still reachable');
    /* a screen that fits says nothing about dropping */
  });
  await withControls([ctlEl('button', { id: 'a' }, 'Alpha'), ctlEl('button', { id: 'b' }, 'Beta')], (C) => {
    assert.ok(!/not listed here/.test(C.controlCatalog('alpha')), 'a list that is whole must not claim it was cut');
  });
});

test('R320 ①c: the audit can go red on a silent cap', () => {
  const damaged = CONTROLS
    .replace(/'  … and '\+dropped\+' more on-screen control\(s\)[^']*'/, "''");
  assert.notEqual(damaged, CONTROLS, 'the fixture did not change anything — the announcement moved');
  const checks = auditWith({
    caps: makeAtlasCapabilities({}), docs: makeAtlasCatalogText({}, {}),
    atlas: kernelLines(), groups: dispatchGroups(), controls: damaged,
    capSrc: read('js/atlas-capabilities.js'), execSrc: read('js/atlas-executor.js'),
    stateSrc: read('js/atlas-state.js'),
    resultsSrc: read('js/atlas-results.js'),
  });
  const f = (checks.find((c) => c.id === 'no-silent-cap') || { failures: [] }).failures;
  assert.ok(f.length, 'removing the announcement must be caught — that IS the defect');
});

/* ── ② the generic control refuses to guess between near-equals ─────────────────────────────── */

test('R320 ②: doControl answers ambiguous_target instead of pressing one of several matches', async () => {
  const a = ctlEl('button', { id: 'panel-a' }, 'Settings panel');
  const b = ctlEl('button', { id: 'panel-b' }, 'Settings pane');
  await withControls([a, b], (C) => {
    const r = C.doControl({ type: 'control', target: 'settings' });
    assert.equal(r.ok, false);
    assert.equal(r.meta && r.meta.code, 'ambiguous_target', 'doControl still takes the top score whatever the field looks like');
    assert.equal(r.meta.candidates.length, 2, 'nothing enumerates the near field');
    assert.equal(a.presses + b.presses, 0, 'and nothing was pressed while it was ambiguous');
  });
  /* the threshold is a RATIO — an exact id next to a word match is not a tie */
  const exact = ctlEl('button', { id: 'settings' }, 'Open');
  const word = ctlEl('button', { id: 'other' }, 'Settings menu');
  await withControls([exact, word], (C) => {
    const r = C.doControl({ type: 'control', target: 'settings' });
    assert.equal(r.ok, true, 'the tie test is an absolute number again; it has to be relative to the best');
    assert.equal(exact.presses, 1);
    assert.equal(word.presses, 0);
  });
  /* and the kernel has to be able to read it — for every capability, in js/atlas-executor.js; that it
     really answers needs_input is EVALUATED in tests/atlas-ambiguous-is-not-failure-checks.test.mjs */
  assert.match(read('js/atlas-executor.js'), /raw\.meta\.code === 'ambiguous_target'/,
    'the kernel no longer turns an ambiguous match into needs_input');
});

/* ── ③ a subsystem that has not loaded is not a missing subsystem ───────────────────────────── */

test('R320 ③a: the module catalogue names the modules that load on demand', async () => {
  const { makeLazyModules } = await import('../js/lazy-modules.js');
  const hadLazy = window.IntMapLazy;
  try {
    makeLazyModules({});   /* installs window.IntMapLazy — the manifest the catalogue reads */
    assert.equal(typeof window.IntMapLazy.publishes, 'function', 'js/lazy-modules.js no longer exposes the manifest the catalogue reads');
    const LZ = window.IntMapLazy;
    const offered = LZ.names().map((n) => LZ.publishes(n)).filter((g) => /^IntMap[A-Za-z0-9]+$/.test(g) && typeof window[g] === 'undefined');
    assert.ok(offered.length > 0, 'the fixture has no module left to arrive');
    await withControls([], (C) => {
      const cat = C.moduleCatalog();
      for (const g of offered) {
        assert.ok(cat.includes(g + '('), 'moduleCatalog still walks only Object.keys(window) — ' + g + ' is not offered');
      }
      assert.match(cat, /\[loads on demand\]/, 'and does not mark which ones have not arrived yet');
    });
  } finally { if (hadLazy === undefined) delete window.IntMapLazy; else window.IntMapLazy = hadLazy; }
});

test('R320 ③b: doModule fetches the module instead of answering "not found"', async () => {
  const hadLazy = window.IntMapLazy; const asked = []; let opened = 0;
  window.IntMapLazy = {
    names: () => ['fakeMod'], publishes: (n) => (n === 'fakeMod' ? 'IntMapFakeMod' : ''),
    need: async (n) => { asked.push(n); window.IntMapFakeMod = { open() { opened++; } }; return true; },
  };
  try {
    await withControls([], async (C) => {
      const p = C.doModule({ name: 'IntMapFakeMod', method: 'open' });
      /* ⚠ and it must RETURN the promise, or the kernel's completion wait covers only the lookup */
      assert.equal(typeof (p && p.then), 'function', 'the fetch is fire-and-forget — the kernel cannot wait for it');
      const r = await p;
      assert.deepEqual(asked, ['fakeMod'], 'doModule no longer asks for a module that has not arrived');
      assert.equal(r.ok, true);
      assert.equal(opened, 1, 'the method ran once the module arrived');
      /* the method list is still a closed allow-list: this round widens reach, not permission */
      const refused = C.doModule({ name: 'IntMapFakeMod', method: 'constructor' });
      assert.equal(refused.ok, false, 'the method allow-list is gone — arbitrary calls are back');
    });
  } finally {
    delete window.IntMapFakeMod;
    if (hadLazy === undefined) delete window.IntMapLazy; else window.IntMapLazy = hadLazy;
  }
});

test('R320 ③c: every lazy module the loader publishes is a name the catalogue can offer', () => {
  /* read, not run: MOD_RE is private to the controls factory; the offer itself is RUN in ③a. */
  /* (#R802) the manifest is the registry's `publishes` column */
  const names = Object.values(LAZY_REGISTRY).map((e) => e.publishes).filter((n) => /^IntMap[A-Za-z0-9]+$/.test(n));
  assert.ok(names.length >= 8, `only ${names.length} publishable module names — the manifest shrank`);
  /* MOD_RE is what decides whether a name may be offered at all */
  const re = /const MOD_RE=(\/[^\/]+\/)/.exec(CONTROLS);
  assert.ok(re, 'MOD_RE moved');
  const test_ = new RegExp(re[1].slice(1, -1));
  const unofferable = names.filter((n) => !test_.test(n));
  assert.deepEqual(unofferable, [], 'these lazy modules can never be named to the planner');
});

/* ── ④ nothing regressed in the kernel this builds on ───────────────────────────────────────── */

test('R320 ④: the capability audit is still green, and still asks twenty-three questions', () => {
  const checks = auditWith({
    caps: makeAtlasCapabilities({}), docs: makeAtlasCatalogText({}, {}),
    atlas: kernelLines(), groups: dispatchGroups(), controls: CONTROLS,
    capSrc: read('js/atlas-capabilities.js'), execSrc: read('js/atlas-executor.js'),
    stateSrc: read('js/atlas-state.js'),
    resultsSrc: read('js/atlas-results.js'),
    toolsSrc: read('js/atlas-toolsurface.js'),
    schemas: SCHEMAS,
  });
  /* ⚠⚠ THE SAME NUMBER LIVES IN tests/r318-checks.test.mjs ②a — move both or CI finds the other one
     (#R802 moved this copy first and was caught by that one).
     ⚠ THIS NUMBER IS A GUARD, NOT A POLICY ([[intmap-ceiling-guards-are-not-policies]]): it is here so a
     check that quietly stops running is noticed, and it moves the day one is deliberately added. #R406
     added argument-schemas and required-arguments; #R802 added catalogue-subject, which asks of every
     capability whether its own catalogue block says what it is ABOUT — measured on production that round,
     「天気予報」 reached nothing because `js/atlas-catalog-text.js` carried the word 「天気」 zero times. */
  assert.equal(checks.length, 23, 'a capability check was added or lost');
  assert.deepEqual(checks.filter((c) => c.failures.length).map((c) => c.id), []);
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r406-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R406 — THE REMOVALS, MADE PERMANENT
 * ----------------------------------------------------------------------------
 *  Deleting a gate is not the same as keeping it deleted. Every layer this round took out was
 *  itself added by a round that had a real defect in front of it, and the same pressure will come
 *  back: the next unhappy sentence will look exactly like a case for one more regular expression.
 *  These are the assertions that make adding it fail.
 *
 *  ⚠ AND THEY ARE WRITTEN AGAINST CODE, NOT PROSE. #R394 found a gate whose `\b` had been eaten by
 *  a heredoc, so it matched nothing from the day it was written; #R399 found one whose needle
 *  required an asterisk that the canonical document did not have. Both were green for rounds. Each
 *  check below therefore names something that is REALLY in the tree today, and the round that added
 *  it deliberately broke each one to watch it go red.
 * ==========================================================================*/

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

/* Comments are not code. #R345 counted a check that matched its own explanatory paragraph, and it
   has happened twelve times since; strip them before asking whether the tree does something —
   with the shared reader imported at the top of this file (scripts/code-only.mjs). */

const CONSOLE_SRC = read('js/atlas-console.js');
const CONSOLE_CODE = codeOnly(CONSOLE_SRC);

/* ── ① the meaning-deciding layer is gone from the tree ───────────────────────────────────── */
test('R406 ①: the request profile, the intent gates and the plan rewriter are not in js/ any more', () => {
  /* read, not run: 「not in js/ any more」 is a claim about the whole tree — an absent function cannot be
     observed by running anything. */
  /* ⚠ `_rpExtractYear` AND `_rpGeoKind` ARE ON THIS LIST BECAUSE THEY WERE MISSED. The first draft
     named the layers and forgot the two small helpers under them, and js/atlas-console.js was left
     CALLING `_rpExtractYear` — inside a try/catch, so the ReferenceError would have been swallowed
     and the conversation would simply have stopped carrying the year of a historical map. Nothing
     would have thrown; the feature would just have been quietly less. scripts/static-checks.mjs
     caught it, and only because the name was a free identifier rather than a member. */
  const GONE = ['_requestProfile', '_profileBlock', '_applyIntentGates', '_validatePlan', '_repairGuidance',
    '_goalValidation', '_isWorldExpansion', '_researchFamKey', '_semanticRetryKey', 'ATLAS_ACTION_CAPABILITIES',
    'goalSpec', 'evaluateGoal', 'goalImpact', 'selectCapabilities', 'localPlan', 'PLAN_SCHEMA', 'runPlan',
    '_rpExtractYear', '_rpGeoKind'];
  const files = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
  const hits = [];
  for (const f of files) {
    const code = codeOnly(read('js/' + f));
    for (const name of GONE) if (code.includes(name)) hits.push(`${f}: ${name}`);
  }
  assert.deepEqual(hits, [], 'a layer #R406 removed is still reachable from js/');
});

test('R406 ①b: js/atlas-planner.js is deleted, and nothing imports or reads it', () => {
  /* read, not run: the same: a claim that nothing in the tree loads a deleted file. */
  assert.equal(exists('js/atlas-planner.js'), false, 'the planner module came back');
  /* ⚠ LOADING IT, NOT NAMING IT. A tombstone comment saying which round removed the file is the
     right thing to leave behind, and so is this test's own `exists('js/atlas-planner.js')` above —
     neither is a reference that would break. Twelve rounds of this repo have shipped a check that
     matched its own explanatory prose, so this one looks only for a real import() / from / read(). */
  const LOADS = /(?:from\s*|import\s*\(\s*|require\s*\(\s*|read\s*\(\s*|readFileSync\s*\(\s*)['"][^'"]*atlas-planner/;
  const refs = [];
  for (const dir of ['js', 'scripts', 'tests', 'src']) {
    if (!exists(dir)) continue;
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      if (!/\.(js|mjs|ts)$/.test(f)) continue;
      if (LOADS.test(codeOnly(read(`${dir}/${f}`)))) refs.push(`${dir}/${f}`);
    }
  }
  assert.deepEqual(refs, [], 'something still imports or reads the deleted planner');
});

/* ── ② the turn does not read the user's sentence ─────────────────────────────────────────── */
test('R406 ②: inside the turn, exactly one expression looks at the request text, and it only picks an effort tier', () => {
  /* read, not run: run() is the Atlas kernel's turn, a closure over the whole HOST that only a browser
     can drive; the claim is about every probe in its body. */
  const i = CONSOLE_CODE.indexOf('async function run(');
  assert.ok(i > 0, 'run() was renamed — this check must be re-aimed, not deleted');
  const j = CONSOLE_CODE.indexOf('function recordTurn(', i);
  assert.ok(j > i, 'recordTurn() moved — this check must be re-aimed');
  const body = CONSOLE_CODE.slice(i, j);
  /* every place the turn interrogates the raw request with a pattern */
  const probes = [...body.matchAll(/(?:\.test\(\s*q\s*\)|q\.match\(|\.test\(String\(q)/g)].map((m) => {
    const at = body.lastIndexOf('\n', m.index) + 1;
    return body.slice(at, body.indexOf('\n', m.index)).trim().slice(0, 120);
  });
  assert.equal(probes.length, 1, `the turn interrogates the request in ${probes.length} places:\n` + probes.join('\n'));
  assert.match(probes[0], /_cplx/, 'the one surviving probe is not the complexity hint');
  assert.match(probes[0], /effortHint|_cplx=/, 'the complexity hint feeds something other than the effort tier');
  /* and _cplx must reach nothing but effortHint */
  const uses = [...body.matchAll(/_cplx/g)].length;
  assert.equal(uses, 2, `_cplx is read ${uses - 1} time(s); it may only set the effort tier`);
});

test('R406 ②b: the two question-detectors that disagreed with each other are both gone', () => {
  /* read, not run: the kernel again (see ②); the claim is that the patterns are absent. */
  /* js/atlas-planner.js:94 decided `outputs.explanation` and js/atlas-console.js:5051 decided
     `informational`; both keyed on the SAME [?？] class, so 「セーヌ川の長さは・」 failed both. */
  assert.doesNotMatch(CONSOLE_CODE, /\[\?？\]/, 'a question-mark character class is still deciding meaning');
  assert.doesNotMatch(CONSOLE_CODE, /\bTIMEVAR\b|\bSOCIAL\b|informational/, 'the live-source override regexes are still here');
});

/* ── ③ the catalogue is no longer pushed at the model ─────────────────────────────────────── */
test('R406 ③: the system prompt does not carry the action catalogue', () => {
  /* read, not run: SYS() is built inside the kernel; the served half is RUN in the find_capability
     checks (R406-turn ⑥, R727 ⑤). */
  const i = CONSOLE_CODE.indexOf('function SYS(');
  assert.ok(i > 0);
  const sys = CONSOLE_CODE.slice(i, CONSOLE_CODE.indexOf('function _capIndex(', i));   /* (atlas-legacy-protocol-removal) _toolBlock, which stood here, went with the one-string transport */
  assert.doesNotMatch(sys, /_DOCS\.text\(/, 'SYS() is pasting the catalogue into every turn again');
  assert.doesNotMatch(sys, /layerCatalogText\(\)/, 'SYS() is pasting 170 layer names again');
  assert.doesNotMatch(sys, /controlCatalog\(/, 'SYS() is pasting the control list again');
  /* …and the catalogue still EXISTS, because find_capability serves it on request */
  assert.ok(exists('js/atlas-catalog-text.js'), 'the catalogue was deleted rather than made on-demand');
  assert.match(codeOnly(read('js/atlas-toolsurface.js')), /catalogText\(/, 'nothing serves the catalogue on demand any more');
});

test('R406 ③b: the persistent instruction is a paragraph, not a rulebook', async () => {
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  const { makeAtlasPolicy } = await import('../js/atlas-policy.js');
  const all = makeAtlasPolicy().all();
  /* ⚠ 4,000 IS NOT AN AESTHETIC LIMIT, IT IS THE RATCHET. What this guards against is the way the
     prompt got to 77,277 characters: one more paragraph per round, each one a real defect written
     down. About a third of what is here is the #R147 safety layer, which PREDATES this round and is
     product behaviour rather than a defect note — deleting it to hit a smaller number would be the
     kind of "shortening" that changes what the app does. Lower this when a round genuinely removes
     a clause; a round that wants to RAISE it is the round to look at twice. */
  assert.ok(all.length < 4_000, `the core instruction is ${all.length} characters and is growing back`);
  assert.ok(all.length > 400, 'the core instruction is too short to say anything');
  /* the decisions it must GRANT rather than remove */
  ['web search', 'Answer directly', 'never claim success before confirmation'].forEach((phrase) =>
    assert.ok(all.includes(phrase), `the core instruction no longer says: ${phrase}`));
  /* …and the two clauses that are OLDER than this round and must not be quietly dropped again */
  assert.match(all, /SCOPE & SAFETY/, 'the #R147 sensitive-request layer left the prompt');
  assert.match(all, /Naming a place in prose is NOT by itself a reason to draw anything/,
    'the #R149 clause lost the half #R406 narrowed it to');
});

/* ── ④ every capability declares its arguments ────────────────────────────────────────────── */
test('R406 ④: every capability has an action-specific schema, and a required target is demanded', async () => {
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  const CAPS = (await import('../js/atlas-capabilities.js')).makeAtlasCapabilities({});
  const S = (await import('../js/atlas-schemas.js')).makeAtlasSchemas();
  const all = CAPS.all();
  const missing = [], empty = [], undemanded = [];
  all.forEach((c) => {
    const sc = S.schemaFor(c.id);
    if (!sc) { missing.push(c.id); return; }
    if (sc.type !== 'object' || !sc.properties || !Object.keys(sc.properties).length) { empty.push(c.id); return; }
    if (c.targetPolicy && c.targetPolicy.required
      && !(Array.isArray(sc.required) && sc.required.length)
      && !(Array.isArray(sc.anyOf) && sc.anyOf.length)) undemanded.push(c.id);
  });
  assert.deepEqual(missing, [], 'capabilities with no argument schema');
  assert.deepEqual(empty, [], 'capabilities whose schema accepts any object at all');
  assert.deepEqual(undemanded, [], 'capabilities that need a target but demand nothing');
  /* ⚠ A FLOOR, DELIBERATELY — NOT A PIN (#R475). Adding a capability cannot break it; only
     withdrawing one below the historic low can, and that is the alarm it exists to raise. The
     EQUALITY spelling of this claim is what went red every night in tests/r318-atlas.spec.js,
     and tests/r475-checks ② sweeps for it — floors are exempted there for this reason. */
  assert.ok(all.length >= 126, `the registry shrank to ${all.length}`);
  /* the schema table must not name capabilities that do not exist */
  const known = new Set(all.map((c) => c.id));
  assert.deepEqual(S.ids().filter((id) => !known.has(id)), [], 'schemas for capabilities that do not exist');
});

test('R406 ④b: the registry no longer hands every capability the same schema literal', async () => {
  /* RUN, not read (consolidation): the registry is bound to the shipped schema table the way Atlas binds
     it, and each descriptor is asked for the schema it hands out. */
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  const caps = (await import('../js/atlas-capabilities.js')).makeAtlasCapabilities({});
  const S = (await import('../js/atlas-schemas.js')).makeAtlasSchemas();
  caps.bindRuntime({ schemas: S });
  const wrong = caps.all().filter((c) => {
    const sc = S.schemaFor(c.id);
    return sc && JSON.stringify(c.inputSchema.properties) !== JSON.stringify(sc.properties || {});
  }).map((c) => c.id);
  assert.deepEqual(wrong, [], 'build() is hard-coding one empty schema for all of them again');
  assert.ok(new Set(caps.all().map((c) => JSON.stringify(c.inputSchema))).size > 1,
    'build() is hard-coding one empty schema for all of them again');
});

/* ── ⑤ the loop's ceilings are technical, and inside the server's ─────────────────────────── */
test('R406 ⑤: the turn loop cannot outspend the server budget it is charged against', async () => {
  /* read, not run: the loop's limit is RUN; the server cap is a constant of the Deno edge function,
     which node cannot import. */
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  const { LIMITS } = (await import('../js/atlas-agent.js')).makeAtlasAgent();
  const proxy = aiProxySource();
  const m = proxy.match(/TURN_MAX_CALLS\s*=\s*(\d+)/);
  assert.ok(m, 'the server no longer declares a per-turn call cap — this check must be re-aimed');
  const cap = +m[1];
  /* the loop may need one extra call to write the closing sentence (agent.js's forced final) */
  assert.ok(LIMITS.maxSteps + 1 <= cap,
    `the loop may make ${LIMITS.maxSteps + 1} calls against a server cap of ${cap}: the reader's LAST step would 429`);
});

test('R406 ⑤b: ai-proxy accepts the turn task, enforces its envelope on every provider, and still accepts the old one', () => {
  /* read, not run: the Deno edge function cannot be imported by node. */
  const p = aiProxySource();
  assert.ok(TASKS.has('atlas_turn'), 'atlas_turn is not an accepted task');
  assert.equal(TASKS.get('atlas_turn').json, true, 'atlas_turn is not a JSON task, so its envelope is unenforced');
  assert.ok(TASKS.get('atlas_turn').maxOutput > 0, 'atlas_turn has no output budget and would fall to the default');
  assert.match(p, /const wantJson = spec\.json \|\| /, 'the JSON mode is not read from the task');
  /* a reader still holding the previous bundle keeps working until the cache turns over */
  assert.ok(TASKS.has('atlas_plan'), 'atlas_plan was removed while cached clients may still send it');
});

/* ── ⑥ the reader is shown one answer, not a tally of failed steps ────────────────────────── */
test('R406 ⑥: the counted-failure banners are gone and the answer is no longer suppressed on failure', () => {
  /* read, not run: the banners and _atlCompose are the kernel's, which only a browser can build. */
  assert.doesNotMatch(CONSOLE_CODE, /primaryFails|secondaryFails/, 'the failed-action banners are back');
  assert.doesNotMatch(CONSOLE_CODE, /_allFailed\s*&&|&&\s*!_visFailed/, 'the answer is being suppressed by a failure count again');
  const i = CONSOLE_CODE.indexOf('function _atlCompose(');
  const body = CONSOLE_CODE.slice(i, CONSOLE_CODE.indexOf('async function runActions(', i) + 1);
  assert.match(body, /let head=say\?/, 'the head is no longer simply the answer');
});

test('R406 ⑥b: the turn asks the model for the web, instead of forbidding it', () => {
  /* read, not run: the turn call is built inside the kernel's run(), which only a browser can drive. */
  const i = CONSOLE_CODE.indexOf('async function run(');
  const body = CONSOLE_CODE.slice(i, CONSOLE_CODE.indexOf('function recordTurn(', i));
  assert.match(body, /task:'atlas_turn'[^}]*webMode:'auto'/, "the turn call does not enable the model's own web search");
  assert.doesNotMatch(body, /webMode:'off'/, 'the turn pins web search off again');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r475-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  #R475 — a registry size that was typed, in a tier that never stood in front of a push
 * ----------------------------------------------------------------------------
 *  tests/r318-atlas.spec.js R406 ① pinned `window.IntMapCapabilities.all().length` to a literal.
 *  MEASURED, by building js/atlas-capabilities.js at each commit that touched it:
 *
 *      fa924f6  #R413                       126   — the day #R406 typed the number
 *      616e549  #R439  + layers.isobars     127   — RED, on every nightly, for eleven days
 *      30d1a7c  #R469  − sim.slopeAspect    126   — GREEN again, and nobody touched the test
 *
 *  Both moves were correct product work, neither round opened the spec, and the second REPAIRED
 *  the alarm by accident. A verdict that flips red and back on rounds that never looked at it is
 *  not measuring what its name says. What R406 ① is for is the JOIN — that the registry the source
 *  declares is the registry the built bundle answers with — so it asks that instead, against
 *  tests/helpers/atlas-registry.mjs: the IDS, not the size, because a swapped id has the same
 *  length. (#R433 wrote the rule this obeys: the answer to a stale constant is never a bigger
 *  constant. CONSTITUTION.md §5.)
 *
 *  ⚠ THE SWEEP IS WIDER THAN THE ONE LINE (#R429). A check aimed at the file that failed is why
 *  this survived: #R433 fixed R406 ② in this very file, three assertions below ①, and left ① as it
 *  was. ② here reads EVERY test that touches the registry and refuses an EQUALITY between its size
 *  and an integer literal, wherever it is written.
 *
 *  ⚠ A FLOOR IS NOT THIS DEFECT. `assert.ok(all.length >= 126)` in tests/r406-checks ④ says «the
 *  registry must not shrink» — a deliberate ratchet that adding a capability cannot break. The
 *  trap is the EQUALITY, which nothing can satisfy for long. ② draws the line exactly there.
 *
 *  ⚠ THE FIXTURES ARE ASSEMBLED, NOT WRITTEN (#R345, one turn further). ② proves it can fire by
 *  feeding the scanner the line as it shipped — and a check that spells its own trap is a check
 *  that condemns itself, which is what the first draft of this file did. `codeOnly` strips
 *  comments, not string literals, so the fixtures are built from pieces and never appear whole.
 * ==========================================================================*/

const R = (p) => readLF(join(ROOT, p));

/* ══ THE SCANNER ══════════════════════════════════════════════════════════════════════════════
   The idiom has two halves and they are not adjacent — in the shipped line they were six lines
   apart, so a proximity grep would have found nothing. It is read the way it is written: first,
   which names carry a registry size (`caps: C.all().length`) or the list itself (`const all =
   CAPS.all()`); then, whether any of those — or the expression inline — is put on one side of an
   EQUALITY with an integer literal. Bounds are deliberately not in the pattern set. */
const SIZE_OR_LIST = /(?:\b(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*[:=]\s*[A-Za-z_$][\w$]*\.all\(\)(\.length)?(?![\w$])/g;
const EQ = (expr) => new RegExp(
  String.raw`expect\(\s*(?:[\w$]+\.)?${expr}\s*(?:,[^()]*)?\)\s*\.\s*(?:toBe|toEqual|toStrictEqual)\s*\(\s*\d+\s*\)`
  + String.raw`|assert\s*\.\s*(?:equal|strictEqual|deepEqual|deepStrictEqual)\s*\(\s*(?:[\w$]+\.)?${expr}\s*,\s*\d+\s*\)`
  + String.raw`|(?:[\w$]+\.)?${expr}\s*===?\s*\d+`, 'g');
const INLINE = String.raw`[A-Za-z_$][\w$]*\.all\(\)\.length`;

/** Every place `src` pins a `.all()` registry size to an integer literal, as readable strings. */
function pinnedRegistrySizes(src) {
  const code = codeOnly(src);
  const exprs = [INLINE];
  for (const m of code.matchAll(SIZE_OR_LIST)) exprs.push(m[2] ? m[1] : m[1] + String.raw`\.length`);
  const hits = new Set();
  for (const e of exprs) for (const m of code.matchAll(EQ(e))) hits.add(m[0].replace(/\s+/g, ' '));
  return [...hits];
}

/* the registry's own spellings — a test that never names it is not in this sweep's business */
const TOUCHES_REGISTRY = /IntMapCapabilities|makeAtlasCapabilities|atlas-registry|atlas-capabilities/;

/* ── ① the built app's registry claim is DERIVED, and the derivation is faithful ──────────── */
test('R475 ①: R406 ① compares the built registry against the declared one, not against a number', () => {
  const spec = codeOnly(R('tests/r318-atlas.spec.js'));
  assert.match(spec, /declaredCapabilityIds\(\)/,
    'tests/r318-atlas.spec.js stopped deriving the registry it compares against');
  assert.deepEqual(pinnedRegistrySizes(R('tests/r318-atlas.spec.js')), [],
    'the typed registry size is back in the spec #R475 derived');

  /* the helper is the registry ASKED, not a second hand-written list — #R318's whole point */
  const ids = declaredCapabilityIds();
  assert.ok(ids.length > 0, 'the helper reports an empty registry');
  assert.deepEqual(ids, makeAtlasCapabilities({}).all().map((c) => c.id).sort(),
    'tests/helpers/atlas-registry.mjs no longer reports what js/atlas-capabilities.js declares');
  assert.doesNotMatch(codeOnly(R('tests/helpers/atlas-registry.mjs')), /['"][a-z]+\.[A-Za-z]+['"]/,
    'the helper started spelling capability ids of its own — that is the second list again');
});

/* ── ② the sweep is every test that names the registry, and it can be made to fire ────────── */
test('R475 ②: no test pins the capability registry to an integer, and this check catches one', () => {
  const N = '126', L = '.leng' + 'th';   /* assembled, so this file is not its own offender */
  const twoHalves = 'const r = { caps: C.all()' + L + ' };\nexpect(r.caps).toBe(' + N + ');';
  const inline = 'expect(C.all()' + L + ').toBe(' + N + ');';
  const nodeSide = 'const all = CAPS.all();\nassert.equal(all' + L + ', ' + N + ');';
  const floor = 'const all = CAPS.all();\nassert.ok(all' + L + ' >= ' + N + ', "the registry shrank");';

  assert.equal(pinnedRegistrySizes(twoHalves).length, 1, 'the scanner cannot see the line this round removed');
  assert.equal(pinnedRegistrySizes(inline).length, 1, 'the scanner cannot see the pin written inline');
  assert.equal(pinnedRegistrySizes(nodeSide).length, 1, 'the scanner cannot see the node spelling of the same pin');
  assert.deepEqual(pinnedRegistrySizes(floor), [],
    'the sweep is condemning ratchets — the #R406 ④ check in this file is a floor, not a pin');

  const offenders = [];
  for (const f of readdirSync(join(ROOT, 'tests')).filter((n) => /\.(spec\.js|test\.mjs)$/.test(n))) {
    const src = R(join('tests', f));
    if (!TOUCHES_REGISTRY.test(src)) continue;
    const hits = pinnedRegistrySizes(src);
    if (hits.length) offenders.push(`${f}: ${hits.join(' · ')}`);
  }
  assert.deepEqual(offenders, [],
    'a capability-registry size is pinned to an integer literal again — derive it from js/atlas-capabilities.js (#R433)');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r582-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R582 — WHAT ATLAS CAN SEE AT THE MOMENT IT DECIDES
 * ----------------------------------------------------------------------------
 *  REPORTED: 「エンゲルス空軍基地からナッシュビルまでICBM」 came back as a refusal to help plan a
 *  strike, and 「ha?」 came back as the same refusal explained again.
 *
 *  IntMap's answer to that request is `sim.ballistic` — the Keplerian trajectory solve in
 *  js/atlas-sims.js, whose catalogue entry says in so many words «use THIS for any ballistic/ICBM/
 *  弾道ミサイル request». It has NO UI ENTRY POINT ANYWHERE IN THE PRODUCT: js/map-ui.js's SIM_TOOLS
 *  lists ten simulators and not this one, so asking Atlas is the only way any reader can reach it.
 *
 *  WHAT SYS() SHOWED ATLAS BEFORE THIS ROUND: the persona, js/atlas-policy.js's five clauses, the
 *  reply format, and eleven tools — nine map/chart/research verbs plus find_capability and
 *  run_capability. Of the capabilities the registry holds, ELEVEN were named. The rest were
 *  represented by one sentence on one tool: «Search everything IntMap can do.» That names the
 *  DOOR. It does not name one thing behind it, and a model cannot decide to open a door for a
 *  capability it has no reason to believe is there. So every decision Atlas took BEFORE deciding to
 *  search was a decision about a different application — one with nine tools in it, in which the
 *  sentence about an air base and a city is only a sentence about an air base and a city.
 *
 *  ⚠ WHAT THIS ROUND DID NOT DO, AND WHY. It added no clause to js/atlas-policy.js, no gate, no
 *  classifier, no list of words to treat differently. CONSTITUTION.md §5 forbids moving Atlas
 *  toward more limits or more exceptions, and §② of the policy ALREADY says «never judge by
 *  keyword … TRANSFORM it and EXECUTE … full refusal is the LAST resort». That instruction was not
 *  wrong and was not being disobeyed: it cannot be obeyed with a tool the model has not been given
 *  a reason to look for. The defect was reach, so the repair is reach.
 * ==========================================================================*/

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasPolicy } = await import('../js/atlas-policy.js');
const caps = makeAtlasCapabilities({});

/* The index, READ THE WAY THE READER OF IT WOULD — parsed back into the set of ids it names.
   ⚠ NOT a substring search, and not a regex built out of an id. Substring lets `map.clear` be
   "found" inside `map.clearAll`, so the weaker check would pass an index that had lost a
   capability; and building a pattern from data is how this file first shipped, which CodeQL
   correctly failed as incomplete sanitisation (a `.` in an id matched any character). Parsing is
   the honest question anyway: what SET does this text hand Atlas? */
function indexed(text) {
  const out = new Set();
  String(text).split('\n').slice(1).forEach((line) => {
    const colon = line.indexOf(': ');
    if (colon < 0) return;
    line.slice(colon + 2).replace(/\.$/, '').split(',').forEach((id) => {
      const t = id.trim();
      if (t) out.add(t);
    });
  });
  return out;
}

/* ① EVERY capability is named, and the expectation is DERIVED from the registry rather than
      written down here. A list typed into a test is a second source of truth that goes stale on
      the next round that adds a capability — .agents/rules/no-ad-hoc-hardcoding.md §2.4. */
test('R582 ① the index names every capability the registry holds, and nothing else', () => {
  const shown = indexed(caps.index());
  const expected = caps.all().filter((c) => !c.withdrawn).map((c) => c.id);
  assert.ok(expected.length > 100, 'the registry should hold the whole surface, not a slice');
  assert.deepEqual(expected.filter((id) => !shown.has(id)), [],
    'capabilities absent from the index Atlas is shown');
  assert.deepEqual([...shown].filter((id) => !caps.has(id)), [],
    'the index names something the registry does not have');
});

/* ② A WITHDRAWN capability must NOT be advertised: naming it would send Atlas to a door that answers
      with an error. (monitors-retire) The witness was `system.monitor`, removed outright with the
      area monitors, so nothing is withdrawn today — and a check over an empty set is vacuous. The
      registry's own objects carry the flag, so a PRIVATE instance withdraws one capability that the
      index does name, and the index must stop naming it. Real withdrawals are still asked first. */
test('R582 ② withdrawn capabilities are not advertised', () => {
  const shown = indexed(caps.index());
  caps.withdrawn().forEach((id) => {
    assert.ok(!shown.has(id), id + ' is withdrawn but is offered to Atlas');
  });
  const priv = makeAtlasCapabilities({}, { publish: false });
  const victim = priv.all().find((c) => !c.withdrawn && indexed(priv.index()).has(c.id));
  assert.ok(victim, 'the private registry offers at least one capability to withdraw');
  victim.withdrawn = { why: 'a fixture withdrawal' };
  assert.ok(!indexed(priv.index()).has(victim.id), victim.id + ' is withdrawn but is offered to Atlas');
});

/* ③ THE DEFECT, STATED AS A NUMBER. Before this round the simulators Atlas could see at decision
      time was ZERO of thirteen — none of the nine core tools is a simulator. The property is not
      "sim.ballistic is in the string" (that would be a check about one report, and #R488 is what
      happens to checks that pin a spelling); it is that the count Atlas sees equals the count
      IntMap has. */
test('R582 ③ every simulator IntMap has is visible before Atlas decides', () => {
  const shown = indexed(caps.index());
  const sims = caps.all().filter((c) => !c.withdrawn && c.category === 'sim').map((c) => c.id);
  assert.ok(sims.length >= 13, 'expected the sim category to be populated, got ' + sims.length);
  const seen = sims.filter((id) => shown.has(id));
  assert.equal(seen.length, sims.length,
    'Atlas is shown ' + seen.length + ' of ' + sims.length + ' simulators; the reported defect was 0');
});

/* ④ AND IT REACHES SYS(). Read as a syntax tree rather than as text: SYS's body must actually CALL
      the index builder, and the builder must actually ask the registry. A grep for the spelling
      would still pass if `_capIndex` were left defined and never concatenated. */
test('R582 ④ SYS() concatenates the index, and the index comes from the registry', () => {
  /* read, not run: SYS() and _capIndex are closures of the kernel; the call graph is read from its parse
     tree (the index itself is RUN in ①–③, ⑤). */
  const src = read('js/atlas-console.js');
  const ast = parse(src, { ecmaVersion: 2022, sourceType: 'module' });
  const called = new Set();
  let sysFound = false, builderFound = false;

  const walk = (node, inSys, inBuilder) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'FunctionDeclaration' && node.id && node.id.name === 'SYS') { sysFound = true; inSys = true; }
    if (node.type === 'FunctionDeclaration' && node.id && node.id.name === '_capIndex') { builderFound = true; inBuilder = true; }
    if (node.type === 'CallExpression') {
      if (inSys && node.callee.type === 'Identifier') called.add(node.callee.name);
      if (inBuilder && node.callee.type === 'MemberExpression'
        && node.callee.object.type === 'Identifier' && node.callee.property
        && node.callee.property.name === 'index') {
        called.add(node.callee.object.name + '.index');
      }
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'range') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach((c) => walk(c, inSys, inBuilder));
      else if (v && typeof v.type === 'string') walk(v, inSys, inBuilder);
    }
  };
  walk(ast, false, false);

  assert.ok(sysFound, 'SYS() not found in js/atlas-console.js');
  assert.ok(builderFound, '_capIndex() not found in js/atlas-console.js');
  assert.ok(called.has('_capIndex'), 'SYS() does not call _capIndex — the index is built and never sent');
  assert.ok(called.has('CAPS.index'),
    '_capIndex does not read the registry — it would be a second, hand-maintained list');
});

/* ⑤ IT IS AN INDEX, NOT THE CATALOGUE COMING BACK. #R406 took 64,250 characters of prose out of
      the prompt for a measured reason: 「ありがとう」 was costing 41,178 of them. This budget is
      what stops a later round from answering a report by pasting descriptions in here again — the
      documentation stays behind find_capability, where it is fetched for the few ids that matter. */
test('R582 ⑤ the index stays an index', () => {
  const n = caps.index().length;
  assert.ok(n > 1500, 'the index is ' + n + ' bytes — too small to be naming the whole registry');
  assert.ok(n < 8000, 'the index is ' + n + ' bytes; it must not grow back into the catalogue (#R406)');
});

/* ⑥ NO NEW LIMIT WAS ADDED. The policy Atlas is given is still the five clauses #R406 left, and
      §② still forbids keyword judgement. A future round that answers a refusal report by writing
      a sentence into the policy — or a list of sensitive words anywhere near it — fails here, and
      CONSTITUTION.md §5 is the reason. */
test('R582 ⑥ the policy gained no clause and no blocklist', () => {
  const P = makeAtlasPolicy();
  const clauses = ['core', 'sensitiveRequests', 'mapWhatYouName', 'coordinateProvenance', 'turnMechanics'];
  assert.deepEqual(Object.keys(P).filter((k) => typeof P[k] === 'function' && k !== 'all').sort(),
    clauses.slice().sort(), 'js/atlas-policy.js gained or lost a clause');
  assert.ok(/never judge by keyword/.test(P.all()), '#R147 four-axis clause is gone');
  assert.ok(!/\bICBM\b|\bmissile\b|\bnuclear\b/i.test(P.all()),
    'the policy names a weapon — a per-case rule, which .agents/rules/no-ad-hoc-hardcoding.md forbids');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r727-atlas-find-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  #R727 — find_capability reads the catalogue too, and a term is worth what it distinguishes
 * ----------------------------------------------------------------------------
 *  Production verification of #R726 (2026-09-15): asked 「ISSは今どこ？次に東京の上空を通るのはいつ？」,
 *  Atlas searched for «ISS（NORAD 25544）のリアルタイム位置と、指定地点からの次回可視通過予測…» and
 *  got `matches: []` — the aliases are English camelCase words and the category hints are verbs;
 *  the SUBJECT («ISS», 「衛星」) lives only in the catalogue block. Told IntMap had no such control,
 *  Atlas researched a position the satellite layer was propagating and spent seventeen steps.
 *
 *  ① the catalogue block is part of the score, so a request that names the subject reaches the
 *     capability; ② a term is weighted by how few blocks carry it (inverse document frequency in one
 *     line), so the longest block does not win every search; ③ a Latin term is a whole word («iss» is
 *     not inside «missile»); ④ an exact alias still outranks any documentation score; ⑤ the empty
 *     note tells Atlas what to do with the ids it already holds instead of «no such control».
 * ==========================================================================*/

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
const CAPS = makeAtlasCapabilities({});
CAPS.bindRuntime({ docs: makeAtlasCatalogText({}, {}) });
const top = (q) => CAPS.search(q, { want: 3, min: 1 }).ranked.map((r) => r.id);

test('R727 ① the measured request reaches layers.satellites first, in Japanese and in English', () => {
  for (const q of [
    'ISS（NORAD 25544）のリアルタイム位置と、指定地点からの次回可視通過予測（見え始め・最大仰角・見え終わり、方位、仰角、明るさ、JST）',
    'where is the ISS now', 'when does the ISS next pass over Tokyo', 'ISSは今どこ？', 'GPS衛星を見せて',
  ]) assert.equal(top(q)[0], 'layers.satellites', q + ' → ' + top(q).slice(0, 3).join(', '));
});

test('R727 ② a term common to many blocks is worth little, so the longest block does not win', () => {
  /* 「位置」「現在」 sit in dozens of blocks; without the weighting map.clear (the longest block) led the ISS search */
  const ids = top('ISS（NORAD 25544）のリアルタイム位置');
  assert.equal(ids[0], 'layers.satellites', ids.slice(0, 3).join(', '));
  /* read, not run: the weighting is private to the search (a closure over the session's df memo); its
     effect is RUN just above — the ISS request ranks first. */
  const src = codeOnly(readLF(join(ROOT, 'js/atlas-capabilities.js')));
  assert.match(liftFunction(src, 'docTermScore'), /Math\.min\(1, 2 \/ Math\.max\(1, df\)\)/, 'points fall with the number of blocks that carry the term');
});

test('R727 ③ a Latin term is matched as a word — «iss» is not found inside «missile»', () => {
  const src = codeOnly(readLF(join(ROOT, 'js/atlas-capabilities.js')));
  const fn = liftFunction(src, 'hasTerm');
  const hasTerm = new Function('var _termRe = {}; return ' + fn)();
  assert.equal(hasTerm('a missile strike', 'iss'), false);
  assert.equal(hasTerm('the iss passes', 'iss'), true);
  assert.equal(hasTerm('人工衛星を表示', '衛星'), true, 'a CJK window is a substring');
});

test('R727 ④ an exact alias still outranks any documentation score', () => {
  const r = CAPS.search('show live satellites', { want: 1, min: 1 }).ranked;
  assert.equal(r[0].id, 'layers.satellites');
  assert.ok(r[0].score >= 100, 'exact alias = 100 points');
  assert.ok(r[0].score - r[1].score > 30, 'documentation alone cannot close that gap (cap 30)');
  assert.equal(top('rank countries by life expectancy')[0], 'data.rank');
  assert.equal(top('基本表示をデフォルトに戻して')[0], 'layers.baseDisplay');
});

test('R727 ⑤ the empty note points Atlas at the ids it already holds, not at «no such control» alone', async () => {
  /* RUN, not read (consolidation): find_capability is called through the shipped tool surface with a
     wording nothing in the registry carries, and the note Atlas receives is what is asserted. */
  const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
  const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
  const { makeAtlasAgent } = await import('../js/atlas-agent.js');
  /* the search as Atlas runs it when the meaning half WAS consulted and found nothing too (a transport
     that answers, with no similarity for anything) — the note that says rephrasing cannot help */
  const consulted = makeAtlasCapabilities({});
  consulted.bindRuntime({ docs: makeAtlasCatalogText({}, {}), semantic: async () => ({ state: 'ok', model: 'none', sims: {} }) });
  const ask = async (caps) => {
    const surface = makeAtlasToolSurface({ capabilities: caps, schemas: makeAtlasSchemas(), runAction: async () => ({ ok: true }) });
    const r = await surface.makeExecute(surface.baseTools(), makeAtlasAgent())({ id: 'f', name: 'find_capability', arguments: { query: 'qqxv zzwk plorth' } });
    assert.deepEqual(r.matches, [], 'the fixture wording must match nothing');
    return String(r.note || '');
  };
  const words = await ask(CAPS), both = await ask(consulted);
  assert.match(both, /call run_capability with it directly/);
  assert.match(words, /call run_capability with it directly/, 'the ids are pointed at whichever half answered');
  assert.match(both, /Rephrasing this search will not find more/);
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r728-atlas-final-shape-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  #R728 — the second production verification of #R726/#R727, and its three findings
 * ----------------------------------------------------------------------------
 *  ① find_capability returned SIXTY ids and 42 kB of documentation for the ISS request once the
 *     catalogue counted (#R727): half a point per common term summed to «score > 0» for nearly every
 *     capability, and the next model call took 94 s. A term carried by more than four blocks is no
 *     match at all.
 *  ② the reader's last bubble read «{"turn":"continuing","tool_calls":[…» — a forced final reply
 *     that came back as unparsable JSON was handed over as prose. Machine-shaped text is refused.
 *  ③ asked when the ISS next passes over Tokyo, Atlas re-called the satellite tool with invented
 *     modes («track», «track_and_passes») looking for a pass table: the result held ONE pass, a 5°
 *     graze. The result now lists up to three passes within 48 h, and the catalogue says there is
 *     no mode to look for.
 * ==========================================================================*/

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { satelliteFacts } = await import('../js/atlas-result-facts.js');

test('R728 ① a search returns only the capabilities a distinctive term reaches, not the whole registry', () => {
  const CAPS = makeAtlasCapabilities({});
  CAPS.bindRuntime({ docs: makeAtlasCatalogText({}, {}) });
  const total = CAPS.all().filter((c) => !c.withdrawn).length;
  for (const q of ['ISS（NORAD 25544）のリアルタイム位置と、指定地点からの次回可視通過予測（見え始め・最大仰角・見え終わり、方位、仰角、明るさ、JST）', 'where is the ISS now', 'ISSは今どこ？次に東京の上空を通るのはいつ？']) {
    const r = CAPS.search(q, { want: 3, min: 1 }).ranked;
    assert.equal(r[0].id, 'layers.satellites', q);
    assert.ok(r.length <= 12, q + ' → ' + r.length + ' rows of ' + total + ' (was 60)');
  }
  assert.match(codeOnly(readLF(join(ROOT, 'js/atlas-capabilities.js'))), /DOC_TERM_MAX_DF = 4/);
});

test('R728 ② machine-shaped text is not prose — a JSON turn that failed to parse is refused as the answer', () => {
  const A = makeAtlasAgent({});
  const raw = '{"turn":"continuing","tool_calls":[{"name":"run_capability","arguments_json":"{\\"id\\":\\"layers.satellites\\"}"}]} , {"name":"research"';
  assert.equal(A.readReply(null, raw).text, '', 'the raw JSON is not handed to the reader');
  assert.equal(A.readReply(null, '東京は晴れです。').text, '東京は晴れです。', 'prose still passes');
  assert.equal(A.readReply(null, '{"note": "a JSON the model quoted in prose"} — is not the turn schema').text.length > 0, true, 'only the turn schema\'s own keys are refused');
  assert.equal(A.readReply({ final_text: 'ok' }, raw).text, 'ok', 'a parsed reply is read from its fields as before');
});

test('R728 ③ the satellite result lists the next passes within 48 h, not only the first graze', () => {
  const L = (en) => en;
  /* a fake live layer: three passes an orbit apart, the first a 5° graze, then 62°, then 20° */
  const t0 = Date.now(), M = 60000;
  const passes = [
    { none: false, inProgress: false, riseMs: t0 + 10 * M, maxMs: t0 + 13 * M, setMs: t0 + 17 * M, maxEl: 5, durationS: 420 },
    { none: false, inProgress: false, riseMs: t0 + 100 * M, maxMs: t0 + 105 * M, setMs: t0 + 110 * M, maxEl: 62, durationS: 600 },
    { none: false, inProgress: false, riseMs: t0 + 190 * M, maxMs: t0 + 194 * M, setMs: t0 + 198 * M, maxEl: 20, durationS: 480 },
  ];
  let calls = 0;
  const A = { lookFrom: () => ({ elDeg: -30 }), observer: (o) => o, nextPass: (id, from) => { const t = from.getTime(); return passes.find((p) => p.riseMs >= t) || { none: true }; } };
  const found = { id: 25544, lat: 35.1, lng: 139.2, altKm: 423, velKmS: 7.66, periodMin: 93, sunlit: true };
  const txt = satelliteFacts(A, found, { lng: 139.7, lat: 35.7 }, 'Tokyo', L);
  assert.match(txt, /max elevation 5°/, 'the first pass');
  assert.match(txt, /later pass .*max elevation 62°/, 'the second');
  assert.match(txt, /max elevation 20°/, 'the third');
  assert.match(txt, /passes within 48 h: 3\+/);
  assert.match(txt, /a low pass, unlikely to be visible/, 'the graze is still marked');
  /* (consolidation) asked of the catalogue as find_capability serves it for this capability, not of the file */
  const doc = makeAtlasCatalogText({}, {}).text(['layers.satellites']);
  assert.match(doc, /there is no track\/pass mode/, 'and Atlas is told not to look for one');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r783-capability-reachable-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R783 — 宣言された引数で呼べない能力が 0 件であること（扉に届くか）
 * ----------------------------------------------------------------------------
 *  実測。#R773 は添付の取り寄せを実装し、その検査も 9 本緑だったのに、本物のターンで
 *  `run_capability{id:'attach.recall', args:{name:'paper.pdf'}}` は **dispatch に届かず**
 *  `needs_input`（「使用する値を教えてください」）で返っていた。`attach.recall` の唯一の引数は
 *  `name` で、10 列目が宣言した的 `'text'` を満たせる欄は `query/text/question/value/place/term`
 *  ——交わらない。同じ形が `data.radiationNear` にもあった（スキーマは `lat`/`lon` を必須にし、
 *  的 `'point'` は `lng` を読む）。**どちらも、自分のスキーマが許すどの呼び出しでも自分の的を
 *  満たせない能力**＝誰も開けられない扉だった。
 *
 *  ⚠ だからここは 2 件を名指ししない。名指しは 3 件目を見逃す。測るのは構造:
 *  **145 能力すべてについて、スキーマが宣言する欄を埋めた呼び出しが実際に dispatch へ届く**こと。
 *
 *  ⚠ そして「ソースを読む検査」ではない（#R505）。js/atlas-executor.js の本物のカーネルを
 *  install し、dispatch の位置に記録器を置いて、`OS.execute()` を **本当に走らせる**——
 *  availability ②・引数の検証 ③・的の解決 ④・lazy module まで、Atlas が通る道をそのまま通る。
 * ==========================================================================*/

/* カーネルは lazy module を `window.IntMapLazy` に訊く（step ⑤）。node にはそれが無く、
   ReferenceError は `unavailable` になって「届かなかった」を別の理由で作ってしまうので、
   ここでは何も読み込まない need() を置く——測っているのは扉であって読み込みではない。 */
globalThis.window = globalThis.window || {};
if (!globalThis.window.IntMapLazy) globalThis.window.IntMapLazy = { need: async () => {} };

const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { installAtlasKernel } = await import('../js/atlas-executor.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasAgent } = await import('../js/atlas-agent.js');

const HOST = { lang: () => 'en' };

/* スキーマが述べた型・enum・下限・最小要素数・入れ子の必須欄に従って、その欄が取りうる最も
   素直な値を作る。⚠ 値の良さは問わない——`hasTarget` は「在るか」しか訊かないと自分で
   述べている。⚠ 入れ子まで降りるのは必須で、降りないと photo.locate の `area` のように
   **構成した呼び出し自身が不正**になり、測っているものが製品ではなく生成器になる（①b が
   それを見張る）。 */
function value(sc) {
  if (!sc) return 'x';
  if (Array.isArray(sc.enum) && sc.enum.length) return sc.enum[0];
  switch (sc.type) {
    case 'boolean': return true;
    case 'number': case 'integer': {
      let v = (sc.minimum != null && sc.maximum != null) ? (sc.minimum + sc.maximum) / 2
        : (sc.minimum != null ? sc.minimum : 1);
      return sc.type === 'integer' ? Math.round(v) : v;
    }
    case 'array': {
      const n = Math.max(1, sc.minItems || 1), out = [];
      for (let i = 0; i < n; i++) out.push(value(sc.items || { type: 'string' }));
      return out;
    }
    case 'object': return fill(sc);
    default: return 'x'.repeat(Math.max(1, sc.minLength || 1));
  }
}
function fill(sc) {
  const a = {};
  for (const k of Object.keys((sc && sc.properties) || {})) a[k] = value(sc.properties[k]);
  return a;
}
/* その能力が「引数なしでは働けない」と自分で述べているか（js/atlas-schemas.js の規則 3）。 */
function demandsArgs(sc) {
  if (!sc) return false;
  if (Array.isArray(sc.required) && sc.required.length) return true;
  return Array.isArray(sc.anyOf) && sc.anyOf.some((b) => Array.isArray(b.required) && b.required.length);
}

/* 本物のカーネルを 1 回だけ組む。dispatch の位置には記録器——「届いたか」は
   ステータスの綴りではなく、**engine の側が呼ばれた事実**で測る。 */
const CAPS = makeAtlasCapabilities(HOST);
const SCHEMAS = makeAtlasSchemas();
let received = null;
const dispatch = (a) => { received = a; return { ok: true, html: '' }; };
CAPS.bindRuntime({ schemas: SCHEMAS, dispatch: dispatch });
const OS = {};
installAtlasKernel(OS, HOST, { capabilities: CAPS });

async function run(id, args) {
  received = null;
  const r = await OS.execute(id, args);
  return { result: r, reached: received };
}

const SUBJECTS = CAPS.all().filter((c) => !c.withdrawn)
  .map((c) => ({ cap: c, sc: (() => { try { return SCHEMAS.schemaFor(c.id); } catch (_) { return null; } })() }))
  .filter((s) => s.sc && s.sc.properties && Object.keys(s.sc.properties).length);

test('R783 ①: スキーマが宣言する欄を埋めた呼び出しは、145 能力すべてで dispatch に届く', async () => {
  /* 母集合が縮めばこの検査は何も見ない（#R707 の床の分母）。今日の実測は 144。 */
  assert.ok(SUBJECTS.length >= 140, '引数スキーマを持つ能力が ' + SUBJECTS.length + ' 件しか見えていない');
  const unreachable = [];
  for (const { cap, sc } of SUBJECTS) {
    const { result, reached } = await run(cap.id, fill(sc));
    if (!reached) {
      unreachable.push(cap.id + ' → ' + result.status + '/' + result.code
        + ' (target «' + ((cap.targetPolicy && cap.targetPolicy.kind) || '') + '»'
        + ' / schema declares ' + Object.keys(sc.properties).join(', ') + ')');
    }
  }
  assert.deepEqual(unreachable, [],
    '自分のスキーマが許す呼び出しで自分の的を満たせない＝Atlas からはどう呼んでも読者への質問に落ちる。'
    + '直すのは事例ではなく 10 列目: スキーマが既にその引数を required にしているなら、'
    + 'js/atlas-capabilities.js の的の列は空であるべきで、門は required 1 つになる（②がそれを測る）。'
    + '⚠ hasTarget の欄名一覧に足して直してはならない——同じ的を持つ他の能力すべてで的の意味が緩む。');
});

test('R783 ①b: 構成した呼び出しはスキーマに適合している（測っているのは製品であって生成器ではない）', async () => {
  const rejected = [];
  for (const { cap, sc } of SUBJECTS) {
    const { result } = await run(cap.id, fill(sc));
    if (result.code === 'bad_args') rejected.push(cap.id + ' ' + JSON.stringify((result.observed && result.observed.errors) || []));
  }
  assert.deepEqual(rejected, [], 'カーネル自身が不正と述べた呼び出しで①を測っていた——値の生成器を直すこと');
});

test('R783 ②: 引数なしでは働けないと述べた能力は、引数なしの呼び出しを dispatch の前で拒む', async () => {
  /* ⚠ 的の列を空にすることが安全なのは、拒否が**消えず移った**ときだけ。移った先は
     js/atlas-toolsurface.js の 2 度目の検証で、そこが Atlas の送ったものを required ごと
     測る（カーネルの ③ は `inputSchema` が required を落とすので測らない——読者が押した
     ボタンの resume 経路を bad_args にしないため）。 */
  const agent = makeAtlasAgent();
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction: dispatch });
  const tools = surface.baseTools();
  const execute = surface.makeExecute(tools, agent);
  const demanding = SUBJECTS.filter((s) => demandsArgs(s.sc));
  assert.ok(demanding.length >= 80, '引数を要求する能力が ' + demanding.length + ' 件しか見えていない');
  const slipped = [];
  for (const { cap } of demanding) {
    received = null;
    const r = await execute({ name: 'run_capability', arguments: { id: cap.id, args: {} } });
    if (r && r.ok !== false) slipped.push(cap.id + ' → accepted');
    else if (received) slipped.push(cap.id + ' → refused but the dispatch already ran');
  }
  assert.deepEqual(slipped, [],
    '自分で必須と述べた引数の無い呼び出しが engine に届いた。的の列を空にしてよいのは、'
    + 'スキーマの required がこの拒否を持っているときだけである（#R302 の退行条件）。');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r801-atlas-confirm-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  IntMap · R801 — WHAT LEAVES THE DEVICE, OR ENTERS THE MODEL, IS NOT CONFIRM-FREE
 * ----------------------------------------------------------------------------
 *  External content (a news article, an attachment, a fetched page) can carry instructions.
 *  Whatever the model makes of them, the capability table is the one place that says, per
 *  operation, whether a reader has to be asked first (column 8 of js/atlas-capabilities.js:
 *  'none' | 'explicit' | 'always'). This check reads the EVALUATED table and asks two questions
 *  about it — as facts about rows, not as a list of spellings to keep:
 *
 *   ① every row whose risk is 'external' (something leaves the device) is not confirm-free;
 *   ② every row that brings new material INTO the next model input — the reader's earlier
 *      attachments, the pixels on screen, the device position — is not confirm-free.
 *
 *  ② cannot yet be selected by a column. The `produces` vocabulary names what a run puts in front
 *  of the READER (map, panel, explanation, …) and has no value for «goes into the next model
 *  call»; those rows all say 'explanation' like research.brief does. So ② selects by id, and the
 *  last test below is the expiry condition: the moment the table grows a product that names model
 *  input, this file must switch to that property and drop the ids.
 * ==========================================================================*/

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const CAPS = makeAtlasCapabilities({});
const ALL = CAPS.all().filter((c) => !c.withdrawn);

/* the column's whole vocabulary (js/atlas-capabilities.js, column 8) — anything else is a typo */
const CONFIRM_VALUES = new Set(['none', 'explicit', 'always']);

/* ② — selected by id, with the reason each one carries model input (see the header) */
const MODEL_INPUT_CARRIERS = [
  { match: (id) => /^attach\./.test(id), why: 'puts a past attachment back into the next model call' },
  { match: (id) => id === 'view.inspect', why: 'hands the model the pixels on screen' },
  { match: (id) => id === 'view.locate', why: 'reads the device position and returns it to the model' },
];

test('R801 ⓪: the confirm column only holds its three declared values', () => {
  for (const c of ALL) {
    assert.ok(CONFIRM_VALUES.has(c.confirmation), `${c.id}: confirmation=${JSON.stringify(c.confirmation)}`);
  }
});

test('R801 ①: a row whose risk is external is not confirm-free', () => {
  const external = ALL.filter((c) => c.risk === 'external');
  assert.ok(external.length > 0, 'the table has at least one external-risk row (navigation.start today)');
  const free = external.filter((c) => c.confirmation === 'none');
  assert.deepEqual(free.map((c) => c.id), [], 'external risk with confirm=none: ' + free.map((c) => c.id).join(', '));
});

test('R801 ②: a row that carries material into the next model input is not confirm-free', () => {
  const free = [];
  for (const sel of MODEL_INPUT_CARRIERS) {
    const rows = ALL.filter((c) => sel.match(c.id));
    /* a selector that matches nothing is guarding nothing — a rename must be noticed here */
    assert.ok(rows.length > 0, `selector "${sel.why}" matches no row — the id it named was renamed or withdrawn`);
    for (const c of rows) if (c.confirmation === 'none') free.push(`${c.id} (${sel.why})`);
  }
  /* all of them at once, so one run names every row that has to change */
  assert.deepEqual(free, [], 'confirm=none on: ' + free.join('; '));
});

/* ══ column 11, `ingests` — which rows hand the model a THIRD PARTY's sentences ═══════════════════
   Selected by id, for the same reason ② is: nothing in the row distinguishes «an explanation IntMap
   computed» (data.value) from «an explanation built from fetched pages» (research.brief) — both say
   produces:'explanation', risk:'read', observer 'none'. The column IS that distinction, and this list
   is the expiry condition for keeping it hand-stamped: a row added to the registry that fetches or
   quotes outside text has to be added here, or js/atlas-agent.js will treat its result as IntMap's own. */
const INGESTS_VALUES = new Set(['', 'external']);
const THIRD_PARTY_ROWS = {
  'research.brief': 'a brief built from Wikipedia and live news',
  'research.analyze': 'an analysis over gathered evidence and web verification',
  'research.impact': 'an impact report over gathered articles',
  'research.events': 'events read out of the news feed',
  'reader.gloss': 'a gloss of a phrase, built from web text',
  'attach.recall': 'a file the reader attached, put back in front of the model',
  'data.query': 'rows out of a file the reader loaded',
  'news.category': 'headlines from the loaded feed',
};

test('R801 ④: the ingests column only holds its two declared values, and rows that omit it ingest nothing', () => {
  for (const c of ALL) assert.ok(INGESTS_VALUES.has(c.ingests), `${c.id}: ingests=${JSON.stringify(c.ingests)}`);
  assert.ok(ALL.some((c) => c.ingests === ''), 'the cell is optional — most rows leave it empty');
  const audit = CAPS.toJSON().capabilities;
  for (const c of audit) assert.ok(INGESTS_VALUES.has(c.ingests), `toJSON: ${c.id} carries ${JSON.stringify(c.ingests)}`);
});

test('R801 ⑤: every row that returns a third party\'s sentences says so (research.*, attach.recall, data.query, reader.gloss, news.category)', () => {
  const missing = [];
  for (const id of Object.keys(THIRD_PARTY_ROWS)) {
    const c = ALL.find((x) => x.id === id);
    assert.ok(c, `${id} was renamed or withdrawn — update THIRD_PARTY_ROWS`);
    if (c.ingests !== 'external') missing.push(`${id} (${THIRD_PARTY_ROWS[id]})`);
  }
  assert.deepEqual(missing, [], 'ingests is not external on: ' + missing.join('; '));
});

test('R801 ③ (expiry): the moment `produces` can name model input, select ② by that column', () => {
  const vocab = new Set();
  for (const c of ALL) for (const p of c.produces) vocab.add(p);
  const named = [...vocab].filter((p) => /model|prompt|input|context/i.test(p));
  assert.deepEqual(named, [], 'the table now names model input as a product (' + named.join(', ') + ') — replace MODEL_INPUT_CARRIERS with that property');
});
}
