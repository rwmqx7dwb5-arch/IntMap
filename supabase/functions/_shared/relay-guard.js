// ============================================================================
//  IntMap · _shared/relay-guard.js — the bounds every keyless public relay needs
// ----------------------------------------------------------------------------
//  cable-geo, news-relay, sv-cov and alerts-relay are the same shape: no JWT, no user data, an
//  allow-list of upstream URLs, and `Access-Control-Allow-Origin: *` so the browser can read the
//  answer. What they did NOT share was any bound on what the upstream is allowed to hand back:
//
//      const body = await r.text();        // however many megabytes the upstream feels like
//
//  A relay is a request AMPLIFIER — one caller-sized request becomes an upstream-sized transfer paid
//  for by this project — and an unbounded read is also how a single slow or enormous answer walks the
//  isolate into its memory ceiling and takes every concurrent caller of that function with it.
//  Three limits and one rule, in one place so the four cannot drift apart:
//
//    · a DEADLINE       — every upstream fetch aborts (they had 12 s, 20 s, 45 s and none at all).
//    · a BYTE CEILING   — enforced on content-length AND while streaming, because content-length is
//                         optional and a chunked answer simply omits it.
//    · a CONTENT TYPE   — an HTML error page must never reach a caller as the JSON/XML/PNG it asked
//                         for; several of these relays cache their answer at the edge for hours.
//    · GENERIC ERRORS   — the caller learns THAT the upstream failed, never what the exception said.
//                         (CodeQL js/stack-trace-exposure; these responses are world-readable.)
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE. scripts/static-checks.mjs runs `node --check` over every
//  committed .ts/.js, so the Edge Functions are plain JavaScript in .ts files and this is plain
//  JavaScript in a .js file — see the note at the top of alerts-relay.
// ============================================================================

/* The one CORS shape all four answer with. `methods` differs only in that sv-cov also allows Range. */
export function corsFor(extraAllowHeaders) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" +
      (extraAllowHeaders ? ", " + extraAllowHeaders : ""),
  };
}

/* A relay failure the caller may be told about, by CODE only. Never carries an upstream body. */
export class RelayError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status || 502;
  }
}

/* ⚠ THE CEILING IS CHECKED TWICE. A server that declares content-length is refused before a byte is
   read; a server that does not is cut off mid-stream, with the connection cancelled rather than
   drained, so an endless body costs this function the cap and not the wall clock.
   Exported (#R801): ai-proxy read its own request body with `req.arrayBuffer()` and checked the
   length AFTERWARDS, which is a check on what was parsed, not a bound on what was read; a Request
   is a Response-shaped thing for this purpose (headers + body stream), so the same reader bounds it. */
export async function readCapped(res, maxBytes) {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new RelayError("upstream_too_large");
  const body = res.body;
  if (!body || typeof body.getReader !== "function") {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new RelayError("upstream_too_large");
    return buf;
  }
  const reader = body.getReader();
  const chunks = [];
  let n = 0;
  for (;;) {
    const step = await reader.read();
    if (step.done) break;
    n += step.value.length;
    if (n > maxBytes) {
      try { await reader.cancel(); } catch (_) { /* the upstream is of no further use */ }
      throw new RelayError("upstream_too_large");
    }
    chunks.push(step.value);
  }
  const out = new Uint8Array(n);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

/* GET one allow-listed URL under a deadline, a byte ceiling and a content-type rule.
   Returns { status, contentType, bytes, text() } — never throws for an upstream HTTP status, so the
   caller decides what a 404 means (sv-cov answers a transparent PNG; cable-geo answers 502). */
export async function fetchGuarded(url, opts) {
  const o = opts || {};
  const maxBytes = o.maxBytes || 4 * 1024 * 1024;
  const timeoutMs = o.timeoutMs || 20000;
  /* ⚠ ONE DEADLINE FOR THE WHOLE EXCHANGE, redirects and body included. `AbortSignal.timeout` is
     minted once here and handed to every hop, so three slow redirects cannot buy three deadlines. */
  const signal = AbortSignal.timeout(timeoutMs);
  const res = await followRedirects(url, { method: "GET", headers: o.headers || {}, signal }, o);
  const contentType = res.headers.get("content-type") || "";
  if (res.ok && o.contentTypeRe && !o.contentTypeRe.test(contentType)) {
    try { await res.body?.cancel(); } catch (_) { /* nothing to drain */ }
    throw new RelayError("upstream_wrong_type");
  }
  const bytes = await readCapped(res, maxBytes);
  return {
    status: res.status,
    ok: res.ok,
    contentType,
    bytes,
    text() { return new TextDecoder("utf-8").decode(bytes); },
  };
}

/* ══ REDIRECTS ARE FOLLOWED BY HAND, AND EACH HOP IS ASKED THE SAME QUESTION AS THE FIRST ══════
   (#R801) `redirect: "follow"` let the allow-list decide the FIRST hop only: an allow-listed upstream
   that answers 302 to somewhere else (an open redirector on its side, a changed CDN, a compromised
   host) would have been fetched by this function without anyone asking whether that somewhere else
   is allowed. So the hop is inspected: same scheme, same host by default, or whatever the caller's
   own `allowRedirect(next, from)` says — the callers already own an allow-list, and this hands the
   hop back to it. `MAX_REDIRECTS` is the number browsers historically stop at (Chromium 20, Firefox
   20, curl 50); three is what a feed or tile host legitimately needs (http→https, apex→www, a
   versioned path) and one more than any upstream in this project has been measured to answer with.
   It expires if an allow-listed upstream starts chaining more, which would show as upstream_redirect
   in that relay's answers. */
export const MAX_REDIRECTS = 3;
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

function sameOriginHop(next, from) {
  return next.protocol === "https:" && next.protocol === from.protocol && next.hostname === from.hostname && next.port === from.port;
}

export async function followRedirects(url, init, opts) {
  const o = opts || {};
  const allow = typeof o.allowRedirect === "function" ? o.allowRedirect : sameOriginHop;
  const limit = Number.isInteger(o.maxRedirects) ? o.maxRedirects : MAX_REDIRECTS;
  let current = new URL(String(url));
  for (let hop = 0; ; hop++) {
    let res;
    try {
      res = await fetch(current.toString(), { ...init, redirect: "manual" });
    } catch (_e) {
      /* ⚠ ONE WORD, NOT THE EXCEPTION — a DNS failure's message names the host it resolved, and an
         abort's stack names this file's internals. Neither is the caller's business. */
      throw new RelayError("upstream_unreachable");
    }
    if (!REDIRECT_STATUS.has(res.status)) return res;
    try { await res.body?.cancel(); } catch (_) { /* a 3xx body is nothing to keep */ }
    const loc = res.headers.get("location");
    let next = null;
    try { next = loc ? new URL(loc, current) : null; } catch (_) { next = null; }
    if (!next || hop >= limit || !allow(next, current)) throw new RelayError("upstream_redirect", 502);
    /* A 303, and a 301/302 answered to a POST, turn the request into a GET — the browser rule. */
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && init && init.method && init.method !== "GET" && init.method !== "HEAD")) {
      init = { ...init, method: "GET", body: undefined };
    }
    current = next;
  }
}

/* ══ ANY METHOD, ONE DEADLINE THAT COVERS THE BODY, ONE BYTE CEILING ══════════════════════════
   (#R801) ai-proxy and monitor-run wrapped `fetch` in a timer and cleared it the moment the headers
   arrived, so a provider that answered the headers promptly and then streamed the body slowly was
   outside the leash for as long as it liked. This keeps the signal armed until the last byte is in,
   caps the bytes while they stream, and hands back a Response built from what was read — so a
   caller's `r.ok` / `r.status` / `r.json()` / `r.text()` are unchanged and can no longer hang.
   Redirects are NOT followed: provider APIs are called by their fixed URL, and a POST that is
   redirected is a misconfiguration to surface, not a hop to take. */
export async function fetchBounded(url, init, opts) {
  const o = opts || {};
  const maxBytes = o.maxBytes || 4 * 1024 * 1024;
  const timeoutMs = o.timeoutMs || 20000;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await fetch(url, { ...(init || {}), redirect: "manual", signal: ctl.signal });
    } catch (e) {
      throw new RelayError(ctl.signal.aborted || (e && e.name === "AbortError") ? "upstream_timeout" : "upstream_unreachable", 503);
    }
    if (REDIRECT_STATUS.has(res.status)) {
      try { await res.body?.cancel(); } catch (_) { /* nothing to keep */ }
      throw new RelayError("upstream_redirect", 502);
    }
    let bytes;
    try {
      bytes = await readCapped(res, maxBytes);
    } catch (e) {
      if (e instanceof RelayError) throw e;
      throw new RelayError(ctl.signal.aborted ? "upstream_timeout" : "upstream_unreachable", 503);
    }
    return new Response(bytes, { status: res.status, statusText: res.statusText, headers: res.headers });
  } finally {
    clearTimeout(t);
  }
}

/* The outward face of a failure: a code, a status, and nothing else. */
export function relayFail(e, cors, fallbackStatus) {
  const code = (e instanceof RelayError) ? e.code : "upstream_unreachable";
  const status = (e instanceof RelayError) ? e.status : (fallbackStatus || 502);
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

/* GET-only, with the pre-flight answered. Returns a Response to send, or null to carry on. */
export function methodGate(req, cors) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...cors, "content-type": "application/json", allow: "GET, OPTIONS" },
    });
  }
  return null;
}

/* A query string is an input too. `?u=` is the only parameter any of these read, and a URL long
   enough to matter is not a tile, a feed or a GeoJSON path — it is somebody probing. */
export const MAX_QUERY_URL = 2048;
