/* ============================================================================
 *  nightly-deep-regressions — two readers that stopped before they had seen the answer
 * ----------------------------------------------------------------------------
 *  ① scripts/deep-history.mjs — the nightly deep tier read as a HISTORY. One night cannot tell a
 *     regression from a wobble; the classifier is evaluated here on nights built the way Playwright
 *     writes its summary, including the job-log shape it is parsed from.
 *  ② js/volume3d.js chaseGround — the 3-D volume's ground reading used to stop after 16 polls or
 *     after two agreeing reads, and two zeros from a DEM that had not arrived yet «agreed»
 *     (measured: r170 «3-D volume» 3/3 locally, red in the nightly). The module is CONSTRUCTED
 *     here against an engine whose events and elevation the test drives, so what is asserted is
 *     what the tool does when a tile arrives late — not what its source says.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSummary, normaliseId, classify, windowNights, STREAK } from '../scripts/deep-history.mjs';

/* ── ① the summary a job log ends with ─────────────────────────────────────────────────────── */
const LOG = [
  '2026-09-29T21:52:59.1716939Z         at /home/runner/work/IntMap/IntMap/tests/r203.spec.js:171:41',
  '2026-09-29T21:52:59.1726300Z ',
  '2026-09-29T21:52:59.1726488Z   1 failed',
  '2026-09-29T21:52:59.1727590Z     [chromium] › tests/r170.spec.js:122:1 › Measure ▸ 3-D volume draws a real-scale box and honours the typed altitudes ',
  '2026-09-29T21:52:59.1728483Z   1 flaky',
  '2026-09-29T21:52:59.1729694Z     [chromium] › tests/r203.spec.js:123:1 › R203 ③ the space crossing hands the Earth over at the same size and face, both ways ───',
  '2026-09-29T21:52:59.1731321Z   109 passed (18.4m)',
  '2026-09-29T21:52:59.7396324Z ##[error]Process completed with exit code 1.',
].join('\n');

test('① the summary is read as Playwright wrote it: failed and flaky apart, keyed by file and title', () => {
  const s = parseSummary(LOG);
  assert.deepEqual(s.failed, ['tests/r170.spec.js › Measure ▸ 3-D volume draws a real-scale box and honours the typed altitudes']);
  assert.deepEqual(s.flaky, ['tests/r203.spec.js › R203 ③ the space crossing hands the Earth over at the same size and face, both ways']);
  /* the same test after an edit above it moved it — and from a Windows run — is ONE test */
  assert.equal(normaliseId('tests\\r203.spec.js:117:1 › R203 ③ x'), normaliseId('tests/r203.spec.js:123:1 › R203 ③ x'));
  /* a log with no summary said nothing about any test — that is null, not «nothing failed» */
  assert.equal(parseSummary('##[error]The job ran out of disk\n'), null);
  assert.deepEqual(parseSummary('2026-01-01T00:00:00.0Z   12 passed (3.1m)\n'), { failed: [], flaky: [] });
});

const night = (day, failed = [], flaky = [], extra = {}) => ({ runId: +day.replace(/-/g, ''), day, conclusion: failed.length ? 'failure' : 'success', read: true, failed, flaky, infra: [], ...extra });

test('① the same test red on the newest night and the one before is a regression; once is not', () => {
  const A = 'tests/a.spec.js › the reported layers', B = 'tests/b.spec.js › a wobble', C = 'tests/c.spec.js › needed its retry';
  const h = classify([night('2026-09-29', [A, B], [C]), night('2026-09-28', [A]), night('2026-09-27', [], [C]), night('2026-09-26', [B])]);
  assert.deepEqual(h.regressions.map((r) => [r.id, r.streak, r.since]), [[A, 2, '2026-09-28']]);
  assert.deepEqual(h.sporadic.map((s) => s.id).sort(), [B, C].sort());
  const c = h.sporadic.find((s) => s.id === C);
  assert.equal(c.failedNights, 0); assert.equal(c.flakyNights, 2);
  assert.equal(STREAK, 2);
});

test('① nine red nights that stopped are not a wobble — and not a live regression either', () => {
  const L = 'tests/l.spec.js › a legend';
  const nights = [night('2026-09-29'), ...Array.from({ length: 9 }, (_, i) => night(`2026-09-${String(28 - i).padStart(2, '0')}`, [L]))];
  const h = classify(nights);
  assert.deepEqual(h.regressions, []);
  assert.deepEqual(h.sporadic, []);
  assert.equal(h.mended.length, 1); assert.equal(h.mended[0].longest, 9);
});

test('① a night that could not be read neither extends a streak nor breaks it, and is said', () => {
  const A = 'tests/a.spec.js › x';
  const h = classify([night('2026-09-29', [A]), { ...night('2026-09-28'), read: false, why: '中断（何も証明していない）' }, night('2026-09-27', [A])]);
  assert.deepEqual(h.regressions.map((r) => r.streak), [2], 'the cancelled night between two red ones is skipped, not read as green');
  assert.equal(h.read, 2); assert.equal(h.nights, 3);
  assert.deepEqual(h.unread.map((u) => u.day), ['2026-09-28']);
});

test('① the window is the report retention, read from the action — not restated', () => {
  const yml = readFileSync(new URL('../.github/actions/browser-tier/action.yml', import.meta.url), 'utf8');
  const n = windowNights(yml);
  assert.ok(Number.isInteger(n) && n > 0, 'the «Upload Playwright report» step states a retention');
  assert.equal(windowNights(yml.replace(/(name: Upload Playwright report[\s\S]*?retention-days:\s*)\d+/, '$1 3')), 3);
});

/* ── ② the ground under a 3-D volume ──────────────────────────────────────────────────────── */
function fakeEngine() {
  const subs = new Map();
  const E = {
    elev: 0, ranges: {}, terrainSource: 'terrain-dem',
    listeners: () => [...subs.values()].reduce((n, s) => n + s.size, 0),
    emit(ev, e = {}) { for (const fn of [...(subs.get(ev) || [])]) fn(e); },
    events: { on: (ev, fn) => { (subs.get(ev) || subs.set(ev, new Set()).get(ev)).add(fn); }, off: (ev, fn) => { const s = subs.get(ev); if (s) s.delete(fn); }, once() {} },
    canDraw: () => true, can: () => false,
    coords: { terrainElevation: () => E.elev },
    scene: { getTerrain: () => ({ source: E.terrainSource }) },
    layers: {
      hasSource: () => true, addSource() {}, has: () => true, add() {}, addExtrusion: () => true, setSourceData() {},
      setExtrusionRange: (id, b, t) => { E.ranges[id] = [b, t]; return true; }, setPaint() {}, setVisible() {}, isVisible: () => true,
    },
  };
  return E;
}
/* the language picker is not the subject: the English string is enough for a body's default name */
globalThis.window = { IntMapModules: {}, IntMapLang: { pick: () => (...forms) => forms[0] } };
await import('../js/volume3d.js');
const make = () => {
  const E = fakeEngine();
  window.IntMapGeoEngine = E;
  const HOST = { terrain3D: true, hasTurf: () => false, ringArea: () => 0, lang: 'en' };
  const V = window.IntMapModules.volume3d(HOST);
  return { E, V, HOST };
};
const SQUARE = [[138.70, 35.30], [138.80, 35.30], [138.80, 35.40], [138.70, 35.40]];

test('② two zeros from a DEM that has not arrived do not end the reading — the tile does', () => {
  const { E, V } = make();
  V.setRing(SQUARE);
  V.setAltitudes(5000, 8000);
  assert.equal(V.state().ground, 0, 'the first read, before the tile: 0 (which is also sea level)');
  /* what used to end it: consecutive agreeing reads, then a poll count. Neither is a fact about the DEM. */
  for (let i = 0; i < 40; i++) E.emit('render');
  assert.equal(V.state().groundState, 'reading', 'still waiting for the terrain source, however many frames passed');
  /* the tile arrives much later */
  E.elev = 3666;
  E.emit('sourcedata', { sourceId: 'terrain-dem', isSourceLoaded: true });
  E.emit('render');
  const st = V.state();
  assert.equal(st.ground, 3666, 'the late tile is read');
  assert.equal(st.groundState, 'read');
  assert.deepEqual(E.ranges['imv3d-vol'], [5000 - 3666, 8000 - 3666], 'and the box is compensated by it');
});

test('② the chase follows the TERRAIN source only, re-arms on a new tile, and stands down with terrain off', () => {
  const { E, V, HOST } = make();
  V.setRing(SQUARE);
  E.elev = 1200;
  E.emit('sourcedata', { sourceId: 'terrain-dem', isSourceLoaded: true }); E.emit('render');
  assert.equal(V.state().ground, 1200);
  /* a tile of another source is not the ground's business */
  E.elev = 1500;
  E.emit('sourcedata', { sourceId: 'ofm', isSourceLoaded: true }); E.emit('render');
  assert.equal(V.state().ground, 1200);
  /* a finer tile of the terrain source (the camera moved) is */
  E.emit('sourcedata', { sourceId: 'terrain-dem', isSourceLoaded: true }); E.emit('render');
  assert.equal(V.state().ground, 1500);
  /* the source id is asked of the renderer each time (js/terrain-water.js swaps it) */
  E.terrainSource = 'terrain-water-dem'; E.elev = 1700;
  E.emit('sourcedata', { sourceId: 'terrain-water-dem', isSourceLoaded: true }); E.emit('render');
  assert.equal(V.state().ground, 1700);
  assert.ok(E.listeners() > 0);
  HOST.terrain3D = false;
  E.emit('render');
  assert.equal(E.listeners() <= 2, true, 'only the module\'s own styledata/terrain wiring is left');
  assert.equal(V.state().groundState, 'off');
});

test('② an upstream failure reported by the renderer is a failure in state(), not «still reading» or «sea level»', () => {
  const { E, V } = make();
  V.setRing(SQUARE);
  E.emit('error', { sourceId: 'terrain-dem', error: { message: 'HTTP 503' } });
  E.emit('error', { sourceId: 'ofm', error: { message: 'not mine' } });
  assert.equal(V.state().groundError, 'HTTP 503');
  E.emit('sourcedata', { sourceId: 'terrain-dem', isSourceLoaded: true }); E.emit('render');
  assert.equal(V.state().groundState, 'read', 'every tile has answered — one of them with a failure, which stays stated');
  assert.equal(V.state().groundError, 'HTTP 503');
});

test('② a saved body with no draft beside it is re-read when its tile arrives', () => {
  const { E, V } = make();
  V.setRing(SQUARE);
  V.setAltitudes(5000, 8000);
  V.commit('A');                 /* the draft goes; only the saved body is left */
  assert.equal(V.list()[0].ground, 0);
  E.elev = 2500;
  E.emit('sourcedata', { sourceId: 'terrain-dem', isSourceLoaded: true }); E.emit('render');
  assert.equal(V.list()[0].ground, 2500);
});
