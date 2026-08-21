/* ============================================================================
 *  IntMap · SMART STACK — WHICH CARD DESERVES THE FRONT, AND WHY
 * ----------------------------------------------------------------------------
 *  window.IntMapWidgetSmart — the ordering function for a stack whose `mode` is 'smart'.
 *
 *  ══ ⚠ IT IS A PURE FUNCTION OF (STACK, CONTEXT). NOTHING HERE IS RANDOM ═══════════════════════
 *  §14 forbids "a shuffle with a nice name", and the only way to make that claim checkable is for
 *  the choice to be DETERMINISTIC given the same inputs — which is what lets tests/r292-checks
 *  assert, for a hand-built context, exactly which card comes first and why. `score()` returns the
 *  reason alongside the number, so 「なぜ表示されたか」 is answered from the same computation that
 *  made the decision rather than from a second guess about it.
 *
 *  ══ THE LADDER (§14, in the order the instruction gives) ═══════════════════════════════════════
 *      1000  the reader pinned this card
 *       900  a severe warning is in force
 *       800  a route / a monitor / a task is actually running
 *       700  a country or place is selected
 *       600  the reader's own location is known and the card uses it
 *       500  the card is about the current map view
 *       400  Chronos is away from now and the card follows it
 *       300  the hour of the day suits this card
 *       200  the reader used it recently
 *       100  everything else
 *
 *  ══ ⚠ AND IT REFUSES TO FLICKER ═══════════════════════════════════════════════════════════════
 *  A card that is 10 points better than the one on screen is not worth the reader losing their
 *  place. A challenger must beat the incumbent by `MARGIN`, and outside the top band it must also
 *  wait `SETTLE` after the last change — so an ordinary score wobble cannot move anything, while a
 *  severe warning arriving moves it immediately. That is 「重大情報以外は頻繁に勝手に切り替えない」
 *  and 「同じカードを短時間に何度も出し入れしない」, stated as two numbers rather than as a hope.
 * ==========================================================================*/
window.IntMapWidgetSmart = (function () {
  'use strict';

  var WC = window.IntMapWidgetCore;
  var S = {};
  var MARGIN = 150;                 /* how much better a challenger must be */
  var SETTLE = 90 * 1000;           /* how long the front card is left alone, below the urgent band */
  var URGENT = 850;                 /* at or above this, swap at once — this is what an emergency is */
  var lastSwap = {};                /* stackId → ms */

  /* ── what a definition is ABOUT, expressed as the facts it depends on ─────────────────────── */
  function traits(def) {
    var t = { location: false, map: false, selection: false, chronos: false, hazard: false, task: false, night: false, market: false };
    var id = def.id;
    if (/weather|env\.|sun\.|place-alerts/.test(id)) t.location = true;
    if (/^map\./.test(id) || /map-centre|viewport|scale|centre/.test(id)) t.map = true;
    if (/country|place-alerts/.test(id)) t.selection = true;
    if (/chronos|progress|time\.|moon\./.test(id)) t.chronos = true;
    if (/hazard|alert|quake|viewport-situation/.test(id)) t.hazard = true;
    if (/route|monitors|atlas-brief/.test(id)) t.task = true;
    if (/moon|sun\.rise|space\.kp/.test(id)) t.night = true;
    if (/^markets\./.test(id)) t.market = true;
    return t;
  }

  function recentIds() {
    try { return JSON.parse(localStorage.getItem('intmap_widget_recent') || '[]'); } catch (e) { return []; }
  }
  S.markUsed = function (defId) {
    try {
      var r = recentIds();
      r = [defId].concat(r.filter(function (x) { return x !== defId; })).slice(0, 10);
      localStorage.setItem('intmap_widget_recent', JSON.stringify(r));
    } catch (e) {}
  };

  /* ── the score, with its reason ───────────────────────────────────────────────────────────── */
  S.score = function (member, stack, ctx) {
    var def = WC.get(member.d);
    if (!def) return { score: 0, reason: '' };
    var t = traits(def);
    var L = WC.L;

    if (stack && stack.pin && stack.pin === member.i) {
      return { score: 1000, reason: L('you pinned it', '固定しているため', 'weil Sie sie angeheftet haben', 'вы её закрепили', 'la ha fijado') };
    }
    /* ⚠ SEVERITY IS READ FROM THE ALERT PIPELINE, NOT GUESSED FROM THE CARD'S NAME. */
    if (t.hazard) {
      var worst = 0;
      try { worst = (ctx.alerts && ctx.alerts.worst) || 0; } catch (e) {}
      if (worst >= 3) return { score: 900 + worst, reason: L('a severe warning is in force', '重大な警報が発令中のため', 'eine schwere Warnung ist aktiv', 'действует серьёзное предупреждение', 'hay un aviso grave vigente') };
      if (worst >= 1) return { score: 520 + worst, reason: L('warnings are in force', '警報が発令中のため', 'es gelten Warnungen', 'действуют предупреждения', 'hay avisos vigentes') };
    }
    if (t.task) {
      if (/route/.test(def.id) && ctx.route && ctx.route.active) return { score: 800, reason: L('a route is on the map', '経路を表示中のため', 'eine Route liegt auf der Karte', 'на карте есть маршрут', 'hay una ruta en el mapa') };
      if (/monitors/.test(def.id) && ctx.monitors && ctx.monitors.length) return { score: 780, reason: L('you are monitoring an area', '地域を監視中のため', 'Sie beobachten ein Gebiet', 'вы наблюдаете за районом', 'está vigilando una zona') };
    }
    if (t.selection && ctx.selection && ctx.selection.country) {
      return { score: 700, reason: L('a country is selected', '国を選択中のため', 'ein Land ist ausgewählt', 'выбрана страна', 'hay un país seleccionado') };
    }
    if (t.location && ctx.location && ctx.location.state === 'granted') {
      return { score: 600, reason: L('it is about where you are', '現在地に関する情報のため', 'es betrifft Ihren Standort', 'это о вашем местоположении', 'trata de dónde está') };
    }
    if (t.map && ctx.map) {
      return { score: 500, reason: L('it is about what the map is showing', '地図の表示範囲に関する情報のため', 'es betrifft den Kartenausschnitt', 'это о том, что показывает карта', 'trata de lo que muestra el mapa') };
    }
    if (t.chronos && ctx.chronos && !ctx.chronos.isLive) {
      return { score: 400, reason: L('the map is showing another time', '地図が別の時刻を表示中のため', 'die Karte zeigt eine andere Zeit', 'карта показывает другое время', 'el mapa muestra otra hora') };
    }
    var hour = new Date().getHours();
    if (t.night && (hour >= 20 || hour < 5)) {
      return { score: 300, reason: L('it suits the time of night', '夜の時間帯に合うため', 'es passt zur Nachtzeit', 'подходит для ночного времени', 'encaja con la hora nocturna') };
    }
    if (t.market && hour >= 8 && hour < 20) {
      return { score: 290, reason: L('markets are open around now', '市場が開いている時間帯のため', 'die Märkte sind jetzt geöffnet', 'сейчас торговое время', 'los mercados están abiertos ahora') };
    }
    var r = recentIds().indexOf(def.id);
    if (r >= 0) return { score: 200 + (10 - r), reason: L('you used it recently', '最近使ったため', 'Sie haben es kürzlich benutzt', 'вы недавно им пользовались', 'lo usó recientemente') };
    return { score: 100, reason: L('it is next in the stack', 'スタックの次の項目のため', 'es ist als Nächstes an der Reihe', 'следующая в стопке', 'es la siguiente de la pila') };
  };

  /* ── the ordering, with the anti-flicker rule applied ─────────────────────────────────────── */
  S.rank = function (stack, ctx) {
    return (stack.m || [])
      .filter(function (m) { return (stack.off || []).indexOf(m.i) < 0; })
      .map(function (m) { var s = S.score(m, stack, ctx); return { m: m, score: s.score, reason: s.reason }; })
      .sort(function (a, b) { return b.score - a.score || a.m.i.localeCompare(b.m.i); });
  };
  S.order = function (stack, ctx) {
    var ranked = S.rank(stack, ctx);
    if (!ranked.length) return stack.m;
    var front = ranked[0];
    var current = (stack.m || [])[stack.ix];
    if (current) {
      var cur = ranked.find(function (r) { return r.m.i === current.i; });
      if (cur && front.m.i !== cur.m.i) {
        var urgent = front.score >= URGENT;
        var enough = (front.score - cur.score) >= MARGIN;
        var settled = (Date.now() - (lastSwap[stack.i] || 0)) >= SETTLE;
        if (!urgent && !(enough && settled)) {
          /* leave the incumbent where it is — this is the anti-flicker rule, not a tie-break */
          ranked = [cur].concat(ranked.filter(function (r) { return r.m.i !== cur.m.i; }));
        } else {
          lastSwap[stack.i] = Date.now();
        }
      }
    }
    return ranked.map(function (r) { return r.m; });
  };
  S.explain = function (stack, ctx) {
    var ranked = S.rank(stack, ctx);
    var order = S.order(stack, ctx);
    var frontId = (order[stack.ix] || order[0] || {}).i;
    var row = ranked.find(function (r) { return r.m.i === frontId; }) || ranked[0];
    if (!row) return '';
    var def = WC.get(row.m.d);
    return (def ? (def.title ? def.title(row.m.c) : def.nm()) : '') + ' — ' + row.reason;
  };
  S._reset = function () { lastSwap = {}; };
  S._consts = { MARGIN: MARGIN, SETTLE: SETTLE, URGENT: URGENT };
  S.traits = traits;

  return S;
})();
