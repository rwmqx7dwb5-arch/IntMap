// ============================================================================
//  IntMap · volcano-feed  —  the two volcano feeds a browser cannot read  (Supabase Edge Function, Deno)
// ----------------------------------------------------------------------------
//  (#R353) 「火山 → Volcano Intelligence … ここは恐ろしく深くできます。」
//
//  Volcano Intelligence reads SIX live sources. Four of them a browser can fetch itself, and this
//  function deliberately does NOT relay them — a relay that is not needed is one more thing to be
//  down (the #R266 rule). MEASURED this round, same session, with `Origin:` set to the Pages origin:
//
//      volcanoes.usgs.gov/hans-public   200  Access-Control-Allow-Origin: *      ← direct
//      www.jma.go.jp/bosai/volcano      200  Access-Control-Allow-Origin: *      ← direct
//      services.arcgis.com (USGS VHP)   200  Access-Control-Allow-Origin: *      ← direct
//      earthquake.usgs.gov              200  Access-Control-Allow-Origin: *      ← direct
//      volcano.si.edu (Weekly report)   200  NO access-control-allow-origin      ← relayed, below
//      aviationweather.gov (SIGMET)     200  NO access-control-allow-origin      ← relayed, below
//
//  ── WHY THE ANSWER IS PARSED HERE AND NOT IN THE PAGE ──────────────────────────────────────
//  The Weekly Volcanic Activity Report is RSS: 29 kB of XML whose useful content is one line per
//  volcano plus a narrative. Handing that to the browser would mean shipping an XML scraper into the
//  boot bundle for a feed that changes once a week. It is parsed here, once per edge-cache window for
//  every reader in the world, and what crosses the wire is the structured answer — keyed by GVP
//  VOLCANO NUMBER, which the feed itself carries in each item's <guid> as `#vn_282110`. That number
//  is the join key for everything bundled in data/volcanoes_gvp.json, so the page never has to match
//  a volcano by NAME.
//
//  ⚠ THE ASH FEED IS INTERNATIONAL SIGMETs, NOT VAAC BULLETINS, AND THE DIFFERENCE IS THE POINT.
//  A VAAC issues a Volcanic Ash Advisory as formatted text (and a PNG); the ash CLOUD as a polygon
//  with a flight level on it exists in the SIGMET a FIR issues off the back of that advisory, and
//  aviationweather.gov publishes those as JSON with real coordinates. Measured this round: 127
//  international SIGMETs live, 8 of them `hazard: "VA"` — e.g. KRAKATAU, SFC/FL090, moving SW at
//  5 kt, INTSF. So the layer draws an ash area an aviation authority actually promulgated, with the
//  altitude band it actually promulgated, rather than a circle around a volcano.
//
//  ⚠ NOT AN OPEN PROXY. Two upstreams, two exact URLs, GET only, and the answer must parse into the
//  shape _shared/volcano-parse.js expects or it is a 502. Keyless & public — no user data reaches it.
//
//  Deploy: supabase functions deploy volcano-feed --no-verify-jwt --project-ref vpekfwdpurzejrrmacac
//  Secrets: none.
//
//  ⚠ NO TYPE ANNOTATIONS. scripts/static-checks.mjs parses every committed .ts with acorn, so the
//  Edge Functions are plain JavaScript in .ts files — see the note at the top of alerts-relay.
// ============================================================================

import { corsFor, fetchGuarded, methodGate, relayFail } from "../_shared/relay-guard.js";
import { parseWeekly, parseAsh } from "../_shared/volcano-parse.js";

const CORS = corsFor();

const WEEKLY_URL = "https://volcano.si.edu/news/WeeklyVolcanoRSS.xml";
const ASH_URL = "https://aviationweather.gov/api/data/isigmet?format=json";

/* Measured: the weekly RSS is 29 kB and the international SIGMET set is ~120 kB. Two megabytes is
   more than an order of magnitude of headroom and still a bound. */
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 20000;

/* The weekly report is written once a week (Thursdays, 2300 UTC) — an hour of shared edge cache is
   still far fresher than the source. The ash feed is a SAFETY claim with a clock on it: SIGMETs are
   valid for six hours and are amended inside that, so it gets the same 15 s floor alerts-relay uses.
   `stale-while-revalidate` is what keeps the edge answering instantly while it refreshes. */
const CACHE_WEEKLY = "public, max-age=900, s-maxage=3600, stale-while-revalidate=86400";
const CACHE_ASH = "public, max-age=15, s-maxage=15, stale-while-revalidate=300";

Deno.serve(async (req) => {
  const gate = methodGate(req, CORS);
  if (gate) return gate;

  const feed = new URL(req.url).searchParams.get("feed") || "";
  if (feed !== "weekly" && feed !== "ash") {
    return new Response(JSON.stringify({ error: "feed must be 'weekly' or 'ash'" }),
      { status: 400, headers: { ...CORS, "content-type": "application/json" } });
  }

  try {
    const r = await fetchGuarded(feed === "weekly" ? WEEKLY_URL : ASH_URL, {
      timeoutMs: TIMEOUT_MS,
      maxBytes: MAX_BYTES,
      contentTypeRe: feed === "weekly" ? /xml|text\//i : /json|text\//i,
      headers: {
        "user-agent": "IntMap/volcano-feed (+https://github.com/rwmqx7dwb5-arch/IntMap)",
        accept: feed === "weekly" ? "application/rss+xml, application/xml, text/xml" : "application/json",
      },
    });
    if (!r.ok) {
      return new Response(JSON.stringify({ error: "upstream_error" }),
        { status: 502, headers: { ...CORS, "content-type": "application/json" } });
    }

    let payload, count;
    if (feed === "weekly") {
      const rows = parseWeekly(r.text());
      /* An empty parse means the feed changed shape or an error page arrived with a 200 — either way
         it is not data, and caching it for an hour as if it were is the failure this check exists for. */
      if (!rows.length) {
        return new Response(JSON.stringify({ error: "upstream_no_items" }),
          { status: 502, headers: { ...CORS, "content-type": "application/json" } });
      }
      count = rows.length;
      payload = JSON.stringify({ feed: "weekly", source: "Smithsonian / USGS Weekly Volcanic Activity Report", rows });
    } else {
      const a = parseAsh(r.text());
      /* ⚠ ZERO ASH AREAS IS A VALID ANSWER AND MUST NOT BE A 502. Most hours there is no volcanic-ash
         SIGMET anywhere on Earth; `read` proves the feed was actually read. Only an unreadable feed
         (nothing parsed at all) is an error. */
      if (!a.read) {
        return new Response(JSON.stringify({ error: "upstream_no_items" }),
          { status: 502, headers: { ...CORS, "content-type": "application/json" } });
      }
      count = a.areas.length;
      payload = JSON.stringify({ feed: "ash", source: "International SIGMET (NOAA Aviation Weather Center)", read: a.read, areas: a.areas });
    }

    return new Response(payload, {
      headers: {
        ...CORS,
        "content-type": "application/json",
        "cache-control": feed === "weekly" ? CACHE_WEEKLY : CACHE_ASH,
        "x-intmap-rows": String(count),
      },
    });
  } catch (e) {
    /* ⚠ THE EXCEPTION IS NEVER THE MESSAGE. relayFail says only which BOUND was hit — this endpoint
       is world-readable (CodeQL js/stack-trace-exposure). */
    return relayFail(e, CORS);
  }
});
