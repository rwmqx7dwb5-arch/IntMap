/* ============================================================================
 *  IntMap · HOW DIFFERENT TWO COLOURS LOOK, IN THE UNIT THE EYE IS MEASURED IN  (#R487)
 * ----------------------------------------------------------------------------
 *  tests/prod-smoke.spec.js ends its cyclone verdict with a claim about a READER — 「the eye and
 *  its wall are visibly different colours」 — and until #R487 it asked that of the squared Euclidean
 *  distance between two sRGB triples. sRGB is a storage encoding, not a perceptual space, so that
 *  number does not order 「how different these look」 at all. MEASURED on the shipped wind table
 *  (js/wx-ecmwf.js `WIND_ANCHORS`, resampled to 1,041 entries):
 *
 *      4.7 m/s [77,143,131] vs 27.6 m/s [76,117,145]   RGB distance 29.5  →  ΔE00 20.56
 *      9.0 m/s [53,160,53]  vs  9.6 m/s [83,162,54]    RGB distance 30.1  →  ΔE00  3.17
 *
 *  — two pairs the old instrument ranks in ONE order and the eye in the OPPOSITE one, by a factor
 *  of six and a half. The bound sat at 30 (900 squared), so it called the first pair 「the same
 *  colour」 and the second 「far apart」. That is the SAME defect twice already recorded one layer
 *  up: #R276 追記 (「red − blue is not monotone along this ramp」) and #R382 (「distance-to-an-entry
 *  does not order speeds」). A derived quantity written beside a colour instead of read out of the
 *  observer is #R270's 「凡例が自分の色と矛盾していた」 in a third costume.
 *
 *  ⚠ WHAT WENT RED IN PRODUCTION, and why nothing about the map was wrong. Run 33096001326, twice:
 *      eye [75,145,155] (2.15…7.20 m/s)   eyewall [76,117,145] (26.20…27.86 m/s)
 *      RGB distance 29.75 → 885 < 900, red.        ΔE00 14.22 — seven times over the bound below.
 *  The eye was there, 19 m/s of separation was there, and every other assertion in that test was
 *  green. Only the ruler was wrong.
 *
 *  ⚠ SO THE NUMBER COMES FROM THE OBSERVER, NOT FROM THE TABLE. A bound read off the ramp — say
 *  「further apart than the ramp's own finest step」 — is tempting because it writes no constant
 *  down, and it is WRONG: it collapses with the very thing it is meant to catch. Flatten the ramp
 *  towards grey and the step goes to zero with it, so a completely unreadable map would clear its
 *  own bound. The reader's eye is not a property of the palette, so the threshold cannot be either.
 * ==========================================================================*/

/* ── sRGB → CIELAB (D65, the white point sRGB is defined against) ─────────────────────────────*/
function linear(u) {
  const c = u / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** A plain [r,g,b] byte triple as CIELAB. */
export function labFromRgb(rgb) {
  const r = linear(rgb[0]), g = linear(rgb[1]), b = linear(rgb[2]);
  /* sRGB primaries → CIE XYZ, then normalised by D65 */
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const Y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / 1.00000;
  const Z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/* ── CIEDE2000 ────────────────────────────────────────────────────────────────────────────────
   CIE 142-2001, in the arrangement of Sharma, Wu & Dalal (2005), whose paper ships 34 reference
   pairs precisely because the three easy places to get this wrong — the a* rescaling by G, the
   MEAN hue when the two hues straddle 0°, and the sign of the rotation term Rt — all produce a
   function that looks right on ordinary colours and is wrong on the ones that matter.
   ⚠ tests/r487-checks.test.mjs puts this through that published data. A hand-written colour
   difference nobody has checked against the standard is an invented quantity, which is the very
   thing this file exists to stop. */
const rad = Math.PI / 180;

/** ΔE00 between two CIELAB triples. */
export function deltaE00Lab(lab1, lab2) {
  const [L1, a1, b1] = lab1, [L2, a2, b2] = lab2;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hue = (a, b) => {
    if (a === 0 && b === 0) return 0;
    const h = Math.atan2(b, a) / rad;
    return h < 0 ? h + 360 : h;
  };
  const hp1 = hue(ap1, b1), hp2 = hue(ap2, b2);

  const dL = L2 - L1, dC = Cp2 - Cp1;
  let dh = 0;
  if (Cp1 * Cp2 !== 0) {
    dh = hp2 - hp1;
    if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh / 2) * rad);

  const Lbar = (L1 + L2) / 2, Cpbar = (Cp1 + Cp2) / 2;
  let hbar;
  if (Cp1 * Cp2 === 0) hbar = hp1 + hp2;                 /* one of them is neutral: no hue to mean */
  else if (Math.abs(hp1 - hp2) <= 180) hbar = (hp1 + hp2) / 2;
  else hbar = hp1 + hp2 < 360 ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2 - 360) / 2;

  const T = 1
    - 0.17 * Math.cos((hbar - 30) * rad)
    + 0.24 * Math.cos((2 * hbar) * rad)
    + 0.32 * Math.cos((3 * hbar + 6) * rad)
    - 0.20 * Math.cos((4 * hbar - 63) * rad);
  const dTheta = 30 * Math.exp(-Math.pow((hbar - 275) / 25, 2));
  const Cpbar7 = Math.pow(Cpbar, 7);
  const Rc = 2 * Math.sqrt(Cpbar7 / (Cpbar7 + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lbar - 50, 2)) / Math.sqrt(20 + Math.pow(Lbar - 50, 2));
  const Sc = 1 + 0.045 * Cpbar;
  const Sh = 1 + 0.015 * Cpbar * T;
  const Rt = -Math.sin((2 * dTheta) * rad) * Rc;

  return Math.sqrt(
    Math.pow(dL / Sl, 2) + Math.pow(dC / Sc, 2) + Math.pow(dH / Sh, 2)
    + Rt * (dC / Sc) * (dH / Sh));
}

/** ΔE00 between two sRGB byte triples — the form the tests read pixels in. */
export function deltaE00(rgb1, rgb2) {
  return deltaE00Lab(labFromRgb(rgb1), labFromRgb(rgb2));
}

/* ══ THE THRESHOLD, AND WHERE IT COMES FROM ═══════════════════════════════════════════════════
   CIEDE2000 is scaled so that **1.0 is one just-noticeable difference** — that is what the formula
   was fitted to do, and it is the reason the unit is worth changing to. The bands everyone quotes
   from it follow directly:

       ΔE00 < 1     not perceptible
       1 … 2        perceptible on close observation
       > 2          perceptible AT A GLANCE

   A map reader glances, so the claim 「you can see the eye」 is the third band and the bound is its
   floor. ⚠ IT IS NOT FITTED TO THE HOUR THAT WENT RED: that hour measures 14.22, seven times this,
   and the weakest pair the OLD bound ever passed measures 3.17 — both clear it without it being
   moved for either. What the bound rejects is the picture where the two really do collapse to one
   colour, which is the only thing the sentence was ever asserting. */
export const VISIBLE_AT_A_GLANCE = 2;
