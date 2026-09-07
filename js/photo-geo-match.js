/* ============================================================================
 *  IntMap · CAMERA MODEL AND SKYLINE MATCHING — globalThis.IntMapPhotoMatch   (#R527)
 * ----------------------------------------------------------------------------
 *  Given a skyline traced on a photograph and a 360 degree terrain horizon computed by
 *  js/photo-geo-terrain.js, decide how well the two agree and at what bearing — and say so in
 *  numbers that mean what they say.
 *
 *  ── THE ONE PROPERTY THE WHOLE SEARCH RESTS ON ──────────────────────────────────────────────────
 *  A pinhole camera at yaw psi sees the direction that the same camera at yaw 0 sees, rotated about
 *  the VERTICAL axis by psi. Rotating about the vertical adds psi to every azimuth and changes no
 *  elevation at all. So the photograph's skyline, expressed as a list of
 *
 *        (azimuth RELATIVE to the optical axis, elevation angle)
 *
 *  is computed ONCE per (field of view, pitch, roll) and is EXACT for every yaw — yaw is a pure
 *  shift along the azimuth axis. That turns «search 360 degrees of bearing» from 720 separate
 *  projections into 720 lookups, and it is why a few thousand candidate points is affordable.
 *
 *  ── PITCH: SOLVED, NOT SEARCHED ─────────────────────────────────────────────────────────────────
 *  Pitch is not a pure shift (it bends azimuths as well as raising elevations), but to first order
 *  it IS a vertical offset, and that first-order part is what dominates. So each (yaw) hypothesis
 *  gets its own offset, found by VOTING: every sampled column j says «for me to fit, the skyline
 *  would have to move by o_j = H(psi + dAz_j) - elev_j». The offset the most columns agree on wins.
 *  ⚠ THE VOTE IS THE ROBUSTNESS. A mean would be dragged by every column where a tree, a roof or a
 *  cloud stands in front of the ridge; a histogram peak simply does not hear them. That is the same
 *  reason the score below is a redescending one — a column that is wrong by 30 degrees contributes
 *  exactly what a column wrong by 3 degrees does, which is nothing.
 *
 *  ── WHAT A SCORE IS AND IS NOT ──────────────────────────────────────────────────────────────────
 *  `score` is the mean of a redescending agreement weight over the columns that could be evaluated.
 *  It is 1 when every column sits on the computed ridge and 0 when none does. IT IS NOT A
 *  PROBABILITY, and nothing in this file converts it into one. A photograph whose true viewpoint is
 *  outside the search rectangle still has a best-scoring candidate inside it — «best» and «right»
 *  are different words — which is why every result also carries the margin over the next DISTINCT
 *  candidate, the fraction of columns that were evaluated at all, and a verdict that is allowed to
 *  be «no candidate matches» (see `verdict`).
 * ==========================================================================*/
(function () {
  'use strict';

  var D2R = Math.PI / 180, R2D = 180 / Math.PI;

  /* ── the camera ─────────────────────────────────────────────────────────────────────────────────
     World axes are east, north, up. yaw is the compass bearing of the optical axis (0 = north,
     90 = east), pitch is positive upward, roll is positive when the camera is rotated clockwise as
     the photographer sees it (so the horizon in the image tilts anticlockwise). */
  function basis(yawDeg, pitchDeg, rollDeg) {
    var y = yawDeg * D2R, p = pitchDeg * D2R, ro = (rollDeg || 0) * D2R;
    var cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p);
    var F = [sy * cp, cy * cp, sp];
    var R0 = [cy, -sy, 0];
    /* U0 = R0 x F — right-handed with (right, up, forward) */
    var U0 = [
      R0[1] * F[2] - R0[2] * F[1],
      R0[2] * F[0] - R0[0] * F[2],
      R0[0] * F[1] - R0[1] * F[0]
    ];
    var cr = Math.cos(ro), sr = Math.sin(ro);
    return {
      F: F,
      R: [R0[0] * cr + U0[0] * sr, R0[1] * cr + U0[1] * sr, R0[2] * cr + U0[2] * sr],
      U: [-R0[0] * sr + U0[0] * cr, -R0[1] * sr + U0[1] * cr, -R0[2] * sr + U0[2] * cr]
    };
  }

  /* focal length in pixels from a horizontal field of view over an image `w` pixels wide */
  function focalFromHFov(w, hfovDeg) { return (w / 2) / Math.tan(hfovDeg / 2 * D2R); }
  function hFovFromFocal(w, f) { return 2 * Math.atan((w / 2) / f) * R2D; }

  /* image pixel -> world direction, as (azimuth, elevation) in degrees */
  function pixelToDir(u, v, cam, f, cx, cy) {
    var s = u - cx, t = cy - v;
    var dE = s * cam.R[0] + t * cam.U[0] + f * cam.F[0];
    var dN = s * cam.R[1] + t * cam.U[1] + f * cam.F[1];
    var dU = s * cam.R[2] + t * cam.U[2] + f * cam.F[2];
    var len = Math.sqrt(dE * dE + dN * dN + dU * dU) || 1;
    return { az: (Math.atan2(dE, dN) * R2D + 360) % 360, elev: Math.asin(dU / len) * R2D };
  }

  /* world direction -> image pixel. `front` is false when the direction is behind the camera, in
     which case u and v are meaningless and must not be drawn. */
  function dirToPixel(azDeg, elevDeg, cam, f, cx, cy) {
    var a = azDeg * D2R, e = elevDeg * D2R, ce = Math.cos(e);
    var d = [Math.sin(a) * ce, Math.cos(a) * ce, Math.sin(e)];
    var z = d[0] * cam.F[0] + d[1] * cam.F[1] + d[2] * cam.F[2];
    if (!(z > 1e-9)) return { u: 0, v: 0, front: false };
    var x = d[0] * cam.R[0] + d[1] * cam.R[1] + d[2] * cam.R[2];
    var y = d[0] * cam.U[0] + d[1] * cam.U[1] + d[2] * cam.U[2];
    return { u: cx + f * x / z, v: cy - f * y / z, front: true };
  }

  /* ── the photograph, as angles ──────────────────────────────────────────────────────────────────
     `sky` is one row index per column (the traced skyline) and `use` says which columns may be
     scored — a column hidden by a tree, a roof or a cloud is EXCLUDED here rather than being scored
     and forgiven later, because a column that cannot be evaluated is not evidence either way.
     The returned curve is at yaw 0; see the header for why that is exact for every yaw. */
  function photoCurve(sky, use, w, h, opt) {
    var o = opt || {};
    var hfov = o.hfovDeg, pitch = o.pitchDeg || 0, roll = o.rollDeg || 0;
    var cx = o.cx == null ? w / 2 : o.cx, cy = o.cy == null ? h / 2 : o.cy;
    var f = o.focalPx || focalFromHFov(w, hfov);
    var maxN = o.samples || 96;
    var cam = basis(0, pitch, roll);
    var cols = [];
    for (var u = 0; u < w; u++) if (use[u] && sky[u] >= 0) cols.push(u);
    if (!cols.length) return null;
    var stride = Math.max(1, Math.floor(cols.length / maxN));
    var dAz = [], elev = [], col = [];
    for (var i = 0; i < cols.length; i += stride) {
      var c = cols[i];
      var d = pixelToDir(c + 0.5, sky[c] + 0.5, cam, f, cx, cy);
      /* at yaw 0 the optical axis points north, so azimuth IS the offset from the axis; fold it to
         (-180, 180] so a curve that straddles north does not tear */
      var a = d.az > 180 ? d.az - 360 : d.az;
      dAz.push(a); elev.push(d.elev); col.push(c);
    }
    /* ⚠ EACH SAMPLED COLUMN STANDS FOR A SLICE OF SKY, AND THE SLICES ARE NOT EQUAL. A rectilinear
       lens spreads the edges of the frame over more degrees per pixel than the centre, and — far
       more importantly — a 24 degree hypothesis gives every column a quarter of the azimuth a 90
       degree one does. Carrying the width lets the score below be stated in DEGREES OF SKYLINE
       EXPLAINED, which is the only currency in which two different fields of view can be compared.
       See the note on scoreAt for what went wrong when they were compared without it. */
    var span = new Float64Array(dAz.length);
    for (var q = 0; q < dAz.length; q++) {
      var lo = q > 0 ? (dAz[q] - dAz[q - 1]) / 2 : 0;
      var hi = q < dAz.length - 1 ? (dAz[q + 1] - dAz[q]) / 2 : 0;
      if (q === 0) lo = hi; if (q === dAz.length - 1) hi = lo;
      span[q] = Math.abs(lo) + Math.abs(hi);
    }
    var total = 0; for (var q2 = 0; q2 < span.length; q2++) total += span[q2];
    /* the relief the photograph actually carries — a skyline that is almost a straight line is weak
       evidence no matter how well it fits, and the verdict needs to know that */
    var mn = Infinity, mx = -Infinity;
    for (var q3 = 0; q3 < elev.length; q3++) { if (elev[q3] < mn) mn = elev[q3]; if (elev[q3] > mx) mx = elev[q3]; }
    return {
      n: dAz.length, dAz: dAz, elev: elev, col: col, span: span,
      spanDeg: total, reliefDeg: mx - mn,
      focalPx: f, hfovDeg: hFovFromFocal(w, f), pitchDeg: pitch, rollDeg: roll,
      cx: cx, cy: cy, w: w, h: h, columnsUsed: cols.length
    };
  }

  /* elevation of the terrain horizon at an arbitrary azimuth, linearly interpolated.
     Returns NaN when either neighbour is unevaluated — an unknown azimuth stays unknown. */
  function horizonAt(H, azDeg) {
    var n = H.nAz, x = (azDeg / 360 * n) % n;
    if (x < 0) x += n;
    var i0 = Math.floor(x), i1 = (i0 + 1) % n, t = x - i0;
    var a = H.elev[i0], b = H.elev[i1];
    if (a !== a || b !== b) return NaN;
    return a + (b - a) * t;
  }

  /* ⚠ THE TOLERANCE IS THE WHOLE DISCRIMINATION. MEASURED: at tau = 1.5 degrees a synthetic
     skyline rendered from a KNOWN point scored 0.984 at that point and 0.983, 0.980, 0.979 at four
     unrelated points 3-6 km away — every candidate in the rectangle was a «perfect» fit, because a
     degree and a half is wider than most of the shape a mountain skyline has. The tolerance must sit
     just above the error the inputs actually carry and no higher:
         DEM, ~30 m at the ranges that matter   ~0.1-0.3 deg of apparent ridge height
         the traced skyline, a few pixels        ~0.2 deg on a 1,000 px photo at 55 deg
     so 0.4 degrees is the honest figure, and it is what separates the right hillside from the one
     next to it. */
  /* The field-of-view ladder the search tries when nothing is known about the lens. Geometric, ratio
     1.3, from a long telephoto to an ultra-wide: every real field of view is within 14% of a rung, and
     REFINE_FOV_BAND lets each rung be polished by more than that, so the ladder has no gaps.
     ⚠ THE RUNG IS A LEASH, NOT A GUESS. MEASURED: letting the refinement move the field of view
     freely walked the TRUE point from 52 degrees down to 47.3 and its agreement from 91% to 73%,
     and the point fell to rank 776 of 2,601 - while the same refinement bounded to its rung put the
     top candidate 0.15 km from the truth. Four coupled parameters against one curve is enough
     freedom to bend a wrong hillside into a right-looking fit; the leash is what stops it. */
  var FOV_LADDER = [18, 23, 30, 39, 51, 67, 87, 105];
  var REFINE_FOV_BAND = 0.22;

  var TAU_DEG = 0.4;          /* the agreement half-width — beyond this a column contributes nothing */
  var VOTE_BIN_DEG = 0.1;     /* offset histogram resolution — finer than tau, or the vote blurs it */
  var VOTE_RANGE_DEG = 15;    /* how much pitch error the vote may absorb, each way */

  /* ── the coarse search over bearing ─────────────────────────────────────────────────────────────
     For each of `nYaw` bearings, vote for the vertical offset the columns agree on, then score the
     fit at that offset. Returns the best bearing for this curve against this horizon. */
  function searchYaw(curve, H, opt) {
    var o = opt || {};
    var nYaw = o.nYaw || H.nAz;
    var tau = o.tauDeg || TAU_DEG;
    var bin = o.voteBinDeg || VOTE_BIN_DEG;
    var range = o.voteRangeDeg || VOTE_RANGE_DEG;
    var nBins = Math.ceil(2 * range / bin) + 1;
    var votes = new Int32Array(nBins);
    var touched = new Int32Array(curve.n);
    var n = curve.n, dAz = curve.dAz, pe = curve.elev;
    var best = null, bgN = 0, bgSum = 0, bgSq = 0;
    for (var k = 0; k < nYaw; k++) {
      var yaw = k * 360 / nYaw;
      /* pass 1 — vote */
      var nt = 0, peak = 0, peakBin = -1;
      for (var j = 0; j < n; j++) {
        var hv = horizonAt(H, yaw + dAz[j]);
        if (hv !== hv) continue;
        var off = hv - pe[j];
        if (off < -range || off > range) continue;
        var b = ((off + range) / bin) | 0;
        var c = ++votes[b];
        touched[nt++] = b;
        if (c > peak) { peak = c; peakBin = b; }
      }
      if (peakBin < 0) { for (var q = 0; q < nt; q++) votes[touched[q]] = 0; continue; }
      /* the peak bin plus its two neighbours, so a vote that lands a hair over a bin edge is not
         thrown away — then the offset is the count-weighted centre of those three */
      var b0 = Math.max(0, peakBin - 1), b1 = Math.min(nBins - 1, peakBin + 1);
      var sw = 0, sx = 0;
      for (var b2 = b0; b2 <= b1; b2++) { sw += votes[b2]; sx += votes[b2] * (b2 * bin - range); }
      var offset = sw > 0 ? sx / sw : (peakBin * bin - range);
      for (var q2 = 0; q2 < nt; q2++) votes[touched[q2]] = 0;
      /* pass 2 — the real, smooth score at that offset */
      var sc = scoreAt(curve, H, yaw, offset, tau);
      /* the background: what this curve scores against this horizon at a bearing chosen by nothing.
         A short or featureless curve fits tolerably at MANY bearings, so its background is high and
         its peak means little; a long, structured one fits at one bearing only. Keeping the running
         mean and mean-square costs two adds per bearing and turns «it fits» into «it fits HERE and
         nowhere else», which is the difference the verdict needs. */
      bgN++; bgSum += sc.explainedDeg; bgSq += sc.explainedDeg * sc.explainedDeg;
      if (!best || sc.explainedDeg > best.explainedDeg) {
        best = { yawDeg: yaw, offsetDeg: offset, explainedDeg: sc.explainedDeg,
          evaluatedDeg: sc.evaluatedDeg, score: sc.score, agreement: sc.agreement,
          inlierFrac: sc.inlierFrac, rmsDeg: sc.rmsDeg, evaluated: sc.evaluated,
          evaluatedFrac: sc.evaluatedFrac,
          /* ⚠ THE OFFSET IS A PITCH, AND ITS SIGN IS + . Raising the camera by one degree raises
             every elevation in the frame by one degree, so if the vote had to ADD `offset` to the
             photograph's elevations to reach the terrain, the camera was pointing `offset` HIGHER
             than the hypothesis assumed. MEASURED with a synthetic skyline whose true pitch was
             +3.0: the vote returned +3.18, and the minus sign here reported -3.18 and drove the
             exact scorer — which has no offset of its own — to a score of exactly zero. */
          pitchDeg: curve.pitchDeg + offset };
      }
    }
    if (best && bgN > 1) {
      var mean = bgSum / bgN;
      var varr = Math.max(0, bgSq / bgN - mean * mean);
      var sd = Math.sqrt(varr);
      best.bgMeanDeg = mean;
      best.bgSdDeg = sd;
      /* how far above chance this bearing stands, in standard deviations of the bearing sweep */
      best.z = sd > 1e-9 ? (best.explainedDeg - mean) / sd : 0;
      best.spanDeg = curve.spanDeg;
      best.reliefDeg = curve.reliefDeg;
    }
    return best;
  }

  /* ── the agreement of one full hypothesis, with the offset already decided ──────────────────────
     ⚠ WHY THIS RETURNS DEGREES AND NOT ONLY A FRACTION. MEASURED, on a skyline rendered from a known
     point with a 52 degree lens and searched with hypotheses of 24 / 32 / 42 / 55 / 70 / 90 degrees:
     EVERY ONE of the top five candidates came back at 24 degrees, the narrowest hypothesis offered,
     and all five were 2-6 km from the truth. Nothing was wrong with the fits — they were genuine.
     The fault was in comparing them. A 24 degree hypothesis folds the whole photograph into 24
     degrees of azimuth, so it asks the terrain a much smaller question, and a smaller question is
     easier to answer well. A mean agreement over columns cannot see that, because it divides the
     evidence away.
     So the ranking quantity is `explainedDeg` — how many DEGREES of skyline this hypothesis accounts
     for within tau. A wrong 24 degree fit can never explain more than 24; a right 52 degree one
     explains about 52; and the two are finally on the same scale. */
  function scoreAt(curve, H, yawDeg, offsetDeg, tauDeg) {
    var tau = tauDeg || TAU_DEG;
    var n = curve.n, dAz = curve.dAz, pe = curve.elev, span = curve.span;
    var sum = 0, evaluated = 0, inliers = 0, sq = 0, expl = 0, evalDeg = 0;
    for (var j = 0; j < n; j++) {
      var hv = horizonAt(H, yawDeg + dAz[j]);
      if (hv !== hv) continue;
      evaluated++; evalDeg += span ? span[j] : 0;
      var r = (pe[j] + offsetDeg) - hv;
      var x = r / tau;
      if (x > -1 && x < 1) { var wgt = 1 - x * x; sum += wgt; inliers++; sq += r * r; if (span) expl += wgt * span[j]; }
    }
    /* ⚠ `score` divides by EVERY sampled column, not by the ones that happened to be evaluable.
       Dividing by `evaluated` would let a candidate that can only answer ten columns out of ninety-six
       outrank one that answers all of them — «I agree with everything I bothered to look at» is not
       a stronger claim, it is a weaker one. `agreement` keeps the other normalisation for reporting. */
    return {
      explainedDeg: expl,
      evaluatedDeg: evalDeg,
      score: n ? sum / n : 0,
      agreement: evaluated ? sum / evaluated : 0,
      inlierFrac: evaluated ? inliers / evaluated : 0,
      rmsDeg: inliers ? Math.sqrt(sq / inliers) : NaN,
      evaluated: evaluated,
      evaluatedFrac: n ? evaluated / n : 0
    };
  }

  /* ── the exact model, for refinement ────────────────────────────────────────────────────────────
     `searchYaw` is exact in yaw and first-order in pitch. Once a candidate is worth the time, drop
     the offset trick entirely: rebuild the curve at the actual pitch and roll and score it directly.
     This is the number the user is finally shown. */
  function scoreExact(sky, use, w, h, H, p) {
    var curve = photoCurve(sky, use, w, h, {
      hfovDeg: p.hfovDeg, focalPx: p.focalPx, pitchDeg: p.pitchDeg, rollDeg: p.rollDeg,
      cx: p.cx, cy: p.cy, samples: p.samples || 96
    });
    if (!curve) return { explainedDeg: 0, evaluatedDeg: 0, score: 0, agreement: 0, inlierFrac: 0, rmsDeg: NaN, evaluated: 0, evaluatedFrac: 0, spanDeg: 0, reliefDeg: 0 };
    var sc = scoreAt(curve, H, p.yawDeg, 0, p.tauDeg);
    sc.spanDeg = curve.spanDeg; sc.reliefDeg = curve.reliefDeg;
    return sc;
  }

  /* Coordinate descent over the four camera unknowns with the position held. Deliberately not a
     general optimiser: the landscape has many shallow local optima and a shrinking-step sweep that
     only ever accepts an improvement is both predictable and cheap. */
  /* Coordinate descent over the four camera unknowns with the POSITION held. Deliberately not a
     general optimiser: the landscape has many shallow local optima and a shrinking-step sweep that
     only ever accepts an improvement is both predictable and cheap.
     ⚠ IT IS RUN AT EVERY CANDIDATE, NOT ONLY THE SHORTLIST, AND THAT IS AFFORDABLE. One evaluation
     rebuilds a 96-point curve and looks up 96 horizon angles; a hundred of them cost about a
     millisecond, against the ~14 ms the candidate's horizon itself cost. Doing it only for a
     shortlist would be a false economy, because it is exactly the parameters this fixes — field of
     view and roll — that decide WHICH candidates reach a shortlist: a 3-degree error in an assumed
     52-degree field of view moves the frame edge by 1.5 degrees, and a 1.5-degree roll moves it by
     0.7, either of which is enough to throw a column off a steep ridge. MEASURED at a known point
     with a coarse grid alone: 32.6 of 52 degrees explained. */
  function refineCamera(sky, use, w, h, H, start, opt) {
    var o = opt || {};
    var cur = {
      yawDeg: start.yawDeg, pitchDeg: start.pitchDeg || 0, rollDeg: start.rollDeg || 0,
      hfovDeg: start.hfovDeg, cx: start.cx == null ? w / 2 : start.cx,
      cy: start.cy == null ? h / 2 : start.cy, samples: o.samples || start.samples || 96,
      tauDeg: o.tauDeg || TAU_DEG
    };
    var best = scoreExact(sky, use, w, h, H, cur);
    var steps = { yawDeg: o.yawStep || 2, pitchDeg: o.pitchStep || 2, rollDeg: o.rollStep || 2, hfovDeg: o.fovStep || 8 };
    var band = o.fovBand == null ? REFINE_FOV_BAND : o.fovBand;
    var lim = {
      yawDeg: [-Infinity, Infinity], pitchDeg: [-60, 60], rollDeg: [-25, 25],
      hfovDeg: [Math.max(o.minFovDeg || 8, cur.hfovDeg * (1 - band)),
                Math.min(o.maxFovDeg || 120, cur.hfovDeg * (1 + band))]
    };
    var keys = ['yawDeg', 'pitchDeg', 'rollDeg', 'hfovDeg'];
    var rounds = o.rounds || 10, minStep = o.minStep || 0.05;
    for (var it = 0; it < rounds; it++) {
      var moved = false;
      for (var ki = 0; ki < keys.length; ki++) {
        var k = keys[ki], st = steps[k];
        if (st < minStep) continue;
        for (var sgn = 0; sgn < 2; sgn++) {
          var trial = Object.assign({}, cur);
          var nv = trial[k] + (sgn ? -st : st);
          if (nv < lim[k][0] || nv > lim[k][1]) continue;
          trial[k] = nv;
          var sc = scoreExact(sky, use, w, h, H, trial);
          /* the same objective the candidates are finally ranked by - see matchOne */
          if (sc.explainedDeg > best.explainedDeg + 1e-9) { cur = trial; best = sc; moved = true; break; }
        }
      }
      if (!moved) for (var kj = 0; kj < keys.length; kj++) steps[keys[kj]] *= 0.5;
    }
    return { params: cur, fit: best };
  }

  /* ── ONE CANDIDATE, ONE HORIZON — the entry point the search calls per grid point ───────────────
     Two stages, and the reason for two is that they fail in opposite ways.
     · A bearing sweep is EXACT in yaw (rotating a camera about the vertical adds a constant to
       every azimuth and changes no elevation), so 360 lookups find the bearing without ever
       rebuilding the curve. But it must ASSUME a field of view, a pitch and a roll.
     · A coordinate descent fixes those three, but only from a starting point close enough to be in
       the right basin — and 360 degrees of bearing is not that.
     So the sweep hands the descent a bearing, and the descent hands back a camera.
     ⚠ THE SWEEP OWN RANKING IS NOT TRUSTED TO PICK THE FIELD OF VIEW. The sweep must assume a
     pitch and a roll it does not know, and a wrong pitch bends azimuths; its ranking across fields
     of view is therefore made on degraded fits. So the top `seeds` assumptions are EACH refined and
     the winner is decided AFTER refinement.

     -- WHAT THE WINNER IS DECIDED BY, AND THE RULES THAT DID NOT WORK ------------------------------
     MEASURED, on a skyline rendered from a known point (true field of view 52 degrees) searched over
     1,445 candidate points at 150 m spacing, comparing seven ranking rules on the very same fits:

         rank by `score`  (mean agreement PER COLUMN)      top candidate 0.15 km from the truth
         rank by `explainedDeg` (agreement PER DEGREE)     top candidate 2.60 km from the truth
         rank by `z` (peak over the bearing sweep)         top candidate 2.84 km
         rank by score x explainedDeg                      top candidate 1.85 km
         rank by `score`, field of view GIVEN as 52        top candidate 0.15 km  <- identical

     ⚠ AND THEN REAL PHOTOGRAPHS REVERSED IT. On the synthetic skyline the correct fit scored 0.99,
     so nothing could outbid it; on a photograph the correct fit does not score anything like that.
     MEASURED at the KNOWN camera position of a Lofoten photograph, with the field of view held at
     its true value, the residuals are small where the trace is right - median 0.18 degrees, upper
     quartile 0.44 - but a fifth of the columns are genuine outliers (foreground roofs, the near
     hillside, a cloud on a ridge), so the correct fit scores 0.58. Meanwhile an 17-degree hypothesis
     at a place 3 km away scores 0.96, because a narrow lens asks the terrain a small question.
     Ranked by `score`, the right answer loses to the wrong one every time - the top candidate came
     back 3.51 km out, and EVERY winner on every test photograph chose the narrowest rung offered.

     Ranked by `explainedDeg` the same two hypotheses read 33 degrees against 16, and the right one
     wins: top candidate 0.40 km from the truth, best of five 0.11 km. So the ranking is degrees of
     skyline explained - agreement multiplied by the sky it was measured over - and the thing that
     makes it safe is the LEASH: `explainedDeg` can be gamed by widening the lens, and it was, until
     REFINE_FOV_BAND stopped the optimiser wandering off its rung.
     ⚠ THE OBJECTIVE THE REFINEMENT MAXIMISES AND THE ONE THE CANDIDATES ARE RANKED BY MUST BE THE
     SAME. They were not, for one round of this work - refine chased `score` and the ranking read
     `explainedDeg` - and the search then spent its effort making each candidate good at a measure
     nobody was reading. */
  function buildCurveSet(sky, use, w, h, fovs, opt) {
    var o = opt || {}, set = [];
    for (var i = 0; i < fovs.length; i++) {
      var c = photoCurve(sky, use, w, h, {
        hfovDeg: fovs[i], pitchDeg: 0, rollDeg: o.rollDeg || 0,
        cx: o.cx, cy: o.cy, samples: o.samples || 96
      });
      if (c) set.push(c);
    }
    return set;
  }

  function matchOne(curveSet, photo, H, opt) {
    var o = opt || {};
    var nYaw = o.nYaw || 360;
    var tau = o.tauDeg || TAU_DEG;
    /* ⚠ EVERY RUNG IS REFINED. The sweep ranks rungs on fits made at a pitch and roll it had to
       assume, so its ordering is not trustworthy enough to discard rungs by; and a rung costs one
       bearing sweep plus about a hundred curve evaluations, which is small beside the horizon they
       are all scored against. */
    var seedsWanted = o.seeds == null ? curveSet.length : o.seeds;
    var seeds = [];
    for (var i = 0; i < curveSet.length; i++) {
      var c0 = curveSet[i];
      var p1 = searchYaw(c0, H, { nYaw: nYaw, tauDeg: tau });
      if (!p1) continue;
      seeds.push({
        yawDeg: p1.yawDeg, pitchDeg: p1.pitchDeg, rollDeg: c0.rollDeg || 0,
        hfovDeg: c0.hfovDeg, cx: c0.cx, cy: c0.cy, samples: c0.n,
        explainedDeg: p1.explainedDeg, bgMeanDeg: p1.bgMeanDeg, bgSdDeg: p1.bgSdDeg
      });
    }
    if (!seeds.length) return null;
    seeds.sort(function (a, b) { return b.explainedDeg - a.explainedDeg; });
    var best = null;
    for (var k = 0; k < Math.min(seedsWanted, seeds.length); k++) {
      var r = refineCamera(photo.sky, photo.use, photo.w, photo.h, H, seeds[k], o.refine);
      var got = r.fit;
      if (!best || got.explainedDeg > best.explainedDeg) {
        best = {
          yawDeg: (r.params.yawDeg % 360 + 360) % 360, pitchDeg: r.params.pitchDeg,
          rollDeg: r.params.rollDeg, hfovDeg: r.params.hfovDeg,
          focalPx: focalFromHFov(photo.w, r.params.hfovDeg),
          explainedDeg: got.explainedDeg, evaluatedDeg: got.evaluatedDeg,
          score: got.score, agreement: got.agreement, inlierFrac: got.inlierFrac,
          rmsDeg: got.rmsDeg, evaluated: got.evaluated, evaluatedFrac: got.evaluatedFrac,
          spanDeg: got.spanDeg, reliefDeg: got.reliefDeg,
          bgMeanDeg: seeds[k].bgMeanDeg, bgSdDeg: seeds[k].bgSdDeg,
          /* how far above a bearing chosen by nothing this one stands, in standard deviations of
             the sweep — a short or featureless curve fits tolerably at MANY bearings and earns a
             low z no matter how well it fits at its best one */
          z: seeds[k].bgSdDeg > 1e-9 ? (got.explainedDeg - seeds[k].bgMeanDeg) / seeds[k].bgSdDeg : 0,
          seedRank: k
        };
      }
    }
    return best;
  }

  /* ── keeping the shortlist honest ───────────────────────────────────────────────────────────────
     Adjacent grid points around one ridge all score alike; a list of the top twenty would be twenty
     views of the same hillside and would hide the genuinely different second answer. So candidates
     are suppressed within `minSeparationM` of an already-kept better one — «different place», not
     «different cell». */
  /* ⚠ THE KEY IS THE ONE matchOne AND refineCamera USE, AND IT IS PASSED IN RATHER THAN ASSUMED.
     This sorted by `score` while the hypothesis for each candidate had been chosen by
     `explainedDeg` — two different questions inside one search. MEASURED in the browser on the
     Lofoten photograph: the candidate ranked first explained 25.4 degrees and sat 385 m from the
     truth, while the one ranked SECOND explained 33.0 and sat 123 m — which is what prompted the
     experiment recorded in js/photo-geo-search.js. Ranking by `explainedDeg` fixed that one
     photograph and made the set as a whole worse, so the key stays `score` and stays PASSED IN,
     because the two callers are asking different questions and should be able to say so. */
  function suppressNearby(cands, minSeparationM, key) {
    var k = key || 'score';
    var kept = [], sep2 = minSeparationM * minSeparationM;
    var sorted = cands.slice().sort(function (a, b) { return b[k] - a[k]; });
    for (var i = 0; i < sorted.length; i++) {
      var c = sorted[i], ok = true;
      for (var j = 0; j < kept.length; j++) {
        var de = c.e - kept[j].e, dn = c.n - kept[j].n;
        if (de * de + dn * dn < sep2) { ok = false; break; }
      }
      if (ok) kept.push(c);
    }
    return kept;
  }

  /* ── the verdict ────────────────────────────────────────────────────────────────────────────────
     The single most important thing this file does is be willing to say no. A search always
     produces a highest-scoring candidate; that is a property of taking a maximum, not evidence that
     the photograph was taken inside the rectangle. Three independent ways to fail:
       · the best fit is simply poor                      -> 'no_match'
       · too little of the traced skyline could be scored -> 'insufficient_evidence'
       · several unrelated places fit about equally well  -> 'ambiguous'
     The thresholds are defaults, they are reported alongside the verdict, and they were chosen on
     the evaluation set in docs/PHOTO-GEOLOCATION.md — not asserted here. */
  /* ⚠ THESE NUMBERS WERE SET ON THE DEVELOPMENT PHOTOGRAPHS AND NOT ON THE EVALUATION SET - see
     docs/PHOTO-GEOLOCATION.md, which keeps the two apart and reports both. A correct fit on a real
     photograph scores far lower than intuition suggests (0.4-0.6, not 0.9), because a fifth of any
     real skyline is foreground; a bar set where the synthetic work suggested would have rejected
     every right answer this feature has ever produced. What actually separates a real match from a
     confident-looking accident is not agreement but EVIDENCE: how many degrees of sky agree, how
     much relief the skyline has, and how far the best bearing stands above an arbitrary one. */
  var VERDICT = {
    minScore: 0.30,
    minInlierFrac: 0.35,
    minEvaluatedFrac: 0.5,
    minExplainedDeg: 20,      /* below this the match rests on too little sky to mean anything */
    minReliefDeg: 2.0,        /* a skyline that is nearly a straight line cannot identify a place */
    minZ: 4                   /* and it must stand above what the same curve scores at a random bearing */
  };
  function verdict(list, opt) {
    var t = Object.assign({}, VERDICT, opt || {});
    if (!list || !list.length) return { code: 'no_match', ok: false, thresholds: t, reason: 'no candidate was scored' };
    var b = list[0];
    if (b.evaluatedFrac < t.minEvaluatedFrac)
      return { code: 'insufficient_evidence', ok: false, thresholds: t,
        reason: 'only ' + Math.round(b.evaluatedFrac * 100) + '% of the traced skyline fell on terrain the search could evaluate' };
    if (b.reliefDeg != null && b.reliefDeg < t.minReliefDeg)
      return { code: 'insufficient_evidence', ok: false, thresholds: t,
        reason: 'the traced skyline rises and falls by only ' + b.reliefDeg.toFixed(1) + ' degrees - too flat to identify a place' };
    if (b.explainedDeg != null && b.explainedDeg < t.minExplainedDeg)
      return { code: 'insufficient_evidence', ok: false, thresholds: t,
        reason: 'the fit accounts for only ' + b.explainedDeg.toFixed(0) + ' degrees of skyline' };
    if (b.score < t.minScore || b.inlierFrac < t.minInlierFrac)
      return { code: 'no_match', ok: false, thresholds: t,
        reason: 'the best fit (score ' + b.score.toFixed(2) + ', inliers ' + Math.round(b.inlierFrac * 100) + '%) is below the agreement this method needs' };
    if (b.z != null && b.z < t.minZ)
      return { code: 'no_match', ok: false, thresholds: t,
        reason: 'the best bearing stands only ' + b.z.toFixed(1) + ' standard deviations above what this skyline scores at an arbitrary bearing' };
    /* ⚠ AMBIGUITY IS REPORTED, NOT SUPPRESSED. Two separate places that fit alike is a real answer
       about the photograph - it means the skyline does not distinguish them - so the margin travels
       with the result and the caller shows the rival, rather than the larger number quietly winning. */
    /* measured on the SAME quantity the list was ordered by, or the margin describes an ordering
       nobody produced */
    var key = t.rankBy || 'score';
    var margin = list.length > 1 && b[key] ? (b[key] - list[1][key]) / Math.max(1e-6, b[key]) : 1;
    return { code: 'match', ok: true, thresholds: t, relMargin: margin };
  }

  var API = {
    D2R: D2R, R2D: R2D, TAU_DEG: TAU_DEG, VERDICT: VERDICT,
    basis: basis, focalFromHFov: focalFromHFov, hFovFromFocal: hFovFromFocal,
    pixelToDir: pixelToDir, dirToPixel: dirToPixel,
    photoCurve: photoCurve, horizonAt: horizonAt,
    FOV_LADDER: FOV_LADDER, REFINE_FOV_BAND: REFINE_FOV_BAND,
    buildCurveSet: buildCurveSet, matchOne: matchOne,
    searchYaw: searchYaw, scoreAt: scoreAt, scoreExact: scoreExact,
    refineCamera: refineCamera, suppressNearby: suppressNearby, verdict: verdict
  };
  if (typeof globalThis !== 'undefined') globalThis.IntMapPhotoMatch = API;
  else if (typeof window !== 'undefined') window.IntMapPhotoMatch = API;
})();
