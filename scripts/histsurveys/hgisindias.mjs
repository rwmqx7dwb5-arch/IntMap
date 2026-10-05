#!/usr/bin/env node
/* ============================================================================
 *  IntMap · HARVESTER — HGIS de las Indias (Werner Stangl, University of Graz), «Territorial gazetteer
 *  for Spanish America, 1701-1808» — the first-level SUBDIVISIONS inside the viceroyalties and
 *  captaincies-general of Spanish America («provincia mayor»: gobernaciones, capitanías generales,
 *  gobernaciones-intendencia …), each version with the years it stood, and the superior government
 *  («Nivel Superior Gobierno») it lay in.
 * ----------------------------------------------------------------------------
 *  WHAT IS READ, AND WHY NOT THE «BASEMAPS» DATASETS
 *   The three «Basemaps of …» datasets (Audiencias doi:10.7910/DVN/PCBLTF 111,163,250 B, Intendencias
 *   NBTU2E 327,475,016 B, Provinces RV4LTY 752,025,547 B) are RASTER: Audiencia.rar was downloaded
 *   2026-10-05 and holds 74 .png files and nothing else (one picture per unit and snapshot year). The
 *   vectors they were drawn from are the territorial gazetteer, doi:10.7910/DVN/YPEU5E (V4, 2023-10-26):
 *     «Shapefile and geopackage with information on territorial organization of the Spanish Empire in
 *      America, 1701-1808 (spatio-temporal objects), organized in 11 levels (principal divisions;
 *      audiencias; intendencies; larger provinces; provinces; smaller provinces; jurisdictions;
 *      districts; fiefdoms; archbishoprics; bishoprics; frontiers/uncontrolled areas), plus one
 *      representation of foreign European claims/possessions in the Americas of the period. Caution:
 *      Territorial entities may have 2 or more synchronic representations if reconstructed on more than
 *      one hierarchical level! Each object has a chronological validity marked by the fields START and
 *      END_»
 *   The shapefile edition is a .rar (212,512,676 B, MD5 stated by Dataverse and checked here); it holds
 *   one *_merge shapefile per level. Provincia_mayor_merge.* (the units) and Principal_merge.* (their
 *   parents) are extracted (Windows ships bsdtar as System32\tar.exe, which reads RAR).
 *
 *  WHICH LEVEL — Provincia_mayor
 *   Principal («Nivel Superior Gobierno», 5–10 units a year) is the viceroyalties and independent
 *   captaincies-general themselves, i.e. the outline IntMap's polity layer already draws; the
 *   subdivision a reader expects is the level below it. The project reconstructs the province three
 *   ways (conceptos/nivel-provincia: «reconstruimos tres niveles … la provincia mayor, la provincia y
 *   la provincia menor») and defines them as GOVERNMENT units:
 *     «Provincia menor: Cada entidad administrativa que tenía caracter territorial mayor … gobernada por
 *      un gobernador o alternativamente un oficial y "justicia mayor" de nombramiento real …»
 *     «Provincia: Aquí, las alcaldías mayores y corregimientos se incluyen dentro de la gobernación a la
 *      que nominalmente pertenecen.»
 *     «Provincia mayor: Aquí, gobernaciones subordinadas a otras gobernaciones o capitanías generales se
 *      incluyen en aquéllas. En los territorios de la reforma de intendencias … cada
 *      corregimiento-intendencia y gobernación (también si era sujeta a intendencia en Hacienda) se
 *      incluye por separado.»
 *   whereas the audiencia is judicial (conceptos/nivel-audiencia: «los territorios competentes de las
 *   audiencias … se excluyen las grandes fronteras») and the intendancy fiscal («en el aspecto que a
 *   todas les es común: la administración del ramo de Hacienda», conceptos/nivel-intendencia).
 *   Measured 2026-10-05 on a 0.1° grid, cos(lat)-weighted, share of the Principal ground covered
 *   [share of it outside the Fronteras level] / ground claimed by two different entities the same year:
 *                      1710            1750            1790            1805         double claims
 *     Provincia_mayor  90.3% [99.9]    84.7% [100.0]   87.0% [100.0]   93.5% [100.0]  none, any year 1701–1808
 *     Provincia        86.6% [99.9]    74.6% [100.0]   82.5% [100.0]   84.0% [100.0]  1790 Puebla×Tlaxcala
 *     Provincia_menor  83.3% [98.9]    72.7% [99.2]    81.5% [99.8]    82.9% [99.8]   1750 Izucar×Chietla, 1790 Puebla×Tlaxcala
 *     Audiencia        91.0% [100.0]   86.1% [100.0]   88.0% [100.0]   87.5% [100.0]  none at those years
 *     Intendencia      —               —               59.5% [74.1]    60.9% [77.1]   none at those years
 *   Provincia_mayor is the only GOVERNMENT level with no double claim; it covers every non-frontier
 *   cell of the Principal ground, like the (judicial) audiencias, and the frontier ground it leaves out
 *   is the project's «Fronteras» level, not a gap in the province map.
 *
 *  PARENT — DERIVED, not stated. The row column Niv_Ent_id is not a parent link (391 of 498 rows empty;
 *   where filled it names the superior government the province is the CORE of — «Chile» → SUCH0000).
 *   `parent` is the name of the Principal version that holds the largest share of the unit's ground in
 *   the unit's first year (0.1° grid; a unit smaller than one cell is placed by the cells its vertices
 *   fall in); if a different Principal entity holds it later in the unit's span, `parentChanges`
 *   lists [year, name, Entidad_ID]. `parentBasis` says so.
 *
 *  DATES — stated per row, year precision (conceptos/cronologia):
 *     «START_ Integer — Año a partir del cual un dato es válida.»
 *     «END_ Integer — Año hasta el cual un dato fue válido.»
 *   END_ IS INCLUSIVE: successive versions of one Entidad_ID start the year after the previous END_
 *   (Provincia_mayor: 421 of 424 successions; the three gaps are entities that ceased and came back —
 *   Honduras/Comayagua 1755→1787, Maracaibo 1739→1760, Maynas 1739→1784). The contract's `end` is
 *   exclusive, so end = (END_ + 1)-01-01.
 *   ⚠ The coverage edges are not events: START_ 1701 means «ya existió en el momento inicial del HGIS
 *   (1701)» and END_ 1808 «se presume válido en el momento final del HGIS (1808)» (cronologia, values
 *   `hgis` / `conceptos` of START_ex / END_ex — those two qualifier columns are not in the shapefile).
 *   A 1701 start is kept as 1701-01-01 with startDerived: true and a startBasis that says so (the unit
 *   was founded earlier; that date is not in this record). A 1808 end is NOT left open — the record
 *   says nothing past 1808, and an open end would draw a colonial gobernación into today — so it is
 *   closed at 1809-01-01 with endDerived: true and an endBasis that says the coverage stops there.
 *
 *  sovereign: every row of the province levels is a division of the Spanish Monarchy → 'ESP'.
 *   Portuguese Brazil and the other European powers are a separate level (Extranjero_merge:
 *   «territorios que se encontraban o fuera del dominio español o dentro del dominio pero efectivamente
 *   colonizadas por otras naciones», conceptos/nivel-extranjero) whose rows are whole nations, not
 *   subdivisions; that level is not read.
 *  names: es = upstream Nombre (as spelt upstream); upstream has no English name.
 *   Variantes (pipe-separated) are kept as `variants`.
 *  kind: upstream Tipo (Gobernacion, Gobernacion-Capitania General, Gobernacion-Intendencia, …).
 *  id: «<Entidad_ID>:<START>-<END_>» (unique per version).
 *
 *  LICENCE EVIDENCE (checked 2026-10-05 via the Dataverse native API, `termsOfUse` of each dataset):
 *   YPEU5E (read here), PCBLTF, NBTU2E, RV4LTY all state:
 *     «https://creativecommons.org/licenses/by-nc-sa/4.0/»
 *   and the project's home page links «The Indias Dataverse (for non-commercial use)».
 *   ⚠ NON-COMMERCIAL AND SHARE-ALIKE: units from this module belong in the separate non-commercial
 *   bundle (SOURCE.nonCommercial / SOURCE.shareAlike), never in the CC BY / CC0 one.
 *
 *  CITATION — Dataverse's own citation for the dataset (…/versions/:latest/citation, read 2026-10-05):
 *   «Stangl, Werner, 2019, "Data: Territorial gazetteer for Spanish America, 1701-1808",
 *    https://doi.org/10.7910/DVN/YPEU5E, Harvard Dataverse, V4»
 *   and the project form the collection's raw-data dataset (29XTPY, field `publication`) asks for:
 *   «Werner Stangl (ed.), HGIS de las Indias (2015ff.).»
 *
 *  CRS: every *_merge.prj = GCS_WGS_1984 → no reprojection. harvest() throws if one ever is not.
 *
 *  Usage:  node scripts/histsurveys/hgisindias.mjs --fetch     (network; fills and extracts the cache)
 *          node scripts/histsurveys/hgisindias.mjs --summary   (cache only)
 * ==========================================================================*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { shapefileParts, readShp, readDbf } from '../lib/elections-geo.mjs';

const DOI = 'doi:10.7910/DVN/YPEU5E';
const DATAVERSE = 'https://dataverse.harvard.edu';
const LEVEL = 'Provincia_mayor';      /* the *_merge shapefile of the units */
const PARENT_LEVEL = 'Principal';     /* the *_merge shapefile of the superior governments they lie in */
/* upstream's coverage edges (Dataverse timePeriodCovered 1701-01-01 … 1808-12-31; cronologia `hgis`/`conceptos`) */
const COVERAGE_START = 1701, COVERAGE_END = 1808;
/* grid of the parent assignment: the same 0.1° grid the level choice was measured on (header) */
const GRID = 0.1;

export const SOURCE = {
  key: 'hgisindias',
  publisher: 'HGIS de las Indias (Werner Stangl, University of Graz)',
  title: 'Territorial gazetteer for Spanish America, 1701-1808 — provincias mayores',
  url: 'https://doi.org/10.7910/DVN/YPEU5E',
  download: `${DATAVERSE}/api/access/datafile/<id of the shapefile .rar in the latest version of ${DOI}>`,
  licence: 'CC BY-NC-SA 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  licenceStatedAt: `${DATAVERSE}/api/datasets/:persistentId/?persistentId=${DOI} (termsOfUse)`,
  nonCommercial: true,
  shareAlike: true,
  citation: 'Stangl, Werner, 2019, "Data: Territorial gazetteer for Spanish America, 1701-1808", '
    + 'https://doi.org/10.7910/DVN/YPEU5E, Harvard Dataverse, V4. Werner Stangl (ed.), HGIS de las Indias (2015ff.).',
};

const CACHE = path.join(os.tmpdir(), 'intmap-histsurveys-cache', 'hgisindias');
const EXTRACT = path.join(CACHE, 'territorios');
const META = path.join(CACHE, 'dataset.json');

/* bsdtar reads RAR; Windows ships it as System32\tar.exe, elsewhere it is called bsdtar */
const TAR = process.platform === 'win32'
  ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
  : 'bsdtar';

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}
function md5(file) {
  const h = crypto.createHash('md5');
  const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(1 << 20);
  try { let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
  return h.digest('hex');
}

export async function fetchRaw() {
  fs.mkdirSync(CACHE, { recursive: true });
  const ds = (await getJson(`${DATAVERSE}/api/datasets/:persistentId/?persistentId=${DOI}`)).data.latestVersion;
  if (!/by-nc-sa\/4\.0/.test(ds.termsOfUse || '') && !/BY-NC-SA 4\.0/.test(ds.license?.name || '')) {
    throw new Error('hgisindias: the dataset no longer states CC BY-NC-SA 4.0 — re-read the licence: ' + (ds.termsOfUse || JSON.stringify(ds.license)));
  }
  /* the shapefile edition is the .rar the publisher describes as «Shapefile …» (the other is the geopackage) */
  const f = ds.files.find((x) => /\.rar$/i.test(x.dataFile.filename) && /shapefile/i.test(x.description || ''));
  if (!f) throw new Error('hgisindias: no shapefile .rar in the latest version of ' + DOI);
  const { id, filename, filesize } = f.dataFile;
  const want = f.dataFile.checksum?.type === 'MD5' ? f.dataFile.checksum.value : f.dataFile.md5;
  const rar = path.join(CACHE, filename);
  if (!(fs.existsSync(rar) && fs.statSync(rar).size === filesize && md5(rar) === want)) {
    const res = await fetch(`${DATAVERSE}/api/access/datafile/${id}`);
    if (!res.ok) throw new Error(`hgisindias download ${res.status} for datafile ${id}`);
    const part = rar + '.part';
    const out = fs.createWriteStream(part);
    for await (const chunk of res.body) if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
    const got = md5(part);
    if (got !== want) throw new Error(`hgisindias: MD5 ${got} ≠ ${want} stated by Dataverse for ${filename}`);
    fs.renameSync(part, rar);
  }
  fs.mkdirSync(EXTRACT, { recursive: true });
  execFileSync(TAR, ['-xf', rar, '-C', EXTRACT, `${LEVEL}_merge.*`, `${PARENT_LEVEL}_merge.*`], { stdio: 'inherit' });
  fs.writeFileSync(META, JSON.stringify({
    fetched: new Date().toISOString().slice(0, 10), datafile: id, filename, filesize, md5: want,
    version: `${ds.versionNumber}.${ds.versionMinorNumber}`, releaseTime: ds.releaseTime, termsOfUse: ds.termsOfUse,
  }, null, 1));
  return path.join(EXTRACT, `${LEVEL}_merge.shp`);
}

/* one level's shapefile → { rows, geoms }, refusing anything that is not geographic WGS84 */
function readLevel(level) {
  const read = (ext) => {
    const p = path.join(EXTRACT, `${level}_merge${ext}`);
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  };
  if (!read('.shp')) throw new Error(`hgisindias: no ${level}_merge.shp in ${EXTRACT} — run with --fetch first`);
  const p = shapefileParts(new Map(['.shp', '.dbf', '.prj', '.cpg'].map((e) => [`${level}_merge${e}`, read(e)]).filter(([, b]) => b)), `${level}_merge`);
  const prj = p.prj ? p.prj.toString('latin1') : '';
  if (!/GCS_WGS_1984|WGS_1984/i.test(prj) || /PROJCS/i.test(prj)) {
    throw new Error(`hgisindias ${level}.prj is not geographic WGS84 — reproject with proj4 first: ` + prj.slice(0, 120));
  }
  const enc = p.cpg ? p.cpg.toString('latin1').trim().toLowerCase().replace(/^utf-?8$/, 'utf8') : 'utf8';
  const rows = readDbf(p.dbf, enc);
  const geoms = readShp(p.shp);
  if (geoms.length !== rows.length) throw new Error(`hgisindias ${level}: shp ${geoms.length} / dbf ${rows.length} disagree`);
  return { rows, geoms };
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
  const res = [];
  for (const poly of polys) {
    const rings = poly.map(ringClean);
    if (!rings[0]) continue;                       /* outer ring collapsed — its holes go with it */
    res.push(rings.filter(Boolean));
  }
  return res.length ? { type: 'MultiPolygon', coordinates: res } : null;
}

/* ── the grid the parent is assigned on: the cells whose centres a polygon contains (even-odd scanline) ── */
const cellKey = (row, col) => row * 1e6 + col;
const cellOf = (x, y) => cellKey(Math.floor(y / GRID), Math.floor(x / GRID));
function cells(g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const rows = new Map();
  for (const poly of polys) for (const ring of poly) for (let i = 1; i < ring.length; i++) {
    const [x1, y1] = ring[i - 1], [x2, y2] = ring[i];
    if (y1 === y2) continue;
    const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
    for (let r = Math.ceil(lo / GRID - 0.5); (r + 0.5) * GRID < hi; r++) {
      const yc = (r + 0.5) * GRID;
      if (yc < lo) continue;
      let xs = rows.get(r); if (!xs) rows.set(r, (xs = []));
      xs.push(x1 + (yc - y1) * (x2 - x1) / (y2 - y1));
    }
  }
  const s = new Set();
  for (const [r, xs] of rows) {
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let c = Math.ceil(xs[k] / GRID - 0.5); (c + 0.5) * GRID < xs[k + 1]; c++) s.add(cellKey(r, c));
    }
  }
  return s;
}
/* a unit smaller than one cell contains no centre: place it by the cells its vertices fall in */
function vertexCells(g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const s = new Set();
  for (const poly of polys) for (const [x, y] of poly[0]) s.add(cellOf(x, y));
  return s;
}

export async function harvest() {
  const { rows, geoms } = readLevel(LEVEL);

  /* the parents: each Principal version's cells, by the years it stood */
  const par = readLevel(PARENT_LEVEL);
  const parents = par.rows.map((r, i) => ({ r, c: par.geoms[i] ? cells(par.geoms[i]) : new Set() }));
  par.geoms.length = 0;
  const parentAt = (sample, y) => {
    let best = null, bestN = 0;
    for (const p of parents) {
      if (!(p.r.START <= y && y <= p.r.END_)) continue;
      let n = 0; for (const c of sample) if (p.c.has(c)) n++;
      if (n > bestN) { bestN = n; best = p.r; }
    }
    return best;
  };
  /* the years inside a span at which the set of standing Principal versions changes */
  const parentYears = [...new Set(par.rows.map((r) => r.START))].sort((a, b) => a - b);

  const units = [], dropped = [];
  rows.forEach((r, i) => {
    const key = `${r.Entidad_ID}:${r.START}-${r.END_}`;
    const drop = (reason) => dropped.push({ id: key, name: r.Nombre || null, reason });
    if (r.Nivel !== LEVEL) { drop(`Nivel «${r.Nivel}» is not ${LEVEL}`); return; }
    if (!Number.isInteger(r.START)) { drop('no START year'); return; }
    if (!Number.isInteger(r.END_)) { drop('no END_ year'); return; }
    if (r.END_ < r.START) { drop('END_ before START'); return; }
    if (!r.Nombre) { drop('no name'); return; }
    if (!geoms[i]) { drop('no geometry'); return; }
    const coords = toMulti(geoms[i]);
    if (!coords) { drop('geometry empty after rounding'); return; }

    let sample = cells(geoms[i]);
    if (!sample.size) sample = vertexCells(geoms[i]);
    const first = parentAt(sample, r.START);
    const parentChanges = [];
    let last = first ? first.Entidad_ID : null;
    for (const y of parentYears) {
      if (y <= r.START || y > r.END_) continue;
      const p = parentAt(sample, y);
      const id = p ? p.Entidad_ID : null;
      if (id !== last) { parentChanges.push([y, p ? p.Nombre : null, id]); last = id; }
    }

    const atFloor = r.START <= COVERAGE_START, atCeiling = r.END_ >= COVERAGE_END;
    const variants = String(r.Variantes || '').split('|').map((s) => s.trim()).filter((s) => s && s !== r.Nombre);
    units.push({
      id: key,
      name: r.Nombre,
      names: { es: r.Nombre },
      variants,
      start: `${r.START}-01-01`, startPrecision: 'year',
      ...(atFloor ? { startDerived: true, startBasis: `coverage start of the publisher (${COVERAGE_START}): the unit already stood; its founding is not in this record` } : {}),
      end: `${r.END_ + 1}-01-01`, endPrecision: 'year',
      ...(atCeiling
        ? { endDerived: true, endBasis: `coverage end of the publisher (${COVERAGE_END}): the unit still stood; its end is not in this record` }
        : { endDerived: false, endBasis: 'stated END_ (inclusive year) + 1' }),
      sovereign: 'ESP',
      kind: r.Tipo,
      coords,
      parent: first ? first.Nombre : null,
      parentEntity: first ? first.Entidad_ID : null,
      ...(parentChanges.length ? { parentChanges } : {}),
      parentBasis: `derived: the ${PARENT_LEVEL} version holding the largest share of the unit's ground (${GRID}° grid) in its first year`,
      entity: r.Entidad_ID,
      seat: r.Cabecera || null,
      change: r.check || null,              /* why upstream opened this version: shapediffer / typediffer / entitydiffer */
      wiki: r.Wikilink || null,             /* page id in the project's DokuWiki apparatus */
    });
  });
  return { source: SOURCE, units, dropped };
}

/* Every row of this level is a division of the Spanish Monarchy (see header). A unit of any other
   sovereign would not be — none is harvested, and admits() says so if one ever is. */
export function admits(u) {
  if (u.sovereign !== 'ESP') return `not a division of the Spanish Monarchy (sovereign ${u.sovereign})`;
  return true;
}

/* ── CLI ── */
function count(arr, f) { const m = new Map(); for (const x of arr) { const k = f(x); m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); }
function vertices(c) { let n = 0; for (const poly of c.coordinates) for (const r of poly) n += r.length; return n; }

async function summary() {
  const { units, dropped } = await harvest();
  const out = [];
  out.push(`level: ${LEVEL} (parent: ${PARENT_LEVEL})`);
  out.push(`units: ${units.length}; entities: ${new Set(units.map((u) => u.entity)).size}`);
  out.push(`dropped: ${dropped.length}${dropped.length ? ' — ' + count(dropped, (d) => d.reason).map(([k, n]) => `${k} x${n}`).join('; ') : ''}`);
  out.push(`admitted: ${units.filter((u) => admits(u) === true).length}`);
  out.push('kinds: ' + count(units, (u) => u.kind).map(([k, n]) => `${k} ${n}`).join(', '));
  out.push('sovereign: ' + count(units, (u) => u.sovereign).map(([k, n]) => `${k} ${n}`).join(', '));
  out.push('start precision: ' + count(units, (u) => u.startPrecision + (u.startDerived ? ' (derived: coverage start)' : '')).map(([k, n]) => `${k} ${n}`).join(', '));
  out.push('end precision: ' + count(units, (u) => u.endPrecision + (u.endDerived ? ' (derived: coverage end)' : '')).map(([k, n]) => `${k} ${n}`).join(', '));
  out.push('change: ' + count(units, (u) => u.change).map(([k, n]) => `${k} ${n}`).join(', '));
  out.push('parent (first year): ' + count(units, (u) => u.parent).map(([k, n]) => `${k} ${n}`).join(', '));
  out.push(`parent changes within a version: ${units.filter((u) => u.parentChanges).length} — `
    + units.filter((u) => u.parentChanges).map((u) => `${u.name} ${u.start.slice(0, 4)}: ${u.parent}→${u.parentChanges.map(([y, n, e]) => `${n} [${e}] (${y})`).join('→')}`).join('; '));
  const starts = units.map((u) => u.start).sort(), ends = units.map((u) => u.end).sort();
  out.push(`earliest start: ${starts[0]}; latest start: ${starts[starts.length - 1]}; earliest end: ${ends[0]}; latest end: ${ends[ends.length - 1]}`);
  const inYear = (u, y) => +u.start.slice(0, 4) <= y && y < +u.end.slice(0, 4);
  let doubled = 0;
  for (let y = COVERAGE_START; y <= COVERAGE_END; y++) {
    const s = units.filter((u) => inYear(u, y));
    if (new Set(s.map((u) => u.entity)).size !== s.length) doubled++;
  }
  out.push(`years in which one entity has two versions: ${doubled}`);
  out.push('standing per year:');
  for (const y of [1701, 1710, 1750, 1775, 1790, 1805, 1808]) {
    const s = units.filter((u) => inYear(u, y));
    out.push(`  ${y}: ${s.length}`);
  }
  out.push(`total vertices: ${units.reduce((n, u) => n + vertices(u.coords), 0)}`);
  out.push('samples:');
  const step = Math.max(1, Math.floor(units.length / 10));
  for (let i = 0, k = 0; i < units.length && k < 10; i += step, k++) {
    const u = units[i];
    out.push(`  ${u.id} | ${u.name} | ${u.start} | ${u.end} | ${u.startPrecision}/${u.endPrecision}${u.startDerived ? ' start-derived' : ''}${u.endDerived ? ' end-derived' : ''} | ${u.kind} | parent ${u.parent} | ${u.sovereign}`);
  }
  console.log(out.join('\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a.includes('--fetch')) console.log('cached:', await fetchRaw());
  if (a.includes('--summary')) await summary();
  if (!a.includes('--fetch') && !a.includes('--summary')) console.log('usage: hgisindias.mjs --fetch | --summary');
}
