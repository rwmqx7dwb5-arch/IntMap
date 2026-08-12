/* ============================================================================
 *  IntMap · THE ON-DEVICE INSTRUMENT — `?perf=1`   (#R225)
 * ----------------------------------------------------------------------------
 *  「スマホでの地図スクロール、ズームが壊滅的に遅いです」
 *
 *  ══ WHY AN INSTRUMENT AND NOT A FIX ═════════════════════════════════════════════════════════════
 *  Four rounds have gone after this and three of them measured the wrong machine. #R202 measured a
 *  browser with no GPU; #R203 measured a resolution setting while #R221's runaway resize loop was
 *  what actually moved; #R222 could not reproduce it at all («`map._render` 4.8 ms, the main thread
 *  65–83 % idle») and said so honestly, and #R224 measured the BOOT and left the gesture alone.
 *  The reader's answers this round removed most of the search space in one go — it is **not** a
 *  #R224 regression, it happens on **both basemaps** and on the **flat** projection as well as the
 *  globe — so it is not tiles, not the satellite stitch and not the sphere. What is left is the
 *  gesture path itself, and the one thing every previous round lacked is a number FROM THE PHONE.
 *
 *  So this is that number. It is opt-in (`?perf=1`), it costs one regexp test on every other load,
 *  and it reports the four quantities that have actually decided this question before:
 *
 *    · `map._render` median / p90 — #R221's lesson: the FRAME INTERVAL LIES in a throttled tab
 *      (an empty rAF loop measured 34 ms there), so what is timed is the renderer's own call.
 *    · long tasks — where the main thread went, including work no profile of ours would attribute.
 *    · the backdrop-filter census — #R221's finding, and it has GROWN: measured on the shipped
 *      build at 375 × 812, nineteen elements covering **383 %** of the viewport when still (it was
 *      fifteen at 153 %). They are all marked and they all drop out during a move, so what this
 *      shows is the cost of the frame the gesture LANDS on.
 *    · the drawing-buffer ratio, live — because `setPixelRatio` reallocates the buffer and every
 *      framebuffer hanging off it, twice per gesture, and #R203 already suspected that reallocation
 *      costs more than the fragments it saves without being able to prove it.
 *
 *  ══ AND THREE SWITCHES, BECAUSE A/B ON THE DEVICE IS THE ONLY HONEST TEST ═══════════════════════
 *  Tapping a row toggles the suspect it names, live, without a reload — render scale, the frosted
 *  glass, and every app-owned layer. #R206's rule: alternate, never A-then-B-then-conclude. The HUD
 *  keeps a per-setting median so the two readings sit next to each other on screen.
 *
 *  ⚠ IT MEASURES, IT DOES NOT DECIDE. Nothing here changes what ships; the toggles live for the life
 *  of the tab and are gone on reload.
 * ==========================================================================*/
/* ⚠ NOT A FACTORY. It takes nothing from the shell and it must not cost a line of js/app-body.js's
   budget (#R200 ⑤) to exist, so it starts itself at import — behind the flag, which is one regexp
   test on every load that does not ask for it. */
window.IntMapPerfHud = (function () {
  'use strict';
  if (!/[?&]perf=1\b/.test(location.search)) return null;

  const GE = () => window.IntMapGeoEngine;
  const N = (v, d) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d == null ? 1 : d) : '—');
  const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : NaN);
  const pct = (a, p) => (a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN);

  /* ── the renderer's own frame cost ──────────────────────────────────────────────────────────
     ⚠ ASKED FOR THROUGH THE CONTRACT, NOT TAKEN. js/geo-engine.js is the only file allowed to hold
     the renderer (#R178/#R180's ratchet, and scripts/engine-coupling.mjs counts), so the timing hook
     is a contract member — `render.instrumentFrames` — and this file never sees a map object. */
  let rend = [], frames = [], lastFrame = 0, longMs = 0, wrapped = false;
  function wrapRender() {
    if (wrapped) return true;
    try {
      wrapped = GE().render.instrumentFrames((dt) => { rend.push(dt); if (rend.length > 240) rend.shift(); });
    } catch (_) { wrapped = false; }
    return wrapped;
  }
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) longMs += e.duration; })
      .observe({ entryTypes: ['longtask'] });
  } catch (_) { }

  /* ── the backdrop-filter census (#R221's measurement, made live) ───────────────────────────── */
  let census = { n: 0, cov: 0, at: 0 };
  function takeCensus() {
    const now = performance.now();
    if (now - census.at < 2000) return census;          /* a document walk is not a per-frame job */
    let n = 0, area = 0;
    try {
      const all = document.querySelectorAll('*');
      for (let i = 0; i < all.length; i++) {
        const e = all[i], c = getComputedStyle(e);
        const v = c.backdropFilter || c.webkitBackdropFilter;
        if (!v || v === 'none') continue;
        const r = e.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        n++; area += r.width * r.height;
      }
    } catch (_) { }
    const vp = Math.max(1, innerWidth * innerHeight);
    census = { n, cov: Math.round(area / vp * 100), at: now };
    return census;
  }

  /* ── the three switches ────────────────────────────────────────────────────────────────────── */
  const sw = { rs: true, glass: true, layers: true };
  const runs = {};                                       /* "rs:off" → median map._render */
  function key() { return (sw.rs ? 'R' : 'r') + (sw.glass ? 'G' : 'g') + (sw.layers ? 'L' : 'l'); }

  function setRenderScaleOn(on) {
    sw.rs = on;
    try {
      const S = window.IntMapRenderScale;
      if (!S) return;
      /* there is no "stop" on the module, so the effect is neutralised where it lands: pin the
         buffer at the base ratio and let its own handlers write the same number they read. */
      if (!on) { const st = S.state && S.state(); const b = st && st.base; if (b > 0) GE().render.setRenderScale(b); }
    } catch (_) { }
  }
  let glassStyle = null;
  function setGlassOn(on) {
    sw.glass = on;
    try {
      if (!on) {
        if (!glassStyle) {
          glassStyle = document.createElement('style');
          glassStyle.textContent = '.im-glass,[class*="glass"],.m-sheet,.m-fab,.data-legend,.coord-readout,.map-search'
            + '{backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}';
          document.head.appendChild(glassStyle);
        }
      } else if (glassStyle) { glassStyle.remove(); glassStyle = null; }
    } catch (_) { }
  }
  let hidden = [];
  function setLayersOn(on) {
    sw.layers = on;
    try {
      const L = GE().layers;
      if (!on) {
        hidden = [];
        const st = GE().render.sceneStats();
        for (const id of (st && st.ids) || []) {
          if (!/^(lyr-|im-|wp-|dl-)/.test(id)) continue;      /* the app's own layers, not the basemap's */
          hidden.push(id); L.setVisible(id, false);
        }
      } else {
        for (const id of hidden) { try { L.setVisible(id, true); } catch (_) { } }
        hidden = [];
      }
    } catch (_) { }
  }

  /* ── the panel ─────────────────────────────────────────────────────────────────────────────── */
  const box = document.createElement('div');
  box.id = 'im-perf-hud';
  box.style.cssText = 'position:fixed;left:6px;top:6px;z-index:2147483647;font:11px/1.45 ui-monospace,Menlo,monospace;'
    + 'background:rgba(8,10,14,0.86);color:#d8e6ff;padding:7px 9px;border-radius:9px;max-width:min(94vw,340px);'
    + 'white-space:pre-wrap;border:1px solid rgba(120,160,255,0.35);box-shadow:0 4px 18px rgba(0,0,0,0.5);';
  const rows = document.createElement('div');
  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;gap:5px;margin-top:6px;flex-wrap:wrap;';
  const mk = (label, get, set) => {
    const b = document.createElement('button');
    b.style.cssText = 'flex:1 0 auto;min-height:30px;padding:4px 8px;border-radius:7px;border:1px solid rgba(120,160,255,0.4);'
      + 'background:rgba(30,40,60,0.9);color:#d8e6ff;font:11px ui-monospace,monospace;';
    const sync = () => { b.textContent = label + ': ' + (get() ? 'ON' : 'off'); b.style.opacity = get() ? '1' : '0.55'; };
    b.onclick = () => { set(!get()); rend = []; sync(); };
    sync(); btns.appendChild(b); return sync;
  };
  const syncs = [
    mk('render-scale', () => sw.rs, setRenderScaleOn),
    mk('glass', () => sw.glass, setGlassOn),
    mk('app layers', () => sw.layers, setLayersOn),
  ];
  const copy = document.createElement('button');
  copy.textContent = 'copy';
  copy.style.cssText = 'flex:0 0 auto;min-height:30px;padding:4px 10px;border-radius:7px;border:1px solid rgba(120,160,255,0.4);'
    + 'background:rgba(30,40,60,0.9);color:#9fe6b0;font:11px ui-monospace,monospace;';
  copy.onclick = () => { try { navigator.clipboard.writeText(rows.textContent + '\n' + JSON.stringify(runs)); copy.textContent = 'copied'; setTimeout(() => { copy.textContent = 'copy'; }, 1200); } catch (_) { } };
  btns.appendChild(copy);
  box.appendChild(rows); box.appendChild(btns);
  (document.body || document.documentElement).appendChild(box);

  function tick() {
    const now = performance.now();
    if (lastFrame) { frames.push(now - lastFrame); if (frames.length > 240) frames.shift(); }
    lastFrame = now;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  let tiles = 0, srcs = 0, vis = 0, ratio = null;
  setInterval(() => {
    wrapRender();
    try {
      const st = GE().render.sceneStats();
      if (st) { vis = st.visible; srcs = st.sources; tiles = st.tiles; }
      ratio = GE().render.getRenderScale();
    } catch (_) { }
    const c = takeCensus();
    const rm = med(rend), rp = pct(rend, 0.9);
    if (rend.length > 30 && isFinite(rm)) runs[key()] = +rm.toFixed(2);
    const long = longMs; longMs = 0;
    rows.textContent =
      'IntMap perf  ' + (window.INTMAP_BUILD || '') + '  [' + key() + ']\n'
      + 'map._render  med ' + N(rm, 2) + '  p90 ' + N(rp, 2) + ' ms  (n=' + rend.length + ')\n'
      + 'frame gap    med ' + N(med(frames), 1) + ' ms   longtask ' + N(long, 0) + ' ms/s\n'
      + 'buffer ratio ' + N(ratio, 2) + '   dpr ' + N(devicePixelRatio, 2) + '   ' + innerWidth + 'x' + innerHeight + '\n'
      + 'layers vis ' + vis + '   sources ' + srcs + '   tiles ' + tiles + '\n'
      + 'backdrop-filter ' + c.n + ' el, ' + c.cov + '% of viewport\n'
      + 'device mem ' + (navigator.deviceMemory || '?') + 'GB  cores ' + (navigator.hardwareConcurrency || '?') + '\n'
      + 'A/B medians ' + JSON.stringify(runs);
    syncs.forEach((f) => f());
  }, 1000);

  return { state: () => ({ render: med(rend), frames: med(frames), census, runs, sw }) };
})();
