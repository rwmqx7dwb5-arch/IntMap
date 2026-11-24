/* ============================================================================
 *  IntMap · world-graph-identity — «is this record the object we already hold?», and «what did the refresh change?»
 *  (supabase/migrations/20261120135000_world_graph_identity.sql · dev-notes/2026-11-20-world-graph-identity.md)
 * ----------------------------------------------------------------------------
 *  Pure. No network, no database: the caller hands in the objects it holds (`known`) and the records a supplier
 *  sent (`incoming`), and gets back a DECISION per record, the BASIS of the decision, and the DIFFERENCES between
 *  what was held and what came.
 *
 *  THE ORDER OF EVIDENCE (strongest first; the first tier that answers decides):
 *    1 stated_id     a STABLE identifier (wikidata, osm, iso3166…) equal on both sides, and held by ONE object.
 *    2 history_id    a RE-ISSUED identifier (gers) that the object holds now or held in an earlier release.
 *    3 source_record the supplier names the same source record (dataset + record_id, equal to the character)
 *                    that the object's history names — «almost the same record id» is a different record.
 *    4 attribute     same type and kind, same country, within `radiusM` of each other, and NO identifier that
 *                    contradicts. This tier never says «same»: it says `candidate` (the page's `candidate_match`),
 *                    because two real things can stand 30 m apart.
 *  A NAME IS NEVER EVIDENCE. It is carried through and compared as a changed attribute, nothing more.
 *  An identifier that DIFFERS in a stable scheme (both hold a wikidata id, different ones) is evidence of two
 *  objects and rules out tier 3 and 4: a coordinate does not outvote two different Wikidata items.
 *  Two objects satisfying a tier is `ambiguous`, never a pick (the data-governance rule: say what is not known).
 * ==========================================================================*/

/* Identifier schemes that name the same thing in every release of a supplier. A scheme not listed here is
   treated as RE-ISSUED (history_id): the safe reading — a re-issued id compared as stable would call two
   objects one. Observation: Wikidata QIDs and OSM element ids persist across edits (a merge leaves a redirect),
   UN/LOCODE and ISO codes are standards. Expires: when a supplier re-issues one of these, move it out. */
export const STABLE_SCHEMES = ['wikidata', 'osm', 'iso3166_1_a2', 'iso3166_1_a3', 'unlocode', 'icao', 'iata', 'gvp', 'company', 'naturalearth'];

/* Attribute tier: the distance inside which two records of the same kind and country may be the same object.
   Observation (2026-11-20): Overture places of one real facility sit within tens of metres of the OSM/Wikidata
   point for the same thing, while distinct facilities of one kind are usually further apart — which is why this
   tier proposes a candidate and does not decide. Callers pass their own `radiusM`; this is the default. */
export const DEFAULT_RADIUS_M = 100;

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

export function haversineM(a, b) {
  const R = 6371008.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
const placed = (o) => o && typeof o.lng === 'number' && typeof o.lat === 'number' && isFinite(o.lng) && isFinite(o.lat);
const recKey = (r) => (r && r.dataset != null && r.record_id != null ? String(r.dataset) + '\u0000' + String(r.record_id) : '');

/* an object (a held node row, or an incoming record) as the matcher reads it */
function view(o) {
  const x = obj(o);
  return {
    ref: x.ref, type: x.type, kind: x.kind || '', country: x.country || '', lng: x.lng, lat: x.lat, name: x.name,
    ids: obj(x.ids),
    past: arr(x.history).map((h) => ({ scheme: String(h.scheme), id: String(h.ext_id != null ? h.ext_id : h.id) })),
    records: arr(x.sourceRecords || x.source_records).map(recKey).filter(Boolean),
  };
}

/** index the held objects once: by (scheme,value) present and past, by source record, and a flat list for the attribute tier */
export function indexKnown(known, opts) {
  const stable = new Set((opts && opts.stableSchemes) || STABLE_SCHEMES);
  const idIx = new Map(), recIx = new Map(), list = [];
  const push = (m, k, ref) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(ref); };
  arr(known).forEach((k) => {
    const v = view(k); if (!v.ref) return;
    list.push(v);
    Object.keys(v.ids).forEach((s) => { if (v.ids[s] != null && v.ids[s] !== '') push(idIx, s + '\u0000' + v.ids[s], v.ref); });
    v.past.forEach((p) => push(idIx, p.scheme + '\u0000' + p.id, v.ref));
    v.records.forEach((r) => push(recIx, r, v.ref));
  });
  return { stable, idIx, recIx, list, byRef: new Map(list.map((v) => [v.ref, v])) };
}

/** two objects that each state a value in the same STABLE scheme, and the values differ → they are two objects */
function contradicts(a, b, stable) {
  return Object.keys(a.ids).some((s) => stable.has(s) && b.ids[s] != null && b.ids[s] !== '' && a.ids[s] != null && a.ids[s] !== '' && String(a.ids[s]) !== String(b.ids[s]));
}

const decide = (set, basis, confidence, evidence) => {
  const refs = [...set];
  return refs.length === 1 ? { decision: 'same', ref: refs[0], basis, confidence, evidence }
    : { decision: 'ambiguous', basis, candidates: refs.sort(), evidence };
};

/**
 * identify(record, index, opts) → one of
 *   { decision:'same',      ref, basis:'stated_id'|'history_id'|'source_record', confidence:'high', evidence }
 *   { decision:'candidate', ref, basis:'attribute', confidence:'medium', evidence:{distanceM,kind,country} }
 *   { decision:'ambiguous', basis, candidates:[refs], evidence }
 *   { decision:'new' }
 * `record` is {type,kind,country,lng,lat,ids,sourceRecords}. `index` is indexKnown(known).
 */
export function identify(record, index, opts) {
  const o = opts || {}, stable = index.stable, r = view(record);
  // tiers 1 and 2: identifiers. A stable one decides on its own; a re-issued one is only a lookup in the history.
  for (const tier of ['stable', 'reissued']) {
    const hits = new Set(); let evidence = null;
    Object.keys(r.ids).forEach((s) => {
      if (r.ids[s] == null || r.ids[s] === '' || stable.has(s) !== (tier === 'stable')) return;
      const m = index.idIx.get(s + '\u0000' + r.ids[s]); if (!m) return;
      m.forEach((ref) => { hits.add(ref); evidence = evidence || { scheme: s, value: String(r.ids[s]) }; });
    });
    if (hits.size) return decide(hits, tier === 'stable' ? 'stated_id' : 'history_id', 'high', evidence);
  }
  // tier 3: the supplier names the same source record
  const byRec = new Set(); let recEv = null;
  r.records.forEach((k) => { const m = index.recIx.get(k); if (m) m.forEach((ref) => { byRec.add(ref); recEv = recEv || { record: k.replace('\u0000', ':') }; }); });
  const okRec = new Set([...byRec].filter((ref) => !contradicts(r, index.byRef.get(ref), stable)));
  if (okRec.size) return decide(okRec, 'source_record', 'high', recEv);
  // tier 4: attributes — a candidate, never a decision
  if (placed(r) && r.type && r.kind) {
    const radius = o.radiusM > 0 ? o.radiusM : DEFAULT_RADIUS_M, near = [];
    index.list.forEach((k) => {
      if (k.type !== r.type || k.kind !== r.kind || !placed(k)) return;
      if (r.country && k.country && r.country !== k.country) return;
      if (contradicts(r, k, stable)) return;
      const d = haversineM(r, k); if (d <= radius) near.push({ ref: k.ref, d });
    });
    if (near.length === 1) return { decision: 'candidate', ref: near[0].ref, basis: 'attribute', confidence: 'medium', evidence: { distanceM: Math.round(near[0].d * 10) / 10, kind: r.kind, country: r.country || null } };
    if (near.length > 1) return { decision: 'ambiguous', basis: 'attribute', candidates: near.map((n) => n.ref).sort(), evidence: { radiusM: radius } };
  }
  return { decision: 'new' };
}

/* the fields whose change is a statement about the object; a changed NAME is a change, not an identity signal */
const TRACKED = ['name', 'kind', 'country', 'lng', 'lat', 'validFromMs', 'validToMs'];
const same = (a, b) => JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);

/** the differences between a held object and the record that matched it: changed attributes, replaced ids, added ids */
export function diffObject(held, rec) {
  const h = obj(held), r = obj(rec), changes = {};
  TRACKED.forEach((f) => { const hv = h[f] != null ? h[f] : null, rv = r[f] != null ? r[f] : null; if (r[f] !== undefined && !same(hv, rv)) changes[f] = { from: hv, to: rv }; });
  const replaced = [], added = [];
  const hi = obj(h.ids), ri = obj(r.ids);
  Object.keys(ri).forEach((s) => { if (hi[s] == null || hi[s] === '') added.push({ scheme: s, id: String(ri[s]) }); else if (String(hi[s]) !== String(ri[s])) replaced.push({ scheme: s, from: String(hi[s]), to: String(ri[s]) }); });
  const hf = obj(h.facts), rf = obj(r.facts), facts = {};
  Object.keys(rf).forEach((k) => { if (!same(hf[k], rf[k])) facts[k] = { from: hf[k] == null ? null : hf[k], to: rf[k] }; });
  return { changes, facts, replacedIds: replaced, addedIds: added, changed: !!(Object.keys(changes).length || Object.keys(facts).length || replaced.length) };
}

/**
 * reconcile(known, incoming, opts) — one refresh of a feed against what is held.
 *   known     the objects held now ({ref,type,kind,country,lng,lat,ids,facts,history,sourceRecords})
 *   incoming  the records of the new release
 *   returns   { matched:[{ref, record, basis, confidence, evidence, diff}], added:[record], gone:[known],
 *               candidates:[{record, ref, evidence}], ambiguous:[{record, candidates, basis}], stats }
 *   `gone` is what the release no longer holds under any identifier — retired by the caller, not here.
 *   stats.reissuedRate = matched objects whose re-issued id was replaced ÷ matched objects (compare to the supplier's own figure).
 */
export function reconcile(known, incoming, opts) {
  const o = opts || {}, ix = indexKnown(known, o);
  const out = { matched: [], added: [], gone: [], candidates: [], ambiguous: [], stats: {} };
  const rows = new Map(arr(known).map((k) => [k.ref, k]));
  const claimed = new Map();      // ref → record: an object two records both match is a conflict, not two matches
  const results = arr(incoming).map((rec) => ({ rec, id: identify(rec, ix, o) }));
  results.forEach((x) => { if (x.id.decision === 'same') { if (!claimed.has(x.id.ref)) claimed.set(x.id.ref, []); claimed.get(x.id.ref).push(x); } });
  results.forEach((x) => {
    const d = x.id;
    if (d.decision === 'same') {
      if (claimed.get(d.ref).length > 1) { out.ambiguous.push({ record: x.rec, candidates: [d.ref], basis: d.basis, reason: 'two incoming records resolve to one object' }); return; }
      out.matched.push({ ref: d.ref, record: x.rec, basis: d.basis, confidence: d.confidence, evidence: d.evidence, diff: diffObject(rows.get(d.ref), x.rec) });
    } else if (d.decision === 'candidate') out.candidates.push({ record: x.rec, ref: d.ref, evidence: d.evidence });
    else if (d.decision === 'ambiguous') out.ambiguous.push({ record: x.rec, candidates: d.candidates, basis: d.basis });
    else out.added.push(x.rec);
  });
  const kept = new Set(out.matched.map((m) => m.ref));
  const pending = new Set(out.candidates.map((c) => c.ref).concat(out.ambiguous.flatMap((a) => a.candidates)));
  out.gone = arr(known).filter((k) => !kept.has(k.ref) && !pending.has(k.ref));
  const reissued = out.matched.filter((m) => m.diff.replacedIds.some((r) => !ix.stable.has(r.scheme))).length;
  out.stats = { held: arr(known).length, incoming: arr(incoming).length, matched: out.matched.length, added: out.added.length, gone: out.gone.length,
    candidates: out.candidates.length, ambiguous: out.ambiguous.length, changed: out.matched.filter((m) => m.diff.changed).length,
    reissued, reissuedRate: out.matched.length ? reissued / out.matched.length : 0,
    byBasis: out.matched.reduce((a, m) => { a[m.basis] = (a[m.basis] || 0) + 1; return a; }, {}) };
  return out;
}
