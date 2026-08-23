/* ============================================================================
 *  IntMap · WHERE ON THE ROUTE AM I — window.IntMapNavMatch   (#R347)
 * ----------------------------------------------------------------------------
 *  「単純な『一番近い頂点』では禁止です。Line segmentへの最近点を使ってください。」
 *  「長い経路で毎GPS更新ごとに全polylineをO(n)走査しない構造にします。」
 *
 *  ══ TWO JOBS, BOTH PURE ════════════════════════════════════════════════════════════════════════
 *  ① `accept()` — decide whether a raw GPS fix is usable at all, and smooth what it reports.
 *  ② `project()` — put an accepted fix ON the route: which segment, how far along, how far off.
 *
 *  Neither touches the DOM, the renderer, the network or the clock. Every number below is reached
 *  from arguments alone, which is what lets the whole of navigation's hard half be verified in Node
 *  (tests/r347-checks.test.mjs) instead of by driving a car.
 *
 *  ══ WHY A LOCAL PLANE AND NOT HAVERSINE ════════════════════════════════════════════════════════
 *  Projecting a point onto a segment needs a dot product, and a dot product needs a plane. Haversine
 *  gives distances but not a coordinate system, so the usual workaround — «find the nearest VERTEX
 *  by haversine» — is the very thing §9 forbids: on a 939-point, 32 km route (Tokyo→Yokohama,
 *  measured) the vertices are ~34 m apart, so nearest-vertex reports a cross-track error of up to
 *  17 m for a car that is exactly on the line.
 *  An equirectangular plane tangent at the route's own latitude is exact along meridians and errs by
 *  cos(Δlat) across parallels — under a metre over the tens of metres a segment spans — and costs two
 *  multiplies where haversine costs six trig calls. It runs on every GPS tick, so that matters (§46).
 *  ⚠ `lat0` IS THE ROUTE'S, NOT THE FIX'S, so the plane does not move under the car; a plane that
 *  re-centred each tick would make `along` jitter by metres while standing still.
 *
 *  ══ WHY A WINDOW AND A GRID, NOT A SCAN ════════════════════════════════════════════════════════
 *  §46: «全polyline O(n)検索」をしてはいけません». Two structures, used in this order:
 *    · a WINDOW around the previous `along` — a car that was 12 km along a route is still within a
 *      few hundred metres of 12 km one second later, so the search is over ~10 segments, not 938;
 *    · a uniform GRID for the cold case (first fix, after a jump, after a reroute) — build once per
 *      route, O(1) lookup, and only if the grid is empty at that cell does anything scan.
 *  ⚠ THE WINDOW IS NOT ALLOWED TO LIE. A route that doubles back (a there-and-back leg, a cloverleaf)
 *  passes near itself, and a window would happily hold the car on the outbound carriageway forever.
 *  So the window's answer is KEPT ONLY IF it is credible (`cross` inside the corridor); otherwise the
 *  grid runs and may move the car to a completely different `along`. `windowed:false` in the result
 *  says which path was taken, and tests assert on it.
 * ==========================================================================*/
window.IntMapNavMatch = (function () {
  'use strict';

  /* IUGG mean earth radius. The same constant js/routing.js's `_hav` uses in km. */
  var R = 6371008.8;
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;

  function haversine(aLng, aLat, bLng, bLat) {
    var dLat = (bLat - aLat) * D2R, dLng = (bLng - aLng) * D2R;
    var la1 = aLat * D2R, la2 = bLat * D2R;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /** initial bearing a→b, degrees clockwise from north */
  function bearing(aLng, aLat, bLng, bLat) {
    var la1 = aLat * D2R, la2 = bLat * D2R, dLng = (bLng - aLng) * D2R;
    var y = Math.sin(dLng) * Math.cos(la2);
    var x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
    return (Math.atan2(y, x) * R2D + 360) % 360;
  }

  /** the signed smallest angle from `a` to `b`, in (-180, 180] */
  function angleDiff(a, b) {
    var d = ((+b - +a) % 360 + 540) % 360 - 180;
    return d;
  }

  /* ══ THE INDEX ═════════════════════════════════════════════════════════════════════════════════
     Built ONCE per route (not per tick), and everything downstream reads it:
       · `cum[i]`  — metres from the start of the route to vertex i, so `along` is an addition;
       · `grid`    — cell key → segment indices whose bounding box touches that cell;
       · `lat0`    — the plane's tangent latitude, fixed for the life of the route.
     Float64Array for `cum` because a 32 km route at 34 m/vertex is ~1000 doubles and this is read on
     every tick; the plane coordinates are precomputed for the same reason. */
  function build(coords, opts) {
    opts = opts || {};
    /* ⚠ DECLARED HERE, NOT IN THE `for` HEAD. `for (var i = ...)` hoists in JS, but the split-scope
       gate (scripts/check-split-scope.mjs) declares a for-init into the LOOP's scope, so a later bare
       `for (i = ...)` in the same function reads as a free identifier. Declaring once is both what the
       gate can see and what the reader can see. */
    var i;
    var pts = [];
    for (i = 0; i < (coords || []).length; i++) {
      var c = coords[i];
      if (!c || !isFinite(+c[0]) || !isFinite(+c[1])) continue;
      /* drop exact repeats — a zero-length segment has no direction and would divide by zero */
      if (pts.length && pts[pts.length - 1][0] === +c[0] && pts[pts.length - 1][1] === +c[1]) continue;
      pts.push([+c[0], +c[1]]);
    }
    var n = pts.length;
    var idx = { coords: pts, n: n, cum: new Float64Array(Math.max(1, n)), total: 0, lat0: 0, cell: 0, grid: null, px: null, py: null };
    if (n === 0) return idx;

    var lat0 = pts[Math.floor(n / 2)][1];
    idx.lat0 = lat0;
    var kx = Math.cos(lat0 * D2R) * R * D2R;   /* metres per degree of longitude at lat0 */
    var ky = R * D2R;                          /* metres per degree of latitude */
    idx.kx = kx; idx.ky = ky;

    var px = new Float64Array(n), py = new Float64Array(n);
    for (i = 0; i < n; i++) { px[i] = pts[i][0] * kx; py[i] = pts[i][1] * ky; }
    idx.px = px; idx.py = py;

    /* ⚠ `cum` IS HAVERSINE, NOT THE PLANE. The plane is for projection (local, sub-metre); the route's
       LENGTH is compared against provider distances and shown to the reader, so it uses the same
       spherical formula the router does. Over 32 km the two differ by metres — small, but the reader
       sees «remaining 12.4 km» and the panel says the route is 31.96 km, and those must agree. */
    var t = 0;
    for (i = 1; i < n; i++) { t += haversine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]); idx.cum[i] = t; }
    idx.total = t;

    /* the grid. Cell size is a compromise: small enough that a cell holds few segments, large enough
       that a 30 km route does not allocate a hundred thousand keys. 250 m over 32 km ≈ 130 cells
       along the path (measured: 1,046 entries for Tokyo→Yokohama). */
    var cell = +opts.cellM > 0 ? +opts.cellM : 250;
    idx.cell = cell;
    var grid = new Map();
    for (i = 0; i < n - 1; i++) {
      var x0 = Math.min(px[i], px[i + 1]), x1 = Math.max(px[i], px[i + 1]);
      var y0 = Math.min(py[i], py[i + 1]), y1 = Math.max(py[i], py[i + 1]);
      var cx0 = Math.floor(x0 / cell), cx1 = Math.floor(x1 / cell);
      var cy0 = Math.floor(y0 / cell), cy1 = Math.floor(y1 / cell);
      for (var cx = cx0; cx <= cx1; cx++) for (var cy = cy0; cy <= cy1; cy++) {
        var k = cx + '_' + cy;
        var a = grid.get(k); if (!a) { a = []; grid.set(k, a); }
        a.push(i);
      }
    }
    idx.grid = grid;
    return idx;
  }

  /** the point at `along` metres from the start — used to place the maneuver marker and the sim */
  function pointAt(idx, along) {
    if (!idx || !idx.n) return null;
    if (idx.n === 1) return [idx.coords[0][0], idx.coords[0][1]];
    var d = Math.max(0, Math.min(idx.total, +along || 0));
    var i = seekVertex(idx, d);
    var a = idx.coords[i], b = idx.coords[i + 1] || a;
    var span = idx.cum[i + 1] != null ? (idx.cum[i + 1] - idx.cum[i]) : 0;
    var t = span > 0 ? (d - idx.cum[i]) / span : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  /** the direction the route runs at `along`, degrees — the heading a driver following it would have */
  function bearingAt(idx, along) {
    if (!idx || idx.n < 2) return null;
    var d = Math.max(0, Math.min(idx.total, +along || 0));
    var i = seekVertex(idx, d);
    var a = idx.coords[i], b = idx.coords[i + 1] || idx.coords[i];
    if (a === b) { a = idx.coords[Math.max(0, i - 1)]; b = idx.coords[i]; }
    return bearing(a[0], a[1], b[0], b[1]);
  }

  /** binary search: the largest vertex index whose cumulative distance is ≤ d */
  function seekVertex(idx, d) {
    var lo = 0, hi = idx.n - 2;
    if (hi < 0) return 0;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (idx.cum[mid] <= d) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  /* ── projecting one point onto one segment, in the plane ───────────────────────────────────── */
  function projSeg(idx, i, x, y) {
    var ax = idx.px[i], ay = idx.py[i], bx = idx.px[i + 1], by = idx.py[i + 1];
    var dx = bx - ax, dy = by - ay;
    var L2 = dx * dx + dy * dy;
    var t = L2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var qx = ax + t * dx, qy = ay + t * dy;
    var ex = x - qx, ey = y - qy;
    return { t: t, cross2: ex * ex + ey * ey };
  }

  /* ══ THE MATCH ═════════════════════════════════════════════════════════════════════════════════
     `hint` is the previous `along` in metres, or null for a cold match.
     `corridorM` is how far off-line the WINDOW is still believed; beyond it the grid decides. */
  function project(idx, lng, lat, opts) {
    opts = opts || {};
    if (!idx || idx.n < 2) return null;
    var x = (+lng) * idx.kx, y = (+lat) * idx.ky;
    var hint = (opts.hint == null || !isFinite(+opts.hint)) ? null : +opts.hint;
    var acc = isFinite(+opts.accuracy) ? Math.max(0, +opts.accuracy) : 0;
    /* the corridor scales with the fix's own error: a 60 m-accurate fix is allowed to sit 60 m off
       the line and still be «the same place», a 5 m one is not. */
    var corridor = isFinite(+opts.corridorM) ? +opts.corridorM : Math.max(35, acc * 1.5);

    var best = null, windowed = false;

    if (hint != null) {
      /* how far the car could plausibly have moved since the last fix, plus slack for the fix's own
         error at both ends. `reachM` is supplied by the caller (speed × dt); without it, a default
         that covers a motorway second. */
      var reach = isFinite(+opts.reachM) ? Math.max(30, +opts.reachM) : 300;
      /* ══ ⚠ THE WINDOW IS NOT SYMMETRIC, AND THAT IS THE WHOLE POINT ══════════════════════════
         MEASURED (tests/r347-navigation ④, real Tokyo→Yokohama, 128 fixes): the last kilometre of
         the route runs back alongside itself about 30 m away. With a symmetric window the segment
         on the OTHER carriageway was inside the search range and geometrically closer, so a car at
         31,500 m matched at 31,112 m — 388 m BACKWARDS in a ten-second tick — and the remaining
         distance went UP while driving forwards. One bad step in 128, and the corridor test could
         not catch it: 30.7 m is a perfectly good cross-track.
         The error was treating «near the line» as «the right part of the line». Forward, the car may
         have travelled `reach`; backward, it can only be where its own POSITION ERROR puts it,
         because a vehicle does not reverse 400 m between fixes. A genuine backward move (reversing
         out of a dead end, a U-turn) falls outside this and is answered by the grid, which is the
         path that is allowed to move `along` freely. */
      var back = Math.max(25, acc * 2);
      var lo = hint - back, hi = hint + reach;
      best = scanRange(idx, x, y, lo, hi);
      /* ⚠ AND THE BOUND IS CHECKED ON THE ANSWER, NOT ONLY ON THE SEARCH. `scanRange` walks whole
         SEGMENTS, and the segment that merely CONTAINS `lo` starts before it — so a projection onto
         that segment can land hundreds of metres behind the bound the search was given. That is
         exactly what the measurement above caught: with `lo` = 31,225 the answer still came back at
         31,112, because one segment spanned both. Narrowing the window without re-checking its
         result would have looked like a fix and changed nothing. */
      if (best) {
        var bAlong = idx.cum[best.i] + (idx.cum[best.i + 1] - idx.cum[best.i]) * best.t;
        if (bAlong < lo - 1 || bAlong > hi + 1) best = null;
      }
      if (best && Math.sqrt(best.cross2) <= corridor) windowed = true; else best = null;
    }
    if (!best) best = scanGrid(idx, x, y, corridor);
    if (!best) best = scanRange(idx, x, y, 0, idx.total);   /* last resort — the whole line */
    if (!best) return null;

    var i = best.i, t = best.t;
    var span = idx.cum[i + 1] - idx.cum[i];
    var along = idx.cum[i] + span * t;
    var cross = Math.sqrt(best.cross2);
    var a = idx.coords[i], b = idx.coords[i + 1];
    var mp = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

    /* ══ CONFIDENCE IS A LIKELIHOOD, NOT A THRESHOLD ══════════════════════════════════════════════
       The question «is this fix on the route?» has no yes/no answer at 30 m — it depends entirely on
       how good the fix is. Under a Gaussian position error of σ = the reported accuracy, the chance
       of landing `cross` metres off a line you are actually on is exp(−½(cross/σ)²). That is this
       number, and it is why a 100 m-accuracy fix 40 m off the line scores 0.92 (believable) while a
       5 m-accuracy fix at the same place scores 0.0000002 (you have left the road).
       σ has a floor: a device claiming 1 m accuracy is claiming more than GNSS can deliver, and
       without the floor one such fix would drive the state machine off-route on map noise alone. */
    var sigma = Math.max(8, acc || 0);
    var z = cross / sigma;
    var confidence = Math.exp(-0.5 * z * z);

    return {
      segmentIndex: i, t: t,
      matchedPoint: mp, lng: mp[0], lat: mp[1],
      alongRouteDistance: along,
      crossTrackDistance: cross,
      remaining: Math.max(0, idx.total - along),
      routeBearing: bearing(a[0], a[1], b[0], b[1]),
      confidence: confidence,
      windowed: windowed,
    };
  }

  /** the best segment whose START lies in [loM, hiM] of route distance */
  function scanRange(idx, x, y, loM, hiM) {
    var i0 = seekVertex(idx, Math.max(0, loM));
    var i1 = seekVertex(idx, Math.max(0, Math.min(idx.total, hiM)));
    var best = null;
    for (var i = i0; i <= i1 && i < idx.n - 1; i++) {
      var p = projSeg(idx, i, x, y);
      if (!best || p.cross2 < best.cross2) best = { i: i, t: p.t, cross2: p.cross2 };
    }
    return best;
  }

  /** the best segment in the grid cells within `radiusM` of the point */
  function scanGrid(idx, x, y, radiusM) {
    if (!idx.grid) return null;
    var cell = idx.cell;
    /* one ring is enough when the radius fits a cell; widen if the corridor is large (a very
       inaccurate fix), and give up to the caller's full scan rather than widening forever. */
    var rings = Math.max(1, Math.ceil((radiusM || 0) / cell));
    if (rings > 4) return null;
    var cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    var best = null, seen = null;
    for (var dx = -rings; dx <= rings; dx++) for (var dy = -rings; dy <= rings; dy++) {
      var a = idx.grid.get((cx + dx) + '_' + (cy + dy));
      if (!a) continue;
      for (var k = 0; k < a.length; k++) {
        var i = a[k];
        if (seen === null) seen = new Set();
        if (seen.has(i)) continue;
        seen.add(i);
        var p = projSeg(idx, i, x, y);
        if (!best || p.cross2 < best.cross2) best = { i: i, t: p.t, cross2: p.cross2 };
      }
    }
    return best;
  }

  /* ══ THE GPS GATE ══════════════════════════════════════════════════════════════════════════════
     §8: «GPS一点をそのまま車両位置として使うだけでは不十分です».  Four rejections and two smoothers,
     and every one of them has a way OUT — a filter that can never be overruled is a filter that
     strands the driver when reality changes.

     ⚠ THE JUMP RULE IS THE DANGEROUS ONE. Rejecting a 5 km teleport is right (§52 «数km teleportを
     即採用しない»); rejecting it FOREVER means a driver who really was carried 5 km — put on a car
     train, or simply emerging from a tunnel where the receiver had been dead-reckoning — never gets
     their position back. So consecutive rejections are counted, and the (N+1)th jump in the same
     direction is believed: two independent fixes agreeing that you are somewhere else IS evidence.
     ⚠ AND STALENESS IS ABOUT `timestamp`, NOT ARRIVAL. `watchPosition` replays a cached fix on
     subscribe (`maximumAge` notwithstanding, measured across browsers), so the first callback after
     `start()` can be minutes old. A cached fix is not wrong, it is just not now — it may seed the
     map but must never move progress. */
  var SPEED_CAP = { driving: 70, cycling: 25, walking: 8, transit: 90 };   /* metres/second */

  function accept(prev, fix, opts) {
    opts = opts || {};
    var now = isFinite(+opts.now) ? +opts.now : (fix && fix.timestamp) || 0;
    var mode = String(opts.mode || 'driving');
    var cap = SPEED_CAP[mode] || SPEED_CAP.driving;
    var staleMs = isFinite(+opts.staleMs) ? +opts.staleMs : 30000;
    var maxRejects = isFinite(+opts.maxRejects) ? +opts.maxRejects : 2;

    if (!fix || !isFinite(+fix.lng) || !isFinite(+fix.lat)) return { accepted: false, reason: 'invalid', state: prev || null };
    var ts = isFinite(+fix.timestamp) ? +fix.timestamp : now;
    var age = now - ts;
    if (age > staleMs) return { accepted: false, reason: 'stale', ageMs: age, state: prev || null };

    var acc = isFinite(+fix.accuracy) ? Math.max(0, +fix.accuracy) : null;

    var st = prev || { lng: null, lat: null, ts: 0, heading: null, speed: 0, rejects: 0, n: 0 };
    var out = {
      lng: +fix.lng, lat: +fix.lat, ts: ts,
      accuracy: acc, altitude: isFinite(+fix.altitude) ? +fix.altitude : null,
      rawHeading: isFinite(+fix.heading) ? ((+fix.heading % 360) + 360) % 360 : null,
      rawSpeed: isFinite(+fix.speed) && +fix.speed >= 0 ? +fix.speed : null,
      heading: st.heading, speed: st.speed || 0,
      rejects: 0, n: (st.n || 0) + 1,
    };

    if (st.lng != null) {
      var dt = Math.max(0.001, (ts - st.ts) / 1000);
      if (ts <= st.ts) return { accepted: false, reason: 'out_of_order', state: st };
      var moved = haversine(st.lng, st.lat, out.lng, out.lat);
      /* the slack the two fixes' own errors allow before a distance counts as movement at all */
      var slack = (acc || 0) + (st.accuracy || 0);
      var impliedSpeed = Math.max(0, moved - slack) / dt;
      if (impliedSpeed > cap) {
        if ((st.rejects || 0) < maxRejects) {
          var s2 = Object.assign({}, st); s2.rejects = (st.rejects || 0) + 1;
          return { accepted: false, reason: 'jump', impliedSpeed: impliedSpeed, movedM: moved, state: s2 };
        }
        /* believed on the (maxRejects+1)th — see the header. Progress is not carried across it. */
        out.teleported = true;
      }
      /* ── speed ────────────────────────────────────────────────────────────────────────────────
         The device's own `speed` is preferred when it gives one (Doppler, far better than
         differencing two positions); otherwise it is derived. Both are then smoothed, because a
         speed that jitters makes the voice cue distances jitter with it (§13). */
      var vRaw = out.rawSpeed != null ? out.rawSpeed : (moved / dt);
      out.speed = ema(st.speed, vRaw, alphaFor(dt, opts.speedTauS != null ? +opts.speedTauS : 4));

      /* ── heading ──────────────────────────────────────────────────────────────────────────────
         ⚠ CIRCULAR, NOT LINEAR. Averaging 359° and 1° arithmetically gives 180° — the exact opposite
         of the truth, and on a north-heading road that is where the car icon would point. Smoothing
         the UNIT VECTOR and reading the angle back has no such seam.
         ⚠ AND HEADING IS ONLY BELIEVED WHEN MOVING. A stationary receiver reports a heading that
         wanders over the whole circle; below `headingMinSpeed` the previous heading is held. */
      var hRaw = out.rawHeading;
      if (hRaw == null && moved > Math.max(3, slack)) hRaw = bearing(st.lng, st.lat, out.lng, out.lat);
      var minV = isFinite(+opts.headingMinSpeed) ? +opts.headingMinSpeed : 1.0;
      /* ⚠ THE GATE READS THE INSTANTANEOUS SPEED, NOT THE SMOOTHED ONE. Measured while writing
         tests/r347-checks ⑦: a car doing 12 m/s that stops dead still has a SMOOTHED speed of ~9 m/s
         one second later (τ=4 s), so a gate on `out.speed` stays open — and the 270° heading a
         stationary receiver invents then swings the puck from 90° to 19° while the car has not
         moved. The device's own `speed` is the honest answer to «am I moving right now»; the
         smoothed one is for display. Fall back to the smoothed value only when the device gives no
         speed at all. */
      var vNow = out.rawSpeed != null ? out.rawSpeed : out.speed;
      if (hRaw != null && vNow >= minV) {
        out.heading = st.heading == null ? hRaw : emaAngle(st.heading, hRaw, alphaFor(dt, opts.headingTauS != null ? +opts.headingTauS : 2));
      } else {
        out.heading = st.heading;
      }
    } else {
      out.speed = out.rawSpeed != null ? out.rawSpeed : 0;
      out.heading = out.rawHeading;
    }

    return { accepted: true, reason: '', state: out, fix: out };
  }

  /** an EMA whose smoothing is expressed as a TIME CONSTANT, so an irregular fix rate does not
      change how much smoothing there is. dt=1 s, tau=4 s → α≈0.22; a 5 s gap → α≈0.71. */
  function alphaFor(dtS, tauS) {
    var tau = tauS > 0 ? tauS : 1;
    return 1 - Math.exp(-Math.max(0, dtS) / tau);
  }
  function ema(prev, next, a) {
    if (prev == null || !isFinite(prev)) return next;
    return prev + (next - prev) * a;
  }
  function emaAngle(prev, next, a) {
    if (prev == null || !isFinite(prev)) return next;
    var d = angleDiff(prev, next);
    return ((prev + d * a) % 360 + 360) % 360;
  }

  return {
    build: build, project: project, accept: accept,
    pointAt: pointAt, bearingAt: bearingAt, seekVertex: seekVertex,
    haversine: haversine, bearing: bearing, angleDiff: angleDiff,
    SPEED_CAP: SPEED_CAP,
    _pure: { projSeg: projSeg, scanRange: scanRange, scanGrid: scanGrid, ema: ema, emaAngle: emaAngle, alphaFor: alphaFor },
  };
})();
