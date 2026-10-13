/* ============================================================================
 *  scripts/cshapes/cuts.mjs — a PART of one outline, moved to another owner for a span   (cshapes-review-cuts)
 * ----------------------------------------------------------------------------
 *  scripts/cshapes/review.json could move only WHOLE polygons (`ground`: a polygon moves when every vertex of its
 *  outer ring lies inside `within`, and a polygon partly inside fails the build). So it could not say «this region
 *  of that country belonged to someone else» — and every finding of that shape stayed on the map: Bukovina drawn in
 *  Hungary in 1919, the Klaipėda (Memel) Territory in Russia in 1913, Istria in Yugoslavia in 1930, Uzhhorod in
 *  Czechoslovakia in 1940, the Hlučín Region in Austria-Hungary in 1913, Danzig in Germany a year early, and the
 *  southern Sakhalin border 11 km south of the fiftieth parallel (versailles-1919 in the ledger's `examined` already
 *  said so: «the Danzig and West Prussia days need the rows split by region, which this ledger cannot express»).
 *
 *  ⚠ A CUT IS A VERDICT WITH A LINE, NEVER A BRANCH. Each `cuts` entry states WHAT moves (`from` → `to`), WHEN (`s`..`e`),
 *  BY WHICH LINE (`region`, a boundary the ledger derives from a cited record — never a line drawn by hand), and WHY
 *  (`history`, `sources`). This file applies any such entry the same way; it holds no place name, no date, no code.
 *
 *  THE LINES, AND WHERE THEY COME FROM (`regions` in review.json → the photograph scripts/cshapes/regions.json):
 *    · {cshapes:{gw,on}}  the outline CShapes 2.0 itself gives a code on a day (from the upstream file, at the bundle's
 *                         own precision) — its lines ARE the bundle's lines, so the cut adds no new line at all;
 *    · {ohm:id}           an OpenHistoricalMap relation (CC0 1.0, a source IntMap already ships), pinned by version;
 *    · {line:[...]}       a polygon whose only land-crossing edge is a line an instrument states in coordinates
 *                         (the fiftieth parallel of the Treaty of Portsmouth) — the same evidence `within` rests on;
 *    · {minus|and|or:[…]} set operations on those, so «what Czechoslovakia gained on 4 February 1920» is the
 *                         difference of two dated records, not a hand-traced outline.
 *  `--regions` (network) derives every region and writes the photograph; `--review` and `--check` read only it.
 *
 *  ⚠⚠ WHERE THE LINE IS ANOTHER RECORD'S, THE TWO RECORDS DISAGREE BY A SLIVER, AND THE SLIVER MUST NOT STAY BEHIND.
 *  MEASURED 2026-10-13: cutting CShapes' Lithuania (1939) with OpenHistoricalMap's Memelland leaves six strips of
 *  Lithuania between OHM's Neman and CShapes' Neman — 8.0, 24.5, 1.2, 0.4, 0.3, 0.3 km², up to 0.93 km wide — the same
 *  river, digitised twice. So for a region whose lines are another record's (`lines: 'ohm'`), the source keeps only the
 *  parts of each cut polygon that hold one of the places the cut names in `keeps` (the rest of the country); every
 *  other part the line separated goes with the moved land. A polygon the line touches that holds no such place and
 *  would keep MORE land than it gives is not a sliver — that throws, and the ledger has to say what it means.
 *  Where the lines are the bundle's own (`cshapes`, `line`), nothing is a sliver of disagreement, so every part the
 *  line separated stays (Germany 1938 less Danzig leaves East Prussia and a piece of the Vistula Spit, both German).
 *
 *  THE ONE FLOOR IS THE BUNDLE'S OWN: a piece or a part smaller than `minArea` — scripts/build-cshapes.mjs MIN_AREA,
 *  the ring the build itself drops — is the rounding of two lines that coincide, not land, on both sides of the cut.
 * ==========================================================================*/
import { createRequire } from 'node:module';
/* the clipping library is loaded on first use, not when this file is imported: scripts/build-cshapes.mjs (which imports
   this file) is imported for its VALUES (LICENCE, CITATION) and copied with its relative imports into a bare root by
   tests/history-cshapes-gate-checks.test.mjs, where no package can be resolved — a ledger with no cuts needs no clipping */
let PC = null;
const pc = new Proxy({}, { get: (_, k) => { if (!PC) PC = createRequire(import.meta.url)('polygon-clipping'); return PC[k]; } });

export const DECIMALS = 5;   /* the refined rows' precision (scripts/build-cshapes.mjs cutCShapesRing default) */
const K = 10 ** DECIMALS;
const r5 = (v) => Math.round(v * K) / K;

/* planar shoelace, deg² — the unit of MIN_AREA */
export const ringArea = (r) => { let s = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
export const polyArea = (poly) => poly.reduce((a, r, k) => a + (k ? -1 : 1) * Math.abs(ringArea(r)), 0);
export const mpArea = (mp) => mp.reduce((a, p) => a + polyArea(p), 0);
export const inRing = (ring, x, y) => { let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; }
  return c; };
export const inPoly = (poly, x, y) => inRing(poly[0], x, y) && !poly.slice(1).some((h) => inRing(h, x, y));
export const bboxOf = (mp) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of mp) for (const [x, y] of p[0]) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
  return [a, b, c, d]; };
const meets = (A, B) => A[0] <= B[2] && B[0] <= A[2] && A[1] <= B[3] && B[1] <= A[3];

/** a closed ring at the bundle's precision, or null when rounding leaves no ring */
export function roundRing(r) {
  const out = [];
  for (const p of r) { const q = [r5(p[0]), r5(p[1])], l = out[out.length - 1]; if (!l || l[0] !== q[0] || l[1] !== q[1]) out.push(q); }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0].slice());
  return out.length >= 4 && ringArea(out) !== 0 ? out : null;
}
/** a MultiPolygon at the bundle's precision, parts under `minArea` dropped (see the header) */
export function roundMP(mp, minArea) {
  const out = [];
  for (const poly of mp) {
    const shell = roundRing(poly[0]); if (!shell) continue;
    const p = [shell, ...poly.slice(1).map(roundRing).filter((h) => h && Math.abs(ringArea(h)) >= minArea)];
    if (polyArea(p) >= minArea) out.push(p);
  }
  return out;
}

/* ── the regions ─────────────────────────────────────────────────────────────*/
/** `lines` of an expression: 'ohm' when any line is another record's, else the bundle's own or an instrument's */
export function linesOf(expr) {
  if (expr.ohm != null) return 'ohm';
  if (expr.cshapes) return 'cshapes';
  if (expr.line) return 'treaty';
  const kids = expr.minus || expr.and || expr.or || [];
  const ls = kids.map(linesOf);
  return ls.includes('ohm') ? 'ohm' : ls.includes('treaty') ? 'treaty' : 'cshapes';
}
/** derive one region: `leaf(expr)` answers {ohm}/{cshapes}/{line} leaves with { mp, source } (the caller fetches) */
export async function deriveRegion(spec, leaf, minArea) {
  const sources = [];
  const ev = async (x) => {
    if (x.minus) { const [a, ...b] = await Promise.all(x.minus.map(ev)); return b.reduce((acc, m) => pc.difference(acc, m), a); }
    if (x.and) { const [a, ...b] = await Promise.all(x.and.map(ev)); return b.reduce((acc, m) => pc.intersection(acc, m), a); }
    if (x.or) { const all = await Promise.all(x.or.map(ev)); return pc.union(...all); }
    const r = await leaf(x); if (r.source) sources.push(r.source); return r.mp;
  };
  let mp = await ev(spec.of);
  if (spec.containing) mp = mp.filter((p) => spec.containing.some(([x, y]) => inPoly(p, x, y)));
  const geometry = roundMP(mp, minArea);
  if (!geometry.length) throw new Error('region ' + spec.id + ' derives to nothing');
  if (spec.containing) for (const [x, y] of spec.containing) if (!geometry.some((p) => inPoly(p, x, y))) throw new Error(`region ${spec.id} does not hold ${x},${y}, which it names`);
  return { of: spec.of, ...(spec.containing ? { containing: spec.containing } : {}), lines: linesOf(spec.of), sources, geometry };
}
const canon = (x) => JSON.stringify(x);
/** the photograph's problems against the ledger (a region the ledger names that the photograph lacks or derived from another expression) */
export function regionProblems(review, photo) {
  const out = [];
  const want = review.regions || {}, have = (photo && photo.regions) || {};
  for (const [id, spec] of Object.entries(want)) {
    const h = have[id];
    if (!h) { out.push(`region ${id} is in scripts/cshapes/review.json and not in the photograph scripts/cshapes/regions.json — node scripts/build-cshapes.mjs --regions`); continue; }
    if (canon(h.of) !== canon(spec.of) || canon(h.containing || null) !== canon(spec.containing || null)) out.push(`region ${id}: the photograph was derived from another expression than the ledger states — node scripts/build-cshapes.mjs --regions`);
    if (!(typeof spec.is === 'string' && spec.is.length > 40)) out.push(`region ${id} does not say what line it is (\`is\`)`);
    if (h.lines === 'ohm' && !(h.sources || []).every((s) => s.ohm && s.version && s.timestamp)) out.push(`region ${id}: an OpenHistoricalMap relation it rests on is not pinned to a version`);
    if (!Array.isArray(h.geometry) || !h.geometry.length) out.push(`region ${id} has no geometry`);
  }
  for (const id of Object.keys(have)) if (!want[id]) out.push(`the photograph holds region ${id}, which the ledger no longer names — node scripts/build-cshapes.mjs --regions`);
  for (const c of review.cuts || []) if (!want[c.region]) out.push(`cut ${c.id} names region ${c.region}, which the ledger does not define`);
  return out;
}

/* ── one polygon, cut ───────────────────────────────────────────────────────*/
/**
 * Cut one source polygon `P` (rings of coordinates) by region `R` (MultiPolygon, its bbox `rb`).
 * Returns null when the region does not take land from it, else { piece: MultiPolygon, rest: MultiPolygon, fragments }.
 * `lines`/`keeps`: see the header — fragments are judged only where the region's lines are another record's.
 */
export function cutPolygon(P, R, rb, { lines, keeps, minArea, label }) {
  if (!meets(bboxOf([P]), rb)) return null;
  /* the region takes land from P only where a part of P inside it reaches the floor; a smaller part inside it is the
     two lines' crumb and stays with P — so a polygon already cut is not cut again (the ledger is idempotent) */
  const inside = pc.intersection([P], R);
  const took = inside.filter((p) => polyArea(p) >= minArea), kept = inside.filter((p) => polyArea(p) < minArea);
  if (!took.length) return null;
  const all = pc.difference([P], R);
  /* …and a part outside it under the floor is the cut line's crumb on the other side: it goes with the piece rather
     than being dropped (MEASURED on the first run: dropping crumbs left 1-4 km² of each cut drawn by nobody) */
  const parts = all.filter((p) => polyArea(p) >= minArea), crumbs = all.filter((p) => polyArea(p) < minArea);
  let rest = parts, fragments = [];
  if (lines === 'ohm') {
    const holds = (p) => (keeps || []).some(([x, y]) => inPoly(p, x, y));
    rest = parts.filter(holds); fragments = parts.filter((p) => !holds(p));
    if (!rest.length && mpArea(fragments) > mpArea(took)) throw new Error(`${label}: the region takes ${mpArea(took).toFixed(4)} deg² of a polygon that holds none of the places in \`keeps\` and would hand over the ${mpArea(fragments).toFixed(4)} deg² it keeps — say which land stays`);
  }
  const piece = pc.union(took, ...[...fragments, ...crumbs].map((f) => [f]));
  if (kept.length) rest = pc.union(rest, ...kept.map((f) => [f]));
  return { piece, rest, fragments: fragments.map(polyArea) };
}

/** the pieces of several polygons as one MultiPolygon (adjacent pieces become one polygon) */
export const unionAll = (mps) => (mps.length ? pc.union(...mps) : []);

/** union `piece` into the polygons of a row that it meets. Returns null when the row already holds it, else
    { hit: the indices (into `polys`) of the polygons it replaces, merged: what replaces them } */
export function receive(polys, piece, minArea) {
  const pb = bboxOf(piece);
  const hit = [];
  polys.forEach((p, i) => { if (meets(bboxOf([p]), pb)) hit.push(i); });
  const held = hit.map((i) => [polys[i]]);
  /* already held (the Free City of Danzig's own outline receiving itself): nothing to draw twice */
  if (held.length && mpArea(pc.difference(piece, ...held)) < minArea) return null;
  return { hit, merged: held.length ? pc.union(piece, ...held) : piece };
}
