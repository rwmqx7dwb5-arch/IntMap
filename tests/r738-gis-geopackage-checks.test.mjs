/* ============================================================================
 *  #R738 · GeoPackage — IntMap reads SQLite itself, and refuses by name
 * ----------------------------------------------------------------------------
 *  What js/gis-geopackage.js claims, and therefore what has to stay true:
 *
 *    ① a point, a line and a polygon WITH A HOLE come back with the file's own coordinates
 *    ② a geometry too big for one page comes back WHOLE — the overflow chain is followed
 *    ③ "01100" arrives as "01100": a text column is text, and the leading zero is a code (#R735)
 *    ④ two readable tables and no name is a REFUSAL with the list, not a silent first-one
 *    ⑤ a SQLite file with no gpkg_contents is `gpkg-not-a-geopackage`
 *    ⑥ an `attributes` table — rows with no geometry — is WORK: features with geometry null
 *    ⑦ the coordinate system comes back as the file states it: EPSG code AND the WKT
 *    ⑧ a table spanning several pages is read through its interior page, in the file's row order
 *    ⑨ Z does not enter the position — it travels in `_z`, parallel to the positions
 *    ⑩ the refusals that protect the reader: not SQLite, WAL, tiles, an unknown table name
 *
 *  ⚠ THE FIXTURES ARE ENCODED HERE, BYTE BY BYTE, AND NOTHING BINARY IS COMMITTED. The encoder
 *  below writes real SQLite: the 100-byte header, table b-tree leaf AND interior pages, cell
 *  pointer arrays, varints, the record format's serial types, and the overflow chain. That is the
 *  point — a fixture produced by the same assumptions as the reader would pass for either of them
 *  being wrong, so these bytes are laid out from the published format
 *  (https://sqlite.org/fileformat.html) and from GeoPackage 1.3 §2.1.3, not from the reader.
 *
 *  ⚠ ② IS THE ONE THAT FAILS SILENTLY IN THE FIELD. A truncated WKB does not throw: it parses into
 *  a smaller, plausible polygon. So the test does not ask 「did it parse」 — it asks whether every
 *  one of the 3,000 vertices written is the vertex read back.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window = globalThis.window || {};
const { makeGisGeopackage } = await import('../js/gis-geopackage.js');
const GPKG = makeGisGeopackage();

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   A · A MINIMAL SQLITE WRITER (fixtures only — the product never writes a byte)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

const enc = new TextEncoder();

function varintBytes(n) {
  let v = BigInt(n);
  /* ⚠ A ROWID IS A SIGNED 64-BIT INTEGER and gpkg_spatial_ref_sys really does carry srs_id −1
     (the standard's "undefined cartesian" row), so a negative rowid is not a hypothetical: it is
     written the only way the format allows, as the full nine-byte form. */
  if (v < 0n) {
    const x = BigInt.asUintN(64, v);
    const out = [Number(x & 0xffn)];                               /* the ninth byte carries eight bits */
    let hi = x >> 8n;
    for (let i = 0; i < 8; i++) { out.unshift(Number(hi & 0x7fn)); hi >>= 7n; }
    for (let i = 0; i < 8; i++) out[i] |= 0x80;                    /* the first eight say 「more follows」 */
    return Uint8Array.from(out);
  }
  const out = [];
  do { out.unshift(Number(v & 0x7fn)); v >>= 7n; } while (v > 0n);
  for (let i = 0; i < out.length - 1; i++) out[i] |= 0x80;
  return Uint8Array.from(out);
}

/* The smallest signed big-endian width the format offers: 1,2,3,4,6,8 bytes = serial types 1…6. */
function intCell(value) {
  const b = BigInt(value);
  for (const [bytes, type] of [[1, 1], [2, 2], [3, 3], [4, 4], [6, 5], [8, 6]]) {
    if (BigInt.asIntN(bytes * 8, b) !== b) continue;
    const out = new Uint8Array(bytes);
    let x = BigInt.asUintN(bytes * 8, b);
    for (let i = bytes - 1; i >= 0; i--) { out[i] = Number(x & 0xffn); x >>= 8n; }
    return { type, bytes: out };
  }
  throw new Error('fixture: integer wider than 64 bits');
}

function concat(chunks) {
  let n = 0; for (const c of chunks) n += c.length;
  const out = new Uint8Array(n);
  let p = 0; for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

/* fileformat.html §2.1 — a record is [header size][serial types…][values…]. */
function encodeRecord(values) {
  const types = [], body = [];
  for (const v of values) {
    if (v === null || v === undefined) { types.push(0); continue; }
    if (v instanceof Uint8Array) { types.push(12 + v.length * 2); body.push(v); continue; }
    if (typeof v === 'string') { const b = enc.encode(v); types.push(13 + b.length * 2); body.push(b); continue; }
    if (typeof v === 'number' && Number.isInteger(v)) { const c = intCell(v); types.push(c.type); body.push(c.bytes); continue; }
    if (typeof v === 'number') {
      const b = new Uint8Array(8);
      new DataView(b.buffer).setFloat64(0, v, false);              /* big-endian, like everything else here */
      types.push(7); body.push(b); continue;
    }
    throw new Error('fixture: unsupported value ' + typeof v);
  }
  const typeBytes = concat(types.map(varintBytes));
  let headerSize = typeBytes.length + 1;
  while (varintBytes(headerSize).length + typeBytes.length !== headerSize) headerSize = typeBytes.length + varintBytes(headerSize).length;
  return concat([varintBytes(headerSize), typeBytes, ...body]);
}

class Db {
  constructor(pageSize) {
    this.pageSize = pageSize;
    this.pages = [];
    this.alloc();                                                  /* page 1 */
  }
  alloc() { this.pages.push(new Uint8Array(this.pageSize)); return this.pages.length; }
  page(n) { return this.pages[n - 1]; }

  /* The same split the reader implements, written independently from the same paragraph of the
     specification — if either side rounds differently, ② fails. */
  localSize(payload) {
    const U = this.pageSize;                                       /* reserved = 0 in these fixtures */
    const maxLocal = U - 35;
    if (payload <= maxLocal) return payload;
    const minLocal = Math.floor(((U - 12) * 32) / 255) - 23;
    const k = minLocal + ((payload - minLocal) % (U - 4));
    return k <= maxLocal ? k : minLocal;
  }

  cellSize(rowid, payload) {
    const local = this.localSize(payload.length);
    return varintBytes(payload.length).length + varintBytes(rowid).length + local + (local < payload.length ? 4 : 0);
  }

  spill(payload, from) {
    /* Returns the first overflow page number, having written the whole chain. */
    let first = 0, prev = 0, at = from;
    while (at < payload.length) {
      const n = this.alloc();
      if (!first) first = n; else { const p = this.page(prev); new DataView(p.buffer).setUint32(0, n, false); }
      const take = Math.min(this.pageSize - 4, payload.length - at);
      this.page(n).set(payload.subarray(at, at + take), 4);
      at += take; prev = n;
    }
    return first;
  }

  writeLeaf(pageNo, cells) {
    const page = this.page(pageNo);
    const hdr = pageNo === 1 ? 100 : 0;
    let content = this.pageSize;
    const ptrs = [];
    for (const c of cells) {
      const local = this.localSize(c.payload.length);
      const over = local < c.payload.length ? this.spill(c.payload, local) : 0;
      const parts = [varintBytes(c.payload.length), varintBytes(c.rowid), c.payload.subarray(0, local)];
      if (over) { const t = new Uint8Array(4); new DataView(t.buffer).setUint32(0, over, false); parts.push(t); }
      const bytes = concat(parts);
      content -= bytes.length;
      if (content < hdr + 8 + 2 * (cells.length)) throw new Error('fixture: leaf overflowed its page');
      page.set(bytes, content);
      ptrs.push(content);
    }
    const dv = new DataView(page.buffer);
    page[hdr] = 0x0d;
    dv.setUint16(hdr + 1, 0, false);                               /* first freeblock */
    dv.setUint16(hdr + 3, cells.length, false);
    dv.setUint16(hdr + 5, content === 65536 ? 0 : content, false);
    page[hdr + 7] = 0;
    ptrs.forEach((p, i) => dv.setUint16(hdr + 8 + i * 2, p, false));
  }

  writeInterior(pageNo, kids, rightChild) {
    const page = this.page(pageNo);
    const hdr = pageNo === 1 ? 100 : 0;                            /* page 1 carries the file header first, whatever kind of page it is */
    const dv = new DataView(page.buffer);
    let content = this.pageSize;
    const ptrs = [];
    for (const k of kids) {
      const child = new Uint8Array(4);
      new DataView(child.buffer).setUint32(0, k.page, false);
      const bytes = concat([child, varintBytes(k.key)]);
      content -= bytes.length;
      page.set(bytes, content);
      ptrs.push(content);
    }
    page[hdr] = 0x05;
    dv.setUint16(hdr + 1, 0, false);
    dv.setUint16(hdr + 3, kids.length, false);
    dv.setUint16(hdr + 5, content, false);
    page[hdr + 7] = 0;
    dv.setUint32(hdr + 8, rightChild, false);
    ptrs.forEach((p, i) => dv.setUint16(hdr + 12 + i * 2, p, false));
    if (hdr + 12 + ptrs.length * 2 > content) throw new Error('fixture: interior page overflowed');
  }

  /* Pack rows into as many leaves as they need, then a single interior level if there is more than
     one leaf. Two levels is enough for any fixture here and exercises both page types.
     ⚠ sqlite_master's root is page 1 BY DEFINITION, and page 1 is 100 bytes smaller than the
     others — so a schema that does not fit there becomes an INTERIOR page 1 over leaves, which is
     exactly what SQLite does and what the reader has to walk. */
  writeTable(cells, rootPage) {
    const room = (pageNo) => this.pageSize - (pageNo === 1 ? 100 : 0) - 8;
    const leaves = [];
    let cur = [], used = 0;
    for (const c of cells) {
      const sz = this.cellSize(c.rowid, c.payload) + 2;
      if (cur.length && used + sz > room(0) - 4) { leaves.push(cur); cur = []; used = 0; }
      cur.push(c); used += sz;
    }
    if (cur.length || !leaves.length) leaves.push(cur);

    const fitsOnRoot = leaves.length === 1 &&
      leaves[0].reduce((n, c) => n + this.cellSize(c.rowid, c.payload) + 2, 0) <= room(rootPage || 0) - 4;
    if (fitsOnRoot) {
      const n = rootPage || this.alloc();
      this.writeLeaf(n, leaves[0]);
      return n;
    }
    /* Re-pack against the leaf-sized page, then put an interior level over it. */
    if (leaves.length === 1) { const half = Math.ceil(leaves[0].length / 2); leaves.splice(0, 1, leaves[0].slice(0, half), leaves[0].slice(half)); }
    const pages = leaves.map((rows) => { const n = this.alloc(); this.writeLeaf(n, rows); return { page: n, rows }; });
    const root = rootPage || this.alloc();
    const kids = pages.slice(0, -1).map((p) => ({ page: p.page, key: p.rows[p.rows.length - 1].rowid }));
    this.writeInterior(root, kids, pages[pages.length - 1].page);
    return root;
  }

  finish() {
    const p1 = this.page(1);
    p1.set(enc.encode('SQLite format 3'), 0);
    p1[15] = 0;
    const dv = new DataView(p1.buffer);
    dv.setUint16(16, this.pageSize === 65536 ? 1 : this.pageSize, false);
    p1[18] = 1; p1[19] = 1;                                        /* rollback journal, not WAL */
    p1[20] = 0;                                                    /* reserved */
    p1[21] = 64; p1[22] = 32; p1[23] = 32;
    dv.setUint32(24, 1, false);                                    /* change counter … */
    dv.setUint32(28, this.pages.length, false);                    /* … database size in pages … */
    dv.setUint32(56, 1, false);                                    /* … text encoding: UTF-8 … */
    dv.setUint32(92, 1, false);                                    /* … and version-valid-for, so 28 is trustworthy */
    dv.setUint32(96, 3045000, false);
    return concat(this.pages);
  }
}

/* tables: [{name, sql, rows:[{rowid, values:[…]}]}] — the schema text is the only place column
   names exist, exactly as in a real file. */
function sqliteFile(tables, pageSize = 4096) {
  const db = new Db(pageSize);
  const master = [];
  let rowid = 0;
  for (const t of tables) {
    const root = db.writeTable(t.rows.map((r) => ({ rowid: r.rowid, payload: encodeRecord(r.values) })));
    master.push({ rowid: ++rowid, payload: encodeRecord(['table', t.name, t.name, root, t.sql]) });
  }
  db.writeTable(master, 1);
  return db.finish();
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   B · GEOPACKAGE ON TOP OF IT
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

const SQL_CONTENTS =
  'CREATE TABLE gpkg_contents (table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, ' +
  "identifier TEXT UNIQUE, description TEXT DEFAULT '', " +
  "last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), " +
  'min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER, ' +
  'CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id))';

/* ⚠ srs_id is NOT the first column here, and srs_name is — the standard fixes the set of columns,
   not the order a writer emits them in, so the reader must look them up by name. */
const SQL_SRS =
  'CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL PRIMARY KEY, ' +
  'organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT)';

const SQL_GEOM_COLS =
  'CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, ' +
  'geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL, ' +
  'CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name))';

const WKT_JGD2011 = 'GEOGCS["JGD2011",DATUM["Japanese_Geodetic_Datum_2011",SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433],AUTHORITY["EPSG","6668"]]';

/* Two rows every GeoPackage carries, plus whatever the fixture names. −1/0 are the standard's
   "undefined" systems and their definition is literally the word. */
const BASE_SRS = [
  { srs_name: 'Undefined cartesian SRS', srs_id: -1, organization: 'NONE', organization_coordsys_id: -1, definition: 'undefined' },
  { srs_name: 'Undefined geographic SRS', srs_id: 0, organization: 'NONE', organization_coordsys_id: 0, definition: 'undefined' },
];

function geopackage(spec) {
  const srs = BASE_SRS.concat(spec.srs || []);
  const tables = [
    {
      name: 'gpkg_spatial_ref_sys', sql: SQL_SRS,
      /* srs_id is INTEGER PRIMARY KEY = an alias for the rowid, so SQLite stores NULL in the
         record and keeps the value in the cell. If the reader forgets that, ⑦ reads null. */
      rows: srs.map((s) => ({
        rowid: s.srs_id,
        values: [s.srs_name, null, s.organization, s.organization_coordsys_id, s.definition, null],
      })),
    },
    {
      name: 'gpkg_contents', sql: SQL_CONTENTS,
      rows: spec.tables.map((t, i) => ({
        rowid: i + 1,
        values: [t.name, t.dataType, t.name, null, '2026-09-15T00:00:00.000Z', null, null, null, null,
          t.srsId === undefined ? null : t.srsId],
      })),
    },
  ];
  const geomRows = spec.tables.filter((t) => t.geometryColumn).map((t, i) => ({
    rowid: i + 1,
    values: [t.name, t.geometryColumn, t.geometryType || 'GEOMETRY', t.srsId == null ? 0 : t.srsId, t.z ? 1 : 0, 0],
  }));
  if (geomRows.length) tables.push({ name: 'gpkg_geometry_columns', sql: SQL_GEOM_COLS, rows: geomRows });
  for (const t of spec.tables) tables.push({ name: t.name, sql: t.sql, rows: t.rows });
  return sqliteFile(tables, spec.pageSize || 4096);
}

/* ══ GeoPackageBinary + WKB (GeoPackage 1.3 §2.1.3, OGC SFA) ═════════════════════════════════ */

function wkbBody(g, opts) {
  const chunks = [];
  const u32 = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); return b; };
  const f64 = (v) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v, true); return b; };
  const CODES = { Point: 1, LineString: 2, Polygon: 3, MultiPoint: 4, MultiLineString: 5, MultiPolygon: 6, GeometryCollection: 7 };
  const code = CODES[g.type];
  let type = code;
  if (opts.z) type = opts.ewkb ? (code | 0x80000000) >>> 0 : code + 1000;  /* both spellings are in the wild */
  chunks.push(Uint8Array.from([1]));                               /* little-endian */
  chunks.push(u32(type));
  const pos = (c) => { chunks.push(f64(c[0]), f64(c[1])); if (opts.z) chunks.push(f64(c[2] == null ? 0 : c[2])); };
  const ring = (cs) => { chunks.push(u32(cs.length)); cs.forEach(pos); };
  if (g.type === 'Point') pos(g.coordinates);
  else if (g.type === 'LineString') ring(g.coordinates);
  else if (g.type === 'Polygon') { chunks.push(u32(g.coordinates.length)); g.coordinates.forEach(ring); }
  else if (g.type === 'GeometryCollection') { chunks.push(u32(g.geometries.length)); g.geometries.forEach((s) => chunks.push(wkbBody(s, opts))); }
  else {
    const member = { MultiPoint: 'Point', MultiLineString: 'LineString', MultiPolygon: 'Polygon' }[g.type];
    chunks.push(u32(g.coordinates.length));
    g.coordinates.forEach((c) => chunks.push(wkbBody({ type: member, coordinates: c }, opts)));
  }
  return concat(chunks);
}

function gpb(g, srsId, opts) {
  const o = opts || {};
  const flags = 0x01 | ((o.envelope ? 1 : 0) << 1) | (o.empty ? 0x10 : 0);  /* LE header, optional 4-double envelope */
  const head = [Uint8Array.from([0x47, 0x50, 0x00, flags])];
  const id = new Uint8Array(4); new DataView(id.buffer).setInt32(0, srsId, true);
  head.push(id);
  if (o.envelope) {
    const b = new Uint8Array(32), dv = new DataView(b.buffer);
    o.envelope.forEach((v, i) => dv.setFloat64(i * 8, v, true));
    head.push(b);
  }
  head.push(wkbBody(g, o));
  return concat(head);
}

const FEATURE_SQL = (name, extra) =>
  'CREATE TABLE "' + name + '" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "geom" GEOMETRY' + (extra || '') + ')';

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   C · THE CHECKS
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

const POINT = { type: 'Point', coordinates: [139.7671, 35.6812] };
const LINE = { type: 'LineString', coordinates: [[139.70, 35.68], [139.75, 35.70], [139.80, 35.66]] };
const HOLED = {
  type: 'Polygon',
  coordinates: [
    [[139.0, 35.0], [140.0, 35.0], [140.0, 36.0], [139.0, 36.0], [139.0, 35.0]],
    [[139.4, 35.4], [139.6, 35.4], [139.6, 35.6], [139.4, 35.6], [139.4, 35.4]],
  ],
};

test('① a point, a line and a polygon with a hole are read with the file\'s own coordinates', () => {
  const bytes = geopackage({
    tables: [{
      name: 'shapes', dataType: 'features', srsId: 4326, geometryColumn: 'geom', geometryType: 'GEOMETRY',
      sql: FEATURE_SQL('shapes', ', "label" TEXT'),
      rows: [POINT, LINE, HOLED].map((g, i) => ({
        rowid: i + 1,
        values: [null, gpb(g, 4326, { envelope: i === 2 ? [139, 140, 35, 36] : null }), 'g' + (i + 1)],
      })),
    }],
  });

  const r = GPKG.read(bytes);
  assert.equal(r.ok, true, r.why + ' ' + JSON.stringify(r.detail || {}));
  assert.equal(r.format, 'geopackage');
  assert.equal(r.table, 'shapes');
  assert.equal(r.fc.features.length, 3);
  assert.deepEqual(r.fc.features.map((f) => f.geometry.type), ['Point', 'LineString', 'Polygon']);
  assert.deepEqual(r.fc.features[0].geometry.coordinates, POINT.coordinates);
  assert.deepEqual(r.fc.features[1].geometry.coordinates, LINE.coordinates);
  /* The hole is a second ring, and it is the SECOND ring — a reader that flattened the rings would
     still produce a valid-looking polygon, with the hole drawn as land. */
  assert.equal(r.fc.features[2].geometry.coordinates.length, 2);
  assert.deepEqual(r.fc.features[2].geometry.coordinates, HOLED.coordinates);
  /* The rowid alias: `id INTEGER PRIMARY KEY AUTOINCREMENT` stores NULL and lives in the cell. */
  assert.deepEqual(r.fc.features.map((f) => f.properties.id), [1, 2, 3]);
  assert.deepEqual(r.fc.features.map((f) => f.properties.label), ['g1', 'g2', 'g3']);
  /* The geometry column is not also a property. */
  assert.equal('geom' in r.fc.features[0].properties, false);
});

test('② a geometry that spills onto overflow pages comes back whole, vertex for vertex', () => {
  /* 3,000 vertices ≈ 48 kB of WKB against a 512-byte page: roughly 120 overflow pages. A reader
     that stops at the local bytes gets ~1% of this ring and no error anywhere. */
  const ring = [];
  for (let i = 0; i < 3000; i++) {
    const t = (i / 3000) * Math.PI * 2;
    ring.push([139 + Math.cos(t) / 3, 35 + Math.sin(t) / 3]);
  }
  ring.push(ring[0].slice());
  const big = { type: 'Polygon', coordinates: [ring] };
  const blob = gpb(big, 4326, {});
  assert.ok(blob.length > 512 * 20, 'fixture must actually exceed many pages');

  const bytes = geopackage({
    pageSize: 512,
    tables: [{
      name: 'coast', dataType: 'features', srsId: 4326, geometryColumn: 'geom', geometryType: 'POLYGON',
      sql: FEATURE_SQL('coast'),
      rows: [{ rowid: 1, values: [null, blob] }],
    }],
  });

  const r = GPKG.read(bytes);
  assert.equal(r.ok, true, r.why + ' ' + JSON.stringify(r.detail || {}));
  const got = r.fc.features[0].geometry.coordinates[0];
  assert.equal(got.length, ring.length);
  for (let i = 0; i < ring.length; i++) {
    assert.equal(got[i][0], ring[i][0], 'vertex ' + i + ' longitude');
    assert.equal(got[i][1], ring[i][1], 'vertex ' + i + ' latitude');
  }
});

test('③ a zero-padded code column arrives as text, with its leading zero (#R735)', () => {
  const bytes = geopackage({
    tables: [{
      name: 'wards', dataType: 'features', srsId: 4326, geometryColumn: 'geom', geometryType: 'POINT',
      sql: FEATURE_SQL('wards', ', "code" TEXT, "pop" INTEGER, "share" REAL'),
      rows: [
        { rowid: 1, values: [null, gpb(POINT, 4326, {}), '01100', 1973395, 0.25] },
        { rowid: 2, values: [null, gpb(POINT, 4326, {}), '1100', 12, -0.5] },
      ],
    }],
  });
  const r = GPKG.read(bytes);
  assert.equal(r.ok, true, r.why);
  assert.strictEqual(r.fc.features[0].properties.code, '01100');
  assert.strictEqual(r.fc.features[1].properties.code, '1100');
  assert.notStrictEqual(r.fc.features[0].properties.code, r.fc.features[1].properties.code);
  /* Numbers stay numbers, and a negative double stays negative — the typing rule is
     IntMapData.typeColumn's, so this decoder must not pre-empt it in either direction. */
  assert.strictEqual(r.fc.features[0].properties.pop, 1973395);
  assert.strictEqual(r.fc.features[1].properties.share, -0.5);
});

test('④ two readable tables and no name is refused WITH THE LIST, and tables() states both', () => {
  const bytes = geopackage({
    tables: [
      {
        name: 'roads', dataType: 'features', srsId: 4326, geometryColumn: 'geom', geometryType: 'LINESTRING',
        sql: FEATURE_SQL('roads', ', "name" TEXT'),
        rows: [{ rowid: 1, values: [null, gpb(LINE, 4326, {}), 'Koshu Kaido'] }],
      },
      {
        name: 'population', dataType: 'attributes',
        sql: 'CREATE TABLE "population" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "code" TEXT, "value" INTEGER)',
        rows: [
          { rowid: 1, values: [null, '01100', 1973395] },
          { rowid: 2, values: [null, '13101', 66680] },
        ],
      },
    ],
  });

  const r = GPKG.read(bytes);
  assert.equal(r.ok, false);
  assert.equal(r.why, 'gpkg-multiple-tables');
  assert.deepEqual(r.detail.tables.map((t) => t.name).sort(), ['population', 'roads']);

  const list = GPKG.tables(bytes);
  assert.equal(list.ok, true, list.why);
  const byName = new Map(list.tables.map((t) => [t.name, t]));
  assert.deepEqual(byName.get('roads'), { name: 'roads', dataType: 'features', geometryColumn: 'geom', geometryType: 'LINESTRING', srsId: 4326, rows: 1 });
  assert.equal(byName.get('population').geometryColumn, null);
  assert.equal(byName.get('population').rows, 2);

  /* Named, it reads — the refusal is about the CHOICE, not about the file. */
  const named = GPKG.read(bytes, 'roads');
  assert.equal(named.ok, true, named.why);
  assert.equal(named.fc.features[0].properties.name, 'Koshu Kaido');
});

test('⑤ a SQLite file that is not a GeoPackage is refused by that name', () => {
  const bytes = sqliteFile([{
    name: 'notes', sql: 'CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)',
    rows: [{ rowid: 1, values: [null, 'hello'] }],
  }]);
  assert.equal(GPKG.sniff(bytes), true, 'it IS SQLite — that is the point');
  const r = GPKG.read(bytes);
  assert.equal(r.ok, false);
  assert.equal(r.why, 'gpkg-not-a-geopackage');
  assert.ok(r.detail.tables.includes('notes'));
  assert.equal(GPKG.tables(bytes).why, 'gpkg-not-a-geopackage');
});

test('⑥ an attributes table is read — rows with geometry null, and stats says so out loud', () => {
  const bytes = geopackage({
    tables: [{
      name: 'population', dataType: 'attributes',
      sql: 'CREATE TABLE "population" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "code" TEXT, "name" TEXT, "value" INTEGER)',
      rows: [
        { rowid: 1, values: [null, '01100', 'Sapporo', 1973395] },
        { rowid: 2, values: [null, '04100', 'Sendai', 1096704] },
        { rowid: 3, values: [null, '27100', 'Osaka', 2752412] },
      ],
    }],
  });
  const r = GPKG.read(bytes);
  assert.equal(r.ok, true, r.why + ' ' + JSON.stringify(r.detail || {}));
  assert.equal(r.fc.features.length, 3);
  for (const f of r.fc.features) assert.equal(f.geometry, null);
  assert.equal(r.stats.geometry, 'none');
  assert.equal(r.stats.geometryColumn, null);
  assert.equal(r.stats.dataType, 'attributes');
  assert.deepEqual(r.fc.features.map((f) => f.properties.code), ['01100', '04100', '27100']);
  assert.deepEqual(r.stats.columns, ['id', 'code', 'name', 'value']);
  assert.equal(r.sourceCrs, null, 'a table with no srs_id names no coordinate system');
});

test('⑦ the coordinate system comes back as the file states it — code AND definition', () => {
  const bytes = geopackage({
    srs: [{ srs_name: 'JGD2011', srs_id: 6668, organization: 'EPSG', organization_coordsys_id: 6668, definition: WKT_JGD2011 }],
    tables: [{
      name: 'points', dataType: 'features', srsId: 6668, geometryColumn: 'geom', geometryType: 'POINT',
      sql: FEATURE_SQL('points'),
      rows: [{ rowid: 1, values: [null, gpb(POINT, 6668, {})] }],
    }],
  });
  const r = GPKG.read(bytes);
  assert.equal(r.ok, true, r.why);
  assert.equal(r.sourceCrs, 'EPSG:6668');
  assert.equal(r.wkt, WKT_JGD2011);
  assert.equal(r.stats.srsId, 6668);
  assert.equal(r.stats.organization, 'EPSG');
  /* ⚠ NOTHING WAS RE-PROJECTED HERE: the coordinates are the file's, and js/gis-crs.js is the one
     place that transforms (docs/GIS-CORE.md §1.3). */
  assert.deepEqual(r.fc.features[0].geometry.coordinates, POINT.coordinates);

  /* The undefined systems are carried as «the file did not say», not as a code nobody wrote. */
  const undef = geopackage({
    tables: [{
      name: 'points', dataType: 'features', srsId: -1, geometryColumn: 'geom', geometryType: 'POINT',
      sql: FEATURE_SQL('points'), rows: [{ rowid: 1, values: [null, gpb(POINT, -1, {})] }],
    }],
  });
  const u = GPKG.read(undef);
  assert.equal(u.ok, true, u.why);
  assert.equal(u.sourceCrs, null);
  assert.equal(u.wkt, null);
});

test('⑧ a table larger than one page is read through its interior page, in the file\'s row order', () => {
  const rows = [];
  for (let i = 1; i <= 240; i++) {
    rows.push({ rowid: i, values: [null, gpb({ type: 'Point', coordinates: [139 + i / 1000, 35 + i / 1000] }, 4326, {}), 'n' + i] });
  }
  const bytes = geopackage({
    pageSize: 512,
    tables: [{
      name: 'stops', dataType: 'features', srsId: 4326, geometryColumn: 'geom', geometryType: 'POINT',
      sql: FEATURE_SQL('stops', ', "name" TEXT'), rows,
    }],
  });
  const r = GPKG.read(bytes);
  assert.equal(r.ok, true, r.why + ' ' + JSON.stringify(r.detail || {}));
  assert.equal(r.fc.features.length, 240, 'every row, not just the root page');
  assert.deepEqual(r.fc.features.map((f) => f.properties.id), rows.map((_, i) => i + 1));
  assert.equal(r.fc.features[239].properties.name, 'n240');
  assert.equal(GPKG.tables(bytes).tables.find((t) => t.name === 'stops').rows, 240);
});

test('⑨ Z travels beside the geometry, never inside the position', () => {
  const track = { type: 'LineString', coordinates: [[139.7, 35.6, 12.5], [139.8, 35.7, 48.25], [139.9, 35.8, 3]] };
  for (const ewkb of [false, true]) {                              /* ISO +1000 and the EWKB high bit are both read */
    const bytes = geopackage({
      tables: [{
        name: 'tracks', dataType: 'features', srsId: 4326, geometryColumn: 'geom', geometryType: 'LINESTRING', z: 1,
        sql: FEATURE_SQL('tracks'),
        rows: [{ rowid: 1, values: [null, gpb(track, 4326, { z: true, ewkb })] }],
      }],
    });
    const r = GPKG.read(bytes);
    assert.equal(r.ok, true, (ewkb ? 'ewkb: ' : 'iso: ') + r.why);
    const f = r.fc.features[0];
    assert.deepEqual(f.geometry.coordinates, [[139.7, 35.6], [139.8, 35.7], [139.9, 35.8]]);
    for (const c of f.geometry.coordinates) assert.equal(c.length, 2, 'a third ordinate would be folded away by sanitizeFeatures');
    assert.deepEqual(f.properties._z, [12.5, 48.25, 3]);
    assert.equal(r.stats.withZ, 1);
  }
});

test('⑩ the refusals: not SQLite, a WAL file, a tile pyramid, an unknown name', () => {
  assert.equal(GPKG.sniff(new Uint8Array(0)), false);
  assert.equal(GPKG.sniff(enc.encode('{"type":"FeatureCollection"}')), false);
  assert.equal(GPKG.read(enc.encode('id,lat,lng\n1,35,139\n')).why, 'gpkg-not-sqlite');

  const base = geopackage({
    tables: [{
      name: 'points', dataType: 'features', srsId: 4326, geometryColumn: 'geom', geometryType: 'POINT',
      sql: FEATURE_SQL('points'), rows: [{ rowid: 1, values: [null, gpb(POINT, 4326, {})] }],
    }],
  });
  assert.equal(GPKG.sniff(base), true);
  assert.equal(GPKG.read(base).ok, true);

  /* ⚠ PAGE SIZE 65536 IS WRITTEN AS 1, because the field is sixteen bits wide and the value is
     not. A reader that takes the 1 literally computes every page offset four orders of magnitude
     too small and finds no b-tree page where the header promised one. */
  const huge = geopackage({
    pageSize: 65536,
    tables: [{
      name: 'points', dataType: 'features', srsId: 4326, geometryColumn: 'geom', geometryType: 'POINT',
      sql: FEATURE_SQL('points', ', "name" TEXT'),
      rows: [{ rowid: 1, values: [null, gpb(POINT, 4326, {}), 'Tokyo'] }],
    }],
  });
  assert.equal(new DataView(huge.buffer).getUint16(16, false), 1, 'the fixture really writes the 1');
  const big = GPKG.read(huge);
  assert.equal(big.ok, true, big.why + ' ' + JSON.stringify(big.detail || {}));
  assert.equal(big.stats.pageSize, 65536);
  assert.deepEqual(big.fc.features[0].geometry.coordinates, POINT.coordinates);

  /* ⚠ A WAL FILE IS REFUSED RATHER THAN READ: the committed content may be in a -wal sidecar that
     was never handed to us, so the pages here are not necessarily the database. */
  const wal = base.slice(); wal[18] = 2; wal[19] = 2;
  assert.equal(GPKG.read(wal).why, 'gpkg-wal');

  /* UTF-16 is stated, not guessed at. */
  const utf16 = base.slice(); new DataView(utf16.buffer).setUint32(56, 2, false);
  assert.equal(GPKG.read(utf16).why, 'gpkg-text-encoding');

  const tiles = geopackage({
    tables: [{
      name: 'basemap', dataType: 'tiles', srsId: 3857,
      sql: 'CREATE TABLE "basemap" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "zoom_level" INTEGER, "tile_data" BLOB)',
      rows: [{ rowid: 1, values: [null, 3, Uint8Array.from([0x89, 0x50, 0x4e, 0x47])] }],
    }],
  });
  assert.equal(GPKG.read(tiles, 'basemap').why, 'gpkg-tiles-unsupported');
  assert.equal(GPKG.read(tiles).why, 'gpkg-no-tables', 'a file of tiles has nothing this reader turns into rows');
  /* …and it is still LISTED, so the caller can say what is in the file. */
  assert.equal(GPKG.tables(tiles).tables[0].dataType, 'tiles');

  const missing = GPKG.read(base, 'nowhere');
  assert.equal(missing.why, 'gpkg-no-such-table');
  assert.deepEqual(missing.detail.tables, ['points']);
});

test('⑪ the module publishes itself and answers with codes, never sentences', () => {
  assert.equal(globalThis.window.IntMapGisGeopackage, GPKG);
  /* (#R738) refusals() joined the face so the codes are a DECLARATION rather than something a gate
     has to find by scanning — see the note on REFUSALS in js/gis-geopackage.js. */
  assert.deepEqual(Object.keys(GPKG).sort(), ['read', 'refusals', 'sniff', 'tables']);
  /* and the declaration is complete: every code the module can hand back is in it */
  const src = readFileSync(new URL('../js/gis-geopackage.js', import.meta.url), 'utf8');
  const thrown = [...new Set([...src.matchAll(/bad\(\s*'([a-z0-9-]+)'/g)].map((m) => m[1]))].sort();
  assert.deepEqual(thrown.filter((c) => GPKG.refusals().indexOf(c) < 0), []);
  /* Same contract as js/geo-import.js and js/gis-ops.js (docs/GIS-CORE.md §2.2): a `why` is a
     hyphenated code the call site can translate, not a string to show a reader. */
  for (const r of [GPKG.read(new Uint8Array(4)), GPKG.tables(enc.encode('nope'))]) {
    assert.equal(r.ok, false);
    assert.match(r.why, /^gpkg(-[a-z0-9]+)+$/);
  }
});
