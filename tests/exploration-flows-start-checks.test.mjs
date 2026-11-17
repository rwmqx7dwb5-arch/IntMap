/* ============================================================================
 *  exploration-flows — the starters: «Explore» and «Pick up where you left off» in the gallery's strip
 *  (js/showcase-gallery.js), which the search field's empty state and the phone sheet's home both draw.
 * ----------------------------------------------------------------------------
 *  ① exploreRows: a row per door that exists, in the order of the three walks; the «new since» figure only when counted.
 *  ② resumeRows / savedEventsHeld: a row only for what is really there; an unknown count is not a figure; nothing → [].
 *  ③ compareInit over the countries the view holds — measured by js/atlas-view-subject.js landInView, run here on two
 *    synthetic countries: two or more → the list, one → the code, none → nothing (the comparison's own default).
 *  ④ the doors pressed are the ones that exist elsewhere (read from their owners, not restated).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exploreRows, resumeRows, savedEventsHeld, compareInit } from '../js/showcase-gallery.js';
import { makeAtlasViewSubject } from '../js/atlas-view-subject.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const ALL = { today: true, compare: true, change: true };

test('① Explore holds one row per door the page has, in the order of the three walks', () => {
  assert.deepEqual(exploreRows(ALL, null).map((r) => r.key), ['today', 'compare', 'change']);
  for (const r of exploreRows(ALL, null)) { assert.ok(r.title && r.sub && r.icon, r.key + ' has a title, a line and a mark'); }
  assert.deepEqual(exploreRows({ today: false, compare: true, change: true }, null).map((r) => r.key), ['compare', 'change'], 'no edition command → no news row');
  assert.deepEqual(exploreRows({ today: true }, null).map((r) => r.key), ['today']);
  assert.deepEqual(exploreRows({}, 7), [], 'no doors → no group');
  assert.deepEqual(exploreRows(null, null), []);
});

test('① the «new since your last visit» figure is said only when it was counted and is above zero', () => {
  const fmt = (n) => '<' + n + '>';
  const counted = exploreRows(ALL, 12, fmt)[0];
  assert.match(counted.sub, /<12> new since your last visit/, 'the counted figure, in the reader\'s format');
  const plain = exploreRows(ALL, null, fmt)[0].sub;
  assert.doesNotMatch(plain, /new since/, 'not counted → the line does not claim a number');
  assert.equal(exploreRows(ALL, 0, fmt)[0].sub, plain, 'zero new → the plain line');
  assert.equal(exploreRows(ALL, /** @type {any} */ ('3'), fmt)[0].sub, plain, 'a value that is not a number is not a count');
});

test('② «Pick up where you left off» is drawn only for what is there, and an unknown total has no figure', () => {
  assert.deepEqual(resumeRows({ savedEvents: null, places: null }), [], 'nothing → the group is hidden');
  assert.deepEqual(resumeRows({}), []);
  assert.deepEqual(resumeRows({ savedEvents: { n: 0, exact: true }, places: { n: 0, exact: true } }), [], 'zero is nothing to resume');
  const both = resumeRows({ savedEvents: { n: 3, exact: true }, places: { n: 5, exact: true } });
  assert.deepEqual(both.map((r) => [r.key, r.count]), [['saved', '3'], ['places', '5']]);
  const some = resumeRows({ savedEvents: { n: 2, exact: false } });
  assert.deepEqual(some.map((r) => [r.key, r.count]), [['saved', '']], 'the device knows «some», not «how many»');
  assert.deepEqual(resumeRows({ places: { n: NaN, exact: true } }), [], 'an unreadable count is not a row');
});

test('② the ★ count is the News module\'s own when it is here, else this device\'s list', () => {
  assert.deepEqual(savedEventsHeld({ state: () => ({ savedCount: 4 }) }, ['a'], true), { n: 4, exact: true }, 'the chip\'s number wins');
  assert.deepEqual(savedEventsHeld({ state: () => ({ savedCount: 0 }) }, ['a', 'b'], false), { n: 0, exact: true }, 'the module says none → none');
  assert.deepEqual(savedEventsHeld(null, ['a', 'b'], false), { n: 2, exact: true }, 'a guest\'s stars are this device\'s list');
  assert.deepEqual(savedEventsHeld(null, ['a', 'b'], true), { n: 2, exact: false }, 'signed in: the account may hold more');
  assert.equal(savedEventsHeld(null, [], false), null);
  assert.equal(savedEventsHeld(undefined, undefined, false), null);
  assert.deepEqual(savedEventsHeld({ state: () => { throw new Error('x'); } }, ['a'], false), { n: 1, exact: true }, 'a module that cannot answer falls back to the list');
  /* wired end to end: no stars → no group */
  assert.deepEqual(resumeRows({ savedEvents: savedEventsHeld(null, [], false), places: null }), []);
});

test('② the device list read is the one js/news-events.js writes (the key is the one copied thing)', () => {
  const owner = /const SAVE_KEY = '([^']+)'/.exec(read('js/news-events.js'));
  const here = /const SAVED_EVENTS_KEY = '([^']+)'/.exec(read('js/showcase-gallery.js'));
  assert.ok(owner && here);
  assert.equal(here[1], owner[1]);
});

test('③ the comparison opens with the countries the view holds — measured, never listed', () => {
  assert.equal(compareInit([]), undefined, 'none → open() with nothing: its own default and picker');
  assert.equal(compareInit(null), undefined);
  assert.equal(compareInit(['JPN']), 'JPN', 'one → added to what is compared');
  const three = ['JPN', 'KOR', 'CHN']; const got = compareInit(three);
  assert.deepEqual(got, three); assert.notEqual(got, three, 'a copy');
  assert.deepEqual(compareInit(['JPN', '', null, 'KOR']), ['JPN', 'KOR']);
  /* the measurement itself, on two synthetic countries splitting a view — the rule Atlas's chips use */
  const sq = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
  const geo = { type: 'FeatureCollection', features: [{ id: 'AAA', geometry: sq(0, 0, 10, 10) }, { id: 'BBB', geometry: sq(10, 0, 20, 10) }] };
  const stats = { AAA: { nameEn: 'A' }, BBB: { nameEn: 'B' } };
  const cam = (w, s, e, n) => ({ camera: { getCenter: () => ({ lng: (w + e) / 2, lat: (s + n) / 2 }), getZoom: () => 5,
    getBounds: () => ({ getWest: () => w, getSouth: () => s, getEast: () => e, getNorth: () => n }) } });
  const inView = (box) => { const V = makeAtlasViewSubject({ GE: () => cam(...box), geo: () => geo, countryStats: stats, cName: (s) => s.nameEn }); return V.landInView(V.viewBox()).codes; };
  assert.deepEqual(compareInit(inView([2, 2, 18, 8])).slice().sort(), ['AAA', 'BBB'], 'a view across both → both');
  assert.equal(compareInit(inView([1, 1, 9, 9])), 'AAA', 'a view inside one → that one');
  assert.equal(compareInit(inView([40, 40, 50, 50])), undefined, 'open sea → nothing');
});

test('④ every row presses a door that exists — the owners still have it', () => {
  const sg = read('js/showcase-gallery.js');
  const goFn = sg.slice(sg.indexOf('async function go('), sg.indexOf('function drawStarters('));
  /* the edition: the command the News entry's own door registers */
  assert.match(read('js/news-pulse.js'), /IntMapOS\.register\('newsedition\.open'/);
  assert.match(sg, /const osDoor = \(\) => window\.IntMapOS;/);
  assert.match(goFn, /osDoor\(\)\.exec\('newsedition\.open'/);
  /* the comparison: the lazy module's published open() */
  assert.match(read('js/lazy-modules.js'), /statsCompare: \{ publishes: 'IntMapStatsCompare'/);
  assert.match(goFn, /need\('statsCompare'\)[\s\S]*IntMapStatsCompare[\s\S]*C\.open\(compareInit\(codes\)\)/);
  /* the place card at the centre */
  assert.match(read('js/place-dossier.js'), /export async function openPlaceDossier\(HOST, pt\)/);
  assert.match(goFn, /camera\.getCenter\(\)[\s\S]*openPlaceDossier\(HOST, \{ lng: c\.lng, lat: c\.lat \}\)/);
  /* ★ Saved: the scope chip's own call; the Library: the sheet the account menu opens */
  assert.match(read('js/session-tabs.js'), /setMode\('saved','btn-news'\)/);
  assert.match(goFn, /HOST\.setMode\('saved', 'btn-news'\)/);
  assert.match(read('js/my-places.js'), /export async function openMyPlaces\(HOST, opts\)/);
  assert.match(goFn, /M\.openMyPlaces\(HOST\)/);
  /* the rows sit in the strip both places draw, and the home's ending keeps them */
  assert.match(sg, /<div class="sg-resume" hidden><\/div><div class="sg-explore"><\/div><div class="sg-strip"/);
  assert.match(sg.slice(sg.indexOf('export function showInResults('), sg.indexOf('/** the empty state is showing in this list */')), /drawStarters\(res, leave\)/);
});
