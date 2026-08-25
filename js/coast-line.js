/* ============================================================================
 *  IntMap · THE COASTLINE — the border line, drawn round the water   (#R289)
 * ----------------------------------------------------------------------------
 *  「現在、「基本表示」の「国境線」は国同士の国境線のみですが、海岸線も国境線が全く同じ手法で描かれる
 *    ようにしてください。（基本表示に「海岸線」を追加し、風レイヤーオン時はデフォルトでオン。海岸線とは
 *    言いましたが、湖沼との境界線もこれに含みます。）」
 *
 *  「全く同じ手法で」 is taken literally, and it is what makes this a short file rather than a new
 *  dataset: the SAME `ofm` vector source js/app-body.js's `borders-only-line` uses, the SAME
 *  colour, the SAME zoom→width ladders from js/border-style.js, the SAME casing-under-line pair,
 *  the SAME `before` anchor and the SAME retry schedule. Only the source-layer differs —
 *  OpenMapTiles' `water` POLYGONS, rendered as a `line`, which strokes each polygon's rings. The
 *  ring round an ocean polygon IS the coast; the ring round a lake IS its shore. One layer
 *  answers both halves of the request because they are one geometry.
 *
 *  ⚠ THE TILE SEAMS DO NOT SHOW, AND THAT WAS MEASURED RATHER THAN HOPED. Stroking a polygon
 *  layer normally paints the tile's own clip edges as a grid of straight lines across the sea.
 *  Decoding real OpenFreeMap tiles (z4 Atlantic, z5 and z8 Tokyo, z8 Lake Biwa) says the clip
 *  runs at −64 / +4160 in a 4096 extent — i.e. inside the tile BUFFER, outside the rendered
 *  square — and the count of segments lying exactly on the tile border is 0 of 1,145 / 3,595 /
 *  2,590 / 56. MapLibre's per-tile stencil mask discards the buffer, so there is nothing to see.
 *
 *  ⚠ `swimming_pool` IS EXCLUDED AND `dock` IS NOT. The request is 海岸線＋湖沼 — where land meets
 *  water — and a hotel pool at z17 is not that; a dock basin is.
 *
 *  ⚠ A NAMED EXPORT, imported by js/app-body.js, for js/wheel-zoom.js's reason: the shell has a
 *  line ceiling whose whole point is that a subject goes to its own file (tests/r168 #8), and a
 *  named binding is checkable where a window registration is not.
 * ==========================================================================*/
export function makeCoastLine(CTX) {
  const { GE, canDraw, ensurePlaceLabels, BORDER_COLOR, BORDER_WIDTH, BORDER_CASING } = CTX;
  let coastOn = false;   /* ships OFF; the Wind layer switches it on once — see _imCoastAuto */
  /* everything except the ocean-vs-pool question, which is the one line that differs from a border */
  const FILTER = ['!', ['==', ['get', 'class'], 'swimming_pool']];
  function ensureCoastLayer() {
    try {
      if (!canDraw()) return false;
      ensurePlaceLabels(); if (!GE().layers.hasSource('ofm')) return false;
      if (!GE().layers.has('coast-only-line')) {
        const before = ['ofm-country', 'ofm-city', 'ofm-other'].find((id) => GE().layers.get(id))
          || (GE().layers.has('tool-poly') ? 'tool-poly' : undefined);
        GE().layers.add({ id: 'coast-only-line', type: 'line', source: 'ofm', 'source-layer': 'water',
          filter: FILTER,
          layout: { visibility: coastOn ? 'visible' : 'none', 'line-join': 'round' },
          paint: { 'line-color': BORDER_COLOR, 'line-opacity': 0.95, 'line-width': BORDER_WIDTH } }, before);
        if (!GE().layers.has('coast-only-casing')) GE().layers.add({ id: 'coast-only-casing', type: 'line', source: 'ofm', 'source-layer': 'water',
          filter: FILTER,
          layout: { visibility: coastOn ? 'visible' : 'none', 'line-join': 'round' },
          paint: { 'line-color': '#000000', 'line-opacity': 0.35, 'line-width': BORDER_CASING } }, 'coast-only-line');
      }
      return true;
    } catch (e) { return false; }
  }
  function applyCoast() {
    try { ['coast-only-line', 'coast-only-casing'].forEach((id) => { if (GE().layers.has(id)) GE().layers.setLayout(id, 'visibility', coastOn ? 'visible' : 'none'); }); } catch (_) {}
  }
  /* the SAME retry schedule the border toggle has, for the same measured reason: the `ofm` vector
     source often settles after the first cold toggle (#R38/#R40). */
  function draw() { try { if (!GE().hasRenderer()) return; if (coastOn) ensureCoastLayer(); applyCoast(); } catch (_) {} }
  const cb = document.getElementById('cb-coast');
  if (cb) cb.addEventListener('change', (e) => {
    coastOn = e.target.checked;
    if (coastOn) {
      if (!canDraw()) { try { GE().events.once('idle', draw); } catch (_) {} }
      draw();
      [250, 700, 1600, 3200].forEach((ms) => setTimeout(draw, ms));
    } else draw();
  });
  window.ensureCoastLayer = ensureCoastLayer;
  window._applyCoast = applyCoast;
  window._imCoastReassert = draw;   /* the `ofm` sourcedata hook in js/app-body.js calls this */
  /* ⚠ (#R289) THE WIND LAYER TURNS THIS ON ONCE, AND «ONCE» IS THE WHOLE DESIGN. 「風レイヤーオン時
     はデフォルトでオン」 is a DEFAULT, not a coupling: re-asserting it every time the wind is
     switched on would overrule a reader who deliberately switched the coast off while the wind was
     up — 「オフにしてるレイヤーが勝手につく」, the defect #R85 recorded. The latch makes it a default.
     ⚠ (#R476) THE ROW NOW SHIPS ON, so on a first load this spends the latch and returns false at the
     `c.checked` line without touching anything. It is kept, unchanged, because it is still the only
     thing that offers the coastline to a reader who is running a SAVED session written before #R476 —
     there the restore's off-sweep switches the row off, and the wind is the one path back. */
  window._imCoastAuto = function () {
    try {
      const c = document.getElementById('cb-coast');
      if (!c || c.__windAuto) return false;
      c.__windAuto = true; if (c.checked) return false;
      c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); return true;
    } catch (_) { return false; }
  };
  return { ensureCoastLayer, applyCoast, isOn: () => coastOn };
}
