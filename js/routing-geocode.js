/* ============================================================================
 *  IntMap · PLACE SUGGESTIONS FOR A ROUTE — window.IntMapRouteGeocode   (#R291)
 * ----------------------------------------------------------------------------
 *  「検索結果を距離や人口だけで自動確定しないでください。」
 *  「曖昧な場合はユーザーへ候補を見せてください。」
 *
 *  ══ WHAT WAS WRONG WITH THE OLD `geo1()` ═══════════════════════════════════════════════════════
 *  It was not a search. It fetched five candidates, ran `_pickNear()` over them — nearest within
 *  300 km, else most populous — and RETURNED ONE, which the field then displayed as though the
 *  reader had chosen it. #R126 added that ranking to fix «Potsdam from a Germany view geocoded to
 *  Potsdam NY», and the ranking is right; what is wrong is that it is the LAST word. Two places
 *  with the same name and the same population, 40 km apart, are decided by a coin toss the reader
 *  never sees, and the only way to find out which one won was to look at the map afterwards.
 *
 *  So the ranking stays and stops being the answer: `suggest()` returns the ranked LIST, and
 *  nothing in this app confirms a place except a reader picking one, a map click, the current
 *  location, or a literal coordinate.
 *
 *  ══ THE FOUR SOURCES, AND WHY EACH ═════════════════════════════════════════════════════════════
 *   · a literal `lat, lng` — parsed here, never sent anywhere;
 *   · the curated Shinkansen station registry (#R125) — an EXACT name match, which is what stops
 *     「仙台駅」 resolving to a sushi restaurant called 仙太鮨;
 *   · Open-Meteo geocoding — populated places, with population and admin1, in the reader's language;
 *   · Nominatim — everything Open-Meteo has no row for: street addresses, stations, airports,
 *     ports and POIs.
 *  ⚠ NOMINATIM'S USAGE POLICY IS ONE REQUEST PER SECOND per application. `suggest()` is therefore
 *  debounced by its caller AND rate-limited here — (#R298) by WAITING for the next free slot rather
 *  than by returning an empty array, with at most one call ever queued — and identical queries are
 *  served from an LRU for 5 minutes. A reader typing 「東京駅」 costs at most one Nominatim call, not six.
 *
 *  ⚠ NO COORDINATE OF THE READER'S IS SENT ANYWHERE BY THIS FILE. The bias point (`near`) is used
 *  for RANKING, which happens after the response arrives — it is never a query parameter.
 * ==========================================================================*/
window.IntMapRouteGeocode = (function () {
  'use strict';

  var _lang = 'en';
  var L = window.IntMapLang.pick(function () { return _lang; });

  var R = 6371;
  function hav(a, b) {
    var dLat = (b[1] - a[1]) * Math.PI / 180, dLng = (b[0] - a[0]) * Math.PI / 180;
    var la1 = a[1] * Math.PI / 180, la2 = b[1] * Math.PI / 180;
    var h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(la1) * Math.cos(la2) * Math.pow(Math.sin(dLng / 2), 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /** 「35.68, 139.76」 — a coordinate is a place, and it never leaves the browser */
  function parseLatLng(q) {
    var m = String(q || '').match(/^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!m) return null;
    var lat = +m[1], lng = +m[2];
    if (!(isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return null;
    return { lng: lng, lat: lat, name: lat.toFixed(4) + ', ' + lng.toFixed(4), kind: 'coord', source: 'input' };
  }

  /* OSM's class/type vocabulary, and Open-Meteo's feature codes, mapped onto the six kinds the UI
     shows. A kind is what distinguishes two rows with the same name, so it is never guessed. */
  function kindOf(cls, type, code) {
    var s = String(type || '') + '|' + String(cls || '') + '|' + String(code || '');
    if (/railway|station|halt|tram_stop|RSTN|PRT?\b/i.test(s) && !/airport/i.test(s)) return 'station';
    if (/aerodrome|airport|AIRP/i.test(s)) return 'airport';
    if (/harbour|port|ferry_terminal|PRT/i.test(s)) return 'port';
    if (/house|building|address|residential|road|street|highway/i.test(s)) return 'address';
    if (/city|town|village|hamlet|municipality|suburb|PPL/i.test(s)) return 'city';
    if (/state|region|province|county|ADM/i.test(s)) return 'region';
    return 'place';
  }
  function kindLabel(kind) {
    return ({
      coord: L('Coordinates', '座標', 'Koordinaten', 'Координаты', 'Coordenadas'),
      station: L('Station', '駅', 'Bahnhof', 'Станция', 'Estación'),
      airport: L('Airport', '空港', 'Flughafen', 'Аэропорт', 'Aeropuerto'),
      port: L('Port', '港', 'Hafen', 'Порт', 'Puerto'),
      address: L('Address', '住所', 'Adresse', 'Адрес', 'Dirección'),
      city: L('City', '都市', 'Stadt', 'Город', 'Ciudad'),
      region: L('Region', '地域', 'Region', 'Регион', 'Región'),
      place: L('Place', '地点', 'Ort', 'Место', 'Lugar'),
      here: L('Current location', '現在地', 'Aktueller Standort', 'Текущее местоположение', 'Ubicación actual'),
      map: L('Point on the map', '地図上の地点', 'Punkt auf der Karte', 'Точка на карте', 'Punto en el mapa'),
      recent: L('Recent', '最近', 'Zuletzt', 'Недавние', 'Reciente'),
    })[kind] || kind;
  }

  /* ══ RANKING — the SAME rule #R126 measured, now applied to a list instead of to one answer ═════
     Near the reference point wins; among the far ones, the most populous wins. What changed is that
     ties no longer decide anything: the reader sees both rows, each labelled with the admin area and
     the distance that tells them apart. */
  function rank(cands, ref) {
    var out = (cands || []).map(function (c) {
      var d = (ref && isFinite(+c.lng)) ? hav(ref, [+c.lng, +c.lat]) : null;
      return { c: c, d: d };
    });
    out.sort(function (a, b) {
      var ax = (a.c.kind === 'coord' || a.c.exact) ? 0 : 1, bx = (b.c.kind === 'coord' || b.c.exact) ? 0 : 1;
      if (ax !== bx) return ax - bx;
      var an = (a.d != null && a.d <= 300) ? 0 : 1, bn = (b.d != null && b.d <= 300) ? 0 : 1;
      if (an !== bn) return an - bn;
      if (an === 0) return a.d - b.d;
      var ap = (b.c.pop || 0) - (a.c.pop || 0);
      if (ap) return ap;
      if (a.d != null && b.d != null) return a.d - b.d;
      return 0;
    });
    return out.map(function (x) { x.c.distKm = x.d; return x.c; });
  }

  /** two rows are the same place if they land within 300 m of each other AND share a name */
  function dedupe(list) {
    var out = [];
    list.forEach(function (c) {
      var same = out.find(function (o) {
        return String(o.name).toLowerCase() === String(c.name).toLowerCase()
          && hav([o.lng, o.lat], [c.lng, c.lat]) < 0.3;
      });
      if (!same) out.push(c); else if (!same.admin && c.admin) same.admin = c.admin;
    });
    return out;
  }

  /* ══ THE CACHE, AND THE ONE-A-SECOND FLOOR NOMINATIM ASKS FOR ═════════════════════════════════ */
  var cache = new Map(), CACHE_MS = 300000, CACHE_N = 60;
  var lastNominatim = 0, NOMINATIM_GAP_MS = 1100;
  function cacheGet(k) { var v = cache.get(k); if (!v) return null; if (Date.now() - v.t > CACHE_MS) { cache.delete(k); return null; } return v.v; }
  function cacheSet(k, v) { cache.set(k, { t: Date.now(), v: v }); if (cache.size > CACHE_N) cache.delete(cache.keys().next().value); }
  /* ══ ⚠⚠⚠ (#R298) THE FLOOR WAS DROPPING THE SEARCH, NOT DELAYING IT ═══════════════════════════
     「経路機能で、地点を入力する欄がくそ。ほぼ座標ぐらいしか対応していない。検索機能なし。」
     `nominatim()` opened with 「a request inside the window is dropped, not queued」 and returned an
     EMPTY ARRAY. A reader types a place, waits for the 240 ms debounce, and the one source that
     knows about stations, addresses and POIs answers 「[]」 because the PREVIOUS keystroke used the
     second — every keystroke after the first within 1.1 s searched Open-Meteo alone. The policy
     Nominatim publishes is «at most one request per second», which is a RATE, not a ban: `reverse()`
     three functions down has always honoured it by WAITING. So does the search now.
     ⚠ THE SLOT IS RESERVED SYNCHRONOUSLY, so two callers cannot both decide the window is free, and
     the queue is capped at ONE — a caller that would have to wait longer than the gap itself is
     still dropped, because by then the reader has typed something else. */
  function nominatimSlot() {
    var now = Date.now();
    var at = Math.max(now, lastNominatim + NOMINATIM_GAP_MS);
    if (at - now > NOMINATIM_GAP_MS) return -1;      /* one is already queued — this keystroke is stale */
    lastNominatim = at;
    return at - now;
  }
  function wait(ms) { return ms > 0 ? new Promise(function (r) { setTimeout(r, ms); }) : Promise.resolve(); }
  function abortError() { var e = new Error('aborted'); e.name = 'AbortError'; return e; }

  function jsonFetch(url, signal) {
    return fetch(url, { signal: signal }).then(function (r) { if (!r.ok) throw new Error('status ' + r.status); return r.json(); });
  }

  async function openMeteo(q, signal) {
    var url = 'https://geocoding-api.open-meteo.com/v1/search?count=8&name=' + encodeURIComponent(q)
      + '&language=' + encodeURIComponent(window.IntMapLang.locale(_lang, 'en').slice(0, 2));
    var j = await jsonFetch(url, signal);
    return ((j && j.results) || []).map(function (g) {
      return {
        lng: +g.longitude, lat: +g.latitude, name: g.name, pop: +g.population || 0,
        admin: [g.admin1, g.country].filter(Boolean).join(', '),
        country: g.country || '', kind: kindOf('', '', g.feature_code), source: 'open-meteo',
        id: 'om:' + g.id,
      };
    });
  }
  async function nominatim(q, signal) {
    var hold = nominatimSlot();
    if (hold < 0) throw new Error('rate_floor');                /* one is already queued — see nominatimSlot */
    if (hold) await wait(hold);                                 /* the policy floor is a RATE: wait for it */
    if (signal && signal.aborted) throw abortError();           /* the reader typed on while we waited */
    var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&accept-language='
      + encodeURIComponent(window.IntMapLang.locale(_lang, 'en')) + '&q=' + encodeURIComponent(q);
    var j = await jsonFetch(url, signal);
    return (j || []).map(function (x) {
      var a = x.address || {};
      var parts = String(x.display_name || '').split(',').map(function (s) { return s.trim(); });
      return {
        lng: +x.lon, lat: +x.lat, name: (x.name || parts[0] || q),
        admin: [a.city || a.town || a.village || a.county, a.state, a.country].filter(Boolean).join(', ') || parts.slice(1, 3).join(', '),
        country: a.country || '', pop: Math.round((+x.importance || 0) * 1e6),
        kind: kindOf(x.category || x.class, x.type), source: 'nominatim', id: 'osm:' + x.osm_type + x.osm_id,
      };
    });
  }

  /**
   * The suggestion list for a half-typed field. NEVER confirms anything.
   * @param {string} q          what the reader has typed
   * @param {object} o          {near:[lng,lat], lang, limit, signal}
   * @returns {Promise<{items:Array, error:string}>}
   */
  async function suggest(q, o) {
    o = o || {};
    if (o.lang) _lang = o.lang;
    q = String(q || '').trim();
    if (q.length < 1) return { items: [], error: '' };

    var ll = parseLatLng(q);
    if (ll) return { items: [ll], error: '' };

    /* ⚠ (#R298) THE SEPARATOR IS WRITTEN AS AN ESCAPE. It used to be a LITERAL NUL byte in the
       source — 0x00, not the two characters that spell the escape — which makes every byte-oriented
       tool classify this file as binary and skip it whole (ripgrep does, so a search of the
       repository for anything in here returned nothing at all). The key is the same string either way. */
    var key = _lang + '\u0000' + q.toLowerCase();
    var hit = cacheGet(key);
    if (hit) return { items: rank(hit.slice(), o.near).slice(0, o.limit || 8), error: '' };

    /* ⚠ `ran` COUNTS THE SOURCES THAT ACTUALLY REACHED THE NETWORK, which `tried` never did: a
       Nominatim call refused by the rate floor resolved to `[]` through the SUCCESS path, so
       「everything failed」 could not be told from 「nothing was asked」 — and a search that never
       happened printed 「該当する地点がありません」, a fact this file had not established. */
    var items = [], errs = 0, ran = 0;

    /* the exact station match first — it is local, free, and it is the row a reader typing a station
       name is looking for. `exact` pins it to the top of the ranking without hiding the others. */
    try {
      var st = window.IntMapRouting && window.IntMapRouting.stationLL && window.IntMapRouting.stationLL(q);
      if (st) items.push({ lng: st.lng, lat: st.lat, name: st.name, kind: 'station', source: 'registry', exact: true, id: 'jr:' + st.name });
    } catch (e) { /* the registry is optional */ }

    var settle = function (r) { ran++; return r; };
    var fail = function (e) {
      if (isAbort(e)) return [];                       /* the reader moved on — not a failure of the source */
      if (e && e.message === 'rate_floor') return [];  /* not asked, so it neither ran nor failed */
      ran++; errs++; return [];
    };
    var jobs = [openMeteo(q, o.signal).then(settle, fail)];
    if (longEnough(q)) jobs.push(nominatim(q, o.signal).then(settle, fail));

    var got = await Promise.all(jobs);
    got.forEach(function (arr) { items = items.concat(arr); });
    items = dedupe(items.filter(function (c) { return isFinite(+c.lng) && isFinite(+c.lat); }));
    if (items.length) cacheSet(key, items.slice());
    /* nothing found AND nothing that ran succeeded — the caller must say 「could not be reached」
       rather than 「no such place」, because no source ever got to answer the question. */
    var dead = !items.length && !(o.signal && o.signal.aborted) && (ran === 0 || errs === ran);
    return { items: rank(items, o.near).slice(0, o.limit || 8), error: dead ? 'provider_unavailable' : '' };
  }
  function isAbort(e) { return !!(e && (e.name === 'AbortError' || /abort/i.test(String(e.message || '')))); }
  /* ══ ⚠⚠ (#R298) 「LONG ENOUGH TO BE A REAL SEARCH」 IS NOT A NUMBER OF CHARACTERS ═══════════════
     The rule was `q.length >= 3`, written for a Latin query where three letters are the shortest
     thing worth sending. 「東京」 is TWO characters and 「堺」 is ONE — the two most common shapes a
     Japanese reader types — and neither one ever reached the source that knows about stations,
     addresses and POIs. What the rule is actually trying to exclude is a query too vague to mean a
     place, and in a logographic script one character already is a place name. So the floor is per
     SCRIPT: one character of CJK (or Hangul), three of anything else. */
  var CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\uac00-\ud7af]/;
  function longEnough(q) { return CJK_RE.test(q) ? q.length >= 1 : String(q).trim().length >= 3; }

  /* ══ REVERSE — what to call a point the reader picked on the map ══════════════════════════════
     Best-effort: the point is usable as a coordinate the instant it is clicked, and this only ever
     improves the LABEL. The caller checks the field has not moved on before applying it (#R126 §6.6). */
  async function reverse(lng, lat, o) {
    o = o || {};
    if (o.lang) _lang = o.lang;
    var url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language='
      + encodeURIComponent(window.IntMapLang.locale(_lang, 'en'))
      + '&lat=' + (+lat).toFixed(6) + '&lon=' + (+lng).toFixed(6);
    /* (#R298) the same reservation the search uses, so a reverse lookup and a suggestion cannot both
       decide the second is theirs. A label is worth waiting for, so this one never gives up its turn. */
    var hold = nominatimSlot();
    await wait(hold < 0 ? NOMINATIM_GAP_MS : hold);
    if (hold < 0) lastNominatim = Date.now();
    var j = await jsonFetch(url, o.signal);
    if (!j || !j.display_name) return null;
    var a = j.address || {};
    return {
      lng: +lng, lat: +lat, name: j.name || String(j.display_name).split(',').slice(0, 2).join(', ').trim(),
      admin: [a.city || a.town || a.village, a.state, a.country].filter(Boolean).join(', '),
      kind: kindOf(j.category || j.class, j.type), source: 'nominatim',
    };
  }

  /** the recent picks this session, newest first — offered before a reader has typed anything (§4.2) */
  var recents = [];
  function remember(p) {
    if (!p || !isFinite(+p.lng)) return;
    recents = recents.filter(function (r) { return !(Math.abs(r.lng - p.lng) < 1e-6 && Math.abs(r.lat - p.lat) < 1e-6); });
    recents.unshift({ lng: +p.lng, lat: +p.lat, name: p.name, admin: p.admin || '', kind: p.kind || 'place', source: 'recent' });
    if (recents.length > 8) recents.length = 8;
  }
  function recent() { return recents.map(function (r) { var c = Object.assign({}, r); c.kind = c.kind; return c; }); }

  return {
    suggest: suggest, reverse: reverse, rank: rank, dedupe: dedupe,
    parseLatLng: parseLatLng, kindOf: kindOf, kindLabel: kindLabel, longEnough: longEnough,
    remember: remember, recent: recent,
    setLang: function (l) { _lang = l || 'en'; },
    _cache: function () { return { size: cache.size }; },
    _hav: hav,
  };
})();
