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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { auditWith } = await import('../scripts/atlas-capability-audit.mjs');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
/* (#R406) the audit reads the real argument schemas the same way scripts/atlas-capability-audit.mjs does */
const SCHEMAS = (await import('../js/atlas-schemas.js')).makeAtlasSchemas();
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');

const CONTROLS = read('js/atlas-controls.js');
const catBody = (CONTROLS.match(/function controlCatalog\([\s\S]*?\n    \}/) || [''])[0];

/* ── ① the control catalogue ranks, and admits what it dropped ─────────────────────────────── */

test('R320 ①a: controlCatalog caps against the REQUEST, not against document order', () => {
  assert.ok(catBody, 'controlCatalog() was not found — this file reads nothing');
  assert.match(catBody, /forRequest/, 'the catalogue no longer sees the request it is being built for');
  assert.match(catBody, /_ctlRelevance/, 'and no longer scores against it');
  assert.match(CONTROLS, /function _ctlRelevance\(/, 'the scorer is gone');
  /* the cap itself is allowed — MAX_SYSTEM is real — but only as a number with a name */
  assert.match(catBody, /CTL_MAX/, 'the cap is an unnamed literal again');
});

test('R320 ①b: a dropped control is COUNTED and SAID, because a silent cap reads as completeness', () => {
  assert.match(catBody, /dropped/, 'nothing counts what was left out');
  assert.match(catBody, /not listed here|more on-screen control/i,
    'the catalogue truncates without telling the planner that it did');
  /* …and naming one anyway must still work: the cap is a PROMPT budget, not a reachability rule */
  assert.match(catBody, /will still be found/, 'the note must say the unlisted ones are still reachable');
});

test('R320 ①c: the audit can go red on a silent cap', () => {
  const damaged = CONTROLS
    .replace(/'  … and '\+dropped\+' more on-screen control\(s\)[^']*'/, "''");
  assert.notEqual(damaged, CONTROLS, 'the fixture did not change anything — the announcement moved');
  const checks = auditWith({
    caps: makeAtlasCapabilities({}), docs: makeAtlasCatalogText({}, {}),
    atlas: read('js/atlas-console.js').split(/\r?\n/), controls: damaged,
    capSrc: read('js/atlas-capabilities.js'), execSrc: read('js/atlas-executor.js'),
    stateSrc: read('js/atlas-state.js'),
    resultsSrc: read('js/atlas-results.js'),
  });
  const f = (checks.find((c) => c.id === 'no-silent-cap') || { failures: [] }).failures;
  assert.ok(f.length, 'removing the announcement must be caught — that IS the defect');
});

/* ── ② the generic control refuses to guess between near-equals ─────────────────────────────── */

test('R320 ②: doControl answers ambiguous_target instead of pressing one of several matches', () => {
  const code = codeOnly(CONTROLS);
  assert.match(code, /function controlCandidates\(/, 'nothing enumerates the near field');
  assert.match(code, /_lastControlField/, 'findControl no longer records what else scored');
  assert.match(code, /code:'ambiguous_target'/, 'doControl still takes the top score whatever the field looks like');
  /* the threshold is a RATIO — an exact id next to a word match is not a tie */
  assert.match(code, /c\.sc>=bs\*0\.9\d/, 'the tie test is an absolute number again; it has to be relative to the best');
  /* and the kernel has to be able to read it */
  assert.match(read('js/atlas-capabilities.js'), /raw\.meta\.code === 'ambiguous_target'/,
    'the control verifier no longer turns an ambiguous match into needs_input');
});

/* ── ③ a subsystem that has not loaded is not a missing subsystem ───────────────────────────── */

test('R320 ③a: the module catalogue names the modules that load on demand', () => {
  const code = codeOnly(CONTROLS);
  assert.match(code, /IntMapLazy/, 'moduleCatalog still walks only Object.keys(window)');
  assert.match(code, /loads on demand/, 'and does not mark which ones have not arrived yet');
  assert.match(read('js/lazy-modules.js'), /publishes: \(n\) => PUBLISHES\[n\]/,
    'js/lazy-modules.js no longer exposes the manifest the catalogue reads');
});

test('R320 ③b: doModule fetches the module instead of answering "not found"', () => {
  const code = codeOnly(CONTROLS);
  assert.match(code, /LZ\.need\(want\)/, 'doModule no longer asks for a module that has not arrived');
  /* ⚠ and it must RETURN the promise, or the kernel's completion wait covers only the lookup */
  assert.match(code, /return LZ\.need\(want\)\.then\(/, 'the fetch is fire-and-forget — the kernel cannot wait for it');
  /* the method list is still a closed allow-list: this round widens reach, not permission */
  assert.match(code, /MOD_METHODS\.indexOf\(meth\)<0/, 'the method allow-list is gone — arbitrary calls are back');
});

test('R320 ③c: every lazy module the loader publishes is a name the catalogue can offer', () => {
  const lazy = read('js/lazy-modules.js');
  const block = (lazy.match(/const PUBLISHES = \{[\s\S]*?\n    \};/) || [''])[0];
  assert.ok(block, 'the PUBLISHES manifest moved');
  const names = [...block.matchAll(/'(IntMap[A-Za-z0-9]+)'/g)].map((m) => m[1]);
  assert.ok(names.length >= 8, `only ${names.length} publishable module names — the manifest shrank`);
  /* MOD_RE is what decides whether a name may be offered at all */
  const re = /const MOD_RE=(\/[^\/]+\/)/.exec(CONTROLS);
  assert.ok(re, 'MOD_RE moved');
  const test_ = new RegExp(re[1].slice(1, -1));
  const unofferable = names.filter((n) => !test_.test(n));
  assert.deepEqual(unofferable, [], 'these lazy modules can never be named to the planner');
});

/* ── ④ nothing regressed in the kernel this builds on ───────────────────────────────────────── */

test('R320 ④: the capability audit is still green, and still asks twenty-two questions', () => {
  const checks = auditWith({
    caps: makeAtlasCapabilities({}), docs: makeAtlasCatalogText({}, {}),
    atlas: read('js/atlas-console.js').split(/\r?\n/), controls: CONTROLS,
    capSrc: read('js/atlas-capabilities.js'), execSrc: read('js/atlas-executor.js'),
    stateSrc: read('js/atlas-state.js'),
    resultsSrc: read('js/atlas-results.js'),
    toolsSrc: read('js/atlas-toolsurface.js'),
    schemas: SCHEMAS,
  });
  assert.equal(checks.length, 22, 'a capability check was added or lost — #R406 added argument-schemas and required-arguments');
  assert.deepEqual(checks.filter((c) => c.failures.length).map((c) => c.id), []);
});
