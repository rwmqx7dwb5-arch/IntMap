/* ============================================================================
 *  IntMap · scripts/boot-icon-flatten.mjs — the launch mark's field IS the screen (#R231)
 * ----------------------------------------------------------------------------
 *  「ダークモード時に、ローディング画面のIntMapのアイコンの背景が、ローディング画面の背景の黒に
 *    微妙に合っていないから、アイコン背景を画面背景の色に合わせて。」
 *
 *  #R206 answered the LIGHT half of this same report and left the dark half standing, because on a
 *  white launch screen the mismatch was obvious and on a black one it is three units of blue:
 *
 *      IntMap.Icon.png            field measured at (1,2,6)…(2,2,7)   ← the mark ships on near-black
 *      the dark launch screen     --bg-color  #000000                 ← css/intmap.css :root[dark]
 *
 *  Three units is exactly the size of thing that reads as "a tile" rather than as "a mark floating on
 *  the screen" — it is a 384 px rounded square whose inside is very slightly lighter than the field it
 *  sits in, which is what the report describes.
 *
 *  ══ WHAT THIS DOES TO A PIXEL ═══════════════════════════════════════════════════════════════════
 *  The picture is a mark composited onto a flat near-black field F. Undoing that composite means
 *  subtracting F in proportion to how much of the pixel is FIELD rather than MARK:
 *
 *      L    = clamp( (max(r,g,b) − maxF) / (255 − maxF), 0, 1 )      how much mark is in this pixel
 *      out  = round( src − F·(1 − L) )                               …and F is removed in that ratio
 *
 *  · a pixel that is pure field (max ≤ maxF) has L = 0 and is written as exact #000000;
 *  · a pixel that is pure mark has L = 1 and comes out BYTE-IDENTICAL — the brand blue and the white
 *    word-mark do not move, which is the property #R206 also required;
 *  · the anti-aliased edge in between fades to the screen's black instead of leaving a lighter halo,
 *    which is the whole reason a per-pixel pass is needed rather than a CSS colour underneath.
 *
 *  ⚠ IT IS IDEMPOTENT. After a run F is (0,0,0), so `src − 0·(1−L)` is the identity and running it
 *  again changes nothing. tests/r231-checks.test.mjs asserts the shipped file's property directly
 *  (its border pixels ARE #000000) rather than re-running the encoder, because a byte comparison
 *  would be asserting the zlib version rather than the picture.
 *
 *      node scripts/boot-icon-flatten.mjs [--check]
 * ==========================================================================*/
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* the dark launch screen's colour, and the file that has to end up wearing it */
const TARGET = { file: 'IntMap.Icon.png', bg: [0, 0, 0] };

/* ── the same minimal PNG reader/writer the data build scripts use (scripts/build-vs30.mjs) ───── */
function pngDecode(buf) {
  if (!(buf[0] === 0x89 && buf[1] === 0x50)) throw new Error('not a PNG');
  let i = 8, w = 0, h = 0, bitDepth = 0, colour = -1, interlace = 0;
  const idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i), type = buf.toString('ascii', i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colour = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    i += 12 + len;
  }
  if (bitDepth !== 8 || (colour !== 2 && colour !== 6) || interlace !== 0)
    throw new Error('unsupported PNG (depth ' + bitDepth + ' colour ' + colour + ' interlace ' + interlace + ')');
  const bpp = colour === 2 ? 3 : 4;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    const row = raw.subarray(p, p + stride); p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev ? prev[x] : 0, c = (prev && x >= bpp) ? prev[x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 255;
    }
  }
  return { w, h, bpp, data: out };
}
const CRC_T = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
  return t;
})();
function crc32(b) { let c = -1; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
/* 8-bit TRUECOLOUR (colour type 2), filter Up — the mark is mostly flat field, so the row above is
   almost always the best predictor and the file stays about the size it arrived at. */
function pngRGB(px, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (w * 3 + 1);
    raw[o] = 2;
    for (let x = 0; x < w * 3; x++) {
      const cur = px[y * w * 3 + x], up = y > 0 ? px[(y - 1) * w * 3 + x] : 0;
      raw[o + 1 + x] = (cur - up) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* The field, MEASURED rather than assumed, from the outermost ring:
     · `F`    the per-channel MEDIAN — the colour to subtract. A median (not a mean) so that a mark
              which happens to touch the edge cannot drag it.
     · `maxF` the CEILING of the field, taken at the ring's 99.5th percentile rather than at
              max(F). ⚠ THIS IS THE PART THAT HAS TO BE MEASURED AND NOT DERIVED: the shipped field
              is DITHERED — (1,2,6) 31 %, (2,2,6) 20 %, (2,2,7) 9 %, (1,1,6) 6 % — so a ceiling of
              max(F)=6 leaves every 7-valued pixel one unit above the screen, which is 20 % of the
              picture keeping a residue of exactly the thing this script exists to remove. The
              percentile (not the maximum) so one stray bright pixel in the ring cannot raise the
              black point into the mark. */
function fieldColour(im, ring = 3) {
  const { w, h, bpp, data } = im;
  const ch = [[], [], []];
  const push = (x, y) => { const o = (y * w + x) * bpp; for (let c = 0; c < 3; c++) ch[c].push(data[o + c]); };
  for (let y = 0; y < ring; y++) for (let x = 0; x < w; x++) { push(x, y); push(x, h - 1 - y); }
  for (let x = 0; x < ring; x++) for (let y = ring; y < h - ring; y++) { push(x, y); push(w - 1 - x, y); }
  ch.forEach((a) => a.sort((p, q) => p - q));
  const F = ch.map((a) => a[a.length >> 1]);
  const ceil = Math.max(...ch.map((a) => a[Math.min(a.length - 1, Math.floor(a.length * 0.995))]));
  return { F, maxF: Math.max(ceil, Math.max(F[0], F[1], F[2])) };
}

function flatten(im, bg) {
  const { w, h, bpp, data } = im;
  const { F, maxF } = fieldColour(im);
  const out = Buffer.alloc(w * h * 3);
  let moved = 0;
  const span = Math.max(1, 255 - maxF);
  for (let i = 0, o = 0; i < w * h; i++, o += 3) {
    const s = i * bpp;
    const r = data[s], g = data[s + 1], b = data[s + 2];
    const L = Math.max(0, Math.min(1, (Math.max(r, g, b) - maxF) / span));
    const src = [r, g, b];
    for (let c = 0; c < 3; c++) {
      const v = (L <= 0) ? bg[c] : Math.max(0, Math.min(255, Math.round(src[c] - (F[c] - bg[c]) * (1 - L))));
      if (v !== src[c]) moved++;
      out[o + c] = v;
    }
  }
  return { px: out, F, maxF, moved };
}

const file = path.join(ROOT, TARGET.file);
const im = pngDecode(fs.readFileSync(file));
const { px, F, maxF, moved } = flatten(im, TARGET.bg);
const check = process.argv.includes('--check');
console.log(`${TARGET.file}  ${im.w}×${im.h}  field measured (${F.join(',')})  →  (${TARGET.bg.join(',')})  · ${moved} channel values moved`);
if (check) {
  const already = F[0] === TARGET.bg[0] && F[1] === TARGET.bg[1] && F[2] === TARGET.bg[2];
  console.log(already ? 'OK — the shipped mark already wears the screen colour' : 'STALE — run without --check');
  process.exit(already ? 0 : 1);
}
if (F[0] === TARGET.bg[0] && F[1] === TARGET.bg[1] && F[2] === TARGET.bg[2]) {
  console.log('nothing to do — already flattened onto the screen colour (this script is idempotent)');
} else {
  fs.writeFileSync(file, pngRGB(px, im.w, im.h));
  console.log(`wrote ${TARGET.file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB, maxF ${maxF})`);
}
