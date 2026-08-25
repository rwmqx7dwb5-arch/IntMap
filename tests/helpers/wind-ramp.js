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

/* ══ ⚠⚠⚠ (#R458) …AND WHETHER THE PAIR OF POINTS CAN CARRY THE CROSS-COMPARISON AT ALL ═════════
   The two verdicts above are each about ONE pixel and its own footprint, and they are always
   well-posed. The cyclone smoke then makes a THIRD claim, across the pair — 「the eyewall pixel
   reads as faster than anything the model has under the eye, and the eye's as calmer than anything
   under the eyewall」 — and that one is not always a claim about the picture.

   The footprints are intervals of speed. `speedInFootprint` says each pixel's colour stands for
   SOME speed inside its own interval, and the renderer is free to choose which: a perfectly correct
   render may paint the eye at the TOP of its footprint. So when the two intervals OVERLAP —
   eye.foot[1] >= ring.foot[0] — a correct picture can fail the cross-claim, and no threshold can
   repair that, because the two halves of the claim then contradict each other by construction:
       ring pixel > eye.foot[1]  AND  eye pixel < ring.foot[0]  with  ring.foot[0] <= eye.foot[1]
   MEASURED, the post-deploy smoke of run 32818517323 (#R455's deploy), four attempts running:
       eye pixel reads 15.5 m/s   ring.foot = [15.045, 36.9]   eye.foot[1] >= 15.5
   — the eye's own footprint reached ABOVE the bottom of the eyewall's, because the global maximum
   sits on the inner EDGE of the eyewall where ±1.5 px spans the whole wall. The map was right.

   So the pair is CHOSEN rather than assumed: the finder's two points are kept whenever they
   separate, and when they do not, the calmest and the strongest point the same screen offers are
   taken instead — the one whose footprint TOPS OUT lowest, and the one whose footprint BOTTOMS OUT
   highest. Nothing here is tuned: the ranking key is the footprint bound the claim itself names,
   and 「calm」/「strong」 is the finder's own 0.6 × peak line. If even that pair overlaps, the hour
   cannot carry the claim and says so — see `why`. */
export function separablePair(calm, strong) {
  const nCalm = Array.isArray(calm) ? calm.length : 0;
  const nStrong = Array.isArray(strong) ? strong.length : 0;
  const considered = { calm: nCalm, strong: nStrong };
  if (!nCalm || !nStrong) {
    return { eye: null, ring: null, gap: null, origGap: null, separated: false, repicked: false,
      considered,
      why: 'the screen offered ' + nCalm + ' calm and ' + nStrong + ' strong candidate point(s), so '
        + 'there is no pair to compare — the storm the finder measured is not on this screen' };
  }
  const gapOf = (e, r) => r.foot[0] - e.foot[1];
  const origGap = gapOf(calm[0], strong[0]);
  if (origGap > 0) {
    return { eye: calm[0], ring: strong[0], gap: origGap, origGap, separated: true, repicked: false,
      considered, why: '' };
  }
  /* deterministic argmin / argmax — ties broken by position, so two runs of the same hour agree */
  const pick = (list, key) => list.reduce((best, c) => {
    const a = key(c), b = key(best);
    if (a < b) return c;
    if (a > b) return best;
    return (c.la < best.la || (c.la === best.la && c.lo < best.lo)) ? c : best;
  });
  const eye = pick(calm, (c) => c.foot[1]);
  const ring = pick(strong, (c) => -c.foot[0]);
  const gap = gapOf(eye, ring);
  return {
    eye, ring, gap, origGap, separated: gap > 0, repicked: true, considered,
    why: gap > 0 ? ''
      : 'the calmest pixel this screen offers has the model reaching ' + eye.foot[1].toFixed(2)
        + ' m/s under it, and the strongest has it dropping to ' + ring.foot[0].toFixed(2)
        + ' m/s under that one, so the two footprints overlap by ' + (-gap).toFixed(2) + ' m/s. '
        + 'A correct render may paint either pixel anywhere inside its own footprint, so at this '
        + 'hour NO pair of points on this screen can show one to be calmer than everything under '
        + 'the other. This is a fact about the geometry of the storm, not about the picture: the two '
        + 'single-pixel verdicts above still stand, and only the comparison ACROSS the pair is '
        + 'withheld. ' + nCalm + ' calm and ' + nStrong + ' strong candidates were ranked.',
  };
}
