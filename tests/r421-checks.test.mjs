// R421 source-level regression checks — DAY-EXACT historical borders.
//
// 「歴史国境の更新ペースをさらに細かくして。理想は月日単位。特に20s前半が荒い。」
//
// The shipped CShapes bundle has ALWAYS carried per-record validity dates (sy,sm,sd → ey,em,ed).
// js/time-borders.js threw the month and the day away at the last step and asked one question per
// calendar year — "was this feature alive on JULY 1?" — so 710 records spanning 365 distinct
// transition dates were sampled at 104 instants. Every assertion below is measured against the
// bundle that actually ships, not against a fixture, because the whole defect was a selector that
// disagreed with the data sitting beside it.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const TB = read('js/time-borders.js');

/* The bundle is 5.5 MB of literal assigned to window.__CSHAPES; load it the way the browser does. */
let CS = null;
function cshapes() {
  if (CS) return CS;
  const src = read('data/cshapes.js');
  const g = { window: {} };
  new Function('window', src)(g.window);
  CS = g.window.__CSHAPES;
  return CS;
}

/* The selector, restated here exactly as js/time-borders.js states it, so this file measures the
   RULE rather than re-reading the implementation's own arithmetic back to itself. */
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const liveOn = (f, t) => !(ymd(f[2], f[3], f[4]) > t || ymd(f[5], f[6], f[7]) < t);
const worldOn = (d, y, m, dd) => {
  const t = ymd(y, m, dd);
  return d.feats.filter((f) => liveOn(f, t)).map((f) => f[0]).sort();
};
/* the OLD rule, kept so the parity assertion below is a real comparison and not a tautology */
const worldJul1Old = (d, year) =>
  d.feats
    .filter((f) => {
      const [, , sy, sm, sd, ey, em, ed] = [0, 0, f[2], f[3], f[4], f[5], f[6], f[7]];
      const started = sy < year || (sy === year && (sm < 7 || (sm === 7 && sd <= 1)));
      const ends = ey > year || (ey === year && (em > 7 || (em === 7 && ed >= 1)));
      return started && ends;
    })
    .map((f) => f[0])
    .sort();

test('R421 #1 the July-1 rounding is GONE from the selector', () => {
  // The two lines that did it. Their absence is the whole change; a reintroduction of either
  // silently restores yearly borders with every other assertion here still passing.
  assert.ok(!/active on July 1 of/.test(TB), 'the "active on July 1" selector comment must be gone');
  assert.ok(
    !/sm<7\|\|\(sm===7&&sd<=1\)/.test(TB),
    'the hard-coded July-1 start test must be gone from csFC',
  );
  assert.ok(
    !/em>7\|\|\(em===7&&ed>=1\)/.test(TB),
    'the hard-coded July-1 end test must be gone from csFC',
  );
  assert.match(TB, /function csFC\(d,year,mon,day\)/, 'csFC takes the month and the day');
});

test('R421 #2 the clock hands `go` the INSTANT, not the year', () => {
  // `go(e.year)` was the rounding: the kernel broadcasts a full Date and the module read one field.
  assert.ok(
    !/go\._t=setTimeout\(\(\)=>\{ try\{ go\(e\.year\)/.test(TB),
    'the subscriber must not pass e.year — that IS the July-1 rounding, one level up',
  );
  assert.match(TB, /const w=e\.when;/, 'the subscriber captures the whole instant');
  assert.match(TB, /async function go\(when\)/, 'go() is named for an instant');
  // and it must still accept a bare year, or every pre-R421 caller changes meaning silently
  assert.match(TB, /when instanceof Date/, 'go() still distinguishes a Date from a bare year');
});

test('R421 #3 the LOCAL getters are used, not e.iso — a picked day must not shift a day', () => {
  // chronos.js `ymdISO` is toISOString() = UTC. #ntl-date writes LOCAL midnight, so reading the day
  // back in UTC would answer 1920-10-28 with 1920-10-27 for every reader east of Greenwich.
  assert.match(TB, /when\.getFullYear\(\)/, 'the year comes from the local getter');
  assert.match(TB, /when\.getMonth\(\)\+1/, 'the month comes from the local getter');
  assert.match(TB, /when\.getDate\(\)/, 'the day comes from the local getter');
  assert.ok(!/go\(e\.iso\)|csFC\([^)]*\.iso/.test(TB), 'the UTC ISO string must not drive the selector');
});

test('R421 #4 PARITY: at July 1 the new selector reproduces the old one for every year', () => {
  // The load-bearing safety assertion. This round may only ADD reachable instants; if a single
  // year's canonical July-1 world changed, something other than the granularity moved.
  const d = cshapes();
  const mismatches = [];
  for (let y = 1886; y <= 2019; y++) {
    const now = worldOn(d, y, 7, 1);
    const old = worldJul1Old(d, y);
    if (now.length !== old.length || now.join('|') !== old.join('|')) mismatches.push(y);
  }
  assert.deepEqual(mismatches, [], 'no year may change its July-1 world');
});

test('R421 #5 the early 1920s really do get finer — and no epoch empties the map', () => {
  const d = cshapes();
  // the reported symptom, measured: 1920 is the densest year in the file
  const dates1920 = [
    [1, 12], [2, 2], [2, 10], [2, 11], [3, 17], [4, 26], [6, 4],
    [6, 28], [7, 23], [9, 2], [10, 7], [10, 28], [12, 17], [12, 24],
  ];
  const worlds = new Set(dates1920.map(([m, dd]) => worldOn(d, 1920, m, dd).join('|')));
  assert.ok(
    worlds.size >= 5,
    `1920 must expose at least 5 distinct worlds through its own transition dates; got ${worlds.size}`,
  );
  // the July-1 sample saw exactly one of them
  assert.equal(
    new Set([worldJul1Old(d, 1920).join('|')]).size, 1,
    'sanity: the old rule had exactly one world for 1920',
  );
  // ⚠ and every reachable instant must still be a WORLD. An off-by-one in the inclusive end test
  // would empty the map on the changeover days rather than fail loudly.
  for (const [m, dd] of dates1920) {
    const n = worldOn(d, 1920, m, dd).length;
    assert.ok(n > 100, `1920-${m}-${dd} drew ${n} entities — an epoch must never empty the map`);
  }
});

test('R421 #6 day-exactness is real at events whose date is not July', () => {
  const d = cshapes();
  const has = (y, m, dd, name) => worldOn(d, y, m, dd).includes(name);
  // German reunification took effect 1990-10-03. A yearly selector cannot express this at all.
  assert.ok(has(1990, 10, 2, 'German Democratic Republic'), 'the GDR exists on 1990-10-02');
  assert.ok(!has(1990, 10, 4, 'German Democratic Republic'), 'the GDR is gone on 1990-10-04');
});

test('R421 #7 the transition index is built from the SAME records as the polygons', () => {
  // A second, hand-kept list of dates would drift out of step with the geometry the moment either
  // was edited. The index is derived — both edges of every record — and filtered to the CShapes range.
  assert.match(TB, /function csBounds\(d\)/, 'the boundary index exists');
  assert.match(TB, /for\(const f of d\.feats\)/, 'it is derived from d.feats, not written down');
  assert.match(TB, /_dayAfter\(f\[5\],f\[6\],f\[7\]\)/, 'the day AFTER an end is a boundary too');
  const d = cshapes();
  const set = new Set();
  for (const f of d.feats) {
    set.add(ymd(f[2], f[3], f[4]));
    const t = new Date(Date.UTC(f[5], f[6] - 1, f[7]));
    t.setUTCDate(t.getUTCDate() + 1);
    set.add(ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()));
  }
  const inRange = [...set].filter((k) => k >= ymd(1886, 1, 1) && k <= ymd(2019, 12, 31));
  assert.ok(
    inRange.length > 300,
    `the shipped bundle must expose 300+ border-change days; got ${inRange.length}`,
  );
  // and the point of the whole round: far more instants than years
  assert.ok(inRange.length > 134 * 2, 'there must be far more transition days than calendar years');
});

test('R421 #8 the cache is keyed by EPOCH, so a quiet decade re-renders nothing', () => {
  // Keying by the requested date would build a FeatureCollection per day scrubbed and defeat the
  // "did anything change?" short-circuit that makes dragging the slider cheap.
  assert.match(TB, /function csEpoch\(d,y,m,dd\)/, 'the epoch resolver exists');
  assert.match(TB, /key='cs'\+csEpoch\(d,year,mon,day\)/, 'the cache key is the epoch, not the date');
  const d = cshapes();
  // two dates inside one epoch must produce the same world (this is what the key asserts)
  assert.equal(
    worldOn(d, 1920, 10, 28).join('|'),
    worldOn(d, 1920, 11, 5).join('|'),
    '1920-11-05 is inside the epoch that began 1920-10-28',
  );
});

test('R421 #9 the stepper is wired to the module that owns the dates', () => {
  const NT = read('js/news-timeline.js');
  const HTML = read('index.html');
  const CSS = read('css/intmap.css');
  // markup, style and wiring all present — a control missing any one of them is invisible or inert
  assert.match(HTML, /id="ntl-bstep-prev"/, 'the previous-change button exists');
  assert.match(HTML, /id="ntl-bstep-next"/, 'the next-change button exists');
  assert.match(HTML, /id="ntl-bstep-lbl"/, 'the readout exists');
  assert.match(CSS, /\.ntl-bstep\{/, 'the row is styled');
  assert.match(NT, /bStepPrev\.onclick=\(\)=>_bsStep\(-1\)/, 'previous is wired');
  assert.match(NT, /bStepNext\.onclick=\(\)=>_bsStep\(1\)/, 'next is wired');
  // ⚠ it must ask IntMapTimeBorders, never carry its own copy of the dates
  assert.match(NT, /TB\.changeBefore\(st\.when\)/, 'previous asks the border module');
  assert.match(NT, /TB\.changeAfter\(st\.when\)/, 'next asks the border module');
  // ⚠ DATA, not prose — a comment may name a date as an example; a second LIST of them is the drift
  // this forbids. A copied index would show up as YYYYMMDD literals or as a reach into the bundle.
  assert.ok(
    !/\b(?:18|19|20)\d{6}\b/.test(NT.replace(/\/\*[\s\S]*?\*\//g, '')),
    'the timeline must not hold border dates of its own (no YYYYMMDD literals outside comments)',
  );
  assert.ok(!/__CSHAPES|csBounds/.test(NT), 'and it must not reach into the bundle directly');
  // and the API it calls must actually be exported
  for (const fn of ['changeAfter', 'changeBefore', 'changeAt', 'changeDates']) {
    assert.ok(new RegExp(`\\b${fn}\\b`).test(TB), `IntMapTimeBorders must export ${fn}`);
  }
  assert.match(TB, /changeAfter, changeBefore, changeAt, changeDates, range:/, 'exported on the public surface');
});

test('R421 #10 the stepper writes the MASTER clock, like every other input in the panel', () => {
  const NT = read('js/news-timeline.js');
  // Setting the borders directly would desynchronise them from news, statistics and the climate era.
  assert.match(NT, /window\.IntMapTime\.set\(d,\{source:'ui'\}\)/, 'it writes IntMapTime');
  assert.ok(
    !/IntMapTimeBorders\.(_go|_clear)\s*\(/.test(NT),
    'the panel must not drive the border renderer behind the clock’s back',
  );
});

test('R421 #11 the stepper says its words in all nine languages', () => {
  const NT = read('js/news-timeline.js');
  // the five positional slots
  assert.match(NT, /L5\('Previous border change','前の国境変更'/, 'previous has its five');
  assert.match(NT, /L5\('Next border change','次の国境変更'/, 'next has its five');
  // and the four that live in the inline tables
  for (const lg of ['fr', 'ko', 'zh', 'zh-hans']) {
    const t = read(`js/locales/ui.${lg}.js`);
    for (const k of ['Next border change', 'Previous border change']) {
      const m = t.match(new RegExp(`['"]${k}['"]:\\s*["']([^"']+)["']`));
      assert.ok(m, `${lg} must carry "${k}"`);
      assert.notEqual(m[1], k, `${lg}'s "${k}" must not still be the English string`);
    }
  }
});

test('R421 #13 whenStyleReady() is DEFINED in the file that calls it', () => {
  // ⚠ It was called four times and defined nowhere. It lives in js/data-layers.js as a module-local
  // function; #R163 moved this file out of the index.html closure where that name used to resolve, so
  // every call site threw ReferenceError — measured at 6 uncaught rejections per boot. Three of the
  // four sites sit inside try{}catch(_){}, which is precisely why nobody saw it: the catch swallowed
  // the ReferenceError and the missing repaint looked like "no retry was needed".
  // This is #R140's fix for 「歴史的国境が表示されない・再読み込みで治る」, so its absence is not a smaller
  // safety net — it is none, and the day-exact borders of this round depend on the same retry.
  assert.match(TB, /function whenStyleReady\(\)/, 'the function must be defined in js/time-borders.js');
  const calls = (TB.match(/whenStyleReady\(\)/g) || []).length;
  assert.ok(calls >= 4, `all call sites must remain; found ${calls}`);
  // it must resolve on THIS file's own predicate — a second notion of "can I draw" is how they drift
  const body = TB.slice(TB.indexOf('function whenStyleReady()'));
  const end = body.indexOf('\n  }');
  assert.match(body.slice(0, end), /_imCanDraw\(\)/, 'it must be built on _imCanDraw()');
  // and it must hard-resolve rather than hang for ever (the #R41 lesson the canonical one records)
  assert.match(body.slice(0, end), /n\+\+>40/, 'it must give up waiting and resolve anyway');
});

test('R421 #14 the Atlas catalogue no longer tells the planner to round to a year', () => {
  // #R115/#R231: what the catalogue does not describe does not exist for the planner. The behaviour
  // changed, so the description had to. Without this the planner keeps emitting bare years and the
  // day-exact borders are unreachable through Atlas for anyone who asks in words.
  const CAT = read('js/atlas-catalog-text.js');
  assert.match(CAT, /HISTORICAL BORDERS ARE DAY-EXACT/, 'the catalogue states the precision');
  assert.match(CAT, /"date":"1920-10-28"/, 'and shows the planner a worked example');
});
