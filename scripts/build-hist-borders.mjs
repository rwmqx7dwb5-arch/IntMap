#!/usr/bin/env node
/* ============================================================================
 *  IntMap · data/hist-borders.js — day-exact borders below CShapes   (#R518, widened #R688)
 * ----------------------------------------------------------------------------
 *  「1850年より前の国境を、スナップショットから日単位の記録へ」
 *
 *  ══ WHAT THIS FILE IS ══════════════════════════════════════════════════════════════════════════
 *  OpenHistoricalMap's admin_level=2 boundary relations, with the `start_date`/`end_date` they carry,
 *  poured into the same ring-pooled shape data/cshapes.js has — so the day-exact machinery #R421
 *  built for 1886–2019 reaches DOWNWARDS instead of being duplicated. #R518 built it for the
 *  thirty-six years 1850–1885, where the app had no polygons at all. #R688 widened it below 1850.
 *
 *  ══ WHY IT HAD TO BE WIDENED, MEASURED (2026-09-11, the cached Overpass index) ══════════════════
 *  The source was never a 19th-century dataset. Of the 3,985 admin_level=2 relations it publishes,
 *  2,101 END before 1850 — 53% of the record was below the window #R518 cut. Everything under 1850
 *  was answered by data/hist-eras.js instead: 53 snapshots, and below AD 1000 they are 100 years
 *  apart, so a reader at 1750 was shown 1715 and a reader at 1600 was shown one frame for a century.
 *
 *  ══ ⚠⚠⚠ AND THE FLOOR IS NOT A YEAR SOMEBODY PICKED. IT IS DERIVED, HERE, FROM THE RECORD NEXT DOOR
 *  Widening «as far as the data goes» would have been wrong, and the measurement says so plainly.
 *  The deep end of OHM is THIN: in-force relations are 205 at 1815, 132 at 1500, 61 at AD 1000 and
 *  TEN at 1000 BC, and by covered land it is 6% of the globe at AD 100, 25% at 1500, 56% at 1650.
 *  Below some year the day-exact record stops being a record of the world and becomes a scattering
 *  of polygons — and a scattering with exact dates on it is a worse world than a coarse snapshot of
 *  the whole globe. So the question is «is this a world?», and it is asked of the one record that
 *  can answer it:
 *
 *      A YEAR IS A WORLD WHEN THE RECORD COVERS AS MUCH LAND AS data/cshapes.js DOES, ALLOWING FOR
 *      AS MUCH VARIATION AS CShapes ITSELF SHOWS:   bar = min(CShapes) − (max(CShapes) − min(CShapes))
 *      THE FLOOR IS THE EARLIEST YEAR FROM WHICH THAT HOLDS CONTINUOUSLY UP TO Y_MAX.
 *
 *  Measured: CShapes draws 12,895 deg² (1886, the very instant of the handover) to 14,660 (1950 on),
 *  so the bar is 11,131. The record covers 9,371 deg² in 1688 and 11,314 in 1689 — floor 1689.
 *  ⚠ NOTHING IN THAT IS TYPED. Both halves come out of the neighbouring bundle at build time, and
 *  the spread is not a fudge factor: it is «how much does a complete world legitimately vary in this
 *  unit», asked of the only record that can say. It expires when data/cshapes.js is rebuilt.
 *  ⚠ AND THE ANSWER SITS IN AN EMPTY PART OF THE DATA, which is why it is stable rather than lucky.
 *  Coverage climbs a staircase — 7,500 deg² in the 1650s, 9,000 in the 1670s, 9,396 at 1684, then
 *  11,314 at 1689 — and the bar lands in the 1,900 deg² gap between the last two treads. No year of
 *  noise can move the floor across it.
 *
 *  ⚠⚠⚠ TWO EARLIER BARS WERE FALSIFIED BY MEASUREMENT, and they are recorded because each says what
 *  this quantity is NOT:
 *    · «cover as much as the era snapshot bracketing the year» put the floor at 1882 — it would have
 *      DESTROYED the window #R518 shipped. The reason is in data/hist-eras.js: world_1815 sums to
 *      18,845 deg², A THIRD MORE THAN THERE IS LAND ON EARTH, because that record draws overlapping
 *      colonial claims and every overlap counts twice. A bar built on it is not a measure of the
 *      world, it is a measure of how contested the era was.
 *    · «the snapshots' own median» inherits the same contamination — the colonial centuries are
 *      exactly the ones with the most overlap.
 *  ⚠ The area is summed per record on both sides, so overlap is double-counted on both. It measures
 *  «how much of the globe does this record speak about», not true union area — which is precisely
 *  why the reference has to be a record that does not overlap itself.
 *  The derived floor is written into the bundle as `window[0]`; js/time-borders.js's HB_MIN is a
 *  COPY that tests/r688-histborders-deep-checks.test.mjs holds equal to it.
 *
 *  ══ ⚠ THE ROLES ON THE MEMBERS ARE NOT DECORATION ══════════════════════════════════════════════
 *  Measured on the download: 8,769 of the 8,782 relation members carry role `subarea` — an
 *  administrative subdivision, NOT a piece of this boundary — and 801 way members carry `label`,
 *  `admin_centre` or nothing but a marker. #R518 recursed into EVERY relation member and pushed
 *  EVERY way member that was not `inner` into the outline, and got away with it only because its
 *  506-relation download resolved 1,054 of 8,536 subarea references and left the rest dangling.
 *  Widening the download to 2,607 relations resolves thousands more, and would have quietly welded
 *  every subdivision's outline into its parent's. Only `outer` / `inner` / role-less ways are
 *  boundary, and only a role-LESS relation member is a part of this boundary — measured, there are
 *  exactly twelve of those, and they are the whole geometry of the Confederate States (eleven) and
 *  of Sarawak (one), which have no ways of their own at all.
 *
 *  ══ ⚠ OHM's `end_date` IS EXCLUSIVE, AND CShapes' IS NOT ═══════════════════════════════════════
 *  Measured before writing a line of the selector: of the 180 consecutive same-`wikidata` pairs in
 *  #R518's window, 151 have `end_date === the successor's start_date`. Reading that end as inclusive
 *  — the CShapes convention, which the neighbouring code uses — would draw BOTH polygons on the
 *  changeover day. The bundle stores the end as an EXCLUSIVE instant and js/time-borders.js selects
 *  `start <= t < end` for this record and `start <= t <= end` for CShapes. Two records, two
 *  conventions, neither converted into the other's.
 *
 *  ══ ⚠ A RESIDUAL THIS ROUND CANNOT CLOSE: OHM's BC YEARS ARE WRITTEN BOTH WAYS ══════════════════
 *  The source has 133 relations with a BC date and its authors do not agree on year zero.
 *  «Roman Empire  -0027 → -0019» is the historical numbering (27 BC); «Uruk culture -3999 → -3099»
 *  and the dozens of prehistoric cultures ending in 9 are the astronomical one (4000 BC → -3999).
 *  Nothing in the data distinguishes them, so the string is read AS WRITTEN and a BC record may be
 *  one year out. Inventing a per-record correction would be exactly the case-by-case hardcoding
 *  .agents/rules/no-ad-hoc-hardcoding forbids. It is stated in docs/TESTING.md rather than papered over.
 *  ⚠ In practice the derived floor lands far above this, so nothing shipped is affected — the
 *  residual is recorded because the SOURCE has it, not because the bundle does.
 *
 *  ══ ⚠ AND THE NAMES ARE THE SOURCE'S, IN NINE LANGUAGES ════════════════════════════════════════
 *  OHM carries name:en/ja/de/ru/es/zh/fr/ko on most of these relations. IntMap's era labels are
 *  otherwise localized by MATCHING the English name against tables in js/time-borders.js — which
 *  works for «Germany» and cannot work for «Kurhessen» or «Zuid-Afrikaansche Republiek». So the nine
 *  names travel WITH the polygon. Simplified Chinese is DERIVED from the Traditional lane by
 *  opencc-js — the #R224 rule, not a second hand-made copy.
 *
 *      node scripts/build-hist-borders.mjs --fetch    # download OHM into the cache (network)
 *      node scripts/build-hist-borders.mjs            # build data/hist-borders.js from the cache
 *      node scripts/build-hist-borders.mjs --check    # verify the COMMITTED file's invariants (offline)
 *      node scripts/build-hist-borders.mjs --measure  # print the whole coverage curve and write nothing
 *
 *  ⚠ `--measure` is how the floor was found and how it should be re-found. It prints every year the
 *  source has anything for, with the polities and the land they cover, and it does NOT apply the
 *  floor — so the years the bundle excludes are visible. Read it before changing anything above.
 * ==========================================================================*/
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { stitch, simplifyRing, ringArea, pointInRing } from './histborders/geom.mjs';
import { fetchIndex, fetchGeom, loadGeom, migrateBatches } from './histborders/fetch.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'hist-borders.js');
const CS = join(ROOT, 'data', 'cshapes.js');
const CACHE = process.env.INTMAP_HISTB_CACHE || join(tmpdir(), 'intmap-histb-cache');

/* ⚠ ONLY THE TOP OF THE WINDOW IS A CONSTANT, and it is a fact about the NEIGHBOUR rather than a
   choice: data/cshapes.js begins 1886-01-01 (js/time-borders.js CS_MIN), so this record stops where
   that one starts. The FLOOR is derived — see the header, and `deriveFloor` below. */
export const Y_MAX = 1885;
const T_HI = 18860101;                           /* [.., hi) as sortable YYYYMMDD ints */

/* the app's own language codes (js/lang-registry.js), paired with the OHM tag that carries them.
   'zh-hans' has no row: it is derived from 'zh' below, the #R224 rule. */
const LANGS = [
  ['en', 'name:en'], ['jp', 'name:ja'], ['de', 'name:de'], ['ru', 'name:ru'],
  ['es', 'name:es'], ['zh', 'name:zh'], ['fr', 'name:fr'], ['ko', 'name:ko'],
];

/* ⚠ THE TOLERANCE IS A BUDGET, AND THE BUDGET IS data/cshapes.js. OHM's ways are drawn far finer
   than the record this file sits beside, so the raw assembly is heavier than every border of
   1886-2019 put together. Measured sweep on #R518's download: 0.008° → 462 k points, 0.010° → 388 k,
   0.012° → 336 k, 0.015° → 280 k. 0.012° (~1.3 km) lands on the neighbouring record's own figure,
   and #R530/#R564 chose the same number for the two subdivision bundles built from this source.
   ⚠ (#R688) RE-SWEPT ON THE WIDENED DOWNLOAD, and the number was KEPT rather than inherited:
   0.008° → 1,083,472 points / 18.14 MB, 0.012° → 786,956 / 13.28 MB, 0.015° → 655,673 / 11.13 MB,
   0.020° → 515,059 / 8.82 MB. Every one of those keeps all 1,411 records, so the usual argument for
   the coarsest step that loses nothing (#R530) would say 0.020° and save 4.46 MB. It does not apply
   HERE, and the reason is the handover: a reader can step across 1885→1886 one day at a time, and
   at 0.020° the coastline of 1885 would visibly coarsen at that step while the borders of 1886
   stayed fine. The tolerance is the neighbour's because the two records are read as one. */
const TOL = 0.012;
const MIN_AREA = 0.0006;    /* drop a ring smaller than this (deg²) — under a pixel at the zooms this draws */
const DEC = 3;              /* coordinate decimals, matching data/cshapes.js */

const ymd = (y, m, d) => y * 10000 + m * 100 + d;

/* ⚠ NO `Date.UTC` ANYWHERE IN THIS FILE. It applies the two-digit-year rule below year 100 (y+1900),
   which #R602 measured going wrong in four separate places the moment a floor was lowered. This
   record now reaches years that rule would corrupt, so «the day after» is plain proleptic-Gregorian
   arithmetic. The clock's own canonical version of the same care is js/hist-scale.js `utcAt`. */
const MLEN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
function nextDay([y, m, d]) {
  const len = (m === 2 && isLeap(y)) ? 29 : MLEN[m - 1];
  if (d < len) return [y, m, d + 1];
  return (m < 12) ? [y, m + 1, 1] : [y + 1, 1, 1];
}

/* ── dates ──────────────────────────────────────────────────────────────────
   OHM writes `1867-07-01`, `1867-07`, `1867` and `-0247`. A start is the FIRST instant the imprecise
   text can mean; an end is the first instant the record no longer covers.
   ⚠ A DAY-EXACT END IS ALREADY THAT INSTANT — DO NOT ADD A DAY TO IT. This function did, borrowing
   `csBounds`' `_dayAfter` reflex from the record next door, and every one of the 151 successions
   the exclusive reading was chosen FOR then overlapped its successor by exactly one day: measured
   on that build, 107 of 176 same-entity pairs overlapped where 0 should. Only the IMPRECISE forms
   are widened, because only they name a span rather than an instant.
   ⚠ The year is read as written — see the header on OHM's inconsistent BC numbering. Measured over
   the whole index: no date has five digits of year and none names year zero, so `\d{1,4}` is the
   source's real alphabet rather than a guess. */
function parseDate(s, isEnd) {
  const t = String(s || '').trim();
  let m = /^(-?\d{1,4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return [+m[1], +m[2], +m[3]];
  m = /^(-?\d{1,4})-(\d{1,2})$/.exec(t);
  if (m) { const y = +m[1], mo = +m[2];
    return isEnd ? (mo === 12 ? [y + 1, 1, 1] : [y, mo + 1, 1]) : [y, mo, 1]; }
  m = /^(-?\d{1,4})$/.exec(t);
  if (m) { const y = +m[1]; return isEnd ? [y + 1, 1, 1] : [y, 1, 1]; }
  return null;
}

/* ⚠ A RECORD THAT STARTS AND ENDS ON THE SAME DAY MEANS «that day», not «no time at all». Under the
   exclusive reading `start_date === end_date` covers nothing and the record can never be drawn —
   and the eight in #R518's window written that way are not noise: two of them are the Confederate
   States on 1861-01-09 and 1861-01-10, one polygon per seceding state. Read as one day. */
function oneDay(r) { if (r.e > r.s) return false;
  r.eArr = nextDay(r.sArr);
  r.e = ymd(r.eArr[0], r.eArr[1], r.eArr[2]); return true; }

/* ⚠ ONE ENTITY IS IN ONE PLACE AT A TIME. Two records sharing a `wikidata` id may not overlap, and
   two ways of overlapping turn up:
     · an imprecise end widened past its own successor (`end_date=1867` → 1868-01-01 while the next
       record starts 1867-07-01), and
     · plain upstream duplicates whose spans genuinely cross.
   Both are closed the same way — the earlier record ends where the later one begins.
   ⚠ A THIRD KIND CANNOT BE CLAMPED AND MUST BE DROPPED. When the later record does not FOLLOW the
   earlier one — it starts on the same day or before — clamping would invert the span, so the
   LONGER of the two goes. Measured in #R518's window: Bahawalpur State is in the source as two
   byte-identical relations, and «Confederate States of America» 1860-12-20→1861-01-09 sits on top
   of «Confederate States» 1860-12-20→1861-01-08, which is the first step of a twelve-record
   day-by-day secession sequence. Dropping the longer keeps the sequence and loses the duplicate. */
function clampOverlaps(recs) {
  const by = new Map();
  for (const r of recs) { if (!r.wd) continue; const a = by.get(r.wd); if (a) a.push(r); else by.set(r.wd, [r]); }
  let n = 0; const drop = new Set();
  for (const arr of by.values()) {
    arr.sort((a, b) => a.s - b.s);
    for (let i = 0; i + 1 < arr.length; i++) {
      const cur = arr[i], nx = arr[i + 1];
      if (drop.has(cur) || drop.has(nx)) continue;
      if (nx.s >= cur.e) continue;                 /* no overlap */
      if (nx.s <= cur.s) { drop.add(cur.e >= nx.e ? cur : nx); continue; }
      cur.e = nx.s; cur.eArr = nx.sArr; n++;
    }
  }
  for (let i = recs.length - 1; i >= 0; i--) if (drop.has(recs[i])) recs.splice(i, 1);
  return { clamped: n, dropped: drop.size };
}

/* ⚠ THE MEMBER'S ROLE DECIDES WHETHER IT IS THIS BOUNDARY — see the header. `outer`/`inner`/none for
   ways; a relation member is a piece of this boundary only when it has NO role, and Overpass's
   `out geom` does not expand it, so it is resolved off the cache here, depth- and cycle-guarded. */
const BOUNDARY_WAY = new Set(['outer', 'inner', '']);
function waysOf(rel, resolve, seen = new Set(), depth = 0) {
  const out = [];
  if (!rel || depth > 4 || seen.has(rel.id)) return out;
  seen.add(rel.id);
  for (const m of rel.members || []) {
    const role = m.role || '';
    if (m.type === 'way') {
      if (BOUNDARY_WAY.has(role) && m.geometry) out.push({ role, pts: m.geometry.map(p => [p.lon, p.lat]) });
    } else if (m.type === 'relation' && role === '') {
      for (const w of waysOf(resolve(m.ref), resolve, seen, depth + 1)) out.push(w);
    }
  }
  return out;
}

/* ⚠ AN OUTLINE WITH A HOLE IN IT IS STILL AN OUTLINE. Measured: Bolivia 1839-1866 and Chile
   1848-1866 each have exactly one pair of degree-1 endpoints — one missing coastal way, a gap of
   0.358° across shapes 13-26° wide. Bridging that is right; bridging Canada's two-week 13-point
   stub, whose "gap" is its entire extent, is not. So the test is the gap AGAINST THE SHAPE, and a
   chain that fails it is dropped and counted by --report rather than closed into a lie. */
const MAX_GAP_FRAC = 0.10;
function closeGap(chain) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (const p of chain) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  const diag = Math.hypot(x1 - x0, y1 - y0);
  const gap = Math.hypot(chain[0][0] - chain[chain.length - 1][0], chain[0][1] - chain[chain.length - 1][1]);
  return (diag > 0 && gap / diag <= MAX_GAP_FRAC) ? chain : null;
}

/* ── one relation → polygons ────────────────────────────────────────────────*/
function ringsOf(rel, resolve) {
  const outer = [], inner = [];
  for (const w of waysOf(rel, resolve)) (w.role === 'inner' ? inner : outer).push(w.pts);
  const O = stitch(outer), I = stitch(inner);
  let bridged = 0, dropped = 0;
  for (const chain of O.open) { const c = closeGap(chain); if (c) { O.rings.push(c); bridged++; } else dropped++; }
  for (const chain of I.open) { const c = closeGap(chain); if (c) I.rings.push(c); }
  const shells = [], holes = [];
  for (const r of O.rings) { const s = simplifyRing(r, TOL); if (s && Math.abs(ringArea(s)) >= MIN_AREA) shells.push(s); }
  for (const r of I.rings) { const s = simplifyRing(r, TOL); if (s && Math.abs(ringArea(s)) >= MIN_AREA) holes.push(s); }
  /* GeoJSON right-hand rule: shells CCW, holes CW; biggest shell first so a hole finds its owner */
  const polys = shells
    .sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))
    .map(sh => [ringArea(sh) < 0 ? sh.slice().reverse() : sh]);
  for (const h of holes) {
    const owner = polys.find(p => pointInRing(h[0], p[0]));
    if (owner) owner.push(ringArea(h) > 0 ? h.slice().reverse() : h);
  }
  return { polys, bridged, dropped };
}

const round = r => r.map(p => [+p[0].toFixed(DEC), +p[1].toFixed(DEC)])
  .filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);

/* the land a set of polygons speaks about, deg² — shells positive, holes negative */
const polyArea = polys => { let a = 0;
  for (const p of polys) p.forEach((ring, k) => { a += (k === 0 ? 1 : -1) * Math.abs(ringArea(ring)); });
  return a; };

/* ⚠⚠⚠ THE BAR — «IS THIS RECORD A WORLD?» — IS ASKED OF THE RECORD NEXT DOOR, NOT OF A NUMBER ══════
   The first two bars this round tried were both falsified by measurement, and both failures are
   worth keeping because they say what the quantity is NOT:
     · «cover at least as much land as the era snapshot bracketing the year» put the floor at 1882 —
       it would have DESTROYED the window #R518 shipped. The reason is in the snapshots: world_1815
       sums to 18,845 deg², a THIRD MORE THAN THERE IS LAND ON EARTH, because that record draws
       overlapping colonial claims and every overlap is counted twice. A bar built on it is not a
       measure of the world, it is a measure of how contested the era was.
     · «the era snapshots' own median» inherits the same contamination, since the colonial centuries
       are exactly the ones with the most overlap.
   data/cshapes.js has neither problem: it is the SAME kind of record as this one — sovereign states,
   day-exact, tiling the globe without overlapping claims — and it is the record this file hands over
   to. Measured over its whole reach, one sample a year: it draws between 12,895 deg² (1886, the very
   instant of the handover) and 14,660 (1950 on).
   So the bar is CShapes' own smallest world, allowed to be one CShapes-spread smaller:

       bar = min(CShapes) − (max(CShapes) − min(CShapes))

   ⚠ Both halves come out of the neighbouring bundle at build time; nothing here is typed. The spread
   is not a fudge factor, it is the answer to «how much does a complete world legitimately vary in
   this unit» asked of the only record that can answer it. It EXPIRES the moment data/cshapes.js is
   rebuilt or re-simplified, and the same two lines re-derive it.
   ⚠ AND THE ANSWER SITS IN AN EMPTY PART OF THE DATA, which is why it is stable rather than lucky:
   the day-exact record's coverage climbs a staircase — 7,500 deg² in the 1650s, 9,000 in the 1670s,
   9,396 at 1684, and then 11,327 at 1690 — and the bar lands in the two-thousand-deg² gap between
   the 9,000 tread and the 11,300 one. Nothing in the record is near it, so a year of noise cannot
   move the floor. */
function cshapesWorld() {
  const w = {}; new Function('window', readFileSync(CS, 'utf8'))(w);
  const d = w.__CSHAPES;
  let min = Infinity, max = 0;
  for (let y = 1886; y <= 2019; y++) {
    const t = ymd(y, 6, 15); let a = 0;
    for (const f of d.feats) if (ymd(f[2], f[3], f[4]) <= t && ymd(f[5], f[6], f[7]) >= t)
      a += polyArea(f[8].map(poly => poly.map(ri => d.rings[ri])));
    if (a < min) min = a; if (a > max) max = a;
  }
  return { min, max, bar: min - (max - min) };
}

function coverageTable(recs, lo) {
  const table = [];
  for (let y = lo; y <= Y_MAX; y++) {
    const t = ymd(y, 6, 15);
    let a = 0, n = 0;
    for (const r of recs) if (r.s <= t && r.e > t) { a += r.area; n++; }
    table.push({ y, covered: a, n });
  }
  return table;
}
/* the earliest year from which the record clears the bar in EVERY year up to Y_MAX — a single year
   below it disqualifies everything below, because the band the app switches on has to be contiguous */
function deriveFloor(table, bar) {
  let floor = Y_MAX + 1;
  for (let i = table.length - 1; i >= 0; i--) { if (table[i].covered < bar) break; floor = table[i].y; }
  return floor;
}

/* ── build ──────────────────────────────────────────────────────────────────*/
async function build({ report, measure } = {}) {
  migrateBatches(CACHE);
  const idx = JSON.parse(readFileSync(join(CACHE, 'index.json'), 'utf8'));

  const recs = [];
  const skipped = { noDate: 0, noName: 0, noGeom: 0, empty: 0, outside: 0, oneDay: 0, belowFloor: 0 };
  for (const el of idx.elements) {
    const t = el.tags || {};
    const sArr = parseDate(t.start_date, false), eArr = parseDate(t.end_date, true);
    if (!sArr && !eArr) { skipped.noDate++; continue; }
    const s = sArr ? ymd(...sArr) : -999990101;
    const e = eArr ? ymd(...eArr) : 30000101;
    if (s >= T_HI) { skipped.outside++; continue; }
    const names = {};
    for (const [code, tag] of LANGS) { const v = t[tag]; if (v) names[code] = String(v).trim(); }
    if (!names.en) names.en = String(t.name || '').trim();
    if (!names.en) { skipped.noName++; continue; }
    const rec = { id: el.id, wd: t.wikidata || null, names,
                  s, e, sArr: sArr || [-99999, 1, 1], eArr: eArr || [3000, 1, 1] };
    if (oneDay(rec)) skipped.oneDay++;
    recs.push(rec);
  }
  const { clamped, dropped: dupes } = clampOverlaps(recs);
  /* ⚠ AND FILTER AGAIN AFTERWARDS. Clamping only ever moves an end EARLIER, so a record admitted on
     its widened end can leave the window once its real successor is known. */
  for (let i = recs.length - 1; i >= 0; i--) if (!(recs[i].s < T_HI)) { recs.splice(i, 1); skipped.outside++; }

  /* ⚠ GEOMETRY IS READ ONE RELATION AT A TIME AND THE RAW RESPONSE IS DROPPED BEFORE THE NEXT ONE.
     #R604 hit V8's 4 GB ceiling holding a whole download in a Map, and this download is five times
     the one #R518 kept there. What survives a record here is its SIMPLIFIED rings, which is what
     the pool needs, and nothing else. */
  const side = new Map();
  const resolve = id => { if (side.has(id)) return side.get(id);
    const g = loadGeom(CACHE, id) || null; side.set(id, g); return g; };
  let bridged = 0, broken = 0;
  for (let i = recs.length - 1; i >= 0; i--) {
    const r = recs[i];
    const rel = loadGeom(CACHE, r.id);
    if (!rel) { recs.splice(i, 1); skipped.noGeom++; continue; }
    const g = ringsOf(rel, resolve);
    side.clear();
    bridged += g.bridged; broken += g.dropped;
    r.polys = g.polys.map(p => p.map(round)).filter(p => p.length);
    if (!r.polys.length) { recs.splice(i, 1); skipped.empty++; continue; }
    r.area = polyArea(r.polys);
  }

  /* the floor, and then the records that survive it */
  const world = cshapesWorld();
  const lowest = recs.reduce((m, r) => Math.min(m, r.sArr[0]), Y_MAX);
  const table = coverageTable(recs, lowest);
  if (measure) {
    console.log(`CShapes draws a world of ${world.min.toFixed(0)}-${world.max.toFixed(0)} deg2 -> bar ${world.bar.toFixed(0)}`);
    console.log('year  polities  recordDeg2');
    for (const row of table) if (row.n) console.log(String(row.y).padStart(6), String(row.n).padStart(6), row.covered.toFixed(0).padStart(10));
    return null;
  }
  const floor = deriveFloor(table, world.bar);
  const T_LO = ymd(floor, 1, 1);
  for (let i = recs.length - 1; i >= 0; i--) if (!(recs[i].e > T_LO)) { recs.splice(i, 1); skipped.belowFloor++; }

  /* Simplified Chinese, derived — never hand-written twice (#R224). `name:zh` in OHM is a MIX of
     the two orthographies (兩西西里王國 beside 奥斯曼帝国), so both lanes are normalised: the
     Traditional one through cn→tw and the Simplified one through tw→cn. */
  const OpenCC = (await import('opencc-js')).default;
  const t2s = OpenCC.Converter({ from: 'tw', to: 'cn' });
  const s2t = OpenCC.Converter({ from: 'cn', to: 'tw' });
  for (const r of recs) if (r.names.zh) { const z = r.names.zh; r.names['zh-hans'] = t2s(z); r.names.zh = s2t(z); }

  const ringPool = new Map(), rings = [];
  const put = r => { const k = JSON.stringify(r); let i = ringPool.get(k);
    if (i === undefined) { i = rings.length; rings.push(r); ringPool.set(k, i); } return i; };

  const feats = [];
  recs.sort((a, b) => a.s - b.s || a.id - b.id);
  for (const r of recs) {
    const polys = r.polys.map(p => p.map(put));
    /* only names that DIFFER from English are carried — a Latin-script polity repeated nine times
       would be nine copies of the same bytes */
    const nm = { en: r.names.en };
    for (const k of Object.keys(r.names)) if (k !== 'en' && r.names[k] && r.names[k] !== r.names.en) nm[k] = r.names[k];
    feats.push([nm, r.wd, ...r.sArr, ...r.eArr, polys]);
  }

  const body = JSON.stringify({ v: 1,
    src: 'OpenHistoricalMap (openhistoricalmap.org) · CC0 1.0',   /* ⚠ (#R530) CC0, not ODbL — OHM's /copyright page and its Overpass API both say so (measured 2026-09-07). */
    window: [floor, Y_MAX], rings, feats });
  writeFileSync(OUT, 'window.__HISTB=' + body + ';\n');

  if (report) {
    console.log(`window ${floor}-${Y_MAX}   records ${feats.length}   rings ${rings.length}   points ${rings.reduce((a, r) => a + r.length, 0)}   bytes ${body.length + 18}`);
    console.log('skipped', skipped, `| overlaps clamped ${clamped}, ${dupes} duplicate(s) dropped | gaps bridged ${bridged}, ${broken} chain(s) too broken to close`);
    console.log(`── the floor, derived: CShapes draws a world of ${world.min.toFixed(0)}-${world.max.toFixed(0)} deg², so the bar is ${world.bar.toFixed(0)} ──`);
    const near = table.filter(r => r.y >= floor - 60 && r.y <= floor + 20);
    for (const row of near)
      console.log(`  ${String(row.y).padStart(6)}  ${String(row.n).padStart(3)} polities  ${row.covered.toFixed(0).padStart(6)} deg²   ${row.covered >= world.bar ? 'a world' : '← thinner than a world'}`);
    const bounds = new Set();
    for (const f of feats) { bounds.add(ymd(f[2], f[3], f[4])); bounds.add(ymd(f[5], f[6], f[7])); }
    const inWin = [...bounds].filter(k => k >= T_LO && k < T_HI).sort((a, b) => a - b);
    console.log(`transition dates inside the window: ${inWin.length}`);
    let line = '';
    for (let y = floor; y <= Y_MAX; y += Math.max(1, Math.round((Y_MAX - floor) / 12))) {
      const t = ymd(y, 6, 15);
      line += `${y}:${feats.filter(f => ymd(f[2], f[3], f[4]) <= t && ymd(f[5], f[6], f[7]) > t).length}  `;
    }
    console.log('polities on 15 June —', line);
    const perLang = {}; for (const c of ['en', 'jp', 'de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko']) perLang[c] = feats.filter(f => f[0][c]).length;
    console.log('carry their own name in', perLang);
  }
  return { feats, rings, floor };
}

/* ── check (offline) ────────────────────────────────────────────────────────
   ⚠ THIS RE-DERIVES NOTHING FROM THE SOURCE, and says so. The build needs about 2.1 GB of Overpass
   responses that CI cannot have, so the gate proves the COMMITTED file's INVARIANTS instead: every
   record inside the window it declares, every ring index resolvable, every ring on the globe, every
   span ordered, an English name on every record.
   ⚠ AND «A WORLD TO DRAW» IS MEASURED AGAINST THE RECORD THAT WOULD OTHERWISE ANSWER, not against a
   number somebody typed: the same comparison `deriveFloor` makes, re-run here from the two committed
   bundles. A rebuild whose deep end thins out below the snapshots fails here even though every one
   of the structural invariants above still holds. */
function check() {
  const src = readFileSync(OUT, 'utf8');
  const w = {}; new Function('window', src)(w);
  const d = w.__HISTB;
  const bad = [];
  const ok = (c, m) => { if (!c) bad.push(m); };
  ok(d && d.v === 1, 'v must be 1');
  ok(d && Array.isArray(d.rings) && d.rings.length > 0, 'rings missing');
  ok(d && Array.isArray(d.feats) && d.feats.length > 0, 'feats missing');
  ok(d && d.window && Number.isInteger(d.window[0]) && d.window[1] === Y_MAX,
     'window must end at ' + Y_MAX + ' and declare an integer floor');
  ok(d && d.window && d.window[0] < 1850,
     'the record no longer reaches below 1850 — taking it there is what #R688 exists for');
  ok(d && /OpenHistoricalMap/.test(d.src) && /CC0/.test(d.src), 'src must name OpenHistoricalMap and CC0');
  if (bad.length) { fail(bad); return; }
  const Y_MIN = d.window[0], T_LO = ymd(Y_MIN, 1, 1);
  d.rings.forEach((r, i) => {
    if (!Array.isArray(r) || r.length < 3) bad.push('ring ' + i + ' has ' + (r && r.length) + ' points');
    else if (r.some(p => !Array.isArray(p) || p.length !== 2 || !isFinite(p[0]) || !isFinite(p[1]) ||
                          p[0] < -180.001 || p[0] > 180.001 || p[1] < -90.001 || p[1] > 90.001))
      bad.push('ring ' + i + ' leaves the globe');
  });
  const bounds = new Set();
  d.feats.forEach((f, i) => {
    const nm = f[0];
    if (!nm || typeof nm !== 'object' || !nm.en) bad.push('feat ' + i + ' has no English name');
    const s = ymd(f[2], f[3], f[4]), e = ymd(f[5], f[6], f[7]);
    if (!(s < e)) bad.push('feat ' + i + ' (' + (nm && nm.en) + ') ends before it starts');
    if (!(s < T_HI && e > T_LO)) bad.push('feat ' + i + ' (' + (nm && nm.en) + ') is outside the declared window');
    bounds.add(s); bounds.add(e);
    if (!Array.isArray(f[8]) || !f[8].length) bad.push('feat ' + i + ' has no polygons');
    else for (const poly of f[8]) for (const ri of poly)
      if (!(ri >= 0 && ri < d.rings.length)) bad.push('feat ' + i + ' points at ring ' + ri);
  });
  const inWin = [...bounds].filter(k => k >= T_LO && k < T_HI);
  ok(inWin.length >= 150, 'only ' + inWin.length + ' transition dates inside the window');
  const { bar } = cshapesWorld();
  const geomOf = f => f[8].map(poly => poly.map(ri => d.rings[ri]));
  for (let y = Y_MIN; y <= Y_MAX; y++) {
    const t = ymd(y, 6, 15);
    let a = 0;
    for (const f of d.feats) if (ymd(f[2], f[3], f[4]) <= t && ymd(f[5], f[6], f[7]) > t) a += polyArea(geomOf(f));
    if (a < bar) bad.push(y + ' covers only ' + a.toFixed(0) + ' deg², under the ' + bar.toFixed(0) + ' a world takes');
  }
  if (bad.length) { fail(bad); return; }
  console.log(`hist-borders ok — ${d.feats.length} records, ${d.rings.length} rings, ${inWin.length} transition dates in ${Y_MIN}-${Y_MAX}`);
}
function fail(bad) {
  console.error('hist-borders: ' + bad.length + ' problem(s)');
  for (const b of bad.slice(0, 25)) console.error('  ' + b);
  process.exitCode = 1;
}

const arg = process.argv.slice(2);
if (arg.includes('--check')) check();
else if (arg.includes('--fetch')) {
  migrateBatches(CACHE);
  const idx = await fetchIndex(CACHE);
  const py = s => { const m = /^(-?\d{1,4})/.exec(String(s || '').trim()); return m ? +m[1] : null; };
  /* ⚠ EVERYTHING THAT BEGINS BEFORE CShapes DOES, not «everything that overlaps a window» — the
     window is not known until the geometry has been measured (see `deriveFloor`), so the download
     cannot be cut by it. Measured 2026-09-11: 2,607 of the 3,985 relations. */
  const ov = idx.elements.filter(x => { const s = py((x.tags || {}).start_date); return s == null || s < 1886; });
  console.error('fetching geometry for ' + ov.length + ' relations into ' + CACHE);
  console.error('newly fetched: ' + await fetchGeom(CACHE, ov.map(x => x.id)));
} else await build({ report: true, measure: arg.includes('--measure') });
