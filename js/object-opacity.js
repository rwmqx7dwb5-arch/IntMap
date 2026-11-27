/*  IntMap · What the Objects list's "Opacity" slider means  (one answer, shared by every painter)
 *
 *  The slider reads 0..100 % of the look the object can have at its strongest. A LINE, a POINT and a LABEL are drawn at
 *  that opacity as it is. An AREA FILL cannot be: a fully opaque fill hides the map under it, so a fill's strongest look is
 *  FILL_AT_FULL and the slider scales 0..FILL_AT_FULL.
 *
 *  Why a shared rule: every painter used to multiply the slider by its OWN fill base (annotation 0.16, upload 0.22, Atlas
 *  polygon 0.32, composed shape 0.2, generic layer 0.4), so 100 % was the palest a fill could get (0.16 for a measured area) and the
 *  whole 10–100 % range moved a fill by a few hundredths — invisible. The slider's value now maps onto the same range for every
 *  object, whichever module drew it (the panel and Atlas's `object` capability both end in the same setters).
 *
 *  FILL_AT_FULL = 0.85: a design value, not a measurement — dark enough that the colour reads as a solid area, light enough that
 *  the base map's coast and borders still show through. Expires if the base map's land colour changes so much that 0.85 hides it.
 *  A fill whose opacity nobody set keeps the look its painter has always given it; `alphaOfFill` is that look expressed on the slider,
 *  so the slider opens where the map is, not at 100 %.
 */
export const FILL_AT_FULL = 0.85;

/** slider value (0..1) → fill-opacity */
export const fillFromAlpha = (a) => Math.max(0, Math.min(1, +a)) * FILL_AT_FULL;

/** a fill-opacity a painter already uses → the slider value that shows it (to the slider's 5 % step) */
export const alphaFromFill = (f) => Math.max(0, Math.min(1, Math.round((+f / FILL_AT_FULL) * 20) / 20));

/** the layer-level paint property an object's opacity drives, by style-layer type, and the value for slider value `a` */
export const OPACITY_PROPS = Object.freeze({
  fill: 'fill-opacity', line: 'line-opacity', circle: 'circle-opacity',
  symbol: ['text-opacity', 'icon-opacity'], 'fill-extrusion': 'fill-extrusion-opacity', raster: 'raster-opacity', heatmap: 'heatmap-opacity',
});
export const opacityPaint = (type, a) => {
  const p = OPACITY_PROPS[type]; if (!p) return [];
  const v = type === 'fill' ? fillFromAlpha(a) : Math.max(0, Math.min(1, +a));
  return (Array.isArray(p) ? p : [p]).map((k) => [k, v]);
};
