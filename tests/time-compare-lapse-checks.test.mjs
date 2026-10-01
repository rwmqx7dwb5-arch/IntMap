/* ============================================================================
 *  time-compare-lapse — A CLOCK PER MAP, THE COMPARISON WINDOW AT ITS OWN INSTANT, AND THE CLOCK PLAYED FORWARD
 * ----------------------------------------------------------------------------
 *  What is held here, by EVALUATING the shipped modules (#R505 — reading source cannot see behaviour):
 *    ① js/chronos.js `makeClock` makes clocks that are independent of each other, while the main clock keeps
 *      every member it had and «the reader is heading into the past» stays ONE page-wide signal.
 *    ② js/layer-time.js `onMap`: on another map the SOURCE's statement is unchanged and only «who applies the
 *      instant» is that map's — so a window copy that does not follow the clock is «own date», not «stated».
 *    ③ every layer the comparison window offers names a declaration the rule can read (a main-map layer's,
 *      or its own, validated by the same `validate` the gate runs).
 *    ④ js/time-lapse.js steps the clock in its unit and stops at the end; a hand on the clock pauses it.
 *    ⑤ the `timeView` verdict: done is «the state reached is the state asked for» — not «the call returned».
 *  The browser half (the window drawing 1914's borders beside today's, layers entering during a lapse) is
 *  the time-compare-lapse tests at the end of tests/smoke.spec.js.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { importModule, fileUrl } from './helpers/import-module.mjs';
/* read by name (scripts/export-readers.mjs counts static imports): the pure rule, and the window's own declaration */
import { onMap } from '../js/layer-time.js';
import { MERRA2 } from '../js/compare.js';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

const { IntMapTime, makeClock } = await importModule('js/chronos.js');
const R = await importModule('js/layer-time.js');
const { TIME } = await importModule('js/layer-time-decl.js');

test('① two clocks, two instants — and the main clock is the one it always was', () => {
  const A = makeClock('a'), B = makeClock('b');
  const seenA = [], seenB = [];
  A.on((e) => seenA.push(e.year)); B.on((e) => seenB.push(e.year));
  A.setYear(1914); B.setNow();
  assert.equal(A.when().getUTCFullYear(), 1914, 'clock A did not take its year');
  assert.equal(B.isLive(), true, 'setting clock A moved clock B');
  assert.deepEqual(seenA, [1914]); assert.equal(seenB.length, 1, 'a clock broadcast to another clock\'s subscribers');
  for (const k of ['get', 'when', 'iso', 'year', 'isLive', 'state', 'on', 'set', 'setYear', 'setDaysAgo', 'setNow', 'intent', 'intended', 'onIntent']) {
    assert.equal(typeof IntMapTime[k], 'function', 'the main clock lost `' + k + '`');
    assert.equal(typeof A[k], 'function', 'a made clock lacks `' + k + '`');
  }
  assert.ok(Number.isFinite(IntMapTime.min), 'the floor is not readable');
  /* the intent is the page's: a second clock going to the past fires it for every listener, once */
  let heard = 0; IntMapTime.onIntent(() => { heard++; });
  assert.equal(heard, 1, 'clock A set a past year and the page-wide intent did not fire');
  assert.deepEqual(A.intended(), IntMapTime.intended(), 'two clocks disagree about the one page-wide intent');
});

test('② on another map the source states the same thing; only who applies the instant changes', () => {
  const at = (y) => ({ when: R.toMs(y) + 165 * 864e5, live: false, now: Date.now() });
  /* Köppen follows the clock on the window (it picks the period of the window's year) */
  const k = onMap(TIME['dl-climate'], { follows: 'js/compare.js koppenPeriodAt' });
  assert.equal(R.verdict(k, at(1890)).status, 'unstated', '1890 is before the first Köppen period');
  assert.equal(R.verdict(k, at(1950)).status, 'stated');
  assert.equal(R.verdict(k, at(2024)).status, 'carried', 'past 2020 the newest period is carried and said');
  /* the population choropleth on the window bakes the statistics once: inside its years it is «own date»,
     never «stated» — the window does not follow the clock for it */
  const p = onMap(TIME['dl-pop'], { ownDate: 'js/compare.js srcReady' });
  assert.equal(R.verdict(p, at(1914)).reason, 'own-date');
  assert.equal(R.verdict(p, at(1800)).status, 'unstated');
  /* a live feed states the present only, on any map */
  assert.equal(R.verdict(onMap(TIME['bx-eq'], {}), at(1914)).status, 'unstated');
  /* `self` is removed when the other map's drawer is not the main map's module */
  assert.equal(onMap(TIME['dl-nightsat'], { ownDate: 'x' }).self, undefined);
  assert.equal(onMap(TIME['dl-nightsat'], null), TIME['dl-nightsat'], 'no override must be the declaration as written');
});

test('③ every layer the comparison window offers names a declaration the rule can read', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../js/compare.js', import.meta.url), 'utf8');
  /* the entries are the window's registry: `{k:'…'` rows, `dayEntry('…'` rows and `mk('…'` choropleth rows.
     Each must say which declaration speaks for it — a main-map layer id that exists, or its own `time`. */
  const lids = [...src.matchAll(/\blid:'([^']+)'/g)].map((m) => m[1]);
  const choro = [...src.matchAll(/\bmk\('([^']+)',[\s\S]*?,'([a-zA-Z0-9-]+)'\)/g)].map((m) => m[2]);
  for (const id of lids.concat(choro)) assert.ok(TIME[id], 'the window names «' + id + '», which no main-map layer declares');
  const rows = (src.match(/\{k:'[^']+',/g) || []).length + (src.match(/\bdayEntry\('[^']+'/g) || []).length + (src.match(/\bmk\('[^']+'/g) || []).length;
  const declared = lids.length + choro.length + (src.match(/\{time:[A-Z0-9_]+\}/g) || []).length;
  assert.equal(declared, rows, 'a comparison-window layer carries no time declaration (lid or time)');
  assert.deepEqual(R.validate('compare temp', MERRA2), [], 'the window\'s own declaration does not pass the rule');
  const at = (y) => ({ when: R.toMs(y) + 165 * 864e5, live: false, now: Date.now() });
  assert.equal(R.verdict(MERRA2, at(1914)).status, 'unstated', 'MERRA-2 begins in 1980');
  assert.equal(R.verdict(MERRA2, at(1990)).status, 'stated');
});

test('④ the lapse steps the clock in its unit, stops at its end, and a hand on the clock pauses it', async () => {
  const L = await importModule('js/time-lapse.js');
  const T = (await import(fileUrl('js/chronos.js'))).IntMapTime;   /* the same singleton the lapse imports */
  let s = L.startLapse({ from: 1900, to: 1902, unit: 'year', fps: 4 });
  assert.equal(s.error, undefined, JSON.stringify(s));
  assert.equal(s.playing, true);
  assert.equal(T.when().getUTCFullYear(), 1900, 'the lapse did not start at its start');
  const until = async (fn, ms) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 20)); return fn(); };
  assert.ok(await until(() => !L.lapseState().playing, 5000), 'the lapse did not reach its end');
  s = L.lapseState();
  assert.equal(s.ended, 'end');
  assert.equal(T.when().getUTCFullYear(), 1902, 'the clock is not at the end year');
  assert.ok(s.frames >= 3, 'fewer frames than instants: ' + s.frames);
  /* days: one day per frame from a date */
  s = L.startLapse({ from: '2001-03-01', to: '2001-03-03', unit: 'day', fps: 4 });
  assert.ok(await until(() => !L.lapseState().playing, 5000));
  assert.equal(T.iso(), '2001-03-03');
  /* a hand on the clock */
  L.startLapse({ from: 1800, to: 1850, unit: 'year', fps: 4 });
  T.setYear(1960, { source: 'ui' });
  s = L.lapseState();
  assert.equal(s.playing, false); assert.equal(s.ended, 'clock-moved');
  assert.equal(T.when().getUTCFullYear(), 1960, 'the lapse overwrote the reader\'s instant');
  /* refusals say what is missing */
  assert.equal(L.startLapse({ from: '' }).error, 'no-start');
  assert.equal(L.startLapse({ from: 1950, to: 1900 }).error, 'empty-range');
  T.setNow({ source: 'ui' });
});

test('⑤ timeView: done is the state asked for, observed after — not the call returning', async () => {
  const { makeAtlasCapabilities } = await importModule('js/atlas-capabilities.js');
  /* the comparison window's published controller — the one thing the observer reads for it (js/compare.js) */
  let windowState = { open: true, follow: false, live: false, iso: '1914-06-15' };
  window.IntMapCompare = { timeState: () => windowState };
  const CAPS = makeAtlasCapabilities({ lang: 'en' });
  const cmp = CAPS.resolve('time.compare'), lap = CAPS.resolve('time.lapse');
  assert.ok(cmp && lap, 'the two capabilities are registered');
  assert.equal(cmp.observerKind, 'timeView'); assert.equal(lap.observerKind, 'timeView');
  const want = { compare: { open: true, follow: false, live: false, iso: '1914-06-15' } };
  const before = { compare: { open: false, follow: true, live: true, iso: null }, lapse: null };
  const after = await cmp.observe();
  assert.deepEqual(after.compare, want.compare, 'the observer did not read the window');
  assert.equal(cmp.verify({}, {}, before, after, { ok: true, want }).status, 'completed');
  assert.equal(cmp.verify({}, {}, after, after, { ok: true, want }).code, 'already_there');
  windowState = { open: true, follow: true, live: true, iso: null };
  assert.equal(cmp.verify({}, {}, before, await cmp.observe(), { ok: true, want }).code, 'no_change', 'a window that did not take the instant was called done');
  assert.equal(cmp.verify({}, {}, before, { compare: null, lapse: null }, { ok: true, want }).status, 'unobserved', '«could not be asked» was reported as a result');
  assert.equal(lap.verify({}, {}, null, { lapse: { playing: false } }, { ok: true, want: { lapse: { playing: true } } }).code, 'no_change', 'a lapse that did not start was called done');
});
