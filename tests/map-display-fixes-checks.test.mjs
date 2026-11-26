/* 地図の表示と操作 8 項目の回帰（dev-notes/2026-11-26-map-display-fixes.md）。主張は構造: 国の一覧が無いこと、
   同じ規則が別の国・別の縮尺でも効くこと、AI brief の入口が残っていないこと、クリックで隠す機構が全層に及ぶこと。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importModule } from './helpers/import-module.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const win = {}; await importModule('js/country-extent.js', { globals: { window: win } });
const CE = win.IntMapCountryExtent;

test('① a country name goes when the view has entered the country — by size, for any country, at any scale', () => {
  const view = [1400, 800];
  const monaco = [7.4, 43.72, 7.44, 43.76], russia = [26.9, 41.2, 191, 81.9], chile = [-75.6, -55.9, -66.4, -17.5];
  const share = (e, z) => CE.viewShare(e, z, view[0], view[1]);
  for (const e of [monaco, russia, chile]) {
    let last = 0;
    for (let z = 0; z <= 18; z += 0.5) { const s = share(e, z); assert.ok(s >= last, 'share only grows with zoom'); last = s; }
    assert.ok(share(e, 0) < CE.NAME_GONE_SHARE || e === russia, 'at the world view the name is shown (Russia fills the width, so it is the one allowed to be past)');
    assert.ok(share(e, 18) >= CE.NAME_GONE_SHARE, 'zoomed in far enough, every country is gone');
  }
  /* the same ratio, a different screen: a small view reaches the threshold at a lower zoom */
  assert.ok(CE.viewShare(chile, 4, 400, 700) > CE.viewShare(chile, 4, 1400, 800));
  /* a long thin country is decided by its LONGER side (Chile is 9° wide and 38° tall) */
  assert.ok(share(chile, 4) > share([-75.6, -55.9, -66.4, -55.9 + 9.2], 4));
  assert.equal(CE.viewShare(null, 4, 100, 100), 0);
  assert.equal(CE.viewShare(russia, 4, 0, 100), 0);
});

test('① no country is named in the rule', () => {
  const src = read('js/place-labels.js'); const i = src.indexOf('function fitCountryNames');
  const body = src.slice(i, src.indexOf('function ensurePlaceLabels', i));
  assert.match(body, /viewShare\(/);
  assert.doesNotMatch(body, /Russia|France|Japan|Monaco|'[A-Z]{3}'/);
});

test('② the click hides the name under the pin in EVERY place-name layer, through one property nobody else writes', () => {
  const src = read('js/map-ui.js'); const i = src.indexOf('function _hideLabelAt');
  const body = src.slice(i, src.indexOf('function _dropPin', i));
  assert.match(body, /PLACE_LBL\.filter/);
  assert.match(body, /'text-opacity'/);
  assert.doesNotMatch(body, /setFilter/, 'a filter on ofm-admin1 / ofm-country belongs to other modules');
  assert.doesNotMatch(src, /_CITY_LBL/);
});

test('③ there is no AI brief button on the place popup or the country card, and no console entry for it', () => {
  assert.doesNotMatch(read('js/map-ui.js'), /plc-ai|call\('brief'/);
  assert.doesNotMatch(read('js/countries-ui.js'), /data-cpact="brief"|call\('brief'/);
  assert.doesNotMatch(read('js/atlas-console.js'), /briefEntry|IntMapOS\.brief/);
  /* what carries the work: the Atlas capability, still registered */
  assert.match(read('js/atlas-cap-research.js'), /'research\.brief'/);
});

test('④ the scroll-zoom anchor follows the cursor while the gesture is open', () => {
  const src = read('js/geo-engine.js');
  assert.match(src, /this\._aroundPoint=new p\.constructor\(cur\.x,cur\.y\)/);
  assert.match(src, /cv\.addEventListener\('mousemove',at/);
});

test('⑤ Isolate asks for the fine country outline before it cuts the hole', () => {
  assert.match(read('js/map-tools.js'), /function withFine\(go\)[\s\S]*_imRequireFineCountryGeo/);
  assert.match(read('js/countries-ui.js'), /window\._imRequireFineCountryGeo=\(\)=>run\(\)/);
});

test('⑥ the bottom bar is on the shared glass material', () => {
  const css = read('css/intmap.css');
  assert.match(css, /\.map-search,\.map-credit,[\s\S]*?background-color:var\(--glass-fill\) !important;\s*backdrop-filter:saturate\(var\(--glass-sat\)\) blur\(var\(--glass-blur\)\)/);
});

test('⑦ Isolate frames a country by where it is, not by the far territories it owns', () => {
  const sq = (x, y, d) => [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]];
  /* a mainland, a stepping-stone island near it and a remote island 90° away — any country of this shape, none named */
  const geom = { type: 'MultiPolygon', coordinates: [sq(5, 58, 25), sq(10, 80, 1), sq(3, -54.5, 0.2)] };
  const h = CE.homeExtent(geom, null);
  assert.ok(h[1] > 50, 'the remote island does not stretch the frame south: ' + h);
  const full = CE.fullExtent(geom);
  assert.ok(full[1] < -50 && h[3] - h[1] < full[3] - full[1]);
  assert.match(read('js/map-tools.js'), /function bbox\(feat\)\{ try\{ const CE=window\.IntMapCountryExtent/);
  assert.match(read('js/map-tools.js'), /const ub=bboxUnion\(feat\)/);
});
