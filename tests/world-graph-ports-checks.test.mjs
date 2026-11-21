/* ============================================================================
 *  IntMap · world-graph-ports — ports joined from three upstreams by identifier, walked and asked like the LNG slice
 * ----------------------------------------------------------------------------
 *  The data are REAL: tests/fixtures/world-graph-ports/upstream-sample.json is a slice of what Wikidata (SPARQL rows),
 *  Eurostat mar_go_aa (JSON-stat) and UN/LOCODE (csv lines) answered on 2026-11-20, cut down to a few ports
 *  (Rotterdam, Hamburg, ports with a stated rail/road tie, an owner, a throughput, a terminal that is part of a port).
 *  The database is replaced by a few lines of JS that answer the RPCs from the built rows — a stand-in for the
 *  transport only: the SQL (apply / finish / retire / refuse / freshness) is asserted by supabase/tests/52_world_graph_ingest_test.sql.
 *
 *    ① parsing: Eurostat's port codes → UN/LOCODE + a yearly series; UN/LOCODE's function flags and point; codes that are no LOCODE stay out
 *    ② the join: one node per port keyed by Wikidata id, carrying the LOCODE, the OSM relation where Wikidata has it, the labels (en/ja), the
 *       location's function flags — and 29 yearly cargo figures from Eurostat with unit and source; nothing is inferred
 *    ③ identity: an Eurostat port Wikidata does not know by LOCODE becomes its own node from UN/LOCODE; two items with one LOCODE are NOT merged
 *    ④ ties: operator/owner keep their stated period (a missing date stays missing); rail/road ties only to a railway line or road; part_of
 *    ⑤ Atlas: research.object finds the port by its Japanese name and by `unlocode:`, lists the series compactly with the span, states when the
 *       feed was last confirmed, and says so when the latest refresh failed
 * ==========================================================================*/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { makeAtlasGeoObject } from '../js/atlas-geo-object.js';
import { makeAtlasWorldObjects } from '../js/atlas-world-objects.js';
import { makeWorldGraphStore } from '../js/world-graph-store.js';
import caps from '../js/atlas-cap-research.js';
import { parseEurostat, parseLocode, csvFields, build, QUERIES, FEED } from '../supabase/functions/_shared/world-graph-ports.js';

const S = JSON.parse(fs.readFileSync(new URL('./fixtures/world-graph-ports/upstream-sample.json', import.meta.url), 'utf8'));
const eu = parseEurostat(S.eurostat);
const lo = parseLocode(S.locode, new Set(['NLRTM', 'DEHAM', 'BEANR', 'NLAMS', 'FRLEH']));
/* the LNG slice's terminal Q122459902 is part_of Rotterdam (Wikidata P361): the caller declares the refs the LNG slice holds */
const LNG = new Set(['facility:wd-Q122459902']);
const g = build({ wd: S.wd, eurostat: eu, locode: lo, atlasByWd: new Map(), lngRefs: LNG, retrieved: '2026-11-20' });
const RTM = 'facility:wd-Q1027807';

test('① parsing: Eurostat port codes carry a UN/LOCODE; the location record states its functions and point; non-LOCODE codes are not guessed at', () => {
  const rtm = eu.filter((r) => r.locode === 'NLRTM');
  assert.ok(rtm.length >= 25 && rtm.every((r) => r.kt > 0), 'a yearly series, thousand tonnes');
  assert.ok(rtm.some((r) => r.year === 1997) && rtm.some((r) => r.year >= 2024));
  assert.equal(S.eurostat.dimension.rep_mar.category.label['NL_0NLRTM'], 'Rotterdam');
  const raw = S.eurostat.value, idx = S.eurostat.dimension.rep_mar.category.index['NL_0NLRTM'], T = Object.keys(S.eurostat.dimension.time.category.index).length;
  assert.equal(rtm.find((r) => r.year === 2024).kt, raw[idx * T + Object.keys(S.eurostat.dimension.time.category.index).indexOf('2024')], 'the value is the cell Eurostat published');
  const r = lo.get('NLRTM');
  assert.ok(r.functions.includes('port') && r.functions.includes('rail') && r.functions.includes('road'), 'UNECE states a rail and a road terminal at the location');
  assert.ok(Math.abs(r.lat - 51.9) < 0.3 && Math.abs(r.lng - 4.5) < 0.5);
  assert.deepEqual(csvFields('a,"b, c",d'), ['a', 'b, c', 'd']);
  assert.throws(() => parseLocode('x,y\n1,2', null), /header changed/);
  assert.throws(() => parseEurostat({ id: ['a'], size: [1] }), /dimensions changed/);
});

test('② the join: one node per port with its identifiers, labels, location functions and a 29-year cargo series with unit and source', () => {
  const n = g.nodes.find((x) => x.ref === RTM);
  assert.equal(n.kind, 'port'); assert.equal(n.ids.wikidata, 'Q1027807'); assert.equal(n.ids.unlocode, 'NLRTM');
  assert.ok(n.facts.names.includes('Port of Rotterdam') && n.facts.names.includes('ロッテルダム港'));
  assert.match(n.facts.unlocodeFunctions, /port.*rail/);
  assert.ok(n.sources.some((s) => s.name === 'Wikidata') && n.sources.some((s) => s.name === 'UN/LOCODE'));
  const cs = g.claims.filter((c) => c.ref === RTM && c.key === 'cargo_handled');
  assert.ok(cs.length >= 25);
  cs.forEach((c) => { assert.equal(c.unit, 'thousand tonnes'); assert.equal(c.source, 'Eurostat mar_go_aa'); assert.equal(new Date(c.from_ms).getUTCMonth(), 0); assert.equal(new Date(c.to_ms).getUTCFullYear(), new Date(c.from_ms).getUTCFullYear()); });
  assert.equal(new Set(cs.map((c) => c.from_ms)).size, cs.length, 'one figure per year');
  /* the OSM relation id comes only where Wikidata states P402 */
  g.nodes.filter((x) => x.ids.osm).forEach((x) => assert.match(x.ids.osm, /^relation\/\d+$/));
  /* nothing is placed from a guess: a node's point is Wikidata's P625 or UN/LOCODE's, and says so */
  g.nodes.filter((x) => x.lat != null).forEach((x) => assert.equal(x.provenance, 'feed_coordinate'));
  assert.deepEqual(build({ wd: S.wd, eurostat: eu, locode: lo, atlasByWd: new Map(), lngRefs: LNG, retrieved: '2026-11-20' }), g, 'the build is deterministic');
});

test('③ identity: an Eurostat port Wikidata does not hold by LOCODE is its own node from UN/LOCODE; a code that is no LOCODE is left out', () => {
  const ams = g.nodes.find((x) => x.ids.unlocode === 'NLAMS');
  assert.ok(ams, 'Amsterdam');
  assert.equal(ams.ref, 'facility:locode-NLAMS'); assert.ok(g.claims.some((c) => c.ref === ams.ref && c.key === 'cargo_handled'));
  assert.equal(ams.country, null, 'no Wikidata port in this slice states an alpha-3 for the prefix NL (Rotterdam item carries no P17), so none is invented');
  /* …and when one does, the Eurostat-only port takes it — never a country table written here */
  const withCc = JSON.parse(JSON.stringify(S.wd)); withCc.nodes.find((b) => b.pLabel.value === 'Port of Rotterdam').cc = { type: 'literal', value: 'NLD' };
  const g2 = build({ wd: withCc, eurostat: eu, locode: lo, atlasByWd: new Map(), lngRefs: new Set(), retrieved: '2026-11-20' });
  assert.equal(g2.nodes.find((x) => x.ids.unlocode === 'NLAMS').country, 'NLD');
  assert.ok(!g.nodes.some((x) => x.ids.unlocode === 'BE003' || x.ids.unlocode === 'BE888'), 'Antwerp-Bruges «BE003» and «other ports» are not UN/LOCODEs');
  assert.ok(!g.claims.some((c) => /^facility:locode-BE(003|888)$/.test(c.ref)));
  /* a LOCODE carried by two Wikidata items is not merged: the figures go to ONE of them */
  const dup = build({ wd: { ...S.wd, nodes: S.wd.nodes.concat([JSON.parse(JSON.stringify(S.wd.nodes[0]))].map((b) => { b.p.value = 'http://www.wikidata.org/entity/Q99999999'; b.pLabel.value = 'Another Rotterdam item'; return b; })) }, eurostat: eu, locode: lo, atlasByWd: new Map(), lngRefs: new Set(), retrieved: '2026-11-20' });
  const holders = new Set(dup.claims.filter((c) => c.key === 'cargo_handled' && /NLRTM|Q1027807|Q99999999/.test(c.ref)).map((c) => c.ref));
  assert.equal(holders.size, 1, 'one holder of the series');
  assert.ok(dup.nodes.some((x) => x.ref === 'facility:wd-Q99999999'), 'the other item stays a node of its own');
});

test('④ ties: operator/owner keep their stated period; rail/road ties only to a railway line or a road; part_of; every end is a node', () => {
  const ops = g.edges.filter((e) => e.rel === 'operated_by'), owns = g.edges.filter((e) => e.rel === 'owned_by');
  assert.ok(ops.length >= 1 && owns.length >= 1);
  assert.ok(ops.some((e) => e.from_ms == null && e.to_ms == null), 'a date nobody stated stays missing');
  const own = S.wd.owns[0], wdFrom = own.from && own.from.value; if (wdFrom) assert.ok(owns.some((e) => e.from_ms === Date.parse(wdFrom.slice(0, 10) + 'T00:00:00Z')));
  const links = g.edges.filter((e) => e.rel === 'connected_to'); assert.ok(links.length >= 1);
  links.forEach((e) => { const t = g.nodes.find((x) => x.ref === e.to_ref); assert.ok(t && /^(railway line|road)$/.test(t.kind), 'a tie targets a railway line or a road, never a waterway or a ferry route'); assert.match(e.source, /\(P(81|2789)\)$/); });
  const parts = g.edges.filter((e) => e.rel === 'part_of'); assert.ok(parts.length >= 1, 'a terminal in a port');
  /* the gate that follows: an edge whose end is not in the build is not emitted (a part may be an LNG-slice node, declared by the caller) */
  const nodeRefs = new Set(g.nodes.map((x) => x.ref));
  g.edges.forEach((e) => { assert.ok(nodeRefs.has(e.from_ref) || LNG.has(e.from_ref), e.from_ref); assert.ok(nodeRefs.has(e.to_ref), e.to_ref); });
  assert.equal(FEED, 'ports'); assert.match(QUERIES.links, /Q728937/);
});

/* the RPCs answered from the built rows */
function fakeDB(opts) {
  opts = opts || {};
  const byRef = new Map(g.nodes.map((n) => [n.ref, n]));
  return {
    async rpc(name, a) {
      if (name === 'world_graph_find') {
        const q = a.p_q, m = /^([A-Za-z][A-Za-z0-9_]*):(.+)$/.exec(q);
        return { data: g.nodes.filter((n) => n.ref === q || (m && n.ids[m[1].toLowerCase()] === m[2]) || n.name.toLowerCase() === q.toLowerCase() || (n.facts.names || []).some((x) => x.toLowerCase() === q.toLowerCase())), error: null };
      }
      if (name === 'world_graph_subgraph') {
        const ok = g.edges.filter((e) => !a.p_rels || a.p_rels.includes(e.rel)), refs = new Set(byRef.has(a.p_ref) ? [a.p_ref] : []);
        for (let i = 0; i < a.p_depth; i++) ok.forEach((e) => { if (refs.has(e.from_ref)) refs.add(e.to_ref); if (refs.has(e.to_ref)) refs.add(e.from_ref); });
        return { data: { nodes: [...refs].filter((r) => byRef.has(r)).map((r) => byRef.get(r)), edges: ok.filter((e) => refs.has(e.from_ref) && refs.has(e.to_ref)), claims: g.claims.filter((c) => refs.has(c.ref)) }, error: null };
      }
      if (name === 'world_graph_freshness') return opts.fresh === 'down' ? { data: null, error: { code: '57014' } } : { data: opts.feeds || [], error: null };
      return { data: null, error: { code: '42883' } };
    },
  };
}

test('⑤ Atlas: a port is found by its Japanese name and by its UN/LOCODE; the series is listed compactly with the span; the feed\'s freshness is stated, and a failed refresh is said', async () => {
  const mod = await import('../js/atlas-world-objects.js'); const W = mod.worldObjects; W.clear();
  const find = (id) => caps.find((c) => c.row[0] === id);
  const R = (ok, html, extra) => Object.assign({ ok, html }, extra);
  const mk = (DB) => ({ R, warn: (m) => m, L: (en) => en, esc: (x) => String(x), HOST: { globalData: [], DB }, lx: (x) => x });
  const feeds = [{ feed: 'ports', finishedAt: '2026-11-20T03:41:00+00:00', upstream: { eurostat: { dataset: 'mar_go_aa', updated: '2026-11-11T23:00:00+0100', rows: 31548 } }, counts: {}, latestStatus: 'ok', latestNote: '' }];
  const ja = await find('research.object').run({ name: 'ロッテルダム港' }, {}, mk(fakeDB({ feeds })));
  assert.equal(ja.ok, true); assert.equal(ja.exec.worldObjects.via, 'graph'); assert.equal(ja.exec.worldObjects.objects[0].ref, RTM);
  assert.match(ja.html, /UN\/LOCODE lists at this location: port, rail, road/);
  assert.match(ja.html, /cargo_handled \[thousand tonnes\]: 20\d\d [\d.]+ · /, 'newest periods first');
  assert.match(ja.html, /periods, 1997–20\d\d — Eurostat mar_go_aa/, 'and the span');
  assert.ok(ja.html.split('<br>').length < 12, 'the card is not 29 lines of one series');
  assert.equal(ja.exec.worldObjects.objects[0].claims.filter((c) => c.key === 'cargo_handled').length, g.claims.filter((c) => c.ref === RTM && c.key === 'cargo_handled').length, 'the model still receives every figure');
  assert.match(ja.html, /last confirmed 2026-11-20 · Eurostat updated 2026-11-11/);
  W.clear();
  const byCode = await find('research.object').run({ ref: 'unlocode:DEHAM' }, {}, mk(fakeDB({ feeds })));
  assert.equal(byCode.ok, true); assert.equal(byCode.exec.worldObjects.objects[0].ids.unlocode, 'DEHAM');
  W.clear();
  const failed = await find('research.object').run({ ref: 'unlocode:NLRTM' }, {}, mk(fakeDB({ feeds: [{ ...feeds[0], latestStatus: 'failed', latestNote: 'wikidata 504' }] })));
  assert.match(failed.html, /the latest refresh failed \(wikidata 504\)/);
  W.clear();
  const unread = await find('research.object').run({ ref: 'unlocode:NLRTM' }, {}, mk(fakeDB({ fresh: 'down' })));
  assert.equal(unread.ok, true); assert.match(unread.html, /freshness could not be read/, 'a feed whose date cannot be read is not shown as fresh');
  W.clear();
  const store = makeWorldGraphStore({ geo: makeAtlasGeoObject(), worldObjects: makeAtlasWorldObjects({ geo: makeAtlasGeoObject() }) });
  assert.deepEqual((await store.freshness(fakeDB({ feeds }))).feeds, feeds);
  assert.equal((await store.freshness(undefined)).ok, false);
});
