/* ============================================================================
 *  R569 — WHAT ATLAS CAN SEE AT THE MOMENT IT DECIDES
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
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasPolicy } = await import('../js/atlas-policy.js');
const caps = makeAtlasCapabilities({});

/* ① EVERY capability is named, and the expectation is DERIVED from the registry rather than
      written down here. A list typed into a test is a second source of truth that goes stale on
      the next round that adds a capability — .agents/rules/no-ad-hoc-hardcoding.md §2.4. */
test('R569 ① the index names every capability the registry holds', () => {
  const idx = caps.index();
  const expected = caps.all().filter((c) => !c.withdrawn).map((c) => c.id);
  assert.ok(expected.length > 100, 'the registry should hold the whole surface, not a slice');
  const missing = expected.filter((id) => !new RegExp('(^|[ :])' + id.replace(/\./g, '\\.') + '[,.]').test(idx));
  assert.deepEqual(missing, [], 'capabilities absent from the index Atlas is shown');
});

/* ② A WITHDRAWN capability must NOT be advertised. `system.monitor` was removed in #R231 and
      returns FEATURE_WITHDRAWN; naming it would send Atlas to a door that answers with an error. */
test('R569 ② withdrawn capabilities are not advertised', () => {
  const idx = caps.index();
  const gone = caps.withdrawn();
  assert.ok(gone.length >= 1, 'this check is vacuous if nothing is withdrawn');
  gone.forEach((id) => {
    assert.ok(idx.indexOf(id) < 0, id + ' is withdrawn but is offered to Atlas');
  });
});

/* ③ THE DEFECT, STATED AS A NUMBER. Before this round the simulators Atlas could see at decision
      time was ZERO of thirteen — none of the nine core tools is a simulator. The property is not
      "sim.ballistic is in the string" (that would be a check about one report, and #R488 is what
      happens to checks that pin a spelling); it is that the count Atlas sees equals the count
      IntMap has. */
test('R569 ③ every simulator IntMap has is visible before Atlas decides', () => {
  const idx = caps.index();
  const sims = caps.all().filter((c) => !c.withdrawn && c.category === 'sim').map((c) => c.id);
  assert.ok(sims.length >= 13, 'expected the sim category to be populated, got ' + sims.length);
  const seen = sims.filter((id) => idx.indexOf(id) >= 0);
  assert.equal(seen.length, sims.length,
    'Atlas is shown ' + seen.length + ' of ' + sims.length + ' simulators; the reported defect was 0');
});

/* ④ AND IT REACHES SYS(). Read as a syntax tree rather than as text: SYS's body must actually CALL
      the index builder, and the builder must actually ask the registry. A grep for the spelling
      would still pass if `_capIndex` were left defined and never concatenated. */
test('R569 ④ SYS() concatenates the index, and the index comes from the registry', () => {
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
test('R569 ⑤ the index stays an index', () => {
  const n = caps.index().length;
  assert.ok(n > 1500, 'the index is ' + n + ' bytes — too small to be naming the whole registry');
  assert.ok(n < 8000, 'the index is ' + n + ' bytes; it must not grow back into the catalogue (#R406)');
});

/* ⑥ NO NEW LIMIT WAS ADDED. The policy Atlas is given is still the five clauses #R406 left, and
      §② still forbids keyword judgement. A future round that answers a refusal report by writing
      a sentence into the policy — or a list of sensitive words anywhere near it — fails here, and
      CONSTITUTION.md §5 is the reason. */
test('R569 ⑥ the policy gained no clause and no blocklist', () => {
  const P = makeAtlasPolicy();
  const clauses = ['core', 'sensitiveRequests', 'mapWhatYouName', 'coordinateProvenance', 'turnMechanics'];
  assert.deepEqual(Object.keys(P).filter((k) => typeof P[k] === 'function' && k !== 'all').sort(),
    clauses.slice().sort(), 'js/atlas-policy.js gained or lost a clause');
  assert.ok(/never judge by keyword/.test(P.all()), '#R147 four-axis clause is gone');
  assert.ok(!/\bICBM\b|\bmissile\b|\bnuclear\b/i.test(P.all()),
    'the policy names a weapon — a per-case rule, which .agents/rules/no-ad-hoc-hardcoding.md forbids');
});
