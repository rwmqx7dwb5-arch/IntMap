// ============================================================================
//  IntMap · routing-relay  —  Mapbox Directions, keyed  (Supabase Edge Function, Deno)
// ----------------------------------------------------------------------------
//  WHY THIS EXISTS (#R347 — §5 「現在の『リアルタイム交通量は未反映』という状態を、本当に解消できる
//  Providerが利用可能な環境では解消してください。」):
//
//  Every router this app had is keyless and none of them knows about traffic. A router that does
//  needs a key, and a key in a public repository's JavaScript is not a key — it is a bill anybody
//  can run up. So the key lives HERE, in the function's secrets, and the page asks this endpoint.
//
//  ⚠ WHICH VENDOR, AND WHY, IS DECIDED IN js/routing-providers.js — the capability table is the
//  canonical statement of what Mapbox may and may not do here (the licence review that ruled out
//  the Google Routes API is written out there, once). What this file owns is the three of those
//  terms that are the SERVER's to enforce:
//
//    · §2.10.1 forbids exporting, downloading, CACHING or storing the result of a Navigation API
//      request. Every other relay in this repo answers with `s-maxage` because a shared cache is
//      how one caller-sized request stops being forty upstream-sized ones. ⚠ THIS ONE MUST NOT.
//      `Cache-Control: no-store` is on every response below, including the failures, and it is a
//      licence term rather than a performance choice — do not "optimise" it away.
//    · the profile, and every query parameter, is an ALLOW-LIST. A relay with a key on it is the
//      one kind of relay that must not be able to become an open proxy: an `access_token` arriving
//      in the query is DISCARDED rather than forwarded, so no caller can bill a different account
//      (or probe ours) through this endpoint.
//    · ⚠ MAPBOX HAS NO HARD SPEND CAP. There is no dashboard switch that stops the meter, so the
//      limits below are the only thing between an unauthenticated GET loop and an invoice. Two
//      stages: a per-isolate Map that answers without a round trip, and — the accounting boundary
//      the Map cannot be (#R801) — shared buckets in Postgres, per caller AND for the whole
//      project, taken from right before the paid call. See «THE SPEND CEILING».
//
//  ENDPOINTS (GET only):
//    ?probe=1
//        → 200 {"ok":true,"providers":{"mapbox":true|false}} — whether a key is CONFIGURED, and
//          nothing else. js/routing-traffic.js turns this into IntMapRouteProviders.setAvailable(),
//          which is what stops the UI offering a traffic option it cannot serve (§57).
//    ?provider=mapbox&profile=<p>&coords=<lng,lat;lng,lat…>&<allow-listed params>
//        → the Mapbox Directions JSON, unaltered.
//    ?provider=mapbox&refresh=1&routeId=<uuid>&routeIndex=<n>&legIndex=<n>
//        → the Mapbox Directions-Refresh JSON, unaltered (§16 route refresh).
//
//  Deploy: supabase functions deploy routing-relay --no-verify-jwt --project-ref vpekfwdpurzejrrmacac
//  Secrets: MAPBOX_TOKEN  (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform;
//           ROUTING_RELAY_GLOBAL_PER_MIN / ROUTING_RELAY_GLOBAL_PER_DAY are optional overrides)
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE, like news-relay, cable-geo and sv-cov — the repo's static
//  gate parses every committed .ts as plain JavaScript, so a `: string` here fails the build.
// ============================================================================

import { corsFor, fetchGuarded, methodGate, relayFail, MAX_QUERY_URL } from "../_shared/relay-guard.js";
import { makeLimiter, restRpcClient } from "../_shared/rate-limit.js";

const CORS = corsFor();
/* ⚠ THE LICENCE HEADER. Not tuning — see §2.10.1 in the note above. */
const NO_STORE = "no-store";
/* A Directions answer with three alternatives, full geometry, steps, banners and voice is a few
   hundred kilobytes. Four megabytes is an order of magnitude of headroom and still a bound. */
const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 20000;

/* ══ THE ALLOW-LISTS ═══════════════════════════════════════════════════════════════════════════ */

/* the four profiles this app routes on. `mapbox/driving-traffic` is the only one that carries
   congestion; the others are here because walking and cycling are modes the panel offers. */
const PROFILES = new Set([
  "mapbox/driving-traffic",
  "mapbox/driving",
  "mapbox/walking",
  "mapbox/cycling",
]);

/* Everything the page may ask for. ⚠ ANYTHING ELSE IS DROPPED IN SILENCE rather than refused: a
   caller that adds a parameter we have not reviewed gets the route it asked for without it, which
   is the behaviour that keeps this from becoming a general Mapbox proxy. `access_token` is in
   nobody's list — it is deleted below before this map is even consulted. */
const PASS = new Set([
  "alternatives", "geometries", "overview", "steps", "annotations", "language", "exclude",
  "depart_at", "arrive_by", "waypoints", "radiuses", "bearings", "continue_straight",
  "banner_instructions", "voice_instructions", "roundabout_exits", "enable_refresh",
  "walking_speed", "max_height", "max_width", "max_weight",
]);

/* A parameter value is a locale, a flag, a number or a list of them — never a payload. `+` and `:`
   are here for `depart_at=2026-08-23T09:00:00+00:00`, `;` and `,` for the per-waypoint lists
   (`bearings`, `radiuses`, `waypoints`, `annotations`). */
const VALUE_RE = /^[A-Za-z0-9_.,;:+-]{1,512}$/;

/* `exclude` is the one value that is not in that shape: Mapbox takes road classes AND up to fifty
   `point(<lng> <lat>)` exclusions, which carry a space and brackets. So it gets its own grammar
   rather than a loosened character class, and is rebuilt from the tokens that passed it. */
const EXCLUDE_WORDS = new Set(["motorway", "toll", "ferry", "unpaved", "cash_only_tolls"]);
const EXCLUDE_POINT = /^point\(\s*(-?\d{1,3}(?:\.\d{1,7})?)\s+(-?\d{1,2}(?:\.\d{1,7})?)\s*\)$/;
const EXCLUDE_MAX = 50;

/* the coordinate list: `lng,lat;lng,lat…`, 2 to 25 points (Mapbox's own ceiling, and the number
   js/routing-providers.js declares as `maxWaypoints`). */
const COORD_MIN = 2;
const COORD_MAX = 25;

/* refresh takes the response `uuid` Mapbox minted for the route set, and two small indices. */
const ROUTE_ID_RE = /^[A-Za-z0-9_.-]{1,128}$/;
const INDEX_RE = /^\d{1,2}$/;

/* ══ THE SPEND CEILING ═════════════════════════════════════════════════════════════════════════
   Two stages, because they answer two different questions.

   STAGE 1 — THE MAP (per isolate, no round trip). An Edge Function is not one long-lived process:
   Supabase may run several isolates and recycles them, so this Map is per-isolate and a caller
   spread across isolates gets more than 60 a minute, while a cold start forgets everyone. It is
   still worth having — it answers a single machine's GET loop with a 429 before a byte goes to the
   database — but it is NOT an accounting boundary, and until #R801 nothing else was either.
   ⚠ A REQUEST WITH NO `x-forwarded-for` SHARES ONE BUCKET. That is deliberate: the failure
   direction of an unidentifiable caller should be «throttled with everyone else», not «exempt».

   STAGE 2 — THE SHARED BUCKETS (Postgres, `public.relay_take`, _shared/rate-limit.js), taken from
   right before the paid call and only there — a probe or a malformed request never reaches them.
   Three buckets, in this order:
     · routing-relay:ip           — the same 60/min as the Map, but counted across every isolate.
                                    Fails OPEN when the database does not answer: the Map above has
                                    already throttled this caller as well as one isolate can, and
                                    the two buckets below are still in front of the paid call.
     · routing-relay:global:minute
     · routing-relay:global:day   — THE PROJECT-WIDE CEILING. Both fail CLOSED: a limiter that
                                    cannot be consulted cannot say the invoice is bounded, so the
                                    paid call is not made (503 `limiter_unavailable`). A refusal by
                                    either is 429 `spend_ceiling`, which is a different fact from
                                    `rate_limit` (that caller is fast) even though the page treats
                                    both as PROVIDER_RATE_LIMIT.

   THE NUMBERS (no-ad-hoc-hardcoding §4 — observation, expiry, canonical place):
     · GLOBAL_PER_DAY = 3000. Observation: the Mapbox Directions API price list read 2026-09-18
       grants 100,000 requests a month before the meter starts; 3,000 a day is 90,000–93,000 a
       month, i.e. the whole free allowance with a few days' margin, and the per-IP rate of 60/min
       means one honest user cannot spend more than 2% of a day. Expires when the price list
       changes, or when the product has more routing than that — then the number goes up ON
       PURPOSE (via ROUTING_RELAY_GLOBAL_PER_DAY, without a deploy), because the ceiling is a
       statement of what the project has agreed to pay, not a guess at demand.
     · GLOBAL_PER_MIN = 300. The day bucket is the accounting; this one is the brake that keeps a
       distributed loop from spending the whole day in the first minutes (300/min would still
       drain 3,000 in ten). 300 = five callers at the full per-IP rate at once, which is more
       concurrency than the routing panel has ever been observed to have. Expires with the per-IP
       rate or the day ceiling, both of which it is derived from.
     · RATE_PER_MIN = 60 is unchanged from #R347: one route request per second is faster than any
       drag of a waypoint can be issued, and js/routing-traffic.js debounces its refreshes.
     The canonical place for all three is THIS FILE; the environment may raise or lower the two
     global ones (a positive integer; anything else is ignored) but never define them. */
const RATE_PER_MIN = 60;
const RATE_WINDOW_MS = 60000;
const RATE_IDLE_MS = 5 * 60000;
const RATE_MAX_KEYS = 4096;
const buckets = new Map();

/* A positive integer from the environment, or the default. Read once, at module evaluation, like
   every other constant here — a limit that could change between two requests of one isolate would
   not be a limit anyone could reason about. */
function envCeiling(name, fallback) {
  const v = Number(Deno.env.get(name) || "");
  return (Number.isFinite(v) && v >= 1) ? Math.floor(v) : fallback;
}
const GLOBAL_PER_MIN = envCeiling("ROUTING_RELAY_GLOBAL_PER_MIN", 300);
const GLOBAL_PER_DAY = envCeiling("ROUTING_RELAY_GLOBAL_PER_DAY", 3000);
const SCOPE_IP = "routing-relay:ip";
const SCOPE_GLOBAL_MINUTE = "routing-relay:global:minute";
const SCOPE_GLOBAL_DAY = "routing-relay:global:day";

function callerKey(req) {
  const xff = req.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0].trim() || "unknown";
}

/* ⚠ THE MAP KEEPS ITS DECLARED SIZE. Before #R801 the only pressure valve was a sweep of IDLE
   entries when the Map grew past RATE_MAX_KEYS — and a burst of distinct addresses inside one idle
   window is exactly the case where nothing is idle, so nothing was deleted (reproduced: 10,000
   identifiers at one instant, 10,000 retained). Now, when the sweep does not make room, the
   least-recently-seen entries go. The Map is kept in recency order — every touch re-inserts its
   key, so iteration order IS «oldest first» — and the entry that goes is one that has not been
   seen for longer than anyone else's, which is the entry the sweep would have taken next anyway.
   An evicted caller is a caller who starts a fresh bucket, i.e. is treated as new; the shared
   buckets in stage 2 are what stop that from being a way around the limit. */
function rateOk(key, now) {
  let b = buckets.get(key);
  if (b) {
    buckets.delete(key);                        /* re-inserted below, at the recent end */
  } else {
    if (buckets.size >= RATE_MAX_KEYS) {
      for (const [k, e] of buckets) if (now - e.at > RATE_IDLE_MS) buckets.delete(k);
      while (buckets.size >= RATE_MAX_KEYS) buckets.delete(buckets.keys().next().value);
    }
    b = { tokens: RATE_PER_MIN, at: now };
  }
  buckets.set(key, b);
  b.tokens = Math.min(RATE_PER_MIN, b.tokens + ((now - b.at) / RATE_WINDOW_MS) * RATE_PER_MIN);
  b.at = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

/* Stage 2, in the order the header states. Returns null to carry on, or the Response to send.
   ⚠ CALLED IN EXACTLY ONE PLACE — immediately before fetchGuarded — so that «a token was taken»
   and «Mapbox was asked» cannot drift apart: a request refused for its shape costs nothing, and a
   request that costs something has passed every bucket. The client is built per request from the
   platform-injected env, the way ai-proxy does, and not at module level, because a module that
   throws on a missing env answers 500 to everyone (#R505). */
async function spendOk(key) {
  const db = restRpcClient({
    url: Deno.env.get("SUPABASE_URL") || "",
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  });
  const limiter = makeLimiter({ db });
  const ip = await limiter.take(SCOPE_IP, key, {
    capacity: RATE_PER_MIN, refillPerSec: RATE_PER_MIN / 60, cost: 1, onUnavailable: "allow",
  });
  if (!ip.allowed) return fail("rate_limit", 429);
  const minute = await limiter.take(SCOPE_GLOBAL_MINUTE, "*", {
    capacity: GLOBAL_PER_MIN, refillPerSec: GLOBAL_PER_MIN / 60, cost: 1, onUnavailable: "deny",
  });
  if (minute.source !== "db") return fail("limiter_unavailable", 503);
  if (!minute.allowed) return fail("spend_ceiling", 429);
  const day = await limiter.take(SCOPE_GLOBAL_DAY, "*", {
    capacity: GLOBAL_PER_DAY, refillPerSec: GLOBAL_PER_DAY / 86400, cost: 1, onUnavailable: "deny",
  });
  if (day.source !== "db") return fail("limiter_unavailable", 503);
  if (!day.allowed) return fail("spend_ceiling", 429);
  return null;
}

/* Exported for tests/r801-relay-spend-checks.test.mjs, which evaluates this module (with
   Deno.serve stubbed) rather than reading it — the Map's bound is a property of running code. */
export { rateOk, buckets, RATE_MAX_KEYS, RATE_PER_MIN, GLOBAL_PER_MIN, GLOBAL_PER_DAY };

/* ══ VALIDATION ════════════════════════════════════════════════════════════════════════════════ */

/* Parsed, range-checked and REBUILT from the numbers — the string that reaches Mapbox is one this
   function composed, not one a caller supplied, so there is nothing in it to smuggle. */
function coordPath(raw) {
  const parts = String(raw || "").split(";");
  if (parts.length < COORD_MIN || parts.length > COORD_MAX) return null;
  const out = [];
  for (const p of parts) {
    const m = /^(-?\d{1,3}(?:\.\d{1,7})?),(-?\d{1,2}(?:\.\d{1,7})?)$/.exec(p);
    if (!m) return null;
    const lng = Number(m[1]);
    const lat = Number(m[2]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
    out.push(lng + "," + lat);
  }
  return out.join(";");
}

function excludeValue(raw) {
  const parts = String(raw || "").split(",");
  if (!parts.length || parts.length > EXCLUDE_MAX) return null;
  const out = [];
  for (const p of parts) {
    const t = p.trim();
    if (EXCLUDE_WORDS.has(t)) { out.push(t); continue; }
    const m = EXCLUDE_POINT.exec(t);
    if (!m) return null;
    const lng = Number(m[1]);
    const lat = Number(m[2]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
    out.push("point(" + lng + " " + lat + ")");
  }
  return out.join(",");
}

/* ══ ANSWERING ═════════════════════════════════════════════════════════════════════════════════ */

function say(body, status) {
  return new Response(body, {
    status: status || 200,
    headers: { ...CORS, "content-type": "application/json", "cache-control": NO_STORE },
  });
}
function fail(code, status) { return say(JSON.stringify({ error: code }), status); }

/* An upstream status, as one of THIS function's codes. ⚠ THE UPSTREAM BODY IS NEVER THE ANSWER —
   a Mapbox error document names the account and the token state (CodeQL js/stack-trace-exposure,
   and the reason relayFail exists at all). Only the mapping below crosses back. */
function fromUpstream(status) {
  if (status === 401 || status === 403) return ["provider_unavailable", 502];
  if (status === 429) return ["rate_limit", 429];
  if (status === 404) return ["no_route", 404];
  if (status >= 500) return ["provider_unavailable", 502];
  /* 400 / 422 and the rest of the 4xx family: the request was wrong, which the caller can act on. */
  return ["invalid_request", 400];
}

// NOTE: written WITHOUT TypeScript annotations, like news-relay and cable-geo — the repo's static
// gate parses every committed .ts as plain JavaScript, so a type annotation here fails the build.
Deno.serve(async (req) => {
  const gate = methodGate(req, CORS);
  if (gate) return gate;

  const url = new URL(req.url);
  const q = url.searchParams;
  if (url.search.length > MAX_QUERY_URL) return fail("invalid_request", 400);

  if (!rateOk(callerKey(req), Date.now())) return fail("rate_limit", 429);

  /* ⚠ THE KEY, AND ONLY FROM THE ENVIRONMENT. Nothing below ever puts it in a response, a header
     or an error; `probe` answers whether it is set, which is the one fact the page needs. */
  const token = Deno.env.get("MAPBOX_TOKEN") || "";

  if (q.get("probe")) {
    return say(JSON.stringify({ ok: true, providers: { mapbox: !!token } }));
  }

  if (q.get("provider") !== "mapbox") return fail("invalid_request", 400);
  if (!token) return fail("provider_unavailable", 502);

  let upstream;
  if (q.get("refresh")) {
    /* Directions-Refresh exists only for the traffic profile — it re-reads the congestion of a
       route that has already been computed, which is what makes it cheap enough to call while
       navigating. The route set is identified by the `uuid` the original answer carried. */
    const routeId = q.get("routeId") || "";
    const routeIndex = q.get("routeIndex") || "0";
    const legIndex = q.get("legIndex") || "0";
    if (!ROUTE_ID_RE.test(routeId) || !INDEX_RE.test(routeIndex) || !INDEX_RE.test(legIndex)) {
      return fail("invalid_request", 400);
    }
    upstream = new URL("https://api.mapbox.com/directions-refresh/v1/mapbox/driving-traffic/"
      + routeId + "/" + routeIndex + "/" + legIndex);
  } else {
    const profile = q.get("profile") || "";
    if (!PROFILES.has(profile)) return fail("invalid_request", 400);
    const coords = coordPath(q.get("coords"));
    if (!coords) return fail("invalid_request", 400);
    upstream = new URL("https://api.mapbox.com/directions/v5/" + profile + "/" + coords);
    for (const [k, v] of q) {
      if (!PASS.has(k)) continue;                 /* including `access_token`: dropped, never forwarded */
      if (k === "exclude") {
        const ex = excludeValue(v);
        if (ex === null) return fail("invalid_request", 400);
        upstream.searchParams.set(k, ex);
        continue;
      }
      if (!VALUE_RE.test(v)) return fail("invalid_request", 400);
      upstream.searchParams.set(k, v);
    }
  }
  upstream.searchParams.set("access_token", token);

  /* the shared buckets, and nothing paid before them (see «THE SPEND CEILING») */
  const refused = await spendOk(callerKey(req));
  if (refused) return refused;

  try {
    const r = await fetchGuarded(upstream.toString(), {
      timeoutMs: TIMEOUT_MS,
      maxBytes: MAX_BYTES,
      contentTypeRe: /json/i,
      headers: {
        "user-agent": "IntMap/routing-relay (+https://github.com/rwmqx7dwb5-arch/IntMap)",
        accept: "application/json",
      },
    });
    if (!r.ok) {
      const m = fromUpstream(r.status);
      return fail(m[0], m[1]);
    }
    /* ⚠ PASSED THROUGH UNALTERED, INCLUDING `code: "NoRoute"`. Mapbox answers «there is no route
       here» with HTTP 200 and a code in the body; rewriting that into a 4xx would lose the
       waypoints it returns alongside, and js/routing-traffic.js reads the code directly. */
    return say(r.text());
  } catch (e) {
    /* ⚠ A CODE, NOT THE EXCEPTION — this endpoint is world-readable and its upstream is a keyed
       one, so a message could name the host, the token state or this file's internals. */
    return relayFail(e, { ...CORS, "cache-control": NO_STORE });
  }
});
