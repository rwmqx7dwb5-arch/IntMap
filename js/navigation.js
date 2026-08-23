/* ============================================================================
 *  IntMap · ACTIVE NAVIGATION — window.IntMapNavigation   (#R347)
 * ----------------------------------------------------------------------------
 *  §7 「Route PlanningとActive Navigationを同じ巨大ファイルへ混ぜないでください。」
 *
 *  ══ WHAT THIS FILE IS ══════════════════════════════════════════════════════════════════════════
 *  The loop, and only the loop. Every decision it makes is made somewhere else:
 *    · js/navigation-match.js   — is this fix usable, and where on the line is it?
 *    · js/navigation-guidance.js— what is left, what is next, have we left the route, have we arrived?
 *    · js/navigation-store.js   — what state are we in, and may we move to that one?
 *    · js/navigation-camera.js  — where should the camera be?
 *    · js/navigation-voice.js   — what should be said, and was it said already?
 *    · js/routing.js            — ask a router for a route (reroutes go through the SAME door).
 *  This file wires them to `watchPosition`, to the route the planner selected, and to the clock.
 *  Everything above it is pure and tested in Node; everything impure is here, and it is small.
 *
 *  ══ THE TICK IS THE HOT PATH (§46) ═════════════════════════════════════════════════════════════
 *  「watchPositionごとに、全route再描画・全DOM再構築・全polyline O(n)検索・network request をして
 *  はいけません。」 So one tick is: accept (a few arithmetic ops) → project (a windowed search over
 *  ~10 segments, not 939) → progress (one loop over the remaining steps) → two votes → at most one
 *  store emit. NOTHING in the tick fetches, and nothing in it rebuilds a layer: the map's own
 *  position marker is moved by setting source data on a two-feature source, and the route line is
 *  repainted only when the TRAVELLED FRACTION crosses a threshold, not every tick.
 *
 *  ══ THE CLOCK IS THE WALL CLOCK, DELIBERATELY (§33) ════════════════════════════════════════════
 *  「simulation time と wall-clock navigation timeは明確に区別してください。」 IntMap has a history
 *  clock (window.IntMapTime) that the whole app follows, and a reader who has set it to 1950 is
 *  still driving home in 2026. So NOTHING in navigation reads IntMapTime. Route PLANNING may follow
 *  Chronos (that is js/routing-time.js's job); navigation may not, and tests/r347-checks.test.mjs
 *  asserts that no js/navigation*.js file names it.
 *
 *  ⚠ THERE ARE STILL TWO CLOCKS IN HERE, AND THEY ARE NOT INTERCHANGEABLE — see the note in
 *  `onFix`. `wall` (`Date.now()`) answers «is this fix current» and «what time will we arrive»;
 *  `now` (the fix's own `timestamp`) answers «how far could we have moved» and «how long has this
 *  been true». Using the wall clock for the second set was measured to break the matcher whenever
 *  fixes arrive in a burst.
 *
 *  ══ WHERE THE LOCATION GOES (§39) ══════════════════════════════════════════════════════════════
 *  「毎GPS updateをサーバーへ送る設計は禁止です。」 A position leaves the device only when a ROUTE is
 *  asked for — the first route, a reroute, a refresh — which is three or four times in a journey,
 *  not once a second. Matching, progress, cues and arrival are computed here from data already in
 *  memory. `_sentPositions` counts the departures so a test can assert the number rather than read
 *  the code for it.
 * ==========================================================================*/
import './navigation-store.js';
import './navigation-match.js';
import './navigation-guidance.js';
import './navigation-camera.js';
import './navigation-voice.js';
import './navigation-sim.js';
import './navigation-ui.js';

window.IntMapNavigation = (function () {
  'use strict';

  var GE = function () { return window.IntMapGeoEngine; };
  var NS = function () { return window.IntMapNavStore; };
  var NM = function () { return window.IntMapNavMatch; };
  var NG = function () { return window.IntMapNavGuide; };
  var CAM = function () { return window.IntMapNavCamera; };
  var VOX = function () { return window.IntMapNavVoice; };
  var SIM = function () { return window.IntMapNavSim; };
  var RT = function () { return window.IntMapRouting; };
  var RS = function () { return window.IntMapRouteStore; };
  var ERR = function () { return window.IntMapRouteErrors; };
  var PV = function () { return window.IntMapRouteProviders; };

  /* ⚠ THE APP'S CODE FOR JAPANESE IS `jp`, AND `<html lang>` SAYS `ja`. Reading the attribute raw
     hands `t()` a code its index does not contain, so every Japanese string falls through to
     English — silently, and with the i18n report still green because the CALL SITES are all there.
     js/lang-registry.js's `normalise` is the one place that knows the mapping, so ask it. */
  function lang() {
    try {
      var R = window.IntMapLang;
      var raw = (window.IM_HOST && window.IM_HOST.lang) || document.documentElement.lang || 'en';
      return (R && typeof R.normalise === 'function') ? R.normalise(raw) : (raw === 'ja' ? 'jp' : raw);
    } catch (_) { return 'en'; }
  }
  /* ⚠ BOUND THROUGH `pick`, NOT `t`. scripts/i18n-helpers.mjs seeds the inline tables from call
     sites it recognises, and a local wrapper around `t()` is not one of them — the strings would
     never enter the fr/ko/zh corpus and the report would stay 100 % green while four languages read
     English (the shape #R251 closed). `pick(lang)` is the form the audit follows. */
  /* ⚠ A TERNARY, NOT AN IIFE — see js/routing-errors.js. An IIFE's callee is a FunctionExpression,
     which scripts/i18n-helpers.mjs cannot resolve to `IntMapLang.pick`, so every string in the file
     would silently leave the four inline-table languages while the report still read 100 %. */
  var L = (window.IntMapLang && window.IntMapLang.pick)
    ? window.IntMapLang.pick(lang)
    : function () { return arguments[0]; };
  function toast(m) { try { if (typeof window.imToast === 'function') window.imToast(m); } catch (_) { } }

  /* ── the live, non-state bits: the watch handle, the GPS filter's carry, the counters ───────── */
  var watchId = null;
  var gpsState = null;                 /* js/navigation-match.js's `accept` carry */
  var offCarry = { streak: 0, since: 0 };
  var arrCarry = { hold: 0 };
  var lastTickAt = 0;
  var lastPaintAlong = -1;
  var reroutingNow = false;
  var lastTrafficCheck = 0;
  var _sentPositions = 0;              /* §39 — counted, not asserted about in prose */
  var simHandle = null;
  var destPlace = null, viaPlaces = [];
  var unsubStore = null;

  /* ⚠ HYSTERESIS, NOT A COOLDOWN. §16: 「数十秒短くなる程度で頻繁にルート変更しないこと」.
     Two different clocks: a reroute forced by leaving the route may happen often (the driver really
     is somewhere else); a reroute OFFERED because traffic improved must be rare, must save real
     time, and must not undo itself. */
  var REROUTE_MIN_GAP_MS = 12000;      /* between forced reroutes — long enough that one bad corner does not loop */
  var TRAFFIC_CHECK_MS = 120000;       /* how often traffic is re-examined at all */
  var TRAFFIC_MIN_SAVING_S = 180;      /* 3 minutes — below this the change is not worth the confusion */
  var TRAFFIC_MIN_SAVING_FRAC = 0.10;  /* …and it must also be a tenth of what is left */

  /* ══ THE MAP LAYER THIS FILE OWNS ══════════════════════════════════════════════════════════════
     One source, three layers: where we are, which way we point, and how much of the line is behind
     us. js/routing.js owns the ROUTE line; this owns only what moves.
     ⚠ EVERYTHING GOES THROUGH IntMapGeoEngine — a raw renderer handle here would be caught by
     `npm run check:engine`, and would also mean navigation worked on one engine only (§48). */
  var SRC = 'imnav-src', SRC_TRAVELLED = 'imnav-travelled';
  var LYR_ACC = 'imnav-accuracy', LYR_DOT = 'imnav-dot', LYR_ARROW = 'imnav-arrow', LYR_DONE = 'imnav-done';

  function canDraw() { try { return !!GE().canDraw(); } catch (_) { return false; } }

  function ensureLayers() {
    if (!canDraw()) return false;
    try {
      var E = GE();
      if (!E.layers.hasSource(SRC)) {
        E.layers.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      }
      if (!E.layers.hasSource(SRC_TRAVELLED)) {
        E.layers.addSource(SRC_TRAVELLED, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      }
      /* ⚠ THE TRAVELLED PORTION IS DRAWN, NOT ERASED (§19). Painting it in a muted colour ON TOP of
         the route keeps the whole line visible — a reader glancing down still sees where they came
         from — while making «ahead» unmistakable. Removing it would also fight js/routing.js for
         ownership of the route source. */
      if (!E.layers.has(LYR_DONE)) {
        E.layers.add({
          id: LYR_DONE, type: 'line', source: SRC_TRAVELLED,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#9aa0a6', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 7, 18, 10], 'line-opacity': 0.85 },
        });
      }
      if (!E.layers.has(LYR_ACC)) {
        E.layers.add({
          id: LYR_ACC, type: 'circle', source: SRC, filter: ['==', ['get', 'k'], 'acc'],
          paint: {
            /* the accuracy circle is drawn in METRES, so it has to be converted to pixels at the
               current zoom — this is the standard mercator relation, evaluated in the style so it
               stays correct while the reader zooms without a JS tick. */
            'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 0, 0,
              22, ['/', ['*', ['get', 'acc'], 4194304], ['*', 156543.03392, ['cos', ['/', ['*', ['get', 'lat'], 3.14159265], 180]]]]],
            'circle-color': '#1a73e8', 'circle-opacity': 0.12,
            'circle-stroke-color': '#1a73e8', 'circle-stroke-width': 1, 'circle-stroke-opacity': 0.25,
          },
        });
      }
      if (!E.layers.has(LYR_DOT)) {
        E.layers.add({
          id: LYR_DOT, type: 'circle', source: SRC, filter: ['==', ['get', 'k'], 'me'],
          paint: { 'circle-radius': 8, 'circle-color': '#1a73e8', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 },
        });
      }
      /* ⚠ THE HEADING ARROW IS A SEPARATE FEATURE AND IS ABSENT WHEN THE HEADING IS (§49). A puck
         that always points somewhere points wrongly whenever the device does not know — which is
         every stationary moment. `hasHeading` is a real property of the fix, not a default. */
      if (!E.layers.has(LYR_ARROW)) {
        E.layers.add({
          id: LYR_ARROW, type: 'symbol', source: SRC, filter: ['==', ['get', 'k'], 'dir'],
          layout: { 'text-field': '➤', 'text-size': 18, 'text-rotate': ['get', 'bearing'], 'text-rotation-alignment': 'map', 'text-allow-overlap': true, 'text-ignore-placement': true, 'text-offset': [0, 0] },
          paint: { 'text-color': '#1a73e8', 'text-halo-color': '#fff', 'text-halo-width': 2 },
        });
      }
      return true;
    } catch (_) { return false; }
  }

  function removeLayers() {
    try {
      var E = GE();
      [LYR_ARROW, LYR_DOT, LYR_ACC, LYR_DONE].forEach(function (id) { try { if (E.layers.has(id)) E.layers.remove(id); } catch (_) { } });
      try { if (E.layers.hasSource(SRC)) E.layers.removeSource(SRC); } catch (_) { }
      try { if (E.layers.hasSource(SRC_TRAVELLED)) E.layers.removeSource(SRC_TRAVELLED); } catch (_) { }
    } catch (_) { }
  }

  function paintPosition(fix, matched) {
    if (!ensureLayers()) return;
    var p = matched && matched.matchedPoint ? matched.matchedPoint : (fix ? [fix.lng, fix.lat] : null);
    if (!p) return;
    var feats = [];
    if (fix && fix.accuracy > 0) feats.push({ type: 'Feature', properties: { k: 'acc', acc: fix.accuracy, lat: p[1] }, geometry: { type: 'Point', coordinates: [fix.lng, fix.lat] } });
    feats.push({ type: 'Feature', properties: { k: 'me' }, geometry: { type: 'Point', coordinates: p } });
    var b = (fix && fix.heading != null) ? fix.heading : (matched ? matched.routeBearing : null);
    if (b != null) feats.push({ type: 'Feature', properties: { k: 'dir', bearing: b }, geometry: { type: 'Point', coordinates: p } });
    try { GE().layers.setSourceData(SRC, { type: 'FeatureCollection', features: feats }); } catch (_) { }
  }

  /* ⚠ REPAINTED ON A THRESHOLD, NOT ON A TICK (§46/§47). The travelled line only changes visibly
     after a few tens of metres; rebuilding its geometry at 1 Hz costs a full source upload per
     second for a change nobody can see. 25 m is below one screen pixel at the zooms navigation
     uses, so the threshold is invisible and the saving is ~40× at motorway speed. */
  function paintTravelled(route, along) {
    if (!route || !ensureLayers()) return;
    if (lastPaintAlong >= 0 && Math.abs(along - lastPaintAlong) < 25) return;
    lastPaintAlong = along;
    var idx = route.idx, out = [];
    var end = NM().seekVertex(idx, along);
    for (var i = 0; i <= end && i < idx.n; i++) out.push(idx.coords[i]);
    var head = NM().pointAt(idx, along);
    if (head) out.push(head);
    var fc = { type: 'FeatureCollection', features: out.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: out } }] : [] };
    try { GE().layers.setSourceData(SRC_TRAVELLED, fc); } catch (_) { }
  }

  /* ══ STARTING ══════════════════════════════════════════════════════════════════════════════════ */

  /** the route the planner has selected, turned into something navigation can follow */
  function currentNavRoute() {
    try {
      var alts = RT().alts();
      var s = RS().get();
      var alt = alts[s.sel] || alts[0];
      if (!alt) return null;
      var mode = s.mode || 'driving';
      var vias = (s.via || []).map(function (v) { return v.place; }).filter(Boolean);
      return NG().buildRoute(alt, { mode: mode, viaPoints: vias });
    } catch (_) { return null; }
  }

  function canStart() {
    try {
      if (!navigator.geolocation && !(SIM() && NS().get().simulated)) return false;
      return !!currentNavRoute();
    } catch (_) { return false; }
  }

  function start(opts) {
    opts = opts || {};
    var S = NS();
    if (S.running() && S.state() !== 'error') { return Promise.resolve(false); }

    var route = currentNavRoute();
    if (!route) { S.fail('NO_ROUTE', 'no selected route to navigate'); toast(ERR().message('NO_ROUTE')); return Promise.resolve(false); }

    var st = RS().get();
    destPlace = st.to && st.to.place ? st.to.place : null;
    viaPlaces = (st.via || []).map(function (v) { return v.place; }).filter(Boolean);

    if (S.state() === 'error') S.to('idle', 'restart');
    S.to('acquiring_location', 'start');
    S.setSimulated(!!opts.simulate);
    S.attach(route, {
      routeSetId: st.routeSetId, altIndex: st.sel, mode: st.mode,
      destination: destPlace, legDestination: destPlace,
      legCount: route.legs.length, legIndex: 0,
      etaMeta: (st.result && st.result.etaMeta) || null,
      notes: st.notes || [],
    });
    gpsState = null; offCarry = { streak: 0, since: 0 }; arrCarry = { hold: 0 };
    lastPaintAlong = -1; lastTickAt = 0; lastTrafficCheck = Date.now(); _sentPositions = 0;

    ensureLayers();
    try { CAM().attach(); } catch (_) { }
    try { VOX().setMode(S.get().voiceMode); } catch (_) { }
    try { if (window.IntMapNavUI) window.IntMapNavUI.open(); } catch (_) { }

    /* the route line must exist before the first fix arrives, or the first second of navigation is
       a puck on an empty map. js/routing.js already painted it; this only re-asserts it. */
    try { RT().repaint(); } catch (_) { }

    if (opts.simulate) return startSim(route, opts);
    return startGPS(opts);
  }

  function startGPS(opts) {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) { NS().fail('LOCATION_UNAVAILABLE', 'no geolocation'); toast(ERR().message('LOCATION_UNAVAILABLE')); return resolve(false); }
      var settled = false;
      var geoOpts = { enableHighAccuracy: true, timeout: 25000, maximumAge: 2000 };
      try {
        watchId = navigator.geolocation.watchPosition(function (pos) {
          onFix(fixFromPosition(pos));
          if (!settled) { settled = true; resolve(true); }
        }, function (e) {
          var code = ERR().classify(e);
          /* ⚠ A LATER ERROR DOES NOT UNDO A JOURNEY IN PROGRESS. `watchPosition` reports transient
             POSITION_UNAVAILABLE inside tunnels and car parks; treating each as fatal would end
             navigation at the worst possible moment. Only a failure BEFORE the first fix stops us. */
          if (!settled) {
            settled = true;
            NS().fail(code, e && e.message); toast(ERR().message(code));
            resolve(false);
          } else {
            NS().applyFix(null, true, code);
          }
        }, geoOpts);
      } catch (e) {
        NS().fail('LOCATION_UNAVAILABLE', String(e && e.message)); resolve(false);
      }
    });
  }

  function startSim(route, opts) {
    try {
      simHandle = SIM().start(route, {
        speed: opts.speedMultiplier || 1, mode: NS().get().mode, seed: opts.seed,
        onFix: function (f) { onFix(f); },
      });
      return Promise.resolve(true);
    } catch (e) { NS().fail('LOCATION_UNAVAILABLE', String(e && e.message)); return Promise.resolve(false); }
  }

  function fixFromPosition(pos) {
    var c = (pos && pos.coords) || {};
    return {
      lng: c.longitude, lat: c.latitude,
      accuracy: c.accuracy, altitude: c.altitude,
      heading: c.heading, speed: c.speed,
      timestamp: pos && pos.timestamp,
    };
  }

  /* ══ THE TICK ══════════════════════════════════════════════════════════════════════════════════ */
  function onFix(raw) {
    var S = NS(), s = S.get();
    if (!s.route || s.state === 'idle' || s.state === 'paused') return;

    var wall = Date.now();
    var mode = s.mode || 'driving';

    /* ① is this fix usable at all?  ⚠ STALENESS IS THE ONE THING MEASURED AGAINST THE WALL CLOCK —
          «is this fix current» is a question about now, not about the fix's own timeline. */
    var a = NM().accept(gpsState, raw, { now: wall, mode: mode });
    if (a.state) gpsState = a.state;
    if (!a.accepted) { S.applyFix(null, true, a.reason); return; }
    var fix = a.fix;

    /* ══ ⚠ EVERYTHING ELSE IS TIMED BY THE FIXES THEMSELVES ═══════════════════════════════════════
       This was `Date.now()`, and MEASURING IT CAUGHT THE ERROR (tests/r347-navigation ④): the tick's
       `dt` sets how far ahead the matcher looks, and a receiver that delivers a batch of fixes in one
       burst — a replay, the simulator, a tab that was throttled and caught up — gets a `dt` of
       milliseconds for movement of hundreds of metres. The window then cannot contain the true
       position, the match falls back to whatever is geometrically nearest, and on a route that runs
       back alongside itself that was 388 m BEHIND the car (measured: one step in 128, remaining
       distance rising while driving forwards).
       A fix carries the instant it was taken. Using it makes the window right for real driving,
       for a throttled tab and for a replay, all with the same arithmetic — and it is the same
       instant `accept()` already trusts for its speed check. */
    var now = fix.ts || wall;
    var dt = lastTickAt ? Math.max(0.2, (now - lastTickAt) / 1000) : 5;
    lastTickAt = now;
    var reach = Math.max(60, (fix.speed || 0) * dt * 2.5 + 60);
    var hint = s.matchedLocation ? s.matchedLocation.alongRouteDistance : null;
    var m = NM().project(s.route.idx, fix.lng, fix.lat, { hint: hint, accuracy: fix.accuracy, reachM: reach });
    if (!m) { S.applyFix(fix); return; }

    /* ③ what does that mean */
    var p = NG().progress(s.route, m, { mode: mode, trafficFactor: trafficFactor(s) });
    S.applyFix(fix);
    /* ⚠ THE ARRIVAL CLOCK IS THE WALL CLOCK. `now` above is the fix's own instant, which is right
       for windows and hysteresis and wrong for a time printed on screen — a replay would show the
       arrival time of the drive that was recorded, not of the one being watched. */
    p.eta = wall + p.remainingDuration * 1000;
    S.applyProgress(p);

    /* first usable fix promotes the state machine out of acquiring_location */
    if (s.state === 'acquiring_location') { S.to('ready', 'first_fix'); }
    if (s.state === 'ready') { S.to('enroute', 'moving'); }

    paintPosition(fix, m);
    paintTravelled(s.route, p.along);

    /* ④ have we left the route? */
    var off = NG().offRouteVote(m, fix, offCarry, { mode: mode, now: now });
    offCarry = { streak: off.streak, since: off.since };
    S.bumpOffRouteStreak(off.candidate);
    if (off.off && !s.offRoute) {
      S.setOffRoute(true, now);
      if (s.state === 'enroute' || s.state === 'arriving') S.to('offroute', 'left_route');
      try { VOX().announce('offroute'); } catch (_) { }
      maybeReroute('off_route');
    } else if (!off.candidate && s.offRoute) {
      /* rejoined without a reroute — it happens, and it must cancel the pending one */
      S.setOffRoute(false);
      if (s.state === 'offroute') S.to('enroute', 'rejoined');
    }

    /* ⑤ have we arrived? */
    if (!s.offRoute) {
      var av = NG().arrivalVote(s.route, p, fix, s.legDestination || s.destination, arrCarry, { mode: mode });
      arrCarry = { hold: av.hold };
      if (av.arrived) {
        onArrived();
      } else if (av.arriving && s.state === 'enroute') {
        S.to('arriving', 'approaching');
        try { VOX().announce(s.legIndex + 1 < s.legCount ? 'waypoint' : 'arriving', { name: nameOf(s.legDestination) }); } catch (_) { }
      }
    }

    /* ⑥ should anything be said? */
    speakIfDue(s, p, fix);

    /* ⑦ where should the camera be? */
    try { CAM().apply(NS().get()); } catch (_) { }

    /* ⑧ has traffic changed enough to be worth a different route? — rarely, and never in the tick's
          own time: this only ever STARTS a request, and only after the interval has elapsed. */
    /* …and the traffic re-check is rate-limiting a real network call, so it is the wall clock too. */
    maybeTrafficReroute(wall);
  }

  /* ══ ⚠ THE CARRY IS PART OF THE STATE, EVEN THOUGH IT DOES NOT LIVE IN THE STORE ═══════════════
     `gpsState`, `offCarry`, `arrCarry` and `lastTickAt` are this closure's private memory of the
     last fix, and `stop()` clears them. But `IntMapNavStore.reset()` is a PUBLIC door that also ends
     a journey, and it could not reach them — so a caller who reset the store and started again was
     handing new fixes to a filter still holding the old drive's last position and timestamp.
     MEASURED (tests/r347-navigation ⑤, two journeys on one page): every fix of the second journey
     was refused as `out_of_order`, because the carried timestamp was still the first journey's last
     one. Nothing threw; navigation simply never moved.
     Subscribing to the store's own reset makes the two halves of «this journey is over» inseparable. */
  (function () {
    try {
      NS().on(function (_s, why) {
        if (why !== 'reset' && why !== 'attach') return;
        gpsState = null; offCarry = { streak: 0, since: 0 }; arrCarry = { hold: 0 };
        lastTickAt = 0; lastPaintAlong = -1;
        if (why === 'reset') { reroutingNow = false; _sentPositions = 0; }
      });
    } catch (_) { }
  })();

  function nameOf(pl) { return (pl && (pl.name || pl.label)) || ''; }

  function trafficFactor(s) {
    /* the provider either measured the delay or it did not — there is no third option and no
       estimate (§5). Absent traffic data, the factor is 1 and the router's own duration stands. */
    var meta = s.etaMeta;
    if (!meta || !meta.traffic || !isFinite(+meta.factor) || +meta.factor <= 0) return 1;
    return +meta.factor;
  }

  function speakIfDue(s, p, fix) {
    var S = NS();
    if (S.get().voiceMode === 'off') return;
    var cue = NG().dueCue(p.stepIndex, p.currentStep, p.distanceToManeuver, fix.speed || 0, S.hasSpoken);
    if (!cue) return;
    if (S.get().voiceMode === 'alerts' && cue.tier !== 'now') { S.markSpoken(cue.key); return; }
    /* ⚠ MARKED BEFORE SPOKEN, ON PURPOSE. Speech is asynchronous and the next fix can arrive before
       it starts; marking afterwards would let the same cue be queued twice. */
    S.markSpoken(cue.key);
    try { VOX().speakCue(cue, p.nextStep); } catch (_) { }
  }

  function onArrived() {
    var S = NS(), s = S.get();
    if (s.legIndex + 1 < s.legCount) {
      try { VOX().announce('waypoint', { name: nameOf(s.legDestination) }); } catch (_) { }
      S.to('arrived', 'leg_done');
      S.nextLeg();
      arrCarry = { hold: 0 };
      return;
    }
    try { VOX().announce('arrived', { name: nameOf(s.destination) }); } catch (_) { }
    S.to('arrived', 'destination');
    try { CAM().setMode('overview'); } catch (_) { }
    stopWatch();
  }

  /* ══ REROUTING (§15) ═══════════════════════════════════════════════════════════════════════════
     ⚠ THE GENERATION TOKEN IS THE WHOLE POINT. Two reroutes can be in flight — the driver takes a
     wrong turn, then another before the first reply lands — and the first reply describes a road
     they are no longer on. `acceptReroute(gen)` is false for every id but the newest, so an old
     reply is dropped rather than attached. This is the same property #R126 gave the router and
     #R291 gave the route store, at the one level that did not have it. */
  function maybeReroute(why) {
    var S = NS(), s = S.get();
    if (reroutingNow) return false;
    if (Date.now() - s.lastRerouteAt < REROUTE_MIN_GAP_MS) return false;
    if (!s.currentLocation) return false;
    return doReroute(why);
  }

  function doReroute(why) {
    var S = NS(), s = S.get();
    var from = s.currentLocation;
    if (!from) return false;
    reroutingNow = true;
    if (s.state === 'offroute' || s.state === 'enroute' || s.state === 'arriving') S.to('rerouting', why);
    var gen = S.beginReroute();
    try { VOX().announce('rerouting'); } catch (_) { }

    /* ⚠ ONLY THE STOPS STILL AHEAD. Re-asking for the whole itinerary from here would route the
       driver back through a via point they have already visited. */
    var remaining = viaPlaces.slice(Math.min(viaPlaces.length, s.legIndex));
    var dest = s.destination || destPlace;
    if (!dest) { reroutingNow = false; S.fail('REROUTE_FAILED', 'no destination'); return false; }

    var opts = { mode: s.mode, _rid: undefined };
    if (remaining.length) opts.via = remaining.map(function (v) { return { lng: +v.lng, lat: +v.lat }; });
    var st = RS().get();
    if (st.avoid && st.avoid.length && s.mode === 'driving') opts.avoid = st.avoid.slice();
    if (st.areas && st.areas.length) opts.avoidAreas = st.areas.slice();

    _sentPositions++;                       /* §39 — a position leaves the device HERE and nowhere else */
    return RT().route({ lng: from.lng, lat: from.lat }, { lng: +dest.lng, lat: +dest.lat }, opts)
      .then(function (res) {
        reroutingNow = false;
        if (!S.acceptReroute(gen)) return false;      /* superseded — the newer reroute owns the UI */
        if (!res || !res.ok) {
          var code = ERR().classify(res && res.status);
          S.fail(code === 'CANCELLED' ? 'CANCELLED' : 'REROUTE_FAILED', res && res.status);
          toast(ERR().message('REROUTE_FAILED'));
          return false;
        }
        var alts = RT().altsOf(res.routeSetId);
        var alt = alts[res.sel || 0] || alts[0];
        var nav = alt ? NG().buildRoute(alt, { mode: s.mode, viaPoints: remaining }) : null;
        if (!nav) { S.fail('REROUTE_FAILED', 'unbuildable'); return false; }
        S.attach(nav, {
          routeSetId: res.routeSetId, altIndex: res.sel || 0, mode: s.mode,
          destination: dest, legDestination: dest,
          legCount: nav.legs.length, legIndex: 0,
        });
        offCarry = { streak: 0, since: 0 }; arrCarry = { hold: 0 }; lastPaintAlong = -1;
        S.setOffRoute(false);
        if (S.state() === 'rerouting') S.to('enroute', 'rerouted');
        try { VOX().announce('rerouted'); } catch (_) { }
        return true;
      })
      .catch(function (e) {
        reroutingNow = false;
        if (!S.acceptReroute(gen)) return false;
        S.fail('REROUTE_FAILED', String(e && e.message));
        return false;
      });
  }

  /* ══ TRAFFIC-DRIVEN REROUTE (§16) ══════════════════════════════════════════════════════════════
     「毎数秒route全体を再計算するような無駄な実装は禁止です。」 So: only if a provider that actually
     carries traffic is usable, only every TRAFFIC_CHECK_MS, and only if the candidate saves BOTH an
     absolute and a proportional amount. Without such a provider this function returns immediately
     and nothing in the UI ever suggests it could have done better. */
  function maybeTrafficReroute(now) {
    var S = NS(), s = S.get();
    if (s.state !== 'enroute') return false;
    if (now - lastTrafficCheck < TRAFFIC_CHECK_MS) return false;
    if (reroutingNow) return false;
    try { if (!PV().supports(s.mode, 'traffic')) { lastTrafficCheck = now; return false; } } catch (_) { return false; }
    lastTrafficCheck = now;

    var T = window.IntMapRouteTraffic;
    if (!T || !T.available()) return false;
    var from = s.currentLocation, dest = s.destination;
    if (!from || !dest) return false;
    _sentPositions++;
    return T.route({ lng: from.lng, lat: from.lat }, { lng: +dest.lng, lat: +dest.lat }, { mode: s.mode })
      .then(function (res) {
        if (!res || !res.ok) return false;
        var cand = +res.duration || 0;
        var cur = +NS().get().remainingDuration || 0;
        var saving = cur - cand;
        if (saving < TRAFFIC_MIN_SAVING_S) return false;
        if (cur > 0 && saving / cur < TRAFFIC_MIN_SAVING_FRAC) return false;
        /* ⚠ OFFERED, NOT TAKEN. A route the driver did not ask to change is a surprise at speed; the
           UI presents it and a tap accepts. `pendingTraffic` is what js/navigation-ui.js renders. */
        NS().setNotes((NS().get().notes || []).concat([{ kind: 'traffic_faster', savingS: saving, routeSetId: res.routeSetId, sel: res.sel || 0 }]));
        return true;
      })
      .catch(function () { return false; });
  }

  /** accept a faster route the traffic check offered (called by the UI, never automatically) */
  function acceptOffer(routeSetId, sel) {
    var S = NS(), s = S.get();
    var alts = RT().altsOf(routeSetId);
    var alt = alts[sel || 0] || alts[0];
    if (!alt) return false;
    var nav = NG().buildRoute(alt, { mode: s.mode, viaPoints: viaPlaces });
    if (!nav) return false;
    S.attach(nav, { routeSetId: routeSetId, altIndex: sel || 0, mode: s.mode, destination: s.destination, legDestination: s.destination, legCount: nav.legs.length, legIndex: 0 });
    S.setNotes((s.notes || []).filter(function (n) { return n.kind !== 'traffic_faster'; }));
    offCarry = { streak: 0, since: 0 }; lastPaintAlong = -1;
    return true;
  }

  /* ══ STOPPING ═════════════════════════════════════════════════════════════════════════════════ */
  function stopWatch() {
    if (watchId != null) { try { navigator.geolocation.clearWatch(watchId); } catch (_) { } watchId = null; }
    if (simHandle) { try { SIM().stop(); } catch (_) { } simHandle = null; }
  }

  function stop() {
    stopWatch();
    try { VOX().stop(); } catch (_) { }
    try { CAM().detach(); } catch (_) { }
    try { if (window.IntMapNavUI) window.IntMapNavUI.close(); } catch (_) { }
    removeLayers();
    gpsState = null; offCarry = { streak: 0, since: 0 }; arrCarry = { hold: 0 }; lastPaintAlong = -1;
    var S = NS();
    if (S.state() !== 'idle') { try { S.to('idle', 'stop'); } catch (_) { S.reset(); } }
    return true;
  }

  function pause() { var S = NS(); if (!S.active() && S.state() !== 'ready') return false; stopWatch(); try { VOX().stop(); } catch (_) { } S.to('paused', 'pause'); return true; }
  function resume() {
    var S = NS();
    if (S.state() !== 'paused') return false;
    S.to(S.get().route ? 'ready' : 'ready', 'resume');
    return S.get().simulated ? startSim(S.get().route, {}) : startGPS({});
  }

  function recenter() { try { CAM().recenter(); } catch (_) { } NS().setUserPanned(false); return true; }
  function setCamera(m) { var ok = NS().setCamera(m, true); try { CAM().apply(NS().get()); } catch (_) { } return ok; }
  function setVoice(m) { var ok = NS().setVoice(m); try { VOX().setMode(m); } catch (_) { } return ok; }

  /** everything Atlas and the UI need in one read — §34's 「あと何分？」「次の曲がり角は？」 */
  function summary() {
    var s = NS().get();
    return {
      state: s.state, active: NS().active(), simulated: s.simulated,
      mode: s.mode,
      remainingDistance: s.remainingDistance, remainingDuration: s.remainingDuration, eta: s.eta,
      progress: s.routeProgress, legIndex: s.legIndex, legCount: s.legCount,
      nextManeuver: s.currentStep ? { road: NG().roadOf(s.currentStep), type: s.currentStep.type, modifier: s.currentStep.modifier, distance: s.distanceToManeuver } : null,
      followingManeuver: s.nextStep ? { road: NG().roadOf(s.nextStep), type: s.nextStep.type, modifier: s.nextStep.modifier } : null,
      currentRoad: s.currentRoad,
      offRoute: s.offRoute, rerouteCount: s.rerouteCount,
      camera: s.cameraMode, voice: s.voiceMode,
      etaMeta: s.etaMeta, notes: s.notes,
      positionsSent: _sentPositions,
      destination: s.destination ? { name: nameOf(s.destination) } : null,
    };
  }

  /* the route line has to survive a basemap change while navigating (§54) — the same watch
     js/routing.js keeps for its own layers, for the two this file owns. */
  function watchStyle() {
    try {
      GE().events.on('styledata', function () {
        if (!NS().running()) return;
        lastPaintAlong = -1;
        ensureLayers();
        var s = NS().get();
        if (s.currentLocation) paintPosition(s.currentLocation, s.matchedLocation);
        if (s.route) paintTravelled(s.route, s.matchedLocation ? s.matchedLocation.alongRouteDistance : 0);
      });
    } catch (_) { }
  }
  watchStyle();

  /* ⚠ IF THE PLANNER'S SELECTION CHANGES WHILE NAVIGATING, FOLLOW IT. A reader who taps a different
     alternative mid-drive means it; silently continuing on the old one is the «two states that
     disagree» failure #R291 removed from the planner, reappearing one level up. */
  unsubStore = (function () {
    try {
      return RS().on(function (st, why) {
        if (!NS().active()) return;
        if (why !== 'sel') return;
        var nav = currentNavRoute();
        if (!nav) return;
        NS().attach(nav, { routeSetId: st.routeSetId, altIndex: st.sel, mode: st.mode, destination: destPlace, legDestination: destPlace, legCount: nav.legs.length, legIndex: 0 });
        lastPaintAlong = -1;
      });
    } catch (_) { return null; }
  })();

  return {
    start: start, stop: stop, pause: pause, resume: resume,
    canStart: canStart, summary: summary, state: function () { return NS().state(); },
    recenter: recenter, setCamera: setCamera, setVoice: setVoice,
    acceptOffer: acceptOffer, reroute: function () { return doReroute('manual'); },
    on: function (fn) { return NS().on(fn); },
    simulate: function (o) { o = o || {}; o.simulate = true; return start(o); },
    /* exposed for tests and for the UI's own repaint — not part of the driving surface */
    _ensureLayers: ensureLayers, _onFix: onFix, _navRoute: currentNavRoute,
    _sent: function () { return _sentPositions; },
  };
})();
