/* ============================================================================
 *  GIS · WRITING FILES — 書き出し・往復・外部の読み手
 * ----------------------------------------------------------------------------
 *  js/gis-export.js: what the app writes comes back through its own readers unchanged, carries its
 *  licence and units, refuses what it cannot write, and — measured with a reader that shares no code
 *  with the app — opens in a program that has never heard of IntMap.
 *
 *  ⚠ ONE BLOCK PER ROUND, AND EACH BLOCK IS ISOLATED. The rounds below used to be files of their own,
 *  each in its own process; `isolate()` (tests/helpers/geo-shared.mjs) gives every block back the
 *  globalThis a fresh process had, so no block reads a `window` another one left behind. Test titles
 *  carry the round that wrote them (#R<N>), and each block keeps that round's own account of WHY.
 * ==========================================================================*/

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { GEO_IMPORT } from '../js/geo-import.js';
import { makeGisDatasets } from '../js/gis-datasets.js';
import { makeGisExport } from '../js/gis-export.js';
import { makeGisGeotiff } from '../js/gis-geotiff.js';
import { ROOT, isolate, read } from './helpers/geo-shared.mjs';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R756 · export round trips   (was tests/r756-gis-export-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
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
 *  (tests/geo-gis-geotiff-checks.test.mjs (#R749) states the same rule about its fixtures).
 * ==========================================================================*/
describe('§ #R756 · export round trips', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  /* ⚠ THE MODULES PUBLISH THEMSELVES ON `window`, and the id door of js/gis-export.js resolves through
     window.IntMapData at CALL time — which is the contract every module in this layer holds. Without a
     window here the check would only ever exercise the record-object door and would have measured
     nothing about the one the panel actually uses. */
  globalThis.window = globalThis;

  const { readGeoFile } = GEO_IMPORT;
  const ROOT = fileURLToPath(new URL('../', import.meta.url));

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
    /* ⚠⚠⚠ THE TWO LINES THAT USED TO BE HERE FIXED THE SPELLINGS — `['geotiff']` and
       `['geojson','csv']`. That is the shape .agents/rules/no-ad-hoc-hardcoding.md §1 names as 「名前
       の埋め込み一覧で、実体から導けるもの」: #R783 added `cog` and `geopackage` and the FIRST
       CORRECT CHANGE FAILED THE CHECK, which is [[intmap-ceiling-guards-are-not-policies]] exactly —
       a guard written to watch a regular expression land, read later as a policy about what may
       exist. This check's own title says what its subject is: 「a declaration a panel can build a
       control out of」. js/gis-panel.js:1533 asks `X.formats(kind)` and builds one `<option>` per
       row, labelled with the row's OWN id — so what must hold is that EVERY KIND A DATASET CAN BE
       yields a usable control, not that the options are the two somebody wrote down. */
    const kinds = [...new Set(all.flatMap((f) => f.kinds))].sort();
    assert.deepEqual(kinds, ['raster', 'vector'],
      'a format names a dataset kind that js/gis-datasets.js does not have, so no panel would ever offer it');

    for (const kind of kinds) {
      const offered = EX.formats(kind);
      /* the panel renders an empty list as the `export-format-not-for-kind` note, so a kind with no
         format is a dataset a reader cannot get out at all */
      assert.ok(offered.length > 0, kind + ' datasets have no format to offer');
      /* ⚠ FILTERING IS FILTERING, not a second table: every row offered for a kind claims it, and
         every row that claims it is offered. A format that fell out of the filter would be a door
         that exists and is never shown. */
      for (const f of offered) assert.ok(f.kinds.includes(kind), f.id + ' was offered for ' + kind + ' and does not claim it');
      for (const f of all) {
        if (f.kinds.includes(kind)) assert.ok(offered.some((o) => o.id === f.id), f.id + ' claims ' + kind + ' and is not offered for it');
      }
      /* an `<option>` needs a value that distinguishes it, and a download needs a name that does */
      const ids = offered.map((f) => f.id);
      assert.deepEqual([...new Set(ids)], ids, kind + ' offers two formats under one id: ' + ids.join(' / '));
    }

    /* ⚠ AND EVERY DECLARED FORMAT IS ONE write() WILL ACTUALLY PRODUCE. The list is what the panel
       puts in front of a reader, so a row nobody can write is a control that fails when clicked —
       and `export-format-unknown` naming a format the same module advertises is the contradiction
       this asserts away. Measured through the door rather than by reading the table. */
    for (const f of all) {
      const res = EX.write({ id: 'x', kind: f.kinds[0], features: () => [], width: 0, height: 0 }, { format: f.id });
      assert.equal(res.ok, false, f.id + ': an empty dataset was written anyway');
      assert.notEqual(res.why, 'export-format-unknown', f.id + ' is declared and write() does not know it');
      assert.notEqual(res.why, 'export-format-not-for-kind', f.id + ' is declared for ' + f.kinds[0] + ' and write() refuses that kind');
    }
  });

  /* ══ THE WITNESS — a TIFF tag scanner that is not the module under test ═══════════════════════
     The 7 fields of an IFD entry, little-endian, ASCII values only. Written from TIFF 6.0 §2, the way
     tests/geo-gis-geotiff-checks.test.mjs (#R749) writes its own fixtures: a check that asked js/gis-export.js what it
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

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R774 · band units written where GDAL reads them   (was tests/r774-gis-geotiff-unit-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R774 · 書き出した GeoTIFF の単位が、この製品の外の GIS に届くか
 * ----------------------------------------------------------------------------
 *  THE DEFECT, RESTATED AS THE DEFECT ([[intmap-restate-the-defect-not-the-fix]]):
 *
 *      js/gis-export.js wrote the band's unit into GDAL_METADATA (42112) as
 *          <Item name="UNITTYPE" sample="0" role="unit">K</Item>
 *      and GDAL's GTiff driver pairs UNITTYPE with role="unittype". It is the ROLE that the driver
 *      reads back into the band, so GDAL 3.12.1 opened an IntMap GeoTIFF and reported the unit as
 *      None. The value was in the file. No GIS outside this repository could see it. The line above
 *      it — role="description" — was right, which is what made the wrong one look right.
 *
 *  ⚠⚠⚠ WHY NO ROUND TRIP COULD HAVE CAUGHT IT ([[intmap-co-designed-reader-cannot-falsify]]):
 *  js/gis-geotiff.js keys those items on `name` and ignores `role` entirely, so IntMap wrote a file
 *  IntMap could read and no one else could. Writer and reader, built together, agreed about a file
 *  that was wrong. THEREFORE THE WITNESS IN THIS FILE IS NEITHER OF THEM: the GDAL metadata document
 *  is lifted out of the emitted bytes by a TIFF scanner and an XML item scanner written here, and the
 *  expected role is the spelling GDAL uses.
 *
 *  ⚠ THE EXPECTED SPELLINGS ARE A CONSTANT WITH ITS THREE LINES (.agents/rules/no-ad-hoc-hardcoding.md §4):
 *    · observation — GDAL's GTiff driver carries a fixed pairing of band metadata item names to
 *      roles: DESCRIPTION↔description, UNITTYPE↔unittype, SCALE↔scale, OFFSET↔offset. It writes the
 *      role and it reads the role; a file whose role it does not recognise loses that item.
 *    · what would make it wrong — GDAL renaming a role, which would also orphan every file GDAL
 *      itself has written. ⚠ GDAL IS NOT INSTALLED ON THIS MACHINE, so this is not executed against
 *      it; what is executed is that IntMap writes the spelling and not another one.
 *    · the source of truth — js/gis-export.js, which is the only writer. This file is the only
 *      reference for what it should say, and it is deliberately not derived from it.
 *
 *  ⚠ AND THE READER'S INDEPENDENCE FROM `role` IS MEASURED, not assumed: GeoTIFFs written before
 *  #R774 (and GDAL files carrying roles this reader has never heard of) must keep opening with their
 *  units intact, so js/gis-geotiff.js must go on keying `name`. tests/geo-gis-geotiff-checks.test.mjs (#R749) reads a
 *  fixture with NO role at all; the check below goes the other way and gives it a role it has never
 *  seen, in bytes of the same length so nothing else about the file moves.
 * ==========================================================================*/
describe('§ #R774 · band units written where GDAL reads them', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  /* the id door of js/gis-export.js resolves through window.IntMapData at CALL time */
  globalThis.window = globalThis;

  const EX = makeGisExport();
  const GT = makeGisGeotiff();
  const DATA = makeGisDatasets();

  /* ⚠ WHAT GDAL CALLS THESE. See the header for the observation, the expiry and the source of truth. */
  const GDAL_ROLE = { DESCRIPTION: 'description', UNITTYPE: 'unittype' };

  let seq = 0;
  const GRID = { west: 135.5, north: 35.75, pixelLng: 0.25, pixelLat: 0.125 };

  function gridRecord(bands, planes, w, h) {
    return DATA.add({
      id: 'r774-g-' + (++seq), kind: 'raster', title: 'grid', width: w, height: h,
      grid: GRID, bands, provenance: { kind: 'unknown' }, read: (b) => planes[b],
    });
  }

  /* ══ THE WITNESS — written here, asked of neither the writer nor the reader ═══════════════════ */

  /* TIFF 6.0 §2: a little-endian header, one IFD, entries of 12 bytes. ASCII values only, which is all
     GDAL_METADATA is. Nothing here imports js/gis-geotiff.js — a check that asked the reader what the
     writer wrote would be the agreement this file exists to break. */
  function asciiTag(bytes, tag) {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    assert.equal(u[0], 0x49, 'not a little-endian TIFF');
    assert.equal(dv.getUint16(2, true), 42, 'not a TIFF');
    const ifd = dv.getUint32(4, true);
    const n = dv.getUint16(ifd, true);
    for (let i = 0; i < n; i++) {
      const at = ifd + 2 + i * 12;
      if (dv.getUint16(at, true) !== tag) continue;
      if (dv.getUint16(at + 2, true) !== 2) return null;              /* ASCII only */
      const count = dv.getUint32(at + 4, true);
      const off = count > 4 ? dv.getUint32(at + 8, true) : at + 8;
      let end = off;
      while (end < off + count && u[end] !== 0) end++;
      return new TextDecoder('utf-8').decode(u.subarray(off, end));
    }
    return null;
  }

  /* Every <Item> with ALL of its attributes — the point of this file is the attribute the module under
     test got wrong, so an item scanner that kept only name and body would measure nothing. */
  function items(doc) {
    const out = [];
    for (const m of String(doc).matchAll(/<Item\b([^>]*)>([\s\S]*?)<\/Item>/g)) {
      const attrs = {};
      for (const a of m[1].matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = a[2];
      out.push({
        attrs,
        body: m[2].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'").replace(/&amp;/g, '&'),
      });
    }
    return out;
  }

  const byName = (list, name, sample) =>
    list.find((it) => it.attrs.name === name && (sample == null || it.attrs.sample === String(sample))) || null;

  /* ══ ① 単位の role が GDAL の綴りである ═══════════════════════════════════════════════════ */

  test('R774 ① the band unit is written with the role GDAL reads it back from', () => {
    const px = [1.5, 2.5, 3.5, 4.5];
    const rec = gridRecord([{ name: 'surface temperature', unit: 'K', nodata: null }], [px], 2, 2);

    const out = EX.write(rec, { format: 'geotiff' });
    assert.equal(out.ok, true, JSON.stringify(out));

    const doc = asciiTag(out.bytes, 42112);
    assert.ok(doc, 'the file carries no GDAL_METADATA at all');
    const list = items(doc);

    const unit = byName(list, 'UNITTYPE', 0);
    assert.ok(unit, 'the unit item is not in the file');
    assert.equal(unit.body, 'K');
    /* ⚠ THE MEASURED DEFECT. This was role="unit", and GDAL therefore reported no unit. */
    assert.equal(unit.attrs.role, GDAL_ROLE.UNITTYPE,
      'the unit item carries a role GDAL does not read units from: ' + JSON.stringify(unit.attrs));

    /* the neighbouring item was always right, and stays right — a fix that swapped them would be a
       different defect wearing the same green */
    const desc = byName(list, 'DESCRIPTION', 0);
    assert.ok(desc, 'the description item is not in the file');
    assert.equal(desc.body, 'surface temperature');
    assert.equal(desc.attrs.role, GDAL_ROLE.DESCRIPTION);
  });

  test('R774 ① every band gets its own item, with the sample index and the role', () => {
    /* Two bands, so a role written once outside the loop — or a sample index that did not move —
       shows up here rather than in a one-band file where both look the same. */
    const a = [1, 2, 3, 4], b = [5, 6, 7, 8];
    const rec = gridRecord([
      { name: 'temperature', unit: '°C', nodata: null },
      { name: 'precipitation', unit: 'mm/h', nodata: null },
    ], [a, b], 2, 2);

    const out = EX.write(rec, { format: 'geotiff' });
    assert.equal(out.ok, true, JSON.stringify(out));
    const list = items(asciiTag(out.bytes, 42112));

    const u0 = byName(list, 'UNITTYPE', 0), u1 = byName(list, 'UNITTYPE', 1);
    assert.ok(u0 && u1, 'one of the two bands has no unit item: ' + JSON.stringify(list.map((i) => i.attrs)));
    /* ⚠ UTF-8, not Latin-1: 「°C」 survives the tag as itself, so a degree sign is not evidence of a
       broken role — it is evidence the encoding is right. */
    assert.equal(u0.body, '°C');
    assert.equal(u1.body, 'mm/h');
    assert.equal(u0.attrs.role, GDAL_ROLE.UNITTYPE);
    assert.equal(u1.attrs.role, GDAL_ROLE.UNITTYPE);
    assert.equal(byName(list, 'DESCRIPTION', 1).attrs.role, GDAL_ROLE.DESCRIPTION);

    /* ⚠ AND NO UNIT IS INVENTED FOR A BAND THAT STATES NONE (§1 of js/gis-export.js): an item is a
       claim, and an empty one claims 「単位は無い」 about data whose unit is simply unstated. */
    const bare = gridRecord([{ name: 'count', unit: null, nodata: null }], [a], 2, 2);
    const bareList = items(asciiTag(EX.write(bare, { format: 'geotiff' }).bytes, 42112));
    assert.equal(byName(bareList, 'UNITTYPE', 0), null, 'a unit was invented for a band that states none');
    assert.ok(byName(bareList, 'DESCRIPTION', 0), 'the name that IS stated went missing with it');
  });

  /* ══ ② 読み手は role に依存しない（#R774 より前のファイルが開けなくなっていない） ═══════ */

  test('R774 ② js/gis-geotiff.js reads the unit by NAME — a role it has never seen changes nothing', () => {
    const px = [1.5, 2.5, 3.5, 4.5];
    const rec = gridRecord([{ name: 'elevation', unit: 'm', nodata: null }], [px], 2, 2);
    const bytes = EX.write(rec, { format: 'geotiff' }).bytes;

    return (async () => {
      const r = await GT.read(bytes);
      assert.equal(r.ok, true, JSON.stringify(r.why || null));
      assert.equal(r.grid.bands[0].unit, 'm');
      assert.equal(r.grid.bands[0].name, 'elevation');

      /* ⚠ THE ROLE IS OVERWRITTEN IN PLACE, byte for byte, so the strip offsets and the tag counts do
         not move and the only thing that differs is the attribute. `unittype` and `notarole` are both
         eight bytes. A GeoTIFF written before #R774 says role="unit" and a GDAL file may say something
         else again; all of them must keep opening. */
      const u = new Uint8Array(bytes);
      const where = find(u, 'role="unittype"');
      assert.ok(where >= 0, 'the role is not in the bytes at all — this check is measuring nothing');
      const replacement = new TextEncoder().encode('notarole');
      assert.equal(replacement.length, 8);
      u.set(replacement, where + 'role="'.length);

      const r2 = await GT.read(u);
      assert.equal(r2.ok, true, JSON.stringify(r2.why || null));
      assert.equal(r2.grid.bands[0].unit, 'm',
        'the reader started keying on `role`, so every GeoTIFF written before #R774 lost its units');
    })();
  });

  function find(u, needle) {
    const n = new TextEncoder().encode(needle);
    outer: for (let i = 0; i + n.length <= u.length; i++) {
      for (let j = 0; j < n.length; j++) if (u[i + j] !== n[j]) continue outer;
      return i;
    }
    return -1;
  }

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R765 · an external reader opens what we write   (was tests/r765-gis-external-reader-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R765 · 「書き出せた」を、自分以外の読み手で確かめる
 * ----------------------------------------------------------------------------
 *  #R756 established that 「書き出せた」 is not 「読み直せた」, and measured the round trip: every
 *  format this app writes is read back by a reader this app has, with zero tolerance. That was the
 *  right first step and it has a limit its own note did not state:
 *
 *      A WRITER AND A READER THAT WERE BUILT TOGETHER CAN AGREE ON A FILE NOBODY ELSE CAN OPEN.
 *
 *  If js/gis-export.js writes a tag in the wrong order, omits one QGIS needs, or states a byte order
 *  it does not use, js/gis-geotiff.js — which this repository also wrote, from the same reading of
 *  the same specification — is exactly the reader most likely to forgive it. The round trip would
 *  stay green and the file would still be unopenable anywhere else. This is the shape the project
 *  keeps recording: a comparison that cannot disagree measures nothing
 *  ([[intmap-prefilter-erred-inward-under-a-comment-saying-outward]]).
 *
 *  ⚠⚠ SO THE READER BELOW IS WRITTEN AGAINST THE SPECIFICATION, NOT AGAINST THE WRITER. It is a
 *  plain TIFF 6.0 / GeoTIFF 1.0 parser: byte-order mark, IFD walk, the tags by NUMBER, strip offsets,
 *  IEEE-754 floats, ModelPixelScale (33550) and ModelTiepoint (33922). It does not import
 *  js/gis-geotiff.js and it does not import js/gis-export.js's constants — it knows only what the
 *  published format says, which is all another program would know.
 *  ⚠ IT IS DELIBERATELY STRICT ABOUT THINGS A FORGIVING READER WOULD SKIP: the magic number, the
 *  IFD entry count, that offsets land inside the file, and that the declared sample format matches
 *  the bytes actually written. Each of those is a way a file can be technically unreadable while a
 *  co-designed reader sails past it.
 *
 *  ⚠ WHAT THIS FILE DOES NOT CLAIM. It is not GDAL. A green run here means 「仕様どおりに書けている」,
 *  not 「QGIS で開ける」 — that is a claim only an actual third-party read can make, and this
 *  repository cannot make it offline. That limit is stated rather than papered over.
 * ==========================================================================*/
describe('§ #R765 · an external reader opens what we write', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  async function boot() {
    const w = {};
    globalThis.window = w;
    new Function('window', read('js/geodesy.js'))(w);
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisRaster } = await import('../js/gis-raster.js');
    const { makeGisExport } = await import('../js/gis-export.js');
    const data = makeGisDatasets();
    w.IntMapData = data; w.IntMapGisRaster = makeGisRaster();
    const ex = makeGisExport();
    w.IntMapGisExport = ex;
    return { w, data, ex };
  }

  /* ══ an independent TIFF 6.0 / GeoTIFF 1.0 reader ═══════════════════════════════════════════════
     Written from the specification. Knows nothing about how this app writes. */

  const TAG = {
    ImageWidth: 256, ImageLength: 257, BitsPerSample: 258, Compression: 259,
    PhotometricInterpretation: 262, StripOffsets: 273, SamplesPerPixel: 277,
    RowsPerStrip: 278, StripByteCounts: 279, PlanarConfiguration: 284,
    SampleFormat: 339, ModelPixelScale: 33550, ModelTiepoint: 33922,
  };
  const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

  function readTiff(bytes) {
    const u8 = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const b0 = u8[0], b1 = u8[1];
    if (!((b0 === 0x49 && b1 === 0x49) || (b0 === 0x4d && b1 === 0x4d))) throw new Error('not a TIFF: byte-order mark is ' + b0 + ',' + b1);
    const LE = (b0 === 0x49);
    const magic = dv.getUint16(2, LE);
    if (magic !== 42) throw new Error('not a classic TIFF: magic is ' + magic);
    const ifd0 = dv.getUint32(4, LE);
    if (ifd0 <= 0 || ifd0 >= u8.byteLength) throw new Error('IFD offset outside the file: ' + ifd0);

    const count = dv.getUint16(ifd0, LE);
    if (count <= 0) throw new Error('IFD declares no entries');
    const need = ifd0 + 2 + count * 12 + 4;
    if (need > u8.byteLength) throw new Error('IFD of ' + count + ' entries runs past the end of the file');

    const tags = new Map();
    for (let i = 0; i < count; i++) {
      const at = ifd0 + 2 + i * 12;
      const tag = dv.getUint16(at, LE), type = dv.getUint16(at + 2, LE), n = dv.getUint32(at + 4, LE);
      const size = TYPE_SIZE[type];
      if (!size) throw new Error('tag ' + tag + ' declares an unknown field type ' + type);
      const total = size * n;
      let base = at + 8;
      if (total > 4) {
        base = dv.getUint32(at + 8, LE);
        if (base + total > u8.byteLength) throw new Error('tag ' + tag + ' points past the end of the file');
      }
      const vals = [];
      for (let k = 0; k < n; k++) {
        const o = base + k * size;
        if (type === 1 || type === 7) vals.push(dv.getUint8(o));
        else if (type === 3) vals.push(dv.getUint16(o, LE));
        else if (type === 4) vals.push(dv.getUint32(o, LE));
        else if (type === 8) vals.push(dv.getInt16(o, LE));
        else if (type === 9) vals.push(dv.getInt32(o, LE));
        else if (type === 11) vals.push(dv.getFloat32(o, LE));
        else if (type === 12) vals.push(dv.getFloat64(o, LE));
        else if (type === 5) vals.push(dv.getUint32(o, LE) / dv.getUint32(o + 4, LE));
        else if (type === 2) vals.push(String.fromCharCode(dv.getUint8(o)));
        else throw new Error('tag ' + tag + ' uses field type ' + type + ' this reader does not decode');
      }
      tags.set(tag, { type, n, vals });
    }
    const one = (t) => { const e = tags.get(t); return e ? e.vals[0] : null; };
    const all = (t) => { const e = tags.get(t); return e ? e.vals.slice() : null; };

    const width = one(TAG.ImageWidth), height = one(TAG.ImageLength);
    if (!width || !height) throw new Error('no image size in the IFD');
    const bits = one(TAG.BitsPerSample), fmt = one(TAG.SampleFormat);
    const spp = one(TAG.SamplesPerPixel) == null ? 1 : one(TAG.SamplesPerPixel);
    const offsets = all(TAG.StripOffsets) || [];
    const counts = all(TAG.StripByteCounts) || [];
    if (!offsets.length) throw new Error('no StripOffsets: nothing says where the samples are');
    for (let i = 0; i < offsets.length; i++) {
      if (offsets[i] + (counts[i] || 0) > u8.byteLength) throw new Error('strip ' + i + ' runs past the end of the file');
    }

    /* samples, read strip by strip in the order the IFD lists them */
    const values = [];
    for (let s = 0; s < offsets.length; s++) {
      const start = offsets[s], bytes2 = counts[s];
      const per = bits / 8;
      for (let o = 0; o + per <= bytes2; o += per) {
        const at = start + o;
        if (fmt === 3 && bits === 32) values.push(dv.getFloat32(at, LE));
        else if (fmt === 3 && bits === 64) values.push(dv.getFloat64(at, LE));
        else if (fmt === 2 && bits === 16) values.push(dv.getInt16(at, LE));
        else if (fmt === 2 && bits === 32) values.push(dv.getInt32(at, LE));
        else if (bits === 8) values.push(dv.getUint8(at));
        else if (bits === 16) values.push(dv.getUint16(at, LE));
        else if (bits === 32) values.push(dv.getUint32(at, LE));
        else throw new Error('samples are ' + bits + ' bits with SampleFormat ' + fmt + ' — this reader does not decode that');
      }
    }

    const scale = all(TAG.ModelPixelScale);
    const tie = all(TAG.ModelTiepoint);
    return {
      littleEndian: LE, entries: count, width, height, bits, sampleFormat: fmt,
      samplesPerPixel: spp, compression: one(TAG.Compression),
      planar: one(TAG.PlanarConfiguration), rowsPerStrip: one(TAG.RowsPerStrip),
      strips: offsets.length, values, pixelScale: scale, tiepoint: tie, tags,
    };
  }

  function gridRecord(data, spec) {
    const cells = Float64Array.from(data);
    return Object.assign({
      kind: 'raster', title: 'dem', width: 3, height: 2,
      grid: { west: 130, north: 40, pixelLng: 0.5, pixelLat: 0.25 },
      bands: [{ name: 'elev', unit: 'm', nodata: null }],
      read: () => cells,
    }, spec || {});
  }

  /* ══ ① 仕様どおりのファイルか ═══════════════════════════════════════════════════════════════ */

  test('#R765 ① この app が書いた GeoTIFF は、この app を知らない読み手が開ける', async () => {
    const { data, ex } = await boot();
    const w = 9, h = 7, px = [];
    /* 両方の軸で非対称 — 転置や鏡像がたまたま一致することがないように */
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.push(1000.5 + x * 3.25 - y * 17.125);
    const rec = data.add(gridRecord(px, { width: w, height: h }));

    const out = ex.write(rec, { format: 'geotiff' });
    assert.equal(out.ok, true, JSON.stringify(out));

    let t;
    try { t = readTiff(out.bytes); }
    catch (e) { assert.fail('仕様どおりに読めなかった: ' + e.message); }

    assert.equal(t.width, w, '幅が違う');
    assert.equal(t.height, h, '高さが違う');
    assert.equal(t.values.length, w * h, '画素の数が合わない: ' + t.values.length);
    for (let i = 0; i < px.length; i++) {
      /* float32 で書かれるので、比較は float32 に丸めた期待値に対して行う（読み手の都合ではなく、
         書式が持てる精度そのもの） */
      const want = Math.fround(px[i]);
      assert.ok(Math.abs(t.values[i] - want) < 1e-6, '画素 ' + i + ': ' + t.values[i] + ' ≠ ' + want);
    }
  });

  test('#R765 ① 場所が、仕様のタグから読み取れる — 画素が合っていても場所が違えば別のデータ', async () => {
    const { data, ex } = await boot();
    const rec = data.add(gridRecord([1, 2, 3, 4, 5, 6]));
    const out = ex.write(rec, { format: 'geotiff' });
    const t = readTiff(out.bytes);

    assert.ok(t.pixelScale && t.pixelScale.length >= 2, 'ModelPixelScale (33550) が無い');
    assert.ok(Math.abs(t.pixelScale[0] - 0.5) < 1e-12, '経度方向の画素の大きさが違う: ' + t.pixelScale[0]);
    assert.ok(Math.abs(t.pixelScale[1] - 0.25) < 1e-12, '緯度方向の画素の大きさが違う: ' + t.pixelScale[1]);

    assert.ok(t.tiepoint && t.tiepoint.length >= 6, 'ModelTiepoint (33922) が無い');
    /* 結び付け点は (i,j,k) → (x,y,z)。左上が west/north を指していること。 */
    assert.ok(Math.abs(t.tiepoint[3] - 130) < 1e-9, '左上の経度が違う: ' + t.tiepoint[3]);
    assert.ok(Math.abs(t.tiepoint[4] - 40) < 1e-9, '左上の緯度が違う: ' + t.tiepoint[4]);
  });

  test('#R765 ① 述べているバイト順・標本形式と、実際に書いたバイトが一致する', async () => {
    const { data, ex } = await boot();
    const rec = data.add(gridRecord([1.5, 2.5, 3.5, 4.5, 5.5, 6.5]));
    const out = ex.write(rec, { format: 'geotiff' });
    const t = readTiff(out.bytes);
    /* SampleFormat 3 = IEEE 浮動小数点。ここが 1（符号なし整数）のまま float を書くと、
       共に設計された読み手なら通すが、仕様どおりの読み手は別の数を読む。 */
    assert.equal(t.sampleFormat, 3, 'SampleFormat が IEEE float になっていない: ' + t.sampleFormat);
    assert.equal(t.bits, 32, 'BitsPerSample が 32 ではない: ' + t.bits);
    assert.equal(t.samplesPerPixel, 1);
    assert.equal(t.compression, 1, '無圧縮と述べていない: ' + t.compression);
    /* そして述べたとおりの数が実際に入っている */
    assert.ok(Math.abs(t.values[0] - 1.5) < 1e-9);
    assert.ok(Math.abs(t.values[5] - 6.5) < 1e-9);
  });

  /* ══ ② この読み手が、本当に不合格を出せること ═══════════════════════════════════════════════ */

  test('#R765 ② 参照の読み手は、壊れたファイルを実際に拒む — 拒めない参照は何も測っていない', async () => {
    const { data, ex } = await boot();
    const rec = data.add(gridRecord([1, 2, 3, 4, 5, 6]));
    const out = ex.write(rec, { format: 'geotiff' });

    const broken = Uint8Array.from(out.bytes);
    broken[0] = 0x00; broken[1] = 0x00;                 /* バイト順の印を潰す */
    assert.throws(() => readTiff(broken), /byte-order mark/, '壊れたバイト順を通してしまった');

    const badMagic = Uint8Array.from(out.bytes);
    new DataView(badMagic.buffer).setUint16(2, 43, badMagic[0] === 0x49);
    assert.throws(() => readTiff(badMagic), /magic/, '42 でない magic を通してしまった');

    const badOffset = Uint8Array.from(out.bytes);
    new DataView(badOffset.buffer).setUint32(4, 0xfffffff0, badOffset[0] === 0x49);
    assert.throws(() => readTiff(badOffset), /outside the file/, 'ファイルの外を指す IFD を通してしまった');
  });

  test('#R765 ② 参照の読み手は、この app の読み手を 1 行も使っていない', async () => {
    /* ⚠ 評価で測る（以前はこのファイル自身の import 行を読んでいた）。import 行を読む検査は、
       同じファイルに別の回の検査が同居した瞬間に意味を失う——このファイルは js/gis-geotiff.js を
       取り込む #R756 の往復検査と同居している。だから読み手そのものを、仕様の 2 つの表
       （タグ番号と型の大きさ）**だけ**を見せた空のスコープで組み立て直し、同じファイルを読ませる。
       js/gis-geotiff.js・js/gis-export.js・このファイルの何か 1 つにでも寄りかかっていれば、組み立て
       直した読み手は ReferenceError で止まるか、違う答えを返す。 */
    const { data, ex } = await boot();
    const rec = data.add(gridRecord([1.25, 2.5, 3.75, 5, 6.25, 7.5]));
    const out = ex.write(rec, { format: 'geotiff' });
    assert.equal(out.ok, true, JSON.stringify(out));
    // eslint-disable-next-line no-new-func
    const isolated = new Function('TAG', 'TYPE_SIZE', '"use strict"; return (' + readTiff.toString() + ');')(
      Object.freeze(Object.assign({}, TAG)), Object.freeze(Object.assign({}, TYPE_SIZE)));
    const alone = isolated(out.bytes), here = readTiff(out.bytes);
    assert.deepEqual(alone.values, here.values, '仕様の表だけで組み立てた読み手が、同じ画素を読まない');
    assert.deepEqual([alone.width, alone.height, alone.sampleFormat], [here.width, here.height, here.sampleFormat]);
    assert.deepEqual(Array.from(alone.values), [1.25, 2.5, 3.75, 5, 6.25, 7.5], '画素が書いたとおりでない');
    /* タグは番号で知っている（この app の綴りからではなく、公表された形式から） */
    assert.equal(TAG.ModelTiepoint, 33922, 'タグを番号で持っていない');
    assert.equal(TAG.ModelPixelScale, 33550, 'タグを番号で持っていない');
  });

  /* ══ ③ 何を主張していないか ═══════════════════════════════════════════════════════════════ */

  /* ⚠ この検査は最初、`/GDAL/` が文書のどこかに在れば通る書き方だった。**通ってしまった**
     ——`GDAL` は §1.4a と §1.4b に別の理由で出てくる語で、この回が述べるべきことは 1 文字も
     書かれていなかった。針が主題を持たないと、包含の一覧になって的の外を数える
     （[[intmap-claim-needle-is-an-inclusion-list]]）。だから測るのは**この節の中の、この主張**。 */
  test('#R765 ③ 文書が、この検査の限界をそのまま述べている', () => {
    /* 綴りのまま: 主張の対象が文書・註の文面そのもの。 */
    const doc = read('docs/GIS-CORE.md');
    const at = doc.indexOf('自分の読み手で読み直せることは、他人が開けることではない');
    assert.ok(at > 0, 'docs/GIS-CORE.md に、この主題の節が無い');
    const section = doc.slice(at, doc.indexOf('\n## ', at) < 0 ? undefined : doc.indexOf('\n## ', at));
    assert.ok(/GDAL/.test(section), 'その節が「GDAL ではない」と述べていない');
    assert.ok(/QGIS/.test(section), '「他のソフトで開ける」が何を意味するかが述べられていない');
    assert.ok(/33922|33550/.test(section), 'タグを番号で読んでいることが述べられていない');
  });

  ISOLATED.built();
});
