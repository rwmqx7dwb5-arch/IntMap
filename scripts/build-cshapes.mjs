#!/usr/bin/env node
/* ============================================================================
 *  IntMap · data/cshapes.js — the day-exact borders of 1886–2019   (#R700)
 * ----------------------------------------------------------------------------
 *  ══ WHY THIS FILE EXISTS ═══════════════════════════════════════════════════════════════════════
 *  data/cshapes.js is 5.6 MB of committed bytes, it is the record the time machine answers with for
 *  the whole of 1886–2019, it is the outline the two world-war layers are cut from, and it is the
 *  yardstick scripts/build-hist-borders.mjs asks «is this a world?» of — and until this round it was
 *  THE ONLY ONE OF THE THREE BORDER RECORDS THAT COULD NOT SAY WHERE ITS BYTES CAME FROM. The other
 *  five bundles beside it (hist-borders, hist-eras, hist-admin1, kuni, border-coast) each have a
 *  build script and a `--check` gate; this one had neither, so nothing measured it, nothing could
 *  re-derive it, and — the reason this round was opened — NOTHING SAID WHAT IT COSTS TO SHIP IT.
 *
 *  ══ ⚠⚠⚠ THE LICENCE IS CC BY-NC-SA 4.0, AND IT IS A VALUE HERE RATHER THAN A SENTENCE ══════════
 *  Read 2026-09-11 off the publisher's own page, verbatim: «CShapes by Schvitz, Rüegger, Girardin,
 *  Cederman, Weidmann, Gleditsch is licensed under a Creative Commons Attribution-NonCommercial-
 *  ShareAlike 4.0 International License.» Attribution is therefore a CONDITION OF REDISTRIBUTION,
 *  and IntMap redistributes this record as committed bytes, not as a live call.
 *  ⚠ #R689 is the reason this is a `LIC()` value and not a paragraph: 739 Pleiades cities shipped
 *  under CC BY 3.0 with the obligation written as prose in a generated file's header, and no
 *  reader-facing page named Pleiades at all. Prose is addressed to whoever reads the file next, and
 *  whoever reads the file next is not a program. `--check` below asks js/reference-data.js whether
 *  the credit is paid, the same way scripts/build-hist-cities.mjs does, from the same LIC() value.
 *
 *  ══ ⚠⚠⚠ THE COMMITTED FILE IS NOT A PURE FUNCTION OF THE UPSTREAM, AND THAT IS WHY NOTHING HERE
 *     WRITES IT ════════════════════════════════════════════════════════════════════════════════
 *  Measured this round, feature by feature: 705 of the 710 records rebuild from CShapes 2.0. The
 *  other five — «German Federal Republic» ×3 and «German Democratic Republic» ×2, covering
 *  1945-05-08 to 2019-12-31 — DO NOT. #R145/#R146 rebuilt them from the authoritative modern
 *  Bundesländer (deutschlandGeoJSON, © GeoBasis-DE / BKG) because CShapes' inner-German border was
 *  measured 8.1 km out on average and 31.2 km at worst, and #R142 added the West Berlin ring that
 *  CShapes has no polygon for at all. Their rings are the twelve at the tail of the pool, carrying
 *  four decimals where the rest of the file carries three — which is how they are still visible.
 *  ⚠ SO A REBUILD FROM THE UPSTREAM ALONE WOULD SILENTLY REVERT TWO ROUNDS OF CORRECTION. That is
 *  a change to shipped geometry, which is a decision for a round that takes the German rebuild with
 *  it — not a side effect of running a script. The default mode therefore builds the whole record
 *  IN MEMORY and holds it against the committed bytes, and writes nothing.
 *
 *  ══ THE SIMPLIFICATION PARAMETERS ARE RE-DERIVED HERE, NOT COPIED FROM THE PROSE ═══════════════
 *  DEV-NOTES-ARCHIVE says «0.008° / 3 digits» and the shipped file disagrees with it on its face —
 *  2,900 of its coordinates carry four decimals. Both are true: the four-decimal ones are the
 *  German patch above, and the CShapes half of the file really is 0.008°/3. That was established by
 *  rebuilding and comparing, not by reading:
 *      tol 0.001 → 70 pts   0.004 → 46   0.006 → 37   0.008 → 33   0.010 → 31     (Puerto Rico 1886,
 *      and the committed ring is 33 points, byte-identical at 0.008 and at no other step)
 *  and over the whole record, at tol 0.008 / 3 decimals / drop rings under 0.0001 deg²:
 *      1,991 rings against the committed 1,991 · 334,134 points against 334,140 ·
 *      1,985 of 1,991 rings BYTE-IDENTICAL AT THE SAME POOL INDEX (99.70%)
 *  ⚠ AND THE LAST PIECE WAS THE ROUNDING, WHICH IS NOT toFixed. 117 rings differed by one digit in
 *  a handful of vertices — every one of them at a coordinate that is EXACTLY a half (26.0625,
 *  -162.5625: dyadic fractions, exactly representable). V8's toFixed breaks those ties away from
 *  zero; the writer that made this file broke them TO EVEN, the way a C `printf("%.3f")` does. Ties
 *  are therefore resolved on the double's own decimal expansion (`toFixed(20)`, correctly rounded)
 *  rather than by multiplying by 1000 — the multiplication turns -74.2325, which is NOT a half, into
 *  one, and rounding that to even moves 684 rings instead of 117.
 *  ⚠ The six rings that still differ each keep one extra vertex the rebuild drops, at a deviation
 *  sitting on the tolerance. `>=` instead of `>` at the threshold, taking the last farthest point
 *  instead of the first, and unclamped perpendicular distance were all measured: none of them closes
 *  the six and two of them open dozens more. It is recorded rather than papered over.
 *
 *      node scripts/build-cshapes.mjs --fetch    # download CShapes 2.0 into the cache (26.3 MB)
 *      node scripts/build-cshapes.mjs            # rebuild from the cache and compare — writes nothing
 *      node scripts/build-cshapes.mjs --check    # verify the COMMITTED file's invariants (offline)
 *      node scripts/build-cshapes.mjs --measure  # print the tolerance sweep and write nothing
 *
 *  ⚠ `--check` IS THE ONLY MODE CI CAN RUN, and it deliberately re-derives nothing: the upstream is
 *  26.3 MB from a university web server that refused three of this round's connections outright, and
 *  a gate that needs it is a gate that goes red for the weather. So `--check` proves what the
 *  committed bytes must satisfy for the app to be able to draw them, and — the part that is not
 *  structural — re-asks the neighbouring bundle the question the neighbour asks of this one.
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { LIC } from './histcities/lang.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'cshapes.js');
const HB = join(ROOT, 'data', 'hist-borders.js');
const REF = join(ROOT, 'js', 'reference-data.js');
const TB = join(ROOT, 'js', 'time-borders.js');
const CACHE = process.env.INTMAP_CSHAPES_CACHE || join(tmpdir(), 'intmap-cshapes-cache');
const GEOJSON = join(CACHE, 'CShapes-2.0.geojson');
const URL_GEOJSON = 'https://icr.ethz.ch/data/cshapes/CShapes-2.0.geojson';

/* ⚠ THE ONE PLACE THAT SAYS WHAT SHIPPING THIS RECORD COSTS. `source` is not a label, it is the
   exact `n` of the js/reference-data.js row that pays the credit — the check below compares the
   two, so the obligation cannot be satisfied by a row that merely looks similar. */
export const LICENCE = LIC({
  publisher: 'Schvitz, Rüegger, Girardin, Cederman, Weidmann, Gleditsch (ICR, ETH Zürich)',
  licence: 'CC BY-NC-SA 4.0',
  url: 'https://icr.ethz.ch/data/cshapes/',
  attribution: true,
  source: 'CShapes 2.0 (Schvitz et al., ETH Zürich)',
  read: '2026-09-11',
});
/* the citation the publisher asks for, in the publisher's own words and spelling — NOT translated,
   because a bibliographic reference and a licence name are the source's, not the reader's */
export const CITATION = 'Schvitz, Guy, Seraina Rüegger, Luc Girardin, Lars-Erik Cederman, '
  + 'Nils Weidmann, and Kristian Skrede Gleditsch. 2022. "Mapping The International System, '
  + '1886-2017: The CShapes 2.0 Dataset." Journal of Conflict Resolution 66(1): 144–61.';

/* ── the simplification, measured above ─────────────────────────────────────*/
const TOL = 0.008;          /* Douglas-Peucker, degrees — reproduces the committed rings exactly */
const MIN_AREA = 0.0001;    /* drop a simplified ring smaller than this (deg²) — 1,992 rings without it, 1,991 with */
const DEC = 3;              /* coordinate decimals */

/* ⚠ MEASURED 2026-09-11: six rings in the pool (1,569 points, 0.46% of 337,697) are referenced by
   nothing. They are the four CShapes German rings #R146 replaced and the two West Berlin rings
   #R142 wrote before it. They are ALLOWED, because dropping them renumbers the whole pool and
   rewrites 5.6 MB to save 33 kB — and they are RATCHETED, because dead weight that nothing counts
   is dead weight that grows.
   · observation — the committed data/cshapes.js, this date, counted by `check()` itself
   · expires — the moment the bundle is rebuilt or re-pooled; re-measure, do not raise
   · canon — this constant; nothing else holds a copy */
const ORPHAN_POINTS = 1569;

const ymd = (y, m, d) => y * 10000 + m * 100 + d;

/* ── geometry ───────────────────────────────────────────────────────────────*/
/* Douglas-Peucker with both ends anchored. The bundle stores CLOSED rings (first point repeated at
   the end — all 2,005 of them, measured), which is the opposite of data/hist-borders.js's
   convention, so the ring is simplified as a PATH and the closure looks after itself. */
function dp(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, dd = dx * dx + dy * dy;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let e;
      if (dd === 0) e = (px - ax) ** 2 + (py - ay) ** 2;
      else { let t = ((px - ax) * dx + (py - ay) * dy) / dd; t = t < 0 ? 0 : t > 1 ? 1 : t;
             e = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2; }
      if (e > best) { best = e; bi = i; }
    }
    if (best > tol * tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  const out = []; for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

/* ⚠ TIES GO TO EVEN, AND THE TIE IS FOUND IN THE DOUBLE'S OWN DECIMAL EXPANSION — see the header.
   `x * 1000 % 1 === 0.5` is not the same question: it says yes for -74.2325, whose double is not a
   half at all, and answering the wrong question there moves 684 rings instead of 117. */
function dec3(x) {
  const s = x.toFixed(20);                     /* correctly rounded, so the digits after DEC are the double's */
  const neg = s[0] === '-', body = neg ? s.slice(1) : s;
  const dot = body.indexOf('.');
  const keep = body.slice(0, dot) + body.slice(dot + 1, dot + 1 + DEC), rest = body.slice(dot + 1 + DEC);
  let up;
  if (rest[0] > '5') up = 1;
  else if (rest[0] < '5') up = 0;
  else up = /[1-9]/.test(rest.slice(1)) ? 1 : ((+keep[keep.length - 1]) % 2 === 0 ? 0 : 1);
  const t = (BigInt(keep) + BigInt(up)).toString().padStart(DEC + 1, '0');
  const v = +(t.slice(0, t.length - DEC) + '.' + t.slice(t.length - DEC));
  return neg ? -v : v;
}
const round = r => r.map(p => [dec3(p[0]), dec3(p[1])])
  .filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);

const ringArea = r => { let s = 0;
  for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; s += p[0] * q[1] - q[0] * p[1]; }
  return s / 2; };
/* the land a set of polygons speaks about, deg² — shell positive, holes negative. Overlap between
   two records is counted twice, exactly as scripts/build-hist-borders.mjs counts it, because the
   two numbers are compared with each other. */
const polyArea = polys => { let a = 0;
  for (const p of polys) p.forEach((ring, k) => { a += (k === 0 ? 1 : -1) * Math.abs(ringArea(ring)); });
  return a; };

/* ── the committed bundles ──────────────────────────────────────────────────*/
const evaluate = (file, global) => { const w = {};
  new Function('window', readFileSync(file, 'utf8'))(w); return w[global]; };

/* ⚠ THE WINDOW IS THE APP'S, NOT A NUMBER TYPED TWICE. js/time-borders.js decides which years this
   record is asked for; if the bundle and that decision disagree, the years in between are drawn by
   nobody. Read from the app rather than restated here — and if it cannot be read, that is a failure
   and not a default (#R488: a check that silently loses its subject goes green for ever). */
function appWindow() {
  const m = /const\s+CS_MIN\s*=\s*(\d{4})\s*,\s*CS_MAX\s*=\s*(\d{4})/.exec(readFileSync(TB, 'utf8'));
  if (!m) throw new Error('js/time-borders.js no longer declares CS_MIN/CS_MAX, so the window this record must fill cannot be read');
  return [+m[1], +m[2]];
}

/* the world a record draws on 15 June of each year of a window, deg², one area per record */
function coverage(d, lo, hi, exclusiveEnd) {
  const area = d.feats.map(f => polyArea(f[8].map(poly => poly.map(ri => d.rings[ri]))));
  const out = [];
  for (let y = lo; y <= hi; y++) {
    const t = ymd(y, 6, 15);
    let a = 0, n = 0;
    d.feats.forEach((f, i) => {
      const s = ymd(f[2], f[3], f[4]), e = ymd(f[5], f[6], f[7]);
      if (s <= t && (exclusiveEnd ? e > t : e >= t)) { a += area[i]; n++; }
    });
    out.push({ y, covered: a, n });
  }
  return out;
}

/* ── fetch ──────────────────────────────────────────────────────────────────
   ⚠ RETRIES ARE NOT DECORATION. Measured this round: three of the first five connections to
   icr.ethz.ch timed out at undici's 10 s connect ceiling and the fourth delivered all 26,344,671
   bytes. A one-shot download would have reported the dataset as gone. */
async function fetchUpstream() {
  mkdirSync(CACHE, { recursive: true });
  for (let i = 0; i < 8; i++) {
    try {
      const r = await fetch(URL_GEOJSON);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length < 1e7) throw new Error('only ' + b.length + ' bytes — not the whole dataset');
      writeFileSync(GEOJSON, b);
      return b.length;
    } catch (e) {
      console.error('  attempt ' + (i + 1) + ': ' + ((e.cause && e.cause.code) || e.message));
      await new Promise(s => setTimeout(s, 3000 * (i + 1)));
    }
  }
  throw new Error('could not fetch ' + URL_GEOJSON);
}

/* ── build (in memory) ──────────────────────────────────────────────────────
   The pool is filled in the upstream's own feature order, which is the order the committed file is
   in — measured: all 710 identity tuples (name, gwcode, start, end) match position for position. */
function build(tol = TOL, minArea = MIN_AREA) {
  if (!existsSync(GEOJSON)) throw new Error('no cached upstream at ' + GEOJSON + ' — run `node scripts/build-cshapes.mjs --fetch` first');
  const up = JSON.parse(readFileSync(GEOJSON, 'utf8'));
  const rings = [], pool = new Map();
  const put = r => { const k = JSON.stringify(r); let i = pool.get(k);
    if (i === undefined) { i = rings.length; rings.push(r); pool.set(k, i); } return i; };
  const feats = [];
  for (const f of up.features) {
    const p = f.properties, g = f.geometry;
    const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(poly => {
      const out = [];
      for (const ring of poly) {
        const s = round(dp(ring, tol));
        if (s.length < 4) continue;                       /* a closed ring needs three distinct corners */
        if (Math.abs(ringArea(s)) < minArea) continue;
        out.push(put(s));
      }
      return out;
    }).filter(poly => poly.length);
    feats.push([p.cntry_name, p.gwcode, p.gwsyear, p.gwsmonth, p.gwsday, p.gweyear, p.gwemonth, p.gweday, polys]);
  }
  return { v: 2, src: 'CShapes 2.0 (Schvitz et al. 2022, icr.ethz.ch/data/cshapes)', rings, feats };
}

/* ── default mode: rebuild and hold it against the shipped bytes ────────────*/
function compare() {
  const made = build();
  const have = evaluate(OUT, '__CSHAPES');
  const pts = a => a.reduce((n, r) => n + r.length, 0);
  console.log(`rebuilt  ${made.feats.length} records  ${made.rings.length} rings  ${pts(made.rings)} points`);
  console.log(`shipped  ${have.feats.length} records  ${have.rings.length} rings  ${pts(have.rings)} points  ${statSync(OUT).size} bytes`);

  let idEq = 0;
  for (let i = 0; i < Math.min(made.feats.length, have.feats.length); i++)
    if (made.feats[i].slice(0, 8).join('|') === have.feats[i].slice(0, 8).join('|')) idEq++;
  console.log(`identities (name, gwcode, span) matching position for position: ${idEq}/${have.feats.length}`);

  let same = 0;
  for (let i = 0; i < Math.min(made.rings.length, have.rings.length); i++)
    if (JSON.stringify(made.rings[i]) === JSON.stringify(have.rings[i])) same++;
  console.log(`rings byte-identical at the same pool index: ${same}/${made.rings.length}`);

  const differ = [];
  for (let i = 0; i < have.feats.length; i++)
    if (JSON.stringify(made.feats[i][8]) !== JSON.stringify(have.feats[i][8])) differ.push(i);
  console.log(`records whose polygons the upstream does not reproduce: ${differ.length}`
    + (differ.length ? ' — ' + differ.map(i => `${have.feats[i][0]} ${have.feats[i][2]}-${have.feats[i][5]}`).join(', ') : ''));
  console.log('⚠ nothing was written. The shipped bundle carries #R145/#R146\'s German geometry, which is not in the upstream;');
  console.log('  replacing it is a change to shipped geometry and belongs to a round that takes that rebuild with it.');
}

/* ── measure: the sweep that chose the tolerance, and nothing written ───────*/
function measure() {
  const have = evaluate(OUT, '__CSHAPES');
  const target = new Set(); for (let i = 0; i < have.rings.length; i++) target.add(JSON.stringify(have.rings[i]));
  console.log('shipped: ' + have.rings.length + ' rings, ' + have.rings.reduce((n, r) => n + r.length, 0) + ' points');
  console.log('  tol     rings    points   byte-identical rings');
  for (const tol of [0.002, 0.004, 0.006, 0.008, 0.01, 0.012, 0.015]) {
    const made = build(tol);
    let hit = 0; for (const r of made.rings) if (target.has(JSON.stringify(r))) hit++;
    console.log(`  ${String(tol).padEnd(7)} ${String(made.rings.length).padStart(5)} ${String(made.rings.reduce((n, r) => n + r.length, 0)).padStart(9)}   ${hit}`);
  }
}

/* ── check (offline) ────────────────────────────────────────────────────────
   ⚠ RE-DERIVES NOTHING FROM THE SOURCE — see the header. What it proves is that the committed bytes
   are drawable, that they fill the window the app asks them for, that the record is internally one
   record per polity per span, that the credit CC BY-NC-SA makes a condition is actually paid on a
   reader-facing page, and that the NEIGHBOUR built on this file is still standing on it. */
function check() {
  const bad = [];
  const ok = (c, m) => { if (!c) bad.push(m); };
  let d;
  try { d = evaluate(OUT, '__CSHAPES'); } catch (e) { fail(['data/cshapes.js does not evaluate: ' + e.message]); return; }

  ok(d && d.v === 2, 'v must be 2');
  ok(d && typeof d.src === 'string' && d.src.length > 10, 'src missing');
  ok(d && Array.isArray(d.rings) && d.rings.length > 0, 'rings missing');
  ok(d && Array.isArray(d.feats) && d.feats.length > 0, 'feats missing');
  /* ⚠ THE UPSTREAM HAS TO NAME ITSELF IN THE FILE, the way data/hist-borders.js's `src` names
     OpenHistoricalMap and CC0. ⚠ AND THE LICENCE IS NOT ASKED OF `src` HERE, BECAUSE THE COMMITTED
     `src` DOES NOT CARRY ONE — «CShapes 2.0 (Schvitz et al. 2022, icr.ethz.ch/data/cshapes)». The
     gate is not weakened to fit it: the obligation is asked of js/reference-data.js below, which is
     where a reader can actually see it. Adding «· CC BY-NC-SA 4.0» to `src` is a one-line change to
     a shipped data file and needs the approval AGENTS.md §3-1 requires; on the day it lands, the
     next two lines take /CC BY-NC-SA/ as well. */
  ok(d && /CShapes/i.test(d.src), 'src must name CShapes');
  ok(d && /ethz/i.test(d.src), 'src must name the publisher (ethz)');
  if (bad.length) { fail(bad); return; }

  /* rings: closed, on the globe, big enough to be a ring at all */
  d.rings.forEach((r, i) => {
    if (!Array.isArray(r) || r.length < 4) { bad.push('ring ' + i + ' has ' + (r && r.length) + ' points'); return; }
    if (r.some(p => !Array.isArray(p) || p.length !== 2 || !isFinite(p[0]) || !isFinite(p[1]) ||
                    p[0] < -180.001 || p[0] > 180.001 || p[1] < -90.001 || p[1] > 90.001))
      bad.push('ring ' + i + ' leaves the globe');
    else if (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])
      bad.push('ring ' + i + ' is not closed — this bundle stores closed rings and js/time-borders.js draws them as such');
  });

  /* records: nine slots, a name, a code, an ordered span inside the window the app asks for */
  const [Y_MIN, Y_MAX] = appWindow();
  const T_LO = ymd(Y_MIN, 1, 1), T_HI = ymd(Y_MAX, 12, 31);
  const used = new Set();
  const byCode = new Map(), nameOf = new Map(), codeOf = new Map();
  d.feats.forEach((f, i) => {
    if (!Array.isArray(f) || f.length !== 9) { bad.push('feat ' + i + ' has ' + (f && f.length) + ' slots, not 9'); return; }
    const [nm, gw] = f;
    if (typeof nm !== 'string' || !nm.trim()) bad.push('feat ' + i + ' has no name');
    if (!Number.isInteger(gw)) bad.push('feat ' + i + ' (' + nm + ') has no Gleditsch-Ward code');
    for (const k of [3, 6]) if (!(f[k] >= 1 && f[k] <= 12)) bad.push('feat ' + i + ' (' + nm + ') has month ' + f[k]);
    for (const k of [4, 7]) if (!(f[k] >= 1 && f[k] <= 31)) bad.push('feat ' + i + ' (' + nm + ') has day ' + f[k]);
    const s = ymd(f[2], f[3], f[4]), e = ymd(f[5], f[6], f[7]);
    if (!(s <= e)) bad.push('feat ' + i + ' (' + nm + ') ends before it starts');
    if (!(s >= T_LO && e <= T_HI)) bad.push('feat ' + i + ' (' + nm + ') runs ' + s + '-' + e + ', outside the ' + Y_MIN + '-' + Y_MAX + ' js/time-borders.js asks this record for');
    if (!Array.isArray(f[8]) || !f[8].length) bad.push('feat ' + i + ' (' + nm + ') has no polygons');
    else for (const poly of f[8]) for (const ri of poly) {
      if (!(Number.isInteger(ri) && ri >= 0 && ri < d.rings.length)) bad.push('feat ' + i + ' (' + nm + ') points at ring ' + ri);
      else used.add(ri);
    }
    /* ⚠ ONE CODE IS ONE POLITY AND ONE POLITY IS IN ONE PLACE AT A TIME — the same rule
       scripts/build-hist-borders.mjs enforces on its own record, measured to hold here: 252 codes,
       252 names, a perfect pairing, and not one pair of spans on the same code that overlap. A
       rebuild that breaks either draws two flags on one country on the day they cross. */
    if (typeof nm === 'string' && Number.isInteger(gw)) {
      if (nameOf.has(gw) && nameOf.get(gw) !== nm) bad.push('code ' + gw + ' is both «' + nameOf.get(gw) + '» and «' + nm + '»');
      if (codeOf.has(nm) && codeOf.get(nm) !== gw) bad.push('«' + nm + '» is both code ' + codeOf.get(nm) + ' and ' + gw);
      nameOf.set(gw, nm); codeOf.set(nm, gw);
      const arr = byCode.get(gw); if (arr) arr.push(f); else byCode.set(gw, [f]);
    }
  });
  for (const [gw, arr] of byCode) {
    arr.sort((a, b) => ymd(a[2], a[3], a[4]) - ymd(b[2], b[3], b[4]));
    for (let i = 0; i + 1 < arr.length; i++)
      if (ymd(arr[i][5], arr[i][6], arr[i][7]) >= ymd(arr[i + 1][2], arr[i + 1][3], arr[i + 1][4]))
        bad.push('code ' + gw + ' («' + arr[i][0] + '») is drawn twice across ' + arr[i + 1][2] + '-' + arr[i + 1][3] + '-' + arr[i + 1][4]);
  }
  if (bad.length) { fail(bad); return; }

  /* orphans — allowed, counted, ratcheted (see ORPHAN_POINTS) */
  let orphanRings = 0, orphanPts = 0;
  for (let i = 0; i < d.rings.length; i++) if (!used.has(i)) { orphanRings++; orphanPts += d.rings[i].length; }
  ok(orphanPts <= ORPHAN_POINTS, orphanPts + ' points sit in rings nothing references, over the ' + ORPHAN_POINTS
     + ' this file is known to carry from #R142/#R146 — a rebuild should not be adding dead weight');

  /* ⚠⚠ AND THE PART THAT IS NOT STRUCTURAL: THE RECORD NEXT DOOR IS STANDING ON THIS FILE ────────
     scripts/build-hist-borders.mjs derives its floor by asking THIS bundle how much land a world
     is: bar = min(CShapes) − (max − min), and the earliest year its own record clears that bar
     continuously is the floor it declares in data/hist-borders.js `window[0]`. That makes the two
     files one decision. Re-derive it here from both committed bundles: a re-simplified or truncated
     CShapes that moves min/max moves the neighbour's floor, and every structural invariant above
     still holds while it happens. */
  let hb = null;
  try { hb = evaluate(HB, '__HISTB'); } catch (_) { bad.push('data/hist-borders.js does not evaluate, so the floor it derives from this file cannot be re-checked'); }
  if (hb) {
    const mine = coverage(d, Y_MIN, Y_MAX, false);
    let min = Infinity, max = 0;
    for (const r of mine) { if (r.covered < min) min = r.covered; if (r.covered > max) max = r.covered; }
    const bar = min - (max - min);
    const theirs = coverage(hb, hb.window[0], hb.window[1], true);
    let floor = hb.window[1] + 1;
    for (let i = theirs.length - 1; i >= 0; i--) { if (theirs[i].covered < bar) break; floor = theirs[i].y; }
    ok(floor === hb.window[0], 'this file now puts data/hist-borders.js\'s floor at ' + floor + ', and that bundle declares '
       + hb.window[0] + ' — the neighbour derives its window from this record and has to be rebuilt with it');

    /* ⚠ AND THE SYMMETRIC BAR, asked of the neighbour the way the neighbour asks it of this file.
       ⚠ THE TIGHTER READING WAS MEASURED AND REJECTED: «the world does not shrink at the handover»
       fails on today's bytes — data/hist-borders.js draws 14,159 deg² on 15 June 1885 and this file
       draws 12,895 on 15 June 1886, because CShapes' first frame holds 128 polities against the
       181 it ends with. That gap is a fact about two records meeting, not about a rebuild, so the
       bar is the neighbour's own smallest world allowed one neighbour-spread of slack. It is loose
       — today's smallest year clears it by half again — and it is the honest shape: it catches a
       record that stopped being a world, not a record that disagrees with its neighbour. */
    let hmin = Infinity, hmax = 0;
    for (const r of theirs) { if (r.covered < hmin) hmin = r.covered; if (r.covered > hmax) hmax = r.covered; }
    const theirBar = hmin - (hmax - hmin);
    for (const r of mine) {
      if (!r.n) bad.push(r.y + ' has no polities in force at all');
      else if (r.covered < theirBar) bad.push(r.y + ' covers only ' + r.covered.toFixed(0) + ' deg², under the ' + theirBar.toFixed(0) + ' a world takes');
    }
  }

  /* ⚠⚠⚠ THE CREDIT CC BY-NC-SA MAKES A CONDITION OF REDISTRIBUTION IS ACTUALLY PAID (#R689) ──────
     Same gate as scripts/build-hist-cities.mjs, same LIC() value, and it asks for the LICENCE TEXT
     too — because #R689's failure was not a missing row, it was a row that named the publisher and
     never said what shipping their data costs. */
  const reg = readFileSync(REF, 'utf8');
  const arr = /const DATA_SOURCES=\[[\s\S]*?\n  \];/.exec(reg);
  if (!arr) bad.push('js/reference-data.js no longer holds DATA_SOURCES as one array literal, so the credit this record owes cannot be proven paid');
  else {
    ok(arr[0].includes(LICENCE.source), 'js/reference-data.js has no DATA_SOURCES row «' + LICENCE.source
       + '» to pay the attribution ' + LICENCE.licence + ' makes a condition of redistribution');
    ok(arr[0].includes(LICENCE.licence), 'js/reference-data.js names this source and never says it is '
       + LICENCE.licence + ' — a reader who redistributes IntMap\'s copy would not know what it costs');
    ok(arr[0].includes(CITATION), 'js/reference-data.js does not carry the citation the publisher asks for');
  }

  if (bad.length) { fail(bad); return; }
  console.log(`cshapes ok — ${d.feats.length} records, ${codeOf.size} polities, ${d.rings.length} rings `
    + `(${orphanRings} unreferenced, ${orphanPts} points), ${Y_MIN}-${Y_MAX}, ${LICENCE.licence}`);
}

function fail(bad) {
  console.error('cshapes: ' + bad.length + ' problem(s)');
  for (const b of bad.slice(0, 25)) console.error('  ' + b);
  process.exitCode = 1;
}

/* ⚠ THE CLI RUNS ONLY WHEN THIS FILE IS THE ONE NODE WAS ASKED TO RUN. tests/r700-cshapes-checks
   imports LICENCE and CITATION from here — the licence is a value, and a value has to be readable
   without also starting a 26 MB rebuild. */
const arg = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  ? process.argv.slice(2) : null;
if (!arg) { /* imported for its values */ }
else if (arg.includes('--check')) check();
else if (arg.includes('--fetch')) console.error('fetched ' + await fetchUpstream() + ' bytes into ' + CACHE);
else if (arg.includes('--measure')) measure();
else compare();
