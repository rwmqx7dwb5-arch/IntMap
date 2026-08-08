/* ============================================================================
 *  IntMap · THE VIEW THE APP OPENS ON — a lit Earth, not a black one  (#R203)
 * ----------------------------------------------------------------------------
 *  「起動したときに地図が真っ暗になっている場合がある。どうにかしろ。」
 *
 *  MEASURED FIRST, and it is not a failure to render. Booting the built site at 22:49 UTC on a
 *  390×844 phone and reading the map's own pixels back through a render tick: the whole canvas
 *  averages [29,30,36] with 52 % of its pixels under luminance 15 (dark theme: [18,19,25] and 67 %).
 *  The screenshot says what that is — a correctly drawn globe, centred on Africa, at half past
 *  midnight local, so the entire visible hemisphere is the night side. Everything works; the app
 *  simply opens looking at the dark half of the planet, and does so 「場合がある」 — whenever the
 *  clock puts the default centre after sunset, which is about half the time.
 *
 *  ⚠ SO THE NIGHT SIDE IS NOT WHAT CHANGES. #R201 was asked for exactly this darkness —
 *  「引いたときの黒さをよりきつくして」「夜の部分は完全に夜間光レイヤーと同じ画像に」 — and it
 *  delivers it by compositing NASA's Black Marble at full alpha, which is near-black wherever nobody
 *  lives. Turning that down would be undoing a previous instruction to satisfy this one. What is
 *  free to change is WHERE THE APP OPENS, which nothing has ever asked to be 10°E.
 *
 *  So: if the sun stands at least MIN_ELEV_DEG above the default centre, the opening view is the one
 *  it has always been. If it does not, the opening LONGITUDE becomes the sub-solar one — the app
 *  opens on the daylit hemisphere, at the same latitude and the same zoom. Nothing else moves, and a
 *  share link, a search, a saved place or one drag all override it the moment they happen.
 *
 *  The sub-solar point is the standard low-precision solar position (NOAA / Astronomical Almanac
 *  "approximate solar coordinates", good to ~0.01° over 1950–2050) — the same quantities
 *  js/night-side.js draws the terminator from, computed here without it because this runs while the
 *  map is being CREATED, long before any of that module exists.
 * ==========================================================================*/

/* ⚠ ONE EXPORT, AND EVERY CONSTANT INSIDE IT. `tests/r175-checks ③` holds js/ modules to two
   rules at once — no unexported top-level declaration, and no export that nothing imports by name —
   and a module of small pure helpers satisfies both only as a single object (#R202 wrote this down
   after js/sky-model.js hit it). */
export const OpeningView = (() => {
  const D = Math.PI / 180;

  /** days since J2000.0 (2000-01-01 12:00 UT) for a millisecond epoch */
  const daysSinceJ2000 = (ms) => ms / 86400000 + 2440587.5 - 2451545.0;

  /**
   * The point on Earth the Sun is directly overhead at.
   * @param {number} ms epoch milliseconds
   * @returns {{lat:number,lng:number}} degrees, lng in (−180,180]
   */
  function subsolarPoint(ms) {
    const n = daysSinceJ2000(ms);
    const L = (280.460 + 0.9856474 * n) * D;              /* mean longitude */
    const g = (357.528 + 0.9856003 * n) * D;              /* mean anomaly */
    const lam = L + (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D;   /* ecliptic longitude */
    const eps = (23.439 - 0.0000004 * n) * D;             /* obliquity */
    const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
    const gmst = (280.16 + 360.9856235 * n) * D;          /* Greenwich mean sidereal time */
    let lng = (ra - gmst) / D;
    lng = ((lng % 360) + 540) % 360 - 180;
    return { lat: dec / D, lng };
  }

  /** How high the Sun stands over (lat, lng), in degrees. Negative is below the horizon. */
  function solarElevation(ms, lat, lng) {
    const s = subsolarPoint(ms);
    const a = lat * D, b = s.lat * D, dl = (lng - s.lng) * D;
    const cos = Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos(dl);
    return 90 - Math.acos(Math.max(-1, Math.min(1, cos))) / D;
  }

  /* Not "above the horizon" but comfortably above it: at 0° the centre is ON the terminator and half
     the disc is still night, and the whole point is that the view the app opens on is a lit Earth. */
  const MIN_ELEV_DEG = 12;

  /**
   * The [lng, lat] the map should be created at.
   * @param {number} ms epoch milliseconds (the app's own clock when it exists)
   * @param {[number,number]} dflt the view's declared default centre
   */
  function openingCentre(ms, dflt) {
    const d = (Array.isArray(dflt) && dflt.length === 2) ? dflt : [10, 20];
    if (!isFinite(ms)) return d.slice();
    try {
      if (solarElevation(ms, d[1], d[0]) >= MIN_ELEV_DEG) return d.slice();
      /* the sub-solar longitude at the default's own latitude — the Sun is then as high over the
         centre as it gets today, and the visible hemisphere is the lit one */
      return [Math.round(subsolarPoint(ms).lng * 1000) / 1000, d[1]];
    } catch (_) { return d.slice(); }
  }

  /** the app's clock if it is already up, otherwise the wall clock (#R94, #R200: `when`, never `now`) */
  function openingClockMs() {
    try {
      const T = (typeof window !== 'undefined') && window.IntMapTime;
      if (T && T.when) { const v = +T.when(); if (isFinite(v)) return v; }
    } catch (_) {}
    return Date.now();
  }

  return { subsolarPoint, solarElevation, openingCentre, openingClockMs, MIN_ELEV_DEG };
})();
