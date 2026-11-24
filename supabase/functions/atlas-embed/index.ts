// ============================================================================
//  IntMap · atlas-embed  —  the meaning half of Atlas's capability search  (Supabase Edge Function)
// ----------------------------------------------------------------------------
//  WHY THIS EXISTS. 134 of the 145 capabilities are reachable only through find_capability, and
//  until this function the search behind it matched SPELLINGS: aliases, the id, and the words of the
//  catalogue. MEASURED on production (DEV-NOTES #R802): three Japanese requests ran ZERO operations,
//  「現在地」 put view.locate fourth behind three capabilities that merely share a category word, and
//  「地図を現代に戻す」 matched nothing although time.* exists to do exactly that. A request and a
//  capability can mean the same thing in words they do not share, in any of the languages a reader
//  writes; a multilingual embedding is the tool that measures that.
//
//  The lexical search is NOT replaced. js/atlas-capabilities.js fuses the two rankings, and answers
//  with the lexical one alone — SAYING SO in the result — whenever this function cannot be reached.
//
//  ENDPOINT (POST, JSON, login required):
//    { op:"search", catalog:<sha256 hex>, q:<query> }
//        → { state:"ok", model, catalog, sims:{ <capability id>: cosine similarity } }
//          (`model` is the stored key the comparison was made under — route.js storeKey)
//        → { state:"catalog_unknown" }   — nothing is stored under that catalogue yet; the page
//                                          sends it once with op:"seed" (the query is NOT embedded,
//                                          so an unknown catalogue costs nothing upstream)
//    { op:"seed", catalog, entries:[{ id, text }] }
//        → { state:"ok", stored:n }      — idempotent: a catalogue already stored answers ok at once
//  Every other answer carries { state:<code> } with a non-2xx status; the page reports the code as
//  the reason it answered from spellings alone.
//
//  WHAT IS STORED. One row per (catalogue hash, model, capability): the vector of that capability's
//  documentation. The hash is of the documentation itself (core.js), so a changed catalogue is a new
//  key and is embedded afresh, and a stale one is swept (migration). The QUERY is embedded on every
//  call and never stored — neither the text nor its vector.
//
//  WHICH MODEL. Decided by route.js before anything is looked up, from the provider keys this project
//  holds and the providers' own model lists — and the ONE route a request decides is used for the
//  stored-size question, the embedding and the comparison, so vectors of two models are never
//  compared (the `model` column is part of the key). MEASURED 2026-11-20: the OpenAI key reaches no
//  embedding model, so with GEMINI_API_KEY set the route is Google's gemini-embedding family.
//
//  PRIVACY. What reaches the embedding provider from here is the find_capability query Atlas writes —
//  a phrase derived from the reader's request — and IntMap's own capability documentation. The
//  provider is OpenAI or Google, whichever route.js finds can embed (see WHICH MODEL); the privacy
//  page says what is sent (privacy.html).
//
//  Deploy:   supabase functions deploy atlas-embed --project-ref vpekfwdpurzejrrmacac --use-api
//  Secrets:  OPENAI_API_KEY and/or GEMINI_API_KEY (the same secrets ai-proxy and news-ingest read; at
//            least one). With both, the providers' model lists decide (route.js).
//            ATLAS_EMBED_MODEL (optional; a PREFERENCE — used where a provider's list names it, or
//            with a single key, as that key's model)
//            ATLAS_EMBED_GLOBAL_PER_DAY (optional override of the project-wide ceiling)
//            ATLAS_EMBED_PER_USER_PER_DAY (optional override of one account's share of it)
//  (SUPABASE_URL and the project keys are injected by the platform — read through _shared/supabase-keys.js.)
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE — scripts/static-checks.mjs parses it as plain JavaScript.
// ============================================================================

import { corsFor, readCapped, RelayError } from "../_shared/relay-guard.js";
import { makeLimiter, restRpcClient, callerKey, callerKeySecret, READERS_PER_ADDRESS } from "../_shared/rate-limit.js";
import { secretKey, publishableKey, denoEnv } from "../_shared/supabase-keys.js";
/* (edge-spend-and-models) the project-wide ceiling and the one door to the provider, shared with
   every other function that holds a provider key */
import { spendCeiling, providerFetch } from "../_shared/ai-provider.js";
import { parseSearch, parseSeed, batches, EMBED_DIM, MAX_BODY_BYTES } from "./core.js";
import { makeRouter } from "./route.js";

const CORS = { ...corsFor(), "Access-Control-Allow-Methods": "POST, OPTIONS" };

/* ══ THE SPEND CEILING (rate-limit.js is the mechanism; these are this function's numbers) ═══════
   no-ad-hoc-hardcoding §4 — observation, expiry, canonical place (THIS FILE):
   · PER_USER_PER_MIN = 30. A find_capability call is one search. The most measured in one turn is
     eight (#R802, the turn that ran nothing), and a turn takes tens of seconds at the least, so 30
     a minute is several such turns at once from one account. Expires if the tool surface starts
     searching more than once per model step.
   · GLOBAL_PER_DAY = 20000 units, where a search costs 1, a seed costs one unit per document, and a
     model list (route.js — asked once per isolate, and only when two provider keys are set or the
     single key's model was refused) costs 1. Cost observation: text-embedding-3-small is $0.02 per
     million tokens (OpenAI pricing, read 2026-09-25) and gemini-embedding-001 $0.15 (Google pricing,
     read 2026-11); a search phrase is tens of tokens and a full catalogue ~60,000 tokens, so a whole
     day's ceiling spent on seeds (≈138 catalogues of 145 documents) is about US$1.2 at Gemini's
     price, and spent on searches a fraction of a cent. The ceiling bounds a runaway loop, not the
     invoice of honest use. Overridable via ATLAS_EMBED_GLOBAL_PER_DAY without a deploy.
   · SEED_PER_USER_PER_HOUR = 4. A catalogue changes when the page changes (a release, the UI
     language, the module set), not per search; four an hour is every language switch a reader is
     plausibly going to make, and stops one account from embedding catalogue after catalogue.
   · (edge-spend-and-models) PER_USER_PER_DAY = GLOBAL_PER_DAY / MIN_ACCOUNTS_TO_SPEND_A_DAY
     (= 2,000 by default), one account's SHARE of the day, in the same units. THE DEFECT it answers
     (audit, 2026-09-29): a seed costs one unit per document and one account may seed four times an
     hour, i.e. up to 4 × MAX_ENTRIES (400) = 1,600 units an hour — so ONE account could empty the
     whole day's 20,000 in about thirteen hours, and every reader's find_capability would answer from
     spellings alone until it refilled. The project ceiling protects the invoice; this share protects
     the OTHER readers from one account. MIN_ACCOUNTS_TO_SPEND_A_DAY is routing-relay's
     MIN_ADDRESSES_TO_SPEND_A_DAY read for accounts: the same estimate as _shared/rate-limit.js's
     READERS_PER_ADDRESS (10), turned round — no fewer than ten accounts can exhaust a day. An honest
     day is far inside it: a catalogue is ~145 documents, so 2,000 is thirteen full seeds or two
     thousand searches. ESTIMATE; it expires the first time production shows `rate_limit` from
     `atlas-embed:user:day` for an account that was a reader, and ATLAS_EMBED_PER_USER_PER_DAY moves it
     without a deploy. ⚠ Accounts cost nothing to make, so this raises the price of emptying the day
     from one account to ten; it does not make it impossible — the project ceiling is still what
     bounds the invoice.
   All four fail CLOSED when the database does not answer: the vectors live in that database, so a
   search it cannot serve is not a search this function can answer anyway. */
const PER_USER_PER_MIN = 30;
const SEED_PER_USER_PER_HOUR = 4;
function envCeiling(name, fallback) {
  const v = Number(Deno.env.get(name) || "");
  return (Number.isFinite(v) && v >= 1) ? Math.floor(v) : fallback;
}
/* The project ceiling is _shared/ai-provider.js's spendCeiling — scope `atlas-embed:global:day` and
   the override ATLAS_EMBED_GLOBAL_PER_DAY, both unchanged from before it was shared. */
const CEILING = spendCeiling({ fn: "atlas-embed", perDay: 20000, env: (k) => Deno.env.get(k) || "" });
const GLOBAL_PER_DAY = CEILING.perDay;
const MIN_ACCOUNTS_TO_SPEND_A_DAY = READERS_PER_ADDRESS;
const PER_USER_PER_DAY = envCeiling("ATLAS_EMBED_PER_USER_PER_DAY", Math.max(1, Math.floor(GLOBAL_PER_DAY / MIN_ACCOUNTS_TO_SPEND_A_DAY)));
/* Read by tests/edge-spend-and-models-checks, which evaluates this module (Deno.serve stubbed). */
export const SPEND = { ceiling: CEILING, schedule: [], perUserPerDay: PER_USER_PER_DAY };

/* How long the embeddings endpoint may take. Observation: news-ingest gives a 96-input batch 30 s
   (supabase/functions/news-ingest/index.ts, embedBatch) and has not been recorded exceeding it; a
   search phrase is one short input. The page waits less than this (js/atlas-capabilities.js) and
   answers from spellings when it gives up. Expires with an observed timeout in production. */
const EMBED_TIMEOUT_MS = 30000;

const json = (body, status) => new Response(JSON.stringify(body), {
  status: status || 200,
  headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" },
});
const fail = (state, status) => json({ state }, status);

/* The caller, from their own JWT. Asked of the Auth server directly (the same question ai-proxy asks
   through supabase-js), so this function has no dependency to pin. */
async function callerId(req, url, anon) {
  const auth = req.headers.get("authorization") || "";
  if (!/^bearer\s+\S+/i.test(auth)) return null;
  try {
    const r = await fetch(url.replace(/\/+$/, "") + "/auth/v1/user", {
      headers: { apikey: anon, authorization: auth },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) { try { await r.body?.cancel(); } catch (_) { /* */ } return null; }
    const u = await r.json();
    return (u && typeof u.id === "string" && u.id) ? u.id : null;
  } catch (_) { return null; }
}

/* How long a model list may take. The page waits SEMANTIC_TIMEOUT_MS = 8 s for a whole search
   (js/atlas-capabilities.js), and the lists are asked in parallel before the first lookup of a cold
   isolate; a list slower than 5 s would make that search late whatever came after it, and the page
   then answers from spellings and says so. ESTIMATE (a model list is a static answer, normally well
   under a second); expires with a recorded production timeout. */
const LIST_TIMEOUT_MS = 5000;

/* The route, per isolate (route.js). Rebuilt only if what it was built from changes (a secret set
   anew restarts the isolates anyway; this keeps a stale route from outliving a changed key if not). */
let ROUTER = null, ROUTER_ID = "";
function routerFor(keys, prefer) {
  const id = JSON.stringify([keys.openai.length, keys.openai.slice(-6), keys.gemini.length, keys.gemini.slice(-6), prefer]);
  if (!ROUTER || ROUTER_ID !== id) {
    ROUTER = makeRouter({
      keys, prefer,
      listDoor: (u, init) => providerFetch(u, init, { ceiling: CEILING, timeoutMs: LIST_TIMEOUT_MS }),
    });
    ROUTER_ID = id;
  }
  return ROUTER;
}
/* (edge-spend-and-models) An operation's embeddings go through the shared door with the RECEIPT the
   ceiling handed back when the whole operation was charged (a seed is charged for every document
   before its first batch, so its batches carry that one receipt rather than each asking again). */
const receiptDoor = (receipt) => (u, init) => providerFetch(u, init, { receipt, timeoutMs: EMBED_TIMEOUT_MS });

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return fail("method_not_allowed", 405);

    const url = Deno.env.get("SUPABASE_URL") || "";
    const anon = publishableKey(denoEnv);
    const serviceKey = secretKey(denoEnv);

    const uid = await callerId(req, url, anon);
    if (!uid) return fail("signed_out", 401);
    /* (ai-one-ledger) the bucket key, decided where every function's is (_shared/rate-limit.js
       callerKey): the account, because the Auth server has just verified it */
    const who = await callerKey(req, { uid, secret: callerKeySecret((k) => Deno.env.get(k) || "") });

    const keys = { openai: Deno.env.get("OPENAI_API_KEY") || "", gemini: Deno.env.get("GEMINI_API_KEY") || "" };
    if (!keys.openai && !keys.gemini) return fail("unconfigured", 503);
    const router = routerFor(keys, Deno.env.get("ATLAS_EMBED_MODEL") || "");

    let body = null;
    try {
      const raw = await readCapped(req, MAX_BODY_BYTES);
      body = JSON.parse(new TextDecoder().decode(raw));
    } catch (e) {
      return fail((e instanceof RelayError) ? "body_too_large" : "bad_json", (e instanceof RelayError) ? 413 : 400);
    }

    const db = restRpcClient({ url, serviceKey });
    const limiter = makeLimiter({ db });
    /* The caller's share of the day, then the project's day. Both in units (a search 1, a seed one per
       document). Returns { receipt } to carry on, or { code } to refuse with. */
    const ceiling = async (cost) => {
      const mine = await limiter.take("atlas-embed:user:day", who, {
        capacity: PER_USER_PER_DAY, refillPerSec: PER_USER_PER_DAY / 86400, cost, onUnavailable: "deny",
      });
      if (mine.source !== "db") return { code: "limiter_unavailable" };
      if (!mine.allowed) return { code: "rate_limit" };
      const day = await CEILING.take(cost);
      return day.ok ? { receipt: day.receipt } : { code: day.code };
    };
    const refusal = (code) => fail(code, code === "limiter_unavailable" ? 503 : 429);
    /* The route this request works under, or the answer to give instead. */
    const routeOrRefusal = async () => {
      const r = await router.route();
      if (r.route) return { route: r.route, alternatives: r.alternatives || [] };
      const c = r.code;
      if (c === "unconfigured") return { res: fail(c, 503) };
      if (c === "model_unavailable") return { res: fail(c, 502) };
      if (c === "spend_ceiling" || c === "share_ceiling" || c === "limiter_unavailable") return { res: refusal(c) };
      if (c === "no_ceiling") return { res: refusal("limiter_unavailable") };
      return { res: fail("upstream_unreachable", 502) };
    };
    const stored = async (catalog, model) => {
      const r = await db.rpc("atlas_capability_catalog_size", { p_catalog: catalog, p_model: model });
      if (r.error) return -1;
      const n = Array.isArray(r.data) ? r.data[0] : r.data;
      return Number.isFinite(+n) ? +n : -1;
    };
    /* The route the catalogue is stored under: the decided route if it holds the catalogue, else the
       first alternative that does (another isolate, refused by the decided model, stored it there —
       a fresh isolate cannot know that model is refused until it embeds, and an unknown catalogue
       is answered BEFORE anything is embedded). `whole` > 0 asks for a complete catalogue (a seed);
       otherwise any stored row counts (a search — a catalogue is stored in one statement). Returns
       { rt, n } with n = -1 when the store did not answer, 0 when no route holds it. */
    const storedUnder = async (catalog, ro, whole) => {
      for (const rt of [ro.route, ...ro.alternatives]) {
        const n = await stored(catalog, rt.key);
        if (n < 0) return { rt: ro.route, n: -1 };
        if (whole > 0 ? n === whole : n > 0) return { rt, n };
      }
      return { rt: ro.route, n: 0 };
    };

    const op = String((body && body.op) || "");

    if (op === "search") {
      const p = parseSearch(body);
      if (!p.ok) return fail(p.code, 400);
      const u = await limiter.take("atlas-embed:user", who, {
        capacity: PER_USER_PER_MIN, refillPerSec: PER_USER_PER_MIN / 60, cost: 1, onUnavailable: "deny",
      });
      if (u.source !== "db") return fail("limiter_unavailable", 503);
      if (!u.allowed) return fail("rate_limit", 429);
      /* ⚠ ONE ROUTE FOR THE WHOLE COMPARISON: the size, the query's vector and the similarity are all
         asked under `rt.key`. A refused model is retried ONCE under the route decided without it —
         and that route's catalogue is looked up again, never compared with the first one's. */
      let receipt = null;
      for (let attempt = 0; ; attempt++) {
        const ro = await routeOrRefusal();
        if (ro.res) return ro.res;
        const { rt, n } = await storedUnder(p.catalog, ro, 0);
        if (n < 0) return fail("store_unavailable", 503);
        if (n === 0) return json({ state: "catalog_unknown", model: rt.key });
        if (!receipt) {
          const c = await ceiling(1);
          if (c.code) return refusal(c.code);
          receipt = c.receipt;
        }
        const e = await router.embed(rt, [p.q], "query", receiptDoor(receipt));
        if (!e.vectors) {
          if (e.routeFailed) router.failed(rt);
          if (e.routeFailed && attempt === 0) continue;
          return fail(e.state, 502);
        }
        const r = await db.rpc("atlas_capability_similarity", { p_catalog: p.catalog, p_model: rt.key, p_query: e.vectors[0] });
        if (r.error || !Array.isArray(r.data)) return fail("store_unavailable", 503);
        const sims = {};
        for (const row of r.data) {
          const s = Number(row && row.similarity);
          if (row && typeof row.capability_id === "string" && Number.isFinite(s)) sims[row.capability_id] = s;
        }
        return json({ state: "ok", model: rt.key, catalog: p.catalog, dim: EMBED_DIM, sims });
      }
    }

    if (op === "seed") {
      const p = await parseSeed(body);
      if (!p.ok) return fail(p.code, 400);
      /* ⚠ EVERY DOCUMENT OF ONE CATALOGUE BY ONE ROUTE, stored under that route's key. A model refused
         part-way drops every vector already made by it, and the whole catalogue is embedded again
         under the route decided without it — never a catalogue of mixed models. */
      let receipt = null;
      for (let attempt = 0; ; attempt++) {
        const ro = await routeOrRefusal();
        if (ro.res) return ro.res;
        const found = await storedUnder(p.catalog, ro, p.entries.length);
        if (found.n < 0) return fail("store_unavailable", 503);
        /* ⚠ IDEMPOTENT BEFORE IT IS CHARGED. Two tabs that find the same catalogue unknown both send
           it; the second must be told «stored», not billed and not refused. */
        if (found.n === p.entries.length) return json({ state: "ok", stored: found.n, already: true, model: found.rt.key });
        const rt = ro.route;
        if (!receipt) {
          const s = await limiter.take("atlas-embed:seed", who, {
            capacity: SEED_PER_USER_PER_HOUR, refillPerSec: SEED_PER_USER_PER_HOUR / 3600, cost: 1, onUnavailable: "deny",
          });
          if (s.source !== "db") return fail("limiter_unavailable", 503);
          if (!s.allowed) return fail("rate_limit", 429);
          const c = await ceiling(p.entries.length);
          if (c.code) return refusal(c.code);
          receipt = c.receipt;
        }
        const rows = [];
        let refused = null;
        for (const chunk of batches(p.entries, rt.maxInputs)) {
          const e = await router.embed(rt, chunk.map((x) => x.text), "document", receiptDoor(receipt));
          if (!e.vectors) { refused = e; break; }
          chunk.forEach((x, i) => rows.push({ id: x.id, e: e.vectors[i] }));
        }
        if (refused) {
          if (refused.routeFailed) router.failed(rt);
          if (refused.routeFailed && attempt === 0) continue;
          return fail(refused.state, 502);
        }
        const r = await db.rpc("atlas_capability_seed", { p_catalog: p.catalog, p_model: rt.key, p: rows });
        const n = Array.isArray(r.data) ? r.data[0] : r.data;
        if (r.error || !Number.isFinite(+n)) return fail("store_unavailable", 503);
        return json({ state: "ok", stored: +n, model: rt.key });
      }
    }

    return fail("bad_op", 400);
  } catch (_) {
    /* the cause is not carried: this answer is readable by any signed-in caller */
    return fail("internal_error", 500);
  }
});
