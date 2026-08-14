/* ============================================================================
 *  #R223 — source-level checks
 * ----------------------------------------------------------------------------
 *  ⚠ These pin RELATIONS and CONTRACTS, not values this round happened to measure (#R199/#R203:
 *  a test that pins my own number falls over the next time the same instruction arrives).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── ① the white ground haze is gone, and one place says so ───────────────────────────────────── */
test('R223 ① the aerial haze is off on every basemap, from one function', () => {
  const s = read('js/theme-sky.js');
  const m = /function _aerial\(\)\{([^}]*)\}/.exec(s);
  assert.ok(m, '_aerial() must still exist — it is what _skyFollowCamera compares');
  assert.match(m[1], /ground:\s*1\s*,\s*horizon:\s*0/, 'ground-blend 1 and horizon-fog-blend 0 = off');
  assert.ok(!/_eyeAltM\(\)/.test(m[1]), 'the haze must not come back as a function of altitude');
  /* setSky still reads the pair from _aerial rather than writing literals */
  assert.match(s, /'horizon-fog-blend':fg\.horizon/);
  assert.match(s, /'fog-ground-blend':fg\.ground/);
  /* …and nothing else in the app turns it back on */
  const fs2 = read('js/flight-sim.js');
  assert.match(fs2, /'fog-ground-blend':1/, 'the flight sim already had it off and must keep it');
});

/* ── ② the ocean-current data layer has a legend, and the ramp has one owner ───────────────────── */
/* ⚠ (#R224) #R223 gave the SECOND ocean-current row a legend; #R224 deleted that row instead
   (「二つあるなんていうややこしいことするな」). The report #R223 answered — 「海流レイヤーに凡例がない」 —
   is answered better by there being one layer, and that layer has had a legend since #R219. What is
   pinned here now is that the removal is complete and the survivor still carries its legend. */
test('R223 ② the retired current row is gone and the survivor keeps its legend', () => {
  const s = read('js/data-layers.js');
  assert.ok(!/showOceanCurLegend/.test(s), 'the second legend went with the second layer');
  assert.ok(!/OC_WARM|OC_COLD|OC_ZONAL/.test(s), 'and so did its private colour constants');
  const oc = read('js/ocean-currents.js');
  assert.match(oc, /_speedRamp\(\)/, 'the surviving plate still builds its own legend ramp');
});
test('R223 ② the World-data speed ramp is derived from SPEED_COL, never written twice', () => {
  const s = read('js/ocean-currents.js');
  assert.match(s, /function _speedRamp\(\)/);
  assert.match(s, /background:'\+_speedRamp\(\)/, 'the swatch uses the derived ramp');
  /* the stale #R220 blue ramp must be gone */
  assert.ok(!/9fc6e8,#2f7fe0,#0a2f78/.test(s), 'the legend must not carry a gradient the map no longer draws');
});

/* ── ③ the flat map scrolls freely by default, and the migration is a latch ────────────────────── */
test('R223 ③ imFlatPan defaults to free and only an explicit choice overrides it', () => {
  const s = read('js/app-body.js');
  assert.match(s, /window\.imFlatPan='free'/);
  assert.match(s, /if\(s\.flatPanSet===true\s*&&\s*\(s\.flatPan==='fixed'\|\|s\.flatPan==='free'\)\)/);
  assert.match(s, /flatPanSet:window\.imFlatPanSet===true/, 'the latch is persisted');
  assert.match(s, /window\.imFlatPanSet=true;/, 'and set when the Settings panel is applied');
});

/* ── ④ the point source IS a finite rupture, and there is ONE distance conversion ──────────────── */
test('R223 ④ a point source stands for the rupture its magnitude implies', () => {
  const s = read('js/seismic.js');
  assert.match(s, /RUP_A=\(mw\)=>Math\.pow\(10,-3\.49\+0\.91\*mw\)/, 'Wells & Coppersmith 1994 rupture area');
  assert.match(s, /function impliedRupKm\(m\)/);
  assert.match(s, /function rupCutKm\(\)\{ return fault\?0:impliedRupKm\(mw\); \}/,
    'a DRAWN rupture already carries its own finiteness — the cut is only for a point');
  /* the pseudo-depth is gone from the chain */
  assert.ok(!/heffKm\(mw\)\*1000/.test(s), 'no equivalent point-source depth is added any more');
  assert.ok(!/function heffKm/.test(s), 'and the function itself is gone rather than left dead');
  /* every reader goes through srcDistM */
  assert.match(s, /function srcDistM\(surfKm,cutKm\)/);
  const raw = (s.match(/Math\.sqrt\(km\*km\+depthKm\*depthKm\)/g) || []).length;
  assert.equal(raw, 0, 'no site may combine the surface distance with the depth by hand');
  const uses = (s.match(/srcDistM\(/g) || []).length;
  assert.ok(uses >= 5, 'buildField, buildFar, mmiRings and at() all take the one conversion (got ' + uses + ')');
});
test('R223 ④ the implied rupture is the size the magnitude says, and the two paths meet', () => {
  /* the relation itself, evaluated here rather than asserted about the text */
  const A = (mw) => Math.pow(10, -3.49 + 0.91 * mw);
  const r = (mw) => Math.sqrt(A(mw) / Math.PI);
  assert.ok(Math.abs(A(7.5) - 2163) < 20, 'M7.5 ruptures ~2,163 km² (got ' + A(7.5).toFixed(0) + ')');
  assert.ok(r(9) > r(7.5) && r(7.5) > r(6), 'a bigger earthquake is a bigger rupture');
  /* at the epicentre the point source is at the focal depth, exactly as a drawn rupture is */
  const srcDist = (surfKm, cut, depth) => Math.sqrt(Math.pow(Math.max(0, surfKm - cut), 2) + depth * depth);
  assert.equal(srcDist(0, r(7.5), 10), 10, 'over the footprint, the distance is the depth');
  assert.equal(srcDist(0, 0, 10), 10, '…and a drawn rupture gives the same answer');
  assert.ok(srcDist(500, r(7.5), 10) > 450, 'far away the finiteness stops mattering');
});

/* ── ⑤ the site term never collapses to one class while a bundled one exists ───────────────────── */
test('R223 ⑤ the bundled 0.25° Vs30 raster ships and is consulted everywhere the DEM cannot reach', () => {
  assert.ok(existsSync(join(ROOT, 'data/vs30.png')), 'data/vs30.png must ship');
  const man = JSON.parse(read('data/vs30.json'));
  assert.equal(man.width, 1440); assert.equal(man.height, 720);
  assert.ok(man.sampleSpacingM <= 2000, 'the slope must be measured at a spacing the proxy supports');
  assert.ok(man.landCellFraction > 0.2 && man.landCellFraction < 0.4, 'about a third of the Earth is land');
  assert.ok(man.meanVs30 > 200 && man.meanVs30 < 800, 'a plausible global mean (got ' + man.meanVs30 + ')');
  const s = read('js/seismic.js');
  const hits = (s.match(/vsm\?vsm\.at\(/g) || []).length;
  assert.ok(hits >= 3, 'the no-DEM cell, the coarse-slope cell and the far field all ask it (got ' + hits + ')');
  assert.match(s, /vsm\.at\(lo,la\)/, 'the far field asks per cell');
  assert.match(read('src/main.js'), /js\/vs30-mask\.js/, 'and the module is loaded');
});

/* ── ⑥ a cached DEM tile is elevations, not a canvas and a copy of its pixels ──────────────────── */
test('R223 ⑥ the DEM cache holds Float32 elevations and shards over the bucket aliases', () => {
  const s = read('js/map-readout.js');
  assert.match(s, /new Float32Array\(65536\)/, 'one tile = 65,536 elevations');
  assert.ok(!/cv\.__pix/.test(s), 'no second RGBA copy is kept on a canvas');
  assert.match(s, /let _decCv=null/, 'one reused decode canvas for the whole app');
  assert.match(s, /_DEM_HOSTS=\[/);
  assert.match(s, /_demURL\(z,x,y\)\{ return _DEM_HOSTS\[\(x\+y\)&3\]/,
    'the host must be a function of the tile, so the HTTP cache still hits');
  const hosts = (s.match(/elevation-tiles-prod/g) || []).length;
  assert.ok(hosts >= 4, 'four aliases of the same public bucket');
  /* the tile-set filter reaches both readers or `missing` lies */
  assert.match(s, /function demTilePoints\(w,s,e,n,z,keep\)/);
  assert.match(s, /function demSnapshot\(w,s,e,n,z,keep\)/);
  const seis = read('js/seismic.js');
  assert.equal((seis.match(/_keepTile/g) || []).length >= 5, true, 'the field passes the same filter to every call');
});

/* ── ⑦ the coastline rasteriser culls by bounding box, exactly ─────────────────────────────────── */
test('R223 ⑦ rasterize() skips rings whose box misses the window', () => {
  const s = read('js/coast-mask.js');
  assert.match(s, /function boxes\(g\)/);
  assert.match(s, /__imRingBox/);
  assert.match(s, /if\(BB\[ri\*4\]\+off>lngE\|\|BB\[ri\*4\+1\]\+off<lngW\|\|BB\[ri\*4\+2\]>latN\|\|BB\[ri\*4\+3\]<latS\) continue;/);
  /* the cull is EXACT: a ring outside the window can contain no pixel of it */
  const inside = (bw, be, bs, bn, w, e, s2, n) => !(bw > e || be < w || bs > n || bn < s2);
  assert.equal(inside(0, 1, 0, 1, 10, 11, 10, 11), false, 'a far ring is dropped');
  assert.equal(inside(-180, 180, -90, 90, 10, 11, 10, 11), true, 'a ring that encloses the window is kept');
});

/* ── ⑧ the tsunami source is the same formula with the repeated work removed ───────────────────── */
test('R223 ⑧ okadaUz hoists the dip and q, and still answers Okada 1985', async () => {
  const s = read('src/tsunami-worker.js');
  assert.match(s, /let _okDip = NaN/, 'the dip trig is memoised on one slot');
  assert.ok(!/const dip = dipDeg \* DEG, sd = Math\.sin\(dip\)/.test(s), 'not recomputed per call');
  assert.match(s, /const q = y \* sd - depth \* cd;\s+\/\* ⚠ corner-independent/, 'q is hoisted out of f');
  /* and the published test case still comes back — the same one tests/r197 runs */
  const mod = await import('../src/tsunami-worker.js');
  const uz = mod.okadaUz ? mod.okadaUz : (globalThis.okadaUz);
  if (typeof uz === 'function') {
    const v = uz(2, 3, 4, 3, 2, 70, 1);
    assert.ok(Math.abs(v - (-3.5639e-2)) < 2e-5, 'Okada (1985) dip-slip case (got ' + v + ')');
  }
});
test('R223 ⑧ the polar filter and the frame decimation only touch what can be non-zero', () => {
  const s = read('src/tsunami-worker.js');
  assert.match(s, /const wet = new Uint8Array\(ny\)/);
  assert.match(s, /if \(wet\[j\]\) \{ zonalFilter\(eta, row, w\); zonalFilter\(M, row, w\); \}/);
  assert.match(s, /const fj0 = Math\.max\(0, \(J0 \/ dec\) \| 0\)/, 'frames read the light cone only');
});

/* ── ⑨ the phone's space UI: one owner for the sheet height, and a bar that fits ───────────────── */
test('R223 ⑨ the sheet drag writes the property the stylesheet reads', () => {
  const s = read('js/space.js');
  assert.match(s, /col\.style\.setProperty\('--sp-sheet-h',Math\.max\(PEEK/, 'the drag writes the custom property');
  assert.ok(!/col\.style\.maxHeight=Math\.max/.test(s), 'never an inline max-height — !important beats it');
  assert.match(s, /i0=current\(\);/, 'the tap-cycle reads its stop before the classes come off');
  const css = read('css/intmap.css');
  const own = (css.match(/#space-view \.sp-col\{[^}]*max-height[^}]*!important/g) || []).length;
  assert.equal(own, 1, 'exactly one !important owner of .sp-col max-height (got ' + own + ')');
  assert.match(css, /#space-view \.sp-bar\{ display:grid !important;/, 'the phone bar is a declared grid');
  assert.match(css, /\.sp-bar \.sp-timewrap\{ grid-area:1 \/ 3;/, 'the clock has a place instead of scrolling off');
});

/* ── ⑩ the sixth language ─────────────────────────────────────────────────────────────────────── */
test('R223 ⑩ Traditional Chinese is registered, complete, and appended at the end', () => {
  const reg = read('js/lang-registry.js');
  const rows = [...reg.matchAll(/\{\s*code:\s*'([a-z-]+)'/g)].map((m) => m[1]);
  /* ⚠ (#R224) A PREFIX, NOT AN EXACT LIST. #R221's own lesson — 「『5言語ちょうど』を数えるテストは
     6言語目で必ず落ちる」 — and #R223 wrote the same shape one language later, so the seventh
     (zh-hans) failed it. What is load-bearing is that the FIRST FIVE never move (they are the
     argument order of 2,238 L(…) call sites) and that new languages are APPENDED; the count is not. */
  assert.deepEqual(rows.slice(0, 6), ['en', 'jp', 'de', 'ru', 'es', 'zh'],
    'order is load-bearing — never reordered, only appended to');
  /* ⚠ (#R239) the explicit «(beta)» is gone. #R232 made the mark MEASURED (scripts/i18n-langs.mjs)
     and kept a typed one here only because 「their reading pages are still partial even though the
     app is at 100%」 — pages.zh-hant.js is 287/287 now, so that sentence is no longer true and the
     mark would be telling a reader something false. The label itself is still asserted. */
  assert.match(reg, /label: '繁體中文'/);
  assert.doesNotMatch(reg, /繁體中文 \(beta\)/, 'a mark that is no longer true is not kept');
  assert.match(reg, /html: 'zh-Hant'/);
  assert.match(reg, /alias: \['zh-hant', 'zh-tw', 'zh-hk', 'zh-mo'\]/, 'the script tags, not a bare zh');
  /* (#R232) src/main.js no longer names any locale but English — src/locale-boot.js globs the
     directory and loads the reader's own on demand. The list to check against is the generated one. */
  assert.match(read('js/locales/_langs.js'), /"zh"/, 'zh is in the generated language list');
  /* the file itself: both tables, and no call site was touched to get them */
  const zh = read('js/locales/ui.zh.js');
  const ast = parse(zh, { ecmaVersion: 2022 });
  let ui = 0, inl = 0;
  walk.simple(ast, { Property(n) {
    const k = n.key && (n.key.name || n.key.value);
    if (k === 'ui' && n.value.type === 'ObjectExpression') ui = n.value.properties.length;
    if (k === 'inline' && n.value.type === 'ObjectExpression') inl = n.value.properties.length;
  } });
  assert.ok(ui >= 450, 'the keyed table carries the late-registered keys too (got ' + ui + ')');
  assert.ok(inl >= 1800, 'every inline L(…) string has an entry (got ' + inl + ')');
  /* …and it is really Chinese, not a copy of the template */
  const cjk = (zh.match(/[一-鿿]/g) || []).length;
  assert.ok(cjk > 15000, 'the values are translated (got ' + cjk + ' CJK characters)');
  /* the translation is REBUILDABLE: it lives in scripts/zh/*.json, not only in the generated file */
  assert.ok(existsSync(join(ROOT, 'scripts/build-ui-zh.mjs')));
  assert.ok(existsSync(join(ROOT, 'scripts/zh/00-ui.json')));
});
test('R223 ⑩ the coverage scanner reads every file, not the ones whose spelling it guessed', () => {
  const s = read('scripts/i18n-report.mjs');
  assert.ok(!/indexOf\('IntMapLang\.pick'\) < 0 && src\.indexOf/.test(s),
    'the substring pre-filter hid js/ocean-currents.js entirely');
  assert.match(s, /NO SUBSTRING PRE-FILTER/);
});
