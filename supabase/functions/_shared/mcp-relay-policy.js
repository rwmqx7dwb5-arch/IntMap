// ============================================================================
//  IntMap · _shared/mcp-relay-policy.js — WHAT mcp-relay WILL FORWARD, stated once   (mcp-client)
// ----------------------------------------------------------------------------
//  mcp-relay lets Atlas's MCP client (js/atlas-mcp-client.js) reach a server that sends no CORS headers. Unlike
//  fetch-relay it has NO host list — the reader names the server — so everything it will forward is narrowed here,
//  and this file is the only place the narrowing is written. Pure functions, no Deno globals: the node tests
//  (tests/mcp-client-checks.test.mjs) run them.
//
//    · https only, a public DNS name (relay-guard.js publicHostname; the function additionally resolves it and
//      refuses a name that points at a private address), no credentials in the URL, port 443 or 8443;
//    · the request is ONE JSON-RPC message whose method is on a short list — the ones a tools-only client sends (initialize and ping for the 2025 protocol; server/discover and the three tasks/* calls for 2026-07-28);
//    · the headers forwarded are the seven an MCP client needs (mcp-method and mcp-name are the 2026-07-28 routing headers); nothing else the page sends reaches the upstream;
//    · the answer must declare a JSON or event-stream content type and is capped in bytes.
// ============================================================================
import { publicHostname } from "./relay-guard.js";

export const MCP_RELAY_FUNCTION = "mcp-relay";
export const MCP_RELAY_METHODS = Object.freeze(["initialize", "notifications/initialized", "tools/list", "tools/call", "ping", "server/discover", "tasks/get", "tasks/update", "tasks/cancel"]);
export const MCP_RELAY_HEADERS = Object.freeze(["authorization", "mcp-session-id", "mcp-protocol-version", "mcp-method", "mcp-name", "content-type", "accept"]);
export const MCP_RELAY_LIMITS = Object.freeze({
  /* ESTIMATES, not measurements. A tools/call argument set is a few KB; 256 KB leaves room for pasted text and no
     more. A tool result is read whole before it is handed back, so the ceiling is the memory one function instance may
     spend on one exchange — 4 MiB is what fetch-relay's largest rule uses. Expires when a real server needs more
     (it would show as upstream_too_large). */
  requestBytes: 256 * 1024,
  responseBytes: 4 * 1024 * 1024,
  timeoutMs: 40000,
  readerPerMin: 30,
});
export const MCP_RELAY_TYPE = /^(application\/json|text\/event-stream)/i;

/** → { ok:true, url, headers, bodyText } | { ok:false, error } — the page's request, judged BEFORE anything is fetched. */
export function checkRelayRequest(req) {
  if (!req || typeof req !== "object") return { ok: false, error: "bad_request" };
  let u;
  try { u = new URL(String(req.url || "")); } catch (_) { return { ok: false, error: "not_allowed" }; }
  if (u.protocol !== "https:" || u.username || u.password) return { ok: false, error: "not_allowed" };
  if (u.port && u.port !== "443" && u.port !== "8443") return { ok: false, error: "not_allowed" };
  if (!publicHostname(u.hostname)) return { ok: false, error: "not_allowed" };
  const b = req.body;
  if (!b || typeof b !== "object" || Array.isArray(b) || b.jsonrpc !== "2.0" || typeof b.method !== "string") return { ok: false, error: "bad_request" };
  if (MCP_RELAY_METHODS.indexOf(b.method) < 0) return { ok: false, error: "method_not_allowed" };
  const bodyText = JSON.stringify(b);
  if (bodyText.length > MCP_RELAY_LIMITS.requestBytes) return { ok: false, error: "too_large" };
  const headers = {};
  const given = req.headers && typeof req.headers === "object" ? req.headers : {};
  Object.keys(given).forEach((k) => {
    const name = k.toLowerCase();
    const v = given[k];
    if (MCP_RELAY_HEADERS.indexOf(name) >= 0 && typeof v === "string" && v.length <= 4096 && !/[\r\n]/.test(v)) headers[name] = v;
  });
  headers["content-type"] = "application/json";
  headers.accept = "application/json, text/event-stream";
  u.hash = "";
  return { ok: true, url: u.toString(), headers, bodyText };
}
