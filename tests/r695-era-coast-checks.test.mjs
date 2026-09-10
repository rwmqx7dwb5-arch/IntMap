/* ============================================================================
 *  IntMap · R695 — the era outlines' coastline, and the population that missed them
 * ----------------------------------------------------------------------------
 *  #R531 stopped the country line from drawing the record's own copy of the COASTLINE; #R564 did
 *  the same for the provinces and #R669 for the derived kuni. Each of those rounds added its
 *  bundle to a hand-written array in scripts/build-border-coast.mjs — and #R679, which brought the
 *  entire deep past in-tree as data/hist-eras.js, did not. Nothing noticed, because a hand-written
 *  population cannot be short: measured on the shipped file with that script's own rule, the 1500
 *  snapshot drew 384,167 of its 1,116,501 km of line (34.4%, 62.0% of its edges) as a boundary
 *  where the record only had a copy of the shore.
 *
 *  So these checks are not about hist-eras. They are about the two things that let it happen:
 *      ① the population of marked bundles is DISCOVERED from data/, not listed (a seventh bundle
 *         cannot be forgotten, and --check fails if the file and data/ disagree);
 *      ② a mark belongs to a RING, so the era tier — which hands over a collection and not an
 *         index — gets its marks without knowing any key.
 *  ③ is what the marks then mean, ④ is the ring that encloses no area — kept in the
 *  bundle (deleting it would take two upstream names and 1,007 unnamed polygons with it) and not
 *  stroked, because a ring with no interior bounds nothing — and ⑤ is the reader that delivers it.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { discoverBundles, closedRing } from '../scripts/build-border-coast.mjs';
import { ringArea } from '../scripts/histborders/geom.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function evalGlobal(file) {
  const w = {};
  new Function('window', readFileSync(join(ROOT, file), 'utf8'))(w);
  return w;
}
const MARKS = evalGlobal('data/border-coast.js').__IMBCOAST;
const ERAS = evalGlobal('data/hist-eras.js').__HISTERAS;

/* ── ① the population is discovered, not written down ──────────────────────────────────────────
   Measured as the thing that failed: put a bundle in a directory that no source file mentions and
   the population contains it. If discoverBundles() ever goes back to a list, this is the check that
   goes red — the fake bundle is not in any list and cannot be. */
test('① a ring-pooled bundle nobody has heard of is discovered anyway', () => {
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
test('① the keys the runtime asks for by name are still those names', () => {
  const byFile = Object.fromEntries(discoverBundles().map((s) => [s.file, s.key]));
  assert.equal(byFile['cshapes.js'], 'cs');
  assert.equal(byFile['hist-borders.js'], 'hb');
  assert.equal(byFile['hist-admin1.js'], 'ha');
  assert.equal(byFile['hist-admin2.js'], 'ha2');
  assert.equal(byFile['hist-kuni.js'], 'hk');
});

/* ── ② every bundle data/ holds is marked, hist-eras included ─────────────────────────────────── */
test('② the shipped marks cover exactly the bundles data/ holds', () => {
  const found = discoverBundles();
  assert.deepEqual(Object.keys(MARKS.sets).sort(), found.map((s) => s.key).sort());
  for (const s of found) {
    const got = MARKS.sets[s.key];
    assert.equal(got.global, s.global, s.key + ' names the global it marks');
    assert.equal(got.file, 'data/' + s.file, s.key + ' names its file');
    assert.equal(got.draw.length, got.rings, s.key + ' has one entry per ring');
  }
});

test('② every ring of data/hist-eras.js has a mark of its own', () => {
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
test('③ no era snapshot is drawn whole', () => {
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
test('④ no ring that encloses no area is stroked, in any bundle', () => {
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

test('④ …and the bundle still carries every one of them', () => {
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

test('⑤ an era collection is stroked by its marks, not whole', () => {
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

test('⑤ a record nobody has measured is still stroked whole', () => {
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

test('⑤ marks that do not fit their bundle are not applied by position', () => {
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
