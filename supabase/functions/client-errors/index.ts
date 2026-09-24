// ============================================================================
//  IntMap · client-errors — the one place a reader's browser reports an exception to  (client-error-log)
// ----------------------------------------------------------------------------
//  WHY: error monitoring was a Sentry loader in index.html that no DSN was ever configured for, so
//  it returned on its first line for every visit and nothing any reader's browser threw was recorded
//  anywhere. This function is what replaced it: js/client-error-report.js POSTs a scrubbed report
//  here (navigator.sendBeacon), and it is stored in public.client_errors — one row per distinct
//  defect, with a count — for the «Errors» tab of admin.html. No external account, no vendor.
//
//  WHAT STANDS IN FRONT OF IT (verify_jwt = false — a reader who is not signed in hits errors too):
//    · POST only; a body ceiling read with relay-guard's readCapped (content-length AND streamed).
//    · Origin: the production site or a local preview, and nothing else (client-error-shape.js).
//      ⚠ An Origin header can be forged by anything that is not a browser, so this keeps other
//      SITES' pages from writing here; it is not what bounds a scripted caller. That is:
//    · two SHARED token buckets (_shared/rate-limit.js → public.relay_take): one per caller, one
//      for the whole project per day. Both fail CLOSED — a limiter that cannot be consulted means
//      the database that would store the report is not answering either.
//    · a size ceiling on the TABLE (MAX_ROWS, enforced inside record_client_error): a new defect
//      is refused once it is full, a known one still counts.
//    · the report is scrubbed AGAIN here with the same function the browser used — the server does
//      not trust a client's scrubbing — and the fingerprint is computed HERE, never taken from the
//      body, so a caller cannot choose which row its report lands on.
//
//  ⚠ THE CALLER'S ADDRESS IS NOT STORED. The per-caller bucket is keyed by an HMAC of the address
//  under the service key, not by the address: relay_rate_buckets holds `key` in the clear and is
//  not swept on a schedule, and a table this function writes to must not become a list of readers'
//  IPs by the back door. The HMAC is one-way without the key and stable per address, which is all
//  a bucket needs. The User-Agent is reduced to a browser name and major version (browserOf).
//
//  Deploy:  supabase functions deploy client-errors --project-ref vpekfwdpurzejrrmacac --use-api
//
//  NOTE: written WITHOUT TypeScript annotations, like the other functions — the repo's static gate
//  parses every committed .ts as plain JavaScript.
// ============================================================================
import { corsFor, readCapped, RelayError } from "../_shared/relay-guard.js";
import { makeLimiter, restRpcClient } from "../_shared/rate-limit.js";
import {
  MAX,
  MAX_PER_REQUEST,
  browserOf,
  fingerprint,
  originAllowed,
  shapeReport,
} from "../_shared/client-error-shape.js";

/* THE NUMBERS (.agents/rules/no-ad-hoc-hardcoding.md §4 — observation, expiry, canonical place):
   · MAX_BODY_BYTES = 64 KiB. Derived: MAX_PER_REQUEST reports × (MAX.message + MAX.stack) characters
     = 45,000, with room for JSON escaping of a stack's quotes and backslashes. It is also the
     sendBeacon quota browsers enforce per page (64 KiB in flight), so no honest client can send more.
     Expires with MAX_PER_REQUEST or MAX, which are the canonical numbers it is derived from.
   · PER_CALLER = 30 per hour. A page load sends at most MAX_PER_SESSION (10) reports, so 30 is three
     broken loads in a row reported in full, refilled hourly. An ESTIMATE — there is no record yet of
     how readers' sessions fail, which is the record this function builds. Expires when
     client_errors shows real sessions refused at this bucket.
   · GLOBAL_PER_DAY = 5,000 reports. An estimate of the same kind: well above any error rate a
     working release produces, and low enough that one scripted caller cycling addresses cannot turn
     the table into a write-amplifier for the database. Raised on purpose via
     CLIENT_ERRORS_GLOBAL_PER_DAY, never by editing code.
   · MAX_ROWS = 10,000 distinct defects. A row is ≤ ~5 KB (MAX), so the table is bounded at ~50 MB
     whatever is sent; 10,000 distinct defects inside the 30-day retention is far past anything an
     operator could read. Expires if the Errors tab ever shows the table full of real defects. */
export const MAX_BODY_BYTES = 64 * 1024;
export const PER_CALLER = 30;
export const MAX_ROWS = 10000;
function envCeiling(name, fallback) {
  const v = Number(Deno.env.get(name) || "");
  return (Number.isFinite(v) && v >= 1) ? Math.floor(v) : fallback;
}
export const GLOBAL_PER_DAY = envCeiling("CLIENT_ERRORS_GLOBAL_PER_DAY", 5000);
const SCOPE_CALLER = "client-errors:caller";
const SCOPE_GLOBAL_DAY = "client-errors:global:day";

/* CORS for an ALLOWED origin only — the origin is echoed, never `*`, and a disallowed origin gets
   no Access-Control-Allow-Origin at all, so a page on another site cannot even read the refusal.
   ⚠ THE ALLOWED REQUEST HEADERS ARE THE SHARED BUILDER'S (_shared/relay-guard.js corsFor), not a
   list of this function's own. The first version wrote "content-type" alone; the reporter sends
   nothing else, but every function answers the same base set (authorization, x-client-info, apikey,
   content-type) because a caller that goes through supabase-js — or a later caller of this one —
   attaches those, and a header missing from the preflight answer fails the request before it is
   sent, with no status to say why (#R318/#R333; tests/r345 reads this contract out of every
   function). Only the ORIGIN and the METHODS are this function's: it takes POST from two origins. */
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

/* The per-caller bucket key: HMAC-SHA-256(service key, address), 32 hex digits. A request with no
   x-forwarded-for shares one bucket with every other such request — the failure direction of an
   unidentifiable caller is «throttled with everyone else», the rule routing-relay states. */
export async function callerKey(req, secret) {
  const addr = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(secret || "no-secret")),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const d = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(addr)));
  let hex = "";
  for (let i = 0; i < 16; i++) hex += d[i].toString(16).padStart(2, "0");
  return hex;
}

/* The request, validated and shaped. Returns { reports } or { error, status }. */
export async function parseBody(bytes, ua) {
  let body = null;
  try { body = JSON.parse(new TextDecoder("utf-8").decode(bytes)); } catch (_) { body = null; }
  if (!body || typeof body !== "object" || !Array.isArray(body.errors)) return { error: "invalid_request", status: 400 };
  if (body.errors.length < 1 || body.errors.length > MAX_PER_REQUEST) return { error: "invalid_request", status: 400 };
  const ctx = { release: body.release, path: body.path };
  const browser = browserOf(ua).slice(0, MAX.browser);
  const reports = [];
  for (const raw of body.errors) {
    if (!raw || typeof raw !== "object") return { error: "invalid_request", status: 400 };
    const shaped = shapeReport(raw, ctx);
    if (!shaped) continue;                         // benign / empty: accepted and not stored
    reports.push({ ...shaped, browser, fingerprint: await fingerprint(shaped) });
  }
  return { reports };
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
  const parsed = await parseBody(bytes, req.headers.get("user-agent") || "");
  if (parsed.error) return say(cors, { error: parsed.error }, parsed.status);
  if (!parsed.reports.length) return say(cors, { accepted: 0 }, 202);

  /* The client is built per request from the platform-injected env (a module that throws on a
     missing env answers 500 to everyone — #R505). */
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const db = restRpcClient({ url: Deno.env.get("SUPABASE_URL") || "", serviceKey });
  const limiter = makeLimiter({ db });
  const n = parsed.reports.length;
  const caller = await limiter.take(SCOPE_CALLER, await callerKey(req, serviceKey), {
    capacity: PER_CALLER, refillPerSec: PER_CALLER / 3600, cost: n, onUnavailable: "deny",
  });
  if (caller.source !== "db") return say(cors, { error: "limiter_unavailable" }, 503);
  if (!caller.allowed) return say(cors, { error: "rate_limit" }, 429);
  const day = await limiter.take(SCOPE_GLOBAL_DAY, "*", {
    capacity: GLOBAL_PER_DAY, refillPerSec: GLOBAL_PER_DAY / 86400, cost: n, onUnavailable: "deny",
  });
  if (day.source !== "db") return say(cors, { error: "limiter_unavailable" }, 503);
  if (!day.allowed) return say(cors, { error: "rate_limit" }, 429);

  const outcome = { inserted: 0, counted: 0, full: 0, failed: 0 };
  for (const r of parsed.reports) {
    const res = await db.rpc("record_client_error", {
      p_fingerprint: r.fingerprint,
      p_kind: r.kind,
      p_message: r.message,
      p_stack: r.stack,
      p_path: r.path,
      p_release: r.release,
      p_browser: r.browser,
      p_max_rows: MAX_ROWS,
    });
    const verdict = (res && !res.error) ? String(res.data) : "failed";
    outcome[verdict in outcome ? verdict : "failed"]++;
  }
  if (outcome.failed === n) return say(cors, { error: "unavailable" }, 503);
  return say(cors, { accepted: n, ...outcome }, 202);
}

Deno.serve(handle);
