/* ============================================================================
 *  IntMap · THE GEOTIFF READER — window.IntMapGisGeotiff   (#R749)
 * ----------------------------------------------------------------------------
 *  docs/GIS-CORE.md §6 said it plainly: 「ラスターは 4326 の格子だけ。GeoTIFF を読む汎用の入口は
 *  無く（js/data-layers.js の Köppen が専用の経路を持つ）」. Every numeric grid this app has ever
 *  drawn arrived through a reader written for that one dataset, so a reader who HAS a GeoTIFF — a
 *  DEM tile, a population count, a rainfall month, anything a government publishes — had no door at
 *  all. This file is that door, and nothing else.
 *
 *  ⚠ NO DEPENDENCY WAS ADDED. Same reason js/gis-geopackage.js writes SQLite by hand: TIFF 6.0
 *  (Adobe, 1992) and the OGC GeoTIFF standard (1.1, OGC 19-008r4) are published precisely so that a
 *  reader can be written against them, and what this path needs is the header, the IFD, the strip
 *  or tile table, four decompressors and the model transformation. The `geotiff` npm package also
 *  knows how to WRITE, how to speak HTTP range requests and how to decode JPEG — none of which is
 *  wanted here, and all of which would arrive.
 *
 *  ══ THE CONTRACT ══════════════════════════════════════════════════════════════════════════════
 *      sniff(bytes)          → boolean   (the four magic bytes, both orders, BigTIFF included)
 *      refusals()            → [code, …] every code this module can answer or throw with
 *      read(bytes, {ctx})    → { ok:true, grid } | { ok:false, why, detail }
 *
 *  `why` is a CODE, never a sentence — the nine languages live at the call site (docs/GIS-CORE.md
 *  §2.2). This module does not register a dataset, does not touch the map, and DOES NOT RE-PROJECT:
 *  the one transform rule is js/gis-crs.js applied by the importer, and a second one here would be
 *  the 「同じ判断を 2 か所に持たせる」 that .agents/rules/no-ad-hoc-hardcoding.md forbids. What it
 *  gives the caller instead is everything that rule needs: the EPSG code the GeoKeys STATE (or
 *  `null` — 「述べていない」 is not 「4326 だった」), the citation text verbatim, and the raw model
 *  tags, so the reader can see who said what.
 *
 *  `grid` is:
 *      { width, height, bands:[{name, unit, nodata, sampleFormat, bits}], crs, crsText,
 *        model:{ tiepoint, pixelScale, transform, rasterType },
 *        affine:{ x0, y0, dx, dy, rotated },
 *        layout:'strip'|'tile', compression, predictor, planarConfig, photometric,
 *        ifds, overviews, read(bandIndex) }
 *
 *  `affine.x0`/`y0` are the coordinates of the UPPER-LEFT CORNER of pixel (0,0) in the file's own
 *  CRS; `dx`/`dy` are both POSITIVE and row 0 is the northern row, which is the same convention
 *  js/gis-raster.js already holds (docs/GIS-CORE.md §1.4: 「行は北から南へ進む」). ⚠ Whether that
 *  corner is the corner or the CENTRE is the file's statement too — GeoKey 1025 — so it travels as
 *  `model.rasterType` rather than being applied here as half a pixel nobody asked for.
 *
 *  ══ ⚠⚠⚠ MISSING IS NaN, NEVER ZERO ════════════════════════════════════════════════════════════
 *  docs/GIS-CORE.md §1.4 holds the rule and the reason in one line: 「欠損を 0 で埋めない（0 は海面
 *  の標高で、雨量ゼロである）」. The GDAL_NODATA tag (42113) is an ASCII number, and every pixel
 *  equal to it becomes NaN in the array `read()` returns. A file that states no nodata gets none
 *  invented for it.
 *
 *  ══ ⚠⚠⚠ read() IS A DOOR, NOT AN INGEST ═══════════════════════════════════════════════════════
 *  Opening the file parses the header, the IFD, the georeference and the chunk TABLE — it does not
 *  expand a single pixel. A 4,000 × 4,000 band is 128 MB as doubles, and the panel, the chain, the
 *  registry and the save path all want metadata only (docs/GIS-CORE.md §1.4 says the same about
 *  `features()`). So the Float64Array is built when `read(i)` is called, and the decompressors run
 *  then too. Two consequences, both stated rather than hidden:
 *    · a chunk that is corrupt INSIDE its declared byte range is not seen at open. `read()` THROWS
 *      an Error carrying `.why` from the same vocabulary `refusals()` publishes — a decoder that
 *      returned a half-filled array of zeros would be the 「0 で埋める」 defect wearing a different
 *      hat.
 *    · ⚠ ONE EXCEPTION, AND IT IS THE PLATFORM'S: Deflate is decompressed by DecompressionStream,
 *      which is ASYNCHRONOUS, and `read(i)` is synchronous because a grid's band accessor is
 *      (js/gis-raster.js walks it in a loop). So a Deflate image has its chunks INFLATED during the
 *      async open — the bytes held are the file's own uncompressed sample bytes, not the eightfold
 *      Float64 expansion, and that pass is where `ctx` ticks. Every other compression stays lazy.
 *
 *  ══ WHAT IT REFUSES, AND WHY EACH REFUSAL IS A MEASUREMENT ════════════════════════════════════
 *    not-tiff                 the first bytes are not a TIFF header
 *    bigtiff-unsupported      magic 43. A BigTIFF's offsets are 64-bit and its IFD entries are 20
 *                             bytes wide — a different container, refused by name rather than read
 *                             as a truncated TIFF (the shape #R576 exists to stop)
 *    tiff-truncated           an IFD, a tag's value area or a chunk lies past the last byte
 *    tiff-corrupt             the tags contradict each other (no dimensions, no chunk table, one
 *                             count per sample that is not one count per sample)
 *    compression-unsupported  `detail` carries the number AND the registry's name for it, because
 *                             「読み込めませんでした」 over twenty causes is the failure js/map-ui.js's
 *                             reasonText already records
 *    jpeg-in-tiff-unsupported compression 6/7. Named apart because it is the one a reader is most
 *                             likely to meet and the only one whose fix is 「re-export it」
 *    predictor-unsupported    floating-point predictor 3, or horizontal differencing on 64-bit
 *                             samples, or a predictor value TIFF 6.0 does not define
 *    sample-format-unsupported  SampleFormat 4 (undefined), or samples that do not agree
 *    bits-unsupported         bit depths below 8, not a multiple of 8, or unequal across samples
 *    planar-separate-unsupported  PlanarConfiguration 2
 *    no-georeference          neither (ModelTiepoint + ModelPixelScale) nor ModelTransformation.
 *                             ⚠ A TIFF without those is a picture, not a grid, and placing it
 *                             somewhere plausible is how a map states what nobody said
 *    grid-degenerate          a pixel size of zero or negative, or non-finite corner — the same
 *                             refusal js/gis-raster.js makes at registration (§1.4), made earlier
 *    deflate-unavailable      no DecompressionStream in this runtime
 *    lzw-corrupt              a code outside the table, or a stream that ends mid-symbol
 *    packbits-corrupt         a run that runs off the end of its chunk
 *    chunk-short              a chunk decompressed to fewer bytes than its geometry needs
 *    band-out-of-range        read(i) for a band the file does not have
 *    cancelled                the reader asked to stop (docs/GIS-CORE.md §2.6)
 *
 *  ⚠ A ROTATED MODEL IS REPORTED, NOT FLATTENED. ModelTransformation may carry rotation/shear; the
 *  grid is still read and `affine.rotated` is true with the full 4×4 in `model.transform`. Quietly
 *  dropping the off-diagonal terms would put every pixel somewhere it is not, silently, which is
 *  worse than either refusing or telling.
 * ==========================================================================*/

export function makeGisGeotiff() {
  return (function () {

    /* ══ 0 · THE VOCABULARY ════════════════════════════════════════════════════════════════════ */

    /* ⚠ DECLARED, AND ENFORCED BY THE CONSTRUCTOR BELOW (same device as js/gis-geopackage.js).
       `refusals()` is read by the call site that has to write one sentence per code, and a list
       that merely DESCRIBES the returns drifts from them the first time a code is added. bad()
       throwing on an undeclared code is what keeps the two the same set. */
    const REFUSALS = Object.freeze([
      'not-tiff', 'bigtiff-unsupported', 'tiff-truncated', 'tiff-corrupt',
      'compression-unsupported', 'jpeg-in-tiff-unsupported', 'predictor-unsupported',
      'sample-format-unsupported', 'bits-unsupported', 'planar-separate-unsupported',
      'no-georeference', 'grid-degenerate', 'deflate-unavailable',
      'lzw-corrupt', 'packbits-corrupt', 'chunk-short', 'band-out-of-range', 'cancelled',
    ]);

    const bad = (why, detail) => {
      if (REFUSALS.indexOf(why) < 0) throw new Error('gis-geotiff: undeclared refusal code ' + why);
      return detail === undefined ? { ok: false, why: why } : { ok: false, why: why, detail: detail };
    };

    /* The same vocabulary, thrown — for the decode that happens after the open has returned. */
    function raise(why, detail) {
      const r = bad(why, detail);
      const e = new Error('gis-geotiff: ' + why);
      e.why = r.why;
      e.detail = r.detail === undefined ? null : r.detail;
      throw e;
    }

    /* ══ 1 · CANCELLATION AND PROGRESS ═════════════════════════════════════════════════════════
       ⚠ THE UNIT IS TIME, NOT A COUNT (docs/GIS-CORE.md §2.6). 「1,000 画素ごと」 is 3 ms of one file
       and 40 s of another; what matters is how long this thread has been held, and one frame at
       60 Hz is what the renderer needs. Same shape as js/gis-ops.js's makeCtx so that a caller which
       already has a ctx (the ops layer does) hands it straight through instead of owning two. */
    const FRAME_MS = 16;
    function nowMs() {
      try { if (typeof performance !== 'undefined' && performance && performance.now) return performance.now(); } catch (_) { }
      return Date.now();
    }
    function makeCtx(opts) {
      const o = opts || {};
      const sig = o.signal || null;
      const onp = (typeof o.onProgress === 'function') ? o.onProgress : null;
      let last = nowMs(), done = 0;
      return {
        aborted: () => !!(sig && sig.aborted),
        done: () => done,
        async tick(units, total) {
          done += (typeof units === 'number' && isFinite(units)) ? units : 1;
          if (sig && sig.aborted) return false;
          const t = nowMs();
          if (t - last < FRAME_MS) return true;
          last = t;
          if (onp) { try { onp({ done: done, total: (typeof total === 'number' ? total : null) }); } catch (_) { } }
          await new Promise((res) => setTimeout(res, 0));
          return !(sig && sig.aborted);
        },
      };
    }
    function ctxOf(opts) {
      const o = opts || {};
      if (o.ctx && typeof o.ctx.tick === 'function') return o.ctx;
      return makeCtx(o);
    }

    /* ══ 2 · THE CONTAINER ═════════════════════════════════════════════════════════════════════ */

    function u8of(bytes) {
      if (bytes instanceof Uint8Array) return bytes;
      if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
      if (bytes && typeof bytes.byteLength === 'number' && bytes.buffer) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return null;
    }

    /* The four headers TIFF 6.0 and BigTIFF define. BigTIFF is sniffed TRUE on purpose: this reader
       recognises the container and then refuses it by name, which is a different answer from
       「これは TIFF ではない」 and the only one that tells the reader what to do about it. */
    function sniff(bytes) {
      const u = u8of(bytes);
      if (!u || u.length < 4) return false;
      const a = u[0], b = u[1], c = u[2], d = u[3];
      if (a === 0x49 && b === 0x49 && (c === 0x2A || c === 0x2B) && d === 0x00) return true;   /* II*\0 · II+\0 */
      if (a === 0x4D && b === 0x4D && c === 0x00 && (d === 0x2A || d === 0x2B)) return true;   /* MM\0* · MM\0+ */
      return false;
    }

    /* TIFF 6.0 field types, by the byte count of one value. 16/17/18 are BigTIFF's and appear here
       only so that a stray entry is measured rather than mis-sized. */
    const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8, 17: 8, 18: 8 };

    const T = {
      NEW_SUBFILE: 254, WIDTH: 256, HEIGHT: 257, BITS: 258, COMPRESSION: 259, PHOTOMETRIC: 262,
      STRIP_OFFSETS: 273, SAMPLES: 277, ROWS_PER_STRIP: 278, STRIP_COUNTS: 279,
      PLANAR: 284, PREDICTOR: 317, TILE_WIDTH: 322, TILE_HEIGHT: 323,
      TILE_OFFSETS: 324, TILE_COUNTS: 325, SAMPLE_FORMAT: 339,
      PIXEL_SCALE: 33550, TIEPOINT: 33922, TRANSFORM: 34264,
      GEO_KEYS: 34735, GEO_DOUBLES: 34736, GEO_ASCII: 34737,
      GDAL_METADATA: 42112, GDAL_NODATA: 42113,
    };

    /* One field's values, resolved through the offset TIFF uses when they do not fit in four bytes.
       Returns null when the value area is outside the file — the caller turns that into
       `tiff-truncated` WITH THE TAG, rather than dropping the field and refusing later for a
       missing dimension, which would report the wrong defect. */
    function readValues(dv, le, type, count, inlineAt, len) {
      const size = TYPE_SIZE[type];
      if (!size || !(count >= 0)) return null;
      const total = size * count;
      let at = inlineAt;
      if (total > 4) {
        at = dv.getUint32(inlineAt, le);
        if (!(at >= 0) || at + total > len) return null;
      }
      const out = [];
      for (let i = 0; i < count; i++) {
        const o = at + i * size;
        switch (type) {
          case 1: case 2: case 7: out.push(dv.getUint8(o)); break;
          case 3: out.push(dv.getUint16(o, le)); break;
          case 4: out.push(dv.getUint32(o, le)); break;
          case 5: { const n = dv.getUint32(o, le), d = dv.getUint32(o + 4, le); out.push(d ? n / d : NaN); break; }
          case 6: out.push(dv.getInt8(o)); break;
          case 8: out.push(dv.getInt16(o, le)); break;
          case 9: out.push(dv.getInt32(o, le)); break;
          case 10: { const n = dv.getInt32(o, le), d = dv.getInt32(o + 4, le); out.push(d ? n / d : NaN); break; }
          case 11: out.push(dv.getFloat32(o, le)); break;
          case 12: out.push(dv.getFloat64(o, le)); break;
          default: return null;
        }
      }
      const field = { type: type, count: count, values: out };
      if (type === 2) {
        let s = '';
        for (let i = 0; i < out.length; i++) s += String.fromCharCode(out[i]);
        field.ascii = s.replace(/\0+$/, '');
      }
      return field;
    }

    function readIfd(dv, le, at, len) {
      if (!(at > 0) || at + 2 > len) return { truncated: true, at: at };
      const n = dv.getUint16(at, le);
      if (at + 2 + n * 12 + 4 > len) return { truncated: true, at: at };
      const tags = new Map();
      for (let i = 0; i < n; i++) {
        const e = at + 2 + i * 12;
        const tag = dv.getUint16(e, le), type = dv.getUint16(e + 2, le), count = dv.getUint32(e + 4, le);
        const v = readValues(dv, le, type, count, e + 8, len);
        /* An unknown TYPE is not this file's business (TIFF says to skip fields you do not know),
           but a KNOWN type whose value area is off the end is the file being short. */
        if (!v) { if (TYPE_SIZE[type]) return { truncated: true, at: e, tag: tag }; continue; }
        tags.set(tag, v);
      }
      return { tags: tags, next: dv.getUint32(at + 2 + n * 12, le) };
    }

    const one = (f, dflt) => (f && f.values.length ? f.values[0] : dflt);

    /* ══ 3 · THE GEOREFERENCE ══════════════════════════════════════════════════════════════════ */

    /* GeoTIFF 1.1 §B: the key directory is a flat array of 4-short records preceded by a 4-short
       header. A key either holds its own SHORT value (location 0) or points into the double array
       or the ASCII blob. Nothing here is inferred — a key that is absent stays absent. */
    function geoKeys(tags) {
      const dir = tags.get(T.GEO_KEYS);
      if (!dir || dir.values.length < 4) return null;
      const v = dir.values;
      const count = v[3];
      const doubles = tags.get(T.GEO_DOUBLES);
      const ascii = tags.get(T.GEO_ASCII);
      const keys = new Map();
      for (let i = 0; i < count; i++) {
        const o = 4 + i * 4;
        if (o + 4 > v.length) break;
        const id = v[o], loc = v[o + 1], n = v[o + 2], off = v[o + 3];
        if (loc === 0) keys.set(id, off);
        else if (loc === T.GEO_DOUBLES && doubles) keys.set(id, doubles.values[off]);
        else if (loc === T.GEO_ASCII && ascii && typeof ascii.ascii === 'string') {
          keys.set(id, ascii.ascii.slice(off, off + n).replace(/\|+$/, ''));
        }
      }
      return keys;
    }

    /* ⚠ 0 and 32767 are GeoTIFF's own 「undefined」 and 「user-defined」. Reading either as an EPSG
       number would manufacture a code the file refused to state. */
    const epsgOf = (n) => (typeof n === 'number' && isFinite(n) && n > 0 && n < 32767) ? ('EPSG:' + n) : null;

    function crsFromKeys(keys) {
      if (!keys) return { crs: null, crsText: null, rasterType: null };
      const proj = epsgOf(keys.get(3072));                       /* ProjectedCSTypeGeoKey  */
      const geog = epsgOf(keys.get(2048));                       /* GeographicTypeGeoKey   */
      const cite = keys.get(3073) || keys.get(2049) || keys.get(1026) || null;  /* the citations */
      const rt = keys.get(1025);                                 /* RasterTypeGeoKey       */
      return {
        crs: proj || geog || null,
        crsText: (typeof cite === 'string' && cite.trim()) ? cite.trim() : null,
        rasterType: rt === 1 ? 'area' : (rt === 2 ? 'point' : null),
      };
    }

    /* The two ways a GeoTIFF states where its pixels are, read as written. ⚠ `dx`/`dy` come back
       POSITIVE with row 0 north, which is the convention js/gis-raster.js holds; the tiepoint form
       says so by construction (the pixel scale's y is applied downward), and the matrix form says
       it through t[5], which is negative in a north-up file. */
    function georef(tags) {
      const scale = tags.get(T.PIXEL_SCALE);
      const tie = tags.get(T.TIEPOINT);
      const tr = tags.get(T.TRANSFORM);
      const model = {
        tiepoint: tie ? tie.values.slice() : null,
        pixelScale: scale ? scale.values.slice() : null,
        transform: tr ? tr.values.slice() : null,
        rasterType: null,
      };
      if (tr && tr.values.length >= 16) {
        const t = tr.values;
        const rotated = !!(t[1] || t[4]);
        return {
          model: model,
          affine: {
            x0: t[3], y0: t[7],
            dx: rotated ? Math.hypot(t[0], t[4]) : Math.abs(t[0]),
            dy: rotated ? Math.hypot(t[1], t[5]) : Math.abs(t[5]),
            rotated: rotated,
          },
        };
      }
      if (scale && tie && scale.values.length >= 2 && tie.values.length >= 6) {
        const sx = scale.values[0], sy = scale.values[1];
        const i0 = tie.values[0], j0 = tie.values[1], X = tie.values[3], Y = tie.values[4];
        return {
          model: model,
          affine: { x0: X - i0 * sx, y0: Y + j0 * sy, dx: sx, dy: sy, rotated: false },
        };
      }
      return { model: model, affine: null };
    }

    /* ══ 4 · THE DECOMPRESSORS ═════════════════════════════════════════════════════════════════ */

    /* The TIFF/TIFF-Technote registry, by number. This is a table in the FORMAT — every entry is
       somebody's published assignment — and it exists so that a refusal can NAME what it met
       instead of handing back a bare integer (docs/GIS-CORE.md §2.2). */
    const COMPRESSION_NAMES = {
      1: 'none', 2: 'ccitt-rle', 3: 'ccitt-g3', 4: 'ccitt-g4', 5: 'lzw', 6: 'jpeg-old', 7: 'jpeg',
      8: 'deflate', 9: 'jbig-t85', 10: 'jbig-t43', 32766: 'next-rle', 32771: 'ccitt-rle-word',
      32773: 'packbits', 32809: 'thunderscan', 32946: 'deflate-old', 34676: 'sgi-log',
      34677: 'sgi-log24', 34712: 'jpeg2000', 34887: 'lerc', 34925: 'lzma', 50000: 'zstd',
      50001: 'webp', 50002: 'jpegxl',
    };
    const DEFLATE = [8, 32946];
    const SYNC_COMPRESSIONS = [1, 5, 32773];

    /* TIFF 6.0 §13, MSB-first, ClearCode 256, EoiCode 257, first free entry 258, early change: the
       code width grows when the next entry would fill the current width. */
    function lzwDecode(src, expected) {
      const out = new Uint8Array(expected);
      let o = 0;
      const dict = new Array(4096);
      let dictLen = 258, width = 9, prev = null;
      let acc = 0, nb = 0, p = 0;
      const next = () => {
        while (nb < width) {
          if (p >= src.length) return -1;
          acc = ((acc << 8) | src[p++]) >>> 0;
          nb += 8;
        }
        const v = (acc >>> (nb - width)) & ((1 << width) - 1);
        nb -= width;
        return v;
      };
      for (; ;) {
        const code = next();
        if (code < 0) break;
        if (code === 257) break;
        if (code === 256) { dictLen = 258; width = 9; prev = null; continue; }
        let entry;
        if (code < 256) entry = [code];
        else if (code < dictLen && dict[code]) entry = dict[code];
        else if (code === dictLen && prev) entry = prev.concat(prev[0]);
        else return raise('lzw-corrupt', { code: code, table: dictLen, at: p });
        if (o + entry.length > expected) return raise('lzw-corrupt', { overrun: o + entry.length, expected: expected });
        for (let i = 0; i < entry.length; i++) out[o++] = entry[i];
        if (prev) {
          dict[dictLen++] = prev.concat(entry[0]);
          if (dictLen === (1 << width) - 1 && width < 12) width++;
        }
        prev = entry;
      }
      if (o !== expected) return raise('chunk-short', { got: o, expected: expected, codec: 'lzw' });
      return out;
    }

    /* TIFF 6.0 §9: a signed count byte, then either n+1 literals or one byte repeated 1−n times.
       −128 is a no-op the specification defines. */
    function packBitsDecode(src, expected) {
      const out = new Uint8Array(expected);
      let o = 0, p = 0;
      while (p < src.length && o < expected) {
        let n = src[p++];
        if (n > 127) n -= 256;
        if (n >= 0) {
          const take = n + 1;
          if (p + take > src.length || o + take > expected) return raise('packbits-corrupt', { at: p, run: take, left: expected - o });
          for (let i = 0; i < take; i++) out[o++] = src[p++];
        } else if (n !== -128) {
          const take = 1 - n;
          if (p >= src.length || o + take > expected) return raise('packbits-corrupt', { at: p, run: take, left: expected - o });
          const b = src[p++];
          for (let i = 0; i < take; i++) out[o++] = b;
        }
      }
      if (o !== expected) return raise('chunk-short', { got: o, expected: expected, codec: 'packbits' });
      return out;
    }

    /* ⚠ ZLIB-WRAPPED, NOT RAW. TIFF compression 8 and 32946 are Adobe Deflate, which is a zlib
       stream — 'deflate' rather than the 'deflate-raw' js/atlas-attach.js uses for ZIP members. */
    async function inflate(src) {
      if (typeof DecompressionStream === 'undefined') return null;
      try {
        const st = new Blob([src]).stream().pipeThrough(new DecompressionStream('deflate'));
        return new Uint8Array(await new Response(st).arrayBuffer());
      } catch (_) { return null; }
    }

    /* ══ 5 · SAMPLES ═══════════════════════════════════════════════════════════════════════════ */

    function samplerFor(dv, le, bits, fmt) {
      if (fmt === 3) return bits === 32 ? (o) => dv.getFloat32(o, le) : (o) => dv.getFloat64(o, le);
      if (fmt === 2) {
        if (bits === 8) return (o) => dv.getInt8(o);
        if (bits === 16) return (o) => dv.getInt16(o, le);
        if (bits === 32) return (o) => dv.getInt32(o, le);
        return (o) => Number(dv.getBigInt64(o, le));
      }
      if (bits === 8) return (o) => dv.getUint8(o);
      if (bits === 16) return (o) => dv.getUint16(o, le);
      if (bits === 32) return (o) => dv.getUint32(o, le);
      return (o) => Number(dv.getBigUint64(o, le));
    }

    /* Predictor 2 (TIFF 6.0 §14): each sample is stored as its difference from the sample one
       PIXEL to its left, per row, per sample — so the stride is samplesPerPixel and the wrap is the
       sample's own width. The row width is the CHUNK's, which for a tile is the padded tile width
       and not the image width. */
    function unpredict(raw, dv, le, bits, spp, rows, chunkWidth) {
      const bytes = bits >> 3;
      const rowSamples = chunkWidth * spp;
      const rowBytes = rowSamples * bytes;
      for (let r = 0; r < rows; r++) {
        const base = r * rowBytes;
        for (let i = spp; i < rowSamples; i++) {
          const o = base + i * bytes, q = base + (i - spp) * bytes;
          if (bits === 8) raw[o] = (raw[o] + raw[q]) & 0xff;
          else if (bits === 16) dv.setUint16(o, (dv.getUint16(o, le) + dv.getUint16(q, le)) & 0xffff, le);
          else dv.setUint32(o, (dv.getUint32(o, le) + dv.getUint32(q, le)) >>> 0, le);
        }
      }
    }

    /* ══ 6 · WHAT THE FILE SAYS ITS BANDS ARE ══════════════════════════════════════════════════ */

    /* GDAL writes band descriptions and units into tag 42112 as a small XML document. Read when it
       is there, `null` when it is not — the alternative is a band called 「band1」 that claims to be
       the file's own word for it (the shape .agents/rules/... and #R730 keep recording). */
    function gdalMetadata(tags, count) {
      const out = [];
      for (let i = 0; i < count; i++) out.push({ name: null, unit: null });
      const f = tags.get(T.GDAL_METADATA);
      const xml = f && typeof f.ascii === 'string' ? f.ascii : '';
      if (!xml) return out;
      const re = /<Item\b([^>]*)>([\s\S]*?)<\/Item>/g;
      let m;
      while ((m = re.exec(xml))) {
        const attrs = m[1], body = m[2].trim();
        const nameAt = /\bname\s*=\s*"([^"]*)"/i.exec(attrs);
        const sampleAt = /\bsample\s*=\s*"(\d+)"/i.exec(attrs);
        if (!nameAt || !sampleAt) continue;
        const i = Number(sampleAt[1]);
        if (!(i >= 0 && i < count)) continue;
        const key = nameAt[1].toUpperCase();
        if (key === 'DESCRIPTION' && body) out[i].name = body;
        else if (key === 'UNITTYPE' && body) out[i].unit = body;
      }
      return out;
    }

    /* ══ 7 · THE ONE QUESTION A CALLER ASKS ════════════════════════════════════════════════════ */

    async function read(bytes, opts) {
      const u = u8of(bytes);
      if (!u || u.length < 8) return bad('not-tiff', { bytes: u ? u.length : 0 });
      if (!sniff(u)) return bad('not-tiff', { head: Array.from(u.subarray(0, 4)) });
      const ctx = ctxOf(opts);
      const le = u[0] === 0x49;
      const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
      const len = u.byteLength;

      const magic = dv.getUint16(2, le);
      if (magic === 43) return bad('bigtiff-unsupported', { magic: 43, byteOrder: le ? 'II' : 'MM' });
      if (magic !== 42) return bad('not-tiff', { magic: magic });

      /* ⚠ THE FIRST IFD IS THE FULL-RESOLUTION IMAGE. A COG's later IFDs are its overviews (and
         sometimes a mask), and reading one of them because it came last would answer a question
         about resolution that the caller never asked. The chain is still walked — to COUNT — and
         the walk remembers where it has been, because a file whose `next` points backwards is a
         loop and not a longer file. */
      const first = readIfd(dv, le, dv.getUint32(4, le), len);
      if (first.truncated) return bad('tiff-truncated', { ifd: first.at, tag: first.tag || null });
      const seen = new Set([dv.getUint32(4, le)]);
      let ifds = 1, overviews = 0, at = first.next;
      while (at && !seen.has(at)) {
        seen.add(at);
        const nx = readIfd(dv, le, at, len);
        if (nx.truncated) break;                               /* a short tail does not invalidate IFD 0 */
        ifds++;
        const sub = one(nx.tags.get(T.NEW_SUBFILE), 0);
        if (sub & 1) overviews++;                              /* bit 0 = reduced-resolution image */
        at = nx.next;
      }

      const tags = first.tags;
      const width = one(tags.get(T.WIDTH), 0);
      const height = one(tags.get(T.HEIGHT), 0);
      if (!(width > 0) || !(height > 0) || width !== Math.floor(width) || height !== Math.floor(height)) {
        return bad('tiff-corrupt', { missing: 'dimensions', width: width, height: height });
      }

      const spp = one(tags.get(T.SAMPLES), 1);
      if (!(spp >= 1)) return bad('tiff-corrupt', { samplesPerPixel: spp });

      /* ⚠ ONE COUNT PER SAMPLE MEANS ONE COUNT PER SAMPLE. A BitsPerSample of length 1 on a
         three-sample file is TIFF's own shorthand; a length that is neither 1 nor spp is the file
         contradicting itself. */
      const bitsField = tags.get(T.BITS);
      const bitsList = bitsField ? bitsField.values : [1];
      if (bitsList.length !== 1 && bitsList.length !== spp) return bad('tiff-corrupt', { bitsPerSample: bitsList.length, samples: spp });
      const bits = bitsList[0];
      for (const b of bitsList) if (b !== bits) return bad('bits-unsupported', { bitsPerSample: bitsList.slice(), reason: 'unequal' });
      if (!(bits === 8 || bits === 16 || bits === 32 || bits === 64)) return bad('bits-unsupported', { bits: bits });

      const fmtField = tags.get(T.SAMPLE_FORMAT);
      const fmtList = fmtField ? fmtField.values : [1];
      const fmt = fmtList.length ? fmtList[0] : 1;
      for (const f of fmtList) if (f !== fmt) return bad('sample-format-unsupported', { sampleFormat: fmtList.slice(), reason: 'unequal' });
      if (fmt !== 1 && fmt !== 2 && fmt !== 3) return bad('sample-format-unsupported', { sampleFormat: fmt });
      if (fmt === 3 && !(bits === 32 || bits === 64)) return bad('sample-format-unsupported', { sampleFormat: 3, bits: bits });

      const planar = one(tags.get(T.PLANAR), 1);
      /* ⚠ REFUSED BY NAME rather than read as chunky. PlanarConfiguration 2 stores each sample in
         its own plane of strips, so reading it with the chunky stride would return one band's
         pixels labelled as another's — a wrong answer that no later check can see. */
      if (planar !== 1) return bad('planar-separate-unsupported', { planarConfiguration: planar });

      const compression = one(tags.get(T.COMPRESSION), 1);
      if (compression === 6 || compression === 7) return bad('jpeg-in-tiff-unsupported', { compression: compression, name: COMPRESSION_NAMES[compression] });
      if (DEFLATE.indexOf(compression) < 0 && SYNC_COMPRESSIONS.indexOf(compression) < 0) {
        return bad('compression-unsupported', { compression: compression, name: COMPRESSION_NAMES[compression] || null });
      }

      const predictor = one(tags.get(T.PREDICTOR), 1);
      if (predictor !== 1 && predictor !== 2) return bad('predictor-unsupported', { predictor: predictor });
      /* Horizontal differencing on 64-bit samples would have to wrap in a 64-bit integer domain
         this reader does not carry; predictor 3 is the floating-point one and is a different
         algorithm altogether (byte-plane shuffling). Both are named rather than approximated. */
      if (predictor === 2 && bits === 64) return bad('predictor-unsupported', { predictor: 2, bits: 64 });

      /* ── the chunk table ────────────────────────────────────────────────────────────────── */
      const tileW = one(tags.get(T.TILE_WIDTH), 0);
      const tileH = one(tags.get(T.TILE_HEIGHT), 0);
      const tiled = !!(tileW > 0 && tileH > 0 && tags.get(T.TILE_OFFSETS));
      const offsets = tiled ? tags.get(T.TILE_OFFSETS) : tags.get(T.STRIP_OFFSETS);
      const counts = tiled ? tags.get(T.TILE_COUNTS) : tags.get(T.STRIP_COUNTS);
      if (!offsets || !counts) return bad('tiff-corrupt', { missing: tiled ? 'tile-table' : 'strip-table' });
      if (offsets.values.length !== counts.values.length) {
        return bad('tiff-corrupt', { offsets: offsets.values.length, byteCounts: counts.values.length });
      }
      const bytesPer = bits >> 3;
      const rps = tiled ? 0 : one(tags.get(T.ROWS_PER_STRIP), height);
      if (!tiled && !(rps > 0)) return bad('tiff-corrupt', { rowsPerStrip: rps });

      const across = tiled ? Math.ceil(width / tileW) : 1;
      const down = tiled ? Math.ceil(height / tileH) : Math.ceil(height / rps);
      const expectedChunks = across * down;
      if (offsets.values.length !== expectedChunks) {
        return bad('tiff-corrupt', { chunks: offsets.values.length, expected: expectedChunks, layout: tiled ? 'tile' : 'strip' });
      }
      for (let i = 0; i < expectedChunks; i++) {
        const o = offsets.values[i], n = counts.values[i];
        if (!(o >= 0) || !(n >= 0) || o + n > len) return bad('tiff-truncated', { chunk: i, at: o, need: n, have: len });
      }

      /* ── where the pixels are on the earth ───────────────────────────────────────────────── */
      const geo = georef(tags);
      if (!geo.affine) return bad('no-georeference', { tiepoint: !!tags.get(T.TIEPOINT), pixelScale: !!tags.get(T.PIXEL_SCALE), transform: !!tags.get(T.TRANSFORM) });
      const A = geo.affine;
      if (!(A.dx > 0) || !(A.dy > 0) || !isFinite(A.x0) || !isFinite(A.y0)) {
        return bad('grid-degenerate', { x0: A.x0, y0: A.y0, dx: A.dx, dy: A.dy });
      }
      const keys = geoKeys(tags);
      const crs = crsFromKeys(keys);
      geo.model.rasterType = crs.rasterType;

      /* ── the bands ───────────────────────────────────────────────────────────────────────── */
      const nodataField = tags.get(T.GDAL_NODATA);
      let nodata = null;
      if (nodataField && typeof nodataField.ascii === 'string' && nodataField.ascii.trim()) {
        const t = nodataField.ascii.trim();
        /* ⚠ A nodata field that is not a number is not a nodata value. Coercing it (Number('') is
           0, Number('none') is NaN) would either mask real zeros or mark every missing pixel by
           accident — both are the 「欠損を 0 で埋める」 defect docs/GIS-CORE.md §1.4 took out,
           read from the other end. */
        if (/^nan$/i.test(t)) nodata = NaN;
        else { const n = Number(t); if (isFinite(n)) nodata = n; }
      }
      const meta = gdalMetadata(tags, spp);
      const bands = [];
      for (let i = 0; i < spp; i++) {
        bands.push({ name: meta[i].name, unit: meta[i].unit, nodata: nodata, sampleFormat: fmt === 3 ? 'float' : (fmt === 2 ? 'int' : 'uint'), bits: bits });
      }

      /* ── Deflate, and only Deflate, is inflated now (see the header) ─────────────────────── */
      const isDeflate = DEFLATE.indexOf(compression) >= 0;
      let inflated = null;
      if (isDeflate) {
        if (typeof DecompressionStream === 'undefined') return bad('deflate-unavailable', { compression: compression });
        inflated = new Array(expectedChunks);
        for (let i = 0; i < expectedChunks; i++) {
          const src = u.subarray(offsets.values[i], offsets.values[i] + counts.values[i]);
          const outBytes = await inflate(src);
          if (!outBytes) return bad('tiff-corrupt', { chunk: i, codec: 'deflate' });
          inflated[i] = outBytes;
          if (!(await ctx.tick(1, expectedChunks))) return bad('cancelled', { done: ctx.done(), total: expectedChunks });
        }
      }

      /* ── the door ────────────────────────────────────────────────────────────────────────── */

      /* One chunk's geometry: where it sits in the image, how wide its stored rows are, and how
         many bytes it must decompress to. Tiles are PADDED to the full tile in both axes, strips
         are not — that difference is the whole of what 'strip' and 'tile' mean here. */
      function chunkAt(i) {
        if (tiled) {
          const cx = i % across, cy = Math.floor(i / across);
          return {
            x0: cx * tileW, y0: cy * tileH, rows: tileH, chunkWidth: tileW,
            cols: Math.min(tileW, width - cx * tileW),
            validRows: Math.min(tileH, height - cy * tileH),
            expected: tileW * tileH * spp * bytesPer,
          };
        }
        const y0 = i * rps;
        const rows = Math.min(rps, height - y0);
        return { x0: 0, y0: y0, rows: rows, chunkWidth: width, cols: width, validRows: rows, expected: rows * width * spp * bytesPer };
      }

      function chunkBytes(i, plan) {
        if (inflated) {
          const got = inflated[i];
          if (got.length < plan.expected) return raise('chunk-short', { chunk: i, got: got.length, expected: plan.expected, codec: 'deflate' });
          /* ⚠ COPIED for the same reason as the uncompressed branch, and for one more: these bytes
             are KEPT (the inflate happened at open), so undoing the predictor in place would leave
             the second read(i) differencing an already-differenced buffer. */
          return got.slice(0, plan.expected);
        }
        const src = u.subarray(offsets.values[i], offsets.values[i] + counts.values[i]);
        if (compression === 1) {
          if (src.length < plan.expected) return raise('chunk-short', { chunk: i, got: src.length, expected: plan.expected, codec: 'none' });
          /* ⚠ COPIED, not aliased: the predictor rewrites the buffer in place, and doing that to a
             view of the caller's bytes would edit the file the caller still holds. */
          return src.slice(0, plan.expected);
        }
        if (compression === 5) return lzwDecode(src, plan.expected);
        return packBitsDecode(src, plan.expected);
      }

      function readBand(bandIndex) {
        const b = (typeof bandIndex === 'number' && isFinite(bandIndex)) ? Math.floor(bandIndex) : 0;
        if (!(b >= 0 && b < spp)) return raise('band-out-of-range', { band: bandIndex, bands: spp });
        const out = new Float64Array(width * height);
        const nd = nodata;
        const hasNd = nd !== null && !Number.isNaN(nd);
        for (let i = 0; i < expectedChunks; i++) {
          const plan = chunkAt(i);
          if (plan.validRows <= 0 || plan.cols <= 0) continue;
          const raw = chunkBytes(i, plan);
          const rdv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
          if (predictor === 2) unpredict(raw, rdv, le, bits, spp, plan.rows, plan.chunkWidth);
          const sample = samplerFor(rdv, le, bits, fmt);
          for (let r = 0; r < plan.validRows; r++) {
            const rowBase = r * plan.chunkWidth * spp;
            const dstBase = (plan.y0 + r) * width + plan.x0;
            for (let c = 0; c < plan.cols; c++) {
              const v = sample(((rowBase + c * spp) + b) * bytesPer);
              /* ⚠ MISSING IS NaN (docs/GIS-CORE.md §1.4). Not zero, which is a sea-level elevation
                 and a month with no rain. */
              out[dstBase + c] = (hasNd && v === nd) ? NaN : v;
            }
          }
        }
        return out;
      }

      const grid = {
        width: width, height: height,
        bands: bands,
        crs: crs.crs, crsText: crs.crsText,
        model: geo.model,
        affine: A,
        layout: tiled ? 'tile' : 'strip',
        compression: COMPRESSION_NAMES[compression] || String(compression),
        predictor: predictor,
        planarConfig: planar,
        photometric: one(tags.get(T.PHOTOMETRIC), null),
        tile: tiled ? { width: tileW, height: tileH } : null,
        rowsPerStrip: tiled ? null : rps,
        chunks: expectedChunks,
        ifds: ifds,
        overviews: overviews,
        read: readBand,
      };
      return { ok: true, grid: grid };
    }

    const API = { sniff, read, refusals: () => REFUSALS.slice() };
    try { window.IntMapGisGeotiff = API; } catch (_) { }
    return API;
  })();
}
