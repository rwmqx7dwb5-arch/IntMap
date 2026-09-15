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

import test from 'node:test';
import assert from 'node:assert/strict';

const { makeGisShapefile } = await import('../js/gis-shapefile.js');
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

test('① a Point, a PolyLine and a Polygon come out of the bytes with their own coordinates', async () => {
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

test('② a hole and an exclave differ ONLY in winding — the same parts give different answers', async () => {
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

test('③ a zero-padded code survives as text, a dBASE date becomes ISO, a deleted row is gone', async () => {
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

test('③b the .cpg and the LDID byte are believed, in that order, and both are reported', async () => {
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

test('④ mismatch, an unsupported shape type and two sets are each refused BY NAME', async () => {
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

test('⑤ heights travel in _z, parallel to the positions and never as a third ordinate', async () => {
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

test('⑥ the AUTHORITY of the .prj is read, and nothing is named on a guess', async () => {
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
