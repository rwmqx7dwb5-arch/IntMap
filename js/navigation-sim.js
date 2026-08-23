/* ============================================================================
 *  IntMap · THE POSITION SIMULATOR — window.IntMapNavSim   (#R347)
 * ----------------------------------------------------------------------------
 *  §50 「テスト用に、GPSの代わりに経路上を進む位置を注入できるようにしてください。
 *        逸脱・ジャンプ・精度悪化・停止・到着も注入できること。」
 *
 *  ══ IT GOES THROUGH THE SAME DOOR AS THE RECEIVER, OR IT PROVES NOTHING ════════════════════════
 *  A simulator that pokes progress into js/navigation-store.js directly would test the store and
 *  nothing else. This one emits FIXES — the same flat object js/navigation.js builds out of
 *  `position.coords` — so every fix it produces is accepted (or rejected) by the same
 *  `IntMapNavMatch.accept()`, matched by the same `project()`, and judged by the same votes as a real
 *  one. That is what makes «does it reroute when I turn off?» answerable without a car, and it is why
 *  the shape below is `{lng, lat, accuracy, altitude, heading, speed, timestamp}` and not something
 *  more convenient.
 *
 *  ══ ⚠⚠⚠ THE CLOCK IN THE FIX IS THE SIMULATED ONE, AND IT HAS TO BE ════════════════════════════
 *  `accept()` computes the implied speed between two fixes from THEIR OWN timestamps and rejects
 *  anything over the mode's cap (70 m/s driving). At ×20 the wall clock advances 50 ms per fix while
 *  the car covers 14 m, which is 280 m/s — so a simulator that stamped fixes with `Date.now()` would
 *  have every single fix rejected as a teleport, at every multiplier but 1. The stamp therefore
 *  advances by ONE SIMULATED SECOND per fix whatever the multiplier, and the multiplier changes only
 *  how long the timer waits. The consequence is the property the whole file exists for: THE STREAM OF
 *  FIXES IS IDENTICAL AT EVERY SPEED. A run at ×20 is the same journey as a run at ×1, finished
 *  sooner. (`accept()`'s staleness test compares against `Date.now()` and only rejects fixes that are
 *  OLD, so a simulated clock that runs ahead is not affected.)
 *
 *  ══ ⚠ NO `Math.random()`, ANYWHERE ═════════════════════════════════════════════════════════════
 *  Reproducibility is the point of the thing. A failure that appears once in twenty runs is not a
 *  failure anyone can fix, so where randomness is genuinely wanted — the direction of an injected
 *  jump, optional position noise — it comes from a seeded 32-bit LCG whose seed is an argument.
 *  ⚠ AND NOISE IS OFF BY DEFAULT. A simulator that jitters by default would make a test that watches
 *  the off-route vote depend on a number nobody chose; `opts.noise` asks for it explicitly.
 *
 *  ══ ⚠ THE SPEED IS THE ROUTER'S OWN, PER STEP ══════════════════════════════════════════════════
 *  Driving the whole route at one speed would put every voice cue at the same distance and would
 *  never exercise the half of §13's timing that scales with speed — 25 s of lead is 200 m in a town
 *  and 750 m on a motorway, and only a route that actually changes speed can tell the two apart. Each
 *  step already carries the router's `distance` and `duration`; their ratio is that step's speed.
 *
 *  ══ ⚠ `setTimeout` CHAINED, NOT `setInterval` ══════════════════════════════════════════════════
 *  Two reasons, both measured elsewhere in this app: an interval whose callback runs late DELIVERS
 *  THE BACKLOG (a tab that was in the background emits a burst of fixes microseconds apart, which
 *  `accept()` then rejects as out-of-order or as teleports), and an interval's period cannot be
 *  changed — `setSpeed()` would have to tear it down and build another. A chain re-arms with the
 *  current multiplier every tick, so a speed change takes effect on the next one.
 * ==========================================================================*/
window.IntMapNavSim = (function () {
  'use strict';

  var NM = function () { return window.IntMapNavMatch; };
  var NG = function () { return window.IntMapNavGuide; };

  var TICK_MS = 1000;                 /* one SIMULATED second per fix — see the header */
  var DEFAULT_ACC = 6;                /* metres; a good urban GNSS fix */
  var WAYPOINT_LEAD_M = 150;          /* how far before a via point `toWaypoint()` drops the car */
  var MODE_SPEED = { driving: 13.9, cycling: 4.5, walking: 1.35, transit: 11 };   /* m/s, last resort */

  /* metres per degree of latitude on the same sphere js/navigation-match.js uses */
  var M_PER_DEG = 6371008.8 * Math.PI / 180;

  /* a 32-bit LCG (Numerical Recipes' multiplier) — small, deterministic, and seeded by the caller */
  function lcg(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* §50 names ×1 / ×5 / ×20; any positive number works, and it changes the INTERVAL only */
  function normMult(v) { var m = +v; return (isFinite(m) && m > 0) ? Math.min(200, m) : 1; }

  /* ⚠ ONE RUN AT A TIME, because there is one device. `start()` replaces whatever was running rather
     than leaving a second timer chain emitting fixes nobody asked for. */
  var run = null;

  function start(route, opts) {
    opts = opts || {};
    stop();
    if (!route || !route.idx || !route.idx.n || !(route.idx.total > 0)) return null;

    run = {
      route: route, idx: route.idx,
      along: Math.max(0, Math.min(route.idx.total, +opts.startAlong || 0)),
      mult: normMult(opts.speed),
      mode: String(opts.mode || route.mode || 'driving'),
      tickMs: (+opts.tickMs > 0) ? +opts.tickMs : TICK_MS,
      onFix: (typeof opts.onFix === 'function') ? opts.onFix : function () { },
      rnd: lcg(opts.seed == null ? 328 : (+opts.seed | 0)),
      noise: Math.max(0, +opts.noise || 0),
      acc: (+opts.accuracy > 0) ? +opts.accuracy : DEFAULT_ACC,
      clock: isFinite(+opts.startAt) ? +opts.startAt : Date.now(),
      ticks: 0, paused: false, stopped: false, timer: null,
      devM: 0, devLeft: 0, degM: 0, degLeft: 0, jumpM: 0,
      heading: null, speed: 0,
    };
    /* asynchronous even at zero delay: the caller is still assigning the handle this returns */
    schedule(0);
    return handle();
  }

  function schedule(ms) {
    if (!run || run.stopped) return;
    if (run.timer != null) { try { clearTimeout(run.timer); } catch (_) { } run.timer = null; }
    try { run.timer = setTimeout(tick, Math.max(0, ms)); } catch (_) { run.timer = null; }
  }

  function tick() {
    if (!run || run.stopped) return;
    run.timer = null;

    var dt = run.tickMs / 1000;
    if (run.paused) {
      run.speed = 0;
    } else {
      /* ⚠ THE REPORTED SPEED IS THE DISTANCE ACTUALLY COVERED, not the step's nominal speed. At the
         end of the line `along` clamps and the difference is zero — which is what makes the arrival
         vote settle, because it needs a SLOW fix at the destination and not merely a near one. */
      var before = run.along;
      run.along = Math.min(run.idx.total, before + speedAt(run.along) * dt);
      run.speed = (run.along - before) / dt;
    }
    run.clock += run.tickMs;
    run.ticks++;
    emit();
    schedule(run.tickMs / run.mult);
  }

  function speedAt(along) {
    var steps = (run.route && run.route.steps) || [];
    var s = null;
    try {
      var i = NG().stepAt(run.route, along);
      if (i >= 0) s = steps[i];
    } catch (_) { s = null; }

    var v = 0;
    if (s && s.duration > 0) {
      var d = (s.distance > 0) ? s.distance : Math.max(0, s.end - s.along);
      v = d / s.duration;
    }
    if (!(v > 0.2)) {
      /* OSRM's last step has distance 0 AND duration 0, and a `depart` step can too — falling back to
         the route's own average keeps the car moving instead of parking it at every leg boundary. */
      var rd = +run.route.distance || 0, ru = +run.route.duration || 0;
      v = (ru > 0 && rd > 0) ? (rd / ru) : (MODE_SPEED[run.mode] || MODE_SPEED.driving);
    }
    return v;
  }

  function emit() {
    var p = NM().pointAt(run.idx, run.along);
    if (!p) return;
    var lng = p[0], lat = p[1];

    var brg = NM().bearingAt(run.idx, run.along);
    if (brg == null || !isFinite(brg)) brg = (run.heading == null) ? 0 : run.heading;
    run.heading = brg;

    var acc = run.acc;
    if (run.degLeft > 0) { acc = run.degM; run.degLeft--; }

    /* offsets are accumulated in metres east/north, then converted once. A bearing is clockwise from
       north, so its unit vector is (sin, cos) in (east, north). */
    var offE = 0, offN = 0;
    if (run.devLeft > 0) {
      /* ⚠ LEAVING THE ROUTE IS A PERPENDICULAR DISPLACEMENT — the next street over, not further along
         it. An offset along the direction of travel would still project onto the line at zero
         cross-track and the off-route vote would never see it. */
      var pb = (brg + 90) * Math.PI / 180;
      offE += run.devM * Math.sin(pb);
      offN += run.devM * Math.cos(pb);
      run.devLeft--;
    }
    if (run.jumpM > 0) {
      var jb = run.rnd() * 2 * Math.PI;
      offE += run.jumpM * Math.sin(jb);
      offN += run.jumpM * Math.cos(jb);
      run.jumpM = 0;                    /* one fix only, by definition (§50) */
    }
    if (run.noise > 0) {
      offE += (run.rnd() * 2 - 1) * run.noise;
      offN += (run.rnd() * 2 - 1) * run.noise;
    }

    var mPerLng = Math.max(1e-6, Math.cos(lat * Math.PI / 180) * M_PER_DEG);
    var fix = {
      lng: lng + offE / mPerLng,
      lat: lat + offN / M_PER_DEG,
      accuracy: acc,
      altitude: null,
      heading: brg,
      speed: run.speed,
      timestamp: run.clock,
    };
    try { run.onFix(fix); } catch (_) { /* a consumer's fault is not the simulator's */ }
  }

  /* ══ THE FAULTS §50 ASKS TO BE ABLE TO INJECT ══════════════════════════════════════════════════ */

  function deviate(metres, forTicks) {
    if (!run) return false;
    run.devM = +metres || 0;
    run.devLeft = Math.max(1, (forTicks == null ? 1 : forTicks) | 0);
    return true;
  }
  function jump(metres) {
    if (!run) return false;
    run.jumpM = Math.max(0, +metres || 0);
    return true;
  }
  function degrade(accuracyM, forTicks) {
    if (!run) return false;
    run.degM = Math.max(1, +accuracyM || 0);
    run.degLeft = Math.max(1, (forTicks == null ? 1 : forTicks) | 0);
    return true;
  }
  /** stopped at a light: fixes keep coming, at the same place, at speed 0 (§50) */
  function pause() { if (!run) return false; run.paused = true; return true; }
  function resume() { if (!run) return false; run.paused = false; return true; }
  function arrive() { if (!run) return false; run.along = run.idx.total; return true; }

  /** `i` is the index of the via point, i.e. the END of leg `i`; the car is dropped just short of it */
  function toWaypoint(i) {
    if (!run) return false;
    var legs = (run.route && run.route.legs) || [];
    if (!legs.length) return false;
    var k = Math.max(0, Math.min(legs.length - 1, i | 0));
    var end = isFinite(+legs[k].endAlong) ? +legs[k].endAlong : run.idx.total;
    run.along = Math.max(0, Math.min(run.idx.total, end - WAYPOINT_LEAD_M));
    return true;
  }

  function setSpeed(mult) {
    if (!run) return false;
    run.mult = normMult(mult);
    /* re-arm now rather than at the end of the pending wait — at ×1 → ×20 that wait is a second the
       reader would spend watching nothing happen. */
    if (run.timer != null) schedule(run.tickMs / run.mult);
    return true;
  }

  function running() { return !!(run && !run.stopped); }

  function progress() {
    if (!run) return null;
    return {
      along: run.along, distance: run.idx.total,
      fraction: run.idx.total ? (run.along / run.idx.total) : 0,
      ticks: run.ticks, paused: !!run.paused,
      speed: run.speed, heading: run.heading,
      accuracy: (run.degLeft > 0) ? run.degM : run.acc,
      multiplier: run.mult, clock: run.clock,
    };
  }

  function stop() {
    if (!run) return false;
    run.stopped = true;
    if (run.timer != null) { try { clearTimeout(run.timer); } catch (_) { } }
    run = null;
    return true;
  }

  /* the object `start()` hands back. It carries the same controls as the module so a test can hold
     the run rather than reach for the singleton, and both drive the one run that exists. */
  function handle() {
    return {
      stop: stop, pause: pause, resume: resume, setSpeed: setSpeed,
      deviate: deviate, jump: jump, degrade: degrade,
      arrive: arrive, toWaypoint: toWaypoint,
      progress: progress, running: running,
    };
  }

  return {
    start: start, stop: stop, pause: pause, resume: resume,
    setSpeed: setSpeed, deviate: deviate, jump: jump, degrade: degrade,
    arrive: arrive, toWaypoint: toWaypoint,
    running: running, progress: progress,
    TICK_MS: TICK_MS, MODE_SPEED: MODE_SPEED, WAYPOINT_LEAD_M: WAYPOINT_LEAD_M,
    _pure: { lcg: lcg, normMult: normMult, speedAt: function (a) { return run ? speedAt(a) : null; } },
  };
})();
