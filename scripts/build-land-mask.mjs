#!/usr/bin/env node
/* ============================================================================
 *  IntMap · BUILD THE WHOLE-EARTH LAND/SEA MASK  (#R192)
 * ----------------------------------------------------------------------------
 *  「震度分布の色塗りが、たまにバグって海もべた塗になる場合がある。」
 *
 *  The intensity field does not paint the sea — there is no site there, and a colour over open ocean
 *  is a statement about ground that is not there. Both halves of the field decided "is this land?"
 *  from the terrain TILES, and that is why the failure was intermittent: the far field read a z3 DEM
 *  and painted EVERY cell when fewer than half of those 64 tiles arrived (js/seismic.js buildFar),
 *  and the fine field painted any cell whose DEM was missing. A slow network, a cold cache or a
 *  tile-cache eviction therefore produced a solid rectangle of colour over the ocean — 「たまに」.
 *
 *  A land/sea test does not need elevations, only a sign, and it must not depend on the network at
 *  all. So the app ships one: a 1-bit equirectangular raster of the world's land, rasterised here
 *  from Natural Earth's public-domain 1:50m land polygons.
 *
 *  2048 × 1024 is 0.176° — about 19.5 km at the equator. That is finer than the far field's own
 *  52 km cell (768 columns of longitude) and finer than its 104 km cell on a phone, so the mask is
 *  never the thing that limits the picture. It packs to ~30 KB, which is a rounding error next to
 *  the 280 KB basemap already shipped, and it decodes to a 256 KB bitset in the browser.
 *
 *  SOURCE — Natural Earth 1:50m physical "land" (public domain, no permission required, no
 *  attribution required — attributed anyway in js/reference-data.js).
 *
 *  Output: data/land-mask.png  (1-bit greyscale: white = land, black = sea)
 *          data/land-mask.json (the manifest: source, size, build time, land fraction)
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = 2048, H = 1024;
const SRC = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_land.geojson';

/* ── the rasteriser ────────────────────────────────────────────────────────────────────────────
   Scanlines through each output row. For each polygon, every ring contributes its crossings of that
   latitude and the spans between alternate crossings are land — the even-odd rule, which is what
   makes a ring inside another ring a hole (the Caspian, the Great Lakes) without any special case.

   ⚠ THREE SCANLINES PER ROW, NOT ONE. A single line through the row's centre asks "is the middle of
   this pixel land?", and a 0.176° pixel is 19.6 km tall — big enough that the answer at its centre
   is not the answer for the pixel. Measured on the first build: TOKYO came back sea, because the
   centre latitude of its row (35.60°N) falls in Tokyo Bay while the rest of the pixel is the city.
   Sampling at ¼, ½ and ¾ of the row and taking the majority makes the pixel answer for the pixel,
   which is what a mask at this resolution is for. Verified after: Tokyo, Sendai, London, Mongolia,
   Sahara land; open Pacific sea. */
const SUB = [0.25, 0.5, 0.75];
function rasterise(features) {
  const hits = new Uint8Array(W * H);          /* how many sub-rows of this pixel are land */
  const polys = [];
  for (const f of features) {
    const g = f.geometry; if (!g) continue;
    if (g.type === 'Polygon') polys.push(g.coordinates);
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) polys.push(p);
  }
  /* bounding latitude per polygon, so a scanline only visits the polygons it can cross */
  const boxes = polys.map(rings => {
    let s = 90, n = -90;
    for (const r of rings) for (const p of r) { if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1]; }
    return { s, n };
  });
  const xs = [];
  const row = new Uint8Array(W);
  for (let j = 0; j < H; j++) {
    for (const frac of SUB) {
      const lat = 90 - (j + frac) * (180 / H);
      row.fill(0);
      for (let k = 0; k < polys.length; k++) {
        if (lat < boxes[k].s || lat > boxes[k].n) continue;
        xs.length = 0;
        for (const ring of polys[k]) {
          for (let i = 0, m = ring.length - 1; i < ring.length; m = i++) {
            const a = ring[m], b = ring[i];
            if ((a[1] > lat) === (b[1] > lat)) continue;           /* does not cross this latitude */
            xs.push(a[0] + (lat - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
          }
        }
        if (xs.length < 2) continue;
        xs.sort((p, q) => p - q);
        for (let i = 0; i + 1 < xs.length; i += 2) {
          let i0 = Math.round((xs[i] + 180) / 360 * W), i1 = Math.round((xs[i + 1] + 180) / 360 * W);
          if (i1 < i0) { const t = i0; i0 = i1; i1 = t; }
          i0 = Math.max(0, i0); i1 = Math.min(W, i1);
          /* a span thinner than one pixel still marks the pixel it falls in — an island narrower
             than 19 km is still land, and dropping it would punch a hole in the mask exactly where
             a coastal city sits */
          if (i1 === i0 && i0 < W) row[i0] = 1;
          for (let x = i0; x < i1; x++) row[x] = 1;
        }
      }
      for (let x = 0; x < W; x++) if (row[x]) hits[j * W + x]++;
    }
  }
  const bits = new Uint8Array(W * H);
  const need = Math.ceil(SUB.length / 2);      /* the majority of the pixel */
  for (let i = 0; i < bits.length; i++) bits[i] = (hits[i] >= need) ? 1 : 0;
  return bits;
}

/* ── a minimal 1-bit greyscale PNG ─────────────────────────────────────────────────────────────
   Bit depth 1, colour type 0, no palette: one bit per pixel is exactly what a land mask is, and it
   keeps the file at a size where shipping it is obviously cheaper than asking a server. */
const CRC_T = (() => { const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
  return t; })();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function png1bit(bits) {
  const rowBytes = W >> 3;
  const raw = Buffer.alloc((rowBytes + 1) * H);
  for (let j = 0; j < H; j++) {
    const o = j * (rowBytes + 1); raw[o] = 0;                       /* filter: none */
    for (let x = 0; x < W; x++) if (bits[j * W + x]) raw[o + 1 + (x >> 3)] |= (0x80 >> (x & 7));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 1; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const url = process.argv[2] || SRC;
process.stdout.write('fetching ' + url + '\n');
const r = await fetch(url);
if (!r.ok) { console.error('land polygons: HTTP ' + r.status); process.exit(1); }
const gj = await r.json();
const feats = gj.features || [];
process.stdout.write('rasterising ' + feats.length + ' land features at ' + W + '×' + H + '\n');
const bits = rasterise(feats);
let land = 0; for (let i = 0; i < bits.length; i++) if (bits[i]) land++;
const buf = png1bit(bits);
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'land-mask.png'), buf);
const manifest = { source: 'Natural Earth 1:50m physical — land (public domain)', url,
  width: W, height: H, projection: 'equirectangular, -180..180 × 90..-90',
  bits: '1 = land, 0 = sea', landFraction: +(land / bits.length).toFixed(4), bytes: buf.length,
  built: new Date().toISOString() };
fs.writeFileSync(path.join(ROOT, 'data', 'land-mask.json'), JSON.stringify(manifest, null, 2) + '\n');
/* Earth is 29.2 % land, but this raster is equirectangular — the polar rows are stretched, so the
   expected PIXEL fraction is higher than the area fraction. Printed rather than asserted. */
process.stdout.write('wrote data/land-mask.png — ' + (buf.length / 1024).toFixed(1) + ' KB, '
  + (100 * land / bits.length).toFixed(1) + ' % of pixels are land\n');
