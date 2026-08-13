/* ============================================================================
 *  IntMap · THE ELEVATION SOURCE — where the DEM comes from, and how deep  (#R234)
 * ----------------------------------------------------------------------------
 *  「陰影起伏（標高）レイヤーの解像度を上げて。」 → 「携帯は据え置き、デスクトップを上げる」.
 *
 *  Three different parts of this program stream the SAME AWS terrarium bucket — the main map's
 *  `terrain-dem` source (js/app-body.js), the comparison map (js/compare.js) and the Cesium engine's
 *  hillshade (js/cesium-engine.js) — and until this round each of them carried its own answer to
 *  "how deep does the elevation data go". They disagreed: the main map had streamed terrarium's
 *  NATIVE MAXIMUM (15) on desktop since #R20, while the comparison map was pinned at a hard-coded 13
 *  and the Cesium hillshade clamped itself to 14. That gap WAS the missing hillshade resolution:
 *  there is nothing above 15 to ask for, so the only thing to raise was the code that had quietly
 *  capped itself below the map beside it.
 *
 *  ⚠ 13 ON PHONES IS DELIBERATE AND IT STAYS. #R19/#R20 stopped there because the extra tile set is
 *  real resident memory that has killed the tab, and this round's FIRST instruction is that the
 *  phone must get faster. `maxZoom()` answers 13 there and every caller inherits that, including the
 *  two that are being raised.
 *
 *  ⚠ AND IT IS ASKED OF THE POINTER, NOT THE VIEWPORT WIDTH — #R225's rule. «Can this device afford
 *  the finest mesh» is a question about the machine, so a landscape phone is still a phone (#R232).
 *
 *  ⚠ ONE EXPORT AND EVERYTHING INSIDE IT — tests/r175-checks ③ forbids an unexported top-level
 *  declaration in js/, because such a name would have been a global before the bundle.
 * ==========================================================================*/

export function makeDemSource() {
  /* (#R7) Five host aliases for the SAME AWS terrarium DEM bucket. Each distinct hostname gets its
     own browser connection pool, so round-robining gives ~5× the concurrent DEM fetches over
     HTTP/1.1 S3 — the DEM tiles were the 3-D under-fetch bottleneck the reader measured (<10 Mbps).
     ⚠ (#R233) an older note above this list claimed "three hosts"; there are five, and the count is
     not written down twice any more. */
  const TILES = [
    'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png',
    'https://elevation-tiles-prod.s3.dualstack.us-east-1.amazonaws.com/terrarium/{z}/{x}/{y}.png',
    'https://elevation-tiles-prod.s3.us-east-1.amazonaws.com/terrarium/{z}/{x}/{y}.png',
    'https://s3.dualstack.us-east-1.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  ];
  /* the same question js/app-body.js asks about the renderer's own settings (#R225/#R232): is this a
     touch device with no fine pointer at all? */
  function isPhoneGPU() {
    try { return window.matchMedia('(pointer:coarse)').matches && !window.matchMedia('(any-pointer:fine)').matches; }
    catch (_) { return /Mobi|Android|iPhone|iPad/.test(navigator.userAgent || ''); }
  }
  function maxZoom() { return isPhoneGPU() ? 13 : 15; }
  /* the whole MapLibre `raster-dem` spec, so a caller cannot half-copy it */
  function spec(over) { return Object.assign({ type: 'raster-dem', tiles: TILES.slice(), encoding: 'terrarium', tileSize: 256, maxzoom: maxZoom() }, over || {}); }

  const API = { TILES, isPhoneGPU, maxZoom, spec };
  /* published because js/compare.js and js/cesium-engine.js reach it through the window rather than
     through a parameter — they are built by other factories entirely. */
  try { window.IntMapDem = API; window.__imDemMaxZoom = maxZoom; } catch (_) { }
  return API;
}
