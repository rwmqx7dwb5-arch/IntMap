/* ============================================================================
 *  IntMap · THE WIDGET SCHEDULER — ONE REQUEST PER QUESTION, NOT ONE PER CARD
 * ----------------------------------------------------------------------------
 *  window.IntMapWidgetScheduler — who fetches what, when, and how often.
 *
 *  ══ ⚠⚠⚠ WHAT THE PREVIOUS SCHEDULER DID, MEASURED BEFORE IT WAS REPLACED ═══════════════════════
 *  A board of four cards (two map-weather, one crypto, one crypto-cap) was loaded and watched for
 *  eight seconds. In that window:
 *
 *      api.coingecko.com/api/v3/simple/price   ×7
 *      api.coingecko.com/api/v3/global         ×7
 *      api.open-meteo.com/v1/forecast          ×2   (the same coordinate, twice)
 *
 *  Two causes, and they compound. `render()` ended with `refreshAll()`, so every re-render — a
 *  language event, a config open, an add, a delete, the board becoming visible — re-fetched EVERY
 *  card; and two cards asking the same question of the same host had no idea the other existed,
 *  because the unit of work was the CARD. Here the unit of work is the REQUEST KEY: two cards that
 *  produce the same key share one in-flight promise and one cache entry, and a re-render costs
 *  nothing at all because rendering and fetching are no longer the same act.
 *
 *  ══ THE POLICIES ══════════════════════════════════════════════════════════════════════════════
 *    realtime-local        no network. Driven by the one shared ticker in js/widget-core.js.
 *    interval              refetch every minIntervalMs while visible.
 *    stale-while-revalidate serve the cache instantly, refresh behind it.
 *    event-driven          only when one of `relevantEvents` fires.
 *    hybrid                interval + events.
 *    manual                only when the reader asks.
 *
 *  ⚠ EVERY POLICY IS SUBJECT TO VISIBILITY. `onlyWhenVisible` defaults to true and is enforced by
 *  an IntersectionObserver on the card, so a card scrolled out of the sidebar, a card on a hidden
 *  page of a stack, and the whole board while a tab is open all cost nothing. `backgroundAllowed`
 *  is the deliberate exception (nothing sets it today) rather than the default.
 * ==========================================================================*/
import { everyTick, stopTick } from './runtime.js';   /* the one timer wheel — js/runtime.js */

window.IntMapWidgetScheduler = (function () {
  'use strict';

  var WC = window.IntMapWidgetCore;
  var ST = window.IntMapWidgetStore;
  var K = {};

  var MAX_CONCURRENT = 4;
  var DEFAULT_TIMEOUT = 12000;

  var subs = {};            /* cardId → subscription */
  var groups = {};          /* requestKey → group */
  var running = 0;
  var queue = [];
  var timer = null;
  var boardVisible = true;

  /* ── the per-key record. `state` is what a card renders; nothing else is a source of truth. ── */
  function group(key) {
    if (!groups[key]) {
      groups[key] = {
        key: key, members: [], inflight: null, abort: null,
        data: null, at: 0, lastAttemptAt: 0, status: 'idle', errorCode: null,
        fails: 0, nextRetryAt: 0, source: null, ttl: 0, hydrated: false,
      };
    }
    return groups[key];
  }

  function policyOf(def) { return def.refreshPolicy || { kind: 'manual' }; }
  function num(v, d) { return (v == null || !isFinite(v)) ? d : v; }

  /* ══ THE STATE A CARD SEES ════════════════════════════════════════════════════════════════════
     ⚠ THE TWO CLOCKS ARE NOT THE SAME CLOCK (§11). `lastSuccessfulAt` is when WE last got an
     answer; a payload's own timestamp (a quake's origin time, a rate's "as of") belongs to the
     data and is rendered by the renderer from the data. Mixing them is how a card claims a feed is
     fresh because the fetch was. */
  function stateFor(g, sub) {
    var pol = policyOf(sub.def);
    var staleAfter = num(pol.staleAfterMs, 0);
    var status = g.status;
    if (status === 'ready' && staleAfter && g.at && Date.now() - g.at > staleAfter) status = 'stale';
    return {
      status: status,
      size: sub.size,
      data: g.data,
      lastSuccessfulData: g.data,
      lastSuccessfulAt: g.at || null,
      lastAttemptAt: g.lastAttemptAt || null,
      errorCode: g.errorCode,
      nextRetryAt: g.nextRetryAt || null,
      source: g.source,
      requestKey: g.key,
    };
  }

  function notify(g) {
    g.members.forEach(function (sub) {
      if (!subs[sub.id]) return;
      try { sub.onState(stateFor(g, sub)); } catch (e) {}
    });
  }

  /* ══ FETCH: ONE PROMISE PER KEY, ABORTABLE, TIMED OUT, BACKED OFF ═════════════════════════════ */
  function run(g) {
    if (g.inflight) return g.inflight;
    var sub = g.members[0];
    if (!sub || !sub.def.loader) return null;
    var ctrl = null;
    try { ctrl = new AbortController(); } catch (e) {}
    g.abort = ctrl;
    g.lastAttemptAt = Date.now();
    g.status = g.data ? 'refreshing' : 'loading';
    notify(g);

    var timedOut = false;
    var to = setTimeout(function () { timedOut = true; try { ctrl && ctrl.abort(); } catch (e) {} }, num(policyOf(sub.def).timeoutMs, DEFAULT_TIMEOUT));

    var ctx = WC.context();
    var p = Promise.resolve()
      .then(function () { return sub.def.loader(ctx, sub.cfg, ctrl ? ctrl.signal : null); })
      .then(function (res) {
        clearTimeout(to);
        g.inflight = null; g.abort = null; running--;
        /* ⚠ A LOADER MAY REPORT A NON-FAILURE ABSENCE. `{empty:true}` is "the source answered and
           there is nothing today", which §11 insists is not an error — a quiet day at a hazard feed
           must not look like a broken hazard feed. */
        if (res && res.empty) { g.status = 'empty'; g.data = null; g.at = Date.now(); g.fails = 0; g.errorCode = null; }
        else {
          g.data = (res && res.data !== undefined) ? res.data : res;
          g.at = Date.now(); g.status = 'ready'; g.fails = 0; g.errorCode = null;
          g.source = (res && res.source) || g.source;
          var ttl = num(policyOf(sub.def).cacheTtlMs, 0);
          if (ttl && sub.def.cacheable !== false) { try { ST.cacheSet(g.key, { d: g.data, s: g.source }, ttl); } catch (e) {} }
        }
        g.nextRetryAt = 0;
        notify(g);
        pump();
        return g.data;
      })
      .catch(function (err) {
        clearTimeout(to);
        g.inflight = null; g.abort = null; running--;
        var code = (err && (err.code || err.name)) || 'error';
        if (timedOut) code = 'timeout';
        g.errorCode = String(code);
        g.lastAttemptAt = Date.now();
        /* ⚠ THE THREE FAILURES ARE NOT ONE FAILURE (§11). Offline is the browser's answer, not the
           source's; a 429 is the source refusing for a while and says WHEN; a 404/410 will not get
           better by asking again. Only the last of the three stops the retry ladder. */
        if (!navigator.onLine) g.status = 'offline';
        else if (err && err.rateLimited) { g.status = 'rate-limited'; g.nextRetryAt = Date.now() + num(err.retryAfterMs, 10 * 60000); }
        else if (err && err.permanent) { g.status = 'permanent-error'; g.nextRetryAt = 0; }
        else {
          g.fails++;
          g.status = 'temporary-error';
          /* exponential with jitter, so a source that is down does not get a synchronised stampede
             from every reader's board at the same second */
          var base = Math.min(30 * 60000, 20000 * Math.pow(2, Math.min(6, g.fails - 1)));
          g.nextRetryAt = Date.now() + Math.round(base * (0.75 + Math.random() * 0.5));
        }
        notify(g);
        pump();
        return null;
      });
    g.inflight = p;
    return p;
  }

  function pump() {
    while (running < MAX_CONCURRENT && queue.length) {
      var g = queue.shift();
      if (!groups[g.key] || g.inflight) continue;
      running++;
      run(g);
    }
  }
  function enqueue(g, priority) {
    if (g.inflight || queue.indexOf(g) >= 0) return;
    if (priority) queue.unshift(g); else queue.push(g);
    pump();
  }

  /* ── hydrate a key from the persisted last-good payload, once, before any network ─────────── */
  function hydrate(g, def) {
    if (g.hydrated || g.data || def.cacheable === false) return;
    g.hydrated = true;
    var e = null;
    try { e = ST.cacheGet(g.key); } catch (er) {}
    if (e && e.data) {
      g.data = e.data.d; g.at = e.at; g.source = e.data.s || null;
      g.status = 'ready';
    }
  }

  /* ══ WHEN A GROUP IS DUE ══════════════════════════════════════════════════════════════════════ */
  function due(g, now) {
    var sub = g.members[0];
    if (!sub) return false;
    var pol = policyOf(sub.def);
    if (pol.kind === 'realtime-local' || pol.kind === 'manual') return false;
    if (!sub.def.loader) return false;
    if (g.inflight) return false;
    if (g.status === 'permanent-error') return false;
    if (g.nextRetryAt && now < g.nextRetryAt) return false;
    var visible = g.members.some(function (s) { return s.visible; });
    if (!visible && pol.backgroundAllowed !== true) return false;
    if (!boardVisible && pol.backgroundAllowed !== true) return false;
    if (!g.at) return true;                                                /* never succeeded */
    if (pol.kind === 'event-driven') return false;                         /* events only, below */
    var iv = num(pol.minIntervalMs, 3 * 60000);
    return (now - g.at) >= iv;
  }

  function sweep() {
    var now = Date.now();
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      if (!g.members.length) { delete groups[k]; return; }
      if (due(g, now)) enqueue(g);
      else {
        /* a group whose data crossed its staleness line has to REPAINT even though it is not being
           refetched — otherwise "3 min ago" stays "3 min ago" for ever */
        var pol = policyOf(g.members[0].def);
        if (g.status === 'ready' && pol.staleAfterMs && g.at && now - g.at > pol.staleAfterMs) notify(g);
      }
    });
  }
  function ensureTimer() {
    if (timer) return;
    timer = everyTick('widget-scheduler:sweep', 15000, sweep);
  }
  function maybeStopTimer() {
    if (timer && !Object.keys(subs).length) { stopTick(timer); timer = null; }
  }

  /* ══ THE VISIBILITY OBSERVER ══════════════════════════════════════════════════════════════════ */
  var io = null;
  function observer() {
    if (io || typeof IntersectionObserver !== 'function') return io;
    io = new IntersectionObserver(function (entries) {
      var woke = false;
      entries.forEach(function (e) {
        var id = e.target && e.target.getAttribute('data-wid');
        var sub = id && subs[id];
        if (!sub) return;
        var was = sub.visible;
        sub.visible = e.isIntersecting;
        if (!was && sub.visible) woke = true;
      });
      if (woke) sweep();
    }, { root: null, rootMargin: '120px', threshold: 0.01 });
    return io;
  }

  /* ══ SUBSCRIBE / UNSUBSCRIBE ══════════════════════════════════════════════════════════════════ */
  K.subscribe = function (o) {
    var def = o.def;
    var key = def.requestKey ? String(def.requestKey(WC.context(), o.cfg)) : ('local:' + def.id);
    var sub = {
      id: o.id, def: def, cfg: o.cfg, size: o.size, el: o.el,
      onState: o.onState, visible: o.visible !== false, key: key,
    };
    K.unsubscribe(o.id);
    subs[o.id] = sub;
    var g = group(key);
    g.members.push(sub);
    hydrate(g, def);
    if (o.el && observer()) { try { o.el.setAttribute('data-wid', o.id); observer().observe(o.el); } catch (e) {} }
    ensureTimer();
    /* paint immediately from whatever the group already has — a second card asking the same
       question is answered from memory and never touches the network (§12.1) */
    try { sub.onState(stateFor(g, sub)); } catch (e) {}
    if (due(g, Date.now())) enqueue(g, true);
    return sub;
  };
  K.unsubscribe = function (id) {
    var sub = subs[id];
    if (!sub) return;
    if (sub.el && io) { try { io.unobserve(sub.el); } catch (e) {} }
    var g = groups[sub.key];
    if (g) {
      g.members = g.members.filter(function (s) { return s !== sub; });
      /* ⚠ AN IN-FLIGHT REQUEST WITH NO ONE LEFT TO READ IT IS ABORTED, NOT AWAITED. This is what
         makes a fast scroll through a long board cost one request rather than twenty. */
      if (!g.members.length) {
        try { g.abort && g.abort.abort(); } catch (e) {}
        g.inflight = null;
        var qi = queue.indexOf(g); if (qi >= 0) queue.splice(qi, 1);
      }
    }
    delete subs[id];
    maybeStopTimer();
  };
  K.refresh = function (id, force) {
    var sub = subs[id];
    if (!sub) return;
    var g = groups[sub.key];
    if (!g) return;
    if (force) { g.fails = 0; g.nextRetryAt = 0; if (g.status === 'permanent-error') g.status = 'idle'; }
    enqueue(g, true);
  };
  K.rekey = function (id, cfg, size) {
    var sub = subs[id];
    if (!sub) return;
    K.subscribe({ id: id, def: sub.def, cfg: cfg || sub.cfg, size: size || sub.size, el: sub.el, onState: sub.onState, visible: sub.visible });
  };
  K.state = function (id) {
    var sub = subs[id];
    if (!sub) return null;
    var g = groups[sub.key];
    return g ? stateFor(g, sub) : null;
  };
  K.setBoardVisible = function (v) {
    var was = boardVisible;
    boardVisible = !!v;
    if (!was && boardVisible) sweep();
  };

  /* ══ EVENTS ═══════════════════════════════════════════════════════════════════════════════════
     ⚠ THE OLD BOARD REFRESHED **EVERYTHING** ON focus AND ON visibilitychange. §12.12/12.13 asks
     for the opposite: coming back to the tab must refresh what has gone STALE, not what happens to
     be on screen. `sweep()` already answers exactly that question, so returning to the tab is one
     call to it rather than a second code path with its own idea of what is due. */
  function fireEvent(name) {
    var now = Date.now();
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      var sub = g.members[0];
      if (!sub) return;
      var pol = policyOf(sub.def);
      var evs = pol.relevantEvents || [];
      if (evs.indexOf(name) < 0) return;
      /* an event still respects the minimum interval, or a reader panning the map would out-run
         any rate limit the source has */
      var iv = num(pol.minIntervalMs, 0);
      if (g.at && iv && now - g.at < iv) return;
      var visible = g.members.some(function (s) { return s.visible; });
      if (!visible && pol.backgroundAllowed !== true) return;
      /* the key itself may have moved (a map-centre widget's key contains the rounded centre) */
      K.rekeyAll();
      enqueue(groups[sub.key] || g, true);
    });
    sweep();
  }
  K.rekeyAll = function () {
    Object.keys(subs).forEach(function (id) {
      var sub = subs[id];
      var next = sub.def.requestKey ? String(sub.def.requestKey(WC.context(), sub.cfg)) : ('local:' + sub.def.id);
      if (next !== sub.key) K.subscribe({ id: id, def: sub.def, cfg: sub.cfg, size: sub.size, el: sub.el, onState: sub.onState, visible: sub.visible });
    });
  };
  K.event = fireEvent;

  /* ── map movement: never during the gesture, once it ends, debounced (§12.14) ─────────────── */
  var moveT = null;
  function onMoveEnd() {
    clearTimeout(moveT);
    moveT = setTimeout(function () { WC.invalidateContext(); WC.emit('map'); fireEvent('map'); }, 600);
  }
  K.attachEvents = function () {
    if (K._attached) return;
    K._attached = true;
    try {
      window.addEventListener('focus', function () { WC.invalidateContext(); sweep(); });
      document.addEventListener('visibilitychange', function () { if (!document.hidden) { WC.invalidateContext(); sweep(); } });
      window.addEventListener('online', function () { Object.keys(groups).forEach(function (k) { var g = groups[k]; if (g.status === 'offline') { g.fails = 0; g.nextRetryAt = 0; } }); sweep(); WC.emit('online'); });
      window.addEventListener('offline', function () { WC.emit('online'); });
      var E = window.IntMapGeoEngine;
      if (E && E.hasRenderer && E.hasRenderer() && E.events) { E.events.on('moveend', onMoveEnd); }
      if (window.IntMapTime && window.IntMapTime.on) window.IntMapTime.on(function () { WC.invalidateContext(); fireEvent('chronos'); });
      /* ⚠ A LANGUAGE CHANGE IS A RE-RENDER, NOT A RE-FETCH (§12.16). Every renderer formats from the
         context it is handed, so the same bytes render in the new language. A theme change is not
         even that — the CSS carries it (§12.17). */
      window.addEventListener('intmap-lang', function () { WC.invalidateContext(); WC.emit('lang'); });
    } catch (e) {}
  };

  /* ── introspection, for the tests and for §20's acceptance numbers ───────────────────────── */
  K.stats = function () {
    var keys = Object.keys(groups).filter(function (k) { return groups[k].members.length; });
    return {
      cards: Object.keys(subs).length,
      keys: keys.length,
      inflight: keys.filter(function (k) { return !!groups[k].inflight; }).length,
      queued: queue.length,
      running: running,
      shared: keys.filter(function (k) { return groups[k].members.length > 1; }).length,
      byKey: keys.map(function (k) { return { key: k, members: groups[k].members.length, status: groups[k].status }; }),
    };
  };
  K._reset = function () {
    Object.keys(subs).forEach(K.unsubscribe);
    groups = {}; queue = []; running = 0;
  };

  return K;
})();
