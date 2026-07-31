/* ============================================================================
 *  IntMap · ONE guarded weather/UV source — window.IntMapWx  (#R183)
 * ----------------------------------------------------------------------------
 *  「UV Indexとweatherのウィジェットが更新されない。」
 *
 *  MEASURED, not guessed. From the app's own origin, right now:
 *
 *      GET api.open-meteo.com/v1/forecast?…      → 429
 *          {"error":true,"reason":"Daily API request limit exceeded. Please try again tomorrow."}
 *      GET air-quality-api.open-meteo.com/…      → 200  (a SEPARATE quota)
 *      GET api.met.no/…/locationforecast/2.0/complete → 200, CORS-open, keyless
 *
 *  Open-Meteo's free quota is per IP AND per product host, and this app is a heavy consumer of the
 *  forecast host in particular (36 call sites; the widget board alone polls it every 3 minutes for
 *  weather + UV + sun). Once that quota is gone every one of those call sites keeps asking, so it
 *  can never recover inside the day, and the widgets that ask it are the ones that die. That is
 *  exactly the pair the report names: `weather` and `uv` read api.open-meteo.com; `aqi` reads the
 *  air-quality host and kept working.
 *
 *  And the failure was SILENT. js/widgets.js did `const j = await r.json()` with no `r.ok` test, so a
 *  429 error body parsed perfectly well, `j.current` came back undefined, and the card rendered
 *
 *      🌤 —          ← forever, with no hint that anything was wrong
 *
 *  which is what "更新されない" looks like from the outside. Reproduced in the browser before writing
 *  a line of this file.
 *
 *  ── Why a new module rather than a patch in js/widgets.js ──────────────────────────────────────
 *  #R72 already hit this exact defect in the point-weather popup and fixed it THERE — cache, MET
 *  Norway failover, honest error line (js/weather.js). The fix did not travel, because there was
 *  nothing for it to travel through: every caller wrote its own `fetch(...).then(r=>r.json())`. So
 *  the same bug was still sitting in the widget board eleven rounds later. One guarded client is the
 *  only shape that stops it coming back a third time, and js/weather.js now delegates to it instead
 *  of keeping a second copy of the MET mapping.
 *
 *  ── What this module adds beyond "try the other one" ──────────────────────────────────────────
 *  · A CIRCUIT BREAKER. A daily-limit 429 is not a transient error — it is a statement about the
 *    rest of the day. Retrying it is not just useless, it is what keeps the quota at zero. The
 *    breaker records the outage (localStorage, so a reload does not re-hammer it) and sends every
 *    caller straight to the fallback until the quota resets at 00:00 UTC. Other failures back off
 *    for 10 minutes instead, because those really are transient.
 *  · REQUEST COALESCING + a short TTL cache, keyed by URL. Five widgets sitting on the same
 *    coordinates used to be five requests every three minutes; they are now one.
 *  · HONEST UNITS. Open-Meteo's `uv_index` is all-sky. MET Norway publishes
 *    `ultraviolet_index_clear_sky`, which is a DIFFERENT quantity — an upper bound that ignores
 *    cloud. They are not interchangeable, so the fallback reports `uvClearSky` in its own field and
 *    the UI says which one it is showing. Standing instruction 4: no number may quietly change
 *    meaning because its source changed.
 *  · SUN TIMES WITH NO NETWORK AT ALL. Sunrise/sunset was a forecast-host request for something that
 *    is pure astronomy. It is computed here, so the sun widget can no longer be taken down by
 *    anyone's quota. Accuracy is stated where the function is, and it is the MEASURED figure
 *    (≤4.7 min against MET Norway's Sunrise 3.0 over 70 probes) rather than the "one minute" the
 *    textbook claims for the simplified equation of centre.
 *
 *  Sources & terms: Open-Meteo (CC-BY 4.0, keyless) and MET Norway Locationforecast 2.0
 *  (NLOD / CC-BY 4.0, keyless) — both already declared in js/reference-data.js and js/legal.js.
 * ==========================================================================*/
(function () {
  'use strict';

  var D2R = Math.PI / 180;

  /* ── the circuit breaker ──────────────────────────────────────────────────────────────────────
     `until` is an epoch ms. `daily` marks the kind of outage, because the two have very different
     right answers: a daily-limit 429 is over at the next UTC midnight (that is when Open-Meteo's
     counter rolls), anything else is probably over in ten minutes. */
  var BRKKEY = 'intmap_wx_breaker';
  var breaker = null;
  function _loadBreaker() {
    if (breaker) return breaker;
    try {
      var s = JSON.parse(localStorage.getItem(BRKKEY) || 'null');
      if (s && typeof s.until === 'number') breaker = s;
    } catch (_) {}
    if (!breaker) breaker = { until: 0, daily: false, reason: '' };
    return breaker;
  }
  function _saveBreaker() { try { localStorage.setItem(BRKKEY, JSON.stringify(breaker)); } catch (_) {} }
  function _nextUtcMidnight() {
    var n = new Date();
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1, 0, 0, 30);
  }
  function _trip(daily, reason) {
    _loadBreaker();
    breaker.until = daily ? _nextUtcMidnight() : (Date.now() + 10 * 60000);
    breaker.daily = !!daily;
    breaker.reason = String(reason || '');
    _saveBreaker();
  }
  function _open() { _loadBreaker(); return Date.now() < breaker.until; }   /* true = Open-Meteo is out */
  function _clear() { _loadBreaker(); if (breaker.until) { breaker.until = 0; breaker.daily = false; breaker.reason = ''; _saveBreaker(); } }

  /* ── guarded JSON ─────────────────────────────────────────────────────────────────────────────
     The whole defect in one function: an error body is still valid JSON. `r.ok` and Open-Meteo's own
     `{"error":true}` flag are both checked, so a caller can only ever receive real data or null. */
  var cache = {};        /* url -> {t, j} */
  var inflight = {};     /* url -> Promise */
  /* Is this URL actually Open-Meteo? Asked by HOST, not by substring. `url.indexOf('open-meteo.com')`
     also matches https://evil.example/?x=open-meteo.com, and the answer decides whether a circuit
     breaker trips for the rest of the day — CodeQL flagged the substring form
     (js/incomplete-url-substring-sanitization) and it was right to. Every Open-Meteo product lives on
     its own subdomain (api / air-quality-api / archive-api / marine-api / geocoding-api), so the test
     is the registrable domain plus a dot-boundary, never a bare `includes`. */
  function isOpenMeteo(url) {
    try {
      var h = new URL(url, (typeof location !== 'undefined' && location.href) || 'https://localhost/').hostname.toLowerCase();
      return h === 'open-meteo.com' || h.slice(-15) === '.open-meteo.com';
    } catch (_) { return false; }
  }
  function guardedJSON(url, ttlMs) {
    var ttl = (ttlMs == null) ? 300000 : ttlMs;
    var hit = cache[url];
    if (hit && (Date.now() - hit.t) < ttl) return Promise.resolve(hit.j);
    if (inflight[url]) return inflight[url];
    var p = fetch(url, { cache: 'no-store' }).then(function (r) {
      return r.text().then(function (txt) {
        var j = null;
        try { j = JSON.parse(txt); } catch (_) {}
        if (!r.ok || !j || j.error) {
          var reason = (j && j.reason) || ('HTTP ' + r.status);
          /* Open-Meteo says which kind of 429 it is, in prose. "Daily API request limit exceeded"
             is the one that lasts all day; "Minutely"/"Hourly" recover on their own. */
          if (isOpenMeteo(url)) _trip(r.status === 429 && /dai(ly|l)/i.test(reason), reason);
          return null;
        }
        if (isOpenMeteo(url)) _clear();
        cache[url] = { t: Date.now(), j: j };
        return j;
      });
    }).catch(function () { return null; }).then(function (v) { delete inflight[url]; return v; });
    inflight[url] = p;
    return p;
  }

  /* ── MET Norway → the Open-Meteo shape ────────────────────────────────────────────────────────
     Moved here from js/weather.js (#R72) so there is one copy. `complete` rather than `compact`
     because only `complete` carries ultraviolet_index_clear_sky, which is the whole reason the UV
     widget can survive an Open-Meteo outage. */
  var METSYM = {
    clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45,
    lightrain: 61, rain: 63, heavyrain: 65,
    lightrainshowers: 80, rainshowers: 81, heavyrainshowers: 82,
    lightsleet: 66, sleet: 67, heavysleet: 67,
    lightsleetshowers: 66, sleetshowers: 67, heavysleetshowers: 67,
    lightsnow: 71, snow: 73, heavysnow: 75,
    lightsnowshowers: 85, snowshowers: 85, heavysnowshowers: 86,
    rainandthunder: 95, heavyrainandthunder: 95, lightrainandthunder: 95,
    rainshowersandthunder: 95, heavyrainshowersandthunder: 96,
    snowandthunder: 95, sleetandthunder: 95
  };
  function metCode(sym) {
    if (!sym) return null;
    var k = String(sym).replace(/_(day|night|polartwilight)$/, '');
    return (METSYM[k] != null) ? METSYM[k] : 3;
  }
  function metNo(lat, lng) {
    var url = 'https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=' + lat.toFixed(3) + '&lon=' + lng.toFixed(3);
    /* MET asks callers to identify themselves with a User-Agent; a browser sets its own and will not
       let a page override it, so this is a plain fetch — the same call js/weather.js has been making
       since #R72. Their 20-minute cache guidance is honoured by the TTL below. */
    var hit = cache[url];
    if (hit && (Date.now() - hit.t) < 600000) return Promise.resolve(hit.j);
    if (inflight[url]) return inflight[url];
    var p = fetch(url).then(function (r) {
      if (!r.ok) return null;
      return r.json();
    }).then(function (j) {
      var ts = j && j.properties && j.properties.timeseries;
      if (!ts || !ts.length) return null;
      var d0 = ts[0].data, i0 = (d0.instant && d0.instant.details) || {};
      var nx1 = d0.next_1_hours, nx6 = d0.next_6_hours;
      var current = {
        time: ts[0].time,
        temperature_2m: i0.air_temperature,
        relative_humidity_2m: i0.relative_humidity,
        apparent_temperature: null,
        precipitation: (nx1 && nx1.details && nx1.details.precipitation_amount != null) ? nx1.details.precipitation_amount : null,
        weather_code: metCode((nx1 && nx1.summary && nx1.summary.symbol_code) || (nx6 && nx6.summary && nx6.summary.symbol_code)),
        wind_speed_10m: (i0.wind_speed != null) ? i0.wind_speed * 3.6 : null,   /* m/s → km/h, Open-Meteo's default unit */
        wind_direction_10m: i0.wind_from_direction,
        surface_pressure: i0.air_pressure_at_sea_level,
        /* NOT `uv_index`. MET publishes the CLEAR-SKY index, which ignores cloud and is therefore an
           upper bound on the all-sky number Open-Meteo returns. Putting it in the same field would
           silently change what the widget's number means. */
        uv_index: null,
        uv_index_clear_sky: i0.ultraviolet_index_clear_sky
      };
      var days = {};
      ts.forEach(function (e) {
        try {
          /* Bucket by the LOCAL day at this meridian, not by the UTC date in the timestamp. MET
             stamps everything in UTC, so a UTC-date bucket cuts Tokyo's day at 09:00 local and the
             "daily maximum" it produced was the max over whatever fragment happened to be left —
             measured: a single hour, which is how a UV "max" came back exactly equal to the current
             reading. Open-Meteo's own daily fields are already local-day aggregates, so bucketing
             this way is also what keeps the two sources returning the same KIND of number. */
          var dt = new Date(new Date(e.time).getTime() + lng / 15 * 3600000).toISOString().slice(0, 10);
          var t2 = e.data.instant.details.air_temperature;
          var uvh = e.data.instant.details.ultraviolet_index_clear_sky;
          if (t2 == null) return;
          var d = days[dt] || (days[dt] = { mx: -99, mn: 99, sym: null, uv: null });
          if (t2 > d.mx) d.mx = t2;
          if (t2 < d.mn) d.mn = t2;
          if (uvh != null && (d.uv == null || uvh > d.uv)) d.uv = uvh;
          var hh = +new Date(new Date(e.time).getTime() + lng / 15 * 3600000).toISOString().slice(11, 13);
          if (hh >= 11 && hh <= 14 && !d.sym) {
            d.sym = metCode((e.data.next_6_hours && e.data.next_6_hours.summary && e.data.next_6_hours.summary.symbol_code) ||
                            (e.data.next_1_hours && e.data.next_1_hours.summary && e.data.next_1_hours.summary.symbol_code));
          }
        } catch (_) {}
      });
      var keys = Object.keys(days).sort().slice(0, 5);
      var daily = {
        time: keys,
        weather_code: keys.map(function (k) { return days[k].sym != null ? days[k].sym : 3; }),
        temperature_2m_max: keys.map(function (k) { return days[k].mx; }),
        temperature_2m_min: keys.map(function (k) { return days[k].mn; }),
        uv_index_max: keys.map(function () { return null; }),
        uv_index_clear_sky_max: keys.map(function (k) { return days[k].uv; }),
        /* MET's series starts at the CURRENT hour and only runs forward, so the first bucket covers
           the rest of today rather than all of it. Open-Meteo's daily block covers the whole day.
           The flag exists so the UI can say "peak ahead" instead of "today's max" and be telling the
           truth in both cases — the same discipline as uv_index vs uv_index_clear_sky above. */
        _partialFirstDay: true
      };
      var out = { current: current, daily: daily, _src: 'MET Norway' };
      cache[url] = { t: Date.now(), j: out };
      return out;
    }).catch(function () { return null; }).then(function (v) { delete inflight[url]; return v; });
    inflight[url] = p;
    return p;
  }

  /* ── the one call every widget/panel makes ────────────────────────────────────────────────────
     Returns the Open-Meteo shape with a `_src` stamp, or null when BOTH sources failed. Never a
     half-filled skeleton — a caller that gets an object can trust its fields, and a caller that gets
     null must say so out loud. */
  function point(lat, lng, opt) {
    opt = opt || {};
    var days = Math.max(1, Math.min(7, opt.days || 1));
    var wantUV = opt.uv !== false;
    var cur = ['temperature_2m', 'weather_code', 'wind_speed_10m', 'wind_direction_10m', 'relative_humidity_2m', 'apparent_temperature', 'precipitation', 'surface_pressure', 'is_day'];
    var dly = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max', 'sunrise', 'sunset', 'daylight_duration'];
    if (wantUV) { cur.push('uv_index'); dly.push('uv_index_max'); }
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + (+lat).toFixed(3) + '&longitude=' + (+lng).toFixed(3) +
      '&current=' + cur.join(',') + '&daily=' + dly.join(',') + '&forecast_days=' + days + '&timezone=auto&wind_speed_unit=kmh';

    var viaMet = function () {
      return metNo(+lat, +lng).then(function (m) { return m || null; });
    };
    /* Breaker open → do not even ask. This is the line that lets the quota recover. */
    if (_open()) return viaMet();
    return guardedJSON(url, opt.ttl == null ? 300000 : opt.ttl).then(function (j) {
      if (j && j.current && j.current.temperature_2m != null) {
        j._src = 'Open-Meteo';
        if (j.current.uv_index_clear_sky === undefined) j.current.uv_index_clear_sky = null;
        return j;
      }
      return viaMet();
    });
  }

  /* ── sunrise / sunset, computed ───────────────────────────────────────────────────────────────
     The standard sunrise equation (mean solar noon → equation of centre → declination → hour angle
     at −0.833°, which is the refraction + solar-radius correction). It cannot be rate-limited, be
     offline, or cost a request. Returns UTC Date objects, or a `polar` verdict where the sun does
     not cross the horizon at all that day.

     WHICH DAY — the part that is not in the textbook and cost two wrong versions before this one.
     The equation answers for the SOLAR day nearest an instant, and a widget is asked about the CIVIL
     day on the user's clock. Those are not the same near midnight, and they are hours apart wherever
     a country's timezone does not match its longitude (Iceland at −22° on UTC; Alaska at −150° on
     −8; China). Anchoring on "now" put Tokyo a day behind — caught live in the browser, not in
     review. Anchoring on the UTC date failed the same way. The anchor is therefore 12:00 mean solar
     time at this meridian ON THE CALLER'S CIVIL DATE: exactly 12 h from either midnight, so the
     solar-cycle rounding below can never straddle a day, and the answer is about the day the user
     is actually living in.

     ACCURACY, MEASURED against MET Norway's Sunrise 3.0 API (the authority — the reference values I
     first wrote from memory were out by up to 12 minutes, which is why none of them are in this
     file). 10 cities × 7 dates spanning both solstices, both equinoxes and four seasons:

         probes 70 · wrong day 0 · worst error 4.7 min (Reykjavik, 31 Jul)

     The worst case is the one to expect: near the midnight sun the sun crosses the horizon at a
     grazing angle, so a small angular error becomes minutes of time. Everywhere else it is ≤3 min.
     Polar day/night verified separately at Svalbard (78.2°N) for 31 Jul and 21 Dec. */
  function sunTimes(lat, lng, when) {
    var a = when ? new Date(when) : new Date();
    /* the calendar date on the caller's own clock — getFullYear/Month/Date are browser-local */
    var anchor = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate(), 12) - lng / 15 * 3600000;
    var J = anchor / 86400000 + 2440587.5;
    var n = Math.round(J - 2451545.0 - 0.0009 + lng / 360);
    var Jstar = 2451545.0 + 0.0009 - lng / 360 + n;
    var M = (357.5291 + 0.98560028 * (Jstar - 2451545.0)) % 360;
    var Mr = M * D2R;
    var C = 1.9148 * Math.sin(Mr) + 0.0200 * Math.sin(2 * Mr) + 0.0003 * Math.sin(3 * Mr);
    var L = (M + C + 180 + 102.9372) % 360;
    var Lr = L * D2R;
    var Jtransit = Jstar + 0.0053 * Math.sin(Mr) - 0.0069 * Math.sin(2 * Lr);
    var sinDec = Math.sin(Lr) * Math.sin(23.4397 * D2R);
    var cosDec = Math.cos(Math.asin(sinDec));
    var latR = lat * D2R;
    var cosW = (Math.sin(-0.833 * D2R) - Math.sin(latR) * sinDec) / (Math.cos(latR) * cosDec);
    var toDate = function (jd) { return new Date((jd - 2440587.5) * 86400000); };
    if (cosW > 1) return { polar: 'night', transit: toDate(Jtransit), daylightSec: 0 };
    if (cosW < -1) return { polar: 'day', transit: toDate(Jtransit), daylightSec: 86400 };
    var w = Math.acos(cosW) / D2R;
    var Jrise = Jtransit - w / 360, Jset = Jtransit + w / 360;
    return { sunrise: toDate(Jrise), sunset: toDate(Jset), transit: toDate(Jtransit), daylightSec: (Jset - Jrise) * 86400 };
  }

  window.IntMapWx = {
    point: point,
    guardedJSON: guardedJSON,
    metNo: metNo,
    sunTimes: sunTimes,
    /* Diagnostics — Atlas, the tests and the widget's own "why is this a dash" line read these
       instead of guessing. `down` is the app's honest answer to "is the weather service reachable". */
    status: function () {
      _loadBreaker();
      return { down: _open(), daily: !!breaker.daily, until: breaker.until, reason: breaker.reason };
    },
    /* test seam — never called by the app */
    _reset: function () { cache = {}; inflight = {}; breaker = { until: 0, daily: false, reason: '' }; _saveBreaker(); }
  };
})();
