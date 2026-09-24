// ============================================================================
//  IntMap · _shared/rate-limit.js — a token bucket that every isolate of a relay shares
// ----------------------------------------------------------------------------
//  WHY (#R801, external audit): a public relay that holds a paid key had, as its whole spend
//  control, an in-process Map of per-IP buckets. Supabase runs an Edge Function as several isolates
//  and recycles them, so that Map was per-isolate and per-lifetime — a caller spread across isolates
//  got several times the stated rate, a cold start forgot everyone, and no number anywhere bounded
//  the PROJECT. The bucket has to live somewhere every isolate can reach and no caller can: the
//  database, behind the SECURITY DEFINER function `public.relay_take` (migration
//  20260918100000_r801_relay_rate_limit.sql), which does the refill + deduction under a row lock so
//  two isolates cannot both be told «yes» for the last token.
//
//  WHAT THIS FILE OWNS is the Deno side of that: one call per take, and — the part that needs
//  saying out loud — WHAT HAPPENS WHEN THE DATABASE DOES NOT ANSWER. There are two honest
//  directions and a relay needs both, for different buckets:
//
//    · 'deny'  — fail CLOSED. The bucket exists to bound an invoice; a limiter that cannot be
//                consulted cannot say the invoice is bounded, so the paid call is not made. This is
//                the direction for the PROJECT-WIDE bucket: a database outage costs a few minutes of
//                routing, whereas open-on-outage would make the outage the moment the ceiling is
//                gone — and a limiter whose failure mode is «no limit» is the thing the audit found.
//    · 'allow' — fail OPEN, because something else already decided. This is the direction for a
//                PER-CALLER bucket in a relay that still keeps its cheap in-process Map as the
//                first stage: the Map has already throttled this caller as well as one isolate can,
//                and the project-wide bucket (deny) is still in front of the paid call. Refusing
//                here would add nothing but a second reason to refuse.
//
//  The choice is an argument of every take, not a property of the limiter, so the two directions
//  cannot be confused by which limiter instance a relay happened to build.
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE — the repo's static gate parses every committed .ts/.js as
//  plain JavaScript (see relay-guard.js).
// ============================================================================

/* How long a take may wait for the database before it counts as «did not answer». Observation
   (2026-09-18): a same-region PostgREST RPC from an Edge Function answers in tens of milliseconds;
   the paid upstream behind these relays is given 20 s. Three seconds is two orders of magnitude of
   headroom for the limiter and still short enough that a stalled database does not turn every
   routing request into a 20 s hang. Expires if the RPC is ever observed slower than that in
   normal operation — then this number, not the fail direction, is what to revisit. */
const RPC_TIMEOUT_MS = 3000;

/* The rows relay_take returns come back from PostgREST as an array (it is a set-returning
   function); supabase-js hands the same array through as `data`. One row is the answer. */
function firstRow(data) {
  if (Array.isArray(data)) return data[0] || null;
  return (data && typeof data === "object") ? data : null;
}

/* A minimal RPC client with the same `rpc(name, args) → { data, error }` shape as supabase-js,
   built on fetch so a relay that has no other dependency does not acquire one (and a deno.json)
   just to take a token. PostgREST's RPC endpoint is what supabase-js calls for `.rpc()` too —
   `apikey` + `Authorization: Bearer <service key>` is the service-role identity, which is the only
   role relay_take is granted to. A relay that already has a supabase-js client may pass it to
   makeLimiter directly instead. */
export function restRpcClient({ url, serviceKey, timeoutMs }) {
  const base = String(url || "").replace(/\/+$/, "");
  const key = String(serviceKey || "");
  const wait = (timeoutMs > 0) ? timeoutMs : RPC_TIMEOUT_MS;
  return {
    configured: !!(base && key),
    async rpc(name, args) {
      if (!base || !key) return { data: null, error: { code: "unconfigured" } };
      try {
        const res = await fetch(base + "/rest/v1/rpc/" + name, {
          method: "POST",
          headers: {
            apikey: key,
            authorization: "Bearer " + key,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify(args || {}),
          signal: AbortSignal.timeout(wait),
        });
        if (!res.ok) {
          try { await res.body?.cancel(); } catch (_) { /* nothing to drain */ }
          return { data: null, error: { code: "http_" + res.status } };
        }
        return { data: await res.json(), error: null };
      } catch (_) {
        /* ⚠ THE CAUSE IS NOT CARRIED. These relays are world-readable and a message could name the
           database host; the caller only needs to know that the limiter did not answer. */
        return { data: null, error: { code: "unreachable" } };
      }
    },
  };
}

/* The limiter. `db` is anything with `rpc(name, args) → Promise<{ data, error }>` — a supabase-js
   client or restRpcClient above.

     take(scope, key, { capacity, refillPerSec, cost = 1, onUnavailable = 'deny' })
       → { allowed, remaining, source }
           source 'db'          — the shared bucket answered; `allowed` is its verdict
           source 'unavailable' — it did not; `allowed` is what onUnavailable said to do

   `remaining` is the balance after the call when the database answered, and null when it did not
   — a number the limiter did not observe is not reported as one. */
export function makeLimiter({ db }) {
  return {
    async take(scope, key, opts) {
      const o = opts || {};
      const capacity = Math.max(1, Math.floor(+o.capacity || 1));
      const refillPerSec = Math.max(0, +o.refillPerSec || 0);
      const cost = Math.max(0, Math.floor(o.cost == null ? 1 : +o.cost));
      const onUnavailable = (o.onUnavailable === "allow") ? "allow" : "deny";

      let row = null;
      if (db && typeof db.rpc === "function") {
        const r = await db.rpc("relay_take", {
          p_scope: String(scope || ""),
          p_key: String(key || ""),
          p_capacity: capacity,
          p_refill_per_sec: refillPerSec,
          p_cost: cost,
        });
        if (r && !r.error) row = firstRow(r.data);
      }
      if (!row || typeof row.allowed !== "boolean") {
        return { allowed: onUnavailable === "allow", remaining: null, source: "unavailable" };
      }
      const remaining = Number.isFinite(+row.remaining) ? +row.remaining : null;
      return { allowed: row.allowed, remaining, source: "db" };
    },
  };
}

/* ══ (own-fetch-relay) THE PER-CALLER BUCKET EVERY KEYLESS RELAY TAKES FROM ═══════════════════════════════
   #R801 built the shared bucket for the one relay with a bill on it and left the other public
   relays with nothing at all: of the fifteen functions deployed with verify_jwt = false, only
   routing-relay took a token. The rest hold no key, but every one of them is an AMPLIFIER — one
   caller-sized GET becomes an upstream-sized transfer, paid for in this project's invocations and
   egress and in the goodwill of the upstream (several of which rate-limit by source address, and
   ours is the source address). A loop against any of them was bounded by nothing.

   So every public relay now takes one token per request from `<scope>:ip`, keyed by the caller's
   address, before it asks its upstream. ⚠ IT FAILS OPEN. These relays carry no invoice per call, a
   database outage must not become an outage of every live layer, and the thing this bounds is a
   single address's loop — which the database being down does not make more likely. The relay that
   DOES carry an invoice (routing-relay) keeps its own fail-closed project-wide buckets.

   THE NUMBER (no-ad-hoc-hardcoding §4):
     capacity per address per minute = readerPerMin × READERS_PER_ADDRESS
     · readerPerMin is declared by EACH relay beside the code that knows its client — the most
       requests one reader's page can make of it in a minute, read from that client's timers.
       That is the observation, and it is per relay because the clients differ by two orders of
       magnitude (cable-geo is asked twice a session, alerts-relay every ten seconds per feed).
     · READERS_PER_ADDRESS = 10 is an ESTIMATE, not a measurement: how many readers may share one
       public address (an office, a school, a carrier-grade NAT). It is here so that a household
       behind one address is never throttled for being two people, while a script still meets
       its ceiling within a minute. It expires the first time production shows a 429 from this
       gate for traffic that was readers — `rate_limit` in a relay's responses with nothing else
       wrong — and then this one number goes up, for every relay at once.
     · The environment may override one relay's capacity without a deploy:
       `<SCOPE>_PER_IP_PER_MIN` (e.g. ALERTS_RELAY_PER_IP_PER_MIN), a positive integer — the
       same rule routing-relay's GLOBAL_PER_* follow. The canonical place is still this file and
       the relay's own readerPerMin; the environment only moves it. */
export const READERS_PER_ADDRESS = 10;

/* The caller, as routing-relay has always identified it: the first address in x-forwarded-for.
   ⚠ A REQUEST WITH NONE SHARES ONE BUCKET — an unidentifiable caller is throttled with everyone
   else rather than exempt. */
export function callerKey(req) {
  const xff = (req && req.headers && req.headers.get("x-forwarded-for")) || "";
  return xff.split(",")[0].trim() || "unknown";
}

function envPositive(env, name, fallback) {
  let v = NaN;
  try { v = Number((typeof env === "function" ? env(name) : "") || ""); } catch (_) { v = NaN; }
  return (Number.isFinite(v) && v >= 1) ? Math.floor(v) : fallback;
}

/* The capacity one relay's scope has — exported so a test can read the number the gate enforces
   rather than recompute it. */
export function callerCapacity(scope, readerPerMin, env) {
  const name = String(scope || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_") + "_PER_IP_PER_MIN";
  return envPositive(env, name, Math.max(1, Math.ceil(+readerPerMin || 1)) * READERS_PER_ADDRESS);
}

/* callerGate(req, cors, { scope, readerPerMin, env }) → a 429 Response to send, or null to carry on.
   `env` is `(name) => string` (Deno.env.get in a relay), so this file stays free of Deno globals and
   can be evaluated by the node tests. The client is built per request, like routing-relay's, so a
   missing env answers «limiter unavailable» (→ allow) rather than throwing at module load (#R505). */
export async function callerGate(req, cors, o) {
  const opts = o || {};
  const env = typeof opts.env === "function" ? opts.env : () => "";
  const scope = String(opts.scope || "");
  const perMin = callerCapacity(scope, opts.readerPerMin, env);
  const db = restRpcClient({ url: env("SUPABASE_URL") || "", serviceKey: env("SUPABASE_SERVICE_ROLE_KEY") || "" });
  if (!db.configured) return null;
  const r = await makeLimiter({ db }).take(scope + ":ip", callerKey(req), {
    capacity: perMin, refillPerSec: perMin / 60, cost: 1, onUnavailable: "allow",
  });
  if (r.allowed) return null;
  return new Response(JSON.stringify({ error: "rate_limit" }), {
    status: 429,
    headers: {
      ...(cors || {}),
      "content-type": "application/json",
      "cache-control": "no-store",
      "retry-after": String(Math.max(1, Math.ceil(60 / perMin))),
    },
  });
}
