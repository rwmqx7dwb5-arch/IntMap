/* ============================================================================
 *  IntMap · subcables — WATER THE SEA FLOOR GRID CANNOT SEE
 * ----------------------------------------------------------------------------
 *  The routing grid is built from elevation, and elevation says "land" about two
 *  kinds of water that carry real cables:
 *
 *  ① LAKES ABOVE SEA LEVEL. Lake Michigan's surface is +176 m, so every cell of
 *     it reads as land and NOAA's Great Lakes cable corridors have nowhere to be
 *     — measured: Chicago→Ludington, NO ROUTE. Natural Earth's 1:10m lakes
 *     (public domain) are rasterised in.
 *
 *  ② CHANNELS NARROWER THAN A CELL. A 1/12° cell is 9.26 km; the Suez Canal is
 *     200 m. Measured on the raw grid, Port Said → Suez routed 25,141 km — around
 *     Africa — for a 151 km leg, and that one blockage is why Red2Med, EMC West,
 *     IMEWE, SeaMeWe-4/6, AAE-1 and India-Europe Xpress all came out five to a
 *     hundred times too long. Cables really do transit these; the grid simply
 *     cannot hold them. They are declared in data/subcable-overrides.json, as
 *     data, each with the reason it is there — never as coordinates in code
 *     (the brief's §20).
 *
 *  Both are carved into the SAME passability the router already uses, at a cost
 *  that reflects what they are: shallow, busy, and no place to linger.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { CACHE_DIR } from './seafloor.mjs';
import { cachedFetch } from './sources.mjs';
import { haversine, densify, dLon } from './geo.mjs';

const NE_LAKES = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_10m_lakes.geojson';
export const LAKE_LICENCE = { name: 'Natural Earth 1:10m physical — lakes', url: 'https://www.naturalearthdata.com/', licence: 'Public domain', use: 'inland water the elevation grid reads as land (the Great Lakes and similar)' };

/* ── rasterise the lakes once, cache the bitmap ────────────────────────────── */
export async function loadLakeMask(w, h, opts = {}) {
  const file = path.join(CACHE_DIR, `lakes-${w}x${h}.bin.gz`);
  if (!opts.refresh && fs.existsSync(file)) {
    const raw = zlib.gunzipSync(fs.readFileSync(file));
    if (raw.length === w * h) return new Uint8Array(raw);
  }
  const gj = JSON.parse(await cachedFetch('ne_10m_lakes.geojson', NE_LAKES, opts));
  const mask = new Uint8Array(w * h);
  const cell = 360 / w;
  /* scanline fill, three lines per row so a 9 km cell is not decided by its
     exact centre (the same reason scripts/build-land-mask.mjs uses three) */
  for (const f of gj.features || []) {
    const g = f.geometry; if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) {
      let minLat = 90, maxLat = -90;
      for (const ring of poly) for (const p of ring) { if (p[1] < minLat) minLat = p[1]; if (p[1] > maxLat) maxLat = p[1]; }
      const j0 = Math.max(0, Math.floor((90 - maxLat) / cell) - 1);
      const j1 = Math.min(h - 1, Math.ceil((90 - minLat) / cell) + 1);
      for (let j = j0; j <= j1; j++) {
        for (const frac of [0.2, 0.5, 0.8]) {
          const lat = 90 - (j + frac) * cell;
          const xs = [];
          for (const ring of poly) {
            for (let i = 1; i < ring.length; i++) {
              const a = ring[i - 1], b = ring[i];
              if ((a[1] <= lat) === (b[1] <= lat)) continue;
              xs.push(a[0] + (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]));
            }
          }
          xs.sort((p, q) => p - q);
          for (let k = 0; k + 1 < xs.length; k += 2) {
            const kA = Math.floor((xs[k] + 180) / cell), kB = Math.ceil((xs[k + 1] + 180) / cell);
            for (let kk = kA; kk <= kB; kk++) {
              const col = ((kk % w) + w) % w;
              mask[j * w + col] = 1;
            }
          }
        }
      }
    }
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, zlib.gzipSync(Buffer.from(mask), { level: 9 }));
  return mask;
}

/* ── carve the declared channels into a grid ───────────────────────────────
   Returns the number of cells opened, so a channel that opens nothing (a typo,
   a moved coastline) is visible in the build report instead of silently doing
   nothing. */
export function carveChannels(router, channels) {
  const opened = [];
  for (const ch of channels || []) {
    if (!ch || !Array.isArray(ch.points) || ch.points.length < 2) throw new Error('channel "' + (ch && ch.name) + '" has no points');
    if (!ch.why) throw new Error('channel "' + ch.name + '" has no `why` — every hand-placed coordinate must say why it is there');
    const halfDeg = (ch.width_km || 10) / 2 / 111.32;
    const line = densify(ch.points.map(p => [p[0], p[1]]), 2000);
    let n = 0;
    for (const p of line) {
      const j0 = router.rowOf(p[1] + halfDeg), j1 = router.rowOf(p[1] - halfDeg);
      const kSpan = Math.ceil(halfDeg / (router.cellDeg * Math.max(0.05, Math.cos(p[1] * Math.PI / 180))));
      for (let j = Math.min(j0, j1); j <= Math.max(j0, j1); j++) {
        for (let dk = -kSpan; dk <= kSpan; dk++) {
          const i = router.idx(j, router.colOf(p[0]) + dk);
          if (haversine(p, router.centre(i)) > (ch.width_km || 10) * 1000) continue;
          if (!router.passable[i]) { router.passable[i] = 1; n++; }
          router.mult[i] = Math.max(router.mult[i], ch.cost || 3.0);
        }
      }
    }
    opened.push({ name: ch.name, cellsOpened: n });
    if (!n && ch.expectOpen !== 0) opened[opened.length - 1].warning = 'opened no new cell';
  }
  return opened;
}

/* ── add the lakes to a router's passability ───────────────────────────────── */
export function applyLakes(router, mask, { depthM = 60, cost = 2.2 } = {}) {
  let n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || router.passable[i]) continue;
    router.passable[i] = 1;
    router.depth[i] = depthM;
    router.mult[i] = cost;
    n++;
  }
  router.passableCells += n;
  return n;
}

export { dLon };
