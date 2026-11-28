/* ============================================================================
 *  IntMap · POPUP PLACEMENT — which side of the point a place popup opens on
 * ----------------------------------------------------------------------------
 *  A place popup opened with no anchor sits straight above its point, which is where the pin now stands and where
 *  the floating buttons and panels often are. This module answers ONE question: given the point on screen, the size of
 *  the popup and the things already on screen, which of right / left / above / below puts the popup where it covers
 *  the least — and what `anchor` + `offset` express that to MapLibre's Popup.
 *
 *  Two halves, both pure in the sense that matters (no module state, every dependency injectable):
 *    · `choosePlacement` — the arithmetic. Rectangles in, a side out. Cost = (area outside the map) x 4 + (area over an
 *      obstacle), plus a rank tie-break so that when nothing differs the popup opens on the RIGHT (the reading side,
 *      Google Earth's own choice), then left, above, below.
 *    · `collectObstacles` — what is already on screen, DISCOVERED not listed: every visible element that is
 *      position:fixed/absolute and either interactive, holds an interactive control, or carries text — floating
 *      buttons, panels, map controls, the credit row, other open popups. A wrapper that is only a layer (it covers
 *      nearly the whole map, or has pointer-events:none) is looked THROUGH, never counted. Nothing here names an id or
 *      a class, so a control added next year is avoided without anybody remembering to add it to a list.
 *
 *  ⚠ The numbers (gap 14 px, 0.9 wrapper ratio, scan cap 600) are choices, not measurements: the gap is the
 *  breathing room between pin and card, 0.9 is "this element IS the map layer, not a control on it", and the cap
 *  bounds the cost of a scan on a page with thousands of DOM markers. None of them is a source of truth for
 *  anything else; they lapse the moment the pin or the layer structure changes.
 *
 *  The renderer adapters both accept the same anchor and offset.
 * ==========================================================================*/

const SIDES = ['right', 'left', 'above', 'below'];
/* MapLibre's `anchor` is the part of the popup that touches the point */
const ANCHOR = { right: 'left', left: 'right', above: 'bottom', below: 'top' };
const GAP = 14, WRAPPER_RATIO = 0.9, SCAN_CAP = 600, OUTSIDE_WEIGHT = 4;

const area = (r) => Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
function overlap(a, b) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Find the nearest free position to a preferred rectangle. The edges of the visible obstacles
 *  and the frame partition the available positions, so the nearest free position can be found
 *  by checking those edges and the preferred coordinates. If the screen is full, minimize overlap. */
export function fitOverlay(preferred, bounds, obstacles, gap = 0) {
  const w = preferred.right - preferred.left, h = preferred.bottom - preferred.top;
  const left = bounds.left, top = bounds.top;
  const right = Math.max(left, bounds.right - w), bottom = Math.max(top, bounds.bottom - h);
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const x = clamp(preferred.left, left, right), y = clamp(preferred.top, top, bottom);
  const blocked = obstacles.map(r => ({ left:r.left - gap, right:r.right + gap, top:r.top - gap, bottom:r.bottom + gap }))
    .filter(r => overlap(r, bounds) > 0);
  const rect = (a, b) => ({ left:a, top:b, right:a + w, bottom:b + h });
  const cost = r => blocked.reduce((sum, ob) => sum + overlap(r, ob), 0);
  let best = rect(x, y), least = cost(best), distance = 0;
  if (!least) return best;
  const xs = new Set([x, left, right]), ys = new Set([y, top, bottom]);
  for (const ob of blocked) {
    xs.add(clamp(ob.left - w, left, right)); xs.add(clamp(ob.right, left, right));
    ys.add(clamp(ob.top - h, top, bottom)); ys.add(clamp(ob.bottom, top, bottom));
  }
  for (const a of xs) for (const b of ys) {
    const delta = (a - x) ** 2 + (b - y) ** 2;
    if (!least && delta >= distance) continue;
    const candidate = rect(a, b), score = cost(candidate);
    if (score < least || (score === least && delta < distance)) {
      best = candidate; least = score; distance = delta;
    }
  }
  return best;
}

/** The popup's rectangle if it opens on `side` of a pin whose box is `pin` (the pin's tip is at `point`). */
function rectFor(side, point, pin, size, gap) {
  const g = gap == null ? GAP : gap;
  const pl = point.x - pin.w / 2, pr = point.x + pin.w / 2, pt = point.y - pin.h, pb = point.y;
  const midY = point.y - pin.h / 2;
  let left, top;
  if (side === 'right') { left = pr + g; top = midY - size.h / 2; }
  else if (side === 'left') { left = pl - g - size.w; top = midY - size.h / 2; }
  else if (side === 'above') { left = point.x - size.w / 2; top = pt - g - size.h; }
  else { left = point.x - size.w / 2; top = pb + g; }
  return { left, top, right: left + size.w, bottom: top + size.h };
}

/** MapLibre popup options that put the popup on `side`: `anchor` is the popup's touching edge, `offset` the pin's extent. */
export function optionsFor(side, pin, gap) {
  const g = gap == null ? GAP : gap;
  if (side === 'right') return { anchor: 'left', offset: [pin.w / 2 + g, -pin.h / 2] };
  if (side === 'left') return { anchor: 'right', offset: [-(pin.w / 2 + g), -pin.h / 2] };
  if (side === 'above') return { anchor: 'bottom', offset: [0, -(pin.h + g)] };
  return { anchor: 'top', offset: [0, g] };
}

/**
 * @param o { point:{x,y}  the pin's tip (viewport px)
 *            size:{w,h}   the popup
 *            pin:{w,h}    the pin's box, anchored bottom-centre on `point` (default 30 x 38)
 *            bounds:{left,top,right,bottom}  the map (viewport px)
 *            obstacles:[{left,top,right,bottom}]
 *            gap }
 * @returns {{side, anchor, offset:[x,y], rect, cost}} the cheapest side; ties go right, left, above, below
 */
export function choosePlacement(o) {
  const pin = o.pin || { w: 30, h: 38 }, gap = o.gap == null ? GAP : o.gap;
  const obs = Array.isArray(o.obstacles) ? o.obstacles : [];
  let best = null;
  SIDES.forEach(side => {
    const rect = rectFor(side, o.point, pin, o.size, gap);
    const inside = overlap(rect, o.bounds);
    let cost = (area(rect) - inside) * OUTSIDE_WEIGHT;
    for (const ob of obs) cost += overlap(rect, ob);
    if (!best || cost < best.cost) best = { side, rect, cost };
  });
  const opt = optionsFor(best.side, pin, gap);
  if (best.cost) {
    const pinRect = { left:o.point.x - pin.w / 2, right:o.point.x + pin.w / 2, top:o.point.y - pin.h, bottom:o.point.y };
    const fit = fitOverlay(best.rect, o.bounds, [...obs, pinRect]);
    opt.offset[0] += fit.left - best.rect.left;
    opt.offset[1] += fit.top - best.rect.top;
    best.rect = fit;
  }
  return { side: best.side, anchor: opt.anchor, offset: opt.offset, rect: best.rect, cost: best.cost };
}

const INTERACTIVE = 'button,a[href],input,select,textarea,summary,[role="button"],[role="tab"],[role="switch"],[tabindex]';

/**
 * Everything already on screen that a popup should not cover. `root` is the map container; `body` is scanned too
 * because the floating panels are not always inside it. `skip` are elements to ignore (the pin, the popup itself).
 * @param deps { style(el), rect(el) } — tests inject plain stubs
 * @returns {Array<{left,top,right,bottom}>}
 */
export function collectObstacles(root, bounds, skip, deps) {
  const d = Object.assign({
    style: (el) => getComputedStyle(el),
    rect: (el) => el.getBoundingClientRect(),
  }, deps || {});
  const skipSet = new Set(skip || []);
  const out = [], seen = new Set(), queue = [];
  let scanned = 0;
  const bArea = area(bounds);

  function visit(el) {
    if (!el || seen.has(el) || skipSet.has(el)) return;
    scanned++;
    seen.add(el);
    let cs;
    try { cs = d.style(el); } catch (_) { return; }
    if (!cs || cs.display === 'none' || (cs.opacity !== '' && +cs.opacity === 0)) return;
    const r = d.rect(el);
    if (!r || (cs.display !== 'contents' && !(r.right > r.left && r.bottom > r.top))) return;
    const positioned = cs.position === 'fixed' || cs.position === 'absolute';
    const layer = bArea > 0 && overlap(r, bounds) >= WRAPPER_RATIO * bArea;
    const passThrough = cs.pointerEvents === 'none';
    const descend = () => { for (const child of Array.from(el.children || [])) queue.push(child); };
    /* a wrapper that is only a layer, or lets the pointer through, is looked THROUGH; its children decide */
    const surface = el.hasAttribute?.('data-overlay-obstacle');
    const containsSkipped = [...skipSet].some(node => el.contains?.(node));
    if (cs.visibility === 'hidden' || containsSkipped || (!surface && (layer || passThrough || !positioned))) { descend(); return; }
    const hasControl = (el.matches && el.matches(INTERACTIVE)) || (el.querySelector && !!el.querySelector(INTERACTIVE));
    const hasText = !!(el.textContent && el.textContent.trim());
    if ((surface || hasControl || hasText) && overlap(r, bounds) > 0) {
      out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    } else descend();
  }

  [root, root && root.ownerDocument && root.ownerDocument.body].forEach((host) => {
    if (host) for (const child of Array.from(host.children || [])) queue.push(child);
  });
  // Look at sibling surfaces before traversing many nested DOM markers inside one map pane.
  for (let i = 0; i < queue.length && scanned < SCAN_CAP; i++) visit(queue[i]);
  return out;
}

const translations = new WeakMap();

export const overlayTranslation = el => translations.get(el);

/** The last automatic nudge is separate from the owner's position and the renderer's transform. */
export function clearOverlayTranslation(el) {
  const translation = translations.get(el);
  if (!translation) return { x:0, y:0 };
  el.style.translate = translation.before;
  translations.delete(el);
  return translation;
}

export function translateOverlay(el, x, y) {
  const previous = translations.get(el);
  if (!x && !y) { clearOverlayTranslation(el); return; }
  if (previous?.x === x && previous?.y === y) return;
  translations.set(el, { x, y, before:previous?.before ?? el.style.translate });
  el.style.translate = x + 'px ' + y + 'px';
}

export function placeOpenedOverlay(el, host, gap = 4) {
  if (!el?.isConnected || !host) return;
  clearOverlayTranslation(el);
  const style = getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none') return;
  const preferred = el.getBoundingClientRect();
  if (!preferred.width || !preferred.height) return;
  const frame = host.getBoundingClientRect();
  const vp = host.ownerDocument.documentElement;
  const bounds = { left:Math.max(0, frame.left), top:Math.max(0, frame.top),
    right:Math.min(vp.clientWidth, frame.right), bottom:Math.min(vp.clientHeight, frame.bottom) };
  if (area(bounds) === 0 || overlap(preferred, bounds) === 0) return;
  const fit = fitOverlay(preferred, bounds, collectObstacles(host, bounds, [el]), gap);
  translateOverlay(el, fit.left - preferred.left, fit.top - preferred.top);
}

/**
 * Measure a popup's content (`fill(contentEl)` writes it) BEFORE it exists, by laying the same markup out hidden in `host` with the popup's own
 * class names (so the app's stylesheet gives the size the real one will have).
 * @returns {{w,h}}
 */
export function measureHtml(host, fill, o) {
  const opt = o || {};
  const doc = host.ownerDocument;
  const el = doc.createElement('div');
  el.className = 'maplibregl-popup ' + (opt.className || '');
  el.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;';
  const c = doc.createElement('div'); c.className = 'maplibregl-popup-content';
  if (opt.maxWidth) el.style.maxWidth = opt.maxWidth;   /* MapLibre sets it on the popup root, not the content */
  fill(c);   /* the caller puts its own (already escaped) markup in, as it does for the real popup */
  el.appendChild(c); host.appendChild(el);
  const r = el.getBoundingClientRect();
  el.remove();
  return { w: Math.ceil(r.width) || 200, h: Math.ceil(r.height) || 120 };
}
