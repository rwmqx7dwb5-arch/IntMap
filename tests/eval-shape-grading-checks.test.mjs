/* ============================================================================
 *  eval-shape-grading — the evaluation asks for THE THING ITSELF, not for «a line»
 * ----------------------------------------------------------------------------
 *  The defect (2026-11-18): 「フォッサマグナをマッピングして」 came back as towns joined by straight lines, and
 *  the answer key could not have failed it — 「信濃川を地図でなぞって」 passed on `atlas.lines ≥ 1`, which a line
 *  the model drew between two towns satisfies. The map now reports every shape by what it is and where it came
 *  from (`atlas.shapes.<kind>:<basis>`), the key asks for the basis, and a thing with no shape in any source is
 *  answered by saying so (answer kind `declines`) with nothing standing in for it on the map.
 *  These hold the FACTS, not this round's rows: every check below reads the key and the product as they are.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHAPE_KINDS, SHAPE_BASES, shapeBasisOf, shapeKindOf, tallyShapes, resolveShape } from '../js/atlas-shape-resolve.js';
import { mapVocabulary, validateMapState, gradeMap } from '../scripts/atlas-eval/map-state.mjs';
import { gradeAnswer, validateAnswerKey } from '../scripts/atlas-eval/grade.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = JSON.parse(readFileSync(join(ROOT, 'scripts/atlas-eval/answer-key.json'), 'utf8'));
const V = mapVocabulary(ROOT);

test('eval-shape-grading ① the shape vocabulary is the product\'s, and a path outside it is red', () => {
  const want = new Set(['n']);
  for (const k of SHAPE_KINDS) for (const b of SHAPE_BASES) want.add(k + ':' + b);
  assert.deepEqual([...V.shapeKeys].sort(), [...want].sort(), 'map-state.mjs discovers SHAPE_KINDS × SHAPE_BASES from js/');
  assert.ok(V.atlasKeys.has('shapes'), 'the `atlas` provider still publishes `shapes`');
  const ok = validateMapState({ drawn: [{ path: 'atlas.shapes.line:real', min: 1, why: 'x' }] }, V, 'q');
  assert.deepEqual(ok, []);
  for (const bad of ['atlas.shapes.line:exact', 'atlas.shapes.lines:real', 'atlas.shapes', 'atlas.shapes.line:real.n']) {
    assert.equal(validateMapState({ drawn: [{ path: bad, min: 1, why: 'x' }] }, V, 'q').length, 1, bad + ' is refused');
  }
});

test('eval-shape-grading ② one basis rule for the highlight and the map explanation', async () => {
  assert.equal(shapeBasisOf({ poly: {} }), 'real');
  assert.equal(shapeBasisOf({ approx: true }), 'derived');
  assert.equal(shapeBasisOf({ partial: true }), 'derived');
  assert.equal(shapeBasisOf({ rrMethod: 'derived_anchors' }), 'derived', 'a web-anchored outline is built, not held');
  assert.equal(shapeBasisOf({ soft: true }), 'unstated', 'a bounding box is not a shape');
  assert.equal(shapeBasisOf(null), 'unstated');
  /* the map explanation's area rung answers with the same rule */
  const poly = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
  const r = await resolveShape('X', 'area', { area: async () => ({ poly: { geo: poly }, rrMethod: 'derived_anchors' }) });
  assert.equal(r.ok && r.basis, 'derived');
});

test('eval-shape-grading ③ the tally counts shapes by kind and basis; a basis nobody stated is never real', () => {
  const line = { type: 'LineString', coordinates: [[0, 0], [1, 1]] };
  const area = { type: 'MultiPolygon', coordinates: [] };
  assert.equal(shapeKindOf(line), 'line');
  assert.equal(shapeKindOf(area), 'area');
  assert.equal(shapeKindOf({ type: 'Point', coordinates: [0, 0] }), '');
  assert.deepEqual(tallyShapes([{ geo: line, basis: 'real' }, { geo: line }, { geo: area, basis: 'derived' }, { geo: { type: 'Point', coordinates: [0, 0] }, basis: 'real' }, { geo: line, basis: 'exact' }]),
    { n: 4, 'line:real': 1, 'line:unstated': 2, 'area:derived': 1 });
  assert.equal(tallyShapes([]), null, 'nothing drawn is null, as every other drawing in the section');
});

test('eval-shape-grading ④ every reader of the highlight\'s shapes and the compose layer feeds the tally', () => {
  /* read, because the provider lives inside the console's closure: it tallies through the shared function, from the
     map explanation's features (shapes and relation lines), the highlight's outlines and lines, and the lit countries */
  const src = readFileSync(join(ROOT, 'js/atlas-console.js'), 'utf8');
  const at = src.indexOf('function _atlasOverlayState');
  const body = src.slice(at, src.indexOf('return o; }', at));
  assert.match(body, /tallyShapes\(/);
  for (const needle of ["p.t==='shape'", "p.t==='rel'", '_hlPolys', '_hlLines', '_hl.size']) assert.ok(body.includes(needle), 'the tally reads ' + needle);
  /* the highlight's rungs that hold an upstream's geometry say so; a model-drawn line (map.drawLine) states nothing */
  const cap = readFileSync(join(ROOT, 'js/atlas-cap-map.js'), 'utf8');
  assert.match(cap, /lines\.push\(\{geo:rl\.geo,[^}]*shapeBasis:'real'\}\)/, 'a river course from fetchRiverLine is real');
  assert.match(cap, /t2\.poly\.shapeBasis=shapeBasisOf\(t2\)/, 'a ladder outline carries the shared rule\'s basis');
  const draw = cap.slice(cap.indexOf("row: ['map.drawLine'"), cap.indexOf("row: ['map.drawLine'") + 6000);
  assert.ok(!/shapeBasis/.test(draw.slice(0, draw.indexOf('row: [', 10))), 'map.drawLine leaves its line unstated');
});

test('eval-shape-grading ⑤ a line between towns does not pass as the river; the river\'s own course does', () => {
  const q = KEY.questions.find((x) => (x.mapState && x.mapState.drawn || []).some((d) => d.path === 'atlas.shapes.line:real' && d.min >= 1));
  assert.ok(q, 'the key has a question that asks for a real line');
  const A = { highlightCountries: 0, lines: { n: 1 } };
  assert.equal(gradeMap(q.mapState, { atlas: { ...A, shapes: { n: 1, 'line:unstated': 1 } } }).verdict, 'mismatch');
  assert.equal(gradeMap(q.mapState, { atlas: { ...A, shapes: { n: 1, 'line:real': 1 } } }).verdict, 'match');
});

test('eval-shape-grading ⑥ a decline is graded on the words AND on the map — no stand-in of the asked kind', () => {
  const decl = KEY.questions.filter((q) => q.answer && q.answer.kind === 'declines');
  assert.ok(decl.length >= 1);
  assert.deepEqual(validateAnswerKey({ questions: decl }, () => true, V), []);
  for (const q of decl) {
    assert.equal(gradeAnswer(q.answer, 'その形状データは IntMap が読める典拠にありません。').verdict, 'correct', q.id);
    assert.equal(gradeAnswer(q.answer, 'I cannot draw it: IntMap holds no geometry for it.').verdict, 'correct', q.id);
    assert.equal(gradeAnswer(q.answer, '地図に描きました。').verdict, 'absent', q.id + ': a reply that claims the drawing has not declined');
    assert.equal(gradeMap(q.mapState, { atlas: { highlightCountries: 0, shapes: null } }).verdict, 'match', q.id + ': drawing nothing passes');
    assert.equal(gradeMap(q.mapState, { atlas: { highlightCountries: 0, shapes: { n: 2, 'line:unstated': 2 } } }).verdict, 'mismatch', q.id + ': towns joined by lines fail');
  }
  /* the key's own guard: a decline without the map half, or without the source that would end it, is refused */
  const one = decl[0];
  assert.equal(validateAnswerKey({ questions: [{ ...one, mapState: { drawn: [{ path: 'atlas.lines', max: 0, why: 'x' }] } }] }, () => true, V).length, 1);
  assert.equal(validateAnswerKey({ questions: [{ ...one, answer: { ...one.answer, until: '' } }] }, () => true, V).length, 1);
});
