#!/usr/bin/env node
/* ============================================================================
 *  IntMap · HARVESTER — Virtual Shanghai (ENP-China / MCGD), «Provinces in Republican China»
 *  (Christian Henriot, cartographer Pierre-Henri Dubois; 1912–1949, five period layers)
 * ----------------------------------------------------------------------------
 *  WHAT: the provincial boundaries and names of Republican China as five PERIOD LAYERS, each a
 *  whole-country map that the publisher dates by its file name and by the field-group prefix
 *  (p_12_21 = 1912–1921, p_22_28 = 1922–1928, p_28_45 = 1928–1945, p_45_46 = 1945–1946,
 *  p_47_49 = 1947–1949). Page text: «There were five different configurations during the Republican era.»
 *  Per period the table carries: a 0/1 marker of attachment, the province name in pinyin (_na), the
 *  country (_co) and the name in Chinese characters (_nz).
 *
 *  UPSTREAM  https://www.virtualshanghai.net/Maps/Base?ID=2210  (read 2026-10-05)
 *    files   https://www.virtualshanghai.net/Asset/Source/vcMap_ID-2210_No-01.zip … No-10.zip
 *            the page lists them as 01 1912_1921 · 02 1922_1928 · 03 1928_1945 · 04 1945_1946 ·
 *            05 1947-1949 (each GeoPackage, 8–267 KB) and 06 1912-1921_orig · 07 1922_1928_Orig ·
 *            08 1928_1945_Orig · 09 1945_1946_Orig · 10 1947-1949_Orig (shapefile «_Orig» variants).
 *    ⚠ MEASURED 2026-10-05: No-07 … No-10 answer HTTP 404 «none not found» although the page links
 *      them (No-01 … No-06 download). ⚠ No-01's GeoPackage holds the table but ZERO features (the
 *      zip's .gpkg is 114 688 bytes with a 4 KB write-ahead log that was never checkpointed); the
 *      1912–1921 geometry therefore comes from No-06's shapefile. harvest() picks, per period, the
 *      first source that has features, so a repaired No-01 or a restored No-07…10 changes nothing
 *      here and an empty one is never mistaken for a period with no provinces.
 *    CRS: both variants are EPSG:3857 (GPKG srs_id 3857; the .prj is WGS_1984_Web_Mercator_Auxiliary_
 *      Sphere) → un-projected with webMercatorToWgs84. harvest() throws if either stops being 3857.
 *    SQLite: GeoPackage needs it — `node:sqlite` (Node ≥ 22.5; this repo's Node 24 has it, behind an
 *      ExperimentalWarning). It is imported lazily so that merely importing SOURCE never needs it.
 *
 *  LICENCE EVIDENCE (checked 2026-10-05)
 *   · The page's «License» block reads, verbatim: «Creative Commons License CC0 1.0 Universal»
 *     (and, in the badge's title text, «Creative Commons CC0 1.0 Universal Public Domain Dedication.»).
 *   · Every GeoPackage row repeats it: License = «CC0 1.0 Universal», Copyright = «ENP-China Project»,
 *     Cartograph = «Pierre-Henri Dubois».
 *   · Page «Author(s)» Christian Henriot; «Cartographer(s)» Pierre-Henri Dubois; «Year range» 1912-1949;
 *     «Last update: Friday 19 June 2026».
 *
 *  DATES — WHAT THE PUBLISHER STATES, AND WHAT THIS MODULE DERIVES
 *   · Each period is stated as a span of whole YEARS («1922–1928», «1947–1949»). The start is
 *     `YYYY-01-01` at year precision and the end is the first day of the year AFTER the last stated
 *     year (the exclusive form of «until 1928»), year precision, endDerived false — the publisher
 *     states the period. The publisher states no month or day anywhere.
 *   · ⚠ THE PUBLISHER'S SPANS TOUCH AND OVERLAP IN A SHARED YEAR: «1922–1928» and «1928–1945» both
 *     contain 1928; «1928–1945» and «1945–1946» both contain 1945. The earlier layer is therefore
 *     CUT where the later one begins (end = the later layer's start, endDerived true, endBasis says
 *     so): 1922–28 ends 1928-01-01 and 1928–45 ends 1945-01-01. That is a choice made here, not a
 *     statement of the publisher — which year-half the two maps meet in is not stated upstream.
 *     «1912–1921» → «1922–1928» and «1945–1946» → «1947–1949» abut with no shared year and are kept
 *     as stated (end derived false).
 *
 *  NAMES
 *   · names.en  = the pinyin name of that period (_na), verbatim (upstream spellings: Chahaer, Jehol,
 *     Chuanbian → Xikang from 1928, Fengtian → Liaoning from 1928, Xizang, Xing'an …).
 *   · names['zh-Hant'] = the Chinese-character name of that period (_nz). MEASURED: the characters are
 *     TRADITIONAL (川邊 熱河 寧夏 綏遠 陝西 黑龍江 遼寧 興安 嫩江), so the key is zh-Hant, not zh.
 *   · A name is not shared across periods: the layer's own period column decides (Chuanbian 1912–28,
 *     Xikang 1928–49; Fengtian 1912–28, Liaoning 1928–46).
 *
 *  kind: upstream has no type field. The dataset is titled «Provinces in Republican China» and the
 *  columns are «Name of the province …», so kind = 'province' is the publisher's own word, applied to
 *  every row (that includes units the Republic itself called special administrative areas, Jehol,
 *  Chahar, Suiyuan, Chuanbian…, which the publisher also files as provinces).
 *
 *  sovereign / admits — upstream's own «Country» column (_co) decides, not a list of names:
 *   · _co = «China» → sovereign 'CHN' (the Republic of China).
 *   · any other value is a unit the publisher does NOT file under China in that period. MEASURED
 *     2026-10-05: Xizang (_co «Xizang», all five periods), Xinjiang (_co «Xinjiang», all five),
 *     Mongolia (_co «Mongolia», 1912–1921 only), Taiwan (_co «Taiwan», 1945–1946 and 1947–1949 —
 *     spelled «Taïwan» in the 1947–49 table). Those units are KEPT in `units` with sovereign null and
 *     `country` carrying the upstream text, and admits() refuses them, because drawing them as
 *     provinces of China would assert what the publisher's own column does not.
 *     ⚠ THAT LEAVES TIBET, XINJIANG (all periods), OUTER MONGOLIA (1912–21) AND TAIWAN (1945–49)
 *     UNCOVERED by the admitted set: a decision for the caller, not for this module.
 *
 *  id: «virtualshanghai:<YYYY>-<YYYY>:<s_id>» (s_id = the publisher's province number, shared across
 *  layers); rows with no s_id (units that exist only from 1945/1947) use «f<fid>» of that layer.
 *
 *  CITATION: Christian Henriot (author), Pierre-Henri Dubois (cartographer), «Provinces in Republican
 *  China», Virtual Shanghai / ENP-China Project, https://www.virtualshanghai.net/Maps/Base?ID=2210
 *  (CC0 1.0 Universal).
 *
 *  Usage:  node scripts/histsurveys/virtualshanghai.mjs --fetch      (network; fills the cache)
 *          node scripts/histsurveys/virtualshanghai.mjs --summary    (cache only)
 * ==========================================================================*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipEntries, shapefileParts, readShp, readDbf, webMercatorToWgs84 } from '../lib/elections-geo.mjs';

const PAGE = 'https://www.virtualshanghai.net/Maps/Base?ID=2210';
const FILE = (n) => `https://www.virtualshanghai.net/Asset/Source/vcMap_ID-2210_No-${String(n).padStart(2, '0')}.zip`;
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const SOURCE = {
  key: 'virtualshanghai',
  publisher: 'Virtual Shanghai (ENP-China Project)',
  title: 'Provinces in Republican China, 1912-1949',
  url: PAGE,
  download: 'https://www.virtualshanghai.net/Asset/Source/vcMap_ID-2210_No-01.zip … No-10.zip',
  licence: 'CC0 1.0',
  licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  licenceStatedAt: PAGE,
  citation: 'Christian Henriot (author), Pierre-Henri Dubois (cartographer), Provinces in Republican China, '
    + 'Virtual Shanghai / ENP-China Project, https://www.virtualshanghai.net/Maps/Base?ID=2210 (CC0 1.0 Universal).',
};

const CACHE = path.join(os.tmpdir(), 'intmap-histsurveys-cache', 'virtualshanghai');
const zipPath = (n) => path.join(CACHE, `No-${String(n).padStart(2, '0')}.zip`);
const missPath = (n) => path.join(CACHE, `No-${String(n).padStart(2, '0')}.404`);

/* One request per file; a 404 is an OBSERVED upstream answer (No-07…10 on 2026-10-05) and is cached as
   such so harvest() does not read a missing file as an empty one. */
export async function fetchRaw() {
  fs.mkdirSync(CACHE, { recursive: true });
  for (const n of NUMBERS) {
    if (fs.existsSync(zipPath(n)) || fs.existsSync(missPath(n))) continue;
    const res = await fetch(FILE(n), { signal: AbortSignal.timeout(120000) });
    const buf = Buffer.from(await res.arrayBuffer());
    if (res.status === 404 || buf.length < 1000) { fs.writeFileSync(missPath(n), `HTTP ${res.status} ${buf.length} bytes ${FILE(n)}\n`); continue; }
    if (!res.ok) throw new Error('virtualshanghai download ' + res.status + ' ' + FILE(n));
    fs.writeFileSync(zipPath(n) + '.part', buf);
    fs.renameSync(zipPath(n) + '.part', zipPath(n));
  }
  return CACHE;
}

const r4 = (n) => Math.round(n * 1e4) / 1e4;
function ringClean(ring) {
  const out = [];
  for (const c of ring) {
    const [x, y] = webMercatorToWgs84(c);
    const p = [r4(x), r4(y)];
    const q = out[out.length - 1];
    if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push(p);
  }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push([out[0][0], out[0][1]]);
  return out.length >= 4 ? out : null;
}
function toMulti(g) {
  if (!g) return [];
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.map((poly) => poly.map(ringClean).filter(Boolean)).filter((poly) => poly.length && poly[0]);
}

/* GeoPackage binary → GeoJSON polygon geometry (header: «GP», version, flags, srs_id, optional envelope;
   body: ISO/OGC WKB, little- or big-endian per its own byte-order byte; no Z/M expected, refused if present). */
function gpkgGeometry(blob) {
  const b = Buffer.from(blob);
  if (b[0] !== 0x47 || b[1] !== 0x50) throw new Error('virtualshanghai: not a GeoPackage geometry');
  const flags = b[3];
  if (flags & 0x20) throw new Error('virtualshanghai: extended GeoPackage geometry');
  if (flags & 0x10) return null;                                   /* empty geometry */
  const env = [0, 32, 48, 48, 64][(flags >> 1) & 7];
  if (env === undefined) throw new Error('virtualshanghai: bad envelope flag');
  let p = 8 + env;
  const readGeom = () => {
    const le = b[p] === 1; p += 1;
    const u32 = () => { const v = le ? b.readUInt32LE(p) : b.readUInt32BE(p); p += 4; return v; };
    const f64 = () => { const v = le ? b.readDoubleLE(p) : b.readDoubleBE(p); p += 8; return v; };
    const type = u32();
    if (type !== 3 && type !== 6) throw new Error('virtualshanghai: WKB type ' + type + ' is not a polygon');
    const polygon = () => { const rings = []; for (let r = u32(), i = 0; i < r; i++) { const ring = []; for (let n = u32(), k = 0; k < n; k++) { const x = f64(); ring.push([x, f64()]); } rings.push(ring); } return rings; };
    if (type === 3) return { type: 'Polygon', coordinates: polygon() };
    const polys = [];
    for (let n = u32(), i = 0; i < n; i++) { const g = readGeom(); polys.push(g.coordinates); }
    return { type: 'MultiPolygon', coordinates: polys };
  };
  return readGeom();
}

const periodOf = (name) => { const m = /(\d{4})[_-](\d{4})/.exec(name); return m ? [+m[1], +m[2]] : null; };

/* every source in the cache → { period:[a,b], variant, rows:[{props, geometry}] }, features un-projected later */
async function readSources() {
  const out = [], notes = [];
  for (const n of NUMBERS) {
    if (fs.existsSync(missPath(n))) { notes.push(`No-${n}: ${fs.readFileSync(missPath(n), 'utf8').trim()}`); continue; }
    if (!fs.existsSync(zipPath(n))) throw new Error('virtualshanghai cache missing — run with --fetch first');
    const entries = zipEntries(fs.readFileSync(zipPath(n)));
    const names = [...entries.keys()].filter((k) => !k.startsWith('__MACOSX'));
    const gpkg = names.find((k) => k.toLowerCase().endsWith('.gpkg'));
    if (gpkg) {
      const { DatabaseSync } = await import('node:sqlite');
      const f = path.join(CACHE, `No-${String(n).padStart(2, '0')}.gpkg`);
      fs.writeFileSync(f, entries.get(gpkg));
      const db = new DatabaseSync(f, { readOnly: true });
      const crs = db.prepare("select c.table_name t, c.srs_id s from gpkg_contents c where c.data_type = 'features'").all();
      if (crs.length !== 1) throw new Error('virtualshanghai No-' + n + ': expected one feature table, got ' + crs.length);
      if (+crs[0].s !== 3857) throw new Error('virtualshanghai No-' + n + ' srs_id ' + crs[0].s + ' is not 3857 — reproject first');
      const period = periodOf(crs[0].t) || periodOf(gpkg);
      const geomCol = db.prepare('select column_name c from gpkg_geometry_columns where table_name = ?').get(crs[0].t).c;
      const rows = db.prepare(`select * from "${crs[0].t}"`).all().map((r) => {
        const g = r[geomCol]; const props = { ...r }; delete props[geomCol];
        return { props: { ...props }, geometry: g ? gpkgGeometry(g) : null };
      });
      db.close();
      out.push({ n, period, variant: 'gpkg', rows });
      continue;
    }
    const p = shapefileParts(entries, '');
    if (!p.shp || !p.dbf) { notes.push(`No-${n}: neither .gpkg nor .shp`); continue; }
    const prj = p.prj ? p.prj.toString('latin1') : '';
    if (!/Web_Mercator/i.test(prj)) throw new Error('virtualshanghai No-' + n + ' .prj is not Web Mercator: ' + prj.slice(0, 120));
    const shpName = [...entries.keys()].find((k) => k.toLowerCase().endsWith('.shp') && !k.startsWith('__MACOSX'));
    const geoms = readShp(p.shp), recs = readDbf(p.dbf, 'utf8');
    if (geoms.length !== recs.length) throw new Error('virtualshanghai No-' + n + ' shp/dbf disagree');
    out.push({ n, period: periodOf(shpName), variant: 'shp', rows: recs.map((props, i) => ({ props, geometry: geoms[i] })) });
  }
  return { sources: out, notes };
}

const clean = (s) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim());

export async function harvest() {
  const { sources, notes } = await readSources();
  const dropped = notes.map((x) => ({ id: 'file', name: null, reason: 'upstream file unavailable — ' + x }));
  /* per period: the first source that actually has features (see header: No-01's table is empty) */
  const periods = new Map();
  for (const s of sources) {
    if (!s.period) { dropped.push({ id: 'No-' + s.n, name: null, reason: 'no period in file/table name' }); continue; }
    if (!s.rows.length) { dropped.push({ id: 'No-' + s.n, name: null, reason: `${s.variant} for ${s.period.join('-')} holds no features` }); continue; }
    const key = s.period.join('-');
    if (!periods.has(key)) periods.set(key, s);
  }
  const order = [...periods.values()].sort((a, b) => a.period[0] - b.period[0] || a.period[1] - b.period[1]);
  const units = [];
  order.forEach((s, i) => {
    const [a, b] = s.period;
    const pre = `p_${String(a).slice(2)}_${String(b).slice(2)}`;
    const next = order[i + 1];
    /* the stated end is the year after the last stated year; a later layer that starts at or before it cuts this one */
    let end = `${b + 1}-01-01`, endDerived = false;
    let endBasis = `publisher states the period ${a}–${b}; end is the first day of ${b + 1} (exclusive)`;
    if (next && next.period[0] < b + 1) {
      end = `${next.period[0]}-01-01`; endDerived = true;
      endBasis = `publisher states ${a}–${b} but the next layer (${next.period.join('–')}) shares year ${next.period[0]}; `
        + `cut where the next layer starts (not stated upstream which half-year they meet in)`;
    }
    for (const { props: r, geometry } of s.rows) {
      const fid = r.fid_1 ?? r.fid ?? r.db_yg23f_h;
      const sid = clean(r.s_id);
      const id = `virtualshanghai:${a}-${b}:${sid || 'f' + fid}`;
      if (!(r[pre] === 1 || r[pre] === '1')) { dropped.push({ id, name: clean(r[pre + '_na']) || null, reason: `not attached to the ${a}–${b} layer (${pre} = ${r[pre]})` }); continue; }
      const en = clean(r[pre + '_na']);
      if (!en) { dropped.push({ id, name: null, reason: 'no pinyin name' }); continue; }
      if (!geometry) { dropped.push({ id, name: en, reason: 'no geometry' }); continue; }
      const coords = toMulti(geometry);
      if (!coords.length) { dropped.push({ id, name: en, reason: 'geometry empty after rounding' }); continue; }
      const zh = clean(r[pre + '_nz']), country = clean(r[pre + '_co']);
      units.push({
        id,
        name: en,
        names: zh ? { en, 'zh-Hant': zh } : { en },
        start: `${a}-01-01`, startPrecision: 'year',
        end, endPrecision: 'year', endDerived, endBasis,
        sovereign: country === 'China' ? 'CHN' : null,
        kind: 'province',
        coords,
        country,
        period: `${a}-${b}`,
        source: s.variant === 'gpkg' ? `No-${String(s.n).padStart(2, '0')} GeoPackage` : `No-${String(s.n).padStart(2, '0')} shapefile`,
      });
    }
  });
  const ids = new Set();
  for (const u of units) { if (ids.has(u.id)) throw new Error('virtualshanghai duplicate id ' + u.id); ids.add(u.id); }
  return { source: SOURCE, units, dropped };
}

/* Which rows are first-level units of the Republic of China AS THE PUBLISHER STATES THEM: its own
   «Country» column (_co) must say «China». The refused rows are Xizang, Xinjiang (all periods), Mongolia
   (1912–21) and Taiwan (1945–49) — see the header; the reason carries the upstream text. */
export function admits(u) {
  return u.sovereign === 'CHN' ? true : `publisher's Country column says «${u.country}», not China`;
}

/* ── CLI ── */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--fetch')) console.log('cached:', await fetchRaw());
  if (args.includes('--summary')) {
    const { units, dropped } = await harvest();
    const count = (a, f) => a.reduce((m, x) => (m[f(x)] = (m[f(x)] || 0) + 1, m), {});
    const verts = units.reduce((n, u) => n + u.coords.reduce((a, poly) => a + poly.reduce((b, ring) => b + ring.length, 0), 0), 0);
    console.log('units:', units.length);
    console.log('dropped:', dropped.length, JSON.stringify(count(dropped, (d) => d.reason)));
    console.log('per period layer:');
    for (const p of [...new Set(units.map((u) => u.period))]) {
      const us = units.filter((u) => u.period === p);
      console.log(`  ${p}: ${us.length} units (${us.filter((u) => admits(u) === true).length} admitted) | ${us[0].start} → ${us[0].end} | endDerived ${us[0].endDerived} | from ${us[0].source}`);
    }
    console.log('kinds:', JSON.stringify(count(units, (u) => u.kind)));
    console.log('sovereign:', JSON.stringify(count(units, (u) => String(u.sovereign))));
    console.log('refused by admits():', JSON.stringify(count(units.filter((u) => admits(u) !== true), (u) => u.name + ' ' + u.period)));
    console.log('name changes:', [...new Set(units.filter((u) => u.names['zh-Hant']).map((u) => u.id.split(':')[2]))].map((sid) => {
      const ns = units.filter((u) => u.id.split(':')[2] === sid).map((u) => u.name); return new Set(ns).size > 1 ? sid + '=' + [...new Set(ns)].join('>') : null;
    }).filter(Boolean).join('; '));
    console.log('distinct names:', new Set(units.map((u) => u.name)).size, ' total vertices:', verts);
    console.log('samples:');
    for (const i of [0, 12, 29, 45, 70, units.length - 1]) { const u = units[i]; console.log('  ', u.id, '|', u.name, '|', u.names['zh-Hant'] || '-', '|', u.start, '→', u.end, '|', u.startPrecision + '/' + u.endPrecision, '|', u.kind, '|', u.sovereign, '|', u.coords.length + ' polys'); }
  }
}
