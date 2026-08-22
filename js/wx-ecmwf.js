/* ============================================================================
 *  IntMap · ONE ECMWF IFS model — window.IntMapECMWF   (#R276)
 * ----------------------------------------------------------------------------
 *  「animated windの5度／8度Open-Meteo地点格子と全球1024×512 Canvasを廃止し、既存の
 *    ECMWF IFS 9 kmネイティブタイルを使用する。色面と粒子は必ず同じU/V・同じ有効時刻から
 *    描画し、低解像度地点格子へ退行させない。」
 *  「ECMWFの将来時刻を削除しているフィルターを撤去し、提供される全予報時刻を利用可能にする。」
 *  「地図上の地点値は、表示中のレイヤー・モデル・時刻と同じデータから取得する。」
 *
 *  ── WHAT WAS MEASURED BEFORE A LINE OF THIS WAS WRITTEN ───────────────────────────────────────
 *  Three separate defects, all of them invisible from the outside because each one still drew
 *  SOMETHING:
 *
 *  ① THE TIME SLIDER HAD NEVER SELECTED A TIME. js/weather.js built its tile URL as
 *         om://…/latest.json?variable=X&time=<ISO>
 *     and the Open-Meteo SDK's own `normalizeUrl` ignores `time` completely — it resolves
 *     `latest.json` to `valid_times[0]` unless a `time_step=valid_times:<i>` parameter is present
 *     (which in 0.0.19 parses to `NaN-aN-aNTaN00.om`, i.e. also unusable). MEASURED in the browser:
 *         normalizeUrl('…latest.json?variable=temperature_2m&time=2026-08-21T00:00Z')
 *           -> '…/2026/08/20/0600Z/2026-08-20T0600.om?variable=temperature_2m'
 *     …the model's own reference hour, whatever the slider said. AND the SDK's cache key is built
 *     from `DATA_RELEVANT_PARAMS`, which is `['variable']` — so even a URL that did differ by time
 *     would have hit the same cached state. Every ECMWF raster this app has ever drawn was the
 *     analysis hour. The fix is to stop handing the SDK a `.json` at all: this module resolves
 *     reference_time + valid_time into the real `.om` path itself, so the file name — and therefore
 *     the cache key — carries the forecast hour.
 *
 *  ② `sea_surface_temperature` IS NOT IN THE FEED. `latest.json`'s `variables` list (35 entries)
 *     has no such name, so the ec-sst layer asked the reader for a child that does not exist and
 *     drew nothing, silently. Layers are now declared against the live variable list.
 *
 *  ③ THE FUTURE WAS BEING THROWN AWAY. `fetchMeta` kept only valid times <= now+1 h: MEASURED, the
 *     slider offered 8 steps out of the 109 the feed publishes (six days of forecast).
 *
 *  ── WHY THIS FILE EXISTS RATHER THAN A PATCH IN js/weather.js ─────────────────────────────────
 *  Four surfaces need the SAME model state — the raster layers, the animated wind, the point
 *  readout under the cursor and the share link. #R183 already paid for the lesson that a fix cannot
 *  travel between call sites that each own their own fetch. So the model is a module: one metadata
 *  fetch, one valid-time index, one URL builder, one decoded field, one colour scale.
 *
 *  Source & terms: Open-Meteo map tiles (ECMWF IFS HRES 0.08°/≈9 km, CC-BY 4.0, keyless) — declared
 *  in js/reference-data.js, sources.html and js/legal.js.
 * ==========================================================================*/
(function () {
  'use strict';

  var BASE = 'https://map-tiles.open-meteo.com/data_spatial/ecmwf_ifs';
  var META_URL = BASE + '/latest.json';
  var DOMAIN = 'ecmwf_ifs';
  /* the SDK is a 340 kB (compressed) third-party bundle; it is fetched the first time a weather
     layer is actually switched on, NOT at boot. The metadata below needs no SDK at all. */
  var SDK_VER = '0.0.19';
  var SDK_URLS = [
    'https://unpkg.com/@openmeteo/weather-map-layer@' + SDK_VER + '/dist/index.js',
    'https://cdn.jsdelivr.net/npm/@openmeteo/weather-map-layer@' + SDK_VER + '/dist/index.js'
  ];

  var meta = null;          /* {referenceTime, validTimes[], variables[], fetchedAt} */
  var metaP = null;
  var idx = 0;              /* index into meta.validTimes */
  var idxSet = false;       /* has anyone chosen a step yet? */
  var playing = false, playTimer = 0, playMs = 700;
  var listeners = [];
  var sdk = null, sdkP = null, protoReg = false;
  var _prevValid = '';

  function emit(type, extra) {
    var ev = Object.assign({ type: type }, extra || {});
    listeners.slice().forEach(function (f) { try { f(ev); } catch (_) {} });
    try { window.dispatchEvent(new CustomEvent('intmap-ecmwf', { detail: ev })); } catch (_) {}
  }

  function tms(t) { try { return Date.parse(/[zZ]$/.test(t) ? t : t + 'Z'); } catch (_) { return NaN; } }
  function nearestTo(ms) {
    if (!meta) return 0;
    var best = 0, bd = Infinity;
    meta.validTimes.forEach(function (t, i) { var d = Math.abs(tms(t) - ms); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function nowIndex() { return nearestTo(Date.now()); }

  /* ── metadata ─────────────────────────────────────────────────────────────────────────────────
     A plain JSON fetch through IntMapWx.guardedJSON so it shares the app's ONE cache / de-duplicator
     / failure guard rather than opening a private one (#R183). NOTHING is filtered out of
     `valid_times`: the feed publishes hourly steps for ~3 days and 3-hourly to +6 days, and the
     instruction is that all of them are reachable. */
  function fetchMeta(force) {
    if (metaP && !force) return metaP;
    var get = (window.IntMapWx && window.IntMapWx.guardedJSON)
      ? window.IntMapWx.guardedJSON(META_URL, 300000)
      : fetch(META_URL, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    metaP = get.then(function (j) {
      if (!j || !Array.isArray(j.valid_times) || !j.valid_times.length) { metaP = null; return meta; }
      var prevRef = meta && meta.referenceTime;
      meta = {
        referenceTime: j.reference_time || '',
        lastModified: j.last_modified_time || '',
        completed: j.completed !== false,
        validTimes: j.valid_times.slice(),
        variables: (j.variables || []).slice(),
        fetchedAt: Date.now()
      };
      /* A new model run re-bases the whole axis. Keep the reader on the SAME WALL-CLOCK INSTANT
         rather than on the same index — index 6 of the 06Z run and index 6 of the 12Z run are six
         hours apart, and silently jumping the map forward is the kind of change nobody asks for. */
      if (prevRef && prevRef !== meta.referenceTime && idxSet) {
        idx = _prevValid ? nearestTo(tms(_prevValid)) : nowIndex();
      } else if (!idxSet) {
        idx = nowIndex();
      }
      _prevValid = meta.validTimes[idx] || '';
      /* ⚠⚠ (#R308) 「起動から」 — THE EARLIEST MOMENT THE FILE NAME EXISTS AT ALL, and the first
         moment anything can be done about the four seconds the CDN takes to stage it. `fetchMeta`
         runs at boot for the time slider and the news timeline whether or not a weather layer is
         ever switched on (js/weather.js, js/news-timeline.js), so this is one request, of ONE BYTE,
         per session — see the note on `touch`. It is deliberately just the hour the app will open
         on: the window around it belongs to a reader who has actually asked for weather (`ready`). */
      try { touch(idx); } catch (_) {}
      emit('meta');
      return meta;
    });
    return metaP;
  }

  /* ── the real .om path ────────────────────────────────────────────────────────────────────────
     Open-Meteo lays the spatial archive out as
         <base>/<ref YYYY>/<MM>/<DD>/<HH>00Z/<valid YYYY-MM-DD>T<HH>00.om
     ONE file per valid time holding every variable, read over HTTP range requests. Building it here
     (instead of handing the SDK `latest.json`) is what makes the forecast hour real — see ① above. */
  function p2(n) { return ('0' + n).slice(-2); }
  function fileUrl(i) {
    if (!meta) return '';
    var vt = meta.validTimes[(i == null ? idx : i)];
    if (!vt) return '';
    var r = new Date(tms(meta.referenceTime)), t = new Date(tms(vt));
    if (isNaN(r.getTime()) || isNaN(t.getTime())) return '';
    return BASE + '/' + r.getUTCFullYear() + '/' + p2(r.getUTCMonth() + 1) + '/' + p2(r.getUTCDate()) + '/'
      + p2(r.getUTCHours()) + '00Z/'
      + t.getUTCFullYear() + '-' + p2(t.getUTCMonth() + 1) + '-' + p2(t.getUTCDate()) + 'T' + p2(t.getUTCHours()) + '00.om';
  }
  /* ══ ⚠⚠⚠ (#R307) 「起動から日時変更からすべてに至るまで、爆速にしろ。」— IT IS ONE 64 kB REQUEST ═══
     #R297 / #R298 / #R299 / #R305 all measured the BYTES (18 MB globe → 6 MB band) and all four were
     measuring the wrong two thirds. Timed request by request, with the body read, a cold hour at the
     opening view splits like this (production, forecast index 30, never visited):

         2 × metadata request (no Range)                       526 / 522 ms   (in parallel)
         **1 × 64 kB range at the END of the file            4,130 ms**       ← the file's own tree
         93 × 64 kB data ranges, 5.63 MB                     ~1,480 ms        (26–100 ms each)
         decode                                                     1 ms
         ───────────────────────────────────────────────────────────────
         total                                                6,135 ms

     `afterNetMs = 1` — none of it is decoding, and only a quarter of it is the data. **The wait is
     the FIRST byte-range request against an object the CDN has not staged**, which takes four to five
     seconds while every subsequent range on that same object takes twenty-six. Each forecast hour is
     its own ~114 MB `.om` file, so every single time step pays it once.

     → touch the file first: one `fetch` for the END of it, issued the moment the hour is known,
     outside the SDK's one-reader queue and in parallel with everything else. (#R307 asked for the
     last 64 kB, i.e. exactly the block the reader asks for first, so that it was a browser-cache hit
     when the reader got there. ⚠ IT IS ONE BYTE NOW — see #R308 below, which measured that the size
     of the request has nothing to do with the four seconds.)
     MEASURED, same page, same view, same axis, the next never-visited hour:

         untouched (index 30)   6,135 ms   ·   trailer request 4,130 ms
         touched   (index 33)   1,670 ms   ·   trailer request     11 ms      (6.75 MB, MORE data)

     ⚠ THE TOUCH IS NOT A SECOND FETCH PATH. It reads no data and decodes nothing; it exists only so
     that the request the SDK is about to make is one the CDN has already staged. The reader still
     reads the same file, the same ranges, the same 9 km samples — 「品質保ったまま」 is literal.
     ⚠ AND IT IS DELIBERATELY NOT QUEUED. `serial()` exists because the SDK has one reader and two
     reads of different files corrupt each other; this touches no reader at all. */
  /* ══ ⚠⚠⚠ (#R308) 「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」
     THE STAGE-IN NEEDS **ONE BYTE**, AND IT PARALLELISES ═══════════════════════════════════════════
     #R307 was right that the wait is one range request against an object the CDN has not staged, and
     it read that fact as 「so ask for exactly the 64 kB the SDK will ask for, and let the browser
     cache serve it」. Two things were never measured, and both of them are what 「起動から…」 was
     asking about. MEASURED on production, twelve forecast hours nobody had opened:

        ① WHAT COSTS THE FOUR SECONDS IS THE REQUEST, NOT ITS SIZE.
              bytes=0-0    (one byte, head)   562 ms   and the tail is STILL cold afterwards
              bytes=-1     (one byte, tail) 5,081 ms   and a 64 kB tail after it is 188 ms
              bytes=-65536 (64 kB,   tail) 4,867 ms
           A ONE-BYTE suffix range stages the object exactly as the 64 kB one does. Twelve of them:
              stage 12 files · 12 BYTES of body · 5,329 ms wall clock
              then a real 64 kB tail read on each: 27–50 ms   (against 4,483–5,195 ms unstaged)
           So the stage-in is 65,536× smaller and buys the same four seconds. The 27–50 ms is a CDN
           hit rather than #R307's 11 ms browser-cache hit — twenty milliseconds, for a quarter of a
           megabyte per hour.

        ② TWELVE COLD OBJECTS STAGE IN THE TIME OF ONE. The four seconds is latency, not bandwidth,
           and the requests do not queue behind each other: the same twelve took 5,329 ms together
           and ~55,000 ms one after another. #R307 staged four hours because four × 64 kB was as
           much as it could justify; at one byte each the number is chosen by what the reader can
           plausibly reach next, not by what the bytes cost.

     → the window below, all of it fired in the same turn so the CDN sees it as one burst, and
       ⚠ THE OPENING HOUR IS STAGED FROM `fetchMeta` — i.e. AT BOOT, for every session. That is the
       decision #R307 explicitly declined («256 kB on every session's boot for a layer nobody turned
       on»), and the only thing that made it wrong was the 256 kB. One byte to a host this app is
       already asking for `latest.json` at boot is not a cost worth four seconds of the first thing
       the reader sees, so the first hour is staged while the page is still loading.
     ⚠ STILL ONE PER FILE, EVER (`touched`), and still no reader — see above. */
  var TOUCH_RANGE = 'bytes=-1';
  /* how far along the axis, in steps, in the direction the reader is going and behind them. 8 + 3 +
     the hour itself is the twelve measured above; ⚠ NOT the whole 109-hour axis — a staged object is
     work the CDN does on our behalf, and staging hours nobody is heading towards would be asking a
     free service to do it for nothing. */
  var TOUCH_AHEAD = 8, TOUCH_BACK = 3, TOUCH_PLAY_AHEAD = 16;
  var touched = Object.create(null);
  var touchN = 0;
  function touch(i) {
    var f = fileUrl(i);
    if (!f || touched[f]) return false;
    touched[f] = 1; touchN++;
    try {
      fetch(f, { headers: { Range: TOUCH_RANGE } })
        .then(function (r) { return r.arrayBuffer(); })
        .catch(function () { delete touched[f]; });
    } catch (_) { delete touched[f]; return false; }
    return true;
  }
  /* ⚠ THE HOURS AROUND IT, IN THE ORDER THEY MATTER. #R305's warm-up already stages the next hour —
     correctly, in the direction the axis is moving — but it waits for the axis to be STILL for 2.5 s
     and then queues behind the reader. A reader who steps every second therefore never gets it, and
     a reader who turns round gets it in the wrong direction. This costs one byte and no reader, so
     it runs on every index change: the hour itself first, then alternating out so the near ones
     leave before the far ones, ahead further than behind because that is where the reader is going.
     ⚠ PLAYBACK ASKS FOR EVERY HOUR IN TURN at `playMs` (700 ms), so a window that only reaches eight
     hours ahead is overtaken in six seconds — while playing the run is staged twice as far. */
  /* ⚠ (#R310) TRIED AND REMOVED: warming the file's TRAILER (`bytes=-65536`) from `ready()`, so the
     SDK's own read of the same region would come from the browser's cache while the 340 kB bundle
     was still downloading. Two reasons it is not here. It never ran — the boot stage-in (#R308) has
     already claimed the file by then, so it would have needed a second ledger of its own. And the
     window it could win is the one request it replaces: MEASURED on the built page, the SDK's
     trailer read is **75–221 ms** of a **3,855 ms** cold switch-on. That is under the spread of the
     measurement, so shipping it would be claiming a speed-up this round cannot show. */
  var _touchDir = 1;
  function touchAround(i, ahead) {
    var n = Math.max(1, ahead || TOUCH_AHEAD), j;
    touch(i);
    for (j = 1; j <= n; j++) {
      touch(i + j * _touchDir);
      if (j <= TOUCH_BACK) touch(i - j * _touchDir);
    }
  }
  function omUrl(variable, extra, i) {
    var f = fileUrl(i);
    if (!f) return '';
    return 'om://' + f + '?variable=' + encodeURIComponent(variable) + (extra || '');
  }
  /* The SDK's own cache key: the file plus only those query parameters it considers data-relevant
     (`DATA_RELEVANT_PARAMS`, which is `['variable']` today). Read from the SDK when it is loaded so
     this cannot drift away from the protocol's own idea of identity. */
  function stateKey(variable, extra, i) {
    var f = fileUrl(i);
    if (!f) return '';
    var rel = null;
    try { if (sdk && sdk.DATA_RELEVANT_PARAMS) rel = new Set(Array.from(sdk.DATA_RELEVANT_PARAMS)); } catch (_) {}
    if (!rel) rel = new Set(['variable']);
    var all = new URLSearchParams('variable=' + encodeURIComponent(variable) + (extra || ''));
    var keep = new URLSearchParams();
    all.forEach(function (v, k) { if (rel.has(k)) keep.set(k, v); });
    var q = keep.toString();
    return q ? (f + '?' + q) : f;
  }

  /* ── the SDK ──────────────────────────────────────────────────────────────────────────────────
     Two CDNs for one PINNED version. Not a "fallback" that is really the main path (#R272): the
     first URL is the main path, and the second exists so one CDN being unreachable does not take
     the weather layers down with it. */
  function loadSDK() {
    if (sdk) return Promise.resolve(sdk);
    if (sdkP) return sdkP;
    if (window.OMWeatherMapLayer) { sdk = window.OMWeatherMapLayer; return Promise.resolve(sdk); }
    var i = 0;
    sdkP = new Promise(function (res, rej) {
      var tryOne = function () {
        if (i >= SDK_URLS.length) { rej(new Error('ECMWF SDK unreachable')); return; }
        var s = document.createElement('script');
        s.src = SDK_URLS[i++]; s.async = true;
        s.onload = function () { sdk = window.OMWeatherMapLayer; sdk ? res(sdk) : tryOne(); };
        s.onerror = function () { try { s.remove(); } catch (_) {} tryOne(); };
        document.head.appendChild(s);
      };
      tryOne();
    });
    return sdkP;
  }
  /* ── the wind palette ─────────────────────────────────────────────────────────────────────────
     「Wind(animated)はこんな感じで。色味も同一に合わせて。」 — the reader sent a Windy screenshot.

     The SDK's own `wind` scale is not that picture and cannot be made into it by a slider, because the
     difference is not brightness: its alpha runs 0 → 1 across the first 7 m/s, so calm air is a hole
     through which the basemap shows, and its colours start at steel blue rather than at Windy's
     violet. MEASURED from the shipped table:
         [70,130,180,α0] [64,137,179,α0.1] … [0,128,0,α0.73] … [240,0,28,α1] [116,5,5,α1]
     Against the reference: violet where the air is still, blue → teal → green through the trades,
     yellow → orange in a gale and magenta → white in a typhoon core, all of it OPAQUE.

     So the protocol is registered with our own colour table for the wind family. It is a table, not a
     post-hoc tint: the tiles are rendered from it in the SDK's worker, and `legend()` reads the SAME
     object, so the ramp under the map and the ramp in the legend are one declaration. `wind_gusts_10m`
     resolves to the same family, which is right — it is the same quantity in the same unit. */
  /* ══ ⚠⚠⚠ (#R293) 「Windyと完全に同じ風速と色の対応にしてください。RGB単位で、Windyの実物もとに
     比較し修正して。高風速帯でも同じになるように。」 — AND IT WAS NEVER WINDY'S TABLE ════════

     The seventeen anchors this replaces were written from a screenshot: they borrowed Windy's
     BREAKPOINT POSITIONS (0,1,3,5,7,9,11,13,15,17…) and invented the colours, so the two pictures
     agreed at 0 m/s and diverged from about 2 m/s on. MEASURED against windy.com's own paint
     function, worst channel difference:

         v (m/s)    IntMap (before)   Windy (real)     Δmax
            5        36,160,168        77,141,123        45
           15       214,202, 60       161,108, 92        94
           25       228, 68, 57        95,100,156       133
           60       240,220,245       214,209,127       118

     i.e. at 25 m/s this map painted RED where Windy paints slate blue, and above 45 m/s it
     saturated to near-white while Windy goes khaki then grey. 「高風速帯でも同じに」 is the half
     that was furthest off.

     ⚠ THE GROUND TRUTH IS THE FUNCTION THE MAP IS PAINTED THROUGH, NOT THE DECLARED TABLE — the
     same finding #R288 made for temperature, and it repeats exactly: `W.colors.wind
     .defaultColorGradient` is twenty stops, but `RGBA(v)` (a 2048-step precomputed table over
     0–104 m/s) does NOT equal their linear interpolation — measured, 20/255 apart at 32.25 m/s.
     So `RGBA` was sampled every 0.1 m/s from 0 to 104 (1,041 points, alpha 255 throughout — there
     is no calm-air hole in it) and the smallest set of stops whose LINEAR interpolation reproduces
     that sampling was fitted: **27 stops, worst channel error 3/255**, which is the standard #R288
     held the temperature ramp to. Above 104 m/s Windy clamps to grey and so does this table.
     The stops at 10.0/10.5, 19.7, 25.3 and 30.6/31.9/33.2 are not noise — they are where Windy's
     own interpolation stops being linear in RGB.
     `rampFrom(…, 0.1)` then resamples to 1,041 entries so the map is a gradient rather than a
     staircase, which is #R284's requirement and is unaffected by whose colours these are. */
  var WIND_ANCHORS = {
    unit: 'm/s',
    breakpoints: [0, 1.1, 3, 5, 7, 9, 10, 10.5, 11, 13, 15, 17, 19, 19.7, 21, 24, 25.3, 27, 29,
      30.6, 31.9, 33.2, 35.9, 46, 51, 76.6, 104],
    colors: [
      [98, 113, 184, 1], [58, 99, 160, 1], [74, 148, 170, 1], [77, 142, 124, 1],
      [83, 165, 84, 1], [53, 160, 53, 1], [103, 164, 54, 1], [136, 161, 62, 1],
      [166, 158, 80, 1], [160, 127, 58, 1], [162, 109, 92, 1], [130, 59, 79, 1],
      [176, 80, 137, 1], [160, 76, 142, 1], [118, 74, 148, 1], [109, 97, 164, 1],
      [91, 101, 158, 1], [69, 105, 142, 1], [92, 144, 153, 1], [92, 129, 167, 1],
      [102, 111, 177, 1], [113, 95, 178, 1], [125, 69, 166, 1], [232, 216, 216, 1],
      [220, 213, 136, 1], [206, 203, 113, 1], [129, 129, 129, 1]
    ]
  };
  /* ══ ⚠⚠⚠ (#R284) A BREAKPOINT TABLE IS A STAIRCASE, AND THAT IS WHAT WAS ON THE MAP ══════════
     「Wind(animated)は色味は段彩ではなくグラデーションに。（色はそのまま。精度も一切落とすな。」

     The SDK has exactly two colour-scale types and NEITHER of them interpolates — read out of the
     shipped bundle: `rgba` picks `colors[floor((v-min)/step)]` and `breakpoint` picks
     `colors[binarySearch(breakpoints, v)]`. Both are nearest-bucket lookups, so the seventeen
     anchors above painted the whole planet in SEVENTEEN FLAT BANDS. And the legend beside it was
     built as a CSS `linear-gradient` over the same seventeen stops — which CSS interpolates — so
     the key was already a smooth ramp while the map was a staircase: #R270's 「凡例が自分の色と
     矛盾していた」, one round later and the other way round.

     So the SAME seventeen colours are RESAMPLED onto a step fine enough that no edge survives. The
     anchor values are unchanged and land on their own colours exactly (a bucket's colour is the one
     at its lower breakpoint), so 「色はそのまま」 is literal rather than approximate; between
     them the colour is linear in sRGB. Nothing about the DATA changes — same file, same 9 km
     samples, same speeds; what is finer is the colour resolution, which goes from 17 steps to 601.
     MEASURED on the steepest segment (0→1 m/s, ΔR = 37): 3.7 units of red per step at 0.1 m/s,
     i.e. below the threshold at which a band edge can be seen at all. */
  function rampFrom(a, step) {
    var bp = a.breakpoints, cols = a.colors;
    var lo = bp[0], hi = bp[bp.length - 1];
    var out = { type: 'breakpoint', unit: a.unit, breakpoints: [], colors: [] };
    var n = Math.round((hi - lo) / step), seg = 0;
    for (var k = 0; k <= n; k++) {
      var v = lo + k * step;
      while (seg < bp.length - 2 && v >= bp[seg + 1]) seg++;
      var span = (bp[seg + 1] - bp[seg]) || 1;
      var f = (v - bp[seg]) / span; if (f < 0) f = 0; if (f > 1) f = 1;
      var c0 = cols[seg], c1 = cols[Math.min(seg + 1, cols.length - 1)];
      out.breakpoints.push(Math.round(v * 1000) / 1000);
      out.colors.push([
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f), 1]);
    }
    return out;
  }
  var WINDY_WIND = rampFrom(WIND_ANCHORS, 0.1);

  /* ══ ⚠⚠⚠ (#R288) THE TEMPERATURE RAMP IS THE REFERENCE PICTURE'S, MEASURED RATHER THAN GUESSED ══
     「気温 2m（ECMWF）レイヤーも色を添付画像と同じ色＋グラデーションに。」

     What was on the map, MEASURED: the SDK's own `temperature` scale, **46 breakpoints** — i.e. the
     same staircase the wind had before #R284, in a palette that is not the one in the picture.

     The picture is windy.com's default temperature overlay, and that overlay's colour table is a
     value the reader can open in Windy's own 「Customize color scale」 panel. It was read from the
     live page rather than eyeballed from the screenshot: `W.colors.temp.defaultColorGradient` is
     thirteen stops in KELVIN, and `_precomputedGradient.RGBA(k)` is the colour the map is actually
     painted with at any k. Sampling that function every 0.05 K from 203 K to 320 K and fitting the
     smallest set of stops whose LINEAR interpolation reproduces it gives the table below:
     **23 stops, worst channel error 3/255** — below the threshold at which a difference can be
     seen, which is the same standard #R284 held the wind ramp to.

     Stated in °C because that is the unit the feed publishes `temperature_2m` in (MEASURED: Tokyo
     25.5, Riyadh 35.7, Vostok −51.1 — not Kelvin). The four stops crowded between 0.00 and 0.85 °C
     are not noise: Windy emphasises the freezing isotherm by turning blue into green across less
     than one degree, and that edge is visible in the reference picture wherever a plateau rises
     through 0 °C. Dropping ONE of them (0.40) was tried and takes the worst error from 3 to 7.

     ⚠ The key is `temperature`, the SDK's FAMILY name — so `temperature_2m`, `surface_temperature`
     and the soil temperatures all move together, which is right: they are the same quantity in the
     same unit and a legend that coloured them differently would be lying about one of them.
     `dew_point` is its own family and is left alone. */
  var TEMP_ANCHORS = {
    unit: '°C',
    breakpoints: [-70.15, -55.15, -40.15, -25.15, -22.95, -20.90, -18.00, -15.15, -8.15, -4.15,
      0.00, 0.35, 0.40, 0.75, 0.85, 2.40, 4.50, 5.95, 9.85, 20.85, 24.50, 29.85, 46.85],
    colors: [
      [115, 70, 105, 1], [203, 173, 196, 1], [163, 70, 146, 1], [144, 89, 170, 1],
      [151, 114, 194, 1], [148, 141, 214, 1], [142, 185, 218, 1], [157, 220, 218, 1],
      [106, 192, 182, 1], [100, 167, 190, 1], [93, 134, 199, 1], [77, 132, 160, 1],
      [77, 132, 160, 1], [68, 128, 107, 1], [68, 126, 101, 1], [70, 135, 81, 1],
      [86, 141, 54, 1], [99, 143, 42, 1], [129, 148, 24, 1], [244, 184, 4, 1],
      [243, 143, 7, 1], [233, 83, 25, 1], [71, 14, 0, 1]
    ]
  };
  /* 0.05 °C rather than the wind's 0.1: the steepest segment here is 0.35 → 0.75 °C, where the
     colour travels 92 units of blue in 0.4 degrees. At 0.1 °C that edge would be four visible
     steps; at 0.05 it is eight, each below 24/255 — and the ramp is 2,341 buckets, which costs
     nothing on the map (`legend()` thins the stops it DRAWS, see below). */
  var WINDY_TEMP = rampFrom(TEMP_ANCHORS, 0.05);

  /* ══ ⚠⚠⚠ (#R307) THE READ EVICTS ITS OWN BLOCKS WHILE IT IS STILL USING THEM ═══════════════════
     MEASURED by patching `fetch` and reading the Range headers of one cold band read (`nearBand`,
     u+v) at the opening view:

         195 requests · EVERY ONE OF THEM EXACTLY 64 kB · 12.19 MB transferred
         …covering only TWO contiguous spans:  83.05–91.55 MB (8.50 MB, the data)
                                               113.80–113.93 MB (0.13 MB, the file's tree)
         **57 of the 195 were the SAME RANGE FETCHED TWICE**

     The duplicates come from one object nobody had looked at: the SDK's block cache, which
     `FileReader` constructs as `new BlockCache(64 * 1024, 128)` — 64 kB blocks and **128 of them,
     i.e. an 8 MB ceiling** — against an 8.63 MB working set. The read therefore throws away blocks it
     has not finished with and downloads 3.5 MB of them again.

     → the same 64 kB block, with room for **512 of them (32 MB)**. The block size is deliberately NOT
     raised: `blockSize()` IS the HTTP request size, so a bigger block over-fetches at both ends of
     every span, and that was measured too — 512 kB blocks turned 6.31 MB into **9.00 MB** for an 11 %
     time saving, which is a worse trade than it looks. What is wrong here is the CEILING, not the
     granularity, and the ceiling costs nothing to raise (an LRU only fills to what is used; a
     whole-globe read is ~16 MB, which now fits).
     ⚠ THE RASTER TILES SHARE THIS READER: `omProtocol` builds a state from the tile's own bounds and
     reads it through the same `ensureData`, so a bigger block would have made every tile over-fetch
     as well. Keeping 64 kB keeps that path exactly as it was.
     ⚠ The interface is the one the SDK's cached reader calls — `keyKind`, `blockSize`, `size`, `get`,
     `prefetch`, `clear` — because the SDK does not export its own class. Same LRU, different bound. */
  function blockCache(blockBytes, maxBlocks) {
    var map = new Map(), inflight = new Map();
    return {
      keyKind: 'bigint',
      blockSize: function () { return blockBytes; },
      size: function () { return Promise.resolve(undefined); },
      get: function (k, make) {
        var hit = map.get(k);
        if (hit) { map.delete(k); map.set(k, hit); return Promise.resolve(hit); }
        var p = inflight.get(k);
        if (!p) {
          p = Promise.resolve().then(make);
          inflight.set(k, p);
          p.then(function (v) {
            if (map.size >= maxBlocks) { var old = map.keys().next().value; if (old !== undefined) map.delete(old); }
            map.set(k, v);
          }, function () {}).then(function () { inflight.delete(k); });
        }
        return p;
      },
      prefetch: function (k, make) {
        if (map.has(k) || inflight.has(k)) return Promise.resolve();
        return this.get(k, make).catch(function () {});
      },
      clear: function () { map.clear(); inflight.clear(); }
    };
  }
  var BLOCK_BYTES = 64 * 1024, BLOCK_MAX = 512;
  /* ══ ⚠⚠⚠ (#R310) 64 kB WAS NOT A SIZE, IT WAS A RATE — AND IT COST 3.4× ═══════════════════════
     「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」 (5回目)

     #R307 asked whether the BLOCK should be bigger and answered no, for a reason that was true:
     `blockSize()` is the HTTP request size, so a 512 kB block over-fetches at both ends of every
     span (MEASURED there: 6.31 MB became 9.00 MB) and the raster tiles share the reader. What that
     round did not measure is what a 64 kB REQUEST costs, as distinct from what it fetches. Measured
     here, in the browser, same origin, same file, same eight megabytes, same moment — only the size
     of each request changes:

         64 kB × 128, all at once     2,448 / 2,341 ms    3.3 / 3.4 MB/s
         64 kB × 128, 24 at a time    3,713 ms            2.2 MB/s
         256 kB × 32                  1,255 ms            6.4 MB/s
         512 kB × 16                    723 /   683 ms   11.1 / 11.7 MB/s
         8 MB × 1                       455 /   708 ms   17.6 / 11.3 MB/s

     The bytes are identical in every row. **A ranged request has a fixed cost at the edge, and at
     64 kB the app was paying it 139 times for one hour of wind** — which is the whole of the 8.69 MB
     that took 4.0 s while the same bytes in one request take 0.5 s. That is the wait these five
     rounds have been circling: not the bytes, not the queue, not the decode, but the RATE.

     ⚠ AND THE ANSWER IS STILL NOT A BIGGER BLOCK. #R307's objection stands word for word — a bigger
     block over-fetches, and it drags the tiles with it. The two things it conflated are what the
     CACHE stores and what the NETWORK asks for, and they do not have to be the same number:

     → the block stays 64 kB, and the REQUESTS ARE MERGED. The SDK's cached reader asks its HTTP
     backend for one block at a time, in a synchronous loop, so every block of a span is requested
     inside one microtask. This wrapper collects them, joins the ones that are ADJACENT IN THE FILE,
     issues one request per run and hands each caller its own slice. Nothing is over-fetched: a run
     is exactly the blocks that were asked for. #R307 measured that the 195 requests of one band read
     cover **two contiguous spans**, so the merge is not a hopeful optimisation — the runs are there.

     ⚠ ONLY JOBS THAT SHARE A SIGNAL ARE MERGED, or aborting one read would abort another's bytes.
     ⚠ A RUN IS CAPPED (`RUN_MAX`), because the table above stops improving above about 512 kB and an
     unbounded run would hold the whole read in one all-or-nothing request.
     ⚠ EACH BLOCK IS COPIED OUT of the run's buffer rather than kept as a view of it: a 64 kB block
     living in a 32 MB LRU must not pin four megabytes of the request it arrived in. */
  var RUN_MAX = 4 * 1024 * 1024;
  function coalesceBackend(be) {
    if (!be || be._imCoalesced || typeof be.getBytes !== 'function') return be;
    var orig = be.getBytes.bind(be);
    var pending = [], scheduled = false;
    function flush() {
      scheduled = false;
      var jobs = pending; pending = [];
      /* group by signal first — a merged request can only carry one */
      var lanes = [];
      jobs.forEach(function (j) {
        for (var i = 0; i < lanes.length; i++) if (lanes[i].sig === j.sig) { lanes[i].jobs.push(j); return; }
        lanes.push({ sig: j.sig, jobs: [j] });
      });
      lanes.forEach(function (ln) {
        var js = ln.jobs.sort(function (x, y) { return x.a - y.a; });
        var runs = [];
        for (var i = 0; i < js.length; i++) {
          var last = runs.length ? runs[runs.length - 1] : null;
          if (last && js[i].a <= last.b + 1 && (js[i].b - last.a + 1) <= RUN_MAX) {
            if (js[i].b > last.b) last.b = js[i].b;
            last.jobs.push(js[i]);
          } else runs.push({ a: js[i].a, b: js[i].b, jobs: [js[i]] });
        }
        runs.forEach(function (r) {
          if (r.jobs.length === 1) { var j = r.jobs[0]; orig(j.a, j.b - j.a + 1, j.sig).then(j.res, j.rej); return; }
          orig(r.a, r.b - r.a + 1, r.sig).then(function (buf) {
            r.jobs.forEach(function (j) { try { j.res(buf.slice(j.a - r.a, j.b - r.a + 1)); } catch (e) { j.rej(e); } });
          }, function (e) { r.jobs.forEach(function (j) { j.rej(e); }); });
        });
      });
    }
    be.getBytes = function (a, n, sig) {
      if (!(n > 0)) return orig(a, n, sig);
      return new Promise(function (res, rej) {
        pending.push({ a: a, b: a + n - 1, res: res, rej: rej, sig: sig });
        if (!scheduled) { scheduled = true; Promise.resolve().then(flush); }
      });
    };
    be._imCoalesced = 1;
    return be;
  }
  /* the SDK builds the chain `FileReader.reader → cachedReader.backend → httpBackend` on every
     `setToOmFile`, and every one of those property names survives minification (they are assigned in
     constructors, not exported). This is the only place that reaches into it. */
  function coalesceReader(rd) {
    try { coalesceBackend(rd && rd.reader && rd.reader.backend && rd.reader.backend.backend); } catch (_) {}
    return rd;
  }
  /* ══ ⚠⚠⚠ (#R310) EVERY READ RE-OPENED THE FILE, AND THE RE-OPEN IS A ROUND TRIP ═══════════════
     「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」 (5回目)

     READ OUT OF THE SHIPPED BUNDLE, then MEASURED. `ensureData` opens the file EVERY time it is
     called — `await A.setToOmFile(state.omFileUrl)` is its first line, unconditionally — and
     `setToOmFile` is not cheap:

         setToOmFile(url) → this.dispose()                 // throw the variable tree away
                          → new HttpBackend({url})
                          → backend.fetchMetadata()        // *** a HEAD request ***
                          → OmFileReader.create(…)         // read the trailer, walk the tree

     So a band read paid TWO of them (this module warms the ranges first, then reads), the raster
     tiles paid one per state, and none of them could be reused because the reader is a singleton
     that every caller re-points. MEASURED on the built page, one step of the time axis:

         HEAD  at 223 ms · 389 ms      ← the field's warm-up
         HEAD  at 227 ms · 576 ms      ← the colour tiles, same file, same second
         HEAD  at 1878 ms · 236 ms     ← the widening rung
         …and a step onto an hour whose bytes were ALREADY in the block cache still cost
         2,118 ms, of which ONE HEAD was 1,870 ms and there was no other network at all.

     → ONE READER PER FILE, and the file is opened ONCE. `WeatherMapLayerFileReader` is exported by
     the SDK (`h.WeatherMapLayerFileReader`) and `ensureData(state, reader, …)` takes the reader as
     an ARGUMENT, so nothing here is a patch of the bundle: this module simply stops handing it the
     singleton. `pinReader` makes `setToOmFile` idempotent, which is what turns the second and third
     open of a file into a no-op.

     ⚠ THE BLOCK CACHE IS SHARED AND THAT IS SAFE, because its keys are not block numbers:
     `withBigIntKeys(backend, cache, backend.cacheKeyBigInt)` and `cacheKeyBigInt` is
     `hash(url) ^ hash(eTag) ^ hash(lastModified)`. Two readers on two files cannot collide, and two
     readers on the SAME file share every block they fetch.
     ⚠ AND IT IS WHY `serial()` CAN STOP BEING A LAW. The single reader is the whole reason two
     reads of different files corrupted each other (#R288); with one reader each they do not touch.
     What remains in `serial` is a POLICY about bandwidth, not a rule about correctness. */
  var READER_MAX = 4;
  var readers = [];              /* most-recent-first: [{url, rd}] — one open .om file each */
  function pinReader(rd) {
    if (!rd || rd._imPinned) return rd;
    var orig = null;
    try { orig = rd.setToOmFile.bind(rd); } catch (_) { return rd; }
    var at = '', open = null;
    rd.setToOmFile = function (u) {
      if (u === at && open) return open;              /* already open on this file — nothing to do */
      at = u;
      /* ⚠ the HTTP backend is a NEW object on every open, so the merge is re-applied here and
         nowhere else — see `coalesceBackend`. */
      open = orig(u).then(function (v) { coalesceReader(rd); return v; },
        function (e) { if (at === u) { at = ''; open = null; } throw e; });
      return open;
    };
    rd._imPinned = 1;
    return rd;
  }
  function readerFor(url) {
    if (!url || !sdk || !sdk.WeatherMapLayerFileReader) return null;
    for (var i = 0; i < readers.length; i++) {
      if (readers[i].url === url) { var hit = readers.splice(i, 1)[0]; readers.unshift(hit); return hit; }
    }
    var st = omSettings(); if (!st) return null;
    var rd = null;
    try { rd = pinReader(new sdk.WeatherMapLayerFileReader(st.fileReaderConfig)); } catch (_) { return null; }
    var h = { url: url, rd: rd };
    readers.unshift(h);
    /* ⚠ AN OPEN READER HOLDS A WASM VARIABLE TREE, so the pool is small and the tail is disposed.
       The BLOCKS it fetched are not lost with it — they live in the shared cache above. */
    while (readers.length > READER_MAX) { var old = readers.pop(); try { old.rd.dispose(); } catch (_) {} }
    return h;
  }
  /* Open a forecast file AHEAD OF THE READ that needs it. The HEAD and the trailer are a round trip
     each and they do not depend on anything the reader is about to ask for, so they belong beside
     `touch` (#R307/#R308) rather than in front of the bytes. Returns the reader, already opening. */
  function openReader(url) {
    var h = readerFor(url); if (!h) return null;
    try { h.open = h.rd.setToOmFile(url); h.open.catch(function () {}); } catch (_) { return null; }
    return h;
  }
  var settings = null;
  function omSettings() {
    if (settings || !sdk) return settings;
    var base = sdk.defaultOmProtocolSettings;
    var scales = Object.assign({}, sdk.COLOR_SCALES_WITH_ALIASES || base.colorScales,
      { wind: WINDY_WIND, temperature: WINDY_TEMP });
    /* ⚠ THE FIRST CALLER WINS — `getProtocolInstance` says so itself, and every call in this app
       passes this one memoised object, so the reader is built with this cache and no other. */
    settings = Object.assign({}, base, { colorScales: scales,
      fileReaderConfig: Object.assign({}, base.fileReaderConfig, { cache: blockCache(BLOCK_BYTES, BLOCK_MAX) }) });
    return settings;
  }
  /* ══ ⚠⚠⚠ (#R288) THE FLAG ONLY GOES UP IF THE REGISTRATION ACTUALLY HAPPENED ═══════════════════
     This latched `protoReg = true` OUTSIDE the try, so a registration that threw — or one attempted
     before the renderer existed — was recorded as done. Everything downstream then handed MapLibre
     an `om://…` url with no handler behind it, and MapLibre did the only thing it can with an
     unknown scheme: a NATIVE FETCH. CAUGHT by this round's own probe as a CSP violation —
         Connecting to 'om://https//map-tiles.open-meteo.com/…' violates connect-src
     — which is the #R286 shape exactly: a scheme this app registers itself can only reach the
     network if the registration is missing, so the violation IS the diagnosis. `addProtocol`
     already returns a boolean; this reads it. */
  function registerProtocol() {
    if (protoReg) return true;
    if (!sdk || !sdk.omProtocol) return false;
    var st = omSettings();
    var ok = false;
    /* ⚠ (#R310) THE TILES RE-OPEN THE FILE TOO. `ensureData` opens unconditionally (see `pinReader`),
       so every tile state paid a HEAD and a tree walk for a file the reader already had open — and
       two tile states of the same file could `dispose()` the reader out from under each other,
       which is the collision the note on `serial` describes, on the one path `serial` never covered
       (the tiles are called by MapLibre, not by this module). Pinning makes the second open a no-op
       and therefore removes both. `getProtocolInstance` is the SDK's own singleton, so this pins the
       reader the tiles actually use, once. */
    try {
      ok = !!window.IntMapGeoEngine.scene.addProtocol('om', function (params, ctl) {
        try { pinReader(sdk.getProtocolInstance(st).omFileReader); } catch (_) {}
        return sdk.omProtocol(params, ctl, st);
      });
    } catch (_) { ok = false; }
    protoReg = ok;
    return ok;
  }
  /* everything a layer needs, in one await */
  /* ══ ⚠⚠⚠ (#R302) TWO ROUND TRIPS THAT NEED NOTHING FROM EACH OTHER WERE IN SERIES ════════════
     「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで爆速にしろ。」
     `loadSDK()` fetches a 340 kB third-party bundle from a CDN; `fetchMeta()` fetches a 3 kB JSON
     from the data host. THE COMMENT ON `fetchMeta` ITSELF SAYS 「The metadata below needs no SDK at
     all」 — and this still waited for the bundle before it asked for the JSON. So every layer that
     was switched on paid script-latency PLUS metadata-latency end to end, when the two can overlap
     and cost only the slower of them. Nothing about either request changes; what changes is that
     they leave at the same time.
     ⚠ `registerProtocol()` still runs THE MOMENT THE SDK LANDS rather than after the metadata —
     it is the SDK it needs, and `addField` calls it directly on its own path (#R288). */
  /* ⚠⚠ (#R302) …AND `fetchMeta(force)` HAD NO CALLER THAT PASSED `force`. `metaP` memoises the
     first fetch for the life of the page, so the branch below it — 「A new model run re-bases the
     whole axis」, which exists precisely to move the reader onto the new run at the same wall-clock
     instant — was UNREACHABLE. A tab left open across a model run kept offering the run it booted
     on, and its 「now」 drifted away from the axis by an hour at a time.
     → the run is re-asked once the metadata is older than META_MAX_AGE. It is asked IN THE
     BACKGROUND when an axis is already in hand: a freshness check that makes the reader wait for a
     round trip is the opposite of what this round is for, and the re-based axis arrives the way
     every other axis change arrives — as the `meta` event the branch already emits. */
  var META_MAX_AGE = 900000;              /* 15 min */
  var metaRefreshedAt = 0;
  function metaDue() {
    if (!meta || !meta.fetchedAt) return false;               /* nothing in hand: the cold path asks anyway */
    var t = Date.now();
    if (t - meta.fetchedAt <= META_MAX_AGE) return false;
    /* ⚠ ONCE PER WINDOW, NOT ONCE PER READ. `meta.fetchedAt` only moves on a SUCCESSFUL fetch, so
       without this stamp a host that is down would be re-asked by every `load()` — and each answer
       re-emits `meta`, which js/weather.js reads as 「the axis moved」 and reloads the field for. */
    if (t - metaRefreshedAt <= META_MAX_AGE) return false;
    metaRefreshedAt = t;
    return true;
  }
  function ready() {
    var s = loadSDK().then(function (t) { registerProtocol(); return t; });
    var m = fetchMeta(metaDue());
    if (meta) { m.catch(function () {}); m = Promise.resolve(meta); }   /* an axis in hand does not wait */
    /* ⚠⚠ (#R307) THE EARLIEST MOMENT A **CONSUMER** KNOWS THE FILE NAME. The stage-in cannot start
       before the axis has landed, and it must not start for a reader who has only asked for the axis:
       `fetchMeta` runs at boot for the time slider and the news timeline whether or not a weather
       layer is ever switched on (js/weather.js, js/news-timeline.js both say so), so warming from
       THERE would put 256 kB on every session's boot for a layer nobody turned on. `ready()` is
       reached only from `load()` and `addField`, i.e. from something that is about to read — and it
       runs in parallel with the 340 kB SDK download, which is the overlap 「起動から」 can have. */
    m.then(function () { touchAround(idx); }, function () {});
    return Promise.all([s, m]).then(function (r) { return r[0]; });
  }

  /* ══ ⚠⚠⚠ (#R314) EVERYTHING IN FRONT OF THE FIRST BYTE OF DATA, BEFORE THE CLICK ═══════════════
     「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」(6回目)
     MEASURED on the built page, a cold switch-on of the wind, timed from the click:

         0 ms        the click
         121 / 640   the 340 kB SDK <script> resolves
         842         the open of the file begins (HEAD)
         976         …the HEAD is answered
         1,010       the wasm is instantiated for the first time
         1,354       …and compiled (344 / 460 / 556 ms across three runs)
         1,355       THE FIRST RANGE OF FORECAST DATA IS ASKED FOR
         3,664       the field is in hand

     **1.36 s of a 3.65 s switch-on is spent before a single byte of the forecast is requested**,
     and not one of those steps depends on the click: the script, the wasm and the open of the file
     the axis is ALREADY SITTING ON are the same work whenever they happen. `ready()` starts them
     at the click because that is the first moment it is certain they are wanted.

     `warm()` is that same work, started at the first moment they are LIKELY — the pointer arriving
     on a weather row (js/weather.js). That is evidence rather than a guess, and it is the only
     signal this module has ever had that predicts a switch-on. It stays a complete no-op for a
     reader who never goes near those rows, which is the rule #R307 wrote for the stage-in
     (「staging files for a layer nobody switched on is bytes nobody asked for」) and this keeps.

     ⚠ IT ADDS NO SECOND OF ANYTHING. `loadSDK` and `fetchMeta` memoise, `registerProtocol` latches
     on its own return value (#R288), and `openReader` is idempotent per file (`pinReader`), so the
     click's `ready()` finds all of it done and asks for data immediately.
     ⚠ IT IS ONE HEAD AND ONE TRAILER (64 kB) — not the band. The bytes of the picture are still
     only fetched by a reader who actually switched the layer on. */
  var warmed1 = false;
  function warm() {
    if (warmed1) return false;
    warmed1 = true;
    try {
      var m = fetchMeta(false);                       /* memoised — the axis is normally here from boot */
      loadSDK().then(function () {
        registerProtocol();
        return m.catch(function () { return null; });
      }).then(function () {
        try { openReader(fileUrl(idx)); } catch (_) {}
      }).catch(function () { warmed1 = false; });
    } catch (_) { warmed1 = false; return false; }
    return true;
  }

  /* ── the decoded field ────────────────────────────────────────────────────────────────────────
     `values` is the variable itself, EXCEPT for a wind component: the reader's derivation rule
     reads u AND v and returns `values` = speed (m/s) with `directions` = the meteorological FROM
     bearing in degrees. That is the pair the particles need and it is why the animated wind and the
     colour raster cannot disagree — they are literally the same Float32Array.

     ⚠ ONE FRAME IS HELD AT A TIME. The global O1280 field is 6,599,680 samples (MEASURED), i.e.
     26 MB per array, and the SDK's own state map is a 2-entry LRU that another layer can evict at
     any moment. Holding our own reference to the current frame is what keeps the particles alive
     across that eviction; holding more than one would be 100 MB+ for a picture nobody is looking
     at, so the previous frame is released the moment a new one lands. */
  /* ══ ⚠⚠⚠ (#R290) ONE SLOT WAS ONE VARIABLE, AND THE READOUT WANTED A SECOND ═══════════════
     「気温レイヤーに…ホバー地点の数値を座標標高常時表示欄に表示しろ。」 — `sampler()` answers only
     for the frame in `held`, and the ONLY thing that ever filled `held` was the wind, because the
     raster layers are drawn by the SDK straight from `om://` tiles and never call `load()`. So
     `IntMapECMWF.valueNow('temperature_2m', …)` was null for every reader, always, and
     js/map-readout.js printed nothing — measured by reading, and the same is true of precipitation,
     gusts, cloud, dew point, pressure and CAPE.
     One slot is also why a second variable could not simply be loaded: it would EVICT the wind's
     frame and stop the particles.
     → a small most-recent-first list. The cap is on SAMPLES rather than on entries, because the
     two sizes differ by seven times: a latitude band is ~935 k samples (#R288) and the whole globe
     is 6.6 M. `FRAME_SAMPLES` is ~16 M, i.e. two globes or seventeen bands — enough for the wind
     and whatever raster the cursor is over, and nothing like the 100 MB the single slot existed
     to avoid. */
  var frames = [];          /* most-recent first: [{key, variable, file, data, grid, band}, …] */
  var held = null;          /* frames[0] — the most recent, kept as a name the module already uses */
  /* ⚠⚠⚠ (#R290 追記) THE WIND'S GLOBE IS TWO ARRAYS, AND IT NEARLY FILLED THE BUDGET ON ITS OWN.
     MEASURED on the deployed build, world zoom, wind + temperature both on: the wind's frame is
     **13,199,360 samples** (u AND v, 6.6 M each — `bandFor` returns null when the view spans more
     than 120° of latitude, so at world zoom it reads the planet). Against a 16 M budget, a second
     globe-sized frame of ANY variable pushed the total to 19.8 M and `keepFrame` dropped the older
     entry — so the wind and the readout EVICTED EACH OTHER, and on the wind's next time step
     `sampler()` came back null and the particles stopped. That is #R276 追記's defect wearing a
     different hat: one layer's request taking another layer's field away.
     → the budget has room for the wind's pair PLUS one ordinary globe (24 M ≈ 96 MB of Float32),
     and — the half that actually matters — the READOUT never asks for a globe at all. See
     `bandNear`: a point value needs the latitudes on screen, not the planet. */
  var FRAME_SAMPLES = 24e6;
  function frameSize(f) { try { return (f.data.values ? f.data.values.length : 0) + (f.data.directions ? f.data.directions.length : 0); } catch (_) { return 0; } }
  function frameFor(key) { for (var i = 0; i < frames.length; i++) if (frames[i].key === key) return frames[i]; return null; }
  function frameCovering(key, band) {
    for (var i = 0; i < frames.length; i++) if (frames[i].key === key && bandCovers(frames[i].band, band)) return frames[i];
    return null;
  }
  /* ══ ⚠⚠⚠ (#R299) THE LIST HAD AN LRU IN IT AND WAS BEING EMPTIED BY HAND EVERY TIME ═══════════
     「風レイヤーが重すぎる。品質保ったまま、起動から日時変更からすべてに至るまで爆速にしろ。」
     This dropped every frame of the SAME VARIABLE whatever hour it was of, so the list #R290 built
     to hold several frames never held more than one per variable — and 「one hour forward, then
     back again」 re-decoded the hour it had just had in hand, every single time. READ FROM THE
     CODE: a step forward and a step back is TWO reads before this line changed and ONE after it,
     and every later return to an hour already visited is free.
     → only what has actually been REPLACED goes: the same `key` (same variable AND same valid
     time) whose band the new frame COVERS. Everything else is the LRU's business, and the LRU is
     the loop below — untouched, on the budget #R290 measured. Nothing about any picture changes;
     what changes is whether the bytes have to arrive again.
     ⚠ `held = frames[0]` still means 「the one that landed last」. */
  /* ⚠ (#R310) `quiet` — an hour READ AHEAD (see `readAhead`) goes into the list so `sampler()` can
     find it, but it is not 「the one that landed last」: the reader is still looking at the hour
     before it, and `held` is what names that. It goes in SECOND, so the LRU still protects it from
     everything older than the picture on screen. */
  function keepFrame(f, quiet) {
    var rest = frames.filter(function (x) { return !(x.key === f.key && bandCovers(f.band, x.band)); });
    frames = (quiet && rest.length) ? [rest[0], f].concat(rest.slice(1)) : [f].concat(rest);
    var n = 0;
    for (var i = 0; i < frames.length; i++) { n += frameSize(frames[i]); if (n > FRAME_SAMPLES && i > 0) { frames.length = i; break; } }
    held = frames[0] || null;
  }
  var loadingKey = '';
  /* ══ ⚠⚠⚠ ONE READER, THEREFORE ONE QUEUE ═════════════════════════════════════════════════════
     The SDK keeps a SINGLE `omFileReader` behind `getProtocolInstance`, and `ensureData` re-points it
     at the state's file every time:
         await reader.setToOmFile(state.omFileUrl);   // dispose() + re-open, on the shared reader
         const data = await reader.readVariable(…);
     So two reads of DIFFERENT files that overlap in time corrupt each other: the second `setToOmFile`
     disposes the reader the first one is still reading through, and the first read resolves with
     nothing. CAUGHT IN PRODUCTION by this round's own forecast test — `valueNow` came back null after
     a step, because the prefetch of the NEXT hour re-pointed the reader out from under the load of
     the CURRENT one. (The same states loading concurrently is safe: `ensureData` de-duplicates by
     `state.dataPromise`. It is only two different FILES that collide.)
     Every read this module starts therefore goes through one chain, so it can never be the second
     party to that collision. */
  /* ══ ⚠⚠⚠ (#R305) ONE QUEUE IS NOT THE SAME THING AS ONE ORDER ═══════════════════════════════
     「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」 (2回目)
     The single chain above is correct about the reader — two reads of different FILES corrupt each
     other — and it is also FIFO, which is a different decision that was never made on purpose. Two
     kinds of read go down it: the one the reader is waiting for, and the two this module starts on
     its own (the widening staircase and the warm-up of the next hour). MEASURED on the built page at
     the opening view, stepping the time axis: **7,050 / 7,942 / 8,270 ms** to the new hour, and a
     re-visited hour in **45 ms** — i.e. the bytes are not the wait, the QUEUE is. At world zoom the
     warm-up asked for the planet (see the note on `prefetch` in js/weather.js) and the staircase's
     first rung IS the planet, so every step landed behind eighteen megabytes of a picture nobody had
     asked for.
     → the same one-at-a-time reader, with the reader's own request going FIRST. A background read
     that has not STARTED yet waits behind a foreground one; a background read already running still
     has to finish (the SDK cannot be interrupted), which is why the other half of this round is that
     the background reads are much smaller than they were.
     ⚠ `fn` used to be passed as BOTH handlers of `.then` so that a rejected predecessor could not
     strand the queue. That property is kept — a job's failure is delivered to ITS caller and the
     pump moves on — and it is now explicit rather than a trick of the chain. */
  /* ══ ⚠⚠⚠ (#R310) …AND THE HALF #R305 COULD NOT FIX WAS THAT A RUNNING JOB CANNOT BE TAKEN BACK ══
     #R305 wrote it down itself: 「a background read already running still has to finish (the SDK
     cannot be interrupted)」 — and MEASURED the consequence, a step at 2,393 ms followed by one at
     7,343 ms. That was true of ONE reader. With a reader per file (see `readerFor`) the reads do
     not touch each other at all, so the foreground no longer WAITS for the background; it starts
     beside it.
     What is left is a decision about BANDWIDTH, and it is the same decision as before: a background
     read does not start while the reader is waiting for one, because the only thing sharing the
     connection with the picture on screen would be a picture nobody has asked for yet. So
       · foreground: starts as soon as no other foreground read is running (one at a time — two
         would halve each other's share of a connection the reader is watching);
       · background: starts only when the foreground is completely idle, and once started it is NOT
         in anybody's way.  */
  var qHi = [], qLo = [], runHi = 0, runLo = 0;
  var HI_MAX = 1, LO_MAX = 1;
  function _start(job, hi) {
    if (hi) runHi++; else runLo++;
    Promise.resolve().then(job.fn).then(job.res, job.rej)
      .then(function () { if (hi) runHi--; else runLo--; _pump(); });
  }
  function _pump() {
    while (runHi < HI_MAX && qHi.length) _start(qHi.shift(), 1);
    while (runLo < LO_MAX && !qHi.length && runHi === 0 && qLo.length) _start(qLo.shift(), 0);
  }
  function serial(fn, bg) {
    var job = { fn: fn, res: null, rej: null };
    var p = new Promise(function (res, rej) {
      job.res = res; job.rej = rej;
      (bg ? qLo : qHi).push(job);
      _pump();
    });
    p._imJob = job;                 /* so a foreground caller can lift it — see `promote` */
    return p;
  }
  /* ⚠⚠ (#R310) JOINING A QUEUED BACKGROUND READ WOULD INHERIT ITS PRIORITY. `load()` lets a step
     JOIN the read-ahead of the hour it is stepping onto rather than starting a second one, which is
     right — but if that read-ahead is still WAITING in the low lane, the reader is now waiting on a
     job that by construction does not start while the reader is waiting for something. The join has
     to carry the caller's priority with it: a queued job moves lanes, a running one is already
     running and needs nothing. */
  function promote(p) {
    var job = p && p._imJob;
    if (!job) return p;
    var i = qLo.indexOf(job);
    if (i >= 0) { qLo.splice(i, 1); qHi.push(job); _pump(); }
    return p;
  }
  /* is the reader waiting for something right now? — the background readers ask before they start
     one more rung, so a queue that is already busy on the reader's behalf does not grow */
  function foregroundBusy() { return qHi.length > 0 || runHi > 0; }

  function _grid(state) {
    try { return sdk.GridFactory.create(state.dataOptions.domain.grid, state.ranges); } catch (_) { return null; }
  }
  /* 0.0.19 exposes getLinearInterpolatedValue / getNearestNeighborValue; 0.0.20 unified them into
     getInterpolatedValue(arr, lat, lon, method). Support both rather than pinning a method name. */
  function _lin(grid, arr, lat, lon) {
    return grid.getInterpolatedValue ? grid.getInterpolatedValue(arr, lat, lon, 'linear')
      : grid.getLinearInterpolatedValue(arr, lat, lon);
  }
  function _near(grid, arr, lat, lon) {
    return grid.getInterpolatedValue ? grid.getInterpolatedValue(arr, lat, lon, 'nearest')
      : grid.getNearestNeighborValue(arr, lat, lon);
  }

  /* ══ ⚠⚠⚠ (#R288) A READ THAT SUCCEEDED MUST NOT RESOLVE AS A FAILURE ═══════════════════════════
     「未来に変えたとき、風データを取得できませんでしたとなる。」

     REPRODUCED on the deployed build, not reasoned about: start `load('wind_u_component_10m', 30)`,
     call `release()` 50 ms later — which is EXACTLY what `fireTime()` did on every time change —
     and the promise resolves **null after 8.3 seconds**. The bytes had arrived; the frame had been
     decoded; the module threw it away. js/weather.js reads that null as a failed fetch and raises
     the toast the reader reported, so the message was not describing anything that had happened.

     Two lines caused it and both are fixed here:
       ① the handler returned the MODULE-LEVEL `held` instead of the frame it had just decoded. An
          unqualified `release()` sets `held = null`, so a load whose `loadingKey` had been cleared
          returned null — or, worse, ANOTHER variable's frame.
       ② `loadingKey` is a single slot shared by every variable, so two layers loading at once made
          one of them "superseded" by the other rather than by a newer request for itself.
     `seq` replaces both: it is bumped by every load AND by `release`, so a frame installs itself as
     the current one only if nothing newer has been asked for — and it is RETURNED either way,
     because a superseded picture is still a picture that loaded. */
  var seq = 0;
  /* ══ ⚠⚠⚠ (#R288) THE BAND, NOT THE PLANET — 「品質は一切落とさずに爆速にしろ」 ══════════════════
     MEASURED on the built page: one frame of the global field is **6,599,680 samples**, and reading
     it costs **274 ranged requests / 17.96 MB / 7.8–8.4 s** before a single particle can move. That
     is the whole of 「重すぎる」, and none of it is rendering — the renderer itself measures 2.65 ms
     a frame with 1,980 particles.

     The ECMWF domain is a REDUCED GAUSSIAN grid, and the SDK's `getCoveringRanges` for that grid
     narrows a read by LATITUDE only (longitude is one flat index, so it cannot be cut) — read out
     of the shipped bundle and then measured: a 25°–46° band is **935,400 samples, 25 requests,
     1.64 MB**. Same 9 km spacing, same numbers, same colours; what is not downloaded is the part of
     the planet that is not on the screen. Nothing about the picture the reader is looking at
     changes, which is what 「品質は一切落とさずに」 asks for. (And because the band spans every
     longitude, panning east or west needs no new read at all.)

     The second half is that the band is LATENCY-bound where the globe was BANDWIDTH-bound: 25
     sequential range requests at ~220 ms is still 5.6 s. The SDK's own `prefetchVariable` issues
     them at `prefetchConcurrency: 1000`, so warming the state's ranges before reading collapses
     them into roughly one round trip. MEASURED end to end:
         global  8,436 ms · band alone 2,829 ms · **band + prefetch 1,254 ms**
     ⚠ A HELD FRAME IS REUSED WHEN IT COVERS WHAT IS ASKED FOR, and a null band means the globe,
     which covers everything — so a caller that needs an arbitrary point (`valueAt`, the drone
     forecast) still gets the global read it always got. */
  function bandCovers(have, want) {
    /* ══ ⚠⚠⚠ (#R298) 「持っていない」と「地球を持っている」を同じ値で表してはならなかった ═══════
       MEASURED consequence: `heldBand()` answered `null` BOTH when a global frame was in hand and
       when NO frame was in hand, and the line below reads `null` as 「the globe, which covers
       everything」. So on the very first load — the one #R297 wrote `bandNear` for — the caller's
       test `if(!bandCovers(heldBand(VAR), b)) b = nearBand()` was FALSE, the narrowing was skipped,
       and the opening view (the globe, so `bandFor` is null too) read the whole planet:
       13,199,360 samples before a single particle moved. #R297's fix existed and never ran.
       ⚠ 「nothing is held」 is now `false`, which is a different answer from 「the globe」. */
    if (have === false) return false;                              /* (#R298) no frame at all */
    if (have === null || have === undefined) return true;          /* the globe covers everything */
    if (!want) return false;                                       /* the globe is not covered by a band */
    return have[1] <= want[1] + 1e-6 && have[3] >= want[3] - 1e-6;
  }
  /* `bg` — a read this MODULE started (a widening rung), not one the reader is waiting for. It is
     the same read down the same one reader; what changes is that it yields its place in the queue
     to anything the reader asks for while it is still waiting (#R305, see `serial`). */
  /* ⚠⚠ (#R310) `ahead` — a read for an hour NOBODY IS LOOKING AT YET (see `readAhead`). It is a
     background read like a widening rung, with one difference that matters: it must not take part
     in `seq`. `seq` answers 「has the reader asked for something newer than this」, and an hour the
     reader has not arrived at is newer than everything by construction — bumping it would supersede
     the read of the picture ON SCREEN, and checking it would cancel the ahead read the instant the
     reader stepped, which is the one moment it is about to become useful. */
  var reading = Object.create(null);      /* skey -> Promise<frame|null> — see the note below */
  function load(variable, i, bounds, bg, ahead) {
    var band = (bounds && bounds.length === 4) ? bounds : null;
    var key = stateKey(variable, '', i);
    var have = key && frameCovering(key, band);
    if (have) return Promise.resolve(have);
    /* ⚠ (#R307) every read path — the particles, the readout, the drone forecast — pays the cold
       stage-in once per file, so every read path warms it first. Free where it has already happened.
       ⚠ `meta` may not be here yet; `fileUrl` answers '' then and `touch` does nothing. `ready()`
       below warms it the moment the axis lands. */
    touch(i == null ? idx : i);
    var mine = ahead ? 0 : ++seq;
    return ready().then(function () {
      var key2 = stateKey(variable, '', i);          /* meta may have arrived meanwhile */
      var h2 = frameCovering(key2, band); if (h2) return h2;
      if (!key2) return null;
      if (!ahead) loadingKey = key2;
      var inst = sdk.getProtocolInstance(omSettings());
      try { pinReader(inst.omFileReader); } catch (_) {}   /* (#R310) the tiles re-open too — see pinReader */
      var dom = sdk.domainOptions.find(function (d) { return d.value === DOMAIN; });
      if (!dom) return null;
      var f = fileUrl(i);
      /* ⚠ OUR OWN KEY CARRIES THE BAND. The SDK reuses a state whose bounds CONTAIN the new ones,
         but its key is ours to choose, and two different bands under one key would hand the second
         reader the first one's ranges. */
      var skey = key2 + (band ? ('#' + band[1].toFixed(1) + ',' + band[3].toFixed(1)) : '');
      /* ══ ⚠⚠⚠ (#R310) THE STEP THE READ-AHEAD IS FOR MUST NOT START THE READ AGAIN ═══════════════
         `readAhead` exists so that stepping onto the next hour costs nothing, and it can only do
         that if the step JOINS the read instead of opening a second one beside it. The SDK's own
         `state.dataPromise` de-duplicates, but only while the SDK still holds that state — its
         `stateByKey` is a TWO-ENTRY LRU that the colour tiles evict — so the join is kept here,
         where the key is ours and the lifetime is the read's. */
      var join = reading[skey];
      if (join) {
        if (!ahead) promote(join);      /* the reader is waiting for it now — see `promote` */
        return join.then(function (fr) { return fr || null; }, function () { return null; });
      }
      var st = sdk.getOrCreateState(inst.stateByKey, skey, { domain: dom, variable: variable, bounds: band || undefined }, f);
      var p = serial(function () {
        /* the queue may have been waiting a while — if the reader has moved on, so have we */
        var h3 = frameCovering(key2, band); if (h3) return h3;
        /* ══ ⚠⚠⚠ (#R299) 「THE READER HAS MOVED ON」 IS ALSO TRUE OF A READ THAT WAS OVERTAKEN ══════
           `seq` was consulted only AFTER the bytes had arrived (see the `if (seq === mine)` below),
           so a request a newer one had already superseded still spent its ranged requests, its
           decode and — the part that costs everyone else — its turn in this ONE queue, before being
           thrown away. READ FROM THE CODE: dragging the slider across twenty steps enqueued twenty
           full reads and nineteen of them were for pictures nobody would ever see; the hour the
           reader stopped on was last in line behind all of them. Now those nineteen cost nothing.
           ⚠ IT MUST NOT ANSWER `null`. js/weather.js reads a falsy answer as 「the data is
           unavailable」 and starts the FAIL_MS ladder that ends in a toast (#R298). Any frame of
           this variable is 「a superseded picture is still a picture that loaded」, which is the
           rule stated below for the reads that DID complete; which hour is current is decided by
           the caller through `sampler()`, and that is keyed on the hour. */
        if (!ahead && seq !== mine) return frames.filter(function (x) { return x.variable === variable; })[0] || null;
        /* ⚠ (#R307) THE GLOBE STILL DOES NOT GET THIS, AND THAT IS #R297'S MEASUREMENT, NOT AN
           OVERSIGHT: a global read's ranges are two contiguous blocks, so there is nothing for the
           concurrency to collapse (A/B on production: 16.4 / 7.8 s plain against 7.8 / 9.4 s warmed).
           This round un-gated it, found no reason to believe it helps, and put the gate back — the
           four seconds a cold hour was spending are `touch`'s, not this one's. */
        /* (#R310) …and the reader is THIS FILE'S, opened once — see `readerFor`. The open may
           already have finished: `setIndex` starts it beside the stage-in, before this read exists. */
        var rh = openReader(f);
        var rdr = (rh && rh.rd) || inst.omFileReader;
        /* ⚠ the fallback has to open too. `ensureData` would do it anyway, but `prefetchVariable`
           below reads through whatever file the reader is currently on. */
        var warm = (rh && rh.open) ? rh.open.catch(function () {})
          : (rdr && rdr.setToOmFile ? rdr.setToOmFile(f).catch(function () {}) : Promise.resolve());
        if (band && rdr && rdr.prefetchVariable) {
          warm = warm.then(function () { return rdr.prefetchVariable(variable, st.ranges); }).catch(function () {});
        }
        return warm.then(function () {
          return sdk.ensureData(st, rdr, undefined);
        }).then(function (data) {
          if (!data || !data.values) return null;
          var g = _grid(st);
          if (!g) return null;
          var frame = { key: key2, variable: variable, file: f, data: data, grid: g, band: band };
          /* ⚠ (#R310) an ahead read installs its frame QUIETLY: it is a picture nobody has asked
             for yet, so it must be findable by `sampler()` (that is the whole point) without
             becoming `held` — 「the one that landed last」 belongs to the hour on screen. */
          if (ahead) keepFrame(frame, true);
          else if (seq === mine) {
            keepFrame(frame); loadingKey = '';
            emit('field', { variable: variable, band: band });
          }
          return frame;
        });
      }, !!bg);
      var q = p.catch(function () { return null; });
      q._imJob = p._imJob;          /* the handle travels with the promise the joiner receives */
      p = q;
      reading[skey] = p;
      p.then(function () { if (reading[skey] === p) delete reading[skey]; },
             function () { if (reading[skey] === p) delete reading[skey]; });
      return p;
    }).catch(function () { return null; });
  }
  /* ══ ⚠⚠⚠ (#R310) 「日時変更から…爆速にしろ」 — THE ONLY HOUR THAT IS FAST IS THE ONE IN HAND ═════
     MEASURED on the built page, at the opening view, one step of the axis: **2,107 / 2,168 /
     2,204 ms** to the new hour — and an hour already decoded answers in **45 ms** (#R305 measured
     the same 41–46 ms). Between those two numbers there is nothing to optimise: the wait IS the
     8.6 MB the new hour costs, moving at whatever the reader's connection gives (2.1–2.5 MB/s on
     the machine these were taken on). Four rounds have now made those bytes leave earlier, arrive
     concurrently and stop being fetched twice; what none of them did is spend them BEFORE the
     reader asks.

     `prefetch` (#R276 追記 / #R290 追記2 / #R305) already asks for exactly the right bytes for
     exactly the right hour — and then throws away everything except their presence in the block
     cache, so the step still pays the open, the index walk and the decode. It also could not be
     allowed to run early, because it went down the ONE reader in front of the picture on screen.
     With a reader per file (see `readerFor`) neither is true any more:

       · the read of the next hour is a REAL read — it decodes, and `keepFrame` holds the frame, so
         the step is `frameCovering` → 45 ms;
       · it starts the moment the current hour is on screen instead of 2,500 ms later, because it
         can no longer be in front of anything;
       · and `reading[skey]` means a reader who steps while it is still running JOINS it rather
         than starting a second read of the same bytes.

     ⚠ ONLY AFTER THE READER HAS ACTUALLY MOVED THE AXIS. #R276 追記's rule is unchanged and it is
     the honest one: a reader who has not touched the player is not asking for another hour, and
     8.6 MB is not something to spend on a guess. The caller passes the direction (#R305).
     ⚠ ONE HOUR, NOT A WINDOW. `touch` stages twelve files because a stage-in is one byte; this
     moves the whole band, so it is the next hour and nothing else. */
  function readAhead(variable, i, bounds) {
    if (!meta || i == null || i < 0 || i >= meta.validTimes.length) return Promise.resolve(null);
    var band = (bounds && bounds.length === 4) ? bounds : null;
    var key = stateKey(variable, '', i);
    if (key && frameCovering(key, band)) return Promise.resolve(null);
    return load(variable, i, band, true, true);
  }
  /* the band that covers a view, or null when the view is most of the planet (where the whole grid
     is cheaper than pretending otherwise). Padded, so a small pan does not cost a read. */
  function bandFor(south, north) {
    if (!isFinite(south) || !isFinite(north)) return null;
    var pad = Math.max(4, (north - south) * 0.35);
    var s2 = Math.max(-90, south - pad), n2 = Math.min(90, north + pad);
    if (n2 - s2 >= 120) return null;
    return [-180, Math.round(s2 * 10) / 10, 180, Math.round(n2 * 10) / 10];
  }
  /* ⚠ (#R290 追記) …AND A BAND THAT IS NEVER THE PLANET, for a reader that wants a POINT.
     `bandFor` answers 「what does this picture cover」 and honestly says 「everything」 at world
     zoom. The cursor readout is not a picture: it needs the value under one point, so it asks for
     the latitudes on screen capped at ±30° of the centre — about 2.2 M samples against 6.6 M — and
     re-asks when the reader leaves that band (the band is part of its 「already asked」 key). */
  function bandNear(south, north) {
    if (!isFinite(south) || !isFinite(north)) return bandFor(south, north);
    var c = (south + north) / 2, half = Math.min(30, Math.max(6, (north - south) / 2 * 1.35));
    var s2 = Math.max(-90, c - half), n2 = Math.min(90, c + half);
    return [-180, Math.round(s2 * 10) / 10, 180, Math.round(n2 * 10) / 10];
  }
  /* ⚠⚠ (#R276 追記2) `release(variable)` — A LAYER MAY ONLY DROP ITS OWN FRAME.
     MEASURED: switching the wind layer OFF called `release()` unqualified, which cleared `held` AND
     `loadingKey` — so a load of a DIFFERENT variable that was in flight at that moment resolved,
     found `loadingKey` no longer matching its own key, and quietly returned null. The reader saw an
     ECMWF layer whose point value was blank for no reason they could see.
     Reproduced from the app's own behaviour, not from a contrived test: js/map-ui.js re-applies the
     saved layer set at 700 / 1,800 / 3,200 ms after boot, and that re-apply switches OFF any layer
     not in the share hash — so a layer switched on programmatically is switched off again a second
     later, in the middle of somebody else's read. Unqualified, one layer's teardown was a global
     `forget everything`. */
  function release(variable) {
    /* (#R290) …and it drops that variable's frames, not everything held. A layer switching off
       must not take the readout's field or the wind's with it — which is #R276 追記's rule, one
       list along. */
    if (variable) {
      var mineLoading = loadingKey ? loadingKey.indexOf('variable=' + encodeURIComponent(variable)) >= 0 : false;
      var had = frames.some(function (f) { return f.variable === variable; });
      if (!had && !mineLoading) return false;
      frames = frames.filter(function (f) { return f.variable !== variable; });
      held = frames[0] || null;
      if (mineLoading) { seq++; loadingKey = ''; }
      return true;
    }
    /* (#R288) a deliberate drop supersedes whatever is in flight, so an older read cannot land
       afterwards and put the frame back — but it still RESOLVES to its caller (see `load`). */
    seq++;
    frames = []; held = null; loadingKey = '';
    return true;
  }

  /* A synchronous sampler for the field that is loaded RIGHT NOW, or null. Costs one grid lookup
     per call — MEASURED at 14,000 calls in 2.2 ms, which is what makes per-particle sampling of the
     native 9 km field affordable instead of resampling it onto a lattice first. */
  function sampler(variable, i) {
    var key = stateKey(variable, '', i);
    var fr = key ? frameFor(key) : null;
    if (!fr) return null;
    var g = fr.grid, d = fr.data;
    return {
      variable: variable,
      file: fr.file,
      hasDirection: !!d.directions,
      value: function (lat, lon) { return _lin(g, d.values, lat, lon); },
      /* speed is interpolated, bearing is nearest — a bearing is an angle and linear interpolation
         across the 0/360 seam produces a wind that briefly blows backwards. Half a cell of the O1280
         grid is 4.5 km, which is below one screen pixel at every zoom the particles are visible at. */
      uv: function (lat, lon, out) {
        var sp = _lin(g, d.values, lat, lon);
        if (!(sp === sp)) { out[0] = out[1] = NaN; return out; }
        if (!d.directions) { out[0] = sp; out[1] = 0; return out; }
        var dir = _near(g, d.directions, lat, lon) * Math.PI / 180;
        out[0] = -sp * Math.sin(dir);
        out[1] = -sp * Math.cos(dir);
        return out;
      }
    };
  }

  /* The point value for the layer that is ON SCREEN — same variable, same model run, same valid
     time. This is what the coordinate readout asks instead of opening its own live Open-Meteo call
     for a number that belongs to a different dataset and a different hour. */
  function valueNow(variable, lat, lng, i) {
    var s = sampler(variable, i);
    if (!s) return null;
    var v = s.value(lat, lng);
    return (v === v && isFinite(v)) ? v : null;
  }
  function valueAt(variable, lat, lng, i) {
    var v = valueNow(variable, lat, lng, i);
    if (v != null) return Promise.resolve(v);
    return load(variable, i).then(function () { return valueNow(variable, lat, lng, i); });
  }

  /* ── prefetch ─────────────────────────────────────────────────────────────────────────────────
     Warms the NEXT frame's byte ranges in the SDK's block cache without holding its decoded arrays.
     MEASURED: a cold frame costs 8.7 s on the very first read of a run and 1.0–1.6 s once the
     file's index blocks are cached, so this is the difference between a step that stutters and one
     that does not. */
  var warmed = Object.create(null);
  /* ⚠⚠⚠ (#R290 追記) WARMING MUST NOT QUEUE AHEAD OF THE THING IT IS WARMING FOR.
     「時刻を変えたときに、前の時刻のパーティクルの残像がしばらくの間残るのをやめろ。」 — MEASURED,
     one step, time until the new hour's field is actually in hand:
         z4.5, wind alone                     1.0 s
         world zoom, wind alone               3.5 s
         z4.5, wind + the temperature raster  **10.5 s**
     Every read this module starts goes through ONE queue (see `serial` — it has to, the SDK has one
     reader). So the neighbouring hours being warmed, and the band the cursor readout wants, were
     sitting in front of the picture the reader is watching. Warming is by definition the work that
     can wait: it is deferred until the axis has been STILL for a while, and a further step replaces
     the pending schedule rather than adding to it. */
  var warmT = 0;
  function prefetch(variables, i, bounds) {
    clearTimeout(warmT);
    warmT = setTimeout(function () { warmT = 0; _prefetchNow(variables, i, bounds); }, 2500);
  }
  /* ⚠⚠⚠ (#R290 追記2) WARM WHAT WILL BE READ, NOT THE PLANET.
     `prefetchVariable(v, null)` warms the WHOLE variable — the globe — and that was right while the
     frame on screen was also the globe (#R288). It stopped being right the moment the reader zoomed
     in: since #R288 the field is read as the latitude BAND in view (935 k samples against 6.6 M), so
     warming three whole variables queued about 80 MB in front of a step that needed 1.6 MB.
     MEASURED on the deployed build, wind + temperature at z4.5: the field for the new hour had still
     not arrived **after 39 s**, and the frame in hand was the old hour's. Deferring the warm-up
     (追記 ②) moved it behind the read; scoping it is what makes it small enough to matter.
     The ranges come from a state built with the SAME bounds `load()` would use, so the bytes warmed
     are the bytes the next read asks for. `null` still means the planet — which is what the raster
     TILES want, and what a reader at world zoom is going to read anyway. */
  function _prefetchNow(variables, i, bounds) {
    if (!sdk || !meta) return;
    var f = fileUrl(i);
    var band = (bounds && bounds.length === 4) ? bounds : null;
    var mark = f + (band ? ('#' + band[1] + ',' + band[3]) : '');
    if (!f || warmed[mark]) return;
    /* ⚠⚠ (#R302) THE FLAG GOES UP BEFORE THE WORK — SO IT HAS TO COME DOWN WHEN THE WORK FAILS.
       This is #R288's own lesson (「the flag only goes up if the registration actually happened」)
       one function along, with the sign reversed: `warmed[mark]` is latched here, ahead of an
       asynchronous read, and NOTHING ever cleared it. A warm-up that threw — a ranged request that
       came back empty, a reader that was not there yet — therefore recorded itself as done, and the
       step it exists to make instant paid the full cold read with no second attempt possible for
       the life of the page. The mark stays up when the bytes actually arrive; a failure un-marks
       itself, so the next step for that hour and band may warm it again. */
    warmed[mark] = 1;
    touch(i);   /* (#R307) …and the stage-in first, so the warm-up itself is not the one that pays it */
    /* ⚠ THROUGH THE QUEUE, LIKE EVERY OTHER READ. This is the call that caught the collision above:
       warming the next hour re-points the shared reader, and doing it beside a load of the current
       hour is how `valueNow` came back null in production. Queued, it starts only once whatever is
       reading has finished — which is also the right ORDER, because the frame on screen matters more
       than the one that might be asked for next. */
    serial(function () {
      var inst = sdk.getProtocolInstance(omSettings());
      /* (#R310) this file's own reader, so warming an hour cannot re-point the reader the colour
         tiles are decoding through — which is the collision the note on `serial` describes. */
      var rh = openReader(f);
      var reader = (rh && rh.rd) || (inst && inst.omFileReader);
      if (!reader || !reader.setToOmFile || !reader.prefetchVariable) { delete warmed[mark]; return null; }
      var dom = band ? sdk.domainOptions.find(function (d) { return d.value === DOMAIN; }) : null;
      return reader.setToOmFile(f).then(function () {
        return Promise.all((variables || []).map(function (v) {
          try {
            var ranges = null;
            if (dom) {
              var skey = stateKey(v, '', i) + '#' + band[1].toFixed(1) + ',' + band[3].toFixed(1);
              var st = sdk.getOrCreateState(inst.stateByKey, skey, { domain: dom, variable: v, bounds: band }, f);
              ranges = st && st.ranges;
            }
            return reader.prefetchVariable(v, ranges);
          } catch (_) { return null; }
        }));
      });
    }, true).catch(function () { delete warmed[mark]; });    /* (#R302) …and a failure is not 「warmed」 · (#R305) background */
  }

  /* ── time ─────────────────────────────────────────────────────────────────────────────────────*/
  function count() { return meta ? meta.validTimes.length : 0; }
  /* ══ ⚠⚠⚠ (#R284) THE AXIS MOVES ONCE PER GESTURE, NOT ONCE PER PIXEL ═════════════════════
     「未来や過去に変えたとき、読み込みまでの速度が異常におそい。」「点滅してしまうバグが発生する。」

     A range input fires `input` on EVERY pixel of a drag, and this fired `time` on every one of
     them. Each `time` made js/weather.js tear the raster source down and build it again AND queue a
     whole 26 MB field read through `serial()` — so dragging the slider ten steps enqueued ten full
     reads, and the hour the reader actually stopped on was LAST IN THE QUEUE, behind nine frames
     nobody would ever look at. That is the whole of 「異常におそい」: the work was not slow, it
     was work for pictures that had already been superseded.

     So the axis has TWO events now:
        `index`  fires immediately, carries the new hour, and is what the labels and the slider
                 read — the reader sees the time move under their finger with no lag at all;
        `time`   fires once the axis has been STILL for `COALESCE_MS`, and is the one that costs a
                 download. A drag of forty pixels is one of these.
     The held frame is dropped at the same moment for the same reason: releasing it per pixel threw
     away the frame a reader who drags back would land on again.
     ⚠ `step()` and the player buttons pass `{now:true}` — a click is a decision, not a sweep, and
     playback at 700 ms an hour must not have 140 ms added to every frame. */
  var COALESCE_MS = 140;
  var timeT = 0;
  /* ⚠⚠⚠ (#R287) DROP THE STALE FRAME — DO NOT CANCEL THE LOAD OF THE NEW ONE.
     This line was `release()` unqualified, and while it lived in `setIndex` (#R276) that was
     harmless: it ran SYNCHRONOUSLY, before any caller could have started a load for the new hour.
     Deferring it by COALESCE_MS put it 140 ms into the future — and `release()` clears `loadingKey`
     as well as `held`, so a load STARTED IN THAT WINDOW resolved, found `loadingKey` no longer
     matching its own key, declined to install itself and returned null. The 27 MB it had just
     decoded was thrown away, which is the very waste the coalescing exists to prevent.
     ⚠ THAT IS #R276 追記2's DEFECT, ONE AXIS OVER. There it was one VARIABLE's teardown cancelling
     another variable's read; here it is the TIME axis cancelling a read of the hour it is itself
     announcing. MEASURED against production: the first step after boot always lost the race (a cold
     field takes 7–9 s, the window is 140 ms) — `valueNow` came back null and a retry 1.5 s later
     returned 25.27 °C; a warm field that resolved inside the window was never affected.
     So the frame still goes, and a load is still abandoned when it is for some OTHER hour — only a
     load of the hour being announced is now left alone to finish. */
  function fireTime() {
    clearTimeout(timeT); timeT = 0;
    if (!meta) return;
    /* ⚠⚠⚠ (#R288) THE OLD FRAME IS NOT THROWN AWAY HERE AT ALL — the line is gone, not narrowed.
       #R287 measured this from the other side and reached for the same defect: the unconditional
       `release()` also cleared `loadingKey`, so a load STARTED INSIDE the 140 ms coalescing window
       resolved, found the slot no longer matching its own key and returned null — 「風データを取得
       できませんでした」 with 27 MB decoded and discarded. Its fix kept dropping `held` and only
       spared `loadingKey` when the in-flight read was for the SAME file.
       Two things are still wrong with dropping `held` here, and this round measured both:
         · a load that resolves after ANY later request — not just one inside the window — still
           returned the module slot rather than the frame it had decoded (MEASURED on the deployed
           build: `release()` 50 ms into a load, 8.3 s later the data was there and the promise
           resolved **null**), which is why `load()` now returns ITS OWN frame and a monotonic
           `seq` decides which one is current;
         · dropping the frame blanks the point readout and forces the next load to decode the same
           hour again. The new frame REPLACES the old one when it lands — the rule #R284 wrote for
           the particles and then contradicted one level down. */
    emit('time', { index: idx, validTime: meta.validTimes[idx] });
  }
  /* ══ ⚠⚠⚠ (#R288) ONE CLOCK — THE FORECAST AXIS IS A VIEW OF window.IntMapTime ═══════════════
     「ECMWF系レイヤーを開くと勝手にECMWFの時間ポップアップが出るのを辞めろ。わざわざ分けるな。」

     This module used to own a private index that nothing else could see, and js/weather.js gave it
     a floating box of its own that appeared the moment any ECMWF layer was switched on. Both are
     gone: the instant is the app's master clock (js/app-body.js), the ECMWF axis SNAPS that instant
     to the nearest hour the model publishes, and the reader moves it from the one time control the
     app already has (js/news-timeline.js).
     ⚠ `_fromClock` is what stops the two writing to each other for ever: a change that arrived FROM
     the clock does not travel back to it. */
  var _fromClock = false;
  function _clock() { try { return window.IntMapTime; } catch (_) { return null; } }
  /* the model's own window, as milliseconds — outside it the axis holds at the nearer end and the
     legend says so, rather than pretending the model covers a year it has never heard of. */
  function span() {
    if (!meta || !meta.validTimes.length) return null;
    return [tms(meta.validTimes[0]), tms(meta.validTimes[meta.validTimes.length - 1])];
  }
  function covers(ms) { var s = span(); return !!(s && ms >= s[0] - 1800000 && ms <= s[1] + 1800000); }
  /* ══ ⚠⚠⚠ (#R290) THE FORECAST HOUR IS NOT THE APP'S INSTANT ═══════════════════════════════
     「ECMWF系レイヤーで、時間選択をChronosに受け流さなくてよい。個別の時間選択UIを使え。」

     #R288 wired this axis to window.IntMapTime in BOTH directions: a forecast step pushed the
     master clock (`_pushClock`), and a master-clock move pulled the axis (`_followClock`). The
     first meant choosing an hour of weather also moved the news feed, the historical borders, the
     day/night terminator and the country statistics to that hour — 「受け流す」 exactly. The second
     meant the reader's chosen hour was overwritten whenever anything else touched the clock.
     Both are gone. The model's axis is the model's; the control for it is in each weather layer's
     own legend (js/weather.js, window.IntMapWxPlayer.timeUI), and Chronos's forecast tab still
     drives THIS axis directly — a second view of one state, which is not a second clock.
     `_pushNow` / `_pushClock` are kept as no-ops rather than deleted so `setIndex`'s call site
     stays one shape, and `followClock` stays EXPORTED because it is a deliberate, explicit action
     (Atlas asks for it when a reader says 「その時刻の天気」) rather than an automatic subscription. */
  var pushT = 0;
  function _pushNow() { clearTimeout(pushT); pushT = 0; }
  function _pushClock() {}
  function setIndex(i, opt) {
    if (!meta) return;
    var n = meta.validTimes.length;
    i = Math.max(0, Math.min(n - 1, i | 0));
    if (i === idx && idxSet) return;
    /* ⚠ (#R307) BEFORE ANYTHING ELSE — the four seconds this saves are spent on a request nobody has
       issued yet, so the earlier it leaves the more of it overlaps with the rest of the step. */
    if (idxSet && i !== idx) _touchDir = (i > idx) ? 1 : -1;
    idx = i; idxSet = true; _prevValid = meta.validTimes[idx] || '';
    /* ⚠ `sdk` IS THE TEST FOR 「somebody is actually reading this model」 — it is only ever loaded by
       `ready()`, which only a real consumer reaches. The clock moves this axis on every tick
       (`_followClock`) whether or not a weather layer is on, and staging files for a layer nobody
       switched on is bytes nobody asked for. */
    if (sdk && !(opt && opt.quiet)) {
      touchAround(idx, playing ? TOUCH_PLAY_AHEAD : TOUCH_AHEAD);
      /* ⚠ (#R310) …AND THE OPEN, WHICH IS TWO MORE ROUND TRIPS NOBODY WAS OVERLAPPING. The HEAD and
         the trailer read that `setToOmFile` costs depend on the file name and on nothing else, so
         they belong here beside the stage-in — 140 ms of coalescing and a whole stage-in ahead of
         the read that needs them. MEASURED before this line existed: the two HEADs of a step landed
         at 223 and 227 ms and took 389 and 576 ms, in front of the first byte of data. */
      try { openReader(fileUrl(idx)); } catch (_) {}
    }
    if (!(opt && opt.fromClock)) _pushClock();
    if (opt && opt.quiet) { clearTimeout(timeT); timeT = 0; return; }
    emit('index', { index: idx, validTime: meta.validTimes[idx] });
    if (opt && opt.now) { fireTime(); return; }
    clearTimeout(timeT);
    timeT = setTimeout(fireTime, COALESCE_MS);
  }
  /* the clock → the axis. A reader who travels to 1972 has not asked for a forecast, so the axis
     holds where it is and `covers()` is what the legend prints the caveat from. */
  function _followClock(e) {
    if (_fromClock || !meta) return;
    var ms = (e && e.when) ? e.when.getTime() : Date.now();
    if (e && e.isLive) { setIndex(nowIndex(), { now: true, fromClock: true }); return; }
    if (!covers(ms)) return;
    setIndex(nearestTo(ms), { now: true, fromClock: true });
  }
  /* ══ ⚠⚠⚠ (#R293) SUBSCRIBED AGAIN — BUT ONLY IN THIS DIRECTION ═══════════════════════
     「Chronosで時間を変更したら、IntMap内の対応するすべての要素をChronosの時間に合わせるように。」
     #R290 cut BOTH wires because #R288 had wired both, and the one that hurt was the PUSH: choosing
     an hour of weather also dragged the news feed, the historical borders, the terminator and the
     country statistics to that hour. That one stays cut — `_pushClock` is still a no-op and each
     layer's own legend still owns its axis (「個別の時間選択UIを使え」).
     The PULL is what the reader is asking for here, and it is the opposite trade: Chronos is the
     app's one clock, so an instant chosen THERE has to be the instant every time-aware layer is
     showing. `covers()` is what keeps it honest — travelling to 1972 is not a request for a
     forecast, so the axis holds where it is and the legend prints the caveat. */
  (function wireClock(n){ try{ var C=window.IntMapTime;
    if(C&&C.on){ C.on(function(e){ try{ _followClock(e); }catch(_){} }); return; }
  }catch(_){}
    if((n|0)<60) setTimeout(function(){ wireClock((n|0)+1); },200); })(0);
  function step(n) { if (!meta) return; var c = meta.validTimes.length; setIndex(((idx + n) % c + c) % c, { now: true }); }
  function play() {
    if (playing || !meta) return;
    playing = true; emit('play', { playing: true });
    var tick = function () {
      if (!playing) return;
      step(1);
      playTimer = setTimeout(tick, playMs);
    };
    playTimer = setTimeout(tick, playMs);
  }
  function pause() { playing = false; clearTimeout(playTimer); playTimer = 0;
    _pushNow();                       /* (#R288) the clock lands where the player stopped */
    emit('play', { playing: false }); }

  /* ── colour scales & legends ──────────────────────────────────────────────────────────────────
     The legend is BUILT FROM THE RENDERER'S OWN TABLE, not written beside it. 「凡例の最大値と実際の
     LUTも一致させる」 — a hand-written 「0 … 40 m/s」 beside a ramp that actually runs to 60 m/s is a
     legend that disagrees with its own picture, which is #R270's lesson (色は名前と一緒に旅する). */
  /* ⚠ (#R288) THE RAMPS THIS FILE OWNS DO NOT NEED THE SDK. `getColorScale` does — it is the SDK's
     own alias resolver — so before this, a legend asked for while the 340 kB bundle had not been
     fetched came back null and printed a description with no key. The reanalysis source (see
     js/wx-reanalysis.js) never loads that bundle at all, so its legend would have been permanently
     keyless. Our own two families answer without it; everything else still waits for the SDK. */
  var OWN = { temperature_2m: WINDY_TEMP, temperature_2m_max: WINDY_TEMP, temperature_2m_min: WINDY_TEMP,
    surface_temperature: WINDY_TEMP,
    wind_u_component_10m: WINDY_WIND, wind_v_component_10m: WINDY_WIND, wind_gusts_10m: WINDY_WIND };
  function scale(variable, dark) {
    if (!sdk || !sdk.getColorScale) return OWN[variable] || null;
    try {
      var st = omSettings();
      return sdk.getColorScale(variable, !!dark, st && st.colorScales);
    } catch (_) { return OWN[variable] || null; }
  }
  function rgbaCss(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  /* ══ ⚠⚠ (#R297) 「風レイヤーのカラー凡例は、30m/sまでにして。」 ═══════════════════════════════
     The wind ramp runs to 104 m/s because that is where Windy's own paint function clamps, and
     104 m/s is a category-5 core: nine tenths of the bar was colour nobody reading a map of Europe
     will ever see, so the range that matters — a breeze to a gale — was squeezed into the first
     third of it. The KEY now reads to 30 m/s and its ticks are spaced over that range.
     ⚠ THE MAP IS NOT RE-COLOURED. The colour table is untouched (#R293 fitted it to Windy's own
     `RGBA()` to within 3/255), so a 60 m/s jet is painted exactly as before; what changed is how
     much of the scale the key draws. The top tick therefore carries a 「+」, because the ramp does
     continue past it — a key that ended at 30 with no mark would be claiming 30 is the maximum,
     which is the kind of quiet lie #R270 is about.
     ⚠ ONE DECLARATION. `legend()` is what the wind box AND the ECMWF gust box draw from, and both
     are the same family in the same unit, so the cap belongs here rather than in either caller. */
  var LEGEND_MAX = { wind: 30 };
  function legendMax(variable) {
    try {
      if (/^wind_(u|v)_component|^wind_gusts|^wind_speed/.test(String(variable))) return LEGEND_MAX.wind;
    } catch (_) {}
    return null;
  }
  /* {unit, min, max, css:<linear-gradient>, stops:[{v,pos,css}], capped} — all a numeric legend needs. */
  function legend(variable, dark) {
    var s = scale(variable, dark);
    if (!s) return null;
    var stops = [], min, max, i;
    var cap = legendMax(variable);
    if (s.type === 'breakpoint') {
      var bp = s.breakpoints, cols = s.colors;
      min = bp[0]; max = bp[bp.length - 1];
      if (cap != null && cap > min && cap < max) max = cap;
      var span = (max - min) || 1;
      for (i = 0; i < bp.length; i++) {
        if (bp[i] > max) break;
        stops.push({ v: bp[i], pos: (bp[i] - min) / span * 100, css: rgbaCss(cols[Math.min(i, cols.length - 1)]) });
      }
    } else {
      min = s.min; max = s.max;
      var n = s.colors.length, sp2 = (max - min) || 1;
      for (i = 0; i < n; i++) {
        var v = min + (max - min) * (i / Math.max(1, n - 1));
        stops.push({ v: v, pos: (v - min) / sp2 * 100, css: rgbaCss(s.colors[i]) });
      }
    }
    /* the swatch is painted OPAQUE. The scale's own alpha ramp is how the map fades calm air into
       the basemap; a legend chip has no basemap under it, so carrying the alpha there would print a
       pale grey block for "no wind" that a reader cannot match to anything on the map. */
    /* ⚠ (#R284) …and a ramp may now hold six hundred stops (see `rampFrom`). CSS interpolates
       between whatever stops it is given, so the PICTURE needs only enough of them to trace the
       ramp; writing all six hundred into a style attribute would be 24 kB of markup per redraw for
       a bar 160 px wide. `stops` itself is untouched — the numbers a caller reads are all still
       there. */
    var draw = stops;
    if (draw.length > 64) {
      var every = Math.ceil(draw.length / 64), thin = [];
      for (var j = 0; j < draw.length; j += every) thin.push(draw[j]);
      if (thin[thin.length - 1] !== draw[draw.length - 1]) thin.push(draw[draw.length - 1]);
      draw = thin;
    }
    var css = 'linear-gradient(to right,' + draw.map(function (st) {
      return st.css + ' ' + st.pos.toFixed(2) + '%';
    }).join(',') + ')';
    return { unit: s.unit || '', min: min, max: max, stops: stops, css: css, type: s.type,
      capped: (cap != null && s.type === 'breakpoint' && s.breakpoints[s.breakpoints.length - 1] > max) };
  }

  /* ══ WHERE A WEATHER FIELD BELONGS IN THE STACK ═══════════════════════════════════════════════
     「風色面の二重透過を解消する…Windy並みに気象場が明瞭に読める濃度へ調整する。」

     The two multipliers the instruction names — a flat pixel alpha and raster-opacity — were only two
     of THREE. MEASURED on the built app, flat projection, z3, over the Pacific at 150°E 20°N with the
     wind field at raster-opacity 1 and a palette whose alpha is 1:

         wind speed there            4.67 m/s
         the colour the LUT asks for rgb(40,130,180)
         the pixel actually painted  rgb(15,43,64)      ← 0.36×

     The missing factor was the DAY/NIGHT SHADING. `firstSymbolId()` returns the first symbol layer in
     the style, which is `grid-tropic-label` — a graticule label — so 「below the first symbol layer」
     put the weather at index 13 of 60, underneath `im-night-lights-lyr` and `im-night-shade` at 29–30.
     It was 23:00 local at that point, and the terminator fill is opacity ~0.75 at z3, so half the
     planet was showing its weather through a dark grey sheet. No slider could have fixed that.

     A weather field is DATA and the terminator is DECORATION, so the data goes on top of it — and
     under the labels, the borders and the tools, which is the Windy arrangement. `before()` returns
     the first layer after the night stack; `lift()` re-applies it, because js/night-side.js re-adds
     its own layers on a timer and each re-add would otherwise put the sheet back on top. */
  /* ══ ⚠⚠ (#R299) THE STYLE IS SERIALISED ONCE PER STYLE, NOT ONCE PER CALL ═════════════════════
     「風レイヤーが重すぎる。…すべてに至るまで爆速にしろ。」 — `getStyle()` SERIALISES THE WHOLE
     STYLE: every layer's paint and layout, every source, the sprite and the glyph URL. And it sat
     on the path that runs on EVERY `idle` — js/weather.js lifts both wind slots and both slots of
     every ECMWF raster that is switched on, so a map with the wind and two rasters up rebuilt the
     whole style object SIX times after every pan, every zoom and every tile settle. None of those
     rebuilds can change the answer, because the answer only changes when the STYLE changes.
     MapLibre says exactly when that is: `styledata` fires after a basemap swap AND after any
     addLayer / removeLayer / moveLayer, from inside the same render pass that ends in `idle` — so
     a list an idle handler reads is never one frame behind the map it is describing.
     ⚠ A CACHE MUST NOT OUTLIVE ITS STYLE. The subscription is the invalidation, and there is no
     cache at all until there is a subscription to invalidate it. For the one window the event does
     not cover — between a layer being added or removed and the next render — `_hasLayer` is the
     O(1) second answer (`getLayer` is a map lookup, not a serialisation), so neither `before()` nor
     `lift()` can hand back an id the style no longer has. */
  var _lys = null, _ids = null, _idsHooked = false;
  function _idsDrop() { _lys = null; _ids = null; }
  function _styleLayers() {
    if (_lys) return _lys;
    var ls = null;
    try { ls = (window.IntMapGeoEngine.scene.getStyle() || {}).layers || null; } catch (_) { ls = null; }
    if (!ls || !ls.length) return [];                   /* nothing to describe — ask again next time */
    if (!_idsHooked) { try { window.IntMapGeoEngine.events.on('styledata', _idsDrop); _idsHooked = true; } catch (_) {} }
    if (!_idsHooked) return ls;                         /* no invalidation signal, therefore no cache */
    _lys = ls; _ids = null;
    return _lys;
  }
  function _layerIds() {
    if (_ids) return _ids;
    var ls = _styleLayers();
    if (!ls.length) return [];
    var out = ls.map(function (l) { return l.id; });
    if (_lys === ls) _ids = out;                        /* …only alongside the list it was built from */
    return out;
  }
  function _hasLayer(id) { try { return !!window.IntMapGeoEngine.layers.has(id); } catch (_) { return false; } }
  var OURS = /^(wind-field-|ec-)/;
  function firstSymbolId() {
    var ls = _styleLayers();
    for (var i = 0; i < ls.length; i++) if (ls[i].type === 'symbol') return ls[i].id;
    return undefined;
  }
  var _beforeRe = false;
  function before() {
    var ids = _layerIds(), last = -1, i;
    for (i = 0; i < ids.length; i++) if (ids[i].indexOf('im-night') === 0) last = i;
    if (last >= 0) for (i = last + 1; i < ids.length; i++) { if (OURS.test(ids[i])) continue;
      /* (#R299) …and the anchor is still in the style: `addLayer(…, <a layer that has gone>)`
         throws, so a list that predates a removal is rebuilt ONCE — from the live style, which is
         the best answer there is — rather than handed on. `_beforeRe` keeps that to once. */
      if (_beforeRe || _hasLayer(ids[i])) return ids[i];
      _idsDrop(); _beforeRe = true;
      try { return before(); } finally { _beforeRe = false; } }
    return firstSymbolId();
  }
  function lift(layerId) {
    try {
      var ids = _layerIds();
      var wi = ids.indexOf(layerId);
      /* (#R299) not in the list is either 「not in the style」 or 「the list predates the add」, and
         one O(1) lookup tells them apart — see the note above. */
      if (wi < 0) { if (!_hasLayer(layerId)) return false;
        _idsDrop(); ids = _layerIds(); wi = ids.indexOf(layerId); if (wi < 0) return false; }
      var ni = -1;
      for (var i = 0; i < ids.length; i++) if (ids[i].indexOf('im-night') === 0) ni = i;
      if (ni <= wi) return false;                       /* already above the shading */
      window.IntMapGeoEngine.layers.move(layerId, before());
      _idsDrop();                                       /* (#R299) the order just changed under it */
      return true;
    } catch (_) { return false; }
  }

  /* ── formatting ───────────────────────────────────────────────────────────────────────────────*/
  /* ══ ⚠⚠ (#R302) `toLocaleString` BUILDS A FORMATTER EVERY TIME IT IS CALLED ════════════════════
     `Date.prototype.toLocaleString(locale, options)` is specified as 「construct an
     Intl.DateTimeFormat from these arguments and format with it」, and constructing one is where
     the cost of this function is: it resolves the locale, the calendar, the numbering system and
     the time zone. The forecast axis publishes ~109 valid times and the weather legends name EVERY
     ONE of them in a `<select>` (js/weather.js `_timeUI`), so one redraw of one legend built ~109
     of these — and the legend is redrawn on the load, on the answer, and on every `time` / `play` /
     `meta` event. The point readout calls it under the cursor as well.
     A formatter is a pure function of [locale, options], so the same one answers for every hour on
     the axis. NOTHING ABOUT THE OUTPUT CHANGES — same locale, same options, same string.
     ⚠ `o` always carries month/day/hour/minute (`opt` only overrides), so `ToDateTimeOptions` adds
     no defaults and `DateTimeFormat(locale, o).format(d)` is `d.toLocaleString(locale, o)` exactly.
     ⚠ AN UNPARSEABLE INSTANT STILL PRINTS WHAT IT PRINTED. `format()` THROWS on an invalid Date
     where `toLocaleString` answers 「Invalid Date」, and that string is what a reader would have
     seen, so the invalid case is left on the old path rather than turned into something new. */
  var _dtf = Object.create(null);
  function _fmtOf(locale, o) {
    var k = locale + '|' + JSON.stringify(o);
    return _dtf[k] || (_dtf[k] = new Intl.DateTimeFormat(locale, o));
  }
  function fmt(iso, opt) {
    if (!iso) return '';
    try {
      var tz; var H = window.IM_HOST || {};
      if (H.userTZ && H.userTZ !== 'auto') tz = H.userTZ;
      var lang = H.lang || 'en';
      var o = Object.assign({ timeZone: tz, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }, opt || {});
      var loc = window.IntMapLang.locale(lang, 'en-GB');
      var d = new Date(tms(iso));
      if (!isFinite(d.getTime())) return d.toLocaleString(loc, o);
      return _fmtOf(loc, o).format(d);
    } catch (_) { return iso; }
  }

  window.IntMapECMWF = {
    BASE: BASE, META_URL: META_URL, DOMAIN: DOMAIN,
    MODEL: 'ECMWF IFS HRES', RESOLUTION_KM: 9,
    meta: fetchMeta,
    metaSync: function () { return meta; },
    ready: ready,
    warm: warm,                       /* (#R314) — see the note on `warm` */
    loadSDK: loadSDK,
    sdk: function () { return sdk; },
    registerProtocol: registerProtocol,
    /* (#R288) 「om:// を渡してよいか」 — an unregistered scheme reaches the network, see registerProtocol */
    protocolReady: function () { return protoReg; },
    has: function (v) { return !!(meta && meta.variables.indexOf(v) >= 0); },
    variables: function () { return meta ? meta.variables.slice() : []; },
    times: function () { return meta ? meta.validTimes.slice() : []; },
    count: count,
    index: function () { return idx; },
    setIndex: setIndex,
    step: step,
    nowIndex: nowIndex,
    nearestTo: nearestTo,
    /* (#R288) the model's own window, and whether the master clock's instant is inside it */
    span: span,
    covers: covers,
    followClock: _followClock,
    validTime: function (i) { return meta ? (meta.validTimes[i == null ? idx : i] || '') : ''; },
    referenceTime: function () { return meta ? meta.referenceTime : ''; },
    isPlaying: function () { return playing; },
    play: play, pause: pause,
    togglePlay: function () { playing ? pause() : play(); },
    playInterval: function (ms) { if (ms) playMs = Math.max(120, ms | 0); return playMs; },
    fileUrl: fileUrl,
    omUrl: omUrl,
    stateKey: stateKey,
    load: load,
    release: release,
    sampler: sampler,
    bandFor: bandFor,
    bandNear: bandNear,
    bandCovers: bandCovers,
    /* (#R290) …of a NAMED variable, because there is more than one frame now: the wind asks whether
       ITS band still covers the view, and the answer must not be the temperature's. */
    /* ⚠ (#R298) `false` = 「this variable has no frame at all」, `null` = 「it has a GLOBAL frame」.
       They are different answers and `bandCovers` treats them differently — see the note there. */
    heldBand: function (variable) { var f = variable ? frameFor(stateKey(variable, '')) : held; return f ? (f.band || null) : false; },
    heldFrames: function () { return frames.map(function (f) { return { variable: f.variable, key: f.key, band: f.band, samples: frameSize(f) }; }); },
    valueAt: valueAt,
    valueNow: valueNow,
    prefetch: prefetch,
    /* (#R310) read — not merely warm — the hour the reader is about to step onto */
    readAhead: readAhead,
    /* (#R305) is the reader waiting for a read right now — see `serial` */
    foregroundBusy: foregroundBusy,
    scale: scale,
    legend: legend,
    WINDY_TEMP: WINDY_TEMP,
    TEMP_ANCHORS: TEMP_ANCHORS,
    before: before,
    lift: lift,
    colorScales: function () { var st = omSettings(); return st && st.colorScales; },
    WINDY_WIND: WINDY_WIND,
    LEGEND_MAX: LEGEND_MAX,
    fmt: fmt,
    on: function (f) { if (typeof f === 'function' && listeners.indexOf(f) < 0) listeners.push(f); return this; },
    off: function (f) { var i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); return this; },
    /* test seam — never called by the app */
    _settings: omSettings,
    /* (#R307) `touched` — how many forecast files have had their cold stage-in paid ahead of the
       reader. It is the number the wind's speed is made of, so it is printed rather than assumed. */
    _state: function () { return { meta: meta, idx: idx, playing: playing, held: held ? held.key : null, variable: held ? held.variable : null, frames: frames.length, touched: touchN }; }
  };
})();
