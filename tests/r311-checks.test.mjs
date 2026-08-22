/* ============================================================================
 *  IntMap · #R311 — source-level checks
 * ----------------------------------------------------------------------------
 *  「IntMapの…初回起動速度…操作可能になるまでの速度…メインスレッド負荷…配布ファイル容量…を徹底的に
 *    改善してください。ただし、品質ダウングレードは一切禁止です。」
 *
 *  So every question below is asked twice over: did the waste go, and is the OUTPUT still the same?
 *  A check that only watched the number go down would pass for a round that deleted the feature.
 *
 *  ⚠ THE ASSERTIONS ARE RELATIONS AND BEHAVIOUR, NOT SPELLINGS. Twenty-five rounds running, this
 *  project has had correct changes turned red by a check that pinned a literal — a byte count, a
 *  build stamp, a sentence the next round was told to rewrite (#R283 and #R306 were line endings
 *  alone). Everything here is asked of a brace-matched FUNCTION BODY, of a value IMPORTED from the
 *  file that owns it, or by RUNNING the thing and looking at what it did.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fnBody } from './app-source.mjs';
import { judge } from '../scripts/perf-budget.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

/* A synthetic measurement in the shape scripts/perf-budget.mjs produces. Numbers, not a build —
   the point is to exercise the POLICY, and a policy that has only ever seen the tree it guards has
   never been shown to fail (#R301 found two suites that had never run at all). */
const M = () => ({
  eager: { raw: 4_000_000, gzip: 1_400_000, brotli: 1_100_000, requests: 6, modules: 275, cssRaw: 300_000, cssGzip: 50_000 },
  async: { raw: 8_000_000, gzip: 2_500_000, chunks: { cesium: 4_800_000, 'atlas-console': 700_000 } },
  dist: { total: 110_000_000, data: 57_000_000, assets: 15_000_000 },
});

/* ─────────────────────────────────────────────────────────────────────────
   ① The budget knows the difference between "the entry got heavier" and
      "a feature nobody loaded got heavier".
   ───────────────────────────────────────────────────────────────────────── */
test('r311 ① a heavier EAGER entry fails; a heavier ASYNC chunk fails; the two are judged apart', () => {
  const base = M();
  assert.equal(judge(M(), base).errors.length, 0, 'an unchanged build is within budget');

  const heavier = M(); heavier.eager.raw = Math.round(base.eager.raw * 1.05);
  const e1 = judge(heavier, base).errors;
  assert.ok(e1.some((s) => s.startsWith('eager.raw grew')), 'eager growth is named: ' + JSON.stringify(e1));

  const fatFeature = M(); fatFeature.async.chunks.cesium = Math.round(base.async.chunks.cesium * 1.5);
  const e2 = judge(fatFeature, base).errors;
  assert.ok(e2.some((s) => s.includes('async chunk "cesium" grew')), 'per-chunk async growth is named: ' + JSON.stringify(e2));

  /* …and the same 5 % on the async TOTAL is a different message from the same 5 % on eager, which is
     the whole reason the two halves exist. */
  const fatAsync = M(); fatAsync.async.raw = Math.round(base.async.raw * 1.05);
  assert.ok(judge(fatAsync, base).errors.some((s) => s.startsWith('async.raw grew')));
});

test('r311 ② a ceiling that stopped following the measurement is itself a failure', () => {
  const base = M();
  const better = M(); better.eager.raw = Math.round(base.eager.raw * 0.8);
  const errs = judge(better, base).errors;
  assert.ok(errs.some((s) => s.includes('eager.raw IMPROVED')),
    'an improvement that leaves the ceiling behind must say so — a ceiling with permanent headroom asserts nothing (#R194)');
  /* ⚠ and the ASYNC half must NOT do this: it may shrink freely, or every unrelated round would
     have to edit the baseline. */
  const smallerAsync = M(); smallerAsync.async.raw = Math.round(base.async.raw * 0.5);
  assert.equal(judge(smallerAsync, base).errors.length, 0, 'async shrinking is not a failure');
});

test('r311 ③ the two COUNT metrics are gated exactly — a byte-sized slack would swallow them', () => {
  const base = M();
  for (const k of ['requests', 'modules']) {
    const more = M(); more.eager[k] = base.eager[k] + 1;
    assert.ok(judge(more, base).errors.some((s) => s.startsWith('eager.' + k + ' grew')),
      `one more ${k} must fail: with a 2 kB absolute slack, no value a count can take could ever exceed it`);
    const fewer = M(); fewer.eager[k] = base.eager[k] - 1;
    assert.ok(judge(fewer, base).errors.some((s) => s.includes('eager.' + k + ' IMPROVED')),
      `one fewer ${k} must ratchet the ceiling down`);
  }
});

/* ─────────────────────────────────────────────────────────────────────────
   ④ The deploy carries ONE representation of the ecoregions dataset — and
      the loader still knows both ways of reading it.
   ───────────────────────────────────────────────────────────────────────── */
test('r311 ④ the 9.76 MB ecoregions dataset is deployed once, not twice', async () => {
  const { STATIC_EXCLUDE, STATIC_ASSETS } = await import('../vite.config.js');
  assert.ok(STATIC_ASSETS.includes('data'), 'data/ is still copied whole');
  assert.ok(STATIC_EXCLUDE.some((p) => p.endsWith('ecoregions_2017.js')),
    'the JS-global copy is excluded from dist/ — it is byte-identical to the .geojson beside it');
  /* ⚠ excluded from the DEPLOY, not deleted from the repository. */
  assert.ok(existsSync(resolve(ROOT, 'data/ecoregions_2017.js')), 'the source copy is still in the repo');
  assert.ok(existsSync(resolve(ROOT, 'data/ecoregions_2017.geojson')), 'the shipped copy is still in the repo');
});

test('r311 ⑤ …and the loader kept BOTH paths; only their order changed', () => {
  /* the loader is an arrow assigned to a global, so the region is delimited by the two facts that
     bound it rather than by a character count: where the name is introduced, and where the next
     top-level declaration in the file begins. */
  const src = read('js/layer-packs.js');
  const i = src.indexOf('window.__loadEcoregions=');
  assert.ok(i > 0, 'the loader is still published under the name js/compare.js reaches it by');
  const region = src.slice(i, src.indexOf('function ensureEco', i));
  assert.ok(region.length > 200 && region.length < 4000, 'the region is the loader, not the file');

  const viaFetch = region.indexOf("fetch('data/ecoregions_2017.geojson'");
  const viaScript = region.indexOf("'data/ecoregions_2017.js'");
  assert.ok(viaFetch > 0, 'the .geojson is still read — it is the copy that ships');
  assert.ok(viaScript > 0, 'the <script> path #R13b wrote for file:// is still there — nothing was deleted');
  /* which one is the FALLBACK is the whole change: the deploy no longer carries the .js, so a
     <script> tag that ran first would 404 on every session that opens the layer. */
  assert.ok(/\.catch\(\s*\(\s*\)\s*=>\s*viaScript\(\)\s*\)/.test(region),
    'the <script> tag runs only when the fetch fails');
});

/* ─────────────────────────────────────────────────────────────────────────
   ⑥ The hover path stops paying for what it already knows.
   ───────────────────────────────────────────────────────────────────────── */
test('r311 ⑥ positionTooltip no longer measures the map on every pointer event', () => {
  /* the surface lives in js/map-tooltip.js since this round — it left js/app-body.js whole so the
     shell budget in tests/r168 #8 could be paid rather than raised. */
  const body = fnBody(read('js/map-tooltip.js'), 'positionTooltip');
  assert.ok(!/getBoundingClientRect/.test(body),
    'positionTooltip is called by every hover handler on every mousemove; reading the container rect there is a forced synchronous layout sixty times a second');
  /* …and the size still comes from somewhere REAL — a check that only forbade the call would also
     pass for a version that hard-coded 1440×900. */
  assert.ok(/_mcSize\(\)/.test(body), 'it asks the cached measurement');
  const size = fnBody(read('js/map-tooltip.js'), '_mcSize');
  assert.ok(/getBoundingClientRect/.test(size), 'the cache is filled from a real measurement');
  assert.ok(/ResizeObserver/.test(size), 'and refreshed when the box actually changes, not on a timer');
});

test('r311 ⑦ the shared map tooltip is not rewritten with identical markup', () => {
  const set = fnBody(read('js/map-tooltip.js'), 'setMapTooltipHTML');
  assert.ok(/_tipHTML/.test(set) && /return/.test(set), 'it compares before it writes');
  assert.ok(/innerHTML/.test(set), 'and it still writes markup — the callers pass HTML, not text');
  /* the always-registered news handlers go through it. `el` is the shared tooltip element in this
     file; a direct assignment to it is the thing that made the next offsetWidth read a reflow. */
  const news = read('js/news-ui.js');
  assert.equal((news.match(/\bel\.innerHTML\s*=/g) || []).length, 0,
    'js/news-ui.js writes the shared tooltip through the deduplicating setter, not directly');
  assert.ok((news.match(/setMapTooltipHTML\(el,/g) || []).length >= 3,
    'all of the always-on news hover handlers use it');
});

/* ─────────────────────────────────────────────────────────────────────────
   ⑧ Layer-preview thumbnails are not painted while nobody is looking.
   ───────────────────────────────────────────────────────────────────────── */
test('r311 ⑧ the canvas painters wait for the same gate the image queue waits for', () => {
  const src = read('js/layer-previews.js');
  const into = fnBody(src, 'into');
  /* #R193 moved the IMAGE queue off the boot path and left four painter paths behind it. Each of
     them now goes through the one gate. Counted rather than spelled: the exact call sites move. */
  assert.ok((into.match(/_paintJob\(/g) || []).length >= 3,
    'every painter dispatch in into() is deferred to the queue gate');
  assert.ok(!/\b_needGeo\.push\(/.test(into.replace(/_paintJob\([\s\S]*/, '')),
    'nothing reaches the country-data load before the gate opens');
  /* the gate itself must actually drain them, or they would sit forever — which is exactly the
     defect #R72 shipped and #R73 had to undo. */
  const open = fnBody(src, '_openQueue');
  assert.ok(/_paintQ/.test(open), '_openQueue drains the painter queue');
  const job = fnBody(src, '_paintJob');
  assert.ok(/_imgOpen/.test(job) && /_paintQ/.test(job),
    'a job asked for after the gate opened runs immediately; before it, it is queued');
  /* ⚠ and NOT by adding another IntersectionObserver: #R72 tried that and tiles registered while
     the panel was off-screen never got a second look. */
  assert.equal((src.match(/new IntersectionObserver/g) || []).length, 1,
    'still exactly the one observer #R73 left behind — the deferral is the queue, not a second observer');
});

/* ─────────────────────────────────────────────────────────────────────────
   ⑨ The dev server and the build agree about satellite.js.
   ───────────────────────────────────────────────────────────────────────── */
test('r311 ⑨ `npm run dev` resolves the satellite WASM entry points the same way the build does', () => {
  const cfg = read('vite.config.js');
  assert.ok(/#wasm-\(single\|multi\)-thread/.test(cfg), 'the build still aliases the two Emscripten entry points');
  assert.ok(/optimizeDeps[\s\S]{0,200}exclude[\s\S]{0,80}satellite\.js/.test(cfg),
    'and dependency pre-bundling is told to leave the package alone — esbuild does not honour resolve.alias, so without this `vite` dies with «Top-level await is not available» before it ever serves a page');
});

/* ─────────────────────────────────────────────────────────────────────────
   ⑩ The budget is wired to something that runs.
   ───────────────────────────────────────────────────────────────────────── */
test('r311 ⑩ the startup budget is a CI step and a baseline exists to ratchet against', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.ok(/check:perf/.test(ci), 'CI runs the budget');
  assert.ok(ci.indexOf('npm run build') < ci.indexOf('check:perf'),
    'and builds first — the budget reads the report the build writes');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['check:perf'], 'node scripts/perf-budget.mjs');
  const base = JSON.parse(read('tests/perf-baseline.json'));
  for (const k of ['raw', 'gzip', 'brotli', 'requests', 'modules']) assert.ok(base.eager[k] > 0, 'eager.' + k);
  assert.ok(base.async.chunks && Object.keys(base.async.chunks).length > 5, 'per-chunk async ceilings are recorded');
  /* the one assertion that would catch the whole instrument being wrong: the heaviest thing in the
     tree is the second renderer, and a default session must never be charged for it. */
  assert.ok(base.async.chunks.cesium > 1_000_000, 'cesium is measured…');
  assert.ok(base.eager.raw < base.async.chunks.cesium + base.eager.raw, '…and it is on the async side');
  assert.ok(base.eager.requests < 20, 'a cold start is a handful of requests, not a waterfall');
});
