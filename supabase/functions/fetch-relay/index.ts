// ============================================================================
//  IntMap · fetch-relay  —  the page's own relay for upstreams that send no ACAO  (Edge Function, Deno)
// ----------------------------------------------------------------------------
//  WHY THIS EXISTS (own-fetch-relay):
//  A page can only read a cross-origin answer that carries Access-Control-Allow-Origin, and several
//  upstreams IntMap draws from do not send one (the IMF DataMapper, the 511 camera lists, the GEBCO
//  depth service, CelesTrak when the page cannot reach it). Until own-fetch-relay the page reached them through
//  four PUBLIC CORS proxies, written out by hand in eighteen files — corsproxy.io, api.allorigins.win,
//  api.codetabs.com, proxy.corsfix.com. Measured on the live site those answered 403, 503, 522 or
//  nothing (js/proxy-fetch.js keeps the tables), a single evidence fetch took ~55 s through them, and
//  every answer that did arrive had passed through a stranger who could read which URL the reader
//  asked for and rewrite what came back.
//
//  This function is the same answer #R145 (sv-cov), #R190 (cable-geo) and #R216 (news-relay) gave
//  one upstream at a time: fetch it SERVER-SIDE, where browser CORS does not apply, and hand it back
//  with `Access-Control-Allow-Origin: *` — for every upstream the page needs this for, under ONE list.
//
//  ⚠ IT IS NOT AN OPEN PROXY. What it forwards is supabase/functions/_shared/fetch-relay-policy.js
//  and nothing else: exact host names, anchored paths, an exact set of query keys with the shape of
//  each value. js/proxy-fetch.js imports the same file, so the page and this function cannot
//  disagree about what is relayable (the #R803 shape: a relay's allow-list and its own client drifted
//  apart and nobody noticed until production). Every redirect hop is asked the same question as the
//  first, under the SAME rule, by _shared/relay-guard.js's followRedirects.
//
//  BOUNDS (all per rule, all from the policy file): a byte ceiling enforced while streaming, one
//  deadline for the whole exchange, the content type an answer must declare (an HTML error page
//  never reaches a caller as the JSON it asked for), and how long a shared cache may keep it. The
//  caller's address takes one token per request from the shared bucket (_shared/rate-limit.js).
//
//  ENDPOINT (GET only):
//    ?u=<encoded upstream URL>
//        → the upstream's bytes, with its own content type, ACAO:* and the rule's cache lifetime
//        → 400 {"error":"not_allowed"}      no rule admits the URL
//        → 429 {"error":"rate_limit"}       this address is over its bucket
//        → 200 + x-intmap-no-data: 1         the upstream answered 404/410 — «not there» is an answer (relay-guard.js noData)
//        → 502 {"error":"upstream_status"}  the upstream answered any other non-2xx (its body is not relayed)
//        → 502/503 {"error":"upstream_*"}   unreachable, too large, wrong type, redirected elsewhere
//    ?u=<encoded article URL>&as=article
//        → the article page (the policy file's ARTICLE_RULE: any public https host whose name resolves only
//          to public addresses, text/html, an article by looksLikeArticle(), its own smaller bucket)
//        → 400 {"error":"not_allowed"} for a URL or an address the rule refuses; 502 {"error":"not_an_article"}
//
//  Deploy:  supabase functions deploy fetch-relay --no-verify-jwt --use-api --project-ref vpekfwdpurzejrrmacac
//  Secrets: none (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform, for the bucket).
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE — the repo's static gate parses every committed .ts as plain
//  JavaScript (see the note at the top of alerts-relay).
// ============================================================================

import { corsFor, fetchGuarded, methodGate, relayFail, resolvesPublic, noData, NO_DATA_HEADER, MAX_QUERY_URL } from "../_shared/relay-guard.js";
import { callerGate } from "../_shared/rate-limit.js";
import { fetchRelayRule, ARTICLE_RULE, articleUrlAllowed, looksLikeArticle } from "../_shared/fetch-relay-policy.js";

/* (relay-no-data-one-pass) a 404/410 is answered with relay-guard.js noData(), whose marker the page must read */
const CORS = { ...corsFor(), "Access-Control-Expose-Headers": NO_DATA_HEADER };
const env = (k) => Deno.env.get(k) || "";

/* The most requests one reader's page makes of this function in a minute (_shared/rate-limit.js
   multiplies it by the readers one address may hold). Read from the callers: the only one that
   repeats is the depth readout (js/map-readout.js), which asks once per RESTING cursor position over
   water — it is debounced by 80 ms and cached per 0.01° cell — so a reader sweeping the sea produces
   at most about one a second; the camera lists (13, once a session), the IMF series (once per
   indicator, then five days of IndexedDB) and CelesTrak (only when the host itself failed) are
   one-offs beside it. An ESTIMATE from the code, not a measurement — see rate-limit.js for when it
   expires. */
const READER_PER_MIN = 60;
/* The article rule's own bucket (`fetch-relay-article:ip`). A reader opens an article by tapping it and
   reads it; ten a minute is a reader skimming headlines as fast as the pane can open them. An ESTIMATE
   from that caller (js/article-reader.js, one request per opened article) — see rate-limit.js for
   when it expires. It is smaller than the listed rules' because this is the one rule with no host list. */
const ARTICLE_READER_PER_MIN = 10;

/* (relay-no-data-one-pass) 404 and 410 are the upstream saying the thing asked for does not exist
   (a page taken down, a list moved away) — an answer, not a failure, so the page is not sent back to
   ask again (relay-guard.js noData). Every other non-2xx stays upstream_status 502. The status is the
   only thing relayed; the upstream's body never is. */
function goneOrFail(status) {
  if (status === 404 || status === 410) return noData(CORS, { status, code: status === 410 ? "Gone" : "Not Found" });
  return fail("upstream_status", 502);
}

function fail(code, status) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" },
  });
}

Deno.serve(async (req) => {
  const gate = methodGate(req, CORS);
  if (gate) return gate;

  const q = new URL(req.url).searchParams;
  const u = q.get("u") || "";
  if (q.get("as") === "article") return article(req, u);
  const rule = (u.length <= MAX_QUERY_URL) ? fetchRelayRule(u) : null;
  if (!rule) return fail("not_allowed", 400);

  const limited = await callerGate(req, CORS, { scope: "fetch-relay", readerPerMin: READER_PER_MIN, env });
  if (limited) return limited;

  try {
    const r = await fetchGuarded(u, {
      timeoutMs: rule.timeoutMs,
      maxBytes: rule.maxBytes,
      contentTypeRe: rule.type,
      /* ⚠ A HOP IS ADMITTED BY THE SAME RULE AS THE FIRST REQUEST, not by any rule: a camera list
         that redirects has to land on a camera list. */
      allowRedirect: (next) => fetchRelayRule(next.toString(), { hop: true }) === rule,
      headers: {
        "user-agent": "IntMap/fetch-relay (+https://github.com/rwmqx7dwb5-arch/IntMap)",
        accept: "application/json, text/plain;q=0.9, */*;q=0.1",
      },
    });
    if (!r.ok) return goneOrFail(r.status);
    return new Response(r.bytes, {
      status: 200,
      headers: {
        ...CORS,
        "content-type": r.contentType,
        "x-content-type-options": "nosniff",
        "cache-control": "public, max-age=" + Math.min(rule.cacheSeconds, 3600) + ", s-maxage=" + rule.cacheSeconds,
      },
    });
  } catch (e) {
    return relayFail(e, { ...CORS, "cache-control": "no-store" });
  }
});

/* ══ ?u=<article URL>&as=article — the one rule without a host list (_shared/fetch-relay-policy.js) ══
   Every condition the policy file states, in order, and each one BEFORE anything is fetched:
   the URL's shape → the caller's bucket → the name's addresses → then the page, with every redirect
   hop's addresses checked again → then the answer has to be an article page by the page's own test. */
async function article(req, u) {
  if (u.length > MAX_QUERY_URL || !articleUrlAllowed(u)) return fail("not_allowed", 400);
  const limited = await callerGate(req, CORS, { scope: "fetch-relay-article", readerPerMin: ARTICLE_READER_PER_MIN, env });
  if (limited) return limited;
  const target = new URL(u);
  target.hash = "";
  if (!(await resolvesPublic(target.hostname))) return fail("not_allowed", 400);
  try {
    const r = await fetchGuarded(target.toString(), {
      timeoutMs: ARTICLE_RULE.timeoutMs,
      maxBytes: ARTICLE_RULE.maxBytes,
      contentTypeRe: ARTICLE_RULE.type,
      allowRedirect: async (next) => articleUrlAllowed(next.toString()) && await resolvesPublic(next.hostname),
      headers: {
        "user-agent": "IntMap/fetch-relay (+https://github.com/rwmqx7dwb5-arch/IntMap)",
        accept: "text/html,application/xhtml+xml;q=0.9",
      },
    });
    if (!r.ok) return goneOrFail(r.status);
    /* judged on a UTF-8 reading (the markers are ASCII, so any ASCII-compatible charset reads the
       same), handed back as the publisher's own bytes and content type so its charset survives */
    if (!looksLikeArticle(r.text())) return fail("not_an_article", 502);
    return new Response(r.bytes, {
      status: 200,
      headers: {
        ...CORS,
        "content-type": r.contentType,
        "x-content-type-options": "nosniff",
        /* the relayed page is never rendered from this origin, but say so anyway */
        "content-security-policy": "sandbox; default-src 'none'",
        "cache-control": "public, max-age=" + Math.min(ARTICLE_RULE.cacheSeconds, 3600) + ", s-maxage=" + ARTICLE_RULE.cacheSeconds,
      },
    });
  } catch (e) {
    return relayFail(e, { ...CORS, "cache-control": "no-store" });
  }
}
