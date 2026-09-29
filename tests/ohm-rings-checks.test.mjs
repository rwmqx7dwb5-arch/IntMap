/* ============================================================================
 *  IntMap · OpenHistoricalMap relations → rings, and the click that asks for one
 *  (js/ohm-rings.js, the hist-admin bundles it builds, the sharp outline on click)
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r669-checks and tests/r712-historical-ring-topology-checks.
 *
 *  #R669 「歴史的地方区分の境界線のcoverageがくそ。全時代、全地域で完璧に網羅しろ。
 *    日本は北半分の令制国が全滅。クリックしたときのハイライト線が線に比べて
 *    解像度が低い。」
 *
 *  What that round measured, and therefore what these checks hold:
 *    · The highlight came from the SHIPPED BUNDLE (simplified at ~2.2 km) while the
 *      line under it came from OpenHistoricalMap's own tiles. 伊豆国: 29 vertices
 *      against upstream's 2,800.
 *    · Thirteen records were dropped for carrying no dates, on a stated assumption
 *      («a present-day unit ref-admin1 already draws») that is false of every one of
 *      them — 安房国 and 壱岐国 among them.
 *  #R712 then made the assembler keep topology without trusting roles it was not given:
 *  an island inside the mainland's bounding box is land, a hole's island is land, an
 *  explicit `outer` is never demoted to a hole, and containment is decided on EDGES.
 *
 *  ⚠ These are EVALUATED, not read, wherever evaluating is possible (#R505): a check
 *  that greps for a spelling cannot see what a function returns.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* the shipped module, run in its own realm. `extra` lets a test replace what the module can reach. */
function ohmRings(extra = {}) {
  const sandbox = Object.assign({ window: {}, console, Number, Array, Math, JSON }, extra);
  sandbox.window.window = sandbox.window;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(read('js/ohm-rings.js'), ctx, { filename: 'ohm-rings.js' });
  return sandbox.window.IntMapOhmRings;
}
const way = (...pts) => ({ type: 'way', geometry: pts.map(([lon, lat]) => ({ lon, lat })) });
/* #R712's form: a role, then the points as one array */
const wayR = (points, role = '') => ({ type: 'way', role, geometry: points.map(([lon, lat]) => ({ lon, lat })) });
const square = (x, y, side) => [[x, y], [x + side, y], [x + side, y + side], [x, y + side], [x, y]];
const concave = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4], [0, 0]];

/* ── ① the assembler ─────────────────────────────────────────────────────── */

test('#R669 ① unordered, reversed member ways still close into one ring', () => {
  const R = ohmRings();
  /* the same square, given as three ways in the wrong order and two of them backwards */
  const el = { members: [way([1, 1], [1, 0]), way([1, 1], [0, 1], [0, 0]), way([0, 0], [1, 0])] };
  const g = R.geometryOf(el);
  assert.equal(g.type, 'Polygon');
  assert.equal(g.coordinates.length, 1);
  const ring = g.coordinates[0];
  assert.deepEqual(ring[0], ring[ring.length - 1], 'the ring must close on itself');
  assert.equal(R.ringArea(ring).toFixed(6), (1).toFixed(6));
});

test('#R669 ② a ring wholly inside another becomes its hole, not a second polygon', () => {
  const R = ohmRings();
  const el = { members: [
    way([0, 0], [10, 0], [10, 10], [0, 10], [0, 0]),
    way([4, 4], [6, 4], [6, 6], [4, 6], [4, 4])
  ] };
  const g = R.geometryOf(el);
  assert.equal(g.type, 'Polygon');
  assert.equal(g.coordinates.length, 2, 'outer + hole');
  assert.ok(R.ringArea(g.coordinates[0]) > R.ringArea(g.coordinates[1]));
});

test('#R669 ③ members that are not part of the area are not part of the area', () => {
  const R = ohmRings();
  const el = { members: [
    { type: 'node', role: 'admin_centre', lat: 5, lon: 5 },
    Object.assign(way([0, 0], [1, 0], [1, 1], [0, 1], [0, 0]), { role: 'outer' }),
    Object.assign(way([20, 20], [21, 20], [21, 21], [20, 20]), { role: 'label' })
  ] };
  const g = R.geometryOf(el);
  assert.equal(g.type, 'Polygon', 'the label way must not become a second polygon');
  assert.equal(g.coordinates.length, 1);
});

test('#R669 ④ the area floor belongs to the BUILD, not to the shape — a click keeps the sliver', () => {
  const R = ohmRings();
  /* a unit 0.001 degrees square: 1e-6 deg squared, under the build MIN_AREA of 1e-5 */
  const rings = R.ringsOf({ members: [way([0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0])] });
  assert.equal(R.polysOf(rings).length, 1, 'no floor given → the sliver survives (this is the click)');
  assert.equal(R.polysOf(rings, 1e-5).length, 0, 'the build passes a floor and drops it');
});

test('#R669 ⑤ the click path does not simplify — every upstream vertex survives assembly', () => {
  const R = ohmRings();
  const pts = [];
  for (let i = 0; i < 2000; i++) { const a = (i / 2000) * Math.PI * 2; pts.push([Math.cos(a), Math.sin(a)]); }
  pts.push([pts[0][0], pts[0][1]]);
  const g = R.geometryOf({ members: [way(...pts)] });
  assert.equal(R.vertexCount(g), 2001,
    'the whole point of fetching one record is that nothing thins it on the way in');
});

test('#R669 ⑥ js/ohm-rings.js is pure — no DOM, no network, no clock', () => {
  /* EVALUATED: the module is loaded and exercised in a realm where every one of those five
     reaches THROWS. Reading the source for the spelling could not see a reach made through an
     alias; running it can. The build (scripts/build-hist-admin1.mjs) and the click both call it,
     so a clock or a fetch in here would make one of the two answer differently. */
  const touched = [];
  const trap = (name) => new Proxy(function () {}, {
    get(_t, k) { touched.push(name + '.' + String(k)); throw new Error(name + ' reached'); },
    apply() { touched.push(name + '()'); throw new Error(name + ' called'); },
  });
  const FrozenDate = function () { touched.push('new Date'); throw new Error('Date reached'); };
  FrozenDate.now = () => { touched.push('Date.now'); throw new Error('Date.now reached'); };
  const R = ohmRings({ document: trap('document'), fetch: trap('fetch'), localStorage: trap('localStorage'),
    setTimeout: trap('setTimeout'), Date: FrozenDate });
  const g = R.geometryOf({ members: [wayR(square(0, 0, 10), 'outer'), wayR(square(2, 2, 6), 'inner'),
    way([20, 20], [21, 20], [21, 21], [20, 20])] });
  R.polysOf(R.ringsOf({ members: [way(...square(0, 0, 1))] }), 1e-5);
  R.vertexCount(g); R.ringArea(square(0, 0, 1));
  assert.deepEqual(touched, [], 'js/ohm-rings.js reached for ' + touched.join(', '));
});

/* ── ② one owner, not two ────────────────────────────────────────────────── */

test('#R669 ⑦ the build evaluates js/ohm-rings.js instead of carrying its own assembler', () => {
  /* ⚠ READ, NOT RUN: the build is a network sweep of OpenHistoricalMap; the claim is about which
     file holds the assembler, which only the build script's own text can answer. */
  const s = read('scripts/build-hist-admin1.mjs');
  assert.ok(s.includes('ohm-rings.js'), 'scripts/build-hist-admin1.mjs must read js/ohm-rings.js');
  assert.ok(!/function\s+ringsOf\s*\(/.test(s), 'a second ring assembler is a second answer');
  assert.ok(!/function\s+polysOf\s*\(/.test(s), 'a second polygon assembler is a second answer');
});

/* ── ③ the resumable cache is addressed by the record, not by this run's list ── */

test('#R669 ⑧ the geometry cache is keyed by relation id, not by batch position', () => {
  /* ⚠ READ, NOT RUN: `relFile` lives inside the build's fetch loop, which cannot run offline. */
  const s = read('scripts/build-hist-admin1.mjs');
  assert.ok(!/'g'\s*\+\s*chunk\[0\]/.test(s),
    'keying the cache by where a relation fell in one run list throws the cache away whenever the list changes');
  assert.ok(/relFile\s*=\s*id\s*=>/.test(s), 'the cache file is named after the relation');
});

/* ── ④ what the bundles actually hold ────────────────────────────────────── */

function bundle(file) {
  const s = read(file);
  return JSON.parse(s.slice(s.indexOf('=') + 1, s.lastIndexOf(';')));
}
const B1 = () => bundle('data/hist-admin1.js');
const B2 = () => bundle('data/hist-admin2.js');

test('#R669 ⑨ every feature row carries its OpenHistoricalMap relation id', () => {
  for (const [name, d] of [['hist-admin1', B1()], ['hist-admin2', B2()]]) {
    assert.ok(d.feats.length > 0, name + ' is empty');
    const bad = d.feats.filter((f) => !Number.isFinite(f[10]));
    assert.equal(bad.length, 0,
      name + ': ' + bad.length + ' rows have no relation id — the click would have to ask upstream by NAME (#R515)');
  }
});

test('#R669 ⑩ a record with no dates is still a record — 安房国 and 壱岐国 are in the bundle', () => {
  const d = B1();
  const names = new Set(d.feats.map((f) => f[0]));
  for (const n of ['安房国', '壱岐国']) {
    assert.ok(names.has(n),
      n + ' carries no start_date and no end_date upstream, which is not the same thing as being a present-day unit');
  }
  /* ══ ⚠⚠⚠ (#R730) THIS ASSERTION WAS THE DEFECT, WRITTEN DOWN AS A REQUIREMENT ═══════════════
     #R669 was right that an undated relation is not a present-day unit, and right to stop dropping
     these two rows — both halves above still hold. What it then required is that the row stay OPEN
     AT BOTH ENDS, and «open» has to be drawn from SOME instant: the builder used the previous
     build's published bound, which was the clock floor of the day, -199. So 安房国 and 壱岐国 were
     drawn from 200 BC and were still on the map in 1900 and in the present, seventy years after
     廃藩置県 (1871-08-29) abolished the system they belong to.
     The span now comes from that system — scripts/histadmin/class-dates.mjs reads the class the
     unit's own Wikidata item is in and the end date its siblings agree on — so the requirement is
     turned around: the row is dated, and it is dated from something upstream SAID.
     [[intmap-restate-the-defect-not-the-fix]] */
  for (const n of ['安房国', '壱岐国']) {
    const row = d.feats.find((f) => f[0] === n);
    assert.ok(row[2] >= 1, n + ' is still drawn from the clock floor, which nobody stated');
    assert.ok(row[5] < 9999, n + ' is still drawn in the present day; the system ended in 1871');
    const dates = d.dates[row[10]];
    assert.equal(dates.start.raw, null, 'upstream still states no start for ' + n);
    assert.ok(dates.start.derived, n + ' has a bound with no account of where it came from');
  }
});

/* ── ⑤ the click, wired end to end ───────────────────────────────────────── */

test('#R669 ⑪ the click asks upstream for an ID, never for a name', async () => {
  /* EVALUATED: `idAt` and `geomFullAt` are lifted out of js/time-admin1.js (comment-stripped, so
     the prose that spells the forbidden query cannot answer) and run against a stub bundle and a
     stub Overpass client that records the body it is handed. */
  const src = codeOnly(read('js/time-admin1.js'));
  const asked = [];
  const row = ['伊豆国']; row[10] = 2894071;
  const T1 = { data: () => ({ feats: [row] }) }, T2 = { data: () => ({ feats: [] }) };
  const win = {
    IntMapOverpass: async (q) => { asked.push(q); return { elements: [{ type: 'relation', members: [way(...square(0, 0, 1))] }] }; },
    IntMapOhmRings: ohmRings(),
  };
  const geomFullAt = new Function('window', 'T1', 'T2', '_fullGeom',
    liftFunction(src, 'idAt') + '\n' + liftFunction(src, 'geomFullAt') + '\nreturn geomFullAt;')(win, T1, T2, new Map());
  const g = await geomFullAt({ _ix: 0, name: '伊豆国' });
  assert.ok(g && g.type === 'Polygon', 'js/time-admin1.js must expose the sharp answer');
  assert.equal(asked.length, 1);
  assert.ok(asked[0].includes('relation(id:2894071);out geom;'),
    'the Overpass body must be built from the relation id: ' + asked[0]);
  assert.ok(!/relation\[["']?name/.test(asked[0]) && !asked[0].includes('伊豆国'),
    'asking upstream «the thing called X» is what #R515 forbids');
  /* …and a row with no id asks nothing at all — there is no name fallback to take */
  assert.equal(await geomFullAt({ _ix: 5, name: '伊豆国' }), null);
  assert.equal(asked.length, 1, 'a unit with no relation id must not reach upstream by any other key');
});

test('#R669 ⑫ the outline is handed the coarse shape now and the sharp one when it lands', () => {
  /* ⚠ READ, NOT RUN: the hand-off runs through the map popup and IntMapOutline.show, both of which
     need a live renderer and DOM; what is checked is that each hop passes `refine` on. */
  const ui = read('js/map-ui.js'), tools = read('js/map-tools.js');
  assert.ok(/return\s*\{\s*geo,\s*refine:/.test(ui), 'js/map-ui.js must hand over both');
  assert.ok(ui.includes('refine:eg.refine'), 'and pass refine through the popup');
  assert.ok(ui.includes('refine:opts.refine'), 'and on into IntMapOutline.show');
  assert.ok(tools.includes('ctx.refine') && tools.includes('myseq!==_seq'),
    'js/map-tools.js must consume refine AND drop it when a later show()/clear() has taken over');
});

test('#R669 ⑬ the sharp shape replaces the coarse one in place — it is never a second layer', () => {
  /* ⚠ READ, NOT RUN: same reason as ⑫ — the outline lives on the renderer. */
  const tools = read('js/map-tools.js');
  const i = tools.indexOf('ctx.refine');
  const block = tools.slice(i, i + 700);
  assert.ok(block.includes('setData('), 'the same source is set again');
  assert.ok(!/addLayer|layers\.add\(/.test(block), 'a second outline layer would draw the boundary twice');
});

/* ── ⑥ topology without roles (#R712) ────────────────────────────────────── */

test('#R712 a separate island inside the mainland bounding box remains land', () => {
  const R = ohmRings();
  for (const role of ['', 'outer']) {
    const geo = R.geometryOf({ members: [wayR(concave, role), wayR(square(2, 2, 1), role)] });
    assert.equal(geo.type, 'MultiPolygon');
    assert.equal(geo.coordinates.length, 2);
    assert.ok(geo.coordinates.every(p => p.length === 1));
  }
});

test('#R712 actual holes and islands within holes retain their topology without source roles', () => {
  const R = ohmRings();
  const polys = R.polysOf([square(0, 0, 10), square(2, 2, 6), square(3, 3, 1)]);
  assert.equal(polys.length, 2);
  assert.equal(polys[0].length, 2);
  assert.equal(polys[1].length, 1);
});

test('#R712 explicit outer roles are not converted to holes by spatial containment', () => {
  const R = ohmRings();
  const geo = R.geometryOf({ members: [wayR(square(0, 0, 10), 'outer'), wayR(square(2, 2, 1), 'outer')] });
  assert.equal(geo.type, 'MultiPolygon');
  assert.equal(geo.coordinates.length, 2);
});

test('#R712 inner roles attach to the smallest containing shell', () => {
  const R = ohmRings();
  const geo = R.geometryOf({ members: [wayR(square(0, 0, 10), 'outer'), wayR(square(2, 2, 6), 'inner'),
    wayR(square(3, 3, 3), 'outer'), wayR(square(4, 4, 1), 'inner')] });
  assert.equal(geo.type, 'MultiPolygon');
  assert.equal(geo.coordinates[0].length, 2);
  assert.equal(geo.coordinates[1].length, 2);
});

test('#R712 assembling touching boundaries does not join explicit inner and outer ways', () => {
  const R = ohmRings();
  const outer = square(0, 0, 10), inner = [[0, 0], [2, 1], [1, 2], [0, 0]];
  const rings = R.ringsOf({ members: [wayR(outer.slice(0, 3), 'outer'), wayR(inner, 'inner'), wayR(outer.slice(2), 'outer')] });
  assert.equal(rings.length, 2);
  assert.equal(R.polysOf(rings).length, 1);
  assert.equal(R.polysOf(rings)[0].length, 2);
});

test('#R712 role metadata leaves the existing coordinate-array serialization unchanged', () => {
  const R = ohmRings(), points = square(0, 0, 1);
  assert.equal(JSON.stringify(R.ringsOf({ members: [wayR(points, 'outer')] })), JSON.stringify([points]));
});

test('#R712 an initially interior vertex does not turn an escaping ring into a hole', () => {
  const R = ohmRings();
  const escaping = [[0.5, 0.5], [3, 0.5], [3, 2], [0.5, 0.5]];
  assert.equal(R.polysOf([concave, escaping]).length, 2);
});

test('#R712 edges cannot cross a concave shell even when vertices and midpoints are inside', () => {
  const R = ohmRings();
  // A narrow notch sits off the crossing edge midpoint. Vertex-only and
  // midpoint-only containment both incorrectly classify the triangle as a hole.
  const notched = [[0, 0], [10, 0], [10, 10], [3, 10], [3, 4], [2, 4], [2, 10], [0, 10], [0, 0]];
  const crossing = [[1, 5], [9, 5], [9, 1], [1, 5]];
  assert.equal(R.polysOf([notched, crossing]).length, 2);
});
