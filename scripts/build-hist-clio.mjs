#!/usr/bin/env node
/* ============================================================================
 *  IntMap · data/hist-clio.js + data/hist-eras-rest.js — the world before 1886 as ONE composition
 * ----------------------------------------------------------------------------
 *  「歴史地図の coverage を徹底的に増強しろ。まだ不十分な時代や地域もある。より広く、より正確に。」
 *
 *  ══ WHAT WAS WRONG, MEASURED (2026-10-04, 0.5° grid, cos-latitude weighted, Natural Earth 50 m land) ══
 *  Below CShapes the map was ONE record per instant, chosen by band:
 *      1689–1885  OpenHistoricalMap's admin_level=2 relations (data/hist-borders.js), day-exact
 *      < 1689     the nearest of aourednik/historical-basemaps' 54 dated sheets (data/hist-eras.js)
 *  and the band decided, not the ground. Two holes followed from that rule and neither was a hole in
 *  what open data knows:
 *    · 1689–1885: OHM states 60.2% of the land in 1689, 66.7% in 1750, 71.8% in 1800 — and the map
 *      drew NOTHING on the rest, although the sheets beneath state 70–85% for the same years and
 *      Seshat's Cliopatria states the Maratha, Qing, Dzungar, Ashanti, Oyo, Darfur, Bornu… that OHM
 *      does not. Composed, the same years reach 80.6% / 82.0% / 85.4%.
 *    · before 1689: a sheet answers every year between its neighbours. The 1200 sheet drew 1200–1239,
 *      before the Mongol conquests; the 1400 sheet drew a century; below AD 1000 every sheet a century.
 *      Cliopatria's rows are dated to the YEAR (median row span 8 years, 13,412 polity rows, 1,637
 *      polities, 3400 BC–2024) — its Mongol Empire is drawn in 1206 and its Ilkhanate in 1256.
 *
 *  ══ THE RULE — A COMPOSITION BY PRECISION, DECIDED ON THE GROUND ══════════════════════════════
 *  At any instant before 1886 three records answer, in this order, and each draws ONLY the ground the
 *  records above it do not state at that instant:
 *      1. OpenHistoricalMap (1689–1885, day-exact)       data/hist-borders.js   — unchanged
 *      2. Cliopatria (−3400…1885, year-exact)            data/hist-clio.js      — this file
 *      3. historical-basemaps sheets (nearest sheet)     data/hist-eras-rest.js — this file
 *  The subtraction is done HERE, at build time, so the page draws the union of three records and makes
 *  no geometric decision of its own (js/time-borders.js `compositeAt`), and the gate measures the
 *  same three files (scripts/hist-fidelity.mjs `politiesAt`). One rule, written once, in the data.
 *  ⚠ From 1886 CShapes is the record above, and Cliopatria draws only the ground CShapes leaves (the interior
 *    of Africa before the partition, measured: CShapes puts 75.7% of the land inside a polity on 1 July 1886).
 *    The sheets are not used from 1886: CShapes and Cliopatria answer there.
 *  ⚠ (hist-colonial-era-borders) …and between them, from 1886 to LATE_TOP, OpenHistoricalMap: CShapes states sovereign
 *    states, so on 1886-01-01 the colonial blocs OHM states (the Congo Free State, German East Africa, Greenland under
 *    Denmark…) left the map. `--ohm-late` cuts OHM's relations on CShapes' days against CShapes into
 *    data/hist-borders-late.js, and Cliopatria is cut against CShapes ∪ that file. After 1886 the page draws
 *        CShapes (day) → OpenHistoricalMap where CShapes is silent (day, to LATE_TOP) → Cliopatria (year).
 *
 *  ══ WHAT IS SUBTRACTED, AND AT WHICH INSTANT ════════════════════════════════════════════════════
 *  · Cliopatria − OHM: a Cliopatria row that overlaps the OHM band is split at every date on which the
 *    set of OHM relations touching it changes, and each piece is the row minus those relations. OHM's
 *    dates are days, so the pieces carry days — the composition is day-exact wherever OHM is.
 *  · sheet − (OHM ∪ Cliopatria): a sheet is the source's picture of ONE year, so it is subtracted at
 *    that year (15 June, the instant js/chronos.js `setYear` names). Between sheets the records above
 *    move and the sheet does not — at a moving frontier the two may overlap or leave a seam for the
 *    years until the next sheet. That residue is the sheet's resolution, which it had before.
 *  · what is left of a polygon is kept when it is a piece of ground rather than the disagreement of two
 *    hands drawing one border (`sliver`, below) — however little of the polygon that is. ⚠ A first version
 *    also dropped any polygon left with under a quarter of itself («the record above answered for it»), and
 *    measured on the gate's own grid that LOST land: 1500 fell from 73.8% to 72.2% of the world inside a
 *    polity, because the quarter that was left is ground the record above does NOT state. Nothing above
 *    answered for it, so the record below still does.
 *
 *  ══ WHAT IS NOT TAKEN FROM CLIOPATRIA ══════════════════════════════════════════════════════════
 *  · RELATION rows (385: alliances, allegiances, personal unions) — they state a relationship between
 *    polities, not who held the ground; drawing them would draw the ground twice.
 *  ⚠ parenthesised aggregates «(Holy Roman Empire)», «(Kingdom of France)» ARE taken, as REALMS: the union
 *    of member rows that are polities of their own. They are written without the brackets and marked
 *    `r: 1`; each member carries the realm's name as `of`. The page draws both (the Empire's outline and
 *    name over its principalities), and the measure counts the members' ground once.
 *  ⚠ Cliopatria writes BC years as negative HISTORICAL numbers and also uses 0 between −1 and 1
 *    (Roman Empire −14…0 then 1…5; Han Dynasty from −202 = 202 BC, its founding). IntMap's clock is
 *    astronomical, so y < 0 → y + 1 and 0 stays 0 (no row starts at 0; six end there = 1 BC).
 *
 *      node scripts/build-hist-clio.mjs --fetch     # download the pinned release into the cache (network)
 *      node scripts/build-hist-clio.mjs             # build both bundles from the cache
 *      node scripts/build-hist-clio.mjs --check     # the committed files' invariants (offline)
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import pc from 'polygon-clipping';
import { simplifyRing, ringArea } from './histborders/geom.mjs';
import { CLIOPATRIA, AOUREDNIK_BASEMAPS, OPENHISTORICALMAP } from './lib/upstream-cadence.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'hist-clio.js');
const REST = join(ROOT, 'data', 'hist-eras-rest.js');
const HB = join(ROOT, 'data', 'hist-borders.js');
const ER = join(ROOT, 'data', 'hist-eras.js');
const CACHE = process.env.INTMAP_CLIO_CACHE || join(tmpdir(), 'intmap-clio-cache');

/* ⚠ THE RELEASE IS PINNED BY COMMIT AND BY HASH. A rebuild against a moved upstream would be a
   different record under the same name; bumping these two lines is the whole of an update. */
export const UPSTREAM = {
  repo: 'Seshat-Global-History-Databank/cliopatria',
  release: 'v0.2.1',
  commit: '5f433377139a6eeaeacbdc894b70f8805b72c8b5',
  file: 'cliopatria.geojson.zip',
  sha256: 'e10a4e429fca708788ff9e7572a95fce801fae55852d217cffabc1c59cd4eed4',
  member: 'cliopatria_polities_only_v021.geojson',
};
const ZIP_URL = `https://github.com/${UPSTREAM.repo}/raw/${UPSTREAM.commit}/${UPSTREAM.file}`;
export const CREDIT_ROW = 'Cliopatria — Seshat Global History Databank (CC BY 4.0)';
export const CITATION = 'Bennett, J. S. et al. Cliopatria — A geospatial database of world-wide political entities from 3400BCE to 2024CE. Scientific Data 12, 313 (2025). doi:10.1038/s41597-025-04516-9';
export const SRC = `Cliopatria ${UPSTREAM.release} (Seshat Global History Databank, github.com/${UPSTREAM.repo}) · CC BY 4.0 · adapted by IntMap: simplified, BC years made astronomical, and the ground OpenHistoricalMap (1689–1885, and from 1886 where CShapes is silent) and CShapes (1886–2019) state removed on their own dates`;
export const REST_SRC = 'aourednik/historical-basemaps (github.com/aourednik/historical-basemaps) · GPL-3.0 · adapted by IntMap: each sheet before 1886 less the ground OpenHistoricalMap and Cliopatria state at that sheet\'s year';

export const GOVERNANCE = {
  'data/hist-clio.js': {
    publisher: 'Seshat Global History Databank (Cliopatria)',
    url: `https://github.com/${UPSTREAM.repo}`,
    ...CLIOPATRIA,
    builtBy: 'scripts/build-hist-clio.mjs',
  },
  'data/hist-eras-rest.js': {
    publisher: 'aourednik/historical-basemaps',
    url: 'https://github.com/aourednik/historical-basemaps',
    ...AOUREDNIK_BASEMAPS,
    builtBy: 'scripts/build-hist-clio.mjs',
  },
  /* (hist-colonial-era-borders) OpenHistoricalMap's relations on CShapes' days, less CShapes' ground — see `ohmLate` */
  'data/hist-borders-late.js': {
    publisher: 'OpenHistoricalMap',
    ...OPENHISTORICALMAP,
    builtBy: 'scripts/build-hist-clio.mjs',
  },
};

/* ⚠ FACTS ABOUT THE NEIGHBOURS, NOT CHOICES. CShapes begins 1886-01-01 (js/time-borders.js CS_MIN,
   scripts/build-hist-borders.mjs Y_MAX + 1), so nothing here is drawn from that day. The OHM band is
   read out of data/hist-borders.js's own `window`, never typed. */
/* (hist-coverage-expansion, CShapes band) the composition reaches through CShapes too: from 1886 CShapes is the
   record above and Cliopatria draws only the ground it leaves (measured 2026-10-04: CShapes puts 75.7% of the
   world's land inside a polity on 1 July 1886 against 84.2% for the composition at 1850 — the interior of
   Africa before the partition). The top is CShapes' own last day, read from the bundle, never typed. */
const CSF = join(ROOT, 'data', 'cshapes.js');
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
export const unymd = (k) => { const y = Math.floor(k / 10000), r = k - y * 10000; return [y, Math.floor(r / 100), r % 100]; };
export const astro = (y) => (y < 0 ? y + 1 : y);

/* ⚠⚠ THE TOLERANCE IS THE NEIGHBOUR'S. data/hist-eras.js — the record whose sheets this one replaces
   year by year — is rounded to 3 decimals and simplified by one grid cell (scripts/build-hist-eras.mjs
   DEC/TOL), and a reader steps between the two at every sheet year. A finer record here would make
   the coastline sharpen and blur as the clock moved. The --sweep table:
       observed 2026-10-04 on v0.2.1 (13,412 polity rows → 10,920 leaf rows ≤ 1885):
       see `sweep()` output recorded in dev-notes/2026-10-04-hist-coverage-expansion.md
   expires: when data/hist-eras.js changes its DEC/TOL; canon: scripts/build-hist-eras.mjs. */
const DEC = 3;
const TOL = Math.pow(10, -DEC) * 2;
const MIN_AREA = Math.pow(10, -DEC) * Math.pow(10, -DEC) * 4;   /* a ring of a few grid cells is noise after rounding */

/* ⚠⚠ WHAT IS LEFT AFTER SUBTRACTION, AND WHEN IT IS GROUND. Two records digitised by different hands
   never draw a shared border on the same line, so «A − B» always leaves a ribbon along every border A
   and B share. A ribbon is not a claim to ground: its MEAN WIDTH (2·area / perimeter) is the distance
   between the two drawings, and that is bounded by how coarsely the coarser record was drawn.
       observed 2026-10-04 (this builder, --measure, 0.025° bins of the 769,000 pieces the subtractions
       left): the counts fall steeply from 536,270 under 0.025° to 3,177 at 0.150° and 1,247 at 0.175°,
       reach their minimum at 0.200–0.225° (532), and rise again to a second population (1,484 at
       0.225°, 1,009 at 0.250°) — ribbons below the valley, ground above it.
       SLIVER_W = 0.200° is the valley's lower edge (≈ 22 km at the equator).
   expires: when either record is re-digitised at a different scale, or the minimum moves when this is
   re-measured; canon: here. */
const SLIVER_W = 0.2;

const MLEN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/* ── geometry ─────────────────────────────────────────────────────────────── */
const r3 = (v) => +v.toFixed(DEC);
function cleanRing(ring) {
  let r = ring;
  if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r = r.slice(0, -1);
  const s = r.length >= 4 ? simplifyRing(r, TOL) : r;
  if (!s) return null;
  const out = [];
  for (const p of s) { const q = [r3(p[0]), r3(p[1])]; const l = out[out.length - 1]; if (!l || l[0] !== q[0] || l[1] !== q[1]) out.push(q); }
  while (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  if (out.length < 3 || Math.abs(ringArea(out)) < MIN_AREA) return null;
  return out;
}
/* polygons → [[ring, …], …] simplified and rounded, holes kept, empties dropped */
function cleanPolys(polys) {
  const out = [];
  for (const poly of polys) {
    const shell = cleanRing(poly[0]); if (!shell) continue;
    const p = [shell]; for (const h of poly.slice(1)) { const c = cleanRing(h); if (c) p.push(c); }
    out.push(p);
  }
  return out;
}
const closed = (r) => r.concat([r[0]]);
const toPC = (polys) => polys.map((p) => p.map(closed));
const fromPC = (mp) => mp.map((p) => p.map((r) => r.slice(0, -1)));
const polyAreaOf = (p) => p.reduce((a, r, k) => a + (k ? -1 : 1) * Math.abs(ringArea(r)), 0);
const areaOf = (polys) => polys.reduce((a, p) => a + polyAreaOf(p), 0);
const perimOf = (p) => { let s = 0; for (const r of p) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += Math.hypot(a[0] - b[0], a[1] - b[1]); } return s; };
/* mean width of a piece: 2A / P — a ribbon's width, a country's half-breadth */
const meanWidth = (p) => { const P = perimOf(p); return P > 0 ? 2 * polyAreaOf(p) / P : 0; };
function bboxOf(polys) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (const p of polys) for (const q of p[0]) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
  return [x0, y0, x1, y1];
}
const meets = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
/* ⚠⚠ WHICH NEIGHBOURS ARE CUTTERS AT ALL — ASKED OF THE GROUND, NOT OF THE BOX. A row is split at every
   date on which the set of OHM relations it meets changes, and «meets» by bounding box made every border
   adjustment anywhere near a large polity a new piece and a new subtraction (measured on the first run:
   the Russian Empire's box meets most of Eurasia's relations). Two records only claim the same ground
   when their outlines share interior, and a shared BORDER drawn by two hands shares only a ribbon
   (see SLIVER_W). So the question is put to a grid of cell centres: a neighbour is a cutter when it
   holds at least CUT_CELLS of the row's centres — a ribbon narrower than SLIVER_W (0.15°) cannot hold
   a run of 0.25° centres, a province can.
       observed 2026-10-04: see the build log's «cutters kept / ignored» line, recorded in the dev-note.
   expires: when GR or SLIVER_W changes; canon: here. */
const GR = 0.25, GNX = 360 / GR, GNY = 180 / GR, CUT_CELLS = 3;
function cellsOf(polys) {
  const out = [];
  for (const poly of polys) {
    const bb = bboxOf([poly]);
    const j0 = Math.max(0, Math.floor((90 - bb[3]) / GR)), j1 = Math.min(GNY - 1, Math.floor((90 - bb[1]) / GR));
    for (let j = j0; j <= j1; j++) {
      const y = 90 - (j + 0.5) * GR, xs = [];
      for (const ring of poly) for (let k = 0, n = ring.length, l = n - 1; k < n; l = k++) {
        const a = ring[k], b = ring[l];
        if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((u, v) => u - v);
      for (let q = 0; q + 1 < xs.length; q += 2) {
        const ia = Math.max(0, Math.ceil((xs[q] + 180) / GR - 0.5)), ib = Math.min(GNX - 1, Math.floor((xs[q + 1] + 180) / GR - 0.5));
        for (let i = ia; i <= ib; i++) out.push(j * GNX + i);
      }
    }
  }
  return Int32Array.from(new Set(out));
}
const MASK = new Uint8Array(GNX * GNY);
const CUTSTAT = { kept: 0, ignored: 0 };
/* the neighbours (each with .cells) that hold at least CUT_CELLS of these cells — or all of them when the
   piece is smaller than a cell (a city-state: the box is then the only measure there is) */
function cuttersOf(cells, cands) {
  if (cells.length < CUT_CELLS) return cands;
  for (const c of cells) MASK[c] = 1;
  const out = [];
  for (const o of cands) { let n = 0; for (const c of o.cells) { if (MASK[c] && ++n >= CUT_CELLS) break; } if (n >= CUT_CELLS) { out.push(o); CUTSTAT.kept++; } else CUTSTAT.ignored++; }
  for (const c of cells) MASK[c] = 0;
  return out;
}
/* ⚠ A CUTTER IS CUT TO THE PIECE'S BOX FIRST (Sutherland–Hodgman against each side). A subtraction's cost
   is the vertices of both operands, and a continent-sized neighbour touching one corner of a duchy would
   otherwise be paid for in full, every time. Nothing outside the box can change the result. */
function clipRing(ring, [x0, y0, x1, y1]) {
  let pts = ring;
  const sides = [[(p) => p[0] >= x0, (a, b) => [x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0])]],
                 [(p) => p[0] <= x1, (a, b) => [x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])]],
                 [(p) => p[1] >= y0, (a, b) => [a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0]],
                 [(p) => p[1] <= y1, (a, b) => [a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1]]];
  for (const [inside, cross] of sides) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i];
      if (inside(b)) { if (!inside(a)) out.push(cross(a, b)); out.push(b); }
      else if (inside(a)) out.push(cross(a, b));
    }
    pts = out; if (pts.length < 3) return null;
  }
  return pts;
}
function clipPolys(polys, bb) {
  const pad = 0.01, box = [bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad], out = [];
  for (const p of polys) { const sh = clipRing(p[0], box); if (!sh || Math.abs(ringArea(sh)) < MIN_AREA) continue;
    const q = [sh]; for (const h of p.slice(1)) { const c = clipRing(h, box); if (c && Math.abs(ringArea(c)) >= MIN_AREA) q.push(c); } out.push(q); }
  return out;
}

const STATS = { clipped: 0, failed: 0, widths: [] };
/* polys − cutters → what is ground, or null when nothing is left worth drawing */
function subtract(polys, cutters0, area0) {
  const bb = bboxOf(polys), cutters = cutters0.map((c) => clipPolys(c, bb)).filter((c) => c.length);
  if (!cutters.length) return polys;
  let res;
  try { res = pc.difference(toPC(polys), ...cutters.map(toPC)); STATS.clipped++; }
  catch (e) { STATS.failed++; return polys; }   /* ⚠ counted and reported: an unclipped piece overlaps, it does not vanish */
  const kept = [];
  for (const p of fromPC(res)) {
    const c = cleanPolys([p]); if (!c.length) continue;
    const w = meanWidth(c[0]); STATS.widths.push(w);
    if (w >= SLIVER_W) kept.push(c[0]);
  }
  if (!kept.length) return null;
  return kept;
}

/* ══ ⚠⚠⚠ A QID CLIOPATRIA WRITES IS NOT ALWAYS THE POLITY IT DRAWS (historical-verification.md §4-3) ══════
   Measured 2026-10-04 against Wikidata (scripts/histclio/wikidata.json): of 1,589 name–QID pairs, 115 are
   drawn more than 25 years after the item's own dissolution and 114 more than 25 years before its
   inception, and most of those are not dates at all but ANOTHER ITEM: the Zhou state «Lu» is bound to
   Aq Qoyunlu (1378), the Warring States «Song» to the Song dynasty (960), «Kingdom of France» from 990 to
   the Bourbon Restoration (1815–1830), «Joseon» to Gojoseon, «Syria» to the Assyrian Empire. The QID is
   what the names table translates by (data/histnames.json `byQid`) and what the card links, so an
   unverified one would label the state of Lu «アク・コユンル».
   ⇒ A QID is SHIPPED only when it is shown to be the unit:
      · Wikidata states a lifespan for it, and that lifespan meets the span Cliopatria draws the name over
        (any overlap — the QID of the right polity cannot be disjoint from it); or
      · Wikidata states no lifespan, and its English label is the name Cliopatria writes (folded:
        case, accents, punctuation, a leading «the»).
   Otherwise the row ships with no QID — it keeps its name and its Wikipedia article, and loses only the
   identifier nobody could vouch for. The gate re-decides every shipped QID from the committed facts. */
const fold = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
export function verifiedQid(qid, name, span, facts) {
  if (!qid) return false;
  const f = facts[qid];
  if (!f) return false;
  const s = f.s && f.s.length ? Math.min(...f.s) : null, e = f.e && f.e.length ? Math.max(...f.e) : null;
  if (s == null && e == null) return !!f.l && fold(f.l) === fold(name);
  return (e == null || span[0] <= e) && (s == null || span[1] >= s);
}
export const FACTS = join(ROOT, 'scripts', 'histclio', 'wikidata.json');
const readFacts = () => JSON.parse(readFileSync(FACTS, 'utf8')).facts;
const readWiki = () => JSON.parse(readFileSync(FACTS, 'utf8')).wiki || {};

/* ══ WHEN CLIOPATRIA DRAWS A NAME OUTSIDE THE POLITY'S LIFE (historical-verification.md §2-2) ══════════
   A verified QID's own lifespan is a second statement about the same polity, and where the two differ by
   more than FINDING_SLACK years the difference is a FINDING — the machine does not decide which is
   history. scripts/histclio/review.json judges: `rows` (the name is withheld before the year history
   places the beginning, `s`, and/or after the year it places the end, `e`, and/or inside a `gaps` span
   [from, to] — two lives under one name with the years between them belonging to neither; the shape
   stays, as Cliopatria drew it), `refuted` (examined, not applied, with the
   reason), `pending` (not yet judged — drawn as Cliopatria states, and counted). The gate fails on any
   finding in none of the three, so the next release arrives already counted.
     observed 2026-10-04: with verified QIDs, 79 names are drawn more than 25 years after Wikidata's
     dissolution and 52 before its inception; FINDING_SLACK = 25 is one generation — inside it, the two
     records disagree about a reign or a treaty, not about whether the polity existed.
   expires: when the review is redone at another resolution; canon: here. */
const FINDING_SLACK = 25;
export const REVIEW = join(ROOT, 'scripts', 'histclio', 'review.json');
/* the findings of shipped rows: [{ name, q, side, drawn, wd }] — named rows only (a withheld row says no name) */
export function findingsOf(feats, facts) {
  const by = new Map();
  for (const f of feats) { if (!f[0].en || !f[1]) continue; const k = f[0].en + '|' + f[1], o = by.get(k) || { name: f[0].en, q: f[1], a: Infinity, b: -Infinity };
    o.a = Math.min(o.a, f[2]); o.b = Math.max(o.b, f[5] - 1); by.set(k, o); }
  const out = [];
  for (const o of by.values()) {
    const x = facts[o.q]; if (!x) continue;
    const s = x.s && x.s.length ? Math.min(...x.s) : null, e = x.e && x.e.length ? Math.max(...x.e) : null;
    if (e != null && o.b > e + FINDING_SLACK) out.push({ name: o.name, q: o.q, side: 'end', drawn: o.b, wd: e });
    if (s != null && o.a < s - FINDING_SLACK) out.push({ name: o.name, q: o.q, side: 'start', drawn: o.a, wd: s });
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.side < b.side ? -1 : 1));
}
/* the sides a review entry judges: a row judges the side(s) it bounds (`s` start, `e` end); a refuted
   entry judges its `side`, or both when it names none. A finding is judged by name AND side, so one
   name can be bounded on one side and refuted on the other (Kingdom of Poland).
   A `gaps` span judges the END side: the finding it answers is «the name is drawn after its item's
   end», and the answer is that the item did end there and the name drawn after the gap is a second
   life (Emirate of Nejd: the item is the Second Saudi State, ended 1891; Ibn Saud's state from 1902). */
const bounds = (r) => r.s != null || r.e != null || (Array.isArray(r.gaps) && r.gaps.length > 0);
export const judgedSides = (r) => (bounds(r) ? [r.s != null && 'start', (r.e != null || (r.gaps && r.gaps.length)) && 'end'].filter(Boolean) : r.side ? [r.side] : ['start', 'end']);
export const judgedKeys = (review) => new Set([...review.rows, ...review.refuted].flatMap((r) => judgedSides(r).map((x) => r.name + '|' + x)));
/* the zones of the timeline a review row cuts, in order, each [from, to) as sortable YYYYMMDD with what the
   name does there: before 1 January of `s` (the first year history places the polity in) withheld as
   'start'; from 1 January of the year after `e` (the last) withheld as 'end'; and each `gaps` span
   [a, b] — inclusive, astronomical — withheld from 1 January of `a` to 1 January of `b + 1` as 'gap',
   bounded by the last year of the first life (a − 1) and the first of the second (b + 1). Between
   them the name is drawn. One function, so the builder and the gate cut the same timeline. */
export function reviewZones(R) {
  const lo = R.s != null ? ymd(R.s, 1, 1) : -Infinity, hi = R.e != null ? ymd(R.e + 1, 1, 1) : Infinity, z = [];
  if (lo > -Infinity) z.push({ s: -Infinity, e: lo, side: 'start', y: R.s });
  let at = lo;
  for (const [a, b] of R.gaps || []) {
    const gs = Math.max(ymd(a, 1, 1), lo), ge = Math.min(ymd(b + 1, 1, 1), hi);
    if (gs >= ge) continue;
    if (at < gs) z.push({ s: at, e: gs, side: null });
    z.push({ s: gs, e: ge, side: 'gap', y: a - 1, y2: b + 1 }); at = ge;
  }
  if (at < hi) z.push({ s: at, e: hi, side: null });
  if (hi < Infinity) z.push({ s: hi, e: Infinity, side: 'end', y: R.e });
  return z;
}
/* the rows a review row withholds the name of — each row cut at the zones above. The shape stays; the
   name does not, and the withheld piece says which side and which year(s) history gives. */
function applyReview(rows, review) {
  const by = new Map(review.rows.map((r) => [r.name, r]));
  const out = [];
  for (const r of rows) {
    const R = by.get(r.name);
    if (!R || !bounds(R)) { out.push(r); continue; }
    for (const z of reviewZones(R)) {
      const s = Math.max(r.s, z.s), e = Math.min(r.e, z.e);
      if (s >= e) continue;
      if (!z.side) { out.push({ ...r, s, e }); continue; }
      const wm = { ...r.meta, wn: r.name, ws: z.side, wy: z.y }; if (z.side === 'gap') wm.wz = z.y2;
      if (R.wd) wm.wq = R.wd; if (R.circa && z.side !== 'gap') wm.wc = 1;
      out.push({ ...r, name: '', qid: null, meta: wm, s, e });
    }
  }
  return out;
}

/* ── the neighbours ──────────────────────────────────────────────────────── */
const evalBundle = (file, g) => { const w = {}; new Function('window', readFileSync(file, 'utf8'))(w); return w[g]; };
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
/* the day after an inclusive end, as a sortable YYYYMMDD (proleptic Gregorian; no Date.UTC — see build-hist-borders) */
function dayAfter(y, m, d) { const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; const n = m === 2 && leap ? 29 : MLEN[m - 1];
  return d < n ? ymd(y, m, d + 1) : m < 12 ? ymd(y, m + 1, 1) : ymd(y + 1, 1, 1); }
/* the records ABOVE Cliopatria at any instant: OpenHistoricalMap's relations (1689–1885, end exclusive) and
   CShapes' states (1886–, end inclusive → the day after). They meet at 1886-01-01 and never overlap in time. */
function ohmRows() {
  const c = evalBundle(CSF, '__CSHAPES');
  let top = -Infinity;
  const cs = c.feats.map((f) => { const polys = cleanPolys(f[8].map((p) => p.map((ri) => c.rings[ri]))); const e = dayAfter(f[5], f[6], f[7]); if (e > top) top = e;
    return { s: ymd(f[2], f[3], f[4]), e, polys, bb: bboxOf(polys), cells: cellsOf(polys), g: 'cs' + JSON.stringify(f[8]), cs: 1 }; });
  const d = evalBundle(HB, '__HISTB');
  return { window: d.window, top, rows: cs.concat(d.feats.map((f) => {
    /* the cutter at the composition's own scale: OHM is drawn at 0.004° and four decimals, and a
       subtraction at that detail would only add ribbons the sliver rule then throws away */
    const polys = cleanPolys(f[8].map((p) => p.map((ri) => d.rings[ri])));
    /* `g` is the record's own geometry identity — the ring indices it pools. A relation renamed or re-dated
       with the same outline is the same cutter, and the subtraction is not paid for twice */
    return { s: ymd(f[2], f[3], f[4]), e: ymd(f[5], f[6], f[7]), polys, bb: bboxOf(polys), cells: cellsOf(polys), g: JSON.stringify(f[8]) };
  })).concat(lateCutters()) };
}
/* (hist-colonial-era-borders) and from 1886, OpenHistoricalMap on the ground CShapes leaves — data/hist-borders-late.js,
   already less CShapes (`ohmLate`), so above Cliopatria the record is CShapes ∪ that file. Absent, the chain is as before. */
const HBL = join(ROOT, 'data', 'hist-borders-late.js');
function lateCutters() {
  if (!existsSync(HBL)) return [];
  const d = evalBundle(HBL, '__HISTBLATE');
  return d.feats.map((f) => { const polys = f[8].map((p) => p.map((ri) => d.rings[ri]));
    return { s: ymd(f[2], f[3], f[4]), e: ymd(f[5], f[6], f[7]), polys, bb: bboxOf(polys), cells: cellsOf(polys), g: 'ol' + JSON.stringify(f[8]) }; });
}

/* ── upstream ────────────────────────────────────────────────────────────── */
/* ⚠ Wikidata refuses bursts with 429 and says how long to wait (Retry-After). That is an OBSERVED refusal,
   so it is retried — after the wait it names, never sooner, at most WD_TRIES times, and each wait is
   reported (.agents/rules/one-pass-or-a-reason.md §5). Anything else is a failure. */
const WD_TRIES = 6;
async function wdFetch(url, accept) {
  for (let i = 1; ; i++) {
    const r = await fetch(url, { headers: { 'user-agent': 'IntMap-build-hist-clio/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap)', accept: accept || 'application/json' } });
    if (r.status !== 429 && r.status !== 503) { if (!r.ok) throw new Error('Wikidata answered ' + r.status); const j = await r.json(); if (j && j.error) throw new Error('Wikidata refused: ' + (j.error.info || j.error.code)); return j; }
    if (i >= WD_TRIES) throw new Error('Wikidata answered ' + r.status + ' ' + i + ' times');
    const wait = Math.max(1, +(r.headers.get('retry-after') || 0) || 2 ** i);
    console.error('  Wikidata ' + r.status + ' — waiting ' + wait + ' s as it asks (try ' + i + ')');
    await new Promise((res) => setTimeout(res, wait * 1000));
  }
}
async function fetchUpstream() {
  mkdirSync(CACHE, { recursive: true });
  const zip = join(CACHE, UPSTREAM.file);
  if (!existsSync(zip) || sha(zip) !== UPSTREAM.sha256) {
    const r = await fetch(ZIP_URL, { headers: { 'user-agent': 'intmap-build-hist-clio' } });
    if (!r.ok) throw new Error(ZIP_URL + ' answered ' + r.status);
    writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
  }
  const got = sha(zip);
  if (got !== UPSTREAM.sha256) throw new Error(`${UPSTREAM.file} hashes to ${got}, the pin says ${UPSTREAM.sha256} — the release moved`);
  /* Windows' own bsdtar reads zip; a GNU tar first on PATH (Git Bash) reads «C:» as a remote host */
  if (!existsSync(join(CACHE, UPSTREAM.member))) execFileSync(process.platform === 'win32' ? join(process.env.SystemRoot || 'C:' + String.fromCharCode(92) + 'Windows', 'System32', 'tar.exe') : 'unzip', process.platform === 'win32' ? ['-xf', zip, '-C', CACHE] : ['-o', '-q', zip, '-d', CACHE]);
  console.error('cliopatria: ' + join(CACHE, UPSTREAM.member));
  const rows = readUpstream().map((f) => f.properties).filter((p) => p.Type === 'POLITY');
  /* the SECOND identity statement each row makes: the English Wikipedia article it names, resolved to the
     item that article belongs to (its enwiki sitelink — a fact about the article, not a spelling match) */
  const titles = [...new Set(rows.map((p) => p.Wikipedia).filter(Boolean))];
  const wiki = {};
  for (let i = 0; i < titles.length; i += 50) {
    const b = titles.slice(i, i + 50);
    /* asked of English Wikipedia itself: the page each title is (after its own normalisation and redirect),
       and the Wikidata item that page is bound to (pageprops.wikibase_item) */
    const j = await wdFetch('https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=pageprops&ppprop=wikibase_item&titles=' + encodeURIComponent(b.join('|')));
    const q = j.query || {}, hop = new Map();
    for (const n of (q.normalized || [])) hop.set(n.from, n.to);
    for (const n of (q.redirects || [])) hop.set(n.from, n.to);
    const item = new Map((q.pages || []).filter((p) => p.pageprops && p.pageprops.wikibase_item).map((p) => [p.title, p.pageprops.wikibase_item]));
    for (const want of b) { let t = want, k = 0; while (hop.has(t) && k++ < 4) t = hop.get(t); if (item.has(t)) wiki[want] = item.get(t); }
    console.error('wikipedia ' + Math.min(i + 50, titles.length) + '/' + titles.length);
  }
  /* the identity facts: P571 / P576 / English label of every QID either statement names */
  const qs = [...new Set(rows.map((p) => p.Wikidata).filter(Boolean).concat(Object.values(wiki)))];
  const facts = {};
  for (let i = 0; i < qs.length; i += 200) {
    const b = qs.slice(i, i + 200);
    const q = 'SELECT ?i ?s ?e ?l WHERE { VALUES ?i { ' + b.map((x) => 'wd:' + x).join(' ') + " } OPTIONAL{?i wdt:P571 ?s} OPTIONAL{?i wdt:P576 ?e} OPTIONAL{?i rdfs:label ?l FILTER(lang(?l)='en')} }";
    for (const x of (await wdFetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), 'application/sparql-results+json')).results.bindings) {
      const id = x.i.value.split('/').pop(), o = facts[id] || (facts[id] = {});
      const yr = (v) => { const m = /^(-?)(\d+)-/.exec(v); return m ? (m[1] ? -(+m[2]) : +m[2]) : null; };
      for (const [k, v] of [['s', x.s], ['e', x.e]]) if (v) { const y = yr(v.value); if (y != null) (o[k] = o[k] || []).includes(y) || o[k].push(y); }
      if (x.l) o.l = x.l.value;
    }
    console.error('wikidata ' + Math.min(i + 200, qs.length) + '/' + qs.length);
  }
  const sorted = {};
  for (const q of Object.keys(facts).sort((a, b) => +a.slice(1) - +b.slice(1))) { const o = facts[q]; for (const k of ['s', 'e']) if (o[k]) o[k].sort((a, b) => a - b); sorted[q] = o; }
  const rec = JSON.parse(readFileSync(FACTS, 'utf8'));
  const wsorted = Object.fromEntries(Object.keys(wiki).sort().map((k) => [k, wiki[k]]));
  writeFileSync(FACTS, JSON.stringify({ ...rec, fetched: new Date().toISOString().slice(0, 10), facts: sorted, wiki: wsorted }));
}
function readUpstream() {
  const f = join(CACHE, UPSTREAM.member);
  if (!existsSync(f)) throw new Error(f + ' is not there — run node scripts/build-hist-clio.mjs --fetch');
  return JSON.parse(readFileSync(f, 'utf8')).features;
}
const geomPolys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

/* ── 1. Cliopatria rows, cut at CShapes and less OHM's ground ────────────── */
/* one row that reaches into OHM's band → its pieces [{ s, e, polys }]: split at every date the set of
   OHM relations holding its ground changes, each piece the row less those relations */
function splitRow(row, ohmRows) {
  const pieces = [];
  const near = cuttersOf(cellsOf(row.polys), ohmRows.filter((o) => o.s < row.e && o.e > row.s && meets(o.bb, row.bb)));
  const cuts = [...new Set(near.flatMap((o) => [o.s, o.e]).filter((t) => t > row.s && t < row.e))].sort((x, y) => x - y);
  const edges = [row.s, ...cuts, row.e];
  let prev = null;
  const memo = new Map();
  for (let i = 0; i + 1 < edges.length; i++) {
    const t0 = edges[i], t1 = edges[i + 1];
    const inForce = near.filter((o) => o.s <= t0 && o.e > t0);
    const key = inForce.map((o) => o.g).sort().join('|');
    let g = memo.get(key);
    if (g === undefined) { g = subtract(row.polys, inForce.map((o) => o.polys), row.area); memo.set(key, g); }
    if (prev && prev.g === g && prev.e === t0) { prev.e = t1; continue; }
    if (g) { prev = { s: t0, e: t1, polys: g, g }; pieces.push(prev); } else prev = null;
  }
  return pieces.map(({ s, e, polys }) => ({ s, e, polys }));
}
/* the Cliopatria rows the composition draws, each as { name, qid, meta, polys, bb, area, s, e } —
   the rows that reach into OHM's band are handed to `clip` (the worker pool) */
async function clioRows(features, ohm, clip) {
  const [hbLo] = ohm.window, T_HB = ymd(hbLo, 1, 1);
  const out = [], band = [];
  let leaf = 0, relation = 0, aggregate = 0, late = 0;
  /* the span Cliopatria draws each NAME over (astronomical years), and which of its QIDs are that polity */
  const spanOf = new Map();
  /* the span as SHIPPED (cut at 1886, a realm under its unbracketed name) — the one the offline gate can re-measure */
  const bare = (n) => (/^\(.*\)$/.test(n) ? n.slice(1, -1) : n);
  const lastY = Math.floor(ohm.top / 10000) - (ohm.top % 10000 === 101 ? 1 : 0);
  for (const ft of features) { const p = ft.properties; if (p.Type !== 'POLITY' || ymd(astro(p.FromYear), 1, 1) >= ohm.top) continue;
    const k = bare(p.Name), sp = spanOf.get(k) || [Infinity, -Infinity]; sp[0] = Math.min(sp[0], astro(p.FromYear)); sp[1] = Math.max(sp[1], Math.min(astro(p.ToYear), lastY)); spanOf.set(k, sp); }
  const facts = readFacts(), wikiQ = readWiki(), verdict = new Map();
  /* the release's own QID first; when it is shown NOT to be the polity, the item of the Wikipedia article the
     same row names — measured 2026-10-04: «Han Dynasty» carries Q1068371 (Chauhan) and names the article
     «Han dynasty» (Q7209); both are put to the same test, and neither is taken on trust */
  const decide = (q, n) => { const k = n + '|' + q; if (!verdict.has(k)) verdict.set(k, verifiedQid(q, n, spanOf.get(n), facts)); return verdict.get(k) ? q : null; };
  const qidFor = (p) => decide(p.Wikidata, bare(p.Name)) || (p.Wikipedia && wikiQ[p.Wikipedia] && wikiQ[p.Wikipedia] !== p.Wikidata ? decide(wikiQ[p.Wikipedia], bare(p.Name)) : null);
  for (const ft of features) {
    const p = ft.properties;
    if (p.Type !== 'POLITY') { relation++; continue; }
    const realm = /^\(.*\)$/.test(p.Name);
    const s = ymd(astro(p.FromYear), 1, 1), e = Math.min(ymd(astro(p.ToYear) + 1, 1, 1), ohm.top);
    if (s >= ohm.top) { late++; continue; }
    leaf++; if (realm) aggregate++;
    const polys = cleanPolys(geomPolys(ft.geometry));
    if (!polys.length) continue;
    const meta = realm ? { r: 1 } : {};
    if (p.Wikipedia) meta.w = p.Wikipedia;
    if (p.MemberOf) meta.of = String(p.MemberOf).replace(/^\(|\)$/g, '');
    const row = { name: realm ? p.Name.slice(1, -1) : p.Name, qid: qidFor(p), meta, polys, bb: bboxOf(polys), area: areaOf(polys) };
    if (e <= T_HB) { out.push({ ...row, s, e }); continue; }
    /* the part below OHM's floor is Cliopatria's alone */
    if (s < T_HB) out.push({ ...row, s, e: T_HB });
    band.push({ ...row, s: Math.max(s, T_HB), e });
  }
  const vs = [...verdict.values()];
  const named = new Set(), withQ = new Set(); for (const r of out.concat(band)) { named.add(r.name); if (r.qid) withQ.add(r.name); }
  console.error(`cliopatria: ${features.length} rows — ${leaf} polity rows to CShapes' last day (${aggregate} of them realms over their members), ${relation} relations not drawn, ${late} after it; ${band.length} reach into OpenHistoricalMap's or CShapes' years and are cut against them; identity tests passed ${vs.filter(Boolean).length}, failed ${vs.filter((v) => !v).length}; names with a verified QID ${withQ.size} of ${named.size}`);
  const done = await clip(band.map((row) => ({ kind: 'row', row })));
  band.forEach((row, i) => { for (const pc of done[i]) out.push({ ...row, s: pc.s, e: pc.e, polys: pc.polys }); });
  /* the span each verified QID was decided on — the bundle carries it, because the rows it ships are fewer
     than the rows the decision read (OHM answers part of them), and the gate must re-decide on the same span */
  out.ids = {};
  for (const [k, ok] of verdict) if (ok) { const n = k.slice(0, k.lastIndexOf('|')); out.ids[n] = spanOf.get(n); }
  return out;
}

/* ── 2. the sheets, less what is above them at their own year ─────────────── */
/* one sheet's polygons, each less the records above it — [{ polys, whole } | null] in the sheet's own order */
function cutSheet(polysList, above) {
  return polysList.map((polys) => {
    if (!polys.length) return null;
    const bb = bboxOf(polys), hit = cuttersOf(cellsOf(polys), above.filter((a) => meets(a.bb, bb))).map((a) => a.polys);
    const g = subtract(polys, hit, areaOf(polys));
    return g ? { polys: g, whole: g === polys } : null;
  });
}
async function restSheets(clio, ohm, clip) {
  const er = evalBundle(ER, '__HISTERAS');
  const [hbLo, hbHi] = ohm.window;
  const snaps = [], rings = [], jobs = [], keep = [];
  const pool = new Map();
  const put = (r) => { const k = r.join(';'); let i = pool.get(k); if (i == null) { i = rings.length; rings.push(r); pool.set(k, i); } return i; };
  for (const sn of er.snaps) {
    if (sn.y >= 1886) continue;
    const t = ymd(sn.y, 6, 15);
    const above = clio.filter((c) => c.s <= t && c.e > t).map((c) => ({ polys: c.polys, bb: c.bb, cells: c.cells || (c.cells = cellsOf(c.polys)) }));
    const res = (ids) => cleanPolys(ids.map((p) => p.map((ri) => er.rings[ri])));
    const list = sn.feats.map((f) => res(f[2])).concat((sn.blank || []).map(res));
    jobs.push({ kind: 'sheet', polysList: list, above, t, band: sn.y >= hbLo && sn.y <= hbHi });
    keep.push(sn);
  }
  const done = await clip(jobs);
  let kept = 0, cut = 0, dropped = 0;
  keep.forEach((sn, k) => {
    const r = done[k], nf = sn.feats.length, feats = [], blank = [], blankPrecision = [];
    r.forEach((x, i) => {
      if (!x) { dropped++; return; }
      if (x.whole) kept++; else cut++;
      const ps = x.polys.map((p) => p.map(put));
      if (i < nf) feats.push([sn.feats[i][0], sn.feats[i][1], ps]);
      else { blank.push(ps); blankPrecision.push(sn.blankPrecision ? sn.blankPrecision[i - nf] : null); }
    });
    const o = { key: sn.key, y: sn.y, feats };
    if (blank.length) { o.blank = blank; if (blankPrecision.some((v) => v != null)) o.blankPrecision = blankPrecision; }
    snaps.push(o);
  });
  console.error(`sheets before 1886: ${snaps.length} — polygons kept whole ${kept}, cut ${cut}, answered above and dropped ${dropped}`);
  return { rings, snaps };
}

/* ── 3. (hist-colonial-era-borders) OpenHistoricalMap on CShapes' days, less CShapes ──────────────────
   The relations scripts/build-hist-borders.mjs reads (`buildLate`, into its cache) are cut here as a Cliopatria
   row is: split at every day the CShapes states holding their ground change, each piece the relation less
   those states, the same sliver rule. What is left is the ground CShapes does not state that day — and only
   that is written, so the page draws CShapes, then this file, then Cliopatria (cut against both by `build`),
   and decides nothing itself. The dates stay OHM's and CShapes' days (end EXCLUSIVE, like data/hist-borders.js). */
/* ⚠⚠ HOW FAR OHM ANSWERS ON CShapes' DAYS — THE LAST YEAR, MEASURED, NOT CHOSEN FOR ROUNDNESS.
   observed 2026-10-05: OHM's relations in force 1886–1960 (1,107, cut against CShapes by this file with the top at
   1960) measured on the gate's grid (0.25°, cos-latitude, Natural Earth outline land), as the share of the world's
   land OHM adds over CShapes ∪ Cliopatria, split by what the ground is:
       year   land   Greenland  Antarctica   sea cells
       1886   3.15     1.45       0.00         556      ← the Congo Free State, German East Africa, Angola, Sokoto…
       1890   4.84     1.45       0.00         562
       1895   0.85     1.45       0.00         549      ← CShapes' partition of Africa has arrived
       1899–1923  0.03–0.09 (1904: 1.10 — CShapes' own one-year gap in West Africa)   Greenland 1.36–1.45   0.00   460–638
       1925   0.03     1.36       0.62         541      ← the Colony of Madagascar and Dependencies states Adélie Land
       1933   0.03     1.34       4.19         833      ← «Australia» states the Australian Antarctic Territory
       1936   0.03     0.01       4.19         856      ← Cliopatria states Greenland from here
       1953   0.03     0.01       4.19       5,864      ← territorial seas: Chile, Indonesia, the Soviet Union, the PRC…
       1960   0.08     0.01       3.57      12,570
   Below 1925 every piece OHM adds is ground a polity held (the coastal ribbon of ~500 cells is the same one the
   bundle below 1886 draws). From 1925 OHM's admin_level=2 relations begin to state CLAIMS ON ANTARCTICA that no
   other record states and that the state system never recognised, and from 1953 maritime zones. So OHM answers
   to the end of 1923 — the last whole year before the first Antarctic piece (1924-11-21).
   ⚠ What this leaves: Greenland 1924–1935 (1.36% of the land) is again stated by no record until Cliopatria's
   Greenland in 1936; the Protectorate of Kuwait and other small pieces after 1923 are not drawn by OHM.
   expires: when OHM re-tags Antarctic claims or territorial seas, or CShapes / Cliopatria start to state the ground
   between — re-measure with `--ohm-late --top <year>` and the split above (scripts/hist-fidelity.mjs politiesAt,
   `rec: 'ohm-late'`); canon: here. */
export const LATE_TOP = 1923;
function lateTop() { const i = process.argv.indexOf('--top'); return i > 0 ? +process.argv[i + 1] : LATE_TOP; }
const LATE_SRC = 'OpenHistoricalMap (openhistoricalmap.org) · CC0 1.0 · adapted by IntMap: the admin_level=2 relations in force from 1886, less the ground CShapes states on its own dates';
async function ohmLate(ohm, clip, topYear) {
  const { buildLate } = await import('./build-hist-borders.mjs');
  const raw = await buildLate(topYear);
  const T0 = ymd(raw.window[0], 1, 1), T1 = Math.min(ymd(topYear + 1, 1, 1), ohm.top);
  const rows = [];
  for (const r of raw.recs) {
    const s = Math.max(ymd(...r.sArr), T0), e = Math.min(ymd(...r.eArr), T1);
    if (!(s < e)) continue;
    const polys = cleanPolys(r.polys); if (!polys.length) continue;
    rows.push({ r, row: { s, e, polys, bb: bboxOf(polys), area: areaOf(polys) } });
  }
  const done = await clip(rows.map((x) => ({ kind: 'late', row: x.row })));
  const rings = [], pool2 = new Map(), feats = [];
  const put = (q) => { const k = q.join(';'); let i = pool2.get(k); if (i == null) { i = rings.length; rings.push(q); pool2.set(k, i); } return i; };
  rows.forEach(({ r }, i) => {
    /* only names that DIFFER from English are carried, as in data/hist-borders.js */
    const nm = { en: r.names.en };
    for (const k of Object.keys(r.names)) if (k !== 'en' && r.names[k] && r.names[k] !== r.names.en) nm[k] = r.names[k];
    for (const pc of done[i]) feats.push([nm, r.wd, ...unymd(pc.s), ...unymd(pc.e), pc.polys.map((p) => p.map(put)), r.id]);
  });
  feats.sort((a, b) => ymd(a[2], a[3], a[4]) - ymd(b[2], b[3], b[4]) || a[9] - b[9]);
  for (const f of feats) f.length = 9;
  const body = 'window.__HISTBLATE=' + JSON.stringify({ v: 1, src: LATE_SRC, end: 'exclusive', window: [raw.window[0], topYear],
    basis: { 'data/cshapes.js': sha(CSF) }, relations: raw.recs.length, rings, feats }) + ';\n';
  writeFileSync(HBL, body);
  console.error(`data/hist-borders-late.js: ${raw.recs.length} relations in force ${raw.window[0]}–${topYear} → ${feats.length} pieces CShapes does not state, ${rings.length} rings, ${rings.reduce((a, q) => a + q.length, 0)} points, ${(body.length / 1e6).toFixed(2)} MB`);
}

/* ── the subtractions run on worker threads ──────────────────────────────────
   ⚠ MEASURED 2026-10-04: one thread spent over half an hour in the 1689–1885 rows alone (a large polity
   is split at every OHM border change around it and each piece is a polygon difference). The work is
   independent per row and per sheet, so it is spread over the machine's cores; the result does not
   depend on the order in which the threads answer (each answer goes back to its own index). */
/* ⚠ THE SUBTRACTIONS ARE CACHED ON DISK BY THE HASH OF THEIR INPUTS (the job and the OHM rows), so a rebuild
   that changes only identities or the review re-uses the twenty minutes of geometry. A changed input is a
   different hash; nothing is reused across inputs. The cache is outside the repository (CACHE). */
const JOBS = join(CACHE, 'jobs');
/* only what the geometry depends on — a row's name or QID changing must not miss the cache */
function jobKey(job, ohmSha) {
  const g = job.kind === 'row' || job.kind === 'late' ? { k: job.kind, s: job.row.s, e: job.row.e, area: job.row.area, polys: job.row.polys }
    : { k: 'sheet', t: job.t, band: job.band, list: job.polysList, above: job.above.map((a) => a.polys) };
  return createHash('sha256').update(ohmSha).update(JSON.stringify(g)).digest('hex'); }
function pool(ohm) {
  const N = Math.max(1, Math.min(16, (os.availableParallelism ? os.availableParallelism() : os.cpus().length) - 2));
  const workers = [];
  for (let i = 0; i < N; i++) workers.push(new Worker(fileURLToPath(import.meta.url), { workerData: { role: 'clip', ohm }, resourceLimits: { maxOldGenerationSizeMb: 4096 } }));
  mkdirSync(JOBS, { recursive: true });
  const ohmSha = sha(HB) + ':' + sha(CSF) + ':' + SLIVER_W + ':ground:' + DEC + ':' + CUT_CELLS + (existsSync(HBL) ? ':late:' + sha(HBL) : '');
  /* (hist-colonial-era-borders) a 'late' job is cut against CShapes alone — its key must not hold the file it writes */
  const csSha = sha(CSF) + ':' + SLIVER_W + ':ground:' + DEC + ':' + CUT_CELLS;
  const run = (jobs) => new Promise((resolve, reject) => {
    const out = new Array(jobs.length); let left = jobs.length; const t0 = Date.now();
    const keys = jobs.map((j) => jobKey(j, j.kind === 'late' ? csSha : ohmSha)), todo = [];
    jobs.forEach((j, i) => { const f = join(JOBS, keys[i] + '.json'); if (existsSync(f)) { out[i] = JSON.parse(readFileSync(f, 'utf8')); left--; } else todo.push(i); });
    if (jobs.length - todo.length) console.error(`  … ${jobs.length - todo.length} of ${jobs.length} subtraction jobs read from the cache`);
    if (!left) return resolve(out);
    let next = 0;
    const feed = (w) => { if (next >= todo.length) return; const id = todo[next++]; w.postMessage({ id, job: jobs[id] }); };
    for (const w of workers) {
      w.removeAllListeners('message'); w.removeAllListeners('error');
      w.on('message', (m) => {
        out[m.id] = m.out; try { writeFileSync(join(JOBS, keys[m.id] + '.json'), JSON.stringify(m.out)); } catch (_) { /* a cache that cannot be written is only slower */ }
        STATS.clipped += m.stats.clipped; STATS.failed += m.stats.failed; for (const x of m.stats.widths) STATS.widths.push(x);
        CUTSTAT.kept += m.stats.kept; CUTSTAT.ignored += m.stats.ignored;
        if (--left % 100 === 0) console.error(`  … ${jobs.length - left} / ${jobs.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
        if (!left) resolve(out); else feed(w);
      });
      w.on('error', reject);
      feed(w);
    }
  });
  return { run, close: () => Promise.all(workers.map((w) => w.terminate())), N };
}
function workerMain() {
  const ohmRowsW = workerData.ohm.rows, csRowsW = ohmRowsW.filter((o) => o.cs);
  parentPort.on('message', ({ id, job }) => {
    STATS.clipped = 0; STATS.failed = 0; STATS.widths = []; CUTSTAT.kept = 0; CUTSTAT.ignored = 0;
    let out;
    if (job.kind === 'row') out = splitRow(job.row, ohmRowsW);
    else if (job.kind === 'late') out = splitRow(job.row, csRowsW);
    else {
      const above = job.above.slice();
      if (job.band) for (const o of ohmRowsW) if (o.s <= job.t && o.e > job.t) above.push(o);
      out = cutSheet(job.polysList, above);
    }
    parentPort.postMessage({ id, out, stats: { clipped: STATS.clipped, failed: STATS.failed, widths: STATS.widths, kept: CUTSTAT.kept, ignored: CUTSTAT.ignored } });
  });
}

/* (hist-colonial-era-borders) `--ohm-late`: re-cut data/hist-borders-late.js from OpenHistoricalMap's cache. A separate
   step, because only it needs that cache — `build` reads the committed file as a record above Cliopatria. */
async function lateOnly() {
  const ohm = ohmRows(), P = pool(ohm);
  try { await ohmLate(ohm, P.run, lateTop()); } finally { await P.close(); }
}

/* ── build ───────────────────────────────────────────────────────────────── */
async function build({ measure } = {}) {
  const ohm = ohmRows();
  const P = pool(ohm);
  console.error(`subtracting on ${P.N} threads`);
  try {
    const review = JSON.parse(readFileSync(REVIEW, 'utf8'));
    const raw = await clioRows(readUpstream(), ohm, P.run), clio = applyReview(raw, review);
    const rings = [], pool2 = new Map();
    const put = (r) => { const k = r.join(';'); let i = pool2.get(k); if (i == null) { i = rings.length; rings.push(r); pool2.set(k, i); } return i; };
    clio.sort((a, b) => a.s - b.s || a.e - b.e || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const feats = clio.map((c) => {
      /* ⚠ a sortable YYYYMMDD below year 0 is NEGATIVE, so the month and day are what is left above the
         year's floor — the remainder of a negative number would hand back −99 for January */
      const [sy, sm, sd] = unymd(c.s), [ey, em, ed] = unymd(c.e);
      return [{ en: c.name }, c.qid, sy, sm, sd, ey, em, ed, c.polys.map((p) => p.map(put)), c.meta];
    });
    let lo = Infinity; for (const f of feats) lo = Math.min(lo, f[2]);
    const head = { v: 1, src: SRC, citation: CITATION, upstream: { release: UPSTREAM.release, commit: UPSTREAM.commit, sha256: UPSTREAM.sha256 },
      /* end EXCLUSIVE, like data/hist-borders.js: a row is in force on [start, end) */
      end: 'exclusive', window: [lo, Math.floor(ohm.top / 10000) - (ohm.top % 10000 === 101 ? 1 : 0)], basis: { 'data/hist-borders.js': sha(HB), 'data/cshapes.js': sha(CSF), ...(existsSync(HBL) ? { 'data/hist-borders-late.js': sha(HBL) } : {}) },
      /* name → [first, last] astronomical year Cliopatria draws it over before 1886: the span its QID was verified on */
      ids: Object.fromEntries(Object.keys(raw.ids).sort().map((k) => [k, raw.ids[k]])) };
    const body = 'window.__HISTCLIO=' + JSON.stringify({ ...head, rings, feats }) + ';\n';
    writeFileSync(OUT, body);
    /* the findings nobody has judged yet are listed as pending — counted, drawn as Cliopatria states them */
    const judged = judgedKeys(review);
    const found = findingsOf(feats, readFacts());
    review.pending = found.filter((x) => !judged.has(x.name + '|' + x.side)).map((x) => ({ name: x.name, q: x.q, side: x.side, drawn: x.drawn, wd: x.wd }));
    writeFileSync(REVIEW, JSON.stringify(review, null, 1) + '\n');
    console.error(`review: ${found.length} finding(s) — ${review.rows.length} name(s) withheld by a reviewed row, ${review.refuted.length} refuted, ${review.pending.length} pending`);
    console.error(`data/hist-clio.js: ${feats.length} rows, ${rings.length} rings, ${rings.reduce((a, r) => a + r.length, 0)} points, ${(body.length / 1e6).toFixed(2)} MB`);

    const rest = await restSheets(clio, ohm, P.run);
    const rbody = 'window.__HISTERASREST=' + JSON.stringify({ v: 1, src: REST_SRC, end: 'sheet',
      basis: { 'data/hist-eras.js': sha(ER), 'data/hist-clio.js': sha(OUT), 'data/hist-borders.js': sha(HB) },
      rings: rest.rings, snaps: rest.snaps }) + ';\n';
    writeFileSync(REST, rbody);
    console.error(`data/hist-eras-rest.js: ${rest.snaps.length} sheets, ${rest.rings.length} rings, ${(rbody.length / 1e6).toFixed(2)} MB`);
    console.error(`subtractions ${STATS.clipped}, failed (kept whole) ${STATS.failed}; cutters kept ${CUTSTAT.kept} / ignored as border ribbons ${CUTSTAT.ignored}`);
    if (measure) {
      const h = new Map(); for (const w of STATS.widths) { const b = Math.min(20, Math.floor(w / 0.025)); h.set(b, (h.get(b) || 0) + 1); }
      console.error('residual pieces by mean width (0.025° bins):');
      for (const b of [...h.keys()].sort((x, y) => x - y)) console.error(`  ${(b * 0.025).toFixed(3)}°  ${h.get(b)}`);
    }
  } finally { await P.close(); }
}

/* ── check (offline) ─────────────────────────────────────────────────────────
   ⚠ RE-DERIVES NOTHING FROM THE SOURCE (a 46 MB release and minutes of polygon clipping), and says
   so. It proves the committed files' invariants, and — the part that is not structural — that the
   composition was made against the neighbours that ship beside it: each file records the sha256 of
   the records it was subtracted from, and a rebuilt neighbour makes the composition stale. */
export function check() {
  const bad = [];
  const ok = (c, m) => { if (!c) bad.push(m); };
  const d = evalBundle(OUT, '__HISTCLIO'), r = evalBundle(REST, '__HISTERASREST');
  ok(d && d.v === 1 && /Cliopatria/.test(d.src) && /CC BY 4\.0/.test(d.src), 'data/hist-clio.js must name Cliopatria and CC BY 4.0');
  ok(d && d.upstream && d.upstream.sha256 === UPSTREAM.sha256 && d.upstream.commit === UPSTREAM.commit, 'data/hist-clio.js was not built from the pinned release');
  ok(r && r.v === 1 && /historical-basemaps/.test(r.src) && /GPL-3\.0/.test(r.src), 'data/hist-eras-rest.js must name historical-basemaps and GPL-3.0');
  if (bad.length) return fail(bad);
  ok(d.basis['data/hist-borders.js'] === sha(HB), 'data/hist-clio.js was subtracted from another data/hist-borders.js — rebuild it');
  ok(d.basis['data/cshapes.js'] === sha(CSF), 'data/hist-clio.js was subtracted from another data/cshapes.js — rebuild it');
  checkLate(d, ok, bad);
  ok(r.basis['data/hist-borders.js'] === sha(HB), 'data/hist-eras-rest.js was subtracted from another data/hist-borders.js — rebuild it');
  ok(r.basis['data/hist-clio.js'] === sha(OUT), 'data/hist-eras-rest.js was subtracted from another data/hist-clio.js — rebuild it');
  if (existsSync(ER)) ok(r.basis['data/hist-eras.js'] === sha(ER), 'data/hist-eras-rest.js was cut from another data/hist-eras.js — rebuild it');
  const rings = (rs, tag) => rs.forEach((g, i) => {
    if (!Array.isArray(g) || g.length < 3) bad.push(`${tag} ring ${i} has ${g && g.length} points`);
    else if (g.some((p) => !(p[0] >= -180.001 && p[0] <= 180.001 && p[1] >= -90.001 && p[1] <= 90.001))) bad.push(`${tag} ring ${i} leaves the globe`);
  });
  rings(d.rings, 'hist-clio'); rings(r.rings, 'hist-eras-rest');
  const used = new Uint8Array(d.rings.length);
  d.feats.forEach((f, i) => {
    if (!f[0] || (!f[0].en && !(f[9] && f[9].wn))) bad.push(`hist-clio row ${i} has no English name and withholds none`);
    const s = ymd(f[2], f[3], f[4]), e = ymd(f[5], f[6], f[7]);
    if (!(s < e)) bad.push(`hist-clio row ${i} (${f[0] && f[0].en}) ends before it starts`);
    if (![f[3], f[6]].every((m) => m >= 1 && m <= 12) || ![f[4], f[7]].every((x) => x >= 1 && x <= 31)) bad.push(`hist-clio row ${i} (${f[0] && f[0].en}) has no calendar date (${f.slice(2, 8).join(' ')})`);
    if (f[5] > d.window[1] + 1 || (f[5] === d.window[1] + 1 && (f[6] !== 1 || f[7] !== 1))) bad.push(`hist-clio row ${i} (${f[0] && f[0].en}) reaches past CShapes' last day`);
    if (!Array.isArray(f[8]) || !f[8].length) bad.push(`hist-clio row ${i} has no polygons`);
    else for (const p of f[8]) for (const ri of p) { if (!(ri >= 0 && ri < d.rings.length)) bad.push(`hist-clio row ${i} points at ring ${ri}`); else used[ri] = 1; }
  });
  const orphan = used.reduce((a, v) => a + (v ? 0 : 1), 0);
  ok(orphan === 0, `${orphan} hist-clio ring(s) are referenced by no row`);
  const rused = new Uint8Array(r.rings.length);
  for (const sn of r.snaps) {
    ok(sn.y < 1886, `hist-eras-rest sheet ${sn.key} is a CShapes year`);
    for (const f of sn.feats) for (const p of f[2]) for (const ri of p) { if (!(ri >= 0 && ri < r.rings.length)) bad.push(`sheet ${sn.key} points at ring ${ri}`); else rused[ri] = 1; }
    for (const ps of sn.blank || []) for (const p of ps) for (const ri of p) { if (!(ri >= 0 && ri < r.rings.length)) bad.push(`sheet ${sn.key} points at ring ${ri}`); else rused[ri] = 1; }
  }
  const rorph = rused.reduce((a, v) => a + (v ? 0 : 1), 0);
  ok(rorph === 0, `${rorph} hist-eras-rest ring(s) are referenced by no sheet`);
  if (existsSync(ER)) {
    const er = evalBundle(ER, '__HISTERAS');
    const want = er.snaps.filter((s) => s.y < 1886).map((s) => s.key).join(',');
    ok(r.snaps.map((s) => s.key).join(',') === want, 'hist-eras-rest does not carry every sheet before 1886, in order');
  }
  /* every QID the bundle ships is re-decided from the committed facts — an unverified identifier would be
     translated and linked as if it were the polity drawn */
  { const facts = readFacts(), ids = d.ids || {};
    let bad = 0; const eg = [];
    for (const f of d.feats) {
      if (!f[1]) continue;
      const sp = ids[f[0].en];
      /* the decision's span must contain the row it vouches for, and the QID must verify on it */
      const okRow = sp && f[2] >= sp[0] && f[5] - 1 <= sp[1] && verifiedQid(f[1], f[0].en, sp, facts);
      if (!okRow) { bad++; if (eg.length < 4) eg.push(f[0].en + ' → ' + f[1]); } }
    ok(bad === 0, bad + ' shipped QID(s) are not shown to be the polity drawn: ' + eg.join(', ')); }
  /* every finding is judged or counted, and every reviewed row is honoured on the shipped rows */
  { const review = JSON.parse(readFileSync(REVIEW, 'utf8'));
    const twice = [], once = new Set();
    for (const r of [...review.rows, ...review.refuted]) for (const x of judgedSides(r)) { const k = r.name + '|' + x; if (once.has(k)) twice.push(k); once.add(k); }
    ok(twice.length === 0, 'scripts/histclio/review.json judges ' + twice.length + ' name/side more than once: ' + twice.slice(0, 4).join(', '));
    const listed = judgedKeys(review); for (const p of review.pending) listed.add(p.name + '|' + p.side);
    const loose = findingsOf(d.feats, readFacts()).filter((x) => !listed.has(x.name + '|' + x.side));
    ok(loose.length === 0, loose.length + ' finding(s) of a name drawn outside its polity\'s life are in no list of scripts/histclio/review.json: ' + loose.slice(0, 4).map((x) => x.name + ' (' + x.side + ' ' + x.drawn + ' vs ' + x.wd + ')').join(', '));
    for (const R of review.rows) {
      ok(bounds(R), R.name + ': a reviewed row must bound a start (s), an end (e) or a gap (gaps)');
      /* a gap lies BETWEEN two lives: whole years, in order, apart, and strictly inside the row's own
         bounds — a gap touching `s` or `e` is a start or an end written as a gap */
      const G = R.gaps == null ? [] : R.gaps;
      ok(Array.isArray(G) && G.every((g, i) => Array.isArray(g) && g.length === 2 && g.every(Number.isInteger) && g[0] <= g[1]
        && (R.s == null || g[0] > R.s) && (R.e == null || g[1] < R.e) && (i === 0 || g[0] > G[i - 1][1] + 1)),
        R.name + ': gaps must be [[from, to], …] — whole astronomical years, from ≤ to, in order, not touching, inside s..e');
      /* no shipped row carries the name inside a gap: [from 1 January, to + 1 1 January) */
      const inGap = G.length ? d.feats.filter((f) => f[0].en === R.name && G.some(([a, b]) => ymd(f[2], f[3], f[4]) < ymd(b + 1, 1, 1) && ymd(f[5], f[6], f[7]) > ymd(a, 1, 1))) : [];
      ok(inGap.length === 0, R.name + ' is still named inside a gap scripts/histclio/review.json places in its life: ' + inGap.slice(0, 3).map((f) => f[2] + '–' + f[5]).join(', '));
      const late = R.e == null ? [] : d.feats.filter((f) => f[0].en === R.name && f[5] - 1 > R.e);
      ok(late.length === 0, R.name + ' is still named after ' + R.e + ', the year scripts/histclio/review.json places its end');
      const early = R.s == null ? [] : d.feats.filter((f) => f[0].en === R.name && f[2] < R.s);
      ok(early.length === 0, R.name + ' is still named before ' + R.s + ', the year scripts/histclio/review.json places its beginning');
      ok(/^Q\d+$/.test(String(R.wd || '')), R.name + ': a reviewed row must name the Wikidata item (wd) of the polity it bounds');
      ok(typeof R.history === 'string' && R.history.length > 20, R.name + ': a reviewed row must say what history states');
    }
    /* …and the other way: every withheld shipped row names a side a reviewed row states, with that row's
       years — a gap's bounds are the last year of the first life and the first of the second */
    const byName = new Map(review.rows.map((R) => [R.name, R]));
    const stray = d.feats.filter((f) => { const m = f[9] || {}; if (!m.wn || m.ws == null) return false; const R = byName.get(m.wn); if (!R) return false;
      if (m.ws === 'start') return m.wy !== R.s; if (m.ws === 'end') return m.wy !== R.e;
      if (m.ws === 'gap') return !(R.gaps || []).some(([a, b]) => m.wy === a - 1 && m.wz === b + 1);
      return true; });
    ok(stray.length === 0, stray.length + ' withheld Cliopatria row(s) carry a side or year no reviewed row states: ' + stray.slice(0, 3).map((f) => f[9].wn + ' ' + f[9].ws + ' ' + f[9].wy).join(', ')); }
  /* ⚠ CC BY 4.0 MAKES CREDIT A CONDITION OF REDISTRIBUTION: the reader-facing row must exist, by its exact name */
  const ref = readFileSync(join(ROOT, 'js', 'reference-data.js'), 'utf8');
  ok(ref.includes("n:'" + CREDIT_ROW + "'") && /lic:'CC BY 4.0'/.test(ref.slice(ref.indexOf(CREDIT_ROW))), 'js/reference-data.js does not credit Cliopatria as «' + CREDIT_ROW + '» with its licence');
  if (bad.length) return fail(bad);
  console.log(`hist-clio ok — ${d.feats.length} rows ${d.window[0]}–${d.window[1]}, ${d.rings.length} rings; hist-eras-rest ${r.snaps.length} sheets, ${r.rings.length} rings; hist-borders-late ${evalBundle(HBL, '__HISTBLATE').feats.length} rows 1886–${LATE_TOP}; all made against the shipped neighbours`);
}
/* (hist-colonial-era-borders) data/hist-borders-late.js: OHM on CShapes' days. Made against the shipped CShapes, every row
   inside its window and ending by its top, every ring resolvable and used — and Cliopatria cut against THIS file. */
function checkLate(d, ok, bad) {
  ok(existsSync(HBL), 'data/hist-borders-late.js is missing — node scripts/build-hist-clio.mjs --ohm-late');
  if (!existsSync(HBL)) return;
  const L = evalBundle(HBL, '__HISTBLATE');
  ok(L && L.v === 1 && /OpenHistoricalMap/.test(L.src) && /CC0/.test(L.src), 'data/hist-borders-late.js must name OpenHistoricalMap and CC0');
  ok(L && L.end === 'exclusive' && Array.isArray(L.window) && L.window[0] === 1886 && L.window[1] === LATE_TOP, `data/hist-borders-late.js must run 1886–${LATE_TOP} with exclusive ends (LATE_TOP)`);
  ok(L && L.basis && L.basis['data/cshapes.js'] === sha(CSF), 'data/hist-borders-late.js was cut against another data/cshapes.js — node scripts/build-hist-clio.mjs --ohm-late');
  ok(d.basis['data/hist-borders-late.js'] === sha(HBL), 'data/hist-clio.js was subtracted from another data/hist-borders-late.js — rebuild it');
  if (!L || !Array.isArray(L.feats) || !Array.isArray(L.rings)) return;
  const lo = ymd(L.window[0], 1, 1), hi = ymd(L.window[1] + 1, 1, 1), used = new Uint8Array(L.rings.length);
  L.feats.forEach((f, i) => {
    const s = ymd(f[2], f[3], f[4]), e = ymd(f[5], f[6], f[7]), n = f[0] && f[0].en;
    if (!n) bad.push(`hist-borders-late row ${i} has no English name`);
    if (!(lo <= s && s < e && e <= hi)) bad.push(`hist-borders-late row ${i} (${n}) is outside ${L.window.join('–')} or ends before it starts`);
    if (!Array.isArray(f[8]) || !f[8].length) bad.push(`hist-borders-late row ${i} (${n}) has no polygons`);
    else for (const p of f[8]) for (const ri of p) { if (!(ri >= 0 && ri < L.rings.length)) bad.push(`hist-borders-late row ${i} points at ring ${ri}`); else used[ri] = 1; }
  });
  L.rings.forEach((g, i) => { if (!Array.isArray(g) || g.length < 3 || g.some((p) => !(p[0] >= -180.001 && p[0] <= 180.001 && p[1] >= -90.001 && p[1] <= 90.001))) bad.push(`hist-borders-late ring ${i} is not a ring on the globe`); });
  const orphan = used.reduce((a, v) => a + (v ? 0 : 1), 0);
  ok(orphan === 0, `${orphan} hist-borders-late ring(s) are referenced by no row`);
}
function fail(bad) {
  console.error('hist-clio: ' + bad.length + ' problem(s)');
  for (const b of bad.slice(0, 25)) console.error('  ' + b);
  process.exitCode = 1;
}

const arg = process.argv.slice(2);
if (!isMainThread && workerData && workerData.role === 'clip') workerMain();
else if (process.argv[1] && join(process.argv[1]) === join(fileURLToPath(import.meta.url))) {
  if (arg.includes('--check')) check();
  else if (arg.includes('--fetch')) await fetchUpstream();
  else if (arg.includes('--ohm-late')) await lateOnly();
  else await build({ measure: arg.includes('--measure') });
}
