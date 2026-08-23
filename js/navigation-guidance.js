/* ============================================================================
 *  IntMap · WHAT TO DO NEXT — window.IntMapNavGuide   (#R347)
 * ----------------------------------------------------------------------------
 *  §10 progress · §11 turn-by-turn · §12 lanes · §13 voice timing · §14 off-route · §17 arrival
 *
 *  Every decision navigation makes about the DRIVER (as opposed to the map or the network) is in
 *  here, and every one of them is a pure function of (route, match, fix, previous counters). Nothing
 *  in this file reads a clock, a renderer, `navigator`, or the network — so «does it reroute when I
 *  turn off?» and «does it announce the same turn twice?» are Node tests, not a drive.
 *
 *  ══ THE THREE DECISIONS THAT ARE EASY TO GET WRONG ═════════════════════════════════════════════
 *  ① OFF-ROUTE IS NOT A DISTANCE. §14 forbids «20 m off → reroute», and the reason is that 20 m
 *     means something completely different to a 5 m fix and to a 90 m one. `crossTrackDistance`
 *     alone cannot answer it; the LIKELIHOOD that this fix belongs to this line can, and
 *     js/navigation-match.js already computes it (a Gaussian in units of the fix's own accuracy).
 *     So the trigger is on confidence — plus a streak, plus elapsed time, plus «are we even moving».
 *     ⚠ THE STATIONARY GUARD IS NOT AN OPTIMISATION. A parked receiver wanders tens of metres; every
 *     one of those wanders is a low-confidence match, and without the guard a car waiting at a light
 *     beside the route reroutes itself while standing still.
 *  ② REMAINING TIME IS NOT REMAINING DISTANCE × AVERAGE SPEED. A route that is 80 % motorway by
 *     distance and 20 % city by distance is not 80/20 by time. The router already told us the
 *     duration OF EACH STEP; remaining time is the tail of that list plus the unfinished fraction of
 *     the step we are in, which costs one loop and is right.
 *  ③ VOICE DISTANCE IS A TIME. «500 m» is a sensible warning in a city and far too late at 110 km/h.
 *     Each cue has a floor in metres and a lead in SECONDS, and takes whichever is larger — then is
 *     clamped so a cue can never be announced before the previous maneuver has been passed.
 * ==========================================================================*/
window.IntMapNavGuide = (function () {
  'use strict';

  var M = (typeof window !== 'undefined' && window.IntMapNavMatch) || null;
  function match() { return M || (M = window.IntMapNavMatch); }

  /* ══ BUILDING THE ROUTE NAVIGATION WILL FOLLOW ═════════════════════════════════════════════════
     A router's reply is a shape for DRAWING. Navigation needs one more thing from it: every step
     anchored to a distance along the line, so «how far to the turn» is a subtraction.
     ⚠ THE ANCHOR IS MEASURED, NOT ASSUMED. Summing `step.distance` drifts (the values are rounded,
     and the last step of an OSRM route has distance 0); projecting each `maneuver.location` onto the
     line is exact — measured on Tokyo→Yokohama: 26 steps, max cross-track 0.784 m, median 0, segment
     indices strictly increasing. Monotonicity is then ENFORCED rather than trusted, because a route
     that doubles back could project a later step behind an earlier one. */
  function buildRoute(alt, opts) {
    opts = opts || {};
    var NM = match();
    if (!alt) return null;
    var coords = alt.coords || (alt.lines && alt.lines[0] && alt.lines[0].coords) || [];
    if (coords.length < 2) return null;
    var idx = NM.build(coords, { cellM: opts.cellM });

    var raw = alt.steps || [];
    var steps = [];
    var prevAlong = 0;
    /* ⚠ see js/navigation-match.js's `build` — declared once so the split-scope gate can see it. */
    var i;
    for (i = 0; i < raw.length; i++) {
      var s = raw[i];
      var loc = (s.maneuver && s.maneuver.location) || null;
      var along;
      if (loc && isFinite(+loc[0]) && isFinite(+loc[1])) {
        var pr = NM.project(idx, +loc[0], +loc[1], { corridorM: 250 });
        along = pr ? pr.alongRouteDistance : prevAlong;
      } else {
        along = prevAlong;
      }
      if (along < prevAlong) along = prevAlong;      /* enforced, per the header */
      prevAlong = along;
      steps.push({
        i: i,
        along: along, end: 0,
        distance: +s.distance || 0,
        duration: +s.duration || 0,
        name: String(s.name || ''),
        ref: String(s.ref || ''),
        destinations: String(s.destinations || ''),
        exits: String(s.exits || ''),
        location: loc || null,
        type: (s.maneuver && s.maneuver.type) || '',
        modifier: (s.maneuver && s.maneuver.modifier) || '',
        exit: (s.maneuver && s.maneuver.exit) || null,
        bearingAfter: (s.maneuver && s.maneuver.bearing_after) != null ? +s.maneuver.bearing_after : null,
        lanes: lanesOf(s),
        raw: s,
      });
    }
    for (i = 0; i < steps.length; i++) steps[i].end = (i + 1 < steps.length) ? steps[i + 1].along : idx.total;

    /* legs: the stretches between the reader's own stops. `legDurations` is what js/routing.js
       already carries (one entry per leg); without it the whole route is one leg. */
    var legs = [], ld = alt.legDurations || [];
    if (ld.length > 1) {
      /* leg boundaries are the via points; their along-distances come from the same projection */
      var vias = opts.viaPoints || [];
      var cut = [0];
      for (var v = 0; v < vias.length; v++) {
        var pv = NM.project(idx, +vias[v].lng, +vias[v].lat, { corridorM: 500 });
        cut.push(pv ? pv.alongRouteDistance : idx.total);
      }
      cut.push(idx.total);
      for (var g = 0; g + 1 < cut.length && g < ld.length; g++) {
        legs.push({ index: g, startAlong: cut[g], endAlong: cut[g + 1], duration: +ld[g] || 0 });
      }
    }
    if (!legs.length) legs.push({ index: 0, startAlong: 0, endAlong: idx.total, duration: +alt.duration || 0 });

    return {
      idx: idx, coords: idx.coords, steps: steps, legs: legs,
      distance: idx.total,
      duration: +alt.duration || 0,
      providerDistance: +alt.distance || 0,
      mode: String(opts.mode || 'driving'),
    };
  }

  /* ══ LANES — ONLY WHAT THE PROVIDER SAID ═══════════════════════════════════════════════════════
     §12: 「lane dataが無い場合は表示しません。勝手な推定は禁止です。」
     OSRM puts lanes on INTERSECTIONS, not on the step, and a step may cross several. The one that
     matters is the intersection AT the maneuver — which OSRM marks with `in`/`out` indices — and in
     practice is the last one carrying lanes before the step ends. `valid` is OSRM's own word for «a
     lane you may use for this maneuver»; nothing here decides that. Returns null when absent, and
     null is what makes the renderer draw nothing. */
  function lanesOf(step) {
    try {
      var ints = (step && step.intersections) || [];
      var found = null;
      for (var i = 0; i < ints.length; i++) {
        var L = ints[i] && ints[i].lanes;
        if (L && L.length) found = L;
      }
      if (!found) return null;
      var out = [];
      for (var k = 0; k < found.length; k++) {
        var l = found[k] || {};
        out.push({
          valid: !!l.valid,
          indications: Array.isArray(l.indications) ? l.indications.slice() : [],
          active: l.active === undefined ? !!l.valid : !!l.active,
        });
      }
      return out.length ? out : null;
    } catch (_) { return null; }
  }

  /** the index of the step whose span contains `along` */
  function stepAt(route, along) {
    var st = route && route.steps;
    if (!st || !st.length) return -1;
    var lo = 0, hi = st.length - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (st[mid].along <= along) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  /* ══ PROGRESS ══════════════════════════════════════════════════════════════════════════════════ */
  function progress(route, m, opts) {
    opts = opts || {};
    if (!route || !m) return null;
    var along = Math.max(0, Math.min(route.distance, m.alongRouteDistance));
    var si = stepAt(route, along);
    var steps = route.steps;
    var cur = steps[si] || null;
    var nxt = steps[si + 1] || null;
    var after = steps[si + 2] || null;

    /* the maneuver being approached is the END of the current step — that is where the turn is. */
    var manAlong = cur ? cur.end : route.distance;
    var dToMan = Math.max(0, manAlong - along);

    /* ── remaining time, from the router's own per-step durations (header ②) ─────────────────── */
    var remDur = 0;
    if (cur) {
      var span = Math.max(1e-6, cur.end - cur.along);
      var fracLeft = Math.max(0, Math.min(1, (cur.end - along) / span));
      remDur += cur.duration * fracLeft;
      for (var i = si + 1; i < steps.length; i++) remDur += steps[i].duration;
    } else {
      remDur = route.duration * (1 - (route.distance ? along / route.distance : 0));
    }
    /* a traffic-aware provider hands us a factor; without one this is 1 and nothing changes (§6) */
    var tf = isFinite(+opts.trafficFactor) && +opts.trafficFactor > 0 ? +opts.trafficFactor : 1;
    remDur *= tf;

    var leg = legAt(route, along);
    var legSpan = Math.max(1e-6, leg.endAlong - leg.startAlong);
    var legProg = Math.max(0, Math.min(1, (along - leg.startAlong) / legSpan));

    return {
      along: along,
      matched: m,
      routeProgress: route.distance ? Math.max(0, Math.min(1, along / route.distance)) : 0,
      legProgress: legProg,
      legIndex: leg.index,
      distanceTravelled: along,
      remainingDistance: Math.max(0, route.distance - along),
      remainingDuration: remDur,
      stepIndex: si,
      currentStep: cur, nextStep: nxt, followingStep: after,
      distanceToManeuver: dToMan,
      currentRoad: cur ? roadOf(cur) : '',
      nextRoad: nxt ? roadOf(nxt) : '',
      /* ⚠ LANES BELONG TO THE MANEUVER BEING APPROACHED, and only when close enough to act on them.
         Showing the next junction's lanes 4 km early is worse than showing none. */
      lanes: (cur && cur.lanes && dToMan <= laneRange(opts)) ? cur.lanes : null,
    };
  }

  function roadOf(s) {
    if (!s) return '';
    var n = String(s.name || '').trim(), r = String(s.ref || '').trim();
    if (n && r) return n + ' (' + r + ')';
    return n || r || '';
  }
  function laneRange(opts) { return isFinite(+opts.laneRangeM) ? +opts.laneRangeM : 600; }

  function legAt(route, along) {
    var L = route.legs || [];
    for (var i = 0; i < L.length; i++) if (along < L[i].endAlong || i === L.length - 1) return L[i];
    return { index: 0, startAlong: 0, endAlong: route.distance, duration: route.duration };
  }

  /* ══ OFF-ROUTE (§14) ═══════════════════════════════════════════════════════════════════════════
     Returns a VOTE, not a decision — the caller keeps the counters and decides. `prev` carries the
     streak so this function stays pure.
     Thresholds differ by mode because the corridors do: a pedestrian legitimately walks 15 m off the
     centreline of a footway (the other side of the street is still «the route»); a car 40 m off a
     carriageway is on a different road. */
  var OFF = {
    driving: { minSpeed: 1.5, confidence: 0.03, floorM: 35, streak: 3, minMs: 5000 },
    cycling: { minSpeed: 0.8, confidence: 0.03, floorM: 28, streak: 3, minMs: 6000 },
    walking: { minSpeed: 0.4, confidence: 0.02, floorM: 30, streak: 4, minMs: 10000 },
    transit: { minSpeed: 1.5, confidence: 0.01, floorM: 120, streak: 5, minMs: 20000 },
  };

  function offRouteVote(m, fix, prev, opts) {
    opts = opts || {};
    var cfg = OFF[String(opts.mode || 'driving')] || OFF.driving;
    prev = prev || { streak: 0, since: 0 };
    var now = isFinite(+opts.now) ? +opts.now : (fix && fix.ts) || 0;
    var out = { off: false, candidate: false, streak: 0, since: prev.since || 0, reason: '', cross: m ? m.crossTrackDistance : 0, confidence: m ? m.confidence : 0 };

    if (!m) { out.reason = 'no_match'; return out; }

    /* ⚠ STANDING STILL IS NOT LEAVING THE ROUTE — see the header. */
    var v = fix ? (fix.speed || 0) : 0;
    if (v < cfg.minSpeed) { out.reason = 'stationary'; out.streak = 0; out.since = 0; return out; }

    /* the accuracy gate is the same Gaussian the match already computed; the metre floor stops a
       device that reports an absurdly optimistic accuracy from firing on cartographic noise. */
    var far = (m.crossTrackDistance > cfg.floorM) && (m.confidence < cfg.confidence);
    if (!far) { out.reason = 'on_route'; out.streak = 0; out.since = 0; return out; }

    out.candidate = true;
    out.streak = (prev.streak || 0) + 1;
    out.since = prev.since || now;
    var heldMs = now - out.since;
    /* BOTH conditions: a 10 Hz receiver reaches the streak in 0.3 s, and a 0.2 Hz one reaches the
       time before the streak. Requiring both means neither device reroutes on a single bad second. */
    if (out.streak >= cfg.streak && heldMs >= cfg.minMs) { out.off = true; out.reason = 'off_route'; }
    else out.reason = 'pending';
    out.heldMs = heldMs;
    return out;
  }

  /* ══ ARRIVAL (§17) ═════════════════════════════════════════════════════════════════════════════
     Not «within 30 m of the pin». The pin may be 60 m from where a car can legally stop, and a route
     that ends on the far side of a dual carriageway passes within 15 m of it at 60 km/h halfway
     through. So: near the END OF THE ROUTE, near the destination itself, slowing down, and staying
     that way. `arriving` is the announcement; `arrived` is the state change. */
  var ARR = {
    driving: { arrivingM: 400, arrivedM: 40, slow: 3.5, hold: 2 },
    cycling: { arrivingM: 250, arrivedM: 30, slow: 2.0, hold: 2 },
    walking: { arrivingM: 120, arrivedM: 22, slow: 1.2, hold: 2 },
    transit: { arrivingM: 400, arrivedM: 90, slow: 3.5, hold: 2 },
  };

  function arrivalVote(route, p, fix, dest, prev, opts) {
    opts = opts || {};
    var cfg = ARR[String(opts.mode || 'driving')] || ARR.driving;
    prev = prev || { hold: 0 };
    var out = { arriving: false, arrived: false, hold: 0, reason: '', toDest: null };
    if (!route || !p) { out.reason = 'no_progress'; return out; }

    var rem = p.remainingDistance;
    out.arriving = rem <= cfg.arrivingM;

    var toDest = null, toEnd = null;
    if (fix && fix.lng != null) {
      if (dest && isFinite(+dest.lng) && isFinite(+dest.lat)) toDest = match().haversine(fix.lng, fix.lat, +dest.lng, +dest.lat);
      /* ⚠ THE END OF THE ROUTE, AS WELL AS THE PIN. Measured by tests/r347-navigation ④ on a real
         Tokyo→Yokohama route: the router ends at the nearest point of the road network, and that is
         not the pin — a station entrance, a shop inside a building or an address behind a car park
         can be a hundred metres from any road. Requiring proximity to the PIN meant a drive that
         completed perfectly sat in `arriving` for ever, because the pin was never reachable.
         The pin is still USED: reaching it satisfies the check on its own, which covers the case
         where the route was cut short. What the check is really guarding against is a MATCHING
         failure — «the projection says we are at the end of the line, but the device is a kilometre
         away» — and the route's own terminus answers that. */
      var idx = route.idx;
      if (idx && idx.n) {
        var last = idx.coords[idx.n - 1];
        toEnd = match().haversine(fix.lng, fix.lat, last[0], last[1]);
      }
    }
    out.toDest = toDest; out.toEnd = toEnd;

    /* the accuracy of the fix widens the acceptance radius — refusing to say «arrived» because a
       ±60 m fix puts you 50 m away is refusing on evidence you do not have. */
    var acc = fix && isFinite(+fix.accuracy) ? Math.max(0, +fix.accuracy) : 0;
    var radius = cfg.arrivedM + Math.min(60, acc);

    var nearEnd = rem <= cfg.arrivedM || p.routeProgress >= 0.997;
    var here = (toEnd != null && toEnd <= radius) || (toDest != null && toDest <= radius);
    var nearDest = (toEnd == null && toDest == null) ? nearEnd : here;
    var slow = !fix || (fix.speed || 0) <= cfg.slow;

    if (nearEnd && nearDest && slow) {
      out.hold = (prev.hold || 0) + 1;
      if (out.hold >= cfg.hold) { out.arrived = true; out.reason = 'arrived'; }
      else out.reason = 'settling';
    } else {
      out.hold = 0;
      out.reason = out.arriving ? 'approaching' : 'enroute';
    }
    return out;
  }

  /* ══ VOICE CUE TIMING (§13) ═════════════════════════════════════════════════════════════════════
     Four tiers. Each fires ONCE per step (the caller holds the spoken set), when the remaining
     distance to the maneuver first falls below the tier's trigger.
     `at` is `max(floorM, speed × leadS)` — so at 4 m/s the «soon» cue is at its 200 m floor and at
     30 m/s it is at 750 m — CLAMPED to the length of the step, because a cue that triggers before
     the step began would be announced the instant the previous turn completes. */
  var TIERS = [
    { key: 'far', floorM: 700, leadS: 55, minStepM: 900 },
    { key: 'soon', floorM: 200, leadS: 25, minStepM: 260 },
    { key: 'near', floorM: 70, leadS: 10, minStepM: 90 },
    { key: 'now', floorM: 20, leadS: 3, minStepM: 0 },
  ];

  function dueCue(stepIndex, step, distanceToManeuver, speed, hasSpoken, opts) {
    opts = opts || {};
    if (!step) return null;
    var v = Math.max(0, +speed || 0);
    var stepLen = Math.max(0, step.end - step.along);
    for (var i = 0; i < TIERS.length; i++) {
      var T = TIERS[i];
      /* a step shorter than the tier's own scale never gets that tier — «in 700 metres, turn right»
         on a 120 m step is both wrong and impossible to act on. */
      if (stepLen < T.minStepM) continue;
      var at = Math.max(T.floorM, v * T.leadS);
      if (at > stepLen) at = stepLen;
      if (distanceToManeuver > at) continue;
      var key = stepIndex + ':' + T.key;
      if (hasSpoken && hasSpoken(key)) continue;
      return { key: key, tier: T.key, at: at, distance: distanceToManeuver, step: step, stepIndex: stepIndex };
    }
    return null;
  }

  return {
    buildRoute: buildRoute, lanesOf: lanesOf, stepAt: stepAt, legAt: legAt,
    progress: progress, offRouteVote: offRouteVote, arrivalVote: arrivalVote, dueCue: dueCue,
    roadOf: roadOf,
    OFF: OFF, ARR: ARR, TIERS: TIERS,
  };
})();
