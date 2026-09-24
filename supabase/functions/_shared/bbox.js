// ============================================================================
//  IntMap · _shared/bbox.js — one reading of `?bbox=w,s,e,n` for every relay that takes one
// ----------------------------------------------------------------------------
//  WHY (#R801, external audit): aviation-feed read its bbox with `isFinite` and nothing else, and
//  handed the four numbers to tilesForBbox, whose fanOut builds an array proportional to the
//  longitude span. MEASURED: a span of 1e8 degrees took 4.3 s of CPU per request and 1e9 threw
//  `Invalid array length` — on an unauthenticated endpoint. ais-feed had the right rule (±180 /
//  ±90, south not above north) fifty lines from its handler, and the two had drifted apart, which
//  is the reason this is one function rather than two copies of one.
//
//  `w > e` is NOT an error: it is a box that crosses the antimeridian, the same reading as
//  _shared/aviation-model.js lonInSpan and ais-feed's lonInSpan. What IS refused is a number that
//  is not a coordinate at all — the caller decides what to do with null (ais-feed serves the whole
//  world, aviation-feed answers 400), the rule for what a bbox is lives here.
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE — the repo's static gate parses every committed .ts/.js as
//  plain JavaScript (see relay-guard.js).
// ============================================================================

/* `w,s,e,n` in degrees → [w, s, e, n], or null when the string is not a box on this planet. */
export function parseBbox(s) {
  if (!s) return null;
  const v = String(s).split(",").map(Number);
  if (v.length !== 4 || v.some((x) => !Number.isFinite(x))) return null;
  const [w, sLat, e, n] = v;
  if (sLat > n || sLat < -90 || n > 90 || w < -180 || w > 180 || e < -180 || e > 180) return null;
  return [w, sLat, e, n];
}
