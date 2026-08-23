/* ============================================================================
 *  IntMap · window.IntMapLayerHome — the layers that are allowed to move the camera  (#R313)
 * ----------------------------------------------------------------------------
 *  「EU membersレイヤーをオンにしたら、自動的にEUに行くように。」
 *  「いや、それを言ったらアメリカ大統領選挙もですよね？ EUも、ウクライナも、両方自動で行くように
 *    して。」
 *  「NATO membersレイヤーをオンにしたら、自動的にNATOに行くように。」  (#R337)
 *
 *  ⚠⚠⚠ THIS FILE IS A NARROWING OF CONSTITUTION §3, NOT A HOLE IN IT.
 *  「レイヤーを選択しても視点を一切動かさない（1pxたりとも）」 has been the rule since #R21, and
 *  #R30 DELETED an auto-flyTo from the Ukraine overlay to honour it, replacing it with a toast that
 *  asked the reader to pan there themselves. The reader has now reversed that for one shape of
 *  layer: one whose DATA ONLY EXISTS INSIDE ONE REGION, so switching it on anywhere else shows an
 *  empty map and the toast was doing the map's job with words. Every other layer still must not
 *  move the view by one pixel.
 *
 *  ⚠ ONE TABLE, NOT THREE CALL SITES. Before this file the behaviour existed once — a bare
 *  `fitBounds` inside js/us-elections.js — and a fourth layer would have been a fourth copy in a
 *  fourth file, each with its own idea of "once" and its own idea of "the reader asked". The set of
 *  layers that may do this is `HOMES` below and nowhere else.
 *
 *  ⚠ THE BOX IS MEASURED, NOT TYPED, WHEREVER THE DATA CAN ANSWER. Each entry supplies a function,
 *  so EU frames the very FeatureCollection the layer paints (`buildEuFC`, current membership at
 *  the current Chronos year) and Ukraine frames the frontline collection once that has landed.
 *  ⚠⚠ EU IS FRAMED BY EACH MEMBER'S LARGEST LANDMASS, WHICH IS NOT THE SAME AS ITS EXTENT.
 *  Natural Earth carries the EU's outermost regions inside their member's own feature and the EU
 *  layer deliberately does not clip them (see js/data-layers.js), so a plain extent of what is
 *  painted runs Guadeloupe (−61°) to Réunion (+55°, −21°) — a frame that is mostly ocean and shows
 *  the reader neither. Taking the biggest polygon per member gives the bloc as it is pictured,
 *  and it is still a measurement of the drawn geometry rather than a box somebody typed.
 *  A literal box is only used where the layer's subject is narrower than the country it sits in:
 *  the U.S. election map draws all fifty states, but a frame holding Alaska, Hawaii and Maine at
 *  once is the Pacific with a coastline at each edge.
 *
 *  ⚠ ONCE PER SESSION, AND ONLY WHEN THE READER TOGGLED IT. A restored session did not ask to be
 *  moved: js/session-tabs.js re-checks the saved boxes by dispatching the same `change` event a
 *  finger produces, so the restore MARKS each box it touches (`__imRestored`) and this module
 *  spends that mark instead of flying. Timing is not used to tell the two apart — the restore poll
 *  runs for up to 5.5 s while its own `_restoring` flag clears at 1.6 s.
 * ==========================================================================*/
(function () {
  const GE = () => window.IntMapGeoEngine;

  /* checkbox id → a function that answers 「where does this layer's data live?」 as
     [[west,south],[east,north]], or null when it cannot answer yet. */
  const HOMES = Object.create(null);

  /* the layers that qualify, and the reason each one does */
  HOMES['dl-eu'] = function () {
    /* the collection the layer itself just built — mainlands only, see the header */
    try {
      const fc = window.IntMapEuFC && window.IntMapEuFC();
      return (fc && bboxOfFC(fc, true)) || null;
    } catch (_) { return null; }
  };
  HOMES['dl-nato'] = function () {
    /* ⚠ (#R337) 「NATO membersレイヤーをオンにしたら、自動的にNATOに行くように。」 The same shape as
       EU: the collection the layer itself just built, which is already the members who had acceded by
       whatever year Chronos is set to AND is already clipped to the treaty area — js/data-layers.js
       drops every polygon whose centroid is south of the Tropic of Cancer, because Article 6 defines
       the area that way. So the frame IS the treaty area, measured, and it follows the year control:
       set Chronos to 1949 and the box is the twelve founders, not today's thirty-two. */
    try {
      const fc = window.IntMapNatoFC && window.IntMapNatoFC();
      return (fc && bboxOfFC(fc, true)) || null;
    } catch (_) { return null; }
  };
  HOMES['dl-uselect'] = function () {
    /* the lower 48. The layer is county/state results, so Alaska and Hawaii are IN the data — but a
       box that contains all three is mostly ocean, and the reader asked to be taken to the map. */
    return [[-127, 23], [-65, 50]];
  };
  HOMES['beta-dl-ukrfront'] = function () {
    try {
      const fc = window.IntMapUkrFrontFC && window.IntMapUkrFrontFC();
      const b = fc && bboxOfFC(fc, false);
      if (b) return b;
    } catch (_) {}
    return [[21.5, 44.0], [40.5, 52.6]];   /* Ukraine, until the frontline collection has landed */
  };

  /* the extent of a FeatureCollection. `mainlandOnly` keeps ONE polygon per COUNTRY — the biggest —
     and that grouping is the whole point: Natural Earth gives France more than one FEATURE under the
     same code, so picking the largest polygon per feature still let a one-polygon feature through.
     MEASURED: the EU frame came out [[-109.23, 10.28], [33.70, 70.08]] — west of Mexico, because
     Clipperton Island (109.22 W, 10.30 N) is French and arrives as its own feature. Grouped by code,
     Clipperton loses to metropolitan France and the frame is Europe. */
  function bboxOfFC(fc, mainlandOnly) {
    const acc = [180, 90, -180, -90]; let got = false;
    const grow = (a, co) => {
      if (!co) return;
      if (typeof co[0] === 'number') {
        const x = +co[0], y = +co[1];
        if (!(isFinite(x) && isFinite(y))) return;
        if (x < a[0]) a[0] = x; if (y < a[1]) a[1] = y; if (x > a[2]) a[2] = x; if (y > a[3]) a[3] = y;
        a[4] = 1;
        return;
      }
      for (let i = 0; i < co.length; i++) grow(a, co[i]);
    };
    const take = (b) => {
      if (!b || !b[4]) return;
      if (b[0] < acc[0]) acc[0] = b[0]; if (b[1] < acc[1]) acc[1] = b[1];
      if (b[2] > acc[2]) acc[2] = b[2]; if (b[3] > acc[3]) acc[3] = b[3];
      got = true;
    };
    const best = Object.create(null);           /* code -> the biggest polygon seen for it */
    ((fc && fc.features) || []).forEach((f, n) => { try {
      const g = f && f.geometry; if (!g || !g.coordinates) return;
      const parts = (mainlandOnly && g.type === 'MultiPolygon') ? g.coordinates : [g.coordinates];
      for (let i = 0; i < parts.length; i++) {
        const b = [180, 90, -180, -90, 0]; grow(b, parts[i]);
        if (!b[4]) continue;
        if (!mainlandOnly) { take(b); continue; }
        const key = String((f.properties && f.properties.__code) || f.id || n);
        const area = (b[2] - b[0]) * (b[3] - b[1]);
        if (!best[key] || area > best[key].a) best[key] = { a: area, b: b };
      }
    } catch (_) {} });
    if (mainlandOnly) Object.keys(best).forEach((k) => take(best[k].b));
    return got ? [[acc[0], acc[1]], [acc[2], acc[3]]] : null;
  }

  const flown = Object.create(null);

  /* the checkbox this id names was just switched ON. Returns true when the camera was moved. */
  function arrive(cbId) {
    try {
      const fn = HOMES[cbId];
      if (!fn) return false;
      if (flown[cbId]) return false;                    /* once per session */
      const cb = document.getElementById(cbId);
      /* ⚠ spend the restore's mark WITHOUT arming `flown` — a session that restored this layer has
         not used up the reader's one flight, so their own toggle later in the session still works */
      if (cb && cb.__imRestored) { cb.__imRestored = 0; return false; }
      const box = fn();
      if (!box) return false;
      flown[cbId] = 1;
      GE().camera.fitBounds(box, { padding: 40, duration: 900 });
      return true;
    } catch (_) { return false; }
  }

  window.IntMapLayerHome = {
    arrive: arrive,
    /* the published set, so a test can ask 「which layers are allowed to do this」 without grepping */
    ids: () => Object.keys(HOMES),
    boxOf: (id) => { try { return HOMES[id] ? HOMES[id]() : null; } catch (_) { return null; } },
    flown: (id) => !!flown[id]
  };
})();
