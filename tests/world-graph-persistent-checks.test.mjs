/* ============================================================================
 *  IntMap · world-graph-persistent — the graph that outlives the page, walked from a real terminal
 * ----------------------------------------------------------------------------
 *  The data are REAL: data/world-graph-lng.json is what scripts/world-graph/build-lng.mjs read from Wikidata
 *  (CC0) — LNG terminals, the operator and owner statements with the dates Wikidata gives them, the stated capacity.
 *  The database is replaced by `fakeDB`, a few lines of JS that answer the three RPCs from that snapshot. ⚠ It is
 *  a stand-in for the transport only: the SQL itself (recursive walk, «as of», both directions) is asserted by
 *  supabase/tests/51_world_graph_test.sql and was run against the real migration + seed.
 *
 *    ① the seed migration IS the snapshot (same counts), and the snapshot carries what the slice promises
 *    ② rows → world objects: ties live on the node that states them, claims keep value/unit/source, periods survive
 *    ③ the walk: terminal → owner as of two dates gives two different owners; the inverse reads back; depth 2 reaches
 *      the other terminals the same company holds
 *    ④ an atlas company reached by id (`company:shell`) is the SAME object the company atlas registers — joined by id
 *    ⑤ the capabilities: research.object finds a terminal by `wikidata:Q…` and lists its capacity; research.related answers
 *      «as of» from the persistent graph; a database that does not answer is SAID, not shown as empty
 * ==========================================================================*/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { makeAtlasGeoObject } from '../js/atlas-geo-object.js';
import { makeAtlasWorldObjects } from '../js/atlas-world-objects.js';
import { makeWorldGraphStore } from '../js/world-graph-store.js';
import caps from '../js/atlas-cap-research.js';

const snap = JSON.parse(fs.readFileSync(new URL('../data/world-graph-lng.json', import.meta.url), 'utf8'));
const seed = fs.readFileSync(new URL('../supabase/migrations/20261119150100_world_graph_lng_seed.sql', import.meta.url), 'utf8');
const geo = makeAtlasGeoObject();
const fresh = () => makeAtlasWorldObjects({ geo });

/* the three RPCs, answered from the snapshot (transport stand-in — see the header) */
function fakeDB() {
  const row = (n) => ({ ref: n.ref, type: n.type, kind: n.kind, name: n.name, country: n.country, lng: n.lng, lat: n.lat, provenance: n.provenance, ids: n.ids, valid_from_ms: n.validFromMs, valid_to_ms: n.validToMs, facts: n.facts, sources: n.sources });
  const live = (e, at) => at == null || ((e.fromMs == null || e.fromMs <= at) && (e.toMs == null || at <= e.toMs));
  const byRef = new Map(snap.nodes.map((n) => [n.ref, n]));
  const calls = [];
  return {
    calls,
    async rpc(name, a) {
      calls.push(name);
      if (name === 'world_graph_find') {
        const q = a.p_q, m = /^([A-Za-z][A-Za-z0-9_]*):(.+)$/.exec(q);
        return { data: snap.nodes.filter((n) => n.ref === q || (m && n.ids[m[1].toLowerCase()] === m[2]) || n.name.toLowerCase() === q.toLowerCase()).map(row), error: null };
      }
      if (name === 'world_graph_subgraph') {
        const ok = snap.edges.filter((e) => (!a.p_rels || a.p_rels.includes(e.rel)) && live(e, a.p_at_ms));
        const d = new Map(); if (byRef.has(a.p_ref)) d.set(a.p_ref, 0);
        for (let i = 1; i <= a.p_depth; i++) ok.forEach((e) => { [[e.from, e.to], [e.to, e.from]].forEach(([x, y]) => { if (d.get(x) === i - 1 && !d.has(y)) d.set(y, i); }); });
        const refs = new Set(d.keys());
        return { data: { nodes: [...refs].map((r) => row(byRef.get(r))), edges: ok.filter((e) => refs.has(e.from) && refs.has(e.to)).map((e) => ({ from_ref: e.from, rel: e.rel, to_ref: e.to, from_ms: e.fromMs, to_ms: e.toMs, confidence: e.confidence, source: e.source })),
          claims: snap.claims.filter((c) => refs.has(c.ref) && live(c, a.p_at_ms)).map((c) => ({ ref: c.ref, key: c.key, value: c.value, unit: c.unit, from_ms: c.fromMs, to_ms: c.toMs, source: c.source })) }, error: null };
      }
      if (name === 'world_graph_near') {
        const { haversine } = a; void haversine;
        const R = 6371, rad = (x) => x * Math.PI / 180;
        const d = (n) => 2 * R * Math.asin(Math.sqrt(Math.sin(rad(n.lat - a.p_lat) / 2) ** 2 + Math.cos(rad(a.p_lat)) * Math.cos(rad(n.lat)) * Math.sin(rad(n.lng - a.p_lng) / 2) ** 2));
        return { data: snap.nodes.filter((n) => n.lat != null && d(n) <= a.p_km).sort((x, y) => d(x) - d(y)).map((n) => ({ node: row(n), km: d(n) })), error: null };
      }
      return { data: null, error: { code: '42883' } };
    },
  };
}

/* a terminal whose ownership changed on a stated date (Risavika, Norway): owned_by A until 2021-11-01, B after */
const RISAVIKA = 'facility:wd-Q104518607';
const owners = snap.edges.filter((e) => e.from === RISAVIKA && e.rel === 'owned_by');

test('① the seed migration is the snapshot, and the snapshot holds what the slice promises', () => {
  const n = (re) => (seed.match(re) || []).length;
  assert.equal(n(/^insert into public\.world_graph_nodes /gm), snap.nodes.length);
  assert.equal(n(/^insert into public\.world_graph_edges /gm), snap.edges.length);
  assert.equal(n(/^insert into public\.world_graph_claims /gm), snap.claims.length);
  assert.ok(snap.nodes.filter((x) => x.type === 'facility').length >= 50, 'dozens of real terminals');
  assert.ok(snap.edges.some((e) => e.rel === 'operated_by') && snap.edges.some((e) => e.rel === 'owned_by'));
  assert.ok(snap.edges.some((e) => e.fromMs != null || e.toMs != null), 'periods are carried where Wikidata states them');
  assert.ok(snap.nodes.some((x) => x.ids.company), 'a company that IntMap\'s own atlas holds is joined by its id');
  /* nothing is inferred: every node names a source, every ref is type:id, an unplaced node has no provenance */
  snap.nodes.forEach((x) => {
    assert.match(x.ref, /^[a-z_]+:.+/); assert.ok(x.sources.length, x.ref + ' states a source'); assert.equal(x.lat == null, x.lng == null);
    if (x.lat == null) assert.equal(x.provenance, null);
  });
  assert.equal(owners.length, 2, 'the fixture terminal still changed hands on a stated date (re-measure the test if Wikidata changed)');
});

test('② rows become world objects: ties on the node that states them, claims with unit and source, periods kept', async () => {
  const W = fresh(), G = makeWorldGraphStore({ geo, worldObjects: W });
  const r = await G.fetchSubgraph(fakeDB(), RISAVIKA, { depth: 1 });
  assert.equal(r.ok, true);
  const t = W.find(RISAVIKA);
  assert.equal(t.type, 'facility'); assert.equal(t.ids.wikidata, 'Q104518607'); assert.equal(t.provenance, 'feed_coordinate');
  const own = t.links.filter((l) => l.rel === 'owned_by');
  assert.equal(own.length, 2);
  assert.ok(own.some((l) => l.toMs != null) && own.some((l) => l.fromMs != null), 'each tie keeps the period it held');
  assert.ok(t.claims.length >= 1 && t.claims[0].unit && t.claims[0].source, 'a number comes with its unit and who said it');
  assert.ok(t.sources.some((s) => /wikidata\.org/.test(s.url)));
});

test('③ the walk: «as of» a date picks the owner of that date; the other end reads it backwards; depth 2 reaches the company\'s other terminals', async () => {
  const W = fresh(), G = makeWorldGraphStore({ geo, worldObjects: W }), DB = fakeDB();
  const before = owners.find((e) => e.toMs != null), after = owners.find((e) => e.fromMs != null);
  const dayBefore = before.toMs - 86400000, dayAfter = after.fromMs + 86400000;
  for (const [at, want] of [[dayBefore, before.to], [dayAfter, after.to]]) {
    W.clear();
    await G.fetchSubgraph(DB, RISAVIKA, { rels: ['owned_by'], depth: 1, atMs: at });
    const res = W.related(RISAVIKA, { rels: ['owned_by'], depth: 1, atMs: at });
    assert.deepEqual(res.items.map((x) => x.object.ref), [want], 'as of ' + new Date(at).toISOString().slice(0, 10));
  }
  /* from the company back to the terminals it owns: the inverse name, one stored tie */
  W.clear(); await G.fetchSubgraph(DB, after.to, { rels: ['owns'], depth: 1 });
  const back = W.related(after.to, { rels: ['owns'], depth: 1 });
  assert.ok(back.items.some((x) => x.object.ref === RISAVIKA && x.rels[0] === 'owns'));
  /* two steps: terminal → owner → every other terminal that owner holds */
  W.clear(); await G.fetchSubgraph(DB, RISAVIKA, { rels: ['owned_by', 'owns'], depth: 2 });
  const two = W.related(RISAVIKA, { rels: ['owned_by', 'owns'], depth: 2 });
  assert.ok(two.items.some((x) => x.depth === 2 && x.object.type === 'facility'), 'a second terminal of the same owner is reached');
});

test('④ a company the graph names by the atlas id is the SAME object the company atlas registers', async () => {
  const W = fresh(), G = makeWorldGraphStore({ geo, worldObjects: W });
  const shell = snap.nodes.find((x) => x.ref === 'company:shell'); assert.ok(shell, 'Shell is joined to the atlas by id');
  const edge = snap.edges.find((e) => e.to === 'company:shell');
  await G.fetchSubgraph(fakeDB(), edge.from, { depth: 1 });
  const fromGraph = W.find('company:shell'); assert.ok(fromGraph);
  const atlas = W.fromCompanyProfile({ id: 'shell', n: 'Shell', wd: shell.ids.wikidata }, { facilities: [{ id: 'shell-site-1', name: 'A refinery', type: 'refinery', lon: 4.3, lat: 51.9 }] });
  W.register([atlas.company].concat(atlas.sites));
  assert.equal(W.all().filter((o) => o.type === 'company' && o.ids.wikidata === shell.ids.wikidata).length, 1, 'one company, not a graph copy and an atlas copy');
  const walk = W.related(edge.from, { rels: ['owned_by', 'operated_by', 'operates', 'owns'], depth: 3 });
  assert.ok(walk.items.some((x) => x.object.ref === 'facility:shell-site-1'), 'terminal → company → the atlas company\'s own site');
});

test('⑤ the capabilities read the persistent graph; a database that does not answer is said, not shown empty', async () => {
  const mod = await import('../js/atlas-world-objects.js'); const W = mod.worldObjects; W.clear();
  const find = (id) => caps.find((c) => c.row[0] === id);
  const R = (ok, html, extra) => Object.assign({ ok, html }, extra);
  const mk = (DB) => ({ R, warn: (m) => m, L: (en) => en, esc: (x) => String(x), HOST: { globalData: [], DB }, lx: (x) => x });
  const DB = fakeDB();
  const obj = await find('research.object').run({ ref: 'wikidata:Q104518607' }, {}, mk(DB));
  assert.equal(obj.ok, true); assert.equal(obj.exec.worldObjects.via, 'graph'); assert.equal(obj.exec.worldObjects.objects[0].ref, RISAVIKA);
  assert.match(obj.html, /throughput [\d.]+ million tonnes per annum/); assert.match(obj.html, /Wikidata Q104518607/);
  W.clear();
  const at = owners.find((e) => e.fromMs != null).fromMs + 86400000;
  const rel = await find('research.related').run({ ref: RISAVIKA, rels: ['owned_by'], at: new Date(at).toISOString().slice(0, 10) }, {}, mk(DB));
  assert.equal(rel.ok, true);
  assert.deepEqual(rel.exec.worldObjects.related.map((x) => x.ref), [owners.find((e) => e.fromMs != null).to]);
  assert.ok(DB.calls.includes('world_graph_subgraph'));
  W.clear();
  const down = { async rpc() { return { data: null, error: { code: '57014' } }; } };
  const bad = await find('research.related').run({ ref: RISAVIKA, rels: ['owned_by'] }, {}, mk(down));
  assert.equal(bad.ok, false, 'nothing held → not found');
  assert.match(bad.html, /could not be read: failed/, 'and it says the graph could not be read');
  const none = await find('research.object').run({ ref: 'wikidata:Q104518607' }, {}, mk(undefined));
  assert.equal(none.ok, false); assert.match(none.html, /unavailable/);
  W.clear();
});
