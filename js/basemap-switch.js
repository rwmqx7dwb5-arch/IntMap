/* ============================================================================
 *  IntMap · THE PHONE'S BASE-MAP SQUARE — window.IntMapBasemapSwitch   (#R231)
 * ----------------------------------------------------------------------------
 *  「モバイル版ではMap / Satellite / Globe / Flat / ⛰️3D の選択欄をレイヤー選択欄から分離し、画面左上
 *    （モバイルの地名検索ボタンの真下に、左上方向に詰めて配置。）に四角いものを作り、そこから操作でき
 *    るように。その四角（正方形）は白枠で、内部はマップの画像。大きさはモバイル版の地名検索ボタンや
 *    方位磁針の一回り大きいぐらいに。」
 *
 *  ══ WHAT IT REPLACES ════════════════════════════════════════════════════════════════════════════
 *  Those five controls were `.m-seg-block` — two segmented rows at the top of the Map & layers sheet,
 *  above the layer list. Reaching Satellite therefore meant opening a sheet that covers 82 % of the
 *  screen, scrolling past nothing, tapping, and dismissing it. They are now one square under the
 *  place-search FAB, and the layer sheet is the layer list — which is what 分離 means.
 *
 *  ⚠ THE FIVE BUTTONS IN THE POPOVER CARRY THE SAME `data-proxy` IDS THE SEGMENTS DID. Nothing in the
 *  app learned a new route: js/mobile-ui.js's `proxy()` and `syncControls()` already drive and mirror
 *  any `[data-proxy]` inside the mobile chrome, so the real controls in `.map-controls-top` remain the
 *  single owners of what "Satellite" or "3D" MEANS, exactly as before.
 *
 *  ══ WHAT IS INSIDE THE SQUARE ═══════════════════════════════════════════════════════════════════
 *  「内部はマップの画像」, and specifically the picture of the face you would SWITCH TO — satellite
 *  imagery while you are on the map, the map while you are on satellite. Both are drawn here, on a
 *  canvas, out of data this app already ships and has already decoded:
 *
 *    · the satellite face  → data/world-basemap.jpg via window.IntMapWorldBase.tile(z,x,y): NASA Blue
 *      Marble, the same picture that is the floor under the real Esri tiles (#R186). It is a genuine
 *      Web-Mercator tile of WHERE THE CAMERA IS, not a stock thumbnail.
 *    · the map face        → data/land-mask.png via window.IntMapLandMask.isLand(lng,lat): the 1-bit
 *      2048 × 1024 land raster (#R192), painted in the base map's own land/water tones.
 *
 *  ⚠ NO NETWORK, EVER. Both sources are bundled and both are already warmed by the app for their own
 *  reasons, so the square costs one 54 px canvas and no request. That matters here specifically: this
 *  round's first instruction is that the phone is too slow, so a new control that fetched a tile —
 *  or that re-rendered every frame — would be taking with one hand what the round gives with the
 *  other. It redraws on `moveend` (debounced), on a base-map change, and never otherwise.
 *
 *  ⚠ AND THE ZOOM IS FIXED AT 4, NOT THE CAMERA'S. A 54 px thumbnail at the camera's own zoom is one
 *  flat colour as soon as you are inside a city — it would stop being "a map image" exactly when the
 *  user is looking at a map. z4 is ~2,500 km across the square, so both faces always show coastline.
 * ==========================================================================*/
window.IntMapModules = window.IntMapModules || {};

window.IntMapBasemapSwitch = (function () {
  'use strict';

  var SIZE = 54;                       /* CSS px — matches .bm-square in css/intmap.css */
  var THUMB_Z = 4;                     /* the fixed zoom the thumbnail is drawn at (see the header) */
  var _GE = function () { return window.IntMapGeoEngine; };
  function _cam() { try { var E = _GE(); return (E && E.camera) ? E.camera : null; } catch (_) { return null; } }

  /* the base map's own tones, so the "map" face is this app's map and not a generic one.
     Taken from the vector style's land/water fills; the dark pair is the dark-map variant. */
  var TONE = {
    light: { land: '#e9e5dd', sea: '#a9cfe8', coast: 'rgba(120,120,120,0.35)' },
    dark: { land: '#2a2b2e', sea: '#12324a', coast: 'rgba(180,180,180,0.22)' }
  };
  function tones() {
    var dark = false;
    try { dark = document.documentElement.getAttribute('data-theme') === 'dark'; } catch (_) { }
    return dark ? TONE.dark : TONE.light;
  }

  /* ── the two faces ──────────────────────────────────────────────────────────────────────────── */

  /* Mercator helpers, in the same form js/world-base.js uses them. */
  function tileOf(lng, lat, z) {
    var n = Math.pow(2, z);
    var x = (lng + 180) / 360 * n;
    var s = Math.sin(Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180);
    var y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
    return { x: x, y: y, n: n };
  }
  var latOf = function (my) { return Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180 / Math.PI; };

  /* SATELLITE FACE — one Blue Marble tile, cropped to the square around the camera's centre.
     ⚠ `IntMapWorldBase.tile` HAD TO BE PUBLISHED FOR THIS (#R231). It was an internal function,
     reachable only through the registered tile protocol, so this call was `undefined` and the face
     fell through to the map one — the picture was wrong and nothing said so. `_satFail` records the
     reason now, and `state()` reports it, so the same silence cannot happen again. */
  var _satFail = null;
  function drawSat(g, px, lng, lat) {
    var WB = window.IntMapWorldBase;
    if (!WB || typeof WB.tile !== 'function') { _satFail = 'IntMapWorldBase.tile unavailable'; return Promise.resolve(false); }
    var t = tileOf(lng, lat, THUMB_Z);
    return WB.tile(THUMB_Z, Math.floor(t.x), Math.floor(t.y)).then(function (im) {
      if (!im) { _satFail = 'tile() returned nothing'; return false; }
      _satFail = null;
      var iw = im.width || im.naturalWidth || 512;
      /* centre the crop on the exact sub-tile position, so the square tracks the camera smoothly
         rather than snapping a whole tile at a time */
      var fx = (t.x - Math.floor(t.x)) * iw, fy = (t.y - Math.floor(t.y)) * iw;
      var half = iw * 0.34;                                    /* ~2/3 of a tile fills the square */
      var sx = Math.max(0, Math.min(iw - 2 * half, fx - half));
      var sy = Math.max(0, Math.min(iw - 2 * half, fy - half));
      g.drawImage(im, sx, sy, 2 * half, 2 * half, 0, 0, px, px);
      try { if (im.close) im.close(); } catch (_) { }
      return true;
    }).catch(function (e) { _satFail = String((e && e.message) || e); return false; });
  }

  /* MAP FACE — the bundled land mask, in the base map's tones, over the same square of the world. */
  function drawMap(g, px, lng, lat) {
    var LM = window.IntMapLandMask;
    var T = tones();
    g.fillStyle = T.sea; g.fillRect(0, 0, px, px);
    if (!LM || !LM.ready || !LM.ready()) { try { LM && LM.warm && LM.warm(); } catch (_) { } return false; }
    var t = tileOf(lng, lat, THUMB_Z);
    var span = 0.68 / t.n;                                     /* the same 2/3-of-a-tile window */
    var mx0 = t.x / t.n - span / 2, my0 = t.y / t.n - span / 2;
    g.fillStyle = T.land;
    /* one cell per 2 device px is finer than the mask itself at this zoom (0.176° ≈ 19.5 km) */
    var step = 2, cells = Math.ceil(px / step);
    for (var j = 0; j < cells; j++) {
      var la = latOf(my0 + (j + 0.5) / cells * span);
      var runStart = -1;
      for (var i = 0; i <= cells; i++) {
        var land = false;
        if (i < cells) {
          var lo = (mx0 + (i + 0.5) / cells * span) * 360 - 180;
          land = LM.isLand(lo, la) === true;
        }
        if (land && runStart < 0) runStart = i;
        else if (!land && runStart >= 0) {
          g.fillRect(runStart * step, j * step, (i - runStart) * step, step);   /* one rect per run */
          runStart = -1;
        }
      }
    }
    return true;
  }

  /* ── the control ────────────────────────────────────────────────────────────────────────────── */

  var host = null, pop = null, cv = null, cap = null, drawTok = 0, pending = 0;

  /* Which face is on screen right now — read from the REAL control, which is the only owner of the
     answer (#R231 keeps js/app-body.js's `currentMapType` as the single source, via its button). */
  function satOn() {
    try { var b = document.getElementById('btn-view-sat'); return !!(b && b.classList.contains('active')); }
    catch (_) { return false; }
  }

  /* ⚠ (#R165's rule) `getLang` IS A FUNCTION. The app reassigns the current language at runtime, so a
     captured value would freeze this control in whatever language it was built in. */
  var L = (window.IntMapLang && window.IntMapLang.pick) ? window.IntMapLang.pick(function () {
    try { return (window.IntMapI18N && window.IntMapI18N.lang()) || 'en'; } catch (_) { return 'en'; }
  }) : function (en) { return en; };

  function label(sat) {
    /* the word under the picture names what you would switch TO, like the picture does */
    return sat ? L('Map', '地図', 'Karte', 'Карта', 'Mapa') : L('Satellite', '衛星', 'Satellit', 'Спутник', 'Satélite');
  }

  function redraw() {
    if (!cv) return;
    var C = _cam(); if (!C) return;
    var lng = 0, lat = 20;
    try { var c = C.getCenter(); lng = c.lng; lat = c.lat; } catch (_) { }
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var px = Math.round(SIZE * dpr);
    if (cv.width !== px) { cv.width = px; cv.height = px; }
    var g = cv.getContext('2d', { alpha: false });
    if (!g) return;
    var tok = ++drawTok;
    var sat = satOn();
    if (cap) cap.textContent = label(sat);
    /* the FACE SHOWN IS THE OTHER ONE — 「切り替え先の絵」 */
    if (sat) { drawMap(g, px, lng, lat); }
    else {
      /* paint the sea tone first so the square is never empty while the picture decodes */
      var T = tones(); g.fillStyle = T.sea; g.fillRect(0, 0, px, px);
      drawSat(g, px, lng, lat).then(function (ok) {
        if (!ok && tok === drawTok) drawMap(g, px, lng, lat);        /* the honest fallback: our map */
      });
    }
  }
  function redrawSoon() {
    if (pending) return;
    pending = setTimeout(function () { pending = 0; redraw(); }, 260);
  }

  function closePop() { if (pop) pop.classList.remove('show'); }
  /* the two headings are re-read every time it opens, so a language change while it was shut lands */
  function relabel() {
    if (!pop) return;
    var a = pop.querySelector('#bm-h-type'), b = pop.querySelector('#bm-h-proj');
    if (a) a.textContent = L('Base map', 'ベースマップ', 'Basiskarte', 'Базовая карта', 'Mapa base');
    if (b) b.textContent = L('Projection', '投影', 'Projektion', 'Проекция', 'Proyección');
  }
  function togglePop() {
    if (!pop) return;
    if (pop.classList.contains('show')) { closePop(); return; }
    relabel();
    pop.classList.add('show');
    try { window._imSyncMobile && window._imSyncMobile(); } catch (_) { }
  }

  function buildPop() {
    var d = document.createElement('div');
    d.className = 'bm-pop'; d.id = 'bm-pop'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Base map');
    /* the SAME data-proxy ids the retired .m-seg-block carried — see the header */
    /* ⚠ The two headings go through L(…) rather than `data-i18n`, and the five buttons carry NO words
       at all — js/mobile-ui.js's syncControls() copies each one's label off the real control it
       proxies, which is how the sheet's segments were always labelled and is what keeps ONE owner of
       the word "Satellite" in this app. Every string here is a literal in this file; nothing is
       interpolated, so innerHTML carries no data. */
    d.innerHTML =
      '<div class="bm-pop-h" id="bm-h-type"></div>' +
      '<div class="bm-seg" id="bmseg-type" role="group">' +
      '<button class="m-seg-btn" type="button" data-proxy="btn-view-map">Map</button>' +
      '<button class="m-seg-btn" type="button" data-proxy="btn-view-sat">Satellite</button></div>' +
      '<div class="bm-pop-h" id="bm-h-proj"></div>' +
      '<div class="bm-seg" id="bmseg-proj" role="group">' +
      '<button class="m-seg-btn" type="button" data-proxy="btn-view-globe">Globe</button>' +
      '<button class="m-seg-btn" type="button" data-proxy="btn-view-flat">Flat</button>' +
      '<button class="m-seg-btn" type="button" data-proxy="btn-view-3d">3D</button></div>';
    document.body.appendChild(d);
    return d;
  }

  function build() {
    if (host) return;
    host = document.createElement('button');
    host.type = 'button'; host.className = 'bm-square'; host.id = 'bm-square';
    host.setAttribute('aria-label', 'Base map and projection');
    cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
    cap = document.createElement('span'); cap.className = 'bm-cap';
    host.appendChild(cv); host.appendChild(cap);
    document.body.appendChild(host);
    pop = buildPop();

    host.addEventListener('click', function (e) { e.stopPropagation(); togglePop(); });
    /* the popover's buttons go through the SAME proxy path the sheet's segments used */
    pop.querySelectorAll('[data-proxy]').forEach(function (b) {
      b.addEventListener('click', function () {
        var real = document.getElementById(b.getAttribute('data-proxy'));
        if (real) real.click();
        setTimeout(function () { try { window._imSyncMobile && window._imSyncMobile(); } catch (_) { } redraw(); }, 0);
      });
    });
    /* a tap anywhere else dismisses it (the map included — that is not a map tap, it is a dismiss) */
    document.addEventListener('click', function (e) {
      if (!pop || !pop.classList.contains('show')) return;
      if (pop.contains(e.target) || (host && host.contains(e.target))) return;
      closePop();
    }, true);

    try {
      var E = _GE();
      if (E && E.events) { E.events.on('moveend', redrawSoon); }
    } catch (_) { }
    /* The theme decides the map face's tones. There is no theme EVENT in this app — js/theme-sky.js
       writes `data-theme` on <html> and everything else reads it — so the attribute itself is what is
       watched. A MutationObserver on one attribute costs nothing and cannot miss a change the way a
       polling read would. */
    try {
      var mo = new MutationObserver(function () { redraw(); });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      host.__mo = mo;
    } catch (_) { }
    relabel();
    redraw();
  }

  function destroy() {
    if (!host) return;
    try { host.__mo && host.__mo.disconnect(); } catch (_) { }
    try { host.remove(); } catch (_) { }
    try { pop && pop.remove(); } catch (_) { }
    host = pop = cv = cap = null;
  }

  /* Built only on a phone, and rebuilt when the width crosses back — same contract as the FAB stack. */
  function sync() {
    var isM = false;
    try { isM = window.matchMedia('(max-width:768px)').matches; } catch (_) { }
    if (isM) build(); else destroy();
  }

  function install() {
    sync();
    try {
      var mq = window.matchMedia('(max-width:768px)');
      if (mq.addEventListener) mq.addEventListener('change', sync);
    } catch (_) { }
    window.addEventListener('orientationchange', function () { setTimeout(sync, 220); });
  }

  return {
    install: install, redraw: redraw, close: closePop, relabel: relabel,
    state: function () {
      return {
        mounted: !!host, popOpen: !!(pop && pop.classList.contains('show')),
        showing: satOn() ? 'map' : 'satellite',
        /* ⚠ null when the satellite face drew. A STRING here means the square is showing its map
           fallback where a photograph belongs — see the note above drawSat. */
        satFail: _satFail,
        proxies: pop ? Array.prototype.map.call(pop.querySelectorAll('[data-proxy]'), function (b) { return b.getAttribute('data-proxy'); }) : []
      };
    }
  };
})();

/* ⚠ NO `IntMapModules` FACTORY, DELIBERATELY. This module has no host to be given — it reads the two
   bundled data modules and the real view buttons, all of them globals — so a factory would be a
   wrapper around nothing, and `scripts/static-checks.mjs` is right to call one that nobody invokes a
   defect. It is checked the other way instead: `IntMapBasemapSwitch` is an EAGER global, so it is
   named in tests/prod-smoke.spec.js's MODULE_GLOBALS, where a file that failed to deploy shows up as
   a missing global rather than as a feature that quietly stopped existing. */
