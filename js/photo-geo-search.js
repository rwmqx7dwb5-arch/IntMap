/* ============================================================================
 *  IntMap · THE SEARCH — globalThis.IntMapPhotoSearch   (#R527)
 * ----------------------------------------------------------------------------
 *  Ties js/photo-geo-terrain.js (what a place can see) to js/photo-geo-match.js (what the
 *  photograph shows) and walks a rectangle. No DOM, no network: the caller supplies the decoded
 *  tiles, so the very same code runs in src/photo-geo-worker.js, on the page when there is no
 *  Worker, and in the offline evaluation that produced the numbers in docs/PHOTO-GEOLOCATION.md.
 *
 *  ── TWO RECTANGLES, NEVER ONE ───────────────────────────────────────────────────────────────────
 *  `area` is where the CAMERA may have stood. The terrain it can see reaches a horizon radius
 *  beyond that in every direction. They are different rectangles and the second is much the larger;
 *  js/photo-geo-terrain.js tilesFor() is what keeps them apart.
 *
 *  ── COARSE, THEN FINE, AND NEVER SILENTLY COARSE ────────────────────────────────────────────────
 *  A rectangle is swept at a spacing chosen from a budget, the best places are kept apart from one
 *  another (a shortlist of one hillside seen twenty times is a shortlist of one), and only those are
 *  re-searched finely. ⚠ THE SPACING IS REPORTED, ALWAYS. A search at 400 m spacing that says
 *  «35.51707, 138.75089» is claiming a precision it did not have; `plan()` hands the caller the
 *  spacing and the point count BEFORE the search starts so a too-large rectangle can be narrowed
 *  rather than quietly under-sampled, and every result carries the spacing it was found at.
 * ==========================================================================*/
(function () {
  'use strict';

  var T = null, M = null;
  function deps() {
    if (!T) T = (typeof globalThis !== 'undefined' ? globalThis : window).IntMapPhotoTerrain;
    if (!M) M = (typeof globalThis !== 'undefined' ? globalThis : window).IntMapPhotoMatch;
    return T && M;
  }

  /* the sweep budget: how many coarse points a search may place before it must widen its spacing */
  var DEFAULT_BUDGET = 2600;
  var MIN_SPACING_M = 40;
  /* MEASURED worst-case interpolation error of the horizon against a 5,760-azimuth reference:
     0.098 deg at 360 azimuths, 0.038 at 720, 0.029 at 1440. The sweep runs at 360 - inside tau
     (0.4 deg) and half the cost of 720 - and the fine pass, which decides the reported coordinate,
     runs at 1440. */
  var COARSE_NAZ = 360, FINE_NAZ = 1440;
  var SHORTLIST = 8;                 /* distinct places carried into the fine pass */
  var RESULTS = 8;

  function areaMetres(area) {
    var D2R = Math.PI / 180, R = 6371008.8;
    var latC = (area.south + area.north) / 2;
    return {
      widthM: Math.abs(area.east - area.west) * D2R * R * Math.cos(latC * D2R),
      heightM: Math.abs(area.north - area.south) * D2R * R,
      latC: latC
    };
  }

  /* ── what this search will cost, BEFORE it runs ─────────────────────────────────────────────────
     The rectangle is the reader's; the spacing is what the budget leaves once they have chosen it.
     Both numbers are handed back so the reader can narrow the rectangle instead of being given a
     coarse answer that looks like a fine one. */
  function plan(area, opts) {
    if (!deps()) return null;
    var o = opts || {};
    var budget = o.budget || DEFAULT_BUDGET;
    var m = areaMetres(area);
    var cells = Math.max(1, budget);
    /* keep the grid roughly square in ground units */
    var spacing = Math.sqrt(Math.max(1, m.widthM * m.heightM) / cells);
    spacing = Math.max(o.minSpacingM || MIN_SPACING_M, spacing);
    if (o.spacingM) spacing = o.spacingM;
    var nx = Math.max(1, Math.floor(m.widthM / spacing) + 1);
    var ny = Math.max(1, Math.floor(m.heightM / spacing) + 1);
    var need = T.tilesFor(area, o);
    /* the terrarium tiles this bucket serves run about 45 kB each; used only to warn, never to bill */
    var bytes = need.all.length * 45000;
    var latC = m.latC;
    var mem = 0;
    for (var i = 0; i < (o.bands || T.BANDS).length; i++) {
      var b = (o.bands || T.BANDS)[i];
      var res = T.metresPerPixel(latC, b.z);
      mem += Math.ceil((m.widthM + 2 * b.r) / res) * Math.ceil((m.heightM + 2 * b.r) / res) * 4;
    }
    return {
      areaWidthM: m.widthM, areaHeightM: m.heightM,
      spacingM: spacing, coarsePoints: nx * ny, nx: nx, ny: ny,
      tiles: need.all.length, tilesByBand: need.bands.map(function (b) { return { z: b.z, n: b.tiles.length }; }),
      approxDownloadBytes: bytes, approxTerrainMemoryBytes: mem,
      horizonRadiusM: (o.bands || T.BANDS)[(o.bands || T.BANDS).length - 1].r,
      /* an honest flag rather than a silent clamp: at this size the sweep cannot resolve detail */
      spacingIsCoarse: spacing > 300,
      budget: budget
    };
  }

  /* ── the sweep ──────────────────────────────────────────────────────────────────────────────────
     `hooks.onProgress(done, total, best)` is called as it goes and `hooks.shouldAbort()` is asked;
     an aborted run RETURNS WHAT IT HAS, labelled aborted, because a partial search is a real result
     and pretending otherwise would make the stop button destructive. */
  function run(field, photo, opts, hooks) {
    if (!deps()) return null;
    var o = opts || {}, hk = hooks || {};
    var t0 = Date.now();
    var fovs = o.fovLadder || M.FOV_LADDER;
    var curveSet = M.buildCurveSet(photo.sky, photo.use, photo.w, photo.h, fovs, { samples: o.samples || 96 });
    if (!curveSet.length) {
      return { ok: false, code: 'no_skyline', reason: 'the traced skyline has no usable columns' };
    }
    var eye = o.observerHeightM == null ? 1.6 : o.observerHeightM;
    var spacing = o.spacingM;
    var L0 = field.layers[0];
    /* the sweep covers the CAMERA rectangle, which is the field minus the band it was padded by */
    var extE = Math.max(0, L0.extE - L0.reach), extN = Math.max(0, L0.extN - L0.reach);
    var cands = [], done = 0, aborted = false;
    var total = (Math.floor(2 * extE / spacing) + 1) * (Math.floor(2 * extN / spacing) + 1);
    var evaluated = 0, offGrid = 0;
    for (var n = -extN; n <= extN + 1e-6; n += spacing) {
      if (aborted) break;
      for (var e = -extE; e <= extE + 1e-6; e += spacing) {
        if (hk.shouldAbort && hk.shouldAbort()) { aborted = true; break; }
        var H = T.horizon(field, e, n, { nAz: o.coarseNAz || COARSE_NAZ, observerHeightM: eye });
        done++;
        if (!H) { offGrid++; continue; }
        evaluated++;
        /* the sweep refines each rung briefly; the fine pass below refines properly */
        var r = M.matchOne(curveSet, photo, H, { nYaw: o.nYaw || 360, tauDeg: o.tauDeg, refine: { rounds: o.coarseRounds || 7 } });
        if (r) cands.push(mk(field, e, n, r, spacing, H));
        if (hk.onProgress && (done % 40 === 0)) hk.onProgress(done, total, cands.length ? bestOf(cands) : null, 'coarse');
      }
    }
    if (hk.onProgress) hk.onProgress(done, total, cands.length ? bestOf(cands) : null, 'coarse');

    /* ── keep distinct places, then look closely at each ───────────────────────────────────────── */
    var sep = o.minSeparationM || Math.max(400, spacing * 2.5);
  /* ══ WHICH LENS, AND THEN WHICH PLACE — TWO QUESTIONS, TWO ANSWERS ═══════════════════════════
     matchOne picks a candidate's field-of-view hypothesis by `explainedDeg`; the candidates are then
     ranked against ONE ANOTHER by `score`. That looks inconsistent and it was, briefly, "fixed" to
     use one key throughout. MEASURED over the twelve evaluation photographs, both ways:

         rank by score          3 confident answers, TWO of them inside 1 km (124 m, 506 m)
         rank by explainedDeg   6 confident answers, NONE inside 1 km

     Twice as many confident answers and not one of them useful is not an improvement — for a
     feature whose whole value is that it only speaks when it knows something, it is the worst
     available trade. And the reason is not luck: THE TWO STEPS ASK DIFFERENT QUESTIONS.
       · «which lens was this?» is model selection between hypotheses that use different amounts of
         evidence, so it must be paid by the degree — a narrow lens asks the terrain a smaller
         question and would otherwise always win (that is the failure recorded in scoreAt);
       · «which of these places fits best?» is asked AFTER the lens is fixed, so every candidate is
         being scored on the same columns through the same lens, and per-column agreement is then
         exactly comparable.
     Same key everywhere would have been tidier and measurably worse. */
    var RANK = o.rankBy || 'score';
    var short = M.suppressNearby(cands, sep, RANK).slice(0, o.shortlist || SHORTLIST);
    var refined = [];
    if (!aborted) {
      var fine = Math.max(o.minFineSpacingM || 25, spacing / 4);
      for (var i = 0; i < short.length; i++) {
        if (hk.shouldAbort && hk.shouldAbort()) { aborted = true; break; }
        var c = short[i], bestC = c;
        /* a 5 x 5 box at a quarter of the coarse spacing, centred on the coarse winner */
        for (var dy = -2; dy <= 2; dy++) {
          for (var dx = -2; dx <= 2; dx++) {
            if (!dx && !dy) continue;
            var ee = c.e + dx * fine, nn = c.n + dy * fine;
            if (Math.abs(ee) > extE || Math.abs(nn) > extN) continue;
            var H2 = T.horizon(field, ee, nn, { nAz: o.fineNAz || FINE_NAZ, observerHeightM: eye });
            if (!H2) continue;
            var r2 = M.matchOne(curveSet, photo, H2, { nYaw: o.nYaw || 360, tauDeg: o.tauDeg });
            if (r2 && r2[RANK] > bestC[RANK]) bestC = mk(field, ee, nn, r2, fine, H2);
          }
        }
        refined.push(bestC);
        if (hk.onProgress) hk.onProgress(i + 1, short.length, bestC, 'fine');
      }
    }
    var list = (refined.length ? refined : short).slice().sort(function (a, b) { return b[RANK] - a[RANK]; });
    var v = M.verdict(list, o.verdict);
    return {
      ok: true, aborted: aborted, verdict: v, candidates: list.slice(0, o.results || RESULTS),
      /* ⚠ (#R547) THE LIST SAYS WHAT ORDERED IT. The panel used to print `agreement` beside every
         candidate while the order came from `score` — two agreements with different denominators
         (`score` divides by every column the reader supplied, `agreement` only by the ones that
         could be evaluated), so the column headed «agreement» read out of order and nothing on
         screen explained why. The ranking quantity is not renamed and not changed — §4.3 measured
         what changing it costs — it is NAMED, and js/photo-geo.js prints the one this says. */
      rankedBy: RANK,
      stats: {
        coarsePointsPlanned: total, coarsePointsVisited: done, coarsePointsEvaluated: evaluated,
        offGrid: offGrid, spacingM: spacing, fineSpacingM: Math.max(o.minFineSpacingM || 25, spacing / 4),
        shortlist: short.length, elapsedMs: Date.now() - t0,
        terrainCells: field.cells, terrainVoidCells: field.voidCells, terrainBytes: field.bytes,
        horizonRadiusM: field.layers[field.layers.length - 1].reach,
        fovLadder: fovs.slice(), observerHeightM: eye,
        tauDeg: o.tauDeg || M.TAU_DEG
      },
      attribution: T.ATTRIBUTION
    };
  }

  function bestOf(list, key) {
    var k = key || 'score';
    var b = list[0];
    for (var i = 1; i < list.length; i++) if (list[i][k] > b[k]) b = list[i];
    return b;
  }

  function mk(field, e, n, r, spacing, H) {
    var ll = field.toLL(e, n);
    return {
      e: e, n: n, lat: ll.lat, lon: ll.lon,
      yawDeg: r.yawDeg, pitchDeg: r.pitchDeg, rollDeg: r.rollDeg, hfovDeg: r.hfovDeg, focalPx: r.focalPx,
      score: r.score, agreement: r.agreement, inlierFrac: r.inlierFrac, rmsDeg: r.rmsDeg,
      explainedDeg: r.explainedDeg, evaluatedDeg: r.evaluatedDeg, evaluatedFrac: r.evaluatedFrac,
      spanDeg: r.spanDeg, reliefDeg: r.reliefDeg, z: r.z,
      groundM: H ? H.groundM : null, eyeM: H ? H.eyeM : null,
      horizonCoverage: H ? H.coverage : null,
      /* ⚠ THE GRID THIS WAS FOUND ON, CARRIED WITH IT. Six decimal places of latitude is 11 cm;
         printing that beside a 250 m sweep would be a claim the search never made. */
      foundAtSpacingM: spacing
    };
  }

  /* The skyline this candidate predicts, as image-space points, for drawing over the photograph.
     Returned as a polyline in ANALYSIS pixels; the caller scales to whatever it is drawing on. */
  function predictedSkyline(H, cand, w, h, step) {
    if (!deps() || !H) return [];
    var cam = M.basis(cand.yawDeg, cand.pitchDeg, cand.rollDeg || 0);
    var f = cand.focalPx || M.focalFromHFov(w, cand.hfovDeg);
    var st = step || 1;
    var byCol = new Float64Array(w).fill(NaN);
    var dist = new Float64Array(w).fill(NaN);
    for (var i = 0; i < H.nAz; i++) {
      var el = H.elev[i];
      if (el !== el) continue;
      var az = i * 360 / H.nAz;
      var p = M.dirToPixel(az, el, cam, f, w / 2, h / 2);
      if (!p.front) continue;
      var x = Math.round(p.u);
      if (x < 0 || x >= w) continue;
      /* the horizon is single-valued in azimuth but two azimuths can land in one column near the
         frame edge; the higher point is the one that is actually the skyline */
      if (!(byCol[x] <= p.v)) { byCol[x] = p.v; dist[x] = H.dist[i]; }
    }
    var out = [];
    for (var x2 = 0; x2 < w; x2 += st) if (byCol[x2] === byCol[x2]) out.push([x2, byCol[x2], dist[x2]]);
    return out;
  }

  /* ⚠ (#R547) THE PANEL ASKS THE SEARCH WHICH NUMBER ORDERED THE LIST — it does not decide.
     A display that names its own quantity is a display that can disagree with the sort, which is
     exactly what it did: «agreement» printed beside a list ordered by `score`. Both callers now read
     the order out of the same field, so «the number shown is the number sorted on» is true by
     construction rather than by two files happening to agree.
     `rankedBy` is absent on a result produced before this existed; `score` is what ranked those. */
  function rankValue(result, cand) {
    if (!cand) return NaN;
    var k = (result && result.rankedBy) || 'score';
    var v = +cand[k];
    return isFinite(v) ? v : +cand.score;
  }
  /* is this list actually in the order it claims? The panel does not need to ask — but a test does,
     and so does anyone adding a second place that reorders candidates. */
  function orderedByRank(result) {
    var c = (result && result.candidates) || [];
    for (var i = 1; i < c.length; i++) if (rankValue(result, c[i]) > rankValue(result, c[i - 1]) + 1e-9) return false;
    return true;
  }

  var API = {
    rankValue: rankValue, orderedByRank: orderedByRank,
    DEFAULT_BUDGET: DEFAULT_BUDGET, COARSE_NAZ: COARSE_NAZ, FINE_NAZ: FINE_NAZ,
    areaMetres: areaMetres, plan: plan, run: run, predictedSkyline: predictedSkyline
  };
  if (typeof globalThis !== 'undefined') globalThis.IntMapPhotoSearch = API;
  else if (typeof window !== 'undefined') window.IntMapPhotoSearch = API;
})();
