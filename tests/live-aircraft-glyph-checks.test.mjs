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

/* ── js/data-layers.js — the aircraft glyph, read as source ───────────────────────────────────── */
const DL = read('js/data-layers.js');

test('R183: the aircraft icon is declared at devicePixelRatio', () => {
  // The bug was silent: addImage(id, ImageData) with no pixelRatio makes MapLibre treat canvas
  // pixels as CSS pixels, so a 1× bitmap is upscaled on every HiDPI screen. Nothing errors.
  assert.match(DL, /devicePixelRatio/, 'the plane glyph must be rasterised at the screen\'s ratio');
  assert.match(DL, /addImage\([^)]*\{\s*pixelRatio/, 'and DECLARED with it, or MapLibre still scales it');
});

/* ⚠ #R190 WITHDREW the multi-part body. 「Live aircraft trafficの飛行機のマークはat real altitude中も
   昔のものに戻して。」 — the lifted aircraft is ONE polygon of the original outline again, so the
   level table, the rim/halo plates and the aircraft-count budget that switched between the detailed
   and plain versions are gone. These three assertions pinned that construction; what survives of
   #R183 here is the counter's LESSON, which is why the last one is kept and pointed at the shape the
   count actually has now. */
test('R190: the lifted aircraft is the original silhouette, not a multi-part airliner', () => {
  assert.match(DL, /const _PLANE_OUTLINE=_PLANE_ORIG;/, "the 3-D body draws the 2-D glyph's own outline");
  assert.doesNotMatch(DL, /_P_LEVELS/, 'the part-height table is gone');
  assert.doesNotMatch(DL, /DETAIL_MAX_AIRCRAFT/, 'and the budget that chose between the two bodies');
  /* (#R191) one AEROPLANE per aircraft, drawn as the glyph is drawn: the outline inset by its own
     1.6-px stroke, with that stroke as a second ring. #R185's multi-part airliner and its rim PLATE
     stay gone — which is what the two doesNotMatch assertions above are for. */
  assert.match(DL, /coordinates:\[planeRingPts\(d\.lng,d\.lat,d\.heading,half,_PLANE_CORE\)\]/, 'one aeroplane per aircraft');
  assert.doesNotMatch(DL, /rgba\(255,255,255,0\.97\)/, 'and the rim plate is still gone');
});

test('R183: the "lifted" counter counts aircraft, not the parts they are made of', () => {
  // #R181's lesson: suspect what a counter counts. Kept through #R190, pointed at 'body'.
  assert.match(DL, /part==='body'/, 'aircraft are counted by the one solid that IS the aeroplane');
  assert.match(DL, /aircraft:\s*bodies\.length/, 'and reported under their own name');
});

/* ── ⑤ THE TWO AIRCRAFT COLOURS AND THE THICKER OUTLINE ────────────────────────────────────── */
test('r246 ⑤ live aircraft are cyan and vivid red, with one outline width both renderings read', () => {
  const s = code(read('js/data-layers.js'));
  assert.match(s, /const PLANE_CIV='#00D9FF';/, 'civil aircraft are not the cyan the reader asked for');
  assert.match(s, /const PLANE_MIL='#FF3040';/, 'military aircraft are not the vivid red the reader asked for');
  /* ⚠ THICKER, AND ONLY ONCE. #R244's outline was 1.6 units of the 44-unit artwork; the lifted 3-D
     body draws the same stroke as a mitred RING whose half-width was the literal 0.8. Deriving it
     means the two renderings cannot disagree about how thick the outline is — the defect #R173
     wrote up and `_feHex` exists for. */
  const w = /const PLANE_STROKE=([\d.]+);/.exec(s);
  assert.ok(w, 'the outline width is not a constant');
  assert.ok(parseFloat(w[1]) > 1.6, `the outline is ${w[1]} units — it was asked to get THICKER than 1.6`);
  assert.match(s, /const _PLANE_STROKE=PLANE_STROKE\/2;/, 'the lifted mark still hard-codes its own half-width');
  assert.match(s, /ctx\.lineWidth=PLANE_STROKE;/, 'the flat glyph still hard-codes its own stroke');
  /* the ship glyph is NOT an aircraft and keeps its own line */
  assert.match(s, /const make=\(color\)=>\{ const s=40,[\s\S]{0,200}?ctx\.lineWidth=1\.6;/, 'the ship icon lost its own stroke');
});

