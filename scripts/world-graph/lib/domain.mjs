/* ============================================================================
 *  IntMap · world-graph domains — the EXTENSION POINT: how another kind of object joins the same graph
 *  (dev-notes/2026-11-20-world-graph-identity.md)
 * ----------------------------------------------------------------------------
 *  A DOMAIN is a named slice of the graph (`admin`, `plants`, `ports`, `lng` …): the object types it owns, the
 *  identifier schemes it uses, and a function that turns the supplier's rows into graph nodes, claims and ties.
 *  A domain does not know the other domains. Two domains meet through an IDENTIFIER one of them states and the
 *  other holds — never through a name and never through nearness:
 *
 *      linkByIdentifier(fromNodes, toNodes, { rel, key })      key(node) → {scheme, value} | null
 *
 *  `key` says which identifier on the FROM side names the TO object (a plant's country code → the country that
 *  holds that code). A node whose key finds no object is COUNTED in `unresolved` and left unlinked: a tie that
 *  could not be resolved is not drawn. An identifier held by TWO objects resolves to neither.
 *
 *  Every domain's output is applied through world_graph_ingest_begin / _apply / _finish
 *  (supabase/migrations/20261120120000_world_graph_ingest.sql), so a domain inherits ownership by feed,
 *  guarded retirement, freshness and — through the triggers of 20261120130000 — the change log.
 *  `toSqlRun` renders one such run as migration SQL.
 * ==========================================================================*/

const SCHEME_PREFIX = { wikidata: 'wd', iso3166_1_a3: 'iso', iso3166_1_a2: 'iso2', osm: 'osm', unlocode: 'lo', gvp: 'gvp', icao: 'icao', iata: 'iata' };

/** the ref a domain gives an object: `<type>:<scheme prefix>-<value>` — built from a STABLE identifier, so the same
    object from two feeds is the same ref. A re-issued scheme (gers) has no prefix here on purpose. */
export function nodeRef(type, scheme, value) {
  const p = SCHEME_PREFIX[scheme]; if (!p) throw new Error('no ref prefix for scheme ' + scheme + ' (a re-issued id is not a ref)');
  return type + ':' + p + '-' + String(value).replace(/\s+/g, '');
}

/** validate a domain; the only thing enforced is that its feed name is the ingest's and it can build */
export function defineDomain(d) {
  if (!d || !/^[a-z_]{2,40}$/.test(d.feed || '')) throw new Error('a domain needs a feed name /^[a-z_]{2,40}$/');
  if (!Array.isArray(d.types) || !d.types.length) throw new Error('a domain names the object types it owns');
  if (typeof d.build !== 'function') throw new Error('a domain needs build()');
  return Object.freeze({ ...d, types: Object.freeze([...d.types]) });
}

export function linkByIdentifier(fromNodes, toNodes, spec) {
  const ix = new Map();
  toNodes.forEach((n) => Object.keys(n.ids || {}).forEach((s) => { const k = s + '\u0000' + n.ids[s]; ix.set(k, ix.has(k) ? null : n.ref); }));
  const edges = [], unresolved = [];
  fromNodes.forEach((n) => {
    const k = spec.key(n);
    if (!k || k.value == null || k.value === '') { unresolved.push({ ref: n.ref, why: 'no-identifier' }); return; }
    const key = k.scheme + '\u0000' + k.value, to = ix.get(key);
    if (!to) { unresolved.push({ ref: n.ref, why: ix.has(key) ? 'identifier-held-twice' : 'no-object-holds-it', scheme: k.scheme, value: k.value }); return; }
    edges.push({ from_ref: n.ref, rel: spec.rel, to_ref: to, from_ms: null, to_ms: null, confidence: spec.confidence || 'high', source: spec.source || '', retrieved: spec.retrieved || null });
  });
  return { edges, unresolved };
}

/** one feed run as SQL: begin → apply → finish, inside a DO block, so the migration is one ingest run */
export function toSqlRun(feed, parts, upstream, note) {
  const p = parts || {};
  const lit = (v) => { const s = JSON.stringify(v); if (s.includes('$j$')) throw new Error('payload contains the dollar-quote tag'); return '$j$' + s + '$j$::jsonb'; };
  return 'do $run$ declare r bigint; begin\n'
    + "  r := public.world_graph_ingest_begin('" + feed + "');\n"
    + '  perform public.world_graph_ingest_apply(r, ' + lit(p.nodes || []) + ',\n    ' + lit(p.edges || []) + ',\n    ' + lit(p.claims || []) + ');\n'
    + '  perform public.world_graph_ingest_finish(r, ' + lit(upstream || {}) + ', ' + lit({ seed: true, note: note || '' }) + ');\n'
    + 'end $run$;\n';
}
