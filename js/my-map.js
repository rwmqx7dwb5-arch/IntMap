/* ============================================================================
 *  IntMap · MY MAP — a map the reader draws, writes on, measures, analyses and sends   (map-next)
 * ----------------------------------------------------------------------------
 *  「利用者が自分の地図（レイヤー＋注記＋描画）を作って保存し共有できる」
 *
 *  WHAT WAS THERE. A reader could drop a pin, keep a measured line or a traced area «on the map»
 *  (IntMapAnnotations, js/map-extras.js), draw a radius circle — and every one of them lived in the tab's
 *  memory: a reload took them, a link did not carry them, no name or note could be written on a pin, and
 *  none of them could be handed to the GIS layer or saved as a file. The things a reader MADE were the one
 *  part of the map that could not be kept or sent.
 *
 *  WHAT THIS IS. One document per map (js/my-map-doc.js): pins, lines and areas, each with a name, a note
 *  and a colour, drawn by clicking vertices on the map. It is
 *    · KEPT in this browser (localStorage `intmap_mymaps`, a small library: several maps, one current);
 *    · PART OF THE MAP'S STATE — the `mymap` field of js/map-state.js (`&mm=`), so the address bar, every
 *      share link, an embed and a classroom tour's step carry it with the camera, layers and date; the
 *      reader who opens the link sees the same drawing over the same map, read-only, and can keep a copy;
 *    · MEASURED by the app's own measure tool functions (HOST.ringArea / turf distance, HOST.distHTML /
 *      areaHTML in the reader's units) — one answer to «how long is this line»;
 *    · ANALYSABLE — «Use in analysis» registers it as a dataset in the GIS layer (js/gis-datasets.js), so
 *      the fourteen operations (buffer, clip, zonal statistics over a population grid …) run on it;
 *    · EXPORTABLE as GeoJSON or GeoPackage through the GIS layer's own writers (js/gis-export.js);
 *    · REACHABLE from Atlas (`map.myMap`, js/atlas-cap-map.js) and from Layers ▸ Tools.
 *  «Collect from the map» moves the reader's session-only pins, kept shapes and radius circles into it.
 *
 *  ⚠ THE GEOMETRY ON THE MAP IS THE GEOMETRY ANALYSED AND EXPORTED: each edge is the great circle between
 *  two vertices, cut into pieces and at the antimeridian once (js/my-map-doc.js geometryOf), and all three
 *  readers take that one result.
 *  ⚠ IntMap-authored text is en + jp (CONSTITUTION.md §7). What the reader writes is theirs, shown as text.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { MapState } from './map-state.js';
import { icon } from './icons.js';
import './safe-html.js';   /* publishes globalThis.IntMapSafe — the one encoder every string below is written with */
import * as D from './my-map-doc.js';
import * as bus from './bus.js';   /* the declared events (js/bus.js): the language change is heard through it, not a bare window listener */

/* where the library is kept. One key: {v:1, current, maps:[doc…]} */
const STORE = 'intmap_mymaps';
/* the map's sources (claimed under the effect key Atlas's capability declares — js/geo-engine.js render.claim) */
const SRC = 'mymap-src', LBL = 'mymap-lbl-src', DRAFT = 'mymap-draft-src';
/* ⚠ HOW NEAR A CLICK MUST BE TO A VERTEX TO MEAN THAT VERTEX: the measure tool's own SNAP_PX
   (js/app-body.js, 22 px «the cursor is on the first point») — read from the host, so «close the ring by
   clicking its first point» is the same gesture in both tools. */
const snapPx = (HOST) => { try { const v = +HOST.SNAP_PX; return v > 0 ? v : 22; } catch (_) { return 22; } };

export function myMap(HOST) {
  const GE = () => IntMapGeoEngine;
  const L = (en, jp) => IntMapLang.t(HOST.lang, en, jp);
  const H = (s) => globalThis.IntMapSafe.html(s);
  const G = () => window.IntMapGeodesy;
  const toast = (m) => { try { HOST.imToast(m); } catch (_) { } };
  /* the page's other tools this one has to step aside for or hand things to — each read off the page once, here */
  const drawTool = () => window.DrawTool || null;
  const annotations = () => window.IntMapAnnotations || null;
  const drawToolActive = () => { const T = drawTool(); return !!(T && T.active && T.active()); };

  /* ══ THE LIBRARY ══════════════════════════════════════════════════════════════════════════════ */
  let lib = load();
  function load() {
    let o = null; try { o = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (_) { o = null; }
    const maps = []; let dropped = 0;
    ((o && Array.isArray(o.maps)) ? o.maps : []).forEach((m) => { const r = D.readDoc(m); if (r) { maps.push(r.doc); dropped += r.dropped; } });
    const current = (o && maps.some((m) => m.id === o.current)) ? o.current : (maps[0] ? maps[0].id : null);
    return { current, maps, dropped };
  }
  let saveErr = false;
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ v: 1, current: lib.current, maps: lib.maps })); saveErr = false; }
    catch (_) { saveErr = true; }
  }
  /** the current map, made when it is first needed */
  function cur(make) {
    let d = lib.maps.find((m) => m.id === lib.current) || null;
    if (!d && make) { d = D.newDoc(''); lib.maps.unshift(d); lib.current = d.id; save(); }
    return d;
  }

  /* ══ WHAT IS ON THE MAP ════════════════════════════════════════════════════════════════════════
     `shown`: null (nothing), 'own' (the current map), 'received' (a map a link carried, read-only). */
  let shown = null, received = null, sel = null;
  const shownDoc = () => shown === 'own' ? cur(false) : (shown === 'received' && received ? received.doc : null);

  /** what the app's measure tools say about one feature (the same functions, so one answer) */
  function measure(f) {
    const out = {};
    try {
      if (f.kind === 'line' && typeof turf !== 'undefined') { let s = 0; for (let i = 1; i < f.coords.length; i++) s += turf.distance(turf.point(f.coords[i - 1]), turf.point(f.coords[i]), { units: 'kilometers' }); out.lengthKm = s; }
      if (f.kind === 'area') {
        out.areaKm2 = HOST.ringArea(f.coords);
        if (typeof turf !== 'undefined') { const r = f.coords.concat([f.coords[0]]); let s = 0; for (let i = 1; i < r.length; i++) s += turf.distance(turf.point(r[i - 1]), turf.point(r[i]), { units: 'kilometers' }); out.perimeterKm = s; }
      }
    } catch (_) { }
    return out;
  }
  /* the measure tool's own formatting in the reader's units, in its TEXT form (HOST.distTXT / areaTXT — the same
     numbers and units as the panel's distHTML / areaHTML, without the styling span). It is written into the panel and
     the popup as text, through the encoder; nothing here turns markup into text by removing tags. */
  function measureText(f) {
    if (f.kind === 'pin') return f.coords[0][1].toFixed(5) + ', ' + f.coords[0][0].toFixed(5);
    const m = measure(f);
    if (f.kind === 'line') return m.lengthKm != null ? String(HOST.distTXT(m.lengthKm)) : '';
    if (D.polar(f, G())) return L('Encloses a pole — not drawn', '極を囲む範囲のため描画できません');
    return (m.areaKm2 != null ? String(HOST.areaTXT(m.areaKm2)) : '') + (m.perimeterKm != null ? ' · ' + L('perimeter ', '周囲 ') + String(HOST.distTXT(m.perimeterKm)) : '');
  }

  /* ══ THE MAP LAYERS ════════════════════════════════════════════════════════════════════════════ */
  const fc = (features) => ({ type: 'FeatureCollection', features });
  let handlersOn = false;
  function ensure() {
    try {
      if (!HOST.canDraw()) return false;
      const E = GE();
      if (!E.layers.hasSource(SRC)) E.layers.addSource(SRC, { type: 'geojson', data: fc([]) });
      if (!E.layers.hasSource(LBL)) E.layers.addSource(LBL, { type: 'geojson', data: fc([]) });
      if (!E.layers.hasSource(DRAFT)) E.layers.addSource(DRAFT, { type: 'geojson', data: fc([]) });
      const font = ['literal', ['Noto Sans Regular']];
      let sub = 12; try { const S = window.IntMapLabelScale; if (S && S.sub) sub = S.sub(0.95); } catch (_) { }
      const add = (spec) => { if (!E.layers.has(spec.id)) E.layers.add(spec); };
      add({ id: 'mymap-fill', type: 'fill', source: SRC, filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['==', ['get', 'sel'], 1], 0.32, 0.2] } });
      add({ id: 'mymap-line', type: 'line', source: SRC, filter: ['!=', '$type', 'Point'], layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['==', ['get', 'sel'], 1], 4.5, 3] } });
      add({ id: 'mymap-pt', type: 'circle', source: SRC, filter: ['==', '$type', 'Point'],
        paint: { 'circle-radius': ['case', ['==', ['get', 'sel'], 1], 9, 7], 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.2 } });
      add({ id: 'mymap-lbl', type: 'symbol', source: LBL,
        layout: { 'text-field': ['get', 'name'], 'text-font': font, 'text-size': sub, 'text-offset': ['case', ['==', ['get', 'kind'], 'pin'], ['literal', [0, 1.1]], ['literal', [0, 0]]], 'text-anchor': ['case', ['==', ['get', 'kind'], 'pin'], 'top', 'center'], 'text-max-width': 12, 'text-optional': true },
        paint: { 'text-color': '#1c1c1e', 'text-halo-color': 'rgba(255,255,255,0.94)', 'text-halo-width': 1.6 } });
      add({ id: 'mymap-draft-fill', type: 'fill', source: DRAFT, filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#007aff', 'fill-opacity': 0.14 } });
      add({ id: 'mymap-draft-line', type: 'line', source: DRAFT, filter: ['==', '$type', 'LineString'], layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#007aff', 'line-width': 2.6, 'line-dasharray': ['case', ['==', ['get', 'band'], 1], ['literal', [1.5, 1.5]], ['literal', [1, 0]]] } });
      add({ id: 'mymap-draft-pt', type: 'circle', source: DRAFT, filter: ['==', '$type', 'Point'],
        paint: { 'circle-radius': ['case', ['==', ['get', 'first'], 1], 7, 5], 'circle-color': '#ffffff', 'circle-stroke-color': '#007aff', 'circle-stroke-width': 2.4 } });
      try { E.render.claim([SRC, LBL], 'map.myMap', { clear: () => hide() }); } catch (_) { }
      if (!handlersOn) {
        handlersOn = true;
        /* the pin first: a renderer calls layer handlers in the order they were registered, and a pin drawn inside an
           area is what a tap on it means (the first handler claims the click; the others see it claimed) */
        ['mymap-pt', 'mymap-line', 'mymap-fill'].forEach((l) => {
          E.events.onLayer('click', l, onFeatureClick);
          E.events.onLayer('mouseenter', l, () => { if (!draw) { try { E.render.canvas().style.cursor = 'pointer'; } catch (_) { } } });
          E.events.onLayer('mouseleave', l, () => { if (!draw) { try { E.render.canvas().style.cursor = ''; } catch (_) { } } });
        });
      }
      return true;
    } catch (_) { return false; }
  }
  /* the source data of what is shown — the one projection the map, the analysis and the file share */
  let waiting = false;
  function paint() {
    const d = shownDoc();
    if (!ensure()) {
      /* the style is not up yet: the renderer says when it is (one promise, not a polling loop), and a style that
         is replaced later re-runs this through the `styledata` listener below */
      if (d && d.features.length && !waiting) { waiting = true; try { GE().whenCanDraw().then(() => { waiting = false; paint(); }, () => { waiting = false; }); } catch (_) { waiting = false; } }
      return;
    }
    const feats = [], lbls = [];
    if (d) d.features.forEach((f) => {
      const g = D.geometryOf(f, G()); if (!g) return;
      feats.push({ type: 'Feature', geometry: g, properties: { fid: f.id, color: f.color, kind: f.kind, sel: f.id === sel ? 1 : 0 } });
      if (f.name) lbls.push({ type: 'Feature', geometry: { type: 'Point', coordinates: D.labelPoint(f, G()) }, properties: { fid: f.id, name: f.name, kind: f.kind } });
    });
    try { GE().layers.setSourceData(SRC, fc(feats)); GE().layers.setSourceData(LBL, fc(lbls)); } catch (_) { }
  }
  try { GE().events.on('styledata', () => { if (shownDoc() || draw) setTimeout(() => { paint(); paintDraft(); }, 80); }); } catch (_) { }

  /* ══ DRAWING — click the vertices; the panel and the keyboard finish, undo or stop ═════════════════ */
  let draw = null;   /* { kind, pts, cursor } */
  function paintDraft() {
    if (!ensure()) return;
    const out = [];
    if (draw && draw.pts.length) {
      const pts = draw.pts, band = draw.cursor ? pts.concat([draw.cursor]) : pts;
      try {
        if (draw.kind === 'area' && band.length >= 3) { const g = D.geometryOf({ kind: 'area', coords: band }, G()); if (g) out.push({ type: 'Feature', geometry: g, properties: {} }); }
        if (pts.length >= 2) { const g = D.geometryOf({ kind: 'line', coords: pts }, G()); (g.type === 'LineString' ? [g.coordinates] : g.coordinates).forEach((c) => out.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: c }, properties: { band: 0 } })); }
        if (draw.cursor) {
          const tail = draw.kind === 'area' && pts.length >= 2 ? [pts[pts.length - 1], draw.cursor, pts[0]] : [pts[pts.length - 1], draw.cursor];
          const g = D.geometryOf({ kind: 'line', coords: tail }, G()); (g.type === 'LineString' ? [g.coordinates] : g.coordinates).forEach((c) => out.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: c }, properties: { band: 1 } }));
        }
      } catch (_) { }
      pts.forEach((p, i) => out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: { first: i === 0 ? 1 : 0 } }));
    }
    try { GE().layers.setSourceData(DRAFT, fc(out)); } catch (_) { }
  }
  function startDraw(kind) {
    if (!D.KINDS[kind]) return { ok: false, reason: 'kind-unknown' };
    if (shown === 'received') return { ok: false, reason: 'received' };
    stopDraw(false);
    /* one gesture owner at a time: the measure tools and the freehand trace step aside, as they do for each other */
    try { if (typeof HOST.exitTool === 'function') HOST.exitTool(); } catch (_) { }
    try { if (drawToolActive()) drawTool().exit(); } catch (_) { }
    cur(true); show();
    draw = { kind, pts: [], cursor: null };
    const E = GE();
    try { E.input.set('doubleClickZoom', false); } catch (_) { }
    try { E.render.canvas().style.cursor = 'crosshair'; } catch (_) { }
    E.events.on('click', onMapClick); E.events.on('dblclick', onDbl); E.events.on('mousemove', onMove);
    document.addEventListener('keydown', onKey, true);
    render();
    return { ok: true, kind };
  }
  function stopDraw(rerender) {
    if (!draw) return;
    draw = null;
    const E = GE();
    try { E.events.off('click', onMapClick); E.events.off('dblclick', onDbl); E.events.off('mousemove', onMove); } catch (_) { }
    document.removeEventListener('keydown', onKey, true);
    try { E.input.set('doubleClickZoom', true); } catch (_) { }
    try { E.render.canvas().style.cursor = ''; } catch (_) { }
    paintDraft();
    if (rerender !== false) render();
  }
  function near(a, b) {
    try { const E = GE(), p = E.coords.project(a), q = E.coords.project(b); return Math.hypot(p.x - q.x, p.y - q.y) < snapPx(HOST); } catch (_) { return false; }
  }
  function onMapClick(e) {
    if (!draw) return;
    try { GE().events.claimClick(e); } catch (_) { }   /* the vertex owns this click — the label under it does not open */
    /* another tool took the map while this one was armed: it wins, this one stands down */
    if (HOST.toolMode || drawToolActive()) { stopDraw(); return; }
    /* a press in the space beside the globe or in the sky is not a place — unproject() would still answer one (the far
       limb, the horizon), and a vertex there is drawn behind the Earth where nobody can see or press it */
    let on = null; try { on = GE().coords.onSurface(e.point); } catch (_) { on = null; }
    if (on === false) { say(L('That point is off the Earth — press on the map itself.', 'そこは地球の外です。地図の上を押してください。')); return; }
    if (said.text) say('');
    const p = [e.lngLat.lng, e.lngLat.lat];
    if (draw.kind === 'area' && draw.pts.length >= 3 && near(p, draw.pts[0])) { finishDraw(); return; }
    if (draw.kind === 'line' && draw.pts.length >= 2 && near(p, draw.pts[draw.pts.length - 1])) { finishDraw(); return; }
    draw.pts.push(p);
    if (draw.kind === 'pin') { finishDraw(); return; }
    paintDraft(); renderDrawBar();
  }
  function onDbl(e) { if (!draw) return; try { e.preventDefault(); } catch (_) { } if (draw.kind !== 'pin' && draw.pts.length >= D.KINDS[draw.kind].min) finishDraw(); }
  function onMove(e) { if (!draw || !draw.pts.length) return; draw.cursor = [e.lngLat.lng, e.lngLat.lat]; paintDraft(); }
  function onKey(e) {
    if (!draw) return;
    const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (e.key === 'Escape') { e.stopPropagation(); stopDraw(); }
    else if (e.key === 'Enter' && !typing) { e.preventDefault(); finishDraw(); }
    else if ((e.key === 'Backspace' || e.key === 'Delete') && !typing) { e.preventDefault(); undoVertex(); }
  }
  function undoVertex() { if (!draw || !draw.pts.length) return false; draw.pts.pop(); paintDraft(); renderDrawBar(); return true; }
  function finishDraw() {
    if (!draw) return { ok: false, reason: 'not-drawing' };
    const kind = draw.kind, pts = draw.pts.slice();
    if (pts.length < D.KINDS[kind].min) { say(L('Add at least ' + D.KINDS[kind].min + ' points first.', '先に ' + D.KINDS[kind].min + ' 点以上置いてください。')); return { ok: false, reason: 'too-few-vertices' }; }
    stopDraw(false);
    const r = add({ kind, coords: pts });
    if (r.ok) { sel = r.id; paint(); render(); focusFeature(r.id, true); }
    else render();
    return r;
  }

  /* ══ EDITING — each returns what it did; the panel, the map and the address follow ═════════════════ */
  function changed() {
    const d = cur(false); if (d) d.updated = Date.now();
    save(); paint(); if (shown === 'own') { try { MapState.changed('mymap'); } catch (_) { } }
    try { const O = window.IntMapObjects; if (O && O.refresh) O.refresh(); } catch (_) { }
  }
  function add(o) {
    if (shown === 'received') return { ok: false, reason: 'received' };
    const m = D.makeFeature(o || {}); if (!m.ok) return { ok: false, reason: m.why, detail: m.detail };
    if (m.feature.color === D.PALETTE[0] && !(o && o.color)) m.feature.color = D.PALETTE[{ pin: 0, line: 4, area: 3 }[m.feature.kind]];
    const d = cur(true); d.features.push(m.feature); show(); changed(); render();
    return { ok: true, id: m.feature.id, count: d.features.length };
  }
  function edit(id, o) {
    const d = cur(false), f = d && d.features.find((x) => x.id === id); if (!f) return { ok: false, reason: 'no-feature' };
    o = o || {};
    if (o.name != null) f.name = MapState.captionText(o.name, MapState.TITLE_MAX);
    if (o.note != null) f.note = MapState.captionText(o.note, MapState.NOTE_MAX);
    if (o.color != null) f.color = D.colorOf(o.color);
    if (o.coords != null) { const c = D.cleanCoords(f.kind, o.coords); if (!c.ok) return { ok: false, reason: c.why, detail: c.detail }; f.coords = c.coords; }
    changed();
    return { ok: true, id };
  }
  function remove(id) {
    const d = cur(false); const i = d ? d.features.findIndex((x) => x.id === id) : -1; if (i < 0) return { ok: false, reason: 'no-feature' };
    d.features.splice(i, 1); if (sel === id) sel = null; changed(); render();
    return { ok: true, count: d.features.length };
  }
  function setTitle(t) { const d = cur(true); d.title = MapState.captionText(t, MapState.TITLE_MAX); changed(); return { ok: true }; }
  function show() { if (shown === 'own') return true; shown = 'own'; received = null; paint(); try { MapState.changed('mymap'); } catch (_) { } return true; }
  function hide() { stopDraw(false); if (!shown) return true; shown = null; sel = null; paint(); try { MapState.changed('mymap'); } catch (_) { } render(); return true; }
  function newMap(title) { stopDraw(false); const d = D.newDoc(title || ''); lib.maps.unshift(d); lib.current = d.id; save(); shown = 'own'; received = null; sel = null; paint(); try { MapState.changed('mymap'); } catch (_) { } render(); return { ok: true, id: d.id }; }
  function switchMap(id) { if (!lib.maps.some((m) => m.id === id)) return { ok: false, reason: 'no-map' }; stopDraw(false); lib.current = id; save(); shown = 'own'; received = null; sel = null; paint(); try { MapState.changed('mymap'); } catch (_) { } render(); return { ok: true, id }; }
  function deleteMap(id) {
    const i = lib.maps.findIndex((m) => m.id === (id || lib.current)); if (i < 0) return { ok: false, reason: 'no-map' };
    stopDraw(false); lib.maps.splice(i, 1); lib.current = lib.maps[0] ? lib.maps[0].id : null; save(); sel = null;
    if (shown === 'own') { paint(); try { MapState.changed('mymap'); } catch (_) { } }
    render(); return { ok: true, count: lib.maps.length };
  }
  /** keep a received map as one of the reader's own (a copy — the sender's map is theirs) */
  function keepReceived() {
    if (!received) return { ok: false, reason: 'nothing-received' };
    const d = D.newDoc(received.doc.title);
    d.features = received.doc.features.map((f) => Object.assign({}, f, { id: D.newId('f'), coords: f.coords.map((c) => c.slice()) }));
    lib.maps.unshift(d); lib.current = d.id; received = null; shown = 'own'; save(); paint();
    try { MapState.changed('mymap'); } catch (_) { }
    render(); return { ok: true, id: d.id, count: d.features.length };
  }

  /* ══ COLLECT — the reader's session-only objects become features of this map (moved, not copied) ═══
     The pins (js/app-body.js userPins), the shapes kept on the map by the measure and trace tools
     (IntMapAnnotations) and the radius circles. A circle is not a polygon, so it comes in as a 64-sided one
     and its name says so; its area is 0.16 % less than the circle's (64/2π · sin(2π/64)). */
  const CIRCLE_SIDES = 64;
  function collectable() {
    const out = [];
    try { (HOST.userPins || []).forEach((p) => out.push({ src: 'pin', ref: p, f: { kind: 'pin', coords: [[p.lng, p.lat]], name: (p.meta && p.meta.name) || '' } })); } catch (_) { }
    try { const IA = annotations(); ((IA && IA._items) || []).forEach((it) => {
      const g = it.geom; if (!g) return;
      if (g.type === 'LineString') out.push({ src: 'annot', ref: it, f: { kind: 'line', coords: g.coordinates, name: it.name || '', color: it.color } });
      else if (g.type === 'Polygon') out.push({ src: 'annot', ref: it, f: { kind: 'area', coords: g.coordinates[0], name: it.name || '', color: it.color } });
    }); } catch (_) { }
    try { (HOST.radiusItems || []).forEach((c) => {
      const ring = []; for (let i = 0; i < CIRCLE_SIDES; i++) ring.push(G()._dest(c.center[0], c.center[1], i * 360 / CIRCLE_SIDES, c.radiusKm));
      out.push({ src: 'radius', ref: c, f: { kind: 'area', coords: ring, name: L('Radius ', '半径 ') + c.radiusKm + ' km (' + L(CIRCLE_SIDES + '-gon', CIRCLE_SIDES + ' 角形') + ')', color: c.color } });
    }); } catch (_) { }
    return out;
  }
  function collect() {
    if (shown === 'received') return { ok: false, reason: 'received' };
    const items = collectable(); if (!items.length) return { ok: false, reason: 'nothing-to-collect' };
    let moved = 0, refused = 0;
    items.forEach((it) => {
      const m = D.makeFeature(it.f); if (!m.ok) { refused++; return; }
      cur(true).features.push(m.feature); moved++;
      try {
        if (it.src === 'pin') HOST.removePin(it.ref.id);
        else if (it.src === 'annot') annotations().remove(it.ref.id);
        else if (it.src === 'radius') window.removeRadiusItem(it.ref.id);
      } catch (_) { }
    });
    show(); changed(); render();
    return { ok: true, moved, refused };
  }

  /* ══ OUT — a link, a file, a dataset ═════════════════════════════════════════════════════════════ */
  /** the share link: the map as it is now (place, layers, date) with this drawing on it */
  function link() {
    const d = shownDoc(); if (!d || !d.features.length) return { ok: false, reason: 'empty' };
    let url = ''; try { url = location.origin + location.pathname + MapState.hash(); } catch (_) { url = ''; }
    let carried = null; try { carried = MapState.decode(url.slice(url.indexOf('#'))).mymap; } catch (_) { carried = null; }
    if (!carried) return { ok: false, reason: 'no-link' };
    return { ok: true, url, bytes: new TextEncoder().encode(url).length, count: d.features.length };
  }
  /** the dataset record of what is shown — the shape js/gis-datasets.js and js/gis-export.js read */
  function record() {
    const d = shownDoc(); if (!d || !d.features.length) return null;
    const out = D.toFeatureCollection(d, G(), measure);
    return {
      title: d.title || L('My map', 'マイマップ'), features: out.features,
      /* ⚠ WHO DREW IT, AS FAR AS THIS APP KNOWS IT, AND NOTHING MORE: the reader in this browser, or a link
         someone sent. No licence is stated — nobody stated one (.agents/rules/historical-verification.md §2 ③). */
      provenance: { kind: 'sketch', author: shown === 'received' ? 'shared-link' : 'reader', map: d.id, title: d.title || '', drawnWith: 'IntMap my map', at: new Date().toISOString(),
        edges: 'great circles, drawn in pieces of at most ' + D.DENSIFY_DEG + '° and cut at the antimeridian' },
    };
  }
  async function exportFile(format) {
    const fmt = format === 'geopackage' ? 'geopackage' : 'geojson';
    const rec = record(); if (!rec) return { ok: false, reason: 'empty' };
    let X = null; try { const M = await import('./gis-export.js'); X = M.makeGisExport(); } catch (_) { X = null; }
    if (!X) return { ok: false, reason: 'export-unavailable' };
    const feats = rec.features;
    const r = X.write({ id: shownDoc().id, title: rec.title, kind: 'vector', crs: 'EPSG:4326', sourceCrs: 'EPSG:4326', count: feats.length,
      withGeometry: feats.filter((f) => f.geometry).length, features: () => feats, provenance: rec.provenance, createdAt: Date.now() }, { format: fmt });
    if (!r.ok) return { ok: false, reason: r.why, detail: r.detail };
    try {
      const url = URL.createObjectURL(new Blob([r.bytes], { type: r.mediaType }));
      const a = document.createElement('a'); a.href = url; a.download = r.filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) { } }, 4000);
    } catch (_) { return { ok: false, reason: 'download-refused' }; }
    return { ok: true, format: fmt, filename: r.filename, bytes: r.bytes.length, features: feats.length };
  }
  /** register what is shown as a dataset in the GIS layer — a snapshot: the drawing keeps changing, the
      dataset says when it was taken (`provenance.at`) and from which map (`provenance.map`) */
  async function analyze(o) {
    const rec = record(); if (!rec) return { ok: false, reason: 'empty' };
    let ok = false; try { ok = await window.IntMapLazy.need('gisCore'); } catch (_) { ok = false; }
    const DATA = window.IntMapData;
    if (!ok || !DATA) return { ok: false, reason: 'gis-unavailable' };
    let ds = null; try { ds = DATA.add({ title: rec.title, features: JSON.parse(JSON.stringify(rec.features)), sourceCrs: 'EPSG:4326', provenance: rec.provenance }); } catch (e) { return { ok: false, reason: 'registry-refused', detail: { message: String(e && e.message || e) } }; }
    if (!(o && o.open === false)) { try { const GIS = window.IntMapGis; if (GIS && GIS.open) GIS.open(); } catch (_) { } }
    return { ok: true, datasetId: ds.id, features: ds.count, title: ds.title };
  }

  /* ══ THE MAP STATE'S `mymap` FIELD ══════════════════════════════════════════════════════════════════
     read: what is on show, in its link form (nothing when nothing is shown or the map is empty).
     apply: a link's drawing. The reader's OWN map (same identifier) comes back from this browser, which is
     newer than any link of it; any other map is shown read-only as received. */
  function applyLink(v) {
    if (v == null) { if (shown) { stopDraw(false); shown = null; received = null; sel = null; paint(); render(); } return; }
    const r = D.fromLinkValue(v);
    if (!r.ok) { toast(L('The drawing in this link could not be read', 'このリンクの図形は読めませんでした')); return; }
    stopDraw(false); sel = null;
    if (lib.maps.some((m) => m.id === r.doc.id)) { lib.current = r.doc.id; shown = 'own'; received = null; paint(); render(); return; }
    received = { doc: r.doc, dropped: r.dropped }; shown = 'received'; paint();
    open({ folded: false });
  }
  MapState.own('mymap', { read: () => { const d = shownDoc(); return d && d.features.length ? D.toLinkValue(d) : null; }, apply: (v) => applyLink(v) });

  /* ══ A FEATURE PRESSED ON THE MAP ══════════════════════════════════════════════════════════════════ */
  let popup = null;
  function onFeatureClick(e) {
    if (draw) return;
    try { if (GE().events.clickClaimed(e)) return; } catch (_) { }
    const f0 = e && e.features && e.features[0]; const fid = f0 && f0.properties && f0.properties.fid; if (!fid) return;
    const d = shownDoc(), f = d && d.features.find((x) => x.id === fid); if (!f) return;
    try { GE().events.claimClick(e); } catch (_) { }
    sel = fid; paint(); if (panel) { render(); focusFeature(fid, false); }
    try { if (popup) popup.remove(); } catch (_) { }
    style();   /* the card's own rules (.mm-pop*) — a restored drawing is pressed on the map before the panel has ever opened (wave2-prod-fixes) */
    const own = shown === 'own';
    const html = '<div class="mm-pop">' + (f.name ? '<b>' + H(f.name) + '</b>' : '<b class="mm-pop-un">' + H(kindName(f.kind)) + '</b>')
      + (f.note ? '<div class="mm-pop-note">' + H(f.note) + '</div>' : '')
      + '<div class="mm-pop-m">' + H(measureText(f)) + '</div>'
      + (own ? '<button type="button" class="mm-pop-edit">' + icon('pencil', { size: 14 }) + H(L('Edit', '編集')) + '</button>'
        : '<div class="mm-pop-from">' + H(L('From a shared map', '共有された地図より')) + (d.title ? ' · ' + H(d.title) : '') + '</div>') + '</div>';
    try {
      popup = GE().ui.attach(GE().ui.popup({ closeButton: true, closeOnClick: true, className: 'plc-popup', maxWidth: '280px' }).setLngLat(e.lngLat).setHTML(html));
      setTimeout(() => { try { const b = popup.getElement().querySelector('.mm-pop-edit'); if (b) b.onclick = () => { try { popup.remove(); } catch (_) { } open(); focusFeature(fid, true); }; } catch (_) { } }, 0);
    } catch (_) { }
  }
  const kindName = (k) => ({ pin: L('Pin', 'ピン'), line: L('Line', '線'), area: L('Area', '範囲') }[k] || k);

  /* ══ THE PANEL ════════════════════════════════════════════════════════════════════════════════════ */
  const STYLE_TEXT = [
    '#im-mymap{position:fixed;top:14px;right:14px;z-index:var(--z-front);width:min(380px,calc(100vw - 28px));max-height:calc(100dvh - var(--credit-h,23px) - 28px);display:flex;flex-direction:column;box-sizing:border-box;border-radius:22px;background:color-mix(in srgb,var(--card-bg) 94%,transparent);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.2));box-shadow:var(--shadow);backdrop-filter:saturate(180%) blur(22px);-webkit-backdrop-filter:saturate(180%) blur(22px);font-size:14px;line-height:1.4;}',
    '#im-mymap .mm-head{display:flex;align-items:center;gap:6px;padding:14px 10px 8px 18px;}',
    '#im-mymap .mm-head h2{flex:1 1 auto;margin:0;font-size:17px;font-weight:700;letter-spacing:-0.01em;}',
    '#im-mymap .mm-icon{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;padding:0;border:none;border-radius:10px;background:transparent;color:var(--text-muted);cursor:pointer;flex:0 0 auto;}',
    '#im-mymap .mm-icon:hover{background:var(--input-bg);color:var(--text-main);}',
    '#im-mymap .mm-icon.mm-danger:hover{color:#ff3b30;}',
    '#im-mymap .mm-body{flex:1 1 auto;min-height:0;overflow:auto;padding:0 14px 6px;-webkit-overflow-scrolling:touch;}',
    '#im-mymap.mm-folded .mm-body,#im-mymap.mm-folded .mm-foot{display:none;}',
    '#im-mymap input[type=text],#im-mymap textarea,#im-mymap select{width:100%;box-sizing:border-box;border:1px solid rgba(128,128,128,0.22);border-radius:10px;background:var(--input-bg);color:var(--text-main);font:inherit;padding:8px 10px;}',
    '#im-mymap input:focus,#im-mymap textarea:focus,#im-mymap select:focus{outline:2px solid var(--primary-color);outline-offset:-1px;}',
    '#im-mymap textarea{resize:vertical;min-height:40px;margin-top:6px;font-size:13px;}',
    '#im-mymap .mm-title{font-weight:600;font-size:15px;}',
    '#im-mymap .mm-maps{display:flex;gap:6px;align-items:center;margin:8px 0 2px;}',
    '#im-mymap .mm-maps select{flex:1 1 auto;padding:6px 8px;font-size:13px;}',
    '#im-mymap .mm-seg{display:flex;gap:4px;margin:10px 0 6px;padding:3px;border-radius:12px;background:var(--input-bg);}',
    '#im-mymap .mm-seg button{flex:1 1 0;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;border:none;border-radius:9px;background:transparent;color:var(--text-main);font:inherit;font-weight:600;font-size:13px;cursor:pointer;}',
    '#im-mymap .mm-seg button[aria-pressed=true]{background:var(--card-bg);box-shadow:0 1px 4px rgba(0,0,0,0.14);color:var(--primary-color);}',
    '#im-mymap .mm-drawbar{margin:4px 0 10px;padding:10px;border-radius:14px;background:color-mix(in srgb,var(--primary-color) 10%,transparent);font-size:12.5px;}',
    '#im-mymap .mm-drawbar .mm-row{display:flex;gap:6px;margin-top:8px;}',
    '#im-mymap .mm-hint{margin:8px 2px 10px;font-size:12.5px;color:var(--text-muted);}',
    '#im-mymap ol{list-style:none;margin:0;padding:0;}',
    '#im-mymap li{margin:0 0 8px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--input-bg) 60%,transparent);border:1px solid rgba(128,128,128,0.16);}',
    '#im-mymap li.mm-cur{border-color:var(--primary-color);}',
    '#im-mymap .mm-frow{display:flex;align-items:center;gap:6px;}',
    '#im-mymap .mm-dot{flex:0 0 auto;width:24px;height:24px;border-radius:999px;border:2px solid #fff;box-shadow:0 0 0 1px rgba(128,128,128,0.35);cursor:pointer;padding:0;}',
    '#im-mymap .mm-kind{flex:0 0 auto;display:inline-flex;color:var(--text-muted);}',
    '#im-mymap .mm-meas{margin:6px 2px 0;font-size:12px;color:var(--text-muted);}',
    '#im-mymap .mm-meas .unit-sub{opacity:0.8;}',
    '#im-mymap button.mm-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 12px;border-radius:12px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);font:inherit;font-weight:600;font-size:13px;cursor:pointer;}',
    '#im-mymap button.mm-btn.mm-primary{background:var(--primary-fill);border-color:transparent;color:#fff;}',
    '#im-mymap button.mm-btn:disabled{opacity:0.4;cursor:default;}',
    '#im-mymap button:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px;}',
    '#im-mymap .mm-foot{padding:10px 14px 14px;border-top:1px solid rgba(128,128,128,0.16);}',
    '#im-mymap .mm-bar{display:flex;flex-wrap:wrap;gap:6px;}',
    '#im-mymap .mm-bar .mm-btn{flex:1 1 auto;}',
    '#im-mymap .mm-switch{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 2px 10px;font-weight:600;font-size:13px;}',
    '#im-mymap .mm-switch input{width:42px;height:24px;accent-color:#34c759;}',
    '#im-mymap .mm-said{min-height:1.2em;margin-top:8px;font-size:12.5px;color:var(--text-muted);word-break:break-all;}',
    '#im-mymap .mm-said input{margin-top:6px;font-size:12px;}',
    '#im-mymap .mm-recv{margin:2px 0 10px;padding:12px;border-radius:16px;background:color-mix(in srgb,#34c759 12%,transparent);}',
    '#im-mymap .mm-recv b{display:block;font-size:15px;margin-bottom:2px;}',
    '#im-mymap .mm-link{background:none;border:none;color:var(--text-muted);font:inherit;font-size:12.5px;cursor:pointer;padding:6px 2px 0;text-decoration:underline;}',
    '.mm-pop{font-size:13px;line-height:1.45;min-width:160px;}',
    '.mm-pop b{display:block;font-size:14px;margin-bottom:2px;}',
    '.mm-pop .mm-pop-un{color:var(--text-muted);font-weight:600;}',
    '.mm-pop-note{white-space:pre-wrap;margin:2px 0 4px;}',
    '.mm-pop-m{font-size:12px;color:var(--text-muted);}',
    '.mm-pop-from{margin-top:6px;font-size:11.5px;color:var(--text-muted);}',
    /* its colours are the place card's (css/intmap.css, `.plc-popup` — a button on that surface), not written here (wave2-prod-fixes) */
    '.mm-pop-edit{display:inline-flex;align-items:center;gap:5px;margin-top:8px;min-height:32px;padding:0 10px;border-radius:9px;font:inherit;font-weight:600;cursor:pointer;}',
    '@media (max-width:640px){#im-mymap{top:auto;left:8px;right:8px;bottom:calc(var(--credit-h,23px) + 8px);width:auto;max-height:62dvh;border-radius:20px;}}',
  ].join('\n');
  let styled = false;
  function style() { if (styled) return; styled = true; const st = document.createElement('style'); st.id = 'im-mymap-css'; st.textContent = STYLE_TEXT; document.head.appendChild(st); }

  let panel = null, said = { text: '', url: '' };
  const btn = (act, ic, label, cls, extra) => '<button type="button" class="' + (cls || 'mm-btn') + '" data-mm="' + act + '"' + (extra || '') + ' title="' + H(label) + '" aria-label="' + H(label) + '">' + (ic ? icon(ic, { size: cls === 'mm-icon' || cls === 'mm-icon mm-danger' ? 18 : 16 }) : '') + (cls && cls.indexOf('mm-icon') === 0 ? '' : H(label)) + '</button>';
  const kindIcon = { pin: 'pin', line: 'pencil', area: 'polygon' };

  function drawBarHtml() {
    if (!draw) return '';
    const n = draw.pts.length, need = D.KINDS[draw.kind].min;
    const coarse = (() => { try { return matchMedia('(pointer:coarse)').matches; } catch (_) { return false; } })();
    const hint = draw.kind === 'pin' ? L('Tap the map where the pin goes.', '地図上のピンを置く場所を押してください。')
      : draw.kind === 'line' ? (coarse ? L('Tap each point of the line, then press Done.', '線の点を順に押し、「完了」を押してください。') : L('Click each point of the line. Double-click or press Enter to finish.', '線の点を順にクリックします。ダブルクリックか Enter で完了。'))
      : (coarse ? L('Tap each corner of the area, then press Done.', '範囲の角を順に押し、「完了」を押してください。') : L('Click each corner. Click the first point again, double-click or press Enter to finish.', '角を順にクリックします。最初の点をもう一度押すか、ダブルクリックか Enter で完了。'));
    return '<div class="mm-drawbar" role="status"><div>' + H(hint) + '</div>'
      + (draw.kind === 'pin' ? '' : '<div style="margin-top:4px;color:var(--text-muted)">' + H(L(n + ' point' + (n === 1 ? '' : 's') + ' placed', n + ' 点を置きました')) + '</div>')
      + '<div class="mm-row">'
      + (draw.kind === 'pin' ? '' : btn('finish', 'check', L('Done', '完了'), 'mm-btn mm-primary', n >= need ? '' : ' disabled'))
      + (draw.kind === 'pin' ? '' : btn('undo', 'reset', L('Undo point', '1 点戻す'), 'mm-btn', n ? '' : ' disabled'))
      + btn('stop', 'close', L('Stop', 'やめる'), 'mm-btn') + '</div></div>';
  }
  function renderDrawBar() { if (!panel) return; const el = panel.querySelector('.mm-drawslot'); if (el) el.innerHTML = drawBarHtml(); }

  function featureHtml(f) {
    const cls = f.id === sel ? ' class="mm-cur"' : '';
    return '<li data-fid="' + H(f.id) + '"' + cls + '><div class="mm-frow">'
      + '<button type="button" class="mm-dot" data-mm="color" data-fid="' + H(f.id) + '" style="background:' + H(f.color) + '" title="' + H(L('Change colour', '色を変える')) + '" aria-label="' + H(L('Change colour', '色を変える')) + '"></button>'
      + '<span class="mm-kind" title="' + H(kindName(f.kind)) + '">' + icon(kindIcon[f.kind], { size: 16 }) + '</span>'
      + '<input type="text" data-mm-f="name" data-fid="' + H(f.id) + '" value="' + H(f.name) + '" placeholder="' + H(L('Name', '名前')) + '" aria-label="' + H(L('Name of this ' + kindName(f.kind).toLowerCase(), 'この' + kindName(f.kind) + 'の名前')) + '" maxlength="' + Number(MapState.TITLE_MAX) + '">'
      + btn('zoom', 'eye', L('Show on the map', '地図で見る'), 'mm-icon', ' data-fid="' + H(f.id) + '"')
      + btn('del', 'trash', L('Delete', '削除'), 'mm-icon mm-danger', ' data-fid="' + H(f.id) + '"')
      + '</div><textarea rows="1" data-mm-f="note" data-fid="' + H(f.id) + '" placeholder="' + H(L('Note (optional)', 'メモ（任意）')) + '" aria-label="' + H(L('Note', 'メモ')) + '" maxlength="' + Number(MapState.NOTE_MAX) + '">' + H(f.note) + '</textarea>'
      + '<div class="mm-meas">' + H(measureText(f)) + '</div></li>';
  }

  function render() {
    if (!panel) return;
    const folded = panel.classList.contains('mm-folded');
    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    let body = '';
    if (shown === 'received' && received) {
      const rd = received.doc;
      body = '<div class="mm-recv"><b>' + H(rd.title || L('A shared map', '共有された地図')) + '</b>'
        + H(L(rd.features.length + ' item' + (rd.features.length === 1 ? '' : 's') + ' drawn by whoever sent this link. Press one on the map to read its note.',
          'このリンクを送った人が描いた ' + rd.features.length + ' 件。地図上で押すとメモが読めます。'))
        + (received.dropped ? '<div style="margin-top:4px;color:#ff9500">' + H(L(received.dropped + ' item(s) in the link could not be read and are not shown.', 'リンク内の ' + received.dropped + ' 件は読めなかったため表示していません。')) + '</div>' : '')
        + '<div class="mm-bar" style="margin-top:10px">' + btn('keep', 'save', L('Keep a copy as my map', '自分の地図として保存'), 'mm-btn mm-primary') + btn('hide', 'eye-off', L('Hide', '隠す')) + '</div></div>'
        + '<ol>' + rd.features.map((f) => '<li data-fid="' + H(f.id) + '"' + (f.id === sel ? ' class="mm-cur"' : '') + '><div class="mm-frow"><span class="mm-dot" style="background:' + H(f.color) + ';cursor:default"></span><span class="mm-kind">' + icon(kindIcon[f.kind], { size: 16 }) + '</span><b style="flex:1 1 auto">' + H(f.name || kindName(f.kind)) + '</b>'
          + btn('zoom', 'eye', L('Show on the map', '地図で見る'), 'mm-icon', ' data-fid="' + H(f.id) + '"') + '</div>' + (f.note ? '<div style="margin-top:4px;white-space:pre-wrap">' + H(f.note) + '</div>' : '') + '<div class="mm-meas">' + H(measureText(f)) + '</div></li>').join('') + '</ol>';
    } else {
      const d = cur(false), feats = d ? d.features : [];
      const opts = lib.maps.map((m) => '<option value="' + H(m.id) + '"' + (d && m.id === d.id ? ' selected' : '') + '>' + H((m.title || L('Untitled map', '無題の地図')) + ' (' + m.features.length + ')') + '</option>').join('');
      const nCollect = collectable().length;
      body = '<input type="text" class="mm-title" data-mm-f="title" value="' + H(d ? d.title : '') + '" placeholder="' + H(L('Map title', '地図の題')) + '" aria-label="' + H(L('Map title', '地図の題')) + '" maxlength="' + Number(MapState.TITLE_MAX) + '">'
        + (lib.maps.length > 1 ? '<div class="mm-maps"><select data-mm-f="switch" aria-label="' + H(L('Your maps', 'あなたの地図')) + '">' + opts + '</select>' + btn('new', 'map', L('New map', '新しい地図'), 'mm-icon') + btn('delmap', 'trash', L('Delete this map', 'この地図を削除'), 'mm-icon mm-danger') + '</div>'
          : (d && feats.length ? '<div class="mm-maps" style="justify-content:flex-end">' + btn('new', 'map', L('New map', '新しい地図'), 'mm-icon') + btn('delmap', 'trash', L('Delete this map', 'この地図を削除'), 'mm-icon mm-danger') + '</div>' : ''))
        + '<div class="mm-seg" role="group" aria-label="' + H(L('Draw', '描く')) + '">'
        + ['pin', 'line', 'area'].map((k) => '<button type="button" data-mm="draw" data-kind="' + k + '" aria-pressed="' + (draw && draw.kind === k ? 'true' : 'false') + '">' + icon(kindIcon[k], { size: 16 }) + H({ pin: L('Pin', 'ピン'), line: L('Line', '線'), area: L('Area', '範囲') }[k]) + '</button>').join('') + '</div>'
        + '<div class="mm-drawslot">' + drawBarHtml() + '</div>'
        + (feats.length ? '' : '<p class="mm-hint">' + H(L('Draw pins, lines and areas, and write a name and a note on each. Your map is kept in this browser; a link carries it together with the place, layers and date on show.',
          'ピン・線・範囲を描き、それぞれに名前とメモを書けます。地図はこのブラウザに保存され、リンクにすると表示中の場所・レイヤー・日付と一緒に届きます。')) + '</p>')
        + '<ol>' + feats.map(featureHtml).join('') + '</ol>'
        + (nCollect ? btn('collect', 'folder', L('Move ' + nCollect + ' pin(s) and shape(s) on the map into this map', '地図上のピン・図形 ' + nCollect + ' 件をこの地図へ移す'), 'mm-btn', ' style="width:100%;margin:2px 0 8px"') : '')
        + (lib.dropped ? '<p class="mm-hint" style="color:#ff9500">' + H(L(lib.dropped + ' saved item(s) could not be read and were left out.', '保存されていた ' + lib.dropped + ' 件は読めなかったため除きました。')) + '</p>' : '')
        + (saveErr ? '<p class="mm-hint" style="color:#ff3b30">' + H(L('This browser refused to save the map (storage full or private mode). Copy its link or export it to keep it.', 'このブラウザに地図を保存できませんでした（容量不足かプライベートモード）。残すにはリンクをコピーするか書き出してください。')) + '</p>' : '');
    }
    const has = !!(shownDoc() && shownDoc().features.length) || !!(shown !== 'received' && cur(false) && cur(false).features.length);
    panel.innerHTML = '<div class="mm-head"><h2 id="im-mymap-h">' + H(shown === 'received' ? L('Shared map', '共有された地図') : L('My map', 'マイマップ')) + '</h2>'
      + '<button type="button" class="mm-icon" data-mm="fold" aria-expanded="' + (folded ? 'false' : 'true') + '" title="' + H(folded ? L('Show', '開く') : L('Fold', 'たたむ')) + '" aria-label="' + H(folded ? L('Show the panel', 'パネルを開く') : L('Fold the panel', 'パネルをたたむ')) + '"><span style="display:inline-flex;transform:rotate(' + (folded ? '90' : '-90') + 'deg)">' + icon('chevronL', { size: 18 }) + '</span></button>'
      + btn('close', 'close', L('Close', '閉じる'), 'mm-icon') + '</div>'
      + '<div class="mm-body">' + body + '</div>'
      + '<div class="mm-foot">'
      + (shown === 'received' ? '' : '<label class="mm-switch"><span>' + H(L('Show on the map', '地図に表示')) + '</span><input type="checkbox" role="switch" data-mm-f="shown"' + (shown === 'own' ? ' checked' : '') + '></label>')
      + '<div class="mm-bar">'
      + btn('copy', 'link', L('Copy link', 'リンクをコピー'), 'mm-btn', has ? '' : ' disabled')
      + (canShare ? btn('share', 'share', L('Share', '共有'), 'mm-btn', has ? '' : ' disabled') : '')
      + btn('analyze', 'chart', L('Use in analysis', '分析に使う'), 'mm-btn', has ? '' : ' disabled')
      + '</div><div class="mm-bar" style="margin-top:6px">'
      + btn('export-geojson', 'save', L('GeoJSON', 'GeoJSON'), 'mm-btn', has ? '' : ' disabled')
      + btn('export-geopackage', 'save', L('GeoPackage', 'GeoPackage'), 'mm-btn', has ? '' : ' disabled')
      + '</div><div class="mm-said" aria-live="polite">' + saidHtml() + '</div></div>';
  }
  function saidHtml() { return H(said.text) + (said.url ? '<input type="text" readonly value="' + H(said.url) + '" aria-label="' + H(L('Map link', '地図のリンク')) + '">' : ''); }
  function say(text, url) { said = { text: String(text || ''), url: String(url || '') }; const el = panel && panel.querySelector('.mm-said'); if (el) el.innerHTML = saidHtml(); }
  const reasonText = (r) => ({
    'empty': L('There is nothing on this map yet.', 'この地図にはまだ何もありません。'),
    'no-link': L('This map cannot be written as a link.', 'この地図はリンクにできません。'),
    'received': L('A shared map is read-only. Keep a copy to edit it.', '共有された地図は読み取り専用です。編集するには保存してください。'),
    'nothing-to-collect': L('There are no pins or shapes on the map to move.', '移せるピンや図形が地図上にありません。'),
    'gis-unavailable': L('The analysis module did not load.', '分析モジュールを読み込めませんでした。'),
    'export-unavailable': L('The export module did not load.', '書き出しモジュールを読み込めませんでした。'),
    'download-refused': L('This browser refused the download.', 'このブラウザがダウンロードを拒否しました。'),
  }[r && r.reason] || String((r && r.reason) || ''));

  function focusFeature(fid, edit) {
    try {
      const li = panel && panel.querySelector('li[data-fid="' + CSS.escape(fid) + '"]'); if (!li) return;
      li.scrollIntoView({ block: 'nearest' });
      if (edit) { const inp = li.querySelector('input'); if (inp) inp.focus({ preventScroll: true }); }
    } catch (_) { }
  }
  function zoomTo(fid) {
    const d = shownDoc(), f = d && d.features.find((x) => x.id === fid); if (!f) return false;
    sel = fid; paint();
    try {
      const E = GE();
      if (f.kind === 'pin') E.camera.flyTo({ center: f.coords[0], zoom: Math.max(E.camera.getZoom(), 12), duration: 800 });
      else {
        const g = D.geometryOf(f, G()); const pts = []; const eat = (c) => { if (typeof c[0] === 'number') pts.push(c); else c.forEach(eat); }; if (g) eat(g.coordinates); else f.coords.forEach((c) => pts.push(c));
        let a = 180, b = 90, c = -180, e = -90; pts.forEach((p) => { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); e = Math.max(e, p[1]); });
        E.camera.fitBounds([[a, b], [c, e]], { padding: 70, maxZoom: 15, duration: 800 });
      }
    } catch (_) { }
    return true;
  }

  async function copyLink() {
    const r = link(); if (!r.ok) { say(reasonText(r)); return r; }
    let copied = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(r.url); copied = true; } } catch (_) { copied = false; }
    const kb = (r.bytes / 1024).toFixed(1) + ' KB';
    if (copied) say(L('Link copied (' + kb + '). It opens this drawing over the map as it is now.', 'リンクをコピーしました（' + kb + '）。いまの地図の上にこの図形を開きます。'));
    else { say(L('Copy this link:', 'このリンクをコピーしてください:'), r.url); const inp = panel && panel.querySelector('.mm-said input'); if (inp) { inp.focus(); inp.select(); } }
    return Object.assign({}, r, { copied });
  }
  async function nativeShare() {
    const r = link(); if (!r.ok) { say(reasonText(r)); return; }
    try { await navigator.share({ title: (shownDoc().title || L('My map', 'マイマップ')), url: r.url }); }
    catch (e) { if (!(e && e.name === 'AbortError')) await copyLink(); }
  }

  async function onClick(e) {
    const b = e.target && e.target.closest ? e.target.closest('[data-mm]') : null; if (!b || b.disabled) return;
    const a = b.getAttribute('data-mm'), fid = b.getAttribute('data-fid');
    if (a === 'close') { close(); return; }
    if (a === 'fold') { panel.classList.toggle('mm-folded'); render(); return; }
    if (a === 'draw') { const k = b.getAttribute('data-kind'); if (draw && draw.kind === k) stopDraw(); else { const r = startDraw(k); if (!r.ok) say(reasonText(r)); } return; }
    if (a === 'finish') { finishDraw(); return; }
    if (a === 'undo') { undoVertex(); return; }
    if (a === 'stop') { stopDraw(); return; }
    if (a === 'zoom') { zoomTo(fid); render(); return; }
    if (a === 'color') { const d = cur(false), f = d && d.features.find((x) => x.id === fid); if (f) { edit(fid, { color: D.PALETTE[(D.PALETTE.indexOf(f.color) + 1) % D.PALETTE.length] }); b.style.background = f.color; } return; }
    if (a === 'del') {
      const d = cur(false), f = d && d.features.find((x) => x.id === fid); if (!f) return;
      if ((f.name || f.note) && !window.confirm(L('Delete «' + (f.name || kindName(f.kind)) + '»?', '「' + (f.name || kindName(f.kind)) + '」を削除しますか？'))) return;
      remove(fid); return;
    }
    if (a === 'new') { newMap(''); try { panel.querySelector('.mm-title').focus(); } catch (_) { } return; }
    if (a === 'delmap') { const d = cur(false); if (d && d.features.length && !window.confirm(L('Delete this map and everything on it? This cannot be undone.', 'この地図と描いたものをすべて削除しますか？ 元に戻せません。'))) return; deleteMap(); return; }
    if (a === 'collect') { const r = collect(); say(r.ok ? L('Moved ' + r.moved + ' into this map.', r.moved + ' 件をこの地図へ移しました。') : reasonText(r)); return; }
    if (a === 'keep') { const r = keepReceived(); say(r.ok ? L('Kept as your map. You can edit it now.', '自分の地図として保存しました。編集できます。') : reasonText(r)); return; }
    if (a === 'hide') { hide(); close(); return; }
    if (a === 'copy') { await copyLink(); return; }
    if (a === 'share') { await nativeShare(); return; }
    if (a === 'analyze') { say(L('Opening analysis…', '分析を開いています…')); const r = await analyze(); say(r.ok ? L('Added to Data and analysis as «' + r.title + '» (' + r.features + ').', '「' + r.title + '」（' + r.features + ' 件）をデータと分析に追加しました。') : reasonText(r)); return; }
    if (a === 'export-geojson' || a === 'export-geopackage') { const r = await exportFile(a.slice(7)); say(r.ok ? L('Saved ' + r.filename, r.filename + ' を保存しました') : reasonText(r)); return; }
  }
  let typeT = 0;
  function onInput(e) {
    const el = e.target, f = el && el.getAttribute && el.getAttribute('data-mm-f'); if (!f) return;
    if (f === 'title') { const d = cur(true); d.title = MapState.captionText(el.value, MapState.TITLE_MAX); }
    else if (f === 'name' || f === 'note') { const d = cur(false), ft = d && d.features.find((x) => x.id === el.getAttribute('data-fid')); if (ft) ft[f] = MapState.captionText(el.value, f === 'name' ? MapState.TITLE_MAX : MapState.NOTE_MAX); }
    else return;
    clearTimeout(typeT); typeT = setTimeout(changed, 250);   /* the address bar and the store follow the words once typing pauses */
  }
  function onChange(e) {
    const el = e.target, f = el && el.getAttribute && el.getAttribute('data-mm-f');
    if (f === 'switch') switchMap(el.value);
    else if (f === 'shown') { if (el.checked) { cur(true); show(); render(); } else hide(); }
  }
  function onPanelKey(e) { if (e.key === 'Escape' && !draw && !(e.target && e.target.closest && e.target.closest('.mm-said'))) { e.stopPropagation(); close(); } }

  /* ══ THE PUBLIC FACE ═════════════════════════════════════════════════════════════════════════════ */
  function open(o) {
    o = o || {};
    style();
    if (!panel) {
      panel = document.createElement('section'); panel.id = 'im-mymap';
      panel.setAttribute('role', 'region'); panel.setAttribute('aria-labelledby', 'im-mymap-h');
      panel.addEventListener('click', onClick); panel.addEventListener('input', onInput); panel.addEventListener('change', onChange); panel.addEventListener('keydown', onPanelKey);
      document.body.appendChild(panel);
    }
    if (shown !== 'received') { cur(false); if (!shown && cur(false)) show(); }
    panel.classList.toggle('mm-folded', !!o.folded);
    render();
    return true;
  }
  function close() { stopDraw(false); if (panel) { panel.remove(); panel = null; } said = { text: '', url: '' }; return true; }
  try { bus.on('intmap-lang', () => { if (panel) render(); paint(); }); } catch (_) { }

  /** everything Atlas and the observer may know (no vertices — the counts and the words) */
  function state() {
    const d = shownDoc(), own = cur(false);
    const list = (doc) => doc ? doc.features.map((f) => { const m = measure(f); const o = { id: f.id, kind: f.kind, name: f.name, note: f.note, color: f.color, vertices: f.coords.length };
      if (m.lengthKm != null) o.lengthKm = +m.lengthKm.toFixed(3); if (m.areaKm2 != null) o.areaKm2 = +m.areaKm2.toFixed(4); if (f.kind === 'pin') o.at = f.coords[0].slice(); return o; }) : [];
    return {
      loaded: true, open: !!panel, shown, drawing: draw ? { kind: draw.kind, points: draw.pts.length } : null,
      map: own ? { id: own.id, title: own.title, count: own.features.length } : null,
      showing: d ? { id: d.id, title: d.title, count: d.features.length } : null,
      features: list(shown === 'received' ? (received && received.doc) : own),
      received: received ? { title: received.doc.title, count: received.doc.features.length, dropped: received.dropped } : null,
      maps: lib.maps.map((m) => ({ id: m.id, title: m.title, count: m.features.length, current: m.id === lib.current })),
      collectable: collectable().length,
    };
  }
  /** the universal object list's view of this map (js/map-tools.js IntMapObjects) */
  function objects() {
    if (shown !== 'own') return [];
    const d = cur(false); if (!d) return [];
    return d.features.map((f) => ({ id: 'mm_' + f.id, kind: 'mymap', dot: f.color, color: f.color, name: f.name || kindName(f.kind),
      focus: () => zoomTo(f.id), rename: (v) => { edit(f.id, { name: v }); render(); }, setColor: (c) => { edit(f.id, { color: c }); render(); }, remove: () => remove(f.id) }));
  }

  return {
    open, close, isOpen: () => !!panel, state, objects,
    add, edit, remove, setTitle, show, hide, newMap, switchMap, deleteMap, keepReceived, collect,
    startDraw, finishDraw, stopDraw: () => { stopDraw(); return { ok: true }; }, undoVertex,
    link, exportFile, analyze, zoomTo,
  };
}
