// ============================================================================
//  IntMap · mcp-server — IntMap's read-only tools for outside AI over MCP (Streamable HTTP, stateless)
//  Logic: ./handler.js (dependencies injected, evaluated by tests/mcp-server-checks.test.mjs).
//  Endpoint (POST, Bearer imk_… key a reader issued with public.mcp_issue_key):
//      https://vpekfwdpurzejrrmacac.supabase.co/functions/v1/mcp-server
//  Stop switch: update public.mcp_server_state set enabled = false;   (no deploy)
//  Ceilings:    per key = its daily_limit; project = MCP_GLOBAL_PER_DAY (default 20,000) calls/day.
//  Deploy:  supabase functions deploy mcp-server --no-verify-jwt --use-api --project-ref vpekfwdpurzejrrmacac
//  ⚠ NO TYPE ANNOTATIONS — the static gate parses every .ts as plain JavaScript.
// ============================================================================
import { makeLimiter, restRpcClient } from "../_shared/rate-limit.js";
import { secretKey, denoEnv } from "../_shared/supabase-keys.js";
import { makeHandler, DEFAULT_GLOBAL_PER_DAY } from "./handler.js";
import { loadGis } from "./gis-loader.js";

function ceiling(name, fallback) {
  const v = Number(Deno.env.get(name) || "");
  return (Number.isFinite(v) && v >= 1) ? Math.floor(v) : fallback;
}

/* built on the first request, not at module load (a module that throws on a missing env answers 500 to everyone —
   #R505). One handler per isolate: the GIS realm it owns is per isolate too. */
let handler = null;
export function handle(req) {
  if (!handler) {
    const db = restRpcClient({ url: Deno.env.get("SUPABASE_URL") || "", serviceKey: secretKey(denoEnv), timeoutMs: 8000 });
    handler = makeHandler({ db, limiter: makeLimiter({ db }), loadGis, now: () => Date.now(), globalPerDay: ceiling("MCP_GLOBAL_PER_DAY", DEFAULT_GLOBAL_PER_DAY) });
  }
  return handler(req);
}

Deno.serve(handle);
