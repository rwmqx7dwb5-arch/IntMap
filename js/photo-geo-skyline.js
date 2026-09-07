/* ============================================================================
 *  IntMap · FINDING THE SKYLINE IN A PHOTOGRAPH — globalThis.IntMapPhotoSkyline   (#R527)
 * ----------------------------------------------------------------------------
 *  One row per column: where the sky stops. Everything downstream is angles, so this is the only
 *  place in the feature that looks at pixels at all.
 *
 *  ── NO FIXED COLOUR RULE, BECAUSE THERE IS NO FIXED SKY ─────────────────────────────────────────
 *  «Sky is blue and bright» is true of a summer afternoon and false of every photograph taken at
 *  dawn, in fog, into the sun, or in black and white. Hard-coding weights on blue-minus-red would
 *  work on the pictures it was tuned on and fail quietly on the rest — and failing QUIETLY is the
 *  problem, because a wrong trace does not look wrong, it just moves the answer.
 *  So nothing is assumed about the colour of sky. Instead:
 *
 *    1. an edge map is built (vertical Sobel: the sky/ground boundary is a horizontal edge);
 *    2. for each of a ladder of edge thresholds, the boundary implied by that threshold is «the
 *       first edge strong enough, coming down each column»;
 *    3. each candidate split is scored by how well it SEPARATES THE IMAGE INTO TWO COLOURS —
 *       a Fisher ratio between the two regions it induces. The threshold that splits the picture
 *       most cleanly wins. This is the image telling us what its own sky looks like;
 *    4. the winning split fits a two-class colour model, and a dynamic program re-traces the
 *       boundary under that model with a smoothness penalty, so one dark tree does not drag the
 *       trace to the bottom of the frame.
 *
 *  ── AND IT IS ALLOWED TO SAY IT DID NOT FIND ONE ────────────────────────────────────────────────
 *  `quality` carries the Fisher separation and the mean edge strength along the trace. A photograph
 *  with no sky in it, or with a sky that is the same colour as the hill, produces a low one — which
 *  the caller turns into «this photograph is not suitable», not into a confident wrong answer. The
 *  trace is also editable: js/photo-geo.js lets the reader redraw a stretch or mask it out, and a
 *  masked column is EXCLUDED from scoring rather than scored and forgiven, because a column hidden
 *  by a tree is not evidence either way.
 * ==========================================================================*/
(function () {
  'use strict';

  /* how far the boundary may move between neighbouring columns, as a fraction of image height —
     a real skyline is steep in places (a cliff edge) but never vertical over one pixel of width */
  var MAX_SLOPE_FRAC = 0.06;
  var SMOOTHNESS = 0.35;        /* weight on the jump penalty, against the data terms */
  var N_THRESHOLDS = 24;

  function luma(d, i) { return (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; }

  /* vertical-gradient magnitude, the cue that the boundary is a horizontal edge */
  function edgeMap(img) {
    var w = img.width, h = img.height, d = img.data;
    var g = new Float32Array(w * h);
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var i = (y * w + x) * 4;
        var up = luma(d, i - w * 4 - 4) + 2 * luma(d, i - w * 4) + luma(d, i - w * 4 + 4);
        var dn = luma(d, i + w * 4 - 4) + 2 * luma(d, i + w * 4) + luma(d, i + w * 4 + 4);
        var lf = luma(d, i - 4 - w * 4) + 2 * luma(d, i - 4) + luma(d, i - 4 + w * 4);
        var rt = luma(d, i + 4 - w * 4) + 2 * luma(d, i + 4) + luma(d, i + 4 + w * 4);
        var gy = dn - up, gx = rt - lf;
        g[y * w + x] = Math.sqrt(gy * gy + gx * gx);
      }
    }
    return g;
  }

  /* per-column running sums of colour and colour-squared, so the two regions either side of ANY
     boundary can be summarised in constant time per column */
  function columnSums(img) {
    var w = img.width, h = img.height, d = img.data;
    var s = new Float64Array(w * (h + 1) * 6);
    for (var x = 0; x < w; x++) {
      var base = x * (h + 1) * 6;
      for (var y = 0; y < h; y++) {
        var i = (y * w + x) * 4, o = base + y * 6, o2 = o + 6;
        var r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
        s[o2] = s[o] + r; s[o2 + 1] = s[o + 1] + gg; s[o2 + 2] = s[o + 2] + b;
        s[o2 + 3] = s[o + 3] + r * r; s[o2 + 4] = s[o + 4] + gg * gg; s[o2 + 5] = s[o + 5] + b * b;
      }
    }
    return s;
  }

  /* Fisher-style separation of the two regions a boundary induces: between-class distance over
     pooled within-class scatter. Bigger is a cleaner split. */
  function separation(sums, bound, w, h) {
    var sa = [0, 0, 0], sqa = [0, 0, 0], na = 0, sb = [0, 0, 0], sqb = [0, 0, 0], nb = 0;
    for (var x = 0; x < w; x++) {
      var base = x * (h + 1) * 6, by = bound[x];
      /* ⚠ a column with no boundary in it is SKIPPED, not read as «the boundary is at the top».
         Clamping -1 to 0 would file that whole column under the ground class and quietly bias the
         colour model — and a guide from js/photo-geo-vision.js is -1 wherever the model said
         nothing, which is precisely where the model is being honest. */
      if (by < 0) continue;
      if (by > h) by = h;
      var oA = base + by * 6, oT = base + h * 6;
      for (var c = 0; c < 3; c++) {
        sa[c] += sums[oA + c]; sqa[c] += sums[oA + 3 + c];
        sb[c] += sums[oT + c] - sums[oA + c]; sqb[c] += sums[oT + 3 + c] - sums[oA + 3 + c];
      }
      na += by; nb += h - by;
    }
    if (na < w * 2 || nb < w * 2) return { j: 0, na: na, nb: nb };
    var between = 0, within = 0;
    for (var k = 0; k < 3; k++) {
      var ma = sa[k] / na, mb = sb[k] / nb;
      between += (ma - mb) * (ma - mb);
      within += Math.max(0, sqa[k] / na - ma * ma) + Math.max(0, sqb[k] / nb - mb * mb);
    }
    return { j: between / (within + 1e-6), na: na, nb: nb, meanA: sa.map(function (v) { return v / na; }), meanB: sb.map(function (v) { return v / nb; }) };
  }

  /* the boundary a given edge threshold implies: coming down each column, the first edge that
     clears it. A column with no such edge is marked -1 and takes no part in the split. */
  function boundaryForThreshold(g, w, h, t) {
    var b = new Int32Array(w);
    for (var x = 0; x < w; x++) {
      var found = -1;
      for (var y = 1; y < h - 1; y++) { if (g[y * w + x] > t) { found = y; break; } }
      b[x] = found < 0 ? h : found;
    }
    return b;
  }

  /* ── ⚠ STEP 4 IS A FUNCTION OF A BOUNDARY, WHICH IS THE WHOLE REASON A MODEL CAN DRIVE IT ──────
     Steps 1–3 exist only to GUESS a boundary from pixels. Step 4 — fit two colours either side of
     it, then re-trace with a smoothness penalty — does not care where that guess came from. So it
     lives here on its own, and js/photo-geo-vision.js hands it a polyline traced by a vision model
     instead. Copying step 4 into the model path would have meant two dynamic programs drifting
     apart; there is one, and both callers get the same trace, the same `use`, the same `quality`.
       `guide` is one row per column, or -1 for «no opinion in this column».
       `bandPx`, when given, is a HARD limit on how far the refinement may move from the guide: the
     pixels say exactly where the ridge is, but only near where the model said it was. Without it
     the tree line two hundred pixels below would win on edge strength alone, which is the failure
     the model path exists to avoid. */
  function traceUnder(img, g, gmax, sums, guide, opt) {
    var o = opt || {};
    var w = img.width, h = img.height;
    var sep = separation(sums, guide, w, h);
    var mA = sep.meanA || [1, 1, 1], mB = sep.meanB || [0, 0, 0];
    var d = img.data;
    /* skyCost[y*w+x] is small where the pixel looks like the ABOVE class; groundCost the reverse */
    var above = new Float32Array(w * h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var ii = (y * w + x) * 4;
        var r = d[ii] / 255, gg = d[ii + 1] / 255, bb = d[ii + 2] / 255;
        var da = (r - mA[0]) * (r - mA[0]) + (gg - mA[1]) * (gg - mA[1]) + (bb - mA[2]) * (bb - mA[2]);
        var db = (r - mB[0]) * (r - mB[0]) + (gg - mB[1]) * (gg - mB[1]) + (bb - mB[2]) * (bb - mB[2]);
        /* +1 when the pixel belongs above, -1 when below; the column integral of this is the data term */
        above[y * w + x] = (db - da) / (da + db + 1e-6);
      }
    }
    /* running column integral of `above`, so «how much of this column above y looks like sky, and
       how much below y looks like ground» is two lookups */
    var cum = new Float32Array(w * (h + 1));
    for (var x2 = 0; x2 < w; x2++) {
      var bs = x2 * (h + 1);
      for (var y2 = 0; y2 < h; y2++) cum[bs + y2 + 1] = cum[bs + y2] + above[y2 * w + x2];
    }
    var total = new Float32Array(w);
    for (var x3 = 0; x3 < w; x3++) total[x3] = cum[x3 * (h + 1) + h];

    var gnorm = gmax > 0 ? 1 / gmax : 1;
    function unary(x, y) {
      var bs = x * (h + 1);
      /* reward: everything above y looks like the above-class, everything below like the below-class */
      var agree = cum[bs + y] - (total[x] - cum[bs + y]);
      var edge = y > 0 && y < h - 1 ? g[y * w + x] * gnorm : 0;
      return -(agree / h) - 1.2 * edge;
    }

    var D = Math.max(2, Math.round(h * MAX_SLOPE_FRAC));
    var lam = SMOOTHNESS;
    /* the rows this column is allowed to end on. Without a band that is the whole column; with one
       it is the guide ± bandPx, and the guide has already been slope-limited to D per column
       (`slopeLimit`) so consecutive bands always overlap within one step — a band the trace cannot
       get through is a search with no answer at all, not a tighter one. */
    var band = o.bandPx > 0 ? Math.max(1, Math.round(o.bandPx)) : 0;
    var lim = new Int32Array(w * 2);
    for (var xb = 0; xb < w; xb++) {
      var gy = band && guide ? guide[xb] : -1;
      lim[xb * 2] = gy >= 0 ? Math.max(0, gy - band) : 0;
      lim[xb * 2 + 1] = gy >= 0 ? Math.min(h - 1, gy + band) : h - 1;
    }
    var cost = new Float32Array(w * h), back = new Int32Array(w * h);
    for (var y3 = 0; y3 < h; y3++) cost[y3] = (y3 >= lim[0] && y3 <= lim[1]) ? unary(0, y3) : Infinity;
    for (var x4 = 1; x4 < w; x4++) {
      var alo = lim[x4 * 2], ahi = lim[x4 * 2 + 1];
      for (var y4 = 0; y4 < h; y4++) {
        if (y4 < alo || y4 > ahi) { cost[x4 * h + y4] = Infinity; back[x4 * h + y4] = y4; continue; }
        var bestC = Infinity, bestY = y4;
        var lo = Math.max(0, y4 - D), hi = Math.min(h - 1, y4 + D);
        for (var yp = lo; yp <= hi; yp++) {
          var c = cost[(x4 - 1) * h + yp] + lam * Math.abs(y4 - yp) / D;
          if (c < bestC) { bestC = c; bestY = yp; }
        }
        cost[x4 * h + y4] = bestC + unary(x4, y4);
        back[x4 * h + y4] = bestY;
      }
    }
    var endY = lim[(w - 1) * 2], endC = Infinity;
    for (var y5 = 0; y5 < h; y5++) if (cost[(w - 1) * h + y5] < endC) { endC = cost[(w - 1) * h + y5]; endY = y5; }
    var sky = new Int32Array(w);
    sky[w - 1] = endY;
    for (var x5 = w - 1; x5 > 0; x5--) sky[x5 - 1] = back[x5 * h + sky[x5]];

    /* --- confidence, and what the caller should not trust ------------------------------------- */
    var use = new Uint8Array(w), conf = new Float32Array(w);
    var edgeSum = 0, used = 0;
    for (var x6 = 0; x6 < w; x6++) {
      var yy = sky[x6];
      var e = (yy > 0 && yy < h - 1) ? g[yy * w + x6] * gnorm : 0;
      conf[x6] = e;
      /* a trace pinned to the very top or the very bottom of the frame is not a skyline, it is the
         dynamic program running out of image — those columns are excluded, not reported as found */
      var ok = yy > 1 && yy < h - 2;
      /* a caller that already knows a column is hidden (a stretch the vision model marked, or the
         reader masked) keeps it out of the evidence here rather than after the fact */
      if (ok && o.use && !o.use[x6]) ok = false;
      use[x6] = ok ? 1 : 0;
      if (ok) { edgeSum += e; used++; }
    }
    var meanEdge = used ? edgeSum / used : 0;
    return {
      width: w, height: h, sky: sky, use: use, conf: conf,
      source: o.source || 'auto',
      quality: {
        /* how cleanly the picture divides into two colours — low means «no sky/ground split here» */
        separation: sep.j,
        /* how sharp the boundary is where it was traced */
        meanEdge: meanEdge,
        /* how much of the frame width produced a usable trace */
        coverage: used / w,
        threshold: o.threshold != null ? o.threshold : null
      }
    };
  }

  /* ⚠ a guide the trace physically cannot follow is not a constraint, it is an empty search. A real
     skyline never moves more than D rows per column (that is what MAX_SLOPE_FRAC asserts), so a
     polyline that does is flattened to what a skyline can do BEFORE it becomes a band. */
  function slopeLimit(guide, w, D) {
    var g = Int32Array.from(guide);
    var i, prev = -1;
    for (i = 0; i < w; i++) {
      if (g[i] < 0) { continue; }
      if (prev >= 0 && g[i] - prev > D) g[i] = prev + D;
      prev = g[i];
    }
    prev = -1;
    for (i = w - 1; i >= 0; i--) {
      if (g[i] < 0) { continue; }
      if (prev >= 0 && g[i] - prev > D) g[i] = prev + D;
      prev = g[i];
    }
    return g;
  }

  function extract(img, opt) {
    var o = opt || {};
    var w = img.width, h = img.height;
    var g = edgeMap(img);
    var sums = columnSums(img);

    /* --- step 1-3: let the image choose its own edge threshold ------------------------------- */
    var gmax = 0;
    for (var i = 0; i < g.length; i++) if (g[i] > gmax) gmax = g[i];
    var best = null;
    for (var k = 1; k <= N_THRESHOLDS; k++) {
      var t = gmax * k / (N_THRESHOLDS + 1);
      var b = boundaryForThreshold(g, w, h, t);
      var sep = separation(sums, b, w, h);
      if (!best || sep.j > best.sep.j) best = { t: t, bound: b, sep: sep };
    }
    if (!best) return null;
    return traceUnder(img, g, gmax, sums, best.bound,
      { source: 'auto', threshold: best.t / (gmax || 1), use: o.use || null });
  }

  /* The model path's entry point: a boundary somebody else believes in, snapped to the pixels
     without being allowed to leave its neighbourhood. */
  function refineFromBoundary(img, guide, opt) {
    var o = opt || {};
    var w = img.width, h = img.height;
    if (!guide || guide.length !== w) return null;
    var g = edgeMap(img), sums = columnSums(img);
    var gmax = 0;
    for (var i = 0; i < g.length; i++) if (g[i] > gmax) gmax = g[i];
    var D = Math.max(2, Math.round(h * MAX_SLOPE_FRAC));
    var lim = slopeLimit(guide, w, D);
    return traceUnder(img, g, gmax, sums, lim,
      { source: o.source || 'llm', bandPx: o.bandPx, use: o.use || null, threshold: null });
  }

  /* Replace a stretch of the trace with points the reader drew. `pts` is [[x,y],...] in analysis
     pixels; columns between the first and last given point are interpolated and marked usable. */
  function applyStroke(sk, pts) {
    if (!sk || !pts || pts.length < 2) return sk;
    var p = pts.slice().sort(function (a, b) { return a[0] - b[0]; });
    for (var i = 0; i < p.length - 1; i++) {
      var x0 = Math.max(0, Math.min(sk.width - 1, Math.round(p[i][0])));
      var x1 = Math.max(0, Math.min(sk.width - 1, Math.round(p[i + 1][0])));
      var y0 = p[i][1], y1 = p[i + 1][1];
      if (x1 === x0) { sk.sky[x0] = Math.round(y0); sk.use[x0] = 1; sk.conf[x0] = 1; continue; }
      for (var x = x0; x <= x1; x++) {
        var t = (x - x0) / (x1 - x0);
        sk.sky[x] = Math.round(y0 + (y1 - y0) * t);
        sk.use[x] = 1; sk.conf[x] = 1;
      }
    }
    return sk;
  }

  /* Exclude a span of columns from scoring — trees, roofs, cloud sitting on the ridge. */
  function maskColumns(sk, x0, x1, excluded) {
    if (!sk) return sk;
    var a = Math.max(0, Math.min(sk.width - 1, Math.round(Math.min(x0, x1))));
    var b = Math.max(0, Math.min(sk.width - 1, Math.round(Math.max(x0, x1))));
    for (var x = a; x <= b; x++) sk.use[x] = excluded ? 0 : (sk.sky[x] > 1 && sk.sky[x] < sk.height - 2 ? 1 : 0);
    return sk;
  }

  function usableColumns(sk) {
    var n = 0; for (var i = 0; i < sk.use.length; i++) if (sk.use[i]) n++;
    return n;
  }

  var API = {
    MAX_SLOPE_FRAC: MAX_SLOPE_FRAC, SMOOTHNESS: SMOOTHNESS,
    edgeMap: edgeMap, extract: extract,
    refineFromBoundary: refineFromBoundary, slopeLimit: slopeLimit,
    applyStroke: applyStroke, maskColumns: maskColumns, usableColumns: usableColumns
  };
  if (typeof globalThis !== 'undefined') globalThis.IntMapPhotoSkyline = API;
  else if (typeof window !== 'undefined') window.IntMapPhotoSkyline = API;
})();
