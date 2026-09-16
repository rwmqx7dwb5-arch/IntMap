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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

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

test('① この app が書いた GeoTIFF は、この app を知らない読み手が開ける', async () => {
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

test('① 場所が、仕様のタグから読み取れる — 画素が合っていても場所が違えば別のデータ', async () => {
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

test('① 述べているバイト順・標本形式と、実際に書いたバイトが一致する', async () => {
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

test('② 参照の読み手は、壊れたファイルを実際に拒む — 拒めない参照は何も測っていない', async () => {
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

test('② 参照の読み手は、この app の読み手を 1 行も使っていない', () => {
  const src = read('tests/r765-gis-external-reader-checks.test.mjs');
  const imports = src.match(/^import[^\n]*$/gm) || [];
  for (const line of imports) {
    assert.ok(!/gis-geotiff/.test(line), '参照が、測る対象の読み手を取り込んでいる: ' + line);
  }
  /* タグは番号で知っている（この app の綴りからではなく、公表された形式から） */
  assert.ok(/ModelTiepoint: 33922/.test(src), 'タグを番号で持っていない');
});

/* ══ ③ 何を主張していないか ═══════════════════════════════════════════════════════════════ */

/* ⚠ この検査は最初、`/GDAL/` が文書のどこかに在れば通る書き方だった。**通ってしまった**
   ——`GDAL` は §1.4a と §1.4b に別の理由で出てくる語で、この回が述べるべきことは 1 文字も
   書かれていなかった。針が主題を持たないと、包含の一覧になって的の外を数える
   （[[intmap-claim-needle-is-an-inclusion-list]]）。だから測るのは**この節の中の、この主張**。 */
test('③ 文書が、この検査の限界をそのまま述べている', () => {
  const doc = read('docs/GIS-CORE.md');
  const at = doc.indexOf('自分の読み手で読み直せることは、他人が開けることではない');
  assert.ok(at > 0, 'docs/GIS-CORE.md に、この主題の節が無い');
  const section = doc.slice(at, doc.indexOf('\n## ', at) < 0 ? undefined : doc.indexOf('\n## ', at));
  assert.ok(/GDAL/.test(section), 'その節が「GDAL ではない」と述べていない');
  assert.ok(/QGIS/.test(section), '「他のソフトで開ける」が何を意味するかが述べられていない');
  assert.ok(/33922|33550/.test(section), 'タグを番号で読んでいることが述べられていない');
});
