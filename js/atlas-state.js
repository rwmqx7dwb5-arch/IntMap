/* ============================================================================
 *  IntMap · ATLAS — the app's state as DATA, and the turn ledger  (#R318)   window.IntMapAtlasState
 * ----------------------------------------------------------------------------
 *  「現在の`stateContext()`のような手書き文章へ、各機能の状態を都度追加する方式をやめてください。」
 *
 *  `stateContext()` in js/atlas-console.js builds the model's picture of the app by CONCATENATING
 *  sentences — one hand-written line per subsystem, added by whichever round happened to need it.
 *  Two consequences, both measured in this diary:
 *    · a subsystem nobody remembered to add is INVISIBLE to the planner (#R278: "その機能は実行でき
 *      ません" was a catalogue hole answering for the app);
 *    · the same fact ends up phrased two ways in two rounds, and only one of them gets updated.
 *
 *  Here the subsystem OWNS its state and publishes it as a plain object. The composed snapshot is
 *  the canonical form; the model's paragraph is DERIVED from it (`toPrompt`), never the reverse.
 *  Nothing needs to be remembered: a module that registers a provider is in the picture, and one
 *  that does not is reported as absent by `missingProviders()` rather than silently omitted.
 *
 *  ⚠ A PROVIDER MUST NOT THROW AND MUST NOT BE SLOW. It is read on every turn and on every
 *  operation boundary (before/after). Each call is wrapped, and a thrower is recorded in
 *  `snapshot()._errors` instead of taking the turn down with it.
 *
 *  ⚠ THE TURN LEDGER IS NOT THE CHAT LOG. js/atlas-console.js keeps `_hist` (truncated prose, what
 *  the model sees). This keeps the MACHINE facts of the same turns — goal, plan, capability ids,
 *  exact args, results, object ids, resume tokens — so that "それ" / "さっきの経路" / "同じ条件"
 *  resolve by ID rather than by re-reading a sentence. #R119 put `lastObjects` on `_wctx` for
 *  exactly one of these; this is that idea for all of them.
 * ==========================================================================*/
import { makeViewGround } from './atlas-view-ground.js';   /* (#R589) the coordinate precision the zoom actually earns — see the note at the state line below */

export function makeAtlasState(HOST) {
  var GROUND = makeViewGround();
  return (function () {
    var API = {};

    /* The sections a full snapshot always has. A section with no provider is `null`, which is a
       different statement from `{}` — "nobody owns this" vs "owned, and currently empty". */
    var SECTIONS = ['camera', 'selection', 'pinnedPoint', 'deviceLocation', 'viewport', 'time',
      'activeLayers', 'panels', 'objects', 'routing', 'simulations', 'comparison', 'settings',
      'pendingOperations', 'capabilityAvailability',
      /* (#R397) three subsystems Atlas could already OPERATE and could not SEE */
      'alerts', 'monitors', 'workspace'];
    API.SECTIONS = SECTIONS.slice();

    var providers = Object.create(null);

    /* registerStateProvider(name, fn) — fn() returns a plain JSON-able value. Idempotent by name:
       re-registering replaces, so a module that re-mounts does not double-report. */
    API.registerStateProvider = function (name, fn) {
      if (!name || typeof fn !== 'function') return false;
      providers[String(name)] = fn;
      return true;
    };
    API.hasProvider = function (name) { return !!providers[String(name)]; };
    API.providerNames = function () { return Object.keys(providers).sort(); };
    API.missingProviders = function () {
      return SECTIONS.filter(function (s) { return !providers[s]; });
    };

    /* ── the sections the GLOBALS own ──────────────────────────────────────────────────────────
       A subsystem with a module publishes its own state (js/atlas-console.js registers `selection`,
       `pinnedPoint`, `simulations`, `atlas`). The sections below have no module to speak for them —
       their facts live on `window.*` and in the DOM — so this is where they get an owner.

       ⚠ A SECTION WHOSE SOURCE IS ABSENT GETS NO PROVIDER AT ALL, and `snapshot()` then reports it
       as `null`. That is the honest statement "nobody owns this". A provider that answered `{}` by
       calling a method that does not exist and swallowing the throw would make an ABSENT subsystem
       indistinguishable from an IDLE one — the exact confusion this file was written to end.

       `ctx.GE()` is the renderer contract and `ctx.host` the app host; both fall back to what this
       closure already has, so a caller may pass nothing. Re-calling is safe (registration is by name). */
    function WIN() { try { return window; } catch (_) { return null; } }
    function DOC() { try { return document; } catch (_) { return null; } }
    function GLOBAL(name) { var w = WIN(); return w ? w[name] : null; }

    API.registerDefaultProviders = function (ctx) {
      ctx = ctx || {};
      var GE = (typeof ctx.GE === 'function') ? ctx.GE : function () { return GLOBAL('IntMapGeoEngine'); };
      var host = ctx.host || HOST || {};
      var named = [];
      var reg = function (name, fn) { if (API.registerStateProvider(name, fn)) named.push(name); };

      /* `active` on a view button is how the app itself records which base/projection is showing. */
      var isActive = function (id) { var d = DOC(); var e = d && d.getElementById(id); return !!(e && e.classList && e.classList.contains('active')); };

      reg('camera', function () {
        var E = GE(); var cam = E && E.camera; if (!cam) return null;
        var c = cam.getCenter(); var z = cam.getZoom();
        if (!c || !isFinite(z)) return null;
        return { lat: +c.lat, lng: +c.lng, zoom: +z, bearing: +cam.getBearing() || 0, pitch: +cam.getPitch() || 0,
          base: isActive('btn-view-sat') ? 'satellite' : 'map',
          projection: isActive('btn-view-3d') ? '3d-terrain' : (isActive('btn-view-flat') ? 'flat' : 'globe') };
      });

      /* The contract's `getBounds()` returns the renderer's bounds object (MapLibre's LngLatBounds, or
         the Cesium adapter's stand-in for it) — never a plain box, so it is unpacked here. */
      /* ══ (#R386) THE NEWS SURFACE — docs/NEWS-EVENTS.md §10 ═══════════════════════════════════
         「news feed の state provider は現在0件」。それは Atlas が News について**何ひとつ
         観測していなかった**という意味で、`research.events` は自分が描いた結果しか見ていなかった。
         ⚠ **答えは 3 通りある。** 出来事モード（`IntMapNewsEvents` が読み込まれている）／
           記事モード（一覧は在るが出来事ではない）／そもそも一覧が無い。3 つ目だけが `null`
           であり、2 つ目を `null` にすると「News が存在しない」と「News が記事単位である」が
           見分けられなくなる（このファイルの冒頭が禁じている混同そのもの）。 */
      reg('news', function () {
        var E = GLOBAL('IntMapNewsEvents');
        if (E && typeof E.state === 'function') { var st = E.state(); if (st) return st; }
        var g = null;
        try { g = host && host.globalData; } catch (_) { g = null; }
        if (!g || !g.length) return null;
        var vis = 0;
        try { vis = (host.computeFilteredNews && host.computeFilteredNews().length) || 0; } catch (_) { vis = 0; }
        var pins = 0;
        try { pins = (host.newsFeatures && host.newsFeatures.length) || 0; } catch (_) { }
        return { mode: 'articles', loadedArticleCount: g.length, visibleArticleCount: vis, visiblePinCount: pins,
                 selectedEventId: null, selectedCategory: null,
                 eventsAvailable: !!GLOBAL('__IM_NEWS_EVENT_MODE') };
      });

      reg('viewport', function () {
        var E = GE(); var cam = E && E.camera; if (!cam || typeof cam.getBounds !== 'function') return null;
        var b = cam.getBounds(); if (!b || typeof b.getWest !== 'function') return null;
        return { west: +b.getWest(), south: +b.getSouth(), east: +b.getEast(), north: +b.getNorth() };
      });

      /* Two DIFFERENT facts about layers, and they cover different sets, so both are here:
           · the checked rows of the layer dropdown — the full catalogue, ~170 rows, which is what the
             user means by "the layers that are on";
           · the ~21 rows of the `IntMapLayers` registry, which are the ones that can be QUERIED for
             real values (#R119). `context()` maps over the same `active()` list, so index i is the
             same layer in both — an invariant of js/map-ui.js, hence the length guard here.
         (#R74) `painted:false` marks a checked box whose style layers are not actually on the map, so
         a layer is never reported as showing merely because its box is ticked. `check()` answers `null`
         when it has no id table for that box, which is "unknown", not "not painted". */
      reg('activeLayers', function () {
        var d = DOC(); if (!d) return null;
        var AUD = GLOBAL('IntMapLayerAudit');
        var out = [];
        Array.prototype.forEach.call(d.querySelectorAll('#layer-dropdown input[type=checkbox]'), function (cb) {
          if (!cb.checked) return;
          var row = (cb.closest && (cb.closest('label') || cb.closest('.lyr-row'))) || null;
          var disp = '';
          if (row) { var sp = row.querySelector('span[data-i18n], span.ec-lbl, span[id$="-lbl"], .geo-label'); disp = sp ? sp.textContent : (row.textContent || ''); }
          disp = String(disp == null ? '' : disp).replace(/\s+/g, ' ').trim();
          /* the same emptiness test js/atlas-console.js's `layerCatalog()` applies, so the set of rows
             reported here is the set it reported: a row whose whole label is punctuation or an icon
             glyph normalises to nothing and is not a layer the user can be told about. */
          if (!disp.replace(/^[^\p{L}\p{N}]+/u, '').trim()) return;
          var painted = true;
          try { if (AUD && AUD.check && AUD.check(cb.id) === false) painted = false; } catch (_) { }
          out.push({ id: cb.id, label: disp, painted: painted });
        });
        var LY = GLOBAL('IntMapLayers');
        if (LY && typeof LY.context === 'function') {
          var rids = (typeof LY.active === 'function') ? (LY.active() || []) : [];
          var rows = LY.context() || [];
          var aligned = (rids.length === rows.length);
          rows.forEach(function (s, i) { if (s) out.push({ id: aligned ? String(rids[i]) : null, readable: String(s) }); });
        }
        return out;
      });

      /* ⚠ `offsetParent` is NOT the test — a position:fixed modal never has one. */
      var PANELS = [['#settings-modal', 'Settings'], ['#compare-window', 'Map-compare window'],
        ['#stats-compare-fixed', 'Statistics-comparison view'], ['#tool-panel', 'Map tool panel'],
        ['#widget-board', 'Widget board'], ['#widget-panel', 'Widget panel'],
        ['#corr-overlay', 'Correlation tool'], ['.research-panel', 'Research panel'], ['.pg-overlay', 'Playground'],
        /* the two floating cards Atlas itself opens most often — the weather card (data.weather) and the
           satellite detail card (layers.satellites with a name). Measured on production (2026-09-15):
           the weather card stayed open across four later questions and this section reported
           `open: []` the whole time, so Atlas had no way to know it was still there. */
        ['#weather-panel', 'Weather card'], ['#sat-popup', 'Satellite detail card']];
      var TABS = ['btn-news', 'btn-info', 'btn-stats', 'btn-community'];
      function shown(el) {
        var w = WIN(); if (!el || !w) return false;
        try {
          var cs = w.getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
          return el.getClientRects().length > 0;
        } catch (_) { return false; }
      }
      reg('panels', function () {
        var d = DOC(); if (!d) return null;
        var open = [];
        PANELS.forEach(function (p) { if (shown(d.querySelector(p[0]))) open.push(p[1]); });
        var tab = '';
        for (var i = 0; i < TABS.length; i++) {
          var b = d.getElementById(TABS[i]);
          if (b && b.classList.contains('active')) { tab = String(b.textContent || '').trim(); break; }
        }
        var cl = d.body && d.body.classList;
        return { open: open, sidebarTab: tab,
          rightLayerSidebar: !!(cl && cl.contains('lsr-open')),
          ticker: !!(cl && cl.contains('ticker-on')),
          workspaceMode: !!(cl && cl.contains('ws-mode')) };
      });

      /* (#R413) `items` WAS THE ADDRESSABLE HEAD, AND THE HEAD WAS 12. An object 13th on the list had
         an id, a name and a fly-to — and Atlas could not name it, because the provider never mentioned
         it. `n` still carries the total; now `items` carries all of them. CONSTITUTION.md §5. */
      reg('objects', function () {
        var OB = GLOBAL('IntMapObjects');
        if (!OB || typeof OB.list !== 'function') return null;
        var list = OB.list() || [];
        return { n: list.length, items: list.map(function (o) {
          return { id: String(o.id), kind: o.kind, name: String(o.name == null ? '' : o.name) }; }) };
      });

      /* ⚠ THESE THREE ARE THREE QUESTIONS AND MUST NEVER BE COLLAPSED INTO ONE (#R299): `hasRoute` is
         "a route has been computed", `painted` is "it reached the map source", `visible` is "it is
         actually drawn". A panel that lit a dot on the first one was the bug.
         `coords` is replaced by its length: `diff()` stringifies every section on every operation
         boundary, and a route polyline is thousands of numbers. The geometry's decision-bearing form —
         `bbox` — is already in the summary, and the full line stays one `IntMapRouting.summary()` away. */
      reg('routing', function () {
        var RT = GLOBAL('IntMapRouting'), UI = GLOBAL('IntMapRouteUI');
        if (!RT && !UI) return null;
        var out = {};
        if (RT) {
          if (typeof RT.hasRoute === 'function') out.hasRoute = !!RT.hasRoute();
          if (typeof RT.painted === 'function') out.painted = !!RT.painted();
          if (typeof RT.visible === 'function') out.visible = !!RT.visible();
          if (typeof RT.summary === 'function') {
            var s = RT.summary();
            if (s) {
              var sum = {}; Object.keys(s).forEach(function (k) { if (k !== 'coords') sum[k] = s[k]; });
              if (s.coords) sum.coordCount = s.coords.length;
              out.summary = sum;
            }
          }
        }
        if (UI && typeof UI.isOpen === 'function') out.panelOpen = !!UI.isOpen();
        return out;
      });

      /* (#R527) the photograph search — js/photo-geo.js. Everything Atlas may say about it is here:
         whether the panel is up, whether a photograph and a rectangle exist AT ALL (it can supply
         neither, so «what is missing» is the fact it needs most), how coarse the grid it is about
         to walk is, how far the run has got, the verdict, and the candidates with their bearings.
         ⚠ THE MODULE IS LAZY, SO ITS ABSENCE IS AN ANSWER, NOT AN ERROR. Reading `.state()` off an
         undefined global would throw inside the snapshot every provider is folded into; a reader
         who has never opened the panel gets {open:false}, which is exactly what the module's own
         snapshot returns before a photograph is loaded — so the two agree instead of differing by
         whether a chunk happens to have been fetched. */
      reg('photoGeo', function () {
        var PG = GLOBAL('IntMapPhotoGeo');
        if (!PG || typeof PG.state !== 'function') return { open: false };
        return PG.state();
      });

      /* The one master clock (js/chronos.js). `travelDate` is null while live, so "the map is showing a
         past date" is a fact with exactly one representation instead of a truthiness test on a Date. */
      reg('time', function () {
        var T = GLOBAL('IntMapTime');
        var out = { live: true, travelDate: null, instant: null };
        if (T && typeof T.isLive === 'function') {
          out.live = !!T.isLive();
          if (!out.live) {
            if (typeof T.iso === 'function') out.travelDate = T.iso();
            var d = (typeof T.get === 'function') ? T.get() : null;
            if (d) { try { out.instant = d.toISOString(); } catch (_) { } }
          }
        }
        var LD = GLOBAL('_imLayerDates'), doc = DOC();
        if (LD && doc) {
          var dl = [];
          ['precip', 'sst', 'snow', 'aod'].forEach(function (k) {
            var cb = doc.getElementById('dl-' + k);
            if (cb && cb.checked && LD[k]) dl.push({ layer: k, date: String(LD[k]) });
          });
          if (dl.length) out.layerDates = dl;
        }
        /* ⚠ (#R550) THE NIGHT-LIGHTS LAYER'S YEAR IS NOT ITS CLOCK YEAR, AND ATLAS HAS TO KNOW WHICH
           IS WHICH. 「2014年の中国の夜間光を見せて」 sets the clock to 2014 and turns the layer on; what
           the map then DRAWS is the nearest epoch the product actually publishes, and an assistant that
           reports 2014 back would be describing a picture that does not exist. The epoch is asked of
           js/night-lights.js — the same answer the legend prints — rather than inferred from the clock.
           It is only reported when something is showing it: the manual layer, or the globe's night side. */
        try {
          var NL = GLOBAL('IntMapNightLights');
          if (NL && typeof NL.state === 'function') {
            var cbN = doc && doc.getElementById('dl-nightsat');
            var NS = GLOBAL('IntMapNightSide'), nsOn = false;
            try { nsOn = !!(NS && NS.state && NS.state().built); } catch (_) { }
            if ((cbN && cbN.checked) || nsOn) {
              var st = NL.state();
              out.nightLights = { epoch: st.epoch, dataYear: st.year, clockYear: st.clockYear,
                                  matches: st.matches, product: st.product, sensor: st.sensor,
                                  source: st.source, eraFrom: st.eraFrom,
                                  shownBy: (cbN && cbN.checked ? 'layer' : '') + (nsOn ? (cbN && cbN.checked ? '+globe' : 'globe') : '') };
            }
          }
        } catch (_) { }
        var HP = GLOBAL('IntMapHistPlaces');
        if (HP && typeof HP.state === 'function') out.historicalPlaces = HP.state();
        return out;
      });

      reg('settings', function () {
        var tu = '';
        try { var w = WIN(); tu = (w && (w.imUnitTemp || w.localStorage.getItem('intmap_temp_unit'))) || ''; } catch (_) { }
        /* (#R397) Which renderer is in use. ⚠ The VALUE is read from the selector; the engine NAMES are
           not written here — `js/geo-engine.js` is the only file allowed to spell them (npm run
           check:engine). ⚠ And base/projection are NOT added: the `camera` provider already reports
           both, and a second copy is how two lines about one fact start disagreeing. */
        var eng = '';
        try { var ES = GLOBAL('IntMapEngineSelect'); if (ES && typeof ES.active === 'function') eng = String(ES.active() || ''); } catch (_) { }
        return { lang: host.lang, theme: (typeof host.userTheme !== 'undefined') ? host.userTheme : 'auto',
          tempUnit: tu ? String(tu).toUpperCase() : '', engine: eng };
      });

      /* ══ (#R397) THREE SUBSYSTEMS ATLAS COULD OPERATE AND COULD NOT SEE ═══════════════════════════
         ⚠ EVERY ACCESSOR BELOW WAS CHECKED TO EXIST BEFORE IT WAS WRITTEN, and the ones that do not
         exist are named in the comments rather than guessed at — this round found three observers in
         js/atlas-capabilities.js calling façade methods that were never there, each hidden by a
         try/catch. A provider must also be CHEAP: it runs on every turn and on both sides of every
         operation, so nothing here touches the network or the database. */
      reg('alerts', function () {
        var A = GLOBAL('__wpAlerts'); var d = DOC();
        if (!A) return null;
        var out = { layerOn: false, countriesLoaded: 0, palette: '' };
        /* the checkbox is the layer's own switch (`'dl-'+id`, js/data-layers.js) */
        try { var cb = d && d.getElementById('dl-alerts'); out.layerOn = !!(cb && cb.checked); } catch (_) { }
        try { if (typeof A.maCountries === 'function') out.countriesLoaded = (A.maCountries() || []).length; } catch (_) { }
        try { if (typeof A.palette === 'function') out.palette = String(A.palette() || ''); } catch (_) { }
        return out;
      });

      reg('monitors', function () {
        var M = GLOBAL('IntMapMonitors');
        if (!M) return null;
        /* ⚠ THE MONITOR LIST IS NOT READ HERE. `IntMapMonitors.atlas.listText()` and `_list()` are both
           async and both hit Supabase; a state provider that awaited them would put a network round
           trip on every turn and on every operation boundary. What is cheap and true is that the
           subsystem is present and whether an area is currently drawn. */
        var out = { present: true, areaActive: false };
        try { if (typeof M.activeArea === 'function') out.areaActive = !!M.activeArea(); } catch (_) { }
        return out;
      });

      reg('workspace', function () {
        var W = GLOBAL('IntMapWorkspace');
        if (!W || typeof W.active !== 'function') return null;
        try { return { active: !!W.active() }; } catch (_) { return null; }
      });

      /* (#R118) the LIVE panel, not what Atlas last asked for — the user may have built it by hand. */
      reg('comparison', function () {
        var C = GLOBAL('IntMapStatsCompare');
        if (!C || typeof C.state !== 'function') return null;
        return C.state();
      });

      reg('deviceLocation', function () {
        var L = GLOBAL('IntMapLocate');
        if (!L || typeof L.last !== 'function') return null;
        var l = L.last();
        return { active: (typeof L.isActive === 'function') ? !!L.isActive() : false,
          last: l ? { lng: +l.lng, lat: +l.lat, acc: +l.acc } : null };
      });

      /* `[]` rather than `null` when the executor is absent: nothing is running either way, and the
         planner must not read "the executor has not loaded" as "I cannot tell whether work is in flight". */
      reg('pendingOperations', function () {
        var X = GLOBAL('IntMapAtlasExec');
        if (!X || typeof X.pending !== 'function') return [];
        return X.pending() || [];
      });

      /* Only what is NOT available. The full catalogue is 58 kB and the planner already has it; what it
         cannot know without asking is which rows would answer `unavailable` right now, and why. */
      reg('capabilityAvailability', function () {
        var C = GLOBAL('IntMapCapabilities');
        if (!C || typeof C.all !== 'function') return null;
        var cctx = (typeof C.context === 'function') ? C.context() : null;
        var out = [];
        C.all().forEach(function (cap) {
          if (!cap || typeof cap.availability !== 'function') return;
          var a; try { a = cap.availability(cctx); } catch (_) { return; }
          if (a && a.available === false) out.push({ id: cap.id, reason: a.reason || 'unavailable' });
        });
        return out;
      });

      return named;
    };

    function readOne(name, errors) {
      var fn = providers[name];
      if (!fn) return null;
      try {
        var v = fn();
        return (v === undefined) ? null : v;
      } catch (e) {
        errors.push({ provider: name, error: (e && e.message) || 'error' });
        return null;
      }
    }

    /* snapshot(opts) — the whole picture, or `opts.only` sections of it. */
    API.snapshot = function (opts) {
      opts = opts || {};
      var want = Array.isArray(opts.only) && opts.only.length ? opts.only : null;
      var errors = [];
      var out = {};
      var names = Object.keys(providers);
      SECTIONS.forEach(function (s) { if (names.indexOf(s) < 0) names.push(s); });
      names.forEach(function (n) {
        if (want && want.indexOf(n) < 0) return;
        out[n] = readOne(n, errors);
      });
      if (errors.length) out._errors = errors;
      /* (#R742) WHERE EACH LAYER THAT IS ON CAME FROM. The annotation is applied HERE and not inside
         the `activeLayers` provider so that it holds for WHOEVER publishes that section — the default
         DOM provider, or a replacement a later round registers. The rule belongs to the fact. */
      if (Array.isArray(out.activeLayers)) out.activeLayers = annotateLayerOrigins(out.activeLayers);
      return out;
    };

    /* diff(before, after) — which sections changed, and how. Used by the executor's verification and
       by the audit's "did this capability produce what it declared" check. Structural, not textual. */
    function stable(v) {
      if (v === null || v === undefined) return 'null';
      if (typeof v !== 'object') return JSON.stringify(v);
      if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
      return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
    }
    API.stable = stable;
    API.diff = function (before, after) {
      before = before || {}; after = after || {};
      var keys = Object.keys(before).concat(Object.keys(after)).filter(function (k, i, a) { return k !== '_errors' && a.indexOf(k) === i; });
      var changed = [];
      keys.forEach(function (k) {
        if (stable(before[k]) !== stable(after[k])) changed.push(k);
      });
      return { changed: changed, changedSet: changed.reduce(function (m, k) { m[k] = 1; return m; }, Object.create(null)) };
    };

    /* ── the model's paragraph, DERIVED ─────────────────────────────────────────────────────────
       ⚠ THIS IS NOT THE SOURCE OF TRUTH AND MUST NOT BECOME ONE. It is a lossy projection sized for
       a prompt: only the sections that carry a decision, only the fields inside them that a planner
       can act on, and a hard byte budget so one busy subsystem cannot crowd out the rest.
       There are two such projections and they are BOTH derived from `snapshot()`, never from each
       other: `toPrompt` (JSON, for the executor's verification / the audit / the debug view) and
       `renderPrompt` (prose, for the model). Neither reads the app. */
    function shortNum(v) { return (typeof v === 'number' && isFinite(v)) ? (Math.round(v * 1000) / 1000) : v; }
    function compact(v, depth) {
      if (v === null || v === undefined) return null;
      if (typeof v === 'number') return shortNum(v);
      if (typeof v !== 'object') return v;
      if (Array.isArray(v)) return v.slice(0, 24).map(function (x) { return compact(x, depth + 1); });
      if (depth >= 3) return '…';
      var out = {};
      Object.keys(v).slice(0, 24).forEach(function (k) {
        var c = compact(v[k], depth + 1);
        if (c === null || c === '' || (Array.isArray(c) && !c.length)) return;
        out[k] = c;
      });
      return out;
    }
    API.compact = function (snap) {
      var out = {};
      Object.keys(snap || {}).forEach(function (k) {
        if (k === '_errors') return;
        var c = compact(snap[k], 0);
        if (c === null || (Array.isArray(c) && !c.length) || (typeof c === 'object' && !Array.isArray(c) && !Object.keys(c).length)) return;
        out[k] = c;
      });
      return out;
    };
    /* toPrompt(snap, budgetBytes) — the compacted snapshot as JSON, trimmed section by section from
       the least decision-bearing end until it fits. Sections are dropped WHOLE and the drop is
       ANNOUNCED, because a silently truncated state reads to the model as a state that is absent. */
    var PROMPT_PRIORITY = ['pendingOperations', 'selection', 'pinnedPoint', 'camera', 'viewport', 'activeLayers',
      'routing', 'time', 'objects', 'simulations', 'panels', 'comparison', 'settings', 'deviceLocation', 'capabilityAvailability'];
    API.toPrompt = function (snap, budgetBytes) {
      var budget = budgetBytes || 3000;
      var c = API.compact(snap);
      var keys = Object.keys(c).sort(function (a, b) {
        var ia = PROMPT_PRIORITY.indexOf(a), ib = PROMPT_PRIORITY.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
      var kept = {}, dropped = [];
      var s = '{}';
      for (var i = 0; i < keys.length; i++) {
        var trial = Object.assign({}, kept);
        trial[keys[i]] = c[keys[i]];
        var js = JSON.stringify(trial);
        if (js.length > budget && Object.keys(kept).length) { dropped.push(keys[i]); continue; }
        kept = trial; s = js;
        if (js.length > budget) break;
      }
      var text = 'APP STATE (JSON, authoritative):\n' + s;
      if (dropped.length) text += '\nOMITTED FOR SIZE (ask if you need them): ' + dropped.join(', ');
      return text;
    };

    /* renderPrompt(snap, opts) — the OTHER projection of the SAME snapshot. `toPrompt` above serialises
       it for machines (the executor's verification, the audit, the debug view); this renders it as the
       paragraph js/atlas-console.js's `stateContext()` used to concatenate by hand. Both start at
       `snapshot()` and neither one reads the app: that is what "the JSON is canonical" means in practice.

       ⚠ THE FACTS COME FROM THE SNAPSHOT; THE READING RULES ARE WRITTEN HERE. Sentences like «map
       "here"/"there"/"that place" to it», «[NOT painted on the map]» or «this date is a DISPLAY setting
       of the map» are not state — they instruct the model how to read the fact standing next to them.
       Keeping them on this side is what stops a provider from having to know that a language model is
       reading it, and stops one rule from being phrased two ways in two rounds.

       ⚠ THE ORDER IS THE ORDER `stateContext()` EMITTED, line for line. The planner and its deixis rules
       were tuned against this sequence, so re-ordering it is a behaviour change, not a tidy-up.

       ⚠⚠⚠ (#R397) WHAT THIS COMMENT USED TO SAY WAS NOT TRUE, AND IT MATTERED. It said: «Sections with
       no counterpart line — viewport, routing, deviceLocation, pendingOperations,
       capabilityAvailability, simulations — reach the model through toPrompt's JSON.» They did not.
       `toPrompt` is defined above and its ONLY callers in the whole repository are
       tests/r318-checks.test.mjs and tests/r318.spec.js; the production path is
       js/atlas-console.js's `stateContext()`, which calls `renderPrompt` and nothing else. So six of
       the fifteen sections — including the route the reader is looking at and the operations still
       running — reached the model as ZERO BYTES, while a comment here said they arrived.

       The caution in the old sentence was sound: inventing a sentence per section is a prompt change.
       So each line below is the SHORTEST true statement of what that section holds, it is emitted only
       when the section has content (a reader with no route pays no bytes for one), and the six new
       lines come last so the order `stateContext()` emitted is untouched above them. */
    /* ⚠ (#R413) SIX OF THESE ARE GONE — maxLayers 40, maxReadable 10, maxObjects 12, maxObjectName 24,
       maxPolyNames 4, maxSearch 60. They were byte budgets on WHAT ATLAS IS ALLOWED TO KNOW ABOUT ITS
       OWN APP: with 45 layers on, Atlas was told about 40 and the other five simply did not exist for
       it — and nothing anywhere said a list had been cut, which is the silent truncation #R320 named.
       These are the app's own state, bounded by the app's own size, and Atlas gets all of it.
       What is left clips text that arrives from OUTSIDE and has no bound at all: one headline and one
       article body. That is not a limit on Atlas; it is the reason a 200 kB news page cannot become
       the whole prompt. 「制限を増やす方向、例外を増やす方向に持っていくな」 — CONSTITUTION.md §5. */
    var RENDER_LIMITS = { maxTitle: 140, maxBody: 2600 };
    var PROJ_WORD = { '3d-terrain': '3D terrain', 'flat': 'flat', 'globe': 'globe' };
    /* (#R534) THE TWO FIELDS IN WHICH A SIMULATION ASSERTS THAT IT IS ON. The provider
       (js/atlas-console.js's `_simulationState`) probes every module with `state()`, `isOpen()` and
       `painted()` and records what came back, so the answer is ALREADY in the snapshot — and these
       are the only two names it can arrive under. `open` comes from seismic, tsunami, terrainWater,
       LOS and nightSky (their panel, or in nightSky's case its full-screen overlay, is up) and from
       radiation, which is the one module whose `isOpen()` looks at the map itself: panel up OR its
       plume source holds features (js/sims.js:273). `painted` comes from insolation alone, inside
       `state()` (js/insolation.js:333), and is the one field here that means a raster was actually
       laid down.
       ⚠ MEASURED (#R534): NOT ONE of the eight modules implements a `painted()` METHOD — insolation
       spells it `isPainted` — so that probe never fires and `painted` reaches the snapshot only
       through `state()`. The probe is kept because it is the contract a module may still answer.
       ⚠ IT MUST BE THESE TWO AND NOT "ANY TRUTHY FIELD": every other key in those objects is a
       PARAMETER, and a parameter is truthy for free — js/viewshed.js:745 publishes obsH 2,
       rangeKm 60 and k 1.3333 while its panel is shut, so a truthiness rule would restate this very
       falsehood in a new shape. A module that begins asserting presence under a THIRD name belongs
       here, and tests/r534-checks.test.mjs reads the provider to make that loud instead of silent. */
    var SIM_PRESENT = ['open', 'painted'];
    API.renderPrompt = function (snap, opts) {
      snap = snap || {};
      var lim = Object.assign({}, RENDER_LIMITS, opts || {});
      var lines = [];
      var str = function (v) { return (v == null) ? '' : String(v); };

      var cam = snap.camera;
      if (cam && isFinite(cam.lat) && isFinite(cam.lng) && isFinite(cam.zoom)) {
        /* ⚠⚠⚠ (#R589) NOT toFixed(2) — AND THIS IS THE COPY THAT GOES INTO EVERY TURN. Two decimals is
           1.1 km square in mid-latitudes, so 'Map center' named forty city blocks at the zoom where the
           reader is looking at one building; it is the same defect that let 「これなに」 be answered from
           imagination, in the block Atlas reads even when it never calls look_at_map. The precision is
           derived from the zoom in js/atlas-view-ground.js — one pixel of the view being described.
           ⚠ the '≈' stays: a centre IS approximate, and the sign says so without lying about how much. */
        var _dp = GROUND.coordDecimals(cam.zoom);
        lines.push('Map center ≈ ' + (+cam.lat).toFixed(_dp) + ',' + (+cam.lng).toFixed(_dp) + ' · zoom ' + (+cam.zoom).toFixed(1) +
          ' · ' + (cam.base || 'map') + ' base · ' + (PROJ_WORD[cam.projection] || 'globe') +
          ' view · bearing ' + Math.round(+cam.bearing || 0) + '°.');
      }

      var sel = snap.selection || {};
      if (sel.lastPlace && sel.lastPlace.name) lines.push('Last place referenced: "' + sel.lastPlace.name + '" — map "here"/"there"/"that place" to it.');

      /* `null` is "nobody published the layer state", which is not the same claim as "no layers are on" —
         so the reassuring sentence is only printed when a provider actually looked. */
      if (Array.isArray(snap.activeLayers)) {
        var on = [], readable = [], marked = false;
        snap.activeLayers.forEach(function (l) {
          if (!l) return;
          if (typeof l.readable === 'string') { readable.push(l.readable); return; }
          /* ⚠ (#R742) THE ORIGIN MARK IS THE JUDGEMENT MATERIAL, NOT A JUDGEMENT. js/atlas-persona.js
             asks Atlas to take down 「a layer you turned on for an earlier question」 and to keep what
             the reader asked to keep — a distinction this line could not support while every layer
             arrived as a bare name. Nothing here switches anything off: the mark says who is on record
             as having switched it on, and the decision stays with Atlas, every turn. */
          var og = l.origin || null, mark = '';
          if (og && og.by === 'atlas') {
            marked = true;
            mark = ' [YOU turned this on · turn ' + str(og.turnId) + (og.turnsAgo ? (' · ' + og.turnsAgo + ' turn(s) ago') : '') + ']';
          } else if (og) { marked = true; mark = ' [origin not recorded]'; }
          on.push(str(l.label) + (l.painted === false ? ' [NOT painted on the map — data still loading or failed]' : '') + mark);
        });
        lines.push(on.length ? ('Layers ON (' + on.length + '): ' + on.join(', ') + '.') : 'No data layers are on.');
        if (on.length && marked) lines.push('Layer marks: "[YOU turned this on …]" means THIS session recorded you switching that layer on for an earlier question; ' +
          '"[origin not recorded]" means no such record exists (it was already on, or the reader switched it on themselves). ' +
          'Judge each turn whether a layer you turned on still serves the question, and switch it off (layers.toggle, on:false) when the map reads better without it — what the reader asked to keep, keep.');
        if (readable.length) lines.push('Readable layer data (query real values with the "layerData" action): ' + readable.join(' | ') + '.');
      }

      var at = snap.atlas || {};
      /* (#R775) the mark that turns js/atlas-persona.js's `workspace` paragraph into something Atlas
         can act on: WHEN this drawing appeared. 「THIS turn」 is the load-bearing word — four measured
         turns cleared or switched off work they had produced for the very question they were answering. */
      var _pmarked = false, _plast = API.lastTurn();
      var paintMark = function (key) {
        var og = paintOrigin[String(key)]; if (!og) return '';
        _pmarked = true;
        var ago = turnsBetween(og.turnId, _plast && _plast.turnId);
        return ' [YOU drew this · turn ' + str(og.turnId) + ' · ' + (ago ? (ago + ' turn(s) ago') : 'THIS turn') + ']';
      };
      if (at.highlightCountries) lines.push(at.highlightCountries + ' countries are highlighted by Atlas right now.' + paintMark('highlightCountries'));
      if (at.highlight && at.highlight.name) lines.push('Current Atlas highlight: "' + at.highlight.name + '"' +
        (at.highlight.basis ? (' — BASIS: ' + at.highlight.basis + '. If the user asks what YEAR the highlighted membership/data refers to, answer from THIS basis') : '') + '.' + paintMark('highlight'));
      if (at.choropleth && at.choropleth.label) lines.push('The map is currently shaded (choropleth) by ' + at.choropleth.label + '.' + paintMark('choropleth'));
      else if (at.customScore && at.customScore.name) lines.push('The map is currently shaded by a CUSTOM Atlas evaluation score: "' + at.customScore.name +
        '" — follow-ups like "weight X more" / "drop Y" should re-emit scoreMap with adjusted components.' + paintMark('customScore'));
      if (sel.countryCard && sel.countryCard.name) lines.push('Open country card: ' + sel.countryCard.name + ' — "this country"/"it"/"over time" refer to it.');

      var ar = sel.article;
      if (ar && ar.title) {
        /* ⚠ (#R451) TWO FACTS, TWO SENTENCES. In workspace mode the reader and Atlas are separate
           windows, so the article really is on screen while the question is typed. In the normal
           sidebar Atlas REPLACES the reading surface, so by the time the turn runs the reader has
           left the article behind on purpose — saying "is reading this right now" there would be the
           model asserting something nobody observed. Both sentences bind the same pronouns. */
        lines.push((ar.onScreen === false
            ? 'THE NEWS ARTICLE THE READER BROUGHT TO ATLAS (they had it open, then came here to ask about it — it is no longer on screen): "'
            : 'OPEN NEWS ARTICLE (the user is reading this right now): "') + str(ar.title).slice(0, lim.maxTitle) + '"' +
          (ar.publisher ? (' — ' + ar.publisher) : '') + (ar.pubDate ? (', ' + str(ar.pubDate).slice(0, 16)) : '') +
          (ar.place ? (', about ' + ar.place) : '') +
          '. "This article / this event / この記事 / この出来事 / それ / a bare 詳しく・背景・なぜ・translate this" refer to THIS article' +
          ((ar.loc && isFinite(ar.loc[0])) ? ('; its location is ' + (+ar.loc[1]).toFixed(2) + ',' + (+ar.loc[0]).toFixed(2) + ' — "there / 現地" map here') : '') + '.');
        /* ⚠⚠⚠ (#R783) THE CLIP NOW SAYS SO. The cap above is not a limit on Atlas — it is the reason a
           200 kB news page cannot become the whole prompt (#R413), and it stays. What was wrong is that
           it cut SILENTLY: #R783 made `askReading()` read the whole reading surface, so a long event
           (synthesis + every publisher's headline + the coverage list) now really does exceed 2,600
           characters — and Atlas was handed the top of it with nothing saying the rest existed. That is
           the silent truncation #R320 named, this time about text arriving from outside.
           ⇒ the body carries its own statement of what happened to it. Atlas can then say 「ここまでが
           読み取れた範囲です」 instead of answering about the coverage list as if it were absent. */
        if (ar.body) {
          var _b = str(ar.body), _cut = _b.length > lim.maxBody;
          lines.push('ARTICLE BODY (extracted reader text — quote/translate/analyze from THIS, not from memory)'
            + (_cut ? (' — CLIPPED: this is the first ' + lim.maxBody + ' of ' + _b.length + ' characters, in the order the reader sees them; the rest is below the cut and you have NOT been shown it. Say so if the question needs it') : '')
            + ':\n"""\n' + _b.slice(0, lim.maxBody) + '\n"""');
        }
      }

      if (at.pins && at.pins.n) lines.push(at.pins.n + ' Atlas pins are on the map' +
        (at.pins.kind === 'research' ? ' (research-report pins with summaries)' : ' (facility/POI pins)') + '.' + paintMark('pins'));
      if (at.polygons && at.polygons.n) {
        var pn = (at.polygons.names || []).join(', ');
        lines.push(at.polygons.n + ' Atlas polygon highlight(s)' + (pn ? (': ' + pn) : '') + '.' + paintMark('polygons'));
      }
      if (at.lines && at.lines.n) lines.push(at.lines.n + ' Atlas line(s) drawn (river courses / routes / custom lines).' + paintMark('lines'));
      if (at.factions && at.factions.n) lines.push('A historical power/alliance map you drew earlier is still on the globe (' + at.factions.n +
        ' country fills on modern borders). It stays until removed — clear it (clear what:"historical") when it no longer serves the question.');
      if (at.eraPolities && at.eraPolities.n) lines.push('The country highlight is drawn as the displayed year\'s polities (' +
        (at.eraPolities.names || []).join(', ') + ') from the historical border record, not the modern outlines.');
      if (at.measure && at.measure.n) lines.push('Measure tool active with ' + at.measure.n + ' points.' + paintMark('measure'));
      if (at.radius && at.radius.n) lines.push(at.radius.n + ' radius circle(s) on the map.' + paintMark('radius'));
      if (_pmarked) lines.push('Drawing marks: "[YOU drew this · THIS turn]" is your answer to the question you are answering NOW — do not clear it, and do not re-issue it to make sure. "[… N turn(s) ago]" is what an earlier question left; that is what the workspace rule is about. No mark = no record of where it came from.');
      if (at.userPins && at.userPins.n) lines.push(at.userPins.n + ' user pin(s) on the map.');

      var pa = snap.panels || {};
      if (pa.rightLayerSidebar) lines.push('The right layer sidebar is open.');
      if (pa.ticker) lines.push('The bottom news/markets ticker is on.');
      if (pa.sidebarTab) lines.push('Active sidebar tab: ' + pa.sidebarTab + '.');
      if (pa.open && pa.open.length) lines.push('Open panels: ' + pa.open.join(', ') + '.');
      /* ⚠⚠⚠ (#R775) AND WHEN THERE IS NOTHING, SAY THERE IS NOTHING. Every line above is emitted only when
         its drawing exists, so an empty map produced NO sentence at all — and absence of evidence is not
         evidence of absence to a reader that has been told the map is its workspace. Measured on production
         2026-09-17: asked to plot ten head offices, Atlas spent four of its seven operations tidying a map
         that was ALREADY empty (map.clearAll -> map.clear/already_clear -> map.clear/already_clear ->
         map.clearHighlights/already_there) and hit the step budget before plotting one of them; the next
         question, twenty-two semiconductor head offices, did the same and also plotted none. Each clear was
         a DIFFERENT call, so no repeat guard could see them as one, and each came back saying it had nothing
         to do — which is the answer to a question the model should not have had to ask.
         ⚠ THIS COMMANDS NOTHING. It states a fact the snapshot already holds; what to do with it stays with
         Atlas every turn (CONSTITUTION.md §5).
         ⚠⚠⚠ AND IT IS SAID ONLY WHEN THE MAP PUBLISHED ITS STATE. `snap.atlas` absent means nobody
         answered, which is a DIFFERENT fact from 「the map is empty」 — the same distinction #R768 drew
         between 「it did not work」 and 「I could not see whether it worked」, and the one tests/r413 ③ and
         tests/r534 ①b already hold this file to: a section nobody published stays silent. */
      var _drawn = drawnKeys(snap.atlas);   /* ⚠ the SAME rule the ledger uses — a second list of kinds here would be free to disagree with it */
      if (_drawn && !Object.keys(_drawn).length)
        lines.push('The map carries NO Atlas drawing right now - no highlight, shading, pins, polygons, lines, radius or measurement. There is nothing to clear.');
      if (at.tool) lines.push('Active map tool: ' + at.tool + ((at.measure && at.measure.n) ? (' (' + at.measure.n + ' points)') : '') + '.');

      var cp = snap.comparison;
      if (cp && cp.open && cp.codes && cp.codes.length) lines.push('Country comparison is OPEN right now: countries=' + cp.codes.join(',') +
        ' · indicators=' + (cp.indicators || []).join(',') + ' · view=' + cp.mode +
        ' · per-indicator sources=' + JSON.stringify(cp.sources || {}) +
        '. "この比較 / the comparison / それ" refers to THIS (the user may have configured it by hand).');

      var ob = snap.objects;
      if (ob && ob.n) lines.push('Map objects (' + ob.n + ') — target them with the "object" action by id: ' +
        (ob.items || []).map(function (o) {
          return o.kind + ' id=' + o.id + ' "' + str(o.name) + '"'; }).join('; ') + '.');

      var tm = snap.time || {};
      if (tm.travelDate) lines.push('TIME TRAVEL is active — news/imagery around ' + tm.travelDate +
        ' (not today). "now/current" requests may need timeTravel reset. IMPORTANT: this date is a DISPLAY setting of the map. It is NOT the data year of any statistic, highlight or reply — NEVER present it as "the year of the data".');
      if (tm.layerDates && tm.layerDates.length) lines.push('Dated raster layers showing: ' +
        tm.layerDates.map(function (d) { return d.layer + '=' + d.date; }).join(', ') + ' (changeable via control "date: <layer>").');
      /* (#R550) …and the night lights say BOTH years, because they are allowed to differ */
      var nl = tm.nightLights;
      if (nl) lines.push(nl.dataYear == null
        ? ('Night lights: NO DATA — the clock is at ' + (nl.clockYear == null ? 'now' : nl.clockYear) +
           ' and no satellite night-lights record exists before ' + nl.eraFrom + '. Say so rather than describing lights.')
        : ('Night lights on screen (' + nl.shownBy + '): ' + nl.product + ' ' + nl.dataYear + ' (' + nl.sensor + ', ' + nl.source + ')' +
           (nl.matches ? ' — the clock year and the data year agree.'
                       : ('; the clock is at ' + (nl.clockYear == null ? 'now' : nl.clockYear) +
                          ', so this is the NEAREST published epoch. Report ' + nl.dataYear + ' as the year of the image, never the clock year.'))));

      if (str(sel.searchBox).trim()) lines.push('Search box contains: "' + str(sel.searchBox).trim() + '".');

      if (pa.workspaceMode) lines.push('WORKSPACE MODE is on — the UI is free-floating windows (News / Countries / Information / Community / Map / Layers), a top menu bar (View/Tools/Window/Settings) and a fixed bottom ticker; hidden windows reopen from the Window menu; turn off via the "setting-wsmode-btn" button or IntMapWorkspace.close.');

      var st = snap.settings;
      if (st) lines.push('UI language=' + st.lang + ', theme=' + ((st.theme == null) ? 'auto' : st.theme) +
        (st.tempUnit ? (', temp unit=°' + st.tempUnit) : '') + (st.engine ? (', map engine=' + st.engine) : '') + '.');

      /* ── (#R397) THE SIX THAT REACHED THE MODEL AS NOTHING, PLUS THE THREE THIS ROUND ADDED ──── */
      var vp = snap.viewport;
      /* ⚠⚠ (#R589) same derivation as 'Map center' above, for the same reason: this line claims to state
         THE FRAME THE READER CAN SEE, and two decimals described a 1.1 km grid regardless of how far in
         they were. The zoom is the camera's, because the frame and the camera are the same view. */
      var _vdp = GROUND.coordDecimals(cam ? cam.zoom : undefined);   /* `cam && cam.zoom` would hand it null, which Number() turns into zoom 0 */
      if (vp && isFinite(vp.west)) lines.push('Visible bounds: W ' + (+vp.west).toFixed(_vdp) + ', S ' + (+vp.south).toFixed(_vdp) +
        ', E ' + (+vp.east).toFixed(_vdp) + ', N ' + (+vp.north).toFixed(_vdp) + ' (this is the frame the reader can actually see).');

      var rt = snap.routing;
      if (rt && (rt.hasRoute || rt.painted || rt.mode)) lines.push('ROUTE on the map: ' +
        (rt.hasRoute ? 'a route is drawn' : 'no route drawn') + (rt.mode ? (', travel mode=' + str(rt.mode)) : '') +
        (rt.alts != null ? (', ' + rt.alts + ' alternative(s)') : '') + '.');

      /* ══ (#R413) THIS LINE HAD NEVER BEEN EMITTED ONCE ════════════════════════════════════════
         It read `dl.lat`. The provider above has always published `{active, last:{lng,lat,acc}}`, so
         `dl.lat` was `undefined`, `isFinite(undefined)` was false, and the reader's position reached
         the model as ZERO BYTES from the round the section was written. Measured, not supposed: the
         only shape that rendered the sentence was a shape nothing produces. `Map center ≈ …` renders
         unconditionally three lines above, which is why 「現在地から大阪駅まで」 came back as
         「地図中央（約44.76, 50.46）しか取得できません」 — a true report of everything Atlas was given.
         ⚠ AND THE SENTENCE ITSELF FORBADE THE REQUEST IT WAS FOR. «use it only for "near me"-style
         requests, never as the subject of a question that named a place» — 「現在地から大阪駅まで」
         names a place, so on the one turn the position mattered the line would have ruled it out.
         What replaces it states the AUTHORITY: where the reader is, and that Atlas may obtain it. */
      var dl = snap.deviceLocation;
      if (dl && dl.last && isFinite(dl.last.lat) && isFinite(dl.last.lng)) {
        lines.push('The reader\'s DEVICE position is known: ' + (+dl.last.lat).toFixed(4) + ', ' + (+dl.last.lng).toFixed(4) +
          (isFinite(dl.last.acc) && dl.last.acc > 0 ? (' (±' + Math.round(dl.last.acc) + ' m)') : '') +
          ' — this is where the reader IS. Use it whenever the request means their own position, including as the origin of a route to a named place.');
      } else if (dl) {
        lines.push('The reader\'s device position is not known yet — call my_location to obtain it. ' +
          'The map centre is NOT a substitute for it, and the reader is not the one who has to type it.');
      }

      /* ⚠ (#R534) THE KEYS WERE NOT THE CLAIM. This printed `Object.keys(sim)`, so a module that had
         merely been LOADED was announced as OPEN. `{radiation:{open:false}, insolation:{painted:false}}`
         — the honest answer to "is anything of yours on the map?", asked and recorded — rendered as
         «Simulations open: radiation, insolation.», and Atlas, asked what the map was showing,
         answered with a radiation or insolation simulation that was not on it. The state was right
         the whole way down and the sentence threw it away at the last step: presence is a VALUE the
         modules publish, never the existence of the key that carries it. */
      var sim = snap.simulations;
      if (sim) {
        var simOn = Object.keys(sim).filter(function (k) {
          var st = sim[k];
          if (!st || typeof st !== 'object') return false;
          return SIM_PRESENT.some(function (f) { return st[f] === true; });
        });
        if (simOn.length) lines.push('Simulations open: ' + simOn.join(', ') + '.');
      }

      var pend = snap.pendingOperations;
      if (pend && pend.length) lines.push('Operations still RUNNING from an earlier turn: ' +
        pend.map(function (p) { return str(p && (p.capabilityId || p.id)); }).filter(Boolean).join(', ') +
        ' — do not re-issue these; they have not finished.');

      /* Only the UNAVAILABLE ones. Listing what works would repeat the catalogue the planner already has. */
      var av = snap.capabilityAvailability;
      if (av) {
        var off = Object.keys(av).filter(function (k) { return av[k] && av[k].available === false; });
        if (off.length) lines.push('Currently UNAVAILABLE capabilities (do not plan these this turn): ' + off.join(', ') + '.');
      }

      var al = snap.alerts;
      if (al && (al.layerOn || al.countriesLoaded)) lines.push('Official warning layer: ' + (al.layerOn ? 'ON' : 'off') +
        (al.countriesLoaded ? (', feeds loaded for ' + al.countriesLoaded + ' country/countries') : '') +
        (al.palette ? (', shaded by ' + str(al.palette)) : '') + '.');

      var mo = snap.monitors;
      if (mo && mo.present) lines.push('Area monitoring is available' + (mo.areaActive ? ' and a monitored area is on the map' : '') + '.');

      var ws = snap.workspace;
      if (ws && ws.active) lines.push('Workspace (free-floating windows) is ACTIVE.');

      return lines.join('\n');
    };

    /* ══ THE TURN LEDGER ═══════════════════════════════════════════════════════════════════════ */
    var turns = [];
    var MAX_TURNS = 24;

    /* ══ (#R742) WHERE A LAYER THAT IS ON CAME FROM ════════════════════════════════════════════
       Measured on production 2026-09-15: sixteen questions left earthquakes, railways, wind,
       volcanoes and night lights all switched on at once, with 40.3% of the map under legends.
       Nothing in the machinery was broken. js/atlas-persona.js ALREADY instructs Atlas to take down
       「a layer you turned on for an earlier question」 when it no longer serves the current one, and
       to keep what the reader asked to keep; `renderPrompt` ALREADY named every layer that was on,
       with no ceiling (#R413). What no one gave the model was the one fact that instruction turns on:
       WHICH OF THOSE LAYERS ATLAS ITSELF PUT THERE. Asked to tell its own leftovers from the reader's
       settings, it was handed {id, label, painted} and nothing else — so it drew no distinction, and
       took nothing down. The decision stays with Atlas (「毎回 Atlas が判断する」): this supplies the
       evidence, and no rule anywhere switches a layer off on its own.

       The evidence is already on this side of the wall. `recordOperation` is called from the
       executor's `settle`, and ONLY for an operation carrying a turnId — which is the Atlas path
       (js/atlas-console.js executes with {source:'atlas', turnId}). So a layer id that was absent at
       the previous observation and present when an Atlas operation lands appeared while that
       operation ran, and the ledger says so with the turn and the capability that was running.

       ⚠ THIS RECORDS AN OBSERVATION, NOT AN AUTHOR. A layer with no record is reported as «no
       record» and never as «the reader turned it on»: it may have been on before Atlas first looked,
       or been ticked by hand, and nothing here can tell those apart. Asserting either would be data
       claiming an author it does not have.
       ⚠ THE KEY IS THE CHECKBOX ID, NOT THE NAME ATLAS ASKED FOR. `args.name` is what the model
       typed ('quakes', '地震', 'night lights'), turned into a checkbox by `resolveLayer`'s scorer in
       js/atlas-console.js. Matching that name here would be a SECOND copy of that scorer, free to
       disagree with the first one on its own schedule — the two-copies-of-one-rule shape #R515 named.
       ⚠ NO LIST OF "LAYER CAPABILITIES". Any Atlas operation that leaves a new layer on is an Atlas
       layer — layers.toggle, layers.baseDisplay, a simulation that raises its own overlay — and a
       hand-written list of the ones that count would silently miss the next one that is added. */
    var layerOrigin = Object.create(null);   /* checkbox id → {turnId, capabilityId, at} */
    /* ⚠⚠⚠ (#R775) …AND THE SAME FACT WAS MISSING FOR EVERYTHING ATLAS DRAWS. #R742 gave LAYERS an
       origin mark and stopped there; a highlight, a choropleth, a pin set, polygons, lines, a radius
       and a measurement were all still announced to the model as bare counts. js/atlas-persona.js's
       `workspace` paragraph reaches Atlas every turn and tells it to take down what an EARLIER
       question left — and with no turn recorded against any drawing, 「earlier」 was not a question
       Atlas could answer. Measured on production 2026-09-17, four times in one session:
         ・「1900年の日本の行政区分を地図に出して」 — drew the 1900 boundaries, then switched Country borders
           and State/province borders OFF as its last two operations. The reader's final screen had no
           1900 boundary on it at all.
         ・「GDP上位10か国を地図にコロプレスで描いて」 — painted the top ten, then called map.clearAll
           mid-turn and wiped its own paint; the reader was left with a different ranking.
         ・「時価総額上位10社の本社を地図にプロットして」 — spent four of its seven operations tidying an
           ALREADY EMPTY map (clearAll → clear/already_clear → clear/already_clear →
           clearHighlights/already_there) and hit the step budget before plotting one head office.
         ・「地中海に面している国を全部、地図上で選択して数えて」 — highlighted 22 countries, then cleared and
           re-drew three more times, and ended with an empty map.
       The mechanism is #R742's, unchanged and deliberately so: an operation only reaches
       `recordOperation` carrying a turnId, and a turnId only comes from the Atlas path — so a drawing
       present now that was absent at the previous observation appeared while that operation ran.
       ⚠ NO LIST OF 「DRAWING CAPABILITIES」, for #R742's reason: the keys are read off the `atlas`
       section the state block already publishes, so a drawing added later is marked without anybody
       writing its name here.
       ⚠ THIS RECORDS AN OBSERVATION, NOT A COMMAND. Nothing below erases anything and no rule here
       keeps a drawing alive; the decision stays with Atlas every turn (CONSTITUTION.md §5). What
       changes is that 「this turn」 and 「four turns ago」 stop looking identical.
       ⚠ `userPins` IS NOT MARKED — those are the reader's own pins, and a ledger that cannot tell an
       author from an observation must not claim one (#R742's own rule, and #R699's). */
    var paintOrigin = Object.create(null);   /* drawing key → {turnId, capabilityId, at} */
    var paintsSeen = null;                   /* the previous observation; `null` is "never looked" */
    /* ONE rule for 「is this key a drawing that is on the map」, read by the ledger below AND by the
       paragraph that says the map is empty. ⚠ `tool` and `userPins` are excluded here: the first is a
       mode, the second is the reader's. */
    var NOT_A_DRAWING = { tool: 1, userPins: 1 };
    function drawnKeys(at) {
      if (!at || typeof at !== 'object') return null;
      var keys = Object.create(null);
      Object.keys(at).forEach(function (k) {
        if (NOT_A_DRAWING[k]) return;
        var v = at[k];
        if (v == null || v === false || v === '' || v === 0) return;
        if (typeof v === 'object' && ('n' in v) && !(+v.n > 0)) return;
        keys[k] = 1;
      });
      return keys;
    }
    function paintKeysNow() {
      var fn = providers['atlas']; if (!fn) return null;
      try { return drawnKeys(fn()); } catch (_) { return null; }
    }
    function observePaints(by) {
      var now = paintKeysNow(); if (!now) return;
      var prev = paintsSeen;
      if (prev && by) Object.keys(now).forEach(function (k) { if (!prev[k]) paintOrigin[k] = by; });
      Object.keys(paintOrigin).forEach(function (k) { if (!now[k]) delete paintOrigin[k]; });
      if (paintsSeen) Object.keys(paintsSeen).forEach(function (k) { if (!now[k]) delete paintsSeen[k]; });
      paintsSeen = now;
    }
    /* the ledger's own read-out, for the audit and the debug view */
    API.paintOrigin = function (k) { return paintOrigin[String(k)] || null; };
    var layersSeen = null;                   /* the previous observation; `null` is "never looked" */
    function layerIdsNow() {
      var fn = providers['activeLayers']; if (!fn) return null;
      var v = null; try { v = fn(); } catch (_) { return null; }
      if (!Array.isArray(v)) return null;
      var ids = Object.create(null);
      v.forEach(function (l) {
        /* the readable-registry rows (`readable`) are a SECOND statement about the same layers, not
           boxes of their own, and their id is null whenever the two lists fall out of step */
        if (l && typeof l.readable !== 'string' && l.id) ids[String(l.id)] = 1;
      });
      return ids;
    }
    function observeLayers(by) {
      var now = layerIdsNow(); if (!now) return;
      var prev = layersSeen;
      if (prev && by) Object.keys(now).forEach(function (id) { if (!prev[id]) layerOrigin[id] = by; });
      forgetAbsent(now);
      layersSeen = now;
    }
    /* a layer switched off loses its record AND its place in the baseline: the next time it is on, it
       is on for a new reason, and that reason gets to be recorded.
       ⚠ THIS IS THE ONLY PART OF THE LEDGER `snapshot()` MAY RUN. Forgetting what is gone is safe from
       anywhere; ADDING to the baseline is not. The executor takes `afterState = snapshot()` BEFORE
       `settle` files the operation (js/atlas-executor.js), so a snapshot that quietly baselined new
       layers would make every layer Atlas switches on already-known by the time the operation lands —
       the ledger would record nothing and report every layer as unrecorded, which is the state this
       round is fixing. Additions are observed at the two turn boundaries below, and nowhere else. */
    function forgetAbsent(present) {
      Object.keys(layerOrigin).forEach(function (id) { if (!present[id]) delete layerOrigin[id]; });
      if (layersSeen) Object.keys(layersSeen).forEach(function (id) { if (!present[id]) delete layersSeen[id]; });
    }
    /* how many turns back `fromId` is, counted in the ledger's own kept turns — not by subtracting
       ids, which are not promised to be consecutive and are not promised to be numbers */
    function turnsBetween(fromId, toId) {
      var a = -1, b = -1;
      for (var i = 0; i < turns.length; i++) {
        if (turns[i].turnId === fromId) a = i;
        if (turns[i].turnId === toId) b = i;
      }
      return (a >= 0 && b >= 0) ? (b - a) : null;
    }
    function annotateLayerOrigins(rows) {
      var present = Object.create(null);
      rows.forEach(function (l) { if (l && typeof l.readable !== 'string' && l.id) present[String(l.id)] = 1; });
      forgetAbsent(present);
      var last = API.lastTurn();
      return rows.map(function (l) {
        if (!l || typeof l.readable === 'string' || !l.id) return l;
        var rec = layerOrigin[String(l.id)];
        if (!rec) return Object.assign({}, l, { origin: { by: 'unrecorded' } });
        var o = { by: 'atlas', turnId: rec.turnId, capabilityId: rec.capabilityId };
        var ago = turnsBetween(rec.turnId, last && last.turnId);
        if (ago != null) o.turnsAgo = ago;
        return Object.assign({}, l, { origin: o });
      });
    }
    /* the ledger's own read-out — the debug view and the audit ask it by id */
    API.layerOrigin = function (id) { return layerOrigin[String(id)] || null; };

    /* beginTurn(turnId, question) — opens a machine record for this exchange. */
    API.beginTurn = function (turnId, question) {
      /* the baseline, taken BEFORE the turn runs and attributed to no one: whatever is on now is on
         for a reason this ledger did not see (#R742) */
      try { observeLayers(null); } catch (_) { }
      try { observePaints(null); } catch (_) { }   /* (#R775) same baseline, same reason */
      var rec = {
        turnId: turnId, question: String(question || ''), at: (function () { try { return Date.now(); } catch (_) { return 0; } })(),
        plan: null, operations: [], objectIds: [], unresolved: [],   /* (#R406) `goalSpec` left with the planner */
        resumeToken: null, reply: '', status: 'running', repairs: 0, aiCalls: 0
      };
      turns.push(rec);
      while (turns.length > MAX_TURNS) turns.shift();
      return rec;
    };
    API.turn = function (turnId) {
      for (var i = turns.length - 1; i >= 0; i--) if (turns[i].turnId === turnId) return turns[i];
      return null;
    };
    API.lastTurn = function () { return turns.length ? turns[turns.length - 1] : null; };
    API.turns = function () { return turns.slice(); };
    /* dropFrom(turnId) — the message-edit / history-rewind path (#R298 keeps the prose side; this
       drops the STRUCTURED side of the same turns, so a rewound conversation cannot resolve "それ"
       to an object created by a turn the user has taken back). */
    API.dropFrom = function (turnId) {
      var i = -1;
      for (var k = 0; k < turns.length; k++) if (turns[k].turnId === turnId) { i = k; break; }
      if (i < 0) return 0;
      var n = turns.length - i;
      turns.splice(i, n);
      return n;
    };
    API.recordOperation = function (turnId, op) {
      var t = API.turn(turnId); if (!t || !op) return false;
      t.operations.push(op);
      if (op.objectIds && op.objectIds.length) t.objectIds = op.objectIds.concat(t.objectIds).slice(0, 12);
      if (op.unresolved && op.unresolved.length) t.unresolved = op.unresolved.concat(t.unresolved).slice(0, 12);
      if (op.inputRequest && op.inputRequest.resumeToken) t.resumeToken = op.inputRequest.resumeToken;
      /* (#R742) an operation only reaches this function with a turnId, and a turnId only comes from
         the Atlas path — so a layer that is on NOW and was not on at the last observation went on
         while THIS operation ran */
      try {
        var _by = { turnId: turnId, capabilityId: String(op.capabilityId || ''), at: (function () { try { return Date.now(); } catch (_) { return 0; } })() };
        observeLayers(_by); observePaints(_by);   /* (#R775) the same observation, for what Atlas DRAWS */
      } catch (_) { }
      return true;
    };
    API.endTurn = function (turnId, o) {
      var t = API.turn(turnId); if (!t) return null;
      Object.assign(t, o || {});
      if (!o || !o.status) t.status = 'done';
      return t;
    };

    /* resolveReference(word) — "それ" / "that" / "さっきの経路" by ID, not by prose.
       Returns {objectIds, capabilityId, turnId} of the most recent turn that made something. */
    API.resolveReference = function (kind) {
      for (var i = turns.length - 1; i >= 0; i--) {
        var t = turns[i];
        if (!t.operations.length) continue;
        for (var j = t.operations.length - 1; j >= 0; j--) {
          var op = t.operations[j];
          if (kind && op.capabilityId && op.capabilityId.indexOf(kind) !== 0) continue;
          if (op.objectIds && op.objectIds.length) return { objectIds: op.objectIds.slice(), capabilityId: op.capabilityId, turnId: t.turnId };
        }
      }
      return null;
    };

    try { window.IntMapAtlasState = API; } catch (_) { /* non-browser (the audit script) */ }
    return API;
  })();
}
