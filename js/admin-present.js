/* ============================================================================
 *  admin-present.js — WHERE A PAST DATE'S SUBDIVISIONS ARE TODAY'S SUBDIVISIONS
 * ----------------------------------------------------------------------------
 *  「1950年みたいな、今と同じにもかかわらず都道府県境界がオリジナルのものかつ変な感じになってる」
 *  「絶対ほかの国もこうなってる」 (2026-11-16)
 *
 *  MEASURED 2026-11-16 at 1950-06-15 over 関西 (z7.5): the prefecture line on screen was TWO records
 *  at once — OpenHistoricalMap's tile lines (start 1872, NO end: still in force today) and
 *  data/hist-admin-fill.js (Natural Earth 10 m admin-1, simplified at 0.01°: today's prefectures,
 *  carried back). Neither is the line the map draws at Now (OpenFreeMap's `boundary`, i.e. OSM).
 *  Against that line the fill's edges were off by 1.08 km at the median, 2.81 km at p90, 4.29 km
 *  at p99 and 6.53 km at the worst of 1,301 sampled vertices. Same units, same boundaries — drawn
 *  as a different, coarser, doubled line purely because the clock had moved.
 *
 *  ⚠ THE RULE, AND IT IS NOT JAPAN'S. A unit in force at the reader's date whose record is still
 *  in force TODAY (its span is open — `f[5] >= 9999` in every bundle row) is a statement by that
 *  record that its boundary has not changed since. Where every unit in force is such a unit, the
 *  boundaries on the ground at that date ARE today's boundaries, so they are drawn by the same
 *  supply and at the same precision as at Now. Where a unit that has since ended is in force (a
 *  boundary that is no longer today's), the era record still draws it. Where no unit is in force,
 *  nothing is claimed and nothing modern is drawn either (#R530: today's provinces must never be
 *  painted over a date no record speaks for).
 *
 *  ⚠ THE SEAM BETWEEN THE TWO IS A ZONE, NOT A LINE, AND ITS WIDTH IS MEASURED. The era outlines are
 *  coarser than the present line by up to `PRESENT_EPS_KM`, so a test «is this point inside an
 *  unchanged unit» is wrong within that distance of the outline: a modern line along the coast lands
 *  in the record's sea, a modern line meeting a changed neighbour pokes into it. So:
 *    · within EPS of an unchanged unit, and not within EPS of a changed one → today's line;
 *    · within EPS of a changed unit → the era record's line (it states that boundary; the present
 *      supply does not know which of its lines are which).
 *  The era line is clipped by the SAME predicate, negated, so every piece of ground has exactly one
 *  supply — never both (a doubled boundary is what the reader complained of), never neither.
 *
 *  ⚠ PURE. No map, no window: everything here is evaluated by tests/hist-modern-admin-checks.test.mjs
 *  (.agents/rules/no-ad-hoc-hardcoding.md §5, #R505 — a check that reads source cannot see behaviour).
 * ==========================================================================*/

/* ⚠ THE CONSTANT, WITH ITS THREE FACTS (.agents/rules/no-ad-hoc-hardcoding.md §4)
   OBSERVATION: 2026-11-16, 1950-06-15, view 135.8°E 35.0°N z7.5 — every third vertex of the OpenFreeMap
     admin_level 3-4 lines in view (1,301) against the nearest edge of the first-tier units in force
     (17 from data/hist-admin-fill.js, 1 from data/hist-admin1.js): max 6.53 km. Natural Earth's 10 m
     admin-1 is the coarsest outline the first tier ships, so its worst case bounds the seam.
   EXPIRES: if a coarser outline is spliced into a tier (a new HIST_ADMIN_GAPS record), or the fill is
     rebuilt from a finer source — re-measure with the same query and move the number either way.
   OWNER: this file. js/time-admin1.js reads it from here; nothing else carries a copy. */
export const PRESENT_EPS_KM = 7;

const KM_LAT = 110.574;              /* km per degree of latitude (WGS84 mean) */
const KM_LNG0 = 111.320;             /* km per degree of longitude at the equator */

/** the span of a bundle row reaches today: the builders write an open end as year 9999 */
export function rowIsOpen(row) { return !!row && +row[5] >= 9999; }
/** the row draws a unit as it is today — its own span reaches today, or its record (an entry of HIST_ADMIN_GAPS,
    js/border-coast.js) states that every row it holds is a present-day outline (`todayOutline`) */
export function rowIsToday(row, record) { return rowIsOpen(row) || !!(record && record.todayOutline); }

function polysOf(g) {
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates || [];
  return [];
}
function bboxOfPoly(poly) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of (poly[0] || [])) { if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0]; if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1]; }
  return [w, s, e, n];
}
/* even-odd over every ring of one polygon: a hole flips the answer back, as it should */
function inPoly(poly, x, y) {
  let inside = false;
  for (const r of poly) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
  }
  return inside;
}

/* a 1° bucket index over polygon boxes — the question is asked thousands of times per view */
function makeIndex(polys) {
  const cells = new Map();
  const items = polys.map(p => ({ p, b: bboxOfPoly(p) }));
  items.forEach((it, k) => {
    const [w, s, e, n] = it.b; if (!isFinite(w)) return;
    for (let cx = Math.floor(w); cx <= Math.floor(e); cx++) for (let cy = Math.floor(s); cy <= Math.floor(n); cy++) {
      const key = cx + ':' + cy; let a = cells.get(key); if (!a) cells.set(key, a = []); a.push(k);
    }
  });
  return function has(x, y) {
    const a = cells.get(Math.floor(x) + ':' + Math.floor(y)); if (!a) return false;
    for (const k of a) { const it = items[k], b = it.b; if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue; if (inPoly(it.p, x, y)) return true; }
    return false;
  };
}

/* the points a disc of radius r is sampled at: two rings of eight, so a changed unit narrower than the gap
   between eight samples on the outer ring is still seen by the inner one */
function discOffsets(r) {
  const out = [[0, 0]];
  for (const f of [0.5, 1]) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; out.push([Math.cos(a) * r * f, Math.sin(a) * r * f]); }
  return out;
}

/**
 * makeRegion(features, { epsKm }) — the ground on which a date's subdivisions are today's.
 * `features`: the units in force at the date, each a GeoJSON Feature whose `properties._open` says
 * whether its record is still in force today.
 * Returns { empty, changed, modernAt(lng,lat), inPresent(lng,lat) }.
 */
export function makeRegion(features, opts) {
  const eps = (opts && opts.epsKm != null) ? +opts.epsKm : PRESENT_EPS_KM;
  const M = [], N = [];
  for (const f of (features || [])) {
    const ps = polysOf(f && f.geometry); if (!ps.length) continue;
    ((f.properties && f.properties._open) ? M : N).push(...ps);
  }
  const inM = makeIndex(M), inN = makeIndex(N);
  const disc = discOffsets(eps);
  function near(has, x, y) {
    const kx = KM_LNG0 * Math.max(Math.cos(y * Math.PI / 180), 0.05);
    for (const [dx, dy] of disc) if (has(x + dx / kx, y + dy / KM_LAT)) return true;
    return false;
  }
  /* the answer is a property of the GROUND, not of the segment asking, so it is memoised on a lattice a
     quarter of the seam wide: the seam is already that fuzzy, and a world view asks it for every vertex */
  const step = (eps / 4) / KM_LAT, memo = new Map();
  function modernAt(x, y) {
    if (!M.length) return false;
    const i = Math.round(x / step), j = Math.round(y / step), key = i + ':' + j;
    let v = memo.get(key); if (v !== undefined) return v;
    const cx = i * step, cy = j * step;
    v = near(inM, cx, cy) && !near(inN, cx, cy);
    if (memo.size > 400000) memo.clear();
    memo.set(key, v); return v;
  }
  return { empty: !M.length, changed: N.length, modernAt, inPresent: (x, y) => M.length > 0 && inM(x, y) };
}

/* the output owns its properties: a copy, never the source's object (a vector feature's properties are the tile's) */
const plain = (p) => Object.assign({}, p || {});

/**
 * clipLines(features, keep) — the runs of each line whose segments' midpoints satisfy keep(lng,lat).
 * A segment is kept or dropped whole; a run of kept segments stays one LineString. Properties are kept.
 */
export function clipLines(features, keep) {
  const out = [];
  for (const f of (features || [])) {
    const g = f && f.geometry; if (!g) continue;
    const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const l of lines) {
      let run = null;
      for (let i = 1; i < l.length; i++) {
        const a = l[i - 1], b = l[i];
        if (keep((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) { if (!run) run = [a]; run.push(b); }
        else if (run) { out.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: run }, properties: plain(f.properties) }); run = null; }
      }
      if (run) out.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: run }, properties: plain(f.properties) });
    }
  }
  return out;
}

/* the lng/lat box of slippy tile z/x/y */
export function tileBox(z, x, y) {
  const n = Math.pow(2, z);
  const lat = t => Math.atan(Math.sinh(Math.PI * (1 - 2 * t / n))) * 180 / Math.PI;
  return [x / n * 360 - 180, lat(y + 1), (x + 1) / n * 360 - 180, lat(y)];
}

/**
 * ownPieces(features) — features read back out of a vector source come once per tile that holds them,
 * each with the tile's buffer, and a parent tile may still be on screen beside its children. Drawn as
 * they come, a dashed line would be struck twice wherever two pieces overlap. Each segment is kept by
 * exactly one tile: the deepest one whose box holds its midpoint, and only from that tile's own piece.
 * `features[i]._z/_x/_y` are the tile MapLibre read the piece from (absent → kept as is).
 */
export function ownPieces(features) {
  const tiles = new Map();
  for (const f of (features || [])) {
    if (f == null || f._z == null) continue;
    const k = f._z + '/' + f._x + '/' + f._y; if (!tiles.has(k)) tiles.set(k, { z: f._z, b: tileBox(f._z, f._x, f._y) });
  }
  const list = Array.from(tiles.values()).sort((a, b) => b.z - a.z);
  const inB = (b, x, y) => x >= b[0] && x < b[2] && y > b[1] && y <= b[3];
  const owner = (x, y) => { for (const t of list) if (inB(t.b, x, y)) return t; return null; };
  const out = [];
  for (const f of (features || [])) {
    if (f == null) continue;
    if (f._z == null) { out.push({ type: 'Feature', geometry: f.geometry, properties: plain(f.properties) }); continue; }
    const mine = tiles.get(f._z + '/' + f._x + '/' + f._y);
    for (const g of clipLines([f], (x, y) => owner(x, y) === mine)) out.push(g);
  }
  return out;
}
