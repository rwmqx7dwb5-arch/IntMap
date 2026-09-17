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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasState } = await import('../js/atlas-state.js');

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
