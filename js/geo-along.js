/* ============================================================================
 *  IntMap · js/geo-along.js — WHICH POLYGON A LINE IS INSIDE, POINT BY POINT, ALONG ITS LENGTH  (atlas-product)
 * ----------------------------------------------------------------------------
 *  The geometry the route panel's «Borders» analysis has used since #R184 (js/routing-ops.js `borders`), moved
 *  out of that closure UNCHANGED so the same measurement can be asked of another set of polygons — the historical
 *  border records at a past instant (js/journey-through-time.js). One answer to «where does this line cross a
 *  border»: two copies of the sampler or of the point-in-polygon test would be two rules that drift apart
 *  (.agents/rules/no-ad-hoc-hardcoding.md §1, «既にある仕組みの写し»).
 *
 *  Pure: no map, no DOM, no clock. js/routing-ops.js imports it (and publishes the same functions on `_math`,
 *  as before); tests evaluate it directly.
 * ==========================================================================*/

const D2R = Math.PI / 180, R_EARTH = 6371008.8;   /* IUGG mean radius (m) — the one js/routing-ops.js has always measured routes with */

/** great-circle distance between two [lng, lat] points, metres (haversine) */
export function distM(a, b) {
  const la1 = a[1] * D2R, la2 = b[1] * D2R, dla = (b[1] - a[1]) * D2R, dlo = (b[0] - a[0]) * D2R;
  const h = Math.sin(dla / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dlo / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** the length of a polyline, metres */
export function lineLengthM(coords) { let t = 0; for (let i = 1; i < (coords || []).length; i++) t += distM(coords[i - 1], coords[i]); return t; }

/* Resample a polyline to points ~stepM apart, keeping the along-track distance of each — every
   analysis wants "every N metres along the route", never "every vertex" (a motorway has one
   vertex per kilometre and a roundabout has forty). */
export function resample(coords, stepM, maxN) {
  if (!coords || coords.length < 2) return [];
  const out = []; let acc = 0, carry = 0;
  out.push({ lng: coords[0][0], lat: coords[0][1], d: 0 });
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i], seg = distM(a, b);
    if (!(seg > 0)) continue;
    let t = stepM - carry;
    while (t <= seg) { const f = t / seg;
      out.push({ lng: a[0] + (b[0] - a[0]) * f, lat: a[1] + (b[1] - a[1]) * f, d: acc + t });
      t += stepM; }
    carry = (carry + seg) % stepM; acc += seg;
  }
  out.push({ lng: coords[coords.length - 1][0], lat: coords[coords.length - 1][1], d: acc });
  if (maxN && out.length > maxN) { const k = Math.ceil(out.length / maxN);
    return out.filter((_, i) => i % k === 0 || i === out.length - 1); }
  return out;
}

/* ══ HOW DENSELY A LINE IS ASKED ══════════════════════════════════════════════════════════════════
   #R184's numbers, from js/routing-ops.js `borders`: a sample at least every 200 m, about 500 along the line, at
   most 700. They were chosen there for a road route (a 9 km transit must not fall between two samples); the
   journey through time asks the same question of the same kind of line, so it uses the same numbers rather than
   a second pair. Invalid when the polygons get finer than 200 m or a line longer than ~140,000 km is asked
   (700 × 200 m) — neither is a line IntMap draws. */
export const BORDER_SAMPLE = { minStepM: 200, perLine: 500, max: 700 };
export function borderSamples(coords) {
  const total = lineLengthM(coords);
  return { total, pts: resample(coords, Math.max(BORDER_SAMPLE.minStepM, total / BORDER_SAMPLE.perLine), BORDER_SAMPLE.max) };
}

/** even-odd point-in-ring */
function ptInRing(p, ring) { let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / ((yj - yi) || 1e-12) + xi)) inside = !inside; }
  return inside; }
/* the box of each OUTER RING, computed once per ring array (a WeakMap: the geometry belongs to its owner). A country's
   box admits a point anywhere in it, and then every one of its polygons was walked vertex by vertex — measured in the
   page (2026-10-08, Paris → Moscow at today's 1:10m outlines): a repeat of the same journey took 1.8 s, nearly all of it
   ring tests on polygons whose own box does not hold the point. A box only refuses; the exact test still decides. */
const RING_BOX = new WeakMap();
function ringBox(ring) { let b = RING_BOX.get(ring); if (b === undefined) { b = boxOf({ coordinates: ring }); RING_BOX.set(ring, b); } return b; }
/** point-in-(Multi)Polygon with holes */
export function ptInPoly(p, geom) {
  if (!geom) return false;
  const polys = (geom.type === 'Polygon') ? [geom.coordinates] : (geom.type === 'MultiPolygon' ? geom.coordinates : []);
  for (const poly of polys) {
    if (!poly.length) continue;
    const b = ringBox(poly[0]);
    if (b && (p[0] < b[0] || p[0] > b[2] || p[1] < b[1] || p[1] > b[3])) continue;
    if (!ptInRing(p, poly[0])) continue;
    let hole = false; for (let k = 1; k < poly.length; k++) if (ptInRing(p, poly[k])) { hole = true; break; }
    if (!hole) return true; }
  return false; }

/** [w, s, e, n] of a geometry — a cheap refusal before the exact test, never a reason to accept */
export function boxOf(geom) {
  let n = -90, s = 90, e = -180, w = 180;
  const walk = (c) => { if (typeof c[0] === 'number') { if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; return; } c.forEach(walk); };
  try { walk(geom.coordinates); } catch (_) { return null; }
  return w <= e ? [w, s, e, n] : null;
}

/* the boxes, computed once per feature object (a WeakMap, so a collection owned by another module is not written to) */
const BOXES = new WeakMap();
function boxFor(f) { let b = BOXES.get(f); if (b === undefined) { b = (f && f.geometry) ? boxOf(f.geometry) : null; BOXES.set(f, b); } return b; }

/** the first feature whose polygon holds the point (js/routing-ops.js `countryAt`) */
export function featureAt(lng, lat, feats) {
  for (let i = 0; i < feats.length; i++) {
    const f = feats[i], b = f.bbox || f._bb || boxFor(f);
    if (b && (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3])) continue;
    if (ptInPoly([lng, lat], f.geometry)) return f;
  }
  return null; }
/** EVERY feature whose polygon holds the point — a historical record can draw two at one place (a realm over its
    members, two claims), and choosing one of them would be a judgement the record did not make */
export function featuresAt(lng, lat, feats) {
  const out = [];
  for (let i = 0; i < feats.length; i++) {
    const f = feats[i], b = f.bbox || f._bb || boxFor(f);
    if (b && (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3])) continue;
    if (ptInPoly([lng, lat], f.geometry)) out.push(f);
  }
  return out; }

/** a line through waypoints, densified along the great circle between each pair (so a 2,000 km leg is the
    shortest path on the globe, not a straight line on the Mercator plane). `stepM` is the longest piece. */
export function greatCircleLine(points, stepM) {
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], d = distM(a, b), n = Math.max(1, Math.ceil(d / stepM));
    const φ1 = a[1] * D2R, λ1 = a[0] * D2R, φ2 = b[1] * D2R, λ2 = b[0] * D2R, δ = d / R_EARTH;
    if (i === 1) out.push([a[0], a[1]]);
    for (let k = 1; k <= n; k++) {
      if (!(δ > 0)) { out.push([b[0], b[1]]); break; }
      const f = k / n, A = Math.sin((1 - f) * δ) / Math.sin(δ), B = Math.sin(f * δ) / Math.sin(δ);
      const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
      const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
      const z = A * Math.sin(φ1) + B * Math.sin(φ2);
      let lng = Math.atan2(y, x) / D2R; const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) / D2R;
      /* keep the line continuous across the antimeridian — the renderer draws 179 → -179 the long way round */
      const prev = out[out.length - 1]; while (lng - prev[0] > 180) lng -= 360; while (lng - prev[0] < -180) lng += 360;
      out.push([lng, lat]);
    }
  }
  return out;
}
/** a longitude carried past ±180 by greatCircleLine, back on the globe — for the point-in-polygon test only */
export const wrapLng = (lng) => ((((lng + 180) % 360) + 360) % 360) - 180;
