/* ============================================================================
 *  IntMap · THE PHONE'S MAP SCREEN — window.IntMapBasemapSwitch   (#R231 → mobile-shell)
 * ----------------------------------------------------------------------------
 *  #R231 lifted the five view controls (Map / Satellite · Globe / Flat / 3D) out of the layer sheet into
 *  a white-framed square under the place-search button, «内部はマップの画像». mobile-shell rebuilt the
 *  phone as one sheet and one control group, so the square became the group's Map button and what it
 *  opened became a SCREEN of the sheet (js/mobile-sheet.js lends `#bm-pop` into it while it is open):
 *
 *    ① Base map — the two faces as PICTURES, each showing itself where the camera is, the one on screen
 *       ringed (the map-mode chooser of a map app). The pictures are the ones #R231 drew, from data the
 *       app already ships and has already decoded:
 *         · the satellite face → data/world-basemap.jpg via window.IntMapWorldBase.tile(z,x,y): NASA Blue
 *           Marble, the same picture that is the floor under the real Esri tiles (#R186);
 *         · the map face       → data/land-mask.png via window.IntMapLandMask.isLand(lng,lat), painted in
 *           the base map's own land/water tones.
 *    ② Projection — Globe / Flat / 3D, a segmented control.
 *    ③ Map display (基本表示 — place names, terrain labels, POI, borders, regions, roads, rail, day & night …),
 *       as iOS switches. It is NOT called a layer and it is NOT a second set of controls: the list is
 *       js/data-layers.js `IntMapBaseDisplay.items()` (the declarations of `kind: 'display'`, each with the
 *       name its row says NOW), and each switch toggles the real checkbox the way the layer tiles toggle
 *       theirs (checked + a bubbling `change`), so every reader of that box — the map, the session, the
 *       share link, Atlas — sees the reader's own press.
 *    ④ The centre readout — the crosshair and the line under the search field that says what is under
 *       it (js/mobile-map-input.js). It is no longer drawn over the map all the time; this switch keeps it.
 *
 *  ⚠ THE FIVE VIEW BUTTONS CARRY THE SAME `data-proxy` IDS THEY ALWAYS DID: js/mobile-ui.js's
 *  `syncControls()` mirrors `.active` onto every `[data-proxy]` in `#bm-pop`, and the real controls in
 *  `.map-controls-top` remain the single owners of what "Satellite" or "3D" MEANS.
 *
 *  ⚠ NO NETWORK, EVER, AND NO WORK WHILE IT IS SHUT. The pictures are drawn when the screen opens and on
 *  `moveend` WHILE it is open — the square redrew on every `moveend` of the session, seen or not.
 *  ⚠ AND THE ZOOM IS FIXED AT 4, NOT THE CAMERA'S: a thumbnail at the camera's own zoom is one flat
 *  colour inside a city. z4 is ~2,500 km across the picture, so both faces always show coastline.
 * ==========================================================================*/
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';
import { crosshairWanted, setCrosshairWanted } from './mobile-sheet.js';


window.IntMapBasemapSwitch = (function () {
  'use strict';

  var THUMB_Z = 4;                     /* the fixed zoom the pictures are drawn at (see the header) */
  var _GE = function () { return IntMapGeoEngine; };
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
  /* the window both faces show: 2/3 of a z4 tile across, the same height-to-width as the picture */
  var SPAN = 0.68;

  /* SATELLITE FACE — one Blue Marble tile, cropped around the camera's centre.
     ⚠ `IntMapWorldBase.tile` HAD TO BE PUBLISHED FOR THIS (#R231). It was an internal function, so this
     call was `undefined` and the face fell through to the map one — the picture was wrong and nothing
     said so. `_satFail` records the reason, and `state()` reports it. */
  var _satFail = null;
  function drawSat(g, pw, ph, lng, lat) {
    var WB = window.IntMapWorldBase;
    if (!WB || typeof WB.tile !== 'function') { _satFail = 'IntMapWorldBase.tile unavailable'; return Promise.resolve(false); }
    var t = tileOf(lng, lat, THUMB_Z);
    return WB.tile(THUMB_Z, Math.floor(t.x), Math.floor(t.y)).then(function (im) {
      if (!im) { _satFail = 'tile() returned nothing'; return false; }
      _satFail = null;
      var iw = im.width || im.naturalWidth || 512;
      /* centre the crop on the exact sub-tile position, so the picture tracks the camera smoothly */
      var fx = (t.x - Math.floor(t.x)) * iw, fy = (t.y - Math.floor(t.y)) * iw;
      var cw = iw * SPAN, ch = Math.min(iw, cw * ph / pw);
      var sx = Math.max(0, Math.min(iw - cw, fx - cw / 2));
      var sy = Math.max(0, Math.min(iw - ch, fy - ch / 2));
      g.drawImage(im, sx, sy, cw, ch, 0, 0, pw, ph);
      try { if (im.close) im.close(); } catch (_) { }
      return true;
    }).catch(function (e) { _satFail = String((e && e.message) || e); return false; });
  }

  /* MAP FACE — the bundled land mask, in the base map's tones, over the same window of the world. */
  function drawMap(g, pw, ph, lng, lat) {
    var LM = window.IntMapLandMask;
    var T = tones();
    g.fillStyle = T.sea; g.fillRect(0, 0, pw, ph);
    if (!LM || !LM.ready || !LM.ready()) { try { LM && LM.warm && LM.warm(); } catch (_) { } return false; }
    var t = tileOf(lng, lat, THUMB_Z);
    var spanX = SPAN / t.n, spanY = spanX * ph / pw;
    var mx0 = t.x / t.n - spanX / 2, my0 = t.y / t.n - spanY / 2;
    g.fillStyle = T.land;
    /* one cell per 2 device px is finer than the mask itself at this zoom (0.176° ≈ 19.5 km) */
    var step = 2, cx = Math.ceil(pw / step), cy = Math.ceil(ph / step);
    for (var j = 0; j < cy; j++) {
      var la = latOf(my0 + (j + 0.5) / cy * spanY);
      var runStart = -1;
      for (var i = 0; i <= cx; i++) {
        var land = false;
        if (i < cx) {
          var lo = (mx0 + (i + 0.5) / cx * spanX) * 360 - 180;
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

  /* ── the screen ─────────────────────────────────────────────────────────────────────────────── */

  var pop = null, faces = [], drawTok = 0, pending = 0, wired = false;

  /* Which face is on screen right now — read from the REAL control, the only owner of the answer. */
  function satOn() {
    try { var b = document.getElementById('btn-view-sat'); return !!(b && b.classList.contains('active')); }
    catch (_) { return false; }
  }
  function isOpen() { return !!(pop && pop.classList.contains('show')); }

  /* ⚠ (#R165's rule) `getLang` IS A FUNCTION. The app reassigns the current language at runtime, so a
     captured value would freeze this control in whatever language it was built in. */
  var L = (IntMapLang && IntMapLang.pick) ? IntMapLang.pick(function () {
    try { return (window.IntMapI18N && window.IntMapI18N.lang()) || 'en'; } catch (_) { return 'en'; }
  }) : function (en) { return en; };

  function redraw() {
    if (!pop || !isOpen()) return;
    var C = _cam(); if (!C) return;
    var lng = 0, lat = 20;
    try { var c = C.getCenter(); lng = c.lng; lat = c.lat; } catch (_) { }
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var tok = ++drawTok;
    faces.forEach(function (f) {
      var r = f.cv.getBoundingClientRect();
      var pw = Math.max(2, Math.round((r.width || 150) * dpr)), ph = Math.max(2, Math.round((r.height || 90) * dpr));
      if (f.cv.width !== pw || f.cv.height !== ph) { f.cv.width = pw; f.cv.height = ph; }
      var g = f.cv.getContext('2d', { alpha: false }); if (!g) return;
      if (f.face === 'map') { drawMap(g, pw, ph, lng, lat); return; }
      /* paint the sea tone first so the picture is never empty while it decodes */
      var T = tones(); g.fillStyle = T.sea; g.fillRect(0, 0, pw, ph);
      drawSat(g, pw, ph, lng, lat).then(function (ok) {
        if (!ok && tok === drawTok) drawMap(g, pw, ph, lng, lat);        /* the honest fallback: our map */
      });
    });
  }
  function redrawSoon() {
    if (pending || !isOpen()) return;
    pending = setTimeout(function () { pending = 0; redraw(); }, 260);
  }

  function closePop() { if (pop) pop.classList.remove('show'); }
  /* the headings are re-read every time it opens, so a language change while it was shut lands */
  function relabel() {
    if (!pop) return;
    var set = function (id, txt) { var e = pop.querySelector('#' + id); if (e && e.textContent !== txt) e.textContent = txt; };
    set('bm-title', L('Map', '地図', 'Karte', 'Карта', 'Mapa'));
    set('bm-h-type', L('Base map', 'ベースマップ', 'Basiskarte', 'Базовая карта', 'Mapa base'));
    set('bm-h-proj', L('Projection', '投影', 'Projektion', 'Проекция', 'Proyección'));
    set('bm-h-show', L('Map display', '基本表示'));
    set('bm-xh-t', L('Centre point readout', '中心点の読み取り'));
    set('bm-xh-s', L('Crosshair, coordinates, elevation and the layer value at the centre', '中心の十字線・座標・標高・レイヤーの値'));
    set('bm-done', L('Done', '完了'));
    pop.setAttribute('aria-label', L('Base map and projection', 'ベースマップと投影法', 'Basiskarte und Projektion', 'Базовая карта и проекция', 'Mapa base y proyección'));
    /* the face captions are the REAL buttons' words (one owner of the word "Satellite") */
    faces.forEach(function (f) { var real = document.getElementById(f.proxy); var t = real ? (real.textContent || '').trim() : ''; if (t && f.cap.textContent !== t) f.cap.textContent = t; });
  }
  /* ③ the map display, as its owner lists it now — names follow the language, states follow every route that
     switches them (Atlas, a share link, the layer panel), and an item the owner adds is a row here the next time */
  function displayItems() { try { var B = window.IntMapBaseDisplay; return (B && typeof B.items === 'function') ? B.items() : []; } catch (_) { return []; } }
  function syncRows() {
    if (!pop) return;
    var list = pop.querySelector('#bm-show'), items = displayItems(), seen = {};
    items.forEach(function (it) {
      seen[it.id] = 1;
      var sw = list.querySelector('.bm-sw[data-for="' + it.id + '"]');
      if (!sw) {
        var lab = document.createElement('label'); lab.className = 'bm-row';
        var t = document.createElement('span'); t.className = 'bm-row-t';
        sw = document.createElement('input'); sw.type = 'checkbox'; sw.className = 'bm-sw'; sw.setAttribute('data-for', it.id);
        sw.addEventListener('change', function () {
          var cb = document.getElementById(it.id); if (!cb) return;
          if (cb.checked !== sw.checked) { cb.checked = sw.checked; cb.dispatchEvent(new Event('change', { bubbles: true })); }
        });
        lab.appendChild(t); lab.appendChild(sw); list.appendChild(lab);
      }
      var tt = sw.parentNode.querySelector('.bm-row-t'); if (tt && tt.textContent !== it.label) tt.textContent = it.label;
      if (sw.checked !== !!it.on) sw.checked = !!it.on;
    });
    list.querySelectorAll('.bm-sw[data-for]').forEach(function (sw) { if (!seen[sw.getAttribute('data-for')]) sw.parentNode.remove(); });
    var head = pop.querySelector('#bm-h-show'); if (head) head.hidden = !items.length;
    var xh = pop.querySelector('#bm-xh'); if (xh) xh.checked = crosshairWanted();
  }
  function open() {
    if (!pop) return;
    relabel(); syncRows();
    pop.classList.add('show');
    try { window._imSyncMobile && window._imSyncMobile(); } catch (_) { }
    /* drawn after the sheet has laid it out, so the canvases have their size */
    requestAnimationFrame(function () { redraw(); });
  }
  function togglePop() { if (isOpen()) closePop(); else open(); }

  function build() {
    if (pop) return;
    var d = document.createElement('div');
    d.className = 'bm-pop'; d.id = 'bm-pop'; d.setAttribute('role', 'dialog');
    /* ⚠ Every string here is a literal in this file and nothing is interpolated, so innerHTML carries no
       data; the words are written by relabel() and the five view buttons carry the real controls' words
       (js/mobile-ui.js syncControls copies them), which keeps ONE owner of the word "Satellite". */
    d.innerHTML =
      '<div class="m-sheet-head"><span class="m-sheet-title" id="bm-title">Map</span><button class="m-sheet-done" id="bm-done" type="button">Done</button></div>' +
      '<div class="m-sheet-scroll">' +
      '<div class="bm-pop-h" id="bm-h-type"></div>' +
      '<div class="bm-faces" id="bmseg-type" role="group" aria-labelledby="bm-h-type">' +
      '<button class="bm-face" type="button" data-proxy="btn-view-map" data-face="map"><canvas aria-hidden="true"></canvas><span class="bm-cap">Map</span></button>' +
      '<button class="bm-face" type="button" data-proxy="btn-view-sat" data-face="sat"><canvas aria-hidden="true"></canvas><span class="bm-cap">Satellite</span></button></div>' +
      '<div class="bm-pop-h" id="bm-h-proj"></div>' +
      '<div class="bm-seg" id="bmseg-proj" role="group" aria-labelledby="bm-h-proj">' +
      '<button class="m-seg-btn" type="button" data-proxy="btn-view-globe">Globe</button>' +
      '<button class="m-seg-btn" type="button" data-proxy="btn-view-flat">Flat</button>' +
      '<button class="m-seg-btn" type="button" data-proxy="btn-view-3d">3D</button></div>' +
      '<div class="bm-pop-h" id="bm-h-show"></div>' +
      '<div class="bm-list" id="bm-show"></div>' +
      '<div class="bm-list"><label class="bm-row bm-row-2"><span class="bm-row-t"><span id="bm-xh-t">Centre point readout</span><small id="bm-xh-s"></small></span><input type="checkbox" class="bm-sw" id="bm-xh"></label></div>' +
      '</div>';
    var xh = d.querySelector('#bm-xh');
    xh.addEventListener('change', function () { setCrosshairWanted(xh.checked); });
    document.body.appendChild(d);
    pop = d;
    faces = Array.prototype.map.call(d.querySelectorAll('.bm-face'), function (b) {
      return { btn: b, cv: b.querySelector('canvas'), cap: b.querySelector('.bm-cap'), face: b.getAttribute('data-face'), proxy: b.getAttribute('data-proxy') };
    });
    d.querySelector('#bm-done').addEventListener('click', closePop);
    /* the view buttons go through the SAME proxy path the sheet's segments use */
    d.querySelectorAll('[data-proxy]').forEach(function (b) {
      b.addEventListener('click', function () {
        var real = document.getElementById(b.getAttribute('data-proxy'));
        if (real) real.click();
        setTimeout(function () { try { window._imSyncMobile && window._imSyncMobile(); } catch (_) { } redraw(); }, 0);
      });
    });
    /* a switch flipped anywhere else — the layer panel, Atlas, a share link — reaches this list */
    document.addEventListener('change', function (e) { var t = e.target; if (isOpen() && t && t.id && t.type === 'checkbox' && pop.querySelector('.bm-sw[data-for="' + t.id + '"]')) syncRows(); }, true);
    if (!wired) {
      wired = true;
      try { var E = _GE(); if (E && E.events) { E.events.on('moveend', redrawSoon); } } catch (_) { }
      /* The theme decides the map face's tones. There is no theme EVENT in this app — js/theme-sky.js writes
         `data-theme` on <html> — so the attribute itself is watched (one attribute, no polling). */
      try { new MutationObserver(function () { redraw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (_) { }
      window.addEventListener('intmap-lang', function () { setTimeout(function () { relabel(); if (isOpen()) syncRows(); }, 40); });
    }
    relabel(); syncRows();
  }

  /* Built at phone widths, once, and kept: a phone turned sideways and back keeps the same element (and
     the same registration with the sheet). On the desktop it is shut and the stylesheet hides it. */
  function sync() {
    var isM = false;
    try { isM = window.IntMapDevice.compact(); } catch (_) { }
    if (isM) build(); else closePop();
  }

  function install() {
    sync();
    try {
      var mq = window.matchMedia(window.IntMapDevice.COMPACT);
      if (mq.addEventListener) mq.addEventListener('change', sync);
    } catch (_) { }
    window.addEventListener('orientationchange', function () { setTimeout(sync, 220); });
  }

  return {
    install: install, redraw: redraw, close: closePop, open: open, toggle: togglePop, relabel: relabel,
    state: function () {
      return {
        mounted: !!pop, popOpen: isOpen(),
        showing: satOn() ? 'satellite' : 'map',
        /* ⚠ null when the satellite face drew. A STRING here means the picture is showing its map
           fallback where a photograph belongs — see the note above drawSat. */
        satFail: _satFail,
        proxies: pop ? Array.prototype.map.call(pop.querySelectorAll('[data-proxy]'), function (b) { return b.getAttribute('data-proxy'); }) : [],
        shows: pop ? Array.prototype.map.call(pop.querySelectorAll('.bm-sw[data-for]'), function (s) { return s.getAttribute('data-for'); }) : []
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
