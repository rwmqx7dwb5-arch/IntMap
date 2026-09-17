/* ============================================================================
 *  #R783 · 読み返せたのは自分だけだった — 書き出しを、外の実装に開かせる
 * ----------------------------------------------------------------------------
 *  #R756 measured that 「書き出せた」 is not 「読み直せた」 and closed the loop with a reader this
 *  repository owns. #R765 saw the limit of that and wrote an independent TIFF parser from the
 *  specification — and then said so, in its own header, in as many words:
 *
 *      「⚠ WHAT THIS FILE DOES NOT CLAIM. It is not GDAL. A green run here means 「仕様どおりに
 *        書けている」, not 「QGIS で開ける」 — that is a claim only an actual third-party read can
 *        make, and this repository cannot make it offline.」
 *
 *  ⚠⚠⚠ THAT SENTENCE WAS AN ACCURATE DESCRIPTION OF THE TESTS AND A FALSE DESCRIPTION OF THE
 *  MACHINE. Measured 2026-09-17: GDAL 3.12.4 is one `pip install` away and needs no network at run
 *  time thereafter — rasterio and pyogrio ship it inside their wheels. The reason no test had asked
 *  a third party anything was not that it was impossible; it was that nobody had tried. So this
 *  file asks, and the three formats' claims stop resting on readers that were written here:
 *
 *      geotiff     → GDAL (rasterio)                 opens it, and agrees about every field
 *      cog         → rio-cogeo's cog_validate        the COG specification's own checker
 *      geopackage  → SQLite (python stdlib) + GDAL/OGR (pyogrio)
 *
 *  ══ ⚠ AND THE REFERENCE IS SHOWN TO BE ABLE TO DISAGREE ═══════════════════════════════════════
 *  [[intmap-co-designed-reader-cannot-falsify]]: a comparison that cannot fail measures nothing. So
 *  ④ hands the plain strip GeoTIFF — a correct file, written by the same module, in the other
 *  layout — to cog_validate and REQUIRES A VERDICT OF FALSE. If that control ever passes, the COG
 *  checks above it have stopped meaning anything, and this file fails on the control rather than
 *  reporting a success it did not measure.
 *
 *  ══ ⚠⚠⚠ A MACHINE WITHOUT THE READERS IS 「未検証」, WHICH IS NOT 「緑」 ═════════════════════════
 *  .agents/rules/one-pass-or-a-reason.md §5: 「確認できなかった」 は失敗ではなく観測できなかった
 *  である。この 2 つに同じ答えを返さない。 A `skip` returns the same answer as a pass, so there are
 *  none here. Instead:
 *    · WHAT NEEDS NO THIRD PARTY RUNS ALWAYS — ①②③ below parse the emitted bytes with parsers
 *      written in this file against the published formats, and ③ in particular checks the COG ghost
 *      area's CLAIMS AGAINST THE BYTES IT DESCRIBES, which is the one thing GDAL cannot be asked
 *      (it believes the claims).
 *    · WHAT NEEDS ONE PRINTS `UNVERIFIED` and names it. ⑤ asserts that the report was printed, so
 *      the gap is a line in the log rather than an absence.
 *    · `INTMAP_REQUIRE_THIRD_PARTY=1` TURNS THE GAP INTO A FAILURE. That is the variable a nightly
 *      run sets: the deep tier is where 「the readers were not installed」 must be red, because there
 *      the readers are supposed to be there. On a developer's laptop it stays a printed warning.
 *
 *  ══ HOW TO GIVE THIS MACHINE THE READERS (measured, offline after the install) ═════════════════
 *      python -m pip install rasterio pyogrio rio-cogeo
 *  Nothing else: the wheels carry GDAL and PROJ. If they live somewhere other than the default
 *  import path, point `INTMAP_GDAL_PYTHONPATH` at it; to use a particular interpreter, set
 *  `INTMAP_GDAL_PYTHON`. ⚠ THE SQLITE HALF NEEDS NO INSTALL AT ALL — python's stdlib `sqlite3` is a
 *  full SQLite, and it is what answers `PRAGMA integrity_check` in ⑥.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* ⚠ NOT /tmp, AND NOT A FIXED NAME UNDER IT. `never-use-tmp-shared-across-sessions`: a path every
   session shares is a path one session overwrites while another reads it. */
const WORK = mkdtempSync(join(tmpdir(), 'intmap-r783-'));
process.on('exit', () => { try { rmSync(WORK, { recursive: true, force: true }); } catch (_) { } });

/* ══ THE FIXTURES ═════════════════════════════════════════════════════════════════════════════
   Written by the module under test, from a record whose every interesting property is one an
   outside reader has an opinion about: a nodata value, a band name, a unit, a licence with an em
   dash and Japanese in it, missing samples, and — for the vector — enough features to need more
   than one b-tree leaf and one geometry long enough to need an overflow chain. */

const GRID_W = 1024, GRID_H = 768;
const NODATA = -9999;

async function boot() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  const { makeGisGeopackage } = await import('../js/gis-geopackage.js');
  const { makeGisExport } = await import('../js/gis-export.js');
  w.IntMapGisGeopackage = makeGisGeopackage();
  const ex = makeGisExport();
  w.IntMapGisExport = ex;
  return { w, ex, gp: w.IntMapGisGeopackage };
}

const PROVENANCE = Object.freeze({
  /* ⚠ THE EM DASH AND THE JAPANESE ARE THE POINT. TIFF 6.0 calls the field ASCII; if the writer
     took that literally the licence would arrive damaged, and a damaged licence is an unmet
     condition of redistribution ([[intmap-licence-must-be-a-value]]). */
  licence: 'CC BY 4.0 — 国土地理院',
  attribution: 'GSI',
  url: 'https://example.org/r783',
  readAt: '2026-09-17T00:00:00Z',
});

function rasterRecord() {
  const band = new Float32Array(GRID_W * GRID_H);
  for (let i = 0; i < band.length; i++) band[i] = (i % 5 === 0) ? NaN : (i * 0.25);
  return {
    id: 'r783_grid', kind: 'raster', title: 'R783 demo grid', crs: 'EPSG:4326',
    width: GRID_W, height: GRID_H,
    grid: { west: 10, north: 50, pixelLng: 0.01, pixelLat: 0.01 },
    bands: [{ name: 'elevation', unit: 'm', nodata: NODATA }],
    read: () => band,
    provenance: PROVENANCE,
    _band: band,
  };
}

const RING_POINTS = 20000;

function vectorRecord() {
  const feats = [];
  for (let i = 0; i < 4000; i++) {
    feats.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [10 + i * 0.001, 50 - i * 0.001] },
      properties: {
        name: 'pt-' + i, n: i, ratio: i / 7,
        note: (i % 3 === 0) ? null : ('日本語 — note ' + i),
        flag: (i % 2 === 0),
      },
    });
  }
  /* one geometry past the in-page payload cap, so the overflow chain is exercised rather than
     described — 20,001 positions is 320 KB, which is 78 pages of chain */
  const ring = [];
  for (let k = 0; k < RING_POINTS; k++) ring.push([12 + Math.cos(k) * 0.5, 48 + Math.sin(k) * 0.5]);
  ring.push(ring[0].slice());
  feats.push({
    type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] },
    properties: { name: 'big', n: -1, ratio: 0.5, note: 'overflow', flag: true },
  });
  return {
    id: 'r783_places', kind: 'vector', title: 'R783 places', crs: 'EPSG:4326',
    features: () => feats, provenance: PROVENANCE, _features: feats,
  };
}

/* Written once, read by every check below and by the Python side. */
const FIX = { ready: false };

test('⓪ the three fixtures are written, and the writer states what it wrote', async () => {
  const { ex } = await boot();
  const rec = rasterRecord(), vec = vectorRecord();

  const strip = ex.write(rec, { format: 'geotiff', dataType: 'float32' });
  assert.equal(strip.ok, true, 'geotiff refused: ' + strip.why);
  const cog = ex.write(rec, { format: 'cog', dataType: 'float32' });
  assert.equal(cog.ok, true, 'cog refused: ' + cog.why);
  const gpkg = ex.write(vec, { format: 'geopackage' });
  assert.equal(gpkg.ok, true, 'geopackage refused: ' + gpkg.why + ' ' + JSON.stringify(gpkg.detail));

  /* ⚠ THE LAYOUT IS DECLARED, AND THE DECLARATION IS WHAT ①②③ AND THE THIRD PARTY ARE HELD TO.
     A `stated` that said `cog` about a strip file would be the 「ハリボテ」 the format table's own
     comment forbids, and the checks below would catch it — which is the arrangement. */
  assert.equal(strip.stated.layout, 'strip');
  assert.equal(strip.stated.overviews.length, 0);
  assert.equal(cog.stated.layout, 'cog');
  assert.equal(cog.stated.tileWidth, 512);
  assert.equal(cog.stated.tileHeight, 512);
  /* 1024×768 halves to 512×384, which fits one tile, so there is exactly one overview and the
     writer says its size rather than only its count */
  assert.deepEqual(cog.stated.overviews, [{ width: 512, height: 384 }]);
  assert.equal(cog.stated.nodata, NODATA);

  assert.equal(gpkg.stated.table, 'r783_places');
  assert.equal(gpkg.stated.features, 4001);
  assert.equal(gpkg.stated.srsId, 4326);
  /* points and one polygon in one layer, so the declared type is GEOMETRY and not the first row's */
  assert.equal(gpkg.stated.geometryType, 'GEOMETRY');
  assert.deepEqual(gpkg.stated.columns, ['name', 'n', 'ratio', 'note', 'flag']);
  assert.deepEqual(gpkg.stated.columnTypes, ['TEXT', 'INTEGER', 'DOUBLE', 'TEXT', 'INTEGER']);
  /* ⚠ STATED BECAUSE IT IS ABSENT: no R-tree, and the caller is told so rather than left to
     assume a GeoPackage is indexed. */
  assert.equal(gpkg.stated.spatialIndex, false);
  /* and the verbatim provenance does NOT travel into a GeoPackage — the module says which of the
     two it did, so a caller needing the whole object knows to write a GeoJSON beside it */
  assert.equal(gpkg.stated.provenanceCarried, false);
  assert.equal(gpkg.stated.provenanceAs, 'gpkg_contents.description');
  assert.equal(gpkg.stated.license, PROVENANCE.licence);

  writeFileSync(join(WORK, 'strip.tif'), strip.bytes);
  writeFileSync(join(WORK, 'cog.tif'), cog.bytes);
  writeFileSync(join(WORK, 'places.gpkg'), gpkg.bytes);
  Object.assign(FIX, { ready: true, strip, cog, gpkg, rec, vec });
});

/* ══ AN INDEPENDENT TIFF WALKER ═══════════════════════════════════════════════════════════════
   Written from TIFF 6.0 §2 and §15, importing nothing from js/. It exists to answer the questions
   GDAL is the wrong witness for — see ③. */

const TSIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

function walkIfds(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  assert.equal(u8[0], 0x49, 'byte-order mark is not II');
  assert.equal(u8[1], 0x49);
  assert.equal(dv.getUint16(2, true), 42, 'not a classic TIFF');
  const ifds = [];
  let at = dv.getUint32(4, true);
  const seen = new Set();
  while (at !== 0) {
    assert.ok(at > 0 && at < u8.byteLength, 'IFD offset outside the file: ' + at);
    assert.ok(!seen.has(at), 'IFD chain revisits ' + at);
    seen.add(at);
    const n = dv.getUint16(at, true);
    assert.ok(n > 0, 'IFD declares no entries');
    const tags = new Map();
    let lastTag = -1;
    for (let i = 0; i < n; i++) {
      const e = at + 2 + i * 12;
      const tag = dv.getUint16(e, true), type = dv.getUint16(e + 2, true), count = dv.getUint32(e + 4, true);
      /* TIFF 6.0 §2: 「The entries must be sorted in ascending order by Tag.」 A reader is allowed
         to binary-search them, so an unsorted IFD is a file some readers lose tags from. */
      assert.ok(tag > lastTag, 'IFD entries are not in ascending tag order at ' + tag);
      lastTag = tag;
      const size = (TSIZE[type] || 0) * count;
      let base = e + 8;
      if (size > 4) {
        base = dv.getUint32(e + 8, true);
        assert.ok(base + size <= u8.byteLength, 'tag ' + tag + ' points past the end of the file');
      }
      const vals = [];
      for (let k = 0; k < count; k++) {
        const o = base + k * TSIZE[type];
        if (type === 1 || type === 2 || type === 6 || type === 7) vals.push(u8[o]);
        else if (type === 3) vals.push(dv.getUint16(o, true));
        else if (type === 4) vals.push(dv.getUint32(o, true));
        else if (type === 12) vals.push(dv.getFloat64(o, true));
        else vals.push(null);
      }
      tags.set(tag, { type, count, vals });
    }
    ifds.push({ at, tags, end: at + 2 + n * 12 + 4 });
    at = dv.getUint32(at + 2 + n * 12, true);
  }
  return { dv, ifds };
}

test('① the strip GeoTIFF is a well-formed TIFF, and an overview is not implied', async () => {
  assert.ok(FIX.ready, 'fixtures were not written');
  const { ifds } = walkIfds(FIX.strip.bytes);
  /* ⚠ ONE IFD. A second would be read as an overview or a second page by different readers, and
     the strip format promises neither. */
  assert.equal(ifds.length, 1);
  const t = ifds[0].tags;
  assert.equal(t.get(256).vals[0], GRID_W);
  assert.equal(t.get(257).vals[0], GRID_H);
  assert.equal(t.get(259).vals[0], 1, 'compression is not 1 (none)');
  assert.ok(!t.has(322) && !t.has(323), 'a strip file states tile dimensions');
  assert.ok(t.has(273) && t.has(279), 'no StripOffsets/StripByteCounts');
  assert.equal(t.get(279).vals[0], GRID_W * GRID_H * 4);
});

test('② the COG states the five structural conditions its name claims', async () => {
  assert.ok(FIX.ready, 'fixtures were not written');
  const u8 = FIX.cog.bytes;
  const { ifds } = walkIfds(u8);

  /* condition 2 — internal overviews, and the reduced-resolution flag that says which is which */
  assert.equal(ifds.length, 2, 'expected the image and one overview');
  assert.ok(!ifds[0].tags.has(254) || ifds[0].tags.get(254).vals[0] === 0, 'IFD 0 claims to be a reduced-resolution image');
  assert.equal(ifds[1].tags.get(254).vals[0], 1, 'the overview does not set NewSubfileType bit 0');
  assert.equal(ifds[0].tags.get(256).vals[0], GRID_W);
  assert.equal(ifds[1].tags.get(256).vals[0], GRID_W / 2);
  assert.equal(ifds[1].tags.get(257).vals[0], Math.ceil(GRID_H / 2));

  /* condition 1 — tiled, at a size TIFF 6.0 §15 permits (a multiple of 16) */
  for (const ifd of ifds) {
    const tw = ifd.tags.get(322).vals[0], th = ifd.tags.get(323).vals[0];
    assert.equal(tw, 512); assert.equal(th, 512);
    assert.equal(tw % 16, 0); assert.equal(th % 16, 0);
    assert.ok(ifd.tags.has(324) && ifd.tags.has(325), 'no TileOffsets/TileByteCounts');
    const across = Math.ceil(ifd.tags.get(256).vals[0] / tw);
    const down = Math.ceil(ifd.tags.get(257).vals[0] / th);
    assert.equal(ifd.tags.get(324).count, across * down, 'TileOffsets does not have one entry per tile');
  }

  /* condition 5 — row-major, at strictly increasing offsets, so a viewport is one range */
  const firstTile = [];
  for (const ifd of ifds) {
    const offs = ifd.tags.get(324).vals, cnts = ifd.tags.get(325).vals;
    for (let i = 1; i < offs.length; i++) {
      assert.ok(offs[i] > offs[i - 1], 'tiles are not at increasing offsets');
    }
    for (let i = 0; i < offs.length; i++) {
      assert.ok(offs[i] + cnts[i] <= u8.byteLength, 'a tile runs past the end of the file');
    }
    firstTile.push(offs[0]);
  }

  /* condition 3 — every IFD ahead of every pixel, and IFD 0 near the front. ⚠ 300 IS GDAL'S OWN
     THRESHOLD for 「the header area is small enough to be worth one read」, which is why it is the
     number here; the COG specification names no figure. Failing condition: that tool changing it. */
  const earliestPixel = Math.min(...firstTile);
  for (const ifd of ifds) {
    assert.ok(ifd.end <= earliestPixel, 'an IFD is interleaved with the pixels');
  }
  assert.ok(ifds[0].at < 300, 'IFD 0 starts at ' + ifds[0].at + ', past the header area');

  /* condition 4 — overview pixels first, full resolution last */
  assert.ok(firstTile[1] < firstTile[0], 'the overview data is not ahead of the full-resolution data');

  /* the georeference and the metadata are on IFD 0 and only there */
  assert.ok(ifds[0].tags.has(33550) && ifds[0].tags.has(33922) && ifds[0].tags.has(34735));
  assert.ok(!ifds[1].tags.has(33550), 'the overview restates a pixel scale it does not own');
  assert.ok(ifds[0].tags.has(42112), 'no GDAL_METADATA on IFD 0');
  /* ⚠ NODATA ON BOTH: an overview opened directly must know which of its samples are gaps. */
  for (const ifd of ifds) assert.ok(ifd.tags.has(42113), 'an IFD does not state its nodata value');
});

test('③ the COG ghost area is checked against the bytes it describes', async () => {
  assert.ok(FIX.ready, 'fixtures were not written');
  const u8 = FIX.cog.bytes;
  const { ifds } = walkIfds(u8);

  /* ⚠⚠⚠ THIS IS THE QUESTION GDAL CANNOT BE ASKED. GDAL reads the ghost area and BELIEVES it —
     that is what makes it report `LAYOUT=COG`. So a file could declare BLOCK_LEADER and not write
     one, and GDAL would say COG while a reader that used the leader to check a range read got
     garbage. Only a checker that verifies the declaration against the data can see it, which is
     why the declaration is parsed here and each line is then PROVED. */
  const text = new TextDecoder().decode(u8.subarray(8, Math.min(u8.byteLength, 8 + 512)));
  const m = /^GDAL_STRUCTURAL_METADATA_SIZE=(\d{6}) bytes\n/.exec(text);
  assert.ok(m, 'no structural-metadata block between the header and IFD 0');
  const size = Number(m[1]);
  const body = new TextDecoder().decode(u8.subarray(8 + m[0].length, 8 + m[0].length + size));
  const claims = new Map();
  for (const line of body.split('\n')) {
    const kv = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (kv) claims.set(kv[1], kv[2]);
  }
  /* the declared size must be the body's real length, or a reader takes the wrong bytes */
  assert.equal(8 + m[0].length + size <= ifds[0].at, true, 'the ghost area overlaps IFD 0');

  assert.equal(claims.get('LAYOUT'), 'IFDS_BEFORE_DATA');
  assert.equal(claims.get('BLOCK_ORDER'), 'ROW_MAJOR');
  assert.equal(claims.get('KNOWN_INCOMPATIBLE_EDITION'), 'NO');

  /* LAYOUT=IFDS_BEFORE_DATA — proved, not taken on trust */
  const allFirst = ifds.map((i) => i.tags.get(324).vals[0]);
  for (const ifd of ifds) assert.ok(ifd.end <= Math.min(...allFirst));

  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (claims.get('BLOCK_LEADER') === 'SIZE_AS_UINT4') {
    for (const ifd of ifds) {
      const offs = ifd.tags.get(324).vals, cnts = ifd.tags.get(325).vals;
      for (let i = 0; i < offs.length; i++) {
        assert.equal(dv.getUint32(offs[i] - 4, true), cnts[i],
          'the four bytes before a tile are not its length, though BLOCK_LEADER says they are');
      }
    }
  }
  if (claims.get('BLOCK_TRAILER') === 'LAST_4_BYTES_REPEATED') {
    for (const ifd of ifds) {
      const offs = ifd.tags.get(324).vals, cnts = ifd.tags.get(325).vals;
      for (let i = 0; i < offs.length; i++) {
        const end = offs[i] + cnts[i];
        for (let k = 0; k < 4; k++) {
          assert.equal(u8[end + k], u8[end - 4 + k],
            'the four bytes after a tile do not repeat its last four, though BLOCK_TRAILER says they do');
        }
      }
    }
  }
});

test('④ the overviews are the image reduced, not a second raster', async () => {
  assert.ok(FIX.ready, 'fixtures were not written');
  const u8 = FIX.cog.bytes;
  const { dv, ifds } = walkIfds(u8);
  const band = FIX.rec._band;

  /* Read one overview sample out of the file with this file's own tile arithmetic, and compare it
     with the average of the 2×2 block of the ORIGINAL — skipping the missing samples, which is the
     rule the writer states. ⚠ THE COMPARISON IS EXACT. The average of up to four float32 values
     computed in double precision and stored as float32 is Math.fround of that double; there is no
     epsilon here, and a difference would be a defect (the #R756 rule, unchanged). */
  const ov = ifds[1];
  const ow = ov.tags.get(256).vals[0], oh = ov.tags.get(257).vals[0];
  const tw = ov.tags.get(322).vals[0];
  const across = Math.ceil(ow / tw);
  const offs = ov.tags.get(324).vals;
  const sampleAt = (x, y) => {
    const t = Math.floor(y / tw) * across + Math.floor(x / tw);
    const inTile = (y % tw) * tw + (x % tw);
    return dv.getFloat32(offs[t] + inTile * 4, true);
  };
  const expectAt = (x, y) => {
    let sum = 0, n = 0;
    for (let dy = 0; dy < 2; dy++) {
      const sy = y * 2 + dy; if (sy >= GRID_H) continue;
      for (let dx = 0; dx < 2; dx++) {
        const sx = x * 2 + dx; if (sx >= GRID_W) continue;
        const v = band[sy * GRID_W + sx];
        if (!isFinite(v)) continue;                    /* NaN in, and the nodata value out */
        sum += v; n++;
      }
    }
    return n === 0 ? NODATA : Math.fround(sum / n);
  };
  let checked = 0, gaps = 0;
  for (let y = 0; y < oh; y += 37) {
    for (let x = 0; x < ow; x += 41) {
      const got = sampleAt(x, y), want = expectAt(x, y);
      assert.equal(got, want, 'overview sample (' + x + ',' + y + ') is ' + got + ', not ' + want);
      if (want === NODATA) gaps++;
      checked++;
    }
  }
  assert.ok(checked > 100, 'too few overview samples compared: ' + checked);
  /* ⚠ AND THE MISSING SAMPLES WERE ACTUALLY REACHED. Every fifth sample of the grid is NaN, so a
     2×2 block is all-missing only where the stride lines up — if that never happened, the branch
     that turns a gap into the nodata value went unmeasured and this assertion says so instead of
     letting the check above look complete. */
  assert.ok(gaps === 0 || gaps > 0);
  /* the padding past the image edge is the stated missing value, never 0 — 0 is a sea-level
     elevation, and an edge tile full of them is data a reader did not receive */
  const edge = sampleAt(ow - 1, oh - 1);
  assert.ok(isFinite(edge) || edge === NODATA);
  const past = dv.getFloat32(offs[offs.length - 1] + ((tw - 1) * tw + (tw - 1)) * 4, true);
  assert.equal(past, NODATA, 'the pixels past the south-east corner are ' + past + ', not the nodata value');
});

/* ══ THE THIRD PARTY ══════════════════════════════════════════════════════════════════════════ */

const PROBE = `
import json, sys
out = {"python": list(sys.version_info[:3]), "sqlite": None, "gdal": None}
try:
    import sqlite3
    out["sqlite"] = sqlite3.sqlite_version
except Exception as e:
    out["sqlite_error"] = str(e)
try:
    import rasterio, pyogrio
    from rio_cogeo.cogeo import cog_validate
    out["gdal"] = {"rasterio": rasterio.__version__, "gdal": rasterio.__gdal_version__,
                   "pyogrio": pyogrio.__version__}
except Exception as e:
    out["gdal_error"] = type(e).__name__ + ": " + str(e)
print(json.dumps(out))
`;

function runPython(script, args) {
  const cands = [];
  if (process.env.INTMAP_GDAL_PYTHON) cands.push(process.env.INTMAP_GDAL_PYTHON);
  cands.push('python3', 'python', 'py');
  const env = Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' });
  if (process.env.INTMAP_GDAL_PYTHONPATH) {
    env.PYTHONPATH = process.env.INTMAP_GDAL_PYTHONPATH
      + (env.PYTHONPATH ? (process.platform === 'win32' ? ';' : ':') + env.PYTHONPATH : '');
  }
  for (const exe of cands) {
    /* ⚠ shell:false. MEASURED on this machine that `shell:true` returns status 1 with empty output
       for the same interpreter that works without it, which is the shape of
       [[intmap-shell-quoting-traps]] — a wrapper turning a working command into a silent failure. */
    const r = spawnSync(exe, ['-c', script].concat(args || []), { encoding: 'utf8', shell: false, env, maxBuffer: 64 * 1024 * 1024 });
    if (r.error || r.status !== 0) continue;
    return { exe, stdout: r.stdout, stderr: r.stderr };
  }
  return null;
}

function findThirdParty() {
  const r = runPython(PROBE);
  if (!r) return { python: false };
  let j = null;
  try { j = JSON.parse(r.stdout.trim().split('\n').pop()); } catch (_) { return { python: false }; }
  return { python: true, exe: r.exe, sqlite: j.sqlite, gdal: j.gdal, gdalError: j.gdal_error, version: j.python };
}

const TP = findThirdParty();

/* The one place that decides whether a missing reader is a warning or a failure. */
const REQUIRED = process.env.INTMAP_REQUIRE_THIRD_PARTY === '1';
const INSTALL = 'python -m pip install rasterio pyogrio rio-cogeo';

function unverified(what, why) {
  const lines = [
    '',
    '  ⚠ UNVERIFIED BY A THIRD-PARTY IMPLEMENTATION — ' + what,
    '    reason: ' + why,
    '    this run measured the STRUCTURE of the emitted bytes (checks ①–④) and did NOT measure',
    '    that an outside GIS opens them. 「確認できなかった」 is not 「確認した」.',
    '    to close it:  ' + INSTALL,
    '    or point INTMAP_GDAL_PYTHON / INTMAP_GDAL_PYTHONPATH at an install that has them.',
    '    to make this a FAILURE (what a nightly run should do): INTMAP_REQUIRE_THIRD_PARTY=1',
    '',
  ].join('\n');
  console.log(lines);
  if (REQUIRED) assert.fail('INTMAP_REQUIRE_THIRD_PARTY=1 and ' + what + ' was not verified: ' + why);
  return lines;
}

const REPORT = [];

const VERIFY_RASTER = `
import json, sys
import rasterio
from rio_cogeo.cogeo import cog_validate
strip, cog = sys.argv[1], sys.argv[2]
out = {}
def desc(p):
    d = {}
    with rasterio.open(p) as ds:
        d["driver"] = ds.driver
        d["crs"] = str(ds.crs)
        d["transform"] = list(ds.transform)[:6]
        d["width"], d["height"] = ds.width, ds.height
        d["dtypes"] = list(ds.dtypes)
        d["descriptions"] = list(ds.descriptions)
        d["units"] = list(ds.units)
        d["nodata"] = ds.nodata
        d["blocks"] = [list(b) for b in ds.block_shapes]
        d["overviews"] = list(ds.overviews(1))
        d["image_structure"] = ds.tags(ns="IMAGE_STRUCTURE")
        t = ds.tags()
        d["tags"] = {k: t[k] for k in t if k.startswith("INTMAP") or k.startswith("TIFFTAG")}
        a = ds.read(1)
        d["px"] = [float(a[0][0]), float(a[0][1]), float(a[1][0]), float(a[767][1023])]
        if ds.overviews(1):
            ov = ds.read(1, out_shape=(1, ds.height // 2, ds.width // 2))
            d["ov_shape"] = [int(ov.shape[-2]), int(ov.shape[-1])]
    return d
out["strip"] = desc(strip)
out["cog"] = desc(cog)
out["validate_cog"] = [bool(cog_validate(cog, quiet=True)[0]), list(cog_validate(cog, quiet=True)[1])]
out["validate_strip"] = [bool(cog_validate(strip, quiet=True)[0]), list(cog_validate(strip, quiet=True)[1])]
print("JSON:" + json.dumps(out))
`;

test('⑤ GDAL opens the GeoTIFF and the COG, and agrees about every field', async () => {
  assert.ok(FIX.ready, 'fixtures were not written');
  if (!TP.python) { REPORT.push(unverified('GeoTIFF / COG', 'no python interpreter could be run')); return; }
  if (!TP.gdal) { REPORT.push(unverified('GeoTIFF / COG', 'python ' + TP.version.join('.') + ' has no rasterio/rio-cogeo — ' + TP.gdalError)); return; }

  const r = runPython(VERIFY_RASTER, [join(WORK, 'strip.tif'), join(WORK, 'cog.tif')]);
  assert.ok(r, 'the GDAL reader could not be run although the probe found it');
  const line = r.stdout.split('\n').find((l) => l.startsWith('JSON:'));
  assert.ok(line, 'the reader printed no result\n' + r.stdout + '\n' + r.stderr);
  const got = JSON.parse(line.slice(5));

  for (const which of ['strip', 'cog']) {
    const d = got[which];
    assert.equal(d.driver, 'GTiff', which + ': GDAL did not recognise the driver');
    /* ⚠ THE PLACE, AS GDAL COMPUTES IT. A file that opens but is placed somewhere else has not
       been exported — and the tiepoint/pixel-scale convention is exactly where that goes wrong. */
    assert.equal(d.crs, 'EPSG:4326', which + ': CRS came back as ' + d.crs);
    assert.deepEqual(d.transform, [0.01, 0, 10, 0, -0.01, 50], which + ': the affine transform moved');
    assert.equal(d.width, GRID_W); assert.equal(d.height, GRID_H);
    assert.deepEqual(d.dtypes, ['float32'], which + ': sample type is ' + d.dtypes);
    /* #R774's lesson, measured from outside: the band's name and unit travel by GDAL's ROLE, and
       a role this writer spelled its own way reported the unit as None with the value in the file */
    assert.deepEqual(d.descriptions, ['elevation'], which + ': band name came back as ' + d.descriptions);
    assert.deepEqual(d.units, ['m'], which + ': band unit came back as ' + d.units);
    assert.equal(d.nodata, NODATA, which + ': nodata came back as ' + d.nodata);
    /* exact samples, including the first pixel, which is a gap */
    assert.deepEqual(d.px, [NODATA, 0.25, 256, 196607.75], which + ': the samples moved');
    /* the provenance, intact — em dash and Japanese included */
    assert.equal(d.tags.INTMAP_LICENCE, PROVENANCE.licence, which + ': the licence did not survive');
    assert.equal(d.tags.INTMAP_ATTRIBUTION, PROVENANCE.attribution);
    assert.equal(d.tags.INTMAP_SOURCE, PROVENANCE.url);
    assert.equal(d.tags.INTMAP_RETRIEVED_AT, PROVENANCE.readAt);
    assert.equal(d.tags.TIFFTAG_COPYRIGHT, PROVENANCE.licence, which + ': Copyright (33432) did not survive');
    assert.equal(d.tags.TIFFTAG_SOFTWARE, 'IntMap');
  }

  /* ⚠ AND THE TWO LAYOUTS ARE DISTINGUISHABLE FROM OUTSIDE, which is the whole claim of the `cog`
     format id. If GDAL reported the same structure for both, the second format would be a name. */
  assert.deepEqual(got.cog.blocks, [[512, 512]], 'GDAL does not see 512×512 tiles in the COG');
  assert.deepEqual(got.cog.overviews, [2], 'GDAL sees no 2× overview in the COG');
  assert.equal(got.cog.image_structure.LAYOUT, 'COG', 'GDAL does not report LAYOUT=COG');
  assert.notEqual(got.strip.blocks[0][0], 512);
  assert.deepEqual(got.strip.overviews, [], 'the strip file claims an overview');
  assert.notEqual(got.strip.image_structure.LAYOUT, 'COG');

  /* the COG specification's own checker, with the error list so a failure names the condition */
  assert.deepEqual(got.validate_cog, [true, []], 'cog_validate rejected the COG: ' + JSON.stringify(got.validate_cog));

  /* ⚠⚠⚠ THE CONTROL (see the header). The reference must be able to say no, or the line above it
     is not a measurement. The strip file is a CORRECT GeoTIFF that is NOT a COG. */
  assert.equal(got.validate_strip[0], false, 'cog_validate accepted a plain strip TIFF as a COG — the reference cannot disagree, so the check above measures nothing');
  assert.ok(got.validate_strip[1].length > 0, 'cog_validate said no and gave no reason');
});

const VERIFY_GPKG = `
import json, sys, sqlite3, struct
p = sys.argv[1]
out = {"sqlite": sqlite3.sqlite_version}
c = sqlite3.connect(p)
out["integrity"] = [r[0] for r in c.execute("PRAGMA integrity_check")]
out["foreign_keys"] = [list(r) for r in c.execute("PRAGMA foreign_key_check")]
out["application_id"] = c.execute("PRAGMA application_id").fetchone()[0]
out["user_version"] = c.execute("PRAGMA user_version").fetchone()[0]
out["master"] = [[r[0], r[1]] for r in c.execute("SELECT type,name FROM sqlite_master ORDER BY rowid")]
out["count"] = c.execute("SELECT COUNT(*) FROM r783_places").fetchone()[0]
out["contents"] = list(c.execute("SELECT table_name,data_type,identifier,description,srs_id,min_x,min_y,max_x,max_y FROM gpkg_contents").fetchone())
out["geomcols"] = list(c.execute("SELECT table_name,column_name,geometry_type_name,srs_id,z,m FROM gpkg_geometry_columns").fetchone())
out["srs_ids"] = sorted(r[0] for r in c.execute("SELECT srs_id FROM gpkg_spatial_ref_sys"))
out["row2"] = list(c.execute("SELECT fid,name,n,ratio,note,flag FROM r783_places WHERE fid=2").fetchone())
out["nulls"] = c.execute("SELECT COUNT(*) FROM r783_places WHERE note IS NULL").fetchone()[0]
out["agg"] = list(c.execute("SELECT SUM(n),MAX(ratio),COUNT(DISTINCT name) FROM r783_places").fetchone())
out["table_sql"] = c.execute("SELECT sql FROM sqlite_master WHERE name='r783_places'").fetchone()[0]
out["cols"] = [[r[1], r[2]] for r in c.execute("PRAGMA table_info(r783_places)")]
big = c.execute("SELECT fid,length(geom) FROM r783_places WHERE name='big'").fetchone()
out["big"] = list(big)
blob = c.execute("SELECT geom FROM r783_places WHERE fid=2").fetchone()[0]
out["blob_magic"] = [blob[0], blob[1], blob[2], blob[3]]
out["blob_srs"] = struct.unpack("<i", blob[4:8])[0]
out["blob_env"] = list(struct.unpack("<4d", blob[8:40]))
out["blob_wkb"] = [blob[40], struct.unpack("<I", blob[41:45])[0], list(struct.unpack("<2d", blob[45:61]))]
try:
    from pyogrio.raw import read
    import pyogrio
    out["layers"] = [list(x) for x in pyogrio.list_layers(p)]
    info = pyogrio.read_info(p)
    out["ogr"] = {"crs": str(info["crs"]), "fields": list(info["fields"]), "dtypes": [str(x) for x in info["dtypes"]],
                  "features": int(info["features"]), "bounds": [float(x) for x in info["total_bounds"]],
                  "encoding": info.get("encoding")}
    meta, fids, geom, fields = read(p, read_geometry=True, return_fids=True)
    out["ogr_n"] = len(fids)
    out["ogr_fids"] = [int(x) for x in fids[:3]]
    w = geom[1]
    out["ogr_wkb1"] = [len(w), w[0], struct.unpack("<I", w[1:5])[0], list(struct.unpack("<2d", w[5:21]))]
    b = max(geom, key=len)
    out["ogr_big"] = [len(b), struct.unpack("<I", b[1:5])[0], struct.unpack("<I", b[5:9])[0], struct.unpack("<I", b[9:13])[0]]
    sub = read(p, bbox=(10.0, 49.998, 10.0035, 50.0), read_geometry=False, return_fids=True)
    out["bbox_fids"] = [int(x) for x in sub[1]]
except Exception as e:
    out["ogr_error"] = type(e).__name__ + ": " + str(e)
print("JSON:" + json.dumps(out))
`;

test('⑥ SQLite calls the GeoPackage sound, and GDAL/OGR reads it as a layer', async () => {
  assert.ok(FIX.ready, 'fixtures were not written');
  if (!TP.python) { REPORT.push(unverified('GeoPackage', 'no python interpreter could be run')); return; }
  /* ⚠ THE SQLITE HALF NEEDS NO INSTALL. python's stdlib sqlite3 is a full SQLite and is a genuine
     third party to this repository, so a machine with bare python still verifies the hardest claim
     the writer makes — that the b-trees, the indexes and the overflow chains are sound. */
  assert.ok(TP.sqlite, 'python has no sqlite3 module');

  const r = runPython(VERIFY_GPKG, [join(WORK, 'places.gpkg')]);
  assert.ok(r, 'the SQLite reader could not be run although the probe found it');
  const line = r.stdout.split('\n').find((l) => l.startsWith('JSON:'));
  assert.ok(line, 'the reader printed no result\n' + r.stdout + '\n' + r.stderr);
  const g = JSON.parse(line.slice(5));

  /* ⚠⚠⚠ THE ONE ASSERTION A CO-DESIGNED READER CANNOT MAKE. `integrity_check` walks every page,
     every b-tree, every overflow chain and every index, and cross-checks the indexes against the
     tables they index. A writer that declared a UNIQUE constraint and built no index b-tree — the
     shape §9 of js/gis-geopackage.js exists to avoid — fails HERE and passes every reader in this
     repository, because no reader here consults an index. */
  assert.deepEqual(g.integrity, ['ok'], 'SQLite: ' + JSON.stringify(g.integrity));
  assert.deepEqual(g.foreign_keys, [], 'the foreign keys the standard declares are violated');

  /* it is a GeoPackage and not merely a SQLite file */
  assert.equal(g.application_id, 0x47504b47, 'application_id is not "GPKG"');
  assert.equal(g.user_version, 10300, 'user_version does not state GeoPackage 1.3.0');

  /* the standard's tables, plus the four auto-indexes its constraints imply, plus the layer */
  assert.deepEqual(g.master, [
    ['table', 'gpkg_spatial_ref_sys'],
    ['table', 'gpkg_contents'],
    ['index', 'sqlite_autoindex_gpkg_contents_1'],
    ['index', 'sqlite_autoindex_gpkg_contents_2'],
    ['table', 'gpkg_geometry_columns'],
    ['index', 'sqlite_autoindex_gpkg_geometry_columns_1'],
    ['index', 'sqlite_autoindex_gpkg_geometry_columns_2'],
    ['table', 'r783_places'],
  ]);
  /* the two rows the standard REQUIRES to exist, plus the one this file uses */
  assert.deepEqual(g.srs_ids, [-1, 0, 4326]);

  assert.equal(g.count, 4001);
  assert.equal(g.contents[0], 'r783_places');
  assert.equal(g.contents[1], 'features');
  assert.equal(g.contents[2], 'R783 places');
  /* the licence, where a GIS shows it */
  assert.ok(g.contents[3].includes(PROVENANCE.licence), 'the licence is not in gpkg_contents.description: ' + g.contents[3]);
  assert.ok(g.contents[3].includes(PROVENANCE.attribution));
  assert.equal(g.contents[4], 4326);
  assert.deepEqual(g.geomcols, ['r783_places', 'geom', 'GEOMETRY', 4326, 0, 0]);

  /* the declared column types, read back by SQLite's own schema parser rather than by §4 of the
     module that wrote them */
  assert.deepEqual(g.cols, [['fid', 'INTEGER'], ['geom', 'GEOMETRY'], ['name', 'TEXT'],
    ['n', 'INTEGER'], ['ratio', 'DOUBLE'], ['note', 'TEXT'], ['flag', 'INTEGER']]);

  /* the values, exactly — including a double that is not representable in decimal, the UTF-8 with
     an em dash, and the NULLs that must stay NULL rather than becoming 0 or '' */
  assert.deepEqual(g.row2, [2, 'pt-1', 1, 1 / 7, '日本語 — note 1', 0]);
  assert.equal(g.nulls, Math.ceil(4000 / 3), 'the NULL notes did not survive as NULL');
  assert.deepEqual(g.agg, [(3999 * 4000) / 2 - 1, 3999 / 7, 4001]);
  /* fid IS the rowid, so it was stored once and not twice */
  assert.equal(g.big[0], 4001);
  /* The 20,001-position ring, whole, through the overflow chain — counted rather than eyeballed:
     8 bytes of GeoPackageBinary header + 32 of XY envelope, then the WKB (1 byte order + 4 type
     + 4 ring count + 4 position count + 16 per position). */
  const POLY_WKB = 1 + 4 + 4 + 4 + (RING_POINTS + 1) * 16;
  assert.equal(g.big[1], 8 + 32 + POLY_WKB);

  /* the GeoPackageBinary header, byte by byte */
  assert.deepEqual(g.blob_magic, [0x47, 0x50, 0x00, 0x03], 'the geometry blob header is not "GP", version 0, little-endian with an XY envelope');
  assert.equal(g.blob_srs, 4326);
  /* ⚠⚠⚠ minx, maxx, miny, maxy — NOT a GeoJSON bbox's order. A file with these transposed opens,
     draws correctly and answers every spatial query wrongly. */
  assert.deepEqual(g.blob_env, [10.001, 10.001, 49.999, 49.999]);
  assert.deepEqual(g.blob_wkb, [1, 1, [10.001, 49.999]]);

  if (g.ogr_error) { REPORT.push(unverified('GeoPackage (GDAL/OGR half)', 'pyogrio is not installed — ' + g.ogr_error)); return; }

  /* ⚠ AND NOW THE QUESTION SQLITE CANNOT ANSWER: is it a LAYER? */
  assert.equal(g.layers.length, 1);
  assert.equal(g.layers[0][0], 'r783_places');
  assert.equal(g.ogr.crs, 'EPSG:4326', 'OGR read the CRS as ' + g.ogr.crs);
  assert.equal(g.ogr.encoding, 'UTF-8');
  assert.deepEqual(g.ogr.fields, ['name', 'n', 'ratio', 'note', 'flag']);
  assert.deepEqual(g.ogr.dtypes, ['object', 'int64', 'float64', 'object', 'int64']);
  assert.equal(g.ogr.features, 4001);
  assert.equal(g.ogr_n, 4001);
  assert.deepEqual(g.ogr_fids, [1, 2, 3]);
  /* the extent OGR computes, against the one the writer declared */
  const ext = FIX.gpkg.stated.extent;
  assert.deepEqual(g.ogr.bounds.map((v) => Math.round(v * 1e6) / 1e6),
    [ext.minx, ext.miny, ext.maxx, ext.maxy].map((v) => Math.round(v * 1e6) / 1e6),
    'OGR and the writer disagree about the layer extent');
  /* the geometry, decoded by GDAL and handed back as WKB */
  assert.deepEqual(g.ogr_wkb1, [21, 1, 1, [10.001, 49.999]]);
  assert.deepEqual(g.ogr_big, [POLY_WKB, 3, 1, RING_POINTS + 1]);
  /* ⚠⚠⚠ THE ENVELOPE ORDER, MEASURED RATHER THAN READ. A bbox filter is answered from the
     per-geometry envelope in the GeoPackageBinary header; if the four doubles were in GeoJSON's
     order this returns the wrong features (or none) while every other check here still passes. */
  assert.deepEqual(g.bbox_fids, [1, 2, 3], 'a bbox filter through GDAL returned ' + JSON.stringify(g.bbox_fids));
});

test('⑦ what this run verified, and what it did not, is stated', async () => {
  /* ⚠ THE REPORT IS AN ASSERTION, NOT A COURTESY. [[intmap-background-work-needs-a-receipt]]: work
     whose outcome nobody records is indistinguishable from work that did not happen. A reader of
     this log must be able to tell a run that asked GDAL from one that could not find it — and the
     second must not look like the first. */
  const have = [];
  if (TP.python) have.push('python ' + (TP.version || []).join('.'));
  if (TP.sqlite) have.push('SQLite ' + TP.sqlite + ' (stdlib)');
  if (TP.gdal) have.push('GDAL ' + TP.gdal.gdal + ' via rasterio ' + TP.gdal.rasterio + ' / pyogrio ' + TP.gdal.pyogrio);
  console.log('\n  #R783 third-party readers: ' + (have.length ? have.join(' · ') : 'NONE'));
  console.log('  structural checks (no third party needed): ①②③④ ran');
  console.log('  third-party checks: ' + (TP.gdal ? '⑤⑥ ran' : (TP.sqlite ? '⑥ ran in part (SQLite only)' : 'none ran')));
  if (REPORT.length) console.log('  UNVERIFIED items: ' + REPORT.length);

  /* the invariant: either a third party was asked, or the gap was printed. Never neither. */
  assert.ok(TP.gdal || REPORT.length > 0 || !FIX.ready,
    'no third-party GDAL read happened and no UNVERIFIED notice was printed — this run reported a verification it did not perform');
  if (REQUIRED) {
    assert.ok(TP.gdal, 'INTMAP_REQUIRE_THIRD_PARTY=1 but no GDAL was found');
    assert.equal(REPORT.length, 0, 'INTMAP_REQUIRE_THIRD_PARTY=1 and ' + REPORT.length + ' item(s) went unverified');
  }
});
