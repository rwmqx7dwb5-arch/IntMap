/* ============================================================================
 *  IntMap · build-time point -> ISO-3 country
 * ----------------------------------------------------------------------------
 *  OSM facilities usually carry no `addr:country`, and a facility with no country
 *  cannot appear in "which countries does this company operate in" — the single
 *  most-asked question the brief names. So the build resolves the country from
 *  the coordinate itself, offline, against Natural Earth admin-0 (public domain,
 *  no attribution required, fetched once and cached under .cache/companies/).
 *
 *  ⚠ BUILD TIME ONLY. Nothing here ships: the browser receives the resolved ISO-3
 *  string, never the polygons.
 * ==========================================================================*/
import { httpJSON, cacheGet, cachePut } from './wd.mjs';

const NE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';

let _index = null;

function ringsOf(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}

function bboxOf(polys) {
  let w = 180; let s = 90; let e = -180; let n = -90;
  for (const poly of polys) {
    for (const ring of poly) {
      for (const p of ring) {
        if (p[0] < w) w = p[0];
        if (p[0] > e) e = p[0];
        if (p[1] < s) s = p[1];
        if (p[1] > n) n = p[1];
      }
    }
  }
  return [w, s, e, n];
}

/* even-odd ray casting; holes are handled because a point inside a hole crosses
   the hole's ring an odd number of extra times */
function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]; const yi = ring[i][1];
    const xj = ring[j][0]; const yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function inPolygon(poly, x, y) {
  if (!poly.length || !inRing(poly[0], x, y)) return false;
  for (let h = 1; h < poly.length; h++) if (inRing(poly[h], x, y)) return false;
  return true;
}

export async function countryIndex() {
  if (_index) return _index;
  let gj = cacheGet('ne', NE_URL, 180 * 24 * 3600 * 1000);
  if (!gj) gj = cachePut('ne', NE_URL, await httpJSON(NE_URL, { timeoutMs: 180000 }));
  const rows = [];
  const a2 = new Map();
  for (const f of (gj.features || [])) {
    const p = f.properties || {};
    /* ISO_A3 is '-99' for a handful of entries (Kosovo, N. Cyprus, Somaliland);
       ISO_A3_EH / ADM0_A3 carry the usable code for those. */
    let iso = p.ISO_A3;
    if (!iso || iso === '-99') iso = p.ISO_A3_EH;
    if (!iso || iso === '-99') iso = p.ADM0_A3;
    if (!iso || iso === '-99') continue;
    const polys = ringsOf(f.geometry);
    if (!polys.length) continue;
    rows.push({ iso, polys, bbox: bboxOf(polys) });
    const two = (p.ISO_A2 && p.ISO_A2 !== '-99') ? p.ISO_A2 : p.ISO_A2_EH;
    if (two && two !== '-99') a2.set(two, iso);
  }
  rows.alpha2 = a2;
  _index = rows;
  return rows;
}

/** ISO-3 for a lon/lat, or '' when the point is not inside any country. */
export function countryAt(index, lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return '';
  for (const r of index) {
    if (lon < r.bbox[0] || lon > r.bbox[2] || lat < r.bbox[1] || lat > r.bbox[3]) continue;
    for (const poly of r.polys) if (inPolygon(poly, lon, lat)) return r.iso;
  }
  return '';
}
