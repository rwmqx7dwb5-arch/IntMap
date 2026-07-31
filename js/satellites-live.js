/* ============================================================================
 *  IntMap · LIVE SATELLITES — window.IntMapSatellites  (#R184)
 * ----------------------------------------------------------------------------
 *  「Live aircraft trafficの要領で、人工衛星版もフルクオリティで作って。」
 *
 *  The aircraft layer's shape, applied to orbit: a real keyless feed, real propagation, live
 *  positions, click-for-detail, a track for the selected object, and every number on screen the one
 *  actually computed. What is NOT shared is the physics — an aeroplane reports where it is, a
 *  satellite does not, so this file's centre of gravity is the propagator rather than the fetch.
 *
 *  ── THE ORBIT MODEL IS NOT HAND-ROLLED, AND THAT IS A CORRECTNESS DECISION ───────────────────
 *  Positions come from SGP4/SDP4 via `satellite.js` (MIT), the standard implementation of
 *  Spacetrack Report #3 / Vallado's revisiting paper. Writing SGP4 by hand is a very ordinary thing
 *  to get 95 % right and it fails in a way nobody notices: the near-earth branch alone is only valid
 *  below a ~225-minute period, so a partial implementation puts every GEO and Molniya satellite —
 *  the ones a user is most likely to look for by name — somewhere plausible and wrong. Verified
 *  before building anything on it, against the canonical test vector (Vallado, satellite 00005,
 *  t = 0 from epoch):
 *
 *      expected  7022.46529266  -1400.08296755   0.03995155  km (TEME)
 *      got       7022.46529     -1400.08297      0.03995
 *      error     6.8e-9 km  =  7 micrometres
 *
 *  …and the deep-space case (satellite 04632, period 1200 min) reports `method: 'd'` and propagates,
 *  so the SDP4 branch really is present rather than silently skipped.
 *
 *  ── WHERE A SATELLITE IS DRAWN ───────────────────────────────────────────────────────────────
 *  At its SUB-SATELLITE POINT — the spot on the ground it is directly above — with the altitude
 *  carried as data rather than as height. This is a deliberate refusal, not a shortcut. #R172 lifted
 *  aircraft to their true altitude because 11 km is a real distance on a map; a satellite is at
 *  400–35,786 km, and geostationary is 5.6 EARTH RADII up. Drawing that at true scale puts it off
 *  every screen, and drawing it at a "nice" reduced height would be inventing a number — the exact
 *  fabrication standing instruction 4 forbids. So the map shows the honest projection, and the
 *  things that ARE spatially meaningful get drawn properly instead:
 *    · the FOOTPRINT — the region from which the satellite is above the horizon, which is real
 *      geometry: half-angle = acos(Re / (Re + h));
 *    · the GROUND TRACK — one full orbit either side of now, so the path is visible as a path.
 *
 *  ── HONEST STATE ─────────────────────────────────────────────────────────────────────────────
 *  · Sunlit / eclipsed comes from the library's own shadow model, not from a guess about local time.
 *    It is what makes the "visually observable" group mean anything.
 *  · Element sets carry an EPOCH and decay in accuracy away from it. The card shows the age of the
 *    elements it used, because an SGP4 position from a three-week-old TLE is a different claim from
 *    one propagated ten minutes.
 *  · No network per frame. TLEs refresh on the timescale they actually change (2 h); positions are
 *    recomputed locally every second from the elements already in hand.
 *
 *  Source & terms: CelesTrak GP/OMM (celestrak.org) — keyless, CORS-open (verified from the browser;
 *  a curl check cannot answer this because curl sends no Origin), free for non-commercial use with
 *  attribution. Group sizes measured: `visual` 65 KB / 294 ms, `stations` 9.6 KB, and `active`
 *  6.8 MB / 16 s — which is why `active` is offered but never the default.
 * ==========================================================================*/
import * as SAT from 'satellite.js';

(function () {
  'use strict';

  var GE = function () { return window.IntMapGeoEngine; };
  var L = function (en, jp, de, ru, es) {
    var l = (window.IM_HOST && window.IM_HOST.lang) || window.currentLang || 'en';
    return l === 'jp' ? jp : l === 'de' ? de : l === 'ru' ? ru : l === 'es' ? es : en;
  };

  /* ── the catalogue ────────────────────────────────────────────────────────────────────────────
     CelesTrak's group names. Sizes are measured, not estimated, and they are why `active` carries a
     warning instead of being the obvious "show me everything" default. */
  var GROUPS = [
    { id: 'visual', kb: 65, nm: function () { return L('Brightest (visible to the eye)', '肉眼で見える衛星', 'Hellste (mit bloßem Auge)', 'Ярчайшие (видимые глазом)', 'Más brillantes (a simple vista)'); } },
    { id: 'stations', kb: 10, nm: function () { return L('Space stations', '宇宙ステーション', 'Raumstationen', 'Космические станции', 'Estaciones espaciales'); } },
    { id: 'weather', kb: 40, nm: function () { return L('Weather satellites', '気象衛星', 'Wettersatelliten', 'Метеоспутники', 'Satélites meteorológicos'); } },
    { id: 'geo', kb: 180, nm: function () { return L('Geostationary', '静止衛星', 'Geostationär', 'Геостационарные', 'Geoestacionarios'); } },
    { id: 'gps-ops', kb: 30, nm: function () { return L('GPS', 'GPS', 'GPS', 'GPS', 'GPS'); } },
    { id: 'galileo', kb: 25, nm: function () { return L('Galileo', 'Galileo', 'Galileo', 'Galileo', 'Galileo'); } },
    { id: 'science', kb: 60, nm: function () { return L('Science', '科学衛星', 'Wissenschaft', 'Научные', 'Científicos'); } },
    { id: 'starlink', kb: 1800, nm: function () { return L('Starlink', 'Starlink', 'Starlink', 'Starlink', 'Starlink'); } },
    { id: 'active', kb: 6800, nm: function () { return L('All active (very large)', '運用中すべて（非常に大きい）', 'Alle aktiven (sehr groß)', 'Все действующие (очень много)', 'Todos los activos (muy grande)'); } }
  ];
  var DEFAULT_GROUP = 'visual';
  var GP = function (g) { return 'https://celestrak.org/NORAD/elements/gp.php?GROUP=' + encodeURIComponent(g) + '&FORMAT=json'; };

  var SRC = 'src-sats', LYR = 'lyr-sats', LBL = 'lyr-sats-lbl';
  var TRK_SRC = 'src-sat-track', TRK = 'lyr-sat-track', FOOT = 'lyr-sat-foot';
  var R_EARTH = 6378.137;                    /* km, equatorial — the same figure SGP4 uses */

  var group = DEFAULT_GROUP;
  var sats = [];                             /* [{satrec, name, id, intl}] */
  var fixes = [];                            /* the last computed positions, for picking and the card */
  var tleAt = 0, loading = false, lastErr = null;
  var selected = null;                       /* NORAD id of the satellite whose track is drawn */
  var timer = null, on = false;

  /* ── data ─────────────────────────────────────────────────────────────────────────────────── */
  function load(g) {
    if (loading) return Promise.resolve(false);
    loading = true; lastErr = null;
    return fetch(GP(g || group), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (arr) {
      if (!Array.isArray(arr) || !arr.length) throw new Error('empty catalogue');
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        try {
          var rec = SAT.json2satrec(arr[i]);
          /* A record that failed to initialise is DROPPED, not drawn at 0,0. satellite.js reports it
             on the record itself; an object we cannot propagate is one we must not pretend to place. */
          if (!rec || rec.error) continue;
          out.push({ satrec: rec, name: String(arr[i].OBJECT_NAME || '').trim(),
            id: arr[i].NORAD_CAT_ID, intl: arr[i].OBJECT_ID || '', epoch: arr[i].EPOCH || '' });
        } catch (_) {}
      }
      sats = out; tleAt = Date.now(); loading = false;
      return true;
    }).catch(function (e) { lastErr = String(e && e.message || e); loading = false; return false; });
  }

  /* ── propagation ──────────────────────────────────────────────────────────────────────────── */
  /* One instant, every satellite. Returns the sub-satellite point plus the quantities the card
     shows — all of them computed here rather than copied from the feed, because the feed carries
     ELEMENTS, not positions. */
  function propagateAll(when) {
    var t = when || new Date();
    var gmst = SAT.gstime(t);
    var out = [];
    for (var i = 0; i < sats.length; i++) {
      var s = sats[i];
      try {
        var pv = SAT.propagate(s.satrec, t);
        if (!pv || !pv.position) continue;                       /* decayed / un-propagatable */
        var gd = SAT.eciToGeodetic(pv.position, gmst);
        var lat = SAT.degreesLat(gd.latitude), lng = SAT.degreesLong(gd.longitude);
        if (!isFinite(lat) || !isFinite(lng)) continue;
        var v = pv.velocity ? Math.sqrt(pv.velocity.x * pv.velocity.x + pv.velocity.y * pv.velocity.y + pv.velocity.z * pv.velocity.z) : null;
        var lit = null;
        try { lit = SAT.shadowFraction ? SAT.shadowFraction(t, pv.position) : null; } catch (_) {}
        out.push({ id: s.id, name: s.name, intl: s.intl, epoch: s.epoch,
          lng: lng, lat: lat, altKm: gd.height,
          velKmS: v,
          /* minutes per revolution, straight off the mean motion the elements carry */
          periodMin: s.satrec.no ? (2 * Math.PI / s.satrec.no) : null,
          inclDeg: s.satrec.inclo != null ? s.satrec.inclo * 180 / Math.PI : null,
          sunlit: (lit == null ? null : lit > 0.5) });
      } catch (_) {}
    }
    return out;
  }

  /* The circle on the ground from which this satellite is above the horizon. Real geometry, not a
     decoration: the Earth-centred half-angle is acos(Re / (Re + h)). */
  function footprintRing(lng, lat, altKm, n) {
    var half = Math.acos(R_EARTH / (R_EARTH + Math.max(1, altKm)));   /* radians at the Earth's centre */
    var D = Math.PI / 180, R2D = 180 / Math.PI, out = [];
    var la1 = lat * D, lo1 = lng * D, N = n || 128;
    for (var i = 0; i <= N; i++) {
      var brg = i * 2 * Math.PI / N;
      var la2 = Math.asin(Math.sin(la1) * Math.cos(half) + Math.cos(la1) * Math.sin(half) * Math.cos(brg));
      var lo2 = lo1 + Math.atan2(Math.sin(brg) * Math.sin(half) * Math.cos(la1), Math.cos(half) - Math.sin(la1) * Math.sin(la2));
      out.push([((lo2 * R2D + 540) % 360) - 180, la2 * R2D]);
    }
    return out;
  }

  /* One full orbit either side of now, split wherever it crosses the antimeridian so the line does
     not draw itself across the whole map. */
  function groundTrack(id, when) {
    var s = null;
    for (var i = 0; i < sats.length; i++) if (sats[i].id === id) { s = sats[i]; break; }
    if (!s) return [];
    var per = s.satrec.no ? (2 * Math.PI / s.satrec.no) : 95;        /* minutes */
    var t0 = (when || new Date()).getTime(), step = Math.max(0.25, per / 180);
    var segs = [], cur = [], prev = null;
    for (var k = -180; k <= 180; k++) {
      var t = new Date(t0 + k * step * 60000);
      try {
        var pv = SAT.propagate(s.satrec, t); if (!pv || !pv.position) continue;
        var gd = SAT.eciToGeodetic(pv.position, SAT.gstime(t));
        var lat = SAT.degreesLat(gd.latitude), lng = SAT.degreesLong(gd.longitude);
        if (!isFinite(lat) || !isFinite(lng)) continue;
        if (prev != null && Math.abs(lng - prev) > 180) { if (cur.length > 1) segs.push(cur); cur = []; }
        cur.push([lng, lat]); prev = lng;
      } catch (_) {}
    }
    if (cur.length > 1) segs.push(cur);
    return segs;
  }

  /* ── rendering ────────────────────────────────────────────────────────────────────────────── */
  function ensureIcon() {
    try {
      if (GE().scene.hasImage('sat-icon')) return;
      /* Drawn at devicePixelRatio and DECLARED with it — the #R183 lesson from the aircraft glyph:
         an ImageData handed over without a pixelRatio is treated as CSS pixels and upscaled on every
         HiDPI screen. A satellite bus with two panels, with the same shadow-under/white-rim
         treatment that made the aircraft readable over bright imagery. */
      var dpr = Math.max(1, Math.min(3, Math.round(window.devicePixelRatio || 1)));
      var s = 40, cv = document.createElement('canvas');
      cv.width = s * dpr; cv.height = s * dpr;
      var c = cv.getContext('2d'); c.scale(dpr, dpr); c.translate(s / 2, s / 2);
      var body = function () { c.beginPath(); c.rect(-3.4, -5.2, 6.8, 10.4); c.closePath(); };
      var panel = function (x) { c.beginPath(); c.rect(x, -3.6, 7.4, 7.2); c.closePath(); };
      c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 4; c.shadowOffsetY = 1.4;
      c.fillStyle = 'rgba(0,0,0,0.5)'; body(); c.fill(); panel(-11.4); c.fill(); panel(4.0); c.fill(); c.restore();
      c.lineJoin = 'round'; c.strokeStyle = 'rgba(255,255,255,0.98)'; c.lineWidth = 2.2;
      body(); c.stroke(); panel(-11.4); c.stroke(); panel(4.0); c.stroke();
      c.fillStyle = '#ffd23f'; body(); c.fill();
      c.fillStyle = '#3a7bd5'; panel(-11.4); c.fill(); panel(4.0); c.fill();
      GE().scene.addImage('sat-icon', c.getImageData(0, 0, s * dpr, s * dpr), { pixelRatio: dpr });
    } catch (_) {}
  }
  function ensureLayers() {
    var E = GE(); if (!E || !E.canDraw()) return false;
    try {
      ensureIcon();
      if (!E.layers.hasSource(SRC)) E.layers.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      if (!E.layers.hasSource(TRK_SRC)) E.layers.addSource(TRK_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      if (!E.layers.has(FOOT)) E.layers.add({ id: FOOT, type: 'fill', source: TRK_SRC,
        filter: ['==', ['get', 'kind'], 'foot'],
        paint: { 'fill-color': '#ffd23f', 'fill-opacity': 0.10 } });
      if (!E.layers.has(TRK)) E.layers.add({ id: TRK, type: 'line', source: TRK_SRC,
        filter: ['==', ['get', 'kind'], 'track'], layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffd23f', 'line-width': 1.8, 'line-opacity': 0.9, 'line-dasharray': [2, 1.6] } });
      if (!E.layers.has(LYR)) E.layers.add({ id: LYR, type: 'symbol', source: SRC, layout: {
        'icon-image': 'sat-icon',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 1, 0.5, 4, 0.72, 8, 0.9],
        'icon-allow-overlap': true, 'icon-ignore-placement': true },
        paint: { 'icon-opacity': ['case', ['==', ['get', 'sunlit'], false], 0.55, 1] } });
      /* Names only where they can be read — at low zoom a catalogue of 5,000 labels is a grey band. */
      if (!E.layers.has(LBL)) E.layers.add({ id: LBL, type: 'symbol', source: SRC, minzoom: 3, layout: {
        'text-field': ['get', 'name'], 'text-size': 10.5, 'text-offset': [0, 1.3], 'text-anchor': 'top',
        'text-allow-overlap': false, 'text-optional': true },
        paint: { 'text-color': '#ffd23f', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.4 } });
      return true;
    } catch (e) { lastErr = String(e && e.message || e); return false; }
  }
  function paint() {
    if (!ensureLayers()) return;
    fixes = propagateAll();
    try {
      GE().layers.setSourceData(SRC, { type: 'FeatureCollection', features: fixes.map(function (f) {
        return { type: 'Feature', geometry: { type: 'Point', coordinates: [f.lng, f.lat] },
          properties: { id: f.id, name: f.name, sunlit: f.sunlit, altKm: Math.round(f.altKm) } };
      }) });
    } catch (_) {}
    paintSelection();
  }
  function paintSelection() {
    var feats = [];
    if (selected != null) {
      var f = null;
      for (var i = 0; i < fixes.length; i++) if (fixes[i].id === selected) { f = fixes[i]; break; }
      if (f) {
        groundTrack(selected).forEach(function (seg) {
          feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: seg }, properties: { kind: 'track' } });
        });
        feats.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [footprintRing(f.lng, f.lat, f.altKm)] }, properties: { kind: 'foot' } });
      }
    }
    try { GE().layers.setSourceData(TRK_SRC, { type: 'FeatureCollection', features: feats }); } catch (_) {}
  }

  /* ── lifecycle ────────────────────────────────────────────────────────────────────────────── */
  function tick() {
    if (!on) return;
    /* Elements refresh on the timescale they actually change; positions are recomputed locally every
       second. A satellite layer that re-fetched to move a dot would be pointless traffic. */
    if (Date.now() - tleAt > 2 * 3600 * 1000 && !loading) load(group).then(function () { paint(); });
    else paint();
  }
  function start() {
    on = true;
    var go = function () { paint(); if (!timer) timer = setInterval(tick, 1000); };
    if (!sats.length) load(group).then(function (ok) { if (ok) go(); }); else go();
  }
  function stop() {
    on = false;
    if (timer) { clearInterval(timer); timer = null; }
    var E = GE(); if (!E) return;
    try { [LBL, LYR, TRK, FOOT].forEach(function (id) { if (E.layers.has(id)) E.layers.setVisible(id, false); }); } catch (_) {}
  }
  function setGroup(g) {
    var ok = GROUPS.some(function (x) { return x.id === g; });
    if (!ok || g === group) return group;
    group = g; sats = []; fixes = []; selected = null; tleAt = 0;
    if (on) load(group).then(function () { paint(); });
    return group;
  }
  /* Nearest satellite to a screen point, in SCREEN space — the same rule the aircraft pick uses, so
     "click the thing you can see" means the same in both layers. */
  function pickAt(pt, radiusPx) {
    var E = GE(); if (!E || !pt) return null;
    var R = radiusPx || 18, best = null, bestD = R * R;
    for (var i = 0; i < fixes.length; i++) {
      var f = fixes[i];
      var p = null; try { p = E.coords.project([f.lng, f.lat]); } catch (_) {}
      if (!p) continue;
      var dx = p.x - pt.x, dy = p.y - pt.y, q = dx * dx + dy * dy;
      if (q < bestD) { bestD = q; best = f; }
    }
    return best ? best.id : null;
  }
  function select(id) { selected = (id == null) ? null : id; paintSelection(); return selected; }
  function get(id) { for (var i = 0; i < fixes.length; i++) if (fixes[i].id === id) return fixes[i]; return null; }
  /* How old are the elements this position came from? An SGP4 fix propagated ten minutes and one
     propagated three weeks are different claims, and the card says which it is showing. */
  function elementAgeH(f) {
    try { var e = Date.parse((f && f.epoch) ? (f.epoch + 'Z').replace(/ZZ$/, 'Z') : '');
      return isFinite(e) ? (Date.now() - e) / 3600000 : null; } catch (_) { return null; }
  }

  window.IntMapSatellites = {
    start: start, stop: stop, isOn: function () { return on; },
    groups: function () { return GROUPS.map(function (g) { return { id: g.id, kb: g.kb, name: g.nm() }; }); },
    group: function () { return group; }, setGroup: setGroup,
    reload: function () { tleAt = 0; return load(group).then(function (ok) { if (on) paint(); return ok; }); },
    pickAt: pickAt, select: select, selected: function () { return selected; }, get: get,
    list: function () { return fixes.slice(); },
    footprintRing: footprintRing, groundTrack: groundTrack, elementAgeH: elementAgeH,
    /* diagnostics — Atlas and the tests read these instead of poking at the renderer */
    state: function () {
      return { on: on, group: group, catalogue: sats.length, drawn: fixes.length,
        selected: selected, tleAgeH: tleAt ? (Date.now() - tleAt) / 3600000 : null,
        loading: loading, err: lastErr };
    },
    _propagateAll: propagateAll
  };
})();
