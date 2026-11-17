/* ============================================================================
 *  IntMap · ui-feedback-nov17 — the small shell changes of this round, measured
 * ----------------------------------------------------------------------------
 *  ① the globe's zoom floor is an apparent size: log2(shorter side / 720), so the space hint and the crossing land
 *    at the same share of the screen on a phone and a desktop (js/map-projection.js `globeMinZoom`), evaluated.
 *  ② today's border line opens no provenance card while the clock is at Now (js/time-borders.js reader).
 *  ③ the official-warnings world key carries no fixed rank ladder (js/world-packs.js `worldKey`).
 *  ④ the desktop Tools menu holds only 測る・描く; the rest is in the menu to its left (index.html + js/map-ui.js).
 *  ⑤ the sidebar wordmark is the picture of the name, and the picture is shipped.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

/* the function's own text, evaluated against a fake #map — not a copy of its arithmetic */
function loadGlobeMinZoom() {
  const src = read('js/map-projection.js');
  const a = src.indexOf('  const FLOOR_REF_SIDE=');
  const b = src.indexOf('  let _floorT=0;', a);
  assert.ok(a > 0 && b > a, 'globeMinZoom is defined in js/map-projection.js');
  return (w, h) => new Function('document', src.slice(a, b) + '\nreturn globeMinZoom();')({
    getElementById: (id) => (id === 'map' ? { clientWidth: w, clientHeight: h } : null),
  });
}

test('① the globe floor is the same apparent size on every screen', () => {
  const f = loadGlobeMinZoom();
  assert.equal(f(1280, 720), 0, 'the screen the approach was tuned on keeps its floor');
  assert.ok(Math.abs(f(390, 844) - Math.log2(390 / 720)) < 1e-9, 'a portrait phone: its width is the shorter side');
  assert.ok(Math.abs(f(1440, 877) - Math.log2(877 / 720)) < 1e-9, 'a desktop: its height is the shorter side');
  /* the globe's radius at the floor, as a share of the shorter side, is one number */
  const share = (w, h) => (512 * 2 ** f(w, h)) / Math.min(w, h);
  assert.ok(Math.abs(share(390, 844) - share(1920, 1000)) < 1e-9, 'phone and desktop see the Earth at the same share');
  assert.equal(f(100, 100), -2, 'never below the renderer\'s own lowest zoom');
  assert.equal(f(0, 0), 0, 'no map yet → the old floor');
});

test('② today\'s line answers no press while the clock is at Now', () => {
  const src = read('js/time-borders.js');
  const m = /registerReader\(\{ id:'today-borders'[\s\S]*?layers:\(\)=>([^\n]+)/.exec(src);
  assert.ok(m, 'the today-borders reader exists');
  const layers = new Function('active', '_liveNow', 'return ' + m[1].replace(/,\s*$/, ''));
  assert.deepEqual(layers(false, () => true), [], 'at Now: no line to press');
  assert.deepEqual(layers(false, () => false), ['borders-only-line'], 'a past year drawn with today\'s line keeps the card');
  assert.deepEqual(layers(true, () => false), [], 'an era sheet answers through its own reader');
});

test('③ the official-warnings world key names no rank ladder', () => {
  const src = read('js/world-packs.js');
  const a = src.indexOf('      function worldKey(){');
  const body = src.slice(a, src.indexOf('\n      function ', a + 30));
  assert.ok(!/lower rank|higher rank|Each agency’s own published scale/.test(body), 'no fixed lower/higher-rank legend');
  assert.match(body, /Nothing in force/, 'what is IntMap\'s own (nothing in force, not covered) stays');
});

test('④ Tools ▾ holds 測る・描く; 道具・シミュレーション・分析 are in the menu to its left', () => {
  const html = read('index.html');
  const iMore = html.indexOf('id="btn-more-tools"'), iTools = html.indexOf('id="btn-measure-menu"');
  assert.ok(iMore > 0 && iTools > iMore, 'the other menu sits left of Tools');
  const ui = read('js/map-ui.js');
  assert.match(ui, /sections:TOOL_SECS\.map\(\(\[k\]\)=>k\)\.filter\(k=>k!=='measure'\)/, 'the left menu holds every section but 測る・描く');
  assert.match(ui, /sections:more\?\['measure'\]:null/, 'Tools ▾ holds only 測る・描く when the left menu exists');
});

test('⑤ the sidebar wordmark is the shipped picture of the name', () => {
  const html = read('index.html');
  assert.match(html, /<h2 class="im-wordmark"><img src="img\/intmap-wordmark\.png" alt="IntMap"/);
  assert.ok(existsSync(new URL('../img/intmap-wordmark.png', import.meta.url)), 'the picture is in the tree');
});
