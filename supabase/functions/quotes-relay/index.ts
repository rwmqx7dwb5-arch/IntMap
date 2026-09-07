// ============================================================================
//  IntMap · quotes-relay — the Companies tab's share prices, fetched server-side  (#R533)
// ----------------------------------------------------------------------------
//  Yahoo Finance's keyless v8 endpoints answer a browser with 200 and NO
//  Access-Control-Allow-Origin, so the page cannot read them: measured 2026-09-07,
//  query1.finance.yahoo.com returns the JSON to curl and the browser refuses it.
//  js/companies.js therefore fell back to public CORS proxies, and on the live site
//  BOTH of them were down at once — corsproxy.io answered 403 and api.allorigins.win
//  answered 522. The tab's live market caps silently reverted to the reported
//  snapshots for every reader.
//
//  ⚠ THE PROBLEM WAS NOT WHICH PROXY. It was that a public relay is a stranger's
//  uptime and a stranger's allow-list, and the Companies tab depended on one with
//  nothing of its own behind it. This is the same answer news-relay gave for Google
//  News RSS, #R145 for the Street-View tiles and #R190 for the submarine cables:
//  fetch it here, where browser CORS does not apply, and hand it back with the header.
//  The four public relays stay BEHIND this one in js/proxy-fetch.js, so a cold isolate
//  or a Supabase outage falls back to exactly the behaviour the app had before.
//
//  WHAT GOES THROUGH: ticker symbols. Nothing else — see `allowed` below, which is an
//  allow-list of two endpoints and their parameters rather than an open proxy.
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE. scripts/static-checks.mjs parses every committed
//  .ts with acorn, so the Edge Functions are plain JavaScript in .ts files — see the
//  note at the top of news-relay.
// ============================================================================
import { corsFor, fetchGuarded, methodGate, relayFail, MAX_QUERY_URL } from "../_shared/relay-guard.js";

const CORS = corsFor();
/* A 40-symbol spark response is tens of kilobytes and a single chart with ten years of
   monthly closes is smaller still; 4 MB is the same headroom the other relays carry. */
const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 12000;

/* Quotes move during market hours and the app already de-duplicates with a 5-minute
   in-page cache, so 60 s of shared edge caching collapses a burst of readers into one
   upstream request without ever showing a price the app would call stale. */
const CACHE = "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

/* The ONE upstream host and the two path shapes js/companies.js builds:
     /v8/finance/spark?symbols=A,B,…&range=…&interval=…
     /v8/finance/chart/<SYMBOL>?range=…&interval=…  (or period1/period2/interval)
   Checked structurally, not by prefix, so a crafted string cannot smuggle a different
   host or a different Yahoo endpoint past a `startsWith`. */
const SYMBOL_RE = /^[A-Za-z0-9.\-^=]{1,16}$/;
const CHART_RE = /^\/v8\/finance\/chart\/([A-Za-z0-9.\-^=%]{1,24})$/;
const RANGE_RE = /^[0-9]{1,2}(?:d|mo|y)$|^ytd$|^max$/;
const INTERVAL_RE = /^[0-9]{1,3}(?:m|h|d|wk|mo)$/;
/* Yahoo's own stated ceiling for /v8/finance/spark, measured 2026-09-07: 24 symbols answer 400 with
   "Number of symbols needs to be less than or equal to 20", 20 answer 200. js/companies.js batches
   to exactly this number (SPARK_MAX_SYMBOLS) — tests/r533-checks.test.mjs ⑧ holds the two together.
   Accepting more here would only spend a round trip to collect the upstream's 400. */
const SPARK_MAX_SYMBOLS = 20;

function allowed(raw) {
  let u;
  try { u = new URL(raw); } catch (_) { return false; }
  if (u.protocol !== "https:") return false;
  if (u.hostname !== "query1.finance.yahoo.com" && u.hostname !== "query2.finance.yahoo.com") return false;
  if (u.hash) return false;

  const isSpark = u.pathname === "/v8/finance/spark";
  const chart = CHART_RE.exec(u.pathname);
  if (!isSpark && !chart) return false;
  /* the symbol in the PATH is an input too */
  if (chart && !SYMBOL_RE.test(decodeURIComponent(chart[1]))) return false;

  let sawSymbols = false;
  for (const [k, v] of u.searchParams) {
    switch (k) {
      case "symbols": {
        if (!isSpark) return false;
        const syms = v.split(",");
        if (syms.length > SPARK_MAX_SYMBOLS) return false;
        if (!syms.every((s) => SYMBOL_RE.test(s))) return false;
        sawSymbols = true;
        break;
      }
      case "range":
        if (!RANGE_RE.test(v)) return false;
        break;
      case "interval":
        if (!INTERVAL_RE.test(v)) return false;
        break;
      case "period1":
      case "period2":
        /* A unix timestamp, never a payload — AND IT MAY BE NEGATIVE. The first cut of this
           allow-list wrote `^[0-9]{1,11}$`, which is every instant since 1970 and nothing before
           it. The Companies compare view offers a time series back to 1962, so every pre-1970
           request was refused here with 400 and had to be carried by the public relays instead —
           measured on the live site with the clock at 1955: 112 of 135 calls to this function were
           that 400. The graph still drew, which is exactly why it would have stayed hidden.
           ⚠ The bound that matters is the LENGTH, and it is unchanged. */
        if (!/^-?[0-9]{1,11}$/.test(v)) return false;
        break;
      default:
        return false;
    }
  }
  if (isSpark && !sawSymbols) return false;
  return true;
}

/* Is this an answer the caller can actually read, or is it Yahoo saying no?
   ⚠ THE THREE SHAPES ARE THE CALLER'S, NOT AN OPINION FORMED HERE. js/companies.js reads a chart
   envelope, a spark envelope AND the flat `{TK:{symbol,close,…}}` form, and the flat one is what
   query1 actually returns for /v8/finance/spark today (measured 2026-09-07: top-level keys are the
   tickers themselves, no `spark` wrapper). A relay that accepts less than its caller does turns a
   good answer into an outage — the first cut of this function did exactly that and answered 502 to
   every batched quote while single-symbol charts sailed through. */
function hasQuote(j) {
  if (!j || typeof j !== "object") return false;
  const env = j.chart || j.spark;
  if (env) return !env.error && !!env.result;
  /* the flat form: at least one ticker carrying a close series */
  for (const k of Object.keys(j)) {
    const v = j[k];
    if (v && typeof v === "object" && v.symbol && Array.isArray(v.close)) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  const gate = methodGate(req, CORS);
  if (gate) return gate;

  const u = new URL(req.url).searchParams.get("u") || "";
  if (u.length > MAX_QUERY_URL || !allowed(u)) {
    return new Response(
      JSON.stringify({ error: "only Yahoo Finance v8 spark/chart URLs are relayed" }),
      { status: 400, headers: { ...CORS, "content-type": "application/json" } },
    );
  }

  try {
    const r = await fetchGuarded(u, {
      timeoutMs: TIMEOUT_MS,
      maxBytes: MAX_BYTES,
      contentTypeRe: /json/i,
      headers: {
        /* Yahoo answers obviously-automated clients with 429; a real UA string is what
           the browser would have sent had CORS let it ask directly. */
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "accept": "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9",
      },
    });

    if (!r.ok) {
      return new Response(JSON.stringify({ error: "upstream_error" }),
        { status: 502, headers: { ...CORS, "content-type": "application/json" } });
    }
    const txt = r.text();
    /* ⚠ AN ERROR ENVELOPE IS NOT A QUOTE. Yahoo answers a throttled or unknown symbol with
       200 and `{"spark":{"result":null,"error":{…}}}`; handing that back would let the
       caller's race declare this relay the winner and then read zero prices — the shape
       #R216 refused for Google's interstitial, one layer out. Say 502 so the ladder
       carries on to the public relays. */
    let j;
    try { j = JSON.parse(txt); } catch (_) {
      return new Response(JSON.stringify({ error: "upstream_not_json" }),
        { status: 502, headers: { ...CORS, "content-type": "application/json" } });
    }
    if (!hasQuote(j)) {
      return new Response(JSON.stringify({ error: "upstream_no_quote" }),
        { status: 502, headers: { ...CORS, "content-type": "application/json" } });
    }
    return new Response(txt, {
      headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": CACHE },
    });
  } catch (e) {
    /* ⚠ A CODE, NOT THE EXCEPTION — this endpoint is world-readable (CodeQL js/stack-trace-exposure). */
    return relayFail(e, CORS);
  }
});
