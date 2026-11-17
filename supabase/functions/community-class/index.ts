// ============================================================================
//  IntMap · community-class — the server side of three public doors  (security-review-nov)
// ----------------------------------------------------------------------------
//  WHY: community_maps (the Community maps directory), class_set_open and class_set_submit (a student's
//  class link) were callable by anyone straight through PostgREST with no bound per caller. The two
//  class doors answer whether a class code exists (`not_found` against anything else), and the directory
//  is a heavy read. The database now grants all three to service_role only
//  (supabase/migrations/20261117120000_security_review_nov.sql), and this function is the one way in.
//
//  WHAT STANDS IN FRONT OF THE DATABASE (verify_jwt = false — students have no account):
//    · POST only; a body ceiling read with relay-guard's readCapped (content-length AND streamed);
//    · the Origin allow-list the other public writers use (_shared/client-error-shape.js originAllowed)
//      — a convenience against other sites' pages, NOT the access control: a script sends any Origin;
//    · only the declared arguments of each RPC, each of its type (./shape.js parseCall);
//    · a string that cannot be a class code is `not_found` without a database call;
//    · the class doors: one token per call from a per-caller bucket (relay_take, keyed by
//      _shared/rate-limit.js callerKey — an HMAC of the network, never the address), taken BEFORE the
//      code is looked up, and FAILING CLOSED: a limiter that cannot answer is 503, never «go ahead».
//      The set's own 45-per-10-minutes bucket inside class_set_submit is kept as it was;
//    · the directory: the shared per-caller gate every public relay takes (callerGate). It fails open,
//      like those relays: the directory is public data, and a database that cannot answer the limiter
//      cannot answer the read either.
//  It stores nothing itself and returns the RPC's JSON unchanged.
//
//  Deploy:  supabase functions deploy community-class --project-ref vpekfwdpurzejrrmacac --use-api
//  NOTE: written WITHOUT TypeScript annotations, like the other functions — the repo's static gate
//  parses every committed .ts as plain JavaScript.
// ============================================================================
import { corsFor, readCapped, RelayError } from "../_shared/relay-guard.js";
import { makeLimiter, restRpcClient, callerKey, callerKeySecret, callerGate } from "../_shared/rate-limit.js";
import { secretKey, denoEnv } from "../_shared/supabase-keys.js";
import { originAllowed } from "../_shared/client-error-shape.js";
import { parseCall, CLASS_CODE_RE, MAX_BODY_BYTES, CLASS_PER_CALLER, CLASS_REFILL_WINDOW_S, DIRECTORY_READER_PER_MIN } from "./shape.js";

const SCOPE_CLASS = "community-class:class";
const SCOPE_DIRECTORY = "community-class:directory";

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

/* handle(req, deps?) — deps lets the node tests hand in the database and the limiter; in production both
   are built per request from the platform-injected env (a module that throws on a missing env answers 500
   to everyone — #R505). */
export async function handle(req, deps) {
  const d = deps || {};
  const env = d.env || ((k) => denoEnv(k) || "");
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
  const call = parseCall(new TextDecoder("utf-8").decode(bytes));
  if (call.error) return say(cors, { error: call.error }, 400);

  const db = d.db || restRpcClient({ url: env("SUPABASE_URL"), serviceKey: secretKey(env), timeoutMs: 8000 });

  if (call.cls) {
    /* not a code at all: the same answer an unknown code gets, and no database call */
    if (!CLASS_CODE_RE.test(call.code)) return say(cors, { ok: false, error: "not_found" }, 200);
    const limiter = d.limiter || makeLimiter({ db });
    const who = await callerKey(req, { secret: callerKeySecret(env) });
    const t = await limiter.take(SCOPE_CLASS, who, {
      capacity: CLASS_PER_CALLER, refillPerSec: CLASS_PER_CALLER / CLASS_REFILL_WINDOW_S, cost: 1, onUnavailable: "deny",
    });
    if (t.source !== "db") return say(cors, { error: "limiter_unavailable" }, 503);
    if (!t.allowed) return say(cors, { ok: false, error: "busy" }, 429);
  } else {
    const gate = d.gate || callerGate;
    const refused = await gate(req, cors, { scope: SCOPE_DIRECTORY, readerPerMin: DIRECTORY_READER_PER_MIN, env });
    if (refused) return refused;
  }

  const res = await db.rpc(call.op, call.args);
  if (!res || res.error) return say(cors, { error: "unavailable" }, 503);
  return say(cors, res.data, 200);
}

if (typeof Deno !== "undefined" && typeof Deno.serve === "function") Deno.serve((req) => handle(req));
