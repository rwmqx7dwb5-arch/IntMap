/* ============================================================================
 *  IntMap · R484 — 検索バーの当たり判定は、画面に無いピルを予測していた
 * ----------------------------------------------------------------------------
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
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

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
  const js = read('js/mobile-ui.js');
  assert.match(js, /const collide = \(\(mapCX \+ half \+ margin\) > rightLeft\) \|\| \(\(mapCX - half - margin\) < leftRight\)/,
    'the pill is still tested against the right-hand stack AND the left sidebar');
  /* the right edge it is tested against must be the whole stack (#R480), not a remembered pill */
  assert.match(js, /querySelectorAll\('\.map-controls-top > \*, #btn-layers'\)/,
    'rightLeft comes from every row of the stack');
});

/* ── ② THE CONSTANT AND THE STYLESHEET AGREE — DERIVED, NOT RETYPED ─────────────────────────── */
test('R484 ② `half` is the real half-width of .map-search, derived from the CSS', () => {
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
  const js = read('js/mobile-ui.js');
  /* a cache refreshed only while the watcher is off can never be corrected once it is on — measured,
     that left 1500x900 permanently anchored. Named so a future reader meets the reason, not the bug. */
  assert.ok(!/_msHalf/.test(js), 'no latched half-width cache (it cannot self-correct once ms-narrow is on)');
  assert.ok(!/ms-narrow'\)\)\{ const r=host\.getBoundingClientRect\(\)/.test(js),
    'the pill does not measure itself to decide whether it collides');
});
