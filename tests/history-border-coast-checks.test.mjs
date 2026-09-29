/* ============================================================================
 *  IntMap · the historical outline is border, not coastline — the marks that say which edges are
 *  which, and the reader that strokes by them  (scripts/build-border-coast.mjs · data/border-coast.js ·
 *  js/border-coast.js)
 *  (consolidated from tests/r531-checks (①–④ and the laziness half of ⑤) and r695-era-coast; each
 *   test keeps its round tag. r531's two layer-wiring checks moved to tests/history-era-display-checks,
 *   where the border layer is evaluated.)
 * ----------------------------------------------------------------------------
 *  #R531 「昔の国境は海岸より先まであるのが気持ち悪い。1900年以前など。」 A political record's ring is
 *  boundaries welded to the polity's own copy of the coastline, and only the first half is something the
 *  record knows better than the planet does. ⚠ WHAT WAS NOT MEASURED ANYWHERE BEFORE: whether the drawn
 *  line is in the sea — the gates ask whether a record is consistent WITH ITSELF, and a 40 km chord
 *  across the Gulf of Lion satisfies every one of them.
 *  #R695 — #R564 and #R669 each added their bundle to a hand-written array in the build, and #R679,
 *  which brought the whole deep past in as data/hist-eras.js, did not: the 1500 snapshot drew 34.4% of
 *  its line (62.0% of its edges) where the record only had a copy of the shore. So the population of
 *  marked bundles is DISCOVERED from data/, and a mark belongs to a RING.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { buildWater } from '../scripts/bordercoast/water.mjs';
import { discoverBundles, closedRing } from '../scripts/build-border-coast.mjs';
import { ringArea } from '../scripts/histborders/geom.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const bundle = (file, global) => { const w = {}; new Function('window', rd('data/' + file))(w); return w[global]; };

const CS = bundle('cshapes.js', '__CSHAPES');
const HB = bundle('hist-borders.js', '__HISTB');
const BC = bundle('border-coast.js', '__IMBCOAST');
const HA = bundle('hist-admin1.js', '__HISTADM1');
const HA2 = bundle('hist-admin2.js', '__HISTADM2');
/* (#R564) the READING of the marks moved out of js/time-borders.js so that js/time-admin1.js could
   call it instead of copying it — one fact, one owner. These checks follow the 正本. */
const BCJ = codeOnly(rd('js/border-coast.js'));

const closed = (r) => { const n = r.length; return (n > 1 && r[0][0] === r[n - 1][0] && r[0][1] === r[n - 1][1]) ? r : r.concat([r[0]]); };
const drawn = (mark, i) => mark === 1 || (Array.isArray(mark) && mark.some(([a, b]) => i >= a && i < b));
const KM_PER_DEG = 110.574;
const edgeKm = (a, b) => { const kx = KM_PER_DEG * Math.cos((a[1] + b[1]) * 0.5 * Math.PI / 360);
  return Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * KM_PER_DEG); };

function evalGlobal(file) {
  const w = {};
  new Function('window', readFileSync(join(ROOT, file), 'utf8'))(w);
  return w;
}
const MARKS = evalGlobal('data/border-coast.js').__IMBCOAST;
const ERAS = evalGlobal('data/hist-eras.js').__HISTERAS;

/* ══ #R531 ══════════════════════════════════════════════════════════════════════════════════ */
/* ── ① the marks are a fact about the bundles, not a file somebody once wrote ──────────────────── */
test('#R531 ① scripts/build-border-coast.mjs --check re-derives the committed marks', () => {
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts', 'build-border-coast.mjs'), '--check', '--sample', '8'],
    { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /re-derives/, out);
});

test('#R531 ① every ring of both bundles has an entry, and every run is ordered and in range', () => {
  /* (#R564) …and the two SUBDIVISION bundles, which this round put under the same rule. The list is
     the bundles themselves, so a fifth one added to scripts/build-border-coast.mjs without marks fails
     here rather than shipping a coastline copy nobody measured. */
  for (const [key, d] of [['cs', CS], ['hb', HB], ['ha', HA], ['ha2', HA2]]) {
    const set = BC.sets[key];
    assert.ok(set, 'data/border-coast.js has no marks for ' + key);
    assert.equal(set.rings, d.rings.length, key + ': the mark count and the bundle disagree');
    assert.equal(set.draw.length, d.rings.length, key + ': one entry per ring');
    let bad = 0;
    for (let i = 0; i < d.rings.length; i++) {
      const v = set.draw[i], E = closed(d.rings[i]).length - 1;
      if (v === 0 || v === 1) continue;
      if (!Array.isArray(v) || !v.length) { bad++; continue; }
      let prev = -1;
      for (const run of v) {
        if (!Array.isArray(run) || run.length !== 2) { bad++; break; }
        const [a, b] = run;
        if (!(Number.isInteger(a) && Number.isInteger(b) && a > prev && a < b && b <= E)) { bad++; break; }
        prev = b;
      }
    }
    assert.equal(bad, 0, key + ': ' + bad + ' entries are neither 0, 1, nor ordered in-range runs');
  }
});

/* ── ② the reported edge ───────────────────────────────────────────────────────────────────────── */
test('#R531 ② the Sète–Le Grau-du-Roi coastline copy is NOT drawn as a country border', () => {
  const f = CS.feats.find((x) => x[0] === 'France' && x[2] <= 1900 && x[5] >= 1900);
  assert.ok(f, 'CShapes no longer carries a France record covering 1900');
  /* R710 remeasurement: the former single 40 km chord is now three edges,
     from [3.5467,43.3197] through [3.8436,43.4756], [3.9132,43.5212] to
     [3.9647,43.5408]. Select the reported geographic stretch, not the old
     simplifier's exact endpoint digits or its number of vertices. */
  const inStretch = p => p[0] >= 3.5 && p[0] <= 4 && p[1] >= 43.25 && p[1] <= 43.6;
  let measuredKm = 0, drawnKm = 0;
  for (const poly of f[8]) for (const ri of poly) {
    const V = closed(CS.rings[ri]), mark = BC.sets.cs.draw[ri];
    for (let i = 0; i < V.length - 1; i++) {
      if (inStretch(V[i]) && inStretch(V[i + 1])) {
        const km = edgeKm(V[i], V[i + 1]);
        measuredKm += km;
        if (drawn(mark, i)) drawnKm += km;
      }
    }
  }
  assert.ok(measuredKm > 30, 'the reported coastal stretch is missing or truncated — re-measure this fixture');
  assert.equal(drawnKm, 0, 'the coastline copy from Sète to Le Grau-du-Roi is being stroked again');
});

/* ── ③ what is drawn is not in the sea ─────────────────────────────────────────────────────────── */
test('#R531 ③ almost none of the drawn length lies over water', () => {
  /* ⚠ NOT ZERO, AND THE REASON IS IN THE DATA. Some boundaries really do cross water — the 49th
     parallel through the Strait of Georgia, the Alaska convention line up the antimeridian — and
     the record draws them because they are borders. What must not survive is a coastline copy
     wandering offshore. Measured at the round: 0.25% of the drawn length. */
  const W = buildWater(JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'coastline.json.gz')))));
  let total = 0, sea = 0;
  for (const [key, d] of [['cs', CS], ['hb', HB]]) {
    const marks = BC.sets[key].draw;
    for (let ri = 0; ri < d.rings.length; ri++) {
      const mark = marks[ri]; if (mark === 0) continue;
      const V = closed(d.rings[ri]);
      for (let i = 0; i < V.length - 1; i++) {
        if (!drawn(mark, i)) continue;
        const L = edgeKm(V[i], V[i + 1]); total += L;
        /* the SIGN is the whole question here, and `onLand` is a parity count — asking `inlandKm`
           would also walk the distance index out of the middle of a continent for every sample. */
        const steps = Math.max(2, Math.min(64, Math.ceil(L / 2)));
        for (let k = 0; k < steps; k++) {
          const t = (k + 0.5) / steps;
          if (!W.onLand(V[i][0] + (V[i + 1][0] - V[i][0]) * t, V[i][1] + (V[i + 1][1] - V[i][1]) * t)) sea += L / steps;
        }
      }
    }
  }
  assert.ok(total > 1e6, 'only ' + Math.round(total) + ' km is drawn at all — the marks have eaten the borders');
  const pct = 100 * sea / total;
  assert.ok(pct < 1, pct.toFixed(2) + '% of the drawn length is over water (' + Math.round(sea) + ' of ' + Math.round(total) + ' km) — a coastline copy is being stroked again');
});

/* ── ④ the runtime reads the marks the way the build wrote them ────────────────────────────────── */
test('#R531 ④ _ringLines slices the CLOSED ring, for both spellings of a ring', () => {
  /* ⚠ EVALUATED, NOT READ (#R505). The trap this guards is an off-by-one that only shows on ONE of
     the two records: data/cshapes.js repeats a ring's first point and data/hist-borders.js does not,
     so a run [a,b] read off the raw array would slide by one on the OHM bundle alone — half the map,
     one era, silently wrong. */
  const sandbox = { Array }; vm.createContext(sandbox);
  vm.runInContext(liftFunction(BCJ, 'ringLines').replace(/^function/, 'var closedRing=(r)=>{const n=r.length;return (n>1&&r[0][0]===r[n-1][0]&&r[0][1]===r[n-1][1])?r:r.concat([r[0]]);};\nfunction') + '\nvar RL=ringLines;', sandbox);
  /* ⚠ the vm builds its arrays in another realm, so deepEqual fails on identical content — compare
     the values, not the objects. */
  const RL = (ring, mark) => JSON.parse(JSON.stringify(sandbox.RL(ring, mark)));
  const open = [[0, 0], [1, 0], [1, 1], [0, 1]];                 /* the OHM spelling */
  const shut = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];          /* the CShapes spelling */
  for (const ring of [open, shut]) {
    assert.equal(RL(ring, 0).length, 0, 'mark 0 must stroke nothing');
    assert.equal(RL(ring, 1).length, 1, 'mark 1 must stroke one line');
    assert.equal(RL(ring, 1)[0].length, 5, 'mark 1 must stroke the ring CLOSED — 5 points for a square');
    const one = RL(ring, [[1, 3]]);
    assert.equal(one.length, 1, 'one run, one line');
    assert.deepEqual(one[0], [[1, 0], [1, 1], [0, 1]], 'a run [a,b] is V.slice(a, b+1) of the closed ring');
    const two = RL(ring, [[0, 1], [2, 4]]);
    assert.deepEqual(two.map((l) => l.length), [2, 3], 'two runs, two lines');
  }
});

/* ── (#R531 ⑤) the marks are lazy, like the bundles they mark ─────────────────────────────────── */
test('#R531 ⑤ the marks are lazy, like the bundles they mark', async () => {
  /* ⚠ SPELLING, ON PURPOSE: «not on the boot path» is a fact about index.html's script list */
  assert.ok(!/border-coast.js/.test(rd('index.html')), 'data/border-coast.js is on the boot path — it belongs with the bundles it marks');
  /* EVALUATED (was: regexes for the script src and for `onerror = () => { _P = null`). The reader is run
     with a document that records the script tags it is asked to append; a lost request must not be
     latched, because the line geometry is memoised BY BOTH CALLERS — one failure would pin the session to
     the whole-ring drawing #R531 removed. */
  const appended = [];
  const doc = { createElement: () => ({}), head: { appendChild: (s) => appended.push(s) } };
  const win = {};
  new Function('window', 'document', readFileSync(join(ROOT, 'js', 'border-coast.js'), 'utf8'))(win, doc);
  const BC = win.IntMapBorderCoast;
  const first = BC.load();
  assert.equal(appended.length, 1, 'js/border-coast.js no longer loads the marks');
  assert.equal(appended[0].src, 'data/border-coast.js', 'js/border-coast.js no longer loads the marks');
  appended[0].onerror();
  assert.equal(await first, null);
  const second = BC.load();
  assert.equal(appended.length, 2, 'load latches a failed load — one lost request would last the session');
  win.__IMBCOAST = { v: 1, sets: {} };
  appended[1].onload();
  assert.equal(await second, win.__IMBCOAST, 'the retried load does not deliver the marks');
  /* (#R564) …and there is exactly ONE reader of the marks. A second copy is how one fact starts having
     two owners. ⚠ SPELLING, ON PURPOSE: «nobody else reads window.__IMBCOAST» is a claim over files. */
  const owners = ['js/border-coast.js', 'js/time-borders.js', 'js/time-admin1.js', 'js/map-ui.js',
                  'js/app-body.js', 'js/place-labels.js', 'js/data-layers.js']
    .filter((p) => codeOnly(rd(p)).includes('__IMBCOAST'));
  assert.deepEqual(owners, ['js/border-coast.js'], 'more than one file reads window.__IMBCOAST');
});

/* ══ #R695 — the era outlines' coastline, and the population that missed them ═════════════ */
/* ── ① the population is discovered, not written down ──────────────────────────────────────────
   Measured as the thing that failed: put a bundle in a directory that no source file mentions and
   the population contains it. If discoverBundles() ever goes back to a list, this is the check that
   goes red — the fake bundle is not in any list and cannot be. */
test('#R695 ① a ring-pooled bundle nobody has heard of is discovered anyway', () => {
  const dir = mkdtempSync(join(tmpdir(), 'r695-bundles-'));
  mkdirSync(join(dir, 'nested'), { recursive: true });
  writeFileSync(join(dir, 'nested', 'made-up-record.js'),
    'window.__R695FAKE={"v":1,"rings":[[[10,10],[10,11],[11,11],[11,10]]],"feats":[]};\n');
  /* three things that are NOT ring pools, so the discovery is answering about shape and not about
     the file extension: a collection, a bundle whose rings are not rings, and plain script */
  writeFileSync(join(dir, 'a-collection.js'), 'window.__R695FC={"type":"FeatureCollection","features":[]};\n');
  writeFileSync(join(dir, 'not-rings.js'), 'window.__R695BAD={"rings":[["a","b","c"]]};\n');
  writeFileSync(join(dir, 'ordinary.js'), 'function hello(){ return 1; }\n');

  const found = discoverBundles(dir);
  assert.deepEqual(found.map((s) => s.global), ['__R695FAKE'], 'exactly the ring pool is found');
  assert.equal(found[0].file, 'nested/made-up-record.js', 'the file is reported relative to data/');
  assert.equal(found[0].key, 'r695fake', 'a bundle with no published key is published under its own global');
});

/* the five keys two runtime modules ask for by name (js/time-borders.js `_bcMarks('cs')`/`('hb')`,
   js/time-admin1.js `cfg.set`) must not be renamed by the derivation */
test('#R695 ① the keys the runtime asks for by name are still those names', () => {
  const byFile = Object.fromEntries(discoverBundles().map((s) => [s.file, s.key]));
  assert.equal(byFile['cshapes.js'], 'cs');
  assert.equal(byFile['hist-borders.js'], 'hb');
  assert.equal(byFile['hist-admin1.js'], 'ha');
  assert.equal(byFile['hist-admin2.js'], 'ha2');
  assert.equal(byFile['hist-kuni.js'], 'hk');
});

/* ── ② every bundle data/ holds is marked, hist-eras included ─────────────────────────────────── */
test('#R695 ② the shipped marks cover exactly the bundles data/ holds', () => {
  const found = discoverBundles();
  assert.deepEqual(Object.keys(MARKS.sets).sort(), found.map((s) => s.key).sort());
  for (const s of found) {
    const got = MARKS.sets[s.key];
    assert.equal(got.global, s.global, s.key + ' names the global it marks');
    assert.equal(got.file, 'data/' + s.file, s.key + ' names its file');
    assert.equal(got.draw.length, got.rings, s.key + ' has one entry per ring');
  }
});

test('#R695 ② every ring of data/hist-eras.js has a mark of its own', () => {
  const set = Object.values(MARKS.sets).find((s) => s.global === '__HISTERAS');
  assert.ok(set, 'the deep-past bundle is marked at all');
  assert.equal(set.rings, ERAS.rings.length);
  assert.equal(set.draw.length, ERAS.rings.length);
  for (let i = 0; i < ERAS.rings.length; i++) {
    const v = set.draw[i], E = closedRing(ERAS.rings[i]).length - 1;
    if (v === 0 || v === 1) continue;
    assert.ok(Array.isArray(v) && v.length, 'ring ' + i + ' is 0, 1 or runs');
    let prev = -1;
    for (const [a, b] of v) {
      assert.ok(Number.isInteger(a) && Number.isInteger(b) && a > prev && a < b && b <= E,
        'ring ' + i + ' run [' + a + ',' + b + '] is ordered and inside the ring (' + E + ' edges)');
      prev = b;
    }
  }
});

/* ── ③ the marks mean something on every snapshot ──────────────────────────────────────────────
   Not «some ring somewhere is partial» — that one true ring in 53 snapshots would satisfy. Every
   snapshot the era tier can show must have both a silenced ring and a partly-drawn one, because
   every one of them is a world map and every world map in this corpus has a coast. */
test('#R695 ③ no era snapshot is drawn whole', () => {
  for (const s of ERAS.snaps) {
    const used = new Set();
    for (const f of s.feats) for (const poly of f[2]) for (const ri of poly) used.add(ri);
    for (const b of s.blank || []) for (const poly of b) for (const ri of poly) used.add(ri);
    assert.ok(used.size, 'snapshot ' + s.y + ' draws something');
    const marks = [...used].map((ri) => MARKS.sets.histeras.draw[ri]);
    assert.ok(marks.some((m) => m !== 1), 'snapshot ' + s.y + ' has a ring with edges the record only copied from the coast');
    assert.ok(marks.some((m) => Array.isArray(m)), 'snapshot ' + s.y + ' has a ring that is part boundary and part coast');
  }
});

/* ── ④ a ring that encloses no area is not stroked ─────────────────────────────────────────────
   ⚠ AND IT IS STILL IN THE BUNDLE. The alternative — dropping them in scripts/build-hist-eras.mjs —
   was measured and refused: it removes 2,734 polygon entries, 1,007 of the unnamed `blank` polygons
   #R679 created that lane for, and 12 named features, two of which («Andean hunter-gatherers»,
   «Savanna hunter-gatherers», 1783) have no other polygon and would leave the record entirely.
   So the geometry stays and the LINE goes, which is the marks' job. */
test('#R695 ④ no ring that encloses no area is stroked, in any bundle', () => {
  let zero = 0;
  for (const key of Object.keys(MARKS.sets)) {
    const set = MARKS.sets[key];
    const d = evalGlobal(set.file)[set.global];
    for (let i = 0; i < d.rings.length; i++) {
      if (ringArea(closedRing(d.rings[i])) !== 0) continue;
      zero++;
      assert.equal(set.draw[i], 0, key + ' ring ' + i + ' encloses no area, so none of its edges bounds anything');
    }
  }
  assert.ok(zero > 0, 'the rule is not vacuous — ' + zero + ' such rings are shipped');
});

test('#R695 ④ …and the bundle still carries every one of them', () => {
  const zero = ERAS.rings.filter((r) => ringArea(closedRing(r)) === 0).length;
  assert.ok(zero > 0, 'the zero-area rings were not deleted from data/hist-eras.js');
  /* every named feature still has all of its polygons, including the ones with no interior */
  const named = ERAS.snaps.reduce((a, s) => a + s.feats.length, 0);
  const blank = ERAS.snaps.reduce((a, s) => a + (s.blank || []).length, 0);
  assert.ok(named > 10000 && blank > 6000, 'the named and blank lanes are intact (' + named + ' / ' + blank + ')');
  for (const nm of ['Andean hunter-gatherers', 'Savanna hunter-gatherers']) {
    const s = ERAS.snaps.find((x) => x.y === 1783);
    assert.ok(s.feats.some((f) => f[0].en === nm), nm + ' is still in the 1783 record');
  }
});

/* ── ⑤ the reader delivers the marks to the era tier ───────────────────────────────────────────
   js/time-borders.js hands the era collection to js/border-coast.js `wholeLines()` — it has no set
   key to pass. This is the check that the marks actually reach the map instead of merely existing
   in data/border-coast.js: the same rings, handed over as a collection, come back as the marked
   runs and not as whole rings. */
function reader(win) {
  const w = win || {};
  new Function('window', readFileSync(join(ROOT, 'js', 'border-coast.js'), 'utf8'))(w);
  return w.IntMapBorderCoast;
}

test('#R695 ⑤ an era collection is stroked by its marks, not whole', () => {
  const win = { __HISTERAS: ERAS, __IMBCOAST: MARKS };
  const BC = reader(win);
  BC.load();
  const snap = ERAS.snaps.find((s) => s.y === 1500);
  const poly = (ids) => ids.map((p) => p.map((ri) => ERAS.rings[ri]));
  const fc = { type: 'FeatureCollection', features: snap.feats.map((f) => {
    const ps = poly(f[2]);
    return { type: 'Feature', properties: { NAME: f[0].en },
      geometry: ps.length === 1 ? { type: 'Polygon', coordinates: ps[0] } : { type: 'MultiPolygon', coordinates: ps } };
  }) };
  const out = BC.wholeLines(fc);

  const drawn = out.features.reduce((a, f) => a + f.geometry.coordinates.reduce((b, l) => b + l.length - 1, 0), 0);
  const whole = [...new Set(snap.feats.flatMap((f) => f[2].flat()))].reduce((a, ri) => a + closedRing(ERAS.rings[ri]).length - 1, 0);
  assert.ok(drawn < whole, 'the marks removed edges (' + drawn + ' of ' + whole + ')');

  /* and it is the marks that removed them, edge for edge */
  let expected = 0;
  for (const f of snap.feats) for (const p of f[2]) for (const ri of p) {
    const m = MARKS.sets.histeras.draw[ri];
    if (m === 1) expected += closedRing(ERAS.rings[ri]).length - 1;
    else if (Array.isArray(m)) for (const [a, b] of m) expected += b - a;
  }
  assert.equal(drawn, expected, 'exactly the marked runs are stroked');
});

test('#R695 ⑤ a record nobody has measured is still stroked whole', () => {
  const win = { __HISTERAS: ERAS, __IMBCOAST: MARKS };
  const BC = reader(win);
  BC.load();
  /* the aourednik runtime fallback: same shapes, but freshly parsed — no ring of it is one of the
     bundle's own arrays, so nothing knows anything about it and nothing may be removed */
  const snap = ERAS.snaps.find((s) => s.y === 1500);
  const clone = (ri) => ERAS.rings[ri].map((p) => [p[0], p[1]]);
  const fc = { type: 'FeatureCollection', features: snap.feats.slice(0, 40).map((f) => ({
    type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: f[2].map((p) => p.map(clone)) } })) };
  const out = BC.wholeLines(fc);
  const drawn = out.features.reduce((a, f) => a + f.geometry.coordinates.reduce((b, l) => b + l.length - 1, 0), 0);
  const whole = snap.feats.slice(0, 40).reduce((a, f) => a + f[2].flat().reduce((b, ri) => b + closedRing(ERAS.rings[ri]).length - 1, 0), 0);
  assert.equal(drawn, whole, 'an unmarked collection loses nothing');
});

test('#R695 ⑤ marks that do not fit their bundle are not applied by position', () => {
  /* a stale marks file beside a rebuilt bundle: the entry claims a different number of rings, so the
     index must refuse it rather than mark ring 5 with ring 5-of-something-else's answer */
  const stale = JSON.parse(JSON.stringify({ v: 1, sets: { x: { file: 'data/x.js', global: '__R695X', rings: 2, draw: [0, 0] } } }));
  const bundle = { rings: [[[0, 0], [0, 1], [1, 1]], [[5, 5], [5, 6], [6, 6]], [[8, 8], [8, 9], [9, 9]]] };
  const win = { __R695X: bundle, __IMBCOAST: stale };
  const BC = reader(win);
  BC.load();
  const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [bundle.rings[0]] } }] };
  const out = BC.wholeLines(fc);
  assert.equal(out.features.length, 1, 'the ring is still drawn');
  assert.equal(out.features[0].geometry.coordinates[0].length, 4, 'stroked whole (closed), not silenced by a mark that is not its own');
});
