/* ============================================================================
 *  IntMap · WIDGET DEFINITIONS — THE ONES ONLY THIS APP CAN BUILD
 * ----------------------------------------------------------------------------
 *  Map centre · map scale · featured layer · active layers · viewport situation · map news ·
 *  saved-place alerts · country watch · monitor summary · route status · Atlas briefing · Chronos.
 *
 *  ══ WHY THESE AND NOT MORE CLOCKS ═════════════════════════════════════════════════════════════
 *  A twelfth clock is a thing any dashboard can show. "Which warnings are in force inside the piece
 *  of the world I am looking at, from the same normalised feed the map is painting" is not — it
 *  exists because the alert pipeline, the layer registry, the news geocoder, the monitors and the
 *  master clock are all already here.
 *
 *  ══ ⚠ EVERY ONE OF THESE READS AN EXISTING SUBSYSTEM. NONE OF THEM RE-IMPLEMENTS ONE ═══════════
 *  The three read-only accessors this needed were added to the subsystems that own the data, not
 *  copied into this file:
 *      js/world-packs.js   STATE.alertsQuery({bbox|lng/lat|iso})   — reads `feats`, the SAME
 *                          normalised warning list the map paints. Severity is its `norm`, 0–4.
 *      js/routing.js       summary()                              — derived from the alternative
 *                          the reader is actually looking at, so it cannot disagree with the panel.
 *      js/atlas-console.js remember(brief)                        — hands over a brief the reader
 *                          asked for. Nothing here ever asks for one (§15.H).
 *  A card that computed its own severity, its own ETA or its own brief would be a second source of
 *  truth, and the two would drift — which is the defect this whole platform exists to stop.
 * ==========================================================================*/
window.IntMapWidgetDefsMap = (function () {
  'use strict';

  var WC = window.IntMapWidgetCore;
  var R = window.IntMapWidgetRender;
  var el = WC.el;
  var L = WC.L;

  function engine() { try { var E = window.IntMapGeoEngine; return (E && E.hasRenderer && E.hasRenderer()) ? E : null; } catch (e) { return null; } }
  function alertsPack() { try { return (window.IntMapWorld && window.IntMapWorld.alertsQuery) ? window.IntMapWorld : null; } catch (e) { return null; } }
  function dms(v, pos, neg) {
    var s = v < 0 ? neg : pos, a = Math.abs(v);
    var d = Math.floor(a), m = Math.floor((a - d) * 60), sec = ((a - d) * 60 - m) * 60;
    return d + '° ' + m + '′ ' + sec.toFixed(1) + '″ ' + s;
  }
  function haversineKm(a, b) {
    var Rk = 6371, t = Math.PI / 180;
    var dLat = (b[1] - a[1]) * t, dLng = (b[0] - a[0]) * t;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[1] * t) * Math.cos(b[1] * t) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * Rk * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  function distText(km) {
    if (km == null) return '';
    if (km < 1) return Math.round(km * 1000) + ' m';
    return WC.num(km, { maximumFractionDigits: km < 10 ? 1 : 0 }) + ' km';
  }
  function noMap(api) {
    return api.empty(L('The map has not finished loading yet', '地図の読み込みが完了していません', 'Die Karte ist noch nicht geladen', 'Карта ещё не загрузилась', 'El mapa aún no ha terminado de cargar'));
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     MAP CENTRE · MAP SCALE
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  WC.define({
    id: 'map.centre', family: 'map', variant: 'centre', category: 'map-place', icon: 'target',
    legacyIds: ['mapcenter'], multi: true,
    nm: function () { return L('Map centre', '地図の中心', 'Kartenmitte', 'Центр карты', 'Centro del mapa'); },
    desc: function () { return L('The coordinate the map is looking at, ready to copy', '地図が見ている座標（コピー可）', 'Die Koordinate der Kartenmitte, zum Kopieren', 'Координата центра карты, готовая к копированию', 'La coordenada del centro del mapa, lista para copiar'); },
    keywords: function () { return [L('coordinates', '座標', 'Koordinaten', 'координаты', 'coordenadas'), L('centre', '中心', 'Mitte', 'центр', 'centro'), 'lat', 'lng']; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {
      format: { type: 'enum', values: ['decimal', 'dms'], default: 'decimal',
        label: function () { return L('Format', '表示形式', 'Format', 'Формат', 'Formato'); },
        options: function () { return [{ value: 'decimal', label: L('Decimal degrees', '十進度', 'Dezimalgrad', 'Десятичные градусы', 'Grados decimales') },
          { value: 'dms', label: L('Degrees, minutes, seconds', '度分秒', 'Grad, Minuten, Sekunden', 'Градусы, минуты, секунды', 'Grados, minutos, segundos') }]; } },
    },
    defaultConfig: function () { return { format: 'decimal' }; },
    refreshPolicy: { kind: 'realtime-local', tick: function () { return 'minute'; }, relevantEvents: ['map'] },
    renderers: {
      s: function (ctx, cfg, st, api) {
        if (!ctx.map) return noMap(api);
        return el('div', { class: 'wgt-body' }, [R.value({ small: true,
          value: WC.num(ctx.map.lat, { maximumFractionDigits: 3 }) + '°, ' + WC.num(ctx.map.lng, { maximumFractionDigits: 3 }) + '°',
          caption: 'z' + WC.num(ctx.map.zoom, { maximumFractionDigits: 1 }) })]);
      },
      m: function (ctx, cfg, st, api) {
        if (!ctx.map) return noMap(api);
        var txt = cfg.format === 'dms'
          ? dms(ctx.map.lat, 'N', 'S') + ', ' + dms(ctx.map.lng, 'E', 'W')
          : WC.num(ctx.map.lat, { maximumFractionDigits: 5 }) + ', ' + WC.num(ctx.map.lng, { maximumFractionDigits: 5 });
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: txt, caption: L('zoom', 'ズーム', 'Zoom', 'зум', 'zoom') + ' ' + WC.num(ctx.map.zoom, { maximumFractionDigits: 2 }) }),
          R.actions([
            { label: L('Copy', 'コピー', 'Kopieren', 'Копировать', 'Copiar'), icon: 'check', run: function () { api.copy(txt); } },
            { label: L('Save this place', 'この地点を保存', 'Diesen Ort speichern', 'Сохранить место', 'Guardar este lugar'), icon: 'pin', run: function () { api.savePlace({ lat: ctx.map.lat, lng: ctx.map.lng }); } },
            { label: cfg.format === 'dms' ? L('Decimal', '十進度', 'Dezimal', 'Десятичные', 'Decimales') : L('D° M′ S″', '度分秒', 'G° M′ S″', 'Г° М′ С″', 'G° M′ S″'), icon: 'refresh', run: function () { api.setConfig({ format: cfg.format === 'dms' ? 'decimal' : 'dms' }); } },
          ]),
        ]);
      },
      l: function (ctx, cfg, st, api) {
        if (!ctx.map) return noMap(api);
        var b = ctx.map.bounds;
        var txt = cfg.format === 'dms'
          ? dms(ctx.map.lat, 'N', 'S') + ', ' + dms(ctx.map.lng, 'E', 'W')
          : WC.num(ctx.map.lat, { maximumFractionDigits: 5 }) + ', ' + WC.num(ctx.map.lng, { maximumFractionDigits: 5 });
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: txt }),
          b ? R.geo([{ lng: ctx.map.lng, lat: ctx.map.lat, r: 4, tone: 'accent' }], { height: 96, bounds: null,
            label: L('Where the map is looking', '地図が見ている位置', 'Wohin die Karte blickt', 'Куда смотрит карта', 'Adónde mira el mapa') }) : null,
          R.facts([
            { k: L('Zoom', 'ズーム', 'Zoom', 'Зум', 'Zoom'), v: WC.num(ctx.map.zoom, { maximumFractionDigits: 2 }) },
            { k: L('Scale', '縮尺', 'Maßstab', 'Масштаб', 'Escala'), v: scaleText(ctx.map.mPerPx) },
            b ? { k: L('West–East', '西–東', 'West–Ost', 'Запад–Восток', 'Oeste–Este'), v: WC.num(b.w, { maximumFractionDigits: 2 }) + '° … ' + WC.num(b.e, { maximumFractionDigits: 2 }) + '°' } : null,
            b ? { k: L('South–North', '南–北', 'Süd–Nord', 'Юг–Север', 'Sur–Norte'), v: WC.num(b.s, { maximumFractionDigits: 2 }) + '° … ' + WC.num(b.n, { maximumFractionDigits: 2 }) + '°' } : null,
          ], { cols: 2 }),
          R.actions([
            { label: L('Copy', 'コピー', 'Kopieren', 'Копировать', 'Copiar'), icon: 'check', run: function () { api.copy(txt); } },
            { label: L('Save this place', 'この地点を保存', 'Diesen Ort speichern', 'Сохранить место', 'Guardar este lugar'), icon: 'pin', run: function () { api.savePlace({ lat: ctx.map.lat, lng: ctx.map.lng }); } },
          ]),
        ]);
      },
    },
  });
  function scaleText(mpp) {
    if (mpp == null) return '—';
    return mpp >= 1000 ? WC.num(mpp / 1000, { maximumFractionDigits: 1 }) + ' km/px'
      : mpp >= 1 ? Math.round(mpp) + ' m/px' : Math.round(mpp * 100) + ' cm/px';
  }

  WC.define({
    id: 'map.scale', family: 'map', variant: 'scale', category: 'map-place', icon: 'ruler',
    legacyIds: ['mapscale'],
    nm: function () { return L('Map scale', '地図の縮尺', 'Kartenmaßstab', 'Масштаб карты', 'Escala del mapa'); },
    desc: function () { return L('How much ground a pixel covers, with something to compare it to', '1画素が示す距離と、比較の目安', 'Wie viel Boden ein Pixel abdeckt, mit Vergleich', 'Сколько земли в одном пикселе, с ориентиром', 'Cuánto terreno cubre un píxel, con una referencia'); },
    keywords: function () { return [L('scale', '縮尺', 'Maßstab', 'масштаб', 'escala'), L('distance', '距離', 'Entfernung', 'расстояние', 'distancia'), 'zoom']; },
    supportedSizes: ['s', 'm'], defaultSize: 's',
    configSchema: {}, defaultConfig: function () { return {}; },
    refreshPolicy: { kind: 'realtime-local', tick: function () { return 'minute'; }, relevantEvents: ['map'] },
    renderers: {
      s: function (ctx, cfg, st, api) {
        if (!ctx.map) return noMap(api);
        return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: scaleText(ctx.map.mPerPx), caption: 'z' + WC.num(ctx.map.zoom, { maximumFractionDigits: 1 }) })]);
      },
      m: function (ctx, cfg, st, api) {
        if (!ctx.map) return noMap(api);
        var bar = ctx.map.mPerPx * 100;
        /* something a reader can picture, chosen from the scale itself — never invented */
        var cmp = bar < 200 ? L('about a city block', '街区1つほど', 'etwa ein Häuserblock', 'примерно квартал', 'una manzana aproximadamente')
          : bar < 3000 ? L('about a neighbourhood', '一つの地区ほど', 'etwa ein Stadtviertel', 'примерно район', 'un barrio aproximadamente')
            : bar < 60000 ? L('about a city', '都市ひとつほど', 'etwa eine Stadt', 'примерно город', 'una ciudad aproximadamente')
              : bar < 800000 ? L('about a country', '国ひとつほど', 'etwa ein Land', 'примерно страна', 'un país aproximadamente')
                : L('about a continent', '大陸ほど', 'etwa ein Kontinent', 'примерно континент', 'un continente aproximadamente');
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: scaleText(ctx.map.mPerPx) }),
          el('div', { class: 'wgt-scalebar', role: 'img', 'aria-label': L('100 pixels is about', '100画素は約', '100 Pixel entsprechen etwa', '100 пикселей — примерно', '100 píxeles equivalen a') + ' ' + distText(bar / 1000) }, [
            el('span', { class: 'wgt-scalebar-b' }), el('span', { text: distText(bar / 1000) }),
          ]),
          R.facts([{ k: L('100 px covers', '100画素の距離', '100 px entsprechen', '100 пикселей', '100 px cubren'), v: distText(bar / 1000) }, { k: L('Comparable to', '目安', 'Vergleichbar mit', 'Сопоставимо с', 'Comparable a'), v: cmp }]),
        ]);
      },
    },
  });

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     FEATURED LAYER — a suggestion, not a coin toss (§7.K)
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  WC.define({
    id: 'map.featured-layer', family: 'map', variant: 'featured-layer', category: 'map-place', icon: 'sparkle',
    legacyIds: ['featured'],
    nm: function () { return L('Featured layer', 'おすすめレイヤー', 'Empfohlene Ebene', 'Рекомендуемый слой', 'Capa destacada'); },
    desc: function () { return L('A layer worth trying here, and a switch to turn it on', 'ここで試す価値のあるレイヤーと、その切替', 'Eine passende Ebene und ihr Schalter', 'Подходящий слой и переключатель', 'Una capa que probar aquí, con su interruptor'); },
    keywords: function () { return [L('layer', 'レイヤー', 'Ebene', 'слой', 'capa'), L('suggestion', 'おすすめ', 'Vorschlag', 'рекомендация', 'sugerencia'), L('discover', '発見', 'entdecken', 'открыть', 'descubrir')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {}, defaultConfig: function () { return {}; },
    refreshPolicy: { kind: 'realtime-local', tick: function () { return 'minute'; }, relevantEvents: ['map', 'layers'] },
    renderers: {
      s: function (ctx, cfg, st, api) {
        var c = featured(ctx, st); if (!c) return noMap(api);
        return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: c.label, caption: c.on ? L('shown', '表示中', 'sichtbar', 'показан', 'visible') : L('tap to show', 'タップで表示', 'zum Anzeigen tippen', 'нажмите, чтобы показать', 'toque para mostrar') })]);
      },
      m: function (ctx, cfg, st, api) {
        var c = featured(ctx, st); if (!c) return noMap(api);
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: c.label, caption: c.why }),
          R.actions([
            { label: c.on ? L('Hide it', '非表示にする', 'Ausblenden', 'Скрыть', 'Ocultar') : L('Show it', '表示する', 'Anzeigen', 'Показать', 'Mostrar'),
              icon: 'eye', toggle: true, on: c.on, primary: !c.on, run: function () { api.setLayer(c.id, !c.on); } },
            { label: L('Something else', '別の候補', 'Etwas anderes', 'Другой слой', 'Otra capa'), icon: 'refresh', run: function () { api.local({ skip: ((st.local && st.local.skip) || 0) + 1 }); } },
          ]),
        ]);
      },
      /* L: several candidates, each with its own switch — a shortlist, not a lottery */
      l: function (ctx, cfg, st, api) {
        var list = featuredList(ctx, st, 5); if (!list.length) return noMap(api);
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: list[0].label, caption: list[0].why }),
          el('div', { class: 'wgt-togglelist' }, list.map(function (c) {
            return el('div', { class: 'wgt-togglerow' }, [
              el('span', { class: 'wgt-togglerow-l', text: c.label }),
              el('button', { type: 'button', class: 'wgt-sw' + (c.on ? ' on' : ''), role: 'switch', 'aria-checked': c.on ? 'true' : 'false',
                'aria-label': c.label, onclick: function (ev) { ev.stopPropagation(); api.setLayer(c.id, !c.on); } }, [el('span', { class: 'wgt-sw-k' })]),
            ]);
          })),
          R.actions([{ label: L('Open the layers panel', 'レイヤーパネルを開く', 'Ebenenliste öffnen', 'Открыть панель слоёв', 'Abrir el panel de capas'), icon: 'layers', run: function () { api.openLayersPanel(); } }]),
        ]);
      },
    },
  });
  /* ⚠ NOT `Math.random()` OVER EVERY LAYER. §7.K asks the suggestion to relate to what is on screen,
     what was used recently and what is selected. The score is deterministic given the context, so a
     test can assert it; the reader can still step past a candidate, and THAT is the only randomness. */
  function featuredScore(l, ctx, recent) {
    var s = 0;
    if (l.on) return -1;                                   /* already shown — not a suggestion */
    if (recent.indexOf(l.id) >= 0) s += 3;
    if (ctx.map) {
      var z = ctx.map.zoom || 0;
      if (/quake|volcano|alert|fire|weather|wx|storm/i.test(l.id) && z < 6) s += 3;
      if (/street|building|transit|rail|poi|address/i.test(l.id) && z >= 11) s += 3;
      if (/border|country|admin|pop|gdp/i.test(l.id) && z >= 3 && z < 8) s += 2;
    }
    var hour = new Date().getHours();
    if (/night|light|sky|star|aurora/i.test(l.id) && (hour >= 19 || hour < 5)) s += 2;
    if (ctx.selection.country && /country|border|admin|flag/i.test(l.id)) s += 1;
    return s;
  }
  function featuredList(ctx, st, n) {
    var all = (ctx.layers && ctx.layers.all) || [];
    if (!all.length) return [];
    var recent = [];
    try { recent = JSON.parse(localStorage.getItem('intmap_recent_layers') || '[]'); } catch (e) {}
    var scored = all.map(function (l) { return { l: l, s: featuredScore(l, ctx, recent) }; })
      .filter(function (x) { return x.s >= 0; })
      .sort(function (a, b) { return b.s - a.s || a.l.id.localeCompare(b.l.id); });
    var skip = ((st && st.local && st.local.skip) || 0) % Math.max(1, scored.length);
    var order = scored.slice(skip).concat(scored.slice(0, skip));
    return order.slice(0, n || 1).map(function (x) {
      return { id: x.l.id, label: x.l.label, on: x.l.on, why: whyFeatured(x.s, ctx) };
    });
  }
  function featured(ctx, st) { return featuredList(ctx, st, 1)[0] || null; }
  function whyFeatured(s, ctx) {
    if (s >= 3 && ctx.map) return L('suits what you are looking at', '今の表示に合っています', 'passt zum aktuellen Ausschnitt', 'подходит к текущему виду', 'encaja con lo que está viendo');
    if (s >= 1) return L('related to your selection', '選択中の対象に関連', 'passt zu Ihrer Auswahl', 'связано с вашим выбором', 'relacionado con su selección');
    return L('one you have not tried yet', 'まだ試していないレイヤー', 'noch nicht ausprobiert', 'вы ещё не пробовали', 'aún no la ha probado');
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     ACTIVE LAYERS (§15.E)
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  WC.define({
    id: 'map.active-layers', family: 'map', variant: 'active-layers', category: 'map-place', icon: 'layers',
    nm: function () { return L('Active layers', '表示中のレイヤー', 'Aktive Ebenen', 'Активные слои', 'Capas activas'); },
    desc: function () { return L('What is drawn on the map, and switches for each', '地図に描かれているものと、その切替', 'Was auf der Karte liegt, mit Schaltern', 'Что нарисовано на карте, с переключателями', 'Qué se dibuja en el mapa, con interruptores'); },
    keywords: function () { return [L('layers', 'レイヤー', 'Ebenen', 'слои', 'capas'), L('active', '有効', 'aktiv', 'активные', 'activas'), L('overlay', 'オーバーレイ', 'Overlay', 'наложение', 'superposición')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {}, defaultConfig: function () { return {}; },
    refreshPolicy: { kind: 'realtime-local', tick: function () { return 'minute'; }, relevantEvents: ['layers'] },
    renderers: {
      s: function (ctx, cfg, st) {
        return el('div', { class: 'wgt-body' }, [R.value({ value: ctx.layers.count,
          caption: L('layers on', '表示中', 'Ebenen aktiv', 'слоёв включено', 'capas activas') })]);
      },
      m: function (ctx, cfg, st, api) {
        var on = ctx.layers.on.slice(0, 4);
        return el('div', { class: 'wgt-body' }, [
          R.value({ value: ctx.layers.count, caption: L('layers on', '表示中', 'Ebenen aktiv', 'слоёв включено', 'capas activas') }),
          on.length ? el('div', { class: 'wgt-togglelist' }, on.map(function (l) { return layerRow(l, api); })) : null,
          R.actions([
            { label: L('Open the layers panel', 'レイヤーパネルを開く', 'Ebenenliste öffnen', 'Открыть панель слоёв', 'Abrir el panel de capas'), icon: 'layers', run: function () { api.openLayersPanel(); } },
          ]),
        ]);
      },
      l: function (ctx, cfg, st, api) {
        var groups = {};
        ctx.layers.on.forEach(function (l) { (groups[l.group || ''] = groups[l.group || ''] || []).push(l); });
        var keys = Object.keys(groups).sort();
        return el('div', { class: 'wgt-body' }, [
          R.value({ value: ctx.layers.count, caption: L('layers on', '表示中', 'Ebenen aktiv', 'слоёв включено', 'capas activas') }),
          el('div', { class: 'wgt-groups' }, keys.map(function (g) {
            return el('div', { class: 'wgt-group' }, [
              g ? el('div', { class: 'wgt-group-h', text: g }) : null,
              el('div', { class: 'wgt-togglelist' }, groups[g].map(function (l) { return layerRow(l, api); })),
            ]);
          })),
          R.actions([
            { label: L('Hide them all', 'すべて非表示', 'Alle ausblenden', 'Скрыть все', 'Ocultar todas'), icon: 'close', run: function () { ctx.layers.on.forEach(function (l) { api.setLayer(l.id, false); }); } },
            { label: L('Open the layers panel', 'レイヤーパネルを開く', 'Ebenenliste öffnen', 'Открыть панель слоёв', 'Abrir el panel de capas'), icon: 'layers', run: function () { api.openLayersPanel(); } },
          ]),
        ]);
      },
    },
    emptyText: function () { return L('No layers are switched on', '表示中のレイヤーはありません', 'Keine Ebene ist eingeschaltet', 'Ни один слой не включён', 'No hay capas activadas'); },
  });
  function layerRow(l, api) {
    return el('div', { class: 'wgt-togglerow' }, [
      el('span', { class: 'wgt-togglerow-l', text: l.label }),
      el('button', { type: 'button', class: 'wgt-sw' + (l.on ? ' on' : ''), role: 'switch', 'aria-checked': l.on ? 'true' : 'false',
        'aria-label': l.label, onclick: function (ev) { ev.stopPropagation(); api.setLayer(l.id, !l.on); } }, [el('span', { class: 'wgt-sw-k' })]),
    ]);
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     VIEWPORT SITUATION (§15.B)
     ⚠ IT SAYS WHAT IT IS COUNTING. "3 warnings" without a scope reads as "in the world"; this card
     counts only what is INSIDE the current view and only among data already loaded, and the caption
     states both facts. A count that overstates its own scope is worse than no count.
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  WC.define({
    id: 'map.viewport-situation', family: 'map', variant: 'viewport-situation', category: 'hazard-live', icon: 'activity',
    nm: function () { return L('Situation in view', '表示範囲の状況', 'Lage im Ausschnitt', 'Обстановка в кадре', 'Situación en pantalla'); },
    desc: function () { return L('Live events inside the part of the world you are looking at', '今見ている範囲で起きていること', 'Ereignisse im aktuell sichtbaren Bereich', 'События в видимой части карты', 'Sucesos en la parte del mundo que está viendo'); },
    keywords: function () { return [L('situation', '状況', 'Lage', 'обстановка', 'situación'), L('viewport', '表示範囲', 'Ausschnitt', 'область просмотра', 'vista'), L('events', '事象', 'Ereignisse', 'события', 'sucesos'), L('live', 'ライブ', 'live', 'в реальном времени', 'en vivo')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {}, defaultConfig: function () { return {}; },
    refreshPolicy: { kind: 'realtime-local', tick: function () { return 'minute'; }, relevantEvents: ['map', 'layers'] },
    renderers: {
      s: function (ctx, cfg, st, api) {
        var v = viewport(ctx); if (!v) return noMap(api);
        if (!v.total) return api.empty(emptyView());
        var top = v.items[0];
        return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: top.title, caption: top.kindLabel })]);
      },
      m: function (ctx, cfg, st, api) {
        var v = viewport(ctx); if (!v) return noMap(api);
        if (!v.total) return api.empty(emptyView());
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: v.items[0].title, caption: v.items[0].kindLabel }),
          R.chips(v.kinds.map(function (k) { return { icon: k.icon, label: k.label, value: k.n }; })),
          el('div', { class: 'wgt-cap', text: scopeNote() }),
          R.actions([{ label: L('Show it', '地図で見る', 'Anzeigen', 'Показать', 'Mostrar'), icon: 'pin', run: function () { flyItem(v.items[0]); } }]),
        ]);
      },
      l: function (ctx, cfg, st, api) {
        var v = viewport(ctx); if (!v) return noMap(api);
        if (!v.total) return api.empty(emptyView());
        return el('div', { class: 'wgt-body' }, [
          R.chips(v.kinds.map(function (k) { return { icon: k.icon, label: k.label, value: k.n }; })),
          R.geo(v.items.filter(function (i) { return isFinite(i.lng); }).map(function (i) { return { lng: i.lng, lat: i.lat, tone: i.tone }; }),
            { height: 104, bounds: ctx.map.bounds, label: L('Events in the current view', '表示範囲内の事象', 'Ereignisse im Ausschnitt', 'События в текущем виде', 'Sucesos en la vista actual') }),
          R.list(v.items.slice(0, 6).map(function (i) {
            return { mark: i.mark, tone: i.tone, title: i.title, sub: i.kindLabel, trailing: i.at ? WC.ago(i.at) : '',
              onClick: isFinite(i.lng) ? function () { flyItem(i); } : undefined };
          }), { dense: true }),
          el('div', { class: 'wgt-cap', text: scopeNote() }),
        ]);
      },
    },
  });
  function emptyView() {
    return L('Nothing live is loaded inside this view', 'この表示範囲に読み込み済みのライブ情報はありません', 'In diesem Ausschnitt ist nichts Aktuelles geladen', 'В этом виде нет загруженных актуальных данных', 'No hay datos en vivo cargados en esta vista');
  }
  function scopeNote() {
    return L('Counts what is inside the current view, among data already loaded',
      '現在の表示範囲・取得済みのデータのみを数えています',
      'Zählt nur den aktuellen Ausschnitt und bereits geladene Daten',
      'Считается только текущий вид и уже загруженные данные',
      'Cuenta sólo la vista actual y los datos ya cargados');
  }
  function viewport(ctx) {
    if (!ctx.map || !ctx.map.bounds) return null;
    var b = ctx.map.bounds, items = [];
    var bbox = [b.w, b.s, b.e, b.n];
    /* warnings — the SAME normalised list the alert layer paints */
    var W = alertsPack();
    if (W) {
      var q = W.alertsQuery({ bbox: bbox, limit: 40 });
      (q.alerts || []).forEach(function (a) {
        items.push({ kind: 'alert', kindLabel: L('Warning', '警報', 'Warnung', 'Предупреждение', 'Aviso'), icon: 'bell',
          mark: R.severityMark(a.level), tone: 'sev' + a.level, title: a.kind + (a.place ? ' — ' + a.place : ''),
          at: a.at, lng: a.bbox ? (a.bbox[0] + a.bbox[2]) / 2 : null, lat: a.bbox ? (a.bbox[1] + a.bbox[3]) / 2 : null, sort: 100 + a.level * 10 });
      });
    }
    /* everything the renderer has actually drawn in this view, by source */
    var E = engine();
    if (E) {
      [{ src: 'news-points', kind: 'news', icon: 'news', label: L('News', 'ニュース', 'Nachrichten', 'Новости', 'Noticias'), title: 'title', sort: 40 },
        { src: 'quake-points', kind: 'quake', icon: 'wave', label: L('Earthquake', '地震', 'Erdbeben', 'Землетрясение', 'Sismo'), title: 'place', sort: 80 },
        { src: 'volcano-points', kind: 'volcano', icon: 'activity', label: L('Volcano', '火山', 'Vulkan', 'Вулкан', 'Volcán'), title: 'name', sort: 70 },
        { src: 'fire-points', kind: 'fire', icon: 'activity', label: L('Fire', '火災', 'Feuer', 'Пожар', 'Incendio'), title: 'name', sort: 60 },
        { src: 'aircraft-points', kind: 'aircraft', icon: 'satellite', label: L('Aircraft', '航空機', 'Flugzeug', 'Самолёт', 'Aeronave'), title: 'callsign', sort: 20 },
      ].forEach(function (s) {
        var fs = [];
        try { if (E.layers.hasSource(s.src)) fs = E.coords.querySourceFeatures(s.src, {}) || []; } catch (e) {}
        fs.forEach(function (f) {
          var c = f.geometry && f.geometry.coordinates;
          if (!c || !isFinite(c[0])) return;
          if (c[0] < b.w || c[0] > b.e || c[1] < b.s || c[1] > b.n) return;
          var p = f.properties || {};
          var t = String(p[s.title] || p.name || p.title || '').trim();
          if (!t) return;
          items.push({ kind: s.kind, kindLabel: s.label, icon: s.icon, mark: '·', tone: null,
            title: t, at: p.pubDate ? +new Date(p.pubDate) : (p.time || null), lng: c[0], lat: c[1], sort: s.sort });
        });
      });
    }
    /* one row per THING, deduplicated by what it says and where it is */
    var seen = {}, uniq = [];
    items.forEach(function (i) { var k = i.kind + '|' + i.title; if (seen[k]) return; seen[k] = 1; uniq.push(i); });
    uniq.sort(function (a, c) { return (c.sort - a.sort) || ((c.at || 0) - (a.at || 0)); });
    var kinds = {};
    uniq.forEach(function (i) { (kinds[i.kind] = kinds[i.kind] || { label: i.kindLabel, icon: i.icon, n: 0 }).n++; });
    return { total: uniq.length, items: uniq, kinds: Object.keys(kinds).map(function (k) { return kinds[k]; }) };
  }
  function flyItem(i) { if (i && isFinite(i.lng)) WC.flyTo({ center: [i.lng, i.lat], zoom: Math.max(5, (WC.context().map || {}).zoom || 5) }); }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     MAP NEWS (§15.C) — the geocoder's own output, re-read
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  WC.define({
    id: 'map.news', family: 'map', variant: 'news', category: 'knowledge', icon: 'news',
    nm: function () { return L('News on the map', '地図上のニュース', 'Nachrichten auf der Karte', 'Новости на карте', 'Noticias en el mapa'); },
    desc: function () { return L('Headlines placed near where the map is looking', '地図の中心付近に置かれた見出し', 'Schlagzeilen nahe dem Kartenausschnitt', 'Заголовки рядом с центром карты', 'Titulares cerca de donde mira el mapa'); },
    keywords: function () { return [L('news', 'ニュース', 'Nachrichten', 'новости', 'noticias'), L('headlines', '見出し', 'Schlagzeilen', 'заголовки', 'titulares'), L('nearby', '近く', 'in der Nähe', 'рядом', 'cerca')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    /* (#R416) the `by: subject|publisher` setting is gone with the pin toggle it mirrored — a news
       pin is placed where the story happened, and there is no second answer to choose between. */
    configSchema: {},
    defaultConfig: function () { return {}; },
    refreshPolicy: { kind: 'realtime-local', tick: function () { return 'minute'; }, relevantEvents: ['map', 'news'] },
    renderers: {
      s: function (ctx, cfg, st, api) {
        var n = mapNews(ctx, cfg, 1); if (!n.length) return api.empty(emptyNews());
        return el('div', { class: 'wgt-body' }, [R.article({ title: n[0].title, source: n[0].publisher, href: n[0].link })]);
      },
      m: function (ctx, cfg, st, api) {
        var n = mapNews(ctx, cfg, 3); if (!n.length) return api.empty(emptyNews());
        return el('div', { class: 'wgt-body' }, [
          R.list(n.map(function (a) {
            return { icon: 'news', title: a.title, sub: [a.publisher, a.km != null ? distText(a.km) : null, a.at ? WC.ago(a.at) : null].filter(Boolean).join(' · '), href: a.link };
          })),
        ]);
      },
      l: function (ctx, cfg, st, api) {
        var n = mapNews(ctx, cfg, 8); if (!n.length) return api.empty(emptyNews());
        return el('div', { class: 'wgt-body' }, [
          R.geo(n.filter(function (a) { return isFinite(a.lng); }).map(function (a) { return { lng: a.lng, lat: a.lat, tone: 'accent' }; }),
            { height: 96, bounds: ctx.map && ctx.map.bounds, label: L('Where these stories are placed', 'これらの記事の位置', 'Wo diese Meldungen verortet sind', 'Где размещены эти новости', 'Dónde se sitúan estas noticias') }),
          R.list(n.map(function (a) {
            return { icon: 'news', title: a.title, sub: [a.publisher, a.km != null ? distText(a.km) : null, a.at ? WC.ago(a.at) : null].filter(Boolean).join(' · '),
              href: a.link, trailing: '' };
          })),
        ]);
      },
    },
  });
  function emptyNews() {
    return L('No geolocated headlines are loaded for this area', 'この地域の地点付きニュースは読み込まれていません', 'Für diesen Bereich sind keine verorteten Meldungen geladen', 'Для этой области нет загруженных новостей с координатами', 'No hay titulares geolocalizados cargados para esta zona');
  }
  function mapNews(ctx, cfg, n) {
    var host = WC.host();
    var feats = (host && host.newsFeatures) || [];
    if (!feats.length || !ctx.map) return [];
    var c = [ctx.map.lng, ctx.map.lat];
    return feats.map(function (f) {
      var p = f.properties || {}, g = f.geometry && f.geometry.coordinates;
      if (!g || !isFinite(g[0])) return null;
      return { title: String(p.title || ''), publisher: String(p.publisher || ''), link: p.link || null,
        at: p.pubDate ? +new Date(p.pubDate) : null, lng: g[0], lat: g[1], km: haversineKm(c, g) };
    }).filter(function (x) { return x && x.title; })
      .sort(function (a, b) { return a.km - b.km; })
      .slice(0, n);
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     SAVED-PLACE ALERTS (§15.A)
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  WC.define({
    id: 'intmap.place-alerts', family: 'intmap', variant: 'place-alerts', category: 'hazard-live', icon: 'bell',
    nm: function () { return L('Alerts for your places', '保存地点の警報', 'Warnungen für Ihre Orte', 'Предупреждения по вашим местам', 'Avisos para sus lugares'); },
    desc: function () { return L('Warnings in force at the places you saved or are watching', '保存・監視している地点で発令中の警報', 'Warnungen an Ihren gespeicherten Orten', 'Действующие предупреждения по вашим местам', 'Avisos vigentes en los lugares que guardó'); },
    keywords: function () { return [L('alerts', '警報', 'Warnungen', 'предупреждения', 'avisos'), L('saved places', '保存地点', 'gespeicherte Orte', 'сохранённые места', 'lugares guardados'), L('warning', '注意報', 'Warnung', 'оповещение', 'alerta')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {
      includeHere: { type: 'boolean', default: true, label: function () { return L('Include my location', '現在地も含める', 'Meinen Standort einbeziehen', 'Включать моё местоположение', 'Incluir mi ubicación'); } },
      radiusKm: { type: 'number', default: 40, min: 5, max: 300, label: function () { return L('Around each place', '各地点の周辺', 'Umkreis je Ort', 'Вокруг каждого места', 'Alrededor de cada lugar'); } },
    },
    defaultConfig: function () { return { includeHere: true, radiusKm: 40 }; },
    refreshPolicy: { kind: 'realtime-local', tick: function () { return 'minute'; }, relevantEvents: ['map', 'geo', 'alerts'] },
    renderers: {
      s: function (ctx, cfg, st, api) {
        var r = placeAlerts(ctx, cfg);
        if (r.reason) return api.empty(r.reason);
        if (!r.rows.length) return api.empty(noAlerts());
        var a = r.rows[0];
        return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: a.kind, caption: a.placeName + ' · ' + R.severityWord(a.level) })]);
      },
      m: function (ctx, cfg, st, api) {
        var r = placeAlerts(ctx, cfg);
        if (r.reason) return api.empty(r.reason);
        if (!r.rows.length) return api.empty(noAlerts());
        return el('div', { class: 'wgt-body' }, [
          R.list(r.rows.slice(0, 3).map(function (a) {
            return R.alertRow({ level: a.level, kind: a.kind, place: a.placeName, issuer: a.feed, at: a.at, onClick: function () { flyAlert(a); } });
          }), { dense: true }),
          R.source({ at: r.at }),
        ]);
      },
      l: function (ctx, cfg, st, api) {
        var r = placeAlerts(ctx, cfg);
        if (r.reason) return api.empty(r.reason);
        if (!r.rows.length) return api.empty(noAlerts());
        var byPlace = {};
        r.rows.forEach(function (a) { (byPlace[a.placeName] = byPlace[a.placeName] || []).push(a); });
        return el('div', { class: 'wgt-body' }, [
          el('div', { class: 'wgt-groups' }, Object.keys(byPlace).map(function (p) {
            return el('div', { class: 'wgt-group' }, [
              el('div', { class: 'wgt-group-h', text: p }),
              R.list(byPlace[p].slice(0, 4).map(function (a) {
                return R.alertRow({ level: a.level, kind: a.kind, place: a.place, issuer: a.feed, at: a.at, onClick: function () { flyAlert(a); } });
              }), { dense: true }),
            ]);
          })),
          R.actions([
            { label: L('Open the warnings layer', '警報レイヤーを開く', 'Warnebene öffnen', 'Открыть слой предупреждений', 'Abrir la capa de avisos'), icon: 'layers', run: function () { api.setLayer('wp-dl-alerts', true); } },
            { label: L('Watch a place', '地点を監視', 'Ort beobachten', 'Наблюдать за местом', 'Vigilar un lugar'), icon: 'eye', run: function () { api.openMonitors(); } },
          ]),
          R.source({ at: r.at }),
        ]);
      },
    },
  });
  function noAlerts() {
    return L('No warnings are in force at your places', '保存地点で発令中の警報はありません', 'An Ihren Orten sind keine Warnungen aktiv', 'По вашим местам предупреждений нет', 'No hay avisos vigentes en sus lugares');
  }
  function placeAlerts(ctx, cfg) {
    var W = alertsPack();
    if (!W) return { rows: [], reason: L('The warnings layer has not been switched on yet', '警報レイヤーがまだ有効になっていません', 'Die Warnebene ist noch nicht eingeschaltet', 'Слой предупреждений ещё не включён', 'La capa de avisos aún no está activada') };
    var places = (ctx.places || []).slice();
    if (cfg.includeHere && ctx.location.state === 'granted' && ctx.location.lat != null) {
      places.unshift({ name: L('My location', '現在地', 'Mein Standort', 'Моё местоположение', 'Mi ubicación'), lat: ctx.location.lat, lng: ctx.location.lng });
    }
    if (!places.length) {
      return { rows: [], reason: L('Save a place, or allow your location, to watch it here', '地点を保存するか位置情報を許可すると、ここに表示されます', 'Speichern Sie einen Ort oder erlauben Sie Ihren Standort', 'Сохраните место или разрешите геолокацию', 'Guarde un lugar o permita su ubicación para verlo aquí') };
    }
    var pad = (cfg.radiusKm || 40) / 111;
    var rows = [], at = 0;
    places.forEach(function (p) {
      var q = W.alertsQuery({ lng: p.lng, lat: p.lat, padDeg: pad, limit: 6 });
      at = Math.max(at, q.at || 0);
      (q.alerts || []).forEach(function (a) { rows.push(Object.assign({ placeName: p.name || WC.countryName(a.iso, a.iso) }, a)); });
    });
    rows.sort(function (a, b) { return (b.level - a.level) || ((b.at || 0) - (a.at || 0)); });
    return { rows: rows, at: at };
  }
  function flyAlert(a) {
    if (a && a.bbox) WC.fitBounds([[a.bbox[0], a.bbox[1]], [a.bbox[2], a.bbox[3]]], { padding: 60, maxZoom: 9 });
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     COUNTRY WATCH (§15.D) — assembled from data already here; no AI is asked for
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  WC.define({
    id: 'intmap.country-watch', family: 'intmap', variant: 'country-watch', category: 'world', icon: 'eye',
    multi: true,
    nm: function () { return L('Country watch', '国のウォッチ', 'Länderbeobachtung', 'Наблюдение за страной', 'Vigilancia de país'); },
    desc: function () { return L('Statistics, warnings and headlines for one country', 'ひとつの国の統計・警報・見出し', 'Statistik, Warnungen und Meldungen zu einem Land', 'Статистика, предупреждения и новости по стране', 'Estadísticas, avisos y titulares de un país'); },
    keywords: function () { return [L('country', '国', 'Land', 'страна', 'país'), L('watchlist', 'ウォッチ', 'Beobachtung', 'наблюдение', 'vigilancia'), L('briefing', '概況', 'Lagebild', 'сводка', 'resumen')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {
      cc: { type: 'country', default: 'US', label: function () { return L('Country', '国', 'Land', 'Страна', 'País'); },
        options: function () { var D = window.IntMapWidgetDefsData; return (D ? D.countryRows() : []).map(function (r) { return { value: r.cc, label: WC.countryName(r.cc, r.name) }; }).sort(function (a, b) { return a.label.localeCompare(b.label); }); } },
      follow: { type: 'boolean', default: true, label: function () { return L('Follow the country selected on the map', '地図で選択中の国に追従', 'Dem auf der Karte gewählten Land folgen', 'Следовать за выбранной страной', 'Seguir al país seleccionado en el mapa'); } },
    },
    defaultConfig: function (ctx) { return { cc: (ctx && ctx.selection && ctx.selection.country) || 'US', follow: true }; },
    refreshPolicy: { kind: 'realtime-local', tick: function () { return 'minute'; }, relevantEvents: ['map', 'selection', 'alerts', 'news'] },
    title: function (cfg) { return WC.countryName(cfg.cc, cfg.cc); },
    renderers: {
      s: function (ctx, cfg, st, api) {
        var w = watch(ctx, cfg); if (!w) return noMap(api);
        return el('div', { class: 'wgt-body' }, [
          el('div', { class: 'wgt-row gap' }, [el('span', { class: 'wgt-flag', text: flagOf(w.cc), 'aria-hidden': 'true' }),
            R.value({ small: true, value: WC.countryName(w.cc, w.name),
              caption: w.alerts.length ? (w.alerts.length + ' ' + L('warnings', '警報', 'Warnungen', 'предупреждений', 'avisos')) : L('no warnings', '警報なし', 'keine Warnungen', 'нет предупреждений', 'sin avisos') })]),
        ]);
      },
      m: function (ctx, cfg, st, api) {
        var w = watch(ctx, cfg); if (!w) return noMap(api);
        return el('div', { class: 'wgt-body' }, [
          el('div', { class: 'wgt-row gap' }, [el('span', { class: 'wgt-flag', text: flagOf(w.cc), 'aria-hidden': 'true' }),
            R.value({ small: true, value: WC.countryName(w.cc, w.name) })]),
          R.chips([
            { icon: 'users', label: L('Population', '人口', 'Bevölkerung', 'Население', 'Población'), value: w.pop != null ? WC.compact(w.pop) : '—' },
            { icon: 'bell', label: L('Warnings', '警報', 'Warnungen', 'Предупреждения', 'Avisos'), value: w.alerts.length },
            { icon: 'news', label: L('Headlines', '見出し', 'Meldungen', 'Заголовки', 'Titulares'), value: w.news.length },
          ]),
          R.actions([
            { label: L('Show on the map', '地図で見る', 'Auf der Karte zeigen', 'Показать на карте', 'Ver en el mapa'), icon: 'pin', run: function () { api.flyCountry(w.cc); } },
            { label: L('Change country', '国を変更', 'Land ändern', 'Сменить страну', 'Cambiar país'), icon: 'gear', run: function () { api.openConfig(); } },
          ]),
        ]);
      },
      l: function (ctx, cfg, st, api) {
        var w = watch(ctx, cfg); if (!w) return noMap(api);
        return el('div', { class: 'wgt-body' }, [
          el('div', { class: 'wgt-row gap' }, [el('span', { class: 'wgt-flag big', text: flagOf(w.cc), 'aria-hidden': 'true' }),
            R.value({ small: true, value: WC.countryName(w.cc, w.name),
              caption: ctx.chronos && !ctx.chronos.isLive ? (L('as of', '時点', 'Stand', 'на дату', 'a fecha de') + ' ' + ctx.chronos.iso) : '' })]),
          R.facts([
            { k: L('Population', '人口', 'Bevölkerung', 'Население', 'Población'), v: w.pop != null ? WC.compact(w.pop) : '—' },
            { k: 'GDP', v: w.gdp != null ? '$' + WC.compact(w.gdp) : '—' },
            { k: L('Area', '面積', 'Fläche', 'Площадь', 'Superficie'), v: w.area != null ? WC.compact(w.area) + ' km²' : '—' },
            { k: L('Capital', '首都', 'Hauptstadt', 'Столица', 'Capital'), v: w.capital || '—' },
          ], { cols: 2 }),
          w.alerts.length ? el('div', { class: 'wgt-group' }, [
            el('div', { class: 'wgt-group-h', text: L('Warnings in force', '発令中の警報', 'Aktive Warnungen', 'Действующие предупреждения', 'Avisos vigentes') }),
            R.list(w.alerts.slice(0, 3).map(function (a) { return R.alertRow({ level: a.level, kind: a.kind, place: a.place, issuer: a.feed, at: a.at, onClick: function () { flyAlert(a); } }); }), { dense: true }),
          ]) : null,
          w.news.length ? el('div', { class: 'wgt-group' }, [
            el('div', { class: 'wgt-group-h', text: L('Recent headlines', '最近の見出し', 'Aktuelle Meldungen', 'Свежие заголовки', 'Titulares recientes') }),
            R.list(w.news.slice(0, 3).map(function (a) { return { icon: 'news', title: a.title, sub: a.publisher, href: a.link }; }), { dense: true }),
          ]) : null,
          R.actions([
            { label: L('Show on the map', '地図で見る', 'Auf der Karte zeigen', 'Показать на карте', 'Ver en el mapa'), icon: 'pin', run: function () { api.flyCountry(w.cc); } },
            { label: L('Change country', '国を変更', 'Land ändern', 'Сменить страну', 'Cambiar país'), icon: 'gear', run: function () { api.openConfig(); } },
          ]),
        ]);
      },
    },
  });
  function flagOf(cc) { var D = window.IntMapWidgetDefsData; return D ? D.flagEmoji(cc) : ''; }
  function watch(ctx, cfg) {
    var D = window.IntMapWidgetDefsData;
    var cc = (cfg.follow && ctx.selection.country) ? String(ctx.selection.country).toUpperCase() : cfg.cc;
    var row = (D ? D.countryRows() : []).find(function (r) { return r.cc === cc; }) || { cc: cc };
    var W = alertsPack();
    var iso3 = row.iso3 || null;
    var alerts = W ? (W.alertsQuery({ iso: iso3 || cc, limit: 8 }).alerts || []) : [];
    var news = mapNewsForCountry(cc);
    return Object.assign({ cc: cc, alerts: alerts, news: news }, row);
  }
  function mapNewsForCountry(cc) {
    var host = WC.host();
    var feats = (host && host.newsFeatures) || [];
    return feats.filter(function (f) { var p = f.properties || {}; return p.mapped && String(p.mapped).toUpperCase().indexOf(String(cc).toUpperCase()) >= 0; })
      .slice(0, 5)
      .map(function (f) { var p = f.properties || {}; return { title: String(p.title || ''), publisher: String(p.publisher || ''), link: p.link || null }; });
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     MONITOR SUMMARY (§15.F)
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  WC.define({
    id: 'intmap.monitors', family: 'intmap', variant: 'monitors', category: 'hazard-live', icon: 'eye',
    nm: function () { return L('Area monitors', '地域監視', 'Gebietsüberwachung', 'Мониторы районов', 'Monitores de zona'); },
    desc: function () { return L('The areas you have asked IntMap to keep an eye on', 'IntMap に監視を依頼した地域', 'Bereiche, die IntMap für Sie beobachtet', 'Районы, за которыми следит IntMap', 'Zonas que IntMap vigila por usted'); },
    keywords: function () { return [L('monitor', '監視', 'Überwachung', 'мониторинг', 'monitor'), L('watch area', '監視地域', 'Beobachtungsgebiet', 'зона наблюдения', 'zona vigilada'), L('report', 'レポート', 'Bericht', 'отчёт', 'informe')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {}, defaultConfig: function () { return {}; },
    refreshPolicy: { kind: 'stale-while-revalidate', minIntervalMs: 5 * 60000, staleAfterMs: 30 * 60000, cacheTtlMs: 0 },
    cacheable: false,                                       /* an account's monitors never go in a shared cache */
    requestKey: function () { return 'monitors:list'; },
    loader: function () {
      var M = window.IntMapMonitors;
      if (!M || !M._list) return Promise.resolve({ empty: true });
      return Promise.resolve(M._list()).then(function (rows) {
        WC.setMonitors(rows || []);            /* the Smart Stack asks the context, not the network */
        if (!Array.isArray(rows) || !rows.length) return { empty: true };
        return { data: rows, source: 'IntMap' };
      }).catch(function () { return { empty: true }; });
    },
    emptyText: function () { return L('You are not monitoring any area yet', 'まだ監視中の地域はありません', 'Sie beobachten noch kein Gebiet', 'Вы пока не наблюдаете ни за одним районом', 'Aún no vigila ninguna zona'); },
    renderers: {
      s: function (ctx, cfg, st) {
        if (!st.data) return null;
        return el('div', { class: 'wgt-body' }, [R.value({ value: st.data.length, caption: L('areas monitored', '監視中の地域', 'beobachtete Gebiete', 'наблюдаемых районов', 'zonas vigiladas') })]);
      },
      m: function (ctx, cfg, st, api) {
        if (!st.data) return null;
        return el('div', { class: 'wgt-body' }, [
          R.value({ value: st.data.length, caption: L('areas monitored', '監視中の地域', 'beobachtete Gebiete', 'наблюдаемых районов', 'zonas vigiladas') }),
          R.list(st.data.slice(0, 3).map(function (m) { return monRow(m, api); }), { dense: true }),
          R.actions([{ label: L('Open monitors', '監視を開く', 'Überwachung öffnen', 'Открыть мониторы', 'Abrir monitores'), icon: 'eye', run: function () { api.openMonitors(); } }]),
        ]);
      },
      l: function (ctx, cfg, st, api) {
        if (!st.data) return null;
        return el('div', { class: 'wgt-body' }, [
          R.value({ value: st.data.length, caption: L('areas monitored', '監視中の地域', 'beobachtete Gebiete', 'наблюдаемых районов', 'zonas vigiladas') }),
          R.list(st.data.slice(0, 8).map(function (m) { return monRow(m, api, true); }), { dense: true }),
          R.actions([{ label: L('Open monitors', '監視を開く', 'Überwachung öffnen', 'Открыть мониторы', 'Abrir monitores'), icon: 'eye', run: function () { api.openMonitors(); } }]),
        ]);
      },
    },
  });
  function monRow(m, api, big) {
    var M = window.IntMapMonitors;
    var status = '';
    try { status = (M && M.statusLabel) ? M.statusLabel(m) : ''; } catch (e) {}
    return {
      icon: m.enabled === false ? 'close' : 'eye',
      title: m.name || (m.id || ''),
      sub: [status, big && m.last_run_at ? WC.ago(+new Date(m.last_run_at)) : null].filter(Boolean).join(' · '),
      label: (m.name || '') + (status ? ' — ' + status : ''),
      onClick: function () { try { if (M && M.openDetail) M.openDetail(m.id); else api.openMonitors(); } catch (e) { api.openMonitors(); } },
    };
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     ROUTE STATUS (§15.G)
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  WC.define({
    id: 'intmap.route', family: 'intmap', variant: 'route', category: 'map-place', icon: 'route',
    nm: function () { return L('Route status', '経路の状況', 'Routenstatus', 'Состояние маршрута', 'Estado de la ruta'); },
    desc: function () { return L('The route currently on the map, and where to go next with it', '地図上の経路と、その先の操作', 'Die aktuelle Route und was Sie damit tun können', 'Текущий маршрут и что с ним делать', 'La ruta actual y qué hacer con ella'); },
    keywords: function () { return [L('route', '経路', 'Route', 'маршрут', 'ruta'), L('navigation', 'ナビ', 'Navigation', 'навигация', 'navegación'), 'ETA', L('distance', '距離', 'Entfernung', 'расстояние', 'distancia')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {}, defaultConfig: function () { return {}; },
    refreshPolicy: { kind: 'realtime-local', tick: function () { return 'minute'; }, relevantEvents: ['route', 'map'] },
    renderers: {
      s: function (ctx, cfg, st, api) {
        var r = route(); if (!r.active) return api.empty(noRoute());
        return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: distText(r.distance / 1000), caption: durText(r.duration) })]);
      },
      m: function (ctx, cfg, st, api) {
        var r = route(); if (!r.active) return api.empty(noRoute());
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: distText(r.distance / 1000), caption: durText(r.duration) }),
          R.chips([
            r.mode ? { icon: 'route', label: L('Mode', '手段', 'Modus', 'Способ', 'Modo'), value: r.mode } : null,
            { icon: 'target', label: L('Alternatives', '代替経路', 'Alternativen', 'Варианты', 'Alternativas'), value: r.alternatives },
          ]),
          R.actions([
            { label: L('Show the whole route', '経路全体を表示', 'Ganze Route zeigen', 'Показать весь маршрут', 'Ver la ruta completa'), icon: 'pin', run: function () { fitRoute(r); } },
            { label: L('Open the route panel', '経路パネルを開く', 'Routenpanel öffnen', 'Открыть панель маршрута', 'Abrir el panel de ruta'), icon: 'route', run: function () { api.openRoutePanel(); } },
          ]),
        ]);
      },
      l: function (ctx, cfg, st, api) {
        var r = route(); if (!r.active) return api.empty(noRoute());
        var b = r.bbox;
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: distText(r.distance / 1000), caption: durText(r.duration) }),
          b ? R.geo([], { height: 96, bounds: { w: b[0], s: b[1], e: b[2], n: b[3] }, track: [r.coords],
            label: L('The route on the map', '地図上の経路', 'Die Route auf der Karte', 'Маршрут на карте', 'La ruta en el mapa') }) : null,
          r.nextSteps && r.nextSteps.length ? R.list(r.nextSteps.map(function (s) {
            return { icon: 'route', title: s.name || s.type || '', trailing: s.distance != null ? distText(s.distance / 1000) : '' };
          }), { dense: true }) : null,
          R.actions([
            { label: L('Show the whole route', '経路全体を表示', 'Ganze Route zeigen', 'Показать весь маршрут', 'Ver la ruta completa'), icon: 'pin', run: function () { fitRoute(r); } },
            { label: L('Elevation along the way', '沿道の標高', 'Höhenprofil', 'Профиль высот', 'Perfil de altitud'), icon: 'chart', run: function () { api.runCommand('analysis.elevation'); } },
            { label: L('Open the route panel', '経路パネルを開く', 'Routenpanel öffnen', 'Открыть панель маршрута', 'Abrir el panel de ruta'), icon: 'route', run: function () { api.openRoutePanel(); } },
          ]),
        ]);
      },
    },
  });
  function route() { try { var R2 = window.IntMapRouting; return (R2 && R2.summary) ? R2.summary() : { active: false }; } catch (e) { return { active: false }; } }
  function noRoute() {
    return L('No route is on the map — plan one and it will appear here', '経路が表示されていません。作成するとここに出ます', 'Keine Route auf der Karte – planen Sie eine', 'Маршрута нет — постройте его, и он появится здесь', 'No hay ruta en el mapa: planifique una y aparecerá aquí');
  }
  function fitRoute(r) { if (r && r.bbox) WC.fitBounds([[r.bbox[0], r.bbox[1]], [r.bbox[2], r.bbox[3]]], { padding: 50 }); }
  function durText(sec) {
    if (sec == null) return '';
    var m = Math.round(sec / 60), h = Math.floor(m / 60);
    return h ? L(h + 'h ' + (m % 60) + 'm', h + '時間' + (m % 60) + '分', h + ' Std. ' + (m % 60) + ' Min.', h + ' ч ' + (m % 60) + ' мин', h + ' h ' + (m % 60) + ' min')
      : L(m + ' min', m + '分', m + ' Min.', m + ' мин', m + ' min');
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     ATLAS BRIEFING (§15.H) — ⚠ THIS CARD NEVER SENDS AN AI REQUEST
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  window.IntMapWidgetBriefStore = (function () {
    var KEY = 'intmap_widget_brief1';
    function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
    return {
      get: read,
      remember: function (b) {
        try { localStorage.setItem(KEY, JSON.stringify({ place: String(b.place || ''), text: String(b.text || '').slice(0, 6000), at: +b.at || Date.now() })); } catch (e) {}
        WC.emit('brief');
      },
    };
  })();
  WC.define({
    id: 'intmap.atlas-brief', family: 'intmap', variant: 'atlas-brief', category: 'knowledge', icon: 'sparkle',
    nm: function () { return L('Atlas briefing', 'Atlas ブリーフィング', 'Atlas-Lagebericht', 'Сводка Atlas', 'Informe de Atlas'); },
    desc: function () { return L('The last briefing you asked Atlas for — never generated on its own', '最後に依頼したブリーフィング（自動生成はしません）', 'Der zuletzt angeforderte Bericht – nie automatisch erzeugt', 'Последняя запрошенная сводка — сама не создаётся', 'El último informe que pidió: nunca se genera solo'); },
    keywords: function () { return ['Atlas', L('briefing', 'ブリーフィング', 'Lagebericht', 'сводка', 'informe'), L('summary', '要約', 'Zusammenfassung', 'резюме', 'resumen')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {}, defaultConfig: function () { return {}; },
    /* ⚠ `manual` IS THE WHOLE POINT. No interval, no events, no `loader`. The scheduler cannot make
       this card do anything, so no code path exists by which the board spends an AI request. */
    refreshPolicy: { kind: 'manual' },
    renderers: {
      s: function (ctx, cfg, st, api) {
        var b = window.IntMapWidgetBriefStore.get();
        if (!b) return briefEmpty(api, ctx);
        return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: b.place, caption: WC.ago(b.at) })]);
      },
      m: function (ctx, cfg, st, api) {
        var b = window.IntMapWidgetBriefStore.get();
        if (!b) return briefEmpty(api, ctx);
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: b.place, caption: L('briefed', '作成', 'erstellt', 'составлено', 'generado') + ' ' + WC.ago(b.at) }),
          el('p', { class: 'wgt-para', text: plain(b.text).slice(0, 220) }),
          R.actions([{ label: L('Ask Atlas again', 'Atlas に再依頼', 'Atlas erneut fragen', 'Спросить Atlas снова', 'Preguntar a Atlas otra vez'), icon: 'sparkle', run: function () { api.openAtlasBrief(); } }]),
        ]);
      },
      l: function (ctx, cfg, st, api) {
        var b = window.IntMapWidgetBriefStore.get();
        if (!b) return briefEmpty(api, ctx);
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: b.place, caption: L('briefed', '作成', 'erstellt', 'составлено', 'generado') + ' ' + WC.ago(b.at) }),
          el('p', { class: 'wgt-para', text: plain(b.text).slice(0, 900) }),
          R.actions([{ label: L('Ask Atlas again', 'Atlas に再依頼', 'Atlas erneut fragen', 'Спросить Atlas снова', 'Preguntar a Atlas otra vez'), icon: 'sparkle', run: function () { api.openAtlasBrief(); } }]),
          el('div', { class: 'wgt-cap', text: L('Atlas is only asked when you press the button', 'ボタンを押したときだけ Atlas に依頼します', 'Atlas wird nur auf Knopfdruck gefragt', 'Atlas спрашивается только по нажатию', 'Sólo se pregunta a Atlas al pulsar el botón') }),
        ]);
      },
    },
  });
  function plain(md) { return String(md || '').replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim(); }
  function briefEmpty(api, ctx) {
    return el('div', { class: 'wgt-body' }, [
      WC.notice({
        icon: 'sparkle', tone: 'muted',
        text: L('No briefing yet', 'まだブリーフィングはありません', 'Noch kein Lagebericht', 'Сводки пока нет', 'Aún no hay informe'),
        action: { label: L('Ask Atlas for one', 'Atlas に依頼', 'Atlas darum bitten', 'Запросить у Atlas', 'Pedir uno a Atlas'), run: function () { api.openAtlasBrief(); } },
      }),
      el('div', { class: 'wgt-cap', text: L('Nothing is generated automatically', '自動では作成されません', 'Es wird nichts automatisch erzeugt', 'Ничего не создаётся автоматически', 'No se genera nada automáticamente') }),
    ]);
    void ctx;
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     CHRONOS CONTEXT (§15.I)
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  WC.define({
    id: 'intmap.chronos', family: 'intmap', variant: 'chronos', category: 'time-cal', icon: 'clock',
    /* ⚠ NOT A TRANSLATION CALL. «Chronos» is what the reader calls this app's master clock
       (js/chronos.js) — a name, not prose, and identical in all nine languages by design. */
    nm: function () { return 'Chronos'; },
    desc: function () { return L('The time the whole map is showing, and how far it is from now', '地図全体が示している時刻と、現在との差', 'Die Zeit, die die ganze Karte zeigt', 'Время, которое показывает вся карта', 'La hora que muestra todo el mapa'); },
    keywords: function () { return ['Chronos', L('time travel', '時刻移動', 'Zeitreise', 'путешествие во времени', 'viaje en el tiempo'), L('history', '過去', 'Geschichte', 'история', 'historia'), L('forecast', '予報', 'Vorhersage', 'прогноз', 'pronóstico')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {}, defaultConfig: function () { return {}; },
    refreshPolicy: { kind: 'realtime-local', tick: function () { return 'minute'; }, relevantEvents: ['chronos'] },
    renderers: {
      s: function (ctx, cfg, st, api) {
        if (!ctx.chronos) return noMap(api);
        return el('div', { class: 'wgt-body' }, [R.value({ small: true,
          value: ctx.chronos.isLive ? L('Now', '現在', 'Jetzt', 'Сейчас', 'Ahora') : WC.date(new Date(ctx.chronos.when), { dateStyle: 'medium' }),
          caption: ctx.chronos.isLive ? L('live', 'ライブ', 'live', 'вживую', 'en vivo') : chronoOffset(ctx) })]);
      },
      m: function (ctx, cfg, st, api) {
        if (!ctx.chronos) return noMap(api);
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true,
            value: ctx.chronos.isLive ? L('Now', '現在', 'Jetzt', 'Сейчас', 'Ahora') : WC.date(new Date(ctx.chronos.when), { dateStyle: 'long' }),
            caption: ctx.chronos.isLive ? L('the map is showing live data', '地図はライブデータを表示中', 'Die Karte zeigt Live-Daten', 'Карта показывает актуальные данные', 'El mapa muestra datos en vivo') : chronoOffset(ctx) }),
          R.chips([
            { icon: 'clock', label: L('State', '状態', 'Zustand', 'Состояние', 'Estado'), value: ctx.chronos.isLive ? L('present', '現在', 'Gegenwart', 'настоящее', 'presente') : (new Date(ctx.chronos.when) > new Date() ? L('forecast', '予報', 'Vorhersage', 'прогноз', 'pronóstico') : L('past', '過去', 'Vergangenheit', 'прошлое', 'pasado')) },
            { icon: 'world', label: L('Zone', 'タイムゾーン', 'Zeitzone', 'Пояс', 'Zona'), value: WC.tz() || 'auto' },
          ]),
          R.actions([
            { label: L('Back to now', '現在に戻す', 'Zurück zu jetzt', 'Вернуться к сейчас', 'Volver a ahora'), icon: 'refresh', primary: !ctx.chronos.isLive, run: function () { api.chronosNow(); } },
          ]),
        ]);
      },
      l: function (ctx, cfg, st, api) {
        if (!ctx.chronos) return noMap(api);
        var timeLayers = (ctx.layers.on || []).filter(function (l) { return /wx|weather|quake|alert|fire|hist|time|sat|night/i.test(l.id); });
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true,
            value: ctx.chronos.isLive ? L('Now', '現在', 'Jetzt', 'Сейчас', 'Ahora') : WC.date(new Date(ctx.chronos.when), { dateStyle: 'full' }),
            caption: ctx.chronos.isLive ? L('the map is showing live data', '地図はライブデータを表示中', 'Die Karte zeigt Live-Daten', 'Карта показывает актуальные данные', 'El mapa muestra datos en vivo') : chronoOffset(ctx) }),
          timeLayers.length ? el('div', { class: 'wgt-group' }, [
            el('div', { class: 'wgt-group-h', text: L('Layers that follow this time', 'この時刻に追従するレイヤー', 'Ebenen, die dieser Zeit folgen', 'Слои, следующие этому времени', 'Capas que siguen esta hora') }),
            R.list(timeLayers.slice(0, 5).map(function (l) { return { icon: 'layers', title: l.label }; }), { dense: true }),
          ]) : null,
          R.actions([
            { label: L('A day earlier', '1日前', 'Ein Tag früher', 'На день раньше', 'Un día antes'), icon: 'chevronL', run: function () { api.chronosShift(-1); } },
            { label: L('Back to now', '現在に戻す', 'Zurück zu jetzt', 'Вернуться к сейчас', 'Volver a ahora'), icon: 'refresh', primary: !ctx.chronos.isLive, run: function () { api.chronosNow(); } },
            { label: L('A day later', '1日後', 'Ein Tag später', 'На день позже', 'Un día después'), icon: 'chevronR', run: function () { api.chronosShift(1); } },
          ]),
        ]);
      },
    },
  });
  function chronoOffset(ctx) {
    var d = Math.round((+new Date(ctx.chronos.when) - Date.now()) / 864e5);
    if (d === 0) return L('today, but not live', '本日（ライブではありません）', 'heute, aber nicht live', 'сегодня, но не вживую', 'hoy, pero no en vivo');
    return d < 0 ? Math.abs(d) + L(' days ago', '日前', ' Tage zurück', ' дн. назад', ' días atrás')
      : L('in ', 'あと', 'in ', 'через ', 'en ') + d + L(' days', '日', ' Tagen', ' дн.', ' días');
  }

  return { viewport: viewport, featuredList: featuredList, placeAlerts: placeAlerts, mapNews: mapNews, scaleText: scaleText, haversineKm: haversineKm };
})();
