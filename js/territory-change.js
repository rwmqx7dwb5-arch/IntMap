/* ============================================================================
 *  IntMap · js/territory-change.js — WHICH LAND CHANGED HANDS BETWEEN TWO INSTANTS, ON THE MAP   (wave4-atlas)
 * ----------------------------------------------------------------------------
 *  «What did the map of Europe lose and gain between 1913 and 1924?» The records already hold the answer — CShapes 2.0
 *  by the day from 1886, OpenHistoricalMap, Cliopatria and the era sheets before it — and nothing could put it on the
 *  map. The swipe (time.thenNow) shows two pictures and leaves the reader to find the difference by eye; the change
 *  list (time.changes) names polities that appear and vanish and how their DRAWN AREA moved, which says that Poland
 *  grew but not out of whom; the year book reads one instant; «this place through time» reads one point; a journey
 *  reads one line. Nobody asked the two instants about the same LAND.
 *
 *  This does. Over a region (a place, a box, the view, or the world) it lays one lattice of cells, asks each record
 *  which polity it draws at the centre of every cell — at the first instant and at the second — and keeps the cells
 *  whose answer changed. Those are drawn on the map as the land that passed from one polity to another, coloured by
 *  the polity that holds it at the second instant, each transfer measured in km² and as a share of what the giver and
 *  the receiver hold inside the region.
 *
 *  ⚠ IT SAYS ONLY WHAT THE RECORDS DRAW (.agents/rules/historical-verification.md):
 *    · a polity is the one the record draws at the cell's centre at that instant, under the record's name in the
 *      reader's language (js/year-book.js `nameIn` — the year book's reading of the same features). A realm drawn over
 *      its members is set aside where a member is drawn (the rule js/journey-through-time.js applies to a line);
 *    · TWO INSTANTS ARE COMPARED BY THE IDENTIFIERS THE RECORDS STATE — the CShapes state code (`_gw`) where both sides
 *      carry one, else the Wikidata item (`_qid`, Natural Earth's WIKIDATAID), else the names the records write. So
 *      «Russia» (1913) and «Soviet Union» (1924) are ONE state renamed (both gw 365) and their land is not a transfer;
 *      it is listed under `renamed`, and the map does not paint it;
 *    · ONE IDENTIFIER, A NEW BRACKET: CShapes keeps a territory's code when it passes to a holder and writes the holder in
 *      the name — «Korean Empire» (1904) and «Korea (Japan)» (1911) are both gw 730; «Syria (France)» and «Syria» both
 *      652. A change in that bracket (js/time-borders.js IntMapEraName.split — the decomposition the page labels with)
 *      is what the record says about who holds the land, so it is drawn as a change of hands and marked
 *      `sameIdentifier`. A rename with no bracket on either side («Russia» → «Soviet Union») is listed, and drawn only
 *      on request (`drawRenamed`);
 *    · land one instant draws and the other does not is NOT a transfer: it is the edge of a record (a record that
 *      begins or ends, a coast drawn by a coarser sheet) and is listed under `recordOnly` — «no record» is never
 *      written as «no state»;
 *    · two shapes the record draws over one cell are both named (an overlap); none is chosen;
 *    · a transfer whose two sides share no identifier and differ in name is marked `comparedByNameOnly` — the records
 *      may write one polity under two names (the Cliopatria → CShapes seam in 1886 does), and the answer says so.
 *  ⚠ THE LATTICE IS THE PRECISION, AND IT IS IN THE ANSWER. A cell is inside a polity when its CENTRE is (the even-odd
 *    rule of js/routing-ops.js `ptInPoly`, evaluated a row at a time — tests/wave4-atlas-checks.test.mjs holds the two
 *    equal on the shipped records); land narrower than a cell can be missed and an area is good to about half a cell
 *    along its edge. The step is in the answer in degrees and in km, and Atlas may ask for another.
 *  Atlas reaches it as `time.territoryChange` (js/atlas-cap-time.js). Strings IntMap writes here are en + jp
 *  (CONSTITUTION.md §7). No emoji.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { IntMapTime } from './chronos.js';   /* static: a start-up module imported dynamically is split into a chunk of its own (check:perf) */
import { nameIn, htmlText, bordersNow } from './year-book.js';
import { countryOutlines } from './routing-ops.js';
import { instantOf, instantLabel } from './journey-through-time.js';
import { IntMapEraName } from './time-borders.js';   /* the one «Base (Gloss)» decomposition the records' names are read with */

/* ══ THE LATTICE ══════════════════════════════════════════════════════════════════════════════════
   How many cells a comparison lays when Atlas does not name a step. MEASURED 2026-10-13 (Node 24, this file over the
   shipped records, `node scripts/territory-change.mjs --bench`, Europe 1913 → 1924, the records already open): labelling
   both instants, judging every cell and tracing the 47 transfers took 0.50 s for 1,001,495 cells and 1.8 s for 2,000,334
   (0.5–0.9 µs a cell, the rows handing the thread back every frame). A million cells is a wait the reader sees without a
   frozen tab, and it gives Europe a 0.039° (≈ 3 km) step and the world 0.25°.
   It is a DEFAULT for the step, not a ceiling on the answer: `stepDeg` replaces it (the result says which was used).
   ⚠ Invalid if the labeller stops being linear in the cells (an index that tests per cell rather than per row). */
export const DEFAULT_CELLS = 1000000;
const R_KM = 6371.0088;   /* the IUGG mean radius js/routing-ops.js and js/gis-geometry.js measure on */
const D2R = Math.PI / 180;

/** lattice over [w, s, e, n] (degrees, w < e, s < n) with square cells of `step` degrees */
export function lattice(box, stepDeg) {
  const w = +box[0], s = Math.max(-90, +box[1]), e = +box[2], n = Math.min(90, +box[3]);
  if (!(e > w) || !(n > s)) return null;
  const step = (stepDeg != null && +stepDeg > 0) ? +stepDeg : Math.sqrt(((e - w) * (n - s)) / DEFAULT_CELLS);
  const cols = Math.max(1, Math.ceil((e - w) / step)), rows = Math.max(1, Math.ceil((n - s) / step));
  return { w, s, e: w + cols * step, n: s + rows * step, step, cols, rows };
}
export const cellLng = (L, c) => L.w + (c + 0.5) * L.step;
export const cellLat = (L, r) => L.s + (r + 0.5) * L.step;
/** the area of one cell of row r on the sphere: R²·Δλ·(sin φ₂ − sin φ₁) — exact for the lattice cell */
export function rowCellKm2(L, r) {
  const a = Math.max(-90, L.s + r * L.step) * D2R, b = Math.min(90, L.s + (r + 1) * L.step) * D2R;
  return R_KM * R_KM * (L.step * D2R) * Math.abs(Math.sin(b) - Math.sin(a));
}

/* ══ WHICH FEATURES HOLD THE CENTRE OF EACH CELL ══════════════════════════════════════════════════
   The test of js/routing-ops.js `ptInPoly` — even-odd per ring; inside a polygon = inside its outer ring and inside
   none of its holes; inside a feature = inside any of its polygons — evaluated for a whole ROW at once: every edge
   that spans a row's centre latitude contributes one crossing to that row, and the cells whose centres lie between
   consecutive crossings are inside. The work is the crossings plus the cells filled, not cells × vertices.
   Returns { first: Int32Array (feature index, −1 none), extra: Map(cell → [more indices]) }. */
function ringCrossings(ring, L, put) {
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const x1 = +ring[j][0], y1 = +ring[j][1], x2 = +ring[i][0], y2 = +ring[i][1];
    if (y1 === y2 || !isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) continue;
    const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
    /* centre rows with lo ≤ yc < hi — ptInRing's (yi > y) !== (yj > y) is exactly the half-open span [lo, hi) */
    let r0 = Math.ceil((lo - L.s) / L.step - 0.5), r1 = Math.ceil((hi - L.s) / L.step - 0.5) - 1;
    if (r0 < 0) r0 = 0; if (r1 > L.rows - 1) r1 = L.rows - 1;
    for (let r = r0; r <= r1; r++) { const yc = L.s + (r + 0.5) * L.step; put(r, x1 + (yc - y1) * (x2 - x1) / (y2 - y1)); }
  }
}
/* the cell columns whose centres xc satisfy x0 ≤ xc < x1 — ptInRing's `x < crossing` counted to the right */
function colSpan(L, x0, x1) {
  let c0 = Math.ceil((x0 - L.w) / L.step - 0.5), c1 = Math.ceil((x1 - L.w) / L.step - 0.5) - 1;
  if (c0 < 0) c0 = 0; if (c1 > L.cols - 1) c1 = L.cols - 1;
  return [c0, c1];
}
function rowsOf(ring, L) {
  const by = new Map();
  ringCrossings(ring, L, (r, x) => { let a = by.get(r); if (!a) by.set(r, (a = [])); a.push(x); });
  for (const a of by.values()) a.sort((p, q) => p - q);
  return by;
}
export function labelCells(features, L) {
  const N = L.cols * L.rows, first = new Int32Array(N).fill(-1), extra = new Map();
  const stamp = new Int32Array(L.cols); let seq = 0;
  const add = (cell, fi) => {
    const cur = first[cell];
    if (cur === -1) { first[cell] = fi; return; }
    if (cur === fi) return;
    let more = extra.get(cell); if (!more) extra.set(cell, (more = []));
    if (more.indexOf(fi) < 0) more.push(fi);
  };
  for (let fi = 0; fi < features.length; fi++) {
    const g = features[fi] && features[fi].geometry;
    const polys = !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) {
      if (!poly || !poly.length) continue;
      const outer = rowsOf(poly[0], L), holes = [];
      for (let k = 1; k < poly.length; k++) holes.push(rowsOf(poly[k], L));
      for (const [r, xs] of outer) {
        seq++;
        for (let i = 0; i + 1 < xs.length; i += 2) { const [c0, c1] = colSpan(L, xs[i], xs[i + 1]); for (let c = c0; c <= c1; c++) stamp[c] = seq; }
        for (const H of holes) { const hx = H.get(r); if (!hx) continue; for (let i = 0; i + 1 < hx.length; i += 2) { const [c0, c1] = colSpan(L, hx[i], hx[i + 1]); for (let c = c0; c <= c1; c++) if (stamp[c] === seq) stamp[c] = -seq; } }
        const base = r * L.cols;
        for (let i = 0; i + 1 < xs.length; i += 2) { const [c0, c1] = colSpan(L, xs[i], xs[i + 1]); for (let c = c0; c <= c1; c++) if (stamp[c] === seq) { add(base + c, fi); stamp[c] = 0; } }
      }
    }
  }
  return { first, extra };
}
export function featuresOfCell(lab, cell) {
  const f = lab.first[cell]; if (f < 0) return [];
  const more = lab.extra.get(cell);
  return more ? [f].concat(more) : [f];
}

/* ══ WHO A FEATURE IS ═════════════════════════════════════════════════════════════════════════════
   The identifiers the record states, and the names it writes (all of them — Natural Earth writes «United States of
   America» as NAME and «United States» as NAME_LONG, and CShapes writes the second). */
const NE_NAMES = ['NAME', 'NAME_EN', 'ADMIN', 'NAME_LONG', 'FORMAL_EN', 'GEOUNIT', 'BRK_NAME', 'NAME_SORT'];
export function identityOf(f, lang, modern) {
  const p = (f && f.properties) || {};
  if (modern) {
    const names = new Set(); for (const k of NE_NAMES) { const v = String(p[k] == null ? '' : p[k]).trim(); if (v) names.add(v.toLowerCase()); }
    const en = String(p.NAME_EN || p.ADMIN || p.NAME || '').trim();
    const col = lang === 'jp' ? 'NAME_JA' : 'NAME_' + String(lang || 'en').toUpperCase();
    return { gw: null, qid: p.WIKIDATAID ? String(p.WIKIDATAID) : null, en, local: String(p[col] || en).trim(), names, realm: false, record: 'Natural Earth admin-0' };
  }
  const en = nameIn(p, 'en');
  const names = new Set(); if (en) names.add(en.toLowerCase()); const nm = String(p.NAME || '').trim(); if (nm) names.add(nm.toLowerCase());
  return { gw: p._gw != null ? +p._gw : null, qid: p._qid ? String(p._qid) : null, en, local: nameIn(p, lang) || en, names, realm: !!p._realm,
    record: p._rec ? String(p._rec) : (p._gw != null ? 'cshapes' : null) };
}
/** one polity at both instants? By the identifier both state; by name only when they share none */
export function samePolity(a, b) {
  if (a.gw != null && b.gw != null) return { same: a.gw === b.gw, by: 'gw' };
  if (a.qid && b.qid) return { same: a.qid === b.qid, by: 'qid' };
  for (const n of a.names) if (b.names.has(n)) return { same: true, by: 'name' };
  return { same: false, by: 'name' };
}

/* what the record draws at one cell: the polities (a realm set aside under a drawn member), or nothing */
function cellPolities(fis, ids) {
  if (!fis.length) return { kind: 'none', set: [] };
  const named = [], realms = [];
  for (const fi of fis) { const id = ids[fi]; if (!id || !id.en) continue; (id.realm ? realms : named).push(fi); }
  const use = named.length ? named : realms;
  if (!use.length) return { kind: 'unnamed', set: [] };
  /* one polity drawn twice (two features of one name) is one polity */
  const uniq = [];
  for (const fi of use) if (!uniq.some((u) => samePolity(ids[u], ids[fi]).same)) uniq.push(fi);
  uniq.sort((x, y) => (ids[x].en < ids[y].en ? -1 : ids[x].en > ids[y].en ? 1 : 0));
  return { kind: uniq.length > 1 ? 'overlap' : 'polity', set: uniq };
}
/* every polity of one set has a partner in the other, both ways */
function sameSet(A, B, idsA, idsB) {
  if (A.length !== B.length) return { same: false, byNameOnly: false };
  let byNameOnly = true;
  for (const a of A) { let hit = null; for (const b of B) { const r = samePolity(idsA[a], idsB[b]); if (r.same) { hit = r; break; } } if (!hit) return { same: false, byNameOnly: false }; if (hit.by !== 'name') byNameOnly = false; }
  return { same: true, byNameOnly };
}
const setKey = (set, ids) => set.map((fi) => ids[fi].gw != null ? 'gw:' + ids[fi].gw : ids[fi].qid ? 'q:' + ids[fi].qid : 'n:' + ids[fi].en.toLowerCase()).join(' / ');
const setNames = (set, ids) => set.map((fi) => ({ en: ids[fi].en, local: ids[fi].local }));

/* ══ OUTLINES OF A SET OF CELLS ═══════════════════════════════════════════════════════════════════
   The boundary of the cells as rings on the lattice corners, the region kept on the left of every edge, so an outer
   ring runs counter-clockwise and a hole clockwise (RFC 7946 §3.1.6). Collinear corners are dropped. Two cells that
   touch only at a corner are two rings (the turn at a shared corner is taken to the left). */
const MEMBER = new WeakMap();
export function traceCells(cells, L) {
  /* one membership buffer per lattice, set for these cells and cleared after — a fresh lattice-sized buffer per transfer
     was most of the cost of tracing (measured: 47 transfers over a million cells) */
  let inSet = MEMBER.get(L); if (!inSet) { inSet = new Uint8Array(L.cols * L.rows); MEMBER.set(L, inSet); }
  for (const c of cells) inSet[c] = 1;
  const has = (c, r) => c >= 0 && r >= 0 && c < L.cols && r < L.rows && inSet[r * L.cols + c] === 1;
  const W1 = L.cols + 1, out = new Map();   /* corner → outgoing edges [toCorner] (x = col, y = row, from the south-west) */
  const edge = (x0, y0, x1, y1) => { const k = y0 * W1 + x0; let a = out.get(k); if (!a) out.set(k, (a = [])); a.push(y1 * W1 + x1); };
  for (const cell of cells) {
    const c = cell % L.cols, r = (cell - c) / L.cols;
    if (!has(c, r - 1)) edge(c, r, c + 1, r);           /* south side, west → east */
    if (!has(c + 1, r)) edge(c + 1, r, c + 1, r + 1);   /* east side, south → north */
    if (!has(c, r + 1)) edge(c + 1, r + 1, c, r + 1);   /* north side, east → west */
    if (!has(c - 1, r)) edge(c, r + 1, c, r);           /* west side, north → south */
  }
  for (const c of cells) inSet[c] = 0;
  const xy = (k) => [k % W1, (k - (k % W1)) / W1];
  const rings = [];
  for (const [start, list] of out) {
    while (list.length) {
      const ring = [start]; let prev = start, cur = list.shift();
      while (cur !== start) {
        ring.push(cur);
        const next = out.get(cur);
        if (!next || !next.length) break;   /* cannot happen for a closed boundary; refuse to loop for ever */
        let pick = 0;
        if (next.length > 1) {   /* the left-most turn relative to the incoming direction */
          const [px, py] = xy(prev), [cx, cy] = xy(cur), dx = cx - px, dy = cy - py;
          let best = -Infinity;
          next.forEach((k, i) => { const [nx, ny] = xy(k), ex = nx - cx, ey = ny - cy; const turn = dx * ey - dy * ex; if (turn > best) { best = turn; pick = i; } });
        }
        prev = cur; cur = next.splice(pick, 1)[0];
      }
      if (cur === start && ring.length >= 4) rings.push(ring);
    }
  }
  /* corners → degrees, collinear corners dropped, the ring closed */
  const toLL = (ring) => {
    const pts = ring.map(xy), keep = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) keep.push(b);
    }
    const ll = keep.map(([x, y]) => [+(L.w + x * L.step).toFixed(6), +(L.s + y * L.step).toFixed(6)]);
    if (ll.length) ll.push(ll[0].slice());
    return ll;
  };
  const signed = (ll) => { let a = 0; for (let i = 1; i < ll.length; i++) a += ll[i - 1][0] * ll[i][1] - ll[i][0] * ll[i - 1][1]; return a / 2; };
  const inRing = (p, ring) => { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) ins = !ins; } return ins; };
  const outers = [], holes = [];
  for (const r of rings) { const ll = toLL(r); if (ll.length < 4) continue; (signed(ll) > 0 ? outers : holes).push({ ll, a: Math.abs(signed(ll)) }); }
  const polys = outers.map((o) => ({ o, h: [] }));
  for (const h of holes) {
    /* a hole belongs to the smallest outer ring holding its first edge's midpoint (a corner may sit on the outer) */
    const p = [(h.ll[0][0] + h.ll[1][0]) / 2, (h.ll[0][1] + h.ll[1][1]) / 2];
    let owner = null; for (const P of polys) if ((!owner || P.o.a < owner.o.a) && inRing(p, P.o.ll)) owner = P;
    if (owner) owner.h.push(h.ll);
  }
  return polys.map((P) => [P.o.ll].concat(P.h));
}

/* the 4-connected pieces of a set of cells, each with its area and its area-weighted centre — the largest piece is
   where the map is flown to and where the answer says the land lies */
function pieces(cells, L, areaOfRow) {
  const idx = new Map(); cells.forEach((c, i) => idx.set(c, i));
  const seen = new Uint8Array(cells.length), out = [];
  for (let i = 0; i < cells.length; i++) {
    if (seen[i]) continue;
    let km2 = 0, sx = 0, sy = 0, n = 0; const stack = [i]; seen[i] = 1;
    while (stack.length) {
      const k = stack.pop(), cell = cells[k], c = cell % L.cols, r = (cell - c) / L.cols, a = areaOfRow[r];
      km2 += a; sx += a * cellLng(L, c); sy += a * cellLat(L, r); n++;
      for (const nb of [c > 0 ? cell - 1 : -1, c < L.cols - 1 ? cell + 1 : -1, r > 0 ? cell - L.cols : -1, r < L.rows - 1 ? cell + L.cols : -1]) {
        if (nb < 0) continue; const j = idx.get(nb); if (j != null && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    out.push({ km2, cells: n, lng: km2 ? sx / km2 : null, lat: km2 ? sy / km2 : null });
  }
  return out.sort((a, b) => b.km2 - a.km2);
}

/* ══ ONE INSTANT, AS THE MAP DRAWS IT ═════════════════════════════════════════════════════════════ */
async function collectionOf(instant, deps) {
  const land = deps.land ? deps.land() : null;
  if (instant.now) {
    if (!land || !Array.isArray(land.features) || !land.features.length) return { failed: 'country-outlines-not-loaded' };
    return { feats: land.features, modern: true, record: { tier: 'modern', src: 'Natural Earth admin-0 (today’s borders)' } };
  }
  const TB = deps.borders;
  if (!TB || typeof TB.collectionAt !== 'function') return { failed: 'history-borders-not-loaded' };
  let c = null; try { c = await TB.collectionAt(instant.when); } catch (_) { c = null; }
  if (c && c.modern) return collectionOf({ now: true }, deps);
  if (!c || !c.fc || !Array.isArray(c.fc.features)) return { failed: 'record-not-readable' };
  let rec = c.record || null; try { if (!rec && TB.recordOf) rec = TB.recordOf(c.tier); } catch (_) { rec = null; }
  return { feats: c.fc.features, modern: false, record: { tier: c.tier || null, src: (rec && rec.src) || null } };
}

/* an elapsed-time yield, so a long comparison lets the page paint between rows (one 60 Hz frame — the budget the GIS
   raster kernel yields by, js/gis-raster.js FRAME_MS, which is not loaded on this path) */
const FRAME_MS = 16;
const nextTask = () => new Promise((r) => setTimeout(r, 0));
function yielder(yieldTo) {
  let last = Date.now();
  return async () => { if (Date.now() - last < FRAME_MS) return; await (yieldTo || nextTask)(); last = Date.now(); };
}

/**
 * territoryChange(box, from, to, deps, opts) — the land whose polity differs between two instants over one region.
 *   box   [w, s, e, n] degrees (w < e; a region across the antimeridian is asked as two)
 *   from, to   instants (js/journey-through-time.js `instantOf`)
 *   deps  { borders: js/time-borders.js, land: () => today's outlines (window.countryGeo), lang, yieldTo?: () => Promise
 *           (how the rows hand the thread back — a task by default; a harness that stubs the timers passes its own) }
 *   opts  { stepDeg?: number, drawRenamed?: boolean (a rename with no bracket is drawn as a change too) }
 * → { from, to, records, lattice, transfers[], renamed[], recordOnly[], totals, failed? }
 */
export async function territoryChange(box, from, to, deps, opts) {
  const L = lattice(box, (opts || {}).stepDeg);
  if (!L) return { failed: 'region-empty' };
  /* a lattice the page cannot hold is refused by name with its size — never a frozen or crashed tab (the typed arrays
     throw RangeError when the allocation is refused); a step that fits is the default's, and the refusal says it */
  try { return await compare(L, from, to, deps, opts || {}); }
  catch (e) { if (e instanceof RangeError) return { failed: 'lattice-too-large', cells: L.cols * L.rows, lattice: L, fits: lattice([L.w, L.s, L.e, L.n]) }; throw e; }
}
async function compare(L, from, to, deps, o) {
  const lang = deps.lang || 'en', drawRenamed = !!o.drawRenamed;
  const A = await collectionOf(from, deps), B = await collectionOf(to, deps);
  if (A.failed || B.failed) return { failed: A.failed || B.failed, side: A.failed ? 'from' : 'to', lattice: L };
  const tick = yielder(deps.yieldTo);
  const idsA = A.feats.map((f) => identityOf(f, lang, A.modern)), idsB = B.feats.map((f) => identityOf(f, lang, B.modern));
  const labA = labelCells(A.feats, L); await tick();
  const labB = labelCells(B.feats, L); await tick();
  const landFC = deps.land ? deps.land() : null;
  const labLand = (landFC && Array.isArray(landFC.features) && landFC.features.length) ? labelCells(landFC.features, L) : null;
  await tick();
  const areaOfRow = new Float64Array(L.rows); for (let r = 0; r < L.rows; r++) areaOfRow[r] = rowCellKm2(L, r);

  /* What a cell holds is decided once per DISTINCT combination of features, not once per cell: a cell's class is an
     index into `classes`, and a pair of classes is judged once (`verdicts`). A million cells are then a million integer
     look-ups — the per-cell judgement cost 2.3 µs a cell before this (measured, Europe 1913 → 1924). */
  const classify = (lab, ids) => {
    const memo = new Map(), classes = [], of = new Int32Array(L.cols * L.rows);
    for (let cell = 0; cell < of.length; cell++) {
      const f = lab.first[cell], more = f < 0 ? null : lab.extra.get(cell);
      const k = f < 0 ? '' : more ? [f].concat(more).sort((x, y) => x - y).join(',') : String(f);
      let ci = memo.get(k);
      if (ci === undefined) {
        const p = cellPolities(f < 0 ? [] : more ? [f].concat(more) : [f], ids);
        const named = p.kind === 'polity' || p.kind === 'overlap';
        ci = classes.length; memo.set(k, ci);
        classes.push({ kind: p.kind, set: p.set, named, key: named ? setKey(p.set, ids) : '', en: named ? p.set.map((fi) => ids[fi].en).join(' / ') : '' });
      }
      of[cell] = ci;
    }
    return { of, classes };
  };
  const CA = classify(labA, idsA); await tick();
  const CB = classify(labB, idsB); await tick();

  const transfers = new Map(), renamed = new Map(), recordOnly = new Map(), heldA = new Map(), heldB = new Map();
  let landKm2 = 0, unrecordedBothKm2 = 0, comparedKm2 = 0;
  const bump = (m, k, a, init) => { let e = m.get(k); if (!e) m.set(k, (e = Object.assign({ km2: 0 }, init()))); e.km2 += a; return e; };
  const verdicts = new Map();
  const judge = (ia, ib) => {
    const vk = ia * 1048576 + ib; let v = verdicts.get(vk);
    if (v) return v;
    const pa = CA.classes[ia], pb = CB.classes[ib];
    if (!pa.named && !pb.named) v = { what: 'neither' };
    else if (pa.named && pb.named) {
      const eq = sameSet(pa.set, pb.set, idsA, idsB);
      if (eq.same) {
        if (pa.en === pb.en) v = { what: 'same' };
        else {
          /* the bracket the record writes the holder in — compared polity by polity, matched by identifier */
          const gloss = (n) => { const m = IntMapEraName.split(n); return m ? m.gloss.toLowerCase() : ''; };
          let held = false;
          for (const x of pa.set) for (const y of pb.set) if (samePolity(idsA[x], idsB[y]).same && gloss(idsA[x].en) !== gloss(idsB[y].en)) held = true;
          v = (held || drawRenamed) ? { what: 'transfer', key: pa.key + ' → ' + pb.key, byNameOnly: false, sameIdentifier: true, held } : { what: 'renamed', key: pa.key + ' → ' + pb.key };
        }
      }
      else {
        /* by name only when no polity of either side shares an identifier type with one of the other */
        let byNameOnly = true; for (const x of pa.set) for (const y of pb.set) if (samePolity(idsA[x], idsB[y]).by !== 'name') byNameOnly = false;
        v = { what: 'transfer', key: pa.key + ' → ' + pb.key, byNameOnly };
      }
    } else v = { what: pa.named ? 'fromOnly' : 'toOnly' };
    verdicts.set(vk, v); return v;
  };
  for (let r = 0; r < L.rows; r++) {
    const a = areaOfRow[r], base = r * L.cols;
    for (let c = 0; c < L.cols; c++) {
      const cell = base + c, ia = CA.of[cell], ib = CB.of[cell], pa = CA.classes[ia], pb = CB.classes[ib];
      const onLand = labLand ? labLand.first[cell] >= 0 : null;
      if (pa.kind === 'none' && pb.kind === 'none') { if (onLand) { landKm2 += a; unrecordedBothKm2 += a; } continue; }
      if (onLand !== false) landKm2 += a;
      if (pa.named) bump(heldA, pa.key, a, () => ({}));
      if (pb.named) bump(heldB, pb.key, a, () => ({}));
      const v = judge(ia, ib);
      if (v.what === 'same' || v.what === 'neither') { if (v.what === 'same') comparedKm2 += a; continue; }
      if (v.what === 'renamed') { comparedKm2 += a; bump(renamed, v.key, a, () => ({ from: setNames(pa.set, idsA), to: setNames(pb.set, idsB) })); continue; }
      if (v.what === 'transfer') {
        comparedKm2 += a;
        const e = bump(transfers, v.key, a, () => ({ fromKey: pa.key, toKey: pb.key, from: setNames(pa.set, idsA), to: setNames(pb.set, idsB),
          overlap: pa.kind === 'overlap' || pb.kind === 'overlap', comparedByNameOnly: !!v.byNameOnly, sameIdentifier: !!v.sameIdentifier, holderInName: !!v.held, cells: [] }));
        e.cells.push(cell);
        continue;
      }
      /* one instant draws a polity here and the other does not: the edge of a record, not a transfer */
      if (v.what === 'fromOnly') bump(recordOnly, 'from:' + pa.key, a, () => ({ side: 'from', polity: setNames(pa.set, idsA), onLand: onLand !== false, otherDraws: pb.kind }));
      else bump(recordOnly, 'to:' + pb.key, a, () => ({ side: 'to', polity: setNames(pb.set, idsB), onLand: onLand !== false, otherDraws: pa.kind }));
    }
    await tick();
  }
  const list = [...transfers.values()].sort((x, y) => y.km2 - x.km2);
  for (const t of list) {
    t.shareOfFrom = heldA.has(t.fromKey) ? t.km2 / heldA.get(t.fromKey).km2 : null;
    t.shareOfTo = heldB.has(t.toKey) ? t.km2 / heldB.get(t.toKey).km2 : null;
    t.pieces = pieces(t.cells, L, areaOfRow);
  }
  return {
    from, to, records: { from: A.record, to: B.record }, lattice: L,
    stepKm: L.step * D2R * R_KM * Math.cos(((L.s + L.n) / 2) * D2R),
    transfers: list,
    renamed: [...renamed.values()].sort((x, y) => y.km2 - x.km2),
    recordOnly: [...recordOnly.values()].sort((x, y) => y.km2 - x.km2),
    totals: { landKm2, comparedKm2, changedKm2: list.reduce((s, t) => s + t.km2, 0), unrecordedBothKm2 },
  };
}

/* ══ WHAT ATLAS RECEIVES — JSON-safe, names as the records write them, areas rounded to the lattice ══ */
const nmList = (arr) => arr.map((n) => (n.local && n.local !== n.en ? n.local + ' (' + n.en + ')' : n.en)).join(' / ');
const r0 = (x) => Math.round(x);
const pct = (x) => (x == null ? null : Math.round(x * 1000) / 10);
export function forAtlas(R, lang) {
  if (R.failed) return Object.assign({ failed: R.failed, side: R.side || null }, R.failed === 'lattice-too-large' ? { cells: R.cells, defaultStepDeg: +R.fits.step.toFixed(5) } : {});
  const L = R.lattice;
  return {
    from: instantLabel(R.from, 'en'), to: instantLabel(R.to, 'en'), records: R.records,
    region: [L.w, L.s, L.e, L.n].map((v) => +v.toFixed(4)), stepDeg: +L.step.toFixed(5), stepKmAtCentre: Math.round(R.stepKm * 10) / 10,
    comparedBy: 'the CShapes state code where both instants state one, else the Wikidata item, else the names the records write — a renamed state with the same identifier is listed under renamed, not as a transfer',
    areasAre: 'km² of the lattice cells whose centre each record draws inside the polity — good to about half a cell along every edge; land narrower than a cell can be missed',
    transfers: R.transfers.map((t) => Object.assign({ from: nmList(t.from), to: nmList(t.to), km2: r0(t.km2),
      shareOfFromPct: pct(t.shareOfFrom), shareOfToPct: pct(t.shareOfTo), pieces: t.pieces.length,
      largestPieceAt: t.pieces[0] && t.pieces[0].lng != null ? [+t.pieces[0].lng.toFixed(3), +t.pieces[0].lat.toFixed(3)] : null },
    t.overlap ? { overlap: 'one side draws two shapes over this land; none is chosen' } : {},
    t.comparedByNameOnly ? { comparedByNameOnly: 'the two records share no identifier for these polities — this may be one polity written under two names' } : {})),
    renamed: R.renamed.map((x) => ({ from: nmList(x.from), to: nmList(x.to), km2: r0(x.km2) })),
    recordOnly: R.recordOnly.map((x) => ({ drawnOnlyAt: x.side === 'from' ? instantLabel(R.from, 'en') : instantLabel(R.to, 'en'), polity: nmList(x.polity), km2: r0(x.km2), otherInstantDraws: x.otherDraws === 'none' ? (x.onLand ? 'land with no record' : 'nothing (sea)') : 'a shape without a name' })),
    totals: { changedKm2: r0(R.totals.changedKm2), comparedKm2: r0(R.totals.comparedKm2), landKm2: r0(R.totals.landKm2), landNoRecordAtEitherKm2: r0(R.totals.unrecordedBothKm2) },
    lang,
  };
}

/* ══ THE READER'S ANSWER ══════════════════════════════════════════════════════════════════════════ */
function failText(code, t) {
  if (code === 'history-borders-not-loaded') return t('The historical border records are not loaded.', '歴史国境の記録が読み込まれていません。');
  if (code === 'record-not-readable') return t('No border record could be read for this instant.', 'この時点の国境の記録を読み込めませんでした。');
  if (code === 'country-outlines-not-loaded') return t('Today’s country outlines are not loaded yet.', '現在の国境データがまだ読み込まれていません。');
  if (code === 'region-empty') return t('The region has no extent.', '範囲に広がりがありません。');
  if (code === 'lattice-too-large') return t('That step makes more cells than this page can hold. A coarser step answers it.', 'その刻みではこのページが持てる数を超えるセルになります。もっと粗い刻みなら答えられます。');
  return t('Could not be read.', '読み込めませんでした。');
}
export function answerHtml(R, lang, opts) {
  const o = opts || {}, t = IntMapLang.pick(() => lang);
  if (R.failed) return '<div>' + htmlText(failText(R.failed, t)) + '</div>';
  const loc = lang === 'jp' ? 'ja-JP' : 'en-US';
  const km2 = (x) => Math.round(x).toLocaleString(loc) + ' km²';
  const sw = (c) => c ? '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px;background:' + htmlText(c) + ';"></span>' : '';
  const nm = (arr) => htmlText(arr.map((n) => n.local || n.en).join(' / '));
  const share = (x) => (x == null ? '' : (Math.round(x * 1000) / 10).toLocaleString(loc) + '%');
  const muted = (s) => '<span style="color:var(--text-muted);">' + s + '</span>';
  let h = '<div style="margin-top:4px;">' + htmlText(t('Changed hands: ', '持ち主が変わった土地: ')) + '<b>' + htmlText(km2(R.totals.changedKm2)) + '</b>'
    + muted(htmlText(t(' in ' + R.transfers.length + (R.transfers.length === 1 ? ' transfer' : ' transfers'), '（' + R.transfers.length + ' 件の移動）'))) + '</div>';
  if (!R.transfers.length) h += '<div>' + htmlText(t('The records draw the same polity over every cell they draw at both instants.', '両方の時点で記録が描くすべてのセルで、同じ政体が描かれています。')) + '</div>';
  else {
    h += '<div style="line-height:1.6;margin-top:2px;">' + R.transfers.map((x) => '<div>' + sw((o.colors || {})[x.toKey]) + nm(x.from) + ' → <b>' + nm(x.to) + '</b> ' + muted(htmlText(km2(x.km2)
      + (x.shareOfFrom != null ? t(' · ' + share(x.shareOfFrom) + ' of the giver here', ' · 元の持ち主の ' + share(x.shareOfFrom)) : '')
      + (x.shareOfTo != null ? t(' · ' + share(x.shareOfTo) + ' of the receiver here', ' · 新しい持ち主の ' + share(x.shareOfTo)) : '')))
      + (x.overlap ? ' ' + muted(htmlText(t('(two shapes drawn at once)', '（2 つの形が重なる）'))) : '')
      + (x.comparedByNameOnly ? ' ' + muted(htmlText(t('(compared by name only — the records share no identifier)', '（名前だけで比較 — 記録が共通の識別子を持たない）'))) : '') + '</div>').join('') + '</div>';
  }
  if (R.renamed.length) h += '<div style="margin-top:6px;"><b>' + htmlText(t('Same state, other name', '同じ国家・別の名前')) + '</b><div style="line-height:1.6;">'
    + R.renamed.map((x) => nm(x.from) + ' → ' + nm(x.to) + ' ' + muted(htmlText(km2(x.km2)))).join(' · ') + '</div></div>';
  if (R.recordOnly.length) h += '<div style="margin-top:6px;"><b>' + htmlText(t('Drawn at one instant only (the edge of a record, not a transfer)', '片方の時点だけが描く土地（記録の端であって移動ではない）')) + '</b><div style="line-height:1.6;">'
    + R.recordOnly.map((x) => nm(x.polity) + ' ' + muted(htmlText(instantLabel(x.side === 'from' ? R.from : R.to, lang) + ' · ' + km2(x.km2)))).join(' · ') + '</div></div>';
  const L = R.lattice;
  h += '<div style="margin-top:6px;font-size:11px;color:var(--text-muted);">' + htmlText(t('Records: ', '記録: ') + instantLabel(R.from, lang) + ' — ' + ((R.records.from && (R.records.from.src || R.records.from.tier)) || '') + ' · ' + instantLabel(R.to, lang) + ' — ' + ((R.records.to && (R.records.to.src || R.records.to.tier)) || '')) + '</div>';
  h += '<div style="margin-top:4px;font-size:10.5px;color:var(--text-muted);line-height:1.45;">' + htmlText(t(
    'Each record was asked which polity it draws at the centre of every ' + (+L.step.toFixed(4)) + '° cell (≈ ' + Math.round(R.stepKm) + ' km) — areas are good to about half a cell along every edge, and land narrower than a cell can be missed. Polities are compared by the CShapes state code where both instants state one, else by the Wikidata item, else by the names the records write. The coloured land is held at the second instant by the polity of its colour.',
    '各記録に、' + (+L.step.toFixed(4)) + '°（約 ' + Math.round(R.stepKm) + ' km）のセルの中心でどの政体を描くかを訊きました。面積は各辺でセル半分ほどの精度で、セルより細い土地は漏れることがあります。政体の同一性は、両時点が CShapes の国家コードを持てばそれで、無ければ Wikidata の項目で、それも無ければ記録が書く名前で判定しています。色の付いた土地は、2 つ目の時点でその色の政体が持つ土地です。')) + '</div>';
  return h;
}

/* ══ ON THE MAP — one (Multi)Polygon per transfer, coloured by the polity that receives it ══ */
function transferPolys(R, colorOf, lang) {
  const colors = {}, polys = []; let n = 0;
  for (const x of R.transfers) {
    if (!colors[x.toKey]) colors[x.toKey] = colorOf(n++);
    const rings = traceCells(x.cells, R.lattice);
    if (!rings.length) continue;
    const name = IntMapLang.t(lang, x.from.map((v) => v.en).join(' / ') + ' → ' + x.to.map((v) => v.en).join(' / '),
      x.from.map((v) => v.local || v.en).join(' / ') + ' → ' + x.to.map((v) => v.local || v.en).join(' / ')) + ' · ' + Math.round(x.km2).toLocaleString(lang === 'jp' ? 'ja-JP' : 'en-US') + ' km²';
    polys.push({ geo: rings.length === 1 ? { type: 'Polygon', coordinates: rings[0] } : { type: 'MultiPolygon', coordinates: rings }, color: colors[x.toKey], op: 0.45, name });
  }
  return { polys, colors };
}

/* ══ ATLAS — `time.territoryChange` (js/atlas-cap-time.js), fetched with this module on first use ══ */
const DRAW_PREFIX = 'territory:';
const WORLD = [-180, -85, 180, 85];
async function regionBox(a, K) {
  if (Array.isArray(a.bbox) && a.bbox.length === 4 && a.bbox.every((v) => isFinite(+v))) {
    const b = a.bbox.map(Number);
    if (b[0] > b[2]) return { box: [-180, Math.min(b[1], b[3]), 180, Math.max(b[1], b[3])], name: '' };   /* across 180°: the band (below) */
    return { box: [Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[0], b[2]), Math.max(b[1], b[3])], name: '' };
  }
  const place = String(a.place || a.region || '').trim();
  if (place && (K.WORLD_RE ? K.WORLD_RE.test(place) : /^(world|globe|世界)$/i.test(place))) return { box: WORLD.slice(), name: place };
  if (place) {
    let ext = null; try { ext = K.placeExtent ? await K.placeExtent(place) : null; } catch (_) { ext = null; }
    if (!ext) { try { ext = await K.geocode(place); } catch (_) { ext = null; } }
    let box = null;
    if (ext && ext.box) { const bx = ext.box; box = Array.isArray(bx[0]) ? [+bx[0][0], +bx[0][1], +bx[1][0], +bx[1][1]] : (bx.length === 4 ? bx.map(Number) : null); }
    else if (ext && ext.bbox && ext.bbox.length === 4) box = ext.bbox.map(Number);
    if (!box && ext && isFinite(ext.lng)) return { failed: 'place-has-no-extent', name: ext.name || place };
    if (!box) return { failed: 'place-not-found', name: place };
    /* a region whose west edge lies east of its east edge crosses 180° (Russia, Fiji, the Pacific): the lattice cannot wrap,
       so it is asked as the whole band of latitude it spans, and the answer's region says so */
    if (box[0] > box[2]) return { box: [-180, Math.min(box[1], box[3]), 180, Math.max(box[1], box[3])], name: (ext && ext.name) || place };
    return { box: [Math.min(box[0], box[2]), Math.min(box[1], box[3]), Math.max(box[0], box[2]), Math.max(box[1], box[3])], name: (ext && ext.name) || place };
  }
  try { const b = K.GE().camera.getBounds(); return { box: [Math.max(-180, b.getWest()), Math.max(-85, b.getSouth()), Math.min(180, b.getEast()), Math.min(85, b.getNorth())], name: '', view: true }; }
  catch (_) { return { failed: 'no-region' }; }
}
function instantsOf(a) {
  const out = [];
  const one = (v) => (v == null ? null : (v === 'now' || v === true) ? instantOf({ now: true }) : (typeof v === 'number' || /^-?\d{1,6}$/.test(String(v).trim())) ? instantOf({ year: +v }) : instantOf({ date: String(v).trim() }));
  out.push(one(a.from != null ? a.from : (a.fromDate != null ? a.fromDate : a.fromYear)));
  out.push(one(a.to != null ? a.to : (a.toDate != null ? a.toDate : (a.toYear != null ? a.toYear : null))));
  return out;
}
export async function atlasRun(a, K) {
  const R = K.R, warn = K.warn, L = K.L, note = K.note, HOST = K.HOST;
  let lang = 'en'; try { lang = (HOST && HOST.lang) || 'en'; } catch (_) { lang = 'en'; }
  const [I0, I1raw] = instantsOf(a);
  if (!I0) return R(false, warn(htmlText(L('Give the first instant as a year or a YYYY-MM-DD date ("from").', '1 つ目の時点（from）を年か YYYY-MM-DD 形式の日付で指定してください。'))), { meta: { code: 'NEEDS_INPUT', category: 'input', retryable: true, produced: [], userGoalSatisfied: false } });
  /* no second instant = the instant on the clock — what the map is showing (time.journey reads it the same way) */
  let I1 = I1raw;
  if (!I1 && a.to == null && a.toDate == null && a.toYear == null) {
    if (IntMapTime.isLive()) I1 = instantOf({ now: true });
    else { const w = IntMapTime.when(), y = w.getFullYear(); I1 = { now: false, when: w, year: y, iso: (y < 0 ? '-' + String(-y).padStart(6, '0') : String(y).padStart(4, '0')) + '-' + String(w.getMonth() + 1).padStart(2, '0') + '-' + String(w.getDate()).padStart(2, '0') }; }
  }
  if (!I1) return R(false, warn(htmlText(L('«' + a.to + '» is not a year or a YYYY-MM-DD date.', '「' + a.to + '」は年でも YYYY-MM-DD 形式の日付でもありません。'))), { meta: { code: 'NEEDS_INPUT', category: 'input', retryable: true, produced: [], userGoalSatisfied: false } });
  const reg = await regionBox(a, K);
  if (reg.failed) return R(false, warn(htmlText(reg.failed === 'place-not-found' ? L('IntMap could not place «' + reg.name + '». Name a region IntMap holds, or give a bbox.', '「' + reg.name + '」を地図上に特定できませんでした。IntMap が持つ地域名か bbox で指定してください。')
    : reg.failed === 'place-has-no-extent' ? L('«' + reg.name + '» is a point, not a region. Name a region, or give a bbox.', '「' + reg.name + '」は点で、範囲を持ちません。地域名か bbox で指定してください。')
      : L('Which region? Name one, give a bbox, or show it on the map.', 'どの範囲ですか？地域名か bbox を指定するか、地図に表示してください。'))), { meta: { code: 'NEEDS_INPUT', category: 'input', retryable: true, produced: [], userGoalSatisfied: false } });
  try { if (K.ensureData) await K.ensureData(); } catch (_) { /* answered below */ }
  const stepDeg = (a.stepDeg != null && +a.stepDeg > 0) ? +a.stepDeg : (a.stepKm != null && +a.stepKm > 0) ? (+a.stepKm / (R_KM * D2R)) : null;
  const res = await territoryChange(reg.box, I0, I1, { borders: bordersNow(), land: countryOutlines, lang }, { stepDeg });
  const title = '<b>' + htmlText(L('Land that changed hands', '持ち主が変わった土地')) + ' — ' + htmlText(instantLabel(I0, lang) + ' → ' + instantLabel(I1, lang)) + (reg.name ? ' · ' + htmlText(reg.name) : '') + '</b>';
  const exec = { territoryChange: forAtlas(res, lang) };
  if (res.failed) return R(false, title + answerHtml(res, lang), { exec });
  /* a redraw of the same question replaces its own land (the question is the identity — journey's rule) */
  const L0 = res.lattice;
  const ident = DRAW_PREFIX + instantLabel(I0, 'en') + '>' + instantLabel(I1, 'en') + '@' + [L0.w, L0.s, L0.e, L0.n].map((v) => v.toFixed(3)).join(',') + '/' + L0.step.toFixed(5);
  K._hlPolys = K._hlPolys.filter((p) => !(p && p.territory === ident));
  const F = transferPolys(res, (i) => K._hlPaletteColor(i), lang);
  for (const p of F.polys) { p.territory = ident; p.key = ident + ' ' + p.name; K._hlPolys.push(p); }
  const okP = K.paintPolys();
  try { if (L0.e - L0.w < 340) K.GE().camera.fitBounds([[L0.w, L0.s], [L0.e, L0.n]], { padding: 60, maxZoom: 9, duration: 900 }); } catch (_) { /* no renderer */ }
  exec.territoryChange.drawnOnMap = okP ? F.polys.length : 0;
  const html = title + answerHtml(res, lang, { colors: okP ? F.colors : {} })
    + (res.transfers.length ? note(htmlText(L('To see the borders of either instant under the coloured land, move the clock to it.', '色の付いた土地の下にどちらかの時点の国境を出すには、時計をその時点へ動かしてください。'))) : '');
  /* what is on the map, declared for the paint observer: the transfers' polygons by name; NOTHING when nothing changed
     hands (an empty map is this answer, js/atlas-capabilities.js `paintsNothing`); a paint that did not take is partial */
  const meta = { resultKey: 'time.territoryChange:' + ident };
  if (!F.polys.length) meta.paintsNothing = true;
  else if (okP) meta.painted = { polys: F.polys.map((p) => p.name) };
  else meta.partial = true;
  return R(true, html, { exec, meta });
}
