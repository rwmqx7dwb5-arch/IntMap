/* ============================================================================
 *  guide-unify — Settings ▸ Tutorial is a tour of the player, made from the examples
 * ----------------------------------------------------------------------------
 *  ① the guide's steps are DERIVED from the examples marked `guide` (title, sentence, question, captured link);
 *  ② js/onboarding.js has no list of layers and no timer of its own — its door starts the guide in the player;
 *  ③ the player plays the id, `?tour=guide` reads back, and the guide is not a lesson (not in TOURS);
 *  ④ the Settings entry is still there and still calls the door; the shapes other readers hold are unchanged.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guideTour, GUIDE_TOUR_ID, TOURS, tourFromSearch, tourQuery } from '../js/tours.js';
import { SHOWCASE, CAPTURED } from '../js/showcase.js';
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

test('① the guide is the marked examples, with their own words and captured links', () => {
  const g = guideTour();
  const marked = SHOWCASE.filter((s) => s.guide);
  assert.ok(marked.length >= 3, 'a guide of at least three examples');
  assert.deepEqual(g.steps.map((s) => s.key), marked.map((s) => s.id), 'steps = marked examples, in the examples file order');
  for (const st of g.steps) {
    const ex = SHOWCASE.find((s) => s.id === st.key);
    assert.deepEqual(st.title, ex.title); assert.deepEqual(st.say, ex.blurb); assert.deepEqual(st.ask, ex.question);
    assert.equal(st.hash, CAPTURED[ex.id].hash, st.key + ': the link is the one the app made');
    assert.match(st.hash, /^#v=/);
  }
  assert.equal(g.id, GUIDE_TOUR_ID);
  assert.equal(g.title.length >= 2, true, 'a title in en and jp');
});

test('② onboarding.js keeps no list of layers and no timer: its door starts the guide in the player', () => {
  const ob = rd('js/onboarding.js');
  assert.doesNotMatch(ob, /const SHOW\s*=/, 'a hand-written layer list is back');
  assert.doesNotMatch(ob, /dl-(climate|nightsat|relief|popgrid)/, 'a layer id is named in onboarding.js — the examples own that');
  assert.doesNotMatch(ob, /setTimeout\(next|im-demo-pill/, 'the demo’s own timer/pill is back');
  assert.match(ob, /import\('\.\/tour-player\.js'\)[\s\S]*startGuide\(\)/);
  assert.match(rd('js/tour-player.js'), /export function startGuide\(\) \{ return startTour\(GUIDE_TOUR_ID, 1\); \}/, 'the player owns the door into the guide');
  assert.match(ob, /window\._imStartDemo\s*=\s*_imStartDemo/, 'the door keeps its name (r167 / module-split read it)');
  assert.match(ob, /intmap_demo_seen/, 'the once-only rule is kept');
});

test('②b onboarding.js imports no tour module statically — it runs at start-up, and they are the player\'s (check:perf measured tours + showcase in the start-up chunk)', () => {
  const ob = rd('js/onboarding.js');
  const stat = [...ob.matchAll(/^\s*import\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.ok(stat.length > 0, 'the static imports were found (the pattern still reads the file)');
  for (const p of ['./tours.js', './tour-player.js', './showcase.js']) assert.ok(!stat.includes(p), 'onboarding.js imports ' + p + ' statically');
});

test('③ the player plays the guide id; it reopens from its address; it is not a lesson', () => {
  const pl = rd('js/tour-player.js');
  assert.match(pl, /k === GUIDE_TOUR_ID[\s\S]{0,200}guideTour\(\)/);
  assert.ok(!TOURS.some((t) => t.id === GUIDE_TOUR_ID), 'the guide must not appear in the teacher pages / picker');
  assert.deepEqual(tourFromSearch(tourQuery(GUIDE_TOUR_ID, 2)), { id: 'guide', step: 2 });
});

test('④ the Settings entry stays and calls the door; ?tour= is still read where it was', () => {
  /* ⚠ index.html has had no #btn-tutorial since R22 (settings cleanup); the handler below is guarded by `if(!tb) return`.
     When the button is put back the wiring is already this door. */
  const ab = rd('js/app-body.js');
  assert.match(ab, /getElementById\('btn-tutorial'\)/);
  assert.match(ab, /_imStartDemo&&window\._imStartDemo\(true\)/);
  assert.doesNotMatch(ab, /_imDemoStop/, 'nothing stops a demo any more: the player owns leaving');
  assert.match(rd('src/main.js'), /\[\?&\]tour=\/\.test\(location\.search\)\) import\('\.\.\/js\/tour-player\.js'\)/);
});

test('⑤ the guide is the first choice of the tour list, and Atlas is told it', () => {
  const pl = rd('js/tour-player.js');
  const open = pl.slice(pl.indexOf('export function openPicker'));
  const a = open.indexOf('const guideRow'), b = open.indexOf('const rows = guideRow + TOURS.map');
  assert.ok(a >= 0 && b > a, 'the guide row comes before the lessons');
  assert.ok(open.includes('H(g.id)') && open.includes('data-imtp'), 'the row starts the guide id through the same click handler as the lessons');
  const panelText = makeAtlasCatalogText({}, {}).text(['panel.tour']);
  assert.ok(panelText.includes('ID — title): ' + GUIDE_TOUR_ID + ' — ' + guideTour().title[0]), 'Atlas can open it: panel.tour names the guide first, derived from guideTour()');
  assert.ok(!rd('js/atlas-cap-panel.js').includes(guideTour().title[0]), 'the guide title is derived, not written into the panel text');
});
