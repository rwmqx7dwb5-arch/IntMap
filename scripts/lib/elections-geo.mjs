/* ============================================================================
 *  IntMap · THE FORMATS ELECTORAL GEOGRAPHY ACTUALLY ARRIVES IN   (#R582)
 * ----------------------------------------------------------------------------
 *  Nine electoral commissions publish their district maps in six different containers and not one
 *  of them is «a GeoJSON file at a stable URL». What they do publish, measured on 2026-09-09:
 *
 *    · shapefile inside a ZIP  — Germany (bundeswahlleiterin.de, dl-de/by-2.0), the Harvard CC0
 *                                German 1980–2025 series, Australia's AEC, the US Census cartographic
 *                                files. This is the single commonest form and nothing in the repo
 *                                could read it before this file.
 *    · an ArcGIS FeatureServer — Britain (ONS), the United States (Census TIGERweb), Australia
 *                                (Digital Atlas), Hong Kong (CSDI). These speak GeoJSON if asked,
 *                                but only in pages, and only if told how much detail to drop.
 *    · plain GeoJSON           — France, Japan, South Korea.
 *    · Web Mercator metres     — Russia's 225 single-mandate districts arrive in EPSG:3857.
 *
 *  ⚠ NO NEW RUNTIME DEPENDENCY. Everything below is Node's own zlib plus arithmetic. The two
 *  libraries this round add (`xlsx`, `pdfjs-dist`) are devDependencies for a different problem
 *  — Japan's results, which the ministry publishes only as BIFF8 workbooks and as PDF — and neither
 *  of them ever reaches the browser.
 * ==========================================================================*/
import { inflateRawSync } from 'node:zlib';

/* ══ ZIP ═══════════════════════════════════════════════════════════════════════════════════════
   Walks the central directory and returns members as Buffers. ⚠ The reader in
   scripts/build-gazetteer.mjs does the same walk but decodes every member to UTF-8 text, which a
   .shp cannot survive; this one stays binary and lets the caller decide. */
export function zipEntries(buf, { nameEncoding = 'utf8' } = {}) {
  let eocd = -1;
  for (let p = buf.length - 22; p >= 0 && p > buf.length - 66000; p--) {
    if (buf.readUInt32LE(p) === 0x06054b50) { eocd = p; break; }
  }
  if (eocd < 0) throw new Error('not a zip (no end-of-central-directory)');
  let n = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  /* ⚠ ZIP64: a 4 GB / 65 535-entry archive stores −1 in those fields and the real ones in a ZIP64
     record before the EOCD. Australia's 22 MB and Germany's 5.7 MB are far below it, but a silent
     wrong answer here would look like «the file has one member called \xff\xff». */
  if (n === 0xffff || off === 0xffffffff) throw new Error('zip64 archives are not supported');
  const out = new Map();
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('bad central directory entry');
    const flags = buf.readUInt16LE(off + 8);
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const cmtLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    /* ⚠ MEMBER NAMES ARE NOT NECESSARILY UTF-8, AND THE ARCHIVE SAYS WHICH. General-purpose bit 11
       is the «names are UTF-8» flag; without it the encoding is whatever the packer's code page was
       — MEASURED: Taiwan's Central Election Commission ships voteData.zip with Big5 member names,
       and decoding those as UTF-8 produces replacement characters, so the member cannot be found by
       name at all. The caller passes the code page it knows the publisher used. */
    const enc = (flags & 0x800) ? 'utf8' : nameEncoding;
    const nameBytes = buf.subarray(off + 46, off + 46 + nameLen);
    const name = new TextDecoder(enc, { fatal: false }).decode(nameBytes);
    if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error('bad local header for ' + name);
    const lNameLen = buf.readUInt16LE(localOff + 26), lExtraLen = buf.readUInt16LE(localOff + 28);
    const at = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(at, at + compSize);
    out.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

/** The members of a shapefile set, found by extension rather than by a written-out file name —
 *  every publisher names the set differently and a hard-coded stem is exactly the kind of list
 *  `.agents/rules/no-ad-hoc-hardcoding.md` forbids. */
export function shapefileParts(entries, stem) {
  const pick = (ext) => {
    for (const [name, buf] of entries) {
      if (!name.toLowerCase().endsWith(ext)) continue;
      if (stem && !name.toLowerCase().includes(stem.toLowerCase())) continue;
      return buf;
    }
    return null;
  };
  return { shp: pick('.shp'), dbf: pick('.dbf'), prj: pick('.prj'), cpg: pick('.cpg') };
}

/* ══ DBF ═══════════════════════════════════════════════════════════════════════════════════════
   dBASE III/IV as shipped beside a .shp. Only the field types that actually occur in boundary
   files are decoded; anything else is returned as its trimmed text so that a caller can see it
   rather than receive a silently wrong number. */
export function readDbf(buf, encoding = 'utf8') {
  const headerLen = buf.readUInt16LE(8);
  const recLen = buf.readUInt16LE(10);
  const count = buf.readUInt32LE(4);
  const fields = [];
  for (let p = 32; p < headerLen - 1 && buf[p] !== 0x0d; p += 32) {
    let name = buf.toString('latin1', p, p + 11); name = name.slice(0, name.indexOf('\0') + 1 ? name.indexOf('\0') : 11);
    fields.push({ name: name.replace(/\0.*$/, '').trim(), type: String.fromCharCode(buf[p + 11]), len: buf[p + 16] });
  }
  const rows = [];
  const dec = new TextDecoder(encoding, { fatal: false });
  for (let i = 0; i < count; i++) {
    let p = headerLen + i * recLen;
    if (buf[p] === 0x2a) { p += recLen; continue; }   /* 0x2A marks a deleted record */
    p += 1;
    const row = {};
    for (const f of fields) {
      const raw = buf.subarray(p, p + f.len); p += f.len;
      const s = dec.decode(raw).replace(/\0/g, '').trim();
      if (f.type === 'N' || f.type === 'F') row[f.name] = s === '' ? null : Number(s);
      else if (f.type === 'L') row[f.name] = /^[YyTt]$/.test(s) ? true : (/^[NnFf]$/.test(s) ? false : null);
      else row[f.name] = s;
    }
    rows.push(row);
  }
  return rows;
}

/* ══ SHP ═══════════════════════════════════════════════════════════════════════════════════════
   Only the polygon shape types, because a district is an area. ⚠ A shapefile POLYGON record does
   not say which rings are holes — the ORIENTATION does (clockwise outer, counter-clockwise inner),
   and GeoJSON's own winding rule is the opposite one. Getting this wrong does not throw; it draws
   lakes as districts. */
const AREA_TYPES = new Set([5, 15, 25]);   /* Polygon, PolygonZ, PolygonM */

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
  }
  return a / 2;
}

export function readShp(buf) {
  if (buf.readInt32BE(0) !== 9994) throw new Error('not a .shp');
  const out = [];
  let p = 100;
  while (p + 8 <= buf.length) {
    const contentLen = buf.readInt32BE(p + 4) * 2;
    const body = p + 8;
    const type = buf.readInt32LE(body);
    p = body + contentLen;
    if (type === 0) { out.push(null); continue; }        /* null shape — a real record with no shape */
    if (!AREA_TYPES.has(type)) throw new Error('shape type ' + type + ' is not an area');
    const numParts = buf.readInt32LE(body + 36);
    const numPoints = buf.readInt32LE(body + 40);
    const partsAt = body + 44;
    const ptsAt = partsAt + numParts * 4;
    const starts = [];
    for (let i = 0; i < numParts; i++) starts.push(buf.readInt32LE(partsAt + i * 4));
    const rings = [];
    for (let i = 0; i < numParts; i++) {
      const from = starts[i], to = (i + 1 < numParts ? starts[i + 1] : numPoints);
      const ring = [];
      for (let k = from; k < to; k++) {
        ring.push([buf.readDoubleLE(ptsAt + k * 16), buf.readDoubleLE(ptsAt + k * 16 + 8)]);
      }
      rings.push(ring);
    }
    /* group by winding: a clockwise ring (negative shoelace area in x-y order) opens a new polygon,
       a counter-clockwise ring is a hole in the polygon that opened last */
    const polys = [];
    for (const ring of rings) {
      if (ringArea(ring) < 0 || !polys.length) polys.push([ring]);
      else polys[polys.length - 1].push(ring);
    }
    out.push(polys.length === 1
      ? { type: 'Polygon', coordinates: polys[0] }
      : { type: 'MultiPolygon', coordinates: polys });
  }
  return out;
}

/** shapefile set → GeoJSON FeatureCollection. `encoding` matters: German and Korean sets are not
 *  UTF-8, and the .cpg member says so when the publisher bothered to write one. */
export function shapefileToGeoJSON(entries, { stem = '', encoding = null } = {}) {
  const { shp, dbf, cpg } = shapefileParts(entries, stem);
  if (!shp || !dbf) throw new Error('zip has no .shp/.dbf' + (stem ? ' matching «' + stem + '»' : ''));
  let enc = encoding;
  if (!enc && cpg) {
    const t = cpg.toString('latin1').trim().toLowerCase();
    enc = /utf-?8/.test(t) ? 'utf8' : (/1252|ansi|latin/.test(t) ? 'windows-1252' : null);
  }
  const geoms = readShp(shp);
  const rows = readDbf(dbf, enc || 'utf8');
  if (geoms.length !== rows.length) throw new Error('shp/dbf disagree: ' + geoms.length + ' vs ' + rows.length);
  const features = [];
  for (let i = 0; i < rows.length; i++) {
    if (!geoms[i]) continue;
    features.push({ type: 'Feature', properties: rows[i], geometry: geoms[i] });
  }
  return { type: 'FeatureCollection', features };
}

/* ══ PROJECTION ════════════════════════════════════════════════════════════════════════════════
   ⚠ Russia's district file arrives in EPSG:3857 metres (measured: 4400332.73, 5591944.79). Feeding
   those straight to MapLibre does not fail — it draws 225 districts somewhere off Africa. */
export function webMercatorToWgs84(coord) {
  const R = 6378137;
  const lon = coord[0] / R * 180 / Math.PI;
  const lat = (2 * Math.atan(Math.exp(coord[1] / R)) - Math.PI / 2) * 180 / Math.PI;
  return [lon, lat];
}

/** Apply a per-coordinate function to every position of a FeatureCollection, in place. */
export function mapCoords(fc, fn) {
  const walk = (c) => (typeof c[0] === 'number' ? fn(c) : c.map(walk));
  for (const f of fc.features) if (f.geometry) f.geometry.coordinates = walk(f.geometry.coordinates);
  return fc;
}

/* ══ SIMPLIFICATION ════════════════════════════════════════════════════════════════════════════
   「歴史的境界も含めて全部高解像度実装」 — the reader asked for high resolution, so this is not a
   budget cut. It removes the vertices that carry no visible shape at web zooms and rounds what
   remains to a fixed number of decimals.
   ⚠ THE TOLERANCE IS IN DEGREES AND IT IS THE CALLER'S, not a constant here, because a degree of
   longitude is 111 km at the equator and 56 km at Berlin: one number cannot mean the same thing to
   Australia and to Hong Kong's ten constituencies. Each pack states the tolerance it used and why.
   ⚠ RINGS ARE NEVER DROPPED BELOW FOUR POINTS and a ring that collapses is discarded whole, not
   left as a two-point sliver that MapLibre renders as an invisible degenerate polygon. */
function douglasPeucker(pts, tol) {
  if (pts.length <= 2) return pts;
  let maxD = -1, idx = 0;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay;
  const den = dx * dx + dy * dy;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    let d;
    if (den === 0) { d = Math.hypot(px - ax, py - ay); }
    else {
      let t = ((px - ax) * dx + (py - ay) * dy) / den;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
  return douglasPeucker(pts.slice(0, idx + 1), tol).slice(0, -1).concat(douglasPeucker(pts.slice(idx), tol));
}

export function simplifyGeoJSON(fc, { tolerance, decimals = 5 } = {}) {
  const round = (n) => Math.round(n * 10 ** decimals) / 10 ** decimals;
  const doRing = (ring) => {
    let r = tolerance > 0 ? douglasPeucker(ring, tolerance) : ring.slice();
    r = r.map(([x, y]) => [round(x), round(y)]);
    /* de-duplicate consecutive identical points created by rounding */
    const out = [r[0]];
    for (let i = 1; i < r.length; i++) if (r[i][0] !== out[out.length - 1][0] || r[i][1] !== out[out.length - 1][1]) out.push(r[i]);
    if (out.length < 4) return null;
    if (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1]) out.push([out[0][0], out[0][1]]);
    return out.length >= 4 ? out : null;
  };
  for (const f of fc.features) {
    if (!f.geometry) continue;
    if (f.geometry.type === 'Polygon') {
      const rings = f.geometry.coordinates.map(doRing).filter(Boolean);
      f.geometry = rings.length ? { type: 'Polygon', coordinates: rings } : null;
    } else if (f.geometry.type === 'MultiPolygon') {
      const polys = f.geometry.coordinates
        .map(poly => poly.map(doRing).filter(Boolean))
        .filter(poly => poly.length);
      f.geometry = polys.length ? (polys.length === 1
        ? { type: 'Polygon', coordinates: polys[0] }
        : { type: 'MultiPolygon', coordinates: polys }) : null;
    }
  }
  /* ⚠ A FEATURE WHOSE GEOMETRY VANISHED IS AN ERROR, NOT A FEATURE TO DROP. Dropping it would take
     a district off the map and the join check in elections-schema.mjs would then blame the results
     file for a hole this function made. */
  const lost = fc.features.filter(f => !f.geometry).map(f => JSON.stringify(f.properties).slice(0, 80));
  if (lost.length) throw new Error('simplify(' + tolerance + ') erased ' + lost.length + ' feature(s): ' + lost.slice(0, 3).join(' | '));
  return fc;
}

/** Merge several features into one, by unioning their rings. Used where a constituency IS several
 *  administrative units (Japan's two 合区 upper-house seats, Taiwan's districts built from villages).
 *  ⚠ This is a ring-level union, not a topological one: it is correct only when the inputs do not
 *  overlap, which is true of administrative partitions and is asserted by the caller. */
export function mergeFeatures(features) {
  const polys = [];
  for (const f of features) {
    if (!f.geometry) continue;
    if (f.geometry.type === 'Polygon') polys.push(f.geometry.coordinates);
    else if (f.geometry.type === 'MultiPolygon') polys.push(...f.geometry.coordinates);
  }
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
}
