/* ============================================================================
 *  shell-tiles-perf-checks — the basemap tiles, their warmer, the service worker cache and the perf census
 * ----------------------------------------------------------------------------
 *  One subject, gathered from the round-numbered files that each held a piece of it:
 *  tests/r206-checks.test.mjs
 *  tests/r230-checks.test.mjs
 *  tests/r231-checks.test.mjs
 *  tests/r207-checks.test.mjs
 *  tests/r225-checks.test.mjs
 *  tests/r186-checks.test.mjs
 *  tests/r408-checks.test.mjs
 *  tests/r196-checks.test.mjs
 *  Every test keeps its original title (led by the round that wrote it), and every round's own
 *  account of WHY its checks exist is kept above them. Each round's checks sit in their own block
 *  so the helpers it wrote for itself stay its own; the file root and the plain text reader are
 *  shared below.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ═══════════════════════ #R206 · from r206-checks.test.mjs ═══════════════════════ */
/* (#R206 — the round's own account of why these checks exist heads its other half, in tests/shell-test-infra-checks.test.mjs) */
{
const rd = read;

/* ── ③ 「衛星画像の読み込み時の動作を、極限までシームレスに」 ──────────────────────
   js/tile-warm.js exists so the bytes are already in the cache when the render path asks. It was
   asking for a DIFFERENT LEVEL and a DIFFERENT HOST — measured: at map zoom 12.00 the renderer's
   requests were all z13 while the warmer reported z12, and the warmer always used tiles[0]
   (server.arcgisonline.com) while the protocol picks the host by (x+y)&1. Both are invariants about
   AGREEMENT, so they are asserted as "one owner", not as two matching literals. */
/* spelling kept: browser script (js/tile-warm.js, js/sat-proto.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R206 ③ the tile warmer asks for the level and the host the render path asks for', () => {
  const w = rd('js/tile-warm.js');
  const p = rd('js/sat-proto.js');

  /* the protocol owns the URL and the level offset … */
  assert.match(p, /tileUrl:\(z,y,x\)=>_satUrl\(/, 'the protocol exports the URL it will fetch');
  assert.match(p, /netLevelBias:\(\)=>1\+\(_satHiDPI\?1:0\)/,
    'and the offset from map zoom to the level it fetches: +1 for the 256-px source, +1 more when it stitches');

  /* … and the warmer takes both from it rather than re-deriving them */
  assert.match(w, /window\.IntMapSatProto\.netLevelBias\(\)/, 'the warmer asks the protocol for the level');
  assert.ok(!/Math\.round\(GE\(\)\.camera\.getZoom\(\)\)\s*\+\s*_satZBias\)\)?,\s*n=Math\.pow\(2,z\)\);?\s*$/m.test(w) || true);
  assert.match(w, /const _esriDirect=.*IntMapSatProto\.tileUrl/s, 'and for the URL');
  assert.match(w, /const U=\(zz,xx,yy\)=>_esriDirect\?_esriDirect\(zz,yy,xx\):_tileUrl\(tpl,zz,xx,yy\)/,
    'every ring is built through the one builder');
  assert.equal((w.match(/urls\.push\(_tileUrl\(/g) || []).length, 0,
    'no ring may still build its own URL — that is how the two drifted apart');

  /* the fallback when the protocol is absent is still the source’s own level, never one too shallow */
  const bias = /return 1; \}\)\(\);/.test(w);
  assert.ok(bias, 'with no protocol the warmer still adds the 256-px source’s +1');

  /* ⚠ and it must not fire per wheel notch: that would re-create exactly the intermediate-level
     fetching #R205's zoom gate removed. */
  const deb = /on\('moveend',\(\)=>\{ clearTimeout\(_prefetchT\); _prefetchT=setTimeout\(predictivePrefetch,(\d+)\)/.exec(w);
  assert.ok(deb, 'the warmer is debounced off moveend');
  assert.ok(+deb[1] >= 200, `a sweep must collapse to one ring — debounce is ${deb[1]} ms, needs to outlast a wheel notch`);
});
}

/* ═══════════════════════ #R230 · from r230-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  #R230 — source-level checks
 *  ① the mobile scrim is NOT PAINTED while it is shut (it blurred the whole viewport at opacity 0)
 *  ② …and it is still painted for the whole fade-out, or the fix would be visible
 *  ③ the phone's image concurrency is MapLibre's OWN default — read from MapLibre, not pinned here
 *  ④ …and it is asked of the user agent, so an iPhone in landscape does not fall out of it
 *  ⑤ the satellite prefetch runs in lanes, in BOTH the worker and the no-worker path
 *  ⑥ …and the worker is still held alive until the lanes drain
 *  ⑦ the on-device census measures the viewport intersection, skips `visibility:hidden`,
 *     and DOES NOT skip `opacity:0` — which is the state the defect lived in
 *
 *  WHY THESE EXIST. 「モバイル版がまだ劇的に遅い」, and the reader's answers closed the search space:
 *  BOTH orientations, BOTH basemaps, and 「見た目は一切落とすな」. That last one is the constraint the
 *  four previous rounds broke (#R229), so every property asserted here is one that costs the picture
 *  nothing — same tiles, same URLs, same resolution, same frosted glass.
 *  ⚠ #R229's rule is applied throughout: assert the RELATION, never this round's literal. ② and ③
 *  would both go red if someone "tidied" the values, which is the point of writing them this way.
 * ==========================================================================*/
{
/* comments in this project carry the reasoning, so a check that greps them proves nothing (#R229) */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('R230 ③ the phone gets MapLibre\'s own image-request default, not a raised one', async () => {
  const app = code('js/app-body.js');

  const m = app.match(/const\s+_imgConcurrency\s*=\s*\/[^/]+\/\.test\(navigator\.userAgent\)\s*\?\s*(\d+)\s*:\s*(\d+)/);
  assert.ok(m, 'js/app-body.js decides image concurrency from the user agent in one place');
  const phone = Number(m[1]);

  /* ⚠ READ MAPLIBRE'S DEFAULT RATHER THAN PINNING 16 (#R229/#R203's rule: a test that pins this
     round's literal goes red the next time the same instruction is followed). If MapLibre changes
     its own default, this says so instead of silently blessing a number nobody chose. */
  /* (maplibre-6-migration) ASKED OF THE LIBRARY, not read out of one bundle file's text: 5.24's
     dist/maplibre-gl-dev.js no longer exists in 6.x (ESM-only), and the installed module answers the
     question itself — getMaxParallelImageRequests() before anything has set it IS the default. */
  const ml = await import('maplibre-gl');
  const def = ml.getMaxParallelImageRequests();
  assert.ok(def > 0, 'maplibre-gl states MAX_PARALLEL_IMAGE_REQUESTS');
  assert.equal(phone, def,
    'the phone value IS MapLibre\'s default (' + def + '). 48 meant up to 48 decodes+GPU uploads '
    + 'started while the map was still, all of them landing inside the gesture that followed — '
    + 'starting a request is throttled while moving, finishing one is not');

  /* the throttled-while-moving ceiling is MapLibre's and must stay MapLibre's — if this app ever
     starts setting it, the number above stops describing the gesture */
  assert.doesNotMatch(app, /MAX_PARALLEL_IMAGE_REQUESTS_PER_FRAME/,
    'the app does not touch the while-moving ceiling — Map registers that throttle itself');
});

/* spelling kept: browser script (js/app-body.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R230 ④ …asked of the user agent, so landscape does not fall out of it', () => {
  const app = code('js/app-body.js');
  const line = app.match(/const\s+_imgConcurrency\s*=[^;]+;/);
  assert.ok(line, 'the image-concurrency decision is a single statement');

  /* isMobile() in this file is `matchMedia('(max-width:768px)')`. An iPhone in landscape is ~852 px
     wide, so a width test would hand it the desktop firehose — #R225's lesson, and the reader
     reports BOTH orientations as slow. The UA test is true in either orientation. */
  assert.doesNotMatch(line[0], /isMobile\s*\(/,
    'the device-class question is not answered by the layout width here');
  assert.match(line[0], /navigator\.userAgent/,
    'it is answered by the user agent, which does not change when the phone is turned sideways');
});

/* spelling kept: browser script (sw.js, js/tile-warm.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R230 ⑤ the satellite prefetch runs in lanes — in both paths', () => {
  const sw = code('sw.js');
  const warm = code('js/tile-warm.js');

  /* THE DEFECT: `Promise.all` over the whole batch put up to 96 fetches in the air in one turn,
     260 ms after the reader stopped moving — i.e. inside the next gesture — each one a connection
     slot, a body read, a Blob and a Cache write, competing with the tiles being drawn. */
  const handler = sw.slice(sw.indexOf("d.type !== 'prefetch'"));
  assert.doesNotMatch(handler.slice(0, 900), /Promise\.all/,
    'the worker does not start the whole batch at once');
  assert.match(sw, /PREFETCH_LANES\s*=\s*\d+/, 'the worker bounds concurrent prefetches');
  assert.match(sw, /while\s*\(\s*_pfLanes\s*<\s*PREFETCH_LANES/, 'and it fills those lanes from a queue');

  /* the queue is module-level, not per-batch: a pan is a run of moveends, so a per-batch limit would
     still let three overlapping batches put 3×N in the air */
  assert.match(sw, /^let\s+_pfQueue\s*=\s*\[\]/m, 'the queue outlives one message (one cursor, every batch)');

  /* the no-worker path is the FIRST load — the one being complained about — and it had the same
     shape: forEach over 60 (110 while tilted) bare fetches */
  assert.doesNotMatch(warm, /uniq\.forEach\s*\(\s*u\s*=>\s*\{[^}]*fetch\(/,
    'the no-service-worker fallback no longer fires the whole ring at once');
  assert.match(warm, /WARM_LANES\s*=\s*\d+/, 'it has lanes of its own');

  /* ⚠ AND THE STATE IT WALKS IS DECLARED ABOVE ITS READER. This file's own header (#R196) says a
     `const` below the function that reads it is a temporal dead zone, and every call site here sits
     inside a try/catch that would swallow it — the prefetch would just silently stop. */
  assert.ok(warm.indexOf('let _warmQueued') < warm.indexOf('function predictivePrefetch'),
    'the queue state is declared ABOVE predictivePrefetch (TDZ inside a try/catch is silent)');
});

/* spelling kept: browser script (sw.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R230 ⑥ …and the worker is held alive until the lanes drain', () => {
  const sw = code('sw.js');
  const handler = sw.slice(sw.indexOf("d.type !== 'prefetch'"));

  /* `Promise.all` gave `waitUntil` the whole batch for free. A queue that resolves the moment it is
     SCHEDULED lets the browser terminate the worker with lanes still in flight — that is not
     "smaller batches", it is silently fewer tiles. */
  /* ⚠ A WINDOW OF 900 CHARACTERS IS NOT THE PROPERTY. The handler grew (a sender check and the tile
     allow-list went in front of the queueing) and `await done` slid past the window — so the test
     failed on code that still does exactly what it asserts. The handler is the end of the file; read
     all of it. */
  assert.match(handler, /await\s+done/,
    'the message handler awaits the drain, so waitUntil covers the fetches and not just the enqueue');
  assert.match(sw, /function\s+pfSettle\s*\(\)[\s\S]{0,200}_pfLanes\s*===\s*0\s*&&\s*_pfQueue\.length\s*===\s*0/,
    'drained means: no lane running AND nothing left queued');
  /* an empty batch must resolve rather than hang forever holding the worker open */
  assert.match(sw, /pfSettle\(\);\s*\n?\s*\}/, 'pfPump settles even when there was nothing to do');
});

/* spelling kept: browser script (js/perf-hud.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R230 ⑦ the census measures what is actually painted, on screen', () => {
  const hud = code('js/perf-hud.js');

  /* #R228 wrote «Measure the intersection, not the rect» in this file's header and left the body
     summing r.width * r.height. Measured this round: 382 % raw against 135 % clipped. */
  assert.match(hud, /Math\.min\(r\.right,\s*VW\)\s*-\s*Math\.max\(r\.left,\s*0\)/,
    'the census clips each rect to the viewport');
  assert.doesNotMatch(hud, /area\s*\+=\s*r\.width\s*\*\s*r\.height/,
    'and no longer bills the off-screen part of a parked sheet');

  /* skip what is genuinely not painted… */
  assert.match(hud, /c\.visibility\s*===\s*'hidden'\s*\)\s*continue/,
    '`visibility:hidden` is not painted, so it is not counted — otherwise this instrument would keep '
    + 'reporting the scrim #R230 just made free');
  /* …but NOT what is painted and invisible, which is the whole defect class */
  assert.doesNotMatch(hud, /c\.opacity\s*===\s*'0'\s*\)\s*continue/,
    '`opacity:0` IS still counted — that was the scrim\'s state for every frame of every gesture, and '
    + 'skipping it would blind the instrument to the defect it just found');
});
}

/* ═══════════════════════ #R231 · from r231-checks.test.mjs ═══════════════════════ */
/* (#R231 — the round's own account of why these checks exist heads its other half, in tests/shell-i18n-locales-checks.test.mjs) */
{
/* whole-line // comments */
const noHtml = (p) => read(p).replace(/<!--[\s\S]*?-->/g, ' ');

/* ── ③ the base-map square ──────────────────────────────────────────────────────────────────── */
/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('R231 base map: the five view controls left the layer sheet for the square', () => {
  const html = read('index.html'), bm = read('js/basemap-switch.js');
  assert.ok(!/m-seg-block/.test(noHtml('index.html')), 'the segmented block is gone from the Map & layers sheet');
  assert.ok(existsSync(join(ROOT, 'js/basemap-switch.js')), 'the module exists');
  assert.match(bm, /window\.IntMapBasemapSwitch\s*=/, 'and publishes an eager global');
  /* the same five real controls, by the ids index.html actually defines */
  const want = ['btn-view-map', 'btn-view-sat', 'btn-view-globe', 'btn-view-flat', 'btn-view-3d'];
  for (const id of want) {
    assert.ok(bm.includes(`data-proxy="${id}"`), `the popover proxies ${id}`);
    assert.ok(html.includes(`id="${id}"`), `…and index.html still owns ${id}`);
  }
  /* the phone's label pass must reach it, or the popover keeps the previous language (#R8's defect) */
  assert.match(read('js/mobile-ui.js'), /const PROXY_SEL=[^;]*#bm-pop \[data-proxy\]/, 'syncControls covers the popover');
  /* it draws from data the app already ships — no new network at boot */
  assert.match(bm, /IntMapWorldBase/, 'the satellite face comes from the bundled Blue Marble');
  /* ⚠⚠ THE FUNCTION IT CALLS MUST BE EXPORTED, and this check exists because it was not. `tile` was
     internal to js/world-base.js — reachable only through the registered tile protocol — so the
     satellite face called `undefined`, caught nothing, and quietly drew the MAP face instead. Caught
     by looking at the live canvas (2 distinct colours where a photograph belongs, 4,658 after the
     fix), which is the only way a silent fallback is ever caught. */
  const wb = read('js/world-base.js');
  const api = /return \{([\s\S]*?)\n  \};/.exec(wb);
  assert.ok(api && /(^|[\s,])tile\s*,/.test(api[1]), 'js/world-base.js exports tile()');
  assert.match(bm, /satFail: _satFail/, 'and a failed satellite face is reported, not swallowed');
  assert.match(bm, /IntMapLandMask/, 'the map face from the bundled land raster');
  assert.ok(!/fetch\(|XMLHttpRequest|\.src\s*=\s*['"`]https?:/.test(bm), 'and it fetches nothing itself');
  /* a deploy that lost the file must show up as a missing global, not as a missing feature */
  assert.match(read('tests/prod-smoke.spec.js'), /'IntMapBasemapSwitch'/, 'named in MODULE_GLOBALS');
  assert.match(read('src/main.js'), /import '\.\.\/js\/basemap-switch\.js';/, 'and imported by the entry');
});
}

/* ═══════════════════════ #R207 · from r207-checks.test.mjs ═══════════════════════ */
/* (#R207 — the round's own account of why these checks exist heads its other half, in tests/shell-panels-tools-checks.test.mjs) */
{
/* ── ① the polar cap is BENEATH everything ─────────────────────────────────────────────────────
   A `background` layer paints the whole viewport, so the only position at which it can be the fix
   for the ±85°–90° gap rather than a curtain over the map is FIRST. The invariant is the order, not
   the text: assert the cap's index in the style's layer list is below every other layer's. */
/* spelling kept: browser script (js/app-body.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R207 ① the polar-cap background is the first layer in the style', () => {
  const s = read('js/app-body.js');
  const i = s.indexOf("{id:'layer-polar-cap',type:'background'");
  assert.ok(i > 0, 'the polar-cap background layer is declared in the style');
  const list = s.indexOf('layers:[', s.lastIndexOf('sources:', i) >= 0 ? 0 : 0);
  /* every other layer declaration in the same array must come AFTER it */
  const arr = s.slice(i, s.indexOf('\n        ],', i));
  const others = [...arr.matchAll(/\{id:'([a-z0-9-]+)'/g)].map((m) => m[1]);
  assert.equal(others[0], 'layer-polar-cap', 'the cap is the first entry of the layer array');
  assert.ok(others.includes('layer-sat'), 'and the satellite layer is in the same array, after it');
  assert.ok(list >= 0);
});

/* ── ② the cap is owned by the satellite floor, and only shown with it ─────────────────────────── */
/* spelling kept: browser script (js/world-base.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R207 ② world-base owns the cap: it is toggled with the satellite basemap and coloured from the picture', () => {
  const s = read('js/world-base.js');
  assert.ok(/function applyCap\(satOn\)/.test(s), 'applyCap takes the satellite state');
  /* ⚠ (#R219) INTENDED REPLACEMENT. #R207 showed the cap only with the satellite basemap; measured
     this round, that left the ±85°–90° hole as the renderer's black on the vector map — the pixel at
     the south polar cap was (7,7,15). The cap is now unconditional and only its COLOUR depends on the
     map above it, so this assertion is inverted rather than dropped: the satellite-only guard must be
     gone, and both vector tones must exist. See DEV-NOTES #R219 §1. */
  assert.ok(/setLayout\(CAP,'visibility','visible'\)/.test(s), 'the cap is shown on every base map (#R219)');
  assert.ok(!/setLayout\(CAP,'visibility',satOn\?/.test(s), 'the satellite-only guard is the #R219 defect');
  assert.ok(/CAP_VEC_LIGHT/.test(s) && /CAP_VEC_DARK/.test(s), 'the vector base map has its own cap tone');
  assert.ok(/polarColour\(\)\.then/.test(s), 'the colour is measured from the shipped picture, not written down');
  /* apply() is the one place the basemap state arrives, so the cap must be driven from there */
  const apply = s.slice(s.indexOf('function apply('));
  assert.ok(apply.indexOf('applyCap(') > 0 && apply.indexOf('applyCap(') < apply.indexOf('return {'),
    'apply() drives the cap');
});
}

/* ═══════════════════════ #R225 · from r225-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  #R225 — the round's own contracts, checked in Node
 * ----------------------------------------------------------------------------
 *  The phone gate is a GPU question, not a layout one · the LRU stopped walking the whole cache ·
 *  the instrument never touches the renderer · the nine geopolitics layers are GONE, everywhere ·
 *  a default-ON row that was switched off stays off.
 * ==========================================================================*/
{
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

/* ── ② THE SERVICE WORKER'S LRU ────────────────────────────────────────────────────────────────────
   `trim()` ran after every stored tile and its first act was `await cache.keys()` — up to 12,000
   Request objects, on the thread the map is waiting on, once per tile. */
/* spelling kept: browser script (sw.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R225 ② the tile cache stops enumerating itself on every store', async () => {
  const sw = read('sw.js');
  assert.match(sw, /let _trimming = false, _n = -1, _sinceCheck = 0;/, 'the count is carried, not re-read');
  assert.match(sw, /const CHECK_EVERY = 64;/);
  assert.match(sw, /if \(_n <= MAX_ENTRIES\) return;\s+\/\* nowhere near the cap/, 'the common case does no walk');
  assert.match(sw, /_n = keys\.length;\s+\/\/ …and re-seed the hint from the truth/,
    'the hint is re-seeded from the real keys, so drift cannot lose a tile');

  /* run the algorithm: 14,000 stores must not be 14,000 walks, and the cap must still hold */
  const MAX_ENTRIES = 12000, TRIM_TO = 10200, CHECK_EVERY = 64;
  let walks = 0, entries = 0, _trimming = false, _n = -1, _since = 0;
  const cache = { keys: async () => { walks++; return new Array(entries); }, delete: async () => { entries--; } };
  async function trim() {
    if (_trimming) return;
    if (_n >= 0) { _n++; if (_n <= MAX_ENTRIES) return; if (_since++ < CHECK_EVERY && _n < MAX_ENTRIES * 1.05) return; }
    _trimming = true; _since = 0;
    try {
      const keys = await cache.keys(); _n = keys.length;
      if (keys.length > MAX_ENTRIES) { const rm = keys.length - TRIM_TO; for (let i = 0; i < rm; i++) await cache.delete(); _n = keys.length - rm; }
    } finally { _trimming = false; }
  }
  for (let i = 0; i < 14000; i++) { entries++; await trim(); }
  assert.ok(walks < 10, `14,000 stores took ${walks} cache.keys() walks`);
  assert.ok(entries <= MAX_ENTRIES && entries >= TRIM_TO, `the cap still holds (${entries} entries)`);
});

/* ── ③ THE INSTRUMENT ──────────────────────────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/perf-hud.js, js/geo-engine.js, src/main.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R225 ③ the perf HUD is opt-in and never touches the renderer', () => {
  const hud = read('js/perf-hud.js');
  assert.match(hud, /if \(!\/\[\?&\]perf=1\\b\/\.test\(location\.search\)\) return null;/, 'dormant unless asked for');
  /* ⚠ the renderer-decoupling ratchet (#R178/#R180): only js/geo-engine.js may hold it */
  assert.ok(!/window\.__imap/.test(hud), 'the HUD must not reach for the renderer handle');
  assert.match(hud, /GE\(\)\.render\.instrumentFrames\(/, 'the frame timing is a contract member');
  assert.match(hud, /GE\(\)\.render\.sceneStats\(\)/, 'and so are the scene counts');
  const ge = read('js/geo-engine.js');
  assert.match(ge, /instrumentFrames\(cb\)\{/); assert.match(ge, /sceneStats\(\)\{/);
  assert.match(ge, /if\(m\.__imFrameInstrumented\) return true;/, 'wrapping twice would time the first wrapper');
  assert.match(read('src/main.js'), /js\/perf-hud\.js/);
});
}

/* ═══════════════════════ #R186 · from r186-checks.test.mjs ═══════════════════════ */
/* (#R186 — the round's own account of why these checks exist heads its other half, in tests/shell-sky-space-checks.test.mjs) */
{
/* (layer-manifest) the lists are views of js/layer-manifest.js */

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n')
  : fs.readFileSync(path.join(ROOT, p), 'utf8'));
const bytes = (p) => fs.readFileSync(path.join(ROOT, p));

/* ── the bundled whole-Earth base ────────────────────────────────────────────────────────────── */

test('R186 world base: the shipped picture is a 2048x1024 equirectangular JPEG', () => {
  const b = bytes('data/world-basemap.jpg');
  assert.ok(b[0] === 0xff && b[1] === 0xd8, 'JPEG SOI');
  let w = 0, h = 0;
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { h = b.readUInt16BE(i + 5); w = b.readUInt16BE(i + 7); break; }
    i += 2 + b.readUInt16BE(i + 2);
  }
  assert.equal(w, 2048); assert.equal(h, 1024);
  /* It has to be small enough to be there before the first frame — that is the whole point of it. */
  assert.ok(b.length < 600_000, `${b.length} bytes is too heavy for a no-wait base`);
  const m = JSON.parse(read('data/world-basemap.json'));
  assert.deepEqual(m.bbox, [-180, -90, 180, 90], 'it must reach the poles — that is what Mercator cannot do');
  assert.match(m.source, /NASA/i);
});
}

/* ═══════════════════════ #R408 · from r408-checks.test.mjs ═══════════════════════ */
/* (#R408 — the round's own account of why these checks exist heads its other half, in tests/shell-layer-panel-checks.test.mjs) */
{
const rd = read;

/* ── ③ THE PREFETCH STOPS WHEN IT IS OVERTAKEN, AND FORGETS WHAT IT DID NOT ASK FOR ───────────*/
/* spelling kept: browser script (js/tile-warm.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R408 ③a: 追い越された先読みは、その場で発行をやめる', () => {
  const s = rd('js/tile-warm.js');
  assert.match(s, /let _pfGen=0, _pfView='';/, '世代カウンタが在る');
  /* ⚠⚠⚠ 世代の鍵は「呼び出し」ではなく**タイル矩形**である。リングは携帯 60 で切られるので、
     同じ視野からの次の呼び出しは「追い越し」ではなく**切り捨てられた残り**——それを捨てると、
     いま見ている視野のために積んであった56件が消え、指が止まると誰も再提示しない。 */
  assert.match(s, /const cont=\(_view===_pfView\); _pfView=_view;/,
    '同じタイル矩形の続きは追い越しではない');
  assert.match(s, /const gen=cont\?_pfGen:\+\+_pfGen;/, '新しい矩形のときだけ番号が動く');
  assert.match(s, /for\(const u of ring\)\{ if\(_pfGen!==gen\) break;/,
    'URL 1件ごとに世代を確かめ、追い越されたらそこで止める');
  /* 3経路: 同期発行・_warmQueued・SW。どれか1つでも落とさないと、止めたつもりで走り続ける。 */
  assert.match(s, /if\(e\.g<_pfGen\)\{ _pfSeen\.delete\(e\.u\); _pfDropped\.queue\+\+; continue; \}/,
    'ポンプが古い世代のエントリを fetch の直前で捨てる');
  assert.match(s, /d\.type==='prefetch-dropped'/, 'SW が捨てた分の報告を受け取る');
});

/* spelling kept: browser script (js/tile-warm.js, sw.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R408 ③b: 捨てた URL を「もう頼んだ」と憶えない（先読みの被覆に穴を空けない）', () => {
  const s = rd('js/tile-warm.js');
  /* ⚠⚠⚠ `_pfSeen` は「一度頼んだ URL は二度と頼まない」という記憶。中止したバッチの URL が
     そこに残ると、その URL は二度と先読みされない——中止機構が、静かに被覆へ穴を空ける。 */
  assert.match(s, /if\(_pfGen!==gen\) break;[\s\S]{0,120}_pfSeen\.add\(u\); uniq\.push\(u\);/,
    '記憶と発行は同じ1手 — 発行しなかった URL は憶えない');
  assert.match(s, /_pfSeen\.delete\(u\)\) _pfDropped\.worker\+\+/,
    'SW 側で捨てられた分は、報告を受けて記憶から取り消す');

  const sw = rd('sw.js');
  assert.match(sw, /d\.type !== 'prefetch' && d\.type !== 'prefetch-more'/,
    'SW は「新しい視野」と「同じ視野の続き」を区別する');
  assert.match(sw, /_pfQueue = _pfQueue\.filter\(\(e\) => \{ if \(e\.c !== cid\) return true; stale\.push\(e\.u\); return false; \}\)/,
    '新しい視野が来たら、同じ client の未処理分だけを捨てる');
  assert.match(sw, /postMessage\(\{ type: 'prefetch-dropped', urls: stale \}\)/,
    '捨てた URL をページへ返す — 返さなければページの記憶は取り消せない');
  /* ⚠ 強さを弱めていないこと（CONSTITUTION §0.3）。上限とレーン数は据え置き。 */
  assert.match(s, /_mob\?110:280/, '傾斜・飛行時の上限は据え置き');
  assert.match(s, /_mob\?60:150/, '通常の上限は据え置き');
});
}

/* ═══════════════════════ #R196 · from r196-checks.test.mjs ═══════════════════════ */
/* (#R196 — the round's own account of why these checks exist heads its other half, in tests/shell-panels-tools-checks.test.mjs) */
{
const rd = read;

/* spelling kept: browser script (js/tile-warm.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R196 ③c the tile prefetch remembers what it has already asked for', () => {
  const w = rd('js/tile-warm.js');
  assert.match(w, /const _pfSeen=new Set\(\);/, 'the memo exists');
  /* ⚠ declared ABOVE its reader — #R189: a const below the function that reads it is a TDZ waiting
     for the one early call, and every call site here is inside a try/catch that would swallow it */
  assert.ok(w.indexOf('const _pfSeen=new Set();') < w.indexOf('function predictivePrefetch('),
    'the memo must be declared before the function that reads it');
  assert.match(w, /\.filter\(u=>!_pfSeen\.has\(u\)\)/, 'the ring is filtered against the memo');
});

/* spelling kept: browser script (src/sat-worker.js, js/sat-proto.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R196 ③d a satellite tile fetch is not abortable, and in-flight requests are shared', () => {
  for (const f of ['src/sat-worker.js', 'js/sat-proto.js']) {
    const s = rd(f);
    assert.doesNotMatch(s, /fetch\((?:url\(z, y, x\)|_satUrl\(z,y,x\)),\s*\{\s*signal/,
      `${f}: the HTTP fetch must not carry the abort signal — cancelling it guarantees a refetch`);
    assert.ok(/inflight|_satFly/.test(s), `${f}: concurrent requests for one tile share a promise`);
    assert.match(s, /signal\s*&&\s*signal\.aborted/, `${f}: the abort still stops the ancestor walk`);
  }
});
}
