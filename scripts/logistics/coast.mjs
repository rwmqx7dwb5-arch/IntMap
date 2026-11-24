/* ============================================================================
 *  IntMap · logistics — distance from a point to the OCEAN coast (Natural Earth 1:10m, data/coastline.json.gz)
 * ----------------------------------------------------------------------------
 *  Used to decide whether a port is OCEAN-FACING: a river port 300 km up the Danube is a port, but a city's
 *  «nearest seaport» cannot be one. `coords` (not `enclosed`) is the ocean edge — scripts/build-coastline.mjs says why
 *  the Caspian and other enclosed seas are kept apart. Point-to-segment, so the distance is exact to the line.
 * ==========================================================================*/
import fs from 'node:fs';
import zlib from 'node:zlib';
import { project } from './rail-graph.mjs';

const G = 0.5;
export function makeCoast(file) {
  const c = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
  const s = c.scale, grid = new Map(), segs = [];
  for (const part of c.coords) {
    let x = part[0] / s, y = part[1] / s, px = x, py = y;
    for (let j = 2; j < part.length; j += 2) {
      x += part[j] / s; y += part[j + 1] / s;
      const id = segs.length; segs.push([px, py, x, y]);
      for (let gx = Math.floor(Math.min(px, x) / G); gx <= Math.floor(Math.max(px, x) / G); gx++) for (let gy = Math.floor(Math.min(py, y) / G); gy <= Math.floor(Math.max(py, y) / G); gy++) {
        const k = gx * 10000 + gy; let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(id);
      }
      px = x; py = y;
    }
  }
  /** km to the nearest ocean coast, searched outward ring by ring until found (a cell ring of 0.5 deg is ~55 km) */
  function distKm(x, y) {
    const gx = Math.floor(x / G), gy = Math.floor(y / G);
    for (let r = 1; r <= 40; r++) {
      let best = Infinity;
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        const l = grid.get((gx + dx) * 10000 + gy + dy); if (!l) continue;
        for (const id of l) { const q = segs[id]; const p = project(x, y, q[0], q[1], q[2], q[3]); if (p.m < best) best = p.m; }
      }
      /* the ring's own width bounds how much nearer an unsearched cell could be */
      if (best < Infinity && best / 1000 <= (r - 1) * G * 111 * Math.max(0.05, Math.cos(y * Math.PI / 180))) return best / 1000;
      if (r === 40) return best / 1000;
    }
    return Infinity;
  }
  return { distKm, segments: segs.length };
}
