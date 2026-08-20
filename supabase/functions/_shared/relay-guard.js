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
   drained, so an endless body costs this function the cap and not the wall clock. */
async function readCapped(res, maxBytes) {
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
  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: o.headers || {},
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (_e) {
    /* ⚠ ONE WORD, NOT THE EXCEPTION — a DNS failure's message names the host it resolved, and an
       abort's stack names this file's internals. Neither is the caller's business. */
    throw new RelayError("upstream_unreachable");
  }
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
