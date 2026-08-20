/* ============================================================================
 *  IntMap · READING A PAINTED PIXEL BACK THROUGH THE WIND COLOUR TABLE  (#R287)
 * ----------------------------------------------------------------------------
 *  Pure functions over a colour scale — no browser, no network. tests/prod-smoke.spec.js gathers
 *  the numbers from the LIVE page and this file decides what they mean, so that
 *  tests/r287-checks.test.mjs can put THE SAME DECISION through the failures it has to catch —
 *  the #R276 one it exists for above all. A verdict that only ever runs inside a browser against
 *  a healthy site is a verdict nobody has watched fail.
 *
 *  A scale here is the SDK's `breakpoint` shape, which is what `IntMapECMWF.scale()` returns and
 *  what the om protocol renders its tiles from:
 *      { breakpoints: [v0, v1, …], colors: [[r,g,b,(a)], …] }
 *  and a value v is painted with the entry at the LAST breakpoint that is <= v — a nearest-bucket
 *  lookup, not an interpolation. Entry i therefore stands for the half-open speed interval
 *  [bp[i], bp[i+1]), and the last entry stands for [bp[n-1], ∞).
 * ==========================================================================*/

/** The table entry a value is painted with — the SDK's own rule, restated. */
export function entryIndexFor(ramp, v) {
  const bp = ramp.breakpoints;
  if (!(v >= bp[0])) return 0;                 /* NaN and everything below the floor */
  if (v >= bp[bp.length - 1]) return bp.length - 1;
  let lo = 0, hi = bp.length - 1;
  while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (bp[mid] <= v) lo = mid; else hi = mid; }
  return lo;
}

/** …and its colour, as a plain RGB triple. */
export function colourFor(ramp, v) {
  return ramp.colors[entryIndexFor(ramp, v)].slice(0, 3);
}

const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/* Every entry whose colour is EXACTLY this pixel.
   ⚠ A LIST, NOT A VALUE. Resampled at 0.1 m/s (#R284) the table holds 601 entries over the same
   seventeen anchors, so wherever the ramp climbs more slowly than one 1/255 step per 0.1 m/s,
   consecutive entries round to the same byte triple and one colour stands for a RANGE of speeds. */
export function indicesPainted(ramp, px) {
  const out = [];
  for (let i = 0; i < ramp.colors.length; i++) if (same(ramp.colors[i], px)) out.push(i);
  return out;
}

/** The speeds those entries stand for — for the failure message. */
export function speedsPainted(ramp, px) {
  return indicesPainted(ramp, px).map((i) => ramp.breakpoints[i]);
}

/** The closest the table can come to a colour, and how far that is in RGB space. */
export function nearestEntry(ramp, px) {
  let best = { i: -1, v: null, colour: null, distance: Infinity };
  for (let i = 0; i < ramp.colors.length; i++) {
    const q = ramp.colors[i];
    const d = Math.sqrt((q[0] - px[0]) ** 2 + (q[1] - px[1]) ** 2 + (q[2] - px[2]) ** 2);
    if (d < best.distance) best = { i, v: ramp.breakpoints[i], colour: q.slice(0, 3), distance: d };
  }
  return best;
}

/* ══ THE VERDICT ══════════════════════════════════════════════════════════════════════════════
   Two independent claims, both EXACT — no colour tolerance anywhere, because a tolerance is what
   would let #R276's grey planet back in (a pixel dimmed to 0.36× lands 128 RGB units from the
   nearest entry, so the first claim refuses it outright):

     onTable        — the pixel IS one of the table's colours, byte for byte. This is what says the
                      raster reached the screen with nothing multiplied over it and nothing blended
                      into it.
     withinFootprint— and the speed that entry stands for is a speed the FIELD REALLY TAKES under
                      that pixel, [lo, hi] being the model's own range over the pixel's footprint.

   ⚠ WHY THE SECOND CLAIM IS A RANGE AND NOT THE POINT VALUE. `valueNow()` interpolates the grid at
   a mathematical POINT; the renderer paints from a raster texel, and MapLibre's
   `raster-resampling: linear` blends the texels around it — so the pixel answers for the patch of
   atmosphere it covers, not for the point at its centre. Under seventeen flat bands (before #R284)
   the difference was invisible: both readings fell inside the same band and produced the same
   colour. At 0.1 m/s it is one to eight visible steps, and asking the pixel to equal the entry for
   the point value became a coin flip — MEASURED against production, 20 of 78 painted pixels (26 %).
   The ambiguity is SPATIAL, so it is settled in space rather than by loosening the colour. */
export function readPixel(ramp, px, lo, hi) {
  const idx = indicesPainted(ramp, px);
  const bp = ramp.breakpoints;
  /* entry i is legitimately painted iff its interval [bp[i], bp[i+1]) meets [lo, hi] */
  const covers = idx.filter((i) => {
    const top = i + 1 < bp.length ? bp[i + 1] : Infinity;
    return bp[i] <= hi && top > lo;
  });
  return {
    onTable: idx.length > 0,
    withinFootprint: covers.length > 0,
    says: idx.map((i) => bp[i]),
    covers: covers.map((i) => bp[i]),
    nearest: nearestEntry(ramp, px),
    footprint: [lo, hi],
  };
}

/** One line a human can read out of a verdict. */
export function explain(px, v) {
  const n = v.nearest;
  return 'pixel ' + JSON.stringify(px)
    + (v.onTable
      ? ' is the table entry for ' + (v.says.length > 1 ? v.says[0] + '…' + v.says[v.says.length - 1] : v.says[0]) + ' m/s'
      : ' is NOT any table entry — nearest is ' + JSON.stringify(n.colour) + ' (' + n.v + ' m/s) at distance '
        + n.distance.toFixed(1))
    + ', and the field under that pixel runs ' + v.footprint[0].toFixed(2) + '…' + v.footprint[1].toFixed(2) + ' m/s';
}
