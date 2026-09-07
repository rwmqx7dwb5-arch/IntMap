/* ============================================================================
 *  IntMap · HISTORICAL CITY NAMES — window.IntMapHistCities   (#R427)
 * ----------------------------------------------------------------------------
 *  「現在は国名ラベルに関してはChronosに対応していますが、都市名ラベルも同じ要領で対応する
 *    ように。ヴォルゴグラードなど。できる限り多くの、地名の変わった経験のある都市に対応して。
 *    江戸なんかも。数百以上に。」
 *
 *  The COUNTRY labels have travelled in time since #R94k: js/history.js `histId` swaps a country's
 *  name and flag for the era's, and js/time-borders.js draws them (imtb-lbl). This is the same idea
 *  one level down — Volgograd is Stalingrad in 1942, Tokyo is Edo in 1867, Saint Petersburg is
 *  Leningrad in 1960 — and the record is data/hist-cities.json, built from scripts/histcities/.
 *
 *  ══ ⚠⚠⚠ HOW A TILE LABEL IS RENAMED WITHOUT A SECOND LAYER ═════════════════════════════════════
 *  The settlement labels are OpenMapTiles features (`ofm-city`, source-layer `place`), so there is
 *  no property this app can write on them. The obvious answer — draw curated points on top and hide
 *  the tile's own — costs two things it should not: the label moves off the position the tile chose,
 *  and hiding the original still needs a name match, so the hard part is not avoided.
 *
 *  ⚠ SO THE LAYER'S OWN `text-field` IS REWRITTEN. The expression this file builds is a `match` on
 *  the feature's name whose default is the ordinary language expression, so a city in the table is
 *  drawn with its era name AT THE TILE'S OWN POSITION, with the tile's own collision behaviour and
 *  zoom ladder, and every other label on Earth is completely untouched. A `match` compiles to a hash
 *  lookup, so the cost does not grow with the size of the table.
 *
 *  ⚠ TWO MATCHES, NESTED, because the tile may carry the spelling in either field: `name:en` is
 *  tried first and `name` (the local form) second. Every key of a city is in BOTH, and
 *  scripts/build-hist-cities.mjs proves no two cities share a key — a `match` with a repeated label
 *  fails MapLibre's style validation outright («Branch labels must be unique»), which would make
 *  addLayer throw and take the whole label stack with it (#R211 measured exactly that).
 *
 *  ══ ⚠⚠⚠ AND A SPELLING IS NOT AN IDENTITY (#R521) ══════════════════════════════════════════════
 *  Until #R521 the match above WAS the whole rule, and a reader travelling to 1950 watched 高知市
 *  become コーチン. The row is correct — Kochi in Kerala was Cochin until 1996 — and so was every
 *  gate: the expression simply had nothing in it that could tell one Kochi from another, so every
 *  city on Earth sharing a spelling with one of the record's thousand-odd keys was in scope. Kirov in
 *  Kaluga oblast would have become Vyatka; Linden, New Jersey would have become Mackenzie.
 *
 *  ⚠ SO EVERY BRANCH IS NOW GUARDED BY POSITION. The value of a branch is not the era name but a
 *  `case`: take the era name only if MapLibre's `distance` expression puts this feature within the
 *  row's guard radius of the row's coordinate, and otherwise fall through to the label the tile
 *  would have had. The radius is not typed by hand — scripts/build-hist-cities.mjs derives it as
 *  half the distance to the nearest settlement on Earth answering to the same spelling under its
 *  own name, capped at 20 km — so no row can be given a radius that reaches its own namesake.
 *
 *  ⚠ `distance` IS EVALUATED IN THE WORKER, WHERE THE GEOMETRY IS. Symbol layout calls
 *  `getValueAndResolveTokens('text-field', evaluationFeature, canonical, …)` with
 *  `evaluationFeature.geometry` already loaded, which is the one condition MapLibre's Distance
 *  expression needs; without geometry or a canonical tile id it returns NaN, and `['<=', NaN, r]`
 *  is false — so the failure direction is «the modern name», never «the wrong city's history».
 *
 *  ⚠ AND THE FALLTHROUGHS ARE `let` BINDINGS, not copies. A branch that fails its guard has to
 *  fall back to the OTHER match (and that one to the base expression), and writing those out per
 *  branch would repeat the base expression once per key inside one layout property. `['let', …]`
 *  binds each once; the branch says `['var', …]`.
 *
 *  ══ WHEN IT APPLIES ════════════════════════════════════════════════════════════════════════════
 *  Whenever the master clock is NOT live. ⚠ NOT gated on `IntMapTimeBorders.active()`, which is what
 *  the modern COUNTRY labels hide on: that flag is false for 2020 and later because CShapes ends in
 *  2019, and a city renamed in 2022 (Nur-Sultan → Astana) has nothing to do with the limits of a
 *  border dataset. A name is a fact about a year; this asks the clock about the year.
 *
 *  ⚠ AND ONLY ON `ofm-city`, whose filter is `class in [city, town]`. ⚠ (#R521) That filter used
 *  to be load-bearing — several rows' written exemptions rested on «a district of Madrid is not in
 *  this layer» — and it is not any more: the guard radius answers those cases by arithmetic, and
 *  scripts/build-hist-cities.mjs no longer accepts a reason of that shape. What the filter still
 *  buys is that `cities500`'s population floor of 500 is comfortably below anything OSM tags
 *  `place=city|town`, so the evidence covers what the layer draws.
 * ==========================================================================*/
window.IntMapHistCities = (function () {
  var data = null, loading = null, wired = false, failed = false;
  var cache = { key: null, expr: null };
  /* the nine language codes are js/lang-registry.js's own — the file carries all of them spelled
     out, so there is no fallback rule here that could drift from the one the build applied. */
  var say = function (n, lang) { return (n && (n[lang] || n.en)) || ''; };
  /* the two `let` bindings the guarded branches fall through to (#R521). Named, not inlined, so
     the expression is read the same way by this file and by the tests that walk it. */
  var VAR_BASE = 'imhcBase', VAR_LOCAL = 'imhcLocal';

  /* the clock's instant as the same YYYYMMDD integer the build wrote into `f` / `t` */
  function dnum(d) { return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); }
  function nameAt(city, d) {
    for (var i = 0; i < city.e.length; i++) {
      var e = city.e[i];
      if ((!e.f || d >= e.f) && (!e.t || d <= e.t)) return e.n;
    }
    return null;   /* outside every span → the modern label the tile already carries */
  }

  /* ── the file, fetched the first time the clock leaves «now» and never again ───────────────── */
  function ensure() {
    if (data || loading || failed) return loading;
    var base = document.baseURI || './';
    var url;
    try { url = new URL('data/hist-cities.json', base).href; } catch (_) { url = 'data/hist-cities.json'; }
    loading = fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      data = (j && Array.isArray(j.cities) && j.cities.length) ? j : null;
      if (!data) failed = true;
      loading = null;
      /* the labels were drawn while this was in flight — redraw them now that the table exists */
      if (data) { try { if (window.applyLabelLang) window.applyLabelLang(); } catch (_) {} }
      return data;
    }).catch(function () { failed = true; loading = null; return null; });
    return loading;
  }

  function traveling() {
    try { return !!(window.IntMapTime && !window.IntMapTime.isLive()); } catch (_) { return false; }
  }

  /* ── the era name of ONE place, for readers that are not the label layer ─────────────────────
     ⚠ (#R521) THE POSITION IS REQUIRED, for the reason the label expression now carries a guard:
     `at('Kochi')` cannot mean anything, because two cities answer to it and they are 6 900 km
     apart. A caller that knows a spelling but not where it is does not know which city it means,
     and this returns null rather than guessing. */
  function at(spelling, lon, lat, lang) {
    if (!data || !spelling || typeof lon !== 'number' || typeof lat !== 'number') return null;
    var d = traveling() ? dnum(window.IntMapTime.when()) : null;
    if (d == null) return null;
    for (var i = 0; i < data.cities.length; i++) {
      var c = data.cities[i];
      if (c.k.indexOf(spelling) < 0) continue;
      if (metres(lon, lat, c.lon, c.lat) > (c.g || 0)) continue;
      var n = nameAt(c, d);
      return n ? say(n, lang) : null;
    }
    return null;
  }

  /* great-circle metres. ⚠ NOT bit-identical to MapLibre's `distance`, which uses cheap-ruler's
     flat-earth approximation — the two agree to about a tenth of a percent, i.e. tens of metres on
     a 20 km guard, which is far inside the margin the build leaves. */
  function metres(aLon, aLat, bLon, bLat) {
    var R = Math.PI / 180;
    var dLat = (bLat - aLat) * R, dLon = (bLon - aLon) * R;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(aLat * R) * Math.cos(bLat * R) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  /* ── the `text-field` for js/place-labels.js ───────────────────────────────────────────────── */
  /* `base` is the ordinary language expression (a coalesce over the tile's own name:* keys). It is
     what BOTH matches and every guarded branch fall through to, so nothing outside the table
     changes and «not travelling» is simply the base expression handed straight back. */
  function textField(base, lang, mode) {
    if (!traveling()) return base;
    if (!data) { ensure(); return base; }
    /* ⚠ 'en' and 'local' are the reader's explicit 「英語で」/「現地表記で」 choices. Both take the
       English column, for the reason js/place-labels.js's sea gazetteer does (#R242): the record has
       no endonym column, and inventing one for 685 historical names would be a claim nothing here
       can support. A reader who asked for the local spelling of a name that no longer exists is
       asking for something the record does not hold. */
    var lg = (mode === 'en' || mode === 'local') ? 'en' : (lang || 'en');
    var d = dnum(window.IntMapTime.when());
    /* ⚠ THE BASE EXPRESSION IS PART OF THE KEY, not just the date and the language. `base` is what
       everything falls through to — the label every city outside the record gets — and it is rebuilt by
       the caller on every call. 'en' and 'local' both resolve to the English column above, so a
       reader switching 「英語で」→「現地表記で」 while travelling would hit a cache entry whose
       default was still the OTHER mode's expression, and every unlisted city on Earth would keep
       the wrong language until the year moved. */
    var key = d + '|' + lg + '|' + JSON.stringify(base);
    if (cache.key === key && cache.expr) return cache.expr;

    var byEn = ['match', ['coalesce', ['get', 'name:en'], '']];
    var byLocal = ['match', ['coalesce', ['get', 'name'], '']];
    var hits = 0;
    for (var i = 0; i < data.cities.length; i++) {
      var c = data.cities[i];
      var n = nameAt(c, d); if (!n) continue;
      var label = say(n, lg); if (!label) continue;
      /* ⚠ (#R521) THE BRANCH IS A QUESTION ABOUT THIS FEATURE'S POSITION, not a constant. Without
         it «Kochi» renames 高知市, and every other city on Earth that shares a spelling with a row.
         The failing side of the `case` is the OTHER match (or the base label), never a guess. */
      var near = ['<=', ['distance', { type: 'Point', coordinates: [c.lon, c.lat] }], c.g || 0];
      byEn.push(c.k, ['case', near, label, ['var', VAR_LOCAL]]);
      byLocal.push(c.k, ['case', near, label, ['var', VAR_BASE]]);
      hits++;
    }
    if (!hits) { cache = { key: key, expr: base }; return base; }
    byLocal.push(['var', VAR_BASE]);   /* nothing matched either field → the ordinary label */
    byEn.push(['var', VAR_LOCAL]);
    var expr = ['let', VAR_BASE, base, ['let', VAR_LOCAL, byLocal, byEn]];
    cache = { key: key, expr: expr };
    return expr;
  }

  /* ── the clock ─────────────────────────────────────────────────────────────────────────────── */
  /* ⚠ THE REDRAW IS THIS FILE'S JOB. `applyLabelLang` runs on styledata, on a language change and
     on the two label toggles — none of which fires when the year moves — so before this subscriber
     existed the era name would not have appeared until something else happened to repaint. */
  function wire() {
    if (wired) return; wired = true;
    try {
      window.IntMapTime.on(function (e) {
        cache = { key: null, expr: null };
        if (!e.isLive) ensure();
        try { if (window.applyLabelLang) window.applyLabelLang(); } catch (_) {}
      });
    } catch (_) {}
  }
  wire();

  return { textField: textField, at: at, ensure: ensure, ready: function () { return !!data; },
    count: function () { return data ? data.cities.length : 0; } };
})();
