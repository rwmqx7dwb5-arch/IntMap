/* ============================================================================
 *  IntMap · world-object-graph — the same real-world thing is ONE object, however many sources named it,
 *  and the ties between objects are typed, dated and walkable
 * ----------------------------------------------------------------------------
 *  tests/world-objects-checks.test.mjs holds the shape, the adapters and the proximity rule. What this file runs
 *  (the modules the browser runs, handed wrong inputs on purpose):
 *    ① identifiers: a malformed external id is dropped, not stored; the source's OWN id survives the trip from
 *      Overpass through the adapter, so a renamed or re-measured facility keeps its ref
 *    ② identity: two records stating one external id fold into one object (alias kept, edges still reach it); a
 *      name and a place are NEVER enough; a bridging record folds two held objects; a disagreeing id or a different
 *      type is tied, not merged; look-alikes are listed as candidates, not facts
 *    ③ precision: a company's city-level headquarters stays an AREA's representative point
 *    ④ typed ties: both directions, several hops, only the asked names; a tie and an object with a stated period
 *      drop out when asked «as of» a date outside it
 *    ⑤ claims: two sources' numbers for one key coexist and the disagreement is reported (units differ ≠ disagree)
 *    ⑥ the capabilities: research.related follows rels / depth / at; research.object states identity
 *    ⑦ the readers: a GIS feature the dataset names carries an id, a row number does not pretend to
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeAtlasGeoObject } from '../js/atlas-geo-object.js';
import { makeAtlasWorldObjects } from '../js/atlas-world-objects.js';
import { makeAtlasSources } from '../js/atlas-sources.js';
import caps from '../js/atlas-cap-research.js';

const geo = makeAtlasGeoObject();
const fresh = () => makeAtlasWorldObjects({ geo });
const Y = (y) => Date.parse(y + '-01-01T00:00:00Z');

test('① external ids: each scheme validates its own value; a malformed one is dropped', () => {
  const ids = geo.cleanExtIds({ osm: 'node/123', wikidata: 'q42', geonames: '5128581', company: 'acme', Bad: { x: 1 }, osm2: 'x y' });
  assert.equal(ids.osm, 'node/123'); assert.equal(ids.wikidata, 'Q42'); assert.equal(ids.geonames, '5128581'); assert.equal(ids.company, 'acme');
  assert.equal(ids.bad, undefined, 'an object is not an id');
  assert.equal(geo.cleanExtIds({ osm: '123' }).osm, undefined, 'an OSM id without its element type is not an OSM id');
  assert.equal(geo.cleanExtIds({ wikidata: 'Q0' }).wikidata, undefined);
  assert.equal(geo.cleanExtIds({ osm: 'way/9' }).osm, 'way/9');
});

test('① a facility keeps the id its SOURCE gave: rename it and refine its coordinate, the ref stays', () => {
  const W = fresh();
  const a = W.fromFacility({ lng: 139.6500, lat: 35.4500, name: 'Daikoku Pier', osm: 'way/4471', wd: 'Q1234', kind: 'harbour' });
  const b = W.fromFacility({ lng: 139.65012, lat: 35.45003, name: 'Daikoku Wharf (renamed)', osm: 'way/4471', kind: 'harbour' });
  assert.equal(a.ref, 'facility:osm-way-4471'); assert.equal(b.ref, a.ref);
  const [x] = W.register([a]); const [y] = W.register([b]);
  assert.equal(W.all().length, 1, 'one stored object'); assert.equal(y.ids.wikidata, 'Q1234', 'the id stated earlier is kept'); assert.equal(x.ref, y.ref);
  assert.ok(a.sources.some((s) => /openstreetmap\.org\/way\/4471/.test(s.url)), 'the source link points at the element');
  const noId = W.fromFacility({ lng: 1, lat: 2, name: 'Unlabelled' });
  assert.match(noId.ref, /^facility:unlabelled@/, 'only a record with no id of its own falls back to name + position');
});

test('① overpassPOIs carries the element id out of the reply (run, with a stand-in network)', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ elements: [
    { type: 'way', id: 4471, center: { lat: 35.45, lon: 139.65 }, tags: { name: 'Daikoku Pier', landuse: 'harbour', wikidata: 'Q1234' } },
    { type: 'node', id: 9, lat: 35.5, lon: 139.7, tags: { name: 'Crane 9', industrial: 'port' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const S = makeAtlasSources({ lang: 'en' }, {});
    const out = await S.overpassPOIs('port', [[139, 35], [140, 36]], false, null);
    assert.ok(out && out.length === 2, 'both elements came back');
    assert.equal(out[0].osm, 'way/4471'); assert.equal(out[0].wd, 'Q1234'); assert.equal(out[1].osm, 'node/9');
    const o = fresh().fromFacility(out[0]);
    assert.equal(o.ids.osm, 'way/4471'); assert.equal(o.ids.wikidata, 'Q1234');
  } finally { globalThis.fetch = real; }
});

test('② the same external id folds two sources into one object; edges to the folded ref still reach it', () => {
  const W = fresh();
  const osm = W.fromFacility({ lng: 139.65, lat: 35.45, name: 'Yokohama Port', osm: 'relation/77', wd: 'Q5', kind: 'port' });
  const wd = W.fromFacility({ lng: 139.652, lat: 35.451, name: 'Port of Yokohama', wd: 'Q5', kind: 'Wikidata' });
  assert.notEqual(osm.ref, wd.ref);
  const news = geo.worldObject({ type: 'news_event', id: 'e1', name: 'Port strike', lng: 139.65, lat: 35.45, atMs: Y(2026), links: [{ rel: 'mentions', ref: wd.ref }] });
  W.register([osm]); const [held] = W.register([wd]); W.register([news]);
  assert.equal(W.all().filter((o) => o.type === 'facility').length, 1);
  assert.equal(held.ref, osm.ref, 'the first-held ref is the stored one'); assert.deepEqual(held.aliases, [wd.ref]);
  assert.equal(W.find(wd.ref).ref, osm.ref, 'the old ref still finds it'); assert.equal(W.find('wikidata:Q5').ref, osm.ref); assert.equal(W.find('osm:relation/77').ref, osm.ref);
  const r = W.related(held, { rels: ['mentioned_in'] });
  assert.equal(r.total, 1, 'the edge written against the alias reaches the stored object'); assert.equal(r.items[0].object.ref, 'news_event:e1');
  assert.equal(held.sources.length, 2, 'both sources are credited');
});

test('② a name and a place are never enough: same name, same spot, no shared id → two objects, listed as candidates', () => {
  const W = fresh();
  const a = W.fromFacility({ lng: 10, lat: 10, name: 'Central Terminal', osm: 'node/1' });
  const b = W.fromFacility({ lng: 10.0001, lat: 10.0001, name: 'Central Terminal', osm: 'node/2' });
  const c = W.fromFacility({ lng: 10.0002, lat: 10, name: 'Central Terminal' });
  W.register([a, b, c]);
  assert.equal(W.all().length, 3);
  const idn = W.identity(a.ref);
  assert.equal(idn.candidates.length, 2); assert.ok(idn.candidates.every((x) => x.distanceKm < 0.5));
  assert.equal(W.identity(a.ref, { km: 0.001 }).candidates.length, 0, 'the radius is the caller\'s');
  const far = W.fromFacility({ lng: 11, lat: 10, name: 'Central Terminal', osm: 'node/3' });
  W.register([far]); assert.equal(W.identity(a.ref).candidates.length, 2, 'a same-named place far away is not a look-alike');
});

test('② an object that carries two ids bridges two held objects; a disagreeing id or a different type is tied, not merged', () => {
  const W = fresh();
  W.register([W.fromFacility({ lng: 1, lat: 1, name: 'A', osm: 'node/10' }), W.fromFacility({ lng: 1, lat: 1, name: 'A-wd', wd: 'Q10' })]);
  assert.equal(W.all().length, 2);
  W.register([W.fromFacility({ lng: 1, lat: 1, name: 'A both', osm: 'node/10', wd: 'Q10' })]);
  assert.equal(W.all().length, 1, 'the third record is the evidence the first two are one');
  assert.equal(W.all()[0].ids.osm, 'node/10'); assert.equal(W.all()[0].ids.wikidata, 'Q10');
  /* a record that agrees on one id and DISAGREES on another is not folded in (next test) */
  W.register([W.fromFacility({ lng: 1, lat: 1, name: 'A?', osm: 'node/10', wd: 'Q99', id: 'other-ref' })]);
  assert.equal(W.all().length, 2, 'kept apart');
});

test('② conflicting identifiers are tied `conflicting_identity`; a different type is `candidate_match`', () => {
  const W = fresh();
  const base = geo.worldObject({ type: 'facility', id: 'p1', name: 'P', lng: 1, lat: 1, provenance: 'feed_coordinate', ids: { wikidata: 'Q7', osm: 'node/7' } });
  const clash = geo.worldObject({ type: 'facility', id: 'p2', name: 'P', lng: 1, lat: 1, provenance: 'feed_coordinate', ids: { wikidata: 'Q7', osm: 'node/8' } });
  const typed = geo.worldObject({ type: 'city', id: 'c1', name: 'P', lng: 1, lat: 1, provenance: 'feed_coordinate', ids: { wikidata: 'Q7' } });
  W.register([base, clash, typed]);
  assert.equal(W.all().length, 3, 'nothing was merged on a disagreement');
  const idn = W.identity('facility:p1');
  assert.ok(idn.conflicts.some((c) => c.rel === 'conflicting_identity' && c.ref === 'facility:p2'));
  assert.ok(W.identity('city:c1').conflicts.some((c) => c.rel === 'candidate_match'));
  assert.equal(W.find('wikidata:Q7').ref, 'facility:p1', 'the identifier still names the first-held object');
});

test('③ a headquarters known only to its CITY stays an area\'s representative point; an exact one is a feed coordinate', () => {
  const W = fresh();
  const city = W.fromCompany({ id: 'acme', n: 'Acme', wd: 'Q300' }, { lon: 8.5, lat: 47.3, precision: 'city' });
  const exact = W.fromCompany({ id: 'bolt', n: 'Bolt' }, { lon: 8.5, lat: 47.3, precision: 'exact' });
  const bare = W.fromCompany({ id: 'cove', n: 'Cove' }, null);
  assert.equal(city.provenance, 'resolved_place_centroid'); assert.equal(geo.pointLike(city), false);
  assert.equal(exact.provenance, 'feed_coordinate'); assert.equal(bare.lat, null);
  assert.deepEqual([city.ids.company, city.ids.wikidata], ['acme', 'Q300']);
});

const profile = () => ({
  _hq: { lon: 8.5, lat: 47.3, precision: 'city' },
  facilities: [
    { id: 'acme-hq', name: 'Acme HQ', type: 'headquarters', group: 'hq', lon: 8.5, lat: 47.3, precision: 'city', opened: null, closed: null },
    { id: 'osm-way-55', name: 'Acme Terminal 1', type: 'terminal', group: 'logistics', lon: 139.7, lat: 35.5, precision: 'exact', opened: 1998, closed: 2011 },
    { id: 'acme-t2', name: 'Acme Terminal 2', type: 'terminal', group: 'logistics', lon: 139.71, lat: 35.51, precision: 'exact', opened: '2005-04-01', closed: null },
    { id: 'acme-nowhere', name: 'Unplaced depot', type: 'depot', group: 'other', precision: 'exact' },
  ],
});

test('④ a company profile becomes a company and its sites, tied operated_by for the span the profile states', () => {
  const W = fresh();
  const { company, sites } = W.fromCompanyProfile({ id: 'acme', n: 'Acme', wd: 'Q300' }, profile());
  assert.equal(sites.length, 4, 'a site without coordinates is still a site');
  const t1 = sites.find((s) => s.id === 'osm-way-55');
  assert.equal(t1.ids.osm, 'way/55'); assert.deepEqual(t1.validity, { fromMs: Y(1998), toMs: Y(2011) });
  assert.deepEqual(t1.links[0], { rel: 'operated_by', ref: company.ref, fromMs: Y(1998), toMs: Y(2011), confidence: 'high', source: 'IntMap company atlas' });
  assert.equal(sites.find((s) => s.id === 'acme-hq').provenance, 'resolved_place_centroid');
  assert.equal(sites.find((s) => s.id === 'acme-nowhere').lat, null);
  assert.equal(sites.find((s) => s.id === 'acme-t2').validity.fromMs, Date.parse('2005-04-01T00:00:00Z'));
  assert.equal(geo.worldObject({ type: 'facility', id: 'q', validity: { fromMs: 10, toMs: 5 } }).validity.toMs, null, 'an end before the start is not an interval');
});

test('④ typed ties are read from either end, across several hops, and only by the names asked', () => {
  const W = fresh();
  const { company, sites } = W.fromCompanyProfile({ id: 'acme', n: 'Acme' }, profile());
  const port = geo.worldObject({ type: 'facility', id: 'port-yk', name: 'Port of Yokohama', lng: 139.7, lat: 35.5, provenance: 'feed_coordinate', links: [] });
  const term = (s) => Object.assign({}, s, { links: s.links.concat([{ rel: 'part_of', ref: port.ref }]) });
  W.register([company, port, ...sites.map((s) => (s.id.startsWith('osm') || s.id === 'acme-t2' ? term(s) : s))]);
  const ops = W.related(company, { rels: ['operates'] });
  assert.equal(ops.total, 4, 'the company reads its sites as `operates` though only the sites state the tie');
  assert.ok(ops.items.every((x) => x.why[0] === 'linked' && x.rels[0] === 'operates' && x.depth === 1));
  const two = W.related(port, { rels: ['contains', 'operated_by'], depth: 2 });
  assert.deepEqual(two.items.map((x) => x.object.ref).sort(), [company.ref, 'facility:acme-t2', 'facility:osm-way-55'].sort());
  const viaCo = two.items.find((x) => x.object.ref === company.ref);
  assert.deepEqual(viaCo.rels, ['contains', 'operated_by'], 'the path says how the company was reached'); assert.equal(viaCo.depth, 2);
  assert.equal(W.related(port, { rels: ['operated_by'], depth: 3 }).total, 0, 'a name that does not leave this object finds nothing');
  assert.equal(W.related(port, { depth: 3 }).total, 5, 'depth alone follows any tie: both terminals, the company, and the other sites of that company');
  assert.deepEqual(W.traverse(port, { rels: ['contains'] }).nodes.map((n) => n.depth), [1, 1]);
});

test('④ asked «as of» a date: ties and objects outside their stated period drop out', () => {
  const W = fresh();
  const { company, sites } = W.fromCompanyProfile({ id: 'acme', n: 'Acme' }, profile());
  W.register([company].concat(sites));
  const refsAt = (y) => W.related(company, { rels: ['operates'], atMs: Y(y) }).items.map((x) => x.object.id).sort();
  assert.deepEqual(refsAt(1990), ['acme-hq', 'acme-nowhere'], '1990: Terminal 1 and 2 did not exist yet');
  assert.deepEqual(refsAt(2000), ['acme-hq', 'acme-nowhere', 'osm-way-55']);
  assert.deepEqual(refsAt(2020), ['acme-hq', 'acme-nowhere', 'acme-t2'], '2020: Terminal 1 had closed');
  assert.equal(W.related(company, { rels: ['operates'] }).total, 4, 'no date → every tie');
  /* the proximity rule honours it too: a closed site is not «near» anything after it closed */
  const t1 = sites.find((s) => s.id === 'osm-way-55'), t2 = sites.find((s) => s.id === 'acme-t2');
  assert.ok(W.relation(t1, t2, { atMs: Y(2007) }), 'in 2007 both were open and 1.5 km apart');
  assert.equal(W.relation(t1, t2, { atMs: Y(2020) }), null, 'Terminal 1 was closed in 2020');
  assert.equal(W.relation(t1, t2, { atMs: Y(1990) }), null, 'and neither had opened in 1990');
  assert.ok(W.relation(t1, t2) && W.relation(t1, t2).why.includes('near'), 'with no date the two are neighbours');
});

test('④ assertLink is idempotent for one period, and a second period is a second tie', () => {
  const W = fresh();
  const a = geo.worldObject({ type: 'facility', id: 'term', name: 'Terminal', lng: 1, lat: 1, provenance: 'feed_coordinate' });
  const c1 = geo.worldObject({ type: 'company', id: 'c1', name: 'One' }), c2 = geo.worldObject({ type: 'company', id: 'c2', name: 'Two' });
  W.register([a, c1, c2]);
  W.assertLink(a.ref, 'operated_by', c1.ref, { fromMs: Y(1950), toMs: Y(1969), confidence: 'medium', evidenceIds: ['ev1'] });
  W.assertLink(a.ref, 'operated_by', c1.ref, { fromMs: Y(1950), toMs: Y(1969) });
  W.assertLink(a.ref, 'operated_by', c1.ref, { fromMs: Y(1990) });
  W.assertLink(a.ref, 'operated_by', c2.ref, { fromMs: Y(1970), toMs: Y(1989), source: 'port authority register' });
  assert.equal(W.find(a.ref).links.length, 3);
  const who = (y) => W.related(a, { rels: ['operated_by'], atMs: Y(y) }).items.map((x) => x.object.id);
  assert.deepEqual([who(1960), who(1980), who(2000)], [['c1'], ['c2'], ['c1']], 'who ran it when');
  assert.equal(W.find(a.ref).links[0].confidence, 'medium'); assert.deepEqual(W.find(a.ref).links[0].evidenceIds, ['ev1']);
  assert.equal(W.assertLink('facility:nobody', 'operated_by', c1.ref), null, 'an object that is not held states nothing');
});

test('⑤ two sources\' values for one key coexist; a real disagreement is reported, differing units are not one', () => {
  const W = fresh();
  const o = geo.worldObject({ type: 'facility', id: 'p', name: 'Port', lng: 1, lat: 1, provenance: 'feed_coordinate' });
  W.register([o]);
  W.assertClaim(o.ref, { key: 'cargoTeu', value: 2900000, unit: 'TEU', fromMs: Y(2019), toMs: Y(2019), source: 'Authority A' });
  W.assertClaim(o.ref, { key: 'cargoTeu', value: 3100000, unit: 'TEU', fromMs: Y(2019), toMs: Y(2019), source: 'Authority B' });
  W.assertClaim(o.ref, { key: 'cargoTeu', value: 3000000, unit: 'TEU', fromMs: Y(2020), toMs: Y(2020), source: 'Authority A' });
  W.assertClaim(o.ref, { key: 'cargoMass', value: 41, unit: 'Mt', source: 'Authority A' });
  W.assertClaim(o.ref, { key: 'cargoMass', value: 41000, unit: 'kt', source: 'Authority B' });
  W.assertClaim(o.ref, { key: 'bad', value: { x: 1 } });
  const held = W.find(o.ref);
  assert.equal(held.claims.length, 5, 'nothing overwrote anything; a malformed claim was dropped');
  const cc = W.claimConflicts(held);
  assert.deepEqual(cc.map((c) => c.key).sort(), ['cargoMass', 'cargoTeu']);
  assert.equal(cc.find((c) => c.key === 'cargoTeu').values.length, 3, 'the 2020 value is listed with the keys that conflict, the report names the key');
  assert.equal(cc.find((c) => c.key === 'cargoMass').unitMismatch, true, '41 Mt and 41 000 kt are the same fact in two units — not comparable yet, not «different»');
  /* merging a re-surfaced record keeps the claims */
  W.register([Object.assign({}, o, { claims: [geo.cleanClaim({ key: 'cargoTeu', value: 2900000, unit: 'TEU', fromMs: Y(2019), toMs: Y(2019), source: 'Authority A' })] })]);
  assert.equal(W.find(o.ref).claims.length, 5, 'the same claim is not duplicated');
  assert.equal(W.brief(W.find(o.ref)).claims.length, 5);
});

test('⑥ research.related follows rels / depth / at, and research.object states identity (run, through the capabilities)', async () => {
  const mod = await import('../js/atlas-world-objects.js');
  const W = mod.worldObjects; W.clear();
  const { company, sites } = W.fromCompanyProfile({ id: 'acme', n: 'Acme', wd: 'Q300' }, profile());
  W.register([company].concat(sites));
  const find = (id) => caps.find((c) => c.row[0] === id);
  const related = find('research.related'), object = find('research.object');
  const R = (ok, html, extra) => Object.assign({ ok, html }, extra);
  const K = { R, warn: (m) => m, L: (en) => en, esc: (x) => String(x), HOST: { globalData: [] }, lx: (x) => x };
  const rel = await related.run({ ref: company.ref, rels: ['operates'], at: '2000-06-01', types: ['facility'] }, {}, K);
  assert.equal(rel.ok, true);
  const ids = rel.exec.worldObjects.related.map((x) => x.ref).sort();
  assert.deepEqual(ids, ['facility:acme-hq', 'facility:acme-nowhere', 'facility:osm-way-55']);
  assert.deepEqual(rel.exec.worldObjects.related[0].rels, ['operates']);
  assert.match(rel.html, /following operates/); assert.match(rel.html, /as of 2000-06-01/);
  const bad = await related.run({ ref: company.ref, at: 'not a date' }, {}, K);
  assert.equal(bad.ok, false); assert.equal(bad.meta.code, 'INVALID_INPUT');
  const obj = await object.run({ name: 'wikidata:Q300' }, {}, K);
  assert.equal(obj.ok, true); assert.equal(obj.exec.worldObjects.identity.ids.wikidata, 'Q300');
  assert.match(obj.html, /wikidata:Q300/);
  W.clear();
});

test('⑦ a GIS feature the dataset NAMES carries an identifier; a row number does not pretend to', () => {
  const W = fresh();
  const named = W.fromDatasetRow({ id: 'ds1:0', name: 'Pier', lng: 1, lat: 2, _fid: 'P-77', _bbox: [1, 2, 1, 2], _derivedPoint: false }, { id: 'ds1', title: 'Ports' });
  const anon = W.fromDatasetRow({ id: 'ds1:3', name: 'Pier', lng: 1, lat: 2, _fid: null, _bbox: [0, 1, 2, 3], _derivedPoint: true }, { id: 'ds1', title: 'Ports' });
  assert.equal(named.ref, 'dataset_feature:ds1:P-77'); assert.equal(named.ids.dataset, 'ds1:P-77'); assert.equal(named.facts.idStable, true);
  assert.equal(anon.ref, 'dataset_feature:ds1:3'); assert.equal(anon.ids.dataset, undefined); assert.equal(anon.facts.idStable, false);
  assert.equal(anon.provenance, 'resolved_place_centroid', 'the centre of a box is not the feature\'s position');
  assert.deepEqual(anon.bounds, [0, 1, 2, 3]);
  /* the same feature after the file is re-sorted keeps its ref */
  const moved = W.fromDatasetRow({ id: 'ds1:9', name: 'Pier', lng: 1, lat: 2, _fid: 'P-77' }, { id: 'ds1' });
  assert.equal(moved.ref, named.ref);
});
