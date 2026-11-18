/* ============================================================================
 *  exploration-flows (place) — the place card as the hub of «this place → its past → two times → back to now»
 * ----------------------------------------------------------------------------
 *  What is held here, by EVALUATING the shipped modules (#R505 — reading source cannot see behaviour):
 *    ① «Compare two times here» hands js/compare.js `thenNow` the place, `now`, and as `then` the instant the reader chose on
 *      THIS card for THIS point — and nothing when none was chosen (thenNow then takes the main clock, or asks for a year);
 *    ② thenNow's framing (`framingOf`) accepts the place as [lng,lat] or {lng,lat}, keeps a zoom only when it is a number,
 *      and refuses a place that is not one (the camera stays);
 *    ③ a «through time» row's instant is spelled the way thenNow reads it: a sheet's year as a number, a day as noon UTC;
 *    ④ `historyGo` — the ONE helper the card and a news event's «This place's past» press through — moves the clock AND
 *      brings the camera to the place, with the same camera `rowCamera` gives the comparison; a press that does not move
 *      the clock does not move the camera;
 *    ⑤ the country button's era answer (`eraPolityAt`): nothing when the era layer is not drawing, the smallest drawn shape
 *      holding the point otherwise, the statistics code only when the statistics carry it, nothing for a nameless shape.
 *  Where evaluation needs the page's DOM (the card's clock listener, its banner and buttons; event-past's press), the
 *  wiring is read from the source — ⑥.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importModule } from './helpers/import-module.mjs';
/* read by name (scripts/export-readers.mjs counts static imports) */
import { framingOf } from '../js/compare.js';
import { compareArgs, eraPolityAt } from '../js/place-dossier.js';
import { shapesAt } from '../js/border-provenance.js';
import { thenOfEntry, historyGo, rowCamera } from '../js/place-history.js';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

test('① the comparison is asked at this place, with the instant chosen on this card for this point', () => {
  const at = { lng: 135.5, lat: 34.7, text: '34.700, 135.500' };
  assert.deepEqual(compareArgs(at, { at: at.text, then: 1871 }, 8), { now: 'now', center: [135.5, 34.7], then: 1871, zoom: 8 });
  assert.deepEqual(compareArgs(at, { at: at.text, then: '1871-08-29T12:00:00Z' }, null), { now: 'now', center: [135.5, 34.7], then: '1871-08-29T12:00:00Z' });
  /* an instant chosen at another point is not this point's; none chosen → no `then` (thenNow decides from the clock) */
  assert.equal('then' in compareArgs(at, { at: '0.000, 0.000', then: 1500 }, 7), false);
  assert.equal('then' in compareArgs(at, null, 7), false);
  assert.equal('zoom' in compareArgs(at, null, NaN), false, 'a zoom no renderer gave is not invented');
});

test('② thenNow\'s framing: a real place, in either spelling; a zoom only when it is a number', () => {
  assert.deepEqual(framingOf({ center: [10, 20], zoom: 7 }), { center: [10, 20], zoom: 7 });
  assert.deepEqual(framingOf({ center: { lng: -3.5, lat: 51 } }), { center: [-3.5, 51], zoom: null });
  assert.deepEqual(framingOf({ center: [10, 20], zoom: '' }), { center: [10, 20], zoom: null });
  assert.equal(framingOf({}), null, 'no place: the camera stays');
  assert.equal(framingOf({ center: [10, 95] }), null, 'a latitude off the globe is not a place');
  assert.equal(framingOf({ center: ['x', 1] }), null);
  assert.equal(framingOf(null), null);
});

test('③ a row\'s instant in thenNow\'s spelling: the sheet\'s year, or the day at noon UTC (astronomical years too)', () => {
  assert.equal(thenOfEntry({ jump: { k: 15000101, sheet: 1500 } }), 1500);
  const d = thenOfEntry({ jump: { k: 18710829 } });
  assert.equal(d, '1871-08-29T12:00:00Z');
  const t = new Date(Date.parse(d));
  assert.equal(t.getUTCFullYear(), 1871); assert.equal(t.getUTCHours(), 12);
  const bc = thenOfEntry({ jump: { k: -500 * 10000 + 615 } })   /* the file's own YYYYMMDD arithmetic: y*10000 + m*100 + d */;
  assert.ok(Number.isFinite(Date.parse(bc)), 'a year before the era must still parse: ' + bc);
  assert.equal(new Date(Date.parse(bc)).getUTCFullYear(), -500);
  assert.equal(thenOfEntry({}), null);
  assert.equal(thenOfEntry(null), null);
});

test('④ historyGo: the clock moves and the camera goes to the place — the same camera the comparison is framed with', async () => {
  const calls = { set: [], setYear: [], fly: [] };
  const clock = { set: (d, o) => calls.set.push([d, o]), setYear: (y, o) => calls.setYear.push([y, o]), isLive: () => false };
  let zoom = 3;
  const ge = { hasRenderer: () => true, camera: { getZoom: () => zoom, flyTo: (o) => calls.fly.push(o) } };
  window.IntMapHistScale = { utcAt: (y, m, d, h) => { const t = new Date(0); t.setUTCFullYear(y, m, d); t.setUTCHours(h || 0); return t; } };
  const PH = await importModule('js/place-history.js', { mocks: { 'js/chronos.js': { IntMapTime: clock }, 'js/geo-engine.js': { IntMapGeoEngine: ge } } });
  const rec = { status: 'ok', nation: { entries: [{ jump: { k: 18710829 } }, { jump: { k: 15000101, sheet: 1500 } }, { name: 'no jump' }] }, admin: { entries: [] } };
  const at = { lng: 135.5, lat: 34.7 };

  const a = PH.historyGo(rec, 'ph:0', 'en', at);
  assert.equal(a.action, 'clock'); assert.equal(a.then, '1871-08-29T12:00:00Z');
  assert.equal(calls.set.length, 1); assert.equal(calls.set[0][0].getUTCFullYear(), 1871);
  assert.equal(calls.fly.length, 1, 'the clock moved, so the map must move to the place');
  assert.deepEqual(calls.fly[0].center, [135.5, 34.7]);
  assert.deepEqual({ center: calls.fly[0].center, zoom: calls.fly[0].zoom }, PH.rowCamera(at), 'the press and the comparison share one camera rule');
  assert.equal(calls.fly[0].zoom, 7, 'a reader further out than the row zoom is brought to it');
  zoom = 15; assert.equal(PH.rowCamera(at).zoom, 9, 'a reader closer in keeps at most two levels more');

  const b = PH.historyGo(rec, 'ph:1', 'en', at);
  assert.deepEqual([b.action, b.then], ['clock', 1500]); assert.deepEqual(calls.setYear.map((x) => x[0]), [1500]);
  assert.equal(calls.fly.length, 2);

  const c = PH.historyGo(rec, 'ph:2', 'en', at);
  assert.deepEqual([c.action, c.then], [null, null]); assert.equal(calls.fly.length, 2, 'no clock move → no camera move');
  const d = PH.historyGo(rec, 'not-a-row', 'en', at);
  assert.equal(d.action, null); assert.equal(calls.fly.length, 2);
  const e = PH.historyGo(rec, 'ph:0', 'en', null);
  assert.equal(e.action, 'clock'); assert.equal(calls.fly.length, 2, 'without a place the clock still moves, the camera stays');

  /* the statically imported module is the page's own: the same rule, with no renderer → no zoom claimed */
  assert.equal(rowCamera({ lng: 1, lat: 2 }).zoom, null);
  assert.equal(typeof historyGo, 'function');
  /* the bare handler underneath still answers for keys that are not a clock move, and never for a record it cannot read */
  assert.equal(historyGo({ status: 'unavailable' }, 'ph:0', 'en').action, null);
  assert.equal(historyGo({ status: 'ok', nation: { entries: [{ name: 'no jump' }] } }, 'ph:0', 'en').action, null);
  assert.equal(historyGo({ status: 'ok', nation: { entries: [] } }, 'other', 'en').action, null);
});

test('⑤ the country button\'s era answer is the era layer\'s, or nothing', () => {
  const box = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
  const empire = { properties: { NAME: 'Big Empire' }, geometry: box(0, 0, 40, 40) };
  const kingdom = { properties: { NAME: 'Small Kingdom' }, geometry: box(5, 5, 15, 15) };
  const nameless = { properties: {}, geometry: box(8, 8, 12, 12) };
  const asked = [];
  const TB = (fs, on = true) => ({ active: () => on, currentFC: () => ({ features: fs }), shapesHolding: (pt) => (on ? shapesAt(fs, pt, 0) : []),
    resolveHist: (nm) => { asked.push(nm); return nm === 'Small Kingdom' ? { name: 'Small Kingdom', code: 'SKG', wiki: 'Small_Kingdom' } : { name: nm, code: 'BIG' }; } });
  const stats = { SKG: { nameEn: 'Small Kingdom' } };

  assert.equal(eraPolityAt(TB([empire, kingdom], false), { lng: 10, lat: 10 }, stats), null, 'the era layer is not drawing: no era answer');
  assert.equal(eraPolityAt(null, { lng: 10, lat: 10 }, stats), null);
  const k = eraPolityAt(TB([empire, kingdom]), { lng: 10, lat: 10 }, stats);
  assert.equal(k.name, 'Small Kingdom', 'the smallest drawn shape holding the point, as the map\'s own click ranks them');
  assert.equal(k.code, 'SKG'); assert.equal(k.wiki, 'Small_Kingdom');
  const e = eraPolityAt(TB([empire, kingdom]), { lng: 30, lat: 30 }, stats);
  assert.equal(e.name, 'Big Empire'); assert.equal(e.code, null, 'a code the statistics do not carry is not handed to the statistics card');
  assert.equal(eraPolityAt(TB([empire, kingdom]), { lng: 50, lat: 50 }, stats), null, 'outside every drawn shape: nothing');
  asked.length = 0;
  assert.equal(eraPolityAt(TB([empire, nameless]), { lng: 10, lat: 10 }, stats), null, 'the smallest shape names nothing: no name is borrowed from the shape around it');
  assert.deepEqual(asked, []);
});

test('⑥ the wiring that needs the page: the clock listener, the way back, the doors', () => {
  const pd = rd('js/place-dossier.js'), ep = rd('js/event-past.js');
  /* the clock's listener is taken when a card opens and given back when it closes */
  assert.match(pd, /offClock = IntMapTime\.on\(onClock\)/);
  assert.match(pd, /function closePlaceCard\(\)[\s\S]{0,300}offClock\(\)[\s\S]{0,80}offClock = null/);
  /* the line and «Back to now» show only when the map is not at now; the button is the clock's own door */
  assert.match(pd, /w\.hidden = live;/);
  assert.match(pd, /dataset\.pd === 'now'\) \{ try \{ IntMapTime\.setNow\(/);
  /* the comparison goes through thenNow, the save through My places' one door */
  assert.match(pd, /C\.thenNow\(compareArgs\(at, chosen,/);
  assert.doesNotMatch(pd, /from '\.\/compare\.js'|import\('\.\/compare\.js'\)/, 'the lazy card must not reference js/compare.js (it split eight shared modules out of main: boot requests 9 → 17)');
  assert.match(pd, /M\.savePlace\(HOST\.DB, \{[^}]*source: 'reader' \}\)/);
  /* a related row is a button that keeps its stated basis */
  assert.match(pd, /<button type="button" class="hn-item" data-hn="rel:\$\{i\}"[^`]*<span class="hn-m">\$\{x\.why/);
  /* both timeline surfaces press through the one helper, and neither calls the bare handler any more */
  assert.match(pd, /PH\.historyGo\(hi, k,/);
  assert.match(ep, /historyGo\(rec\.history, t\.dataset\.hn, lang, place\.at\)/);
  assert.doesNotMatch(pd + ep, /historyAction\(/, 'a surface that calls historyAction directly moves the clock without the map');
});

/* measured in the browser 2026-11-18: the era layer's public object already had a `drawnAt` (the instant drawn, for js/map-cite.js),
   written later in the same literal, so the one added for the card was overwritten and the card always said «today's country» */
test('the era layer hands out the shapes holding a point under a name of its own, not overwritten in its public object', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../js/time-borders.js', import.meta.url), 'utf8');
  assert.equal((src.match(/\bshapesHolding\s*:/g) || []).length, 1, 'declared once');
  assert.match(src, /shapesHolding:\(lngLat\)=>\{ const fc=active\?_drawnFC\(\):null;/);
});
