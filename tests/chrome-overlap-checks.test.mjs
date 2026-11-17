/* ============================================================================
 *  IntMap · the map's chrome must not cover what the reader is trying to read or press
 *  (js/map-typography.js news-band declutter, the search pill in the map frame, the layer-search ✕)
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r428-checks ①, tests/r484-checks and tests/r270-checks ②.
 *
 *  R428 — 本番検証が見つけた：読めない帯が場所を取っていた
 *  #R416 の本番検証（2026-08-24）で、依頼の症状が**別の経路でもう一度**出ていた。
 *
 *  ① **帯が地図の被せものの下に入る。** 右上の Map/Satellite ＋ Flat/Globe/3D の卓の下に
 *     レイキャビクの帯が潜り、角丸の箱の切れ端だけが読者に届いた——#R416 が直した「空の
 *     `text-field`」とは別の原因で、**絵は同じ**である。
 *     ⚠⚠ しかも**読めない帯が場所を確保していた**。`declutterNewsBands` は他の帯としか
 *     ぶつからないので、卓の下の帯が勝ち、読めたはずの帯がそれに負ける。⇒ 被せものを
 *     ブラウザ自身に訊く（`elementFromPoint`）。**一覧は持たない**——手書きの一覧が
 *     欠陥そのものだったのが #R399 である。
 *
 *
 *  R484 — 検索バーの当たり判定は、画面に無いピルを予測していた
 *  Reported by the production check of #R480: at 1310x900 the place-search pill overlapped the
 *  top-right control stack by 71.44px and `elementFromPoint` at the centre of #ms-btn returned
 *  `btn-view-map` — THE SEARCH BUTTON COULD NOT BE CLICKED. Reproduced locally on the built app,
 *  same numbers.
 *
 *  ══ ⚠⚠⚠ THE WATCHER WAS PREDICTING A PILL THAT DOES NOT EXIST ════════════════════════════════
 *  js/mobile-ui.js decides whether to re-anchor the pill with
 *
 *      const half=110, margin=14;   // "half of a comfortable ~220px centered pill"
 *      const collide = ((mapCX + half + margin) > rightLeft) || …
 *
 *  but `.map-search` is `width:min(380px,55vw)` with 16px of padding and a 2px border — 398px, whose
 *  half is 199. The prediction was 89px short of the element on every desktop width IntMap has ever
 *  shipped. It stayed invisible because the widest row of the right-hand stack was the TOOLS row at
 *  y=50, which barely shares a y-band with the pill at y=10. #R480 put a 317px row at y=10 and the
 *  under-estimate became a dead button across roughly 1303–1453px — a band containing both 1366 and
 *  1440, two of the most common laptop widths there are.
 *
 *  ══ ⚠⚠ AND THE OBVIOUS FIX — MEASURE IT — IS THE WRONG ONE ═══════════════════════════════════
 *  This round wrote that version first. `getBoundingClientRect()` on the pill can only be trusted
 *  while `ms-narrow` is OFF, because under it the width is the watcher's own output and reading it
 *  back is circular. So the reading has to be cached — and a cache that is only refreshed while the
 *  watcher is off can never be corrected once the watcher is on. MEASURED: a stale early half of
 *  ~455 left 1500x900 anchored with BOTH collision tests false. A width that was never in trouble
 *  got a permanently displaced pill. The number goes back into the source, and ② below is what #R25
 *  never had: a gate that fails when the constant and the stylesheet disagree.
 *
 *  R270 ② the layer-search ✕ was a character no family in this app's stack draws.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const typo = read('js/map-typography.js');
const fs_list = (dir) => readdirSync(path.join(ROOT, dir)).filter((n) => n.endsWith('.js')).map((n) => dir + '/' + n);

/* ── ① 読めない帯は場所を取らない ───────────────────────────────────────── */
test('R428 ① a band that the chrome covers neither shows nor claims space', () => {
  /* EVALUATED: `declutterNewsBands` is lifted out of the comment-stripped js/map-typography.js and
     run over two news pins whose bands would collide. The browser's hit-test is a stub that answers
     «something that is not the map» over the top-right corner — an element with no id at all, so a
     hand-written list of panel ids could not know it. */
  const s = codeOnly(typo);
  const run = (coveredRect) => {
    const state = {};
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0 }) };
    const chrome = {};   /* anonymous: not the canvas, not a known panel */
    const win = { IntMapGeoEngine: {
      layers: { hasSource: () => true, has: () => true, setFeatureState: (f, st) => { state[f.id] = st.bnd; } },
      render: { size: () => ({ width: 1000, height: 600 }), canvas: () => canvas },
      coords: { project: (c) => ({ x: c[0], y: c[1] }) },
    } };
    const doc = { elementFromPoint: (x, y) => (coveredRect && x >= coveredRect.x0 && x <= coveredRect.x1 && y >= coveredRect.y0 && y <= coveredRect.y1) ? chrome : canvas };
    /* (module-graph) the engine is the file's imported binding `IntMapGeoEngine`, handed to the lifted body
       under that name (window stays supplied for whatever is still read off it) */
    /* (news-type-polish) the band geometry the declutter reads is the file's own BAND, taken from the source */
    const BAND = new Function('return ' + /const BAND = (\{[^}]*\})/.exec(s)[1])();
    new Function('window', 'document', 'IntMapGeoEngine', 'bandBox', 'BAND', liftFunction(s, 'declutterNewsBands') + '\nreturn declutterNewsBands;')(
      win, doc, win.IntMapGeoEngine, () => ({ w: 120, h: 19 }), BAND)([
      /* A is higher priority (placed) and sits under the chrome; B is 10 px lower and collides with A */
      { type: 'Feature', geometry: { type: 'Point', coordinates: [850, 20] }, properties: { fid: 'A', mapped: 'true', short: 'Reykjavik' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [850, 30] }, properties: { fid: 'B', mapped: 'true', short: 'Oslo' } },
    ]);
    return state;
  };
  const open = run(null);
  assert.deepEqual(open, { A: true, B: false }, 'with nothing on top, the two bands collide and the higher-priority one wins');
  const covered = run({ x0: 700, x1: 1000, y0: 0, y1: 28 });
  assert.equal(covered.A, false, 'a band under the chrome must not show');
  /* ⚠ 判定は**場所を取る前**に入っていること。あとから隠すだけでは、読めたはずの帯が
     すでに負けている（これがこのラウンドの欠陥そのもの）。 */
  assert.equal(covered.B, true, 'the occlusion test must gate the claim, not just the display — B was readable and must win');
  /* 手書きの被せもの一覧を作らないこと。 */
  assert.ok(!/getElementById\('(map-controls|layers-panel|basemap)/.test(s),
    'the occluders must not be named one by one');
});
/* ══ R484 → (map-chrome-layout) THE PILL CANNOT REACH THE STACK, BY CONSTRUCTION ═════════════════════════════
   R484's defect was a search button under the control stack (elementFromPoint at #ms-btn returned btn-view-map),
   and its guard was a JS watcher whose collision constant had to match the stylesheet (①–③ here checked that).
   The watcher is gone (js/mobile-ui.js says what took over each of its duties): the pill and the stack are two
   cells of one grid inside `.map-frame`, and the stack's column never shrinks below its own content, so there is
   no constant left to keep in step. The defect itself — «something covers the search button or a control, or a
   control sits under a side panel» — is MEASURED, with elementFromPoint, at every zoom × panel state by
   tests/map-chrome-layout.spec.js. What stays here is the structure that makes that true, read from the source. */
test('R484 the search pill and the control stack are two cells of the map frame\'s one grid', () => {
  /* ⚠ READ, NOT RUN: parentage in index.html and the grid placement in css/intmap.css are text; the behaviour is the spec's. */
  const html = codeOnly(read('index.html'), { lang: 'html' });
  const frameAt = html.indexOf('<div class="map-frame" id="map-frame">');
  assert.ok(frameAt >= 0, 'index.html has the map frame');
  for (const marker of ['id="map-search"', 'class="map-controls-top"', 'id="tool-panel"', 'id="sat-controller"', 'id="news-timeline"']) {
    assert.ok(html.indexOf(marker) > frameAt, `${marker} sits inside the map frame`);
  }
  const css = read('css/intmap.css');
  assert.match(css, /\.map-frame > \.map-search\{ grid-column:2; grid-row:1;/, 'the pill is the middle cell of the top row');
  assert.match(css, /\.map-frame > \.map-controls-top\{ grid-column:3; grid-row:1;/, 'the stack is the last cell of the top row');
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) minmax\(0,380px\) minmax\(max-content,1fr\)/,
    'the stack\'s column never goes below its own content, so the pill gives way and never slides under it');
  /* nothing writes the pill's position from script any more — a second owner is how #R309 got half of one layout and half of another */
  for (const f of fs_list('js')) {
    const src = codeOnly(read(f));
    assert.ok(!/--ms-(left|right|top)/.test(src) && !/['"]ms-narrow['"]/.test(src), `${f} does not position the search pill`);
  }
});

/* ── ② the clear mark is geometry, and there is exactly one of it ───────────────────────────── */
test('R270 ② both layer-search clear buttons draw the SAME geometric ✕, and neither uses the glyph', () => {
  /* ⚠ READ, NOT RUN: the glyph is markup inside two DOM factories; which character is drawn is asked of the text. */
  const ui = codeOnly(read('js/map-ui.js'));
  const ex = codeOnly(read('js/map-extras.js'));
  const defs = (read('js/map-ui.js').match(/window\.IntMapClearGlyph\s*=/g) || []).length
             + (read('js/map-extras.js').match(/window\.IntMapClearGlyph\s*=/g) || []).length;
  assert.equal(defs, 1, 'the mark must be defined exactly once');
  assert.match(ui, /window\.IntMapClearGlyph=function/, 'js/map-ui.js is where it is defined');
  assert.match(ui, /stroke-linecap="round"/, 'it is two strokes, not a character');
  /* ⚠ (#R296) THERE IS ONLY ONE LAYER-SEARCH BOX NOW — 「レイヤー選択欄はclassic dropdownを完全削除」.
     #R239's lesson (a defect fixed in one of two copies and left in the other) is what made these
     checks assert BOTH boxes; deleting one copy is the strongest possible answer to it, so the
     assertion becomes 「the classic one is gone」 rather than 「it matches」. */
  assert.doesNotMatch(ex, /window\.IntMapClearGlyph\(\)/, 'and the classic box that had to match it no longer exists');
  /* the glyph itself must not come back in either clear button */
  const X = String.fromCharCode(0x2715);
  assert.ok(!new RegExp('ls-clear[^;]*>' + X).test(ex), 'the classic clear button must not print U+2715');
  assert.ok(!new RegExp("className='lsr-clear'; b\\.textContent='" + X).test(ui),
    'the sidebar clear button must not print U+2715');
  /* …and the native WebKit ✕ that `type=search` adds is suppressed, or there would be two marks */
  assert.match(ui, /-webkit-search-cancel-button\{[^']*display:none/,
    'the native search cancel button must be suppressed on both boxes');
});

