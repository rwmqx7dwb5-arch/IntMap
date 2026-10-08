/* ============================================================================
 *  IntMap · scripts/lib/world-svg.mjs — a whole-world picture (SVG) of the outlines a record draws, with no browser   (history-year-pages)
 * ----------------------------------------------------------------------------
 *  The year pages (scripts/year-pages.mjs) show the world on one date as the map draws it. A search engine and a reader
 *  without JavaScript read a picture, not the app, so the picture is drawn here from the SAME FeatureCollection the map
 *  draws on that instant (js/time-borders.js collectionAt, read through scripts/history-pages.mjs mapReader) — nothing is
 *  drawn that the record does not hold for that date.
 *
 *  ⚠ SIMPLIFIED FOR DISPLAY ONLY, AND SAID SO ON THE PAGE. At the picture's size (WIDTH px across the whole world) one
 *  pixel is about a third of a degree; each ring is reduced (Douglas–Peucker, in the picture's own pixels) to TOLERANCE_PX,
 *  and a ring whose whole extent is under one pixel is not drawn in the picture. The data is untouched: the map draws
 *  every outline in full. (.agents/rules/historical-verification.md §0: 縮小時の軽量化は表示のみ.)
 *  ⚠ THE RECORD IS NOT THE LAND (scripts/lib/map-card.mjs says the same): ground no record states a polity on would read
 *  as sea, so today's land (Natural Earth 1:110m — the scale Natural Earth draws for a whole-world map of this size) is laid first in a colour of its own.
 *
 *  Projection: Equal Earth (Šavrič, Patterson & Jenny 2018) — equal-area, so no polity is drawn larger than it is drawn
 *  on the globe relative to another. A ring that crosses 180° is unwrapped and drawn once per side, clipped to the
 *  projection's outline; a ring that runs round a pole is drawn as it is (its seam lies on the outline).
 * ==========================================================================*/

/* ⚠ (no-ad-hoc-hardcoding §4) observation: 2026-10-07, the 114 year pictures at 1000 px across and one-pixel tolerance
   weigh 8.3 MB together, the largest (1453) about 140 kB and 1914 79 kB (about 30 kB gzipped) — a picture as sharp as the
   page column shows it (css/history-pages.css .yp-map), measured in dev-notes/2026-10-07-history-year-pages.md §3;
   lapses: if the page shows the picture wider than WIDTH css pixels; canonical: here (the page reads WIDTH/HEIGHT off
   `draw`'s answer). */
export const WIDTH = 1000;
const TOLERANCE_PX = 1;
const GRID = 10;   /* coordinates are written as integers at GRID units per pixel — a tenth of a pixel, below what can be seen */

/* ── Equal Earth ─────────────────────────────────────────────────────────────────────────────── */
const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2, RAD = Math.PI / 180;
function ee(lon, lat) {
  const t = Math.asin(M * Math.sin(Math.max(-90, Math.min(90, lat)) * RAD)), t2 = t * t, t6 = t2 * t2 * t2;
  const x = 2 * Math.sqrt(3) * lon * RAD * Math.cos(t) / (3 * (9 * A4 * t6 * t2 + 7 * A3 * t6 + 3 * A2 * t2 + A1));
  const y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return [x, y];
}
const XMAX = ee(180, 0)[0], YMAX = ee(0, 90)[1];
export const HEIGHT = Math.ceil(WIDTH * YMAX / XMAX);
/** the projection at a picture `w` pixels across (the page's picture is WIDTH; a link card draws the same world at its own width) */
const projector = (w) => { const k = w / (2 * XMAX); return (lon, lat) => { const [x, y] = ee(lon, lat); return [(x + XMAX) * k, (YMAX - y) * k]; }; };
const px = projector(WIDTH);
/** the height of the whole world drawn `w` pixels across */
export const heightAt = (w) => Math.ceil(w * YMAX / XMAX);

/* ── simplification (Douglas–Peucker, iterative) in pixels ─────────────────────────────────────── */
function simplify(pts, tol) {
  const n = pts.length;
  if (n < 4) return pts;
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]], t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = pts[i];
      let d;
      if (L === 0) d = (x - ax) ** 2 + (y - ay) ** 2;
      else { const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)); d = (ax + u * dx - x) ** 2 + (ay + u * dy - y) ** 2; }
      if (d > best) { best = d; bi = i; }
    }
    if (best > t2) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** one ring ([[lon,lat],…]) → the pixel rings that draw it (one, or one per side of 180°), at a picture `w` pixels across */
function ringPaths(ring, w = WIDTH, P = px) {
  const n = ring.length;
  if (n < 3) return [];
  let cross = 0;
  for (let i = 0; i < n; i++) if (Math.abs(ring[(i + 1) % n][0] - ring[i][0]) > 180) cross++;
  const variants = [];
  if (cross === 0 || cross % 2 === 1) variants.push(ring);   /* plain, or round a pole: its seam lies on the outline */
  else {
    /* unwrap to a continuous longitude, then draw it on each side; the outline clips what falls beyond */
    const u = [ring[0].slice()];
    for (let i = 1; i < n; i++) { let lon = ring[i][0]; const prev = u[i - 1][0]; while (lon - prev > 180) lon -= 360; while (prev - lon > 180) lon += 360; u.push([lon, ring[i][1]]); }
    variants.push(u, u.map(([lon, lat]) => [lon - 360, lat]), u.map(([lon, lat]) => [lon + 360, lat]));
  }
  const out = [];
  for (const v of variants) {
    const p = v.map(([lon, lat]) => P(lon, lat));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of p) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0 || x0 > w) continue;                     /* a copy wholly off the picture */
    if (x1 - x0 < 1 && y1 - y0 < 1) continue;               /* under one pixel: not drawn in the picture */
    const s = simplify(p.concat([p[0]]), TOLERANCE_PX);
    if (s.length >= 4) out.push(s);
  }
  return out;
}
/** pixel rings → SVG path data (absolute first point, then relative integer steps at GRID per pixel) */
function pathData(rings) {
  let d = '';
  for (const r of rings) {
    let lx = Math.round(r[0][0] * GRID), ly = Math.round(r[0][1] * GRID);
    d += 'M' + lx + ' ' + ly;
    let seg = '';
    for (let i = 1; i < r.length - 1; i++) {
      const x = Math.round(r[i][0] * GRID), y = Math.round(r[i][1] * GRID);
      if (x === lx && y === ly) continue;
      seg += (seg ? ' ' : 'l') + (x - lx) + ' ' + (y - ly);
      lx = x; ly = y;
    }
    d += seg + 'z';
  }
  return d;
}
const partsOf = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
/** a geometry → path data, or '' when nothing of it is visible at the picture's size */
export function geometryPath(g) {
  const rings = [];
  for (const part of partsOf(g)) for (const ring of part) rings.push(...ringPaths(ring));
  return pathData(rings);
}
/** (marketing-growth) a geometry → its pixel rings at a picture `w` pixels across, simplified to TOLERANCE_PX of that picture —
 *  what scripts/lib/page-card.mjs fills for a year page's link card, the same rings the page's SVG writes at its own width */
export function pixelRings(g, w) {
  const P = projector(w), rings = [];
  for (const part of partsOf(g)) for (const ring of part) rings.push(...ringPaths(ring, w, P));
  return rings;
}
/** the projection's outline (the edge of the world) as one pixel ring, at a picture `w` pixels across */
export function outlineRing(w = WIDTH) {
  const P = w === WIDTH ? px : projector(w), pts = [];
  for (let lat = -90; lat <= 90; lat += 1) pts.push(P(180, lat));
  for (let lat = 90; lat >= -90; lat -= 1) pts.push(P(-180, lat));
  return pts;
}
/** the projection's outline (the edge of the world), as path data */
function outlinePath() {
  const pts = outlineRing();
  return 'M' + pts.map(([x, y]) => Math.round(x * GRID) + ' ' + Math.round(y * GRID)).join('L') + 'z';
}

/* the palette: soft tints of iOS system colours (the picture carries no labels — the page lists the names), one per
   name and stable across years (a polity keeps its colour from page to page); the sea and the land in light and dark */
export const FILLS = ['#a7c7e7', '#f6c28b', '#b5dfa8', '#f3a6a6', '#cdb4e6', '#f7dc8a', '#9fd8d3', '#e8b4cf', '#c9d39b', '#b8c4d6'];
export function hue(name) { let h = 2166136261; for (const ch of String(name)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) % FILLS.length; }

/**
 * Draw the world.
 * @param {{ land: object[], features: { geometry: object, name: string, pale?: boolean }[], title: string }} o
 *   `land` today's land polygons (GeoJSON geometries); `features` the record's outlines in drawing order, `pale` for the
 *   ones drawn lighter (an outline borrowed from a sheet of another year); `title` the picture's own title
 * @returns {{ svg: string, width: number, height: number, drawn: number, skipped: number }}
 */
export function draw(o) {
  const out = [];
  let drawn = 0, skipped = 0;
  for (const f of o.features) {
    const d = geometryPath(f.geometry);
    if (!d) { skipped++; continue; }
    drawn++;
    out.push(`<path class="p${hue(f.name)}${f.pale ? ' s' : ''}" d="${d}"/>`);
  }
  const land = o.land.map(geometryPath).filter(Boolean).join('');
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const W = WIDTH * GRID, H = HEIGHT * GRID;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${WIDTH}" height="${HEIGHT}" role="img">
<title>${esc(o.title)}</title>
<style>
.o{fill:#dfe8f2}.l{fill:#d1d1d6}path{fill-rule:evenodd;stroke:#fff;stroke-width:4;stroke-linejoin:round}.o,.l{stroke:none}
${FILLS.map((c, i) => `.p${i}{fill:${c}}`).join('')}.s{fill-opacity:.5}
@media (prefers-color-scheme:dark){.o{fill:#0c1a2b}.l{fill:#3a3a3c}path{stroke:#1c1c1e}${FILLS.map((c, i) => `.p${i}{fill:${c};fill-opacity:.62}`).join('')}.s{fill-opacity:.3}}
</style>
<defs><clipPath id="w"><path d="${outlinePath()}"/></clipPath></defs>
<path class="o" d="${outlinePath()}"/>
<g clip-path="url(#w)">
<path class="l" d="${land}"/>
${out.join('\n')}
</g>
</svg>
`;
  return { svg, width: WIDTH, height: HEIGHT, drawn, skipped };
}
