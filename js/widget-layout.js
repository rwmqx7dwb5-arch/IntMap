/* ============================================================================
 *  IntMap · THE BOARD — GRID, SIZES, REORDER, STACKS
 * ----------------------------------------------------------------------------
 *  window.IntMapWidgetLayout — everything the reader touches, and nothing they read.
 *
 *  ══ THE GRID (§6) ═════════════════════════════════════════════════════════════════════════════
 *  The previous board was `repeat(2,1fr)` with every card at `min-height:106px`. Here the column
 *  count comes from the CONTAINER's measured width through a ResizeObserver — 2 in the sidebar and
 *  on a phone, 3 in a wide sidebar, 4+ in a Workspace pane — and a card spans a whole number of
 *  columns and rows according to its logical size:
 *
 *      S  1×1        M  2×1        L  2×2
 *
 *  ⚠ DOM ORDER IS VISUAL ORDER, AND THE BOARD TILES ITSELF (#R296). `grid-auto-flow: dense` is still
 *  not used — it fills holes by moving cards VISUALLY while leaving them where they were in the DOM,
 *  which silently breaks keyboard reordering and every screen reader (§18). #R292 accepted the hole
 *  as the price of that rule; 「自動でウィジェットを敷き詰めてくれない」 says the price is too high. MEASURED on the
 *  default board: an S card (1 col) followed by four M cards (2 cols) left a 171×131 px hole in row 1.
 *  → `packOrder()` below does dense placement IN THE DOM: the same tiling, with reading order and
 *  visual order still identical, so neither the keyboard path nor a screen reader can disagree with
 *  what is on screen. It only ever pulls a later card FORWARD into a hole that would stay empty.
 *
 *  ══ ⚠ RENDERING AND FETCHING ARE DIFFERENT ACTS ════════════════════════════════════════════════
 *  `render()` used to end with `refreshAll()`, so every re-render re-fetched the whole board
 *  (measured: 7 identical CoinGecko requests in 8 seconds — see js/widget-scheduler.js). Here
 *  `render()` builds DOM and subscribes; the scheduler decides on its own whether anything is due.
 *  A language change, an edit-mode toggle and a resize therefore cost zero requests.
 * ==========================================================================*/
window.IntMapWidgetLayout = (function () {
  'use strict';

  var WC = window.IntMapWidgetCore;
  var ST = window.IntMapWidgetStore;
  var SCH = window.IntMapWidgetScheduler;
  var R = window.IntMapWidgetRender;
  var el = WC.el;
  var L = WC.L;

  var B = {};
  var board = null, grid = null;
  var editing = false;
  var cards = {};              /* instanceId → {item, host, unsub, untick, local} */
  var undoRec = null, undoTimer = null;
  var ro = null;
  var cols = 2;

  /* ══ THE PER-CARD API HANDED TO EVERY RENDERER ════════════════════════════════════════════════
     ⚠ A RENDERER GETS CAPABILITIES, NOT GLOBALS. Everything a card can DO is on this object, which
     is what keeps a renderer a pure function of what it is handed and makes each action one place
     to fix. Every one of these ends in a real subsystem — none of them is a stub. */
  function apiFor(id) {
    var c = cards[id];
    return {
      refresh: function (force) { SCH.refresh(id, force); },
      setConfig: function (patch) { ST.setConfig(id, patch); var it = ST.get(id); if (it) { SCH.rekey(id, it.c); paint(id); } },
      openConfig: function () { openConfig(id); },
      local: function (patch) { c.local = Object.assign({}, c.local, patch); paint(id); },
      needsLocation: function () { return WC.stateBody({ status: WC.geoState().state === 'denied' ? 'permission-denied' : 'permission-required', size: c.item.s }, WC.get(c.item.d), WC.context(), apiFor(id)); },
      empty: function (text) { return WC.notice({ icon: 'check', tone: 'muted', text: text }); },
      requestLocation: function () { WC.requestGeo(function () { SCH.rekeyAll(); paint(id); }); },
      setLayer: function (lid, on) {
        var ok = WC.setLayer(lid, on);
        if (ok) { rememberLayer(lid); WC.emit('layers'); repaintAll(); }
        else WC.toast(L('That layer is not available here', 'そのレイヤーはここでは利用できません', 'Diese Ebene ist hier nicht verfügbar', 'Этот слой здесь недоступен', 'Esa capa no está disponible aquí'));
        return ok;
      },
      openLayer: function (lid) { return WC.setLayer(lid, true); },
      openLayersPanel: function () { return runCommand('ui.layers.open') || runCommand('tab.layers') || WC.toast(L('Open the layers panel from the sidebar', 'サイドバーからレイヤーパネルを開いてください', 'Öffnen Sie die Ebenenliste in der Seitenleiste', 'Откройте панель слоёв в боковой панели', 'Abra el panel de capas en la barra lateral')); },
      flyCountry: function (cc) { flyCountry(cc); },
      copy: function (text) {
        try {
          navigator.clipboard.writeText(text).then(function () { WC.toast(L('Copied', 'コピーしました', 'Kopiert', 'Скопировано', 'Copiado')); },
            function () { WC.toast(L('Could not copy', 'コピーできませんでした', 'Kopieren fehlgeschlagen', 'Не удалось скопировать', 'No se pudo copiar')); });
        } catch (e) { WC.toast(L('Could not copy', 'コピーできませんでした', 'Kopieren fehlgeschlagen', 'Не удалось скопировать', 'No se pudo copiar')); }
      },
      savePlace: function (p) { savePlace(p); },
      openMonitors: function () { return runCommand('tab.monitors') || WC.toast(L('Monitors are in the sidebar', '監視はサイドバーにあります', 'Die Überwachung liegt in der Seitenleiste', 'Мониторы — в боковой панели', 'Los monitores están en la barra lateral')); },
      openRoutePanel: function () { try { if (window.IntMapRouting && window.IntMapRouting.openPanel) { window.IntMapRouting.openPanel(); return true; } } catch (e) {} return runCommand('tool.route'); },
      openAtlasBrief: function () { openAtlasBrief(); },
      addCountryWatch: function (cc) { addCountryWatch(cc); },
      chronosNow: function () { try { window.IntMapTime.setNow({ source: 'widget' }); } catch (e) {} WC.invalidateContext(); repaintAll(); },
      chronosShift: function (days) {
        try {
          var T = window.IntMapTime, base = T.when();
          T.set(new Date(+base + days * 864e5), { source: 'widget' });
        } catch (e) {}
        WC.invalidateContext(); repaintAll();
      },
      runCommand: runCommand,
    };
  }
  function runCommand(cmdId) {
    try {
      if (window.IntMapOS && window.IntMapOS.has && window.IntMapOS.has(cmdId)) { window.IntMapOS.exec(cmdId, { source: 'widget' }); return true; }
    } catch (e) {}
    return false;
  }
  function rememberLayer(id) {
    try {
      var r = JSON.parse(localStorage.getItem('intmap_recent_layers') || '[]');
      r = [id].concat(r.filter(function (x) { return x !== id; })).slice(0, 12);
      localStorage.setItem('intmap_recent_layers', JSON.stringify(r));
    } catch (e) {}
  }
  function flyCountry(cc) {
    /* ⚠ THE WHOLE COUNTRY, THE WAY THE APP ALREADY FRAMES ONE. #R41's camera behaviour is a
       published subsystem; a card that flew to a centroid at a guessed zoom would be a second,
       worse answer to a question the app has already answered. */
    try {
      if (window.IntMapPlaceFraming && window.IntMapPlaceFraming.country) { window.IntMapPlaceFraming.country(cc); return; }
    } catch (e) {}
    try {
      var host = WC.host(), geo = host && host.countryGeo;
      var f = geo && (geo.features || []).find(function (x) { return String(x.id || '').toUpperCase().indexOf(String(cc).toUpperCase()) === 0; });
      if (f) {
        var w = 180, s = 90, e2 = -180, n = -90;
        var eat = function (c) { if (typeof c[0] === 'number') { if (c[0] < w) w = c[0]; if (c[0] > e2) e2 = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; } else c.forEach(eat); };
        eat(f.geometry.coordinates);
        WC.fitBounds([[w, s], [e2, n]], { padding: 40 });
        return;
      }
    } catch (e) {}
    var row = (window.IntMapWidgetDefsData ? window.IntMapWidgetDefsData.countryRows() : []).find(function (r2) { return r2.cc === cc; });
    if (row && isFinite(row.lat)) WC.flyTo({ center: [row.lng, row.lat], zoom: 4 });
  }
  function savePlace(p) {
    try {
      var list = JSON.parse(localStorage.getItem('intmap_saved_places') || '[]');
      if (!Array.isArray(list)) list = [];
      list.unshift({ name: WC.num(p.lat, { maximumFractionDigits: 3 }) + ', ' + WC.num(p.lng, { maximumFractionDigits: 3 }), lat: p.lat, lng: p.lng, at: Date.now() });
      localStorage.setItem('intmap_saved_places', JSON.stringify(list.slice(0, 40)));
      WC.invalidateContext();
      WC.toast(L('Place saved', '地点を保存しました', 'Ort gespeichert', 'Место сохранено', 'Lugar guardado'));
      repaintAll();
    } catch (e) {}
  }
  function addCountryWatch(cc) {
    var it = ST.add('intmap.country-watch', { config: { cc: cc, follow: false } });
    if (it) { render(); WC.toast(L('Added a watch card', 'ウォッチカードを追加しました', 'Beobachtungskarte hinzugefügt', 'Карточка наблюдения добавлена', 'Tarjeta de vigilancia añadida')); }
    else WC.toast(L('That card is already on the board', 'そのカードは既にあります', 'Diese Karte ist bereits vorhanden', 'Эта карточка уже на доске', 'Esa tarjeta ya está en el tablero'));
  }
  function openAtlasBrief() {
    /* ⚠ THIS OPENS ATLAS. IT DOES NOT ASK IT ANYTHING. The reader types or confirms the request in
       Atlas itself, where the quota and the wording belong; the card only ever READS the result. */
    try { if (window.IntMapAtlas && window.IntMapAtlas.hint) window.IntMapAtlas.hint(); } catch (e) {}
    if (!runCommand('tab.atlas')) {
      try { var b = document.getElementById('btn-atlas'); if (b) b.click(); } catch (e) {}
    }
  }

  /* ══ THE BOARD ════════════════════════════════════════════════════════════════════════════════ */
  function ensureBoard() {
    if (board && board.isConnected) return board;
    var sb = document.querySelector('.sidebar');
    if (!sb) return null;
    board = document.createElement('div');
    board.className = 'wgt-board';
    board.id = 'widget-board';
    var feed = document.getElementById('live-news-feed');
    if (feed && feed.parentElement === sb) sb.insertBefore(board, feed); else sb.appendChild(board);
    return board;
  }

  /* ══ ⚠⚠ (#R296) THE TILING, AS A PURE FUNCTION ════════════════════════════════════
     Dense grid placement, computed here so it can be applied to the DOM rather than only to the
     picture. It walks the cells in reading order and puts into each free cell the FIRST remaining
     card that fits there — so a card is only ever pulled FORWARD, into a hole that would otherwise
     stay empty, and a board that already tiles is returned unchanged (the function is idempotent,
     which is what lets it run on every render without the order drifting).
     ⚠ IT IS 2-D. An L card is 2×2, so the row below it is partly occupied before that row starts;
     a column cursor alone would hand back an order the browser then re-flows differently, and the
     DOM and the picture would disagree again — which is the whole defect this replaces. */
  function packOrder(items, nCols) {
    var n = Math.max(1, nCols | 0);
    var wOf = function (it) { var s = (WC.SPAN[it && it.s] || WC.SPAN.m); return Math.min(n, s.cols); };
    var hOf = function (it) { return (WC.SPAN[it && it.s] || WC.SPAN.m).rows; };
    var taken = [];
    var busy = function (r, c) { return !!(taken[r] && taken[r][c]); };
    var fits = function (r, c, w, h) {
      if (c + w > n) return false;
      for (var y = r; y < r + h; y++) for (var x = c; x < c + w; x++) if (busy(y, x)) return false;
      return true;
    };
    var claim = function (r, c, w, h) {
      for (var y = r; y < r + h; y++) { taken[y] = taken[y] || []; for (var x = c; x < c + w; x++) taken[y][x] = 1; }
    };
    var rest = items.slice(), out = [], r = 0, c = 0, guard = 0;
    while (rest.length && guard++ < 10000) {
      if (busy(r, c)) { c++; if (c >= n) { c = 0; r++; } continue; }
      var pick = -1;
      for (var k = 0; k < rest.length; k++) { if (fits(r, c, wOf(rest[k]), hOf(rest[k]))) { pick = k; break; } }
      if (pick < 0) { c++; if (c >= n) { c = 0; r++; } continue; }
      var it = rest.splice(pick, 1)[0];
      claim(r, c, wOf(it), hOf(it));
      out.push(it);
    }
    return out.concat(rest);
  }

  /* the packed order, applied to the cards already built — moving a node is a move, not a rebuild,
     so a column-count change costs no fetches and no re-render (see the header on §RENDERING) */
  function applyPack() {
    if (!grid) return;
    var byId = {};
    [].forEach.call(grid.querySelectorAll(':scope > [data-wid]'), function (n) { byId[n.getAttribute('data-wid')] = n; });
    var ordered = packOrder(ST.raw(), cols);
    ordered.forEach(function (it) { var n = byId[it.i]; if (n) grid.appendChild(n); });
  }

  function measure() {
    if (!grid) return;
    var w = grid.clientWidth || 320;
    /* ⚠ THE BREAKPOINTS ARE ON THE CONTAINER, NOT THE WINDOW. The same board is a 300 px sidebar
       column and a 900 px Workspace pane in the same session; a media query cannot tell them apart. */
    var next = w < 520 ? 2 : w < 720 ? 3 : w < 1000 ? 4 : Math.min(6, Math.floor(w / 200));
    if (next !== cols) {
      cols = next;
      grid.style.setProperty('--wgt-cols', String(cols));
      grid.setAttribute('data-cols', String(cols));
      /* (#R296) the tiling depends on the column count, so it is recomputed WITH it */
      applyPack();
    }
  }

  function render() {
    var b = ensureBoard();
    if (!b) return;
    var items = ST.load().items;
    /* every card that is going away releases its subscriptions BEFORE the DOM is replaced, so an
       in-flight request with no reader left is aborted rather than completed into nothing */
    Object.keys(cards).forEach(function (id) { teardown(id); });
    WC.clear(b);

    b.appendChild(el('div', { class: 'wgt-titlerow' }, [
      el('h2', { class: 'wgt-title', text: L('Widgets', 'ウィジェット', 'Widgets', 'Виджеты', 'Widgets') }),
      el('button', {
        type: 'button', class: 'wgt-editbtn' + (editing ? ' on' : ''),
        'aria-pressed': editing ? 'true' : 'false',
        text: editing ? L('Done', '完了', 'Fertig', 'Готово', 'Hecho') : L('Edit', '編集', 'Bearbeiten', 'Изменить', 'Editar'),
        onclick: function () { setEditing(!editing); },
      }),
      el('button', {
        type: 'button', class: 'wgt-addbtn',
        'aria-label': L('Add a widget', 'ウィジェットを追加', 'Widget hinzufügen', 'Добавить виджет', 'Añadir widget'),
        title: L('Add a widget', 'ウィジェットを追加', 'Widget hinzufügen', 'Добавить виджет', 'Añadir widget'),
        onclick: function () { window.IntMapWidgetGallery.open(); },
      }, [WC.icon('plus', { size: 15 }), el('span', { class: 'wgt-addbtn-t', text: L('Add', '追加', 'Hinzufügen', 'Добавить', 'Añadir') })]),
    ]));

    grid = el('div', {
      class: 'wgt-grid', role: 'list',
      'aria-label': L('Widget board', 'ウィジェットボード', 'Widget-Board', 'Доска виджетов', 'Tablero de widgets'),
    });
    b.appendChild(grid);
    b.appendChild(el('div', { class: 'wgt-live', id: 'wgt-live', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }));

    if (!items.length) {
      grid.appendChild(el('div', { class: 'wgt-emptyboard' }, [
        el('p', { text: L('Your board is empty', 'ボードは空です', 'Ihr Board ist leer', 'Доска пуста', 'Su tablero está vacío') }),
        el('button', { type: 'button', class: 'wgt-act primary', text: L('Add a widget', 'ウィジェットを追加', 'Widget hinzufügen', 'Добавить виджет', 'Añadir widget'), onclick: function () { window.IntMapWidgetGallery.open(); } }),
        el('button', { type: 'button', class: 'wgt-act', text: L('Restore the default board', '既定のボードに戻す', 'Standard-Board wiederherstellen', 'Восстановить доску по умолчанию', 'Restaurar el tablero por defecto'), onclick: function () { ST.resetBoard(); render(); } }),
      ]));
    }
    /* (#R296) …in the order that tiles. `packOrder` is the display order AND the DOM order. */
    packOrder(items, cols).forEach(function (it) { grid.appendChild(it.k === 'stack' ? buildStack(it) : buildCard(it)); });

    if (!ro && typeof ResizeObserver === 'function') { ro = new ResizeObserver(measure); }
    if (ro) { try { ro.disconnect(); ro.observe(grid); } catch (e) {} }
    measure();
    if (editing) enableDrag();
    updateBoardVisibility();
    /* ⚠⚠ THE FIRST PAINT HAPPENS HERE, AFTER THE CARDS ARE IN THE DOCUMENT — AND THAT ORDER IS THE
       WHOLE POINT. `buildCard()` subscribes, and both the scheduler and the ticker answer
       IMMEDIATELY with whatever they already hold; but at that moment the card it would paint into
       is still a detached element the caller has not appended yet, so `paint()`'s `isConnected`
       guard correctly drops it. MEASURED before this line existed: a board whose data never arrives
       — a hidden board, an offline reader, a blocked host — rendered every card as an EMPTY BOX for
       ever, because the only paint it was ever going to get had already been thrown away. Not a
       skeleton, not a state notice: nothing. That is the exact class of silence this platform was
       built to remove, one level below where it used to live. */
    Object.keys(cards).forEach(paint);
  }

  /* ── one card ────────────────────────────────────────────────────────────────────────────── */
  function buildCard(item, inStack, stackSize) {
    var def = WC.get(item.d);
    var size = stackSize || item.s;
    if (!def) return el('div', { class: 'wgt-card' });
    if (def.supportedSizes.indexOf(size) < 0) size = def.defaultSize;
    var span = WC.SPAN[size];

    var host = el('article', {
      class: 'wgt-card wgt-' + size + (editing && !inStack ? ' editing' : ''),
      role: inStack ? 'group' : 'listitem',
      tabindex: inStack ? null : '0',
      dataset: { wid: item.i, def: def.id, size: size },
      style: inStack ? '' : 'grid-column:span ' + span.cols + ';grid-row:span ' + span.rows + ';',
      'aria-label': cardLabel(def, item, size),
    });
    var title = (def.title ? def.title(item.c) : def.nm());
    host.appendChild(R.head({ icon: def.icon, title: title, trailing: editing || inStack ? null : cfgButton(item, def) }));
    var body = el('div', { class: 'wgt-cardbody', id: 'wgtb-' + item.i });
    host.appendChild(body);
    host.appendChild(el('div', { class: 'wgt-cfgbox', id: 'wgtc-' + item.i, hidden: true }));

    if (editing && !inStack) {
      host.appendChild(el('button', {
        type: 'button', class: 'wgt-del',
        'aria-label': L('Remove', '削除', 'Entfernen', 'Удалить', 'Quitar') + ' — ' + title,
        title: L('Remove', '削除', 'Entfernen', 'Удалить', 'Quitar'),
        onclick: function (ev) { ev.stopPropagation(); removeCard(item.i); },
      }, [WC.icon('minus', { size: 15, weight: 2.6 })]));
      host.appendChild(el('span', { class: 'wgt-grip', 'aria-hidden': 'true' }, [WC.icon('drag', { size: 16 })]));
    }

    cards[item.i] = { item: item, def: def, host: host, body: body, size: size, local: {}, inStack: !!inStack };
    attach(item.i);
    if (!inStack) wireCardMenu(host, item);
    return host;
  }
  function cardLabel(def, item, size) {
    var sizeWord = { s: L('small', '小', 'klein', 'малый', 'pequeño'), m: L('medium', '中', 'mittel', 'средний', 'mediano'), l: L('large', '大', 'groß', 'большой', 'grande') }[size];
    return (def.title ? def.title(item.c) : def.nm()) + ' — ' + sizeWord;
  }
  function cfgButton(item, def) {
    if (!def.configSchema || !Object.keys(def.configSchema).length) return null;
    return el('button', {
      type: 'button', class: 'wgt-cfg',
      'aria-label': L('Settings for', '設定：', 'Einstellungen für', 'Настройки', 'Ajustes de') + ' ' + (def.title ? def.title(item.c) : def.nm()),
      title: L('Settings', '設定', 'Einstellungen', 'Настройки', 'Ajustes'),
      onclick: function (ev) { ev.stopPropagation(); openConfig(item.i); },
    }, [WC.icon('gear', { size: 14 })]);
  }

  /* ── the data pipe: subscribe once, paint on every state change ──────────────────────────── */
  function attach(id) {
    var c = cards[id];
    if (!c) return;
    var pol = c.def.refreshPolicy || {};
    if (c.def.loader) {
      c.unsub = SCH.subscribe({
        id: id, def: c.def, cfg: c.item.c, size: c.size, el: c.host,
        onState: function (state) { c.state = state; paint(id); },
      });
    } else {
      c.state = { status: 'ready', size: c.size, data: null };
    }
    if (pol.kind === 'realtime-local') {
      var every = pol.tick ? pol.tick(c.item.c) : 'minute';
      /* ⚠ SUBSCRIBED, NOT TIMED. One ticker exists for the board; this card asks it for the
         granularity it needs, and the ticker stops when the last subscriber leaves. */
      c.untick = WC.tick(every, function (now) {
        if (!cards[id]) return;
        c.now = now;
        paint(id);
      });
    } else {
      paint(id);
    }
  }
  function teardown(id) {
    var c = cards[id];
    if (!c) return;
    try { c.unsub && SCH.unsubscribe(id); } catch (e) {}
    try { c.untick && c.untick(); } catch (e) {}
    delete cards[id];
  }

  /* ⚠ ONE CARD'S EXCEPTION MUST NOT STOP THE BOARD (§21). Every paint is wrapped, and a renderer
     that throws leaves that ONE card in an error state with everything else still ticking — the
     shape #R36 recorded when a `ReferenceError` in one clock froze every locally-ticked widget. */
  function paint(id) {
    var c = cards[id];
    if (!c || !c.body || !c.body.isConnected) return;
    var st = Object.assign({}, c.state || { status: 'ready', size: c.size }, { size: c.size, now: c.now, local: c.local });
    var ctx = WC.context();
    var api = apiFor(id);
    var node = null;
    try {
      if (st.status && st.status !== 'ready' && !WC.keepsValue(st.status)) {
        node = WC.stateBody(st, c.def, ctx, api);
      } else {
        node = c.def.renderers[c.size] ? c.def.renderers[c.size](ctx, c.item.c, st, api) : null;
        if (node && WC.keepsValue(st.status)) {
          var fr = WC.freshnessLine(st);
          if (fr) node.appendChild(fr);
          if (WC.isError(st.status)) node.appendChild(WC.stateBody(st, c.def, ctx, api));
        }
        if (!node) node = WC.stateBody({ status: st.status === 'ready' ? 'loading' : st.status, size: c.size, nextRetryAt: st.nextRetryAt }, c.def, ctx, api);
      }
    } catch (e) {
      /* the reader is told the card failed; the exception itself is not put on screen (§21) */
      node = WC.notice({ icon: 'close', tone: 'warn', text: L('This widget could not be drawn', 'このウィジェットを表示できませんでした', 'Dieses Widget konnte nicht gezeichnet werden', 'Виджет не удалось отрисовать', 'No se pudo dibujar este widget') });
      try { console.warn('widget ' + c.def.id, e); } catch (e2) {}
    }
    if (c.def.onData && st.data) { try { c.local = Object.assign({}, c.local, c.def.onData(st)); } catch (e3) {} }
    WC.clear(c.body);
    c.body.setAttribute('aria-busy', (st.status === 'loading' || st.status === 'idle') ? 'true' : 'false');
    if (node) c.body.appendChild(node);
    var tone = c.def.tone ? c.def.tone(st) : null;
    c.host.className = c.host.className.replace(/\s*wgt-tone-\S+/g, '') + (tone ? ' wgt-tone-' + tone : '');
  }
  function repaintAll() { WC.invalidateContext(); Object.keys(cards).forEach(paint); }
  B.repaintAll = repaintAll;

  /* ══ STACKS (§13) ═════════════════════════════════════════════════════════════════════════════ */
  function buildStack(stack) {
    var span = WC.SPAN[stack.s];
    var order = stackOrder(stack);
    var ix = Math.max(0, Math.min(order.length - 1, stack.ix));
    var wrap = el('section', {
      class: 'wgt-stack wgt-' + stack.s + (editing ? ' editing' : ''),
      role: 'listitem', tabindex: '0',
      dataset: { wid: stack.i, stack: '1' },
      style: 'grid-column:span ' + span.cols + ';grid-row:span ' + span.rows + ';',
      'aria-roledescription': L('stack', 'スタック', 'Stapel', 'стопка', 'pila'),
      'aria-label': L('Stack of', 'スタック：', 'Stapel mit', 'Стопка из', 'Pila de') + ' ' + order.length,
    });
    var pageWrap = el('div', { class: 'wgt-stack-pages' });
    /* ⚠ ONLY THE VISIBLE PAGE IS BUILT AND SUBSCRIBED (§13, §20). A stack of six cards that painted
       all six would cost six subscriptions and six renders for one visible answer. */
    var member = order[ix];
    if (member) pageWrap.appendChild(buildCard(member, true, stack.s));
    wrap.appendChild(pageWrap);

    if (order.length > 1) {
      wrap.appendChild(el('div', { class: 'wgt-stack-nav' }, [
        el('button', { type: 'button', class: 'wgt-stack-b', 'aria-label': L('Previous widget in the stack', 'スタック内の前へ', 'Vorheriges Widget im Stapel', 'Предыдущий виджет в стопке', 'Widget anterior de la pila'),
          onclick: function (ev) { ev.stopPropagation(); page(stack.i, -1); } }, [WC.icon('chevronL', { size: 14 })]),
        el('div', { class: 'wgt-stack-dots', role: 'tablist', 'aria-label': L('Stack pages', 'スタックのページ', 'Stapelseiten', 'Страницы стопки', 'Páginas de la pila') },
          order.map(function (m, i) {
            var d = WC.get(m.d);
            return el('button', {
              type: 'button', class: 'wgt-stack-dot' + (i === ix ? ' on' : ''), role: 'tab',
              'aria-selected': i === ix ? 'true' : 'false',
              'aria-label': (d ? (d.title ? d.title(m.c) : d.nm()) : '') + ' — ' + (i + 1) + ' / ' + order.length,
              onclick: function (ev) { ev.stopPropagation(); goTo(stack.i, i); },
            });
          })),
        el('button', { type: 'button', class: 'wgt-stack-b', 'aria-label': L('Next widget in the stack', 'スタック内の次へ', 'Nächstes Widget im Stapel', 'Следующий виджет в стопке', 'Siguiente widget de la pila'),
          onclick: function (ev) { ev.stopPropagation(); page(stack.i, 1); } }, [WC.icon('chevronR', { size: 14 })]),
      ]));
    }
    if (editing) {
      wrap.appendChild(el('button', {
        type: 'button', class: 'wgt-del',
        'aria-label': L('Break up this stack', 'このスタックを解除', 'Diesen Stapel auflösen', 'Разобрать стопку', 'Deshacer esta pila'),
        onclick: function (ev) { ev.stopPropagation(); ST.unstack(stack.i); render(); },
      }, [WC.icon('minus', { size: 15, weight: 2.6 })]));
      wrap.appendChild(el('span', { class: 'wgt-grip', 'aria-hidden': 'true' }, [WC.icon('drag', { size: 16 })]));
    }
    wireStackGestures(wrap, stack);
    wireCardMenu(wrap, stack);
    return wrap;
  }
  function stackOrder(stack) {
    if (stack.mode !== 'smart' || stack.auto === false) return stack.m;
    return window.IntMapWidgetSmart.order(stack, WC.context());
  }
  function page(sid, d) {
    var st = ST.get(sid);
    if (!st) return;
    var n = st.m.length;
    ST.setStackIndex(sid, (st.ix + d + n) % n);
    render();
    announce(stackAnnounce(sid));
  }
  function goTo(sid, i) { ST.setStackIndex(sid, i); render(); announce(stackAnnounce(sid)); }
  function stackAnnounce(sid) {
    var st = ST.get(sid);
    if (!st) return '';
    var order = stackOrder(st), m = order[st.ix], d = m && WC.get(m.d);
    return (d ? (d.title ? d.title(m.c) : d.nm()) : '') + ' — ' + (st.ix + 1) + ' / ' + order.length;
  }
  function wireStackGestures(wrap, stack) {
    var x0 = null, y0 = null, moved = false;
    wrap.addEventListener('pointerdown', function (e) { if (editing) return; x0 = e.clientX; y0 = e.clientY; moved = false; });
    wrap.addEventListener('pointermove', function (e) { if (x0 == null) return; if (Math.abs(e.clientX - x0) > 8 || Math.abs(e.clientY - y0) > 8) moved = true; });
    wrap.addEventListener('pointerup', function (e) {
      if (x0 == null) return;
      var dx = e.clientX - x0, dy = e.clientY - y0;
      x0 = null;
      /* a swipe is horizontal and long; anything else is a tap or a scroll and must pass through */
      if (moved && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.6) page(stack.i, dx < 0 ? 1 : -1);
    });
    wrap.addEventListener('keydown', function (e) {
      if (e.target !== wrap) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); page(stack.i, 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); page(stack.i, -1); }
    });
  }

  /* ══ THE CARD MENU (§9) ═══════════════════════════════════════════════════════════════════════ */
  function wireCardMenu(host, item) {
    var t = null;
    host.addEventListener('contextmenu', function (e) { e.preventDefault(); openMenu(item, e.clientX, e.clientY); });
    host.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      clearTimeout(t);
      t = setTimeout(function () { openMenu(item, e.clientX, e.clientY); }, 520);
    });
    ['pointerup', 'pointercancel', 'pointermove'].forEach(function (ev) { host.addEventListener(ev, function () { clearTimeout(t); }); });
    host.addEventListener('keydown', function (e) {
      if (e.target !== host) return;
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); var r = host.getBoundingClientRect(); openMenu(item, r.left + 20, r.top + 20); }
    });
  }
  var menuEl = null;
  function closeMenu() { if (menuEl) { try { menuEl.remove(); } catch (e) {} menuEl = null; document.removeEventListener('pointerdown', onDocDown, true); document.removeEventListener('keydown', onMenuKey, true); } }
  function onDocDown(e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }
  function onMenuKey(e) { if (e.key === 'Escape') { closeMenu(); } }
  function openMenu(item, x, y) {
    closeMenu();
    var isStack = item.k === 'stack';
    var def = isStack ? null : WC.get(item.d);
    var rows = [];
    if (!isStack && def) {
      if (def.configSchema && Object.keys(def.configSchema).length) {
        rows.push({ icon: 'gear', label: L('Settings', '設定', 'Einstellungen', 'Настройки', 'Ajustes'), run: function () { openConfig(item.i); } });
      }
      def.supportedSizes.forEach(function (s) {
        if (s === item.s) return;
        rows.push({ icon: 'grid', label: sizeLabel(s), run: function () { ST.setSize(item.i, s); render(); announce(sizeLabel(s)); } });
      });
      if (def.multi) rows.push({ icon: 'plus', label: L('Duplicate', '複製', 'Duplizieren', 'Дублировать', 'Duplicar'), run: function () { ST.duplicate(item.i); render(); } });
      if (item.s !== def.defaultSize) rows.push({ icon: 'refresh', label: L('Reset the size', '既定のサイズに戻す', 'Größe zurücksetzen', 'Сбросить размер', 'Restablecer el tamaño'), run: function () { ST.setSize(item.i, def.defaultSize); render(); } });
      var neighbours = ST.raw().filter(function (x) { return x.i !== item.i && x.k !== 'stack'; });
      if (neighbours.length) {
        rows.push({ icon: 'stack', label: L('Stack with the next widget', '次のウィジェットと重ねる', 'Mit dem nächsten Widget stapeln', 'Сложить со следующим виджетом', 'Apilar con el siguiente widget'),
          run: function () { var i = ST.indexOf(item.i); var other = ST.raw()[i + 1] || ST.raw()[i - 1]; if (other && other.k !== 'stack') { ST.stack([item.i, other.i]); render(); } } });
      }
      var st = ST.stackOf(item.i);
      if (st) rows.push({ icon: 'close', label: L('Take out of the stack', 'スタックから出す', 'Aus dem Stapel nehmen', 'Вынуть из стопки', 'Sacar de la pila'), run: function () { ST.unstack(st.i); render(); } });
    } else if (isStack) {
      rows.push({ icon: 'close', label: L('Break up the stack', 'スタックを解除', 'Stapel auflösen', 'Разобрать стопку', 'Deshacer la pila'), run: function () { ST.unstack(item.i); render(); } });
      rows.push({ icon: item.mode === 'smart' ? 'grid' : 'sparkle',
        label: item.mode === 'smart' ? L('Stop choosing automatically', '自動選択をやめる', 'Nicht mehr automatisch wählen', 'Не выбирать автоматически', 'Dejar de elegir automáticamente')
          : L('Choose automatically (Smart Stack)', '自動で選ぶ（Smart Stack）', 'Automatisch wählen (Smart Stack)', 'Выбирать автоматически (Smart Stack)', 'Elegir automáticamente (Smart Stack)'),
        run: function () { var s2 = ST.get(item.i); s2.mode = s2.mode === 'smart' ? 'manual' : 'smart'; ST.save(); render(); } });
      if (item.mode === 'smart') {
        rows.push({ icon: 'pin2', label: item.pin ? L('Unpin this page', 'このページの固定を解除', 'Diese Seite lösen', 'Открепить страницу', 'Dessujetar esta página')
          : L('Pin this page to the front', 'このページを前面に固定', 'Diese Seite anheften', 'Закрепить страницу', 'Fijar esta página delante'),
        run: function () { var order = stackOrder(item); ST.setStackFlags(item.i, { pin: item.pin ? null : (order[item.ix] || {}).i }); render(); } });
        rows.push({ icon: 'eye', label: L('Why is this showing?', 'なぜこれが表示されているか', 'Warum wird das gezeigt?', 'Почему это показано?', '¿Por qué se muestra esto?'),
          run: function () { WC.toast(window.IntMapWidgetSmart.explain(item, WC.context())); } });
      }
    }
    rows.push({ icon: 'minus', danger: true, label: L('Remove', '削除', 'Entfernen', 'Удалить', 'Quitar'), run: function () { removeCard(item.i); } });

    menuEl = el('div', { class: 'wgt-menu', role: 'menu', tabindex: '-1',
      'aria-label': L('Widget options', 'ウィジェットの操作', 'Widget-Optionen', 'Параметры виджета', 'Opciones del widget') },
    rows.map(function (r) {
      return el('button', { type: 'button', class: 'wgt-menu-i' + (r.danger ? ' danger' : ''), role: 'menuitem',
        onclick: function (ev) { ev.stopPropagation(); closeMenu(); r.run(); } },
      [WC.icon(r.icon, { size: 14 }), el('span', { text: r.label })]);
    }));
    document.body.appendChild(menuEl);
    var w = menuEl.offsetWidth, h = menuEl.offsetHeight;
    menuEl.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x)) + 'px';
    menuEl.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, y)) + 'px';
    try { menuEl.querySelector('button').focus(); } catch (e) {}
    document.addEventListener('pointerdown', onDocDown, true);
    document.addEventListener('keydown', onMenuKey, true);
  }
  function sizeLabel(s) {
    return { s: L('Small', '小さく', 'Klein', 'Малый', 'Pequeño'), m: L('Medium', '中くらい', 'Mittel', 'Средний', 'Mediano'), l: L('Large', '大きく', 'Groß', 'Большой', 'Grande') }[s];
  }

  /* ══ DELETE + UNDO (§9) ═══════════════════════════════════════════════════════════════════════ */
  function removeCard(id) {
    var rec = ST.remove(id);
    if (!rec) return;
    render();
    undoRec = rec;
    showUndo();
  }
  function showUndo() {
    clearTimeout(undoTimer);
    var old = document.getElementById('wgt-undo');
    if (old) old.remove();
    var bar = el('div', { class: 'wgt-undo', id: 'wgt-undo', role: 'status' }, [
      el('span', { text: L('Widget removed', 'ウィジェットを削除しました', 'Widget entfernt', 'Виджет удалён', 'Widget eliminado') }),
      el('button', { type: 'button', class: 'wgt-act', text: L('Undo', '元に戻す', 'Rückgängig', 'Отменить', 'Deshacer'),
        onclick: function () { if (undoRec) { ST.restore(undoRec); undoRec = null; render(); } bar.remove(); } }),
    ]);
    document.body.appendChild(bar);
    undoTimer = setTimeout(function () { undoRec = null; try { bar.remove(); } catch (e) {} }, 8000);
  }

  /* ══ EDIT MODE, DRAG, KEYBOARD (§9) ═══════════════════════════════════════════════════════════ */
  function setEditing(v) {
    editing = !!v;
    render();
    announce(editing ? L('Edit mode on. Use the arrow keys to move a widget.', '編集モードです。矢印キーで移動できます。', 'Bearbeitungsmodus. Mit den Pfeiltasten verschieben.', 'Режим правки. Стрелки перемещают виджет.', 'Modo de edición. Use las flechas para mover.')
      : L('Edit mode off', '編集モードを終了しました', 'Bearbeitungsmodus beendet', 'Режим правки выключен', 'Modo de edición desactivado'));
  }
  B.editing = function () { return editing; };
  B.setEditing = setEditing;

  function announce(msg) {
    var live = document.getElementById('wgt-live');
    if (live && msg) live.textContent = msg;
  }

  /* the FLIP reorder from the previous board, kept — it was never the complaint (#R32/#R34) */
  function enableDrag() {
    if (!grid) return;
    [].forEach.call(grid.children, function (card) {
      if (!card.dataset || !card.dataset.wid) return;
      var dragging = false, hx = 0, hy = 0, moveH = null, upH = null, before = null;
      function flip(mut) {
        var sibs = [].slice.call(grid.children).filter(function (c) { return c !== card && c.dataset && c.dataset.wid; });
        var first = new Map();
        sibs.forEach(function (c) { first.set(c, c.getBoundingClientRect()); });
        mut();
        sibs.forEach(function (c) {
          var f = first.get(c), l = c.getBoundingClientRect();
          var dx = f.left - l.left, dy = f.top - l.top;
          if (dx || dy) {
            c.style.transition = 'none';
            c.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
            c.getBoundingClientRect();
            requestAnimationFrame(function () { c.style.transition = 'transform 0.24s cubic-bezier(0.2,0.7,0.2,1)'; c.style.transform = ''; });
          }
        });
      }
      function onMove(e) {
        if (!dragging) return;
        if (e.preventDefault) e.preventDefault();
        card.style.transition = 'none';
        card.style.transform = 'translate(' + (e.clientX - hx) + 'px,' + (e.clientY - hy) + 'px) scale(1.04)';
        var under = document.elementFromPoint(e.clientX, e.clientY);
        var over = under && under.closest && under.closest('[data-wid]');
        if (over && over !== card && over.parentElement === grid) {
          var r = over.getBoundingClientRect();
          var putBefore = (e.clientY < r.top + r.height / 2);
          flip(function () { grid.insertBefore(card, putBefore ? over : over.nextSibling); });
          hx = e.clientX; hy = e.clientY;
          card.style.transform = 'translate(0px,0px) scale(1.04)';
        }
      }
      function end(cancel) {
        if (!dragging) return;
        dragging = false;
        try { document.removeEventListener('pointermove', moveH); document.removeEventListener('pointerup', upH); document.removeEventListener('pointercancel', upH); document.removeEventListener('keydown', escH, true); } catch (e) {}
        card.style.transition = 'transform 0.2s cubic-bezier(0.2,0.7,0.2,1),opacity 0.2s';
        card.style.transform = ''; card.style.opacity = ''; card.style.zIndex = '';
        setTimeout(function () { card.style.pointerEvents = ''; card.style.transition = ''; }, 220);
        if (cancel && before) {
          /* Esc puts the board back exactly as it was before the gesture started (§9) */
          ST.reorder(before);
          render();
          return;
        }
        ST.reorder([].map.call(grid.querySelectorAll('[data-wid]'), function (c) { return c.getAttribute('data-wid'); })
          .filter(function (v, i, a) { return a.indexOf(v) === i; }));
      }
      function escH(e) { if (e.key === 'Escape') { e.preventDefault(); end(true); } }
      card.addEventListener('pointerdown', function (e) {
        if (!editing) return;
        if (e.target.closest && e.target.closest('button')) return;
        dragging = true; hx = e.clientX; hy = e.clientY;
        before = ST.raw().map(function (x) { return x.i; });
        card.style.zIndex = '8'; card.style.pointerEvents = 'none'; card.style.opacity = '0.96';
        card.style.transition = 'transform 0.12s ease'; card.style.transform = 'scale(1.04)';
        if (e.preventDefault) e.preventDefault();
        moveH = onMove; upH = function () { end(false); };
        document.addEventListener('pointermove', moveH, { passive: false });
        document.addEventListener('pointerup', upH);
        document.addEventListener('pointercancel', upH);
        document.addEventListener('keydown', escH, true);
      });
    });
  }

  /* (#R296) one step along the DISPLAYED sequence — see the note at the ArrowKey branch. Returns
     false when the card is already at the end it was asked to move towards, exactly like ST.move. */
  function moveDisplayed(id, delta) {
    var seq = packOrder(ST.raw(), cols).map(function (x) { return x.i; });
    var i = seq.indexOf(id);
    if (i < 0) return false;
    var j = Math.max(0, Math.min(seq.length - 1, i + delta));
    if (j === i) return false;
    seq.splice(j, 0, seq.splice(i, 1)[0]);
    ST.reorder(seq);
    return true;
  }

  /* ⚠ KEYBOARD REORDER IS NOT A SECOND IMPLEMENTATION — it moves the SAME store and re-renders.
     Space/Enter picks a card up, the arrows move it, Space/Enter drops it, Escape puts it back. */
  var picked = null, pickedFrom = null;
  function onGridKey(e) {
    var host = e.target && e.target.closest && e.target.closest('[data-wid]');
    if (!host || !grid || !grid.contains(host)) return;
    var id = host.getAttribute('data-wid');
    if (e.key === ' ' || e.key === 'Enter') {
      if (!editing) return;
      e.preventDefault();
      if (picked === id) {
        picked = null; host.classList.remove('picked');
        announce(L('Placed', '配置しました', 'Platziert', 'Размещено', 'Colocado'));
      } else {
        picked = id; pickedFrom = ST.raw().map(function (x) { return x.i; });
        host.classList.add('picked');
        announce(L('Picked up. Use the arrow keys to move it, then press Enter.', 'つかみました。矢印キーで移動し、Enterで確定します。', 'Aufgenommen. Mit den Pfeiltasten bewegen, dann Enter.', 'Взято. Стрелки перемещают, Enter — поставить.', 'Cogido. Use las flechas y luego Enter.'));
      }
      return;
    }
    if (e.key === 'Escape' && picked) {
      e.preventDefault();
      ST.reorder(pickedFrom); picked = null; render();
      announce(L('Cancelled', '取り消しました', 'Abgebrochen', 'Отменено', 'Cancelado'));
      return;
    }
    if (picked === id && /^Arrow(Left|Right|Up|Down)$/.test(e.key)) {
      e.preventDefault();
      var step = (e.key === 'ArrowLeft') ? -1 : (e.key === 'ArrowRight') ? 1 : (e.key === 'ArrowUp') ? -cols : cols;
      /* ⚠ (#R296) THE MOVE IS RELATIVE TO WHAT IS ON SCREEN. The board is rendered in packed order,
         so 「one to the right」 has to mean one position along THAT sequence; `ST.move` walks the
         stored one, and the two are the same list only when nothing was pulled forward. An explicit
         reorder is also the moment the two are allowed to converge, so the packed order is written
         through — the reader has just decided where a card goes. */
      if (moveDisplayed(id, step)) {
        render();
        var next = grid.querySelector('[data-wid="' + id + '"]');
        if (next) { next.classList.add('picked'); next.focus(); }
        announce(L('Position', '位置', 'Position', 'Позиция', 'Posición') + ' '
          + (packOrder(ST.raw(), cols).map(function (x) { return x.i; }).indexOf(id) + 1) + ' / ' + ST.raw().length);
      }
      return;
    }
    if (!editing && /^Arrow(Left|Right|Up|Down)$/.test(e.key)) {
      /* plain arrow navigation between cards — the roving focus a grid should have */
      e.preventDefault();
      var all = [].slice.call(grid.querySelectorAll('[data-wid]'));
      var i = all.indexOf(host);
      var d = (e.key === 'ArrowLeft') ? -1 : (e.key === 'ArrowRight') ? 1 : (e.key === 'ArrowUp') ? -cols : cols;
      var t = all[Math.max(0, Math.min(all.length - 1, i + d))];
      if (t) t.focus();
    }
  }

  /* ══ THE CONFIG PANEL — generated from the definition's schema (§4) ═══════════════════════════ */
  function openConfig(id) {
    var c = cards[id];
    if (!c) return;
    var box = document.getElementById('wgtc-' + id);
    if (!box) return;
    if (!box.hidden) { box.hidden = true; WC.clear(box); return; }
    box.hidden = false;
    WC.clear(box);
    box.appendChild(configForm(c.def, c.item.c, function (patch) {
      ST.setConfig(id, patch);
      var it = ST.get(id);
      if (it) { c.item = it; SCH.rekey(id, it.c); paint(id); }
    }));
    box.appendChild(el('div', { class: 'wgt-acts' }, [
      el('button', { type: 'button', class: 'wgt-act', text: L('Done', '完了', 'Fertig', 'Готово', 'Hecho'), onclick: function () { box.hidden = true; WC.clear(box); } }),
    ]));
  }
  /* the same form the gallery uses for "configure before you add" (§8.10) */
  function configForm(def, cfg, onChange) {
    var form = el('div', { class: 'wgt-form' });
    Object.keys(def.configSchema || {}).forEach(function (k) {
      var f = def.configSchema[k];
      var labelText = f.label ? f.label() : k;
      var fid = 'wf-' + Math.random().toString(36).slice(2, 8);
      var row = el('label', { class: 'wgt-field', for: fid });
      row.appendChild(el('span', { class: 'wgt-field-l', text: labelText }));
      var input;
      if (f.type === 'boolean') {
        input = el('input', { type: 'checkbox', id: fid, class: 'wgt-check' });
        input.checked = !!cfg[k];
        input.addEventListener('change', function () { onChange(kv(k, input.checked)); });
      } else if (f.options) {
        var opts = f.options();
        if (f.type === 'list') {
          input = el('select', { id: fid, class: 'wgt-input', multiple: true, size: String(Math.min(5, opts.length)) },
            opts.map(function (o) { var op = el('option', { value: o.value, text: o.label }); if ((cfg[k] || []).indexOf(o.value) >= 0) op.selected = true; return op; }));
          input.addEventListener('change', function () { onChange(kv(k, [].filter.call(input.options, function (o) { return o.selected; }).map(function (o) { return o.value; }))); });
        } else {
          input = el('select', { id: fid, class: 'wgt-input' },
            opts.map(function (o) { var op = el('option', { value: String(o.value), text: o.label }); if (String(cfg[k]) === String(o.value)) op.selected = true; return op; }));
          input.addEventListener('change', function () { onChange(kv(k, f.type === 'number' ? +input.value : input.value)); });
        }
      } else if (f.type === 'number') {
        input = el('input', { type: 'number', id: fid, class: 'wgt-input', value: String(cfg[k] == null ? '' : cfg[k]),
          min: f.min == null ? null : String(f.min), max: f.max == null ? null : String(f.max), step: f.integer ? '1' : 'any' });
        input.addEventListener('change', function () { onChange(kv(k, +input.value)); });
      } else if (f.type === 'date') {
        input = el('input', { type: 'date', id: fid, class: 'wgt-input', value: String(cfg[k] || '').slice(0, 10) });
        input.addEventListener('change', function () { onChange(kv(k, input.value)); });
      } else {
        input = el('input', { type: 'text', id: fid, class: 'wgt-input', value: String(cfg[k] == null ? '' : cfg[k]), maxlength: String(f.maxLength || 60) });
        input.addEventListener('change', function () { onChange(kv(k, input.value)); });
      }
      row.appendChild(input);
      form.appendChild(row);
    });
    return form;
  }
  function kv(k, v) { var o = {}; o[k] = v; return o; }
  B.configForm = configForm;

  /* ══ VISIBILITY ═══════════════════════════════════════════════════════════════════════════════ */
  function boardShown() {
    if (!board) return false;
    if (board.style.display === 'none') return false;
    return board.offsetParent !== null;
  }
  function updateBoardVisibility() { SCH.setBoardVisible(boardShown()); }
  B.boardShown = boardShown;
  /* ⚠⚠ HIDING THE BOARD RELEASES ITS CARDS, IT DOES NOT JUST STOP LOOKING AT THEM. MEASURED before
     this existed: opening a tab hid the board, and every card it held stayed subscribed — so the
     1 Hz ticker went on running for a clock nobody could see, and the scheduler went on holding
     subscriptions for cards that were no longer part of anything. Two guards would have caught the
     symptom («return early if hidden»), and both would have left the timer running; releasing is
     the only version where «a hidden board does no work» is true by construction rather than by
     every callback remembering to check. The DOM is left alone — `render()` rebuilds it when the
     board comes back, which it has to do anyway. */
  function release() {
    Object.keys(cards).forEach(teardown);
    updateBoardVisibility();
  }
  B.release = release;

  B.render = render;
  B.paint = paint;
  B.el = function () { return board; };
  B.grid = function () { return grid; };
  B.cols = function () { return cols; };
  /* (#R296) the tiling, exposed so `tests/r296 ①` can put an S in front of four Ms and assert that
     no cell is left empty — the defect was a HOLE, so the check has to be able to see cells. */
  B.packOrder = packOrder;
  B.cards = function () { return cards; };
  B.updateBoardVisibility = updateBoardVisibility;
  B.openConfig = openConfig;
  B.announce = announce;
  B.closeMenu = closeMenu;
  B.onGridKey = onGridKey;
  B.attachKeys = function () {
    if (B._keys) return;
    B._keys = true;
    document.addEventListener('keydown', function (e) { try { onGridKey(e); } catch (er) {} });
  };

  return B;
})();
