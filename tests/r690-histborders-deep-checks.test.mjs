/* ============================================================================
 *  #R690 — the borders below 1850 became a record instead of a snapshot
 * ----------------------------------------------------------------------------
 *  「1850年より前の国境を、スナップショットから日単位の記録へ」
 *
 *  #R518 gave 1850–1885 day-exact polygons off OpenHistoricalMap and stopped there. The source did
 *  not: 2,101 of its 3,985 admin_level=2 relations END before 1850, so 53% of what it publishes sat
 *  under the window, and every year of it was answered by data/hist-eras.js — snapshots 100 years
 *  apart below AD 1000, 30–70 apart above. The bundle now runs from 1689.
 *
 *  ⚠ WHAT THESE CHECKS EXIST TO STOP, in order of how quietly it would happen:
 *   ① The widening being undone — by a rebuild, or by the two-record wiring being «tidied» back to
 *      one band. #R518's own window has to stay inside the new one (tests/r518-checks.test.mjs holds
 *      that side); what is held HERE is that the record reaches below it at all, and with content.
 *   ② The floor becoming a year somebody typed. It is DERIVED — the record must cover as much land
 *      as data/cshapes.js does — and the derivation is re-run here from the two committed bundles.
 *   ③ HB_MIN in js/time-borders.js drifting from the bundle's own `window[0]`. It exists only
 *      because `go()` must decide whether to inject a 13 MB file before it can read that file.
 *   ④ The band swallowing the fall-through. The record does NOT fill 1689–1885 evenly, so a day it
 *      holds nothing for must still reach the snapshot below instead of blanking the map.
 *   ⑤ The member ROLES going back to «everything that is not inner is outline». 8,769 of the 8,782
 *      relation members are `subarea` — subdivisions, not this boundary — and the widened download
 *      resolves thousands of them where #R518's left them dangling.
 *   ⑥ `Date.UTC` coming back into the builder. Below year 100 it applies the two-digit-year rule
 *      (y + 1900), which #R602 measured going wrong in four places the moment a floor was lowered.
 *   ⑦ The Overpass cache being keyed by batch position again (#R669 lost 3.4 GB that way), which
 *      would make the next widening re-download everything.
 *   ⑧ The nine languages surviving only in the part #R518 already had.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { migrateBatches, loadGeom } from '../scripts/histborders/fetch.mjs';

import { timeBorders } from '../scripts/histeras/time-borders.mjs';   /* (#R695) ask the module, not its source */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const TB = rd('js/time-borders.js');
const BUILD = rd('scripts/build-hist-borders.mjs');

const bundle = (path, global) => { const w = {}; new Function('window', rd(path))(w); return w[global]; };
const HB = bundle('data/hist-borders.js', '__HISTB');
const CS = bundle('data/cshapes.js', '__CSHAPES');

const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const ringArea = (r) => { let s = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
const polyArea = (polys) => { let a = 0; for (const p of polys) p.forEach((ring, k) => { a += (k === 0 ? 1 : -1) * Math.abs(ringArea(ring)); }); return a; };
const hbAlive = (y) => { const t = ymd(y, 6, 15); return HB.feats.filter((f) => ymd(f[2], f[3], f[4]) <= t && ymd(f[5], f[6], f[7]) > t); };

/* ① the record reaches below 1850, and what is down there is a world -------------------------*/
test('① the day-exact record reaches below 1850 and carries far more than #R518 shipped', () => {
  assert.ok(HB.window[0] < 1850, 'the record still stops at ' + HB.window[0] + ' — the widening is gone');
  assert.equal(HB.window[1], 1885, 'the record no longer stops where CShapes begins');
  /* #R518 shipped 494 records and 216 transition dates inside its window. A rebuild that lost the
     widened half would still be well-formed, so the size of the record is the claim. */
  assert.ok(HB.feats.length > 900, 'only ' + HB.feats.length + ' records — #R518 alone shipped 494');
  const b = new Set();
  for (const f of HB.feats) { b.add(ymd(f[2], f[3], f[4])); b.add(ymd(f[5], f[6], f[7])); }
  const below = [...b].filter((k) => k >= ymd(HB.window[0], 1, 1) && k < ymd(1850, 1, 1));
  assert.ok(below.length > 300, 'only ' + below.length + ' transition dates below 1850 — this is what «day by day» means here');
});

/* ⚠ the point of the round is the states the snapshots CANNOT hold: each of these was gone before
   1850, each is drawn on a date it demonstrably existed, and each is a different reason the frozen
   frame was wrong. The three partitions of Poland-Lithuania are in the source as three dated
   records — that is the whole argument for a record over a snapshot, in one polity. */
test('① the states that only the widened band can show are in it, on the right dates', () => {
  const want = [
    [1789, /^Holy Roman Empire$/, 'dissolved 1806'],
    [1789, /^Kingdom of Great Britain$/, '1707-1800, before the union with Ireland'],
    [1789, /^Republic of Venice$/, 'extinguished 1797'],
    [1789, /^Poland-Lithuania$/, 'partitioned away by 1795'],
    [1700, /^Mughal Empire$/, 'at its greatest extent'],
    [1700, /^Qing$/, 'the dynasty the 1880 frame cannot date'],
    [1750, /^Ottoman Empire$/, 'between the treaties'],
  ];
  const missing = [];
  for (const [y, re, why] of want) if (!hbAlive(y).some((f) => re.test(f[0].en))) missing.push(y + ' ' + re.source + ' (' + why + ')');
  assert.deepEqual(missing, [], 'absent from the record: ' + missing.join(' | '));
  /* and the partitions really are separate dated records, not one polygon with one span */
  const pl = HB.feats.filter((f) => /^Poland-Lithuania$/.test(f[0].en));
  assert.ok(pl.length >= 3, 'Poland-Lithuania is ' + pl.length + ' record(s) — the partitions have been flattened');
});

/* ② the floor is derived, and the derivation still holds --------------------------------------*/
/* ⚠ THE BAR IS ASKED OF data/cshapes.js, THE RECORD NEXT DOOR — the same kind of record (sovereign
   states, day-exact, tiling the globe without overlapping claims) and the one this bundle hands over
   to. Two earlier bars were falsified by measurement and both are named in the builder's header; the
   short version is that data/hist-eras.js draws overlapping colonial claims, so world_1815 sums to
   18,845 deg² — a third more than there is land on Earth — and a bar built on it measures how
   contested an era was, not how much of the world a record holds. */
const csWorld = () => {
  let min = Infinity, max = 0;
  for (let y = 1886; y <= 2019; y++) {
    const t = ymd(y, 6, 15); let a = 0;
    for (const f of CS.feats) if (ymd(f[2], f[3], f[4]) <= t && ymd(f[5], f[6], f[7]) >= t)
      a += polyArea(f[8].map((poly) => poly.map((ri) => CS.rings[ri])));
    if (a < min) min = a; if (a > max) max = a;
  }
  return { min, max, bar: min - (max - min) };
};

test('② every year of the window covers as much of the world as CShapes does', () => {
  const { bar } = csWorld();
  assert.ok(bar > 0 && Number.isFinite(bar), 'the bar could not be derived from data/cshapes.js');
  const thin = [];
  for (let y = HB.window[0]; y <= HB.window[1]; y++) {
    const a = hbAlive(y).reduce((s, f) => s + polyArea(f[8].map((poly) => poly.map((ri) => HB.rings[ri]))), 0);
    if (a < bar) thin.push(y + ':' + a.toFixed(0));
  }
  assert.deepEqual(thin.slice(0, 8), [], thin.length + ' year(s) under the ' + bar.toFixed(0) + ' deg² a world takes: ' + thin.slice(0, 8).join(', '));
});

/* ⚠ THE RESIDUAL, STATED RATHER THAN IMPLIED. The bundle holds only the records that survived the
   floor, so «why not LOWER than 1689» cannot be re-derived from what is committed — that half needs
   the ~2.1 GB Overpass download. What is checkable offline is the other half: that the floor is
   TIGHT, i.e. the shipped record clears the bar everywhere (above) and the builder computes the
   floor from the data rather than reading a literal (here). */
test('② the builder derives the floor instead of spelling one', () => {
  assert.doesNotMatch(BUILD, /(const|let|var)\s+Y_MIN\s*=\s*-?\d/, 'the builder has gone back to a typed floor');
  assert.match(BUILD, /window:\s*\[floor,\s*Y_MAX\]/, 'the bundle no longer records the derived floor');
  const derive = liftFunction(codeOnly(BUILD), 'cshapesWorld');
  assert.match(derive, /min\s*-\s*\(\s*max\s*-\s*min\s*\)/, 'the bar is no longer CShapes\' own spread below its own minimum');
  assert.match(derive, /1886/, 'the bar is no longer measured over CShapes\' own reach');
});

/* ③ the copy in js/ is held to the bundle -----------------------------------------------------*/
test('③ HB_MIN and HB_MAX are the bundle\'s own window, to the year', () => {
  const m = /const HB_MIN=(-?\d+), ?HB_MAX=(\d+);/.exec(TB);
  assert.ok(m, 'js/time-borders.js no longer declares the band');
  assert.equal(+m[1], HB.window[0], 'HB_MIN has drifted from the bundle\'s derived floor');
  assert.equal(+m[2], HB.window[1], 'HB_MAX has drifted from the bundle\'s own top');
  /* the stepper publishes a reach that CONTAINS this record — a record that walks real
     border-change dates has to be able to walk the ones below 1850, and `range()` is what the UI
     asks. ⚠ (#R695) THIS ASKS THE FUNCTION, NOT ITS SPELLING. #R690 wrote it as a match on
     `range:()=>({min:HB_MIN,max:CS_MAX})`, which is the shape #R488 warns about: the moment the
     reach legitimately grew — #R695 put the era sheets in the stepper's list, so the floor is now
     the clock's — a correct change turned this red while a wrong one (a floor ABOVE this record,
     which would make the whole band unreachable from the stepper) would still have passed. */
  const { api } = timeBorders({ lang: 'en' });
  const r = api.range();
  assert.ok(r && Number.isFinite(r.min) && Number.isFinite(r.max), 'the stepper publishes no reach at all');
  assert.ok(r.min <= HB.window[0], 'the published range starts above this record — its band is unreachable from the stepper');
  assert.ok(r.max >= HB.window[1], 'the published range ends below this record');
});

/* ④ the fall-through is per instant, not per band ---------------------------------------------*/
test('④ a day inside the band with nothing to draw still reaches the snapshot below', () => {
  /* ⚠ THE COMMENTS COME OFF FIRST. The prose beside this very band names `fc.features.length` to
     explain it, so a search over the raw file finds the explanation of the guard in the block that
     must NOT have one — #R628 hit exactly this reading a ci.yml comment as the call it described. */
  const code = codeOnly(TB);
  const go = code.slice(code.indexOf('async function go(when)'));
  const band = go.indexOf('year>=HB_MIN&&year<=HB_MAX');
  const guard = go.indexOf('fc&&fc.features.length');
  const fall = go.indexOf('const ny=nearest(');
  assert.ok(band > 0 && guard > band, 'the 1689-1885 band no longer tests that the collection has features');
  assert.ok(guard < fall, 'the snapshot fallback is reached before the bundle');
  /* and the CShapes band above must NOT have grown the same guard — an empty year there is a real
     answer (#R117), and treating it as «fall through» would put the aourednik world over 1886-2019 */
  const cs = go.slice(go.indexOf('year>=CS_MIN&&year<=CS_MAX'), band);
  assert.doesNotMatch(cs, /features\.length/, 'the CShapes band has adopted the fall-through it must not have');
});

/* ⑤ the member roles ---------------------------------------------------------------------------*/
/* ⚠ EVALUATED, NOT GREPPED (#R505). `waysOf` is lifted out of the builder and run against members
   that spell each role, so what is tested is what the function DOES. Reading the source for the
   word «subarea» would pass on a version that mentioned it in a comment. */
test('⑤ only outer/inner/role-less ways are outline, and only a role-less relation is recursed into', () => {
  const src = liftFunction(codeOnly(BUILD), 'waysOf');
  const BOUNDARY_WAY = new Set(['outer', 'inner', '']);
  const waysOf = new Function('BOUNDARY_WAY', src + '; return waysOf;')(BOUNDARY_WAY);
  const pt = (n) => [{ lon: n, lat: n }, { lon: n + 1, lat: n }];
  const child = { id: 2, members: [{ type: 'way', role: 'outer', geometry: pt(50) }] };
  const rel = { id: 1, members: [
    { type: 'way', role: 'outer', geometry: pt(0) },
    { type: 'way', role: 'inner', geometry: pt(10) },
    { type: 'way', role: '', geometry: pt(20) },
    { type: 'way', role: 'label', geometry: pt(30) },
    { type: 'way', role: 'admin_centre', geometry: pt(40) },
    { type: 'relation', role: 'subarea', ref: 2 },
  ] };
  const resolve = (id) => (id === 2 ? child : null);
  const got = waysOf(rel, resolve);
  assert.deepEqual(got.map((w) => w.pts[0][0]).sort((a, b) => a - b), [0, 10, 20],
    'label / admin_centre / subarea are being read as boundary');
  /* …and a role-LESS relation member IS the boundary — it is the whole geometry of the Confederate
     States (eleven members) and of Sarawak (one), which have no ways of their own */
  const only = { id: 3, members: [{ type: 'relation', role: '', ref: 2 }] };
  assert.deepEqual(waysOf(only, resolve).map((w) => w.pts[0][0]), [50],
    'a role-less relation member is no longer expanded — the Confederate States have no geometry without it');
});

/* ⑥ no Date.UTC in the builder -----------------------------------------------------------------*/
test('⑥ the builder does no date arithmetic through Date.UTC', () => {
  assert.doesNotMatch(codeOnly(BUILD), /Date\.UTC/,
    'Date.UTC applies the two-digit-year rule below year 100 (#R602) and this record now reaches years it would corrupt');
  /* the replacement has to be right for the case it exists for: the day after 29 February */
  const nextDay = new Function('MLEN', 'isLeap', liftFunction(codeOnly(BUILD), 'nextDay') + '; return nextDay;')(
    [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0);
  assert.deepEqual(nextDay([1700, 2, 28]), [1700, 3, 1], '1700 is not a leap year');
  assert.deepEqual(nextDay([1704, 2, 28]), [1704, 2, 29], '1704 is');
  assert.deepEqual(nextDay([1704, 12, 31]), [1705, 1, 1]);
  assert.deepEqual(nextDay([1689, 6, 15]), [1689, 6, 16]);
});

/* ⑦ the Overpass cache is keyed by relation, not by batch --------------------------------------*/
/* ⚠ RUN, DO NOT READ. #R669 keyed a 3.4 GB cache by the position of a batch and lost all of it the
   next time the id list changed; this round changed the list from 506 relations to 2,607, so the
   same mistake here would have re-downloaded about 2.1 GB. The test builds a cache in the shape
   #R518 left behind and asks the migration to bring it forward. */
test('⑦ a relation is found in the cache by its own id, whatever batch it arrived in', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intmap-histb-test-'));
  try {
    mkdirSync(join(dir, 'geom'), { recursive: true });
    writeFileSync(join(dir, 'geom', '100.json'), JSON.stringify({ elements: [
      { type: 'relation', id: 100, members: [] }, { type: 'relation', id: 101, members: [] }] }));
    writeFileSync(join(dir, 'geom', '200.json'), JSON.stringify({ elements: [{ type: 'relation', id: 200, members: [] }] }));
    assert.equal(migrateBatches(dir), 3, 'the batch files were not brought forward one relation at a time');
    /* 101 arrived inside the batch named after 100 — the whole point is that it is reachable by 101 */
    assert.equal(loadGeom(dir, 101).id, 101, 'a relation is still only reachable through its batch');
    assert.equal(loadGeom(dir, 200).id, 200);
    assert.equal(loadGeom(dir, 999), undefined, 'a relation never asked for must be distinguishable from one with no answer');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ⑧ the nine languages reach the deep end too --------------------------------------------------*/
test('⑧ the widened half carries the source\'s own names, not English nine times', () => {
  const below = HB.feats.filter((f) => ymd(f[5], f[6], f[7]) <= ymd(1850, 1, 1));
  assert.ok(below.length > 500, 'only ' + below.length + ' records end before 1850');
  const thin = [];
  for (const c of ['jp', 'de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko']) {
    const n = below.filter((f) => f[0][c]).length;
    if (n < below.length * 0.4) thin.push(c + ':' + n + '/' + below.length);
  }
  assert.deepEqual(thin, [], 'languages that thin out below 1850: ' + thin.join(', '));
});
