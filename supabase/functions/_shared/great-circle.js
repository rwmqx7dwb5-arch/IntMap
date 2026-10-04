// ============================================================================
//  IntMap · _shared/great-circle.js — the one «how far apart are two points» for the page and the server
// ----------------------------------------------------------------------------
//  Before this file the same haversine was written five times (js/here-now.js, _shared/place-watch.js,
//  js/volcano-intel.js, js/atlas-world-objects.js, research.impact through the kernel's `_havKm`) and the
//  Earth was written two ways (a 6,371 km radius in four, a 12,742 km diameter in one). They agreed only
//  because nobody had changed one yet. This is the one copy; the others import it.
//
//  WHY IT IS IN _shared/. Plain JavaScript: no DOM, no Deno global, no network. The page imports it by
//  relative path (the way js/place-watch.js already imports _shared/place-watch.js) and an Edge Function
//  can import it the same way, so a rule decided here is decided once for both.
//
//  THE RADIUS. 6,371 km — the mean Earth radius every one of the five copies used (12,742 = 2 × 6,371).
//  ⚠ js/geodesy.js carries 6,371.0088 km (the IUGG mean radius R1) for the GIS kernel's measurements; the
//  0.0088 km is 1.4 ppm, far below what «within 300 km» or «12 km away» resolves. EXPIRES IF a reader of
//  this function needs metre accuracy over long distances — that reader belongs on js/geodesy.js, not here.
// ============================================================================

export const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km between (lng1, lat1) and (lng2, lat2), degrees. */
export function haversineKm(lng1, lat1, lng2, lat2) {
  const t = Math.PI / 180;
  const dLat = (lat2 - lat1) * t, dLng = (lng2 - lng1) * t;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}
