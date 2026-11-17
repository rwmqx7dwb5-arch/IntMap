#!/usr/bin/env node
/* ============================================================================
 *  IntMap · HARVESTER — Müller-Crepon, colonial administrative units of Sub-Saharan Africa
 *  (Harvard Dataverse doi:10.7910/DVN/9JI06R, file data/col_units_full.geojson). FIRST-LEVEL units only.
 * ----------------------------------------------------------------------------
 *  WHAT THE PUBLISHER STATES
 *   «Replication Data for: Ethnic Geography and the Colonial Design of Administrative Units in Sub-Saharan
 *   Africa» (Carl Müller-Crepon, LSE; Comparative Political Studies). 1,858 polygons, each a `district`
 *   with an optional higher `region`, a snapshot `year` («Year of administrative snapshot», codebook.pdf
 *   §3.4), the present-day country `iso3c`, `colbrit` / `colfrnc` and a period label. Measured 2026-11-17:
 *   31 present-day countries, 95 snapshots, 1895–1964. The review (below) admits 54 of them and excludes 41:
 *   after independence or inside the 1953–63 Federation, a first level absent from the file, a layout of another
 *   year (Sokoto–Bornu–Bauchi as provinces in 1901; southern Chad inside Oubangui-Chari on the «1938» sheets;
 *   Darfur in «1914»), one map reused for two years (Mozambique 1903/1918, Sudan 1914/1921), or units IntMap already draws to the day from its own dossiers (Belgian Congo 1933/1949, Mozambique 1964).
 *
 *  ⚠⚠ THE DATA IS NOT DRAWN AS IT COMES. Three things about it were measured before one row was admitted,
 *  and each is why this file reads a REVIEW beside the data rather than the data alone:
 *
 *   1. WHICH FIELD IS THE FIRST LEVEL DIFFERS BY COLONY AND BY YEAR. `region` is the province in British
 *      Kenya 1910, but in Nigeria 1962 it holds 35 provinces under the four Regions; French cercles carry
 *      no region at all and ARE the first level of their colony; Belgian Congo's districts are first-level
 *      in 1912 and second-level under the provinces from 1914. That is history, not a property of the
 *      file, so it is decided per snapshot with sources in scripts/histsurveys/mullercrepon-review.json
 *      (`level`: region | district | exclude). A snapshot the review does not name FAILS the harvest —
 *      a new upstream version cannot ship an unread layout.
 *   2. THE SNAPSHOT YEAR IS THE MAP'S, NOT ALWAYS THE LAYOUT'S (e.g. German Bezirk names on the 1920
 *      Tanganyika sheet). The review states, per snapshot, the span the unit set was in force where a dated
 *      reorganisation before and after establishes it (`inForceFrom` / `inForceTo`, at their own
 *      precision); otherwise the row is the snapshot year only, its end DERIVED as the next 1 January and
 *      marked so (`endDerived` / `endBasis`) — the popup never prints a day nobody stated.
 *   3. SOME OUTER FRAMES ARE CSHAPES'. scripts/histsurveys/mullercrepon.mjs --frames measures each snapshot's
 *      union against CShapes 2.0 on 1 July of its year: in 13 of 95 the difference is 0 km² both ways (Nigeria
 *      1932 953,894 km² both, Tanganyika 1920 and 1933, Sudan 1928, Guinea 1937 …); the rest are the
 *      publisher's own frames (French Soudan 1922 lies 104,984 km² outside CShapes' Mali). Where the frame
 *      equals CShapes it was taken from CShapes (CC BY-NC-SA 4.0), whose
 *      share-alike terms the CC0 label downstream does not lift. The record therefore goes to the
 *      non-commercial bundle beside CShapes' own (`nonCommercial`, `inheritedTerms`), never the open one.
 *
 *  LICENCE EVIDENCE: GET https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=doi:10.7910/DVN/9JI06R
 *   → data.latestVersion.license.name = "CC0 1.0" (checked 2026-11-17; fetchRaw re-reads it and refuses to
 *   cache otherwise).
 *
 *  DOWNLOAD: the file is one member of a 1.36 GB replication.zip. fetchRaw reads the archive's central
 *  directory from its tail (HTTP Range), finds the member by NAME, and fetches and inflates only its bytes
 *  (13.5 MB compressed). Nothing about the archive's layout is written here; the file id is looked up by
 *  the file NAME in the dataset's latest version.
 * ==========================================================================*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { robustUnion } from '../build-hist-admin-recon.mjs';

const DOI = '10.7910/DVN/9JI06R';
const DATAVERSE = 'https://dataverse.harvard.edu';
const ARCHIVE = 'replication.zip';
const MEMBER = 'replication/data/col_units_full.geojson';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REVIEW = path.join(HERE, 'mullercrepon-review.json');

export const SOURCE = {
  key: 'mullercrepon',
  publisher: 'Carl Müller-Crepon (London School of Economics), via Harvard Dataverse',
  title: 'Colonial administrative units of Sub-Saharan Africa, 1895–1964 (col_units_full)',
  url: 'https://doi.org/' + DOI,
  download: `${DATAVERSE}/api/access/datafile/<id of ${ARCHIVE} in the latest version of doi:${DOI}> (member ${MEMBER}, read by Range)`,
  licence: 'CC0 1.0 (outer frames follow CShapes 2.0, CC BY-NC-SA 4.0)',
  licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  licenceStatedAt: `${DATAVERSE}/api/datasets/:persistentId/?persistentId=doi:${DOI} : latestVersion.license.name = "CC0 1.0"`,
  nonCommercial: true,
  shareAlike: true,
  inheritedTerms: 'The outer frame of 13 of the 95 snapshots coincides with CShapes 2.0 (Schvitz et al. 2022, CC BY-NC-SA 4.0) to the square kilometre (scripts/histsurveys/mullercrepon.mjs --frames); a CC0 label downstream does not lift the upstream share-alike, non-commercial terms, so this record ships beside CShapes under them.',
  citation: 'Müller-Crepon, Carl. Replication Data for: Ethnic Geography and the Colonial Design of Administrative Units in Sub-Saharan Africa. Harvard Dataverse, doi:10.7910/DVN/9JI06R (CC0 1.0). Comparative Political Studies.',
};

const CACHE = path.join(os.tmpdir(), 'intmap-histsurveys-cache', 'mullercrepon');
const DATA = path.join(CACHE, 'col_units_full.geojson');
const STAMP = path.join(CACHE, 'licence.json');

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error('mullercrepon HTTP ' + r.status + ' ' + url);
  return r.json();
}
async function range(url, spec) {
  const r = await fetch(url, { headers: { Range: 'bytes=' + spec }, signal: AbortSignal.timeout(600000) });
  if (r.status !== 206) throw new Error('mullercrepon: the host did not answer a Range request (' + r.status + ')');
  return { buf: Buffer.from(await r.arrayBuffer()), total: Number(String(r.headers.get('content-range') || '').split('/')[1]) };
}

/* the zip's central directory, read from the archive's own end records (zip64 when the offsets need it) */
export function centralDirectory(tail, tailStart) {
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('mullercrepon: no end-of-central-directory record in the archive tail');
  let cdOff = tail.readUInt32LE(eocd + 16), cdSize = tail.readUInt32LE(eocd + 12);
  if (cdOff === 0xffffffff || cdSize === 0xffffffff) {
    const loc = eocd - 20;
    if (tail.readUInt32LE(loc) !== 0x07064b50) throw new Error('mullercrepon: zip64 locator missing');
    const rec = Number(tail.readBigUInt64LE(loc + 8)) - tailStart;
    if (tail.readUInt32LE(rec) !== 0x06064b50) throw new Error('mullercrepon: zip64 end record missing');
    cdSize = Number(tail.readBigUInt64LE(rec + 40)); cdOff = Number(tail.readBigUInt64LE(rec + 48));
  }
  const start = cdOff - tailStart;
  if (start < 0) throw new Error('mullercrepon: central directory lies before the tail read — read a longer tail');
  const out = new Map();
  for (let i = start; i < start + cdSize;) {
    if (tail.readUInt32LE(i) !== 0x02014b50) throw new Error('mullercrepon: bad central directory entry');
    const n = tail.readUInt16LE(i + 28), e = tail.readUInt16LE(i + 30), c = tail.readUInt16LE(i + 32);
    const name = tail.subarray(i + 46, i + 46 + n).toString('utf8');
    let csz = tail.readUInt32LE(i + 20), usz = tail.readUInt32LE(i + 24), off = tail.readUInt32LE(i + 42);
    for (let x = i + 46 + n; x < i + 46 + n + e;) {
      const id = tail.readUInt16LE(x), l = tail.readUInt16LE(x + 2);
      if (id === 1) { let p = x + 4; if (usz === 0xffffffff) { usz = Number(tail.readBigUInt64LE(p)); p += 8; } if (csz === 0xffffffff) { csz = Number(tail.readBigUInt64LE(p)); p += 8; } if (off === 0xffffffff) off = Number(tail.readBigUInt64LE(p)); }
      x += 4 + l;
    }
    out.set(name, { method: tail.readUInt16LE(i + 10), csz, usz, off });
    i += 46 + n + e + c;
  }
  return out;
}

export async function fetchRaw() {
  fs.mkdirSync(CACHE, { recursive: true });
  if (fs.existsSync(DATA) && fs.existsSync(STAMP)) return CACHE;
  const ds = await getJson(`${DATAVERSE}/api/datasets/:persistentId/?persistentId=doi:${DOI}`);
  const v = ds.data.latestVersion;
  if (!v.license || v.license.name !== 'CC0 1.0') throw new Error('mullercrepon licence is no longer CC0 1.0: ' + JSON.stringify(v.license));
  const file = v.files.find((f) => f.dataFile.filename === ARCHIVE);
  if (!file) throw new Error('mullercrepon: no ' + ARCHIVE + ' in the latest version');
  const url = `${DATAVERSE}/api/access/datafile/${file.dataFile.id}`;
  const { buf: tail, total } = await range(url, '-4194304');
  const cd = centralDirectory(tail, total - tail.length);
  const m = cd.get(MEMBER);
  if (!m) throw new Error('mullercrepon: ' + MEMBER + ' is not in the archive');
  const { buf } = await range(url, m.off + '-' + (m.off + 30 + 65535 * 2 + m.csz));
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error('mullercrepon: no local header at the member offset');
  const body = buf.subarray(30 + buf.readUInt16LE(26) + buf.readUInt16LE(28)).subarray(0, m.csz);
  const raw = m.method === 8 ? zlib.inflateRawSync(body) : m.method === 0 ? body : null;
  if (!raw || raw.length !== m.usz) throw new Error('mullercrepon: member did not inflate to its stated size');
  fs.writeFileSync(DATA + '.part', raw); fs.renameSync(DATA + '.part', DATA);
  fs.writeFileSync(STAMP, JSON.stringify({ checked: new Date().toISOString().slice(0, 10), licence: v.license.name, version: v.versionNumber + '.' + v.versionMinorNumber, fileId: file.dataFile.id, sha256: crypto.createHash('sha256').update(raw).digest('hex') }));
  return CACHE;
}

const r5 = (n) => Math.round(n * 1e5) / 1e5;
function ringClean(ring) {
  const out = [];
  for (const [x, y] of ring) { const p = [r5(x), r5(y)]; const q = out[out.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push(p); }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push([out[0][0], out[0][1]]);
  return out.length >= 4 ? out : null;
}
const toMulti = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map((poly) => poly.map(ringClean).filter(Boolean)).filter((p) => p.length && p[0]);
const keyOf = (p) => p.iso3c + ' ' + p.year;
const norm = (s) => String(s == null ? '' : s).trim();

export function snapshots() {
  if (!fs.existsSync(DATA)) throw new Error('mullercrepon cache missing — run with --fetch first');
  const j = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const g = new Map();
  for (const f of j.features) { const k = keyOf(f.properties); if (!g.has(k)) g.set(k, []); g.get(k).push(f); }
  return g;
}

/* a date the review states: { date: 'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD', precision } */
const isoOf = (d) => { const s = String(d.date); return /^-?\d+$/.test(s) ? s + '-01-01' : /^-?\d+-\d\d$/.test(s) ? s + '-01' : s; };

export async function harvest() {
  if (!fs.existsSync(STAMP)) throw new Error('mullercrepon cache missing — run with --fetch first');
  const review = JSON.parse(fs.readFileSync(REVIEW, 'utf8')).snapshots;
  const units = [], dropped = [];
  for (const [k, feats] of snapshots()) {
    const R = review[k];
    if (!R) throw new Error('mullercrepon: snapshot «' + k + '» is in the data but not in ' + path.basename(REVIEW) + ' — review it before it can be drawn');
    const [iso, yearStr] = k.split(' '), year = +yearStr;
    if (R.level === 'exclude') { dropped.push({ id: 'mullercrepon:' + k, name: k, reason: 'snapshot excluded by review: ' + R.why }); continue; }
    if (R.level !== 'region' && R.level !== 'district') throw new Error('mullercrepon: review level for ' + k + ' is «' + R.level + '»');
    const field = R.level;
    /* an exclusion names a polygon by the fields it gives: { region } drops a whole region, { region, district }
       or { district } drops that district before any union */
    const offOf = (p) => (R.excludeUnits || []).find((x) => ['region', 'district'].every((fld) => x[fld] == null || norm(x[fld]) === norm(p[fld])));
    const groups = new Map();
    for (const f of feats) {
      const name = norm(f.properties[field]);
      const off = offOf(f.properties);
      if (off) { dropped.push({ id: 'mullercrepon:' + k + ':' + (norm(f.properties.region) || '-') + '/' + (norm(f.properties.district) || '-'), name, reason: 'unit excluded by review: ' + off.why }); continue; }
      if (!name) { dropped.push({ id: 'mullercrepon:' + k + ':?', name: null, reason: 'no ' + field + ' name' }); continue; }
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(toMulti(f.geometry));
    }
    const sov = f0(feats).colbrit ? 'GBR' : f0(feats).colfrnc ? 'FRA' : R.sovereign;
    if (!sov) throw new Error('mullercrepon: review gives no sovereign for ' + k + ' (neither colbrit nor colfrnc)');
    const from = R.inForceFrom ? isoOf(R.inForceFrom) : year + '-01-01';
    const fromP = R.inForceFrom ? R.inForceFrom.precision : 'year';
    const to = R.inForceTo ? isoOf(R.inForceTo) : (year + 1) + '-01-01';
    const toP = R.inForceTo ? R.inForceTo.precision : 'year';
    for (const [name, parts] of groups) {
      const coords = parts.length === 1 ? parts[0] : robustUnion(parts, k + ' ' + name, () => {});
      const en = (R.names && R.names[name]) || name;
      units.push({
        id: 'mullercrepon:' + k + ':' + name,
        name: en,
        names: { en },
        ...(en === name ? {} : { publisherSpelling: name }),
        start: from, startPrecision: fromP,
        end: to, endPrecision: toP,
        ...(R.inForceTo ? {} : { endDerived: true, endBasis: 'the publisher states this layout for its ' + year + ' map only' }),
        sovereign: sov,
        kind: (R.term && R.term.en) || field,
        coords,
      });
    }
  }
  return { source: SOURCE, units, dropped };
}
const f0 = (feats) => feats[0].properties;

export function admits() { return true; }

/* ── --frames: each snapshot's union against CShapes 2.0 on 1 July of its year (header, point 3) ── */
async function frames() {
  const vm = await import('node:vm');
  const { default: pc } = await import('polygon-clipping');
  const turf = await import('@turf/turf');
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(HERE, '..', '..', 'data', 'cshapes.js'), 'utf8'), ctx);
  const C = ctx.window.__CSHAPES;
  const ymd = (y, m, d) => y * 10000 + m * 100 + d;
  const km2 = (mp) => (mp.length ? turf.area({ type: 'MultiPolygon', coordinates: mp }) / 1e6 : 0);
  for (const [k, feats] of [...snapshots()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const t = ymd(+k.split(' ')[1], 7, 1);
    let U;
    try { U = robustUnion(feats.map((f) => toMulti(f.geometry)), k, () => {}); } catch (e) { console.log(k.padEnd(9), 'union failed:', e.message.slice(0, 80)); continue; }
    const pts = feats.map((f) => { try { return turf.pointOnFeature(f).geometry.coordinates; } catch { return null; } }).filter(Boolean);
    const hit = new Map();
    for (const f of C.feats) {
      if (ymd(f[2], f[3], f[4]) > t || ymd(f[5], f[6], f[7]) < t) continue;
      const mp = f[8].map((p) => p.map((ri) => C.rings[ri]));
      if (pts.some((p) => turf.booleanPointInPolygon(p, { type: 'MultiPolygon', coordinates: mp }))) hit.set(f[0], mp);
    }
    const CS = hit.size ? robustUnion([...hit.values()], 'cshapes ' + k, () => {}) : [];
    const out = km2(pc.difference(U, CS)), miss = km2(CS.length ? pc.difference(CS, U) : []);
    console.log(k.padEnd(9), 'area', Math.round(km2(U)), '| CShapes', [...hit.keys()].join(' + ') || '-', Math.round(km2(CS)), '| outside', Math.round(out), '| not covered', Math.round(miss));
  }
}

/* ── CLI ── */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--fetch')) console.log('cached:', await fetchRaw());
  if (args.includes('--frames')) await frames();
  if (args.includes('--summary')) {
    const { units, dropped } = await harvest();
    const count = (a, f) => a.reduce((m, x) => (m[f(x)] = (m[f(x)] || 0) + 1, m), {});
    console.log('units:', units.length, ' dropped:', dropped.length);
    console.log('by sovereign:', JSON.stringify(count(units, (u) => u.sovereign)));
    console.log('by kind:', JSON.stringify(count(units, (u) => u.kind)));
    for (const d of dropped) console.log('  dropped', d.id, '|', d.reason);
  }
}
