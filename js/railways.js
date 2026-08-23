/* ============================================================================
 *  IntMap · World railways — IntMapRailways   (#R388)
 * ----------------------------------------------------------------------------
 *  「現在の『世界の鉄道（軌間別）』は、各線路そのものの軌間を読んでいるわけではありません。」
 *
 *  ── WHAT IT REPLACED, AND WHY THAT WAS NOT A DETAIL ────────────────────────────────────────────
 *  The layer called "World railways (by gauge)" had never read a gauge. `_rail_convert.py` took
 *  Natural Earth's 10m railroads, ray-cast each line's MIDPOINT into a country polygon, and painted
 *  the whole line with a hard-coded "predominant national gauge" for that country. 25,242 lines, one
 *  property between them — `g` — and that property was a lookup on a country code.
 *
 *  MEASURED against OpenStreetMap while rebuilding this:
 *    · Iberia — OSM states 1435 mm on 169 ways (the entire Spanish high-speed network is standard
 *      gauge) and 1000 mm on 145. The old layer painted every one of them 1668 mm.
 *    · India — OSM states 762 mm on 249 ways and 1000 mm on 195. The old layer painted them 1676 mm.
 *  A legend that says «Iberian 1668 mm» over the Madrid–Barcelona AVE is not coarse. It is wrong,
 *  and it is wrong in the one place the layer claims expertise.
 *
 *  ── WHAT THIS IS ───────────────────────────────────────────────────────────────────────────────
 *  Every value on this layer is the tag OpenStreetMap carries on THAT track. Two levels, one build
 *  (scripts/rail/fetch.mjs → scripts/rail/build.mjs):
 *    world.json.gz    heavy rail worldwide, generalised, every axis value, no strings   (z < 6.5)
 *    c/<cell>.json.gz 5° cells at full detail, with names, operators and the OSM id     (z ≥ 6.5)
 *    st/<cell>.json.gz `railway=station` / `halt`, the same 5° grid, operator and modes (z ≥ 8)
 *
 *  ⚠ THE COLOUR AXIS IS A SWITCH, AND EVERY AXIS HAS A "not stated" BUCKET. Gauge, electrification,
 *  line speed, tracks, traffic and status are six questions about the same line, and OSM answers them
 *  at very different rates: MEASURED, `maxspeed` is on 60% of Iberian ways and 6% of Indian ones,
 *  `tracks` on 51% and 0%. So grey means «OpenStreetMap does not say» — never a default, never the
 *  country's usual answer. A map whose honest bucket is the rarest one is a map that lies confidently,
 *  which is exactly what the previous layer did with its 342 grey lines out of 25,242.
 *
 *  ── RENDERER / MODULE RULES ────────────────────────────────────────────────────────────────────
 *  · The line layer id stays `rail-ln` and the source `rail-src`, because the opacity registration
 *    (`_registerLayerOpacity('rail2', …, ['rail-ln'], 'beta-dl-rail')`), the styledata self-heal in
 *    js/layer-packs.js and js/compare.js all name them.
 *  · The buckets and their colours live in js/rail-schema.js, imported by the BUILD and by this file,
 *    so a class cannot mean one thing in data/railways/ and another in the legend.
 *  · No <style> here — the card is a `.country-popup`, the app's existing detail-card vocabulary.
 *  · Every value that reaches the DOM goes through window.IntMapSafe (#R138).
 *  · Five languages inline through `L` / `LA` and no third helper (#R353).
 * ==========================================================================*/
import { RailSchema } from './rail-schema.js';

window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.railways = function (HOST) {
  /* the shared vocabulary — the same object scripts/rail/build.mjs classifies with */
  const { AXES, UNKNOWN_COLOUR, gaugeBucket, elecBucket, speedBucket, tracksBucket, decodeLines, decodePoints } = RailSchema;
  const GE = () => window.IntMapGeoEngine;
  const L = window.IntMapLang.pick(() => HOST.lang);
  const LA = window.IntMapLang.pickArgs();
  const S = (v) => { try { return window.IntMapSafe.html(v == null ? '' : String(v)); } catch (_) { return ''; } };
  /* the house's own draw-guard, declared in this factory because that is where it is called (#R170) */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  const U = (v) => { try { return window.IntMapSafe.url(String(v || '')); } catch (_) { return ''; } };

  const BASE = 'data/railways/';
  const DETAIL_Z = 6.5;        /* below this the world file is the whole answer */
  const STATION_Z = 8;
  const MAX_CELLS = 16;        /* cells fetched for one view; a wider view uses the world file */
  const CELL_LRU = 48;

  /* ── the six axes, and the labels for their buckets ───────────────────────
     The bucket ids and colours come from js/rail-schema.js; only the words are
     here. ⚠ `na` is spelled out in every axis: "OpenStreetMap does not state
     this" is an answer the map has to be able to give. */
  const AXIS_LABEL = {
    gauge: () => LA('Gauge', '軌間', 'Spurweite', 'Ширина колеи', 'Ancho de vía'),
    electrification: () => LA('Electrification', '電化方式', 'Elektrifizierung', 'Электрификация', 'Electrificación'),
    speed: () => LA('Line speed', '最高速度', 'Streckengeschwindigkeit', 'Скорость', 'Velocidad máxima'),
    tracks: () => LA('Tracks', '複線・単線', 'Gleise', 'Число путей', 'Vías'),
    traffic: () => LA('Traffic', '旅客・貨物', 'Verkehr', 'Движение', 'Tráfico'),
    status: () => LA('Status', '運行状態', 'Status', 'Состояние', 'Estado'),
    kind: () => LA('Line type', '線種', 'Streckenart', 'Тип линии', 'Tipo de línea'),
  };
  const NOT_STATED = () => LA('Not stated in OSM', 'OSM に記載なし', 'In OSM nicht angegeben', 'Не указано в OSM', 'No indicado en OSM');
  const BUCKET_LABEL = {
    g1435: () => LA('Standard 1435 mm', '標準軌 1435mm', 'Normalspur 1435 mm', 'Стандартная колея 1435 мм', 'Ancho estándar 1435 mm'),
    g1520: () => LA('Russian 1520 mm', 'ロシア軌間 1520mm', 'Russische Breitspur 1520 mm', 'Русская колея 1520 мм', 'Ancho ruso 1520 mm'),
    g1524: () => LA('Finnish 1524 mm', 'フィンランド軌間 1524mm', 'Finnische Breitspur 1524 mm', 'Финская колея 1524 мм', 'Ancho finlandés 1524 mm'),
    g1676: () => LA('Indian 1676 mm', 'インド軌間 1676mm', 'Indische Breitspur 1676 mm', 'Индийская колея 1676 мм', 'Ancho indio 1676 mm'),
    g1668: () => LA('Iberian 1668 mm', 'イベリア軌間 1668mm', 'Iberische Spur 1668 mm', 'Иберийская колея 1668 мм', 'Ancho ibérico 1668 mm'),
    g1600: () => LA('Irish 1600 mm', 'アイルランド軌間 1600mm', 'Irische Spur 1600 mm', 'Ирландская колея 1600 мм', 'Ancho irlandés 1600 mm'),
    gbroad: () => LA('Other broad gauge', 'その他の広軌', 'Sonstige Breitspur', 'Прочая широкая колея', 'Otro ancho ancho'),
    g1067: () => LA('Cape 1067 mm', '狭軌 1067mm', 'Kapspur 1067 mm', 'Капская колея 1067 мм', 'Ancho Cape 1067 mm'),
    g1000: () => LA('Metre 1000 mm', 'メーターゲージ 1000mm', 'Meterspur 1000 mm', 'Метровая колея 1000 мм', 'Ancho métrico 1000 mm'),
    g900: () => LA('750–999 mm', '750〜999mm', '750–999 mm', '750–999 мм', '750–999 mm'),
    g762: () => LA('600–749 mm', '600〜749mm', '600–749 mm', '600–749 мм', '600–749 mm'),
    gminor: () => LA('Under 600 mm', '600mm 未満', 'Unter 600 mm', 'Менее 600 мм', 'Menos de 600 mm'),
    ac25: () => LA('25 kV AC', '交流 25kV', '25 kV AC', '25 кВ перем.', '25 kV CA'),
    ac15: () => LA('15 kV AC', '交流 15kV', '15 kV AC', '15 кВ перем.', '15 kV CA'),
    acOther: () => LA('Other AC', 'その他の交流', 'Sonstige AC', 'Прочий перем. ток', 'Otra CA'),
    dc3: () => LA('3 kV DC', '直流 3kV', '3 kV DC', '3 кВ пост.', '3 kV CC'),
    dc15: () => LA('1.5 kV DC', '直流 1.5kV', '1,5 kV DC', '1,5 кВ пост.', '1,5 kV CC'),
    dcOther: () => LA('Other DC', 'その他の直流', 'Sonstige DC', 'Прочий пост. ток', 'Otra CC'),
    elecYes: () => LA('Electrified, system not stated', '電化（方式の記載なし）', 'Elektrifiziert, System unbekannt', 'Электрифицировано, система не указана', 'Electrificado, sistema no indicado'),
    no: () => LA('Not electrified', '非電化', 'Nicht elektrifiziert', 'Не электрифицировано', 'Sin electrificar'),
    v300: () => LA('300 km/h and above', '300km/h 以上', 'Ab 300 km/h', 'От 300 км/ч', '300 km/h o más'),
    v250: () => LA('250–299 km/h', '250〜299km/h', '250–299 km/h', '250–299 км/ч', '250–299 km/h'),
    v200: () => LA('200–249 km/h', '200〜249km/h', '200–249 km/h', '200–249 км/ч', '200–249 km/h'),
    v160: () => LA('160–199 km/h', '160〜199km/h', '160–199 km/h', '160–199 км/ч', '160–199 km/h'),
    v120: () => LA('120–159 km/h', '120〜159km/h', '120–159 km/h', '120–159 км/ч', '120–159 km/h'),
    v80: () => LA('80–119 km/h', '80〜119km/h', '80–119 km/h', '80–119 км/ч', '80–119 km/h'),
    v40: () => LA('40–79 km/h', '40〜79km/h', '40–79 km/h', '40–79 км/ч', '40–79 km/h'),
    vslow: () => LA('Under 40 km/h', '40km/h 未満', 'Unter 40 km/h', 'Менее 40 км/ч', 'Menos de 40 km/h'),
    t1: () => LA('Single track', '単線', 'Eingleisig', 'Однопутный', 'Vía única'),
    t2: () => LA('Double track', '複線', 'Zweigleisig', 'Двухпутный', 'Vía doble'),
    t3: () => LA('Triple track', '三線', 'Dreigleisig', 'Трёхпутный', 'Vía triple'),
    t4: () => LA('Four or more tracks', '四線以上', 'Vier oder mehr Gleise', 'Четыре пути и более', 'Cuatro vías o más'),
    passenger: () => LA('Passenger only', '旅客専用', 'Nur Personenverkehr', 'Только пассажирское', 'Solo pasajeros'),
    freight: () => LA('Freight only', '貨物専用', 'Nur Güterverkehr', 'Только грузовое', 'Solo mercancías'),
    mixed: () => LA('Passenger and freight', '旅客・貨物', 'Personen- und Güterverkehr', 'Пассажирское и грузовое', 'Pasajeros y mercancías'),
    /* ⚠ NOT «In service». That exact English string is already a KEY in the four locale files, put
       there for js/datacenters.js / js/osm-facilities.js / js/subcable-info.js where it labels a
       COMMISSIONING DATE — so this legend row would have printed zh 「啟用時間」 (“activation time”)
       and ko 「가동 시작」 beside 「建設中」, with the i18n gate green and nothing missing. A shared
       key is a shared MEANING; when the meaning differs, the string has to. Found by the
       nine-language sweep, not by the gate. */
    operational: () => LA('Line in operation', '運行中', 'In Betrieb', 'В эксплуатации', 'En servicio'),
    construction: () => LA('Under construction', '建設中', 'Im Bau', 'Строится', 'En construcción'),
    rail: () => LA('Heavy rail', '普通鉄道', 'Eisenbahn', 'Магистральная ж/д', 'Ferrocarril'),
    narrow_gauge: () => LA('Narrow gauge', '軽便・ナローゲージ', 'Schmalspurbahn', 'Узкоколейная', 'Vía estrecha'),
    light_rail: () => LA('Light rail', 'ライトレール', 'Stadtbahn', 'Лёгкое метро', 'Tren ligero'),
    subway: () => LA('Metro / subway', '地下鉄', 'U-Bahn', 'Метро', 'Metro'),
    tram: () => LA('Tram', '路面電車', 'Straßenbahn', 'Трамвай', 'Tranvía'),
    na: NOT_STATED,
  };

  /* ── state ───────────────────────────────────────────────────────────────── */
  const state = { on: false, axis: 'gauge', urban: true, stations: true };
  let world = null;                 /* the world FeatureCollection, once */
  let worldPending = null;
  const cellCache = new Map();      /* key -> features[] (LRU by insertion) */
  const cellPending = new Map();
  let cellIndex = null, cellIndexPending = null;
  const stCache = new Map(), stPending = new Map();
  let stIndex = null, stIndexPending = null;
  let detailCovers = false;         /* every cell the view needs is in hand */
  let wired = false, moveTimer = 0;

  /* ── loading ─────────────────────────────────────────────────────────────
     ⚠ The files are gzip on disk and are un-gzipped HERE, not by the transport:
     GitHub Pages serves a `.gz` as an opaque body, and serving it with
     `Content-Encoding` would not be the same thing (js/gazetteer.js §R210). */
  async function getGz(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + ' → ' + r.status);
    if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream unavailable');
    const txt = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();
    return JSON.parse(txt);
  }
  /* the files are the compact wire form, not GeoJSON — see js/rail-schema.js */
  const getLines = (url) => getGz(url).then(decodeLines);
  const getPoints = (url) => getGz(url).then(decodePoints);

  /* Every axis bucket is computed ONCE, when the features arrive, and stored on
     the feature. Switching axis is then a paint change and not a re-serialisation
     of the source — MEASURED in #R344, `setData` on a 13 MB source costs 11.5 s of
     the main thread, and an axis switch must not cost that. */
  function stamp(features) {
    for (const f of features) {
      const p = f.properties;
      p.bg = gaugeBucket(p.g == null ? null : p.g);
      /* ⚠ THE WORLD LEVEL SHIPS THESE ALREADY. It carries buckets in place of readings, so
         recomputing them from readings it does not have would write 'na' over four correct
         answers — the layer would go grey the moment you zoomed out. */
      if (p.be === undefined) p.be = elecBucket(p.e == null ? null : p.e, p.v || 0, p.c || null);
      if (p.bs === undefined) p.bs = speedBucket(p.s == null ? null : p.s);
      if (p.bt === undefined) p.bt = tracksBucket(p.t == null ? null : p.t);
      if (p.bm === undefined) p.bm = p.m || 'na';
      p.bx = p.x || 'operational';
      p.bk = p.k;
    }
    return features;
  }

  function loadWorld() {
    if (world) return Promise.resolve(world);
    if (worldPending) return worldPending;
    worldPending = getLines(BASE + 'world.json.gz').then((j) => {
      world = { type: 'FeatureCollection', features: stamp(j.features || []) };
      worldPending = null;
      return world;
    }).catch((e) => {
      worldPending = null;
      try { window.imToast && window.imToast(L('Could not load railway data', '鉄道データを読み込めませんでした', 'Eisenbahndaten konnten nicht geladen werden', 'Не удалось загрузить данные о железных дорогах', 'No se pudieron cargar los datos ferroviarios')); } catch (_) {}
      throw e;
    });
    return worldPending;
  }

  function loadIndex() {
    if (cellIndex) return Promise.resolve(cellIndex);
    if (cellIndexPending) return cellIndexPending;
    cellIndexPending = fetch(BASE + 'index.json').then((r) => r.json()).then((j) => {
      cellIndex = j; cellIndexPending = null; return j;
    }).catch(() => { cellIndexPending = null; cellIndex = { cell: 5, cells: {} }; return cellIndex; });
    return cellIndexPending;
  }

  const cellKey = (lat, lon) => `${lat}_${lon}`.replace(/-/g, 'm');

  function neededCells(bounds, deg) {
    const out = [];
    const lat0 = Math.floor(bounds.south / deg) * deg, lat1 = Math.floor(bounds.north / deg) * deg;
    const lon0 = Math.floor(bounds.west / deg) * deg, lon1 = Math.floor(bounds.east / deg) * deg;
    for (let la = lat0; la <= lat1; la += deg) {
      for (let lo = lon0; lo <= lon1; lo += deg) {
        /* ⚠ a view that straddles the antimeridian has west > east; wrapping the
           longitude here is what keeps the Pacific from asking for 72 cells */
        const lon = ((lo + 180) % 360 + 360) % 360 - 180;
        out.push([la, Math.floor(lon / deg) * deg]);
      }
    }
    return out;
  }

  function loadCell(key) {
    if (cellCache.has(key)) { const v = cellCache.get(key); cellCache.delete(key); cellCache.set(key, v); return Promise.resolve(v); }
    if (cellPending.has(key)) return cellPending.get(key);
    const p = getLines(BASE + 'c/' + key + '.json.gz').then((j) => {
      const feats = stamp(j.features || []);
      cellCache.set(key, feats);
      while (cellCache.size > CELL_LRU) cellCache.delete(cellCache.keys().next().value);
      cellPending.delete(key);
      return feats;
    }).catch(() => { cellPending.delete(key); cellCache.set(key, []); return []; });
    cellPending.set(key, p);
    return p;
  }

  /* stations are sharded on the SAME 5° grid as the lines — one world file measured 4.08 MB gz,
     which is not a price to pay for one city's worth of dots */
  function loadStIndex() {
    if (stIndex) return Promise.resolve(stIndex);
    if (stIndexPending) return stIndexPending;
    stIndexPending = fetch(BASE + 'st-index.json').then((r) => r.json()).then((j) => {
      stIndex = j; stIndexPending = null; return j;
    }).catch(() => { stIndexPending = null; stIndex = { cell: 5, cells: {} }; return stIndex; });
    return stIndexPending;
  }
  function loadStCell(key) {
    if (stCache.has(key)) { const v = stCache.get(key); stCache.delete(key); stCache.set(key, v); return Promise.resolve(v); }
    if (stPending.has(key)) return stPending.get(key);
    const p = getPoints(BASE + 'st/' + key + '.json.gz').then((j) => {
      const feats = j.features || [];
      stCache.set(key, feats);
      while (stCache.size > CELL_LRU) stCache.delete(stCache.keys().next().value);
      stPending.delete(key);
      return feats;
    }).catch(() => { stPending.delete(key); stCache.set(key, []); return []; });
    stPending.set(key, p);
    return p;
  }

  /* ── paint ───────────────────────────────────────────────────────────────
     One expression per axis, generated from the SAME table the build classified
     with. The old layer wrote its colour table twice — in the Python and in
     js/layer-packs.js — and they had already drifted apart. */
  const AXIS_PROP = { gauge: 'bg', electrification: 'be', speed: 'bs', tracks: 'bt', traffic: 'bm', status: 'bx', kind: 'bk' };
  function colourExpr(axis) {
    const spec = AXES[axis];
    const m = ['match', ['get', AXIS_PROP[axis]]];
    for (const [id, col] of spec.buckets) m.push(id, col);
    m.push(UNKNOWN_COLOUR);
    return m;
  }
  /* Urban rail is thinner than the mainline it runs beside, and a line under
     construction is drawn dashed — the two things you must not have to read a
     legend to tell apart. */
  const widthExpr = ['interpolate', ['linear'], ['zoom'],
    2, ['case', ['==', ['get', 'k'], 'rail'], 0.7, 0.4],
    6, ['case', ['==', ['get', 'k'], 'rail'], 1.5, 0.9],
    10, ['case', ['match', ['get', 'k'], ['subway', 'tram', 'light_rail'], true, false], 1.6, 2.6],
    14, ['case', ['match', ['get', 'k'], ['subway', 'tram', 'light_rail'], true, false], 2.4, 4.2]];

  function lineLayer(id, source, extra) {
    return Object.assign({
      id, type: 'line', source,
      layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': colourExpr(state.axis), 'line-width': widthExpr, 'line-opacity': 0.92 },
    }, extra || {});
  }

  function before() { try { return HOST.beforeId ? HOST.beforeId() : undefined; } catch (_) { return undefined; } }

  function ensure() {
    if (GE().layers.hasSource('rail-src')) return true;
    if (!_imCanDraw()) return false;
    try {
      const ATTR = '© OpenStreetMap contributors (ODbL)';
      const empty = { type: 'FeatureCollection', features: [] };
      GE().layers.addSource('rail-src', { type: 'geojson', data: world || empty, attribution: ATTR });
      GE().layers.addSource('rail-det-src', { type: 'geojson', data: empty, attribution: ATTR });
      GE().layers.addSource('rail-st-src', { type: 'geojson', data: empty, attribution: ATTR });
      GE().layers.add(lineLayer('rail-ln', 'rail-src'), before());
      GE().layers.add(lineLayer('rail-det-ln', 'rail-det-src', { minzoom: DETAIL_Z }), before());
      /* the dash is on its own layer because a MapLibre line cannot be dashed
         conditionally — `line-dasharray` takes no data expression */
      GE().layers.add({
        id: 'rail-cons-ln', type: 'line', source: 'rail-det-src', minzoom: DETAIL_Z,
        filter: ['==', ['get', 'x'], 'construction'],
        layout: { visibility: 'none', 'line-cap': 'butt', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.6, 14, 1.8], 'line-dasharray': [2, 2], 'line-opacity': 0.85 },
      }, before());
      GE().layers.add({
        id: 'rail-st', type: 'circle', source: 'rail-st-src', minzoom: STATION_Z,
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.2, 12, 4.4, 16, 6.5],
          'circle-color': ['case', ['==', ['get', 'h'], 1], '#ffd43b', '#ffffff'],
          'circle-stroke-color': '#1a1d23', 'circle-stroke-width': 1.1, 'circle-opacity': 0.95,
        },
      }, before());
      GE().layers.add({
        id: 'rail-st-lbl', type: 'symbol', source: 'rail-st-src', minzoom: 10,
        layout: {
          visibility: 'none', 'text-field': ['get', 'n'],
          'text-size': window.IntMapLabelScale.sub(0.8), 'text-offset': [0, 1.0], 'text-anchor': 'top',
          'text-font': ['literal', ['Noto Sans Regular']], 'text-max-width': 14,
        },
        paint: { 'text-color': '#e8eef8', 'text-halo-color': 'rgba(0,0,0,0.82)', 'text-halo-width': 1.2 },
      }, before());
      wire();
      return true;
    } catch (_) { return false; }
  }

  /* ⚠ THE CONTRACT'S NAMES, NOT THE PLAUSIBLE ONES. The first draft of this file called
     `layers.setVisibility`, `camera.zoom()` and `camera.bounds()` — none of which exist; the facade
     spells them `setVisible`, `getZoom`, `getBounds`. Every one of those calls sits inside a
     `try/catch`, so the TypeError was swallowed and the layer simply never became visible and the
     detail cells were never requested: a toggle that looks alive and does nothing, which is the
     shape this project keeps paying for. Checked against js/geo-engine.js, not from memory. */
  function setVis(ids, on) {
    for (const id of ids) { try { if (GE().layers.has(id)) GE().layers.setVisible(id, on); } catch (_) {} }
  }
  /* MapLibre hands back a LngLatBounds (methods), the Cesium adapter can hand back a plain box —
     one reader for both, and null when the camera cannot answer. */
  function viewBox() {
    let b;
    try { b = GE().camera.getBounds(); } catch (_) { return null; }
    if (!b) return null;
    if (typeof b.getSouth === 'function') return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
    if (typeof b.south === 'number') return b;
    if (Array.isArray(b) && b.length === 4) return { west: b[0], south: b[1], east: b[2], north: b[3] };
    return null;
  }
  function applyAxis() {
    for (const id of ['rail-ln', 'rail-det-ln']) {
      try { if (GE().layers.has(id)) GE().layers.setPaint(id, 'line-color', colourExpr(state.axis)); } catch (_) {}
    }
  }
  function applyUrbanFilter() {
    const f = state.urban ? null : ['match', ['get', 'k'], ['subway', 'tram', 'light_rail'], false, true];
    try { if (GE().layers.has('rail-det-ln')) GE().layers.setFilter('rail-det-ln', f); } catch (_) {}
  }

  /* ── the viewport: which cells, and does the world file still have to draw ─ */
  function refreshDetail() {
    if (!state.on) return;
    let z = 0;
    try { z = GE().camera.getZoom(); } catch (_) { return; }
    const bounds = viewBox();
    if (z < DETAIL_Z || !bounds) {
      detailCovers = false;
      setVis(['rail-det-ln', 'rail-cons-ln'], false);
      setVis(['rail-ln'], true);
      return;
    }
    loadIndex().then((idx) => {
      const want = neededCells(bounds, idx.cell || 5)
        .map(([la, lo]) => cellKey(la, lo))
        .filter((k, i, a) => a.indexOf(k) === i)
        .filter((k) => Object.prototype.hasOwnProperty.call(idx.cells, k));
      if (want.length > MAX_CELLS) {
        /* a view this wide is what the world file is for */
        detailCovers = false;
        setVis(['rail-det-ln', 'rail-cons-ln'], false);
        setVis(['rail-ln'], true);
        return;
      }
      Promise.all(want.map(loadCell)).then((lists) => {
        if (!state.on) return;
        const feats = [];
        for (const l of lists) for (const f of l) feats.push(f);
        try { GE().layers.setSourceData('rail-det-src', { type: 'FeatureCollection', features: feats }); } catch (_) {}
        /* ⚠ THE WORLD LAYER IS HIDDEN ONLY ONCE THE DETAIL IS IN HAND. Hiding it
           on the zoom threshold alone leaves the map blank for as long as the
           fetch takes, which on a cold cell is the whole of it. */
        detailCovers = true;
        setVis(['rail-det-ln'], true);
        setVis(['rail-cons-ln'], true);
        setVis(['rail-ln'], false);
        applyUrbanFilter();
      });
      if (state.stations && z >= STATION_Z) {
        loadStIndex().then((sIdx) => {
          const keys = neededCells(bounds, sIdx.cell || 5)
            .map(([la, lo]) => cellKey(la, lo))
            .filter((k, i, a) => a.indexOf(k) === i)
            .filter((k) => Object.prototype.hasOwnProperty.call(sIdx.cells, k));
          if (keys.length > MAX_CELLS) { setVis(['rail-st', 'rail-st-lbl'], false); return; }
          Promise.all(keys.map(loadStCell)).then((lists) => {
            if (!state.on || !state.stations) return;
            const feats = [];
            for (const l of lists) for (const f of l) feats.push(f);
            try { GE().layers.setSourceData('rail-st-src', { type: 'FeatureCollection', features: feats }); } catch (_) {}
            setVis(['rail-st', 'rail-st-lbl'], true);
          });
        });
      } else setVis(['rail-st', 'rail-st-lbl'], false);
    });
  }

  /* ── the detail card ─────────────────────────────────────────────────────── */
  let card = null;
  function closeCard() { try { if (card && card.parentNode) card.parentNode.removeChild(card); } catch (_) {} card = null; }
  function row(k, v) {
    return v ? ('<div style="display:flex;gap:10px;justify-content:space-between;font-size:12.5px;padding:4px 0;border-bottom:1px solid rgba(128,128,128,0.14);">'
      + '<span style="color:var(--text-muted);flex:0 0 auto;">' + S(k) + '</span><b style="color:var(--text-main);text-align:right;">' + v + '</b></div>') : '';
  }
  /* ⚠ A FIELD OSM DOES NOT CARRY IS ABSENT FROM THE CARD, never «—», never 0.
     `Number(null)` is 0 and `isFinite(0)` is true; that pair shipped a wrong
     number three times in one round (#R354), so the test is on the value's
     presence and never on its truthiness. */
  const has = (v) => v !== undefined && v !== null && v !== '';
  const bl = (id) => { const f = BUCKET_LABEL[id]; return f ? L.arr(f()) : ''; };

  function openCard(p, lngLat) {
    closeCard();
    const el = document.createElement('div');
    el.className = 'country-popup'; el.id = 'rail-detail'; el.style.display = 'block';
    const title = has(p.n) ? p.n : (has(p.r) ? p.r : L.arr(BUCKET_LABEL[p.k] ? BUCKET_LABEL[p.k]() : BUCKET_LABEL.rail()));
    const sub = [bl(p.bk), has(p.u) ? usageWord(p.u) : '', p.x === 'construction' ? bl('construction') : ''].filter(Boolean).join(' · ');
    const swatch = (AXES[state.axis].buckets.find(([id]) => id === p[AXIS_PROP[state.axis]]) || [null, UNKNOWN_COLOUR])[1];
    const volts = has(p.v) ? (p.v >= 1000 ? (p.v / 1000) + ' kV' : p.v + ' V') : '';
    const cur = p.c === 'ac' ? 'AC' : (p.c === 'dc' ? 'DC' : '');
    const elecTxt = has(p.e)
      ? (p.e === 'no' ? bl('no') : [bl(p.be), volts && cur ? (volts + ' ' + cur + (has(p.q) && p.q > 0 ? ' ' + p.q + ' Hz' : '')) : volts].filter(Boolean).join(' · '))
      : '';
    el.innerHTML = '<button class="country-popup-close cp-close" type="button" aria-label="' + S(L('Close', '閉じる', 'Schließen', 'Закрыть', 'Cerrar')) + '" title="' + S(L('Close', '閉じる', 'Schließen', 'Закрыть', 'Cerrar')) + '">×</button>'
      + '<div style="padding:16px 18px 18px;">'
      + '<div class="rail-drag" style="display:flex;align-items:center;gap:9px;margin-bottom:3px;padding-right:32px;cursor:move;user-select:none;">'
      + '<span style="width:16px;height:3.5px;border-radius:2px;flex:none;background:' + S(swatch) + ';"></span>'
      + '<span style="font-weight:700;font-size:15px;color:var(--text-main);">' + S(title) + '</span></div>'
      + '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px;">' + S(sub) + '</div>'
      + row(L.arr(AXIS_LABEL.gauge()), has(p.g) ? (S(p.g) + ' mm' + (p.dg ? ' · ' + S(L('dual gauge', 'デュアルゲージ', 'Dreischienengleis', 'совмещённая колея', 'ancho dual')) : '')) : '')
      + row(L.arr(AXIS_LABEL.electrification()), S(elecTxt))
      + row(L.arr(AXIS_LABEL.speed()), has(p.s) ? (S(p.s) + ' km/h') : '')
      + row(L.arr(AXIS_LABEL.tracks()), has(p.t) ? S(bl(p.bt)) : '')
      + row(L.arr(AXIS_LABEL.traffic()), has(p.m) ? S(bl(p.m)) : '')
      + row(L('High-speed line', '高速鉄道', 'Hochgeschwindigkeitsstrecke', 'Высокоскоростная линия', 'Línea de alta velocidad'), p.h ? S(L('Yes', 'はい', 'Ja', 'Да', 'Sí')) : '')
      + row(L('Line number', '路線番号', 'Streckennummer', 'Номер линии', 'Número de línea'), has(p.r) ? S(p.r) : '')
      + row(L('Operator', '運行会社', 'Betreiber', 'Оператор', 'Operador'), has(p.o) ? S(p.o) : '')
      + row(L('Year opened', '開業', 'Eröffnet', 'Открыта', 'Inaugurada'), has(p.y) ? S(p.y) : '')
      + row(L.arr(AXIS_LABEL.status()), S(bl(p.bx)))
      + row(L('OSM way', 'OSM ウェイ', 'OSM-Way', 'Линия OSM', 'Vía OSM'), has(p.i) ? ('<a href="' + U('https://www.openstreetmap.org/way/' + p.i) + '" target="_blank" rel="noopener" style="color:var(--primary-color);">' + S(p.i) + '</a>') : '')
      + '<div style="margin-top:11px;font-size:9.5px;color:var(--text-muted);line-height:1.55;">'
      + S(L('Every field above is a tag on this track in OpenStreetMap. A field OSM does not carry is left out rather than guessed — the layer never fills a gauge in from the country the line happens to run through.',
        '上の項目はすべて、この線路そのものに付いた OpenStreetMap のタグです。OSM に無い項目は推測せず省略しています——通っている国の主流軌間で埋めることはしません。',
        'Jedes Feld oben ist ein Tag dieses Gleises in OpenStreetMap. Fehlende Angaben werden weggelassen, nicht geraten — nie aus dem durchfahrenen Land ergänzt.',
        'Каждое поле выше — тег этого пути в OpenStreetMap. Отсутствующие значения опускаются, а не угадываются по стране.',
        'Cada campo es una etiqueta de esta vía en OpenStreetMap. Lo que OSM no indica se omite, nunca se deduce del país por el que pasa.'))
      + '</div></div>';
    place(el, lngLat, '.rail-drag');
  }

  function usageWord(u) {
    const T = {
      main: () => LA('Main line', '幹線', 'Hauptstrecke', 'Магистраль', 'Línea principal'),
      branch: () => LA('Branch line', '支線', 'Nebenstrecke', 'Ветка', 'Ramal'),
      industrial: () => LA('Industrial line', '専用線', 'Industriebahn', 'Промышленная', 'Línea industrial'),
      tourism: () => LA('Heritage / tourist line', '観光鉄道', 'Museumsbahn', 'Туристическая', 'Línea turística'),
      military: () => LA('Military line', '軍用線', 'Militärbahn', 'Военная', 'Línea militar'),
      test: () => LA('Test track', '試験線', 'Teststrecke', 'Испытательный путь', 'Vía de pruebas'),
    };
    return T[u] ? L.arr(T[u]()) : '';
  }

  function openStationCard(p, lngLat) {
    closeCard();
    const el = document.createElement('div');
    el.className = 'country-popup'; el.id = 'rail-detail'; el.style.display = 'block';
    const modes = [
      p.tr ? L.arr(LA('Train', '鉄道', 'Zug', 'Поезд', 'Tren')) : '',
      p.sb ? L.arr(BUCKET_LABEL.subway()) : '',
      p.lr ? L.arr(BUCKET_LABEL.light_rail()) : '',
      p.tm ? L.arr(BUCKET_LABEL.tram()) : '',
    ].filter(Boolean).join(' · ');
    el.innerHTML = '<button class="country-popup-close cp-close" type="button" aria-label="' + S(L('Close', '閉じる', 'Schließen', 'Закрыть', 'Cerrar')) + '" title="' + S(L('Close', '閉じる', 'Schließen', 'Закрыть', 'Cerrar')) + '">×</button>'
      + '<div style="padding:16px 18px 18px;">'
      + '<div class="rail-drag" style="display:flex;align-items:center;gap:9px;margin-bottom:3px;padding-right:32px;cursor:move;user-select:none;">'
      + '<span style="width:11px;height:11px;border-radius:7px;flex:none;background:' + (p.h ? '#ffd43b' : '#ffffff') + ';border:1px solid #1a1d23;"></span>'
      + '<span style="font-weight:700;font-size:15px;color:var(--text-main);">' + S(p.n) + '</span></div>'
      + '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px;">'
      + S(p.h ? L.arr(LA('Halt', '停留所', 'Haltepunkt', 'Остановочный пункт', 'Apeadero')) : L.arr(LA('Station', '駅', 'Bahnhof', 'Станция', 'Estación'))) + '</div>'
      + row(L('Modes', '種別', 'Verkehrsarten', 'Виды', 'Modos'), S(modes))
      + row(L('Operator', '運行会社', 'Betreiber', 'Оператор', 'Operador'), has(p.o) ? S(p.o) : '')
      + row(L('Network', '路線網', 'Netz', 'Сеть', 'Red'), has(p.w) ? S(p.w) : '')
      + row(L('Station code', '駅コード', 'Stationscode', 'Код станции', 'Código de estación'), has(p.r) ? S(p.r) : '')
      + row(L('UIC reference', 'UIC コード', 'UIC-Referenz', 'Код UIC', 'Referencia UIC'), has(p.u) ? S(p.u) : '')
      + row(L('Year opened', '開業', 'Eröffnet', 'Открыта', 'Inaugurada'), has(p.y) ? S(p.y) : '')
      + row(L('OSM object', 'OSMオブジェクト', 'OSM-Objekt', 'Объект OSM', 'Objeto OSM'), has(p.i) ? ('<a href="' + U('https://www.openstreetmap.org/node/' + p.i) + '" target="_blank" rel="noopener" style="color:var(--primary-color);">' + S(p.i) + '</a>') : '')
      + '</div>';
    place(el, lngLat, '.rail-drag');
  }

  /* ⚠ `.country-popup` is position:absolute with no left/top of its own — an
     element appended to <body> takes the end of the document flow, i.e. below the
     fold. Placing it is part of using this shell (#R255). */
  function place(el, lngLat, dragSel) {
    document.body.appendChild(el); card = el;
    try {
      const vw = window.innerWidth || 1200, vh = window.innerHeight || 800;
      const w = el.offsetWidth || 380, h = el.offsetHeight || 300;
      const rs = (() => { try { const s = document.getElementById('layer-sidebar-r'); return (s && document.body.classList.contains('lsr-open')) ? s.getBoundingClientRect().width : 0; } catch (_) { return 0; } })();
      const px = (() => { try { const p = GE().coords.project({ lng: +lngLat.lng, lat: +lngLat.lat }); const r = GE().render.canvas().getBoundingClientRect(); return r.left + p.x; } catch (_) { return null; } })();
      let left = (px != null) ? (px + 18) : (vw - rs - w - 24);
      left = Math.max(12, Math.min(left, vw - rs - w - 12));
      el.style.left = Math.round(Math.max(12, left)) + 'px';
      el.style.top = Math.round(Math.max(12, Math.min(96, vh - h - 16))) + 'px';
    } catch (_) { el.style.left = '16px'; el.style.top = '96px'; }
    try { HOST.makeDraggable && HOST.makeDraggable(el, el.querySelector(dragSel)); } catch (_) {}
    try { el.querySelector('.cp-close').onclick = closeCard; } catch (_) {}
  }

  function wire() {
    if (wired) return; wired = true;
    for (const id of ['rail-det-ln', 'rail-ln']) {
      GE().events.onLayer('click', id, (e) => {
        const f = e.features && e.features[0]; if (!f) return;
        openCard(f.properties || {}, e.lngLat);
      });
      GE().events.onLayer('mouseenter', id, () => { try { GE().render.canvas().style.cursor = 'pointer'; } catch (_) {} });
      GE().events.onLayer('mouseleave', id, () => { try { GE().render.canvas().style.cursor = ''; } catch (_) {} });
    }
    GE().events.onLayer('click', 'rail-st', (e) => {
      const f = e.features && e.features[0]; if (!f) return;
      openStationCard(f.properties || {}, { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] });
    });
    GE().events.onLayer('mouseenter', 'rail-st', () => { try { GE().render.canvas().style.cursor = 'pointer'; } catch (_) {} });
    GE().events.onLayer('mouseleave', 'rail-st', () => { try { GE().render.canvas().style.cursor = ''; } catch (_) {} });
    GE().events.on('moveend', () => {
      if (!state.on) return;
      clearTimeout(moveTimer);
      moveTimer = setTimeout(refreshDetail, 180);
    });
  }

  /* ── the public surface ──────────────────────────────────────────────────── */
  function toggle(on) {
    state.on = !!on;
    const go = () => {
      if (!ensure()) { GE().events.once('idle', go); return; }
      if (on) {
        loadWorld().then((fc) => {
          if (!state.on) return;
          try { GE().layers.setSourceData('rail-src', fc); } catch (_) {}
          setVis(['rail-ln'], !detailCovers);
          refreshDetail();
        }).catch(() => {});
      } else {
        setVis(['rail-ln', 'rail-det-ln', 'rail-cons-ln', 'rail-st', 'rail-st-lbl'], false);
        closeCard();
      }
    };
    go();
  }

  function setAxis(a) {
    if (!AXES[a]) return;
    state.axis = a;
    applyAxis();
  }
  function setUrban(on) { state.urban = !!on; applyUrbanFilter(); }
  function setStations(on) { state.stations = !!on; if (!on) setVis(['rail-st', 'rail-st-lbl'], false); else refreshDetail(); }

  /** the legend rows for the axis in force: [colour, label, bucketId] */
  function key() {
    return AXES[state.axis].buckets.map(([id, col]) => [col, bl(id), id]);
  }
  function axes() { return Object.keys(AXIS_LABEL).map((k) => [k, L.arr(AXIS_LABEL[k]())]); }

  /* js/compare.js draws this layer in its own map from the FeatureCollection —
     the second door into this module, and it gets the real thing (#R311). */
  function loadWorldFC(cb) { loadWorld().then((fc) => { try { cb(fc); } catch (_) {} }).catch(() => {}); }

  function drop() {
    try {
      for (const id of ['rail-st-lbl', 'rail-st', 'rail-cons-ln', 'rail-det-ln', 'rail-ln']) if (GE().layers.has(id)) GE().layers.remove(id);
      for (const s2 of ['rail-st-src', 'rail-det-src', 'rail-src']) if (GE().layers.hasSource(s2)) GE().layers.removeSource(s2);
    } catch (_) {}
    world = null; cellCache.clear(); stCache.clear(); wired = false; detailCovers = false;
  }

  window.IntMapRailways = {
    toggle, setAxis, setUrban, setStations, key, axes, drop, refresh: refreshDetail,
    /* js/compare.js paints its own copy of the world file — it asks for the expression
       rather than writing a second colour table (#R388). */
    colour: () => colourExpr(state.axis),
    axis: () => state.axis, urban: () => state.urban, stations: () => state.stations, load: loadWorldFC,
    /* the world file as it stands, for callers that already have it in hand (the Compare overlay
       asks through `load`, which is the same object) */
    world: () => world,
    count: () => (world ? world.features.length : 0),
  };
  return window.IntMapRailways;
};
