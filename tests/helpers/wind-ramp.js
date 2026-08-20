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

/* The band of colour the table spans over a range of speeds — the per-channel envelope of every
   entry that [lo, hi] can paint. When the air under a pixel is uniform this collapses to ONE entry
   and the question below becomes exact equality again. */
export function bandFor(ramp, lo, hi) {
  const i0 = entryIndexFor(ramp, lo), i1 = entryIndexFor(ramp, hi);
  const min = [255, 255, 255], max = [0, 0, 0];
  for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) {
    const q = ramp.colors[i];
    for (let c = 0; c < 3; c++) { if (q[c] < min[c]) min[c] = q[c]; if (q[c] > max[c]) max[c] = q[c]; }
  }
  return { min, max, entries: Math.abs(i1 - i0) + 1 };
}

/* ══ THE VERDICT ══════════════════════════════════════════════════════════════════════════════
   Two claims, and NEITHER carries a tuned number — every bound below is read off the field and the
   table themselves, which is the point: 「anything looser passes while half the planet is grey」 was
   an objection to a TOLERANCE, and there is none here.

     inRange          — every channel of the pixel lies inside the envelope of colours the table
                        spans over the speeds the field really takes under that pixel. This is what
                        says nothing was multiplied over the raster: #R276's 0.36× grey leaves the
                        envelope on the FIRST channel, and so does an attenuation of only 10 %.
     speedInFootprint — and the speed the pixel's own colour stands for is one of those speeds. This
                        is what says it is THIS field, here, now, rather than a plausible colour.

   ⚠ WHY THE FIRST CLAIM IS AN ENVELOPE AND NOT 「the pixel IS a table entry」. That stronger form was
   tried and it is FALSE BY CONSTRUCTION for a correct render. The seventeen anchors are corners: the
   ramp is linear in sRGB BETWEEN them and turns AT them, so when the patch under one pixel straddles
   an anchor, MapLibre's `raster-resampling: linear` blends two colours from either side of a corner
   and the result is a chord — beside the curve, not on it. MEASURED in production the moment it was
   deployed: pixel [44,168,123] against a nearest entry of [44,168,122] at 6.9 m/s, distance 1.0,
   over a footprint of 6.69…8.69 m/s — which crosses the 7 m/s anchor. The first measurement had 78
   of 81 pixels exactly on the table only because that hour's air was flat enough to stay inside one
   segment; it is not a property of the renderer.

   ⚠ WHY THE SECOND CLAIM IS A RANGE AND NOT THE POINT VALUE. `valueNow()` interpolates the grid at a
   mathematical POINT; the pixel is painted from raster texels and answers for the patch it covers.
   Under seventeen flat bands (before #R284) both readings fell in the same band and produced the
   same colour; at 0.1 m/s they are one to eight steps apart, and demanding equality with the point
   value became a coin flip — MEASURED, 20 of 78 painted pixels (26 %). The ambiguity is SPATIAL, so
   it is settled in space rather than by loosening the colour. */
export function readPixel(ramp, px, lo, hi) {
  const band = bandFor(ramp, lo, hi);
  const inRange = [0, 1, 2].every((c) => px[c] >= band.min[c] && px[c] <= band.max[c]);
  const near = nearestEntry(ramp, px);
  const bp = ramp.breakpoints;
  /* the entry the pixel reads as owns [bp[i], bp[i+1]); it is a speed the field takes iff that
     interval meets the footprint */
  const top = near.i + 1 < bp.length ? bp[near.i + 1] : Infinity;
  const speedInFootprint = near.i >= 0 && near.v <= hi && top > lo;
  return {
    inRange, speedInFootprint,
    onTable: indicesPainted(ramp, px).length > 0,   /* reported, not required — see above */
    band, nearest: near, footprint: [lo, hi],
  };
}

/** One line a human can read out of a verdict. */
export function explain(px, v) {
  const n = v.nearest, b = v.band;
  return 'pixel ' + JSON.stringify(px)
    + ' reads as ' + JSON.stringify(n.colour) + ' = ' + n.v + ' m/s (distance ' + n.distance.toFixed(1) + ')'
    + '; the field under it runs ' + v.footprint[0].toFixed(2) + '…' + v.footprint[1].toFixed(2)
    + ' m/s, which the table paints between ' + JSON.stringify(b.min) + ' and ' + JSON.stringify(b.max)
    + ' (' + b.entries + ' entries)';
}
