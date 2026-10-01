// ============================================================================
//  IntMap · usage-count — the one place a reader's browser adds to IntMap's anonymous usage counters  (anonymous-usage-counts)
// ----------------------------------------------------------------------------
//  WHY: the operator decided (2026-10-01) to measure what marketing reaches with IntMap's OWN aggregate
//  counters and nothing else — no cookie, no analytics vendor, no IP, no person. js/usage-counts.js
//  batches a page load's counts and sends them here (navigator.sendBeacon when the page is hidden);
//  this function validates them against the ONE declaration (./shape.js) and adds them to
//  public.usage_counts — (day, metric, dimension) → count — through record_usage_counts.
//
//  WHAT IS STORED, AND WHAT IS NOT:
//    stored · a count per (server UTC day, declared metric, dimension the metric's rule accepts)
//    never  · the request's IP address (the per-caller bucket is keyed by an HMAC of it under the
//             service key — _shared/rate-limit.js hashedCallerKey, the rule client-errors uses)
//           · the User-Agent (not read at all — the device class is a two-valued dimension)
//           · a user id or session (this function verifies no account and reads no Authorization)
//           · a time finer than the day, any key or position of the body other than the three of
//             each row (shape.js `parse`), a metric that is not declared, a dimension that is refused.
//
//  WHAT STANDS IN FRONT OF IT (verify_jwt = false — a reader who is not signed in is counted too):
//    · POST only; a body ceiling read with relay-guard's readCapped (content-length AND streamed);
//    · the Origin allow-list client-errors uses (_shared/client-error-shape.js originAllowed);
//    · two SHARED token buckets (_shared/rate-limit.js → public.relay_take): per caller and per
//      project-day, both failing CLOSED;
//    · a per-day ceiling on the DISTINCT dimensions of each metric (shape.js `maxDims`), enforced
//      inside record_usage_counts — the bound on what a scripted caller can add to the table.
//
//  Deploy:  supabase functions deploy usage-count --project-ref vpekfwdpurzejrrmacac --use-api
//
//  NOTE: written WITHOUT TypeScript annotations, like the other functions — the repo's static gate
//  parses every committed .ts as plain JavaScript.
// ============================================================================
import { corsFor, readCapped, RelayError } from "../_shared/relay-guard.js";
import { makeLimiter, restRpcClient, hashedCallerKey } from "../_shared/rate-limit.js";
import { originAllowed } from "../_shared/client-error-shape.js";
import { MAX_ROWS_PER_REQUEST, parse } from "./shape.js";

/* THE NUMBERS (.agents/rules/no-ad-hoc-hardcoding.md §4 — observation, expiry, canonical place):
   · MAX_BODY_BYTES = 16 KiB. Derived: MAX_ROWS_PER_REQUEST (64) rows × at most ~110 characters each
     (a 12-character metric, a 64-character dimension, the count and the JSON punctuation) = ~7 KB,
     doubled for escaping. Expires with MAX_ROWS_PER_REQUEST or the dimension rules in shape.js.
   · PER_CALLER = 120 requests per hour. A page load sends one request when it is hidden (two or three
     when the reader switches tabs and comes back), so 120 is dozens of page loads an hour from one
     address — an office behind one NAT included. An ESTIMATE: no record yet of how readers' sessions
     flush, which is the record this builds. Expires when requests are refused at this bucket in
     numbers the admin console's page views do not explain.
   · GLOBAL_PER_DAY = 100,000 requests. An estimate of the same kind: well above any traffic IntMap
     has had, and low enough that a scripted caller cycling addresses cannot turn the counters into a
     write-amplifier for the database. Raised on purpose via USAGE_COUNT_GLOBAL_PER_DAY, never by
     editing code. */
export const MAX_BODY_BYTES = 16 * 1024;
export const PER_CALLER = 120;
function envCeiling(name, fallback) {
  const v = Number(Deno.env.get(name) || "");
  return (Number.isFinite(v) && v >= 1) ? Math.floor(v) : fallback;
}
export const GLOBAL_PER_DAY = envCeiling("USAGE_COUNT_GLOBAL_PER_DAY", 100000);
const SCOPE_CALLER = "usage-count:caller";
const SCOPE_GLOBAL_DAY = "usage-count:global:day";
export { MAX_ROWS_PER_REQUEST };

/* CORS for an ALLOWED origin only — echoed, never `*`. The allowed request headers are the shared
   builder's (_shared/relay-guard.js corsFor), for the reason client-errors gives (#R318/#R333). */
function corsForOrigin(origin) {
  if (!originAllowed(origin)) return { vary: "Origin" };
  return {
    ...corsFor(),
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    vary: "Origin",
  };
}

function say(cors, body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
}

/* The per-caller bucket key: HMAC-SHA-256(service key, address) — the address itself is never written
   anywhere. No account is passed: this function verifies none, so a signed-in reader is keyed and
   counted exactly like a signed-out one. */
export async function callerKey(req, secret) {
  return hashedCallerKey(req, secret);
}

/** The request body, validated and shaped. { rows } | { error, status }. */
export function parseBody(bytes) {
  const r = parse(new TextDecoder("utf-8").decode(bytes));
  return r.error ? { error: r.error, status: 400 } : { rows: r.rows };
}

export async function handle(req) {
  const origin = req.headers.get("origin") || "";
  const cors = corsForOrigin(origin);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: originAllowed(origin) ? 204 : 403, headers: cors });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...cors, "content-type": "application/json", allow: "POST, OPTIONS" },
    });
  }
  if (!originAllowed(origin)) return say(cors, { error: "origin_not_allowed" }, 403);

  let bytes;
  try {
    bytes = await readCapped(req, MAX_BODY_BYTES);
  } catch (e) {
    return (e instanceof RelayError) ? say(cors, { error: "too_large" }, 413) : say(cors, { error: "invalid_request" }, 400);
  }
  const parsed = parseBody(bytes);
  if (parsed.error) return say(cors, { error: parsed.error }, parsed.status);
  if (!parsed.rows.length) return say(cors, { accepted: 0 }, 202);

  /* built per request from the platform-injected env (a module that throws on a missing env answers
     500 to everyone — #R505) */
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const db = restRpcClient({ url: Deno.env.get("SUPABASE_URL") || "", serviceKey });
  const limiter = makeLimiter({ db });
  const caller = await limiter.take(SCOPE_CALLER, await callerKey(req, serviceKey), {
    capacity: PER_CALLER, refillPerSec: PER_CALLER / 3600, cost: 1, onUnavailable: "deny",
  });
  if (caller.source !== "db") return say(cors, { error: "limiter_unavailable" }, 503);
  if (!caller.allowed) return say(cors, { error: "rate_limit" }, 429);
  const day = await limiter.take(SCOPE_GLOBAL_DAY, "*", {
    capacity: GLOBAL_PER_DAY, refillPerSec: GLOBAL_PER_DAY / 86400, cost: 1, onUnavailable: "deny",
  });
  if (day.source !== "db") return say(cors, { error: "limiter_unavailable" }, 503);
  if (!day.allowed) return say(cors, { error: "rate_limit" }, 429);

  /* ONE call for the whole batch: the rows are added in one statement per row inside one transaction,
     so a request is counted whole or not at all. `cap` is the server's own ceiling from shape.js —
     the body never supplies it. */
  const res = await db.rpc("record_usage_counts", {
    p_rows: parsed.rows.map((r) => ({ m: r.m, d: r.d, n: r.n, cap: r.cap })),
  });
  if (!res || res.error) return say(cors, { error: "unavailable" }, 503);
  const counted = Number(res.data) || 0;
  return say(cors, { accepted: parsed.rows.length, counted, full: parsed.rows.length - counted }, 202);
}

Deno.serve(handle);
