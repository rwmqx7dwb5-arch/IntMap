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
 *  ⚠ TWO MATCHES, TRIED IN ORDER, because the tile may carry the spelling in either field: `name:en` is
 *  tried first and `name` (the local form) second. Every key of a city is in BOTH, and
 *  candidates sharing a spelling are grouped into ONE branch with a distance case per place.
 *  The build only admits shared spellings whose evidence-derived guards cannot overlap, so distant
 *  namesakes retain their histories without duplicate match labels or ambiguous identities.
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
 *  binds each once; the branch says `['var', …]`. The same goes for each group's guarded `case`:
 *  it is bound once and both matches refer to it (see `textField`).
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
  var data = null, loading = null, wired = false;
  var cache = { key: null, expr: null };
  /* the instants at which the set of spans the clock falls in can change — derived from `data`
     the first time a label is asked for (see `epochOf`) */
  var bounds = null;
  /* the nine language codes are js/lang-registry.js's own — the file carries all of them spelled
     out, so there is no fallback rule here that could drift from the one the build applied. */
  /* ⚠⚠⚠ (#R717) THE FALLBACK TO `en` IS NOW LOAD-BEARING, AND THAT IS THE POINT. The record used to
     ship a column for every language, filled where nobody had written the name by copying the
     English spelling — so this line almost never fell back, and the file asserted 67,622 names no
     source had written. The columns a clear attestation bit stood behind are gone; what a reader
     sees is unchanged, because a copy of `en` answered with `en` anyway. ⚠ So a missing column is
     ORDINARY here, not a defect — and `en` itself is the record's own spelling, which for 537 spans
     is in the script the source wrote it in (data/hist-cities.json's own `note` states the count). */
  var say = function (n, lang) { return (n && (n[lang] || n.en)) || ''; };
  /* the `let` bindings of the built expression (#R521): the ordinary label, the answer found through
     each of the tile's two name fields, and one per candidate group (`VAR_GROUP` + its index).
     Named, not inlined, so the expression is read the same way by this file and by the tests that
     walk it. */
  var VAR_BASE = 'imhcBase', VAR_EN = 'imhcEn', VAR_LOCAL = 'imhcLocal', VAR_GROUP = 'imhcG';

  /* the clock's instant as the same YYYYMMDD integer the build wrote into `f` / `t` */
  function dnum(d) { return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); }
  function nameAt(city, d) {
    for (var i = 0; i < city.e.length; i++) {
      var e = city.e[i];
      if ((!e.f || d >= e.f) && (!e.t || d <= e.t)) return e;
    }
    return null;   /* outside every span → the modern label the tile already carries */
  }

  /* ══ ⚠⚠⚠ THE EXPRESSION DEPENDS ON THE EPOCH, NOT ON THE DATE ═══════════════════════════════════
     The label table below is a pure function of WHICH spans contain the clock's instant: `nameAt`
     asks each span two integer questions, `d >= f` and `d <= t`, and nothing else about `d`. Those
     answers can only change at `f` (the first day a span is in force) and at `t + 1` (the first
     integer past its last day) — so between two consecutive such values every city's label is fixed,
     and the expression built for any date in that interval is the same expression, byte for byte.
     ⚠ This used to be keyed by the DATE (and the clock subscriber emptied it on every event), so every
     move of the clock rebuilt the ~1.2 MB expression (6–14 ms) and every redraw — one to six per move,
     measured 2026-09-26 — handed a new, equal object to MapLibre, which clones what it holds and
     deep-compares before deciding nothing changed (4–44 ms each, 22–95 ms at 4× CPU throttling).
     The build itself is unchanged; what changed is that a move that crosses no span boundary gets the
     SAME object back, and js/place-labels.js then does not write it at all.
     ⚠ A move that DOES cross one still costs one full parse, and leaving the present always crosses
     one. That cost is MapLibre's, per real change, and this key cannot remove it — what made it
     smaller is below: each group's guards written once (`textField`) and `{validate:false}` (`built`).
     Measured 2026-09-26 on 1916-07-01, the same page and machine, one real change: 1,207,908 bytes /
     7,954 `distance` → 874,655 bytes / 3,977, and 266–461 ms → 30–57 ms (1.2–1.6 s → 0.15–0.23 s at 4×).
     ⚠ The boundaries are read off the record, never typed: a new row adds its own edges. `t + 1` is
     an integer, not necessarily a calendar day (19661231 + 1 = 19661232) — that is intended, because
     the question being mirrored is the integer comparison `d <= t`, and no valid `d` lies between
     19661232 and 19670101. BCE instants are negative in the same encoding (`dnum`) and order the
     same way. */
  function boundaries(j) {
    var s = new Set();
    for (var i = 0; i < j.cities.length; i++) {
      var e = j.cities[i].e;
      for (var k = 0; k < e.length; k++) {
        if (e[k].f) s.add(e[k].f);
        if (e[k].t) s.add(e[k].t + 1);
      }
    }
    return Array.from(s).sort(function (a, b) { return a - b; });
  }
  /* the number of boundaries at or before `d` — two instants with the same count lie in the same
     interval, so every span answers them alike */
  function epochOf(d) {
    if (!bounds) bounds = boundaries(data);
    var lo = 0, hi = bounds.length;
    while (lo < hi) { var mid = (lo + hi) >>> 1; if (bounds[mid] <= d) lo = mid + 1; else hi = mid; }
    return lo;
  }

  /* An open start is missing evidence, not a claim extending to the clock's earliest year.
     Keep the attested name intact in the record and mark its uncertainty in every display path. */
  function displayName(era, lang) {
    var label = era && say(era.n, lang);
    return label ? label + (era.f ? '' : ' [?]') : '';
  }

  /* Cache a successful load; a failed request leaves the next clock/explicit request able to retry. */
  function ensure() {
    if (data) return Promise.resolve(data);
    if (loading) return loading;
    var base = document.baseURI || './';
    var url;
    try { url = new URL('data/hist-cities.json', base).href; } catch (_) { url = 'data/hist-cities.json'; }
    /* Publish the in-flight promise before fetch or redraw can re-enter this reader. */
    loading = Promise.resolve().then(function () { return fetch(url); }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      data = (j && Array.isArray(j.cities) && j.cities.length) ? j : null;
      bounds = null; cache = { key: null, expr: null };   /* both are derived from `data` */
      /* the labels were drawn while this was in flight — redraw them now that the table exists */
      if (data) { try { if (window.applyLabelLang) window.applyLabelLang(); } catch (_) {} }
      return data;
    }).catch(function () { return null; }).finally(function () { loading = null; });
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
    if (!data || !spelling || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    var d = traveling() ? dnum(window.IntMapTime.when()) : null;
    if (d == null) return null;
    for (var i = 0; i < data.cities.length; i++) {
      var c = data.cities[i];
      if (c.k.indexOf(spelling) < 0) continue;
      if (metres(lon, lat, c.lon, c.lat) > (c.g || 0)) continue;
      var n = nameAt(c, d);
      if (n) return displayName(n, lang);
    }
    return null;
  }

  function labelLanguage(lang, mode) { return (mode === 'en' || mode === 'local') ? 'en' : (lang || 'en'); }
  // A popup reads the same feature, spelling precedence and position guard as the text field.
  // A pointer position is not a settlement's identity, especially for a padded touch target.
  function forFeature(feature, lang, mode) {
    if (!feature || !feature.layer || feature.layer.id !== 'ofm-city') return null;
    var g = feature.geometry, p = feature.properties || {};
    if (!g || g.type !== 'Point' || !Array.isArray(g.coordinates)) return null;
    var lon = g.coordinates[0], lat = g.coordinates[1];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    var lg = labelLanguage(lang, mode);
    return at(p['name:en'], lon, lat, lg) || at(p.name, lon, lat, lg);
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
    var lg = labelLanguage(lang, mode);
    var d = dnum(window.IntMapTime.when());
    /* ⚠ THE BASE EXPRESSION IS PART OF THE KEY, not just the epoch and the language. `base` is what
       everything falls through to — the label every city outside the record gets — and it is rebuilt by
       the caller on every call. 'en' and 'local' both resolve to the English column above, so a
       reader switching 「英語で」→「現地表記で」 while travelling would hit a cache entry whose
       default was still the OTHER mode's expression, and every unlisted city on Earth would keep
       the wrong language until the year moved.
       ⚠ And the EPOCH, not the date (see `epochOf`): a hit returns the very object the last call
       returned, which is what lets js/place-labels.js skip the write altogether. */
    var key = epochOf(d) + '|' + lg + '|' + JSON.stringify(base);
    if (cache.key === key && cache.expr) return cache.expr;

    var byEn = ['match', ['coalesce', ['get', 'name:en'], '']];
    var byLocal = ['match', ['coalesce', ['get', 'name'], '']];
    var groupBindings = ['let'];
    var hits = 0, candidates = new Map();
    for (var i = 0; i < data.cities.length; i++) {
      var c = data.cities[i];
      var n = nameAt(c, d); if (!n) continue;
      var label = displayName(n, lg); if (!label) continue;
      /* ⚠ (#R521) THE BRANCH IS A QUESTION ABOUT THIS FEATURE'S POSITION, not a constant. Without
         it «Kochi» renames 高知市, and every other city on Earth that shares a spelling with a row.
         The failing side of the `case` is the OTHER match (or the base label), never a guess. */
      var near = ['<=', ['distance', { type: 'Point', coordinates: [c.lon, c.lat] }], c.g || 0];
      for (var j = 0; j < c.k.length; j++) {
        var spelling = c.k[j];
        if (!candidates.has(spelling)) candidates.set(spelling, []);
        candidates.get(spelling).push({ id: i, near: near, label: label });
      }
      hits++;
    }
    /* Group identical candidate lists too: ordinary cities still contribute one branch for
       all their spellings. Homonyms add distance cases, never duplicate match branch labels. */
    var groups = new Map();
    candidates.forEach(function (list, spelling) {
      var signature = list.map(function (v) { return v.id; }).join(',');
      if (!groups.has(signature)) groups.set(signature, { keys: [], list: list });
      groups.get(signature).keys.push(spelling);
    });
    /* ══ ⚠⚠ EACH GROUP'S GUARDS ARE WRITTEN ONCE, AND BOTH NAME FIELDS POINT AT THEM ══════════════
       The two matches used to carry their own copy of every group's `case` — on 1916-07-01, 3,977
       guarded candidates written twice, 7,954 `distance` conditions, all parsed by MapLibre on every
       real change. The `case` is now one `let` binding per group, and both matches answer with
       `['var', …]`. MapLibre's `var` evaluates its bound expression where it is used (Let / Var in
       @maplibre/maplibre-gl-style-spec evaluate lazily), so a feature still only asks the guards of
       the group its spelling selected.
       ⚠ The fall-through means what it meant: a group with no guard containing the feature answers
       '' (never a label — `displayName` is never empty for a candidate), the name:en answer wins when
       it is not '', then the local-name answer, then the ordinary label. */
    var gi = 0;
    groups.forEach(function (group) {
      var guarded = ['case'];
      group.list.forEach(function (v) { guarded.push(v.near, v.label); });
      guarded.push('');
      var name = VAR_GROUP + (gi++);
      groupBindings.push(name, guarded);
      byEn.push(group.keys, ['var', name]);
      byLocal.push(group.keys, ['var', name]);
    });
    if (!hits) { cache = { key: key, expr: base }; return base; }
    byEn.push('');     /* a spelling in neither table: nothing found through this field */
    byLocal.push('');
    groupBindings.push(['let', VAR_EN, byEn, VAR_LOCAL, byLocal,
      ['case', ['!=', ['var', VAR_EN], ''], ['var', VAR_EN],
        ['!=', ['var', VAR_LOCAL], ''], ['var', VAR_LOCAL],
        ['var', VAR_BASE]]]);
    var expr = ['let', VAR_BASE, base, groupBindings];
    cache = { key: key, expr: expr, built: true };
    return expr;
  }

  /* ── the clock ─────────────────────────────────────────────────────────────────────────────── */
  /* ⚠ THE REDRAW IS THIS FILE'S JOB. `applyLabelLang` runs on styledata, on a language change and
     on the two label toggles — none of which fires when the year moves — so before this subscriber
     existed the era name would not have appeared until something else happened to repaint.
     ⚠ It no longer empties the cache: the key already carries the epoch, and emptying it on every
     tick is what made a move inside one epoch rebuild — and rewrite — the whole expression. */
  function wire() {
    if (wired) return; wired = true;
    try {
      window.IntMapTime.on(function (e) {
        if (!e.isLive) ensure();
        try { if (window.applyLabelLang) window.applyLabelLang(); } catch (_) {}
      });
    } catch (_) {}
  }
  wire();

  /* ── is this the expression this file BUILT? ─────────────────────────────────────────────────
     True only for the era expression last handed out — not for the caller's own `base` handed back.
     js/place-labels.js asks, because this is the one `text-field` it writes with MapLibre's
     `{validate:false}`: every piece of it is generated here from a fixed shape, and that shape is
     run through the style validator itself (`validateStyleMin`) and MapLibre's own parser by
     tests/hist-city-label-epoch-checks.test.mjs, tests/r427-checks.test.mjs and others, at dates
     chosen from the record. Validation parses the expression (~0.9 MB on 1916-07-01) a second time on
     every real change — about half of what a change cost, measured — and what it would catch is
     caught there instead. */
  function built(expr) { return !!(expr && cache.built && expr === cache.expr); }

  return { textField: textField, built: built, at: at, forFeature: forFeature, ensure: ensure, ready: function () { return !!data; },
    count: function () { return data ? data.cities.length : 0; } };
})();
