/* ============================================================================
 *  IntMap · THE NAVIGATION STATE — window.IntMapNavStore   (#R347)
 * ----------------------------------------------------------------------------
 *  「一時的なGPS値をRoute planning stateへ雑に混ぜないでください。」(§35)
 *
 *  ══ WHY THIS IS NOT A FIELD ON THE ROUTE STORE ═════════════════════════════════════════════════
 *  js/routing-store.js holds a QUESTION — where from, where to, by what mode, avoiding what — and the
 *  answer to it. It changes when a reader types. This file holds a JOURNEY IN PROGRESS, and it
 *  changes ten times a minute whether anybody touches the app or not.
 *  Merging them would make every GPS tick an edit to the route request: every subscriber of the route
 *  panel would re-render at 1 Hz for the life of the drive, and `requestOptions()` — the thing that
 *  decides what to ask a router for — would depend on where the car currently is. #R291 built the
 *  route store precisely so Atlas and the panel could not hold two opinions; that property survives
 *  only if the fast-moving half is somewhere else.
 *  The two are LINKED, not merged: `attach()` takes the route the planner selected, and nothing in
 *  here ever writes back into the planner (§35).
 *
 *  ══ THE STATE MACHINE IS A TABLE, AND ILLEGAL MOVES THROW ══════════════════════════════════════
 *  §7 names ten states. Written as `if (offRoute) state='offroute'` scattered over the orchestrator,
 *  the reachable set is whatever the last edit left behind — and the failure is silent: a run that
 *  goes `arrived → enroute` looks like a working navigation right up to the moment it announces a
 *  turn after the driver has parked. So the legal moves are DATA (`TRANSITIONS`), `to()` refuses
 *  anything not in it, and tests enumerate the table rather than trusting a reading of the code.
 *  ⚠ `error` AND `paused` ARE REACHABLE FROM EVERYWHERE ACTIVE, and that is deliberate — a permission
 *  revoked mid-drive or a tab backgrounded is not a state-machine question.
 *
 *  ══ THE GENERATION TOKEN ═══════════════════════════════════════════════════════════════════════
 *  §15: 「古いroute requestが後から返ってきて新しいrouteを上書きしないようrequest generation/tokenを
 *  使います」. #R126 gave the router one and #R291 gave the route store one; this is the same property
 *  a third time, and it has to be a third one because a reroute is not a panel request — two reroutes
 *  can be in flight while the panel is idle. `beginReroute()` hands out an id; `acceptReroute(id)`
 *  is false for every id but the newest.
 *
 *  Pure: no DOM, no renderer, no fetch, no `navigator`. Verified in Node (tests/r347-checks.test.mjs).
 * ==========================================================================*/
window.IntMapNavStore = (function () {
  'use strict';

  /* §7, in the order a journey passes through them. `idle` is both the start and the end. */
  var STATES = ['idle', 'acquiring_location', 'ready', 'enroute', 'offroute', 'rerouting', 'arriving', 'arrived', 'paused', 'error'];

  /* ⚠ ONE ROW PER STATE, AND THE ROW IS THE WHOLE TRUTH ABOUT WHAT MAY FOLLOW IT. */
  var TRANSITIONS = {
    idle: ['acquiring_location', 'error'],
    acquiring_location: ['ready', 'error', 'idle'],
    ready: ['enroute', 'offroute', 'arriving', 'paused', 'error', 'idle'],
    enroute: ['offroute', 'arriving', 'arrived', 'rerouting', 'paused', 'error', 'idle'],
    offroute: ['rerouting', 'enroute', 'paused', 'error', 'idle'],
    rerouting: ['enroute', 'offroute', 'error', 'paused', 'idle'],
    /* ⚠ `arriving → enroute` IS LEGAL AND IS NOT A BUG. Approaching a via point and then driving past
       it, or a destination re-sited by a reroute, both put the car back on a long stretch of route. */
    arriving: ['arrived', 'enroute', 'offroute', 'rerouting', 'paused', 'error', 'idle'],
    /* ⚠ `arrived` GOES ONLY TO `idle` OR ON TO THE NEXT LEG — never back to `enroute` directly.
       Advancing a leg is `nextLeg()`, which re-enters through `ready`, so «arrived at stop 1» and
       «now driving to stop 2» are two events and the UI can tell them apart. */
    arrived: ['idle', 'ready'],
    paused: ['enroute', 'offroute', 'ready', 'idle', 'error'],
    error: ['idle', 'acquiring_location', 'ready'],
  };

  var CAMERA_MODES = ['follow', 'north', 'overview', 'free'];
  var VOICE_MODES = ['off', 'alerts', 'guidance'];

  function blank() {
    return {
      state: 'idle',
      startedAt: 0,
      error: null,                    /* {code, detail} — the taxonomy lives in js/routing-errors.js */

      /* what we are following */
      route: null,                    /* the nav route (js/navigation.js builds it from a route result) */
      routeSetId: '', altIndex: 0,
      mode: 'driving',
      legIndex: 0, legCount: 1,
      destination: null,              /* {lng,lat,name} of the FINAL destination */
      legDestination: null,           /* {lng,lat,name} of the end of the current leg */

      /* where we are */
      currentLocation: null,          /* the accepted, smoothed fix: {lng,lat,accuracy,heading,speed,ts} */
      matchedLocation: null,          /* the projection of it onto the route (js/navigation-match.js) */
      accuracy: null, speed: 0, heading: null,
      gps: { fixes: 0, rejected: 0, lastReason: '', lastAt: 0 },

      /* how far along */
      routeProgress: 0,               /* 0..1 of the CURRENT LEG */
      distanceTravelled: 0,
      remainingDistance: 0,
      remainingDuration: 0,
      eta: 0,                         /* epoch ms — wall clock, never simulation time (§33) */

      /* what to do next */
      currentStep: null, nextStep: null,
      stepIndex: -1,
      distanceToManeuver: 0,
      currentRoad: '', nextRoad: '',
      lanes: null,                    /* only when the provider gave them (§12) */

      /* deviation */
      offRoute: false, offRouteSince: 0, offRouteStreak: 0,
      rerouteGeneration: 0, rerouteCount: 0, lastRerouteAt: 0,

      /* presentation */
      cameraMode: 'follow', cameraUserPanned: false,
      voiceMode: 'guidance', spoken: [],

      /* honesty about the data behind the numbers (§6, §43) */
      etaMeta: null,                  /* {traffic, provider, computedAt, delaySec, confidence, stale} */
      notes: [],
      simulated: false,
    };
  }

  var S = blank();
  var subs = [];
  var gen = 0;

  function emit(why) {
    for (var i = 0; i < subs.length; i++) { try { subs[i](S, why); } catch (e) { /* a subscriber's fault is not the store's */ } }
  }

  /** may `from` become `to`? — the question the table answers, exported so tests can enumerate it */
  function can(from, to) {
    var row = TRANSITIONS[from];
    return !!(row && row.indexOf(to) >= 0);
  }

  /* ⚠ A MOVE TO THE STATE ALREADY HELD IS A NO-OP, NOT AN ERROR. The orchestrator recomputes the
     desired state on every tick; `enroute → enroute` is the normal case and must not throw and must
     not emit (an emit per tick would re-render the whole nav UI at the GPS rate — §47). */
  function to(next, why) {
    if (STATES.indexOf(next) < 0) throw new Error('IntMapNavStore: no such state: ' + next);
    if (S.state === next) return false;
    if (!can(S.state, next)) throw new Error('IntMapNavStore: illegal transition ' + S.state + ' → ' + next);
    var prev = S.state;
    S.state = next;
    if (next === 'enroute' && !S.startedAt) S.startedAt = nowMs();
    if (next === 'idle') { var keepSim = S.simulated; S = blank(); S.simulated = keepSim; }
    emit(why || ('state:' + prev + '>' + next));
    return true;
  }

  /* ⚠ THE CLOCK IS INJECTABLE SO THE TESTS ARE NOT. Everything that reads a wall clock in this file
     goes through here; a test sets `_now` and drives an entire drive deterministically. Production
     never sets it, so production reads `Date.now()`. */
  var _now = null;
  function nowMs() { return _now == null ? Date.now() : _now; }

  /* ══ ATTACHING A ROUTE ═════════════════════════════════════════════════════════════════════════
     The ONLY door through which a route enters navigation. It resets everything derived from the old
     one — a reroute that kept the old `stepIndex` would announce the turn it had reached on a road it
     is no longer on, which is the single most common way a navigator lies. */
  function attach(navRoute, meta) {
    meta = meta || {};
    S.route = navRoute || null;
    S.routeSetId = meta.routeSetId || S.routeSetId || '';
    S.altIndex = meta.altIndex != null ? (meta.altIndex | 0) : S.altIndex;
    if (meta.mode) S.mode = String(meta.mode);
    if (meta.destination) S.destination = meta.destination;
    if (meta.legCount != null) S.legCount = Math.max(1, meta.legCount | 0);
    if (meta.legIndex != null) S.legIndex = Math.max(0, meta.legIndex | 0);
    S.legDestination = meta.legDestination || S.destination || null;
    S.matchedLocation = null;
    S.routeProgress = 0; S.distanceTravelled = 0;
    S.remainingDistance = navRoute ? (navRoute.distance || 0) : 0;
    S.remainingDuration = navRoute ? (navRoute.duration || 0) : 0;
    S.currentStep = null; S.nextStep = null; S.stepIndex = -1;
    S.distanceToManeuver = 0; S.currentRoad = ''; S.nextRoad = ''; S.lanes = null;
    S.offRoute = false; S.offRouteSince = 0; S.offRouteStreak = 0;
    S.spoken = [];
    if (meta.etaMeta !== undefined) S.etaMeta = meta.etaMeta;
    if (meta.notes) S.notes = meta.notes.slice();
    emit('attach');
  }

  /** the whole derived block, written in ONE assignment so subscribers see a consistent picture */
  function applyProgress(p) {
    if (!p) return;
    if (p.matched !== undefined) S.matchedLocation = p.matched;
    if (p.routeProgress != null) S.routeProgress = p.routeProgress;
    if (p.distanceTravelled != null) S.distanceTravelled = p.distanceTravelled;
    if (p.remainingDistance != null) S.remainingDistance = p.remainingDistance;
    if (p.remainingDuration != null) S.remainingDuration = p.remainingDuration;
    if (p.eta != null) S.eta = p.eta;
    if (p.stepIndex != null) S.stepIndex = p.stepIndex;
    if (p.currentStep !== undefined) S.currentStep = p.currentStep;
    if (p.nextStep !== undefined) S.nextStep = p.nextStep;
    if (p.distanceToManeuver != null) S.distanceToManeuver = p.distanceToManeuver;
    if (p.currentRoad != null) S.currentRoad = p.currentRoad;
    if (p.nextRoad != null) S.nextRoad = p.nextRoad;
    if (p.lanes !== undefined) S.lanes = p.lanes;
    emit('progress');
  }

  function applyFix(fix, rejected, reason) {
    if (rejected) {
      S.gps.rejected++; S.gps.lastReason = reason || 'rejected'; S.gps.lastAt = nowMs();
      emit('gps:reject');
      return;
    }
    S.currentLocation = fix || null;
    S.accuracy = fix ? fix.accuracy : null;
    S.speed = fix ? (fix.speed || 0) : 0;
    S.heading = fix ? fix.heading : null;
    S.gps.fixes++; S.gps.lastReason = ''; S.gps.lastAt = nowMs();
    /* ⚠ NO EMIT HERE. The fix alone is not news — what the reader sees is the PROGRESS derived from
       it, and the orchestrator calls applyProgress() in the same tick. Emitting twice per tick was
       measured at double the nav-UI renders for no change on screen (§47). */
  }

  /** off-route is a SUSTAINED condition, so the streak lives here and the decision lives in guidance */
  function setOffRoute(on, at) {
    on = !!on;
    if (on === S.offRoute) return false;
    S.offRoute = on;
    S.offRouteSince = on ? (at || nowMs()) : 0;
    if (!on) S.offRouteStreak = 0;
    emit('offroute');
    return true;
  }
  function bumpOffRouteStreak(on) { S.offRouteStreak = on ? (S.offRouteStreak + 1) : 0; return S.offRouteStreak; }

  function beginReroute() {
    S.rerouteGeneration = ++gen;
    S.rerouteCount++;
    S.lastRerouteAt = nowMs();
    emit('reroute:begin');
    return S.rerouteGeneration;
  }
  function acceptReroute(id) { return id === S.rerouteGeneration; }

  function fail(code, detail) {
    S.error = { code: String(code || 'UNKNOWN'), detail: detail == null ? '' : String(detail) };
    if (S.state !== 'error' && can(S.state, 'error')) to('error', 'fail'); else emit('error');
    return S.error;
  }

  function setCamera(m, byUser) {
    if (CAMERA_MODES.indexOf(m) < 0) return false;
    if (S.cameraMode === m && !byUser) return false;
    S.cameraMode = m;
    /* ⚠ «the reader panned» IS NOT «the reader chose north-up». §18: a manual pan suspends following
       and the reader gets it back with one button; it does not silently change their camera mode. */
    if (m !== 'free') S.cameraUserPanned = false;
    emit('camera');
    return true;
  }
  function setUserPanned(v) {
    v = !!v;
    if (S.cameraUserPanned === v) return false;
    S.cameraUserPanned = v;
    emit('camera');
    return true;
  }
  function setVoice(m) {
    if (VOICE_MODES.indexOf(m) < 0) return false;
    if (S.voiceMode === m) return false;
    S.voiceMode = m;
    emit('voice');
    return true;
  }

  /** a cue is spoken AT MOST ONCE — §13 「同じ案内を連続読み上げしない状態管理」 */
  function markSpoken(key) {
    if (!key) return false;
    if (S.spoken.indexOf(key) >= 0) return false;
    S.spoken.push(key);
    /* the list is per-route and a route has ~30 steps × 4 cues; capping keeps it from growing on a
       long reroute-heavy drive without ever forgetting a cue that is still upcoming. */
    if (S.spoken.length > 400) S.spoken.splice(0, S.spoken.length - 400);
    return true;
  }
  function hasSpoken(key) { return S.spoken.indexOf(key) >= 0; }

  /** the current leg is done; the next one starts from `ready` (see the TRANSITIONS note) */
  function nextLeg() {
    if (S.legIndex + 1 >= S.legCount) return false;
    S.legIndex++;
    to('ready', 'leg');
    return true;
  }

  function setNotes(a) { S.notes = Array.isArray(a) ? a.slice() : []; emit('notes'); }
  function setEtaMeta(m) { S.etaMeta = m || null; emit('eta'); }
  function setSimulated(v) { S.simulated = !!v; emit('sim'); }

  var API = {
    STATES: STATES.slice(), TRANSITIONS: TRANSITIONS,
    CAMERA_MODES: CAMERA_MODES.slice(), VOICE_MODES: VOICE_MODES.slice(),

    get: function () { return S; },
    state: function () { return S.state; },
    active: function () { return S.state === 'enroute' || S.state === 'offroute' || S.state === 'rerouting' || S.state === 'arriving'; },
    running: function () { return S.state !== 'idle' && S.state !== 'error'; },
    on: function (fn) { if (typeof fn === 'function') { subs.push(fn); return function () { var i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; } return function () { }; },
    emit: emit,

    can: can, to: to,
    attach: attach, applyProgress: applyProgress, applyFix: applyFix,
    setOffRoute: setOffRoute, bumpOffRouteStreak: bumpOffRouteStreak,
    beginReroute: beginReroute, acceptReroute: acceptReroute,
    fail: fail, setCamera: setCamera, setUserPanned: setUserPanned, setVoice: setVoice,
    markSpoken: markSpoken, hasSpoken: hasSpoken, nextLeg: nextLeg,
    setNotes: setNotes, setEtaMeta: setEtaMeta, setSimulated: setSimulated,
    reset: function () { S = blank(); gen++; emit('reset'); },

    _pure: { blank: blank, TRANSITIONS: TRANSITIONS, STATES: STATES },
    _setNow: function (t) { _now = t; },   /* tests only — production never calls this */
  };
  return API;
})();
