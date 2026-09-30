/* ============================================================================
 *  IntMap · the live-aircraft glyph (js/data-layers.js)
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r183-checks (the aircraft glyph and the lifted-body counter) and
 *  tests/r246-checks ⑤.
 *  #R183 — the counter that started counting parts instead of aircraft; the icon declared at
 *  devicePixelRatio. #R190 withdrew the multi-part body. #R246 「Live aircraft trafficで航空機の色は
 *  以下に。民間機：シアン #00D9FF 軍用機：鮮赤 #FF3040 両方とも：より太いアウトライン」
 *  ⚠ READ, NOT RUN (every test here): the glyph is rasterised onto a canvas and registered with the
 *  renderer, and the lifted body is a renderer solid — only a page with WebGL executes either. The
 *  source is read with comments stripped where a note could otherwise answer for the code.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = codeOnly;

/* ══ (remove-synthetic-planes) THE MARK HAS ONE DECLARATION NOW ════════════════════════════════
   js/data-layers.js drew the aircraft twice for the airplanes.live sweep: a canvas glyph registered
   with the renderer (#R183's devicePixelRatio fix) and a lifted fill-extrusion body counted by its
   'body' part (#R183's counter). Both went with that sweep, which had no provider left. The facts
   those checks guarded — the original outline, the thicker white stroke, the two colours — are asked
   of where they live now: js/plane-glyph.js (the outline and the stroke, read by both engines) and
   src/aviation-worker.js (the colours it packs for the GPU). The removal itself is measured in
   tests/remove-synthetic-planes-checks.test.mjs. */
const DL = code(read('js/data-layers.js'));
const GLYPH = code(read('js/plane-glyph.js'));
const WORKER = code(read('src/aviation-worker.js'));

test('R190: the aircraft mark is the original silhouette, not a multi-part airliner', () => {
  assert.match(GLYPH, /const OUTLINE = \[\[0, -19\]/, 'the one declaration of the mark begins at the original nose');
  assert.doesNotMatch(DL, /_PLANE_ORIG|_PLANE_OUTLINE/, 'and js/data-layers.js keeps no second copy of it');
  for (const s of [DL, GLYPH]) {
    assert.doesNotMatch(s, /_P_LEVELS/, 'the part-height table is gone');
    assert.doesNotMatch(s, /DETAIL_MAX_AIRCRAFT/, 'and the budget that chose between the two bodies');
    assert.doesNotMatch(s, /rgba\(255,255,255,0\.97\)/, 'and the rim plate is still gone');
  }
});

/* ── ⑤ THE THICKER OUTLINE AND THE MILITARY RED ─────────────────────────────────────────────── */
test('r246 ⑤ live aircraft are vivid red when military, with one outline width both engines read', () => {
  /* ⚠ THICKER, AND ONLY ONCE. #R244's outline was 1.6 units of the 44-unit artwork; #R246 asked for
     a thicker one. js/plane-glyph.js states it once and both engines read it (engine-aircraft ⑤). */
  const w = /const STROKE = ([\d.]+);/.exec(GLYPH);
  assert.ok(w, 'the outline width is not a constant');
  assert.ok(parseFloat(w[1]) > 1.6, `the outline is ${w[1]} units — it was asked to get THICKER than 1.6`);
  assert.match(WORKER, /mil: \[0xFF, 0x30, 0x40\]/, 'military aircraft are the vivid red #FF3040 the reader asked for');
  /* the ship glyph is NOT an aircraft and keeps its own line */
  assert.match(DL, /const make=\(color\)=>\{ const s=40,[\s\S]{0,200}?ctx\.lineWidth=1\.6;/, 'the ship icon lost its own stroke');
});
