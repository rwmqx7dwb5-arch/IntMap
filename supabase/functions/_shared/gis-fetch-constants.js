// ============================================================================
//  The two numbers the PAGE and the gis-fetch Edge Function must agree on.
//  ⚠ A FILE OF ITS OWN, NOT PART OF gis-fetch-policy.js: that file imports relay-guard.js (the server's guards), and the page's
//  js/gis-fetch.js importing it made the bundler pull relay-guard.js out into a shared chunk — one more request at boot
//  (measured 2026-11-20: eager.requests 10 → 11 in the build report). The page needs only these two values.
//  NO TYPE ANNOTATIONS and no Deno globals: the browser bundle imports this file too.
// ============================================================================

export const GIS_FETCH_FUNCTION = "gis-fetch";

/* the most ONE ranged read may ask for. 4 MiB = four of the page's 1 MiB chunks (js/gis-fetch.js CHUNK_BYTES);
   a COG tile row is ~100 KiB–1 MiB in every file measured, so one call is never the file. */
export const RANGE_MAX_BYTES = 4 * 1024 * 1024;
