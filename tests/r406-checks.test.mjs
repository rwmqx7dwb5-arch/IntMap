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
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

/* Comments are not code. #R345 counted a check that matched its own explanatory paragraph, and it
   has happened twelve times since; strip them before asking whether the tree does something. */
function codeOnly(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1 ');
}

const CONSOLE_SRC = read('js/atlas-console.js');
const CONSOLE_CODE = codeOnly(CONSOLE_SRC);

/* ── ① the meaning-deciding layer is gone from the tree ───────────────────────────────────── */
test('R406 ①: the request profile, the intent gates and the plan rewriter are not in js/ any more', () => {
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
  /* js/atlas-planner.js:94 decided `outputs.explanation` and js/atlas-console.js:5051 decided
     `informational`; both keyed on the SAME [?？] class, so 「セーヌ川の長さは・」 failed both. */
  assert.doesNotMatch(CONSOLE_CODE, /\[\?？\]/, 'a question-mark character class is still deciding meaning');
  assert.doesNotMatch(CONSOLE_CODE, /\bTIMEVAR\b|\bSOCIAL\b|informational/, 'the live-source override regexes are still here');
});

/* ── ③ the catalogue is no longer pushed at the model ─────────────────────────────────────── */
test('R406 ③: the system prompt does not carry the action catalogue', () => {
  const i = CONSOLE_CODE.indexOf('function SYS(');
  assert.ok(i > 0);
  const sys = CONSOLE_CODE.slice(i, CONSOLE_CODE.indexOf('function _toolBlock(', i));
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

test('R406 ④b: the registry no longer hands every capability the same schema literal', () => {
  const caps = codeOnly(read('js/atlas-capabilities.js'));
  assert.doesNotMatch(caps, /inputSchema:\s*\{\s*type:\s*'object'\s*\}/,
    'build() is hard-coding one empty schema for all of them again');
});

/* ── ⑤ the loop's ceilings are technical, and inside the server's ─────────────────────────── */
test('R406 ⑤: the turn loop cannot outspend the server budget it is charged against', async () => {
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  const { LIMITS } = (await import('../js/atlas-agent.js')).makeAtlasAgent();
  const proxy = read('supabase/functions/ai-proxy/index.ts');
  const m = proxy.match(/TURN_MAX_CALLS\s*=\s*(\d+)/);
  assert.ok(m, 'the server no longer declares a per-turn call cap — this check must be re-aimed');
  const cap = +m[1];
  /* the loop may need one extra call to write the closing sentence (agent.js's forced final) */
  assert.ok(LIMITS.maxSteps + 1 <= cap,
    `the loop may make ${LIMITS.maxSteps + 1} calls against a server cap of ${cap}: the reader's LAST step would 429`);
});

test('R406 ⑤b: ai-proxy accepts the turn task, enforces its envelope on every provider, and still accepts the old one', () => {
  const p = read('supabase/functions/ai-proxy/index.ts');
  assert.match(p, /TASKS = new Set\(\[[\s\S]{0,600}?"atlas_turn"/, 'atlas_turn is not an accepted task');
  assert.match(p, /JSON_TASKS = new Set\(\["atlas_turn"/, 'atlas_turn is not a JSON task, so its envelope is unenforced');
  assert.match(p, /atlas_turn:\s*\d+/, 'atlas_turn has no output budget and would fall to the default');
  /* a reader still holding the previous bundle keeps working until the cache turns over */
  assert.match(p, /"atlas_plan"/, 'atlas_plan was removed while cached clients may still send it');
});

/* ── ⑥ the reader is shown one answer, not a tally of failed steps ────────────────────────── */
test('R406 ⑥: the counted-failure banners are gone and the answer is no longer suppressed on failure', () => {
  assert.doesNotMatch(CONSOLE_CODE, /primaryFails|secondaryFails/, 'the failed-action banners are back');
  assert.doesNotMatch(CONSOLE_CODE, /_allFailed\s*&&|&&\s*!_visFailed/, 'the answer is being suppressed by a failure count again');
  const i = CONSOLE_CODE.indexOf('function _atlCompose(');
  const body = CONSOLE_CODE.slice(i, CONSOLE_CODE.indexOf('async function runActions(', i) + 1);
  assert.match(body, /let head=say\?/, 'the head is no longer simply the answer');
});

test('R406 ⑥b: the turn asks the model for the web, instead of forbidding it', () => {
  const i = CONSOLE_CODE.indexOf('async function run(');
  const body = CONSOLE_CODE.slice(i, CONSOLE_CODE.indexOf('function recordTurn(', i));
  assert.match(body, /task:'atlas_turn'[^}]*webMode:'auto'/, "the turn call does not enable the model's own web search");
  assert.doesNotMatch(body, /webMode:'off'/, 'the turn pins web search off again');
});
