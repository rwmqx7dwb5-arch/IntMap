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

const NE_RIVERS = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_10m_rivers_lake_centerlines.geojson';
export const RIVER_LICENCE = { name: 'Natural Earth 1:10m physical — river centre lines', url: 'https://www.naturalearthdata.com/', licence: 'Public domain', use: 'the courses of the rivers that named cable systems are laid in (the Amazon basin)' };

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

/* ══ ⚠⚠⚠ (#R384) ③ RIVERS THE CABLE IS ACTUALLY LAID IN ══════════════════════
   Brazil's Norte Conectado and Projeto Amazônia Conectada are submarine cable
   systems laid UP THE AMAZON AND ITS TRIBUTARIES — Manaus to Tabatinga along the
   Solimões, Porto Velho to Autazes along the Madeira, Boa Vista to Moura along
   the Branco, Cruzeiro do Sul to Fonte Boa along the Juruá. The elevation grid
   has no river in it at all, so #R355 could route none of them: MEASURED, ten
   cables, 10,093 km, every metre of it a GEODESIC DRAWN OVER THE RAINFOREST, and
   they are the whole of the QA's 「陸地横断」 top ten (411, 321, 273, 256, 250 …
   sampled points on land per feature).

   ⚠ THE COURSES ARE DATA, NOT COORDINATES IN CODE (the brief's §20). Natural
   Earth's 1:10m river centre lines — the same public-domain source the lakes
   already come from — pass within 1–11 km of every one of these landing points
   (measured: Tabatinga 3 km, Tefé 7 km, Manaus 5 km, São Gabriel 2 km, Moura
   4 km, Boa Vista 4 km, Porto Velho 2 km, Humaitá 2 km, Borba 2 km, Cruzeiro do
   Sul 1 km). data/subcable-overrides.json names WHICH rivers, and why.

   ⚠ A NAME IS NOT ENOUGH TO IDENTIFY A RIVER. 「Negro」 is four features in this
   dataset and three of them are in Argentina and Uruguay; the entry carries a
   bbox as well, and the build reports how many features each entry matched, so
   an entry that silently caught the wrong continent — or nothing — cannot hide. */
export async function loadRiverChannels(rivers, opts = {}) {
  if (!rivers || !rivers.length) return [];
  const gj = JSON.parse(await cachedFetch('ne_10m_rivers_lake_centerlines.geojson', NE_RIVERS, opts));
  const out = [];
  for (const r of rivers) {
    if (!r || !r.name) throw new Error('river entry has no `name`');
    if (!r.why) throw new Error('river "' + r.name + '" has no `why` — every hand-made decision must say why it is there');
    if (!Array.isArray(r.bbox) || r.bbox.length !== 4) throw new Error('river "' + r.name + '" has no bbox — a name alone does not identify a river');
    const [w0, s0, e0, n0] = r.bbox;
    let matched = 0;
    for (const f of gj.features || []) {
      const p = f.properties || {};
      if ((p.name || p.name_en) !== r.name) continue;
      const g = f.geometry; if (!g) continue;
      const parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
      for (const part of parts) {
        if (part.length < 2) continue;
        /* the whole part must sit in the declared box — half a river is not this river */
        let inside = true;
        for (const q of part) if (q[0] < w0 || q[0] > e0 || q[1] < s0 || q[1] > n0) { inside = false; break; }
        if (!inside) continue;
        matched++;
        out.push({ name: r.name + ' #' + matched, why: r.why, width_km: r.width_km || 9, cost: r.cost || 3.5,
          depth_m: r.depth_m ?? 25, river: r.name, points: part.map(q => [q[0], q[1]]) });
      }
    }
    if (!matched) throw new Error('river "' + r.name + '" matched no feature inside its bbox — the name or the box is wrong');
  }
  return out;
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
          if (!router.passable[i]) {
            router.passable[i] = 1; n++;
            /* (#R384) a newly opened cell has the depth of the LAND it was, which
               makes every step in or out of it a cliff to the gradient term. An
               entry that declares `depth_m` gets a nominal one instead — the same
               thing applyLakes() has always done for lake cells. Entries without
               the field are untouched, so #R355's two canals carve exactly as
               they did. */
            if (ch.depth_m != null) router.depth[i] = ch.depth_m;
          }
          router.mult[i] = Math.max(router.mult[i], ch.cost || 3.0);
        }
      }
    }
    opened.push({ name: ch.name, cellsOpened: n });
    if (!n && ch.expectOpen !== 0) opened[opened.length - 1].warning = 'opened no new cell';
  }
  router.invalidateComponents();
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
  router.invalidateComponents();
  return n;
}

export { dLon };
