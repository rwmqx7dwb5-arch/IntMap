/* ============================================================================
 *  CARTO basemaps — the key, the two URL builders, and the credit the terms buy.
 * ----------------------------------------------------------------------------
 *  (#R479) CARTO began requiring an API key on the raster (PNG) basemaps in August 2026.
 *  ⚠ UNKEYED TILES DO NOT FAIL. They come back HTTP 200 with an "API KEY REQUIRED" watermark
 *  burned into the picture, so no status check, error handler or console listener can notice —
 *  measured: dark_all/6/33/21.png is 200 both ways and only the pixels differ (bright pixels
 *  946 → 0). That is why the gate for this is a SPELLING ban in tests/r479-checks.test.mjs ②
 *  rather than anything measured at runtime.
 *
 *  ⚠ THE KEY IS PUBLIC ON PURPOSE, exactly like SUPABASE_ANON_KEY in src/vendor.js. A static
 *  site hands every tile URL to the visitor's browser, so no arrangement makes a basemap key
 *  secret; CARTO issues it against a declared domain but does not enforce a Referer (measured:
 *  a foreign Referer gets the same unwatermarked tile). Free to 5,000,000 tile requests a
 *  calendar month across raster and vector. Rotating it is the one line below and nothing else.
 *
 *  ⚠ THIS FILE IS DELIBERATELY NOT PART OF THE APP SHELL (tests/r168 #8 / tests/r350 ⑨c budget
 *  index.html + src/main.js + src/vendor.js + js/app-body.js + js/geo-engine.js +
 *  js/lazy-modules.js). The key, the builders and the credit are one self-contained concern, and
 *  keeping them here is also where the vector migration will land when CARTO retires raster.
 * ==========================================================================*/
(function () {
  window.CARTO_BASEMAP_KEY = 'cb1_2cll_1_fb3404d89ac6926cee468d89';
  /* the credit CARTO's terms require to stay visible wherever their basemap is drawn */
  window.CARTO_ATTRIBUTION = '\u00a9 CARTO \u00a9 OpenStreetMap';

  /* One concrete tile URL. `zxy` is either a renderer template ('{z}/{x}/{y}') or literal numbers
     ('4/8/5') — the layer previews build tiles by hand, the map lets the renderer fill them in. */
  window.cartoTileURL = function (style, zxy, opts) {
    opts = opts || {};
    var key = window.CARTO_BASEMAP_KEY;
    return 'https://' + (opts.host || 'a') + '.basemaps.cartocdn.com/' + style + '/' + zxy +
      (opts.hiDPI ? '@2x' : '') + '.png' + (key ? '?key=' + encodeURIComponent(key) : '');
  };

  /* The same tile as a `tiles` array, one entry per host alias. The a–d round-robin is #R7's
     throughput trick and the @2x is #R179's resolution fix; neither changes here. */
  window.cartoTiles = function (style, opts) {
    opts = opts || {};
    return (opts.hosts || ['a', 'b', 'c', 'd']).map(function (h) {
      return window.cartoTileURL(style, '{z}/{x}/{y}', { host: h, hiDPI: opts.hiDPI });
    });
  };

  /* ══ THE CREDIT FOR WHAT IS ACTUALLY DRAWN ════════════════════════════════════════════════
     CARTO's terms make visible attribution the price of the free tier: it must be "prominent and
     conspicuous to Persons viewing each CARTO basemap". Until #R479 this app put CARTO and
     OpenStreetMap in the Sources modal only and turned the renderer's own credit off on BOTH
     engines (attributionControl:false in js/app-body.js, .cesium-widget-credits{display:none} in
     css/intmap.css) — so a reader looking at the map was shown no attribution at all.
     ⚠ IT NAMES THE BASE THAT IS ON. Printing "© CARTO" over Esri imagery would be a FALSE credit,
     which is worse than the omission it replaces.
     ⚠ IT READS THE BUTTON rather than taking an argument, so it has one source of truth and no
     caller can hand it a stale answer: js/app-body.js sets that class at the top of the same
     command that calls this at the bottom.
     ⚠ IT SURVIVES CAPTURE MODE deliberately. body.capture-mode hides the other HUD furniture
     (tests/r232), but a screenshot of the map is exactly the artefact the attribution has to
     travel with, so .map-credit is not in that rule. */
  window.IntMapCartoCredit = function () {
    try {
      var el = document.getElementById('map-credit');
      if (!el) return;
      var a = function (href, text) {
        return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
      };
      var sat = !!(document.getElementById('btn-view-sat') || {}).classList &&
        document.getElementById('btn-view-sat').classList.contains('active');
      el.innerHTML = sat
        ? '\u00a9 ' + a('https://www.esri.com/', 'Esri')
        : '\u00a9 ' + a('https://carto.com/attributions/', 'CARTO') +
          ' \u00a9 ' + a('https://www.openstreetmap.org/copyright', 'OpenStreetMap');
    } catch (_) { /* the map draws with or without the element */ }
  };

  /* paint it as soon as there is a document; js/app-body.js refreshes it on every base switch */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { window.IntMapCartoCredit(); });
  } else { window.IntMapCartoCredit(); }
})();
