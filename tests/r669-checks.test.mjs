/* ============================================================================
 *  tests/r669-checks.test.mjs — the click is answered at the line's resolution,
 *  and an undated record is not a present-day record  (#R669)
 * ----------------------------------------------------------------------------
 *  「歴史的地方区分の境界線のcoverageがくそ。全時代、全地域で完璧に網羅しろ。
 *    日本は北半分の令制国が全滅。クリックしたときのハイライト線が線に比べて
 *    解像度が低い。」
 *
 *  What this round measured, and therefore what these checks hold:
 *    · The highlight came from the SHIPPED BUNDLE (simplified at ~2.2 km) while the
 *      line under it came from OpenHistoricalMap's own tiles. 伊豆国: 29 vertices
 *      against upstream's 2,800.
 *    · Thirteen records were dropped for carrying no dates, on a stated assumption
 *      («a present-day unit ref-admin1 already draws») that is false of every one of
 *      them — 安房国 and 壱岐国 among them.
 *  ⚠ These are EVALUATED, not read, wherever evaluating is possible (#R505): a check
 *  that greps for a spelling cannot see what a function returns.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function ohmRings() {
  const sandbox = { window: {}, console, Number, Array, Math, JSON };
  sandbox.window.window = sandbox.window;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(read('js/ohm-rings.js'), ctx, { filename: 'ohm-rings.js' });
  return sandbox.window.IntMapOhmRings;
}
const way = (...pts) => ({ type: 'way', geometry: pts.map(([lon, lat]) => ({ lon, lat })) });

/* ── ① the assembler ─────────────────────────────────────────────────────── */

test('① unordered, reversed member ways still close into one ring', () => {
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

test('② a ring wholly inside another becomes its hole, not a second polygon', () => {
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

test('③ members that are not part of the area are not part of the area', () => {
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

test('④ the area floor belongs to the BUILD, not to the shape — a click keeps the sliver', () => {
  const R = ohmRings();
  /* a unit 0.001 degrees square: 1e-6 deg squared, under the build MIN_AREA of 1e-5 */
  const rings = R.ringsOf({ members: [way([0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0])] });
  assert.equal(R.polysOf(rings).length, 1, 'no floor given → the sliver survives (this is the click)');
  assert.equal(R.polysOf(rings, 1e-5).length, 0, 'the build passes a floor and drops it');
});

test('⑤ the click path does not simplify — every upstream vertex survives assembly', () => {
  const R = ohmRings();
  const pts = [];
  for (let i = 0; i < 2000; i++) { const a = (i / 2000) * Math.PI * 2; pts.push([Math.cos(a), Math.sin(a)]); }
  pts.push([pts[0][0], pts[0][1]]);
  const g = R.geometryOf({ members: [way(...pts)] });
  assert.equal(R.vertexCount(g), 2001,
    'the whole point of fetching one record is that nothing thins it on the way in');
});

test('⑥ js/ohm-rings.js is pure — no DOM, no network, no clock', () => {
  const s = read('js/ohm-rings.js');
  const body = s.slice(s.indexOf('window.IntMapOhmRings'));
  for (const forbidden of ['document', 'fetch(', 'localStorage', 'Date.now', 'setTimeout']) {
    assert.ok(!body.includes(forbidden), 'js/ohm-rings.js must not reach for ' + forbidden);
  }
});

/* ── ② one owner, not two ────────────────────────────────────────────────── */

test('⑦ the build evaluates js/ohm-rings.js instead of carrying its own assembler', () => {
  const s = read('scripts/build-hist-admin1.mjs');
  assert.ok(s.includes('ohm-rings.js'), 'scripts/build-hist-admin1.mjs must read js/ohm-rings.js');
  assert.ok(!/function\s+ringsOf\s*\(/.test(s), 'a second ring assembler is a second answer');
  assert.ok(!/function\s+polysOf\s*\(/.test(s), 'a second polygon assembler is a second answer');
});

/* ── ③ the resumable cache is addressed by the record, not by this run's list ── */

test('⑧ the geometry cache is keyed by relation id, not by batch position', () => {
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

test('⑨ every feature row carries its OpenHistoricalMap relation id', () => {
  for (const [name, d] of [['hist-admin1', B1()], ['hist-admin2', B2()]]) {
    assert.ok(d.feats.length > 0, name + ' is empty');
    const bad = d.feats.filter((f) => !Number.isFinite(f[10]));
    assert.equal(bad.length, 0,
      name + ': ' + bad.length + ' rows have no relation id — the click would have to ask upstream by NAME (#R515)');
  }
});

test('⑩ a record with no dates is still a record — 安房国 and 壱岐国 are in the bundle', () => {
  const d = B1();
  const names = new Set(d.feats.map((f) => f[0]));
  for (const n of ['安房国', '壱岐国']) {
    assert.ok(names.has(n),
      n + ' carries no start_date and no end_date upstream, which is not the same thing as being a present-day unit');
  }
  /* and the reason they were droppable is gone: an open span is one the record did not state */
  const awa = d.feats.find((f) => f[0] === '安房国');
  assert.ok(awa[2] <= 1 && awa[5] >= 9999, '安房国 must be open at BOTH ends, which is what upstream says');
});

/* ── ⑤ the click, wired end to end ───────────────────────────────────────── */

test('⑪ the click asks upstream for an ID, never for a name', () => {
  const s = read('js/time-admin1.js');
  assert.ok(s.includes('geomFullAt'), 'js/time-admin1.js must expose the sharp answer');
  assert.ok(s.includes("relation(id:' + id + ');out geom;"),
    'the Overpass body must be built from the relation id');
  assert.ok(!/relation\[["']name["']\]/.test(s), 'asking upstream «the thing called X» is what #R515 forbids');
});

test('⑫ the outline is handed the coarse shape now and the sharp one when it lands', () => {
  const ui = read('js/map-ui.js'), tools = read('js/map-tools.js');
  assert.ok(/return\s*\{\s*geo,\s*refine:/.test(ui), 'js/map-ui.js must hand over both');
  assert.ok(ui.includes('refine:eg.refine'), 'and pass refine through the popup');
  assert.ok(ui.includes('refine:opts.refine'), 'and on into IntMapOutline.show');
  assert.ok(tools.includes('ctx.refine') && tools.includes('myseq!==_seq'),
    'js/map-tools.js must consume refine AND drop it when a later show()/clear() has taken over');
});

test('⑬ the sharp shape replaces the coarse one in place — it is never a second layer', () => {
  const tools = read('js/map-tools.js');
  const i = tools.indexOf('ctx.refine');
  const block = tools.slice(i, i + 700);
  assert.ok(block.includes('setData('), 'the same source is set again');
  assert.ok(!/addLayer|layers\.add\(/.test(block), 'a second outline layer would draw the boundary twice');
});
