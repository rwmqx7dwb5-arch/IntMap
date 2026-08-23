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
//      rate limit below is the only thing between an unauthenticated GET loop and an invoice. It
//      is best-effort by construction — see the note on `rateOk`.
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
//  Secrets: MAPBOX_TOKEN
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE, like news-relay, cable-geo and sv-cov — the repo's static
//  gate parses every committed .ts as plain JavaScript, so a `: string` here fails the build.
// ============================================================================

import { corsFor, fetchGuarded, methodGate, relayFail, MAX_QUERY_URL } from "../_shared/relay-guard.js";

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
   ⚠ BEST-EFFORT, AND SAID SO RATHER THAN IMPLIED. An Edge Function is not one long-lived process:
   Supabase may run several isolates and recycles them, so this Map is per-isolate and a caller
   spread across isolates gets more than 60 a minute, while a cold start forgets everyone. It is
   still worth having — it is what turns a single machine's GET loop from an invoice into a 429 —
   but it is NOT an accounting boundary, and the real ceiling remains the Mapbox account's own
   usage alerts. A distributed caller is out of its reach by construction.
   ⚠ AND A REQUEST WITH NO `x-forwarded-for` SHARES ONE BUCKET. That is deliberate: the failure
   direction of an unidentifiable caller should be «throttled with everyone else», not «exempt». */
const RATE_PER_MIN = 60;
const RATE_WINDOW_MS = 60000;
const RATE_IDLE_MS = 5 * 60000;
const RATE_MAX_KEYS = 4096;
const buckets = new Map();

function callerKey(req) {
  const xff = req.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0].trim() || "unknown";
}

function rateOk(key, now) {
  /* the Map is bounded: a sweep of the idle entries whenever it grows past the ceiling, so a burst
     of distinct addresses cannot walk the isolate into its memory limit through the limiter. */
  if (buckets.size > RATE_MAX_KEYS) {
    for (const [k, b] of buckets) if (now - b.at > RATE_IDLE_MS) buckets.delete(k);
  }
  let b = buckets.get(key);
  if (!b) { b = { tokens: RATE_PER_MIN, at: now }; buckets.set(key, b); }
  b.tokens = Math.min(RATE_PER_MIN, b.tokens + ((now - b.at) / RATE_WINDOW_MS) * RATE_PER_MIN);
  b.at = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

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
