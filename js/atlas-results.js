/* ============================================================================
 *  IntMap · ATLAS — the ONE shape every operation returns  (#R315)   window.IntMapActionResult
 * ----------------------------------------------------------------------------
 *  「呼び出したことではなく、実際の状態変化・描画・計算結果を観測して成功を判断する。」
 *
 *  Up to #R311 an Atlas action answered `{ok, html}`. Two things follow from that shape and both
 *  of them are defects the diary keeps re-reporting:
 *
 *    · `ok` is a HAND-WRITTEN boolean. `catch(_){}` followed by `return R(true, …)` is syntactically
 *      indistinguishable from a verified success, and #R268/#R296/#R309 are all the same story —
 *      a function that ran, returned, and changed nothing.
 *    · `html` is the RESULT. A structured outcome cannot be derived from a rendered string, so the
 *      repair loop, the goal validator and the nine-language renderer each re-parsed prose.
 *
 *  This file replaces both. `status` is the single fact; `ok` is a READ-ONLY DERIVATION of it
 *  (`status === 'completed'`), so a caller cannot write a success it did not observe — an assignment
 *  throws, in module strict mode, at the line that tried. And the user-visible sentence is built by
 *  `render()` FROM the structure, in whichever of the nine languages is current, never carried in it.
 *
 *  ⚠ THE SEVEN STATUSES ARE NOT A STYLE CHOICE. Each one exists because a real turn ended there and
 *  the old shape had to call it either true or false:
 *      completed  — postcondition observed.               partial    — some targets, not all.
 *      running    — started, still going (progress).       failed     — did not happen; code says why.
 *      needs_input— a required input is missing.           cancelled  — the caller aborted it.
 *      superseded — a newer turn replaced this one.
 *
 *  ⚠ MESSAGES ARE POSITIONAL FOR FIVE LANGUAGES AND KEYED FOR THE REST. That is `pick()`'s contract
 *  (js/lang-registry.js): index 0-4 come from the tuple, 5+ from the locale file's inline table keyed
 *  by the ENGLISH string. So a message here is a 5-tuple and its English member is the locale key —
 *  the same rule as every other L(…) call site in the app. `npm run check:i18n` reads it that way.
 * ==========================================================================*/
export function makeAtlasResults(HOST) {
  return (function () {
    var API = {};

    /* ── the seven statuses, and which of them are terminal ─────────────────────────────────── */
    var STATUSES = ['completed', 'running', 'needs_input', 'partial', 'failed', 'cancelled', 'superseded'];
    var TERMINAL = { completed: 1, partial: 1, failed: 1, cancelled: 1, superseded: 1 };
    /* A status that still owes the user something. The planner may not close a turn on one of these
       without either resuming it (needs_input) or reporting it as unfinished (running). */
    var OPEN = { running: 1, needs_input: 1 };

    API.STATUSES = STATUSES.slice();
    API.isTerminal = function (s) { return !!TERMINAL[String(s || '')]; };
    API.isOpen = function (s) { return !!OPEN[String(s || '')]; };

    /* ⚠ THE TUPLES ARE BUILT WITH pickArgs(), NOT WRITTEN AS ARRAY LITERALS. An array of five
       translations is invisible to every i18n instrument in this repo — nothing indexes it by
       language, so the four languages past the fifth slot silently read English and no percentage
       anywhere can see it. scripts/i18n-pair-audit.mjs calls that the OPEN GAP and ratchets on it.
       `pickArgs()` is the same tuple held as a CALL, and `L.arr()` resolves it through `pick()`
       itself — positionally for five, from the locale's inline table for the rest. Identical at
       run time; visible to the gate. */
    /* ⚠ THIS EXACT SHAPE, AND NOT AN IIFE. scripts/i18n-helpers.mjs reads the BINDING to decide
       whether a call is a translation call, and the guarded `(root.IntMapLang && …pickArgs()) || fn`
       form is the one it resolves — #R251 fixed it for js/space-cosmos.js and js/engine-select.js,
       which guard for the same reason this file does. Wrapped in an IIFE it resolves to nothing and
       all 29 tuples below are reported as an OPEN GAP again. The fallback is for the audit script,
       which imports this module with no window. */
    var _root = (typeof window !== 'undefined') ? window : {};
    var LA = (_root.IntMapLang && _root.IntMapLang.pickArgs()) || function () { return Array.prototype.slice.call(arguments); };

    /* ── message catalogue ──────────────────────────────────────────────────────────────────────
       key → [en, ja, de, ru, es]. English doubles as the locale key for zh-Hant / zh-Hans / fr / ko.
       {n} / {name} / {what} are substituted from messageParams. */
    var MESSAGES = {
      'atlas.result.completed':      LA('Done.', '完了しました。', 'Erledigt.', 'Готово.', 'Hecho.'),
      'atlas.result.completed.named': LA('{what} — done.', '{what} — 完了しました。', '{what} — erledigt.', '{what} — готово.', '{what} — hecho.'),
      'atlas.result.running':        LA('Still running…', '実行中です…', 'Läuft noch…', 'Выполняется…', 'En curso…'),
      'atlas.result.running.progress': LA('Still running — {done} of {total}.', '実行中 — {total} 件中 {done} 件。', 'Läuft — {done} von {total}.', 'Выполняется — {done} из {total}.', 'En curso — {done} de {total}.'),
      'atlas.result.partial':        LA('Partly done — {done} of {total}.', '一部のみ完了 — {total} 件中 {done} 件。', 'Teilweise erledigt — {done} von {total}.', 'Выполнено частично — {done} из {total}.', 'Parcialmente hecho — {done} de {total}.'),
      'atlas.result.failed':         LA('That did not happen.', 'これは実行されませんでした。', 'Das ist nicht passiert.', 'Это не выполнено.', 'Eso no ocurrió.'),
      'atlas.result.cancelled':      LA('Cancelled.', '中止しました。', 'Abgebrochen.', 'Отменено.', 'Cancelado.'),
      'atlas.result.superseded':     LA('Replaced by your newer request.', '新しい依頼に置き換えられました。', 'Durch die neuere Anfrage ersetzt.', 'Заменено более новым запросом.', 'Reemplazado por tu nueva petición.'),
      'atlas.result.needs_input':    LA('I need one more thing before I can do that.', 'これを実行するには、もう1つ必要です。', 'Dafür fehlt noch eine Angabe.', 'Для этого нужно ещё кое-что.', 'Falta un dato para poder hacerlo.'),

      /* codes — why a status is what it is. These are the honest sentences the old `warn('⚠')` hid. */
      'atlas.code.not_rendered':     LA('It was calculated but nothing was drawn on the map.', '計算はできましたが、地図には何も描かれませんでした。', 'Berechnet, aber nichts auf der Karte gezeichnet.', 'Рассчитано, но на карте ничего не нарисовано.', 'Se calculó, pero no se dibujó nada en el mapa.'),
      'atlas.code.not_visible':      LA('It is on the map but currently hidden.', '地図上にはありますが、いまは表示されていません。', 'Auf der Karte, aber gerade ausgeblendet.', 'На карте, но сейчас скрыто.', 'Está en el mapa, pero oculto ahora.'),
      'atlas.code.no_change':        LA('Nothing on the map changed.', '地図は何も変わりませんでした。', 'Auf der Karte hat sich nichts geändert.', 'На карте ничего не изменилось.', 'Nada cambió en el mapa.'),
      'atlas.code.unavailable':      LA('That is not available right now.', 'いまは利用できません。', 'Das ist gerade nicht verfügbar.', 'Сейчас это недоступно.', 'Eso no está disponible ahora.'),
      'atlas.code.unknown_capability': LA('I do not have that operation.', 'その操作は持っていません。', 'Diesen Vorgang habe ich nicht.', 'У меня нет такой операции.', 'No tengo esa operación.'),
      'atlas.code.bad_args':         LA('The values given for that operation were not usable.', 'その操作に渡された値が使えませんでした。', 'Die übergebenen Werte waren unbrauchbar.', 'Переданные значения непригодны.', 'Los valores dados no eran utilizables.'),
      'atlas.code.ambiguous_target': LA('Several things match — which one?', '複数該当します。どれですか。', 'Mehrere Treffer — welcher?', 'Несколько совпадений — какое?', 'Hay varias coincidencias, ¿cuál?'),
      'atlas.code.timeout':          LA('It did not finish in time.', '時間内に終わりませんでした。', 'Es wurde nicht rechtzeitig fertig.', 'Не завершилось вовремя.', 'No terminó a tiempo.'),
      'atlas.code.threw':            LA('It stopped with an error.', 'エラーで停止しました。', 'Es ist mit einem Fehler gestoppt.', 'Остановлено из-за ошибки.', 'Se detuvo con un error.'),
      'atlas.code.needs_confirm':    LA('That one needs your confirmation first.', 'これは先に確認が必要です。', 'Dafür ist zuerst deine Bestätigung nötig.', 'Сначала нужно твоё подтверждение.', 'Eso necesita tu confirmación primero.'),

      /* input requests — what is missing, said plainly */
      'atlas.input.point':           LA('Tap the point on the map you mean.', '地図上で対象の地点をタップしてください。', 'Tippe den gemeinten Punkt auf der Karte an.', 'Коснитесь нужной точки на карте.', 'Toca en el mapa el punto que quieres.'),
      'atlas.input.polyline':        LA('Draw the line on the map.', '地図上に線を描いてください。', 'Zeichne die Linie auf der Karte.', 'Нарисуйте линию на карте.', 'Dibuja la línea en el mapa.'),
      'atlas.input.polygon':         LA('Draw the area on the map.', '地図上に範囲を描いてください。', 'Zeichne den Bereich auf der Karte.', 'Нарисуйте область на карте.', 'Dibuja el área en el mapa.'),
      'atlas.input.choice':          LA('Choose one:', '1つ選んでください:', 'Wähle eines:', 'Выберите одно:', 'Elige uno:'),
      'atlas.input.text':            LA('Tell me the value to use.', '使用する値を教えてください。', 'Nenne mir den zu verwendenden Wert.', 'Укажите значение.', 'Dime el valor a usar.'),
      'atlas.input.number':          LA('Tell me the number to use.', '使用する数値を教えてください。', 'Nenne mir die Zahl.', 'Укажите число.', 'Dime el número a usar.'),

      /* goal validation — the sentence a turn ends on when the goal was not met */
      'atlas.goal.map_missing':      LA('You asked for this on the map, and it is not on the map yet.', '地図上でのご要望ですが、まだ地図に出ていません。', 'Auf der Karte gewünscht — dort ist es noch nicht.', 'Вы просили на карте — там этого ещё нет.', 'Lo pediste en el mapa y aún no está en el mapa.'),
      'atlas.goal.explanation_missing': LA('You asked for an explanation, and I only operated the map.', 'ご要望は説明でしたが、地図を操作しただけでした。', 'Du wolltest eine Erklärung — ich habe nur die Karte bedient.', 'Вы просили объяснение — я лишь управлял картой.', 'Pediste una explicación y solo manejé el mapa.'),
      'atlas.goal.action_missing':   LA('You asked me to do something, and I only wrote about it.', 'ご要望は操作でしたが、文章で答えただけでした。', 'Du wolltest eine Aktion — ich habe nur darüber geschrieben.', 'Вы просили действие — я только написал о нём.', 'Pediste una acción y solo escribí sobre ella.'),
      'atlas.goal.targets_missing':  LA('Not every target was reached: {names}', 'すべての対象には届きませんでした: {names}', 'Nicht jedes Ziel wurde erreicht: {names}', 'Достигнуты не все цели: {names}', 'No se alcanzaron todos los objetivos: {names}')
    };

    API.MESSAGES = MESSAGES;
    API.messageKeys = function () { return Object.keys(MESSAGES).sort(); };
    /* The English member of every tuple — what `check:i18n` has to find in each locale file. */
    API.messageEnglish = function () { return Object.keys(MESSAGES).sort().map(function (k) { return MESSAGES[k][0]; }); };

    function fill(s, params) {
      if (!params) return s;
      return String(s).replace(/\{([a-z0-9_]+)\}/gi, function (m, k) {
        var v = params[k];
        return (v === undefined || v === null) ? m : String(v);
      });
    }

    /* text(key, params, L) — L is the caller's `pick()` function (5 positional + inline fallback). */
    API.text = function (key, params, L) {
      var row = MESSAGES[key];
      if (!row) return '';
      var s;
      try { s = (L && L.arr) ? L.arr(row) : (L ? L.apply(null, row) : row[0]); } catch (_) { s = row[0]; }
      return fill(s, params);
    };

    /* ── the constructor ────────────────────────────────────────────────────────────────────────
       Everything is optional except `status`. `ok` is installed as an enumerable GETTER: it
       serialises like a field, reads like the old one, and CANNOT be assigned — the whole point. */
    var _seq = 0;
    API.newOperationId = function (prefix) {
      _seq++;
      var t = 0; try { t = Date.now(); } catch (_) { t = 0; }
      return String(prefix || 'op') + '-' + t.toString(36) + '-' + _seq;
    };

    API.make = function (o) {
      o = o || {};
      var status = String(o.status || 'failed');
      if (STATUSES.indexOf(status) < 0) status = 'failed';
      var r = {
        operationId: o.operationId || API.newOperationId(),
        capabilityId: o.capabilityId || '',
        status: status,
        code: o.code || (status === 'completed' ? 'ok' : ''),
        messageKey: o.messageKey || '',
        messageParams: o.messageParams || {},
        observed: o.observed || {},
        produced: Array.isArray(o.produced) ? o.produced.slice() : [],
        objectIds: Array.isArray(o.objectIds) ? o.objectIds.slice() : [],
        unresolved: Array.isArray(o.unresolved) ? o.unresolved.slice() : [],
        candidates: Array.isArray(o.candidates) ? o.candidates.slice() : [],
        inputRequest: o.inputRequest || null,
        progress: o.progress || null,
        undoToken: o.undoToken || null,
        evidenceRefs: Array.isArray(o.evidenceRefs) ? o.evidenceRefs.slice() : [],
        meta: Object.assign({ semanticTarget: '', temporalMode: '', validTime: null, retrievedAt: null }, o.meta || null)
      };
      /* html is CARRIED, never authoritative — legacy dispatch cases still produce a rendered
         fragment and the reply pane still shows it. It is not what `ok` is derived from. */
      if (o.html) r.html = String(o.html);
      Object.defineProperty(r, 'ok', {
        enumerable: true, configurable: false,
        get: function () { return this.status === 'completed'; }
      });
      return r;
    };

    /* Shorthands for the seven endings, so a call site never spells a status by hand. */
    API.completed = function (o) { return API.make(Object.assign({}, o, { status: 'completed', code: (o && o.code) || 'ok' })); };
    API.failed = function (o) { return API.make(Object.assign({}, o, { status: 'failed' })); };
    API.partial = function (o) { return API.make(Object.assign({}, o, { status: 'partial' })); };
    API.running = function (o) { return API.make(Object.assign({}, o, { status: 'running' })); };
    API.cancelled = function (o) { return API.make(Object.assign({}, o, { status: 'cancelled' })); };
    API.superseded = function (o) { return API.make(Object.assign({}, o, { status: 'superseded' })); };
    API.needsInput = function (o) {
      o = o || {};
      var req = o.inputRequest || {};
      return API.make(Object.assign({}, o, {
        status: 'needs_input',
        code: o.code || 'needs_input',
        /* ⚠ THE REQUEST IS EXTENDED, NOT REBUILT. An earlier version listed the five fields it knew
           about and silently dropped the rest — including `pendingArgs`, which is everything the
           user already said. Resuming from nothing is not resuming; it is asking again. */
        inputRequest: Object.assign({}, req, {
          kind: String(req.kind || 'point'),
          promptKey: req.promptKey || ('atlas.input.' + String(req.kind || 'point')),
          promptParams: req.promptParams || {},
          constraints: req.constraints || {},
          resumeToken: req.resumeToken || API.newOperationId('resume')
        })
      }));
    };

    /* ── the compatibility bridge, both ways ────────────────────────────────────────────────────
       fromLegacy: a `{ok, html, meta, exec, objectIds}` from a not-yet-migrated dispatch case.
       ⚠ A legacy `ok:true` is a CLAIM, not an observation — so it maps to `completed` only when the
       case supplied no contrary evidence. `meta.unverified` (the #R142 flag the layer toggle already
       sets when the map never changed) is exactly such evidence, and it lands on `partial`, which is
       what "I did the thing and could not see it happen" has always meant. */
    API.fromLegacy = function (r, capabilityId, operationId) {
      r = r || {};
      var exec = r.exec || null;
      var meta = r.meta || {};
      var status;
      if (r.ok === false) status = 'failed';
      else if (meta.unverified) status = 'partial';
      else if (exec && exec.status && STATUSES.indexOf(exec.status) >= 0) status = exec.status;
      else status = 'completed';
      /* highlight's #R157 exec block already speaks this language — carry it across rather than
         re-deriving it: `resolved`/`unresolved` become targets, `availableIdentifiers` candidates. */
      var unresolved = [];
      if (exec && Array.isArray(exec.unresolved)) unresolved = exec.unresolved.slice();
      var candidates = [];
      if (exec && Array.isArray(exec.availableIdentifiers)) candidates = exec.availableIdentifiers.slice();
      if (status === 'completed' && unresolved.length) status = 'partial';
      return API.make({
        operationId: operationId,
        capabilityId: capabilityId || '',
        status: status,
        code: meta.code || (status === 'completed' ? 'ok' : (r.ok === false ? 'failed' : '')),
        html: r.html || '',
        observed: exec ? { exec: exec } : {},
        produced: Array.isArray(meta.produced) ? meta.produced.slice() : [],
        objectIds: Array.isArray(r.objectIds) ? r.objectIds.slice() : [],
        unresolved: unresolved,
        candidates: candidates,
        meta: {
          semanticTarget: meta.semanticTarget || '',
          temporalMode: meta.temporalMode || '',
          validTime: meta.validTime || null,
          retrievedAt: meta.retrievedAt || null
        }
      });
    };

    /* toLegacy: what runActions / _atlCompose still consume while the migration runs. */
    API.toLegacy = function (r) {
      if (!r) return { ok: false, html: '' };
      var out = { ok: r.status === 'completed', html: r.html || '' };
      out.meta = Object.assign({}, r.meta, {
        code: r.code || '',
        status: r.status,
        operationId: r.operationId,
        capabilityId: r.capabilityId,
        produced: r.produced.slice()
      });
      /* #R142's flag, re-derived: anything that did not reach `completed` must suppress the
         planner's optimistic sentence, which is exactly what `unverified` does today. */
      if (r.status !== 'completed') out.meta.unverified = true;
      if (r.objectIds.length) out.objectIds = r.objectIds.slice();
      if (r.observed && r.observed.exec) out.exec = r.observed.exec;
      return out;
    };

    /* ── rendering: the structure → one sentence, in the language in play ─────────────────────── */
    function pickMessageKey(r) {
      if (r.messageKey) return r.messageKey;
      if (r.status === 'partial' && r.progress) return 'atlas.result.partial';
      if (r.status === 'running' && r.progress) return 'atlas.result.running.progress';
      if (r.status === 'needs_input') return 'atlas.result.needs_input';
      return 'atlas.result.' + r.status;
    }
    function paramsOf(r) {
      var p = Object.assign({}, r.messageParams);
      if (r.progress) {
        if (p.done === undefined && r.progress.done != null) p.done = r.progress.done;
        if (p.total === undefined && r.progress.total != null) p.total = r.progress.total;
      }
      return p;
    }

    /* render(result, ui) — ui = {L, esc, note, warn}. Returns an HTML fragment.
       ⚠ It reads ONLY the structure. There is no path here from a planner's `say`. */
    API.render = function (r, ui) {
      if (!r) return '';
      ui = ui || {};
      var L = ui.L, esc = ui.esc || function (s) { return String(s == null ? '' : s); };
      var note = ui.note || function (s) { return '<div>' + s + '</div>'; };
      var warn = ui.warn || note;
      var lines = [];
      var head = API.text(pickMessageKey(r), paramsOf(r), L);
      var good = (r.status === 'completed');
      if (head) lines.push(good ? note('✓ ' + esc(head)) : warn('⚠ ' + esc(head)));
      if (r.code && r.code !== 'ok') {
        var why = API.text('atlas.code.' + r.code, r.messageParams, L);
        if (why) lines.push(warn(esc(why)));
      }
      if (r.status === 'needs_input' && r.inputRequest) {
        var ask = API.text(r.inputRequest.promptKey, r.inputRequest.promptParams, L);
        if (ask) lines.push(note(esc(ask)));
      }
      if (r.candidates.length) {
        var names = r.candidates.slice(0, 8).map(function (c) {
          return esc(typeof c === 'string' ? c : (c && (c.label || c.name || c.id)) || '');
        }).filter(Boolean);
        if (names.length) lines.push(note(names.join(' · ')));
      }
      if (r.unresolved.length) {
        var un = r.unresolved.slice(0, 8).map(function (c) {
          return esc(typeof c === 'string' ? c : (c && (c.label || c.name || c.id)) || '');
        }).filter(Boolean);
        if (un.length) lines.push(warn(API.text('atlas.goal.targets_missing', { names: un.join(' · ') }, L)));
      }
      return lines.join('');
    };

    try { window.IntMapActionResult = API; } catch (_) { /* non-browser (the audit script) */ }
    return API;
  })();
}
