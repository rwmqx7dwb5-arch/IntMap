/* ============================================================================
 *  IntMap · logistics network — BUILD  (ports + rail + cities + factories  →  data/logistics-network.json)
 * ----------------------------------------------------------------------------
 *  node scripts/logistics/build.mjs [--ports file.json] [--write] [--report]
 *    --ports   the output of `node scripts/world-graph/ingest-ports.mjs --dry --out file.json` (otherwise the three
 *              upstreams are fetched with the same code — Wikidata, Eurostat mar_go_aa, UN/LOCODE; about 5 minutes)
 *    --write   write data/logistics-network.json (otherwise only print what would be written)
 *
 *  WHAT IT ANSWERS: for every city of >= 100,000 people (GeoNames) and every factory-type site of the company atlas,
 *  which ports can it reach BY RAIL, how far, and in what order — so «this port stops» has a measured answer: who loses
 *  their nearest port, which port is next, and how much further.
 *
 *  ⚠ WHAT IT DOES NOT CLAIM. It is reachability over OpenStreetMap track geometry, not an observed freight flow: gauge,
 *    electrification, track capacity and operators are not constraints; a road leg and a barge leg are not in it. The
 *    ports it ranks are the ones that STATE cargo evidence (Eurostat tonnes, a Wikidata throughput) or a UN/LOCODE rail
 *    terminal; outside the Eurostat area a port's capacity is unknown and the file says null, not a guess.
 *  ⚠ THE MODEL PARAMETERS ARE WRITTEN INTO THE FILE (`model`), because an answer that omits them reads as a fact.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { OPENSTREETMAP } from '../lib/upstream-cadence.mjs';
import { agreeOrRefuse } from '../lib/gov-stamp.mjs';
import { makeCoast } from './coast.mjs';
import { buildRailGraph, components, nearestSources, hav } from './rail-graph.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'data', 'logistics-network.json');
const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? null : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const TODAY = new Date().toISOString().slice(0, 10);

/* ── the model parameters (written into the file) ─────────────────────────────────────────────────────────────────
   Each: what it is, how it was chosen, what invalidates it. None of them is an observation of freight.            */
export const MODEL = {
  /* A chain END within this of another chain's segment is a junction. Observed 2026-11-20: the shipped cells are
     simplified at 0.0012 deg (~133 m) — a junction vertex on a through-line moves by up to that; 200 m covers it with
     margin. Expires if scripts/rail/build.mjs CELL_TOL changes. */
  junctionSnapM: 200,
  /* A port / city / factory is attached to track only if some track lies within this. Chosen as the distance at which a
     station or siding is plausibly "the city's" or "the port's"; not measured. Entities beyond it are left UNASSIGNED
     and counted — never attached to the nearest line however far. Expires: never (a stated reading of «has rail access»). */
  portAccessKm: 10, cityAccessKm: 25, factoryAccessKm: 10,
  /* A port or entity further than this by rail from every port is out of the catchment (a continental land route of
     this length is not a «nearest port» relation). Chosen, not measured. */
  maxRailKm: 2500,
  /* how many ports are kept per entity: the first is the nearest, the rest are what it falls back on when that one stops */
  keep: 3,
  minCityPopulation: 100000,
  /* A port is OCEAN-FACING if it lies within this STRAIGHT-LINE distance of the ocean coast (Natural Earth 1:10m). Observed
     2026-11-20: Eurostat's maritime table also lists river ports with token tonnage (Frankfurt am Main 1 kt, Berlin 24 kt,
     Hanau 1 kt), so «has Eurostat cargo» does not mean «a ship reaches it». Chosen, not measured: 120 km keeps the estuary
     ports (Hamburg, Antwerp, Bremen, Houston, Guangzhou are all inside it) and drops river ports 140+ km inland (Berlin 144,
     Frankfurt 337). Duisburg-class inland ports are therefore out: this file is about ports a SEA route reaches.
     Expires: never — it is the stated reading of «ocean-facing». */
  seaAccessKm: 120,
};
/* Wikidata classes whose statement says «not a commercial seaport». A port item that states one of these is excluded
   unless Eurostat reports maritime cargo for it (a statement of cargo outranks a class). Retrieved 2026-11-20 from the
   class counts of wd:Q44782's subtree (inland port 480, fishing port 2,129, marina 864, naval base 309, ...). */
const NON_COMMERCIAL = { Q863915: 'inland port', Q1420027: 'fishing port', Q721207: 'marina', Q1324633: 'naval base', Q13065566: 'former port', Q3398414: 'ancient port', Q16938673: 'landing', Q331367: 'submarine base', Q1745026: 'naval arsenal', Q10512405: 'guest harbor' };
async function nonCommercial() {
  const q = 'SELECT DISTINCT ?p ?c WHERE { VALUES ?c { ' + Object.keys(NON_COMMERCIAL).map((x) => 'wd:' + x).join(' ') + ' } ?p wdt:P31 ?c . }';
  for (let i = 0; i < 3; i++) {
    const r = await fetch('https://query.wikidata.org/sparql?query=' + encodeURIComponent(q), { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'IntMap-logistics-build/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap)' } });
    if (r.ok) { const m = new Map(); (await r.json()).results.bindings.forEach((b) => m.set(b.p.value.split('/').pop(), NON_COMMERCIAL[b.c.value.split('/').pop()])); return m; }
    if (r.status !== 429 && r.status < 500) throw new Error('wikidata ' + r.status);
    await new Promise((x) => setTimeout(x, 4000 * (i + 1)));
  }
  throw new Error('wikidata unavailable');
}
const INDUSTRIAL = ['factory', 'assembly_plant', 'refinery', 'smelter', 'brewery', 'shipyard', 'mine', 'power_plant'];

export const GOVERNANCE = {
  'data/logistics-network.json': {
    publisher: 'OpenStreetMap contributors (rail) · Wikidata, Eurostat, UNECE (ports) · GeoNames (cities) · company atlas (factories)',
    url: 'https://www.openstreetmap.org/copyright',
    licence: 'ODbL 1.0',
    licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    attribution: true,
    ...OPENSTREETMAP,
    retrievedAt: '2026-11-20',
    generatedAt: '2026-11-20',
    asOf: '2026-11-20',
    schema: 'scripts/logistics/build.mjs (ports · entities) — read by js/logistics-impact.js (the Atlas capability research.portImpact) and tests/logistics-network-checks.test.mjs',
    quality: { rows: 984, missing: { ref: 0, name: 0, lng: 0, lat: 0 }, outOfRange: { lng: 0, lat: 0 }, duplicates: 0 },
    paidBy: 'Port hinterlands — rail reachability from OpenStreetMap rail, ports (Wikidata CC0, Eurostat mar_go_aa CC BY 4.0, UN/LOCODE), cities (GeoNames CC BY 4.0) and company-atlas factory sites',
    builtBy: 'scripts/logistics/build.mjs',
  },
};

const QUALITY_OPTS = { fields: { ref: {}, name: {}, lng: { min: -180, max: 180 }, lat: { min: -90, max: 90 } }, key: ['ref'] };
const readGz = (p) => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)));

/* ── rail chains from the shipped 5-degree cells ── */
function loadChains() {
  const dir = path.join(ROOT, 'data', 'railways', 'c');
  const chains = []; let skipped = {};
  for (const f of fs.readdirSync(dir)) {
    const e = readGz(path.join(dir, f));
    for (const a of e.l) {
      const t = e.d[a[0]];
      const cls = t[0], use = t[10];
      if (cls !== 'rail' && cls !== 'narrow_gauge') { skipped[cls] = (skipped[cls] || 0) + 1; continue; } /* heavy rail only: not urban, not under construction */
      if (use === 'tourism' || use === 'military' || use === 'test') { skipped[use] = (skipped[use] || 0) + 1; continue; }
      const n = (a.length - 2) / 2; if (n < 2) continue;
      const xs = new Float64Array(n), ys = new Float64Array(n); let x = 0, y = 0;
      for (let j = 2, i = 0; j < a.length; j += 2, i++) { x += a[j]; y += a[j + 1]; xs[i] = x / e.s; ys[i] = y / e.s; }
      chains.push({ id: a[1], xs, ys });
    }
  }
  return { chains, skipped };
}

async function loadPorts() {
  const f = arg('--ports');
  let g;
  if (typeof f === 'string') g = JSON.parse(fs.readFileSync(f, 'utf8')).g;
  else {
    const { fetchUpstreams, parseEurostat, parseLocode, build, UA } = await import('../../supabase/functions/_shared/world-graph-ports.js');
    const up = await fetchUpstreams(fetch, UA);
    const eurostat = parseEurostat(up.eurostat);
    const want = new Set(eurostat.map((r) => r.locode));
    up.wd.nodes.forEach((b) => { if (b.lo) want.add(b.lo.value.replace(/\s/g, '')); });
    const locode = parseLocode(up.locode, want);
    const atlas = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'companies', 'index.json'), 'utf8')).companies;
    const lng = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'world-graph-lng.json'), 'utf8'));
    g = build({ wd: up.wd, eurostat, locode, atlasByWd: new Map(atlas.filter((c) => c.wd).map((c) => [c.wd, c])), lngRefs: new Set(lng.nodes.map((n) => n.ref)), retrieved: new Date().toISOString() });
  }
  return g;
}

/** the latest stated cargo figure of a port, and where it comes from (null when the sources state none) */
function capacityOf(claims) {
  let best = null;
  for (const c of claims) {
    if (c.key !== 'cargo_handled' && c.key !== 'throughput') continue;
    if (!(c.value > 0)) continue;
    const yr = c.from_ms != null ? new Date(c.from_ms).getUTCFullYear() : null;
    const rank = (c.key === 'cargo_handled' ? 1 : 0) * 1e6 + (yr || 0);
    if (!best || rank > best.rank) best = { rank, key: c.key, value: c.value, unit: c.unit, year: yr, source: c.source };
  }
  return best && { key: best.key, value: best.value, unit: best.unit, year: best.year, source: best.source };
}

async function main() {
  const t0 = Date.now(); const log = (...a) => console.error(((Date.now() - t0) / 1000).toFixed(0) + 's', ...a);
  const g = await loadPorts();
  const byRef = new Map(); g.claims.forEach((c) => { (byRef.get(c.ref) || byRef.set(c.ref, []).get(c.ref)).push(c); });
  const ports = [];
  let noCoord = 0, noEvidence = 0, nonComm = 0, inland = 0;
  const nc = await nonCommercial(), coast = makeCoast(path.join(ROOT, 'data', 'coastline.json.gz'));
  for (const n of g.nodes) {
    if (n.kind !== 'port') continue;
    if (!Number.isFinite(n.lng) || !Number.isFinite(n.lat)) { noCoord++; continue; }
    const cap = capacityOf(byRef.get(n.ref) || []);
    const rail = String((n.facts && n.facts.unlocodeFunctions) || '').split(/,\s*/).includes('rail');
    if (!cap && !rail && !(n.ids && n.ids.unlocode)) { noEvidence++; continue; }
    const hasCargo = !!(cap && cap.key === 'cargo_handled');
    const klass = n.ids && nc.get(n.ids.wikidata);
    if (klass && !hasCargo) { nonComm++; continue; }
    const coastKm = coast.distKm(n.lng, n.lat);
    if (coastKm > MODEL.seaAccessKm) { inland++; continue; }
    ports.push({ ref: n.ref, name: n.name, names: (n.facts && n.facts.names) || [], cc: n.country || null, lng: n.lng, lat: n.lat, locode: (n.ids && n.ids.unlocode) || null, wikidata: (n.ids && n.ids.wikidata) || null, railTerminal: rail, capacity: cap, coastKm: +coastKm.toFixed(1) });
  }
  log('ports kept', ports.length, 'non-commercial class', nonComm, 'beyond ' + MODEL.seaAccessKm + ' km of the ocean', inland, 'no coordinate', noCoord, 'no cargo/rail evidence', noEvidence);

  const { chains, skipped } = loadChains();
  log('rail chains', chains.length, 'excluded', JSON.stringify(skipped));
  const G0 = buildRailGraph(chains, { snapM: MODEL.junctionSnapM });

  /* entities */
  const gz = readGz(path.join(ROOT, 'data', 'gazetteer-world.json.gz'));
  const F = Object.fromEntries(gz.fields.map((k, i) => [k, i]));
  const entities = [];
  for (const r of gz.rows) {
    if (!(r[F.pop] >= MODEL.minCityPopulation)) continue;
    entities.push({ kind: 'city', name: r[F.en], nameJa: r[F.ja] || null, cc: r[F.iso2] || null, lng: r[F.lng], lat: r[F.lat], population: r[F.pop], gid: r[F.gid] });
  }
  const cities = entities.length;
  const fp = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'companies', 'footprint.json'), 'utf8'));
  const typeIdx = new Set(INDUSTRIAL.map((t) => fp.types.indexOf(t)).filter((i) => i >= 0));
  for (const r of fp.f) {
    if (!typeIdx.has(r[1])) continue;
    entities.push({ kind: 'factory', siteType: fp.types[r[1]], company: fp.companies[r[0]], name: r[7], cc: r[4], lng: r[2], lat: r[3] });
  }
  log('entities', entities.length, '(cities', cities + ', industrial sites', entities.length - cities + ')');

  /* attach */
  const attachedPorts = [];
  const sources = [];
  ports.forEach((p, i) => { const a = G0.attach(p.lng, p.lat, MODEL.portAccessKm * 1000); if (a) { p.accessKm = +(a.m / 1000).toFixed(2); sources.push({ node: a.node, src: i, startKm: a.m / 1000 }); attachedPorts.push(i); } });
  const attEnt = entities.map((e) => { const a = G0.attach(e.lng, e.lat, (e.kind === 'city' ? MODEL.cityAccessKm : MODEL.factoryAccessKm) * 1000); return a ? { node: a.node, m: a.m } : null; });
  const graph = G0.finish();
  log('graph', graph.n, 'nodes', graph.edges, 'edges', JSON.stringify(G0.stats()), 'ports on rail', attachedPorts.length);
  const comp = components(graph);
  log('components', comp.size.length, 'largest', Math.max(...comp.size));

  const have = nearestSources(graph, sources, MODEL.keep, MODEL.maxRailKm);
  const out = []; let assigned = 0, noRail = 0, noPort = 0;
  entities.forEach((e, i) => {
    const a = attEnt[i];
    if (!a) { noRail++; return; }
    const l = have[a.node];
    if (!l || !l.length) { noPort++; return; }
    const acc = a.m / 1000;
    out.push({ ...e, accessKm: +acc.toFixed(2), ports: l.map(([src, km]) => [src, +(km + acc).toFixed(1)]) });
    assigned++;
  });
  log('assigned', assigned, 'no rail within access', noRail, 'rail but no port reachable', noPort);

  /* the ports that actually carry a hinterland keep their index; others are dropped from the file so the table is what the answers use */
  const used = new Map(); const keep = [];
  const remap = (i) => { if (!used.has(i)) { used.set(i, keep.length); keep.push(i); } return used.get(i); };
  out.forEach((e) => { e.ports = e.ports.map(([s, km]) => [remap(s), km]); });
  /* every port on rail stays in the table (a port with no hinterland is a fact: nothing reaches it); remap after */
  attachedPorts.forEach(remap);
  const portTable = keep.map((i) => { const p = ports[i]; return { ref: p.ref, name: p.name, names: p.names, cc: p.cc, lng: p.lng, lat: p.lat, locode: p.locode, wikidata: p.wikidata, railTerminal: p.railTerminal, coastKm: p.coastKm, accessKm: p.accessKm, capacity: p.capacity }; });
  const hist = {}; for (const p of portTable) { const b = p.accessKm <= 2 ? '<=2' : p.accessKm <= 5 ? '<=5' : p.accessKm <= 10 ? '<=10' : p.accessKm <= 20 ? '<=20' : p.accessKm <= 40 ? '<=40' : '<=60'; hist[b] = (hist[b] || 0) + 1; }
  log('port distance to rail (km, count)', JSON.stringify(hist));
  const notOnRail = ports.filter((_, i) => attachedPorts.indexOf(i) < 0).length;

  const decl = GOVERNANCE['data/logistics-network.json'];
  const doc = {
    publisher: decl.publisher, url: decl.url, licence: decl.licence, licenceUrl: decl.licenceUrl, attribution: decl.attribution,
    cadence: decl.cadence, cadenceBasis: decl.cadenceBasis, retrievedAt: decl.retrievedAt, generatedAt: decl.generatedAt, asOf: decl.asOf,
    schema: decl.schema, quality: decl.quality, builtBy: decl.builtBy,
    sources: [
      { role: 'rail', name: 'OpenStreetMap rail (data/railways)', licence: 'ODbL 1.0', url: 'https://www.openstreetmap.org/copyright' },
      { role: 'ports', name: 'Wikidata', licence: 'CC0 1.0', url: 'https://www.wikidata.org/' },
      { role: 'port cargo', name: 'Eurostat mar_go_aa', licence: 'CC BY 4.0', url: 'https://ec.europa.eu/eurostat/databrowser/view/mar_go_aa/' },
      { role: 'port functions', name: 'UN/LOCODE (UNECE)', licence: 'UNECE, free to use', url: 'https://unece.org/trade/cefact/unlocode-code-list-country-and-territory' },
      { role: 'cities', name: 'GeoNames cities1000', licence: 'CC BY 4.0', url: 'https://www.geonames.org/' },
      { role: 'factories', name: 'IntMap company atlas (Wikidata, OpenStreetMap)', licence: 'CC0 / ODbL', url: 'data/companies/' },
    ],
    model: { ...MODEL, kind: 'rail reachability over OpenStreetMap geometry — not an observed freight flow; track gauge, electrification, capacity and operator are not constraints', industrialTypes: INDUSTRIAL },
    coverage: {
      portsListed: portTable.length, portsOnRail: attachedPorts.length, portsWithoutRailWithinAccess: notOnRail, portDistanceToRailKm: hist, portsDroppedNoCoordinate: noCoord, portsDroppedNoCargoOrRailEvidence: noEvidence, portsDroppedNonCommercialClass: nonComm, portsDroppedBeyondSeaAccess: inland,
      railChains: chains.length, railChainsExcluded: skipped, railGraph: { nodes: graph.n, edges: graph.edges, components: comp.size.length, junctionsJoined: G0.stats().junctions },
      entities: { cities, industrialSites: entities.length - cities, assigned, withoutRailWithinAccess: noRail, railButNoPortReachable: noPort },
    },
    ports: portTable,
    entities: out.map((e) => ({ k: e.kind === 'city' ? 'c' : 'f', n: e.name, ja: e.nameJa || undefined, cc: e.cc, x: +e.lng.toFixed(4), y: +e.lat.toFixed(4), p: e.population || undefined, co: e.company || undefined, st: e.siteType || undefined, a: e.accessKm, r: e.ports })),
  };
  /* the declared provenance must be what was just measured on the port rows (scripts/lib/gov-stamp.mjs); a rebuild on another day restates it */
  if (arg('--write')) agreeOrRefuse(decl, portTable, QUALITY_OPTS, TODAY);
  if (arg('--report') || !arg('--write')) console.log(JSON.stringify({ coverage: doc.coverage, sample: doc.entities.slice(0, 3), bytes: JSON.stringify(doc).length }, null, 1));
  if (arg('--write')) {
    fs.writeFileSync(OUT, JSON.stringify(doc) + '\n');
    log('wrote', OUT, fs.statSync(OUT).size, 'bytes');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
