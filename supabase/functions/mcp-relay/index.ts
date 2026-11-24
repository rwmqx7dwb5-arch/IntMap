// ============================================================================
//  IntMap · mcp-relay  —  a CORS bridge for MCP servers   (Edge Function, Deno)   (mcp-client)
// ----------------------------------------------------------------------------
//  js/atlas-mcp-client.js talks to an MCP server (Streamable HTTP) straight from the page. A server that does not
//  answer the browser's CORS preflight cannot be reached that way, and the page cannot tell that from "down". When the
//  direct request fails, the client asks this function to make the same POST server-side and hand the answer back
//  in a JSON envelope — which also makes the `Mcp-Session-Id` response header readable (a browser may read it only
//  if the server exposes it).
//
//  ⚠ IT IS NOT AN OPEN PROXY, and unlike fetch-relay it cannot be an allow-list (the reader names the server).
//  So: ① a SIGNED-IN reader only (the Authorization JWT is verified); ② the narrowing in
//  _shared/mcp-relay-policy.js — https, a public DNS name that RESOLVES ONLY to public addresses (relay-guard.js
//  resolvesPublic), one JSON-RPC message of a listed method, five forwarded headers; ③ no redirects are followed;
//  ④ a byte ceiling and one deadline over the whole exchange; ⑤ the caller's bucket (_shared/rate-limit.js).
//  What the server answers is returned as DATA in the envelope; this function never interprets it.
//
//  ENDPOINT (POST, JSON):  { url, headers?, body }
//    → 200 { status, contentType, sessionId, body }   body is the upstream's text, whatever its status
//    → 400 not_allowed | bad_request | method_not_allowed | too_large      401 login_required
//    → 429 rate_limit    → 502/503 upstream_unreachable | upstream_timeout | upstream_redirect | upstream_too_large | upstream_type
//
//  Deploy:  supabase functions deploy mcp-relay --use-api --project-ref vpekfwdpurzejrrmacac   (CI does it on merge)
//  Secrets: none (SUPABASE_URL and the project keys are injected — _shared/supabase-keys.js).
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE — the repo's static gate parses every committed .ts as plain JavaScript.
// ============================================================================

import { createClient } from "@supabase/supabase-js";   // pinned in this function's deno.json
import { fetchBounded, relayFail, resolvesPublic, RelayError } from "../_shared/relay-guard.js";
import { callerGate } from "../_shared/rate-limit.js";
import { publishableKey, denoEnv } from "../_shared/supabase-keys.js";
import { checkRelayRequest, MCP_RELAY_LIMITS, MCP_RELAY_TYPE } from "../_shared/mcp-relay-policy.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const env = (k) => Deno.env.get(k) || "";
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  /* ① a signed-in reader — the same check delete-account makes */
  const authHeader = req.headers.get("Authorization") || "";
  try {
    const userClient = createClient(env("SUPABASE_URL"), publishableKey(denoEnv), { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data } = await userClient.auth.getUser();
    if (!data?.user) return json({ error: "login_required" }, 401);
  } catch (_) { return json({ error: "login_required" }, 401); }

  const limited = await callerGate(req, CORS, { scope: "mcp-relay", readerPerMin: MCP_RELAY_LIMITS.readerPerMin, env });
  if (limited) return limited;

  /* ② the request, judged before anything is fetched */
  let raw = "";
  try { raw = await req.text(); } catch (_) { return json({ error: "bad_request" }, 400); }
  if (raw.length > MCP_RELAY_LIMITS.requestBytes + 8192) return json({ error: "too_large" }, 400);
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (_) { return json({ error: "bad_request" }, 400); }
  const chk = checkRelayRequest(parsed);
  if (!chk.ok) return json({ error: chk.error }, 400);

  const budget = AbortSignal.timeout(MCP_RELAY_LIMITS.timeoutMs);
  if (!(await resolvesPublic(new URL(chk.url).hostname, { signal: budget }))) {
    if (budget.aborted) return relayFail(new RelayError("upstream_timeout", 503), { ...CORS, "cache-control": "no-store" });
    return json({ error: "not_allowed" }, 400);
  }
  try {
    const r = await fetchBounded(chk.url, { method: "POST", headers: chk.headers, body: chk.bodyText },
      { timeoutMs: MCP_RELAY_LIMITS.timeoutMs, maxBytes: MCP_RELAY_LIMITS.responseBytes });
    const ct = r.headers.get("content-type") || "";
    const text = await r.text();
    const typed = MCP_RELAY_TYPE.test(ct);
    /* an HTML error page is not data the client wants — a 2xx of the wrong type is a refusal, a non-2xx is just its status */
    if (r.ok && text && !typed) return json({ error: "upstream_type" }, 502);
    return json({ status: r.status, contentType: typed ? ct : "", sessionId: r.headers.get("mcp-session-id") || "", body: typed ? text : "" });
  } catch (e) {
    return relayFail(e, { ...CORS, "cache-control": "no-store" });
  }
});
