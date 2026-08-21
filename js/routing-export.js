/* ============================================================================
 *  IntMap · TAKING A ROUTE WITH YOU — window.IntMapRouteExport   (#R291)
 * ----------------------------------------------------------------------------
 *  GPX, GeoJSON and the shareable state. Three ways of saying the same journey, so they are built
 *  in one file from one payload and cannot disagree about it.
 *
 *  ⚠ THE OLD SHAPES ARE KEPT, EXACTLY (§16.1 「既存利用者との互換性を壊さないでください」).
 *  The GPX still carries `<trk><name>IntMap route</name><trkseg>…` and the GeoJSON still carries a
 *  LineString whose properties are `source / distance_m / duration_s`. Everything this round adds is
 *  ADDITIVE — `<metadata>`, named `<wpt>`s for the start, the stops and the destination, and the
 *  provider/mode/avoid facts — so a file that already worked in somebody's GPS still parses.
 *
 *  ⚠ AND THE SHARE LINK CARRIES NO GEOMETRY (§16.2). A route is re-COMPUTED from its endpoints when
 *  a shared link is opened, because a 27,000-point polyline in an address bar would be both unusable
 *  and a lie: it would pin yesterday's road network as today's answer. What travels is what the
 *  reader chose — the places, the mode, the time, the avoid options, the selected alternative — and
 *  the recipient's app asks the router itself.
 *
 *  ⚠ A SHARED ROUTE CONTAINS PLACES. `describe()` is what the share panel prints so nobody sends
 *  their home address without being told they are doing it.
 *
 *  Pure: no DOM, no renderer, no fetch. Verified in Node.
 * ==========================================================================*/
window.IntMapRouteExport = (function () {
  'use strict';

  function xml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]; }); }
  function num(v, n) { return (+v).toFixed(n == null ? 6 : n); }

  /* ══ GPX 1.1 ══════════════════════════════════════════════════════════════════════════════════ */
  function gpx(p) {
    p = p || {};
    var coords = p.coords || [];
    if (!coords.length) return null;
    var when = p.generatedISO || new Date().toISOString();
    var wpts = (p.waypoints || []).filter(function (w) { return w && isFinite(+w.lng); }).map(function (w) {
      return '\n<wpt lat="' + num(w.lat) + '" lon="' + num(w.lng) + '"><name>' + xml(w.name || '') + '</name>'
        + '<type>' + xml(w.role || 'via') + '</type></wpt>';
    }).join('');
    /* the facts a reader of the file needs in order to know what it is a route FOR */
    var desc = [
      p.mode ? ('mode=' + p.mode) : '',
      p.provider ? ('provider=' + p.provider) : '',
      isFinite(p.distance) ? ('distance_m=' + Math.round(p.distance)) : '',
      isFinite(p.duration) ? ('duration_s=' + Math.round(p.duration)) : '',
      (p.avoid && p.avoid.length) ? ('avoid=' + p.avoid.join('+')) : '',
      p.avoidAreas ? ('keep_out_areas=' + p.avoidAreas) : '',
      'live_traffic=' + (p.liveTraffic ? 'yes' : 'no'),
      p.estimated ? 'times=estimated' : '',
    ].filter(Boolean).join('; ');
    var seg = coords.map(function (c) { return '<trkpt lat="' + num(c[1]) + '" lon="' + num(c[0]) + '"/>'; }).join('');
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<gpx version="1.1" creator="IntMap" xmlns="http://www.topografix.com/GPX/1/1">\n'
      + '<metadata><name>' + xml(p.title || 'IntMap route') + '</name><desc>' + xml(desc) + '</desc>'
      + '<time>' + xml(when) + '</time></metadata>' + wpts + '\n'
      + '<trk><name>IntMap route</name><trkseg>' + seg + '</trkseg></trk>\n</gpx>';
  }

  /* ══ GeoJSON ══════════════════════════════════════════════════════════════════════════════════ */
  function geojson(p) {
    p = p || {};
    var coords = p.coords || [];
    if (!coords.length) return null;
    var line = {
      type: 'Feature',
      properties: {
        source: 'IntMap',
        distance_m: isFinite(p.distance) ? p.distance : null,
        duration_s: isFinite(p.duration) ? p.duration : null,
        /* additive — everything below is new in #R291 */
        mode: p.mode || null, provider: p.provider || null,
        avoid: (p.avoid && p.avoid.length) ? p.avoid.slice() : null,
        keep_out_areas: p.avoidAreas || 0,
        live_traffic: !!p.liveTraffic,
        times_estimated: !!p.estimated,
        generated: p.generatedISO || new Date().toISOString(),
        legs: (p.legs && p.legs.length) ? p.legs.map(function (l) {
          return { mode: l.mode, route: l.route || null, from: l.from || null, to: l.to || null,
                   duration_s: l.duration || null, real_time: l.rt === true, delay_min: l.rt === true ? (+l.delay || 0) : null };
        }) : null,
      },
      geometry: { type: 'LineString', coordinates: coords.map(function (c) { return [+num(c[0]), +num(c[1])]; }) },
    };
    var pts = (p.waypoints || []).filter(function (w) { return w && isFinite(+w.lng); }).map(function (w, i) {
      return { type: 'Feature', properties: { source: 'IntMap', role: w.role || 'via', name: w.name || '', order: i },
               geometry: { type: 'Point', coordinates: [+num(w.lng), +num(w.lat)] } };
    });
    return JSON.stringify({ type: 'FeatureCollection', features: [line].concat(pts) }, null, 0);
  }

  /* ══ THE SHAREABLE STATE ══════════════════════════════════════════════════════════════════════
     Small enough for an address bar (the app packs everything registered through
     IntMapShareState into ONE base64url parameter), and containing only what the reader chose.
     Coordinates are rounded to 5 decimals — about a metre, which is finer than any router snaps. */
  function encodeShare(s) {
    if (!s) return null;
    var f = pack(s.from), t = pack(s.to);
    if (!f || !t) return null;
    var o = { f: f, t: t, m: s.mode || 'driving' };
    var v = (s.via || []).map(function (x) { return pack(x); }).filter(Boolean);
    if (v.length) o.v = v;
    if (s.when && s.when.kind && s.when.kind !== 'now' && s.when.local) { o.w = s.when.kind; o.wt = s.when.local; }
    if (s.avoid && s.avoid.length) o.a = s.avoid.slice();
    if (s.sel) o.s = s.sel | 0;
    if (s.transitModes && s.transitModes.length) o.tm = s.transitModes.slice();
    if (s.maxWalkM) o.mw = s.maxWalkM;
    return o;
  }
  function pack(field) {
    var p = field && (field.place || (isFinite(+field.lng) ? field : null));
    if (!p || !isFinite(+p.lng) || !isFinite(+p.lat)) return null;
    return [+(+p.lng).toFixed(5), +(+p.lat).toFixed(5), String(p.name || '').slice(0, 60)];
  }
  function unpack(a) {
    if (!Array.isArray(a) || a.length < 2 || !isFinite(+a[0]) || !isFinite(+a[1])) return null;
    return { lng: +a[0], lat: +a[1], name: String(a[2] || ((+a[1]).toFixed(4) + ', ' + (+a[0]).toFixed(4))), kind: 'place', source: 'share' };
  }
  /** the partial state a shared link asks for — the caller re-computes the route from it */
  function decodeShare(o) {
    if (!o || typeof o !== 'object') return null;
    var from = unpack(o.f), to = unpack(o.t);
    if (!from || !to) return null;
    var MODES = ['driving', 'transit', 'walking', 'cycling'];
    return {
      from: from, to: to,
      via: (Array.isArray(o.v) ? o.v : []).map(unpack).filter(Boolean),
      mode: MODES.indexOf(o.m) >= 0 ? o.m : 'driving',
      when: (o.w === 'depart' || o.w === 'arrive') && o.wt ? { kind: o.w, local: String(o.wt) } : { kind: 'now', local: '' },
      avoid: (Array.isArray(o.a) ? o.a : []).filter(function (x) { return ['toll', 'motorway', 'ferry'].indexOf(x) >= 0; }),
      sel: Math.max(0, (o.s | 0)),
      transitModes: Array.isArray(o.tm) && o.tm.length ? o.tm.slice() : null,
      maxWalkM: isFinite(+o.mw) && +o.mw > 0 ? +o.mw : null,
    };
  }
  /** what the share panel prints so nobody sends an address without knowing (§16.2) */
  function describe(s) {
    var e = encodeShare(s);
    if (!e) return null;
    return { from: e.f[2], to: e.t[2], stops: (e.v || []).length, mode: e.m, timed: !!e.w };
  }

  return { gpx: gpx, geojson: geojson, encodeShare: encodeShare, decodeShare: decodeShare, describe: describe, _pack: pack, _unpack: unpack };
})();
