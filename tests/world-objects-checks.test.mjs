/* ============================================================================
 *  IntMap · world-objects — one shape for a real-world thing, and a way to follow it
 * ----------------------------------------------------------------------------
 *  A quake, a news event, a facility, a company, a volcano and a place profile used to come back from their
 *  capabilities in six shapes, so «that earthquake» ended where its answer ended. js/atlas-geo-object.js now
 *  holds ONE shape (`worldObject`) and js/atlas-world-objects.js the adapters, the session index and the
 *  relation rule. What this file RUNS (the modules the browser runs, handed wrong inputs on purpose):
 *    ① the shape: built ON geoObject (a centroid stays a centroid), `ref` is type:id, no id → no ref, a bounds
 *      that is not ordered is dropped, a time the source did not state stays null (never `now`)
 *    ② the adapters write down what a record states and nothing else: a pseudo-coordinate (mapped === false)
 *      is not a position, a volcano's last eruption stays a YEAR, an event keeps its member article ids
 *    ③ the relation rule: linked | near AND (concurrent OR one is timeless) — TIME ALONE IS NEVER A RELATION,
 *      a radius that is not a number falls back to the default instead of relating nothing
 *    ④ the index: re-registering keeps the stronger provenance and unions edges and ids; a name finds a longer
 *      name that contains it; an unknown name finds nothing (no guess)
 *    ⑤ related(): ordering (linked, then nearer), the total is returned even with a limit, `extra` candidates
 *      are judged by the same rule and are not stored
 *    ⑥ the capabilities run against a stub kernel: research.object resolves a registered ref and answers
 *      «not found» for a name nothing holds; research.related lists what is tied to it with the reasons and
 *      says when the feed could not be read
 *    ⑦ the producers hand their objects over: impact, events, volcano, company, place profile each return
 *      `exec.worldObjects` (run, not read: impact and events through their own dispatch with a stub kernel)
 *    ⑧ relatedHtml escapes what the sources wrote
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeAtlasGeoObject } from '../js/atlas-geo-object.js';
import { makeAtlasWorldObjects, RELATED_DEFAULTS } from '../js/atlas-world-objects.js';
import caps from '../js/atlas-cap-research.js';

const geo = makeAtlasGeoObject();
const fresh = () => makeAtlasWorldObjects({ geo });
const T0 = Date.parse('2026-10-01T06:00:00Z');
const quakeFeature = (over) => Object.assign({ id: 'us7000test', properties: { mag: 6.4, place: '14 km SSW of Testville', time: T0, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000test' }, geometry: { coordinates: [37.0, 37.5, 10] } }, over);

test('① the shape is built on geoObject: provenance survives, a centroid stays a centroid', () => {
  const o = geo.worldObject({ type: 'earthquake', id: 'x1', name: 'Q', lng: 10, lat: 20, provenance: 'feed_coordinate' });
  assert.equal(o.provenance, 'feed_coordinate'); assert.equal(o.ref, 'earthquake:x1'); assert.equal(geo.isWorldObject(o), true);
  const c = geo.worldObject({ type: 'place', id: 'p', name: 'Kenya', lng: 37, lat: 0 });
  assert.equal(c.provenance, 'resolved_place_centroid'); assert.equal(geo.pointLike(c), false);
  assert.equal(geo.GEO_OBJECT_VERSION, 1, 'the place record the other readers use did not change');
  assert.equal(geo.isWorldObject(geo.geoObject({ name: 'plain' })), false);
});

test('① no id → no ref; unordered bounds dropped; an unstated time stays null; null island is not a place', () => {
  const o = geo.worldObject({ type: 'facility', name: 'plant', lng: 1, lat: 1, bounds: [10, 10, 5, 5] });
  assert.equal(o.ref, ''); assert.equal(o.bounds, null); assert.equal(o.time, null);
  assert.equal(geo.worldObject({ type: 'place', id: 'n', lng: null, lat: null }).lat, null);
  assert.deepEqual(geo.worldObject({ type: 'place', id: 'b', bounds: [1, 2, 3, 4] }).bounds, [1, 2, 3, 4]);
  const t = geo.worldObject({ type: 'news_event', id: 'e', atMs: T0, endMs: T0 - 5 });
  assert.equal(t.time.endMs, t.time.atMs, 'an end before the start is not an interval');
  assert.equal(geo.worldObject({ type: 'x', id: 'y', at: 'not a date' }).time, null);
});

test('② adapters: USGS keeps its own id, time, magnitude and depth', () => {
  const W = fresh(); const q = W.fromUsgs(quakeFeature());
  assert.equal(q.ref, 'earthquake:us7000test'); assert.equal(q.time.atMs, T0); assert.equal(q.facts.magnitude, 6.4); assert.equal(q.facts.depthKm, 10);
  assert.equal(q.provenance, 'feed_coordinate'); assert.equal(q.sources[0].name, 'USGS');
  assert.equal(W.fromUsgs({ properties: {}, geometry: { coordinates: [1, 2] } }), null, 'no id → nothing to name it by');
});

test('② adapters: a news event with no resolved subject has NO position (mapped === false is a pseudo-coordinate)', () => {
  const W = fresh();
  const item = (mapped, loc) => ({ title: 'Quake hits town', analysis: { loc, mapped }, _event: { publicId: 'ev1', title: 'Quake hits town', firstAt: '2026-10-01T07:00:00Z', lastAt: '2026-10-01T09:00:00Z', outlets: ['A', 'B'], members: [{ id: 'a1' }, { id: 'a2' }], articleCount: 2, sourceCount: 2 } });
  const placed = W.fromNewsEvent(item(true, [37.1, 37.4]));
  assert.equal(placed.lat, 37.4); assert.deepEqual(placed.articleIds, ['a1', 'a2']); assert.equal(placed.time.endMs - placed.time.atMs, 2 * 3600000);
  const fake = W.fromNewsEvent(item(false, [12.3, 45.6]));
  assert.equal(fake.lat, null, 'a hash-derived pin is not where it happened'); assert.equal(fake.provenance, 'model_named');
  assert.equal(W.fromNewsArticle(item(true, [1, 1])), null, 'an event is not re-read as an article');
});

test('② adapters: a volcano keeps the last eruption as a YEAR; a company has no position without a profile', () => {
  const W = fresh();
  const v = W.fromVolcano({ v: 283110, name: 'Sakurajima', country: 'Japan', lngLat: [130.66, 31.58], lastEruption: 2025, maxVei: 5, eruptions: 100, status: { label: 'Level 3', source: 'JMA' } });
  assert.equal(v.facts.lastEruptionYear, 2025); assert.equal(v.time, null, 'the catalogue states a year, not a moment'); assert.equal(v.ref, 'volcano:gvp-283110');
  const c = W.fromCompany({ id: 'toyota', n: 'Toyota' }, null);
  assert.equal(c.lat, null); assert.equal(c.type, 'company');
  assert.equal(W.fromCompany({ id: 'toyota', n: 'Toyota' }, { lon: 137.15, lat: 35.08 }).lat, 35.08);
  const row = W.fromEventRow({ public_id: 'E9', representative_title: 'Toyota recall', rep_lng: 137, rep_lat: 35, first_published_at: '2026-10-01T00:00:00Z' }, { links: [{ rel: 'mentions', ref: c.ref }] });
  assert.equal(row.links[0].ref, 'company:toyota'); assert.equal(W.fromEventRow({ public_id: 'E8', representative_title: 'x' }).lat, null);
});

const quake = () => fresh().fromUsgs(quakeFeature());
test('③ relation: time alone is never a relation; near + concurrent is; a timeless facility needs only place', () => {
  const W = fresh(); const q = W.fromUsgs(quakeFeature());
  const farSameTime = geo.worldObject({ type: 'news_event', id: 'far', name: 'far', lng: -120, lat: 35, provenance: 'event_location', atMs: T0 + 3600000 });
  assert.equal(W.relation(q, farSameTime), null, 'same afternoon, other side of the planet');
  const nearSameTime = geo.worldObject({ type: 'news_event', id: 'near', name: 'near', lng: 37.1, lat: 37.4, provenance: 'event_location', atMs: T0 + 3600000 });
  const r = W.relation(q, nearSameTime); assert.deepEqual(r.why, ['near', 'concurrent']);
  const nearLater = geo.worldObject({ type: 'news_event', id: 'late', name: 'late', lng: 37.1, lat: 37.4, provenance: 'event_location', atMs: T0 + 30 * 24 * 3600000 });
  assert.equal(W.relation(q, nearLater), null, 'near, but a month apart: two different stories');
  const plant = geo.worldObject({ type: 'facility', id: 'p', name: 'plant', lng: 37.2, lat: 37.6, provenance: 'feed_coordinate' });
  assert.ok(W.relation(q, plant).why.indexOf('near') >= 0, 'a power plant is judged by place alone');
  assert.equal(W.relation(q, q), null, 'not related to itself');
});

test('③ relation: an edge or a shared article id links regardless of distance; a NaN radius falls back to the default', () => {
  const W = fresh(); const q = W.fromUsgs(quakeFeature());
  const edge = geo.worldObject({ type: 'facility', id: 'e', name: 'e', lng: -50, lat: -10, provenance: 'feed_coordinate', links: [{ rel: 'within_impact_of', ref: q.ref }] });
  assert.deepEqual(W.relation(q, edge).why, ['linked']);
  const a = geo.worldObject({ type: 'news_event', id: 'a', lng: 1, lat: 1, provenance: 'event_location', articleIds: ['x', 'y'], atMs: T0 });
  const b = geo.worldObject({ type: 'article', id: 'b', lng: 100, lat: 1, provenance: 'event_location', articleIds: ['y'], atMs: T0 + 9e9 });
  assert.ok(W.relation(a, b).why.indexOf('linked') >= 0);
  const near = geo.worldObject({ type: 'facility', id: 'n', lng: 37.1, lat: 37.5, provenance: 'feed_coordinate' });
  assert.ok(W.relation(q, near, { km: NaN }), 'NaN falls back to the default radius rather than relating nothing');
  assert.equal(W.relation(q, near, { km: 1 }), null, 'a small radius is honoured');
  assert.deepEqual(RELATED_DEFAULTS, { km: 300, hours: 72 });
  const area = geo.worldObject({ type: 'electoral_district', id: 'd', name: 'D', lng: 0, lat: 0, provenance: 'resolved_place_centroid', bounds: [36, 37, 38, 38] });
  assert.ok(W.relation(q, area).why.indexOf('near') >= 0, 'inside the other object\'s extent counts as near');
});

test('④ the index: stronger provenance wins, edges and ids accumulate, names find longer names, unknown finds nothing', () => {
  const W = fresh();
  const strong = geo.worldObject({ type: 'volcano', id: 'v', name: 'Etna', lng: 15, lat: 37.7, provenance: 'feed_coordinate', articleIds: ['a1'] });
  const weak = geo.worldObject({ type: 'volcano', id: 'v', name: 'Etna', lng: 15.5, lat: 38, provenance: 'resolved_place_centroid', articleIds: ['a2'], links: [{ rel: 'x', ref: 'y:z' }] });
  W.register(strong); const merged = W.register(weak)[0];
  assert.equal(merged.provenance, 'feed_coordinate'); assert.equal(merged.lat, 37.7); assert.deepEqual(merged.articleIds, ['a1', 'a2']); assert.equal(merged.links.length, 1);
  const q = W.register(W.fromUsgs(quakeFeature()))[0];
  assert.equal(W.find('Testville').ref, q.ref, 'a short name finds «14 km SSW of Testville»');
  assert.equal(W.find('earthquake:us7000test').ref, q.ref); assert.equal(W.find('us7000test').ref, q.ref);
  assert.equal(W.find('Atlantis'), null); assert.equal(W.find('Testville', { type: 'volcano' }), null);
  assert.equal(W.register({ not: 'an object' }).length, 0, 'only worldObject() output is stored');
});

test('⑤ related(): linked first, then nearer; the total survives a limit; extra candidates are judged and not stored', () => {
  const W = fresh(); const q = W.register(W.fromUsgs(quakeFeature()))[0];
  const mk = (id, lng, lat, links) => geo.worldObject({ type: 'facility', id, name: id, lng, lat, provenance: 'feed_coordinate', links });
  W.register([mk('far', 38.5, 37.5), mk('close', 37.05, 37.5), mk('linked-far', -70, 10, [{ rel: 'within_impact_of', ref: q.ref }])]);
  const res = W.related(q.ref, {});
  assert.deepEqual(res.items.map((x) => x.object.id), ['linked-far', 'close', 'far']);
  const lim = W.related(q, { limit: 1 }); assert.equal(lim.items.length, 1); assert.equal(lim.total, 3);
  const extra = [W.fromUsgs(quakeFeature({ id: 'aftershock', properties: { mag: 4.8, place: 'aftershock', time: T0 + 3600000 }, geometry: { coordinates: [37.02, 37.52, 8] } }))];
  const withExtra = W.related(q, { extra, types: ['earthquake'] });
  assert.deepEqual(withExtra.items.map((x) => x.object.id), ['aftershock']);
  assert.equal(W.find('aftershock'), null, 'candidates handed in are not stored');
  assert.deepEqual(W.related('nothing here'), { subject: null, items: [], total: 0 });
});

const kernel = (W, over) => Object.assign({
  R: (ok, html, extra) => Object.assign({ ok: !!ok, html: html || '' }, extra || null),
  warn: (x) => '<warn>' + x + '</warn>', L: (en, jp) => en, esc: (x) => String(x).replace(/[&<>"]/g, (c) => '&#' + c.charCodeAt(0) + ';'),
  HOST: { globalData: [] }, _fetchJSON: async () => ({ features: [] }),
}, over || {});
const entry = (id) => caps.find((e) => e.row[0] === id);

test('⑥ research.object / research.related run: a registered ref resolves; a stranger name is not found; the reasons are returned', async () => {
  const { worldObjects } = await import('../js/atlas-world-objects.js'); worldObjects.clear();
  const q = worldObjects.register(worldObjects.fromUsgs(quakeFeature()))[0];
  const plant = worldObjects.register(worldObjects.fromFacility({ lng: 37.1, lat: 37.6, name: 'Test Dam', _k: 'dams' }))[0];
  const K = kernel(worldObjects, { HOST: { globalData: [{ title: 'Quake news', desc: '', link: 'https://example.com/a', pubDate: new Date(T0 + 1800000).toISOString(), analysis: { loc: [37.0, 37.45], mapped: true } }] } });
  const one = await entry('research.object').run({ ref: q.ref }, {}, K);
  assert.equal(one.ok, true); assert.equal(one.exec.worldObjects.subject, q.ref); assert.match(one.html, /M6\.4/); assert.match(one.html, /USGS/);
  const lost = await entry('research.object').run({ name: 'Atlantis' }, {}, K);
  assert.equal(lost.ok, false); assert.equal(lost.meta.code, 'NOT_FOUND');
  assert.equal((await entry('research.object').run({}, {}, K)).meta.code, 'NEEDS_INPUT');
  const rel = await entry('research.related').run({ ref: q.ref }, {}, K);
  assert.equal(rel.ok, true);
  const kinds = rel.exec.worldObjects.related.map((x) => x.type).sort();
  assert.deepEqual(kinds, ['article', 'facility'], 'the dam by place, the article by place and time');
  assert.ok(rel.exec.worldObjects.related.every((x) => x.why.length), 'every result says why'); assert.equal(rel.exec.worldObjects.total, 2);
  const broken = await entry('research.related').run({ ref: q.ref }, {}, kernel(worldObjects, { _fetchJSON: async () => { throw new Error('down'); } }));
  assert.equal(broken.exec.worldObjects.partial, true); assert.match(broken.html, /USGS feed could not be read/);
  assert.ok(plant.ref);
});

test('⑥ the registry row is declared once, both spellings are free, and the planner is told how to use them', () => {
  for (const id of ['research.object', 'research.related']) {
    const e = entry(id); assert.ok(e, id); assert.equal(e.row[7], 'read'); assert.equal(e.row[8], 'none');
    assert.ok(e.doc.length && /ref/.test(e.doc[0].text), id + ' documents the ref');
    const schema = e.schema(); assert.ok(schema.anyOf.length >= 2);
  }
  assert.notEqual(entry('research.object').row[1], 'object', '«object» is map.object\'s spelling');
});

test('⑦ the producers hand their objects over, run through their own dispatch', async () => {
  const { worldObjects } = await import('../js/atlas-world-objects.js'); worldObjects.clear();
  /* impact: the quake centre, a facility and a city, each tied to the centre */
  const feed = { features: [quakeFeature(), quakeFeature({ id: 'near2', properties: { mag: 5.0, place: 'M5 aftershock', time: T0 + 60000 }, geometry: { coordinates: [37.05, 37.55, 9] } })] };
  const pois = [];
  const K = Object.assign(kernel(worldObjects), {
    ensureData: async () => {}, _fetchJSON: async () => feed, _havKm: (a, b) => worldObjects.distanceKm({ lng: a.lng, lat: a.lat }, { lng: b.lng, lat: b.lat }),
    _setLast: () => {}, DEIXIS_RE: /^$/, placeExtent: async () => null, geocode: async () => null,
    overpassPOIs: async (k) => [{ lng: 37.1, lat: 37.6, name: 'Test Dam' }], overpassRaw: async () => ({ elements: [{ lon: 37.2, lat: 37.4, tags: { name: 'Testville', population: '120000' } }] }),
    HOST: { lang: 'en', globalData: [] }, _newsData: () => '', clearPois: () => { pois.length = 0; }, paintPois: () => true, GE: () => ({ camera: { fitBounds() {} } }),
    codeAtPoint: () => null, countryStats: {}, nm: () => '', _PINNED: (x) => x, _lastPlace: null, _pois: pois,
  });
  Object.defineProperty(K, '_pois', { get: () => pois, set: (v) => { pois.length = 0; pois.push(...v); } });
  const res = await entry('research.impact').run({ event: 'quake', km: 300, focus: ['dam'] }, {}, K);
  assert.equal(res.ok, true);
  const wo = res.exec.worldObjects;
  assert.equal(wo.subject, 'earthquake:us7000test'); assert.deepEqual(Object.keys(wo.totals).sort(), ['city', 'earthquake', 'facility']);
  const rel = worldObjects.related(wo.subject);
  const types = rel.items.map((x) => x.object.type).sort();
  assert.deepEqual(types, ['city', 'earthquake', 'facility']);
  assert.ok(rel.items.every((x) => x.why.indexOf('linked') >= 0), 'every object the analysis found is tied to its centre by an edge');
  /* events: server Event → news_event with member article ids */
  worldObjects.clear();
  const it = { title: 'Quake hits Testville', link: 'https://example.com/q', pubDate: '2026-10-01T09:00:00Z', analysis: { loc: [37.0, 37.5], mapped: true },
    _event: { publicId: 'ev-1', title: 'Quake hits Testville', titleShown: 'Quake hits Testville', firstAt: '2026-10-01T07:00:00Z', lastAt: '2026-10-01T09:00:00Z', outlets: ['A'], members: [{ id: 'art-1', title: 'Quake hits Testville', url: 'https://example.com/q', publishedAt: '2026-10-01T09:00:00Z' }], articleCount: 1, sourceCount: 1, place: 'Testville' } };
  const KE = Object.assign(kernel(worldObjects), {
    ensureData: async () => {}, fetchData: async () => {}, _agoH: () => 2, WORLD_RE: /^$/, DEIXIS_RE: /^$/, geocode: async () => null, placeExtent: async () => null,
    _bboxOK: () => false, newsSubject: (a) => ({ loc: a.loc }), _havKm: () => 0, note: (x) => x, groupNewsEvents: () => [], clearPois: () => {}, paintPois: () => true, GE: () => ({ camera: { fitBounds() {} } }),
    _atlCleanUrl: () => null, linkCards: () => '', EVENT_RULES: { HOURS: 72, SIM_MIN: 0.5, SIM_MAX: 0.8 }, _PINNED: (x) => x, _pois: [],
  });
  KE.HOST = { lang: 'en', globalData: [it], newsSurfaceMode: () => 'events' };
  const ev = await entry('research.events').run({ n: 3 }, {}, KE);
  assert.equal(ev.ok, true); assert.equal(ev.exec.worldObjects.objects[0].ref, 'news_event:ev-1'); assert.deepEqual(ev.exec.worldObjects.objects[0].articleIds, ['art-1']);
  assert.ok(worldObjects.find('news_event:ev-1'), 'the event is in the index for the next turn');
});

test('⑧ relatedHtml escapes what the sources wrote and says why each row is there', () => {
  const W = fresh();
  const evil = geo.worldObject({ type: 'article', id: 'x', name: '<img src=x onerror=alert(1)>', lng: 37.01, lat: 37.5, provenance: 'event_location', atMs: T0 });
  const res = W.related(W.fromUsgs(quakeFeature()), { extra: [evil] });
  const html = W.relatedHtml(res, { esc: (x) => String(x).replace(/</g, '&lt;') }).html;
  assert.ok(!/<img/.test(html)); assert.match(html, /near \+ around the same time/);
});
