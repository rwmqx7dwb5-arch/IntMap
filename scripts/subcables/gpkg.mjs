/* ============================================================================
 *  IntMap · subcables — a minimal GeoPackage / WKB reader
 * ----------------------------------------------------------------------------
 *  NOAA's Office for Coastal Management publishes the Marine Cadastre submarine
 *  cable layer as one 8 MB GeoPackage. Reading THAT — rather than paging 2,816
 *  features through the ArcGIS REST endpoint 2,000 at a time — makes the build
 *  reproducible from a single archived download (AGENTS.md §20) and keeps the
 *  pipeline off a service whose paging window can change under it.
 *
 *  A GeoPackage is a SQLite file (node:sqlite reads it) whose geometry column
 *  holds the GPKG binary header followed by standard WKB. Only the geometry
 *  types this pipeline actually meets are decoded: Point, LineString, Polygon
 *  and their Multi/Collection forms. Anything else throws rather than being
 *  silently skipped — a source that changed shape must stop the build.
 * ==========================================================================*/
import { DatabaseSync } from 'node:sqlite';

/* ── WKB → GeoJSON geometry ────────────────────────────────────────────────── */
function readWKB(buf, pos) {
  const order = buf[pos]; pos += 1;
  const le = order === 1;
  const u32 = () => { const v = le ? buf.readUInt32LE(pos) : buf.readUInt32BE(pos); pos += 4; return v; };
  const f64 = () => { const v = le ? buf.readDoubleLE(pos) : buf.readDoubleBE(pos); pos += 8; return v; };
  let type = u32();
  /* ISO WKB puts dimensionality in the thousands digit (1000 = Z, 2000 = M, 3000 = ZM);
     EWKB puts it in high bits. Strip both and remember how many ordinates a point has. */
  let dims = 2;
  if (type & 0x80000000) { dims += 1; type &= ~0x80000000; }
  if (type & 0x40000000) { dims += 1; type &= ~0x40000000; }
  const base = type % 1000, band = Math.floor(type / 1000);
  if (band === 1 || band === 2) dims = Math.max(dims, 3);
  else if (band === 3) dims = Math.max(dims, 4);

  const pt = () => { const x = f64(), y = f64(); for (let k = 2; k < dims; k++) f64(); return [x, y]; };
  const ring = () => { const n = u32(), out = new Array(n); for (let i = 0; i < n; i++) out[i] = pt(); return out; };

  let geom;
  if (base === 1) geom = { type: 'Point', coordinates: pt() };
  else if (base === 2) geom = { type: 'LineString', coordinates: ring() };
  else if (base === 3) { const n = u32(), out = new Array(n); for (let i = 0; i < n; i++) out[i] = ring(); geom = { type: 'Polygon', coordinates: out }; }
  else if (base === 4 || base === 5 || base === 6 || base === 7) {
    const n = u32(), parts = new Array(n);
    for (let i = 0; i < n; i++) { const r = readWKB(buf, pos); parts[i] = r.geom; pos = r.pos; }
    if (base === 4) geom = { type: 'MultiPoint', coordinates: parts.map(g => g.coordinates) };
    else if (base === 5) geom = { type: 'MultiLineString', coordinates: parts.map(g => g.coordinates) };
    else if (base === 6) geom = { type: 'MultiPolygon', coordinates: parts.map(g => g.coordinates) };
    else geom = { type: 'GeometryCollection', geometries: parts };
  } else throw new Error('unsupported WKB geometry type ' + type);
  return { geom, pos };
}

/* ── the GPKG geometry BLOB: "GP" magic, version, flags, optional envelope, WKB ─ */
export function gpkgGeometry(blob) {
  const b = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  if (b.length < 8 || b[0] !== 0x47 || b[1] !== 0x50) throw new Error('not a GeoPackage geometry blob');
  const flags = b[3];
  const envIndicator = (flags >> 1) & 0x07;
  const envDoubles = [0, 4, 6, 6, 8][envIndicator];
  if (envDoubles === undefined) throw new Error('bad GPKG envelope indicator ' + envIndicator);
  if (flags & 0x01) { /* empty geometry */ }
  return readWKB(b, 8 + envDoubles * 8).geom;
}

/* ── every feature of a GeoPackage feature table, as GeoJSON ───────────────── */
export function readGpkg(file, table) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const t = table || db.prepare("select table_name from gpkg_contents where data_type='features' limit 1").get().table_name;
    const geomCol = db.prepare('select column_name from gpkg_geometry_columns where table_name=?').get(t).column_name;
    const rows = db.prepare('select * from "' + t.replace(/"/g, '""') + '"').all();
    return rows.map(r => {
      const props = {}; let geom = null;
      for (const k in r) { if (k === geomCol) { geom = r[k] ? gpkgGeometry(r[k]) : null; } else props[k] = r[k]; }
      return { type: 'Feature', properties: props, geometry: geom };
    });
  } finally { db.close(); }
}
