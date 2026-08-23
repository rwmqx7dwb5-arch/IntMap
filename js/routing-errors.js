/* ============================================================================
 *  IntMap · WHY IT DID NOT WORK — window.IntMapRouteErrors   (#R347)
 * ----------------------------------------------------------------------------
 *  §44: 「`Failed to fetch` 一本にまとめないでください。」
 *
 *  ══ WHY A TAXONOMY AND NOT A STRING ═══════════════════════════════════════════════════════════
 *  Before this round every failure in the routing path arrived at the panel as one of five ad-hoc
 *  spellings (`provider_unavailable`, `no_route`, `no_transit`, `cancelled`, `invalid_request`), and
 *  three of them were produced in more than one place with different meanings. The reader saw one
 *  sentence for all of them, which is the same as seeing none: 「経路が見つかりません」 is a true
 *  statement about a request that timed out and a useless one.
 *
 *  A code is not a message. Each code carries THREE things a message cannot:
 *    · `retry`   — may the app try the same request again, or is repeating it pointless?
 *    · `fallback`— is another provider allowed to answer this, or would that be dishonest?
 *    · `severity`— is this the reader's problem to solve (permission, no location) or ours?
 *  Those are what the orchestrator branches on. The sentence is looked up separately, in nine
 *  languages, and is deliberately SHORT — the code is for us, the sentence is for the reader.
 *
 *  ⚠ NO CODE HERE MEANS «SOMETHING WENT WRONG». `UNKNOWN` exists because unclassified failures do,
 *  but it is a hole to be closed, and `classify()` records what it could not name so a round can see
 *  the list rather than guess at it.
 * ==========================================================================*/
window.IntMapRouteErrors = (function () {
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

  /* ⚠ ONE ROW PER CODE — §44's list, plus the three the existing router already produced.
     `retry`: repeating the identical request could succeed.
     `fallback`: another provider may answer instead (a coverage hole is not fixed by asking a second
     server the same question — but a timeout is).
     `user`: the reader can do something about it; the UI offers the action rather than an apology. */
  var CODES = {
    NO_ROUTE:             { retry: false, fallback: true,  user: false },
    NO_LOCATION:          { retry: true,  fallback: false, user: true },
    LOCATION_DENIED:      { retry: false, fallback: false, user: true },
    LOCATION_UNAVAILABLE: { retry: true,  fallback: false, user: true },
    PROVIDER_TIMEOUT:     { retry: true,  fallback: true,  user: false },
    PROVIDER_RATE_LIMIT:  { retry: true,  fallback: true,  user: false },
    PROVIDER_UNAVAILABLE: { retry: true,  fallback: true,  user: false },
    OUT_OF_COVERAGE:      { retry: false, fallback: true,  user: false },
    INVALID_REQUEST:      { retry: false, fallback: false, user: true },
    TRAFFIC_UNAVAILABLE:  { retry: true,  fallback: true,  user: false },
    TRANSIT_UNAVAILABLE:  { retry: true,  fallback: true,  user: false },
    OFFLINE:              { retry: true,  fallback: false, user: true },
    REROUTE_FAILED:       { retry: true,  fallback: true,  user: false },
    CANCELLED:            { retry: false, fallback: false, user: false },
    UNKNOWN:              { retry: true,  fallback: true,  user: false },
  };

  /* the spellings the app already produced, mapped onto the taxonomy. ⚠ THIS TABLE IS THE MIGRATION,
     not a permanent translation layer: every producer should emit a code from CODES directly, and
     these remain so that a reply from an older path is still classified rather than falling to
     UNKNOWN. */
  var LEGACY = {
    no_route: 'NO_ROUTE', no_transit: 'TRANSIT_UNAVAILABLE', provider_unavailable: 'PROVIDER_UNAVAILABLE',
    invalid_request: 'INVALID_REQUEST', cancelled: 'CANCELLED', timeout: 'PROVIDER_TIMEOUT',
    rate_limit: 'PROVIDER_RATE_LIMIT', offline: 'OFFLINE', http: 'PROVIDER_UNAVAILABLE',
    network: 'PROVIDER_UNAVAILABLE', abort: 'CANCELLED', no_coverage: 'OUT_OF_COVERAGE',
  };

  /* what we could not name — read by tests and by the round that closes the hole */
  var unnamed = [];

  function is(code) { return Object.prototype.hasOwnProperty.call(CODES, String(code || '')); }
  function info(code) { return CODES[String(code || '')] || CODES.UNKNOWN; }
  function canRetry(code) { return !!info(code).retry; }
  function canFallback(code) { return !!info(code).fallback; }
  function isUserFixable(code) { return !!info(code).user; }

  /** turn whatever a layer produced into a code from the table */
  function classify(x) {
    if (!x) return 'UNKNOWN';
    if (typeof x === 'string') {
      if (is(x)) return x;
      var k = LEGACY[x.toLowerCase()];
      if (k) return k;
      if (unnamed.indexOf(x) < 0) unnamed.push(x);
      return 'UNKNOWN';
    }
    if (x.code && is(x.code)) return x.code;
    if (x.status) return classify(String(x.status));
    /* ── DOM / fetch failures, which arrive as exceptions rather than statuses ─────────────────── */
    var name = String(x.name || ''), msg = String(x.message || '');
    if (name === 'AbortError') return 'CANCELLED';
    if (name === 'TimeoutError') return 'PROVIDER_TIMEOUT';
    if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) return 'OFFLINE';
    if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'PROVIDER_UNAVAILABLE';
    /* GeolocationPositionError — a numeric `code` of 1/2/3, which is why `is()` is checked first */
    if (typeof x.code === 'number') {
      if (x.code === 1) return 'LOCATION_DENIED';
      if (x.code === 2) return 'LOCATION_UNAVAILABLE';
      if (x.code === 3) return 'NO_LOCATION';
    }
    if (msg && unnamed.indexOf(msg) < 0) unnamed.push(msg);
    return 'UNKNOWN';
  }

  /** an HTTP status from a routing server, as a code */
  function fromHTTP(status) {
    var s = +status || 0;
    if (s === 429) return 'PROVIDER_RATE_LIMIT';
    if (s === 400 || s === 422) return 'INVALID_REQUEST';
    if (s === 401 || s === 403) return 'PROVIDER_UNAVAILABLE';
    if (s === 404) return 'NO_ROUTE';
    if (s === 408 || s === 504) return 'PROVIDER_TIMEOUT';
    if (s >= 500) return 'PROVIDER_UNAVAILABLE';
    if (s >= 400) return 'PROVIDER_UNAVAILABLE';
    return 'UNKNOWN';
  }

  /* ⚠ THE SENTENCE IS SHORT AND SAYS WHAT TO DO. §44: 「UI文言はユーザー向けに簡潔にします。」
     All nine languages: five positional (en/ja/de/ru/es) and the rest from each locale's inline
     table, keyed by the English string — the same shape every other string in this app uses. */
  function message(code) {
    switch (classify(code)) {
      case 'NO_ROUTE': return L('No route found between these points.', 'この2地点を結ぶ経路が見つかりません。', 'Keine Route zwischen diesen Punkten gefunden.', 'Маршрут между этими точками не найден.', 'No se encontró ninguna ruta entre estos puntos.');
      case 'NO_LOCATION': return L('Still waiting for your location.', '現在地をまだ取得できていません。', 'Warte noch auf deinen Standort.', 'Ожидание вашего местоположения.', 'Esperando tu ubicación.');
      case 'LOCATION_DENIED': return L('Location permission is off. Allow it to navigate.', '位置情報が許可されていません。案内には許可が必要です。', 'Standortfreigabe ist aus. Für die Navigation erlauben.', 'Доступ к геолокации выключен. Разрешите его для навигации.', 'El permiso de ubicación está desactivado. Actívalo para navegar.');
      case 'LOCATION_UNAVAILABLE': return L('Your device cannot fix a position here.', 'この場所では位置を測定できません。', 'Dein Gerät kann hier keine Position bestimmen.', 'Устройство не может определить позицию здесь.', 'Tu dispositivo no puede fijar la posición aquí.');
      case 'PROVIDER_TIMEOUT': return L('The routing server took too long.', '経路サーバの応答がありませんでした。', 'Der Routing-Server hat zu lange gebraucht.', 'Сервер маршрутов не ответил вовремя.', 'El servidor de rutas tardó demasiado.');
      case 'PROVIDER_RATE_LIMIT': return L('The routing server is rate-limiting requests.', '経路サーバの利用が制限されています。', 'Der Routing-Server drosselt Anfragen.', 'Сервер маршрутов ограничивает запросы.', 'El servidor de rutas está limitando las solicitudes.');
      case 'PROVIDER_UNAVAILABLE': return L('The routing server is unavailable.', '経路サーバに接続できません。', 'Der Routing-Server ist nicht erreichbar.', 'Сервер маршрутов недоступен.', 'El servidor de rutas no está disponible.');
      case 'OUT_OF_COVERAGE': return L('This area is outside the router’s coverage.', 'この地域はルーターの対応範囲外です。', 'Dieses Gebiet liegt außerhalb der Abdeckung.', 'Эта область вне зоны покрытия маршрутизатора.', 'Esta zona está fuera de la cobertura del enrutador.');
      case 'INVALID_REQUEST': return L('That request cannot be routed as written.', 'この条件では経路を計算できません。', 'Diese Anfrage lässt sich so nicht berechnen.', 'Такой запрос нельзя проложить.', 'Esa solicitud no se puede calcular tal cual.');
      case 'TRAFFIC_UNAVAILABLE': return L('Traffic data is unavailable; standard routing used.', '交通情報を取得できないため、標準の経路を使用しました。', 'Keine Verkehrsdaten; Standardrouting verwendet.', 'Данные о пробках недоступны; использован обычный маршрут.', 'Sin datos de tráfico; se usó la ruta estándar.');
      case 'TRANSIT_UNAVAILABLE': return L('No public transport data for this journey.', 'この区間の公共交通データがありません。', 'Keine ÖPNV-Daten für diese Strecke.', 'Нет данных общественного транспорта для этой поездки.', 'No hay datos de transporte público para este trayecto.');
      case 'OFFLINE': return L('You appear to be offline.', 'オフラインのようです。', 'Du scheinst offline zu sein.', 'Похоже, вы офлайн.', 'Parece que estás sin conexión.');
      case 'REROUTE_FAILED': return L('Could not find a new route from here.', 'ここから新しい経路を計算できませんでした。', 'Konnte von hier keine neue Route finden.', 'Не удалось построить новый маршрут отсюда.', 'No se pudo calcular una nueva ruta desde aquí.');
      case 'CANCELLED': return L('That request was replaced by a newer one.', 'その要求は新しい要求に置き換えられました。', 'Diese Anfrage wurde durch eine neuere ersetzt.', 'Запрос заменён более новым.', 'Esa solicitud fue reemplazada por otra más nueva.');
      default: return L('Routing failed for an unknown reason.', '不明な理由で経路計算に失敗しました。', 'Routing ist aus unbekanntem Grund fehlgeschlagen.', 'Маршрутизация не удалась по неизвестной причине.', 'El cálculo de ruta falló por un motivo desconocido.');
    }
  }

  return {
    CODES: CODES, LEGACY: LEGACY,
    is: is, info: info, classify: classify, fromHTTP: fromHTTP, message: message,
    canRetry: canRetry, canFallback: canFallback, isUserFixable: isUserFixable,
    unnamed: function () { return unnamed.slice(); },
    list: function () { return Object.keys(CODES); },
  };
})();
