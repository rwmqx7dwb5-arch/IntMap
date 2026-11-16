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
