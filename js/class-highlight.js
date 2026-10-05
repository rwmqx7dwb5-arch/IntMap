/* ============================================================================
 *  IntMap · «Show only the classes I picked» on a categorical raster  (landcover-class-highlight)
 * ----------------------------------------------------------------------------
 *  One rule for how a class the reader did NOT pick is drawn, for every categorical raster whose legend
 *  lets the reader pick classes: the Köppen climates (js/data-layers.js, a same-origin PNG recoloured on a
 *  canvas) and ESA WorldCover (js/layer-packs.js, remote tiles recoloured as each tile arrives). Before this
 *  file the rule lived inline in the Köppen code; the land cover asked for the same look
 *  (「land coverレイヤーも、ケッペンの気候区分レイヤーと同じように、選択したものだけハイライト表示されるようにして。」
 *  2026-10-05), so it is here once and both read it.
 *  The two numbers are the look #R23 restored for Köppen («gray + faded»): the gray is the pixel's mean
 *  channel × DIM_GRAY, its alpha × DIM_ALPHA. They are a design choice, not a measurement; they lapse only
 *  if the reader asks for a different dimmed look, and then they change here for both layers at once.
 * ==========================================================================*/

export const DIM_GRAY = 0.6;
export const DIM_ALPHA = 0.28;

/** write the dimmed form of the RGBA pixel at `i` of `src` into `out` at `i` (out may be src) */
export function dimPixel(src, out, i) {
  const g = (src[i] + src[i + 1] + src[i + 2]) / 3;
  out[i] = g * DIM_GRAY; out[i + 1] = g * DIM_GRAY; out[i + 2] = g * DIM_GRAY; out[i + 3] = Math.floor(src[i + 3] * DIM_ALPHA);
}

/** '#rrggbb' → 0xRRGGBB */
export function rgbKey(hex) { return parseInt(String(hex).replace('#', ''), 16); }

/**
 * Recolour an RGBA buffer in place: a pixel whose exact colour is one of `keep` (a Set of 0xRRGGBB) stays,
 * every other visible pixel is dimmed; transparent pixels stay transparent.
 * The match is EXACT because the tiles it is used on carry only their palette's colours (WorldCover, measured
 * 2026-10-05 at z2–z14: 100 % of pixels were one of the legend's 11 colours or transparent). A pixel that is in
 * no class is not one the reader picked, so it is dimmed, never kept.
 * → the number of pixels kept
 */
export function keepClasses(data, keep) {
  let kept = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    if (keep.has((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])) { kept++; continue; }
    dimPixel(data, data, i);
  }
  return kept;
}

