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

import along from '@turf/along';
import length from '@turf/length';
import { geometryRange, osmFeatureId } from './map-feature-geometry.js';
export { geometryRange, osmFeatureId };

const AREA_TYPES = /^(Multi)?Polygon$/;
const LINE_TYPES = /^(Multi)?LineString$/;

/* (eval-shape-grading) THE WORDS A DRAWN SHAPE IS DESCRIBED WITH — one place, read by every reader of them: the
   `atlas` state section tallies the shapes on the map as `<kind>:<basis>` (js/atlas-console.js _atlasOverlayState),
   and the evaluator (scripts/atlas-eval/map-state.mjs) discovers which tallies a question may ask for from here.
     · kind   — what the thing IS on the map: an `area` (a (Multi)Polygon) or a `line` (a (Multi)LineString)
     · basis  — `real` / `derived` as above; `unstated` = IntMap makes no claim about where the shape came from
                (coordinates a model wrote — map.drawLine / map.drawPolygon —, a bounding box, a restored drawing that
                lost its record). It is never counted as real: a grader that asks for the real shape is not answered
                by a line someone drew between two dots. */
export const SHAPE_KINDS = Object.freeze(['area', 'line']);
export const SHAPE_BASES = Object.freeze(['real', 'derived', 'unstated']);

/** the kind of a GeoJSON geometry, or '' when it is neither an area nor a line (a point, a collection) */
export function shapeKindOf(g) {
  const t = g && typeof g === 'object' ? String(g.type || '') : '';
  return AREA_TYPES.test(t) ? 'area' : LINE_TYPES.test(t) ? 'line' : '';
}

/**
 * shapeBasisOf(r) → 'real' | 'derived' | 'unstated' — the basis of an answer of the highlight ladder (resolveHlTarget),
 * the ONE rule both the map explanation (area() below) and the highlight (js/atlas-cap-map.js) apply. A soft answer is
 * a bounding box (not a shape at all); an approximate, partial, sliced or web-anchored outline is one IntMap built.
 */
export function shapeBasisOf(r) {
  if (!r || typeof r !== 'object') return 'unstated';
  if (r.soft) return 'unstated';
  if (r.approx || r.partial || r.sliced || r.rrMethod === 'derived_anchors') return 'derived';
  return 'real';
}

/**
 * tallyShapes(items) → null | { n, '<kind>:<basis>': count … } — items are [{ geo, basis }]; an item whose geometry is
 * neither an area nor a line is not a shape and is not counted. `basis` outside SHAPE_BASES is `unstated`.
 */
export function tallyShapes(items) {
  const o = { n: 0, items: [] };
  for (const it of items || []) {
    const k = shapeKindOf(it?.geo) || (SHAPE_KINDS.includes(it?.kind) ? it.kind : '');
    if (!k) continue;
    const b = SHAPE_BASES.includes(it.basis) ? it.basis : 'unstated';
    if (it.author !== 'user') {
      o.n++;
      o[k + ':' + b] = (o[k + ':' + b] || 0) + 1;
    }
    /* (atlas-shape-identity) WHICH thing each shape is: the name it was resolved for. A count says a river-shaped line is
       on the map; only the name says it is the river that was asked for. Absent when a shape carries none. */
    const nm = it && typeof it.name === 'string' ? it.name.trim() : '';
    if (nm) { (o.names || (o.names = [])); if (o.names.indexOf(nm) < 0) o.names.push(nm); }
    const { id, target, author, source, sourceId, sourceVersion, method, transformation, turnId, bounds, endpoints } = it;
    o.items.push({ id, name: nm, target: target || nm, kind: k, basis: b, author, source, sourceId, sourceVersion, method, transformation, turnId, bounds, endpoints });
  }
  return o.items.length ? o : null;
}

export function mapAuthorship(ctx) {
  if (!ctx?.source) return { author: 'unknown', turnId: null };
  return { author: /^atlas(?:-|$)/.test(ctx.source) ? 'atlas' : 'user', turnId: ctx.turnId ?? null, createdAt: Date.now() };
}

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
  if (!r.ok) return r;
  const shape = { ...r, target: nm };
  return where && where.country ? inCountry(shape, where.country, deps) : shape;
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
  if (typeof deps.basin === 'function') {
    try { r = await deps.basin(nm); } catch (_) { r = null; }
    if (r) return r.ok ? r : { ok: false, reason: r.reason || 'not_found' };
  }
  try { r = typeof deps.area === 'function' ? await deps.area(nm) : null; } catch (_) { r = null; }
  if (!r) {
    /* the ladder had nothing; a name-agreeing polygon straight from the gazetteer is still a real shape */
    const e = await ext(nm, deps);
    if (e && e.geojson && AREA_TYPES.test(e.geojson.type)) return { ok: true, geometry: e.geojson, basis: 'real', method: 'osm_polygon', source: 'OpenStreetMap', sourceId: e.sourceId || osmFeatureId(e), sourceVersion: e.sourceVersion };
    if (e && e.geojson && LINE_TYPES.test(e.geojson.type)) return { ok: false, reason: 'kind_mismatch', got: 'line' };
    return { ok: false, reason: 'not_found' };
  }
  if (r.ambiguous) return { ok: false, reason: 'ambiguous', candidates: Array.isArray(r.candidates) ? r.candidates.slice(0, 4) : [] };
  if (r.soft) return { ok: false, reason: 'only_extent' };
  const codes = r.codes || (r.code ? [r.code] : null);
  /* the METHOD names the rung that produced the outline; an approximate answer with no rung of its own is the ladder's
     model-drawn outline. The ladder may verify the location independently of its geometry. */
  let g = geometryOf(r);
  let method = r.rrMethod || (r.composed ? 'admin_union' : r.sliced ? 'directional_slice' : r.approx ? 'model_outline' : 'osm_polygon');
  let source = r.rrSource || (r.entity && r.entity.source) || (method === 'model_outline' ? 'Atlas' : undefined);
  if (!g && codes && typeof deps.countries === 'function') {
    try { g = await deps.countries(codes); } catch (_) { g = null; }
    method = 'country'; source = 'IntMap country outlines';
  }
  if (!g) return { ok: false, reason: 'no_geometry' };
  if (LINE_TYPES.test(g.type)) return { ok: false, reason: 'kind_mismatch', got: 'line' };
  if (!AREA_TYPES.test(g.type)) return { ok: false, reason: 'kind_mismatch', got: g.type };
  return { ok: true, geometry: g, basis: shapeBasisOf(r), method, source, sourceId: r.sourceId || r.entity?.sourceId,
    sourceVersion: r.sourceVersion || r.entity?.sourceVersion, transformation: r.transformation || method };
}

async function line(nm, deps) {
  let isRiver = false;
  try { isRiver = typeof deps.isRiver === 'function' && !!deps.isRiver(nm); } catch (_) { isRiver = false; }
  if (isRiver && typeof deps.river === 'function') {
    let rv = null;
    try { rv = await deps.river(nm); } catch (_) { rv = null; }
    const g = geometryOf(rv);
    if (g && LINE_TYPES.test(g.type)) return { ok: true, geometry: g, basis: 'real', method: 'waterway', source: rv.source || 'OpenStreetMap', sourceId: rv.sourceId, sourceVersion: rv.sourceVersion, transformation: rv.transformation };
  }
  const e = await ext(nm, deps);
  if (!e || !e.geojson) return { ok: false, reason: 'not_found' };
  if (LINE_TYPES.test(e.geojson.type)) return { ok: true, geometry: e.geojson, basis: 'real', method: 'osm_line', source: 'OpenStreetMap', sourceId: e.sourceId || osmFeatureId(e), sourceVersion: e.sourceVersion };
  return { ok: false, reason: 'kind_mismatch', got: AREA_TYPES.test(e.geojson.type) ? 'area' : String(e.geojson.type) };
}

async function ext(nm, deps) {
  try { return typeof deps.extent === 'function' ? await deps.extent(nm) : null; } catch (_) { return null; }
}

/** Half of the length along the parts, without adding segments between disconnected parts. */
function lineMidpoint(geometry) {
  const parts = geometry?.type === 'LineString' ? [geometry.coordinates] : geometry?.type === 'MultiLineString' ? geometry.coordinates : [];
  if (!Array.isArray(parts)) return null;
  const lines = parts.filter((points) => Array.isArray(points) && points.length >= 2 &&
    points.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])))
    .map((coordinates) => ({ type: 'LineString', coordinates }));
  const lengths = lines.map((line) => length(line));
  let remaining = lengths.reduce((total, km) => total + km, 0) / 2;
  for (let i = 0; i < lines.length; i++) {
    if (remaining <= lengths[i]) return along(lines[i], remaining).geometry.coordinates;
    remaining -= lengths[i];
  }
  return null;
}

/** a representative point of a shape — the mean of its bounding box, for a marker when the name had no point of its own */
export function shapeAnchor(g) {
  if (shapeKindOf(g) === 'line') {
    const point = lineMidpoint(g);
    return point ? { lng: ((point[0] + 540) % 360) - 180, lat: point[1] } : null;
  }
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (c) => { if (typeof c[0] === 'number') { if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; } else c.forEach(walk); };
  try { walk(g.coordinates); } catch (_) { return null; }
  return isFinite(w) ? { lng: (w + e) / 2, lat: (s + n) / 2 } : null;
}
