/* ============================================================================
 *  IntMap · THE PAGE SIDE OF THE PHOTOGRAPH SEARCH — window.IntMapPhotoGeoWorker  (#R527)
 * ----------------------------------------------------------------------------
 *  src/photo-geo-worker.js does the arithmetic; this is the half that has to live on the page. It
 *  lives in src/ for the one reason src/tsunami-worker-client.js and src/sat-worker-client.js do:
 *  naming the worker asset needs `new URL(..., import.meta.url)`, which is what lets the bundler
 *  emit and fingerprint it.
 *
 *  ⚠ AND IT CARRIES THE FALLBACK ITSELF, WHICH THE OTHER TWO DO NOT. js/tsunami.js keeps its own
 *  main-thread solver; here the fallback would be a second copy of the search loop, and a second
 *  copy is a second thing to be wrong. Instead the SAME js/photo-geo-search.js runs on the page,
 *  sliced so the frame is given back between rows — slower, and honest about being slower, but
 *  identical in what it computes. `usingWorker` says which path ran, and js/photo-geo.js shows it.
 * ==========================================================================*/
window.IntMapPhotoGeoWorker = (function () {
  'use strict';
  var w = null, tried = false, seq = 0;
  var jobs = new Map();
  var fallbackAbort = null;

  function worker() {
    if (tried) return w;
    tried = true;
    try {
      if (typeof Worker !== 'function') return null;
      var it = new Worker(new URL('./photo-geo-worker.js', import.meta.url), { type: 'module' });
      it.onmessage = function (ev) {
        var m = ev.data || {}; var j = jobs.get(m.id); if (!j) return;
        if (m.type === 'progress') { try { j.onProgress && j.onProgress(m); } catch (_) { } return; }
        if (m.type === 'plan') { try { j.onPlan && j.onPlan(m.plan); } catch (_) { } return; }
        if (m.type === 'done') { jobs.delete(m.id); try { j.res(m.result); } catch (_) { } return; }
        if (m.type === 'nudged') { jobs.delete(m.id); try { j.res(m); } catch (_) { } return; }
        if (m.type === 'aborted') { jobs.delete(m.id); try { j.res(null); } catch (_) { } return; }
        if (m.type === 'error') { jobs.delete(m.id); try { j.rej(new Error(m.err || 'photo search worker')); } catch (_) { } return; }
      };
      /* a worker that dies must not take the search with it — every pending job is rejected and the
         caller falls back to the page path on the next attempt */
      it.onerror = function () {
        try { it.terminate(); } catch (_) { }
        w = null;
        jobs.forEach(function (j) { try { j.rej(new Error('photo search worker died')); } catch (_) { } });
        jobs.clear();
      };
      /* (#R668) tell it what device this is, before any tile is asked for. A worker has no
         `matchMedia`, so js/mem-budget.js assumes the SMALL device until this arrives — safe, but
         wrong for a desktop, and this is the one place that knows. */
      try { it.postMessage({ type: 'device', phone: !!(window._imPhoneClass && window._imPhoneClass()) }); } catch (_) { }
      w = it;
    } catch (_) { w = null; }
    return w;
  }

  function deps() {
    var g = window;
    return g.IntMapPhotoTerrain && g.IntMapPhotoMatch && g.IntMapPhotoSearch;
  }

  /* ── the page path ──────────────────────────────────────────────────────────────────────────────
     Same modules, same options; the difference is that the tiles come through an <img> (the page
     has one and a worker does not) and the sweep is cut into slices so the browser gets a frame
     between them. */
  function decodeOnPage(url) {
    return new Promise(function (resolve) {
      var img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
          var cx = cv.getContext('2d', { willReadFrequently: true });
          cx.drawImage(img, 0, 0, 256, 256);
          resolve(window.IntMapPhotoTerrain.decodeTerrarium(cx.getImageData(0, 0, 256, 256).data).el);
        } catch (_) { resolve(null); }
      };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  /* ══ ⚠⚠⚠ (#R668) THE FALLBACK PATH HAD NO CEILING AT ALL ══════════════════════════════════════
     The worker's store had a ceiling that ignored the device (1400 tiles = 367 MB). This one — the
     path taken when `new Worker` FAILED — had none to ignore: `pageTiles` grew for the life of the
     page, one `Float32Array(65536)` per tile, on the main thread's own heap, and the only thing that
     ever emptied it was `clearCache()`, which nothing in js/ calls.
     ⚠ AND THIS IS THE WORSE OF THE TWO PLACES FOR THAT. A worker fails to be created exactly on the
     devices that are short of memory to begin with, so the unbounded store is the one that runs on
     the phone the report is about, while the bounded one runs on the machine that could afford it.
     Trimmed AFTER each search rather than during: `buildField` reads the whole area out of this Map
     (see the call below), so evicting mid-run would put holes in the answer — #R221's defect. */
  var pageTiles = new Map();
  function trimPageTiles() {
    var cap = 180;
    try { cap = window.IntMapMemBudget.demTiles('photoSearch'); } catch (_) { }
    var it = pageTiles.keys();
    while (pageTiles.size > cap) { var k = it.next(); if (k.done) break; pageTiles.delete(k.value); }
  }
  async function runOnPage(req, hooks) {
    var T = window.IntMapPhotoTerrain, Q = window.IntMapPhotoSearch;
    var plan = Q.plan(req.area, req.options || {});
    if (hooks.onPlan) hooks.onPlan(plan);
    var need = T.tilesFor(req.area, req.options || {});
    var loaded = 0, failed = 0;
    var list = need.all.slice();
    var idx = 0;
    async function pump() {
      while (idx < list.length) {
        if (fallbackAbort && fallbackAbort()) return;
        var t = list[idx++];
        var key = t.z + '/' + t.x + '/' + t.y;
        if (!pageTiles.has(key)) pageTiles.set(key, await decodeOnPage(T.demURL(t.z, t.x, t.y)));
        if (pageTiles.get(key)) loaded++; else failed++;
        if ((loaded + failed) % 6 === 0 && hooks.onProgress) hooks.onProgress({ phase: 'tiles', done: loaded + failed, total: list.length });
      }
    }
    await Promise.all([pump(), pump(), pump(), pump(), pump(), pump()]);
    if (hooks.onProgress) hooks.onProgress({ phase: 'tiles', done: list.length, total: list.length });
    await new Promise(function (r) { setTimeout(r, 0); });
    var origin = { lat: (req.area.south + req.area.north) / 2, lon: (req.area.west + req.area.east) / 2 };
    var field = T.buildField(origin, req.area, pageTiles, req.options || {});
    /* Q.run yields to the caller every few points (see its header), so on the page that is a frame
       between slices rather than one long block — and the stop button works here for the same reason
       it works in the worker. It is still slower than the worker, which is why js/photo-geo.js shows
       the «no Worker» notice. */
    var res = await Q.run(field, { sky: req.sky, use: req.use, w: req.w, h: req.h },
      Object.assign({ spacingM: plan.spacingM }, req.options || {}),
      { tick: function () { return new Promise(function (r) { setTimeout(r, 0); }); },
        shouldAbort: function () { return fallbackAbort && fallbackAbort(); }, onProgress: function (d, t, b, ph) { if (hooks.onProgress) hooks.onProgress({ phase: ph, done: d, total: t, best: b }); } });
    if (!res || res.ok === false) throw new Error((res && res.reason) || 'search failed');
    var eye = (req.options && req.options.observerHeightM != null) ? req.options.observerHeightM : 1.6;
    res.overlays = res.candidates.map(function (c) {
      var H = T.horizon(field, c.e, c.n, { nAz: Q.FINE_NAZ, observerHeightM: eye });
      return H ? Q.predictedSkyline(H, c, req.w, req.h, 1) : [];
    });
    res.tiles = { requested: need.all.length, decoded: loaded, failed: failed };
    return res;
  }

  /* (#R668) enrol the page-path store with the budget, so memory pressure can reclaim it. The
     worker's copy is not enrolled from here on purpose — it lives in another heap and answers the
     `clearCache` message instead; a `bytes()` that lied about which heap it was counting would make
     the ledger's total meaningless. */
  try {
    window.IntMapMemBudget.register('photoSearch.page', {
      bytes: function () { return pageTiles.size * window.IntMapMemBudget.DEM_TILE_BYTES; },
      release: function () { pageTiles.clear(); },
    });
  } catch (_) { }

  function send(type, payload, hooks) {
    var it = worker();
    var id = ++seq;
    if (it) {
      return new Promise(function (res, rej) {
        jobs.set(id, { res: res, rej: rej, onProgress: hooks && hooks.onProgress, onPlan: hooks && hooks.onPlan });
        it.postMessage(Object.assign({ id: id, type: type }, payload));
      });
    }
    if (!deps()) return Promise.reject(new Error('photo geolocation modules are not loaded'));
    /* (#R668) `.finally` rather than a line at the end of runOnPage: the search can throw, and an
       abort rejects — a ceiling applied only on the happy path is not a ceiling. */
    if (type === 'search') { fallbackAbort = (hooks && hooks.shouldAbort) || null; return runOnPage(payload, hooks || {}).finally(trimPageTiles); }
    if (type === 'plan') return Promise.resolve(window.IntMapPhotoSearch.plan(payload.area, payload.options || {}));
    return Promise.reject(new Error('unsupported on the page path: ' + type));
  }

  return {
    available: function () { return !!worker(); },
    usingWorker: function () { return !!w; },
    /* `hooks.onProgress({phase, done, total, best})` and `hooks.onPlan(plan)` */
    search: function (req, hooks) {
      var it = worker();
      if (it) {
        var id = ++seq;
        return {
          id: id,
          promise: new Promise(function (res, rej) {
            jobs.set(id, { res: res, rej: rej, onProgress: hooks && hooks.onProgress, onPlan: hooks && hooks.onPlan });
            it.postMessage(Object.assign({ id: id, type: 'search' }, req));
          }),
          abort: function () { try { it.postMessage({ id: id, type: 'abort' }); } catch (_) { } }
        };
      }
      var stopped = false;
      return {
        id: 0,
        promise: send('search', req, Object.assign({}, hooks, { shouldAbort: function () { return stopped; } })),
        abort: function () { stopped = true; }
      };
    },
    plan: function (area, options) { return send('plan', { area: area, options: options }); },
    nudge: function (req) { return send('nudge', req); },
    clearCache: function () { var it = worker(); if (it) { try { it.postMessage({ type: 'clearCache' }); } catch (_) { } } pageTiles.clear(); }
  };
})();
