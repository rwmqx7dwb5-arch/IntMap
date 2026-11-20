// ============================================================================
//  IntMap · _shared/atlas-server-caps.js — the read capabilities a durable job can run WITHOUT a page   (atlas-durable-jobs)
// ----------------------------------------------------------------------------
//  A capability task of a job (kind 'capability') names a capability of the page's registry (js/atlas-capabilities.js).
//  The page runs it in a kernel that needs a DOM, a map and the bundled data; a durable job runs after the tab is gone, so
//  it can only run a capability that has a SERVER TWIN: a function here that does the same read from the same upstream with
//  no page. This file is the closed list of those twins. Nothing else is run: a capability with no twin is refused BY NAME
//  when the job is planned (`capability_unsupported_on_server`), never started and failed there.
//
//  A twin is  { id, args, needs?, run(args, { fetch, signal, db }) → { ok, text, data?, sources?, code? } }  and it
//    · `args` is one line the planner and a tool-using worker read to know how to call it (the lane's `catalogue()` hands it over);
//    · `needs:['db']` says it reads the persisted world graph through the lane's `db` (the same public RPCs js/ and mcp-server read);
//    · is for a capability whose row is read-only in the page registry (tests/atlas-server-caps-checks pins that: a twin of
//      a row that writes, asks or shows something would run here with none of the page's guards);
//    · fetches only hosts written in this file — the URL is never built from an argument that is text;
//    · states what it did not do: a part of the capability it does not cover is `part_unsupported_on_server`, not a smaller answer.
//  ⚠ NO TYPE ANNOTATIONS, NO IMPORTS — scripts/static-checks.mjs parses committed .js as plain JavaScript and a node test runs it as is.
// ============================================================================

const SWPC = 'https://services.swpc.noaa.gov/';

/* sim.spaceWeather — the page's capability reads seven NOAA/NASA feeds and parses them with js/widget-defs-space.js; the twin
   covers `kp` (the planetary K index, observed and forecast), which that file reads without a parser of its own: the rows
   of products/noaa-planetary-k-index-forecast.json, the last 40 with a Kp value, exactly as js/atlas-cap-sim.js does.
   Observation 2026-11-20: the feed is an array of { time_tag, kp, observed, noaa_scale }. Expires if NOAA changes that shape —
   then the twin answers `upstream_shape` (below) rather than a wrong figure. */
const spaceWeather = {
  id: 'sim.spaceWeather',
  parts: ['kp'],
  args: '{"part":"kp"} — planetary Kp, observed and forecast (NOAA SWPC); other parts need the page',
  async run(args, ctx) {
    const part = String((args && args.part) || '');
    if (part !== 'kp') {
      return { ok: false, code: 'part_unsupported_on_server', text: 'On the server sim.spaceWeather answers only {"part":"kp"}; "' + (part || 'all') + '" needs the page. Ask for "kp", or run the others from the page.' };
    }
    let res;
    try { res = await ctx.fetch(SWPC + 'products/noaa-planetary-k-index-forecast.json', { signal: ctx.signal, headers: { Accept: 'application/json' } }); }
    catch (e) { return { ok: false, code: (ctx.signal && ctx.signal.aborted) ? 'cancelled' : 'upstream_unreachable', text: 'NOAA SWPC could not be reached.' }; }
    if (!res.ok) return { ok: false, code: 'upstream_' + res.status, text: 'NOAA SWPC answered ' + res.status + '.' };
    let rows;
    try { rows = await res.json(); } catch (_) { rows = null; }
    if (!Array.isArray(rows)) return { ok: false, code: 'upstream_shape', text: 'NOAA SWPC returned a shape this reader does not know.' };
    const kp = rows.filter((r) => r && r.kp != null && isFinite(+r.kp)).slice(-40).map((r) => ({ at: String(r.time_tag) + 'Z', kp: +r.kp, observed: r.observed }));
    if (!kp.length) return { ok: false, code: 'upstream_empty', text: 'NOAA SWPC returned no Kp rows.' };
    const seen = kp.filter((r) => r.observed === 'observed');
    const last = seen[seen.length - 1];
    const max = kp.reduce((m, r) => (r.kp > m.kp ? r : m), kp[0]);
    return {
      ok: true,
      text: (last ? 'Planetary Kp observed at ' + last.at + ': ' + last.kp.toFixed(1) + '. ' : '') + 'Highest of the ' + kp.length + ' rows (observed and forecast): ' + max.kp.toFixed(1) + ' at ' + max.at + '.',
      data: { source: 'NOAA SWPC', kp },
      sources: [{ url: SWPC + 'products/noaa-planetary-k-index-forecast.json', title: 'NOAA SWPC planetary K index and forecast' }],
    };
  },
};

/* The world graph twins (research.object, research.related). The page resolves a name against everything IT holds (loaded news events,
   volcanoes, recent earthquakes) and then the persisted graph; the server has only the persisted graph (supabase/migrations/…world_graph.sql:
   world_graph_find / world_graph_subgraph, public RPCs, the ones js/world-objects.js and mcp-server read). So every answer says
   scope:'persisted_world_graph', and an argument that needs the page's own objects (place, km, hours) is `part_unsupported_on_server`
   by name — never a smaller answer given as the whole one. Observation 2026-11-20: world_graph_find returns whole node rows (ref, type, name, ids…),
   world_graph_subgraph returns {nodes, edges, claims}. Expires if those shapes change — the twin then says what it could not read. */
const rowsOf = (r) => (r && !r.error && Array.isArray(r.data) ? r.data : null);
const needPage = (what) => ({ ok: false, code: 'part_unsupported_on_server', text: 'On the server this reads only the persisted world graph; "' + what + '" needs objects only the page holds. Give "ref" or "name", or run it from the page.' });
async function worldNode(args, ctx) {
  const q = String((args && (args.ref || args.name)) || '').trim().slice(0, 200);
  if (!q) return { err: { ok: false, code: 'needs_input', text: 'Give "ref" (type:id) or "name".' } };
  const found = await ctx.db.rpc('world_graph_find', { p_q: q });
  const rows = rowsOf(found);
  if (!rows) return { err: { ok: false, code: 'world_graph_unavailable', text: 'The world graph could not be read.' } };
  const want = String((args && args.objectType) || '');
  const pick = rows.filter((n) => !want || n.type === want);
  return { q, node: pick[0] || null, matches: pick.length };
}
const worldObject = {
  id: 'research.object',
  needs: ['db'],
  args: '{"ref"|"name":str,"objectType"?:str} — the persisted world-graph record (type, position, sources, claims); not objects only the page holds',
  async run(args, ctx) {
    if (args && args.place) return needPage('place');
    const w = await worldNode(args, ctx);
    if (w.err) return w.err;
    if (!w.node) return { ok: true, text: 'The persisted world graph holds no object "' + w.q + '" (this is not a claim that it does not exist).', data: { scope: 'persisted_world_graph', object: null, matches: 0 }, sources: [] };
    const sub = await ctx.db.rpc('world_graph_subgraph', { p_ref: w.node.ref, p_rels: null, p_depth: 0, p_at_ms: null });
    const claims = sub && !sub.error && sub.data && Array.isArray(sub.data.claims) ? sub.data.claims : [];
    return { ok: true, text: String(w.node.name || w.node.ref) + ' (' + w.node.type + ', ' + w.node.ref + ') — ' + claims.length + ' stated claim(s).', data: { scope: 'persisted_world_graph', object: w.node, claims, matches: w.matches }, sources: [] };
  },
};
const worldRelated = {
  id: 'research.related',
  needs: ['db'],
  args: '{"ref"|"name":str,"rels"?:[str],"depth"?:1-3,"at"?:"YYYY-MM-DD","types"?:[str]} — typed ties around an object in the persisted world graph; no proximity search (km/hours need the page)',
  async run(args, ctx) {
    if (args && (args.km != null || args.hours != null || args.place)) return needPage(args.place ? 'place' : (args.km != null ? 'km' : 'hours'));
    const w = await worldNode(args, ctx);
    if (w.err) return w.err;
    if (!w.node) return { ok: true, text: 'The persisted world graph holds no object "' + w.q + '".', data: { scope: 'persisted_world_graph', nodes: [], edges: [], claims: [] }, sources: [] };
    let atMs = null;
    if (args && args.at) { atMs = /^\d{4}-\d{2}-\d{2}$/.test(String(args.at)) ? Date.parse(args.at + 'T00:00:00Z') : NaN; if (!isFinite(atMs)) return { ok: false, code: 'bad_at', text: '"at" must be YYYY-MM-DD.' }; }
    const depth = Math.max(1, Math.min(3, Math.floor(+(args && args.depth) || 1)));
    const rels = Array.isArray(args && args.rels) && args.rels.length ? args.rels.map((x) => String(x).slice(0, 40)).slice(0, 20) : null;
    const sub = await ctx.db.rpc('world_graph_subgraph', { p_ref: w.node.ref, p_rels: rels, p_depth: depth, p_at_ms: atMs });
    if (!sub || sub.error || !sub.data) return { ok: false, code: 'world_graph_unavailable', text: 'The world graph could not be read.' };
    const types = Array.isArray(args && args.types) ? args.types.map(String) : null;
    const nodes = (sub.data.nodes || []).filter((n) => !types || !types.length || n.ref === w.node.ref || types.includes(n.type));
    return { ok: true, text: nodes.length + ' object(s) within ' + depth + ' tie(s) of ' + w.node.ref + ', ' + (sub.data.edges || []).length + ' tie(s).', data: { scope: 'persisted_world_graph', ref: w.node.ref, asOf: (args && args.at) || null, nodes, edges: sub.data.edges || [], claims: sub.data.claims || [] }, sources: [] };
  },
};

export const SERVER_CAPS = Object.freeze({ [spaceWeather.id]: spaceWeather, [worldObject.id]: worldObject, [worldRelated.id]: worldRelated });

/* serverCapabilityIds() — what a job may name as a capability task */
export function serverCapabilityIds() { return Object.keys(SERVER_CAPS); }

/* makeServerCaps({ fetch, db }) — the lane a job runner is given: { has(id), catalogue(), run(id, args, { signal }) → the twin's answer }.
   `catalogue()` is DISCOVERED from the table above — [{id, args}] — so a planner refused for a capability with no twin is told what does exist,
   and a worker is handed its tools from it; there is no second list. */
export function makeServerCaps(o) {
  const f = (o && o.fetch) || (typeof fetch === 'function' ? fetch : null);
  const db = (o && o.db) || null;
  return {
    catalogue: () => Object.keys(SERVER_CAPS).map((id) => ({ id, args: SERVER_CAPS[id].args })),
    has: (id) => Object.prototype.hasOwnProperty.call(SERVER_CAPS, String(id || '')),
    async run(id, args, ctx) {
      const t = SERVER_CAPS[String(id || '')];
      if (!t) return { ok: false, code: 'capability_unsupported_on_server', text: '"' + String(id || '').slice(0, 80) + '" has no server twin.' };
      if (!f) return { ok: false, code: 'no_fetch', text: 'This runtime has no fetch.' };
      if ((t.needs || []).includes('db') && !(db && typeof db.rpc === 'function')) return { ok: false, code: 'no_db', text: 'This runtime has no database lane for "' + t.id + '".' };
      /* a twin never waits on an upstream without a clock: 20 s (observation: NOAA SWPC answers in under 2 s; this only has to stay inside the 150 s lease). Expires with the lease. */
      const signal = (ctx && ctx.signal) || (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined);
      try { return await t.run(args || {}, { fetch: f, signal, db }); }
      catch (e) { return { ok: false, code: 'twin_threw', text: String(e && e.message || e).slice(0, 300) }; }
    },
  };
}
