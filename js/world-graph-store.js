/* ============================================================================
 *  IntMap · world-graph-store — read the PERSISTENT world graph (Supabase) into the session's object index
 * ----------------------------------------------------------------------------
 *  js/atlas-world-objects.js keeps what ONE page surfaced. The database keeps what a source STATED, for every
 *  reader and every session (supabase/migrations/20261119150000_world_graph.sql): objects keyed by the page's own
 *  `ref`, typed ties with the period they held, and numbers with their basis. This module is the only place that
 *  knows the row shape; it turns rows into world objects through the SAME constructor every adapter uses
 *  (`geo.worldObject`) and registers them in the SAME index, so «who operates this terminal», «as of 2018» and
 *  «what else does that company run» are answered by the traversal that already exists — the graph adds
 *  reach, not a second way to ask.
 *
 *    fetchSubgraph(DB, ref, {rels, depth, atMs})   the ties within `depth` of `ref`, registered
 *    find(DB, query)                                a ref / «wikidata:Q…» / exact name → the object (and its neighbours)
 *    near(DB, lng, lat, km)                         placed persisted objects within km, registered
 *
 *  ⚠ NOTHING HERE DECIDES WHETHER AN ANSWER IS EMPTY. Every door returns `{ ok, error? }`: a database that did not
 *  answer is `unavailable` / `failed`, never an empty graph (the page says «could not read», not «nothing is tied»).
 *  Pure apart from `DB.rpc`; the client is passed in (the page's HOST.DB, or a fake in the node checks).
 * ==========================================================================*/
import { makeAtlasGeoObject } from './atlas-geo-object.js';

export function makeWorldGraphStore(deps) {
  deps = deps || {};
  const geo = deps.geo || makeAtlasGeoObject();
  const W = deps.worldObjects;
  if (!W) throw new Error('world-graph-store needs the world-object index');
  const arr = (v) => (Array.isArray(v) ? v : []);

  /** a stored relation name and its reading from the other end — the walk is stored once and followed in both directions */
  function relNames(rels) {
    const out = [];
    arr(rels).map(String).filter(Boolean).forEach((r) => { [r, geo.inverseRel(r).replace(/^~/, '')].forEach((n) => { if (n && out.indexOf(n) < 0) out.push(n); }); });
    return out;
  }
  const splitRef = (ref) => { const i = String(ref).indexOf(':'); return i > 0 ? { type: String(ref).slice(0, i), id: String(ref).slice(i + 1) } : null; };

  /** the rows of one subgraph as world objects: each node carries the ties IT states and the claims about it */
  function toObjects(payload) {
    const p = payload || {}, links = {}, claims = {};
    arr(p.edges).forEach((e) => { (links[e.from_ref] = links[e.from_ref] || []).push({ rel: e.rel, ref: e.to_ref, fromMs: e.from_ms, toMs: e.to_ms, confidence: e.confidence, source: e.source }); });
    arr(p.claims).forEach((c) => { (claims[c.ref] = claims[c.ref] || []).push({ key: c.key, value: c.value, unit: c.unit, fromMs: c.from_ms, toMs: c.to_ms, source: c.source }); });
    return arr(p.nodes).map((n) => {
      const r = splitRef(n.ref); if (!r) return null;
      return geo.worldObject({
        type: r.type, kind: n.kind || r.type, id: r.id, name: n.name, country: n.country || '',
        lng: n.lng, lat: n.lat, provenance: n.provenance || undefined,
        ids: n.ids, validity: { fromMs: n.valid_from_ms, toMs: n.valid_to_ms },
        facts: n.facts, sources: n.sources, links: links[n.ref] || [], claims: claims[n.ref] || [],
      });
    }).filter(Boolean);
  }

  async function call(DB, name, args) {
    if (!DB || typeof DB.rpc !== 'function') return { ok: false, error: 'unavailable' };
    try {
      const { data, error } = await DB.rpc(name, args);
      if (error) return { ok: false, error: 'failed', code: error.code || '' };
      return { ok: true, data };
    } catch (_) { return { ok: false, error: 'failed' }; }
  }

  async function fetchSubgraph(DB, ref, opts) {
    opts = opts || {};
    const rels = relNames(opts.rels);
    const r = await call(DB, 'world_graph_subgraph', { p_ref: String(ref || ''), p_rels: rels.length ? rels : null, p_depth: opts.depth >= 1 ? Math.floor(opts.depth) : 1, p_at_ms: opts.atMs != null ? opts.atMs : null });
    if (!r.ok) return r;
    const objects = W.register(toObjects(r.data));
    return { ok: true, objects, edges: arr(r.data && r.data.edges).length, claims: arr(r.data && r.data.claims).length };
  }

  async function find(DB, query) {
    const q = String(query || '').trim(); if (!q) return { ok: true, object: null };
    const r = await call(DB, 'world_graph_find', { p_q: q });
    if (!r.ok) return r;
    const row = arr(r.data)[0]; if (!row) return { ok: true, object: null };
    const sub = await fetchSubgraph(DB, row.ref, { depth: 1 });
    if (!sub.ok) return sub;
    return { ok: true, object: W.find(row.ref) || null, matches: arr(r.data).length };
  }

  async function near(DB, lng, lat, km) {
    const r = await call(DB, 'world_graph_near', { p_lng: +lng, p_lat: +lat, p_km: +km });
    if (!r.ok) return r;
    const rows = arr(r.data);
    return { ok: true, objects: W.register(toObjects({ nodes: rows.map((x) => x.node) })), count: rows.length };
  }

  return { relNames, toObjects, fetchSubgraph, find, near };
}
