/* (news-past-fixes) WHICH BOUNDARY FILES COULD HOLD A POINT — the one codec the election build writes and the reader reads.
 *
 * A reader that holds a point (js/elections.js `atPoint`: a news event's «This place's past», Atlas news.eventPast) must not
 * download every boundary era to find the few that contain it. The index used to carry ONE box per file, and one box cannot
 * describe a polity that crosses the date line or owns land overseas: Russia's and the United States' boxes ran from −180 to
 * 180, France's from the Caribbean to the Indian Ocean, so every point on Earth fell inside them. MEASURED 2026-11-17 in
 * production: a London event fetched fr-2010 (2.49 MB), ru-oik-2016 (2.88 MB), us-house-c116 and eu-ms-2024 — the answer was
 * right, the downloads were not. Merging the boxes of the polygons does not cure it either (the EU's French and Belgian boxes
 * still cover London at every merge threshold measured).
 *
 * So each file states the GRID CELLS ITS POLYGONS TOUCH: a cell is listed when a ring edge passes through it (the edge's own
 * box, so never fewer) or when its centre lies inside a polygon (a cell no edge crosses is wholly inside or wholly outside).
 * The list is therefore a SUPERSET of the geometry — a point outside it is outside every district of the file, and the exact
 * point-in-polygon test still decides inside it. The test in tests/news-with-history-checks.test.mjs holds every vertex and
 * every district's interior to it.
 *
 * ⚠ THE CELL SIZE, `DEG = 1`: measured 2026-11-17 over the 82 boundary files — 1° costs 18.6 kB in index.json (0.5°: 40.1 kB)
 * and both keep London out of fr / ru / us / EU-2024, Paris out of uk. Invalid when a point's neighbours across ~100 km stop
 * being the cost that matters (a finer grid then); the value lives here only, and the index records the size it was built at
 * (`cover.deg`) so a reader never assumes it.
 *
 * Encoding: the listed cells, row-major from the south-west (index = row × (360/deg) + column), as runs — `gap.length` in
 * base 36, gap counted from the end of the previous run, separated by spaces. */

export const DEG = 1;

const cols = (deg) => Math.round(360 / deg);
const rows = (deg) => Math.round(180 / deg);
const col = (x, deg) => Math.min(cols(deg) - 1, Math.max(0, Math.floor((x + 180) / deg)));
const row = (y, deg) => Math.min(rows(deg) - 1, Math.max(0, Math.floor((y + 90) / deg)));

/** the cell a point lies in */
export function cellOf(x, y, deg) { return row(y, deg) * cols(deg) + col(x, deg); }

function inside(x, y, poly) {
  let on = false;
  for (const r of poly) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) on = !on;
  }
  return on;
}

/** the cells a FeatureCollection's polygons touch (a Set of cell indices) */
export function coverOf(fc, deg = DEG) {
  const cells = new Set(), W = cols(deg);
  for (const f of (fc && fc.features) || []) {
    const g = f && f.geometry; if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const p of polys) {
      let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
      for (const r of p) for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        for (let X = col(Math.min(a[0], b[0]), deg); X <= col(Math.max(a[0], b[0]), deg); X++)
          for (let Y = row(Math.min(a[1], b[1]), deg); Y <= row(Math.max(a[1], b[1]), deg); Y++) cells.add(Y * W + X);
        if (a[0] < w) w = a[0]; if (a[0] > e) e = a[0]; if (a[1] < s) s = a[1]; if (a[1] > n) n = a[1];
      }
      if (!isFinite(w)) continue;
      for (let X = col(w, deg); X <= col(e, deg); X++) for (let Y = row(s, deg); Y <= row(n, deg); Y++) {
        const k = Y * W + X;
        if (!cells.has(k) && inside(-180 + (X + 0.5) * deg, -90 + (Y + 0.5) * deg, p)) cells.add(k);
      }
    }
  }
  return cells;
}

/** a Set of cells → the runs string */
export function encodeCells(cells) {
  const out = []; let last = 0, start = -1, len = 0;
  const flush = () => { if (len) { out.push((start - last).toString(36) + '.' + len.toString(36)); last = start + len; } };
  for (const k of [...cells].sort((a, b) => a - b)) {
    if (len && k === start + len) { len++; continue; }
    flush(); start = k; len = 1;
  }
  flush();
  return out.join(' ');
}

/** the runs string → a Set of cells */
export function decodeCells(s) {
  const cells = new Set(); let at = 0;
  for (const t of String(s || '').split(' ')) {
    if (!t) continue;
    const [g, l] = t.split('.');
    at += parseInt(g, 36);
    for (let i = 0, n = parseInt(l, 36); i < n; i++) cells.add(at + i);
    at += parseInt(l, 36);
  }
  return cells;
}
