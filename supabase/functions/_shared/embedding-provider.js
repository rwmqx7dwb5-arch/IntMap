// ============================================================================
//  IntMap · _shared/embedding-provider.js — which embedding models a key reaches, and the two
//  embedding endpoints, behind the one door (ai-provider.js providerFetch)
// ----------------------------------------------------------------------------
//  WHY THIS EXISTS. MEASURED 2026-11-20 on production: this project's OPENAI_API_KEY sees three models
//  and NO embedding model (`/v1/models` answers, `/v1/embeddings` answers 403). news-ingest found it
//  first and fell back to Gemini's embeddings (GEMINI_API_KEY is set) by ASKING Google's model list;
//  atlas-embed had the same key and the same 403, and public.atlas_capability_vectors held 0 rows —
//  the meaning half of find_capability had never answered once. This file is that discovery and those
//  two calls written once, so a second function does not carry a second copy of them.
//  ⚠ news-ingest still carries its own copy (supabase/functions/news-ingest/index.ts,
//  listEmbeddingModels / geminiEmbeddingModel / geminiEmbedBatch); it should switch to this file.
//
//  THE DOOR IS INJECTED. Every function here takes `door(url, init) → Response`: the caller binds
//  providerFetch to ITS ceiling or receipt (atlas-embed pays a seed's batches with one receipt;
//  news-ingest pays per request). Nothing here can reach a provider without one.
//
//  ⚠ NOTHING HERE CARRIES A PROVIDER'S BODY. A refusal is its status and the length of its body
//  (ai-provider.js providerFail) — a provider's error text may echo the request.
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE — scripts/static-checks.mjs runs `node --check` over it.
// ============================================================================

import { GEMINI_EMBEDDING_MODEL, providerFail, bodyLength } from "./ai-provider.js";

const OPENAI_BASE = "https://api.openai.com/v1";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

/* Gemini's batchEmbedContents accepts at most 100 requests in one call (the API refuses a larger batch
   with 400 INVALID_ARGUMENT; Gemini API reference, read 2026-11). news-ingest's 96 sits under the same
   bound. Expires with that limit. */
export const GEMINI_BATCH_MAX = 100;
/* OpenAI's /v1/embeddings accepts at most 2,048 inputs in one call (OpenAI API reference). */
export const OPENAI_BATCH_MAX = 2048;

/* What a refusal is called when the door itself said no (no request was made). Those are not
   «the provider has no such model» and must not be read as one: the caller refuses with the code. */
export const DOOR_REFUSALS = new Set(["spend_ceiling", "share_ceiling", "limiter_unavailable", "no_ceiling", "not_a_provider"]);
function thrownCode(e) {
  const c = e && typeof e.code === "string" ? e.code : "";
  return c || "unreachable";
}

/* Unit length. Gemini's embeddings are Matryoshka: asking for fewer dimensions than the model's native
   width TRUNCATES the vector, and a truncated vector is no longer unit length — Google's documentation
   says to normalise it. (Cosine similarity would not care; a dot product or an L2 distance would, and
   the stored vector should not depend on which the reader uses.) A zero vector is returned as it is. */
export function l2normalize(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s);
  if (!(n > 0) || !Number.isFinite(n)) return v.slice();
  return v.map((x) => x / n);
}

/* ── THE MODEL LISTS ─────────────────────────────────────────────────────────────────────────────
   Each returns one of:
     { answered:true,  ids:[…] }       — the provider answered; `ids` are the embedding models it
                                         names (possibly none — that IS an answer: this key reaches no
                                         embedding model there)
     { answered:false, code, status }  — the list could not be read (a refusal, a transport failure).
                                         NOT «no models»: whether the key can embed is unknown. */
export async function listOpenAIEmbeddingModels(key, door) {
  let r;
  try {
    r = await door(OPENAI_BASE + "/models", { headers: { authorization: "Bearer " + key } });
  } catch (e) { return { answered: false, code: thrownCode(e), status: 0 }; }
  if (!r.ok) { const f = providerFail(r.status, await bodyLength(r)); return { answered: false, code: "http", status: f.status }; }
  let j = null;
  try { j = await r.json(); } catch (_) { return { answered: false, code: "bad_json", status: r.status }; }
  const all = (Array.isArray(j && j.data) ? j.data : []).map((m) => String((m && m.id) || "")).filter(Boolean);
  return { answered: true, ids: all.filter((id) => /embed/i.test(id)).sort(), all: all.length };
}

/* Google's list is paged; the name comes back as `models/<id>` and is returned without the prefix.
   ⚠ (gemini-embed-methods) AN EMBEDDING MODEL IS ONE THAT LISTS EITHER EMBEDDING METHOD. This filtered on
   `batchEmbedContents` alone. Measured on production 2026-11-25 (atlas-embed's diag): the key lists 65 models and the
   filter kept NONE, so atlas-embed answered model_unavailable and news-ingest never embedded an article. Which of the
   two methods a model lists decides how it is called (embedMethodOf). */
const GEMINI_METHODS = new Map();   /* per isolate: model id → the methods its list entry named */
export const EMBED_METHODS = ["batchEmbedContents", "embedContent"];
export function embedMethodOf(model) {
  const ms = GEMINI_METHODS.get(model);
  if (!ms) return "batchEmbedContents";   /* not listed in this isolate: the batch call, as before */
  return ms.includes("batchEmbedContents") ? "batchEmbedContents" : "embedContent";
}
export async function listGeminiEmbeddingModels(key, door) {
  const ids = [];
  const named = [];
  const seen = new Set();
  let token = "";
  let total = 0;
  for (;;) {
    let r;
    const url = GEMINI_BASE + "/models?pageSize=200" + (token ? "&pageToken=" + encodeURIComponent(token) : "");
    try {
      r = await door(url, { headers: { "x-goog-api-key": key } });
    } catch (e) { return { answered: false, code: thrownCode(e), status: 0 }; }
    if (!r.ok) { const f = providerFail(r.status, await bodyLength(r)); return { answered: false, code: "http", status: f.status }; }
    let j = null;
    try { j = await r.json(); } catch (_) { return { answered: false, code: "bad_json", status: r.status }; }
    const ms = Array.isArray(j && j.models) ? j.models : [];
    total += ms.length;
    for (const m of ms) {
      const methods = Array.isArray(m && m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
      const id = String((m && m.name) || "").replace(/^models\//, "");
      if (id && /embed/i.test(id)) named.push({ id, methods: methods.slice(0, 8) });   /* (gemini-embed-methods) what a diag shows */
      if (!EMBED_METHODS.some((x) => methods.includes(x))) continue;
      if (id) { ids.push(id); GEMINI_METHODS.set(id, methods.slice()); }
    }
    /* a page token the provider repeats would loop for ever; it is the end of what can be read */
    const next = j && typeof j.nextPageToken === "string" ? j.nextPageToken : "";
    if (!next || seen.has(next)) break;
    seen.add(next);
    token = next;
  }
  return { answered: true, ids: ids.sort(), all: total, named: named.slice(0, 8) };
}

/* Which listed model to use: the first preference the list names, else — for Gemini — the family
   news-ingest prefers (`gemini-embedding*`, the multilingual one that takes outputDimensionality), else
   the first listed. `skip(id)` removes models the caller has seen fail. A preference the list does not
   name is not used: the list is the provider's own word for what this key reaches. */
export function pickEmbeddingModel(provider, ids, prefer, skip) {
  const ok = (id) => !(typeof skip === "function" && skip(id));
  const list = (ids || []).filter(ok);
  for (const p of (prefer || [])) if (p && list.includes(p)) return p;
  if (provider === "gemini") {
    const fam = list.find((id) => /^gemini-embedding/.test(id));
    if (fam) return fam;
  }
  return list[0] || null;
}

/* The provider's default preference. Gemini's is the one model table's (ai-provider.js
   GEMINI_EMBEDDING_MODEL); OpenAI's is the model atlas-embed and news-ingest were written for (both
   spell it today — news-ingest's EMBED_MODEL_DEFAULT; this is the copy it should read). A preference
   is tried only where the provider's list names it, or where there is no list to ask (see the caller). */
export const OPENAI_EMBEDDING_DEFAULT = "text-embedding-3-small";
export function defaultEmbeddingModel(provider) {
  return provider === "gemini" ? GEMINI_EMBEDDING_MODEL : OPENAI_EMBEDDING_DEFAULT;
}

/* ── THE TWO ENDPOINTS ───────────────────────────────────────────────────────────────────────────
   Each returns { ok:true, vectors:[number[]…] } in input order, or
   { ok:false, code, status } with code one of:
     http (status set) · bad_json · count_mismatch · a door refusal (DOOR_REFUSALS) · a transport code.
   The vectors are NOT checked for length here — the caller owns the column and checks it. */
export async function embedOpenAI(key, model, inputs, door) {
  let r;
  try {
    r = await door(OPENAI_BASE + "/embeddings", {
      method: "POST",
      headers: { authorization: "Bearer " + key, "content-type": "application/json" },
      body: JSON.stringify({ model, input: inputs }),
    });
  } catch (e) { return { ok: false, code: thrownCode(e), status: 0, door: DOOR_REFUSALS.has(thrownCode(e)) }; }
  if (!r.ok) { const f = providerFail(r.status, await bodyLength(r)); return { ok: false, code: "http", status: f.status }; }
  let j = null;
  try { j = await r.json(); } catch (_) { return { ok: false, code: "bad_json", status: r.status }; }
  const data = Array.isArray(j && j.data) ? j.data.slice().sort((a, b) => ((a && a.index) || 0) - ((b && b.index) || 0)) : [];
  if (data.length !== inputs.length) return { ok: false, code: "count_mismatch", status: r.status };
  return { ok: true, vectors: data.map((d) => (d && Array.isArray(d.embedding)) ? d.embedding : null) };
}

/* `dim` → outputDimensionality (Matryoshka truncation), and every returned vector is L2-normalised
   (see l2normalize). `taskType` is Gemini's: the model embeds a text differently depending on what it
   is FOR, and a search uses RETRIEVAL_QUERY for the query and RETRIEVAL_DOCUMENT for what is searched
   (the pairing Google documents for retrieval; both are the SAME model and the same space). */
export async function embedGemini(key, model, inputs, door, opts) {
  const o = opts || {};
  const requests = inputs.map((text) => {
    const one = { model: "models/" + model, content: { parts: [{ text }] } };
    if (o.taskType) one.taskType = o.taskType;
    if (o.dim) one.outputDimensionality = o.dim;
    return one;
  });
  /* (gemini-embed-methods) a model listed with embedContent only is called once per input, all at the same time */
  if (embedMethodOf(model) === "embedContent") return embedGeminiOneByOne(key, model, requests, door);
  let r;
  try {
    r = await door(GEMINI_BASE + "/models/" + encodeURIComponent(model) + ":batchEmbedContents", {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ requests }),
    });
  } catch (e) { return { ok: false, code: thrownCode(e), status: 0, door: DOOR_REFUSALS.has(thrownCode(e)) }; }
  if (!r.ok) { const f = providerFail(r.status, await bodyLength(r)); return { ok: false, code: "http", status: f.status }; }
  let j = null;
  try { j = await r.json(); } catch (_) { return { ok: false, code: "bad_json", status: r.status }; }
  const es = Array.isArray(j && j.embeddings) ? j.embeddings : [];
  if (es.length !== inputs.length) return { ok: false, code: "count_mismatch", status: r.status };
  return { ok: true, vectors: es.map((e) => (e && Array.isArray(e.values)) ? l2normalize(e.values) : null) };
}

/* (gemini-embed-methods) embedContent: one request per input, all sent together, the same answer shape as the batch
   call. Any one failure is the call's failure — a partial set of vectors is not a catalogue. */
async function embedGeminiOneByOne(key, model, requests, door) {
  const one = async (req) => {
    let r;
    try {
      r = await door(GEMINI_BASE + "/models/" + encodeURIComponent(model) + ":embedContent", {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({ content: req.content, ...(req.taskType ? { taskType: req.taskType } : {}), ...(req.outputDimensionality ? { outputDimensionality: req.outputDimensionality } : {}) }),
      });
    } catch (e) { return { ok: false, code: thrownCode(e), status: 0, door: DOOR_REFUSALS.has(thrownCode(e)) }; }
    if (!r.ok) { const f = providerFail(r.status, await bodyLength(r)); return { ok: false, code: "http", status: f.status }; }
    let j = null;
    try { j = await r.json(); } catch (_) { return { ok: false, code: "bad_json", status: r.status }; }
    const v = j && j.embedding && Array.isArray(j.embedding.values) ? j.embedding.values : null;
    return v ? { ok: true, v: l2normalize(v) } : { ok: false, code: "count_mismatch", status: r.status };
  };
  const got = await Promise.all(requests.map(one));
  const bad = got.find((g) => !g.ok);
  if (bad) return bad;
  return { ok: true, vectors: got.map((g) => g.v) };
}
