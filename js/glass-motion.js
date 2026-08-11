/* ============================================================================
 *  IntMap · THE FROSTED GLASS STANDS STILL WHILE THE MAP MOVES  (#R221)
 * ----------------------------------------------------------------------------
 *  「モバイル版がまだ劇的に遅い。もっと爆速に。」「いや読み込み時じゃなくて動作時の話です。マップの
 *    スクロール、ズームがかなりラグい。品質は落とすな。」
 *
 *  ══ WHAT WAS MEASURED, AND WHY EVERY PREVIOUS ROUND LOOKED IN THE WRONG PLACE ═══════════════════
 *  #R202 and #R203 both went after this and both measured the RENDERER: render scale, the tile queue,
 *  the parallel-image cap. #R203 wrote down its conclusion honestly — "this app's own JavaScript is
 *  under 8 % of a profile in which it would have had to be most of it to matter" — and stopped there,
 *  because what was left looked native and unreachable.
 *
 *  Measured again this round, on the built site at 375 × 812, with `map._render` timed directly
 *  rather than the frame interval (the frame interval is useless in a throttled tab — it read 47 ms
 *  while an EMPTY rAF loop in the same tab read 34 ms):
 *
 *      map._render, median, panning at z4 …………………………………… 2.7 – 4.0 ms
 *      the app's own move/render listeners, per frame ………… 0.04 ms  (2.2 % of the frame)
 *      hiding EVERY app layer …………………………………………………………… no change, within noise
 *
 *  The map is not slow. What is expensive is what is drawn OVER it: on a phone in map view this app
 *  composites **fifteen elements carrying `backdrop-filter: blur(14…30px)`, covering 153 % of the
 *  viewport** — the bottom sheet at blur(30px) over the full width, five widget cards at blur(24px),
 *  four FABs, the coordinate readout, two legends, the timeline and the search pill. A backdrop
 *  filter is not a paint: it is a read-back of the framebuffer behind the element, a separable blur
 *  over that region, and a composite — per element, PER FRAME. While the camera moves, the content
 *  behind every one of them changes every frame, so not one of those fifteen can be cached. That is
 *  the lag, it is entirely in the compositor, and it is invisible to a renderer profile.
 *
 *  ══ WHAT THIS DOES — AND WHAT IT DELIBERATELY DOES NOT ══════════════════════════════════════════
 *  While the camera is moving, the glass is not frosted; the instant it stops, it is. The frame a
 *  reader actually LOOKS AT — the still one — is identical to before, down to the pixel, which is
 *  what 「品質は落とすな」 requires. It is the same trade #R202 made for resolution (full DPR when
 *  still, less while moving), applied to the effect that turned out to cost more than the resolution
 *  did, and it is reversible in one line.
 *
 *  ⚠ THE ELEMENTS ARE MARKED, NOT MATCHED WITH `*`. `body.im-moving *{backdrop-filter:none}` would
 *  work and would invalidate the style of all ~3,400 nodes twice per gesture — a recalculation at
 *  exactly the moment the finger goes down. Instead the fifteen are found once (they are the only
 *  ones that compute a backdrop-filter) and carry `.im-glass`; a MutationObserver checks only nodes
 *  as they are ADDED, so a popup opened later is covered without ever re-walking the document.
 *  ⚠ MOBILE ONLY, on #R202's measured ground: desktop never leaves 60 fps here, so the only thing
 *  this could do there is change how a panel looks during a drag for no gain.
 * ========================================================================== */
window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.glassMotion = function (HOST) {
  const GE = () => window.IntMapGeoEngine;
  const isMobile = HOST.isMobile;
  if (!(typeof isMobile === 'function' && isMobile())) return { active: () => false, reason: 'desktop' };

  let moving = false, offT = null, marked = 0;

  /* an element is "glass" when it actually computes a backdrop-filter — the declaration may come
     from css/intmap.css, from a `style.cssText` a module wrote, or from a theme override, and asking
     the computed style is the one question that covers all three. */
  function isGlass(el) {
    if (!el || el.nodeType !== 1 || el.classList.contains('im-glass')) return false;
    let cs; try { cs = getComputedStyle(el); } catch (_) { return false; }
    const bf = cs.backdropFilter || cs.webkitBackdropFilter || 'none';
    return !!bf && bf !== 'none';
  }
  function mark(el) { if (isGlass(el)) { el.classList.add('im-glass'); marked++; } }
  function scan(root) {
    try {
      if (root && root.nodeType === 1) mark(root);
      const all = (root || document.body).querySelectorAll('*');
      for (let i = 0; i < all.length; i++) mark(all[i]);
    } catch (_) {}
  }

  /* ⚠ THE FIRST SCAN WAITS FOR THE APP TO EXIST. Running it at module time would walk a document
     whose panels have not been built, mark nothing, and leave the observer to do all the work — with
     the sheet, the FABs and the legends (the expensive ones) never marked, because they are created
     during boot rather than after it. */
  function firstScan() { scan(document.body); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(firstScan, 0));
  else setTimeout(firstScan, 0);
  /* …and again once, after the map's first idle, for anything the renderer's own load path adds */
  try { GE().events.on('idle', function once() { scan(document.body); try { GE().events.off('idle', once); } catch (_) {} }); } catch (_) {}

  try {
    const mo = new MutationObserver((recs) => {
      for (const r of recs) {
        for (let i = 0; i < r.addedNodes.length; i++) {
          const n = r.addedNodes[i];
          if (n && n.nodeType === 1) scan(n);
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}

  /* ⚠⚠ A `movestart` IS NOT ALWAYS A GESTURE. js/render-scale.js resizes the drawing buffer, and a
     resize makes MapLibre emit `movestart` → `resize` → `moveend` with the camera provably still.
     Measured before this guard: with nobody touching the map, `im-moving` was on 70 % of the time
     and the frosted glass NEVER came back — which would have been a permanent change to how the app
     looks, i.e. exactly the 「品質は落とすな」 this module exists to respect.
     So `movestart` is believed only when the camera has actually changed since the last event. The
     gesture events proper (drag/zoom/rotate/pitch) are believed unconditionally: a resize does not
     emit any of them, and at their `…start` the camera has not moved yet. */
  let lastCam = null;
  function camKey() {
    try {
      const c = GE().camera.get();
      if (!c) return null;
      return [c.center && c.center.lng, c.center && c.center.lat, c.zoom, c.bearing, c.pitch].join(',');
    } catch (_) { return null; }
  }
  function cameraChanged() {
    const k = camKey();
    if (k == null) return true;             /* cannot tell → behave as before */
    if (k === lastCam) return false;
    lastCam = k;
    return true;
  }
  function startIfMoved() { if (cameraChanged()) start(); }
  function start() {
    if (offT) { clearTimeout(offT); offT = null; }
    if (moving) return;
    moving = true;
    try { document.body.classList.add('im-moving'); } catch (_) {}
  }
  function stop() {
    if (offT) clearTimeout(offT);
    /* ⚠ A SHORT TAIL, NOT AN IMMEDIATE RESTORE. `moveend` fires the moment the inertia stops, and a
       pinch is a rapid series of move/moveend pairs — restoring on each one would put the fifteen
       blurs back in the middle of the gesture, which is both the expensive thing and a visible
       flicker. 160 ms is below the eye's threshold for a still frame and above the gap between two
       stages of one gesture. */
    offT = setTimeout(() => {
      offT = null; moving = false;
      try { document.body.classList.remove('im-moving'); } catch (_) {}
    }, 160);
  }

  try {
    const ev = GE().events;
    try { ev.on('movestart', startIfMoved); } catch (_) {}
    ['zoomstart', 'rotatestart', 'pitchstart', 'dragstart'].forEach((e) => { try { ev.on(e, start); } catch (_) {} });
    ['moveend', 'zoomend', 'rotateend', 'pitchend', 'dragend'].forEach((e) => { try { ev.on(e, stop); } catch (_) {} });
  } catch (_) {}

  return {
    active: () => moving,
    marked: () => marked,
    /* for the tests and for Atlas: what this is costing / saving right now */
    state: () => ({ moving, marked, mobile: true }),
  };
};
