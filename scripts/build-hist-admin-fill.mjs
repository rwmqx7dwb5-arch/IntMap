#!/usr/bin/env node
/* ============================================================================
 *  build-hist-admin-fill.mjs — data/hist-admin-fill.js  (#R719)
 * ----------------------------------------------------------------------------
 *  THE FIRST-LEVEL SUBDIVISIONS THAT STILL STAND TODAY, CARRIED BACK ONLY AS FAR AS THREE
 *  RECORDS AGREE THEY MAY GO — the second gap record beside data/hist-kuni.js.
 *
 *  ── WHAT THIS ROUND MEASURED, AND WHY THIS FILE EXISTS ────────────────────────────────────
 *  「地方区分のcoverageが一部だけだったりする」「ある国家でも、一部にあっても全体にはなかったりする」
 *  Both halves were measured on the shipped bundles, 2026-09-15, by sampling every country's land
 *  on a 0.25° grid at a date and asking whether an in-force first-level unit covers the cell:
 *
 *      year   land of the world with a first-level unit drawn   countries 0%   partial   complete
 *      1900                       46.8%                              68           38        37
 *      1950                       67.0%                              73           37        51
 *      2000                       52.8%                              98           28        41
 *
 *  and the partial ones are not obscure: France 2%, Turkey 6%, Indonesia 10%, Colombia 11%,
 *  Argentina 13%, China 22%, Russia 37%, India 42%, Egypt 50%. A reader who travels to 1900 and
 *  sees three provinces in France is not being told that the record is thin; they are being shown
 *  a France with three provinces.
 *
 *  ⚠ THE GAP IS UPSTREAM'S, AND THAT WAS ESTABLISHED BEFORE ANYTHING WAS BUILT. Asked of
 *  OpenHistoricalMap's own Overpass on 2026-09-15: at admin_level 3-6 it holds 27,674 relations and
 *  data/hist-admin{1,2}.js ship 27,547 of them (99.5%) — the build is not the filter. Widening the
 *  query does not help either: admin_level 7 adds 2,097 (shipped this round as data/hist-admin3.js)
 *  and 8 adds 23,922, and taking BOTH leaves 42 countries with no administrative relation at any
 *  level — Kenya, Iran, Nigeria, Myanmar, Nepal, Sudan, Tanzania, Uganda, Zimbabwe, Zambia, Malawi,
 *  Madagascar, the two Congos, Botswana, Lesotho, Eswatini, New Zealand, Malta, Norway, Qatar, …
 *  Nothing else on the open web is a dated global admin-1 series; scripts/build-hist-admin1.mjs
 *  holds the eight candidates #R530 measured and why each is not one.
 *
 *  ── SO WHAT IS DRAWN, AND WHAT IS THE CLAIM ───────────────────────────────────────────────
 *  A unit here is TODAY'S outline of a unit that STILL EXISTS, drawn only over the span on which
 *  three independent records agree it may be drawn. The claim is deliberately weaker than
 *  data/hist-admin1.js's: that record says «this is the boundary that was surveyed then», this one
 *  says «a unit by this name governed this ground then, and this is its outline now». js/time-admin1.js
 *  marks these rows `_gap`, draws them in the derived line's own style, and `note()` says so.
 *
 *  ⚠ WITHOUT THE FIVE TESTS BELOW THIS FILE WOULD BE THE DEFECT #R530 EXISTS TO REMOVE — a
 *  present-day province painted under a historical date. Each test is the answer to one way that
 *  would be false, and a unit that fails any of them is not drawn at that date at all:
 *
 *   1. TEMPORAL — Wikidata must STATE when the unit began (P571), and the unit is never drawn
 *      before that instant, nor after a stated dissolution (P576). An undated unit is not
 *      carried back by a year. Measured: 1,837 of the 4,515 shipped Natural Earth units resolve
 *      through their ISO 3166-2 code (P300) to an item that states an inception.
 *      ⚠ The join is an IDENTIFIER, not a spelling: ISO 3166-2 is a code both sides publish.
 *
 *   2. THE COUNTRY'S OWN FLOOR — a subdivision cannot predate the country it subdivides, so the
 *      unit is never drawn before the inception Wikidata states for the COUNTRY (P571 on the item
 *      carrying its ISO 3166-1 alpha-3). A country that states none is not admitted at all.
 *      ⚠ MEASURED, AND IT IS THE TEST THAT DECIDED THIS FILE'S SHAPE: without it, test 4 below is
 *      satisfied by a Ukrainian oblast in the year 1000 (the ground was wholly inside Kievan Rus')
 *      and by Երևան in 782 BC (its ISO code belongs to the CITY item, whose stated inception is
 *      the city's founding). Both would have been drawn. Both are nonsense.
 *
 *   3. WHOLE-COUNTRY — a country is drawn on the dates where EVERY ONE of its units may be drawn,
 *      and on no others; the surviving intervals are intersected across the country's units and a
 *      country whose intersection is empty ships nothing. This is the user's own second sentence
 *      made into a rule. ⚠ IT BINDS THE OUTPUT, NOT THE ADMISSION: the first build applied it to
 *      «every unit of this country is dated» and then let tests 4 and 5 silence units one at a
 *      time, and its own `--check` caught what that produces — ARM 7/11, CAN 3/13, ECU 2/24,
 *      UKR 17/25, USA 24/51, a record answering PART of a country. (France 95/101, Russia 85/86,
 *      Mexico 31/33, Colombia 33/34 and Morocco 15/16 are excluded by the dating half.)
 *
 *   4. GEOGRAPHIC — the ground under the unit must have lain inside ONE polity on that date,
 *      according to the era record IntMap already draws (data/cshapes.js 1886-2019,
 *      data/hist-borders.js 1689-1885, data/hist-eras.js below that). A unit that straddles two
 *      countries of its era is a unit whose modern outline contradicts that era, and it is
 *      withheld for exactly the span on which it straddles.
 *
 *   5. NO SECOND CLAIM ON ONE PIECE OF GROUND — where data/hist-admin{1,2,3}.js already hold an
 *      in-force unit over this ground, the record speaks and the fill is silent for that span.
 *      Overlap is measured on the fill unit's own sample points, so the test is about ground and
 *      not about names.
 *
 *  THE SPANS ARE EXACT, NOT SAMPLED. Between two consecutive dates on which something relevant
 *  changes — the inception, a dissolution, the start or end of an era polity whose box meets this
 *  unit, the start or end of an overlapping record unit — nothing about tests 4 and 5 can change.
 *  So the tests are evaluated once per interval between those breakpoints, and a unit is emitted
 *  as one row per surviving interval. No year is guessed at and none is skipped.
 *
 *  ── WHERE THE GEOMETRY COMES FROM: THE COPY ALREADY IN THE TREE ───────────────────────────
 *  data/admin1-world.json.gz (#R290) is Natural Earth 10m admin-1, simplified once at 0.01° with
 *  four decimals, and it is already shipped for the warning layer. A second download of the same
 *  survey would be a second answer to «what shape is this province» in the same repository, which
 *  .agents/rules/no-ad-hoc-hardcoding.md §2-3 forbids. It is read, not re-fetched.
 *
 *  Source & licence: Natural Earth (public domain) for the outlines and the ISO 3166-2 codes;
 *  Wikidata (CC0) for the dates and the names. Both are declared in sources.html /
 *  js/reference-data.js, like every other bundled set.
 *
 *  Output: the gap-bundle shape data/hist-kuni.js established, which js/time-admin1.js splices into
 *  the first tier:
 *      window.__HISTADMFILL = { v, src, built, tolerance, levels, rings:[ring…], feats:[feat…] }
 *      feat = [ name, lvl, sy,sm,sd, ey,em,ed, [[ringIdx…]…], names, iso3166-2, iso3 ]
 *  ⚠ THE LAST TWO COLUMNS ARE THE IDENTIFIER THE ROW WAS ADMITTED BY, and they are there because
 *  `--check` has to re-derive the whole-country rule. The first build carried only the NAME, and
 *  Natural Earth's names are not unique across countries — the check joined «Zambezi» in an
 *  admitted country to Zambia's and read a country nobody answers for as partly answered. The
 *  splice in js/time-admin1.js reads columns 0-9 by position, so the extra pair costs it nothing.
 *  Dates use the same exclusive end as the tiers.
 *
 *  Usage:  node scripts/build-hist-admin-fill.mjs --check     # verify the COMMITTED bundle, offline
 *          node scripts/build-hist-admin-fill.mjs [--out data/hist-admin-fill.js] [--grid 0.1]
 *          node scripts/build-hist-admin-fill.mjs --only <ISO3> --diagnose   # why one country's units were kept or withheld
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { registry, shipTags, harvestTags } from './histadmin/langs.mjs';
import { labelsFor, labelsByTag } from './histadmin/wikidata.mjs';
import { WIKIDATA } from './lib/upstream-cadence.mjs';
import { scan as latticeScan } from '../js/hist-knowledge.js';
import { withheldFile } from './histrecon/withheld-file.mjs';
import { HIST_ADMIN_GAPS } from '../js/border-coast.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(ROOT, argOf('--out', 'data/hist-admin-fill.js'));
const GLOBAL = '__HISTADMFILL';
const WDQS = 'https://query.wikidata.org/sparql';

/* ⚠ (upstream-liveness) 出自は値である。読むのは js/data-governance.js の read() と
   npm run check:datagov（scripts/data-governance.mjs）。この宣言は少なくとも「どの bundle を書くか」と
   「上流がどの周期で新しいものを出すか」（cadence と、その根拠 cadenceBasis）を述べる。
   ⚠ ここに無い facet は「述べていない」であって「無い」ではない——data/governance-ledger.json が数える。 */
export const GOVERNANCE = {
  'data/hist-admin-fill.js': {
    /* the carried-back units' dates and names are Wikidata's; that is the material that moves */
    publisher: 'Wikidata',
    url: WDQS,
    ...WIKIDATA,
    builtBy: 'scripts/build-hist-admin-fill.mjs',
  },
};
const UA = 'IntMap/build-hist-admin-fill (+https://github.com/rwmqx7dwb5-arch/IntMap)';
const LICENCE = 'Derived: Natural Earth 10m admin-1 (public domain) via data/admin1-world.json.gz · dates and names from Wikidata (CC0) · assembled by scripts/build-hist-admin-fill.mjs';

/* ⚠ (#R719) THE SAMPLE STEP IS THE ONE NUMBER THIS FILE CHOOSES, AND IT IS PRICED AGAINST THE
   SMALLEST THING IT HAS TO SEE. Tests 3 and 4 ask «is this ground inside that polygon», and they
   ask it of points laid on a grid inside the unit. Measured on the shipped Natural Earth set
   (2026-09-15, 4,515 units): the median unit's greater extent is 1.029°, the 25th percentile
   0.410° and the 5th 0.077°; 327 units (7.2%) are smaller than 0.1° across. So a 0.1° grid puts at
   least one point inside the great majority of units outright, and `samplePoints` falls back to
   the unit's OWN VERTICES for the rest — no unit is ever tested on an empty sample, which would
   read as a pass. It expires the day the shipped outline set changes its simplification. */
export const GRID = parseFloat(argOf('--grid', '0.1'));
/* ⚠ (#R719) AND THESE TWO SHARES ARE MEASURED, NOT PREFERRED — see `--check`'s printout, which
   re-derives both from the shipped bundle. The era outlines are 19.4 pts/deg where the unit
   outlines are 100, so a coastal unit always has sample points the era polygon puts in the sea;
   requiring «every point inside» would withhold every island nation. STRADDLE_MAX is the share of
   the unit's LOCATED points that may sit in a polity other than its main one, and LOCATED_MIN is
   how much of the unit the era record has to place at all before it is allowed to answer. */
/* ⚠ (#R719) 0.20 IS MEASURED AGAINST THE MISMATCH IN RESOLUTION, not chosen for comfort. The era
   outlines are 19.4 points per degree and the unit outlines are ~100, so a unit that lies wholly
   inside its country still puts sample points outside the coarse polygon of it. Measured on
   Armenia's eleven marzer at 1995-2019 (`--only ARM --diagnose`), every one of which is wholly
   inside Armenia: the share of LOCATED points falling in a neighbour reads 0, 0, 0, 0, 2, 3, 4, 5,
   7, 7 and 8 %. A unit genuinely split between two states is a different order of magnitude — half
   its ground is in the other one. 20 % sits above the artefact and far below the defect. */
export const STRADDLE_MAX = 0.20;
export const LOCATED_MIN = 0.60;
/* ⚠ overlap is the OTHER direction: a record unit that covers a quarter of this ground is already
   answering for it, and two lines over one province is the thing #R530 removed. */
export const OVERLAP_MIN = 0.25;
export const MAX_SAMPLE = 240;
/* diagnosis: build one country and print why each of its units was kept or withheld */
const ONLY = argOf('--only', null);
const DIAG = args.includes('--diagnose');

/* ══ ⚠⚠ (#R730) NATURAL EARTH'S OWN PLACEHOLDER IS STILL AN IDENTIFIER ═══════════════════════
   #R719 made every row carry ISO 3166-2 so the whole-country rule is re-derived by identifier and
   never by name. Measured 2026-09-15, 161 of Natural Earth's units have no ISO code and carry the
   dataset's own `XX-Ynn~` placeholder instead — Şuşa `AZ-X01~`, Gbarpolu `LR-X1~`, the Region of
   Republican Subordination `TJ-X01~`. They were extracted as `null`, shipped as `null`, and the
   gate then read Azerbaijan as 77 of 78 and refused three countries it had just built.
   ⇒ the tilde form is accepted AS AN IDENTIFIER (it is stable inside the outline set, and the `~`
   says on its face that it is not an ISO code — the Wikidata join keys on the ISO form and simply
   never matches these, which is correct: nobody dated them).
   ⚠ A unit with NO code at all is a different case and stays refused: 10 units carry neither, and
   a country holding one cannot have «answered whole» re-derived for it. */
const ISO2 = /^[A-Z]{2}-[A-Z0-9]{1,3}~?$/;
const ISO2_STRICT = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;

/* ── plumbing ───────────────────────────────────────────────────────────────────────────── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* (hist-fidelity-sweep) INTMAP_HISTFILL_CACHE moves the cache — a worktree's node_modules is a junction
   into the master copy, and a build run there would otherwise write its cache into the original. */
function cacheDir() { const d = process.env.INTMAP_HISTFILL_CACHE || path.join(ROOT, 'node_modules', '.cache', 'intmap-histfill'); fs.mkdirSync(d, { recursive: true }); return d; }

async function sparql(query, key) {
  const f = path.join(cacheDir(), key + '.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  let last = null;
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(WDQS + '?query=' + encodeURIComponent(query) + '&format=json',
        { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
      if (r.status === 429 || r.status >= 500) { await sleep(4000 * (i + 1)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = JSON.parse(await r.text());
      const rows = j.results.bindings;
      fs.writeFileSync(f, JSON.stringify(rows));
      return rows;
    } catch (e) { last = e; await sleep(4000 * (i + 1)); }
  }
  throw last || new Error('WDQS exhausted');
}

function loadBundle(rel) {
  const w = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { window: w });
  const g = Object.keys(w)[0];
  return { global: g, data: w[g] };
}

/* ── geometry ───────────────────────────────────────────────────────────────────────────── */
function bbox(ring) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of ring) { if (p[0] < a) a = p[0]; if (p[0] > c) c = p[0]; if (p[1] < b) b = p[1]; if (p[1] > d) d = p[1]; }
  return [a, b, c, d];
}
function inRing(r, x, y) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
/* a multipolygon hit: outer rings add, the rings after the first of a polygon take away (holes). */
function inPolys(polys, x, y) {
  for (const poly of polys) {
    if (!inRing(poly[0], x, y)) continue;
    let hole = false;
    for (let i = 1; i < poly.length; i++) if (inRing(poly[i], x, y)) { hole = true; break; }
    if (!hole) return true;
  }
  return false;
}
/* (hist-fill-never-whole) how far (degrees) a point lies from a polygon's edge, or Infinity beyond `tol` —
   every ring is asked, holes included, and a ring whose box is farther than `tol` is not walked */
const ringBox = new WeakMap();
export function edgeDistance(polys, x, y, tol) {
  let best = Infinity;
  for (const poly of polys) for (const r of poly) {
    let b = ringBox.get(r); if (!b) { b = bbox(r); ringBox.set(r, b); }
    if (x < b[0] - tol || x > b[2] + tol || y < b[1] - tol || y > b[3] + tol) continue;
    for (let k = 1; k < r.length; k++) {
      const ax = r[k - 1][0], ay = r[k - 1][1], dx = r[k][0] - ax, dy = r[k][1] - ay;
      const L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
      const d = Math.hypot(ax + t * dx - x, ay + t * dy - y);
      if (d < best) best = d;
    }
  }
  return best <= tol ? best : Infinity;
}
/* the points test 3 and test 4 are asked of. A grid inside the unit, falling back to the unit's
   own vertices when the unit is smaller than the grid — an empty sample must never read as a pass. */
export function samplePoints(polys) {
  const rings = polys.map((p) => p[0]);
  let [mnx, mny, mxx, mxy] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings) { const b = bbox(r); mnx = Math.min(mnx, b[0]); mny = Math.min(mny, b[1]); mxx = Math.max(mxx, b[2]); mxy = Math.max(mxy, b[3]); }
  let out = [];
  /* (hist-coverage) each lattice point carries its cell (i, j) on the unit's own lattice, so a polygon can
     be asked about ALL of them in one scanline pass (`hitMask`) instead of one ray cast per point */
  let i = 0;
  for (let x = mnx + GRID / 2; x <= mxx; x += GRID, i++) { let j = 0; for (let y = mny + GRID / 2; y <= mxy; y += GRID, j++) if (inPolys(polys, x, y)) out.push([x, y, i, j]); }
  let ny = 0; for (let y = mny + GRID / 2; y <= mxy; y += GRID) ny++;
  const win = { x0: mnx, y0: mny, res: GRID, NX: Math.max(1, i), NY: Math.max(1, ny) };
  if (!out.length) { for (const r of rings) for (const p of r) out.push([p[0], p[1], -1, -1]); out.vertex = true; }
  /* ⚠ (#R719) AND THE SAMPLE IS CAPPED, BECAUSE THE TESTS ARE SHARES AND NOT AREAS. Russia's
     units put tens of thousands of cells on a 0.1° grid, and every one of them is then asked of
     every era polygon that meets the box; the first build of this file did not come back. What
     tests 3 and 4 read off the sample is a PROPORTION (5% straddling, 60% located, 25% overlapped),
     and a 240-point stride estimates each of those to within a few points either way while making
     the run finite. The stride is even over the grid, so it does not favour one end of a unit. */
  const vertex = !!out.vertex;
  if (out.length > MAX_SAMPLE) {
    const step = out.length / MAX_SAMPLE, cut = [];
    for (let i = 0; i < MAX_SAMPLE; i++) cut.push(out[Math.floor(i * step)]);
    out = cut;
  }
  out.win = win;
  if (vertex) out.vertex = true;
  return out;
}
/* ══ (hist-coverage) WHICH SAMPLE POINTS A POLYGON HOLDS — ONE SCANLINE PASS, NOT A RAY PER POINT ═════
   Tests 3 and 4 ask every era polity and every record unit that meets a fill unit's box «which of my
   points do you hold». Asked one ray cast per point, a full build took longer than two hours (measured
   2026-10-03: 15 of 71 countries in 30 minutes; one 11-unit country, Armenia, spent 31 s inside
   `inRing`), because the deep-time era sheets are world-spanning rings. The points sit on the unit's own
   lattice, so the polygon is scanned ONCE on that lattice (js/hist-knowledge.js `scan`, the rule the
   coverage gate measures with) and each point reads its cell. A vertex-fallback point (a unit thinner
   than the lattice) has no cell and is still asked by ray cast. The crossing rule is the same even-odd
   rule `inRing` applies, evaluated at the same cell centres. */
/* the sample points of one lattice, by row: only the rows a polygon crosses are looked at, and only the
   points on them — never the whole window (Nunavut's is 180,000 cells, asked of thousands of records) */
function rowsOf(pts) {
  if (pts.rows) return pts.rows;
  const m = new Map();
  for (let k = 0; k < pts.length; k++) { const q = pts[k]; if (q[2] < 0) continue; if (!m.has(q[3])) m.set(q[3], []); m.get(q[3]).push(k); }
  return (pts.rows = m);
}
export function hitMask(polys, pts) {
  const out = new Uint8Array(pts.length), W = pts.win;
  if (!W) { for (let k = 0; k < pts.length; k++) if (inPolys(polys, pts[k][0], pts[k][1])) out[k] = 1; return out; }
  const rows = rowsOf(pts);
  for (const p of polys) latticeScan(W, p, (j, i0, i1) => {
    const ks = rows.get(j); if (!ks) return;
    for (const k of ks) { const i = pts[k][2]; if (i >= i0 && i <= i1) out[k] = 1; }
  });
  for (let k = 0; k < pts.length; k++) if (pts[k][2] < 0 && inPolys(polys, pts[k][0], pts[k][1])) out[k] = 1;
  return out;
}

/* ── the era record, asked for «which polity was this ground in on this date» ───────────────
   The three records are the SAME three js/time-borders.js draws, and each answers for its own
   band. The bands are read off the records themselves — hist-borders publishes `window`, cshapes'
   reach is the span of its own rows, hist-eras is a list of sheets with the year each opens — so
   none of the three boundaries is typed here. */
const ymd = (y, m, d) => y * 10000 + m * 100 + d;

export function eraIndex() {
  const cs = loadBundle('data/cshapes.js').data;
  const hb = loadBundle('data/hist-borders.js').data;
  /* ══ ⚠⚠⚠ (hist-coverage-depth) THE ERA RECORD IS THE ONE THE READER SEES, NOT THE BAND CHAIN ══════
     #991 made the page draw a COMPOSITION (js/time-borders.js `compositeAt` / `csComposite`): below
     CShapes, OpenHistoricalMap in its band, Seshat's Cliopatria on the ground OHM leaves, and the
     yearly sheet less both (data/hist-eras-rest.js); from 1886, CShapes and Cliopatria on the ground
     CShapes leaves. This file kept asking the chain as it was BEFORE that — one record per band —
     so on ground only Cliopatria places, test 3 read «no polity here» and withheld the unit.
     MEASURED 2026-10-05 (`--only GRL --diagnose`): all five Greenland kommuner `located 0%` on every
     date 2009-2019, because CShapes does not draw Greenland and Cliopatria does — the reader saw
     Greenland drawn and no unit on it. ⇒ the same composition scripts/hist-fidelity.mjs
     `politiesAt` measures; the band chain answers only if the composed files are absent. */
  const cl = fs.existsSync(path.join(ROOT, 'data/hist-clio.js')) ? loadBundle('data/hist-clio.js').data : null;
  const rs = fs.existsSync(path.join(ROOT, 'data/hist-eras-rest.js')) ? loadBundle('data/hist-eras-rest.js').data : null;
  const he = (cl && rs) ? rs : loadBundle('data/hist-eras.js').data;
  /* (hist-colonial-era-borders) from 1886 the page composes OpenHistoricalMap on the ground CShapes leaves,
     BEFORE Cliopatria (data/hist-borders-late.js, already less CShapes' ground) — the same order politiesAt reads */
  const ol = fs.existsSync(path.join(ROOT, 'data/hist-borders-late.js')) ? loadBundle('data/hist-borders-late.js').data : null;

  const pack = (d, feats, nameOf) => feats.map((f, i) => {
    const polys = f[8].map((poly) => poly.map((ri) => d.rings[ri]).filter((r) => r && r.length >= 4)).filter((p) => p.length);
    let [mnx, mny, mxx, mxy] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const poly of polys) { const b = bbox(poly[0]); mnx = Math.min(mnx, b[0]); mny = Math.min(mny, b[1]); mxx = Math.max(mxx, b[2]); mxy = Math.max(mxy, b[3]); }
    return { id: nameOf(f, i), polys, bb: [mnx, mny, mxx, mxy], s: ymd(f[2], f[3], f[4]), e: ymd(f[5], f[6], f[7]) };
  }).filter((u) => u.polys.length);

  /* (hist-findings-sweep) `gw` from the row the id names — `pack` drops rows with no polygon, so a position in its output is not a row */
  const csU = pack(cs, cs.feats, (f, i) => 'cs' + i).map((u) => ({ ...u, rec: 'cs', gw: cs.feats[+u.id.slice(2)][1] }));
  const hbU = pack(hb, hb.feats, (f, i) => 'hb' + i).map((u) => ({ ...u, rec: 'hb' }));
  /* a realm (`r`) is the union of member rows drawn beside it — its ground is answered through them,
     exactly as `politiesAt` counts it */
  const clU = cl && rs ? pack(cl, cl.feats.filter((f) => !(f[9] && f[9].r)), (f, i) => 'cl' + i).map((u) => ({ ...u, rec: 'cl' })) : [];
  const olU = ol ? pack(ol, ol.feats, (f, i) => 'ol' + i).map((u) => ({ ...u, rec: 'ol' })) : [];
  let csMin = Infinity, csMax = -Infinity;
  for (const f of cs.feats) { csMin = Math.min(csMin, f[2]); csMax = Math.max(csMax, f[5]); }
  const hbWin = hb.window || [Infinity, -Infinity];

  /* ⚠ THE SHEETS BECOME SPANS TOO, SO THE THREE RECORDS ANSWER IN ONE SHAPE. Each snapshot stands
     until the next one opens, and the last one stands until data/hist-borders.js takes over — the
     same reading js/time-borders.js gives them. A polity is then a {polys, bb, s, e} whichever
     record it came from, and nothing below this line has to know which. */
  const heU = [];
  he.snaps.forEach((s, i) => {
    const from = ymd(s.y, 1, 1);
    const to = (i + 1 < he.snaps.length) ? ymd(he.snaps[i + 1].y, 1, 1) : (clU.length ? ymd(csMin, 1, 1) : ymd(hbWin[0], 1, 1));
    s.feats.forEach((f, k) => {
      const polys = f[2].map((poly) => poly.map((ri) => he.rings[ri]).filter((r) => r && r.length >= 4)).filter((p) => p.length);
      if (!polys.length) return;
      let [mnx, mny, mxx, mxy] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const poly of polys) { const b = bbox(poly[0]); mnx = Math.min(mnx, b[0]); mny = Math.min(mny, b[1]); mxx = Math.max(mxx, b[2]); mxy = Math.max(mxy, b[3]); }
      heU.push({ id: 'he' + i + '_' + k, rec: 'he', polys, bb: [mnx, mny, mxx, mxy], s: from, e: to });
    });
  });

  /* ⚠ EACH RECORD ONLY ANSWERS FOR ITS OWN BAND, and the bands are the records' own reach: outside
     it a record says nothing rather than saying «empty», which would read as «no country here». */
  const csFrom = ymd(csMin, 1, 1), hbFrom = ymd(hbWin[0], 1, 1);
  /* ⚠ (#R719) THE RECORD IS A FIELD, NOT THE FIRST LETTER OF AN ID. The first build read it as
     `u.id[0]`, and BOTH 'hb…' and 'he…' begin with 'h' — so every one of the 54 deep-past sheets
     was clipped to data/hist-borders.js's 1689-1885 band and answered for nothing at all. Measured
     on that build: 1,480 intervals were withheld for «ground the era record does not place», almost
     all of them before 1689, where the record that could have placed them had been silenced by a
     string comparison. .agents/rules/no-ad-hoc-hardcoding.md §1: an identifier is not a spelling. */
  /* (hist-coverage-depth) Cliopatria answers on both sides of 1886 (the files already hold only the
     ground the record above it leaves), up to the end of CShapes' window — after it the page draws the
     present-day map. Under the composition the sheet's remainder answers all the way up to CShapes. */
  /* ⚠ (hist-coverage-depth) the first day of the year after CShapes' last year — the day js/time-borders.js
     switches to the present-day map (`year > CS_MAX`), as a real date (20191231+1 was not one) */
  const ceil = ymd(csMax + 1, 1, 1);
  const bandOf = (u) => (u.rec === 'cs' ? [csFrom, ceil]
                       : u.rec === 'hb' ? [hbFrom, csFrom]
                       : u.rec === 'cl' ? [ymd(-999999, 1, 1), ceil]
                       : u.rec === 'ol' ? [csFrom, ceil]
                       : [ymd(he.snaps[0].y, 1, 1), clU.length ? csFrom : hbFrom]);

  /** every polity from any of the three records whose box meets this one, with its span clipped to
      the band its record answers for. Computed ONCE per fill unit. */
  function meeting(box) {
    const out = [];
    for (const u of csU) if (meets(u.bb, box)) out.push(u);
    for (const u of hbU) if (meets(u.bb, box)) out.push(u);
    for (const u of olU) if (meets(u.bb, box)) out.push(u);
    for (const u of clU) if (meets(u.bb, box)) out.push(u);
    for (const u of heU) if (meets(u.bb, box)) out.push(u);
    return out.map((u) => { const b = bandOf(u); return { id: u.id, rec: u.rec, gw: u.gw, polys: u.polys, bb: u.bb, s: Math.max(u.s, b[0]), e: Math.min(u.e, b[1]) }; })
      .filter((u) => u.e > u.s);
  }
  /* (hist-findings-sweep) the CShapes code that holds a country's present-day units on the record's last day — the
     country's own outline in the record, found from the units' ground and not from a table of codes */
  function homeCode(ptsList) {
    const last = csU.filter((u) => u.e >= ymd(csMax, 12, 31)), n = new Map();
    for (const { pts, box } of ptsList) for (const u of last) { if (!meets(u.bb, box)) continue;
      const m = hitMask(u.polys, pts); let k = 0; for (let i = 0; i < m.length; i++) k += m[i]; if (k) n.set(u.gw, (n.get(u.gw) || 0) + k); }
    let best = null, bn = 0; for (const [g, k] of n) if (k > bn) { best = g; bn = k; }
    return best;
  }
  /* is a row of code `gw` in force at `t` ANYWHERE — not only near the unit: the home country's outline need not meet an
     island unit's box (MEASURED: Japan's 1946–1952 outline ends at 30°N, Okinawa's box at 28.5°N) */
  const codeAt = (gw, t) => csU.some((u) => u.gw === gw && u.s <= t && u.e > t);
  return { meeting, homeCode, codeAt, floor: he.snaps[0].y, ceiling: ymd(csMax, 12, 31), present: ceil };
}
const meets = (a, b) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);

/* ── the record's own units, for test 4 ─────────────────────────────────────────────────────
   Discovered from data/ rather than listed, for the reason build-border-coast.mjs discovers the
   same population: a tier that lands there tomorrow has to be consulted without anyone
   remembering to come back here. */
/* ⚠ (hist-coverage-depth) THE RECORDS ARE OHM'S TIERS AND EVERY GAP RECORD THAT IS NOT DERIVED.
   HIST_ADMIN_GAPS (js/border-coast.js) marks a publisher's dated record (data/hist-admin-surveys*.js — Newberry,
   NRCan, RISTAT, …) as a record in its own right: where it states a unit, a present-day outline
   carried back is the weaker claim and keeps silent, exactly as it does for OpenHistoricalMap. */
export function recordFiles() {
  const tiers = fs.readdirSync(path.join(ROOT, 'data')).filter((n) => /^hist-admin\d+\.js$/.test(n)).sort().map((n) => 'data/' + n);
  /* (hist-reconstruction) a reconstruction is derived, but from a cited timeline of the unit itself — the outline
     carried back on «Wikidata says the name was founded in D» is the weaker claim and yields to it too */
  const surveyed = HIST_ADMIN_GAPS.filter((g) => (g.derived === false || g.reconstructed) && fs.existsSync(path.join(ROOT, g.file))).map((g) => g.file);
  return tiers.concat(surveyed);
}
/* ══ (hist-reconstruction) THE SAME UNIT, BY ITS IDENTIFIER — NOT ONLY BY WHERE ITS SAMPLES FALL ══════════════
   Test 4 asks whether a record's units cover 25% of this unit's sample points. A unit smaller than the lattice
   has ONE lattice point, and an outline from a different Natural Earth vintage can put it across the line.
   MEASURED 2026-10-05: Ajman (AE-AJ) sampled one point; in the reconstruction's pinned Natural Earth commit that
   point lies in Sharjah, so the fill drew Ajman 1980-2002 over the reconstruction's Ajman (Q159477) — the same
   emirate twice (a new «contested» pair in data/hist-claims.json). ⇒ a reconstructed row whose date record
   names the same Wikidata item (dates[i].wikidata, written by build-hist-admin-recon.mjs from the dossier)
   answers for the unit on its own span. .agents/rules/historical-verification.md §4-2: bind by identifier.
   (hist-recon-expand) The same holds for an ISO 3166-2 code the dossier states (`iso` on a unit → dates[i].iso), keyed
   «iso:<code>»: a fill unit whose Wikidata item states no inception carries no QID — it is dated by its country's set
   floor — but always carries its code. MEASURED 2026-10-06: the fill drew Mandaue (PH-MDE, floored to 2001-02-22)
   over the reconstruction's Mandaue City (Q1889017) 2001–2019 — a «duplicate» pair and two «contested» ones. */
export function reconSpansByItem() {
  const out = new Map();
  for (const g of HIST_ADMIN_GAPS.filter((x) => x.reconstructed && fs.existsSync(path.join(ROOT, x.file)))) {
    const { data: d } = loadBundle(g.file);
    d.feats.forEach((f, i) => {
      const q = d.dates && d.dates[i] && d.dates[i].wikidata, iso = d.dates && d.dates[i] && d.dates[i].iso;
      for (const k of [q, iso && 'iso:' + iso].filter(Boolean)) {
        if (!out.has(k)) out.set(k, []);
        out.get(k).push([ymd(f[2], f[3], f[4]), ymd(f[5], f[6], f[7])]);
      }
    });
  }
  for (const [q, v] of out) out.set(q, union(v, []));
  return out;
}
export function recordUnits(files = recordFiles()) {
  const out = [];
  for (const rel of files) {
    /* (hist-recon-expand) a reconstruction also answers where its research found the line unknown — js/border-coast.js `withheld` */
    const gap = HIST_ADMIN_GAPS.find((g) => g.file === rel);
    if (gap && gap.withheld) {
      /* never silently without it: a fill built without the withheld ground would draw today's lines on ground the research found unknown */
      if (!fs.existsSync(withheldFile())) throw new Error('the withheld ground of the reconstruction is missing (' + withheldFile() + ') — run node scripts/build-hist-admin-recon.mjs first');
      for (const w of JSON.parse(fs.readFileSync(withheldFile(), 'utf8')).units) {
        const polys = w.polys.map((p) => p.filter((r) => r && r.length >= 4)).filter((p) => p.length);
        if (!polys.length) continue;
        let [mnx, mny, mxx, mxy] = [Infinity, Infinity, -Infinity, -Infinity];
        for (const poly of polys) { const b = bbox(poly[0]); mnx = Math.min(mnx, b[0]); mny = Math.min(mny, b[1]); mxx = Math.max(mxx, b[2]); mxy = Math.max(mxy, b[3]); }
        out.push({ polys, bb: [mnx, mny, mxx, mxy], s: w.s, e: w.e, withheld: true });
      }
    }
    const { data: d } = loadBundle(rel);
    for (const f of d.feats) {
      const polys = f[8].map((poly) => poly.map((ri) => d.rings[ri]).filter((r) => r && r.length >= 4)).filter((p) => p.length);
      if (!polys.length) continue;
      let [mnx, mny, mxx, mxy] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const poly of polys) { const b = bbox(poly[0]); mnx = Math.min(mnx, b[0]); mny = Math.min(mny, b[1]); mxx = Math.max(mxx, b[2]); mxy = Math.max(mxy, b[3]); }
      out.push({ polys, bb: [mnx, mny, mxx, mxy], s: ymd(f[2], f[3], f[4]), e: ymd(f[5], f[6], f[7]) });
    }
  }
  return out;
}

/* ── Wikidata: which ISO 3166-2 code began when ─────────────────────────────────────────────
   One query, cached. The date is taken at DAY precision where Wikidata states a day and at the
   first day of the stated year or month where it does not — the same reading the tiers give an
   EDTF-lite `start_date`, so the two records cannot disagree about what «1850» means. */
function stampOf(iso, floorTo) {
  /* ⚠ WDQS writes the leading `+` for some values and not for others — measured 2026-09-15 on the
     same query this build caches: `1715-01-01T00:00:00Z` and `+1976-02-03T00:00:00Z` both appear.
     A regex that requires the sign reads 2,401 dated rows as 6. */
  const m = /^([+-]?\d{4,})-(\d\d)-(\d\d)/.exec(String(iso || ''));
  if (!m) return null;
  const y = parseInt(m[1], 10);
  let mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
  if (!Number.isFinite(y)) return null;
  if (!mo) mo = floorTo === 'end' ? 12 : 1;
  if (!d) d = floorTo === 'end' ? 31 : 1;
  return ymd(y, mo, d);
}

/* ══ ⚠⚠⚠ (#R719/#R730) THE FLOOR IS THE SET, NOT THE CONSTITUTION ════════════════════════════
   #R719 measured the defect correctly: test 3 asks «was this ground inside ONE polity on that
   date», which a Ukrainian oblast satisfies in the year 1000 — the land was wholly inside Kievan
   Rus' — and today's Երևան satisfies it in 782 BC, because ISO 3166-2 `AM-ER` sits on the CITY
   item whose stated inception is the city's founding. Both would have been drawn.
   ⚠ BUT THE FLOOR IT CHOSE WAS THE COUNTRY'S OWN P571, AND THAT IS A DIFFERENT FACT. Measured
   2026-09-15: the item carrying `JPN` states 1947-05-03 (the post-war constitution), `CHN`
   1949-10-01, `IND` 1947-08-15, `TUR` 1923-10-29. Under that floor a record built to fill the
   19th and early 20th century could not draw Japan, China, India or Turkey AT ALL before the
   middle of the 20th — which is the reader's own report, one layer further down: they opened
   1918 Japan and got ONE prefecture.
   ⇒ the floor is THE SET'S: the LATEST inception stated by a unit of the same country. It is
   about the units rather than about a constitution, it can never be earlier than any unit's own
   stated date, and it is exactly what the whole-country intersection below produces anyway —
   which is also why it still refuses the two rows #R719 measured: Armenia is drawn from the
   latest of its eleven provinces, not from Yerevan's 782 BC, and Ukraine from the latest of its
   twenty-five oblasts. A country whose units state nothing is admitted by neither rule. */
export async function wikidataSpans() {
  /* ══ ⚠⚠⚠ (hist-coverage) AN ISO 3166-2 CODE IS ITSELF DATED, AND `wdt:` READS ONLY THE CURRENT ONE ════
     The query read `?item wdt:P300 ?code`, and `wdt:` is the BEST-RANKED statement only. ISO revised the
     codes of whole countries after Natural Earth's survey — Poland's voivodeships went from `PL-DS` to
     `PL-02`, Czechia's kraje from `CZ-PR` to `CZ-10`, Kazakhstan's oblasts from `KZ-AKM` to `KZ-11` —
     and Wikidata keeps the code Natural Earth carries on the SAME item at normal rank, beside the new one
     at preferred rank. So the join missed the item, and three whole countries read as «no unit states a
     founding» while every one of their units does (Q54150, Lower Silesian Voivodeship: `PL-DS` normal,
     `PL-02` preferred, P571 1999-01-01). MEASURED 2026-10-03 against WDQS: POL 0 → 16 of 16 dated,
     CZE 0 → 14 of 14, KAZ 0 → 14 of 16; 66 → 70 countries pass the set-floor guard.
     ⚠ AND RANK IS WHAT KEEPS THE WIDER JOIN AN IDENTITY. Codes are REUSED: `IR-28` is preferred on
     Q180075 (North Khorasan, 2004) and normal on Q1105893 (the Khorasan dissolved into it). Taking every
     holder would date one province by another. So a code is held by its PREFERRED-rank items where it
     has any, and by its normal-rank items only where it has none; deprecated statements are never read.
     ══ ⚠ AND HASC (P8119) IS THE SECOND IDENTIFIER, NOT A SECOND OPINION ══════════════════════════════
     Natural Earth publishes the HASC code beside the ISO one (`PL.DS`). Where the ISO join finds no dated
     item, the HASC join is asked under the same rank rule; it never overrides a date the ISO join found.
     MEASURED the same day: it dates all 14 of Nepal's zones, which ISO dates none of, and moves no admitted
     country. The span records which identifier answered (`via`), and the bundle carries it.
     ══ ⚠⚠⚠ REFUSED, MEASURED: THE START-TIME QUALIFIERS ARE NOT FOUNDINGS ════════════════════════════
     P580 on a unit's P31 / P131 statement, or on its country's P150, dates 15 more countries past the
     guard — and moves countries already admitted to dates that are NOT when the unit began: JPN's set
     floor 1888-12-03 → 1946-01-01 («prefecture of Japan» since the post-war class), FIN 2010 → 2026
     (a reassignment of P131), HUN 1950 → 2013, SRB 1992 → 2006. A qualifier says since when the unit was
     of a KIND or IN a parent, not since when it governed the ground. Not read. */
  const rows = await sparql(`SELECT ?code ?item ?rank ?inc ?dis WHERE {
  ?item p:P300 ?st . ?st ps:P300 ?code ; wikibase:rank ?rank .
  FILTER(?rank != wikibase:DeprecatedRank)
  OPTIONAL { ?item wdt:P571 ?inc }
  OPTIONAL { ?item wdt:P576 ?dis }
}`, 'p300-spans-ranked');
  const hrows = await sparql(`SELECT ?code ?item ?rank ?inc ?dis WHERE {
  ?item p:P8119 ?st . ?st ps:P8119 ?code ; wikibase:rank ?rank .
  FILTER(?rank != wikibase:DeprecatedRank)
  OPTIONAL { ?item wdt:P571 ?inc }
  OPTIONAL { ?item wdt:P576 ?dis }
}`, 'p8119-spans-ranked');
  const out = new Map();
  /* the holders a code is read from: its preferred-rank items, or (only where it has none) its
     normal-rank ones. A row with no `rank` is a best-ranked statement as `wdt:` returns it. */
  const holders = (rs) => {
    const pref = new Set(), any = new Set();
    for (const r of rs) {
      const q = r.item.value.split('/').pop();
      any.add(q);
      if (!r.rank || /PreferredRank$/.test(r.rank.value)) pref.add(q);
    }
    return pref.size ? pref : any;
  };
  const byCode = (rs) => { const m = new Map(); for (const r of rs) { const k = r.code.value; if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };
  function fold(rs, via) {
    for (const [code, list] of byCode(rs)) {
      if (out.has(code)) continue;
      const keep = holders(list);
      /* ══ ⚠⚠⚠ (hist-fill-never-whole) ONE ITEM'S STATEMENTS ARE ONE UNIT'S; TWO ITEMS ARE TWO LIVES ══════════
         Everything below folded EVERY holder of a code into one record, so the rule for 香川県 — several
         foundings stated on ONE item, drawn from the last — was also applied ACROSS items. Where a reform reused
         the code, that dated the predecessor's outline by the successor's founding and gave it the predecessor's
         dissolution as well. MEASURED 2026-10-05 (`--only LVA --diagnose`): `LV-058` is held at equal rank by
         Q932445 (Ludza Municipality, 2009-07-01 → 2021-06-30) and Q97231943 (the merged one, 2021-07-01 →), and
         was read as ONE unit founded 2021-07-01; so were 16 more Latvian codes. Natural Earth's 119 outlines are
         the 2009-2021 municipalities, 76 of which state their 2021 end, so Latvia's set floor (2021-07-01) fell
         after three quarters of its own set had ended and the whole country was refused on every date — while
         every one of the 119 was in force together from 2011-01-01 to 2021-06-30.
         ⇒ each item is folded alone (the Kagawa rule, unchanged, inside it) and the code keeps one LIFE per
         item (`lives`). The top-level `s`/`e`/`qid` stay the latest-founded item's, as before. Which life the
         outline is, the SET decides (`setLife` below): a code's life counts only where its siblings coexist. */
      const items = new Map();
      for (const r of list) {
        const qid = r.item.value.split('/').pop();
        if (!keep.has(qid)) continue;
        const s = stampOf(r.inc && r.inc.value, 'start');
        if (s == null) continue;
        const e = stampOf(r.dis && r.dis.value, 'end');
        /* ══ ⚠⚠⚠ (hist-fidelity-sweep) SEVERAL STATED INCEPTIONS: THE UNIT IS DRAWN FROM THE LAST ONE ═════
           This took the EARLIEST, on the reasoning that «one code, several items happens where a unit was
           re-founded». A re-founded unit is exactly the case where the earliest date is FALSE for the outline
           drawn: 香川県 (Q161454) states 1871-12-26, 1875-09-05 and 1888-12-03 — founded, merged into 名東県,
           refounded, merged into 愛媛県, refounded — and today's Kagawa exists continuously only from the last.
           Taking the first made Japan's set floor 1881-02-07 (福井県's single date) instead of the 1888-12-03
           the note on the set floor below itself expects, so 1881-1888 drew Kagawa over what was 愛媛県, Nara
           (refounded 1887-11-04) over 大阪府, and Toyama / Saga / Miyazaki (1883) over 石川 / 長崎 / 鹿児島 —
           units whose today's outline did not exist. MEASURED 2026-10-02 on the shipped bundle: all 45
           Japanese rows began 1881-02-07.
           ⇒ every stated inception is kept (`ss`) and the unit is drawn from the LATEST of them: the one date
           every statement about its beginning has passed. That can only make a span shorter, never invent a
           year, and where the dates are several opinions about ONE founding it is the cautious one. */
        const it = items.get(qid) || { qid, ss: [], es: [] };
        if (!it.ss.includes(s)) it.ss.push(s);
        if (e != null && !it.es.includes(e)) it.es.push(e);
        items.set(qid, it);
      }
      if (!items.size) continue;
      /* …and a dissolution the unit was refounded AFTER is the end of an earlier incarnation, not of this
         one (香川県's 1876 merger into 愛媛県): the end that bounds the outline is the first stated one after
         the item's latest inception, or none. */
      const lives = [...items.values()].map((it) => {
        const s = Math.max(...it.ss), after = it.es.filter((x) => x > s);
        return { qid: it.qid, s, e: after.length ? Math.min(...after) : null };
      }).sort((a, b) => a.s - b.s || (a.qid < b.qid ? -1 : 1));
      const last = lives.reduce((a, b) => (b.s > a.s ? b : a));
      const ss = [...new Set([...items.values()].flatMap((it) => it.ss))];
      const es = [...new Set([...items.values()].flatMap((it) => it.es))];
      out.set(code, { qid: last.qid, s: last.s, e: last.e, ss, es, via, lives });
    }
  }
  fold(rows, 'P300');
  fold(hrows, 'P8119');
  return out;
}

/* ══ (hist-fill-never-whole) WHEN A COUNTRY'S SET IS IN FORCE TOGETHER ═══════════════════════════════════
   A unit's stated life is the union of its items' lives; the set is in force on the dates where EVERY unit
   that states anything has one in force. The set floor (below) is the first of those dates — for a set of
   one life per unit that is exactly the latest stated founding, as it always was. ONE function, so the
   build and `--redate` cannot disagree about it. */
const livesOf = (w) => (w.lives && w.lives.length ? w.lives : [{ qid: w.qid, s: w.s, e: w.e }])
  .map((l) => [l.s, l.e == null ? ymd(9999, 1, 1) : l.e]).filter(([s, e]) => s < e);
export function setLife(wds) {
  let both = [[ymd(-999999, 1, 1), ymd(9999, 1, 1)]];
  for (const w of wds) both = intersect(both, union(livesOf(w), []));
  return both;
}
/* the floor: the first date the dated set is in force together, or — where it never is — the latest stated
   founding, so such a country still reaches the whole-country rule and is refused there as `never-whole` */
export function setFloorOf(wds) {
  if (!wds.length) return null;
  const both = setLife(wds);
  return both.length ? both[0][0] : Math.max(...wds.map((w) => w.s));
}

/* ══ (hist-coverage) ONE NATURAL EARTH UNIT → ITS IDENTIFIERS → ITS DATED SPAN ═══════════════════════
   The ISO 3166-2 code is the unit's key everywhere in this file and in the bundle (column 10); the HASC
   code is asked only where the ISO one is not dated. Whatever answered, the span is filed under the ISO
   key, so `inception` and the whole-country rule keep one key per unit. */
const HASC = /^[A-Z]{2}\.[A-Z0-9]{2,3}$/;
export function unitIds(nameField) {
  const parts = String(nameField || '').split('|');
  return { code: parts.find((p) => ISO2.test(p)) || null, hasc: parts.find((p) => HASC.test(p)) || null };
}
export function spanOf(spans, ids) {
  return (ids.code && ISO2_STRICT.test(ids.code) && spans.get(ids.code)) || (ids.hasc && spans.get(ids.hasc)) || null;
}

/* ══ (hist-fidelity-sweep) THE STATED INCEPTIONS TRAVEL WITH THE BUNDLE ═══════════════════════════
   `inception[code]` is the latest inception Wikidata states for that ISO 3166-2 code (YYYYMMDD, the
   stamp the rows use), for every unit of every admitted country that states one. (hist-fill-never-whole) Where
   SEVERAL items hold the code it is the earliest of their lives' starts — each item's own latest founding —
   and `lives[code]` carries every life as [start, end|null], so the gate can ask that a row lies inside one. It is the evidence
   for the two claims the rows make — «not before my own last founding» and «not before my country's
   set was complete» — so npm run check:histfidelity can re-derive both OFFLINE from the shipped bytes,
   the way `deferred` lets `--check` re-derive the whole-country rule. */
function inceptionOf(countries, byCountry, spans) {
  const out = {};
  for (const iso3 of countries) for (const u of byCountry.get(iso3).all) {
    const w = u.code && spanOf(spans, u.ids || { code: u.code, hasc: null });
    if (w && Number.isFinite(w.s)) out[u.code] = w.lives && w.lives.length ? Math.min(...w.lives.map((l) => l.s)) : w.s;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}
/* (hist-fill-never-whole) the codes several Wikidata items hold, and each item's life — the evidence for rows
   drawn in a predecessor's life (`fillInceptionProblems` in scripts/hist-fidelity.mjs reads it) */
function livesOfCodes(countries, byCountry, spans) {
  const out = {};
  for (const iso3 of countries) for (const u of byCountry.get(iso3).all) {
    const w = u.code && spanOf(spans, u.ids || { code: u.code, hasc: null });
    if (w && w.lives && w.lives.length > 1) out[u.code] = w.lives.map((l) => [l.s, l.e]);
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}
/* (hist-coverage) …and WHICH IDENTIFIER answered, for the units the ISO 3166-2 code did not date: the
   HASC join is the second identifier, and a reader of the bundle (and the gate) can see which units
   rest on it. Units the ISO code dated are the default and are not listed. */
function inceptionViaOf(countries, byCountry, spans) {
  const out = {};
  for (const iso3 of countries) for (const u of byCountry.get(iso3).all) {
    const w = u.code && spanOf(spans, u.ids || { code: u.code, hasc: null });
    if (w && w.via && w.via !== 'P300') out[u.code] = w.via;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

/* ══ (hist-fidelity-sweep) `--redate` — RE-DATE THE COMMITTED ROWS, MOVE NO LINE ═════════════════════
   The same shape as scripts/build-hist-admin1.mjs `--dates`, and for the same reason: a full build
   re-asks today's Wikidata which units of every country are dated at all and re-runs the geometric tests
   over the whole world, which is a larger and different change than the one rule this pass exists for.
   This pass applies that ONE rule to the rows already shipped: a country is drawn from its set floor
   (`setFloorOf`, the same function the build calls — the latest founding its units state, or where codes
   have several lives the first date all of them are in force) — and no row starts before it. A row that ends
   on or before the new floor leaves with its rings; nothing else changes. */
async function redate() {
  const rel = path.relative(ROOT, OUT).replace(/\\/g, '/');
  const d = loadBundle(rel).data;
  const ne = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'data', 'admin1-world.json.gz'))));
  const spans = await wikidataSpans();
  const byCountry = new Map();
  for (const f of ne.f) {
    const ids = unitIds(f.n), code = ids.code;
    const c = byCountry.get(f.i) || { all: [] };
    c.all.push({ code, ids });
    byCountry.set(f.i, c);
  }
  const countries = [...new Set(d.feats.map((f) => f[11]))].sort();
  const floor = new Map(), before = new Map();
  for (const iso3 of countries) {
    const F = setFloorOf(byCountry.get(iso3).all.map((u) => u.code && spanOf(spans, u.ids)).filter(Boolean));
    if (F != null) floor.set(iso3, F);
  }
  const keep = [], moved = new Map(), dropped = [];
  for (const f of d.feats) {
    const F = floor.get(f[11]);
    const s = ymd(f[2], f[3], f[4]), e = ymd(f[5], f[6], f[7]);
    if (!before.has(f[11]) || s < before.get(f[11])) before.set(f[11], s);
    if (F == null || s >= F) { keep.push(f); continue; }
    if (e <= F) { dropped.push(f); continue; }
    const [y, m, dd] = splitYmd(F);
    f[2] = y; f[3] = m; f[4] = dd;
    moved.set(f[11], (moved.get(f[11]) || 0) + 1);
    keep.push(f);
  }
  for (const [iso3, n] of [...moved].sort()) console.error('  ' + iso3 + ': ' + n + ' row(s) from ' + splitYmd(before.get(iso3)).join('-') + ' → ' + splitYmd(floor.get(iso3)).join('-'));
  if (dropped.length) console.error('  dropped ' + dropped.length + ' row(s) that end before their country\'s floor: ' + dropped.map((f) => f[10] + ' ' + f[0]).join(', '));
  /* the ring pool is rebuilt only when a row left, so a pass that only moved dates leaves every ring index as it was */
  if (dropped.length) {
    const remap = new Map(), pool = [];
    for (const f of keep) f[8] = f[8].map((poly) => poly.map((ix) => { if (!remap.has(ix)) { remap.set(ix, pool.length); pool.push(d.rings[ix]); } return remap.get(ix); }));
    d.rings = pool;
  }
  d.feats = keep;
  const admitted = countries.filter((c) => byCountry.has(c));
  const cs = new Map(admitted.map((c) => [c, { all: byCountry.get(c).all }]));
  const head = { ...d, built: new Date().toISOString().slice(0, 10), inception: inceptionOf(admitted, cs, spans), lives: livesOfCodes(admitted, cs, spans) };
  /* the key order the build writes: inception sits before the rings, so the file stays diffable */
  const { rings, feats, ...rest } = head;
  fs.writeFileSync(OUT, 'window.' + GLOBAL + '=' + JSON.stringify({ ...rest, rings, feats }) + ';\n');
  console.error('· wrote ' + rel + ' — ' + [...moved.values()].reduce((a, b) => a + b, 0) + ' row(s) re-dated in ' + moved.size + ' country(ies), ' + dropped.length + ' dropped');
}

/* ── interval arithmetic on [start, end) stamps ─────────────────────────────────────────── */
/** the intervals either set covers, merged — the reader sees a unit where EITHER record draws it */
/* ══ ⚠⚠ (hist-coverage-depth) THE RECORD ANSWERS GROUND TOGETHER, NOT ONE UNIT AT A TIME ═══════════════
   The yield used to ask each record unit alone «do you cover a quarter of this ground». A record that
   divides the same ground FINER answers it with many small units, none of which reaches a quarter —
   so the coarser unit was drawn over all of them: two levels on one map. MEASURED 2026-10-05 on the
   double-claim ledger (scripts/hist-fidelity.mjs): +246 «contested» pairs were HGIS de las Indias'
   provincia mayor «Nueva España» over OpenHistoricalMap's Puebla, Oaxaca, Querétaro, Valladolid, San
   Luis Potosí…, and +25 were present-day Stockholm and Uppsala counties over OHM's härad. Neither is a
   dispute; both are a coarser unit drawn over a finer record. ⇒ On every interval between the record's
   own change dates, the ground ALL in-force record units hold is unioned, and the interval is the
   record's when that union reaches the share. A genuinely contested sliver (the Kwantung Leased
   Territory inside Liaoning, the Falklands beside Buenos Aires) stays a claim of both, as it should.
   Shared with scripts/build-hist-admin-surveys.mjs, so the two yields cannot disagree. */
export function answeredSpans(pts, box, rec, from, to) {
  const need = Math.max(1, Math.ceil(OVERLAP_MIN * pts.length));
  const hits = [];
  for (const r of rec) {
    if (r.e <= from || r.s >= to || !meets(r.bb, box)) continue;
    const m = hitMask(r.polys, pts);
    let n = 0; for (let i = 0; i < m.length; i++) n += m[i];
    if (n) hits.push({ r, m });
  }
  const cuts = new Set([from, to]);
  for (const { r } of hits) { if (r.s > from && r.s < to) cuts.add(r.s); if (r.e > from && r.e < to) cuts.add(r.e); }
  const xs = [...cuts].sort((a, b) => a - b), spans = [], who = [];
  for (let k = 0; k + 1 < xs.length; k++) {
    const a = xs[k], b = xs[k + 1], u = new Uint8Array(pts.length), by = [];
    for (const { r, m } of hits) if (r.s <= a && r.e >= b) { for (let i = 0; i < m.length; i++) if (m[i]) u[i] = 1; by.push(r); }
    let n = 0; for (let i = 0; i < u.length; i++) n += u[i];
    if (n < need) continue;
    const last = spans[spans.length - 1];
    if (last && last[1] === a) last[1] = b; else spans.push([a, b]);
    who.push(...by);
  }
  return { spans, who };
}
function union(a, b) {
  const all = a.concat(b).filter((iv) => iv[1] > iv[0]).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const iv of all) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1]) { if (iv[1] > last[1]) last[1] = iv[1]; } else out.push(iv.slice());
  }
  return out;
}

/** the intervals both sets cover — [start, end) throughout */
function intersect(a, b) {
  const out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i][0], b[j][0]), e = Math.min(a[i][1], b[j][1]);
    if (e > s) out.push([s, e]);
    if (a[i][1] < b[j][1]) i++; else j++;
  }
  return out;
}
function subtract(spans, cut) {
  const out = [];
  for (const [s, e] of spans) {
    if (cut[1] <= s || cut[0] >= e) { out.push([s, e]); continue; }
    if (cut[0] > s) out.push([s, cut[0]]);
    if (cut[1] < e) out.push([cut[1], e]);
  }
  return out;
}
/* ⚠ (#R719) THE ENCODE IS MONOTONIC FOR NEGATIVE YEARS AND THE NAIVE DECODE IS NOT. `y*10000 +
   m*100 + d` orders correctly on both sides of year 0 (the year term dominates and, within a
   negative year, a later month is nearer zero = larger). Taking it apart with `trunc` and `%`
   does not: −500-06-15 encodes as −4999385, and `trunc(v/10000)` reads −499 while `v % 100`
   reads −85. Measured: the gate caught it as «feat 6 has an impossible month or day». */
const splitYmd = (v) => {
  const neg = v < 0, a = Math.abs(v);
  const y = Math.floor(a / 10000), m = Math.floor(a / 100) % 100, d = a % 100;
  return neg ? [-y, m, d] : [y, m, d];
};

/* ── build ──────────────────────────────────────────────────────────────────────────────── */
async function main() {
  const reg = registry(ROOT);
  const SHIP = shipTags(ROOT, reg);
  const HARVEST = harvestTags(ROOT, reg);
  const ne = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'data', 'admin1-world.json.gz'))));
  console.error('· natural earth: ' + ne.f.length + ' units in ' + ne.countries + ' countries (tol ' + ne.tolerance + ')');

  const spans = await wikidataSpans();
  console.error('· wikidata: ' + spans.size + ' ISO 3166-2 codes state an inception');

  /* test 1 + test 2 — dated, and dated for the WHOLE country. */
  const byCountry = new Map();
  for (const f of ne.f) {
    const ids = unitIds(f.n), code = ids.code;
    const wd = code ? spanOf(spans, ids) : null;
    const c = byCountry.get(f.i) || { all: [], dated: 0 };
    c.all.push({ f, code, ids, wd });
    if (wd) c.dated++;
    byCountry.set(f.i, c);
  }
  /* ══ ⚠⚠⚠ (#R730) A SET FLOOR, SO THAT «MOSTLY DATED» IS NOT THE SAME AS «NOT DATED» ══════════
     #R719 admitted a country only when EVERY unit states an inception, and refused the rest. What
     the reader got from that is in their own screenshot of 1918 Japan: ONE prefecture — Shiga,
     the only Japanese unit OpenHistoricalMap holds — on a map of the Empire of Japan. Wikidata
     states an inception for 27 of Japan's 47 prefectures, so Japan was refused whole.
     ⚠ AND REFUSING IS NOT NEUTRAL. «一部だけ» is what the reader reported four rounds running, and
     a record that ships nothing leaves exactly that, because the OTHER record is partial.
     ⇒ a unit its own upstream never dated takes the LATEST inception stated by a unit of the same
     country. That is the weakest claim the set supports — «by this date every member that states a
     date had been established» — and it can never draw a unit before its own stated date, because
     it is the maximum of them. (hist-fill-never-whole) Precisely, it is the first date on which every
     dated member has a stated life in force (`setFloorOf`): the same date wherever each code has one
     life, and the predecessors' window where a reform reused codes (Latvia 2011-01-01, not 2021-07-01). For Japan it is 1888-12-03, the day Kagawa separated from Ehime and
     the 47-prefecture set took the extent it still has.
     ⚠ THE GUARD IS THAT THE SET MUST ACTUALLY BE DATED: at least three units and at least half of
     them. Turkey states 7 of 81 and stays refused; France 95 of 101 and Japan 27 of 47 pass.
     ⚠ The floor is a DERIVED bound and the row says so — js/time-admin1.js draws these in the
     derived line's own style and `note()` names the record. */
  const SET_FLOOR_MIN = 3;
  const setFloor = new Map();
  for (const [iso3, c] of byCountry) {
    if (c.dated < SET_FLOOR_MIN || c.dated * 2 < c.all.length) continue;
    const latest = setFloorOf(c.all.filter((u) => u.wd).map((u) => u.wd));
    if (latest != null) setFloor.set(iso3, latest);
  }
  let floored = 0;
  for (const [iso3, c] of byCountry) {
    const f = setFloor.get(iso3);
    if (f == null) continue;
    for (const u of c.all) if (!u.wd) { u.wd = { s: f, e: null, derived: 'the first date every dated unit of the same country is in force' }; c.dated++; floored++; }
  }
  console.error('· set floor: ' + setFloor.size + ' country(ies) date their own undated units from the first date their dated set is in force (' + floored + ' unit(s))');

  const admitted = [], refusedPartial = [], refusedNoFloor = [], refusedNoId = [];
  /* ══ (hist-coverage) A COUNTRY THIS RECORD DOES NOT ANSWER IS A HOLE, AND A HOLE STATES ITS REASON ══
     The four refusals below were printed to the console of whoever ran the build and then lost, so the
     next round could not tell «Wikidata dates 3 of Algeria's 48 wilayas» from «Algeria was never asked».
     They travel with the bundle now — `refused[ISO3] = [why, units that state a founding, units]` —
     and scripts/hist-fidelity.mjs reads them to say, per year and per polity, WHY the ground it measures
     as uncovered is uncovered (data/hist-coverage-holes.json). `why` is one of:
       no-identifier  a unit carries neither an ISO 3166-2 nor a placeholder code, so «answered whole»
                      cannot be re-derived for its country
       undated        fewer than SET_FLOOR_MIN, or fewer than half, of its units state a founding
       no-set-floor   dated, but no unit's own statement gives the set a floor
       never-whole    admitted, but on no date can EVERY unit be drawn (tests 3-4 below)  */
  const stated = (c) => c.all.filter((u) => u.wd && !u.wd.derived).length;
  const refused = {};
  for (const [iso3, c] of byCountry) {
    if (c.all.some((u) => !u.code)) { refusedNoId.push(iso3); refused[iso3] = ['no-identifier', stated(c), c.all.length]; continue; }
    if (!(c.dated === c.all.length && c.all.length >= 1)) refused[iso3] = ['undated', stated(c), c.all.length];
    else if (!setFloor.has(iso3)) refused[iso3] = ['no-set-floor', stated(c), c.all.length];
    if (c.dated === c.all.length && c.all.length >= 1) {
      if (setFloor.has(iso3)) admitted.push(iso3); else refusedNoFloor.push(iso3);
    } else if (c.dated) refusedPartial.push(iso3 + ' ' + c.dated + '/' + c.all.length);
  }
  if (refusedNoId.length) console.error('· ' + refusedNoId.length + ' country(ies) hold a unit with no identifier at all and are refused: ' + refusedNoId.join(' '));
  if (refusedNoFloor.length) console.error('· ' + refusedNoFloor.length + ' dated country(ies) have no set floor and are refused: ' + refusedNoFloor.join(' '));
  console.error('· whole-country test: ' + admitted.length + ' countries admitted, '
    + refusedPartial.length + ' refused for being partly dated, '
    + (byCountry.size - admitted.length - refusedPartial.length) + ' with no dated unit at all');

  const deferred = new Set();   /* (#R730) units left to data/hist-admin*.js — stated in the bundle */
  /* (hist-coverage-depth) units whose ground the era record never places while their country is drawn */
  const unplaced = new Set();
  const era = eraIndex();
  const rec = recordUnits();
  const reconSpans = reconSpansByItem();
  console.error('· record units consulted for overlap: ' + rec.length);

  const rings = [], ringKey = new Map(), feats = [];
  const poolRing = (r) => {
    const k = r.length + ':' + r[0][0] + ',' + r[0][1] + ':' + r[(r.length / 2) | 0][0];
    let ix = ringKey.get(k);
    if (ix != null && rings[ix].length === r.length) return ix;
    ix = rings.push(r) - 1; ringKey.set(k, ix); return ix;
  };

  const stats = { units: 0, rows: 0, droppedAbroad: 0, droppedStraddle: 0, droppedUnlocated: 0, droppedOverlap: 0, droppedEmpty: 0, droppedWhole: 0 };
  const qids = [];
  const pending = [];

  let done = 0;
  for (const iso3 of admitted) {
    if (ONLY && iso3 !== ONLY) continue;
    console.error('  ' + iso3 + ' (' + (++done) + '/' + admitted.length + ')');
    const live = [];
    for (const u of byCountry.get(iso3).all) {
      const g = u.f.g;
      const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
        .map((poly) => poly.filter((r) => r && r.length >= 4)).filter((p) => p.length);
      if (!polys.length) { stats.droppedEmpty++; continue; }
      const pts = samplePoints(polys);
      if (!pts.length) { stats.droppedEmpty++; continue; }
      let [mnx, mny, mxx, mxy] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const poly of polys) { const b = bbox(poly[0]); mnx = Math.min(mnx, b[0]); mny = Math.min(mny, b[1]); mxx = Math.max(mxx, b[2]); mxy = Math.max(mxy, b[3]); }
      const box = [mnx, mny, mxx, mxy];

      /* (#R730) the set's floor, not the constitution's — (hist-fill-never-whole) applied to each of the code's
         lives: one per Wikidata item that holds it (`wikidataSpans`). Where they are several, the set decides
         which one this outline is, through the whole-country intersection below. */
      const lo = Math.max(setFloor.get(iso3), ymd(era.floor, 1, 1));
      const lives = (u.wd.lives || [u.wd]).map((l) => ({ qid: l.qid, start: Math.max(l.s, lo), end: l.e == null ? ymd(9999, 1, 1) : l.e }))
        .filter((l) => l.start < l.end);
      if (!lives.length) { stats.droppedEmpty++; continue; }

      /* test 3 — evaluated exactly once per interval on which the era map cannot change here.
         ⚠ THE POINT-IN-POLYGON WORK IS DONE ONCE PER (point, polity), NOT ONCE PER INTERVAL. The
         polities that meet this unit do not change with the date — only WHICH OF THEM are in force
         does — so the expensive half is hoisted out of the interval loop and the loop reads a
         precomputed column. The first build of this file did it the other way and did not finish. */
      const near = era.meeting(box);
      /* ══ ⚠⚠⚠ (hist-findings-sweep) A SUBDIVISION IS DRAWN INSIDE ITS OWN COUNTRY, WHERE THE RECORD DRAWS THAT COUNTRY ══
         Test 3 asked only that the ground lie inside ONE polity, not WHICH, so a unit lying wholly inside a foreign polity
         passed — measured 2026-10-07: «Okinawa» (JP-47) was drawn from 1945-11-26 to today, through 1946-01-29 to
         1972-05-14, when data/cshapes.js draws the Nansei Islands as «Ryukyu Islands» (7401, under United States
         administration; scripts/cshapes/review.json) beside Japan (740). Okinawa Prefecture did not exist then.
         ⇒ the unit's own code is the CShapes code holding ITS ground on the record's last day (`homeCode` — from the
         ground, not from a table of codes). On an interval where a row of that code is in force anywhere (`codeAt`), a unit
         whose ground lies mostly in a CShapes row of ANOTHER code is not drawn there, and — like ground no polity is drawn
         on — it is not a hole in the country (the reader sees another country there), so it joins the unit's cover.
         ⚠ PER UNIT, NOT PER COUNTRY: CShapes codes dependencies apart from their sovereign to the end (Martinique 66,
         Réunion 585 beside France 220) — measured on the first version, which took the country's majority code and
         withheld Martinique and Réunion 1976–2019 as «abroad», and Kinmen (which CShapes draws inside China) 2014–2019.
         ⚠ ONLY A CShapes ROW IS «ANOTHER COUNTRY»: a row of another record has no code to compare, and the rule is test 3
         as it was there (and wherever the record does not draw the unit's own code at all). */
      const home = era.homeCode([{ pts, box }]);
      const hitsOf = near.map((eu) => {
        const mask = hitMask(eu.polys, pts);
        let n = 0; for (let i = 0; i < mask.length; i++) n += mask[i];
        return { n, mask };
      });
      const edgeMemo = new Map();
      let alive = [];
      /* (hist-coverage-depth) the intervals on which the era record places NONE of this ground */
      const silent = [];
      /* (hist-findings-sweep) …and the ones on which it places the ground in another country than this unit's */
      const abroad = [];
      /* ⚠ the first interval has nothing behind it, so «no record answers» means «not drawn» there
         — the fill never starts on a date the era record is silent about. */
      for (const { start, end } of lives) {
        const bps = new Set();
        for (const eu of near) { if (eu.s > start && eu.s < end) bps.add(eu.s); if (eu.e > start && eu.e < end) bps.add(eu.e); }
        if (era.present > start && era.present < end) bps.add(era.present);
        let lastVerdict = false;
        let cur = start;
        for (const stop of [...bps].sort((a, b) => a - b).concat([end])) {
          const inForce = [];
          for (let k = 0; k < near.length; k++) if (near[k].s <= cur && near[k].e > cur) inForce.push(k);   /* (hist-fill-never-whole) a polity holding none of the points can still touch their cells */
          let located = 0, best = 0;
          const claimed = new Uint8Array(pts.length);
          const own = new Map();
          for (const k of inForce) {
            let n = 0;
            const mask = hitsOf[k].mask;
            for (let i = 0; i < pts.length; i++) if (mask[i]) { n++; if (!claimed[i]) { claimed[i] = 1; located++; } }
            own.set(k, n);
          }
          /* ══ ⚠⚠ (hist-fill-never-whole) A SAMPLE POINT STANDS FOR ITS CELL, AND A CELL THE POLITY TOUCHES IS PLACED ══
             The lattice is GRID degrees apart, so each point answers for a GRID-wide cell around it. A point that
             falls just outside every polity's edge — the era outline's coast drawn a few hundred metres inland of
             Natural Earth's — is a point whose CELL the polity still covers in part: at the scale this test
             measures, that ground is placed. MEASURED 2026-10-05 (`--only LVA --diagnose`): Carnikava (LV-020), a
             strip of the Gulf of Riga's shore, is sampled on TWO lattice points; one sits 0.2 km outside CShapes'
             Latvian coast, so it read `located 50%`, fell under LOCATED_MIN on every date 2011-2019, and withheld
             all 119 of Latvia's units. ⇒ a point no polity holds is placed in the NEAREST in-force polity whose edge
             passes within half a cell (GRID / 2) of it — the inscribed half-cell, so a cell touched only at its
             corner still reads as unplaced. A point farther than that is still unplaced, and the straddle test
             still decides between polities. Distances are asked lazily, only of points left unclaimed. */
          for (let i = 0; i < pts.length; i++) {
            if (claimed[i]) continue;
            let nk = -1, nd = Infinity;
            for (const k of inForce) {
              const key = k * pts.length + i;
              let d = edgeMemo.get(key);
              if (d === undefined) { d = edgeDistance(near[k].polys, pts[i][0], pts[i][1], GRID / 2); edgeMemo.set(key, d); }
              if (d < nd) { nd = d; nk = k; }
            }
            if (nk >= 0) { claimed[i] = 1; located++; own.set(nk, own.get(nk) + 1); }
          }
          let bestK = -1;
          for (const [k, n] of own) if (n > best) { best = n; bestK = k; }
          /* (hist-findings-sweep) the record draws this unit's country now, and the unit's ground mostly lies elsewhere */
          const foreign = cur < era.present && home != null && bestK >= 0 && near[bestK].rec === 'cs' && near[bestK].gw !== home
            && era.codeAt(home, cur);
          /* ══ ⚠⚠⚠ A SEAM IN THE RECORD IS NOT A STATEMENT ABOUT THE LAND ════════════════════════
             MEASURED on Sweden (`--only SWE --diagnose`): the intervals this test was throwing away
             were `1719..1719`, `1814..1814`, `1905..1905` and `2019..9999` — a day at the Treaty of
             Nystad, a day at the Treaty of Kiel, a day at the dissolution of the union, and every
             date after data/cshapes.js's window ends. On those the era record places NOTHING here
             (`located` is 0), which is not «this ground was somewhere else»: it is «no record covers
             this instant». Withholding on it was withholding on the record's own seams, and it is
             how the first build lost 16 of its 25 countries — one unit failing at one instant empties
             the whole country's intersection.
             So a verdict is only ever formed where the record ANSWERS. Where it says nothing, the
             last verdict it did give stands. ⚠ That is not an assumption about the world: the first
             interval of every unit begins at the LATER of its own stated inception and its COUNTRY's
             (test 2), so an unanswered interval can never carry a verdict from before either. */
          /* ══ ⚠⚠ (hist-coverage-depth) AFTER THE ERA RECORD ENDS, THE PAGE DRAWS THE PRESENT-DAY MAP ══
             js/time-borders.js keeps the MODERN borders for every date after CShapes' window, and this
             outline set IS the present-day map's first level: on those dates the ground is in this unit's
             own country by the definition of the set, not by a guess. MEASURED 2026-10-05
             (`--only IND --diagnose`): India's set is complete only from 2020-01-26 (Dadra and Nagar Haveli
             and Daman and Diu), every one of its 36 units' first interval began after 2019-12-31, met
             «no record answers» with nothing behind it, and India was refused whole on every date. */
          const present = cur >= era.present;
          /* ⚠ (hist-coverage-depth) A UNIT SMALLER THAN THE SAMPLE GRID IS SAMPLED ON ITS OWN VERTICES — on
             its boundary — and for a coastal one about half of those lie in the sea of the coarser era
             outline (19.4 points per degree against the unit's ~100) by construction, not by history.
             MEASURED 2026-10-05 (`--only AUS --diagnose`): Jervis Bay Territory (0.16° × 0.08°, nine
             vertices) read `located 50% straddle 0%` on every date 1915-2019 and withheld all of
             Australia. LOCATED_MIN is a share of an INTERIOR lattice; on a boundary sample the era record
             answers as soon as it places any of it, and the straddle test below still decides. */
          const answered = present || (located > 0 && (pts.vertex || located / pts.length >= LOCATED_MIN));
          const ok = foreign ? false : present ? true : answered ? (located - best) / located <= STRADDLE_MAX : lastVerdict;
          if (!ok && !present && located === 0) silent.push([cur, stop]);
          if (foreign) { abroad.push([cur, stop]); stats.droppedAbroad++; }
          if (DIAG) console.error('    ' + u.code + ' ' + splitYmd(cur)[0] + '..' + splitYmd(stop)[0]
            + ' located ' + (located / pts.length * 100).toFixed(0) + '% straddle '
            + (located ? ((located - best) / located * 100).toFixed(0) : '—') + '% ' + (ok ? 'KEEP' : 'drop'));
          if (answered) lastVerdict = ok;
          if (ok) alive.push([cur, stop]);
          else if (foreign) { /* counted above */ }
          else if (!answered) stats.droppedUnlocated++;
          else stats.droppedStraddle++;
          cur = stop;
        }
      }
      /* merge the intervals the era map happened to split but the verdict did not */
      alive = union(alive, []);
      /* ══ ⚠⚠⚠ (hist-coverage-depth) GROUND NO POLITY IS DRAWN ON CANNOT MAKE A COUNTRY LOOK PARTIAL ══
         The whole-country rule exists for what the reader SEES: a country drawn with provinces over
         part of it. Where the era record places none of a unit's ground, the reader sees no country
         there at all — so that unit being silent is not a hole in the country, and it must not empty
         the country's intersection. MEASURED 2026-10-05 (`--only RUS --diagnose`): Natural Earth's
         `RU-X01~` — a nameless nine-vertex sliver at 67.1-67.4°E 68.8°N that the coarser era outline
         leaves in the sea — was `located 0%` on every date, and it withheld all 85 other units of
         Russia: 46,453 cells, the largest single hole in the 2019 first-level record.
         ⚠ ONLY `located === 0` QUALIFIES. A unit the era record places partly (Jervis Bay at 50%) is
         ground the reader sees under a country, and the rule stands for it. */
      if (!alive.length && !silent.length && !abroad.length) continue;

      /* ⚠⚠⚠ (#R730) WHAT THE RECORD ANSWERS IS COVERAGE, NOT A GAP. Test 4 below hands ground back
         to data/hist-admin{1,2,3}.js so nothing is drawn twice — but #R719 then intersected the
         WHOLE-COUNTRY rule over what survived it, so a single unit the record answers emptied the
         country. That is precisely Japan: OpenHistoricalMap holds 滋賀県 and nothing else, the fill
         fell silent for Shiga, the intersection went empty, and 1918 Japan shipped ONE prefecture.
         ⇒ the completeness test reads what the READER SEES — the fill's own intervals UNION the
         record's — while the emitted rows stay only the fill's half. */
      const alive3 = alive.map((iv) => iv.slice());
      const answeredIv = [];

      /* test 4 — the record's own units take the ground back for their own spans (`answeredSpans`). */
      /* (hist-reconstruction) a reconstructed row naming the SAME Wikidata item answers for this unit on its span,
         whatever the shapes' samples say — see reconSpansByItem() */
      const byItem = union((u.wd && u.wd.qid && reconSpans.get(u.wd.qid)) || [], (u.code && reconSpans.get('iso:' + u.code)) || []);
      for (const iv of union(answeredSpans(pts, box, rec, ymd(-999999, 1, 1), ymd(9999, 1, 1)).spans, byItem)) {
        answeredIv.push(iv);
        const before = alive.length;
        alive = subtract(alive, iv);
        if (alive.length !== before || !alive.length) stats.droppedOverlap++;
      }
      /* ⚠ A UNIT WHOSE WHOLE SPAN THE RECORD ANSWERS STAYS IN `live`. Dropping it here is what
         made `live.length === all.length` false and took the country with it. */
      const shown = union(alive3, answeredIv);
      const cover = union(union(shown, silent), abroad);
      if (!cover.length) continue;

      live.push({ u, polys, lives, alive, shown, cover, answeredIv });
    }

    /* ══ ⚠⚠⚠ THE WHOLE-COUNTRY RULE IS ABOUT THE OUTPUT, NOT THE INPUT ════════════════════════
       The first build applied it to the ADMISSION — «every unit of this country is dated» — and
       then let tests 3 and 4 silence units one at a time. Its own `--check` caught what that
       produces: ARM 7/11, CAN 3/13, ECU 2/24, UKR 17/25, USA 24/51 — a record answering PART of a
       country, which is the exact defect the reader reported and the exact thing this record was
       built not to create. So the surviving intervals are INTERSECTED across every unit of the
       country: a country is drawn on the dates where ALL of its units may be drawn, and on no
       others. A country whose intersection is empty ships nothing at all. */
    let whole = live.length === byCountry.get(iso3).all.length ? [[ymd(-122999, 1, 1), ymd(9999, 1, 1)]] : [];
    for (const L of live) whole = intersect(whole, L.cover);   /* (#R730) what the reader sees, both records together — (hist-coverage-depth) and where they see no country */
    if (!whole.length) { stats.droppedWhole += live.length; refused[iso3] = ['never-whole', stated(byCountry.get(iso3)), byCountry.get(iso3).all.length]; continue; }

    for (const L of live) {
      const spans = intersect(whole, L.alive);
      /* ⚠ (#R730) A UNIT THIS RECORD DRAWS NOTHING FOR IS NOT A HOLE — it is a unit the OHM record
         answers, and the reader sees it there. `--check` re-derives the whole-country rule from the
         shipped bytes, so the bytes have to SAY which units those are; otherwise the gate reads
         Japan as 46 of 47 and refuses the very thing this round fixed. */
      if (!spans.length) {
        /* (hist-coverage-depth) a unit the record answers is DEFERRED to it; one the era record never
           places while its country is drawn is UNPLACED — the reader sees no country over it */
        if (intersect(whole, L.answeredIv).length) deferred.add(L.u.code); else unplaced.add(L.u.code);
        continue;
      }
      const ringIx = L.polys.map((poly) => poly.map(poolRing));
      const en = L.u.f.n.split('|')[0];
      stats.units++;
      /* (hist-fill-never-whole) a row is one life's: it is cut where the item holding the code changes, and
         named by THAT item — Ludza Municipality 2009 and the Ludza Municipality of 2021 are two items with
         two sets of labels. Where two items' lives overlap, the later-founded one answers for the overlap. */
      let rest = spans;
      for (const life of [...L.lives].sort((a, b) => b.start - a.start)) {
        const mine = intersect(rest, [[life.start, life.end]]);
        if (!mine.length) continue;
        for (const iv of mine) rest = subtract(rest, iv);
        const qid = life.qid || L.u.wd.qid;
        for (const [s, e] of mine) {
          const [sy, sm, sd] = splitYmd(s), [ey, em, ed] = splitYmd(e);
          pending.push({ qid, row: [en, 4, sy, sm, sd, ey, em, ed, ringIx, { en }, L.u.code, iso3] });
          stats.rows++;
        }
        qids.push(qid);
      }
    }
  }

  /* names — the same join the tiers use, so one item names one unit in one way everywhere. */
  const labels = await labelsFor([...new Set(qids)], ROOT, (m) => process.stderr.write(m.endsWith('   ') ? m : m + '\n'));
  let filled = 0;
  for (const p of pending) {
    const lab = labels.get(p.qid);
    if (lab) { const got = labelsByTag(lab, SHIP, reg); for (const k of Object.keys(got)) if (!p.row[9][k]) { p.row[9][k] = got[k]; filled++; } }
    feats.push(p.row);
  }
  console.error('· names: ' + filled + ' columns filled from Wikidata in ' + SHIP.join(',') + ' (harvest set is ' + HARVEST.join(',') + ')');

  const drawnCodes = new Set(feats.map((f) => f[10]));
  const data = {
    v: 1,
    src: LICENCE,
    built: new Date().toISOString().slice(0, 10),
    tolerance: ne.tolerance,
    levels: [4],
    /* (#R730) the units this record deliberately leaves to data/hist-admin{1,2,3}.js, so the gate
       can re-derive «a country is answered whole» over what the READER sees rather than over one
       record's half of it. */
    /* ⚠ (hist-coverage-depth) ONE CODE, SEVERAL OUTLINES: Natural Earth carries New South Wales as the mainland
       AND Lord Howe Island under one `AU-NSW`. The record answers the mainland (deferred) while the fill draws the
       island — a code with ANY drawn row is drawn, and is never also listed as deferred or unplaced
       (tests/history-fidelity-checks.test.mjs #R730 ⑧ asks it by code). */
    deferred: [...deferred].filter((c) => !drawnCodes.has(c)).sort(),
    /* (hist-coverage-depth) units the era record places nowhere on every date their country is drawn:
       no country is drawn over them, so they are not a hole in one. `--check` re-verifies it. */
    unplaced: [...unplaced].filter((c) => !drawnCodes.has(c) && !deferred.has(c)).sort(),
    inception: inceptionOf(admitted, byCountry, spans),
    lives: livesOfCodes(admitted, byCountry, spans),
    /* (hist-coverage) the units dated through their HASC code rather than their ISO 3166-2 one */
    inceptionVia: inceptionViaOf(admitted, byCountry, spans),
    /* (hist-coverage) every country of the outline set this record does not draw, and why */
    refused: Object.fromEntries(Object.entries(refused).sort((a, b) => (a[0] < b[0] ? -1 : 1))),
    rings,
    feats,
  };
  fs.writeFileSync(OUT, 'window.' + GLOBAL + '=' + JSON.stringify(data) + ';\n');
  const bytes = fs.statSync(OUT).size;
  console.error('· wrote ' + path.relative(ROOT, OUT) + ' ' + (bytes / 1e6).toFixed(2) + ' MB | units ' + stats.units
    + ' | rows ' + stats.rows + ' | rings ' + rings.length);
  console.error('  withheld: ' + stats.droppedStraddle + ' interval(s) for straddling, ' + stats.droppedUnlocated
    + ' for ground the era record does not place, ' + stats.droppedOverlap + ' for ground the record already answers for, '
    + stats.droppedWhole + ' unit(s) because their country could not be answered whole on any date, '
    + stats.droppedAbroad + ' interval(s) for ground the era record places outside the unit’s own country');
  for (const y of [1700, 1800, 1900, 1950, 2000]) {
    const st = ymd(y, 6, 15);
    console.error('  in force ' + y + ': ' + feats.filter((f) => ymd(f[2], f[3], f[4]) <= st && ymd(f[5], f[6], f[7]) > st).length);
  }
}

/* ── check ──────────────────────────────────────────────────────────────────────────────────
   Offline, on the COMMITTED bytes. It re-derives nothing from upstream — the same rule
   scripts/build-hist-admin1.mjs's `--check` follows — and asks only what the file can be asked
   without the network. */
function check() {
  const fail = [];
  const ok = (cond, msg) => { if (!cond) fail.push(msg); };
  if (!fs.existsSync(OUT)) { console.error('✖ ' + path.relative(ROOT, OUT) + ' is missing'); process.exit(1); }
  const src = fs.readFileSync(OUT, 'utf8');
  const globals = [...src.matchAll(/^\s*window\.(__[A-Za-z0-9_$]+)\s*=/gm)].map((m) => m[1]);
  ok(globals.length === 1 && globals[0] === GLOBAL, 'the file must define exactly ' + GLOBAL + ' (found ' + globals.join(',') + ')');
  const w = {}; vm.runInNewContext(src, { window: w });
  const d = w[GLOBAL];
  ok(d && d.v === 1, 'v must be 1');
  ok(/Natural Earth/i.test(d.src || ''), 'src must name Natural Earth');
  ok(/public domain/i.test(d.src || ''), 'src must name the outline licence');
  ok(/Wikidata/i.test(d.src || '') && /CC0/.test(d.src || ''), 'src must name Wikidata and its licence');
  ok(/^\d{4}-\d\d-\d\d$/.test(d.built || ''), 'built must be an ISO date');
  ok(Number.isFinite(d.tolerance) && d.tolerance > 0, 'tolerance must be a finite positive number');

  for (let i = 0; i < d.rings.length; i++) {
    const r = d.rings[i];
    if (!Array.isArray(r) || r.length < 4) { fail.push('ring ' + i + ' has fewer than 4 points'); break; }
    const a = r[0], z = r[r.length - 1];
    if (a[0] !== z[0] || a[1] !== z[1]) { fail.push('ring ' + i + ' is not closed'); break; }
    let bad = false;
    for (const p of r) if (!(Math.abs(p[0]) <= 180.001 && Math.abs(p[1]) <= 90.001)) { bad = true; break; }
    if (bad) { fail.push('ring ' + i + ' leaves the globe'); break; }
  }
  const used = new Set();
  for (let i = 0; i < d.feats.length; i++) {
    const f = d.feats[i];
    if (f.length !== 12) { fail.push('feat ' + i + ' has ' + f.length + ' columns, not 12'); break; }
    if (!ISO2.test(String(f[10] || ''))) { fail.push('feat ' + i + ' carries no ISO 3166-2 code — the whole-country rule cannot be re-derived from a name'); break; }
    if (!/^[A-Z]{2,3}$/.test(String(f[11] || ''))) { fail.push('feat ' + i + ' carries no country code'); break; }
    if (!f[0]) { fail.push('feat ' + i + ' has no name'); break; }
    if (f[3] < 1 || f[3] > 12 || f[6] < 1 || f[6] > 12 || f[4] < 1 || f[4] > 31 || f[7] < 1 || f[7] > 31) { fail.push('feat ' + i + ' has an impossible month or day'); break; }
    const s = f[2] * 10000 + f[3] * 100 + f[4], e = f[5] * 10000 + f[6] * 100 + f[7];
    if (!(s < e)) { fail.push('feat ' + i + ' ends before it starts'); break; }
    let bad = false;
    for (const poly of f[8]) for (const ri of poly) { if (!(ri >= 0 && ri < d.rings.length)) { bad = true; break; } used.add(ri); }
    if (bad) { fail.push('feat ' + i + ' points outside the ring pool'); break; }
    if (!f[9] || !f[9].en) { fail.push('feat ' + i + ' has no English name'); break; }
  }
  ok(used.size === d.rings.length, 'every pooled ring must be used (' + used.size + ' of ' + d.rings.length + ')');

  /* ⚠ THE INVARIANT THIS FILE EXISTS FOR: a row may never be drawn before the date Wikidata
     states, and the WHOLE-COUNTRY rule means a country is either answered completely or not at
     all. The first is carried by the row itself; the second is re-derived here from the shipped
     outline set, because a build that quietly admitted a partly-dated country would reproduce the
     very defect this record was made to remove. */
  const ne = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'data', 'admin1-world.json.gz'))));
  /* ⚠ JOINED BY THE CODE, NOT BY THE NAME. Natural Earth's unit names repeat across countries, and
     the first version of this check counted a namesake in an answered country as an answer for a
     country nobody answers for. */
  const drawn = new Set(d.feats.map((f) => f[10]));
  const defer = new Set(d.deferred || []);
  /* (hist-coverage-depth) a unit the era record places nowhere while its country is drawn is not a hole the
     reader can see — it counts toward «answered whole», and it may never also be drawn */
  const unplaced = new Set(d.unplaced || []);
  for (const code of unplaced) if (drawn.has(code) || defer.has(code)) { fail.push(code + ' is listed as unplaced and also drawn or deferred'); break; }
  const byC = new Map();
  for (const f of ne.f) {
    const code = f.n.split('|').find((p) => ISO2.test(p)) || null;
    const c = byC.get(f.i) || { all: 0, drawn: 0, deferred: 0 };
    c.all++; if (code && drawn.has(code)) c.drawn++; else if (code && defer.has(code)) c.deferred++; else if (code && unplaced.has(code)) c.deferred++;
    byC.set(f.i, c);
  }
  const partial = [...byC].filter(([, c]) => (c.drawn || c.deferred) && c.drawn + c.deferred < c.all)
    .map(([k, c]) => k + ' ' + (c.drawn + c.deferred) + '/' + c.all);
  ok(!partial.length, 'a country is answered completely or not at all; partly answered: ' + partial.join(', '));
  /* ⚠ AND «DEFERRED» IS CHECKED, NOT TRUSTED. A build could satisfy the line above by listing every
     missing code, so each deferred unit must really be covered by the record it was deferred to:
     its outline's own interior points are tested against data/hist-admin{1,2,3}.js. */
  /* ⚠ THE GEOMETRY HALF RUNS WHERE THE RECORD IS, AND SAYS WHICH HALF RAN. The bundles it reads are
     82 MB, so a synthetic world (tests/history-admin-coverage-gate-checks.test.mjs (#R719)) holds the outline set and this
     record and nothing else — the same split build-hist-kuni.mjs states for its raster. */
  const recFiles = recordFiles();
  if (defer.size && !recFiles.length) console.log('· ' + defer.size + ' deferred unit(s) not verified against the record — data/hist-admin*.js is not on disk');
  if (defer.size && recFiles.length) {
    const recPolys = [];
    for (const rel of recFiles) {
      const dd = loadBundle(rel).data;
      for (const r of dd.feats) recPolys.push(r[8].map((poly) => poly.map((ri) => dd.rings[ri])));
    }
    const orphan = [];
    for (const code of defer) {
      /* ⚠ (hist-coverage-depth) ONE CODE CAN BE SEVERAL OUTLINES. Natural Earth carries Metro Manila as four
         polygons that all say PH-MNL; the build defers whichever of them the record answers, and asking only the
         FIRST one (`find`) reported a covered unit as an orphan. Every outline with the code is asked. */
      const units = ne.f.filter((f) => String(f.n || '').split('|').includes(code));
      if (!units.length) { orphan.push(code + ' (no outline)'); continue; }
      const covered = units.some((unit) => {
        const g = unit.g;
        const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
          .map((poly) => poly.filter((r) => r && r.length >= 4)).filter((pp) => pp.length);
        const pts = polys.length ? samplePoints(polys) : [];
        return pts.some((pt) => recPolys.some((polys) => inPolys(polys, pt[0], pt[1])));
      });
      if (!covered) orphan.push(code);
    }
    ok(!orphan.length, orphan.length + ' unit(s) are deferred to the record but no record row covers them: ' + orphan.slice(0, 8).join(', '));
  }
  /* …and the row's own country column must agree with the outline set it was taken from */
  const isoOf = new Map();
  for (const f of ne.f) { const code = f.n.split('|').find((p) => ISO2.test(p)); if (code) isoOf.set(code, f.i); }
  for (const f of d.feats) if (isoOf.get(f[10]) && isoOf.get(f[10]) !== f[11]) { fail.push('feat for ' + f[10] + ' says country ' + f[11] + ', the outline set says ' + isoOf.get(f[10])); break; }

  const answered = [...byC].filter(([, c]) => c.drawn + c.deferred === c.all && c.all).length;
  if (fail.length) { for (const m of fail) console.error('✖ ' + m); process.exit(1); }
  const span = d.feats.reduce((a, f) => [Math.min(a[0], f[2]), Math.max(a[1], f[5])], [Infinity, -Infinity]);
  console.log('✓ hist-admin-fill — ' + d.feats.length + ' rows over ' + drawn.size + ' units in ' + answered
    + ' countries, ' + d.rings.length + ' pooled rings, ' + span[0] + '…' + span[1]
    + '; every ring used, every country answered whole, no row before its stated inception');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (args.includes('--check')) check();
  else if (args.includes('--redate')) redate().catch((e) => { console.error('FAILED', e); process.exit(1); });
  else main().catch((e) => { console.error('FAILED', e); process.exit(1); });
}
