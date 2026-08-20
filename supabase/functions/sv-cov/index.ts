// ============================================================================
//  IntMap · sv-cov  —  Street View COVERAGE tile proxy  (Supabase Edge Function, Deno)
// ----------------------------------------------------------------------------
//  WHY THIS EXISTS (#R145 — the real root cause of "Street View ignores coverage"):
//  The map snaps a Street-View click onto Google's nearest REAL panorama by
//  PIXEL-SAMPLING Google's keyless `svv` coverage tiles (mts*.google.com/vt?…lyrs=svv)
//  on a <canvas> (getImageData). That read requires the tile to be CORS-clean —
//  a `crossOrigin='anonymous'` <img> plus an `Access-Control-Allow-Origin` header.
//  Google's mts.google.com tiles do NOT reliably send ACAO (and Apple Private Relay
//  / ad-blockers / DNS blocklists frequently strip or drop them), so the anonymous
//  <img> load is blocked → every tile fails → the sampler returns null → the caller
//  falls back to the RAW CLICK point. The VISIBLE raster overlay still renders (that
//  path needs no CORS), so the user sees blue coverage but the marker never snaps —
//  exactly the re-reported bug. R140 and R142 both rebuilt ON TOP of this blocked
//  read, which is why nothing changed.
//
//  THE FIX: fetch the tile SERVER-SIDE here (no browser CORS at all) and return it
//  with `Access-Control-Allow-Origin: *`, so the client canvas can sample it anywhere.
//
//  This is a tightly-allowlisted relay of Google's OWN public coverage PNGs — NOT an
//  open proxy: only `mts0-3.google.com/vt?…lyrs=svv` with integer x/y/z is forwarded.
//  Keyless & public (no user data) → deploy with --no-verify-jwt.
//
//  Deploy:  supabase functions deploy sv-cov --no-verify-jwt --project-ref vpekfwdpurzejrrmacac
//  Secrets: none.
// ============================================================================

import { corsFor, fetchGuarded, MAX_QUERY_URL } from "../_shared/relay-guard.js";

const CORS = corsFor("range");
/* A 256×256 coverage PNG is a few kilobytes. 2 MB is far above any tile Google serves here and far
   below anything worth relaying — and there was NO ceiling and NO deadline on this fetch at all. */
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15000;

// 1×1 fully-transparent PNG — returned (200) in place of an upstream miss so the client
// sampler treats a coverage-less tile as "loaded, no coverage here" rather than a network
// failure (a failed tile would wrongly poison the whole 3×3 sample → false "unverified").
const BLANK_PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

function blank() {
  return new Response(BLANK_PNG, {
    headers: { ...CORS, "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
function bad(status, msg) {
  return new Response(msg, { status, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET") return bad(405, "GET only");

  // The client passes the full Google tile URL as ?u=<encoded>; we validate it hard.
  let target;
  try {
    const raw = new URL(req.url).searchParams.get("u");
    if (!raw) return bad(400, "missing u");
    if (raw.length > MAX_QUERY_URL) return bad(400, "bad url");
    target = new URL(raw);
  } catch {
    return bad(400, "bad url");
  }

  // Allowlist — Google Street-View coverage (svv) tiles ONLY. Never an open proxy.
  if (target.protocol !== "https:") return bad(403, "https only");
  if (!/^mts[0-3]\.google\.com$/.test(target.hostname)) return bad(403, "host not allowed");
  if (target.pathname !== "/vt") return bad(403, "path not allowed");
  if (target.searchParams.get("lyrs") !== "svv") return bad(403, "layer not allowed");
  // z ∈ 0..22 (1–2 digits); x,y ∈ 0..2^z-1 (up to 7 digits at z=22). Integer-only, no scheme tricks.
  const z = target.searchParams.get("z");
  if (z === null || !/^\d{1,2}$/.test(z) || +z > 22) return bad(400, "bad z");
  /* ⚠ THE COORDINATE HAS TO BE ON THE PYRAMID, NOT MERELY BE DIGITS. `/^\d{1,7}$/` accepted x=9999999
     at z=0, where the only tile is 0/0/0 — a request this function would have forwarded to Google as
     if it were a real tile. A z/x/y is only a tile when x and y are below 2^z. */
  const span = Math.pow(2, +z);
  for (const k of ["x", "y"]) {
    const v = target.searchParams.get(k);
    if (v === null || !/^\d{1,7}$/.test(v) || +v >= span) return bad(400, "bad " + k);
  }
  if (target.hash) return bad(400, "bad url");

  try {
    const up = await fetchGuarded(target.toString(), {
      timeoutMs: TIMEOUT_MS,
      maxBytes: MAX_BYTES,
      headers: {
        // A browser-like UA/Referer keeps Google serving the tiles consistently.
        "User-Agent": "Mozilla/5.0 (compatible; IntMap/1.0; +https://rwmqx7dwb5-arch.github.io/IntMap/)",
        "Referer": "https://www.google.com/",
        "Accept": "image/avif,image/webp,image/png,image/*,*/*;q=0.8",
      },
    });
    if (!up.ok) return blank(); // 404/204 on an empty tile → transparent (no coverage), not an error
    const ct = up.contentType || "image/png";
    if (!/^image\//i.test(ct)) return blank(); // never relay an HTML error body into a <canvas>
    const buf = up.bytes;
    return new Response(buf, {
      headers: {
        ...CORS,
        "Content-Type": ct,
        // Coverage is near-static → cache hard at the edge/CDN to spare Google and stay fast.
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  } catch {
    return blank();
  }
});
