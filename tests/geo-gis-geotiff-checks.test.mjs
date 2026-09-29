/* ============================================================================
 *  GIS · READING GeoTIFF — 画素・圧縮・予測子・BigTIFF・拒否
 * ----------------------------------------------------------------------------
 *  js/gis-geotiff.js reads what other programs write: byte orders, strips and tiles, every compression
 *  and predictor, BigTIFF, separate planes, nodata, the affine and the CRS — against fixtures this file
 *  builds itself, byte by byte.
 *
 *  ⚠ ONE BLOCK PER ROUND, AND EACH BLOCK IS ISOLATED. The rounds below used to be files of their own,
 *  each in its own process; `isolate()` (tests/helpers/geo-shared.mjs) gives every block back the
 *  globalThis a fresh process had, so no block reads a `window` another one left behind. Test titles
 *  carry the round that wrote them (#R<N>), and each block keeps that round's own account of WHY.
 * ==========================================================================*/

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';
import { makeGisGeotiff } from '../js/gis-geotiff.js';
import { ROOT, isolate } from './helpers/geo-shared.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R749 · the GeoTIFF reader   (was tests/r749-gis-geotiff-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R749 · GeoTIFF / COG を読む入口 — 自分で書いた TIFF を、自分で読み返す
 * ----------------------------------------------------------------------------
 *  What this round claimed, and therefore what has to stay true:
 *
 *    ① the same pixels written II and MM come back as the same array
 *    ② strips and tiles of the same image come back as the same array
 *    ③ none / LZW / Deflate / PackBits come back as the same array
 *    ④ predictor 2 is actually undone — the file's stored bytes are NOT the values
 *    ⑤ a GDAL_NODATA pixel comes back as NaN. ⚠ NOT 0 (docs/GIS-CORE.md §1.4)
 *    ⑥ a TIFF that states no georeference is refused as `no-georeference`
 *    ⑦ a BigTIFF is READ (#R756); only a variant offset width is refused, and by name
 *    ⑧ `refusals()` and the codes the source actually answers with are ONE set
 *    ⑨ the pixels are not expanded until read() is called
 *    ⑩ the affine and the CRS are what the file's own tags say, rotation included
 *
 *  ⚠ THE FIXTURES ARE BUILT HERE, BYTE BY BYTE, AND NOTHING IN js/gis-geotiff.js HELPS BUILD THEM.
 *  A test whose expected values come out of the module under test measures that the module agrees
 *  with itself — the reference has to sit outside the thing measured (the same rule
 *  tests/geo-gis-geometry-checks.test.mjs (#R743) states about its clipper). So this file holds a
 *  small TIFF WRITER: the header, the IFD, the strip and tile tables, an LZW encoder, a PackBits
 *  encoder, horizontal differencing, and node:zlib for Deflate — written from TIFF 6.0 and the
 *  GeoTIFF standard, not from the reader. The pixels are chosen here and compared here.
 *
 *  ⚠ THE LZW ENCODER'S CODE WIDTH IS A DIFFERENT NUMBER FROM THE DECODER'S, ON PURPOSE. A decoder's
 *  table lags the encoder's by exactly one entry (that lag is why the KwKwK case exists), so the two
 *  sides reach a given code index with table lengths one apart. The decoder widens at 2^w − 1 (the
 *  common reading of TIFF 6.0's "early change"); the encoder therefore has to widen at 2^w for the
 *  SAME code to be read at the width it was written. ③ runs 64×64 so the stream crosses 512 and the
 *  agreement is measured rather than assumed.
 * ==========================================================================*/
describe('§ #R749 · the GeoTIFF reader', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  const SOURCE = readFileSync(join(ROOT, 'js/gis-geotiff.js'), 'utf8');

  const GT = makeGisGeotiff();

  /* ══ THE WRITER ═══════════════════════════════════════════════════════════════════════════════ */

  const TSIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 11: 4, 12: 8 };

  function putField(dv, at, type, v, le) {
    if (type === 1 || type === 2) dv.setUint8(at, v);
    else if (type === 3) dv.setUint16(at, v, le);
    else if (type === 4) dv.setUint32(at, v, le);
    else if (type === 11) dv.setFloat32(at, v, le);
    else if (type === 12) dv.setFloat64(at, v, le);
    else throw new Error('writer: unknown field type ' + type);
  }

  function putSample(dv, at, v, bits, fmt, le) {
    if (fmt === 3) return bits === 32 ? dv.setFloat32(at, v, le) : dv.setFloat64(at, v, le);
    if (fmt === 2) {
      if (bits === 8) return dv.setInt8(at, v);
      if (bits === 16) return dv.setInt16(at, v, le);
      if (bits === 32) return dv.setInt32(at, v, le);
      return dv.setBigInt64(at, BigInt(v), le);
    }
    if (bits === 8) return dv.setUint8(at, v);
    if (bits === 16) return dv.setUint16(at, v, le);
    if (bits === 32) return dv.setUint32(at, v, le);
    return dv.setBigUint64(at, BigInt(v), le);
  }

  /* Horizontal differencing, written the way TIFF 6.0 §14 defines it: right to left, stride = samples
     per pixel, wrap in the sample's own width. */
  function differenceRows(raw, dv, le, bits, spp, rows, chunkWidth) {
    const bytes = bits >> 3;
    const rowSamples = chunkWidth * spp;
    for (let r = 0; r < rows; r++) {
      const base = r * rowSamples * bytes;
      for (let i = rowSamples - 1; i >= spp; i--) {
        const o = base + i * bytes, q = base + (i - spp) * bytes;
        if (bits === 8) raw[o] = (raw[o] - raw[q]) & 0xff;
        else if (bits === 16) dv.setUint16(o, (dv.getUint16(o, le) - dv.getUint16(q, le)) & 0xffff, le);
        else dv.setUint32(o, (dv.getUint32(o, le) - dv.getUint32(q, le)) >>> 0, le);
      }
    }
  }

  /* PackBits, TIFF 6.0 §9: runs of three or more become a repeat packet, everything else a literal. */
  function packBits(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
      let run = 1;
      while (i + run < src.length && src[i + run] === src[i] && run < 128) run++;
      if (run >= 3) {
        out.push(256 - (run - 1), src[i]);
        i += run;
        continue;
      }
      let lit = 0;
      while (i + lit < src.length && lit < 128) {
        if (lit + 2 < 128 && i + lit + 2 < src.length && src[i + lit] === src[i + lit + 1] && src[i + lit] === src[i + lit + 2]) break;
        lit++;
      }
      out.push(lit - 1);
      for (let k = 0; k < lit; k++) out.push(src[i + k]);
      i += lit;
    }
    return Uint8Array.from(out);
  }

  /* TIFF LZW. See the header comment for why the width test is 1<<width here and (1<<width)−1 in the
     decoder. */
  function lzwEncode(src) {
    const out = [];
    let acc = 0, nb = 0;
    const emit = (code, width) => {
      acc = (acc * (1 << width)) + code;
      nb += width;
      while (nb >= 8) { out.push((Math.floor(acc / (1 << (nb - 8)))) & 0xff); nb -= 8; acc = acc % (1 << nb || 1); }
    };
    let dict = new Map(), dictLen = 258, width = 9;
    const codeOf = (s) => (s.length === 1 ? s.charCodeAt(0) : dict.get(s));
    emit(256, width);
    let omega = '';
    for (let i = 0; i < src.length; i++) {
      const ch = String.fromCharCode(src[i]);
      if (omega === '') { omega = ch; continue; }
      const cand = omega + ch;
      if (dict.has(cand)) { omega = cand; continue; }
      emit(codeOf(omega), width);
      if (dictLen < 4093) {
        dict.set(cand, dictLen++);
        if (dictLen === (1 << width) && width < 12) width++;
      } else {
        emit(256, width);
        dict = new Map(); dictLen = 258; width = 9;
      }
      omega = ch;
    }
    if (omega !== '') emit(codeOf(omega), width);
    emit(257, width);
    if (nb > 0) out.push((acc << (8 - nb)) & 0xff);
    return Uint8Array.from(out);
  }

  const DEFAULT_TIEPOINT = [0, 0, 0, 135.5, 35.75, 0];
  const DEFAULT_SCALE = [0.5, 0.25, 0];

  /* One TIFF, from the options up. `pixels` is one array per band, row-major, length width*height. */
  function buildTiff(o) {
    const le = o.le !== false;
    const w = o.width, h = o.height, spp = o.spp || 1;
    const bits = o.bits || 16, fmt = o.fmt || 1, bytesPer = bits >> 3;
    const comp = o.compression == null ? 1 : o.compression;
    const predictor = o.predictor || 1;
    const tile = o.tile || null;
    const rps = tile ? 0 : (o.rowsPerStrip || h);
    const across = tile ? Math.ceil(w / tile.w) : 1;
    const down = tile ? Math.ceil(h / tile.h) : Math.ceil(h / rps);

    const chunks = [];
    for (let ci = 0; ci < across * down; ci++) {
      const cx = tile ? (ci % across) * tile.w : 0;
      const cy = tile ? Math.floor(ci / across) * tile.h : ci * rps;
      const cw = tile ? tile.w : w;
      const rows = tile ? tile.h : Math.min(rps, h - cy);
      const raw = new Uint8Array(cw * rows * spp * bytesPer);
      const rdv = new DataView(raw.buffer);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cw; c++) {
          for (let s = 0; s < spp; s++) {
            const x = cx + c, y = cy + r;
            const v = (x < w && y < h) ? o.pixels[s][y * w + x] : 0;
            putSample(rdv, ((r * cw + c) * spp + s) * bytesPer, v, bits, fmt, le);
          }
        }
      }
      if (predictor === 2) differenceRows(raw, rdv, le, bits, spp, rows, cw);
      if (o.corruptChunks && o.corruptChunks[ci]) chunks.push(o.corruptChunks[ci]);
      else if (comp === 1) chunks.push(raw);
      else if (comp === 5) chunks.push(lzwEncode(raw));
      else if (comp === 8 || comp === 32946) chunks.push(new Uint8Array(zlib.deflateSync(Buffer.from(raw))));
      else if (comp === 32773) chunks.push(packBits(raw));
      else throw new Error('writer: no encoder for compression ' + comp);
    }

    const offs = new Array(chunks.length).fill(0);
    const counts = chunks.map((c) => c.length);

    const entries = [];
    const E = (tag, type, values) => entries.push({ tag: tag, type: type, values: values });
    E(256, 3, [w]); E(257, 3, [h]);
    E(258, 3, new Array(spp).fill(bits));
    E(259, 3, [comp]); E(262, 3, [1]); E(277, 3, [spp]); E(284, 3, [1]);
    E(317, 3, [predictor]);
    E(339, 3, new Array(spp).fill(fmt));
    if (tile) { E(322, 3, [tile.w]); E(323, 3, [tile.h]); E(324, 4, offs); E(325, 4, counts); }
    else { E(273, 4, offs); E(278, 4, [rps]); E(279, 4, counts); }

    const geo = o.geo === undefined ? {} : o.geo;
    if (geo) {
      if (geo.transform) E(34264, 12, geo.transform);
      else {
        E(33550, 12, geo.pixelScale || DEFAULT_SCALE);
        E(33922, 12, geo.tiepoint || DEFAULT_TIEPOINT);
      }
      let keys = geo.keys === undefined
        ? [1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326]
        : (geo.keys || []);
      if (geo.citation) {
        /* GeoTIFF §B: an ASCII-valued key points into tag 34737 by offset and length, and the value
           is terminated with '|' rather than NUL so that several keys can share the blob. */
        const blob = geo.citation + '|';
        keys = keys.concat([2049, 34737, blob.length, 0]);
        E(34737, 2, Array.from(blob, (ch) => ch.charCodeAt(0)).concat([0]));
      }
      if (keys.length) E(34735, 3, [1, 1, 0, keys.length / 4].concat(keys));
    }
    if (o.nodata !== undefined) {
      E(42113, 2, Array.from(String(o.nodata), (ch) => ch.charCodeAt(0)).concat([0]));
    }
    if (o.gdalMetadata) {
      E(42112, 2, Array.from(o.gdalMetadata, (ch) => ch.charCodeAt(0)).concat([0]));
    }

    for (const [tag, values] of Object.entries(o.tagOverrides || {})) {
      const e = entries.find((x) => x.tag === Number(tag));
      if (e) e.values = values;
    }
    for (const tag of (o.dropTags || [])) {
      const i = entries.findIndex((x) => x.tag === tag);
      if (i >= 0) entries.splice(i, 1);
    }

    entries.sort((a, b) => a.tag - b.tag);
    const n = entries.length;
    const sizes = entries.map((e) => TSIZE[e.type] * e.values.length);
    const extraAt = [];
    let p = 8 + 2 + 12 * n + 4;
    for (let i = 0; i < n; i++) {
      if (sizes[i] > 4) { extraAt.push(p); p += sizes[i] + (sizes[i] & 1); } else extraAt.push(-1);
    }
    let q = p + (p & 1);
    const dataAt = q;
    for (let i = 0; i < chunks.length; i++) { offs[i] = q; q += chunks[i].length + (chunks[i].length & 1); }

    const buf = new Uint8Array(q);
    const dv = new DataView(buf.buffer);
    buf[0] = le ? 0x49 : 0x4D; buf[1] = le ? 0x49 : 0x4D;
    dv.setUint16(2, 42, le);
    dv.setUint32(4, 8, le);
    dv.setUint16(8, n, le);
    for (let i = 0; i < n; i++) {
      const e = entries[i], at = 8 + 2 + i * 12;
      dv.setUint16(at, e.tag, le);
      dv.setUint16(at + 2, e.type, le);
      dv.setUint32(at + 4, e.values.length, le);
      if (sizes[i] > 4) {
        dv.setUint32(at + 8, extraAt[i], le);
        for (let k = 0; k < e.values.length; k++) putField(dv, extraAt[i] + k * TSIZE[e.type], e.type, e.values[k], le);
      } else {
        for (let k = 0; k < e.values.length; k++) putField(dv, at + 8 + k * TSIZE[e.type], e.type, e.values[k], le);
      }
    }
    dv.setUint32(8 + 2 + n * 12, 0, le);
    let at = dataAt;
    for (const c of chunks) { buf.set(c, at); at += c.length + (c.length & 1); }
    return buf;
  }

  /* ══ THE PIXELS ═══════════════════════════════════════════════════════════════════════════════ */

  /* A pattern with no symmetry in either axis, so a transposed, mirrored or off-by-one read cannot
     coincide with the right answer. */
  function pattern(w, h, f) {
    const a = new Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = f(x, y);
    return a;
  }

  const sameArray = (got, want, label) => {
    assert.equal(got.length, want.length, label + ': length');
    for (let i = 0; i < want.length; i++) {
      if (Number.isNaN(want[i])) { assert.ok(Number.isNaN(got[i]), label + ': index ' + i + ' should be NaN'); continue; }
      assert.equal(got[i], want[i], label + ': index ' + i);
    }
  };

  async function open(bytes) {
    const r = await GT.read(bytes);
    assert.equal(r.ok, true, 'open refused: ' + JSON.stringify(r.why || null) + ' ' + JSON.stringify(r.detail || null));
    return r.grid;
  }

  /* ══ ① BYTE ORDER ═════════════════════════════════════════════════════════════════════════════ */

  test('#R749 ① the same pixels written II and MM come back as the same array', async () => {
    const w = 9, h = 7;
    const px = pattern(w, h, (x, y) => 1000 + x * 37 + y * 601);
    const ii = await open(buildTiff({ le: true, width: w, height: h, pixels: [px] }));
    const mm = await open(buildTiff({ le: false, width: w, height: h, pixels: [px] }));
    sameArray(ii.read(0), px, 'II');
    sameArray(mm.read(0), px, 'MM');
    sameArray(mm.read(0), Array.from(ii.read(0)), 'II vs MM');
    /* and the endianness did not leak into what the file SAYS it is */
    assert.equal(ii.crs, 'EPSG:4326');
    assert.equal(mm.crs, 'EPSG:4326');
    assert.equal(mm.affine.dx, ii.affine.dx);
  });

  /* ══ ② STRIP AND TILE ═════════════════════════════════════════════════════════════════════════ */

  test('#R749 ② strips and tiles of the same image come back as the same array', async () => {
    const w = 10, h = 6;
    const px = pattern(w, h, (x, y) => 5 + x * 3 + y * 100);
    const strip1 = await open(buildTiff({ width: w, height: h, pixels: [px] }));
    const strip2 = await open(buildTiff({ width: w, height: h, pixels: [px], rowsPerStrip: 2 }));
    /* ⚠ 8×8 tiles over a 10×6 image PAD in both axes — the padding must not reach the array, and the
       rows that are there must not shift. */
    const tiled = await open(buildTiff({ width: w, height: h, pixels: [px], tile: { w: 8, h: 8 } }));
    assert.equal(strip1.layout, 'strip');
    assert.equal(tiled.layout, 'tile');
    assert.equal(tiled.chunks, 2);
    sameArray(strip1.read(0), px, 'one strip');
    sameArray(strip2.read(0), px, 'three strips');
    sameArray(tiled.read(0), px, 'tiles');
  });

  /* ══ ③ THE FOUR COMPRESSIONS ══════════════════════════════════════════════════════════════════ */

  test('#R749 ③ none / LZW / Deflate / PackBits decode to the same array', async () => {
    /* 64×64 so the LZW stream crosses the 512-entry width change, and a pattern with real runs in it
       so PackBits actually emits repeat packets. */
    const w = 64, h = 64;
    const px = pattern(w, h, (x, y) => (x < 20 ? 7 : (x * 13 + y * 29) % 4001));
    const plain = await open(buildTiff({ width: w, height: h, pixels: [px] }));
    sameArray(plain.read(0), px, 'none');
    for (const [code, name] of [[5, 'lzw'], [8, 'deflate'], [32946, 'deflate-old'], [32773, 'packbits']]) {
      const g = await open(buildTiff({ width: w, height: h, pixels: [px], compression: code }));
      assert.equal(g.compression, name, 'compression name for ' + code);
      sameArray(g.read(0), px, name);
      /* read() twice must answer twice — the Deflate path keeps its inflated bytes, and undoing a
         predictor in place would make the second answer different from the first. */
      sameArray(g.read(0), px, name + ' (second read)');
    }
  });

  test('#R749 ③b LZW and PackBits also survive tiling, where the row width is the padded tile', async () => {
    const w = 13, h = 9;
    const px = pattern(w, h, (x, y) => (x === y ? 9999 : x * 8 + y));
    for (const code of [5, 32773, 8]) {
      const g = await open(buildTiff({ width: w, height: h, pixels: [px], compression: code, tile: { w: 8, h: 4 } }));
      sameArray(g.read(0), px, 'tiled compression ' + code);
    }
  });

  /* ══ ④ PREDICTOR ══════════════════════════════════════════════════════════════════════════════ */

  test('#R749 ④ predictor 2 is undone — and the stored bytes are not the values', async () => {
    const w = 8, h = 4;
    const px = pattern(w, h, (x, y) => 100 + x * 250 + y * 7);
    const g = await open(buildTiff({ width: w, height: h, pixels: [px], predictor: 2 }));
    assert.equal(g.predictor, 2);
    sameArray(g.read(0), px, 'predictor 2');

    /* What a reader that ignored the predictor would have produced, derived here from the same
       definition the writer used. If the two agreed, ④ would be measuring nothing. */
    const ignored = px.slice();
    for (let y = 0; y < h; y++) for (let x = w - 1; x >= 1; x--) ignored[y * w + x] = (px[y * w + x] - px[y * w + x - 1]) & 0xffff;
    let differs = 0;
    const got = g.read(0);
    for (let i = 0; i < px.length; i++) if (got[i] !== ignored[i]) differs++;
    assert.ok(differs > 20, 'the fixture must distinguish the two readings (differs=' + differs + ')');

    /* Two bands: the stride of the differencing is one PIXEL, not one sample. */
    const b0 = pattern(w, h, (x, y) => 1 + x * 3 + y);
    const b1 = pattern(w, h, (x, y) => 60000 - x * 11 - y * 2);
    const two = await open(buildTiff({ width: w, height: h, spp: 2, pixels: [b0, b1], predictor: 2, compression: 5 }));
    assert.equal(two.bands.length, 2);
    sameArray(two.read(0), b0, 'band 0');
    sameArray(two.read(1), b1, 'band 1');
  });

  /* ══ ⑤ NODATA ════════════════════════════════════════════════════════════════════════════════ */

  test('#R749 ⑤ a GDAL_NODATA pixel is NaN, and it is not 0', async () => {
    const w = 5, h = 4;
    const px = pattern(w, h, (x, y) => (x === 2 ? -9999 : (x - 2) * 10 + y));   /* real 0 at x=2? no: column 2 is nodata */
    px[0] = 0;                                                                  /* ⚠ a genuine zero, next to the missing column */
    const g = await open(buildTiff({ width: w, height: h, bits: 32, fmt: 2, pixels: [px], nodata: -9999 }));
    assert.equal(g.bands[0].nodata, -9999);
    const got = g.read(0);
    for (let y = 0; y < h; y++) {
      assert.ok(Number.isNaN(got[y * w + 2]), 'nodata pixel at row ' + y + ' must be NaN, got ' + got[y * w + 2]);
    }
    assert.equal(got[0], 0, 'a real zero must stay a zero');
    assert.equal(got[1], -10);
    /* ⚠ the whole point: the missing pixels are NOT zero */
    assert.ok(!Object.is(got[2], 0), 'missing must not be filled with 0');

    /* A file that states nothing gets no nodata invented for it. */
    const none = await open(buildTiff({ width: w, height: h, bits: 32, fmt: 2, pixels: [px] }));
    assert.equal(none.bands[0].nodata, null);
    assert.equal(none.read(0)[2], -9999);

    /* A nodata field that is not a number is not a nodata value. */
    const junk = await open(buildTiff({ width: w, height: h, bits: 32, fmt: 2, pixels: [px], nodata: 'none' }));
    assert.equal(junk.bands[0].nodata, null);
  });

  /* ══ ⑥⑦⑪⑭ THE REFUSALS ═══════════════════════════════════════════════════════════════════════ */

  const refuse = async (bytes, why) => {
    const r = await GT.read(bytes);
    assert.equal(r.ok, false, 'expected a refusal (' + why + ')');
    assert.equal(r.why, why, 'refusal code; detail=' + JSON.stringify(r.detail || null));
    return r;
  };

  test('#R749 ⑥ a TIFF that states no georeference is refused by name', async () => {
    const px = pattern(4, 4, (x, y) => x + y);
    await refuse(buildTiff({ width: 4, height: 4, pixels: [px], geo: null }), 'no-georeference');
    /* half a georeference is still none: a tiepoint with no pixel scale says nothing about size */
    await refuse(buildTiff({ width: 4, height: 4, pixels: [px], dropTags: [33550] }), 'no-georeference');
  });

  test('#R749 ⑦ a BigTIFF is read; only a variant offset width is refused, and by name', async () => {
    /* ⚠ (#R756) THIS CASE USED TO ASSERT THAT ANY BigTIFF WAS REFUSED, and that defect is fixed — the
       container's own 8-byte offsets are read now (tests/r754-gis-geotiff-formats-checks measures the
       pixels against a classic TIFF holding the same ones). What survives here is the refusal that is
       still real: a header stating an offset width this reader does not implement.
       ⚠ 拒否を実装に変えた回に検査を消すだけにすると「見るのをやめた回」になる
       ([[intmap-refusal-that-becomes-implementation]]) — so the case is narrowed, not deleted. */
    for (const le of [true, false]) {
      const b = new Uint8Array(16);
      const dv = new DataView(b.buffer);
      b[0] = le ? 0x49 : 0x4D; b[1] = b[0];
      dv.setUint16(2, 43, le);
      dv.setUint16(4, 16, le);                 /* 16-byte offsets: a width nothing here implements */
      dv.setUint16(6, 0, le);
      assert.equal(GT.sniff(b), true, 'a BigTIFF is recognised as the container it is');
      const r = await refuse(b, 'bigtiff-unsupported');
      assert.equal(r.detail.byteOrder, le ? 'II' : 'MM');
      assert.equal(r.detail.offsetBytes, 16, 'the refusal does not say which width it could not take');
    }
  });

  test('#R749 ⑪ a degenerate grid is refused before anything samples it', async () => {
    const px = pattern(4, 4, (x, y) => x + y);
    await refuse(buildTiff({ width: 4, height: 4, pixels: [px], geo: { pixelScale: [0, 0, 0] } }), 'grid-degenerate');
    await refuse(buildTiff({ width: 4, height: 4, pixels: [px], geo: { pixelScale: [-0.5, 0.5, 0] } }), 'grid-degenerate');
  });

  test('#R749 ⑭ every unsupported combination is refused by its own name, with a detail that says what', async () => {
    const px = pattern(4, 4, (x, y) => x + y);
    const base = { width: 4, height: 4, pixels: [px] };

    const jpeg = await refuse(buildTiff({ ...base, tagOverrides: { 259: [7] } }), 'jpeg-in-tiff-unsupported');
    assert.equal(jpeg.detail.name, 'jpeg');

    const zstd = await refuse(buildTiff({ ...base, tagOverrides: { 259: [50000] } }), 'compression-unsupported');
    assert.deepEqual(zstd.detail, { compression: 50000, name: 'zstd' });

    const mystery = await refuse(buildTiff({ ...base, tagOverrides: { 259: [64999] } }), 'compression-unsupported');
    assert.equal(mystery.detail.name, null, 'a number nobody registered comes back as a number');

    await refuse(buildTiff({ ...base, tagOverrides: { 317: [3] } }), 'predictor-unsupported');
    await refuse(buildTiff({ ...base, bits: 64, fmt: 3, predictor: 1, tagOverrides: { 317: [2] } }), 'predictor-unsupported');
    await refuse(buildTiff({ ...base, tagOverrides: { 339: [4] } }), 'sample-format-unsupported');
    await refuse(buildTiff({ ...base, tagOverrides: { 258: [12] } }), 'bits-unsupported');
    /* (#R756) 284=2 (バンド別格納) is read now; what is still refused is a value TIFF 6.0 does not
       define. The code stays because the condition stays. */
    await refuse(buildTiff({ ...base, tagOverrides: { 284: [3] } }), 'planar-separate-unsupported');
    await refuse(buildTiff({ ...base, dropTags: [256] }), 'tiff-corrupt');
    await refuse(buildTiff({ ...base, dropTags: [273] }), 'tiff-corrupt');
    await refuse(buildTiff({ ...base, tagOverrides: { 273: [999999] } }), 'tiff-truncated');
    await refuse(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), 'not-tiff');
    await refuse(Uint8Array.from([0x49, 0x49]), 'not-tiff');

    /* and a band the file does not have is a throw from the door, not a silent empty array */
    const g = await open(buildTiff(base));
    assert.throws(() => g.read(3), (e) => e.why === 'band-out-of-range');
  });

  /* ══ ⑧ THE PUBLISHED SET IS THE ANSWERED SET ═════════════════════════════════════════════════ */

  test('#R749 ⑧ refusals() and the codes the source answers with are one set', () => {
    const declared = GT.refusals();
    assert.ok(Array.isArray(declared) && declared.length > 10);
    assert.equal(new Set(declared).size, declared.length, 'no duplicates');

    /* ⚠ COLLECTED FROM THE SOURCE, not from a list written here — a hand-kept expectation drifts from
       the implementation exactly as a hand-kept refusals() would (the defect this check exists for).
       The call sites are the only two constructors the module has. */
    const code = codeOnly(SOURCE);
    const used = new Set();
    const re = /\b(?:bad|raise)\(\s*'([a-z0-9-]+)'/g;
    let m;
    while ((m = re.exec(code))) used.add(m[1]);

    for (const code of used) assert.ok(declared.includes(code), 'answered but not declared: ' + code);
    for (const code of declared) assert.ok(used.has(code), 'declared but never answered: ' + code);

    /* ⚠ AND NOTHING BYPASSES THEM. A refusal built inline would be invisible to both sides above, so
       the shape `{ ok: false, … }` may appear exactly once IN THE CODE — inside bad() itself. The
       comments are stripped first: the header DESCRIBES the contract, and a check that counted prose
       would be measuring how the file is documented. */
    const built = code.split('\n').filter((l) => /ok:\s*false/.test(l));
    assert.ok(built.length >= 1, 'bad() builds the refusal');
    for (const line of built) {
      assert.match(line, /why:\s*why\b/, 'a refusal built outside bad() would carry its own code: ' + line.trim());
    }
  });

  /* ══ ⑨ THE DOOR ══════════════════════════════════════════════════════════════════════════════ */

  test('#R749 ⑨ the pixels are not expanded until read() is called', async () => {
    const w = 40, h = 40;
    const px = pattern(w, h, (x, y) => x * y);
    const g = await open(buildTiff({ width: w, height: h, pixels: [px] }));

    /* ⑨a structurally: the grid holds no expansion of the band anywhere a caller can reach. */
    const seen = new Set();
    const walk = (v, path, depth) => {
      if (!v || depth > 4 || typeof v !== 'object' || seen.has(v)) return;
      seen.add(v);
      if (ArrayBuffer.isView(v)) {
        assert.ok(v.length < w * h, 'grid holds a pixel-sized array before read(): ' + path);
        return;
      }
      for (const k of Object.keys(v)) walk(v[k], path + '.' + k, depth + 1);
    };
    walk(g, 'grid', 0);
    assert.ok(g.read(0) instanceof Float64Array, 'read(0) is where the expansion happens');

    /* ⑨b behaviourally, which is the measurement that cannot be satisfied by a rearrangement: a chunk
       whose bytes are corrupt INSIDE its declared range opens fine and fails at read(). An eager
       reader could not return ok:true here. 0x1FF is a 9-bit code past an empty LZW table. */
    const corrupt = buildTiff({
      width: 6, height: 4, pixels: [pattern(6, 4, (x, y) => x + y)], compression: 5,
      corruptChunks: { 0: Uint8Array.from([0xFF, 0x80, 0x00]) },
    });
    const r = await GT.read(corrupt);
    assert.equal(r.ok, true, 'the container is intact, so the open succeeds');
    assert.throws(() => r.grid.read(0), (e) => e.why === 'lzw-corrupt', 'the decode fails where the decode is');

    /* a stream that simply stops short is a different code from a stream that lies */
    const short = buildTiff({
      width: 6, height: 4, pixels: [pattern(6, 4, (x, y) => x + y)], compression: 32773,
      corruptChunks: { 0: Uint8Array.from([0x02, 1, 2, 3]) },
    });
    const rs = await GT.read(short);
    assert.equal(rs.ok, true);
    assert.throws(() => rs.grid.read(0), (e) => e.why === 'chunk-short');
  });

  /* ══ ⑩ WHAT THE FILE'S OWN TAGS SAY ══════════════════════════════════════════════════════════ */

  test('#R749 ⑩ the affine and the CRS are read from the tags, and rotation is reported not flattened', async () => {
    const px = pattern(4, 3, (x, y) => x + y);

    /* tiepoint + pixel scale: x grows east by dx, y falls south by dy, and (x0,y0) is the upper-left
       corner of pixel (0,0). Computed here from the GeoTIFF definition, not from the module. */
    const g = await open(buildTiff({
      width: 4, height: 3, pixels: [px],
      geo: { tiepoint: [2, 1, 0, 100, 60, 0], pixelScale: [0.25, 0.5, 0], citation: 'WGS 84' },
    }));
    assert.equal(g.affine.x0, 100 - 2 * 0.25);
    assert.equal(g.affine.y0, 60 + 1 * 0.5);
    assert.equal(g.affine.dx, 0.25);
    assert.equal(g.affine.dy, 0.5);
    assert.equal(g.affine.rotated, false);
    assert.equal(g.crs, 'EPSG:4326');
    assert.equal(g.crsText, 'WGS 84');
    assert.equal(g.model.rasterType, 'area');
    assert.deepEqual(g.model.pixelScale, [0.25, 0.5, 0]);

    /* a projected file states its own code, and a file that states neither states null */
    const utm = await open(buildTiff({
      width: 4, height: 3, pixels: [px],
      geo: { keys: [1024, 0, 1, 1, 3072, 0, 1, 32654] },
    }));
    assert.equal(utm.crs, 'EPSG:32654');
    const mute = await open(buildTiff({ width: 4, height: 3, pixels: [px], geo: { keys: [1024, 0, 1, 1] } }));
    assert.equal(mute.crs, null, '「述べていない」 is not 「4326 だった」');
    assert.equal(mute.crsText, null);
    /* 32767 is GeoTIFF's own 「user-defined」 — reading it as EPSG:32767 would invent a code */
    const user = await open(buildTiff({ width: 4, height: 3, pixels: [px], geo: { keys: [2048, 0, 1, 32767] } }));
    assert.equal(user.crs, null);

    /* ModelTransformation with rotation: the grid still reads, and the rotation is stated */
    const rot = await open(buildTiff({
      width: 4, height: 3, pixels: [px],
      geo: { transform: [0, 0.5, 0, 10, -0.5, 0, 0, 20, 0, 0, 0, 0, 0, 0, 0, 1] },
    }));
    assert.equal(rot.affine.rotated, true, 'a rotated model must not pretend to be axis-aligned');
    assert.equal(rot.affine.x0, 10);
    assert.equal(rot.affine.y0, 20);
    assert.equal(rot.affine.dx, 0.5);
    assert.equal(rot.affine.dy, 0.5);
    sameArray(rot.read(0), px, 'a rotated grid is still read');

    /* a north-up matrix is not rotated, and its dy comes back positive */
    const up = await open(buildTiff({
      width: 4, height: 3, pixels: [px],
      geo: { transform: [0.25, 0, 0, 5, 0, -0.5, 0, 9, 0, 0, 0, 0, 0, 0, 0, 1] },
    }));
    assert.equal(up.affine.rotated, false);
    assert.equal(up.affine.dx, 0.25);
    assert.equal(up.affine.dy, 0.5);
  });

  /* ══ ⑫ SAMPLE FORMATS ════════════════════════════════════════════════════════════════════════ */

  test('#R749 ⑫ uint / int / float come back as the numbers they are', async () => {
    const w = 6, h = 5;
    const cases = [
      { bits: 8, fmt: 1, f: (x, y) => (x * 40 + y * 7) % 256 },
      { bits: 16, fmt: 1, f: (x, y) => (x * 9000 + y * 37) % 65536 },
      { bits: 32, fmt: 1, f: (x, y) => (x * 100000 + y) % 4294967296 },
      { bits: 8, fmt: 2, f: (x, y) => x * 20 + y - 60 },
      { bits: 16, fmt: 2, f: (x, y) => x * 5000 + y - 30000 },
      { bits: 32, fmt: 2, f: (x, y) => x * 300000 + y - 2000000 },
      { bits: 32, fmt: 3, f: (x, y) => x * 0.5 - y * 0.25 },
      { bits: 64, fmt: 3, f: (x, y) => x / 7 - y / 3 },
    ];
    for (const c of cases) {
      const px = pattern(w, h, c.f);
      const g = await open(buildTiff({ width: w, height: h, bits: c.bits, fmt: c.fmt, pixels: [px], compression: 5 }));
      assert.equal(g.bands[0].bits, c.bits);
      assert.equal(g.bands[0].sampleFormat, c.fmt === 3 ? 'float' : (c.fmt === 2 ? 'int' : 'uint'));
      const got = g.read(0);
      for (let i = 0; i < px.length; i++) {
        const want = c.bits === 32 && c.fmt === 3 ? Math.fround(px[i]) : px[i];
        assert.ok(Math.abs(got[i] - want) < 1e-12, 'bits ' + c.bits + ' fmt ' + c.fmt + ' index ' + i + ': ' + got[i] + ' vs ' + want);
      }
    }
  });

  /* ══ ⑮ THE TWO THINGS THE DEFLATE PASS OWES THE CALLER ═══════════════════════════════════════ */

  test('#R749 ⑮ the inflate pass is cancellable, and a runtime without DecompressionStream is told so', async () => {
    const w = 8, h = 8;
    const px = pattern(w, h, (x, y) => x * y);
    const bytes = buildTiff({ width: w, height: h, pixels: [px], compression: 8, rowsPerStrip: 1 });

    /* ⚠ The ctx is js/gis-ops.js's, handed straight through — a caller that already has one does not
       get a second. A tick that answers false is the reader asking to stop. */
    let ticks = 0;
    const ctx = { aborted: () => ticks > 0, done: () => ticks, async tick() { ticks++; return false; } };
    const r = await GT.read(bytes, { ctx: ctx });
    assert.equal(r.ok, false);
    assert.equal(r.why, 'cancelled');
    assert.ok(ticks > 0, 'the pass that grows with the data is the pass that ticks');

    const saved = globalThis.DecompressionStream;
    try {
      delete globalThis.DecompressionStream;
      const g = await GT.read(bytes);
      assert.equal(g.ok, false);
      assert.equal(g.why, 'deflate-unavailable');
      /* ⚠ and only Deflate needs it: the other three decode here */
      const lzw = await GT.read(buildTiff({ width: w, height: h, pixels: [px], compression: 5 }));
      assert.equal(lzw.ok, true);
      sameArray(lzw.grid.read(0), px, 'lzw without DecompressionStream');
    } finally { globalThis.DecompressionStream = saved; }
  });

  /* ══ ⑬ sniff, bands, overviews ═══════════════════════════════════════════════════════════════ */

  test('#R749 ⑬ sniff answers for the four headers and for nothing else', () => {
    assert.equal(GT.sniff(Uint8Array.from([0x49, 0x49, 0x2A, 0x00])), true);
    assert.equal(GT.sniff(Uint8Array.from([0x4D, 0x4D, 0x00, 0x2A])), true);
    assert.equal(GT.sniff(Uint8Array.from([0x49, 0x49, 0x2B, 0x00])), true);
    assert.equal(GT.sniff(Uint8Array.from([0x4D, 0x4D, 0x00, 0x2B])), true);
    assert.equal(GT.sniff(Uint8Array.from([0x49, 0x49, 0x00, 0x2A])), false);
    assert.equal(GT.sniff(Uint8Array.from([0x50, 0x4B, 0x03, 0x04])), false);   /* a ZIP */
    assert.equal(GT.sniff(Uint8Array.from([0x49, 0x49])), false);
    assert.equal(GT.sniff(null), false);
  });

  test('#R749 ⑬b the bands say what the file said about them, and nothing it did not', async () => {
    const w = 4, h = 4;
    const px = pattern(w, h, (x, y) => x + y);
    const plain = await open(buildTiff({ width: w, height: h, pixels: [px] }));
    assert.deepEqual(plain.bands, [{ name: null, unit: null, nodata: null, sampleFormat: 'uint', bits: 16 }]);

    const named = await open(buildTiff({
      width: w, height: h, pixels: [px],
      gdalMetadata: '<GDALMetadata><Item name="DESCRIPTION" sample="0" role="description">precipitation</Item>'
        + '<Item name="UNITTYPE" sample="0">mm</Item></GDALMetadata>',
    }));
    assert.equal(named.bands[0].name, 'precipitation');
    assert.equal(named.bands[0].unit, 'mm');
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R756 · BigTIFF, predictor 3, separate planes   (was tests/r756-gis-geotiff-formats-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R756 · 外部の GIS が普通に書き出したファイルが開けない — BigTIFF・predictor 3・バンド別格納
 * ----------------------------------------------------------------------------
 *  ⚠ THE DEFECT THIS FILE MEASURES IS NOT 「a feature is missing」. It is that a reader who exported
 *  a raster from QGIS, GDAL, ArcGIS or a national agency's download page — with the DEFAULTS those
 *  tools ship — was told the file could not be read. Four exports that a reader has no reason to
 *  think unusual were refused by #R749's door:
 *      · anything GDAL writes past 4 GB, or with `-co BIGTIFF=YES`           → bigtiff-unsupported
 *      · `-co PREDICTOR=3`, the one GDAL documents for FLOAT rasters (DEMs)  → predictor-unsupported
 *      · `-co INTERLEAVE=BAND`, how multi-band imagery is normally stored    → planar-separate-…
 *      · `-co COMPRESS=JPEG`                                                 → jpeg-in-tiff-…
 *  The first three are read now. ⚠ THE FOURTH IS STILL REFUSED AND THAT IS ON PURPOSE — ⑥ below
 *  measures that the refusal is still reachable and js/gis-geotiff.js says in one line why it
 *  cannot be done today (.agents/rules/no-ad-hoc-hardcoding.md §6).
 *
 *  ⚠⚠⚠ A REFUSAL THAT BECOMES AN IMPLEMENTATION MUST NOT SIMPLY STOP BEING LOOKED AT
 *  ([[intmap-refusal-that-becomes-implementation]]: 「拒否を実装に変えた回に検査を消すだけにすると
 *  『見るのをやめた回』になる」). So none of the three codes is deleted. ⑥ measures BOTH halves of
 *  each: that the ordinary file no longer reaches the refusal, AND that what genuinely remains
 *  unreadable still does, by name, with a detail that says what.
 *
 *  ⚠ EVERY FIXTURE IS BUILT HERE, BYTE BY BYTE, AND NOTHING IN js/gis-geotiff.js HELPS BUILD IT.
 *  The writer below is written from TIFF 6.0, from the BigTIFF specification and from TIFF Technical
 *  Note 3 — not from the reader — because a test whose expected bytes come out of the module under
 *  test measures only that the module agrees with itself. And every claim of the form 「it reads X」
 *  is made against a REFERENCE THE SAME PIXELS WERE ALSO WRITTEN INTO in the form that already
 *  worked: BigTIFF against classic TIFF, predictor 3 against predictor 1, separate planes against
 *  chunky. Reading one file and declaring it read would measure nothing.
 * ==========================================================================*/
describe('§ #R756 · BigTIFF, predictor 3, separate planes', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  const GT = makeGisGeotiff();

  /* ══ THE WRITER ═══════════════════════════════════════════════════════════════════════════════ */

  /* TIFF 6.0's field types by the size of one value, plus BigTIFF's LONG8 (16) — which is what a
     BigTIFF's tile offsets are actually written as, and therefore what the reader has to be able to
     read rather than merely to size. */
  const TSIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 11: 4, 12: 8, 16: 8 };

  /* The two containers, as the writer's four widths. They are stated here independently of
     js/gis-geotiff.js's table for the reason in the header: two descriptions that were copied from
     each other agree about a mistake as readily as about the format. */
  const LAYOUT = {
    classic: { magic: 42, headerBytes: 8, dirCountBytes: 2, valueCountBytes: 4, offsetBytes: 8 - 4, entryBytes: 12, offType: 4 },
    big: { magic: 43, headerBytes: 16, dirCountBytes: 8, valueCountBytes: 8, offsetBytes: 8, entryBytes: 20, offType: 16 },
  };

  function putField(dv, at, type, v, le) {
    if (type === 1 || type === 2) dv.setUint8(at, v);
    else if (type === 3) dv.setUint16(at, v, le);
    else if (type === 4) dv.setUint32(at, v, le);
    else if (type === 11) dv.setFloat32(at, v, le);
    else if (type === 12) dv.setFloat64(at, v, le);
    else if (type === 16) dv.setBigUint64(at, BigInt(v), le);
    else throw new Error('writer: unknown field type ' + type);
  }

  function putUint(dv, at, v, bytes, le) {
    if (bytes === 2) dv.setUint16(at, v, le);
    else if (bytes === 4) dv.setUint32(at, v, le);
    else dv.setBigUint64(at, BigInt(v), le);
  }

  function putSample(dv, at, v, bits, fmt, le) {
    if (fmt === 3) return bits === 32 ? dv.setFloat32(at, v, le) : dv.setFloat64(at, v, le);
    if (fmt === 2) {
      if (bits === 8) return dv.setInt8(at, v);
      if (bits === 16) return dv.setInt16(at, v, le);
      if (bits === 32) return dv.setInt32(at, v, le);
      return dv.setBigInt64(at, BigInt(v), le);
    }
    if (bits === 8) return dv.setUint8(at, v);
    if (bits === 16) return dv.setUint16(at, v, le);
    if (bits === 32) return dv.setUint32(at, v, le);
    return dv.setBigUint64(at, BigInt(v), le);
  }

  /* Predictor 2, TIFF 6.0 §14: right to left, stride = the samples per pixel OF THE CHUNK (which for
     a separate plane is 1), wrap in the sample's own width. */
  function encodeHorizontal(raw, dv, le, bits, spp, rows, chunkWidth) {
    const bytes = bits >> 3;
    const rowSamples = chunkWidth * spp;
    for (let r = 0; r < rows; r++) {
      const base = r * rowSamples * bytes;
      for (let i = rowSamples - 1; i >= spp; i--) {
        const o = base + i * bytes, q = base + (i - spp) * bytes;
        if (bits === 8) raw[o] = (raw[o] - raw[q]) & 0xff;
        else if (bits === 16) dv.setUint16(o, (dv.getUint16(o, le) - dv.getUint16(q, le)) & 0xffff, le);
        else dv.setUint32(o, (dv.getUint32(o, le) - dv.getUint32(q, le)) >>> 0, le);
      }
    }
  }

  /* Predictor 3, TIFF Technical Note 3 — the FLOATING-POINT predictor, written here from the note's
     own two steps and in the note's order:
       ① split each row into byte planes, MOST SIGNIFICANT BYTE FIRST, so that the exponent bytes of
          neighbouring samples end up next to each other (which is the entire point: they barely
          change across a row, while the mantissa bytes are noise)
       ② take the difference between bytes `spp` apart along that shuffled row
     ⚠ THE SAMPLE'S BYTES ARE TAKEN IN THE FILE'S OWN ORDER, so plane 0 is the last byte of a
     little-endian sample and the first of a big-endian one. Both are written and both are read back
     in ② below; a reader that assumed the host's order would pass one and fail the other. */
  function encodeFloatPredictor(raw, le, bits, spp, rows, chunkWidth) {
    const bytes = bits >> 3;
    const rowSamples = chunkWidth * spp;
    const rowBytes = rowSamples * bytes;
    for (let r = 0; r < rows; r++) {
      const base = r * rowBytes;
      const row = raw.slice(base, base + rowBytes);
      const shuffled = new Uint8Array(rowBytes);
      for (let s = 0; s < rowSamples; s++) {
        for (let k = 0; k < bytes; k++) {
          const plane = le ? (bytes - 1 - k) : k;
          shuffled[plane * rowSamples + s] = row[s * bytes + k];
        }
      }
      for (let i = rowBytes - 1; i >= spp; i--) shuffled[i] = (shuffled[i] - shuffled[i - spp]) & 0xff;
      raw.set(shuffled, base);
    }
  }

  /* TIFF LZW (6.0 §13). The encoder widens at 2^w where the decoder widens at 2^w − 1, because the
     decoder's table lags the encoder's by one entry — the same asymmetry
     tests/geo-gis-geotiff-checks.test.mjs (#R749) documents, restated here rather than imported because this
     file's writer has to stand on its own. */
  function lzwEncode(src) {
    const out = [];
    let acc = 0, nb = 0;
    const emit = (code, width) => {
      acc = (acc * (1 << width)) + code;
      nb += width;
      while (nb >= 8) { out.push((Math.floor(acc / (1 << (nb - 8)))) & 0xff); nb -= 8; acc = acc % (1 << nb || 1); }
    };
    let dict = new Map(), dictLen = 258, width = 9;
    const codeOf = (s) => (s.length === 1 ? s.charCodeAt(0) : dict.get(s));
    emit(256, width);
    let omega = '';
    for (let i = 0; i < src.length; i++) {
      const ch = String.fromCharCode(src[i]);
      if (omega === '') { omega = ch; continue; }
      const cand = omega + ch;
      if (dict.has(cand)) { omega = cand; continue; }
      emit(codeOf(omega), width);
      if (dictLen < 4093) {
        dict.set(cand, dictLen++);
        if (dictLen === (1 << width) && width < 12) width++;
      } else {
        emit(256, width);
        dict = new Map(); dictLen = 258; width = 9;
      }
      omega = ch;
    }
    if (omega !== '') emit(codeOf(omega), width);
    emit(257, width);
    if (nb > 0) out.push((acc << (8 - nb)) & 0xff);
    return Uint8Array.from(out);
  }

  const TIEPOINT = [0, 0, 0, 135.5, 35.75, 0];
  const SCALE = [0.5, 0.25, 0];

  /* One TIFF or BigTIFF, from the options up. `pixels` is one array per band, row-major.
     `planar:2` writes each band into its own run of chunks, which is where the chunk index stops
     being a position and starts being a position AND a band. */
  function buildTiff(o) {
    const le = o.le !== false;
    const H = o.big ? LAYOUT.big : LAYOUT.classic;
    const w = o.width, h = o.height, spp = o.spp || 1;
    const bits = o.bits || 16, fmt = o.fmt || 1, bytesPer = bits >> 3;
    const comp = o.compression == null ? 1 : o.compression;
    const predictor = o.predictor || 1;
    const planar = o.planar || 1;
    const tile = o.tile || null;
    const rps = tile ? 0 : (o.rowsPerStrip || h);
    const across = tile ? Math.ceil(w / tile.w) : 1;
    const down = tile ? Math.ceil(h / tile.h) : Math.ceil(h / rps);
    const perPlane = across * down;
    const planes = planar === 2 ? spp : 1;
    const chunkSpp = planar === 2 ? 1 : spp;

    const chunks = [];
    for (let plane = 0; plane < planes; plane++) {
      for (let ci = 0; ci < perPlane; ci++) {
        const cx = tile ? (ci % across) * tile.w : 0;
        const cy = tile ? Math.floor(ci / across) * tile.h : ci * rps;
        const cw = tile ? tile.w : w;
        const rows = tile ? tile.h : Math.min(rps, h - cy);
        const raw = new Uint8Array(cw * rows * chunkSpp * bytesPer);
        const rdv = new DataView(raw.buffer);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cw; c++) {
            for (let s = 0; s < chunkSpp; s++) {
              const band = planar === 2 ? plane : s;
              const x = cx + c, y = cy + r;
              const v = (x < w && y < h) ? o.pixels[band][y * w + x] : 0;
              putSample(rdv, ((r * cw + c) * chunkSpp + s) * bytesPer, v, bits, fmt, le);
            }
          }
        }
        if (predictor === 2) encodeHorizontal(raw, rdv, le, bits, chunkSpp, rows, cw);
        else if (predictor === 3) encodeFloatPredictor(raw, le, bits, chunkSpp, rows, cw);
        if (comp === 1) chunks.push(raw);
        else if (comp === 5) chunks.push(lzwEncode(raw));
        else if (comp === 8) chunks.push(new Uint8Array(zlib.deflateSync(Buffer.from(raw))));
        else throw new Error('writer: no encoder for compression ' + comp);
      }
    }

    const offs = new Array(chunks.length).fill(0);
    const counts = chunks.map((c) => c.length);

    const entries = [];
    const E = (tag, type, values) => entries.push({ tag: tag, type: type, values: values });
    E(256, 3, [w]); E(257, 3, [h]);
    E(258, 3, new Array(spp).fill(bits));
    E(259, 3, [comp]); E(262, 3, [1]); E(277, 3, [spp]); E(284, 3, [planar]);
    E(317, 3, [predictor]);
    E(339, 3, new Array(spp).fill(fmt));
    if (tile) { E(322, 3, [tile.w]); E(323, 3, [tile.h]); E(324, H.offType, offs); E(325, H.offType, counts); }
    else { E(273, H.offType, offs); E(278, 3, [rps]); E(279, H.offType, counts); }
    E(33550, 12, o.pixelScale || SCALE);
    E(33922, 12, o.tiepoint || TIEPOINT);
    E(34735, 3, [1, 1, 0, 2, 1024, 0, 1, 2, 2048, 0, 1, 4326]);
    if (o.nodata !== undefined) E(42113, 2, Array.from(String(o.nodata), (ch) => ch.charCodeAt(0)).concat([0]));

    for (const [tag, values] of Object.entries(o.tagOverrides || {})) {
      const e = entries.find((x) => x.tag === Number(tag));
      if (e) e.values = values;
    }

    entries.sort((a, b) => a.tag - b.tag);
    const n = entries.length;
    const sizes = entries.map((e) => TSIZE[e.type] * e.values.length);
    /* A value that does not fit in the entry's last field lives after the directory; the size of that
       field is the container's offset width, which is the whole of what changes between the two. */
    const extraAt = [];
    let p = H.headerBytes + H.dirCountBytes + H.entryBytes * n + H.offsetBytes;
    for (let i = 0; i < n; i++) {
      if (sizes[i] > H.offsetBytes) { extraAt.push(p); p += sizes[i] + (sizes[i] & 1); } else extraAt.push(-1);
    }
    let q = p + (p & 1);
    const dataAt = q;
    for (let i = 0; i < chunks.length; i++) { offs[i] = q; q += chunks[i].length + (chunks[i].length & 1); }

    const buf = new Uint8Array(q);
    const dv = new DataView(buf.buffer);
    buf[0] = le ? 0x49 : 0x4D; buf[1] = buf[0];
    dv.setUint16(2, H.magic, le);
    if (o.big) {
      dv.setUint16(4, o.offsetWidth === undefined ? 8 : o.offsetWidth, le);
      dv.setUint16(6, o.reserved === undefined ? 0 : o.reserved, le);
      dv.setBigUint64(8, BigInt(H.headerBytes), le);
    } else {
      dv.setUint32(4, H.headerBytes, le);
    }
    putUint(dv, H.headerBytes, n, H.dirCountBytes, le);
    for (let i = 0; i < n; i++) {
      const e = entries[i], at = H.headerBytes + H.dirCountBytes + i * H.entryBytes;
      dv.setUint16(at, e.tag, le);
      dv.setUint16(at + 2, e.type, le);
      putUint(dv, at + 4, e.values.length, H.valueCountBytes, le);
      const valueAt = at + 4 + H.valueCountBytes;
      if (sizes[i] > H.offsetBytes) {
        putUint(dv, valueAt, extraAt[i], H.offsetBytes, le);
        for (let k = 0; k < e.values.length; k++) putField(dv, extraAt[i] + k * TSIZE[e.type], e.type, e.values[k], le);
      } else {
        for (let k = 0; k < e.values.length; k++) putField(dv, valueAt + k * TSIZE[e.type], e.type, e.values[k], le);
      }
    }
    putUint(dv, H.headerBytes + H.dirCountBytes + n * H.entryBytes, 0, H.offsetBytes, le);
    let at = dataAt;
    for (const c of chunks) { buf.set(c, at); at += c.length + (c.length & 1); }
    return buf;
  }

  /* ══ THE PIXELS ═══════════════════════════════════════════════════════════════════════════════ */

  /* No symmetry in either axis, so a transposed, mirrored, off-by-one or wrong-band read cannot
     coincide with the right answer. */
  function pattern(w, h, f) {
    const a = new Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = f(x, y);
    return a;
  }

  const sameArray = (got, want, label) => {
    assert.equal(got.length, want.length, label + ': length');
    for (let i = 0; i < want.length; i++) assert.equal(got[i], want[i], label + ': index ' + i);
  };

  async function open(bytes) {
    const r = await GT.read(bytes);
    assert.equal(r.ok, true, 'open refused: ' + JSON.stringify(r.why || null) + ' ' + JSON.stringify(r.detail || null));
    return r.grid;
  }

  const refuse = async (bytes, why) => {
    const r = await GT.read(bytes);
    assert.equal(r.ok, false, 'expected a refusal (' + why + ')');
    assert.equal(r.why, why, 'refusal code; detail=' + JSON.stringify(r.detail || null));
    return r;
  };

  /* ══ ① BigTIFF ════════════════════════════════════════════════════════════════════════════════ */

  test('#R756 ① a BigTIFF and a classic TIFF of the same pixels come back as the same array', async () => {
    const w = 11, h = 7;
    const px = pattern(w, h, (x, y) => 1000 + x * 37 + y * 601);

    for (const le of [true, false]) {
      const classic = buildTiff({ le: le, width: w, height: h, pixels: [px] });
      const big = buildTiff({ le: le, big: true, width: w, height: h, pixels: [px] });
      /* ⚠ THE TWO FILES ARE NOT THE SAME BYTES — if they were, ① would be measuring nothing. */
      assert.notEqual(big.length, classic.length, 'the two containers must actually differ');
      assert.equal(new DataView(big.buffer).getUint16(2, le), 43, 'the fixture is a BigTIFF');

      const a = await open(classic);
      const b = await open(big);
      sameArray(a.read(0), px, 'classic ' + (le ? 'II' : 'MM'));
      sameArray(b.read(0), px, 'bigtiff ' + (le ? 'II' : 'MM'));
      sameArray(b.read(0), Array.from(a.read(0)), 'bigtiff vs classic ' + (le ? 'II' : 'MM'));
      /* the container did not leak into what the file SAYS it is */
      assert.equal(b.crs, a.crs);
      assert.equal(b.affine.x0, a.affine.x0);
      assert.equal(b.affine.dy, a.affine.dy);
      assert.equal(b.width, w);
    }
  });

  test('#R756 ①b a BigTIFF is read through every door the classic one is — tiles, strips, LZW, overviews of itself', async () => {
    const w = 20, h = 14;
    const px = pattern(w, h, (x, y) => (x * 13 + y * 29) % 4001);
    const reference = await open(buildTiff({ width: w, height: h, pixels: [px] }));

    for (const shape of [
      { rowsPerStrip: 3 },
      { tile: { w: 8, h: 8 } },
      { tile: { w: 8, h: 8 }, compression: 5 },
      { compression: 8, rowsPerStrip: 4 },
    ]) {
      const g = await open(buildTiff({ big: true, width: w, height: h, pixels: [px], ...shape }));
      sameArray(g.read(0), Array.from(reference.read(0)), 'bigtiff ' + JSON.stringify(shape));
      /* and a window of it reads the same window of the classic one */
      const r = await g.readRegion({ x: 5, y: 3, width: 9, height: 6 });
      assert.equal(r.ok, true, JSON.stringify(r));
      const ref = await reference.readRegion({ x: 5, y: 3, width: 9, height: 6 });
      sameArray(r.region.values, Array.from(ref.region.values), 'bigtiff region ' + JSON.stringify(shape));
    }
  });

  test('#R756 ①c sniff() and open() answer about the same file — a container recognised is a container read', async () => {
    const px = pattern(6, 5, (x, y) => x + y * 10);
    for (const le of [true, false]) {
      for (const big of [false, true]) {
        const bytes = buildTiff({ le: le, big: big, width: 6, height: 5, pixels: [px] });
        assert.equal(GT.sniff(bytes), true, 'sniff ' + (big ? 'bigtiff' : 'classic') + ' ' + (le ? 'II' : 'MM'));
        const r = await GT.read(bytes);
        /* ⚠ THE DEFECT: sniff() said 「I know this container」 and read() said 「I do not read it」.
           The two doors of one module must not disagree about one file. */
        assert.equal(r.ok, true, 'sniff accepted but read refused: ' + JSON.stringify(r.why || null));
      }
    }
  });

  test('#R756 ①d a BigTIFF over a byte supply reads the window and not the file', async () => {
    const w = 24, h = 16;
    const px = pattern(w, h, (x, y) => x * 5 + y * 111);
    const bytes = buildTiff({ big: true, width: w, height: h, pixels: [px], tile: { w: 8, h: 8 } });
    /* the supply of #R752 §2b, implemented here in three lines so that the ranged door is measured
       rather than assumed to be the resident one wearing a sleeve */
    let asked = 0;
    const supply = {
      size: bytes.length,
      async read(off, len) { asked++; return bytes.subarray(off, off + len); },
    };
    const r = await GT.readSource(supply);
    assert.equal(r.ok, true, JSON.stringify(r.why || null) + ' ' + JSON.stringify(r.detail || null));
    assert.equal(r.grid.width, w);
    /* the synchronous door still says the bytes are not here rather than answering with zeros */
    assert.throws(() => r.grid.read(0), (e) => e.why === 'pixels-not-resident');
    const all = await r.grid.readAll(0);
    assert.equal(all.ok, true, JSON.stringify(all));
    sameArray(all.values, px, 'bigtiff over a ranged supply');
    assert.ok(asked > 0, 'the supply was never asked');
  });

  /* ══ ② PREDICTOR 3 ════════════════════════════════════════════════════════════════════════════ */

  test('#R756 ② predictor 3 and predictor 1 of the same float pixels come back as the same array', async () => {
    const w = 17, h = 9;
    for (const bits of [32, 64]) {
      /* values whose exponent changes across the row and whose mantissa does not repeat, so the
         byte-plane shuffle actually rearranges something */
      const px = pattern(w, h, (x, y) => (x + 1) * 0.3701 - y * 17.25 + (x === y ? 1e4 : 0));
      const want = bits === 32 ? px.map((v) => Math.fround(v)) : px;

      const plain = buildTiff({ width: w, height: h, bits: bits, fmt: 3, pixels: [px] });
      const pred = buildTiff({ width: w, height: h, bits: bits, fmt: 3, pixels: [px], predictor: 3 });
      /* ⚠ THE STORED BYTES MUST DIFFER, or ② would pass for a reader that ignored the predictor
         entirely — the same guard #R749 ④ put on predictor 2. */
      assert.notDeepEqual(Array.from(pred), Array.from(plain), 'bits ' + bits + ': the fixture must distinguish the two readings');

      const a = await open(plain);
      const b = await open(pred);
      assert.equal(b.predictor, 3);
      sameArray(a.read(0), want, 'predictor 1, bits ' + bits);
      sameArray(b.read(0), want, 'predictor 3, bits ' + bits);
      sameArray(b.read(0), Array.from(a.read(0)), 'predictor 3 vs 1, bits ' + bits);
      /* twice, because undoing a predictor in place would make the second answer differ */
      sameArray(b.read(0), want, 'predictor 3, second read, bits ' + bits);
    }
  });

  test('#R756 ②b predictor 3 across byte orders, compressions, tiles and several bands', async () => {
    const w = 13, h = 11;
    const b0 = pattern(w, h, (x, y) => x * 0.5 - y * 0.125);
    const b1 = pattern(w, h, (x, y) => 1e6 + x - y * 1000);
    const b2 = pattern(w, h, (x, y) => (x * y) / 7 - 3);
    const bands = [b0, b1, b2].map((a) => a.map((v) => Math.fround(v)));

    for (const le of [true, false]) {
      for (const shape of [{}, { compression: 5 }, { compression: 8, rowsPerStrip: 3 }, { tile: { w: 8, h: 4 } }, { big: true, tile: { w: 8, h: 4 }, compression: 5 }]) {
        const base = { le: le, width: w, height: h, spp: 3, bits: 32, fmt: 3, pixels: [b0, b1, b2], ...shape };
        const a = await open(buildTiff(base));
        const b = await open(buildTiff({ ...base, predictor: 3 }));
        for (let i = 0; i < 3; i++) {
          const label = (le ? 'II' : 'MM') + ' ' + JSON.stringify(shape) + ' band ' + i;
          sameArray(b.read(i), bands[i], 'predictor 3 ' + label);
          sameArray(b.read(i), Array.from(a.read(i)), 'predictor 3 vs 1 ' + label);
        }
      }
    }
  });

  /* ══ ③ PLANARCONFIGURATION 2 ══════════════════════════════════════════════════════════════════ */

  test('#R756 ③ separate planes and chunky storage of the same bands come back as the same arrays', async () => {
    const w = 12, h = 9, n = 4;
    const bands = [];
    for (let i = 0; i < n; i++) bands.push(pattern(w, h, (x, y) => 100 * (i + 1) + x * 3 + y * 40));

    for (const shape of [{}, { rowsPerStrip: 2 }, { tile: { w: 8, h: 4 } }, { compression: 5, tile: { w: 8, h: 4 } }, { compression: 8, rowsPerStrip: 3 }, { big: true, tile: { w: 8, h: 8 } }]) {
      const base = { width: w, height: h, spp: n, pixels: bands, ...shape };
      const chunky = await open(buildTiff(base));
      const separate = await open(buildTiff({ ...base, planar: 2 }));
      assert.equal(chunky.planarConfig, 1);
      assert.equal(separate.planarConfig, 2);
      /* ⚠ THE CHUNK TABLE IS n TIMES LONGER, which is the thing the index had to learn */
      assert.equal(separate.chunks, chunky.chunks * n, 'chunk count ' + JSON.stringify(shape));
      for (let i = 0; i < n; i++) {
        const label = JSON.stringify(shape) + ' band ' + i;
        sameArray(separate.read(i), bands[i], 'separate ' + label);
        /* ⚠ AND AGAINST THE FORM THAT ALREADY WORKED — a band read from the wrong plane is still a
           perfectly ordinary array of numbers, so only the reference can tell. */
        sameArray(separate.read(i), Array.from(chunky.read(i)), 'separate vs chunky ' + label);
      }
      assert.throws(() => separate.read(n), (e) => e.why === 'band-out-of-range');
    }
  });

  test('#R756 ③b a separate file survives the predictor, nodata and a window, and asks only for its own plane', async () => {
    const w = 16, h = 12;
    const bands = [
      pattern(w, h, (x, y) => x * 0.25 - y * 0.5),
      pattern(w, h, (x, y) => (x === 3 ? -9999 : y * 2 + x)),
      pattern(w, h, (x, y) => 1000.5 + x - y),
    ].map((a) => a.map((v) => Math.fround(v)));

    const base = {
      width: w, height: h, spp: 3, bits: 32, fmt: 3, pixels: bands,
      tile: { w: 8, h: 4 }, compression: 5, nodata: -9999,
    };
    const chunky = await open(buildTiff({ ...base, predictor: 3 }));
    const separate = await open(buildTiff({ ...base, planar: 2, predictor: 3 }));

    for (let i = 0; i < 3; i++) {
      const got = separate.read(i), ref = chunky.read(i);
      assert.equal(got.length, ref.length);
      for (let k = 0; k < got.length; k++) {
        if (Number.isNaN(ref[k])) { assert.ok(Number.isNaN(got[k]), 'band ' + i + ' index ' + k + ' must be NaN'); continue; }
        assert.equal(got[k], ref[k], 'band ' + i + ' index ' + k);
      }
    }
    /* ⚠ MISSING IS STILL NaN AND NOT 0 through the separate path too (docs/GIS-CORE.md §1.4) */
    for (let y = 0; y < h; y++) assert.ok(Number.isNaN(separate.read(1)[y * w + 3]), 'nodata column, row ' + y);

    /* ⚠ AND THE WINDOW ASKS FOR THIS BAND'S CHUNKS, not for every chunk in the file: a 8×4 window of
       a 16×12 image in 8×4 tiles covers one tile, and it covers ONE whether the file has 6 chunks or
       18. A window that walked all three planes would read three times the bytes for one band. */
    const r = await separate.readRegion({ band: 2, x: 0, y: 0, width: 8, height: 4 });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.region.chunks, 1, 'one tile covers this window in exactly one plane');
    const ref = await chunky.readRegion({ band: 2, x: 0, y: 0, width: 8, height: 4 });
    sameArray(r.region.values, Array.from(ref.region.values), 'separate window vs chunky window');
  });

  /* ══ ④ THE THREE REFUSALS THAT ARE NO LONGER REACHED — AND WHAT STILL REACHES THEM ═══════════ */

  test('#R756 ④ the ordinary export no longer meets the refusal, and what remains unreadable still does', async () => {
    const px = pattern(6, 5, (x, y) => x + y * 7);
    const fl = pattern(6, 5, (x, y) => x * 0.5 - y);

    /* ⚠ HALF ONE: the reader's file opens. Stated as the reader's loss, not as a feature's presence —
       「GDAL の既定で書き出したものが開けない」 is the defect, and these are those defaults. */
    assert.equal((await GT.read(buildTiff({ big: true, width: 6, height: 5, pixels: [px] }))).ok, true, 'BIGTIFF=YES');
    assert.equal((await GT.read(buildTiff({ width: 6, height: 5, bits: 32, fmt: 3, pixels: [fl], predictor: 3 }))).ok, true, 'PREDICTOR=3');
    assert.equal((await GT.read(buildTiff({ width: 6, height: 5, spp: 2, pixels: [px, px], planar: 2 }))).ok, true, 'INTERLEAVE=BAND');

    /* ⚠ HALF TWO, and this is the half [[intmap-refusal-that-becomes-implementation]] is about: the
       codes are still there, still reachable, still specific. Deleting them — or deleting the checks
       that watch them — would be 「見るのをやめた回」. */
    const declared = GT.refusals();
    for (const why of ['bigtiff-unsupported', 'predictor-unsupported', 'planar-separate-unsupported', 'jpeg-in-tiff-unsupported']) {
      assert.ok(declared.includes(why), why + ' was deleted from the vocabulary');
    }

    /* a BigTIFF whose header states an offset width this reader cannot address */
    const wide = await refuse(buildTiff({ big: true, width: 6, height: 5, pixels: [px], offsetWidth: 16 }), 'bigtiff-unsupported');
    assert.equal(wide.detail.offsetBytes, 16);
    assert.equal(wide.detail.byteOrder, 'II');
    const reserved = await refuse(buildTiff({ big: true, le: false, width: 6, height: 5, pixels: [px], reserved: 1 }), 'bigtiff-unsupported');
    assert.equal(reserved.detail.reserved, 1);
    assert.equal(reserved.detail.byteOrder, 'MM');

    /* TN3's predictor over samples TN3 does not describe: integers, and 64-bit horizontal
       differencing. ⚠ The first is the one that used to be refused for EVERY sample type. */
    const ints = await refuse(buildTiff({ width: 6, height: 5, pixels: [px], predictor: 3 }), 'predictor-unsupported');
    assert.equal(ints.detail.predictor, 3);
    assert.equal(ints.detail.sampleFormat, 1);
    await refuse(buildTiff({ width: 6, height: 5, bits: 64, fmt: 3, pixels: [fl], tagOverrides: { 317: [2] } }), 'predictor-unsupported');
    await refuse(buildTiff({ width: 6, height: 5, pixels: [px], tagOverrides: { 317: [9] } }), 'predictor-unsupported');

    /* a PlanarConfiguration TIFF 6.0 does not define */
    const planar3 = await refuse(buildTiff({ width: 6, height: 5, pixels: [px], tagOverrides: { 284: [3] } }), 'planar-separate-unsupported');
    assert.equal(planar3.detail.planarConfiguration, 3);

    /* ⚠ AND THE ONE THAT IS STILL REFUSED ON PURPOSE. It is not an oversight of this round, and the
       source says in one line why it cannot be done today — measured, because a reason nobody wrote
       down is a reason that stops being true without anybody noticing. */
    const jpeg = await refuse(buildTiff({ width: 6, height: 5, pixels: [px], tagOverrides: { 259: [7] } }), 'jpeg-in-tiff-unsupported');
    assert.equal(jpeg.detail.name, 'jpeg');
    const source = readFileSync(join(ROOT, 'js/gis-geotiff.js'), 'utf8');
    assert.match(source, /消せる条件/, 'the refusal that stays must say what would let it go');
  });

  /* ══ ⑤ THE PLANE A READER CAN NAME (js/gis-crs.js) ════════════════════════════════════════════ */

  function installWindow() {
    const w = {};
    globalThis.window = w;
    new Function('window', readFileSync(join(ROOT, 'js/geodesy.js'), 'utf8'))(w);
    return w;
  }

  test('#R756 ⑤ the azimuthal equidistant plane can be named in text, and a name nobody accepts is told the names there are', async () => {
    installWindow();
    const { makeGisCrs } = await import('../js/gis-crs.js');
    const crs = makeGisCrs();

    /* ⚠ THE DEFECT: the catalogue published four planes and js/gis-ops.js's `measure` takes its crs
       as TEXT, so a reader could ask for three. aeqd has no authority code — its centre is an
       argument — so a reader who wanted 「距離を測れる面」 had no way to say so at all. */
    const listed = crs.projections().map((p) => p.kind);
    assert.ok(listed.includes('aeqd'), 'the catalogue no longer lists the plane this check is about');

    const P = crs.projection('aeqd:139.7,35.7');
    assert.ok(P, 'aeqd was not reachable from text: ' + crs.why());
    assert.equal(P.kind, 'aeqd');
    assert.equal(P.params.lat0, 35.7);
    assert.ok(Math.abs(P.params.lon0 - 139.7) < 1e-12);
    /* it is the plane it says it is: the centre projects to the origin, and a point due north of it
       lands at its own great-circle distance — computed here from the sphere, not from the module */
    const at0 = P.forward(139.7, 35.7);
    assert.ok(Math.hypot(at0[0], at0[1]) < 1e-6, 'the centre is the origin');
    const north = P.forward(139.7, 36.7);
    const R = window.IntMapGeodesy._R_EARTH_KM * 1000;
    assert.ok(Math.abs(Math.hypot(north[0], north[1]) - R * Math.PI / 180) < 1e-3, 'one degree north is one degree of arc');

    /* every plane the catalogue names is reachable by the spelling the catalogue publishes */
    for (const p of crs.projections()) {
      const filled = p.spelling.replace('<zone>', '54').replace('<south>', 'north')
        .replace('<lon0>', '139.7').replace('<lat0>', '35.7');
      assert.ok(crs.projection(filled), p.kind + ' is published as ' + p.spelling + ' and refused it: ' + crs.why());
    }

    /* ⚠ AND EVERY SPELLING THE PUBLISHED LIST NAMES WORKS — the list is what js/gis-ops.js shows a
       reader who got it wrong, and a list that named something planeSpec() refuses would send the
       reader to try it. `NN` is the code's own arithmetic, so it is filled in with a real zone. */
    const spellings = crs.planeSpellings();
    assert.ok(spellings.length >= crs.projections().length, 'the published list is shorter than the catalogue');
    for (const s of spellings) {
      const filled = s.replace('NN', '54').replace('<zone>', '54').replace('<south>', 'south')
        .replace('<lon0>', '10').replace('<lat0>', '-20');
      assert.ok(crs.projection(filled), 'published spelling refused: ' + s + ' → ' + filled + ' (' + crs.why() + ')');
    }
    /* and the list is derived from the table rather than kept by hand: every kind appears in it */
    for (const p of crs.projections()) {
      assert.ok(spellings.some((s) => s === p.spelling), p.kind + ' is missing from planeSpellings()');
    }

    /* a spelling nobody accepts is refused BY NAME, and the parameters it lacks are named */
    assert.equal(crs.projection('aeqd'), null);
    assert.equal(crs.why(), 'crs-plane-params-missing');
    assert.equal(crs.projection('aeqd:139.7'), null);
    assert.equal(crs.why(), 'crs-plane-params-missing');
    assert.equal(crs.projection('lambert:1,2'), null);
    assert.equal(crs.why(), 'crs-plane-unknown');
    assert.equal(crs.projection('EPSG:4326'), null);
    assert.equal(crs.why(), 'crs-plane-is-degrees', 'degrees are still not a plane');
    /* a centre that is not a position is refused by the builder that knows what a centre is */
    assert.equal(crs.projection('aeqd:139.7,120'), null);
    assert.equal(crs.why(), 'crs-plane-params-missing');

    /* the codes that already worked still work, and still mean what they meant */
    assert.equal(crs.projection('EPSG:3857').kind, 'webmercator');
    assert.equal(crs.projection('EPSG:32654').params.zone, 54);
    assert.equal(crs.projection('EPSG:32754').params.south, true);
    assert.equal(crs.projection('ESRI:54009').params.lon0, 0);
    assert.equal(crs.projection('EPSG:32799'), null);
    assert.equal(crs.why(), 'crs-plane-unknown', 'zone 99 is not a zone');
    /* …and a Mollweide centred elsewhere, which also had no way of being named */
    const moll = crs.projection('mollweide:150');
    assert.ok(moll, crs.why());
    assert.equal(moll.params.lon0, 150);
    assert.equal(moll.code, null, 'a plane centred off Greenwich must not borrow ESRI:54009');
  });

  ISOLATED.built();
});
