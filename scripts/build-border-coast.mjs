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
 *  ⚠ THE aourednik SNAPSHOTS ARE NOT COVERED, on purpose. They are fetched from GitHub at runtime
 *  and only when a bundle fails to load, so there is no build step to mark them in; js/time-borders.js
 *  draws an unmarked collection whole, exactly as it did before this round.
 *
 *      node scripts/build-border-coast.mjs --report   # print the measurement INLAND_KM is read off
 *      node scripts/build-border-coast.mjs            # write data/border-coast.js
 *      node scripts/build-border-coast.mjs --check    # re-derive and verify the COMMITTED file (offline)
 * ==========================================================================*/
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWater } from './bordercoast/water.mjs';

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
function markRing(W, ring, cut) {
  const V = closedRing(ring);
  const E = V.length - 1;
  if (E < 1) return 0;
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

const SETS = [
  { key: 'cs', file: 'cshapes.js', global: '__CSHAPES' },
  { key: 'hb', file: 'hist-borders.js', global: '__HISTB' },
];

function markAll(W, cut) {
  const out = {};
  for (const s of SETS) {
    const d = loadBundle(s.file, s.global);
    out[s.key] = { file: 'data/' + s.file, rings: d.rings.length, draw: d.rings.map((r) => markRing(W, r, cut)) };
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
  for (const s of SETS) {
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
  const sets = markAll(W, INLAND_KM);
  const doc = {
    v: 1,
    src: 'derived: data/cshapes.js + data/hist-borders.js against data/coastline.json.gz',
    authority: 'Natural Earth 1:10m physical — coastline (public domain), 2 km tolerance',
    inlandKm: INLAND_KM,
    sampleKm: SAMPLE_KM,
    means: '`draw[i]` for ring i of the named bundle: 1 = stroke every edge, 0 = stroke none, else the runs [a,b] of a CLOSED ring — the drawn line is V.slice(a, b+1).',
    sets,
  };
  writeFileSync(OUT, 'window.__IMBCOAST=' + JSON.stringify(doc) + ';\n');
  const t = tally(sets);
  console.log('wrote', OUT);
  console.log('  rings', t.rings, '| all border', t.whole, '| all coast', t.none, '| mixed', t.part, '(' + t.runs + ' runs)');
  console.log('  bytes', readFileSync(OUT).length);
}

/* ── --check: re-derive and compare, offline ──────────────────────────────────────────────────── */
function check() {
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
  for (const s of SETS) {
    const d = loadBundle(s.file, s.global);
    const got = D.sets[s.key];
    ok(got && got.rings === d.rings.length, s.key + ': ring count matches ' + s.file);
    ok(got && got.draw.length === d.rings.length, s.key + ': one entry per ring');
    if (!got || got.draw.length !== d.rings.length) continue;
    let mism = 0, badShape = 0;
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
      const re = markRing(W, d.rings[i], INLAND_KM);
      if (JSON.stringify(re) !== JSON.stringify(v)) mism++;
    }
    ok(badShape === 0, s.key + ': every entry is 0, 1 or ordered in-range runs (' + badShape + ' bad)');
    ok(mism === 0, s.key + ': the committed marks re-derive from the bundles (' + mism + ' rings differ)');
  }
  if (fail.length) { console.error(fail.map((m) => '✗ ' + m).join('\n')); process.exit(1); }
  const t = tally(D.sets);
  console.log('✓ data/border-coast.js re-derives — rings', t.rings, '| all border', t.whole, '| all coast', t.none, '| mixed', t.part);
}

const arg = process.argv[2] || '';
if (arg === '--report') report();
else if (arg === '--check') check();
else build();
