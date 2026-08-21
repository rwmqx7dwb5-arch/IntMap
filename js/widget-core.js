/* ============================================================================
 *  IntMap · WIDGET PLATFORM — THE REGISTRY, THE CONTEXT, THE STATE MODEL
 * ----------------------------------------------------------------------------
 *  window.IntMapWidgetCore — everything the other widget modules resolve their questions through.
 *
 *  ══ ⚠⚠⚠ WHY THIS EXISTS: THE DEFAULT BOARD WAS ONE CARD, AND NOTHING SAID SO ═════════════════
 *  Measured on the previous implementation before a line was changed, with widget storage cleared:
 *
 *      window.IntMapWidgets2._active()        →  ["clock"]
 *      localStorage.intmap_widgets_def21      →  null
 *      localStorage.intmap_widgets3           →  null
 *
 *  The board is documented — in its own source, in Architecture.md and in the round that built it —
 *  as «Clock · FX · Featured layer · Random country · On this day». It seeded ONE card, saved
 *  nothing, and re-attempted the same seed on every load for ever. The cause is four lines apart:
 *  the seeding loop read `DEF_FX`, a `const` declared 196 lines LOWER in the same closure, so the
 *  'fx' iteration threw a temporal-dead-zone ReferenceError; the loop's `try{ … }catch(_){}`
 *  swallowed it, and with it the `localStorage.setItem(flag)` and the `save()` on the next two
 *  lines. [[intmap-recurring-lessons]]: a catch that swallows is a catch that hides the statement
 *  AFTER the throw, not only the throw.
 *
 *  A registry answers this by construction: a definition's `defaultConfig` is a FUNCTION, called
 *  when a card is created, so no default can depend on the order in which the file was written.
 *
 *  ══ WHAT LIVES HERE ════════════════════════════════════════════════════════════════════════════
 *   · the definition registry (one shape for every widget: sizes, config schema, refresh policy,
 *     loader, per-size renderers, actions, accessibility) and the OLD-ID → definition aliases;
 *   · WidgetContext — the explicit, read-only snapshot a renderer is handed. Renderers never reach
 *     for a global: what they may see is what this builds, which is what makes them testable;
 *   · the state model (idle · loading · ready · refreshing · stale · offline · permission-required ·
 *     permission-denied · empty · rate-limited · temporary-error · permanent-error) and the shared
 *     renderers for the eleven that are not `ready`;
 *   · the DOM toolkit. ⚠ NOTHING HERE CONCATENATES AN EXTERNAL STRING INTO innerHTML — `el()` sets
 *     text through textContent and attributes through setAttribute, and `link()` refuses a URL
 *     whose scheme is not http/https.
 *
 *  ⚠ THE CSS IS IN css/intmap.css, NOT IN A STRING HERE. The board used to append a ~14 KB
 *  stylesheet built by string concatenation at import time; a stylesheet in a template literal is
 *  also how a back-tick blanks the whole site (CONSTITUTION §2), and it cannot be inspected by any
 *  CSS tooling. Everything the board draws is now in one section of the real stylesheet.
 * ==========================================================================*/
window.IntMapWidgetCore = (function () {
  'use strict';

  var WC = {};
  var HOST = null;

  /* ── the host handshake. js/widgets.js owns HOST and hands it over once. ──────────────────── */
  WC.bind = function (host) { HOST = host; return WC; };
  WC.host = function () { return HOST; };
  WC.lang = function () { try { return HOST ? HOST.lang : 'en'; } catch (e) { return 'en'; } };

  /* ── i18n. Shape ④ of scripts/i18n-helpers.mjs: a property bound to IntMapLang.pick(), called
        off an object. Every widget string in this project goes through it, so the i18n gate sees
        all of them and a language added later needs no edit here. ───────────────────────────── */
  WC.L = window.IntMapLang.pick(function () { return WC.lang(); });
  WC.LA = window.IntMapLang.pickArgs();
  WC.locale = function () { try { return window.IntMapLang.locale(WC.lang(), 'en-GB'); } catch (e) { return 'en-GB'; } };

  /* ── formatting. Intl only — never a hand-rolled table. ──────────────────────────────────── */
  var _nf = {};
  WC.num = function (v, opts) {
    if (v == null || !isFinite(v)) return null;
    var k = WC.locale() + '|' + JSON.stringify(opts || {});
    if (!_nf[k]) { try { _nf[k] = new Intl.NumberFormat(WC.locale(), opts || {}); } catch (e) { _nf[k] = null; } }
    return _nf[k] ? _nf[k].format(v) : String(v);
  };
  WC.pct = function (v, digits) { return WC.num(v / 100, { style: 'percent', minimumFractionDigits: digits == null ? 0 : digits, maximumFractionDigits: digits == null ? 0 : digits }); };
  WC.compact = function (v) { return WC.num(v, { notation: 'compact', maximumFractionDigits: 1 }); };
  var _df = {};
  WC.date = function (d, opts) {
    try {
      var k = WC.locale() + '|' + JSON.stringify(opts || {});
      if (!_df[k]) _df[k] = new Intl.DateTimeFormat(WC.locale(), opts || {});
      return _df[k].format(d);
    } catch (e) { return ''; }
  };
  /* the app's own timezone choice, or the device's */
  WC.tz = function (override) {
    if (override && override !== 'auto') return override;
    try { if (HOST && HOST.userTZ && HOST.userTZ !== 'auto') return HOST.userTZ; } catch (e) {}
    return undefined;
  };
  /* "3 min ago" — the age of DATA, never mixed with the age of the FETCH (see WC.state below) */
  WC.ago = function (ts) {
    if (!ts) return '';
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    try {
      var rtf = new Intl.RelativeTimeFormat(WC.locale(), { numeric: 'auto' });
      if (s < 60) return rtf.format(-s, 'second');
      if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
      if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
      return rtf.format(-Math.round(s / 86400), 'day');
    } catch (e) { return Math.round(s / 60) + ' min'; }
  };
  /* a country's name in the reader's language — CLDR, never a bundled table (#R249) */
  var _dn = {};
  WC.countryName = function (cc, fallback) {
    try {
      var tag = window.IntMapLang.locale(WC.lang());
      if (_dn[tag] === undefined) { try { _dn[tag] = new Intl.DisplayNames([tag], { type: 'region' }); } catch (e) { _dn[tag] = null; } }
      var n = _dn[tag] && _dn[tag].of(String(cc || '').toUpperCase());
      if (n && n !== cc) return n;
    } catch (e) {}
    return fallback || cc || '';
  };

  /* ══ THE DOM TOOLKIT ══════════════════════════════════════════════════════════════════════════
     ⚠ `el()` is the ONLY way this platform makes an element, and it has no innerHTML path at all.
     Text is textContent; attributes go through setAttribute; children are nodes. An external
     string (a headline, a place name, an error from an API) therefore cannot become markup —
     which is a property of the toolkit rather than a rule someone has to remember. */
  WC.el = function (tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'text') { n.textContent = String(v); continue; }
        if (k === 'class') { n.className = String(v); continue; }
        if (k === 'style') { n.style.cssText = String(v); continue; }
        if (k === 'dataset') { for (var d in v) if (v[d] != null) n.dataset[d] = String(v[d]); continue; }
        if (k.slice(0, 2) === 'on' && typeof v === 'function') { n.addEventListener(k.slice(2), v); continue; }
        n.setAttribute(k, v === true ? '' : String(v));
      }
    }
    WC.fill(n, kids);
    return n;
  };
  WC.fill = function (n, kids) {
    if (kids == null) return n;
    (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return n;
  };
  WC.clear = function (n) { while (n && n.firstChild) n.removeChild(n.firstChild); return n; };

  /* ⚠ A URL FROM A FEED IS NOT A URL UNTIL IT PARSES AS ONE. `javascript:` and `data:` are the
     two that matter, so the test is an allow-list of schemes rather than a deny-list of strings. */
  WC.safeUrl = function (u) {
    try {
      var p = new URL(String(u), location.href);
      return (p.protocol === 'http:' || p.protocol === 'https:') ? p.href : null;
    } catch (e) { return null; }
  };
  WC.link = function (href, kids, attrs) {
    var safe = WC.safeUrl(href);
    var a = WC.el('a', Object.assign({
      class: 'wgt-link', rel: 'noopener noreferrer', target: '_blank',
      /* an external link says so to a screen reader, not only to a sighted reader (§18) */
      'data-external': '1',
    }, attrs || {}), kids);
    if (safe) a.setAttribute('href', safe); else { a.setAttribute('role', 'text'); a.removeAttribute('target'); }
    return a;
  };
  /* every in-card control is a real button — never a div with a click handler (§10) */
  WC.button = function (label, onClick, attrs) {
    return WC.el('button', Object.assign({
      type: 'button', class: 'wgt-act', 'aria-label': label, title: label,
      onclick: function (ev) { ev.stopPropagation(); onClick(ev); },
    }, attrs || {}), [WC.el('span', { class: 'wgt-act-t', text: label })]);
  };
  WC.iconButton = function (label, iconName, onClick, attrs) {
    var b = WC.el('button', Object.assign({
      type: 'button', class: 'wgt-iact', 'aria-label': label, title: label,
      onclick: function (ev) { ev.stopPropagation(); onClick(ev); },
    }, attrs || {}), [WC.icon(iconName)]);
    return b;
  };

  /* ══ THE ICON SET ═════════════════════════════════════════════════════════════════════════════
     Drawn here, in one stroke weight, on one 24-unit grid, in currentColor. Nothing is copied from
     any vendor's symbol set and no new external icon dependency is added (§16). Decorative by
     default — `aria-hidden` — because the name beside it is what a screen reader should read. */
  var PATHS = {
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3.5 2',
    analog: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 8v4.2l2.8 2.3M12 3.4v1.4M20.6 12h-1.4M12 20.6v-1.4M3.4 12h1.4',
    world: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3.2 12h17.6M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
    hash: 'M6 9h13M5 15h13M10 4 8 20M17 4l-2 16',
    progress: 'M4 12a8 8 0 1 1 8 8M12 12V6',
    calendar: 'M4.5 7.5h15v12h-15zM4.5 11h15M8.5 4v3M15.5 4v3',
    moon: 'M20 14.2A8.4 8.4 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2',
    sun: 'M12 8.2A3.8 3.8 0 1 0 12 15.8 3.8 3.8 0 0 0 12 8.2M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4',
    cloud: 'M7.5 18.5h9.2a3.8 3.8 0 0 0 .3-7.6 5.6 5.6 0 0 0-10.8 1.2 3.2 3.2 0 0 0 1.3 6.4',
    thermo: 'M12 4.5a2 2 0 0 1 2 2v7.1a4 4 0 1 1-4 0V6.5a2 2 0 0 1 2-2M12 9.5v6',
    wind: 'M4 9h9a2.6 2.6 0 1 0-2.6-2.6M4 14h13a2.6 2.6 0 1 1-2.6 2.6M4 11.5h6',
    chart: 'M4 19h16M6.5 16V9.5M11 16V6M15.5 16v-4.5M20 16v-8',
    coin: 'M12 3.5c4.7 0 8.5 1.6 8.5 3.6S16.7 10.7 12 10.7 3.5 9.1 3.5 7.1 7.3 3.5 12 3.5M3.5 7.1v9.8c0 2 3.8 3.6 8.5 3.6s8.5-1.6 8.5-3.6V7.1M3.5 12c0 2 3.8 3.6 8.5 3.6s8.5-1.6 8.5-3.6',
    wave: 'M2 14.5c2 0 2-4 4-4s2 8 4 8 2-13 4-13 2 9 4 9 2-3 4-3',
    flag: 'M6 21V4.5M6 5.2h11.5l-2.2 4 2.2 4H6',
    book: 'M4.5 5.2c2.6-.8 5-.8 7.5.9 2.5-1.7 4.9-1.7 7.5-.9v13c-2.6-.8-5-.8-7.5.9-2.5-1.7-4.9-1.7-7.5-.9zM12 6.1v13',
    news: 'M4.5 5.5h12v13h-12zM16.5 9.5h3v7a2 2 0 0 1-4 0M7 9h6M7 12.5h6M7 16h4',
    satellite: 'm7.5 10.5-3 3 3 3 3-3zM13.5 4.5l-3 3 3 3 3-3zM10.5 10.5l3 3M15 15.5a4.5 4.5 0 0 0-4.5-4.5M18.5 16a8 8 0 0 0-8-8',
    rocket: 'M12 3.2c3 2 4.6 5.2 4.6 8.6L14 15.2h-4L7.4 11.8c0-3.4 1.6-6.6 4.6-8.6M10 15.2 8 20l3-1.6M14 15.2 16 20l-3-1.6M12 8.6v.1',
    pin: 'M12 21s6.5-6.1 6.5-10.4a6.5 6.5 0 1 0-13 0C5.5 14.9 12 21 12 21M12 8.4a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4',
    ruler: 'M3.6 14.9 9.1 20.4a1.4 1.4 0 0 0 2 0l9.3-9.3a1.4 1.4 0 0 0 0-2L14.9 3.6a1.4 1.4 0 0 0-2 0l-9.3 9.3a1.4 1.4 0 0 0 0 2M8 10.5l2 2M11 7.5l2 2M14 4.5l2 2M5 13.5l2 2',
    layers: 'm12 3.5 8.5 4.4-8.5 4.4-8.5-4.4zM3.5 12.3 12 16.7l8.5-4.4M3.5 16.4 12 20.8l8.5-4.4',
    bell: 'M12 3.5a5.5 5.5 0 0 0-5.5 5.5c0 5-2 6.5-2 6.5h15s-2-1.5-2-6.5A5.5 5.5 0 0 0 12 3.5M10.3 19a2 2 0 0 0 3.4 0',
    route: 'M6.5 4.5a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6M17.5 14.9a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6M6.5 9.1v3.4a4.7 4.7 0 0 0 4.7 4.7h6.3',
    sparkle: 'm12 3.5 1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9zM18.5 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
    hourglass: 'M7 3.5h10M7 20.5h10M7.5 3.5v3.2c0 1.6 4.5 3.7 4.5 5.3s-4.5 3.7-4.5 5.3v3.2M16.5 3.5v3.2c0 1.6-4.5 3.7-4.5 5.3s4.5 3.7 4.5 5.3v3.2',
    activity: 'M3 12.5h4l2.5-7 4 14 2.5-7h5',
    target: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 11.4a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2',
    bitcoin: 'M8.5 5.5h5a3 3 0 0 1 0 6h-5zM8.5 11.5h5.6a3.2 3.2 0 0 1 0 6.4H8.5zM8.5 5.5v12.4M10.8 3.4v2.1M14 3.4v2.1M10.8 17.9V20M14 17.9V20',
    radio: 'M12 10.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8M8.6 8.6a4.8 4.8 0 0 0 0 6.8M15.4 15.4a4.8 4.8 0 0 0 0-6.8M6.2 6.2a8.2 8.2 0 0 0 0 11.6M17.8 17.8a8.2 8.2 0 0 0 0-11.6',
    grid: 'M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z',
    plus: 'M12 5.5v13M5.5 12h13',
    minus: 'M6 12h12',
    close: 'M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5',
    search: 'M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13M15.8 15.8 20 20',
    gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M10.4 3.7h3.2l.4 2.2 1.9 1.1 2.1-.8 1.6 2.8-1.7 1.4v2.2l1.7 1.4-1.6 2.8-2.1-.8-1.9 1.1-.4 2.2h-3.2l-.4-2.2-1.9-1.1-2.1.8-1.6-2.8L6.2 13v-2.2L4.5 9.4l1.6-2.8 2.1.8 1.9-1.1z',
    refresh: 'M20 12a8 8 0 1 1-2.4-5.7M20 4.5V10h-5.5',
    chevronL: 'M14.5 5.5 8 12l6.5 6.5',
    chevronR: 'm9.5 5.5 6.5 6.5-6.5 6.5',
    chevronD: 'm5.5 9.5 6.5 6.5 6.5-6.5',
    drag: 'M9 6.2h.1M15 6.2h.1M9 12h.1M15 12h.1M9 17.8h.1M15 17.8h.1',
    stack: 'M4.5 8.5h15v11h-15zM6.5 5.5h11M8.5 2.8h7',
    check: 'm5 12.5 4.6 4.5L19 7.5',
    eye: 'M2.8 12S6.6 5.8 12 5.8 21.2 12 21.2 12 17.4 18.2 12 18.2 2.8 12 2.8 12M12 9.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2',
    pin2: 'M14.5 3.5 20.5 9.5M16.2 5.2l-1.6 4.5 3 3-6 3.4-1.9-1.9-4.2 4.2M8.7 9.4l4.5-1.6',
    users: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M2.8 19.5a6.2 6.2 0 0 1 12.4 0M16 5a3.5 3.5 0 0 1 0 6.6M17 14.2a6.2 6.2 0 0 1 4.2 5.3',
    leaf: 'M20 4.5C10.5 4.5 5 8.4 5 14.5a5.5 5.5 0 0 0 5.5 5.5C16.6 20 20 14 20 4.5M9 20c0-4.5 2.5-8 6.5-10.5',
  };
  WC.icon = function (name, opts) {
    opts = opts || {};
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(opts.size || 16));
    svg.setAttribute('height', String(opts.size || 16));
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', String(opts.weight || 1.7));
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('class', 'wgt-ic');
    /* decorative unless the caller says the icon carries the meaning (§18) */
    if (opts.label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', opts.label); }
    else svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', PATHS[name] || PATHS.grid);
    svg.appendChild(p);
    return svg;
  };
  WC.hasIcon = function (n) { return !!PATHS[n]; };
  WC.iconNames = function () { return Object.keys(PATHS); };

  /* ══ SIZES AND CATEGORIES ═════════════════════════════════════════════════════════════════════
     S / M / L are LOGICAL sizes, not CSS classes: a definition has a separate renderer per size and
     they show different information. `span` is what the grid gives them (§6). */
  WC.SIZES = ['s', 'm', 'l'];
  WC.SPAN = { s: { cols: 1, rows: 1 }, m: { cols: 2, rows: 1 }, l: { cols: 2, rows: 2 } };
  WC.CATEGORIES = [
    { id: 'suggested', icon: 'sparkle', nm: function () { return WC.L('Suggested', 'おすすめ', 'Vorschläge', 'Рекомендуемые', 'Sugeridos'); } },
    { id: 'map-place', icon: 'pin', nm: function () { return WC.L('Map & places', '地図・場所', 'Karte & Orte', 'Карта и места', 'Mapa y lugares'); } },
    { id: 'weather-env', icon: 'cloud', nm: function () { return WC.L('Weather & environment', '天気・環境', 'Wetter & Umwelt', 'Погода и среда', 'Tiempo y medio ambiente'); } },
    { id: 'hazard-live', icon: 'bell', nm: function () { return WC.L('Hazards & live', '災害・ライブ', 'Gefahren & Live', 'Опасности и лайв', 'Riesgos y en vivo'); } },
    { id: 'time-cal', icon: 'clock', nm: function () { return WC.L('Time & calendar', '時間・暦', 'Zeit & Kalender', 'Время и календарь', 'Hora y calendario'); } },
    { id: 'world', icon: 'world', nm: function () { return WC.L('World & countries', '世界・国', 'Welt & Länder', 'Мир и страны', 'Mundo y países'); } },
    { id: 'knowledge', icon: 'book', nm: function () { return WC.L('News & knowledge', 'ニュース・知識', 'Nachrichten & Wissen', 'Новости и знания', 'Noticias y conocimiento'); } },
    { id: 'markets', icon: 'chart', nm: function () { return WC.L('Markets', '市場', 'Märkte', 'Рынки', 'Mercados'); } },
    { id: 'space', icon: 'satellite', nm: function () { return WC.L('Space', '宇宙', 'Weltraum', 'Космос', 'Espacio'); } },
  ];

  /* ══ THE STATE MODEL ══════════════════════════════════════════════════════════════════════════
     ⚠ THE OLD BOARD HAD THREE STATES AND TWO OF THEM WERE PUNCTUATION: '···' for "anything before
     the first answer" and '—' for "anything that went wrong". A reader could not tell a feed with
     no events today from a feed that is rate-limited from a feed whose host is down, and a card
     that HAD an answer five minutes ago threw it away to print '—'. These are the twelve states a
     card can actually be in, and every one of them has its own renderer below. */
  WC.STATES = ['idle', 'loading', 'ready', 'refreshing', 'stale', 'offline',
    'permission-required', 'permission-denied', 'empty', 'rate-limited', 'temporary-error', 'permanent-error'];
  WC.isError = function (s) { return s === 'temporary-error' || s === 'permanent-error' || s === 'rate-limited'; };
  /* a state that keeps showing the last good answer underneath its notice */
  WC.keepsValue = function (s) { return s === 'refreshing' || s === 'stale' || s === 'offline' || WC.isError(s); };

  /* ── the skeleton. Same box the finished card occupies, so nothing jumps when data lands. ─── */
  WC.skeleton = function (size) {
    var rows = size === 'l' ? 5 : size === 'm' ? 3 : 2;
    var box = WC.el('div', { class: 'wgt-skel', 'aria-hidden': 'true' });
    for (var i = 0; i < rows; i++) box.appendChild(WC.el('div', { class: 'wgt-skel-b' + (i === 0 ? ' big' : '') }));
    return box;
  };

  /* ── the notice strip every non-ready state renders. Icon + reason + (optionally) an action. ─ */
  WC.notice = function (o) {
    var kids = [WC.el('span', { class: 'wgt-note-i' }, [WC.icon(o.icon || 'activity', { size: 14 })]),
      WC.el('span', { class: 'wgt-note-t', text: o.text })];
    var n = WC.el('div', { class: 'wgt-note wgt-note-' + (o.tone || 'muted'), role: o.tone === 'danger' ? 'status' : null }, kids);
    if (o.action) n.appendChild(WC.button(o.action.label, o.action.run, { class: 'wgt-act wgt-act-sm' }));
    return n;
  };

  /* ⚠ EVERY REASON IS A SENTENCE, NOT A GLYPH. `st.errorCode` is an internal token (a status code,
     a DOMException name); it is used to CHOOSE the sentence and never printed — §11 and §21 both
     say an exception message and an internal URL are not a reader's business. */
  WC.stateBody = function (st, def, ctx, api) {
    var L = WC.L;
    switch (st.status) {
      case 'loading': case 'idle':
        return WC.el('div', { class: 'wgt-state', 'aria-busy': 'true' }, [WC.skeleton(st.size)]);
      case 'offline':
        return WC.notice({ icon: 'radio', tone: 'muted', text: L('Offline — showing the last update', 'オフライン — 最後に取得した内容です', 'Offline – letzter Stand wird angezeigt', 'Нет сети — показан последний результат', 'Sin conexión: se muestra lo último recibido') });
      case 'permission-required':
        return WC.notice({
          icon: 'pin', tone: 'muted',
          text: def.permissionReason ? def.permissionReason() : L('This widget needs your location', 'このウィジェットは位置情報を使います', 'Dieses Widget benötigt Ihren Standort', 'Этому виджету нужно ваше местоположение', 'Este widget necesita su ubicación'),
          action: { label: L('Allow location', '位置情報を許可', 'Standort erlauben', 'Разрешить геолокацию', 'Permitir ubicación'), run: function () { api.requestLocation(); } },
        });
      case 'permission-denied':
        return WC.notice({
          icon: 'pin', tone: 'muted',
          text: L('Location is blocked in the browser', 'ブラウザで位置情報が拒否されています', 'Der Standort ist im Browser blockiert', 'Геолокация заблокирована в браузере', 'La ubicación está bloqueada en el navegador'),
          action: def.supportsMapCentre === false ? null : { label: L('Use the map centre', '地図の中心を使う', 'Kartenmitte verwenden', 'Использовать центр карты', 'Usar el centro del mapa'), run: function () { api.setConfig({ source: 'map' }); } },
        });
      case 'empty':
        return WC.notice({ icon: 'check', tone: 'muted', text: (def.emptyText && def.emptyText(ctx)) || L('Nothing to report right now', '現在、該当するものはありません', 'Derzeit nichts zu melden', 'Сейчас сообщать не о чем', 'No hay nada que informar ahora') });
      case 'rate-limited':
        return WC.notice({
          icon: 'hourglass', tone: 'warn',
          text: st.nextRetryAt
            ? L('Source limit reached — retrying ', '取得上限に達しました — 再試行 ', 'Limit der Quelle erreicht – neuer Versuch ', 'Достигнут лимит источника — повтор ', 'Límite de la fuente alcanzado: reintento ') + WC.ago(st.nextRetryAt).replace(/^-/, '')
            : L('Source limit reached', '取得上限に達しました', 'Limit der Quelle erreicht', 'Достигнут лимит источника', 'Límite de la fuente alcanzado'),
        });
      case 'temporary-error':
        return WC.notice({
          icon: 'refresh', tone: 'warn',
          text: L('Could not reach the source', '取得できませんでした', 'Die Quelle war nicht erreichbar', 'Не удалось получить данные', 'No se pudo contactar con la fuente'),
          action: { label: L('Try again', '再試行', 'Erneut versuchen', 'Повторить', 'Reintentar'), run: function () { api.refresh(true); } },
        });
      case 'permanent-error':
        return WC.notice({
          icon: 'close', tone: 'danger',
          text: L('This source is no longer available', 'この出典は現在利用できません', 'Diese Quelle ist nicht mehr verfügbar', 'Этот источник больше недоступен', 'Esta fuente ya no está disponible'),
        });
      default: return null;
    }
  };

  /* the small line a card in `refreshing` / `stale` puts under its (still shown) value */
  WC.freshnessLine = function (st) {
    var L = WC.L;
    if (st.status === 'refreshing') return WC.el('span', { class: 'wgt-fresh wgt-fresh-live', text: L('Updating…', '更新中…', 'Wird aktualisiert…', 'Обновление…', 'Actualizando…') });
    if (st.status === 'stale' && st.lastSuccessfulAt) return WC.el('span', { class: 'wgt-fresh', text: WC.ago(st.lastSuccessfulAt) });
    if (st.status === 'offline' && st.lastSuccessfulAt) return WC.el('span', { class: 'wgt-fresh', text: WC.ago(st.lastSuccessfulAt) });
    return null;
  };

  /* ══ THE REGISTRY ═════════════════════════════════════════════════════════════════════════════ */
  var DEFS = {};        /* id → definition */
  var ORDER = [];       /* declaration order, so the gallery is stable */
  var ALIAS = {};       /* legacy id → current id */

  WC.define = function (def) {
    if (!def || !def.id) throw new Error('widget definition needs an id');
    if (DEFS[def.id]) throw new Error('duplicate widget id: ' + def.id);
    def.size = undefined;                                  /* size belongs to an INSTANCE, not a definition */
    def.supportedSizes = (def.supportedSizes && def.supportedSizes.length ? def.supportedSizes : ['s', 'm', 'l'])
      .filter(function (s) { return WC.SIZES.indexOf(s) >= 0; });
    if (!def.defaultSize || def.supportedSizes.indexOf(def.defaultSize) < 0) def.defaultSize = def.supportedSizes[0];
    if (!def.category) def.category = 'world';
    if (!def.family) def.family = def.id.split('.')[0];
    if (!def.variant) def.variant = def.id.split('.')[1] || 'default';
    if (!def.refreshPolicy) def.refreshPolicy = { kind: 'manual' };
    if (!def.renderers) def.renderers = {};
    /* ⚠ a size a definition claims to support MUST have a renderer, or the card is blank at that
       size and nothing says why. Filled from the nearest size below, then above. */
    def.supportedSizes.forEach(function (s) {
      if (def.renderers[s]) return;
      var i = WC.SIZES.indexOf(s);
      for (var j = i - 1; j >= 0; j--) if (def.renderers[WC.SIZES[j]]) { def.renderers[s] = def.renderers[WC.SIZES[j]]; return; }
      for (var k = i + 1; k < WC.SIZES.length; k++) if (def.renderers[WC.SIZES[k]]) { def.renderers[s] = def.renderers[WC.SIZES[k]]; return; }
    });
    DEFS[def.id] = def;
    ORDER.push(def.id);
    (def.legacyIds || []).forEach(function (old) { ALIAS[old] = def.id; });
    return def;
  };
  WC.get = function (id) { return DEFS[id] || (ALIAS[id] ? DEFS[ALIAS[id]] : null) || null; };
  WC.resolveId = function (id) { return DEFS[id] ? id : (ALIAS[id] || null); };
  WC.all = function () { return ORDER.map(function (i) { return DEFS[i]; }); };
  WC.ids = function () { return ORDER.slice(); };
  WC.aliases = function () { return Object.assign({}, ALIAS); };
  WC.families = function () {
    var out = {}; WC.all().forEach(function (d) { (out[d.family] = out[d.family] || []).push(d); }); return out;
  };

  /* ══ THE WIDGET CONTEXT ═══════════════════════════════════════════════════════════════════════
     ⚠ RENDERERS DO NOT REACH FOR GLOBALS. Everything a renderer may know about the app arrives in
     this object, which makes each renderer a pure function of (context, data, config) — testable,
     and unable to acquire a hidden dependency on load order. Every field is defensive: a subsystem
     that has not booted yet answers `null`, never throws. */
  var _ctxCache = null, _ctxAt = 0, _monitors = [];
  WC.setMonitors = function (rows) { _monitors = Array.isArray(rows) ? rows : []; WC.invalidateContext(); };
  WC.context = function (force) {
    if (!force && _ctxCache && Date.now() - _ctxAt < 250) return _ctxCache;
    var c = {};
    c.lang = WC.lang();
    c.locale = WC.locale();
    c.theme = (function () { try { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; } })();
    c.units = {
      temp: (function () { try { return window.imUnitTemp || 'C'; } catch (e) { return 'C'; } })(),
      distance: (function () { try { return (HOST && HOST.unitDistance) || 'km'; } catch (e) { return 'km'; } })(),
      currency: 'USD',
    };
    c.timeZone = WC.tz();
    c.online = (function () { try { return navigator.onLine !== false; } catch (e) { return true; } })();
    c.location = WC.geoState();
    c.map = (function () {
      try {
        var E = window.IntMapGeoEngine;
        if (!E || !E.hasRenderer || !E.hasRenderer()) return null;
        var ctr = E.camera.getCenter(), z = E.camera.getZoom();
        if (!ctr) return null;
        var b = null;
        try { var bb = E.camera.getBounds && E.camera.getBounds(); if (bb) b = { w: bb.getWest(), s: bb.getSouth(), e: bb.getEast(), n: bb.getNorth() }; } catch (e) {}
        return { lng: ctr.lng, lat: ctr.lat, zoom: z, bounds: b, mPerPx: 156543.03392 * Math.cos(ctr.lat * Math.PI / 180) / Math.pow(2, z || 0) };
      } catch (e) { return null; }
    })();
    c.selection = {
      country: (function () { try { return (window.IntMapPick && window.IntMapPick.country && window.IntMapPick.country()) || (HOST && HOST.selectedCountry) || null; } catch (e) { return null; } })(),
      place: (function () { try { return (HOST && HOST.selectedPlace) || null; } catch (e) { return null; } })(),
    };
    c.layers = WC.activeLayers();
    c.chronos = (function () {
      try { var T = window.IntMapTime; if (!T) return null; var s = T.state(); return { when: s.when, iso: s.iso, year: s.year, isLive: s.isLive }; } catch (e) { return null; }
    })();
    /* ⚠ `IntMapRouting` IS THE LAND ROUTER; `IntMapRoute` IS THE SEA-ROUTE TOOL. They are different
       subsystems with similar names, and asking the wrong one is how a card reports "no route" while
       one is plainly drawn on the map. */
    c.route = (function () {
      try { var Rt = window.IntMapRouting; if (Rt && Rt.summary) return Rt.summary(); } catch (e) {}
      try { var Sea = window.IntMapRoute; if (Sea && Sea.active && Sea.active()) return { active: true, sea: true }; } catch (e) {}
      return { active: false };
    })();
    /* the monitors the account owns. `_list()` is asynchronous (it is a query), so the context
       carries what the LAST answer was and the card's own loader is what refreshes it. */
    c.monitors = _monitors;
    c.places = WC.savedPlaces();
    c.alerts = (function () { try { var W = window.IntMapWorld; return (W && W.alerts) ? W.alerts() : null; } catch (e) { return null; } })();
    _ctxCache = c; _ctxAt = Date.now();
    return c;
  };
  WC.invalidateContext = function () { _ctxCache = null; };

  /* ══ LOCATION — ONE PERMISSION, ASKED ONLY WHEN A READER ASKS FOR IT ══════════════════════════
     ⚠ §2.8: the browser prompt appears on an explicit action and NEVER because a card was added or
     a preview was drawn. `WC.geoState()` READS the Permissions API and the cached fix; it never
     triggers a prompt. `WC.requestGeo()` is what a button calls. */
  var _geo = { state: 'unknown', lat: null, lng: null, at: 0, asked: false };
  try {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(function (p) {
        _geo.state = p.state === 'granted' ? 'granted' : p.state === 'denied' ? 'denied' : 'prompt';
        p.onchange = function () { _geo.state = p.state === 'granted' ? 'granted' : p.state === 'denied' ? 'denied' : 'prompt'; WC.invalidateContext(); WC.emit('geo'); };
      }).catch(function () {});
    }
  } catch (e) {}
  WC.geoState = function () { return { state: _geo.state, lat: _geo.lat, lng: _geo.lng, at: _geo.at, fresh: !!_geo.at && Date.now() - _geo.at < 10 * 60 * 1000 }; };
  WC.requestGeo = function (cb) {
    if (!navigator.geolocation) { _geo.state = 'denied'; WC.emit('geo'); cb && cb(null); return; }
    _geo.asked = true;
    navigator.geolocation.getCurrentPosition(function (p) {
      _geo.lat = p.coords.latitude; _geo.lng = p.coords.longitude; _geo.at = Date.now(); _geo.state = 'granted';
      WC.invalidateContext(); WC.emit('geo'); cb && cb(_geo);
    }, function () { _geo.state = 'denied'; WC.invalidateContext(); WC.emit('geo'); cb && cb(null); },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 });
  };
  /* the point a location-shaped widget should use, given its config and what it is allowed to know */
  WC.resolvePoint = function (ctx, cfg) {
    var src = (cfg && cfg.source) || 'auto';
    if (src !== 'map' && ctx.location.state === 'granted' && ctx.location.lat != null) {
      return { lat: ctx.location.lat, lng: ctx.location.lng, kind: 'device', label: WC.L('my location', '現在地', 'mein Standort', 'моё местоположение', 'mi ubicación') };
    }
    if (src === 'device' && ctx.location.state !== 'granted') return null;      /* caller renders permission-required */
    if (ctx.map) return { lat: ctx.map.lat, lng: ctx.map.lng, kind: 'map', label: WC.L('map centre', '地図の中心', 'Kartenmitte', 'центр карты', 'centro del mapa') };
    return null;
  };

  /* ══ THE LAYER REGISTRY, READ THROUGH THE APP'S OWN LIST ══════════════════════════════════════
     ⚠ §15.E: NOT a walk of checkbox DOM. `window.IntMapLayers` is the app's registry and
     `IntMapDefaultLayers` its id list; the checkbox is how a reader drives it, not where the truth
     is. The DOM is consulted only for the human-readable LABEL, which lives nowhere else. */
  WC.activeLayers = function () {
    var out = [], seen = {};
    try {
      var ids = window.IntMapDefaultLayers || [];
      var rows = document.querySelectorAll('.lyr-row input[type=checkbox]');
      [].forEach.call(rows, function (cb) {
        if (!cb.id || seen[cb.id]) return;
        seen[cb.id] = 1;
        var lab = cb.closest('label');
        var sp = lab && lab.querySelector('span:not(.lyr-sw):not(.lsr-thumb)');
        var grpEl = lab && lab.closest('[data-lyr-group]');
        out.push({
          id: cb.id, on: !!cb.checked,
          label: ((sp ? sp.textContent : '') || cb.id).trim(),
          group: grpEl ? (grpEl.getAttribute('data-lyr-group') || '') : '',
          isDefault: ids.indexOf(cb.id) >= 0,
        });
      });
    } catch (e) {}
    return { all: out, on: out.filter(function (l) { return l.on; }), count: out.filter(function (l) { return l.on; }).length };
  };
  WC.setLayer = function (id, on) {
    try {
      var cb = document.getElementById(id);
      if (!cb) return false;
      if (!!cb.checked === !!on) return true;
      cb.checked = !!on;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      WC.invalidateContext();
      return true;
    } catch (e) { return false; }
  };

  /* saved places — the reader's own list, wherever the app keeps it */
  WC.savedPlaces = function () {
    var out = [];
    try {
      var raw = JSON.parse(localStorage.getItem('intmap_saved_places') || 'null');
      if (Array.isArray(raw)) raw.forEach(function (p) { if (p && isFinite(p.lat) && isFinite(p.lng)) out.push({ name: String(p.name || ''), lat: +p.lat, lng: +p.lng, cc: p.cc || null }); });
    } catch (e) {}
    try {
      var m = window.IntMapMonitors && window.IntMapMonitors.list && window.IntMapMonitors.list();
      if (Array.isArray(m)) m.forEach(function (x) {
        if (x && isFinite(x.center_lat) && isFinite(x.center_lng)) out.push({ name: String(x.name || ''), lat: +x.center_lat, lng: +x.center_lng, cc: null, watch: true });
      });
    } catch (e) {}
    return out;
  };

  /* ── camera, through the engine contract. This module never names a renderer (check:engine). ── */
  WC.flyTo = function (o) { try { var E = window.IntMapGeoEngine; if (E && E.hasRenderer()) E.camera.flyTo(o); } catch (e) {} };
  WC.fitBounds = function (b, o) { try { var E = window.IntMapGeoEngine; if (E && E.hasRenderer()) E.camera.fitBounds(b, o); } catch (e) {} };
  WC.toast = function (msg) { try { if (HOST && HOST.imToast) HOST.imToast(msg); } catch (e) {} };
  WC.isMobile = function () { try { return !!(HOST && HOST.isMobile && HOST.isMobile()); } catch (e) { return false; } };

  /* ── a tiny event bus, so the board can react without any module importing another ────────── */
  var subs = {};
  WC.on = function (ev, fn) { (subs[ev] = subs[ev] || []).push(fn); return function () { var a = subs[ev], i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }; };
  WC.emit = function (ev, payload) { (subs[ev] || []).forEach(function (f) { try { f(payload); } catch (e) {} }); };

  /* ══ THE ONE TICKER ═══════════════════════════════════════════════════════════════════════════
     ⚠ §12: not one setInterval per clock card. One rAF-free 1 Hz timer exists for the whole board;
     a card subscribes with the granularity it actually needs, and a card that shows no seconds is
     called once a minute rather than sixty times. It stops entirely when nothing is subscribed —
     which is what makes "no clock DOM work while the board is hidden" true by construction rather
     than by a `visible()` test inside every callback. */
  var tickSubs = [], tickT = null, lastMinute = -1;
  function tickRun() {
    var now = new Date(), min = now.getMinutes();
    var minuteEdge = (min !== lastMinute); lastMinute = min;
    for (var i = 0; i < tickSubs.length; i++) {
      var s = tickSubs[i];
      if (s.every === 'second' || minuteEdge) { try { s.fn(now); } catch (e) {} }
    }
  }
  WC.tick = function (every, fn) {
    var s = { every: every === 'second' ? 'second' : 'minute', fn: fn };
    tickSubs.push(s);
    if (!tickT) { lastMinute = -1; tickT = setInterval(tickRun, 1000); }
    try { fn(new Date()); } catch (e) {}
    return function () { var i = tickSubs.indexOf(s); if (i >= 0) tickSubs.splice(i, 1); if (!tickSubs.length && tickT) { clearInterval(tickT); tickT = null; } };
  };
  WC.tickCount = function () { return tickSubs.length; };
  WC.tickRunning = function () { return !!tickT; };

  return WC;
})();
