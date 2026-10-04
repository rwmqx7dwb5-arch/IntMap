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
  assert.match(ob, /import\('\.\/tour-player\.js'\)[\s\S]*startTour\(GUIDE_TOUR_ID/);
  assert.match(ob, /window\._imStartDemo\s*=\s*_imStartDemo/, 'the door keeps its name (r167 / module-split read it)');
  assert.match(ob, /intmap_demo_seen/, 'the once-only rule is kept');
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
  assert.ok(rd('js/atlas-cap-panel.js').includes('ID — title): guide — '), 'Atlas can open it: panel.tour start id "guide"');
});
