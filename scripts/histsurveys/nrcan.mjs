#!/usr/bin/env node
/* Natural Resources Canada — «Territorial Evolution of Canada, 1867 to 2003» (provinces, territories and
 * the British colonies / territories around them, as 23 dated snapshots of the whole country).
 *
 * UPSTREAM (read 2026-10-05)
 *   dataset page  https://open.canada.ca/data/en/dataset/e88ce995-b69a-4595-a752-bb06b061b5a3
 *   service       https://maps-cartes.services.geo.ca/server_serveur/rest/services/NRCan/territorial_evolution_en/MapServer
 *                 (the dataset's own «ESRI REST» resource; layer 8 «Political Divisions» is the dated polygons.
 *                 Layers 0/4 are label points-as-polygons, 1/5 «Default» group layers, 2 «name» and 3 «date»
 *                 group layers, 6 «Canadian Capitals» points, 7 «Maritime Boundary» lines.)
 *   we ask layer 8 with where=1=1, outSR=4326, maxAllowableOffset=0.005 (≈ 500 m: the same generalisation the
 *   service's own web map uses at country scale), geometryPrecision=4, f=geojson, 20 rows per page.
 *
 * LICENCE EVIDENCE (checked 2026-10-05)
 *   CKAN package_show for the dataset: license_id «ca-ogl-lgo», license_title «Open Government Licence - Canada»,
 *   license_url https://open.canada.ca/en/open-government-licence-canada. The licence text requires: «Acknowledge
 *   the source of the Information by including any attribution statement specified by the Information
 *   Provider(s) and, where possible, provide a link to this licence.» and, where the provider gives none:
 *   «Contains information licensed under the Open Government Licence – Canada.» The service names
 *   «Natural Resources Canada, 2026» as its copyright text; the dataset gives no attribution statement of its
 *   own, so SOURCE.citation carries the publisher plus the licence's own sentence.
 *
 * WHAT UPSTREAM STATES (and what this module does not add)
 *   · each row is one polity-in-one-snapshot (START_TIME = the snapshot year; END_TIME = that year for
 *     1867…1949 and 2017 for 1999…2003, i.e. NOT a per-row end);
 *   · START_DATE is a date field whose month/day is 1 January in every row (even 1867, where Confederation
 *     was 1 July) — it restates the year, so it is a YEAR-precision start, never a day;
 *   · Period_Group = the jurisdiction group «Canada (YYYY)» or «British Colony or Territory (YYYY)».
 *   The end of a snapshot is therefore DERIVED: the first day of the next snapshot's year (endDerived: true,
 *   endBasis says so). The last snapshot has end null (upstream END_TIME 2017 is kept as upstreamEndTime).
 *
 * Counts observed 2026-10-05: 304 rows (one is an exact duplicate: Manitoba 2003, OBJECTID 306 = 292), 23 snapshot years (1867 … 2003), 273 «Canada», 31 «British Colony
 * or Territory».
 *
 * Usage:  node scripts/histsurveys/nrcan.mjs --fetch      (network; fills the cache)
 *         node scripts/histsurveys/nrcan.mjs --summary    (cache only)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATASET = 'https://open.canada.ca/data/en/dataset/e88ce995-b69a-4595-a752-bb06b061b5a3';
const SERVICE = 'https://maps-cartes.services.geo.ca/server_serveur/rest/services/NRCan/territorial_evolution_en/MapServer';
const LAYER = 8;
const PAGE = 20;

export const SOURCE = {
  key: 'nrcan',
  publisher: 'Natural Resources Canada',
  title: 'Territorial Evolution, 1867 to 2003',
  url: DATASET,
  download: `${SERVICE}/${LAYER}`,
  licence: 'Open Government Licence - Canada',
  licenceUrl: 'https://open.canada.ca/en/open-government-licence-canada',
  licenceStatedAt: DATASET,
  citation: 'Natural Resources Canada, Territorial Evolution of Canada, 1867 to 2003. '
    + 'Contains information licensed under the Open Government Licence – Canada.',
};

const CACHE_DIR = join(tmpdir(), 'intmap-histsurveys-cache', 'nrcan');
const CACHE = join(CACHE_DIR, `layer${LAYER}.json`);

async function getJson(url) {
  let last;
  for (let i = 0; i < 2; i++) {           /* retry only after an observed failure, with a different wait */
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(180000) });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      const j = await r.json();
      if (j.error) throw new Error(`service error ${JSON.stringify(j.error)}`);
      return j;
    } catch (e) { last = e; await new Promise(res => setTimeout(res, 3000 * (i + 1))); }
  }
  throw last;
}

export async function fetchRaw() {
  if (existsSync(CACHE)) return CACHE;
  mkdirSync(CACHE_DIR, { recursive: true });
  const q = `${SERVICE}/${LAYER}/query`;
  const total = (await getJson(`${q}?where=1%3D1&returnCountOnly=true&f=json`)).count;
  const rows = [];
  for (let off = 0; off < total; off += PAGE) {
    const j = await getJson(`${q}?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&maxAllowableOffset=0.005`
      + `&geometryPrecision=4&orderByFields=OBJECTID&f=geojson&resultOffset=${off}&resultRecordCount=${PAGE}`);
    for (const f of j.features || []) rows.push({ properties: f.properties, geometry: f.geometry });
  }
  if (rows.length !== total) throw new Error(`nrcan: service counted ${total} rows but ${rows.length} arrived`);
  writeFileSync(CACHE, JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), total, rows }));
  return CACHE;
}

/* 4-decimal, closed, de-duplicated ring; null when fewer than 3 distinct points remain */
function cleanRing(ring) {
  const out = [];
  for (const p of ring) {
    const q = [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4];
    const l = out[out.length - 1];
    if (!l || l[0] !== q[0] || l[1] !== q[1]) out.push(q);
  }
  if (out.length > 1 && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0].slice());
  return out.length >= 4 ? out : null;
}
function toMulti(g) {
  if (!g || !g.coordinates) return null;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null;
  if (!polys) return null;
  const res = [];
  for (const poly of polys) {
    const rings = poly.map(cleanRing);
    if (!rings[0]) continue;                       /* outer ring collapsed */
    res.push(rings.filter(Boolean));
  }
  return res.length ? { type: 'MultiPolygon', coordinates: res } : null;
}

/* the sovereign that upstream's own group text names; anything else is dropped, not guessed */
const GROUPS = { 'Canada': 'CAN', 'British Colony or Territory': 'GBR' };
const clean = s => (s == null ? '' : String(s).replace(/\r\n?/g, '\n').trim());

export async function harvest() {
  if (!existsSync(CACHE)) throw new Error(`nrcan: no cache at ${CACHE} — run with --fetch`);
  const { rows } = JSON.parse(readFileSync(CACHE, 'utf8'));
  const dropped = [];
  const ok = [];
  const seen = new Map();   /* name + snapshot year + exact geometry → first OBJECTID */
  for (const { properties: p, geometry } of rows) {
    const id = `nrcan:${p.OBJECTID}`;
    const drop = reason => dropped.push({ id, name: p.PROV_NAME ?? null, reason });
    const kind = clean(p.Period_Group).replace(/\s*\(\d{4}\)\s*$/, '');
    if (!Number.isInteger(p.START_TIME)) { drop('no START_TIME year'); continue; }
    if (!(kind in GROUPS)) { drop(`unrecognised Period_Group «${kind}»`); continue; }
    if (!clean(p.PROV_NAME)) { drop('no name'); continue; }
    const coords = toMulti(geometry);
    if (!coords) { drop('no usable polygon geometry'); continue; }
    const sig = `${p.PROV_NAME}|${p.START_TIME}|${JSON.stringify(coords)}`;
    if (seen.has(sig)) { drop(`exact duplicate of ${seen.get(sig)} (same name, snapshot year and geometry)`); continue; }
    seen.set(sig, id);
    /* START_DATE is epoch ms; a day is stated only when it is NOT 1 January of the snapshot year */
    let start = `${p.START_TIME}-01-01`, startPrecision = 'year';
    if (p.START_DATE != null) {
      const d = new Date(p.START_DATE).toISOString().slice(0, 10);
      if (!d.startsWith(`${p.START_TIME}-`)) { drop(`START_DATE ${d} disagrees with START_TIME ${p.START_TIME}`); continue; }
      if (!d.endsWith('-01-01')) { start = d; startPrecision = 'day'; }
    }
    ok.push({
      id, name: clean(p.PROV_NAME), names: { en: clean(p.PROV_NAME), fr: clean(p.NOM_PROV) },
      start, startPrecision, end: null, endPrecision: null,
      sovereign: GROUPS[kind], kind, coords,
      note: clean(p.ATT_TXT_EN),
      upstreamStartTime: p.START_TIME, upstreamEndTime: p.END_TIME ?? null,
      periodGroup: clean(p.Period_Group),
    });
  }
  /* the end of a snapshot = the first day of the next snapshot's year (upstream END_TIME is not per-row) */
  const years = [...new Set(ok.map(u => u.upstreamStartTime))].sort((a, b) => a - b);
  for (const u of ok) {
    const nx = years[years.indexOf(u.upstreamStartTime) + 1];
    if (nx != null) {
      Object.assign(u, { end: `${nx}-01-01`, endPrecision: 'year', endDerived: true, endBasis: 'first day of the next snapshot year' });
    } else {
      Object.assign(u, { end: null, endPrecision: null, endDerived: false, endBasis: 'last snapshot; upstream END_TIME kept as upstreamEndTime' });
    }
  }
  return { source: SOURCE, units: ok, dropped };
}

function count(arr, f) { const m = new Map(); for (const x of arr) { const k = f(x); m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); }
function vertices(c) { let n = 0; for (const poly of c.coordinates) for (const r of poly) n += r.length; return n; }

async function summary() {
  const { units, dropped } = await harvest();
  const out = [];
  out.push(`units: ${units.length}`);
  out.push(`dropped: ${dropped.length}${dropped.length ? ' — ' + count(dropped, d => d.reason).map(([k, n]) => `${k} x${n}`).join('; ') : ''}`);
  out.push('kinds: ' + count(units, u => u.kind).map(([k, n]) => `${k} ${n}`).join(', '));
  out.push('sovereign: ' + count(units, u => u.sovereign).map(([k, n]) => `${k} ${n}`).join(', '));
  out.push('start precision: ' + count(units, u => u.startPrecision).map(([k, n]) => `${k} ${n}`).join(', '));
  out.push('end precision: ' + count(units, u => u.endPrecision ?? 'open').map(([k, n]) => `${k} ${n}`).join(', '));
  const starts = units.map(u => u.start).sort();
  const ends = units.map(u => u.end).filter(Boolean).sort();
  out.push(`earliest start: ${starts[0]}; latest start: ${starts[starts.length - 1]}; latest end: ${ends[ends.length - 1]}`);
  out.push(`total vertices: ${units.reduce((n, u) => n + vertices(u.coords), 0)}`);
  out.push('samples:');
  const step = Math.max(1, Math.floor(units.length / 8));
  for (let i = 0, k = 0; i < units.length && k < 8; i += step, k++) {
    const u = units[i];
    out.push(`  ${u.name} | ${u.start} | ${u.end} | ${u.startPrecision}/${u.endPrecision} | ${u.kind} | ${u.sovereign}`);
  }
  console.log(out.join('\n'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, '/').replace(/^\/([A-Za-z]:)/, '$1') || process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a.includes('--fetch')) console.log('cache:', await fetchRaw());
  if (a.includes('--summary')) await summary();
  if (!a.includes('--fetch') && !a.includes('--summary')) console.log('usage: nrcan.mjs --fetch | --summary');
}
