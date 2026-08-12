#!/usr/bin/env node
/* ============================================================================
 *  IntMap · BUILD THE WHOLE-EARTH SITE TERM  (#R223)
 * ----------------------------------------------------------------------------
 *  「震度分布が同心円状になることがある。ふざけるな。」 (third round of this report)
 *
 *  An intensity field is a distance law times a SITE TERM. When the site term is the same
 *  everywhere, the intensity is a function of distance alone — which is drawn as perfect concentric
 *  rings. #R216 and #R221 each closed one door onto that fallback (the slope-baseline give-up, and
 *  the field evicting its own DEM tiles). Two doors are still open and neither can be closed by
 *  fetching more tiles at run time:
 *
 *    ① THE FAR FIELD HAS NO TERRAIN AT ALL. Past 1,500 km js/seismic.js paints a whole-world raster
 *       whose cell is ~28 km, with no DEM behind it, so every cell there takes the panel's single
 *       site class. For an M8+ that annulus is most of the picture — and it is rings, by
 *       construction, exactly as reported.
 *    ② A CELL WHOSE DEM TILE NEVER ARRIVED takes the same single class. A cold cache, a slow radio
 *       or a blocked tile host turns part of the fine field into rings too (the 「一部は」 case).
 *
 *  So the site term SHIPS WITH THE APP, the way the sea floor (#R197) and the land mask (#R192) do:
 *
 *      data/vs30.png    1440 × 720 (0.25°), 8-bit GREYSCALE, no alpha
 *                       0   = no land sampled in this cell (sea, or outside Mercator)
 *                       1…255 = mean Vs30 over the cell's LAND samples, linear over 150…1500 m/s
 *      data/vs30.json   the manifest (source, zoom, sample spacing, coverage, build time)
 *
 *  ── HOW THE NUMBER IS MADE, AND WHY AT THIS ZOOM ───────────────────────────────────────────────
 *  Wald & Allen (2007) — the USGS's own global Vs30 proxy, the active-tectonic table — reads Vs30
 *  off the TOPOGRAPHIC SLOPE, regressed at 30 arc-seconds (~900 m). js/seismic.js already applies
 *  exactly that table (`vs30FromSlope`) and already refuses to use a slope measured over a spacing
 *  coarser than 2 km, because a flattened gradient is a small slope, a small slope is the softest
 *  bin, and the softest bin is the largest amplification — a bias, not noise (#R190).
 *
 *  This build therefore reads terrarium at **z7**, whose pixel is 40075·cosφ/(2⁷·256) = 1,223 m at
 *  the equator and FINER toward the poles — inside that 2 km rule everywhere, and within a third of
 *  a stop of the scale the proxy was regressed at. The slope is a central difference over the
 *  tile's own pixels (one-sided on the 1-pixel tile border, which is 0.4 % of the samples and is
 *  averaged into 28 km cells afterwards).
 *
 *  ⚠ THE AVERAGE IS OVER Vs30, NOT OVER SLOPE. Averaging the slope first and converting once would
 *  be the same flattening this build exists to avoid; converting each 1.2 km sample and averaging
 *  the RESULT is the mean amplification of the cell, which is what a 28 km cell needs.
 *  ⚠ ONLY LAND SAMPLES COUNT (elevation > 0, or > −440 m where the bundled land mask says land —
 *  the Dead Sea shore, the Netherlands, the Caspian Depression: #R212's list). A cell with no land
 *  sample writes 0 and the app falls back to what it does today.
 *
 *  ── WHAT IS FETCHED ────────────────────────────────────────────────────────────────────────────
 *  16,384 tiles cover the world at z7 and roughly two thirds of them are open ocean. The build
 *  reads data/bathymetry.png (already shipped, 0.25°, B = sea fraction × 255) and SKIPS a tile
 *  whose whole footprint — plus a one-cell margin — is sea. That is the same public dataset, the
 *  same attribution, and about a third of the bytes.
 *
 *    node scripts/build-vs30.mjs [--zoom 7] [--width 1440] [--concurrency 16]
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };

const Z = Number(arg('zoom', 7));
const W = Number(arg('width', 1440));
const H = W / 2;
const CONC = Number(arg('concurrency', 16));
const HOSTS = [
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium',
  'https://elevation-tiles-prod.s3.amazonaws.com/terrarium',
  'https://elevation-tiles-prod.s3.dualstack.us-east-1.amazonaws.com/terrarium',
  'https://elevation-tiles-prod.s3.us-east-1.amazonaws.com/terrarium'
];

/* ── the same minimal PNG reader/writer as scripts/build-bathymetry.mjs ──────────────────────── */
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
/* 8-bit GREYSCALE (colour type 0) — one byte a cell, which is all this carries */
function pngGrey(g, w, h) {
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (w + 1);
    raw[o] = 1;                                   /* filter Sub — Vs30 varies along a row */
    for (let x = 0; x < w; x++) {
      const cur = g[y * w + x], left = x > 0 ? g[y * w + x - 1] : 0;
      raw[o + 1 + x] = (cur - left) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

async function tile(z, x, y) {
  let lastErr = null;
  for (let a = 0; a < HOSTS.length * 2; a++) {
    const url = HOSTS[(x + y + a) % HOSTS.length] + '/' + z + '/' + x + '/' + y + '.png';
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'IntMap/build-vs30 (+https://github.com/rwmqx7dwb5-arch/IntMap)' } });
      if (r.status === 403 || r.status === 404) return null;      /* terrarium has no tile here */
      if (!r.ok) { lastErr = new Error('HTTP ' + r.status); continue; }
      return pngDecode(Buffer.from(await r.arrayBuffer()));
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('unreachable');
}

/* ── the Wald & Allen (2007) active-tectonic table, byte-for-byte the one js/seismic.js uses ──── */
const VS30_BINS = [[1e-4, 180], [2.2e-3, 240], [6.3e-3, 300], [0.018, 360], [0.05, 490], [0.10, 620], [0.138, 760]];
function vs30FromSlope(s) {
  if (!(s > 0) || s < VS30_BINS[0][0]) return 180;
  let pv = VS30_BINS[0];
  for (let i = 1; i < VS30_BINS.length; i++) {
    const b = VS30_BINS[i];
    if (s < b[0]) { const f = (Math.log(s) - Math.log(pv[0])) / (Math.log(b[0]) - Math.log(pv[0])); return pv[1] + (b[1] - pv[1]) * f; }
    pv = b;
  }
  return Math.min(1500, 760 + (s - 0.138) * 2400);
}

/* ── which z7 tiles can contain land: read the shipped 0.25° sea fraction ────────────────────── */
const bathyPath = path.join(ROOT, 'data', 'bathymetry.png');
if (!fs.existsSync(bathyPath)) { console.error('data/bathymetry.png is required (run scripts/build-bathymetry.mjs first)'); process.exit(1); }
const bathy = pngDecode(fs.readFileSync(bathyPath));
const BW = bathy.w, BH = bathy.h, BPP = bathy.bpp;
function seaFrac(lon, lat) {
  let i = Math.floor((lon + 180) / 360 * BW); if (i < 0) i = 0; else if (i >= BW) i = BW - 1;
  let j = Math.floor((90 - lat) / 180 * BH); if (j < 0) j = 0; else if (j >= BH) j = BH - 1;
  return bathy.data[(j * BW + i) * BPP + 2] / 255;
}

const n = 1 << Z;
const R2D = 180 / Math.PI;
function latOfMercY(gy, worldPx) { const t = Math.PI * (1 - 2 * gy / worldPx); return R2D * Math.atan(Math.sinh(t)); }

/* the tile's own corner latitudes, to decide "is any of this land?" cheaply */
function tileHasLand(tx, ty) {
  const worldPx = n * 256;
  const lat0 = latOfMercY(ty * 256, worldPx), lat1 = latOfMercY((ty + 1) * 256, worldPx);
  const lon0 = tx / n * 360 - 180, lon1 = (tx + 1) / n * 360 - 180;
  /* a z7 tile is ~2.8° wide; sample its footprint on the 0.25° grid plus one cell of margin */
  for (let la = Math.min(lat0, lat1) - 0.25; la <= Math.max(lat0, lat1) + 0.25; la += 0.25)
    for (let lo = lon0 - 0.25; lo <= lon1 + 0.25; lo += 0.25)
      if (seaFrac(lo, Math.max(-89.9, Math.min(89.9, la))) < 0.995) return true;
  return false;
}

const sumVs = new Float64Array(W * H);
const nLand = new Uint32Array(W * H);
let done = 0, skipped = 0, empty = 0, failed = 0;

async function doTile(tx, ty) {
  let img = null;
  try { img = await tile(Z, tx, ty); }
  catch (e) { failed++; return; }
  if (!img) { empty++; return; }
  const { w, h, bpp, data } = img;
  const worldPx = n * w;
  const elev = new Float32Array(w * h);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const o = (py * w + px) * bpp;
    elev[py * w + px] = (data[o] * 256 + data[o + 1] + data[o + 2] / 256) - 32768;
  }
  for (let py = 0; py < h; py++) {
    const lat = latOfMercY(ty * h + py + 0.5, worldPx);
    /* the ground size of ONE pixel at this row — the spacing the slope is measured over */
    const mPerPx = 40075017 * Math.cos(lat * Math.PI / 180) / worldPx;
    if (!(mPerPx > 0)) continue;
    let oj = Math.floor((90 - lat) / 180 * H); if (oj < 0) oj = 0; else if (oj >= H) oj = H - 1;
    const rowBase = oj * W;
    for (let px = 0; px < w; px++) {
      const e0 = elev[py * w + px];
      if (!(e0 > -440)) continue;                                  /* sea */
      const lon = (tx * w + px + 0.5) / worldPx * 360 - 180;
      if (e0 <= 0 && seaFrac(lon, lat) > 0.6) continue;            /* below zero AND mostly water here */
      const xa = px > 0 ? elev[py * w + px - 1] : e0, xb = px < w - 1 ? elev[py * w + px + 1] : e0;
      const ya = py > 0 ? elev[(py - 1) * w + px] : e0, yb = py < h - 1 ? elev[(py + 1) * w + px] : e0;
      const dzx = (xb - xa) / ((px > 0 && px < w - 1 ? 2 : 1) * mPerPx);
      const dzy = (yb - ya) / ((py > 0 && py < h - 1 ? 2 : 1) * mPerPx);
      const v = vs30FromSlope(Math.hypot(dzx, dzy));
      let oi = Math.floor((lon + 180) / 360 * W); if (oi < 0) oi = 0; else if (oi >= W) oi = W - 1;
      const k = rowBase + oi;
      sumVs[k] += v; nLand[k]++;
    }
  }
  done++;
  if (done % 128 === 0) process.stdout.write('  ' + done + ' fetched · ' + skipped + ' skipped (all sea) · ' + empty + ' absent\n');
}

const jobs = [];
for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) {
  if (!tileHasLand(tx, ty)) { skipped++; continue; }
  jobs.push([tx, ty]);
}
process.stdout.write('terrarium z' + Z + ': ' + jobs.length + ' land tiles of ' + (n * n) + ' → ' + W + '×' + H + ' (' + (360 / W).toFixed(3) + '°)\n');

let next = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  for (;;) { const k = next++; if (k >= jobs.length) return; await doTile(jobs[k][0], jobs[k][1]); }
}));
if (failed) { console.error(failed + ' tiles failed — refusing to ship a site term with holes in it'); process.exit(1); }

const VS_LO = 150, VS_HI = 1500;
const g = Buffer.alloc(W * H);
let cells = 0, sum = 0;
for (let k = 0; k < W * H; k++) {
  if (!nLand[k]) { g[k] = 0; continue; }
  const v = sumVs[k] / nLand[k];
  sum += v; cells++;
  g[k] = Math.max(1, Math.min(255, Math.round((v - VS_LO) / (VS_HI - VS_LO) * 254) + 1));
}
const png = pngGrey(g, W, H);
fs.writeFileSync(path.join(ROOT, 'data', 'vs30.png'), png);
const manifest = {
  source: 'AWS Terrain Tiles (terrarium) — SRTM/GMTED/NED topography',
  url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  method: 'Wald & Allen (2007) slope-based Vs30 proxy, active-tectonic table, evaluated per source pixel and averaged over the cell\'s land samples',
  zoom: Z, width: W, height: H, degrees: 360 / W,
  sampleSpacingM: Math.round(40075017 / ((1 << Z) * 256)),
  projection: 'equirectangular, -180..180 × 90..-90, pixel centres at (i+0.5), (j+0.5)',
  encoding: 'grey 0 = no land sampled; 1..255 = mean Vs30 linear over ' + VS_LO + '..' + VS_HI + ' m/s',
  vs30Lo: VS_LO, vs30Hi: VS_HI,
  landCells: cells, landCellFraction: +(cells / (W * H)).toFixed(4),
  meanVs30: +(sum / Math.max(1, cells)).toFixed(1),
  tilesFetched: done, tilesSkippedAllSea: skipped, tilesAbsent: empty,
  bytes: png.length, built: new Date().toISOString()
};
fs.writeFileSync(path.join(ROOT, 'data', 'vs30.json'), JSON.stringify(manifest, null, 2) + '\n');
process.stdout.write('data/vs30.png  ' + (png.length / 1024).toFixed(0) + ' kB · ' + cells.toLocaleString() + ' land cells · mean Vs30 ' + manifest.meanVs30 + ' m/s\n');
