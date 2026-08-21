/* ============================================================================
 *  IntMap · THE ADD GALLERY — SEE IT BEFORE YOU ADD IT
 * ----------------------------------------------------------------------------
 *  window.IntMapWidgetGallery — search, categories, a real preview, a size switch, and the widget's
 *  settings BEFORE it lands on the board.
 *
 *  ══ WHAT IT REPLACES ══════════════════════════════════════════════════════════════════════════
 *  On a phone: a fully transparent <select> stretched over the "+" tile, so the only thing a reader
 *  saw was the platform's own picker wheel listing 39 names with no descriptions, no pictures, no
 *  search and no sizes. On a desktop: a flat list of the same 39 names. Neither could answer «what
 *  will this look like on my board», which is the one question an add screen exists for.
 *
 *  ══ ⚠ THE PREVIEW IS THE REAL RENDERER, AND IT NEVER FETCHES ═══════════════════════════════════
 *  Two rules make that safe, and both are the point rather than a limitation:
 *    · §8.7 — a preview must NOT trigger a location prompt. `WC.resolvePoint` is never asked; a
 *      location-shaped widget previews from the map centre, or from a sample point.
 *    · §8.8/§20 — opening the gallery must not call 39 APIs. A definition's LAST SUCCESSFUL payload
 *      is used when the cache has one (so the preview is genuinely this reader's data), and only
 *      otherwise a declared `sample`. A sample preview is LABELLED as one — an example dressed as
 *      live data is exactly the kind of lie §8's last line forbids.
 * ==========================================================================*/
window.IntMapWidgetGallery = (function () {
  'use strict';

  var WC = window.IntMapWidgetCore;
  var ST = window.IntMapWidgetStore;
  var LAY = window.IntMapWidgetLayout;
  var R = window.IntMapWidgetRender;
  var el = WC.el;
  var L = WC.L;

  var G = {};
  var sheet = null, lastFocus = null;
  var query = '', category = 'suggested', selected = null, previewSize = null, draftCfg = null;

  /* ── search. Name, description and the definition's own keyword list, in the reader's language,
        folded so that a query without diacritics still matches one with them. ───────────────── */
  function fold(s) {
    s = String(s || '').toLowerCase();
    try { s = s.normalize('NFKD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
    return s;
  }
  function haystack(def) {
    var bits = [def.nm(), def.desc ? def.desc() : '', def.id, def.family];
    try { if (def.keywords) bits = bits.concat(def.keywords()); } catch (e) {}
    return fold(bits.join(' '));
  }
  function matches(def, q) {
    if (!q) return true;
    var h = haystack(def);
    return fold(q).split(/\s+/).filter(Boolean).every(function (t) { return h.indexOf(t) >= 0; });
  }

  /* ── "suggested": what this reader actually uses, then what suits the moment ─────────────── */
  function suggested() {
    var recent = [];
    try { recent = JSON.parse(localStorage.getItem('intmap_widget_recent') || '[]'); } catch (e) {}
    var ctx = WC.context();
    var scored = WC.all().map(function (d) {
      var s = 0;
      var i = recent.indexOf(d.id);
      if (i >= 0) s += 60 - i * 3;
      if (/^intmap\./.test(d.id)) s += 24;                    /* the ones only this app can do */
      if (/^map\./.test(d.id) && ctx.map) s += 16;
      if (d.category === 'hazard-live') s += 12;
      if (ST.countOf(d.id) > 0 && !d.multi) s -= 100;         /* already placed and not repeatable */
      return { d: d, s: s };
    }).sort(function (a, b) { return b.s - a.s || a.d.id.localeCompare(b.d.id); });
    return scored.map(function (x) { return x.d; });
  }

  function listFor() {
    var all = category === 'suggested' ? suggested() : WC.all().filter(function (d) { return d.category === category; });
    return all.filter(function (d) { return matches(d, query); });
  }

  /* ══ THE SHEET ════════════════════════════════════════════════════════════════════════════════ */
  G.open = function (opts) {
    opts = opts || {};
    if (sheet) G.close();
    lastFocus = document.activeElement;
    query = ''; category = opts.category || 'suggested'; selected = null; previewSize = null; draftCfg = null;

    sheet = el('div', {
      class: 'wgt-sheet' + (WC.isMobile() ? ' mobile' : ' desktop'),
      role: 'dialog', 'aria-modal': 'true',
      'aria-label': L('Add a widget', 'ウィジェットを追加', 'Widget hinzufügen', 'Добавить виджет', 'Añadir widget'),
    });
    /* ⚠ THE SCRIM SWALLOWS THE GESTURE (§8). Without it a drag that starts on the sheet's backdrop
       reaches the map underneath and pans the world out from under an open dialog. */
    var scrim = el('div', { class: 'wgt-scrim', onpointerdown: function (e) { e.stopPropagation(); }, onclick: function () { G.close(); } });
    sheet.appendChild(scrim);

    var panel = el('div', { class: 'wgt-sheet-p' });
    panel.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    panel.addEventListener('wheel', function (e) { e.stopPropagation(); }, { passive: true });
    sheet.appendChild(panel);

    panel.appendChild(el('div', { class: 'wgt-sheet-h' }, [
      el('button', { type: 'button', class: 'wgt-sheet-x', 'aria-label': L('Close', '閉じる', 'Schließen', 'Закрыть', 'Cerrar'),
        onclick: function () { G.close(); } }, [WC.icon('close', { size: 16 })]),
      el('h2', { class: 'wgt-sheet-t', text: L('Add a widget', 'ウィジェットを追加', 'Widget hinzufügen', 'Добавить виджет', 'Añadir widget') }),
    ]));

    var search = el('input', {
      type: 'search', class: 'wgt-search', id: 'wgt-search',
      placeholder: L('Search widgets', 'ウィジェットを検索', 'Widgets suchen', 'Поиск виджетов', 'Buscar widgets'),
      'aria-label': L('Search widgets', 'ウィジェットを検索', 'Widgets suchen', 'Поиск виджетов', 'Buscar widgets'),
    });
    search.addEventListener('input', function () { query = search.value; renderList(); });
    panel.appendChild(el('div', { class: 'wgt-searchrow' }, [WC.icon('search', { size: 15 }), search]));

    panel.appendChild(el('div', { class: 'wgt-cats', role: 'tablist', 'aria-label': L('Categories', 'カテゴリ', 'Kategorien', 'Категории', 'Categorías') },
      WC.CATEGORIES.map(function (c) {
        return el('button', {
          type: 'button', class: 'wgt-cat' + (c.id === category ? ' on' : ''), role: 'tab',
          'aria-selected': c.id === category ? 'true' : 'false',
          onclick: function () { category = c.id; selected = null; renderCats(); renderList(); },
        }, [WC.icon(c.icon, { size: 13 }), el('span', { text: c.nm() })]);
      })));

    panel.appendChild(el('div', { class: 'wgt-sheet-body', id: 'wgt-sheet-body' }));
    document.body.appendChild(sheet);
    renderList();
    try { search.focus(); } catch (e) {}
    document.addEventListener('keydown', onKey, true);
  };
  function onKey(e) {
    if (!sheet) return;
    if (e.key === 'Escape') { e.preventDefault(); G.close(); return; }
    if (e.key === 'Tab') {
      /* focus stays inside the dialog while it is open (§18) */
      var f = sheet.querySelectorAll('button,input,select,a[href],[tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  G.close = function () {
    if (!sheet) return;
    document.removeEventListener('keydown', onKey, true);
    try { sheet.remove(); } catch (e) {}
    sheet = null;
    try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch (e) {}
  };
  G.isOpen = function () { return !!sheet; };

  function renderCats() {
    if (!sheet) return;
    [].forEach.call(sheet.querySelectorAll('.wgt-cat'), function (b, i) {
      var on = WC.CATEGORIES[i].id === category;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function renderList() {
    var body = sheet && sheet.querySelector('#wgt-sheet-body');
    if (!body) return;
    WC.clear(body);
    if (selected) { body.appendChild(detail(selected)); return; }

    var defs = listFor();
    if (!defs.length) {
      body.appendChild(el('p', { class: 'wgt-nores', text: L('Nothing matches that search', '該当するウィジェットはありません', 'Keine Treffer für diese Suche', 'Ничего не найдено', 'No hay resultados para esa búsqueda') }));
      return;
    }
    /* ⚠ GROUPED BY FAMILY, NOT FLAT (§8.4). Four clocks are ONE row that opens into four. */
    var fams = {}, order = [];
    defs.forEach(function (d) { if (!fams[d.family]) { fams[d.family] = []; order.push(d.family); } fams[d.family].push(d); });
    var list = el('div', { class: 'wgt-glist', role: 'list' });
    order.forEach(function (f) {
      var group = fams[f];
      if (group.length > 1) list.appendChild(el('div', { class: 'wgt-gfam', text: familyName(f) }));
      group.forEach(function (d) { list.appendChild(row(d)); });
    });
    body.appendChild(list);
  }
  function familyName(f) {
    var d = WC.all().filter(function (x) { return x.family === f; });
    if (!d.length) return f;
    /* the family's name is the family's own word for itself — the shortest common label */
    return ({
      time: L('Clocks', '時計', 'Uhren', 'Часы', 'Relojes'),
      progress: L('Progress', '進捗', 'Fortschritt', 'Прогресс', 'Progreso'),
      moon: L('Moon', '月', 'Mond', 'Луна', 'Luna'),
      sun: L('Sun', '太陽', 'Sonne', 'Солнце', 'Sol'),
      weather: L('Weather', '天気', 'Wetter', 'Погода', 'Tiempo'),
      markets: L('Markets', '市場', 'Märkte', 'Рынки', 'Mercados'),
      hazard: L('Hazards', '災害', 'Gefahren', 'Опасности', 'Riesgos'),
      world: L('World', '世界', 'Welt', 'Мир', 'Mundo'),
      knowledge: L('Knowledge', '知識', 'Wissen', 'Знания', 'Conocimiento'),
      space: L('Space', '宇宙', 'Weltraum', 'Космос', 'Espacio'),
      environment: L('Environment', '環境', 'Umwelt', 'Среда', 'Medio ambiente'),
      map: L('Map', '地図', 'Karte', 'Карта', 'Mapa'),
      intmap: L('IntMap', 'IntMap', 'IntMap', 'IntMap', 'IntMap'),
    })[f] || f;
  }

  function row(def) {
    var placed = ST.countOf(def.id);
    var canAdd = def.multi || !placed;
    return el('div', { class: 'wgt-grow', role: 'listitem' }, [
      el('button', {
        type: 'button', class: 'wgt-grow-b',
        'aria-label': def.nm() + '. ' + (def.desc ? def.desc() : ''),
        onclick: function () { selected = def; previewSize = def.defaultSize; draftCfg = def.defaultConfig ? def.defaultConfig(WC.context()) : {}; renderList(); },
      }, [
        el('span', { class: 'wgt-grow-i' }, [WC.icon(def.icon || 'grid', { size: 18 })]),
        el('span', { class: 'wgt-grow-txt' }, [
          el('span', { class: 'wgt-grow-n', text: def.nm() }),
          el('span', { class: 'wgt-grow-d', text: def.desc ? def.desc() : '' }),
          el('span', { class: 'wgt-grow-m' }, [
            el('span', { class: 'wgt-badge', text: def.supportedSizes.map(function (s) { return s.toUpperCase(); }).join(' · ') }),
            placed ? el('span', { class: 'wgt-badge on', text: def.multi
              ? (placed + ' ' + L('on your board', '個配置中', 'auf Ihrem Board', 'на доске', 'en su tablero'))
              : L('already added', '追加済み', 'bereits hinzugefügt', 'уже добавлен', 'ya añadido') }) : null,
            def.multi ? el('span', { class: 'wgt-badge', text: L('can add more than one', '複数追加できます', 'mehrfach möglich', 'можно несколько', 'se puede añadir varias veces') }) : null,
          ]),
        ]),
        el('span', { class: 'wgt-grow-a', 'aria-hidden': 'true' }, [WC.icon(canAdd ? 'chevronR' : 'check', { size: 15 })]),
      ]),
    ]);
  }

  /* ══ THE DETAIL VIEW — preview, sizes, settings, add ══════════════════════════════════════════ */
  function detail(def) {
    var placed = ST.countOf(def.id);
    var canAdd = def.multi || !placed;
    var box = el('div', { class: 'wgt-gdetail' });
    box.appendChild(el('div', { class: 'wgt-gdetail-h' }, [
      el('button', { type: 'button', class: 'wgt-back', 'aria-label': L('Back to the list', '一覧に戻る', 'Zurück zur Liste', 'Назад к списку', 'Volver a la lista'),
        onclick: function () { selected = null; renderList(); } }, [WC.icon('chevronL', { size: 15 }), el('span', { text: L('Back', '戻る', 'Zurück', 'Назад', 'Atrás') })]),
    ]));
    box.appendChild(el('div', { class: 'wgt-gdetail-t' }, [
      WC.icon(def.icon || 'grid', { size: 20 }),
      el('div', {}, [el('h3', { text: def.nm() }), el('p', { text: def.desc ? def.desc() : '' })]),
    ]));

    /* size switcher — a size the definition does not support is DISABLED, not hidden (§8.9) */
    box.appendChild(el('div', { class: 'wgt-sizes', role: 'radiogroup', 'aria-label': L('Size', 'サイズ', 'Größe', 'Размер', 'Tamaño') },
      WC.SIZES.map(function (s) {
        var ok = def.supportedSizes.indexOf(s) >= 0;
        return el('button', {
          type: 'button', class: 'wgt-size' + (s === previewSize ? ' on' : ''), role: 'radio',
          'aria-checked': s === previewSize ? 'true' : 'false',
          disabled: !ok,
          'aria-label': sizeWord(s) + (ok ? '' : ' — ' + L('not available for this widget', 'このウィジェットでは選べません', 'für dieses Widget nicht verfügbar', 'недоступно для этого виджета', 'no disponible para este widget')),
          onclick: function () { previewSize = s; renderList(); },
        }, [el('span', { text: sizeWord(s) })]);
      })));

    box.appendChild(preview(def, previewSize, draftCfg));

    if (def.configSchema && Object.keys(def.configSchema).length) {
      box.appendChild(el('div', { class: 'wgt-gcfg' }, [
        el('h4', { text: L('Settings', '設定', 'Einstellungen', 'Настройки', 'Ajustes') }),
        LAY.configForm(def, draftCfg, function (patch) {
          draftCfg = ST.validateConfig(def, Object.assign({}, draftCfg, patch));
          renderList();
        }),
      ]));
    }

    box.appendChild(el('div', { class: 'wgt-gadd' }, [
      el('button', {
        type: 'button', class: 'wgt-act primary', disabled: !canAdd,
        text: canAdd ? L('Add to the board', 'ボードに追加', 'Zum Board hinzufügen', 'Добавить на доску', 'Añadir al tablero')
          : L('Already on your board', '既にボードにあります', 'Bereits auf Ihrem Board', 'Уже на вашей доске', 'Ya está en su tablero'),
        onclick: function () {
          if (!canAdd) return;
          var it = ST.add(def.id, { size: previewSize, config: draftCfg });
          if (it) {
            window.IntMapWidgetSmart.markUsed(def.id);
            LAY.render();
            G.close();
            LAY.announce(def.nm() + ' — ' + L('added', '追加しました', 'hinzugefügt', 'добавлено', 'añadido'));
            /* ⚠ THE PERMISSION PROMPT HAPPENS HERE, AFTER AN EXPLICIT ADD — never in the preview. */
            if (def.configSchema && def.configSchema.source && draftCfg.source !== 'map' && WC.geoState().state === 'prompt') {
              WC.requestGeo(function () { LAY.repaintAll(); });
            }
          }
        },
      }),
    ]));
    return box;
  }
  function sizeWord(s) {
    return { s: L('Small', '小', 'Klein', 'Малый', 'Pequeño'), m: L('Medium', '中', 'Mittel', 'Средний', 'Mediano'), l: L('Large', '大', 'Groß', 'Большой', 'Grande') }[s];
  }

  /* ── the preview itself: the real renderer, the real card chrome, no network ─────────────── */
  function preview(def, size, cfg) {
    var span = WC.SPAN[size] || WC.SPAN.m;
    var card = el('article', { class: 'wgt-card wgt-' + size + ' wgt-preview', 'aria-label': L('Preview', 'プレビュー', 'Vorschau', 'Предпросмотр', 'Vista previa') + ': ' + def.nm() });
    card.style.setProperty('--wgt-pv-cols', String(span.cols));
    card.appendChild(R.head({ icon: def.icon, title: def.title ? def.title(cfg) : def.nm() }));
    var body = el('div', { class: 'wgt-cardbody' });
    card.appendChild(body);

    var src = previewState(def, size, cfg);
    var node = null;
    try {
      node = def.renderers[size] ? def.renderers[size](previewContext(), cfg, src.state, previewApi()) : null;
    } catch (e) { node = null; }
    if (!node) node = WC.skeleton(size);
    body.appendChild(node);

    var wrap = el('div', { class: 'wgt-pvwrap' }, [
      el('div', { class: 'wgt-pvstage', 'data-cols': String(span.cols) }, [card]),
    ]);
    if (src.sample) {
      /* ⚠ SAID OUT LOUD. A sample that looks live is the one thing §8 ends by forbidding. */
      wrap.appendChild(el('div', { class: 'wgt-pvnote', text: L('Example data — the real card fills in once it is added',
        'これは例です。追加すると実データになります', 'Beispieldaten – nach dem Hinzufügen echte Werte',
        'Пример данных — после добавления будут настоящие', 'Datos de ejemplo: al añadirlo mostrará datos reales') }));
    } else if (src.cached) {
      wrap.appendChild(el('div', { class: 'wgt-pvnote', text: L('Your most recent data', '最後に取得したデータ', 'Ihre zuletzt geladenen Daten', 'Ваши последние данные', 'Sus datos más recientes') }));
    }
    return wrap;
  }
  function previewState(def, size, cfg) {
    var base = { status: 'ready', size: size, now: new Date(), local: {}, lastSuccessfulAt: Date.now() };
    if (!def.loader) return { state: base, sample: false, cached: false };
    var key = null;
    try { key = def.requestKey ? String(def.requestKey(previewContext(), cfg)) : null; } catch (e) {}
    var hit = key ? ST.cacheGet(key) : null;
    if (hit && hit.data) return { state: Object.assign(base, { data: hit.data.d, source: hit.data.s, lastSuccessfulAt: hit.at }), sample: false, cached: true };
    if (def.sample) return { state: Object.assign(base, { data: def.sample(), source: null }), sample: true, cached: false };
    /* nothing to show honestly → the skeleton, which is what the card will actually look like while
       it loads. Not a fabricated number. */
    return { state: Object.assign(base, { status: 'loading' }), sample: false, cached: false };
  }
  /* ⚠ THE PREVIEW'S CONTEXT NEVER CARRIES A DEVICE LOCATION, whatever the real one holds — that is
     what makes «the preview cannot cause a prompt» true rather than merely intended. */
  function previewContext() {
    var c = Object.assign({}, WC.context());
    c.location = { state: 'prompt', lat: null, lng: null, at: 0, fresh: false };
    return c;
  }
  function previewApi() {
    var noop = function () {};
    return {
      refresh: noop, setConfig: noop, openConfig: noop, local: noop,
      needsLocation: function () {
        return WC.notice({ icon: 'pin', tone: 'muted', text: L('Uses your location once you add it', '追加すると現在地を使います', 'Nutzt Ihren Standort nach dem Hinzufügen', 'Использует ваше местоположение после добавления', 'Usará su ubicación al añadirlo') });
      },
      empty: function (t) { return WC.notice({ icon: 'check', tone: 'muted', text: t }); },
      requestLocation: noop, setLayer: noop, openLayer: noop, openLayersPanel: noop,
      flyCountry: noop, copy: noop, savePlace: noop, openMonitors: noop, openRoutePanel: noop,
      openAtlasBrief: noop, addCountryWatch: noop, chronosNow: noop, chronosShift: noop, runCommand: noop,
    };
  }

  G._matches = matches;
  G._suggested = suggested;
  G._preview = preview;
  return G;
})();
