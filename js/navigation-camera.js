/* ============================================================================
 *  IntMap · THE CAMERA WHILE DRIVING — window.IntMapNavCamera   (#R347)
 * ----------------------------------------------------------------------------
 *  §18 「移動中は現在地を画面中央より少し下に置き、進行方向を広く見せます」
 *      「ユーザーが手動パンしたら自動追従を一時解除。『現在地へ戻る』で復帰。
 *        いきなり勝手にカメラを奪い返さないこと。」
 *
 *  ══ ⚠⚠⚠ THE HARD PART IS TELLING OUR OWN MOVE FROM THE READER'S ═══════════════════════════════
 *  `easeTo({center,bearing,pitch})` FIRES `movestart`, `zoomstart`, `rotatestart` AND `pitchstart`.
 *  A handler that treats those as «the reader panned» suspends following on the app's own first
 *  camera move and never resumes — which looks exactly like the feature being broken, and is the
 *  commonest way this gets written. Two independent signals resolve it, and either one is enough:
 *
 *    ① `dragstart` IS ALWAYS THE READER. No camera animation produces a drag; a drag is a pointer
 *       on the canvas. It is honoured unconditionally, which matters because it is the ONE gesture
 *       that can also arrive DURING one of our eases (MapLibre aborts the animation and hands over).
 *    ② FOR THE OTHER THREE, `e.originalEvent` — the DOM event that caused it. MapLibre's scroll,
 *       pinch, keyboard and double-click handlers all carry one; `easeTo` carries none. When it is
 *       present the answer is «the reader», full stop.
 *    ③ …and when it is absent (an engine whose adapter does not forward it), fall back to a CLOCK:
 *       `selfUntil` is set to the end of every ease we ask for, plus slack. Inside that window an
 *       un-attributed rotate/pitch/zoom is ours; outside it, it is not.
 *
 *  ⚠ AND WE DO NOT TAKE THE CAMERA BACK BY OURSELVES. `apply()` returns without touching anything
 *  while `cameraUserPanned` is set. It is cleared only by `recenter()` or by the reader choosing a
 *  camera mode — both of which are a button they pressed (js/navigation-store.js's `setCamera`).
 *
 *  ══ ⚠ THE SIGN OF THE PADDING, WHICH IS EASY TO GET BACKWARDS ══════════════════════════════════
 *  The renderer places the camera's centre at `y = (H + top − bottom) / 2`. So a LARGER TOP padding
 *  moves the point on screen DOWNWARDS, which is what §18 asks for: the puck low, the road ahead
 *  filling the rest. `PUCK_Y` is that position as a fraction of the viewport, and `padFor()` is the
 *  one place the algebra lives.
 *  ⚠ THE PADDING IS RESTORED ON `detach()`. It is global camera state — every `fitBounds` in the app
 *  reads it — so leaving a 36 % inset behind after a journey would quietly mis-frame everything else.
 *
 *  ══ ⚠ NOT ONE `easeTo` PER GPS TICK (§47) ══════════════════════════════════════════════════════
 *  A stationary car still produces a fix a second, each a metre or two from the last, and each ease
 *  is a camera animation that runs for its whole duration. So a move is issued only when the target
 *  has actually changed: 1 m of centre, 1° of bearing, half a degree of pitch, or a change of zoom
 *  or padding. ⚠ THE COMPARISON IS AGAINST THE LAST TARGET WE COMMANDED, NOT AGAINST
 *  `camera.getCenter()` — mid-animation the live camera is somewhere between the two, so comparing
 *  against it would report a large difference every tick and defeat the whole test.
 *
 *  ══ ONE ENGINE-SHAPED DECISION, AND IT IS A NUMBER RATHER THAN A BRANCH ════════════════════════
 *  Everything used here (`easeTo`, `fitBounds`, `setPadding`, `getBearing`, `getZoom`, `getMaxPitch`,
 *  `events.on/off`) is in the engine contract and is answered by both adapters, so there is no
 *  `can()` branch in this file. The one thing that genuinely differs between renderers is how far
 *  they will tilt — and that is not a yes/no question, it is `camera.getMaxPitch()`, which the
 *  contract already answers with a quantity. The follow pitch is clamped to it.
 * ==========================================================================*/
window.IntMapNavCamera = (function () {
  'use strict';

  var GE = function () { return window.IntMapGeoEngine; };
  var NS = function () { return window.IntMapNavStore; };
  var NM = function () { return window.IntMapNavMatch; };

  var MODES = ['follow', 'north', 'overview', 'free'];

  /* ── the numbers, in one place ─────────────────────────────────────────────────────────────── */
  var FOLLOW_PITCH = 55;        /* §18's 50–60, clamped to the engine's ceiling below */
  var NAV_ZOOM = 16.5;          /* only ever applied on the FIRST move of a follow — see `primed` */
  var EASE_MS = 900;            /* just under the usual GPS interval, so one move ends as the next starts */
  var FIT_MS = 1000;
  var SELF_SLACK_MS = 450;      /* how long after an ease still counts as «ours» (③ above) */
  var MIN_MOVE_M = 1.0;         /* §47 — below these the camera is already where it should be */
  var MIN_BEARING_DEG = 1.0;
  var MIN_PITCH_DEG = 0.5;
  var MIN_ZOOM_DELTA = 0.02;
  var PUCK_Y = 0.68;            /* the position's height down the viewport while following */

  /* ── live state ────────────────────────────────────────────────────────────────────────────── */
  var attached = false;
  var selfUntil = 0;
  var primed = false;                    /* has this follow session set its zoom yet? */
  var lastMode = '';
  var savedPadding = null;
  var fitRoute = null;                   /* the route `overview` is currently framing */
  var bboxCache = { route: null, bbox: null };
  var last = { set: false, lng: 0, lat: 0, bearing: null, pitch: null, zoom: null, padTop: null, padBottom: null };

  function norm(d) { return ((+d % 360) + 360) % 360; }
  function markSelf(ms) { selfUntil = Date.now() + (+ms || 0) + SELF_SLACK_MS; }

  /* ── who moved the map ─────────────────────────────────────────────────────────────────────── */
  function isUser(e) {
    if (e && e.originalEvent) return true;      /* ② a real gesture carries the DOM event that caused it */
    return Date.now() >= selfUntil;             /* ③ otherwise: are we inside one of our own eases? */
  }
  function userTook() {
    if (!attached) return false;
    try { if (NS().get().cameraUserPanned) return false; } catch (_) { return false; }
    try { NS().setUserPanned(true); } catch (_) { }
    return true;
  }
  /* ① a drag cannot be produced by a camera animation, so it is never tested */
  function onDrag() { userTook(); }
  function onRotate(e) { if (isUser(e)) userTook(); }
  function onPitch(e) { if (isUser(e)) userTook(); }
  function onZoom(e) { if (isUser(e)) userTook(); }

  /* the SAME function references go to `off`, or `detach()` leaves listeners behind and a second
     navigation session double-counts every gesture */
  var BOUND = [['dragstart', onDrag], ['rotatestart', onRotate], ['pitchstart', onPitch], ['zoomstart', onZoom]];

  function attach() {
    if (attached) return false;
    var g = GE(); if (!g || !g.events) return false;
    for (var i = 0; i < BOUND.length; i++) { try { g.events.on(BOUND[i][0], BOUND[i][1]); } catch (_) { } }
    attached = true;
    savedPadding = readPadding();
    resetTargets();
    return true;
  }

  function detach() {
    if (!attached) return false;
    var g = GE();
    for (var i = 0; i < BOUND.length; i++) { try { g.events.off(BOUND[i][0], BOUND[i][1]); } catch (_) { } }
    attached = false;
    selfUntil = 0;
    restorePadding();
    resetTargets();
    return true;
  }

  function resetTargets() {
    last = { set: false, lng: 0, lat: 0, bearing: null, pitch: null, zoom: null, padTop: null, padBottom: null };
    primed = false;
    lastMode = '';
    fitRoute = null;
  }

  /* ── the viewport, for the padding algebra ─────────────────────────────────────────────────── */
  function viewSize() {
    try {
      var g = GE();
      var sz = (g && g.render && typeof g.render.size === 'function') ? g.render.size() : null;
      if (sz && +sz.height > 0 && +sz.width > 0) return { width: +sz.width, height: +sz.height };
    } catch (_) { }
    try { return { width: window.innerWidth || 1024, height: window.innerHeight || 768 }; } catch (_) { return { width: 1024, height: 768 }; }
  }

  /** the inset that puts the camera's centre at `frac` of the way down the viewport (see the header) */
  function padFor(frac) {
    var h = viewSize().height;
    var top = Math.round(h * (2 * Math.max(0.5, Math.min(0.85, frac)) - 1));
    return { top: Math.max(0, Math.min(Math.round(h * 0.5), top)), bottom: 0, left: 0, right: 0 };
  }
  function readPadding() {
    try {
      var p = GE().camera.getPadding();
      if (p && isFinite(+p.top)) return { top: +p.top || 0, bottom: +p.bottom || 0, left: +p.left || 0, right: +p.right || 0 };
    } catch (_) { }
    return null;
  }
  function restorePadding() {
    var p = savedPadding || { top: 0, bottom: 0, left: 0, right: 0 };
    savedPadding = null;
    try { GE().camera.setPadding(p); } catch (_) { }
  }

  /* ── reading the journey ───────────────────────────────────────────────────────────────────── */
  function pointOf(s) {
    var m = s && s.matchedLocation;
    if (m && isFinite(+m.lng) && isFinite(+m.lat)) return [+m.lng, +m.lat];
    var c = s && s.currentLocation;
    if (c && isFinite(+c.lng) && isFinite(+c.lat)) return [+c.lng, +c.lat];
    return null;
  }

  /* the smoothed device heading when there is one; otherwise the direction the ROUTE runs at the
     matched point, which is the right answer for a car crawling in traffic (a heading below the
     receiver's own noise floor is held by js/navigation-match.js and can be stale). */
  function headingOf(s) {
    if (s && s.heading != null && isFinite(+s.heading)) return norm(+s.heading);
    try {
      if (s && s.route && s.route.idx && s.matchedLocation) {
        var b = NM().bearingAt(s.route.idx, s.matchedLocation.alongRouteDistance);
        if (b != null && isFinite(b)) return norm(b);
      }
    } catch (_) { }
    return last.bearing == null ? 0 : last.bearing;
  }

  function clampPitch(p) {
    var max = 60;
    try { var v = GE().camera.getMaxPitch(); if (isFinite(+v) && +v > 0) max = +v; } catch (_) { }
    return Math.max(0, Math.min(max, p));
  }

  function bboxOf(route) {
    if (!route) return null;
    if (bboxCache.route === route) return bboxCache.bbox;
    var cs = route.coords || (route.idx && route.idx.coords) || [];
    var w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (var i = 0; i < cs.length; i++) {
      var x = +cs[i][0], y = +cs[i][1];
      if (!isFinite(x) || !isFinite(y)) continue;
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
    if (!isFinite(w) || !isFinite(s)) return null;
    bboxCache = { route: route, bbox: [[w, s], [e, n]] };
    return bboxCache.bbox;
  }

  /* ══ THE ONE ENTRY POINT ═══════════════════════════════════════════════════════════════════════ */
  function apply(state) {
    if (!attached) return false;
    var s = state || safeState();
    if (!s) return false;
    var g = GE();
    if (!g || !g.camera) return false;
    /* ⚠ `canDraw()`, NOT `ready()`. They are deliberately different questions (js/geo-engine.js
       #R170): `ready()` is «the style AND every tile has settled», which on a car at 60 km/h is false
       most of the time — gating the camera on it would make following stutter for the whole journey.
       `canDraw()` is «the style is parsed», which is what «is there a map to move» actually means. */
    try { if (!g.canDraw()) return false; } catch (_) { return false; }

    var mode = s.cameraMode || 'follow';
    if (mode !== lastMode) { primed = false; lastMode = mode; if (mode !== 'overview') fitRoute = null; }

    if (mode === 'free') return false;
    /* §18 — the reader is holding the camera; do not take it back on our own */
    if (s.cameraUserPanned) return false;
    if (mode === 'overview') return applyOverview(s);
    return applyFollow(s, mode === 'north');
  }

  function safeState() { try { return NS().get(); } catch (_) { return null; } }

  function applyFollow(s, northUp) {
    var ll = pointOf(s);
    if (!ll) return false;

    /* ⚠ THE SHORT WAY ROUND. 359° → 1° is +2°, not −358°, and a camera told the second one spins the
       whole world under the driver. `angleDiff` is the signed smallest angle (js/navigation-match.js);
       the commanded value is the previous one PLUS it, so the renderer animates through the seam,
       and only the normalised result is remembered so the number cannot grow without bound. */
    var target = northUp ? 0 : headingOf(s);
    var d = (last.bearing == null) ? 0 : NM().angleDiff(last.bearing, target);
    var cmdBearing = (last.bearing == null) ? target : (last.bearing + d);

    var pitch = northUp ? 0 : clampPitch(FOLLOW_PITCH);
    var pad = padFor(northUp ? 0.5 : PUCK_Y);
    var padMoved = (last.padTop !== pad.top || last.padBottom !== pad.bottom);

    /* ⚠ ZOOM IS SET ONCE PER FOLLOW SESSION, NOT PER TICK. Navigation starts from the planner's view
       of the whole route, which is useless at street level, so the first move brings it in — and
       after that the reader's own zoom is theirs to keep. */
    var zoom = primed ? null : NAV_ZOOM;

    if (last.set && zoom == null && !padMoved
      && NM().haversine(last.lng, last.lat, ll[0], ll[1]) < MIN_MOVE_M
      && Math.abs(d) < MIN_BEARING_DEG
      && Math.abs((last.pitch == null ? pitch : last.pitch) - pitch) < MIN_PITCH_DEG) return false;

    var opt = { center: [ll[0], ll[1]], bearing: cmdBearing, pitch: pitch, duration: EASE_MS };
    if (zoom != null) opt.zoom = zoom;
    /* the inset travels WITH the camera the one time it changes, so entering follow does not jolt */
    if (padMoved) opt.padding = pad;

    markSelf(EASE_MS);
    try { GE().camera.easeTo(opt); } catch (_) { return false; }

    primed = true;
    last.set = true;
    last.lng = ll[0]; last.lat = ll[1];
    last.bearing = norm(cmdBearing);
    last.pitch = pitch;
    if (zoom != null) last.zoom = zoom;
    last.padTop = pad.top; last.padBottom = pad.bottom;
    return true;
  }

  /* ⚠ FRAMED ONCE PER ROUTE, NOT ONCE PER FIX. In `overview` the camera is showing the whole journey;
     re-fitting it every second would animate continuously for no change on screen. A reroute replaces
     the route object, and identity is what re-frames. */
  function applyOverview(s) {
    var bb = bboxOf(s.route);
    if (!bb) return false;
    if (fitRoute === s.route) return false;
    fitRoute = s.route;

    var v = viewSize();
    var pad = Math.max(32, Math.round(Math.min(v.width, v.height) * 0.12));
    markSelf(FIT_MS);
    try {
      /* the fit's own padding replaces the follow inset, so the route is centred rather than pushed
         down; bearing and pitch come back to north-up and flat because that is what an overview is. */
      GE().camera.fitBounds(bb, { padding: pad, maxZoom: 15, duration: FIT_MS, bearing: 0, pitch: 0 });
    } catch (_) { return false; }

    last.set = false;              /* the next follow move has to re-prime from wherever this left us */
    last.padTop = pad; last.padBottom = pad;
    last.bearing = 0; last.pitch = 0; last.zoom = null;
    primed = false;
    return true;
  }

  /* ══ THE READER'S TWO BUTTONS ══════════════════════════════════════════════════════════════════ */

  function setMode(m) {
    if (MODES.indexOf(m) < 0) return false;
    var ok = false;
    try { ok = NS().setCamera(m, true); } catch (_) { return false; }
    /* `setCamera` clears `cameraUserPanned` for every mode but `free` — choosing a camera IS asking
       for it back (js/navigation-store.js). Targets are dropped so the next move is unconditional. */
    last.set = false;
    primed = false;
    if (m !== 'overview') fitRoute = null;
    try { apply(NS().get()); } catch (_) { }
    return ok;
  }
  function mode() { try { return NS().get().cameraMode; } catch (_) { return 'follow'; } }

  /** 「現在地へ戻る」 — resume following from wherever the reader left the camera */
  function recenter() {
    try { NS().setUserPanned(false); } catch (_) { }
    /* ⚠ RE-READ THE CAMERA FIRST. While following was suspended the reader may have rotated or zoomed
       the map; our remembered target is stale, and interpolating from it would make the first move
       back take the long way round or snap the zoom. */
    try { var b = GE().camera.getBearing(); if (isFinite(+b)) last.bearing = norm(+b); } catch (_) { }
    try { var z = GE().camera.getZoom(); if (isFinite(+z)) last.zoom = +z; } catch (_) { }
    last.set = false;
    primed = true;                 /* the reader's zoom stands — recentring is about position */
    fitRoute = null;               /* …and in `overview` «put it back» means re-frame the whole route */
    try { apply(NS().get()); } catch (_) { }
    return true;
  }

  return {
    MODES: MODES.slice(),
    attach: attach, detach: detach, apply: apply,
    setMode: setMode, mode: mode, recenter: recenter,
    attached: function () { return attached; },
    bbox: bboxOf,
    _pure: {
      padFor: padFor, viewSize: viewSize, headingOf: headingOf, pointOf: pointOf, norm: norm,
      target: function () { return last; }, selfWindow: function () { return selfUntil; },
      PUCK_Y: PUCK_Y, FOLLOW_PITCH: FOLLOW_PITCH, NAV_ZOOM: NAV_ZOOM,
      MIN_MOVE_M: MIN_MOVE_M, MIN_BEARING_DEG: MIN_BEARING_DEG,
    },
  };
})();
