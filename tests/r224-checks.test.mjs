/* ============================================================================
 *  #R224 — the round's own contracts, checked in Node
 * ----------------------------------------------------------------------------
 *  One ocean-current layer · the USGS ShakeMap ramp · a drawn outline is a fault's SHADOW ·
 *  the seventh language · the sky's quadrature · the service worker can heal · Atlas on demand.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

/* ── ① THE SERVICE WORKER CAN HEAL ────────────────────────────────────────────────────────────────
   The report was 「キャッシュの残っているブラウザで開くと地図が全くちゃんと表示されない」 — blurry
   imagery and no labels — and the cause was a cache-first store with no version and no expiry: an
   Esri HTTP-200 "no imagery here" tile (~2.5 kB) pinned a neighbourhood at half resolution for the
   life of the profile, because js/sat-proto.js reads that body size as «imagery stops here». */
test('R224 ① the tile cache is versioned, refuses placeholders and expires', () => {
  const sw = read('sw.js');
  assert.match(sw, /const CACHE = 'intmap-tiles-v2';/, 'the name is bumped, so every poisoned v1 is purged on activate');
  assert.match(sw, /const SAT_PLACEHOLDER_MAX = 3500;/, 'the placeholder size is the same one sat-proto uses');
  assert.match(sw, /function isPlaceholder\(url, res\)/, 'and a 200-with-no-imagery is never stored');
  assert.match(sw, /arcgisonline\\\.com\$/, 'narrowly — only the imagery hosts');
  assert.match(sw, /const STAMP = 'x-im-cached';/, 'every stored entry carries the time it was stored');
  assert.match(sw, /function isStale\(hit, url\)/, '…so it can be refreshed behind a hit');
  assert.match(sw, /if \(isStale\(hit, req\.url\)\)/, 'stale-while-revalidate: the revisit is still answered from disk');
  assert.match(sw, /return hit;\s+\/\/ ZERO network on revisit/, 'and it is returned immediately, not awaited');
  /* the two families expire on different clocks, because only one of them is regenerated upstream */
  assert.match(sw, /const REFRESHABLE = \['tiles\.openfreemap\.org', 'basemaps\.cartocdn\.com'\];/);
  assert.match(sw, /return 7 \* DAY;/); assert.match(sw, /return 60 \* DAY;/);
  /* ⚠ the decoded bytes must not be re-labelled as encoded — that would corrupt every gzipped tile */
  assert.ok(!/h\.set\('content-encoding'/.test(sw), 'the rebuilt response must not claim an encoding it no longer has');
});

/* ── ② THE MMI RAMP IS USGS'S, AND IT IS CONTINUOUS ───────────────────────────────────────────────
   Read out of USGS.能登.pdf (the ShakeMap for the 2024-01-01 M7.5 Noto event, us6000m0xl v10): the
   legend bar is 81 filled strips and these nine colours appear in it, in order, under the columns
   the SHAKING row labels. IntMap paired every class with the ramp colour one step BELOW it. */
test('R224 ② MMI is painted with the ShakeMap ramp, continuously', async () => {
  const s = read('js/seismic.js');
  const want = [[1, 255, 255, 255], [2, 191, 204, 255], [3, 160, 230, 255], [4, 128, 255, 255],
    [5, 122, 255, 147], [6, 255, 255, 0], [7, 255, 200, 0], [8, 255, 145, 0],
    [9, 255, 0, 0], [10, 200, 0, 0]];
  const m = /const MMI_RAMP=\[([\s\S]*?)\];/.exec(s);
  assert.ok(m, 'the ramp is declared once');
  const got = [...m[1].matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/g)].map((x) => x.slice(1).map(Number));
  assert.deepEqual(got, want, 'the anchors are the ones measured out of the PDF');
  /* the fill is the ramp, per cell, in BOTH painters — and 震度 keeps its published bands */
  assert.match(s, /c=mmiRGB\(I,_fineRGB\)/, 'the fine field interpolates');
  assert.match(s, /rgb=mmiRGB\(I,_farRGB\)/, 'and so does the far field');
  assert.match(s, /const cls=jmaClass\(I\); if\(!cls\) continue; c=_rgbOf\(cls\)/, 'JMA is untouched and still banded');
  /* the legend's class colours are DERIVED from the ramp — never a second copy of a hex */
  assert.match(s, /\}\ \]\.map\(k=>Object\.assign\(k,\{ col:_mmiHex\(k\.min\) \}\)\);/,
    'MMI_CLASSES takes its colours from the ramp');
  /* …and the arithmetic itself, against the PDF's anchors */
  const src = s.slice(s.indexOf('const MMI_RAMP='), s.indexOf('const _mmiHex='));
  const mmiRGB = new Function(src + '\nreturn mmiRGB;')();
  for (const [I, r, g, b] of want) assert.deepEqual(mmiRGB(I), [r, g, b], `MMI ${I}`);
  assert.deepEqual(mmiRGB(4.5), [125, 255, 201], 'and it interpolates between them');
  assert.deepEqual(mmiRGB(11), [200, 0, 0], 'clamped at the top');
});

/* ── ③ A DRAWN OUTLINE IS THE FAULT'S SHADOW ──────────────────────────────────────────────────────
   Verified against published earthquakes rather than against itself: the numbers below are the
   rectangles those two events actually ruptured, and what comes back is the dip, width, slip and
   magnitude that were published for them. */
test('R224 ③ the fault solver recovers real earthquakes from their footprints', async () => {
  const w = {};
  new Function('window', read('js/fault-geometry.js'))(w);
  const G = w.IntMapFaultGeom;
  const D = Math.PI / 180;
  const rect = (lng, lat, L, W, az) => {
    const kx = 111.320 * Math.cos(lat * D), ky = 110.574, c = Math.cos(az * D), s = Math.sin(az * D);
    return [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]]
      .map(([x, y]) => [lng + (x * s + y * c) / kx, lat + (x * c - y * s) / ky]);
  };
  const solve = (lng, lat, L, W, az, over) =>
    G.solve({ footprint: G.footprint(rect(lng, lat, L, W, az), L * W), depthKm: 10, stressDropMPa: 3, override: over });

  /* 2024 Noto, M7.5: ~150 × 30 km on a fault dipping ~50°, so a 150 × 19 km footprint */
  const noto = solve(137.27, 37.49, 150, 19, 10);
  assert.ok(noto.dipDeg > 45 && noto.dipDeg < 60, `Noto dip ${noto.dipDeg.toFixed(0)}° (published ~50°)`);
  assert.ok(noto.widthKm > 25 && noto.widthKm < 38, `Noto width ${noto.widthKm.toFixed(0)} km (published ~30)`);
  assert.ok(noto.slipM > 1.5 && noto.slipM < 4, `Noto mean slip ${noto.slipM.toFixed(2)} m (published 2–4)`);
  assert.ok(Math.abs(noto.mw - 7.5) < 0.3, `Noto Mw ${noto.mw.toFixed(2)} (7.5)`);
  assert.ok(noto.areaKm2 > noto.areaProjKm2, 'the plane is bigger than its own shadow');

  /* 2011 Tōhoku, M9.0-9.1: a ~500 × 200 km megathrust — the case Wells & Coppersmith cannot reach,
     which is why the dip floor exists and why the slip comes from the stress drop, not from W&C. */
  const toh = solve(142.4, 38.3, 500, 197, 20);
  assert.ok(toh.dipDeg <= 12, `Tohoku dip ${toh.dipDeg.toFixed(0)}° — a megathrust falls on the floor`);
  assert.ok(toh.widthKm > 150, `Tohoku width ${toh.widthKm.toFixed(0)} km`);
  assert.ok(toh.slipM > 8 && toh.slipM < 16, `Tohoku mean slip ${toh.slipM.toFixed(1)} m (published ~10)`);
  assert.ok(Math.abs(toh.mw - 9.0) < 0.3, `Tohoku Mw ${toh.mw.toFixed(2)} (9.0)`);

  /* a long thin ribbon is a strike-slip fault, and its width is the seismogenic depth */
  const ss = solve(-118, 35, 60, 4, 140);
  assert.ok(ss.dipDeg > 70, `a ribbon dips steeply (${ss.dipDeg.toFixed(0)}°)`);
  assert.ok(ss.zBotKm - ss.zTopKm > 10, 'and it fills the seismogenic layer');

  /* ⚠ EVERY OVERRIDE RE-ENTERS THE SAME CHAIN — 「Mw・M0・断層面積・平均すべり量が一貫して再計算」 */
  const a = solve(137.27, 37.49, 150, 19, 10, { dip: 30 });
  assert.equal(Math.round(a.dipDeg), 30);
  /* A₃D = A_proj / cos δ, so a SHALLOWER dip means the shadow is closer to the plane's true size:
     the plane shrinks. (Steepen it instead and it grows — both directions are checked.) */
  assert.ok(a.areaKm2 < noto.areaKm2, 'a shallower dip brings the plane closer to its own shadow');
  const a2 = solve(137.27, 37.49, 150, 19, 10, { dip: 80 });
  assert.ok(a2.areaKm2 > noto.areaKm2, 'and a steeper one makes it bigger');
  assert.ok(Math.abs(a.M0 - 3.3075e10 * a.areaKm2 * 1e6 * a.slipM) / a.M0 < 1e-9, 'M0 = μ·A₃D·D̄ still');
  assert.equal(a.auto.dip, false); assert.equal(a.auto.slip, true, 'the others stay on auto');
  const b = solve(137.27, 37.49, 150, 19, 10, { slipM: 6 });
  assert.equal(b.slipM, 6); assert.ok(b.mw > noto.mw, 'more slip is a bigger earthquake');
  const c = solve(137.27, 37.49, 150, 19, 10, { zTopKm: 2, zBotKm: 22 });
  assert.ok(Math.abs((c.zBotKm - c.zTopKm) - 20) < 0.01, 'a pinned pair of depths is honoured exactly');
  assert.ok(Math.abs(c.widthKm * Math.sin(c.dipDeg * D) - 20) < 0.01, '…and states the width through the dip');

  /* the panel exposes it, and it is not a second implementation */
  const s = read('js/seismic.js');
  assert.match(s, /const FG=\(\)=>window\.IntMapFaultGeom;/);
  assert.match(s, /function _faultAdvHTML\(\)/, 'the 詳細設定 disclosure exists');
  for (const k of ['dip', 'widthKm', 'zTopKm', 'zBotKm', 'slipM'])
    assert.ok(s.includes(`_fadvRow('${k}'`), `the advanced panel offers ${k}`);
  assert.match(s, /setFaultGeometry\(o\)/, 'and Atlas can drive it (#R82)');
  assert.ok(!/faultSlip/.test(s), 'the fixed 2 m slip is gone');
});

/* ── ④ THE SEVENTH LANGUAGE IS DERIVED, NOT COPIED ────────────────────────────────────────────── */
test('R224 ④ Simplified Chinese is registered and regenerates byte-for-byte', () => {
  const reg = read('js/lang-registry.js');
  assert.match(reg, /\{ code: 'zh-hans', label: '简体中文 \(beta\)', html: 'zh-Hans', pill: '简',/);
  assert.match(reg, /alias: \['zh-hans', 'zh-cn', 'zh-sg', 'zh-my', 'hans'\]/, 'the Simplified tags only');
  assert.ok(!/'zh-tw'[^\]]*zh-hans/.test(reg), 'zh-TW must stay with Traditional');
  assert.match(reg, /b\.textContent = l\.pill \|\| l\.code\.toUpperCase\(\);/, 'a code is not always a pill');
  assert.match(read('src/main.js'), /locales\/ui\.zh-hans\.js/);
  const hansFull = read('js/locales/ui.zh-hans.js');
  /* ⚠ the STRINGS, not the header — that comment names the Traditional spellings it replaces */
  const hans = hansFull.slice(hansFull.indexOf("window.IntMapLang.define('zh-hans'"));
  assert.match(hansFull, /window\.IntMapLang\.define\('zh-hans', \{/);
  /* the mainland vocabulary actually landed — a character map alone would have left 网路 / 資訊 */
  for (const w of ['信息', '屏幕', '文件', '默认', '设置', '用户']) assert.ok(hans.includes(w), `missing ${w}`);
  for (const w of ['網路', '資訊', '螢幕', '檔案', '預設', '選單', '使用者']) assert.ok(!hans.includes(w), `Traditional ${w} survived`);
  /* ⚠ AND IT IS IN SYNC WITH ITS SOURCE. This is the whole reason it is generated: a string fixed in
     ui.zh.js is fixed in both, or this fails. */
  execFileSync(process.execPath, ['scripts/zh-hans.mjs', '--check'], { cwd: new URL('.', root).pathname.replace(/^\/([A-Za-z]:)/, '$1'), stdio: 'pipe' });
});

/* ── ⑤ THE SKY'S GREY-GREEN HORIZON WAS THE QUADRATURE ─────────────────────────────────────────── */
test('R224 ⑤ the sky model converges, and its low-elevation horizon is blue', async () => {
  const src = read('js/sky-model.js');
  assert.match(src, /const N = 32, M = 8, KWARP = 7;/, 'more samples, and a warp');
  assert.match(src, /const tLow = Math\.max\(tIn, Math\.min\(tMax, -\(o\[0\] \* d\[0\]/,
    'the warp is anchored at the ray’s LOWEST point — the eye inside the air, the tangent from space');
  assert.match(src, /out\.sort\(\(p, q\) => p\[0\] - q\[0\]\);/,
    'and the samples are marched in increasing t, because the optical depth so far attenuates the next one');
  const { skyColour } = await import(new URL('js/sky-model.js', root));
  /* #R223 measured #93a394 here — G above BOTH R and B. A daytime horizon is not green. */
  for (const ve of [1, 3, 5, 10]) {
    const c = skyColour(60, 0, 90, ve).rgb;
    assert.ok(c[2] > c[1] && c[1] > c[0], `sun 60°, view ${ve}°: ${c} is not B>G>R`);
  }
  /* …and a low Sun is still warm, which is the other half of being right */
  const set = skyColour(2, 0, 90, 3).rgb;
  assert.ok(set[0] > set[1] && set[1] > set[2], `sunset horizon ${set} should be R>G>B`);
  /* #R202's Cesium calibration is still where it was measured (the far end of the gradient) */
  const noon = skyColour(75, 30, 90).rgb;
  assert.ok(noon[2] > noon[1] && noon[1] > noon[0], `noon sky ${noon} stays blue`);
  /* the band no longer falls back to a neutral grey above +6° */
  const sky = read('js/theme-sky.js');
  assert.match(sky, /const w=Math\.max\(0,Math\.min\(1,lm\/12\)\);/);
  assert.ok(!/\(6-e\)\/12/.test(sky), 'the elevation cut-off is gone');
});

/* ── ⑥ ONE OCEAN-CURRENT LAYER, AND ONE ATLAS, FETCHED WHEN REACHED FOR ────────────────────────── */
test('R224 ⑥ the second ocean-current layer is gone and saved sessions migrate', () => {
  const dl = read('js/data-layers.js');
  for (const re of [/\['oceancur','lyrOceanCur'\]/, /function addOceanCurrents/, /lyr-oceancur/, /OC_WARM/])
    assert.ok(!re.test(dl), `data-layers still carries ${re}`);
  const st = read('js/session-tabs.js');
  assert.match(st, /const RETIRED=\{ 'dl-oceancur':'wp-dl-currents' \};/, 'the retired id is translated, once');
  assert.match(read('js/ocean-currents.js'), /wp-dl-currents/, 'and the survivor owns that row');
});

test('R224 ⑥b Atlas is on demand, and every entry point fetches it', () => {
  assert.ok(!/import '\.\.\/js\/atlas-console\.js';/.test(read('src/main.js')), 'not in the boot bundle');
  const lz = read('js/lazy-modules.js');
  assert.match(lz, /atlasConsole: 'IntMapConsole',/);
  assert.match(lz, /case 'atlasConsole': return import\('\.\/atlas-console\.js'\);/);
  assert.match(lz, /case 'atlasConsole': window\.IntMapConsole=window\.IntMapModules\.atlasConsole\(IM_HOST\); return true;/);
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
    ['js/sims.js', /IntMapAtlas\.call\('dispatch'/]]) assert.match(read(f), re, `${f} must reach Atlas through the loader`);
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
  const v = read('src/vendor.js');
  assert.match(v, /window\.IntMapVendor = \(function \(\)/);
  assert.ok(!/requestIdleCallback\(load/.test(v), 'no longer merely delayed to idle');
  assert.match(read('js/screenshot.js'), /IntMapVendor\.html2canvas\(\)/);
  assert.match(read('js/atlas-reply.js'), /IntMapVendor\.katex\(\)/);
  /* the Köppen work canvas decodes at the size it keeps, not at 4096² */
  const dl = read('js/data-layers.js');
  assert.match(dl, /createImageBitmap\(b,\{resizeWidth:cap,resizeHeight:cap,resizeQuality:'pixelated'\}\)/,
    'nearest-neighbour, because the palette IS the classification');
  assert.match(dl, /if\(koppenPhone\(\)\) return _koppenBitmapWork\(\)\.catch\(\(\)=>_loadKoppenCanvasImg\(\)\);/,
    'and it falls back to the <img> path where it cannot help');
});
