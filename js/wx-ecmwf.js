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
  var WIND_ANCHORS = {
    unit: 'm/s',
    breakpoints: [0, 1, 3, 5, 7, 9, 11, 13, 15, 17, 20, 23, 26, 30, 36, 45, 60],
    colors: [
      [98, 113, 184, 1], [61, 99, 174, 1], [40, 130, 180, 1], [36, 160, 168, 1],
      [44, 168, 120, 1], [62, 175, 80, 1], [110, 185, 60, 1], [160, 195, 55, 1],
      [214, 202, 60, 1], [236, 170, 50, 1], [240, 130, 46, 1], [235, 92, 50, 1],
      [224, 56, 60, 1], [210, 40, 110, 1], [200, 70, 175, 1], [214, 140, 220, 1],
      [240, 220, 245, 1]
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
  var settings = null;
  function omSettings() {
    if (settings || !sdk) return settings;
    var base = sdk.defaultOmProtocolSettings;
    var scales = Object.assign({}, sdk.COLOR_SCALES_WITH_ALIASES || base.colorScales, { wind: WINDY_WIND });
    settings = Object.assign({}, base, { colorScales: scales });
    return settings;
  }
  function registerProtocol() {
    if (protoReg || !sdk || !sdk.omProtocol) return protoReg;
    var st = omSettings();
    try { window.IntMapGeoEngine.scene.addProtocol('om', function (params, ctl) { return sdk.omProtocol(params, ctl, st); }); } catch (_) {}
    protoReg = true;
    return true;
  }
  /* everything a layer needs, in one await */
  function ready() {
    return loadSDK().then(function (s) { registerProtocol(); return fetchMeta().then(function () { return s; }); });
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
  var held = null;          /* {key, variable, file, data, grid} */
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
  var chain = Promise.resolve();
  function serial(fn) {
    var p = chain.then(fn, fn);
    chain = p.then(function () {}, function () {});
    return p;
  }

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

  function load(variable, i) {
    var key = stateKey(variable, '', i);
    if (held && key && held.key === key) return Promise.resolve(held);
    return ready().then(function () {
      var key2 = stateKey(variable, '', i);          /* meta may have arrived meanwhile */
      if (held && held.key === key2) return held;
      if (!key2) return null;
      loadingKey = key2;
      var inst = sdk.getProtocolInstance(omSettings());
      var dom = sdk.domainOptions.find(function (d) { return d.value === DOMAIN; });
      if (!dom) return null;
      var f = fileUrl(i);
      var st = sdk.getOrCreateState(inst.stateByKey, key2, { domain: dom, variable: variable, bounds: undefined }, f);
      return serial(function () {
        /* the queue may have been waiting a while — if the reader has moved on, so have we */
        if (held && held.key === key2) return held;
        return sdk.ensureData(st, inst.omFileReader, undefined).then(function (data) {
          if (!data || !data.values) return null;
          var g = _grid(st);
          if (!g) return null;
          if (loadingKey === key2) {
            held = { key: key2, variable: variable, file: f, data: data, grid: g };
            emit('field', { variable: variable });
          }
          return held;
        });
      }).catch(function () { return null; });
    }).catch(function () { return null; });
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
    if (variable) {
      var mine = held ? (held.variable === variable)
        : (loadingKey ? loadingKey.indexOf('variable=' + encodeURIComponent(variable)) >= 0 : true);
      if (!mine) return false;
    }
    held = null; loadingKey = '';
    return true;
  }

  /* A synchronous sampler for the field that is loaded RIGHT NOW, or null. Costs one grid lookup
     per call — MEASURED at 14,000 calls in 2.2 ms, which is what makes per-particle sampling of the
     native 9 km field affordable instead of resampling it onto a lattice first. */
  function sampler(variable, i) {
    var key = stateKey(variable, '', i);
    if (!held || !key || held.key !== key) return null;
    var g = held.grid, d = held.data;
    return {
      variable: variable,
      file: held.file,
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
  function prefetch(variables, i) {
    if (!sdk || !meta) return;
    var f = fileUrl(i);
    if (!f || warmed[f]) return;
    warmed[f] = 1;
    /* ⚠ THROUGH THE QUEUE, LIKE EVERY OTHER READ. This is the call that caught the collision above:
       warming the next hour re-points the shared reader, and doing it beside a load of the current
       hour is how `valueNow` came back null in production. Queued, it starts only once whatever is
       reading has finished — which is also the right ORDER, because the frame on screen matters more
       than the one that might be asked for next. */
    serial(function () {
      var inst = sdk.getProtocolInstance(omSettings());
      var reader = inst && inst.omFileReader;
      if (!reader || !reader.setToOmFile || !reader.prefetchVariable) return null;
      return reader.setToOmFile(f).then(function () {
        return Promise.all((variables || []).map(function (v) {
          try { return reader.prefetchVariable(v, null); } catch (_) { return null; }
        }));
      });
    }).catch(function () {});
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
    if (held && held.key !== stateKey(held.variable, '', idx)) {
      var here = fileUrl(idx);
      held = null;
      if (loadingKey && here && loadingKey.indexOf(here) !== 0) loadingKey = '';
    }
    emit('time', { index: idx, validTime: meta.validTimes[idx] });
  }
  function setIndex(i, opt) {
    if (!meta) return;
    var n = meta.validTimes.length;
    i = Math.max(0, Math.min(n - 1, i | 0));
    if (i === idx && idxSet) return;
    idx = i; idxSet = true; _prevValid = meta.validTimes[idx] || '';
    if (opt && opt.quiet) { clearTimeout(timeT); timeT = 0; return; }
    emit('index', { index: idx, validTime: meta.validTimes[idx] });
    if (opt && opt.now) { fireTime(); return; }
    clearTimeout(timeT);
    timeT = setTimeout(fireTime, COALESCE_MS);
  }
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
  function pause() { playing = false; clearTimeout(playTimer); playTimer = 0; emit('play', { playing: false }); }

  /* ── colour scales & legends ──────────────────────────────────────────────────────────────────
     The legend is BUILT FROM THE RENDERER'S OWN TABLE, not written beside it. 「凡例の最大値と実際の
     LUTも一致させる」 — a hand-written 「0 … 40 m/s」 beside a ramp that actually runs to 60 m/s is a
     legend that disagrees with its own picture, which is #R270's lesson (色は名前と一緒に旅する). */
  function scale(variable, dark) {
    if (!sdk || !sdk.getColorScale) return null;
    try {
      var st = omSettings();
      return sdk.getColorScale(variable, !!dark, st && st.colorScales);
    } catch (_) { return null; }
  }
  function rgbaCss(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  /* {unit, min, max, css:<linear-gradient>, stops:[{v,pos,css}]} — all a numeric legend needs. */
  function legend(variable, dark) {
    var s = scale(variable, dark);
    if (!s) return null;
    var stops = [], min, max, i;
    if (s.type === 'breakpoint') {
      var bp = s.breakpoints, cols = s.colors;
      min = bp[0]; max = bp[bp.length - 1];
      var span = (max - min) || 1;
      for (i = 0; i < bp.length; i++) {
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
    return { unit: s.unit || '', min: min, max: max, stops: stops, css: css, type: s.type };
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
  function _layerIds() {
    try { return ((window.IntMapGeoEngine.scene.getStyle() || {}).layers || []).map(function (l) { return l.id; }); }
    catch (_) { return []; }
  }
  var OURS = /^(wind-field-|ec-)/;
  function firstSymbolId() {
    try {
      var ls = (window.IntMapGeoEngine.scene.getStyle() || {}).layers || [];
      for (var i = 0; i < ls.length; i++) if (ls[i].type === 'symbol') return ls[i].id;
    } catch (_) {}
    return undefined;
  }
  function before() {
    var ids = _layerIds(), last = -1, i;
    for (i = 0; i < ids.length; i++) if (ids[i].indexOf('im-night') === 0) last = i;
    if (last >= 0) for (i = last + 1; i < ids.length; i++) { if (OURS.test(ids[i])) continue; return ids[i]; }
    return firstSymbolId();
  }
  function lift(layerId) {
    try {
      var ids = _layerIds();
      var wi = ids.indexOf(layerId);
      if (wi < 0) return false;
      var ni = -1;
      for (var i = 0; i < ids.length; i++) if (ids[i].indexOf('im-night') === 0) ni = i;
      if (ni <= wi) return false;                       /* already above the shading */
      window.IntMapGeoEngine.layers.move(layerId, before());
      return true;
    } catch (_) { return false; }
  }

  /* ── formatting ───────────────────────────────────────────────────────────────────────────────*/
  function fmt(iso, opt) {
    if (!iso) return '';
    try {
      var tz; var H = window.IM_HOST || {};
      if (H.userTZ && H.userTZ !== 'auto') tz = H.userTZ;
      var lang = H.lang || 'en';
      var o = Object.assign({ timeZone: tz, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }, opt || {});
      return new Date(tms(iso)).toLocaleString(window.IntMapLang.locale(lang, 'en-GB'), o);
    } catch (_) { return iso; }
  }

  window.IntMapECMWF = {
    BASE: BASE, META_URL: META_URL, DOMAIN: DOMAIN,
    MODEL: 'ECMWF IFS HRES', RESOLUTION_KM: 9,
    meta: fetchMeta,
    metaSync: function () { return meta; },
    ready: ready,
    loadSDK: loadSDK,
    sdk: function () { return sdk; },
    registerProtocol: registerProtocol,
    has: function (v) { return !!(meta && meta.variables.indexOf(v) >= 0); },
    variables: function () { return meta ? meta.variables.slice() : []; },
    times: function () { return meta ? meta.validTimes.slice() : []; },
    count: count,
    index: function () { return idx; },
    setIndex: setIndex,
    step: step,
    nowIndex: nowIndex,
    nearestTo: nearestTo,
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
    valueAt: valueAt,
    valueNow: valueNow,
    prefetch: prefetch,
    scale: scale,
    legend: legend,
    before: before,
    lift: lift,
    colorScales: function () { var st = omSettings(); return st && st.colorScales; },
    WINDY_WIND: WINDY_WIND,
    fmt: fmt,
    on: function (f) { if (typeof f === 'function' && listeners.indexOf(f) < 0) listeners.push(f); return this; },
    off: function (f) { var i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); return this; },
    /* test seam — never called by the app */
    _state: function () { return { meta: meta, idx: idx, playing: playing, held: held ? held.key : null, variable: held ? held.variable : null }; }
  };
})();
