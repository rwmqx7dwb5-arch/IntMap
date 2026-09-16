/* ============================================================================
 *  #R756 · データを外へ出す口 — 書き出したものを、この製品自身が読み直せるか
 * ----------------------------------------------------------------------------
 *  THE DEFECT THIS FILE MEASURES, RESTATED AS THE DEFECT AND NOT AS THE FIX
 *  ([[intmap-restate-the-defect-not-the-fix]]):
 *
 *      「GeoJSON を書き出せる」 is a sentence about an implementation, and an implementation that
 *      emits broken GeoJSON satisfies it. What was wrong before js/gis-export.js existed was not
 *      「書き出す関数が無い」 — it was that a reader could import, clip, join and resample and then
 *      HAD NO WAY TO GET THE ANSWER OUT. A door that emits bytes nobody can read back is the same
 *      defect wearing a coat.
 *
 *  So every check below is a LOOP, and the far end of the loop is a reader that already existed:
 *      ① GeoJSON → js/geo-import.js readGeoFile()  — geometry, coordinates and attributes identical
 *      ② CSV     → js/geo-import.js readGeoFile()  — points come back as points
 *      ③ CSV states what it did with a shape it cannot hand back, instead of dropping it in silence
 *      ④ GeoTIFF → js/gis-geotiff.js read()        — samples identical AND THE PLACE IDENTICAL
 *      ⑤ 場所が違えば別のデータである: two grids that differ ONLY in where they are come back apart
 *      ⑥ provenance survives in BOTH directions — carried when stated, absent when not
 *      ⑦ nothing empty and nothing geometry-less goes out in silence
 *      ⑧ integers: exact, or refused by name — never truncated, never 0-filled
 *      ⑨ every refusal this module declares has a sentence in js/gis-panel.js
 *
 *  ⚠⚠⚠ THERE IS NO EPSILON IN THIS FILE, AND THAT IS A MEASUREMENT RATHER THAN A STANDARD OF
 *  STRICTNESS. .agents/rules/no-ad-hoc-hardcoding.md §4 asks where a constant came from; the answer
 *  for the tolerance of a round-trip is that it is ZERO, and where it is:
 *    · JSON — ECMA-262 Number::toString produces the SHORTEST decimal that parses back to the same
 *      double, so a coordinate that changed did not change by rounding; it changed by a defect.
 *    · float32 — a 32-bit sample is exactly Math.fround(v). The expected value is therefore
 *      Math.fround(v) and the comparison is `===`. A tolerance here would hide a wrong PIXEL, and a
 *      wrong pixel is the one thing a grid has.
 *    · the georeference — TIFF DOUBLE fields are IEEE-754 binary64, the same type the record holds,
 *      so west/north/pixel come back bit-identical or the file is in the wrong place.
 *
 *  ⚠ THE TIFF TAG SCANNER AT THE BOTTOM IS WRITTEN HERE, not imported from js/gis-geotiff.js. That
 *  reader deliberately does not surface ImageDescription or Copyright (it surfaces a GRID), so a
 *  check that asked it whether the licence travelled would be asking the wrong witness — and a check
 *  that asked js/gis-export.js what it wrote would be measuring a module against itself
 *  (tests/r749-gis-geotiff-checks states the same rule about its fixtures).
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { makeGisExport } from '../js/gis-export.js';
import { makeGisGeotiff } from '../js/gis-geotiff.js';
import { makeGisDatasets } from '../js/gis-datasets.js';
import { GEO_IMPORT } from '../js/geo-import.js';

/* ⚠ THE MODULES PUBLISH THEMSELVES ON `window`, and the id door of js/gis-export.js resolves through
   window.IntMapData at CALL time — which is the contract every module in this layer holds. Without a
   window here the check would only ever exercise the record-object door and would have measured
   nothing about the one the panel actually uses. */
globalThis.window = globalThis;

const { readGeoFile } = GEO_IMPORT;
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const EX = makeGisExport();
const GT = makeGisGeotiff();
const DATA = makeGisDatasets();

let seq = 0;
const fresh = (spec) => DATA.add(Object.assign({ id: 'r754-' + (++seq) }, spec));

const pt = (x, y, props) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: props || {} });
const poly = (ring, props) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: props || {} });

const file = (name, body) => new File([typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body)], name);

/* ══ ① GeoJSON — 書き出したものを、取り込みの口がそのまま読み直す ══════════════════════════ */

test('R756 ①: a GeoJSON export is read back by js/geo-import.js with identical geometry and attributes', async () => {
  /* Coordinates with more digits than a float32 holds, so a writer that narrowed them anywhere would
     show up as a difference rather than as a rounding nobody notices. */
  const feats = [
    pt(139.76712345678901, 35.68123456789012, { name: '東京', pop: 13960000, code: '01100' }),
    poly([[0, 0], [10, 0], [10, 5.5], [0, 5.5], [0, 0]], { name: 'box', note: 'has, comma' }),
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4], [5, 6]] }, properties: { name: 'line' } },
  ];
  const rec = fresh({ title: 'mixed', features: feats, sourceCrs: 'EPSG:4326' });

  const out = EX.write(rec.id, { format: 'geojson' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.format, 'geojson');
  assert.equal(out.mediaType, 'application/geo+json');
  assert.equal(out.filename, 'mixed.geojson');
  assert.ok(out.bytes instanceof Uint8Array && out.bytes.length > 0);

  const back = await readGeoFile(file(out.filename, out.bytes));
  assert.equal(back.ok, true, 'the export could not be read back: ' + JSON.stringify(back.why || null));
  assert.equal(back.fc.features.length, feats.length);
  for (let i = 0; i < feats.length; i++) {
    /* ⚠ deepEqual on the COORDINATES, not on a bounding box or a count: a transposed lon/lat or a
       dropped ring is exactly the kind of damage a 「書き出せた」 assertion cannot see. */
    assert.deepEqual(back.fc.features[i].geometry.type, feats[i].geometry.type, 'geometry type ' + i);
    assert.deepEqual(back.fc.features[i].geometry.coordinates, feats[i].geometry.coordinates, 'coordinates ' + i);
    for (const [k, v] of Object.entries(feats[i].properties)) {
      assert.equal(String(back.fc.features[i].properties[k]), String(v), 'property ' + k + ' of feature ' + i);
    }
  }
  assert.equal(out.stated.features, 3);
  assert.equal(out.stated.rowsWithoutGeometry, 0);
  assert.equal(out.stated.geometry, 'verbatim');
});

/* ══ ② CSV — 点は点として戻る ═════════════════════════════════════════════════════════════ */

test('R756 ②: a CSV export of points is read back by js/geo-import.js as the same points', async () => {
  const feats = [
    pt(139.7671, 35.6812, { name: 'Tokyo', note: 'a "quoted" word' }),
    pt(135.5023, 34.6937, { name: 'Osaka', note: 'two\nlines' }),
    pt(141.3545, 43.0618, { name: 'Sapporo', note: 'comma, inside' }),
  ];
  const rec = fresh({ title: 'cities', features: feats });

  const out = EX.write(rec, { format: 'csv' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.stated.geometry, 'lon-lat-columns');
  assert.equal(out.stated.geometryRoundTrip, true);
  assert.deepEqual(out.stated.geometryColumns, ['longitude', 'latitude']);
  assert.equal(out.stated.lineEnding, 'CRLF');
  assert.equal(out.stated.delimiter, ',');

  const back = await readGeoFile(file('cities.csv', out.bytes));
  assert.equal(back.ok, true, 'the CSV could not be read back: ' + JSON.stringify(back.why || null));
  assert.equal(back.format, 'csv');
  assert.equal(back.fc.features.length, 3);
  for (let i = 0; i < feats.length; i++) {
    assert.deepEqual(back.fc.features[i].geometry.coordinates, feats[i].geometry.coordinates, 'coordinates ' + i);
    assert.equal(back.fc.features[i].properties.name, feats[i].properties.name);
    /* ⚠ THE QUOTING IS THE POINT: a quote, a newline and a comma all survive a full lap. A writer
       that stripped the newline would edit the reader's data on the way out and nothing downstream
       could ever tell. */
    assert.equal(back.fc.features[i].properties.note, feats[i].properties.note, 'note ' + i);
  }
});

/* ══ ③ CSV は幾何について何をしたかを述べる ═══════════════════════════════════════════════ */

test('R756 ③: a CSV of polygons keeps the shape as WKT and SAYS it cannot be read back as a shape', () => {
  const ring = [[0, 0], [10, 0], [10, 5], [0, 5], [0, 0]];
  const rec = fresh({ title: 'areas', features: [poly(ring, { name: 'box' })] });
  const out = EX.write(rec, { format: 'csv' });
  assert.equal(out.ok, true, JSON.stringify(out));

  /* ⚠ NOT DROPPED. The full ring is in the file… */
  assert.equal(out.stated.geometry, 'wkt');
  assert.deepEqual(out.stated.geometryColumns, ['geometry_wkt']);
  assert.ok(out.text.includes('POLYGON ((0 0, 10 0, 10 5, 0 5, 0 0))'), 'the WKT is not in the file: ' + out.text);
  /* …and the answer says, in a value the panel can read, that IntMap's own CSV door will hand it
     back as text. A true 「書き出しました」 with a silently unusable geometry is the defect. */
  assert.equal(out.stated.geometryRoundTrip, false);

  /* and a column of the reader's own called `geometry_wkt` is NOT overwritten */
  const clash = fresh({ title: 'clash', features: [poly(ring, { geometry_wkt: 'mine' })] });
  const out2 = EX.write(clash, { format: 'csv' });
  assert.equal(out2.ok, true);
  assert.deepEqual(out2.stated.geometryColumns, ['geometry_wkt_1']);
  assert.deepEqual(out2.stated.columns, ['geometry_wkt', 'geometry_wkt_1']);
  assert.ok(out2.text.split('\r\n')[1].startsWith('mine,'), 'the reader’s own column moved: ' + out2.text);
});

/* ══ ④ GeoTIFF — 画素も、場所も戻る ═══════════════════════════════════════════════════════ */

const GRID = { west: 135.5, north: 35.75, pixelLng: 0.25, pixelLat: 0.125 };

function gridRecord(o) {
  const w = o.width, h = o.height;
  const planes = o.planes;
  return fresh({
    kind: 'raster', title: o.title || 'grid', width: w, height: h,
    grid: o.grid || GRID,
    bands: o.bands || [{ name: 'elevation', unit: 'm', nodata: null }],
    provenance: o.provenance || { kind: 'unknown' },
    read: (b) => planes[b],
  });
}

test('R756 ④: a float GeoTIFF is read back by js/gis-geotiff.js — the same samples, in the same place', async () => {
  const w = 9, h = 7;
  /* asymmetric in both axes, so a transposed or mirrored write cannot coincide with the answer */
  const px = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.push(1000.5 + x * 3.25 - y * 17.125);
  const rec = gridRecord({ width: w, height: h, planes: [px], title: 'dem' });

  const out = EX.write(rec, { format: 'geotiff' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.filename, 'dem.tif');
  assert.equal(out.stated.dataType, 'float32');

  const r = await GT.read(out.bytes);
  assert.equal(r.ok, true, 'the GeoTIFF this app wrote could not be read by the reader this app has: '
    + JSON.stringify(r.why || null) + ' ' + JSON.stringify(r.detail || null));
  const grid = r.grid;
  assert.equal(grid.width, w);
  assert.equal(grid.height, h);

  /* ⚠ float32 IS EXACTLY Math.fround — see the header. No epsilon. */
  const got = grid.read(0);
  assert.equal(got.length, px.length);
  for (let i = 0; i < px.length; i++) assert.equal(got[i], Math.fround(px[i]), 'sample ' + i);

  /* ⚠⚠⚠ 画素が一致しても場所が違えば別のデータである。 */
  assert.equal(grid.affine.x0, GRID.west);
  assert.equal(grid.affine.y0, GRID.north);
  assert.equal(grid.affine.dx, GRID.pixelLng);
  assert.equal(grid.affine.dy, GRID.pixelLat);
  assert.equal(grid.crs, 'EPSG:4326');
  /* the band's own name and unit came back too — they are the file's statement, not a default */
  assert.equal(grid.bands[0].name, 'elevation');
  assert.equal(grid.bands[0].unit, 'm');
  /* float64 is the other half of 「float32 と整数」: a grid asked for it loses nothing at all */
  const wide = EX.write(rec, { format: 'geotiff', dataType: 'float64' });
  const r2 = await GT.read(wide.bytes);
  assert.equal(r2.ok, true);
  const got2 = r2.grid.read(0);
  for (let i = 0; i < px.length; i++) assert.equal(got2[i], px[i], 'float64 sample ' + i);
});

/* ══ ⑤ 場所は書き出しの一部である ═════════════════════════════════════════════════════════ */

test('R756 ⑤: two grids with the same pixels and different places do not come back the same', async () => {
  const w = 4, h = 3;
  const px = [];
  for (let i = 0; i < w * h; i++) px.push(i + 0.5);
  const here = gridRecord({ width: w, height: h, planes: [px], grid: GRID });
  const there = gridRecord({ width: w, height: h, planes: [px], grid: { west: -73.25, north: 40.5, pixelLng: 0.01, pixelLat: 0.02 } });

  const a = await GT.read(EX.write(here, { format: 'geotiff' }).bytes);
  const b = await GT.read(EX.write(there, { format: 'geotiff' }).bytes);
  assert.equal(a.ok, true); assert.equal(b.ok, true);
  /* the samples agree… */
  assert.deepEqual(Array.from(a.grid.read(0)), Array.from(b.grid.read(0)));
  /* …and the files are still about two different parts of the Earth, each one where its record said */
  assert.equal(a.grid.affine.x0, GRID.west);
  assert.equal(b.grid.affine.x0, -73.25);
  assert.equal(b.grid.affine.y0, 40.5);
  assert.equal(b.grid.affine.dx, 0.01);
  assert.equal(b.grid.affine.dy, 0.02);
});

/* ══ ⑥ 出典は、在るときだけ残る ═══════════════════════════════════════════════════════════ */

const PROV = {
  kind: 'import', file: 'gsi-dem.tif', url: 'https://example.org/dem',
  licence: 'CC BY 4.0 — Geospatial Information Authority of Japan',
  attribution: '国土地理院', readAt: '2026-09-16T01:02:03Z',
};

test('R756 ⑥: a dataset that states a licence carries it out; one that states none claims none', async () => {
  const withProv = fresh({ title: 'sourced', features: [pt(1, 2, { a: '1' })], provenance: PROV });
  const bare = fresh({ title: 'bare', features: [pt(1, 2, { a: '1' })] });

  const a = JSON.parse(EX.write(withProv, { format: 'geojson' }).text);
  assert.equal(a.license, PROV.licence);
  assert.equal(a.attribution, PROV.attribution);
  assert.equal(a.source, PROV.url);
  assert.equal(a.intmap.retrievedAt, PROV.readAt);
  /* ⚠ AND THE WHOLE RECIPE, VERBATIM — the interop members above are a convenience, not the carrier.
     A provenance key this writer has never heard of must still arrive. */
  assert.deepEqual(a.intmap.provenance, PROV);

  const b = JSON.parse(EX.write(bare, { format: 'geojson' }).text);
  /* ⚠ THE OTHER DIRECTION, AND IT IS THE HALF THAT MATTERS ([[intmap-data-must-not-claim-an-author-it-lacks]]).
     A field that is always present is a field that says nothing; an empty licence string IS a claim. */
  assert.equal('license' in b, false, 'a licence was invented for a dataset that states none');
  assert.equal('attribution' in b, false);
  assert.equal('source' in b, false);
  assert.equal(b.intmap.retrievedAt, null);

  /* the same rule, the other carrier: the GeoTIFF tags */
  const w = 2, h = 2, px = [1.5, 2.5, 3.5, 4.5];
  const sourced = gridRecord({ width: w, height: h, planes: [px], title: 'dem', provenance: PROV });
  const anon = gridRecord({ width: w, height: h, planes: [px], title: 'dem' });

  const t1 = asciiTags(EX.write(sourced, { format: 'geotiff' }).bytes);
  assert.equal(t1.get(33432), PROV.licence, 'the Copyright tag does not carry the stated licence');
  assert.equal(t1.get(270), 'dem');
  assert.equal(t1.get(305), 'IntMap');
  assert.ok(/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(t1.get(306) || ''), 'DateTime is not TIFF 6.0 shaped: ' + t1.get(306));
  /* ⚠ THE ITEMS ARE READ AS ITEMS, NOT AS SUBSTRINGS OF THE DOCUMENT. 「その文字列がどこかに在る」
     passes over a source written into the wrong item, or into a band's DESCRIPTION — and it is the
     shape a URL-sanitisation scanner correctly objects to, because a substring test on a URL says
     nothing about what surrounds it. What is measured is the value of the named item. */
  const md = gdalItems(t1.get(42112) || '');
  assert.equal(md.INTMAP_LICENCE, PROV.licence, 'the GDAL metadata does not carry the stated licence');
  assert.equal(md.INTMAP_SOURCE, PROV.url, 'the GDAL metadata does not carry the source');
  assert.equal(md.INTMAP_RETRIEVED_AT, PROV.readAt, 'the GDAL metadata does not carry the retrieval time');

  const t2 = asciiTags(EX.write(anon, { format: 'geotiff' }).bytes);
  assert.equal(t2.has(33432), false, 'a Copyright tag was written for a grid that states no licence');
  const md2 = t2.get(42112) || '';
  assert.equal(md2.includes('INTMAP_LICENCE'), false);
  assert.equal(md2.includes('INTMAP_ATTRIBUTION'), false);
  /* and the band description, which IS stated, still travels — absence of provenance is not silence */
  assert.ok(md2.includes('DESCRIPTION'), 'the band description was lost with the provenance');

  /* ⚠ a file that carries a licence must still be READABLE — the tags are additions, not damage */
  const r = await GT.read(EX.write(sourced, { format: 'geotiff' }).bytes);
  assert.equal(r.ok, true, JSON.stringify(r.why || null));
  assert.deepEqual(Array.from(r.grid.read(0)), px.map(Math.fround));
});

/* ══ ⑦ 空のもの・幾何を持たない行は、黙って通らない ═══════════════════════════════════════ */

test('R756 ⑦: an empty dataset is refused by name, and a table with no geometry is exported WITH that said', () => {
  const empty = fresh({ title: 'nothing', features: [] });
  for (const format of ['geojson', 'csv']) {
    const r = EX.write(empty, { format });
    assert.equal(r.ok, false, format + ' wrote a file with nothing in it');
    assert.equal(r.why, 'export-empty');
  }

  /* ⚠ A TABLE IS A LEGITIMATE EXPORT (js/gis-datasets.js §R738: rows with geometry:null are rows).
     What must not happen is that it goes out looking like a map layer. */
  const table = fresh({
    title: 'stats',
    features: [
      { type: 'Feature', geometry: null, properties: { code: '01100', pop: 1970000 } },
      { type: 'Feature', geometry: null, properties: { code: '13101', pop: 169000 } },
    ],
  });
  const g = EX.write(table, { format: 'geojson' });
  assert.equal(g.ok, true);
  assert.equal(g.stated.rowsWithoutGeometry, 2);
  assert.equal(g.stated.geometry, 'none');
  const c = EX.write(table, { format: 'csv' });
  assert.equal(c.ok, true);
  assert.equal(c.stated.rowsWithoutGeometry, 2);
  assert.equal(c.stated.geometry, 'none');
  assert.deepEqual(c.stated.geometryColumns, []);
  /* a MIXTURE states the mixture rather than picking a side */
  const mixed = fresh({
    title: 'mixed rows',
    features: [pt(1, 2, { a: '1' }), { type: 'Feature', geometry: null, properties: { a: '2' } }],
  });
  const m = EX.write(mixed, { format: 'csv' });
  assert.equal(m.stated.rowsWithoutGeometry, 1);
  assert.equal(m.stated.geometry, 'lon-lat-columns');
  assert.equal(m.text.split('\r\n')[2], '2,,', 'the geometry-less row did not leave its cells empty: ' + m.text);

  /* a format that cannot hold the payload is refused BY NAME, not attempted */
  const grid = gridRecord({ width: 2, height: 2, planes: [[1, 2, 3, 4]] });
  const bad1 = EX.write(grid, { format: 'geojson' });
  assert.equal(bad1.ok, false); assert.equal(bad1.why, 'export-format-not-for-kind');
  const bad2 = EX.write(table, { format: 'geotiff' });
  assert.equal(bad2.ok, false); assert.equal(bad2.why, 'export-format-not-for-kind');
  /* and an unnamed format is not guessed at */
  assert.equal(EX.write(table, {}).why, 'export-format-not-named');
  assert.equal(EX.write(table, { format: 'shapefile' }).why, 'export-format-unknown');
  assert.equal(EX.write('no-such-dataset', { format: 'csv' }).why, 'export-dataset-missing');
});

/* ══ ⑧ 整数は正確に、でなければ名前を付けて断る ═══════════════════════════════════════════ */

test('R756 ⑧: an integer GeoTIFF is exact, and a missing sample is never written as 0', async () => {
  const w = 4, h = 3;
  const px = [];
  for (let i = 0; i < w * h; i++) px.push(i * 1000);
  const rec = gridRecord({ width: w, height: h, planes: [px], bands: [{ name: 'count', unit: null, nodata: null }] });

  const out = EX.write(rec, { format: 'geotiff', dataType: 'uint16' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const r = await GT.read(out.bytes);
  assert.equal(r.ok, true, JSON.stringify(r.why || null));
  assert.deepEqual(Array.from(r.grid.read(0)), px);

  /* a value that does not fit is NOT wrapped into a different number */
  const big = gridRecord({ width: 2, height: 1, planes: [[70000, 1]] });
  const over = EX.write(big, { format: 'geotiff', dataType: 'uint16' });
  assert.equal(over.ok, false);
  assert.equal(over.why, 'export-value-out-of-range');
  assert.equal(over.detail.value, 70000);

  /* ⚠⚠⚠ docs/GIS-CORE.md §1.4 — 欠損を 0 で埋めない。An integer type has no NaN, so a grid with a
     hole and no stated nodata is REFUSED rather than written as a sea-level 0. */
  const holey = [1, NaN, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const holed = gridRecord({ width: w, height: h, planes: [holey], bands: [{ name: 'count', unit: null, nodata: null }] });
  const ref = EX.write(holed, { format: 'geotiff', dataType: 'int32' });
  assert.equal(ref.ok, false);
  assert.equal(ref.why, 'export-missing-not-representable');
  assert.equal(ref.detail.pixel, 1);

  /* …and when the band DOES state one, the hole comes back as a hole — NaN, not the sentinel */
  const stated = gridRecord({ width: w, height: h, planes: [holey], bands: [{ name: 'count', unit: null, nodata: -9999 }] });
  const ok = EX.write(stated, { format: 'geotiff', dataType: 'int32' });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.stated.nodata, -9999);
  const r2 = await GT.read(ok.bytes);
  assert.equal(r2.ok, true);
  const back = r2.grid.read(0);
  assert.ok(Number.isNaN(back[1]), 'the missing pixel came back as ' + back[1] + ' — a value, not a hole');
  assert.equal(back[0], 1);
  assert.equal(back[2], 3);

  /* a float grid keeps its hole with no sentinel at all */
  const f = EX.write(gridRecord({ width: w, height: h, planes: [holey] }), { format: 'geotiff' });
  assert.equal(f.ok, true);
  assert.equal(f.stated.nodata, null);
  const r3 = await GT.read(f.bytes);
  assert.ok(Number.isNaN(r3.grid.read(0)[1]));

  /* an unknown sample type is named, with the list — not silently defaulted */
  const bad = EX.write(rec, { format: 'geotiff', dataType: 'int12' });
  assert.equal(bad.why, 'export-datatype-unknown');
  assert.ok(bad.detail.dataTypes.includes('float32'));
  /* and a band that does not exist is named too */
  assert.equal(EX.write(rec, { format: 'geotiff', band: 3 }).why, 'export-band-out-of-range');
});

/* ══ ⑧b 多バンド ══════════════════════════════════════════════════════════════════════════ */

test('R756 ⑧b: a two-band grid comes back as two bands, each with its own name, in its own order', async () => {
  const w = 3, h = 2;
  const a = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5];
  const b = [-1, -2, -3, -4, -5, -6];
  const rec = gridRecord({
    width: w, height: h, planes: [a, b],
    bands: [{ name: 'temperature', unit: '°C', nodata: null }, { name: 'rain', unit: 'mm', nodata: null }],
  });
  const out = EX.write(rec, { format: 'geotiff' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const r = await GT.read(out.bytes);
  assert.equal(r.ok, true, JSON.stringify(r.why || null));
  assert.equal(r.grid.bands.length, 2);
  assert.deepEqual(Array.from(r.grid.read(0)), a.map(Math.fround));
  assert.deepEqual(Array.from(r.grid.read(1)), b.map(Math.fround));
  assert.equal(r.grid.bands[1].name, 'rain');
  assert.equal(r.grid.bands[1].unit, 'mm');
  /* ⚠ the degree sign is not 7-bit ASCII: it must not turn into two bytes of mojibake inside the
     tag. The writer replaces it with '?' rather than emitting half a UTF-8 sequence, and says so. */
  assert.equal(r.grid.bands[0].name, 'temperature');

  /* two bands that disagree about what «missing» means cannot share one GDAL_NODATA tag */
  const clash = gridRecord({
    width: w, height: h, planes: [a, b],
    bands: [{ name: 'x', unit: null, nodata: -1 }, { name: 'y', unit: null, nodata: -9999 }],
  });
  const r2 = EX.write(clash, { format: 'geotiff' });
  assert.equal(r2.ok, false);
  assert.equal(r2.why, 'export-nodata-conflict');
});

/* ══ ⑨ 断りは文を持つ ═════════════════════════════════════════════════════════════════════ */

test('R756 ⑨: every refusal js/gis-export.js declares has a sentence in js/gis-panel.js', () => {
  const panel = read('js/gis-panel.js');
  const codes = EX.refusals();
  assert.ok(codes.length >= 10, 'the declaration is empty — this check would measure nothing');
  const missing = codes.filter((c) => panel.indexOf("'" + c + "'") < 0);
  assert.deepEqual(missing, [], 'refusal codes with no sentence in the panel: ' + missing.join(', '));

  /* and the declaration is not decoration: a code the module can answer with must be IN it — bad()
     throws on an undeclared one, so this measures that the throws and the list agree by construction
     (the same contract js/gis-geopackage.js holds). */
  const src = read('js/gis-export.js');
  const used = new Set();
  for (const m of src.matchAll(/bad\('([a-z0-9-]+)'/g)) used.add(m[1]);
  const undeclared = Array.from(used).filter((c) => codes.indexOf(c) < 0);
  assert.deepEqual(undeclared, [], 'codes thrown but not declared: ' + undeclared.join(', '));
});

/* ══ ⑨b 文は「綴りが在る」ではなく「評価すると出てくる」で測る ═══════════════════════════ */

test('R756 ⑨b: the panel EVALUATES to a sentence in English and in Japanese for every export refusal', async () => {
  /* ⚠ ⑨ ABOVE IS A SCAN, AND A SCAN MEASURES SPELLINGS ([[intmap-r488-lessons]], #R505: 「ソースを
     読む検査は評価順序を見ない」). A code whose row sits BELOW the fallback return, or inside a
     branch that is never reached, appears in the source and never reaches a reader. So the panel is
     built here and asked. */
  const asserts = [];
  const lang = { t: (which, en, jp) => { asserts.push([which, en, jp]); return which === 'jp' ? jp : en; }, locale: () => 'en-US' };
  window.IntMapLang = lang;
  const { makeGisPanel } = await import('../js/gis-panel.js');

  for (const which of ['en', 'jp']) {
    const panel = makeGisPanel({ lang: which });
    /* the fallback this panel gives an unrecognised code — measured, not written down, so that a
       change to the fallback cannot quietly make every row below look present */
    const fallback = panel.reasonText('r754-not-a-real-code');
    assert.ok(fallback.includes('r754-not-a-real-code'), 'the fallback does not carry the code it was given');
    for (const code of EX.refusals()) {
      const text = panel.reasonText(code, { id: 'x', band: 0, bands: 1, value: 1, pixel: 0, dataType: 'int32', formats: ['geojson'], dataTypes: ['float32'], values: [1, 2], format: 'x', kind: 'vector', crs: 'EPSG:3857', geometryType: 'Polygon', column: 'c', nodata: 0 });
      assert.ok(typeof text === 'string' && text.length > 0, code + ' has no sentence in ' + which);
      assert.ok(text.indexOf(code) < 0, code + ' fell through to the fallback in ' + which + ': ' + text);
    }
  }
  /* ⚠ AND BOTH LANGUAGES ARE ACTUALLY WRITTEN. CONSTITUTION.md §7: what IntMap itself authors is
     en + jp, so a row calling t() with an English string and nothing else would render `undefined`
     to every Japanese reader — which the two loops above cannot see, because they only ask for the
     language they were given. */
  for (const [, en, jp] of asserts) {
    assert.equal(typeof en, 'string');
    assert.ok(typeof jp === 'string' && jp.length > 0, 'a sentence has no Japanese: ' + en);
  }
});

/* ══ ⑩ 宣言から画面を作れる ═══════════════════════════════════════════════════════════════ */

test('R756 ⑩: the format list is a declaration a panel can build a control out of', () => {
  const all = EX.formats();
  assert.ok(all.length >= 3);
  for (const f of all) {
    assert.equal(typeof f.id, 'string');
    assert.ok(Array.isArray(f.kinds) && f.kinds.length > 0, f.id + ' names no dataset kind');
    assert.ok(/\//.test(f.mediaType), f.id + ' has no media type');
    assert.ok(f.extension && !f.extension.startsWith('.'), f.id + ' has no extension');
    /* ⚠ THE CLAIM THIS ROUND IS ABOUT: every format names the module that reads it back. A format
       with nothing on this line is bytes with no reader, which is the door that is not a door. */
    assert.ok(f.readBackBy && f.readBackBy.startsWith('js/'), f.id + ' names no reader');
  }
  assert.deepEqual(EX.formats('raster').map((f) => f.id), ['geotiff']);
  assert.deepEqual(EX.formats('vector').map((f) => f.id), ['geojson', 'csv']);
});

/* ══ THE WITNESS — a TIFF tag scanner that is not the module under test ═══════════════════════
   The 7 fields of an IFD entry, little-endian, ASCII values only. Written from TIFF 6.0 §2, the way
   tests/r749-gis-geotiff-checks writes its own fixtures: a check that asked js/gis-export.js what it
   had written would agree with itself whatever it wrote. */
/* The GDAL_METADATA document's items, by name. Written here rather than asked of js/gis-export.js —
   the reference for what a writer wrote must not come from the writer. */
function gdalItems(doc) {
  const out = {};
  for (const m of String(doc).matchAll(/<Item name="([^"]+)"(?:[^>]*)>([\s\S]*?)<\/Item>/g)) {
    out[m[1]] = m[2]
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  return out;
}

function asciiTags(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  assert.equal(u[0], 0x49, 'not a little-endian TIFF');
  assert.equal(dv.getUint16(2, true), 42, 'not a TIFF');
  const ifd = dv.getUint32(4, true);
  const n = dv.getUint16(ifd, true);
  const out = new Map();
  for (let i = 0; i < n; i++) {
    const at = ifd + 2 + i * 12;
    const tag = dv.getUint16(at, true);
    const type = dv.getUint16(at + 2, true);
    const count = dv.getUint32(at + 4, true);
    if (type !== 2) continue;                                   /* ASCII only */
    const off = count > 4 ? dv.getUint32(at + 8, true) : at + 8;
    let end = off;
    while (end < off + count && u[end] !== 0) end++;
    /* UTF-8, for the reason js/gis-export.js's asciiValues states — a scanner that read these as
       Latin-1 would report mojibake for a licence that is in fact intact. */
    out.set(tag, new TextDecoder('utf-8').decode(u.subarray(off, end)));
  }
  return out;
}
