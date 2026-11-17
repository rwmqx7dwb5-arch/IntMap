/* ============================================================================
 *  IntMap · POPUP ANCHOR — a card that belongs to a PLACE follows that place
 * ----------------------------------------------------------------------------
 *  「まだ場所を動かないポップアップ等がある」
 *
 *  The defect: a detail card opened from a point on the map (a data centre, a plant, a rail line, a
 *  company's headquarters, a country's news brief) projected the point ONCE, wrote `left` / `top`,
 *  and never looked again. Pan or zoom and the card stayed where it was while the place it described
 *  slid away. Seven files each had their own copy of that one-shot placement.
 *
 *  The structure that fixes it is one function. `anchorToLngLat(el, at, opts)` puts the card beside
 *  the place and keeps it there:
 *    · it re-places on every camera change through the ONE shared camera subscription
 *      (`IntMapRuntime.onCamera`, js/runtime.js) — not a new raw `events.on('move')`, because eight
 *      of those were measured as a cost on the drag path (#R234);
 *    · it hides the card (visibility only, never `display`) while the place is behind the globe or
 *      outside the canvas, and shows it again when the place returns;
 *    · it stops following the moment the reader drags the card (`data-dragged`, set by
 *      js/window-manager.js): from then on where it sits is their decision;
 *    · it unsubscribes when the element leaves the document, so a closed card costs nothing.
 *
 *  ⚠ A card the stylesheet DOCKS (the phone's bottom-sheet rule pins `#map-container > .country-popup`
 *  with !important) is not near its place, so hiding it because the place scrolled away would make a
 *  perfectly good docked card vanish. The helper asks the browser, not a viewport width: after
 *  writing `left`, if the computed `left` is not what it wrote, the stylesheet owns the position and
 *  the helper leaves the visibility alone.
 *
 *  Not for: a panel that is deliberately a screen panel (the country card, the right-docked aircraft
 *  / satellite / volcano / quake cards) — those do not describe a point, so they do not take one.
 * ==========================================================================*/
import { IntMapGeoEngine } from './geo-engine.js';

let serial = 0;

/* the page the card is placed in: its offset parent's box, or the whole viewport when that is the document */
function frameOf(el, d) {
  const op = el.offsetParent;
  if (!op || op === document.body || op === document.documentElement) {
    return { left: 0, top: 0, right: d.viewport().w, bottom: d.viewport().h, origin: { left: 0, top: 0 } };
  }
  const r = op.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, origin: { left: r.left, top: r.top } };
}

/* the real world's dependencies, built lazily so a test can hand in its own */
function realDeps() {
  const E = () => IntMapGeoEngine;
  return {
    project: (ll) => E().coords.project(ll),
    onSurface: (pt) => { try { return E().coords.onSurface(pt); } catch (_) { return null; } },
    canvasRect: () => E().render.canvas().getBoundingClientRect(),
    viewport: () => ({ w: window.innerWidth || 1200, h: window.innerHeight || 800 }),
    /* the layer panel overlays the map (#R160): keep the card clear of its strip */
    rightInset: () => {
      try {
        const s = document.getElementById('layer-sidebar-r');
        return (s && document.body.classList.contains('lsr-open')) ? s.getBoundingClientRect().width : 0;
      } catch (_) { return 0; }
    },
    onCamera: (key, fn) => {
      const R = typeof window !== 'undefined' ? window.IntMapRuntime : null;
      if (R && R.onCamera) return R.onCamera(key, fn);
      /* before the runtime exists (or headless): the engine's own events, removed again on release */
      const evs = ['move', 'zoom', 'rotate', 'pitch', 'resize'];
      try { evs.forEach((ev) => E().events.on(ev, fn)); } catch (_) { }
      return () => { try { evs.forEach((ev) => E().events.off(ev, fn)); } catch (_) { } };
    },
    computedLeft: (el) => { try { return parseFloat(getComputedStyle(el).left); } catch (_) { return NaN; } },
  };
}

const asLL = (at) => {
  const v = typeof at === 'function' ? at() : at;
  if (!v) return null;
  const lng = Array.isArray(v) ? +v[0] : +v.lng, lat = Array.isArray(v) ? +v[1] : +v.lat;
  return (isFinite(lng) && isFinite(lat)) ? [lng, lat] : null;
};

/**
 * @param el    the card (already in the document)
 * @param at    [lng,lat] | {lng,lat} | () => either — a function when the place can change
 * @param opts  { dx = 18, dy = -24 (card's top-left relative to the point, px), margin = 12,
 *                dockedTop = 96 (top when the place cannot be projected), deps (tests) }
 * @returns {{ update:()=>void, release:()=>void }}
 */
export function anchorToLngLat(el, at, opts) {
  const o = opts || {};
  const d = Object.assign(realDeps(), o.deps || {});
  const dx = o.dx == null ? 18 : o.dx, dy = o.dy == null ? -24 : o.dy, M = o.margin == null ? 12 : o.margin;
  /* one anchor per element: re-anchoring (a singleton card reopened on another place) replaces the old one */
  if (el.__imAnchor) el.__imAnchor.release();

  const key = 'popup-anchor#' + (++serial);
  let off = null, wrote = null, hidByUs = false, released = false, first = true;

  function setHidden(h) {
    if (h === hidByUs) return;
    hidByUs = h;
    el.style.visibility = h ? 'hidden' : '';
  }

  function update() {
    if (released) return;
    if (!el.isConnected || el.getAttribute('data-dragged') === '1') { release(); return; }
    if (el.style.display === 'none') return;                      /* a hidden singleton: nothing to place */
    let p = null, onSurface = null, cr = null;
    const ll = asLL(at);
    try { if (ll) p = d.project(ll); cr = d.canvasRect(); } catch (_) { p = null; }
    const ok = !!(p && isFinite(p.x) && isFinite(p.y) && cr);
    if (ok) { try { onSurface = d.onSurface([p.x, p.y]); } catch (_) { onSurface = null; } }

    const F = frameOf(el, d), vp = d.viewport();
    const w = el.offsetWidth || 380, h = el.offsetHeight || 300;
    const right = Math.min(F.right, vp.w - d.rightInset());
    const minL = Math.max(F.left, 0) + M, maxL = Math.max(minL, right - w - M);
    const minT = Math.max(F.top, 0) + M, maxT = Math.max(minT, Math.min(F.bottom, vp.h) - h - M);

    let L, T;
    const px = ok ? cr.left + p.x : 0, py = ok ? cr.top + p.y : 0;
    const away = ok && (onSurface === false || p.x < 0 || p.y < 0 || p.x > cr.width || p.y > cr.height);
    /* a place that is NOT on screen when the card opens (a company opened from a list, a news brief for a far
       country) gets the old docked card and no following: a card that opens invisible is worse than one that
       does not follow. Following starts only for a place the reader can currently see. */
    const follow = ok && !(first && away);
    if (follow) {
      L = Math.max(minL, Math.min(px + dx, maxL));
      T = Math.max(minT, Math.min(py + dy, maxT));
    } else {
      /* the place cannot be projected (no renderer yet) or is not in view: docked to the right, as before */
      L = maxL; T = Math.max(minT, Math.min(o.dockedTop == null ? 96 : o.dockedTop, maxT));
    }
    const sl = Math.round(L - F.origin.left), st = Math.round(T - F.origin.top);
    el.style.left = sl + 'px'; el.style.top = st + 'px';
    wrote = sl;
    if (first) { first = false; if (ok && !follow) { release(); return; } }   /* docked, and not following */
    if (away) {
      /* docked by the stylesheet? then this card is not "near" the place and must not vanish with it */
      const cl = d.computedLeft(el);
      setHidden(!(isFinite(cl) && Math.abs(cl - wrote) > 1.5));
    } else setHidden(false);
  }

  function release() {
    if (released) return;
    released = true;
    try { if (off) off(); } catch (_) { }
    off = null;
    if (hidByUs) { try { el.style.visibility = ''; } catch (_) { } hidByUs = false; }
    if (el.__imAnchor === handle) el.__imAnchor = null;
  }

  const handle = { update, release };
  el.__imAnchor = handle;
  update();
  if (!released) { try { off = d.onCamera(key, update); } catch (_) { off = null; } }
  return handle;
}
