/* ============================================================================
 *  IntMap · js/card-clearance.js — FRAME THE MAP IN THE PART A CARD DOES NOT COVER   (wave4-mobility)
 * ----------------------------------------------------------------------------
 *  A card that frames what it is about (a story's places, an earthquake record's circle, a country's partners) has to
 *  leave room for itself: measured on the page, a card on the right of a desktop map (and over the top of a phone's)
 *  hid a third of the places it had just framed (js/news-story.js). The rule: the side the card sits against is the one
 *  with the least of the map behind it, and that side's padding grows by what the card covers — unless the card covers
 *  most of the map (a phone sheet at full height), where padding it out would leave nothing to frame into.
 *  ⚠ THE SAME RULE STILL STANDS AS A CLOSURE IN js/news-story.js AND js/quake-history.js (both `clearOfCard`); they can
 *  import this one — the arithmetic is identical.
 * ==========================================================================*/
/**
 * clearOfCard(card, canvasRect, base) → the padding `fitBounds` takes: { top, bottom, left, right } in CSS pixels.
 *   card        the card element (hidden or absent → `base` on every side)
 *   canvasRect  the map canvas's getBoundingClientRect()
 *   base        the padding with no card (default 60)
 */
export function clearOfCard(card, canvasRect, base) {
  const b = base == null ? 60 : base;
  const pad = { top: b, bottom: b, left: b, right: b };
  try {
    if (!card || card.style.display === 'none' || !canvasRect) return pad;
    const c = canvasRect, r = card.getBoundingClientRect();
    const cover = { right: c.right - r.left, left: r.right - c.left, bottom: c.bottom - r.top, top: r.bottom - c.top };
    const side = ['right', 'left', 'top', 'bottom'].filter((k) => cover[k] > 0).sort((x, y) => cover[x] - cover[y])[0];
    const span = side === 'right' || side === 'left' ? c.width : c.height;
    if (side && cover[side] < span * 0.75) pad[side] = Math.round(cover[side] + 30);
  } catch (_) { /* no layout (Node) — the base padding */ }
  return pad;
}

/**
 * frameBox(pieces) → [[w, s], [e, n]] for `fitBounds`, or null when there is nothing to frame.
 *   pieces  positions [lng, lat] and/or lines — arrays of positions whose longitudes run CONTINUOUSLY (each within 180° of
 *           the one before, as js/world-flows-core.js arcLine draws an arc), in any mix.
 * ⚠ LONGITUDE IS A CIRCLE. The box is the SHORTEST stretch of it that holds every piece: the complement of the widest
 *   stretch no piece touches. Measured before this: the day's edition framed by min/max longitude, so one event in Fiji
 *   (178°E) and one in Samoa (172°W) gave a box from −172 to 178 — the whole world the other way round, 350° wide — and
 *   World flows' arcs, already unwrapped past 180°, met the raw position of their far end in the same min/max.
 *   `e` may exceed 180 (MapLibre reads an unwrapped box); a line is one interval, so an arc is never cut by its own gap.
 */
export function frameBox(pieces) {
  const isPos = (p) => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' && isFinite(p[0]) && isFinite(p[1]);
  const iv = [];
  let s = 90, n = -90, world = false;
  for (const pc of pieces || []) {
    const pts = isPos(pc) ? [pc] : (Array.isArray(pc) ? pc.filter(isPos) : []);
    if (!pts.length) continue;
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) { if (p[0] < lo) lo = p[0]; if (p[0] > hi) hi = p[0]; if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1]; }
    if (hi - lo >= 360) world = true;
    const k = Math.floor((lo + 180) / 360);
    iv.push([lo - 360 * k, hi - 360 * k]);
  }
  if (!iv.length) return null;
  if (world) return [[-180, s], [180, n]];
  iv.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const x of iv) { const m = merged[merged.length - 1]; if (m && x[0] <= m[1]) m[1] = Math.max(m[1], x[1]); else merged.push([x[0], x[1]]); }
  /* the widest empty stretch: between consecutive runs, or from the last run's end round to the first run's start */
  let gap = merged[0][0] + 360 - merged[merged.length - 1][1], at = merged.length - 1;
  for (let i = 0; i + 1 < merged.length; i++) { const g = merged[i + 1][0] - merged[i][1]; if (g > gap) { gap = g; at = i; } }
  if (!(gap > 0)) return [[-180, s], [180, n]];
  if (at === merged.length - 1) return [[merged[0][0], s], [merged[merged.length - 1][1], n]];
  return [[merged[at + 1][0], s], [merged[at][1] + 360, n]];
}
