// ============================================================================
//  IntMap · web-browse  —  the light browser Atlas drives  (Edge Function, Deno)
// ----------------------------------------------------------------------------
//  WHY: a data portal has to be OPERATED (search, narrow, follow, download), and a page cannot do that
//  itself — the portals send no Access-Control-Allow-Origin. The engine is supabase/functions/_shared/
//  web-browse.js (HTTP + HTML → a structural snapshot, GET forms, links, one file download); this file
//  supplies what only the runtime has — DNS, the caller's identity, and the project-wide caps.
//
//  NOT A BROWSER: no script runs, no screenshot. A page that is empty until a script runs is answered
//  `needsBrowser`. A real browser engine can be put behind the same request/answer shapes later.
//
//  WHO MAY CALL: a signed-in reader (verify_jwt ON). Atlas requires a login already, and this function
//  makes outbound requests to hosts the reader named, which is not a thing to offer to the open internet.
//
//  CAPS (the order is the order they are asked):
//    1. KILL SWITCH — WEB_BROWSE_DISABLED=1 (a Supabase secret; takes effect on the next invocation,
//       no deploy). Answers 503 `disabled`.
//    2. PER CALLER — one token from `web-browse:ip` per request (_shared/rate-limit.js callerGate).
//    3. PROJECT-WIDE — ONE bucket for every caller (forceGrant, FAILS CLOSED: a database that does not
//       answer grants nothing). Capacity WEB_BROWSE_BURST (default 60), refill WEB_BROWSE_PER_MIN
//       (default 30) per minute — an ESTIMATE: one portal task is 4–8 requests, so 30/min is about
//       five tasks a minute across the whole site, and egress is bounded per request by the engine's byte
//       ceilings (3 MB page / 6 MB file). It expires the first time a real reader meets `capped`.
//
//  REQUEST  POST { action:'open'|'click'|'submit'|'read'|'download', url?, ref?, form?, values?, button?, textChars?, state? }
//  ANSWER   200 { ok, state, page? | file? , handoff?, code?, needsBrowser? }   (a failed browse is still 200: it is an answer)
//           400 bad_request · 401 (the platform) · 413 too_large · 429 rate_limit | capped · 503 disabled
//
//  Deploy:  supabase functions deploy web-browse --use-api --project-ref vpekfwdpurzejrrmacac
//  Secrets: none required. Optional: WEB_BROWSE_DISABLED, WEB_BROWSE_BURST, WEB_BROWSE_PER_MIN.
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE — the repo's static gate parses every committed .ts as plain JavaScript.
// ============================================================================

import { corsFor, readCapped, resolvesPublic, RelayError, relayFail } from "../_shared/relay-guard.js";
import { callerGate, forceGrant } from "../_shared/rate-limit.js";
import { browse } from "../_shared/web-browse.js";

const CORS = { ...corsFor(), "Access-Control-Allow-Methods": "POST, OPTIONS" };
const env = (k) => Deno.env.get(k) || "";
const MAX_BODY_BYTES = 128 * 1024;     /* the state carries the page's ref table: 4–31 KB on the three portal pages measured 2026-11-20 (the largest, e-Stat's file list, 443 links ≈ 31 KB); this leaves room for 400 links plus forms */
const READER_PER_MIN = 20;             /* one reader's task: 4–8 requests; a minute of brisk work ≈ 20 (an estimate from the engine's flow) */
const USER_AGENT = "IntMap/web-browse (+https://github.com/rwmqx7dwb5-arch/IntMap)";

function positive(name, fallback) {
  const v = Number(env(name));
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : fallback;
}
function reply(body, status) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" } });
}
async function sha256(bytes) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

  const off = env("WEB_BROWSE_DISABLED").toLowerCase();
  if (off === "1" || off === "true") return reply({ error: "disabled" }, 503);

  const limited = await callerGate(req, CORS, { scope: "web-browse", readerPerMin: READER_PER_MIN, env });
  if (limited) return limited;
  const grant = await forceGrant("web-browse-project", { capacity: positive("WEB_BROWSE_BURST", 60), refillPerSec: positive("WEB_BROWSE_PER_MIN", 30) / 60, env });
  if (grant !== "granted") return reply({ error: grant === "capped" ? "capped" : "unavailable" }, 429);

  let input;
  try {
    const raw = await readCapped(req, MAX_BODY_BYTES);
    input = JSON.parse(new TextDecoder().decode(raw));
  } catch (e) {
    if (e instanceof RelayError) return reply({ error: "too_large" }, 413);
    return reply({ error: "bad_request" }, 400);
  }
  if (!input || typeof input !== "object") return reply({ error: "bad_request" }, 400);

  try {
    const out = await browse(input, { resolvesPublic, userAgent: USER_AGENT, sha256 });
    return reply(out, 200);
  } catch (e) {
    return relayFail(e, { ...CORS, "cache-control": "no-store" });
  }
});
