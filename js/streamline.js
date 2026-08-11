/* ============================================================================
 *  IntMap · Streamlines of a geographic vector field — window.IntMapStreamline  (#R218)
 * ----------------------------------------------------------------------------
 *  The pure arithmetic behind the ocean-current layer, in its own file for the reason
 *  js/river-course.js exists (#R217): a numerical method that decides what the map SHOWS should be
 *  runnable, and checkable, without a browser. Nothing here fetches, draws or knows what an ocean is.
 *
 *  ── THE FIELD ────────────────────────────────────────────────────────────────────────────────────
 *  A regular lon/lat grid of eastward/northward components, with NaN wherever the source has no
 *  value (land, outside the model's domain, a null in the reply). `sample()` is bilinear with the
 *  weights RENORMALISED over the corners that carry a value:
 *
 *      u(p) = Σ wᵢ·uᵢ  /  Σ wᵢ     over the corners with a value
 *
 *  That is not a way of inventing data — every term is a number the source published — it is what
 *  lets a line reach into a cell whose seaward corner is known and whose landward one is not, instead
 *  of stopping half a cell short of every coast (at a continental view, 200 km short). A point with
 *  no valid corner at all has NO ANSWER and returns null; the caller stops there.
 *
 *  ── THE INTEGRATOR ───────────────────────────────────────────────────────────────────────────────
 *  Classical RK4 on the UNIT direction field, so the step `h` is a DISTANCE IN KILOMETRES:
 *
 *      p' = p + (h/6)(k₁ + 2k₂ + 2k₃ + k₄),   kᵢ = û(p)  expressed in degrees per km at that latitude
 *
 *  ⚠ THE DEGREES-PER-KM CONVERSION IS INSIDE THE DERIVATIVE, not applied to the result. Integrating
 *  in degrees and correcting afterwards bends every line toward the pole, because the correction uses
 *  one latitude for a step that spanned several.
 *  ⚠ Normalising to unit speed is deliberate: the SHAPE of a streamline depends only on the
 *  direction field, not on how fast the fluid moves along it, and a fixed distance step keeps the
 *  vertices evenly spaced whether the water is doing 0.2 km/h or 7.
 *
 *  ── EVENLY-SPACED SEEDING (Jobard & Lefer 1997) ──────────────────────────────────────────────────
 *  Without it every seed inside a strong current traces the same line and the picture is a bundle of
 *  duplicates over an empty sea. A seed within d_sep of an existing line is rejected; a line that
 *  comes within d_test (a fraction of d_sep) of one stops. The distance test runs over a hash grid
 *  of cell size d_sep, so it is O(1) per query rather than O(vertices drawn so far).
 * ========================================================================== */
(function (root) {
  'use strict';

  var KM_PER_DEG_LAT = 110.574;
  var KM_PER_DEG_LNG = 111.320;
  var COS_FLOOR = 0.12;          /* stops the ×1/cos blow-up inside the polar caps */

  function cosLat(la) { return Math.max(COS_FLOOR, Math.cos(la * Math.PI / 180)); }

  /** km between two lon/lat points, on the local flat approximation the grid itself lives on */
  function kmBetween(lo1, la1, lo2, la2) {
    var dy = (la2 - la1) * KM_PER_DEG_LAT;
    var dx = (lo2 - lo1) * KM_PER_DEG_LNG * cosLat((la1 + la2) / 2);
    return Math.hypot(dx, dy);
  }

  /**
   * A sampler over a regular grid.
   * @param {{W:number,S:number,dx:number,dy:number,NX:number,NY:number,
   *          u:ArrayLike<number>,v:ArrayLike<number>,t?:ArrayLike<number>}} g
   * @returns {function(number,number):({u:number,v:number,t:(number|null)}|null)}
   */
  function sampler(g) {
    return function (lo, la) {
      var fx = (lo - g.W) / g.dx, fy = (la - g.S) / g.dy;
      if (!(fx >= 0 && fy >= 0 && fx <= g.NX - 1 && fy <= g.NY - 1)) return null;
      var i0 = Math.min(g.NX - 2, Math.floor(fx)), j0 = Math.min(g.NY - 2, Math.floor(fy));
      var tx = fx - i0, ty = fy - j0;
      var wu = 0, wv = 0, ws = 0, wt = 0, wst = 0;
      for (var dj = 0; dj < 2; dj++) for (var di = 0; di < 2; di++) {
        var k = (j0 + dj) * g.NX + (i0 + di);
        var w = (di ? tx : 1 - tx) * (dj ? ty : 1 - ty);
        if (!(w > 0)) continue;
        if (isFinite(g.u[k]) && isFinite(g.v[k])) { wu += g.u[k] * w; wv += g.v[k] * w; ws += w; }
        if (g.t && isFinite(g.t[k])) { wt += g.t[k] * w; wst += w; }
      }
      if (!(ws > 0)) return null;
      return { u: wu / ws, v: wv / ws, t: (wst > 0) ? wt / wst : null };
    };
  }

  /** the hash-grid spacing index the evenly-spaced rule needs */
  function spacingIndex(dSepKm) {
    var bins = Object.create(null);
    function cell(lo, la) {
      return [Math.round(la * KM_PER_DEG_LAT / dSepKm),
              Math.round(lo * KM_PER_DEG_LNG * cosLat(la) / dSepKm)];
    }
    return {
      dSepKm: dSepKm,
      add: function (lo, la) { var c = cell(lo, la); var k = c[0] + '/' + c[1]; (bins[k] = bins[k] || []).push([lo, la]); },
      tooClose: function (lo, la, limKm) {
        var lim = (limKm == null) ? dSepKm : limKm;
        var c = cell(lo, la);
        for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++) {
          var arr = bins[(c[0] + j) + '/' + (c[1] + i)];
          if (!arr) continue;
          for (var n = 0; n < arr.length; n++) if (kmBetween(arr[n][0], arr[n][1], lo, la) < lim) return true;
        }
        return false;
      }
    };
  }

  /**
   * Integrate one streamline from `seed`.
   * @param {function} sample   — from sampler()
   * @param {number[]} seed     — [lng, lat]
   * @param {object}   opt      — { sign, hKm, maxSteps, vMin, bounds:{W,E,S,N}, blocked(lo,la), near, nearLimKm }
   * @returns {{pts:number[][], km:number, stop:string}}
   */
  function trace(sample, seed, opt) {
    opt = opt || {};
    var sign = (opt.sign < 0) ? -1 : 1;
    var h = opt.hKm || 20, maxSteps = opt.maxSteps || 60, vMin = (opt.vMin == null) ? 0.05 : opt.vMin;
    var b = opt.bounds || null, blocked = opt.blocked || null, near = opt.near || null;
    var pts = [[seed[0], seed[1]]], lo = seed[0], la = seed[1], run = 0, stop = 'steps';

    function k(lo2, la2) {
      var s = sample(lo2, la2);
      if (!s) return null;
      var sp = Math.hypot(s.u, s.v);
      if (!(sp > vMin)) return null;
      return [sign * s.u / sp / (KM_PER_DEG_LNG * cosLat(la2)),
              sign * s.v / sp / KM_PER_DEG_LAT, sp];
    }

    for (var n = 0; n < maxSteps; n++) {
      var k1 = k(lo, la); if (!k1) { stop = 'field'; break; }
      var k2 = k(lo + k1[0] * h / 2, la + k1[1] * h / 2) || k1;
      var k3 = k(lo + k2[0] * h / 2, la + k2[1] * h / 2) || k2;
      var k4 = k(lo + k3[0] * h, la + k3[1] * h) || k3;
      var nlo = lo + h * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) / 6;
      var nla = la + h * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6;
      if (!isFinite(nlo) || !isFinite(nla)) { stop = 'nan'; break; }
      if (b && (nla <= b.S || nla >= b.N || nlo <= b.W || nlo >= b.E)) { stop = 'bounds'; break; }
      if (blocked && blocked(nlo, nla)) { stop = 'blocked'; break; }
      if (near && near.tooClose(nlo, nla, opt.nearLimKm)) { stop = 'near'; break; }
      lo = nlo; la = nla; run += h;
      pts.push([lo, la]);
    }
    return { pts: pts, km: run, stop: stop };
  }

  /** walk back along an already-integrated upstream path until `wantKm` of it has been covered */
  function upstreamAt(backPts, hKm, wantKm) {
    if (!backPts || backPts.length < 2) return null;
    var want = Math.min(wantKm, (backPts.length - 1) * hKm);
    var ix = Math.max(1, Math.round(want / hKm));
    return backPts[Math.min(backPts.length - 1, ix)] || null;
  }

  root.IntMapStreamline = {
    sampler: sampler, trace: trace, spacingIndex: spacingIndex,
    upstreamAt: upstreamAt, kmBetween: kmBetween, cosLat: cosLat,
    KM_PER_DEG_LAT: KM_PER_DEG_LAT, KM_PER_DEG_LNG: KM_PER_DEG_LNG
  };
})(typeof window !== 'undefined' ? window : globalThis);
