/* ============================================================================
 *  IntMap · sources.html — the generated registry  (#R218)
 * ----------------------------------------------------------------------------
 *  The one part of that page which is not prose: the list of providers, grouped by subject and
 *  filterable. It reads `window.IntMapRefData.dataSources` — the SAME array the in-app Sources
 *  dialog reads, so there is no second copy of the registry to forget to update (#R212).
 *
 *  Moved out of sources.html this round for the reason stated at the top of that file: the page
 *  is a shell. The grouping regexes stay here rather than in the locale files because they match
 *  the REGISTRY's own text (English and Japanese), not the reader's language — a Spanish reader
 *  still needs 'earthquake' to land under 「地震・災害・警報」, and translating the patterns per
 *  language would make which group an entry lands in depend on who is looking at it.
 *  The group TITLES are per language and live in the locale files (`sources.groups`).
 *
 *  ⚠ The description shown for an entry is `use[lang]` with a fallback to `use.en` — the same
 *  per-key fallback js/page-i18n.js applies to the prose, so a source whose description has not
 *  been translated yet appears in English inside an otherwise translated page rather than
 *  vanishing. `jp` is the registry's key for Japanese (the app's own code); this page's code for
 *  the same language is `ja`, and the map below is the only place that difference exists.
 * ========================================================================== */
window.IntMapSourcesList = (function () {
  'use strict';

  /* which group an entry falls in, from its own text. Order matters: the first match wins. */
  var GROUPS = [
    ['base',    /(basemap|tile|terrain|elevation|dem|contour|bathym|地形|標高|基図|等高線|水深)/i],
    ['imagery', /(imagery|satellite image|gibs|sentinel|landsat|worldcover|night ?light|衛星画像|夜間光|土地被覆)/i],
    ['weather', /(weather|forecast|wind|climate|köppen|koppen|marine|tide|current|air quality|気象|風|気候|潮|海流|大気)/i],
    ['hazard',  /(earthquake|seismic|tsunami|volcan|warning|alert|hazard|gdacs|地震|津波|火山|警報|災害)/i],
    ['space',   /(satellite|tle|orbit|star|planet|ephemer|space|宇宙|衛星|恒星|惑星|天文)/i],
    ['econ',    /(world bank|gdp|population|energy|electric|trade|crop|統計|経済|人口|エネルギー|貿易|作物|収量)/i],
    ['geo',     /(natural earth|boundar|border|country|gazetteer|geonames|nominatim|place name|国境|境界|地名|国名)/i],
    ['transit', /(routing|osrm|valhalla|transit|motis|flight|aircraft|adsb|ais|vessel|railway|airport|経路|鉄道|航空|船)/i],
    ['news',    /(news|rss|wikipedia|wikidata|feed|ニュース|報道|百科)/i]
  ];
  var ORDER = GROUPS.map(function (g) { return g[0]; }).concat(['other']);

  /* ⚠ (#R246) THE REGISTRY NO LONGER CARRIES PROSE. Every language's description — English and
     Japanese included — is `sourceUse` in its own js/locales/pages.<code>.js, which is the file this
     page already loads for the language it is showing (plus English, always, as page-i18n's
     FALLBACK). js/reference-data.js is back to the name and the URL. */

  function classify(s) {
    var t = (s.n || '') + ' ' + useIn(s, 'en');
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i][1].test(t)) return GROUPS[i][0];
    return 'other';
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  /* ⚠ (#R246) ONE IMPLEMENTATION, and it is the registry's: js/reference-data.js `useText` already
     resolves a description with a per-KEY fallback to English — the same rule the prose above uses
     (js/page-i18n.js `pick`) — and the in-app Sources dialog calls exactly that. A copy here would be
     the same lookup in two places ([[intmap-recurring-lessons]] G). */
  function useText(s, lang) {
    try { return (s && s.n && window.IntMapRefData.useText(s.n, lang)) || ''; } catch (e) { return ''; }
  }
  var useIn = useText;

  var lang = 'en';

  function paint() {
    var host = document.getElementById('src-list');
    if (!host) return;
    var P = window.IntMapPageI18N;
    var list = [];
    try { list = (window.IntMapRefData && window.IntMapRefData.dataSources) || []; } catch (e) {}

    var cnt = document.getElementById('src-count');
    if (cnt) cnt.textContent = list.length ? (list.length + ' ' + P.pick('sources', 'entries')) : '';
    if (!list.length) { host.innerHTML = '<p class="pg-empty">' + esc(P.pick('sources', 'loadFail')) + '</p>'; return; }

    var input = document.getElementById('src-filter');
    var q = ((input && input.value) || '').trim().toLowerCase();

    var bins = Object.create(null);
    list.forEach(function (s) {
      var text = ((s.n || '') + ' ' + (s.u || '') + ' ' + useIn(s, 'en') + ' '
                + useText(s, lang)).toLowerCase();
      if (q && text.indexOf(q) < 0) return;
      var k = classify(s);
      (bins[k] = bins[k] || []).push(s);
    });

    var titles = P.pick('sources', 'groups') || {};
    var out = '';
    ORDER.forEach(function (k) {
      var rows = bins[k];
      if (!rows || !rows.length) return;
      out += '<h3 class="pg-grouph">' + esc(titles[k] || k) + '<span>' + rows.length + '</span></h3>';
      rows.sort(function (a, b) { return String(a.n).localeCompare(String(b.n)); });
      rows.forEach(function (s) {
        out += '<div class="pg-srcitem"><b>' + esc(s.n) + '</b>'
             + '<div class="pg-use">' + esc(useText(s, lang)) + '</div>'
             + '<a class="pg-u" href="' + esc(s.u) + '" target="_blank" rel="noopener">' + esc(s.u) + '</a></div>';
      });
    });
    host.innerHTML = out || ('<p class="pg-empty">' + esc(P.pick('sources', 'noMatch')) + '</p>');
  }

  /* the page re-renders its whole document on a language change, so the filter box is rebuilt
     each time — its VALUE is carried across so a reader who typed something does not lose it. */
  var kept = '';
  function render(code) {
    lang = window.IntMapPageI18N.normalise(code || 'en');
    var slot = document.getElementById('src-panel');
    if (!slot) return;
    var P = window.IntMapPageI18N;
    slot.innerHTML = '<input class="pg-filter" id="src-filter" type="search" spellcheck="false">'
                   + '<div id="src-list"><p class="pg-empty">' + esc(P.pick('sources', 'loading')) + '</p></div>';
    var input = document.getElementById('src-filter');
    if (input) {
      input.placeholder = P.pick('sources', 'filterPh');
      input.value = kept;
      input.addEventListener('input', function () { kept = input.value; paint(); });
    }
    paint();
  }

  return { render: render, classify: classify };
})();
