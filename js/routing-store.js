/* ============================================================================
 *  IntMap · THE ROUTE STORE — window.IntMapRouteStore   (#R291)
 * ----------------------------------------------------------------------------
 *  「Atlas、独立経路UI、地図描画で共通のRouteStoreを使用してください。」
 *
 *  ══ WHY THIS FILE EXISTS ═══════════════════════════════════════════════════════════════════════
 *  Before this round there were TWO route states and they could not agree:
 *    · js/routing.js kept `_rsets` (the computed alternatives, keyed by routeSetId) — shared, and
 *      genuinely the thing Atlas and the panel both selected within;
 *    · …and, in the same closure, `pFrom / pTo / pVia / pMode / pAvoid / pAreas / pTModes /
 *      pMaxWalk / pLastResult`, which were the PANEL's private variables. Atlas could not read one
 *      of them and never wrote one, so «車で» typed at Atlas and the 🚗 chip in the panel were two
 *      different facts about the same journey.
 *  The measured consequence was smaller than that only because the panel had no door at all
 *  (`openPanel` was exported and called from nowhere — see js/routing-ui.js's header).
 *
 *  ══ WHAT IS IN HERE AND WHAT IS NOT ════════════════════════════════════════════════════════════
 *  Everything the three surfaces have to agree about, and NOTHING that draws. No DOM, no renderer,
 *  no fetch — which is what lets every transition below be verified in Node
 *  (tests/r291-checks.test.mjs) instead of through a browser.
 *
 *  ⚠ THE UNCOMMITTED TEXT IS PART OF THE STATE, and separate from the resolved place.
 *  #R126's rule — «the moment the text is EDITED the previously-selected place is invalid» — was
 *  implemented as an `input` listener that nulled a closure variable. Holding both here makes it a
 *  property instead of a habit: `setText()` clears the place, and `points()` refuses to hand a
 *  half-typed field to a router.
 * ==========================================================================*/
window.IntMapRouteStore = (function () {
  'use strict';

  /* the four travel modes this app routes. Order is the order they are offered in. */
  var MODES = ['driving', 'transit', 'walking', 'cycling'];
  var AVOIDS = ['toll', 'motorway', 'ferry'];
  var TRANSIT_MODES = ['RAIL', 'SUBWAY', 'TRAM', 'BUS', 'FERRY'];

  function blankField() { return { place: null, text: '' }; }
  function blank() {
    return {
      open: false, detent: 'mid',            /* mobile sheet: 'min' | 'mid' | 'full' */
      from: blankField(), to: blankField(), via: [],
      mode: 'driving',
      when: { kind: 'now', local: '' },      /* 'now' | 'depart' | 'arrive'; `local` is a datetime-local string */
      avoid: [], areas: [], transitModes: null, maxWalkM: null,
      request: { state: 'idle', status: '', id: 0, provider: '', at: 0 },
      result: null, routeSetId: '', sel: 0, step: -1,
      notes: [],                              /* capability shortfalls the reply has to be honest about */
      pick: null,                             /* 'from' | 'to' | 'via:<i>' | 'area' while choosing on the map */
    };
  }

  var S = blank();
  var subs = [];
  var seq = 0;

  function emit(why) { for (var i = 0; i < subs.length; i++) { try { subs[i](S, why); } catch (e) { /* a subscriber's fault is not the store's */ } } }

  /* ── the pure half. Every one of these takes a state and returns what changed, so a test can ask
        the question without a map, a panel or a network. ─────────────────────────────────────── */

  /** the ordered list of fields: start, every stop, destination */
  function fields(s) { return [s.from].concat(s.via, [s.to]); }

  /** the resolved places in order, or null if any endpoint is not confirmed */
  function points(s) {
    if (!s.from.place || !s.to.place) return null;
    return [s.from.place].concat(s.via.map(function (v) { return v.place; }).filter(Boolean), [s.to.place]);
  }
  function ready(s) { return !!points(s); }

  /** ⚠ EDITING THE TEXT INVALIDATES THE COORDINATE (#R126 §3.12), as a property of the store */
  function setText(field, text) {
    field.text = String(text == null ? '' : text);
    if (field.place && field.place.name !== field.text) field.place = null;
    return field;
  }
  function setPlace(field, place) {
    field.place = place || null;
    if (place) field.text = place.name || (Number(place.lat).toFixed(4) + ', ' + Number(place.lng).toFixed(4));
    return field;
  }

  /* ⚠ SWAPPING REVERSES THE WHOLE ITINERARY, NOT JUST THE ENDS (§5.3).
     `A → 1 → 2 → B` swapped is `B → 2 → 1 → A`. Exchanging only A and B leaves the stops in their
     original order, which is a DIFFERENT journey that happens to start and end in the right places
     — and it is what the old panel did (`const tmp=f.value; f.value=t.value; t.value=tmp;`). */
  function swap(s) {
    var t = s.from; s.from = s.to; s.to = t;
    s.via.reverse();
    return s;
  }

  /** move stop `i` to position `j`, clamped. Used by drag AND by the keyboard (§5.2). */
  function moveVia(s, i, j) {
    var n = s.via.length;
    if (!(i >= 0 && i < n)) return s;
    j = Math.max(0, Math.min(n - 1, j));
    if (j === i) return s;
    var v = s.via.splice(i, 1)[0];
    s.via.splice(j, 0, v);
    return s;
  }

  /* ══ THE REQUEST OPTIONS, DERIVED — never assembled twice ══════════════════════════════════════
     Atlas and the panel both hand this to IntMapRouting.route(), so «the panel says avoid tolls»
     and «Atlas says avoid tolls» cannot mean two different requests. */
  function requestOptions(s) {
    var pts = points(s);
    if (!pts) return null;
    var o = { mode: s.mode };
    if (pts.length > 2) o.via = pts.slice(1, -1).map(function (p) { return { lng: +p.lng, lat: +p.lat }; });
    if (s.mode === 'driving' && s.avoid.length) o.avoid = s.avoid.slice();
    if (s.mode !== 'transit' && s.areas.length) o.avoidAreas = s.areas.slice();
    if (s.mode === 'transit') {
      if (s.transitModes && s.transitModes.length && s.transitModes.length < TRANSIT_MODES.length) o.transitModes = s.transitModes.slice();
      if (s.maxWalkM > 0) o.maxWalkM = s.maxWalkM;
    }
    var iso = whenISO(s);
    if (iso) { o.time = iso; o.arriveBy = (s.when.kind === 'arrive'); }
    return { from: { lng: +pts[0].lng, lat: +pts[0].lat }, to: { lng: +pts[pts.length - 1].lng, lat: +pts[pts.length - 1].lat }, opts: o };
  }

  /* ⚠ (#R291) THE TIME THE READER TYPED IS IN THE TIMEZONE THE APP IS SET TO, NOT THE DEVICE'S.
     `<input type="datetime-local">` has no zone, and `new Date('2026-08-21T14:30')` reads it as the
     DEVICE's local time. IntMap has a clock-timezone setting (HOST.userTZ) that a reader may have
     set to the place they are travelling in, and #R289's lesson is that the dangerous half of a
     timezone is the WRITING, not the instant: 14:30 typed by a reader whose app clock says
     Asia/Tokyo must be 14:30 in Tokyo whatever the laptop is set to.
     The conversion is one correction by the offset AT THAT INSTANT (never a fixed offset — the
     journey may cross a DST boundary), which is exactly the shape #R289 landed on. */
  function whenISO(s, tz) {
    if (!s.when || s.when.kind === 'now' || !s.when.local) return null;
    var naive = new Date(s.when.local);
    if (!isFinite(naive.getTime())) return null;
    if (!tz || tz === 'auto') return naive.toISOString();
    var off = tzOffsetMs(naive, tz);
    /* ⚠ THE SIGN. `getTimezoneOffset()` is UTC-minus-local, so the device offset is its NEGATIVE:
       `naive.getTime() - getTimezoneOffset()*60000` is the wall clock read as if it were UTC. Written
       with a + it is off by twice the device offset — which on a UTC+9 machine put a 14:30 departure
       eighteen hours earlier, and is the kind of error only a test in a NAMED zone can see (⑦). */
    return new Date(naive.getTime() - naive.getTimezoneOffset() * 60000 - off).toISOString();
  }
  /** the offset of `tz` from UTC, in ms, at the instant `d` — measured through Intl, not tabulated */
  function tzOffsetMs(d, tz) {
    try {
      var f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      var p = {}; f.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
      var asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
      return asUTC - Math.floor(d.getTime() / 1000) * 1000;
    } catch (e) { return 0; }
  }

  /* ══ REQUEST LIFECYCLE ══════════════════════════════════════════════════════════════════════════
     #R126 gave the ROUTER a requestId so a stale response could not draw. The store needs the same
     property one level up, because the panel and Atlas both write results into it: a reply that
     belongs to an older request must not become the state, however it arrives. */
  function begin(why) { S.request = { state: 'loading', status: '', id: ++seq, provider: '', at: 0 }; emit(why || 'request'); return S.request.id; }
  function accepts(id) { return id === S.request.id; }
  function settle(id, res, notes) {
    if (!accepts(id)) return false;                       /* superseded — the newer request owns the UI */
    if (res && res.ok) {
      S.request = { state: 'ok', status: 'success', id: id, provider: res.provider || '', at: Date.now() };
      S.result = res; S.routeSetId = res.routeSetId || ''; S.sel = res.sel || 0; S.step = -1;
    } else {
      S.request = { state: 'error', status: (res && res.status) || 'provider_unavailable', id: id, provider: (res && res.provider) || '', at: Date.now() };
      S.result = null; S.routeSetId = ''; S.sel = 0; S.step = -1;
    }
    S.notes = notes || [];
    emit('result');
    return true;
  }

  /** the drawn route is thrown away — the ONLY thing that does this (§2.2) */
  function clearRoute() {
    S.result = null; S.routeSetId = ''; S.sel = 0; S.step = -1;
    S.request = { state: 'idle', status: '', id: ++seq, provider: '', at: 0 };
    S.notes = [];
    emit('clear');
  }

  function reset() { S = blank(); seq++; emit('reset'); }

  /* ── the small mutable surface the UI writes through. Every setter emits, so the panel, the map
        and the Tools row cannot hold three different opinions. ──────────────────────────────── */
  var API = {
    MODES: MODES.slice(), AVOIDS: AVOIDS.slice(), TRANSIT_MODES: TRANSIT_MODES.slice(),
    get: function () { return S; },
    on: function (fn) { if (typeof fn === 'function') { subs.push(fn); return function () { var i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; } return function () { }; },
    emit: emit,

    setOpen: function (v) { S.open = !!v; emit('open'); },
    setDetent: function (d) { S.detent = d; emit('detent'); },
    setMode: function (m) { if (MODES.indexOf(m) >= 0 && S.mode !== m) { S.mode = m; emit('mode'); } },
    setWhen: function (kind, local) { S.when = { kind: kind || 'now', local: local == null ? S.when.local : String(local) }; emit('when'); },
    setAvoid: function (k, on) { var i = S.avoid.indexOf(k); if (on && i < 0) S.avoid.push(k); else if (!on && i >= 0) S.avoid.splice(i, 1); emit('avoid'); },
    setAreas: function (a) { S.areas = Array.isArray(a) ? a : []; emit('areas'); },
    setTransitModes: function (a) { S.transitModes = Array.isArray(a) ? a.slice() : null; emit('transitModes'); },
    setMaxWalk: function (m) { S.maxWalkM = (isFinite(+m) && +m > 0) ? +m : null; emit('maxWalk'); },
    setPick: function (p) { S.pick = p || null; emit('pick'); },
    setSel: function (i) { S.sel = Math.max(0, i | 0); S.step = -1; emit('sel'); },
    setStep: function (i) { S.step = (i == null ? -1 : i | 0); emit('step'); },

    /** field is 'from' | 'to' | an index into via */
    field: function (which) {
      if (which === 'from') return S.from;
      if (which === 'to') return S.to;
      var i = (typeof which === 'number') ? which : parseInt(String(which).replace(/^via:/, ''), 10);
      return S.via[i] || null;
    },
    setText: function (which, text) { var f = API.field(which); if (f) { setText(f, text); emit('text'); } },
    setPlace: function (which, place) { var f = API.field(which); if (f) { setPlace(f, place); emit('place'); } },
    addVia: function (place) { S.via.push(place ? setPlace(blankField(), place) : blankField()); emit('via'); return S.via.length - 1; },
    removeVia: function (i) { if (i >= 0 && i < S.via.length) { S.via.splice(i, 1); emit('via'); } },
    moveVia: function (i, j) { moveVia(S, i, j); emit('via'); },
    swap: function () { swap(S); emit('swap'); },

    begin: begin, accepts: accepts, settle: settle, clearRoute: clearRoute, reset: reset,
    hasRoute: function () { return !!(S.result && S.result.ok); },
    requestOptions: function (tz) { var r = requestOptions(S); if (r) { var iso = whenISO(S, tz); if (iso) { r.opts.time = iso; r.opts.arriveBy = (S.when.kind === 'arrive'); } else { delete r.opts.time; delete r.opts.arriveBy; } } return r; },

    /* the pure half, exported by name so tests exercise the SAME code the app runs */
    _pure: { blank: blank, blankField: blankField, fields: fields, points: points, ready: ready,
             setText: setText, setPlace: setPlace, swap: swap, moveVia: moveVia,
             requestOptions: requestOptions, whenISO: whenISO, tzOffsetMs: tzOffsetMs },
  };
  return API;
})();
