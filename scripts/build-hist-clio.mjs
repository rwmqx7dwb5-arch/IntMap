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
 *      node scripts/build-hist-clio.mjs --identities # re-decide the shipped QIDs only (no subtraction), then
 *                                                    # node scripts/build-histnames.mjs --identifiers
 *      node scripts/build-hist-clio.mjs --check     # the committed files' invariants (offline)
 *      node scripts/build-hist-clio.mjs --coast-snap         # data/hist-coast-snap.js from the committed records (coast-snap-gaps:
 *                                                            # the land a record's coast left out, under the one polity bounding it)
 *      node scripts/build-hist-clio.mjs --coast-snap-measure [--before <file>] [--coast ne|osm] # the port-city table: base-map land grid points drawn, with and without it
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
import { water as coastWater, inlandKmFor, KM_PER_DEG } from './build-border-coast.mjs';
import { simplifyRing, ringArea } from './histborders/geom.mjs';
import { CLIOPATRIA, AOUREDNIK_BASEMAPS, OPENHISTORICALMAP, NATURAL_EARTH } from './lib/upstream-cadence.mjs';
import { buildCoastSnap, checkCoastSnap, measurePorts, SNAP_FILE } from './histclio/coast-snap.mjs';

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

/* ⚠⚠ (sales-pro-audiences) EACH FILE NAMES EVERY RECORD ITS OUTLINES ARE MADE OF, WITH THAT RECORD'S LICENCE AS A VALUE.
   Measured 2026-10-08 (`node scripts/public-api.mjs --stats`): all three files were withheld from the open-data catalogue
   as «licence-not-stated — stated-only-in-prose» — the licence lived only in each bundle's `src` sentence. Stating it
   here is not one licence per file: a Cliopatria row is Cliopatria's (CC BY 4.0), but its OUTLINE is what is left after
   the ground OpenHistoricalMap and CShapes state was removed (`src` says so), so those two records are named too, as
   `contributes: 'outline'` — they shaped the edge, not the name, the dates or the identifiers.
   `rowsFrom` is the first day a record can have shaped a row: CShapes begins 1886-01-01 (js/time-borders.js CS_MIN,
   scripts/build-hist-borders.mjs Y_MAX + 1, and the earliest start in data/cshapes.js —
   tests/sales-pro-audiences-checks.test.mjs holds the three equal), and every row of this file is cut at that day,
   so a row that ends on or before it was never cut against CShapes. js/border-extract.js reads both fields per row.
   ⚠ THE CShapes VALUES ARE scripts/build-cshapes.mjs's GOVERNANCE, spelled again because a declaration is read apart
   from its builder (scripts/data-governance.mjs governanceOf binds only literal constants); the same test compares
   them, so the two spellings cannot part. */
export const GOVERNANCE = (() => {
  const CLIO = { publisher: 'Seshat Global History Databank (Cliopatria)', url: `https://github.com/${UPSTREAM.repo}`,
    licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: true, creditRequired: true,
    paidBy: CREDIT_ROW, cite: CITATION };
  const OHM = { publisher: 'OpenHistoricalMap', url: 'https://www.openhistoricalmap.org/', licence: 'CC0 1.0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: false };
  const CSHAPES = { publisher: 'Schvitz, Rüegger, Girardin, Cederman, Weidmann, Gleditsch (ICR, ETH Zürich)', url: 'https://icr.ethz.ch/data/cshapes/',
    licence: 'CC BY-NC-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/', attribution: true,
    paidBy: 'CShapes 2.0 (Schvitz et al., ETH Zürich)',
    cite: 'Schvitz, Guy, Seraina Rüegger, Luc Girardin, Lars-Erik Cederman, Nils Weidmann, and Kristian Skrede Gleditsch. 2022. "Mapping The International System, 1886-2017: The CShapes 2.0 Dataset." Journal of Conflict Resolution 66(1): 144–61.' };
  const SHEETS = { publisher: 'aourednik/historical-basemaps', url: 'https://github.com/aourednik/historical-basemaps',
    licence: 'GPL-3.0', licenceUrl: 'https://www.gnu.org/licenses/gpl-3.0.html', attribution: true,
    paidBy: 'historical-basemaps (aourednik) — GPL-3.0' };
  const outline = (r, from) => Object.assign({}, r, { contributes: 'outline' }, from ? { rowsFrom: from } : {});
  return {
  'data/hist-clio.js': {
    publisher: CLIO.publisher,
    url: CLIO.url,
    upstreams: [CLIO, outline(OHM), outline(CSHAPES, '1886-01-01')],
    /* which record draws a piece of ground when two state it on the same day — the composition this file is cut for */
    priority: { rank: ['CShapes 2.0', 'OpenHistoricalMap', 'Cliopatria'],
      over: 'where CShapes (from 1886) or OpenHistoricalMap states ground on a day, that record draws it; this file keeps only the ground they leave, on their own dates' },
    ...CLIOPATRIA,
    builtBy: 'scripts/build-hist-clio.mjs',
  },
  'data/hist-eras-rest.js': {
    publisher: SHEETS.publisher,
    url: SHEETS.url,
    upstreams: [SHEETS, outline(OHM), outline(CLIO)],
    priority: { rank: ['OpenHistoricalMap', 'Cliopatria', 'historical-basemaps'],
      over: 'each sheet before 1886 keeps only the ground OpenHistoricalMap and Cliopatria leave at the year of that sheet' },
    ...AOUREDNIK_BASEMAPS,
    builtBy: 'scripts/build-hist-clio.mjs',
  },
  /* (hist-colonial-era-borders) OpenHistoricalMap's relations on CShapes' days, less CShapes' ground — see `ohmLate` */
  'data/hist-borders-late.js': {
    publisher: 'OpenHistoricalMap',
    upstreams: [OHM, outline(CSHAPES)],
    priority: { rank: ['CShapes 2.0', 'OpenHistoricalMap'],
      over: 'from 1886 CShapes states the sovereign states on its own dates; this file is the OpenHistoricalMap relations on the ground CShapes leaves' },
    ...OPENHISTORICALMAP,
    builtBy: 'scripts/build-hist-clio.mjs',
  },
  /* (coast-snap-gaps) the land between a record's coast and the real coast, under the one polity that bounds it — the ONE
     upstream it asks is the coast; each piece's landward edge is its parent row's line, drawn under that record's terms
     beside it (scripts/histclio/coast-snap.mjs SRC names them).
     (coast-snap-detail) two coasts: OpenStreetMap's land polygons for the records whose terms allow it (ODbL 1.0 — credit is
     a condition, paid by the row named in `paidBy`), Natural Earth's for the share-alike records. The OpenStreetMap input is
     one pinned npm package (its integrity in package-lock.json, its sha256 in coast-snap.mjs OSM_LAND), so the cadence that
     can bring a new coast is Natural Earth's. */
  'data/hist-coast-snap.js': {
    upstreams: [
      { publisher: 'Natural Earth', url: 'https://www.naturalearthdata.com/', licence: 'public domain',
        licenceUrl: 'https://www.naturalearthdata.com/about/terms-of-use/', attribution: false, creditRequired: false },
      { publisher: 'OpenStreetMap contributors (land polygons: osmdata.openstreetmap.de, via @geo-maps/earth-lands-10m 0.6.0)', url: 'https://www.openstreetmap.org/copyright',
        licence: 'ODbL 1.0', licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/', attribution: true, creditRequired: true,
        paidBy: 'Historical map coastline — OpenStreetMap land polygons, OpenStreetMap contributors (ODbL 1.0)' },
    ],
    schema: 'scripts/histclio/coast-snap.mjs checkCoastSnap (npm run check:histclio): every row names a parent the page draws over the same years, no piece lies inside a record, and each record reaches the coast its terms allow',
    ...NATURAL_EARTH,
    builtBy: 'scripts/build-hist-clio.mjs',
  },
  };
})();

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

/* ══ ⚠⚠⚠ (clio-year-page-findings) AT A SHORE, THE FINER RECORD IS BELIEVED ═══════════════════════════════════════════
   SLIVER_W reads a narrow piece as two hands drawing one line. Where that line is a SHORE, the two hands are not
   equally good, and a narrow piece of the record below that is LAND — inside the true coast — is ground the record
   above left out by drawing its coast too coarsely.
     observed 2026-10-07 (the sovereignty timelines): the old city of Istanbul — inside every aourednik sheet from
     400 BC to 1700 (the Achaemenid, Roman, Eastern Roman, Byzantine and Ottoman Empires) — was drawn by NOTHING from
     600 BC to 1689: Cliopatria v0.2.1's coastline stops short of the peninsula, the sheet less Cliopatria left the
     peninsula as a piece narrower than SLIVER_W, and it was dropped as a ribbon. Venice, Copenhagen, Gibraltar and
     Carthage were blank the same way.
   ⇒ WHO IS BELIEVED IS A MEASURED PROPERTY OF EACH RECORD, AND IT IS ALREADY MEASURED: the coastal registration error
     scripts/build-border-coast.mjs swept for the border marks (`inlandKmFor`: Cliopatria 10 km; CShapes, OpenHistoricalMap
     and the sheets 6 km). A narrow piece is kept as ground when (1) the record it belongs to registers the shore MORE
     precisely than every record it was cut against, and (2) no more of it is sea than land (LAND_SHARE) — asked of the
     same water authority (data/coastline.json.gz, Natural Earth 1:10m at 2 km; a lake reads as land). Otherwise it stays
     a ribbon. Why «no more sea than land» and not «more land»: the two errors are not alike. Every coarse record already
     draws the sea within its registration band all along its coast, so keeping a half-sea piece adds more of what the map
     already does; dropping it blanks the land, which is the defect. Measured: the Istanbul piece on the 1600 and 1650
     sheets is exactly half land (0.50 of its samples) and was dropped under «more land».
   ⚠ (1) IS NOT OPTIONAL — MEASURED. The first version kept every narrow land piece whatever cut it: 199,250 pieces,
     data/hist-clio.js 19.2 → 23.7 MB, and Cliopatria's coarse coasts came back as fringes round the finer shores of
     OpenHistoricalMap and CShapes — 19 new names drawn outside their polity's life («Slovakia», «Lebanon», «Estado
     Novo» to 2019). There the record below is the coarser one: the strip is the record above's own coast under-drawn,
     not a statement of the record below.
   ⚠ AND NOT BELOW THE PRECISION THIS BUILDER ITSELF IMPOSES. Every ring here is simplified at TOL and rounded to DEC
     decimals, so two neighbours that share a border can part by up to 2·(TOL + 10^−DEC/2) — a gap made by this file,
     on land, stated by no record. LAND_W is that bound. expires: with DEC/TOL or the swept bands; canon: here (the
     bands: scripts/build-border-coast.mjs). */
/* the global the sheets' rows are drawn under (data/hist-eras-rest.js is marked as the sheets are) */
const SHEETS = '__HISTERASREST';
const LAND_SHARE = 0.5;
const LAND_W = 2 * (TOL + Math.pow(10, -DEC) / 2);
let WATER = null;
const water = () => WATER || (WATER = coastWater());
/* does the record `below` register the shore more precisely than every cutter (each tagged with its record's global in
   `rec`; untagged = OpenHistoricalMap or CShapes, whose band is the default)? */
export const finerShore = (below, cutters) => cutters.length > 0 && cutters.every((c) => inlandKmFor(below) < inlandKmFor(c.rec));
/* the share of a piece that is land, sampled on scanlines at about half its mean width (at most ~400 points) — every
   interval a scanline crosses contributes its midpoint at least, so a narrow piece is never sampled at zero points */
export function landShare(poly, onLand = water().onLand) {
  const bb = bboxOf([poly]), area = Math.abs(polyAreaOf(poly)), w = meanWidth(poly);
  const step = Math.max(w / 2, Math.sqrt(area / 400), 1e-4);
  let land = 0, n = 0;
  for (let y = bb[1] + step / 2; y < bb[3]; y += step) {
    const xs = [];
    for (const ring of poly) for (let k = 0, m = ring.length, l = m - 1; k < m; l = k++) {
      const a = ring[k], b = ring[l];
      if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    xs.sort((u, v) => u - v);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const x0 = xs[q], x1 = xs[q + 1], k = Math.max(1, Math.round((x1 - x0) / step));
      for (let i = 0; i < k; i++) { n++; if (onLand(x0 + (i + 0.5) * (x1 - x0) / k, y)) land++; }
    }
  }
  if (!n) for (const p of poly[0]) { n++; if (onLand(p[0], p[1])) land++; }
  return n ? land / n : 0;
}
/* a piece is ground when it is wide, or — cut by records with coarser shores — when it is land and wider than the gaps
   this builder makes */
export const isGround = (poly, shoreFiner, onLand) => { const w = meanWidth(poly); return w >= SLIVER_W || (!!shoreFiner && w >= LAND_W && landShare(poly, onLand) >= LAND_SHARE); };
/* ⚠⚠ (hist-findings-sweep) AND «WHERE IT LIES» IS THE RECORD'S OWN SHORE PRECISION, NOT THE RIBBON SCALE. The strip was
   first cut on the SLIVER_W grid (0.2°, 22 km). MEASURED 2026-10-07 on the 1650 sheet: the 0.2° cell south of 41°N holds
   the Marmara shore from Zeytinburnu to the old city AND the sea in front of it, so the cell's part of the strip read
   under half land and was dropped, and the fill ended in a straight line along 41°N — 22 land points of 519 on a
   0.005° grid that the sheet itself covers were blank (production report: «a straight cut across the old city»).
   A cell wider than the record's shore registration judges more sea than the record ever claimed. ⇒ the strip is cut
   at the registration band of the record it belongs to (scripts/build-border-coast.mjs inlandKmFor — the sheets 6 km,
   0.054°), the scale at which that record's shore is known; `shoreFiner` carries that band in km (true = the default band). */
/* ⚠ A NARROW PIECE IS JUDGED WHERE IT LIES, NOT AS ONE THING. A strip between two coastlines runs along the shore for a
   hundred kilometres, land in one place and sea in the next — measured: the strip holding the old city of Istanbul on the
   1600 and 1650 sheets runs west along the Sea of Marmara and is under half land as a whole, so judged whole it was
   dropped with the city in it. So the strip is cut on the SLIVER_W grid — the scale at which this file already calls a
   piece a ribbon — and each part is judged by `isGround`, when the piece as a whole is not ground. → the parts that are ground ([] when none). */
export function groundOf(poly, shoreFiner, onLand) {
  const w = meanWidth(poly);
  if (w >= SLIVER_W) return [poly];
  if (!shoreFiner || w < LAND_W) return [];
  /* whole first: a piece that is ground as one thing stays one thing (Venice in its lagoon — measured, the 0.2° cell
     holding the city is mostly lagoon, the piece as a whole is mostly land) */
  if (isGround(poly, true, onLand)) return [poly];
  const bb = bboxOf([poly]), out = [], C = (typeof shoreFiner === 'number' ? shoreFiner : inlandKmFor()) / KM_PER_DEG;
  for (let x = Math.floor(bb[0] / C) * C; x < bb[2]; x += C)
    for (let y = Math.floor(bb[1] / C) * C; y < bb[3]; y += C) {
      const box = [x, y, x + C, y + C];
      const sh = clipRing(poly[0], box); if (!sh) continue;
      const tile = [sh]; for (const h of poly.slice(1)) { const c = clipRing(h, box); if (c) tile.push(c); }
      for (const t of cleanPolys([tile])) if (isGround(t, true, onLand)) out.push(t);
    }
  return out;
}

const STATS = { clipped: 0, failed: 0, widths: [], landKept: 0 };
/* polys − cutters → what is ground, or null when nothing is left worth drawing */
function subtract(polys, cutters0, area0, shoreFiner = false) {
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
    else { const g = groundOf(c[0], shoreFiner); for (const t of g) kept.push(t); STATS.landKept += g.length; }
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
   identifier nobody could vouch for. The gate re-decides every shipped QID from the committed facts.
   ⚠⚠ BOTH TESTS ASK WHETHER THE ITEM AGREES WITH THE ROW; NEITHER ASKS WHETHER IT IS ABOUT THE WORLD AT ALL.
   Measured 2026-10-05: «Gothia» (207–383) shipped Q422253, a Wikimedia DISAMBIGUATION PAGE — no lifespan, and
   its label is the row's name, so the label test passed it. Of the 1,472 items the facts held, 38 were
   Wikimedia-internal (32 disambiguation pages, 5 list articles, 1 duplicated item — «Han», «Xia», «Rus»,
   «Angles», «Kalinga», «Imam of Yemen»…): items about Wikimedia's own pages, so no lifespan and no label can
   make one the polity drawn. ⇒ An item with a P31 below Q17379835 («Wikimedia page outside the main knowledge
   tree» — the root of that branch of Wikidata's OWN class hierarchy, walked by --fetch with P31/P279*, not a
   list of classes typed here) is REFUSED before either test (`i` in the facts; its P31 are kept as `c` so the
   verdict can be read). The row then falls back to its Wikipedia article's item, put to the same test, or
   ships no QID — measured the same day: 24 name/QID pairs on 103 shipped rows refused, 2 of them answered by
   the article («White Huns» → Hephthalites Q26576, «Western Liang» → Q994451), 22 now ship none (their article
   IS the disambiguation page). expires: never as a rule; the counts are a photograph of the facts of that date.
   ⚠ A facts file fetched WITHOUT the class question has no `i` anywhere and the refusal is silently absent, so
   --fetch records the root it asked about (`internal`) and the gate refuses facts that do not say it. */
export const WIKIMEDIA_INTERNAL = 'Q17379835';
const fold = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
export function verifiedQid(qid, name, span, facts) {
  if (!qid) return false;
  const f = facts[qid];
  if (!f || f.i) return false;
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

/* ══ (hist-findings-sweep) A NAME ON GROUND THAT WAS NOT THAT POLITY'S: review.json `places` ══════════════════════════
   `rows` withhold a name in TIME (before its beginning, after its end); `ground` gives a polity back what another row
   drew over it. Neither can say «this row's name is right here and wrong there». Cliopatria v0.2.1 draws such rows:
     observed 2026-10-07: every «French Indochina» piece the composition ships from 1886 — CShapes answers for Indochina
     itself — is the Kerguelen Islands (from 1895) and Réunion (from 1946), with «Vichy France» as its realm to the end
     of 1945; «Southern Ming» 1673–1682 carries, beside the Zheng realm on Taiwan, the south-west and south-east of the
     mainland, which in those years was the Revolt of the Three Feudatories against the Qing (Wu Sangui's Zhou), not the
     Ming loyalists, whose last emperor was executed in 1662.
   ⇒ a `places` entry names the polity, the years (`s`, `e`: astronomical, inclusive; absent = open) and `within`, a ring
     the misnamed ground lies inside. Over [1 January s, 1 January e + 1) every polygon of the named rows whose outer ring
     lies wholly inside `within` is drawn WITHOUT the name — the shape stays, as a withheld piece (`ws` 'place', `wp` the
     entry's index) — and its card says what the historical record places there (`note`, en + jp, shipped in the bundle's
     `places`). A polygon PARTLY inside fails the build (nothing is cut: the ring is a selector, not a border), and an
     entry that withholds nothing fails the gate. ⚠ It withholds, it does not name: who held the ground is the card's
     sentence, not a polygon IntMap would have to draw. */
export function applyPlaces(rows, review) {
  const P = review.places || [];
  let out = rows;
  P.forEach((R, idx) => {
    const S = R.s != null ? ymd(R.s, 1, 1) : -Infinity, E = R.e != null ? ymd(R.e + 1, 1, 1) : Infinity, next = [];
    for (const r of out) {
      if (r.name !== R.name || r.e <= S || r.s >= E) { next.push(r); continue; }
      const take = [], keep = [];
      for (const p of r.polys) {
        let inn = 0, outn = 0;
        for (const [x, y] of p[0]) { if (inRingXY(R.within, x, y)) inn++; else outn++; }
        if (inn && outn) throw new Error(`review place «${R.name}» ${R.s ?? ''}–${R.e ?? ''}: a polygon of the row ${unymd(r.s).join('-')} lies partly inside \`within\` — the selector would cut land`);
        (inn ? take : keep).push(p);
      }
      if (!take.length) { next.push(r); continue; }
      const s0 = Math.max(r.s, S), e0 = Math.min(r.e, E);
      if (r.s < s0) next.push({ ...r, e: s0 });
      if (keep.length) next.push({ ...r, polys: keep, bb: bboxOf(keep), area: areaOf(keep), s: s0, e: e0 });
      const wm = { ...r.meta, wn: R.name, ws: 'place', wp: idx }; if (R.wd) wm.wq = R.wd;
      next.push({ ...r, name: '', qid: null, meta: wm, polys: take, bb: bboxOf(take), area: areaOf(take), s: s0, e: e0 });
      if (r.e > e0) next.push({ ...r, s: e0 });
    }
    out = next;
  });
  return out;
}
const inRingXY = (ring, x, y) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };

/* ══ WHEN CLIOPATRIA GIVES A POLITY'S GROUND TO ANOTHER, CONTINUING ROW BEFORE ITS FIRST ROW (sudan-mahdist-1886) ══
   The finding above asks whether a NAME is drawn outside its polity's life. It cannot see the opposite: a polity
   whose life history places years before Cliopatria's first row for it, while those years' ground is drawn under a
   row that goes on being drawn afterwards. Cliopatria's rows are snapshots (median span 8 years), so a state that
   arose between two snapshots is drawn from the second, and the ground in between keeps whatever held it before.
     observed 2026-10-05 (production, build 076f908): on 1 July 1886 the Sudan was drawn as «British Africa» — 745
     cells (0.25°) of the Mahdist State's first row (1890) held by «British Africa» (of the British Empire) on every
     instant 1885–1889. Upstream: «British Africa» 1885–1889 carries Egypt AND the Sudan; «Mahdist State» begins
     1890; Wikidata Q3125368 states 1885. History: Khartoum fell on 26 January 1885 and Britain had made Egypt give
     the Sudan up in 1884 — no British claim, nominal or other, lay on that ground until the reconquest of 1896–98.
   ⇒ The machine FINDS (`heldFindingsOf`) and scripts/histclio/review.json JUDGES, as above, in `ground`:
     `rows` — the polity held its first row's ground from `s` (history's year): from 1 January of `s` until the
     first row, what the rows named in `over` draw inside that row's outline is drawn under the polity's name
     instead (`hy` the year the outline is Cliopatria's, `hs` the year history gives, `ho` the rows it is taken
     from), and those rows keep the rest. ⚠ The outline is the first row's, carried back — a derivation, so the row says so and
     the card says so (historical-verification.md §2-3). `refuted` — examined and not applied, with the reason.
     `pending` — not yet judged: drawn as Cliopatria states, and counted (written by the build).
   A finding: a polity with a verified QID whose Wikidata start is at least HELD_YEARS before its first row, and a
   named row that is still drawn after that first row and holds at least HELD_COVER of the first row's ground on at
   least HELD_YEARS instants (1 July) between the two. ⚠ «First row» is UPSTREAM's first year (the bundle's `ids`
   span), not the first shipped piece: a row the records above answered for is not a row Cliopatria began late
   (measured: the Hotaki Dynasty begins in 1709 upstream, as history does, and OHM states Kandahar until 1713 — the
   shipped piece of 1713 is another ground).
     observed 2026-10-05: 282 findings across all history at these values — most are snapshot lag between a
     predecessor and its successor in the ancient and medieval rows (272 left pending). Of the 10 polities whose
     first row is from 1700 on, the Mahdist State is the largest by ground (2,973 cells) and the only one of the
     partition of Africa; it is applied, and the other 9 are refuted (the other state governed there, or the ground
     is not the polity's). HELD_COVER 0.8: the successor's ground is taken whole,
     not a border dispute; HELD_YEARS 3: below it the two records differ by a snapshot's rounding, not a state.
   expires: when Cliopatria's release or the grid (GR) changes; canon: here. */
const HELD_COVER = 0.8, HELD_YEARS = 3;
const heldKeys = (R) => (R.over || []).map((x) => R.name + '|' + x);
export const groundJudged = (G) => new Set([...(G.rows || []), ...(G.refuted || [])].flatMap(heldKeys));
export function heldFindingsOf(feats, rings, facts, ids = {}) {
  const k0 = (f) => ymd(f[2], f[3], f[4]), k1 = (f) => ymd(f[5], f[6], f[7]);
  const named = feats.filter((f) => f[0] && f[0].en && !(f[9] && f[9].r));
  const first = new Map(), last = new Map();
  for (const f of named) {
    const n = f[0].en, o = first.get(n);
    if (!o || k0(f) < k0(o[0])) first.set(n, [f]); else if (k0(f) === k0(o[0])) o.push(f);
    last.set(n, Math.max(last.has(n) ? last.get(n) : -Infinity, k1(f)));
  }
  const memo = new Map(), polysOf = (f) => f[8].map((p) => p.map((i) => rings[i]));
  const cellsF = (f) => { let c = memo.get(f); if (!c) { const ps = polysOf(f); c = { cells: cellsOf(ps), bb: bboxOf(ps) }; memo.set(f, c); } return c; };
  const out = [];
  for (const [n, fs] of first) {
    const q = fs[0][1], x = q && facts[q];
    if (!x || !x.s || !x.s.length) continue;
    const s = Math.min(...x.s), F = Math.min(fs[0][2], ids[n] ? ids[n][0] : Infinity), T = Math.min(k0(fs[0]), ymd(F, 1, 1));
    if (F - s < HELD_YEARS) continue;
    const P = new Set(); let bb = null;
    for (const f of fs) { const c = cellsF(f); for (const v of c.cells) P.add(v); bb = bb ? [Math.min(bb[0], c.bb[0]), Math.min(bb[1], c.bb[1]), Math.max(bb[2], c.bb[2]), Math.max(bb[3], c.bb[3])] : c.bb; }
    if (P.size < CUT_CELLS) continue;
    const by = new Map(), lo = ymd(s, 1, 1);
    for (const g of named) {
      const X = g[0].en;
      if (X === n || k1(g) <= lo || k0(g) >= T || !(last.get(X) > T)) continue;
      const c = cellsF(g); if (!meets(c.bb, bb)) continue;
      let hit = 0; for (const v of c.cells) if (P.has(v)) hit++;
      if (hit < HELD_COVER * P.size) continue;
      const ys = by.get(X) || new Set();
      for (let y = s; y < F; y++) { const t = ymd(y, 7, 1); if (k0(g) <= t && t < k1(g)) ys.add(y); }
      by.set(X, ys);
    }
    for (const [X, ys] of by) if (ys.size >= HELD_YEARS) out.push({ name: n, q, over: X, from: Math.min(...ys), to: Math.max(...ys), first: F, wd: s, cells: P.size });
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.over < b.over ? -1 : a.over > b.over ? 1 : 0));
}
/* the rows as they will be drawn (already cut against OHM and CShapes), with each judged `ground` row applied.
   ⚠ IT REASSIGNS, IT DOES NOT ADD: between 1 January of `s` and the polity's first row, the part of each `over` row that lies inside the first
   row's outline is drawn under the polity's name instead, and the `over` row keeps the rest. Nothing is drawn where
   no `over` row drew, so a judgement cannot lay the polity over a third record's ground (a first version drew the
   whole outline over the whole span; measured on Saxe-Meiningen, carried to 1680, that would have covered every row
   Cliopatria draws in Thuringia for 128 years). The realms the `over` rows are members of (`of`) lose the same
   ground, because a realm is drawn as the union of its members (measured: «(British Empire)» carried the Sudan in
   1885–1889 beside «British Africa»).
   ⚠ THE SPLIT IS EXACT, AND IT IS MADE AFTER THE RECORDS ABOVE. `subtract` drops what is narrower than SLIVER_W as two
   hands drawing one border, and between two records that is right; here both hands are Cliopatria's (its outline of
   1885 and its outline of 1890), and the ribbon is ground one of them holds. Measured: made before the cut against
   CShapes, the Red Sea coast by Suakin and the strip below Wadi Halfa — both held by Egypt throughout — were left as
   ribbons of «British Africa», the cut against CShapes' Egypt then dropped them, and they fell off the map in 1886
   (2.75 deg², the world's land inside a polity 83.68% → 83.66%). So the split is made on the drawn rows and the
   `over` row keeps every piece outside the outline, however narrow. The first row is the first DRAWN row. */
function cut(op, polys, other) {
  const o = clipPolys(other, bboxOf(polys)); if (!o.length) return op === 'difference' ? polys : null;
  let res; try { res = pc[op](toPC(polys), toPC(o)); STATS.clipped++; } catch (e) { STATS.failed++; return op === 'difference' ? polys : null; }
  const kept = cleanPolys(fromPC(res));
  return kept.length ? kept : null;
}
export const takesGround = (R, realms) => (r) => R.over.includes(r.name) || (!!(r.meta && r.meta.r) && realms.has(r.name));
/* ══ (clio-year-page-findings) THE SAME QUESTION BETWEEN TWO OF THE POLITY'S OWN ROWS: `e` ══════════════════════════
   The finding above is about the years BEFORE a polity's first row. The same misreading also happens in the
   middle of a life: Cliopatria draws another state over a polity's ground for some years, and the polity's own
   row comes back afterwards with the same outline.
     observed 2026-10-07 (the year pages): on 1 July 1945 Greenland — 10,902 cells, about 2.19 million km² — was
     drawn as «United States of America». Upstream: «Greenland» 1924–1940, «United States of America» 1941–1945 with
     the very rings «Denmark» carries from 1946. History: the Agreement relating to the Defense of Greenland
     (Washington, 9 April 1941) opened defence areas to the United States while «fully recognizing the sovereignty of
     the Kingdom of Denmark over Greenland»; the island stayed under Danish administration (its landsfoged Eske Brun).
   ⇒ a `ground.rows` entry that also states `e` (the last year history places the ground under the polity while the
     `over` rows draw it) carries the outline of the polity's first row FROM 1 January of `e + 1` BACK to 1 January of
     `s`, and reassigns exactly as above — the `over` rows keep everything outside that outline. The row says so
     (`he`, beside `hy`/`hs`/`ho`) and the card says so. The line is the same: did the `over` state govern that ground in
     those years? A force present by the sovereign's agreement is not a government of the ground. */
function heldSpan(R, mine) {
  const S = ymd(R.s, 1, 1);
  if (R.e == null) { const T = Math.min(...mine.map((r) => r.s)); return { S, T, E: T, firsts: mine.filter((r) => r.s === T) }; }
  const E = ymd(R.e + 1, 1, 1), after = mine.filter((r) => r.s >= E);
  if (!after.length) return null;
  const T = Math.min(...after.map((r) => r.s));
  return { S, T, E, firsts: after.filter((r) => r.s === T) };
}
/* ══ ⚠⚠ (coast-snap-gaps) THE `over` ROW'S CLAIM ON THE GROUND IS GIVEN BACK WHOLE, NOT ONLY WHERE THE OUTLINE REACHES ══
   The split above is exact: the `over` row keeps every piece outside the polity's outline. That is right where the
   `over` row's polygon is a larger ground than the judged one (British Africa is Egypt AND the Sudan) — but wrong
   where the polygon IS the judged ground and only the two outlines disagree about its edge.
     observed 2026-10-08 (production, build 10d4c3b): on 1 July 1933 East Greenland kept four triangles of «Kingdom of
     Norway» (9–93 km², 0.9–2.5 km wide) at 23.7–23.0°W by 72.05–72.29°N and 20.8–19.5°W by 75.12–75.37°N on the edge
     of the Greenland fill: Cliopatria's 1932–1935 strip of «Eirik Raudes Land» less Greenland's 1936 outline. The
     judgement is that Norway never governed that ground; the four triangles are the same claim, left under the wrong
     state because two of Cliopatria's own drawings of one edge are a few km apart.
   ⇒ per POLYGON of an `over` row: when every piece of it outside the outline is narrower (mean width, km) than the
     record's own registration band (scripts/build-border-coast.mjs `inlandKmFor` — Cliopatria 10 km: two drawings of
     one edge by one record differ by up to that), the polygon is the claim on the judged ground and the polity takes
     it whole. When any piece outside is wider, the polygon is a larger ground than the judged one and the split stays
     exact. ⚠ NOT SLIVER_W, MEASURED: the 22 km ribbon scale took the Red Sea coast north of Suakin (6,834 km², 10.7 km
     wide) and the desert strip by the Egyptian frontier (23,184 km², 18.9 km) from «British Africa» to the Mahdist
     State in 1886–1889 — Egypt-held ground the exact split exists to keep (sudan-mahdist-1886). At the record's band
     those keep their polygon split exactly, as before; the Norwegian strip is taken whole.
     The realms the `over` rows belong to lose the same ground.
   expires: with the record's band (`inlandKmFor`); canon: here. The gate (`checkGround`) re-measures it on the shipped rows. */
export function meanWidthKm(p) {
  const lat = p[0].reduce((a, q) => a + q[1], 0) / p[0].length, kx = Math.cos(lat * Math.PI / 180) * KM_PER_DEG;
  let A = 0, P = 0;
  p.forEach((r, k) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { a += (r[j][0] - r[i][0]) * kx * (r[j][1] + r[i][1]) * KM_PER_DEG; P += Math.hypot((r[i][0] - r[j][0]) * kx, (r[i][1] - r[j][1]) * KM_PER_DEG); } A += (k ? -1 : 1) * Math.abs(a / 2); });
  return P > 0 ? 2 * A / P : 0;
}
export const heldWhole = (inside, outside, rec = '__HISTCLIO') => !!inside && (!outside || outside.every((q) => meanWidthKm(q) < inlandKmFor(rec)));
function applyHeld(rows, G) {
  let out = rows;
  for (const R of (G && G.rows) || []) {
    /* the polity's OWN rows — not rows another judgement already carried back under its name (hist-findings-sweep:
       Denmark is judged twice, Greenland 1941–1945 and the Faroe Islands 1941–1944, and the second must take the outline
       of Cliopatria's own 1945 row, not the first judgement's derived one) */
    const mine = out.filter((r) => r.name === R.name && !(r.meta && r.meta.hy != null));
    if (!mine.length) continue;
    const span = heldSpan(R, mine);
    if (!span) continue;
    const { S, T, E, firsts } = span;
    if (!(S < E)) continue;
    let polys = firsts[0].polys;
    if (firsts.length > 1) { try { polys = cleanPolys(fromPC(pc.union(...firsts.map((r) => toPC(r.polys))))); } catch (e) { polys = firsts.flatMap((r) => r.polys); } }
    const meta = { ...firsts[0].meta, hy: unymd(T)[0], hs: R.s, ho: R.over.join(', ') };
    if (R.e != null) meta.he = R.e;
    const next = [], realms = new Set(out.filter((r) => R.over.includes(r.name) && r.meta && r.meta.of).map((r) => r.meta.of)), takes = takesGround(R, realms);
    /* (coast-snap-gaps) the `over` rows first, polygon by polygon (`heldWhole`); what a polygon taken whole had outside the
       outline is also taken from the realms over the same years */
    const split = new Map(), extra = [];
    for (const r of out) {
      if (!R.over.includes(r.name) || r.e <= S || r.s >= E) continue;
      const keep = [], held = [];
      for (const p of r.polys) {
        const inside = cut('intersection', [p], polys);
        if (!inside) { keep.push(p); continue; }
        const outside = cut('difference', [p], polys);
        if (heldWhole(inside, outside)) { held.push(p); if (outside) extra.push({ s: Math.max(r.s, S), e: Math.min(r.e, E), polys: outside }); }
        else { held.push(...inside); if (outside) keep.push(...outside); }
      }
      split.set(r, { keep, held });
    }
    if (extra.length) console.error(`ground: «${R.name}» over ${R.over.join(', ')} ${R.s}–${R.e ?? ''}: ${extra.length} polygon(s) of the over rows taken whole (only pieces narrower than the record's band lay outside the outline)`);
    for (const r of out) {
      if (!takes(r) || r.e <= S || r.s >= E) { next.push(r); continue; }
      if (r.s < S) next.push({ ...r, e: S });
      const s0 = Math.max(r.s, S), e0 = Math.min(r.e, E), sp = split.get(r);
      let g, h = null;
      if (sp) { g = sp.keep.length ? sp.keep : null; h = sp.held.length ? sp.held : null; }
      else {
        g = cut('difference', r.polys, polys);
        for (const x of extra) if (g && x.s < e0 && x.e > s0) {
          /* ⚠ a realm row longer than the over row it shares the ground with would lose it for longer — refused, not guessed */
          if (x.s > s0 || x.e < e0) throw new Error(`ground «${R.name}»: the realm row «${r.name}» spans more than the over row whose ribbons it would lose — split it first`);
          g = cut('difference', g, x.polys); }
      }
      if (g) next.push({ ...r, polys: g, bb: bboxOf(g), area: areaOf(g), s: s0, e: e0 });
      if (h) next.push({ name: R.name, qid: firsts[0].qid, meta, polys: h, bb: bboxOf(h), area: areaOf(h), s: s0, e: e0 });
      if (r.e > E) next.push({ ...r, s: E });
    }
    out = next;
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
  /* the identity facts: P571 / P576 / English label of every QID either statement names, its P31, and whether any
     P31 lies below Wikidata's root of Wikimedia-internal items (WIKIMEDIA_INTERNAL) — the class tree is Wikidata's to walk */
  const qs = [...new Set(rows.map((p) => p.Wikidata).filter(Boolean).concat(Object.values(wiki)))];
  const facts = {};
  for (let i = 0; i < qs.length; i += 200) {
    const b = qs.slice(i, i + 200);
    const q = 'SELECT ?i ?s ?e ?l ?c ?w WHERE { VALUES ?i { ' + b.map((x) => 'wd:' + x).join(' ') + " } OPTIONAL{?i wdt:P571 ?s} OPTIONAL{?i wdt:P576 ?e} OPTIONAL{?i rdfs:label ?l FILTER(lang(?l)='en')} OPTIONAL{?i wdt:P31 ?c} BIND(EXISTS{?i wdt:P31/wdt:P279* wd:" + WIKIMEDIA_INTERNAL + "} AS ?w) }";
    for (const x of (await wdFetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), 'application/sparql-results+json')).results.bindings) {
      const id = x.i.value.split('/').pop(), o = facts[id] || (facts[id] = {});
      const yr = (v) => { const m = /^(-?)(\d+)-/.exec(v); return m ? (m[1] ? -(+m[2]) : +m[2]) : null; };
      for (const [k, v] of [['s', x.s], ['e', x.e]]) if (v) { const y = yr(v.value); if (y != null) (o[k] = o[k] || []).includes(y) || o[k].push(y); }
      if (x.l) o.l = x.l.value;
      if (x.c) { const c = x.c.value.split('/').pop(); (o.c = o.c || []).includes(c) || o.c.push(c); }
      if (x.w && x.w.value === 'true') o.i = 1;
    }
    console.error('wikidata ' + Math.min(i + 200, qs.length) + '/' + qs.length);
  }
  const sorted = {};
  for (const q of Object.keys(facts).sort((a, b) => +a.slice(1) - +b.slice(1))) { const o = facts[q]; for (const k of ['s', 'e']) if (o[k]) o[k].sort((a, b) => a - b); if (o.c) o.c.sort((a, b) => +a.slice(1) - +b.slice(1)); sorted[q] = o; }
  const rec = JSON.parse(readFileSync(FACTS, 'utf8'));
  const wsorted = Object.fromEntries(Object.keys(wiki).sort().map((k) => [k, wiki[k]]));
  writeFileSync(FACTS, JSON.stringify({ ...rec, fetched: new Date().toISOString().slice(0, 10), internal: WIKIMEDIA_INTERNAL, facts: sorted, wiki: wsorted }));
}
export function readUpstream() {   /* (border-provenance) the upstream rows, read once by the provenance index too */
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
    if (g === undefined) { g = subtract(row.polys, inForce.map((o) => o.polys), row.area, finerShore(row.rec || '__HISTCLIO', inForce) && inlandKmFor(row.rec || '__HISTCLIO')); memo.set(key, g); }
    if (prev && prev.g === g && prev.e === t0) { prev.e = t1; continue; }
    if (g) { prev = { s: t0, e: t1, polys: g, g }; pieces.push(prev); } else prev = null;
  }
  return pieces.map(({ s, e, polys }) => ({ s, e, polys }));
}
/* the Cliopatria rows the composition draws, each as { name, qid, meta, polys, bb, area, s, e } —
   the rows that reach into OHM's band are handed to `clip` (the worker pool) */
async function clioRows(features, ohm, clip, ground) {
  const [hbLo] = ohm.window, T_HB = ymd(hbLo, 1, 1);
  const out = [], band = [];
  let leaf = 0, relation = 0, aggregate = 0, late = 0;
  /* ⚠ a row starting on or after ohm.top (a YYYYMMDD) is a row starting after lastY — the same cut identityOf makes */
  const lastY = Math.floor(ohm.top / 10000) - (ohm.top % 10000 === 101 ? 1 : 0);
  const { qidFor, verdict, ids } = identityOf(features, lastY, readFacts(), readWiki(), ground);
  const all = [];
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
    all.push({ name: realm ? p.Name.slice(1, -1) : p.Name, qid: qidFor(p), meta, polys, bb: bboxOf(polys), area: areaOf(polys), s, e });
  }
  for (const r of all) {
    const { s, e } = r;
    if (e <= T_HB) { out.push(r); continue; }
    /* the part below OHM's floor is Cliopatria's alone */
    if (s < T_HB) out.push({ ...r, e: T_HB });
    band.push({ ...r, s: Math.max(s, T_HB), e });
  }
  const vs = [...verdict.values()];
  const named = new Set(), withQ = new Set(); for (const r of out.concat(band)) { named.add(r.name); if (r.qid) withQ.add(r.name); }
  console.error(`cliopatria: ${features.length} rows — ${leaf} polity rows to CShapes' last day (${aggregate} of them realms over their members), ${relation} relations not drawn, ${late} after it; ${band.length} reach into OpenHistoricalMap's or CShapes' years and are cut against them; identity tests passed ${vs.filter(Boolean).length}, failed ${vs.filter((v) => !v).length}; names with a verified QID ${withQ.size} of ${named.size}`);
  const done = await clip(band.map((row) => ({ kind: 'row', row })));
  band.forEach((row, i) => { for (const pc of done[i]) out.push({ ...row, s: pc.s, e: pc.e, polys: pc.polys }); });
  /* (sudan-mahdist-1886) the judged `ground` rows act on the rows as they will be DRAWN — after OHM and CShapes are
     taken out — because that is what the finding measured and what a reader sees (see `applyHeld`) */
  const held = applyHeld(out, ground); out.length = 0; for (const r of held) out.push(r);
  out.ids = ids;
  return out;
}
const bare = (n) => (/^\(.*\)$/.test(n) ? n.slice(1, -1) : n);
/* WHICH QID EACH CLIOPATRIA ROW SHIPS — one decision, read by the build and by --identities.
   lastY: the last year the composition draws (a row starting after it is not drawn; a span is cut at it);
   ground: scripts/histclio/review.json `ground`.
   → { qidFor(properties), verdict: Map('name|Q' → bool), ids: { name: [first, last] } } */
export function identityOf(features, lastY, facts, wikiQ, ground) {
  /* the span Cliopatria draws each NAME over (astronomical years) — the span as SHIPPED (cut at 1886, a realm
     under its unbracketed name), the one the offline gate can re-measure */
  const spanOf = new Map();
  const drawn = (p) => p.Type === 'POLITY' && astro(p.FromYear) <= lastY;
  for (const ft of features) { const p = ft.properties; if (!drawn(p)) continue;
    const k = bare(p.Name), sp = spanOf.get(k) || [Infinity, -Infinity]; sp[0] = Math.min(sp[0], astro(p.FromYear)); sp[1] = Math.max(sp[1], Math.min(astro(p.ToYear), lastY)); spanOf.set(k, sp); }
  /* (sudan-mahdist-1886) a judged `ground` row draws the polity from the year history gives — the span its QID is
     decided on, and the one the gate re-decides on, starts there */
  for (const R of (ground && ground.rows) || []) { const sp = spanOf.get(R.name); if (sp) sp[0] = Math.min(sp[0], R.s); }
  const verdict = new Map();
  /* the release's own QID first; when it is shown NOT to be the polity, the item of the Wikipedia article the
     same row names — measured 2026-10-04: «Han Dynasty» carries Q1068371 (Chauhan) and names the article
     «Han dynasty» (Q7209); both are put to the same test, and neither is taken on trust */
  const decide = (q, n) => { const k = n + '|' + q; if (!verdict.has(k)) verdict.set(k, verifiedQid(q, n, spanOf.get(n), facts)); return verdict.get(k) ? q : null; };
  const qidFor = (p) => decide(p.Wikidata, bare(p.Name)) || (p.Wikipedia && wikiQ[p.Wikipedia] && wikiQ[p.Wikipedia] !== p.Wikidata ? decide(wikiQ[p.Wikipedia], bare(p.Name)) : null);
  for (const ft of features) if (drawn(ft.properties)) qidFor(ft.properties);
  /* the span each verified QID was decided on — the bundle carries it, because the rows it ships are fewer
     than the rows the decision read (OHM answers part of them), and the gate must re-decide on the same span */
  const ids = {};
  for (const [k, ok] of verdict) if (ok) { const n = k.slice(0, k.lastIndexOf('|')); ids[n] = spanOf.get(n); }
  return { qidFor, verdict, ids };
}

/* ── 2. the sheets, less what is above them at their own year ─────────────── */
/* one sheet's polygons, each less the records above it — [{ polys, whole } | null] in the sheet's own order */
function cutSheet(polysList, above) {
  return polysList.map((polys) => {
    if (!polys.length) return null;
    const bb = bboxOf(polys), hitR = cuttersOf(cellsOf(polys), above.filter((a) => meets(a.bb, bb))), hit = hitR.map((a) => a.polys);
    const g = subtract(polys, hit, areaOf(polys), finerShore(SHEETS, hitR) && inlandKmFor(SHEETS));
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
    const above = clio.filter((c) => c.s <= t && c.e > t).map((c) => ({ polys: c.polys, bb: c.bb, cells: c.cells || (c.cells = cellsOf(c.polys)), rec: '__HISTCLIO' }));
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
    rows.push({ r, row: { s, e, polys, bb: bboxOf(polys), area: areaOf(polys), rec: '__HISTBLATE' } });
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
/* (hist-findings-sweep) ⚠ THE KEY NAMES THE GROUND RULE TOO. It hashed the inputs only, so a change to what `subtract` keeps
   (SLIVER_W, LAND_W, LAND_SHARE, the cell a narrow strip is judged in) was answered from the old rule's results by any
   build that found them on disk — and the disk cache is shared by every worktree on the machine. */
const GROUND_RULE = JSON.stringify({ sliver: SLIVER_W, landW: LAND_W, landShare: LAND_SHARE, cell: 'record-shore-band' });
function jobKey(job, ohmSha) {
  const g = job.kind === 'row' || job.kind === 'late' ? { k: job.kind, s: job.row.s, e: job.row.e, area: job.row.area, polys: job.row.polys }
    : { k: 'sheet', t: job.t, band: job.band, list: job.polysList, above: job.above.map((a) => a.polys) };
  return createHash('sha256').update(ohmSha).update(GROUND_RULE).update(JSON.stringify(g)).digest('hex'); }
function pool(ohm) {
  const N = Math.max(1, Math.min(16, (os.availableParallelism ? os.availableParallelism() : os.cpus().length) - 2));
  const workers = [];
  for (let i = 0; i < N; i++) workers.push(new Worker(fileURLToPath(import.meta.url), { workerData: { role: 'clip', ohm }, resourceLimits: { maxOldGenerationSizeMb: 4096 } }));
  mkdirSync(JOBS, { recursive: true });
  const LAND = ':land:' + LAND_W + ':' + LAND_SHARE + ':tiled2:shore:' + inlandKmFor('__HISTCLIO') + '/' + inlandKmFor(SHEETS) + '/' + inlandKmFor() + ':' + sha(join(ROOT, 'data', 'coastline.json.gz'));
  const ohmSha = sha(HB) + ':' + sha(CSF) + ':' + SLIVER_W + LAND + ':ground:' + DEC + ':' + CUT_CELLS + (existsSync(HBL) ? ':late:' + sha(HBL) : '');
  /* (hist-colonial-era-borders) a 'late' job is cut against CShapes alone — its key must not hold the file it writes */
  const csSha = sha(CSF) + ':' + SLIVER_W + LAND + ':ground:' + DEC + ':' + CUT_CELLS;
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
        STATS.clipped += m.stats.clipped; STATS.failed += m.stats.failed; STATS.landKept += m.stats.landKept || 0; for (const x of m.stats.widths) STATS.widths.push(x);
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
    STATS.clipped = 0; STATS.failed = 0; STATS.widths = []; STATS.landKept = 0; CUTSTAT.kept = 0; CUTSTAT.ignored = 0;
    let out;
    if (job.kind === 'row') out = splitRow(job.row, ohmRowsW);
    else if (job.kind === 'late') out = splitRow(job.row, csRowsW);
    else {
      const above = job.above.slice();
      if (job.band) for (const o of ohmRowsW) if (o.s <= job.t && o.e > job.t) above.push(o);
      out = cutSheet(job.polysList, above);
    }
    parentPort.postMessage({ id, out, stats: { clipped: STATS.clipped, failed: STATS.failed, landKept: STATS.landKept, widths: STATS.widths, kept: CUTSTAT.kept, ignored: CUTSTAT.ignored } });
  });
}

/* (hist-colonial-era-borders) `--ohm-late`: re-cut data/hist-borders-late.js from OpenHistoricalMap's cache. A separate
   step, because only it needs that cache — `build` reads the committed file as a record above Cliopatria. */
async function lateOnly() {
  const ohm = ohmRows(), P = pool(ohm);
  try { await ohmLate(ohm, P.run, lateTop()); } finally { await P.close(); }
}

/* the findings nobody has judged yet, written to scripts/histclio/review.json as pending — both depend on the
   shipped QIDs (the lifespan each is compared with), so --identities re-lists them too */
function writePending(review, feats, rings, ids) {
  const judged = judgedKeys(review);
  const found = findingsOf(feats, readFacts());
  review.pending = found.filter((x) => !judged.has(x.name + '|' + x.side)).map((x) => ({ name: x.name, q: x.q, side: x.side, drawn: x.drawn, wd: x.wd }));
  /* (sudan-mahdist-1886) …and the findings of ground given to a continuing row before a polity's first row */
  const G = review.ground || (review.ground = { rows: [], refuted: [], pending: [] }), gj = groundJudged(G);
  const held = heldFindingsOf(feats, rings, readFacts(), ids);
  G.pending = held.filter((x) => !gj.has(x.name + '|' + x.over)).map(({ name, q, over, from, to, first, wd }) => ({ name, q, over, from, to, first, wd }));
  console.error(`ground: ${held.length} finding(s) still raised — ${G.rows.length} polity(ies) drawn back by a reviewed row, ${G.refuted.length} refuted, ${G.pending.length} pending`);
  writeFileSync(REVIEW, JSON.stringify(review, null, 1) + '\n');
  return found;
}

/* ── --identities: RE-DECIDE THE SHIPPED QIDs, AND NOTHING ELSE ──────────────────────────────────────────
   Which QID a row ships is a decision about identity; the composition is minutes of polygon subtraction that
   no identity can change (a row's shape and dates do not depend on its QID, nor does what the sheets below
   keep — restSheets reads only polygons and dates). So a change to the identity test or to the facts is
   re-decided here: every shipped named row is keyed back to the upstream rows by (name, Wikipedia article)
   — measured 2026-10-05, that key names ONE Wikidata value in all 1,567 keys of the pinned release, and the
   mode refuses to run when it does not — and ships the QID `identityOf`, the build's own decision, gives it.
   The pending findings are re-listed, and data/hist-eras-rest.js's record of the bundle it was cut against
   moves to the new bytes: its geometry was cut against the same shapes. */
function identities() {
  const d = evalBundle(OUT, '__HISTCLIO');
  const features = readUpstream();
  const review = JSON.parse(readFileSync(REVIEW, 'utf8'));
  const { qidFor, ids } = identityOf(features, d.window[1], readFacts(), readWiki(), review.ground);
  const byKey = new Map();
  for (const ft of features) { const p = ft.properties; if (p.Type !== 'POLITY' || astro(p.FromYear) > d.window[1]) continue;
    const k = bare(p.Name) + '\u0000' + (p.Wikipedia || ''), q = qidFor(p) || null;
    if (byKey.has(k) && byKey.get(k) !== q) throw new Error('«' + bare(p.Name) + '» / «' + (p.Wikipedia || '') + '» decides two QIDs (' + byKey.get(k) + ', ' + q + ') — the key no longer names one row; rebuild in full');
    byKey.set(k, q); }
  const changed = new Map();
  for (const f of d.feats) {
    if (!f[0].en) continue;
    const k = f[0].en + '\u0000' + ((f[9] && f[9].w) || '');
    if (!byKey.has(k)) throw new Error('shipped row «' + f[0].en + '» matches no upstream row — rebuild in full');
    const q = byKey.get(k);
    if (q !== f[1]) { const c = f[0].en + '  ' + (f[1] || '—') + ' → ' + (q || '—'); changed.set(c, (changed.get(c) || 0) + 1); f[1] = q; }
  }
  d.ids = Object.fromEntries(Object.keys(ids).sort().map((k) => [k, ids[k]]));
  writeFileSync(OUT, 'window.__HISTCLIO=' + JSON.stringify(d) + ';\n');
  const r = evalBundle(REST, '__HISTERASREST');
  r.basis['data/hist-clio.js'] = sha(OUT);
  writeFileSync(REST, 'window.__HISTERASREST=' + JSON.stringify(r) + ';\n');
  writePending(review, d.feats, d.rings, d.ids);
  let rows = 0; for (const v of changed.values()) rows += v;
  console.error('identities: ' + rows + ' shipped row(s) of ' + changed.size + ' name/QID pair(s) change QID' + (changed.size ? ':' : ''));
  for (const [c, v] of changed) console.error('  ' + c + '  (' + v + ' row' + (v > 1 ? 's' : '') + ')');
  console.error('review: ' + review.pending.length + ' pending');
}

/* ── build ───────────────────────────────────────────────────────────────── */
async function build({ measure } = {}) {
  const ohm = ohmRows();
  const P = pool(ohm);
  console.error(`subtracting on ${P.N} threads`);
  try {
    const review = JSON.parse(readFileSync(REVIEW, 'utf8'));
    const raw = await clioRows(readUpstream(), ohm, P.run, review.ground), clio = applyPlaces(applyReview(raw, review), review);
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
      ids: Object.fromEntries(Object.keys(raw.ids).sort().map((k) => [k, raw.ids[k]])),
      /* (hist-findings-sweep) what the card says on a piece review.json `places` withholds (`wp` indexes this) */
      places: (review.places || []).map((R) => ({ en: R.note.en, jp: R.note.jp })) };
    const body = 'window.__HISTCLIO=' + JSON.stringify({ ...head, rings, feats }) + ';\n';
    writeFileSync(OUT, body);
    /* the findings nobody has judged yet are listed as pending — counted, drawn as Cliopatria states them */
    const found = writePending(review, feats, rings, head.ids);
    console.error(`review: ${found.length} finding(s) — ${review.rows.length} name(s) withheld by a reviewed row, ${review.refuted.length} refuted, ${review.pending.length} pending`);
    console.error(`data/hist-clio.js: ${feats.length} rows, ${rings.length} rings, ${rings.reduce((a, r) => a + r.length, 0)} points, ${(body.length / 1e6).toFixed(2)} MB`);

    const rest = await restSheets(clio, ohm, P.run);
    const rbody = 'window.__HISTERASREST=' + JSON.stringify({ v: 1, src: REST_SRC, end: 'sheet',
      basis: { 'data/hist-eras.js': sha(ER), 'data/hist-clio.js': sha(OUT), 'data/hist-borders.js': sha(HB) },
      rings: rest.rings, snaps: rest.snaps }) + ';\n';
    writeFileSync(REST, rbody);
    console.error(`data/hist-eras-rest.js: ${rest.snaps.length} sheets, ${rest.rings.length} rings, ${(rbody.length / 1e6).toFixed(2)} MB`);
    console.error(`subtractions ${STATS.clipped}, failed (kept whole) ${STATS.failed}; narrow pieces kept as land ${STATS.landKept}; cutters kept ${CUTSTAT.kept} / ignored as border ribbons ${CUTSTAT.ignored}`);
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
  ok(JSON.parse(readFileSync(FACTS, 'utf8')).internal === WIKIMEDIA_INTERNAL, 'scripts/histclio/wikidata.json was not fetched with the class question (internal: ' + WIKIMEDIA_INTERNAL + ') — a Wikimedia disambiguation page would pass the label test; node scripts/build-hist-clio.mjs --fetch, then --identities');
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
    const stray = d.feats.filter((f) => { const m = f[9] || {}; if (!m.wn || m.ws == null) return false;
      if (m.ws === 'place') { const P = (review.places || [])[m.wp]; return !(P && P.name === m.wn); }
      const R = byName.get(m.wn); if (!R) return false;
      if (m.ws === 'start') return m.wy !== R.s; if (m.ws === 'end') return m.wy !== R.e;
      if (m.ws === 'gap') return !(R.gaps || []).some(([a, b]) => m.wy === a - 1 && m.wz === b + 1);
      return true; });
    ok(stray.length === 0, stray.length + ' withheld Cliopatria row(s) carry a side or year no reviewed row states: ' + stray.slice(0, 3).map((f) => f[9].wn + ' ' + f[9].ws + ' ' + f[9].wy).join(', '));
    checkGround(d, review, ok);
    checkPlaces(d, review, ok); }
  /* ⚠ CC BY 4.0 MAKES CREDIT A CONDITION OF REDISTRIBUTION: the reader-facing row must exist, by its exact name */
  const ref = readFileSync(join(ROOT, 'js', 'reference-data.js'), 'utf8');
  ok(ref.includes("n:'" + CREDIT_ROW + "'") && /lic:'CC BY 4.0'/.test(ref.slice(ref.indexOf(CREDIT_ROW))), 'js/reference-data.js does not credit Cliopatria as «' + CREDIT_ROW + '» with its licence');
  /* (coast-snap-gaps) the land the records' coasts left out — made against these records, every piece on no record */
  const sn = checkCoastSnap(ok);
  if (bad.length) return fail(bad);
  console.log(`hist-clio ok — ${d.feats.length} rows ${d.window[0]}–${d.window[1]}, ${d.rings.length} rings; hist-eras-rest ${r.snaps.length} sheets, ${r.rings.length} rings; hist-borders-late ${evalBundle(HBL, '__HISTBLATE').feats.length} rows 1886–${LATE_TOP}; ${SNAP_FILE} ${sn ? sn.rows + ' rows, ' + sn.rings + ' rings' : '—'}; all made against the shipped neighbours`);
}
/* (sudan-mahdist-1886) every finding of ground given to a continuing row is judged or counted; every judged `ground`
   row is drawn back on the shipped rows — between 1 January of `s` and its first outline, under its own name, saying
   which year's outline it carries — and the rows it is taken from (and their realms) no longer hold that ground then */
function checkGround(d, review, ok) {
  const G = review.ground;
  ok(G && Array.isArray(G.rows) && Array.isArray(G.refuted) && Array.isArray(G.pending), 'scripts/histclio/review.json must carry ground: { rows, refuted, pending }');
  if (!G || !Array.isArray(G.rows) || !Array.isArray(G.refuted) || !Array.isArray(G.pending)) return;
  const k0 = (f) => ymd(f[2], f[3], f[4]), k1 = (f) => ymd(f[5], f[6], f[7]);
  const twice = [], once = new Set();
  for (const R of [...G.rows, ...G.refuted]) for (const k of heldKeys(R)) { if (once.has(k)) twice.push(k); once.add(k); }
  ok(twice.length === 0, 'scripts/histclio/review.json judges ' + twice.length + ' ground finding(s) more than once: ' + twice.slice(0, 4).join(', '));
  const held = heldFindingsOf(d.feats, d.rings, readFacts(), d.ids || {}), raised = new Set(held.map((x) => x.name + '|' + x.over));
  const listed = groundJudged(G); for (const p of G.pending) listed.add(p.name + '|' + p.over);
  const loose = held.filter((x) => !listed.has(x.name + '|' + x.over));
  ok(loose.length === 0, loose.length + ' finding(s) of a polity\'s ground drawn under a continuing row before its first row are in no list of review.json ground: ' + loose.slice(0, 4).map((x) => x.name + ' ← ' + x.over + ' ' + x.from + '–' + x.to).join(', '));
  for (const R of G.refuted) {
    ok(!!(R.why && R.note), 'ground: «' + R.name + '» ← ' + (R.over || []).join(', ') + ' is refuted without a reason (why) and a note');
    for (const k of heldKeys(R)) ok(raised.has(k), 'ground: ' + k + ' is refuted, but nothing raises it any more — remove the entry');
  }
  const cellsF = (f) => cellsOf(f[8].map((p) => p.map((i) => d.rings[i])));
  for (const R of G.rows) {
    const tag = 'ground: «' + R.name + '»';
    ok(Number.isInteger(R.s) && Array.isArray(R.over) && R.over.length > 0, tag + ' must state the year history gives (s) and the rows the ground is taken from (over)');
    ok(R.e == null || (Number.isInteger(R.e) && R.e >= R.s), tag + ': e (the last year the ground is the polity\'s while `over` draws it) must be a whole year, not before s');
    ok(/^Q\d+$/.test(String(R.wd || '')), tag + ' must name the Wikidata item (wd) of the polity');
    ok(typeof R.history === 'string' && R.history.length > 20, tag + ' must say what history states');
    if (!Number.isInteger(R.s) || !Array.isArray(R.over)) continue;
    /* (hist-findings-sweep) one polity may be judged more than once (Denmark: Greenland and the Faroes) — each judgement
       answers for the rows that say ITS years */
    const carried = d.feats.filter((f) => f[0].en === R.name && f[9] && f[9].hy != null && f[9].hs === R.s && (f[9].he == null ? null : f[9].he) === (R.e == null ? null : R.e));
    ok(carried.length > 0, tag + ' is not drawn back to ' + R.s + ' — the record changed; re-judge or remove the row');
    if (!carried.length) continue;
    const hy = carried[0][9].hy, S = ymd(R.s, 1, 1), T = ymd(hy, 1, 1);
    const own = d.feats.filter((f) => f[0].en === R.name && !(f[9] && f[9].hy != null));
    if (R.e == null) {
      ok(carried.every((f) => k0(f) >= S && k1(f) <= T && f[9].hs === R.s && f[9].hy === hy && f[9].he == null), tag + ' must be drawn back only between 1 January ' + R.s + ' and its first outline (' + hy + '), and say so on every row');
      const early = own.filter((f) => k0(f) < T);
      ok(early.length === 0, tag + ' has a row of its own before ' + hy + ', the year review.json says its first outline is');
    } else {
      /* (clio-year-page-findings) between two of its own rows: carried only over [1 January s, 1 January e + 1), from
         the outline of its first own row on or after that end — and the row says which years and which outline */
      const E = ymd(R.e + 1, 1, 1), after = own.filter((f) => k0(f) >= E), T2 = after.length ? Math.min(...after.map(k0)) : null;
      ok(T2 != null && unymd(T2)[0] === hy, tag + ' must carry the outline of its first own row from ' + (R.e + 1) + ' (found ' + (T2 == null ? 'none' : unymd(T2)[0]) + ', rows say ' + hy + ')');
      ok(carried.every((f) => k0(f) >= S && k1(f) <= E && f[9].hs === R.s && f[9].he === R.e && f[9].hy === hy), tag + ' must be drawn only between 1 January ' + R.s + ' and 1 January ' + (R.e + 1) + ', and say so on every row (hs, he, hy)');
    }
    const realms = new Set(d.feats.filter((f) => R.over.includes(f[0].en) && f[9] && f[9].of).map((f) => f[9].of));
    const takes = takesGround(R, realms), meta = (f) => ({ name: f[0].en, meta: f[9] || {} });
    for (const c of carried) {
      const C = new Set(cellsF(c));
      /* (coast-snap-gaps) …and, exactly, no piece of an `over` row left on the edge of the given ground that is narrower
         than the record's band while nothing of that row wider than it touches the ground (`heldWhole`) — the 0.25° cells
         above cannot see a triangle a few km across */
      const V = new Set(); for (const p of c[8]) for (const ri of p) for (const q of d.rings[ri]) V.add(q[0] + ',' + q[1]);
      for (const g of d.feats) {
        if (!takes(meta(g)) || k1(g) <= k0(c) || k0(g) >= k1(c)) continue;
        let hit = 0; for (const v of cellsF(g)) if (C.has(v)) hit++;
        ok(hit < CUT_CELLS, tag + ': «' + g[0].en + '» (' + g.slice(2, 5).join('-') + ') still holds ' + hit + ' cells of the ground review.json gives to it');
        if (!R.over.includes(g[0].en)) continue;
        const touching = g[8].map((p) => p.map((ri) => d.rings[ri])).filter((p) => p[0].some((q) => V.has(q[0] + ',' + q[1])));
        const left = touching.filter((p) => meanWidthKm(p) < inlandKmFor('__HISTCLIO'));
        ok(!left.length || left.length < touching.length, tag + ': «' + g[0].en + '» (' + g.slice(2, 5).join('-') + ') keeps ' + left.length + ' piece(s) narrower than the record\'s band on the edge of the ground review.json gives back — the same claim, two drawings of one edge (' + left.map((p) => p[0][0].join(',')).join('; ') + ')');
      }
    }
  }
  const stray = d.feats.filter((f) => f[9] && f[9].hy != null && !G.rows.some((R) => R.name === f[0].en && R.s === f[9].hs && (R.e == null ? null : R.e) === (f[9].he == null ? null : f[9].he)));
  ok(stray.length === 0, stray.length + ' Cliopatria row(s) carry an outline back to a year no ground row states: ' + stray.slice(0, 3).map((f) => f[0].en + ' ' + f[9].hs).join(', '));
}
/* (hist-findings-sweep) review.json `places`: each entry stated whole, withholding something, and nothing named inside its
   ring over its years; the bundle carries the card's sentence for each */
function checkPlaces(d, review, ok) {
  const P = review.places || [];
  ok(Array.isArray(d.places) && d.places.length === P.length && P.every((R, i) => d.places[i] && d.places[i].en === (R.note && R.note.en) && d.places[i].jp === (R.note && R.note.jp)), 'data/hist-clio.js does not carry the card sentences of review.json places — rebuild it');
  const k0 = (f) => ymd(f[2], f[3], f[4]), k1 = (f) => ymd(f[5], f[6], f[7]);
  P.forEach((R, i) => {
    const tag = 'place: «' + R.name + '» ' + (R.s ?? '…') + '–' + (R.e ?? '…');
    ok(Array.isArray(R.within) && R.within.length >= 4 && R.within.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)), tag + ' must state `within` as a ring of [lng, lat]');
    ok(R.s == null || Number.isInteger(R.s), tag + ': s must be a whole year'); ok(R.e == null || (Number.isInteger(R.e) && (R.s == null || R.e >= R.s)), tag + ': e must be a whole year, not before s');
    ok(typeof R.history === 'string' && R.history.length > 40, tag + ' must say what history states');
    ok(R.note && typeof R.note.en === 'string' && R.note.en.length > 40 && typeof R.note.jp === 'string' && R.note.jp.length > 20, tag + ' must carry the card sentence in en and jp (CONSTITUTION §7)');
    if (!Array.isArray(R.within)) return;
    const S = R.s != null ? ymd(R.s, 1, 1) : -Infinity, E = R.e != null ? ymd(R.e + 1, 1, 1) : Infinity;
    const withheld = d.feats.filter((f) => f[9] && f[9].ws === 'place' && f[9].wp === i);
    ok(withheld.length > 0, tag + ' withholds nothing — the record changed; re-judge or remove it');
    ok(withheld.every((f) => k0(f) >= S && k1(f) <= E), tag + ': a withheld piece lies outside the years it names');
    const named = d.feats.filter((f) => f[0].en === R.name && k1(f) > S && k0(f) < E && f[8].some((p) => d.rings[p[0]].every(([x, y]) => inRingXY(R.within, x, y))));
    ok(named.length === 0, tag + ' is still named inside its ring: ' + named.slice(0, 3).map((f) => f.slice(2, 5).join('-')).join(', '));
    /* (coast-snap-gaps) …and no piece of the name narrower than the record's band is left touching what it withholds (the
       Greenland shape: the same claim, two drawings of one edge, kept under the name just outside the ring) */
    const V = new Set(); for (const f of withheld) for (const p of f[8]) for (const ri of p) for (const q of d.rings[ri]) V.add(q[0] + ',' + q[1]);
    const edge = d.feats.filter((f) => f[0].en === R.name && k1(f) > S && k0(f) < E).flatMap((f) => f[8].map((p) => p.map((ri) => d.rings[ri])))
      .filter((p) => p[0].some((q) => V.has(q[0] + ',' + q[1])) && meanWidthKm(p) < inlandKmFor('__HISTCLIO'));
    ok(edge.length === 0, tag + ' leaves ' + edge.length + ' narrow piece(s) of the name on the edge of what it withholds: ' + edge.slice(0, 3).map((p) => p[0][0].join(',')).join('; '));
  });
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
  else if (arg.includes('--identities')) identities();
  else if (arg.includes('--coast-snap-measure')) { const i = arg.indexOf('--before'), j = arg.indexOf('--coast'); measurePorts({ before: i >= 0 ? arg[i + 1] : null, coast: j >= 0 ? arg[j + 1] : 'osm' }); }
  else if (arg.includes('--coast-snap')) await buildCoastSnap();
  else await build({ measure: arg.includes('--measure') });
}
