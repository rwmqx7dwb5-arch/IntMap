/* ============================================================================
 *  IntMap · world-graph — build the LNG-terminal slice of the persistent world graph from Wikidata
 * ----------------------------------------------------------------------------
 *  node scripts/world-graph/build-lng.mjs           fetch, write data/world-graph-lng.json (+ print the counts)
 *  node scripts/world-graph/build-lng.mjs --sql     also (re)write the seed migration from that snapshot
 *
 *  WHAT IT READS (all from Wikidata, CC0; one SPARQL query per relation, because OPTIONALs in one query
 *  multiply rows — 69 rows for 59 terminals with 6 owners each, measured 2026-11-19):
 *    nodes   every item whose class is LNG terminal (Q15709854) or a subclass: id, label, P625 point,
 *            country (P17 → P298 ISO alpha-3), inception P571
 *    edges   operated_by  <- P137 with its own P580/P582 period      owned_by <- P127 (+ period)
 *    claims  throughput   <- P2957 with unit and P585 point in time  (units kept as Wikidata states them)
 *  An operator / owner becomes a `company` node. When the IntMap company atlas holds that Wikidata id the
 *  node IS the atlas company (`company:<atlas id>`), so the company's own sites (the atlas profiles) join the
 *  walk by identifier, not by spelling.
 *  A statement is kept only when it states what it says: a missing date stays missing, a deprecated rank is
 *  dropped, a "somevalue/novalue" object is dropped. Nothing is inferred.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WIKIDATA } from '../lib/upstream-cadence.mjs';
import { agreeOrRefuse } from '../lib/gov-stamp.mjs';

/* data-governance declaration (npm run check:datagov): the snapshot is Wikidata's statements, CC0 — public domain, no credit condition.
   Its cadence is Wikidata's (scripts/lib/upstream-cadence.mjs). */
export const GOVERNANCE = {
  'data/world-graph-lng.json': {
    publisher: 'Wikidata', url: 'https://query.wikidata.org/sparql', licence: 'CC0 1.0', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: false,
    ...WIKIDATA,
    /* LITERALS THE GATE READS WITHOUT RUNNING THIS FILE; the write below refuses a bundle that disagrees with them
       (scripts/lib/gov-stamp.mjs) — a rebuild on another day restates them here. quality is measured on nodes[]. */
    retrievedAt: '2026-11-19',
    generatedAt: '2026-11-19',
    asOf: '2026-11-19',
    schema: 'scripts/world-graph/build-lng.mjs (nodes · edges · claims) — read by tests/world-graph-persistent-checks.test.mjs and the seed supabase/migrations/20261119150100_world_graph_lng_seed.sql; js/world-graph-store.js reads the same rows from the database',
    quality: { rows: 102, missing: { ref: 0, type: 0, name: 0 }, outOfRange: {}, duplicates: 0 },
    builtBy: 'scripts/world-graph/build-lng.mjs',
  },
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'data', 'world-graph-lng.json');
const MIG = path.join(ROOT, 'supabase', 'migrations', '20261119150100_world_graph_lng_seed.sql');
const UA = 'IntMap-world-graph-build/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap)';
const CLASS = 'Q15709854';

async function sparql(q) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch('https://query.wikidata.org/sparql?query=' + encodeURIComponent(q), { headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA } });
    if (r.ok) return (await r.json()).results.bindings;
    if (r.status !== 429 && r.status < 500) throw new Error('wikidata ' + r.status);
    await new Promise((x) => setTimeout(x, 4000 * (i + 1)));
  }
  throw new Error('wikidata unavailable');
}
const qid = (u) => ((u && /\/(Q\d+)$/.exec(u.value)) || [])[1] || null;
const val = (b, k) => (b[k] ? b[k].value : null);
const ms = (v) => {
  if (!v) return null;
  const m = /^(-?\d{4,})-(\d\d)-(\d\d)T/.exec(v); if (!m) return null;
  const t = Date.parse(m[1] + '-' + m[2] + '-' + m[3] + 'T00:00:00Z');
  return isFinite(t) ? t : null;
};
/* importing this file (the data-governance gate reads GOVERNANCE) must not call Wikidata or write files */
async function main() {
const base = '?t wdt:P31/wdt:P279* wd:' + CLASS + ' .';
const label = 'SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ja". }';
const rankOk = '?s wikibase:rank ?rk . FILTER(?rk != wikibase:DeprecatedRank)';
const isItem = (v) => 'FILTER(STRSTARTS(STR(' + v + '),"http://www.wikidata.org/entity/Q"))';

const Q = {
  nodes: 'SELECT ?t ?tLabel ?coord ?cc ?inc WHERE { ' + base + ' OPTIONAL{?t wdt:P625 ?coord} OPTIONAL{?t wdt:P17/wdt:P298 ?cc} OPTIONAL{?t wdt:P571 ?inc} ' + label + ' }',
  ops: 'SELECT ?t ?c ?cLabel ?from ?to WHERE { ' + base + ' ?t p:P137 ?s . ?s ps:P137 ?c . ' + rankOk + ' ' + isItem('?c') + ' OPTIONAL{?s pq:P580 ?from} OPTIONAL{?s pq:P582 ?to} ' + label + ' }',
  owns: 'SELECT ?t ?c ?cLabel ?from ?to WHERE { ' + base + ' ?t p:P127 ?s . ?s ps:P127 ?c . ' + rankOk + ' ' + isItem('?c') + ' OPTIONAL{?s pq:P580 ?from} OPTIONAL{?s pq:P582 ?to} ' + label + ' }',
  tp: 'SELECT ?t ?amt ?unit ?unitLabel ?at ?from ?to WHERE { ' + base + ' ?t p:P2957 ?s . ?s psv:P2957 ?v . ?v wikibase:quantityAmount ?amt ; wikibase:quantityUnit ?unit . ' + rankOk + ' OPTIONAL{?s pq:P585 ?at} OPTIONAL{?s pq:P580 ?from} OPTIONAL{?s pq:P582 ?to} ' + label + ' }',
};

const [nodesR, opsR, ownsR, tpR] = [await sparql(Q.nodes), await sparql(Q.ops), await sparql(Q.owns), await sparql(Q.tp)];

const atlas = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'companies', 'index.json'), 'utf8')).companies;
const atlasByWd = new Map(atlas.filter((c) => c.wd).map((c) => [c.wd, c]));

const nodes = new Map(), edges = [], claims = [];
const retrieved = new Date().toISOString().slice(0, 10);
const src = (q) => [{ name: 'Wikidata', url: 'https://www.wikidata.org/wiki/' + q, licence: 'CC0' }];
function addCompany(q, name) {
  const a = atlasByWd.get(q), ref = a ? 'company:' + a.id : 'company:wd-' + q;
  if (!nodes.has(ref)) nodes.set(ref, { ref, type: 'company', kind: 'company', name: a ? a.n : name, country: a ? a.cc : null, lng: null, lat: null, provenance: null, ids: Object.assign({ wikidata: q }, a ? { company: a.id } : null), validFromMs: null, validToMs: null, facts: {}, sources: src(q) });
  return ref;
}
const term = new Set();
nodesR.forEach((b) => {
  const q = qid(b.t); if (!q || term.has(q)) return; term.add(q);
  const m = b.coord && /Point\((-?[\d.]+) (-?[\d.]+)\)/.exec(b.coord.value);
  const lbl = val(b, 'tLabel'); if (!lbl || lbl === q) return;           /* an item with no label is not a thing we can name */
  nodes.set('facility:wd-' + q, { ref: 'facility:wd-' + q, type: 'facility', kind: 'LNG terminal', name: lbl, country: val(b, 'cc'),
    lng: m ? +m[1] : null, lat: m ? +m[2] : null, provenance: m ? 'feed_coordinate' : null, ids: { wikidata: q }, validFromMs: ms(val(b, 'inc')), validToMs: null, facts: {}, sources: src(q) });
});
const have = (q) => nodes.has('facility:wd-' + q);
const seenE = new Set();
function addEdges(rows, rel) {
  rows.forEach((b) => {
    const t = qid(b.t), c = qid(b.c); if (!t || !c || !have(t)) return;
    const cref = addCompany(c, val(b, 'cLabel'));
    const e = { from: 'facility:wd-' + t, rel, to: cref, fromMs: ms(val(b, 'from')), toMs: ms(val(b, 'to')), confidence: 'high', source: 'Wikidata ' + t, retrieved };
    const k = [e.from, e.rel, e.to, e.fromMs, e.toMs].join('|'); if (seenE.has(k)) return; seenE.add(k); edges.push(e);
  });
}
addEdges(opsR, 'operated_by'); addEdges(ownsR, 'owned_by');
const seenC = new Set();
tpR.forEach((b) => {
  const t = qid(b.t); if (!t || !have(t)) return;
  const unitQ = qid(b.unit), unit = unitQ ? (val(b, 'unitLabel') || unitQ) : '1';
  const at = ms(val(b, 'at'));
  const c = { ref: 'facility:wd-' + t, key: 'throughput', value: +val(b, 'amt'), unit, fromMs: at != null ? at : ms(val(b, 'from')), toMs: at != null ? at : ms(val(b, 'to')), source: 'Wikidata ' + t, retrieved };
  if (!isFinite(c.value)) return;
  const k = [c.ref, c.value, c.unit, c.fromMs, c.toMs].join('|'); if (seenC.has(k)) return; seenC.add(k); claims.push(c);
});
/* keep terminals that take part in at least one stated relation or value — an isolated node is no graph */
const used = new Set(edges.map((e) => e.from).concat(claims.map((c) => c.ref)));
[...nodes.keys()].filter((r) => r.startsWith('facility:') && !used.has(r)).forEach((r) => nodes.delete(r));
const g = agreeOrRefuse(GOVERNANCE['data/world-graph-lng.json'], [...nodes.values()], { fields: { ref: {}, type: {}, name: {} }, key: ['ref'] }, retrieved);
const out = { ...g, class: CLASS, nodes: [...nodes.values()], edges, claims };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log('nodes', out.nodes.length, '(facility', out.nodes.filter((n) => n.type === 'facility').length, 'company', out.nodes.filter((n) => n.type === 'company').length, 'atlas-joined', out.nodes.filter((n) => n.ids.company).length + ')', 'edges', edges.length, 'claims', claims.length);

if (process.argv.includes('--sql')) {
  const q = (v) => (v == null ? 'null' : "'" + String(v).replace(/'/g, "''") + "'");
  const j = (v) => q(JSON.stringify(v)) + '::jsonb';
  const n0 = (v) => (v == null ? 'null' : v);
  let s = '-- ============================================================================\n'
    + '--  IntMap · world graph — SEED: the LNG-terminal slice (generated by scripts/world-graph/build-lng.mjs, do not edit)\n'
    + '--  Source: Wikidata (CC0), retrieved ' + retrieved + '. Every statement is idempotent.\n'
    + '--  ' + out.nodes.length + ' nodes · ' + edges.length + ' edges · ' + claims.length + ' claims\n'
    + '-- ============================================================================\n';
  out.nodes.forEach((n) => {
    s += 'insert into public.world_graph_nodes (ref,type,kind,name,country,lng,lat,provenance,ids,valid_from_ms,valid_to_ms,facts,sources) values ('
      + [q(n.ref), q(n.type), q(n.kind), q(n.name), q(n.country), n0(n.lng), n0(n.lat), q(n.provenance), j(n.ids), n0(n.validFromMs), n0(n.validToMs), j(n.facts), j(n.sources)].join(',')
      + ') on conflict (ref) do update set name=excluded.name,country=excluded.country,lng=excluded.lng,lat=excluded.lat,provenance=excluded.provenance,ids=excluded.ids,valid_from_ms=excluded.valid_from_ms,sources=excluded.sources,updated_at=now();\n';
  });
  edges.forEach((e) => {
    s += 'insert into public.world_graph_edges (from_ref,rel,to_ref,from_ms,to_ms,confidence,source,retrieved) values ('
      + [q(e.from), q(e.rel), q(e.to), n0(e.fromMs), n0(e.toMs), q(e.confidence), q(e.source), q(e.retrieved)].join(',') + ') on conflict do nothing;\n';
  });
  claims.forEach((c) => {
    s += 'insert into public.world_graph_claims (ref,key,value,unit,from_ms,to_ms,source,retrieved) values ('
      + [q(c.ref), q(c.key), c.value, q(c.unit), n0(c.fromMs), n0(c.toMs), q(c.source), q(c.retrieved)].join(',') + ') on conflict do nothing;\n';
  });
  fs.writeFileSync(MIG, s);
  console.log('wrote', path.relative(ROOT, MIG));
}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });
