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
//  PRIVACY. What reaches OpenAI from here is the find_capability query Atlas writes — a phrase
//  derived from the reader's request, which ai-proxy already sends to OpenAI whole. No new
//  recipient; the privacy page says what is sent (privacy.html).
//
//  Deploy:   supabase functions deploy atlas-embed --project-ref vpekfwdpurzejrrmacac --use-api
//  Secrets:  OPENAI_API_KEY (the same secret ai-proxy and news-ingest read)
//            ATLAS_EMBED_MODEL (optional; default text-embedding-3-small)
//            ATLAS_EMBED_GLOBAL_PER_DAY (optional override of the project-wide ceiling)
//  (SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.)
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE — scripts/static-checks.mjs parses it as plain JavaScript.
// ============================================================================

import { corsFor, readCapped, RelayError } from "../_shared/relay-guard.js";
import { makeLimiter, restRpcClient } from "../_shared/rate-limit.js";
import { parseSearch, parseSeed, batches, vectorLiteral, EMBED_DIM, MAX_BODY_BYTES } from "./core.js";

const CORS = { ...corsFor(), "Access-Control-Allow-Methods": "POST, OPTIONS" };
const MODEL_DEFAULT = "text-embedding-3-small";

/* ══ THE SPEND CEILING (rate-limit.js is the mechanism; these are this function's numbers) ═══════
   no-ad-hoc-hardcoding §4 — observation, expiry, canonical place (THIS FILE):
   · PER_USER_PER_MIN = 30. A find_capability call is one search. The most measured in one turn is
     eight (#R802, the turn that ran nothing), and a turn takes tens of seconds at the least, so 30
     a minute is several such turns at once from one account. Expires if the tool surface starts
     searching more than once per model step.
   · GLOBAL_PER_DAY = 20000 units, where a search costs 1 and a seed costs one unit per document.
     Cost observation: text-embedding-3-small is $0.02 per million tokens (OpenAI pricing, read
     2026-09-25); a search phrase is tens of tokens and a full catalogue is ~60,000 tokens, so the
     whole day's ceiling is well under one US cent. The ceiling bounds a runaway loop, not the
     invoice of honest use. Overridable via ATLAS_EMBED_GLOBAL_PER_DAY without a deploy.
   · SEED_PER_USER_PER_HOUR = 4. A catalogue changes when the page changes (a release, the UI
     language, the module set), not per search; four an hour is every language switch a reader is
     plausibly going to make, and stops one account from embedding catalogue after catalogue.
   All three fail CLOSED when the database does not answer: the vectors live in that database, so a
   search it cannot serve is not a search this function can answer anyway. */
const PER_USER_PER_MIN = 30;
const SEED_PER_USER_PER_HOUR = 4;
function envCeiling(name, fallback) {
  const v = Number(Deno.env.get(name) || "");
  return (Number.isFinite(v) && v >= 1) ? Math.floor(v) : fallback;
}
const GLOBAL_PER_DAY = envCeiling("ATLAS_EMBED_GLOBAL_PER_DAY", 20000);

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

/* One call to the embeddings endpoint. Returns { vectors } or { state } — a state the page may be
   told, never the upstream's words. A 403/404 is reported as `model_unavailable` because that is
   what it has meant here before: Architecture.md records that this project's key could not reach an
   embedding model when news-ingest first asked (2026-08-24). The fix is an operator's
   (ATLAS_EMBED_MODEL, or a key that can), and the page must not be told «no match» for it. */
async function embed(key, model, inputs) {
  let r;
  try {
    r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { authorization: "Bearer " + key, "content-type": "application/json" },
      body: JSON.stringify({ model, input: inputs }),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    });
  } catch (_) { return { state: "upstream_unreachable" }; }
  if (!r.ok) {
    try { await r.body?.cancel(); } catch (_) { /* */ }
    if (r.status === 403 || r.status === 404) return { state: "model_unavailable" };
    if (r.status === 429) return { state: "upstream_rate_limit" };
    return { state: "upstream_error" };
  }
  let j = null;
  try { j = await r.json(); } catch (_) { return { state: "upstream_error" }; }
  const data = Array.isArray(j && j.data) ? j.data.slice().sort((a, b) => (a.index || 0) - (b.index || 0)) : [];
  if (data.length !== inputs.length) return { state: "upstream_error" };
  const out = [];
  for (const d of data) {
    const lit = vectorLiteral(d && d.embedding);
    if (!lit) return { state: "bad_dimensions" };
    out.push(lit);
  }
  return { vectors: out };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return fail("method_not_allowed", 405);

    const url = Deno.env.get("SUPABASE_URL") || "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const uid = await callerId(req, url, anon);
    if (!uid) return fail("signed_out", 401);

    const key = Deno.env.get("OPENAI_API_KEY") || "";
    if (!key) return fail("unconfigured", 503);
    const model = Deno.env.get("ATLAS_EMBED_MODEL") || MODEL_DEFAULT;

    let body = null;
    try {
      const raw = await readCapped(req, MAX_BODY_BYTES);
      body = JSON.parse(new TextDecoder().decode(raw));
    } catch (e) {
      return fail((e instanceof RelayError) ? "body_too_large" : "bad_json", (e instanceof RelayError) ? 413 : 400);
    }

    const db = restRpcClient({ url, serviceKey });
    const limiter = makeLimiter({ db });
    const ceiling = async (cost) => {
      const day = await limiter.take("atlas-embed:global:day", "*", {
        capacity: GLOBAL_PER_DAY, refillPerSec: GLOBAL_PER_DAY / 86400, cost, onUnavailable: "deny",
      });
      if (day.source !== "db") return "limiter_unavailable";
      return day.allowed ? null : "spend_ceiling";
    };
    const stored = async (catalog) => {
      const r = await db.rpc("atlas_capability_catalog_size", { p_catalog: catalog, p_model: model });
      if (r.error) return -1;
      const n = Array.isArray(r.data) ? r.data[0] : r.data;
      return Number.isFinite(+n) ? +n : -1;
    };

    const op = String((body && body.op) || "");

    if (op === "search") {
      const p = parseSearch(body);
      if (!p.ok) return fail(p.code, 400);
      const u = await limiter.take("atlas-embed:user", uid, {
        capacity: PER_USER_PER_MIN, refillPerSec: PER_USER_PER_MIN / 60, cost: 1, onUnavailable: "deny",
      });
      if (u.source !== "db") return fail("limiter_unavailable", 503);
      if (!u.allowed) return fail("rate_limit", 429);
      const n = await stored(p.catalog);
      if (n < 0) return fail("store_unavailable", 503);
      if (n === 0) return json({ state: "catalog_unknown", model });
      const c = await ceiling(1);
      if (c) return fail(c, c === "spend_ceiling" ? 429 : 503);
      const e = await embed(key, model, [p.q]);
      if (!e.vectors) return fail(e.state, 502);
      const r = await db.rpc("atlas_capability_similarity", { p_catalog: p.catalog, p_model: model, p_query: e.vectors[0] });
      if (r.error || !Array.isArray(r.data)) return fail("store_unavailable", 503);
      const sims = {};
      for (const row of r.data) {
        const s = Number(row && row.similarity);
        if (row && typeof row.capability_id === "string" && Number.isFinite(s)) sims[row.capability_id] = s;
      }
      return json({ state: "ok", model, catalog: p.catalog, dim: EMBED_DIM, sims });
    }

    if (op === "seed") {
      const p = await parseSeed(body);
      if (!p.ok) return fail(p.code, 400);
      const have = await stored(p.catalog);
      if (have < 0) return fail("store_unavailable", 503);
      /* ⚠ IDEMPOTENT BEFORE IT IS CHARGED. Two tabs that find the same catalogue unknown both send
         it; the second must be told «stored», not billed and not refused. */
      if (have === p.entries.length) return json({ state: "ok", stored: have, already: true, model });
      const s = await limiter.take("atlas-embed:seed", uid, {
        capacity: SEED_PER_USER_PER_HOUR, refillPerSec: SEED_PER_USER_PER_HOUR / 3600, cost: 1, onUnavailable: "deny",
      });
      if (s.source !== "db") return fail("limiter_unavailable", 503);
      if (!s.allowed) return fail("rate_limit", 429);
      const c = await ceiling(p.entries.length);
      if (c) return fail(c, c === "spend_ceiling" ? 429 : 503);
      const rows = [];
      for (const chunk of batches(p.entries)) {
        const e = await embed(key, model, chunk.map((x) => x.text));
        if (!e.vectors) return fail(e.state, 502);
        chunk.forEach((x, i) => rows.push({ id: x.id, e: e.vectors[i] }));
      }
      const r = await db.rpc("atlas_capability_seed", { p_catalog: p.catalog, p_model: model, p: rows });
      const n = Array.isArray(r.data) ? r.data[0] : r.data;
      if (r.error || !Number.isFinite(+n)) return fail("store_unavailable", 503);
      return json({ state: "ok", stored: +n, model });
    }

    return fail("bad_op", 400);
  } catch (_) {
    /* the cause is not carried: this answer is readable by any signed-in caller */
    return fail("internal_error", 500);
  }
});
