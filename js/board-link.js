/* ============================================================================
 *  IntMap · THE BOARD'S LINK TO THE REAL MAP AND THE MASTER CLOCK   (js/board-link.js)
 * ----------------------------------------------------------------------------
 *  js/board.js draws a table, a chart and a plain outline map from ONE store (js/board-state.js). This is
 *  the other half: the store's selection and time window are made the same facts on IntMap's own map
 *  (through IntMapGeoEngine, the renderer contract) and on the master clock (IntMapTime / Chronos).
 *
 *    reader clicks a row / bar / outline  →  store.selection  →  the same rows are highlighted on the real map
 *    reader clicks a shape on the real map →  store.selection  →  the table row, bar and outline light up
 *    reader moves the time widget          →  IntMapTime.setYear  →  every layer on the map follows
 *    anything moves the Chronos clock      →  store.time          →  the rows shown follow
 *
 *  ⚠ THE LINK IS A SUBSCRIBER OF THE STORE, NOT A WIDGET'S PRIVATE CODE. A widget that selects a row never
 *  learns whether a real map is attached; it writes the store and this reads it. A second board, a
 *  compact in-answer view, or a widget added tomorrow is linked the same day.
 *  ⚠ ONE WRITER PER DIRECTION. A write this module caused carries `source:'link'` and is ignored when it
 *  comes back, so a click on the map does not re-fit the camera it just aimed, and the clock set by the
 *  widget does not re-set itself.
 *  ⚠ THE BOARD DRAWS ITS OWN SOURCE (`bd-<boardId>`), NOT THE GIS LAYER LIST. The rows here are one
 *  declared view of a dataset, filtered by the store on every change; the dataset's own layer (js/gis-core.js
 *  draw) is the whole thing and stays a separate, deliberate action. Detaching removes every id this
 *  file added and nothing else.
 *
 *  The engine and the clock are INJECTED (`deps`), so node:test measures this with fakes and the shipped
 *  wiring (js/board.js) hands it the real ones.
 * ==========================================================================*/

const PARTS = [
  { sfx: '-fill', type: 'fill', filter: ['==', '$type', 'Polygon'] },
  { sfx: '-line', type: 'line', filter: ['in', '$type', 'Polygon', 'LineString'] },
  { sfx: '-pt', type: 'circle', filter: ['==', '$type', 'Point'] },
];

/** The bounding box of the given rows' geometries, or null when none has a position. */
export function bboxOf(rows, idx) {
  let x0 = 180, x1 = -180, y0 = 90, y1 = -90, n = 0;
  const walk = (c) => { if (typeof c[0] === 'number') { if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1]; n++; } else c.forEach(walk); };
  idx.forEach((i) => { const g = rows[i] && rows[i].geometry; if (g && g.coordinates) walk(g.coordinates); });
  return n ? { x0, x1, y0, y1 } : null;
}

/** Rows → a FeatureCollection whose features carry their ROW INDEX (`properties.__bdi`), the one thing a
 *  click on the real map needs to name the row. `idx` is which rows to draw. Rows with no geometry are skipped. */
export function toCollection(rows, idx) {
  const features = [];
  for (const i of idx) { const r = rows[i]; if (!r || !r.geometry) continue; features.push({ type: 'Feature', geometry: r.geometry, properties: { ...(r.properties || {}), __bdi: i } }); }
  return { type: 'FeatureCollection', features };
}

/**
 * attach(B, deps) → {detach(), fit(), attached:true} | {attached:false, why}
 *   B     {state, rows, yearOf, vis(), id}   — the open board (js/board.js)
 *   deps  {GE, Time}  GE = IntMapGeoEngine (layers.addSource/add/remove/setSourceData, onLayer/offLayer, fitBounds)
 */
export function attachMap(B, deps) {
  const GE = deps && deps.GE;
  if (!GE || !GE.layers || typeof GE.layers.addSource !== 'function') return { attached: false, why: 'no-engine' };
  const base = 'bd-' + B.id, sel = base + '-sel';
  const ids = [];
  const fillCol = '#0a84ff', hiCol = '#ff9f0a';   /* the renderer takes a colour, not a CSS variable; the highlight is the system orange so it reads on any basemap */
  try {
    GE.layers.addSource(base, { type: 'geojson', data: toCollection(B.rows, B.vis()) });
    GE.layers.addSource(sel, { type: 'geojson', data: toCollection(B.rows, []) });
  } catch (e) { return { attached: false, why: 'map-unavailable' }; }
  let drawn = 0;
  for (const p of PARTS) {
    for (const [src, tag, c, hi] of [[base, '', fillCol, false], [sel, '-sel', hiCol, true]]) {
      const id = src + p.sfx, paint = p.type === 'fill' ? { 'fill-color': c, 'fill-opacity': hi ? 0.45 : 0.22 }
        : p.type === 'line' ? { 'line-color': c, 'line-width': hi ? 3.4 : 2 }
        : { 'circle-radius': hi ? 8 : 5, 'circle-color': c, 'circle-stroke-color': '#fff', 'circle-stroke-width': hi ? 2 : 1.2 };
      try { GE.layers.add({ id, type: p.type, source: src, filter: p.filter, paint }); ids.push(id); drawn++; } catch (_) { /* a renderer that refuses one kind still draws the rest */ }
    }
  }
  if (!drawn) { try { GE.layers.removeSource(base); GE.layers.removeSource(sel); } catch (_) { /* nothing was drawn, nothing to undo */ } return { attached: false, why: 'draw-not-rendered' }; }

  const off = [];
  /* real map → store. The clickable layers are the BASE ones (the highlight overlay sits above and is not asked) */
  const onClick = (ev) => {
    const f = ev && ev.features && ev.features[0], i = f && f.properties ? Number(f.properties.__bdi) : NaN;
    if (Number.isInteger(i)) B.state.toggle(i, 'link');
  };
  if (typeof GE.onLayer === 'function') for (const p of PARTS) { const id = base + p.sfx; if (ids.includes(id)) { try { GE.onLayer('click', id, onClick); off.push(() => { try { GE.offLayer('click', id, onClick); } catch (_) { /* already gone */ } }); } catch (_) { /* one layer unclickable ≠ none */ } } }

  const paint = () => {
    const vis = B.vis(), shown = new Set(vis), picked = B.state.get().selection.filter((i) => shown.has(i));
    try { GE.layers.setSourceData(base, toCollection(B.rows, vis)); GE.layers.setSourceData(sel, toCollection(B.rows, picked)); } catch (_) { /* a renderer mid-swap: the next change repaints */ }
  };
  const fit = () => {
    const picked = B.state.get().selection, bb = bboxOf(B.rows, picked.length ? picked : B.vis());
    if (!bb || typeof GE.fitBounds !== 'function') return false;
    const pad = 0.05; try { GE.fitBounds([[bb.x0 - pad, bb.y0 - pad], [bb.x1 + pad, bb.y1 + pad]], { padding: 60, maxZoom: 9 }); return true; } catch (_) { return false; }
  };
  off.push(B.state.subscribe((e) => {
    paint();
    /* aim the camera only for a selection made OUTSIDE the real map: a click on the map is already where the reader is looking */
    if (e.what === 'selection' && e.source !== 'link' && B.state.get().selection.length) fit();
  }));
  paint();
  return {
    attached: true, ids: ids.slice(), fit, repaint: paint,
    detach() {
      off.splice(0).forEach((f) => { try { f(); } catch (_) { /* unsubscribing twice is harmless */ } });
      for (const id of ids) { try { if (GE.layers.has(id)) GE.layers.remove(id); } catch (_) { /* gone with its source */ } }
      for (const s of [base, sel]) { try { if (GE.layers.hasSource(s)) GE.layers.removeSource(s); } catch (_) { /* already removed */ } }
    },
  };
}

/**
 * followClock(B, deps) → detach()
 *   Chronos → store: every clock move writes store.time (source 'link'); store → Chronos: a time written by
 *   the widget (source ≠ 'link') moves the clock with IntMapTime.setYear. The store is released with
 *   store.setTime(null); the clock is then left where it is.
 */
export function followClock(B, deps) {
  const T = deps && deps.Time;
  if (!T || typeof T.on !== 'function' || typeof T.year !== 'function') return () => {};
  const offClock = T.on(() => {
    const t = B.state.get().time; if (!t) return;
    const y = T.year(); if (y !== t.year) B.state.setTime({ year: y, mode: t.mode }, 'link');
  });
  const offStore = B.state.subscribe((e) => {
    if (e.what !== 'time' || e.source === 'link') return;
    const t = B.state.get().time; if (!t) return;
    if (T.year() !== t.year && typeof T.setYear === 'function') { try { T.setYear(t.year, { source: 'board' }); } catch (_) { /* a year below the clock's floor is refused by the clock; the store keeps what the reader chose */ } }
  });
  return () => { try { offClock && offClock(); } catch (_) { /* gone */ } offStore(); };
}
