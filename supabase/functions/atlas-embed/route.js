// ============================================================================
//  IntMap · atlas-embed/route.js — WHICH embedding model this function uses, decided before anything
//  is looked up under it
// ----------------------------------------------------------------------------
//  THE DEFECT (production, 2026-11-20): this function only ever called OpenAI's /v1/embeddings with
//  text-embedding-3-small, and this project's OpenAI key reaches no embedding model (its /v1/models
//  names three models, none of them an embedding model; /v1/embeddings answers 403). Every seed
//  answered `model_unavailable`, public.atlas_capability_vectors stayed at 0 rows, and every
//  find_capability answered from spellings alone. GEMINI_API_KEY was set the whole time.
//
//  THE RULE. A route is { provider, model, key }: `key` is the `model` column the vectors are stored and
//  compared under (the table's primary key is (catalog_hash, model, capability_id), and
//  atlas_capability_similarity compares a query only with rows of the `p_model` it is given). The
//  handler decides the route FIRST and then uses that one key for the stored-size question, the
//  embedding of the query or of the catalogue, and the comparison — so a query vector is never
//  compared with vectors another model made. A different route is a different key: its catalogue is
//  simply «unknown» and is seeded afresh under it.
//
//  HOW THE ROUTE IS DECIDED (once per isolate, not per request):
//    · ONE provider key: its preferred model (ATLAS_EMBED_MODEL, else the provider's default). There is
//      nothing to choose between, and the embedding call itself is the test of the key.
//    · TWO provider keys: ask BOTH model lists (charged to the project ceiling — they carry the key)
//      and take the operator's ATLAS_EMBED_MODEL where a list names it, else the first provider, in
//      PROVIDER_ORDER, whose list names an embedding model. A list that could not be read is not «no
//      models»: its provider's default is used UNVERIFIED (and not remembered) only if no list named
//      anything.
//    · A model the provider then REFUSES (403/404), or that returns vectors that do not fit the column,
//      is remembered as failed for this isolate and the route is decided again WITHOUT it — once per
//      request, doing something different (one-pass-or-a-reason §5). With one key that re-decision
//      asks the list, since the preferred model is now known not to work.
//
//  ⚠ WHY THE ROUTE CANNOT BE DECIDED BY TRYING. The page asks `search` first and seeds only when the
//  answer is `catalog_unknown`. If the stored-size question were asked under one model and the seed
//  then stored under another (because the first refused), every cold isolate would keep asking under
//  the first, keep answering «unknown», and the page — which seeds a catalogue once — would never be
//  told the vectors exist. Hence the lists decide BEFORE the lookup; and for the case a list cannot
//  reveal (it names a model the key is then refused — learnt by one isolate, unknown to the next),
//  the decision carries `alternatives`, the other routes the lists support, and the handler looks
//  the catalogue up under them too: whichever single route holds it is the one the query is embedded
//  by and compared under.
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE — scripts/static-checks.mjs runs `node --check` over it.
// ============================================================================

import {
  listOpenAIEmbeddingModels, listGeminiEmbeddingModels, pickEmbeddingModel, defaultEmbeddingModel,
  embedOpenAI, embedGemini, GEMINI_BATCH_MAX, OPENAI_BATCH_MAX, DOOR_REFUSALS,
} from "../_shared/embedding-provider.js";
import { EMBED_DIM, vectorLiteral } from "./core.js";

/* The order a choice is made in when more than one key reaches an embedding model. OpenAI first: its
   text-embedding-3-small is $0.02 per million tokens against gemini-embedding-001's $0.15 (both
   providers' public prices, read 2026-11), and both are multilingual. Expires with either price. */
export const PROVIDER_ORDER = ["openai", "gemini"];

/* Gemini embeds a text for a purpose. A capability search is retrieval: the query as RETRIEVAL_QUERY,
   the catalogue as RETRIEVAL_DOCUMENT — the pairing Google documents for exactly this, in one model
   and one space. The pairing is part of the stored key (below), so changing it is a new key and never
   a comparison across two ways of embedding. */
export const GEMINI_TASK = Object.freeze({ query: "RETRIEVAL_QUERY", document: "RETRIEVAL_DOCUMENT" });

/* The `model` column. OpenAI's models return EMBED_DIM natively and unit length, so the model id IS
   the space. A Gemini vector depends on the model, the requested width and the task pairing, so all
   three are in the key (≤ 128 characters, the column's check). */
export function storeKey(provider, model) {
  return provider === "gemini" ? model + "@" + EMBED_DIM + "/retrieval" : model;
}

function makeRoute(provider, model, verified) {
  return {
    provider, model, verified,
    key: storeKey(provider, model),
    maxInputs: provider === "gemini" ? GEMINI_BATCH_MAX : OPENAI_BATCH_MAX,
  };
}

/* makeRouter({ keys:{openai,gemini}, prefer, listDoor }) → { route(), failed(route), embed(route, inputs, role, door), lists() }
   `listDoor(url, init)` pays for a model list (providerFetch with the project ceiling); `embed` is given
   the door of the operation it belongs to (a receipt). */
export function makeRouter(o) {
  const keys = (o && o.keys) || {};
  const prefer = String((o && o.prefer) || "");
  const listDoor = o && o.listDoor;
  const providers = PROVIDER_ORDER.filter((p) => keys[p]);
  const failedSet = new Set();
  const isFailed = (p, m) => failedSet.has(p + "/" + m);
  let pending = null;
  let lastLists = null;

  async function decide() {
    if (!providers.length) return { code: "unconfigured", keep: true };
    if (providers.length === 1) {
      const p = providers[0];
      const m = prefer || defaultEmbeddingModel(p);
      if (!isFailed(p, m)) return { route: makeRoute(p, m, false), alternatives: [], keep: true };
    }
    const lists = await Promise.all(providers.map((p) => p === "gemini"
      ? listGeminiEmbeddingModels(keys.gemini, listDoor)
      : listOpenAIEmbeddingModels(keys.openai, listDoor)));
    lastLists = providers.map((p, i) => ({ provider: p, ...lists[i] }));
    /* the door said no before any list was asked: that is the answer to the request */
    for (const L of lists) if (!L.answered && DOOR_REFUSALS.has(L.code)) return { code: L.code, keep: false };
    /* Every route the lists support, in the order they are preferred: the operator's model where a
       list names it; then each provider's pick from its own list; then — UNVERIFIED — the default of a
       provider whose list could not be read. */
    const viable = [];
    const add = (rt) => { if (!viable.some((x) => x.key === rt.key)) viable.push(rt); };
    if (prefer) {
      for (let i = 0; i < providers.length; i++) {
        const L = lists[i];
        if (L.answered && L.ids.includes(prefer) && !isFailed(providers[i], prefer)) add(makeRoute(providers[i], prefer, true));
      }
    }
    for (let i = 0; i < providers.length; i++) {
      const p = providers[i], L = lists[i];
      if (!L.answered) continue;
      const m = pickEmbeddingModel(p, L.ids, [defaultEmbeddingModel(p)], (id) => isFailed(p, id));
      if (m) add(makeRoute(p, m, true));
    }
    for (let i = 0; i < providers.length; i++) {
      const p = providers[i], L = lists[i];
      if (L.answered) continue;
      const m = defaultEmbeddingModel(p);
      if (!isFailed(p, m)) add(makeRoute(p, m, false));
    }
    if (!viable.length) {
      /* every list answered and none names a model this isolate has not seen fail */
      return { code: "model_unavailable", keep: lists.every((L) => L.answered) };
    }
    /* A route decided from a list that answered is remembered for the isolate; one resting on a list
       that could not be read is decided again by the next request. `alternatives` are the other
       routes the lists support: the handler looks the catalogue up under them too (see index.ts —
       another isolate may already have stored it under one of them). */
    const route = viable[0];
    return { route, alternatives: viable.slice(1), keep: route.verified };
  }

  return {
    route() {
      if (!pending) {
        const p = decide().then((r) => { if (!r.keep && pending === p) pending = null; return r; },
          (e) => { if (pending === p) pending = null; throw e; });
        pending = p;
      }
      return pending;
    },
    failed(route) {
      if (route) failedSet.add(route.provider + "/" + route.model);
      pending = null;
    },
    lists() { return lastLists; },

    /* One embeddings call on `route`. Returns { vectors:[pgvector literal…] } or
       { state, routeFailed } — `state` a code the page may be told, never the provider's words;
       `routeFailed` when the failure is THIS MODEL's (refused, or vectors that do not fit the column),
       so the caller may decide the route again without it. */
    async embed(route, inputs, role, door) {
      const r = route.provider === "gemini"
        ? await embedGemini(keys.gemini, route.model, inputs, door, { dim: EMBED_DIM, taskType: GEMINI_TASK[role] })
        : await embedOpenAI(keys.openai, route.model, inputs, door);
      if (!r.ok) {
        if (r.code === "no_ceiling") return { state: "limiter_unavailable" };
        if (r.code === "http") {
          /* 403/404: the key does not reach this model (what it has meant here — see the header) */
          if (r.status === 403 || r.status === 404) return { state: "model_unavailable", routeFailed: true };
          if (r.status === 429) return { state: "upstream_rate_limit" };
          return { state: "upstream_error" };
        }
        if (r.code === "bad_json" || r.code === "count_mismatch") return { state: "upstream_error" };
        return { state: "upstream_unreachable" };
      }
      const out = [];
      for (const v of r.vectors) {
        const lit = vectorLiteral(v);
        if (!lit) return { state: "bad_dimensions", routeFailed: true };
        out.push(lit);
      }
      return { vectors: out };
    },
  };
}
