/* ============================================================================
 *  The app shell's own UI, as the R147–R159 and #R455 batches left it — the Köppen legend, the area
 *  monitor, satellite imagery, Street View coverage, the toolbar and sidebars, Companies, the news
 *  band and button, and the layer preview images
 * ----------------------------------------------------------------------------
 *  (tests-by-topic) These arrived in rounds that were ABOUT Atlas, so they were filed with Atlas; none
 *  of them is about Atlas. They are grouped here by subject, one section per subject, until each
 *  subject's own file takes them. Every test keeps the title it had:
 *    tests/r147-checks.test.mjs (SV, satellite, monitor) · tests/r149-checks.test.mjs (#7, #3) ·
 *    tests/r150-checks.test.mjs (#6, #3, #8, #1) · tests/r151-checks.test.mjs (#1, #3, #4, #6, #7, #8, #10) ·
 *    tests/r159-checks.test.mjs (#3, #4, #6) · tests/r455-checks.test.mjs (③, ④, ⑥)
 *  ⚠ WHY THESE ARE STILL SPELLINGS: every one asserts CSS, markup or code inside js/app-body.js's
 *  DOMContentLoaded closure (or the modules it builds with the page) — the map, the DOM and the style
 *  engine they describe do not exist in node. The two exceptions read files on disk (the preview PNGs)
 *  and a migration, which are facts about those files.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appSource } from './app-source.mjs';
import { readLF } from '../scripts/eol.mjs';

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */
const migDir = new URL('supabase/migrations/', root);
const migs = readdirSync(migDir).map(f => readFileSync(new URL(f, migDir), 'utf8')).join('\n');
const has = (s) => html.includes(s);
const ok = (s, msg) => assert.ok(has(s), msg || ('missing: ' + s.slice(0, 90)));
const gone = (s, msg) => assert.ok(!has(s), msg || ('should be removed: ' + s.slice(0, 90)));
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readLF(resolve(ROOT, p));

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   The Köppen legend (R149 #3, R150 #3, R151 #3)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
test('R149/R150 #3 Köppen legend stretches to the screen bottom (viewport-based ceiling)', () => {
  /* kept as a spelling: CSS, markup and js/app-body.js closure code — the map, the DOM and the style engine they describe do not exist in node */
  assert.match(html, /max-height:calc\(100dvh - 84px\)/, 'CSS ceiling near full viewport');
  // (#R150) fit is now VIEWPORT-based (down to ~12px above the screen bottom), NOT clamped to content — so the
  // resize grip can be dragged all the way down; the old content-height cap made "一番下まで伸ばせない".
  assert.match(html, /const renderedMax=Math\.round\(window\.innerHeight - top - 8\)/, 'JS fit is viewport-based (R154: 12→8 for more reach)');
  assert.ok(!/const cap=Math\.round\(window\.innerHeight - 84\)/.test(html), 'old content-clamp cap removed');
  assert.match(html, /\.kl-item\{ display:flex; align-items:center; gap:6px; padding:0 4px; cursor:pointer; border-radius:5px; white-space:nowrap;/, 'R152/R153: single-line compact rows (nowrap kills the 2-line wrap; R153 padding 0 for a shorter 30-row block)');
  assert.match(html, /\.kl-item \.kl-nm\{ flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis;/, 'R152: climate name ellipsises on one line');
  assert.match(html, /\.kl-sw\{ width:11px; height:11px;/, 'smaller swatch');
});
test('R150 #3 Köppen legend ceiling is viewport-based so the grip reaches the screen bottom', () => {
  /* kept as a spelling: CSS, markup and js/app-body.js closure code — the map, the DOM and the style engine they describe do not exist in node */
  assert.match(html, /const renderedMax=Math\.round\(window\.innerHeight - top - 8\)/, 'ceiling = viewport bottom (R154: 12→8), not content height');
  assert.ok(!/const cap=Math\.round\(window\.innerHeight - 84\)/.test(html), 'old content-clamp removed');
  assert.match(html, /一番下まで伸ばせない/, 'comment records the exact re-report it fixes');
});
test('R151 #3 Köppen legend clamps to content (stops when all shown) + stable row width', () => {
  /* kept as a spelling: CSS, markup and js/app-body.js closure code — the map, the DOM and the style engine they describe do not exist in node */
  // ceiling = min(viewport, natural content height) — no more stretching into empty space past the last class
  assert.match(html, /const ceil=Math\.min\(renderedMax, Math\.ceil\(naturalBorderBox\)\);/, 'clamp to content OR viewport');
  assert.match(html, /lg\.style\.maxHeight='none'; lg\.style\.height='auto';/, 'measures natural height with a temporary auto');
  // scrollbar gutter reserved so the row text width is constant while resizing
  assert.match(html, /\.koppen-legend \.kl-scroll\{[^}]*scrollbar-gutter:stable;/, 'scrollbar-gutter:stable on the inner scroll');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   The area monitor (R147 #14, R149 #7, R150 #6, R151 #6)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
test('R147 #14 monitor create dialog falls back to the current map view', () => {
  /* kept as a spelling: CSS, markup and js/app-body.js closure code — the map, the DOM and the style engine they describe do not exist in node */
  assert.match(html, /if\(!area\)\{ const mv=mapViewArea\(\); if\(mv\)\{ area=mv; usingView=true; \} \}/,
    'openCreateDialog defaults to mapViewArea when no area is set');
});
test('R149 #7 monitor toast root cause: _toast calls the closure fns (not window.imToast) with an alert fallback', () => {
  // The bug: index.html is NOT a module, so imToast/aiToast are closure-scoped, never on window.
  // Guarding on window.imToast made EVERY monitor toast (incl. create-failure feedback) silently no-op.
  const m = html.match(/function _toast\(msg\)\{[^\n]*\}/);
  assert.ok(m, '_toast is defined on one line');
  const t = m[0];
  assert.ok(/typeof imToast==='function'/.test(t), '_toast uses typeof imToast guard');
  assert.ok(/typeof aiToast==='function'/.test(t), '_toast falls back to aiToast');
  assert.ok(/alert\(String\(msg\)\)/.test(t), '_toast has a guaranteed alert() last resort');
  assert.ok(!/if\(window\.imToast\)\s*return imToast/.test(html), 'the broken window.imToast guard is gone');
});

test('R149 #7 monitor create dialog shows guaranteed INLINE failure feedback', () => {
  /* kept as a spelling: CSS, markup and js/app-body.js closure code — the map, the DOM and the style engine they describe do not exist in node */
  assert.match(html, /id="mon-create-err"/, 'inline error element exists in the create dialog');
  assert.match(html, /const showErr=\(m\)=>\{/, 'create handler has a showErr helper');
  // both the no-area path and the create() failure path surface it
  assert.ok((html.match(/showErr\(/g) || []).length >= 2, 'showErr used for no-area AND create failure');
});
test('R150 #6 monitor save root cause — client sets user_id AND the DB defaults it to auth.uid()', () => {
  // area_monitors.user_id is `not null` + insert RLS `with check (user_id = auth.uid())`; the client row
  // previously OMITTED user_id, so every UI insert failed → "Could not save the monitor."
  // (#R162) IntMapMonitors moved to js/monitors.js, so the session user now arrives through the
  // explicit host interface (H.user, a live getter over currentUser) instead of the closure.
  // Same behaviour — create() still derives user_id client-side rather than omitting it.
  // (#R163) the host parameter was renamed H → HOST (the old name collided with ordinary `H` locals
  // for Height/Hourly in the newly-split modules) and the object itself is now the shared IM_HOST.
  assert.match(html, /const _uid=\(HOST\.user&&HOST\.user\.id\)\|\|null;/, 'create() derives the session user id');
  assert.match(html, /get user\(\)\{ return currentUser; \}/, 'HOST.user is a LIVE read of currentUser (login/logout must not go stale)');
  assert.match(html, /const row=\{ user_id:_uid, name:/, 'insert row now carries user_id (like feedback/bug_reports/donations)');
  // belt-and-suspenders DB default
  assert.match(migs, /alter column user_id set default auth\.uid\(\)/, 'migration adds a DB default of auth.uid()');
});
test('R151 #6 monitor highlight is cleared when the monitor is deleted', () => {
  /* kept as a spelling: CSS, markup and js/app-body.js closure code — the map, the DOM and the style engine they describe do not exist in node */
  assert.match(html, /let _shownMonId=null;/, 'tracks which monitor area is painted');
  assert.match(html, /function showOnMap\(area,points,monId\)\{ try\{ if\(!_ensureLayers\(\)\) return; _shownMonId=\(monId!=null\?monId:null\);/, 'showOnMap records the monitor id');
  assert.match(html, /if\(!error && \(_shownMonId===id \|\| _shownMonId==null\)\) clearMap\(\);/, 'remove() clears the leftover highlight');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   Satellite imagery (R147 #9, R150 #8, R151 #7)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
test('R147 #9 satellite base layer does not use MapLibre’s 300 ms cross-fade', () => {
  /* kept as a spelling: CSS, markup and js/app-body.js closure code — the map, the DOM and the style engine they describe do not exist in node */
  /* (#R191) #R147 was right that 300 ms of half-drawn imagery under a moving finger reads as lag, and
     that is still the contract here. But 0 is a HARD SWAP per tile, and a screenful of children
     replacing their parents one at a time is exactly the reported 点滅 — plus at 0 there is nothing
     holding the parent while the child loads. 180 ms is under the threshold at which a transition
     reads as a delay. What this test pins is the range: fast, and not MapLibre's default. */
  const m = /id:'layer-sat'[\s\S]{0,140}'raster-fade-duration':(\d+)/.exec(html);
  assert.ok(m, 'layer-sat declares a fade duration');
  assert.ok(+m[1] < 300, `layer-sat fade is faster than MapLibre's 300 ms default (got ${m[1]})`);
  assert.match(html, /'satellite':\{type:'raster',tiles:\(window\.__imSatProto\?\['imapsat/, 'satellite source uses the R158 tile protocol (grey-tile fix)');
  assert.match(html, /'satellite':\{type:'raster'[\s\S]{0,400}maxzoom:19,attribution/, 'satellite source maxzoom cap 19');
});
test('R150 #8 satellite: flight-sim prefetches ahead of the aircraft + sat-labels host round-robin', () => {
  /* kept as a spelling: CSS, markup and js/app-body.js closure code — the map, the DOM and the style engine they describe do not exist in node */
  assert.match(html, /window\._imPredictivePrefetch=predictivePrefetch/, 'directional prefetch exposed for the flight loop');
  assert.match(html, /if\(now-\(st\._pfT\|\|0\)>300\)\{ st\._pfT=now; try\{ window\._imPredictivePrefetch&&window\._imPredictivePrefetch\(true\)/, 'flight loop warms tiles ~3.3x/s aggressively (moveend never fires mid-flight)');
  // sat-labels reference source now round-robins BOTH Esri hosts (was one)
  assert.match(html, /'sat-labels':\{type:'raster',tiles:\['https:\/\/server\.arcgisonline\.com[^']*','https:\/\/services\.arcgisonline\.com/, 'sat-labels uses two hosts');
});
test('R151 #7 satellite: flight + tilted-move prefetch keeps 3D imagery ahead', () => {
  /* kept as a spelling: CSS, markup and js/app-body.js closure code — the map, the DOM and the style engine they describe do not exist in node */
  assert.match(html, /function predictivePrefetch\(aggressive\)\{/, 'prefetch takes an aggressive flag');
  assert.match(html, /const RING=aggressive\?7:3/, 'flight uses a deeper directional ring');
  assert.match(html, /window\._imPredictivePrefetch\(true\)/, 'flight loop calls it aggressively');
  /* (#R178) the pitch is read through the engine contract; (#R196) the block moved whole to
     js/tile-warm.js, so the basemap comes from IM_HOST rather than from the shell's own variable —
     same trigger, same numbers, same handler. */
  assert.match(html, /if\(HOST\.mapType!=='sat'\) return; const now=Date\.now\(\); if\(\(GE\(\)\.camera\.getPitch\(\)\|\|0\)>25 && now-_movePfT>320\)\{ _movePfT=now; predictivePrefetch\(true\); \}/, 'tilted 3D drag warms tiles mid-move');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   Street View coverage (R147/R152, R151 #8)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
test('R147/R152 Street View coverage is a cyan light-blue, THINNER line (R152 dropped the glow)', () => {
  /* kept as a spelling: CSS, markup and js/app-body.js closure code — the map, the DOM and the style engine they describe do not exist in node */
  assert.match(html, /'raster-saturation':0\.9/, 'kept saturated cyan');
  assert.match(html, /'raster-hue-rotate':-42/, 'stronger cyan hue');
  // (#R152) the R147 brightness-min:0.5 + contrast:0.15 glow bloated the line — dropped for a thinner stroke
  assert.match(html, /'raster-hue-rotate':-42,'raster-resampling':'linear'/, 'R152: glow paint dropped, linear resampling for thin smooth edges');
  assert.ok(!/'raster-brightness-min':0\.5,'raster-contrast':0\.15/.test(html), 'R152: the brightness-min+contrast glow pair is gone');
});
test('R151 #8 Street View ON auto-shows coverage (restored on close)', () => {
  /* kept as a spelling: CSS, markup and js/app-body.js closure code — the map, the DOM and the style engine they describe do not exist in node */
  assert.match(html, /_covAuto=false/, 'auto-coverage flag declared');
  assert.match(html, /if\(!_cov\)\{ try\{ coverage\(true\); _covAuto=true; \}catch\(_\)\{\} \}/, 'open() enables coverage when it was off');
  assert.match(html, /if\(_covAuto\)\{ _covAuto=false; try\{ coverage\(false\); \}catch\(_\)\{\} \}/, 'close() restores coverage state');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   The toolbar and the sidebars (R151 #4, R159 #3, R159 #4)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
test('R151 #4 toolbar: Radius under Measure menu, Screenshot + link under one Share menu', () => {
  /* kept as a spelling: CSS, markup and js/app-body.js closure code — the map, the DOM and the style engine they describe do not exist in node */
  // Radius button now lives INSIDE the measure dropdown
  assert.match(html, /<div class="measure-dropdown" id="measure-dropdown">[\s\S]*?id="btn-tool-radius"[\s\S]*?<\/div>\s*<\/div>/, 'radius inside measure dropdown');
  // a share menu container wraps the screenshot + share buttons
  assert.match(html, /<div class="share-menu-container">/, 'share menu container exists');
  assert.match(html, /id="btn-share-menu"/, 'share menu trigger exists');
  assert.match(html, /<div class="share-dropdown" id="share-dropdown">[\s\S]*?id="btn-screenshot"[\s\S]*?id="btn-share"[\s\S]*?<\/div>/, 'screenshot + share inside the share dropdown');
  // share menu wiring + i18n
  assert.match(html, /window\._closeShareMenu=/, 'share menu close helper wired');
  assert.match(html, /shareMenuBtn:"Share"/, 'Share menu label (EN)');
  // the measure-menu trigger now reflects an active Radius too
  // (#R170) the 3-D volume tool joined the same Measure menu, so it lights the trigger too. The R151
  // contract being pinned here is "an active radius lights the Measure trigger", not the exact list.
  assert.match(html, /toolMode==='radius'\|\|toolMode==='volume'\|\|!!\(window\.DrawTool/, 'measure trigger reflects active radius (and, since #R170, the 3-D volume tool)');
});
test('R159 #3 right sidebar default width smaller (R160 superseded: 340 → 300)', () => {
  // R160 shrank it once more ("もう少し小さく"): 380→340→300. Assert the CURRENT value so the check stays truthful.
  ok(':root{--lsr-w:min(300px,92vw);}', 'CSS default width 300');
  ok('Math.max(280,Math.min(300,', 'JS default cap 300 (floor 280 kept)');
  gone('--lsr-w:min(380px,92vw)', 'the old 380 default is gone');
  gone('--lsr-w:min(340px,92vw)', 'the old 340 default is gone');
});

test('R159 #4 → R160: LEFT sidebar keeps its mechanism AND the toggle never touches the camera', () => {
  // R160 deleted the R158/R159 per-frame-resize + edge-anchor LOOP and did NOT replace it — the toggle does nothing to
  // the camera (a stray panBy would spin the GLOBE). The left sidebar's original beside-flex mechanism is untouched.
  gone('function _sbCaptureAnchor(side){', 'the R159 per-frame anchor-capture machinery is deleted');
  gone('function _sbReanchor(){', 'the R159 per-frame reanchor machinery is deleted');
  gone('function _sbFrame(){', 'the R159 per-frame resize loop is deleted');
  ok('.sidebar{ position:relative; }', 'solid sidebar keeps its beside-flex mechanism (NOT overlaid)');
  gone('map.panBy([-dx,-dy],{duration:0}); }', 'no edge-pin panBy in the toggle (it rotated the globe)');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   Companies (R150 #1, R151 #1, R151 #10)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
test('R150 #1 Companies icon slot pixel-matches the Countries flag slot (30x30)', () => {
  /* kept as a spelling: CSS, markup and js/app-body.js closure code — the map, the DOM and the style engine they describe do not exist in node */
  assert.match(html, /\.co-logo-box\{ display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px;/, 'logo box is 30x30 like .stat-flag');
});
test('R151 #1 Companies compare shows the Countries-parity empty hint', () => {
  /* kept as a spelling: CSS, markup and js/app-body.js closure code — the map, the DOM and the style engine they describe do not exist in node */
  // i18n key present in all five languages of the single i18n object
  for (const v of ['Tap company rows to select and compare.', '行をタップして会社を選び比較',
    'Unternehmenszeilen antippen zum Auswählen und Vergleichen.',
    'Нажимайте на строки компаний, чтобы выбрать и сравнить.', 'Toca filas de empresas para elegir y comparar.']) {
    assert.ok(html.includes(v), 'coCompareEmpty translation present: ' + v.slice(0, 24));
  }
  assert.match(html, /coCompareEmpty:/, 'coCompareEmpty key defined');
  // renderCoCompareFixed now renders the empty hint instead of removing the tray
  assert.match(html, /if\(!coCompareSet\.size\)\{ panel\.innerHTML=`<div class="scf-empty">\$\{t\('coCompareEmpty'\)\}<\/div>`; return; \}/, 'empty hint rendered (R152: static #co-compare-fixed panel, Countries parity)');
});
test('R151 #10 Companies: batched spark quotes + full-history cache', () => {
  /* kept as a spelling: CSS, markup and js/app-body.js closure code — the map, the DOM and the style engine they describe do not exist in node */
  assert.match(html, /async function _spark\(syms, range, interval\)\{/, 'batched multi-symbol spark helper');
  assert.match(html, /finance\/spark\?symbols='/, 'uses the keyless spark endpoint');
  assert.match(html, /function _histAll\(\)\{/, 'full-history cache builder');
  assert.match(html, /const sp=await _spark\(live\.map\(c=>c\.tk\),'1d','1d'\)/, 'loadPrices fast path uses one batched request');
  assert.match(html, /let all=null; try\{ all=await _histAll\(\); \}catch\(_\)\{\} if\(my!==_hSeq\) return;/, 'setYear reads the year from the cache');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   News — the pin band, and the button named for what it does (R159 #6, #R455 ④)
   ④「ニュースの詳細開くのに、○sourcesの部分をクリックするのはUIとして不自然。ボタンの名前を変えて。」
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
test('R159 #6 news-pin band hides when its hover popup opens', () => {
  // the news-labels (band) mousemove now sets the shared hover feature-state (band opacity → 0), like the dot handler
  ok("hovering the BAND itself must hide the band", 'band mousemove sets the hover state (band collapses)');
  ok("/* (#R159) restore the band when the pointer leaves it */", 'band mouseleave clears the hover state (band returns)');
});
const NE = rd('js/news-events.js');
test('R455 ④a the button leads with the action and keeps the source count', () => {
  /* kept as a spelling: CSS, markup and js/app-body.js closure code — the map, the DOM and the style engine they describe do not exist in node */
  assert.match(NE, /L\('Details \(1 source\)', '詳細（1媒体）'/, 'the singular');
  assert.match(NE, /L\('Details \(\{n\} sources\)', '詳細（\{n\}媒体）'/, 'the plural');
  assert.ok(!/L\('1 source', '1媒体'/.test(NE), 'the bare count is no longer the button’s name');
});

test('R455 ④b it is still the same button, doing the same thing', () => {
  /* kept as a spelling: CSS, markup and js/app-body.js closure code — the map, the DOM and the style engine they describe do not exist in node */
  /* renaming a control must not move it, restyle it, or change what it opens */
  const i = NE.indexOf("btn.className = 'ev-sources'");
  assert.ok(i > 0, 'the class is unchanged, so every spec and CSS rule still finds it');
  const after = NE.slice(i, i + 400);
  assert.match(after, /btn\.title = ev\.outlets\.join\(' · '\)/, 'the outlet list is still the tooltip');
  assert.match(after, /btn\.onclick = \(e\) => \{ e\.stopPropagation\(\); openDetail\(item\); \}/,
    'and it still opens the event detail');
});

test('R455 ④c the map tooltip is NOT the button, and is deliberately left alone', () => {
  /* kept as a spelling: CSS, markup and js/app-body.js closure code — the map, the DOM and the style engine they describe do not exist in node */
  /* js/news-ui.js `_srcCountLabel()` produces the byte-identical string for the hover tooltip and
     the phone popup. Those are descriptive text nobody clicks, so 「3 sources」 is right there — and
     the two strings part company this round on purpose. A future reader who greps 「{n} sources」
     and finds one hit must not conclude the button was missed. */
  const NU = rd('js/news-ui.js');
  assert.match(NU, /IntMapLang\.t\(HOST\.lang,'\{n\} sources','\{n\}媒体'/, 'the tooltip keeps the plain count');
  assert.ok(!NU.includes('Details ({n} sources)'), 'and does not take the button’s name');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   Layer preview images (#R455 ③ ⑥) —「レイヤーサムネイルフォルダに７つ追加したから、それも反映させといて。」
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
const LP = rd('js/layer-previews.js');
test('R455 ③a the seven new captures are committed, referenced, and the tile’s own shape', () => {
  /* kept as a spelling: the preview table is a module constant consumed by the layer panel’s DOM; the PNGs are files on disk and are read as files */
  const added = ['preview_planes.png', 'preview_satellites.png', 'preview_radar.png',
                 'preview_precipfc.png', 'preview_slp.png', 'preview_gusts.png', 'preview_railways.png'];
  const m = /const W=(\d+),H=(\d+)/.exec(LP);
  assert.ok(m, 'the tile declares its own geometry');
  const want = Number(m[1]) / Number(m[2]);
  for (const f of added) {
    assert.ok(existsSync(join(ROOT, f)), f + ' is committed');
    assert.ok(LP.includes("'" + f + "'"), f + ' is named by the IMG table');
    const b = readFileSync(join(ROOT, f));
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    assert.ok(Math.abs(w / h - want) / want < 0.02, f + ' is the tile aspect ratio (' + w + 'x' + h + ')');
    assert.ok(w >= 2 * Number(m[1]), f + ' is at least 2x the tile width (' + w + ')');
  }
});

test('R455 ③b the seven are wired to the layers they are pictures of', () => {
  /* kept as a spelling: the preview table is a module constant consumed by the layer panel’s DOM; the PNGs are files on disk and are read as files */
  for (const [cb, png] of [['dl-planes', 'preview_planes.png'], ['dl-sats', 'preview_satellites.png'],
                           ['dl-radar', 'preview_radar.png'], ['dl-ec-precip', 'preview_precipfc.png'],
                           ['dl-ec-slp', 'preview_slp.png'], ['dl-ec-gust', 'preview_gusts.png'],
                           ['beta-dl-rail', 'preview_railways.png']]) {
    assert.ok(LP.includes("'" + cb + "':'" + png + "'"), cb + ' names ' + png);
  }
});

test('R455 ③c no IMG key is written twice — the last one would silently win', () => {
  /* kept as a spelling: the preview table is a module constant consumed by the layer panel’s DOM; the PNGs are files on disk and are read as files */
  /* `beta-dl-rail` had an upstream OpenRailwayMap tile; the capture REPLACES it rather than being
     appended beside it. A duplicate key is valid JavaScript and invisible until someone reorders. */
  const a = LP.indexOf('const IMG={'), b = LP.indexOf('\n    };', a);
  const rows = [...LP.slice(a, b).matchAll(/^\s*'([a-z0-9-]+)':/gm)].map((x) => x[1]);
  const dup = rows.filter((k, i) => rows.indexOf(k) !== i);
  assert.deepEqual(dup, [], 'duplicate IMG keys: ' + dup.join(', '));
  /* the two OTHER rail layers are different layers and keep their upstream tile */
  assert.ok(LP.includes("'cb-rail2':'https://a.tiles.openrailwaymap.org"), 'cb-rail2 is untouched');
  assert.ok(LP.includes("'ox-oxrail':'https://a.tiles.openrailwaymap.org"), 'ox-oxrail is untouched');
});
test('R455 ⑥ the preview count and byte total match what is on disk', () => {
  /* the same equality #R408 ①d asserts, restated here because this round changed both sides of it */
  const imgs = readdirSync(ROOT).filter((f) => /^preview_.*\.png$/.test(f));
  assert.equal(imgs.length, 35, 'preview_*.png on disk');
  assert.equal(imgs.reduce((n, f) => n + statSync(join(ROOT, f)).size, 0), 4572977, 'total bytes');
});
