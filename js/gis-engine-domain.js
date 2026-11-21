/* ============================================================================
 *  IntMap · THE DOMAIN WHERE A PLANAR ENGINE ANSWERS THE SAME QUESTION  (gis-engine-domain)
 * ----------------------------------------------------------------------------
 *  MEASURED (scripts/gis-engine-equivalence.mjs, 2026-11-21, DuckDB Spatial against this GIS's `relateBlock`, every
 *  (left, right) pair of each class, predicates intersects / within / contains):
 *    SAME   interior points and convex polygons · points on an edge or a vertex · polygons sharing an edge or equal ·
 *           polygons with holes · lines · long edges (a great circle and a plane agree for these predicates)
 *    DIFFER only where the SEAM or a POLE is involved:
 *           · a polygon written past ±180 (lon 170..190): this GIS wraps -179.5 into it, a plane does not (intersects, within)
 *           · a coordinate exactly on ±180 against a polygon split at the seam (within)
 *           · a point on the pole line (lat 90) against a ring that reaches it (within)
 *  So the rule an engine's `accepts` needs is not "is it big" but "is every coordinate strictly inside the plane's
 *  world": lon in (-180, 180) and lat in (-90, 90), both sides. Inside that, the two implementations returned the same rows
 *  for every case measured; outside it they are not the same question and the job stays on this GIS.
 *  ⚠ A DOMAIN, NOT A CAP: nothing here refuses a size. It states where a faster implementation is allowed to answer, and
 *  says WHY when it is not (`at`), so `stats.engineDeclined` can print the reason instead of "declined".
 *  ⚠ Invalidate when: DuckDB Spatial changes its predicate semantics, or this GIS changes the seam/pole rule — the script
 *  above re-measures both in one run (it needs a DuckDB binary, so it is a tool and not a gate).
 * ==========================================================================*/

function scanPosition(c) {
  if (!Array.isArray(c) || c.length < 2) return 'bad-position';
  const x = c[0], y = c[1];
  if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return 'bad-position';
  if (x <= -180 || x >= 180) return 'seam';
  if (y <= -90 || y >= 90) return 'pole';
  return null;
}
function scanCoords(c, depth) {
  if (depth === 0) return scanPosition(c);
  if (!Array.isArray(c)) return 'bad-position';
  for (let i = 0; i < c.length; i++) { const r = scanCoords(c[i], depth - 1); if (r) return r; }
  return null;
}
const DEPTH = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };

/** One GeoJSON geometry → null (inside the plane's world) | 'seam' | 'pole' | 'bad-position' | 'unsupported-type'. */
export function outsidePlanarDomain(g) {
  if (!g || typeof g !== 'object') return null;                       /* a row that states no place takes no part in a pair */
  const d = DEPTH[g.type];
  if (d === undefined) return 'unsupported-type';                     /* GeometryCollection etc.: not measured */
  return scanCoords(g.coordinates, d);
}

/** Many geometries (an iterable of GeoJSON geometries or Features) → { ok:true } | { ok:false, why, at } — `at` is the first offending index. */
export function planarEquivalent(geoms) {
  let i = 0;
  for (const g of geoms) {
    const geo = g && g.type === 'Feature' ? g.geometry : g;
    const w = outsidePlanarDomain(geo);
    if (w) return { ok: false, why: 'engine-outside-equivalence-domain:' + w, at: i };
    i++;
  }
  return { ok: true };
}

/** The predicates measured SAME inside the domain. `nearer-than` is a geodesic distance here and degrees there — not measured, never offered. */
export const EQUIVALENT_PREDICATES = Object.freeze(['intersects', 'within', 'contains']);
