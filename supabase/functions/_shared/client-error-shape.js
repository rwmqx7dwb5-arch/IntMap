// ============================================================================
//  IntMap · _shared/client-error-shape.js — what an error report IS, on both sides of the wire
// ----------------------------------------------------------------------------
//  WHY (client-error-log): error monitoring was Sentry, and Sentry had no DSN — for its whole life the loader in
//  index.html returned on its first line, so an exception in a reader's browser was recorded nowhere
//  but that tab's own ring buffer (window.__imErrors), which only a Bug Report ever carried out.
//  Nothing watched production except a six-hourly probe that asks whether the page is served.
//  IntMap now keeps its own record (public.client_errors, written by the client-errors Edge
//  Function), and this file is the ONE definition of what goes into it.
//
//  ⚠ ONE FILE, TWO READERS, NO MIRROR. The browser (js/client-error-report.js) imports this file to
//  scrub a report BEFORE it leaves the tab; the Edge Function imports the same file to scrub it
//  AGAIN before it is stored, because a server that trusts a client's scrubbing is a server that
//  stores whatever anyone POSTs. The aviation / newsgeo / persona modules solve «two readers» with
//  a byte-copy and a sync script; this one is plain ESM with no dependency, so Vite bundles it into
//  the page directly and there is no second copy to drift.
//
//  WHAT IS KEPT, AND WHAT IS NOT (the privacy policy §1/§6 states the same list — js/legal-text.js):
//    kept   · the error's message (redacted, cut to MAX.message) · the stack (URLs without query or
//             fragment, redacted, cut) · the page PATH (no query, no fragment) · the build id ·
//             the browser's NAME and MAJOR version, derived on the server from the User-Agent
//    never  · an IP address · a user id or session · a query string or fragment · anything typed.
//  «Anything typed» cannot be proven absent from an arbitrary exception message, so the message is
//  REDACTED rather than trusted: e-mail addresses, long digit runs, credential-shaped tokens and
//  quoted strings longer than a short identifier are replaced by a placeholder (redact() below).
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE — the repo's static gate parses every committed .ts/.js as
//  plain JavaScript (see relay-guard.js), and this file is also loaded by the browser as-is.
// ============================================================================

/* THE LIMITS. Observation / expiry / canonical place (.agents/rules/no-ad-hoc-hardcoding.md §4):
   · message 500 — the ring buffer in index.html has kept 400 characters since #R29.1 and no message
     it recorded has been observed to need more to be recognisable; 500 leaves room for the redaction
     placeholders. Expires if a real report arrives cut before its distinguishing part.
   · stack 4000 / STACK_LINES 20 — a V8 stack is 10 frames by default (Error.stackTraceLimit), each
     frame ~100-200 characters with a full asset URL; 20 lines covers Firefox/Safari, which do not
     cap, at the depth that identifies a call site. Bounds a row at roughly 5 KB.
   · path 200 — the deployed paths are /IntMap/, /IntMap/admin.html and the two policy pages.
   · release 64 — window.INTMAP_BUILD is what scripts/build-stamp.mjs writes: `<committer time>Z-<short sha>`
     (27 characters, e.g. 2026-09-25T00:52:08Z-fd7ffef). Expires if that format grows past 64.
   · browser 40 — «Samsung Internet 25» is the longest name browserOf() returns.
   The canonical place for all of these is THIS FILE; the migration's CHECK constraints restate them
   as the database's own ceiling (a row that exceeds them is refused, not stored). */
export const MAX = { message: 500, stack: 4000, path: 200, release: 64, browser: 40 };
export const STACK_LINES = 20;

/* How many reports one request may carry, and one page load may send. The client sends one report
   per distinct error and stops after MAX_PER_SESSION; the server accepts at most MAX_PER_REQUEST in
   one body. 10 is an estimate, not a measurement — there is no record yet of how many distinct
   errors a broken session produces, which is exactly the record this builds. A page that throws ten
   DIFFERENT errors is already broken enough to diagnose from those ten. Expires when client_errors
   shows sessions that stop at the cap with the cause not yet among the ten. */
export const MAX_PER_SESSION = 10;
export const MAX_PER_REQUEST = 10;

/* The one production origin, and the local previews. The function answers only these; the client
   sends only from the first (a local preview is a development machine, not a reader). The site's
   address is also written in vite.config.js's header and scripts/probe-relay-ladder.mjs's default;
   neither is code that decides anything, so there is no second rule to keep in step. */
export const PRODUCTION_ORIGIN = "https://rwmqx7dwb5-arch.github.io";
const LOCAL_ORIGIN = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/;

export function originAllowed(origin) {
  const o = String(origin || "");
  return o === PRODUCTION_ORIGIN || LOCAL_ORIGIN.test(o);
}

/* Exceptions that are not IntMap's defects. Moved here verbatim from the Sentry `beforeSend` filter it
   replaces (docs/MONITORING.md «Error classification» is the table this implements): the network
   failing, an abort the app asked for, a blocked resource, the ResizeObserver notice browsers raise
   for layout loops that resolve themselves, and a cross-origin «Script error.» — which carries no
   message, no file and no stack, so there is nothing in it to fix. */
const BENIGN = /Failed to fetch|NetworkError|Load failed|ERR_[A-Z_]+|Could not load image|supported image type|AbortError|The operation was aborted|blockedbyclient|ResizeObserver loop|Non-Error promise rejection|^Script error\.?$/i;
/* A frame inside a browser extension is the extension's defect, not ours. */
const EXTENSION = /(?:chrome|moz|safari|safari-web)-extension:\/\//i;

/* ── scrubbing ─────────────────────────────────────────────────────────────────────────────── */

/* A URL loses its query and fragment; a `:line:col` that a stack frame appends after it is kept,
   because that is the part of the frame that locates the defect. `data:` URLs carry arbitrary
   content and are reduced to their scheme. */
const URL_TOKEN = /\b(?:https?|blob|file|webpack|chrome-extension|moz-extension|safari-extension|safari-web-extension):\/{0,2}[^\s()<>"'`]+|\bdata:[^\s()<>"'`]+/gi;
export function stripUrls(text) {
  return String(text == null ? "" : text).replace(URL_TOKEN, (u) => {
    if (/^data:/i.test(u)) return "data:…";
    const pos = /(:\d+){1,2}$/.exec(u);
    const tail = pos ? pos[0] : "";
    const head = pos ? u.slice(0, pos.index) : u;
    const cut = head.search(/[?#]/);
    return (cut >= 0 ? head.slice(0, cut) : head) + tail;
  });
}

/* What might be something a person typed or a credential, replaced by a placeholder. A URL has
   already lost its query by the time this runs (stripUrls first). `digits` is off for a stack: a
   minified bundle is one long line, so a frame's COLUMN is routinely six digits and is the part of
   the frame that locates the defect. */
export function redact(text, opts) {
  const o = opts || {};
  let s = String(text == null ? "" : text)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<email>")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+){0,2}/g, "<token>")   // a JWT
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "<token>")                              // a key / hash / id
    .replace(/(["'`])[^"'`\n]{25,}\1/g, "$1…$1")                                // a long quoted string
    .replace(/“[^”\n]{25,}”/g, "“…”")
    .replace(/「[^」\n]{25,}」/g, "「…」");
  if (o.digits !== false) s = s.replace(/\d{6,}/g, "<n>");
  return s;
}

function cut(s, n) {
  const t = String(s == null ? "" : s);
  return t.length > n ? t.slice(0, n) : t;
}

/* A page path with neither query nor fragment. Accepts a path or a full URL. */
export function cleanPath(p) {
  let s = String(p == null ? "" : p);
  const m = /^[a-z][a-z0-9+.-]*:\/\/[^/]*/i.exec(s);
  if (m) s = s.slice(m[0].length) || "/";
  const q = s.search(/[?#]/);
  if (q >= 0) s = s.slice(0, q);
  if (!s.startsWith("/")) s = "/" + s;
  return cut(s, MAX.path);
}

export function cleanRelease(r) {
  const s = String(r == null ? "" : r);
  /* `:` is in the charset because the build stamp carries a time (T00:52:08Z). MEASURED 2026-09-25 in
     production: with the old charset every report arrived with release "" — the stamp format changed
     and this kept the old one. The test feeds it the stamp the build ACTUALLY writes. */
  return /^[0-9A-Za-z._:-]{1,64}$/.test(s) ? s : "";
}

export function cleanStack(stack) {
  const lines = stripUrls(stack).split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean).slice(0, STACK_LINES);
  return cut(redact(lines.join("\n"), { digits: false }), MAX.stack);
}

export function cleanMessage(message) {
  return cut(redact(stripUrls(message)).replace(/\s+/g, " ").trim(), MAX.message);
}

/* The first line of a stack that is a FRAME (V8 `    at f (url:1:2)`, SpiderMonkey/JSC `f@url:1:2`),
   reduced to the file's last path segment and its position — the origin and directories vary with
   where the page is served from, the file and position are what identify the call site. */
export function topFrame(stack) {
  for (const raw of String(stack || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /([^\s()@/]+?)(:\d+:\d+|:\d+)\)?\s*$/.exec(line);
    if (!m || !(/^at\s/.test(line) || line.includes("@"))) continue;
    const fn = /^at\s+(?:async\s+)?(?:new\s+)?([^\s(]+)\s+\(/.exec(line) || /^([^@\s]*)@/.exec(line);
    return ((fn && fn[1]) ? fn[1] + " " : "") + m[1] + m[2];
  }
  return "";
}

/* ── the report ────────────────────────────────────────────────────────────────────────────── */

/* Shape one report. Returns null when there is nothing to record: an empty message, one of the
   BENIGN classes, or a defect whose top frame belongs to a browser extension.
     raw  = { kind: 'error' | 'rejection', message, stack }
     ctx  = { release, path } */
export function shapeReport(raw, ctx) {
  const r = raw || {};
  const c = ctx || {};
  const kind = r.kind === "rejection" ? "rejection" : "error";
  const rawMessage = String(r.message == null ? "" : r.message).trim();
  if (!rawMessage || BENIGN.test(rawMessage)) return null;
  const rawStack = String(r.stack == null ? "" : r.stack);
  const firstFrame = rawStack.split(/\r?\n/).find((l) => /^\s*at\s|@/.test(l)) || "";
  if (EXTENSION.test(firstFrame)) return null;
  const message = cleanMessage(rawMessage);
  if (!message) return null;
  const stack = cleanStack(rawStack);
  return {
    kind,
    message,
    stack,
    path: cleanPath(c.path),
    release: cleanRelease(c.release),
    frame: topFrame(stack),
  };
}

/* The text a fingerprint is taken over: kind, the message with every number collapsed (an index, a
   size or a coordinate varies between occurrences of one defect), and the top frame WITH its
   position (two defects that say the same thing in two places are two defects). */
export function fingerprintSource(shaped) {
  const s = shaped || {};
  return [s.kind || "error", String(s.message || "").replace(/\d+/g, "0"), s.frame || ""].join("\n");
}

/* SHA-256 over fingerprintSource, first 32 hex digits. Both runtimes have Web Crypto
   (browsers in a secure context; Deno; Node ≥ 19 as globalThis.crypto). */
export async function fingerprint(shaped) {
  const bytes = new TextEncoder().encode(fingerprintSource(shaped));
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let hex = "";
  for (let i = 0; i < 16; i++) hex += d[i].toString(16).padStart(2, "0");
  return hex;
}

/* ── the browser, as a name and a major version ────────────────────────────────────────────── */

/* Derived on the SERVER from the request's User-Agent, so the full string is never stored and the
   client never sends one. Order matters: Edge, Opera and Samsung Internet all also say «Chrome», and
   Chrome and every iOS browser also say «Safari». */
const UA_RULES = [
  ["Edge", /\bEdg(?:e|A|iOS)?\/(\d+)/],
  ["Opera", /\bOPR\/(\d+)/],
  ["Samsung Internet", /\bSamsungBrowser\/(\d+)/],
  ["Firefox", /\b(?:Firefox|FxiOS)\/(\d+)/],
  ["Chrome", /\b(?:Chrome|CriOS)\/(\d+)/],
  ["Safari", /\bVersion\/(\d+)[.\d]*\s(?:Mobile\/\S+\s)?Safari\//],
];
export function browserOf(ua) {
  const s = String(ua || "");
  for (const [name, re] of UA_RULES) {
    const m = re.exec(s);
    if (m) return cut(name + " " + m[1], MAX.browser);
  }
  return "Other";
}
