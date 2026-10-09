/* ============================================================================
 *  mobile-product — the thumb on the phone's clock, and the instants it stops at
 *  (js/time-thumb.js, js/place-history.js `changesOf` / `stepFrom` / `nowAt` / `changeText`, js/chronos.js
 *   `writeRailPos`, js/mobile-ui.js, Atlas `time.stepHere`)
 * ----------------------------------------------------------------------------
 *    ① THE STOPS ARE THE TIMELINE'S OWN EDGES: at Kyoto every change instant is a day an entry begins or ends, is
 *       renamed, or a first-level unit begins or ends — and every such day (up to today) is a change; nothing after
 *       today; stepping forward from the floor visits them all in order, and back again;
 *    ② WHAT THE BUBBLE SAYS: at 1600-06-15 Kyoto is «Warring States Japan» over Yamashiro; CShapes' first day is said as
 *       the edge of the record, never as a beginning of Japan; the open sea is «none», not a blank; jp is written;
 *    ③ ONE RULE FOR EVERY RAIL: `writeRailPos` turns a position into the same write the Chronos slider made (the end of
 *       the rail is the live clock, the floor is the floor), and the panel's slider now calls it rather than a copy;
 *    ④ THE THUMB: its stops are the change instants as rail positions, in order; its constants say what they are and
 *       when they lapse; it is fetched at the first touch (never in the start-up graph), and the clock declares the
 *       time intent, the arrow keys and what dragging does;
 *    ⑤ ATLAS: `time.stepHere` is registered (a point required, the clock observer), described to the planner, and run
 *       over the real record it moves the clock to the next change and says what began there and every change instant.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { harness, historyAt } from '../scripts/place-history.mjs';
import { importModule } from '../scripts/lib/import-module.mjs';
import { histScale as evaluatedHistScale } from './helpers/hist-scale.mjs';
import { stopsOf, stopAt, RAIL_SCREENS, SNAP_PX, START_PX } from '../js/time-thumb.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const KYOTO = [135.7681, 35.0116];
const today = () => { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };

let H = null, REC = null;
/* js/hist-scale.js publishes the rail on the page's window (here: globalThis) — evaluated once, as the page does */
let _hs = null;
const histScale = async () => { if (!_hs) { _hs = evaluatedHistScale(); globalThis.window = globalThis.window || globalThis; if (!window.IntMapHistScale) window.IntMapHistScale = _hs; globalThis.IntMapHistScale = window.IntMapHistScale; } return globalThis.IntMapHistScale; };
async function kyoto() { if (!H) { H = await harness('jp'); REC = await historyAt(H, KYOTO[0], KYOTO[1]); } return { H, rec: REC }; }

/* ═══ ① ═══ */
test('mobile-product ①: the stops are the timeline\'s own edges, all of them, and stepping visits them in order', async () => {
  const { H, rec } = await kyoto();
  const PH = H.PH, ch = PH.changesOf(rec), top = today();
  assert.ok(ch.length > 20, 'Kyoto changes many times: ' + ch.length);
  const want = new Set();
  for (const E of rec.nation.entries) { want.add(E.from.k); if (E.to.k <= top) want.add(E.to.k); for (const x of E.labels.slice(1)) if (x.k > E.from.k) want.add(x.k); }
  for (const E of rec.admin.entries) { want.add(E.from.k); if (E.to.k <= top) want.add(E.to.k); }
  assert.deepEqual(ch.map((c) => c.k), [...want].filter((k) => k <= top).sort((a, b) => a - b), 'the change instants are exactly the edges the record states');
  assert.ok(ch.every((c) => c.k <= top), 'nothing after today (the open unit is written 9999-01-01)');
  for (let i = 1; i < ch.length; i++) assert.ok(ch[i].k > ch[i - 1].k, 'strictly ordered, one row per instant');
  /* forward from before the first, then back from after the last */
  let k = ch[0].k - 1, seen = [];
  for (let c = PH.stepFrom(ch, k, 1); c; c = PH.stepFrom(ch, c.k, 1)) seen.push(c.k);
  assert.deepEqual(seen, ch.map((c) => c.k), 'next, next, … visits every change once');
  seen = [];
  for (let c = PH.stepFrom(ch, top + 1, -1); c; c = PH.stepFrom(ch, c.k, -1)) seen.push(c.k);
  assert.deepEqual(seen, ch.map((c) => c.k).reverse(), 'prev, prev, … visits them back');
  assert.equal(PH.stepFrom(ch, 16000615, 1).k, 16020101, 'from 1600 the next change is the Tokugawa shogunate (1602 in Cliopatria)');
  assert.equal(PH.stepFrom(ch, 16020101, -1).k, 15720101, 'standing on a change, «prev» steps past it');
  assert.equal(PH.stepFrom([], 1, 1), null);
});

/* ═══ ② ═══ */
test('mobile-product ②: what the bubble says — the polity and the unit in force, a record\'s reach as a record\'s, the sea as «none»', async () => {
  const { H, rec } = await kyoto();
  const PH = H.PH;
  const at1600 = PH.nowAt(rec, 16000615, 'en');
  assert.equal(at1600.status, 'ok');
  assert.deepEqual(at1600.polities.map((p) => p.text), ['Warring States Japan']);
  assert.ok(at1600.units.some((u) => /山城|Yamashiro/.test(u)), 'the first-level unit in force: ' + JSON.stringify(at1600.units));
  const ch = PH.changesOf(rec);
  const c1886 = ch.find((c) => c.k === 18860101);
  assert.ok(c1886, 'CShapes begins at Kyoto on 1886-01-01');
  assert.match(PH.changeText(c1886, 'en', rec.nation.records), /where CShapes 2\.0 begins/, 'the record\'s first day is said as the record\'s');
  assert.match(PH.changeText(c1886, 'jp', rec.nation.records), /記録の始まり/);
  assert.ok(!/from 1886: Japan$/.test(PH.changeText(c1886, 'en', rec.nation.records)), 'never «Japan begins in 1886»');
  /* two rows of one unit meeting is said once, as that — the prefecture did not end in 1876 */
  const seam = PH.changeText(ch.find((c) => c.k === 18760821), 'en', rec.nation.records);
  assert.match(seam, /goes on in another row of the record/); assert.ok(!/until/.test(seam), seam);
  assert.match(PH.changeText(ch.find((c) => c.k === 16020101), 'en', rec.nation.records), /Tokugawa Shogunate \(Cliopatria/, 'an edge a record states names the record');
  const end = ch.find((c) => c.k === 20200101);
  assert.match(PH.changeText(end, 'en', rec.nation.records), /until 2019 \(where CShapes 2\.0 ends\)/);
  /* the instant in the record's own precision: a year where the record states a year, a day where it states a day */
  assert.equal(PH.instantText(16020101, 'clio', 'en'), '1602');
  assert.match(PH.instantText(18680103, 'ohm', 'en'), /Jan.*3.*1868/);
  /* the open Pacific: no record draws a polity, and the bubble says so (status none, no polities) */
  const sea = await historyAt(H, -150, 10);
  const s = PH.nowAt(sea, 19000615, 'en');
  assert.ok(s.status === 'none' || (s.status === 'ok' && s.gap), 'the open sea is said, not left blank: ' + JSON.stringify(s));
  assert.equal(PH.nowAt({ nation: { status: 'unavailable', entries: [] } }, 19000615, 'en').status, 'unavailable', 'a record that could not be read is said as such');
  assert.equal(PH.kOf(new Date(Date.UTC(1871, 7, 29, 12))), 18710829);
});

/* ═══ ③ ═══ */
test('mobile-product ③: one rule turns a rail position into a write on the clock — and the Chronos slider uses it', async () => {
  const HS = await histScale();
  const { IntMapTime, writeRailPos } = await import('../js/chronos.js');
  assert.ok(HS && HS.rail, 'js/hist-scale.js is evaluated');
  const writes = [];
  const clock = { min: IntMapTime.min, setNow: (o) => writes.push(['now', o.source]), setYear: (y, o) => writes.push(['year', y, o.source]) };
  const cur = new Date().getFullYear();
  assert.equal(writeRailPos(HS.rail.POS, clock), cur); assert.deepEqual(writes.pop(), ['now', 'ui'], 'the end of the rail is the live clock');
  writeRailPos(0, clock); assert.deepEqual(writes.pop(), ['year', IntMapTime.min, 'ui'], 'the start of the rail is the clock\'s floor');
  for (const y of [1, 1600, 1914, 1990]) { writeRailPos(HS.rail.toPos(y, IntMapTime.min, cur), clock); assert.deepEqual(writes.pop(), ['year', y, 'ui'], y + ' round-trips'); }
  const nt = rd('js/news-timeline.js');
  assert.match(nt, /function writeYearAtPos\(p\)\{ return writeRailPos\(p\); \}/, 'the panel\'s slider writes through the one rule');
  assert.ok(!/IntMapTime\.setNow\(\{source:'ui'\}\); else if\(y>=YMIN\(\)\) IntMapTime\.setYear/.test(nt), 'no second copy of the rule in the panel');
});

/* ═══ ④ ═══ */
test('mobile-product ④: the thumb — stops in order on the rail, stated constants, fetched at the first touch, a declared clock', async () => {
  const { H, rec } = await kyoto();
  const ch = H.PH.changesOf(rec);
  await histScale();
  const stops = stopsOf(ch);
  assert.equal(stops.length, ch.length);
  for (let i = 1; i < stops.length; i++) assert.ok(stops[i].p >= stops[i - 1].p, 'a later instant is never left of an earlier one on the rail');
  assert.ok(stops.every((s) => s.p >= 0 && s.p <= globalThis.IntMapHistScale.rail.POS));
  assert.equal(stops.find((s) => s.k === 16020101).tier, 'clio', 'a stop carries its record, so it is shown at the record\'s precision');
  const src = rd('js/time-thumb.js');
  for (const k of ['RAIL_SCREENS', 'SNAP_PX', 'START_PX']) assert.match(src, new RegExp('⚠ ' + k + ' —[^]*?(ESTIMATE|vertical|VERTICAL)'), k + ' says what it is');
  assert.match(src, /EXPIRES IF/, 'the estimates say when they lapse');
  assert.ok(START_PX > 7, 'a scrub needs more sideways travel than the sheet head needs vertical travel to start its drag');
  const mu = rd('js/mobile-ui.js');
  assert.match(mu, /import\('\.\/time-thumb\.js'\)/, 'mobile-ui fetches the thumb on demand');
  assert.ok(!/^import[^\n]*time-thumb/m.test(mu), 'the thumb is not in the start-up graph');
  for (const f of ['js/app-body.js', 'js/main.js', 'index.html']) { let t = ''; try { t = rd(f); } catch (_) { continue; } assert.ok(!/^import[^\n]*time-thumb/m.test(t), f + ' does not import the thumb eagerly'); }
  const html = rd('index.html');
  assert.match(html, /id="m-clock"[^>]*data-time-intent/, 'the phone\'s clock is time UI: touching it is the intent to travel');
  assert.match(mu, /aria-keyshortcuts','ArrowLeft ArrowRight'/);
  assert.match(mu, /横になぞると年が動きます/, 'what dragging does is said, in jp');
  assert.match(mu, /Drag sideways to move through time/, '…and in en');
});

/* ═══ ⑤ ═══ */
test('mobile-product ⑤: Atlas — time.stepHere moves the clock to the next change over a point and says what began there', async () => {
  const row = rd('js/atlas-capabilities.js').match(/\["time\.stepHere","stepHere",[^\]]*\]/);
  assert.ok(row, 'the generated table carries the row');
  assert.match(row[0], /"time","time","time","map,time","session","none","point"/, 'the clock\'s observer and conflict key; a point is required (never the centre unasked)');
  const { stepHere } = Object.fromEntries((await importModule('js/atlas-cap-time.js')).default.map((e) => [e.row[0].replace('time.', ''), e]));
  assert.ok(stepHere && stepHere.doc[0].in === 'time.coverage', 'described to the planner beside placeHistory');
  assert.match(stepHere.doc[0].text, /reach = the edge of a record, NOT a polity/);
  /* run it over the real record: the page's modules, the harness's readers */
  const { H } = await kyoto();
  globalThis.window = globalThis.window || globalThis;
  window.IntMapTimeBorders = H.borders; window.IntMapTimeAdmin1 = H.admin;
  await histScale();
  const { IntMapTime } = await import('../js/chronos.js');   /* the instance js/atlas-cap-time.js imports */
  IntMapTime.set(Date.UTC(1600, 5, 15, 12), { source: 'test' });
  const K = { R: (ok, html, meta) => Object.assign({ ok, html }, meta || {}), warn: (s) => s, note: (s) => s, esc: (s) => String(s), L: (en) => en, HOST: { lang: 'en' }, geocode: async () => null, GE: () => ({ camera: { getCenter: () => ({ lng: KYOTO[0], lat: KYOTO[1] }) } }) };
  const r = await stepHere.run({ place: 'center' }, {}, K);
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  const b = r.exec.stepHere;
  assert.equal(b.from, '1600-06-15'); assert.equal(b.to, '1602-01-01');
  assert.equal(IntMapTime.iso(), '1602-01-01', 'the clock moved to the change');
  assert.ok(b.begins.some((e) => e.name === 'Tokugawa Shogunate'), 'what began there');
  assert.ok(b.changes.length > 20 && b.changes.includes('1868-01-03'), 'every change instant, so a further hop is a time.travel');
  const back = await stepHere.run({ lng: KYOTO[0], lat: KYOTO[1], dir: 'prev', from: '1886-01-01' }, {}, K);
  assert.equal(back.exec.stepHere.to, '1880-01-01', 'prev from a given day');
  const none = await stepHere.run({}, {}, K);
  assert.equal(none.ok, false, 'no point named → asked, not given the centre');
});
