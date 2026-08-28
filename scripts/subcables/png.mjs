/* ============================================================================
 *  IntMap · subcables — a minimal PNG reader for the terrarium DEM tiles
 * ----------------------------------------------------------------------------
 *  The same decoder scripts/build-bathymetry.mjs and scripts/build-vs30.mjs
 *  carry: 8-bit RGB/RGBA, non-interlaced, which is what the AWS Terrain Tiles
 *  ("terrarium") public dataset serves. Kept here as one copy so the sea-floor
 *  grid this pipeline needs does not add a THIRD hand-written PNG reader to the
 *  repository (AGENTS.md §9 — one canonical copy of a fact).
 * ==========================================================================*/
import zlib from 'node:zlib';

export function pngDecode(buf) {
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
      else if (f === 4) {                                        /* Paeth */
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 255;
    }
  }
  return { w, h, bpp, data: out };
}
