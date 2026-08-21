/* ============================================================================
 *  IntMap · WIDGET DEFINITIONS — TIME · PROGRESS · MOON · SUN · CALENDAR
 * ----------------------------------------------------------------------------
 *  Everything in this file computes locally: no loader, no network, no request key. They ride the
 *  ONE shared ticker in js/widget-core.js (§7.A) — the previous board gave the whole board a 1 Hz
 *  interval that redrew every locally-computed card every second whether or not it showed seconds.
 *
 *  ══ WHAT S / M / L ACTUALLY MEAN HERE (§6) ═════════════════════════════════════════════════════
 *  Not one layout at three font sizes. The digital clock at S is the time; at M it is the time with
 *  its date and zone; at L it is a table of the reader's cities with each one's day/night state and
 *  offset from here. The progress family at L stops being a bar at all and becomes the day, the
 *  week and the year on one axis. tests/r292-checks asserts, per family, that the three renderers
 *  emit different information elements — a CSS-only difference fails it.
 * ==========================================================================*/
window.IntMapWidgetDefsTime = (function () {
  'use strict';

  var WC = window.IntMapWidgetCore;
  var R = window.IntMapWidgetRender;
  var el = WC.el;
  var L = WC.L;

  /* ══ SHARED ASTRONOMY / CALENDAR MATH ═════════════════════════════════════════════════════════
     ⚠ The same constants the previous board used, so no value on screen changes meaning: the
     synodic month and the 2000-01-06 18:14 UTC new-moon epoch. What changes is that they are
     computed ONCE per tick here rather than re-derived inside four separate card callbacks. */
  var SYNODIC = 29.530588853;
  var NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14);

  function moonAge(at) {
    var a = (((at - NEW_MOON_EPOCH) / 864e5) % SYNODIC + SYNODIC) % SYNODIC;
    return a;
  }
  function moonPhase(at) {
    var age = moonAge(at), ph = age / SYNODIC;
    var idx = Math.round(ph * 8) % 8;
    return {
      age: age, phase: ph, index: idx,
      illum: (1 - Math.cos(ph * 2 * Math.PI)) / 2 * 100,
      toFull: ((SYNODIC / 2) - age + SYNODIC) % SYNODIC,
      toNew: (SYNODIC - age) % SYNODIC,
      waxing: ph < 0.5,
    };
  }
  function phaseName(i) {
    return [
      L('New moon', '新月', 'Neumond', 'Новолуние', 'Luna nueva'),
      L('Waxing crescent', '三日月', 'Zunehmende Sichel', 'Растущий серп', 'Luna creciente'),
      L('First quarter', '上弦の月', 'Erstes Viertel', 'Первая четверть', 'Cuarto creciente'),
      L('Waxing gibbous', '十三夜月', 'Zunehmender Mond', 'Растущая луна', 'Gibosa creciente'),
      L('Full moon', '満月', 'Vollmond', 'Полнолуние', 'Luna llena'),
      L('Waning gibbous', '寝待月', 'Abnehmender Mond', 'Убывающая луна', 'Gibosa menguante'),
      L('Last quarter', '下弦の月', 'Letztes Viertel', 'Последняя четверть', 'Cuarto menguante'),
      L('Waning crescent', '有明月', 'Abnehmende Sichel', 'Убывающий серп', 'Luna menguante'),
    ][i % 8];
  }
  /* ⚠ THE MOON IS DRAWN, NOT SPELLED. The previous board printed one of eight emoji, which a
     screen reader reads as "waxing crescent moon symbol" in ENGLISH whatever the page language,
     and which renders as a different picture on every platform. This is the terminator: one circle
     plus one ellipse whose x-radius is the cosine of the phase angle. */
  function moonDisc(ph, size) {
    var s = size || 40, r = s / 2 - 1, cx = s / 2, cy = s / 2;
    var k = Math.cos(ph * 2 * Math.PI);                 /* +1 new … −1 full */
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + s + ' ' + s);
    svg.setAttribute('width', String(s)); svg.setAttribute('height', String(s));
    svg.setAttribute('class', 'wgt-moon');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', phaseName(Math.round(ph * 8) % 8));
    function add(tag, attrs) { var n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (var a in attrs) n.setAttribute(a, String(attrs[a])); svg.appendChild(n); return n; }
    add('circle', { cx: cx, cy: cy, r: r, class: 'wgt-moon-dark' });
    /* the lit half, then the terminator ellipse painted in whichever colour the phase needs */
    var lit = add('path', { class: 'wgt-moon-lit', d: ph < 0.5
      ? 'M' + cx + ' ' + (cy - r) + 'A' + r + ' ' + r + ' 0 0 1 ' + cx + ' ' + (cy + r) + 'Z'
      : 'M' + cx + ' ' + (cy - r) + 'A' + r + ' ' + r + ' 0 0 0 ' + cx + ' ' + (cy + r) + 'Z' });
    void lit;
    add('ellipse', { cx: cx, cy: cy, rx: Math.abs(k) * r, ry: r, class: (ph < 0.25 || ph > 0.75) ? 'wgt-moon-dark' : 'wgt-moon-lit' });
    add('circle', { cx: cx, cy: cy, r: r, class: 'wgt-moon-rim' });
    return svg;
  }

  function dayProgress(now, tz) {
    var p = partsIn(now, tz);
    var secs = p.hour * 3600 + p.minute * 60 + p.second;
    return { pct: secs / 864 / 100 * 100, elapsedSec: secs, leftSec: 86400 - secs };
  }
  function yearProgress(now, tz) {
    var p = partsIn(now, tz);
    var a = Date.UTC(p.year, 0, 1), b = Date.UTC(p.year + 1, 0, 1);
    var t = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return { pct: (t - a) / (b - a) * 100, day: Math.floor((t - a) / 864e5) + 1, days: Math.round((b - a) / 864e5), year: p.year };
  }
  function isoWeek(now, tz) {
    var p = partsIn(now, tz);
    var d = new Date(Date.UTC(p.year, p.month - 1, p.day));
    var dn = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dn + 3);
    var ft = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    var wk = 1 + Math.round(((d - ft) / 864e5 - 3 + ((ft.getUTCDay() + 6) % 7)) / 7);
    return { week: wk, dow: dn, pct: ((dn * 86400) + (p.hour * 3600 + p.minute * 60 + p.second)) / (7 * 86400) * 100, isoYear: d.getUTCFullYear() };
  }
  /* ⚠ EVERY "WHAT TIME IS IT THERE" QUESTION GOES THROUGH Intl, NOT THROUGH A Date CONSTRUCTED
     FROM A LOCALE STRING. `new Date(now.toLocaleString('en-US',{timeZone}))` — which the previous
     analog clock used — re-parses a formatted string in the DEVICE's zone and is wrong by the
     device's own offset whenever the two differ. `formatToParts` answers the question directly. */
  function partsIn(now, tz) {
    try {
      var f = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
      });
      var o = {};
      f.formatToParts(now).forEach(function (p) { o[p.type] = p.value; });
      return {
        year: +o.year, month: +o.month, day: +o.day,
        hour: (+o.hour) % 24, minute: +o.minute, second: +o.second, weekday: o.weekday,
      };
    } catch (e) {
      return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), hour: now.getHours(), minute: now.getMinutes(), second: now.getSeconds(), weekday: '' };
    }
  }
  function offsetHours(now, tz) {
    try {
      var here = partsIn(now, undefined), there = partsIn(now, tz);
      var a = Date.UTC(here.year, here.month - 1, here.day, here.hour, here.minute);
      var b = Date.UTC(there.year, there.month - 1, there.day, there.hour, there.minute);
      return Math.round((b - a) / 36e5 * 2) / 2;
    } catch (e) { return 0; }
  }
  function utcOffsetLabel(now, tz) {
    try {
      var f = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' });
      var p = f.formatToParts(now).find(function (x) { return x.type === 'timeZoneName'; });
      return p ? p.value : '';
    } catch (e) { return ''; }
  }
  function zoneLabel(tz) { return String(tz || '').split('/').pop().replace(/_/g, ' '); }
  function hhmm(now, tz, seconds) {
    try {
      return new Intl.DateTimeFormat(WC.locale(), { hour: '2-digit', minute: '2-digit', second: seconds ? '2-digit' : undefined, timeZone: tz, hour12: undefined }).format(now);
    } catch (e) { return ''; }
  }
  function isDaylight(now, tz, lat) {
    var p = partsIn(now, tz);
    var h = p.hour + p.minute / 60;
    void lat;
    return h >= 6 && h < 18;                    /* the coarse label only — no daylight claim beyond it */
  }
  function hm(sec) {
    var m = Math.round(sec / 60);
    return { h: Math.floor(m / 60), m: m % 60 };
  }
  function durText(sec) {
    var t = hm(sec);
    return L(t.h + 'h ' + t.m + 'm', t.h + '時間' + t.m + '分', t.h + ' Std. ' + t.m + ' Min.', t.h + ' ч ' + t.m + ' мин', t.h + ' h ' + t.m + ' min');
  }

  /* ══ TIMEZONE CHOICES ═════════════════════════════════════════════════════════════════════════
     ⚠ IANA IDENTIFIERS, NOT PROSE. They are the keys the platform's own database is indexed by,
     and translating one would make it stop resolving. The LABEL a reader sees comes from Intl
     (`zoneLabel` + `utcOffsetLabel`), in their language. */
  var TZ_CHOICES = ['UTC', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Moscow',
    'Africa/Cairo', 'Africa/Lagos', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok',
    'Asia/Shanghai', 'Asia/Taipei', 'Asia/Hong_Kong', 'Asia/Seoul', 'Asia/Tokyo', 'Australia/Sydney',
    'Pacific/Auckland', 'America/Sao_Paulo', 'America/New_York', 'America/Chicago', 'America/Denver',
    'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'];

  function tzOptions() {
    var now = new Date();
    return TZ_CHOICES.map(function (z) { return { value: z, label: zoneLabel(z) + ' · ' + utcOffsetLabel(now, z) }; });
  }

  /* ══ THE TIME FAMILY ══════════════════════════════════════════════════════════════════════════ */
  var TIME_CFG = {
    zone: { type: 'timezone', default: function () { return WC.tz() || (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'); },
      label: function () { return L('Time zone', 'タイムゾーン', 'Zeitzone', 'Часовой пояс', 'Zona horaria'); }, options: tzOptions },
    seconds: { type: 'boolean', default: false, label: function () { return L('Show seconds', '秒を表示', 'Sekunden anzeigen', 'Показывать секунды', 'Mostrar segundos'); } },
    face: { type: 'enum', values: ['digital', 'analog', 'both'], default: 'digital',
      label: function () { return L('Face', '表示形式', 'Anzeige', 'Вид', 'Formato'); },
      options: function () { return [
        { value: 'digital', label: L('Digital', 'デジタル', 'Digitalanzeige', 'Цифровые', 'Digital') },
        { value: 'analog', label: L('Analog', 'アナログ', 'Analoganzeige', 'Аналоговые', 'Analógico') },
        { value: 'both', label: L('Both', '両方', 'Beide', 'Оба', 'Ambos') },
      ]; } },
    cities: { type: 'list', max: 6, of: function (x) { return typeof x === 'string' && x.length < 64; },
      default: function () { return ['Asia/Tokyo', 'Europe/London', 'America/New_York']; },
      label: function () { return L('Cities', '都市', 'Städte', 'Города', 'Ciudades'); }, options: tzOptions },
  };

  function analogFace(now, tz, size, seconds) {
    var p = partsIn(now, tz);
    var s = size || 74, c = s / 2;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('width', String(s)); svg.setAttribute('height', String(s));
    svg.setAttribute('class', 'wgt-clockface');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', hhmm(now, tz, seconds));
    void c;
    function add(tag, attrs) { var n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (var a in attrs) n.setAttribute(a, String(attrs[a])); svg.appendChild(n); return n; }
    for (var i = 0; i < 12; i++) {
      var a = (i * 30 - 90) * Math.PI / 180;
      add('line', { x1: (50 + 40 * Math.cos(a)).toFixed(1), y1: (50 + 40 * Math.sin(a)).toFixed(1),
        x2: (50 + 45.5 * Math.cos(a)).toFixed(1), y2: (50 + 45.5 * Math.sin(a)).toFixed(1),
        class: 'wgt-cf-t' + (i % 3 === 0 ? ' major' : '') });
    }
    function hand(ang, len, cls) {
      var r = (ang - 90) * Math.PI / 180;
      add('line', { x1: 50, y1: 50, x2: (50 + len * Math.cos(r)).toFixed(1), y2: (50 + len * Math.sin(r)).toFixed(1), class: cls });
    }
    var hh = p.hour % 12, mm = p.minute, ss = p.second;
    hand((hh + mm / 60) * 30, 24, 'wgt-cf-h');
    hand((mm + ss / 60) * 6, 34, 'wgt-cf-m');
    if (seconds) hand(ss * 6, 38, 'wgt-cf-s');
    add('circle', { cx: 50, cy: 50, r: 2.6, class: 'wgt-cf-c' });
    return svg;
  }

  WC.define({
    id: 'time.digital', family: 'time', variant: 'digital', category: 'time-cal', icon: 'clock',
    legacyIds: ['clock'], multi: true,
    nm: function () { return L('Clock', '時計', 'Uhr', 'Часы', 'Reloj'); },
    desc: function () { return L('Time and date, in any zone', '任意のタイムゾーンの時刻と日付', 'Uhrzeit und Datum in jeder Zeitzone', 'Время и дата в любом поясе', 'Hora y fecha en cualquier zona'); },
    keywords: function () { return [L('clock', '時計', 'Uhr', 'часы', 'reloj'), L('time', '時刻', 'Zeit', 'время', 'hora'), L('date', '日付', 'Datum', 'дата', 'fecha')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 's',
    configSchema: { zone: TIME_CFG.zone, seconds: TIME_CFG.seconds, face: TIME_CFG.face, cities: TIME_CFG.cities },
    defaultConfig: function () { return { zone: WC.tz() || (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'), seconds: false, face: 'digital', cities: ['Asia/Tokyo', 'Europe/London', 'America/New_York'] }; },
    refreshPolicy: { kind: 'realtime-local', tick: function (cfg) { return cfg.seconds || cfg.face === 'analog' || cfg.face === 'both' ? 'second' : 'minute'; } },
    renderers: {
      s: function (ctx, cfg, st, api) {
        var now = st.now || new Date(), tz = cfg.zone;
        if (cfg.face === 'analog') return el('div', { class: 'wgt-body center' }, [analogFace(now, tz, 78, cfg.seconds)]);
        return el('div', { class: 'wgt-body' }, [R.value({ value: hhmm(now, tz, cfg.seconds) })]);
      },
      m: function (ctx, cfg, st, api) {
        var now = st.now || new Date(), tz = cfg.zone;
        var main = el('div', { class: 'wgt-row gap' }, [
          (cfg.face === 'analog' || cfg.face === 'both') ? analogFace(now, tz, 64, cfg.seconds) : null,
          R.value({
            small: cfg.face === 'analog',
            value: cfg.face === 'analog' ? WC.date(now, { weekday: 'long', timeZone: tz }) : hhmm(now, tz, cfg.seconds),
            caption: WC.date(now, { month: 'short', day: 'numeric', year: 'numeric', timeZone: tz }),
          }),
        ]);
        return el('div', { class: 'wgt-body' }, [main,
          R.chips([{ icon: 'world', label: zoneLabel(tz), value: utcOffsetLabel(now, tz) }]),
          R.actions([{ label: L('Change zone', 'タイムゾーン変更', 'Zeitzone ändern', 'Сменить пояс', 'Cambiar zona'), icon: 'gear', run: function () { api.openConfig(); } }]),
        ]);
      },
      /* L: the reader's cities, each with its day/night state and its offset from HERE (§7.A) */
      l: function (ctx, cfg, st, api) {
        var now = st.now || new Date();
        var home = cfg.zone;
        var rows = [{ tz: home, home: true }].concat((cfg.cities || []).filter(function (z) { return z !== home; }).map(function (z) { return { tz: z }; }));
        return el('div', { class: 'wgt-body' }, [
          el('div', { class: 'wgt-row gap' }, [
            (cfg.face === 'analog' || cfg.face === 'both') ? analogFace(now, home, 72, cfg.seconds) : null,
            R.value({ value: hhmm(now, home, cfg.seconds), caption: WC.date(now, { weekday: 'long', month: 'long', day: 'numeric', timeZone: home }) }),
          ]),
          R.list(rows.map(function (r) {
            var off = r.home ? 0 : offsetHours(now, r.tz) - offsetHours(now, home);
            var day = isDaylight(now, r.tz);
            return {
              icon: day ? 'sun' : 'moon',
              title: zoneLabel(r.tz),
              sub: utcOffsetLabel(now, r.tz) + (r.home ? ' · ' + L('here', 'ここ', 'hier', 'здесь', 'aquí')
                : ' · ' + (off === 0 ? L('same time', '同時刻', 'gleiche Zeit', 'то же время', 'misma hora')
                  : (off > 0 ? '+' : '−') + Math.abs(off) + L('h', '時間', ' Std.', ' ч', ' h'))),
              trailing: hhmm(now, r.tz, false),
              label: zoneLabel(r.tz) + ' ' + hhmm(now, r.tz, false) + ' — ' + (day ? L('daytime', '昼', 'Tag', 'день', 'día') : L('night-time', '夜', 'Nacht', 'ночь', 'noche')),
            };
          }), { dense: true }),
          R.actions([
            { label: L('Edit cities', '都市を編集', 'Städte bearbeiten', 'Изменить города', 'Editar ciudades'), icon: 'gear', run: function () { api.openConfig(); } },
          ]),
        ]);
      },
    },
  });

  WC.define({
    id: 'time.analog', family: 'time', variant: 'analog', category: 'time-cal', icon: 'analog',
    legacyIds: ['aclock'], multi: true,
    nm: function () { return L('Analog clock', 'アナログ時計', 'Analoguhr', 'Аналоговые часы', 'Reloj analógico'); },
    desc: function () { return L('An analog face, with a sweeping second hand', '秒針の動くアナログ文字盤', 'Ein analoges Zifferblatt mit Sekundenzeiger', 'Аналоговый циферблат с секундной стрелкой', 'Una esfera analógica con segundero'); },
    keywords: function () { return [L('analog', 'アナログ', 'analog', 'аналоговые', 'analógico'), L('clock', '時計', 'Uhr', 'часы', 'reloj')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 's',
    configSchema: { zone: TIME_CFG.zone, seconds: Object.assign({}, TIME_CFG.seconds, { default: true }), cities: TIME_CFG.cities },
    defaultConfig: function () { return { zone: WC.tz() || (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'), seconds: true, cities: ['Asia/Tokyo', 'Europe/London', 'America/New_York'] }; },
    refreshPolicy: { kind: 'realtime-local', tick: function (cfg) { return cfg.seconds ? 'second' : 'minute'; } },
    renderers: {
      s: function (ctx, cfg, st) { return el('div', { class: 'wgt-body center' }, [analogFace(st.now || new Date(), cfg.zone, 82, cfg.seconds)]); },
      m: function (ctx, cfg, st) {
        var now = st.now || new Date();
        return el('div', { class: 'wgt-body' }, [
          el('div', { class: 'wgt-row gap' }, [analogFace(now, cfg.zone, 70, cfg.seconds),
            R.value({ small: true, value: hhmm(now, cfg.zone, cfg.seconds), caption: WC.date(now, { weekday: 'short', month: 'short', day: 'numeric', timeZone: cfg.zone }) })]),
          R.chips([{ icon: 'world', label: zoneLabel(cfg.zone), value: utcOffsetLabel(now, cfg.zone) }]),
        ]);
      },
      l: function (ctx, cfg, st) {
        var now = st.now || new Date();
        var zones = [cfg.zone].concat((cfg.cities || []).filter(function (z) { return z !== cfg.zone; })).slice(0, 4);
        return el('div', { class: 'wgt-body' }, [
          el('div', { class: 'wgt-faces' }, zones.map(function (z) {
            return el('div', { class: 'wgt-face' }, [analogFace(now, z, 66, cfg.seconds),
              el('span', { class: 'wgt-face-n', text: zoneLabel(z) }),
              el('span', { class: 'wgt-face-o', text: utcOffsetLabel(now, z) })]);
          })),
        ]);
      },
    },
  });

  WC.define({
    id: 'time.world', family: 'time', variant: 'world', category: 'time-cal', icon: 'world',
    legacyIds: ['worldclock'], multi: true,
    nm: function () { return L('World clock', '世界時計', 'Weltzeituhr', 'Мировые часы', 'Reloj mundial'); },
    desc: function () { return L('Another city’s time, and its offset from yours', '他都市の時刻と時差', 'Die Zeit einer anderen Stadt und die Differenz', 'Время другого города и разница', 'La hora de otra ciudad y su diferencia'); },
    keywords: function () { return [L('world clock', '世界時計', 'Weltzeit', 'мировое время', 'reloj mundial'), L('timezone', 'タイムゾーン', 'Zeitzone', 'часовой пояс', 'zona horaria')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: { tz: Object.assign({}, TIME_CFG.zone, { default: 'Asia/Tokyo' }), seconds: TIME_CFG.seconds, cities: TIME_CFG.cities },
    defaultConfig: function () { return { tz: 'Asia/Tokyo', seconds: false, cities: [] }; },
    refreshPolicy: { kind: 'realtime-local', tick: function (cfg) { return cfg.seconds ? 'second' : 'minute'; } },
    title: function (cfg) { return L('World clock', '世界時計', 'Weltzeituhr', 'Мировые часы', 'Reloj mundial') + ' · ' + zoneLabel(cfg.tz); },
    renderers: {
      s: function (ctx, cfg, st) {
        var now = st.now || new Date();
        return el('div', { class: 'wgt-body' }, [R.value({ value: hhmm(now, cfg.tz, cfg.seconds), caption: zoneLabel(cfg.tz) })]);
      },
      m: function (ctx, cfg, st, api) {
        var now = st.now || new Date(), here = WC.tz() || Intl.DateTimeFormat().resolvedOptions().timeZone;
        var off = offsetHours(now, cfg.tz) - offsetHours(now, here);
        return el('div', { class: 'wgt-body' }, [
          R.value({
            value: hhmm(now, cfg.tz, cfg.seconds),
            caption: WC.date(now, { weekday: 'short', month: 'short', day: 'numeric', timeZone: cfg.tz }),
          }),
          R.chips([
            { icon: 'world', label: zoneLabel(cfg.tz), value: utcOffsetLabel(now, cfg.tz) },
            { icon: off === 0 ? 'check' : 'clock', label: L('vs. here', 'こことの差', 'ggü. hier', 'от вас', 'vs. aquí'),
              value: off === 0 ? L('same', '同じ', 'gleich', 'то же', 'igual') : (off > 0 ? '+' : '−') + Math.abs(off) + L('h', '時間', ' Std.', ' ч', ' h') },
            { icon: isDaylight(now, cfg.tz) ? 'sun' : 'moon', label: isDaylight(now, cfg.tz) ? L('daytime', '昼', 'Tag', 'день', 'día') : L('night-time', '夜', 'Nacht', 'ночь', 'noche') },
          ]),
          R.actions([{ label: L('Change city', '都市を変更', 'Stadt ändern', 'Сменить город', 'Cambiar ciudad'), icon: 'gear', run: function () { api.openConfig(); } }]),
        ]);
      },
      l: function (ctx, cfg, st, api) {
        var now = st.now || new Date(), here = WC.tz() || Intl.DateTimeFormat().resolvedOptions().timeZone;
        var zones = [cfg.tz].concat((cfg.cities || []).filter(function (z) { return z !== cfg.tz; }));
        return el('div', { class: 'wgt-body' }, [
          R.value({ value: hhmm(now, cfg.tz, cfg.seconds), caption: WC.date(now, { weekday: 'long', month: 'long', day: 'numeric', timeZone: cfg.tz }) }),
          R.list(zones.map(function (z) {
            var o = offsetHours(now, z) - offsetHours(now, here);
            return { icon: isDaylight(now, z) ? 'sun' : 'moon', title: zoneLabel(z),
              sub: utcOffsetLabel(now, z) + ' · ' + (o === 0 ? L('same time', '同時刻', 'gleiche Zeit', 'то же время', 'misma hora') : (o > 0 ? '+' : '−') + Math.abs(o) + L('h', '時間', ' Std.', ' ч', ' h')),
              trailing: hhmm(now, z, false) };
          }), { dense: true }),
          R.actions([{ label: L('Edit cities', '都市を編集', 'Städte bearbeiten', 'Изменить города', 'Editar ciudades'), icon: 'gear', run: function () { api.openConfig(); } }]),
        ]);
      },
    },
  });

  WC.define({
    id: 'time.unix', family: 'time', variant: 'unix', category: 'time-cal', icon: 'hash',
    legacyIds: ['unixclock'],
    nm: function () { return L('Unix time', 'Unix時間', 'Unixzeit', 'Unix-время', 'Tiempo Unix'); },
    desc: function () { return L('Seconds since 1970-01-01 UTC', '1970-01-01 UTCからの秒数', 'Sekunden seit 1970-01-01 UTC', 'Секунды с 1970-01-01 UTC', 'Segundos desde 1970-01-01 UTC'); },
    keywords: function () { return ['unix', 'epoch', 'posix', L('timestamp', 'タイムスタンプ', 'Zeitstempel', 'метка времени', 'marca de tiempo')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 's',
    configSchema: {}, defaultConfig: function () { return {}; },
    refreshPolicy: { kind: 'realtime-local', tick: function () { return 'second'; } },
    renderers: {
      s: function (ctx, cfg, st) { return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: WC.num(Math.floor((st.now || new Date()).getTime() / 1000)) })]); },
      m: function (ctx, cfg, st) {
        var now = st.now || new Date();
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: WC.num(Math.floor(now.getTime() / 1000)), caption: L('seconds since 1970-01-01 UTC', '1970-01-01 UTC からの秒数', 'Sekunden seit 1970-01-01 UTC', 'секунд с 1970-01-01 UTC', 'segundos desde 1970-01-01 UTC') }),
          R.facts([{ k: L('Milliseconds', 'ミリ秒', 'Millisekunden', 'Миллисекунды', 'Milisegundos'), v: WC.num(now.getTime()) }]),
        ]);
      },
      l: function (ctx, cfg, st) {
        var now = st.now || new Date(), s = Math.floor(now.getTime() / 1000);
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: WC.num(s), caption: L('seconds since 1970-01-01 UTC', '1970-01-01 UTC からの秒数', 'Sekunden seit 1970-01-01 UTC', 'секунд с 1970-01-01 UTC', 'segundos desde 1970-01-01 UTC') }),
          R.facts([
            { k: L('Milliseconds', 'ミリ秒', 'Millisekunden', 'Миллисекунды', 'Milisegundos'), v: WC.num(now.getTime()) },
            /* ⚠ NOT A TRANSLATION CALL. «ISO 8601» is a standard's designation, not prose — a language
               table that could change it would be renaming the standard. */
            { k: 'ISO 8601', v: now.toISOString() },
            { k: L('Hexadecimal', '16進', 'Hexadezimal', 'Шестнадцатеричное', 'Hexadecimal'), v: '0x' + s.toString(16) },
            { k: L('Day of year', '通日', 'Tag des Jahres', 'День года', 'Día del año'), v: yearProgress(now, WC.tz()).day },
          ], { cols: 2 }),
        ]);
      },
    },
  });

  /* ══ THE PROGRESS FAMILY ══════════════════════════════════════════════════════════════════════ */
  var PROG_CFG = {
    zone: TIME_CFG.zone,
    style: { type: 'enum', values: ['bar', 'ring'], default: 'bar', label: function () { return L('Style', '表示', 'Stil', 'Стиль', 'Estilo'); },
      options: function () { return [{ value: 'bar', label: L('Bar', 'バー', 'Balken', 'Полоса', 'Barra') }, { value: 'ring', label: L('Ring', 'リング', 'Ringform', 'Кольцо', 'Anillo') }]; } },
    follow: { type: 'boolean', default: false, label: function () { return L('Follow the Chronos time', 'Chronos の時刻に追従', 'Der Chronos-Zeit folgen', 'Следовать времени Chronos', 'Seguir la hora de Chronos'); } },
  };
  function progNow(ctx, cfg, st) {
    if (cfg.follow && ctx.chronos && !ctx.chronos.isLive) return new Date(ctx.chronos.when);
    return st.now || new Date();
  }
  function progAllRows(now, tz) {
    var d = dayProgress(now, tz), w = isoWeek(now, tz), y = yearProgress(now, tz);
    return [
      { key: 'day', label: L('Day', '今日', 'Tag', 'Сутки', 'Día'), pct: d.pct, note: durText(d.leftSec) + ' ' + L('left', '残り', 'übrig', 'осталось', 'restante') },
      { key: 'week', label: L('Week', '今週', 'Woche', 'Неделя', 'Semana') + ' ' + w.week, pct: w.pct, note: L('day', '日', 'Tag', 'день', 'día') + ' ' + (w.dow + 1) + '/7' },
      { key: 'year', label: String(y.year), pct: y.pct, note: L('day', '日', 'Tag', 'день', 'día') + ' ' + y.day + '/' + y.days },
    ];
  }
  function progressDef(o) {
    WC.define({
      id: 'progress.' + o.key, family: 'progress', variant: o.key, category: 'time-cal', icon: o.icon || 'progress',
      legacyIds: o.legacyIds, multi: true,
      nm: o.nm, desc: o.desc, keywords: o.keywords,
      supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
      configSchema: { zone: PROG_CFG.zone, style: PROG_CFG.style, follow: PROG_CFG.follow },
      defaultConfig: function () { return { zone: WC.tz() || (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'), style: 'bar', follow: false }; },
      refreshPolicy: { kind: 'realtime-local', tick: function () { return o.key === 'day' ? 'second' : 'minute'; } },
      renderers: {
        s: function (ctx, cfg, st) {
          var now = progNow(ctx, cfg, st), m = o.measure(now, cfg.zone);
          return el('div', { class: 'wgt-body' + (cfg.style === 'ring' ? ' center' : '') }, [
            cfg.style === 'ring' ? R.progress(m.pct, { ring: true, label: o.nm() })
              : el('div', {}, [R.value({ small: true, value: WC.pct(m.pct, 1) }), R.progress(m.pct, { label: o.nm() })]),
          ]);
        },
        m: function (ctx, cfg, st) {
          var now = progNow(ctx, cfg, st), m = o.measure(now, cfg.zone);
          return el('div', { class: 'wgt-body' }, [
            el('div', { class: 'wgt-row gap' }, [
              cfg.style === 'ring' ? R.progress(m.pct, { ring: true, label: o.nm() }) : null,
              R.value({ small: cfg.style === 'ring', value: WC.pct(m.pct, 1), caption: m.title }),
            ]),
            cfg.style === 'ring' ? null : R.progress(m.pct, { label: o.nm() }),
            R.facts(m.facts, { cols: 2 }),
          ]);
        },
        /* L drops the single bar entirely: the day, the week and the year on ONE axis (§7.B) */
        l: function (ctx, cfg, st, api) {
          var now = progNow(ctx, cfg, st), rows = progAllRows(now, cfg.zone);
          return el('div', { class: 'wgt-body' }, [
            el('div', { class: 'wgt-proglist' }, rows.map(function (r) {
              return el('div', { class: 'wgt-progrow' + (r.key === o.key ? ' on' : '') }, [
                el('span', { class: 'wgt-progrow-l', text: r.label }),
                R.progress(r.pct, { label: r.label, tone: r.key === o.key ? 'accent' : null }),
                el('span', { class: 'wgt-progrow-v', text: WC.pct(r.pct, 1) }),
                el('span', { class: 'wgt-progrow-n', text: r.note }),
              ]);
            })),
            R.timeline({ pct: rows[2].pct, from: String(yearProgress(now, cfg.zone).year), to: String(yearProgress(now, cfg.zone).year + 1), label: L('Year', '年', 'Jahr', 'Год', 'Año') }),
            R.actions([
              { label: cfg.follow ? L('Following Chronos', 'Chronos に追従中', 'Folgt Chronos', 'Следует Chronos', 'Sigue a Chronos') : L('Real time', '実時刻', 'Echtzeit', 'Реальное время', 'Tiempo real'),
                icon: 'clock', toggle: true, on: !!cfg.follow, run: function () { api.setConfig({ follow: !cfg.follow }); } },
            ]),
          ]);
        },
      },
    });
  }
  progressDef({
    key: 'day', legacyIds: ['dayprog'], icon: 'progress',
    nm: function () { return L('Day progress', '今日の進捗', 'Tagesfortschritt', 'Прогресс дня', 'Progreso del día'); },
    desc: function () { return L('How far through today we are', '今日が何%過ぎたか', 'Wie weit der Tag fortgeschritten ist', 'Насколько прошёл день', 'Cuánto ha avanzado el día'); },
    keywords: function () { return [L('day', '日', 'Tag', 'день', 'día'), L('progress', '進捗', 'Fortschritt', 'прогресс', 'progreso')]; },
    measure: function (now, tz) {
      var d = dayProgress(now, tz);
      return { pct: d.pct, title: WC.date(now, { weekday: 'long', month: 'short', day: 'numeric', timeZone: tz }),
        facts: [
          { k: L('Elapsed', '経過', 'Vergangen', 'Прошло', 'Transcurrido'), v: durText(d.elapsedSec) },
          { k: L('Remaining', '残り', 'Verbleibend', 'Осталось', 'Restante'), v: durText(d.leftSec) },
        ] };
    },
  });
  progressDef({
    key: 'week', legacyIds: ['weeknum'], icon: 'calendar',
    nm: function () { return L('Week progress', '今週の進捗', 'Wochenfortschritt', 'Прогресс недели', 'Progreso de la semana'); },
    desc: function () { return L('ISO week number and how far through it', 'ISO週番号と進捗', 'ISO-Kalenderwoche und Fortschritt', 'Номер недели ISO и прогресс', 'Semana ISO y su progreso'); },
    keywords: function () { return [L('week', '週', 'Woche', 'неделя', 'semana'), 'ISO', L('week number', '週番号', 'Kalenderwoche', 'номер недели', 'número de semana')]; },
    measure: function (now, tz) {
      var w = isoWeek(now, tz), y = yearProgress(now, tz);
      return { pct: w.pct, title: L('Week', '第', 'Woche', 'Неделя', 'Semana') + ' ' + w.week + L('', '週', '', '', ''),
        facts: [
          { k: L('ISO week', 'ISO週', 'ISO-Woche', 'Неделя ISO', 'Semana ISO'), v: w.isoYear + '-W' + String(w.week).padStart(2, '0') },
          { k: L('Day of year', '通日', 'Tag des Jahres', 'День года', 'Día del año'), v: y.day + ' / ' + y.days },
        ] };
    },
  });
  progressDef({
    key: 'year', legacyIds: ['yearprog'], icon: 'calendar',
    nm: function () { return L('Year progress', '今年の進捗', 'Jahresfortschritt', 'Прогресс года', 'Progreso del año'); },
    desc: function () { return L('How far through the year we are', '今年が何%過ぎたか', 'Wie weit das Jahr fortgeschritten ist', 'Насколько прошёл год', 'Cuánto ha avanzado el año'); },
    keywords: function () { return [L('year', '年', 'Jahr', 'год', 'año'), L('progress', '進捗', 'Fortschritt', 'прогресс', 'progreso')]; },
    measure: function (now, tz) {
      var y = yearProgress(now, tz);
      return { pct: y.pct, title: String(y.year),
        facts: [
          { k: L('Day', '経過日', 'Tag', 'День', 'Día'), v: y.day + ' / ' + y.days },
          { k: L('Remaining', '残り', 'Verbleibend', 'Осталось', 'Restante'), v: (y.days - y.day) + L(' d', '日', ' T', ' дн', ' d') },
        ] };
    },
  });

  /* ══ THE MOON FAMILY ══════════════════════════════════════════════════════════════════════════ */
  function moonDef(o) {
    WC.define({
      id: 'moon.' + o.key, family: 'moon', variant: o.key, category: 'time-cal', icon: 'moon',
      legacyIds: o.legacyIds, multi: true,
      nm: o.nm, desc: o.desc,
      keywords: function () { return [L('moon', '月', 'Mond', 'луна', 'luna'), L('phase', '月相', 'Phase', 'фаза', 'fase'), L('lunar', '月齢', 'lunar', 'лунный', 'lunar')]; },
      supportedSizes: ['s', 'm', 'l'], defaultSize: 's',
      configSchema: { follow: PROG_CFG.follow },
      defaultConfig: function () { return { follow: false }; },
      refreshPolicy: { kind: 'realtime-local', tick: function () { return 'minute'; } },
      renderers: {
        s: function (ctx, cfg, st) {
          var at = (cfg.follow && ctx.chronos && !ctx.chronos.isLive) ? +new Date(ctx.chronos.when) : (st.now || new Date()).getTime();
          var m = moonPhase(at);
          return el('div', { class: 'wgt-body' }, [el('div', { class: 'wgt-row gap' }, [moonDisc(m.phase, 44), o.small(m)])]);
        },
        m: function (ctx, cfg, st) {
          var at = (cfg.follow && ctx.chronos && !ctx.chronos.isLive) ? +new Date(ctx.chronos.when) : (st.now || new Date()).getTime();
          var m = moonPhase(at);
          return el('div', { class: 'wgt-body' }, [
            el('div', { class: 'wgt-row gap' }, [moonDisc(m.phase, 52),
              R.value({ small: true, value: phaseName(m.index), caption: WC.pct(m.illum, 0) + ' ' + L('lit', '照度', 'beleuchtet', 'освещ.', 'iluminada') })]),
            R.facts([
              { k: L('Age', '月齢', 'Mondalter', 'Возраст', 'Edad'), v: WC.num(m.age, { maximumFractionDigits: 1 }) + L(' d', '日', ' T', ' дн', ' d') },
              { k: L('Next full', '次の満月', 'Nächster Vollmond', 'Полнолуние', 'Próxima llena'), v: fmtIn(m.toFull, at) },
              { k: L('Next new', '次の新月', 'Nächster Neumond', 'Новолуние', 'Próxima nueva'), v: fmtIn(m.toNew, at) },
            ], { cols: 2 }),
          ]);
        },
        /* L: the coming phases, dated. Nothing here needs a rise/set the engine cannot supply. */
        l: function (ctx, cfg, st) {
          var at = (cfg.follow && ctx.chronos && !ctx.chronos.isLive) ? +new Date(ctx.chronos.when) : (st.now || new Date()).getTime();
          var m = moonPhase(at);
          var steps = [];
          for (var i = 0; i < 8; i++) {
            var t = at + i * (SYNODIC / 8) * 864e5;
            steps.push({ at: t, p: moonPhase(t) });
          }
          return el('div', { class: 'wgt-body' }, [
            el('div', { class: 'wgt-row gap' }, [moonDisc(m.phase, 54),
              R.value({ small: true, value: phaseName(m.index), caption: WC.pct(m.illum, 0) + ' ' + L('lit', '照度', 'beleuchtet', 'освещ.', 'iluminada') + ' · ' + WC.num(m.age, { maximumFractionDigits: 1 }) + L(' d', '日', ' T', ' дн', ' d') })]),
            el('div', { class: 'wgt-moonstrip', role: 'list', 'aria-label': L('Coming phases', '今後の月相', 'Kommende Phasen', 'Ближайшие фазы', 'Próximas fases') },
              steps.map(function (s) {
                return el('div', { class: 'wgt-moonstep', role: 'listitem' }, [
                  moonDisc(s.p.phase, 26),
                  el('span', { text: WC.date(new Date(s.at), { month: 'numeric', day: 'numeric' }) }),
                ]);
              })),
            R.facts([
              { k: L('Next full moon', '次の満月', 'Nächster Vollmond', 'Следующее полнолуние', 'Próxima luna llena'), v: WC.date(new Date(at + m.toFull * 864e5), { month: 'short', day: 'numeric' }) },
              { k: L('Next new moon', '次の新月', 'Nächster Neumond', 'Следующее новолуние', 'Próxima luna nueva'), v: WC.date(new Date(at + m.toNew * 864e5), { month: 'short', day: 'numeric' }) },
            ], { cols: 2 }),
          ]);
        },
      },
    });
  }
  function fmtIn(days, at) {
    var d = Math.round(days);
    if (d === 0) return L('tonight', '今夜', 'heute Nacht', 'сегодня ночью', 'esta noche');
    return WC.date(new Date(at + days * 864e5), { month: 'short', day: 'numeric' }) + ' · ' + d + L(' d', '日後', ' T', ' дн', ' d');
  }
  moonDef({
    key: 'phase', legacyIds: ['moon'],
    nm: function () { return L('Moon phase', '月相', 'Mondphase', 'Фаза Луны', 'Fase lunar'); },
    desc: function () { return L('Tonight’s phase and illumination', '今夜の月の満ち欠けと照度', 'Phase und Beleuchtung heute Nacht', 'Сегодняшняя фаза и освещённость', 'Fase e iluminación de esta noche'); },
    small: function (m) { return R.value({ small: true, value: phaseName(m.index), caption: WC.pct(m.illum, 0) }); },
  });
  moonDef({
    key: 'full', legacyIds: ['fullmoon'],
    nm: function () { return L('Next full moon', '次の満月', 'Nächster Vollmond', 'Следующее полнолуние', 'Próxima luna llena'); },
    desc: function () { return L('How many nights until the moon is full', '次の満月まであと何日か', 'Wie viele Nächte bis zum Vollmond', 'Сколько ночей до полнолуния', 'Cuántas noches hasta la luna llena'); },
    small: function (m) {
      var d = Math.round(m.toFull);
      return R.value({ small: true, value: d === 0 ? L('Tonight', '今夜', 'Heute Nacht', 'Сегодня', 'Esta noche') : d + L(' d', '日', ' T', ' дн', ' d'),
        caption: L('until full moon', '次の満月まで', 'bis zum Vollmond', 'до полнолуния', 'hasta la luna llena') });
    },
  });
  moonDef({
    key: 'new', legacyIds: ['newmoon'],
    nm: function () { return L('Next new moon', '次の新月', 'Nächster Neumond', 'Следующее новолуние', 'Próxima luna nueva'); },
    desc: function () { return L('How many nights until the moon is new', '次の新月まであと何日か', 'Wie viele Nächte bis zum Neumond', 'Сколько ночей до новолуния', 'Cuántas noches hasta la luna nueva'); },
    small: function (m) {
      var d = Math.round(m.toNew);
      return R.value({ small: true, value: d === 0 ? L('Tonight', '今夜', 'Heute Nacht', 'Сегодня', 'Esta noche') : d + L(' d', '日', ' T', ' дн', ' d'),
        caption: L('until new moon', '次の新月まで', 'bis zum Neumond', 'до новолуния', 'hasta la luna nueva') });
    },
  });

  /* ══ SUN — rise, set, day length ══════════════════════════════════════════════════════════════
     ⚠ ONE COMPUTATION FOR BOTH CARDS. `sun.rise-set` and `sun.daylength` used two different pieces
     of mathematics in the previous board — IntMapWx.sunTimes for one and a cosine declination
     approximation for the other — so the two cards could and did print day lengths that disagreed.
     Both read IntMapWx.sunTimes now; the approximation is the FALLBACK for the case where the
     weather kernel has not booted, and it says so on the card. */
  function sunFor(pt) {
    if (!pt) return null;
    try {
      var s = window.IntMapWx && window.IntMapWx.sunTimes && window.IntMapWx.sunTimes(pt.lat, pt.lng);
      if (s) return { exact: true, polar: s.polar, sunrise: s.sunrise, sunset: s.sunset, daylightSec: s.daylightSec };
    } catch (e) {}
    var now = new Date(), st = new Date(now.getFullYear(), 0, 0);
    var doy = Math.floor((now - st) / 864e5);
    var decl = -23.44 * Math.cos((360 / 365) * (doy + 10) * Math.PI / 180);
    var cosH = -Math.tan(pt.lat * Math.PI / 180) * Math.tan(decl * Math.PI / 180);
    var hrs = cosH <= -1 ? 24 : cosH >= 1 ? 0 : (2 * Math.acos(cosH) * 180 / Math.PI) / 15;
    return { exact: false, polar: hrs >= 24 ? 'day' : hrs <= 0 ? 'night' : null, sunrise: null, sunset: null, daylightSec: hrs * 3600 };
  }
  var LOC_CFG = {
    source: { type: 'enum', values: ['auto', 'device', 'map'], default: 'auto',
      label: function () { return L('Location', '地点', 'Standort', 'Местоположение', 'Ubicación'); },
      options: function () { return [
        { value: 'auto', label: L('Automatic', '自動', 'Automatisch', 'Автоматически', 'Automático') },
        { value: 'device', label: L('My location', '現在地', 'Mein Standort', 'Моё местоположение', 'Mi ubicación') },
        { value: 'map', label: L('Map centre', '地図の中心', 'Kartenmitte', 'Центр карты', 'Centro del mapa') },
      ]; } },
  };

  WC.define({
    id: 'sun.rise-set', family: 'sun', variant: 'rise-set', category: 'weather-env', icon: 'sun',
    legacyIds: ['sun'], multi: true,
    nm: function () { return L('Sunrise & sunset', '日の出・日の入り', 'Sonnenauf- & -untergang', 'Восход и закат', 'Amanecer y atardecer'); },
    desc: function () { return L('At your location or the map centre', '現在地または地図の中心で', 'An Ihrem Standort oder in der Kartenmitte', 'В вашем месте или в центре карты', 'En su ubicación o en el centro del mapa'); },
    keywords: function () { return [L('sunrise', '日の出', 'Sonnenaufgang', 'восход', 'amanecer'), L('sunset', '日の入り', 'Sonnenuntergang', 'закат', 'atardecer'), L('daylight', '日照', 'Tageslicht', 'световой день', 'luz diurna')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: LOC_CFG, defaultConfig: function () { return { source: 'auto' }; },
    refreshPolicy: { kind: 'realtime-local', tick: function () { return 'minute'; }, relevantEvents: ['map'] },
    permissionReason: function () { return L('Sunrise and sunset depend on where you are', '日の出・日の入りは地点で変わります', 'Auf- und Untergang hängen vom Ort ab', 'Восход и закат зависят от места', 'El amanecer y el atardecer dependen del lugar'); },
    renderers: {
      s: function (ctx, cfg, st, api) {
        var pt = WC.resolvePoint(ctx, cfg);
        if (!pt) return api.needsLocation();
        var s = sunFor(pt);
        if (s.polar === 'day') return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: L('Midnight sun', '白夜', 'Mitternachtssonne', 'Полярный день', 'Sol de medianoche') })]);
        if (s.polar === 'night') return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: L('Polar night', '極夜', 'Polarnacht', 'Полярная ночь', 'Noche polar') })]);
        return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: s.sunrise ? hhmm(s.sunrise, WC.tz()) : durText(s.daylightSec),
          caption: s.sunrise ? L('sunrise', '日の出', 'Aufgang', 'восход', 'amanecer') : L('of daylight', 'の日照', 'Tageslicht', 'светового дня', 'de luz diurna') })]);
      },
      m: function (ctx, cfg, st, api) { return sunBody(ctx, cfg, api, false); },
      l: function (ctx, cfg, st, api) { return sunBody(ctx, cfg, api, true); },
    },
  });
  function sunBody(ctx, cfg, api, big) {
    var pt = WC.resolvePoint(ctx, cfg);
    if (!pt) return api.needsLocation();
    var s = sunFor(pt), tz = WC.tz();
    var kids = [];
    if (s.polar === 'day' || s.polar === 'night') {
      kids.push(R.value({ small: true,
        value: s.polar === 'day' ? L('Midnight sun', '白夜', 'Mitternachtssonne', 'Полярный день', 'Sol de medianoche') : L('Polar night', '極夜', 'Polarnacht', 'Полярная ночь', 'Noche polar'),
        caption: s.polar === 'day' ? L('the sun does not set today', '今日は日没がありません', 'die Sonne geht heute nicht unter', 'сегодня солнце не заходит', 'hoy el sol no se pone')
          : L('the sun does not rise today', '今日は日の出がありません', 'die Sonne geht heute nicht auf', 'сегодня солнце не восходит', 'hoy el sol no sale') }));
    } else {
      kids.push(R.list([
        { icon: 'sun', title: L('Sunrise', '日の出', 'Aufgang', 'Восход', 'Amanecer'), trailing: hhmm(s.sunrise, tz) },
        { icon: 'moon', title: L('Sunset', '日の入り', 'Untergang', 'Закат', 'Ocaso'), trailing: hhmm(s.sunset, tz) },
      ], { dense: true }));
      kids.push(R.facts([{ k: L('Daylight', '昼の長さ', 'Tageslänge', 'Долгота дня', 'Duración del día'), v: durText(s.daylightSec) }]));
      if (big && s.sunrise && s.sunset) {
        var now = Date.now(), a = +s.sunrise, b = +s.sunset;
        kids.push(R.timeline({
          pct: Math.max(0, Math.min(100, (now - a) / (b - a) * 100)),
          from: hhmm(s.sunrise, tz), to: hhmm(s.sunset, tz),
          label: L('Daylight', '昼の長さ', 'Tageslänge', 'Долгота дня', 'Duración del día'),
        }));
      }
    }
    kids.push(R.where(pt.label));
    kids.push(R.actions([
      { label: L('Show on the map', '地図で見る', 'Auf der Karte zeigen', 'Показать на карте', 'Ver en el mapa'), icon: 'pin', run: function () { WC.flyTo({ center: [pt.lng, pt.lat], zoom: 6 }); } },
      cfg.source !== 'device' && ctx.location.state !== 'granted' ? { label: L('Use my location', '現在地を使う', 'Meinen Standort verwenden', 'Использовать моё место', 'Usar mi ubicación'), icon: 'target', run: function () { api.requestLocation(); } } : null,
    ]));
    return el('div', { class: 'wgt-body' }, kids);
  }

  WC.define({
    id: 'sun.daylength', family: 'sun', variant: 'daylength', category: 'weather-env', icon: 'sun',
    legacyIds: ['daylength'], multi: true,
    nm: function () { return L('Day length', '昼の長さ', 'Tageslänge', 'Долгота дня', 'Duración del día'); },
    desc: function () { return L('How long the sun is up here today', '今日この地点で日が出ている時間', 'Wie lange die Sonne heute hier scheint', 'Сколько сегодня длится день', 'Cuánto dura el día aquí hoy'); },
    keywords: function () { return [L('day length', '昼の長さ', 'Tageslänge', 'долгота дня', 'duración del día'), L('daylight', '日照', 'Tageslicht', 'световой день', 'luz diurna')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 's',
    configSchema: LOC_CFG, defaultConfig: function () { return { source: 'auto' }; },
    refreshPolicy: { kind: 'realtime-local', tick: function () { return 'minute'; }, relevantEvents: ['map'] },
    renderers: {
      s: function (ctx, cfg, st, api) {
        var pt = WC.resolvePoint(ctx, cfg);
        if (!pt) return api.needsLocation();
        var s = sunFor(pt);
        return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: durText(s.daylightSec), caption: L('of daylight', 'の日照', 'Tageslicht', 'светового дня', 'de luz diurna') })]);
      },
      m: function (ctx, cfg, st, api) {
        var pt = WC.resolvePoint(ctx, cfg);
        if (!pt) return api.needsLocation();
        var s = sunFor(pt);
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: durText(s.daylightSec), caption: L('of daylight', 'の日照', 'Tageslicht', 'светового дня', 'de luz diurna') }),
          R.facts([
            { k: L('Latitude', '緯度', 'Breite', 'Широта', 'Latitud'), v: WC.num(pt.lat, { maximumFractionDigits: 2 }) + '°' },
            { k: L('Sunrise', '日の出', 'Aufgang', 'Восход', 'Amanecer'), v: s.sunrise ? hhmm(s.sunrise, WC.tz()) : '—' },
            { k: L('Sunset', '日の入り', 'Untergang', 'Закат', 'Ocaso'), v: s.sunset ? hhmm(s.sunset, WC.tz()) : '—' },
          ], { cols: 2 }),
          R.where(pt.label),
        ]);
      },
      /* L: the year's day-length curve at THIS latitude — a real computed series, not a guess */
      l: function (ctx, cfg, st, api) {
        var pt = WC.resolvePoint(ctx, cfg);
        if (!pt) return api.needsLocation();
        var s = sunFor(pt);
        var pts = [], now = new Date(), y = now.getFullYear();
        for (var d = 0; d < 365; d += 5) {
          var decl = -23.44 * Math.cos((360 / 365) * (d + 10) * Math.PI / 180);
          var cosH = -Math.tan(pt.lat * Math.PI / 180) * Math.tan(decl * Math.PI / 180);
          var hrs = cosH <= -1 ? 24 : cosH >= 1 ? 0 : (2 * Math.acos(cosH) * 180 / Math.PI) / 15;
          pts.push({ v: hrs });
        }
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: durText(s.daylightSec), caption: L('of daylight today', '今日の日照', 'Tageslicht heute', 'светового дня сегодня', 'de luz diurna hoy') }),
          R.series(pts, { height: 62, min: 0, max: 24, axis: [String(y) + '-01', String(y) + '-12'],
            label: L('Day length through the year', '年間の昼の長さ', 'Tageslänge im Jahresverlauf', 'Долгота дня в течение года', 'Duración del día a lo largo del año') }),
          R.facts([
            { k: L('Sunrise', '日の出', 'Aufgang', 'Восход', 'Amanecer'), v: s.sunrise ? hhmm(s.sunrise, WC.tz()) : '—' },
            { k: L('Sunset', '日の入り', 'Untergang', 'Закат', 'Ocaso'), v: s.sunset ? hhmm(s.sunset, WC.tz()) : '—' },
          ], { cols: 2 }),
          R.where(pt.label),
        ]);
      },
    },
  });

  WC.define({
    id: 'time.season', family: 'time', variant: 'season', category: 'time-cal', icon: 'leaf',
    legacyIds: ['season'],
    nm: function () { return L('Season', '季節', 'Jahreszeit', 'Время года', 'Estación'); },
    desc: function () { return L('The season where the map is looking', '地図が見ている場所の季節', 'Die Jahreszeit dort, wohin die Karte blickt', 'Время года там, куда смотрит карта', 'La estación donde mira el mapa'); },
    keywords: function () { return [L('season', '季節', 'Jahreszeit', 'сезон', 'estación'), L('hemisphere', '半球', 'Hemisphäre', 'полушарие', 'hemisferio')]; },
    supportedSizes: ['s', 'm'], defaultSize: 's',
    configSchema: LOC_CFG, defaultConfig: function () { return { source: 'auto' }; },
    refreshPolicy: { kind: 'realtime-local', tick: function () { return 'minute'; }, relevantEvents: ['map'] },
    renderers: {
      s: function (ctx, cfg, st) { return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: seasonOf(ctx, st).name })]); },
      m: function (ctx, cfg, st) {
        var s = seasonOf(ctx, st);
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: s.name, caption: s.hemisphere }),
          R.facts([{ k: L('Latitude', '緯度', 'Breite', 'Широта', 'Latitud'), v: WC.num(s.lat, { maximumFractionDigits: 1 }) + '°' }]),
        ]);
      },
    },
  });
  function seasonOf(ctx, st) {
    var lat = ctx.map ? ctx.map.lat : 35;
    var mo = (st.now || new Date()).getMonth();
    var north = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'][mo];
    var s = lat < 0 ? ({ winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' })[north] : north;
    var names = {
      winter: L('Winter', '冬', 'Winter', 'Зима', 'Invierno'),
      spring: L('Spring', '春', 'Frühling', 'Весна', 'Primavera'),
      summer: L('Summer', '夏', 'Sommer', 'Лето', 'Verano'),
      autumn: L('Autumn', '秋', 'Herbst', 'Осень', 'Otoño'),
    };
    return { key: s, name: names[s], lat: lat,
      hemisphere: lat < 0 ? L('Southern Hemisphere', '南半球', 'Südhalbkugel', 'Южное полушарие', 'Hemisferio sur') : L('Northern Hemisphere', '北半球', 'Nordhalbkugel', 'Северное полушарие', 'Hemisferio norte') };
  }

  /* ══ CALENDAR · COUNTDOWN ═════════════════════════════════════════════════════════════════════ */
  WC.define({
    id: 'time.calendar', family: 'time', variant: 'calendar', category: 'time-cal', icon: 'calendar',
    legacyIds: ['calendar'],
    nm: function () { return L('Calendar', 'カレンダー', 'Kalender', 'Календарь', 'Calendario'); },
    desc: function () { return L('Today, the month, and what is marked on it', '今日と今月、そして予定', 'Heute, der Monat und seine Markierungen', 'Сегодня, месяц и отметки на нём', 'Hoy, el mes y sus marcas'); },
    keywords: function () { return [L('calendar', 'カレンダー', 'Kalender', 'календарь', 'calendario'), L('month', '月', 'Monat', 'месяц', 'mes'), L('date', '日付', 'Datum', 'дата', 'fecha')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: { zone: TIME_CFG.zone }, defaultConfig: function () { return { zone: WC.tz() || (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') }; },
    refreshPolicy: { kind: 'realtime-local', tick: function () { return 'minute'; } },
    renderers: {
      s: function (ctx, cfg, st) {
        var now = st.now || new Date(), p = partsIn(now, cfg.zone);
        return el('div', { class: 'wgt-body center' }, [
          el('div', { class: 'wgt-datechip' }, [
            el('span', { class: 'wgt-datechip-m', text: WC.date(now, { month: 'short', timeZone: cfg.zone }) }),
            el('span', { class: 'wgt-datechip-d', text: String(p.day) }),
            el('span', { class: 'wgt-datechip-w', text: WC.date(now, { weekday: 'long', timeZone: cfg.zone }) }),
          ]),
        ]);
      },
      m: function (ctx, cfg, st) {
        var now = st.now || new Date(), p = partsIn(now, cfg.zone);
        return el('div', { class: 'wgt-body' }, [
          el('div', { class: 'wgt-cal-t', text: WC.date(now, { month: 'long', year: 'numeric', timeZone: cfg.zone }) }),
          R.calendar({ year: p.year, month: p.month - 1, today: p.day }),
        ]);
      },
      /* L: the month, with the reader's own countdowns and the next holiday marked on it (§7.J) */
      l: function (ctx, cfg, st) {
        var now = st.now || new Date(), p = partsIn(now, cfg.zone);
        var marks = {}, notes = [];
        (WC.boardCountdowns ? WC.boardCountdowns() : []).forEach(function (c) {
          var d = new Date(c.date);
          if (isNaN(d.getTime())) return;
          if (d.getUTCFullYear() === p.year && d.getUTCMonth() === p.month - 1) marks[d.getUTCDate()] = { tone: 'accent', label: c.title };
          notes.push({ icon: 'hourglass', title: c.title, trailing: WC.date(d, { month: 'short', day: 'numeric', timeZone: 'UTC' }) });
        });
        return el('div', { class: 'wgt-body' }, [
          el('div', { class: 'wgt-cal-t', text: WC.date(now, { month: 'long', year: 'numeric', timeZone: cfg.zone }) }),
          R.calendar({ year: p.year, month: p.month - 1, today: p.day, marks: marks }),
          notes.length ? R.list(notes.slice(0, 3), { dense: true }) : null,
        ]);
      },
    },
  });

  WC.define({
    id: 'time.countdown', family: 'time', variant: 'countdown', category: 'time-cal', icon: 'hourglass',
    legacyIds: ['countdown'], multi: true,
    nm: function () { return L('Countdown', 'カウントダウン', 'Countdown', 'Обратный отсчёт', 'Cuenta atrás'); },
    desc: function () { return L('Set a date and a title', '日付と題名を設定', 'Datum und Titel festlegen', 'Задайте дату и название', 'Fije una fecha y un título'); },
    keywords: function () { return [L('countdown', 'カウントダウン', 'Countdown', 'обратный отсчёт', 'cuenta atrás'), L('deadline', '期限', 'Frist', 'срок', 'plazo'), L('event', 'イベント', 'Ereignis', 'событие', 'evento')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {
      title: { type: 'string', default: '', maxLength: 60, label: function () { return L('Title', '題名', 'Titel', 'Название', 'Título'); } },
      date: { type: 'date', default: '', label: function () { return L('Date', '日付', 'Datum', 'Дата', 'Fecha'); } },
    },
    defaultConfig: function () { var d = new Date(Date.now() + 30 * 864e5); return { title: '', date: d.toISOString().slice(0, 10) }; },
    refreshPolicy: { kind: 'realtime-local', tick: function () { return 'second'; } },
    title: function (cfg) { return cfg.title || L('Countdown', 'カウントダウン', 'Countdown', 'Обратный отсчёт', 'Cuenta atrás'); },
    renderers: {
      s: function (ctx, cfg, st, api) {
        var c = cd(cfg, st);
        if (!c) return api.empty(L('Set a date to count down to', 'カウントダウンする日付を設定', 'Legen Sie ein Datum fest', 'Задайте дату отсчёта', 'Fije una fecha'));
        return el('div', { class: 'wgt-body' }, [R.value({ value: c.days, unit: L('d', '日', 'T', 'дн', 'd'), caption: c.past ? L('ago', '経過', 'her', 'назад', 'atrás') : L('to go', '後', 'verbleiben', 'осталось', 'faltan') })]);
      },
      m: function (ctx, cfg, st, api) {
        var c = cd(cfg, st);
        if (!c) return api.empty(L('Set a date to count down to', 'カウントダウンする日付を設定', 'Legen Sie ein Datum fest', 'Задайте дату отсчёта', 'Fije una fecha'));
        return el('div', { class: 'wgt-body' }, [
          R.value({ value: c.days, unit: L('d', '日', 'T', 'дн', 'd'), caption: cfg.title || WC.date(c.target, { dateStyle: 'long' }) }),
          R.facts([
            { k: L('Date', '日付', 'Datum', 'Дата', 'Fecha'), v: WC.date(c.target, { dateStyle: 'medium' }) },
            { k: L('Remaining', '残り', 'Verbleibend', 'Осталось', 'Restante'), v: c.hms },
          ], { cols: 2 }),
        ]);
      },
      /* L: every countdown on the board in one card, nearest first (§7.J) */
      l: function (ctx, cfg, st, api) {
        var all = (WC.boardCountdowns ? WC.boardCountdowns() : []).map(function (x) {
          var t = new Date(x.date);
          return { title: x.title || WC.date(t, { dateStyle: 'medium' }), at: +t, days: Math.ceil((+t - Date.now()) / 864e5) };
        }).filter(function (x) { return isFinite(x.at); }).sort(function (a, b) { return a.at - b.at; });
        var c = cd(cfg, st);
        return el('div', { class: 'wgt-body' }, [
          c ? R.value({ value: c.days, unit: L('d', '日', 'T', 'дн', 'd'), caption: cfg.title || WC.date(c.target, { dateStyle: 'long' }) }) : null,
          all.length > 1 ? R.list(all.map(function (x) {
            return { icon: 'hourglass', title: x.title, sub: WC.date(new Date(x.at), { dateStyle: 'medium' }),
              trailing: (x.days >= 0 ? x.days : -x.days) + L(' d', '日', ' T', ' дн', ' d') };
          }), { dense: true }) : null,
          R.actions([{ label: L('Edit', '編集', 'Bearbeiten', 'Изменить', 'Editar'), icon: 'gear', run: function () { api.openConfig(); } }]),
        ]);
      },
    },
  });
  function cd(cfg, st) {
    if (!cfg.date) return null;
    var t = new Date(cfg.date + (cfg.date.length <= 10 ? 'T00:00:00' : ''));
    if (isNaN(t.getTime())) return null;
    var now = st.now || new Date();
    var ms = t - now, past = ms < 0, abs = Math.abs(ms);
    var d = Math.floor(abs / 864e5), h = Math.floor(abs % 864e5 / 36e5), m = Math.floor(abs % 36e5 / 6e4), s = Math.floor(abs % 6e4 / 1000);
    return { target: t, past: past, days: past ? -d : d, hms: d + L('d ', '日 ', 'T ', 'д ', 'd ') + h + L('h ', '時間 ', 'Std ', 'ч ', 'h ') + m + L('m ', '分 ', 'Min ', 'мин ', 'min ') + s + L('s', '秒', 's', 'с', 's') };
  }

  return { moonPhase: moonPhase, partsIn: partsIn, isoWeek: isoWeek, yearProgress: yearProgress, dayProgress: dayProgress, tzOptions: tzOptions, sunFor: sunFor };
})();
