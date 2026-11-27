// ============================================================================
//  IntMap · _shared/atlas-server-caps.js — the read capabilities a durable job can run WITHOUT a page   (atlas-durable-jobs)
// ----------------------------------------------------------------------------
//  A capability task of a job (kind 'capability') names a capability of the page's registry (js/atlas-capabilities.js).
//  The page runs it in a kernel that needs a DOM, a map and the bundled data; a durable job runs after the tab is gone, so
//  it can only run a capability that has a SERVER TWIN: a function here that does the same read from the same upstream with
//  no page. This file is the closed list of those twins. Nothing else is run: a capability with no twin is refused BY NAME
//  when the job is planned (`capability_unsupported_on_server`), never started and failed there.
//
//  A twin is  { id, args, needs?, run(args, { fetch, signal, db, gis, fetchGeoJson }) → { ok, text, data?, sources?, code? } }  and it
//    · `args` is one line the planner and a tool-using worker read to know how to call it (the lane's `catalogue()` hands it over);
//    · `needs:['gis']` says it runs the page's own GIS through the lane's `gis` (_shared/gis-headless.js, the runner the MCP server uses);
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

/* data.gis — the page's GIS run on GeoJSON it is handed, with no page. The page's capability resolves a REF against the datasets and layers
   the page holds; the server holds none, so an input here is the data itself: inline GeoJSON, the https address of a GeoJSON file (read under
   gis-fetch's rule — _shared/gis-input-fetch.js), or what an earlier task of the same job produced (`"@A:data.result"` — the job runner resolves
   it before this runs, js/atlas-job-core.js resolveArgs). A "layer:…" / "ogc:" / "stac:" ref, `acquire`, and a raster op need the page and are
   `part_unsupported_on_server` by name. The operations are the ones the GIS DECLARES (_shared/gis-headless.js, the same runner the MCP server uses): none is
   listed here, and `{"describe":true}` (or no `op`) returns them. The work is the program's, not a model's: ONE call answers a whole table.
   (gis-result-handoff) THE ANSWER IS WHOLE AND SAYS WHERE IT CAME FROM. It used to be cut at a byte bound here and to name no source (`sources:[]`,
   every input `headless-input`); a step that read it could not tell the file it came from, and a step after it could not have the rows that did not fit.
   Now every feature is returned — WHERE it is kept (in the task's row, or beside it when it is large) is the job runner's, not this twin's — and
   `sources` / `data.inputs` name each input: the address of a file, or the task (and the version of its output) an input was handed from, with
   that task's own sources carried through. */
/* what the server's data.gis reads, said in its own words when it is asked for something else (it borrowed the world graph's sentence) */
const notHere = (what) => ({ ok: false, code: 'part_unsupported_on_server', text: 'On the server data.gis reads: inline GeoJSON; the address of a GeoJSON file ("https://…" or "url:https://…"); or what an earlier task of this job made — "@<task id>:data.result", or simply the task id when that task is one of this task\'s inputs. "' + String(what).slice(0, 80) + '" is none of these: layers, OGC/STAC searches, acquire and raster output need the page.' });
const sourceOfUrl = (u) => ({ url: String(u).slice(0, 500), title: 'GeoJSON file ' + (String(u).split('?')[0].split('/').filter(Boolean).pop() || String(u)).slice(0, 160) });
export function columnsOf(features) {
  const seen = new Set();
  for (const f of features) { const pr = f && f.properties; if (pr && typeof pr === 'object') for (const k of Object.keys(pr)) if (seen.size < 200) seen.add(k); }
  return Array.from(seen);
}
const gisJob = {
  id: 'data.gis',
  needs: ['gis'],
  args: '{"op"?:str (omit it, with inputs, to READ them: the result is the features as read),"inputs":[GeoJSON|"https://…geojson"|"url:https://…geojson"|"@<task>:data.result"|"<task id>"],"params"?:{…}} — a spatial operation (buffer, join, nearest, dissolve, measure, filter…) run on GeoJSON you give, point at, or that an earlier task of this job made ("@A:data.result" hands the whole result of A on); {"describe":true} lists the operations and their parameters. "layer:" / "ogc:" / "stac:" refs, acquire and raster output need the page',
  async run(args, ctx) {
    const a = args || {};
    if (a.acquire || a.kind === 'raster' || a.semantics) return notHere(a.acquire ? 'acquire' : (a.semantics ? 'semantics' : 'raster'));
    /* (gis-read-step) WITH INPUTS AND NO op, THE STEP READS. On the page, {"type":"gis","inputs":[REF]} with no op is the acquiring step — it fetches and
       answers with the dataset (js/atlas-cap-data.js). A job's planner wrote exactly that for «read the file» (production 2026-11-28) and the server answered
       with its list of operations, ok:true, and no data — the next step then had nothing to read. Only {"describe":true}, or no op AND no inputs, lists. */
    const reading = !a.op && !a.describe && Array.isArray(a.inputs) && a.inputs.length > 0;
    if (!reading && (a.describe || !a.op)) {
      const ops = await ctx.gis.ops();
      return { ok: true, text: ops.length + ' operation(s): ' + ops.map((o) => o.id + '(' + o.inputs + ')').join(', ') + '.', data: { ops }, sources: [] };
    }
    const inputs = [], names = [], read = [], sources = [];
    const addSource = (x) => { if (x && x.url && !sources.some((y) => y.url === x.url)) sources.push({ url: String(x.url).slice(0, 500), title: String(x.title || '').slice(0, 200) }); };
    for (const x of Array.isArray(a.inputs) ? a.inputs : []) {
      let v = x, name = '', srcs = [], from = null;
      /* (gis-handoff-entry) THE PAGE'S VOCABULARY, ON THE SERVER. The page's data.gis names an input by a dataset id, and a file by "url:https://…";
         a job's planner (Atlas) writes the same words in a job (measured in production 2026-11-28: "url:https://…geojson" and the bare id of the earlier
         task, both refused — with the world graph's sentence). On the server the datasets ARE the outputs of the job's earlier tasks, so a bare name that
         is one of this task's inputs (its task id, or its output id job:<job>/<task>) is that output; "url:" is the address it prefixes. */
      const handed = typeof x === 'string' && ctx.outputs && typeof ctx.outputs.get === 'function' ? ctx.outputs.get(x) : null;
      if (handed && handed.noFeatures) return { ok: false, code: 'input_has_no_features', text: 'Task "' + String(x).slice(0, 64) + '" is one of the inputs, but its result holds no features to read (it answered: ' + String(handed.summary || '').slice(0, 200) + '). Make that task produce features — a data.gis step with "op", or with "inputs" and no "op" to read a file — and use its result here.' };
      if (handed) v = handed;
      if (typeof x === 'string' && !handed) {
        if (/^@[A-Za-z0-9._-]+:/.test(x)) return { ok: false, code: 'input_ref_unresolved', text: 'The input "' + x.slice(0, 80) + '" refers to another task, and nothing resolved it (it must be a task of the same job, listed in this task\'s inputs).' };
        const addr = /^url:/i.test(x) ? x.slice(4) : x;
        if (!/^https:\/\//i.test(addr)) return notHere(x);
        if (typeof ctx.fetchGeoJson !== 'function') return { ok: false, code: 'no_file_reader', text: 'This runtime cannot read a file by address.' };
        const f = await ctx.fetchGeoJson(addr, { signal: ctx.signal });
        if (!f.ok) return { ok: false, code: f.code, text: f.text };
        v = f.json; name = addr.slice(0, 500); srcs = [sourceOfUrl(addr)];
      }
      if (v && typeof v === 'object' && !Array.isArray(v) && v.intmap && typeof v.intmap === 'object') {
        /* handed on from an earlier task (the runner marked it): its task, the version of its output, and the sources IT named */
        from = { task: String(v.intmap.from || '').slice(0, 64), version: String(v.intmap.version || '').slice(0, 40) };
        name = 'task ' + from.task + (from.version ? ' (output version ' + from.version + ')' : '');
        srcs = Array.isArray(v.intmap.sources) ? v.intmap.sources : [];
      }
      const feats = Array.isArray(v) ? v : (v && v.type === 'FeatureCollection' && Array.isArray(v.features) ? v.features : (v && v.type === 'Feature' ? [v] : null));
      if (!feats) return { ok: false, code: 'bad_input', text: 'Each input must be a FeatureCollection, a Feature, an array of Features, the https address of a GeoJSON file, or "@<task>:data.result".' };
      inputs.push(feats); names.push(name);
      srcs.forEach(addSource);
      read.push(Object.assign({ name: name || '(inline GeoJSON)', count: feats.length, sources: srcs.map((y) => y && y.url).filter(Boolean) }, from ? { from: from.task, version: from.version } : null));
    }
    if (reading) {
      /* the read step: its result IS its input(s) — one input is that collection, several are one collection of all of them, each feature as it came */
      const all = [];
      for (const f of inputs) for (const x of f) all.push(x);
      const head = all.slice(0, 5).map((f) => (f && f.properties ? f.properties : {}));
      return {
        ok: true,
        text: 'read -> ' + all.length + ' feature(s) from ' + read.map((x) => x.count + ' (' + x.name + ')').join(' + ') + '. First rows: ' + JSON.stringify(head).slice(0, 600),
        data: { op: 'read', count: all.length, columns: columnsOf(all), result: { type: 'FeatureCollection', features: all }, inputs: read },
        sources,
      };
    }
    let r;
    try { r = await ctx.gis.run({ op: String(a.op), inputs, params: a.params, names }); }
    catch (e) { return { ok: false, code: String((e && e.code) || 'op_failed'), text: String((e && e.detail) || (e && e.message) || e).slice(0, 300) }; }
    const head = r.features.slice(0, 5).map((f) => (f && f.properties ? f.properties : {}));
    return {
      ok: true,
      text: r.op + ' -> ' + r.features.length + ' feature(s) from ' + read.map((x) => x.count + ' (' + x.name + ')').join(' + ') + '. First rows: ' + JSON.stringify(head).slice(0, 600),
      data: { op: r.op, count: r.features.length, columns: columnsOf(r.features), result: { type: 'FeatureCollection', features: r.features }, inputs: read, manifest: r.manifest },
      sources,
    };
  },
};

export const SERVER_CAPS = Object.freeze({ [spaceWeather.id]: spaceWeather, [worldObject.id]: worldObject, [worldRelated.id]: worldRelated, [gisJob.id]: gisJob });

/* serverCapabilityIds() — what a job may name as a capability task */
export function serverCapabilityIds() { return Object.keys(SERVER_CAPS); }

/* makeServerCaps({ fetch, db }) — the lane a job runner is given: { has(id), catalogue(), run(id, args, { signal }) → the twin's answer }.
   `catalogue()` is DISCOVERED from the table above — [{id, args}] — so a planner refused for a capability with no twin is told what does exist,
   and a worker is handed its tools from it; there is no second list. */
export function makeServerCaps(o) {
  const f = (o && o.fetch) || (typeof fetch === 'function' ? fetch : null);
  const db = (o && o.db) || null;
  const gis = (o && o.gis) || null;
  const fetchGeoJson = (o && o.fetchGeoJson) || null;
  return {
    catalogue: () => Object.keys(SERVER_CAPS).map((id) => ({ id, args: SERVER_CAPS[id].args })),
    has: (id) => Object.prototype.hasOwnProperty.call(SERVER_CAPS, String(id || '')),
    /* (atlas-autonomy) does this twin share in-process state with another call — the GIS engine and its layers — so that two of it must not run
       at once? Derived from `needs`, not listed: a twin that only reads over HTTP or the database can overlap with anything. */
    exclusive: (id) => { const t = SERVER_CAPS[String(id || '')]; return !t || (t.needs || []).includes('gis'); },
    async run(id, args, ctx) {
      const t = SERVER_CAPS[String(id || '')];
      if (!t) return { ok: false, code: 'capability_unsupported_on_server', text: '"' + String(id || '').slice(0, 80) + '" has no server twin.' };
      if ((t.needs || []).includes('gis') && !(gis && typeof gis.run === 'function')) return { ok: false, code: 'no_gis', text: 'This runtime has no GIS for "' + t.id + '".' };
      if (!f) return { ok: false, code: 'no_fetch', text: 'This runtime has no fetch.' };
      if ((t.needs || []).includes('db') && !(db && typeof db.rpc === 'function')) return { ok: false, code: 'no_db', text: 'This runtime has no database lane for "' + t.id + '".' };
      /* a twin never waits on an upstream without a clock: 20 s (observation: NOAA SWPC answers in under 2 s; this only has to stay inside the 150 s lease). Expires with the lease. */
      const signal = (ctx && ctx.signal) || (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined);
      try { return await t.run(args || {}, { fetch: f, signal, db, gis, fetchGeoJson, outputs: (ctx && ctx.outputs) || null }); }
      catch (e) { return { ok: false, code: 'twin_threw', text: String(e && e.message || e).slice(0, 300) }; }
    },
  };
}
