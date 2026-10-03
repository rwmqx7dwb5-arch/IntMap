/* ============================================================================
 *  IntMap · WHAT RUNS WHILE THE MAP MOVES — the in-page half of scripts/map-motion.mjs
 * ----------------------------------------------------------------------------
 *  Injected with `addInitScript` BEFORE the app's first byte, so every listener the app and the
 *  renderer register is registered through these wrappers. It answers four questions about a
 *  gesture, each from the browser itself rather than from a guess:
 *
 *   1. FRAMES — the interval between consecutive animation frames while the camera moves, and
 *      the camera (zoom, centre) each frame drew, so a trajectory's smoothness can be measured
 *      as well as its rate.
 *   2. WHO RAN — the time spent in every renderer-event listener (`map.on('move' …)`), every
 *      input listener on the DOM (wheel / pointer / touch / mouse) and every animation-frame
 *      callback, each keyed by the stack that REGISTERED it. The stack is mapped back to a
 *      source file afterwards (by the driver, through the build's source map).
 *   3. LONG WORK — `longtask` and `long-animation-frame` entries inside the window.
 *   4. TILES — per frame, whether the renderer said every tile it wants is loaded.
 *
 *  ⚠ The wrappers cost the same before and after a change, so their numbers are for COMPARING
 *  two builds of the app on one machine, not for quoting as a phone's milliseconds.
 *  ⚠ Nothing here changes what the app does: each wrapper calls the original with the original
 *  `this` and arguments and returns its value; removal resolves to the same wrapper.
 * ==========================================================================*/
(function () {
  if (window.__mm) return;
  try { Error.stackTraceLimit = 40; } catch (_) {}
  const now = () => performance.now();
  const MM = window.__mm = { rec: false, cost: new Map(), stacks: new Map(), frames: [], long: [], loaf: [], marks: [] };
  const stackKey = (kind) => {
    const s = String(new Error().stack || '');
    let id = MM.stacks.get(s);
    if (id == null) { id = MM.stacks.size; MM.stacks.set(s, id); }
    return kind + '#' + id;
  };
  const charge = (key, t0) => {
    const dt = now() - t0;
    let c = MM.cost.get(key); if (!c) { c = { ms: 0, n: 0, max: 0 }; MM.cost.set(key, c); }
    c.ms += dt; c.n++; if (dt > c.max) c.max = dt;
  };
  const wrap = (key, fn) => function () {
    if (!MM.rec) return fn.apply(this, arguments);
    const t0 = now();
    try { return fn.apply(this, arguments); } finally { charge(key, t0); }
  };

  /* ── animation-frame callbacks, keyed by the stack that asked for the frame ── */
  const rawRAF = window.requestAnimationFrame.bind(window);
  MM.rawRAF = rawRAF;
  window.requestAnimationFrame = function (cb) {
    if (!MM.rec || typeof cb !== 'function') return rawRAF(cb);
    return rawRAF(wrap(stackKey('raf'), cb));
  };

  /* ── DOM input listeners ── */
  const DOM_TYPES = new Set(['wheel', 'mousewheel', 'mousedown', 'mousemove', 'mouseup', 'pointerdown', 'pointermove', 'pointerup',
    'touchstart', 'touchmove', 'touchend', 'touchcancel', 'dblclick', 'click', 'contextmenu', 'scroll', 'gesturestart', 'gesturechange']);
  const ET = EventTarget.prototype, rawAdd = ET.addEventListener, rawRemove = ET.removeEventListener;
  const domWrapped = new WeakMap();   /* listener → Map(type|capture → wrapper) */
  const capOf = (o) => !!(o === true || (o && typeof o === 'object' && o.capture));
  ET.addEventListener = function (type, l, opts) {
    if (!DOM_TYPES.has(type) || !l) return rawAdd.call(this, type, l, opts);
    const k = type + '|' + capOf(opts);
    let per = domWrapped.get(l); if (!per) { per = new Map(); domWrapped.set(l, per); }
    let w = per.get(k);
    if (!w) {
      const key = stackKey('dom:' + type);
      w = typeof l === 'function' ? wrap(key, l) : wrap(key, function (e) { return l.handleEvent(e); });
      per.set(k, w);
    }
    return rawAdd.call(this, type, w, opts);
  };
  ET.removeEventListener = function (type, l, opts) {
    const per = l && domWrapped.get(l), w = per && per.get(type + '|' + capOf(opts));
    return rawRemove.call(this, type, w || l, opts);
  };

  /* ── renderer events: patch the Map class the moment the vendor bundle publishes it ── */
  const patchMap = (ns) => {
    try {
      const P = ns && ns.Map && ns.Map.prototype; if (!P || P.__mmPatched) return;
      P.__mmPatched = true;
      const on = P.on, off = P.off, once = P.once;
      const mapWrapped = new WeakMap();
      const sub = (args, kind) => {
        const i = args.findIndex((a) => typeof a === 'function'); if (i < 0) return args;
        const fn = args[i], type = String(args[0]);
        let per = mapWrapped.get(fn); if (!per) { per = new Map(); mapWrapped.set(fn, per); }
        let w = per.get(type);
        if (!w) { w = wrap(stackKey(kind + ':' + type), fn); per.set(type, w); }
        const out = args.slice(); out[i] = w; return out;
      };
      P.on = function (...a) { return on.apply(this, sub(a, 'map')); };
      P.once = function (...a) { return once.apply(this, sub(a, 'map')); };
      P.off = function (...a) {
        const i = a.findIndex((x) => typeof x === 'function');
        if (i >= 0) { const per = mapWrapped.get(a[i]), w = per && per.get(String(a[0])); if (w) { a = a.slice(); a[i] = w; } }
        return off.apply(this, a);
      };
    } catch (_) {}
  };
  let ns;
  try {
    Object.defineProperty(window, 'maplibregl', { configurable: true, enumerable: true,
      get() { return ns; }, set(v) { ns = v; patchMap(v); } });
  } catch (_) {}

  /* ── long work ── */
  try { new PerformanceObserver((l) => { if (MM.rec) for (const e of l.getEntries()) MM.long.push({ t: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: false }); } catch (_) {}
  try {
    new PerformanceObserver((l) => {
      if (!MM.rec) return;
      for (const e of l.getEntries()) {
        MM.loaf.push({ t: e.startTime, d: e.duration, block: e.blockingDuration || 0,
          scripts: (e.scripts || []).map((s) => ({ src: s.sourceURL, fn: s.sourceFunctionName, inv: s.invoker, d: s.duration, pos: s.sourceCharPosition })) });
      }
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch (_) {}

  /* ── the frame sampler: one raw rAF loop, never attributed to anybody ── */
  const sample = (t) => {
    if (!MM.rec) return;
    const m = window.__imap;
    let z = NaN, lng = NaN, lat = NaN, loaded = null, moving = null;
    try { z = m.getZoom(); const c = m.getCenter(); lng = c.lng; lat = c.lat; loaded = m.areTilesLoaded(); moving = m.isMoving(); } catch (_) {}
    MM.frames.push({ t, z, lng, lat, loaded, moving });
    rawRAF(sample);
  };
  /* ── inside the renderer's frame: symbol placement vs. everything else, and the labels it flips ──
     A label BLINKS when it is hidden and shown again (or shown and hidden again) within BLINK_MS — the
     eye reads that as flicker whatever the frame rate is. Counted from the renderer's own placement
     result (`placement.opacities[crossTileID].text.placed`), committed placement by committed placement. */
  const BLINK_MS = 600;
  MM.hookRenderer = () => {
    const m = window.__imap, st = m && m.style; if (!st || st.__mmHooked) return;
    st.__mmHooked = true;
    const up = st._updatePlacement;
    let prev = null; const lastFlip = new Map();
    st._updatePlacement = function () {
      if (!MM.rec) { prev = st.placement; return up.apply(this, arguments); }
      const t0 = now();
      try { return up.apply(this, arguments); } finally {
        charge('renderer:placement', t0);
        const p = st.placement;
        if (p && p !== prev && p.opacities) {
          const t = now(), was = prev && prev.opacities ? prev.opacities : {};
          const ids = new Set(Object.keys(was).concat(Object.keys(p.opacities)));
          for (const id of ids) {
            const a = !!(was[id] && was[id].text && was[id].text.placed), b = !!(p.opacities[id] && p.opacities[id].text && p.opacities[id].text.placed);
            if (a === b) continue;
            MM.flips++;
            const lf = lastFlip.get(id);
            if (lf && lf.to !== b && t - lf.t < BLINK_MS) MM.blinks++;
            lastFlip.set(id, { t, to: b });
          }
          MM.placements++;
        }
        prev = p;
      }
    };
    const pr = m.painter && m.painter.render;
    if (pr) m.painter.render = function () {
      if (!MM.rec) return pr.apply(this, arguments);
      const t0 = now(); try { return pr.apply(this, arguments); } finally { charge('renderer:paint', t0); }
    };
  };
  /* ── style / class writes during the gesture, per element. Any observer the app keeps on those
     elements (ResizeObserver, MutationObserver) wakes for each one, and a write that a reader then
     measures is a forced layout on the gesture's frames. ── */
  const desc = (el) => !el || !el.tagName ? '?' : el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList && el.classList.length ? '.' + Array.from(el.classList).slice(0, 2).join('.') : '');
  let mo = null;
  const watchMutations = () => {
    if (mo || !window.MutationObserver) return;
    mo = new MutationObserver((list) => { if (!MM.rec) return;
      for (const r of list) { const k = desc(r.target) + ' @' + r.attributeName; MM.mut.set(k, (MM.mut.get(k) || 0) + 1); } });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'], subtree: true });
  };
  /* …and WHO wrote a class on <html>/<body>: the two elements every page-wide observer watches */
  try {
    const TL = DOMTokenList.prototype;
    for (const name of ['add', 'remove', 'toggle', 'replace']) {
      const raw = TL[name];
      TL[name] = function () {
        if (MM.rec && MM.bodyTokens) {
          const el = this === (document.body && document.body.classList) ? 'body' : this === document.documentElement.classList ? 'html' : null;
          if (el) { const had = this.value; const out = raw.apply(this, arguments);
            if (this.value !== had) { const k = stackKey('class:' + el); MM.cost.set(k, Object.assign(MM.cost.get(k) || { ms: 0, n: 0, max: 0 }, {})); MM.cost.get(k).n++; }
            return out; }
        }
        return raw.apply(this, arguments);
      };
    }
  } catch (_) {}
  MM.start = () => {
    MM.bodyTokens = true;
    try { MM.hookRenderer(); } catch (_) {}
    MM.mut = new Map(); try { watchMutations(); } catch (_) {}
    MM.flips = 0; MM.blinks = 0; MM.placements = 0;
    MM.cost = new Map(); MM.frames = []; MM.long = []; MM.loaf = []; MM.marks = [];
    MM.rec = true; MM.t0 = now(); rawRAF(sample);
  };
  MM.mark = (name) => { MM.marks.push({ name, t: now() }); };
  MM.stop = () => {
    MM.rec = false; MM.t1 = now();
    const ids = new Map(); for (const [s, id] of MM.stacks) ids.set(id, s);
    const cost = []; for (const [k, c] of MM.cost) { if (!k.includes('#')) { cost.push({ key: k, kind: k, stack: '', ...c }); continue; } const id = +k.split('#')[1]; cost.push({ key: k, kind: k.split('#')[0], stack: ids.get(id), ...c }); }
    return { t0: MM.t0, t1: MM.t1, mutations: [...MM.mut].sort((a, b) => b[1] - a[1]).slice(0, 12), flips: MM.flips, blinks: MM.blinks, placements: MM.placements, frames: MM.frames, long: MM.long, loaf: MM.loaf, marks: MM.marks, cost };
  };
})();
