#!/usr/bin/env node
/* ============================================================================
 *  IntMap · data/border-coast.js — which edges of a historical outline are BORDER   (#R531)
 * ----------------------------------------------------------------------------
 *  「昔の国境は海岸より先まであるのが気持ち悪い。1900年以前など。」
 *
 *  ══ WHAT WAS DRAWN, MEASURED ═══════════════════════════════════════════════════════════════════
 *  France on 1900-07-01 comes out of data/cshapes.js. Densified at 0.005° through the Gulf of Lion
 *  and measured against data/coastline.json.gz (Natural Earth 1:10m, 2 km tolerance): the outline
 *  runs up to 5.3 km from the real shore, 30.6% of the densified points are more than 1 km off, and
 *  one single EDGE — [3.547,43.32] → [3.965,43.541] — is a 40 km straight chord across open water
 *  from Sète to Le Grau-du-Roi. That chord is the white line in the report.
 *
 *  ══ WHY THAT IS NOT A SIMPLIFICATION BUG ═══════════════════════════════════════════════════════
 *  Because the chord is not an error ABOUT a border. A political record's ring is two different
 *  kinds of edge welded into one loop: the boundaries between polities, which only that record
 *  knows, and the polity's own copy of the COASTLINE, which the planet knows better. IntMap already
 *  ships the planet's answer twice over — data/coastline.json.gz for measurement, and the
 *  `coast-only-line` layer (js/coast-line.js, a basic row that ships ON) which strokes the live
 *  vector tiles' water polygons in the SAME colour and the SAME width as a border. So on screen the
 *  reader was being shown two lines of identical appearance, several kilometres apart, one of them
 *  a 1.3 km-tolerance nineteenth-century copy of the other.
 *
 *  The record's copy is therefore not corrected here — it is not DRAWN. This file marks, for every
 *  pooled ring of both bundles, which of its edges are border and which are that copy; the runtime
 *  (js/time-borders.js) strokes only the border runs and lets the coastline layer be the coast.
 *  Nothing is resampled, so the outline is exact at every zoom instead of exact at one of them.
 *
 *  ══ THE RULE, AND THE ONE CONSTANT IN IT ═══════════════════════════════════════════════════════
 *      an edge is BORDER  ⇔  some point on it lies more than INLAND_KM inland.
 *  "Inland" is signed: + on land, − at sea, in km from the nearest water edge (scripts/bordercoast/
 *  water.mjs, over data/coastline.json.gz). The sea half of the rule is what deletes the chord; the
 *  land half is what deletes the other half of the same defect — a simplified coast cuts ACROSS a
 *  headland as often as it bulges into a bay, and an unexplained white line a few kilometres inland
 *  of the shore is the same wrong claim seen from the other side.
 *
 *  INLAND_KM is measured, not chosen, and the measurement that settles it is not the histogram —
 *  see the constant below.
 *
 *  ⚠ WHICH BUNDLES ARE MARKED IS NOT WRITTEN DOWN HERE (#R695). It is discovered from data/ — see
 *  discoverBundles() below and the measurement above it. What is still NOT covered is the aourednik
 *  snapshots fetched from GitHub AT RUNTIME (js/time-borders.js's proxy fallback, reached only for a
 *  year data/hist-eras.js does not hold): there is no build step to mark those in, so js/border-coast.js
 *  draws an unmarked collection whole, exactly as it did before #R531.
 *
 *      node scripts/build-border-coast.mjs --report   # print the measurement INLAND_KM is read off
 *      node scripts/build-border-coast.mjs            # write data/border-coast.js
 *      node scripts/build-border-coast.mjs --check    # re-derive and verify the COMMITTED file (offline)
 * ==========================================================================*/
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWater } from './bordercoast/water.mjs';
import { ringArea } from './histborders/geom.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'border-coast.js');

/* ⚠ MEASURED, 2026-09-07, TWO WAYS, AND THE SECOND ONE IS WHY IT IS 6 AND NOT 2.5.
   `--report` walks all 646,722 edges of both bundles and bins the deepest point of each. The shape
   is bimodal — 95,640 edges peak in the first kilometre, the border mass sits past 20 km — but the
   coastal population has a LONG TAIL, so the histogram alone reads as a trough at 2–3 km and a cut
   there leaves the shallow half of the copy on the map. Measured at 2.5 km on 1900-07-01: the Rhône
   delta still drew a white line across the Camargue, and SEVENTEEN island polities with no land
   neighbour at all — Japan, the United Kingdom, Iceland, Madagascar, New Zealand, Cuba, Ceylon… —
   still drew a "border".
   The second measurement is what settles it. Sweeping the cut over 1900 / 1950 / 1990:
       cut  km    2.5      3      4      5      6      7      8     10     14
       drawn km   446713 427589 409936 403376 401121 399878 398975 397734 395467   (1900)
       silent          8     10     15     21     25     25     26     26     26
   Two things happen together at 6. The marginal cost flattens to the noise floor — 2,255 km of line
   lost per km of cut at 5→6, 1,243 at 6→7, and ~600 from 8 upwards, which is genuine border being
   trimmed. And the set of polities that draw NOTHING saturates at 25 and consists, checked name by
   name in all three years, ENTIRELY of polities with no land neighbour. Not one polity with a real
   land border falls silent. Below 6 the map still claims borders that never existed; above it, only
   real ones are lost.
   ⚠ EXPIRES if either bundle is rebuilt at a different simplification tolerance (CShapes 0.008°,
   OHM 0.012°) or if data/coastline.json.gz is rebuilt coarser than its present 2 km — the band has
   to stay above the record's own coastal registration error and above the authority's. Re-run
   `--report` and the sweep; do not carry this number across a rebuild. */
const INLAND_KM = 6;
/* how finely an edge is walked before its deepest point is believed. 1 km is a quarter of the
   coarser bundle's own 1.3 km simplification step, so no edge is judged on its endpoints alone. */
const SAMPLE_KM = 1;
const KM_PER_DEG = 110.574;

function loadBundle(file, global) {
  const src = readFileSync(join(ROOT, 'data', file), 'utf8');
  const w = {};
  new Function('window', src)(w);
  const d = w[global];
  if (!d || !Array.isArray(d.rings)) throw new Error(file + ' did not define ' + global + '.rings');
  return d;
}

/* the ring as the runtime walks it: closed, so edge i is V[i]→V[i+1] for every i. data/cshapes.js
   repeats the first point and data/hist-borders.js does not — one shape, not two. */
export function closedRing(r) {
  const n = r.length;
  if (n > 1 && r[0][0] === r[n - 1][0] && r[0][1] === r[n - 1][1]) return r;
  return r.concat([r[0]]);
}

/* the deepest point of an edge, in km inland (+) or at sea (−), asked no further than `cap` — the
   question is always "is it past the band", never "how far exactly". Stops as soon as the verdict
   is settled: an edge already past the band cannot be un-settled by a further sample. */
function deepestInland(W, a, b, cut, cap) {
  const kx = KM_PER_DEG * Math.cos((a[1] + b[1]) * 0.5 * Math.PI / 360);
  const dx = (b[0] - a[0]) * kx, dy = (b[1] - a[1]) * KM_PER_DEG;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(2, Math.min(256, Math.ceil(len / SAMPLE_KM)));
  let best = -Infinity;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const v = W.inlandKm(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, cap);
    if (v > best) best = v;
    if (cut != null && best > cut) return best;
  }
  return best;
}

/* 1 = draw every edge, 0 = draw none, else the runs [a,b] of edge indices to draw (b exclusive):
   the drawn LineString is V.slice(a, b + 1). */
/* ⚠ (#R695) A RING THAT ENCLOSES NOTHING IS NOT AN OUTLINE, AND ITS EDGES BOUND NOTHING.
   Measured on data/hist-eras.js: 904 of its 8,814 pooled rings (10.3%) have a signed area of
   EXACTLY zero at the coordinates the file ships, and 891 of the 904 are paths that double back on
   themselves — the same vertex appears twice, the ring goes out and comes home along its own
   track. They are upstream's digitizing artifacts, not shapes: 421 of the 2,730 ring instances are
   already zero-area in the raw upstream GeoJSON, and the other 2,309 enclose 2.7e-5 deg² BETWEEN
   THEM — a third of a square kilometre spread over 2,309 rings averaging 190 km of path, i.e.
   floating-point noise, not slivers. No other bundle in data/ has one.
   The fill layers already draw nothing for them (there is no interior to fill), so the ONLY thing
   they put on the map is a line — a boundary claim around no territory, drawn in the colour and
   width of a border. That is the #R531 defect with a different cause, so it gets the same answer:
   not stroked.
   ⚠ AND NOTHING IS DELETED TO ACHIEVE IT. Dropping these rings from data/hist-eras.js was the
   other option and was measured: it would have removed 2,734 polygon entries, 1,007 of the unnamed
   `blank` polygons #R679 created that lane for, and 12 named features — of which two, «Andean
   hunter-gatherers» and «Savanna hunter-gatherers» (1783), have no other polygon in their snapshot
   and would leave the record entirely. The bundle keeps every ring upstream drew and every name it
   gave; the marks decide what is stroked, which is this file's job and not the bundle's.
   ⚠ EXPIRES IF a bundle ever encodes a genuine one-dimensional feature (a boundary line with no
   territory) as a zero-area ring — then this test would silence it. Nothing in data/ does today. */
function markRing(W, ring, cut) {
  const V = closedRing(ring);
  const E = V.length - 1;
  if (E < 1) return 0;
  if (ringArea(V) === 0) return 0;
  const runs = []; let start = -1, drawn = 0;
  for (let i = 0; i < E; i++) {
    const border = deepestInland(W, V[i], V[i + 1], cut, cut) > cut;
    if (border) { drawn++; if (start < 0) start = i; }
    else if (start >= 0) { runs.push([start, i]); start = -1; }
  }
  if (start >= 0) runs.push([start, E]);
  if (drawn === 0) return 0;
  if (drawn === E) return 1;
  return runs;
}

function water() {
  return buildWater(JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'coastline.json.gz')))));
}

/* ⚠ (#R564) THE SUBDIVISION BUNDLES ARE MARKED BY THE SAME RULE AND THE SAME CONSTANT, because the
   defect is the same defect. A province's ring is the same two kinds of edge welded into one loop:
   the boundary it shares with the next province, which only the record knows, and the polity's own
   copy of the COASTLINE, which the planet knows better and js/coast-line.js already draws. #R531
   marked only the two country bundles, so js/time-admin1.js went on stroking whole rings and every
   coastal province drew a second, wrong, shore a few kilometres out to sea.
   The cut is NOT re-chosen here. Sweeping it over the admin-1 bundle at 1900 / 1950 / 1990 (2.5 3 4
   5 6 7 8 10 14 km) moves the drawn length by 0.2% per km at every step — the curve has no elbow of
   its own, because a province's coast copy is a small share of a mostly inland outline. One rule,
   one authority, one constant. */
/* ⚠ (#R669) …AND THE BUNDLE IntMap DERIVED ITSELF. data/hist-kuni.js is the fifteen provinces of
   Japan OpenHistoricalMap holds no relation for. Leaving it out of this ledger does not make its
   line safe — it makes it an era line that strokes the record's own copy of the COASTLINE as if it
   were a boundary, which is the exact claim #R531 removed from the country line and #R564 removed
   from the provinces. Japan is almost entirely coast, so «almost entirely» is how much of that line
   would have been wrong.

   ⚠⚠⚠ (#R695) AND THAT IS WHY THE POPULATION IS NO LONGER A LIST. Every round above added its
   bundle to a hand-written array here, and the round that did not — #R679, which brought the whole
   deep past in-tree as data/hist-eras.js — left the entire band from 123,000 BC to 1688 out of it
   WITHOUT ANY GATE NOTICING, because a hand-written population cannot be short. Measured on the
   shipped file with this file's own rule (INLAND_KM 6, SAMPLE_KM 1): on the 1500 snapshot 364,993
   of 1,116,501 km of drawn line — 32.7% of the length, 60.3% of the edges — was the record's copy
   of the coastline, drawn in the same colour and width as a boundary; on 1700, 345,620 of
   1,407,871 km. That is the #R531 defect, still on the map, for most of the years IntMap reaches.
   So the bundles are DISCOVERED from data/ by what they ARE — a ring-pooled outline bundle — and a
   bundle that lands there tomorrow is marked without anyone remembering to come back here.
   (`--check` fails if the committed file's set of keys is not exactly the discovered one, so the
   discovery cannot silently narrow either.) */

/* ⚠ THE KEY IS A NAME, NOT THE POPULATION. Four keys were published before this round and two
   runtime modules ask for them by those names (js/time-borders.js `_bcMarks('cs')`/`('hb')`,
   js/time-admin1.js `cfg.set`), so the table below FREEZES those spellings — it renames, it never
   selects. A discovered bundle it does not mention is not skipped; it is published under its own
   global's name (`__HISTERAS` → `histeras`) and the reader finds it by the `global` field the
   entry carries, not by knowing the key. */
const PUBLISHED_KEY = { __CSHAPES: 'cs', __HISTB: 'hb', __HISTADM1: 'ha', __HISTADM2: 'ha2', __HISTKUNI: 'hk' };
const keyFor = (g) => PUBLISHED_KEY[g] || g.replace(/^__/, '').toLowerCase();

/* what makes a file one of these bundles, asked of the file and not of a list: it assigns ONE
   global, and that global carries `rings` — a pool of outlines, each an array of [lon,lat] pairs on
   the globe. data/ecoregions_2017.js is a FeatureCollection and has no pool; data/border-coast.js is
   this file's own output. Neither can pass, and neither has to be named here to be excluded. */
function ringPool(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.rings) || !d.rings.length) return false;
  for (const r of d.rings) {
    if (!Array.isArray(r) || r.length < 3) return false;
    const p = r[0];
    if (!Array.isArray(p) || p.length !== 2 || !isFinite(p[0]) || !isFinite(p[1])) return false;
    if (p[0] < -180.001 || p[0] > 180.001 || p[1] < -90.001 || p[1] > 90.001) return false;
  }
  return true;
}

function jsFilesUnder(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir).sort()) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...jsFilesUnder(p, base));
    else if (e.endsWith('.js')) out.push(relative(base, p).split(sep).join('/'));
  }
  return out;
}

/* every ring-pooled bundle in `dir`, in file order. Each is EVALUATED and then dropped again —
   the six bundles are 56 MB of JSON and holding them all at once is how #R604 met V8's ceiling. */
export function discoverBundles(dir = join(ROOT, 'data')) {
  const out = [];
  for (const file of jsFilesUnder(dir)) {
    const src = readFileSync(join(dir, file), 'utf8');
    const m = /^\s*window\.(__[A-Za-z0-9_$]+)\s*=/.exec(src);
    if (!m) continue;
    if (!/"rings"\s*:\s*\[/.test(src)) continue;      /* cheap: do not evaluate 9.7 MB to learn it has no pool */
    let d = null;
    try { const w = {}; new Function('window', src)(w); d = w[m[1]]; } catch (_) { continue; }
    if (!ringPool(d)) continue;
    out.push({ key: keyFor(m[1]), file, global: m[1] });
  }
  return out;
}

function markAll(W, cut, sets) {
  const out = {};
  for (const s of sets) {
    const d = loadBundle(s.file, s.global);
    out[s.key] = { file: 'data/' + s.file, global: s.global, rings: d.rings.length, draw: d.rings.map((r) => markRing(W, r, cut)) };
    const zero = d.rings.reduce((a, r) => a + (ringArea(closedRing(r)) === 0 ? 1 : 0), 0);
    console.log('  ' + s.key + ': ' + d.rings.length + ' rings, ' + zero + ' of them enclosing no area at the stored precision (not stroked)');
  }
  return out;
}

function tally(sets) {
  let rings = 0, whole = 0, none = 0, part = 0, runs = 0;
  for (const k of Object.keys(sets)) for (const v of sets[k].draw) {
    rings++;
    if (v === 1) whole++; else if (v === 0) none++; else { part++; runs += v.length; }
  }
  return { rings, whole, none, part, runs };
}

/* ── --report: the distribution INLAND_KM is read off ─────────────────────────────────────────── */
function report() {
  const W = water();
  const CAP = 20;                    /* the choice is read off the first few km; past CAP a bound is a bound */
  const BINS = [-Infinity, -10, -5, -2, -1, 0, 1, 2, 2.5, 3, 4, 5, 7.5, 10, CAP, Infinity];
  const hist = new Array(BINS.length - 1).fill(0);
  let edges = 0;
  for (const s of discoverBundles()) {
    const d = loadBundle(s.file, s.global);
    for (const r of d.rings) {
      const V = closedRing(r);
      for (let i = 0; i < V.length - 1; i++) {
        const v = deepestInland(W, V[i], V[i + 1], null, CAP);
        edges++;
        for (let b = 0; b < hist.length; b++) if (v >= BINS[b] && v < BINS[b + 1]) { hist[b]++; break; }
      }
    }
  }
  console.log('edges measured:', edges);
  console.log('deepest point of the edge, km inland (+) / at sea (−):');
  for (let b = 0; b < hist.length; b++) {
    console.log('  ' + String(BINS[b]).padStart(6) + ' … ' + String(BINS[b + 1]).padStart(6) +
      '  ' + String(hist[b]).padStart(8) + '  ' + (100 * hist[b] / edges).toFixed(2) + '%');
  }
  let cum = 0;
  console.log('cumulative share of edges DROPPED at a given INLAND_KM:');
  for (let b = 0; b < hist.length - 1; b++) {
    cum += hist[b];
    if (BINS[b + 1] >= 0 && BINS[b + 1] <= 10) console.log('  ≤ ' + String(BINS[b + 1]).padStart(4) + ' km → ' + (100 * cum / edges).toFixed(2) + '%');
  }
}

/* ── the file ─────────────────────────────────────────────────────────────────────────────────── */
function build() {
  const W = water();
  const found = discoverBundles();
  console.log('bundles discovered in data/:', found.map((s) => s.file + ' → ' + s.key).join(', '));
  const sets = markAll(W, INLAND_KM, found);
  const doc = {
    v: 1,
    src: 'derived: ' + found.map((s2) => 'data/' + s2.file).join(' + ') + ' against data/coastline.json.gz',
    authority: 'Natural Earth 1:10m physical — coastline (public domain), 2 km tolerance',
    inlandKm: INLAND_KM,
    sampleKm: SAMPLE_KM,
    means: '`draw[i]` for ring i of the named bundle: 1 = stroke every edge, 0 = stroke none, else the runs [a,b] of a CLOSED ring — the drawn line is V.slice(a, b+1). `global` names the window property the bundle assigns, so a reader holding a ring can find its mark without knowing the key.',
    sets,
  };
  writeFileSync(OUT, 'window.__IMBCOAST=' + JSON.stringify(doc) + ';\n');
  const t = tally(sets);
  console.log('wrote', OUT);
  console.log('  rings', t.rings, '| all border', t.whole, '| all coast', t.none, '| mixed', t.part, '(' + t.runs + ' runs)');
  console.log('  bytes', readFileSync(OUT).length);
}

/* ── --check: re-derive and compare, offline ──────────────────────────────────────────────────── */
/* ⚠ (#R564) `--sample N` RE-DERIVES EVERY Nth RING INSTEAD OF ALL OF THEM, and it exists because
   this round took the marked population from 4,830 rings to 25,516. The exhaustive run is what
   `npm run check:bordercoast` does in CI; the copy inside `npm test` (tests/r531-checks ①) samples,
   so the suite pays about what it paid before. Sampling changes only HOW MANY rings are re-derived
   — the shape checks below still walk every entry, and a wrong mark anywhere is still a wrong mark
   the CI gate fails on. Without the flag the check is exhaustive, so the default cannot rot. */
function check(step) {
  step = Math.max(1, parseInt(step, 10) || 1);
  const w = {}; new Function('window', readFileSync(OUT, 'utf8'))(w);
  const D = w.__IMBCOAST;
  const fail = [];
  const ok = (c, m) => { if (!c) fail.push(m); };
  ok(D && D.v === 1, 'v is 1');
  ok(D && D.inlandKm === INLAND_KM, 'inlandKm matches the script (' + (D && D.inlandKm) + ' vs ' + INLAND_KM + ')');
  ok(D && D.sampleKm === SAMPLE_KM, 'sampleKm matches the script');
  ok(D && D.authority && /Natural Earth/.test(D.authority), 'the authority is named');
  if (fail.length) { console.error(fail.map((m) => '✗ ' + m).join('\n')); process.exit(1); }

  const W = water();
  const found = discoverBundles();
  /* ⚠ (#R695) THE GATE ON THE POPULATION ITSELF. Not "the bundles I remembered are all here" but
     "the file marks exactly the bundles data/ holds" — the condition #R679's data/hist-eras.js
     failed silently for two rounds, and the one a seventh bundle cannot fail silently either. */
  ok(JSON.stringify(found.map((s) => s.key).sort()) === JSON.stringify(Object.keys(D.sets).sort()),
     'the committed file marks exactly the bundles data/ holds (found ' + found.map((s) => s.key).join(',') +
     ' — file has ' + Object.keys(D.sets).sort().join(',') + ')');
  for (const s of found) {
    const d = loadBundle(s.file, s.global);
    const got = D.sets[s.key];
    ok(got && got.rings === d.rings.length, s.key + ': ring count matches ' + s.file);
    ok(got && got.global === s.global, s.key + ': the entry names the global it marks (' + s.global + ')');
    ok(got && got.draw.length === d.rings.length, s.key + ': one entry per ring');
    if (!got || got.draw.length !== d.rings.length) continue;
    let mism = 0, badShape = 0, tried = 0;
    for (let i = 0; i < d.rings.length; i++) {
      const V = closedRing(d.rings[i]), E = V.length - 1, v = got.draw[i];
      if (v !== 0 && v !== 1) {
        if (!Array.isArray(v) || !v.length) { badShape++; continue; }
        let prev = -1;
        for (const [a, b] of v) {
          if (!(Number.isInteger(a) && Number.isInteger(b) && a > prev && a < b && b <= E)) { badShape++; break; }
          prev = b;
        }
      }
      if (i % step) continue;
      tried++;
      const re = markRing(W, d.rings[i], INLAND_KM);
      if (JSON.stringify(re) !== JSON.stringify(v)) mism++;
    }
    ok(badShape === 0, s.key + ': every entry is 0, 1 or ordered in-range runs (' + badShape + ' bad)');
    ok(mism === 0, s.key + ': the committed marks re-derive from the bundles (' + mism + ' of ' + tried + ' rings differ)');
  }
  if (fail.length) { console.error(fail.map((m) => '✗ ' + m).join('\n')); process.exit(1); }
  const t = tally(D.sets);
  console.log('✓ data/border-coast.js re-derives — rings', t.rings, '| all border', t.whole, '| all coast', t.none, '| mixed', t.part);
}

/* ⚠ (#R695) ONLY WHEN RUN AS A PROGRAM. discoverBundles() is the population every gate has to be
   able to ask for, and a test that imports it must not thereby spend ten minutes rewriting
   data/border-coast.js. */
if (process.argv[1] && join(process.argv[1]) === join(fileURLToPath(import.meta.url))) {
  const arg = process.argv[2] || '';
  const sampleAt = process.argv.indexOf('--sample');
  if (arg === '--report') report();
  else if (arg === '--check') check(sampleAt >= 0 ? process.argv[sampleAt + 1] : 1);
  else build();
}
