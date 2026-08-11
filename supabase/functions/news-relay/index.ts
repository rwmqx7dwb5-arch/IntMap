// ============================================================================
//  IntMap · news-relay  —  Google News RSS relay  (Supabase Edge Function, Deno)
// ----------------------------------------------------------------------------
//  WHY THIS EXISTS (#R216 — the root cause of 「日本語版でニュースが表示されない。
//  ずっと読み込み中。」, reported for the third round running):
//
//  news.google.com sends no `Access-Control-Allow-Origin`, so the browser has never
//  been able to read the feed directly; the app has always gone through public CORS
//  relays. #R214 measured those relays FROM A PAGE and added proxy.corsfix.com because
//  it was the only one that answered the ja-JP edition — but that measurement was taken
//  on `http://127.0.0.1`. Measured again from the REAL origin
//  (`https://rwmqx7dwb5-arch.github.io`), the same second, the same build:
//
//      proxy.corsfix.com  → 403  {"corsfix_error":"domain_not_registered"}   (255 ms)
//      corsproxy.io       → 503  Google's "Sorry…" bot page, 2,041 B         (8.1 s)
//      api.allorigins.win → timeout                                          (>20 s)
//      api.codetabs.com   → timeout                                          (>20 s)
//
//  corsfix authorises by CALLING ORIGIN: localhost is allowed by default, a deployed
//  domain has to be registered in their dashboard. So the one relay that could fetch
//  Japanese worked in development and was refused in production — every Japanese
//  reader of the live site waited out ~40 s of deadlines and got 「読み込めませんでした」.
//  ⚠ A proxy verified from localhost is not a proxy verified for the site.
//
//  THE FIX is the one #R145 (sv-cov) and #R190 (cable-geo) already use: fetch it
//  SERVER-SIDE, where there is no browser CORS at all, and return it with
//  `Access-Control-Allow-Origin: *`. The data source, its terms and the attribution are
//  unchanged — what changes is that the request goes to OUR origin instead of to a
//  stranger's uptime and a stranger's allow-list. The four public relays stay in
//  js/proxy-fetch.js behind this one, so a cold Edge Function or a Supabase outage
//  still has the old behaviour to fall back to.
//
//  ⚠ NOT AN OPEN PROXY. Only `https://news.google.com/rss/…` is forwarded (the
//  headlines sections and the search endpoint the app builds in js/news-feed.js), the
//  response must look like a feed, and anything else is a 400. Keyless & public — no
//  user data reaches it beyond the feed URL the app would have requested anyway.
//
//  Deploy: supabase functions deploy news-relay --no-verify-jwt --project-ref vpekfwdpurzejrrmacac
//  Secrets: none.
// ============================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* Google News rotates its headlines a few times an hour; the app also keeps its own
   6-hour localStorage copy. Five minutes of shared edge caching turns a burst of
   readers into one upstream request without ever showing a stale-feeling feed. */
const CACHE = "public, max-age=300, s-maxage=300, stale-while-revalidate=1800";

/* The ONE upstream host, and the two path prefixes js/news-feed.js builds:
     /rss/headlines/section/topic/<TOPIC>?hl=…&gl=…&ceid=…
     /rss/search?q=…&hl=…&gl=…&ceid=…
   Checked structurally rather than by regex so a crafted string cannot smuggle a
   different host past a `startsWith`. */
function allowed(raw) {
  let u;
  try { u = new URL(raw); } catch (_) { return false; }
  if (u.protocol !== "https:") return false;
  if (u.hostname !== "news.google.com") return false;
  if (!u.pathname.startsWith("/rss/")) return false;
  return true;
}

// NOTE: written WITHOUT TypeScript annotations, like sv-cov and cable-geo — scripts/static-checks.mjs
// parses every committed .ts with acorn, so a type annotation here fails the build gate.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const u = new URL(req.url).searchParams.get("u") || "";
  if (!allowed(u)) {
    return new Response(
      JSON.stringify({ error: "only https://news.google.com/rss/… is relayed" }),
      { status: 400, headers: { ...CORS, "content-type": "application/json" } },
    );
  }

  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 12000);
    let r;
    try {
      r = await fetch(u, {
        signal: ac.signal,
        headers: {
          /* a real UA string: Google serves its bot interstitial to obviously-automated
             clients, which is the 503 the public relays were collecting */
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
          "accept-language": "*",
        },
      });
    } finally { clearTimeout(t); }

    if (!r.ok) {
      return new Response(JSON.stringify({ error: "upstream " + r.status }),
        { status: 502, headers: { ...CORS, "content-type": "application/json" } });
    }
    const txt = await r.text();
    /* ⚠ AN INTERSTITIAL IS NOT A FEED, AND MUST NOT BE HANDED BACK AS ONE. Google answers a
       blocked request with 200 + an HTML "Sorry…" page; passing that through would let the
       browser's race declare this relay the winner and then parse zero items — the exact
       failure mode that made 「読み込み中」 permanent. Say 502 so the caller tries the next one. */
    if (!(txt.includes("<rss") || txt.includes("<feed"))) {
      return new Response(JSON.stringify({ error: "upstream did not return a feed" }),
        { status: 502, headers: { ...CORS, "content-type": "application/json" } });
    }
    return new Response(txt, {
      headers: { ...CORS, "content-type": "text/xml; charset=utf-8", "cache-control": CACHE },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e && e.message) || e) }),
      { status: 502, headers: { ...CORS, "content-type": "application/json" } });
  }
});
