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

try {
  window.IntMapBorderStyle = {
    color: BORDER_COLOR, admin1: ADMIN1_COLOR,
    width: BORDER_WIDTH, casing: BORDER_CASING, admin1Width: ADMIN1_WIDTH,
  };
} catch (_) { /* no window (a node test importing the constants) — the exports are the contract */ }
