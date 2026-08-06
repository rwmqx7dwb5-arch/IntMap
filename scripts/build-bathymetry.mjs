#!/usr/bin/env node
/* ============================================================================
 *  IntMap · BUILD THE WHOLE-EARTH SEA FLOOR  (#R197)
 * ----------------------------------------------------------------------------
 *  「津波シミュレータのシミュレート範囲は全球に。また、精度と忠実性を根本的に大幅に強化して。」
 *
 *  A GLOBAL shallow-water model needs a depth for every cell on the planet, at once, before the
 *  first time step. Up to #R196 the tsunami module got its sea floor by warming DEM TILES around
 *  the epicentre — a box, one zoom, a tile budget of ninety, and #R192 measured 19 % of the cells
 *  falling back to a constant because the tiles did not arrive inside the timeout. A global domain
 *  cannot be built that way: at the terrarium zoom that resolves a 0.25° cell it is 1,024 tiles,
 *  ~60 MB, on the user's connection, every time the button is pressed — and any tile that fails is
 *  a hole in the ocean the wave then reflects off.
 *
 *  So the sea floor ships with the app, as one image, built here:
 *
 *      data/bathymetry.png   1440 × 720 (0.25°), RGB-8, no alpha
 *                            R,G = mean depth of the cell's SEA samples, metres, big-endian
 *                            B   = the cell's sea fraction × 255
 *      data/bathymetry.json  the manifest (source, zoom, coverage, build time)
 *
 *  ── WHY MEAN-DEPTH-OF-THE-SEA-PART, AND A SEPARATE SEA FRACTION ────────────────────────────────
 *  A 0.25° cell on a coast is part land. Averaging its elevation over the whole cell gives a depth
 *  that belongs to neither: too shallow for the water and above sea level for the land, and the
 *  long-wave celerity √(gh) is then wrong exactly where the wave is doing the most. Storing the two
 *  facts separately lets the solver ask the two different questions it actually has — "is there sea
 *  here?" (the fraction) and "how deep is that sea?" (the mean over the wet samples).
 *
 *  ── WHY RGB AND NOT 16-BIT GREY ────────────────────────────────────────────────────────────────
 *  A 16-bit PNG drawn into a canvas comes back 8-bit: the browser down-converts it and the low byte
 *  is gone. Two 8-bit channels survive `drawImage` + `getImageData` byte-exact, which is the same
 *  reason the terrarium tiles this is built from are encoded that way.
 *
 *  ── SOURCE ─────────────────────────────────────────────────────────────────────────────────────
 *  The AWS Terrain Tiles ("terrarium") public dataset — the SAME elevation source the app already
 *  uses everywhere else and already attributes (js/reference-data.js). Its ocean comes from ETOPO1,
 *  its land from SRTM/GMTED/NED. Read at z5 (8192 × 8192 over the Mercator world, ~4.9 km a pixel
 *  at the equator), so each 0.25° output cell is the mean of about thirty measured samples.
 *
 *  ⚠ MERCATOR STOPS AT ±85.051°. Rows outside that come back with zero sea fraction — a wall. The
 *  solver's domain is ±80° for its own reasons (see src/tsunami-worker.js), so nothing that is
 *  modelled is affected, but the manifest says so rather than leaving it to be discovered.
 *
 *    node scripts/build-bathymetry.mjs [--zoom 5] [--width 1440]
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };

const Z = Number(arg('zoom', 5));
const W = Number(arg('width', 1440));
const H = W / 2;
const CONC = Number(arg('concurrency', 12));
const HOSTS = [
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium',
  'https://elevation-tiles-prod.s3.amazonaws.com/terrarium',
  'https://elevation-tiles-prod.s3.dualstack.us-east-1.amazonaws.com/terrarium',
  'https://elevation-tiles-prod.s3.us-east-1.amazonaws.com/terrarium'
];

/* ── a minimal PNG reader: 8-bit RGB / RGBA, non-interlaced (what terrarium serves) ──────────── */
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
      else if (f === 4) {                                        /* Paeth */
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 255;
    }
  }
  return { w, h, bpp, data: out };
}

/* ── a minimal 8-bit RGB PNG writer ─────────────────────────────────────────────────────────── */
const CRC_T = (() => { const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
  return t; })();
function crc32(b) { let c = -1; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function pngRGB(rgb, w, h) {
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1);
    raw[o] = 2;                                   /* filter Up — bathymetry varies slowly down a column */
    for (let x = 0; x < stride; x++) {
      const cur = rgb[y * stride + x], up = y > 0 ? rgb[(y - 1) * stride + x] : 0;
      raw[o + 1 + x] = (cur - up) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ── fetch one tile, trying the host aliases in turn ─────────────────────────────────────────── */
async function tile(z, x, y) {
  let lastErr = null;
  for (let a = 0; a < HOSTS.length; a++) {
    const url = HOSTS[(x + y + a) % HOSTS.length] + '/' + z + '/' + x + '/' + y + '.png';
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'IntMap/build-bathymetry (+https://github.com/rwmqx7dwb5-arch/IntMap)' } });
      if (!r.ok) { lastErr = new Error('HTTP ' + r.status); continue; }
      return pngDecode(Buffer.from(await r.arrayBuffer()));
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('unreachable');
}

const n = 1 << Z;
const sumDepth = new Float64Array(W * H);     /* Σ depth over SEA samples */
const nSea = new Uint32Array(W * H);
const nAll = new Uint32Array(W * H);
let done = 0, failed = 0;

/* Mercator pixel row → latitude, for the tile's own 256 rows */
const R2D = 180 / Math.PI;
function latOfMercY(gy, worldPx) {
  const t = Math.PI * (1 - 2 * gy / worldPx);
  return R2D * Math.atan(Math.sinh(t));
}

async function doTile(tx, ty) {
  let img = null;
  try { img = await tile(Z, tx, ty); }
  catch (e) { failed++; return; }
  const { w, h, bpp, data } = img;
  const worldPx = n * w;
  /* every source pixel's own lat/lon → the output cell it belongs to */
  for (let py = 0; py < h; py++) {
    const lat = latOfMercY(ty * h + py + 0.5, worldPx);
    let oj = Math.floor((90 - lat) / 180 * H);
    if (oj < 0) oj = 0; else if (oj >= H) oj = H - 1;
    const rowBase = oj * W;
    for (let px = 0; px < w; px++) {
      const lon = (tx * w + px + 0.5) / worldPx * 360 - 180;
      let oi = Math.floor((lon + 180) / 360 * W);
      if (oi < 0) oi = 0; else if (oi >= W) oi = W - 1;
      const o = (py * w + px) * bpp;
      const elev = (data[o] * 256 + data[o + 1] + data[o + 2] / 256) - 32768;
      const k = rowBase + oi;
      nAll[k]++;
      if (elev < 0) { nSea[k]++; sumDepth[k] += -elev; }
    }
  }
  done++;
  if (done % 64 === 0) process.stdout.write('  ' + done + '/' + (n * n) + ' tiles\n');
}

const jobs = [];
for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) jobs.push([tx, ty]);
process.stdout.write('terrarium z' + Z + ': ' + jobs.length + ' tiles → ' + W + '×' + H + ' (' + (360 / W).toFixed(3) + '°)\n');

let next = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  for (;;) { const k = next++; if (k >= jobs.length) return; await doTile(jobs[k][0], jobs[k][1]); }
}));
if (failed) { console.error(failed + ' tiles failed — refusing to ship a sea floor with holes in it'); process.exit(1); }

const rgb = Buffer.alloc(W * H * 3);
let seaCells = 0, covered = 0, maxDepth = 0;
for (let k = 0; k < W * H; k++) {
  const tot = nAll[k];
  if (tot) covered++;
  const frac = tot ? nSea[k] / tot : 0;
  const d = nSea[k] ? Math.round(sumDepth[k] / nSea[k]) : 0;
  const dq = Math.max(0, Math.min(65535, d));
  if (dq > maxDepth) maxDepth = dq;
  if (frac >= 0.5) seaCells++;
  rgb[k * 3] = dq >> 8; rgb[k * 3 + 1] = dq & 255; rgb[k * 3 + 2] = Math.round(frac * 255);
}
const buf = pngRGB(rgb, W, H);
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'bathymetry.png'), buf);
fs.writeFileSync(path.join(ROOT, 'data', 'bathymetry.json'), JSON.stringify({
  source: 'AWS Terrain Tiles (terrarium) — ETOPO1 bathymetry, SRTM/GMTED/NED topography',
  url: HOSTS[0] + '/{z}/{x}/{y}.png', zoom: Z,
  width: W, height: H, degrees: 360 / W,
  projection: 'equirectangular, -180..180 × 90..-90, pixel centres at (i+0.5), (j+0.5)',
  encoding: 'R*256+G = mean depth of the sea samples in the cell (metres, 0 = none); B = sea fraction × 255',
  mercatorLimitDeg: 85.0511, coveredRows: '±85.051° — rows outside carry sea fraction 0',
  cellsCoveredFraction: +(covered / (W * H)).toFixed(4),
  seaCellFraction: +(seaCells / (W * H)).toFixed(4),
  maxDepthM: maxDepth, bytes: buf.length, built: new Date().toISOString()
}, null, 2) + '\n');
process.stdout.write('wrote data/bathymetry.png — ' + (buf.length / 1024).toFixed(1) + ' KB · '
  + (100 * seaCells / (W * H)).toFixed(1) + ' % of cells are sea · deepest ' + maxDepth + ' m\n');
