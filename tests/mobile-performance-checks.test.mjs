/* ============================================================================
 *  mobile-performance — the phone's start-up, in stages, and what it reads
 * ----------------------------------------------------------------------------
 *  「スマホのパフォーマンスと UI を改善して」→「修正じゃなくて作り変え」. Measured before (390×844,
 *  CPU ×4): interactive at 10.3 s locally (9.7–10.8 s in production), 8.2 MB read before the launch
 *  screen lifted. The pieces below are checked by RUNNING them, not by reading their source:
 *
 *   ① js/boot-stage.js — on a phone a `settled` read waits for the launch screen to lift AND an idle
 *      period, and two settled reads take two idle periods; every other device reads at `boot`.
 *   ② scripts/perf-budget.mjs bootPlanFrom() — a `data/` file named by a start-up module with no plan
 *      row fails; a row naming no shipped file fails; a `boot` row's bytes are the phone rows.
 *   ③ js/ne-countries.js — the shipped Natural Earth files decode to the upstream FeatureCollection
 *      shape, losslessly (round trip), and the offline --check of the builder passes.
 *   ④ js/geo-engine.js — a new CJK face drops only the glyphs the browser drew and keeps every glyph
 *      that came from a downloaded range: no second request for the same range.
 *   ⑤ the deferred readers ask the plan: gazetteer, star sky, World Bank refresh, country warm-up.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* js/boot-stage.js evaluated in a fresh global per case — its IIFE keeps one instance per global */
function bootStage({ phone, done = false } = {}) {
  const src = read('js/boot-stage.js').replace(/^export const BootStage[^\n]*$/m, '');
  const idles = [];
  const g = {
    setTimeout, clearTimeout, Promise, URL, decodeURIComponent,
    requestIdleCallback: (fn) => { idles.push(fn); return idles.length; },
    IntMapDevice: { phoneBudget: () => !!phone },
  };
  let isDone = done; const ended = [];
  g.__imBoot = { isDone: () => isDone, done: (why) => { isDone = true; ended.push(why); } };
  g.globalThis = g;
  vm.runInNewContext(src, g);
  return { S: g.__imBootStage, g, idles, ended, runIdle: () => { const fn = idles.shift(); if (fn) fn({ timeRemaining: () => 10 }); return !!fn; } };
}
const tick = () => new Promise((r) => setImmediate(r));

test('① a phone reads a `settled` row after the launch screen lifts and an idle period; other devices at once', async () => {
  const phone = bootStage({ phone: true });
  assert.equal(phone.S.stageOf('stars'), 'settled');
  assert.equal(phone.S.stageOf('world-basemap'), 'boot');
  let read = false;
  phone.S.at('stars').then(() => { read = true; });
  await tick(); phone.runIdle(); await tick();
  assert.equal(read, false, 'the star catalogue was released before the launch screen lifted');
  phone.g.__imBoot.done('idle');                 /* js/app-body.js ends the boot through this call */
  await tick();
  assert.equal(phone.ended[0], 'idle', 'the wrapped done() no longer reaches index.html\'s own');
  assert.equal(read, false, 'released in the same task the launch screen lifted in — it must wait for an idle period');
  while (!read && phone.runIdle()) await tick();
  assert.equal(read, true, 'never released after the launch screen lifted and the thread went idle');

  const other = bootStage({ phone: false });
  assert.equal(other.S.stageOf('stars'), 'boot');
  let now = false; other.S.at('stars').then(() => { now = true; }); await tick();
  assert.equal(now, true, 'a desktop waited — every other device keeps the schedule it had');
});

test('① two settled reads take two idle periods, in the order they were asked', async () => {
  const p = bootStage({ phone: true, done: true });
  const order = [];
  p.S.at('stars').then(() => order.push('stars'));
  p.S.at('gazetteer').then(() => order.push('gazetteer'));
  await tick();
  /* the first idle period ends «settled» and releases the first read; the next releases the second */
  assert.equal(p.runIdle(), true); await tick();
  assert.deepEqual(order, ['stars'], 'two settled reads were released by one idle period — they stack again');
  assert.equal(p.runIdle(), true); await tick();
  assert.deepEqual(order, ['stars', 'gazetteer']);
});

test('① a settled JOB holds the queue until it settles — the next read does not stack its arrival on it', async () => {
  const p = bootStage({ phone: true, done: true });
  const order = []; let finish;
  const first = p.S.at('stars', () => { order.push('stars:start'); return new Promise((r) => { finish = r; }); });
  p.S.at('gazetteer', () => { order.push('gazetteer:start'); return 7; }).then((v) => order.push('gazetteer:' + v));
  await tick(); p.runIdle(); await tick();
  assert.deepEqual(order, ['stars:start']);
  while (p.runIdle()) await tick();
  assert.deepEqual(order, ['stars:start'], 'the next settled job started while the first was still running');
  finish('done');
  assert.equal(await first, 'done', 'at() does not hand back the job\'s result');
  await tick();
  while (order.length < 3 && p.runIdle()) await tick();
  assert.deepEqual(order, ['stars:start', 'gazetteer:start', 'gazetteer:7']);
});

test('① a need row is never released by the stage — the reader\'s own call is the need', async () => {
  const p = bootStage({ phone: true, done: true });
  let r = false; p.S.at('cshapes').then(() => { r = true; }); await tick();
  assert.equal(p.S.stageOf('cshapes'), 'need');
  assert.equal(r, true, '`need` must not hold back a read a reader asked for');
});

test('② the plan is complete for the start-up graph, and a row names something shipped', async () => {
  const { bootPlanFrom } = await import('../scripts/perf-budget.mjs');
  const { BootStage } = await import('../js/boot-stage.js');
  const dir = mkdtempSync(join(tmpdir(), 'im-bootplan-'));
  try {
    mkdirSync(join(dir, 'js'), { recursive: true });
    mkdirSync(join(dir, 'dist', 'data'), { recursive: true });
    writeFileSync(join(dir, 'js', 'a.js'), "/* data/in-a-comment.json is not read */ load('data/stars.bin'); load('data/brand-new.json');");
    for (const r of BootStage.plan()) if (r.path && r.shipped !== false) {
      const f = r.path.endsWith('/') ? r.path + 'x.bin' : (/\.[a-z]+$/.test(r.path) ? r.path : r.path + 'x.json');
      mkdirSync(join(dir, 'dist', dirname(f)), { recursive: true }); writeFileSync(join(dir, 'dist', f), 'xx');
    }
    const report = { eager: { chunks: ['m.js'] }, chunks: { 'm.js': { modules: { 'js/a.js': 10 } } } };
    const res = bootPlanFrom(report, join(dir, 'dist'), dir, BootStage);
    assert.equal(res.errors.length, 1, res.errors.join('\n'));
    assert.match(res.errors[0], /data\/brand-new\.json is reachable from the start-up graph/);
    assert.ok(!res.errors.some((e) => /in-a-comment/.test(e)), 'a file named in a comment was taken for a read');
    const boot = BootStage.plan().filter((r) => r.phone === 'boot' && r.path);
    assert.equal(res.requests, boot.length);
    assert.equal(res.bytes, boot.length * 2);
    rmSync(join(dir, 'dist', 'data', 'stars.bin'));
    const gone = bootPlanFrom(report, join(dir, 'dist'), dir, BootStage);
    assert.ok(gone.errors.some((e) => /row "stars" .* names no file in dist/.test(e)), 'a row naming nothing passed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('② the shipped start-up graph is fully declared (against the last build, when there is one)', async (t) => {
  const { bootPlanFrom } = await import('../scripts/perf-budget.mjs');
  let r; try { r = JSON.parse(read('.perf/build-report.json')); } catch (_) { t.skip('no .perf/build-report.json — build first'); return; }
  const res = bootPlanFrom(r, join(ROOT, 'dist'));
  /* a stale dist/ can lack a file a newer tree ships; the completeness half does not depend on dist/ */
  const undeclared = res.errors.filter((e) => /does not say when a phone reads it/.test(e));
  assert.deepEqual(undeclared, []);
});

test('③ the Natural Earth files are this site\'s, pinned, and decode losslessly', async () => {
  const NE = await import('../js/ne-countries.js');
  const fc = { type: 'FeatureCollection', name: 'x', features: [
    { type: 'Feature', properties: { ADM0_A3: 'AAA', N: 1 }, geometry: { type: 'Polygon', coordinates: [[[1.123456, 2.5], [3, 4], [-179.999999, -89.000001], [1.123456, 2.5]]] } },
    { type: 'Feature', properties: { ADM0_A3: 'BBB' }, bbox: [0, 0, 1, 1], geometry: { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], [[[5, 5], [6, 5], [6, 6], [5, 5]]]] } },
  ] };
  const enc = NE.encodeNECountries(fc, { scale: 'test' });
  assert.ok(isDeepStrictEqual(NE.decodeNECountries(enc), fc), 'the encoding does not round-trip');
  assert.ok(isDeepStrictEqual(await NE.decodeNECountriesAsync(enc, 2), fc), 'the sliced decode differs from the plain one');
  for (const s of NE.NE_SCALES) {
    const doc = JSON.parse(gunzipSync(readFileSync(join(ROOT, NE.neCountriesPath(s)))).toString('utf8'));
    assert.equal(doc.scale, s);
    assert.match(doc.source.commit, /^[0-9a-f]{40}$/, 'not pinned to a commit');
    assert.doesNotMatch(doc.source.url, /@master\b/, 'a moving branch again');
  }
  const { check } = await import('../scripts/build-ne-countries.mjs');
  const lines = await check(null);
  assert.equal(lines.length, 3);
  /* …and nothing in the browser reads the CDN's copy any more */
  for (const f of ['js/countries-ui.js', 'js/map-tools.js']) assert.doesNotMatch(codeOnly(read(f)),/natural-earth-vector@master\/geojson\/ne_\d+m_admin_0_countries/, f);
});

test('④ a new CJK face redraws what the browser drew, and asks for no range again', async () => {
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  const before = window.IntMapGeoEngine, imap = window.__imap;
  const { IntMapGeoEngine: E } = await import('../js/geo-engine.js');
  try {
    const glyph = (id) => ({ id, bitmap: {}, metrics: {} });
    const gm = {
      localIdeographFontFamily: "'Noto Sans JP'",
      _charUsesLocalIdeographFontFamily: (cp) => cp >= 0x4e00 && cp <= 0x9fff,
      entries: { 'Noto Sans Regular': {
        glyphs: { default: { A: glyph(65), 'é': glyph(233), '東': glyph(0x6771), 'ก': glyph(0xe01) }, other: { A: null } },
        ranges: { 0: true }, requests: { 0: Promise.resolve({}) },
        tinySDF: {}, ideographTinySDF: {}, clusterTinySDFs: {},
      } },
    };
    const style = { glyphManager: gm };
    const calls = { set: 0, update: [] };
    window.__imap = { style, _update(f) { calls.update.push(f); }, getGlyphs: () => 'https://x/{fontstack}/{range}.pbf', setGlyphs() { calls.set++; } };
    assert.equal(E.scene.refreshCjkGlyphs(), true);
    const g = gm.entries['Noto Sans Regular'].glyphs.default;
    assert.ok(g.A && g['é'], 'a glyph from a downloaded range was dropped — its range would be requested again');
    assert.equal(g['東'], undefined, 'a glyph the browser drew with the old face survived');
    assert.equal(g['ก'], undefined, 'a glyph drawn as a fallback (its range never downloaded) survived');
    assert.equal(gm.entries['Noto Sans Regular'].ideographTinySDF, undefined, 'the rasteriser that drew with the old face survived');
    assert.ok(gm.entries['Noto Sans Regular'].requests[0], 'the range download was dropped');
    assert.equal(calls.set, 0, 'setGlyphs() empties every range — the duplicate requests are back');
    assert.equal(style._glyphsDidChange, true); assert.deepEqual(calls.update, [true]);
    /* a renderer whose cache is not the shape this knows falls back to the public door */
    window.__imap = { style: { glyphManager: { entries: { s: { glyphs: {} } } } }, _update() {}, getGlyphs: () => 'u', setGlyphs() { calls.set++; } };
    E.scene.refreshCjkGlyphs();
    assert.equal(calls.set, 1, 'an unknown cache shape did not fall back to setGlyphs()');
  } finally {
    if (imap === undefined) delete window.__imap; else window.__imap = imap;
    if (before === undefined) delete window.IntMapGeoEngine; else window.IntMapGeoEngine = before;
  }
});

test('⑤ the readers that used to start inside a phone\'s boot ask the plan first', () => {
  /* each reader's own read goes through at(<its row>), by the row id the plan declares */
  const ids = new Set(bootStage({ phone: true }).S.plan().map((r) => r.id));
  const asks = [['js/gazetteer.js', 'gazetteer'], ['js/space-sky.js', 'stars'], ['js/wb-layers.js', 'world-bank'], ['js/app-body.js', 'ne-countries']];
  for (const [f, id] of asks) {
    assert.ok(ids.has(id), `the plan has no row ${id}`);
    assert.match(read(f), new RegExp(`\\.at\\('${id}'[,)]`), `${f} does not wait for its row «${id}»`);
  }
});
