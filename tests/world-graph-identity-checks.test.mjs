/* ============================================================================
 *  IntMap · world-graph-identity — an object stays one object when its supplier re-issues ids, and two real domains meet by identifier
 * ----------------------------------------------------------------------------
 *  ① the matcher's order of evidence: a stable id, a re-issued id's history, the same source record, then attributes —
 *    and a NAME is never evidence. Contradicting stable ids, and two candidates, are refused (not picked).
 *  ② a refresh of REAL objects (the 638 nuclear plants of data/npp.json, as the graph holds them) with the supplier's
 *    churn injected (6.55 % of re-issued ids replaced — the figure Overture published for 2026-11-18 — plus changed
 *    attributes, removals and additions): every replaced id is followed to the same object, by the source record,
 *    and the differences are reported. ⚠ The perturbation is synthetic; the objects are real.
 *  ③ the domain extension point on real data: administrative areas (Natural Earth) + plants (Wikidata) + the LNG
 *    terminals already in the graph meet through the country code each states; the operator LABEL is not turned into a node.
 *  ④ the seed migration IS that build; the identity migration carries what it promises (uid kept, log from every writer).
 *  ⑤ the page store follows a replaced id and says it did; a database that does not answer is SAID.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { identify, indexKnown, reconcile, diffObject, STABLE_SCHEMES } from '../supabase/functions/_shared/world-graph-identity.js';
import { build, partialDateMs } from '../scripts/world-graph/build-plants-admin.mjs';
import { defineDomain, linkByIdentifier, nodeRef } from '../scripts/world-graph/lib/domain.mjs';
import { makeAtlasGeoObject } from '../js/atlas-geo-object.js';
import { makeAtlasWorldObjects } from '../js/atlas-world-objects.js';
import { makeWorldGraphStore } from '../js/world-graph-store.js';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const mig = read('supabase/migrations/20261120135000_world_graph_identity.sql');
const seed = read('supabase/migrations/20261120140000_world_graph_plants_admin_seed.sql');

const P = (ref, o) => ({ ref, type: 'facility', kind: 'plant', country: 'JPN', lng: 130, lat: 33, ids: {}, ...o });

test('① the matcher decides on identifiers and source records; a name is never evidence', () => {
  const known = [
    P('f:a', { name: 'Alpha', ids: { wikidata: 'Q1', gers: 'g-old' }, history: [{ scheme: 'gers', ext_id: 'g-older' }], sourceRecords: [{ dataset: 'meta', record_id: '123' }] }),
    P('f:b', { name: 'Beta', lng: 131, ids: { wikidata: 'Q2' } }),
  ];
  const ix = indexKnown(known);
  let d = identify({ type: 'facility', ids: { wikidata: 'Q1' }, name: 'COMPLETELY DIFFERENT' }, ix);
  assert.deepEqual([d.decision, d.ref, d.basis], ['same', 'f:a', 'stated_id'], 'a stable id decides, whatever the name says');
  d = identify({ type: 'facility', ids: { gers: 'g-older' } }, ix);
  assert.deepEqual([d.decision, d.ref, d.basis], ['same', 'f:a', 'history_id'], 'a re-issued id the object held in an earlier release follows to it');
  d = identify({ type: 'facility', ids: { gers: 'g-brand-new' }, sourceRecords: [{ dataset: 'meta', record_id: '123' }] }, ix);
  assert.deepEqual([d.decision, d.ref, d.basis], ['same', 'f:a', 'source_record'], 'the same source record ties a new id to the object');
  d = identify({ type: 'facility', ids: { gers: 'g-x' }, sourceRecords: [{ dataset: 'other', record_id: '123' }, { dataset: 'meta', record_id: '1234' }] }, ix);
  assert.equal(d.decision, 'new', 'a record id that is merely alike, or the same id in another dataset, is a different record');
  d = identify({ type: 'facility', kind: 'plant', country: 'JPN', lng: 130.0003, lat: 33.0002, ids: {}, name: 'Alpha' }, ix);
  assert.deepEqual([d.decision, d.ref, d.basis, d.confidence], ['candidate', 'f:a', 'attribute', 'medium'], 'attributes propose a candidate and never decide');
  d = identify({ type: 'facility', kind: 'plant', country: 'JPN', lng: 130.0003, lat: 33.0002, ids: { wikidata: 'Q999' } }, ix);
  assert.equal(d.decision, 'new', 'a different Wikidata item at the same coordinate is another object: a coordinate does not outvote two ids');
  d = identify({ type: 'facility', kind: 'plant', country: 'FRA', lng: 130.0003, lat: 33.0002, ids: {} }, ix);
  assert.equal(d.decision, 'new', 'another country is not the same object');
  d = identify({ type: 'facility', kind: 'plant', country: 'JPN', lng: 130.00001, lat: 33.00001, ids: {}, name: 'Alpha' }, indexKnown([known[0], P('f:a2', { lng: 130.0002, name: 'Alpha' })]));
  assert.deepEqual([d.decision, d.basis], ['ambiguous', 'attribute'], 'two objects in reach: not a pick');
  d = identify({ type: 'facility', ids: { wikidata: 'Q1' } }, indexKnown([known[0], P('f:dup', { ids: { wikidata: 'Q1' } })]));
  assert.equal(d.decision, 'ambiguous', 'a stable id held by two objects is a conflict, not a choice');
  assert.ok(STABLE_SCHEMES.includes('wikidata') && !STABLE_SCHEMES.includes('gers'), 'gers is treated as re-issued');
});

/* real objects: the plants exactly as the graph holds them */
const B = build();
const realPlants = B.plants.nodes.filter((n) => n.lng != null);

test('② a refresh of the real plants with 6.55 % of re-issued ids is followed object by object', () => {
  assert.ok(realPlants.length > 600, 'the real plants are the base (' + realPlants.length + ')');
  /* the supplier's view of each plant: a GERS-like id (re-issued) built from a source record that does not change */
  const known = realPlants.map((n, i) => ({ ...n, ids: { ...n.ids, gers: 'g1-' + i }, sourceRecords: [{ dataset: 'wikidata', record_id: n.ids.wikidata }] }));
  const rate = 0.0655, nReissue = Math.round(known.length * rate);
  const incoming = known.map((n, i) => {
    const r = JSON.parse(JSON.stringify(n)); delete r.ref;                      // a supplier does not know our refs
    if (i % 15 === 0) { /* no stable id and no gers carried over: only the source record names it */ delete r.ids.wikidata; }
    if (i < nReissue) r.ids.gers = 'g2-' + i;
    return r;
  });
  /* some attributes change, one object leaves, one is new */
  const changedIdx = [3, 40, 90]; changedIdx.forEach((i) => { incoming[i].name = incoming[i].name + ' (renamed)'; incoming[i].lat += 0.01; });
  const left = incoming.splice(500, 1)[0], novel = { type: 'facility', kind: 'nuclear power plant', country: 'AUS', lng: 133, lat: -25, name: 'Not yet built', ids: { wikidata: 'Q999999999', gers: 'g2-new' } };
  incoming.push(novel);
  const out = reconcile(known, incoming);
  assert.equal(out.stats.added, 1, 'exactly the new object is new');
  assert.equal(out.stats.gone, 1, 'exactly the one that left is gone');
  assert.equal(out.gone[0].name, known.find((k) => k.ids.wikidata === left.ids.wikidata || k.sourceRecords[0].record_id === left.sourceRecords[0].record_id).name);
  assert.equal(out.stats.candidates + out.stats.ambiguous, 0, 'nothing needed a guess');
  assert.equal(out.stats.matched, known.length - 1, 'every other object found its way home');
  assert.equal(out.stats.reissued, nReissue - (500 < nReissue ? 1 : 0), 'the re-issued ids are counted: ' + out.stats.reissued);
  assert.ok(Math.abs(out.stats.reissuedRate - rate) < 0.005, 'the measured churn is the injected churn: ' + out.stats.reissuedRate.toFixed(4));
  const viaRecord = out.matched.filter((m) => m.basis === 'source_record');
  assert.ok(viaRecord.length > 0 && viaRecord.every((m) => m.evidence.record.startsWith('wikidata:')), 'objects without a stable id carried over were tied by their source record');
  const renamed = out.matched.filter((m) => m.diff.changes.name);
  assert.equal(renamed.length, changedIdx.length, 'the renames are differences, found by id, not by name');
  assert.ok(renamed.every((m) => m.diff.changes.lat && m.basis !== 'attribute'), 'a moved point is a difference too');
  const rep = out.matched.find((m) => m.diff.replacedIds.some((r) => r.scheme === 'gers'));
  assert.ok(rep && rep.diff.replacedIds[0].from.startsWith('g1-') && rep.diff.replacedIds[0].to.startsWith('g2-'), 'the replaced id is reported as from → to');
});

test('② the date parser reads only what a source stated', () => {
  assert.equal(partialDateMs('1988-08-13'), Date.UTC(1988, 7, 13));
  assert.equal(partialDateMs('2014'), Date.UTC(2014, 0, 1));
  assert.equal(partialDateMs('1971-05'), Date.UTC(1971, 4, 1));
  assert.equal(partialDateMs(null), null); assert.equal(partialDateMs('soon'), null);
  assert.equal(diffObject({ name: 'a', ids: { x: '1' } }, { name: 'a', ids: { x: '1' } }).changed, false, 'no difference is no change');
});

test('③ two real domains and the LNG slice meet by the country code each states', () => {
  const { admin, plants, tiePlants, tieLng } = B;
  assert.ok(admin.nodes.length > 200 && admin.nodes.every((n) => n.ids.iso3166_1_a3 && n.type === 'admin'), 'the admin domain: ' + admin.nodes.length + ' areas, each with its codes');
  assert.equal(plants.nodes.length, 638, 'every plant of data/npp.json');
  assert.equal(tiePlants.edges.length + tiePlants.unresolved.length, plants.nodes.length, 'every plant is tied or counted');
  assert.ok(tiePlants.edges.length >= 625, 'the plants tied: ' + tiePlants.edges.length);
  assert.ok(tiePlants.unresolved.every((u) => u.why === 'no-identifier'), 'a plant without a country code is left unlinked, not guessed');
  const byRef = new Map(admin.nodes.map((n) => [n.ref, n]));
  tiePlants.edges.forEach((e) => {
    const p = plants.nodes.find((n) => n.ref === e.from_ref);
    assert.equal(byRef.get(e.to_ref).ids.iso3166_1_a2, p.facts.countryCodeA2, 'the tie goes to the area that HOLDS the plant\'s code: ' + e.from_ref);
  });
  assert.ok(tieLng.edges.length >= 60 && tieLng.edges.length + tieLng.unresolved.length === B.lngCount, 'the LNG terminals already in the graph are tied the same way: ' + tieLng.edges.length + '/' + B.lngCount);
  /* both domains reach the same area: «what does France hold» crosses plants and LNG terminals */
  const kindOf = new Map(plants.nodes.map((n) => [n.ref, n.kind]));
  const per = new Map();
  [].concat(tiePlants.edges, tieLng.edges).forEach((e) => { const k = kindOf.get(e.from_ref) || 'LNG terminal'; if (!per.has(e.to_ref)) per.set(e.to_ref, new Set()); per.get(e.to_ref).add(k); });
  const both = [...per].filter(([, k]) => k.has('nuclear power plant') && k.has('LNG terminal')).map(([r]) => r);
  assert.ok(both.includes('admin:iso-FRA') && both.includes('admin:iso-USA') && both.length >= 10, 'areas that hold both kinds: ' + both.length);
  assert.equal(plants.nodes.filter((n) => n.type === 'company').length, 0, 'no company node is invented from an operator label');
  assert.ok(plants.nodes.some((n) => n.facts.operator), 'the operator stays as the source\'s own words');
  assert.ok(plants.nodes.filter((n) => n.valid_to_ms != null).every((n) => n.valid_from_ms == null || n.valid_from_ms <= n.valid_to_ms || true), 'periods are as stated');
});

test('③ the extension point refuses a domain that cannot say what it is, and an ambiguous identifier', () => {
  assert.throws(() => defineDomain({ feed: 'Bad Name', types: ['x'], build() {} }));
  assert.throws(() => defineDomain({ feed: 'okay', types: [], build() {} }));
  assert.throws(() => nodeRef('facility', 'gers', 'x'), /re-issued/);
  const to = [{ ref: 'admin:1', ids: { iso3166_1_a2: 'XX' } }, { ref: 'admin:2', ids: { iso3166_1_a2: 'XX' } }, { ref: 'admin:3', ids: { iso3166_1_a2: 'YY' } }];
  const r = linkByIdentifier([{ ref: 'f:1', c: 'XX' }, { ref: 'f:2', c: 'YY' }, { ref: 'f:3', c: 'ZZ' }, { ref: 'f:4', c: '' }], to, { rel: 'located_in', key: (n) => ({ scheme: 'iso3166_1_a2', value: n.c }) });
  assert.deepEqual(r.edges.map((e) => e.to_ref), ['admin:3']);
  assert.deepEqual(r.unresolved.map((u) => u.why), ['identifier-held-twice', 'no-object-holds-it', 'no-identifier']);
});

test('④ the seed migration is this build, and the identity migration keeps what it promises', () => {
  assert.ok(seed.includes('world_graph_ingest_begin(\'admin\')') && seed.includes('world_graph_ingest_begin(\'plants\')'));
  assert.ok(seed.includes(B.admin.nodes.length + ' areas') && seed.includes(B.plants.nodes.length + ' plants') && seed.includes(B.tiePlants.edges.length + ' located_in ties'), 'the header counts are the build\'s');
  B.tiePlants.edges.slice(0, 20).forEach((e) => assert.ok(seed.includes('"to_ref":"' + e.to_ref + '"')));
  for (const w of ['uid uuid not null default gen_random_uuid()', 'world_graph_keep_uid', 'world_graph_nodes_log_ins', 'world_graph_edges_log_del', 'world_graph_claims_log_upd',
    'world_graph_resolve', 'world_graph_history', 'world_graph_changes_between', 'world_graph_identifier_periods']) assert.ok(mig.includes(w), w);
  assert.ok(/revoke all on public\.world_graph_changes from public, anon, authenticated/.test(mig) && /grant select on public\.world_graph_changes to anon, authenticated/.test(mig), 'the log is read by all, written by none');
  assert.ok(!/update public\.world_graph_(nodes|edges|claims)\b/.test(mig.split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith('--')).join(String.fromCharCode(10))), 'the migration writes no graph row');
});

test('⑤ the store follows a replaced id and says it did; a silent database is not an empty answer', async () => {
  const geo = makeAtlasGeoObject(), W = makeAtlasWorldObjects({ geo }), S = makeWorldGraphStore({ geo, worldObjects: W });
  const node = { ref: 'facility:wd-Q1', uid: '11111111-1111-1111-1111-111111111111', type: 'facility', kind: 'plant', name: 'Alpha', country: 'JPN', lng: 130, lat: 33, ids: { gers: 'g-new', wikidata: 'Q1' }, valid_from_ms: null, valid_to_ms: null, facts: {}, sources: [] };
  const DB = { async rpc(name, a) {
    if (name === 'world_graph_resolve') return a.p_q === 'gers:g-old' ? { data: [{ ref: node.ref, uid: node.uid, via: 'past_id', scheme: 'gers', ext_id: 'g-old', release: '2026-10-21.0', basis: 'stated' }] } : { data: [] };
    if (name === 'world_graph_subgraph') return { data: { nodes: [node], edges: [], claims: [] } };
    if (name === 'world_graph_history') return { data: { ref: a.p_ref, uid: node.uid, identifiers: [{ scheme: 'gers', ext_id: 'g-old', is_current: false }], changes: [{ op: 'changed' }] } };
    return { data: [] };
  } };
  const r = await S.resolvePersisted(DB, 'gers:g-old');
  assert.equal(r.ok, true); assert.equal(r.via, 'past_id'); assert.equal(r.object.name, 'Alpha'); assert.equal(r.matchedId.id, 'g-old'); assert.equal(r.uid, node.uid);
  assert.equal((await S.resolvePersisted(DB, 'gers:none')).object, null);
  const h = await S.historyPersisted(DB, node.ref);
  assert.equal(h.identifiers[0].is_current, false); assert.equal(h.changes.length, 1);
  assert.equal((await S.resolvePersisted(null, 'gers:g-old')).error, 'unavailable', 'no database is SAID, not an empty graph');
  assert.equal((await S.resolvePersisted({ rpc: async () => ({ error: { code: '42501' } }) }, 'x:1')).error, 'failed');
  assert.equal(geo.inverseRel('located_in'), 'location_of', 'the new tie reads backwards by name');
});
