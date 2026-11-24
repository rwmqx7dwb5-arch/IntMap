/* ============================================================================
 *  IntMap · DID IT REACH THE SCREEN?  (render.witness)
 * ----------------------------------------------------------------------------
 *  `render.drawn()` (js/geo-engine.js) answers 「is it in the renderer」: the source exists, holds
 *  features, and a layer reading it is not `visibility:none`. That is necessary and not sufficient —
 *  a surface in exactly that state is still invisible when
 *      · every reader's opacity is 0,
 *      · the camera is outside every reader's minzoom/maxzoom,
 *      · its features lie outside the viewport,
 *      · the renderer raised an error for its source or layer (a tile or paint that failed),
 *      · another layer covers it.
 *  and Atlas used to say 「描きました」 in all five. This file asks the renderer — the thing that
 *  painted — about each, and, when asked, LOOKS: it reads the frame as it is, renders one frame with the surface's
 *  layers at opacity 0 (in the same task, so that frame is never presented), puts the opacity back, and compares
 *  the pixels where the features are. Pixels that do not change are a surface that is not on the screen.
 *  ⚠ OPACITY, NOT VISIBILITY. Measured in a real MapLibre (2026-11-24): a layer set `visibility:none` builds no
 *  buckets, so showing it again re-parses its tiles in a worker — the "on" frame after the toggle was still the
 *  "off" picture and the surface read as covered when it was plainly on screen. A paint property is applied in the
 *  same render, so the two frames really are one change apart — but MapLibre FADES a paint change over
 *  `<prop>-transition` (300 ms by default), so a render straight after it still draws the old opacity (measured: the
 *  "off" frame was pixel-identical to the "on" one). The transition is set to 0 first and put back after.
 *
 *  ⚠ A WITNESS MAY ONLY WEAKEN A CLAIM WITH SOMETHING IT OBSERVED (.agents/rules/one-pass-or-a-reason.md §5).
 *  `unconfirmed` is 「could not tell」 (no frame came, a hidden tab, an expression-valued opacity, an
 *  engine without the member) and is never reported as a failure. `not_seen` carries the observed
 *  reason. Only members BOTH adapters implement are read (getStyle, getPaint, sourceData, getBounds,
 *  getZoom, project, queryRenderedFeatures, redraw, setVisible), so MapLibre and Cesium answer the same.
 *
 *  ⚠ NO IMPORTS, NO GLOBALS. Everything arrives in `deps`; geo-engine imports this on demand (it is a
 *  lazy chunk — nothing at start-up pays for it) and tests/render-witness-checks.test.mjs runs it
 *  against fake adapters in Node.
 * ==========================================================================*/

export function makeRenderWitness(deps) {
  deps = deps || {};
  /* the opacity paint properties each layer type is DRAWN with — a layer is transparent only when every
     one of them is 0 (a circle with opacity 0 and a stroke at 1 is still a ring on the screen) */
  const OPACITY = {
    fill: ['fill-opacity'], line: ['line-opacity'], circle: ['circle-opacity', 'circle-stroke-opacity'],
    symbol: ['icon-opacity', 'text-opacity'], raster: ['raster-opacity'], heatmap: ['heatmap-opacity'],
    'fill-extrusion': ['fill-extrusion-opacity'], hillshade: ['hillshade-exaggeration'],
  };
  const SAMPLES = 10;          /* points of a surface's features that are projected and looked at — enough to see a pattern, few enough to be cheap */
  const FAR_DEG = 3;           /* a visible point returns from project→unproject within a pixel or two (≤ 3° even at world zoom on a 1000 px globe, where 1 px ≈ 0.4°); the far side returns tens of degrees away */
  const BOX = 4;               /* half-width in CSS px of the box a point is queried / compared in: a 1 px line is not hit by its exact pixel */
  const PIXEL_DELTA = 6;       /* 0..255 channel difference a point must change by to count as changed. Observed: antialiasing noise of an UNCHANGED re-render is 0 (same task, same state) — the margin is for 8-bit rounding of blended layers */

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  /* 0 → the property resolves to a literal zero; 1 → a literal above zero; null → an expression / unset-with-default
     (cannot tell without evaluating it — and not evaluating it is not a reason to report it invisible) */
  function opacityOf(a, layer) {
    const props = OPACITY[layer.type]; if (!props) return null;
    let anyPositive = false, anyUnknown = false;
    for (const p of props) {
      let v; try { v = a.getPaint(layer.id, p); } catch (_) { v = undefined; }
      if (v === undefined) { v = layer.paint ? layer.paint[p] : undefined; }
      if (v === undefined) { if (p === 'hillshade-exaggeration') { anyUnknown = true; continue; } anyPositive = true; continue; }   /* unset = the spec default, which is 1 for every opacity here */
      const n = num(v);
      if (n === null) { anyUnknown = true; continue; }
      if (n > 0) anyPositive = true;
    }
    if (anyPositive) return 1;
    return anyUnknown ? null : 0;
  }

  function zoomWindow(layer, z) {
    if (z === null) return null;
    const lo = num(layer.minzoom), hi = num(layer.maxzoom);
    if (lo !== null && z < lo) return false;
    if (hi !== null && z >= hi) return false;
    return true;
  }

  /* every [lng,lat] of a GeoJSON feature set, bounded: a surface of a million vertices is looked at by a stride */
  function coords(data) {
    const out = [];
    const walk = (c, depth) => {
      if (!Array.isArray(c)) return;
      if (typeof c[0] === 'number') { if (typeof c[1] === 'number') out.push([c[0], c[1]]); return; }
      for (const x of c) walk(x, depth + 1);
    };
    const feats = data && Array.isArray(data.features) ? data.features : (data && data.type === 'Feature' ? [data] : []);
    for (const f of feats) { const g = f && f.geometry; if (!g) continue; if (g.type === 'GeometryCollection') { (g.geometries || []).forEach(h => walk(h && h.coordinates, 0)); } else walk(g.coordinates, 0); }
    return out;
  }

  function boundsOf(a) {
    try {
      const b = a.getBounds(); if (!b) return null;
      const r = { west: +b.getWest(), east: +b.getEast(), south: +b.getSouth(), north: +b.getNorth() };
      return [r.west, r.east, r.south, r.north].every(isFinite) ? r : null;
    } catch (_) { return null; }
  }
  function inBounds(p, b) {
    if (!b) return null;
    if (p[1] < b.south || p[1] > b.north) return false;
    if (b.west <= b.east) return p[0] >= b.west && p[0] <= b.east;
    return p[0] >= b.west || p[0] <= b.east;   /* the view crosses the antimeridian */
  }

  /* the points of the surface that are inside the viewport, as CSS px — an even stride over the vertices, then keep what projects onto the canvas */
  function screenSamples(a, pts, bounds, W, H) {
    const out = [];
    const step = Math.max(1, Math.floor(pts.length / (SAMPLES * 6)));
    for (let i = 0; i < pts.length && out.length < SAMPLES; i += step) {
      const p = pts[i]; if (inBounds(p, bounds) === false) continue;
      let s = null; try { s = a.project(p); } catch (_) { s = null; }
      if (!s || !isFinite(s.x) || !isFinite(s.y)) continue;
      if (s.x < 0 || s.y < 0 || s.x > W || s.y > H) continue;
      /* on a globe the far side projects onto the disc too; a point that does not come back from the screen as the same place is behind the planet */
      try { const u = a.unproject && a.unproject(s); if (u) { let dl = Math.abs(u.lng - p[0]) % 360; if (dl > 180) dl = 360 - dl; if (dl > FAR_DEG || Math.abs(u.lat - p[1]) > FAR_DEG) continue; } } catch (_) { /* no unproject: keep the point */ }
      out.push({ x: s.x, y: s.y });
    }
    return out;
  }

  /* the frame, read inside the tick it was drawn in — see js/atlas-view-capture.js for why it cannot be read later */
  function readFrame(a) {
    const c = a.getCanvas(); const g = deps.makeCanvas(c.width, c.height); const cx = g.getContext('2d', { willReadFrequently: true });
    cx.drawImage(c, 0, 0); return { cx, scale: c.clientWidth ? c.width / c.clientWidth : 1 };
  }
  function pixelAt(cx, x, y) { try { return cx.getImageData(Math.max(0, Math.round(x)), Math.max(0, Math.round(y)), 1, 1).data; } catch (_) { return null; } }

  /* the same task: the frame as it is, then the readers' opacity at 0 and one render, then the opacity put back and one render. The browser
     composites after the task, so the page is only ever presented with the opacity back. `readers` are layer objects (id, type). */
  function compareFrames(a, readers, samples) {
    if (typeof a.redraw !== 'function' || !deps.makeCanvas || typeof a.setPaint !== 'function') return { ran: false };
    const props = []; readers.forEach(l => (OPACITY[l.type] || []).forEach(p => { if (p !== 'hillshade-exaggeration') props.push([l.id, p]); }));
    if (!props.length) return { ran: false };
    const was = props.map(([id, p]) => { try { return a.getPaint(id, p); } catch (_) { return undefined; } });
    let on = null, off = null;
    try { on = readFrame(a); } catch (_) { return { ran: false }; }
    const wasT = props.map(([id, p]) => { try { return a.getPaint(id, p + '-transition'); } catch (_) { return undefined; } });
    try {
      props.forEach(([id, p]) => { try { a.setPaint(id, p + '-transition', { duration: 0, delay: 0 }); a.setPaint(id, p, 0); } catch (_) { } });
      a.redraw(); off = readFrame(a);
    } finally {
      /* the opacity goes back while the transition is still 0 (instant), THEN the transition is put back — changing the transition setting restarts a fade from the previous value, so the other order fades the layer in from 0 (measured) */
      props.forEach(([id, p], i) => { try { a.setPaint(id, p, was[i]); } catch (_) { } });
      try { a.redraw(); } catch (_) { }
      props.forEach(([id, p], i) => { try { a.setPaint(id, p + '-transition', wasT[i]); } catch (_) { } });
    }
    if (!off || !on) return { ran: false };
    let changed = 0, looked = 0; const k = on.scale;
    for (const s of samples) {
      for (const d of [[0, 0], [-BOX, 0], [BOX, 0], [0, -BOX], [0, BOX]]) {
        const p1 = pixelAt(on.cx, (s.x + d[0]) * k, (s.y + d[1]) * k), p0 = pixelAt(off.cx, (s.x + d[0]) * k, (s.y + d[1]) * k);
        if (!p1 || !p0) continue; looked++;
        if (Math.abs(p1[0] - p0[0]) >= PIXEL_DELTA || Math.abs(p1[1] - p0[1]) >= PIXEL_DELTA || Math.abs(p1[2] - p0[2]) >= PIXEL_DELTA) { changed++; break; }
      }
    }
    return { ran: looked > 0, changed, looked };
  }

  /**
   * look(drawnResult, q) -> Promise<{ observable, surfaces: {id: Seen}, seen: [], notSeen: [], unconfirmed: [] }>
   *   Seen = { state, verdict:'seen'|'not_seen'|'unconfirmed'|'not_drawn', reason, opacity, inZoom, inView, rendered, pixels, errors }
   * `a` is the adapter, `drawn` is `render.drawn(q)`'s answer (the first question stays the renderer's own),
   * `errors(ids)` returns what the renderer reported against those ids, `frame(fn)` runs fn inside a tick.
   */
  async function look(a, drawn, q, errors, frame) {
    q = q || {};
    const out = { observable: !!(drawn && drawn.observable), surfaces: {}, seen: [], notSeen: [], unconfirmed: [] };
    if (!out.observable || !a) return out;
    let style = null; try { style = a.getStyle(); } catch (_) { style = null; }
    const layers = (style && style.layers) || [];
    const bounds = boundsOf(a); let zoom = null; try { zoom = num(+a.getZoom()); } catch (_) { zoom = null; }
    let W = 0, H = 0; try { const c = a.getCanvas(); W = c.clientWidth || c.width; H = c.clientHeight || c.height; } catch (_) { }
    const ids = Object.keys(drawn.surfaces || {});
    const plan = [];
    for (const id of ids) {
      const s = drawn.surfaces[id];
      const rec = { owners: (s.owners || []).slice(), state: s.state, features: s.features, verdict: 'unconfirmed', reason: '', opacity: null, inZoom: null, inView: null, rendered: null, pixels: null, errors: [] };
      out.surfaces[id] = rec;
      if (s.state === 'unknown') { rec.reason = 'could_not_ask'; continue; }
      if (s.state !== 'drawn') { rec.verdict = 'not_drawn'; rec.reason = s.state; continue; }
      const readers = layers.filter(l => l && l.source === id && (() => { try { return a.isVisible(l.id); } catch (_) { return false; } })());
      const er = errors ? errors([id].concat(readers.map(l => l.id))) : [];
      rec.errors = er;
      /* opacity: every visible reader at literal 0 */
      const ops = readers.map(l => opacityOf(a, l)); rec.opacity = ops.length && ops.every(v => v === 0) ? 0 : (ops.some(v => v === 1) ? 1 : null);
      /* zoom: some reader's window contains the camera */
      const zs = readers.map(l => zoomWindow(l, zoom)); rec.inZoom = zs.length && zs.every(v => v === false) ? false : (zs.some(v => v === true) ? true : null);
      /* extent */
      let pts = []; try { pts = coords(a.sourceData(id)); } catch (_) { pts = []; }
      let samples = [];
      if (pts.length && bounds) {
        const visiblePts = pts.some(p => inBounds(p, bounds));
        rec.inView = visiblePts; if (visiblePts) samples = screenSamples(a, pts, bounds, W, H);
        /* a line crossing the viewport with no vertex inside it is in view though no point is: bbox test as the second chance */
        if (!visiblePts) { let w = 1e9, e = -1e9, so = 1e9, n = -1e9; pts.forEach(p => { w = Math.min(w, p[0]); e = Math.max(e, p[0]); so = Math.min(so, p[1]); n = Math.max(n, p[1]); });
          rec.inView = bounds.west <= bounds.east ? (e >= bounds.west && w <= bounds.east && n >= bounds.south && so <= bounds.north) : null; }
      }
      /* the renderer's own count of what it put at those points */
      const live = readers.filter(l => rec.inZoom !== false).map(l => l.id);
      if (samples.length && live.length && typeof a.queryRenderedFeatures === 'function') {
        let n = 0; try { for (const s2 of samples.slice(0, 6)) { const h = a.queryRenderedFeatures([[s2.x - BOX, s2.y - BOX], [s2.x + BOX, s2.y + BOX]], { layers: live }); n += (h && h.length) || 0; } rec.rendered = n; } catch (_) { rec.rendered = null; }
      }
      plan.push({ id, rec, readers: readers.map(l => l.id), readerLayers: readers, samples });
    }
    /* the structural reasons first — each is an observation, and each makes the frame comparison unnecessary */
    const wantPixels = q.pixels !== false;
    const toLook = [];
    for (const p of plan) {
      const r = p.rec;
      if (r.errors.length) { r.verdict = 'not_seen'; r.reason = 'error'; }
      else if (r.opacity === 0) { r.verdict = 'not_seen'; r.reason = 'opacity_0'; }
      else if (r.inZoom === false) { r.verdict = 'not_seen'; r.reason = 'zoom_range'; }
      else if (r.inView === false) { r.verdict = 'not_seen'; r.reason = 'viewport'; }
      else if (wantPixels && p.samples.length && p.readers.length) toLook.push(p);
      else if (r.rendered > 0) { r.verdict = 'seen'; r.reason = 'rendered'; }
      else r.reason = r.inView === null ? 'extent_unknown' : 'no_frame';
    }
    if (toLook.length && frame) {
      await new Promise(res => { try { frame(live => { try {
        if (!live) { res(); return; }
        for (const p of toLook) { const c = compareFrames(a, p.readerLayers, p.samples); p.rec.pixels = c.ran ? { changed: c.changed, looked: c.looked } : null; }
      } catch (_) { /* a frame that could not be compared is unconfirmed, below */ } res(); }); } catch (_) { res(); } });
    }
    for (const p of toLook) {
      const r = p.rec, px = r.pixels;
      if (!px) { if (r.rendered > 0) { r.verdict = 'seen'; r.reason = 'rendered'; } else r.reason = 'no_frame'; continue; }
      if (px.changed > 0) { r.verdict = 'seen'; r.reason = 'pixels_changed'; }
      else { r.verdict = 'not_seen'; r.reason = r.rendered > 0 ? 'covered' : 'no_pixels'; }
    }
    ids.forEach(id => { const v = out.surfaces[id].verdict; if (v === 'seen') out.seen.push(id); else if (v === 'not_seen' || v === 'not_drawn') out.notSeen.push(id); else out.unconfirmed.push(id); });
    return out;
  }

  return { look };
}
