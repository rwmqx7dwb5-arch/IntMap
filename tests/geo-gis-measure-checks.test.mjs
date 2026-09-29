/* ============================================================================
 *  GIS · MEASUREMENT — どの面で測ったか・その誤差・証明書
 * ----------------------------------------------------------------------------
 *  What a length or an area is measured ON (sphere, ellipsoid, a plane), how far that surface is from
 *  the ground, and the certificate that says so: js/gis-crs.js's ground reference and envelopes, the
 *  measure op's tolerance and surfaces, the sphere-vs-ellipsoid distance error, and the surface every
 *  op declares it computes on.
 *
 *  ⚠ ONE BLOCK PER ROUND, AND EACH BLOCK IS ISOLATED. The rounds below used to be files of their own,
 *  each in its own process; `isolate()` (tests/helpers/geo-shared.mjs) gives every block back the
 *  globalThis a fresh process had, so no block reads a `window` another one left behind. Test titles
 *  carry the round that wrote them (#R<N>), and each block keeps that round's own account of WHY.
 * ==========================================================================*/

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installWindow, isolate, read } from './helpers/geo-shared.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R783 · the ground reference and the error envelope   (was tests/r783-crs-precision-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R783 · 「どの面で測ったか」の次に来る問い — どこまで信頼できるのか
 * ----------------------------------------------------------------------------
 *  An outside audit (§4.3) said js/gis-crs.js DECLARES the plane a measurement is made on — #R752
 *  built that — while nothing states how far the number can be off, and that the useful distinction
 *  is not 「everything to survey grade」 but 「概観に使う計算と、細い境界・小面積・長距離で使う計算を
 *  区別できること」. Verified against the code before anything was written:
 *
 *    ① `areaScale` travels with every area, and it is measured against the plane's OWN DATUM. Two of
 *       the four planes are drawn on a SPHERE while the ground is an ellipsoid, so a Mollweide area
 *       came back `exact: true` with an unmeasured 0.4–0.9% under it.
 *    ② A length is the sum of STRAIGHT LINES IN THE PLANE between the vertices as they arrived. No
 *       Tissot number can see that; the error is in the edge rule.
 *    ③ Nothing could say 「この条件では信頼できない」, so every condition answered with a number.
 *
 *  ⚠ THE REFERENCE IN THIS FILE IS WRITTEN OUTSIDE THE MODULE ON PURPOSE
 *  ([[intmap-co-designed-reader-cannot-falsify]]). The area reference is a Gauss-Legendre DOUBLE
 *  quadrature of the ellipsoid's own area element M(φ)·N(φ)·cos φ with nodes found by Newton on the
 *  Legendre polynomial — a different order and a different derivation from the module's five-node
 *  closed forms. The length reference is an equatorial arc (a·Δλ, exact by the definition of the
 *  ellipsoid) and a quadrature of the meridian arc, neither of which is Vincenty. ⚠ AND ① BELOW
 *  MEASURES THAT THE REFERENCE CAN FAIL: the same comparison against a perturbed flattening must
 *  come out red, because a reference that cannot reject anything has not checked anything (#R765).
 *
 *  ⚠ WHAT IS MEASURED IS THE ANSWER, NOT THE PROSE — except in ⑦, where the prose IS the answer: the
 *  three percentages the module's own header quotes are recomputed here from the arithmetic, because
 *  a comment that has drifted from the table below it is the defect of #R764.
 * ==========================================================================*/
describe('§ #R783 · the ground reference and the error envelope', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  async function boot() {
    const w = installWindow();
    const { makeGisCrs } = await import('../js/gis-crs.js');
    const crs = makeGisCrs();
    w.IntMapGisCrs = crs;
    return { w, crs };
  }

  /* ── THE REFERENCE, WRITTEN HERE AND NOT IMPORTED ─────────────────────────────────────────────
     WGS 84's defining constants (NIMA TR8350.2). They are the same two numbers the module holds, and
     they have to be: a reference on a different datum would measure the datum rather than the code. */
  const A = 6378137, F = 1 / 298.257223563;
  const D2R = Math.PI / 180;

  /* Gauss-Legendre nodes and weights of order n, found by Newton's method on P_n — deliberately NOT
     the closed forms the module computes its five nodes from. */
  function legendre(n) {
    const x = [], w = [];
    for (let i = 0; i < n; i++) {
      let t = Math.cos(Math.PI * (i + 0.75) / (n + 0.5));
      let dp = 0;
      for (let k = 0; k < 200; k++) {
        let p0 = 1, p1 = t;
        for (let j = 2; j <= n; j++) { const p2 = ((2 * j - 1) * t * p1 - (j - 1) * p0) / j; p0 = p1; p1 = p2; }
        dp = n * (t * p1 - p0) / (t * t - 1);
        const dt = -p1 / dp;
        t += dt;
        if (Math.abs(dt) < 1e-16) break;
      }
      let p0 = 1, p1 = t;
      for (let j = 2; j <= n; j++) { const p2 = ((2 * j - 1) * t * p1 - (j - 1) * p0) / j; p0 = p1; p1 = p2; }
      dp = n * (t * p1 - p0) / (t * t - 1);
      x.push(t);
      w.push(2 / ((1 - t * t) * dp * dp));
    }
    return { x, w };
  }
  const GL20 = legendre(20);

  function quad(f, a, b, panels) {
    let s = 0;
    const h = (b - a) / panels;
    for (let p = 0; p < panels; p++) {
      const mid = a + h * (p + 0.5), half = h / 2;
      for (let i = 0; i < GL20.x.length; i++) s += GL20.w[i] * f(mid + GL20.x[i] * half) * half;
    }
    return s;
  }

  /* the ellipsoid's own area element and meridional radius, at a stated flattening so that ① can
     perturb it and watch the comparison fail */
  const areaElement = (f) => {
    const e2 = f * (2 - f);
    return (phi) => A * A * (1 - e2) * Math.cos(phi) / Math.pow(1 - e2 * Math.sin(phi) * Math.sin(phi), 2);
  };
  const meridionalRadius = (f) => {
    const e2 = f * (2 - f);
    return (phi) => A * (1 - e2) / Math.pow(1 - e2 * Math.sin(phi) * Math.sin(phi), 1.5);
  };
  /* the area of a graticule quadrangle, by quadrature */
  const refQuadArea = (s, n, dLon, f = F) => quad(areaElement(f), s * D2R, n * D2R, 16) * Math.abs(dLon) * D2R;
  /* the length of a meridian arc, by quadrature */
  const refMeridian = (l1, l2, f = F) => quad(meridionalRadius(f), l1 * D2R, l2 * D2R, 8);

  const boxRing = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
  const poly = (ring) => ({ type: 'Polygon', coordinates: [ring] });
  const line = (a, b) => ({ type: 'LineString', coordinates: [a, b] });

  /* ══ ① 参照そのものが、外から反証できる ══════════════════════════════════════════════════════ */

  test('R783 ① the ground reference agrees with an independently written quadrature — and that quadrature can reject', async () => {
    const { crs } = await boot();
    const declared = crs.surfaces().find((s) => s.isGround);
    assert.ok(declared, 'no ground surface is published');
    const tolArea = declared.accuracy.area.relative, tolLength = declared.accuracy.length.relative;
    assert.ok(tolArea > 0 && tolLength > 0, 'the ground surface declares no relative accuracy');

    /* ⚠ THE CONDITIONS ARE THE AUDIT'S: the equator, mid-latitudes, near the pole, a thin sliver, a
       tiny parcel and the whole world — not one comfortable box. */
    const cases = [
      ['equator 1°×1°', 0, 1, 1],
      ['mid 35–36°N', 35, 36, 1],
      ['high 60–61°N', 60, 61, 1],
      ['polar 88–89°N', 88, 89, 1],
      ['thin 0.001° wide', 35, 36, 0.001],
      ['tall 0–89°N', 0, 89, 1],
      ['the whole world', -90, 90, 360],
    ];
    for (const [what, s, n, dLon] of cases) {
      const got = crs.areaOnGround(poly(boxRing(0, s, dLon, n)), { unit: 'm2' });
      assert.equal(got.ok, true, what + ': areaOnGround refused — ' + got.why);
      const ref = refQuadArea(s, n, dLon);
      const rel = Math.abs(got.value / ref - 1);
      assert.ok(rel <= tolArea, what + ': ground area is ' + rel.toExponential(2)
        + ' from an independent quadrature, and the module declares ' + tolArea);
    }

    /* the published area of WGS 84, which is neither this file's arithmetic nor the module's */
    const world = crs.areaOnGround(poly(boxRing(-180, -90, 180, 90)), { unit: 'km2' }).value;
    assert.ok(Math.abs(world / 510065621.72 - 1) < 1e-8,
      'the ellipsoid does not close on its own published area: ' + world.toFixed(2) + ' km²');

    /* ⚠ AND THE REFERENCE HAS TEETH. The same comparison against a flattening wrong in its fourth
       digit must be REJECTED — otherwise ① has measured nothing at all. */
    const perturbed = refQuadArea(35, 36, 1, F * 1.001);
    const trueArea = crs.areaOnGround(poly(boxRing(0, 35, 1, 36)), { unit: 'm2' }).value;
    assert.ok(Math.abs(trueArea / perturbed - 1) > tolArea * 100,
      'a 0.1% error in the flattening passes this quadrature — the reference cannot reject anything');

    /* lengths: the equator is exact by definition, the meridian comes from the quadrature */
    for (const dLon of [1, 10, 90, 179]) {
      const g = crs.geodesic(0, 0, dLon, 0);
      assert.ok(g, 'the geodesic along the equator was refused at Δλ=' + dLon);
      const rel = Math.abs(g.m / (A * dLon * D2R) - 1);
      assert.ok(rel <= tolLength, 'equator Δλ=' + dLon + ': ' + rel.toExponential(2) + ' from a·Δλ');
    }
    for (const [l1, l2] of [[0, 1], [0, 45], [0, 90], [35, 36], [60, 61]]) {
      const g = crs.geodesic(0, l1, 0, l2);
      assert.ok(g, 'the geodesic along the meridian was refused at ' + l1 + '→' + l2);
      const rel = Math.abs(g.m / refMeridian(l1, l2) - 1);
      assert.ok(rel <= tolLength, 'meridian ' + l1 + '→' + l2 + ': ' + rel.toExponential(2)
        + ' from an independent quadrature');
    }
    const wrongMeridian = refMeridian(0, 45, F * 1.001);
    assert.ok(Math.abs(crs.geodesic(0, 0, 0, 45).m / wrongMeridian - 1) > tolLength * 100,
      'a 0.1% error in the flattening passes the meridian quadrature too');
  });

  /* ══ ② 面ごとの誤差が、条件ごとに実測されている ═══════════════════════════════════════════════
     ⚠ THE NUMBERS BELOW ARE FACTS ABOUT WGS 84 AND ABOUT THE APP'S OWN RADIUS, not thresholds
     somebody tuned ([[intmap-ceiling-guards-are-not-policies]]): they move only if the datum or
     IntMapGeodesy._R_EARTH_KM moves, and if either moves this test is exactly the reader that should
     notice. They are asserted to four significant figures with the direction stated, because the
     DIRECTION is the finding — the app's sphere OVERSTATES area at the equator and UNDERSTATES it at
     the pole, and it crosses over near 35°N. */

  const near = (got, want, rel, what) => assert.ok(Math.abs(got / want - 1) <= rel,
    what + ': measured ' + got.toPrecision(8) + ', declared ' + want.toPrecision(8));

  test('R783 ② the sphere the app measures on is off the ground by a latitude-dependent amount, and says so', async () => {
    const { crs } = await boot();
    const at = (s, n) => crs.certify('sphere', [0, s, 1, n]);

    const eq = at(0, 1), mid = at(35, 36), high = at(60, 61), pole = at(88, 89);
    for (const [what, c] of [['equator', eq], ['mid', mid], ['high', high], ['polar', pole]]) {
      assert.ok(c, what + ': the sphere could not be certified — ' + crs.why());
      assert.equal(c.surface, 'sphere');
      assert.equal(c.datum.isGround, false, what + ': the sphere claims to BE the ground');
      assert.equal(c.bound.from, 'datum', what + ': a sphere reported a projection term');
    }

    /* the datum term, measured — the half that `areaScale` never carried */
    near(eq.datum.area.min, 1.004490, 1e-4, 'sphere area at the equator');
    near(high.datum.area.min, 0.9942294, 1e-4, 'sphere area at 60°N');
    near(pole.datum.area.min, 0.9910912, 1e-4, 'sphere area at 88°N');
    assert.ok(eq.datum.area.min > 1, 'the sphere does not overstate area at the equator');
    assert.ok(pole.datum.area.max < 1, 'the sphere does not understate area at the pole');
    assert.ok(Math.abs(mid.datum.area.min - 1) < 3e-4,
      'the crossover near 35°N is gone: ' + mid.datum.area.min);

    /* ⚠ AND IT IS WORSE FOR A LENGTH THAN FOR AN AREA at mid-latitudes, which is the opposite of what
       a reader would guess from the area figures alone — so both are in the answer. */
    assert.ok(mid.worst.boundLength > 10 * Math.abs(mid.datum.area.min - 1),
      'the length term at 35°N is not reported as the larger one: ' + JSON.stringify(mid.worst));
    near(mid.worst.boundLength, 0.002294073, 1e-3, 'sphere length error at 35–36°N');

    /* the app's own radius is the one being certified, not a number this file chose */
    assert.equal(eq.datum.radiusM, globalThis.window.IntMapGeodesy._R_EARTH_KM * 1000);
  });

  test('R783 ② every plane states its datum, and only the ellipsoidal ones are on the ground', async () => {
    const { crs } = await boot();
    const rows = [
      ['EPSG:32654', true],
      ['EPSG:3857', false],
      ['ESRI:54009', false],
      ['aeqd:139.7,35.7', false],
    ];
    for (const [spec, isGround] of rows) {
      const P = crs.projection(spec);
      assert.ok(P, spec + ': the plane could not be built — ' + crs.why());
      const c = crs.certify(P, [139, 35, 140, 36]);
      assert.ok(c, spec + ': no certificate — ' + crs.why());
      assert.equal(c.datum.isGround, isGround, spec + ': datum.isGround is wrong');
      if (isGround) {
        /* exactly 1, not nearly: the plane's metric IS the ground metric */
        assert.equal(c.datum.area.min, 1, spec + ': an ellipsoidal plane reports a datum term');
        assert.equal(c.datum.area.max, 1);
        assert.equal(c.datum.linear.min, 1);
      } else {
        assert.ok(Math.abs(c.datum.area.min - 1) > 1e-6,
          spec + ': a spherical plane reports no datum term at all: ' + c.datum.area.min);
      }
    }

    /* ⚠ THE ONE THE AUDIT NAMED. Web Mercator's code is defined on a sphere of the WGS 84 semi-major
       axis while being fed ellipsoidal latitudes; the comment in buildWebMercator() said so and nothing
       measured it. 0.67% at the equator. */
    const wm = crs.certify(crs.projection('EPSG:3857'), [0, 0, 1, 1]);
    near(wm.datum.area.min, 1.006735, 1e-4, 'EPSG:3857 datum area at the equator');

    /* ⚠ AND THE ONE `exact: true` WAS HIDING. Mollweide preserves area on ITS SPHERE, so its whole
       error is the datum — and areaOn still answers `exact: true`, which is a statement about the
       plane and not about the ground. The certificate is what tells the two apart. */
    const P = crs.projection('mollweide:10');
    const g = poly(boxRing(9, 59, 11, 61));
    const a = crs.areaOn(P, g);
    assert.equal(a.ok, true, 'mollweide refused an area: ' + a.why);
    assert.equal(a.exact, true, 'the theory field moved — this test is about it NOT moving');
    assert.equal(a.declared.datumIsGround, false, 'the answer does not say its datum is not the ground');
    const c = crs.certify(P, g);
    assert.ok(Math.abs(c.worst.boundArea) > 4e-3,
      'an "exact" equal-area plane reports no ground error: ' + c.worst.boundArea);
    assert.ok(Math.abs(c.checked.area.ratio - 1) > 4e-3,
      'and the measured quadrangle agrees with the claim rather than with the ground');
  });

  /* ══ ③ 申告された範囲は、実測を本当に含む ═════════════════════════════════════════════════════ */

  test('R783 ③ the declared envelope contains the measured error, over every condition the audit named', async () => {
    const { crs } = await boot();
    const boxes = [
      ['tiny parcel', [139.7, 35.68, 139.71, 35.69]],
      ['thin boundary', [139.7, 35, 139.701, 36]],
      ['one degree', [139, 35, 140, 36]],
      ['a whole zone', [135, 30, 141, 36]],
      ['the equator', [0, -0.5, 1, 0.5]],
      ['high latitude', [10, 70, 12, 72]],
      ['near the pole', [10, 84, 12, 85]],
      ['the southern hemisphere', [-60, -35, -59, -34]],
      ['two zones away', [-10, 40, -9, 41]],
      ['a hemisphere', [-80, 0, -20, 50]],
    ];
    const planes = ['EPSG:32654', 'EPSG:3857', 'ESRI:54009', 'aeqd:139.7,35.7', 'sphere'];
    let checked = 0;
    for (const [what, box] of boxes) {
      for (const spec of planes) {
        const surface = (spec === 'sphere') ? 'sphere' : crs.projection(spec);
        if (!surface) continue;
        const c = crs.certify(surface, box);
        if (!c) continue;
        if (c.checked.area && c.checked.area.ratio != null) {
          checked++;
          assert.equal(c.within.area, true, what + ' on ' + spec
            + ': the measured area ratio ' + c.checked.area.ratio
            + ' is OUTSIDE the declared bound ' + JSON.stringify(c.bound.area));
          /* ⚠ THE DISCRETISATION OF THE CHECK IS STATED RATHER THAN ASSUMED AWAY, and so is what
             stopped it: a tiny parcel on Mollweide cannot reach 1e-9 because that projection's own
             Newton solve is noisier than that, and `limitedBy` says so instead of the answer claiming
             a precision it does not have. */
          if (c.checked.area.steps != null) {
            assert.ok(['converged', 'projection-noise', 'steps'].includes(c.checked.area.limitedBy),
              what + ' on ' + spec + ': unnamed stopping reason ' + c.checked.area.limitedBy);
            /* ⚠ `settled` ALONE WAS THE WRONG DEMAND. A 60° box on a 6° zone never settles to 1e-9 and
               does not need to: the error it is reporting is 19,300%. What has to hold is that the
               check was CONCLUSIVE — its own discretisation two orders below the error it found. */
            assert.equal(c.checked.area.conclusive, true, what + ' on ' + spec + ': residual '
              + c.checked.area.residual + ' is not two orders below the error it reports '
              + Math.abs(c.checked.area.ratio - 1));
            if (c.checked.area.limitedBy === 'converged') {
              assert.equal(c.checked.area.settled, true, what + ' on ' + spec + ': converged but not settled');
              assert.ok(c.checked.area.residual < 1e-9, what + ' on ' + spec + ': converged above its own settle');
            }
          }
        }
        if (c.within.length != null) {
          assert.equal(c.within.length, true, what + ' on ' + spec
            + ': a 1 km probe falls outside the declared length bound ' + JSON.stringify(c.bound.length));
        }
      }
    }
    assert.ok(checked >= 40, 'only ' + checked + ' conditions were actually measured');
  });

  test('R783 ③ the envelope is informative, not vacuous — it separates the trustworthy from the wrong', async () => {
    const { crs } = await boot();
    const box = [139, 35, 140, 36], far = [-10, 40, -9, 41];
    const utm = crs.certify(crs.projection('EPSG:32654'), box);
    const utmFar = crs.certify(crs.projection('EPSG:32654'), far);
    const wm60 = crs.certify(crs.projection('EPSG:3857'), [10, 60, 11, 61]);

    /* in its own zone a UTM area is good to better than a tenth of a percent … */
    assert.ok(utm.worst.boundArea < 1e-3, 'UTM in zone is declared worse than 0.1%: ' + utm.worst.boundArea);
    /* … and two zones away it is not a measurement at all, which the SAME instrument says */
    assert.ok(utmFar.worst.boundArea > 1, 'UTM two zones away is not declared as broken: ' + utmFar.worst.boundArea);
    assert.ok(utmFar.outside > 0, 'and assess() did not notice the data left the stated extent');
    /* Web Mercator at 60°N is the textbook case: sec²60 = 4 */
    assert.ok(wm60.worst.boundArea > 2.9 && wm60.worst.boundArea < 3.6,
      'EPSG:3857 at 60°N is not declared as ~4× in area: ' + wm60.worst.boundArea);

    /* ⚠ AND THE EDGE RULE IS REPORTED SEPARATELY FROM THE PROJECTION, because for a long segment it is
       the larger term and no scale factor can see it. Measured on a 767 km line in its own zone: the
       chord is short of the geodesic by ~4e-5 while the projection's own probe is ~3e-4. */
    const seg = line([139, 35], [145, 40]);
    const c = crs.certify(crs.projection('EPSG:32654'), seg);
    assert.ok(c.worst.spanLength != null && c.worst.probeLength != null,
      'the two length terms are not reported separately');
    const planar = crs.lengthOn(crs.projection('EPSG:32654'), seg);
    const ground = crs.lengthOnGround(seg);
    assert.equal(planar.ok, true);
    assert.equal(ground.ok, true);
    const actual = Math.abs(planar.value / ground.value - 1);
    assert.ok(Math.abs(actual - c.worst.spanLength) < 1e-6,
      'the declared span error ' + c.worst.spanLength + ' is not the error the answer actually has: ' + actual);
    assert.equal(planar.declared.edge, 'straight-in-plane');
    assert.equal(ground.edge, 'geodesic');
  });

  /* ══ ④ 「信頼できない」と述べるべき条件で、本当にそう述べる ════════════════════════════════════ */

  test('R783 ④ a condition that cannot be measured is named, not answered with a number', async () => {
    const { crs } = await boot();

    /* the seam, asked of the DATA and not of its bounding box: a ring written 179°E → 179°W has a box
       spanning 358° and a crossing that areaOn() refuses */
    const P = crs.projection('EPSG:3857');
    const wrapped = poly([[179, 0], [-179, 0], [-179, 1], [179, 1], [179, 0]]);
    const a = crs.areaOn(P, wrapped);
    assert.equal(a.ok, false, 'a ring across the seam was given an area');
    assert.equal(a.why, 'crs-plane-seam-crossed');
    const c = crs.certify(P, wrapped);
    assert.ok(c, 'no certificate for a seam-crossing ring');
    assert.ok(c.blocked, 'the certificate reports a healthy bound for data areaOn() will refuse');
    assert.equal(c.blocked.why, 'crs-plane-seam-crossed');
    assert.equal(c.verified, false, 'a blocked surface still calls itself verified');
    assert.equal(c.why, 'crs-plane-seam-crossed');
    assert.ok(Array.isArray(c.seam.crossedAt) && c.seam.crossedAt.length === 2,
      'the crossing is not shown to the reader');

    /* a nearly antipodal pair: the reference does not converge, and 「確認できなかった」 is not
       「一致しなかった」 (.agents/rules/one-pass-or-a-reason.md §5) */
    assert.equal(crs.geodesic(0, 0, 180, 0), null, 'Vincenty claimed to converge on an antipode');
    const anti = crs.lengthOnGround(line([0, 0], [180, 0]));
    assert.equal(anti.ok, false, 'an antipodal segment was given a length');
    assert.equal(anti.why, 'crs-reference-unavailable');
    assert.ok(anti.detail && anti.detail.at, 'the refusal does not say which segment');
    /* and a pair that is merely long still answers */
    assert.equal(crs.lengthOnGround(line([0, 0], [170, 0])).ok, true, 'a long non-antipodal line was refused');

    /* ⚠ AND A CERTIFICATE THAT COULD NOT BE VERIFIED SAYS WHY, ALWAYS. A Point has no extent, so there
       is no figure to put against the reference — and `verified: false` with a null reason would be
       exactly the silence this round is about. The bound is still measured, because a scale factor at a
       position needs no figure. */
    const atPoint = crs.certify(crs.projection('EPSG:32654'), { type: 'Point', coordinates: [139.7, 35.7] });
    assert.ok(atPoint, 'a Point cannot be certified at all');
    assert.equal(atPoint.checked.area, null, 'a Point was given an area figure');
    assert.equal(atPoint.verified, false);
    assert.equal(atPoint.why, 'crs-extent-unmeasurable', 'an unverified certificate gave no reason');
    assert.ok(atPoint.bound.area.min > 0.99 && atPoint.bound.area.max < 1.01,
      'the bound at a position was not measured: ' + JSON.stringify(atPoint.bound.area));
    assert.ok(atPoint.checked.length.probe.every((r) => r.m > 0), 'a probe does not state its own length');

    /* a surface nobody named */
    assert.equal(crs.certify('mercator-ish', [0, 0, 1, 1]), null);
    assert.equal(crs.why(), 'crs-surface-unknown');
    assert.equal(crs.certify(null, [0, 0, 1, 1]), null);
    assert.equal(crs.why(), 'crs-surface-unknown');

    /* a ring that sweeps more than a turn is neither a seam crossing nor a band */
    const overwound = crs.areaOnGround(poly([[0, 0], [400, 0], [400, 1], [0, 1], [0, 0]]));
    assert.equal(overwound.ok, false, 'a ring winding past a full turn was given an area');
    assert.equal(overwound.why, 'crs-edge-span-ambiguous');

    /* every code raised above is one the module publishes */
    const published = crs.refusals();
    for (const why of ['crs-plane-seam-crossed', 'crs-reference-unavailable', 'crs-surface-unknown',
      'crs-edge-span-ambiguous', 'crs-accuracy-outside-tolerance', 'crs-accuracy-unmeasured',
      'crs-tolerance-invalid']) {
      assert.ok(published.includes(why), why + ' is raised but not published by refusals()');
    }
  });

  test('R783 ④ a stated tolerance that cannot be met is refused WITH the surfaces that can', async () => {
    const { crs } = await boot();
    const g = poly(boxRing(10, 59, 11, 61));                  /* 60°N, where Web Mercator is ~4× */
    const P = crs.projection('EPSG:3857');

    /* ⚠ NOTHING IS REFUSED UNLESS THE CALLER ASKED FOR SOMETHING. The number a reader got yesterday is
       the number they get today, to the bit, and no certificate is computed behind their back. */
    const bare = crs.areaOn(P, g);
    assert.equal(bare.ok, true, 'an area with no tolerance was refused: ' + bare.why);
    assert.equal(bare.certificate, undefined, 'a certificate was computed for a caller who did not ask');
    assert.equal(bare.tolerance, undefined);
    /* …and the declaration that costs nothing IS attached */
    assert.equal(bare.declared.surface, 'stated-plane');
    assert.equal(bare.declared.crs, 'EPSG:3857');
    assert.equal(bare.declared.seamRule, 'refuse-crossing-edge');
    assert.deepEqual(bare.declared.extent, P.extent);

    const strict = crs.areaOn(P, g, { tolerance: 0.001 });
    assert.equal(strict.ok, false, 'a 4× error passed a 0.1% requirement');
    assert.equal(strict.why, 'crs-accuracy-outside-tolerance');
    assert.ok(strict.detail.worst > 1, 'the refusal does not say how far off it is');
    assert.ok(strict.detail.certificate && strict.detail.certificate.bound,
      'the refusal does not carry the measurement it was based on');
    assert.ok(Array.isArray(strict.detail.alternatives) && strict.detail.alternatives.length > 0,
      '「信頼できない」 was answered without saying where the reader CAN measure');

    /* ⚠ AND EVERY ALTERNATIVE IS ONE THAT ACTUALLY MEETS IT — measured by following it, not by
       believing the list ([[intmap-contract-is-not-implementation]]). */
    for (const alt of strict.detail.alternatives) {
      assert.ok(alt.worst <= 0.001, alt.surface + ' is offered but declares ' + alt.worst);
      if (alt.surface === 'ellipsoid') {
        assert.equal(alt.call, 'areaOnGround');
        const road = crs.areaOnGround(g, { unit: 'km2' });
        assert.equal(road.ok, true, 'the road offered does not run: ' + road.why);
        assert.ok(road.value > 0);
        assert.equal(road.surface, 'ellipsoid');
      } else if (alt.surface === 'stated-plane') {
        const Q = crs.projection(alt.spec);
        assert.ok(Q, 'an offered plane cannot be built: ' + JSON.stringify(alt.spec));
        const again = crs.areaOn(Q, g, { tolerance: 0.001 });
        assert.equal(again.ok, true, 'an offered plane refuses the same tolerance: ' + again.why);
      }
    }

    /* a tolerance it CAN meet: the number comes back unchanged, with the certificate beside it */
    const loose = crs.areaOn(P, g, { tolerance: 5 });
    assert.equal(loose.ok, true, 'a generous tolerance refused anyway: ' + loose.why);
    assert.equal(loose.value, bare.value, 'the value moved when a tolerance was stated');
    assert.equal(loose.withinTolerance, true);
    assert.ok(loose.certificate.verified, 'the certificate beside the number is not verified');

    /* a requirement that is not a number is a mistake in the CALL, refused before any arithmetic */
    for (const bad of ['x', 0, -1, NaN, Infinity]) {
      const r = crs.areaOn(P, g, { tolerance: bad });
      assert.equal(r.ok, false, 'tolerance ' + String(bad) + ' was accepted');
      assert.equal(r.why, 'crs-tolerance-invalid');
    }

    /* the same gate on a length */
    const seg = line([10, 59], [11, 61]);
    const sl = crs.lengthOn(P, seg, { tolerance: 1e-6 });
    assert.equal(sl.ok, false, 'a length passed a requirement no plane here can meet');
    assert.equal(sl.why, 'crs-accuracy-outside-tolerance');
    assert.ok(sl.detail.alternatives.some((a) => a.call === 'lengthOnGround'),
      'the ground road is not offered for a length');
  });

  test('R783 ④ suggest() states which candidates meet a stated requirement, and still does not choose', async () => {
    const { crs } = await boot();
    const box = [139, 35, 140, 36];

    const plain = crs.suggest(box, { purpose: 'area' });
    assert.ok(plain && plain.candidates.length >= 3);
    assert.equal(plain.tolerance, null);
    for (const c of plain.candidates) {
      assert.equal(c.within, null, 'a candidate was judged against a requirement nobody stated');
      assert.ok(c.bound && c.bound.area, 'a candidate carries no ground envelope: ' + c.kind);
      /* ⚠ the ranked number and the envelope are different things: `areaScale` is against the
         candidate's own datum and `bound` is against the ground */
      if (c.kind === 'mollweide') {
        assert.ok(Math.abs(c.areaScale.max - 1) < 1e-9, 'mollweide is not equal-area on its own datum');
        assert.ok(Math.abs(c.worst.area) > 1e-6, 'and yet it claims to be exact against the ground');
      }
    }

    const asked = crs.suggest(box, { purpose: 'area', tolerance: 1e-3 });
    assert.equal(asked.tolerance, 1e-3);
    const within = asked.candidates.filter((c) => c.within === true);
    assert.ok(within.length > 0, 'nothing meets 0.1% over a 1° box at 35°N');
    assert.ok(asked.candidates.some((c) => c.within === false), 'everything meets it, so the field says nothing');
    /* the order is still the measurement's, not the requirement's */
    assert.deepEqual(asked.candidates.map((c) => c.kind), plain.candidates.map((c) => c.kind));
    /* and every `within: true` is true when followed */
    for (const c of within) {
      const r = crs.areaOn(crs.projection(c.spec), poly(boxRing(139, 35, 140, 36)), { tolerance: 1e-3 });
      assert.equal(r.ok, true, c.kind + ' was declared within 0.1% and then refused it: ' + r.why);
    }
    assert.equal(crs.suggest(box, { purpose: 'area', tolerance: 'soon' }), null);
    assert.equal(crs.why(), 'crs-tolerance-invalid');
  });

  /* ══ ⑤ 既定の答えは 1 ビットも動いていない ════════════════════════════════════════════════════ */

  test('R783 ⑤ the numbers this kernel already answered are unchanged — including the metric that was de-duplicated', async () => {
    const { crs } = await boot();

    /* ⚠ buildUtm()'s metric() now CALLS groundMetric() instead of recomputing the identical
       expression. That is only safe if it is the SAME arithmetic, so it is measured here against the
       expression that was there, bit for bit. */
    const a = 6378137, f = 1 / 298.257223563, e2 = f * (2 - f);
    const P = crs.projection('EPSG:32654');
    for (let lat = -80; lat <= 84; lat += 2) {
      const sp = Math.sin(lat * D2R), cp = Math.cos(lat * D2R), w = 1 - e2 * sp * sp;
      const want = [a / Math.sqrt(w) * cp, a * (1 - e2) / Math.pow(w, 1.5)];
      const got = P.metric(lat);
      assert.equal(got[0], want[0], 'the parallel metric moved at ' + lat + '°');
      assert.equal(got[1], want[1], 'the meridian metric moved at ' + lat + '°');
    }

    /* the projection itself: a round trip that closes, and the zone's own origin */
    const origin = P.forward(141, 0);
    assert.ok(Math.abs(origin[0] - 500000) < 1e-6 && Math.abs(origin[1]) < 1e-6,
      'the false easting of zone 54 moved: ' + JSON.stringify(origin));
    /* ⚠ MEASURED IN METRES AND NOT IN DEGREES, because the claim buildUtm() makes about itself is in
       metres — 「the forward/inverse round trip closes to 0.84 mm」 — and a degree tolerance would be a
       different, latitude-dependent claim that this round has no business inventing. */
    for (const [lng, lat] of [[139, 35], [141, 60], [138.5, 20], [143, 80]]) {
      const back = P.inverse(...P.forward(lng, lat));
      const m = Math.hypot((back[0] - lng) * D2R * Math.cos(lat * D2R), (back[1] - lat) * D2R) * 6371008.8;
      assert.ok(m < 2e-3, 'the round trip closes to ' + m.toExponential(2)
        + ' m at ' + lng + ',' + lat + ' — the file claims 0.84 mm');
    }

    /* distortionAt / distortionOver keep their own positions: the accuracy bound samples one more
       point (the plane's standard point) and must not have changed what these answer */
    const g = poly(boxRing(139, 35, 140, 36));
    const area = crs.areaOn(P, g);
    /* ⚠ AGAINST THE FIRST-ORDER FORM OF THE PROJECTION rather than against a number copied out of a
       run: a transverse Mercator's area scale is k₀²·(1 + (Δλ·cos φ)² + …), and 1.5° off the central
       meridian at 35.5°N that is 0.9996500. The measured value carries the next order. */
    const d = crs.distortionAt(P, 139.5, 35.5);
    const A2 = Math.pow(1.5 * D2R * Math.cos(35.5 * D2R), 2);
    assert.ok(Math.abs(d.areaScale - 0.9996 * 0.9996 * (1 + A2)) < 1e-5,
      'distortionAt no longer agrees with the first-order area scale of a transverse Mercator: ' + d.areaScale);
    assert.ok(Math.abs(d.areaScale - 0.9996561914813437) < 1e-12, 'distortionAt moved: ' + d.areaScale);
    assert.ok(Math.abs(area.value - 10062.72768905774) < 0.001, 'the planar area moved: ' + area.value);
    /* ⚠ AND THE CERTIFICATE'S FIGURE IS NOT THAT RING: it densifies the box's edges, because a
       parallel is a curve on this plane. The gap between the two IS the edge rule, on an area this
       time — 0.26 km² over 10,063, i.e. 2.6e-5 — and a reader who sees only one of the two numbers
       cannot know it is there. */
    const cert = crs.certify(P, g);
    assert.ok(cert.checked.area.gotM2 / 1e6 > area.value, 'the densified quadrangle is not the larger figure');
    const edgeTerm = cert.checked.area.gotM2 / 1e6 / area.value - 1;
    assert.ok(Math.abs(edgeTerm - 2.55e-5) < 2e-6, 'the areal edge term moved: ' + edgeTerm.toExponential(3));
    assert.ok(area.areaScale.min <= d.areaScale && d.areaScale <= area.areaScale.max);
    /* the assessment over the same data is still the 3×3 lattice's */
    const as = crs.assess(P, g);
    assert.equal(as.measuredAt, 9, 'assess() changed how many positions it measures');
  });

  /* ══ ⑥ 証明書は、アプリが本当に出す数について述べている ═══════════════════════════════════════
     ⚠ A certificate about 「the sphere」 is worthless unless the sphere it describes is the one
     js/gis-ops.js measures on. So the app's own area and length are computed through ops and put
     against the ground, and the result has to land inside the envelope the certificate declared. */

  test('R783 ⑥ the sphere certificate bounds the error of the number js/gis-ops.js actually produces', async () => {
    const w = installWindow();
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisGeometry } = await import('../js/gis-geometry.js');
    const { makeGisOps } = await import('../js/gis-ops.js');
    const { makeGisCrs } = await import('../js/gis-crs.js');
    const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps(), crs = makeGisCrs();
    w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops; w.IntMapGisCrs = crs;
    await geometry.ready();

    for (const [what, box] of [['equator', [0, 0, 1, 1]], ['mid', [139, 35, 140, 36]], ['high', [10, 60, 11, 61]]]) {
      const ring = boxRing(box[0], box[1], box[2], box[3]);
      const ds = data.add({ title: what, features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] });
      const measured = await ops.run({ op: 'measure', inputs: [ds.id], params: { what: 'area', unit: 'km' } });
      assert.equal(measured.ok, true, what + ': measure refused — ' + measured.why);
      const onSphere = data.get(measured.dataset.id).features()[0].properties._areaKm2;
      const onGround = crs.areaOnGround(poly(ring), { unit: 'km2' });
      assert.equal(onGround.ok, true);
      const ratio = onSphere / onGround.value;
      const cert = crs.certify('sphere', box);
      assert.ok(ratio >= cert.bound.area.min - 1e-9 && ratio <= cert.bound.area.max + 1e-9,
        what + ": the app's own spherical area is " + ratio
        + ' of the ground, outside the certified ' + JSON.stringify(cert.bound.area));
      /* the certificate's own check predicted that very ratio — it is not a looser statement */
      assert.ok(Math.abs(cert.checked.area.ratio - ratio) < 1e-6,
        what + ': the certified quadrangle ratio ' + cert.checked.area.ratio
        + ' is not the ratio the app produced ' + ratio);
    }
  });

  /* ══ ⑦ 散文が、その下の算術と一致している ═════════════════════════════════════════════════════ */

  test('R783 ⑦ the percentages the module states about itself are the ones its own arithmetic produces', async () => {
    const { crs } = await boot();
    const src = read('js/gis-crs.js');

    /* the three figures the header and the section comment quote */
    const sphereEq = crs.certify('sphere', [0, 0, 1, 1]).datum.area.min;
    const spherePole = crs.certify('sphere', [0, 88, 1, 89]).datum.area.min;
    const wmEq = crs.certify(crs.projection('EPSG:3857'), [0, 0, 1, 1]).datum.area.min;
    const pct = (v) => ((v - 1) * 100);

    assert.ok(Math.abs(pct(sphereEq) - 0.45) < 0.01,
      'the header says +0.45% at the equator; the arithmetic says ' + pct(sphereEq).toFixed(3));
    assert.ok(Math.abs(pct(spherePole) + 0.89) < 0.01,
      'the header says −0.89% at the pole; the arithmetic says ' + pct(spherePole).toFixed(3));
    assert.ok(Math.abs(pct(wmEq) - 0.67) < 0.01,
      'the header says 0.67% for EPSG:3857; the arithmetic says ' + pct(wmEq).toFixed(3));
    for (const quoted of ['+0.45%', '0.89%', '0.67%']) {
      assert.ok(src.includes(quoted), 'the figure ' + quoted + ' is no longer stated in the source');
    }

    /* the edge-rule figures the EDGE_RULE comment states: the same ring read two ways */
    const tri = [[0, 60], [9, 60], [9, 66], [0, 60]];
    const properly = crs.areaOnGround(poly(tri), { unit: 'm2' }).value;
    const AUTH = (() => {
      const e2 = F * (2 - F), e = Math.sqrt(e2);
      const q = (lat) => { const s = Math.sin(lat * D2R); return (1 - e2) * (s / (1 - e2 * s * s) + Math.log((1 + e * s) / (1 - e * s)) / (2 * e)); };
      const q90 = q(90), R2 = A * A * q90 / 2;
      return (ring) => {
        let sum = 0;
        for (let i = 0; i < ring.length - 1; i++) {
          const p = ring[i], r = ring[i + 1];
          sum += (r[0] - p[0]) * D2R * (q(p[1]) / q90 + q(r[1]) / q90);
        }
        return Math.abs(R2 * sum / 2);
      };
    })();
    const byTrapezoid = AUTH(tri);
    const gap = Math.abs(properly / byTrapezoid - 1);
    assert.ok(Math.abs(gap - 0.033) < 0.002,
      'the comment says the two edge readings are 3.3% apart at 60°N; measured ' + (gap * 100).toFixed(2) + '%');
    assert.ok(src.includes('3.3%'), 'the 3.3% measurement is no longer stated in the source');

    /* the probe's own chord residual, derived from its own length rather than declared as a constant */
    const c = crs.certify(crs.projection('EPSG:32654'), [139, 35, 140, 36]);
    assert.equal(c.checked.length.probeCeilingM, 1000);
    assert.equal(c.checked.length.probeM, 1000, 'a 1° box did not reach the probe ceiling');
    const R = globalThis.window.IntMapGeodesy._R_EARTH_KM * 1000;
    const expected = 1000 * 1000 / (24 * R * R);
    assert.ok(Math.abs(c.checked.length.chordResidual / expected - 1) < 0.01,
      'the chord residual is not L²/(24R²): ' + c.checked.length.chordResidual + ' vs ' + expected);
    assert.ok(src.includes('1.03e-9'), 'the derived chord residual is no longer stated in the source');

    /* ⚠ AND THE PROBE SHRINKS TO FIT A SMALL PARCEL, which is the defect ③ found: a fixed 1 km probe
       stepped outside a 0.01° box and its ratio then belonged to a different place than the bound. */
    const tiny = crs.certify(crs.projection('EPSG:32654'), [139.7, 35.68, 139.71, 35.69]);
    assert.ok(tiny.checked.length.probeM < 600, 'the probe did not shrink to the parcel: ' + tiny.checked.length.probeM);
    assert.ok(tiny.checked.length.chordResidual < expected, 'a shorter probe did not cost less');
    assert.equal(tiny.within.length, true, 'the shrunken probe still falls outside the bound');
  });

  /* ══ ⑨ 外挿した面積は、面そのものを積分した面積と一致する ═════════════════════════════════════
     ⚠ THE EXTRAPOLATION IS THE NEW ARITHMETIC IN THE CHECK, so it gets a reference of its own — and
     one that shares nothing with it. A densified shoelace with Richardson on top is put against the
     INTEGRAL of the projection's own Jacobian over the same quadrangle: A = ∫∫ areaScale·h_λ·h_φ dλ dφ
     with areaScale from distortionAt (central differences) and h from the plane's own metric. No
     polygon, no doubling, no extrapolation. */

  test('R783 ⑨ the extrapolated quadrangle area equals the integral of the plane’s own Jacobian', async () => {
    const { crs } = await boot();
    const cases = [
      ['EPSG:32654', [139, 35, 140, 36]],
      ['EPSG:32654', [136, 32, 140, 36]],
      ['EPSG:3857', [10, 60, 11, 61]],
      ['ESRI:54009', [-1, -1, 1, 1]],
      ['aeqd:139.7,35.7', [139, 35, 140, 36]],
    ];
    for (const [spec, box] of cases) {
      const P = crs.projection(spec);
      const c = crs.certify(P, box);
      assert.ok(c && c.checked.area && c.checked.area.gotM2 > 0, spec + ': no measured figure');
      /* the double integral, twelve panels each way so that the panel count is not the thing measured */
      const byJacobian = quad((phi) => {
        const lat = phi / D2R;
        const h = P.metric(lat);
        return quad((lam) => {
          const d = crs.distortionAt(P, lam / D2R, lat);
          return d ? d.areaScale : 0;
        }, box[0] * D2R, box[2] * D2R, 12) * h[0] * h[1];
      }, box[1] * D2R, box[3] * D2R, 12);
      const rel = Math.abs(c.checked.area.gotM2 / byJacobian - 1);
      assert.ok(rel < 1e-7, spec + ' over ' + JSON.stringify(box) + ': the extrapolated shoelace and the '
        + 'integral of the same plane disagree by ' + rel.toExponential(2));
    }
  });

  /* ══ ⑧ 面の目録は 1 か所から来ている ═════════════════════════════════════════════════════════ */

  test('R783 ⑧ every published surface can be certified or says why not, and each names the door that measures on it', async () => {
    const { crs } = await boot();
    const list = crs.surfaces();
    assert.equal(list.length, 3, 'the surface catalogue changed size');
    const names = list.map((s) => s.name).sort();
    assert.deepEqual(names, ['ellipsoid', 'sphere', 'stated-plane']);

    for (const s of list) {
      assert.ok(s.edge && s.edge.area && s.edge.length, s.name + ': no edge rule per measurement');
      assert.ok(s.call && s.call.area && s.call.length, s.name + ': no door named for it');
      /* ⚠ THE DOORS EXIST. A catalogue that lists a surface nothing can measure on is #R756's defect. */
      for (const fn of [s.call.area, s.call.length]) {
        if (fn.startsWith('ops.')) continue;                    /* another module's door, named as such */
        assert.equal(typeof crs[fn], 'function', s.name + ': ' + fn + ' is published and does not exist');
      }
      if (s.isGround) {
        assert.equal(s.certifiable, false, 'the reference certifies itself');
        assert.ok(s.accuracy.area.relative > 0 && s.accuracy.length.relative > 0);
      } else {
        assert.equal(s.certifiable, true);
        assert.equal(s.accuracy, null, s.name + ': a certifiable surface carries a fixed accuracy');
      }
    }

    /* the sphere's two edge rules really are two different rules — the finding EDGE_RULE records */
    const sphere = list.find((s) => s.name === 'sphere');
    assert.notEqual(sphere.edge.area, sphere.edge.length,
      'the sphere is described as reading an edge the same way for area and for length');
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R783 · the measure op hands back the certificate   (was tests/r783-measure-certificate-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R783 · 数は出た。どこまで信頼できるかは、読み手に届いていなかった
 * ----------------------------------------------------------------------------
 *  js/gis-crs.js grew `certify()` this round — the envelope of an area and a length against WGS 84,
 *  measured over the reader's OWN data — and js/gis-ops.js was the module that had written, in prose
 *  above its surface vocabulary, that no such measurement exists. The invariants below are the
 *  defects, not the fixes ([[intmap-restate-the-defect-not-the-fix]]):
 *
 *    ① The paragraph above SURFACES said 「許容誤差はここでは宣言しない／そのような測定は今日存在
 *       しない」. The second half became false the moment certify() landed, and a comment that
 *       contradicts the code below it is #R764's defect.
 *    ② `measure` called assess() and never certify(), so a column of Web-Mercator areas at 60°N
 *       travelled with its distortion scale and NOT with the envelope a reader with a requirement
 *       has to compare against.
 *    ③ A caller could not state a requirement at all, so every condition answered with a number
 *       (the shape #R783 removed one level down, in the kernel).
 *    ④ areaOnGround / lengthOnGround existed and were reachable only from the kernel: the one
 *       surface with no projection in it could not be asked for through an op.
 *
 *  ⚠ NO ERROR FIGURE IS WRITTEN IN THIS FILE. Every number compared here is asked of js/gis-crs.js
 *  through a door of its own, because a fixture that restated the envelope would be measuring the
 *  fixture ([[intmap-co-designed-reader-cannot-falsify]]).
 * ==========================================================================*/
describe('§ #R783 · the measure op hands back the certificate', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  async function boot() {
    const w = installWindow();
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisGeometry } = await import('../js/gis-geometry.js');
    const { makeGisCrs } = await import('../js/gis-crs.js');
    const { makeGisOps } = await import('../js/gis-ops.js');
    const data = makeGisDatasets();
    const geometry = makeGisGeometry();
    const crs = makeGisCrs();
    const ops = makeGisOps();
    w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisCrs = crs; w.IntMapGisOps = ops;
    await geometry.ready();
    if (crs && typeof crs.ready === 'function') await crs.ready();
    return { w, data, geometry, crs, ops };
  }

  const feat = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
  /* 60°N, where the plane below is at its worst and the ground is the only road */
  const SQUARE = { type: 'Polygon', coordinates: [[[10, 59], [11, 59], [11, 61], [10, 61], [10, 59]]] };
  const LINE = { type: 'LineString', coordinates: [[10, 59], [11, 60], [12, 61]] };

  const areaBox = (data) => data.add({ title: 'box', features: [feat(SQUARE, { name: 'box' })] });
  const lineBox = (data) => data.add({ title: 'line', features: [feat(LINE, { name: 'line' })] });
  const featuresOf = (data, rec) => data.get(rec.id).features();
  /* an op registers its answer as a dataset — a refusal registers nothing, which ③ measures */
  const rows = (data, res) => data.get(res.dataset.id).features();

  /* ══ ① 註が、そのすぐ下のコードと逆のことを述べていた ══════════════════════════════════════ */

  test('R783 ① the paragraph above SURFACES no longer says the measurement does not exist', () => {
    /* 綴りのまま: 主張の対象が文書・註の文面そのもの。 */
    const src = read('js/gis-ops.js');
    const at = src.indexOf('const SURFACES = [');
    assert.ok(at > 0, 'the surface vocabulary is gone from js/gis-ops.js');
    const para = src.slice(Math.max(0, at - 3000), at);

    /* THE DEFECT: the file stated, as a fact, that nothing had measured this. */
    assert.ok(!/IS NOT DECLARED HERE, and that is deliberate/.test(para),
      'the paragraph still declares that no tolerance is stated here');
    assert.ok(!/no\s+such measurement exists for these ops today/.test(para),
      'the paragraph still says the measurement does not exist — certify() exists');

    /* …and it says where the envelope comes from instead, by name. */
    assert.ok(/certify\(\)/.test(para), 'the paragraph does not name the measurement that now exists');
    assert.ok(/stats\.fit/.test(para), 'the paragraph does not say where a reader receives it');
    assert.ok(/tolerance/.test(para), 'the paragraph does not say what a caller may state');

    /* ⚠ AND THE VOCABULARY IS NOT A COPY. The ground's spelling belongs to js/gis-crs.js. */
    const line = src.slice(at, src.indexOf('\n', at));
    assert.ok(!/ellipsoid/.test(line),
      'the ground surface is typed into this file instead of being derived: ' + line);
  });

  /* ══ ② 包絡が、数と同じ答えの中で読み手に届く ═══════════════════════════════════════════════ */

  test('R783 ② measure hands back the certificate the crs kernel measured, not a second opinion', async () => {
    const { data, crs, ops } = await boot();
    const rec = areaBox(data);
    const res = await ops.run({ op: 'measure', inputs: [rec.id], params: { what: 'area', crs: 'EPSG:3857', unit: 'km' } });
    assert.equal(res.ok, true, 'measure refused: ' + JSON.stringify(res.why || res));

    const fit = res.stats.fit;
    assert.ok(fit, 'measure reports no fit at all');
    /* THE DEFECT: these three were undefined — the column said how much the plane distorts and not
       how far off the number can be. */
    assert.ok(fit.bound, 'the answer carries no envelope');
    assert.ok(fit.checked, 'the answer does not say what the reference actually came out as');
    assert.ok(fit.within, 'the answer does not say whether the check fell inside the envelope');

    const P = crs.projection('EPSG:3857');
    const cert = crs.certify(P, featuresOf(data, rec));
    assert.ok(cert, 'the kernel cannot certify the plane the op just measured on');
    const same = (x) => JSON.parse(JSON.stringify(x));
    assert.deepEqual(same(fit.bound), same(cert.bound), 'the op carries a different envelope than the kernel measured');
    assert.deepEqual(same(fit.checked), same(cert.checked), 'the op carries a different check than the kernel ran');
    assert.deepEqual(same(fit.within), same(cert.within), 'the op carries a different verdict than the kernel reached');
  });

  /* ══ ③ 述べた要求を満たせないとき、数を返さず、満たせる面を名指す ══════════════════════════ */

  test('R783 ③ a stated tolerance the plane cannot meet returns no number and names the surfaces that can', async () => {
    const { data, ops } = await boot();
    const rec = areaBox(data);
    const res = await ops.run({
      op: 'measure', inputs: [rec.id],
      params: { what: 'area', crs: 'EPSG:3857', unit: 'km', tolerance: 0.001 },
    });
    assert.equal(res.ok, false, 'a plane that is hundreds of percent off met a 0.1% requirement');
    assert.equal(res.why, 'crs-accuracy-outside-tolerance');
    assert.equal(res.dataset, undefined, 'a refusal registered a dataset anyway — the numbers were returned');
    assert.equal(res.detail.tolerance, 0.001);
    assert.ok(res.detail.worst > 0.001, 'the refusal does not say how far off it is');

    const alts = res.detail.alternatives;
    assert.ok(Array.isArray(alts) && alts.length > 0,
      '「信頼できない」 was answered without saying where the reader CAN measure');

    /* ⚠ 辿れることを、信じずに測る ([[intmap-contract-is-not-implementation]]). */
    let ground = 0;
    for (const alt of alts) {
      assert.ok(alt.worst <= 0.001, alt.surface + ' is offered and declares ' + alt.worst);
      if (alt.surface !== 'ellipsoid') continue;
      ground++;
      const road = await ops.run({
        op: 'measure', inputs: [rec.id],
        params: { what: 'area', surface: 'ellipsoid', unit: 'km', tolerance: 0.001 },
      });
      assert.equal(road.ok, true, 'the road the refusal offered does not run from the op: ' + JSON.stringify(road.why || road));
      assert.ok(rows(data, road)[0].properties._areaKm2 > 0, 'the road ran and produced no number');
    }
    assert.equal(ground, 1, 'the one surface with no projection in it was not offered as a road');

    /* a requirement that is not a number is a mistake in the call, and is refused as one */
    for (const bad of ['x', 0, -1]) {
      const r = await ops.run({ op: 'measure', inputs: [rec.id], params: { what: 'area', crs: 'EPSG:3857', tolerance: bad } });
      assert.equal(r.ok, false, 'tolerance ' + JSON.stringify(bad) + ' was accepted');
      assert.equal(r.why, 'bad-param');
      assert.equal(r.detail.param, 'tolerance');
    }
  });

  test('R783 ③b the sphere is held to a stated tolerance too, and says where to go instead', async () => {
    const { data, ops } = await boot();
    const rec = areaBox(data);
    /* tighter than any surface here but the ground */
    const hard = await ops.run({ op: 'measure', inputs: [rec.id], params: { what: 'area', unit: 'km', tolerance: 1e-9 } });
    assert.equal(hard.ok, false, 'the sphere met a 1e-9 requirement');
    assert.equal(hard.why, 'crs-accuracy-outside-tolerance');
    assert.equal(hard.detail.surface, 'sphere');
    const named = (hard.detail.alternatives || []).map((a) => a.surface);
    assert.ok(named.indexOf('ellipsoid') >= 0, 'the ground was not named: ' + JSON.stringify(named));

    /* and a requirement it CAN meet is answered with the number it always gave */
    const bare = await ops.run({ op: 'measure', inputs: [rec.id], params: { what: 'area', unit: 'km' } });
    const loose = await ops.run({ op: 'measure', inputs: [rec.id], params: { what: 'area', unit: 'km', tolerance: 0.5 } });
    assert.equal(loose.ok, true, 'a generous tolerance refused anyway: ' + JSON.stringify(loose.why || loose));
    assert.equal(rows(data, loose)[0].properties._areaKm2, rows(data, bare)[0].properties._areaKm2,
      'stating a tolerance moved the value');
  });

  /* ══ ④ 述べなければ、1 ビットも変わらない ══════════════════════════════════════════════════ */

  test('R783 ④ a call that states no tolerance and no surface is unchanged, to the bit', async () => {
    const { data, crs, ops } = await boot();
    const rec = areaBox(data);

    /* the default: the geodesic answer this layer has always given, which is its OWN arithmetic */
    const bare = await ops.run({ op: 'measure', inputs: [rec.id], params: { what: 'area', unit: 'km' } });
    assert.equal(bare.ok, true, 'the default measure refused: ' + JSON.stringify(bare.why || bare));
    assert.equal(rows(data, bare)[0].properties._areaKm2, ops.areaKm2(SQUARE), 'the geodesic default moved');
    assert.equal(bare.stats.surface, 'sphere');
    assert.equal(bare.stats.plane, 'geodesic');
    assert.equal(bare.stats.fit, null, 'a fit was invented for a run with no plane in it');
    assert.deepEqual(Object.keys(rows(data, bare)[0].properties), ['name', '_areaKm2'],
      'a column appeared for a caller who asked for nothing');

    /* on a plane: the value is the kernel's own, untouched, and no certificate is attached to the row */
    const P = crs.projection('EPSG:3857');
    const onPlane = await ops.run({ op: 'measure', inputs: [rec.id], params: { what: 'area', crs: 'EPSG:3857', unit: 'km' } });
    assert.equal(rows(data, onPlane)[0].properties._areaKm2, crs.areaOn(P, SQUARE, { unit: 'km2' }).value,
      'the plane measurement moved');
    assert.deepEqual(Object.keys(rows(data, onPlane)[0].properties), ['name', '_areaKm2', '_areaKm2ScaleMin', '_areaKm2ScaleMax'],
      'the row gained a column that was not asked for');
    /* the fit's existing fields are still the ones assess() measured */
    const a = crs.assess(P, featuresOf(data, rec));
    assert.equal(onPlane.stats.fit.outside, a.outside);
    assert.equal(onPlane.stats.fit.of, a.total);
    assert.deepEqual(onPlane.stats.fit.areaScale, a.areaScale);
    assert.equal(onPlane.stats.tolerance, undefined, 'a tolerance was reported for a caller who stated none');
  });

  /* ══ ⑤ 面そのものを選べる — 地面が op から届く ═════════════════════════════════════════════ */

  test('R783 ⑤ the ellipsoid can be named from the op, and its answer IS areaOnGround / lengthOnGround', async () => {
    const { data, crs, ops } = await boot();
    const aRec = areaBox(data), lRec = lineBox(data);

    const area = await ops.run({ op: 'measure', inputs: [aRec.id], params: { what: 'area', surface: 'ellipsoid', unit: 'km' } });
    assert.equal(area.ok, true, 'the ground cannot be asked for: ' + JSON.stringify(area.why || area));
    assert.equal(area.stats.surface, 'ellipsoid');
    assert.equal(rows(data, area)[0].properties._areaKm2, crs.areaOnGround(SQUARE, { unit: 'km2' }).value,
      'the op walked its own arithmetic instead of the kernel ground door');
    /* …and it is a DIFFERENT number from the sphere, or the choice would be decoration */
    const sph = await ops.run({ op: 'measure', inputs: [aRec.id], params: { what: 'area', unit: 'km' } });
    assert.notEqual(rows(data, area)[0].properties._areaKm2, rows(data, sph)[0].properties._areaKm2,
      'the ellipsoid and the sphere answered identically — one of them is not being used');

    const len = await ops.run({ op: 'measure', inputs: [lRec.id], params: { what: 'length', surface: 'ellipsoid', unit: 'km' } });
    assert.equal(len.ok, true, 'a length on the ground was refused: ' + JSON.stringify(len.why || len));
    assert.equal(rows(data, len)[0].properties._lengthKm, crs.lengthOnGround(LINE, { unit: 'km' }).value);

    /* the ground has no plane in it, so naming both is a mistake in the call rather than a silent choice */
    const both = await ops.run({ op: 'measure', inputs: [aRec.id], params: { what: 'area', surface: 'ellipsoid', crs: 'EPSG:3857' } });
    assert.equal(both.ok, false, 'a plane was accepted beside a surface that has none');
    assert.equal(both.why, 'bad-param');

    /* and 'stated-plane' without a plane is the same kind of mistake, named on the parameter that is missing */
    const noPlane = await ops.run({ op: 'measure', inputs: [aRec.id], params: { what: 'area', surface: 'stated-plane' } });
    assert.equal(noPlane.ok, false, 'a plane surface was measured with no plane');
    assert.equal(noPlane.detail.param, 'crs');

    const unknown = await ops.run({ op: 'measure', inputs: [aRec.id], params: { what: 'area', surface: 'degree-grid' } });
    assert.equal(unknown.ok, false, 'measure accepted a surface it does not measure on');
    assert.equal(unknown.detail.param, 'surface');
    assert.ok(unknown.detail.values.indexOf('ellipsoid') >= 0, 'the refusal does not say what CAN be named');
  });

  /* ══ ⑥ 語彙は導出されている — 写しではない ════════════════════════════════════════════════ */

  test('R783 ⑥ the surface vocabulary is the crs kernel names unioned with this layer own four', async () => {
    const { crs, ops } = await boot();
    const vocab = ops.surfaces();
    const measurable = crs.surfaces()
      .filter((s) => s.measures.indexOf('area') >= 0 && s.measures.indexOf('length') >= 0)
      .map((s) => s.name);
    assert.ok(measurable.length >= 3, 'the kernel publishes fewer surfaces than it measures on');
    for (const n of measurable) {
      assert.ok(vocab.indexOf(n) >= 0, 'a surface the kernel can measure on is missing from the vocabulary: ' + n);
    }
    const decl = ops.op('measure').surface;
    for (const n of measurable) {
      assert.ok(decl.indexOf(n) >= 0, 'measure does not declare the surface it can compute on: ' + n);
    }
    assert.deepEqual(ops.ops().find((d) => d.id === 'measure').surface, decl,
      'the catalogue and the single declaration disagree about the surfaces');
    const p = ops.op('measure').params.find((x) => x.name === 'surface');
    assert.ok(p, 'the surface cannot be stated at all');
    assert.equal(p.required, false, 'the surface became required — every old recipe would refuse');

    /* ⚠ 答えが変わるなら版が上がる（scripts/gis-kernel-versions.mjs が読み手）: a recipe that states a
       tolerance replays to a refusal where ops-7 produced a number. */
    /* ⚠ (#R819) THE VERSION IS READ FROM THE LEDGER, NOT WRITTEN HERE. This line held the literal
       'ops-8' and failed the first time a later round raised the kernel for its own honest reason —
       a test that copies a number becomes a second owner of it, and the copy is always the one that
       is wrong. scripts/gis-kernel-versions.mjs is the READER of these versions and the keeper of the
       hash beside them, so it is what this asks. The fact being measured is unchanged: the kernel and
       the ledger agree about which engine computed an answer. */
    const { KERNELS } = await import(new URL('../scripts/gis-kernel-versions.mjs', import.meta.url));
    assert.equal(ops.version(), KERNELS['js/gis-ops.js'].version,
      'the ops kernel and scripts/gis-kernel-versions.mjs disagree about which version computed an answer');
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R764 · sphere vs ellipsoid distance error   (was tests/r764-gis-error-domain-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R764 · 球面近似は、どこまでなら安心して使えるのか — 推測ではなく実測で
 * ----------------------------------------------------------------------------
 *  ⚠ THIS FILE DOES NOT CLAIM THE NUMBERS ARE WRONG. `js/gis-geometry.js` measures on a sphere of
 *  6371.0088 km and says so — docs/GIS-CORE.md §2.4 names the surface for every op, and nothing here
 *  is hidden. What was missing is the SIZE of the difference: 「どの緯度で、どの距離で、何 % ずれるのか」
 *  was never measured, so a reader deciding whether IntMap's 500 km buffer is good enough for their
 *  purpose had nothing to decide with, and neither did the next round deciding whether to pay for an
 *  ellipsoid.
 *
 *  ⚠⚠ THE REFERENCE SITS OUTSIDE THE THING MEASURED. Vincenty's inverse solution on WGS-84 is
 *  implemented here, in this file, from the published formulation — not imported from the kernel and
 *  not derived from it. A reference computed by the code under test measures nothing
 *  ([[intmap-prefilter-erred-inward-under-a-comment-saying-outward]]: the comparison has to be able
 *  to disagree). ⚠ AND THE TWO ARE ASKED THE SAME QUESTION: both answer 「この 2 点の間の最短距離」,
 *  so a difference between them is the figure of the Earth and nothing else.
 *
 *  ⚠ WHAT THE ENVELOPE IS FOR. The bound below is not a target anybody optimised towards — it is the
 *  observed spread of the sphere against the ellipsoid, which is a property of the two figures and
 *  not of this app. It is asserted so that a future change which quietly swaps the radius, the
 *  formula or the units is caught, and so that the range is written down where a reader can find it
 *  (docs/GIS-CORE.md §2.4).
 * ==========================================================================*/
describe('§ #R764 · sphere vs ellipsoid distance error', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  async function boot() {
    const w = {};
    globalThis.window = w;
    new Function('window', read('js/geodesy.js'))(w);
    const { makeGisGeometry } = await import('../js/gis-geometry.js');
    const geometry = makeGisGeometry();
    w.IntMapGisGeometry = geometry;
    await geometry.ready();
    return { w, geometry };
  }

  /* ── the reference: Vincenty inverse on WGS-84, written here from the published formulation ──────
     a = 6378137, f = 1/298.257223563. Returns km, or null where the iteration does not converge
     (near-antipodal pairs — a known limitation of this formulation, and the reason the cases below
     stop short of antipodal rather than the reason a result is accepted). */
  const WGS84_A = 6378137, WGS84_F = 1 / 298.257223563;
  function vincentyKm(a, b) {
    const f = WGS84_F, A = WGS84_A, B = A * (1 - f);
    const L = (b[0] - a[0]) * Math.PI / 180;
    const U1 = Math.atan((1 - f) * Math.tan(a[1] * Math.PI / 180));
    const U2 = Math.atan((1 - f) * Math.tan(b[1] * Math.PI / 180));
    const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
    let lam = L, lamP, it = 0, sLam, cLam, sSig, cSig, sig, sAl, c2Al, c2SigM, C;
    do {
      sLam = Math.sin(lam); cLam = Math.cos(lam);
      const t1 = cU2 * sLam, t2 = cU1 * sU2 - sU1 * cU2 * cLam;
      sSig = Math.sqrt(t1 * t1 + t2 * t2);
      if (sSig === 0) return 0;
      cSig = sU1 * sU2 + cU1 * cU2 * cLam;
      sig = Math.atan2(sSig, cSig);
      sAl = cU1 * cU2 * sLam / sSig;
      c2Al = 1 - sAl * sAl;
      c2SigM = c2Al === 0 ? 0 : cSig - 2 * sU1 * sU2 / c2Al;
      C = f / 16 * c2Al * (4 + f * (4 - 3 * c2Al));
      lamP = lam;
      lam = L + (1 - C) * f * sAl * (sig + C * sSig * (c2SigM + C * cSig * (-1 + 2 * c2SigM * c2SigM)));
    } while (Math.abs(lam - lamP) > 1e-12 && ++it < 200);
    if (it >= 200) return null;
    const u2 = c2Al * (A * A - B * B) / (B * B);
    const Acoef = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
    const Bcoef = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
    const dSig = Bcoef * sSig * (c2SigM + Bcoef / 4 * (cSig * (-1 + 2 * c2SigM * c2SigM)
      - Bcoef / 6 * c2SigM * (-3 + 4 * sSig * sSig) * (-3 + 4 * c2SigM * c2SigM)));
    return B * Acoef * (sig - dSig) / 1000;
  }

  /* A destination on the sphere, used only to BUILD the cases — the pairs have to be at a known
     separation and bearing, and building them with the same haversine that is being measured would
     make the case set a function of the answer. Great-circle direct formula, plain trigonometry. */
  function destOnSphere(lng, lat, bearingDeg, km) {
    const R = 6371.0088, d = km / R;
    const br = bearingDeg * Math.PI / 180, la = lat * Math.PI / 180, lo = lng * Math.PI / 180;
    const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(br));
    const lo2 = lo + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
    return [((lo2 * 180 / Math.PI + 540) % 360) - 180, la2 * 180 / Math.PI];
  }

  const LATS = [0, 15, 30, 45, 60, 75, 85];
  const SPANS = [1, 10, 100, 500, 1000, 5000];
  const BEARINGS = [0, 45, 90, 135];

  function sweep(distanceKm) {
    const rows = [];
    for (const lat of LATS) {
      for (const span of SPANS) {
        let worst = 0, worstCase = null;
        for (const br of BEARINGS) {
          const a = [0, lat], b = destOnSphere(0, lat, br, span);
          if (Math.abs(b[1]) > 89.5) continue;          /* the pole is its own subject; §2.4 refuses world-wrapping rings */
          const ref = vincentyKm(a, b);
          if (ref == null || !(ref > 0)) continue;
          const got = distanceKm(a, b);
          assert.ok(typeof got === 'number' && isFinite(got), 'kernel returned no distance at lat ' + lat);
          const relPct = Math.abs(got - ref) / ref * 100;
          if (relPct > worst) { worst = relPct; worstCase = { lat, span, br, got, ref }; }
        }
        if (worstCase) rows.push({ lat, span, worstPct: worst, c: worstCase });
      }
    }
    return rows;
  }

  /* ══ ① どれだけずれるのか ═══════════════════════════════════════════════════════════════════ */

  test('#R764 ① 球面の距離と楕円体の距離の差は、緯度と距離を通して 0.6 % を超えない', async () => {
    const { geometry } = await boot();
    const rows = sweep((a, b) => geometry.distanceKm({ type: 'Point', coordinates: a }, { type: 'Point', coordinates: b }));
    assert.ok(rows.length >= 30, '掃引が組み立てられていない: ' + rows.length);
    let worst = rows[0];
    for (const r of rows) if (r.worstPct > worst.worstPct) worst = r;
    /* ⚠ 0.6 % は誰かが目標にした数ではない。球と WGS-84 楕円体の形の差そのもので、
       このアプリの実装を変えても（半径・式・単位を取り違えない限り）動かない。 */
    assert.ok(worst.worstPct < 0.6,
      '球面近似の誤差が想定の範囲を超えた（半径・式・単位のどれかが動いた可能性）: '
      + worst.worstPct.toFixed(4) + ' % at lat ' + worst.c.lat + ', ' + worst.c.span + ' km');
    /* そして「ゼロではない」ことも測る——誤差ゼロが出たなら、参照が実装と同じものになっている */
    assert.ok(worst.worstPct > 0.01,
      '参照が実装と同じものになっている疑い（差が小さすぎる）: ' + worst.worstPct);
  });

  /* ⚠⚠ THIS TEST SAYS THE OPPOSITE OF WHAT IT SAID WHEN IT WAS FIRST WRITTEN, and the measurement is
     why. The guess was 「相対誤差は距離に依らない」. Swept, it is not: at the equator the worst case
     runs 0.561 % at 1 km and 0.378 % at 5,000 km, because a 5,000 km path AVERAGES over latitudes it
     passes through instead of staying where it started. What IS constant is the error at a given
     latitude AND BEARING for spans up to about 1,000 km — the sphere's error is set by WHERE you are
     and WHICH WAY you go, and only long paths smear it. The claim was corrected to the data rather
     than the envelope widened until the claim survived. */
  test('#R764 ① 1,000 km までなら、相対誤差は距離ではなく「どこで・どちら向きに」で決まる', async () => {
    const { geometry } = await boot();
    const d = (a, b) => geometry.distanceKm({ type: 'Point', coordinates: a }, { type: 'Point', coordinates: b });
    let worstSpread = 0, worstAt = null;
    for (const lat of LATS) {
      for (const br of BEARINGS) {
        const pcts = [];
        for (const span of [1, 10, 100, 500, 1000]) {
          const a = [0, lat], b = destOnSphere(0, lat, br, span);
          if (Math.abs(b[1]) > 89.5) continue;
          const ref = vincentyKm(a, b);
          if (ref == null || !(ref > 0)) continue;
          pcts.push(Math.abs(d(a, b) - ref) / ref * 100);
        }
        if (pcts.length < 2) continue;
        const spread = Math.max.apply(null, pcts) - Math.min.apply(null, pcts);
        if (spread > worstSpread) { worstSpread = spread; worstAt = { lat, br }; }
      }
    }
    /* 実測の最大の広がりは 0.1 ポイント未満（緯度 60 の北向きで約 0.06）。 */
    assert.ok(worstSpread < 0.1,
      '同じ緯度・同じ向きで、距離によって相対誤差が動いている: ' + worstSpread.toFixed(4)
      + ' ポイント at lat ' + (worstAt && worstAt.lat) + ', bearing ' + (worstAt && worstAt.br));
  });

  test('#R764 ① 5,000 km の経路では、その一定性が崩れる — 測ったことだけを述べる', async () => {
    const { geometry } = await boot();
    const d = (a, b) => geometry.distanceKm({ type: 'Point', coordinates: a }, { type: 'Point', coordinates: b });
    /* 赤道を北へ: 1 km で 0.561 %、5,000 km で 0.378 %。長い経路は通過する緯度を平均するので、
       「その場所の誤差」ではなくなる。⚠ これは近似が悪化したのではなく、別の量になったということ。 */
    const near = (span) => {
      const a = [0, 0], b = destOnSphere(0, 0, 0, span);
      const ref = vincentyKm(a, b);
      return Math.abs(d(a, b) - ref) / ref * 100;
    };
    const short = near(1), long = near(5000);
    assert.ok(short > 0.5 && short < 0.6, '赤道・北向き 1 km の実測が動いた: ' + short.toFixed(4));
    assert.ok(long < short - 0.1,
      '長い経路で誤差が平均されていない（この性質が失われたなら、測り直して文書を直すこと）: '
      + short.toFixed(4) + ' → ' + long.toFixed(4));
  });

  test('#R764 ① 都市の規模（10 km）では、ずれは 100 m を下回る', async () => {
    const { geometry } = await boot();
    let worstM = 0;
    for (const lat of LATS) {
      for (const br of BEARINGS) {
        const a = [0, lat], b = destOnSphere(0, lat, br, 10);
        const ref = vincentyKm(a, b);
        if (ref == null) continue;
        const got = geometry.distanceKm({ type: 'Point', coordinates: a }, { type: 'Point', coordinates: b });
        worstM = Math.max(worstM, Math.abs(got - ref) * 1000);
      }
    }
    /* 「この距離で使ってよいか」に、読者が答えられる形の数 */
    assert.ok(worstM < 100, '10 km で ' + worstM.toFixed(1) + ' m ずれている');
  });

  /* ══ ② 述べていることと、していることが合っているか ═══════════════════════════════════════ */

  test('#R764 ② 距離は 1 つの半径から出ている — 2 つ目の地球を持たない', async () => {
    const { w } = await boot();
    const R = w.IntMapGeodesy && w.IntMapGeodesy._R_EARTH_KM;
    assert.equal(typeof R, 'number');
    /* 実装が持つ半径はこの 1 つで、上の掃引の参照（WGS-84 の a と f）とは別物であること。
       同じ数だったなら、この file は何も測っていない。 */
    assert.notEqual(R * 1000, WGS84_A);
    const src = read('js/gis-geometry.js');
    assert.ok(!/6371/.test(codeOnly(src)),
      'js/gis-geometry.js が半径を自分で書いている（js/geodesy.js の 1 か所から来るはず）');
  });

  test('#R764 ② 文書が、測った範囲をそのまま述べている', () => {
    /* 綴りのまま: 主張の対象が文書・註の文面そのもの。 */
    const doc = read('docs/GIS-CORE.md');
    assert.ok(/0\.6\s*%/.test(doc), 'docs/GIS-CORE.md に実測した誤差の範囲が書かれていない');
    assert.ok(/Vincenty/i.test(doc), '何と比べて測ったのかが文書に無い');
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R756 · every op states its surface   (was tests/r756-gis-surface-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R756 · どの面の上で計算した数なのか、読み手に届いているか
 * ----------------------------------------------------------------------------
 *  An outside review of R752 said the ops do not state, per op, which surface they compute on, what
 *  range they are valid over, and what error they tolerate. Two of those three were true and are
 *  fixed here; the third is refused on purpose and the refusal is measured below.
 *
 *  ⚠ THE INVARIANTS ARE WRITTEN AS THE DEFECT, NOT AS THE FIX
 *  ([[intmap-restate-the-defect-not-the-fix]]):
 *
 *    ⑥ 「面積」 by the spherical excess and 「面積」 on an unwrapped lng/lat plane are different
 *       numbers. A reader combining two ops had NO WAY TO SEE that they disagree, because the
 *       surface lived only inside whichever kernel the op happened to call.
 *    ⑦ js/gis-crs.js has measured 「その面の外にどれだけ出ているか」 since #R752 and `measure` never
 *       asked. A UTM zone measured two zones away answered with a number and no sign at all.
 *    ⑧ js/gis-layers.js records whether what arrived is all of it, a part, or a sample — and the
 *       Atlas catalogue row published only `origin`. A planner that cannot see the difference says
 *       「世界で最も◯◯な国」 about whatever the camera was pointed at.
 * ==========================================================================*/
describe('§ #R756 · every op states its surface', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  async function boot() {
    const w = installWindow();
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisGeometry } = await import('../js/gis-geometry.js');
    const { makeGisCrs } = await import('../js/gis-crs.js');
    const { makeGisOps } = await import('../js/gis-ops.js');
    const data = makeGisDatasets();
    const geometry = makeGisGeometry();
    const crs = makeGisCrs();
    const ops = makeGisOps();
    w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisCrs = crs; w.IntMapGisOps = ops;
    await geometry.ready();
    if (crs && typeof crs.ready === 'function') await crs.ready();
    return { w, data, geometry, crs, ops };
  }

  const feat = (g, p) => ({ type: 'Feature', properties: p || {}, geometry: g });
  const square = (lng, lat, d) => feat(
    { type: 'Polygon', coordinates: [[[lng, lat], [lng + d, lat], [lng + d, lat + d], [lng, lat + d], [lng, lat]]] },
    { name: 'sq' });

  /* ══ ⑥ どの op も、自分が計算した面を述べる ═════════════════════════════════════════════ */

  test('R756 ⑥ every op states the surface it computes on, from one closed vocabulary', async () => {
    const { ops } = await boot();
    const all = ops.ops();
    assert.ok(all.length >= 24, 'the catalogue shrank: ' + all.length);

    const vocab = ops.surfaces();
    assert.ok(Array.isArray(vocab) && vocab.length > 0, 'there is no vocabulary to draw from');

    for (const d of all) {
      /* ⚠ 欄が在ることと答えが在ることは別（[[intmap-data-must-not-claim-an-author-it-lacks]]）。
         An op with no geometry in it declares the EMPTY list — that is a statement, not a blank. */
      assert.ok(Array.isArray(d.surface),
        'op ' + d.id + ' does not say which surface it computes on');
      for (const s of d.surface) {
        assert.ok(vocab.indexOf(s) >= 0,
          'op ' + d.id + ' names a surface nothing implements: ' + JSON.stringify(s));
      }
    }

    /* ⚠ 「面を持たない op が 1 つも無い」も「全部が面を持つ」も、どちらも間違った宣言で通る。
       The two kinds must BOTH be present, or the declaration is decoration. */
    const withSurface = all.filter((d) => d.surface.length > 0).map((d) => d.id);
    const without = all.filter((d) => d.surface.length === 0).map((d) => d.id);
    assert.ok(withSurface.length > 0, 'no op computes on any surface — the declaration is not being filled in');
    assert.ok(without.length > 0, 'every op claims a surface, including the attribute-only ones');

    /* The two numbers the reader can accidentally combine: one op measures on the sphere, another
       computes topology on the unwrapped degree plane. Both must be findable by asking. */
    const byId = Object.fromEntries(all.map((d) => [d.id, d.surface]));
    assert.ok(byId.measure.indexOf('sphere') >= 0, 'measure no longer states its geodesic default');
    assert.ok(byId.union.indexOf('degree-plane') >= 0, 'union no longer states the plane its clipper works on');
    assert.deepEqual(byId.compute, [], 'an attribute expression is claiming a surface');
  });

  /* ══ ⑦ 面の外へ出たことを、読み手に述べる ══════════════════════════════════════════════ */

  test('R756 ⑦ measuring on a plane reports how far the data left that plane, instead of answering silently', async () => {
    const { data, ops } = await boot();

    /* UTM zone 54N covers 138°E–144°E. The fixture is in Portugal — about 140 degrees away, which is
       not a borderline case that a tolerance could argue about. */
    const far = data.add({ title: 'far', features: [square(-9, 38, 1)] });
    const res = await ops.run({
      op: 'measure', inputs: [far.id],
      params: { what: 'area', crs: 'EPSG:32654', unit: 'km' },
    });
    assert.equal(res.ok, true, 'measure refused: ' + JSON.stringify(res.why || res));

    /* ⚠ THE DEFECT: this was undefined — the op answered with a number and said nothing at all. */
    assert.ok(res.stats.fit, 'measure still does not report the fit of the plane it was given');
    assert.ok(res.stats.fit.outside > 0,
      'every position is 140° outside the zone and the fit reports ' + res.stats.fit.outside + ' outside');
    assert.equal(res.stats.fit.of, res.stats.total * 5, 'the fit did not walk the data it measured');
    assert.ok(res.stats.fit.beyond && res.stats.fit.beyond.west > 100,
      'the overshoot is reported as ' + JSON.stringify(res.stats.fit.beyond) + ' — it should be more than 100°');
    assert.ok(Array.isArray(res.stats.fit.sample), 'the first offending position is not shown');
    assert.equal(res.stats.surface, 'stated-plane', 'the surface of the answer is not stated');

    /* ⚠ AND THE OTHER DIRECTION. A check that only ever sees 「outside > 0」 passes over an
       implementation that reports every measurement as outside. */
    const near = data.add({ title: 'near', features: [square(139, 35, 1)] });
    const ok = await ops.run({
      op: 'measure', inputs: [near.id],
      params: { what: 'area', crs: 'EPSG:32654', unit: 'km' },
    });
    assert.equal(ok.ok, true, 'measure refused: ' + JSON.stringify(ok.why || ok));
    assert.equal(ok.stats.fit.outside, 0,
      'a square inside zone 54N is reported as ' + ok.stats.fit.outside + ' positions outside it');

    /* ⚠ IT IS REPORTED, NOT ENFORCED. The reader named the plane; refusing here would be a judgement
       this layer is not entitled to make, and a check that demanded a refusal would install one. */
    const col = Object.keys(res.dataset.features()[0].properties).find((k) => /^_area/.test(k));
    assert.ok(res.dataset.features()[0].properties[col] > 0,
      'the measurement was withheld — the plane being a poor fit is a caveat, not a refusal');

    /* No plane named: the geodesic answer, and no fit to report about a plane nobody chose. */
    const geo = await ops.run({ op: 'measure', inputs: [near.id], params: { what: 'area', unit: 'km' } });
    assert.equal(geo.ok, true, 'geodesic measure refused: ' + JSON.stringify(geo.why || geo));
    assert.equal(geo.stats.surface, 'sphere', 'the geodesic default no longer names its surface');
    assert.equal(geo.stats.fit, null, 'a fit is being reported for a plane the reader never named');
  });

  /* ══ ⑧ 「これは世界についての答えか」が planner に届く ═════════════════════════════════ */

  test('R756 ⑧ the catalogue row carries the acquisition’s own completeness verdict, and invents none', async () => {
    const { data, ops } = await boot();
    const { makeGisAtlas } = await import('../js/gis-atlas.js');
    const atlas = makeGisAtlas({ data: data, ops: ops, layers: null, draw: () => ({ ok: true }) });

    const partial = data.add({
      title: 'partial', features: [square(0, 0, 1)],
      provenance: { kind: 'layer', coverage: { completeness: 'partial', reason: 'indistinguishable-from-view', count: 12 } },
    });
    const plain = data.add({ title: 'plain', features: [square(2, 2, 1)] });

    const rows = atlas.catalogue ? atlas.catalogue() : null;
    const list = Array.isArray(rows) ? rows : (rows && rows.datasets) || null;
    assert.ok(Array.isArray(list), 'the catalogue no longer returns dataset rows: ' + JSON.stringify(rows).slice(0, 200));

    const rowOf = (id) => list.find((r) => r && r.id === id);
    const p = rowOf(partial.id);
    assert.ok(p, 'the dataset is not in the catalogue at all');
    /* ⚠ THE DEFECT: this row published only `origin`, so 「一部です」 never reached the planner. */
    assert.ok(p.coverage, 'the row does not carry the coverage the acquisition recorded');
    assert.equal(p.coverage.completeness, 'partial');
    /* `completeness` without `reason` folds 「訊けなかった」 and 「一部しか無い」 into one word. */
    assert.equal(p.coverage.reason, 'indistinguishable-from-view');

    /* ⚠ AND THE OTHER DIRECTION: a record that never measured its coverage must not acquire one here. */
    const q = rowOf(plain.id);
    assert.ok(q, 'the second dataset is not in the catalogue');
    assert.equal(q.coverage, undefined,
      'a row with no measured coverage is claiming one: ' + JSON.stringify(q.coverage));
  });

  ISOLATED.built();
});
