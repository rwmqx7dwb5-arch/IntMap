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
    /* (own-fetch-relay) awaited: a caller may need a network answer (a DNS lookup) to judge a hop */
    if (!next || hop >= limit || !(await allow(next, current))) throw new RelayError("upstream_redirect", 502);
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

/* ══ A HOST NAME THAT CANNOT BE THIS PROJECT'S OWN NETWORK ════════════════════════════════════
   (own-fetch-relay) Every relay here forwards only to host NAMES it lists, so the private-address question
   has so far been answered by the lists alone. fetch-relay is the first relay whose list is long
   and whose redirect hops are judged by a rule rather than by «same host», so the rule has to be
   able to say what no list entry may ever be: an address literal (v4 in any of its spellings,
   v6 in brackets), a single-label name that only a local resolver can answer, or one of the
   suffixes reserved for private naming (RFC 6761 `localhost`, RFC 6762 `.local`, RFC 8375
   `home.arpa`, and `.internal`, which ICANN reserved for private use in 2024).
   ⚠ WHAT THIS DOES NOT DO: resolve the name. A public name whose DNS answer is a private address
   (rebinding) is outside what a name check can see; the relays that use this also forward only
   to names they list, and those names are operated by the organisations named beside them. */
const PRIVATE_SUFFIXES = ["localhost", "local", "internal", "home.arpa", "localdomain"];
export function publicHostname(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!h || h.length > 253) return false;
  if (h.startsWith("[") || h.includes(":")) return false;              /* IPv6 literal */
  if (/^[0-9.]+$/.test(h) || /^0x/i.test(h)) return false;             /* IPv4, dotted or not */
  if (!h.includes(".")) return false;                                   /* single label */
  for (const s of PRIVATE_SUFFIXES) if (h === s || h.endsWith("." + s)) return false;
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(h);
}

/* ══ (own-fetch-relay) AN ADDRESS THAT CANNOT BE THIS PROJECT'S OWN NETWORK — for the one rule whose host is
   not on any list ══════════════════════════════════════════════════════════════════════════════
   fetch-relay's article rule (the reader's second strategy: any publisher's article page) admits a
   host nobody wrote down, so the name check above is not enough — a public NAME can resolve to a
   private ADDRESS. That rule therefore resolves the name and refuses unless EVERY answer is a
   public unicast address. The ranges are the special-purpose registries (RFC 6890 and the IANA
   IPv4/IPv6 special-purpose tables): unspecified, loopback, private, shared (CGN), link-local,
   documentation, benchmarking, multicast, reserved, IPv4-mapped/NAT64 forms of those. */
function v4Parts(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every((n) => n <= 255) ? p : null;
}
function publicV4(p) {
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}
export function publicAddress(ip) {
  const s = String(ip || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  const v4 = v4Parts(s);
  if (v4) return publicV4(v4);
  if (!s.includes(":")) return false;
  /* an embedded IPv4 (::ffff:a.b.c.d, 64:ff9b::a.b.c.d) is judged as that IPv4 */
  const tail = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(s);
  if (tail) { const p = v4Parts(tail[1]); return !!p && publicV4(p); }
  if (s === "::" || s === "::1") return false;
  const first = parseInt(s.split(":")[0] || "0", 16);
  if (!Number.isFinite(first)) return false;
  if ((first & 0xfe00) === 0xfc00) return false;          /* fc00::/7 unique local */
  if ((first & 0xffc0) === 0xfe80) return false;          /* fe80::/10 link-local */
  if ((first & 0xff00) === 0xff00) return false;          /* ff00::/8 multicast */
  if (s.startsWith("2001:db8:") || s.startsWith("2001:0db8:")) return false;   /* documentation */
  if (s.startsWith("64:ff9b:")) return false;             /* NAT64 without a readable tail */
  if (first === 0) return false;                          /* ::/8 reserved (incl. v4-compatible) */
  return true;
}

/* resolvesPublic(hostname) → true only when the name resolves and every A/AAAA answer is public.
   ⚠ FAILS CLOSED: a runtime with no resolver (`Deno.resolveDns` absent) answers false, so the rule
   that depends on this is refused rather than taken on trust. ⚠ What it cannot close: the answer
   the connection later uses may differ from the one checked here (DNS rebinding with a zero TTL). */
export async function resolvesPublic(hostname) {
  const D = globalThis.Deno;
  if (!D || typeof D.resolveDns !== "function") return false;
  const addrs = [];
  for (const type of ["A", "AAAA"]) {
    try { addrs.push(...(await D.resolveDns(hostname, type))); } catch (_) { /* no record of that type */ }
  }
  return addrs.length > 0 && addrs.every(publicAddress);
}
