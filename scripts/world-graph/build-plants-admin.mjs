#!/usr/bin/env node
/* ============================================================================
 *  IntMap · world graph — SEED: administrative areas (countries) and nuclear power plants, tied by identifier
 *  node scripts/world-graph/build-plants-admin.mjs --sql    rewrite supabase/migrations/20261125100000_world_graph_plants_admin_seed.sql
 * ----------------------------------------------------------------------------
 *  TWO NEW DOMAINS and the ties that join them to the LNG slice already in the graph. All of it from data the
 *  repository already holds — no network:
 *    admin   data/ne-countries (Natural Earth admin-0, public domain): the areas, each with the identifiers it states
 *            (ISO 3166-1 alpha-2 / alpha-3, Wikidata id, Natural Earth id).
 *    plants  data/npp.json (Wikidata, CC0, class «nuclear power plant»): each plant with its Wikidata id, point,
 *            status, units, net MW, start and end of operation, and the country code Wikidata gave it.
 *    ties    located_in: a plant (and an LNG terminal) → the admin area that HOLDS its country code. The code is the
 *            identifier; no name is compared and no point is tested against a border.
 *  ⚠ The OPERATOR of a plant is a LABEL in npp.json («EDF Energy», no id), so it is kept in `facts.operator` as the
 *  source's own words and NOT turned into a company node: matching «EDF Energy» to a company by its spelling is exactly
 *  what the graph refuses to do. It becomes a tie when the source states an identifier for the operator.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { defineDomain, linkByIdentifier, nodeRef, toSqlRun } from './lib/domain.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(ROOT, 'supabase', 'migrations', '20261125100000_world_graph_plants_admin_seed.sql');
const read = (p) => fs.readFileSync(path.join(ROOT, p));

/* «2014», «1988-08-13», «1971-05» → epoch ms (the start of that year/month/day); anything else → null (never `now`) */
export function partialDateMs(v) {
  const m = /^(-?\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(v == null ? '' : v).trim()); if (!m) return null;
  const d = new Date(0); d.setUTCFullYear(+m[1], m[2] ? +m[2] - 1 : 0, m[3] ? +m[3] : 1); d.setUTCHours(0, 0, 0, 0);
  return isFinite(d.getTime()) ? d.getTime() : null;
}
const valid = (v) => (v && v !== '-99' ? String(v) : null);

export const admin = defineDomain({
  feed: 'admin', types: ['admin'], idSchemes: ['iso3166_1_a3', 'iso3166_1_a2', 'wikidata', 'naturalearth'],
  build() {
    const g = JSON.parse(zlib.gunzipSync(read('data/ne-countries/ne_50m_admin_0_countries.json.gz')));
    const src = [{ name: 'Natural Earth admin-0 (50m)', url: g.source.url, licence: 'public domain' }];
    const nodes = [], seen = new Set();
    g.features.forEach((f) => {
      const p = f.p, a3 = valid(p.ISO_A3_EH) || valid(p.ADM0_A3); if (!a3 || seen.has(a3)) return; seen.add(a3);
      const ids = { iso3166_1_a3: a3, naturalearth: String(p.NE_ID) };
      if (valid(p.ISO_A2_EH)) ids.iso3166_1_a2 = valid(p.ISO_A2_EH);
      if (valid(p.WIKIDATAID)) ids.wikidata = valid(p.WIKIDATAID);
      nodes.push({ ref: nodeRef('admin', 'iso3166_1_a3', a3), type: 'admin', kind: 'country', name: p.NAME, country: a3, lng: null, lat: null, provenance: null,
        ids, valid_from_ms: null, valid_to_ms: null, facts: { adminType: p.TYPE || null, sovereign: p.SOV_A3 || null }, sources: src });
    });
    return { nodes, edges: [], claims: [], upstream: { naturalearth: { updated: '2022-06-02', rows: nodes.length, url: g.source.url } } };
  },
});

export const plants = defineDomain({
  feed: 'plants', types: ['facility'], idSchemes: ['wikidata'],
  build(adminNodes, retrieved) {
    const j = JSON.parse(read('data/npp.json').toString('utf8'));
    const a2to3 = new Map(adminNodes.filter((n) => n.ids.iso3166_1_a2).map((n) => [n.ids.iso3166_1_a2, n.ids.iso3166_1_a3]));
    const nodes = [], claims = [];
    j.plants.forEach((p) => {
      const ref = nodeRef('facility', 'wikidata', p.id), placed = typeof p.lat === 'number' && typeof p.lon === 'number';
      const facts = { status: p.status || null };
      if (p.operator) facts.operator = p.operator;            // the source's own label, not a node (see the header)
      if (p.pris) facts.pris = p.pris;
      const ids = { wikidata: p.id };          // identifiers OF the plant only: a country code names the country, not the plant
      if (p.country) facts.countryCodeA2 = p.country;
      nodes.push({ ref, type: 'facility', kind: 'nuclear power plant', name: p.name, country: a2to3.get(p.country) || null,
        lng: placed ? p.lon : null, lat: placed ? p.lat : null, provenance: placed ? 'feed_coordinate' : null,
        ids, valid_from_ms: partialDateMs(p.start), valid_to_ms: partialDateMs(p.end), facts,
        sources: [{ name: 'Wikidata', url: 'https://www.wikidata.org/wiki/' + p.id, licence: 'CC0' }] });
      if (typeof p.netMW === 'number') claims.push({ ref, key: 'net_capacity', value: p.netMW, unit: 'MW', from_ms: null, to_ms: null, source: 'Wikidata (data/npp.json)', retrieved });
      if (typeof p.units === 'number') claims.push({ ref, key: 'units', value: p.units, unit: 'reactors', from_ms: null, to_ms: null, source: 'Wikidata (data/npp.json)', retrieved });
    });
    return { nodes, claims, upstream: { wikidata: { updated: String(j.generated).slice(0, 10), rows: nodes.length, url: 'https://query.wikidata.org/sparql' } } };
  },
});

export function build() {
  const retrieved = String(JSON.parse(read('data/npp.json').toString('utf8')).generated).slice(0, 10);
  const a = admin.build();
  const p = plants.build(a.nodes, retrieved);
  const lng = JSON.parse(read('data/world-graph-lng.json').toString('utf8')).nodes.filter((n) => n.type === 'facility');
  const src = 'identifier: country code (ISO 3166-1) stated by the facility → the admin area holding it';
  /* a plant states its country as alpha-2, an LNG terminal as alpha-3 (Wikidata P298): the SCHEME says which area holds it */
  const tiePlants = linkByIdentifier(p.nodes, a.nodes, { rel: 'located_in', source: src, retrieved, key: (n) => ({ scheme: 'iso3166_1_a2', value: n.facts.countryCodeA2 }) });
  const tieLng = linkByIdentifier(lng, a.nodes, { rel: 'located_in', source: src, retrieved, key: (n) => ({ scheme: 'iso3166_1_a3', value: n.country }) });
  return { admin: a, plants: p, retrieved, tiePlants, tieLng, lngCount: lng.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const b = build();
  console.log('admin', b.admin.nodes.length, '· plants', b.plants.nodes.length, 'claims', b.plants.claims.length,
    '· located_in plants', b.tiePlants.edges.length, '(unresolved', b.tiePlants.unresolved.length + ')', 'lng', b.tieLng.edges.length, '/', b.lngCount, '(unresolved', b.tieLng.unresolved.length + ')');
  if (process.argv.includes('--sql')) {
    const head = '-- ============================================================================\n'
      + '--  IntMap · world graph — SEED: administrative areas and nuclear power plants, tied by identifier\n'
      + '--  (generated by scripts/world-graph/build-plants-admin.mjs — do not edit; dev-notes/2026-11-20-world-graph-identity.md)\n'
      + '--  Two ingest runs: feed `admin` (' + b.admin.nodes.length + ' areas + the located_in ties of ' + b.tieLng.edges.length + ' LNG terminals) then feed `plants` (' + b.plants.nodes.length + ' plants, '
      + b.plants.claims.length + ' figures, ' + b.tiePlants.edges.length + ' located_in ties). Natural Earth: public domain. Wikidata: CC0.\n'
      + '-- ============================================================================\n';
    fs.writeFileSync(MIG, head
      + toSqlRun('admin', { nodes: b.admin.nodes, edges: b.tieLng.edges }, b.admin.upstream, 'seed: Natural Earth admin-0')
      + toSqlRun('plants', { nodes: b.plants.nodes, edges: b.tiePlants.edges, claims: b.plants.claims }, b.plants.upstream, 'seed: data/npp.json'));
    console.log('wrote', path.relative(ROOT, MIG));
  }
}
