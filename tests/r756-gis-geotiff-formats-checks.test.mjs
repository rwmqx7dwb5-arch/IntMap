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

import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { makeGisGeotiff } from '../js/gis-geotiff.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
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
   tests/r749-gis-geotiff-checks.test.mjs documents, restated here rather than imported because this
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

test('① a BigTIFF and a classic TIFF of the same pixels come back as the same array', async () => {
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

test('①b a BigTIFF is read through every door the classic one is — tiles, strips, LZW, overviews of itself', async () => {
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

test('①c sniff() and open() answer about the same file — a container recognised is a container read', async () => {
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

test('①d a BigTIFF over a byte supply reads the window and not the file', async () => {
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

test('② predictor 3 and predictor 1 of the same float pixels come back as the same array', async () => {
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

test('②b predictor 3 across byte orders, compressions, tiles and several bands', async () => {
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

test('③ separate planes and chunky storage of the same bands come back as the same arrays', async () => {
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

test('③b a separate file survives the predictor, nodata and a window, and asks only for its own plane', async () => {
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

test('④ the ordinary export no longer meets the refusal, and what remains unreadable still does', async () => {
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

test('⑤ the azimuthal equidistant plane can be named in text, and a name nobody accepts is told the names there are', async () => {
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
