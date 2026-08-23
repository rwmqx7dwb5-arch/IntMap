/* ============================================================================
 *  IntMap · THE NAVIGATION HUD — window.IntMapNavUI   (#R347)
 * ----------------------------------------------------------------------------
 *  §38 「案内開始後はRoute Planning UIをそのまま残さないでください。専用Navigation UIへ切り替えます。」
 *  §10 progress · §11 turn-by-turn · §12 lanes · §16 the offer · §37 the phone · §46 the tick
 *
 *  ══ WHY THIS IS NOT A FOURTH TAB ON THE DIRECTIONS PANEL ═══════════════════════════════════════
 *  js/routing-ui.js answers a QUESTION — where from, where to, by what mode, which of these three
 *  routes — and every control on it exists to change that question. None of them mean anything once
 *  the car is moving: a reader at 90 km/h does not pick avoid-chips, and the two things they do need
 *  (the next turn, and when they arrive) were nowhere on it. So this is a different surface with a
 *  different shape: a HUD of TWO BARS with the map between them, and no control that edits a route.
 *  ⚠ THE PLANNING PANEL IS HIDDEN, NOT CLOSED. `IntMapRouteUI.close()` deletes the drawn route from
 *  the map (#R296 made that deliberate), and the route is the one thing navigation cannot lose. So
 *  §38 is kept with a body class — `body.nvg-on #route-panel{display:none}` — which takes the panel
 *  off the screen without touching one byte of its state: ending navigation removes the class and
 *  the reader gets their panel back exactly as they left it, endpoints, tab, scroll and all.
 *
 *  ══ ⚠⚠⚠ THE ONE RULE THIS FILE EXISTS TO KEEP (§46) ════════════════════════════════════════════
 *  「watchPositionごとに全DOM再構築をしてはいけません。」 A fix arrives about once a second and the
 *  store emits `progress` for each one — so `innerHTML = …` on this element would rebuild the whole
 *  HUD 3,600 times an hour, discard the reader's focus with it, and make every `<svg>` in the card
 *  a new node for the compositor to rasterise. What actually CHANGES at 1 Hz is eight numbers, and
 *  nothing else. So the file is split in two, and the split is the design:
 *
 *    ① THE FAST PATH — `fast(s)` writes `textContent` into eight nodes it holds references to:
 *         .nvg-dist (distance to the maneuver) · .nvg-eta · .nvg-remt · .nvg-remd
 *         .nvg-road · .nvg-leg · .nvg-acc · .nvg-voice
 *       Each write is compared first, so an unchanged number does not even dirty the layout.
 *    ② THE REBUILD — `paint()` recomputes two SIGNATURES and replaces markup only when one moved:
 *         cardSig = state · stepIndex · legIndex · the two steps' identity · the lane pattern · error
 *         barSig  = state · the traffic line's content · legCount · simulated · detent
 *       Both are plain strings, ~120 characters, compared once per tick. A step boundary happens
 *       about thirty times in a journey; a lane bar appears and disappears a handful of times.
 *    ⚠ EVERY subscriber notification goes through `paint()`, not just `progress` — the signatures
 *    already say whether anything visible moved, so `camera`, `voice`, `notes` and `attach` need no
 *    branch of their own and cannot be forgotten when a new `why` is added upstream.
 *    `_stats()` counts both, so «one fix rebuilt no markup» is a number a test can read rather than
 *    a claim in a comment.
 *
 *  ══ WHAT IS NOT REBUILT HERE, BECAUSE IT IS BUILT SOMEWHERE ELSE ═══════════════════════════════
 *   · THE SENTENCE is `IntMapRouting.maneuver()` — the nine-language OSRM vocabulary #R132 wrote and
 *     #R291 gave a named glyph to. This file phrases nothing.
 *     ⚠ IT IS ASKED FOR WITHOUT THE SIGNS. `maneuver()` appends 「方面: …」 and 「出口 …」 to its own
 *     sentence, and §11 wants them as a SIGNPOST of their own — printed both ways they would appear
 *     twice. So the step is copied with `destinations`/`exits` blanked and the copy is what gets
 *     phrased; trimming the tail with a regular expression would have to know nine languages' words
 *     for «toward», which is exactly the kind of second opinion this app keeps being bitten by.
 *   · THE NUMBERS are `IntMapRouteCards.distance / duration / clock` — unit-aware, locale-aware and
 *     zone-aware in one place (#R291/#R296), so the HUD and the route card cannot print two
 *     different totals for the same journey. ⚠ The ETA is clocked AT THE DESTINATION, which is what
 *     `clock(when, o, ll)`'s third argument is for.
 *   · THE ARROWS are `IntMapRouteCards.glyph` — the same SVG set the turn list draws. The only glyph
 *     defined in this file is the one that set has no name for (an unmarked lane), and the four
 *     control icons, which are not maneuvers.
 *   · THE ERROR SENTENCE is `IntMapRouteErrors.message(code)`. `error.detail` is a provider's or the
 *     browser's own wording and is never shown to a driver (§44).
 *
 *  ══ THE PHONE GETS TWO DETENTS, NOT THREE (§37) ════════════════════════════════════════════════
 *  js/routing-ui.js has min/mid/full because it has three bands of content to reveal. This has two —
 *  the numbers a driver reads at a glance, and the detail they pull up while stopped — so a third
 *  stop would be a position with nothing of its own to show. There is also no `visualViewport`
 *  follow: this surface has no text input, so the on-screen keyboard never opens over it.
 *  ⚠ AND NO SETTINGS PANEL. 「ナビ中に巨大な設定パネルを出さない」 — the expanded state is four rows
 *  of read-only facts, not controls.
 *
 *  ⚠ THE CSS IS IN css/intmap.css (`.nvg-*`). No <style>, no long `style="…"` strings.
 *  ⚠ NO RENDERER HANDLE. Everything on the map is js/navigation.js's; this file is DOM only.
 * ==========================================================================*/
window.IntMapNavUI = (function () {
  'use strict';

  var NS = function () { return window.IntMapNavStore; };
  var NAV = function () { return window.IntMapNavigation; };
  var NG = function () { return window.IntMapNavGuide; };
  var CD = function () { return window.IntMapRouteCards; };
  var RT = function () { return window.IntMapRouting; };
  var ERR = function () { return window.IntMapRouteErrors; };

  /* the same reading js/navigation.js and js/routing-errors.js use — this module holds no HOST */
  function lang() { try { return (window.IntMapHost && window.IntMapHost.lang) || document.documentElement.lang || 'en'; } catch (_) { return 'en'; } }
  /* ⚠⚠ BOUND THROUGH `pick()`, NOT WRAPPED ROUND `t()` — the same note js/navigation-voice.js
     carries, and for the same measured reason. The two resolve identically at runtime, but only a
     name PROVABLY bound to the registry is a translation call to scripts/i18n-helpers.mjs: a local
     `function L(){ … IntMapLang.t … }` is shadowed rather than proven, so every English string in
     this file would sit OUTSIDE the inline tables fr / ko / zh-Hant / zh-Hans are translated in —
     and `npm run check:i18n` would keep printing 100 % while four languages read English. Measured
     on this file before the change: 0 of its strings appeared in `i18n-report --missing fr`.
     The guard is js/basemap-switch.js's, because a lazy module cannot assume the registry is up. */
  var L = (window.IntMapLang && window.IntMapLang.pick)
    ? window.IntMapLang.pick(lang)
    : function () { return arguments[0]; };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  /* ⚠ THE MEASUREMENT AND TIME-ZONE SETTINGS COME FROM THE SAVED SETTINGS, not from a HOST. Every
     module that receives `IM_HOST` reads `HOST.unitMode` / `HOST.userTZ`; this one is imported by
     js/navigation.js rather than constructed with a host, and js/i18n.js already reads the same
     `intmap_settings` key for the same reason. Read once per open and once per language change —
     the reader cannot change a setting without one of those happening. */
  var _units = 'metric', _tz = '';
  function readCfg() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem('intmap_settings') || '{}') || {}; } catch (_) { s = {}; }
    _units = s.units || 'metric';
    _tz = (s.tz && s.tz !== 'auto') ? s.tz : '';
  }
  /* ⚠ `at` IS WHERE THE TIME HAPPENS. An ETA is an arrival, so it is the destination's wall clock
     (js/routing-cards.js `clock`) unless the reader pinned a zone in Settings. */
  function destLL(s) {
    var d = s && s.destination;
    return (d && isFinite(+d.lng) && isFinite(+d.lat)) ? [+d.lng, +d.lat] : null;
  }
  function opt(s) { return { lang: lang(), units: _units, tz: _tz, at: destLL(s) }; }
  function nameOf(pl) { return (pl && (pl.name || pl.label)) || ''; }

  var el = null, elTop = null, elBar = null;
  var openState = false, unsub = null, detent = 'min';
  var _cardSig = '', _barSig = '', _paints = 0, _rebuilds = 0;
  /* the fast path's eight nodes — re-grabbed after every rebuild, never searched for per tick */
  var nDist = null, nEta = null, nRemT = null, nRemD = null, nRoad = null, nLeg = null, nAcc = null, nVoice = null;

  /* ══ THE DOOR ═════════════════════════════════════════════════════════════════════════════════
     Idempotent: js/navigation.js calls `open()` on every `start()`, and a restart while the HUD is
     already up must re-render rather than build a second one or add a second subscription. */
  function open() {
    build();
    readCfg();
    if (!openState) {
      openState = true;
      el.hidden = false;
      document.body.classList.add('nvg-on');
      if (!unsub) unsub = NS().on(onStore);
    }
    render();
    return true;
  }
  function close() {
    openState = false;
    if (unsub) { try { unsub(); } catch (_) { } unsub = null; }
    if (el) el.hidden = true;
    try { document.body.classList.remove('nvg-on'); } catch (_) { }
    _cardSig = ''; _barSig = '';
    return true;
  }
  function isOpen() { return !!openState; }

  function build() {
    if (el) return el;
    el = document.createElement('section');
    el.id = 'nav-ui'; el.className = 'nvg'; el.hidden = true;
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', hudLabel());
    /* the two bars are the only structure that never changes; everything inside them is signed */
    el.innerHTML = '<div class="nvg-top"></div><div class="nvg-bar"></div>';
    elTop = el.querySelector('.nvg-top');
    elBar = el.querySelector('.nvg-bar');
    /* ⚠ THE BODY, NOT #map-container. MEASURED at 390×844 (#R347): mounted inside the map
       container, this panel's z-index of 1802 is scoped to THAT element's stacking context, and
       #map-container loses to #sidebar (z 1100) which is its sibling — so on a phone the whole
       lower half of the navigation bar was painted over by the news sheet
       (`document.elementFromPoint(195, 700)` returned `#sidebar`, not `.nvg-bar`). A z-index is only
       a promise about the siblings it has. Mounting on the body puts 1802 in the same context as
       1100, where it means what it says. */
    document.body.appendChild(el);
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKey);
    try { window.addEventListener('intmap-lang', onLang); } catch (_) { }
    return el;
  }
  function onLang() {
    if (!openState) return;
    readCfg();
    try { el.setAttribute('aria-label', hudLabel()); } catch (_) { }
    render();
  }
  /* ⚠ 「Turn-by-turn」 RATHER THAN THE BARE WORD, and it is not a stylistic preference: German for
     「Navigation」 IS 「Navigation」, so the bare key is byte-identical to English and
     scripts/i18n-positional-audit.mjs correctly cannot tell a translated row from an untranslated
     one. 「Zielführung」 is also what a German car actually calls this. One helper, so the tuple has
     one call site and the two callers cannot drift apart. */
  function hudLabel() { return L('Turn-by-turn navigation', '経路案内', 'Zielführung', 'Пошаговая навигация', 'Navegación paso a paso'); }

  /* ══ THE TICK ══════════════════════════════════════════════════════════════════════════════════ */
  function onStore(s) { paint(s, false); }

  /** the full redraw — the only caller that forces one is `open()` and a language switch */
  function render() { if (el) paint(NS().get(), true); }

  function paint(s, force) {
    if (!el || !openState) return;
    var cs = cardSig(s), bs = barSig(s), rebuilt = false;
    if (force || cs !== _cardSig) { _cardSig = cs; elTop.innerHTML = topHTML(s); rebuilt = true; }
    if (force || bs !== _barSig) { _barSig = bs; elBar.innerHTML = barHTML(s); rebuilt = true; }
    if (rebuilt) { grab(); _rebuilds++; }
    /* attributes are compared too: writing the same value every second still invalidates style */
    if (el.getAttribute('data-state') !== s.state) el.setAttribute('data-state', s.state);
    if (el.getAttribute('data-detent') !== detent) el.setAttribute('data-detent', detent);
    fast(s);
    _paints++;
  }

  /* ── the signatures. Everything the markup is MADE of, and nothing that is only a number ────── */
  function cardSig(s) {
    return [s.state, s.stepIndex, s.legIndex, s.legCount,
      stepKey(s.currentStep), stepKey(s.nextStep), laneKey(s.lanes),
      (s.error && s.error.code) || '', offerKey(s)].join('|');
  }
  function barSig(s) {
    return [s.state, detent, s.legCount, s.simulated ? 1 : 0, trafficKey(s.etaMeta), s.voiceMode, s.cameraMode, s.cameraUserPanned ? 1 : 0].join('|');
  }
  /* ⚠ NOT JUST THE INDEX. A reroute can hand back a step with the same number on a different road,
     and `attach()` resets the index to −1 before the next fix sets it — so the identity of the step
     is what decides whether the sentence on screen is still the right one. */
  function stepKey(st) {
    if (!st) return '';
    return [st.i, st.type, st.modifier, st.name, st.ref, st.exits, st.destinations].join('~');
  }
  function laneKey(a) {
    if (!a || !a.length) return '';
    var out = [];
    for (var i = 0; i < a.length; i++) out.push((a[i].valid ? '1' : '0') + ':' + (a[i].indications || []).join(','));
    return out.join('/');
  }
  function trafficKey(m) {
    if (!m) return 'none';
    return [m.traffic ? 1 : 0, Math.round((+m.delaySec || 0) / 30), m.stale ? 1 : 0].join(',');
  }
  function offerKey(s) { var o = offerOf(s); return o ? ('offer:' + Math.round((+o.savingS || 0) / 30)) : ''; }

  function grab() {
    nDist = el.querySelector('.nvg-dist');
    nEta = el.querySelector('.nvg-eta');
    nRemT = el.querySelector('.nvg-remt');
    nRemD = el.querySelector('.nvg-remd');
    nRoad = el.querySelector('.nvg-road');
    nLeg = el.querySelector('.nvg-leg');
    nAcc = el.querySelector('.nvg-acc');
    nVoice = el.querySelector('.nvg-voice');
  }
  function setTx(n, v) { if (n && n.textContent !== v) n.textContent = v; }

  /* ⚠⚠ THE EIGHT NUMBERS — AND NOTHING ELSE — MAY BE TOUCHED HERE. */
  function fast(s) {
    var o = opt(s);
    setTx(nDist, s.currentStep ? CD().distance(snap(s.distanceToManeuver), o) : '');
    setTx(nEta, s.eta ? (CD().clock(s.eta, o, destLL(s)) || '—') : '—');
    setTx(nRemT, CD().duration(s.remainingDuration, o));
    setTx(nRemD, CD().distance(s.remainingDistance, o));
    setTx(nRoad, s.currentRoad || '—');
    setTx(nLeg, (s.legIndex + 1) + ' / ' + s.legCount);
    setTx(nAcc, s.accuracy == null ? '—' : ('± ' + CD().distance(Math.round(s.accuracy), o)));
    setTx(nVoice, voiceLabel(s.voiceMode));
  }

  /* ⚠ THE VALUE IS ROUNDED, NOT THE FORMATTER REPLACED. `IntMapRouteCards.distance` prints whole
     metres below a kilometre, which is right for a route card (a fixed total) and wrong for a
     countdown that is re-read every second: «287 m → 284 m → 286 m» is GPS noise rendered as
     motion, and it makes the biggest number on the screen the least readable one. Snapping the
     INPUT to the step a driver can act on leaves one formatter in the app and one set of units. */
  function snap(m) {
    m = Math.max(0, +m || 0);
    if (m < 100) return Math.round(m / 10) * 10;
    if (m < 500) return Math.round(m / 25) * 25;
    if (m < 1000) return Math.round(m / 50) * 50;
    return Math.round(m / 100) * 100;
  }
  function voiceLabel(m) {
    return m === 'off' ? L('Off', 'オフ', 'Aus', 'Выкл.', 'Desactivada')
      : m === 'alerts' ? L('Alerts only', '重要なもののみ', 'Nur Hinweise', 'Только важное', 'Solo avisos')
        : L('On', 'オン', 'Ein', 'Вкл.', 'Activada');
  }

  /* ══ THE GUIDANCE CARD (§11) ═══════════════════════════════════════════════════════════════════ */
  function topHTML(s) {
    if (s.state === 'error') return errorHTML(s);
    if (s.state === 'arrived') return arrivedHTML(s);
    /* ⚠ NO INSTRUCTION WHILE THE ROUTE IS IN DOUBT. Off route, `currentStep` describes a turn on a
       road the reader is not on — js/navigation-store.js's own header calls that «the single most
       common way a navigator lies» — and while rerouting it is about to be replaced. The banner is
       the whole message in both states. */
    var quiet = (s.state === 'offroute' || s.state === 'rerouting' || s.state === 'acquiring_location');
    return bannerHTML(s) + (!quiet && s.currentStep ? cardHTML(s) : '') + offerHTML(s);
  }

  function cardHTML(s) {
    var m = instruction(s.currentStep);
    return '<div class="nvg-card">'
      + '<div class="nvg-man">'
      + '<span class="nvg-arrow" aria-hidden="true">' + CD().glyph(m.key || 'straight', { size: 44 }) + '</span>'
      /* filled by fast() — the one node in this card that changes between steps */
      + '<span class="nvg-dist" aria-live="off"></span>'
      + '</div>'
      + '<p class="nvg-say">' + esc(m.text) + '</p>'
      + signsHTML(s.currentStep)
      + lanesHTML(s)
      + thenHTML(s.nextStep)
      + '</div>';
  }

  /** the sentence, asked for WITHOUT the signposts — see the header */
  function instruction(step) {
    if (!step) return { text: '', key: 'straight' };
    var raw = step.raw || step;
    var lean = raw;
    try { lean = Object.assign({}, raw, { destinations: '', exits: '' }); } catch (_) { lean = raw; }
    try {
      var R = RT();
      if (R && typeof R.maneuver === 'function') { var m = R.maneuver(lean); if (m && m.text) return m; }
    } catch (_) { /* fall through */ }
    /* js/routing.js is the ONLY place this app phrases a maneuver, so there is no second copy here:
       without it the card shows the road and the neutral arrow rather than an invented sentence. */
    var road = '';
    try { road = NG().roadOf(step); } catch (_) { road = String(step.name || ''); }
    return { text: road, key: 'straight' };
  }

  /* ══ §11 SIGNPOSTS — printed only when the road authority actually put them on a sign ══════════
     ⚠⚠ THE TWO KEYS CARRY A TRAILING SPACE ON PURPOSE, and they are js/routing.js's own. The inline
     tables are keyed by the ENGLISH STRING, so `'Exit'` and `'toward'` would have inherited rows
     that already exist and mean something else — `"Exit": "Quitter" / "나가기"` (leaving an app,
     from js/flight-sim.js) instead of `"exit ": "sortie " / "출구 "` (a motorway exit, from the turn
     list). A wrong translation is worse than a missing one: nothing reports it. Trimmed for the
     badge, so the space costs nothing on screen. */
  function signsHTML(st) {
    if (!st) return '';
    var ex = String(st.exits || '').trim(), de = String(st.destinations || '').trim();
    if (!ex && !de) return '';
    return '<div class="nvg-signs">'
      + (ex ? '<span class="nvg-exit"><span class="nvg-exit-k">' + esc(L('exit ', '出口 ', 'Ausf. ', 'съезд ', 'salida ').trim()) + '</span> ' + esc(ex.replace(/[;,]+/g, ' / ')) + '</span>' : '')
      + (de ? '<span class="nvg-toward"><span class="nvg-toward-k">' + esc(L('toward ', '方面: ', 'Ri. ', 'в сторону ', 'hacia ').trim()) + '</span> ' + esc(de.replace(/[;,]+/g, ' / ').replace(/:/g, ' ')) + '</span>' : '')
      + '</div>';
  }

  /* ══ LANES (§12) ═══════════════════════════════════════════════════════════════════════════════
     `state.lanes` is null unless the PROVIDER gave lanes and the maneuver is close enough to act on
     them (js/navigation-guidance.js decides both). Null draws nothing at all — 「lane dataが無い場合
     は表示しません。勝手な推定は禁止です。」
     ⚠ THE USABLE LANES ARE NOT MARKED BY COLOUR ALONE (§19): they keep full opacity, gain the accent
     colour AND an underline, and the whole bar carries js/routing-cards.js's own sentence — 「車線:
     2, 3 ／ 4」 — as its accessible name, so a reader who cannot see it is told the same thing. */
  function lanesHTML(s) {
    var a = s.lanes;
    if (!a || !a.length) return '';
    var mark = '', cells = '';
    for (var i = 0; i < a.length; i++) {
      var l = a[i] || {};
      var ind = (l.indications && l.indications.length) ? l.indications : ['none'];
      mark += l.valid ? '▮' : '▯';
      var arrows = '';
      for (var j = 0; j < ind.length; j++) arrows += laneArrow(String(ind[j] || 'none'));
      cells += '<span class="nvg-lane' + (l.valid ? ' on' : '') + '">' + arrows + '</span>';
    }
    var say = '';
    try { say = CD().laneText(mark, opt(s)); } catch (_) { say = ''; }
    return '<div class="nvg-lanes" role="img" aria-label="' + esc(say) + '">' + cells + '</div>';
  }
  /* ⚠ `none` IS NOT `straight`. OSRM writes `none` for a lane that carries NO painted marking;
     drawing a straight arrow for it would be this file deciding what the lane is for, which is the
     estimate §12 forbids. It gets a plain stroke — a lane that exists and says nothing. Every other
     indication has a name js/routing-cards.js already draws, so this is the only lane glyph here. */
  function laneArrow(k) {
    if (!k || k === 'none') return svgLocal('<path d="M12 20V5.5"/>', 22);
    return CD().glyph(k, { size: 22 });
  }

  function thenHTML(st) {
    if (!st) return '';
    var m = instruction(st);
    if (!m.text) return '';
    return '<div class="nvg-then">'
      + '<span class="nvg-then-ic" aria-hidden="true">' + CD().glyph(m.key || 'straight', { size: 16 }) + '</span>'
      + '<span class="nvg-then-tx"><span class="nvg-then-k">' + esc(L('then', 'その後', 'dann', 'затем', 'luego')) + '</span> ' + esc(m.text) + '</span>'
      + '</div>';
  }

  /* ══ THE STATE BANNER (§7) ═════════════════════════════════════════════════════════════════════
     ⚠ THE SPINNER IS A CSS ANIMATION. A JS-driven one would run a timer on the same thread the tick
     uses, and would keep running in a background tab where nothing can be seen anyway. */
  function bannerHTML(s) {
    var busy = (s.state === 'acquiring_location' || s.state === 'rerouting');
    var tx = '';
    if (s.state === 'acquiring_location') tx = L('Getting your location…', '現在地を取得中…', 'Standort wird ermittelt…', 'Определяем местоположение…', 'Obteniendo su ubicación…');
    else if (s.state === 'offroute') tx = L('You have left the route', '経路を外れました', 'Du hast die Route verlassen', 'Вы сошли с маршрута', 'Te has salido de la ruta');
    else if (s.state === 'rerouting') tx = L('Finding a new route…', '再探索中…', 'Neue Route wird gesucht…', 'Ищем новый маршрут…', 'Buscando una nueva ruta…');
    else if (s.state === 'arriving') tx = L('Arriving soon', 'まもなく到着', 'Ankunft in Kürze', 'Скоро прибытие', 'Llegando pronto');
    else if (s.state === 'paused') tx = L('Navigation is paused', '一時停止中', 'Navigation pausiert', 'Навигация приостановлена', 'Navegación en pausa');
    if (!tx) return '';
    return '<div class="nvg-banner nvg-s-' + esc(s.state) + '" role="status">'
      + (busy ? '<span class="nvg-spin" aria-hidden="true"></span>' : '')
      + '<span class="nvg-banner-tx">' + esc(tx) + '</span>'
      + (s.state === 'paused'
        ? '<button type="button" class="nvg-btn nvg-btn-tx nvg-primary" data-act="resume">' + esc(L('Resume', '再開', 'Fortsetzen', 'Продолжить', 'Reanudar')) + '</button>'
        : '')
      + '</div>';
  }

  function errorHTML(s) {
    var code = (s.error && s.error.code) || 'UNKNOWN', msg = '';
    /* ⚠ THE TAXONOMY'S SENTENCE, NEVER `error.detail` — that is a provider's or the browser's own
       wording, is not translated, and is not written for someone driving (§44). */
    try { msg = ERR().message(code); } catch (_) { msg = ''; }
    return '<div class="nvg-banner nvg-s-error" role="alert">'
      + '<span class="nvg-banner-tx">' + esc(msg) + '</span></div>';
  }

  /* ══ ARRIVAL (§17) ═════════════════════════════════════════════════════════════════════════════
     ⚠ 「次へ」 IS REAL AND IS GUARDED. js/navigation.js normally advances the leg itself (`onArrived`
     calls `nextLeg()` in the same turn), so this card is usually seen only at the FINAL destination.
     When it is seen at a stop, the button goes through the store's own door — the same one the
     orchestrator uses — and only while the state is still `arrived`, because `nextLeg()` increments
     the leg unconditionally and pressing it after the orchestrator had already advanced would skip
     a leg. `arrived → ready` is the only way out of this state, so the guard cannot be raced. */
  function arrivedHTML(s) {
    var more = (s.legIndex + 1) < s.legCount;
    var name = nameOf(s.legDestination || s.destination);
    return '<div class="nvg-card nvg-arrived">'
      + '<div class="nvg-man">'
      + '<span class="nvg-arrow" aria-hidden="true">' + CD().glyph('arrive', { size: 44 }) + '</span>'
      + '<span class="nvg-arr-hd">' + esc(more
        ? L('Stop reached', '経由地に到着', 'Zwischenziel erreicht', 'Промежуточная точка достигнута', 'Parada alcanzada')
        : L('You have arrived', '到着しました', 'Sie sind angekommen', 'Вы прибыли', 'Has llegado')) + '</span>'
      + '</div>'
      + (name ? '<p class="nvg-say">' + esc(name) + '</p>' : '')
      + (more ? '<div class="nvg-arr-acts"><button type="button" class="nvg-btn nvg-btn-tx nvg-primary" data-act="next">'
        + esc(L('Next stop', '次へ', 'Weiter', 'Далее', 'Siguiente')) + '</button></div>' : '')
      + '</div>';
  }

  /* ══ THE OFFER (§16) ═══════════════════════════════════════════════════════════════════════════
     「自動で切り替えない」 — js/navigation.js only ever WRITES the note; the change happens when this
     button is pressed and not before. The ids are read from the store at press time rather than
     written into the markup: they are fresher, and there is one less external string in the DOM. */
  function offerOf(s) {
    var n = (s && s.notes) || [];
    for (var i = n.length - 1; i >= 0; i--) if (n[i] && n[i].kind === 'traffic_faster') return n[i];
    return null;
  }
  function offerHTML(s) {
    var o = offerOf(s);
    if (!o) return '';
    var t = CD().duration(+o.savingS || 0, opt(s));
    return '<div class="nvg-offer" role="status">'
      + '<span class="nvg-offer-tx">' + esc(L('A faster route saves {t}', '{t}早い経路があります', 'Eine Route ist {t} schneller', 'Маршрут быстрее на {t}', 'Una ruta es {t} más rápida').replace('{t}', t)) + '</span>'
      + '<button type="button" class="nvg-btn nvg-btn-tx nvg-primary" data-act="offer">' + esc(L('Switch', '変更', 'Wechseln', 'Сменить', 'Cambiar')) + '</button>'
      + '</div>';
  }

  /* ══ THE STATUS BAR (§10) ══════════════════════════════════════════════════════════════════════ */
  function barHTML(s) {
    var full = detent === 'full';
    var grip = full
      ? L('Fewer details', '詳細を隠す', 'Weniger Details', 'Свернуть', 'Menos detalles')
      : L('More details', '詳細を表示', 'Mehr Details', 'Подробнее', 'Más detalles');
    return '<div class="nvg-panel">'
      + '<button type="button" class="nvg-grip" data-act="detent" aria-expanded="' + (full ? 'true' : 'false') + '" aria-label="' + esc(grip) + '" title="' + esc(grip) + '"><span class="nvg-grip-bar" aria-hidden="true"></span></button>'
      + '<div class="nvg-stats">'
      + statHTML('nvg-eta', L('Arrival', '到着', 'Ankunft', 'Прибытие', 'Llegada'))
      + statHTML('nvg-remt', L('Time left', '残り時間', 'Restzeit', 'Осталось', 'Tiempo restante'))
      + statHTML('nvg-remd', L('Distance left', '残り距離', 'Reststrecke', 'Расстояние', 'Distancia restante'))
      + '</div>'
      + trafficHTML(s)
      + actsHTML(s)
      + (full ? moreHTML(s) : '')
      + '</div>';
  }
  function statHTML(cls, cap) {
    return '<div class="nvg-stat"><b class="' + cls + '"></b><span class="nvg-cap">' + esc(cap) + '</span></div>';
  }

  /* ⚠⚠ §6 — THE HUD SAYS WHERE THE NUMBER CAME FROM, INCLUDING WHEN THE ANSWER IS «NOWHERE».
     Without an `etaMeta` carrying `traffic`, the remaining time is the router's free-flow duration
     and nothing more; printing 「渋滞を考慮」 over it would be the app claiming data it does not have. */
  function trafficHTML(s) {
    var m = s.etaMeta, tx, cls = '';
    if (!m || !m.traffic) {
      tx = L('Traffic is not included', '交通状況未反映', 'Ohne Verkehrslage', 'Без учёта пробок', 'Sin datos de tráfico');
    } else {
      var d = Math.max(0, +m.delaySec || 0);
      if (d >= 60) {
        tx = L('{t} slower than usual', '通常より{t}遅い', '{t} langsamer als üblich', 'На {t} медленнее обычного', '{t} más lento de lo habitual')
          .replace('{t}', CD().duration(d, opt(s)));
        cls = ' nvg-late';
      } else {
        tx = L('Traffic included', '交通状況を反映', 'Mit Verkehrslage', 'С учётом пробок', 'Con datos de tráfico');
      }
    }
    if (m && m.stale) tx += ' · ' + L('Traffic data is out of date', '交通情報が古くなっています', 'Verkehrsdaten sind veraltet', 'Данные о пробках устарели', 'Los datos de tráfico están desactualizados');
    return '<p class="nvg-traffic' + cls + '">' + esc(tx) + '</p>';
  }

  /* ══ THE FOUR CONTROLS (§37) — 44 px each, and each says what it does ══════════════════════════
     ⚠ RECENTRE IS ONLY LOUD WHEN IT IS NEEDED. §18: a manual pan suspends following, and
     `cameraUserPanned` is the store's word for «the reader is looking somewhere else». Filling the
     button at all other times would make the accent colour mean nothing. */
  function actsHTML(s) {
    var muted = s.voiceMode === 'off';
    var over = s.cameraMode === 'overview';
    return '<div class="nvg-acts">'
      + btnHTML('recenter', svgLocal(IC.here, 20), L('Re-centre the map', '現在地に戻す', 'Karte zentrieren', 'Вернуть к позиции', 'Centrar el mapa'), s.cameraUserPanned ? ' nvg-primary' : '')
      + btnHTML('mute', svgLocal(muted ? IC.muted : IC.sound, 20),
        muted ? L('Turn voice guidance on', '音声案内をオン', 'Sprachansagen ein', 'Включить голос', 'Activar la voz')
          : L('Mute voice guidance', '音声案内をオフ', 'Sprachansagen aus', 'Выключить голос', 'Silenciar la voz'),
        muted ? ' on' : '')
      + btnHTML('overview', svgLocal(IC.overview, 20),
        over ? L('Follow my position', '追従に戻す', 'Position folgen', 'Следовать за позицией', 'Seguir mi posición')
          : L('Show the whole route', '全体を表示', 'Ganze Route zeigen', 'Показать весь маршрут', 'Ver la ruta completa'),
        over ? ' on' : '')
      + btnHTML('exit', svgLocal(IC.close, 20), L('End navigation', '案内を終了', 'Navigation beenden', 'Завершить навигацию', 'Terminar la navegación'), ' nvg-end')
      + '</div>';
  }
  function btnHTML(act, icon, label, cls) {
    return '<button type="button" class="nvg-btn' + (cls || '') + '" data-act="' + act + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' + icon + '</button>';
  }

  /* ⚠ READ-ONLY FACTS, NOT SETTINGS (§37). Every value here is written by fast(), so pulling the bar
     up does not add a second thing that has to be kept in step with the tick. */
  function moreHTML(s) {
    var rows = rowHTML('nvg-road', L('Current road', '走行中の道路', 'Aktuelle Straße', 'Текущая дорога', 'Vía actual'));
    /* ⚠ `'Via point'` AND NOT `'Stop'` — the same collision the signposts have: `"Stop": "Arrêter" /
       "정지"` already exists and means «halt». This row shares js/navigation-voice.js's key. */
    if (s.legCount > 1) rows += rowHTML('nvg-leg', L('Via point', '経由地', 'Zwischenziel', 'Промежуточная точка', 'Punto intermedio'));
    rows += rowHTML('nvg-acc', L('Location accuracy', '位置精度', 'Ortungsgenauigkeit', 'Точность позиции', 'Precisión de la ubicación'));
    rows += rowHTML('nvg-voice', L('Voice guidance', '音声案内', 'Sprachansagen', 'Голосовые подсказки', 'Guía por voz'));
    /* §43 — a simulated drive must never be mistaken for a real one */
    if (s.simulated) rows += '<p class="nvg-sim">' + esc(L('Simulated drive', 'シミュレーション走行', 'Simulierte Fahrt', 'Смоделированная поездка', 'Conducción simulada')) + '</p>';
    return '<div class="nvg-more">' + rows + '</div>';
  }
  function rowHTML(cls, cap) {
    return '<div class="nvg-row"><span class="nvg-cap">' + esc(cap) + '</span><b class="' + cls + '"></b></div>';
  }

  /* ══ ICONS ═════════════════════════════════════════════════════════════════════════════════════
     ⚠ FOUR, AND ONLY FOUR. Every maneuver arrow and every lane arrow that has a name comes from
     js/routing-cards.js's set; these are controls, which that set has no reason to carry. Same
     viewBox, same stroke weight, so they sit on the same optical grid as the arrows above them. */
  var IC = {
    here: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5"/>',
    sound: '<path d="M4 9.4h3.3L12 5.4v13.2l-4.7-4H4z"/><path d="M15.8 9.5a3.9 3.9 0 0 1 0 5"/><path d="M18.4 7a7.3 7.3 0 0 1 0 10"/>',
    muted: '<path d="M4 9.4h3.3L12 5.4v13.2l-4.7-4H4z"/><path d="M16.2 9.8l4.6 4.4"/><path d="M20.8 9.8l-4.6 4.4"/>',
    overview: '<path d="M9.4 3.6L3.6 6v14.4l5.8-2.5 5.2 2.5 5.8-2.4V3.6l-5.8 2.4z"/><path d="M9.4 3.6v14.3M14.6 6v14.4"/>',
    close: '<path d="M6.2 6.2l11.6 11.6M17.8 6.2L6.2 17.8"/>',
  };
  function svgLocal(d, size) {
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" '
      + 'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + '</svg>';
  }

  /* ══ EVENTS — one delegated listener, so a rebuild never leaves a handler behind ═══════════════ */
  function onClick(e) {
    var b = e.target && e.target.closest && e.target.closest('[data-act]');
    if (!b || !el.contains(b)) return;
    act(b.getAttribute('data-act'));
  }
  function onKey(e) {
    if (!e.target || !e.target.closest || !e.target.closest('.nvg-grip')) return;
    if (e.key === 'ArrowUp' && detent !== 'full') { e.preventDefault(); setDetent('full'); }
    else if (e.key === 'ArrowDown' && detent !== 'min') { e.preventDefault(); setDetent('min'); }
  }
  function setDetent(d) { detent = d; paint(NS().get(), false); }

  function act(a) {
    var N = NAV(), S = NS();
    if (a === 'detent') { setDetent(detent === 'full' ? 'min' : 'full'); return; }
    if (!N) return;
    if (a === 'recenter') { try { N.recenter(); } catch (_) { } return; }
    if (a === 'mute') { try { N.setVoice(S.get().voiceMode === 'off' ? 'guidance' : 'off'); } catch (_) { } return; }
    /* the overview button is a toggle: the way back from «show me the whole route» is the control
       that took you there, not a second button that only ever appears once */
    if (a === 'overview') { try { N.setCamera(S.get().cameraMode === 'overview' ? 'follow' : 'overview'); } catch (_) { } return; }
    if (a === 'exit') { try { N.stop(); } catch (_) { } return; }
    if (a === 'resume') { try { N.resume(); } catch (_) { } return; }
    if (a === 'offer') { var o = offerOf(S.get()); if (o) { try { N.acceptOffer(o.routeSetId, o.sel); } catch (_) { } } return; }
    if (a === 'next') { if (S.state() === 'arrived') { try { S.nextLeg(); } catch (_) { } } return; }
  }

  return {
    open: open, close: close, isOpen: isOpen, render: render,
    _el: function () { return el; },
    /* §46 is a claim about numbers, so the numbers are readable: `rebuilds` may not move when a
       fix arrives that changed nothing but the eight values (tests/…-nav asserts exactly that). */
    _stats: function () { return { paints: _paints, rebuilds: _rebuilds, detent: detent }; },
  };
})();
