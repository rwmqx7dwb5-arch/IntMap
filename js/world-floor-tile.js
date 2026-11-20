/* ============================================================================
 *  IntMap · ONE WEB MERCATOR TILE OUT OF THE EQUIRECTANGULAR WORLD PICTURE
 * ----------------------------------------------------------------------------
 *  The whole-earth floor (js/world-base.js) is an equirectangular picture; MapLibre asks for Mercator
 *  tiles. Longitude is LINEAR in Mercator x, so the horizontal mapping is one constant scale and each
 *  output row is one drawImage of the matching source row. Latitude is not linear, so the row index is
 *  recomputed per row — that is the reprojection, done at output resolution.
 *
 *  ⚠ It is 512 drawImage calls per tile, and a pan asks for a screenful of tiles. On the main thread
 *  that was ~1.1 s of a throttled (×6) wheel zoom — the thread that also has to draw the map. So the
 *  SAME function runs in src/sat-worker.js on an OffscreenCanvas (which owns the picture once it is
 *  sent), and js/world-base.js keeps calling it itself only where no worker exists. One drawing
 *  routine, two places that may run it, byte-identical output.
 * ==========================================================================*/
/* Mercator y (0..1 over the whole world) → latitude in degrees. */
const latOf = (my) => Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180 / Math.PI;

/** fill `g` (a 2D context of a TILE×TILE canvas) with tile z/x/y of picture `im` (sw×sh pixels) */
export function drawFloorTile(g, im, sw, sh, z, x, y, TILE) {
  const n = Math.pow(2, z);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
  const sx = (x / n) * sw, sWid = sw / n;
  for (let j = 0; j < TILE; j++) {
    const lat = latOf((y + j / TILE) / n), lat2 = latOf((y + (j + 1) / TILE) / n);
    const sy = (90 - lat) / 180 * sh;
    const sy2 = (90 - lat2) / 180 * sh;
    const hgt = Math.max(0.5, sy2 - sy);
    g.drawImage(im, sx, Math.max(0, Math.min(sh - 0.5, sy)), sWid, Math.min(hgt, sh - sy), 0, j, TILE, 1);
  }
}
