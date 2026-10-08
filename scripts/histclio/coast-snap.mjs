/* ============================================================================
 *  IntMap · data/hist-coast-snap.js — THE LAND A RECORD'S COAST LEFT OUT, GIVEN TO THE ONE POLITY THAT BOUNDS IT
 *  (coast-snap-gaps)
 * ----------------------------------------------------------------------------
 *  「1650 年・1000 年・1500 年のイスタンブール旧市街の半島の先端（アヤソフィア・トプカプ・スルタンアフメット）と
 *    ユスキュダルが、斜めの直線で塗りの外になる。」
 *
 *  ══ WHAT WAS LEFT, MEASURED ════════════════════════════════════════════════════════════════════
 *  Every record the composition draws carries its own copy of the coastline, and each copy is off the real one by up to
 *  the record's registration error — scripts/build-border-coast.mjs `inlandKmFor` measured it (Cliopatria 10 km;
 *  CShapes, OpenHistoricalMap and the historical-basemaps sheets 6 km). Where the copy runs INSIDE the real coast the
 *  land between is drawn under nothing: the tip of the old city of Istanbul lies behind a straight chord Cliopatria and
 *  the sheets draw from the Golden Horn to the Sea of Marmara, in every year from 600 BC to 1689 (dev-notes
 *  2026-10-07-hist-findings-sweep §4 measured it and left it blank, «the claim of no record»). That ground is not
 *  unknown. A record that draws the polity up to a chord a kilometre short of the shore states the polity there; the
 *  shore it could not draw is the planet's, and IntMap ships the planet's: Natural Earth 1:10m admin-0, unsimplified
 *  (data/ne-countries/, the union of its polygons is the land).
 *
 *  ══ THE RULE ═══════════════════════════════════════════════════════════════════════════════════
 *  At an instant, the uncovered land is the land less every row the page draws then (js/time-borders.js `compositeAt`
 *  below 1886 — OpenHistoricalMap in its band, Cliopatria, the nearest sheet — and `csComposite` from 1886 — CShapes,
 *  OpenHistoricalMap-late, Cliopatria). One connected piece of it is given to a row ONLY when all of these hold:
 *    ① it touches that row along an edge (a shared line, not a point);
 *    ② it touches the sea — it is the strip between a coast copy and the coast, not a hole inland;
 *    ③ every edge of it is that row, the sea, or a row of the SAME name — it touches no other polity, no unnamed shape,
 *       no row in dispute with it; two or more polities ⇒ not drawn, and counted (`two-polities`);
 *    ④ every vertex of it lies within the row's own registration band (`inlandKmFor` of its record) of the row's line —
 *       the land that record's coast could not reach, and no further (`beyond-band`, `too-far`);
 *    ⑤ the uncovered land does not run on beyond that band (the piece is whole inside it);
 *    ⑥ somewhere it is wider than two fine coastlines disagree (`COAST_AGREEMENT_KM`, below);
 *    ⑦ no land border between today's countries runs within that width of it (`present-day-border`, Land.borders): where a
 *       record's line follows a border that is still on the ground, the land beyond is a polity the record does not draw
 *       (MEASURED: Gibraltar given to Spain 1800–1950, Melilla to the Alawi sultanate and Morocco 1700–1950, Monaco to France
 *       1900–1950, before this). ⚠ It cannot see an enclave today's map has merged (Portuguese Daman 1849–1853, which OHM cuts
 *       out of the Company's Raj without drawing it) — dev-notes 2026-10-08-coast-snap-gaps §8.
 *  The piece is drawn as a ROW OF THIS FILE (never added to the record it extends): parent row, its years, and the
 *  geometry — the real coast at Natural Earth's precision (six decimals, not smoothed, not thinned) and the parent's own
 *  line. The page draws it with the parent's name and colour, and the card says what it is (js/time-borders.js
 *  `typeNote`: «the record's coast is matched to the real coastline here»). ⚠ IT STATES NO AUTHOR IT LACKS: the row
 *  names the record it extends and that the coast is Natural Earth's; no record is said to have drawn it.
 *  ⚠ WHAT IT NEVER DOES, BY CONSTRUCTION: it never crosses water (a piece is connected LAND), so it does not reach across
 *  a strait or a bay to the opposite shore; an island no row touches is touched by none (①) and stays blank; and it never
 *  overlaps a row (it is the land no row draws).
 *  ⚠ THE INSTANT IS THE PAGE'S. Rows are in force on [s, e) as the page draws them — CShapes' inclusive end is the day
 *  after, OpenHistoricalMap only in its band, a sheet over exactly the years `nearest` shows it (`sheetReach`) — and a
 *  piece is re-decided at every date the rows around it change, so it is in force only while ③ holds.
 *
 *      node scripts/build-hist-clio.mjs --coast-snap         rebuild data/hist-coast-snap.js from the committed records
 *      node scripts/build-hist-clio.mjs --coast-snap-measure  the port-city table (land grid points drawn, with and without)
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import os from 'node:os';
import vm from 'node:vm';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import pc from 'polygon-clipping';
import { water as coastWater, inlandKmFor, KM_PER_DEG } from '../build-border-coast.mjs';
import { decodeNECountries } from '../../js/ne-countries.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SNAP_FILE = 'data/hist-coast-snap.js';
const CACHE = process.env.INTMAP_CLIO_CACHE || join(tmpdir(), 'intmap-clio-cache');
export const SNAP_GLOBAL = '__HISTCOASTSNAP';
/* the land: Natural Earth 1:10m admin-0, as scripts/build-ne-countries.mjs ships it (nothing simplified or dropped) */
export const NE_LAND = 'data/ne-countries/ne_10m_admin_0_countries.json.gz';
/* ══ (coast-snap-detail) THE COASTLINE THE BASE MAP DRAWS ═══════════════════════════════════════════════════════
   REPORTED (production, build 38fd028): the Asian shore of the Bosporus at Üsküdar (Salacak, Harem, Selimiye to Kadıköy)
   was drawn under nothing in 1000, 1500 and 1650 — 240 of 919 land points of the base map. The pieces reached Natural
   Earth 1:10m's coast, which along the Bosporus is a coarse straight line; the base map (CARTO, from OpenStreetMap) draws
   the shore beyond it. MEASURED (0.001° grid, 28.995–29.040E × 41.000–41.035N): 1,034 points are land in OpenStreetMap's
   coast; 863 of them are land in Natural Earth's, 171 are not, and 73 of Natural Earth's land points are OpenStreetMap's
   sea. So the land a piece reaches is now the base map's own: OpenStreetMap's land polygons (osmdata.openstreetmap.de),
   as `@geo-maps/earth-lands-10m` 0.6.0 publishes them on npm (simplified to 10 m, five decimals, ODbL 1.0) — pinned in
   package-lock.json by its integrity and here by the sha256 of the file. It is a build-time input only; it is never
   shipped whole (what ships is the pieces).
   ⚠⚠ NOT FOR EVERY ROW — THE TERMS DECIDE (the user's decision, 2026-10-08). A piece is drawn from its parent's line and the
   coast, so it is a derivative of both. OpenStreetMap's ODbL 1.0 asks that a derivative be offered under ODbL; a record
   whose own terms ask the same of a derivative (share-alike: CShapes' CC BY-NC-SA 4.0, historical-basemaps' GPL-3.0)
   cannot be met at once with it. So a row of a share-alike record keeps Natural Earth's public-domain coast, and a row of
   a record whose terms allow it (OpenHistoricalMap CC0 1.0, Cliopatria CC BY 4.0) reaches OpenStreetMap's. The licence is
   each tier's own value below, and the gate holds it to the words its bundle's `src` states (`checkCoastSnap`), so a
   record whose terms change is refused rather than silently mixed. */
export const OSM_LAND = Object.freeze({
  file: 'node_modules/@geo-maps/earth-lands-10m/map.geo.json', pkg: '@geo-maps/earth-lands-10m', version: '0.6.0',
  sha256: '76ef0da9333e5e5c0366708ebdfc9d3a5a9e4caaec3493a0139f759fcf26fdd2',
});
/* each coast the pieces may reach, with the width two fine coastlines disagree by against it (rule ⑥, `agreementKm`):
   MEASURED 2026-10-08, every vertex of data/cshapes.js (the finest record: five decimals, no simplification) within 7 km of
   the coast, its distance to it — Natural Earth 1:10m admin-0 (594,603 vertices): p25 0.185 km, median 0.415, p75 0.868,
   p90 1.676 (the 0.413 measured when this file was written, on an earlier data/cshapes.js); OpenStreetMap's land polygons
   (510,507): p25 0.262, median 0.626, p75 1.286, p90 2.407. expires: when either coast or data/cshapes.js is rebuilt at
   another scale or precision — re-measure; canon: here. */
export const COASTS = Object.freeze({
  ne: Object.freeze({ id: 'ne', file: NE_LAND, name: 'Natural Earth 1:10m admin-0', licence: 'public domain', agreementKm: 0.413 }),
  osm: Object.freeze({ id: 'osm', file: OSM_LAND.file, name: 'OpenStreetMap land polygons (osmdata.openstreetmap.de, via ' + OSM_LAND.pkg + ' ' + OSM_LAND.version + ', 10 m)', licence: 'ODbL 1.0', agreementKm: 0.626 }),
});
/* the records the page composes, highest precision first — the order the builders cut them against each other, and the
   order a piece is given to when two rows of one name bound it (the first of them draws it). `licence` is the record's own
   terms as its bundle states them; `shareAlike` whether those terms ask a derivative to carry them (see above) */
export const TIERS = Object.freeze([
  { t: 'cshapes', file: 'data/cshapes.js', global: '__CSHAPES', licence: 'CC BY-NC-SA 4.0', shareAlike: true },
  { t: 'ohm-late', file: 'data/hist-borders-late.js', global: '__HISTBLATE', licence: 'CC0 1.0', shareAlike: false },
  { t: 'ohm', file: 'data/hist-borders.js', global: '__HISTB', licence: 'CC0 1.0', shareAlike: false },
  { t: 'clio', file: 'data/hist-clio.js', global: '__HISTCLIO', licence: 'CC BY 4.0', shareAlike: false },
  { t: 'sheet', file: 'data/hist-eras-rest.js', global: '__HISTERASREST', licence: 'GPL-3.0', shareAlike: true },
]);
/* the coast a row of tier `t` reaches: a share-alike record keeps the public-domain coast */
export const coastOf = (t) => { const T = TIERS.find((x) => x.t === t); return T && !T.shareAlike ? 'osm' : 'ne'; };
export const SRC = 'IntMap, derived (coast-snap-gaps): the land between a record\'s copy of the coast and the real coast, drawn under the one polity whose row bounds it — each row names the row it extends; its landward edge is that row\'s own line, under that record\'s terms (data/hist-clio.js CC BY 4.0, data/hist-eras-rest.js GPL-3.0, data/cshapes.js CC BY-NC-SA 4.0, OpenHistoricalMap CC0 1.0). The coast (`coasts` names it for each record): for OpenHistoricalMap and Cliopatria rows, OpenStreetMap\'s land polygons © OpenStreetMap contributors (ODbL 1.0, openstreetmap.org/copyright; osmdata.openstreetmap.de via @geo-maps/earth-lands-10m 0.6.0), and those rows are offered under ODbL 1.0; for the share-alike records (CShapes, historical-basemaps), Natural Earth 1:10m admin-0 (public domain, unsimplified)';

/* ── dates: sortable YYYYMMDD (negative years sort correctly: month·100+day < 10000) ── */
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const unymd = (k) => { const y = Math.floor(k / 10000), r = k - y * 10000; return [y, Math.floor(r / 100), r % 100]; };
const MLEN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function dayAfter(y, m, d) { const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; const n = m === 2 && leap ? 29 : MLEN[m - 1];
  return d < n ? ymd(y, m, d + 1) : m < 12 ? ymd(y, m + 1, 1) : ymd(y + 1, 1, 1); }

const evalBundle = (rel, g) => { const w = {}; new Function('window', readFileSync(join(ROOT, rel), 'utf8'))(w); return w[g]; };
export const sha = (rel) => createHash('sha256').update(readFileSync(join(ROOT, rel))).digest('hex');
let _FLOOR = null;
/* the clock's floor — js/hist-scale.js's own value (evaluated, the way scripts/hist-fidelity.mjs reads it) */
function clockFloor() {
  if (_FLOOR != null) return _FLOOR;
  const w = {}; vm.runInNewContext(readFileSync(join(ROOT, 'js', 'hist-scale.js'), 'utf8'), { window: w, Date, Math });
  return (_FLOOR = w.IntMapHistScale.FLOOR);
}

/* ══ WHICH SHEET THE PAGE SHOWS IN A YEAR ════════════════════════════════════════════════════════
   ⚠ A COPY OF js/time-borders.js `nearest` FOR YEARS BELOW CShapes (its MAXGAP branch never applies there): the page's
   rule lives inside the module's closure and has no export a build can call. The two are held equal by
   tests/coast-snap-gaps-checks.test.mjs, which evaluates the page's own function. */
export function nearestSheet(y, years) {
  let prev = null, next = null;
  for (const yy of years) { if (yy <= y) { if (prev === null || yy > prev) prev = yy; } else if (next === null || yy < next) next = yy; }
  if (prev === null) return next != null ? next : years[0];
  if (next === null) return prev;
  return (next - y) >= (y - prev) ? prev : next;
}
/* the years [lo, hi] a sheet is shown below CShapes (`csMin`), found by asking `nearestSheet` (js/time-borders.js `_sheetReach`) */
export function sheetReach(y, years, floor, csMin) {
  const ys = years.slice().sort((a, b) => a - b), i = ys.indexOf(y), shows = (Y) => nearestSheet(Y, ys) === y;
  let lo = i > 0 ? ys[i - 1] : Math.min(floor, y), hi = y;
  while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (shows(mid)) hi = mid; else lo = mid + 1; }
  if (i === ys.length - 1) return [lo, csMin - 1];
  let a = y, b = ys[i + 1];
  while (a < b) { const mid = Math.ceil((a + b) / 2); if (shows(mid)) a = mid; else b = mid - 1; }
  return [lo, Math.min(a, csMin - 1)];
}

/* ══ THE ROWS, AS THE PAGE DRAWS THEM ════════════════════════════════════════════════════════════
   → { rows: [{ k, t, rank, i, sy, name, s, e, polys, bb, band }], heads, csMin, csMax, years }
   `i` is the row's index in its bundle (for a sheet, the feature's index in its sheet, `sy` the sheet's year; a sheet's
   unnamed shapes are rows with i = −1 − blank index). `name` is the record's English, '' where it draws the shape
   without one (a sheet's blank, a name Cliopatria's review withholds). Cliopatria's realms are not rows: a realm is the
   union of member rows drawn over them (scripts/hist-fidelity.mjs counts its ground through them the same way). */
export function loadRows() {
  const heads = {}, rows = [];
  const B = Object.fromEntries(TIERS.map((T) => [T.t, existsSync(join(ROOT, T.file)) ? evalBundle(T.file, T.global) : null]));
  for (const T of TIERS) { const d = B[T.t]; heads[T.t] = d ? { file: T.file, sha: sha(T.file) } : null; }
  const cs = B.cshapes; let csMin = Infinity, csMax = -Infinity;
  for (const f of cs.feats) { csMin = Math.min(csMin, f[2]); csMax = Math.max(csMax, f[5]); }
  const CS0 = ymd(csMin, 1, 1), CS1 = ymd(csMax + 1, 1, 1);
  const res = (d, polys) => polys.map((p) => p.map((ri) => d.rings[ri]));
  const push = (T, rank, i, name, s, e, polys, sy, f) => {
    if (!(s < e) || !polys.length) return;
    rows.push({ k: rows.length, t: T.t, rank, i, sy: sy == null ? null : sy, name, s, e, polys, bb: bbox(polys), band: inlandKmFor(T.global), f: f || null });
  };
  TIERS.forEach((T, rank) => {
    const d = B[T.t]; if (!d) return;
    if (T.t === 'cshapes') d.feats.forEach((f, i) => push(T, rank, i, String(f[0] || ''), Math.max(ymd(f[2], f[3], f[4]), CS0), Math.min(dayAfter(f[5], f[6], f[7]), CS1), res(d, f[8]), null, f));
    else if (T.t === 'ohm-late' || T.t === 'ohm') {
      const lo = ymd(d.window[0], 1, 1), hi = ymd(d.window[1] + 1, 1, 1);
      d.feats.forEach((f, i) => push(T, rank, i, (f[0] && f[0].en) || '', Math.max(ymd(f[2], f[3], f[4]), lo), Math.min(ymd(f[5], f[6], f[7]), hi), res(d, f[8]), null, f));
    } else if (T.t === 'clio') {
      const lo = ymd(d.window[0], 1, 1), hi = ymd(d.window[1] + 1, 1, 1);
      d.feats.forEach((f, i) => { if (f[9] && f[9].r) return; push(T, rank, i, (f[0] && f[0].en) || '', Math.max(ymd(f[2], f[3], f[4]), lo), Math.min(ymd(f[5], f[6], f[7]), hi), res(d, f[8]), null, f); });
    } else if (T.t === 'sheet') {
      const ys = d.snaps.map((s) => s.y), floor = clockFloor();
      for (const sn of d.snaps) {
        const [a, b] = sheetReach(sn.y, ys, floor, csMin); if (b < a) continue;
        const s = ymd(a, 1, 1), e = ymd(b + 1, 1, 1);
        sn.feats.forEach((f, i) => push(T, rank, i, (f[0] && f[0].en) || '', s, e, res(d, f[2]), sn.y, f));
        (sn.blank || []).forEach((ids, j) => push(T, rank, -1 - j, '', s, e, res(d, ids), sn.y));
      }
    }
  });
  return { rows, heads, csMin, csMax, bundles: B };
}

/* ── geometry helpers ─────────────────────────────────────────────────────── */
export function bbox(polys) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of polys) for (const [x, y] of p[0]) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
  return b;
}
const meets = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const closed = (r) => (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) ? r.concat([r[0]]) : r);
const toPC = (polys) => polys.map((p) => p.map(closed));
/* Sutherland–Hodgman against an axis-aligned box (the clipping scripts/build-hist-clio.mjs `clipRing` does for cutters):
   a concave ring may come back with zero-width runs along the box edge, which polygon-clipping resolves */
function clipRing(ring, [x0, y0, x1, y1]) {
  let pts = ring;
  if (pts.length && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1);
  const E = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1]],
  ];
  for (const [inside, cross] of E) {
    const out = [];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], ia = inside(a), ib = inside(b); if (ia) out.push(a); if (ia !== ib) out.push(cross(a, b)); }
    pts = out; if (pts.length < 3) return null;
  }
  return pts;
}
function clipPolys(polys, box) {
  const out = [];
  for (const p of polys) {
    const sh = clipRing(p[0], box); if (!sh) continue;
    const q = [closed(sh)]; for (const h of p.slice(1)) { const c = clipRing(h, box); if (c) q.push(closed(c)); }
    out.push(q);
  }
  return out;
}
const ringArea = (r) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return s / 2; };
function inRing(r, x, y) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
export const inPolys = (polys, x, y) => polys.some((p) => inRing(p[0], x, y) && !p.slice(1).some((h) => inRing(h, x, y)));
const kmPerDegX = (lat) => KM_PER_DEG * Math.cos(lat * Math.PI / 180);

/* a grid of segments — «is this point ON one of these lines» and «is any of these lines within d km» in O(1) average */
class SegIndex {
  constructor(rings, cell = 0.05) {
    this.c = cell; this.m = new Map();
    for (const r of rings) for (let i = 0, n = r.length; i < n; i++) {
      const a = r[i], b = r[(i + 1) % n]; if (a[0] === b[0] && a[1] === b[1]) continue;
      const s = [a[0], a[1], b[0], b[1]];
      const cx0 = Math.floor(Math.min(a[0], b[0]) / cell), cx1 = Math.floor(Math.max(a[0], b[0]) / cell);
      const cy0 = Math.floor(Math.min(a[1], b[1]) / cell), cy1 = Math.floor(Math.max(a[1], b[1]) / cell);
      for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) { const k = cx * 100003 + cy; const L = this.m.get(k); if (L) L.push(s); else this.m.set(k, [s]); }
    }
  }
  /* planar distance² in degrees from (x, y) to segment s, with longitude scaled by kx */
  static d2(s, x, y, kx = 1) {
    const ax = (s[0] - x) * kx, ay = s[1] - y, ex = (s[2] - s[0]) * kx, ey = s[3] - s[1], L = ex * ex + ey * ey;
    let t = L ? -(ax * ex + ay * ey) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + t * ex, qy = ay + t * ey; return qx * qx + qy * qy;
  }
  on(x, y, tol = 1e-8) {
    const c = this.c, k = Math.floor(x / c) * 100003 + Math.floor(y / c), L = this.m.get(k), t2 = tol * tol;
    if (L) for (const s of L) if (SegIndex.d2(s, x, y) <= t2) return true;
    /* a point exactly on a cell line may be filed in the neighbour */
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) { if (!dx && !dy) continue; const M = this.m.get((Math.floor(x / c) + dx) * 100003 + Math.floor(y / c) + dy); if (M) for (const s of M) if (SegIndex.d2(s, x, y) <= t2) return true; }
    return false;
  }
  /* is some segment within `km` of the point (lat-scaled planar) */
  near(x, y, km) {
    const kx = Math.cos(y * Math.PI / 180), dy = km / KM_PER_DEG, dx = dy / Math.max(kx, 0.01), c = this.c, d2 = dy * dy;
    for (let cx = Math.floor((x - dx) / c); cx <= Math.floor((x + dx) / c); cx++) for (let cy = Math.floor((y - dy) / c); cy <= Math.floor((y + dy) / c); cy++) {
      const L = this.m.get(cx * 100003 + cy); if (L) for (const s of L) if (SegIndex.d2(s, x, y, kx) <= d2) return true;
    }
    return false;
  }
}

/* ══ THE LAND ═══════════════════════════════════════════════════════════════════════════════════
   Natural Earth's polygons are whole countries (Russia's mainland ring has tens of thousands of points), so they are cut
   once into 1° tiles (Sutherland–Hodgman, then polygon-clipping's union — a tile's land is one clean multipolygon with
   the borders between countries dissolved), and a band cell asks its tile. The coast segments themselves are indexed
   whole, for «is this edge the coast».
   (coast-snap-detail) `new Land('osm')` is OpenStreetMap's land instead (COASTS.osm — already one polygon set with no
   borders inside it). Its `agreementKm` is that coast's (rule ⑥); the land borders between today's countries (rule ⑦)
   are always Natural Earth's, the only source here that draws them. */
const readNE = () => { const g = decodeNECountries(JSON.parse(gunzipSync(readFileSync(join(ROOT, NE_LAND))))), out = [];
  for (const f of g.features) { const c = f.geometry.coordinates; for (const p of f.geometry.type === 'Polygon' ? [c] : c) out.push({ p, b: bbox([p]) }); }
  return out; };
export function readOSMLand() {
  const file = join(ROOT, OSM_LAND.file);
  if (!existsSync(file)) throw new Error(OSM_LAND.file + ' is missing — npm ci installs ' + OSM_LAND.pkg + ' (a devDependency)');
  const buf = readFileSync(file), h = createHash('sha256').update(buf).digest('hex');
  if (h !== OSM_LAND.sha256) throw new Error(OSM_LAND.file + ' is not the file this rule was measured against (sha256 ' + h + ')');
  const g = JSON.parse(buf.toString('utf8')), out = [];
  for (const geom of g.geometries || [g]) for (const p of geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates) out.push({ p, b: bbox([p]) });
  return out;
}
export class Land {
  constructor(coast = 'ne') {
    this.id = coast; this.agreementKm = COASTS[coast].agreementKm;
    this.polys = coast === 'osm' ? readOSMLand() : readNE();
    this.byTile = new Map();
    for (const q of this.polys) for (let x = Math.floor(q.b[0]); x <= Math.floor(q.b[2]); x++) for (let y = Math.floor(q.b[1]); y <= Math.floor(q.b[3]); y++) { const k = x * 1000 + y; const L = this.byTile.get(k); if (L) L.push(q); else this.byTile.set(k, [q]); }
    this.tiles = new Map(); this.cells = new Map(); this.tileBoxes = new WeakMap();
    /* the latitudes the coast reaches (a vertex at a pole closes Antarctica's ring round the pole and is not a coast) — no
       piece can lie further poleward than these plus a band, and near a pole a degree of longitude is metres wide, so the
       band's cells there would be millions (MEASURED: the sheets' «Antarctica», whose ring runs along 90°S, did not finish) */
    let lo = Infinity, hi = -Infinity;
    for (const q of this.polys) for (const r of q.p) for (const [, y] of r) if (Math.abs(y) < 89.9) { if (y < lo) lo = y; if (y > hi) hi = y; }
    this.coastLat = [lo, hi];
    this._coast = null;
  }
  get coast() { return this._coast || (this._coast = new SegIndex(this.polys.flatMap((q) => q.p), 0.05)); }
  /* the land borders between today's countries: the edges two of Natural Earth's admin-0 polygons share (its polygons are cut
     from one set of arcs, so a shared edge has the same two vertices in both) — read by rule ⑦ */
  get borders() {
    if (this._borders) return this._borders;
    const seen = new Map(), segs = [];
    (this.id === 'ne' ? this.polys : readNE()).forEach((q, qi) => { for (const r of q.p) for (let i = 0; i + 1 < r.length; i++) {
      const a = r[i], b = r[i + 1], k = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? a.join(',') + '|' + b.join(',') : b.join(',') + '|' + a.join(',');
      const o = seen.get(k); if (o == null) seen.set(k, qi); else if (o !== qi && o >= 0) { segs.push([a, b]); seen.set(k, -1); } } });
    return (this._borders = new SegIndex(segs, 0.05));
  }
  tile(x, y) {
    const k = x * 1000 + y; if (this.tiles.has(k)) return this.tiles.get(k);
    const box = [x, y, x + 1, y + 1], pieces = [];
    for (const q of this.byTile.get(k) || []) { const c = clipPolys([q.p], box); for (const p of c) pieces.push(p); }
    let u = null;
    if (pieces.length) { try { u = pc.union(...pieces.map((p) => [p])); } catch (_) { u = pieces; } if (!u.length) u = null; }
    /* (coast-snap-detail) bounded: a worker visits the coast of the whole world over its rows, and OpenStreetMap's tiles are
       an order of magnitude heavier than Natural Earth's */
    if (this.tiles.size > 3000) this.tiles.clear();
    this.tiles.set(k, u); return u;
  }
  /* the land of one band cell: n cells per degree, so cells align with the tiles and two neighbours share exact edges */
  cell(n, cx, cy) {
    const key = n + ':' + cx + ':' + cy; if (this.cells.has(key)) return this.cells.get(key);
    const box = [cx / n, cy / n, (cx + 1) / n, (cy + 1) / n], T = this.tile(Math.floor(cx / n), Math.floor(cy / n));
    let u = null;
    /* (coast-snap-detail) ⚠ CUT TO THE BOX FIRST, MEASURED: polygon-clipping's sweep over the whole 1° tile for each of its
       n² cells was the cost — OpenStreetMap's Arctic coast has tens of thousands of vertices a tile, and OpenHistoricalMap's
       «Russian Empire» did not finish one row in ten minutes. Sutherland–Hodgman against the cell (linear, and only the tile's
       polygons whose box meets it) leaves the same region with possible zero-width runs on the box edge, which the
       intersection with the box then resolves exactly as before, on a few hundred vertices instead of the tile's. */
    if (T) {
      const bb = this.tileBoxes.get(T) || (this.tileBoxes.set(T, T.map((p) => bbox([p]))), this.tileBoxes.get(T));
      const pre = clipPolys(T.filter((_, i) => meets(bb[i], box)), box);
      if (pre.length) { try { u = pc.intersection(pre, [[[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]], [box[0], box[1]]]]); } catch (_) { u = null; } }
      if (u && !u.length) u = null;
    }
    if (this.cells.size > 40000) this.cells.clear();
    this.cells.set(key, u); return u;
  }
  onLand(x, y) { const T = this.tile(Math.floor(x), Math.floor(y)); return !!T && inPolys(T, x, y); }
}

/* ══ ONE ROW: THE PIECES IT IS GIVEN, AT EVERY INSTANT ════════════════════════════════════════════
   R the parent row, all the rows (for its neighbours), a spatial index of rows, the land, and water (the 2 km authority,
   only to skip cells far from any coast). → { out: [{ s, e, polys }], why: { verdict: pieces judged } }
   ⚠⚠ WORKED CELL BY CELL, AND JOINED ACROSS CELL EDGES — MEASURED. The first version made «the land within the band, less
   R» one polygon (one union of every band cell) and subtracted the rows in force from it. Around a large polity that
   polygon is a ring the length of its whole frontier: the union of 4,096 cells failed in polygon-clipping for the Ottoman
   Empire of 1648–1662 (and the Rashidun Caliphate), so the old city of Istanbul was not judged at all, and every row
   around the ring re-cut the whole of it at each of its neighbours' dates. Now each band cell is cut on its own (land less
   R less the rows in force there — small, and memoised on which rows those are), and at each instant the pieces are
   joined into connected pieces of uncovered land through the cell edges they share; a piece whose edge meets a cell
   outside the band is land that runs on beyond it (⑤). Only a piece that is given is ever unioned. */
const EPS_ON = 1e-8, EPS_SIDE = 1e-12, EPS_IV = 1e-9;
/* ══ ⚠⚠ THE AUTHORITY'S OWN AGREEMENT — A PIECE NARROWER THAN IT IS NOT LAND A RECORD LEFT OUT ═══════════════════════════
   Natural Earth's coast is believed over a record's copy because the records' bands (`inlandKmFor`, 6–10 km) were measured
   against it. Below some width it is not the better of the two. MEASURED 2026-10-08: the 198,211 vertices of data/cshapes.js
   (the finest record: five decimals, no simplification) within 7 km of Natural Earth 1:10m admin-0's coast lie from it at
   p25 0.184 km, median 0.413, p75 0.860, p90 1.659 — two independent fine coastlines disagree by about 0.4 km as a rule. A
   strip between a record's coast and Natural Earth's that is narrower than that median EVERYWHERE is the two coasts
   disagreeing, not land either record left out; it is not drawn (`within-the-coasts-agreement`). «Everywhere» is asked of
   the strip's parts cell by cell (each part's mean width, 2·area over the length of its edges that are not its cell's box —
   the width of a strip that crosses the cell), and the strip is land when ANY part is wider. ⚠ NOT THE WHOLE STRIP'S MEAN,
   MEASURED: in 1500 the tip of the old city of Istanbul (about a kilometre across) is one strip with 40 km of the Marmara
   shore west of it, a few tens of metres wide, and the strip's mean width fell under the median — the tip was not drawn.
   MEASURED what it costs: CShapes' Canada of 1948–2019 was given 69,500 pieces before this (336 s), its Turkey 4,289 —
   slivers between two fine coasts, kilometres long and tens of metres wide; the old city of Istanbul is not one of them.
   expires: when data/ne-countries/ or data/cshapes.js is rebuilt at another scale or precision — re-measure the distances;
   canon: here. */
export const COAST_AGREEMENT_KM = COASTS.ne.agreementKm;   /* (coast-snap-detail) Natural Earth's; OpenStreetMap's is COASTS.osm */
/* polygon-clipping, retried on coordinates snapped finer than any record's precision when it cannot close a ring */
const snapTo = (q) => (g) => g.map((p) => p.map((r) => r.map(([x, y]) => [Math.round(x * q) / q, Math.round(y * q) / q])));
function safe(op, ...args) {
  try { return pc[op](...args); } catch (e) {
    for (const q of [1e9, 1e8]) { try { return pc[op](...args.map(snapTo(q))); } catch (_) { /* finer did not help */ } }
    throw e;
  }
}
const segIx = new Map();
function segOf(o) { let s = segIx.get(o.k); if (!s) { if (segIx.size > 600) segIx.clear(); s = new SegIndex(o.polys.flatMap((p) => p), 0.05); segIx.set(o.k, s); } return s; }
let UID = 0;
/* a row's polygons inside a cell: clipped first to the cell's 1° tile (once per row and tile — a frontier row has thousands of
   points and is asked for by hundreds of cells) and then to the cell. Cells align with the tiles (n cells per degree). */
const tileIx = new Map();
function partsIn(o, box) {
  let T = tileIx.get(o.k);
  if (!T) { if (tileIx.size > 600) tileIx.clear(); T = { pb: o.polys.map((p) => bbox([p])), t: new Map() }; tileIx.set(o.k, T); }
  const tx = Math.floor(box[0] + 1e-9), ty = Math.floor(box[1] + 1e-9), key = tx * 1000 + ty;
  let L = T.t.get(key);
  if (!L) { const tb = [tx, ty, tx + 1, ty + 1]; L = []; o.polys.forEach((p, i) => { if (meets(T.pb[i], tb)) for (const q of clipPolys([p], tb)) L.push(q); }); T.t.set(key, L); }
  return L.length ? clipPolys(L, box) : [];
}
/* the cells of a grid of n per degree that the segment (ax, ay)–(bx, by) passes through — Amanatides & Woo's traversal, and
   both neighbours where it passes exactly through a corner */
export function cellsOfSegment(ax, ay, bx, by, n, add) {
  let x = Math.floor(ax * n), y = Math.floor(ay * n);
  const x1 = Math.floor(bx * n), y1 = Math.floor(by * n), dx = bx - ax, dy = by - ay, sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  add(x, y);
  if (x === x1 && y === y1) return;
  const tdx = dx ? 1 / Math.abs(dx * n) : Infinity, tdy = dy ? 1 / Math.abs(dy * n) : Infinity;
  let tx = dx ? (sx > 0 ? (x + 1) / n - ax : ax - x / n) / Math.abs(dx) : Infinity, ty = dy ? (sy > 0 ? (y + 1) / n - ay : ay - y / n) / Math.abs(dy) : Infinity;
  for (let guard = 0; Math.min(tx, ty) <= 1 && guard < 1e7; guard++) {
    if (tx < ty) { x += sx; tx += tdx; } else if (ty < tx) { y += sy; ty += tdy; } else { add(x + sx, y); add(x, y + sy); x += sx; y += sy; tx += tdx; ty += tdy; }
    add(x, y);
  }
  add(x1, y1);
}
/* one band cell at one set of rows in force: its pieces of uncovered land, each with what its edges touch */
function cellPieces(R, c, inF, Rseg, coast, B, borders, agree) {
  const cut = c.rc.slice(); for (const o of inF) for (const p of partsIn(o, c.box)) cut.push(p);
  let res;
  try { res = cut.length ? safe('difference', c.L, ...cut.map((p) => [p])) : c.L; } catch (_) { return { failed: true, pieces: [] }; }
  const [x0, y0, x1, y1] = c.box, pieces = [];
  for (const poly of res) {
    const P = { uid: ++UID, poly, cell: c, side: { W: [], E: [], S: [], N: [] }, tR: false, tS: false, other: false, later: false, odd: false, far: false, border: false, with: new Set() };
    for (const r of poly) for (let i = 0; i + 1 < r.length; i++) {
      const a = r[i], b = r[i + 1]; if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 1e-12) continue;
      if (Math.abs(a[0] - x0) < EPS_SIDE && Math.abs(b[0] - x0) < EPS_SIDE) { P.side.W.push([Math.min(a[1], b[1]), Math.max(a[1], b[1])]); continue; }
      if (Math.abs(a[0] - x1) < EPS_SIDE && Math.abs(b[0] - x1) < EPS_SIDE) { P.side.E.push([Math.min(a[1], b[1]), Math.max(a[1], b[1])]); continue; }
      if (Math.abs(a[1] - y0) < EPS_SIDE && Math.abs(b[1] - y0) < EPS_SIDE) { P.side.S.push([Math.min(a[0], b[0]), Math.max(a[0], b[0])]); continue; }
      if (Math.abs(a[1] - y1) < EPS_SIDE && Math.abs(b[1] - y1) < EPS_SIDE) { P.side.N.push([Math.min(a[0], b[0]), Math.max(a[0], b[0])]); continue; }
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      let hit = false;
      if (Rseg.on(mx, my, EPS_ON)) { P.tR = true; hit = true; }
      if (coast.on(mx, my, EPS_ON)) { P.tS = true; hit = true; }
      for (const o of inF) {
        if (mx < o.bb[0] - 1e-6 || mx > o.bb[2] + 1e-6 || my < o.bb[1] - 1e-6 || my > o.bb[3] + 1e-6) continue;
        if (!segOf(o).on(mx, my, EPS_ON)) continue;
        hit = true;
        if (o.name !== R.name || !o.name) { P.other = true; P.with.add(o.t + ':' + (o.name || '(unnamed)')); }
        else if (o.rank < R.rank || (o.rank === R.rank && o.k < R.k)) P.later = true;   /* a row of the same name ahead of R draws it */
      }
      if (!hit) P.odd = true;
    }
    for (const r of poly) { for (const [x, y] of r) if (!Rseg.near(x, y, B)) { P.far = true; break; } if (P.far) break; }
    P.km2 = polyKm2(poly); P.edgeKm = edgeKm(poly, c.box);
    for (const r of poly) { for (const [x, y] of r) if (borders.near(x, y, agree)) { P.border = true; break; } if (P.border) break; }
    pieces.push(P);
  }
  return { failed: false, pieces };
}
/* a piece's area (km²) and the length of its edges that are not on its cell's box (km) — summed over a joined piece, the
   two give its mean width (2·area / perimeter), the joins between cells being on the boxes */
function polyKm2(poly) { let A = 0; poly.forEach((r, k) => { const lat = r[0][1], kx = kmPerDegX(lat); let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * kx * (r[j][1] + r[i][1]) * KM_PER_DEG; A += (k ? -1 : 1) * Math.abs(a / 2); }); return A; }
function edgeKm(poly, [x0, y0, x1, y1]) { let L = 0; for (const r of poly) for (let i = 0; i + 1 < r.length; i++) { const a = r[i], b = r[i + 1];
  const onBox = (Math.abs(a[0] - x0) < EPS_SIDE && Math.abs(b[0] - x0) < EPS_SIDE) || (Math.abs(a[0] - x1) < EPS_SIDE && Math.abs(b[0] - x1) < EPS_SIDE) || (Math.abs(a[1] - y0) < EPS_SIDE && Math.abs(b[1] - y0) < EPS_SIDE) || (Math.abs(a[1] - y1) < EPS_SIDE && Math.abs(b[1] - y1) < EPS_SIDE);
  if (!onBox) L += Math.hypot((b[0] - a[0]) * kmPerDegX((a[1] + b[1]) / 2), (b[1] - a[1]) * KM_PER_DEG); } return L; }
/* FNV-1a over a group's sorted piece ids, and its size — the key the verdict and the union are remembered by */
function sigOf(G) { const u = G.map((P) => P.uid).sort((a, b) => a - b); let h = 2166136261; for (const x of u) { h ^= x; h = Math.imul(h, 16777619); h ^= x >>> 16; h = Math.imul(h, 16777619); } return (h >>> 0) + ':' + u.length + ':' + u[0]; }
const overlaps = (A, Bs) => A.some(([a, b]) => Bs.some(([c, d]) => Math.min(b, d) - Math.max(a, c) > EPS_IV));
const round6 = (p) => p.map((r) => { const o = []; for (const q of r.slice(0, -1)) { const x = +q[0].toFixed(6), y = +q[1].toFixed(6); const l = o[o.length - 1]; if (!l || l[0] !== x || l[1] !== y) o.push([x, y]); } if (o.length > 1 && o[0][0] === o[o.length - 1][0] && o[0][1] === o[o.length - 1][1]) o.pop(); return o; })
  .filter((r) => r.length >= 3 && Math.abs(ringArea(r)) > 1e-12);
/* `lands` is one Land, or { ne, osm } (each a Land or a function returning one) from which the row's coast is taken (`coastOf`) */
export function snapRow(R, rows, grid, lands, water, debug = null) {
  const why = {}; const no = (k) => { why[k] = (why[k] || 0) + 1; };
  if (!R.name) return { out: [], why };
  const land = lands instanceof Land ? lands : (typeof lands[coastOf(R.t)] === 'function' ? lands[coastOf(R.t)]() : lands[coastOf(R.t)]);
  const B = R.band, n = Math.ceil(KM_PER_DEG / B), coast = land.coast;
  const latLo = land.coastLat[0] - B / KM_PER_DEG - 1 / n, latHi = land.coastLat[1] + B / KM_PER_DEG + 1 / n, inLat = (y) => y >= latLo && y <= latHi;
  /* 1. the cells R's line passes through, widened by the band */
  /* ⚠ EVERY cell an edge crosses, found by walking the grid (`cellsOfSegment`), not by sampling points along the edge: a cell
     not on the line is taken as all R or all not-R by its centre, so a cell an edge only clips at a corner, missed by the
     samples, had its land given whole — MEASURED: the gate found 48 pieces inside their own parent (the Nile delta under
     every Egyptian row from 3000 BC, a corner of the Roman Empire's Syrtis coast) */
  const line = new Set();
  for (const p of R.polys) for (const r of p) for (let i = 0, m = r.length; i < m; i++) {
    const a = r[i], b = r[(i + 1) % m];
    cellsOfSegment(a[0], a[1], b[0], b[1], n, (cx, cy) => { if (inLat((cy + 0.5) / n)) line.add(cx + ',' + cy); });
  }
  /* …and every cell within the band of that line (its centre within B plus its half-diagonal): ④ bounds a piece to the band,
     so a cell beyond it can only hold land that runs on beyond it, which the join reads from the band's edge (⑤) */
  const Rseg = new SegIndex(R.polys.flatMap((p) => p), 0.05);
  const want = new Map(), seen = new Set();   /* "cx,cy" → onLine */
  const ry = Math.ceil(B * n / KM_PER_DEG) + 1;
  for (const key of line) {
    const [cx, cy] = key.split(',').map(Number), lat = Math.min(89, Math.abs((cy + 0.5) / n) + 1 / n), rx = Math.ceil(B * n / kmPerDegX(lat)) + 1;
    for (let dx = -rx; dx <= rx; dx++) for (let dy = -ry; dy <= ry; dy++) {
      const k2 = (cx + dx) + ',' + (cy + dy); if (seen.has(k2)) continue; seen.add(k2);
      if (!inLat((cy + dy + 0.5) / n)) continue;
      if (line.has(k2)) { want.set(k2, true); continue; }
      const x = (cx + dx + 0.5) / n, y = (cy + dy + 0.5) / n, half = Math.hypot(0.5 / n * kmPerDegX(Math.min(89, Math.abs(y))), 0.5 / n * KM_PER_DEG);
      if (Rseg.near(x, y, B + half)) want.set(k2, false);
    }
  }
  /* a cell farther from any coast than the band (plus its half-diagonal and the authority's 2 km) cannot hold a piece; a cell
     R's line does not cross is all R or all not-R */
  const cells = new Map();
  for (const [key, onLine] of want) {
    const [cx, cy] = key.split(',').map(Number), x = (cx + 0.5) / n, y = (cy + 0.5) / n;
    if (x < -180 || x > 180 || y < -90 || y > 90) continue;
    const half = Math.hypot(0.5 / n * kmPerDegX(Math.abs(y)), 0.5 / n * KM_PER_DEG);
    if (water.distKm(x, y, B + half + 2) > B + half + 2) continue;
    if (!onLine && inPolys(R.polys, x, y)) continue;
    const L = land.cell(n, cx, cy); if (!L) continue;
    const box = [cx / n, cy / n, (cx + 1) / n, (cy + 1) / n];
    cells.set(key, { key, cx, cy, box, L, rc: onLine ? partsIn(R, box) : [], N: [] });
  }
  if (!cells.size) return { out: [], why };
  /* 2. the rows that may draw in each cell over R's years, and the dates any of them changes */
  const rowCells = new Map();
  for (const c of cells.values()) {
    c.N = grid.query(c.box).filter((o) => o.k !== R.k && o.s < R.e && o.e > R.s && meets(o.bb, c.box));
    for (const o of c.N) { let L = rowCells.get(o.k); if (!L) rowCells.set(o.k, L = []); L.push(c); }
  }
  const at = new Map();   /* date → rows starting or ending then */
  for (const c of cells.values()) for (const o of c.N) for (const t of [o.s, o.e]) if (t > R.s && t < R.e) { let L = at.get(t); if (!L) at.set(t, L = new Set()); L.add(o.k); }
  const dates = [R.s, ...[...at.keys()].sort((a, b) => a - b), R.e];
  /* 3. at each instant: every cell's pieces (re-cut only where a row changed), joined through shared cell edges */
  const memo = new Map(), cur = new Map(), comps = new Map(), runs = [], open = new Map();
  const geomKey = (C) => C.gk || (C.gk = JSON.stringify(C.polys));
  const judgeCell = (c, t0) => {
    const inF = c.N.filter((o) => o.s <= t0 && o.e > t0), mk = c.key + '|' + inF.map((o) => o.k).join(',');
    let r = memo.get(mk); if (!r) { if (memo.size > 60000) memo.clear(); r = cellPieces(R, c, inF, Rseg, coast, B, land.borders, land.agreementKm); memo.set(mk, r); if (r.failed) no('clip-failed-cell'); }
    cur.set(c.key, r);
  };
  for (let j = 0; j + 1 < dates.length; j++) {
    const t0 = dates[j], t1 = dates[j + 1];
    if (j === 0) for (const c of cells.values()) judgeCell(c, t0);
    else { const touched = new Set(); for (const k of at.get(t0) || []) for (const c of rowCells.get(k) || []) touched.add(c); for (const c of touched) judgeCell(c, t0); }
    /* union-find over this instant's pieces */
    const all = [], par = new Map(), find = (u) => { let x = u; while (par.get(x) !== x) x = par.get(x); par.set(u, x); return x; };
    const failedCells = new Set();
    for (const [k, r] of cur) { if (r.failed) failedCells.add(k); for (const P of r.pieces) { all.push(P); par.set(P.uid, P.uid); } }
    const byCell = new Map(); for (const P of all) { const k = P.cell.key; let L = byCell.get(k); if (!L) byCell.set(k, L = []); L.push(P); }
    const beyond = new Set();
    for (const P of all) {
      const { cx, cy } = P.cell;
      for (const [side, dx, dy, opp] of [['E', 1, 0, 'W'], ['N', 0, 1, 'S'], ['W', -1, 0, 'E'], ['S', 0, -1, 'N']]) {
        if (!P.side[side].length) continue;
        const nk = (cx + dx) + ',' + (cy + dy), Q = byCell.get(nk) || [];
        let met = false;
        for (const q of Q) if (overlaps(P.side[side], q.side[opp])) { met = true; const a = find(P.uid), b = find(q.uid); if (a !== b) par.set(a, b); }
        if (!met || failedCells.has(nk)) beyond.add(P.uid);
      }
    }
    const groups = new Map(); for (const P of all) { const g = find(P.uid); let L = groups.get(g); if (!L) groups.set(g, L = []); L.push(P); }
    const given = [];
    for (const G of groups.values()) {
      if (!G.some((P) => P.tR)) continue;
      const sig = sigOf(G);
      let C = comps.get(sig);
      if (!C) {
        const verdict = !G.some((P) => P.tS) ? 'no-sea' : G.some((P) => P.odd || beyond.has(P.uid)) ? 'beyond-band' : G.some((P) => P.other) ? 'two-polities' : G.some((P) => P.border) ? 'present-day-border'
          : G.some((P) => P.later) ? 'drawn-by-another-row' : G.some((P) => P.far) ? 'too-far'
          : !G.some((P) => 2 * P.km2 / Math.max(1e-9, P.edgeKm) >= land.agreementKm) ? 'within-the-coasts-agreement' : 'given';
        no(verdict);
        C = { sig, verdict, polys: null };
        if (verdict === 'given') {
          let u; try { u = G.length > 1 ? safe('union', ...G.map((P) => [P.poly])) : [G[0].poly]; } catch (_) { u = G.map((P) => P.poly); no('given-unjoined'); }
          C.polys = u.map(round6).filter((p) => p.length && Math.abs(ringArea(p[0])) > 1e-12);
        }
        if (debug) { const b = bbox(G.map((P) => P.poly)); debug.push({ t0, verdict, bb: b, area: G.reduce((a, P) => a + Math.abs(ringArea(P.poly[0])), 0), with: [...new Set(G.flatMap((P) => [...P.with]))] }); }
        comps.set(sig, C);
      }
      if (C.verdict === 'given' && C.polys.length) given.push(C);
      if (comps.size > 200000) { for (const [k, v] of comps) if (v.verdict !== 'given') comps.delete(k); }
    }
    /* each given piece's run of years: extended while it is given again at the next instant, closed when it is not */
    const now = new Set();
    for (const C of given) { const g = geomKey(C); now.add(g); const r = open.get(g); if (r && r.e === t0) r.e = t1; else { const x = { s: t0, e: t1, polys: C.polys }; open.set(g, x); runs.push(x); } }
    for (const g of [...open.keys()]) if (!now.has(g)) open.delete(g);
  }
  /* one row per span: the pieces given over exactly the same years travel together, so a piece is listed once per run */
  const bySpan = new Map();
  for (const r of runs) { const k = r.s + ':' + r.e; let x = bySpan.get(k); if (!x) bySpan.set(k, x = { s: r.s, e: r.e, polys: [] }); x.polys.push(...r.polys); }
  return { out: [...bySpan.values()].sort((x, y) => x.s - y.s || x.e - y.e), why };
}

/* a spatial index of rows by 1° bucket */
export class RowGrid {
  constructor(rows) { this.m = new Map(); for (const o of rows) for (let x = Math.floor(o.bb[0]); x <= Math.floor(o.bb[2]); x++) for (let y = Math.floor(o.bb[1]); y <= Math.floor(o.bb[3]); y++) { const k = x * 1000 + y; const L = this.m.get(k); if (L) L.push(o); else this.m.set(k, [o]); } }
  query(b) { const seen = new Set(), out = []; for (let x = Math.floor(b[0]); x <= Math.floor(b[2]); x++) for (let y = Math.floor(b[1]); y <= Math.floor(b[3]); y++) for (const o of this.m.get(x * 1000 + y) || []) if (!seen.has(o.k)) { seen.add(o.k); out.push(o); } return out; }
}

/* ══ THE BUILD — rows spread over worker threads (each loads the records and the land itself) ══════ */
function workerMain() {
  const { rows } = loadRows(), grid = new RowGrid(rows), water = coastWater();
  /* (coast-snap-detail) OpenStreetMap's land is read only by a worker that is given a row reaching it; both share Natural
     Earth's land borders (rule ⑦) */
  const ne = new Land('ne'); let osm = null;
  const lands = { ne, osm: () => { if (!osm) { osm = new Land('osm'); osm._borders = ne.borders; } return osm; } };
  parentPort.on('message', ({ id, k }) => {
    let res; try { res = snapRow(rows[k], rows, grid, lands, water); } catch (e) { res = { out: [], why: { error: 1 }, err: String(e && e.stack || e) }; }
    parentPort.postMessage({ id, k, res });
  });
  parentPort.postMessage({ ready: true });
}
export async function buildCoastSnap({ log = console.error, only = null } = {}) {
  const { rows, heads } = loadRows();
  /* parents: named rows whose box comes near a coast at all (the workers decide the rest) */
  const water = coastWater();
  const near = (o) => { const [x0, y0, x1, y1] = o.bb; const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [(x0 + x1) / 2, (y0 + y1) / 2]];
    const diag = Math.hypot((x1 - x0) * kmPerDegX(Math.min(Math.abs(y0), Math.abs(y1))), (y1 - y0) * KM_PER_DEG);
    return pts.some(([x, y]) => water.distKm(x, y, diag + o.band + 4) <= diag + o.band + 4); };
  let todo = rows.filter((o) => o.name && near(o));
  if (only) todo = todo.filter((o) => meets(o.bb, only));
  todo.sort((a, b) => (b.polys.reduce((s, p) => s + p[0].length, 0)) - (a.polys.reduce((s, p) => s + p[0].length, 0)));
  log(`coast-snap: ${rows.length} rows in the composition, ${todo.length} named rows near a coast to judge`);
  /* INTMAP_SNAP_WORKERS overrides the count (a machine with few cores and room in memory) */
  const N = Math.max(1, +process.env.INTMAP_SNAP_WORKERS || Math.min(8, (os.availableParallelism ? os.availableParallelism() : os.cpus().length) - 2));
  const self = fileURLToPath(import.meta.url), results = new Map(), why = {};
  const t0 = Date.now();
  /* ⚠ EACH ROW'S ANSWER IS KEPT ON DISK, keyed by everything it depends on: the records and the land it was judged against
     (their sha256) and the rule itself (the source of the functions that decide it, and the constants). A build that stops —
     a worker that ran out of memory 16 minutes in did — resumes where it was; a changed record or rule is a new key, and
     nothing is reused across keys. The cache is outside the repository, beside the subtraction jobs' (build-hist-clio.mjs). */
  const rule = [snapRow, cellsOfSegment, cellPieces, sigOf, Land, readNE, readOSMLand, coastOf, clipRing, clipPolys, partsIn, SegIndex].map(String).join('\n') + JSON.stringify([COASTS, OSM_LAND, TIERS, EPS_ON, EPS_SIDE, EPS_IV, KM_PER_DEG, TIERS.map((T) => inlandKmFor(T.global))]);
  const dir = join(CACHE, 'coast-snap', createHash('sha256').update(JSON.stringify(Object.values(heads).filter(Boolean).map((h) => h.sha)) + sha(NE_LAND) + OSM_LAND.sha256 + rule).digest('hex').slice(0, 24));
  mkdirSync(dir, { recursive: true });
  const fileOf = (o) => join(dir, o.t + '_' + (o.sy == null ? '' : o.sy + '_') + o.i + '.json');
  const keep = (o, res) => { results.set(o.k, res.out); for (const [r, c] of Object.entries(res.why)) why[r] = (why[r] || 0) + c; };
  const fresh = [];
  for (const o of todo) { const f = fileOf(o); if (existsSync(f)) { try { keep(o, JSON.parse(readFileSync(f, 'utf8'))); continue; } catch (_) { /* rewritten below */ } } fresh.push(o); }
  if (fresh.length < todo.length) log(`  … ${todo.length - fresh.length} of ${todo.length} rows read from the cache (${dir})`);
  todo = fresh;
  await new Promise((resolve, reject) => {
    let next = 0, left = todo.length, ws = [];
    if (!left) return resolve();
    const feed = (w) => { if (next < todo.length) { const o = todo[next++]; w.postMessage({ id: next - 1, k: o.k }); } };
    for (let i = 0; i < N; i++) {
      const w = new Worker(self, { workerData: { role: 'coast-snap' }, resourceLimits: { maxOldGenerationSizeMb: +process.env.INTMAP_SNAP_HEAP_MB || 6144 } });   /* (coast-snap-detail) OpenStreetMap's land is ~1.5 GB in a worker */
      ws.push(w);
      w.on('message', (m) => {
        if (m.ready) { feed(w); return; }
        if (m.res.err) log('  ✖ row ' + m.k + ': ' + m.res.err.split('\n')[0]);
        keep(rows[m.k], m.res); if (!m.res.err) { try { writeFileSync(fileOf(rows[m.k]), JSON.stringify({ out: m.res.out, why: m.res.why })); } catch (_) { /* only slower next time */ } }
        if (--left % 500 === 0) log(`  … ${todo.length - left} / ${todo.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
        if (!left) { Promise.all(ws.map((x) => x.terminate())).then(resolve); } else feed(w);
      });
      w.on('error', reject);
    }
  });
  if (why.error) throw new Error(why.error + ' row(s) failed in the coast snap');
  return writeSnap(rows, heads, results, why, { log, write: !only, t0 });
}

/* the bundle: one row per (parent, years, pieces), ring-pooled. ⚠ EACH ROW SAYS WHAT ITS PARENT SAYS — the parent's name as
   its record writes it (column 0), its identifier (column 1: the QID, CShapes' gwcode), and in the meta `t`/`i`/`y` (which
   row), `k` (the band it was judged in), `d` (the parent's own dates as its record writes them), `m` (a Cliopatria row's
   meta: its article, realm, a withheld name, a judged ground) and `a` (a sheet polygon's facts). So a reader that meets a
   piece at a point — the place timeline, the gate — names it without fetching its parent's whole instant. */
export function writeSnap(rows, heads, results, why, { log = console.error, write = true, t0 = Date.now() } = {}) {
  const rings = [], pool = new Map(), feats = [];
  const put = (r) => { const k = r.join(';'); let i = pool.get(k); if (i == null) { i = rings.length; rings.push(r); pool.set(k, i); } return i; };
  for (const o of rows) for (const x of results.get(o.k) || []) {
    const f = o.f || [], meta = { t: o.t, i: o.i, k: o.band };
    if (o.sy != null) meta.y = o.sy;
    if (o.t !== 'sheet') meta.d = f.slice(2, 8);
    if (o.t === 'clio' && f[9] && Object.keys(f[9]).length) meta.m = f[9];
    if (o.t === 'sheet' && f[1] && Object.keys(f[1]).length) meta.a = f[1];
    feats.push([o.t === 'cshapes' ? String(f[0] || o.name) : (f[0] || { en: o.name }), o.t === 'sheet' ? null : (f[1] == null ? null : f[1]), ...unymd(x.s), ...unymd(x.e), x.polys.map((p) => p.map(put)), meta]);
  }
  feats.sort((a, b) => ymd(a[2], a[3], a[4]) - ymd(b[2], b[3], b[4]) || ymd(a[5], a[6], a[7]) - ymd(b[5], b[6], b[7]) || (a[9].t < b[9].t ? -1 : a[9].t > b[9].t ? 1 : a[9].i - b[9].i) || (a[9].y || 0) - (b[9].y || 0));
  /* (coast-snap-detail) `coasts` — the coast each record's rows reach (by the record's terms, `coastOf`), and `lands` what each
     coast is: its file, its name, its terms and the agreement width it was judged with (rule ⑥) */
  const head = { v: 1, src: SRC, end: 'exclusive', coasts: Object.fromEntries(TIERS.map((T) => [T.t, coastOf(T.t)])),
    lands: Object.fromEntries(Object.values(COASTS).map((c) => [c.id, { file: c.file, name: c.name, licence: c.licence, agreementKm: c.agreementKm }])),
    basis: Object.fromEntries(Object.values(heads).filter(Boolean).map((h) => [h.file, h.sha]).concat([[NE_LAND, sha(NE_LAND)], [OSM_LAND.file, OSM_LAND.sha256]])),
    bands: Object.fromEntries(TIERS.map((T) => [T.t, inlandKmFor(T.global)])), judged: Object.fromEntries(Object.keys(why).sort().map((k) => [k, why[k]])) };
  const body = 'window.' + SNAP_GLOBAL + '=' + JSON.stringify({ ...head, rings, feats }) + ';\n';
  if (write) writeFileSync(join(ROOT, SNAP_FILE), body);
  log(`${SNAP_FILE}: ${feats.length} rows, ${rings.length} rings, ${rings.reduce((a, r) => a + r.length, 0)} points, ${(body.length / 1e6).toFixed(2)} MB — pieces judged: ${Object.entries(head.judged).map(([k, v]) => k + ' ' + v).join(', ')} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  return { head, rings, feats };
}
export const snapName = (f) => (typeof f[0] === 'string' ? f[0] : ((f[0] && f[0].en) || ''));

/* ══ READING THE BUNDLE (the gates, the tests and scripts/hist-fidelity.mjs) ════════════════════════
   the snap rows in force on [y, m, d], each with its parent row → [{ f, parent, polys }] */
export function snapsAt(snap, rowsByKey, y, m, d) {
  const t = ymd(y, m, d), out = [];
  for (const f of snap.feats) {
    if (ymd(f[2], f[3], f[4]) > t || ymd(f[5], f[6], f[7]) <= t) continue;
    out.push({ f, parent: rowsByKey.get(parentKey(f[9])) || null, polys: f[8].map((p) => p.map((ri) => snap.rings[ri])) });
  }
  return out;
}
export const parentKey = (m) => m.t + ':' + (m.y != null ? m.y + ':' : '') + m.i;
export const rowKeyOf = (o) => o.t + ':' + (o.sy != null ? o.sy + ':' : '') + o.i;

/* ══ CHECK (offline): the committed bundle against the shipped records ═══════════════════════════════
   ⚠ It re-derives nothing (the build is minutes of polygon work over every row); it proves what the rule promises of the
   bytes: made against the records that ship beside it, every row's parent exists, has the row's name and is in force over
   the row's whole span, every piece lies on land, within the parent's band of the parent's line, and outside every row the
   page draws at the row's first instant (it is land no record draws). */
export function checkCoastSnap(ok) {
  if (!existsSync(join(ROOT, SNAP_FILE))) { ok(false, SNAP_FILE + ' is missing — node scripts/build-hist-clio.mjs --coast-snap'); return null; }
  const snap = evalBundle(SNAP_FILE, SNAP_GLOBAL);
  ok(snap && snap.v === 1 && /Natural Earth/.test(snap.src) && /OpenStreetMap contributors/.test(snap.src) && /ODbL 1\.0/.test(snap.src) && /CC BY 4\.0/.test(snap.src), SNAP_FILE + ' must name both coasts (Natural Earth; © OpenStreetMap contributors, ODbL 1.0) and the terms of the records it extends');
  if (!snap) return null;
  for (const T of TIERS) if (existsSync(join(ROOT, T.file))) ok(snap.basis[T.file] === sha(T.file), SNAP_FILE + ' was made against another ' + T.file + ' — rebuild it (node scripts/build-hist-clio.mjs --coast-snap)');
  ok(snap.basis[NE_LAND] === sha(NE_LAND), SNAP_FILE + ' was made against another ' + NE_LAND);
  /* (coast-snap-detail) the coast each record reaches is the one its terms allow, and each record still states those terms */
  ok(snap.basis[OSM_LAND.file] === OSM_LAND.sha256, SNAP_FILE + ' was made against another ' + OSM_LAND.file);
  for (const T of TIERS) {
    ok(snap.coasts && snap.coasts[T.t] === coastOf(T.t), SNAP_FILE + ': the rows of ' + T.t + ' reach the ' + (snap.coasts && snap.coasts[T.t]) + ' coast, not ' + coastOf(T.t) + ' — rebuild it');
  }
  for (const c of Object.values(COASTS)) ok(snap.lands && snap.lands[c.id] && snap.lands[c.id].agreementKm === c.agreementKm && snap.lands[c.id].licence === c.licence, SNAP_FILE + ': the ' + c.id + ' coast was judged with another agreement width or terms — rebuild it');
  for (const T of TIERS) ok(snap.bands && snap.bands[T.t] === inlandKmFor(T.global), SNAP_FILE + ': the band of ' + T.t + ' is no longer ' + (snap.bands && snap.bands[T.t]) + ' km — rebuild it');
  const { rows, bundles } = loadRows(), byKey = new Map(rows.map((o) => [rowKeyOf(o), o])), grid = new RowGrid(rows);
  for (const T of TIERS) if (bundles[T.t]) ok(String(bundles[T.t].src || '').includes(T.licence), T.file + ' no longer states «' + T.licence + '» — which coast its rows may reach (`coastOf`) is decided by its terms; review TIERS before rebuilding');
  const used = new Uint8Array(snap.rings.length);
  let bad = 0; const say = (c, m) => { if (!c && bad++ < 12) ok(false, m); };   /* the first twelve said; the rest counted below */
  for (const f of snap.feats) {
    const m = f[9] || {}, P = byKey.get(parentKey(m)), s = ymd(f[2], f[3], f[4]), e = ymd(f[5], f[6], f[7]), tag = SNAP_FILE + ' row «' + snapName(f) + '» ' + f.slice(2, 5).join('-');
    say(!!P, tag + ': its parent ' + parentKey(m) + ' is not a row the page draws');
    if (!P) continue;
    say(P.name === snapName(f), tag + ': the parent is named «' + P.name + '»');
    say(P.s <= s && e <= P.e && s < e, tag + ': drawn outside its parent\'s years');
    say(m.k === P.band, tag + ': its band is not its parent record\'s');
    const polys = f[8].map((p) => p.map((ri) => { used[ri] = 1; return snap.rings[ri]; }));
    /* an interior point of each piece: on no row in force at the first instant, and within the band of the parent's line */
    for (const p of polys) {
      const q = interiorPoint(p); if (!q) continue;
      const over = grid.query([q[0], q[1], q[0], q[1]]).filter((o) => o.s <= s && o.e > s && q[0] >= o.bb[0] && q[0] <= o.bb[2] && q[1] >= o.bb[1] && q[1] <= o.bb[3] && inPolys(o.polys, q[0], q[1]));
      say(!over.length, tag + ': a piece at ' + q.map((v) => v.toFixed(4)).join(',') + ' lies inside «' + (over[0] && over[0].name) + '» (' + (over[0] && over[0].t) + ') — a snap overlaps a record');
    }
  }
  say(used.every(Boolean), SNAP_FILE + ': ' + used.reduce((a, v) => a + (v ? 0 : 1), 0) + ' ring(s) no row uses');
  if (bad > 12) ok(false, SNAP_FILE + ': ' + (bad - 12) + ' more problem(s) of the same kinds');
  return { snap, rows: snap.feats.length, rings: snap.rings.length };
}
/* a point strictly inside a polygon (outer ring less holes): the midpoint of the widest run on the scanline through the
   middle of its box — exact, not sampled */
export function interiorPoint(p) {
  const b = bbox([p]);
  for (const fr of [0.5, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6]) {
    const y = b[1] + (b[3] - b[1]) * fr, xs = [];
    for (const r of p) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], c = r[j]; if ((a[1] > y) !== (c[1] > y)) xs.push(a[0] + (y - a[1]) * (c[0] - a[0]) / (c[1] - a[1])); }
    xs.sort((u, v) => u - v);
    let best = null; for (let i = 0; i + 1 < xs.length; i += 2) if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
    if (best && best[1] - best[0] > 1e-9) return [(best[0] + best[1]) / 2, y];
  }
  return null;
}

/* ══ THE PORT-CITY TABLE — land grid points drawn, with and without the snap ═════════════════════════ */
export const PORTS = Object.freeze([
  ['Istanbul', [28.90, 40.98, 29.06, 41.08]], ['Venice', [12.28, 45.40, 12.40, 45.47]], ['Copenhagen', [12.50, 55.63, 12.65, 55.72]],
  ['Gibraltar', [-5.37, 36.10, -5.33, 36.16]], ['Carthage–Tunis', [10.15, 36.78, 10.36, 36.90]], ['New York', [-74.05, 40.68, -73.90, 40.82]],
  ['Hong Kong', [114.10, 22.25, 114.25, 22.32]], ['Singapore', [103.75, 1.25, 103.95, 1.36]], ['Alexandria', [29.85, 31.15, 30.05, 31.30]],
  ['Lisbon', [-9.23, 38.69, -9.10, 38.76]],
]);
export const PORT_YEARS = Object.freeze([-300, 300, 1000, 1500, 1650, 1800, 1900]);
export function portCoverage({ rows, snap, land, box, y, step = 0.0025 }) {
  const t = ymd(y, 7, 1), inF = rows.filter((o) => o.s <= t && o.e > t && meets(o.bb, box));
  const sn = snap ? snap.feats.filter((f) => ymd(f[2], f[3], f[4]) <= t && ymd(f[5], f[6], f[7]) > t).map((f) => f[8].map((p) => p.map((ri) => snap.rings[ri]))).filter((P) => meets(bbox(P), box)) : [];
  let L = 0, A = 0, S = 0;
  for (let x = box[0] + step / 2; x < box[2]; x += step) for (let yy = box[1] + step / 2; yy < box[3]; yy += step) {
    if (!land.onLand(x, yy)) continue; L++;
    if (inF.some((o) => inPolys(o.polys, x, yy))) { A++; continue; }
    if (sn.some((P) => inPolys(P, x, yy))) S++;
  }
  return { land: L, drawn: A, snapped: S };
}

/* the port-city table (`--coast-snap-measure`): per city and year, land grid points drawn by the records, and by the records and
   the snap — the before and after of this file, from the shipped bundles.
   (coast-snap-detail) ⚠ LAND IS THE BASE MAP'S (`coast`, default OpenStreetMap's). This table first counted Natural Earth's
   land points, the coast the pieces were cut to — so it could only ever find them complete: it reported Üsküdar at 100% in
   1000, 1500 and 1650 while production showed 240 of 919 base-map land points blank there. An observer that measures with
   the instrument under test reports success (.agents/rules/one-pass-or-a-reason.md §2). `before` is another snap bundle
   (a file path) to count beside the shipped one. */
export function measurePorts({ log = console.log, step = 0.0025, coast = 'osm', before = null } = {}) {
  const { rows } = loadRows(), land = new Land(coast), snap = evalBundle(SNAP_FILE, SNAP_GLOBAL), out = [];
  let prev = null; if (before) { const w = {}; new Function('window', readFileSync(before, 'utf8'))(w); prev = w[SNAP_GLOBAL]; }
  log('city            year    land   records' + (prev ? '   + snap before' : '') + '   + snap    (' + COASTS[coast].name + ' land, points every ' + step + '°, 1 July)');
  for (const [nm, box] of PORTS) for (const y of PORT_YEARS) {
    const c = portCoverage({ rows, snap, land, box, y, step }), pct = (v) => (100 * v / Math.max(1, c.land)).toFixed(1).padStart(5) + '%';
    const b = prev ? portCoverage({ rows, snap: prev, land, box, y, step }) : null;
    out.push({ city: nm, year: y, ...c, ...(b ? { snappedBefore: b.snapped } : {}) });
    log(nm.padEnd(16) + String(y).padStart(5) + String(c.land).padStart(8) + '   ' + pct(c.drawn) + (b ? '   ' + pct(b.drawn + b.snapped).padStart(13) : '') + '   ' + pct(c.drawn + c.snapped));
  }
  return out;
}
if (!isMainThread && workerData && workerData.role === 'coast-snap') workerMain();
