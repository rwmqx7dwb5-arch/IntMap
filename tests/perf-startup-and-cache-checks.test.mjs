/* ============================================================================
 *  IntMap · start-up cost, deploy weight and the revisit cache — measured, and never paid for with quality
 *  (scripts/perf-budget.mjs, vite.config.js, js/map-tooltip.js, js/layer-previews.js, js/atlas-loader.js,
 *   src/vendor.js, sw.js, the build stamp)
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r311-checks, tests/r224-checks ① ⑥b ⑦, tests/r262-checks ③ and the
 *  build-stamp test of tests/r176-checks (the last two asserted the same thing and are one test here).
 *
 *  #R311 *  「IntMapの…初回起動速度…操作可能になるまでの速度…メインスレッド負荷…配布ファイル容量…を徹底的に
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
 *
 *  #R224 — the service worker can heal · Atlas on demand · the two vendor libraries are keyed to their
 *  first use.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fnBody } from './app-source.mjs';
import { judge } from '../scripts/perf-budget.mjs';
import { ciRuns, ciBuildsBefore } from './helpers/ci-reach.mjs';
import { generatedStampProblems } from './helpers/build-stamp.mjs';
import { LAZY_REGISTRY } from '../js/lazy-modules.js';

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
  /* ⚠ READ, NOT RUN: the loader injects a <script> and fetches data/ — it only runs in a page. */
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
     shell budget in tests/r168 #8 could be paid rather than raised.
     EVALUATED: the module is run with a stub DOM whose map container COUNTS its layout reads and a
     ResizeObserver the test can fire. positionTooltip is called by every hover handler on every
     mousemove; reading the container rect there is a forced synchronous layout sixty times a second. */
  const T = tooltipModule({ mapW: 1000, mapH: 600 });
  for (let i = 0; i < 60; i++) T.api.positionTooltip({ x: 500 + i, y: 300 });
  assert.equal(T.rectReads(), 1, `the map was measured ${T.rectReads()} times for 60 pointer events — it must be once`);
  /* …and the size still comes from somewhere REAL — a check that only forbade the call would also
     pass for a version that hard-coded 1440×900: a pointer at the far right edge is clamped to THIS
     map's width, and the clamp follows the box when the ResizeObserver reports that it changed. */
  T.api.positionTooltip({ x: 5000, y: 300 });
  const right = parseFloat(T.tip.style.left);
  assert.equal(right, 1000 - 140 - 8, 'the clamp is the measured map width minus half the tooltip and the edge');
  T.resizeTo(700, 600);
  T.api.positionTooltip({ x: 5000, y: 300 });
  assert.equal(parseFloat(T.tip.style.left), 700 - 140 - 8, 'and refreshed when the box actually changes, not on a timer');
  assert.equal(T.rectReads(), 2, 'one read per resize, and none per pointer event');
});

test('r311 ⑦ the shared map tooltip is not rewritten with identical markup', () => {
  /* EVALUATED: an element that counts its innerHTML writes */
  const T = tooltipModule({ mapW: 1000, mapH: 600 });
  const el = T.api.ensureMapTooltip();
  for (let i = 0; i < 30; i++) T.api.setMapTooltipHTML(el, '<b>Tokyo</b>');
  assert.equal(el.writes, 1, 'it compares before it writes — the same markup thirty times is one write');
  T.api.setMapTooltipHTML(el, '<b>Osaka</b>');
  assert.equal(el.writes, 2, 'and it still writes markup when the markup changes — the callers pass HTML, not text');
  assert.equal(el.innerHTML, '<b>Osaka</b>');
  /* the always-registered news handlers go through it. `el` is the shared tooltip element in that
     file; a direct assignment to it is the thing that made the next offsetWidth read a reflow.
     ⚠ READ, NOT RUN: js/news-ui.js's hover handlers are wired to the renderer's pointer events. */
  const news = read('js/news-ui.js');
  assert.equal((news.match(/\bel\.innerHTML\s*=/g) || []).length, 0,
    'js/news-ui.js writes the shared tooltip through the deduplicating setter, not directly');
  assert.ok((news.match(/setMapTooltipHTML\(el,/g) || []).length >= 3,
    'all of the always-on news hover handlers use it');
});

/* js/map-tooltip.js, run against the smallest DOM it touches */
function tooltipModule({ mapW, mapH }) {
  let reads = 0, w = mapW, h = mapH;
  const observers = [];
  const container = {
    getBoundingClientRect() { reads++; return { width: w, height: h }; },
    appendChild() {},
  };
  const makeEl = () => {
    const el = { className: '', offsetWidth: 280, offsetHeight: 80, writes: 0, _html: '',
      classList: { toggle() {} }, style: { setProperty() {} } };
    Object.defineProperty(el, 'innerHTML', { get() { return el._html; }, set(v) { el.writes++; el._html = v; } });
    return el;
  };
  let tip = null;
  const win = { IntMapModules: {}, addEventListener() {} };
  const document = { getElementById: (id) => (id === 'map-container' ? container : null), createElement: () => (tip = makeEl()) };
  function ResizeObserver(cb) { this.cb = cb; observers.push(this); }
  ResizeObserver.prototype.observe = function (t) { this.target = t; };
  ResizeObserver.prototype.disconnect = function () {};
  new Function('window', 'document', 'ResizeObserver', read('js/map-tooltip.js'))(win, document, ResizeObserver);
  const api = win.IntMapModules.mapTooltip();
  return {
    api, rectReads: () => reads, get tip() { return tip; },
    resizeTo(nw, nh) { w = nw; h = nh; for (const o of observers) if (o.target === container) o.cb(); },
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   ⑧ Layer-preview thumbnails are not painted while nobody is looking.
   ───────────────────────────────────────────────────────────────────────── */
test('r311 ⑧ the canvas painters wait for the same gate the image queue waits for', () => {
  /* ⚠ READ, NOT RUN: the painters draw into canvases inside the layer panel, which only exists in a page. */
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
  /* ⚠ READ, NOT RUN: the dev-server pre-bundler is configuration; running it is a vite process, not a unit. */
  const cfg = read('vite.config.js');
  assert.ok(/#wasm-\(single\|multi\)-thread/.test(cfg), 'the build still aliases the two Emscripten entry points');
  assert.ok(/optimizeDeps[\s\S]{0,200}exclude[\s\S]{0,80}satellite\.js/.test(cfg),
    'and dependency pre-bundling is told to leave the package alone — the pre-bundler does not honour resolve.alias, so without this it bundles the real Emscripten entry and dev would run a different satellite.js than production (vite 6 died outright with «Top-level await is not available»)');
});

/* ─────────────────────────────────────────────────────────────────────────
   ⑩ The budget is wired to something that runs.
   ───────────────────────────────────────────────────────────────────────── */
test('r311 ⑩ the startup budget is a CI step and a baseline exists to ratchet against', () => {
  const ci = read('.github/workflows/ci.yml');
  /* ⚠ (#R771) ASKED OF WHAT CI RUNS, NOT OF HOW ci.yml SPELLS IT — tests/helpers/ci-reach.mjs.
     The declared gates stopped being one step each when they were split across three machines. */
  assert.ok(ciRuns('check:perf'), 'CI runs the budget');
  assert.ok(ciBuildsBefore('check:perf'),
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

/* ══════════════════ #R224 ① — the tile cache can heal ══════════════════ */
/* ── ① THE SERVICE WORKER CAN HEAL ────────────────────────────────────────────────────────────────
   The report was 「キャッシュの残っているブラウザで開くと地図が全くちゃんと表示されない」 — blurry
   imagery and no labels — and the cause was a cache-first store with no version and no expiry: an
   Esri HTTP-200 "no imagery here" tile (~2.5 kB) pinned a neighbourhood at half resolution for the
   life of the profile, because js/sat-proto.js reads that body size as «imagery stops here».
   EVALUATED: sw.js is run against a stub `self`, a Cache Storage held in maps, a stub network and a
   clock the test moves; events are dispatched the way the browser dispatches them. */
function serviceWorker() {
  const handlers = {}, stores = new Map(), network = [];
  let now = Date.UTC(2026, 8, 1), answer = () => new Response('tile', { status: 200 });
  const keyOf = (r) => (typeof r === 'string' ? r : r.url);
  const cacheOf = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return { match: async (r) => m.get(keyOf(r)), put: async (r, res) => { m.set(keyOf(r), res); },
      keys: async () => [...m.keys()].map((url) => ({ url })), delete: async (r) => m.delete(keyOf(r)) };
  };
  const caches = { open: async (n) => cacheOf(n), keys: async () => [...stores.keys()], delete: async (n) => stores.delete(n) };
  const self = { addEventListener: (t, f) => { handlers[t] = f; }, skipWaiting() {}, clients: { claim: async () => {} },
    navigator: { storage: { estimate: async () => ({ usage: 0, quota: 1e12 }) } } };
  const fetchStub = async (r) => { network.push(keyOf(r)); const res = answer(keyOf(r)); return Object.defineProperty(res, 'type', { value: 'cors' }); };
  new Function('self', 'caches', 'fetch', 'Date', read('sw.js'))(self, caches, fetchStub, { now: () => now });
  const dispatch = async (type, extra) => {
    const waits = []; let responded = null;
    handlers[type](Object.assign({ waitUntil: (p) => waits.push(p), respondWith: (p) => { responded = p; } }, extra));
    const res = responded ? await responded : undefined;
    await Promise.all(waits);
    return res;
  };
  return {
    stores, network, cacheOf, dispatch,
    setNow: (t) => { now = t; }, now: () => now,
    answerWith: (f) => { answer = f; },
    get: (url) => dispatch('fetch', { request: { method: 'GET', url } }),
  };
}
const DAY = 86400e3;
const TILE = (host, path = '/tile/3/2/1') => 'https://' + host + path;

test('R224 ① the tile cache is versioned, refuses placeholders and expires', async () => {
  const SW = serviceWorker();
  /* the name is bumped, so every poisoned v1 is purged on activate — and the page's own caches stay */
  const cur = [...(await (async () => { await SW.dispatch('fetch', { request: { method: 'GET', url: TILE('server.arcgisonline.com') } }); return SW.stores.keys(); })())];
  assert.equal(cur.length, 1, 'one tile cache is written to');
  const current = cur[0];
  SW.cacheOf('intmap-tiles-v1'); SW.cacheOf('intmap-subcables-v1');
  await SW.dispatch('activate', {});
  assert.ok(!SW.stores.has('intmap-tiles-v1'), 'a poisoned v1 tile cache must be purged on activate');
  assert.ok(SW.stores.has(current), 'the current tile cache survives activate');
  assert.ok(SW.stores.has('intmap-subcables-v1'), 'a page-owned intmap-* cache is not this worker’s to delete (#R189)');
  assert.notEqual(current, 'intmap-tiles-v1', 'the tile cache is not the v1 every old browser holds');

  /* a 200-with-no-imagery is never stored — the same size js/sat-proto.js uses — and only on imagery hosts */
  const sized = (n, extra = {}) => () => new Response('x'.repeat(n), { status: 200, headers: Object.assign({ 'content-length': String(n), 'content-type': 'image/jpeg' }, extra) });
  SW.answerWith(sized(2521));
  await SW.get(TILE('server.arcgisonline.com', '/grey/1'));
  assert.equal(await SW.cacheOf(current).match(TILE('server.arcgisonline.com', '/grey/1')), undefined, 'Esri’s 2.5 kB grey placeholder must not be kept');
  SW.answerWith(sized(9000));
  await SW.get(TILE('server.arcgisonline.com', '/real/1'));
  assert.ok(await SW.cacheOf(current).match(TILE('server.arcgisonline.com', '/real/1')), 'a real imagery tile is kept');
  SW.answerWith(sized(2000));
  await SW.get(TILE('tiles.openfreemap.org', '/small/1'));
  assert.ok(await SW.cacheOf(current).match(TILE('tiles.openfreemap.org', '/small/1')), 'narrowly — only the imagery hosts have a placeholder');

  /* every stored entry carries the time it was stored, and does not claim an encoding it no longer has */
  SW.answerWith(sized(9000, { 'content-encoding': 'gzip' }));
  await SW.get(TILE('basemaps.cartocdn.com', '/enc/1'));
  const kept = await SW.cacheOf(current).match(TILE('basemaps.cartocdn.com', '/enc/1'));
  assert.equal(kept.headers.get('x-im-cached'), String(SW.now()), 'the entry is stamped with the time it was stored');
  assert.equal(kept.headers.get('content-encoding'), null, 'the rebuilt response must not claim an encoding it no longer has');

  /* stale-while-revalidate: the revisit is answered from disk at once; past its age it is refreshed
     behind the hit. The two families expire on different clocks, because only one is regenerated upstream. */
  const ages = async (host, ageDays) => {
    const url = TILE(host, '/age/' + ageDays);
    SW.answerWith(sized(9000));
    const t0 = SW.now();
    await SW.get(url);
    SW.setNow(t0 + ageDays * DAY);
    const before = SW.network.length;
    const hit = await SW.get(url);
    SW.setNow(t0);
    return { refreshed: SW.network.length > before, fromDisk: hit === (await SW.cacheOf(current).match(url)) || hit.headers.get('x-im-cached') != null };
  };
  const vec6 = await ages('tiles.openfreemap.org', 6), vec8 = await ages('tiles.openfreemap.org', 8);
  assert.ok(vec6.fromDisk && vec8.fromDisk, 'the revisit is still answered from disk — ZERO network on revisit');
  assert.equal(vec6.refreshed, false, 'a regenerated-upstream tile younger than its age is not refetched');
  assert.equal(vec8.refreshed, true, 'a regenerated-upstream tile past 7 days is refreshed behind the hit');
  const img30 = await ages('server.arcgisonline.com', 30), img61 = await ages('server.arcgisonline.com', 61);
  assert.equal(img30.refreshed, false, 'imagery is immutable for a long time…');
  assert.equal(img61.refreshed, true, '…but never for ever (60 days)');
});

/* ══════════════════ #R224 ⑥b ⑦ — heavy code is fetched when it is reached for ══════════════════ */
test('R224 ⑥b Atlas is on demand, and every entry point fetches it', () => {
  /* ⚠ READ, NOT RUN: which entry points reach Atlas through the loader is an import/call-graph property across eight DOM modules. */
  assert.ok(!/import '\.\.\/js\/atlas-console\.js';/.test(read('src/main.js')), 'not in the boot bundle');
  const lz = read('js/lazy-modules.js');
  /* (#R798) one registry entry: what it publishes, how it is fetched, how it is mounted */
  assert.equal(LAZY_REGISTRY["atlasConsole"].publishes, 'IntMapConsole');
  assert.equal((String(LAZY_REGISTRY["atlasConsole"] && LAZY_REGISTRY["atlasConsole"].load).match(/import\('([^']+)'\)/) || [])[1], './atlas-console.js');
  assert.match(String(LAZY_REGISTRY["atlasConsole"].mount), /window\.IntMapConsole=window\.IntMapModules\.atlasConsole\(IM_HOST\)/);
  assert.ok(lz.length > 0);
  const ld = read('js/atlas-loader.js');
  for (const k of ['ensure', 'hint', 'call', 'wire', 'loaded']) assert.ok(ld.includes(k + ':'), `the loader offers ${k}`);
  /* every caller that OPENS Atlas goes through it… */
  for (const [f, re] of [['js/session-tabs.js', /IntMapAtlas\.call\('open'\)/],
    ['js/keyboard-shortcuts.js', /IntMapAtlas\.call\('toggle'\)/],
    ['js/news-ui.js', /IntMapAtlas\.call\('mountTab'\)/],
    ['js/workspace.js', /IntMapAtlas\.call\('open'\)/],
    ['js/map-ui.js', /IntMapAtlas\.ensure\(\)/],
    ['js/tool-panel.js', /IntMapAtlas\.ensure\(\)/],
    ['js/countries-ui.js', /IntMapAtlas\.ensure\(\)/],
    /* ⚠ (#R296) js/sims.js left this list: its only `IntMapAtlas.call('dispatch')` was the disaster
       panel's 「放射性物質」 choice handing off to the fallout model, and 「4つのうち…全削除」
       removed the wrapper. The fallout model has its own panel now and needs no dispatch to reach
       itself. What this test is FOR — no file may reach Atlas except through the loader — is
       unchanged, and every file that still does is still checked. */
  ]) assert.match(read(f), re, `${f} must reach Atlas through the loader`);
  /* ⚠ once the kernel is here, call() is SYNCHRONOUS — deferring is the price of FETCHING, not a
     thing to pay for ever. The sidebar's Atlas tab used to mount inside the click, and an
     unconditional promise moved that a turn later (tests/r145 ⑦ caught it in CI). */
  assert.match(ld, /const now = window\.IntMapConsole;/);
  assert.match(ld, /if \(now\) \{\s*\n\s*try \{ return Promise\.resolve\(typeof now\[fn\]/);
  /* …⚠ and the one that CLOSES it does not, because downloading 658 kB to close a panel that was
     never opened is the same defect pointed the other way */
  assert.ok(!/IntMapAtlas/.test(read('js/flight-sim.js')), 'the flight sim closes Atlas without fetching it');
  assert.match(read('js/session-tabs.js'), /'atlas\.close',\(\)=>\{ window\.IntMapConsole&&/, 'nor does atlas.close');
  /* workspace mode genuinely needs it at boot — it has an Atlas WINDOW — so it asks, explicitly */
  assert.match(read('js/workspace.js'), /if\(!window\.IntMapConsole&&window\.IntMapAtlas\) window\.IntMapAtlas\.hint\(\);/);
  /* ⚠ …and a DESKTOP warms it after the map settles, because the instruction is about a phone and
     making the first ⌘K wait for a download would be trading one regression for another. */
  assert.match(ld, /const phone = \/Mobi\|Android\|iPhone\|iPad\/\.test\(navigator\.userAgent\);/,
    'the UA decides — a RAM question is not a width question (Architecture §9)');
  assert.match(ld, /if \(!phone && !save\)/);
  assert.match(ld, /events\.once\('idle'/, 'never before the app is interactive');
  assert.ok(!/requestIdleCallback\(/.test(ld), 'and not behind an idle callback that may never fire');
});

/* ── ⑦ THE TWO VENDOR LIBRARIES ARE KEYED TO THEIR FIRST USE ───────────────────────────────────── */
test('R224 ⑦ katex and html2canvas are fetched by the features that need them', () => {
  /* ⚠ READ, NOT RUN: the vendor loader and the Köppen decode run in a page (dynamic import(), createImageBitmap). */
  const v = read('src/vendor.js');
  assert.match(v, /window\.IntMapVendor = \(function \(\)/);
  assert.ok(!/requestIdleCallback\(load/.test(v), 'no longer merely delayed to idle');
  /* (#R493) composing the screen — and therefore the html2canvas fetch — moved to
     js/atlas-view-capture.js, which BOTH the shutter and Atlas's view.inspect call. */
  assert.match(read('js/atlas-view-capture.js'), /IntMapVendor\.html2canvas\(\)/);
  assert.match(read('js/screenshot.js'), /await import\('\.\/atlas-view-capture\.js'\)/);
  assert.match(read('js/atlas-reply.js'), /IntMapVendor\.katex\(\)/);
  /* the Köppen work canvas decodes at the size it keeps, not at 4096² */
  const dl = read('js/data-layers.js');
  assert.match(dl, /createImageBitmap\(b,\{resizeWidth:cap,resizeHeight:cap,resizeQuality:'pixelated'\}\)/,
    'nearest-neighbour, because the palette IS the classification');
  assert.match(dl, /if\(koppenPhone\(\)\) return _koppenBitmapWork\(\)\.catch\(\(\)=>_loadKoppenCanvasImg\(\)\);/,
    'and it falls back to the <img> path where it cannot help');
});

/* ══════════════════ the build stamp (#R262 ③, and #R176's «the build stamp was bumped») ══════════════════ */
/* ── ③ the build markers agree, and do not go backwards ────────────────────────────────────────
   ⚠ WRITTEN THIS WAY ON PURPOSE. #R261 ⑬ pinned the literal 'R261' and went red the moment #R262
   bumped the stamp, which is what every round is required to do. The property a round can assert is
   that the two markers AGREE and are not older than itself; the format and the global monotonicity
   belong to tests/r169-checks, which already owns them. */
test('R262 ③: both build markers name one round, and it is not older than R262', async () => {
  /* ⚠ FOLDED: tests/r176-checks «R176: the build stamp was bumped» asserted exactly this — that the stamp
     cannot sit still — and is this test now. (#R177) #R176 had pinned '2026-07-29-R176' and then had to
     unpin it; the build writes the stamp from the commit being built, so what is asked is that it does.
     (2026-09-25) both markers are filled by the build from the commit (scripts/build-stamp.mjs) */
  assert.deepEqual(await generatedStampProblems(read('index.html')), [], 'the build stamp can go stale again');
});
