/* ============================================================================
 *  IntMap · THE VOICE — window.IntMapNavVoice   (#R347)
 * ----------------------------------------------------------------------------
 *  §13 「同じ案内を連続読み上げしない状態管理」「音声はアプリの言語で」
 *
 *  ══ WHAT IS HERE AND WHAT IS DELIBERATELY NOT ══════════════════════════════════════════════════
 *  This file turns a CUE into a SENTENCE and hands the sentence to the platform. It decides nothing
 *  about WHEN — js/navigation-guidance.js's `dueCue` owns the timing — and it owns no vocabulary of
 *  its own: the turn phrase comes from `IntMapRouting.maneuver()`, which has spoken nine languages
 *  since #R132, and the distance from `IntMapRouteCards.distance()`, which already knows the
 *  reader's unit setting. A second copy of either would be a second thing to keep in step, and a
 *  navigator that says one thing on screen and another out loud is worse than a silent one.
 *
 *  ══ THE QUEUE, AND WHY `cancel()` IS THE WRONG DEFAULT ═════════════════════════════════════════
 *  js/flight-sim.js's GPWS calls `speechSynthesis.cancel()` before every utterance, and for a
 *  cockpit warning that is right — «pull up» must not wait behind «five hundred». Navigation is the
 *  opposite case: two cues that arrive a second apart are «in 200 metres, turn right» and «then keep
 *  left», and cancelling the first loses the turn the driver is about to make. So cues QUEUE.
 *  ⚠ WITH ONE EXCEPTION, AND IT IS THE ONE §13 NAMES. When a cue of a HIGHER tier arrives —
 *  `soon` → `now` — the older one is describing a maneuver the car has already reached. Finishing
 *  «in 200 metres, turn right» while the junction goes past is not politeness, it is a wrong
 *  instruction, so a louder tier drops the quieter ones that are still waiting and interrupts a
 *  quieter one that is still speaking.
 *  Everything queued also carries a SHELF LIFE for the same reason: an utterance that could not
 *  start for twelve seconds is dropped rather than spoken late (`arrived` alone never expires).
 *
 *  ══ ⚠ THE PLATFORM STOPS SPEAKING AND DOES NOT SAY SO ══════════════════════════════════════════
 *  `speechSynthesis` is suspended by several browsers while the tab is in the background, and when
 *  it is, `onend` for the utterance in flight NEVER ARRIVES. A queue that waits for `onend` is then
 *  jammed for the rest of the journey — silently, because nothing threw. So every utterance is armed
 *  with a WATCHDOG (its estimated duration plus slack); when the watchdog fires the slot is released
 *  and the queue moves on, and the shelf life above stops the backlog being read out in one burst
 *  when the reader comes back. `visibilitychange` also nudges the queue and asks the platform to
 *  `resume()` if it left itself paused, which Chrome does.
 *
 *  ══ ⚠ «getVoices() IS EMPTY» IS NOT «THIS DEVICE CANNOT SPEAK» ═════════════════════════════════
 *  On Chrome the list is empty until `voiceschanged` fires, normally a few hundred ms after load; a
 *  device with no speech at all also reports an empty list and never fires anything. Answering
 *  «unavailable» in the first case would turn voice guidance off on the commonest browser there is.
 *  So `available()` believes the platform for a short probe window and stops believing it afterwards
 *  — and NOTHING here throws in either case, so a caller that never checks still runs correctly with
 *  visual guidance only.
 * ==========================================================================*/
window.IntMapNavVoice = (function () {
  'use strict';

  var GUIDE = function () { return window.IntMapNavGuide; };

  /* ⚠ THERE IS NO GLOBAL «CURRENT LANGUAGE» — `IM_HOST` is a module-local const in js/app-body.js
     (#R253 measured that, after eleven rounds of reading it). So this walks `<html lang>`, a BCP-47
     tag, back through the ONE registry: `normalise('ja')` on its own answers 'ja', and this app's
     code for Japanese is 'jp'. */
  function lang() {
    try {
      var raw = String(document.documentElement.lang || 'en').toLowerCase();
      var R = window.IntMapLang;
      if (!R) return raw;
      if (R.has && R.has(raw)) return R.normalise(raw);
      var rows = R.LANGS || [];
      for (var i = 0; i < rows.length; i++) if (String(rows[i] && rows[i].html || '').toLowerCase() === raw) return rows[i].code;
      return R.normalise ? R.normalise(raw) : raw;
    } catch (_) { return 'en'; }
  }
  /* ⚠ BOUND THROUGH `pick()`, NOT WRAPPED ROUND `t()`. The two resolve identically at runtime, but
     only a name PROVABLY bound to the registry is visible to scripts/i18n-helpers.mjs — a local
     arrow function that merely mentions `IntMapLang` is «loose», and the English strings inside it
     never reach the inline tables the other four languages are translated in, while the coverage
     report still prints 100 %. The guard is js/basemap-switch.js's, because this file is imported
     before the app has certainly defined the registry. */
  var L = (window.IntMapLang && window.IntMapLang.pick)
    ? window.IntMapLang.pick(lang)
    : function () { return arguments[0]; };

  var MODES = ['off', 'alerts', 'guidance'];
  var _mode = 'guidance';

  /* ══ FORMATTING ════════════════════════════════════════════════════════════════════════════════ */

  /* ⚠ THE UNIT SETTING IS NOT ON A GLOBAL EITHER. js/app-body.js keeps `unitMode` in its own closure,
     and js/weather.js's `window.imUnitMode || window.unitMode` reads two names that do not exist.
     What IS durable is the settings blob the app writes on every save, so that is the source here,
     and a caller that knows better passes `units` explicitly. */
  function units(o) {
    if (o && o.units) return String(o.units);
    try {
      var s = JSON.parse(localStorage.getItem('intmap_settings') || '{}');
      if (s && s.units) return String(s.units);
    } catch (_) { }
    return 'metric';
  }

  /* ⚠ «BOTH» IS NOT A SPOKEN SETTING. On screen «200 m (656 ft)» is a convenience; read aloud at
     70 km/h it is two numbers of which the driver must discard one. Speech takes the metric half. */
  function spokenUnits(o) { var u = units(o); return u === 'imperial' ? 'imperial' : 'metric'; }

  /* ⚠ THE ANNOUNCED DISTANCE IS ROUNDED BEFORE IT IS FORMATTED, NOT AFTER. `dueCue` triggers at
     `max(floor, speed × lead)`, which at 27 m/s is 675 m — a true number and not one anybody says.
     The snapping happens IN THE UNIT THAT WILL BE SPOKEN, because a ladder in metres read out in
     feet («656 feet») is the same defect one conversion later. */
  var M_LADDER = [20, 30, 50, 70, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000, 1200, 1500, 2000, 2500, 3000];
  var FT_LADDER = [50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900];
  function nearest(v, ladder) {
    if (v > ladder[ladder.length - 1]) return v;
    var best = ladder[0], bd = Math.abs(v - best);
    for (var i = 1; i < ladder.length; i++) {
      var d = Math.abs(v - ladder[i]);
      if (d < bd) { bd = d; best = ladder[i]; }
    }
    return best;
  }
  function snap(metres, u) {
    var m = Math.max(0, +metres || 0);
    if (u === 'imperial') {
      var ft = m * 3.28084;
      /* below a quarter mile IntMapRouteCards prints feet; above it, miles to one decimal */
      if (ft < 1000) return nearest(ft, FT_LADDER) / 3.28084;
      var mi = m / 1609.344;
      return (mi < 10 ? Math.round(mi * 10) / 10 : Math.round(mi)) * 1609.344;
    }
    if (m > 3000) return Math.round(m / 500) * 500;
    return nearest(m, M_LADDER);
  }
  function fmtDistance(metres, o) {
    var u = spokenUnits(o), v = snap(metres, u);
    try { return window.IntMapRouteCards.distance(v, { lang: lang(), units: u }); }
    catch (_) { return v < 1000 ? (Math.round(v) + ' m') : ((v / 1000).toFixed(1) + ' km'); }
  }

  /** substitute {tokens} through a FUNCTION replacer, so a value containing `$&` cannot rewrite itself */
  function fill(tpl, vals) {
    return String(tpl).replace(/\{(\w+)\}/g, function (whole, k) {
      return Object.prototype.hasOwnProperty.call(vals, k) ? String(vals[k]) : whole;
    });
  }

  /* ══ THE SENTENCE ══════════════════════════════════════════════════════════════════════════════ */

  /* ⚠ ONE VOCABULARY FOR TURNS, AND IT IS NOT IN THIS FILE. `IntMapRouting.maneuver()` interprets the
     whole OSRM maneuver vocabulary — roundabout exits, ramps, forks, signposted destinations — in
     nine languages, and it is what the panel and Atlas already print. If it is unreachable the fall
     back is the ROAD NAME (js/navigation-guidance.js's `roadOf`), never a second set of turn phrases:
     a shorter sentence is a degradation, a divergent one is a defect. */
  function actionText(step) {
    if (!step) return '';
    try {
      var R = window.IntMapRouting;
      if (R && typeof R.maneuver === 'function') {
        var m = R.maneuver(step.raw || step);
        if (m && m.text) return String(m.text).trim();
      }
    } catch (_) { }
    try { return String(GUIDE().roadOf(step) || '').trim(); } catch (_) { return ''; }
  }

  /* ⚠ EVERY VALUE SUBSTITUTED HERE IS ITSELF TRANSLATED — the distance through
     IntMapRouteCards.distance (locale-aware) and the action through IntMapRouting.maneuver (nine
     languages). #R313's defect was a template that passed the gate while interpolating an
     untranslated English value; there is nothing in this sentence the reader's language cannot reach. */
  function cueText(cue, step, o) {
    if (!cue) return '';
    var act = actionText(step || cue.step);
    if (!act) return '';
    /* §13's tiers: the last call is the instruction ALONE — a driver at the junction does not need to
       be told they are twenty metres from it. */
    if (cue.tier === 'now') return act;
    var d = fmtDistance(cue.at != null ? cue.at : cue.distance, o);
    return fill(L('In {d}, {a}', '{d}先、{a}', 'In {d}: {a}', 'Через {d}: {a}', 'En {d}, {a}'), { d: d, a: act });
  }

  /* ⚠ THE PLACE NAME IS THE READER'S OWN. #R313's rule — «city names cannot be translated, so drop
     them from the sentence» — is about names this app looks up in an English table. `data.name` is
     the label of the destination the reader themselves searched for and chose, in whatever language
     they found it, and echoing it back is the only honest thing to say. */
  function announceText(kind, data) {
    data = data || {};
    var n = String(data.name == null ? '' : data.name).trim();
    switch (String(kind)) {
      case 'rerouting':
        return L('Rerouting', '経路を再検索しています', 'Route wird neu berechnet', 'Пересчёт маршрута', 'Recalculando la ruta');
      case 'rerouted':
        return L('New route found', '新しい経路が見つかりました', 'Neue Route gefunden', 'Найден новый маршрут', 'Nueva ruta encontrada');
      case 'offroute':
        return L('Off route', '経路を外れました', 'Route verlassen', 'Вы отклонились от маршрута', 'Fuera de ruta');
      case 'arriving':
        return n ? fill(L('Arriving at {n}', 'まもなく{n}に到着します', 'Ankunft an {n}', 'Прибытие в {n}', 'Llegando a {n}'), { n: n })
          : L('Arriving at your destination', 'まもなく目的地に到着します', 'Ankunft am Ziel', 'Прибытие в пункт назначения', 'Llegando a tu destino');
      case 'arrived':
        return n ? fill(L('You have arrived at {n}', '{n}に到着しました', 'Sie haben {n} erreicht', 'Вы прибыли в {n}', 'Has llegado a {n}'), { n: n })
          : L('You have arrived', '目的地に到着しました', 'Sie haben Ihr Ziel erreicht', 'Вы прибыли на место', 'Has llegado a tu destino');
      /* ⚠ ONE SENTENCE SERVES BOTH POSITIONS. js/navigation.js announces `waypoint` when the car is
         APPROACHING a via point and again when it has REACHED it, so the wording has to be true of
         both; «arriving at» would be a lie the second time. */
      case 'waypoint':
        return n ? fill(L('Via point: {n}', '経由地: {n}', 'Zwischenziel: {n}', 'Промежуточная точка: {n}', 'Punto intermedio: {n}'), { n: n })
          : L('Via point', '経由地', 'Zwischenziel', 'Промежуточная точка', 'Punto intermedio');
      default: return '';
    }
  }

  /* ══ THE PLATFORM ══════════════════════════════════════════════════════════════════════════════ */

  function synth() { try { return window.speechSynthesis || null; } catch (_) { return null; } }
  function hasAPI() { try { return !!(synth() && typeof window.SpeechSynthesisUtterance === 'function'); } catch (_) { return false; } }

  var sawVoices = false, probedAt = 0;
  var PROBE_MS = 4000;          /* how long an empty voice list is believed to be «not loaded yet» */

  function voiceList() {
    var s = synth();
    if (!s || typeof s.getVoices !== 'function') return [];
    var v; try { v = s.getVoices(); } catch (_) { return []; }
    if (v && v.length) sawVoices = true;
    return v || [];
  }

  function available() {
    if (!hasAPI()) return false;
    if (sawVoices) return true;
    if (voiceList().length) return true;
    if (!probedAt) probedAt = Date.now();     /* the probe window opens the first time anybody asks */
    return (Date.now() - probedAt) < PROBE_MS;
  }

  /** the BCP-47 tag for the app's language — the ONE registry answers it (#R231/#R318) */
  function tagFor() { try { return window.IntMapLang.locale(lang()); } catch (_) { return 'en-US'; } }

  /* ⚠ `u.lang` ALONE IS NOT ENOUGH ON EVERY PLATFORM. Some engines honour it; some read whatever
     voice is default and pronounce Japanese with an English one. Naming the voice as well costs a
     linear scan of a list a few dozen long and is the difference between guidance and noise. An
     exact tag match wins; failing that any voice sharing the primary subtag; failing that the
     platform default, which is what `u.lang` asked for anyway. */
  function pickVoice(tag) {
    var vs = voiceList();
    if (!vs.length) return null;
    var want = String(tag || 'en').toLowerCase().replace('_', '-');
    var base = want.split('-')[0], loose = null;
    for (var i = 0; i < vs.length; i++) {
      var vl = String(vs[i].lang || '').toLowerCase().replace('_', '-');
      if (vl === want) return vs[i];
      if (!loose && vl.split('-')[0] === base) loose = vs[i];
    }
    return loose;
  }

  /* ══ THE QUEUE ═════════════════════════════════════════════════════════════════════════════════ */

  var TIER_RANK = { far: 0, soon: 1, near: 2, now: 3 };
  var ALERT_RANK = 3;                        /* reroutes and arrivals rank with the last turn call */
  /* the closer the maneuver, the SHORTER the shelf life — a «now» call is about this second, a
     «far» one is about a junction still a minute away and survives a stall in the platform. */
  var CUE_TTL = { far: 25000, soon: 20000, near: 12000, now: 8000 };

  var queue = [];
  var speaking = null;                       /* the item the platform is holding, or null */
  var watchdog = null;
  var lastText = '';                         /* the SECOND safety of §13 — see `speak()` */

  /* ⚠ THE ESTIMATE IS ONLY EVER USED TO GIVE UP, NEVER TO PACE. ~13 characters a second is a slow
     reading of English at rate 1 and a fast one of Japanese, plus 1.5 s of slack; the watchdog fires
     LATE for a short utterance and that costs nothing, because `onend` normally arrives first. */
  function estimateMs(text) {
    var n = String(text || '').length;
    return Math.min(30000, Math.max(1500, (n / 13) * 1000 + 1500));
  }

  function disarm() { if (watchdog != null) { try { clearTimeout(watchdog); } catch (_) { } watchdog = null; } }
  function arm(item) {
    disarm();
    var ms = estimateMs(item.text);
    item.deadline = Date.now() + ms;
    try { watchdog = setTimeout(function () { watchdog = null; finish(item); }, ms); } catch (_) { }
  }
  function finish(item) {
    if (speaking !== item) return;
    speaking = null; disarm();
    pump();
  }

  function pump() {
    var s = synth();
    if (!s) { queue.length = 0; speaking = null; disarm(); return; }
    /* the tab was in the background and `onend` never came — release the slot before deciding.
       ⚠ THIS RUNS BEFORE THE `speaking` TEST, so `pump()` never has to call `finish()` and therefore
       cannot recurse into itself. */
    if (speaking && speaking.deadline && Date.now() > speaking.deadline) { speaking = null; disarm(); }
    if (speaking) return;

    var now = Date.now(), item = null;
    while (queue.length) {
      var q = queue.shift();
      if (isFinite(q.ttl) && (now - q.at) > q.ttl) continue;   /* stale — say nothing rather than say it late */
      item = q; break;
    }
    if (!item) return;

    var u;
    try { u = new window.SpeechSynthesisUtterance(item.text); } catch (_) { return; }
    u.lang = item.tag;
    var v = pickVoice(item.tag); if (v) u.voice = v;
    u.rate = 1; u.pitch = 1; u.volume = 1;
    u.onend = function () { finish(item); };
    u.onerror = function () { finish(item); };
    speaking = item;
    arm(item);
    /* Chrome leaves the engine paused after a background/foreground cycle and then accepts utterances
       that never start; asking it to resume when it is not paused is a no-op. */
    try { if (s.paused && typeof s.resume === 'function') s.resume(); } catch (_) { }
    try { s.speak(u); } catch (_) { finish(item); }
  }

  function cancelCurrent() {
    var s = synth();
    speaking = null; disarm();
    try { if (s && typeof s.cancel === 'function') s.cancel(); } catch (_) { }
  }

  /* ══ THE PUBLIC WAYS IN ════════════════════════════════════════════════════════════════════════ */

  function speak(text, o) {
    o = o || {};
    text = String(text == null ? '' : text).trim();
    if (!text) return false;
    if (_mode === 'off' && !o.force) return false;
    if (!hasAPI()) return false;
    if (!probedAt) probedAt = Date.now();

    /* ⚠ THE SECOND SAFETY OF §13. The store's spoken set (`markSpoken`/`hasSpoken`) is the first and
       the authoritative one — keyed by step and tier, and it survives across cues. This one only
       catches the same SENTENCE arriving twice in a row, which is exactly what happens when
       `waypoint` is announced on approach and again on reaching the stop. */
    if (text === lastText && !o.force) return false;
    lastText = text;

    var rank = (o.rank != null && isFinite(+o.rank)) ? +o.rank
      : (TIER_RANK[o.tier] != null ? TIER_RANK[o.tier] : ALERT_RANK);
    var item = {
      text: text, rank: rank, at: Date.now(),
      ttl: (o.ttlMs === Infinity || (isFinite(+o.ttlMs) && +o.ttlMs > 0)) ? o.ttlMs : 15000,
      tag: o.locale || tagFor(),
    };

    /* a louder tier drops the quieter ones still waiting and interrupts a quieter one in flight —
       see the header for why this is the ONE case where `cancel()` is the right call. */
    if (rank > 0) {
      queue = queue.filter(function (q) { return q.rank >= rank; });
      if (speaking && speaking.rank < rank) cancelCurrent();
    }
    queue.push(item);
    pump();
    return true;
  }

  function speakCue(cue, step, o) {
    if (!cue || _mode === 'off') return false;
    /* js/navigation.js applies this same rule before it calls; repeated here because a second caller
       must not be able to talk past the reader's setting. */
    if (_mode === 'alerts' && cue.tier !== 'now') return false;
    var text = cueText(cue, step, o);
    if (!text) return false;
    return speak(text, { tier: cue.tier, ttlMs: CUE_TTL[cue.tier] != null ? CUE_TTL[cue.tier] : 15000 });
  }

  /* ⚠ NO MODE FILTER BEYOND `off`. §13's `alerts` keeps «the last turn call, reroutes and arrivals»,
     and every kind this function handles IS a reroute or an arrival — so filtering here would be
     filtering the very set it was told to keep. */
  function announce(kind, data, o) {
    if (_mode === 'off') return false;
    var text = announceText(kind, data);
    if (!text) return false;
    var keep = (kind === 'arrived' || kind === 'waypoint');
    return speak(text, { rank: ALERT_RANK, ttlMs: keep ? Infinity : 20000, locale: o && o.locale });
  }

  function setMode(m) {
    if (MODES.indexOf(m) < 0) return false;
    if (_mode === m) return false;
    _mode = m;
    if (m === 'off') stop();
    return true;
  }
  function mode() { return _mode; }

  function stop() {
    queue.length = 0;
    lastText = '';
    cancelCurrent();
    return true;
  }

  /* coming back to the foreground: unjam whatever the platform left half-done, and let the shelf life
     above throw away the cues that are no longer about anything. */
  try {
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        try {
          var s = synth();
          if (!s) return;
          if (!document.hidden && s.paused && typeof s.resume === 'function') s.resume();
          pump();
        } catch (_) { }
      });
    }
    var _s0 = synth();
    if (_s0 && typeof _s0.addEventListener === 'function') _s0.addEventListener('voiceschanged', function () { voiceList(); });
  } catch (_) { }

  return {
    MODES: MODES.slice(),
    setMode: setMode, mode: mode, available: available, stop: stop,
    speak: speak, speakCue: speakCue, announce: announce,
    cueText: cueText, announceText: announceText,
    voices: voiceList, locale: tagFor,
    pending: function () { return queue.length + (speaking ? 1 : 0); },
    _pure: { snap: snap, nearest: nearest, fill: fill, estimateMs: estimateMs, TIER_RANK: TIER_RANK, CUE_TTL: CUE_TTL },
  };
})();
