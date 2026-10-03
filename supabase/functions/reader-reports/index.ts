// ============================================================================
//  IntMap · reader-reports — where a reader's feedback and bug reports are written  (anon-write-guard)
// ----------------------------------------------------------------------------
//  WHY: the feedback form and the bug reporter (js/feedback.js) inserted into public.feedback and
//  public.bug_reports straight through PostgREST, as `anon` or `authenticated`. #R155 bounded how
//  long one row could be; nothing bounded how many. The publishable key is in every page, so a loop
//  of `POST /rest/v1/feedback` could write PII-bearing rows — the rows an admin reads one by one —
//  for as long as it ran. Migration 20260930090000_anon_write_guard.sql closes that path; this
//  function is the path that replaced it.
//
//  THE SHAPE IS client-errors' (client-error-log), not a new one:
//    · POST only; a body ceiling read with relay-guard's readCapped (content-length AND streamed).
//    · Origin: the production site or a local preview (client-error-shape.js originAllowed — the one
//      origin rule; this file does not restate it). ⚠ Only a browser is held to an Origin, so this
//      keeps other SITES' pages out; it is not what bounds a script. That is:
//    · two SHARED token buckets (_shared/rate-limit.js → public.relay_take): one per caller, one for
//      the whole project per day. Both fail CLOSED — a limiter that cannot be consulted means the
//      database that would store the report is not answering either, and the bug reporter keeps the
//      report on the device when the send fails (js/feedback.js), so nothing is lost by refusing.
//    · only the fields each table has are read from the body, each under the database's own ceiling
//      (the #R155 len_guard constraints are the canonical numbers; see LIMITS). `created_at`,
//      `id` and anything else a caller adds are ignored.
//
//  WHO A REPORT IS FROM (the rule #R801 wrote into the dropped INSERT policy — «anonymous or the
//  caller's own, never somebody else's» — kept, and now enforced here):
//    · no Authorization, or the publishable key itself → an anonymous report. `user_id` is null; the
//      e-mail is what the reader typed into the form, if anything.
//    · a user's access token → asked of the Auth server (/auth/v1/user). `user_id` and `email` are
//      the VERIFIED account's; whatever the body says about either is ignored. A token the Auth
//      server refuses is 401 — a report is not quietly filed as anonymous when the reader believes
//      they are signed in.
//
//  ⚠ THE CALLER'S ADDRESS IS NOT STORED. The per-caller bucket is keyed by the account when there
//  is one, otherwise by an HMAC of the address (_shared/rate-limit.js hashedCallerKey — the key
//  client-errors uses). The rows themselves carry what they always carried: the User-Agent the page
//  sends (clamped), the page path, the language.
//
//  Deploy:  supabase functions deploy reader-reports --project-ref vpekfwdpurzejrrmacac --use-api
//  (verify_jwt = false — a reader who is not signed in can send feedback; supabase/config.toml.)
//
//  NOTE: written WITHOUT TypeScript annotations, like client-errors — the node tests import this file.
// ============================================================================
import { corsFor, readCapped, RelayError } from "../_shared/relay-guard.js";
import { makeLimiter, restRpcClient, hashedCallerKey, READERS_PER_ADDRESS } from "../_shared/rate-limit.js";
import { MAX as ERROR_MAX, originAllowed } from "../_shared/client-error-shape.js";
import { INQUIRY, INQUIRY_LIMITS, isReplyAddress } from "../_shared/inquiry-shape.js";

/* THE COLUMN CEILINGS. Canonical: the #R155 CHECK constraints (feedback_len_guard,
   bug_reports_len_guard in 20260722100000_security_r155.sql) — restated here so that an over-long
   field is answered 400 before the database is asked, not so that a second opinion exists. Where
   a column has no constraint the number is derived from what the page sends:
     · lang 16 — js/lang-registry.js ids are two letters; 16 leaves room for a region tag.
     · build = client-error-shape.js MAX.release (the same INTMAP_BUILD string).
     · a bug report's ua / page — the feedback table's own ceilings for the same two values.
     · diagnostics 16,384 characters of JSON. Derived from js/feedback.js _imDiag(): at most 12
       ring-buffer entries of ≤ 400 + 300 characters (index.html's __imErrors push) ≈ 9,000, ≤ 40
       layer names, and a dozen scalars — about 11,000; 16 K is that with headroom. Expires if
       _imDiag() grows a field; the bug reporter then sees 413 and keeps the report on the device. */
export const LIMITS = {
  feedback: { comment: 5000, email: 254, page: 400, ua: 600, lang: 16 },
  bug: { description: 10000, email: 254, category: 120, page: 400, ua: 600, lang: 16, build: ERROR_MAX.release },
  diagnosticsChars: 16384,
  inquiry: INQUIRY_LIMITS,   /* (sales-channels) _shared/inquiry-shape.js */
};

/* ══ (sales-channels) AN ORGANISATION'S ENQUIRY — the third kind this function writes ════════════════
   contact.html / ja/contact.html (generated by scripts/org-pages.mjs, posted by js/org-page.js) send
   { kind: 'inquiry', audience, purpose, name, email, … , consent: true }. The row goes to
   public.org_inquiries through the same buckets, origin rule and service-role write as the two kinds
   above — the table has no INSERT policy for anyone (supabase/tests/14 holds every table to that).
   What the words may be, why the reply address is the typed one, and the honeypot are in
   _shared/inquiry-shape.js — the one declaration this function, the page generator and the table's
   CHECKs agree on (tests/sales-channels-checks.test.mjs holds the three equal). */

/* THE NUMBERS (.agents/rules/no-ad-hoc-hardcoding.md §4 — observation, expiry, canonical place):
   · MAX_BODY_BYTES = 64 KiB. Derived: a description of 10,000 characters is ≤ 30,000 bytes of UTF-8
     even when every character is CJK, plus diagnostics ≤ 16,384 characters (ASCII-escaped JSON),
     plus the short fields. Expires with LIMITS.
   · PER_READER_PER_HOUR = 6. An ESTIMATE: both forms are typed by a person, and six in an hour is
     already more than anyone reports about one session; the bucket refills continuously, so a
     reader who sends one now and then never meets it. An anonymous caller is keyed by address, and
     an address may hold several readers (an office, a school, a carrier NAT), so its bucket is this
     × READERS_PER_ADDRESS — the one estimate every shared bucket uses (_shared/rate-limit.js says
     when it expires). A signed-in reader has their own bucket of six. Expires the first time a
     reader is refused here (`rate_limit` with nothing else wrong) — then this number goes up.
   · GLOBAL_PER_DAY = 500 reports. An ESTIMATE, not a measurement — nobody has counted how many
     reports readers send in a day. It is meant to sit well above that, and low enough that a script
     cycling addresses cannot turn the tables into a write amplifier or bury the admin's reading
     list. Expires the first day the global bucket refuses a report while admin.html shows nothing
     but readers' reports that day; raised on purpose via READER_REPORTS_GLOBAL_PER_DAY, never by
     editing code. */
export const MAX_BODY_BYTES = 64 * 1024;
export const PER_READER_PER_HOUR = 6;
function envCeiling(name, fallback) {
  const v = Number(Deno.env.get(name) || "");
  return (Number.isFinite(v) && v >= 1) ? Math.floor(v) : fallback;
}
export const GLOBAL_PER_DAY = envCeiling("READER_REPORTS_GLOBAL_PER_DAY", 500);
const SCOPE_CALLER = "reader-reports:caller";
const SCOPE_GLOBAL_DAY = "reader-reports:global:day";

/* How long the Auth server and the insert may take before they count as «did not answer». The same
   observation _shared/rate-limit.js RPC_TIMEOUT_MS records for a same-region PostgREST call (tens of
   milliseconds), and atlas-embed gives /auth/v1/user 5 s. Expires with either. */
const AUTH_TIMEOUT_MS = 5000;
const INSERT_TIMEOUT_MS = 5000;

/* CORS for an ALLOWED origin only — echoed, never `*`; a foreign origin gets no ACAO at all. The
   allowed request headers are the shared builder's (relay-guard corsFor), as client-errors explains. */
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

function say(cors, body, status, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store", ...(extra || {}) },
  });
}

/* A text field: absent / null → null; a string → trimmed, and refused when over its ceiling;
   anything else → refused. Returns { ok, value }. */
function text(v, max) {
  if (v == null) return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false, value: null };
  const t = v.trim();
  if (t.length > max) return { ok: false, value: null };
  return { ok: true, value: t || null };
}

/* The body, validated and reduced to the table's columns. Returns { table, row } or { error, status }.
   `user_id` and `email` are NOT decided here — they are the caller's identity, decided in handle(). */
export function shapeReport(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "invalid_request", status: 400 };
  if (body.kind === "feedback") {
    const L = LIMITS.feedback;
    const rating = body.rating;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "invalid_request", status: 400 };
    const f = { comment: text(body.comment, L.comment), page: text(body.page, L.page), ua: text(body.ua, L.ua),
      lang: text(body.lang, L.lang), email: text(body.email, L.email) };
    for (const k in f) if (!f[k].ok) return { error: "invalid_request", status: 400 };
    return { table: "feedback", email: f.email.value,
      row: { rating, comment: f.comment.value, page: f.page.value, ua: f.ua.value, lang: f.lang.value } };
  }
  if (body.kind === "bug") {
    const L = LIMITS.bug;
    const f = { description: text(body.description, L.description), category: text(body.category, L.category),
      page: text(body.page, L.page), ua: text(body.ua, L.ua), lang: text(body.lang, L.lang),
      build: text(body.build, L.build), email: text(body.email, L.email) };
    for (const k in f) if (!f[k].ok) return { error: "invalid_request", status: 400 };
    if (!f.description.value) return { error: "invalid_request", status: 400 };
    let diagnostics = null;
    if (body.diagnostics != null) {
      if (typeof body.diagnostics !== "object" || Array.isArray(body.diagnostics)) return { error: "invalid_request", status: 400 };
      if (JSON.stringify(body.diagnostics).length > LIMITS.diagnosticsChars) return { error: "too_large", status: 413 };
      diagnostics = body.diagnostics;
    }
    return { table: "bug_reports", email: f.email.value,
      row: { description: f.description.value, category: f.category.value, diagnostics, page: f.page.value,
        ua: f.ua.value, lang: f.lang.value, build: f.build.value } };
  }
  if (body.kind === "inquiry") {
    const L = LIMITS.inquiry;
    const trap = body[INQUIRY.honeypot];
    if (trap != null && String(trap).trim() !== "") return { error: "invalid_request", status: 400 };
    if (body.consent !== true) return { error: "invalid_request", status: 400 };
    if (!INQUIRY.audiences.includes(body.audience) || !INQUIRY.purposes.includes(body.purpose)) {
      return { error: "invalid_request", status: 400 };
    }
    const f = { name: text(body.name, L.name), email: text(body.email, L.email), organization: text(body.organization, L.organization),
      role: text(body.role, L.role), website: text(body.website, L.website), country: text(body.country, L.country),
      message: text(body.message, L.message), page: text(body.page, L.page), lang: text(body.lang, L.lang) };
    for (const k in f) if (!f[k].ok) return { error: "invalid_request", status: 400 };
    if (!f.name.value || !f.message.value || !isReplyAddress(f.email.value)) {
      return { error: "invalid_request", status: 400 };
    }
    if (f.website.value && !/^https?:\/\//i.test(f.website.value)) return { error: "invalid_request", status: 400 };
    return { table: "org_inquiries", email: f.email.value, replyTo: true,
      row: { audience: body.audience, purpose: body.purpose, name: f.name.value, organization: f.organization.value,
        role: f.role.value, website: f.website.value, country: f.country.value, message: f.message.value,
        consent: true, page: f.page.value, lang: f.lang.value } };
  }
  return { error: "invalid_request", status: 400 };
}

/* The caller. { kind: 'anonymous' } | { kind: 'user', id, email } | { kind: 'refused' } | { kind: 'unavailable' } */
export async function verifiedCaller(req, env) {
  const auth = req.headers.get("authorization") || "";
  const m = /^bearer\s+(\S+)\s*$/i.exec(auth);
  if (!m) return { kind: "anonymous" };
  const anon = env("SUPABASE_ANON_KEY") || "";
  /* the publishable key is what a signed-out client (or supabase-js) sends: it names no account */
  if (anon && m[1] === anon) return { kind: "anonymous" };
  const url = String(env("SUPABASE_URL") || "").replace(/\/+$/, "");
  if (!url || !anon) return { kind: "unavailable" };
  let r;
  try {
    r = await fetch(url + "/auth/v1/user", {
      headers: { apikey: anon, authorization: "Bearer " + m[1] },
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch (_) { return { kind: "unavailable" }; }
  if (r.status === 401 || r.status === 403) {
    try { await r.body?.cancel(); } catch (_) { /* nothing to drain */ }
    return { kind: "refused" };
  }
  if (!r.ok) {
    try { await r.body?.cancel(); } catch (_) { /* nothing to drain */ }
    return { kind: "unavailable" };
  }
  let u = null;
  try { u = await r.json(); } catch (_) { u = null; }
  if (!u || typeof u.id !== "string" || !u.id) return { kind: "refused" };
  const email = (typeof u.email === "string" && u.email) ? u.email.slice(0, LIMITS.feedback.email) : null;
  return { kind: "user", id: u.id, email };
}

/* One row into one table, as the service role (which bypasses RLS — the write path the migration
   left open to it and to nobody else). → true when the database stored it. */
async function insertRow(env, table, row) {
  const url = String(env("SUPABASE_URL") || "").replace(/\/+$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) return false;
  try {
    const res = await fetch(url + "/rest/v1/" + table, {
      method: "POST",
      headers: { apikey: key, authorization: "Bearer " + key, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(INSERT_TIMEOUT_MS),
    });
    try { await res.body?.cancel(); } catch (_) { /* nothing to drain */ }
    return res.ok;
  } catch (_) {
    /* the cause is not carried: a message could name the database host */
    return false;
  }
}

export async function handle(req) {
  const env = (k) => Deno.env.get(k) || "";
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
  let body = null;
  try { body = JSON.parse(new TextDecoder("utf-8").decode(bytes)); } catch (_) { body = null; }
  const shaped = shapeReport(body);
  if (shaped.error) return say(cors, { error: shaped.error }, shaped.status);

  const caller = await verifiedCaller(req, env);
  if (caller.kind === "refused") return say(cors, { error: "unauthorized" }, 401);
  if (caller.kind === "unavailable") return say(cors, { error: "unavailable" }, 503);

  /* The buckets, BEFORE the write. Built per request from the platform-injected env (a module that
     throws on a missing env answers 500 to everyone — #R505). */
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const limiter = makeLimiter({ db: restRpcClient({ url: env("SUPABASE_URL"), serviceKey }) });
  const signedIn = caller.kind === "user";
  const perCaller = signedIn ? PER_READER_PER_HOUR : PER_READER_PER_HOUR * READERS_PER_ADDRESS;
  const mine = await limiter.take(SCOPE_CALLER, await hashedCallerKey(req, serviceKey, signedIn ? caller.id : ""), {
    capacity: perCaller, refillPerSec: perCaller / 3600, cost: 1, onUnavailable: "deny",
  });
  if (mine.source !== "db") return say(cors, { error: "limiter_unavailable" }, 503);
  if (!mine.allowed) return say(cors, { error: "rate_limit" }, 429, { "retry-after": String(Math.ceil(3600 / perCaller)) });
  const day = await limiter.take(SCOPE_GLOBAL_DAY, "*", {
    capacity: GLOBAL_PER_DAY, refillPerSec: GLOBAL_PER_DAY / 86400, cost: 1, onUnavailable: "deny",
  });
  if (day.source !== "db") return say(cors, { error: "limiter_unavailable" }, 503);
  if (!day.allowed) return say(cors, { error: "rate_limit" }, 429, { "retry-after": String(Math.ceil(86400 / GLOBAL_PER_DAY)) });

  const row = {
    ...shaped.row,
    user_id: signedIn ? caller.id : null,
    /* an enquiry is answered at the address its sender typed (_shared/inquiry-shape.js); a report names the account */
    email: (shaped.replyTo || !signedIn) ? shaped.email : caller.email,
  };
  const stored = await insertRow(env, shaped.table, row);
  if (!stored) return say(cors, { error: "unavailable" }, 503);
  return say(cors, { stored: true }, 201);
}

Deno.serve(handle);
