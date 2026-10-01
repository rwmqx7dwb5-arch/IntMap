/* ============================================================================
 *  IntMap · night lights (js/night-lights.js) — consolidated from tests/r550-checks
 *  R550 — the night lights travel with Chronos, and only one thing decides which year
 * ----------------------------------------------------------------------------
 *  「夜間光独自の別時計を新設しないでください。正本は window.IntMapTime。」
 *  「Chronosと凡例セレクトに二つの正本を作らない。どちらが正本かを1か所で決めてください。」
 *  「既存テストを文字列固定で無理やり合わせないでください。可能な限り、実装を実際に動かして
 *    性質を確認してください。」
 *
 *  ⚠ SO js/night-lights.js IS RUN, NOT READ. #R505's lesson is that a check which reads source
 *  cannot see evaluation order and cannot see behaviour; this file imports the shipped module with a
 *  stub clock handed at its import edge (module-graph) and then ASKS IT QUESTIONS — every year from before the sensor existed
 *  to beyond the last epoch, a fake scrub through the gap, a subscriber that counts how often it is
 *  told anything. What is asserted is what the module DOES.
 *
 *  The three seam checks that cannot be run here (the raster source, the canvas mosaic, the legend
 *  text) are properties of a rendered page and live in tests/r201.spec.js instead.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';
import { importModule } from './helpers/import-module.mjs';

/* ⚠ the Atlas state module is RUN here too, the way tests/r534-checks.test.mjs runs it — that
   round's whole defect was a last line that printed the key instead of the value, and only
   evaluating renderPrompt could see it. Doing it here also keeps the browser spec off the 1 MB
   Atlas chunk: loading the kernel to read one sentence measured 10–15 s of the gate's budget. */
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasState } = await import('../js/atlas-state.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/* comments are where the argument lives, so a check that greps for behaviour must not read them */

/* ── the shipped module, in a box with a clock it can move ─────────────────────────────────── */
function clockStub() {
  return {
    _y: null, subs: [],
    isLive() { return this._y == null; },
    year() { return this._y; },
    on(f) { this.subs.push(f); return () => { }; },
    /* what js/chronos.js does on setYear/setNow: write, then tell everybody */
    go(y) { this._y = y; this.subs.forEach((f) => f()); return this; }
  };
}
/* (module-graph) the file imports IntMapTime from js/chronos.js, so the stub clock is handed at that
   import edge; each call evaluates the module afresh and reads what it published on window */
async function loadNL(clock = clockStub()) {
  delete globalThis.window.IntMapNightLights;
  await importModule('js/night-lights.js', { mocks: { 'js/chronos.js': { IntMapTime: clock } } });
  const NL = globalThis.window.IntMapNightLights;
  assert.ok(NL, 'js/night-lights.js must publish window.IntMapNightLights');
  return { NL, clock };
}

/* ── ① the clock picks the epoch, for every year the clock can hold ────────────────────────── */
test('R550 ① every year Chronos can reach resolves to an epoch that exists, or to none at all', async () => {
  const { NL } = await loadNL();
  const ids = NL.epochs().map((e) => e.id);
  assert.ok(ids.length >= 2, `expected the measured epochs, found ${ids.length}`);
  const era = NL.eraFrom();
  for (let y = 1850; y <= 2035; y++) {
    const e = NL.forYear(y);
    if (y < era) { assert.equal(e, null, `${y} is before the sensor existed and must resolve to nothing`); continue; }
    assert.ok(e, `${y} must resolve to an epoch`);
    assert.ok(ids.includes(e.id), `${y} resolved to ${e.id}, which is not one of ${ids.join('/')}`);
  }
});

test('R550 ① …and it is the NEAREST one, which is the whole content of the substitution', async () => {
  const { NL } = await loadNL();
  const years = NL.epochs().map((e) => e.year);
  for (let y = NL.eraFrom(); y <= 2035; y++) {
    const got = NL.forYear(y).year;
    const best = years.reduce((a, b) => (Math.abs(y - b) < Math.abs(y - a) ? b : a), years[0]);
    /* an exact tie is allowed to go either way by "nearest"; the module resolves it to the LATER
       epoch so that one scrub through the gap changes the picture once, in the direction of travel */
    const tie = years.filter((v) => Math.abs(y - v) === Math.abs(y - best));
    assert.ok(Math.abs(y - got) === Math.abs(y - best), `${y} → ${got}, but ${best} is nearer`);
    if (tie.length > 1) assert.equal(got, Math.max(...tie), `${y} is a tie and must take the later epoch`);
  }
  /* the years the brief names, spelled out so the rule is legible rather than merely derived */
  assert.equal(NL.forYear(2013).year, 2012);
  assert.equal(NL.forYear(2014).year, 2016, 'the midpoint resolves forward');
  assert.equal(NL.forYear(2018).year, 2016);
  assert.equal(NL.forYear(2024).year, 2016);
  assert.equal(NL.forYear(2011), null, 'VIIRS had not launched');
});

test('R550 ① live means the most recent record, not «no record»', async () => {
  const { NL, clock } = await loadNL();
  assert.equal(clock.isLive(), true);
  const now = NL.current();
  assert.ok(now, 'a live clock must still show night lights');
  assert.equal(now.year, Math.max(...NL.epochs().map((e) => e.year)));
  assert.equal(NL.state().live, true);
  assert.equal(NL.state().clockYear, null);
});

/* ── ② the clock is the only authority ─────────────────────────────────────────────────────── */
test('R550 ② the epoch is a function of the clock — there is no second place to set it', async () => {
  const { NL, clock } = await loadNL();
  clock.go(2012); assert.equal(NL.current().year, 2012);
  clock.go(2020); assert.equal(NL.current().year, 2016);
  clock.go(1990); assert.equal(NL.current(), null);
  clock.go(null); assert.equal(NL.current().year, 2016);
  /* the module exposes no setter of any kind — if it did, the legend could disagree with Chronos */
  for (const k of Object.keys(NL)) assert.ok(!/^(set|pin|select|use)/i.test(k), `${k} would be a second authority`);
});

test('R550 ② …and nothing else in the app spells a night-lights epoch any more', () => {
  /* ⚠ the fact, not the spelling: «how many files decide which year of Black Marble is drawn».
     #R550 found THREE (the layer, the globe, the compare window) and the defect that follows from
     three is that one of them gets fixed. The answer must be exactly one file. */
  const owners = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'js'))) {
    if (!f.endsWith('.js')) continue;
    const src = codeOnly(rd(path.join('js', f)));
    if (/Black_Marble|Black Marble/.test(src) && /\b20\d{2}-01-01\b/.test(src)) owners.push(f);
  }
  assert.deepEqual(owners, ['night-lights.js'],
    `exactly one file may decide the night-lights year; found ${owners.join(', ') || 'none'}`);
});

/* ── ③ a year change inside one epoch costs nothing ────────────────────────────────────────── */
test('R550 ③ subscribers hear about EPOCHS, so scrubbing within one re-points nothing', async () => {
  const { NL, clock } = await loadNL();
  let calls = 0; NL.on(() => { calls++; });
  clock.go(2017); const afterFirst = calls;
  clock.go(2018); clock.go(2019); clock.go(2020); clock.go(2021);
  assert.equal(calls, afterFirst, 'five years inside the 2016 epoch must announce nothing after the first');
  clock.go(2012);
  assert.equal(calls, afterFirst + 1, 'crossing into the other epoch must announce exactly once');
  clock.go(2013);
  assert.equal(calls, afterFirst + 1, '…and 2013 is still that epoch');
  clock.go(1900);
  assert.equal(calls, afterFirst + 2, 'falling off the front of the record is a change too');
});

/* ── ④ the 2012 / 2016 URLs are byte-for-byte the ones #R268 shipped ───────────────────────── */
test('R550 ④ the existing GIBS path is unchanged — same product, same level, same URL', async () => {
  const { NL } = await loadNL();
  /* this is what js/data-layers.js's `gibs('VIIRS_Black_Marble',8,'png',epoch)` produced before this
     round. Written out rather than re-derived, because the point is that the QUALITY PATH did not
     move: any drift in host, product, tile matrix or extension changes the pixels on screen. */
  const expect = (d) => 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/' + d +
    '/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png';
  for (const e of NL.epochs()) {
    /* the VALUE is what is being asserted: one template, spelled exactly */
    assert.equal(NL.tiles(e).length, 1, `${e.id}: one template`);
    assert.equal(NL.tiles(e)[0], expect(e.id), `${e.id}: the tile template must not have moved`);
    assert.equal(NL.maxzoom(e), 8, 'GoogleMapsCompatible_Level8 — z9 answers HTTP 400');
    assert.equal(e.resM, 500, 'Black Marble is a 500 m product and the legend says so');
  }
  /* the globe's mosaic asks for its tiles through the same builder, so the browser cache serves both */
  assert.equal(NL.tileURL(3, 5, 2, '2016-01-01'),
    'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/3/2/5.png');
});

/* ── ⑤ no data and a failed fetch are different states ─────────────────────────────────────── */
test('R550 ⑤ «before the sensor» is a state of its own, and it is not an error', async () => {
  const { NL, clock } = await loadNL();
  clock.go(1975);
  const st = NL.state();
  assert.equal(st.epoch, null);
  assert.equal(st.year, null);
  assert.equal(st.clockYear, 1975);
  assert.equal(st.matches, false);
  assert.equal(NL.tiles().length, 0, 'nothing may be asked for when there is nothing to ask for');
  /* and the layer keeps the two apart: a separate flag, set by the renderer's own error event.
     ⚠ READ, NOT RUN: that flag lives inside js/data-layers.js's renderer wiring, which needs a live map. */
  const dl = codeOnly(rd('js/data-layers.js'));
  assert.match(dl, /_nightsatErr/, 'a fetch failure needs a representation of its own');
  assert.match(dl, /events\.on\('error'[\s\S]{0,160}src-nightsat/,
    'and it must come from the renderer, not from an empty picture');
});

/* ── ⑥ the module is inert: it knows URLs, it never fetches ────────────────────────────────── */
test('R550 ⑥ turning the layer off can cost nothing, because this module never touches the network', async () => {
  const src = codeOnly(rd('js/night-lights.js'));
  for (const bad of ['fetch(', 'XMLHttpRequest', 'new Image', 'importScripts', 'navigator.sendBeacon']) {
    assert.ok(!src.includes(bad), `js/night-lights.js must not ${bad}`);
  }
  /* proved by construction too: it loaded and answered with no fetch, no DOM and no Image */
  const { NL, clock } = await loadNL();
  clock.go(2016);
  assert.equal(NL.current().id, '2016-01-01');
});

/* ── ⑦ the state a reader (and Atlas) is shown names both years ────────────────────────────── */
test('R550 ⑦ the published state distinguishes the clock year from the data year', async () => {
  const { NL, clock } = await loadNL();
  clock.go(2016);
  let st = NL.state();
  assert.equal(st.matches, true, '2016 asks for 2016 and gets it');
  clock.go(2020);
  st = NL.state();
  assert.equal(st.clockYear, 2020);
  assert.equal(st.year, 2016);
  assert.equal(st.matches, false, 'a substitution must be visible in the state, not smoothed over');
  assert.equal(st.product, 'VIIRS Black Marble');
  assert.ok(/VIIRS/.test(st.sensor) && /NASA/.test(st.source), 'sensor and source are shown to the reader');
});

/* ⚠ AND ATLAS IS HANDED THAT, NOT THE CLOCK'S YEAR — checked by RUNNING js/atlas-state.js.
   「Atlasが現在epochを認識できる」 fails silently if the sentence names the clock year: the reply
   would be fluent, confident and about a photograph that does not exist. */
test('R550 ⑦b Atlas is told the year of the IMAGE, and never the year of the clock', () => {
  const S = makeAtlasState();
  const line = (nightLights) => S.renderPrompt({ time: { live: false, travelDate: '2020-06-15', nightLights } });
  const sub = line({ epoch: '2016-01-01', dataYear: 2016, clockYear: 2020, matches: false,
                     product: 'VIIRS Black Marble', sensor: 'VIIRS / Suomi NPP', source: 'NASA EOSDIS GIBS',
                     eraFrom: 2012, shownBy: 'layer' });
  assert.match(sub, /Night lights on screen/, 'the fact must reach the prompt at all');
  assert.match(sub, /VIIRS Black Marble 2016/, 'the DATA year is what is named');
  assert.match(sub, /NEAREST published epoch/, 'and the substitution is stated, not hidden');
  assert.match(sub, /never the clock year/, 'with the instruction that stops it being reported as 2020');

  const agree = line({ epoch: '2016-01-01', dataYear: 2016, clockYear: 2016, matches: true,
                       product: 'VIIRS Black Marble', sensor: 'VIIRS / Suomi NPP', source: 'NASA EOSDIS GIBS',
                       eraFrom: 2012, shownBy: 'layer+globe' });
  assert.match(agree, /the clock year and the data year agree/, 'and when they agree it says so');
  assert.doesNotMatch(agree, /NEAREST/, 'without inventing a substitution that did not happen');

  const none = line({ epoch: null, dataYear: null, clockYear: 1900, matches: false, eraFrom: 2012, shownBy: 'layer' });
  assert.match(none, /Night lights: NO DATA/, 'no record is its own sentence');
  assert.match(none, /no satellite night-lights record exists before 2012/, '…and it says why');
  assert.doesNotMatch(none, /on screen/, 'nothing is on screen, so nothing is described');

  /* ⚠ and a section nobody published stays SILENT — «absent» is not «none on screen» (#R413 ③) */
  assert.equal(S.renderPrompt({ time: { live: true, travelDate: null } }).includes('Night lights'), false,
    'a build that never published the fact must not be given a sentence about it');
});

/* the provider half: it reads the one owner, and only when something is actually showing it */
test('R550 ⑦c the provider publishes the epoch only while it is on screen', async () => {
  const S = makeAtlasState();
  const clock = clockStub();
  const prev = { w: globalThis.window.IntMapTime, nl: globalThis.window.IntMapNightLights,
                 ns: globalThis.window.IntMapNightSide, doc: globalThis.document };
  try {
    const { NL } = await loadNL(clock);
    globalThis.window.IntMapTime = clock;
    globalThis.window.IntMapNightLights = NL;
    globalThis.window.IntMapNightSide = { state: () => ({ built: false }) };
    let checked = false;
    globalThis.document = { getElementById: (id) => (id === 'dl-nightsat' ? { checked } : null) };

    S.registerDefaultProviders({});   /* the `time` section has an owner only once this has run */
    clock.go(2020);
    assert.equal(S.snapshot().time.nightLights, undefined,
      'nothing is showing night lights, so nothing is claimed about them');

    checked = true;
    const on = S.snapshot().time.nightLights;
    assert.ok(on, 'with the layer on, the epoch must reach Atlas');
    assert.equal(on.dataYear, 2016);
    assert.equal(on.clockYear, 2020);
    assert.equal(on.matches, false);
    assert.equal(on.shownBy, 'layer');

    /* the globe alone is enough — it draws the same product without the layer being on */
    checked = false;
    globalThis.window.IntMapNightSide = { state: () => ({ built: true }) };
    const globe = S.snapshot().time.nightLights;
    assert.ok(globe, 'the night side shows it too, and Atlas is looking at the same map');
    assert.equal(globe.shownBy, 'globe');
  } finally {
    globalThis.window.IntMapTime = prev.w;
    globalThis.window.IntMapNightLights = prev.nl;
    globalThis.window.IntMapNightSide = prev.ns;
    if (prev.doc === undefined) delete globalThis.document; else globalThis.document = prev.doc;
  }
});

/* ── ⑧ the globe and the layer cannot disagree ─────────────────────────────────────────────── */
test('R550 ⑧ the night side takes its year from the same place, and discards a late mosaic', () => {
  /* ⚠ READ, NOT RUN: js/night-side.js builds its mosaic on a canvas for the Cesium/MapLibre night side;
     the stale-mosaic guard only exists inside that asynchronous canvas path. */
  const ns = codeOnly(rd('js/night-side.js'));
  assert.ok(!/VIIRS_Black_Marble\/default\/20/.test(ns), 'the date must no longer be spelled in the URL');
  assert.match(ns, /IntMapNightLights\.tileURL\(/, 'the mosaic asks the one owner for its tiles');
  assert.match(ns, /lightsEpoch/, 'and it remembers which year the mosaic in hand IS');
  /* the stale guard is compared at COMPLETION — a captured value would be the defect itself */
  assert.match(ns, /const now=nlEpoch\(\);[\s\S]{0,220}if\(now\.id!==want\) return loadLights\(z\);/,
    'a mosaic that finished after the epoch moved must be discarded, and the current one fetched');
  assert.match(ns, /IntMapNightLights\.on\([\s\S]{0,120}if\(!built\) return;/,
    'and nothing is fetched while the effect is not on screen');
});
