// ============================================================================
//  IntMap · gdelt-relay  —  GDELT DOC 2.0, cached  (Supabase Edge Function, Deno)
// ----------------------------------------------------------------------------
//  WHY THIS EXISTS (#R464 — measured, not assumed)
//  -----------------------------------------------
//  #R452 gave Atlas's evidence gathering a clock. Production verification then showed that ONE
//  `analyze` turn spent ~45 s on GDELT and came back with ZERO BYTES, three times over. The reason
//  was not the clock. Measured against api.gdeltproject.org on 2026-08-25, 15 samples:
//
//      200 OK    x3    14.1 s / 19.6 s / 26.0 s     ACAO: *   cache-control: public, max-age=900
//      429       x12   10.7 s ... 15.8 s            NO ACAO HEADER AT ALL
//
//  Two facts follow, and both contradict what the app was built on:
//
//   1. THE FASTEST THING GDELT EVER DOES IS 10.7 s. js/proxy-fetch.js gave the direct attempt
//      DIRECT_TIMEOUT_MS = 6 s, so the direct path could not succeed — not "usually failed",
//      could not succeed. The measured 6.1 / 7.0 / 6.7 s in the report are that deadline firing.
//
//   2. "A CORS REFUSAL COSTS NOTHING, IT REJECTS BEFORE A BYTE MOVES" (js/atlas-deadlines.js,
//      #R452) IS FALSE FOR THIS HOST. It is true of a rejected PRE-FLIGHT. GDELT's 429 is a real
//      response that takes 10.7-15.8 s to arrive and merely lacks ACAO, so the browser waits out
//      the whole round trip and only then refuses to show it. That sentence is why the 6 s
//      deadline looked safe: a free refusal can be retried, a twelve-second one cannot.
//
//  AND THE PUBLIC RELAY LADDER IS GONE FOR THIS HOST — measured the same day:
//      corsproxy.io    403  {"error":"Server-side requests are not allowed on your plan..."}  0.09 s
//      api.codetabs    522                                                                   19.8 s
//      api.allorigins  timeout                                                              >30.0 s
//
//  WHY THIS OVERRIDES DECISIONS.md's "GDELT is fetched directly" — THE PREMISE WAS TESTED
//  -------------------------------------------------------------------------------------
//  That line's reasoning was: GDELT's limit is PER IP, so readers on their own IPs have more room
//  between them than one shared Edge Function egress would. The prediction it makes is that a
//  shared cloud IP does WORSE than a residential one. Measured, same minute, same query:
//
//      residential IP (JP)             429 x4, 200 x1     10.7-26.0 s
//      Supabase edge (ap-northeast-1)  429 x3, 200 x1     10.7-19.6 s
//
//  The two are indistinguishable. The egress IP is not the variable — GDELT is throttling far below
//  its documented "one request every 5 seconds" (a request sent after TEN seconds of idle still
//  drew a 429), so per-reader IPs buy nothing worth protecting.
//
//  What DOES reduce upstream load is the thing a browser cannot do: REMEMBER THE ANSWER. GDELT
//  stamps its own replies `public, max-age=900`, so one upstream read is good for fifteen minutes
//  for every reader asking about that topic. This function therefore sends FEWER requests to GDELT
//  than the status quo, not more — the structure #R341 already used for aviation-feed:
//
//      IntMap readers  -->  gdelt-relay  -->  ONE upstream read per query per 15 min  -->  GDELT
//
//  NOTHING IS TAKEN FROM ATLAS (CONSTITUTION.md section 5). No source is dropped and no count is
//  lowered; a dataset that was unreachable becomes reachable. When the cache is cold AND GDELT
//  429s, the answer is the same honest "unavailable" the pipeline has always printed — reached in
//  ~12 s instead of ~45 s, and having warmed the cache for the next reader.
//
//  WHERE THE CACHE LIVES, AND WHY NOT IN THIS ISOLATE. Measured against a deployed probe:
//  `caches.open()` throws "Web Cache is not available in this context", and a module-level Map is
//  worthless because three consecutive calls each reported hits=1 with a different execution id —
//  Supabase hands every request a cold isolate. This is the same wall #R341 hit and recorded in
//  migration 20260823130000, so the answer is the same one: Supabase Storage.
//
//  NOT AN OPEN PROXY, AND NOT AN UNBOUNDED WRITER. Only api.gdeltproject.org's DOC 2.0 endpoint is
//  forwarded, with an allow-list of the six parameters js/atlas-sources.js builds. A cache object is
//  written ONLY after an upstream 200 — so the number of objects a caller can create is bounded by
//  GDELT's own throttle (measured: roughly one success per several seconds, globally), not by how
//  fast they can send requests.
//
//  Deploy: supabase functions deploy gdelt-relay --no-verify-jwt --project-ref vpekfwdpurzejrrmacac --use-api
//  Secrets: GDELT_STORAGE_KEY — a service-role key for Storage. See storageKey() for why the
//           platform-injected SUPABASE_SERVICE_ROLE_KEY is not enough here (measured AccessDenied).
// ============================================================================

import { corsFor, fetchGuarded, methodGate, relayFail, MAX_QUERY_URL } from "../_shared/relay-guard.js";
import { callerGate } from "../_shared/rate-limit.js";

/* ⚠⚠⚠ (#R468) THE DIAGNOSTIC HEADERS HAVE TO BE EXPOSED, OR THEY DO NOT EXIST WHERE THEY ARE READ.
   #R464 added `x-intmap-gdelt-cache` / `-age-ms` / `-store` for one stated reason: a cache that
   silently fails to persist looks EXACTLY like a cache that is working — every request becomes a
   "miss" that returns real data, so the reader sees answers and only the upstream notices. It paid
   for itself within the hour, reporting `http400:AccessDenied` the first time the write path ran.

   And then production verification could not read a single one of them. Measured from the live
   origin, four fetches of this endpoint: 200 each time, 14 articles each time, and of the response
   headers JavaScript could see only the three CORS-safelisted ones (cache-control, content-length,
   content-type). The values were there — the same requests made with curl showed
   `x-intmap-gdelt-cache: stale, age-ms: 5,941,649` — but a browser is not allowed to read a header
   the server does not name in `Access-Control-Expose-Headers`, and this function named none.

   ⚠ So the diagnostic existed everywhere EXCEPT the surface where the app runs and where production
   verification happens. aviation-feed has listed its `x-intmap-*` headers since #R341 for exactly
   this reason; this is the same list, for the same purpose. */
const CORS = {
  ...corsFor(),
  "Access-Control-Expose-Headers":
    "x-intmap-gdelt-cache, x-intmap-gdelt-age-ms, x-intmap-gdelt-store, x-intmap-gdelt-upstream, " +
    "x-intmap-gdelt-warm",
};

/* GDELT's artlist replies measured 4.1-4.8 kB; 2 MB is three orders of magnitude of headroom. */
const MAX_BYTES = 2 * 1024 * 1024;

/* 25 s, NOT the 12 s news-relay uses, because the measurement above says a SUCCESS takes
   14.1-26.0 s. A deadline shorter than the upstream's successful response time does not protect
   anything — it just guarantees the failure it was meant to bound. */
const UPSTREAM_TIMEOUT_MS = 25000;

/* ⚠⚠⚠ (#R769) HOW LONG THE WARM BEHIND A COLD MISS MAY RUN, AND WHY IT EXISTS AT ALL.
   Branch 2 below refreshes a STALE entry behind the reader. Branch 4 — the cache is EMPTY and GDELT
   refused — did not, so the one case where the cache holds nothing was also the one case where
   nothing was ever written to it. Every reader paid a full refusal and left the shelf as empty as
   they found it; the next reader started from the same place. Measured from production on
   2026-09-17, eight consecutive reads of this endpoint: 502 x8, every one of them 'cold'.

   The retry is worth running because the FIRST toss is the one that loses. Measured the same day
   against api.gdeltproject.org, six back-to-back pairs of identical requests:

       the request that drew the 429     0 successes / 6      429 in  9.4-13.4 s
       an IMMEDIATE retry after it       3 successes / 6      200 in 14.9-19.6 s

   ⚠ THAT IS WHY THE RETRY CANNOT LIVE INSIDE THE READER'S REQUEST. js/proxy-fetch.js gives this
   function OWN_RELAY_TIMEOUT_MS = 28 s end to end; a first attempt spends ~10 s of it and a SUCCESS
   then needs another 15-20 s, so a retry started in-band would be aborted about as often as it
   would have worked. EdgeRuntime.waitUntil outlives the response — the same mechanism branch 2
   already uses — so the reader waits no longer than before and the shelf is stocked for whoever
   asks next.

   ⚠ THE AMPLIFICATION THIS ADDS IS SELF-LIMITING, and that is the only reason it is allowed to
   exist. A warm runs ONLY on a cold miss, and one successful warm makes that query fresh for 15 min
   and servable for 6 h — so the warms stop because they worked. What it must not become is an
   unbounded loop, and the budget below is the whole of it.
   ⚠ Expires when GDELT stops refusing most first attempts (docs/MONITORING.md section 1c measures
   exactly that) — then one in-band attempt succeeds and this budget is dead weight. */
const WARM_BUDGET_MS = 45000;

/* ⚠ DO NOT START AN ATTEMPT THAT CANNOT FINISH. Measured 2026-09-17 over 29 requests: the fastest
   response api.gdeltproject.org gave of ANY kind — refusals included — was 9,443 ms. A deadline
   under that does not bound a failure, it manufactures one (#R464 recorded the same mistake in the
   6 s direct deadline). */
const MIN_ATTEMPT_MS = 9500;

/* GDELT's own `cache-control: public, max-age=900`. Using the upstream's number rather than one of
   ours means this cache never claims data is fresher than its publisher says it is. */
const FRESH_MS = 900000;

/* HOW LONG A STALE ANSWER IS STILL WORTH SERVING. GDELT refuses ~80% of requests, so "fresh or
   nothing" would throw away a perfectly good article list because it is sixteen minutes old and
   print "unavailable" instead. Six hours is well inside the 3-day window the app actually queries
   (`timespan=3d`), and every stale answer is labelled — for the reader in the analyze footer, and
   on the wire in `x-intmap-gdelt-age-ms`. */
const STALE_MS = 6 * 3600 * 1000;

const BUCKET = "gdelt";

/* -- the allow-list ---------------------------------------------------------------------------
   js/atlas-sources.js builds exactly one URL shape. Checked structurally rather than with a prefix
   test, so a crafted string cannot smuggle a different host past a `startsWith`. */
const ALLOWED_PARAMS = new Set(["query", "mode", "maxrecords", "format", "timespan", "sort"]);
const MAX_QUERY_CHARS = 512;
function allowed(raw) {
  let u;
  try { u = new URL(raw); } catch (_) { return false; }
  if (u.protocol !== "https:") return false;
  if (u.hostname !== "api.gdeltproject.org") return false;
  if (u.pathname !== "/api/v2/doc/doc") return false;
  if (u.hash) return false;
  let sawQuery = false;
  for (const [k, v] of u.searchParams) {
    if (!ALLOWED_PARAMS.has(k)) return false;
    if (v.length > MAX_QUERY_CHARS) return false;
    if (k === "query") { sawQuery = true; continue; }
    /* mode/format/sort/timespan/maxrecords are enumerations and small integers, never payloads. */
    if (!/^[A-Za-z0-9_:.-]{1,32}$/.test(v)) return false;
  }
  return sawQuery;
}

/* THE KEY IS THE CANONICAL URL, NOT THE ONE THAT ARRIVED. `?query=X&mode=artlist` and
   `?mode=artlist&query=X` are the same question, and caching them separately would halve the hit
   rate for no reason. Sorting the parameters makes the key depend on the QUESTION. */
function canonical(raw) {
  const u = new URL(raw);
  const ps = [...u.searchParams].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return "https://api.gdeltproject.org/api/v2/doc/doc?" +
    ps.map(function (p) { return encodeURIComponent(p[0]) + "=" + encodeURIComponent(p[1]); }).join("&");
}

async function cacheKey(canonUrl) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonUrl));
  return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("") + ".json";
}

function env(n) { try { return Deno.env.get(n) || ""; } catch (_) { return ""; } }
function svcUrl(path) {
  const base = env("SUPABASE_URL").replace(/\/$/, "");
  return base ? base + path : "";
}
/* GDELT_STORAGE_KEY FIRST, AND THAT ORDER IS A MEASUREMENT, NOT A PREFERENCE. The platform-injected
   `SUPABASE_SERVICE_ROLE_KEY` is present in this project's environment and Storage refuses it:
   the deployed function's first successful upstream read reported
   `x-intmap-gdelt-store: http400:AccessDenied` while the very same request written by hand with the
   project's service-role key succeeded. (This project's keys were rotated to the `sb_secret_...`
   format, so the legacy name no longer carries a credential Storage honours.) aviation-feed has
   AVIATION_STORAGE_KEY at the head of its own list for the same reason; the platform names stay
   behind it so a project that has not been rotated still works with no secret set at all. */
function storageKey() {
  return env("GDELT_STORAGE_KEY") || env("SUPABASE_SERVICE_ROLE_KEY") || env("SB_SECRET_KEY");
}

/* -- the cache -------------------------------------------------------------------------------- */

async function readCache(key) {
  const u = svcUrl("/storage/v1/object/public/" + BUCKET + "/" + key);
  if (!u) return null;
  try {
    /* the cache-buster is not optional: the object is public, so the CDN in front of Storage would
       otherwise answer with its own copy and this function could never see a refresh. */
    const r = await fetch(u + "?t=" + Date.now(), { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const j = JSON.parse(await r.text());
    if (!j || typeof j.t !== "number" || typeof j.b !== "string") return null;
    return j;
  } catch (_) { return null; }
}

let BUCKET_TRIED = false;
/*  Migration 20260825120000 declares this bucket and is the record of intent. This is the BOOTSTRAP,
 *  for the same reason aviation-feed has one: applying a migration to production needs the database
 *  password (docs/MIGRATIONS.md), and this function already holds the service role key. Idempotent,
 *  tried once per isolate; a 409 "already exists" is success. */
async function ensureBucket() {
  if (BUCKET_TRIED) return "skipped";
  BUCKET_TRIED = true;
  const key = storageKey();
  const u = svcUrl("/storage/v1/bucket");
  if (!key || !u) return "no-cred";
  try {
    const r = await fetch(u, {
      method: "POST",
      headers: { authorization: "Bearer " + key, "content-type": "application/json" },
      body: JSON.stringify({
        id: BUCKET, name: BUCKET, public: true,
        file_size_limit: MAX_BYTES, allowed_mime_types: ["application/json"],
      }),
      signal: AbortSignal.timeout(8000),
    });
    /* 409 "already exists" is success. */
    if (r.ok || r.status === 409) return "ok" + r.status;
    let code = "";
    try { const j = JSON.parse(await r.text()); code = String((j && (j.code || j.error)) || "").slice(0, 40); } catch (_) { code = ""; }
    return "http" + r.status + (code ? ":" + code : "");
  } catch (e) { return "throw:" + ((e && e.name) || "err"); }
}

/* THE OUTCOME OF THE WRITE IS REPORTED ON THE WIRE, and that is not decoration. A cache that
   silently fails to persist looks exactly like a cache that is working — every request is a "miss"
   that returns real data, so the reader sees answers and only GDELT notices. #R341 needed the same
   diagnostic for the same reason and called it `saveNote`; this round needed it within twenty
   minutes of deploying. The isolate is per-request (measured), so a module-level slot is
   request-scoped by construction. */
let STORE_NOTE = "";
async function writeCache(key, body) {
  const k = storageKey();
  const u = svcUrl("/storage/v1/object/" + BUCKET + "/" + key);
  if (!k) { STORE_NOTE = "no-key"; return false; }
  if (!u) { STORE_NOTE = "no-url"; return false; }
  const payload = JSON.stringify({ t: Date.now(), b: body });
  const put = function () {
    return fetch(u, {
      method: "POST",
      headers: {
        authorization: "Bearer " + k, "content-type": "application/json",
        "cache-control": "max-age=60", "x-upsert": "true",
      },
      body: payload,
      signal: AbortSignal.timeout(10000),
    });
  };
  try {
    let r = await put();
    /* 404 = no such bucket. Make it, once, and try again. */
    if (r.status === 404) { STORE_NOTE = "mkbucket:" + (await ensureBucket()); r = await put(); }
    if (r.ok) { STORE_NOTE = (STORE_NOTE ? STORE_NOTE + "," : "") + "ok"; return true; }
    /* The status plus Storage's own `code` enum and nothing else. The message field can echo a
       path; the code is a fixed identifier (NoSuchBucket / InvalidJWT / ...) and is the one thing
       that separates "wrong credential" from "wrong request" without leaking either. */
    let code = "";
    try { const j = JSON.parse(await r.text()); code = String((j && (j.code || j.error)) || "").slice(0, 40); } catch (_) { code = ""; }
    STORE_NOTE = (STORE_NOTE ? STORE_NOTE + "," : "") + "http" + r.status + (code ? ":" + code : "");
    return false;
  } catch (e) { STORE_NOTE = "throw:" + ((e && e.name) || "err"); return false; }
}

/* ⚠⚠⚠ (#R769) WHAT THE UPSTREAM ACTUALLY SAID, because until this round nothing did.
   #R468 put the diagnostic on this endpoint for one stated reason — 「the one outcome a reader
   actually complains about was the one outcome nobody could explain」 — and then left the refusal
   itself unnamed. Measured from production 2026-09-17: eight 502s, every one carrying
   'x-intmap-gdelt-cache: cold' and NOTHING ELSE, so from outside this function 「GDELT refused」,
   「GDELT answered with something that was not an artlist」 and 「GDELT could not be reached」 were
   one indistinguishable event. They are three different faults with three different answers.
   Request-scoped for the same reason STORE_NOTE is: Supabase hands every request a cold isolate. */
let UPSTREAM_NOTE = "";

/* Upstream reads until the budget runs out, and the cache write that makes one worth something to
   everybody else. Returns the body text, or null — and leaves UPSTREAM_NOTE naming why not. */
async function refresh(canonUrl, key, budgetMs, maxTries) {
  const t0 = Date.now();
  const budget = budgetMs > 0 ? budgetMs : UPSTREAM_TIMEOUT_MS;
  const cap = maxTries > 0 ? maxTries : Infinity;
  const left = function () { return budget - (Date.now() - t0); };
  let tries = 0;
  let why = "no-attempt";
  /* ⚠ THE FLOOR IS CHECKED BEFORE EACH ATTEMPT, NOT ONLY BEFORE THE FIRST. Consulting a budget
     only decides whether to START one; a second attempt begun with 3 s left is a manufactured
     failure that also spends a slot GDELT counts (#R464 handed wLeft() to each call for this).
     ⚠ AND THE COUNT IS A SEPARATE LIMIT FROM THE CLOCK, because the in-band caller wants exactly
     one attempt and the budget alone does not say so: a 429 returning at 10 s leaves 15 s of a 25 s
     budget, which is over the floor, so「one attempt」written in a comment above a loop bounded only
     by time is a comment that its own code contradicts. */
  while (left() >= MIN_ATTEMPT_MS && tries < cap) {
    tries++;
    let r = null;
    try {
      r = await fetchGuarded(canonUrl, {
        timeoutMs: Math.min(UPSTREAM_TIMEOUT_MS, left()),
        maxBytes: MAX_BYTES,
        contentTypeRe: /json/i,
        headers: {
          accept: "application/json",
          "user-agent": "IntMap/1.0 (+https://rwmqx7dwb5-arch.github.io/IntMap/)",
        },
      });
    } catch (e) {
      /* fetchGuarded throws a CODE for unreachable / wrong-type / too-large. It used to travel out
         of here to relayFail; now it is retryable like any other refusal, so the code is kept
         rather than lost — this is the only place that still knows it. */
      why = String((e && e.code) || "unreachable").slice(0, 24);
      continue;
    }
    /* 429 IS THE COMMON CASE, NOT THE EXCEPTION (12 of 15 measured in #R464; 24 of 29 on
       2026-09-17). It is not an error to log and forget — it is the reason this cache exists, and
       the reason a stale hit is served instead. */
    if (!r.ok) { why = String(r.status); continue; }
    const txt = r.text();
    /* An upstream that answers 200 with something that is not the artlist JSON must not be cached
       as if it were — the same rule news-relay applies to Google's interstitial.
       ⚠⚠⚠ (#R769) …AND IT IS NOT RETRIED, BECAUSE A RETRY CANNOT CHANGE IT. The retry above is
       justified by one specific measurement — a REFUSAL is a queue decision, so the same request
       sent again is a fresh draw (0/6 became 3/6). A 200 whose body is not an artlist is not a
       draw; it is the upstream's answer to this question, and asking again spends a slot GDELT
       counts to be told the same thing. Measured 2026-09-17, every 200 api.gdeltproject.org gave
       for ANY of five query shapes and two modes — sort=hybridrel / HybridRel / DateDesc,
       query=Ukraine and query=climate, mode=artlist and mode=timelinevol — was the two bytes `{}`.
       Retrying that would have tripled the load on a refusing upstream for a payoff of zero, which
       is the opposite of what WARM_BUDGET_MS is allowed to exist for. */
    let j = null;
    try { j = JSON.parse(txt); } catch (_) { why = "not-json"; break; }
    if (!j || typeof j !== "object" || !Array.isArray(j.articles)) { why = "not-artlist"; break; }
    await writeCache(key, txt);
    UPSTREAM_NOTE = "200/" + tries;
    return txt;
  }
  UPSTREAM_NOTE = why + "/" + tries;
  return null;
}

/* ⚠⚠⚠ (#R769) A WARM THAT NEVER RUNS LOOKS EXACTLY LIKE A WARM THAT RUNS AND IS REFUSED.
   #R464 wrote that sentence about the cache WRITE ("a cache that silently fails to persist looks
   exactly like a cache that is working") and it is just as true one level up: from outside, an
   isolate torn down before waitUntil fires and an isolate that spent 45 s drawing 429s produce the
   identical observation — the next reader still gets 'cold'. Measured while building this round: at
   a moment when api.gdeltproject.org refused 5 direct requests out of 5, the two explanations could
   not be told apart, so the fix could not be verified at all.
   ⇒ the warm leaves a receipt, and the next cold or stale answer carries it in
   `x-intmap-gdelt-warm`. It is one small object per query, written where the cache already lives.
   ⚠ The receipt is written on FAILURE too — that is the whole point; a receipt only kept when
   things worked would say nothing on the day this matters. */
const WARM_KEY_PREFIX = "warm-";

async function warmBehind(canonUrl, key, budgetMs) {
  try {
    EdgeRuntime.waitUntil((async function () {
      const t0 = Date.now();
      let note = "throw";
      try {
        const txt = await refresh(canonUrl, key, budgetMs);
        note = (txt ? "hit:" : "miss:") + (UPSTREAM_NOTE || "-");
      } catch (_) { /* the receipt below is the only thing that still has to happen */ }
      await writeCache(WARM_KEY_PREFIX + key, JSON.stringify({ note, ms: Date.now() - t0 }));
    })());
    return "started";
  } catch (_) {
    /* the warm is best-effort; the answer already went out. ⚠ AND THE READER IS TOLD it did not
       start — 'unavailable' is a different fact from 'ran and was refused'. */
    return "no-waituntil";
  }
}

/* The last receipt, for the answer that is about to say 'cold' or 'stale'. Never blocks that answer
   on anything but one short read of an object that is already public. */
async function lastWarm(key) {
  const j = await readCache(WARM_KEY_PREFIX + key);
  if (!j) return "none";
  let r = null;
  try { r = JSON.parse(j.b); } catch (_) { return "unreadable"; }
  return String((r && r.note) || "-").slice(0, 40) + "@" + Math.round((Date.now() - j.t) / 1000) + "s";
}

function answer(body, ageMs, note, warmNote) {
  return new Response(body, {
    headers: {
      ...CORS,
      "content-type": "application/json; charset=utf-8",
      "x-intmap-gdelt-age-ms": String(ageMs),
      "x-intmap-gdelt-cache": note,
      "x-intmap-gdelt-store": STORE_NOTE || "-",
      "x-intmap-gdelt-upstream": UPSTREAM_NOTE || "-",
      "x-intmap-gdelt-warm": warmNote || "-",
      /* the browser may keep it for the remainder of the window GDELT itself named */
      "cache-control": "public, max-age=" + Math.max(0, Math.round((FRESH_MS - ageMs) / 1000)),
    },
  });
}

// NOTE: written WITHOUT TypeScript annotations, like news-relay, sv-cov and cable-geo —
// scripts/static-checks.mjs parses every committed .ts with acorn, so a type annotation here fails
// the build gate.
/* (own-fetch-relay) THE CALLER'S SHARE of the shared bucket (_shared/rate-limit.js multiplies it by the
   readers one address may hold, and says when the estimate expires). The most requests one reader's
   page makes of this function in a minute:
   Atlas asks GDELT once per evidence search (js/atlas-sources.js, js/atlas-deadlines.js) and the
   health probe once per five minutes. ESTIMATED from the callers. */
const READER_PER_MIN = 20;

Deno.serve(async (req) => {
  const gate = methodGate(req, CORS);
  if (gate) return gate;
  const limited = await callerGate(req, CORS, { scope: "gdelt-relay", readerPerMin: READER_PER_MIN, env: (k) => Deno.env.get(k) || "" });
  if (limited) return limited;

  const raw = new URL(req.url).searchParams.get("u") || "";
  if (raw.length > MAX_QUERY_URL || !allowed(raw)) {
    return new Response(
      JSON.stringify({ error: "only https://api.gdeltproject.org/api/v2/doc/doc?query=... is relayed" }),
      { status: 400, headers: { ...CORS, "content-type": "application/json" } },
    );
  }

  try {
    const canonUrl = canonical(raw);
    const key = await cacheKey(canonUrl);
    const hit = await readCache(key);
    const age = hit ? (Date.now() - hit.t) : Infinity;

    /* 1) fresh — nobody touches GDELT */
    if (hit && age < FRESH_MS) return answer(hit.b, age, "fresh");

    /* 2) stale but usable — answer NOW and refresh behind the reader. EdgeRuntime.waitUntil is what
       makes this honest: without it the isolate is torn down when the response is returned and the
       refresh would be cancelled mid-flight, so the entry would never stop being stale. (Probed on
       the deployed function: `typeof EdgeRuntime.waitUntil === "function"`.) */
    if (hit && age < STALE_MS) {
      /* ⚠ the receipt is read BEFORE the next warm is started, or this answer would be reporting on
         a warm that has not done anything yet. */
      const prev = await lastWarm(key);
      const started = await warmBehind(canonUrl, key, WARM_BUDGET_MS);
      return answer(hit.b, age, "stale", started + "/" + prev);
    }

    /* 3) cold — this reader pays for the upstream read, and everybody after them does not.
       ⚠ (#R769) ONE attempt, and the budget is the reader's, not this function's own. What made
       「everybody after them does not」 false was not the size of this deadline — it was branch 4
       below giving up without leaving anything behind. */
    const fresh = await refresh(canonUrl, key, UPSTREAM_TIMEOUT_MS, 1);
    if (fresh) return answer(fresh, 0, "miss");

    /* 4) cold AND refused. The pipeline's honest "unavailable", reached in ~12 s rather than ~45.
       ⚠ (#R468) THIS ANSWER CARRIES THE SAME DIAGNOSTIC AS THE OTHERS. It used to carry none, which
       made the one outcome a reader actually complains about the one outcome nobody could explain:
       measured from production, an uncached query spent 12.7-14.8 s and returned this 502 with no
       `x-intmap-*` header of any kind, so 「the cache had nothing」 and 「GDELT refused a refresh of
       something we had」 were indistinguishable from outside. `cold` says which. */
    /* ⚠⚠⚠ (#R769) …AND IT DOES NOT LEAVE THE SHELF AS EMPTY AS IT FOUND IT. The reader is answered
       now, with the reason named; the warm keeps trying on the budget above so the NEXT reader of
       this query gets a hit instead of repeating this. */
    /* ⚠ THE NOTE IS TAKEN BEFORE THE WARM STARTS. UPSTREAM_NOTE is module state and the warm writes
       to it; reading it afterwards would make what this reader is told depend on the order of two
       statements rather than on what happened to this reader. */
    const coldNote = UPSTREAM_NOTE || "-";
    const prevWarm = await lastWarm(key);
    const warmStarted = await warmBehind(canonUrl, key, WARM_BUDGET_MS);
    return new Response(JSON.stringify({ error: "upstream_unavailable", upstream: coldNote }), {
      status: 502,
      headers: {
        ...CORS,
        "content-type": "application/json",
        "x-intmap-gdelt-cache": "cold",
        "x-intmap-gdelt-store": STORE_NOTE || "-",
        "x-intmap-gdelt-upstream": coldNote,
        "x-intmap-gdelt-warm": warmStarted + "/" + prevWarm,
      },
    });
  } catch (e) {
    /* A CODE, NOT THE EXCEPTION — this endpoint is world-readable (CodeQL js/stack-trace-exposure). */
    return relayFail(e, CORS);
  }
});
