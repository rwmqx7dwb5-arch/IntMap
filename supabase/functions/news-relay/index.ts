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

import { corsFor, fetchGuarded, methodGate, relayFail, MAX_QUERY_URL } from "../_shared/relay-guard.js";

const CORS = corsFor();
/* A Google News RSS document is tens of kilobytes; 4 MB is two orders of magnitude of headroom and
   still refuses to hand a caller something that is not a feed at all. */
const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 12000;

/* Google News rotates its headlines a few times an hour; the app also keeps its own
   6-hour localStorage copy. Five minutes of shared edge caching turns a burst of
   readers into one upstream request without ever showing a stale-feeling feed. */
const CACHE = "public, max-age=300, s-maxage=300, stale-while-revalidate=1800";

/* The ONE upstream host, and the two path shapes js/news-feed.js builds:
     /rss/headlines/section/topic/<TOPIC>?hl=…&gl=…&ceid=…
     /rss/search?q=…&hl=…&gl=…&ceid=…
   Checked structurally rather than by regex so a crafted string cannot smuggle a
   different host past a `startsWith`.
   ⚠ AND THE PATH IS NOW THE SHAPE, NOT THE PREFIX. `startsWith("/rss/")` accepted every URL under
   that directory — including `/rss/articles/CBMi…`, the aggregator REDIRECT that every Google News
   item's `link` is. That would have had the relay FETCH one: an arbitrary Google-News-hosted
   redirect target, followed server-side, at this project's expense. Two endpoints are what the app
   builds, so two endpoints are what this forwards, and the query is an allow-list rather than
   whatever was attached.
   ⚠ (#R446) THE SHAPE CHECK BELOW IS NOW THE WHOLE GUARANTEE, AND IT WAS ALREADY WRITTEN AS IF IT
   WERE. This note used to add 「nothing in the app can use one anyway — js/proxy-fetch.js returns
   only documents containing `<rss`/`<feed`, so an article's HTML is discarded by the caller either
   way」. js/article-reader.js now asks that function for `as:'html'` and reads exactly such a page,
   so the caller-side half of that sentence has expired. Nothing changes here: the two endpoints
   above are what this relay forwards, and an article redirect was never one of them. */
const TOPIC_RE = /^\/rss\/headlines\/section\/topic\/[A-Z][A-Z_]{1,31}$/;
const EDITION_PARAMS = new Set(["hl", "gl", "ceid"]);
const MAX_Q = 512;
function allowed(raw) {
  let u;
  try { u = new URL(raw); } catch (_) { return false; }
  if (u.protocol !== "https:") return false;
  if (u.hostname !== "news.google.com") return false;
  if (u.hash) return false;
  const isSearch = u.pathname === "/rss/search";
  if (!isSearch && !TOPIC_RE.test(u.pathname)) return false;
  let sawQ = false;
  for (const [k, v] of u.searchParams) {
    if (k === "q") {
      if (!isSearch || v.length > MAX_Q) return false;
      sawQ = true;
      continue;
    }
    if (!EDITION_PARAMS.has(k)) return false;
    /* hl=en-US, gl=US, ceid=US:en — a locale, never a payload. */
    if (!/^[A-Za-z0-9:_-]{1,24}$/.test(v)) return false;
  }
  if (isSearch && !sawQ) return false;
  return true;
}

// NOTE: written WITHOUT TypeScript annotations, like sv-cov and cable-geo — scripts/static-checks.mjs
// parses every committed .ts with acorn, so a type annotation here fails the build gate.
Deno.serve(async (req) => {
  const gate = methodGate(req, CORS);
  if (gate) return gate;

  const u = new URL(req.url).searchParams.get("u") || "";
  if (u.length > MAX_QUERY_URL || !allowed(u)) {
    return new Response(
      JSON.stringify({ error: "only https://news.google.com/rss/… is relayed" }),
      { status: 400, headers: { ...CORS, "content-type": "application/json" } },
    );
  }

  try {
    const r = await fetchGuarded(u, {
      timeoutMs: TIMEOUT_MS,
      maxBytes: MAX_BYTES,
      /* text/html passes this and then fails the `<rss`/`<feed` test below, which is exactly the
         Google interstitial case the note underneath is about — same 502, one check earlier. */
      contentTypeRe: /xml|text\//i,
      headers: {
        /* a real UA string: Google serves its bot interstitial to obviously-automated
           clients, which is the 503 the public relays were collecting */
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        "accept-language": "*",
      },
    });

    if (!r.ok) {
      return new Response(JSON.stringify({ error: "upstream_error" }),
        { status: 502, headers: { ...CORS, "content-type": "application/json" } });
    }
    const txt = r.text();
    /* ⚠ AN INTERSTITIAL IS NOT A FEED, AND MUST NOT BE HANDED BACK AS ONE. Google answers a
       blocked request with 200 + an HTML "Sorry…" page; passing that through would let the
       browser's race declare this relay the winner and then parse zero items — the exact
       failure mode that made 「読み込み中」 permanent. Say 502 so the caller tries the next one. */
    if (!(txt.includes("<rss") || txt.includes("<feed"))) {
      return new Response(JSON.stringify({ error: "upstream_not_a_feed" }),
        { status: 502, headers: { ...CORS, "content-type": "application/json" } });
    }
    return new Response(txt, {
      headers: { ...CORS, "content-type": "text/xml; charset=utf-8", "cache-control": CACHE },
    });
  } catch (e) {
    /* ⚠ A CODE, NOT THE EXCEPTION — this endpoint is world-readable (CodeQL js/stack-trace-exposure). */
    return relayFail(e, CORS);
  }
});
