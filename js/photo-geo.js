/* ============================================================================
 *  IntMap · PHOTO GEOLOCATION, THE PANEL — window.IntMapPhotoGeo   (#R527)
 * ----------------------------------------------------------------------------
 *  「山並み写真から撮影地点・撮影方向を探す機能」 — the reader's half of it.
 *
 *      photograph  ->  search rectangle  ->  check the traced skyline  ->  search
 *                  ->  compare candidates  ->  see the computed skyline over the photograph
 *
 *  The arithmetic is elsewhere and deliberately: js/photo-geo-terrain.js (what a place can see),
 *  js/photo-geo-skyline.js (where the sky stops in the picture), js/photo-geo-match.js (the camera
 *  and the agreement), js/photo-geo-search.js (the sweep), and src/photo-geo-worker.js, which runs
 *  the last three off the main thread. This file owns the panel, the map layers, and the reader.
 *
 *  ── WHAT THIS PANEL REFUSES TO DO ───────────────────────────────────────────────────────────────
 *   · It never reports an EXIF coordinate as a result. If the file carries one it is SHOWN, clearly
 *     labelled as having come out of the file header, and it is not fed to the search — see the
 *     header of js/photo-geo-exif.js for why that distinction is the whole honesty of the feature.
 *   · It never narrows the rectangle behind the reader's back. If the area is too large for the
 *     budget the spacing widens and BOTH numbers are shown before anything starts; unsearched
 *     ground is never drawn as searched.
 *   · It never prints a coordinate finer than the grid it was found on, and never converts a score
 *     into a probability.
 *   · An automatic trace that is wrong is a trace the reader can fix — redraw a stretch, mask out a
 *     tree, or draw the whole ridge by hand — because the alternative is a wrong trace silently
 *     becoming a wrong place.
 * ==========================================================================*/
/* ⚠ THE WHOLE FEATURE RIDES THIS ONE CHUNK, AND THAT IS THE POINT. Five computation modules and the
   worker client are imported HERE rather than from src/main.js, where the other three worker clients
   live — because those carry features the shell already needs, and this one carries a panel nobody
   has opened. Nothing below is downloaded until IntMapLazy fetches `photoGeo`, and the worker script
   itself is a separate asset that `new URL(..., import.meta.url)` only names; it is not fetched
   until the first search actually starts one. */
import './photo-geo-terrain.js';
import './photo-geo-match.js';
import './photo-geo-skyline.js';
import './photo-geo-exif.js';
import './photo-geo-search.js';
import '../src/photo-geo-worker-client.js';

window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.photoGeo = function (HOST) {
  const GE = () => window.IntMapGeoEngine;
  const L = window.IntMapLang.pick(() => HOST.lang);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const SRC = 'photogeo-src', LYR_PT = 'photogeo-pt', LYR_SEL = 'photogeo-sel', LYR_VIEW = 'photogeo-view', LYR_LBL = 'photogeo-lbl';
  const SRC_AREA = 'photogeo-area-src', LYR_AREA = 'photogeo-area', LYR_AREAL = 'photogeo-area-line';
  /* the analysis copy is small on purpose: the skyline is an angle per column, and 900 columns is
     already finer than the terrain can answer (js/photo-geo-terrain.js keeps ~0.15 deg) */
  const ANALYSIS_W = 900;

  let panel = null, state = null, job = null, drawing = null;

  function blank() {
    return {
      file: null, exif: null, orig: null, analysis: null, skyline: null,
      area: null, plan: null, result: null, selected: 0,
      phase: 'idle',          /* idle | ready | planning | searching | aborted | done | failed */
      progress: null, error: null,
      edit: 'none',           /* none | draw | mask | unmask */
      tuned: null, tuning: false, usingWorker: null
    };
  }

  /* ═══ the photograph ═══════════════════════════════════════════════════════════════════════════ */
  async function loadFile(file) {
    if (!file || !/^image\//.test(file.type || '')) {
      state.error = L('That file is not an image.', 'その ファイルは画像ではありません。', 'Diese Datei ist kein Bild.', 'Этот файл не является изображением.', 'Ese archivo no es una imagen.');
      render(); return;
    }
    state = Object.assign(blank(), { area: state && state.area, phase: 'ready' });
    state.file = { name: file.name, size: file.size, type: file.type };
    try {
      const buf = await file.arrayBuffer();
      state.exif = window.IntMapPhotoExif ? window.IntMapPhotoExif.parse(buf) : null;
      const bmp = await createImageBitmap(new Blob([buf], { type: file.type }));
      /* ⚠ ORIENTATION IS APPLIED HERE, NOT LEFT TO CSS. createImageBitmap gives raw pixels; a
         portrait photograph from a phone would otherwise be analysed lying on its side, and every
         angle computed from it would be wrong by 90 degrees while looking perfectly plausible. */
      const tr = window.IntMapPhotoExif
        ? window.IntMapPhotoExif.orientationTransform(state.exif ? state.exif.orientation : 1)
        : { rotateDeg: 0, flipX: false, swap: false };
      const ow = tr.swap ? bmp.height : bmp.width, oh = tr.swap ? bmp.width : bmp.height;
      const sc = Math.min(1, ANALYSIS_W / ow);
      const aw = Math.max(1, Math.round(ow * sc)), ah = Math.max(1, Math.round(oh * sc));
      const cv = document.createElement('canvas'); cv.width = aw; cv.height = ah;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.save();
      cx.translate(aw / 2, ah / 2);
      cx.rotate(tr.rotateDeg * Math.PI / 180);
      if (tr.flipX) cx.scale(-1, 1);
      const dw = tr.swap ? ah : aw, dh = tr.swap ? aw : ah;
      cx.drawImage(bmp, -dw / 2, -dh / 2, dw, dh);
      cx.restore();
      state.orig = { width: ow, height: oh, url: cv.toDataURL('image/jpeg', 0.9) };
      state.analysis = { width: aw, height: ah, data: cx.getImageData(0, 0, aw, ah).data };
      try { bmp.close(); } catch (_) { }
      retrace();
    } catch (e) {
      state.error = L('The image could not be read.', '画像を読み込めませんでした。', 'Das Bild konnte nicht gelesen werden.', 'Не удалось прочитать изображение.', 'No se pudo leer la imagen.');
    }
    render();
  }

  function retrace() {
    if (!state.analysis || !window.IntMapPhotoSkyline) return;
    state.skyline = window.IntMapPhotoSkyline.extract(state.analysis);
    state.result = null;
    render();
  }

  /* ═══ the search rectangle ═════════════════════════════════════════════════════════════════════ */
  /* Two clicks, the way js/routing.js startAreaDraw has drawn one since #R291 — including the rule
     that a rectangle straddling the antimeridian takes the SHORT way round. */
  /* ⚠ THE MAP IS REACHED THROUGH THE ENGINE CONTRACT, NOT THROUGH A HOST HELPER I WISHED FOR.
     The first draft of this called HOST.onMapClick() and map.setCursor(); neither exists. The one
     way a click is bound in this codebase is GE().events.once('click', fn) with e.lngLat, and the
     cursor is GE().render.canvas().style.cursor — js/routing.js startAreaDraw has drawn a rectangle
     that way since #R291, antimeridian rule included, and this follows it. */
  function startAreaDraw() {
    if (drawing) return endAreaDraw();
    if (!GE().hasRenderer()) return;
    drawing = { first: null, handler: null };
    drawing.handler = (e) => {
      const ll = [e.lngLat.lng, e.lngLat.lat];
      if (!drawing.first) {
        drawing.first = ll;
        try { GE().events.once('click', drawing.handler); } catch (_) { }
        return;
      }
      /* ⚠ (#R291) two clicks either side of the antimeridian mean «this narrow strip», and plain
         min/max would build its complement — the other 340 degrees of the planet. The short way
         round is the one that was drawn, so the box is built on the unwrapped axis. */
      let x1 = drawing.first[0], x2 = ll[0];
      if (Math.abs(x2 - x1) > 180) { if (x2 < x1) x2 += 360; else x1 += 360; }
      const area = {
        west: Math.min(x1, x2), east: Math.max(x1, x2),
        south: Math.min(drawing.first[1], ll[1]), north: Math.max(drawing.first[1], ll[1])
      };
      endAreaDraw();
      if (!tooSmall(area)) { state.area = area; drawArea(); doPlan(); }
      else {
        state.error = L('That rectangle is too small to search.', 'その矩形は小さすぎます。', 'Dieses Rechteck ist zu klein.', 'Этот прямоугольник слишком мал.', 'Ese rectángulo es demasiado pequeño.');
        render();
      }
    };
    try { GE().render.canvas().style.cursor = 'crosshair'; GE().events.once('click', drawing.handler); } catch (_) { }
    state.phase = 'drawing'; render();
  }
  /* below this the sweep has nothing to place: one grid point, and a "search" that is a lookup */
  function tooSmall(a) {
    const m = window.IntMapPhotoSearch.areaMetres(a);
    return !(m.widthM > 120 && m.heightM > 120);
  }
  function endAreaDraw() {
    if (!drawing) return;
    try { if (drawing.handler) GE().events.off('click', drawing.handler); } catch (_) { }
    try { GE().render.canvas().style.cursor = ''; } catch (_) { }
    drawing = null;
    if (state && state.phase === 'drawing') state.phase = state.analysis ? 'ready' : 'idle';
    render();
  }
  function useCurrentView() {
    try {
      const b = GE().camera.getBounds();
      const area = { south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast() };
      if (tooSmall(area)) return;
      state.area = area; drawArea(); doPlan(); render();
    } catch (_) { }
  }

  function areaPolygon(a) {
    return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[a.west, a.south], [a.east, a.south], [a.east, a.north], [a.west, a.north], [a.west, a.south]]] } };
  }
  function drawArea() {
    if (!state.area) return;
    try {
      if (!GE().layers.hasSource(SRC_AREA)) GE().layers.addSource(SRC_AREA, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      if (!GE().layers.has(LYR_AREA)) GE().layers.add({ id: LYR_AREA, type: 'fill', source: SRC_AREA, paint: { 'fill-color': '#0a84ff', 'fill-opacity': 0.08 } });
      if (!GE().layers.has(LYR_AREAL)) GE().layers.add({ id: LYR_AREAL, type: 'line', source: SRC_AREA, paint: { 'line-color': '#0a84ff', 'line-width': 1.6, 'line-dasharray': [2, 2] } });
      GE().layers.setSourceData(SRC_AREA, { type: 'FeatureCollection', features: [areaPolygon(state.area)] });
    } catch (_) { }
  }

  async function doPlan() {
    if (!state.area) return;
    try {
      await window.IntMapLazy.need('photoGeo');
      state.plan = window.IntMapPhotoSearch ? window.IntMapPhotoSearch.plan(state.area) : null;
    } catch (_) { state.plan = null; }
    render();
  }

  /* ═══ the search ══════════════════════════════════════════════════════════════════════════════ */
  async function search() {
    if (!state.analysis || !state.skyline || !state.area) return;
    const usable = window.IntMapPhotoSkyline.usableColumns(state.skyline);
    if (usable < 24) {
      state.error = L('Too little of the skyline is usable. Draw the ridge by hand, or unmask part of it.',
        '使える稜線が少なすぎます。手描きするか、マスクを外してください。',
        'Zu wenig Kammlinie ist nutzbar. Zeichnen Sie den Grat von Hand.',
        'Слишком мало пригодной линии горизонта. Обведите гребень вручную.',
        'La línea de cumbres utilizable es insuficiente. Dibuje la cresta a mano.');
      render(); return;
    }
    state.phase = 'searching'; state.error = null; state.result = null; state.progress = null;
    render();
    const W = window.IntMapPhotoGeoWorker;
    state.usingWorker = W ? W.available() : false;
    const req = {
      area: state.area, w: state.analysis.width, h: state.analysis.height,
      sky: Array.from(state.skyline.sky), use: Array.from(state.skyline.use),
      options: { observerHeightM: state.observerHeightM || 1.6 }
    };
    job = W.search(req, {
      onPlan: (p) => { state.plan = p; render(); },
      onProgress: (m) => { state.progress = m; renderProgress(); }
    });
    try {
      const res = await job.promise;
      if (!res) { state.phase = 'aborted'; render(); return; }
      state.result = res; state.selected = 0;
      state.phase = res.aborted ? 'aborted' : 'done';
      drawResults();
    } catch (e) {
      state.phase = 'failed';
      state.error = String((e && e.message) || e);
    }
    job = null; render();
  }
  function abort() { if (job) { try { job.abort(); } catch (_) { } } }

  /* ═══ the map ═════════════════════════════════════════════════════════════════════════════════ */
  function drawResults() {
    if (!state.result) return;
    const feats = [];
    state.result.candidates.forEach((c, i) => {
      feats.push({ type: 'Feature', properties: { kind: 'cand', i: i, rank: i + 1, sel: i === state.selected ? 1 : 0 }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } });
      /* the view direction, drawn as the actual field of view rather than a single arrow, because
         a single arrow would claim a precision the fit does not have */
      if (i === state.selected) {
        const R = 6371008.8, D = Math.PI / 180;
        const len = Math.max(2000, Math.min(40000, (c.rangeM || 12000)));
        const arc = [];
        for (let a = -c.hfovDeg / 2; a <= c.hfovDeg / 2 + 1e-6; a += c.hfovDeg / 24) {
          const br = (c.yawDeg + a) * D, d = len / R;
          const la = Math.asin(Math.sin(c.lat * D) * Math.cos(d) + Math.cos(c.lat * D) * Math.sin(d) * Math.cos(br));
          const lo = c.lon * D + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(c.lat * D), Math.cos(d) - Math.sin(c.lat * D) * Math.sin(la));
          arc.push([lo / D, la / D]);
        }
        feats.push({ type: 'Feature', properties: { kind: 'view' }, geometry: { type: 'Polygon', coordinates: [[[c.lon, c.lat]].concat(arc).concat([[c.lon, c.lat]])] } });
      }
    });
    try {
      if (!GE().layers.hasSource(SRC)) GE().layers.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      if (!GE().layers.has(LYR_VIEW)) GE().layers.add({ id: LYR_VIEW, type: 'fill', source: SRC, filter: ['==', ['get', 'kind'], 'view'], paint: { 'fill-color': '#ffd60a', 'fill-opacity': 0.18 } });
      if (!GE().layers.has(LYR_PT)) GE().layers.add({
        id: LYR_PT, type: 'circle', source: SRC, filter: ['==', ['get', 'kind'], 'cand'],
        paint: { 'circle-radius': ['case', ['==', ['get', 'sel'], 1], 9, 6], 'circle-color': ['case', ['==', ['get', 'sel'], 1], '#ff375f', '#0a84ff'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 }
      });
      if (!GE().layers.has(LYR_LBL)) GE().layers.add({
        id: LYR_LBL, type: 'symbol', source: SRC, filter: ['==', ['get', 'kind'], 'cand'],
        layout: { 'text-field': ['to-string', ['get', 'rank']], 'text-size': 11, 'text-allow-overlap': true },
        paint: { 'text-color': '#fff' }
      });
      GE().layers.setSourceData(SRC, { type: 'FeatureCollection', features: feats });
    } catch (_) { }
  }
  function clearMap() {
    [LYR_LBL, LYR_PT, LYR_VIEW, LYR_AREAL, LYR_AREA].forEach(id => { try { if (GE().layers.has(id)) GE().layers.remove(id); } catch (_) { } });
    [SRC, SRC_AREA].forEach(id => { try { if (GE().layers.hasSource(id)) GE().layers.removeSource(id); } catch (_) { } });
  }

  function select(i) {
    if (!state.result || !state.result.candidates[i]) return;
    state.selected = i;
    state.tuned = null;                 /* a different candidate is a different answer, not a nudge */
    const c = state.result.candidates[i];
    try { GE().camera.flyTo({ center: [c.lon, c.lat], zoom: Math.max(GE().camera.getZoom(), 12) }); } catch (_) { }
    drawResults(); render();
  }

  /* ═══ the panel ═══════════════════════════════════════════════════════════════════════════════ */
  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'photogeo-panel';
    panel.className = 'pg-panel';
    document.body.appendChild(panel);
    /* ⚠ makeDraggable TAKES AN ELEMENT, NOT A SELECTOR, AND THE HANDLE DOES NOT EXIST YET. Every
       other caller (js/map-tools.js and the rest) passes `panel.querySelector(...)`; a string here
       reaches `handle.addEventListener` and throws, and the throw lands in a catch that made the
       panel silently undraggable. The header is written by render(), so the binding waits for it. */
    panel.addEventListener('click', onClick);
    panel.addEventListener('change', onChange);
    panel.addEventListener('input', onInput);
    /* drag and drop, and paste — the three ways js/atlas-console.js already accepts a picture */
    panel.addEventListener('dragover', (e) => { e.preventDefault(); panel.classList.add('pg-drag'); });
    panel.addEventListener('dragleave', () => panel.classList.remove('pg-drag'));
    panel.addEventListener('drop', (e) => {
      e.preventDefault(); panel.classList.remove('pg-drag');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadFile(f);
    });
    return panel;
  }

  function fmtBytes(n) {
    if (!(n > 0)) return '0 B';
    const u = ['B', 'kB', 'MB', 'GB']; let i = 0, v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return v.toFixed(v < 10 && i ? 1 : 0) + ' ' + u[i];
  }
  function fmtKm(m) { return m >= 1000 ? (m / 1000).toFixed(m < 10000 ? 2 : 1) + ' km' : Math.round(m) + ' m'; }
  function bearingName(d) {
    const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return names[Math.round(((d % 360) + 360) % 360 / 22.5) % 16];
  }

  function render() {
    const p = ensurePanel();
    const T_ = {
      title: L('Find where a photo was taken', '写真の撮影地点を探す', 'Aufnahmeort eines Fotos finden', 'Найти место съёмки фотографии', 'Encontrar dónde se tomó una foto'),
      step1: L('1 · Photo', '1 · 写真', '1 · Foto', '1 · Фото', '1 · Foto'),
      step2: L('2 · Search area', '2 · 探索範囲', '2 · Suchbereich', '2 · Область поиска', '2 · Área de búsqueda'),
      step3: L('3 · Skyline', '3 · 稜線', '3 · Kammlinie', '3 · Линия горизонта', '3 · Línea de cumbres'),
      step4: L('4 · Search', '4 · 検索', '4 · Suche', '4 · Поиск', '4 · Buscar'),
      step5: L('5 · Candidates', '5 · 候補', '5 · Kandidaten', '5 · Кандидаты', '5 · Candidatos'),
      choose: L('Choose a photo', '写真を選ぶ', 'Foto wählen', 'Выбрать фото', 'Elegir una foto'),
      dropHint: L('or drop one here, or paste with Ctrl+V', 'ここにドロップ、または Ctrl+V で貼り付け', 'oder hier ablegen bzw. mit Strg+V einfügen', 'или перетащите сюда, либо вставьте Ctrl+V', 'o suéltela aquí, o pegue con Ctrl+V'),
      drawArea: L('Draw a rectangle on the map', '地図上で矩形を描く', 'Rechteck auf der Karte ziehen', 'Нарисовать прямоугольник на карте', 'Dibujar un rectángulo en el mapa'),
      useView: L('Use the current view', '現在の表示範囲を使う', 'Aktuellen Ausschnitt verwenden', 'Использовать текущий вид', 'Usar la vista actual'),
      searchBtn: L('Search', '検索', 'Suchen', 'Искать', 'Buscar'),
      stop: L('Stop search', '検索を中止', 'Suche stoppen', 'Остановить поиск', 'Detener búsqueda'),
      redraw: L('Redraw ridge', '稜線を描き直す', 'Grat neu zeichnen', 'Перерисовать гребень', 'Redibujar la cresta'),
      mask: L('Mask out', '除外する', 'Ausblenden', 'Исключить', 'Excluir'),
      unmask: L('Include again', '再び含める', 'Wieder einbeziehen', 'Снова включить', 'Incluir de nuevo'),
      auto: L('Re-detect', '自動検出しなおす', 'Neu erkennen', 'Определить заново', 'Detectar de nuevo'),
      close: L('Close', '閉じる', 'Schließen', 'Закрыть', 'Cerrar')
    };
    let h = '<div class="pg-head"><span class="pg-title">' + esc(T_.title) + '</span><button class="pg-x" data-act="close" title="' + esc(T_.close) + '">×</button></div><div class="pg-body">';

    /* 1 — the photograph */
    h += '<div class="pg-sec"><div class="pg-h">' + esc(T_.step1) + '</div>';
    if (!state.analysis) {
      h += '<button class="pg-btn pg-primary" data-act="pick">' + esc(T_.choose) + '</button><div class="pg-hint">' + esc(T_.dropHint) + '</div>';
    } else {
      h += '<div class="pg-photowrap"><img class="pg-photo" src="' + state.orig.url + '" alt=""><canvas class="pg-ov"></canvas></div>';
      h += '<div class="pg-meta">' + esc(state.file.name) + ' · ' + state.orig.width + '×' + state.orig.height + ' · ' + fmtBytes(state.file.size) + '</div>';
      h += exifBlock();
      h += '<button class="pg-btn" data-act="pick">' + esc(L('Change photo', '写真を変える', 'Foto wechseln', 'Сменить фото', 'Cambiar foto')) + '</button>';
    }
    h += '</div>';

    /* 2 — the rectangle */
    if (state.analysis) {
      h += '<div class="pg-sec"><div class="pg-h">' + esc(T_.step2) + '</div>';
      h += '<button class="pg-btn" data-act="draw">' + esc(T_.drawArea) + '</button> <button class="pg-btn" data-act="view">' + esc(T_.useView) + '</button>';
      if (state.phase === 'drawing') h += '<div class="pg-hint">' + esc(L('Click two opposite corners on the map.', '地図上で対角の 2 点をクリックしてください。', 'Zwei gegenüberliegende Ecken anklicken.', 'Щёлкните два противоположных угла.', 'Haga clic en dos esquinas opuestas.')) + '</div>';
      if (state.area) h += areaBlock();
      h += '</div>';

      /* 3 — the trace */
      h += '<div class="pg-sec"><div class="pg-h">' + esc(T_.step3) + '</div>' + skylineBlock(T_) + '</div>';

      /* 4 — run */
      h += '<div class="pg-sec"><div class="pg-h">' + esc(T_.step4) + '</div>';
      if (state.phase === 'searching') {
        h += '<button class="pg-btn pg-danger" data-act="stop">' + esc(T_.stop) + '</button>' + progressBlock();
      } else {
        h += '<button class="pg-btn pg-primary"' + (state.area ? '' : ' disabled') + ' data-act="go">' + esc(T_.searchBtn) + '</button>';
        if (!state.area) h += '<div class="pg-hint">' + esc(L('Choose a search area first.', '先に探索範囲を指定してください。', 'Bitte zuerst einen Suchbereich wählen.', 'Сначала выберите область поиска.', 'Elija primero un área de búsqueda.')) + '</div>';
        if (state.usingWorker === false) h += '<div class="pg-warn">' + esc(L('No Worker available — the search will run on the page and may freeze it.', 'Worker が使えません。ページ上で実行するため固まることがあります。', 'Kein Worker verfügbar — die Suche läuft auf der Seite.', 'Worker недоступен — поиск выполнится на странице.', 'Sin Worker: la búsqueda se ejecutará en la página.')) + '</div>';
      }
      h += '</div>';
    }

    /* 5 — results */
    if (state.result) h += resultBlock(T_);
    if (state.error) h += '<div class="pg-err">' + esc(state.error) + '</div>';
    h += '</div>';
    p.innerHTML = h;
    p.classList.toggle('pg-open', true);
    if (!p.__pgDrag) { const hd = p.querySelector('.pg-head'); if (hd) { p.__pgDrag = true; try { HOST.makeDraggable && HOST.makeDraggable(p, hd); } catch (_) { } } }
    paintOverlay();
  }

  function exifBlock() {
    const ex = state.exif;
    if (!ex || !ex.present) return '<div class="pg-hint">' + esc(L('No EXIF metadata in this file.', 'この画像に EXIF 情報はありません。', 'Keine EXIF-Daten in dieser Datei.', 'В файле нет данных EXIF.', 'El archivo no tiene datos EXIF.')) + '</div>';
    let h = '<div class="pg-exif">';
    const fov = window.IntMapPhotoExif.fieldOfView(ex, state.orig.width, state.orig.height);
    if (fov) h += '<div>' + esc(L('Lens', 'レンズ', 'Objektiv', 'Объектив', 'Objetivo')) + ': ' + fov.hfovDeg.toFixed(0) + '° ' + esc(L('horizontal, from EXIF', '水平画角（EXIF より）', 'horizontal, aus EXIF', 'по горизонтали, из EXIF', 'horizontal, según EXIF')) + '</div>';
    if (ex.gps) {
      /* ⚠ SHOWN, NAMED, AND NOT USED. See the header of js/photo-geo-exif.js. */
      h += '<div class="pg-gps"><b>' + esc(L('This file already records where the camera was',
        'この画像には撮影位置が記録されています',
        'Diese Datei enthält bereits den Kamerastandort',
        'В этом файле уже записано положение камеры',
        'Este archivo ya registra dónde estaba la cámara')) + '</b><br>' +
        ex.gps.lat.toFixed(5) + ', ' + ex.gps.lon.toFixed(5) +
        (ex.gps.imgDirectionDeg != null ? ' · ' + esc(L('direction', '方位', 'Richtung', 'направление', 'dirección')) + ' ' + ex.gps.imgDirectionDeg.toFixed(0) + '°' : '') +
        '<br><span class="pg-hint">' + esc(L('IntMap does not use it. The search below matches the skyline against the terrain and reaches its own answer, which you can compare with this.',
          'IntMap はこれを使いません。下の検索は山並みと地形を照合して独自に答えを出すので、この値と比べられます。',
          'IntMap verwendet ihn nicht. Die Suche vergleicht die Kammlinie mit dem Gelände und kommt zu einem eigenen Ergebnis.',
          'IntMap не использует его. Поиск сопоставляет линию горизонта с рельефом и даёт собственный ответ.',
          'IntMap no lo usa. La búsqueda compara la línea de cumbres con el terreno y da su propia respuesta.')) + '</span></div>';
    }
    return h + '</div>';
  }

  function areaBlock() {
    const pl = state.plan;
    let h = '<div class="pg-plan">';
    if (pl) {
      h += '<div>' + esc(L('Area', '範囲', 'Bereich', 'Область', 'Área')) + ': ' + fmtKm(pl.areaWidthM) + ' × ' + fmtKm(pl.areaHeightM) + '</div>';
      h += '<div>' + esc(L('Grid spacing', '探索間隔', 'Rasterabstand', 'Шаг сетки', 'Paso de la malla')) + ': <b>' + Math.round(pl.spacingM) + ' m</b> · ' + pl.coarsePoints.toLocaleString() + ' ' + esc(L('grid points', '地点', 'Rasterpunkte', 'точек сетки', 'puntos de malla')) + '</div>';
      h += '<div>' + esc(L('Terrain data', '地形データ', 'Geländedaten', 'Данные рельефа', 'Datos del terreno')) + ': ' + pl.tiles + ' ' + esc(L('tiles', 'タイル', 'Kacheln', 'тайлов', 'teselas')) + ' ≈ ' + fmtBytes(pl.approxDownloadBytes) + ' · ' + fmtBytes(pl.approxTerrainMemoryBytes) + ' ' + esc(L('in memory', 'メモリ', 'im Speicher', 'в памяти', 'en memoria')) + '</div>';
      h += '<div>' + esc(L('Terrain is read out to', '地形の取得半径', 'Gelände bis', 'Рельеф до', 'Terreno hasta')) + ' ' + fmtKm(pl.horizonRadiusM) + ' ' + esc(L('beyond the rectangle', '矩形の外側まで', 'über das Rechteck hinaus', 'за пределы прямоугольника', 'más allá del rectángulo')) + '</div>';
      if (pl.spacingIsCoarse) h += '<div class="pg-warn">' + esc(L('This area is large, so the grid is coarse. Narrow the rectangle for a finer search.', '範囲が広いため間隔が粗くなっています。矩形を狭めると精密になります。', 'Der Bereich ist groß, das Raster daher grob. Verkleinern Sie das Rechteck.', 'Область велика, сетка груба. Уменьшите прямоугольник.', 'El área es grande y la malla es gruesa. Reduzca el rectángulo.')) + '</div>';
    }
    return h + '</div>';
  }

  function skylineBlock(T_) {
    if (!state.skyline) return '';
    const q = state.skyline.quality;
    const usable = window.IntMapPhotoSkyline.usableColumns(state.skyline);
    let h = '<div class="pg-tools">';
    h += '<button class="pg-btn' + (state.edit === 'draw' ? ' pg-on' : '') + '" data-act="edit-draw">' + esc(T_.redraw) + '</button>';
    h += '<button class="pg-btn' + (state.edit === 'mask' ? ' pg-on' : '') + '" data-act="edit-mask">' + esc(T_.mask) + '</button>';
    h += '<button class="pg-btn' + (state.edit === 'unmask' ? ' pg-on' : '') + '" data-act="edit-unmask">' + esc(T_.unmask) + '</button>';
    h += '<button class="pg-btn" data-act="retrace">' + esc(T_.auto) + '</button>';
    h += '</div><div class="pg-hint">' + esc(L('Drag across the photo to apply the selected tool.', '写真の上をドラッグすると選んだ操作を適用します。', 'Über das Foto ziehen, um das Werkzeug anzuwenden.', 'Проведите по фото, чтобы применить инструмент.', 'Arrastre sobre la foto para aplicar la herramienta.')) + '</div>';
    h += '<div class="pg-meta">' + esc(L('Usable columns', '使用可能な列', 'Nutzbare Spalten', 'Пригодных столбцов', 'Columnas utilizables')) + ': ' + usable + ' / ' + state.analysis.width +
      ' · ' + esc(L('edge', 'エッジ', 'Kante', 'край', 'borde')) + ' ' + q.meanEdge.toFixed(2) +
      ' · ' + esc(L('separation', '分離度', 'Trennung', 'разделение', 'separación')) + ' ' + q.separation.toFixed(1) + '</div>';
    return h;
  }

  function progressBlock() {
    const pr = state.progress;
    if (!pr) return '<div class="pg-prog"><div class="pg-bar" style="width:0"></div></div>';
    const frac = pr.total ? Math.min(1, pr.done / pr.total) : 0;
    const names = {
      tiles: L('Loading terrain', '地形を取得中', 'Gelände wird geladen', 'Загрузка рельефа', 'Cargando terreno'),
      terrain: L('Preparing terrain', '地形を準備中', 'Gelände wird aufbereitet', 'Подготовка рельефа', 'Preparando terreno'),
      coarse: L('Sweeping the area', '範囲を走査中', 'Bereich wird abgesucht', 'Обход области', 'Recorriendo el área'),
      fine: L('Refining the best places', '有望地点を精査中', 'Beste Stellen werden verfeinert', 'Уточнение лучших мест', 'Refinando los mejores lugares')
    };
    let h = '<div class="pg-prog"><div class="pg-bar" style="width:' + (frac * 100).toFixed(1) + '%"></div></div>';
    h += '<div class="pg-meta">' + esc(names[pr.phase] || pr.phase) + ' · ' + pr.done + ' / ' + pr.total + '</div>';
    return h;
  }
  function renderProgress() {
    const el = panel && panel.querySelector('.pg-prog');
    if (!el) { render(); return; }
    const pr = state.progress;
    const frac = pr && pr.total ? Math.min(1, pr.done / pr.total) : 0;
    const bar = el.querySelector('.pg-bar'); if (bar) bar.style.width = (frac * 100).toFixed(1) + '%';
    const m = el.nextElementSibling; if (m && pr) m.textContent = (pr.phase || '') + ' · ' + pr.done + ' / ' + pr.total;
  }

  function resultBlock(T_) {
    const r = state.result, v = r.verdict;
    let h = '<div class="pg-sec"><div class="pg-h">' + esc(T_.step5) + '</div>';
    const vClass = v.ok ? 'pg-ok' : 'pg-warn';
    const vName = {
      match: L('A candidate matches', '一致する候補があります', 'Ein Kandidat passt', 'Есть подходящий кандидат', 'Hay un candidato coincidente'),
      no_match: L('No candidate matches', '一致する候補を確認できません', 'Kein Kandidat passt', 'Подходящих кандидатов нет', 'No se confirma ningún candidato'),
      ambiguous: L('Several places fit equally well', '複数の場所が同程度に一致します', 'Mehrere Orte passen gleich gut', 'Несколько мест подходят одинаково', 'Varios lugares encajan igual'),
      insufficient_evidence: L('Not enough evidence in this photo', 'この写真では根拠が足りません', 'Zu wenig Anhaltspunkte im Foto', 'В этом фото недостаточно данных', 'Pruebas insuficientes en esta foto')
    }[v.code] || v.code;
    h += '<div class="' + vClass + '"><b>' + esc(vName) + '</b>' + (v.reason ? '<br>' + esc(v.reason) : '') + '</div>';
    if (r.aborted) h += '<div class="pg-warn">' + esc(L('The search was stopped before it finished — these are the places it had reached.', '検索は途中で中止されました。ここまでに調べた地点です。', 'Die Suche wurde vorzeitig beendet.', 'Поиск был прерван.', 'La búsqueda se detuvo antes de terminar.')) + '</div>';
    h += '<ol class="pg-list">';
    r.candidates.forEach((c, i) => {
      h += '<li class="pg-cand' + (i === state.selected ? ' pg-selc' : '') + '" data-act="sel" data-i="' + i + '">' +
        '<div class="pg-cr"><b>' + c.lat.toFixed(4) + ', ' + c.lon.toFixed(4) + '</b>' +
        '<span class="pg-badge">' + esc(L('found on a', '探索間隔', 'Raster', 'шаг', 'malla')) + ' ' + Math.round(c.foundAtSpacingM) + ' m ' + esc(L('grid', 'グリッド', 'Raster', 'сетка', 'malla')) + '</span></div>' +
        '<div class="pg-cm">' + esc(L('Looking', '方位', 'Blick', 'Направление', 'Mirando')) + ' ' + bearingName(c.yawDeg) + ' ' + c.yawDeg.toFixed(0) + '° · ' +
        esc(L('field of view', '画角', 'Bildwinkel', 'поле зрения', 'campo de visión')) + ' ' + c.hfovDeg.toFixed(0) + '°' +
        ' · ' + esc(L('tilt', '仰角', 'Neigung', 'наклон', 'inclinación')) + ' ' + c.pitchDeg.toFixed(1) + '°</div>' +
        '<div class="pg-cm">' + esc(L('Skyline explained', '一致した稜線', 'Erklärte Kammlinie', 'Объяснено линии', 'Cumbres explicadas')) + ': <b>' + c.explainedDeg.toFixed(0) + '°</b> ' +
        esc(L('of', '／', 'von', 'из', 'de')) + ' ' + c.spanDeg.toFixed(0) + '° · ' +
        esc(L('agreement', '一致度', 'Übereinstimmung', 'совпадение', 'concordancia')) + ' ' + (c.agreement * 100).toFixed(0) + '%' +
        ' · RMS ' + (c.rmsDeg || 0).toFixed(2) + '°</div>' +
        '</li>';
    });
    h += '</ol>';
    h += tuneBlock();
    h += provenanceBlock(r);
    return h + '</div>';
  }

  /* ── FINE TUNING ────────────────────────────────────────────────────────────────────────────────
     The search reports the best it found ON ITS GRID; the reader can move off that grid. Every
     control here re-scores the WHOLE skyline against terrain at the nudged position and redraws the
     computed ridge, so the agreement figure shown beside it is the agreement of what is on screen —
     never the search's own number carried over under a changed camera. */
  function tuneBlock() {
    const c = state.result && state.result.candidates[state.selected];
    if (!c) return '';
    const t = state.tuned || null;
    const cur = t || c;
    const row = (label, act, step, unit, val) =>
      '<div class="pg-tune-row"><span>' + esc(label) + '</span>' +
      '<button class="pg-btn" data-act="' + act + '" data-d="' + (-step) + '">−</button>' +
      '<b>' + val + unit + '</b>' +
      '<button class="pg-btn" data-act="' + act + '" data-d="' + step + '">+</button></div>';
    let h = '<div class="pg-sec"><div class="pg-h">' + esc(L('Fine tuning', '微調整', 'Feinabstimmung', 'Точная настройка', 'Ajuste fino')) + '</div>';
    h += '<div class="pg-hint">' + esc(L('Adjust the viewpoint and camera; the computed skyline and the agreement are recomputed against the terrain.',
      '地点とカメラを調整すると、計算した稜線と一致度が地形に対して再計算されます。',
      'Standort und Kamera anpassen; Kammlinie und Übereinstimmung werden neu berechnet.',
      'Измените точку и камеру; линия и совпадение пересчитываются по рельефу.',
      'Ajuste el punto y la cámara; la línea y la concordancia se recalculan sobre el terreno.')) + '</div>';
    h += row(L('Bearing', '方位', 'Peilung', 'Азимут', 'Rumbo'), 'tune-yaw', 0.5, '°', cur.yawDeg.toFixed(1));
    h += row(L('Camera tilt', 'カメラの仰角', 'Kameraneigung', 'Наклон камеры', 'Inclinación de la cámara'), 'tune-pitch', 0.5, '°', cur.pitchDeg.toFixed(1));
    h += row(L('Field of view', '画角', 'Bildwinkel', 'Поле зрения', 'Campo de visión'), 'tune-fov', 1, '°', cur.hfovDeg.toFixed(1));
    h += row(L('Roll', '傾き', 'Rollwinkel', 'Крен', 'Alabeo'), 'tune-roll', 0.5, '°', (cur.rollDeg || 0).toFixed(1));
    h += '<div class="pg-tune-row"><span>' + esc(L('Move viewpoint', '地点を動かす', 'Standort verschieben', 'Сдвинуть точку', 'Mover el punto')) + '</span>' +
      '<button class="pg-btn" data-act="tune-move" data-dir="w">W</button>' +
      '<button class="pg-btn" data-act="tune-move" data-dir="s">S</button>' +
      '<button class="pg-btn" data-act="tune-move" data-dir="n">N</button>' +
      '<button class="pg-btn" data-act="tune-move" data-dir="e">E</button>' +
      '<span class="pg-badge">' + TUNE_STEP_M + ' m</span></div>';
    if (t) {
      h += '<div class="pg-meta">' + cur.lat.toFixed(5) + ', ' + cur.lon.toFixed(5) + ' · ' +
        esc(L('agreement', '一致度', 'Übereinstimmung', 'совпадение', 'concordancia')) + ' ' + (t.agreement * 100).toFixed(0) + '%' +
        ' · ' + esc(L('explained', '説明角', 'erklärt', 'объяснено', 'explicado')) + ' ' + t.explainedDeg.toFixed(0) + '°' +
        ' · RMS ' + (t.rmsDeg || 0).toFixed(2) + '°' +
        (t.groundM != null ? ' · ' + esc(L('ground', '標高', 'Boden', 'высота', 'suelo')) + ' ' + Math.round(t.groundM) + ' m' : '') + '</div>';
      h += '<button class="pg-btn" data-act="tune-reset">' + esc(L('Back to the found candidate', '見つかった候補に戻す', 'Zurück zum gefundenen Kandidaten', 'Вернуться к найденному кандидату', 'Volver al candidato encontrado')) + '</button>';
    }
    if (state.tuning) h += '<div class="pg-hint">' + esc(L('Recomputing…', '再計算中…', 'Wird neu berechnet…', 'Пересчёт…', 'Recalculando…')) + '</div>';
    return h + '</div>';
  }

  /* how far one press of N/S/E/W moves the viewpoint — a quarter of the finest grid the search used,
     so tuning can reach between the points the sweep placed */
  const TUNE_STEP_M = 25;

  async function tune(patch) {
    const c = state.result && state.result.candidates[state.selected];
    if (!c || state.tuning) return;
    const base = state.tuned || {
      lat: c.lat, lon: c.lon, yawDeg: c.yawDeg, pitchDeg: c.pitchDeg,
      rollDeg: c.rollDeg || 0, hfovDeg: c.hfovDeg
    };
    const next = Object.assign({}, base, patch);
    next.hfovDeg = Math.max(6, Math.min(150, next.hfovDeg));
    next.pitchDeg = Math.max(-60, Math.min(60, next.pitchDeg));
    next.rollDeg = Math.max(-40, Math.min(40, next.rollDeg));
    next.yawDeg = ((next.yawDeg % 360) + 360) % 360;
    state.tuning = true; render();
    try {
      const r = await window.IntMapPhotoGeoWorker.nudge({
        area: state.area, lat: next.lat, lon: next.lon,
        yawDeg: next.yawDeg, pitchDeg: next.pitchDeg, rollDeg: next.rollDeg, hfovDeg: next.hfovDeg,
        w: state.analysis.width, h: state.analysis.height,
        sky: Array.from(state.skyline.sky), use: Array.from(state.skyline.use),
        options: { observerHeightM: state.observerHeightM || 1.6 }
      });
      state.tuned = Object.assign({}, next, r.fit, { groundM: r.groundM, eyeM: r.eyeM });
      /* ⚠ the overlay shown must be the one just computed, not the search's */
      state.result.overlays[state.selected] = r.overlay;
      drawResults();
    } catch (e) {
      state.error = String((e && e.message) || e);
    }
    state.tuning = false;
    render();
  }

  function moveMetres(dir) {
    const D = Math.PI / 180, R = 6371008.8;
    const c = state.tuned || state.result.candidates[state.selected];
    const dLat = TUNE_STEP_M / (R * D), dLon = TUNE_STEP_M / (R * D * Math.cos(c.lat * D));
    if (dir === 'n') return { lat: c.lat + dLat };
    if (dir === 's') return { lat: c.lat - dLat };
    if (dir === 'e') return { lon: c.lon + dLon };
    return { lon: c.lon - dLon };
  }

  /* ⚠ EVERY NUMBER THAT LIMITS THE ANSWER, IN ONE PLACE AND ALWAYS SHOWN. */
  function provenanceBlock(r) {
    const s = r.stats, a = r.attribution;
    /* ⚠ WHERE THE PHOTOGRAPH WENT, WHICH IS NOWHERE. Everything that reads pixels runs in this
       browser: the trace, the camera model and the match. The only thing fetched is public elevation
       tiles, and those are requested BY COORDINATE — the picture is never uploaded, to IntMap or to
       anyone else. A feature that examines a personal photograph has to say so where it is used. */
    let h = '<details class="pg-prov" open><summary>' + esc(L('How this answer was produced', 'この結果の出どころ', 'Wie dieses Ergebnis entstand', 'Как получен этот результат', 'Cómo se obtuvo este resultado')) + '</summary>';
    h += '<div class="pg-ok">' + esc(L('Your photograph stayed on this device. Only public elevation tiles were fetched, by coordinate.', 'この写真は端末の外に出ていません。取得したのは座標で指定した公開の標高タイルだけです。', 'Ihr Foto hat dieses Gerät nicht verlassen. Geholt wurden nur öffentliche Höhenkacheln, nach Koordinate.', 'Фотография не покидала это устройство. Загружались только общедоступные тайлы высот по координатам.', 'Su fotografía no salió de este dispositivo. Solo se descargaron teselas públicas de elevación, por coordenada.')) + '</div>';
    h += '<div>' + esc(L('Elevation data', '標高データ', 'Höhendaten', 'Данные высот', 'Datos de elevación')) + ': ' + esc(a.name) + ' — ' + esc(a.sources) + '</div>';
    h += '<div>' + esc(L('Native resolution', '元解像度', 'Native Auflösung', 'Исходное разрешение', 'Resolución nativa')) + ': ≈' + a.nativeResolutionM + ' m · ' + esc(L('sharp summits read low', '鋭い山頂は低めに出ます', 'scharfe Gipfel werden zu niedrig gemessen', 'острые вершины занижены', 'las cumbres afiladas se leen bajas')) + '</div>';
    h += '<div>' + esc(L('Searched', '探索済み', 'Durchsucht', 'Пройдено', 'Explorado')) + ': ' + s.coarsePointsVisited + ' / ' + s.coarsePointsPlanned + ' ' +
      esc(L('points at', '地点・間隔', 'Punkte,', 'точек, шаг', 'puntos, paso')) + ' ' + Math.round(s.spacingM) + ' m, ' +
      esc(L('then', 'その後', 'dann', 'затем', 'luego')) + ' ' + s.shortlist + ' ' + esc(L('places at', '地点を', 'Stellen bei', 'мест с шагом', 'lugares a')) + ' ' + Math.round(s.fineSpacingM) + ' m</div>';
    h += '<div>' + esc(L('Terrain read to', '地形の取得半径', 'Gelände bis', 'Рельеф до', 'Terreno hasta')) + ' ' + fmtKm(s.horizonRadiusM) + ' · ' +
      esc(L('observer height', '目線の高さ', 'Beobachterhöhe', 'высота наблюдателя', 'altura del observador')) + ' ' + s.observerHeightM + ' m · ' +
      esc(L('tolerance', '許容差', 'Toleranz', 'допуск', 'tolerancia')) + ' ' + s.tauDeg + '°</div>';
    const voidPct = s.terrainCells ? (s.terrainVoidCells / s.terrainCells * 100) : 0;
    h += '<div>' + esc(L('Terrain cells with no data', '欠損した地形セル', 'Geländezellen ohne Daten', 'Ячейки без данных', 'Celdas sin datos')) + ': ' + voidPct.toFixed(2) + '%' +
      (r.tiles ? ' · ' + esc(L('tiles', 'タイル', 'Kacheln', 'тайлов', 'teselas')) + ' ' + r.tiles.decoded + '/' + r.tiles.requested + (r.tiles.failed ? ' (' + r.tiles.failed + ' ' + esc(L('failed', '失敗', 'fehlgeschlagen', 'не загружено', 'fallidas')) + ')' : '') : '') + '</div>';
    h += '<div>' + esc(L('Time', '所要時間', 'Dauer', 'Время', 'Tiempo')) + ': ' + ((r.elapsedMs || s.elapsedMs) / 1000).toFixed(1) + ' s' +
      (state.usingWorker === false ? ' · ' + esc(L('on the page (no Worker)', 'ページ上で実行（Worker なし）', 'auf der Seite (kein Worker)', 'на странице (без Worker)', 'en la página (sin Worker)')) : '') + '</div>';
    h += '<div class="pg-hint">' + esc(L('The agreement figure is not a probability. A best-scoring candidate always exists, whether or not the photograph was taken inside the rectangle.',
      '一致度は確率ではありません。写真が矩形の中で撮られたかどうかに関わらず、最高得点の候補は必ず存在します。',
      'Der Übereinstimmungswert ist keine Wahrscheinlichkeit.',
      'Показатель совпадения не является вероятностью.',
      'La concordancia no es una probabilidad.')) + '</div>';
    return h + '</details>';
  }

  /* ═══ the overlay on the photograph ═══════════════════════════════════════════════════════════ */
  function paintOverlay() {
    const img = panel && panel.querySelector('.pg-photo');
    const cv = panel && panel.querySelector('.pg-ov');
    if (!img || !cv || !state.skyline) return;
    /* ⚠ ONCE IS NOT ENOUGH, AND «the image has loaded» IS NOT «the image has a size».
       MEASURED: with the photograph dropped while the viewport was still 0 px wide, `draw` ran at
       the load event, found clientWidth 0, returned — and nothing ever called it again. The panel
       then showed the photograph with NO TRACE on it for the rest of the session, which is the
       worst possible failure here: the reader is looking at an untraced ridge and the panel is
       telling them 900 columns are usable. A window resize, a phone rotating, or the panel being
       opened before layout settles all reach the same state, so the repaint is observed, not
       scheduled. */
    const draw = () => {
      const w = img.clientWidth, h = img.clientHeight;
      if (!w || !h) return;
      /* draw at device resolution so a 1 px ridge line is not a 2 px blur on a retina screen */
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
      const cx = cv.getContext('2d');
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx.clearRect(0, 0, w, h);
      const sx = w / state.analysis.width, sy = h / state.analysis.height;
      /* the traced skyline: solid where it will be scored, faint where it is masked out */
      const sk = state.skyline;
      cx.lineWidth = 2;
      let run = null;
      for (let x = 0; x <= state.analysis.width; x++) {
        const on = x < state.analysis.width && sk.use[x];
        if (on && !run) { run = { on: true, pts: [] }; }
        if (!on && run) { strokeRun(cx, run, sx, sy, '#ff375f'); run = null; }
        if (on) run.pts.push([x, sk.sky[x]]);
      }
      if (run) strokeRun(cx, run, sx, sy, '#ff375f');
      cx.setLineDash([3, 3]); cx.strokeStyle = 'rgba(255,255,255,0.55)'; cx.beginPath();
      for (let x = 0; x < state.analysis.width; x++) { if (sk.use[x]) continue; const X = x * sx, Y = sk.sky[x] * sy; cx.moveTo(X, Y); cx.lineTo(X, Y + 1); }
      cx.stroke(); cx.setLineDash([]);
      /* the selected candidate's computed skyline */
      const ov = state.result && state.result.overlays && state.result.overlays[state.selected];
      if (ov && ov.length) {
        cx.strokeStyle = '#30d158'; cx.lineWidth = 2.2; cx.beginPath();
        ov.forEach((p, i) => { const X = p[0] * sx, Y = p[1] * sy; i ? cx.lineTo(X, Y) : cx.moveTo(X, Y); });
        cx.stroke();
      }
    };
    if (!img.complete) img.onload = draw; else draw();
    /* the image is re-created by every render(), so the observer is attached per element */
    if (!cv.__pgRO && typeof ResizeObserver === 'function') {
      cv.__pgRO = new ResizeObserver(() => draw());
      try { cv.__pgRO.observe(img); } catch (_) { }
    }
    bindEditing(img, cv);
  }
  function strokeRun(cx, run, sx, sy, colour) {
    if (!run.pts.length) return;
    cx.strokeStyle = colour; cx.beginPath();
    run.pts.forEach((p, i) => { const X = p[0] * sx, Y = p[1] * sy; i ? cx.lineTo(X, Y) : cx.moveTo(X, Y); });
    cx.stroke();
  }

  function bindEditing(img, cv) {
    if (cv.__pgBound) return;
    cv.__pgBound = true;
    let dragging = null;
    const toAnalysis = (ev) => {
      const r = cv.getBoundingClientRect();
      const cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      const cy = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
      return [cx / r.width * state.analysis.width, cy / r.height * state.analysis.height];
    };
    const down = (ev) => {
      if (state.edit === 'none') return;
      ev.preventDefault();
      dragging = { pts: [toAnalysis(ev)] };
    };
    const move = (ev) => { if (!dragging) return; ev.preventDefault(); dragging.pts.push(toAnalysis(ev)); apply(false); };
    const up = () => { if (!dragging) return; apply(true); dragging = null; };
    const apply = (final) => {
      const S = window.IntMapPhotoSkyline;
      if (state.edit === 'draw') S.applyStroke(state.skyline, dragging.pts);
      else if (state.edit === 'mask' || state.edit === 'unmask') {
        const xs = dragging.pts.map(p => p[0]);
        S.maskColumns(state.skyline, Math.min.apply(null, xs), Math.max.apply(null, xs), state.edit === 'mask');
      }
      if (final) { state.result = null; render(); } else paintOverlay();
    };
    cv.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /* ═══ events ══════════════════════════════════════════════════════════════════════════════════ */
  function onClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.getAttribute('data-act');
    if (a === 'close') return close();
    if (a === 'pick') return pickFile();
    if (a === 'draw') return startAreaDraw();
    if (a === 'view') return useCurrentView();
    if (a === 'go') return search();
    if (a === 'stop') return abort();
    if (a === 'retrace') return retrace();
    if (a === 'edit-draw') { state.edit = state.edit === 'draw' ? 'none' : 'draw'; return render(); }
    if (a === 'edit-mask') { state.edit = state.edit === 'mask' ? 'none' : 'mask'; return render(); }
    if (a === 'edit-unmask') { state.edit = state.edit === 'unmask' ? 'none' : 'unmask'; return render(); }
    if (a === 'sel') return select(+b.getAttribute('data-i'));
    const d = parseFloat(b.getAttribute('data-d'));
    if (a === 'tune-yaw') return tune({ yawDeg: (state.tuned || state.result.candidates[state.selected]).yawDeg + d });
    if (a === 'tune-pitch') return tune({ pitchDeg: (state.tuned || state.result.candidates[state.selected]).pitchDeg + d });
    if (a === 'tune-fov') return tune({ hfovDeg: (state.tuned || state.result.candidates[state.selected]).hfovDeg + d });
    if (a === 'tune-roll') return tune({ rollDeg: ((state.tuned || state.result.candidates[state.selected]).rollDeg || 0) + d });
    if (a === 'tune-move') return tune(moveMetres(b.getAttribute('data-dir')));
    if (a === 'tune-reset') { state.tuned = null; return search ? render() : render(); }
  }
  function onChange() { }
  function onInput() { }

  function pickFile() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => { if (inp.files && inp.files[0]) loadFile(inp.files[0]); };
    inp.click();
  }

  function onPaste(e) {
    if (!panel || !panel.classList.contains('pg-open')) return;
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') { const f = items[i].getAsFile(); if (f) { loadFile(f); e.preventDefault(); return; } }
    }
  }
  document.addEventListener('paste', onPaste);

  /* ═══ public ══════════════════════════════════════════════════════════════════════════════════ */
  async function open(opts) {
    if (!state) state = blank();
    ensurePanel();
    if (opts && opts.area) { state.area = opts.area; drawArea(); doPlan(); }
    render();
    return true;
  }
  function close() {
    endAreaDraw();
    abort();
    clearMap();
    if (panel) { panel.classList.remove('pg-open'); panel.remove(); panel = null; }
    return true;
  }
  function isOpen() { return !!(panel && panel.classList.contains('pg-open')); }

  /* what Atlas reads — the photograph, the rectangle, the phase, the candidates, the selection */
  function snapshot() {
    if (!state) return { open: false };
    const r = state.result;
    return {
      open: isOpen(),
      photo: state.file ? { name: state.file.name, width: state.orig.width, height: state.orig.height, hasExifGps: !!(state.exif && state.exif.gps) } : null,
      area: state.area || null,
      plan: state.plan ? { spacingM: Math.round(state.plan.spacingM), points: state.plan.coarsePoints, tiles: state.plan.tiles } : null,
      skyline: state.skyline ? { usableColumns: window.IntMapPhotoSkyline.usableColumns(state.skyline), columns: state.analysis.width } : null,
      phase: state.phase,
      progress: state.progress ? { phase: state.progress.phase, done: state.progress.done, total: state.progress.total } : null,
      verdict: r ? r.verdict.code : null,
      candidates: r ? r.candidates.map((c, i) => ({
        rank: i + 1, lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5),
        bearingDeg: Math.round(c.yawDeg), hfovDeg: Math.round(c.hfovDeg),
        explainedDeg: +c.explainedDeg.toFixed(1), agreement: +c.agreement.toFixed(3),
        foundAtSpacingM: Math.round(c.foundAtSpacingM), selected: i === state.selected
      })) : null
    };
  }

  const API = {
    open, close, isOpen, state: snapshot,
    setArea: (a) => { state = state || blank(); state.area = a; drawArea(); doPlan(); render(); return true; },
    select, search, abort,
    hasPhoto: () => !!(state && state.analysis),
    hasArea: () => !!(state && state.area),
    plan: () => (state && state.plan) || null
  };
  return API;
};
