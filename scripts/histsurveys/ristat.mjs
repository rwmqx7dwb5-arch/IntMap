#!/usr/bin/env node
/* ============================================================================
 *  IntMap · HARVESTER — RISTAT «Russian Empire Historical GIS Maps (1897)» (Kessler; cleaned by R. Stapel, IISH)
 *  first-level units (guberniyas / oblasts) of the Russian Empire at the census of 1897.
 * ----------------------------------------------------------------------------
 *  UPSTREAM (read 2026-10-05)
 *    dataset  https://doi.org/10.34894/NQOASN  (DataverseNL, version 3.3, released 2026-01-20)
 *    API      https://dataverse.nl/api/datasets/:persistentId/?persistentId=doi:10.34894/NQOASN
 *    title    «Electronic Repository of Russian Historical Statistics, 18th - 21st centuries,
 *             https://ristat.org/, Version I (2020): Russian Empire Historical GIS Maps (1897)»
 *    files    «Russian Empire 1897 - Provinces» (datafile 578936, GeoPackage, 1,265,664 bytes, UTF-8,
 *             EPSG:4326 — the file description says so and gpkg_geometry_columns agrees) and
 *             «Russian Empire 1897 - Districts» (578935). ONLY the provinces file is read: the
 *             districts are a lower level, and a lower level drawn beside its parent is a double claim.
 *    layer    provinces_1897, 103 rows, MULTIPOLYGON; fields Gub_ID, prov_RU, prov_ENG, RISTAT_ID.
 *
 *  LICENCE EVIDENCE (Dataverse API, latestVersion, checked 2026-10-05; fetchRaw re-reads and harvest
 *  refuses to run if these two sentences are no longer there)
 *    termsOfUse    «This dataset is made available under a Creative Commons CC0 license with the
 *                   following additional/modified terms and conditions:»
 *    termsOfAccess «These maps were created for the visualisation of regional data on the social and
 *                   economic development of Russia 1800-2000 of the Electronic Repository of Russian
 *                   Historical Statistics, available at: https://ristat.org/. You are free to use these
 *                   maps for your own projects, but, please, make appropriate reference to the
 *                   Electronic Repository of Russian Historical Statistics as their source.»
 *    ⇒ CC0 with a REQUEST for attribution to the Electronic Repository of Russian Historical
 *      Statistics; SOURCE.citation carries it.
 *
 *  WHAT UPSTREAM STATES (and what this module does not add)
 *    · the publisher states these units for ONE year, 1897 (the census of 28 Jan 1897 O.S. / 9 Feb N.S.).
 *      There is no per-row date. So the record is a SNAPSHOT: start 1897-01-01 (year precision), end
 *      1898-01-01 (year precision, DERIVED — endDerived true, endBasis says why). The layer is not a claim
 *      that the borders stood unchanged for the whole of 1897, nor that they began on 1 January.
 *    · NO field says which rows are Finland, Congress Poland or a protectorate. Finland's 8 governorates
 *      (Abo-Björneborg, Häme, Kuopio, Mikkeli, Oulu, Uusimaa, Vaasa, Vyborg) and the 10 Vistula-land
 *      governorates (Warsaw, Kalisz, Kielce, Lublin, Łomża, Piotrków, Płock, Radom, Siedlce, Suwałki)
 *      are carried as parts of the Empire (sovereign RUS), because the publisher put them in the Russian
 *      Empire's province series with a RISTAT_ID; kind is the publisher's own English designator
 *      («governorate» / «region» / «other») and does not pretend to know their autonomy.
 *    · Bukhara (Gub_ID 105) and Khiva (103) are the two rows with RISTAT_ID null — the publisher gives
 *      them no RISTAT series id — and both were protectorates, not provinces: admits() refuses them
 *      by that upstream fact (u.ristatId == null), not by name.
 *    · DOUBLE CLAIMS INSIDE THE FILE: the publisher ships Tiflis and Kutaisi twice — whole
 *      («incl. Zakatalskii / Sukhumi district», Gub_ID 70, 62) and cut into a district (70a, 62b) and a
 *      remainder (70b, 62a). The whole is the governorate; the cut pieces are a district and a remainder.
 *      Rows whose Gub_ID is «<N>a» / «<N>b» next to an existing «<N>» are marked partOf and refused by
 *      admits() (rule from the identifiers; verified in --summary that the union equals the whole).
 *    · geometry: WGS84 degrees; Primorskaya region crosses the antimeridian (lon to 190.29) and is split
 *      at ±180, the eastern part shifted by −360 (GeoJSON-valid). Rounded to 4 decimals.
 *
 *  Usage:  node scripts/histsurveys/ristat.mjs --fetch      (network; fills the cache)
 *          node scripts/histsurveys/ristat.mjs --summary    (cache only)
 * ==========================================================================*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const DOI = 'doi:10.34894/NQOASN';
const API = `https://dataverse.nl/api/datasets/:persistentId/?persistentId=${DOI}`;
const FILE_LABEL = 'Russian Empire 1897 - Provinces';

export const SOURCE = {
  key: 'ristat',
  publisher: 'Electronic Repository of Russian Historical Statistics (RISTAT)',
  title: 'Russian Empire Historical GIS Maps (1897) — provinces',
  url: 'https://doi.org/10.34894/NQOASN',
  download: 'https://dataverse.nl/api/access/datafile/578936',
  licence: 'CC0 1.0 with a request for attribution',
  licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  licenceStatedAt: API,
  citation: 'Electronic Repository of Russian Historical Statistics, 18th - 21st centuries, https://ristat.org/, Version I (2020): '
    + 'Russian Empire Historical GIS Maps (1897). DataverseNL, https://doi.org/10.34894/NQOASN. CC0; the publisher asks for reference to the Electronic Repository of Russian Historical Statistics.',
};

const CACHE = path.join(os.tmpdir(), 'intmap-histsurveys-cache', 'ristat');
const GPKG = path.join(CACHE, 'provinces_1897.gpkg');
const META = path.join(CACHE, 'dataset.json');

async function getJson(url) {
  let last;
  for (let i = 0; i < 2; i++) {            /* retry only after an observed failure */
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return await r.json();
    } catch (e) { last = e; await new Promise(res => setTimeout(res, 3000 * (i + 1))); }
  }
  throw last;
}

export async function fetchRaw() {
  if (fs.existsSync(GPKG) && fs.existsSync(META)) return GPKG;
  fs.mkdirSync(CACHE, { recursive: true });
  const meta = await getJson(API);
  const v = meta.data.latestVersion;
  const f = v.files.find(x => x.label === FILE_LABEL);
  if (!f) throw new Error(`ristat: no file «${FILE_LABEL}» in ${API}`);
  const res = await fetch(`https://dataverse.nl/api/access/datafile/${f.dataFile.id}`, { signal: AbortSignal.timeout(300000) });
  if (!res.ok) throw new Error(`ristat download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ck = f.dataFile.checksum;                                  /* the record declares its own algorithm (SHA-1 on 2026-10-05) */
  const alg = (ck?.type || '').toLowerCase().replace('-', '');
  if (!ck || !['sha1', 'md5', 'sha256'].includes(alg)) throw new Error('ristat: dataset record has no usable checksum: ' + JSON.stringify(ck));
  if (crypto.createHash(alg).update(buf).digest('hex') !== ck.value) throw new Error(`ristat: ${ck.type} of the download does not match the dataset record`);
  if (buf.subarray(0, 15).toString('latin1') !== 'SQLite format 3') throw new Error('ristat: download is not a GeoPackage');
  fs.writeFileSync(GPKG + '.part', buf); fs.renameSync(GPKG + '.part', GPKG);
  fs.writeFileSync(META, JSON.stringify({
    fetched: new Date().toISOString().slice(0, 10), version: `${v.versionNumber}.${v.versionMinorNumber}`,
    termsOfUse: v.termsOfUse, termsOfAccess: v.termsOfAccess, file: f.dataFile,
  }));
  return GPKG;
}

/* ── GeoPackage geometry = «GP» header + WKB ──────────────────────────────────────────────────── */
function wkbGeometry(b, p0) {
  let p = p0;
  const le = b[p] === 1; p += 1;
  const u32 = () => { const v = le ? b.readUInt32LE(p) : b.readUInt32BE(p); p += 4; return v; };
  const f64 = () => { const v = le ? b.readDoubleLE(p) : b.readDoubleBE(p); p += 8; return v; };
  const t = u32();
  const base = t % 1000, dim = 2 + (t >= 1000 && t < 2000 ? 1 : t >= 2000 && t < 3000 ? 1 : t >= 3000 ? 2 : 0);
  const readRing = () => { const n = u32(); const r = []; for (let i = 0; i < n; i++) { r.push([f64(), f64()]); for (let k = 2; k < dim; k++) f64(); } return r; };
  const readPoly = () => { const n = u32(); const rings = []; for (let i = 0; i < n; i++) rings.push(readRing()); return rings; };
  if (base === 3) return { geom: { type: 'Polygon', coordinates: readPoly() }, end: p };
  if (base === 6) {
    const n = u32(); const polys = [];
    for (let i = 0; i < n; i++) { const g = wkbGeometry(b, p); if (g.geom.type !== 'Polygon') throw new Error('ristat: multipolygon member is not a polygon'); polys.push(g.geom.coordinates); p = g.end; }
    return { geom: { type: 'MultiPolygon', coordinates: polys }, end: p };
  }
  throw new Error(`ristat: WKB type ${t} is not an area`);
}
function gpkgGeometry(blob) {
  const b = Buffer.from(blob);
  if (b[0] !== 0x47 || b[1] !== 0x50) throw new Error('ristat: not a GeoPackage geometry blob');
  const flags = b[3];
  if (flags & 0x10) return null;                                  /* empty geometry */
  const env = [0, 32, 48, 48, 64][(flags >> 1) & 7];
  return wkbGeometry(b, 8 + env).geom;
}

/* ── antimeridian: split at ±180 and shift the eastern part by −360 ───────────────────────────── */
const r4 = n => Math.round(n * 1e4) / 1e4;
function clipRing(ring, east) {                                    /* Sutherland–Hodgman against x ≤ 180 (west) or x ≥ 180 (east) */
  const pts = ring.slice(0, -1);
  const inside = p => (east ? p[0] >= 180 : p[0] <= 180);
  const cut = (a, c) => { const t = (180 - a[0]) / (c[0] - a[0]); return [180, a[1] + t * (c[1] - a[1])]; };
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i + pts.length - 1) % pts.length], c = pts[i];
    if (inside(c)) { if (!inside(a)) out.push(cut(a, c)); out.push(c); } else if (inside(a)) out.push(cut(a, c));
  }
  if (out.length < 3) return null;
  out.push(out[0].slice());
  return out;
}
function wrapPolygons(polys) {
  const res = [];
  for (const poly of polys) {
    let hi = -1e9, lo = 1e9;
    for (const c of poly[0]) { if (c[0] > hi) hi = c[0]; if (c[0] < lo) lo = c[0]; }
    if (hi <= 180) { res.push(poly); continue; }
    if (lo >= 180) { res.push(poly.map(r => r.map(c => [c[0] - 360, c[1]]))); continue; }
    const west = poly.map(r => clipRing(r, false));
    const east = poly.map(r => clipRing(r, true));
    if (west[0]) res.push(west.filter(Boolean));
    if (east[0]) res.push(east.filter(Boolean).map(r => r.map(c => [c[0] - 360, c[1]])));
  }
  return res;
}
function ringClean(ring) {
  const out = [];
  for (const [x, y] of ring) {
    const p = [r4(x), r4(y)]; const q = out[out.length - 1];
    if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push(p);
  }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0].slice());
  return out.length >= 4 ? out : null;
}
function toMulti(g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return wrapPolygons(polys).map(poly => poly.map(ringClean)).filter(poly => poly[0]).map(poly => poly.filter(Boolean));
}

const clean = s => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim());
/* the publisher's own English designator: «… governorate», «… region»; the two rows with neither (Sakhalin island, Don Cossack host lands) are «other» and keep their name */
function designator(en) {
  const m = / (governorate|region)\b/.exec(en);
  return m ? m[1] : 'other';
}

export async function harvest() {
  if (!fs.existsSync(GPKG) || !fs.existsSync(META)) throw new Error('ristat cache missing — run with --fetch first');
  const meta = JSON.parse(fs.readFileSync(META, 'utf8'));
  if (!/Creative Commons CC0/.test(meta.termsOfUse || '') || !/make appropriate reference to the Electronic Repository of Russian Historical Statistics/.test(meta.termsOfAccess || '')) {
    throw new Error('ristat: the dataset terms recorded at fetch time no longer say CC0 + attribution request — re-read the licence before using the data');
  }
  const db = new DatabaseSync(GPKG, { readOnly: true });
  const gc = db.prepare('select table_name, column_name, srs_id from gpkg_geometry_columns').all();
  if (gc.length !== 1 || gc[0].table_name !== 'provinces_1897' || gc[0].srs_id !== 4326) throw new Error('ristat: layout changed: ' + JSON.stringify(gc));
  const rows = db.prepare(`select fid, Gub_ID, prov_RU, prov_ENG, RISTAT_ID, ${gc[0].column_name} as g from provinces_1897 order by fid`).all();
  const gubIds = new Set(rows.map(r => clean(r.Gub_ID)));
  const units = [], dropped = [];
  for (const r of rows) {
    const gub = clean(r.Gub_ID), en = clean(r.prov_ENG), ru = clean(r.prov_RU);
    const id = `ristat:1897:${gub}`;
    if (!gub || !en) { dropped.push({ id, name: en || null, reason: 'no Gub_ID or English name' }); continue; }
    const g = r.g ? gpkgGeometry(r.g) : null;
    const coords = g ? toMulti(g) : [];
    if (!coords.length) { dropped.push({ id, name: en, reason: 'no usable polygon geometry' }); continue; }
    const m = /^(\d+)[a-z]$/.exec(gub);
    units.push({
      id, name: en, names: { en, ru },
      start: '1897-01-01', startPrecision: 'year',
      end: '1898-01-01', endPrecision: 'year', endDerived: true,
      endBasis: 'a single-year snapshot: the publisher states these units for 1897 only',
      sovereign: 'RUS', kind: designator(en), coords: { type: 'MultiPolygon', coordinates: coords },
      ristatId: clean(r.RISTAT_ID) || null, gubId: gub,
      partOf: m && gubIds.has(m[1]) ? m[1] : null,
    });
  }
  return { source: SOURCE, units, dropped };
}

/* WHICH ROWS ARE FIRST-LEVEL PROVINCES OF THE EMPIRE — upstream's own markers decide:
   RISTAT_ID null = the publisher gives no RISTAT series id (Bukhara, Khiva: protectorates);
   partOf = a «<N>a»/«<N>b» cut of a governorate «<N>» that is itself in the file. */
export function admits(u) {
  if (u.ristatId == null) return 'no RISTAT_ID: the publisher does not list it as a province (Bukhara and Khiva were protectorates)';
  if (u.partOf) return `a district or remainder cut out of governorate ${u.partOf}, which the file also carries whole`;
  return true;
}

/* ── CLI ── */
const count = (a, f) => { const m = new Map(); for (const x of a) m.set(f(x), (m.get(f(x)) || 0) + 1); return [...m].sort((x, y) => y[1] - x[1]); };
const verts = u => u.coords.coordinates.reduce((n, poly) => n + poly.reduce((a, r) => a + r.length, 0), 0);
const area = u => { let s = 0; for (const poly of u.coords.coordinates) poly.forEach((r, i) => { let a = 0; for (let k = 0, j = r.length - 1; k < r.length; j = k++) a += r[j][0] * r[k][1] - r[k][0] * r[j][1]; s += (i ? -1 : 1) * Math.abs(a / 2); }); return s; };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--fetch')) console.log('cached:', await fetchRaw());
  if (args.includes('--summary')) {
    const { units, dropped } = await harvest();
    const refused = units.map(u => [u, admits(u)]).filter(([, a]) => a !== true);
    const kept = units.filter(u => admits(u) === true);
    console.log('units:', units.length, ' admitted:', kept.length);
    console.log('dropped:', dropped.length, JSON.stringify(Object.fromEntries(count(dropped, d => d.reason))));
    console.log('refused by admits():', refused.length);
    for (const [u, a] of refused) console.log(`  ${u.gubId} ${u.name} — ${a}`);
    console.log('kinds:', JSON.stringify(Object.fromEntries(count(kept, u => u.kind))));
    console.log('sovereign:', JSON.stringify(Object.fromEntries(count(kept, u => u.sovereign))));
    console.log('start:', [...new Set(units.map(u => u.start))].join(','), ' end:', [...new Set(units.map(u => u.end))].join(','));
    console.log('total vertices:', units.reduce((n, u) => n + verts(u), 0));
    for (const w of ['70', '62']) {
      const whole = units.find(u => u.gubId === w), parts = units.filter(u => u.partOf === w);
      console.log(`governorate ${w}: whole area ${area(whole).toFixed(3)} deg² vs parts ${parts.map(p => p.gubId + ' ' + area(p).toFixed(3)).join(' + ')} = ${parts.reduce((s, p) => s + area(p), 0).toFixed(3)}`);
    }
    const lons = units.flatMap(u => u.coords.coordinates.flatMap(p => p[0].map(c => c[0])));
    console.log('lon range after antimeridian split:', Math.min(...lons), Math.max(...lons));
    console.log('samples:');
    for (const i of [0, 20, 40, 60, kept.length - 1]) { const u = kept[i]; console.log('  ', u.name, '|', u.names.ru, '|', u.start, '|', u.end, '|', u.kind, '|', u.sovereign); }
  }
}
