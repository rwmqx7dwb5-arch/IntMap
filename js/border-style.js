/*  IntMap · The one border line  (#R212)
 *
 *  「国境線は少しだけ灰色に。地方区分は少しだけ明るい色に。両者とも少しだけ細く。
 *    また、歴史的国境線も同じものに統一して。」
 *
 *  THREE LAYERS IN TWO FILES USED TO DECIDE THIS INDEPENDENTLY:
 *    · js/app-body.js  `borders-only-line`   — today's national borders (OpenMapTiles `boundary`)
 *    · js/app-body.js  `ref-admin1`          — provinces / states / prefectures
 *    · js/time-borders.js `imtb-line`        — the borders of whatever year the clock is on (CShapes)
 *
 *  The third was a different grey at a different width, so time-travelling changed how a border
 *  LOOKED as well as where it ran — two variables moving at once, which is exactly the thing a map
 *  should not do. The colour and the zoom→width ladder now live here and all three read them.
 *
 *  ⚠ A NAMED EXPORT, for the reason js/grid-style.js records: js/app-body.js's style literal runs at
 *  instantiate time, and anything it reaches for must already be initialised. An ES import is.
 *  `window.IntMapBorderStyle` is set from the same constants (not a second copy) for js/time-borders.js,
 *  which adds its layer long after boot and is not an ES module.
 */

/* one step off pure white: on a pale basemap #ffffff IS the basemap (#R212) */
export const BORDER_COLOR = '#d9dbe0';
/* the province line: the same violet family, one step brighter so it reads on a dark basemap */
export const ADMIN1_COLOR = '#cba6f7';
/* zoom → width. ~15 % thinner than #R210's, which is what 「少しだけ細く」 asked for. */
export const BORDER_WIDTH = ['interpolate', ['linear'], ['zoom'], 1, 0.95, 4, 1.55, 8, 2.2, 12, 2.9];
export const BORDER_CASING = ['interpolate', ['linear'], ['zoom'], 1, 2.0, 4, 2.8, 8, 3.8, 12, 4.9];
export const ADMIN1_WIDTH = ['interpolate', ['linear'], ['zoom'], 3, 0.8, 7, 1.6, 11, 2.55];
/* (hist-border-same-look) THE WHOLE LINE, NOT ONLY ITS COLOUR AND WIDTH.
   「歴史地図は、現在の地図の国境や地方区分境界線と、ちょっと違う…見た目を同じにしろ」(2026-10-06).
   #R212 shared the colour and the ladder, but the rest of the stroke stayed written per layer, and it
   drifted: today's border had the dark casing (#R210) and the era border never got it; the era border
   rounded its caps; and #R705 repainted the era border dark grey on the pale historical base while
   today's border on the pale CARTO base kept the pale line on its casing. The casing is what makes the
   pale line read on a pale base — on both. So the paint and layout of «a national border» and of its
   casing live here, and every layer that draws one (today's border, the coastline, the era border)
   spreads these objects instead of re-typing them. Each reader gets its own copy (a style layer must
   not share a mutable object with another). */
export const BORDER_LAYOUT = () => ({ 'line-join': 'round' });
export const BORDER_PAINT = () => ({ 'line-color': BORDER_COLOR, 'line-opacity': 0.95, 'line-width': BORDER_WIDTH });
export const BORDER_CASING_PAINT = () => ({ 'line-color': '#000000', 'line-opacity': 0.35, 'line-width': BORDER_CASING });

try {
  window.IntMapBorderStyle = {
    color: BORDER_COLOR, admin1: ADMIN1_COLOR,
    width: BORDER_WIDTH, casing: BORDER_CASING, admin1Width: ADMIN1_WIDTH,
    layout: BORDER_LAYOUT, paint: BORDER_PAINT, casingPaint: BORDER_CASING_PAINT,
  };
} catch (_) { /* no window (a node test importing the constants) — the exports are the contract */ }
