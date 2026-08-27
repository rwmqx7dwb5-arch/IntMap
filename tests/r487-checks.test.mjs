/* ============================================================================
 *  #R487 · A CLAIM ABOUT A READER, ASKED OF A NUMBER THAT IS NOT ABOUT READERS
 * ----------------------------------------------------------------------------
 *  tests/prod-smoke.spec.js has ended its cyclone verdict with 「the eye and its wall are visibly
 *  different colours」 since #R276. It is the one line in that test that is about a PERSON rather
 *  than about the field, and until this round it was put to the squared Euclidean distance between
 *  two sRGB triples, with the bound at 30 units (900 squared).
 *
 *  sRGB is a storage encoding. Distance in it does not order 「how different these look」, and on
 *  the shipped wind table it gets the order backwards by a factor of six and a half — ③ below
 *  re-measures that from js/wx-ecmwf.js rather than repeating it from here.
 *
 *  ⚠ WHAT IT COST. Run 33096001326, twice, on a deploy where every other assertion in that test
 *  was green:
 *      eye     [75,145,155]   the model runs  2.15 …  7.20 m/s under it
 *      eyewall [76,117,145]   the model runs 26.20 … 27.86 m/s under it   — 19.00 m/s apart
 *      RGB distance 29.75  →  885 < 900, red.        ΔE00 14.22  →  plainly visible.
 *  The eye was on the screen, in the right colour, with the right speeds under it. The ruler was
 *  the only thing that was wrong. This is the SAME defect the same test has now recorded three
 *  times: #R276 追記 (「red − blue is not monotone along this ramp」), #R382 (「distance-to-an-entry
 *  does not order speeds」), and this. Each time the answer was to stop inventing the quantity and
 *  read it out of the thing the claim is about — the field, in those two, and the observer, here.
 *
 *  ⚠ AND THE THRESHOLD IS NOT READ OFF THE RAMP — ⑤ shows why the tempting 「no constant」 form of
 *  this test is worthless.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deltaE00, deltaE00Lab, labFromRgb, VISIBLE_AT_A_GLANCE } from './helpers/colour-difference.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

/* the incident, as data */
const EYE_PX = [75, 145, 155];
const RING_PX = [76, 117, 145];
const EYE_FOOT = [2.15, 7.20];
const RING_FOOT = [26.20, 27.86];
const OLD_BOUND = 900;                       /* squared RGB distance, the bound that went red */
const rgbD2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/* ── the shipped wind table, re-derived from the source the tiles are painted from ────────────
   Same extraction #R284/#R293 use, so nothing about the ramp is written down twice here. */
function shippedRamp() {
  const src = read('js/wx-ecmwf.js');
  const a = src.indexOf('var WIND_ANCHORS'), b = src.indexOf('var WINDY_WIND');
  assert.ok(a > 0 && b > a, 'the wind anchors are still declared on their own');
  const block = src.slice(a, b);
  const bp = JSON.parse(block.match(/breakpoints:\s*(\[[^\]]*\])/)[1]);
  const cols = [...block.matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*1\s*\]/g)]
    .map((m) => [+m[1], +m[2], +m[3]]);
  assert.equal(bp.length, cols.length, 'one colour per anchor');
  /* js/wx-ecmwf.js `rampFrom(WIND_ANCHORS, 0.1)`, restated */
  const lo = bp[0], hi = bp[bp.length - 1], n = Math.round((hi - lo) / 0.1);
  const breakpoints = [], colors = [];
  let seg = 0;
  for (let k = 0; k <= n; k++) {
    const v = lo + k * 0.1;
    while (seg < bp.length - 2 && v >= bp[seg + 1]) seg++;
    const span = (bp[seg + 1] - bp[seg]) || 1;
    let f = (v - bp[seg]) / span; if (f < 0) f = 0; if (f > 1) f = 1;
    const c0 = cols[seg], c1 = cols[Math.min(seg + 1, cols.length - 1)];
    breakpoints.push(Math.round(v * 1000) / 1000);
    colors.push([0, 1, 2].map((i) => Math.round(c0[i] + (c1[i] - c0[i]) * f)));
  }
  return { breakpoints, colors };
}
const entryAt = (ramp, v) => {
  let i = 0;
  while (i + 1 < ramp.breakpoints.length && ramp.breakpoints[i + 1] <= v) i++;
  return ramp.colors[i];
};
const maxAdjacent = (colors) => {
  let worst = 0;
  for (let i = 0; i + 1 < colors.length; i++) {
    const e = deltaE00(colors[i], colors[i + 1]);
    if (e > worst) worst = e;
  }
  return worst;
};

/* ── ① the formula is the standard's, checked against the standard's own data ─────────────────
   CIE 142-2001 as arranged by Sharma, Wu & Dalal (2005), whose paper ships these reference pairs
   because the three easy mistakes — the a* rescaling by G, the MEAN hue across the 0° wrap, and
   the sign of the rotation term — all yield a function that looks correct on ordinary colours and
   is wrong on the ones that decide a test. A hand-written ΔE00 nobody has put through this data is
   another invented quantity, which is the very thing this round exists to remove. */
const SHARMA = [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  [[50, 2.8361, -74.0200], [50, 0, -82.7485], 3.4412],
  [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0000],
  [[50, -1.1848, -84.8006], [50, 0, -82.7485], 1.0000],
  [[50, -0.9009, -85.5211], [50, 0, -82.7485], 1.0000],
  [[50, 0, 0], [50, -1, 2], 2.3669],
  [[50, -1, 2], [50, 0, 0], 2.3669],
  [[50, 2.4900, -0.0010], [50, -2.4900, 0.0009], 7.1792],
  [[50, 2.4900, -0.0010], [50, -2.4900, 0.0011], 7.2195],
  [[50, -0.0010, 2.4900], [50, 0.0009, -2.4900], 4.8045],
  [[50, -0.0010, 2.4900], [50, 0.0011, -2.4900], 4.7461],
  [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
  [[50, 2.5, 0], [73, 25, -18], 27.1492],
  [[50, 2.5, 0], [61, -5, 29], 22.8977],
  [[50, 2.5, 0], [56, -27, -3], 31.9030],
  [[50, 2.5, 0], [58, 24, 15], 19.4535],
  [[50, 2.5, 0], [50, 3.1736, 0.5854], 1.0000],
  [[50, 2.5, 0], [50, 3.2972, 0], 1.0000],
  [[50, 2.5, 0], [50, 1.8634, 0.5757], 1.0000],
  [[50, 2.5, 0], [50, 3.2592, 0.3350], 1.0000],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.2630],
  [[61.2901, 3.7196, -5.3901], [61.4292, 2.2480, -4.9620], 1.8731],
  [[35.0831, -44.1164, 3.7933], [35.0232, -40.0716, 1.5901], 1.8645],
  [[22.7233, 20.0904, -46.6940], [23.0331, 14.9730, -42.5619], 2.0373],
  [[36.4612, 47.8580, 18.3852], [36.2715, 50.5065, 21.2231], 1.4146],
  [[90.8027, -2.0831, 1.4410], [91.1528, -1.6435, 0.0447], 1.4441],
  [[90.9257, -0.5406, -0.9208], [88.6381, -0.8985, -0.7239], 1.5381],
  [[6.7747, -0.2908, -2.4247], [5.8714, -0.0985, -2.2286], 0.6377],
  [[2.0776, 0.0795, -1.1350], [0.9033, -0.0636, -0.5514], 0.9082],
];

test('#R487 ① ΔE00 reproduces the published CIEDE2000 reference pairs', () => {
  for (const [lab1, lab2, want] of SHARMA) {
    const got = deltaE00Lab(lab1, lab2);
    assert.ok(Math.abs(got - want) < 1e-4,
      JSON.stringify(lab1) + ' vs ' + JSON.stringify(lab2)
      + ': want ' + want.toFixed(4) + ', got ' + got.toFixed(4));
  }
  /* the pairs that break a careless implementation are in there, and this says so out loud:
     one hue on either side of 0°, and a pair of near-neutrals where Cp1*Cp2 is zero */
  assert.equal(SHARMA.filter(([a, b]) => a[1] * b[1] < 0).length > 0, true, 'hues that straddle 0°');
  assert.ok(SHARMA.some(([a]) => a[1] === 0 && a[2] === 0), 'and a neutral, which has no hue at all');

  /* …and the sRGB→Lab leg, against the two colours everyone knows the answer for */
  const white = labFromRgb([255, 255, 255]), black = labFromRgb([0, 0, 0]);
  /* ⚠ 1e-4, not equality: the sRGB→XYZ matrix is published to seven digits, so its D65 white
     lands a ten-thousandth off the illuminant. Demanding exactness here would be a claim about the
     rounding of a published constant rather than about the transform. */
  assert.ok(Math.abs(white[0] - 100) < 1e-4 && Math.abs(white[1]) < 1e-4 && Math.abs(white[2]) < 1e-4,
    'sRGB white is L*=100 with no chroma — got ' + JSON.stringify(white.map((x) => +x.toFixed(6))));
  assert.deepEqual(black.map((x) => +x.toFixed(6)), [0, 0, 0], 'and sRGB black is the origin');
  assert.equal(deltaE00([12, 34, 56], [12, 34, 56]), 0, 'a colour is not different from itself');
  assert.equal(deltaE00(EYE_PX, RING_PX), deltaE00(RING_PX, EYE_PX), 'and the order does not matter');
});

/* ── ② the hour that went red, in both units ──────────────────────────────────────────────────*/
test('#R487 ② the production failure was the ruler, not the picture', () => {
  assert.ok(RING_FOOT[0] - EYE_FOOT[1] > 15,
    'the two points really were far apart in the field — '
    + (RING_FOOT[0] - EYE_FOOT[1]).toFixed(2) + ' m/s of clear water between the footprints');

  const d2 = rgbD2(EYE_PX, RING_PX);
  assert.equal(d2, 885, 'the squared RGB distance the deploy printed');
  assert.ok(d2 < OLD_BOUND, 'which is what the old bound rejected the picture on');

  const dE = deltaE00(EYE_PX, RING_PX);
  assert.ok(Math.abs(dE - 14.22) < 0.01, 'and the same pair is ΔE00 ' + dE.toFixed(2));
  assert.ok(dE > VISIBLE_AT_A_GLANCE,
    'which is ' + (dE / VISIBLE_AT_A_GLANCE).toFixed(1) + ' times the bound that replaces it — so '
    + 'the bound is not one that was fitted to let this hour through');

  /* and the two pixels are the colours the shipped table paints for their own footprints, which
     is what makes this a real hour rather than a pair of numbers chosen to make a point */
  const ramp = shippedRamp();
  for (const [px, foot, name] of [[EYE_PX, EYE_FOOT, 'eye'], [RING_PX, RING_FOOT, 'eyewall']]) {
    const lo = entryAt(ramp, foot[0]), hi = entryAt(ramp, foot[1]);
    const within = [0, 1, 2].every((c) =>
      px[c] >= Math.min(lo[c], hi[c]) - 8 && px[c] <= Math.max(lo[c], hi[c]) + 8);
    assert.ok(within, 'the ' + name + ' pixel ' + JSON.stringify(px) + ' is the colour this table '
      + 'paints between ' + JSON.stringify(lo) + ' and ' + JSON.stringify(hi));
  }
});

/* ── ③ on the shipped table the two instruments disagree about which pair looks more alike ────
   Re-measured here from js/wx-ecmwf.js over all 1,041 × 1,040 / 2 pairs, so the counter-examples
   move if the table moves rather than being frozen prose. */
test('#R487 ③ squared RGB distance does not order how different two colours look', () => {
  const ramp = shippedRamp();
  const n = ramp.colors.length;
  assert.equal(n, 1041, 'the resampled table (#R284/#R293)');
  const labs = ramp.colors.map(labFromRgb);

  let worstCalledSame = null, mildestCalledFar = null;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d2 = rgbD2(ramp.colors[i], ramp.colors[j]);
      const e = deltaE00Lab(labs[i], labs[j]);
      if (d2 < OLD_BOUND) {
        if (!worstCalledSame || e > worstCalledSame.e) worstCalledSame = { i, j, d2, e };
      } else if (!mildestCalledFar || e < mildestCalledFar.e) mildestCalledFar = { i, j, d2, e };
    }
  }
  const show = (x) => ramp.breakpoints[x.i] + ' m/s ' + JSON.stringify(ramp.colors[x.i]) + ' vs '
    + ramp.breakpoints[x.j] + ' m/s ' + JSON.stringify(ramp.colors[x.j])
    + ' — RGB ' + Math.sqrt(x.d2).toFixed(1) + ', ΔE00 ' + x.e.toFixed(2);

  assert.ok(worstCalledSame.e > mildestCalledFar.e * 2,
    'the pair the old bound calls 「the same colour」 is more than twice as different, to a reader, '
    + 'as the pair it calls 「far apart」:\n      same: ' + show(worstCalledSame)
    + '\n      far:  ' + show(mildestCalledFar));
  /* the values that argument was written from, so a change in the table is visible as a change
     here rather than silently weakening the sentence above */
  assert.ok(worstCalledSame.e > 20 && mildestCalledFar.e < 4,
    'measured on the shipped table: ' + worstCalledSame.e.toFixed(2) + ' vs '
    + mildestCalledFar.e.toFixed(2));
  /* …and the pair that went red in production is an ordinary member of the first group */
  assert.ok(rgbD2(EYE_PX, RING_PX) < OLD_BOUND && deltaE00(EYE_PX, RING_PX) > mildestCalledFar.e,
    'the hour that failed is one of them');
});

/* ── ④ the claim still refuses the pictures it exists to refuse ───────────────────────────────
   ⚠ THE POINT OF ②/③ IS NOT THAT EVERYTHING PASSES. Changing the unit a claim is stated in is only
   honest if the claim still fails what it was written to fail. */
test('#R487 ④ a map that does not show the eye is still refused', () => {
  const ramp = shippedRamp();
  /* the eye painted with its wall's colour — the picture the sentence is about */
  assert.ok(!(deltaE00(RING_PX, RING_PX) > VISIBLE_AT_A_GLANCE), 'one colour for both is refused');
  /* a raster with no structure left in it at all */
  const flat = [128, 128, 128];
  assert.ok(!(deltaE00(flat, flat) > VISIBLE_AT_A_GLANCE), 'and so is a flat grey field');
  /* the eye a single 0.1 m/s step away from its wall — a legal colour, an illegible map */
  const near = entryAt(ramp, RING_FOOT[0]), next = entryAt(ramp, RING_FOOT[0] + 0.1);
  assert.ok(!(deltaE00(near, next) > VISIBLE_AT_A_GLANCE),
    'and two neighbouring speeds are not 「a calm eye inside a ring of strong wind」 — ΔE00 '
    + deltaE00(near, next).toFixed(2));
  /* #R276's original defect, for completeness: the night shading multiplied over the raster does
     move the colour, and it is #R287's `inRange` that refuses it — this claim is not that claim */
  const dimmed = RING_PX.map((v) => Math.round(v * 0.36));
  assert.ok(deltaE00(RING_PX, dimmed) > VISIBLE_AT_A_GLANCE,
    'a 0.36x dimmed pixel is a different colour, which is why ① of the deployed test catches it '
    + 'and this one is not asked to');
});

/* ── ⑤ why the bound is a constant, and not read off the table ────────────────────────────────
   ⚠ THE TEMPTING VERSION OF THIS TEST WRITES NO NUMBER DOWN: 「the eye and its wall are further
   apart than the table's own finest step」. It is read off the very object it judges, and that is
   exactly what is wrong with it — reduce the ramp's contrast and the step shrinks with it, so the
   bound follows the defect down and an unreadable map clears it. The observer does not shrink. */
test('#R487 ⑤ a bound read off the ramp collapses with the ramp; the observer\'s does not', () => {
  const ramp = shippedRamp();
  const shippedStep = maxAdjacent(ramp.colors);
  assert.ok(shippedStep > 0, 'the shipped table has a finest step of ΔE00 ' + shippedStep.toFixed(2));

  /* the same table with its contrast pulled down to 15 % about its own first colour: every speed
     from 0 to 104 m/s is now one shade of blue */
  const base = ramp.colors[0];
  const washed = ramp.colors.map((c) => [0, 1, 2].map((i) => Math.round(base[i] + (c[i] - base[i]) * 0.15)));
  const washedStep = maxAdjacent(washed);
  const eye = washed[ramp.breakpoints.indexOf(4.7)];
  const wall = washed[ramp.breakpoints.indexOf(27.6)];
  const seen = deltaE00(eye, wall);

  assert.ok(washedStep < shippedStep, 'the derived bound shrank with the table — '
    + shippedStep.toFixed(2) + ' → ' + washedStep.toFixed(2));
  assert.ok(seen > washedStep,
    'and on that unreadable map the eye/wall difference (ΔE00 ' + seen.toFixed(2) + ') still clears '
    + 'it (' + washedStep.toFixed(2) + ') — the derived bound would pass this picture');
  assert.ok(!(seen > VISIBLE_AT_A_GLANCE),
    'while the observer\'s bound refuses it: ' + JSON.stringify(eye) + ' vs ' + JSON.stringify(wall)
    + ' is ΔE00 ' + seen.toFixed(2));
  /* and the constant is one number, declared once, rather than a literal at each call site */
  const helper = read('tests/helpers/colour-difference.js');
  assert.match(helper, /export const VISIBLE_AT_A_GLANCE = 2;/, 'declared in one place');
  assert.equal(VISIBLE_AT_A_GLANCE, 2, 'and that is the value the tests import');
});

/* ── ⑥ every place that made this claim now makes it in ΔE00 ──────────────────────────────────
   ⚠ THERE WERE TWO COPIES OF IT AND A GATE PINNING THE SPELLING OF THE FIRST. Fixing one would
   have left the deployed test asking the right question while its own node twin asked the old one,
   which is #R429's shape (「一ファイルに向けた検査はそのファイルだけを守る」). */
test('#R487 ⑥ the deployed test and its node twin both ask it in the perceptual unit', () => {
  const prod = read('tests/prod-smoke.spec.js');
  assert.match(prod, /import \{ deltaE00, VISIBLE_AT_A_GLANCE \} from '\.\/helpers\/colour-difference\.js';/,
    'the deployed smoke reads the perceptual difference from the shared helper');
  assert.match(prod, /const dE = deltaE00\(eyePx, ringPx\);/, 'and takes it of the pair it chose');
  assert.match(prod, /\.toBeGreaterThan\(VISIBLE_AT_A_GLANCE\);/, 'and asserts against the constant');
  assert.ok(!/toBeGreaterThan\(900\)/.test(prod), 'the squared-RGB bound is gone');
  assert.ok(!/const d2 = \(a, b\) =>/.test(prod), 'and so is the metric it was taken with');

  const r382 = read('tests/r382-checks.test.mjs');
  assert.match(r382, /deltaE00\(SETTLED, EYE_PX\) > VISIBLE_AT_A_GLANCE/,
    'the second copy of the claim asks the same question');
  assert.ok(!/d2\(SETTLED, EYE_PX\) > 900/.test(r382), 'and no longer the old one');
  /* ⚠ r382 keeps `d2` on purpose — ③ there uses it to PROVE that RGB distance inverts speed
     order, which is an argument about the metric rather than a claim made with it. */
  assert.match(r382, /d2\(ramp\.colors\[i\], cRing\) > d2\(ramp\.colors\[i\], cEye\)/,
    'while the place that uses RGB distance as the thing being refuted still does');

  const r458 = read('tests/r458-checks.test.mjs');
  assert.match(r458, /toBeGreaterThan\\\(VISIBLE_AT_A_GLANCE\\\)/,
    'and the gate that pins the deployed spelling follows it instead of freezing it');
});
