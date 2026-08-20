/* ============================================================================
 *  IntMap · the REANALYSIS half of the one temperature layer — window.IntMapReanalysis  (#R288)
 * ----------------------------------------------------------------------------
 *  「気温（2m・再解析）レイヤーも統合し、一つのレイヤー、同じ色分け、グラフィックに。
 *    ソースだけ切り替えられる仕様に。」
 *
 *  Two layers used to show air temperature and they agreed about nothing: the ECMWF forecast raster
 *  (js/weather.js, the Open-Meteo tile protocol, its own ramp) and 「気温（2m・再解析）」 — NASA GIBS
 *  `MERRA2_2m_Air_Temperature_Monthly`, whose tiles arrive ALREADY PAINTED in NASA's own spectral
 *  palette. Two switches, two legends, two colour schemes for one quantity.
 *
 *  The instruction is one layer with one colouring and a source switch, so the reanalysis has to be
 *  drawn in the SAME ramp as the forecast — which means the tile has to become NUMBERS again before
 *  it can be re-coloured. It can, exactly:
 *
 *    · the GIBS tile is an 8-bit INDEXED PNG (MEASURED: IHDR colour type 3, a 768-byte PLTE), and
 *    · the palette is published — https://gibs.earthdata.nasa.gov/colormaps/v1.3/<layer>.xml —
 *      183 entries, ref 0 = no data, refs 2…181 are 0.5 K bins from 220 K to 310 K, ref 1 is
 *      everything colder and ref 182 everything warmer, and
 *    · NO TWO ENTRIES SHARE AN RGB (checked over all 183), so colour → value is a bijection.
 *
 *  So this protocol fetches the tile, reads its pixels, maps each one back to its Kelvin bin and
 *  paints it with window.IntMapECMWF's ramp — the same table the forecast raster and both legends
 *  read. Nothing is interpolated, invented or averaged: 183 source colours in, 183 colours out, and
 *  a pixel whose colour is not in the palette (only the transparent no-data magenta) stays
 *  transparent.
 *
 *  ⚠ THIS IS A RE-COLOURING, NOT A SECOND OPINION ABOUT THE WEATHER. The values are NASA's; what
 *  changes is only which colour stands for which value, so the reader can compare the two sources
 *  by eye instead of learning two keys.
 *
 *  Source & terms: NASA EOSDIS GIBS / MERRA-2 (public domain) — declared in js/reference-data.js,
 *  sources.html and js/legal.js, as it already was for the layer this replaces.
 * ==========================================================================*/
(function () {
  'use strict';

  var LAYER = 'MERRA2_2m_Air_Temperature_Monthly';
  var CMAP = 'https://gibs.earthdata.nasa.gov/colormaps/v1.3/' + LAYER + '.xml';
  var TILE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/' + LAYER
    + '/default/{date}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png';
  var MAXZOOM = 6;
  /* MERRA-2 is published as a monthly mean and GIBS lags roughly a quarter behind — the number the
     layer this replaces has used since #R7. It is a LAG, not a hard edge: `clampMonth` keeps the
     picker inside it rather than letting the reader pick a month that answers 404. */
  var LAG_MONTHS = 3, FIRST = '1980-01-01';

  function p2(n) { return ('0' + n).slice(-2); }
  function monthISO(d) {
    var t = (d instanceof Date) ? d : new Date(d || Date.now());
    if (isNaN(t.getTime())) t = new Date();
    return t.getUTCFullYear() + '-' + p2(t.getUTCMonth() + 1) + '-01';
  }
  function latestMonth() {
    var d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - LAG_MONTHS);
    return monthISO(d);
  }
  function clampMonth(iso) {
    var s = String(iso || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return latestMonth();
    s = s.slice(0, 8) + '01';
    if (s > latestMonth()) return latestMonth();
    if (s < FIRST) return FIRST;
    return s;
  }

  /* ── the palette, read from NASA rather than copied ─────────────────────────────────────────────
     `ref` is the palette index and the bins are regular, so the value does not have to be parsed out
     of the rounded 「[220,221)」 strings the XML prints — but the RGBs do, because they are what a
     decoded pixel carries. */
  var lut = null, lutP = null;
  function binK(ref) {
    if (ref <= 0) return null;                 /* 0 = no data */
    if (ref === 1) return 219.75;              /* [-INF,220) — the coldest bucket */
    if (ref >= 182) return 310.25;             /* [310,+INF) */
    return 220 + (ref - 2) * 0.5 + 0.25;       /* 180 half-degree bins, 220 K → 310 K */
  }
  function loadLUT() {
    if (lut) return Promise.resolve(lut);
    if (lutP) return lutP;
    lutP = fetch(CMAP, { cache: 'force-cache' }).then(function (r) {
      if (!r.ok) throw new Error('gibs colormap ' + r.status);
      return r.text();
    }).then(function (xml) {
      var re = /<ColorMapEntry\b([^>]*)\/>/g, m, out = Object.create(null), n = 0;
      while ((m = re.exec(xml))) {
        var a = m[1];
        var rgb = /rgb="([0-9]+),([0-9]+),([0-9]+)"/.exec(a);
        var ref = /ref="([0-9]+)"/.exec(a);
        if (!rgb || !ref) continue;
        if (/nodata="true"/.test(a)) continue;
        var k = binK(+ref[1]);
        if (k == null) continue;
        out[((+rgb[1]) << 16) | ((+rgb[2]) << 8) | (+rgb[3])] = k;
        n++;
      }
      if (!n) throw new Error('gibs colormap empty');
      lut = out; lutP = null;
      return lut;
    }).catch(function (e) { lutP = null; throw e; });
    return lutP;
  }

  /* ── the ramp, from the one place that owns it ───────────────────────────────────────────────── */
  function ramp() {
    try { return window.IntMapECMWF && window.IntMapECMWF.WINDY_TEMP; } catch (_) { return null; }
  }
  /* K → the packed little-endian RGBA our ramp asks for. Built once per palette entry, so the
     per-pixel work below is two table lookups and a store. */
  var packCache = null, packRampRef = null;
  function packed() {
    var rp = ramp();
    if (!rp || !rp.breakpoints || !rp.breakpoints.length) return null;
    if (packCache && packRampRef === rp) return packCache;
    var bp = rp.breakpoints, cols = rp.colors;
    var out = Object.create(null);
    Object.keys(lut).forEach(function (key) {
      var c = lut[key] - 273.15;
      var lo = 0, hi = bp.length - 1;
      if (c <= bp[0]) hi = 0;
      else if (c >= bp[hi]) lo = hi;
      else { while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (bp[mid] <= c) lo = mid; else hi = mid; } hi = lo; }
      var col = cols[Math.min(hi, cols.length - 1)];
      out[key] = (255 << 24) | (col[2] << 16) | (col[1] << 8) | col[0];   /* little-endian RGBA */
    });
    packCache = out; packRampRef = rp;
    return out;
  }

  function canvas2d(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    var c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  function toBitmap(c) {
    return c.transferToImageBitmap ? Promise.resolve(c.transferToImageBitmap()) : createImageBitmap(c);
  }

  var stat = { req: 0, ok: 0, empty: 0, fail: 0, unmapped: 0 };
  function tileUrl(date, z, x, y) {
    return TILE.replace('{date}', clampMonth(date)).replace('{z}', z).replace('{y}', y).replace('{x}', x);
  }
  function recolour(date, z, x, y, signal) {
    stat.req++;
    return loadLUT().then(function () {
      return fetch(tileUrl(date, z, x, y), { signal: signal });
    }).then(function (r) {
      if (r.status === 404) { stat.empty++; return null; }        /* outside the archive — draw nothing */
      if (!r.ok) throw new Error('gibs tile ' + r.status);
      return r.blob();
    }).then(function (b) {
      if (!b) return null;
      return createImageBitmap(b);
    }).then(function (bmp) {
      if (!bmp) return null;
      var w = bmp.width, h = bmp.height;
      var c = canvas2d(w, h);
      var ctx = c.getContext('2d', { willReadFrequently: true });
      /* ⚠ NO SMOOTHING AND NO SCALING. A resampled pixel is a colour that is in no palette entry,
         i.e. a temperature that was never measured — the whole inversion depends on the bytes
         arriving unchanged. */
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bmp, 0, 0);
      try { bmp.close && bmp.close(); } catch (_) {}
      var img = ctx.getImageData(0, 0, w, h);
      var d = img.data;
      var u32 = new Uint32Array(img.data.buffer);
      var map = packed();
      if (!map) throw new Error('temperature ramp unavailable');
      var miss = 0;
      for (var i = 0, p = 0; i < d.length; i += 4, p++) {
        if (d[i + 3] === 0) { u32[p] = 0; continue; }
        var key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        var v = map[key];
        if (v === undefined) { u32[p] = 0; miss++; continue; }
        u32[p] = v;
      }
      if (miss) stat.unmapped += miss;
      ctx.putImageData(img, 0, 0);
      stat.ok++;
      return toBitmap(c);
    }).catch(function (e) {
      if (e && e.name === 'AbortError') throw e;
      stat.fail++;
      return null;
    });
  }

  var registered = false;
  function register() {
    if (registered) return true;
    try {
      window.IntMapGeoEngine.scene.addProtocol('imwxre', function (params, ctl) {
        var m = /^imwxre:\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)/.exec((params && params.url) || '');
        if (!m) return Promise.reject(new Error('bad imwxre url'));
        var signal = ctl && ctl.signal;
        return recolour(decodeURIComponent(m[1]), +m[2], +m[3], +m[4], signal)
          .then(function (bmp) {
            /* a month with no tile is EMPTY, not an error — an empty 1×1 keeps MapLibre from
               retrying a 404 for every tile in the view. */
            if (bmp) return { data: bmp };
            var c = canvas2d(1, 1);
            return toBitmap(c).then(function (b) { return { data: b }; });
          });
      });
      registered = true;
    } catch (_) { registered = false; }
    return registered;
  }

  window.IntMapReanalysis = {
    GIBS_LAYER: LAYER, COLORMAP_URL: CMAP, MAXZOOM: MAXZOOM, FIRST_MONTH: FIRST, LAG_MONTHS: LAG_MONTHS,
    register: register,
    monthISO: monthISO,
    latestMonth: latestMonth,
    clampMonth: clampMonth,
    /* the tile template a raster source is given — one entry, the protocol does the rest */
    tiles: function (date) { return ['imwxre://' + encodeURIComponent(clampMonth(date)) + '/{z}/{x}/{y}']; },
    sourceUrl: tileUrl,
    /* test seams — never called by the app */
    _lut: function () { return lut; },
    _loadLUT: loadLUT,
    _binK: binK,
    _stat: function () { return Object.assign({}, stat); },
    _recolour: recolour
  };
})();
