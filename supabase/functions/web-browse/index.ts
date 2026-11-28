// ============================================================================
//  IntMap · web-browse  —  the light browser Atlas drives  (Edge Function, Deno)
// ----------------------------------------------------------------------------
//  WHY: a data portal has to be OPERATED (search, narrow, follow, download), and a page cannot do that
//  itself — the portals send no Access-Control-Allow-Origin. The engine is supabase/functions/_shared/
//  web-browse.js (HTTP + HTML → a structural snapshot, GET forms, links, one file download); this file
//  supplies what only the runtime has — DNS, the caller's identity, and the project-wide caps.
//
//  THREE TIERS: this light reader; the render tier (?tier=render, one read-only picture); the SESSION tier (?tier=session, an operated
//  real-browser session — grant, steps, journal — see _shared/web-session.js). Both browser tiers are off until the provider secrets exist.
//  NOT A BROWSER (this tier): no script runs, no screenshot. A page that is empty until a script runs is answered
//  `needsBrowser`. The REAL-browser tier is the same function at `?tier=render` (below `renderTier`): read-only, its own
//  switch/buckets, off until CF_BROWSER_ACCOUNT_ID + CF_BROWSER_API_TOKEN exist (then `render_unconfigured`).
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
import { callerGate, forceGrant, restRpcClient } from "../_shared/rate-limit.js";
import { secretKey, publishableKey, denoEnv } from "../_shared/supabase-keys.js";
import { browse } from "../_shared/web-browse.js";
import { render } from "../_shared/web-render.js";
import { sessionAction } from "../_shared/web-session.js";

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
/* ── the real-browser tier ────────────────────────────────────────────────────────────────────────────
   Order: (1) its own kill switch WEB_RENDER_DISABLED  (2) no provider secret → `render_unconfigured` answered BEFORE any bucket is touched
   (nothing is spent, nothing leaves)  (3) its OWN per-caller bucket `web-render:ip`  (4) its OWN project-wide bucket, fails closed.
   Both numbers are ESTIMATES with no live measurement behind them (no provider contract yet): one render is billed, so they start small —
   capacity WEB_RENDER_BURST (default 10), refill WEB_RENDER_PER_MIN (default 6). They expire the first time a real reader meets `capped`
   or the first invoice shows the real unit cost. Secrets: CF_BROWSER_ACCOUNT_ID + CF_BROWSER_API_TOKEN (Cloudflare Browser Rendering). */
const RENDER_READER_PER_MIN = 4;
async function openNetworkSocket(url, headers, signal) {
  // Hosted Edge runtimes cannot all set headers on the global WebSocket.
  const { default: NetworkWebSocket } = await import("ws");
  signal.throwIfAborted();
  return await new Promise((resolve, reject) => {
    const ws = new NetworkWebSocket(url, { headers, handshakeTimeout: 8000, maxPayload: 8 * 1024 * 1024 });
    const abort = () => ws.terminate();
    signal.addEventListener("abort", abort, { once: true });
    const fail = (code) => {
      signal.removeEventListener("abort", abort);
      reject(Object.assign(new Error(code), { code }));
    };
    ws.once("error", () => fail("render_unreachable"));
    ws.once("unexpected-response", (_, res) => {
      const status = res.statusCode;
      fail(status === 401 || status === 403 ? "render_auth" : status === 429 ? "render_busy" : "render_failed");
      ws.terminate();
    });
    ws.once("open", () => {
      signal.removeEventListener("abort", abort);
      resolve(ws);
    });
  });
}

async function renderTier(req) {
  const off = env("WEB_RENDER_DISABLED").toLowerCase();
  if (off === "1" || off === "true") return reply({ error: "disabled" }, 503);
  const cfg = { provider: "cloudflare", accountId: env("CF_BROWSER_ACCOUNT_ID"), token: env("CF_BROWSER_API_TOKEN") };
  if (!cfg.accountId || !cfg.token) return reply({ ok: false, code: "render_unconfigured", viaBrowser: true }, 200);
  const limited = await callerGate(req, CORS, { scope: "web-render", readerPerMin: RENDER_READER_PER_MIN, env });
  if (limited) return limited;
  const grant = await forceGrant("web-render-project", { capacity: positive("WEB_RENDER_BURST", 10), refillPerSec: positive("WEB_RENDER_PER_MIN", 6) / 60, env });
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
    return reply(await render(input, { resolvesPublic, cfg, openNetworkSocket }), 200);
  } catch (e) {
    return relayFail(e, { ...CORS, "cache-control": "no-store" });
  }
}

/* ── the operated-browser SESSION tier (?tier=session) ────────────────────────────────────────────────────
   A real browser Atlas clicks and types in, one step per call, the browser kept alive at the provider between calls
   (_shared/web-session.js — read its header for what is and is not allowed, and for what is unverified against a live provider).
   Order: (1) its own kill switch WEB_SESSION_DISABLED  (2) no provider secret → `session_unconfigured`, answered BEFORE any bucket
   is touched  (3) the caller's account, asked of the Auth server (a session and a grant belong to an account, so an anonymous or
   unverifiable caller gets nothing)  (4) its OWN per-caller bucket  (5) its OWN project-wide bucket, fails closed  (6) the engine.
   Numbers are ESTIMATES with no live measurement (no contract yet): an operated task is 10–40 steps, a step ~2–6 s, so a reader
   may take 60 a minute and the whole site starts at WEB_SESSION_BURST 30 / WEB_SESSION_PER_MIN 20. They expire with the first
   `capped` a real reader meets or the first invoice. Secrets: the same CF_BROWSER_ACCOUNT_ID + CF_BROWSER_API_TOKEN as the render tier.
   The state token is HMAC-signed with a key derived from the project's secret key (no new secret). The journal is public.web_session_journal. */
const SESSION_READER_PER_MIN = 60;
async function callerId(req) {
  const url = env("SUPABASE_URL"), auth = req.headers.get("authorization") || "";
  if (!url || !/^bearer\s+\S+/i.test(auth)) return null;
  try {
    const r = await fetch(url.replace(/\/+$/, "") + "/auth/v1/user", { headers: { apikey: publishableKey(denoEnv), authorization: auth }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) { try { await r.body?.cancel(); } catch (_) { /* headers were enough */ } return null; }
    const u = await r.json();
    return (u && typeof u.id === "string" && /^[0-9a-f-]{36}$/i.test(u.id)) ? u.id.toLowerCase() : null;
  } catch (_) { return null; }
}
let signKey = { secret: "", key: null };
async function signHex(text) {
  const secret = "web-session:" + secretKey(denoEnv);
  if (signKey.secret !== secret) signKey = { secret, key: await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]) };
  const d = new Uint8Array(await crypto.subtle.sign("HMAC", signKey.key, new TextEncoder().encode(text)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}
/* Deno's WebSocket takes request headers as a second argument (the provider authenticates the socket with Authorization: Bearer) */
function openSocket(url, headers) {
  return new Promise((resolve, reject) => {
    let ws;
    try { ws = new WebSocket(url, { headers }); } catch (e) { return reject(e); }
    const t = setTimeout(() => { try { ws.close(); } catch (_) { /* never opened */ } reject(new Error("open timeout")); }, 10000);
    ws.onopen = () => { clearTimeout(t); resolve(ws); };
    ws.onerror = () => { clearTimeout(t); reject(new Error("open failed")); };
    ws.onclose = () => { clearTimeout(t); reject(new Error("closed before open")); };
  });
}
async function sessionTier(req) {
  const off = env("WEB_SESSION_DISABLED").toLowerCase();
  if (off === "1" || off === "true") return reply({ error: "disabled" }, 503);
  const cfg = { provider: "cloudflare", accountId: env("CF_BROWSER_ACCOUNT_ID"), token: env("CF_BROWSER_API_TOKEN") };
  if (!cfg.accountId || !cfg.token) return reply({ ok: false, code: "session_unconfigured", viaBrowser: true }, 200);
  const uid = await callerId(req);
  if (!uid) return reply({ error: "signed_out" }, 401);
  const limited = await callerGate(req, CORS, { scope: "web-session", readerPerMin: SESSION_READER_PER_MIN, env });
  if (limited) return limited;
  const grant = await forceGrant("web-session-project", { capacity: positive("WEB_SESSION_BURST", 30), refillPerSec: positive("WEB_SESSION_PER_MIN", 20) / 60, env });
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
  const db = restRpcClient({ url: env("SUPABASE_URL"), serviceKey: secretKey(denoEnv) });
  const pending = [];   /* awaited before answering: an isolate may end with the response, and a journal row is the record the reader is owed */
  const journal = (e) => { pending.push(db.rpc("log_web_session", { p_user: uid, p_action: e.action, p_host: e.host, p_path: e.path, p_ok: e.ok, p_code: e.code, p_ms: e.ms, p_blocked: e.blocked }).catch(() => {})); };
  try {
    const out = await sessionAction(input, { cfg, uid, sign: signHex, resolvesPublic, openSocket, journal });
    await Promise.allSettled(pending);
    return reply(out, 200);
  } catch (e) {
    return relayFail(e, { ...CORS, "cache-control": "no-store" });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

  const off = env("WEB_BROWSE_DISABLED").toLowerCase();
  if (off === "1" || off === "true") return reply({ error: "disabled" }, 503);

  /* the REAL-BROWSER tier (?tier=render): costs money per call, so it has its own switch, its own per-caller bucket and its own project-wide bucket,
     and it is asked BEFORE the light tier's caps are touched (a render must not spend the light tier's budget, nor the reverse) */
  if (new URL(req.url).searchParams.get("tier") === "render") return await renderTier(req);
  if (new URL(req.url).searchParams.get("tier") === "session") return await sessionTier(req);

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
