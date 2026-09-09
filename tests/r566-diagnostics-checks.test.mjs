/* ============================================================================
 *  IntMap · #R566 — the diagnostics must not be part of what they measure
 * ----------------------------------------------------------------------------
 *  The mobile report's §7: 「診断モード自体が負荷と測定誤差を作っている」. Four separate ways, and
 *  every one of them is a claim about BEHAVIOUR, so nothing below is satisfied by a spelling:
 *
 *    ① `?perf=1` — the on-device HUD — also switched on the census's DETAIL mode, which JSON
 *       .stringify()s the whole payload of every source update. So a reading taken with the
 *       instrument open was not a reading of a plain load. The two switches are separated, and the
 *       test is that JSON.stringify is NOT REACHED in the light arm and IS reached in the full one.
 *    ② the per-id / per-phase tables had no ceiling and their keys are never deleted. The test
 *       drives thousands of distinct ids through the real tally and asserts the table stops growing
 *       WHILE THE TOTALS STAY EXACT — a cap that silently lost counts would be a worse instrument.
 *    ③ the «app layers» A/B restored by showing everything it had collected. The test runs the real
 *       function against a scene where one layer was already hidden, and asserts that layer is still
 *       hidden afterwards.
 *    ④ `sceneStats` deep-copied the whole style once a second for four integers, and its tile count
 *       read a field that no longer exists (0 for every session, indistinguishable from «none»). The
 *       test gives it a renderer whose getStyle() THROWS if it is called, and a renderer that exposes
 *       no tile table at all — the answer must be null, never 0.
 *
 *  ⚠ THE FUNCTIONS ARE EXECUTED, NOT GREPPED (#R505). js/geo-command-log.js is a real ES module and
 *  is imported; the two functions that live inside object literals are lifted out of the file and
 *  driven with fakes, which is the same technique tests/r322-checks.test.mjs uses.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* brace-match a definition starting at `at` and return its text */
function block(src, at, label) {
  assert.ok(at >= 0, `${label} is not in the file any more — the check is stale, not the code`);
  let i = src.indexOf('{', at), depth = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) { end = i + 1; break; } }
  }
  assert.ok(end > 0, `could not find the end of ${label}`);
  return src.slice(at, end);
}

/* ── ① THE HUD'S URL MUST NOT BUY THE EXPENSIVE TABLES ──────────────────────────────────────────── */
const census = await import('../js/geo-command-log.js');

/* build a census as a page with this query string would */
function withSearch(search, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'location');
  const prev = globalThis.location;
  globalThis.location = { search };
  try { return fn(census.makeCommandCensus()); } finally {
    if (had) globalThis.location = prev; else delete globalThis.location;
  }
}

test('R566 ① ?perf=1 counts; only an explicit request buys the per-call string tables', () => {
  const plain = withSearch('', (c) => c.CMD);
  assert.equal(plain.on, false, 'a page that did not ask must not count — it is an instrument, not a feature');
  assert.equal(plain.detail, false, 'and must certainly not build the tables');

  const light = withSearch('?perf=1', (c) => c.CMD);
  assert.equal(light.on, true, '?perf=1 still opens the census — the HUD reads its totals');
  assert.equal(light.detail, false,
    '?perf=1 must NOT buy detail mode: it is the URL a phone is measured under, and detail is O(bytes) per source update');

  for (const q of ['?cmdlog=1', '?cmddetail=1', '?foo=2&cmdlog=1']) {
    const full = withSearch(q, (c) => c.CMD);
    assert.equal(full.on, true, `${q} must switch the census on`);
    assert.equal(full.detail, true,
      `${q} is the explicit request for the tables — scripts/frame-profile.mjs --commands opens ?cmdlog=1 and reads byId/msCall/msCmp out of it`);
  }
});

test('R566 ① the light arm does not serialise a single payload; the full arm does', () => {
  /* the cost detail mode adds is _contentSig: JSON.stringify over the WHOLE collection, per call.
     Counting the calls to the global is the honest way to ask 「did it happen」. */
  const data = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} }] };
  const drive = (search) => withSearch(search, (c) => {
    const log = c.makeCommandLog(), mem = c.makeSourceMemory();
    const src = { _data: { geojson: { type: 'FeatureCollection', features: [] } } };
    const real = JSON.stringify;
    let calls = 0;
    JSON.stringify = function (...a) { calls++; return real.apply(JSON, a); };
    try { for (let i = 0; i < 5; i++) c.skipData(log, 'src-x', src, data, undefined, mem); } finally { JSON.stringify = real; }
    return { calls, read: log.read() };
  });

  const light = drive('?perf=1');
  assert.equal(light.calls, 0,
    '?perf=1 stringified a source payload — the instrument is charging the phone the very cost it was opened to find');
  assert.equal(light.read.totals.sourceData.attempted, 5, 'and the counting the HUD needs still happened');

  const full = drive('?cmdlog=1');
  assert.ok(full.calls > 0,
    'the content hash is the number that decides whether a content-addressed skip is worth building; ?cmdlog=1 must still produce it');
  assert.ok(full.read.totals.sourceData.sameContent > 0, 'and repeats of an identical payload are still recognised by content');
});

/* ── ② THE TABLES ARE BOUNDED, AND THE TOTALS ARE NOT ─────────────────────────────────────────── */
test('R566 ② the per-id and per-phase tables stop growing, say so, and never lose a count', () => {
  const r = withSearch('?cmdlog=1', (c) => {
    const log = c.makeCommandLog();
    for (let i = 0; i < 5000; i++) {
      c.CMD.phase = 'phase-' + i;                     /* a phase is a caller-supplied string, too */
      log.note('paint', 'lyr-' + i, 'applied');
    }
    return { read: log.read(), reset: (log.reset(), log.read()) };
  });

  assert.equal(r.read.totals.paint.attempted, 5000, 'the totals are exact whatever the tables do');
  const cap = r.read.folded.cap;
  assert.ok(cap > 0 && cap < 5000, 'there is a declared ceiling');
  assert.ok(r.read.byId.length <= cap + 1,
    `the per-id table grew past its ceiling (${r.read.byId.length} rows) — that table is never emptied except by reset()`);
  assert.ok(r.read.byPhase.length <= cap + 1, `the per-phase table grew past its ceiling (${r.read.byPhase.length} rows)`);
  assert.ok(r.read.folded.byId > 0 && r.read.folded.byPhase > 0,
    'a cap that truncates silently is worse than no cap: what did not get a row must be reported');

  /* what was folded is still COUNTED — in the overflow row and in the totals */
  const rows = r.read.byId.reduce((n, x) => n + x.attempted, 0);
  assert.equal(rows, 5000, 'every call is in the table, even the ones that share the overflow row');

  assert.equal(r.reset.byId.length, 0, 'reset empties the table');
  assert.equal(r.reset.folded.byId, 0, '…and the overflow counter with it, or the next reading inherits this one');
});

test('R566 ② the source memory is bounded by deletion instead, and the adapter really deletes', () => {
  /* it is NOT capped, and the reason has to keep being true: every key is forgotten when the source
     goes. Both doors in the adapter are asserted, because a cap-free table whose keys are never
     deleted is exactly the defect ② is about. */
  const mem = census.makeCommandCensus().makeSourceMemory();
  mem.sig['src-a'] = 'x'; mem.rev['src-a'] = 1; mem.hash['src-a'] = 'y'; mem.diff['src-a'] = true;
  mem.forget('src-a');
  for (const k of ['sig', 'rev', 'hash', 'diff']) assert.equal(mem[k]['src-a'], undefined, `forget() left ${k} behind`);

  const ge = read('js/geo-engine.js');
  const add = /addSource\(id,d\)\{[^}]*_sd\.forget\(id\)/.test(ge);
  const rem = /removeSource\(id\)\{[^}]*_sd\.forget\(id\)/.test(ge);
  assert.ok(add && rem,
    'addSource/removeSource must forget the id — that deletion is the whole reason this table needs no cap');
});

/* ── ③ THE A/B RESTORES WHAT IT FOUND ─────────────────────────────────────────────────────────── */
function liftLayerSwitch(GE) {
  const src = read('js/perf-hud.js');
  const re = /const APP_LAYER = (\/[^\n]*?\/);/.exec(src);
  assert.ok(re, 'js/perf-hud.js no longer declares the app-layer test as one value');
  const body = block(src, src.indexOf('function setLayersOn('), 'setLayersOn');
  const deps = `const sw={layers:true};const APP_LAYER=${re[1]};let hidden=[];`;
  return new Function('GE', `${deps}\n${body}\nreturn { setLayersOn, snapshot: () => hidden.slice() };`)(GE);
}

function fakeScene(vis) {
  const state = Object.assign({}, vis);
  return {
    state,
    layers: {
      has: (id) => id in state,
      isVisible: (id) => !!state[id],
      setVisible: (id, v) => { if (id in state) state[id] = !!v; },
    },
    render: { sceneStats: () => ({ allIds: Object.keys(state), ids: Object.keys(state).filter((k) => state[k]) }) },
  };
}

test('R566 ③ the layers switch puts every layer back the way it found it', () => {
  const scene = fakeScene({ 'lyr-quakes': true, 'lyr-wind': false, 'dl-news': true, 'basemap-water': true });
  const hud = liftLayerSwitch(() => scene);

  hud.setLayersOn(false);
  assert.deepEqual(scene.state, { 'lyr-quakes': false, 'lyr-wind': false, 'dl-news': false, 'basemap-water': true },
    'the app layers go dark and the basemap is left alone');

  hud.setLayersOn(true);
  assert.deepEqual(scene.state, { 'lyr-quakes': true, 'lyr-wind': false, 'dl-news': true, 'basemap-water': true },
    'lyr-wind was OFF before the switch was touched — turning the switch back on must not turn it on');
});

test('R566 ③ a layer someone else moved while the switch was off is not overwritten', () => {
  const scene = fakeScene({ 'lyr-quakes': true, 'dl-news': true });
  const hud = liftLayerSwitch(() => scene);
  hud.setLayersOn(false);
  scene.state['lyr-quakes'] = true;            /* the reader switched it on in the layer panel */
  delete scene.state['dl-news'];               /* …and this one was removed from the style */
  hud.setLayersOn(true);
  assert.deepEqual(scene.state, { 'lyr-quakes': true },
    'the instrument restores only what it still owns; it does not resurrect a layer that is gone');
  assert.deepEqual(hud.snapshot(), [], 'and it drops its snapshot, so a second A/B measures the current scene');
});

/* ── ④ THE SCENE COUNTS COST NEITHER A STYLE COPY NOR A FALSE ZERO ────────────────────────────── */
function liftSceneStats(_m) {
  const src = read('js/geo-engine.js');
  const body = block(src, src.indexOf('sceneStats(){'), 'sceneStats');
  return new Function('_m', `return function ${body};`)(_m);
}

/* a renderer shaped like the installed maplibre-gl 5.x: public layer order, private tile managers */
function fakeMap({ order = [], hidden = [], tiles = null, held = null, style = null, onGetStyle } = {}) {
  const m = {
    getLayersOrder: order ? () => order.slice() : undefined,
    getLayoutProperty: (id, p) => (p === 'visibility' && hidden.includes(id) ? 'none' : 'visible'),
    style: style || undefined,
    getStyle: onGetStyle,
  };
  if (tiles) {
    m.style = m.style || {};
    m.style.tileManagers = {};
    for (const [src, n] of Object.entries(tiles)) {
      const t = {};
      for (let i = 0; i < n; i++) t['tile' + i] = {};
      m.style.tileManagers[src] = { _inViewTiles: { _tiles: t }, _outOfViewCache: { order: new Array((held && held[src]) || 0).fill(0) } };
    }
  }
  return m;
}

test('R566 ④ the counts are taken from the public API, without serialising the style', () => {
  const map = fakeMap({
    order: ['background', 'lyr-quakes', 'lyr-wind'],
    hidden: ['lyr-wind'],
    tiles: { 'src-basemap': 12, 'src-quakes': 3 },
    held: { 'src-basemap': 40 },
    onGetStyle: () => { throw new Error('getStyle() was called — that is a deep copy of the whole style, once a second, on the phone being measured'); },
  });
  const st = liftSceneStats(() => map)();
  assert.equal(st.via, 'api', 'the fast path must name itself, so a reading can be compared with one taken the other way');
  assert.equal(st.layers, 3);
  assert.equal(st.visible, 2);
  assert.deepEqual(st.ids, ['background', 'lyr-quakes'], 'ids is still the VISIBLE layers — two scripts and the HUD read it');
  assert.deepEqual(st.allIds, ['background', 'lyr-quakes', 'lyr-wind'], 'and every layer is reachable, or a hidden layer cannot be restored');
  assert.equal(st.sources, 2);
  assert.equal(st.tiles, 15, 'tiles in view');
  assert.equal(st.tilesHeld, 40, 'retained out of view — the half the old number could not see');
});

test('R566 ④ a renderer that exposes no tile table gets «unknown», not zero', () => {
  const map = fakeMap({ order: ['a'], onGetStyle: () => ({ layers: [{ id: 'a' }], sources: { s: {} } }) });
  const st = liftSceneStats(() => map)();
  assert.equal(st.tiles, null, 'a count that could not be taken must be null — 0 is a measurement, and gets quoted as one');
  assert.equal(st.tilesVia, 'unknown', 'and it says why');
  assert.equal(st.via, 'style-copy', 'with no tile holder there is no source count either, so the style copy is the honest fallback');
  assert.equal(st.sources, 1);
});

test('R566 ④ the fallback still answers for a renderer without getLayersOrder', () => {
  const map = {
    style: { sourceCaches: { s: { _tiles: { a: {}, b: {} }, _cache: { order: [1] } } } },
    getStyle: () => ({ layers: [{ id: 'a' }, { id: 'b', layout: { visibility: 'none' } }], sources: { s: {} } }),
  };
  const st = liftSceneStats(() => map)();
  assert.equal(st.via, 'style-copy');
  assert.equal(st.layers, 2); assert.equal(st.visible, 1);
  assert.deepEqual(st.ids, ['a']);
  assert.equal(st.tiles, 2); assert.equal(st.tilesHeld, 1);
});

test('R566 ④ the HUD prints an unobtainable quantity as n/a and labels the tile count', () => {
  const src = read('js/perf-hud.js');
  const decl = /const NA = .*;/.exec(src);
  assert.ok(decl, 'js/perf-hud.js no longer declares one formatter for an unobtainable quantity');
  const NA = new Function(decl[0] + '\nreturn NA;')();
  assert.equal(NA(undefined, 'GB'), 'n/a', 'navigator.deviceMemory is undefined on iOS — the platform this HUD exists for');
  assert.equal(NA(null), 'n/a');
  assert.equal(NA(0), '0', 'a real zero is still a zero');
  assert.equal(NA(4, 'GB'), '4GB');

  /* the readout must not go on calling the device's RAM the page's memory, and the tile number must
     say what it counts. Both are what the reader copies out of the HUD into a report. */
  const rows = src.slice(src.indexOf('rows.textContent ='));
  assert.ok(/device RAM/.test(rows) && /not this page/.test(rows),
    'navigator.deviceMemory is the DEVICE\'s RAM, not this page\'s usage — the readout has to say so');
  assert.ok(/NA\(navigator\.deviceMemory/.test(rows), 'and it goes through the n/a formatter');
  assert.ok(/not total memory/.test(rows), 'the tile count is the renderer\'s own caches, not everything the tab holds');
});
