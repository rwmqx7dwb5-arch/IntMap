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
import '../js/mem-budget.js';   /* (#R668) how many decoded tiles this device may hold. It attaches to `globalThis`, touches no DOM and asks no media query, which is what lets the page and this worker share ONE answer instead of keeping two ceilings that disagree. */

(function () {
  'use strict';
  var T = globalThis.IntMapPhotoTerrain, Q = globalThis.IntMapPhotoSearch;
  var jobs = Object.create(null);
  /* decoded tiles survive between jobs: moving the rectangle a little, or re-running after the
     reader edits the trace, then costs no network at all */
  var tileCache = new Map();
  /* ══ ⚠⚠⚠ (#R668) 1400 DECODED TILES IS 367 MB, AND IT WAS THE SAME 1400 ON EVERY DEVICE ═══════
     A cached tile is `Float32Array(65536)` = 262,144 bytes (js/photo-geo-terrain.js decodeTerrarium),
     so this ceiling — the largest of the five DEM stores in this app — authorised more memory on its
     own than a phone tab usually gets in total, and nothing in it ever asked what device it was on.
     ⚠ A WORKER CANNOT ASK. There is no `matchMedia` and no `window` here, so the page hands the
     answer over (`type:'device'`, sent by src/photo-geo-worker-client.js as soon as the worker is
     created). Until it arrives js/mem-budget.js assumes the SMALL device: an unknown device is not
     a spacious one, which is the rule #R651 established for `navigator.deviceMemory` — `undefined`
     is what every iPhone reports, always, and reading it as "plenty" is how a phone gets a
     workstation's ceiling. */
  var TILE_CACHE_MAX = function () {
    try { return globalThis.IntMapMemBudget.demTiles('photoSearch'); } catch (_) { return 180; }
  };

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
    tileCache.set(key, el);
    trimTiles(key);
    return el;
  }

  /* ══ ⚠⚠ (#R668) THE CEILING MAY NOT EVICT WHAT THE JOB IS STILL BUILDING FROM ══════════════════
     `runJob` loads every tile of `need.all` and only then calls `buildField(…, tileCache, …)`, so a
     tile dropped between those two steps is a HOLE IN THE ANSWER, not a cache miss — the search
     silently scores that ground as unknown. #R221 recorded exactly this failure in the elevation
     readout's store, where the intensity field came out as perfect concentric rings because the
     picture's own tiles had been evicted by the picture's own later tiles.
     So the tiles of the RUNNING job are leased and exempt, and the ceiling governs what survives
     BETWEEN jobs — which is what the cache is for. ⚠ THE HONEST LIMIT: a single search area larger
     than the budget still holds its whole area, because it must. The budget bounds what is KEPT,
     not what one answer costs; bounding the latter means bounding the search area, which is a
     product decision and not this round's. `pinned` is cleared in `runJob`'s `finally`, so an abort
     or a throw cannot leave the ceiling permanently lifted (#R651's rule for leases). */
  var pinned = null;   /* Set of 'z/x/y' the running job needs, or null between jobs */

  function trimTiles(keep) {
    var cap = TILE_CACHE_MAX();
    if (tileCache.size <= cap) return;
    var it = tileCache.keys();
    while (tileCache.size > cap) {
      var k = it.next(); if (k.done) break;
      if (k.value === keep) continue;
      if (pinned && pinned.has(k.value)) continue;
      tileCache.delete(k.value);
    }
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
      /* (#R668) lease this job's tiles before the first one is fetched — the ceiling must not evict
         ground the field is about to be built from. Released in `finally`, on every exit. */
      pinned = new Set(need.all.map(function (t) { return t.z + '/' + t.x + '/' + t.y; }));
      var tl = await loadTiles(need.all, id, null);
      if (jobs[id].abort) { post({ id: id, type: 'aborted' }); delete jobs[id]; return; }

      post({ id: id, type: 'progress', phase: 'terrain', done: 0, total: 1 });
      var origin = { lat: (area.south + area.north) / 2, lon: (area.west + area.east) / 2 };
      var field = T.buildField(origin, area, tileCache, m.options || {});
      post({ id: id, type: 'progress', phase: 'terrain', done: 1, total: 1 });

      var photo = { sky: m.sky, use: m.use, w: m.w, h: m.h };
      var opts = Object.assign({ spacingM: plan.spacingM }, m.options || {});
      var last = 0;
      var res = await Q.run(field, photo, opts, {
        /* ⚠ A MACROTASK, NOT A MICROTASK. Returning to the event loop is the whole point: it is what
           lets self.onmessage deliver the 'abort' this predicate then reads. Promise.resolve() would
           drain microtasks and leave the message queued. */
        tick: function () { return new Promise(function (r) { setTimeout(r, 0); }); },
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
    } finally {
      /* ⚠ (#R668) ON EVERY EXIT, INCLUDING THE EARLY RETURNS ABOVE. A lease that survives its job is
         a ceiling that has been switched off: `trimTiles` skips pinned keys, so a `pinned` left
         behind by an abort would exempt that whole area from eviction for the rest of the session.
         The trim that follows applies the ceiling to what the job just leased. */
      pinned = null;
      trimTiles(null);
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
    /* (#R668) the page is the only one that can answer 「携帯か」 — there is no media query here. It
       sends this once, as soon as the worker exists, and the ceiling above follows it from then on. */
    if (m.type === 'device') { try { globalThis.IntMapMemBudget.adopt(!!m.phone); } catch (_) { } trimTiles(null); return; }
    if (m.type === 'clearCache') { tileCache.clear(); lastField = null; lastKey = ''; return; }
  };
})();
