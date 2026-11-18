/* (news-with-history) A news event's «This place's past» — the readers it composes are the map's own, asked of real data.
 *   ① how precise the event's place is comes from the grouper's own list of representative kinds — a point that only
 *      represents a country is not read as a place; no location → nothing is read
 *   ② the war reader asks the real war record with the fill's rules: Paris was under the Axis from June 1940 and freed
 *      in 1944; a point no recorded war reached says so; a country-level answer names the country by its CShapes code
 *   ③ the election reader finds the district under a point in the real files, prefiltered by the index's cover (the
 *      cells each file's polygons touch — its superset property is tests/news-past-fixes-checks.test.mjs)
 *   ④ the drawing: a country-level event gets no timeline and says why; gaps and silent wars are stated, not filled;
 *      the card costs a button (nothing is read until it is pressed); Atlas's row is generated
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { importModule } from '../scripts/lib/import-module.mjs';
import { WarGeom } from '../js/war-geom.js';
import { DEFAULTS } from '../supabase/functions/_shared/news-cluster.js';

const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const anything = new Proxy(function () { }, { get: (_, k) => (k === 'then' ? undefined : anything), apply: () => anything });
const fakeEl = () => ({ style: {}, classList: { toggle() { }, add() { }, remove() { } }, appendChild(c) { return c; }, querySelector: () => null, addEventListener() { }, setAttribute() { }, remove() { } });
const document = { readyState: 'loading', baseURI: 'http://intmap.test/', head: fakeEl(), getElementById: () => null, createElement: () => fakeEl(), addEventListener() { }, querySelectorAll: () => [] };
/* the files, from disk, by the URL the module builds */
const fetch = async (u) => { const p = new URL(String(u)).pathname.replace(/^\//, ''); try { const t = rd(p); return { ok: true, status: 200, json: async () => JSON.parse(t) }; } catch (_) { return { ok: false, status: 404, json: async () => null }; } };
const HOST = { lang: 'en', canDraw: () => false, escapeHtml: (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])), imToast() { } };

/* CShapes, opened the way js/hist-bundles.js answers: the rows and rings, `during` and `contains` (exact, holes counted) */
const CS = (() => { const prev = globalThis.window; globalThis.window = {}; try { createRequire(import.meta.url)('../data/cshapes.js'); return globalThis.window.__CSHAPES; } finally { globalThis.window = prev; } })();
const k0 = (f) => f[2] * 10000 + f[3] * 100 + f[4], k1 = (f) => f[5] * 10000 + f[6] * 100 + f[7];
const polys = (f) => f[8].map((p) => p.map((ri) => CS.rings[ri]));
const door = {
  data: CS,
  during: async (t0, t1) => CS.feats.map((f, i) => (k0(f) <= t1 && k1(f) >= t0 ? i : -1)).filter((i) => i >= 0),
  contains: async (x, y) => ({ rows: CS.feats.map((f, i) => (WarGeom.pointInPolys([x, y], polys(f)) ? [i, Object.assign(f.slice(), { 8: null })] : null)).filter(Boolean), dates: [], sheets: [] }),
};
const win = { IntMapDevice: { COMPACT: '(max-width:700px)' }, IntMapHistBundles: { open: () => Promise.resolve(door) }, addEventListener() { },
  /* the map's point-in-polygon for GeoJSON (js/map-ui.js `_imPipGeo`): the same even-odd rule with holes */
  _imPipGeo: (x, y, g) => (g.type === 'Polygon' ? WarGeom.pointInPolys([x, y], [g.coordinates]) : g.type === 'MultiPolygon' ? WarGeom.pointInPolys([x, y], g.coordinates) : false) };
const globals = { window: win, document, fetch, location: { href: 'http://intmap.test/' } };

const { warLayer } = await importModule('js/war-layer.js', { globals, mocks: {
  'js/geo-engine.js': { IntMapGeoEngine: anything }, 'js/chronos.js': { IntMapTime: anything }, 'js/runtime.js': { everyTick: () => 0, stopTick: () => { } } } });
const WARS = warLayer(HOST);
const { elections } = await importModule('js/elections.js', { globals, mocks: { 'js/geo-engine.js': { IntMapGeoEngine: anything } } });
elections(HOST);
const ELECT = win.IntMapElections;
const EP = await importModule('js/event-past.js', { globals, mocks: { 'js/place-history.js': {
  placeHistory: async () => ({ at: {}, nation: { status: 'ok', entries: [], gaps: [{ from: 18680101, to: 18710829 }], records: [], missing: [] }, admin: { status: 'none', entries: [] } }),
  historyHtml: () => '<div class="ph-list">TIMELINE</div>', historyAction: () => null, historyGo: () => ({ action: null, then: null }), forAtlas: (r) => ({ nation: r.nation }), ensureHistoryCss() { } } } });

test('① the place\'s precision is the grouper\'s: city → point; country, admin1, org and unstated → country; none → nothing', () => {
  assert.deepEqual(DEFAULTS.representativeKinds.slice().sort(), ['admin1', 'country', 'org']);
  const it = (kind, loc = [2.35, 48.86]) => ({ analysis: { subjectLoc: loc, placeKind: kind, subjectName: 'X' }, _event: {} });
  assert.equal(EP.eventPlace(it('city')).level, 'point');
  for (const k of DEFAULTS.representativeKinds) { const p = EP.eventPlace(it(k)); assert.equal(p.level, 'country', k); assert.equal(p.why, 'representative-point-of-' + k); }
  assert.equal(EP.eventPlace(it('')).why, 'precision-not-stated', 'an unstated precision is not promoted to a point');
  assert.equal(EP.eventPlace(it('city', null)).level, 'none');
  /* the kind is the event's OWN point's — the members that name the chosen place — not the representative article's subject
     (measured on live events: «Sydney Airport» on an event whose representative article was typed `country`) */
  assert.match(rd('js/news-events.js'), /placeKind: \(\(\) => \{[\s\S]{0,300}a\.subject_name_en === want/);
  assert.match(rd('js/event-past.js'), /String\(a\.placeKind \|\| ''\)/);
  /* the rule is read from the shared list, not written again here */
  assert.match(rd('js/event-past.js'), /DEFAULTS\.representativeKinds/);
});

test('② wars at a point: the record\'s sides and days, by the fill\'s own rules — and silence is not peace', async () => {
  const paris = await WARS.atPoint(2.3522, 48.8566);
  assert.equal(paris.status, 'ok');
  const ww2 = paris.wars.find((w) => w.id === 'ww2');
  assert.ok(ww2 && ww2.involved, 'WW2 involves Paris');
  const axis = ww2.periods.find((p) => p.faction === 'AXIS');
  assert.ok(axis, 'the record puts Paris on the Axis side for a while: ' + JSON.stringify(ww2.periods.map((p) => [p.from, p.faction])));
  assert.ok(axis.from >= '1940-05-10' && axis.from <= '1940-07-01', 'from the fall of France: ' + axis.from);
  assert.ok(axis.to >= '1944-08-01' && axis.to <= '1944-12-31', 'to the liberation: ' + axis.to);
  for (let i = 1; i < ww2.periods.length; i++) assert.equal(ww2.periods[i].from, ww2.periods[i - 1].to, 'periods tile the war without gaps or overlaps');
  assert.ok(ww2.events.length > 0, 'dated events in France are listed');
  /* a side is not a battlefield: France is on the UN side of the Korean War, and no event of that war is in France */
  const korea = paris.wars.find((w) => w.id === 'korea');
  assert.ok(korea.involved && korea.periods.some((p) => p.faction === 'UN') && korea.events.length === 0, JSON.stringify(korea.periods));
  const tokyo = await WARS.atPoint(139.69, 35.69);
  const silent = tokyo.wars.filter((w) => !w.involved).map((w) => w.id);
  assert.ok(silent.includes('yugoslavia'), 'a war that lists neither Japan nor an event in it is reported as silent, not dropped: ' + silent);
  /* the point reader and the fill share one definition of «what is true on a day» */
  const src = rd('js/war-layer.js');
  assert.equal((src.match(/function baseFaction\(/g) || []).length, 1);
  assert.equal((src.match(/function activeFronts\(/g) || []).length, 1);
  assert.match(src, /WarGeom\.factionAt\(pt, polysOf\(g\.row\.i\), base, cuts\)/);

  const sea = await WARS.atPoint(-30, 0);
  assert.equal(sea.status, 'none', 'mid-Atlantic: no country, no war asked');

  const japan = await WARS.atPoint(139.69, 35.69, { level: 'country' });
  assert.equal(japan.country.gw, 740, 'the country is named by its CShapes code');
  const jw2 = japan.wars.find((w) => w.id === 'ww2');
  assert.ok(jw2.periods.some((p) => p.faction !== 'NEUTRAL'), 'Japan has a side in WW2');
});

test('③ elections at a point: the district from the real files, one cover per boundary era', async () => {
  const index = JSON.parse(rd('data/elections/index.json'));
  const geos = [...new Set(index.elections.map((e) => e.geo).filter(Boolean))];
  assert.deepEqual(Object.keys(index.cover.files).sort(), geos.sort(), 'one cover per boundary era');
  const listed = new Set(readdirSync(new URL('../data/elections/', import.meta.url)));
  for (const g of geos) assert.ok(listed.has(g), g);
  const tokyo = await ELECT.atPoint(139.7454, 35.6586, { district: true });   /* Minato, Tokyo */
  assert.equal(tokyo.status, 'ok');
  const jp = tokyo.polities.find((p) => p.id === 'jp');
  assert.ok(jp, 'Japan');
  const hr = jp.bodies.find((b) => /Representatives/.test(b.body));
  assert.ok(hr && hr.district && /Tokyo/.test(hr.district.name), 'the House district under the point: ' + JSON.stringify(hr && hr.district && hr.district.name));
  assert.equal(hr.election, index.elections.filter((e) => e.polity === 'jp' && e.body.en === 'House of Representatives').pop().id, 'the newest election of the chamber');
  /* «who won» is the popup's own rule (rowResult), not a second one: the one winner is the declared party's top candidate */
  const won = hr.district.candidates.filter((c) => c.won);
  assert.equal(won.length, 1, 'one member for a single-member district');
  assert.equal(won[0].party.id, hr.district.winner.id);
  assert.match(rd('js/elections.js'), /const \{ cands, anyV, maxV, tot, won: wonBy \} = rowResult\(row\);/);
  assert.ok(hr.seats.length &&hr.seats[0].seats >= hr.seats[hr.seats.length - 1].seats, 'seats, largest first');
  assert.ok(!tokyo.polities.some((p) => p.id === 'uk'), 'no other polity claims Tokyo');
  const nowhere = await ELECT.atPoint(-30, 0);
  assert.equal(nowhere.status, 'none');
  const country = await ELECT.atPoint(139.7454, 35.6586, { district: false });
  assert.ok(country.polities[0].bodies.every((b) => b.district === undefined), 'a country-level event gets no district');
});

test('④ the drawing states what it does not show; the card reads nothing until pressed; Atlas has the row', async () => {
  const cityItem = { analysis: { subjectLoc: [2.3522, 48.8566], placeKind: 'city', subjectName: 'Paris' }, _event: {} };
  const countryItem = { analysis: { subjectLoc: [139.69, 35.69], placeKind: 'country', subjectName: 'Japan' }, _event: {} };
  win.IntMapWarFronts = { atPoint: (x, y, o) => WARS.atPoint(x, y, o), label: () => '' };
  const city = await EP.readPast(EP.eventPlace(cityItem));
  const h1 = EP.pastHtml(city, 'en');
  assert.match(h1, /TIMELINE/, 'a point event draws the place card\'s own timeline');
  assert.match(h1, /not every conflict/, 'the war record says it is not every conflict');
  assert.match(h1, /a party to the war, not that fighting reached this place/, 'a side is said to be a party, not a battlefield');
  const tk = EP.pastHtml(await EP.readPast(EP.eventPlace({ analysis: { subjectLoc: [139.69, 35.69], placeKind: 'city' }, _event: {} })), 'en');
  assert.match(tk, /Listing neither this state nor an event in it: [^<]*/);
  const country = await EP.readPast(EP.eventPlace(countryItem));
  assert.equal(country.history.status, 'not-asked');
  const h2 = EP.pastHtml(country, 'jp');
  assert.ok(!/TIMELINE/.test(h2), 'a country-level event gets no point timeline');
  assert.match(h2, /代表点で、出来事が起きた地点ではありません/);
  /* (news-past-fixes) the election note of a country-level event speaks of the country, not of «this point» */
  assert.match(h2, /この国で行われたもの（出来事の代表点で問い合わせ/);
  assert.ok(!/その選挙区がこの地点を含むもの|この地点は、IntMap が持つ/.test(h2), 'no «this point» in a country-level answer');
  assert.ok(!/data-ep=/.test(EP.pastHtml(city, 'en', { inert: true })), 'Atlas\'s bubble is inert');
  const A = EP.forAtlas(country);
  assert.equal(A.place.level, 'country'); assert.equal(A.history.notAsked, 'representative-point-of-country');
  /* the card: a button, and the module is fetched by its press */
  const ne = rd('js/news-events.js');
  assert.match(ne, /id="ev-past-go"/);
  assert.match(ne, /pg\.onclick = \(\) => \{[\s\S]{0,400}import\('\.\/event-past\.js'\)/);
  assert.ok(!/^import .*event-past/m.test(ne), 'not on the card\'s import graph');
  assert.match(rd('js/atlas-capabilities.js'), /\["news\.eventPast","eventPast",/);
});
