/* ============================================================================
 *  IntMap · one geocoder for a typed route end, one waterway rule, one «now»  (one-geocode-one-clock)
 * ----------------------------------------------------------------------------
 *  Three second implementations were folded into the first:
 *   · js/routing.js `geo1()` — a string → one point with NO agreement check (nearest within 300 km,
 *     else the most populous of whatever came back). `openPanel(from,to)` and the exported
 *     `geoNear` now go through js/routing-geocode.js `resolve()`, which applies the same sources,
 *     ranking and js/atlas-geo-resolve.js `placeRules` as the suggestion list — and answers null
 *     when nothing agrees with the query.
 *   · the Nominatim «is this row a waterway line» predicate, written in js/river-course.js and again
 *     in js/atlas-console.js — now js/river-course.js `isWaterwayLine` only.
 *   · `isLive ? Date.now() : when` written by twelve subsystems — now js/chronos.js `nowMs()` /
 *     `when()` / `iso()`.
 *  The geocoder and the clock are EVALUATED here (the shipped modules, a stubbed network); the
 *  «no second copy» facts are measured over every file in js/, so a NEW copy is caught too.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { importModule } from './helpers/import-module.mjs';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { ROOT } from './helpers/geo-shared.mjs';

const read = (rel) => readLF(join(ROOT, rel));
const jsFiles = () => readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f);

/* ── the shipped geocoder, the shipped rules, the shipped router — on one fake window ─────────── */
const W = {};
const calls = [];
let fixture = { om: [], nom: [] };
globalThis.fetch = async (url) => {
  calls.push(String(url));
  const body = /open-meteo/.test(url) ? { results: fixture.om } : fixture.nom;
  return { ok: true, status: 200, json: async () => body };
};
await importModule('js/atlas-geo-resolve.js', { globals: { window: W } });
await importModule('js/routing-store.js', { globals: { window: W } });
await importModule('js/routing-geocode.js', { globals: { window: W } });
const { routing } = await importModule('js/routing.js', { globals: { window: W } });
const ROUTER = routing({ lang: 'en', canDraw: () => false });
W.IntMapRouting = ROUTER;
const GC = W.IntMapRouteGeocode;

const NEW_YORK = { lat: '40.71', lon: '-74.00', name: 'New York', display_name: 'New York, United States', class: 'place', category: 'place', type: 'city', importance: 0.88, osm_type: 'R', osm_id: 175905 };
const AMAZON_STREET = { lat: '28.15', lon: '-82.46', name: 'Amazon Basin Bend', display_name: 'Amazon Basin Bend, Lutz, Florida', class: 'highway', category: 'highway', type: 'residential', importance: 0.2, osm_type: 'W', osm_id: 1 };
const POTSDAM_NY = { id: 1, name: 'Potsdam', latitude: 44.66, longitude: -74.98, population: 15000, admin1: 'New York', country: 'United States', feature_code: 'PPL' };
const POTSDAM_DE = { id: 2, name: 'Potsdam', latitude: 52.4, longitude: 13.06, population: 180000, admin1: 'Brandenburg', country: 'Germany', feature_code: 'PPLA' };

test('(a) js/routing.js holds no geocoder of its own — no fetch to a geocoding host, no geo1/_pickNear', () => {
  const src = codeOnly(read('js/routing.js'));
  assert.equal(/geocoding-api\.open-meteo\.com|nominatim\.openstreetmap\.org\/search/.test(src), false,
    'a string → point lookup inside the router is a second geocoder');
  assert.equal(/\bgeo1\b|_pickNear/.test(src), false);
});

test('(a) geoNear: a query no row agrees with answers null, not the most important stranger', async () => {
  fixture = { om: [], nom: [NEW_YORK] };
  assert.equal(await ROUTER.geoNear('Lake Zyxwvut', [13.4, 52.5]), null, 'a lake no row agrees with is not New York');
  assert.ok(calls.some((u) => /nominatim/.test(u)), 'Nominatim was actually asked — the null is a verdict, not a skip');
});

test('(a) geoNear: the confirming door refuses a street that merely contains the name; the list still offers it', async () => {
  fixture = { om: [], nom: [AMAZON_STREET] };
  assert.equal(await ROUTER.geoNear('Amazon Basin'), null);
  const list = await GC.suggest('Amazon Basin', { lang: 'en' });
  assert.ok(list.items.some((c) => c.name === 'Amazon Basin Bend'), 'suggest() (a reader picks) keeps the half-match');
});

test('(a) geoNear keeps #R126: the same-name place near the view wins, each from its own view', async () => {
  fixture = { om: [POTSDAM_NY, POTSDAM_DE], nom: [] };
  const de = await ROUTER.geoNear('Potsdam', [13.4, 52.5]);
  assert.equal(de && de.admin, 'Brandenburg, Germany');
  const ny = await ROUTER.geoNear('Potsdam', [-75.2, 44.5]);
  assert.equal(ny && ny.admin, 'New York, United States');
  const ll = await ROUTER.geoNear('35.6812, 139.7671');
  assert.deepEqual([ll.lat, ll.lng], [35.6812, 139.7671], 'a literal coordinate is still a place');
});

test('(a) openPanel(from, to) as a string lands the verified point — and leaves the field empty when none agrees', async () => {
  W.IntMapLazy = { need: async () => {} };
  fixture = { om: [POTSDAM_DE], nom: [NEW_YORK] };
  await ROUTER.openPanel('Potsdam', 'Lake Zyxwvut');
  const s = W.IntMapRouteStore.get();
  assert.equal(s.from.place && s.from.place.lat, 52.4);
  assert.equal(s.to.place, null, 'no row agrees with the query, so no point was invented');
});

test('(a) every reader of geoNear reaches the router export (which is the verified door)', () => {
  const readers = jsFiles().filter((f) => f !== 'js/routing.js' && /\bgeoNear\b/.test(codeOnly(read(f))));
  for (const f of readers) assert.match(codeOnly(read(f)), /IntMapRouting\.geoNear\(/, f + ' reads geoNear off the router');
  assert.ok(readers.length >= 1, 'js/atlas-cap-routing.js is a reader');
});

test('(b) the waterway-line rule is stated once and evaluates as it did', () => {
  const ctx = { console, fetch: async () => ({ ok: false }) }; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(read('js/river-course.js'), ctx, { filename: 'river-course.js' });
  const ok = ctx.window.IntMapRiverCourse.isWaterwayLine;
  const line = { type: 'LineString', coordinates: [] };
  assert.equal(ok({ category: 'waterway', type: 'river', geojson: line }), true);
  assert.equal(ok({ class: 'waterway', type: 'ditch', geojson: { type: 'MultiLineString' } }), true);
  assert.equal(ok({ class: 'natural', type: 'stream', geojson: line }), true, 'typed a stream');
  assert.equal(ok({ class: 'waterway', type: 'river', geojson: { type: 'Polygon' } }), false, 'a riverbank area is not a course');
  assert.equal(ok({ class: 'highway', type: 'residential', geojson: line }), false);
  assert.equal(ok(null), false);
  const owners = jsFiles().filter((f) => /\/\^\(river\|canal\|stream\)\$\//.test(codeOnly(read(f))));
  assert.deepEqual(owners, ['js/river-course.js'], 'one file states which Nominatim rows are a waterway line');
  assert.match(codeOnly(read('js/atlas-console.js')), /IntMapRiverCourse\.isWaterwayLine\(/);
});

test('(c) Chronos nowMs() is when() in ms — now when live, the chosen instant otherwise', async () => {
  const { makeClock } = await import('../js/chronos.js');
  const C = makeClock('one-geocode-one-clock');
  const t0 = Date.now(); const live = C.nowMs(); const t1 = Date.now();
  assert.ok(live >= t0 && live <= t1, 'live is the wall clock');
  C.set(new Date(Date.UTC(1900, 5, 1)));
  assert.equal(C.nowMs(), Date.UTC(1900, 5, 1));
  assert.equal(C.nowMs(), C.when().getTime());
  C.setNow();
  assert.ok(Math.abs(C.nowMs() - Date.now()) < 1000);
});

test('(c) no file in js/ re-derives «live ? now : when» for itself', () => {
  /* the shape, whichever spelling of «now» it uses: Date.now(), new Date(), or an ISO of new Date() */
  const SHAPE = /isLive\b(?:\s*\(\s*\))?\s*\?\s*(?:Date\.now\(\)|new Date\(\s*\)|\w+\(\s*new Date\(\s*\)\s*\))/;
  const hits = jsFiles().filter((f) => SHAPE.test(codeOnly(read(f))));
  assert.deepEqual(hits, [], 'ask the clock: IntMapTime.nowMs() / when() / iso()');
  const want = {
    'js/news-events.js': /IntMapTime\.nowMs\(\)/, 'js/news-intel.js': /IntMapTime\.nowMs\(\)/,
    'js/news-story.js': /IntMapTime\.nowMs\(\)/, 'js/quake-history.js': /function clockMs\(\) \{ try \{ return IntMapTime\.nowMs\(\)/,
    'js/world-packs.js': /function when\(\)\{ try\{ return IntMapTime\.nowMs\(\)/,
    'js/news-timeline.js': /function _timeBase\(\)\{ return IntMapTime\.when\(\); \}/,
    'js/outbreaks.js': /const d = IntMapTime\.when\(\);/, 'js/world-packs-rows.js': /const d=IntMapTime\.when\(\);/,
    'js/war-layer.js': /IntMapTime\.iso\(\)/,
  };
  for (const [f, re] of Object.entries(want)) assert.match(codeOnly(read(f)), re, f);
});
