// @ts-check
/* ============================================================================
 *  IntMap · ONE TERRARIUM TILE, AS METRES  (speed-overhaul)
 * ----------------------------------------------------------------------------
 *  The DEM tile store (js/map-readout.js) decoded each 256×256 terrarium tile into a Float32Array
 *  of metres on the page's thread; it now does so in src/dem-worker.js when a worker is available
 *  and here on the page when one is not. This file is the ONE decode both of them run, so the two
 *  threads cannot disagree about a single pixel. No DOM, no window, no imports: a worker, the page
 *  and the node tests evaluate the same function.
 *
 *  terrarium encodes height as R·256 + G + B/256 − 32768 metres; a Float32 holds every value the
 *  encoding can express exactly (24-bit mantissa ≥ the format's 1/256 m step over ±32,768 m), so
 *  this is a storage change and never a resampling (#R223).
 * ==========================================================================*/

/* ⚠ THE GUARD IS PHYSICAL, NOT A MAGIC NUMBER (#R265). The deepest point on Earth is the Challenger
   Deep at −10,935 m and terrarium's own bathymetry bottoms out just above it, so nothing this dataset
   can legitimately say is under −12,000 m. A reading below that — RGB(0,0,0) is −32,768 m, the
   dataset's void — is not ground. Expires if the dataset ever encodes a deeper real surface. */
const DEM_NODATA_BELOW = -12000;

/** rgba (256×256×4 bytes) → { el: Float32Array(65536) of metres, NaN where there is no data; voids }.
 *  An untouched pixel of a cleared canvas is (0,0,0,0) and a void terrarium pixel is (0,0,0,255); both
 *  decode to −32,768 and both are «no data», not «32.8 km down». */
export function decodeTerrarium(d) {
  const out = new Float32Array(65536);
  let voids = 0;
  for (let i = 0, o = 0; i < 65536; i++, o += 4) {
    const v = (d[o] * 256 + d[o + 1] + d[o + 2] / 256) - 32768;
    if (d[o + 3] === 0 || !(v > DEM_NODATA_BELOW)) { out[i] = NaN; voids++; } else out[i] = v;
  }
  return { el: out, voids };
}
