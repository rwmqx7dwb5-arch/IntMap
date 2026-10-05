/* ============================================================================
 *  IntMap · HARVESTER — Newberry Library, Atlas of Historical County Boundaries,
 *  «Historical States and Territories» (US, 3 Sep 1783 – 31 Dec 2000, dated to the day)
 * ----------------------------------------------------------------------------
 *  WHAT: one polygon per mappable version of every US state / territory / district, each with
 *  START_DATE and END_DATE (YYYYMMDD) and the statute citation for the change. Versions overlap
 *  in time and space by design (Newberry: "the shapefile includes many overlapping polygons").
 *
 *  LICENCE EVIDENCE (checked 2026-10-05):
 *   · https://publications.newberry.org/ahcb/about :
 *       "The Atlas data is released under Creative Commons CC0 1.0 Universal (Public Domain Dedication)."
 *   · https://publications.newberry.org/ahcb/download says out-of-date licence files inside some
 *     zips can be ignored.
 *   ⚠ THE ZIP ITSELF CONTAINS THE OUT-OF-DATE TEXT: Metadata1.htm (dated 2011-10-01) says
 *     «Rights: Attribution-NonCommercial-ShareAlike Creative Commons License» and the zip ships a
 *     zCreativeCommonsLicense/ folder. The provider's current pages supersede it (CC0); that
 *     contradiction is why the evidence cited here is the About page, not the zip.
 *
 *  FILE: US_AtlasHCB_StateTerr_Gen001.zip (14,809,750 bytes on 2026-10-05; «Generalized .001 deg»).
 *  CRS: .prj = GCS_WGS_1984 (geographic lon/lat) → no reprojection. harvest() throws if the .prj
 *  ever stops being geographic WGS84/NAD83 (then proj4 would be required).
 *
 *  END_DATE IS INCLUSIVE (the last day the version stands): Alaska Department END 1884-05-16, the
 *  next version Alaska District START 1884-05-17. The contract's `end` is exclusive, so +1 day.
 *  ⚠ END_DATE 2000-12-31 is the dataset's own coverage edge (Coverage.t.late), not a statement
 *  that the unit ceased; those rows get end = null (still standing when coverage stops).
 *
 *  sovereign: every row is a subdivision of the US ('USA'), pre-statehood territories included.
 *  id: «<ID>:v<VERSION>#<ID_NUM>» — ID_NUM is the provider's unique row key.
 *
 *  CITATION (Citation.PreferredStyle in the zip's Summary Metadata, quoted):
 *  «Siczewicz, Peter. U.S. Historical States and Territories (Generalized .001 deg). Emily Kelley,
 *  digital comp. Dataset. Atlas of Historical County Boundaries, ed. by John H. Long. Chicago:
 *  The Newberry Library, 2011.»
 * ==========================================================================*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipEntries, shapefileParts, readShp, readDbf } from '../lib/elections-geo.mjs';

export const SOURCE = {
  key: 'newberry',
  publisher: 'The Newberry Library',
  title: 'Atlas of Historical County Boundaries — states and territories',
  url: 'https://publications.newberry.org/ahcb/',
  download: 'https://publications.newberry.org/ahcb/downloads/gis/US_AtlasHCB_StateTerr_Gen001.zip',
  licence: 'CC0 1.0',
  licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  licenceStatedAt: 'https://publications.newberry.org/ahcb/about',
  citation: 'Siczewicz, Peter. U.S. Historical States and Territories (Generalized .001 deg). Emily Kelley, digital comp. Dataset. Atlas of Historical County Boundaries, ed. by John H. Long. Chicago: The Newberry Library, 2011.',
};

const CACHE = path.join(os.tmpdir(), 'intmap-histsurveys-cache', 'newberry');
const ZIP = path.join(CACHE, 'US_AtlasHCB_StateTerr_Gen001.zip');
/* upstream's last coverage day (Coverage.t.late in the zip's metadata) */
const COVERAGE_END = '20001231';

export async function fetchRaw() {
  if (fs.existsSync(ZIP) && fs.statSync(ZIP).size > 1e6) return ZIP;
  fs.mkdirSync(CACHE, { recursive: true });
  const res = await fetch(SOURCE.download);
  if (!res.ok) throw new Error('newberry download ' + res.status + ' ' + SOURCE.download);
  fs.writeFileSync(ZIP + '.part', Buffer.from(await res.arrayBuffer()));
  fs.renameSync(ZIP + '.part', ZIP);
  return ZIP;
}

const iso = (s) => s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
function nextDay(s) {
  const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8) + 1));
  return d.toISOString().slice(0, 10);
}
const r4 = (n) => Math.round(n * 1e4) / 1e4;
function ringClean(ring) {
  const out = [];
  for (const [x, y] of ring) {
    const p = [r4(x), r4(y)];
    const q = out[out.length - 1];
    if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push(p);
  }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push([out[0][0], out[0][1]]);
  return out.length >= 4 ? out : null;
}
function toMulti(g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.map((poly) => poly.map(ringClean).filter(Boolean)).filter((poly) => poly.length);
}

export async function harvest() {
  if (!fs.existsSync(ZIP)) throw new Error('newberry cache missing — run with --fetch first');
  const entries = zipEntries(fs.readFileSync(ZIP));
  const p = shapefileParts(entries, 'US_HistStateTerr_Gen001');
  if (!p.shp || !p.dbf) throw new Error('newberry zip: .shp/.dbf not found');
  const prj = p.prj ? p.prj.toString('latin1') : '';
  if (!/WGS_1984|NAD_1983|NAD83/i.test(prj) || /PROJCS/i.test(prj)) {
    throw new Error('newberry .prj is not geographic WGS84/NAD83 — reproject with proj4 first: ' + prj.slice(0, 120));
  }
  const geoms = readShp(p.shp);
  const rows = readDbf(p.dbf, 'utf8');
  if (geoms.length !== rows.length) throw new Error('shp/dbf disagree');
  const units = [], dropped = [];
  rows.forEach((r, i) => {
    const key = r.ID + ':v' + r.VERSION + '#' + r.ID_NUM;
    const sd = String(r.START_DATE || '').trim(), ed = String(r.END_DATE || '').trim();
    if (!/^\d{8}$/.test(sd)) { dropped.push({ id: key, name: r.NAME, reason: 'no START_DATE' }); return; }
    if (ed && !/^\d{8}$/.test(ed)) { dropped.push({ id: key, name: r.NAME, reason: 'unparseable END_DATE' }); return; }
    if (!geoms[i]) { dropped.push({ id: key, name: r.NAME, reason: 'no geometry' }); return; }
    const coords = toMulti(geoms[i]);
    if (!coords.length) { dropped.push({ id: key, name: r.NAME, reason: 'geometry empty after rounding' }); return; }
    const open = !ed || ed === COVERAGE_END;
    units.push({
      id: key,
      name: r.NAME,
      names: { en: r.NAME },
      start: iso(sd), startPrecision: 'day',
      end: open ? null : nextDay(ed), endPrecision: open ? 'year' : 'day',
      sovereign: 'USA',
      kind: r.TERR_TYPE,
      coords,
      change: r.CHANGE,
      citation: r.CITATION,
    });
  });
  return { source: SOURCE, units, dropped };
}

/* ── CLI ── */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--fetch')) console.log('cached:', await fetchRaw());
  if (args.includes('--summary')) {
    const { units, dropped } = await harvest();
    const count = (a, f) => a.reduce((m, x) => (m[f(x)] = (m[f(x)] || 0) + 1, m), {});
    const verts = units.reduce((n, u) => n + u.coords.reduce((a, poly) => a + poly.reduce((b, ring) => b + ring.length, 0), 0), 0);
    const starts = units.map((u) => u.start).sort(), ends = units.map((u) => u.end).filter(Boolean).sort();
    console.log('units:', units.length);
    console.log('dropped:', dropped.length, JSON.stringify(count(dropped, (d) => d.reason)));
    console.log('kinds:', JSON.stringify(count(units, (u) => u.kind)));
    console.log('open-ended (end=null):', units.filter((u) => !u.end).length);
    console.log('earliest start:', starts[0], ' latest start:', starts[starts.length - 1]);
    console.log('earliest end:', ends[0], ' latest end:', ends[ends.length - 1]);
    console.log('distinct names:', new Set(units.map((u) => u.name)).size);
    console.log('total vertices:', verts);
    console.log('samples:');
    for (const i of [0, 40, 90, 150, units.length - 1]) { const u = units[i]; console.log('  ', u.name, '|', u.start, '|', u.end, '|', u.kind); }
  }
}

/* (hist-coverage-depth) WHICH ROWS ARE FIRST-LEVEL SUBDIVISIONS OF THE UNITED STATES — Newberry's own
   TERR_TYPE decides, not a list of names. «State», «Territory», «Unorganized Territory» and «District of
   Columbia» are the Union's own divisions. «Other» is what Newberry files outside them: measured
   2026-10-05 it is five rows — the Vermont Republic (1783-91) and the Republic of Texas (1836-45),
   sovereign states; Oregon Country (1818-46), held jointly with Britain; the proposed State of
   Deseret (1849-51), never admitted; and an «Uncertain Boundary Area» (1804-18). None is a
   subdivision of the US, and drawing one as a province would say it was. */
export function admits(u) {
  return u.kind === 'Other' ? 'not a subdivision of the United States (Newberry TERR_TYPE «Other»)' : true;
}
