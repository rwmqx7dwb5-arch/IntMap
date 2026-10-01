/* ============================================================================
 *  IntMap · the map's chrome must not cover what the reader is trying to read or press
 *  (js/map-typography.js news-band declutter, js/mobile-ui.js search-pill watcher, the layer-search ✕)
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
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const typo = read('js/map-typography.js');

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
    new Function('window', 'document', 'IntMapGeoEngine', 'bandBox', liftFunction(s, 'declutterNewsBands') + '\nreturn declutterNewsBands;')(
      win, doc, win.IntMapGeoEngine, () => ({ w: 120, h: 19 }))([
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
/* the desktop `.map-search` rule — the FIRST one, which is the geometry; the later ones only
   restate colour/material inside media blocks. */
function searchPillRule() {
  const css = read('css/intmap.css');
  const m = /\n\s*\.map-search\{([^}]*width:min\([^}]*)\}/.exec(css);
  assert.ok(m, 'css/intmap.css still declares the .map-search geometry rule');
  return m[1];
}

/* ── ① THE WATCHER STILL EXISTS AND STILL GUARDS BOTH EDGES ─────────────────────────────────── */
test('R484 ① the search pill still has a collision test against both control zones', () => {
  /* ⚠ READ, NOT RUN: the watcher reads live element rects on resize; what is asked is that both control zones are still in its test. */
  const js = read('js/mobile-ui.js');
  assert.match(js, /const collide = \(\(mapCX \+ half \+ margin\) > rightLeft\) \|\| \(\(mapCX - half - margin\) < leftRight\)/,
    'the pill is still tested against the right-hand stack AND the left sidebar');
  /* the right edge it is tested against must be the whole stack (#R480), not a remembered pill */
  assert.match(js, /querySelectorAll\('\.map-controls-top > \*, #btn-layers'\)/,
    'rightLeft comes from every row of the stack');
});

/* ── ② THE CONSTANT AND THE STYLESHEET AGREE — DERIVED, NOT RETYPED ─────────────────────────── */
test('R484 ② `half` is the real half-width of .map-search, derived from the CSS', () => {
  /* ⚠ READ, NOT RUN: the claim is that a literal in js/mobile-ui.js equals a quantity derived from css/intmap.css — both are text, and the derivation is done here. */
  const rule = searchPillRule();

  const w = /width:min\((\d+)px/.exec(rule);
  assert.ok(w, '.map-search still caps its width with min(<n>px, …)');
  const content = Number(w[1]);

  /* padding: `4px 4px 4px 12px` → left+right. Written long-hand in this rule; read all four. */
  const p = /padding:([^;]+);/.exec(rule);
  assert.ok(p, '.map-search still declares padding');
  const pv = p[1].trim().split(/\s+/).map((x) => Number(String(x).replace('px', '')));
  assert.ok(pv.every((n) => Number.isFinite(n)), `padding must be plain px, found "${p[1]}"`);
  const padX = pv.length === 4 ? pv[1] + pv[3] : pv.length === 2 ? pv[1] * 2 : pv[0] * 2;

  const b = /border:(\d+)px/.exec(rule);
  assert.ok(b, '.map-search still declares a border width');
  const borderX = Number(b[1]) * 2;

  /* ⚠ content-box: the measured pill is 398 for 380+16+2, so `width` does NOT include padding here.
     If a box-sizing reset ever changes that, this arithmetic is what has to change with it. */
  const expected = Math.round((content + padX + borderX) / 2);

  const js = read('js/mobile-ui.js');
  const h = /const half=(\d+), margin=(\d+);/.exec(js);
  assert.ok(h, 'js/mobile-ui.js still declares the collision half-width as a literal');
  assert.equal(Number(h[1]), expected,
    `half must be .map-search's real half-width: (${content} + ${padX} + ${borderX})/2 = ${expected}, found ${h[1]}`);

  /* the defect this round fixed, stated as a number so it cannot come back quietly */
  assert.ok(Number(h[1]) > 110, 'the pre-#R484 value of 110 described a 220px pill that never existed');
});

/* ── ③ THE MEASURING VERSION MUST NOT COME BACK ──────────────────────────────────────────────── */
test('R484 ③ the collision half-width is not re-measured at runtime', () => {
  /* ⚠ READ, NOT RUN: an absence of a runtime cache; nothing to run. */
  const js = read('js/mobile-ui.js');
  /* a cache refreshed only while the watcher is off can never be corrected once it is on — measured,
     that left 1500x900 permanently anchored. Named so a future reader meets the reason, not the bug. */
  assert.ok(!/_msHalf/.test(js), 'no latched half-width cache (it cannot self-correct once ms-narrow is on)');
  assert.ok(!/ms-narrow'\)\)\{ const r=host\.getBoundingClientRect\(\)/.test(js),
    'the pill does not measure itself to decide whether it collides');
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

