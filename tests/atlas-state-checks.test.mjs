/* ============================================================================
 *  Atlas · what the turn is told about the app — js/atlas-state.js renderPrompt() / snapshot()
 * ----------------------------------------------------------------------------
 *  (tests-by-topic) Gathered from four round files; every test keeps the title it had there:
 *    · tests/r534-checks.test.mjs              — 「Simulations open:」 printed the KEY, never the VALUE
 *    · tests/r742-layer-origin-checks.test.mjs — a layer that is on says where it came from
 *    · tests/r783-clipped-body-checks.test.mjs — a clip that says so
 *    · tests/r726-atlas-eval-checks.test.mjs ⑪ (state) — Atlas is told what of its own is still on the map
 *  Their histories follow, each above its own tests.
 * ==========================================================================*/
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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const src = (p) => codeOnly(readLF(join(ROOT, p)));   /* (#R726's reader: code only, LF only) */

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
  /* kept as a spelling: the provider is closure code inside js/atlas-console.js, and the cap is a declared policy constant read as written */
  /* the half of the pipeline that was never broken — recorded so a "simplification" that goes back
     to inferring from "something was started" (the #R290 reading order) has to face a red test. */
  for (const probe of ['state', 'isOpen', 'painted'])
    assert.match(SIM_STATE_SRC, new RegExp(`typeof m\\.${probe}\\s*===\\s*'function'`),
      `the provider asks ${probe}() before believing anything about it`);
  assert.match(SIM_STATE_SRC, /if\(!m\) return;/,
    'a module that was never loaded produces no key — absent is not idle');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R742 (formerly tests/r742-layer-origin-checks.test.mjs)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* ============================================================================
 *  R742 — a layer that is on says where it came from
 * ----------------------------------------------------------------------------
 *  Measured on production 2026-09-15: sixteen questions to Atlas, and every layer Atlas switched on
 *  along the way (earthquakes, railways, wind, volcanoes, night lights) was still on at the end,
 *  with 40.3% of the map under legends. Nothing had failed. js/atlas-persona.js already tells Atlas
 *  to take down 「a layer you turned on for an earlier question」 when it no longer serves the
 *  current one and to keep what the reader asked to keep; js/atlas-state.js already named every
 *  layer that was on, all of them, with no ceiling (#R413).
 *
 *  The instruction asks for a DISTINCTION, and the state carried no material for it: each layer
 *  reached the model as {id, label, painted}, which does not say who put it there. Atlas was told to
 *  judge and was not given the thing to judge with, so it judged nothing and took nothing off.
 *
 *  The user's rule is that the judgement stays with Atlas — 「毎回 Atlas が判断する。片付けたほうが
 *  見やすいならオフにし、そうでないならオンのまま」 — so nothing here (and nothing in the fix)
 *  switches a layer off. These checks measure the EVIDENCE:
 *
 *    ① a layer that went on while an Atlas operation ran is recorded as Atlas's, with turn and
 *       capability, and the record survives into `snapshot()`
 *    ② a layer with no such record is reported as having none — never as the reader's
 *    ③ `renderPrompt()` carries the distinction to the only reader that matters, in words
 *    ④ the evidence does not reintroduce a ceiling on what Atlas may know about its own app
 *    ⑤ ①–③ each go RED on the code as it stood before this round (a gate never seen red proves
 *       nothing — #R318 ②'s rule, applied to its own file)
 * ==========================================================================*/
/* ── a stand-in for the layer dropdown ──────────────────────────────────────────────────────────
   The default `activeLayers` provider reads the DOM, which does not exist here. What matters to
   these checks is the SHAPE it publishes — rows of {id, label, painted} — and the fix annotates the
   composed section rather than that one provider, precisely so it holds for whoever publishes it. */
function withLayers(S) {
  const on = new Map();
  S.registerStateProvider('activeLayers', () =>
    [...on.entries()].map(([id, label]) => ({ id, label, painted: true })));
  return {
    add: (id, label) => on.set(id, label || id),
    remove: (id) => on.delete(id),
    onNow: () => [...on.keys()]
  };
}
const rowOf = (snap, id) => (snap.activeLayers || []).find((l) => l && l.id === id);

test('R742 ①: a layer that went on while an Atlas operation ran is recorded as Atlas\'s', () => {
  const S = makeAtlasState({});
  const L = withLayers(S);
  L.add('dl-borders', 'Borders');            /* already on before Atlas ever looked */

  S.beginTurn(1, 'show me the earthquakes');
  L.add('dl-quakes', 'Earthquakes');
  /* ⚠ THE EXECUTOR READS `afterState = snapshot()` BEFORE `settle` files the operation
     (js/atlas-executor.js), so the snapshot standing here is not hypothetical: if reading the state
     were allowed to baseline the layers it sees, every layer Atlas switches on would already be
     known by the time its operation lands, and the ledger would record none of them. */
  S.snapshot();
  S.recordOperation(1, { operationId: 'o1', capabilityId: 'layers.toggle', args: { name: 'earthquakes', on: true }, status: 'completed' });

  const r = rowOf(S.snapshot(), 'dl-quakes');
  assert.ok(r, 'the layer is not in the snapshot at all');
  assert.equal(r.origin.by, 'atlas', 'Atlas switched this layer on and the state does not say so');
  assert.equal(r.origin.turnId, 1, 'the turn is the whole point — "an earlier question" is a turn');
  assert.equal(r.origin.capabilityId, 'layers.toggle');
  assert.equal(S.layerOrigin('dl-quakes').capabilityId, 'layers.toggle');

  /* …and how long ago, counted in the ledger's own turns rather than by subtracting ids */
  S.beginTurn(2, 'and the railways');
  S.beginTurn(3, 'what is the weather in Osaka');
  assert.equal(rowOf(S.snapshot(), 'dl-quakes').origin.turnsAgo, 2);
});

test('R742 ②: a layer with no record is reported as having none, not as the reader\'s', () => {
  const S = makeAtlasState({});
  const L = withLayers(S);
  L.add('dl-borders', 'Borders');
  S.beginTurn(1, 'show me the earthquakes');
  L.add('dl-quakes', 'Earthquakes');
  S.recordOperation(1, { operationId: 'o1', capabilityId: 'layers.toggle', args: { name: 'earthquakes' } });

  const b = rowOf(S.snapshot(), 'dl-borders');
  assert.equal(b.origin.by, 'unrecorded', 'a layer Atlas never touched must not be claimed by Atlas');
  assert.equal(S.layerOrigin('dl-borders'), null);
  /* ⚠ AND IT MUST NOT CLAIM THE OTHER AUTHOR EITHER. The ledger cannot tell "on before Atlas first
     looked" from "the reader ticked it", and data does not claim an author it lacks. */
  assert.doesNotMatch(JSON.stringify(b), /user|reader|human/i,
    'the row asserts the reader switched it on — an author nothing here observed');

  /* a layer the reader ticks between turns is an appearance the ledger sees WITHOUT an operation:
     it is attributed to no one */
  S.beginTurn(2, 'and now?');
  L.add('dl-rail', 'Railways');
  S.beginTurn(3, 'and now?');
  assert.equal(rowOf(S.snapshot(), 'dl-rail').origin.by, 'unrecorded');

  /* switching a layer off drops its record — the next time it is on, it is on for a new reason */
  L.remove('dl-quakes');
  S.snapshot();
  L.add('dl-quakes', 'Earthquakes');
  S.beginTurn(4, 'again');
  assert.equal(S.layerOrigin('dl-quakes'), null, 'a stale record outlived the layer it described');
});

test('R742 ③: the distinction reaches the model, in words', () => {
  const S = makeAtlasState({});
  const L = withLayers(S);
  L.add('dl-borders', 'Borders');
  S.beginTurn(7, 'show me the earthquakes');
  L.add('dl-quakes', 'Earthquakes');
  S.recordOperation(7, { operationId: 'o1', capabilityId: 'layers.toggle', args: { name: 'earthquakes' } });

  const txt = S.renderPrompt(S.snapshot());
  const layerLine = txt.split('\n').find((l) => l.startsWith('Layers ON'));
  assert.ok(layerLine, 'no layer line at all');
  assert.match(layerLine, /Earthquakes \[YOU turned this on · turn 7/,
    'the model is still told only the name of a layer it switched on itself');
  assert.match(layerLine, /Borders \[origin not recorded\]/,
    'a layer of unknown origin must be marked as such, or the unmarked ones read as the reader\'s');
  /* the reading rule stands next to the fact, and it says the decision is Atlas\'s */
  assert.match(txt, /Layer marks:/);
  assert.match(txt, /layers\.toggle, on:false/, 'the prompt names no way to act on the distinction');
  assert.match(txt, /what the reader asked to keep, keep/);

  /* ⚠ AND NOTHING SWITCHED ANYTHING OFF. 「毎回 Atlas が判断する」 — the layer is still on. */
  assert.deepEqual(L.onNow().sort(), ['dl-borders', 'dl-quakes']);

  /* a snapshot that carries no origins at all (an older caller, or a section trimmed away) gets no
     legend — an explanation of marks nobody emitted is bytes spent on nothing */
  assert.doesNotMatch(S.renderPrompt({ activeLayers: [{ id: 'x', label: 'Plain', painted: true }] }), /Layer marks:/);
});

test('R742 ④: the evidence brings no ceiling back with it', () => {
  const S = makeAtlasState({});
  const L = withLayers(S);
  S.beginTurn(1, 'everything');
  for (let i = 0; i < 60; i++) L.add('dl-x' + i, 'Layer number ' + i);
  S.recordOperation(1, { operationId: 'o1', capabilityId: 'layers.toggle', args: {} });

  const snap = S.snapshot();
  assert.equal(snap.activeLayers.length, 60);
  assert.ok(snap.activeLayers.every((l) => l.origin && l.origin.by === 'atlas'));
  const line = S.renderPrompt(snap).split('\n').find((l) => l.startsWith('Layers ON'));
  assert.match(line, /^Layers ON \(60\):/);
  for (let i = 0; i < 60; i++) {
    assert.ok(line.includes('Layer number ' + i + ' [YOU turned this on'),
      `layer ${i} of 60 was cut out of the sentence — #R413 removed every such ceiling`);
  }
  assert.doesNotMatch(line, /…|\.\.\./, 'a truncation mark appeared in the layer sentence');
});

/* ── ⑤ the same three properties, against the code as it stood before this round ────────────────
   Each mutation is the ABSENCE of one part of the fix, applied to the real file and imported as a
   module, so the checks above are measured against behaviour rather than against spelling. The
   relative import is rewritten to an absolute URL because a data: module has no directory. */
const MUT_SRC = read('js/atlas-state.js').replace(
  "from './atlas-view-ground.js'",
  'from ' + JSON.stringify(pathToFileURL(join(ROOT, 'js/atlas-view-ground.js')).href));

async function mutant(find, replace) {
  assert.ok(MUT_SRC.includes(find), 'the mutation did not apply — this check measured nothing: ' + find);
  const src = MUT_SRC.replace(find, replace);
  const m = await import('data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64'));
  return m.makeAtlasState({});
}
function arrange(S) {
  const L = withLayers(S);
  L.add('dl-borders', 'Borders');
  S.beginTurn(7, 'show me the earthquakes');
  L.add('dl-quakes', 'Earthquakes');
  S.recordOperation(7, { operationId: 'o1', capabilityId: 'layers.toggle', args: { name: 'earthquakes' } });
  return L;
}

test('R742 ⑤a: without the annotation on the snapshot, ① and ② go red', async () => {
  const S = await mutant('out.activeLayers = annotateLayerOrigins(out.activeLayers);', ';');
  arrange(S);
  const snap = S.snapshot();
  assert.equal(rowOf(snap, 'dl-quakes').origin, undefined);
  assert.equal(rowOf(snap, 'dl-borders').origin, undefined);
});

test('R742 ⑤b: without the observation at the operation boundary, ① goes red', async () => {
  /* ⚠ (#R775) THE NEEDLE MOVED WITH THE LINE. `recordOperation` now observes the DRAWINGS beside the
     layers, so the old needle matched nothing and this check silently measured zero. The mutation it
     names is unchanged — remove the LAYER observation at the operation boundary — and it still must
     go red. (memory: a check whose needle stops matching is a green that measures nothing.) */
  const S = await mutant('observeLayers(_by); observePaints(_by);', 'observePaints(_by);');
  arrange(S);
  assert.equal(rowOf(S.snapshot(), 'dl-quakes').origin.by, 'unrecorded',
    'a layer Atlas switched on is indistinguishable from one it never touched');
  assert.equal(S.layerOrigin('dl-quakes'), null);
});

test('R742 ⑤c: without the mark in the paragraph, ③ goes red', async () => {
  const S = await mutant("var og = l.origin || null, mark = '';", "var og = null, mark = '';");
  const L = arrange(S);
  const txt = S.renderPrompt(S.snapshot());
  assert.doesNotMatch(txt, /YOU turned this on/, 'the mutation left the mark standing');
  assert.doesNotMatch(txt, /Layer marks:/);
  assert.match(txt, /Layers ON \(2\): Borders, Earthquakes\./,
    'this is the sentence production sent for sixteen turns — names, and nothing about where they came from');
  assert.deepEqual(L.onNow().length, 2);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R783 clipped body (formerly tests/r783-clipped-body-checks.test.mjs)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* ============================================================================
 *  R783 · 切られた本文は、切られたと述べる (a clip that says so)
 * ----------------------------------------------------------------------------
 *  #R783 が `askReading()` に「読む面そのものを読む」をさせた結果、長い出来事の本文
 *  （synthesis ＋ 各媒体の見出し ＋ Coverage 一覧）は `RENDER_LIMITS.maxBody` = 2,600 を
 *  実際に超える。上限そのものは #R413 の判断どおり残す——外から来る 200 kB の記事が
 *  プロンプト全体になるのを止めるためのもので、Atlas への制限ではない。
 *
 *  ⚠ 誤っていたのは上限ではなく、**黙って切っていたこと**（#R320 が名づけた無言の打ち切り）。
 *  Atlas は上だけを渡され、残りが在ることを誰からも聞いていなかった。
 *
 *  測るのは 3 つ: ① 上限内の本文は註を持たない ② 超えた本文は「切った・全体で何字か」を
 *  述べる ③ 渡される中身は上限どおりで、読者が見る順の先頭である。
 * ==========================================================================*/
/* js/atlas-state.js は DOM も globals も要る面なので、測るのは renderPrompt() が本文について
   emit する 1 行の組み立てだけ——その式をソースから取り出して評価する（#R779 と同じ手）。
   ⚠ 式を書き写さない: 書き写した式は、実装が変わっても緑のままになる。 */
const SRC = readFileSync(new URL('../js/atlas-state.js', import.meta.url), 'utf8');

function bodyLineOf(body, maxBody) {
  const m = SRC.match(/if \(ar\.body\) \{([\s\S]*?)\n        \}/);
  assert.ok(m, 'js/atlas-state.js no longer has the `if (ar.body)` block this test measures');
  const lines = [];
  const fn = new Function('ar', 'lim', 'lines', 'str', m[1] + '\n return lines;');
  fn({ body }, { maxBody }, lines, String);
  assert.equal(lines.length, 1, 'the body block no longer emits exactly one line');
  return lines[0];
}

const LIMIT = (() => {
  const m = SRC.match(/RENDER_LIMITS = \{[^}]*maxBody:\s*(\d+)/);
  assert.ok(m, 'RENDER_LIMITS.maxBody is not where this test reads it');
  return Number(m[1]);
})();

test('R783 ① a body inside the cap carries no note about being cut', () => {
  const body = 'x'.repeat(LIMIT - 1);
  const line = bodyLineOf(body, LIMIT);
  assert.ok(!/CLIPPED/.test(line), 'an uncut body claims to have been cut');
  assert.ok(line.includes(body), 'the whole body did not reach the prompt');
});

test('R783 ② a body over the cap says it was cut, and by how much', () => {
  const body = 'y'.repeat(LIMIT + 4321);
  const line = bodyLineOf(body, LIMIT);
  assert.match(line, /CLIPPED/, 'the clip is silent — Atlas is handed the top with nothing saying the rest exists');
  assert.ok(line.includes(String(LIMIT)), 'the note does not say how much was shown');
  assert.ok(line.includes(String(body.length)), 'the note does not say how long the whole body is');
  assert.match(line, /you have NOT been shown it|the rest is below the cut/,
    'the note does not tell Atlas that the remainder was withheld from it');
});

test('R783 ③ what is handed over is the cap, and it is the reader\'s own order', () => {
  const head = 'HEADLINE-FIRST ';
  const body = head + 'z'.repeat(LIMIT * 2);
  const line = bodyLineOf(body, LIMIT);
  const quoted = line.slice(line.indexOf('"""') + 3, line.lastIndexOf('"""'));
  assert.equal(quoted.trim().length, LIMIT, 'the quoted body is not exactly the cap');
  assert.ok(quoted.trim().startsWith(head), 'the cut took something other than the top of what the reader sees');
});

test('R783 ④ the cap itself was not raised or lowered by this round', () => {
  /* kept as a spelling: a declared policy constant (#R413), read as written on purpose — moving it must come with the paragraph that says why */
  /* #R413 の判断（外から来る本文にだけ残った 2 つの上限）を、この回が黙って動かしていないこと。
     ⚠ これは方針の検査であって天井の番人ではない——上限を変えるなら #R413 の段落と一緒に変える。 */
  assert.equal(LIMIT, 2600, 'maxBody moved; if that is intended, the #R413 paragraph above it must say why');
  assert.match(SRC, /maxTitle: 140/, 'maxTitle moved');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R726 ⑪ — what Atlas is told about its own workspace (formerly tests/r726-atlas-eval-checks.test.mjs)
   Fourteen questions put to production Atlas on 2026-09-15; ⑪: Atlas is told what of its own is
   still on the map (state.js). The rest of #R726 lives with the module each finding was about.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
const CONSOLE = src('js/atlas-console.js');
test('R726 ⑪ the state names the power map, the era polities, the weather and satellite cards', () => {
  /* kept as a spelling: the provider is closure code inside js/atlas-console.js, and the cap is a declared policy constant read as written */
  const ST = makeAtlasState({});
  const text = ST.renderPrompt({ atlas: { factions: { n: 12 }, eraPolities: { n: 2, names: ['Japan', 'Taiwan (Japan)'] } }, panels: { open: ['Weather card'] } });
  assert.match(text, /power\/alliance map you drew earlier is still on the globe \(12/);
  assert.match(text, /clear what:"historical"/);
  assert.match(text, /displayed year's polities \(Japan, Taiwan \(Japan\)\)/);
  assert.match(text, /Open panels: Weather card/);
  const st = src('js/atlas-state.js');
  assert.match(st, /\['#weather-panel', 'Weather card'\]/);
  assert.match(st, /\['#sat-popup', 'Satellite detail card'\]/);
  assert.match(src('js/weather.js'), /panel\.id='weather-panel'/, 'the id the state watches is the id the panel has');
  assert.match(src('js/satellite-detail.js'), /el\.id='sat-popup'/);
  assert.match(liftFunction(CONSOLE, '_atlasOverlayState'), /nlq-fac-src/, 'the console publishes the faction fills');
});
