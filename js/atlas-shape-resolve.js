/* ============================================================================
 *  IntMap · js/atlas-shape-resolve.js — THE REAL SHAPE OF A NAMED THING, OR AN HONEST «NO»
 * ----------------------------------------------------------------------------
 *  (atlas-real-shapes) 「フォッサマグナをマッピングして」 came back as a handful of town markers joined by straight
 *  lines, and 「ペルシャ湾から日本までの航路」 as arcs. Atlas's map output (js/atlas-map-compose.js) could only say
 *  POINTS and RELATIONS between them — so a geological region, a fault, a river or a sea lane, which are AREAS and
 *  LINES in the world, could only be drawn by picking places near them and joining the dots, and the result was
 *  `completed` because every dot landed. The real-geometry machinery already existed (the highlight ladder for areas:
 *  the local admin-1 index, curated compositions, Nominatim polygons under the name-agreement floor, the web-grounded
 *  region resolver; Nominatim lines and the river course for lines) — and nothing joined it to the map explanation.
 *
 *  This module is that join, written once: given a NAME and what the reader asked to SEE of it (`area` or `line`),
 *  it returns the geometry IntMap actually obtained together with where it came from, or a reason it has none.
 *    · `basis: 'real'`    — a geometry an upstream holds for this name (OSM, the admin-1 index, the country layer)
 *    · `basis: 'derived'` — a geometry IntMap BUILT (an admin union with members missing, a web-anchored outline,
 *                           a directional slice): drawn, and labelled approximate everywhere it is shown
 *    · `ok: false`        — nothing with this name and this KIND; never a rectangle, never a stand-in
 *  ⚠ A BOUNDING BOX IS NOT A SHAPE. The highlight ladder may end in a soft rectangle (`soft`) — fine for shading a
 *    vague region in a highlight, a lie for 「the shape of X」. It is refused here (`only_extent`).
 *  ⚠ A NAME THAT AGREES IS NOT A KIND THAT AGREES (memory: name-agreement-is-not-kind-agreement). A `line` request
 *    answered by a polygon is `kind_mismatch`, not a line; an `area` request answered by a line likewise.
 *  ⚠ THE NAME IS ASKED IN ITS PLACE. MEASURED 2026-11-18 on Nominatim: 「Fossa Magna」 answers three CANALS in Lombardy
 *    (waterway/canal, LineString) — a perfectly name-agreeing line on the wrong continent. When the item names its country,
 *    a shape none of whose vertices lies in that country is refused (`elsewhere`), whatever rung produced it.
 *  PURE: every network rung is injected (`deps`), so tests drive it with scripted answers.
 * ==========================================================================*/

const AREA_TYPES = /^(Multi)?Polygon$/;
const LINE_TYPES = /^(Multi)?LineString$/;

/** the first GeoJSON geometry a highlight-ladder answer carries, wherever that rung put it */
export function geometryOf(r) {
  if (!r || typeof r !== 'object') return null;
  const cands = [r.poly && r.poly.geo, r.geo, r.geometry, r.geojson, r.entity && r.entity.geometry, r.entity && r.entity.geo];
  for (const g of cands) if (g && typeof g === 'object' && typeof g.type === 'string' && Array.isArray(g.coordinates)) return g;
  return null;
}

/**
 * resolveShape(name, want, deps) → Promise<{ok:true, geometry, basis, method, source} | {ok:false, reason, candidates?, got?}>
 *   want: 'area' | 'line'
 *   deps.area(name)          → the highlight ladder's answer (js/atlas-console.js resolveHlTarget)
 *   deps.countries(codes[])  → a (Multi)Polygon for those ISO codes, or null
 *   deps.extent(name)        → Nominatim's best name-agreeing candidate {geojson, name} (js/atlas-geo-resolve.js _nomExtent)
 *   deps.river(name)         → {geo, name} for a waterway (fetchRiverLine); deps.isRiver(name) → whether to ask it
 */
export async function resolveShape(name, want, deps, where) {
  deps = deps || {};
  const nm = String(name == null ? '' : name).trim();
  if (!nm) return { ok: false, reason: 'no_name' };
  const r = want === 'line' ? await line(nm, deps) : want === 'area' ? await area(nm, deps) : { ok: false, reason: 'unknown_shape' };
  if (!r.ok || !where || !where.country) return r;
  return inCountry(r, where.country, deps);
}

/* (see the header) a shape asked FOR a country must touch it: up to 64 vertices, evenly spaced, are asked which country
   they stand in. A country the deps cannot name, or a vertex no country claims (the sea), decides nothing. */
function inCountry(r, country, deps) {
  let want = '';
  try { want = typeof deps.countryCode === 'function' ? String(deps.countryCode(country) || '') : ''; } catch (_) { want = ''; }
  if (!want || typeof deps.countryAt !== 'function') return r;
  const pts = []; const walk = (c) => { if (typeof c[0] === 'number') pts.push(c); else c.forEach(walk); };
  try { walk(r.geometry.coordinates); } catch (_) { return r; }
  const step = Math.max(1, Math.floor(pts.length / 64)); let seen = '';
  for (let i = 0; i < pts.length; i += step) {
    let cc = ''; try { cc = String(deps.countryAt(pts[i][0], pts[i][1]) || ''); } catch (_) { cc = ''; }
    if (cc === want) return r;
    if (cc && !seen) seen = cc;
  }
  return seen ? { ok: false, reason: 'elsewhere', got: seen } : r;
}

async function area(nm, deps) {
  let r = null;
  try { r = typeof deps.area === 'function' ? await deps.area(nm) : null; } catch (_) { r = null; }
  if (!r) {
    /* the ladder had nothing; a name-agreeing polygon straight from the gazetteer is still a real shape */
    const e = await ext(nm, deps);
    if (e && e.geojson && AREA_TYPES.test(e.geojson.type)) return { ok: true, geometry: e.geojson, basis: 'real', method: 'osm_polygon', source: 'OpenStreetMap' };
    if (e && e.geojson && LINE_TYPES.test(e.geojson.type)) return { ok: false, reason: 'kind_mismatch', got: 'line' };
    return { ok: false, reason: 'not_found' };
  }
  if (r.ambiguous) return { ok: false, reason: 'ambiguous', candidates: Array.isArray(r.candidates) ? r.candidates.slice(0, 4) : [] };
  if (r.soft) return { ok: false, reason: 'only_extent' };
  const codes = r.codes || (r.code ? [r.code] : null);
  /* the METHOD names the rung that produced the outline; an approximate answer with no rung of its own is the ladder's
     model-drawn outline (checked against the web by the ladder, but authored by a model — derived, and said so) */
  let g = geometryOf(r);
  let method = r.rrMethod || (r.composed ? 'admin_union' : r.sliced ? 'directional_slice' : r.approx ? 'model_outline' : 'osm_polygon');
  let source = r.rrSource || (r.entity && r.entity.source) || (method === 'model_outline' ? 'Atlas (web-checked)' : 'OpenStreetMap');
  if (!g && codes && typeof deps.countries === 'function') {
    try { g = await deps.countries(codes); } catch (_) { g = null; }
    method = 'country'; source = 'IntMap country outlines';
  }
  if (!g) return { ok: false, reason: 'no_geometry' };
  if (LINE_TYPES.test(g.type)) return { ok: false, reason: 'kind_mismatch', got: 'line' };
  if (!AREA_TYPES.test(g.type)) return { ok: false, reason: 'kind_mismatch', got: g.type };
  const derived = !!(r.approx || r.partial || r.sliced);
  return { ok: true, geometry: g, basis: derived ? 'derived' : 'real', method, source };
}

async function line(nm, deps) {
  let isRiver = false;
  try { isRiver = typeof deps.isRiver === 'function' && !!deps.isRiver(nm); } catch (_) { isRiver = false; }
  if (isRiver && typeof deps.river === 'function') {
    let rv = null;
    try { rv = await deps.river(nm); } catch (_) { rv = null; }
    const g = geometryOf(rv);
    if (g && LINE_TYPES.test(g.type)) return { ok: true, geometry: g, basis: 'real', method: 'waterway', source: 'OpenStreetMap' };
  }
  const e = await ext(nm, deps);
  if (!e || !e.geojson) return { ok: false, reason: 'not_found' };
  if (LINE_TYPES.test(e.geojson.type)) return { ok: true, geometry: e.geojson, basis: 'real', method: 'osm_line', source: 'OpenStreetMap' };
  return { ok: false, reason: 'kind_mismatch', got: AREA_TYPES.test(e.geojson.type) ? 'area' : String(e.geojson.type) };
}

async function ext(nm, deps) {
  try { return typeof deps.extent === 'function' ? await deps.extent(nm) : null; } catch (_) { return null; }
}

/** a representative point of a shape — the mean of its bounding box, for a marker when the name had no point of its own */
export function shapeAnchor(g) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (c) => { if (typeof c[0] === 'number') { if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; } else c.forEach(walk); };
  try { walk(g.coordinates); } catch (_) { return null; }
  return isFinite(w) ? { lng: (w + e) / 2, lat: (s + n) / 2 } : null;
}
