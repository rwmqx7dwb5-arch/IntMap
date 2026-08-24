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
export function makeAtlasState(HOST) {
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
        ['#corr-overlay', 'Correlation tool'], ['.research-panel', 'Research panel'], ['.pg-overlay', 'Playground']];
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

      /* `n` is the TOTAL; `items` is the addressable head of it. Capping the array alone would turn
         "30 objects" into "12 objects" the moment anyone counted the list instead of reading the count. */
      reg('objects', function () {
        var OB = GLOBAL('IntMapObjects');
        if (!OB || typeof OB.list !== 'function') return null;
        var list = OB.list() || [];
        return { n: list.length, items: list.slice(0, 12).map(function (o) {
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
    var RENDER_LIMITS = { maxLayers: 40, maxReadable: 10, maxObjects: 12, maxTitle: 140, maxBody: 2600,
      maxSearch: 60, maxPolyNames: 4, maxObjectName: 24 };
    var PROJ_WORD = { '3d-terrain': '3D terrain', 'flat': 'flat', 'globe': 'globe' };
    API.renderPrompt = function (snap, opts) {
      snap = snap || {};
      var lim = Object.assign({}, RENDER_LIMITS, opts || {});
      var lines = [];
      var str = function (v) { return (v == null) ? '' : String(v); };

      var cam = snap.camera;
      if (cam && isFinite(cam.lat) && isFinite(cam.lng) && isFinite(cam.zoom)) {
        lines.push('Map center ≈ ' + (+cam.lat).toFixed(2) + ',' + (+cam.lng).toFixed(2) + ' · zoom ' + (+cam.zoom).toFixed(1) +
          ' · ' + (cam.base || 'map') + ' base · ' + (PROJ_WORD[cam.projection] || 'globe') +
          ' view · bearing ' + Math.round(+cam.bearing || 0) + '°.');
      }

      var sel = snap.selection || {};
      if (sel.lastPlace && sel.lastPlace.name) lines.push('Last place referenced: "' + sel.lastPlace.name + '" — map "here"/"there"/"that place" to it.');

      /* `null` is "nobody published the layer state", which is not the same claim as "no layers are on" —
         so the reassuring sentence is only printed when a provider actually looked. */
      if (Array.isArray(snap.activeLayers)) {
        var on = [], readable = [];
        snap.activeLayers.forEach(function (l) {
          if (!l) return;
          if (typeof l.readable === 'string') { readable.push(l.readable); return; }
          on.push(str(l.label) + (l.painted === false ? ' [NOT painted on the map — data still loading or failed]' : ''));
        });
        lines.push(on.length ? ('Layers ON (' + on.length + '): ' + on.slice(0, lim.maxLayers).join(', ') + '.') : 'No data layers are on.');
        if (readable.length) lines.push('Readable layer data (query real values with the "layerData" action): ' + readable.slice(0, lim.maxReadable).join(' | ') + '.');
      }

      var at = snap.atlas || {};
      if (at.highlightCountries) lines.push(at.highlightCountries + ' countries are highlighted by Atlas right now.');
      if (at.highlight && at.highlight.name) lines.push('Current Atlas highlight: "' + at.highlight.name + '"' +
        (at.highlight.basis ? (' — BASIS: ' + at.highlight.basis + '. If the user asks what YEAR the highlighted membership/data refers to, answer from THIS basis') : '') + '.');
      if (at.choropleth && at.choropleth.label) lines.push('The map is currently shaded (choropleth) by ' + at.choropleth.label + '.');
      else if (at.customScore && at.customScore.name) lines.push('The map is currently shaded by a CUSTOM Atlas evaluation score: "' + at.customScore.name +
        '" — follow-ups like "weight X more" / "drop Y" should re-emit scoreMap with adjusted components.');
      if (sel.countryCard && sel.countryCard.name) lines.push('Open country card: ' + sel.countryCard.name + ' — "this country"/"it"/"over time" refer to it.');

      var ar = sel.article;
      if (ar && ar.title) {
        lines.push('OPEN NEWS ARTICLE (the user is reading this right now): "' + str(ar.title).slice(0, lim.maxTitle) + '"' +
          (ar.publisher ? (' — ' + ar.publisher) : '') + (ar.pubDate ? (', ' + str(ar.pubDate).slice(0, 16)) : '') +
          (ar.place ? (', about ' + ar.place) : '') +
          '. "This article / this event / この記事 / この出来事 / それ / a bare 詳しく・背景・なぜ・translate this" refer to THIS article' +
          ((ar.loc && isFinite(ar.loc[0])) ? ('; its location is ' + (+ar.loc[1]).toFixed(2) + ',' + (+ar.loc[0]).toFixed(2) + ' — "there / 現地" map here') : '') + '.');
        if (ar.body) lines.push('ARTICLE BODY (extracted reader text — quote/translate/analyze from THIS, not from memory):\n"""\n' + str(ar.body).slice(0, lim.maxBody) + '\n"""');
      }

      if (at.pins && at.pins.n) lines.push(at.pins.n + ' Atlas pins are on the map' +
        (at.pins.kind === 'research' ? ' (research-report pins with summaries)' : ' (facility/POI pins)') + '.');
      if (at.polygons && at.polygons.n) {
        var pn = (at.polygons.names || []).slice(0, lim.maxPolyNames).join(', ');
        lines.push(at.polygons.n + ' Atlas polygon highlight(s)' + (pn ? (': ' + pn) : '') + '.');
      }
      if (at.lines && at.lines.n) lines.push(at.lines.n + ' Atlas line(s) drawn (river courses / routes / custom lines).');
      if (at.measure && at.measure.n) lines.push('Measure tool active with ' + at.measure.n + ' points.');
      if (at.radius && at.radius.n) lines.push(at.radius.n + ' radius circle(s) on the map.');
      if (at.userPins && at.userPins.n) lines.push(at.userPins.n + ' user pin(s) on the map.');

      var pa = snap.panels || {};
      if (pa.rightLayerSidebar) lines.push('The right layer sidebar is open.');
      if (pa.ticker) lines.push('The bottom news/markets ticker is on.');
      if (pa.sidebarTab) lines.push('Active sidebar tab: ' + pa.sidebarTab + '.');
      if (pa.open && pa.open.length) lines.push('Open panels: ' + pa.open.join(', ') + '.');
      if (at.tool) lines.push('Active map tool: ' + at.tool + ((at.measure && at.measure.n) ? (' (' + at.measure.n + ' points)') : '') + '.');

      var cp = snap.comparison;
      if (cp && cp.open && cp.codes && cp.codes.length) lines.push('Country comparison is OPEN right now: countries=' + cp.codes.join(',') +
        ' · indicators=' + (cp.indicators || []).join(',') + ' · view=' + cp.mode +
        ' · per-indicator sources=' + JSON.stringify(cp.sources || {}) +
        '. "この比較 / the comparison / それ" refers to THIS (the user may have configured it by hand).');

      var ob = snap.objects;
      if (ob && ob.n) lines.push('Map objects (' + ob.n + ') — target them with the "object" action by id: ' +
        (ob.items || []).slice(0, lim.maxObjects).map(function (o) {
          return o.kind + ' id=' + o.id + ' "' + str(o.name).slice(0, lim.maxObjectName) + '"'; }).join('; ') + '.');

      var tm = snap.time || {};
      if (tm.travelDate) lines.push('TIME TRAVEL is active — news/imagery around ' + tm.travelDate +
        ' (not today). "now/current" requests may need timeTravel reset. IMPORTANT: this date is a DISPLAY setting of the map. It is NOT the data year of any statistic, highlight or reply — NEVER present it as "the year of the data".');
      if (tm.layerDates && tm.layerDates.length) lines.push('Dated raster layers showing: ' +
        tm.layerDates.map(function (d) { return d.layer + '=' + d.date; }).join(', ') + ' (changeable via control "date: <layer>").');

      if (str(sel.searchBox).trim()) lines.push('Search box contains: "' + str(sel.searchBox).trim().slice(0, lim.maxSearch) + '".');

      if (pa.workspaceMode) lines.push('WORKSPACE MODE is on — the UI is free-floating windows (News / Countries / Information / Community / Map / Layers), a top menu bar (View/Tools/Window/Settings) and a fixed bottom ticker; hidden windows reopen from the Window menu; turn off via the "setting-wsmode-btn" button or IntMapWorkspace.close.');

      var st = snap.settings;
      if (st) lines.push('UI language=' + st.lang + ', theme=' + ((st.theme == null) ? 'auto' : st.theme) +
        (st.tempUnit ? (', temp unit=°' + st.tempUnit) : '') + (st.engine ? (', map engine=' + st.engine) : '') + '.');

      /* ── (#R397) THE SIX THAT REACHED THE MODEL AS NOTHING, PLUS THE THREE THIS ROUND ADDED ──── */
      var vp = snap.viewport;
      if (vp && isFinite(vp.west)) lines.push('Visible bounds: W ' + (+vp.west).toFixed(2) + ', S ' + (+vp.south).toFixed(2) +
        ', E ' + (+vp.east).toFixed(2) + ', N ' + (+vp.north).toFixed(2) + ' (this is the frame the reader can actually see).');

      var rt = snap.routing;
      if (rt && (rt.hasRoute || rt.painted || rt.mode)) lines.push('ROUTE on the map: ' +
        (rt.hasRoute ? 'a route is drawn' : 'no route drawn') + (rt.mode ? (', travel mode=' + str(rt.mode)) : '') +
        (rt.alts != null ? (', ' + rt.alts + ' alternative(s)') : '') + '.');

      var dl = snap.deviceLocation;
      if (dl && isFinite(dl.lat)) lines.push('The reader\'s DEVICE location is known: ' + (+dl.lat).toFixed(3) + ', ' +
        (+dl.lng).toFixed(3) + ' — use it only for "near me"-style requests, never as the subject of a question that named a place.');

      var sim = snap.simulations;
      if (sim && Object.keys(sim).length) lines.push('Simulations open: ' + Object.keys(sim).join(', ') + '.');

      var pend = snap.pendingOperations;
      if (pend && pend.length) lines.push('Operations still RUNNING from an earlier turn: ' +
        pend.slice(0, 6).map(function (p) { return str(p && (p.capabilityId || p.id)); }).filter(Boolean).join(', ') +
        ' — do not re-issue these; they have not finished.');

      /* Only the UNAVAILABLE ones. Listing what works would repeat the catalogue the planner already has. */
      var av = snap.capabilityAvailability;
      if (av) {
        var off = Object.keys(av).filter(function (k) { return av[k] && av[k].available === false; });
        if (off.length) lines.push('Currently UNAVAILABLE capabilities (do not plan these this turn): ' + off.slice(0, 12).join(', ') + '.');
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

    /* beginTurn(turnId, question) — opens a machine record for this exchange. */
    API.beginTurn = function (turnId, question) {
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
