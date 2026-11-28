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
 *  and Atlas used to say 「描きました」 in all five. This file asks the renderer — the thing that
 *  painted — about each, and, when asked, compares the frame with and without the surface.
 *  A frame with changed pixels confirms visibility. Identical frames leave visibility unconfirmed:
 *  the renderer may still be loading a source, or the surface may blend into its background.
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

  function extentOf(data) {
    let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
    const walk = c => {
      if (!Array.isArray(c)) return;
      if (Number.isFinite(c[0]) && Number.isFinite(c[1])) {
        west = Math.min(west, c[0]); east = Math.max(east, c[0]);
        south = Math.min(south, c[1]); north = Math.max(north, c[1]);
      } else for (const part of c) walk(part);
    };
    const visit = g => {
      if (!g) return;
      if (g.type === 'GeometryCollection') (g.geometries || []).forEach(visit);
      else walk(g.coordinates);
    };
    if (data?.type === 'FeatureCollection') (data.features || []).forEach(f => visit(f?.geometry));
    else if (data?.type === 'Feature') visit(data.geometry);
    else visit(data);
    return Number.isFinite(west) ? { west, east, south, north } : null;
  }

  function intersectsView(a, id) {
    // The bounding boxes can prove disjointness. A hit is only possible overlap.
    const g = extentOf(a.sourceData(id)), b = a.getBounds();
    if (!g || !b) return null;
    const west = b.getWest(), east = b.getEast(), south = b.getSouth(), north = b.getNorth();
    if (![west, east, south, north].every(Number.isFinite)) return null;
    if (g.north < south || g.south > north) return false;
    const end = east < west ? east + 360 : east;
    const firstCopy = Math.ceil((west - g.east) / 360);
    return g.west + 360 * firstCopy <= end;
  }

  /* the frame, read inside the tick it was drawn in — see js/atlas-view-capture.js for why it cannot be read later */
  function readFrame(a) {
    const c = a.getCanvas(); const g = deps.makeCanvas(c.width, c.height); const cx = g.getContext('2d', { willReadFrequently: true });
    cx.drawImage(c, 0, 0); return { cx, width: c.width, height: c.height };
  }
  /* the same task: the frame as it is, then the readers' opacity at 0 and one render, then the opacity put back and one render. The browser
     composites after the task, so the page is only ever presented with the opacity back. `readers` are layer objects (id, type). */
  function compareFrames(a, readers) {
    if (typeof a.redraw !== 'function' || !deps.makeCanvas || typeof a.setPaint !== 'function') return { ran: false };
    const props = []; readers.forEach(l => (OPACITY[l.type] || []).forEach(p => { if (p !== 'hillshade-exaggeration') props.push([l.id, p]); }));
    if (!props.length) return { ran: false };
    const was = props.map(([id, p]) => { try { return a.getPaint(id, p); } catch (_) { return undefined; } });
    let on = null, off = null;
    try { on = readFrame(a); } catch (_) { return { ran: false }; }
    const wasT = props.map(([id, p]) => { try { return a.getPaint(id, p + '-transition'); } catch (_) { return undefined; } });
    try {
      props.forEach(([id, p]) => { a.setPaint(id, p + '-transition', { duration: 0, delay: 0 }); a.setPaint(id, p, 0); });
      a.redraw(); off = readFrame(a);
    } catch (_) { return { ran: false }; } finally {
      /* the opacity goes back while the transition is still 0 (instant), THEN the transition is put back — changing the transition setting restarts a fade from the previous value, so the other order fades the layer in from 0 (measured) */
      props.forEach(([id, p], i) => { try { a.setPaint(id, p, was[i]); } catch (_) { } });
      try { a.redraw(); } catch (_) { }
      props.forEach(([id, p], i) => { try { a.setPaint(id, p + '-transition', wasT[i]); } catch (_) { } });
    }
    if (!off || on.width !== off.width || on.height !== off.height || !on.width || !on.height) return { ran: false };
    const before = on.cx.getImageData(0, 0, on.width, on.height).data;
    const after = off.cx.getImageData(0, 0, off.width, off.height).data;
    let changed = 0;
    for (let i = 0; i < before.length; i += 4) {
      if (Math.abs(before[i] - after[i]) >= PIXEL_DELTA || Math.abs(before[i + 1] - after[i + 1]) >= PIXEL_DELTA ||
          Math.abs(before[i + 2] - after[i + 2]) >= PIXEL_DELTA || Math.abs(before[i + 3] - after[i + 3]) >= PIXEL_DELTA) changed++;
    }
    return { ran: true, changed, looked: before.length / 4 };
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
    const ids = Object.keys(drawn.surfaces || {});
    for (const id of ids) {
      const s = drawn.surfaces[id];
      const rec = { owners: (s.owners || []).slice(), state: s.state, rev: s.rev, features: s.features, verdict: 'unconfirmed', reason: 'no_frame', opacity: null, inZoom: null, inView: null, rendered: null, pixels: null, errors: [] };
      if (s.state === 'unknown') rec.reason = 'could_not_ask';
      else if (s.state !== 'drawn') { rec.verdict = 'not_drawn'; rec.reason = s.state; }
      out.surfaces[id] = rec;
    }
    const inspect = live => {
      if (!live) return;
      let layers = [], zoom = null, canvas;
      try { layers = a.getStyle()?.layers || []; zoom = num(a.getZoom()); canvas = a.getCanvas(); } catch (_) {}
      const moving = a.isAnimating?.();
      out.observedAt = new Date().toISOString();
      for (const id of ids) {
        const rec = out.surfaces[id];
        if (rec.state !== 'drawn') continue;
        const readers = layers.filter(l => { try { return l?.source === id && a.isVisible(l.id); } catch (_) { return false; } });
        rec.errors = errors ? errors([id, ...readers.map(l => l.id)]) : [];
        const ops = readers.map(l => opacityOf(a, l));
        rec.opacity = ops.length && ops.every(v => v === 0) ? 0 : (ops.some(v => v === 1) ? 1 : null);
        const liveReaders = readers.filter(l => zoomWindow(l, zoom) !== false);
        rec.inZoom = readers.length && !liveReaders.length ? false : (liveReaders.some(l => zoomWindow(l, zoom) === true) ? true : null);
        const width = canvas?.clientWidth || canvas?.width, height = canvas?.clientHeight || canvas?.height;
        if (width && height && liveReaders.length) {
          try {
            const hits = a.queryRenderedFeatures([[0, 0], [width, height]], { layers: liveReaders.map(l => l.id) });
            if (Array.isArray(hits)) rec.rendered = hits.length;
          } catch (_) {}
        }
        if (rec.rendered > 0) rec.inView = true;
        else if (!moving) {
          try { rec.inView = intersectsView(a, id); } catch (_) {}
        }
        if (rec.opacity === 0) { rec.verdict = 'not_seen'; rec.reason = 'opacity_0'; continue; }
        if (moving) { rec.reason = 'camera_moving'; continue; }
        if (rec.inZoom === false) { rec.verdict = 'not_seen'; rec.reason = 'zoom_range'; continue; }
        if (q.pixels === false && rec.rendered > 0) { rec.verdict = 'seen'; rec.reason = 'rendered'; continue; }
        if (q.pixels !== false && liveReaders.length) {
          try {
            const cmp = compareFrames(a, liveReaders);
            if (cmp.ran) rec.pixels = { changed: cmp.changed, looked: cmp.looked };
          } catch (_) {}
        }
        if (rec.pixels?.changed > 0) { rec.verdict = 'seen'; rec.reason = 'pixels_changed'; }
        else if (rec.inView === false && rec.rendered === 0) { rec.verdict = 'not_seen'; rec.reason = 'viewport'; }
        else if (rec.errors.length) rec.reason = 'renderer_error';
        else rec.reason = rec.pixels ? 'no_pixel_change' : 'no_frame';
      }
    };
    if (ids.some(id => out.surfaces[id].state === 'drawn') && frame) {
      await new Promise(resolve => {
        try { frame(live => { try { inspect(live); } finally { resolve(); } }); }
        catch (_) { resolve(); }
      });
    }
    ids.forEach(id => { const v = out.surfaces[id].verdict; if (v === 'seen') out.seen.push(id); else if (v === 'not_seen' || v === 'not_drawn') out.notSeen.push(id); else out.unconfirmed.push(id); });
    return out;
  }

  return { look };
}
