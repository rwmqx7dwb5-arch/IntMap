// ============================================================================
//  IntMap · _shared/world-graph-ports.js — the PORT slice of the persistent world graph, from three upstreams
//  (docs/architecture/05-ai.md «永続の世界グラフ» · dev-notes/2026-11-20-world-graph-ports.md)
// ----------------------------------------------------------------------------
//  WHAT IT DOES. Reads what three independent sources STATE about ports and joins them by identifier — never by
//  spelling — into the rows world_graph_ingest_apply() takes:
//    Wikidata (CC0)       the port items: operator P137 / owner P127 with their periods, throughput P2957, the
//                         railway line or road a port is stated to connect to (P81 / P2789 — only targets that
//                         ARE a railway line or a road), part_of P361 (a terminal in a port), UN/LOCODE P1937,
//                         the OpenStreetMap relation P402.
//    UN/LOCODE (UNECE)    the location's name and point, and its FUNCTION FLAGS: that the location has a port (1),
//                         a rail terminal (2), a road terminal (3) … — a statement about the LOCATION, recorded as
//                         such (`facts.unlocodeFunctions`, «port, rail, road»), never as an edge to a particular line.
//    Eurostat mar_go_aa   gross weight of goods handled per port and year (thousand tonnes) — the time series
//                         Wikidata does not hold. Joined to a port by the UN/LOCODE inside Eurostat's own port code
//                         (`NL_0NLRTM` → NLRTM).
//  NOTHING HERE INFERS. A missing date stays missing; a deprecated Wikidata rank is dropped; an Eurostat port whose
//  code is not a UN/LOCODE (Antwerp-Bruges BE003, «other ports» BE888) is left out rather than guessed at; the
//  proximity of a railway to a harbour is not a tie. Two Wikidata items carrying one LOCODE are NOT merged: the
//  figures go to the one that states an operator/owner (else the lowest Q), the other keeps only what it states.
//
//  Plain ESM with no dependency and no type annotation: the Edge Function imports it, scripts/world-graph/ and the
//  node checks import it directly (an Edge Function bundle can only carry files under supabase/functions/).
// ============================================================================

export const FEED = 'ports';
export const PORT_CLASS = 'Q44782', LNG_CLASS = 'Q15709854', RAIL_CLASS = 'Q728937', HARBOUR_RAIL_CLASS = 'Q1484907', ROAD_CLASS = 'Q34442';
export const EUROSTAT_URL = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/mar_go_aa?format=JSON&lang=en&unit=THS_T&direct=TOTAL';
export const LOCODE_URL = 'https://raw.githubusercontent.com/datasets/un-locode/master/data/code-list.csv';
export const SPARQL_URL = 'https://query.wikidata.org/sparql';

/* the Wikidata queries — one per relation, because OPTIONALs in one query multiply rows (measured 2026-11-19, build-lng.mjs) */
const BASE = '?p wdt:P31/wdt:P279* wd:' + PORT_CLASS + ' .';
const LABEL = 'SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }';
const RANK = '?s wikibase:rank ?rk . FILTER(?rk != wikibase:DeprecatedRank)';
const ITEM = (v) => 'FILTER(STRSTARTS(STR(' + v + '),"http://www.wikidata.org/entity/Q"))';
export const QUERIES = {
  nodes: 'SELECT ?p ?pLabel ?ja ?coord ?cc ?inc ?lo ?osm WHERE { ' + BASE + ' FILTER(EXISTS{?p wdt:P1937 []} || EXISTS{?p wdt:P137 []} || EXISTS{?p wdt:P127 []} || EXISTS{?p wdt:P2957 []}) '
    + 'OPTIONAL{?p wdt:P625 ?coord} OPTIONAL{?p wdt:P17/wdt:P298 ?cc} OPTIONAL{?p wdt:P571 ?inc} OPTIONAL{?p wdt:P1937 ?lo} OPTIONAL{?p wdt:P402 ?osm} '
    + 'OPTIONAL{?p rdfs:label ?ja FILTER(LANG(?ja)="ja")} ' + LABEL + ' }',
  ops: 'SELECT ?p ?c ?cLabel ?from ?to WHERE { ' + BASE + ' ?p p:P137 ?s . ?s ps:P137 ?c . ' + RANK + ' ' + ITEM('?c') + ' OPTIONAL{?s pq:P580 ?from} OPTIONAL{?s pq:P582 ?to} ' + LABEL + ' }',
  owns: 'SELECT ?p ?c ?cLabel ?from ?to WHERE { ' + BASE + ' ?p p:P127 ?s . ?s ps:P127 ?c . ' + RANK + ' ' + ITEM('?c') + ' OPTIONAL{?s pq:P580 ?from} OPTIONAL{?s pq:P582 ?to} ' + LABEL + ' }',
  tp: 'SELECT ?p ?amt ?unit ?unitLabel ?at ?from ?to WHERE { ' + BASE + ' ?p p:P2957 ?s . ?s psv:P2957 ?v . ?v wikibase:quantityAmount ?amt ; wikibase:quantityUnit ?unit . ' + RANK
    + ' OPTIONAL{?s pq:P585 ?at} OPTIONAL{?s pq:P580 ?from} OPTIONAL{?s pq:P582 ?to} ' + LABEL + ' }',
  /* only a target that IS a railway line / harbour railway / road: P2789 on ports is mostly waterways (measured 2026-11-20), P81 ferry routes */
  links: 'SELECT ?p ?o ?oLabel ?cl ?ps WHERE { ' + BASE + ' { ?p wdt:P81 ?o . BIND("P81" AS ?ps) } UNION { ?p wdt:P2789 ?o . BIND("P2789" AS ?ps) } ?o wdt:P31/wdt:P279* ?cl . '
    + 'FILTER(?cl IN (wd:' + RAIL_CLASS + ', wd:' + HARBOUR_RAIL_CLASS + ', wd:' + ROAD_CLASS + ')) ' + ITEM('?o') + ' ' + LABEL + ' }',
  parts: 'SELECT ?p ?w WHERE { ?w wdt:P31/wdt:P279* wd:' + PORT_CLASS + ' . { ?p wdt:P31/wdt:P279* wd:' + PORT_CLASS + ' } UNION { ?p wdt:P31/wdt:P279* wd:' + LNG_CLASS + ' } ?p wdt:P361 ?w . FILTER(?p != ?w) }',
};

/* ---------- fetching (the Edge Function and the node script both call this with their own fetch) ---------- */
export async function sparql(fetchFn, query, ua) {
  let last = '';
  for (let i = 0; i < 3; i++) {          /* a retry only AFTER an observed 429/5xx — never to re-ask an answered question */
    const r = await fetchFn(SPARQL_URL + '?query=' + encodeURIComponent(query), { headers: { Accept: 'application/sparql-results+json', 'User-Agent': ua } });
    if (r.ok) return (await r.json()).results.bindings;
    last = 'wikidata ' + r.status;
    if (r.status !== 429 && r.status < 500) break;
    await new Promise((x) => setTimeout(x, 4000 * (i + 1)));
  }
  throw new Error(last || 'wikidata unavailable');
}
export async function fetchText(fetchFn, url, ua) {
  const r = await fetchFn(url, { headers: { 'User-Agent': ua } });
  if (!r.ok) throw new Error(url.split('/')[2] + ' ' + r.status);
  return r.text();
}
export async function fetchUpstreams(fetchFn, ua) {
  const wd = {};
  for (const k of Object.keys(QUERIES)) wd[k] = await sparql(fetchFn, QUERIES[k], ua);   /* one at a time: the public endpoint rate-limits parallel callers */
  const [eurostat, locode] = [JSON.parse(await fetchText(fetchFn, EUROSTAT_URL, ua)), await fetchText(fetchFn, LOCODE_URL, ua)];
  return { wd, eurostat, locode };
}

/* ---------- parsing ---------- */
const val = (b, k) => (b && b[k] ? b[k].value : null);
const qid = (b, k) => { const m = b && b[k] && /\/(Q\d+)$/.exec(b[k].value); return m ? m[1] : null; };
export function dayMs(v) {
  const m = v && /^(-?\d{4,})-(\d\d)-(\d\d)T/.exec(v); if (!m) return null;
  const t = Date.parse(m[1] + '-' + m[2] + '-' + m[3] + 'T00:00:00Z'); return isFinite(t) ? t : null;
}

/** one CSV line → fields (the UN/LOCODE list quotes names that hold a comma) */
export function csvFields(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}
const FUNCTIONS = { 1: 'port', 2: 'rail', 3: 'road', 4: 'airport', 5: 'postal', 6: 'multimodal', 7: 'fixed', B: 'border' };
function lonLat(s) {   /* «5155N 00417E» — degrees + minutes */
  const m = /^(\d{2})(\d{2})([NS]) (\d{3})(\d{2})([EW])$/.exec(String(s || '').trim()); if (!m) return null;
  const lat = (+m[1] + m[2] / 60) * (m[3] === 'S' ? -1 : 1), lng = (+m[4] + m[5] / 60) * (m[6] === 'W' ? -1 : 1);
  return { lng: +lng.toFixed(4), lat: +lat.toFixed(4) };
}
/** UN/LOCODE csv → Map(locode → {name, country, lng, lat, functions:[…]}); only the locations in `want` (a Set of codes) are kept */
export function parseLocode(text, want) {
  const out = new Map(); const lines = String(text || '').split(/\r?\n/); const head = csvFields(lines[0] || '');
  const ix = (n) => head.indexOf(n); const [iC, iL, iN, iF, iX] = [ix('Country'), ix('Location'), ix('Name'), ix('Function'), ix('Coordinates')];
  if ([iC, iL, iN, iF, iX].some((i) => i < 0)) throw new Error('UN/LOCODE csv: the header changed');
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue; const f = csvFields(lines[i]); const code = (f[iC] || '') + (f[iL] || '');
    if (code.length !== 5 || (want && !want.has(code))) continue;
    const fn = []; String(f[iF] || '').split('').forEach((ch) => { if (FUNCTIONS[ch]) fn.push(FUNCTIONS[ch]); });
    const p = lonLat(f[iX]); out.set(code, { name: f[iN] || '', country: f[iC], lng: p ? p.lng : null, lat: p ? p.lat : null, functions: fn });
  }
  return out;
}
/** Eurostat mar_go_aa (JSON-stat 2) → [{locode, name, year, kt}] for the codes shaped like a port (`NL_0NLRTM`); aggregates have no such shape */
export function parseEurostat(j) {
  const ids = j.id || [], sz = j.size || []; const ri = ids.indexOf('rep_mar'), ti = ids.indexOf('time');
  if (ri < 0 || ti < 0) throw new Error('Eurostat mar_go_aa: the dimensions changed');
  const rep = j.dimension.rep_mar.category, time = j.dimension.time.category;
  const reps = Object.keys(rep.index).sort((a, b) => rep.index[a] - rep.index[b]), years = Object.keys(time.index).sort((a, b) => time.index[a] - time.index[b]);
  const stride = sz.slice(ti + 1).reduce((a, b) => a * b, 1), out = [];
  reps.forEach((code, r) => {
    const m = /^[A-Z]{2}_\d([A-Z]{2}[A-Z0-9]{3})$/.exec(code); if (!m) return;
    years.forEach((y, t) => {
      /* flat index over the dimensions in order; every dimension but rep_mar and time has size 1 */
      const k = (r * years.length + t) * stride, v = j.value[k];
      if (v == null || !isFinite(+v)) return;
      out.push({ locode: m[1], name: (rep.label && rep.label[code]) || '', year: +y, kt: +v });
    });
  });
  return out;
}

/* ---------- joining ---------- */
export function build(inp) {
  const wd = inp.wd, retrieved = inp.retrieved, atlas = inp.atlasByWd || new Map(), lngRefs = inp.lngRefs || new Set();
  const lo = inp.locode || new Map(), eu = inp.eurostat || [];
  const src = (q) => [{ name: 'Wikidata', url: 'https://www.wikidata.org/wiki/' + q, licence: 'CC0' }];
  const nodes = new Map(), byLocode = new Map(), wdNode = new Map();
  const stated = new Set();   /* Q ids that state an operator / owner — the tie-break when two items carry one LOCODE */
  ['ops', 'owns'].forEach((k) => wd[k].forEach((b) => { const q = qid(b, 'p'); if (q) stated.add(q); }));
  /* ① Wikidata ports (one row per item: the query multiplies by locode × osm, so the first of each wins) */
  const seen = new Set();
  wd.nodes.forEach((b) => {
    const q = qid(b, 'p'); if (!q || seen.has(q)) return; seen.add(q);
    const label = val(b, 'pLabel'); if (!label || label === q) return;   /* an item with no label is not a thing we can name */
    const m = b.coord && /Point\((-?[\d.]+) (-?[\d.]+)\)/.exec(b.coord.value);
    const ids = { wikidata: q }; const l = val(b, 'lo'); if (l && /^[A-Z]{2}[A-Z0-9]{3}$/.test(l.replace(/\s/g, ''))) ids.unlocode = l.replace(/\s/g, '');
    const o = val(b, 'osm'); if (o && /^\d+$/.test(o)) ids.osm = 'relation/' + o;
    const names = [label]; const ja = val(b, 'ja'); if (ja && names.indexOf(ja) < 0) names.push(ja);
    const n = { ref: 'facility:wd-' + q, type: 'facility', kind: 'port', name: label, country: val(b, 'cc'), lng: m ? +m[1] : null, lat: m ? +m[2] : null, provenance: m ? 'feed_coordinate' : null,
      ids, valid_from_ms: dayMs(val(b, 'inc')), valid_to_ms: null, facts: { names }, sources: src(q) };
    nodes.set(n.ref, n); wdNode.set(q, n);
    if (ids.unlocode) { const cur = byLocode.get(ids.unlocode); if (!cur || (stated.has(q) && !stated.has(cur.ids.wikidata)) || (stated.has(q) === stated.has(cur.ids.wikidata) && +q.slice(1) < +cur.ids.wikidata.slice(1))) byLocode.set(ids.unlocode, n); }
  });
  /* the country of a port that Wikidata does not state: UN/LOCODE's prefix is ISO alpha-2 and Wikidata's P298 is alpha-3 (what every other node here carries), so
     the alpha-3 is taken from the Wikidata ports that share the prefix — and only when they all agree. No table of countries is written here. */
  const a3 = new Map(), clash = new Set();
  nodes.forEach((n) => { const p = n.ids.unlocode && n.ids.unlocode.slice(0, 2); if (!p || !n.country) return; if (a3.has(p) && a3.get(p) !== n.country) clash.add(p); else a3.set(p, n.country); });
  const country2 = (code) => { const p = code.slice(0, 2); return a3.has(p) && !clash.has(p) ? a3.get(p) : null; };
  /* ② Eurostat ports Wikidata does not know by LOCODE become nodes of their own from the UN/LOCODE record (named, placed, functions stated) */
  eu.forEach((r) => {
    if (byLocode.has(r.locode)) return; const u = lo.get(r.locode); if (!u) return;   /* a code that is no UN/LOCODE is left out */
    const n = { ref: 'facility:locode-' + r.locode, type: 'facility', kind: 'port', name: u.name || r.name, country: country2(r.locode), lng: u.lng, lat: u.lat, provenance: u.lng != null ? 'feed_coordinate' : null,
      ids: { unlocode: r.locode }, valid_from_ms: null, valid_to_ms: null, facts: { names: [u.name || r.name] }, sources: [{ name: 'UN/LOCODE', url: 'https://unece.org/trade/cefact/unlocode-code-list-country-and-territory', licence: 'UNECE, free to use' }] };
    nodes.set(n.ref, n); byLocode.set(r.locode, n);
  });
  /* the location record: functions (stated by UNECE about the LOCATION) and the names it gives; a missing point is filled from it only if the port had none */
  nodes.forEach((n) => {
    const u = n.ids.unlocode && lo.get(n.ids.unlocode); if (!u) return;
    n.facts = Object.assign({}, n.facts, { unlocodeFunctions: u.functions.join(', ') });   /* a scalar string: the page's world object keeps scalar facts only (js/atlas-geo-object.js) */
    if (u.name && n.facts.names.indexOf(u.name) < 0) n.facts.names.push(u.name);
    if (n.lng == null && u.lng != null) { n.lng = u.lng; n.lat = u.lat; n.provenance = 'feed_coordinate'; }
    if (!n.country) n.country = country2(n.ids.unlocode);
    if (n.sources.every((s) => s.name !== 'UN/LOCODE')) n.sources = n.sources.concat([{ name: 'UN/LOCODE', url: 'https://unece.org/trade/cefact/unlocode-code-list-country-and-territory', licence: 'UNECE, free to use' }]);
  });
  /* ③ edges */
  const edges = [], seenE = new Set();
  const addE = (from, rel, to, f, t, source, confidence) => { const k = [from, rel, to, f, t].join('|'); if (seenE.has(k)) return; seenE.add(k); edges.push({ from_ref: from, rel, to_ref: to, from_ms: f, to_ms: t, confidence: confidence || 'high', source, retrieved }); };
  const company = (q, name) => {
    const a = atlas.get(q), ref = a ? 'company:' + a.id : 'company:wd-' + q;
    if (!nodes.has(ref)) nodes.set(ref, { ref, type: 'company', kind: 'company', name: a ? a.n : name, country: a ? a.cc : null, lng: null, lat: null, provenance: null, ids: Object.assign({ wikidata: q }, a ? { company: a.id } : null), valid_from_ms: null, valid_to_ms: null, facts: {}, sources: src(q) });
    return ref;
  };
  [['ops', 'operated_by'], ['owns', 'owned_by']].forEach(([k, rel]) => wd[k].forEach((b) => {
    const p = qid(b, 'p'), c = qid(b, 'c'); if (!p || !c || !wdNode.has(p)) return;
    addE('facility:wd-' + p, rel, company(c, val(b, 'cLabel')), dayMs(val(b, 'from')), dayMs(val(b, 'to')), 'Wikidata ' + p);
  }));
  wd.links.forEach((b) => {
    const p = qid(b, 'p'), o = qid(b, 'o'); if (!p || !o || !wdNode.has(p)) return;
    const road = qid(b, 'cl') === ROAD_CLASS, ref = 'facility:wd-' + o;
    if (!nodes.has(ref)) nodes.set(ref, { ref, type: 'facility', kind: road ? 'road' : 'railway line', name: val(b, 'oLabel') || o, country: null, lng: null, lat: null, provenance: null, ids: { wikidata: o }, valid_from_ms: null, valid_to_ms: null, facts: {}, sources: src(o) });
    addE('facility:wd-' + p, 'connected_to', ref, null, null, 'Wikidata ' + p + ' (' + val(b, 'ps') + ')');
  });
  wd.parts.forEach((b) => {
    const p = qid(b, 'p'), w = qid(b, 'w'); if (!p || !w || !wdNode.has(w)) return;
    if (!wdNode.has(p) && !lngRefs.has('facility:wd-' + p)) return;     /* a part must itself be a node here or in the LNG slice */
    addE('facility:wd-' + p, 'part_of', 'facility:wd-' + w, null, null, 'Wikidata ' + p);
  });
  /* ④ claims: Wikidata throughput as stated (unit kept), Eurostat per year */
  const claims = [], seenC = new Set();
  const addC = (c) => { const k = [c.ref, c.key, c.from_ms, c.to_ms, c.source].join('|'); if (seenC.has(k) || !isFinite(c.value)) return; seenC.add(k); claims.push(Object.assign({ retrieved }, c)); };
  wd.tp.forEach((b) => {
    const p = qid(b, 'p'); if (!p || !wdNode.has(p)) return; const at = dayMs(val(b, 'at')), u = qid(b, 'unit');
    addC({ ref: 'facility:wd-' + p, key: 'throughput', value: +val(b, 'amt'), unit: u ? (val(b, 'unitLabel') || u) : '1', from_ms: at != null ? at : dayMs(val(b, 'from')), to_ms: at != null ? at : dayMs(val(b, 'to')), source: 'Wikidata ' + p });
  });
  eu.forEach((r) => {
    const n = byLocode.get(r.locode); if (!n) return;
    addC({ ref: n.ref, key: 'cargo_handled', value: r.kt, unit: 'thousand tonnes', from_ms: Date.UTC(r.year, 0, 1), to_ms: Date.UTC(r.year, 11, 31), source: 'Eurostat mar_go_aa' });
  });
  /* an isolated, unplaced port with nothing stated carries nothing a reader could ask — drop it (a port needs a tie, a claim, a LOCODE function list, or a point) */
  const touched = new Set(edges.map((e) => e.from_ref).concat(edges.map((e) => e.to_ref), claims.map((c) => c.ref)));
  [...nodes.keys()].forEach((r) => { const n = nodes.get(r); if (n.kind === 'port' && !touched.has(r) && n.lng == null && !n.facts.unlocodeFunctions) nodes.delete(r); });
  return { nodes: [...nodes.values()], edges: edges.filter((e) => nodes.has(e.from_ref) || lngRefs.has(e.from_ref)), claims: claims.filter((c) => nodes.has(c.ref)) };
}

export const UA = 'IntMap-world-graph-ports/1.0 (+https://github.com/rwmqx7dwb5-arch/IntMap)';
