/* ============================================================================
 *  IntMap · WHICH «NOW» — window.IntMapRouteClock   (#R347)
 * ----------------------------------------------------------------------------
 *  §33: 「Routing独自の時刻系を増やさないでください。」
 *       「ただしナビ中の現在時刻まで歴史時刻へ引っ張らないなど、simulation time と wall-clock
 *        navigation timeは明確に区別してください。」
 *
 *  ══ THIS FILE ADDS NO CLOCK. IT NAMES THE TWO THAT ALREADY EXIST ═══════════════════════════════
 *  IntMap has a history clock — `window.IntMapTime` (js/chronos.js) — that the whole app follows. A
 *  reader who drags it to 1950 gets 1950's rail network, 1950's borders, 1950's news. Routing joined
 *  that: «historical network routing» is a shipped feature.
 *  Navigation cannot join it. A reader looking at 1950 is still driving home today, and an arrival
 *  time computed from a 1950 «now» is not merely wrong, it is wrong by seventy-six years.
 *
 *  Before this round the distinction was made by ACCIDENT: routing called `Date.now()` in nine
 *  places and `IntMapTime` in none, so planning ignored the history clock (a bug, for depart-at) and
 *  navigation ignored it (correct, by luck). Naming the two makes both deliberate:
 *
 *      planningNow()  →  the clock the READER is looking at.  Chronos when it is pinned; the wall
 *                        clock when it is live.  Depart-at, arrive-by, transit times, predicted
 *                        traffic, route weather and intermediate ETAs all take this one.
 *      navNow()       →  the wall clock, always.  Cue timing, staleness, rate limits, arrival times
 *                        during active navigation.  ⚠ NEVER Chronos, and a test asserts that
 *                        js/navigation*.js never names IntMapTime at all.
 *
 *  ⚠ AND `planningNow()` HAS TO BE HONEST WHEN IT IS NOT THE WALL CLOCK. A reader who pinned 1950
 *  and asked for a bus is going to get either nonsense or nothing from a live GTFS server, and the
 *  useful thing to tell them is WHY. `isHistorical()` is what the panel asks; `historicalNote()` is
 *  the sentence, in nine languages.
 *
 *  ⚠ TIMEZONES ARE NOT HERE. js/routing-cards.js already owns `zoneOffsetAt` / `clock` / `eta`, and
 *  #R323's lesson is that a second table describing the same thing drifts from the first. This file
 *  answers WHICH INSTANT; that one answers HOW TO WRITE IT.
 * ==========================================================================*/
window.IntMapRouteClock = (function () {
  'use strict';

  /* ⚠ BOUND THROUGH `pick`, NOT A WRAPPER AROUND `t`. scripts/i18n-helpers.mjs seeds each locale's
     inline table from the call sites it recognises, and `L = (...a) => IntMapLang.t(lang(), ...a)` is
     not one of them: the English strings would never enter the fr / ko / zh-Hant / zh-Hans corpus, so
     those four readers would see English while `npm run check:i18n` reported 100 %. That is the exact
     shape #R251 closed, met again — and `pick(lang)` is the form the audit follows. Behaviour is
     identical (positional for five languages, the inline table for the rest). */
  function lang() {
    try {
      var R = window.IntMapLang;
      var raw = (window.IM_HOST && window.IM_HOST.lang) || document.documentElement.lang || 'en';
      return (R && typeof R.normalise === 'function') ? R.normalise(raw) : (raw === 'ja' ? 'jp' : raw);
    } catch (_) { return 'en'; }
  }
  /* ⚠ A TERNARY, NOT AN IIFE — AND THE DIFFERENCE IS 17 UNTRANSLATED STRINGS. #R347 wrote this as
     `var L = (function(){ try{ …pick(lang)… }catch(_){} return …; })()` to be defensive, and
     scripts/i18n-helpers.mjs's `bindsHelper` only recognises a CallExpression whose callee IS
     `IntMapLang.pick` — an IIFE's callee is a FunctionExpression, so `L` went into `shadowed`, the
     conventional-name seed was suppressed, and **every English string in this file stayed out of the
     fr / ko / zh-Hant / zh-Hans corpus**. The percentage column still read 100 %, because it is a
     percentage OF WHAT THE AUDIT CAN SEE. Same shape as #R251 and #R313's addendum, met a third time.
     The ternary short-circuits exactly as the try/catch did (`window.IntMapLang &&` is the guard). */
  var L = (window.IntMapLang && window.IntMapLang.pick)
    ? window.IntMapLang.pick(lang)
    : function () { return arguments[0]; };

  function chronos() { try { return window.IntMapTime || null; } catch (_) { return null; } }

  /** is the app's clock pinned away from the wall clock? */
  function isHistorical() {
    var C = chronos();
    try { return !!(C && typeof C.isLive === 'function' && !C.isLive()); } catch (_) { return false; }
  }

  /** the instant the reader is looking at — Chronos when pinned, the wall clock when live */
  function planningNow() {
    var C = chronos();
    try {
      if (C && typeof C.when === 'function') {
        var d = C.when();
        if (d instanceof Date && isFinite(d.getTime())) return d.getTime();
      }
    } catch (_) { }
    return Date.now();
  }

  /* ⚠ THE ONE LINE THIS FILE EXISTS FOR. It is a separate function rather than a comment on
     `Date.now()` so that «navigation used the wrong clock» is a grep, not a review. */
  function navNow() { return Date.now(); }

  /** the default departure a panel should offer: a few minutes after the reader's own «now» */
  function defaultDepartureMs(leadMinutes) {
    var lead = isFinite(+leadMinutes) ? +leadMinutes : 5;
    return planningNow() + lead * 60000;
  }

  /* ══ WHAT A PROVIDER MAY BE ASKED ══════════════════════════════════════════════════════════════
     A live transit server has no timetable for 1950 and a traffic model has no forecast for it
     either. Rather than send the request and let the server answer «no route» — which reads as «you
     cannot get there» — the request is marked, and the panel says which clock it used.
     ⚠ THIS DOES NOT BLOCK THE REQUEST. Road routers ignore the time entirely, and the app's own
     historical rail network genuinely does answer for 1950 (#R184). Only the note changes. */
  function describes(mode) {
    var hist = isHistorical();
    if (!hist) return { historical: false, note: '' };
    var C = chronos();
    var year = '';
    try { year = C && typeof C.year === 'function' ? String(C.year()) : ''; } catch (_) { }
    return { historical: true, year: year, note: historicalNote(mode, year) };
  }

  /* ⚠ THE YEAR IS A PLACEHOLDER, NOT CONCATENATION. The inline tables that carry fr / ko / zh-Hant /
     zh-Hans are keyed BY THE ENGLISH STRING, so an English string with the year spliced into it is a
     different key every year and matches nothing — four languages would silently read English while
     the audit stayed green (#R313's «the gate sees the template, not the value», met at the source).
     `{year}` keeps one key; `fill` substitutes after the lookup. ⚠ `$&` in a replacement is a
     back-reference, so the value is inserted through a function rather than a string. */
  function fill(s, vals) {
    return String(s).replace(/\{(\w+)\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(vals, k) ? String(vals[k]) : m;
    });
  }

  function historicalNote(mode, year) {
    var vals = { year: year == null ? '' : String(year) };
    if (mode === 'transit') {
      return fill(L('Times come from the map’s clock ({year}), not from today — live timetables do not cover it.',
        '時刻は地図の時計（{year}年）に合わせています。現在の時刻表は対象外です。',
        'Die Zeiten folgen der Kartenuhr ({year}), nicht heute — Live-Fahrpläne decken das nicht ab.',
        'Время берётся с часов карты ({year}), а не сегодняшнее — живые расписания его не покрывают.',
        'Las horas siguen el reloj del mapa ({year}), no el de hoy — los horarios en vivo no lo cubren.'), vals);
    }
    return fill(L('Times are calculated from the map’s clock ({year}), not from today.',
      '時刻は地図の時計（{year}年）を基準に計算しています。現在時刻ではありません。',
      'Zeiten werden von der Kartenuhr ({year}) aus berechnet, nicht von heute.',
      'Время рассчитано от часов карты ({year}), а не от сегодняшнего дня.',
      'Las horas se calculan desde el reloj del mapa ({year}), no desde hoy.'), vals);
  }

  return {
    planningNow: planningNow, navNow: navNow, isHistorical: isHistorical,
    defaultDepartureMs: defaultDepartureMs, describes: describes, historicalNote: historicalNote,
  };
})();
