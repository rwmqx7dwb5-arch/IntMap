/* ============================================================================
 *  hist-knowledge.js — WHAT THE MAP KNOWS, DRAWN ON THE MAP  (hist-coverage)
 * ----------------------------------------------------------------------------
 *  「Every year of the world, on one map」 is the product's first promise, and the record
 *  under it is uneven: measured 2026-10-03 with scripts/hist-fidelity.mjs, the share of the
 *  land inside a polity that carries a first-level subdivision is 0.0% in 500 BC, 1.1% in
 *  1000, 4.9% in 1500, 25.4% in 1800, 47.5% in 1900 and 64.6% in 2019. In 1900, 82 polities
 *  carry none and 29 carry some.
 *
 *  ⚠⚠⚠ WHAT THE READER SAW OF THAT WAS NOTHING. A polity with no subdivision line looks
 *  exactly like a polity that had no subdivisions — the empty ground reads as calm, as
 *  settled, as «nothing to say here». The only place the map admitted the gap was a tooltip
 *  on the layer row. A gap that is invisible is a claim (CONSTITUTION「偽物・ハリボテ禁止」).
 *  ⇒ The ground the record is silent about is drawn AS SILENCE: hatched, and named.
 *
 *  ══ ONE RULE, EVERY READER ════════════════════════════════════════════════════
 *  The measure that the gate records (npm run check:histfidelity) and the hatch the reader
 *  sees are the SAME function, here, evaluated in both places — the gate imports this file,
 *  js/time-admin1.js imports it. A second copy of «which ground is covered» would be a second
 *  answer, and #R730 measured what two implementations of one rule cost: both wrong by the
 *  same amount and a consistency check that stayed green.
 *  ⚠ NOTHING IN HERE TOUCHES THE DOM, THE MAP, THE CLOCK OR THE LANGUAGE — the property
 *  js/hist-scale.js keeps, for the same reason: what is not evaluable is not testable.
 *
 *  ══ THE MEASURE ═══════════════════════════════════════════════════════════════
 *  A 0.25° grid. The denominator is the land the map itself puts inside a polity that year
 *  (the cell's centre lies inside the polity), the numerator the part of it a first-level
 *  unit in force covers. A cell belongs to the LAST polity drawn over it — the order the
 *  records list them in — which is how the gate has always counted, so the recorded numbers
 *  stay comparable. Every cell is also weighted by cos(latitude) (`pctArea`), because a 0.25°
 *  cell at 60° N is half the ground of one at the equator and «被覆は面積で» means ground.
 *  Status of a polity: NONE below 1% of its cells, FULL at 95% and above, PARTIAL between —
 *  the 5% slack is the resolution difference between a polity outline and a subdivision
 *  outline (#R719 measured the same quantity at 20% for a single unit inside a country; a
 *  whole country has far fewer edge cells in proportion).
 *
 *  ══ THE DRAWING ═══════════════════════════════════════════════════════════════
 *  · NONE    — the polity's OWN outline, exactly as the era layer draws it. Nothing is
 *              rasterised, so the hatch meets the border the reader is looking at.
 *  · PARTIAL — the uncovered cells of a finer local grid (0.1°, ~11 km) over the polity,
 *              merged into rectangles. The edge against the covered units is therefore a
 *              staircase of that size, and the hatch is a statement about ground at that
 *              resolution — not a boundary, and never drawn as a line.
 *  · FULL    — nothing.
 *  ⚠ EXPIRES IF the grid stops being cheap enough to run on a date change in a browser:
 *  measured 2026-10-03 in node, 1900 (150 polities, 688 units) takes the coarse pass plus 29
 *  local grids; the caller runs it off the critical path and drops a stale result.
 * ========================================================================== */

export const KNOW = Object.freeze({ res: 0.25, fineRes: 0.1, nonePct: 1, fullPct: 95 });

/** the grid's dimensions and its cell centres, for a resolution in degrees */
export function grid(res) {
  const NX = Math.round(360 / res), NY = Math.round(180 / res);
  return { res, NX, NY, latC: (j) => -90 + (j + 0.5) * res, lonC: (i) => -180 + (i + 0.5) * res };
}

/* even-odd scanline fill over a lon/lat window: every ring of a polygon is crossed on the row's own
   latitude, so a hole subtracts itself and no point-in-polygon test is run per cell.
   `win` = { x0, y0, res, NX, NY } — the whole world, or one polity's box. */
/* ⚠ (hist-coverage) EDGE-BUCKETED, BECAUSE THE PAGE RUNS IT NOW. The first form walked every edge of
   every ring once per ROW — rows × vertices — which the gate could afford and a date change in a browser
   cannot: measured in node on 1900 (150 polities, 688 units), 550 ms of a 770 ms pass was this loop.
   Each edge now visits only the rows it crosses. The crossing rule is unchanged — a row's centre `y`
   is crossed by an edge when exactly one end lies at or below it — so every cell is decided exactly as
   before, and the recorded coverage numbers do not move. */
export function scan(win, rings, cb) {
  let minY = 90, maxY = -90;
  for (const r of rings) for (const p of r) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  const R = win.res;
  const j0 = Math.max(0, Math.floor((minY - win.y0) / R - 0.5)), j1 = Math.min(win.NY - 1, Math.ceil((maxY - win.y0) / R));
  if (j1 < j0) return;
  const rows = new Array(j1 - j0 + 1);
  for (const r of rings) for (let k = 0, n = r.length; k < n; k++) {
    const a = r[k], b = r[(k + 1) % n];
    if (a[1] === b[1]) continue;
    const lo = a[1] < b[1] ? a[1] : b[1], hi = a[1] < b[1] ? b[1] : a[1];
    /* the rows whose centre may lie in [lo, hi), widened by one on each side and then asked exactly */
    const ja = Math.max(j0, Math.floor((lo - win.y0) / R - 0.5)), jb = Math.min(j1, Math.ceil((hi - win.y0) / R - 0.5));
    for (let j = ja; j <= jb; j++) {
      const y = win.y0 + (j + 0.5) * R;
      if ((a[1] <= y) === (b[1] <= y)) continue;
      const xs = rows[j - j0] || (rows[j - j0] = []);
      xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
  }
  for (let j = j0; j <= j1; j++) {
    const xs = rows[j - j0];
    if (!xs || xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.ceil((xs[k] - win.x0) / R - 0.5), i1 = Math.floor((xs[k + 1] - win.x0) / R - 0.5);
      if (i1 < 0 || i0 > win.NX - 1) continue;
      cb(j, Math.max(0, i0), Math.min(win.NX - 1, i1));
    }
  }
}

/** a GeoJSON geometry → polygons of rings (the shape every function here takes) */
export function polysOf(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}
function bboxOf(polys) {
  const b = [180, 90, -180, -90];
  for (const poly of polys) for (const p of (poly[0] || [])) {
    if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1];
  }
  return b;
}
export function status(pct) { return pct < KNOW.nonePct ? 'none' : pct < KNOW.fullPct ? 'partial' : 'full'; }

/* the coarse pass is held between calls: a date change on the page re-runs it, and a fresh 1M-cell
   pair of arrays per date change is garbage the reader pays for in jank */
const _buf = new Map();
function buffers(G) {
  let b = _buf.get(G.res);
  if (!b) { b = { cid: new Int32Array(G.NX * G.NY), cov: new Uint8Array(G.NX * G.NY) }; _buf.set(G.res, b); }
  b.cid.fill(-1); b.cov.fill(0);
  return b;
}

/**
 * The measure. `polities` = [{ nm, polys }], `units` = [{ polys }] (polys = polygons of rings).
 * Returns the world share, per-polity rows in descending size, and the per-cell arrays the drawing
 * half reads (valid until the next call at the same resolution).
 */
export function measure(polities, units, res = KNOW.res) {
  const G = grid(res), win = { x0: -180, y0: -90, res, NX: G.NX, NY: G.NY };
  const { cid, cov } = buffers(G);
  polities.forEach((c, ix) => {
    for (const poly of c.polys) scan(win, poly, (j, i0, i1) => { const base = j * G.NX; for (let i = i0; i <= i1; i++) cid[base + i] = ix; });
  });
  for (const u of units) for (const poly of u.polys) scan(win, poly, (j, i0, i1) => { const base = j * G.NX; for (let i = i0; i <= i1; i++) cov[base + i] = 1; });
  const tot = new Float64Array(polities.length), hit = new Float64Array(polities.length);
  const at = new Float64Array(polities.length), ah = new Float64Array(polities.length);
  let T = 0, H = 0, TA = 0, HA = 0;
  for (let j = 0; j < G.NY; j++) {
    const w = Math.cos(G.latC(j) * Math.PI / 180), base = j * G.NX;
    for (let i = 0; i < G.NX; i++) {
      const c = cid[base + i]; if (c < 0) continue;
      T++; TA += w; tot[c]++; at[c] += w;
      if (cov[base + i]) { H++; HA += w; hit[c]++; ah[c] += w; }
    }
  }
  const per = [];
  for (let c = 0; c < polities.length; c++) if (tot[c]) per.push({ ix: c, nm: polities[c].nm, cells: tot[c], hit: hit[c], pct: 100 * hit[c] / tot[c], pctArea: 100 * ah[c] / at[c] });
  per.sort((a, b) => b.cells - a.cells);
  return { res, pct: T ? 100 * H / T : 0, pctArea: TA ? 100 * HA / TA : 0, units: units.length, polities: per.length,
    zero: per.filter((p) => status(p.pct) === 'none').length,
    partial: per.filter((p) => status(p.pct) === 'partial').length,
    full: per.filter((p) => status(p.pct) === 'full').length, per,
    /* the per-cell arrays themselves (which polity, covered or not) — valid until the next call at this
       resolution; scripts/hist-fidelity.mjs reads them to say what lies under a hole */
    cells: { cid, cov, NX: G.NX, NY: G.NY } };
}

/* the uncovered cells of one polity on a local grid, merged into rectangles: a run of cells in a row
   is one rectangle, and a run that repeats exactly on the next row extends it downward */
function uncoveredRects(poly, units, res) {
  const bb = bboxOf(poly.polys);
  const x0 = Math.floor(bb[0] / res) * res, y0 = Math.floor(bb[1] / res) * res;
  const NX = Math.max(1, Math.ceil((bb[2] - x0) / res)), NY = Math.max(1, Math.ceil((bb[3] - y0) / res));
  const win = { x0, y0, res, NX, NY };
  const inP = new Uint8Array(NX * NY);
  for (const p of poly.polys) scan(win, p, (j, i0, i1) => { const base = j * NX; for (let i = i0; i <= i1; i++) inP[base + i] = 1; });
  for (const u of units) {
    const ub = u.bb || (u.bb = bboxOf(u.polys));
    if (ub[2] < bb[0] || ub[0] > bb[2] || ub[3] < bb[1] || ub[1] > bb[3]) continue;
    for (const p of u.polys) scan(win, p, (j, i0, i1) => { const base = j * NX; for (let i = i0; i <= i1; i++) inP[base + i] = 0; });
  }
  const rects = [], open = new Map();
  let sx = 0, sy = 0, n = 0;
  for (let j = 0; j < NY; j++) {
    const seen = new Set();
    let i = 0;
    while (i < NX) {
      if (!inP[j * NX + i]) { i++; continue; }
      let k = i; while (k + 1 < NX && inP[j * NX + k + 1]) k++;
      const key = i + ',' + k;
      for (let q = i; q <= k; q++) { sx += x0 + (q + 0.5) * res; sy += y0 + (j + 0.5) * res; n++; }
      const r = open.get(key);
      if (r && r.j1 === j - 1) r.j1 = j; else { if (r) rects.push(r); open.set(key, { i0: i, i1: k, j0: j, j1: j }); }
      seen.add(key);
      i = k + 1;
    }
    for (const [key, r] of open) if (!seen.has(key)) { rects.push(r); open.delete(key); }
  }
  for (const r of open.values()) rects.push(r);
  const box = (r) => {
    const a = x0 + r.i0 * res, b = y0 + r.j0 * res, c = x0 + (r.i1 + 1) * res, d = y0 + (r.j1 + 1) * res;
    return [[[a, b], [c, b], [c, d], [a, d], [a, b]]];
  };
  /* the label goes on the uncovered cell nearest the centroid of the uncovered cells — never on a
     covered one, where it would contradict the line beside it */
  let label = null;
  if (n) {
    const cx = sx / n, cy = sy / n; let best = Infinity;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) if (inP[j * NX + i]) {
      const x = x0 + (i + 0.5) * res, y = y0 + (j + 0.5) * res, d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d < best) { best = d; label = [x, y]; }
    }
  }
  return { polys: rects.map(box), cells: n, label };
}

/**
 * The ground the record is silent about, as GeoJSON: one area feature per polity that is not FULL,
 * and one label point for each. `polities` / `units` as in `measure`. Properties: `kind`
 * ('none' | 'partial'), `nm`, `pct` (cells, 0–100, one decimal).
 */
export function unknownGround(polities, units, opts = {}) {
  const res = opts.res || KNOW.res, fine = opts.fineRes || KNOW.fineRes;
  const m = measure(polities, units, res);
  const areas = [], labels = [];
  for (const p of m.per) {
    const kind = status(p.pct);
    if (kind === 'full') continue;
    const pol = polities[p.ix], pct = Math.round(p.pct * 10) / 10;
    const props = { kind, nm: pol.nm || '', pct };
    if (kind === 'none') {
      areas.push({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: pol.polys }, properties: props });
      const lr = uncoveredRects(pol, [], Math.max(fine, res));   /* only for the label: a cell inside the polity */
      if (lr.label) labels.push({ type: 'Feature', geometry: { type: 'Point', coordinates: lr.label }, properties: props });
    } else {
      const ur = uncoveredRects(pol, units, fine);
      if (!ur.polys.length) continue;
      areas.push({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: ur.polys }, properties: props });
      if (ur.label) labels.push({ type: 'Feature', geometry: { type: 'Point', coordinates: ur.label }, properties: props });
    }
  }
  return { measure: m, areas: { type: 'FeatureCollection', features: areas }, labels: { type: 'FeatureCollection', features: labels } };
}
