/* ============================================================================
 *  atlas-product — «時をまたぐ道のり»: one journey, asked at several instants
 *  (js/journey-through-time.js, js/geo-along.js, Atlas `time.journey`, the route panel's «Borders that year»)
 * ----------------------------------------------------------------------------
 *    ① ONE SAMPLER: the route panel's «Borders» and the journey use the same functions (js/geo-along.js), evaluated —
 *       routing-ops publishes the very objects it imports, and keeps no copy of its own;
 *    ② the great circle is a great circle: the midpoint of an equatorial leg is on the equator, a leg across the
 *       antimeridian stays continuous, and its length is the haversine distance;
 *    ③ WHAT THE RECORD DRAWS, AND NOTHING ELSE: polities in order with each stretch's km, a realm set aside as
 *       `within` only when a member is drawn under it, two claims both named (overlap), a shape without a name said as
 *       such, sea and land the record does not cover told apart by the land outlines — and «outside» when there are none;
 *    ④ AN INSTANT NO RECORD COULD BE READ FOR IS SAID, not answered as empty (one-pass-or-a-reason §5);
 *    ⑤ instants: a year is mid-June, a date is that day (31 February is refused), BC is written as BC;
 *    ⑥ ATLAS: the polities reach the model (`exec.journey`), one instant is drawn as coloured stretches declared in
 *       `meta.painted.lines`, and the same call twice leaves the same lines (a redraw replaces its own course);
 *    ⑦ THE RECORDS, NAMED (historical-verification §2-1): Paris → Moscow in 1925 crosses the Polish Corridor into East
 *       Prussia and the Wilno region; in 1990 it passes through West Berlin; Vienna → Istanbul meets Austria-Hungary and
 *       the Ottoman Empire in 1913 and neither today;
 *    ⑧ the capability is declared once, with a required line, on the paint observer.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importModule } from '../scripts/lib/import-module.mjs';
import { journeyHarness, run } from '../scripts/journey-through-time.mjs';

import * as GA from '../js/geo-along.js';
import * as J from '../js/journey-through-time.js';

const sq = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
const F = (geometry, properties) => ({ type: 'Feature', geometry, properties });

test('① the route panel and the journey share one sampler and one point-in-polygon test', async () => {
  const stub = new Proxy(function () {}, { get: (_, k) => (k === 'then' || typeof k === 'symbol' ? undefined : stub), apply: () => stub });
  const RO = await importModule('js/routing-ops.js', { mocks: { 'js/geo-engine.js': { IntMapGeoEngine: stub } } });
  const ops = RO.routingOps({ lang: 'en' });
  assert.equal(ops._math.distM, GA.distM);
  assert.equal(ops._math.resample, GA.resample);
  assert.equal(ops._math.ptInPoly, GA.ptInPoly);
  /* and its «Borders» still answers in the countries' order, with the sampler's step */
  globalThis.window = globalThis.window || globalThis;
  window.countryGeo = { features: [F(sq(0, -1, 1, 1), { NAME: 'A' }), F(sq(1, -1, 2, 1), { NAME: 'B' })] };
  const b = ops.borders([[0.2, 0], [1.8, 0]]);
  assert.deepEqual(b.countries, ['A', 'B']);
  assert.equal(b.count, 1);
  delete window.countryGeo;
});

test('② a great circle: on the equator, continuous across 180°, as long as the haversine says', () => {
  const eq = GA.greatCircleLine([[0, 0], [90, 0]], 25000);
  assert.ok(eq.every((p) => Math.abs(p[1]) < 1e-9), 'an equatorial leg stays on the equator');
  const am = GA.greatCircleLine([[170, 10], [-170, 10]], 25000);
  for (let i = 1; i < am.length; i++) assert.ok(Math.abs(am[i][0] - am[i - 1][0]) < 5, 'no jump across the antimeridian');
  assert.ok(am[am.length - 1][0] > 180, 'carried past 180 rather than wrapped');
  assert.ok(Math.abs(GA.wrapLng(am[am.length - 1][0]) - -170) < 1e-9);
  const total = GA.lineLengthM(eq), direct = GA.distM([0, 0], [90, 0]);
  assert.ok(Math.abs(total - direct) / direct < 1e-6);
  /* a long leg arrives where it was asked to */
  const tk = GA.greatCircleLine([[139.69, 35.69], [-0.13, 51.51]], 25000);
  assert.deepEqual(tk[tk.length - 1].map((x) => +GA.wrapLng(x).toFixed(6)), [-0.13, 51.51]);
});

/* a world of squares along the equator, 0°–10°: A | realm over B | B+C (two claims) | unnamed | nothing (land) | nothing (sea) */
const world = {
  past: [
    F(sq(0, -1, 2, 1), { NAME: 'Alpha', _i18n: { jp: 'アルファ' }, SUBJECTO: 'Omega' }),
    F(sq(2, -1, 5, 1), { NAME: 'Realm', _realm: 1 }),
    F(sq(2, -1, 4, 1), { NAME: 'Beta' }),
    F(sq(4, -1, 5, 1), { NAME: 'Beta' }),
    F(sq(4, -1, 5, 1), { NAME: 'Gamma' }),
    F(sq(5, -1, 6, 1), { NAME: '' }),
  ],
  land: [F(sq(0, -1, 8, 1), { NAME_EN: 'Landia', NAME_JA: 'ランディア' })],
};
const borders = (fc) => ({ collectionAt: async () => ({ tier: 'cshapes', fc: { type: 'FeatureCollection', features: fc } }), recordOf: () => ({ src: 'TEST RECORD' }) });

test('③ the record’s polities in order, the realm aside, two claims named, sea and unrecorded land apart', async () => {
  const line = J.lineOf([[0.05, 0], [9.95, 0]]);
  const R = await J.journeys(line, [J.instantOf({ year: 1900 }), J.instantOf({ now: true })], { borders: borders(world.past), land: () => ({ features: world.land }), lang: 'jp' });
  const [past, now] = R.journeys;
  assert.equal(past.record.src, 'TEST RECORD');
  assert.deepEqual(past.legs.map((g) => g.key), ['Alpha', 'Beta', 'Beta / Gamma', '~unnamed']);
  const P = (k) => past.polities.find((x) => x.key === k);
  assert.equal(P('Alpha').names[0].local, 'アルファ', 'the record’s name in the reader’s language');
  assert.equal(P('Alpha').under, 'Omega');
  assert.deepEqual(P('Beta').within.map((w) => w.en), ['Realm'], 'the realm is where Beta is, not a polity crossed');
  assert.equal(P('Beta / Gamma').kind, 'overlap');
  assert.equal(P('~unnamed').kind, 'unnamed');
  assert.ok(!past.polities.some((x) => x.key === 'Realm'));
  assert.equal(past.crossings.length, 3);
  /* lengths: 1° of the equator is ~111.2 km; each stretch to within the sampler's step */
  const step = past.stepM / 1000, deg = GA.distM([0, 0], [1, 0]) / 1000;
  assert.ok(Math.abs(P('Beta').km - 2 * deg) <= step + 1e-6, 'Beta: 2°');
  assert.ok(Math.abs(past.gapKm.norecord - 2 * deg) <= step + 1e-6, 'land with no record: 6°–8°');
  assert.ok(Math.abs(past.gapKm.sea - 1.95 * deg) <= step + 1e-6, 'sea: 8°–9.95°');
  assert.equal(past.gapKm.outside, 0);
  /* today: the land outlines, under their Japanese name */
  assert.deepEqual(now.legs.map((g) => g.key), ['Landia']);
  assert.equal(now.polities[0].names[0].local, 'ランディア');
  /* met at one instant only — every polity of the past, and Landia today */
  assert.deepEqual(R.differs.map((e) => e.key).sort(), ['Alpha', 'Beta', 'Landia']);
  /* no land outlines: «outside», never guessed to be sea */
  const bare = await J.journeyAt(line, J.instantOf({ year: 1900 }), { borders: borders(world.past), land: () => null, lang: 'en' });
  assert.ok(bare.gapKm.outside > 0 && bare.gapKm.sea === 0 && bare.gapKm.norecord === 0);
  /* a realm with nothing drawn under it IS what the record draws there */
  const alone = await J.journeyAt(line, J.instantOf({ year: 1900 }), { borders: borders([F(sq(0, -1, 10, 1), { NAME: 'Realm', _realm: 1 })]), land: () => null, lang: 'en' });
  assert.deepEqual(alone.legs.map((g) => g.key), ['Realm']);
});

test('④ an instant no record could be read for is said, and the others still answer', async () => {
  const line = [[0.5, 0], [1.5, 0]];
  const R = await J.journeys(line, [J.instantOf({ year: 1900 }), J.instantOf({ now: true })], { borders: { collectionAt: async () => null }, land: () => ({ features: world.land }), lang: 'en' });
  assert.equal(R.journeys[0].failed, 'record-not-readable');
  assert.equal(R.okCount, 1);
  assert.equal((await J.journeyAt(line, J.instantOf({ year: 1900 }), { borders: null, land: () => null })).failed, 'history-borders-not-loaded');
  assert.equal((await J.journeyAt(line, J.instantOf({ now: true }), { borders: null, land: () => null })).failed, 'country-outlines-not-loaded');
  const html = J.answerHtml(R, 'jp', {});
  assert.match(html, /この時点の国境の記録を読み込めませんでした/);
  /* the modern answer of the record itself: collectionAt says «modern» → today's outlines */
  const M = await J.journeyAt(line, J.instantOf({ year: 2024 }), { borders: { collectionAt: async () => ({ modern: true }) }, land: () => ({ features: world.land }), lang: 'en' });
  assert.equal(M.modern, true);
  assert.deepEqual(M.legs.map((g) => g.key), ['Landia']);
});

test('⑤ instants: mid-June for a year, the day for a date, BC as BC', () => {
  const y = J.instantOf({ year: 1920 });
  assert.deepEqual([y.when.getFullYear(), y.when.getMonth(), y.when.getDate()], [1920, 5, 15]);
  const d = J.instantOf({ date: '1920-10-28' });
  assert.deepEqual([d.when.getFullYear(), d.when.getMonth(), d.when.getDate()], [1920, 9, 28]);
  assert.equal(J.instantOf({ date: '1920-02-31' }), null);
  assert.equal(J.instantOf({ date: 'yesterday' }), null);
  assert.equal(J.instantLabel(J.instantOf({ year: -43 }), 'en'), '44 BC');
  assert.equal(J.instantLabel(J.instantOf({ year: -43 }), 'jp'), '紀元前44年');
  assert.equal(J.instantLabel(d, 'jp'), '1920年10月28日');
  assert.equal(J.instantLabel(J.instantOf({ now: true }), 'en'), 'Today');
});

test('⑥ Atlas: the answer reaches the model, one instant is drawn, the same call twice leaves the same lines', async () => {
  globalThis.window = globalThis.window || globalThis;
  window.IntMapTimeBorders = borders(world.past);
  window.countryGeo = { features: world.land };
  let lines = [], painted = 0;
  const K = {
    R: (ok, html, extra) => Object.assign({ ok: !!ok, html }, extra || null), warn: (s) => '<w>' + s + '</w>', note: (s) => '<n>' + s + '</n>',
    L: (en) => en, esc: (s) => String(s), HOST: { lang: 'en' },
    geocode: async (n) => ({ A: { lng: 0.05, lat: 0, name: 'Aville' }, B: { lng: 9.95, lat: 0, name: 'Bville' } })[n] || null,
    get _hlLines() { return lines; }, set _hlLines(v) { lines = v; },
    _hlPaletteColor: (i) => ['#e6550d', '#3182bd', '#31a354', '#756bb1'][i % 4], paintLines: () => { painted++; return true; },
    GE: () => ({ camera: { fitBounds() {} } }), ensureData: async () => {},
  };
  const a = { type: 'journey', places: ['A', 'B'], years: [1900], now: true, draw: 2 };
  const r1 = await J.atlasRun(a, K);
  assert.equal(r1.ok, true);
  assert.equal(r1.exec.journey.instants.length, 2);
  assert.deepEqual(r1.exec.journey.instants[0].legs.map((g) => g.name), ['Alpha', 'Beta', 'Beta / Gamma', null], 'a shape without a name is not given one');
  assert.equal(r1.exec.journey.drawnOnMap, 'Today', 'draw:2 is the second instant, in the order given');
  const n1 = lines.length;
  assert.ok(n1 >= 2 && lines.every((l) => l.geo.type === 'LineString' && l.name.startsWith('Today')));
  assert.deepEqual(r1.meta.painted.lines, lines.map((l) => l.name));
  const r2 = await J.atlasRun(a, K);
  assert.equal(lines.length, n1, 'a redraw of the same course replaces its own stretches');
  assert.equal(r2.meta.resultKey, r1.meta.resultKey);
  /* another course is another drawing */
  lines.push({ geo: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, name: 'someone else' });
  await J.atlasRun(a, K);
  assert.equal(lines.length, n1 + 1);
  /* a place IntMap cannot find is refused with its name; one place is not a journey */
  const bad = await J.atlasRun({ places: ['A', 'Nowhere'] }, K);
  assert.equal(bad.ok, false); assert.match(bad.html, /Nowhere/);
  assert.equal((await J.atlasRun({ places: ['A'] }, K)).ok, false);
  assert.equal((await J.atlasRun({ places: ['A', 'B'], dates: ['1920-02-31'] }, K)).ok, false);
  delete window.IntMapTimeBorders; delete window.countryGeo;
});

test('⑦ the records, named: the Polish Corridor, Wilno, West Berlin, Austria-Hungary', async () => {
  const H = await journeyHarness('en');
  const PM = await run(H, [[2.3522, 48.8566], [37.6173, 55.7558]], ['1925', '1990', 'now']);
  const keys = (j) => j.legs.map((g) => g.key);
  const [y25, y90, now] = PM.journeys;
  assert.ok(!y25.failed && !y90.failed && !now.failed);
  /* 1925: Germany → Poland (the Corridor) → Germany (East Prussia) → Lithuania … Poland (Wilno, Polish 1922–39) → Soviet Union */
  const k25 = keys(y25), g = k25.indexOf('Germany');
  assert.deepEqual(k25.slice(g, g + 3), ['Germany', 'Poland', 'Germany']);
  assert.ok(k25.includes('Lithuania') && k25.lastIndexOf('Poland') > k25.indexOf('Lithuania'));
  assert.equal(k25[k25.length - 1], 'Soviet Union');
  /* 1990 (CShapes keeps the two Germanies to 3 October): West → East → West (Berlin's western sectors) → East */
  const k90 = keys(y90), w = k90.indexOf('West Germany');
  assert.deepEqual(k90.slice(w, w + 4), ['West Germany', 'East Germany', 'West Germany', 'East Germany']);
  assert.ok(!keys(now).includes('Soviet Union') && keys(now).includes('Belarus'));
  const VI = await run(H, [[16.3738, 48.2082], [28.9760, 41.0122]], ['1913', 'now']);
  assert.ok(keys(VI.journeys[0]).includes('Austria-Hungary') && keys(VI.journeys[0]).includes('Ottoman Empire'));
  assert.ok(!keys(VI.journeys[1]).includes('Austria-Hungary') && keys(VI.journeys[1]).includes('Turkey'));
  assert.ok(VI.journeys[0].record.src && /CShapes/.test(VI.journeys[0].record.src), 'the record names itself');
});

test('⑧ time.journey is declared once: a required line, the paint observer, the run in the lazy module', async () => {
  const caps = (await importModule('js/atlas-cap-time.js')).default;
  const E = caps.filter((c) => c.row[0] === 'time.journey');
  assert.equal(E.length, 1);
  const row = E[0].row;
  assert.equal(row[4], 'paint'); assert.equal(row[9], 'points'); assert.equal(row[7], 'session');
  assert.ok(E[0].doc.some((d) => /時をまたぐ道のり/.test(d.text) && /JOURNEY THROUGH TIME/.test(d.text)), 'the planner reads its name in en and jp');
  assert.match(String(E[0].run), /import\('\.\/journey-through-time\.js'\)/);
});
