/* ============================================================================
 *  IntMap · FORECAST MODEL REGISTRY — window.IntMapWxModels  (#R356)
 * ----------------------------------------------------------------------------
 *  「複数予報モデルの切替・比較」。Until this round IntMap read exactly one model:
 *  `js/wx-ecmwf.js` held the host, the domain name, the model's display name and its
 *  resolution as four literals, and every other file that needed to say WHICH model the
 *  picture was of wrote the word ECMWF down again — eight layer labels x nine languages,
 *  two lines in js/map-ui.js, three in js/atlas-catalog-text.js, twelve in
 *  js/data-layers.js. That is the shape this project keeps paying for: one fact, many
 *  copies, and no single place that is wrong when it is wrong.
 *
 *  ══ WHAT THIS FILE IS, AND WHAT IT DELIBERATELY IS NOT ═══════════════════════════════
 *  It is the ONE place that says WHICH models IntMap offers and the facts about them that
 *  are not in the data: the agency to credit, the licence, the display name, whether the
 *  model is offered for the map, for a point, or both.
 *
 *  ⚠ IT IS NOT A COPY OF THE MODEL'S CONTENTS. Grid, coverage, resolution, variables,
 *  pressure levels, cadence, forecast horizon and valid times are NOT written down here —
 *  they are READ, from the renderer SDK's own domain table and from each model's live
 *  `latest.json`. A table of variables written by hand is a table that is wrong the first
 *  time an upstream centre adds one, and it is wrong SILENTLY: the layer draws nothing and
 *  the legend still says the variable's name. MEASURED, 2026-08-23, on the live feed:
 *
 *      ecmwf_ifs     35 variables    0 pressure levels   109 steps    6 d   <- ships today
 *      ncep_gfs013   29 variables    0 pressure levels   209 steps   16 d
 *      dwd_icon     123 variables   18 pressure levels    93 steps    5 d
 *
 *  Three models, three different variable sets. ECMWF IFS HRES has NO pressure levels at
 *  all; GFS 0.13 has no `pressure_msl`, no `cape` and no `dew_point_2m`. So a fixed list
 *  would have made 「モデルを切り替える」 mean 「四つのレイヤーが黙って空になる」. What a
 *  reader may ask for is therefore an INTERSECTION, computed in `availability()` below:
 *
 *      offered here  x  live metadata  x  the model's own coverage  x  variable  x  time
 *
 *  ══ WHY THE FILE URL RULE LIVES HERE ════════════════════════════════════════════════
 *  `js/wx-ecmwf.js` built the `.om` path from the host and the two timestamps. MEASURED on
 *  the live host: the same rule answers 206 for every model tested (ECMWF 9 km / ECMWF
 *  0.25 / GFS 0.13 / ICON global / ICON D2), so it is ONE rule and it belongs with the
 *  model identity rather than beside the reader that happens to use it.
 *
 *  ══ THE COLOUR-SCALE TRAP THIS FILE EXISTS TO GUARD ═════════════════════════════════
 *  ⚠⚠⚠ The renderer SDK's `getColorScale(variable)` ends in `?? settings.temperature`. For
 *  a variable it does not know it does not throw and does not return null — it returns THE
 *  TEMPERATURE SCALE, unit and all. MEASURED across the 857 variables the 58 live domains
 *  publish: **212 of them land on that fallback**, and 52 of those are not temperature at
 *  all — every air-quality species, both ocean-current components, sea-level height,
 *  snowfall, weather codes, two of the three swell directions. Shipping one of them as a
 *  layer would put a degrees-Celsius ramp under PM2.5 and nothing would have failed.
 *  `usesFallbackScale()` names that condition exactly (by comparing against a variable that
 *  cannot exist), so `tests/r356-checks.test.mjs` can require that a layer lands on the
 *  fallback if and only if the layer itself says it is a temperature field.
 * ==========================================================================*/
(function () {
  'use strict';

  /* The spatial archive every offered model is read from. One host, one path rule. */
  var HOST = 'https://map-tiles.open-meteo.com/data_spatial';

  /* ── the models IntMap offers ────────────────────────────────────────────────────────
     `id`        the upstream domain name — also the directory on HOST and the key into the
                 SDK's `domainOptions`, so it is not a name of ours to choose.
     `nameKey`   what the reader is shown. NOT translated: ECMWF IFS HRES is the model's
                 own name in every language. The words AROUND it are translated by the
                 caller; see js/weather.js's `modelLine`.
     `km`        nominal grid spacing, for the one line that reports it. Kept here rather
                 than derived because a reduced Gaussian grid has no single dx.
     `agency`    who to credit — the name used in js/reference-data.js's source list.
     `licence`   the upstream licence. ⚠ NOT all the same: UK Met Office publishes under
                 CC-BY-SA, which is why `ukmo_global_deterministic_10km` is NOT offered here
                 even though its data is live and the reader could otherwise use it — a
                 share-alike obligation on the map's own presentation is a decision this
                 round is not entitled to make on the reader's behalf.
     `roles`     which parts of the app may offer this model at all.                      */
  var MODELS = [
    { id: 'ecmwf_ifs',   nameKey: 'ECMWF IFS HRES', km: 9,  agency: 'ECMWF',
      licence: 'CC-BY-4.0', roles: ['surface'], map: true, point: true, order: 1 },
    { id: 'ncep_gfs013', nameKey: 'NOAA GFS',       km: 13, agency: 'NOAA NCEP',
      licence: 'NOAA-open', roles: ['surface'], map: true, point: true, order: 2 },
    { id: 'dwd_icon',    nameKey: 'DWD ICON',       km: 13, agency: 'DWD',
      licence: 'CC-BY-4.0', roles: ['surface', 'pressure'], map: true, point: true, order: 3 }
  ];

  var BY_ID = Object.create(null);
  MODELS.forEach(function (m) { BY_ID[m.id] = m; });

  function all() { return MODELS.slice(); }
  function get(id) { return BY_ID[id] || null; }
  function ids() { return MODELS.map(function (m) { return m.id; }); }
  /* the model every reader starts on, and the one `window.IntMapECMWF` is bound to */
  function defaultId() { return MODELS[0].id; }

  /* ── the .om path rule ───────────────────────────────────────────────────────────────
     <HOST>/<id>/<ref YYYY>/<MM>/<DD>/<HH>00Z/<valid YYYY-MM-DD>T<HH>00.om
     Reference time UTC is the directory; valid time UTC is the file name. */
  function p2(n) { return ('0' + n).slice(-2); }
  function ms(t) { try { return Date.parse(/[zZ]$/.test(t) ? t : t + 'Z'); } catch (_) { return NaN; } }
  function baseUrl(id) { return HOST + '/' + id; }
  function metaUrl(id) { return HOST + '/' + id + '/latest.json'; }
  function fileUrl(id, referenceTime, validTime) {
    if (!id || !referenceTime || !validTime) return '';
    var r = new Date(ms(referenceTime)), t = new Date(ms(validTime));
    if (isNaN(r.getTime()) || isNaN(t.getTime())) return '';
    return HOST + '/' + id + '/'
      + r.getUTCFullYear() + '/' + p2(r.getUTCMonth() + 1) + '/' + p2(r.getUTCDate()) + '/'
      + p2(r.getUTCHours()) + '00Z/'
      + t.getUTCFullYear() + '-' + p2(t.getUTCMonth() + 1) + '-' + p2(t.getUTCDate())
      + 'T' + p2(t.getUTCHours()) + '00.om';
  }

  /* ── coverage, READ from the grid the data is actually on ────────────────────────────
     Not declared. The SDK's domain entry carries the grid the file was written on, so the
     bounding box is the same object the reader samples — a declared box could disagree
     with it, and a box that disagrees is worse than no box: it says 「圏外」 about a point
     the model covers, or offers a model for a point it does not. */
  function coverage(grid) {
    if (!grid) return null;
    if (grid.type === 'gaussian') return { w: -180, s: -90, e: 180, n: 90, global: true };
    if (grid.type === 'regular') {
      var n = grid.latMin + (grid.ny - 1) * grid.dy, e = grid.lonMin + (grid.nx - 1) * grid.dx;
      return { w: grid.lonMin, s: grid.latMin, e: Math.min(e, 180), n: Math.min(n, 90),
               global: (grid.nx * grid.dx >= 359 && (grid.ny - 1) * grid.dy >= 178) };
    }
    if (grid.type === 'projectedFromBounds' && grid.latitudeBounds && grid.longitudeBounds) {
      var wrap = function (x) { return ((x + 540) % 360) - 180; };
      return { w: wrap(grid.longitudeBounds[0]), s: grid.latitudeBounds[0],
               e: wrap(grid.longitudeBounds[1]), n: grid.latitudeBounds[1], global: false };
    }
    /* projected grids whose extent is only expressed in projected metres. We do not guess
       a box for them: `null` means 「分からない」 and `covers()` says so rather than
       pretending the answer is 「はい」. */
    return null;
  }
  function covers(box, lat, lon) {
    if (!box) return null;                       /* unknown — NOT the same as false */
    if (box.global) return lat >= -90 && lat <= 90;
    var x = ((lon + 540) % 360) - 180;
    return lat >= box.s && lat <= box.n && x >= box.w && x <= box.e;
  }

  /* ── what the live feed actually publishes ───────────────────────────────────────────*/
  var LEVEL_RE = /_(\d+)hPa$/;
  function levels(variables) {
    var seen = Object.create(null), out = [];
    (variables || []).forEach(function (v) {
      var m = LEVEL_RE.exec(v);
      if (m && !seen[m[1]]) { seen[m[1]] = 1; out.push(+m[1]); }
    });
    return out.sort(function (a, b) { return a - b; });
  }
  /* ⚠ THE BASE NAME OF A LEVEL FAMILY IS NOT THE SURFACE NAME. The families upstream publishes on
     pressure surfaces are `temperature`, `relative_humidity`, `wind_u_component`,
     `wind_v_component`, `geopotential_height`, `cloud_cover` and `vertical_velocity` — so 500 hPa
     temperature is `temperature_500hPa`, NOT `temperature_2m_500hPa`. Asking with the surface name
     produces a variable no model has ever published, and the refusal then reads as 「this model has
     no 500 hPa」 when the truth is 「that name does not exist anywhere」. */
  function atLevel(variable, level) { return level ? variable + '_' + level + 'hPa' : variable; }
  function has(variables, name) { return !!(variables && variables.indexOf(name) >= 0); }

  /* ── the axis ────────────────────────────────────────────────────────────────────────
     Switching model must keep the reader on the INSTANT they were looking at, not on the
     index they were looking at: index 6 of a 1-hourly 109-step axis and index 6 of a
     3-hourly 49-step axis are twelve hours apart. Same rule js/wx-ecmwf.js already applies
     when a new RUN re-bases its own axis (#R276) — a model change is the same event with a
     bigger step. */
  function nearestTime(validTimes, atMs) {
    if (!validTimes || !validTimes.length) return -1;
    var best = 0, bd = Infinity;
    for (var i = 0; i < validTimes.length; i++) {
      var d = Math.abs(ms(validTimes[i]) - atMs);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function spanOf(validTimes) {
    if (!validTimes || !validTimes.length) return null;
    return [ms(validTimes[0]), ms(validTimes[validTimes.length - 1])];
  }
  function horizonHours(validTimes) {
    var s = spanOf(validTimes);
    return s ? Math.round((s[1] - s[0]) / 3600000) : 0;
  }

  /* ── the intersection ────────────────────────────────────────────────────────────────
     Every 「このモデルでこれを見せてよいか」 goes through here, so there is one answer and
     it always carries the REASON. A caller that gets `{ok:false}` has something to show the
     reader; a caller that got a bare `false` would have had to invent one. */
  function availability(q) {
    q = q || {};
    var m = get(q.modelId);
    if (!m) return { ok: false, code: 'unknown_model' };
    if (q.role && m.roles.indexOf(q.role) < 0) return { ok: false, code: 'role_not_offered', model: m };
    if (!q.meta) return { ok: false, code: 'no_metadata', model: m };
    var vars = q.meta.variables || [], times = q.meta.validTimes || q.meta.valid_times || [];
    if (!times.length) return { ok: false, code: 'no_valid_times', model: m };
    if (q.variable) {
      var want = atLevel(q.variable, q.level);
      if (!has(vars, want)) {
        return { ok: false, code: q.level ? 'no_such_level' : 'no_such_variable',
                 model: m, variable: want, levels: levels(vars) };
      }
    }
    if (q.lat != null && q.lon != null) {
      var c = covers(coverage(q.grid), q.lat, q.lon);
      if (c === false) return { ok: false, code: 'outside_coverage', model: m, box: coverage(q.grid) };
    }
    if (q.at != null) {
      var s = spanOf(times);
      /* half a step of slack at each end so the last published hour is inside its own axis */
      if (s && (q.at < s[0] - 1800000 || q.at > s[1] + 1800000)) {
        return { ok: false, code: 'outside_forecast_window', model: m, span: s };
      }
    }
    return { ok: true, model: m };
  }

  /* ── provenance ──────────────────────────────────────────────────────────────────────
     ⚠ THE SAME OBJECT FOR THE MAP, THE PARTICLES, THE LEGEND AND THE POINT VALUE. #R356's
     rule is that what the reader is TOLD is derived from what is on the screen, never from
     what was asked for: a legend built from the request says GFS while the map is still
     ECMWF for as long as the load takes. So this is built from the DISPLAYED state and
     nowhere else — see `displayed()` in js/weather.js. */
  function provenance(o) {
    o = o || {};
    var m = get(o.modelId) || null;
    var vt = o.validTime || '', rt = o.referenceTime || '';
    var lead = (vt && rt) ? Math.round((ms(vt) - ms(rt)) / 3600000) : null;
    return {
      providerId: 'open-meteo',
      modelId: o.modelId || '',
      modelName: m ? m.nameKey : (o.modelId || ''),
      agency: m ? m.agency : '',
      licence: m ? m.licence : '',
      runTime: rt,
      validTime: vt,
      leadHours: lead,
      variable: o.variable || '',
      pressureLevel: o.level || null,
      nativeResolutionKm: m ? m.km : null,
      nativeCadence: o.cadence || '',
      sampledLatitude: o.lat == null ? null : o.lat,
      sampledLongitude: o.lon == null ? null : o.lon,
      sampledElevation: o.elevation == null ? null : o.elevation,
      sourceId: 'open-meteo-map-tiles'
    };
  }

  /* ── the colour-scale honesty probe ──────────────────────────────────────────────────
     `getColorScale(v)` is `lookup(v) ?? settings.temperature`, so a variable it does not
     know is INDISTINGUISHABLE from one it maps to temperature — unless you ask it about a
     variable that cannot exist and compare. That answer is exact rather than heuristic:
     it is the fallback branch itself. A caller that gets `true` for a field that is not a
     temperature has to supply its own scale, and `tests/r356-checks.test.mjs` requires it. */
  function usesFallbackScale(sdk, variable, scales) {
    if (!sdk || !sdk.getColorScale) return false;
    try {
      var nope = JSON.stringify(sdk.getColorScale(' __intmap_no_such_variable__', false, scales));
      return JSON.stringify(sdk.getColorScale(variable, false, scales)) === nope;
    } catch (_) { return false; }
  }

  window.IntMapWxModels = {
    HOST: HOST,
    all: all, get: get, ids: ids, defaultId: defaultId,
    baseUrl: baseUrl, metaUrl: metaUrl, fileUrl: fileUrl,
    coverage: coverage, covers: covers,
    levels: levels, atLevel: atLevel, has: has,
    nearestTime: nearestTime, span: spanOf, horizonHours: horizonHours,
    availability: availability, provenance: provenance,
    usesFallbackScale: usesFallbackScale,
    _ms: ms
  };
})();
