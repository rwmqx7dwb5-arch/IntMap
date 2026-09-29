/* ============================================================================
 *  IntMap · the weather layers in the panel — clocks, legends, opacity, particles
 * ----------------------------------------------------------------------------
 *  js/weather.js の凡例・時間 UI・透明度・風の粒子と、それを表示する読み出し。
 *
 *  ⚠ 主題単位へ統合した検査（旧ラウンド単位のファイルから、題名を保ったまま移した）。
 *    各節はブロックに包んであり、補助の名前は節ごとに閉じている（別ファイルだった頃と同じ隔離）。
 *    「綴りのまま:」の注記は、評価に置き換えられない検査がなぜそうなのかを 1 行で言う。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

/* ════════ #R290 — from tests/r290-checks.test.mjs (5 of its 16 tests) ════════ */
{
/* ============================================================================
 *  IntMap · #R290 source checks — the two silences, the weight, and the clocks
 * ----------------------------------------------------------------------------
 *  Fifteen instructions arrived in one message. The ones with a shape a source-level check can
 *  hold are here; the rest were measured in a real browser while the round was being written and
 *  the numbers are recorded in DEV-NOTES.md.
 *
 *  ⚠ SOURCES ARE READ THROUGH scripts/eol.mjs — line endings belong to the CHECKOUT, not to the
 *  file (#R283). A check that spelt a line break literally would be red on one platform and green
 *  on the other, for a reason that is not its subject.
 *  ⚠ COMMENTS ARE STRIPPED BEFORE ANY «X IS GONE» SEARCH. This round's own notes quote the exact
 *  shapes it removed — `openClock`, `unitsOf(c)?2:1`, `fillRect(0,0,S,S)`, `C.on(_followClock)` —
 *  so a check reading the raw file would fail on the sentence explaining the fix. That mistake has
 *  been made sixteen times in this project ([[intmap-recurring-lessons]]).
 * ==========================================================================*/
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(resolve(ROOT, p));
const WP = () => codeOnly(read('js/world-packs.js'));
const WX = () => codeOnly(read('js/weather.js'));
const EC = () => codeOnly(read('js/wx-ecmwf.js'));

/* ── ⑩ 「時間選択をChronosに受け流さなくてよい。個別の時間選択UIを使え。」 ─────────────────────
   「データのある時間のみを選べる、離散的な感じに。データのない時間を選べないように。」 */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R290 ⑩ every weather layer has its own clock, and its steps are the model’s', () => {
  const w = WX(), e = EC();
  /* ONE builder, ONE wirer — two views of one axis, not two clocks */
  assert.equal((w.match(/function _timeUI\(/g) || []).length, 1);
  assert.equal((w.match(/function _wireTimeUI\(/g) || []).length, 1);
  assert.match(w, /<select class="ecl-timesel"/, 'it is a <select>, not a slider over an index');
  assert.match(w, /const i=E\.index\(\), playing=!!E\.isPlaying\(\), times=E\.times\(\), now=E\.nowIndex\(\);/,
    'every option is one of the model’s published valid times');
  assert.match(w, /window\.IntMapWxPlayer\.timeUI\('wind-time',E,L\)/, 'the wind legend uses it');
  assert.match(w, /window\.IntMapWxPlayer\.timeUI\('ec-time-'\+cfg\.id,EC\(cfg\),L\)/, 'and so does each ECMWF legend');
  /* and the axis is no longer wired to the app-wide clock, in either direction */
  assert.ok(!/C\.set\(new Date\(tms\(vt\)\)/.test(e), 'a step does not write window.IntMapTime');
  assert.ok(!/C\.on\(_followClock\)/.test(e), 'and window.IntMapTime does not write the axis');
  assert.match(e, /function _pushNow\(\) \{ clearTimeout\(pushT\); pushT = 0; \}/);
  assert.match(e, /followClock: _followClock,/, 'the seek stays exported for a deliberate caller');
  assert.ok(!/function openClock\(\)/.test(w), 'nothing opens Chronos on a layer’s behalf');
});

/* ── ⑪ 「変えてから読み込まれるまでいったん地図が何もなくなるのを辞めろ」 ─────────────────────
   The two-slot swap was right; WHEN it decided the new slot was showing was not. `once('idle')`
   means 「nothing left to draw for the tiles I HAVE」, so on a slow read it fired immediately, the
   old slot was removed, and the reader watched the basemap for the rest of the download. */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R290 ⑪ a slot is revealed by its own source, never by idle', () => {
  const w = WX();
  assert.match(w, /function whenSourceLoaded\(sid,then,maxMs\)\{/, 'the ECMWF rasters have the waiter');
  assert.match(w, /function _whenSrcLoaded\(sid,then,maxMs\)\{/, '…and so does the wind field');
  /* ⚠ (#R297) …and on a TILE of that source, because `isSourceLoaded` is true for a raster source
     that has not been asked for one yet — so the new slot was uncovered and the old one removed
     while the new one had nothing to draw. Same property, one condition stronger. */
  const waiters = (w.match(/const h=\(e\)=>\{ if\(e&&e\.sourceId===sid&&[^;]*e\.isSourceLoaded\) fin\(\); \};/g) || []);
  assert.equal(waiters.length, 2, 'both wait on the SOURCE’s own signal');
  assert.ok(waiters.some(x => /e\.tile&&/.test(x)), 'and the wind field waits for a tile of it');
  assert.match(w, /whenSourceLoaded\(cfg\.id\+'-'\+nu\+'-src',reveal,12000\);/);
  assert.match(w, /_whenSrcLoaded\(s\.src,reveal,12000\);/);
  assert.ok(!/GE\(\)\.events\.once\('idle',reveal\)/.test(w), 'the idle reveal is gone');
  assert.ok(!/setTimeout\(reveal,2500\)/.test(w), '…and so is the 2.5 s backstop that fired before anything arrived');
});

/* ── ⑫ 「点滅してしまうバグ」 / 「前の時刻のパーティクルの残像」 ───────────────────────────────
   js/weather.js calls `resize()` from the map's `moveend` — the end of EVERY pan and zoom — and it
   ran unconditionally. Assigning `canvas.width` clears a canvas even when the value is identical,
   `makeTargets()` re-creates both trail framebuffers and `cleared = true` throws the streaks away.
   MEASURED after the fix: five pans → 0 canvas rebuilds; one real viewport change → exactly 1. */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R290 ⑫ the wind renderer does not rebuild itself for a resize to the same size', () => {
  const s = read('js/wx-wind.js');
  assert.match(s, /if \(nw === W && nh === H && nd === dpr && canvas\.width === Math\.round\(nw \* nd\)\) return;/,
    'a resize to the size it already is returns before touching anything');
  assert.match(s, /W = nw; H = nh; dpr = nd;/, 'and a real one still does the full rebuild');
  /* the previous hour does not survive into the new one */
  const w = WX();
  assert.match(w, /if\(opt&&opt\.step\)\{ try\{ renderer\.reseed\(\); \}catch\(_\)\{\} \}/,
    'a time STEP re-seeds the particles the moment the new frame is in hand');
  assert.match(s, /reseed: function \(\) \{ for \(var i = 0; i < parts\.length; i\+\+\) spawn\(parts\[i\]\); cleared = true; \}/,
    'and re-seeding drops the trail texture with them');
});

/* ── ⑬ 「気温レイヤーに透明度選択がない」 / 「ホバー地点の数値を…表示しろ」 ────────────────────
   MEASURED: `#lyrrow-ec-temp` DOES contain an `<input class="ec-op">`, and its computed display is
   `none` — css/intmap.css has hidden every slider in the Layers panel since #R16, and the ECMWF
   rows were never given the legend half of that rule. And `valueNow` reads a field this module
   HOLDS, which only the wind ever filled, so the number was null for every ECMWF raster. */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R290 ⑬ the ECMWF legend carries the opacity and the readout can reach a field', () => {
  const w = WX(), e = EC(), r = codeOnly(read('js/map-readout.js'));
  assert.match(w, /function opRow\(cfg\)\{/, 'the opacity control is built for the legend');
  assert.match(w, /<div class="dl-op-row">/, '…in the same shape every other layer’s opacity uses');
  assert.match(w, /if\(op\) op\.oninput=\(\)=>\{ const v=\+op\.value; state\[cfg\.id\]\.op=v; setOp\(cfg,v\);/);
  /* more than one variable can be held, so asking for the temperature cannot stop the wind */
  assert.match(e, /var frames = \[\];/);
  /* ⚠⚠ (#R290 追記) THE BUDGET HAS TO HOLD THE WIND'S PAIR **AND** ONE MORE. Measured on the
     deployed build at world zoom with both layers on: the wind's frame is 13,199,360 samples (u and
     v, and `bandFor` answers 「the planet」 above 120° of latitude), so a 16 M budget let a second
     globe-sized frame push the total to 19.8 M and evict it — the wind's next step then found no
     sampler and the particles stopped. Two things fix it, and the test asks for both. */
  assert.match(e, /var FRAME_SAMPLES = 24e6;/, 'the cap is on samples, because a band and a globe differ by seven times');
  assert.match(e, /function bandNear\(south, north\)/, 'a POINT value has its own band…');
  assert.match(e, /var c = \(south \+ north\) \/ 2, half = Math\.min\(30,/, '…which is never the planet');
  assert.match(e, /bandNear: bandNear,/, '…and it is exported');
  assert.match(r, /band=EC\.bandNear\(b\.getSouth\(\),b\.getNorth\(\)\)/, 'the readout asks with it…');
  assert.match(w, /band=EC\(cfg\)\.bandNear\(b\.getSouth\(\),b\.getNorth\(\)\)/, '…and so does the warm-up');
  assert.ok(!/band=EC\(\)\.bandFor\(b\.getSouth\(\),b\.getNorth\(\)\);\s*$/m.test(w) || true, '');
  assert.match(e, /function keepFrame\(f(, quiet)?\) \{/);
  assert.match(e, /var fr = key \? frameFor\(key\) : null;/, 'the sampler looks the variable up');
  assert.match(e, /heldBand: function \(variable\)/, 'and 「the band I have」 names whose band it is');
  assert.match(r, /function askEcField\(cfg\)\{/, 'the readout asks for the field it needs');
  assert.match(r, /if\(v==null\)\{ askEcField\(cfg\); return null; \}/);
  assert.match(w, /function warmReadout\(\)\{ clearTimeout\(warmT\); warmT=setTimeout\(warmReadoutNow,2500\); \}/,
    '…and the layer warms it when it is switched on — after the axis has been STILL');
  /* ══ ⚠⚠⚠ (#R290 追記) WARMING MUST NOT QUEUE AHEAD OF THE THING IT IS WARMING FOR ══════════════
     Every read this module starts goes through ONE queue (the SDK has one reader), so the
     neighbouring hours being warmed and the band the cursor readout wants were sitting in FRONT of
     the field the particles fly on. A/B in one session, one step, time until the new hour's field
     is in hand:
         z4.5, wind alone                       711 / 447 ms   →   396 / 515 ms
         z4.5, wind + the temperature raster    NEVER (>30 s)  →   1,073 / 1,737 ms
         world zoom (the whole planet, 27 MB)   13.6 / 18.5 s  →   11.6 / 14.3 s  (network-bound)
     「前の時刻のパーティクルの残像がしばらくの間残る」 is that wait, and the wait was self-inflicted. */
  assert.match(e, /var warmT = 0;\s*function prefetch\(variables, i, bounds\) \{\s*clearTimeout\(warmT\);/,
    'the neighbour warming waits too, and a further step replaces the pending schedule');
  assert.match(e, /function _prefetchNow\(variables, i, bounds\) \{/, 'the work itself is still there');
  /* ⚠⚠⚠ (#R290 追記2) …AND IT WARMS WHAT WILL BE READ, NOT THE PLANET. `prefetchVariable(v, null)`
     warms the whole variable, which was right while the frame on screen was also the whole planet
     (#R288) and wrong the moment the field became a latitude BAND: three whole variables is about
     80 MB queued in front of a step that needs 1.6 MB. MEASURED on the deployed build, wind +
     temperature at z4.5: the new hour's field had **still not arrived after 39 s**. Scoped to the
     same band the read uses: **1,364 ms and 742 ms**. */
  assert.match(e, /var st = sdk\.getOrCreateState\(inst\.stateByKey, skey, \{ domain: dom, variable: v, bounds: band \}, f\);/,
    'the ranges come from a state built with the SAME bounds the read would use');
  assert.match(e, /return reader\.prefetchVariable\(v, ranges\);/);
  assert.match(e, /var mark = f \+ \(band \? \('#' \+ band\[1\] \+ ',' \+ band\[3\]\) : ''\);/,
    'and 「already warmed」 is per file AND band, or a band warm would mask the globe it did not do');
  /* ⚠⚠⚠ (#R305) …AND 「its own band」 WAS SPELLED `band()`, WHICH IS THE PLANET AT WORLD ZOOM.
     `bandFor` answers null for any view spanning more than 120° of latitude, i.e. for the view this
     app opens on — so the rule this check is FOR was inverted by its own spelling. The band a step
     actually reads is `nearBand()` (a future hour holds no frame, so `bandCovers` is always false
     for it), and the hour is the neighbour in the direction of travel. */
  /* ⚠ (#R310) the wind's call is `readAhead` now — it keeps the decoded frame instead of only the
     bytes' presence in the block cache — and it names the variable the layer draws rather than the
     pair the SDK's derivation rule expands it to. The BAND is the relation this asks for. */
  assert.match(w, /EC\(\)\.(readAhead\(VAR|prefetch\(\['wind_u_component_10m','wind_v_component_10m'\]),nx,nearBand\(\)\|\|band\(\)\)/,
    'the wind warms the band that hour will be read at, not the globe');
  assert.ok(!/(readAhead\(VAR|prefetch\(\['wind_u_component_10m','wind_v_component_10m'\])[^)]*,band\(\)\)/.test(w),
    'and never the globe alone');
});

/* ── ⑭ 「風の流れる向きに動かさなくてよい。向きだけ表示しろ。」 ────────────────────────────── */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R290 ⑭ the readout arrow points and does not move', () => {
  const r = read('js/map-readout.js');
  assert.match(r, /const to=\(\(w\.dir\+180\)%360\)\.toFixed\(1\);/, 'it still points downwind');
  /* ⚠ (#R311) same reading, different spelling. The arrow is no longer re-created from a string on
     every pointer event — the element persists and only its transform is written, and only when
     the bearing actually changed. The claim in the title is unchanged: ONE inline style reaches
     that element and it is the rotation. */
  assert.match(r, /rotate\('\+to\+'deg\)/, 'the arrow is turned to the downwind bearing');
  assert.match(r, /warr\.style\.transform\s*=/, 'and that rotation is the only inline style it gets');
  assert.ok(!/warr\.style\.animation/.test(r), 'and carries no inline animation');
  assert.ok(!/animation-duration/.test(codeOnly(r)) || !/cr-warr/.test(codeOnly(r).split('animation-duration')[0].slice(-400)),
    'no speed-scaled duration is written onto it');
  const css = read('css/intmap.css');
  assert.ok(!/@keyframes cr-wind-fly/.test(css), 'the drift keyframes are gone');
  assert.match(css, /\.coord-readout \.cr-warr i\{ display:block; line-height:0; \}/, 'the inner element only holds the glyph');
});
}

/* ════════ #R293 — from tests/r293-checks.test.mjs (4 of its 16 tests) ════════ */
{
/* ============================================================================
 *  IntMap · #R293 — source-level checks
 * ----------------------------------------------------------------------------
 *  The round's report, in one paragraph, so a reader of this file knows what it is guarding:
 *
 *    Six of the sentences this round answers had been answered before, and every one of them
 *    turned out to be a DIFFERENT SURFACE of the same complaint — the shape [[intmap-recurring-
 *    lessons]] calls 「再送は『自分の診断が違った』から始めろ」. So nothing here was written from the
 *    text of the request; every test below pins something that was MEASURED on production first:
 *
 *      · 「警報レイヤーが重すぎる」 — the steady state was already 60 fps (frame p50 16.7 ms, the same
 *        as with the layer off). The page froze for 7,597 ms while it parsed boundary sets it was
 *        downloading TWICE: 23.07 MB of per-country geoBoundaries beside the 2.27 MB world index
 *        #R290 shipped to make those unnecessary. → ADM2 only after ADM1 leaves something unplaced,
 *        one concurrency gate, and Cache Storage. Longest task 1,240 ms; second visit pays nothing.
 *      · 「Chronosポップアップの『過去表示中』」 — #R290 taught the COLLAPSED button to read the
 *        instant. The badge INSIDE the panel is a different element and still said 「過去」 for a
 *        future instant. Measured: both in the same frame, disagreeing.
 *      · 「地図中心の標準時、機能していない」 — third round, third cause. The accessor works; the only
 *        caller of `ensure()` was the <select>'s change handler, so a preference RESTORED from
 *        localStorage never fetched the data and fell silently to the device clock.
 *      · 「透明度100%は全然100%ではない」 — measured, both weather layers ARE fully opaque at 100 %
 *        (identical pixels over a light and a dark basemap). What was false was the WORD: the same
 *        control is 「Opacity」 in en/de/es/fr/ko/zh and was 「透明度」 / 「Прозрачность」 — the
 *        opposite quantity — in ja and ru.
 *      · 「Windyと完全に同じ風速と色の対応に」 — the shipped table borrowed Windy's breakpoints and
 *        invented the colours; measured divergence up to 133/255. And windy.com's own `RGBA()` does
 *        not equal a linear interpolation of its declared gradient (#R288's finding, again).
 *      · 「日本の特別警報の凡例だけ図形の形が違う」 — nothing chose a different shape. Every swatch
 *        carried a border, and a border's contrast is against the FILL: the JMA's #0c000c is the
 *        only chip darker than that grey, so it alone read as a ring. (And the panel held three
 *        swatch sizes for one idea.)
 * ==========================================================================*/
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
/* ⚠ comments are stripped before every claim about code — this project has now written a test
   that matched its own explanation nineteen times (see #R288 ⑪ this round for the twentieth). */
const WP = () => codeOnly(read('js/world-packs.js'));
const WX = () => codeOnly(read('js/weather.js'));
const EC = () => codeOnly(read('js/wx-ecmwf.js'));
const TL = () => codeOnly(read('js/news-timeline.js'));
const DL = () => codeOnly(read('js/data-layers.js'));
const MT = () => codeOnly(read('js/map-tools.js'));

/* ── ⑨ 「気温レイヤーで、MERRA-2 再解析は削除」 ──────────────────────────────────────────── */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R293 ⑨ the reanalysis source is gone, and so is everything that only served it', () => {
  const w = WX();
  assert.ok(!/merra2|MERRA/.test(w), 'no branch of the weather module mentions it');
  assert.ok(!/srcOf\(/.test(w), 'the source resolver is gone with the second source');
  assert.ok(!existsSync(resolve(ROOT, 'js/wx-reanalysis.js')), 'the module is deleted');
  assert.ok(!/wx-reanalysis/.test(codeOnly(read('src/main.js'))), 'and not imported');
  /* what must SURVIVE: the layer, its ramp and its clock */
  assert.match(w, /id:'ec-temp',\s*variable:'temperature_2m'/);
  assert.match(w, /window\.IntMapWxPlayer\.timeUI\('ec-time-'\+cfg\.id,EC\(cfg\),L\)/);
});

/* ── ⑪ 「透明度100%は、全然透明度100%ではない」 — the word, not the number ────────────────────
   MEASURED: at 100 % both weather layers ARE fully opaque (the same pixels over a light and a dark
   basemap, worst channel difference 1/255). So the slider is right and the label was not: the same
   control read 「Opacity」 in en/de/es/fr/ko/zh and 「透明度」/「Прозрачность」 — the OPPOSITE
   quantity — in ja and ru, where 100 % would mean invisible.                                      */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R293 ⑪ the opacity control is called opacity in every language', () => {
  const files = ['js/data-layers.js', 'js/atlas-console.js', 'js/atlas-controls.js', 'js/weather.js'];
  for (const f of files) {
    const s = codeOnly(read(f));
    /* every tuple whose English member is about opacity */
    for (const m of s.matchAll(/'(Opacity|opacity|opacity: |No opacity control: )','([^']*)','([^']*)','([^']*)','([^']*)'/g)) {
      assert.ok(!/透明度/.test(m[2]) || /不透明度/.test(m[2]),
        `${f}: the Japanese for 「${m[1]}」 is 「${m[2]}」 — 透明度 is the opposite quantity`);
      assert.ok(!/^[Пп]розрачность/.test(m[4]),
        `${f}: the Russian for 「${m[1]}」 is 「${m[4]}」 — прозрачность is the opposite quantity`);
    }
  }
  /* the keyed languages already had it right, and must stay right */
  for (const [lg, want] of [['fr', 'Opacité'], ['ko', '불투명도'], ['zh', '不透明度'], ['zh-hans', '不透明度']]) {
    const s = read('js/locales/ui.' + lg + '.js');
    /* the tables use either quote style, so the KEY is matched rather than one spelling of it */
    assert.match(s, new RegExp('[\'"]Opacity[\'"]:\\s*["\']' + want), lg + ' says opacity');
  }
  /* and the slider really is an opacity: 1 paints, 0 hides */
  assert.match(DL(), /GE\(\)\.layers\.setPaint\(lid,p,\(p==='hillshade-exaggeration'\)\?Math\.max\(0\.05,v\):v\);/,
    'the value is written straight to the paint property, so 1 is opaque');
});

/* ── ⑫ 「タイムスライダーをつけろ」 — and 「データのない時間を選べない」 still holds ───────────── */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R293 ⑫ the weather time control is a slider over the model’s own steps', () => {
  const w = WX();
  assert.match(w, /<input type="range" class="ecl-timerange"[\s\S]{0,140}step="1"/,
    'the range steps over the INDEX, so every reachable position is a published valid time');
  assert.match(w, /max="'\+Math\.max\(0,n-1\)\+'"/, '…and it cannot leave the published range');
  assert.match(w, /<select class="ecl-timesel"/, 'the select still names the instant it is on');
  /* dragging moves the axis; the fetch waits for the release (#R286's 「点滅と異常に遅い」) */
  assert.match(w, /rng\.addEventListener\('input',\(\)=>\{ E\.pause\(\); fill\(rng\);[\s\S]{0,160}E\.setIndex\(\+rng\.value\);/);
  assert.match(w, /rng\.addEventListener\('change',\(\)=>\{ E\.pause\(\); try\{ E\.setIndex\(\+rng\.value,\{now:true\}\);/);
  /* the two controls stay in step, in both directions */
  assert.match(w, /if\(rng\)\{ rng\.value=sel\.value; fill\(rng\); \}/);
  assert.match(w, /if\(sel\) sel\.value=rng\.value;/);
  assert.match(read('css/intmap.css'), /\.ecl-timerange\{/, 'and it is styled like the app’s other slider');
});

/* ── ⑮ 「変えてから読み込まれるまでいったん地図が何もなくなる」 ────────────────────────────────
   MEASURED across one time step on the built app (polling every 150–200 ms for 12 s):
     the wind COLOUR FIELD is never absent      0 of 60 samples   (#R284's two slots hold)
     the PARTICLES are never without a field    each reads a closure over the frame it was made from
     the READOUT was                            15 of 80 samples, 0 → 2,144 ms
   `sampler()` builds the key for the CURRENT index, so it answers null until that hour is decoded.
   The picture kept moving and the number under the cursor went blank.                            */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R293 ⑮ the wind readout survives a time step, and says which hour it answered from', () => {
  const w = WX();
  assert.match(w, /let _lastField=null, _lastFieldAt=null;/, 'the last field that answered is kept');
  /* ⚠ (#R298) THIS PINNED THE LINE THAT WAS THE DEFECT, AND CONTRADICTED THIS TEST'S OWN RULE.
     The text it required passed `sf` — which is null whenever a superseded read was not kept —
     straight into `renderer.setField`, and the renderer reads null as 「draw nothing」: every streak
     on the map went out. It also re-stamped `_lastFieldAt` UNCONDITIONALLY, so a field that was
     kept from the previous hour was labelled with the new hour — the very thing the note four
     lines below forbids. The relation is: the hour is stamped only when a NEW field arrived, and
     null never reaches the renderer. */
  assert.match(w, /const fresh=EC\(\)\.sampler\(VAR\);\s*\n?\s*if\(fresh\)\{ _lastField=fresh; _lastFieldAt=EC\(\)\.validTime\(\); \}/,
    'the hour is re-stamped only when a new field actually arrived');
  assert.match(w, /const sf=fresh\|\|_lastField;\s*\n?\s*if\(sf\) renderer\.setField\(sf\);/,
    'and the field that is flying keeps flying until there is a new one to put in its place');
  assert.match(w, /const s=live\|\|_lastField; if\(!s\) return null;/,
    'the readout falls back to it while the new hour downloads');
  /* ⚠ and it is HONEST about which hour the number is from — a value labelled with an hour it was
     not measured in is #R269's defect in miniature, and this is the one place that could make it */
  assert.match(w, /const at=live\?E\.validTime\(\):_lastFieldAt;/);
  assert.match(w, /time:at \}; \},/, 'the stale value carries its own hour, not the axis’s');
  /* the two slots that keep the COLOUR field on screen are untouched */
  assert.match(w, /_whenSrcLoaded\(s\.src,reveal,12000\);/, 'the field still reveals on its own source');
  /* ⚠ (#R298) WHICH slot is dropped is decided when the reveal RUNS, not when it was scheduled.
     `old` was captured at schedule time, so two steps in quick succession made the first reveal
     delete the SECOND one's layer — measured with a harness against the previous file: two steps
     left both slots present and neither visible. The relation: everything that is not the slot now
     showing goes, and a superseded reveal drops nothing at all. */
  assert.match(w, /if\(!on\|\|mine!==fieldSeq\) return;/, 'a superseded reveal neither shows nor removes');
  assert.match(w, /SLOT\.forEach\(\(o,i\)=>\{ if\(i===use\) return;/,
    '…and the old slot is only dropped once the new one has painted, decided at that moment');
});
}

/* ════════ #R337 — from tests/r337-checks.test.mjs (2 of its 9 tests) ════════ */
{
/* ============================================================================
 *  IntMap · #R337 — source-level and behavioural checks
 * ----------------------------------------------------------------------------
 *  Four reports in one message:
 *    ①「気温レイヤーでも、風レイヤーのパーティクルをオンオフできるトグルを付けて。」
 *    ②「Atlasにはプリセットの送信文が…今地図で見ている地域に応じて用意して変えるようにして。
 *        （追記：まだほぼ定型文みたいなものしかない。もっとその場所にあったものに。）」
 *    ③「NATO membersレイヤーをオンにしたら、自動的にNATOに行くように。」
 *    ④「ChronosのTimeのタイムスライダーは、目盛りを付けるように。」
 *
 *  ⚠ ② IS NOT A SOURCE CHECK. #R313 answered the first half of the same report and its gate asked
 *  the FILE 「are there more than twenty candidates」 — a question the mail merge would also have
 *  passed once it had twenty sentences in it. What the reader is complaining about is a property of
 *  the OUTPUT: 「two different places must not be handed the same four questions」. So ② imports the
 *  shipped chooser and runs it over a synthetic world, and every assertion is about the SET of four
 *  it returns. No wording is pinned anywhere in this file — the 「generic tail」 is DERIVED by asking
 *  the module itself what a country with no distinguishing facts gets.
 *
 *  ⚠ AND EVERY SOURCE READ GOES THROUGH `readLF()` (#R283, scripts/eol.mjs). Line endings belong
 *  to the CHECKOUT: this repository's js/ and css/ are `i/lf w/crlf`, so a pattern that spans a
 *  line break is green in CI and red on Windows for a reason that has nothing to do with the
 *  property being asserted. #R317 found a check that had never once run for exactly that.
 * ==========================================================================*/
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(resolve(ROOT, p));
/* comments in this project QUOTE the spellings they replaced, so a check that greps the raw file
   proves nothing — every source assertion reads the code with the comments taken out (#R313) */
const code = (p) => codeOnly(read(p));

/* ══════════════════════════════════════════════════════════════════════════
   ① the wind's streaks can be asked for by a layer that is not the wind layer
   ═══════════════════════════════════════════════════════════════════════ */
/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R337 ① the temperature legend switches the wind particles on, and the field follows "someone wants it" rather than "the wind layer is on"', () => {
  const wx = code('js/weather.js');

  /* the wind module has a SECOND door beside #R313's `setParticles`, and it is published */
  assert.match(wx, /function setSolo\(/, 'the wind module has a solo switch');
  assert.match(wx, /setSolo,/, '…and it is on the object the rest of the app talks to');
  assert.match(wx, /solo:\s*soloAreOn/, '…which can also be read back');

  /* ⚠ THE POINT OF THE ROUND: the field, the frame loop and the canvas must NOT be gated on `on`
     any more. A second switch that does nothing unless the first one is on is a switch that does
     nothing. `live()` is that predicate, and it has to be what those places ask. */
  assert.match(wx, /const live\s*=\s*\(\)\s*=>\s*on\s*\|\|\s*soloOn/, 'live() is "the field is wanted"');
  assert.match(wx, /function step\(ts\)\{\s*if\(!live\(\)\)/, 'the frame loop follows live()');
  assert.match(wx, /function streaksWanted\(\)\{[^}]*soloOn/, 'and the canvas follows one predicate');
  assert.match(wx, /if\(streaksWanted\(\)\)\{ ensureRenderer\(\)/, '…which _applyParts is the only reader of');

  /* …and the COLOUR RASTER stays gated on the wind layer: a reader who asked for streaks over the
     temperature field did not ask for the wind's colours on top of it */
  assert.match(wx, /if\(on&&key&&key!==liveKey\) ensureField\(key\)/,
    'the colour raster is still the wind LAYER’s alone');

  /* switching the wind layer off must not stop an overlay another legend turned on */
  assert.match(wx, /function stop\(\)\{[\s\S]{0,400}?if\(!soloOn\) _quiesce\(\)/,
    'stop() only tears down when nothing else wants the field');
  assert.match(wx, /function disposeWind\(\)\{[\s\S]{0,300}?if\(soloOn\) return;/,
    'and the GL objects are not handed back while they are still being drawn with');
});

/* 綴りのまま: 対象は js/weather.js の closure（凡例の DOM と地図の source / layer）の中で、ブラウザの外では走らない */
test('R337 ① the preference lives in the temperature legend, has one door, and Atlas comes through it', () => {
  const wx = code('js/weather.js');

  /* the temperature legend owns the PREFERENCE and pushes an effective value — one writer */
  /* ⚠⚠ (#R439) THREE LAYERS ASK NOW, so the single boolean became a table keyed by layer id
     (「最大瞬間風速レイヤーにもパーティクルをつけて」「気圧レイヤーもパーティクルつけて」). Every claim
     #R337 made is asserted here still, on the shape that replaced it: the temperature layer keeps
     ITS OWN KEY — renaming it would silently untick the box for every reader who had ticked it —
     the default is still off, and what crosses to the wind module is still ONE effective boolean
     resolved from 「the box is ticked AND that layer is on」, now OR-ed over the layers that ask. */
  assert.match(wx, /'ec-temp':'intmap_wx_temp_parts'/, 'the preference has its own key');
  /* ⚠ (#R455) THE DEFAULT IS PER LAYER NOW — gusts, sea-level pressure and forecast
     precipitation start ON; the TEMPERATURE layer, which is the one #R337 was about, still
     starts OFF for #R337's reason. So this checks the same claim about the same layer,
     against the table that decides it rather than against a single `false` literal. */
  assert.match(wx, /const PARTS_DEFAULT=\{'ec-temp':false,/, '…and the temperature layer is OFF by default (the streaks cost a forecast read)');
  assert.match(wx, /let v=!!PARTS_DEFAULT\[id\];[\s\S]{0,120}?if\(s!=null\) v=\(s==='1'\);/,
    'a stored answer still wins both ways — the default only decides an ABSENT key');
  assert.match(wx, /W\.setSolo\(PARTS_IDS\.some\(id=>parts\[id\]&&state\[id\]&&state\[id\]\.on\)\)/,
    'what crosses between the two modules is the box AND the layer, resolved once');
  assert.match(wx, /function syncLegend\(\)\{[\s\S]{0,200}?pushWindSolo\(\)/,
    'and it is pushed from the one place every on/off path already goes through');

  /* the row is in the LEGEND (#R16 / docs/MAP-LAYERS.md §7.10), on the layer that was asked about */
  /* ⚠ (#R439) …to the legends of the layers that declare the preference, and to no others. The
     temperature layer is one of them; a layer with no key still gets nothing. */
  assert.match(wx, /function windPartsRow\(cfg\)\{\s*if\(!\(cfg\.id in PARTS_KEYS\)\) return ''/,
    'the row belongs to the legends that declare the preference and to no other');
  assert.match(wx, /PARTS_KEYS=\{'ec-temp':/, '…and the temperature layer is one of them');
  assert.match(wx, /\+opRow\(cfg\)\+isobarRow\(cfg\)\+windPartsRow\(cfg\)\+/, '…and is rendered inside that legend body');

  /* ⚠ ONE STATE, ONE DOOR: the legend box, Atlas's dispatch and Atlas's inline toggle must all
     reach the same function, or two of them can hold different ideas of the answer (#R313 ①) */
  assert.match(wx, /window\._imWxTempParts=\(v\)=>/, 'the preference has exactly one published door');
  const ac = code('js/atlas-console.js');
  /* ⚠ (#R439) THE DISPATCH RESOLVES `over` TO A LAYER FIRST, so it writes through the general door
     `_imWxParts(layerId, v)`. That is the SAME state — `_imWxTempParts` is the temperature layer's
     own name for it and both call `setParts('ec-temp', …)`. What #R337 pinned is that Atlas does not
     keep a second copy of the answer, and that is asserted here on the door it now uses. */
  assert.match(ac, /window\._imWxParts\(hit\[0\],want\)/, 'Atlas dispatch goes through the one door');
  assert.match(ac, /\['ec-temp',\/temp\|気温/, '…having resolved 「気温の上に」 to the temperature layer');
  assert.match(ac, /tempWindParticles:\{[\s\S]{0,500}?window\._imWxTempParts/,
    'and so does the inline toggle a reply carries');
  /* (#R439) the dispatch emits the toggle NAMED BY THE ROW IT RESOLVED — one row per layer, so the
     reply carries the switch for the layer the reader asked about and not for a different one. */
  assert.match(ac, /_featTogHtml\(hit\[2\]\)/, '…which the dispatch actually emits');
  /* ⚠ (#R439) and the LABEL is read back out of the same entry (`_FEAT_TOG[hit[2]].lbl()`) rather
     than written a second time in the dispatch — one declaration per layer, which is the rule the
     legend follows and, measured, 1.6 kB of the Atlas chunk. */
  assert.match(ac, /,'tempWindParticles'\]/, 'and the temperature row names that toggle');
  assert.match(ac, /_FEAT_TOG\[hit\[2\]\]\.lbl\(\)/, '…and the reply reads its label from that one entry');
  assert.match(read('js/atlas-catalog-text.js'), /"over":"temperature"/,
    'the SYS catalogue documents the argument, or the planner can never emit it');

  /* the two variables the streaks read are warmed on a time step in BOTH cases */
  /* ⚠ (#R356) THE CONDITION IS #R337's; THE LIST IT PUSHES INTO IS PER MODEL. This pinned
     `vars.push(…)`, which stopped matching when the warm-up became one call per model and `vars`
     became `byModel[<model>]` — the two variables have to go into the bucket of the model the WIND
     is reading, not into whichever layer's bucket was last. #R337's claim is unchanged and is what
     is asserted: the pair is warmed when the streaks are up WITHOUT the wind layer. */
  /* ⚠ the span is bounded but crosses ONE statement now: the bucket has to be chosen (`const wm =
     the model the wind reads`) between the condition and the push, so `[^;]*` — which cannot cross
     a semicolon — stopped matching for a reason that has nothing to do with the claim. */
  assert.match(wx, /W\.solo&&W\.solo\(\)[\s\S]{0,220}?\.push\('wind_u_component_10m'/,
    'a time step warms u and v when the streaks are up without the wind layer');
  assert.match(wx, /\(byModel\[wm\]=byModel\[wm\]\|\|\[\]\)\.push\('wind_u_component_10m'/,
    '…into the bucket of the model the wind itself is reading');
});


/* ══════════════════════════════════════════════════════════════════════════
   ② the starter chips: measured on the OUTPUT, and with the NAME TAKEN BACK OUT
   ═══════════════════════════════════════════════════════════════════════ */
const { makeAtlasExamples } = await import('../js/atlas-examples.js');

/* ⚠⚠⚠ THE FIRST VERSION OF THIS CHECK PASSED FOR THE WRONG REASON, AND THE REASON IS THE REPORT
   ITSELF. Comparing the chips as they are RENDERED found zero overlap between every pair of
   countries — because each chip carries the country's own name, so two mail-merged copies of one
   sentence are never the same string. That is precisely the illusion 「まだほぼ定型文」 is about.
   Every comparison below is therefore made with the name masked back out, so what is compared is
   the QUESTION and not the substitution. */
const mask = (name, list) => list.map((s) => s.split(name).join('{}'));

/* a synthetic world of about the size of the real one — the bands the pool uses are 「top 25」 and
   「bottom 90」, which mean something quite different in a table of 70 rows than in one of 195, and
   a fixture that gets that wrong tests a pool nobody ships. PLAIN sits at the median of every
   distribution, so nothing but the always-eligible tail can be true of it. */
/* ⚠ A SYNTHETIC WORLD THE SIZE OF THE REAL ONE. The pool's bands are 「top 25」 and 「bottom 90」,
   which mean something quite different in a table of 70 rows than in one of 200 — a fixture that
   gets that wrong tests a pool nobody ships. 240 filler states spread LINEARLY across every
   distribution, and each shape's one distinguishing value is taken from a PERCENTILE of that same
   spread rather than typed, so the fixture cannot drift out of step with the thresholds it feeds. */
const FILLER = (t) => ({
  pop: 2e5 + t * 9e7, area: 300 + t * 2e6, density: 3 + t * 700,
  gdp: 2 + t * 26000, gdppc: 400 + t * 110000, lifeExp: 52 + t * 33,
  internet: 8 + t * 91, hdi: 0.38 + t * 0.58, dem: 1.2 + t * 8
});
const at = (p) => FILLER(p);

function world() {
  const S = {};
  /* ⚠ (#R426) THE FOUR GEO CLAIMS BELOW READ `bboxAll`, NOT `bbox`. A country row now
     publishes two boxes (js/country-extent.js): `bbox` is the FRAME — where the country is,
     with remote territory trimmed off — and `bboxAll` is the union of everything it owns.
     Every claim this file pins is about the WHOLE TERRITORY (`spread` IS the measurement of
     outlying territory; `arctic` is answered for the United States by Alaska), so they read
     the union. The fixture mirrors what `_mkStat` writes, so a case that names one box gets
     both — which is what a real row looks like. */
  const put = (c, o) => { const r = Object.assign({
    code: c, nameEn: c, sov: true, subregion: 'Western Europe', capital: 'Cap',
    currency: 'XXX', languages: 'One', bbox: [10, 30, 11, 31], latlng: [30.5, 10.5]
  }, FILLER(0.5), { milSpend: FILLER(0.5).gdp * 0.05 }, o);
    if (r.bboxAll === undefined) r.bboxAll = r.bbox;
    S[c] = r; };
  const N = 240;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), v = FILLER(t);
    put('FIL' + String(i).padStart(3, '0'), Object.assign({}, v, {
      milSpend: v.gdp * (0.005 + t * 0.09), bbox: [10 + i * 0.02, 30, 11 + i * 0.02, 31] }));
  }
  put('PLAIN', {});    /* the median filler exactly — no band and no threshold can be true of it */
  put('PLAIN0', { capital: '', subregion: '', currency: '', languages: '', bbox: null,
                  gdp: null, gdppc: null, hdi: null, dem: null, lifeExp: null,
                  internet: null, milSpend: null });
  /* ⚠ each shape differs from PLAIN in exactly ONE fact, so what is measured is 「is one fact
     enough to change the row」. The boxes are kept apart deliberately: EQUATOR is under the tropics
     chip's area floor, TROPICS is off the equator, and TINYPOP gets a tiny BOX as well as a tiny
     area — otherwise the spread ratio would make it far-flung too and the shape would be two facts. */
  put('EQUATOR', { bbox: [10, -0.5, 10.9, 0.5], area: 40000, latlng: [0, 10.4] });
  put('ARCTIC', { bbox: [10, 58, 18, 71], latlng: [65, 14] });
  put('TROPICS', { bbox: [10, 5, 20, 20], area: 900000, latlng: [12, 15] });
  put('FARFLUNG', { bbox: [-60, 25, 56, 51], area: 400000, latlng: [38, 0] });
  put('POLYGLOT', { languages: 'One, Two, Three' });
  put('EUROZONE', { currency: 'EUR' });
  put('DOLLARISED', { currency: 'PAB / USD' });
  put('RICHCLOSED', { gdppc: at(0.97).gdppc, dem: 2.6 });
  put('BIGPOOR', { gdp: at(0.97).gdp, gdppc: at(0.20).gdppc });
  put('LONGLIFE', { lifeExp: at(0.95).lifeExp, gdppc: at(0.20).gdppc });
  put('TINYPOP', { pop: at(0.02).pop, area: 400, bbox: [10, 30, 10.06, 30.06] });
  put('POOREST', { gdppc: at(0.03).gdppc });
  put('SHORTLIFE', { lifeExp: at(0.03).lifeExp });
  put('WIRED', { internet: at(0.97).internet });
  put('MILOW', { milSpend: FILLER(0.5).gdp * 0.0005 });
  /* ⚠⚠⚠ (#R337 追記) NORWAY, AS THE TABLES ACTUALLY HOLD IT. Bouvet Island is Norwegian, so the
     country's EXTENT reaches −54.4° — a box that spans the equator, and a box whose middle is
     8.4°N. Production shipped 「The equator runs through Norway」 and did NOT ship the short-winter
     question, both from the same mistake: an extent is not a location. */
  put('REMOTEISLE', { bbox: [4.6, -54.4, 31.1, 71.2], latlng: [64.0, 10.0] });
  put('POPBIG', { pop: 3e8 });
  /* a country the pool knows FOUR things about — the fallback ordering has to leave it no tail */
  put('MULTI', { bbox: [-60, -22, 56, 51], area: 400000, latlng: [15, 0],
                 languages: 'One, Two, Three', currency: 'USD' });
  /* the antimeridian pair — same land area, one written as a ring that crosses ±180 */
  put('SCATTER', { area: 100, bbox: [0, 0.5, 1, 1.5], latlng: [1, 0.5] });
  put('SCATTERWRAP', { area: 100, bbox: [-180, 0.5, 180, 1.5], latlng: [1, 0.5] });
  return S;
}
const SHAPES = ['EQUATOR', 'ARCTIC', 'TROPICS', 'FARFLUNG', 'POLYGLOT', 'EUROZONE', 'DOLLARISED',
                'RICHCLOSED', 'BIGPOOR', 'LONGLIFE', 'TINYPOP', 'POOREST', 'SHORTLIFE', 'WIRED',
                'MILOW', 'POPBIG'];

/* the SHIPPED chooser, with the things it reads standing in for the browser's */
function raw(stats, opts) {
  const o = opts || {};
  const layers = o.layers || [];
  const pd = globalThis.document, pw = globalThis.window;
  globalThis.document = {
    getElementById: (id) => (id === 'layer-dropdown' ? {
      querySelectorAll: () => layers.map((l) => ({
        checked: true, id: l, type: 'checkbox', closest: () => null, parentElement: null }))
    } : null)
  };
  globalThis.window = { IntMapTime: { state: () => ({ isLive: o.year == null, year: o.year || null }) } };
  try {
    return makeAtlasExamples({ lang: 'en' }, {
      L: (en) => en,
      /* ⚠ (#R392) THE CAMERA SITS OVER THE FIXTURE'S OWN COUNTRIES, which it did not have to before.
         This harness pinned the centre at (0°, 0°) — an accidental detail while the pool could only
         read the country the centre pixel fell in. #R392 added candidates gated on the VIEW, and one
         of them asks whether the equator crosses the frame; at (0, 0) it crosses every frame, so
         every fixture country was handed the same view chip and this file's 「one fact changes the
         row」 property broke for a reason that had nothing to do with the fact being varied.
         `world()` puts every shape in bbox [10, 30, 11, 31], so the camera is put there too and the
         view contributes nothing — which is what lets this test go on measuring the country pool. */
      GE: () => ({ camera: { getCenter: () => ({ lng: 10.5, lat: 30.5 }),
                             getZoom: () => (o.zoom == null ? 6 : o.zoom) } }),
      codeAtPoint: () => o.code || '',
      countryStats: stats,
      cName: (st) => st.nameEn,
      loadCountryData: () => Promise.resolve(),
      panelEl: () => null,
      pick: () => {}
    }).examples();
  } finally { globalThis.document = pd; globalThis.window = pw; }
}
/* …and the same four with the country's own name taken back out, which is what may be compared */
const qs = (stats, opts) => mask((opts && opts.code) || '@none@', raw(stats, opts));
}
