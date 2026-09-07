/* ============================================================================
 *  R534 — "Simulations open:" was printing the KEY, never the VALUE
 * ----------------------------------------------------------------------------
 *  Reported: Atlas was shown the map and asked what was on it, and answered with a radiation or
 *  an insolation simulation. Neither was on. Nothing was wrong with the image, the vision channel
 *  or the modules — the state pipeline was right the whole way down and the LAST step threw the
 *  answer away:
 *
 *    js/atlas-console.js `_simulationState()` PROBES every module — `state()`, `isOpen()`,
 *    `painted()` — and records what came back, so a module that is merely LOADED publishes an
 *    honest `{open:false}` / `{painted:false}`.
 *    js/atlas-state.js `renderPrompt()` then printed `Object.keys(sim)` and called them all OPEN.
 *
 *  So the fix is not a new schema; it is reading the value that was already there. What the checks
 *  below have to establish is that the reading cannot silently go wrong again:
 *
 *    ① the reported shape produces no sentence at all
 *    ② a simulation that really IS on is still named — the line has not simply been deleted
 *    ③ PARAMETERS are not presence (why "any truthy field" would have restated the same falsehood)
 *    ④ the old line, re-expressed here, produces the false sentence — so ① cannot pass by accident
 *    ⑤ the vocabulary the renderer trusts is READ OFF the provider rather than written twice
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasState } = await import('../js/atlas-state.js');

const S = makeAtlasState();
/* only the section under test — every other section stays absent, which renderPrompt renders as
   silence (the rule tests/r413-checks.test.mjs §③ fixed: absent subsystem is not idle subsystem). */
const line = (simulations) => S.renderPrompt({ simulations });

/* ══ ① THE REPORTED SHAPE ═════════════════════════════════════════════════════════════════════
   This is what `_simulationState()` publishes for the two modules IntMap builds at boot
   (js/app-body.js) when the reader has touched neither: radiation answers `isOpen()` false, and
   insolation carries `painted:false` inside `state()`. Both were being announced as open. */
test('R534 ①: a simulation that answered "no" is not announced as open', () => {
  const got = line({ radiation: { open: false }, insolation: { painted: false } });
  assert.doesNotMatch(got, /Simulations open/,
    'radiation said open:false and insolation said painted:false — neither is on the map');
  assert.doesNotMatch(got, /radiation/, 'and neither is named at all');
  assert.doesNotMatch(got, /insolation/, 'and neither is named at all');
});

test('R534 ①b: the falsehood is gone for the whole vocabulary, not just for `open`', () => {
  /* `painted:false` was the second half of the report, and it travels a different route into the
     snapshot than `open` does (state(), not isOpen()) — so it is asserted separately. */
  assert.equal(line({ insolation: { painted: false } }), '', 'painted:false alone says nothing');
  assert.equal(line({ radiation: { open: false } }), '', 'open:false alone says nothing');
  assert.equal(line({}), '', 'no module loaded says nothing');
  assert.equal(line(null), '', 'and a section nobody published still says nothing');
});

/* ══ ② THE LINE STILL WORKS ═══════════════════════════════════════════════════════════════════
   ⚠ The cheapest way to make ① pass is to delete the sentence. These are the checks that stop it. */
test('R534 ②: a simulation that IS on is still named', () => {
  assert.match(line({ radiation: { open: true } }), /Simulations open: radiation\./,
    'radiation with its panel up (or its plume source holding features) is reported');
  assert.match(line({ insolation: { painted: true } }), /Simulations open: insolation\./,
    'insolation with a raster actually laid down is reported');
});

test('R534 ②b: with several loaded, exactly the active ones are named', () => {
  const got = line({
    seismic: { open: false, epi: null, mw: 7 },
    radiation: { open: true },
    insolation: { painted: false, grid: null },
    tsunami: { open: true, busy: true, sim: null }
  });
  assert.match(got, /Simulations open: /, 'the sentence is emitted');
  const named = got.match(/Simulations open: ([^.]+)\./)[1].split(', ');
  assert.deepEqual(named.sort(), ['radiation', 'tsunami'],
    'the two that answered yes, and only those two');
});

/* ══ ③ A PARAMETER IS TRUTHY FOR FREE ═════════════════════════════════════════════════════════
   The obvious repair — "keep the keys whose state has anything truthy in it" — is wrong, and this
   is the shape that proves it. js/viewshed.js:745 publishes its five solver parameters whether or
   not the panel is up, and numbers like `obsH:2` / `rangeKm:60` / `k:1.3333` are truthy always. A
   truthiness rule would have gone on announcing LOS as open, in a new shape. */
test('R534 ③: solver parameters are not a claim that anything is displayed', () => {
  const shut = { los: { site: null, obsH: 2, tgtH: 0, rangeKm: 60, k: 1.3333, mhz: 0, open: false, last: null } };
  assert.equal(line(shut), '', 'LOS with its panel shut is silent, despite three truthy numbers');

  const anyTruthy = (sim) => Object.keys(sim).filter((k) =>
    sim[k] && typeof sim[k] === 'object' && Object.keys(sim[k]).some((f) => sim[k][f]));
  assert.deepEqual(anyTruthy(shut), ['los'],
    '⚠ the "any truthy field" repair would have kept naming it — which is why it is not the rule');

  assert.match(line({ los: { site: [135.5, 34.7], obsH: 2, rangeKm: 60, open: true, last: null } }),
    /Simulations open: los\./, 'and the same module IS named once its panel is up');
});

/* ══ ④ THE DEFECT, RE-EXPRESSED ═══════════════════════════════════════════════════════════════
   Restoring the old implementation has to turn ① red. Writing it out here is what makes ① a test
   of the fix rather than a test that the two modules happen to be spelled the way they are. */
test('R534 ④: the pre-#R534 line produces exactly the false sentence that was reported', () => {
  const OLD = (sim) => (sim && Object.keys(sim).length)
    ? 'Simulations open: ' + Object.keys(sim).join(', ') + '.' : '';

  const reported = { radiation: { open: false }, insolation: { painted: false } };
  assert.equal(OLD(reported), 'Simulations open: radiation, insolation.',
    'this is the sentence Atlas was given, from state in which BOTH modules said no');
  assert.notEqual(line(reported), OLD(reported), 'and it is not the sentence Atlas is given now');

  /* the same defect stated as a property: the old line could not tell the two apart at all */
  assert.equal(OLD({ radiation: { open: false } }), OLD({ radiation: { open: true } }),
    '⚠ on and off rendered identically, because the value was never read');
  assert.notEqual(line({ radiation: { open: false } }), line({ radiation: { open: true } }),
    'they no longer do');
});

/* ══ ⑤ ONE VOCABULARY, READ OFF THE PROVIDER ══════════════════════════════════════════════════
   ⚠ NOT a second hand-written list of field names. The provider decides what a presence field is
   called: `_simulationState()` writes `st.open` from `isOpen()` and `st.painted` from `painted()`,
   and those two assignments ARE the vocabulary. If a later round teaches the provider a third
   probe — `st.active = !!m.active()`, say — this goes red until the renderer is told about it,
   instead of that module silently dropping out of the sentence.
   (#R529's lesson, applied one size down: do not maintain by hand a list the source already has.) */
const SIM_STATE_SRC = (() => {
  const src = read('js/atlas-console.js');
  const at = src.indexOf('function _simulationState()');
  assert.ok(at > 0, 'js/atlas-console.js still defines the provider this section reads');
  return src.slice(at, src.indexOf('return o; }', at));
})();

test('R534 ⑤: the renderer trusts exactly the presence fields the provider writes', () => {
  const written = [...SIM_STATE_SRC.matchAll(/\bst\.([A-Za-z_$][\w$]*)\s*=/g)].map((m) => m[1]);
  assert.ok(written.length, 'the provider assigns presence fields by name');

  const decl = read('js/atlas-state.js').match(/var SIM_PRESENT = \[([^\]]*)\]/);
  assert.ok(decl, 'the renderer declares its presence vocabulary in one place');
  const trusted = [...decl[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

  assert.deepEqual(trusted.slice().sort(), [...new Set(written)].sort(),
    'every field the provider can publish as presence is read, and nothing else is invented here');
});

test('R534 ⑤b: the provider still asks each module rather than assuming', () => {
  /* the half of the pipeline that was never broken — recorded so a "simplification" that goes back
     to inferring from "something was started" (the #R290 reading order) has to face a red test. */
  for (const probe of ['state', 'isOpen', 'painted'])
    assert.match(SIM_STATE_SRC, new RegExp(`typeof m\\.${probe}\\s*===\\s*'function'`),
      `the provider asks ${probe}() before believing anything about it`);
  assert.match(SIM_STATE_SRC, /if\(!m\) return;/,
    'a module that was never loaded produces no key — absent is not idle');
});
