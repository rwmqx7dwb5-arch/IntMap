#!/usr/bin/env node
/* ============================================================================
 *  IntMap · HARVESTER — heiDATA «Transcultural Empire: GIS of the 1897 and 1926 censuses» (Sablin et al.,
 *  Heidelberg / FU Berlin) — ONLY the 1926 layer: first-level units of the USSR at the census of 17 Dec 1926.
 * ----------------------------------------------------------------------------
 *  UPSTREAM (read 2026-10-05)
 *    dataset  https://doi.org/10.11588/data/10064  (heiDATA, version 3.0, released 2018-10-09)
 *    API      https://heidata.uni-heidelberg.de/api/datasets/:persistentId/?persistentId=doi:10.11588/data/10064
 *    files    1926SovietUnion.shp (743,792 bytes) + .dbf (224,103 bytes) [+ .shx/.sbn/.sbx]; 67 polygons.
 *             Read: .shp + .dbf. Names are UTF-8 (the Cyrillic decodes cleanly; there is no .cpg).
 *    NOT READ: 1897RussianEmpire.* — the same census layer as RISTAT (ristat.mjs). Two records for one
 *             instant would be a double claim, so the 1897 layer is not harvested here.
 *    fields   NameENG, NameRUS, AreaV, PopALL … (census counts, not read); «Id» is 0 on every row.
 *
 *  LICENCE EVIDENCE (Dataverse API, latestVersion.termsOfUse, checked 2026-10-05; fetchRaw re-reads it and
 *  harvest refuses to run if it no longer says Attribution 4.0)
 *    «Licensed under a Creative Commons Attribution 4.0 International.» linking
 *    http://creativecommons.org/licenses/by/4.0/ . CC BY 4.0 requires attribution: SOURCE.citation.
 *
 *  ⚠ CRS — THE SHAPEFILE SHIPS NO .prj (the dataset lists .shp .shx .dbf .sbn .sbx only for 1926). Determined
 *  from the data (2026-10-05), not assumed:
 *    · coordinate ranges: x 26.03 … 191.01, y 35.14 … 81.86 — decimal degrees (a metric CRS would be in
 *      the millions). x above 180 is Chukotka unwrapped across the antimeridian (Far East region).
 *    · point-in-polygon of known cities against the unit that should hold them, with NO transform:
 *      Moscow 37.62E 55.75N → «Moscow province»; Leningrad 30.31E 59.94N → «Leningrad province»;
 *      Tbilisi 44.80E 41.72N and Baku 49.87E 40.41N → «Transcaucasian SFSR»; Kyiv → «Ukrainian ASSR»;
 *      Minsk → «Belorussian ASSR»; Kazan → «Tatar ASSR»; Novosibirsk → «Siberian region»; Yakutsk →
 *      «Yakut ASSR»; Ashgabat → «Turkmen SSR»; Vladivostok and Petropavlovsk-Kamchatsky → «Far East
 *      region»; Murmansk → «Murmansk province»; Simferopol → «Crimean ASSR»; Tashkent → «Kazakh ASSR»
 *      (historically right: the Tashkent area was still in the Kazakh ASSR in 1926).
 *    ⇒ geographic longitude/latitude. The datum is not stated; every plausible one (WGS84, Pulkovo 1942)
 *    differs by well under 4-decimal rounding of the generalisation, so no shift is applied.
 *    harvest() throws if any coordinate leaves degree ranges (then the CRS has changed and must be redone).
 *
 *  WHAT UPSTREAM STATES (and what this module does not add)
 *    · one census year, 1926 — no per-row date. SNAPSHOT: start 1926-01-01 (year), end 1927-01-01 (year,
 *      DERIVED — endDerived true, endBasis says why). Not a claim that borders began on 1 January.
 *    · kind = the publisher's own designator inside the English name: «SFSR», «SSR», «ASSR», «AR»
 *      (autonomous region), «AC» (autonomous city: Grozny, Vladikavkaz), «province» (guberniya),
 *      «region» (krai/oblast). Parsed from NameENG; a name with none of them gets kind «other».
 *    · id: the publisher gives none (Id = 0 everywhere), so «transcultural:1926:<slug of NameENG>»; a
 *      collision is dropped, never merged.
 *    · Antimeridian: Far East region (x to 191.01) is split at ±180, the eastern part shifted by −360.
 *
 *  Usage:  node scripts/histsurveys/transcultural.mjs --fetch      (network; fills the cache)
 *          node scripts/histsurveys/transcultural.mjs --summary    (cache only)
 * ==========================================================================*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readShp, readDbf } from '../lib/elections-geo.mjs';

const DOI = 'doi:10.11588/data/10064';
const HOST = 'https://heidata.uni-heidelberg.de';
const API = `${HOST}/api/datasets/:persistentId/?persistentId=${DOI}`;
const FILES = ['1926SovietUnion.shp', '1926SovietUnion.dbf'];

export const SOURCE = {
  key: 'transcultural',
  publisher: 'Transcultural Empire project (Heidelberg University / Freie Universität Berlin), heiDATA',
  title: 'Transcultural Empire: GIS of the 1897 and 1926 censuses — 1926 layer',
  url: 'https://doi.org/10.11588/data/10064',
  download: API,
  licence: 'CC BY 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  licenceStatedAt: API,
  citation: 'Sablin, Ivan; Zhidkov, Gleb; et al., Transcultural Empire: GIS of the 1897 and 1926 censuses, heiDATA, https://doi.org/10.11588/data/10064. '
    + 'Licensed under Creative Commons Attribution 4.0 International.',
};

const CACHE = path.join(os.tmpdir(), 'intmap-histsurveys-cache', 'transcultural');
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
  if (fs.existsSync(META) && FILES.every(f => fs.existsSync(path.join(CACHE, f)))) return CACHE;
  fs.mkdirSync(CACHE, { recursive: true });
  const meta = await getJson(API);
  const v = meta.data.latestVersion;
  for (const name of FILES) {
    const f = v.files.find(x => x.dataFile.filename === name);
    if (!f) throw new Error(`transcultural: no file ${name} in ${API}`);
    const res = await fetch(`${HOST}/api/access/datafile/${f.dataFile.id}`, { signal: AbortSignal.timeout(300000) });
    if (!res.ok) throw new Error(`transcultural download ${name}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ck = f.dataFile.checksum;
    const alg = (ck?.type || '').toLowerCase().replace('-', '');
    if (!ck || !['sha1', 'md5', 'sha256'].includes(alg)) throw new Error('transcultural: dataset record has no usable checksum for ' + name);
    if (crypto.createHash(alg).update(buf).digest('hex') !== ck.value) throw new Error(`transcultural: ${ck.type} of ${name} does not match the dataset record`);
    fs.writeFileSync(path.join(CACHE, name), buf);
  }
  fs.writeFileSync(META, JSON.stringify({
    fetched: new Date().toISOString().slice(0, 10), version: `${v.versionNumber}.${v.versionMinorNumber}`, termsOfUse: v.termsOfUse,
    hasPrj1926: v.files.some(x => /^1926.*\.prj$/i.test(x.dataFile.filename)),
  }));
  return CACHE;
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
const slug = s => s.normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
/* the publisher's own designator, in the English name: «… ASSR», «AC …», «… province» … */
function designator(en) {
  if (/^AC /.test(en)) return 'AC';
  const m = / (SFSR|ASSR|SSR|AR|province|region)$/.exec(en);
  return m ? m[1] : 'other';
}

export async function harvest() {
  if (!fs.existsSync(META) || !FILES.every(f => fs.existsSync(path.join(CACHE, f)))) throw new Error('transcultural cache missing — run with --fetch first');
  const meta = JSON.parse(fs.readFileSync(META, 'utf8'));
  if (!/Attribution 4\.0 International/.test(meta.termsOfUse || '')) throw new Error('transcultural: the terms recorded at fetch time no longer say CC BY 4.0 — re-read the licence');
  if (meta.hasPrj1926) throw new Error('transcultural: upstream now ships a .prj for 1926 — read it instead of the degrees assumption in the header');
  const geoms = readShp(fs.readFileSync(path.join(CACHE, '1926SovietUnion.shp')));
  const rows = readDbf(fs.readFileSync(path.join(CACHE, '1926SovietUnion.dbf')), 'utf8');
  if (geoms.length !== rows.length) throw new Error('transcultural: shp/dbf disagree');
  const units = [], dropped = [], seen = new Set();
  rows.forEach((r, i) => {
    const en = clean(r.NameENG), ru = clean(r.NameRUS);
    const id = `transcultural:1926:${slug(en)}`;
    if (!en) { dropped.push({ id: `row ${i}`, name: null, reason: 'no English name' }); return; }
    if (seen.has(id)) { dropped.push({ id, name: en, reason: 'identifier collision with an earlier row' }); return; }
    seen.add(id);
    const g = geoms[i];
    if (!g) { dropped.push({ id, name: en, reason: 'no geometry' }); return; }
    for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) for (const ring of poly) for (const [x, y] of ring) {
      if (!(x >= -360 && x <= 360 && y >= -90 && y <= 90)) throw new Error(`transcultural: ${en} has a coordinate outside degree ranges (${x}, ${y}) — the CRS assumption in the header no longer holds`);
    }
    const coords = toMulti(g);
    if (!coords.length) { dropped.push({ id, name: en, reason: 'geometry empty after rounding' }); return; }
    units.push({
      id, name: en, names: { en, ru },
      start: '1926-01-01', startPrecision: 'year',
      end: '1927-01-01', endPrecision: 'year', endDerived: true,
      endBasis: 'a single-year snapshot: the publisher states these units for the 1926 census only',
      sovereign: 'SUN', kind: designator(en), coords: { type: 'MultiPolygon', coordinates: coords },
    });
  });
  return { source: SOURCE, units, dropped };
}

/* ── CLI ── */
const count = (a, f) => { const m = new Map(); for (const x of a) m.set(f(x), (m.get(f(x)) || 0) + 1); return [...m].sort((x, y) => y[1] - x[1]); };
const verts = u => u.coords.coordinates.reduce((n, poly) => n + poly.reduce((a, r) => a + r.length, 0), 0);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--fetch')) console.log('cached:', await fetchRaw());
  if (args.includes('--summary')) {
    const { units, dropped } = await harvest();
    console.log('units:', units.length);
    console.log('dropped:', dropped.length, JSON.stringify(Object.fromEntries(count(dropped, d => d.reason))));
    console.log('kinds:', JSON.stringify(Object.fromEntries(count(units, u => u.kind))));
    console.log('sovereign:', JSON.stringify(Object.fromEntries(count(units, u => u.sovereign))));
    console.log('start:', [...new Set(units.map(u => u.start))].join(','), ' end:', [...new Set(units.map(u => u.end))].join(','));
    console.log('total vertices:', units.reduce((n, u) => n + verts(u), 0));
    const xs = units.flatMap(u => u.coords.coordinates.flatMap(p => p[0].map(c => c[0])));
    console.log('lon range after antimeridian split:', Math.min(...xs), Math.max(...xs));
    console.log('other-kind:', units.filter(u => u.kind === 'other').map(u => u.name).join('; ') || 'none');
    console.log('samples:');
    for (const i of [0, 12, 26, 44, 65]) { const u = units[i]; console.log('  ', u.name, '|', u.names.ru, '|', u.start, '|', u.end, '|', u.kind, '|', u.sovereign); }
  }
}
