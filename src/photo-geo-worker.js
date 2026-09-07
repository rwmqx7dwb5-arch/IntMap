/* ============================================================================
 *  IntMap · THE PHOTOGRAPH SEARCH, OFF THE MAIN THREAD  (#R527)
 * ----------------------------------------------------------------------------
 *  A search over a 10 x 10 km rectangle computes a 360-degree horizon at a few thousand places and
 *  matches a skyline against each. On the page that is tens of seconds of solid arithmetic, and the
 *  map, the panel and the stop button would all be frozen for the whole of it — which is the one
 *  thing AGENTS.md asks this feature not to do. So the arithmetic lives here.
 *
 *  The modules it imports (js/photo-geo-terrain.js, -match.js, -search.js) touch no DOM and open no
 *  network of their own: they are handed decoded tiles and hand back candidates, which is what lets
 *  the SAME code run here, on the page when Worker is unavailable (src/photo-geo-worker-client.js),
 *  and in the offline evaluation behind docs/PHOTO-GEOLOCATION.md. The only thing that differs
 *  between those three is who decodes a PNG.
 *
 *  ⚠ THE TILES ARE FETCHED HERE, NOT HANDED IN. A worker cannot use `new Image()`, so the decode is
 *  createImageBitmap + OffscreenCanvas rather than the <img>-and-canvas path js/map-readout.js uses
 *  on the page. Same bucket, same four host names, same terrarium decoding — see the notes there.
 * ==========================================================================*/
import '../js/photo-geo-terrain.js';
import '../js/photo-geo-match.js';
import '../js/photo-geo-search.js';

(function () {
  'use strict';
  var T = globalThis.IntMapPhotoTerrain, Q = globalThis.IntMapPhotoSearch;
  var jobs = Object.create(null);
  /* decoded tiles survive between jobs: moving the rectangle a little, or re-running after the
     reader edits the trace, then costs no network at all */
  var tileCache = new Map();
  var TILE_CACHE_MAX = 1400;

  function post(m, transfer) { try { self.postMessage(m, transfer || []); } catch (_) { self.postMessage(m); } }

  async function fetchTile(z, x, y) {
    var key = z + '/' + x + '/' + y;
    if (tileCache.has(key)) return tileCache.get(key);
    var el = null;
    try {
      var r = await fetch(T.demURL(z, x, y), { mode: 'cors' });
      if (r.ok) {
        var blob = await r.blob();
        var bmp = await createImageBitmap(blob);
        var cv = new OffscreenCanvas(256, 256);
        var cx = cv.getContext('2d', { willReadFrequently: true });
        cx.drawImage(bmp, 0, 0, 256, 256);
        var d = cx.getImageData(0, 0, 256, 256).data;
        el = T.decodeTerrarium(d).el;
        try { bmp.close(); } catch (_) { }
      }
    } catch (_) { el = null; }
    if (tileCache.size >= TILE_CACHE_MAX) {
      /* oldest first — a Map iterates in insertion order */
      var it = tileCache.keys(); var n = 0;
      while (n++ < 200) { var k = it.next(); if (k.done) break; tileCache.delete(k.value); }
    }
    tileCache.set(key, el);
    return el;
  }

  async function loadTiles(list, id, onDone) {
    var i = 0, ok = 0, failed = 0;
    var CONC = 12;
    async function one() {
      while (i < list.length) {
        var t = list[i++];
        if (jobs[id] && jobs[id].abort) return;
        var el = await fetchTile(t.z, t.x, t.y);
        if (el) ok++; else failed++;
        if ((ok + failed) % 8 === 0) post({ id: id, type: 'progress', phase: 'tiles', done: ok + failed, total: list.length });
      }
    }
    await Promise.all(Array.from({ length: CONC }, one));
    post({ id: id, type: 'progress', phase: 'tiles', done: list.length, total: list.length });
    return { ok: ok, failed: failed };
  }

  async function runJob(m) {
    var id = m.id;
    jobs[id] = { abort: false };
    var t0 = Date.now();
    try {
      var area = m.area;
      var plan = Q.plan(area, m.options || {});
      post({ id: id, type: 'plan', plan: plan });
      var need = T.tilesFor(area, m.options || {});
      var tl = await loadTiles(need.all, id, null);
      if (jobs[id].abort) { post({ id: id, type: 'aborted' }); delete jobs[id]; return; }

      post({ id: id, type: 'progress', phase: 'terrain', done: 0, total: 1 });
      var origin = { lat: (area.south + area.north) / 2, lon: (area.west + area.east) / 2 };
      var field = T.buildField(origin, area, tileCache, m.options || {});
      post({ id: id, type: 'progress', phase: 'terrain', done: 1, total: 1 });

      var photo = { sky: m.sky, use: m.use, w: m.w, h: m.h };
      var opts = Object.assign({ spacingM: plan.spacingM }, m.options || {});
      var last = 0;
      var res = Q.run(field, photo, opts, {
        shouldAbort: function () { return jobs[id] && jobs[id].abort; },
        onProgress: function (done, total, best, phase) {
          var now = Date.now();
          /* one message every 120 ms: enough to animate a bar, few enough not to flood the page */
          if (now - last < 120 && done < total) return;
          last = now;
          post({
            id: id, type: 'progress', phase: phase, done: done, total: total,
            best: best ? { lat: best.lat, lon: best.lon, score: best.score, explainedDeg: best.explainedDeg, yawDeg: best.yawDeg } : null
          });
        }
      });
      if (!res || res.ok === false) { post({ id: id, type: 'error', err: (res && res.reason) || 'search failed' }); delete jobs[id]; return; }

      /* the horizon of each reported candidate, so the page can draw the predicted skyline over the
         photograph without recomputing anything */
      var eye = opts.observerHeightM == null ? 1.6 : opts.observerHeightM;
      var overlays = [];
      for (var i = 0; i < res.candidates.length; i++) {
        var c = res.candidates[i];
        var H = T.horizon(field, c.e, c.n, { nAz: Q.FINE_NAZ, observerHeightM: eye });
        overlays.push(H ? Q.predictedSkyline(H, c, m.w, m.h, 1) : []);
      }
      res.tiles = { requested: need.all.length, decoded: tl.ok, failed: tl.failed };
      res.overlays = overlays;
      res.elapsedMs = Date.now() - t0;
      post({ id: id, type: 'done', result: res });
    } catch (e) {
      post({ id: id, type: 'error', err: String((e && e.message) || e) });
    }
    delete jobs[id];
  }

  /* Recompute one candidate after the reader nudges the position, bearing or field of view. Needs
     the terrain again, so it keeps the last field rather than rebuilding it. */
  var lastField = null, lastKey = '';
  async function nudge(m) {
    var id = m.id;
    try {
      var key = JSON.stringify(m.area);
      if (!lastField || lastKey !== key) {
        var need = T.tilesFor(m.area, m.options || {});
        await loadTiles(need.all, id, null);
        lastField = T.buildField({ lat: (m.area.south + m.area.north) / 2, lon: (m.area.west + m.area.east) / 2 }, m.area, tileCache, m.options || {});
        lastKey = key;
      }
      var en = lastField.toEN(m.lat, m.lon);
      var eye = (m.options && m.options.observerHeightM != null) ? m.options.observerHeightM : 1.6;
      var H = T.horizon(lastField, en.e, en.n, { nAz: Q.FINE_NAZ, observerHeightM: eye });
      if (!H) { post({ id: id, type: 'error', err: 'no terrain at that point' }); return; }
      var M = globalThis.IntMapPhotoMatch;
      var cand = { yawDeg: m.yawDeg, pitchDeg: m.pitchDeg, rollDeg: m.rollDeg || 0, hfovDeg: m.hfovDeg };
      cand.focalPx = M.focalFromHFov(m.w, m.hfovDeg);
      var fit = M.scoreExact(m.sky, m.use, m.w, m.h, H, Object.assign({ samples: 128 }, cand));
      post({
        id: id, type: 'nudged',
        fit: { score: fit.score, agreement: fit.agreement, inlierFrac: fit.inlierFrac, rmsDeg: fit.rmsDeg, explainedDeg: fit.explainedDeg, evaluatedFrac: fit.evaluatedFrac },
        overlay: Q.predictedSkyline(H, cand, m.w, m.h, 1),
        groundM: H.groundM, eyeM: H.eyeM
      });
    } catch (e) { post({ id: id, type: 'error', err: String((e && e.message) || e) }); }
  }

  self.onmessage = function (ev) {
    var m = ev.data || {};
    if (m.type === 'search') { runJob(m); return; }
    if (m.type === 'nudge') { nudge(m); return; }
    if (m.type === 'abort') { if (jobs[m.id]) jobs[m.id].abort = true; return; }
    if (m.type === 'plan') {
      try { post({ id: m.id, type: 'plan', plan: Q.plan(m.area, m.options || {}) }); }
      catch (e) { post({ id: m.id, type: 'error', err: String(e) }); }
      return;
    }
    if (m.type === 'clearCache') { tileCache.clear(); lastField = null; lastKey = ''; return; }
  };
})();
