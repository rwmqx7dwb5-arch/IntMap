/* ============================================================================
 *  IntMap · THE ROUTER THAT KNOWS ABOUT TRAFFIC — window.IntMapRouteTraffic   (#R347)
 * ----------------------------------------------------------------------------
 *  §5: 「現在の『リアルタイム交通量は未反映』という状態を、本当に解消できるProviderが利用可能な
 *  環境では解消してください。」 — the Mapbox Directions adapter, and nothing else.
 *
 *  ══ WHAT THIS FILE IS RESPONSIBLE FOR ═════════════════════════════════════════════════════════
 *  Turning one vendor's answer into the shape the rest of the app already speaks: the same result
 *  keys js/routing.js returns, the same OSRM-shaped `steps` (Mapbox's Directions API is
 *  OSRM-compatible, so the turn text, the lane guidance and the step→map highlight all work
 *  unchanged), and the congestion / incident / ETA readings that no other provider in this app can
 *  produce at all.
 *
 *  ⚠ WHAT THIS FILE IS NOT. It does not decide whether Mapbox may serve a request — that is
 *  js/routing-providers.js's `forRequest()`, and the capability table there is canonical. It does
 *  not draw: js/routing.js owns the map layers and its route-set map is private to that closure.
 *  And it holds no key: every request goes to supabase/functions/routing-relay, which is where the
 *  token lives (this repository is public — a key in this file is a key in the world).
 *
 *  ══ ⚠⚠ THREE OF MAPBOX'S OWN TERMS ARE ENFORCED HERE, NOT DESCRIBED ═══════════════════════════
 *    · §2.10.1 forbids exporting, downloading, CACHING or storing a Navigation API result. So this
 *      file writes nothing to localStorage, sessionStorage, the Cache API or IndexedDB, and keeps
 *      no module-scope copy of an answer. The ONE thing it remembers is `probe()`'s boolean, which
 *      is «is a key configured» — a fact about our own deployment, not a result. The Edge Function
 *      answers `Cache-Control: no-store` for the same reason.
 *      ⚠ AND THE FLAG IS READ, NOT ASSUMED: `remember()` / `recall()` below are the one place a
 *      cache would have gone, and they are governed by `IntMapRouteProviders.noStore('mapbox')`.
 *    · §1.5(ii) forbids using the service to train or operate AI. Nothing here talks to the AI
 *      proxy; `IntMapRouteProviders.allowsAI('mapbox')` is what any surface that wants to must ask.
 *    · §1.4.1 requires the Mapbox wordmark wherever its Service Offerings are used — `logoRequired`
 *      in the same table, for the surface that renders the attribution.
 *
 *  ⚠ NOTHING IS INVENTED. Where Mapbox does not answer — no `duration_typical`, no congestion
 *  annotation, no incidents — this returns `null` or an empty array. A traffic colour drawn from a
 *  guess is worse than no traffic colour, because it cannot be told apart from a measured one.
 * ==========================================================================*/
window.IntMapRouteTraffic = (function () {
  'use strict';

  var ID = 'mapbox';

  /* ── the canon, read at CALL time. js/routing-providers.js may not have been evaluated when this
        module is, and a table captured as `undefined` would be undefined for the session. ─────── */
  function P() { return window.IntMapRouteProviders; }
  function def() { try { return P().byId(ID); } catch (_) { return null; } }
  function E() { return window.IntMapRouteErrors; }
  function code(x) { try { return E().classify(x); } catch (_) { return 'UNKNOWN'; } }
  function httpCode(s) { try { return E().fromHTTP(s); } catch (_) { return 'UNKNOWN'; } }
  function appLang() {
    try { return (window.IntMapHost && window.IntMapHost.lang) || (window.HOST && window.HOST.lang) || document.documentElement.lang || 'en'; }
    catch (_) { return 'en'; }
  }

  /** ⚠ TRUE IS THE SAFE DIRECTION. A table we cannot read must not be read as permission to store. */
  function noStore() { try { return !!P().noStore(ID); } catch (_) { return true; } }

  /* ⚠ THE ONE PLACE A CACHE WOULD HAVE GONE, AND WHY IT IS EMPTY. `refresh()` would be friendlier
     if it could be called with no arguments — it would look up the last route id itself. That
     requires keeping an answer, which §2.10.1 forbids for THIS provider, so the flag decides:
     with `noStore` set (which is what the table says for Mapbox) `_last` stays null for the life of
     the page and `refresh()` insists on being told which route it is refreshing. */
  var _last = null;
  function remember(x) { if (!noStore()) _last = x; return x; }
  function recall() { return noStore() ? null : _last; }

  /* ── the relay. ⚠ `window.SUPABASE_URL` is read at call time (#R216): src/vendor.js may not have
        run yet, and a base captured as '' would delete the provider for the whole session. ────── */
  function relayUrl(qs) {
    var d = def();
    var name = (d && d.relay) || 'routing-relay';
    var base = '';
    try { base = String(window.SUPABASE_URL || '').replace(/\/$/, ''); } catch (_) { base = ''; }
    return base ? (base + '/functions/v1/' + name + '?' + qs) : '';
  }

  /* ── cancellation. Same shape js/routing.js uses: a deadline per request, a pool so a NEWER
        request can abort the ones it supersedes, and a monotonic id so a slow answer that arrives
        after its successor cannot be drawn. ─────────────────────────────────────────────────── */
  var _acs = [];
  function mkAC(ms, pooled) {
    var ac = new AbortController();
    ac._t = setTimeout(function () { try { ac.abort(); } catch (_) { /* already settled */ } }, ms || 20000);
    if (pooled !== false) _acs.push(ac);
    return ac;
  }
  function rmAC(ac) {
    try { clearTimeout(ac._t); } catch (_) { /* nothing pending */ }
    var i = _acs.indexOf(ac); if (i >= 0) _acs.splice(i, 1);
  }
  function abortInflight() {
    var live = _acs.slice(); _acs.length = 0;
    live.forEach(function (ac) { try { clearTimeout(ac._t); } catch (_) { /* nothing pending */ } try { ac.abort(); } catch (_) { /* already settled */ } });
  }

  /* `_seq` is what this module mints when nobody handed it a request id; `_cur` is the id IN FORCE.
     A caller that already runs its own sequence (js/routing.js stamps `opts._rid`) keeps its
     numbering — what matters is only that the newest request to START is the one allowed to win. */
  var _seq = 0, _cur = 0, _rsSeq = 0;

  /* ══ PROBE (§57) ═══════════════════════════════════════════════════════════════════════════════
     「キー投入後すぐ有効化できる状態」. The page cannot see the key, so it asks whether one is
     configured; `setAvailable` is what turns that into a UI that offers traffic — or does not.
     ⚠ ONE REQUEST, HOWEVER MANY CALLERS: the in-flight promise is shared, and a CONCLUSIVE answer
     is kept for the session because a deployment's secrets do not change while the page is open.
     ⚠ A TRANSPORT FAILURE IS NOT AN ANSWER. It teaches us nothing about the key, so it is not
     cached (a single blip must not disable traffic for the session) and it leaves availability
     UNKNOWN rather than asserting false — `available()` already treats unknown as «do not offer». */
  var _probe = null;
  function probe() {
    if (_probe) return _probe;
    var u = relayUrl('probe=1');
    if (!u) { _probe = null; return Promise.resolve(false); }
    var ac = mkAC(8000, false);          /* NOT pooled: a route request must not cancel the probe */
    _probe = fetch(u, { signal: ac.signal })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (j) {
        if (!j || !j.providers || typeof j.providers[ID] !== 'boolean') throw new Error('malformed');
        var ok = !!j.providers[ID];
        try { P().setAvailable(ID, ok); } catch (_) { /* the table is the only consumer */ }
        return ok;
      })
      .catch(function () { _probe = null; return false; })
      .then(function (v) { rmAC(ac); return v; });
    return _probe;
  }

  /** the table's answer, never a second opinion */
  function available() { try { return !!P().available(ID); } catch (_) { return false; } }

  /* ══ THE REQUEST ═══════════════════════════════════════════════════════════════════════════════ */

  function normMode(m) {
    m = String(m == null ? 'driving' : m).toLowerCase();
    if (/walk|foot|pedestr/.test(m)) return 'walking';
    if (/cycl|bike/.test(m)) return 'cycling';
    if (/transit|public|train|bus/.test(m)) return 'transit';
    return 'driving';
  }

  /* Mapbox takes ISO 8601. UTC with an explicit offset is unambiguous wherever the journey is,
     which a bare local `YYYY-MM-DDThh:mm` is not. */
  function mbTime(iso) {
    var t = new Date(iso);
    if (!isFinite(t.getTime())) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return t.getUTCFullYear() + '-' + p(t.getUTCMonth() + 1) + '-' + p(t.getUTCDate())
      + 'T' + p(t.getUTCHours()) + ':' + p(t.getUTCMinutes()) + ':' + p(t.getUTCSeconds()) + '+00:00';
  }

  /* The instruction text comes back in whatever language is asked for, so it has to be asked for —
     otherwise every reader of this app gets English turns however completely the UI is translated.
     ⚠ zh-Hant IS SENT AS zh-Hans: the vendor's instruction set is published in Simplified only, and
     Mapbox falls back to English for a tag it does not know — which is a worse answer for a
     Traditional reader than Simplified is. Marked because it comes from the reference, not from a
     measurement (`evidence: 'documented'` in the capability table). */
  function mbLang() {
    var tag = '';
    try { tag = window.IntMapLang.htmlTag(appLang()) || ''; } catch (_) { tag = ''; }
    if (!tag) return '';
    return /^zh-hant/i.test(tag) ? 'zh-Hans' : tag;
  }

  /* The mean of a ring's vertices — see the note at the call site for what it is and is not.
     ⚠ FOUR POSITIONS IS THE FLOOR, the same rule js/routing.js applies before handing a ring to
     Valhalla: a closed ring needs at least four, and anything shorter is a half-finished drawing
     rather than an area. It is dropped, never rounded up into a point the reader never drew.
     ⚠ AND THE REPEATED CLOSING VERTEX IS NOT COUNTED TWICE — it would pull the mean towards
     whichever corner the drawing started at. */
  function ringPoint(ring) {
    if (!Array.isArray(ring) || ring.length < 4) return null;
    var pts = [];
    for (var i = 0; i < ring.length; i++) {
      var p = ring[i];
      if (!Array.isArray(p) || !isFinite(+p[0]) || !isFinite(+p[1])) continue;
      pts.push([+p[0], +p[1]]);
    }
    if (pts.length < 4) return null;
    var last = pts[pts.length - 1], first = pts[0];
    if (last[0] === first[0] && last[1] === first[1]) pts.pop();
    if (!pts.length) return null;
    var sx = 0, sy = 0;
    for (var k = 0; k < pts.length; k++) { sx += pts[k][0]; sy += pts[k][1]; }
    return [Math.round((sx / pts.length) * 1e6) / 1e6, Math.round((sy / pts.length) * 1e6) / 1e6];
  }

  /* ⚠ SECOND COPY, AND SAID SO. js/routing.js derives the same «which roads is this route mostly
     made of» from the same steps, but `_majorRoads` lives inside that file's closure and is not
     exported. Its right home is js/routing-cards.js (it is a presentation derivation, and both
     surfaces render it); moving it is an edit to files this change did not open. Until then this is
     the identical derivation — road names weighted by the distance they carry, biggest first, and
     nothing invented for a route whose steps carry no names. */
  function majorRoads(steps, n) {
    var by = [];
    (steps || []).forEach(function (st) {
      var nm = String((st.ref || '').split(/[;,]/)[0] || st.name || '').trim();
      if (!nm) return;
      for (var i = 0; i < by.length; i++) if (by[i][0] === nm) { by[i][1] += (st.distance || 0); return; }
      by.push([nm, st.distance || 0]);
    });
    return by.sort(function (a, b) { return b[1] - a[1]; }).slice(0, n || 3).map(function (e) { return e[0]; });
  }

  /* ⚠ SECOND COPY, for the same reason: `ALT_PAL` and the per-mode line colour are js/routing.js
     constants that its draw path reads off each alternative. An alternative built here has to carry
     the same values or it draws in nothing. */
  var PAL = ['#1a73e8', '#e8710a', '#12a150', '#a142f4', '#e52592'];
  function modeColour(mode) { return mode === 'walking' ? '#7a7f87' : mode === 'cycling' ? '#00897b' : '#1a73e8'; }

  /* the descriptor js/routing-cards.js renders — «fastest» / «shortest» / «+N min», plus the avoid
     list. ⚠ THE SENTENCE IS NOT BUILT HERE: `altLabel()` is the one implementation of it in nine
     languages, and `label` is only the frozen copy an old Atlas transcript keeps (#R291 追記). */
  function labelAlts(alts, avoid) {
    if (!alts.length) return;
    var av = (avoid && avoid.length) ? avoid.slice() : null;
    var fast = alts[0], si = 0, sd = alts[0].distance;
    for (var i = 1; i < alts.length; i++) if (alts[i].distance < sd) { sd = alts[i].distance; si = i; }
    alts.forEach(function (a, i) {
      a.labelKey = (i === 0) ? { k: 'fastest', avoid: av }
        : (i === si) ? { k: 'shortest', avoid: av }
          : { k: 'delta', min: Math.round((a.duration - fast.duration) / 60), avoid: av };
      try { a.label = window.IntMapRouteCards.altLabel(a, { lang: appLang() }); } catch (_) { a.label = ''; }
    });
  }

  function bad(status, extra) {
    var out = { ok: false, status: status, provider: ID };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
    return out;
  }

  /**
   * A traffic-aware route, in the shape js/routing.js's `route()` returns.
   * `opts`: { mode, via, avoid, avoidAreas, time, arriveBy, _rid }.
   */
  async function route(from, to, opts) {
    opts = opts || {};
    var d = def();
    if (!d) return bad('INVALID_REQUEST');
    if (!from || to == null || !isFinite(+from.lng) || !isFinite(+from.lat) || !isFinite(+to.lng) || !isFinite(+to.lat)) return bad('INVALID_REQUEST');
    var mode = normMode(opts.mode);
    if (d.modes.indexOf(mode) < 0) return bad('INVALID_REQUEST');
    /* ⚠ UNKNOWN IS NOT AVAILABLE (§57). Asking the relay before the probe has come back would spend
       a request to learn what the probe is already learning. */
    if (!available()) return bad('PROVIDER_UNAVAILABLE');

    var c = d.caps || {};
    var via = (Array.isArray(opts.via) ? opts.via : []).filter(function (p) { return p && isFinite(+p.lng) && isFinite(+p.lat); });
    if (via.length + 2 > (+c.maxWaypoints || 25)) return bad('INVALID_REQUEST');

    /* the id in force. A caller with its own sequence keeps its numbering (see `_seq` above). */
    var rid = (opts._rid != null && isFinite(+opts._rid)) ? +opts._rid : (_seq = Math.max(_seq, _cur) + 1);
    _cur = rid; opts._rid = rid;
    abortInflight();

    /* ⚠ `arrive_by` IS A DIFFERENT PROFILE. Mapbox publishes it for `mapbox/driving` only — asking
       `driving-traffic` for an arrival time is a 422, not a slower answer. So an arrive-by request
       is answered without live traffic, and the reply SAYS which of the two it got rather than
       letting a reader assume the number includes congestion. */
    var profile = (d.profile && d.profile[mode]) || '';
    if (!profile) return bad('INVALID_REQUEST');
    var when = opts.time ? mbTime(opts.time) : '';
    var arriveBy = !!(when && opts.arriveBy && c.arriveBy);
    var departAt = !!(when && !opts.arriveBy && c.departAt);
    var trafficSuppressed = '';
    if (arriveBy && profile === 'mapbox/driving-traffic') { profile = 'mapbox/driving'; trafficSuppressed = 'arriveBy'; }
    var traffic = (profile === 'mapbox/driving-traffic');

    /* ⚠ THE ANNOTATIONS ARE PER PROFILE. `congestion` and `congestion_numeric` exist only on the
       traffic profile and `maxspeed` only on the two driving ones; asking for one the profile does
       not carry fails the whole request rather than omitting the column. */
    var ann = traffic ? 'congestion,congestion_numeric,duration,distance,maxspeed'
      : (profile === 'mapbox/driving' ? 'duration,distance,maxspeed' : 'duration,distance');

    /* the avoid chips, as Mapbox's own exclusions (driving profiles only — the walking and cycling
       profiles have neither tolls nor motorways to exclude). */
    var ex = [];
    if (/driving/.test(profile)) {
      (Array.isArray(opts.avoid) ? opts.avoid : []).forEach(function (k) {
        var v = ({ toll: 'toll', motorway: 'motorway', ferry: 'ferry' })[k];
        if (v && ex.indexOf(v) < 0) ex.push(v);
      });
    }
    /* ⚠ MAPBOX EXCLUDES POINTS, NOT POLYGONS. Valhalla takes `exclude_polygons` and honours the box
       as drawn; Mapbox takes up to fifty `point(lng lat)` exclusions, which is a genuine, documented
       keep-out and a WEAKER one — a route may still clip the corner of a drawn area. So each ring is
       sent as one point and the reply reports both numbers (`avoidAreasAsked` vs `avoidAreasAsPoints`)
       instead of implying the box was honoured. */
    var areasAsked = (Array.isArray(opts.avoidAreas) ? opts.avoidAreas.length : 0);
    var areaPts = 0;
    if (/driving/.test(profile)) {
      (Array.isArray(opts.avoidAreas) ? opts.avoidAreas : []).forEach(function (ring) {
        if (ex.length >= 50) return;
        var pt = ringPoint(ring);
        if (!pt) return;                       /* a degenerate ring is dropped, never guessed at */
        ex.push('point(' + pt[0] + ' ' + pt[1] + ')'); areaPts++;
      });
    }

    var pts = [from].concat(via, [to]);
    var coords = pts.map(function (p) { return (+p.lng).toFixed(6) + ',' + (+p.lat).toFixed(6); }).join(';');

    var qs = ['provider=mapbox', 'profile=' + encodeURIComponent(profile), 'coords=' + encodeURIComponent(coords),
      'overview=full', 'geometries=geojson', 'steps=true', 'banner_instructions=true',
      'annotations=' + encodeURIComponent(ann)];
    if (traffic && c.routeRefresh) qs.push('enable_refresh=true');
    /* the table says Mapbox returns none once there is a via point, so the request stops asking —
       and `altsSuppressed` below is what says so out loud (§9.2). */
    if (!via.length && (+c.alternatives || 0) > 1) qs.push('alternatives=true');
    if (ex.length) qs.push('exclude=' + encodeURIComponent(ex.join(',')));
    if (departAt) qs.push('depart_at=' + encodeURIComponent(when));
    if (arriveBy) qs.push('arrive_by=' + encodeURIComponent(when));
    var lg = mbLang(); if (lg) qs.push('language=' + encodeURIComponent(lg));

    var u = relayUrl(qs.join('&'));
    if (!u) return bad('PROVIDER_UNAVAILABLE');

    var j = null, status = 'PROVIDER_UNAVAILABLE';
    var ac = mkAC(+d.timeoutMs || 20000);
    try {
      var r = await fetch(u, { signal: ac.signal });
      if (r.ok) j = await r.json();
      else status = httpCode(r.status);       /* the relay already mapped the vendor's status onto ours */
    } catch (e) {
      status = (rid !== _cur) ? 'CANCELLED' : code(e);
    } finally { rmAC(ac); }

    if (rid !== _cur) return bad('CANCELLED');
    if (!j) return bad(status);

    /* ⚠ MAPBOX SAYS «NO ROUTE» WITH HTTP 200. The code is in the body, so a reply that never reached
       an error status can still be a refusal — and it is a different refusal from a server that is
       down, which is the whole point of js/routing-errors.js. */
    var mc = String(j.code || '');
    var routes = Array.isArray(j.routes) ? j.routes : [];
    if (mc !== 'Ok' || !routes.length) {
      return bad(/NoRoute|NoSegment|NoTrips/i.test(mc) ? 'NO_ROUTE'
        : /InvalidInput|ProfileNotFound/i.test(mc) ? 'INVALID_REQUEST'
          : (mc === 'Ok') ? 'NO_ROUTE'          /* answered, and the answer is that there are none */
            : code(mc || 'UNKNOWN'));
    }

    var at = Date.now();
    var uuid = String(j.uuid || '');
    var col = modeColour(mode), walk = (mode === 'walking') ? 1 : 0;

    /* ⚠ NO DEDUPLICATION PASS. js/routing.js collapses near-identical OSRM alternatives because the
       demo server returns them; Mapbox's contract is that an alternative is «significantly
       different», so a second copy of that logic here would be a second opinion about nothing. */
    var alts = routes.map(function (rt, i) {
      var legs = Array.isArray(rt.legs) ? rt.legs : [];
      var line = (rt.geometry && rt.geometry.coordinates) || [];
      var steps = [];
      legs.forEach(function (l) { (l.steps || []).forEach(function (s) { steps.push(s); }); });
      return {
        lines: [{ coords: line, walk: walk, col: col }], stops: [],
        geometry: rt.geometry || { type: 'LineString', coordinates: line },
        coords: line, steps: steps,
        legDurations: legs.map(function (l) { return l.duration || 0; }),
        duration: rt.duration, distance: rt.distance,
        color: PAL[i % PAL.length], roads: majorRoads(steps, 3),
        /* ⚠ THE TRAFFIC PAYLOAD RIDES ON THE ANSWER, NEVER IN A MODULE VARIABLE. `congestionSegments`,
           `etaOf`, `incidents` and `closures` read it from the object the caller is holding, which is
           what «not stored» means: when the caller drops the result, the vendor's data is gone. */
        _mb: {
          at: at, uuid: uuid, routeIndex: i, traffic: traffic, profile: profile,
          durationTypical: (rt.duration_typical != null && isFinite(+rt.duration_typical)) ? +rt.duration_typical : null,
          legs: legs.map(function (l) {
            return {
              annotation: l.annotation || null,
              incidents: Array.isArray(l.incidents) ? l.incidents : [],
              closures: Array.isArray(l.closures) ? l.closures : [],
              duration: (l.duration != null && isFinite(+l.duration)) ? +l.duration : null,
              durationTypical: (l.duration_typical != null && isFinite(+l.duration_typical)) ? +l.duration_typical : null,
            };
          }),
        },
      };
    });
    /* ⚠ `_mb.routeIndex` IS MAPBOX'S INDEX AND SURVIVES THE SORT. The refresh endpoint addresses a
       route by its position in the ORIGINAL answer; renumbering it to the display order would
       refresh a different route than the one on screen. Only the palette follows the sort. */
    alts.sort(function (a, b) { return (a.duration || 0) - (b.duration || 0); });
    alts.forEach(function (a, i) { a.color = PAL[i % PAL.length]; });
    labelAlts(alts, opts.avoid);

    /* ⚠ THIS ID NAMES THIS ANSWER'S ROUTE SET, AND NOTHING IS DRAWN. js/routing.js keeps its own map
       of drawn sets (`_rsNew`, private to that closure); when this answer is registered there, that
       id supersedes this one. `_alts` carries the internal alternative objects — with `lines` and
       `geometry` — because that is what the draw path takes. */
    var setId = 'mbrs' + (++_rsSeq);
    var b0 = alts[0];
    remember({ routeId: uuid, setId: setId });

    return {
      ok: true, status: 'success', road: true, provider: ID, routeSetId: setId, sel: 0, mode: mode,
      /* the chips are a driving-profile parameter; on foot or by bike they were never sent, and
         `avoidDropped` is what says so rather than leaving the reader to notice (§9.2) */
      avoid: opts.avoid || null,
      avoidDropped: !!(opts.avoid && opts.avoid.length && !/driving/.test(profile)),
      avoidAreasAsked: areasAsked, avoidAreasAsPoints: areaPts, avoidAreasDropped: (areasAsked > areaPts),
      altsSuppressed: (via.length && alts.length < 2) ? 'via' : '',
      /* what the numbers mean, said rather than implied */
      traffic: traffic, trafficSuppressed: trafficSuppressed,
      routeId: uuid, noStore: noStore(),
      distance: b0.distance, duration: b0.duration, steps: b0.steps, coords: b0.coords,
      legDurations: b0.legDurations,
      alternatives: alts.map(function (a) {
        return {
          duration: a.duration, distance: a.distance, steps: a.steps, label: a.label, labelKey: a.labelKey,
          color: a.color, coords: a.coords, legDurations: a.legDurations, roads: a.roads, _mb: a._mb,
        };
      }),
      _alts: alts,
    };
  }

  /* ══ READING THE TRAFFIC ═══════════════════════════════════════════════════════════════════════ */

  /* the five Mapbox publishes. Anything else it ever adds reads as `unknown` rather than as a
     colour this app made up. */
  var LEVELS = { low: 'low', moderate: 'moderate', heavy: 'heavy', severe: 'severe', unknown: 'unknown' };

  /** how many segments each leg contributes, so a leg-relative index can be placed on the route */
  function legSpans(legs) {
    var out = [], off = 0;
    for (var i = 0; i < legs.length; i++) {
      var a = legs[i].annotation || {};
      var n = (a.congestion && a.congestion.length) || (a.congestion_numeric && a.congestion_numeric.length)
        || (a.distance && a.distance.length) || (a.duration && a.duration.length) || 0;
      out.push({ off: off, n: n });
      off += n;
    }
    return out;
  }

  /**
   * The route line, cut into runs of one congestion level.
   * `[{from,to,level,numeric}]` where `from`/`to` index the alternative's `coords`.
   * ⚠ EMPTY WHEN THERE IS NO DATA. Mapbox's congestion array is per SEGMENT (coords.length - 1);
   * with no such array there is nothing to colour, and a guessed colour is indistinguishable from a
   * measured one to the reader looking at it.
   */
  function congestionSegments(alt) {
    var mb = alt && alt._mb;
    if (!mb || !Array.isArray(mb.legs) || !mb.legs.length) return [];
    var spans = legSpans(mb.legs);
    var levels = [], numeric = [], any = false;
    for (var i = 0; i < mb.legs.length; i++) {
      var a = mb.legs[i].annotation || {};
      var cg = Array.isArray(a.congestion) ? a.congestion : null;
      var cn = Array.isArray(a.congestion_numeric) ? a.congestion_numeric : null;
      if (cg) any = true;
      for (var k = 0; k < spans[i].n; k++) {
        levels.push(cg ? (LEVELS[String(cg[k])] || 'unknown') : 'unknown');
        var v = cn ? cn[k] : null;
        numeric.push((v == null || !isFinite(+v)) ? null : +v);
      }
    }

    /* a closure is a fact about the road, not a level of congestion — it overrides whatever the
       congestion array said for the same stretch */
    var closed = [];
    for (var li = 0; li < mb.legs.length; li++) {
      (mb.legs[li].closures || []).forEach(function (cl) {
        var s = Math.max(0, (cl.geometry_index_start | 0)), e = Math.max(s, (cl.geometry_index_end | 0));
        closed.push({ from: spans[li].off + s, to: spans[li].off + e });
      });
    }

    if (!any) {
      /* No congestion data at all. The closures ARE data, so they are reported; the rest of the line
         is left uncoloured rather than filled with «unknown» noise. */
      return closed.sort(function (x, y) { return x.from - y.from; })
        .map(function (cl) { return { from: cl.from, to: cl.to, level: 'closed', numeric: null }; });
    }

    closed.forEach(function (cl) {
      for (var k = cl.from; k < cl.to && k < levels.length; k++) if (k >= 0) levels[k] = 'closed';
    });

    var out = [], cur = null;
    for (var s2 = 0; s2 < levels.length; s2++) {
      if (!cur || cur.level !== levels[s2]) {
        cur = { from: s2, to: s2 + 1, level: levels[s2], numeric: numeric[s2] };
        out.push(cur);
      } else {
        cur.to = s2 + 1;
        /* ⚠ THE WORST IN THE RUN, NOT THE MEAN. A run is one level; averaging its numbers would
           report a stretch as easier than its slowest part actually is. */
        if (numeric[s2] != null) cur.numeric = (cur.numeric == null) ? numeric[s2] : Math.max(cur.numeric, numeric[s2]);
      }
    }
    return out;
  }

  /**
   * §6's arrival record.
   * ⚠ `confidence` IS WHAT THE NUMBER IS BASED ON, not a vendor score — Mapbox publishes no
   * confidence figure, and inventing one would be exactly the fake this cannot ship. `'live'` means
   * the answer came from the traffic profile and carries congestion; `'typical'` means it did not.
   * ⚠ `dataFreshness` IS THE AGE OF OUR ANSWER (ms), not the age of Mapbox's observations, which
   * the API does not report.
   * ⚠ `durationWithoutTraffic` IS NULL WHEN `duration_typical` IS ABSENT — never a copy of
   * `duration`, which would make `trafficDelay` a confident zero.
   */
  function etaOf(alt) {
    var mb = alt && alt._mb;
    if (!mb) return null;                       /* not an answer this module produced */
    var dur = (alt.duration != null && isFinite(+alt.duration)) ? +alt.duration : null;
    var typ = (mb.durationTypical != null) ? +mb.durationTypical : null;
    /* ⚠ «LIVE» MEANS THE ANSWER ACTUALLY CARRIED CONGESTION. The traffic profile can come back with
       every segment marked `unknown` — a road Mapbox has no observations for — and calling that
       number live would be the same lie as inventing one. */
    var live = !!(mb.traffic && congestionSegments(alt).some(function (s) { return s.level !== 'unknown'; }));
    return {
      arrivalTime: (mb.at && dur != null) ? (mb.at + dur * 1000) : null,
      duration: dur,
      durationWithoutTraffic: typ,
      trafficDelay: (dur != null && typ != null) ? (dur - typ) : null,
      confidence: live ? 'live' : 'typical',
      dataFreshness: mb.at ? (Date.now() - mb.at) : null,
      provider: ID,
      computedAt: mb.at || null,
    };
  }

  /* what an incident / closure reader can be handed: one of our alternatives, a raw Mapbox route, a
     whole Directions response, or a refresh answer. */
  function legsOf(x) {
    if (!x) return null;
    if (x._mb && Array.isArray(x._mb.legs)) return x._mb.legs;
    if (Array.isArray(x.legs)) return x.legs;
    if (x.route && Array.isArray(x.route.legs)) return x.route.legs;
    if (Array.isArray(x.routes) && x.routes.length && Array.isArray(x.routes[0].legs)) return x.routes[0].legs;
    return null;
  }

  function num(v) { return (v == null || !isFinite(+v)) ? null : +v; }
  function str(v) { return (v == null) ? '' : String(v); }

  /**
   * Mapbox's leg incidents, with their indices placed on the whole route.
   * ⚠ `from` / `to` ARE ROUTE COORDINATE INDICES when the legs carry annotations (which is how this
   * module always requests them); without annotations the offset is unknowable, so they stay
   * leg-relative and `legIndex` is what locates them. Empty when there are none.
   */
  function incidents(json) {
    var legs = legsOf(json);
    if (!legs || !legs.length) return [];
    var spans = legSpans(legs);
    var out = [];
    legs.forEach(function (l, li) {
      (Array.isArray(l.incidents) ? l.incidents : []).forEach(function (it) {
        if (!it) return;
        out.push({
          id: str(it.id), legIndex: li,
          from: spans[li].off + (it.geometry_index_start | 0),
          to: spans[li].off + (it.geometry_index_end | 0),
          type: str(it.type), subType: str(it.sub_type),
          description: str(it.description), longDescription: str(it.long_description),
          impact: str(it.impact), closed: !!it.closed,
          lanesBlocked: Array.isArray(it.lanes_blocked) ? it.lanes_blocked.slice() : [],
          roads: Array.isArray(it.affected_road_names) ? it.affected_road_names.slice() : [],
          country: str(it.iso_3166_1_alpha2),
          startTime: str(it.start_time), endTime: str(it.end_time),
        });
      });
    });
    return out;
  }

  /** Mapbox's leg closures, placed the same way. `[{legIndex,from,to}]`, empty when there are none. */
  function closures(json) {
    var legs = legsOf(json);
    if (!legs || !legs.length) return [];
    var spans = legSpans(legs);
    var out = [];
    legs.forEach(function (l, li) {
      (Array.isArray(l.closures) ? l.closures : []).forEach(function (cl) {
        if (!cl) return;
        var s = Math.max(0, cl.geometry_index_start | 0), e = Math.max(s, cl.geometry_index_end | 0);
        out.push({ legIndex: li, from: spans[li].off + s, to: spans[li].off + e });
      });
    });
    return out;
  }

  /**
   * §16: re-read the congestion of a route already computed, without recomputing it.
   * ⚠ THE ROUTE ID IS REQUIRED because nothing here keeps the last answer — see `remember()`.
   * ⚠ THE TOTAL IS DERIVED, NOT REPORTED. A refresh answer carries per-segment durations and no
   * total, so `duration` is their sum and is `null` when the annotation is absent — not zero.
   */
  async function refresh(routeId, routeIndex, legIndex) {
    var kept = recall();
    var id = str(routeId) || (kept ? str(kept.routeId) : '');
    var ri = Math.max(0, routeIndex | 0), li = Math.max(0, legIndex | 0);
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(id)) return bad('INVALID_REQUEST');
    if (!available()) return bad('PROVIDER_UNAVAILABLE');
    var d = def();

    var u = relayUrl('provider=mapbox&refresh=1&routeId=' + encodeURIComponent(id)
      + '&routeIndex=' + ri + '&legIndex=' + li);
    if (!u) return bad('PROVIDER_UNAVAILABLE');

    var j = null, status = 'PROVIDER_UNAVAILABLE';
    var ac = mkAC(+((d && d.timeoutMs) || 20000));
    try {
      var r = await fetch(u, { signal: ac.signal });
      if (r.ok) j = await r.json();
      else status = httpCode(r.status);
    } catch (e) { status = code(e); } finally { rmAC(ac); }

    if (!j) return bad(status);
    var legs = (j.route && Array.isArray(j.route.legs)) ? j.route.legs : null;
    if (String(j.code || 'Ok') !== 'Ok' || !legs) return bad('REROUTE_FAILED');

    var total = null;
    legs.forEach(function (l) {
      var dd = l && l.annotation && Array.isArray(l.annotation.duration) ? l.annotation.duration : null;
      if (!dd) return;
      var s = 0;
      for (var i = 0; i < dd.length; i++) s += (num(dd[i]) || 0);
      total = (total == null ? 0 : total) + s;
    });

    return {
      ok: true, status: 'success', provider: ID, noStore: noStore(),
      routeId: id, routeIndex: ri, legIndex: li, at: Date.now(),
      /* the first refreshed leg's annotation, and all of them — a refresh answers from `legIndex`
         onward, so a caller updating one leg and a caller updating the tail both have what they need */
      annotation: (legs[0] && legs[0].annotation) || null,
      legs: legs.map(function (l) {
        return {
          annotation: (l && l.annotation) || null,
          incidents: (l && Array.isArray(l.incidents)) ? l.incidents : [],
          closures: (l && Array.isArray(l.closures)) ? l.closures : [],
        };
      }),
      duration: total,
      incidents: incidents(j), closures: closures(j),
    };
  }

  return {
    probe: probe, available: available, route: route,
    congestionSegments: congestionSegments, etaOf: etaOf,
    incidents: incidents, closures: closures, refresh: refresh,
    /* for the tests and the panel: which provider this is, and the terms it is under */
    id: ID, noStore: noStore,
  };
})();
