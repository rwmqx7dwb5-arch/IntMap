/* ============================================================================
 *  IntMap · THE DIRECTIONS PANEL — window.IntMapRouteUI   (#R291)
 * ----------------------------------------------------------------------------
 *  「経路のUIをもっと充実させて。Google MapやApple Mapのように」 was #R84. Seven rounds of capability
 *  went into the panel it built — a mode switch, via points, avoid chips, drawn keep-out areas,
 *  transit filters, six analyses, GPX/GeoJSON — and **not one line of it was reachable**: `openPanel`
 *  was exported from js/routing.js and called from nowhere in the program (measured; see that file's
 *  header). So this round's first job is not a better panel, it is A DOOR (§2: Layers → Tools →
 *  Directions), and the second is a panel worth walking through it.
 *
 *  ══ WHAT IS DIFFERENT FROM THE PANEL THIS REPLACES ═════════════════════════════════════════════
 *   · IT IS NOT A 346 px FLOATING BOX. A docked panel on the desktop, a three-detent bottom sheet on
 *     a phone — 「幅約346pxの小さな固定フローティングパネルへ全機能を詰め込む構成を廃止」.
 *   · THE SEARCH SHOWS CANDIDATES. The old field geocoded on Enter and picked one hit for you
 *     (js/routing-geocode.js's header measures what that cost); this one is a combobox.
 *   · ⚠⚠ (#R296) CLOSING IT DOES DELETE THE ROUTE. 「経路機能を閉じても地図に経路が残り続けるのをやめろ」
 *     — #R291 made the × keep the drawing, on its own reading of §2.2, and the reader has now said
 *     the opposite in as many words. Closing the panel takes the route off the map with it, so the
 *     map is never carrying a journey whose controls are gone. 「経路を消去」 still exists and still
 *     does the same thing WITHOUT closing, for a reader who wants a clean map and the panel open.
 *     ⚠ THE STORE'S ENDPOINTS SURVIVE the close (only the drawn route and the areas go), so
 *     re-opening the panel shows the same from/to and one press recomputes the same journey.
 *   · SWAP REVERSES THE ITINERARY, stops included (§5.3) — see js/routing-store.js.
 *   · THE ANALYSES ARE NOT IN THE WAY. Three sections: Route / Options / Analysis (§3), so a reader
 *     who wants a journey is not looking at ⛰ 🛂 🌦 🕒 ⇄ before they have one.
 *   · NOTHING IS STATE HERE. Every value is read from and written to window.IntMapRouteStore, which
 *     Atlas writes too — so the two surfaces cannot disagree (§17).
 *
 *  ⚠ THE CSS IS IN css/intmap.css (`.rtp-*`). This file adds no <style> and no long `style="…"`
 *  strings: the panel it replaces was ~9 kB of inline declarations, which is the thing §0 forbids
 *  adding to. What inline style remains is per-instance geometry a stylesheet cannot know — a
 *  candidate popup's measured position, an alternative's own colour.
 * ==========================================================================*/
window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.routeUi = function (HOST) {
  return (function () {
    const L = window.IntMapLang.pick(() => HOST.lang);
    const ST = () => window.IntMapRouteStore;
    const RT = () => window.IntMapRouting;
    const CD = () => window.IntMapRouteCards;
    const PV = () => window.IntMapRouteProviders;
    const GC = () => window.IntMapRouteGeocode;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const isMob = () => { try { return !!HOST.isMobile || window.innerWidth < 768; } catch (_) { return false; } };
    const units = () => { try { return HOST.unitMode || 'metric'; } catch (_) { return 'metric'; } };
    const tz = () => { try { return HOST.userTZ && HOST.userTZ !== 'auto' ? HOST.userTZ : ''; } catch (_) { return ''; } };
    /* ⚠ (#R296) `at` is WHERE the times in these cards happen — the destination, because an ETA is
       an arrival. js/routing-cards.js turns it into the local wall clock unless the reader pinned a
       zone in Settings. The lookup needs its polygons, so it is asked for once the panel opens. */
    const destLL = () => { try { const p = ST().get().to.place; return (p && isFinite(+p.lng)) ? [+p.lng, +p.lat] : null; } catch (_) { return null; } };
    const opt = () => ({ lang: HOST.lang, units: units(), tz: tz(), at: destLL() });

    let el = null, sug = null, openState = false, tab = 'route';
    let recomputeTimer = null, sugTimer = null, sugAC = null, sugFor = null, sugIdx = -1;
    let lastKey = '', opsBusy = '', geoWatch = null, hereState = 'idle', herePos = null;
    let unsub = null, focusReturn = null;
    let wmOn = false, geomT = null, geomObs = null;

    /* ══ THE DOOR ═════════════════════════════════════════════════════════════════════════════════
       `open()` is idempotent: a second press brings the existing panel to the front with its state
       intact rather than building a second one (§2.2 「重複生成せず既存パネルを前面化する」). */
    function open(o) {
      o = o || {};
      build();
      try { focusReturn = document.activeElement; } catch (_) { focusReturn = null; }
      openState = true; ST().setOpen(true);
      el.hidden = false;
      el.classList.remove('rtp-min');
      document.body.classList.add('rtp-open');
      if (isMob()) setDetent(ST().get().result ? 'mid' : 'full');
      /* ⚠ (#R298) THE SENTENCE ABOVE THIS FUNCTION SAID 「brings the existing panel to the front」 and
         nothing did it — `bringToFront` was bound in js/routing.js and called nowhere. It is the
         app-wide window register (js/window-manager.js), so «in front» means in front of the other
         floating windows and still under an open sidebar, which is the band css/intmap.css defines.
         ⚠ Desktop only: the phone sheet's z-index is a stylesheet fact and an inline one would put it
         into the desktop band, above the surfaces `body.rtp-open` deliberately steps aside for. */
      enableWindowing(); restoreGeom();
      if (!isMob()) { try { if (typeof HOST.bringToFront === 'function') HOST.bringToFront(el); } catch (_) { } }
      /* the local place index the field merges into its candidates is loaded lazily by the app; ask
         for it the way js/search-geocode.js's own box does, without waiting for it (§4.1) */
      try { if (typeof HOST.loadCountryData === 'function' && !(HOST.countryStats && Object.keys(HOST.countryStats).length)) HOST.loadCountryData(); } catch (_) { }
      try { if (window.IntMapGazetteer && window.IntMapGazetteer.warm) window.IntMapGazetteer.warm(); } catch (_) { }
      /* ⚠ (#R296) THE ZONE LOOKUP IS ASKED FOR HERE, ONCE. `IntMapTimeZones.offsetAt` answers null until
         its polygons are in hand, and #R293 ⑧ is the round where a `ready()` that nobody had called
         made 「地図中心の標準時」 quietly fall back to the device clock for anyone who had chosen it
         earlier. 「経路機能で、現地の時刻に合わせろ」 depends on the same data, so the panel asks and
         re-renders when it lands rather than assuming somebody else did. */
      try{ const TZ = window.IntMapTimeZones;
        if (TZ && TZ.ensure && (!TZ.ready || !TZ.ready())) Promise.resolve(TZ.ensure()).then(() => { if (openState) render(); }, () => {}); }catch(_){}
      render();
      applyInsets();
      /* a restored share link recomputes rather than trusting a stored geometry (§16.2) */
      /* ⚠⚠ (#R298) …AND SO DOES RE-OPENING, because #R296 made closing CLEAR the route. The comment
         on `close()` says 「the ENDPOINTS stay in the store, so re-opening shows the same journey to
         recompute rather than an empty form」 and PRODUCT.md says the same — MEASURED on production,
         neither was true: closing and re-opening left the two field texts in place and the pane
         reading 「Enter a start and a destination to see routes.」 with nothing drawn, because the
         result had been thrown away and nothing asked for it again. A sentence in two documents that
         the app does not do is worse than a missing feature; this is the line that makes it true. */
      if (o.restored) schedule(0);
      else if (ST().get().result) { try { RT().frame(); } catch (_) { } }
      else if (ST()._pure.ready(ST().get())) schedule(0);
      setTimeout(() => { try { const f = el.querySelector('.rtp-field[data-f="from"] input'); if (f && !ST().get().from.place) f.focus(); } catch (_) { } }, 60);
      return true;
    }
    /* ⚠⚠ (#R296) CLOSING IS CLEARING — see the header. The drawn route and any keep-out areas go
       with the panel; the ENDPOINTS stay in the store, so re-opening shows the same journey to
       recompute rather than an empty form. */
    function close() {
      openState = false;
      try { ST().setOpen(false); } catch (_) { }
      if (el) el.hidden = true;
      document.body.classList.remove('rtp-open');
      lastKey = '';                                  /* (#R296) …and so does closing — see clearRoute */
      try { RT().clear(); RT().clearAreas(); } catch (_) { }
      closeSuggest(); try { RT().endPick(); RT().endAreaDraw(true); } catch (_) { }
      try { RT().setInsets({}); } catch (_) { }
      try { if (focusReturn && focusReturn.isConnected) focusReturn.focus(); } catch (_) { }
      return true;
    }
    function isOpen() { return !!openState; }
    function hasRoute() { try { return !!RT().hasRoute(); } catch (_) { return false; } }
    /** ⚠ (#R296) THROWING THE ROUTE AWAY ALSO FORGETS THAT WE ASKED FOR IT. `schedule()` refuses to
       re-run an identical request within 1.5 s — which is right while a route EXISTS (a re-render is
       not a new question) and wrong the moment it does not: pressing 「経路を消去」 and then asking for
       the same journey again is a NEW request for something that is no longer on the map, and the
       reader would have watched nothing happen. Found by the smoke spec, not by eye. */
    function clearRoute() { lastKey = ''; try { RT().clear(); RT().clearAreas(); } catch (_) { } render(); }

    /* ══ CONSTRUCTION ═════════════════════════════════════════════════════════════════════════════ */
    function build() {
      if (el) return el;
      el = document.createElement('section');
      el.id = 'route-panel'; el.className = 'rtp'; el.hidden = true;
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-labelledby', 'rtp-title');
      el.innerHTML = shell();
      (document.getElementById('map-container') || document.body).appendChild(el);
      wire();
      unsub = ST().on((s, why) => {
        if (!openState) return;
        if (why === 'result' || why === 'clear' || why === 'sel' || why === 'request') render();
        /* ⚠⚠ (#R298) 「地図上で経路を押したら、自動的にパネル側もその経路が選択されるように。」 The chain
           was already whole — js/routing.js `selectAlt` writes the store and the panel re-renders —
           but a card can be several screens down a scrolling list, or on a tab that is not showing,
           and a selection nobody can see is indistinguishable from one that did not happen. */
        if (why === 'sel') revealSelected();
      });
      try { window.addEventListener('resize', applyInsets); } catch (_) { }
      /* ⚠ (#R291 追記) THE WHOLE PANEL IS REBUILT, INCLUDING THE ANSWERS. `render()` redraws the
         cards from `s.result`, and js/routing-cards.js resolves every string at that moment — which
         is only true because the alternative's differentiator is a descriptor rather than a
         sentence (js/routing.js `_labelRoad`). Production verification found the one string that
         was not. */
      try { window.addEventListener('intmap-lang', () => { if (!el) return; el.innerHTML = shell(); wire(); render(); }); } catch (_) { }
      return el;
    }

    function shell() {
      const T = (k) => esc(k);
      return ''
        + '<div class="rtp-grip" role="separator" aria-label="' + T(L('Resize the panel', 'パネルの高さを変える', 'Panelhöhe ändern', 'Изменить высоту панели', 'Cambiar la altura')) + '" tabindex="0"></div>'
        + '<header class="rtp-head">'
        + '<span class="rtp-ic" aria-hidden="true">' + CD().glyph('pin', { size: 18 }) + '</span>'
        + '<h2 id="rtp-title">' + T(L('Directions', '経路', 'Route', 'Маршрут', 'Cómo llegar')) + '</h2>'
        + '<button type="button" class="rtp-btn-ico rtp-minb" aria-label="' + T(L('Minimise', '最小化', 'Minimieren', 'Свернуть', 'Minimizar')) + '"><span aria-hidden="true">–</span></button>'
        + '<button type="button" class="rtp-btn-ico rtp-closeb" aria-label="' + T(L('Close the directions panel (this also removes the route from the map)', '経路パネルを閉じる（地図の経路も消えます）', 'Panel schließen (die Route wird ebenfalls entfernt)', 'Закрыть панель (маршрут тоже уберётся)', 'Cerrar el panel (la ruta también se elimina)')) + '"><span aria-hidden="true">×</span></button>'
        + '</header>'
        + '<div class="rtp-fixed">'
        + '<div class="rtp-modes" role="group" aria-label="' + T(L('Travel mode', '交通手段', 'Verkehrsmittel', 'Способ передвижения', 'Modo de transporte')) + '">'
        + ST().MODES.map((m) => '<button type="button" class="rtp-mode" data-m="' + m + '" aria-pressed="false">'
          /* (#R298) 18, not 20 — the mode switch gave up 10 px of the panel to the fields below it */
          + '<span class="rtp-mode-ic" aria-hidden="true">' + CD().glyph(m, { size: 18 }) + '</span>'
          + '<span class="rtp-mode-tx">' + T(CD().modeLabel(m, opt())) + '</span></button>').join('')
        + '</div>'
        + '<div class="rtp-fields"></div>'
        + '<div class="rtp-fieldbar">'
        + '<button type="button" class="rtp-chip rtp-addvia">' + T(L('Add a stop', '経由地を追加', 'Zwischenziel', 'Промежуточная точка', 'Añadir parada')) + '</button>'
        + '<button type="button" class="rtp-chip rtp-swap">' + T(L('Reverse', '入替', 'Umkehren', 'Обратно', 'Invertir')) + '</button>'
        /* ══ ⚠⚠ (#R298) 「経路を検索ボタンがないのもおかしい。」 ═══════════════════════════════════════
           #R291 wrote §23 as 「never recompute on a keystroke」 and then had nothing else say «now»:
           every request came from a confirmed change, silently, and the reader had no control that
           MEANT «search». The automatic recompute is untouched — this is the missing half of it, the
           one control on the panel that is the primary action, next to the fields it acts on. */
        + '<button type="button" class="rtp-go">' + T(L('Find routes', '経路を検索', 'Routen suchen', 'Найти маршруты', 'Buscar rutas')) + '</button>'
        + '</div>'
        + '<div class="rtp-when">'
        + '<select class="rtp-when-kind" aria-label="' + T(L('Departure or arrival', '出発／到着', 'Abfahrt oder Ankunft', 'Отправление или прибытие', 'Salida o llegada')) + '">'
        + '<option value="now">' + T(L('Leave now', '今すぐ出発', 'Jetzt losfahren', 'Отправление сейчас', 'Salir ahora')) + '</option>'
        + '<option value="depart">' + T(L('Depart at', '出発時刻を指定', 'Abfahrt um', 'Отправление в', 'Salir a las')) + '</option>'
        + '<option value="arrive">' + T(L('Arrive by', '到着時刻を指定', 'Ankunft bis', 'Прибытие к', 'Llegar antes de')) + '</option>'
        + '</select>'
        + '<input type="datetime-local" class="rtp-when-at" hidden aria-label="' + T(L('Date and time', '日時', 'Datum und Uhrzeit', 'Дата и время', 'Fecha y hora')) + '">'
        + '<span class="rtp-when-tz"></span>'
        + '</div>'
        + '<div class="rtp-summary" aria-live="polite"></div>'
        + '</div>'
        + '<nav class="rtp-tabs" role="tablist" aria-label="' + T(L('Directions sections', '経路のセクション', 'Abschnitte', 'Разделы', 'Secciones')) + '">'
        + [['route', L('Route', '経路', 'Route', 'Маршрут', 'Ruta')],
           ['opts', L('Options', 'オプション', 'Optionen', 'Параметры', 'Opciones')],
           ['ana', L('Analysis', '分析', 'Analyse', 'Анализ', 'Análisis')]]
          .map(([k, lb]) => '<button type="button" role="tab" class="rtp-tab" data-tab="' + k + '" id="rtp-tab-' + k + '" aria-controls="rtp-p-' + k + '" aria-selected="false">' + T(lb) + '</button>').join('')
        + '</nav>'
        + '<div class="rtp-body">'
        + '<div class="rtp-pane" id="rtp-p-route" role="tabpanel" aria-labelledby="rtp-tab-route"></div>'
        + '<div class="rtp-pane" id="rtp-p-opts" role="tabpanel" aria-labelledby="rtp-tab-opts" hidden></div>'
        + '<div class="rtp-pane" id="rtp-p-ana" role="tabpanel" aria-labelledby="rtp-tab-ana" hidden></div>'
        + '</div>'
        + '<footer class="rtp-foot">'
        + '<button type="button" class="rtp-chip rtp-exp" data-f="gpx">GPX</button>'
        + '<button type="button" class="rtp-chip rtp-exp" data-f="geojson">GeoJSON</button>'
        + '<button type="button" class="rtp-chip rtp-share">' + T(L('Share', '共有', 'Teilen', 'Поделиться', 'Compartir')) + '</button>'
        + '<button type="button" class="rtp-chip rtp-danger rtp-clear">' + T(L('Clear route', '経路を消去', 'Route löschen', 'Удалить маршрут', 'Borrar ruta')) + '</button>'
        + '</footer>';
    }

    /* ══ FIELDS — one row per waypoint, lettered A / 1 / 2 / B exactly like the map ═══════════════ */
    /* (#R296) one label, four states — a control that is asking, or that was refused, says so */
    function hereLabel() {
      return hereState === 'asking' ? L('Getting your location…', '現在地を取得中…', 'Standort wird ermittelt…', 'Определяем местоположение…', 'Obteniendo su ubicación…')
        : hereState === 'denied' ? L('Use my location (permission was refused)', '現在地を使う（許可が拒否されています）', 'Meinen Standort verwenden (verweigert)', 'Использовать моё местоположение (отказано)', 'Usar mi ubicación (permiso denegado)')
          : L('Use my current location', '現在地を使う', 'Meinen Standort verwenden', 'Использовать моё местоположение', 'Usar mi ubicación actual');
    }
    function fieldRow(which, i, n) {
      const s = ST().get();
      const f = ST().field(which);
      const mark = (which === 'from') ? 'A' : (which === 'to') ? 'B' : String(i);
      const cls = (which === 'from') ? 'a' : (which === 'to') ? 'b' : 'v';
      const ph = (which === 'from') ? L('Choose a start', '出発地', 'Start', 'Начало', 'Origen')
        : (which === 'to') ? L('Choose a destination', '目的地', 'Ziel', 'Пункт назначения', 'Destino')
          : L('Stop', '経由地', 'Zwischenziel', 'Промежуточная точка', 'Parada');
      const id = 'rtp-in-' + String(which).replace(':', '-');
      const val = f ? (f.place ? (f.place.name || '') : f.text) : '';
      const canMove = (which !== 'from' && which !== 'to');
      return '<div class="rtp-field' + (f && f.place ? ' ok' : '') + '" data-f="' + esc(String(which)) + '"' + (canMove ? ' draggable="true"' : '') + '>'
        + '<span class="rtp-mark rtp-mark-' + cls + '" aria-hidden="true">' + esc(mark) + '</span>'
        + '<label class="rtp-sr" for="' + id + '">' + esc(ph) + '</label>'
        + '<input id="' + id + '" class="rtp-in" type="text" autocomplete="off" spellcheck="false"'
        + ' role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="rtp-suggest"'
        + ' placeholder="' + esc(ph) + '" value="' + esc(val) + '">'
        + (val ? '<button type="button" class="rtp-btn-ico rtp-x" aria-label="' + esc(L('Clear this field', 'この欄をクリア', 'Feld leeren', 'Очистить поле', 'Borrar campo')) + '"><span aria-hidden="true">×</span></button>' : '')
        /* ══ ⚠⚠⚠ (#R296) 「経路機能は現在地を地点に楽に選べるように。」 — AND `useHere` WAS NEVER CALLED ═════
           MEASURED before writing this: `useHere(which)` has existed in this file since #R291, complete
           with its permission handling, its accuracy warning and its three named failure messages — and
           searching the whole program for a caller found NONE. The only way to reach the reader's own
           position was to type into the field and hope 「現在地」 appeared among the suggestions. That is
           the shape #R291 itself found for `openPanel` and #R268 counted three times in one round: a
           finished feature with no door.
           → every field gets the button, beside the one that picks a point on the map, because those are
           the same kind of act. It reports its own state: asking / denied are not silent. */
        + '<button type="button" class="rtp-btn-ico rtp-here' + (hereState === 'asking' ? ' rtp-busy' : '') + '"'
        + ' aria-label="' + esc(hereLabel()) + '" title="' + esc(hereLabel()) + '"' + (hereState === 'asking' ? ' disabled' : '') + '>'
        + '<span aria-hidden="true">' + CD().glyph('here', { size: 16 }) + '</span></button>'
        + '<button type="button" class="rtp-btn-ico rtp-pick" aria-label="' + esc(L('Pick this point on the map', '地図でこの地点を選ぶ', 'Punkt auf der Karte wählen', 'Выбрать точку на карте', 'Elegir en el mapa')) + '">'
        + '<span aria-hidden="true">' + CD().glyph('pin', { size: 16 }) + '</span></button>'
        + (canMove
          ? '<button type="button" class="rtp-btn-ico rtp-up" aria-label="' + esc(L('Move this stop earlier', 'この経由地を前へ', 'Stopp nach vorn', 'Переместить выше', 'Subir parada')) + '"><span aria-hidden="true">↑</span></button>'
          + '<button type="button" class="rtp-btn-ico rtp-down" aria-label="' + esc(L('Move this stop later', 'この経由地を後ろへ', 'Stopp nach hinten', 'Переместить ниже', 'Bajar parada')) + '"><span aria-hidden="true">↓</span></button>'
          + '<button type="button" class="rtp-btn-ico rtp-del" aria-label="' + esc(L('Remove this stop', 'この経由地を削除', 'Stopp entfernen', 'Удалить точку', 'Quitar parada')) + '"><span aria-hidden="true">×</span></button>'
          : '')
        + '</div>';
    }
    function renderFields() {
      const s = ST().get();
      const box = el.querySelector('.rtp-fields');
      const n = 2 + s.via.length;
      let h = fieldRow('from', 0, n);
      s.via.forEach((v, i) => { h += fieldRow('via:' + i, i + 1, n); });
      h += fieldRow('to', n - 1, n);
      box.innerHTML = h;
      const cap = PV().maxVia(s.mode);
      const add = el.querySelector('.rtp-addvia');
      if (add) {
        const full = s.via.length >= cap;
        add.disabled = full;
        add.title = full
          ? L('This provider accepts at most ', 'このプロバイダーが受け付ける経由地は最大 ', 'Dieser Dienst nimmt höchstens ', 'Этот сервис принимает не более ', 'Este proveedor admite como máximo ') + cap
          + ' ' + L('stops', '地点です', 'Zwischenziele', 'точек', ' paradas')
          : '';
      }
    }

    /* ══ SUGGESTIONS — a real combobox (§4.1) ════════════════════════════════════════════════════ */
    function ensureSuggest() {
      if (sug) return sug;
      sug = document.createElement('div');
      sug.id = 'rtp-suggest'; sug.className = 'rtp-suggest'; sug.setAttribute('role', 'listbox'); sug.hidden = true;
      document.body.appendChild(sug);
      sug.addEventListener('mousedown', (e) => { e.preventDefault(); });   /* keep focus in the input */
      sug.addEventListener('click', (e) => {
        const r = e.target.closest && e.target.closest('.rtp-sug[data-i]');
        if (r) chooseSuggestion(+r.getAttribute('data-i'));
      });
      return sug;
    }
    let sugItems = [];
    function closeSuggest() {
      if (sug) { sug.hidden = true; sug.innerHTML = ''; }
      sugIdx = -1; sugItems = []; sugFor = null;
      try { if (el) el.querySelectorAll('.rtp-in').forEach((i) => { i.setAttribute('aria-expanded', 'false'); i.removeAttribute('aria-activedescendant'); }); } catch (_) { }
      if (sugAC) { try { sugAC.abort(); } catch (_) { } sugAC = null; }
    }
    function placeSuggest(input) {
      const r = input.getBoundingClientRect();
      sug.style.left = Math.round(r.left) + 'px';
      sug.style.width = Math.round(r.width) + 'px';
      /* below the field, unless there is no room — then above it */
      const below = window.innerHeight - r.bottom;
      if (below < 200 && r.top > 200) { sug.style.top = ''; sug.style.bottom = Math.round(window.innerHeight - r.top + 4) + 'px'; }
      else { sug.style.bottom = ''; sug.style.top = Math.round(r.bottom + 4) + 'px'; }
    }
    function sugRow(c, i, active) {
      const d = (c.distKm != null && isFinite(c.distKm))
        ? CD().distance(c.distKm * 1000, opt()) : '';
      return '<div class="rtp-sug' + (active ? ' on' : '') + '" role="option" id="rtp-sug-' + i + '" aria-selected="' + (active ? 'true' : 'false') + '" data-i="' + i + '">'
        + '<span class="rtp-sug-ic" aria-hidden="true">' + CD().glyph(c.kind === 'station' ? 'rail' : c.kind === 'airport' ? 'highspeed' : c.kind === 'here' ? 'here' : 'pin', { size: 15 }) + '</span>'
        + '<span class="rtp-sug-tx"><b>' + esc(c.name) + '</b>'
        + '<span class="rtp-sug-sub">' + esc([GC().kindLabel(c.kind), c.admin].filter(Boolean).join(' · ')) + '</span></span>'
        + (d ? '<span class="rtp-sug-d">' + esc(d) + '</span>' : '') + '</div>';
    }
    function showSuggest(input, items, msg) {
      ensureSuggest();
      sugItems = items || [];
      placeSuggest(input);
      sug.innerHTML = msg
        ? '<div class="rtp-sug-msg">' + esc(msg) + '</div>'
        : sugItems.map((c, i) => sugRow(c, i, i === sugIdx)).join('');
      sug.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      if (sugIdx >= 0) input.setAttribute('aria-activedescendant', 'rtp-sug-' + sugIdx);
    }
    function chooseSuggestion(i) {
      const c = sugItems[i]; if (!c || !sugFor) return;
      const which = sugFor;
      ST().setPlace(which, c);
      try { GC().remember(c); } catch (_) { }
      closeSuggest(); renderFields(); schedule(0);
      try { const inp = el.querySelector('.rtp-field[data-f="' + CSS.escape(String(which)) + '"] input'); if (inp) inp.focus(); } catch (_) { }
    }
    /* ══ ⚠⚠⚠ (#R298) 「地点を入力する欄がくそ。ほぼ座標ぐらいしか対応していない。検索機能なし。」 ═══════
       THE APP ALREADY OWNS A PLACE INDEX AND THIS FIELD WAS THE ONE SEARCH BOX NOT CONSULTING IT.
       `localFuzzyPlaces` (js/search-geocode.js, reached through HOST like every other module reaches
       it) resolves country names, capitals and the 3,482-row world gazetteer with typo tolerance, on
       the device, in no time at all — it is what the map's own search box has used since #R15. Merged
       here, a reader gets rows on the FIRST keystroke, and gets them with no network at all.
       ⚠ ITS VOCABULARY IS NOT THIS PANEL'S. It answers «country» / «capital» / a gazetteer type;
       `kindLabel` prints an unrecognised kind VERBATIM, which would put an untranslated English word
       into a Japanese list. Mapped onto the six kinds this file labels — never passed through. */
    function localCandidates(q) {
      const out = [];
      try {
        const hits = (typeof HOST.localFuzzyPlaces === 'function') ? HOST.localFuzzyPlaces(q) : null;
        (hits || []).forEach((h) => {
          if (!h || !isFinite(+h.lng) || !isFinite(+h.lat)) return;
          const kind = (h.kind === 'country') ? 'region' : (h.kind === 'capital') ? 'city' : 'place';
          const row = { lng: +h.lng, lat: +h.lat, name: String(h.name || ''), kind: kind, source: 'local', id: 'loc:' + h.name };
          /* a name the local index matched EXACTLY is pinned to the top by the same `exact` flag the
             station registry uses (js/routing-geocode.js `rank`) — one mechanism, not two */
          if ((+h.score || 0) >= 88) row.exact = true;
          out.push(row);
        });
      } catch (_) { }
      return out.slice(0, 5);
    }
    function askSuggest(which, input) {
      const q = input.value.trim();
      sugFor = which; sugIdx = -1;
      if (sugTimer) clearTimeout(sugTimer);
      if (sugAC) { try { sugAC.abort(); } catch (_) { } sugAC = null; }
      if (!q) {
        const r = recentsAndHere();
        if (r.length) showSuggest(input, r, ''); else closeSuggest();
        return;
      }
      /* ⚠⚠ THE LIST IS NOT EMPTIED WHILE THE NETWORK IS ASKED. Every keystroke used to replace the
         rows with the single word 「Searching…」, and between the 240 ms debounce and Nominatim's
         1.1 s floor that is what the reader looked at — candidates VANISHING as they typed. A search
         that shows nothing is a search that is not working, whatever it is doing underneath. Local
         rows stand until the network's arrive, and 「Searching…」 is only for when there are none. */
      const near = nearRef(which);
      const seed = GC().rank(GC().dedupe(localCandidates(q)), near);
      if (seed.length) showSuggest(input, seed, '');
      else showSuggest(input, [], L('Searching…', '検索中…', 'Suche…', 'Поиск…', 'Buscando…'));
      /* ⚠ 200–300 ms, and the previous search is CANCELLED — 「入力中に複数APIへ同時アクセスしない」 */
      sugTimer = setTimeout(async () => {
        /* ⚠ THE CONTROLLER IS HELD LOCALLY. `sugAC` is reassigned by the next keystroke, so the old
           closure reading the module variable was testing the NEW request's signal and painting a
           superseded answer over a fresh list. */
        const ac = new AbortController();
        sugAC = ac;
        let res = null;
        try { res = await GC().suggest(q, { near: near, lang: HOST.lang, limit: 8, signal: ac.signal }); } catch (_) { res = null; }
        if (sugFor !== which || ac.signal.aborted) return;   /* the reader moved on */
        const net = (res && res.items) ? res.items : [];
        const all = GC().rank(GC().dedupe(seed.concat(net)), near).slice(0, 8);
        if (all.length) { showSuggest(input, all, ''); return; }
        if (!res) { showSuggest(input, [], L('Search is unavailable right now.', '検索を利用できません。', 'Suche nicht verfügbar.', 'Поиск недоступен.', 'Búsqueda no disponible.')); return; }
        if (res.error) { showSuggest(input, [], L('The place search could not be reached — check the connection and try again.', '地点検索に接続できませんでした。接続を確認して再試行してください。', 'Ortssuche nicht erreichbar.', 'Поиск мест недоступен.', 'No se pudo contactar la búsqueda.')); return; }
        showSuggest(input, [], L('No place matches that.', '該当する地点がありません。', 'Kein Ort gefunden.', 'Ничего не найдено.', 'Sin resultados.'));
      }, 240);
    }
    /** the point candidates are ranked against: the other endpoint if it is known, else the view */
    function nearRef(which) {
      const s = ST().get();
      const other = (which === 'from') ? s.to.place : s.from.place;
      if (other) return [other.lng, other.lat];
      if (herePos) return [herePos.lng, herePos.lat];
      try { const c = window.IntMapGeoEngine.camera.getCenter(); return [c.lng, c.lat]; } catch (_) { return null; }
    }
    function recentsAndHere() {
      const out = [];
      if (herePos) out.push({ lng: herePos.lng, lat: herePos.lat, name: L('Current location', '現在地', 'Aktueller Standort', 'Текущее местоположение', 'Ubicación actual'), kind: 'here', source: 'here', admin: herePos.accM ? ('±' + Math.round(herePos.accM) + ' m') : '' });
      try { GC().recent().forEach((r) => out.push(r)); } catch (_) { }
      return out;
    }

    /* ══ CURRENT LOCATION (§4.3) ══════════════════════════════════════════════════════════════════
       ⚠ OPENING THE PANEL ASKS FOR NOTHING. The permission prompt happens on the press, and only
       then — 「経路パネルを開いただけで、毎回位置情報許可を要求しない」. If the app already has a fix
       (another feature asked earlier) it is offered as a suggestion straight away. */
    function useHere(which) {
      if (!navigator.geolocation) { toast(L('This browser cannot provide a location.', 'このブラウザは位置情報を提供できません。', 'Dieser Browser kann keinen Standort liefern.', 'Браузер не может дать местоположение.', 'Este navegador no puede dar la ubicación.')); return; }
      hereState = 'asking'; renderFields();
      navigator.geolocation.getCurrentPosition((pos) => {
        hereState = 'ok';
        herePos = { lng: pos.coords.longitude, lat: pos.coords.latitude, accM: pos.coords.accuracy };
        const p = {
          lng: herePos.lng, lat: herePos.lat, kind: 'here', source: 'here',
          name: L('Current location', '現在地', 'Aktueller Standort', 'Текущее местоположение', 'Ubicación actual'),
        };
        ST().setPlace(which, p); renderFields(); schedule(0);
        if (herePos.accM > 500) toast(L('The location fix is only accurate to about ', '現在地の精度は約 ', 'Der Standort ist nur auf etwa ', 'Точность местоположения около ', 'La ubicación tiene una precisión de unos ') + Math.round(herePos.accM) + ' m.');
      }, (err) => {
        hereState = (err && err.code === 1) ? 'denied' : (err && err.code === 3) ? 'timeout' : 'error';
        renderFields();
        toast(hereState === 'denied'
          ? L('Location permission was refused — type a place or pick one on the map instead.', '位置情報の利用が拒否されました。地点を入力するか地図から選んでください。', 'Standortfreigabe verweigert.', 'В доступе к геолокации отказано.', 'Permiso de ubicación denegado.')
          : hereState === 'timeout'
            ? L('Getting a location took too long — try again, or pick a point on the map.', '現在地の取得に時間がかかりすぎました。再試行するか地図から選んでください。', 'Standortabfrage dauerte zu lange.', 'Не удалось быстро определить местоположение.', 'La ubicación tardó demasiado.')
            : L('The location is unavailable right now.', '現在地を取得できません。', 'Standort derzeit nicht verfügbar.', 'Местоположение недоступно.', 'Ubicación no disponible.'));
      }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
    }
    function toast(msg) { try { HOST.imToast ? HOST.imToast(msg) : console.info('[IntMap] ' + msg); } catch (_) { } }

    /* ══ WHEN ════════════════════════════════════════════════════════════════════════════════════ */
    function renderWhen() {
      const s = ST().get();
      const k = el.querySelector('.rtp-when-kind'), at = el.querySelector('.rtp-when-at'), z = el.querySelector('.rtp-when-tz');
      k.value = s.when.kind;
      at.hidden = (s.when.kind === 'now');
      if (!at.hidden && !at.value) {
        const d = new Date(Date.now() + 5 * 60000); d.setSeconds(0, 0);
        try { at.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); } catch (_) { }
        ST().setWhen(s.when.kind, at.value);
      } else if (!at.hidden) at.value = s.when.local || at.value;
      /* ⚠ 「入力時刻がどのタイムゾーンか分からない状態を作らないでください」 — the zone is PRINTED, and it
         is the app's clock zone, which js/routing-store.js converts from (never the device's). */
      /* ⚠ (#R296) …and when no zone is pinned, the times in the cards are the LOCAL ones at the ends of
         the journey (「経路機能で、現地の時刻に合わせろ」), so saying 「Asia/Tokyo」 here would be
         a different fact from the one on screen. The picker itself is still typed in the device's zone
         — that is what a `datetime-local` input is — so the label names that, and says so. */
      const pinned = tz();
      const dev = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { return ''; } })();
      const zone = pinned || dev;
      z.textContent = at.hidden ? '' : (pinned ? zone
        : (zone ? (zone + ' · ' + L('times below are local to each place', '下の時刻は各地点の現地時間', 'Zeiten unten sind Ortszeit', 'время ниже — местное', 'las horas de abajo son locales')) : ''));
      z.hidden = at.hidden;
      /* road modes: the time is arithmetic, not a traffic forecast (§7.2) */
      const road = s.mode !== 'transit';
      k.querySelectorAll('option').forEach((o) => {
        if (o.value === 'arrive') o.disabled = road && !PV().supports(s.mode, 'arriveBy');
      });
    }

    /* ══ RENDER ══════════════════════════════════════════════════════════════════════════════════ */
    function render() {
      if (!el) return;
      const s = ST().get();
      CD().setLang(HOST.lang);
      el.querySelectorAll('.rtp-mode').forEach((b) => {
        const on = b.getAttribute('data-m') === s.mode;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.classList.toggle('on', on);
      });
      renderFields(); renderWhen();
      el.querySelectorAll('.rtp-tab').forEach((b) => {
        const on = b.getAttribute('data-tab') === tab;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.classList.toggle('on', on);
      });
      ['route', 'opts', 'ana'].forEach((k) => { const p = el.querySelector('#rtp-p-' + k); if (p) p.hidden = (k !== tab); });
      renderSummary(); renderGo(); renderRoutePane(); renderOptsPane(); renderAnaPane();
      const foot = el.querySelector('.rtp-foot');
      if (foot) foot.classList.toggle('rtp-off', !hasRoute());
    }
    /* ⚠ (#R298) THE PRIMARY ACTION REPORTS ITS OWN STATE. Three of them: it can be pressed, it is
       working (so a second press is not what is needed), or it cannot run yet — and in the last case
       it names the sentence that says why rather than staying a grey rectangle. The two strings are
       the SAME `L()` calls `renderSummary` uses, so the button and the summary cannot disagree. */
    function renderGo() {
      const b = el.querySelector('.rtp-go'); if (!b) return;
      const s = ST().get();
      const busy = s.request.state === 'loading';
      const can = ST()._pure.ready(s);
      b.disabled = busy || !can;
      b.classList.toggle('rtp-go-busy', busy);   /* ⚠ not `rtp-busy` — see css/intmap.css */
      b.textContent = busy
        ? L('Finding routes…', '経路を検索中…', 'Routen werden gesucht…', 'Поиск маршрутов…', 'Buscando rutas…')
        : L('Find routes', '経路を検索', 'Routen suchen', 'Найти маршруты', 'Buscar rutas');
      if (!busy && !can) {
        b.title = L('Choose a start and a destination.', '出発地と目的地を選んでください。', 'Start und Ziel wählen.', 'Выберите начало и цель.', 'Elige origen y destino.');
        b.setAttribute('aria-describedby', 'rtp-why');
      } else { b.removeAttribute('title'); b.removeAttribute('aria-describedby'); }
    }

    function renderSummary() {
      const s = ST().get(), box = el.querySelector('.rtp-summary');
      if (s.request.state === 'loading') { box.innerHTML = '<span class="rtp-busy">' + esc(L('Finding routes…', '経路を検索中…', 'Routen werden gesucht…', 'Поиск маршрутов…', 'Buscando rutas…')) + '</span>'; return; }
      if (!ST()._pure.ready(s)) {
        /* ⚠ (#R298) THE ID IS WHAT LETS 「経路を検索」 EXPLAIN ITSELF WITHOUT A SECOND SENTENCE.
           A disabled control that says nothing is the defect; a disabled control whose reason is
           written twice is #R293's — two elements making the same claim, one of which goes stale.
           So the button points AT this sentence (`aria-describedby`) instead of repeating it. */
        box.innerHTML = '<span class="rtp-hint" id="rtp-why">' + esc(L('Choose a start and a destination.', '出発地と目的地を選んでください。', 'Start und Ziel wählen.', 'Выберите начало и цель.', 'Elige origen y destino.')) + '</span>';
        return;
      }
      if (s.request.state === 'error') { box.innerHTML = errorHTML(s.request.status); return; }
      const r = s.result;
      if (!r) { box.innerHTML = ''; return; }
      const a = (r.alternatives && r.alternatives[s.sel]) || r.alternatives && r.alternatives[0] || r;
      const startMs = departMs();
      if (r.transit) {
        const rt = CD().realtimeOf(a.legs || r.legs);
        box.innerHTML = '<b>' + esc(CD().duration(a.duration, opt())) + '</b>'
          + '<span class="rtp-sum-sub">' + esc((a.transfers || 0) + ' ' + L('transfers', '回乗換', 'Umst.', 'перес.', 'transb.'))
          + (a.startTime ? (' · ' + esc(CD().clock(a.startTime, opt()) + ' → ' + CD().clock(a.endTime, opt()))) : '')
          + ' · ' + esc(CD().realtimeText(rt, opt())) + '</span>';
      } else {
        box.innerHTML = '<b>' + esc(CD().duration(a.duration, opt())) + '</b>'
          + '<span class="rtp-sum-sub">' + esc(CD().distance(a.distance, opt()))
          + ' · ' + esc(L('arrive', '到着', 'Ankunft', 'прибытие', 'llegada') + ' ' + CD().eta(startMs, a.duration, opt())) + '</span>';
      }
    }
    function departMs() {
      const s = ST().get();
      if (s.when.kind === 'depart' && s.when.local) { const d = new Date(s.when.local); if (isFinite(d.getTime())) return d.getTime(); }
      if (s.when.kind === 'arrive' && s.when.local && s.result) { const d = new Date(s.when.local); if (isFinite(d.getTime())) return d.getTime() - (s.result.duration || 0) * 1000; }
      return Date.now();
    }

    /* ⚠ EVERY FAILURE HAS ITS OWN SENTENCE AND ITS OWN NEXT STEP (§22) — never one 「経路が見つかりません」 */
    function errorHTML(status) {
      const s = ST().get();
      const A = (act, lb) => '<button type="button" class="rtp-chip rtp-act" data-act="' + act + '">' + esc(lb) + '</button>';
      const retry = A('retry', L('Try again', '再試行', 'Erneut versuchen', 'Повторить', 'Reintentar'));
      const map = {
        rate_limited: [L('Too many requests to the routing service — wait a moment.', '経路サービスへのリクエストが多すぎます。少し待ってください。', 'Zu viele Anfragen an den Routingdienst.', 'Слишком много запросов к сервису.', 'Demasiadas solicitudes al servicio.'), retry],
        provider_timeout: [L('The routing service timed out.', '経路サービスがタイムアウトしました。', 'Zeitüberschreitung beim Routingdienst.', 'Тайм-аут сервиса маршрутов.', 'El servicio agotó el tiempo.'), retry],
        provider_unavailable: [L('The routing service is unreachable (outage or no network) — the route was NOT computed.', '経路サービスに接続できません（障害またはネットワーク）— 経路は計算されていません。', 'Routingdienst nicht erreichbar — die Route wurde NICHT berechnet.', 'Сервис маршрутов недоступен — маршрут НЕ рассчитан.', 'Servicio no disponible — la ruta NO se calculó.'), retry],
        no_transit: [L('No public-transit route here — this area may have no open timetable data.', 'この区間の公共交通経路がありません。公開時刻表データが未整備の可能性があります。', 'Keine ÖPNV-Verbindung — evtl. keine offenen Fahrplandaten.', 'Нет транзита — возможно, нет открытых расписаний.', 'Sin transporte público — puede faltar horario abierto.'), A('mode:driving', L('Try driving', '車で試す', 'Mit dem Auto', 'На авто', 'En coche')) + A('mode:walking', L('Try walking', '徒歩で試す', 'Zu Fuß', 'Пешком', 'A pie'))],
        no_route: [(s.result && s.result.snapKm) ? (L('One point is about ', '一方の地点が最寄りの経路可能な道路から約 ', 'Ein Punkt liegt etwa ', 'Точка примерно в ', 'Un punto está a unos ') + s.result.snapKm + L(' km from the nearest routable road.', ' km 離れています。', ' km von der nächsten Straße.', ' км от ближайшей дороги.', ' km de la vía más cercana.'))
          : L('There is no road connection between these points.', 'この2地点の間に陸路の接続がありません。', 'Keine Straßenverbindung zwischen diesen Punkten.', 'Между этими точками нет дороги.', 'No hay conexión por carretera.'),
        A('pickmap', L('Pick a point on the map', '地図から選ぶ', 'Punkt auf der Karte wählen', 'Выбрать на карте', 'Elegir en el mapa')) + A('mode:transit', L('Try transit', '公共交通で試す', 'ÖPNV versuchen', 'Транспорт', 'Transporte'))],
        invalid_request: [L('That request could not be understood by the routing service.', '経路サービスがこのリクエストを解釈できませんでした。', 'Der Routingdienst konnte die Anfrage nicht lesen.', 'Сервис не смог разобрать запрос.', 'El servicio no pudo interpretar la solicitud.'), retry],
      };
      const row = map[status] || map.provider_unavailable;
      const offline = (typeof navigator !== 'undefined' && navigator.onLine === false)
        ? ('<div class="rtp-note">' + esc(L('This device is offline.', 'この端末はオフラインです。', 'Dieses Gerät ist offline.', 'Устройство offline.', 'Este dispositivo está sin conexión.')) + '</div>') : '';
      return '<div class="rtp-err" role="alert"><span class="rtp-err-tx">' + esc(row[0]) + '</span>' + offline + '<div class="rtp-err-acts">' + row[1] + '</div></div>';
    }

    function renderRoutePane() {
      const s = ST().get(), pane = el.querySelector('#rtp-p-route');
      if (!s.result) { pane.innerHTML = emptyRouteHTML(); return; }
      const r = s.result;
      /* ⚠⚠⚠ (#R298) ONE ARRANGEMENT, WHATEVER THE COUNT — 「経路の選択肢からひとつをえらんだときに、
         詳細が経路候補一覧の下に表示されるのではなく、経路カードが広がって詳細が表示されるUIに。」
         #R296 answered that for two or more alternatives and left the OLD layout standing for one,
         reasoning that 「a card that is the only card is a heading, not a choice」. It is still a card,
         and one route is what most journeys come back with — so the arrangement the reader asked to
         be rid of was the one they saw most often. A list of one is a list; the card still opens. */
      const alts = (r.alternatives && r.alternatives.length) ? r.alternatives : [r];
      const detailFor = (a2) => (r.transit
        ? '<div class="rtp-legs">' + CD().legRows(a2.legs || r.legs, opt()) + '</div>'
        : '<div class="rtp-steps" role="list">' + CD().stepRows(a2.steps || r.steps || [], Object.assign(opt(), { maneuver: (x) => RT().maneuver(x), step: s.step })) + '</div>');
      let h = CD().altCards(alts, Object.assign(opt(), {
        sel: Math.max(0, Math.min(alts.length - 1, s.sel | 0)), setId: r.routeSetId, transit: !!r.transit, startMs: departMs(),
        detail: (i2, a2) => detailFor(a2),
      }));
      (s.notes || []).forEach((k) => { h += CD().note(k, Object.assign(opt(), { mode: s.mode })); });
      if (r.provider) h += CD().providerLine(r.provider, opt());
      pane.innerHTML = h;
    }
    /** (#R298) bring the chosen alternative into view — the section that holds it first, then the row */
    function revealSelected() {
      if (!el || el.hidden) return;
      if (tab !== 'route') { tab = 'route'; render(); }
      try {
        const card = el.querySelector('#rtp-p-route .rt-alt.on');
        if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
      } catch (_) { }
    }
    function emptyRouteHTML() {
      const s = ST().get();
      if (s.request.state === 'loading') return '<div class="rtp-skel"><i></i><i></i><i></i></div>';
      if (s.request.state === 'error') return '';
      return '<div class="rtp-empty">' + esc(L('Enter a start and a destination to see routes.', '出発地と目的地を入力すると経路が表示されます。', 'Start und Ziel eingeben.', 'Введите начало и цель.', 'Introduce origen y destino.')) + '</div>';
    }

    /* ══ OPTIONS ═════════════════════════════════════════════════════════════════════════════════ */
    function renderOptsPane() {
      const s = ST().get(), pane = el.querySelector('#rtp-p-opts');
      let h = '';
      if (PV().supports(s.mode, 'avoid')) {
        h += '<div class="rtp-group"><h3>' + esc(L('Avoid', '回避', 'Meiden', 'Избегать', 'Evitar')) + '</h3><div class="rtp-chips">'
          + [['toll', L('Tolls', '有料道路', 'Maut', 'Платные', 'Peajes')],
             ['motorway', L('Highways', '高速道路', 'Autobahn', 'Магистрали', 'Autopistas')],
             ['ferry', L('Ferries', 'フェリー', 'Fähren', 'Паромы', 'Ferris')]]
            .map(([k, lb]) => '<button type="button" class="rtp-chip rtp-av' + (s.avoid.indexOf(k) >= 0 ? ' on' : '') + '" data-av="' + k + '" aria-pressed="' + (s.avoid.indexOf(k) >= 0 ? 'true' : 'false') + '">' + esc(lb) + '</button>').join('')
          + '</div></div>';
      }
      if (PV().supports(s.mode, 'avoidAreas')) {
        const ar = RT().areas();
        h += '<div class="rtp-group"><h3>' + esc(L('Keep out of an area', '通過禁止範囲', 'Sperrfläche', 'Запретная зона', 'Zona prohibida')) + '</h3>'
          + '<p class="rtp-help">' + esc(L('Click two opposite corners on the map to draw a box the route may not enter.', '地図上で対角2点をクリックすると、経路が入らない矩形を作れます。', 'Zwei gegenüberliegende Ecken anklicken.', 'Кликните два противоположных угла на карте.', 'Haz clic en dos esquinas opuestas.')) + '</p>'
          + '<div class="rtp-chips"><button type="button" class="rtp-chip rtp-areadraw' + (RT().drawingArea() ? ' on' : '') + '">'
          + esc(RT().drawingArea() ? L('Click two corners… (Esc cancels)', '対角2点をクリック…（Escで中止）', 'Zwei Ecken klicken… (Esc)', 'Кликните два угла… (Esc)', 'Haz clic en dos esquinas… (Esc)') : L('Draw an area', '範囲を描く', 'Fläche zeichnen', 'Нарисовать зону', 'Dibujar zona')) + '</button></div>'
          + (ar.length ? ('<ul class="rtp-arealist">' + ar.map((a, i) => '<li><span>' + esc(L('Area ', '範囲 ', 'Fläche ', 'Зона ', 'Zona ') + (i + 1)) + '</span>'
            + '<button type="button" class="rtp-btn-ico rtp-areahl" data-i="' + i + '" aria-label="' + esc(L('Highlight this area', 'この範囲を強調', 'Fläche hervorheben', 'Подсветить зону', 'Resaltar zona')) + '"><span aria-hidden="true">◎</span></button>'
            + '<button type="button" class="rtp-btn-ico rtp-areadel" data-i="' + i + '" aria-label="' + esc(L('Remove this area', 'この範囲を削除', 'Fläche entfernen', 'Удалить зону', 'Quitar zona')) + '"><span aria-hidden="true">×</span></button></li>').join('') + '</ul>')
            : '<p class="rtp-help">' + esc(L('No areas drawn.', '範囲は未設定です。', 'Keine Flächen.', 'Зон нет.', 'Sin zonas.')) + '</p>')
          + '</div>';
      }
      if (s.mode === 'transit') {
        const on = s.transitModes || ST().TRANSIT_MODES;
        h += '<div class="rtp-group"><h3>' + esc(L('Use these services', '利用する交通手段', 'Diese Verkehrsmittel', 'Использовать', 'Usar estos servicios')) + '</h3><div class="rtp-chips">'
          + [['RAIL', L('Rail', '鉄道', 'Bahn', 'Ж/д', 'Tren')], ['SUBWAY', L('Subway', '地下鉄', 'U-Bahn', 'Метро', 'Metro')],
             ['TRAM', L('Tram', '路面電車', 'Straßenbahn', 'Трамвай', 'Tranvía')], ['BUS', L('Bus', 'バス', 'Bus', 'Автобус', 'Autobús')],
             ['FERRY', L('Ferry', 'フェリー', 'Fähre', 'Паром', 'Ferri')]]
            .map(([k, lb]) => { const isOn = on.indexOf(k) >= 0; const last = isOn && on.length === 1;
              return '<button type="button" class="rtp-chip rtp-tm' + (isOn ? ' on' : '') + '" data-tm="' + k + '" aria-pressed="' + (isOn ? 'true' : 'false') + '"'
                + (last ? (' aria-disabled="true" title="' + esc(L('At least one service has to stay selected — a transit route with nothing to ride is not a route.', '交通手段は最低1つ必要です（乗るものが無い公共交通経路は成立しません）。', 'Mindestens ein Verkehrsmittel muss bleiben.', 'Нужен хотя бы один вид транспорта.', 'Debe quedar al menos un servicio.')) + '"') : '')
                + '>' + esc(lb) + '</button>'; }).join('')
          + '</div></div>'
          + '<div class="rtp-group"><h3>' + esc(L('Most I will walk', '徒歩の上限', 'Maximaler Fußweg', 'Максимум пешком', 'Máximo a pie')) + '</h3><div class="rtp-chips">'
          + [0, 300, 800, 1500, 3000].map((m) => '<button type="button" class="rtp-chip rtp-mw' + ((s.maxWalkM || 0) === m ? ' on' : '') + '" data-mw="' + m + '" aria-pressed="' + ((s.maxWalkM || 0) === m ? 'true' : 'false') + '">'
            + esc(m ? CD().distance(m, opt()) : L('No limit', '制限なし', 'Kein Limit', 'Без ограничения', 'Sin límite')) + '</button>').join('')
          + '</div></div>';
      }
      /* what this mode CANNOT offer, said once rather than shown as dead buttons (§21) */
      const missing = [];
      if (!PV().supports(s.mode, 'liveTraffic')) missing.push(L('live traffic', 'リアルタイム交通量', 'Live-Verkehr', 'пробки', 'tráfico en vivo'));
      if (s.mode !== 'transit') missing.push(L('road incidents and closures', '事故・通行止め', 'Störungen und Sperrungen', 'ДТП и перекрытия', 'incidencias y cortes'));
      h += '<div class="rtp-group"><h3>' + esc(L('Not available', '未対応', 'Nicht verfügbar', 'Недоступно', 'No disponible')) + '</h3>'
        + '<p class="rtp-help">' + esc(L('No provider IntMap can use publishes ', 'IntMap が利用できるプロバイダーで公開されていないもの: ', 'Kein nutzbarer Anbieter liefert ', 'Ни один доступный провайдер не даёт ', 'Ningún proveedor disponible ofrece ') + missing.join(', ') + '.') + '</p></div>';
      pane.innerHTML = h;
    }

    /* ══ ANALYSIS — #R184's six, moved out of the way but not weakened (§15) ══════════════════════ */
    function renderAnaPane() {
      const s = ST().get(), pane = el.querySelector('#rtp-p-ana');
      if (!hasRoute()) { pane.innerHTML = '<div class="rtp-empty">' + esc(L('Compute a route first — these describe a route that exists.', '先に経路を計算してください（これらは既存の経路についての分析です）。', 'Zuerst eine Route berechnen.', 'Сначала рассчитайте маршрут.', 'Calcula una ruta primero.')) + '</div>'; return; }
      /* ⚠ 「max="2025"の固定値を廃止し、現在年またはデータ上限から動的に決定」 */
      const nowY = new Date().getUTCFullYear();
      const hy = pane.querySelector && pane.querySelector('.rtp-hyear');
      const keepYear = (hy && hy.value) || '1900';
      pane.innerHTML = '<div class="rtp-chips">'
        + [['elev', L('Elevation', '標高差', 'Höhe', 'Высоты', 'Desnivel')],
           ['borders', L('Borders', '国境', 'Grenzen', 'Границы', 'Fronteras')],
           ['along', L('Along the way', '沿道の状況', 'Unterwegs', 'По пути', 'Por el camino')],
           ['times', L('Arrival times', '到着時刻', 'Ankunftszeiten', 'Время прибытия', 'Horas de llegada')],
           ['diff', L('Where routes differ', '経路の差', 'Unterschiede', 'Различия', 'Diferencias')]]
          .map(([k, lb]) => '<button type="button" class="rtp-chip rtp-op" data-op="' + k + '">' + esc(lb) + '</button>').join('')
        + '</div>'
        + '<div class="rtp-group"><h3>' + esc(L('Historical network', '過去の路線網', 'Historisches Netz', 'Историческая сеть', 'Red histórica')) + '</h3>'
        + '<div class="rtp-chips">'
        + '<label class="rtp-inline"><span>' + esc(L('Year', '年', 'Jahr', 'Год', 'Año')) + '</span>'
        + '<input type="number" class="rtp-hyear" value="' + esc(keepYear) + '" min="1800" max="' + nowY + '" step="1"></label>'
        + '<select class="rtp-hkind" aria-label="' + esc(L('Network kind', '路線の種別', 'Netzart', 'Тип сети', 'Tipo de red')) + '">'
        + '<option value="rail">' + esc(L('Railways', '鉄道', 'Bahn', 'Ж/д', 'Ferrocarril')) + '</option>'
        + '<option value="road">' + esc(L('Roads', '道路', 'Straßen', 'Дороги', 'Carreteras')) + '</option></select>'
        + '<button type="button" class="rtp-chip rtp-op" data-op="hist">' + esc(L('Route on it', 'この年で計算', 'Berechnen', 'Проложить', 'Calcular')) + '</button>'
        + '</div>'
        + '<p class="rtp-help">' + esc(L('OpenStreetMap’s own record of when lines existed — not a historical atlas. Its date coverage is uneven, and the answer says how much of the route ran on dated line.', 'OpenStreetMap に記録された「いつ存在したか」に基づきます（歴史地図ではありません）。年代の記録には偏りがあり、経路のどれだけが年代付き路線を通るかを結果に表示します。', 'OSMs eigene Datierung, kein historischer Atlas.', 'Собственные даты OSM, не исторический атлас.', 'El registro de fechas de OSM, no un atlas histórico.')) + '</p></div>'
        + '<div class="rtp-opout" aria-live="polite"></div>';
    }

    /* ══ WIRING ══════════════════════════════════════════════════════════════════════════════════ */
    function wire() {
      el.querySelector('.rtp-closeb').addEventListener('click', close);
      el.querySelector('.rtp-minb').addEventListener('click', () => {
        if (isMob()) setDetent(ST().get().detent === 'min' ? 'mid' : 'min');
        else {
          /* ⚠ (#R298) MINIMISING HAS TO TAKE THE RESIZED HEIGHT OFF. `.rtp-min` hides every row but
             the header, and an inline `height:…!important` written by a resize is the one thing the
             stylesheet cannot override — so a minimised panel would have stayed a full-height empty
             rectangle. `restoreGeom` puts the stored size back on the way out. */
          const shrunk = el.classList.toggle('rtp-min');
          if (shrunk) el.style.removeProperty('height'); else restoreGeom();
          applyInsets();
        }
      });
      el.querySelectorAll('.rtp-mode').forEach((b) => b.addEventListener('click', () => {
        ST().setMode(b.getAttribute('data-m')); render(); schedule(0);
      }));
      el.querySelectorAll('.rtp-tab').forEach((b) => {
        b.addEventListener('click', () => { tab = b.getAttribute('data-tab'); render(); });
        b.addEventListener('keydown', (e) => {
          const ks = ['route', 'opts', 'ana'];
          /* ⚠ THE ARROW MOVES FROM THE FOCUSED TAB, NOT THE SELECTED ONE. Reading the module's `tab`
             here made ArrowRight on a focused-but-unselected tab jump to the neighbour of whatever
             was showing — which is not what a reader arrowing along a tablist means. */
          const i = ks.indexOf(b.getAttribute('data-tab'));
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            tab = ks[(i + (e.key === 'ArrowRight' ? 1 : ks.length - 1)) % ks.length];
            render();
            try { el.querySelector('.rtp-tab[data-tab="' + tab + '"]').focus(); } catch (_) { }
          }
        });
      });
      el.querySelector('.rtp-go').addEventListener('click', runNow);
      el.querySelector('.rtp-swap').addEventListener('click', () => { ST().swap(); render(); schedule(0); });
      el.querySelector('.rtp-addvia').addEventListener('click', () => {
        const i = ST().addVia(null); render();
        try { el.querySelector('.rtp-field[data-f="via:' + i + '"] input').focus(); } catch (_) { }
      });
      el.querySelector('.rtp-when-kind').addEventListener('change', (e) => { ST().setWhen(e.target.value, null); render(); schedule(0); });
      el.querySelector('.rtp-when-at').addEventListener('change', (e) => { ST().setWhen(ST().get().when.kind, e.target.value); schedule(0); });
      el.querySelectorAll('.rtp-exp').forEach((b) => b.addEventListener('click', () => { try { RT().exportRoute(b.getAttribute('data-f')); } catch (_) { } }));
      el.querySelector('.rtp-share').addEventListener('click', () => {
        try {
          const d = window.IntMapRouteExport.describe(ST().get());
          if (d) toast(L('The link includes the places in this route: ', 'このリンクには経路の地点が含まれます: ', 'Der Link enthält die Orte dieser Route: ', 'Ссылка содержит места маршрута: ', 'El enlace incluye los lugares de la ruta: ') + d.from + ' → ' + d.to);
          window.IntMapShare.open();
        } catch (_) { }
      });
      el.querySelector('.rtp-clear').addEventListener('click', clearRoute);

      /* one delegated listener for everything the panes rebuild — no listener can survive a render
         and fire twice (§18 「再描画ごとのイベント重複を防ぐ」) */
      el.addEventListener('click', onClick);
      el.addEventListener('input', onInput, true);
      el.addEventListener('keydown', onKey, true);
      el.addEventListener('focusout', (e) => {
        if (!sug || sug.hidden) return;
        setTimeout(() => { try { if (!el.contains(document.activeElement)) closeSuggest(); } catch (_) { } }, 0);
      });
      /* stops reorder by drag (§5.2), with the keyboard buttons doing the same thing */
      el.addEventListener('dragstart', (e) => { const f = e.target.closest && e.target.closest('.rtp-field[draggable]'); if (!f) return; e.dataTransfer.setData('text/plain', f.dataset.f); f.classList.add('drag'); });
      el.addEventListener('dragover', (e) => { if (e.target.closest && e.target.closest('.rtp-field')) e.preventDefault(); });
      el.addEventListener('drop', (e) => {
        const t = e.target.closest && e.target.closest('.rtp-field'); if (!t) return;
        e.preventDefault();
        const src = e.dataTransfer.getData('text/plain');
        const gi = (k) => /^via:(\d+)$/.test(k) ? +RegExp.$1 : (k === 'from' ? -1 : 1e9);
        const a = gi(src), b = gi(t.dataset.f);
        if (a >= 0 && a < 1e9) { ST().moveVia(a, Math.max(0, Math.min(ST().get().via.length - 1, b === 1e9 ? ST().get().via.length - 1 : (b < 0 ? 0 : b)))); render(); schedule(0); }
        el.querySelectorAll('.rtp-field.drag').forEach((x) => x.classList.remove('drag'));
      });
      makeSheet();
      enableWindowing();   /* (#R298) the header is new after a language rebuild — see enableWindowing */
    }

    function onClick(e) {
      const t = e.target;
      const q = (sel) => t.closest && t.closest(sel);
      const field = q('.rtp-field');
      const which = field ? field.dataset.f : null;
      if (q('.rtp-x')) { ST().setText(which, ''); ST().setPlace(which, null); render(); try { field.querySelector('input').focus(); } catch (_) { } return; }
      if (q('.rtp-here')) { useHere(which); return; }   /* (#R296) the caller `useHere` never had */
      if (q('.rtp-pick')) { startPickFor(which); return; }
      if (q('.rtp-del')) { ST().removeVia(+which.split(':')[1]); render(); schedule(0); return; }
      if (q('.rtp-up')) { const i = +which.split(':')[1]; ST().moveVia(i, i - 1); render(); schedule(0); try { el.querySelector('.rtp-field[data-f="via:' + Math.max(0, i - 1) + '"] .rtp-up').focus(); } catch (_) { } return; }
      if (q('.rtp-down')) { const i = +which.split(':')[1]; ST().moveVia(i, i + 1); render(); schedule(0); try { el.querySelector('.rtp-field[data-f="via:' + Math.min(ST().get().via.length - 1, i + 1) + '"] .rtp-down').focus(); } catch (_) { } return; }
      const av = q('.rtp-av'); if (av) { const k = av.getAttribute('data-av'); ST().setAvoid(k, ST().get().avoid.indexOf(k) < 0); render(); schedule(250); return; }
      const tm = q('.rtp-tm');
      if (tm) {
        const k = tm.getAttribute('data-tm');
        const cur = (ST().get().transitModes || ST().TRANSIT_MODES).slice();
        const i = cur.indexOf(k);
        if (i >= 0) { if (cur.length === 1) { toast(L('At least one service has to stay selected.', '交通手段は最低1つ必要です。', 'Mindestens eines muss bleiben.', 'Нужен хотя бы один.', 'Debe quedar al menos uno.')); return; } cur.splice(i, 1); }
        else cur.push(k);
        ST().setTransitModes(cur.length === ST().TRANSIT_MODES.length ? null : cur); render(); schedule(250); return;
      }
      const mw = q('.rtp-mw'); if (mw) { ST().setMaxWalk(+mw.getAttribute('data-mw')); render(); schedule(250); return; }
      if (q('.rtp-areadraw')) {
        if (RT().drawingArea()) { RT().endAreaDraw(); render(); return; }
        RT().startAreaDraw((ev) => {
          if (ev.phase === 'too-small') toast(L('That box is too small to keep a route out of — draw a larger one.', 'その範囲は小さすぎて経路を締め出せません。もう少し大きく描いてください。', 'Diese Fläche ist zu klein.', 'Эта зона слишком мала.', 'Esa zona es demasiado pequeña.'));
          render(); if (ev.phase === 'done') schedule(0);
        });
        render(); return;
      }
      const ah = q('.rtp-areahl'); if (ah) { RT().highlightArea(+ah.getAttribute('data-i')); return; }
      const ad = q('.rtp-areadel'); if (ad) { RT().removeArea(+ad.getAttribute('data-i')); render(); schedule(0); return; }
      /* ⚠ THE CARD AND THE STEP ARE DRAWN BY js/routing-cards.js, SO THEY WEAR ITS PREFIX.
         Written `.rtp-alt` here — this file's own prefix — the branch simply never matched and a tap
         on an alternative did nothing at all. It is the same one-character class mismatch that left
         the honest notes unstyled two hours earlier; both were found by a test rather than by eye. */
      /* ⚠⚠ (#R296) THE STEP IS TESTED FIRST, BECAUSE IT IS NOW INSIDE THE CARD. The turn list used to
         be a sibling of the card list, so the order of these two branches could not matter; with the
         detail nested in the selected card, `closest('.rt-alt')` matches for a press on a STEP as well,
         and testing the card first would swallow every turn press — re-selecting the alternative that
         was already selected and re-rendering, which looks exactly like 「押しても何も起きない」. */
      const st = q('.rt-step'); if (st) { const i = +st.getAttribute('data-si'); ST().setStep(i); try { RT().selectStep(ST().get().routeSetId, i); } catch (_) { } render(); return; }
      const alt = q('.rt-alt'); if (alt) { const i = +alt.getAttribute('data-ai'); ST().setSel(i); try { RT().selectAlt(i, ST().get().routeSetId); } catch (_) { } render(); return; }
      const act = q('.rtp-act'); if (act) { onAction(act.getAttribute('data-act')); return; }
      const op = q('.rtp-op'); if (op) { runOp(op.getAttribute('data-op')); return; }
    }
    function onAction(a) {
      if (a === 'retry') { schedule(0); return; }
      if (a === 'pickmap') { startPickFor('to'); return; }
      if (/^mode:/.test(a)) { ST().setMode(a.split(':')[1]); render(); schedule(0); }
    }
    function onInput(e) {
      const f = e.target.closest && e.target.closest('.rtp-field');
      if (!f || !e.target.classList.contains('rtp-in')) return;
      const which = f.dataset.f;
      ST().setText(which, e.target.value);          /* ⚠ this invalidates the coordinate (§4.4) */
      f.classList.remove('ok');
      askSuggest(which, e.target);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        /* ⚠ ESCAPE IS A LADDER (§19): candidates → map picking → area drawing → the panel */
        if (sug && !sug.hidden) { e.stopPropagation(); closeSuggest(); return; }
        if (RT().picking()) { e.stopPropagation(); RT().endPick(); ST().setPick(null); render(); return; }
        if (RT().drawingArea()) { e.stopPropagation(); RT().endAreaDraw(); render(); return; }
        e.stopPropagation(); close(); return;
      }
      const inp = e.target.closest && e.target.closest('.rtp-in');
      if (!inp) return;
      if (!sug || sug.hidden) {
        if (e.key === 'ArrowDown') { e.preventDefault(); askSuggest(e.target.closest('.rtp-field').dataset.f, inp); }
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!sugItems.length) return;
        sugIdx = (sugIdx + (e.key === 'ArrowDown' ? 1 : sugItems.length - 1) + sugItems.length) % sugItems.length;
        showSuggest(inp, sugItems, '');
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (sugItems.length) chooseSuggestion(sugIdx >= 0 ? sugIdx : 0);
        return;
      }
      if (e.key === 'Tab' && sugItems.length && sugIdx >= 0) { chooseSuggestion(sugIdx); }
    }
    function startPickFor(which) {
      ST().setPick(which);
      toast(L('Click the map to set this point. Esc cancels.', '地図をクリックしてこの地点を指定します。Escで中止。', 'Karte anklicken. Esc bricht ab.', 'Кликните по карте. Esc — отмена.', 'Haz clic en el mapa. Esc cancela.'));
      RT().startPick(which, (g, tgt) => {
        /* ⚠ the reverse-geocoded NAME arrives later and must not overwrite a field the reader has
           moved on from (#R126 §6.6) — `_rename` marks the second call */
        const cur = ST().field(tgt);
        if (g._rename) { if (cur && cur.place && Math.abs(cur.place.lng - g._rename.lng) < 1e-9) { ST().setPlace(tgt, { lng: g.lng, lat: g.lat, name: g.name, admin: g.admin, kind: g.kind }); renderFields(); } return; }
        ST().setPlace(tgt, g); ST().setPick(null); render(); schedule(0);
      });
    }

    /* ══ RECOMPUTE ═══════════════════════════════════════════════════════════════════════════════
       ⚠ NEVER ON A KEYSTROKE (§23). Only a CONFIRMED change of a resolved point or of an option
       starts a request, the previous one is cancelled by js/routing.js's requestId, and an identical
       request inside the same second is not re-sent at all. */
    function schedule(ms) {
      if (recomputeTimer) clearTimeout(recomputeTimer);
      recomputeTimer = setTimeout(recompute, ms || 0);
    }
    /** ⚠⚠ (#R298) THE PRESS IS A NEW QUESTION, so it steps over the 1.5 s identical-request guard.
       That guard is right for a RE-RENDER — redrawing the same cards is not a new request — and
       wrong for a button: a reader who presses 「経路を検索」 and watches nothing happen has met
       exactly the 「押しても何も起きない」 shape #R268 counted three times in one round. Clearing
       `lastKey` is the same door `clearRoute` already uses, for the same reason. */
    function runNow() {
      if (!ST()._pure.ready(ST().get())) { render(); return; }
      closeSuggest();
      lastKey = '';
      schedule(0);
    }
    let lastAt = 0;
    async function recompute() {
      const s = ST().get();
      if (!ST()._pure.ready(s)) { lastKey = ''; render(); return; }
      const req = ST().requestOptions(tz());
      if (!req) return;
      const key = JSON.stringify([req.from, req.to, req.opts]);
      if (key === lastKey && Date.now() - lastAt < 1500 && s.request.state !== 'error') { render(); return; }
      lastKey = key; lastAt = Date.now();
      render();
      try { await RT().route(req.from, req.to, req.opts); } catch (_) { }
      applyInsets();
      render();
    }

    /* ══ THE ANALYSES ════════════════════════════════════════════════════════════════════════════ */
    function opOut(html) { const b = el.querySelector('.rtp-opout'); if (b) b.innerHTML = html; }
    function opCoords() { try { const rc = RT().routeCoords(); return (rc && rc.coords && rc.coords.length > 1) ? rc.coords : null; } catch (_) { return null; } }
    const mfmt = (v) => (v == null || !isFinite(v)) ? '—' : CD().distance(v, opt());
    async function runOp(k) {
      const O = window.IntMapRoutingOps;
      if (!O) { opOut('<div class="rtp-err">' + esc(L('The analyses did not load.', '分析モジュールを読み込めませんでした。', 'Analysen nicht geladen.', 'Модуль анализа не загружен.', 'Los análisis no se cargaron.')) + '</div>'); return; }
      if (opsBusy) return;
      const coords = opCoords();
      if (k !== 'hist' && !coords) { opOut('<div class="rtp-empty">' + esc(L('Compute a route first.', '先に経路を計算してください。', 'Zuerst eine Route berechnen.', 'Сначала рассчитайте маршрут.', 'Calcula una ruta primero.')) + '</div>'); return; }
      opsBusy = k; opOut('<div class="rtp-busy">…</div>');
      try {
        if (k === 'elev') {
          const e = await O.elevation(coords);
          opOut((!e || e.err)
            ? '<div class="rtp-err">' + esc(L('No elevation data for this route yet.', 'この経路の標高データを取得できませんでした。', 'Keine Höhendaten.', 'Нет данных о высотах.', 'Sin datos de elevación.')) + '</div>'
            : '<h4>' + esc(L('Elevation', '標高差', 'Höhe', 'Высоты', 'Desnivel')) + '</h4>'
            + '<p>▲ ' + esc(mfmt(e.ascentM)) + ' · ▼ ' + esc(mfmt(e.descentM)) + ' · ' + esc(L('net', '正味', 'netto', 'итог', 'neto')) + ' ' + ((e.netM >= 0 ? '+' : '') + Math.round(e.netM)) + ' m</p>'
            + '<p>' + esc(L('Highest', '最高', 'Höchster', 'Максимум', 'Máximo')) + ' ' + Math.round(e.maxM) + ' m · ' + esc(L('lowest', '最低', 'niedrigster', 'минимум', 'mínimo')) + ' ' + Math.round(e.minM) + ' m · '
            + esc(L('steepest', '最急勾配', 'steilster', 'макс. уклон', 'más empinado')) + ' ' + e.maxGradePct.toFixed(1) + '%</p>'
            + '<p class="rtp-help">' + esc(L('Terrarium DEM z' + e.demZoom + ', ' + e.samples + ' samples; changes under ' + e.noiseFloorM + ' m are ignored as sampling noise' + (e.missing ? (', ' + e.missing + ' without data') : '') + '. This is an ANALYSIS of the route — the route itself was not costed on elevation.',
              'Terrarium DEM z' + e.demZoom + '・' + e.samples + '点。' + e.noiseFloorM + 'm 未満の変化はサンプリング誤差として除外' + (e.missing ? ('・' + e.missing + '点は欠測') : '') + '。これは経路の「標高分析」であり、経路計算に標高は反映されていません。',
              'Terrarium-DEM z' + e.demZoom + ', ' + e.samples + ' Proben — eine Analyse, keine Kostenfunktion.',
              'Terrarium DEM z' + e.demZoom + ', ' + e.samples + ' проб — это анализ, а не стоимость маршрута.',
              'DEM Terrarium z' + e.demZoom + ', ' + e.samples + ' muestras — un análisis, no un coste de ruta.')) + '</p>');
        } else if (k === 'borders') {
          const b = O.borders(coords);
          opOut((!b || b.err)
            ? '<div class="rtp-err">' + esc(L('Country outlines are not loaded yet — open the Countries tab once and try again.', '国境データが未読み込みです。Countries タブを一度開いてから再試行してください。', 'Ländergrenzen noch nicht geladen.', 'Границы стран ещё не загружены.', 'Contornos de países no cargados.')) + '</div>'
            : '<h4>' + esc(L('Border crossings', '国境通過', 'Grenzübertritte', 'Пересечения границ', 'Cruces de frontera')) + ': ' + b.count + '</h4>'
            + (b.segments.length ? ('<p>' + b.segments.map((sg) => esc(sg.name) + ' <span class="rtp-dim">' + esc(mfmt(sg.m)) + '</span>').join(' → ') + '</p>') : '')
            + '<p class="rtp-help">' + esc(L('From the app’s own country outlines, sampled every ' + b.sampleStepM + ' m. They are simplified for drawing, so a very short transit can be the outline’s resolution rather than a real crossing — the length beside each country is what tells them apart.',
              'アプリの国境ポリゴンを ' + b.sampleStepM + ' m 間隔で判定。描画用に簡略化された境界のため、ごく短い通過は実際の越境ではなく境界の解像度である可能性があります。',
              'Aus den Ländergrenzen der App, alle ' + b.sampleStepM + ' m abgetastet; sie sind vereinfacht.',
              'По контурам стран приложения, шаг ' + b.sampleStepM + ' м; они упрощены.',
              'Desde los contornos de la app, cada ' + b.sampleStepM + ' m; están simplificados.')) + '</p>');
        } else if (k === 'along') {
          const s = ST().get();
          const a = await O.along(coords, { durationS: (s.result && s.result.duration) || 0, departMs: departMs() });
          const wx = a.probes.map((p) => {
            const t = (p.wx && p.wx.tempC != null) ? (Math.round(p.wx.tempC) + ' °C') : '—';
            const w = (p.wx && p.wx.windKmh != null) ? (' · ' + Math.round(p.wx.windKmh) + ' km/h') : '';
            const pc = (p.wx && p.wx.precip > 0) ? (' · ' + p.wx.precip.toFixed(1) + ' mm') : '';
            return '<li><span class="rtp-dim">' + esc(mfmt(p.atM)) + ' · ' + esc(CD().clock(p.etaMs, opt())) + '</span> ' + esc(t + w + pc) + '</li>';
          }).join('');
          const noWx = a.probes.filter((p) => !p.wx).length;
          opOut('<h4>' + esc(L('Weather along the way', '沿道の天気', 'Wetter unterwegs', 'Погода по пути', 'Tiempo por el camino')) + '</h4>'
            + '<ul class="rtp-list">' + wx + '</ul>'
            + (noWx ? ('<p class="rtp-help">' + esc(noWx + L(' of the points returned no forecast (the shared weather client is rate-limited); the others are real.', ' 地点で予報を取得できませんでした（共有の天気クライアントが制限中）。他の地点は実データです。', ' Punkte ohne Vorhersage.', ' точек без прогноза.', ' puntos sin previsión.')) + '</p>') : '')
            + (a.quakes.length ? ('<h4>' + esc(L('Earthquakes near the route (last 24 h)', '経路付近の地震（24時間）', 'Erdbeben nahe der Route', 'Землетрясения рядом', 'Sismos cerca')) + '</h4><ul class="rtp-list">'
              + a.quakes.map((x) => '<li>M' + (x.mag || 0).toFixed(1) + ' ' + esc(String(x.place || '')) + ' <span class="rtp-dim">' + Math.round(x.km) + ' km</span></li>').join('') + '</ul>') : '')
            + (a.news.length ? ('<h4>' + esc(L('News along the route', '経路沿いのニュース', 'Nachrichten entlang der Route', 'Новости по маршруту', 'Noticias en la ruta')) + '</h4><ul class="rtp-list">'
              + a.news.map((x) => '<li><span class="rtp-dim">' + Math.round(x.km) + ' km</span> ' + esc(x.title) + '</li>').join('') + '</ul>') : '')
            + '<p class="rtp-help">' + esc(L('“Near the route” means within 250 km for earthquakes and 60 km for geolocated news, measured to the nearest sample point.', '「経路付近」は、地震は250km以内、位置付きニュースは60km以内（最寄りの標本点からの距離）です。', '„Nahe der Route“: 250 km für Beben, 60 km für Nachrichten.', '«Рядом»: 250 км для землетрясений, 60 км для новостей.', '«Cerca»: 250 km sismos, 60 km noticias.')) + '</p>');
        } else if (k === 'times') {
          const s = ST().get();
          const durs = (s.result && s.result.legDurations) || [(s.result && s.result.duration) || 0];
          const sc = O.schedule(durs, { timeMs: (s.when.kind === 'arrive' && s.when.local) ? new Date(s.when.local).getTime() : departMs(), arriveBy: s.when.kind === 'arrive' });
          const names = [(s.from.place && s.from.place.name) || 'A'].concat(s.via.map((v, i) => (v.place && v.place.name) || ('#' + (i + 1))), [(s.to.place && s.to.place.name) || 'B']);
          opOut('<h4>' + esc(L('Arrival times', '到着時刻', 'Ankunftszeiten', 'Время прибытия', 'Horas de llegada')) + '</h4>'
            + (s.when.kind === 'arrive' ? ('<p class="rtp-help">' + esc(L('Working back from the arrival deadline.', '到着時刻から逆算しています。', 'Rückwärts von der Ankunft.', 'Отсчёт назад от прибытия.', 'Hacia atrás desde la llegada.')) + '</p>') : '')
            + '<ul class="rtp-list">' + sc.points.map((p, i) => '<li><span class="rtp-dim">' + esc(CD().clock(p.tMs, opt())) + '</span> ' + esc(names[i] || ('#' + i)) + '</li>').join('') + '</ul>');
        } else if (k === 'diff') {
          const alts = RT().alts();
          if (!alts || alts.length < 2) { opOut('<div class="rtp-empty">' + esc(L('Only one route was returned — there is nothing to compare.', '経路が1本のみのため比較できません。', 'Nur eine Route — nichts zu vergleichen.', 'Только один маршрут.', 'Solo una ruta.')) + '</div>'); }
          else {
            const d = O.highlightDifferences(alts);
            opOut('<h4>' + esc(L('Where the routes differ', '経路が分かれる区間', 'Wo sich die Routen unterscheiden', 'Где маршруты расходятся', 'Dónde difieren las rutas')) + '</h4>'
              + '<ul class="rtp-list">' + d.per.map((p) => '<li><span class="rtp-swatch" style="background:' + esc(p.color) + ';"></span>'
                + esc((alts[p.i].label || ('#' + (p.i + 1))) + ' — ' + mfmt(p.uniqueM) + ' ' + L('not shared', 'が非共通', 'abweichend', 'не общий', 'no compartido') + ' (' + p.segments + ')') + '</li>').join('') + '</ul>'
              + '<p class="rtp-help">' + esc(L('Lines closer than ' + d.sameThresholdM + ' m count as the same road.', '距離 ' + d.sameThresholdM + ' m 以内は同一の道とみなします。', 'Linien unter ' + d.sameThresholdM + ' m gelten als dieselbe Straße.', 'Линии ближе ' + d.sameThresholdM + ' м — одна дорога.', 'Líneas a menos de ' + d.sameThresholdM + ' m son la misma vía.')) + '</p>');
          }
        } else if (k === 'hist') {
          const s = ST().get();
          if (!s.from.place || !s.to.place) { opOut('<div class="rtp-empty">' + esc(L('Choose a start and a destination.', '出発地と目的地を選んでください。', 'Start und Ziel wählen.', 'Выберите начало и цель.', 'Elige origen y destino.')) + '</div>'); }
          else {
            const nowY = new Date().getUTCFullYear();
            let y = parseInt((el.querySelector('.rtp-hyear') || {}).value, 10) || 1900;
            y = Math.max(1800, Math.min(nowY, y));
            const kind = (el.querySelector('.rtp-hkind') || {}).value || 'rail';
            const h = await O.historicalRoute(s.from.place, s.to.place, { year: y, kind: kind });
            if (!h || h.err) {
              const M = {
                'too-far': L('That is too far for a historical-network search (max ' + ((h && h.maxKm) || 400) + ' km apart).', 'この距離は過去路線網の検索範囲を超えています（直線距離で最大 ' + ((h && h.maxKm) || 400) + ' km）。', 'Zu weit für die historische Netzsuche.', 'Слишком далеко для поиска по исторической сети.', 'Demasiado lejos para la búsqueda histórica.'),
                empty: L('OpenStreetMap has no ' + (kind === 'rail' ? 'railway' : 'road') + ' recorded here for ' + y + '.', 'この地域には ' + y + ' 年の' + (kind === 'rail' ? '鉄道' : '道路') + 'の記録が OpenStreetMap にありません。', 'OSM kennt hier für ' + y + ' nichts.', 'В OSM нет записей за ' + y + ' год.', 'OSM no tiene registros para ' + y + '.'),
                'no-network': L('The nearest recorded line is ' + (h && h.snapKm) + ' km from an endpoint — too far to start from.', '最寄りの記録された路線が端点から ' + (h && h.snapKm) + ' km 離れており、起点にできません。', 'Nächste Linie ' + (h && h.snapKm) + ' km entfernt.', 'Ближайшая линия в ' + (h && h.snapKm) + ' км.', 'La línea más cercana está a ' + (h && h.snapKm) + ' km.'),
                disconnected: L('The network that existed in ' + y + ' does not connect these two places.', 'この2地点は ' + y + ' 年の路線網ではつながっていません。', 'Das Netz von ' + y + ' verbindet diese Orte nicht.', 'Сеть ' + y + ' года не соединяет эти пункты.', 'La red de ' + y + ' no conecta estos lugares.'),
                overpass: L('OpenStreetMap could not be reached.', 'OpenStreetMap に接続できませんでした。', 'OpenStreetMap nicht erreichbar.', 'OpenStreetMap недоступен.', 'No se pudo contactar con OpenStreetMap.'),
              };
              opOut('<div class="rtp-err">' + esc(M[h && h.err] || L('No historical route found.', '過去の経路が見つかりませんでした。', 'Keine historische Route.', 'Исторический маршрут не найден.', 'Sin ruta histórica.')) + '</div>');
            } else {
              O.drawHistorical(h);
              opOut('<h4>' + esc(L('On the ' + y + ' network', '（' + y + ' 年の路線網）', 'Netz ' + y, 'Сеть ' + y + ' года', 'Red de ' + y)) + '</h4>'
                + '<p>' + esc(mfmt(h.lengthM) + ' · ' + h.ways + ' ' + L('ways in the corridor', '区間（走査範囲）', 'Wege im Korridor', 'участков в коридоре', 'tramos en el corredor')) + '</p>'
                + '<p class="rtp-help">' + esc(L(
                  'Of the route itself, ' + h.onRouteDatedPct + '% runs on line that OpenStreetMap actually dates; ' + h.onRoute.assumedGone + ' of ' + h.onRoute.checked + ' sampled points are on line recorded as closed but undated, and ' + h.onRoute.assumedLive + ' on line still there today but undated. This is OpenStreetMap’s record, not a historical atlas.',
                  'この経路自体のうち ' + h.onRouteDatedPct + '% が、OpenStreetMap に年代の記録がある路線を通ります。標本 ' + h.onRoute.checked + ' 点のうち ' + h.onRoute.assumedGone + ' 点は「廃止だが年代不明」、' + h.onRoute.assumedLive + ' 点は「現存するが年代不明」です。これは OpenStreetMap の記録であって歴史地図ではありません。',
                  h.onRouteDatedPct + '% der Route liegt auf datierter Linie (OSM-Daten, kein historischer Atlas).',
                  h.onRouteDatedPct + '% маршрута — по линии с датой в OSM (данные OSM, не атлас).',
                  'El ' + h.onRouteDatedPct + '% de la ruta va por línea con fecha en OSM (datos de OSM, no un atlas).')) + '</p>');
            }
          }
        }
      } catch (e) { opOut('<div class="rtp-err">' + esc(String((e && e.message) || e)) + '</div>'); }
      opsBusy = '';
    }

    /* ══ THE MOBILE SHEET (§3.2) ═════════════════════════════════════════════════════════════════
       Three detents. `min` shows the summary only, `mid` shows the fields and the options, `full`
       shows everything — and only `full` takes the map's pointer, so panning still works underneath
       at the two smaller sizes. */
    function setDetent(d) {
      if (!el) return;
      ST().setDetent(d);
      el.setAttribute('data-detent', d);
      applyInsets();
    }
    function makeSheet() {
      const grip = el.querySelector('.rtp-grip');
      if (!grip) return;
      let y0 = 0, h0 = 0, dragging = false;
      const order = ['min', 'mid', 'full'];
      grip.addEventListener('pointerdown', (e) => {
        if (!isMob()) return;
        dragging = true; y0 = e.clientY; h0 = el.getBoundingClientRect().height;
        el.classList.add('rtp-drag'); try { grip.setPointerCapture(e.pointerId); } catch (_) { }
      });
      grip.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const h = Math.max(96, Math.min(window.innerHeight * 0.92, h0 - (e.clientY - y0)));
        el.style.height = h + 'px';
      });
      const end = () => {
        if (!dragging) return;
        dragging = false; el.classList.remove('rtp-drag');
        const h = el.getBoundingClientRect().height, vh = window.innerHeight;
        el.style.height = '';
        setDetent(h < vh * 0.28 ? 'min' : h < vh * 0.62 ? 'mid' : 'full');
      };
      grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
      grip.addEventListener('keydown', (e) => {
        const i = order.indexOf(ST().get().detent);
        if (e.key === 'ArrowUp') { e.preventDefault(); setDetent(order[Math.min(order.length - 1, i + 1)]); }
        if (e.key === 'ArrowDown') { e.preventDefault(); setDetent(order[Math.max(0, i - 1)]); }
      });
      grip.addEventListener('click', () => { const i = order.indexOf(ST().get().detent); setDetent(order[(i + 1) % order.length]); });
      /* ⚠ 「キーボード表示時に入力欄が隠れない」 — the visual viewport shrinks under the on-screen
         keyboard and a `position:fixed` sheet does NOT follow it, so the field being typed into ends
         up behind the keys. The offset is applied as a CSS variable the sheet is translated by. */
      try {
        const vv = window.visualViewport;
        if (vv) {
          const follow = () => {
            const lift = Math.max(0, (window.innerHeight - vv.height - vv.offsetTop));
            el.style.setProperty('--rtp-kb', lift + 'px');
            if (lift > 120 && isMob()) setDetent('full');
          };
          vv.addEventListener('resize', follow); vv.addEventListener('scroll', follow);
        }
      } catch (_) { }
    }

    /* ══ ⚠⚠⚠ (#R298) THE DESKTOP PANEL MOVES AND RESIZES — 「移動もリサイズも何もかもできないとかクソ」
       MEASURED before writing this: js/routing.js line 23 binds `HOST.bringToFront` and
       `HOST.makeDraggable` and uses NEITHER — zero call sites — and this file never named them at
       all. #R291 wrote the panel as 「a docked panel, not a draggable box」 and that reading is what
       the reader has now answered: a window pinned at left:14px/top:74px with a clamped width covers
       the part of the map a journey is being planned across, and nothing could be done about it.
       ⚠ THE HELPERS ARE THE APP'S OWN (js/window-manager.js), not new ones — so this panel joins the
       same register every other floating window is in: click-to-front among windows, drag by the
       header, resize from any edge with no visible grab-mark, and the sidebar still covers it.
       ⚠ THE PHONE IS UNCHANGED. There it is the three-detent bottom sheet `makeSheet()` builds
       (§3.2); a sheet that could also be dragged sideways is two gestures fighting one surface. */
    /* ⚠ THE FLOOR IS NOT 「as small as the helper allows」 (its default is 220×130). MEASURED on the
       desktop panel: header 48 + the pinned form 300 + tabs 35 + footer 47 = 430 px before a single
       route is drawn, and `.rtp` clips what does not fit — at 130 px the footer and half the form
       would be behind the edge with no way to reach them. 360 keeps the form and the footer usable,
       and css/intmap.css lets the pinned block scroll inside itself for the last of it. */
    const GEOM_KEY = 'im.rtp.geom';
    const MIN_W = 320, MIN_H = 360;
    function enableWindowing() {
      if (!el || isMob()) return;
      try {
        /* re-bound after every shell rebuild: a language switch replaces the header element, and a
           handler on the old one moves nothing. `addEdgeResize` and `registerWindow` guard themselves. */
        const head = el.querySelector('.rtp-head');
        if (head && typeof HOST.makeDraggable === 'function') HOST.makeDraggable(el, head);
        if (typeof HOST.addEdgeResize === 'function') HOST.addEdgeResize(el, { min: [MIN_W, MIN_H] });
      } catch (_) { }
      if (wmOn) return;
      wmOn = true;
      /* ⚠ THERE IS NO 「the gesture ended」 EVENT. Both helpers write inline left/top/width/height, so
         the geometry is read back from the attribute that changed, debounced — which also catches a
         resize that ends outside the panel. */
      try {
        geomObs = new MutationObserver(() => { if (geomT) clearTimeout(geomT); geomT = setTimeout(saveGeom, 400); });
        geomObs.observe(el, { attributes: true, attributeFilter: ['style'] });
      } catch (_) { }
      try { window.addEventListener('resize', clampGeom); } catch (_) { }
    }
    function geomBox() {
      const op = (el && el.offsetParent) || document.documentElement;
      return { w: op.clientWidth || window.innerWidth, h: op.clientHeight || window.innerHeight };
    }
    /* ⚠ INLINE !important, exactly as js/window-manager.js writes its own moves: anything weaker
       loses to `width:clamp(…)` in the stylesheet, and on a phone to the sheet rules. */
    function applyGeom(g) {
      const b = geomBox();
      /* ⚠⚠ A MINIMISED PANEL HAS NO HEIGHT OF ITS OWN. `.rtp-min` hides everything but the header, so
         an inline height left over from a resize would leave an empty box the size of the open panel
         — and inline `!important` is exactly what a stylesheet cannot take back. The stored size is
         kept (see `saveGeom`) and written again when the panel is restored. */
      const shrunk = el.classList.contains('rtp-min');
      const w = Math.max(MIN_W, Math.min(Math.max(MIN_W, b.w - 12), Math.round(+g.w) || MIN_W));
      const h = shrunk ? Math.max(1, Math.round(+g.h) || 1)
        : Math.max(MIN_H, Math.min(Math.max(MIN_H, b.h - 12), Math.round(+g.h) || MIN_H));
      const l = Math.max(6, Math.min(Math.max(6, b.w - w - 6), Math.round(+g.l) || 0));
      const t = Math.max(6, Math.min(Math.max(6, b.h - h - 6), Math.round(+g.t) || 0));
      el.style.setProperty('width', w + 'px', 'important');
      if (shrunk) el.style.removeProperty('height');
      else el.style.setProperty('height', h + 'px', 'important');
      el.style.setProperty('left', l + 'px', 'important');
      el.style.setProperty('top', t + 'px', 'important');
      el.style.setProperty('right', 'auto', 'important');
      el.style.setProperty('bottom', 'auto', 'important');
      el.setAttribute('data-dragged', '1');
    }
    function stripGeom() {
      if (!el) return;
      ['width', 'height', 'left', 'top', 'right', 'bottom'].forEach((k) => { try { el.style.removeProperty(k); } catch (_) { } });
      el.removeAttribute('data-dragged');
    }
    function restoreGeom() {
      if (!el || isMob()) return;
      let g = null;
      try { g = JSON.parse(localStorage.getItem(GEOM_KEY) || 'null'); } catch (_) { g = null; }
      if (!g || !isFinite(+g.w) || !isFinite(+g.h)) return;
      applyGeom(g);
    }
    function saveGeom() {
      if (!el || el.hidden || isMob() || el.getAttribute('data-dragged') !== '1') return;
      try {
        const r = el.getBoundingClientRect();
        const opr = ((el.offsetParent || document.documentElement)).getBoundingClientRect();
        let prev = null; try { prev = JSON.parse(localStorage.getItem(GEOM_KEY) || 'null'); } catch (_) { prev = null; }
        /* a minimised panel is a header, not a size — the size it will be restored to is kept */
        const shrunk = el.classList.contains('rtp-min') && prev;
        localStorage.setItem(GEOM_KEY, JSON.stringify({
          l: Math.round(r.left - opr.left), t: Math.round(r.top - opr.top),
          w: shrunk ? prev.w : Math.round(r.width),
          h: shrunk ? prev.h : Math.round(r.height),
        }));
      } catch (_) { }
      applyInsets();
    }
    /* ⚠ 「画面外に出たら戻す」, and the other direction too: a rectangle written for a wide desktop
       must not survive into the phone layout, where `left`/`height` are what make it a bottom sheet. */
    function clampGeom() {
      if (!el) return;
      if (isMob()) { stripGeom(); applyInsets(); return; }
      if (el.getAttribute('data-dragged') !== '1') { enableWindowing(); return; }
      const r = el.getBoundingClientRect();
      const opr = ((el.offsetParent || document.documentElement)).getBoundingClientRect();
      applyGeom({ l: r.left - opr.left, t: r.top - opr.top, w: r.width, h: r.height });
      applyInsets();
    }

    /* the panel's REAL rectangle, so the camera frames a route into the visible map (§11.3) */
    function applyInsets() {
      if (!el || el.hidden) { try { RT().setInsets({}); } catch (_) { } return; }
      try {
        const r = el.getBoundingClientRect();
        if (isMob()) RT().setInsets({ bottom: Math.max(0, window.innerHeight - r.top) });
        else RT().setInsets({ left: Math.max(0, r.right) });
      } catch (_) { }
    }

    const API = {
      open, close, isOpen, hasRoute, clearRoute,
      state: () => ({ open: openState, tab: tab, hasRoute: hasRoute() }),
      /* the Tools row asks these two; see js/map-ui.js */
      setTab: (t) => { tab = t; render(); },
      _render: render, _recompute: recompute, _el: () => el,
    };
    window.IntMapRouteUI = API;
    return API;
  })();
};
