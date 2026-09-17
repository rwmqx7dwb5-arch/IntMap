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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function installWindow() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  return w;
}

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
