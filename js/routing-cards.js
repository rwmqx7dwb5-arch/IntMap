/* ============================================================================
 *  IntMap · ONE RENDERING LAYER FOR A ROUTE — window.IntMapRouteCards   (#R291)
 * ----------------------------------------------------------------------------
 *  「同じ候補をAtlasとパネルで別HTMLとして重複実装する」— 禁止事項.
 *
 *  ══ THE DUPLICATE THIS FILE ENDS ═══════════════════════════════════════════════════════════════
 *  A route came out of one router and was then rendered TWICE, by two files that had never been
 *  compared: js/atlas-console.js built `.atl-trip` cards, `_legRow`, `_stepList` and `_ic()`; and
 *  js/routing.js built `.rp-alt`, `legRows()`, `stepRows()` and `_modeIcon()`. Measured on the
 *  shipped build, they disagreed about things a reader can see:
 *
 *    · Atlas printed the REAL-TIME badge and the delay («● +3 min late»); the panel computed `rt`
 *      and `delay` in `_buildItin` and then rendered neither, so the same live train was «live» in
 *      one surface and silent in the other;
 *    · Atlas showed departure/arrival clock times per alternative, the panel showed only a total;
 *    · neither respected the measurement-units setting — both hard-coded km.
 *
 *  So the HTML is built HERE, once, and both surfaces call it. Pure functions of (data, options):
 *  no DOM, no renderer, no store — which is what lets the formatting be verified in Node and what
 *  stops this file from growing a second opinion about state.
 *
 *  ⚠ THE GLYPHS ARE SVG, NOT EMOJI. Standing rule: no decorative emoji. They also have to carry an
 *  accessible NAME, because §19 requires the mode, the selection and the lane guidance to be
 *  readable without seeing colour — so every icon is emitted with `aria-hidden` beside real text
 *  rather than instead of it.
 * ==========================================================================*/
window.IntMapRouteCards = (function () {
  'use strict';

  var _lang = 'en';
  var L = window.IntMapLang.pick(function () { return _lang; });
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function use(o) { if (o && o.lang) _lang = o.lang; return o || {}; }

  /* ══ SVG ═══════════════════════════════════════════════════════════════════════════════════════ */
  function svg(d, extra) {
    return '<svg viewBox="0 0 24 24" width="' + ((extra && extra.size) || 16) + '" height="' + ((extra && extra.size) || 16)
      + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + '</svg>';
  }
  var GLYPH = {
    driving: '<path d="M4.5 16.5h15"/><path d="M5.5 16.5v2h-2v-2"/><path d="M20.5 16.5v2h-2v-2"/><path d="M4.5 16.5l1.4-5.1A2 2 0 0 1 7.8 10h8.4a2 2 0 0 1 1.9 1.4l1.4 5.1"/><circle cx="7.5" cy="14" r=".9"/><circle cx="16.5" cy="14" r=".9"/>',
    transit: '<rect x="6" y="3.5" width="12" height="12.5" rx="2.6"/><path d="M6 11h12"/><path d="M9 19.5l-2 2M15 19.5l2 2"/><circle cx="9" cy="13.6" r=".85"/><circle cx="15" cy="13.6" r=".85"/>',
    walking: '<circle cx="13" cy="4.2" r="1.7"/><path d="M11.6 8.2l-2.6 4 2.2 1.6.6 6.1"/><path d="M13.8 13.8l2.4 2.1 2.1-1"/><path d="M11.6 8.2L14 7l2.6 2.2 2 .6"/><path d="M11.8 13.8L8.6 20"/>',
    cycling: '<circle cx="5.6" cy="16.4" r="3.4"/><circle cx="18.4" cy="16.4" r="3.4"/><path d="M8.4 16.4l3.6-6.5h4"/><path d="M12 9.9L9.4 6.6h3"/><path d="M15.6 6.6h2.2l.6 9.8"/>',
    rail: '<rect x="6" y="3.5" width="12" height="12.5" rx="2.6"/><path d="M6 11h12"/><path d="M9 19.5l-2 2M15 19.5l2 2"/>',
    subway: '<rect x="5.5" y="4" width="13" height="11" rx="3"/><path d="M5.5 10.5h13"/><path d="M8 19l-1.5 1.8M16 19l1.5 1.8"/>',
    tram: '<rect x="6.5" y="4" width="11" height="12" rx="2"/><path d="M6.5 10h11"/><path d="M12 4V1.8"/><path d="M8 19.6l-1.4 1.6M16 19.6l1.4 1.6"/>',
    bus: '<rect x="4.5" y="4" width="15" height="12" rx="2.4"/><path d="M4.5 10.5h15"/><circle cx="8" cy="13.4" r=".9"/><circle cx="16" cy="13.4" r=".9"/><path d="M7 19v1.6M17 19v1.6"/>',
    ferry: '<path d="M3 18.4c1.8 0 1.8 1.6 3.6 1.6s1.8-1.6 3.6-1.6 1.8 1.6 3.6 1.6 1.8-1.6 3.6-1.6"/><path d="M4.8 18l1.6-5h11.2l1.6 5"/><path d="M9 13V9.4h6V13"/><path d="M12 9.4V6.6"/>',
    highspeed: '<path d="M4 15.5h13.5a3 3 0 0 0 0-6H9"/><path d="M4 9.5h3"/><path d="M2.5 12.5h5"/><path d="M6 18.5h11"/>',
    local: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.4v5l3.2 2"/>',
    pin: '<path d="M12 21.5s7-6.2 7-11.1A7 7 0 0 0 5 10.4c0 4.9 7 11.1 7 11.1z"/><circle cx="12" cy="10.2" r="2.4"/>',
    /* (#R296) 「現在地」 — the crosshair every map app uses for it, distinct from `pin` (a place) at 16 px */
    here: '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.4"/><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3"/>',
    flag: '<path d="M6 21V4"/><path d="M6 5h11l-2.2 3.5L17 12H6"/>',
    here: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5"/>',
    left: '<path d="M15 20V12a4 4 0 0 0-4-4H6"/><path d="M9.5 4.5L6 8l3.5 3.5"/>',
    right: '<path d="M9 20V12a4 4 0 0 1 4-4h5"/><path d="M14.5 4.5L18 8l-3.5 3.5"/>',
    'slight left': '<path d="M13.5 20v-7.5a4 4 0 0 1 1.2-2.9"/><path d="M8.4 4.6l-1 4.6 4.6 1"/><path d="M7.6 5.4l7 6.3"/>',
    'slight right': '<path d="M10.5 20v-7.5a4 4 0 0 0-1.2-2.9"/><path d="M15.6 4.6l1 4.6-4.6 1"/><path d="M16.4 5.4l-7 6.3"/>',
    'sharp left': '<path d="M16 20v-6.5a4 4 0 0 0-4-4H8"/><path d="M11 5.6L7 9.5l4 3.9"/>',
    'sharp right': '<path d="M8 20v-6.5a4 4 0 0 1 4-4h4"/><path d="M13 5.6l4 3.9-4 3.9"/>',
    straight: '<path d="M12 20.5V4.5"/><path d="M7.5 9L12 4.5 16.5 9"/>',
    uturn: '<path d="M8 20V10a4 4 0 0 1 8 0v10"/><path d="M4.5 13.5L8 10l3.5 3.5"/>',
    merge: '<path d="M12 20.5v-7"/><path d="M12 13.5L18 7.5"/><path d="M12 13.5L7 8.5V4"/><path d="M14.6 7.5H18v3.4"/>',
    'on ramp': '<path d="M7 20.5V9a5 5 0 0 1 5-5h5"/><path d="M14 1.2L17.5 4 14 6.8"/>',
    'off ramp': '<path d="M8 20.5V4"/><path d="M8 10c0 4 2.4 6.5 6 7.5"/><path d="M12.6 20l3-2.6-2.4-2.6"/>',
    fork: '<path d="M12 20.5v-6"/><path d="M12 14.5L7 9V4.5"/><path d="M12 14.5L17 9V4.5"/>',
    roundabout: '<circle cx="12" cy="10" r="4.3"/><path d="M12 20.5v-6.2"/><path d="M16.3 10H21"/><path d="M18.4 7.6L21 10l-2.6 2.4"/>',
    'end of road': '<path d="M12 20.5V9.5"/><path d="M5 9.5h14"/><path d="M7.6 6.9L5 9.5l2.6 2.6"/>',
    depart: '<circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="8.4"/>',
    arrive: '<path d="M6 21V4"/><path d="M6 5h11l-2.2 3.5L17 12H6"/>',
  };
  function glyph(k, o) { return svg(GLYPH[k] || GLYPH.straight, o); }

  /* ══ FORMATTING — unit-aware, locale-aware, timezone-aware ════════════════════════════════════
     One place, so the panel, Atlas and the export cannot print three different numbers for the
     same journey. `units` is the app's measurement setting: 'metric' | 'imperial' | 'both'. */
  function duration(sec, o) {
    use(o);
    var t = Math.max(0, Math.round((+sec || 0) / 60)), h = Math.floor(t / 60), m = t % 60;
    var HH = L('h', '時間', 'Std', 'ч', 'h'), MM = L('min', '分', 'Min', 'мин', 'min');
    if (h >= 24) { var d = Math.floor(h / 24); return d + ' ' + L('d', '日', 'T', 'дн', 'd') + ' ' + (h % 24) + ' ' + HH; }
    return h ? (h + ' ' + HH + ' ' + m + ' ' + MM) : (t + ' ' + MM);
  }
  function distance(metres, o) {
    o = use(o);
    var units = o.units || 'metric';
    var km = (+metres || 0) / 1000, mi = km * 0.621371;
    var met = (km < 1) ? (Math.round(+metres) + ' m') : ((km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString()) + ' km');
    var imp = (mi < 0.19) ? (Math.round((+metres) * 3.28084).toLocaleString() + ' ft') : ((mi < 10 ? mi.toFixed(1) : Math.round(mi).toLocaleString()) + ' mi');
    return units === 'imperial' ? imp : units === 'both' ? (met + ' (' + imp + ')') : met;
  }
  /* ══ ⚠⚠ (#R296) 「経路機能で、現地の時刻に合わせろ」 ═══════════════════════════════════════════════
     A departure at 08:40 in Paris is 08:40 in PARIS. Until now every clock in a route was rendered in
     the reader's own zone — the Settings zone when they had pinned one, the device otherwise — so a
     Tokyo→Paris itinerary read out in Tokyo time from end to end and the arrival looked like it landed
     before it left. What a traveller needs is the wall clock at the place the event happens.
     ⚠ THE ZONE COMES FROM THE COORDINATE, NOT FROM A NAME. `window.IntMapTimeZones.offsetAt(lng,lat)`
     is the app's own zone lookup (#R289–#R293, the same one Chronos's 「地図中心の標準時」 uses) and it
     answers with an OFFSET, so the wall clock is computed rather than handed to `Intl` as an IANA id
     this program does not have. Formatting is then done in UTC on the shifted instant, which is the
     one arrangement where the digits are the local ones on every platform.
     ⚠ AN EXPLICIT SETTING STILL WINS. A reader who pinned a zone in Settings asked for every time in
     the app to be in it, and this does not overrule that — `o.tz` short-circuits the whole thing. */
  function zoneOffsetAt(ll) {
    try {
      if (!ll || !isFinite(+ll[0]) || !isFinite(+ll[1])) return null;
      var TZ = window.IntMapTimeZones;
      if (!TZ || typeof TZ.offsetAt !== 'function') return null;
      var off = TZ.offsetAt(+ll[0], +ll[1]);
      return (off == null || !isFinite(+off)) ? null : +off;
    } catch (e) { return null; }
  }
  function offLabel(off) {
    var s = off < 0 ? '-' : '+', a = Math.abs(off), h = Math.floor(a), m = Math.round((a - h) * 60);
    return 'UTC' + s + (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function clock(when, o, ll) {
    o = use(o);
    try {
      var d = (when instanceof Date) ? when : new Date(when);
      if (!isFinite(d.getTime())) return '';
      var opt = { hour: '2-digit', minute: '2-digit' };
      if (o.tz && o.tz !== 'auto') { opt.timeZone = o.tz; return d.toLocaleTimeString(window.IntMapLang.locale(_lang, 'en-GB'), opt); }
      var off = zoneOffsetAt(ll || o.at);
      if (off == null) return d.toLocaleTimeString(window.IntMapLang.locale(_lang, 'en-GB'), opt);
      opt.timeZone = 'UTC';
      return new Date(d.getTime() + off * 3600000).toLocaleTimeString(window.IntMapLang.locale(_lang, 'en-GB'), opt);
    } catch (e) { return ''; }
  }
  /** the clock time of arrival, and the day offset when the journey lands on another date */
  function eta(startMs, durationS, o) {
    o = use(o);
    var end = new Date((+startMs || Date.now()) + (+durationS || 0) * 1000);
    var s = clock(end, o);
    try {
      var dayOpt = o.tz && o.tz !== 'auto' ? { timeZone: o.tz, day: 'numeric' } : { day: 'numeric' };
      var d0 = new Date(+startMs || Date.now()).toLocaleDateString('en-GB', dayOpt);
      var d1 = end.toLocaleDateString('en-GB', dayOpt);
      if (d0 !== d1) s += ' ' + L('(next day)', '（翌日）', '(Folgetag)', '(след. день)', '(día siguiente)');
    } catch (e) { /* the day marker is a nicety */ }
    return s;
  }

  /* ══ MODES ════════════════════════════════════════════════════════════════════════════════════ */
  function modeLabel(m, o) {
    use(o);
    return ({
      driving: L('Drive', '車', 'Auto', 'Авто', 'Coche'),
      transit: L('Transit', '公共交通', 'ÖPNV', 'Транспорт', 'Transporte'),
      walking: L('Walk', '徒歩', 'Zu Fuß', 'Пешком', 'A pie'),
      cycling: L('Cycle', '自転車', 'Rad', 'Вело', 'Bici'),
    })[m] || m;
  }
  function vehicleKey(m) {
    m = String(m || '').toUpperCase();
    if (/SUBWAY|METRO/.test(m)) return 'subway';
    if (/TRAM|STREETCAR|LIGHT_RAIL/.test(m)) return 'tram';
    if (/BUS|COACH/.test(m)) return 'bus';
    if (/FERRY|BOAT|SHIP/.test(m)) return 'ferry';
    if (/WALK|FOOT/.test(m)) return 'walking';
    if (/BIKE|CYCL/.test(m)) return 'cycling';
    if (/HIGHSPEED|LONG_DISTANCE/.test(m)) return 'highspeed';
    if (/RAIL|TRAIN|REGIONAL|SUBURBAN|NIGHT/.test(m)) return 'rail';
    if (/CAR|DRIV/.test(m)) return 'driving';
    return 'local';
  }
  function vehicleLabel(m, o) {
    use(o);
    return ({
      subway: L('Subway', '地下鉄', 'U-Bahn', 'Метро', 'Metro'),
      tram: L('Tram', '路面電車', 'Straßenbahn', 'Трамвай', 'Tranvía'),
      bus: L('Bus', 'バス', 'Bus', 'Автобус', 'Autobús'),
      ferry: L('Ferry', 'フェリー', 'Fähre', 'Паром', 'Ferri'),
      walking: L('Walk', '徒歩', 'Zu Fuß', 'Пешком', 'A pie'),
      cycling: L('Cycle', '自転車', 'Rad', 'Вело', 'Bici'),
      highspeed: L('High-speed rail', '新幹線', 'Hochgeschwindigkeit', 'Скоростной поезд', 'Alta velocidad'),
      rail: L('Rail', '鉄道', 'Bahn', 'Поезд', 'Tren'),
      driving: L('Drive', '車', 'Auto', 'Авто', 'Coche'),
      local: L('Local service', 'ローカル', 'Nahverkehr', 'Местный', 'Local'),
    })[vehicleKey(m) === m ? m : vehicleKey(m)] || String(m);
  }

  /* ══ REAL-TIME vs TIMETABLE — the distinction §13.1 forbids blurring ═══════════════════════════
     `realTime === true` on a leg is the ONLY thing that earns the word «live». A delay of zero is
     «on time», not «+0 min», and an itinerary whose legs are only PARTLY live says «partly». */
  function realtimeOf(legs) {
    var ride = (legs || []).filter(function (l) { return !l.walk; });
    var live = ride.filter(function (l) { return l.rt === true; });
    if (!ride.length || !live.length) return { kind: 'timetable', live: 0, ride: ride.length, delay: 0 };
    var worst = live.reduce(function (m, l) { return Math.max(m, +l.delay || 0); }, 0);
    return { kind: live.length === ride.length ? 'live' : 'partial', live: live.length, ride: ride.length, delay: worst };
  }
  function realtimeText(rt, o) {
    use(o);
    if (!rt || rt.kind === 'timetable') return L('Timetable', '時刻表', 'Fahrplan', 'По расписанию', 'Horario');
    if (rt.kind === 'partial') return L('Partly real-time', '一部リアルタイム', 'Teilweise Echtzeit', 'Частично в реальном времени', 'Parcialmente en tiempo real')
      + ' (' + rt.live + '/' + rt.ride + ')';
    return L('Real-time', 'リアルタイム', 'Echtzeit', 'В реальном времени', 'Tiempo real');
  }
  function delayText(min, o) {
    use(o);
    min = Math.round(+min || 0);
    if (min > 0) return '+' + min + ' ' + L('min late', '分遅れ', 'Min Versp.', 'мин опозд.', 'min tarde');
    if (min < 0) return Math.abs(min) + ' ' + L('min early', '分早発', 'Min früher', 'мин раньше', 'min antes');
    return L('on time', '定刻', 'pünktlich', 'по расписанию', 'a tiempo');
  }
  function legBadge(l, o) {
    use(o);
    if (l.walk || l.rt !== true) return '';
    var late = (+l.delay || 0);
    var col = late > 0 ? '#ff9f0a' : '#34a853';
    return '<span class="rt-badge" style="color:' + col + ';">● ' + esc(delayText(late, o)) + '</span>';
  }

  /* ⚠ (#R291 追記) THE DIFFERENTIATOR, RENDERED NOW. `a.labelKey` is the descriptor js/routing.js
     produces («fastest» / «shortest» / «+N min» / «route», plus the avoid list); `a.label` is the
     sentence it produced AT THE TIME, which is what an old Atlas message keeps. Rendering from the
     descriptor is what makes a card follow a language switch — see js/routing.js's `_labelRoad`. */
  function altLabel(a, o) {
    o = use(o);
    var k = a && a.labelKey;
    if (!k) return a && a.label ? String(a.label) : '';
    var head = k.k === 'fastest' ? L('Fastest', '最速', 'Schnellste', 'Быстрейший', 'Más rápido')
      : k.k === 'shortest' ? L('Shortest', '最短距離', 'Kürzeste', 'Кратчайший', 'Más corto')
      : k.k === 'delta' ? (k.min > 0 ? ('+' + k.min + ' ' + L('min', '分', 'Min', 'мин', 'min'))
        : L('Alternative', '代替', 'Alternative', 'Альтернатива', 'Alternativa'))
      : L('Route', '経路', 'Route', 'Маршрут', 'Ruta');
    if (!k.avoid || !k.avoid.length) return head;
    var W = { toll: L('tolls', '有料', 'Maut', 'платн.', 'peajes'), motorway: L('highways', '高速', 'Autobahn', 'магистр.', 'autopistas'), ferry: L('ferries', 'フェリー', 'Fähren', 'паромы', 'ferris') };
    return head + ' · ' + L('avoids ', '回避: ', 'ohne ', 'без ', 'evita ') + k.avoid.map(function (x) { return W[x] || x; }).join(', ');
  }

  /* ══ ALTERNATIVE CARDS — one implementation, both surfaces ════════════════════════════════════ */
  function altCards(alts, o) {
    o = use(o);
    var sel = o.sel | 0, setId = o.setId || '', transit = !!o.transit;
    var startMs = o.startMs || Date.now();
    /* (#R298) the set says which KIND it is, so `refreshDetail` can redraw it without being told */
    return '<div class="rt-alts" role="radiogroup" aria-label="' + esc(L('Route options', '経路候補', 'Routenoptionen', 'Варианты маршрута', 'Opciones de ruta')) + '" data-rset="' + esc(setId) + '" data-kind="' + (transit ? 'transit' : 'road') + '">'
      + (alts || []).map(function (a, i) {
        var on = (i === sel);
        var head, sub, aria;
        if (transit) {
          var rt = realtimeOf(a.legs);
          var times = a.startTime ? (clock(a.startTime, o) + ' – ' + clock(a.endTime, o)) : duration(a.duration, o);
          var tf = a.transfers || 0;
          head = '<span class="rt-alt-main">' + esc(times) + '</span>';
          sub = '<span class="rt-alt-sub">' + esc(duration(a.duration, o)) + ' · ' + tf + ' '
            + esc(L('transfers', '回乗換', 'Umst.', 'перес.', 'transb.')) + ' · ' + esc(realtimeText(rt, o))
            + (rt.kind !== 'timetable' && rt.delay > 0 ? (' · ' + esc(delayText(rt.delay, o))) : '') + '</span>';
          aria = times + ', ' + duration(a.duration, o) + ', ' + tf + ' ' + L('transfers', '回乗換', 'Umst.', 'перес.', 'transb.') + ', ' + realtimeText(rt, o);
        } else {
          head = '<span class="rt-alt-main">' + esc(duration(a.duration, o)) + '</span>';
          sub = '<span class="rt-alt-sub">' + esc(distance(a.distance, o))
            + (altLabel(a, o) ? (' · ' + esc(altLabel(a, o))) : '')
            + (a.roads && a.roads.length ? (' · ' + esc(a.roads.slice(0, 2).join(' / '))) : '')
            + ' · ' + esc(L('arrive', '到着', 'Ankunft', 'прибытие', 'llegada')) + ' ' + esc(eta(startMs, a.duration, o)) + '</span>';
          aria = duration(a.duration, o) + ', ' + distance(a.distance, o) + (altLabel(a, o) ? (', ' + altLabel(a, o)) : '');
        }
        var seq = transit ? ('<span class="rt-alt-seq">' + (a.legs || []).filter(function (l) { return !l.walk; }).slice(0, 6).map(function (l) {
          return '<span class="rt-veh" style="color:' + esc(l.color || '#1a73e8') + ';" title="' + esc(vehicleLabel(l.mode, o)) + '">' + glyph(vehicleKey(l.mode), { size: 14 })
            + (l.route ? ('<b>' + esc(l.route) + '</b>') : '') + '</span>';
        }).join('<span class="rt-seq-arrow" aria-hidden="true">›</span>') + '</span>') : '';
        /* ══ ⚠⚠ (#R296) THE CARD OPENS — 「経路カードが広がって詳細が表示されるUIに」 ═══════════════════
           #R291 put the turn list BELOW the card list and wrote down why: 「a list of step BUTTONS
           cannot be nested inside a card that is itself a button」. That is true of a <button>, and it
           was the card's element that made it true — so the card stops being one. It is a `role=radio`
           row with a tabindex, which is what the radiogroup around it already declared it to be, and
           the steps inside are ordinary buttons in ordinary markup.
           ⚠ `data-ai` and `.rt-alt` are UNCHANGED, so every existing handler and test still addresses
           the same thing; only the tag and the extra child are new. `o.detail` is a function so the
           unselected cards cost nothing to render. */
        var det = (on && typeof o.detail === 'function') ? (o.detail(i, a) || '') : '';
        return '<div class="rt-alt' + (on ? ' on' : '') + '" role="radio" aria-checked="' + (on ? 'true' : 'false') + '" tabindex="' + (on ? '0' : '-1') + '"'
          + ' data-ai="' + i + '" aria-label="' + esc(aria) + '">'
          + '<span class="rt-alt-row">'
          + '<span class="rt-alt-key" style="background:' + esc(a.color || '#1a73e8') + ';" aria-hidden="true">' + (i + 1) + '</span>'
          + '<span class="rt-alt-body">' + head + sub + seq + '</span>'
          /* ⚠ (#R298) 「経路カード…選ばれているものが明らかに分かるように」 — the chosen row was told apart
             by a 2 px border and a faint fill, which on a dark basemap through a translucent panel is
             most of the difference between «selected» and «hovered». A filled tick is the third
             signal beside `aria-checked` and the border, and it is drawn in CSS (no glyph, no
             emoji), so it cannot arrive in the wrong language or fail to load. */
          + (on ? '<span class="rt-alt-tick" aria-hidden="true"></span>' : '')
          + '</span>'
          + (det ? ('<div class="rt-alt-detail">' + det + '</div>') : '') + '</div>';
      }).join('') + '</div>';
  }

  /* ══ TURN-BY-TURN — a real button per step (§12), with the lane guidance spelled out ═══════════ */
  function laneText(lane, o) {
    use(o);
    if (!lane) return '';
    var arr = String(lane).split('');
    var okIdx = [], noIdx = [];
    arr.forEach(function (c, i) { (c === '▮' ? okIdx : noIdx).push(i + 1); });
    if (!okIdx.length) return '';
    return L('Lanes: use ', '車線: ', 'Spuren: ', 'Полосы: ', 'Carriles: ')
      + okIdx.join(', ') + ' ' + L('of', '／', 'von', 'из', 'de') + ' ' + arr.length;
  }
  function stepRows(steps, o) {
    o = use(o);
    var mv = o.maneuver || function (s) { return { icon: '↑', text: String(s.name || ''), lane: '', key: 'straight' }; };
    var sel = (o.step == null ? -1 : o.step | 0);
    return (steps || []).map(function (s, i) {
      var m = mv(s);
      var d = distance(s.distance || 0, o);
      var lt = laneText(m.lane, o);
      return '<button type="button" class="rt-step' + (i === sel ? ' on' : '') + '" data-si="' + i + '" aria-current="' + (i === sel ? 'step' : 'false') + '">'
        + '<span class="rt-step-ic" aria-hidden="true">' + glyph(m.key || 'straight', { size: 18 }) + '</span>'
        + '<span class="rt-step-tx">' + esc(m.text) + (lt ? ('<span class="rt-step-lane">' + esc(lt) + '</span>') : '') + '</span>'
        + '<span class="rt-step-d">' + esc(d) + '</span></button>';
    }).join('');
  }

  /* ══ TRANSIT LEGS ═════════════════════════════════════════════════════════════════════════════ */
  function legRows(legs, o) {
    o = use(o);
    return (legs || []).map(function (l) {
      var k = vehicleKey(l.mode);
      var mins = Math.round((l.duration || 0) / 60);
      /* (#R296) the provider's `END` sentinel, said in the reader's language — see js/routing.js */
      var endTx = l.toEnd ? L('Arrival', '到着', 'Ankunft', 'Прибытие', 'Llegada') : '';
      var toTx = l.to || endTx;
      var head = l.walk
        ? (esc(L('Walk', '徒歩', 'Zu Fuß', 'Пешком', 'A pie')) + (toTx ? (' → ' + esc(toTx)) : ''))
        : ((l.route ? ('<b>' + esc(l.route) + '</b> ') : '') + esc(l.headsign || toTx || '') + legBadge(l, o));
      /* (#R296) each end of a ride is clocked WHERE IT HAPPENS — a night train crossing a zone shows
         the boarding time in the boarding city and the arrival in the arriving one. */
      var sub = l.walk ? '' : (esc(l.from || '') + (l.dep ? (' · ' + esc(clock(l.dep, o, l.fromLL))) : '')
        + (l.arr ? (' → ' + esc(clock(l.arr, o, l.toLL))) : ''));
      var est = l.est ? ('<span class="rt-leg-est">' + esc(L('estimate', '目安', 'Schätzung', 'оценка', 'estimación')) + '</span>') : '';
      return '<div class="rt-leg"><span class="rt-leg-ic" style="color:' + esc(l.color || '#7a7f87') + ';" aria-hidden="true">' + glyph(k, { size: 16 }) + '</span>'
        + '<span class="rt-leg-bar" style="background:' + esc(l.color || '#7a7f87') + ';" aria-hidden="true"></span>'
        + '<span class="rt-leg-tx"><span class="rt-sr">' + esc(vehicleLabel(l.mode, o)) + '. </span>' + head + est
        + (sub ? ('<span class="rt-leg-sub">' + sub + '</span>') : '') + '</span>'
        + '<span class="rt-leg-d">' + esc(duration(l.duration, o)) + '</span></div>';
    }).join('') || '';
  }

  /* ══ THE HONEST NOTES ══════════════════════════════════════════════════════════════════════════
     Every one of these is a statement about what the DATA is, and each is emitted only when the
     provider table says so. `roadTimesNote` is unconditional for road modes because none of the
     three routers carries traffic (§7.2). */
  function note(kind, o) {
    o = use(o);
    var P = window.IntMapRouteProviders;
    var M = {
      roadTypical: L('Typical travel time — live traffic is not included.', '標準所要時間 — リアルタイム交通量は未反映です。', 'Übliche Fahrzeit — ohne Live-Verkehr.', 'Типовое время в пути — без учёта пробок.', 'Tiempo habitual — sin tráfico en vivo.'),
      timeIsOffset: L('The time you set shifts the arrival calculation only; the road provider has no traffic forecast to give it to.', '指定時刻は到着時刻の計算に使うだけです。道路側のプロバイダーに渡せる交通予測はありません。', 'Die gewählte Zeit verschiebt nur die Ankunftsrechnung — der Straßendienst hat keine Verkehrsprognose.', 'Указанное время влияет только на расчёт прибытия — у дорожного сервиса нет прогноза трафика.', 'La hora elegida solo desplaza el cálculo de llegada; el servicio vial no tiene previsión de tráfico.'),
      altsViaOsrm: L('Alternatives are not available with stops on this provider — showing one route.', '経由地があるため、このプロバイダーでは代替経路を取得できません — 1経路を表示しています。', 'Mit Zwischenzielen liefert dieser Dienst keine Alternativen — eine Route.', 'С промежуточными точками этот сервис не даёт альтернатив — показан один маршрут.', 'Con paradas este proveedor no da alternativas — se muestra una ruta.'),
      altsAvoid: L('Your avoid options are honoured by a provider that returns one route, so there are no alternatives to compare.', '回避条件は1経路のみを返すプロバイダーで処理しているため、比較できる代替経路はありません。', 'Die Meiden-Optionen werden von einem Dienst erfüllt, der nur eine Route liefert.', 'Исключения выполняет сервис, возвращающий один маршрут.', 'Las exclusiones las cumple un proveedor que devuelve una sola ruta.'),
      avoidDropped: L('The avoid options could NOT be applied (the provider was unreachable) — this is the ordinary route.', '回避条件を適用できませんでした（プロバイダーに接続できず）— これは通常経路です。', 'Die Meiden-Optionen konnten NICHT angewandt werden — dies ist die normale Route.', 'Исключения НЕ применены (сервис недоступен) — это обычный маршрут.', 'No se pudieron aplicar las exclusiones — esta es la ruta normal.'),
      areaDropped: L('The keep-out area could NOT be applied (the provider was unreachable) — this route may pass through it.', '通過禁止範囲を適用できませんでした（プロバイダーに接続できず）— この経路は範囲内を通る可能性があります。', 'Die Sperrfläche konnte NICHT angewandt werden — die Route kann hindurchführen.', 'Запретная зона НЕ применена — маршрут может проходить через неё.', 'La zona prohibida NO se aplicó — la ruta puede atravesarla.'),
      motorwayPref: L('“Avoid highways” is a strong preference on this provider, not a prohibition.', '「高速道路を回避」はこのプロバイダーでは強い優先設定であり、絶対的な禁止ではありません。', '„Autobahn meiden“ ist hier eine starke Präferenz, kein Verbot.', '«Избегать магистралей» здесь — сильное предпочтение, не запрет.', '«Evitar autopistas» es una preferencia fuerte, no una prohibición.'),
      shapeGap: L('Some ride segments have no usable shape — those legs are listed but not drawn (no straight-line substitutes).', '一部の乗車区間は形状データが使えません — 行程には表示しますが地図には描きません（直線での代用はしません）。', 'Einige Fahrtabschnitte haben keine Geometrie — sie stehen in der Liste, werden aber nicht gezeichnet.', 'У части участков нет геометрии — они в списке, но не нарисованы.', 'Algunos tramos no tienen geometría — se listan pero no se dibujan.'),
      jrEstimate: L('Intercity Japan: real Shinkansen lines and stations, with times estimated from the operators’ published timetables — not live departures. The alignment between stations is schematic.', '日本の都市間鉄道: 実在の新幹線路線・停車駅に基づき、所要時間は各社の公表時刻表からの概算です（リアルタイムではありません）。駅間の線形は概略です。', 'Japan-Fernverkehr: echte Shinkansen-Linien, Zeiten aus veröffentlichten Fahrplänen geschätzt. Linienverlauf schematisch.', 'Междугородние ж/д Японии: реальные линии, время — оценка по опубликованным расписаниям. Линия схематична.', 'Interurbano de Japón: líneas reales, tiempos estimados de horarios publicados. Trazado esquemático.'),
      transitTimetable: L('Timetable-based — no real-time data is published for this trip.', '時刻表ベース — この旅程のリアルタイム情報は公開されていません。', 'Fahrplanbasiert — keine Echtzeitdaten für diese Verbindung.', 'По расписанию — данных реального времени нет.', 'Según horario — sin datos en tiempo real.'),
      transitLive: L('Includes real-time departures and delays where the operator publishes them.', '事業者が公開している範囲で、実時刻・遅延を含みます。', 'Enthält Echtzeit-Abfahrten und Verspätungen, soweit veröffentlicht.', 'Включает реальные отправления и задержки, где они публикуются.', 'Incluye salidas y retrasos en tiempo real donde se publican.'),
    };
    var txt = M[kind];
    if (!txt) return '';
    var live = P && P.supports(o.mode || 'driving', 'liveTraffic');
    if (kind === 'roadTypical' && live) return '';     /* the day a traffic provider exists, this note stops being true */
    return '<div class="rt-note">' + esc(txt) + '</div>';
  }

  /** the provider line — who answered, so a reader can tell an outage from «no route here» */
  function providerLine(id, o) {
    o = use(o);
    var p = window.IntMapRouteProviders && window.IntMapRouteProviders.byId(id);
    if (!p) return '';
    return '<div class="rt-prov">' + esc(L('Routed by ', '経路提供: ', 'Berechnet von ', 'Маршрут от ', 'Ruta de ') + p.name + ' · ' + p.attribution) + '</div>';
  }

  /* ══ ⚠⚠⚠ (#R298) 「Atlas内の経路UIを勝手に例外にするな」 — ONE SHAPE, BOTH SURFACES ═══════════
     #R291 put the turn list BELOW the cards because 「a list of step BUTTONS cannot be nested inside a
     card that is itself a button」, and #R296 removed that constraint for the PANEL by making the card
     a `role=radio` row instead of a `<button>` — but Atlas kept the sibling block, so the same
     renderer drew two different layouts depending on which surface asked. The reader named it.
     Selecting a card now REDRAWS THE SET, which is the only thing that can move the detail from one
     card into another, and it is what the panel's own subscription already did.
     ⚠ The set is addressed by its routeSetId, unique per computed set (#R126 §24.3), so an Atlas
     message from ten replies ago redraws ITS OWN cards and never the active route's. This lives here
     rather than in js/atlas-console.js because it is rendering, and because that file has a line
     ceiling that only ever comes down (#R199 ⑤). */
  function refreshDetail(setId, ai, o) {
    try {
      var sid = String(setId || '').replace(/[^A-Za-z0-9_-]/g, '');
      var box = document.querySelector('.rt-alts[data-rset="' + sid + '"]');
      if (!box) return false;
      var alts = window.IntMapRouting.altsOf(setId) || [];
      if (!alts.length) return false;
      var transit = box.getAttribute('data-kind') === 'transit';
      var det = function (i2, a2) {
        return transit ? legRows(a2.legs, o)
          : stepRows(a2.steps, Object.assign({}, o, { maneuver: function (s) { return window.IntMapRouting.maneuver(s); } }));
      };
      box.outerHTML = altCards(alts, Object.assign({}, o, { sel: ai | 0, setId: setId, transit: transit, detail: det }));
      return true;
    } catch (e) { return false; }
  }

  return {
    svg: svg, glyph: glyph, GLYPH: GLYPH, refreshDetail: refreshDetail,
    duration: duration, distance: distance, clock: clock, eta: eta,
    modeLabel: modeLabel, vehicleKey: vehicleKey, vehicleLabel: vehicleLabel,
    realtimeOf: realtimeOf, realtimeText: realtimeText, delayText: delayText, legBadge: legBadge,
    altCards: altCards, stepRows: stepRows, legRows: legRows, laneText: laneText, altLabel: altLabel,
    note: note, providerLine: providerLine,
    esc: esc, setLang: function (l) { _lang = l || 'en'; },
  };
})();
