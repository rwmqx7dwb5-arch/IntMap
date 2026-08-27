#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE COASTLINE AS A MEASURABLE THING — data/coastline.json.gz   (#R495)
 * ----------------------------------------------------------------------------
 *  「人口100万人以上で、年間降水量500mm未満、海から200km以上、過去30日でM5以上の地震があった都市は？」
 *
 *  Of the four conditions in that question IntMap could already answer three from data it ships:
 *  population (GeoNames cities1000, data/gazetteer-world.json.gz), annual precipitation (CHELSA,
 *  data/precip-mm.png) and the earthquakes (USGS FDSN). 「海から200km以上」 it could not answer at
 *  all — there was no distance-to-the-sea anywhere in the program — so the whole query collapsed
 *  into prose about what would have to be checked.
 *
 *  ══ WHY A POLYLINE AND NOT A DISTANCE RASTER ═══════════════════════════════════════════════════
 *  The obvious shape is the one data/precip-mm.png has: a grid with a number in every cell. It is
 *  the wrong shape here, and measurably so. A distance field has |grad d| = 1 everywhere, so a grid
 *  quantises the ANSWER: at 0.1 degrees the value is only ever right to about +/-6 km, and making
 *  it right to +/-1 km costs 26 M cells. The coastline itself is the cheaper object — 「200km以上」
 *  is a question about the LINE, and point-to-SEGMENT distance against the line is exact for the
 *  segment it is measured against. Simplification error enters once, as the sagitta of a kept
 *  segment, and that is bounded by the Douglas-Peucker tolerance rather than by the distance.
 *
 *  ══ WHAT «THE SEA» MEANS HERE, AND WHY THE FILE HAS TWO LISTS ═════════════════════════════════
 *  Natural Earth 1:10m physical `coastline`. MEASURED against the built file: the Aral, Baikal,
 *  Ladoga, Victoria and the Great Lakes are NOT in it — but the CASPIAN IS, as twelve parts and 529
 *  vertices that lie wholly inside its basin and touch nothing else.
 *
 *  That single inclusion decides real answers. Tehran is 109 km from the Caspian and ~800 km from
 *  the Persian Gulf, so 「海から200km以上の都市」 either contains Tehran or does not depending on a
 *  definition nobody stated. Picking one silently is the failure this round exists to remove, so the
 *  file carries the two lists separately and the query engine exposes them as two columns:
 *    · `coords`   — the world OCEAN's edge            → column `coastKm`
 *    · `enclosed` — landlocked seas, labelled          → `seaKm` = min(coastKm, enclosed)
 *  A part counts as enclosed only when EVERY vertex is inside a declared basin box; a part that
 *  straddles one fails the build rather than being guessed at.
 *
 *  js/coast-line.js draws a different line for a different purpose (OpenMapTiles `water` polygons,
 *  lake shores included, at render time) and the two are deliberately not the same object.
 *
 *  ⚠ ANTARCTICA IS IN IT, and its «coast» is the ice front rather than rock. That is Natural
 *  Earth's own definition and the manifest says so rather than quietly dropping the continent.
 *
 *  ══ THE ENCODING ══════════════════════════════════════════════════════════════════════════════
 *  Each retained part is [lng0, lat0, dlng1, dlat1, ...] in units of 1e-3 degrees (~110 m), which is
 *  finer than the tolerance the geometry was simplified at, so the encoding never becomes the error.
 *  Deltas are small integers and gzip is very good at them.
 *
 *      node scripts/build-coastline.mjs           # rebuild data/coastline.json.gz
 *      node scripts/build-coastline.mjs --check   # re-derive and compare
 * ==========================================================================*/
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'coastline.json.gz');
const CACHE = join(ROOT, 'node_modules', '.cache', 'intmap-coastline.geojson');
const SRC = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_10m_coastline.geojson';

/* The tolerance is a MEASURED trade, not a taste: it is the largest error the simplification can
   introduce into an answer, and the file is proportional to how small it is made. 2 km against a
   200 km threshold is 1 %, and the query engine states it. */
const TOL_KM = 2;
const SCALE = 1000;                                  /* 1e-3 degree, ~110 m */

/* Landlocked seas that Natural Earth's coastline layer carries. The box is a CLASSIFIER, not a
   clip: a part is enclosed only if all of it is inside, and a part that is partly inside stops the
   build — that is the signal that the source changed and the box no longer describes it. */
const ENCLOSED = [
  { name: 'Caspian Sea', box: [46.0, 36.0, 56.0, 47.6] },
];

const rad = (d) => d * Math.PI / 180;

/* Perpendicular distance from p to the segment a->b, in km. Local flat-earth with the longitude
   axis scaled by cos(lat) — over a 2 km segment the spherical correction is below a metre, and
   every consumer of this file measures the same way (js/coastline.js). */
function segDistKm(px, py, ax, ay, bx, by) {
  const k = Math.cos(rad((ay + by) * 0.5)) * 111.319491;
  const m = 110.574;
  const dx = (bx - ax) * k, dy = (by - ay) * m;
  const ex = (px - ax) * k, ey = (py - ay) * m;
  const L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? (ex * dx + ey * dy) / L2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const qx = ex - t * dx, qy = ey - t * dy;
  return Math.sqrt(qx * qx + qy * qy);
}

/* Douglas-Peucker, iterative (a recursive one blows the stack on a 40,000-vertex ring). */
function simplify(pts, tolKm) {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const seg = stack.pop();
    const i0 = seg[0], i1 = seg[1];
    if (i1 - i0 < 2) continue;
    const a = pts[i0], b = pts[i1];
    let worst = -1, wi = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = segDistKm(pts[i][0], pts[i][1], a[0], a[1], b[0], b[1]);
      if (d > worst) { worst = d; wi = i; }
    }
    if (worst > tolKm && wi > 0) { keep[wi] = 1; stack.push([i0, wi], [wi, i1]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

async function source() {
  if (existsSync(CACHE)) return JSON.parse(readFileSync(CACHE, 'utf8'));
  const r = await fetch(SRC, { headers: { 'user-agent': 'IntMap/1.0 coastline-build' } });
  if (!r.ok) throw new Error('coastline: HTTP ' + r.status);
  const txt = await r.text();
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, txt);
  return JSON.parse(txt);
}

/* which declared basin a simplified part lies wholly inside — '' for the open ocean */
function classify(pts) {
  for (const e of ENCLOSED) {
    let inside = 0;
    for (const p of pts) {
      if (p[0] >= e.box[0] && p[0] <= e.box[2] && p[1] >= e.box[1] && p[1] <= e.box[3]) inside++;
    }
    if (inside === pts.length) return e.name;
    if (inside > 0) throw new Error('a coastline part straddles the ' + e.name + ' box (' + inside
      + ' of ' + pts.length + ' vertices) — the basin box no longer describes the source');
  }
  return '';
}

function build(gj) {
  const ocean = [], enclosed = [], enclosedBy = [];
  let rawV = 0;
  for (const f of (gj.features || [])) {
    const g = f && f.geometry; if (!g) continue;
    const lines = g.type === 'LineString' ? [g.coordinates]
      : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const line of lines) {
      const pts = line.filter((p) => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]));
      if (pts.length < 2) continue;
      rawV += pts.length;
      const s = simplify(pts, TOL_KM);
      if (s.length < 2) continue;
      /* quantise, then drop the vertices quantisation made duplicate */
      const q = [];
      for (const p of s) {
        const x = Math.round(p[0] * SCALE), y = Math.round(p[1] * SCALE);
        const last = q[q.length - 1];
        if (!last || last[0] !== x || last[1] !== y) q.push([x, y]);
      }
      if (q.length < 2) continue;
      const basin = classify(q.map((p) => [p[0] / SCALE, p[1] / SCALE]));
      const enc = [q[0][0], q[0][1]];
      for (let i = 1; i < q.length; i++) enc.push(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
      if (basin) { enclosed.push(enc); enclosedBy.push(basin); } else ocean.push(enc);
    }
  }
  /* longest part first, then by position: a deterministic order is what makes --check a comparison
     of files rather than a comparison of sets */
  const order = (a, b) => (b.length - a.length) || (a[0] - b[0]) || (a[1] - b[1]);
  ocean.sort(order);
  const encIdx = enclosed.map((p, i) => i).sort((i, j) => order(enclosed[i], enclosed[j]));
  const encParts = encIdx.map((i) => enclosed[i]);
  const encNames = encIdx.map((i) => enclosedBy[i]);
  const count = (a) => a.reduce((n, p) => n + (p.length >> 1), 0);
  return {
    v: 1,
    source: 'Natural Earth 1:10m physical — coastline (public domain)',
    url: SRC,
    means: '`coords` is the world OCEAN edge; `enclosed` is the landlocked seas the same layer carries, named in `enclosedNames`. Lake shores (Aral, Baikal, Ladoga, Victoria, the Great Lakes) are in neither; Antarctica is in `coords`, as its ice front.',
    scale: SCALE,
    toleranceKm: TOL_KM,
    encoding: 'parts[i] = [lng0, lat0, dlng1, dlat1, ...] in units of 1/scale degrees',
    rawVertices: rawV,
    vertices: count(ocean),
    parts: ocean.length,
    enclosedVertices: count(encParts),
    enclosedParts: encParts.length,
    enclosedNames: encNames,
    coords: ocean,
    enclosed: encParts,
  };
}

const gj = await source();
const doc = build(gj);

if (process.argv.includes('--check')) {
  if (!existsSync(OUT)) { console.error('data/coastline.json.gz is missing — run node scripts/build-coastline.mjs'); process.exit(1); }
  const have = JSON.parse(gunzipSync(readFileSync(OUT)).toString('utf8'));
  if (JSON.stringify(have) !== JSON.stringify(doc)) {
    console.error('data/coastline.json.gz differs from what scripts/build-coastline.mjs derives — rebuild it');
    process.exit(1);
  }
  console.log('coastline ok — ' + doc.parts + ' ocean parts, ' + doc.vertices + ' vertices; '
    + doc.enclosedParts + ' enclosed-sea parts');
  process.exit(0);
}

const buf = gzipSync(Buffer.from(JSON.stringify(doc)), { level: 9 });
mkdirSync(join(ROOT, 'data'), { recursive: true });
writeFileSync(OUT, buf);
console.log('wrote data/coastline.json.gz — ' + (buf.length / 1024).toFixed(1) + ' KB · '
  + doc.parts + ' ocean parts / ' + doc.vertices + ' vertices (from ' + doc.rawVertices + ') · '
  + doc.enclosedParts + ' enclosed parts / ' + doc.enclosedVertices + ' vertices ['
  + Array.from(new Set(doc.enclosedNames)).join(', ') + '] · tolerance ' + TOL_KM + ' km');
