/* ============================================================================
 *  GIS · READING VECTOR FILES — GeoPackage・Shapefile
 * ----------------------------------------------------------------------------
 *  js/gis-geopackage.js and js/gis-shapefile.js, measured against files this file writes itself:
 *  coordinates as stored, holes vs exclaves, codes that stay text, CRS as the file states it, heights
 *  beside the geometry, and every refusal by its own name.
 *
 *  ⚠ ONE BLOCK PER ROUND, AND EACH BLOCK IS ISOLATED. The rounds below used to be files of their own,
 *  each in its own process; `isolate()` (tests/helpers/geo-shared.mjs) gives every block back the
 *  globalThis a fresh process had, so no block reads a `window` another one left behind. Test titles
 *  carry the round that wrote them (#R<N>), and each block keeps that round's own account of WHY.
 * ==========================================================================*/

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeGisGeopackage } from '../js/gis-geopackage.js';
import { makeGisShapefile } from '../js/gis-shapefile.js';
import { isolate } from './helpers/geo-shared.mjs';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R738 · GeoPackage   (was tests/r738-gis-geopackage-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
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
describe('§ #R738 · GeoPackage', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  globalThis.window = globalThis.window || {};
  /* (hoisted to a static import: makeGisGeopackage from ../js/gis-geopackage.js) */
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

  test('#R738 ① a point, a line and a polygon with a hole are read with the file\'s own coordinates', () => {
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

  test('#R738 ② a geometry that spills onto overflow pages comes back whole, vertex for vertex', () => {
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

  test('#R738 ③ a zero-padded code column arrives as text, with its leading zero (#R735)', () => {
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

  test('#R738 ④ two readable tables and no name is refused WITH THE LIST, and tables() states both', () => {
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

  test('#R738 ⑤ a SQLite file that is not a GeoPackage is refused by that name', () => {
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

  test('#R738 ⑥ an attributes table is read — rows with geometry null, and stats says so out loud', () => {
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

  test('#R738 ⑦ the coordinate system comes back as the file states it — code AND definition', () => {
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

  test('#R738 ⑧ a table larger than one page is read through its interior page, in the file\'s row order', () => {
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

  test('#R738 ⑨ Z travels beside the geometry, never inside the position', () => {
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

  test('#R738 ⑩ the refusals: not SQLite, a WAL file, a tile pyramid, an unknown name', () => {
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

  test('#R738 ⑪ the module publishes itself and answers with codes, never sentences', () => {
    assert.equal(globalThis.window.IntMapGisGeopackage, GPKG);
    /* (#R738) refusals() joined the face so the codes are a DECLARATION rather than something a gate
       has to find by scanning — see the note on REFUSALS in js/gis-geopackage.js. */
    /* ⚠ (#R783) THIS LINE USED TO FIX THE SPELLING OF THE WHOLE FACE, so the day a writer was added
       (`write`) a correct change failed a check whose subject is refusal codes. The subject is
       «everything published is callable, and nothing that was published has left» — not «the face is
       exactly these four names» (.agents/rules/no-ad-hoc-hardcoding.md §1). */
    const face = Object.keys(GPKG).sort();
    for (const k of face) assert.equal(typeof GPKG[k], 'function', k + ' is published and is not callable');
    for (const need of ['sniff', 'tables', 'read', 'refusals']) {
      assert.ok(face.includes(need), need + ' left the face');
    }
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

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R738 · Shapefile   (was tests/r738-gis-shapefile-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R738 · シェープファイルを本当に読む（名指しの拒否を読み手に替える）
 * ----------------------------------------------------------------------------
 *  js/geo-import.js は ZIP の中の `.shp` を `why:'shapefile'` で断っていた。断り自体は正直で、
 *  述べていたのは「読み手が無い」ことだった。ここはその読み手が本当に読むことを測る。
 *
 *    ① 点・線・面が、ESRI 3-7855 のバイトから座標そのままで出てくる
 *    ② 面の内と外を分けるのは向きであって parts の数ではない
 *       ——⚠ 同じ parts 構成で向きだけを変えた 2 つの入力が、穴と飛び地に分かれる
 *    ③ `.dbf` の "01100" が "01100" のまま届く（先頭ゼロは符号・#R735）／削除行は落ちる
 *    ④ 件数不一致・未対応の型・組が複数 は、それぞれ名前のついたコードで断られる
 *    ⑤ Z は座標の第 3 成分ではなく `_z` に並行配列で入り、長さが位置の数と等しい
 *    ⑥ `.prj` の AUTHORITY が読まれ、無ければ sourceCrs は null で生の WKT が返る
 *
 *  ⚠ ② ③ ⑤ はこのリポジトリが記録している欠陥の形そのものである: 「parts が 2 つ以上なら穴」は
 *  飛び地を穴にし、先頭ゼロを落とした符号は隣の自治体に結合し（#R735）、第 3 成分に入れた標高は
 *  `IntMapGeodesy.sanitizeFeatures` が畳むので読者に届かない（docs/GIS-CORE.md §1.5）。
 *
 *  ⚠ FIXTURE はこのファイルがバイト列として組み立てる。記録した出力と突き合わせるのではなく
 *  **仕様どおりに書いたバイト**と突き合わせるので、明日コードが何を印字しても通ることはない。
 *  バイナリ資産をリポジトリに足さないのも同じ理由（読めない資産は次の読者に何も述べない）。
 * ==========================================================================*/
describe('§ #R738 · Shapefile', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  /* (hoisted to a static import: makeGisShapefile from ../js/gis-shapefile.js) */
  const SHP = makeGisShapefile();

  /* ══ FIXTURE — ESRI Shapefile Technical Description 3-7855 (July 1998) と dBASE III+ ═══════════ */

  function writer() {
    const a = [];
    const num = (v, kind) => {
      const b = new Uint8Array(kind === 'f64' ? 8 : 4);
      const dv = new DataView(b.buffer);
      if (kind === 'f64') dv.setFloat64(0, v, true);
      else if (kind === 'i32le') dv.setInt32(0, v, true);
      else dv.setInt32(0, v, false);
      for (const x of b) a.push(x);
    };
    return {
      byte(v) { a.push(v & 0xFF); },
      bytes(u) { for (const x of u) a.push(x); },
      ascii(s) { for (let i = 0; i < s.length; i++) a.push(s.charCodeAt(i) & 0xFF); },
      i32le(v) { num(v, 'i32le'); },
      i32be(v) { num(v, 'i32be'); },
      f64(v) { num(v, 'f64'); },
      u16le(v) { a.push(v & 0xFF, (v >> 8) & 0xFF); },
      u32le(v) { a.push(v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF); },
      out() { return new Uint8Array(a); },
      get length() { return a.length; },
    };
  }

  const bboxOf = (pts) => [
    Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])),
    Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])),
  ];

  /* One record body. `type` is written inside the body, as the format does. */
  function pointBody(type, x, y, extra) {
    const w = writer();
    w.i32le(type); w.f64(x); w.f64(y);
    for (const v of (extra || [])) w.f64(v);
    return w.out();
  }

  function multiPointBody(type, pts) {
    const w = writer();
    w.i32le(type);
    for (const v of bboxOf(pts)) w.f64(v);
    w.i32le(pts.length);
    for (const p of pts) { w.f64(p[0]); w.f64(p[1]); }
    return w.out();
  }

  /* PolyLine / Polygon and their Z forms: parts is an array of arrays of [x,y] (plus z per vertex
     when `zs` is given, in the same flat order the format writes them). */
  function polyBody(type, parts, zs) {
    const all = [].concat(...parts);
    const w = writer();
    w.i32le(type);
    for (const v of bboxOf(all)) w.f64(v);
    w.i32le(parts.length);
    w.i32le(all.length);
    let at = 0;
    for (const p of parts) { w.i32le(at); at += p.length; }
    for (const p of all) { w.f64(p[0]); w.f64(p[1]); }
    if (zs) {
      w.f64(Math.min(...zs)); w.f64(Math.max(...zs));
      for (const z of zs) w.f64(z);
    }
    return w.out();
  }

  function shpFile(headerType, bodies) {
    const w = writer();
    w.i32be(9994);
    for (let i = 0; i < 5; i++) w.i32be(0);
    const total = 100 + bodies.reduce((s, b) => s + 8 + b.length, 0);
    w.i32be(total / 2);
    w.i32le(1000);
    w.i32le(headerType);
    for (let i = 0; i < 8; i++) w.f64(0);
    bodies.forEach((b, i) => { w.i32be(i + 1); w.i32be(b.length / 2); w.bytes(b); });
    return w.out();
  }

  /* fields: [{name, type, len}] · rows: [{FIELD:'value'} | null]  (null ⇒ the record is deleted) */
  function dbfFile(fields, rows, ldid) {
    const w = writer();
    const recordLen = 1 + fields.reduce((s, f) => s + f.len, 0);
    const headerLen = 32 + 32 * fields.length + 1;
    w.byte(0x03); w.byte(125); w.byte(1); w.byte(1);
    w.u32le(rows.length);
    w.u16le(headerLen);
    w.u16le(recordLen);
    for (let i = 0; i < 17; i++) w.byte(0);                       /* reserved, up to byte 28 */
    w.byte(ldid == null ? 0 : ldid);                              /* byte 29 — language driver id */
    w.byte(0); w.byte(0);
    for (const f of fields) {
      const nm = f.name.slice(0, 10);
      w.ascii(nm);
      for (let i = nm.length; i < 11; i++) w.byte(0);
      w.ascii(f.type);
      w.u32le(0);
      w.byte(f.len); w.byte(0);
      for (let i = 0; i < 14; i++) w.byte(0);
    }
    w.byte(0x0D);
    for (const row of rows) {
      w.byte(row === null ? 0x2A : 0x20);
      for (const f of fields) {
        const v = String((row && row[f.name] != null) ? row[f.name] : '').slice(0, f.len);
        w.ascii(v);
        for (let i = v.length; i < f.len; i++) w.byte(0x20);
      }
    }
    w.byte(0x1A);
    return w.out();
  }

  const entry = (name, bytes) => ({ name, bytes });
  const utf8 = (s) => new TextEncoder().encode(s);

  /* Rings. ⚠ 3-7855: an OUTER ring is CLOCKWISE, a hole is COUNTER-CLOCKWISE. */
  const CW_OUTER = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]];
  const CCW_HOLE = [[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]];
  const CW_ISLAND = [[2, 2], [2, 4], [4, 4], [4, 2], [2, 2]];     /* the same square, wound the other way */

  function area(ring) {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }

  /* ══ ① 点・線・面 ═══════════════════════════════════════════════════════════════════════════════ */

  test('#R738 ① a Point, a PolyLine and a Polygon come out of the bytes with their own coordinates', async () => {
    const pt = await SHP.read([entry('a.shp', shpFile(1, [pointBody(1, 139.767, 35.681)]))]);
    assert.equal(pt.ok, true);
    assert.equal(pt.format, 'shapefile');
    assert.equal(pt.fc.features.length, 1);
    assert.deepEqual(pt.fc.features[0].geometry, { type: 'Point', coordinates: [139.767, 35.681] });

    const coords = [[0, 0], [1, 1], [2, 0]];
    const ln = await SHP.read([entry('b.shp', shpFile(3, [polyBody(3, [coords])]))]);
    assert.equal(ln.ok, true);
    assert.deepEqual(ln.fc.features[0].geometry, { type: 'LineString', coordinates: coords });

    /* Two parts of a PolyLine are two lines, not one with a jump across the gap. */
    const ln2 = await SHP.read([entry('c.shp', shpFile(3, [polyBody(3, [coords, [[5, 5], [6, 6]]])]))]);
    assert.equal(ln2.fc.features[0].geometry.type, 'MultiLineString');
    assert.equal(ln2.fc.features[0].geometry.coordinates.length, 2);

    const pg = await SHP.read([entry('d.shp', shpFile(5, [polyBody(5, [CW_OUTER])]))]);
    assert.equal(pg.ok, true);
    const g = pg.fc.features[0].geometry;
    assert.equal(g.type, 'Polygon');
    assert.equal(g.coordinates.length, 1);
    /* RFC 7946 §3.1.6: the exterior ring is counter-clockwise — the reverse of what the file holds. */
    assert.ok(area(g.coordinates[0]) > 0, 'exterior ring must be emitted counter-clockwise');
    assert.deepEqual(g.coordinates[0].slice().reverse(), CW_OUTER);

    /* A MultiPoint becomes one Feature per point (js/geo-import.js flattens for the same measured
       reason: IntMapGeodesy.sanitizeFeatures drops MultiPoint outright). */
    const mp = await SHP.read([entry('e.shp', shpFile(8, [multiPointBody(8, [[1, 2], [3, 4]])]))]);
    assert.equal(mp.fc.features.length, 2);
    assert.deepEqual(mp.fc.features.map((f) => f.geometry.coordinates), [[1, 2], [3, 4]]);
  });

  /* ══ ② 向きが唯一の区別 ═════════════════════════════════════════════════════════════════════════ */

  test('#R738 ② a hole and an exclave differ ONLY in winding — the same parts give different answers', async () => {
    const withHole = await SHP.read([entry('h.shp', shpFile(5, [polyBody(5, [CW_OUTER, CCW_HOLE])]))]);
    const withIsland = await SHP.read([entry('i.shp', shpFile(5, [polyBody(5, [CW_OUTER, CW_ISLAND])]))]);
    assert.equal(withHole.ok, true);
    assert.equal(withIsland.ok, true);

    const a = withHole.fc.features[0].geometry;
    assert.equal(a.type, 'Polygon', 'a counter-clockwise second ring is a hole in the first');
    assert.equal(a.coordinates.length, 2);
    assert.ok(area(a.coordinates[0]) > 0, 'exterior counter-clockwise');
    assert.ok(area(a.coordinates[1]) < 0, 'hole clockwise (RFC 7946 §3.1.6)');

    const b = withIsland.fc.features[0].geometry;
    assert.equal(b.type, 'MultiPolygon', 'a second CLOCKWISE ring is a second island, never a hole');
    assert.equal(b.coordinates.length, 2);
    assert.equal(b.coordinates[0].length, 1);
    assert.equal(b.coordinates[1].length, 1);

    /* ⚠ The two inputs have the same number of parts and the same vertices — if the reader had used
       「parts が 2 つ以上なら穴」 these two assertions could not both hold. */
    assert.notEqual(a.type, b.type);
  });

  /* ══ ③ .dbf ═════════════════════════════════════════════════════════════════════════════════════ */

  test('#R738 ③ a zero-padded code survives as text, a dBASE date becomes ISO, a deleted row is gone', async () => {
    const fields = [
      { name: 'CODE', type: 'N', len: 5 },
      { name: 'NAME', type: 'C', len: 8 },
      { name: 'OPENED', type: 'D', len: 8 },
      { name: 'NOTE', type: 'M', len: 10 },
    ];
    const rows = [
      { CODE: '01100', NAME: 'sapporo', OPENED: '20200304', NOTE: '0000000001' },
      null,                                                     /* deleted */
      { CODE: '1100', NAME: 'other', OPENED: '', NOTE: '' },
    ];
    const shp = shpFile(1, [pointBody(1, 1, 1), pointBody(1, 2, 2), pointBody(1, 3, 3)]);
    const r = await SHP.read([entry('t.shp', shp), entry('t.dbf', dbfFile(fields, rows))]);
    assert.equal(r.ok, true);
    assert.equal(r.fc.features.length, 2, 'the deleted record takes its shape with it');
    assert.equal(r.stats.deleted, 1);
    assert.equal(r.stats.records, 3);

    const p = r.fc.features[0].properties;
    /* ⚠ #R735: "01100" and "1100" are not the same row, and they are only kept apart while the
       leading zero is still there when IntMapData.typeColumn sees the value. */
    assert.equal(p.CODE, '01100');
    assert.equal(r.fc.features[1].properties.CODE, '1100');
    assert.equal(p.NAME, 'sapporo');
    /* The one rewrite: eight digits every numeric test answers 「yes」 to become the date they mean. */
    assert.equal(p.OPENED, '2020-03-04');
    assert.equal(r.fc.features[1].properties.OPENED, '');
    /* A memo's text lives in a .dbt that is not part of a shapefile: the block number is not a value. */
    assert.equal(p.NOTE, '');
    assert.deepEqual(r.stats.memoFields, ['NOTE']);
    assert.deepEqual(r.stats.fields, ['CODE', 'NAME', 'OPENED', 'NOTE']);
    /* Which decoder read the attributes is reported, never chosen silently. */
    assert.equal(typeof r.stats.encoding.label, 'string');
    assert.ok(['cpg', 'ldid', 'utf-8-valid', 'fallback'].includes(r.stats.encoding.from));
  });

  test('#R738 ③b the .cpg and the LDID byte are believed, in that order, and both are reported', async () => {
    const fields = [{ name: 'NAME', type: 'C', len: 6 }];
    const shp = shpFile(1, [pointBody(1, 1, 1)]);
    const rowsLatin = [{ NAME: '' }];
    const dbf = dbfFile(fields, rowsLatin, 0x03);               /* 0x03 = code page 1252 */
    const byLdid = await SHP.read([entry('u.shp', shp), entry('u.dbf', dbf)]);
    assert.equal(byLdid.stats.encoding.from, 'ldid');
    assert.equal(byLdid.stats.encoding.label, 'cp1252');

    const byCpg = await SHP.read([entry('u.shp', shp), entry('u.dbf', dbf), entry('u.cpg', utf8('UTF-8'))]);
    assert.equal(byCpg.stats.encoding.from, 'cpg');
    assert.equal(byCpg.stats.encoding.label, 'utf-8');
  });

  /* ══ ④ 名前のついた拒否 ═════════════════════════════════════════════════════════════════════════ */

  test('#R738 ④ mismatch, an unsupported shape type and two sets are each refused BY NAME', async () => {
    const two = shpFile(1, [pointBody(1, 1, 1), pointBody(1, 2, 2)]);
    const one = dbfFile([{ name: 'A', type: 'C', len: 2 }], [{ A: 'x' }]);
    const mismatch = await SHP.read([entry('m.shp', two), entry('m.dbf', one)]);
    assert.equal(mismatch.ok, false);
    /* ⚠ Trimming to the shorter file would not fail — it would shift every attribute by one row. */
    assert.equal(mismatch.why, 'shapefile-count-mismatch');
    assert.deepEqual(mismatch.detail, { shapes: 2, records: 1 });

    /* 31 is MultiPatch: a real type in 3-7855 that this reader does not build, named with its number
       rather than called corrupt. */
    const patch = await SHP.read([entry('p.shp', shpFile(31, [pointBody(31, 1, 1)]))]);
    assert.equal(patch.why, 'shapefile-type');
    assert.equal(patch.detail.type, 31);

    const multi = await SHP.read([
      entry('roads/a.shp', shpFile(1, [pointBody(1, 1, 1)])),
      entry('rivers/b.shp', shpFile(1, [pointBody(1, 2, 2)])),
    ]);
    assert.equal(multi.why, 'shapefile-multiple');
    assert.deepEqual(multi.detail.bases, ['rivers/b', 'roads/a']);
    /* ⚠ Which of the two to read is the reader's choice, so the names go back rather than a guess. */
    assert.deepEqual(SHP.group([
      entry('roads/a.shp', shpFile(1, [pointBody(1, 1, 1)])),
      entry('roads/a.dbf', dbfFile([{ name: 'A', type: 'C', len: 2 }], [{ A: 'x' }])),
    ]), [{ base: 'roads/a', files: ['shp', 'dbf'] }]);

    const none = await SHP.read([entry('readme.txt', utf8('hello'))]);
    assert.equal(none.why, 'shapefile-missing-shp');

    /* A .shp whose own header does not say 9994 is not a .shp, whatever the name says. */
    const bad = shpFile(1, [pointBody(1, 1, 1)]);
    bad[3] = 0;                                                  /* 9994 is 0x0000270A — the low byte */
    const broken = await SHP.read([entry('x.shp', bad)]);
    assert.equal(broken.why, 'shapefile-corrupt');
    assert.equal(broken.detail.expected, 'file-code-9994');

    /* A dBASE field type whose bytes are not text is refused rather than handed over as mojibake. */
    const binaryField = dbfFile([{ name: 'B', type: 'B', len: 8 }], [{ B: 'xxxxxxxx' }]);
    const refusedField = await SHP.read([entry('y.shp', shpFile(1, [pointBody(1, 1, 1)])), entry('y.dbf', binaryField)]);
    assert.equal(refusedField.why, 'shapefile-dbf-field-type');
    assert.equal(refusedField.detail.type, 'B');

    /* Every code above is published, so the nine sentences at the call site can be checked against
       the module instead of against a reading of it (docs/GIS-CORE.md §2.2). */
    for (const why of ['shapefile-count-mismatch', 'shapefile-type', 'shapefile-multiple', 'shapefile-missing-shp', 'shapefile-corrupt', 'shapefile-dbf-field-type']) {
      assert.ok(SHP.refusals().includes(why), why + ' must be published by refusals()');
    }
  });

  /* ══ ⑤ Z は座標の中ではなく隣に ═════════════════════════════════════════════════════════════════ */

  test('#R738 ⑤ heights travel in _z, parallel to the positions and never as a third ordinate', async () => {
    const pts = [[0, 0], [1, 1], [2, 2]];
    const zs = [10, 20, 30];
    const r = await SHP.read([entry('z.shp', shpFile(13, [polyBody(13, [pts], zs)]))]);
    assert.equal(r.ok, true);
    const f = r.fc.features[0];
    assert.deepEqual(f.geometry.coordinates, pts);
    /* ⚠ docs/GIS-CORE.md §1.5: sanitizeFeatures COLLAPSES a third member, so a height written there
       never reaches a reader. Every position must have exactly two ordinates. */
    for (const c of f.geometry.coordinates) assert.equal(c.length, 2);
    assert.deepEqual(f.properties._z, zs);
    assert.equal(f.properties._z.length, f.geometry.coordinates.length,
      'a parallel array is an axis only while its length equals the number of positions');

    /* The ring reversal that RFC 7946 requires must carry _z with it, or every height moves. */
    const ring = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]];
    const ringZ = [1, 2, 3, 4, 1];
    const pg = await SHP.read([entry('zp.shp', shpFile(15, [polyBody(15, [ring], ringZ)]))]);
    const pf = pg.fc.features[0];
    assert.deepEqual(pf.properties._z, ringZ.slice().reverse());
    assert.equal(pf.properties._z.length, pf.geometry.coordinates[0].length);

    /* 3-7855: an M below −10^38 is 「no data」, so it is null — and a shape where every M is absent
       claims no measure column at all rather than one full of −10^38. */
    const noM = await SHP.read([entry('m2.shp', shpFile(21, [pointBody(21, 5, 6, [-1e40])]))]);
    assert.equal(noM.ok, true);
    assert.equal(noM.fc.features[0].properties._m, undefined);
    const withM = await SHP.read([entry('m3.shp', shpFile(21, [pointBody(21, 5, 6, [42])]))]);
    assert.deepEqual(withM.fc.features[0].properties._m, [42]);
  });

  /* ══ ⑥ .prj ═════════════════════════════════════════════════════════════════════════════════════ */

  test('#R738 ⑥ the AUTHORITY of the .prj is read, and nothing is named on a guess', async () => {
    const wgs84 = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563,'
      + 'AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0.0],'
      + 'UNIT["Degree",0.0174532925199433],AUTHORITY["EPSG","4326"]]';
    const shp = shpFile(1, [pointBody(1, 1, 1)]);
    const r = await SHP.read([entry('w.shp', shp), entry('w.prj', utf8(wgs84))]);
    assert.equal(r.ok, true);
    /* ⚠ The LAST authority, not the first: the spheroid and the datum carry their own, and the
       outermost object is the one whose clause closes last. */
    assert.equal(r.sourceCrs, 'EPSG:4326');
    assert.equal(r.prj, wgs84);

    const utm = 'PROJCS["WGS_1984_UTM_Zone_54N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",'
      + 'SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],'
      + 'UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],'
      + 'UNIT["Meter",1.0],AUTHORITY["EPSG","32654"]]';
    const ru = await SHP.read([entry('v.shp', shp), entry('v.prj', utf8(utm))]);
    assert.equal(ru.sourceCrs, 'EPSG:32654');
    /* ⚠ The coordinates are NOT transformed here: that rule lives once, in js/geo-import.js's
       settleCrs over js/gis-crs.js, and `prj` is what lets IntMapGisCrs.define() be given a
       definition it does not have. */
    assert.deepEqual(ru.fc.features[0].geometry.coordinates, [1, 1]);

    const noAuthority = 'PROJCS["somebody_s_grid",GEOGCS["GCS_Tokyo",DATUM["D_Tokyo",'
      + 'SPHEROID["Bessel_1841",6377397.155,299.1528128]],PRIMEM["Greenwich",0.0],'
      + 'UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],UNIT["Meter",1.0]]';
    const rn = await SHP.read([entry('n.shp', shp), entry('n.prj', utf8(noAuthority))]);
    /* ⚠ null is 「the file did not state a code」, which is a different claim from 「it was 4326」. */
    assert.equal(rn.sourceCrs, null);
    assert.equal(rn.prj, noAuthority);

    const rNone = await SHP.read([entry('o.shp', shp)]);
    assert.equal(rNone.sourceCrs, null);
    assert.equal(rNone.prj, null);
    assert.deepEqual(rNone.stats.files, ['shp']);
  });

  ISOLATED.built();
});
