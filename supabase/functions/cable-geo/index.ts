// ============================================================================
//  IntMap · cable-geo  —  Submarine-cable GeoJSON relay  (Supabase Edge Function, Deno)
// ----------------------------------------------------------------------------
//  WHY THIS EXISTS (#R190 — the root cause of 「片方しかつかない」, measured in #R188):
//  The two default layers are Köppen and the submarine cables. Köppen is a PNG bundled
//  with the app, on the app's own origin. The cables come from TeleGeography's public
//  Submarine Cable Map API — and that endpoint sends NO `Access-Control-Allow-Origin`:
//
//      fetch('https://www.submarinecablemap.com/api/v3/cable/cable-geo.json')
//          → TypeError: Failed to fetch          (from the page's origin, every time)
//
//  So the cable layer has NEVER once loaded directly from a browser. It has only ever
//  appeared when one of three VOLUNTEER public CORS proxies happened to be up that
//  minute (#R188 kept the answer in the Cache API, which helps the second visit and
//  does nothing for the first). That asymmetry — one layer bundled, one layer at the
//  mercy of a stranger's uptime — is exactly why the report names the cables every
//  time and never Köppen.
//
//  THE FIX, and it is the same one #R145 used for the Street-View coverage tiles:
//  fetch it SERVER-SIDE here (no browser CORS at all) and return it with
//  `Access-Control-Allow-Origin: *`. The data source, the licence and the attribution
//  are unchanged — what changes is that the request goes to OUR origin instead of to a
//  third party we do not control.
//
//  This is a tightly-allowlisted relay of TWO public URLs, NOT an open proxy: only
//  `https://www.submarinecablemap.com/api/v3/{cable/cable-geo.json,
//  landing-point/landing-point-geo.json}` is forwarded, and anything else is 400.
//  Keyless & public (no user data) → deploy with --no-verify-jwt.
//
//  Deploy:  supabase functions deploy cable-geo --no-verify-jwt --project-ref vpekfwdpurzejrrmacac
//  Secrets: none.
// ============================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* The ONLY two upstream URLs this function will ever fetch. An allowlist of exact
   strings, not a pattern: there is nothing to be clever about with two constants, and
   a pattern is how a relay becomes an open proxy by accident. */
const ALLOWED = new Set([
  "https://www.submarinecablemap.com/api/v3/cable/cable-geo.json",
  "https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json",
]);

/* Upstream is ~0.7 MB + ~0.34 MB and changes on the order of weeks. A day of shared
   edge caching costs the client nothing and takes the load off TeleGeography; the
   browser keeps its own copy in the Cache API on top of this (js/data-layers.js). */
const CACHE = "public, max-age=21600, s-maxage=86400, stale-while-revalidate=604800";

// NOTE: written WITHOUT TypeScript annotations, like sv-cov — scripts/static-checks.mjs parses every
// committed .ts with acorn, so a type annotation here fails the build gate rather than the type check.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const u = new URL(req.url).searchParams.get("u") || "";
  if (!ALLOWED.has(u)) {
    return new Response(
      JSON.stringify({ error: "only the submarinecablemap.com cable/landing-point GeoJSON is relayed" }),
      { status: 400, headers: { ...CORS, "content-type": "application/json" } },
    );
  }

  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 20000);
    let r;
    try {
      r = await fetch(u, {
        signal: ac.signal,
        headers: { "user-agent": "IntMap/cable-geo (+https://github.com/rwmqx7dwb5-arch/IntMap)", accept: "application/json" },
      });
    } finally { clearTimeout(t); }

    if (!r.ok) {
      return new Response(JSON.stringify({ error: "upstream " + r.status }),
        { status: 502, headers: { ...CORS, "content-type": "application/json" } });
    }
    /* Verify it really is the FeatureCollection before handing it on: an upstream error
       page served with HTTP 200 would otherwise be cached for a day as if it were data. */
    const body = await r.text();
    let n = 0;
    try { const j = JSON.parse(body); n = (j && Array.isArray(j.features)) ? j.features.length : 0; } catch { n = 0; }
    if (!n) {
      return new Response(JSON.stringify({ error: "upstream returned no features" }),
        { status: 502, headers: { ...CORS, "content-type": "application/json" } });
    }
    return new Response(body, {
      headers: { ...CORS, "content-type": "application/json", "cache-control": CACHE, "x-intmap-features": String(n) },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e && e.message) || e) }),
      { status: 502, headers: { ...CORS, "content-type": "application/json" } });
  }
});
