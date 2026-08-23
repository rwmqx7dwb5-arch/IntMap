#!/usr/bin/env node
/* ============================================================================
 *  IntMap · subcables — THE SEA FLOOR THE ROUTER WALKS ON
 * ----------------------------------------------------------------------------
 *  A submarine cable is not laid along a great circle. It is laid where the sea
 *  floor lets it be laid: across the shelf as directly as the ground allows,
 *  then along abyssal plains, and around the things that break cables —
 *  canyons, escarpments, seamount flanks, trenches. To reconstruct a route we
 *  need those facts as a grid, not as a picture.
 *
 *  This builds ONE cached grid, at 1/12° (5 arc-minutes, 4320 × 2160):
 *
 *      depth    Int16   mean depth of the cell's SEA samples, metres, +down
 *      seaFrac  Uint8   sea samples / all samples × 255
 *      rough    Uint16  standard deviation of depth INSIDE the cell, metres
 *
 *  ── WHY THE STANDARD DEVIATION INSIDE THE CELL ────────────────────────────
 *  Slope between two 9 km cells tells you about continental slopes. It cannot
 *  see a 3 km-wide canyon, and a canyon is the thing that actually cuts cables.
 *  The spread of the source samples WITHIN one output cell can: a flat abyssal
 *  plain has σ of a few metres, a canyon wall has σ in the hundreds. So the
 *  grid keeps both — the between-cell gradient AND the within-cell roughness.
 *
 *  ── SOURCE ────────────────────────────────────────────────────────────────
 *  AWS Terrain Tiles ("terrarium"), z6 — the SAME elevation source the app
 *  already uses and already attributes (js/reference-data.js), read one zoom
 *  finer than data/bathymetry.png so each 1/12° cell is the mean of ~14 samples
 *  rather than ~3. Ocean from ETOPO1, land from SRTM/GMTED/NED.
 *
 *  ⚠ NOT SHIPPED. This is a build-time input, cached under .cache/ (gitignored,
 *  like scripts/build-vs30.mjs's tile cache). The app ships only the finished
 *  cable dataset. Deleting the cache costs a re-download, never correctness.
 *
 *  ⚠ MERCATOR STOPS AT ±85.051°. Rows outside come back with sea fraction 0 —
 *  a wall. No cable lands beyond ±82°, so nothing routed is affected; the
 *  manifest says so rather than leaving it to be discovered.
 *
 *    node scripts/subcables/seafloor.mjs [--zoom 6] [--width 4320]
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { pngDecode } from './png.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CACHE_DIR = path.join(ROOT, '.cache', 'subcables');

const HOSTS = [
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium',
  'https://elevation-tiles-prod.s3.amazonaws.com/terrarium',
  'https://elevation-tiles-prod.s3.dualstack.us-east-1.amazonaws.com/terrarium',
  'https://elevation-tiles-prod.s3.us-east-1.amazonaws.com/terrarium',
];

export const GRID_W = 4320, GRID_H = 2160;          /* 1/12° = 5 arc-minutes */
const GRID_FILE = () => path.join(CACHE_DIR, `seafloor-${GRID_W}x${GRID_H}.bin.gz`);
const GRID_META = () => path.join(CACHE_DIR, `seafloor-${GRID_W}x${GRID_H}.json`);

async function tile(z, x, y) {
  let lastErr = null;
  for (let a = 0; a < HOSTS.length * 2; a++) {
    const url = HOSTS[(x + y + a) % HOSTS.length] + '/' + z + '/' + x + '/' + y + '.png';
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'IntMap/build-subcables (+https://github.com/rwmqx7dwb5-arch/IntMap)' } });
      if (!r.ok) { lastErr = new Error('HTTP ' + r.status); continue; }
      return pngDecode(Buffer.from(await r.arrayBuffer()));
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('unreachable');
}

/* ── read the cached grid, or build it ─────────────────────────────────────── */
export function loadSeafloor() {
  const f = GRID_FILE();
  if (!fs.existsSync(f)) return null;
  const raw = zlib.gunzipSync(fs.readFileSync(f));
  const n = GRID_W * GRID_H;
  if (raw.length !== n * 5) throw new Error('seafloor cache is ' + raw.length + ' bytes, expected ' + (n * 5));
  const depth = new Int16Array(n), rough = new Uint16Array(n), seaFrac = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    depth[i] = raw.readInt16LE(i * 2);
    rough[i] = raw.readUInt16LE(n * 2 + i * 2);
    seaFrac[i] = raw[n * 4 + i];
  }
  return { w: GRID_W, h: GRID_H, depth, rough, seaFrac,
    meta: JSON.parse(fs.readFileSync(GRID_META(), 'utf8')) };
}

export async function buildSeafloor({ zoom = 6, concurrency = 14, log = console.log } = {}) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const W = GRID_W, H = GRID_H, n = 1 << zoom, N = W * H;
  const sum = new Float64Array(N), sum2 = new Float64Array(N);
  const nSea = new Uint32Array(N), nAll = new Uint32Array(N);
  let done = 0, failed = 0;
  const R2D = 180 / Math.PI;
  const latOfMercY = (gy, worldPx) => R2D * Math.atan(Math.sinh(Math.PI * (1 - 2 * gy / worldPx)));

  async function doTile(tx, ty) {
    let img = null;
    try { img = await tile(zoom, tx, ty); } catch { failed++; return; }
    const { w, h, bpp, data } = img, worldPx = n * w;
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
        if (elev < 0) { const d = -elev; nSea[k]++; sum[k] += d; sum2[k] += d * d; }
      }
    }
    done++;
    if (done % 128 === 0) log('  ' + done + '/' + (n * n) + ' tiles');
  }

  const jobs = [];
  for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) jobs.push([tx, ty]);
  log('terrarium z' + zoom + ': ' + jobs.length + ' tiles → ' + W + '×' + H + ' (' + (360 / W).toFixed(4) + '°)');
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    for (;;) { const k = next++; if (k >= jobs.length) return; await doTile(jobs[k][0], jobs[k][1]); }
  }));
  if (failed) throw new Error(failed + ' tiles failed — refusing to route over a sea floor with holes in it');

  const depth = new Int16Array(N), rough = new Uint16Array(N), seaFrac = new Uint8Array(N);
  let maxD = 0, seaCells = 0;
  for (let i = 0; i < N; i++) {
    if (!nAll[i]) continue;
    seaFrac[i] = Math.round(255 * nSea[i] / nAll[i]);
    if (!nSea[i]) continue;
    seaCells++;
    const m = sum[i] / nSea[i];
    depth[i] = Math.min(32767, Math.round(m));
    if (m > maxD) maxD = m;
    const v = Math.max(0, sum2[i] / nSea[i] - m * m);
    rough[i] = Math.min(65535, Math.round(Math.sqrt(v)));
  }

  const buf = Buffer.alloc(N * 5);
  for (let i = 0; i < N; i++) { buf.writeInt16LE(depth[i], i * 2); buf.writeUInt16LE(rough[i], N * 2 + i * 2); buf[N * 4 + i] = seaFrac[i]; }
  fs.writeFileSync(GRID_FILE(), zlib.gzipSync(buf, { level: 9 }));
  const meta = {
    source: 'AWS Terrain Tiles (terrarium) — ETOPO1 bathymetry, SRTM/GMTED/NED topography',
    url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    zoom, width: W, height: H, degrees: 360 / W,
    encoding: 'Int16 depth[N] (metres, +down) | Uint16 rough[N] (σ of depth inside the cell, metres) | Uint8 seaFrac[N] (×255)',
    mercatorLimitDeg: 85.0511,
    seaCells, seaCellFraction: +(seaCells / N).toFixed(4), maxDepthM: Math.round(maxD),
    built: new Date().toISOString(),
  };
  fs.writeFileSync(GRID_META(), JSON.stringify(meta, null, 2));
  log('sea floor: ' + seaCells.toLocaleString() + ' sea cells, max depth ' + Math.round(maxD) + ' m → ' + GRID_FILE());
  return { w: W, h: H, depth, rough, seaFrac, meta };
}

/* run directly → build */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  await buildSeafloor({ zoom: Number(arg('zoom', 6)), concurrency: Number(arg('concurrency', 14)) });
}
