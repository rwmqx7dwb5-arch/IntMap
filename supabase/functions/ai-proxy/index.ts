// ============================================================================
//  IntMap · ai-proxy  —  Supabase Edge Function (Deno)
// ----------------------------------------------------------------------------
//  Account-based, first-party AI. Replaces the old BYOK (bring-your-own-key)
//  client flow. Every AI feature in index.html (askAI -> aiCallServer) POSTs
//  here with the user's Supabase session JWT. This function:
//
//    1. Verifies the JWT and resolves the user  (login REQUIRED → 401 if not).
//    2. Looks up the user's plan + daily quota   (free = 30/day; easily tiered).
//    3. Atomically consumes one use for today    (increment_ai_usage RPC).
//       → over quota returns 429 {error:"limit", used, limit}.
//    4. Calls the provider with a SERVER-HELD key (model fixed here — the user
//       never sees a key or a model picker).
//    5. Returns { text, used, limit, remaining, charged, meta }. On a provider failure the
//       consumed slot is refunded so a failed call never costs the user a use.
//
//  Deploy:   supabase functions deploy ai-proxy --project-ref vpekfwdpurzejrrmacac
//            (verify_jwt can stay ON; we also verify the user explicitly.)
//  Secrets:  supabase secrets set AI_PROVIDER=openai                  (openai | anthropic | gemini)
//            supabase secrets set AI_MODEL=gpt-5.6-terra             (#R150 Terra re-verified reachable on this project; model fixed here — users never pick it. Luna is the FALLBACK_MODEL.)
//            supabase secrets set OPENAI_API_KEY=sk-...               (CURRENT provider — Terra via /v1/responses)
//            # other providers stay wired but dormant:
//            supabase secrets set GEMINI_API_KEY=AIza...              (if AI_PROVIDER=gemini)
//            supabase secrets set GEMINI_SEARCH_ENABLED=false         (#R113 Gemini grounding, default OFF)
//            supabase secrets set ANTHROPIC_API_KEY=sk-ant-...        (if AI_PROVIDER=anthropic)
//  (SUPABASE_URL, SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY are injected.)
//
// ----------------------------------------------------------------------------
//  (#R113) Gemini 3.5 Flash / thinkingLevel:"low" migration — RESPONSIBILITY SPLIT.
//  The old lightweight model hid design gaps by hallucinating; Gemini Low stops
//  instead of inventing, so the gaps surfaced as MALFORMED_FUNCTION_CALL / empty
//  responses. This function now:
//    • Reads a TASK type from the client (atlas_plan | map_report | research_map |
//      analysis | free_text | json_extract | brief | geo_verify | geo_resolve) and
//      configures per-task output budget, JSON mode and web policy — instead of one
//      MAX_TOKENS / one web flag for all. (#R135) research_map = time-axis research /
//      situation map (historical/current/mixed): a written explanation + related
//      mappable places; JSON task, client passes its own schema, webMode from the
//      Request Profile (historical → optional web on the TOPIC, never current-news).
//    • Uses Gemini Structured Output (responseMimeType:"application/json" + an
//      optional responseSchema) for the JSON tasks, so JSON no longer depends on
//      the prompt alone (kills fences / prose / most MALFORMED_FUNCTION_CALLs).
//    • NEVER attaches a tool the prompt didn't earn: Google Search grounding is
//      attached ONLY when webMode !== "off" AND GEMINI_SEARCH_ENABLED === "true".
//      Default OFF → map_report runs purely on client-gathered evidence.
//    • Classifies provider failures (rate_limit / quota / malformed / empty /
//      blocked / unavailable / invalid_structured_output) and returns 502/503 —
//      NEVER 429 (429 is reserved for the IntMap daily free-use limit).
//    • Retries a MALFORMED_FUNCTION_CALL exactly once with tools stripped +
//      "do not call functions" hardened + JSON mode forced.
//  Secrets, JWTs and full prompts are never logged.
// ----------------------------------------------------------------------------
//  (#R114) OpenAI GPT-5.6 migration (from Gemini) — Responses API path.
//  (#R148) Model is GPT-5.6 Luna. R147 switched it to Terra, but this OpenAI project has NO access
//  to Terra (403 model_not_found) → Atlas went fully down; reverted to Luna (accessible, verified)
//  and added a model-not-found FALLBACK_MODEL retry. Set via the AI_MODEL secret; the Gemini path
//  stays wired but dormant — Gemini 3.1 Flash-Lite is never used.
//    • OpenAI calls go through /v1/responses (reasoning.effort:"low", store:false),
//      text + image input, JSON mode for the JSON tasks (map_report / json_extract).
//    • Web search is a HOSTED tool attached only when the client asks (webMode
//      auto|required). webMode:"required" (e.g. a "latest" brief) FORCES a tool call
//      so the search can't be silently skipped; a 400 on that forcing degrades to
//      model-choice. We COUNT the web_search_call items actually emitted and return
//      meta.webUsed / meta.webSearches so the client can keep "latest" claims honest.
//    • insufficient_quota / billing-hard-limit → provider_quota (hard 502), never a
//      transient retry. Gemini + Anthropic paths are unchanged and still selectable.
//  (#R115) Luna quality tuning: on OpenAI, atlas_plan also runs in JSON mode (the
//  R113c exclusion was Gemini-latency-only — malformed planner JSON was a major
//  "could not interpret" source); an EMPTY/incomplete response (reasoning ate the
//  budget) is retried once with a bigger budget; atlas_plan budget 1800→2200.
//  (#R116) Outage-proofing + quality: the OpenAI call DEGRADES instead of failing —
//  400s walk a fallback ladder (drop tool_choice → drop JSON mode → drop tools) and a
//  timed-out web-search call retries once tool-free (webUsed stays honest), so a
//  request-shape rejection can never blanket-kill Atlas AI again. Per-task reasoning
//  effort: atlas_plan + analysis think at "medium" (complex/ambiguous requests were
//  failing at "low"), extraction tasks stay "low". Web calls get a 90s leash.
// ============================================================================

import { createClient } from "@supabase/supabase-js";   // pinned in this function's deno.json

const cors = {
  "Access-Control-Allow-Origin": "*",
  /* (#R318) x-intmap-turn — the turn key. It is a HEADER because the quota is consumed before the
     body is read (see the consumption step), and a preflight that does not name it makes the whole
     request fail in the browser rather than merely dropping the field. */
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-intmap-turn",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ---- Plan → daily free-use limit. Extend here for future paid tiers. --------
const PLAN_LIMITS: Record<string, number> = { free: 10, plus: 50, pro: 200, unlimited: 1_000_000 };
/* (#R318) ONE USER TURN = ONE USE. Atlas finishes one request with up to three calls (planner +
   two bounded repairs, or a vision read + its self-check re-read), and charging three for one
   question is a bill the user never agreed to. The client stamps a turn key; the FIRST call
   carrying it pays, the rest are free — bounded HERE, not by the client:
     · TURN_MAX_CALLS  — how many calls one key may carry. Above it: 429 {error:"turn_calls"}.
     · TURN_TTL_S      — how long a key stays alive. A replayed old key opens a new, charged turn.
   Both are constants in this file precisely so a caller cannot raise them. */
const TURN_MAX_CALLS = 6;
const TURN_TTL_S = 900;
const MAX_TURN_KEY = 120;   /* (#R101) free 10→30/day; (#R147) 30→10/day */
const DEFAULT_LIMIT = PLAN_LIMITS.free;

// (#R150) OpenAI model = GPT-5.6 TERRA. In R148 this project had NO access to gpt-5.6-terra (403
// model_not_found), so we ran Luna. Re-verified on 2026-07-21 via the refresh-news proxy (same key +
// AI_MODEL secret, NO model fallback): AI_MODEL=gpt-5.6-terra geocoded 61/63 EN + 104/116 JP articles →
// Terra is now reachable on the project. Per the user's standing request, Terra is now the model
// (AI_MODEL secret = gpt-5.6-terra). Luna stays the FALLBACK_MODEL: if Terra ever loses access again, a
// 403/404 model_not_found retries once with Luna so a model outage can never blanket-kill Atlas.
const OPENAI_DEFAULT_MODEL = "gpt-5.6-terra";
const FALLBACK_MODEL = "gpt-5.6-luna";

const MAX_PROMPT = 24_000;     // hard caps so a single call can't be abused
/* ══ ⚠⚠⚠ (#R285) THE PLANNER'S CATALOGUE WAS BEING CUT IN HALF, IN PRODUCTION, SILENTLY ═══════════
   `system` used to share MAX_PROMPT with `prompt`. But `system` is not user text — it is the Atlas
   prompt the app itself builds, and the planner's is the action CATALOGUE: every button, layer,
   panel and setting described to the model. Measured on the deployed build (v46): that string is
   ~91 kB, so `.slice(0, 24_000)` threw away roughly two thirds of it, mid-word, inside the `engine`
   action's description. Everything documented after that point — several dozen actions, the layer
   list, the module list, the control list — DID NOT EXIST for the planner.
   ⚠ AND THE GATE THAT WAS SUPPOSED TO CATCH THIS COULD NOT SEE IT. scripts/atlas-catalog.mjs
   (#R278) checks that every dispatch capability is described in function SYS() — it reads the
   SOURCE, and the source was complete. What was incomplete was the part that arrived. A catalogue
   gate that stops at the client is measuring the letter, not the delivery.
   The cap stays a cap: `prompt` — the half that carries user text — keeps 24 kB, and `system` gets
   a bound of its own, set well above the real maximum rather than below it. */
const MAX_SYSTEM = 160_000;
const MAX_IMAGES = 4;

/* ══ ⚠⚠ THE REQUEST ITSELF HAD NO SIZE ═══════════════════════════════════════════════════════════
   MAX_PROMPT and MAX_IMAGES were applied AFTER `await req.json()`, i.e. after the whole body had
   already been read into the isolate and parsed. `{"images":[<400 MB of base64>]}` was therefore
   accepted, buffered and parsed in full before the code that limits it to four ever ran — and the
   caller only needs to be logged in, because the quota is consumed a step earlier. Every bound below
   is measured against what the CLIENT actually sends, so none of them can be reached by normal use:
     · js/atlas-console.js compresses each picked image with compressImage(f, 2000, 0.9) — a 2000 px
       JPEG at q=0.9, i.e. ~0.5-2 MB, base64'd to ~0.7-2.7 MB — and slices the list to 4.
     · the prompt string is already clamped to MAX_PROMPT (24 kB) and, since #R285, the system string
       to MAX_SYSTEM (160 kB) — together still four orders of magnitude under the body ceiling below.
   So the realistic worst case is ~11 MB of body; the ceiling is 20 MB, and a request over it is
   refused before it is read rather than after it is parsed. */
const MAX_BODY_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;        // ONE decoded image (2000 px q0.9 JPEG is well under)
const MAX_IMAGES_BYTES = 12 * 1024 * 1024;      // …and all of them together
/* The four raster formats the providers accept. The old regex was `image/[a-zA-Z0-9.+-]+`, which also
   said yes to image/svg+xml — a document format with script in it — and to any string shaped like a
   MIME type, for a value that is pasted straight into the provider request. */
const IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
/* ⚠ A TASK IS A KEY INTO FOUR CONFIGURATION TABLES, and it arrived as an arbitrary string:
   `String(payload.task || "free_text").toLowerCase()`, then `TASK_MAX_OUTPUT[task] ?? FALLBACK`. So an
   unknown task silently ran on fallback budgets, was echoed back in `meta.task`, and — because a
   plain object was being indexed with caller-controlled text — `task: "__proto__"` or
   `"constructor"` read an inherited value instead of a missing one. The set below is exactly the ten
   tasks TASK_MAX_OUTPUT defines and the eight js/ actually sends; anything else is a 400. */
const TASKS = new Set([
  "atlas_plan", "map_report", "analysis", "free_text", "json_extract",
  "brief", "geo_verify", "geo_resolve", "research_map", "vision_read",
]);
/* A caller-supplied responseSchema is forwarded to the provider verbatim, so it is an input too.
   Nothing in js/ passes one today (only task === "map_report" gets a schema, and that one is this
   file's own constant) — these are the bounds on a field that exists for future callers. */
const MAX_SCHEMA_BYTES = 16 * 1024;
const MAX_SCHEMA_DEPTH = 12;
const MAX_SCHEMA_KEYS = 512;
function schemaOk(v) {
  let json = "";
  try { json = JSON.stringify(v); } catch (_) { return false; }      // cyclic, or not serialisable
  if (!json || json.length > MAX_SCHEMA_BYTES) return false;
  let keys = 0;
  const walk = (n: unknown, depth: number): boolean => {
    if (depth > MAX_SCHEMA_DEPTH) return false;
    if (Array.isArray(n)) return n.every((x) => walk(x, depth + 1));
    if (n && typeof n === "object") {
      for (const k of Object.keys(n as Record<string, unknown>)) {
        if (++keys > MAX_SCHEMA_KEYS) return false;
        if (k === "__proto__" || k === "constructor" || k === "prototype") return false;
        if (!walk((n as Record<string, unknown>)[k], depth + 1)) return false;
      }
    }
    return true;
  };
  return walk(v, 0);
}

// (#R113) Per-TASK output budgets (replaces the single MAX_TOKENS = 1600). A 20-item
// map_report can't fit in 1600 tokens; a quick json_extract shouldn't be allowed 3000.
// Kept modest for cost; map_report additionally scales with the requested item count.
const TASK_MAX_OUTPUT: Record<string, number> = {
  atlas_plan: 2200,   // (#R115) 1800→2200: multi-action plans + "say" were clipping on complex requests
  map_report: 3200,
  analysis: 2400,
  free_text: 1800,
  json_extract: 1200,
  brief: 1800,
  geo_verify: 500,   // (#R130) web-search-grounded place verification for the Atlas highlight/outline resolver — tiny JSON
  geo_resolve: 1800, // (#R132) web-search-grounded STRUCTURED region resolution (metadata + boundary anchors, NOT a dense polygon)
  research_map: 2600, // (#R135) time-axis research/situation map: written explanation + related mappable places (historical/current/mixed)
  vision_read: 3000, // (#R156) multimodal read: classify → transcribe → solve (LaTeX/Markdown) → verify-checks → optional places. Needs room for a transcription + working + the checks matrices.
};
const FALLBACK_MAX_OUTPUT = 1800;
const HARD_MAX_OUTPUT = 5000;   // absolute ceiling (cost guard)

// (#R116) Per-task REASONING effort (OpenAI path). "low" was starving the PLANNER — complex or
// ambiguous requests came back with wrong/empty plans ("実行できませんでした / 出力が間違ってる").
// Planning + analysis get "medium" (the quality bottleneck); the mechanical/extraction tasks stay
// "low" for cost & latency. The brief's freshness comes from the forced web search, not reasoning.
const TASK_REASONING: Record<string, string> = {
  atlas_plan: "medium",
  analysis: "medium",
  map_report: "low",
  free_text: "low",
  json_extract: "low",
  brief: "low",
  geo_verify: "low",   // (#R130) freshness comes from the forced web search, not reasoning
  geo_resolve: "medium",   // (#R132) classifying an ambiguous / natural / historical region + picking a geometry strategy needs real reasoning
  research_map: "medium",   // (#R135) a grounded historical/situation answer + naming real related places needs real reasoning
  vision_read: "medium",   // (#R156) reading small text + transcribing + solving a maths problem needs real reasoning (effortHint:"high" bumps it further)
};

// (#R113) Which tasks want JSON output (structured-output / responseMimeType json).
// (#R113c) atlas_plan is INTENTIONALLY excluded: forcing responseMimeType on the very large planner prompt added
// latency (feeding the 45s timeouts) and the planner worked fine before with prompt-only JSON (aiParseJSON on the
// client strips any fence). map_report / json_extract keep structured output where it matters most.
const JSON_TASKS = new Set(["map_report", "json_extract", "geo_verify", "geo_resolve", "research_map", "vision_read"]);   /* (#R156) vision_read returns a strict JSON object (contentClass/answer/checks/places) */

// (#R113) Gemini Structured Output schema for map_report. The model returns ONLY
// name/locationName/country/summary/date/evidenceIds — the client fills url, source,
// publishedAt and the real lat/lng (geocoded) so the model can't invent coordinates
// or sources. `type` uses the REST Schema enum (uppercase) per the generateContent docs.
const MAP_REPORT_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    overview: { type: "STRING" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          locationName: { type: "STRING" },
          country: { type: "STRING" },
          summary: { type: "STRING" },
          date: { type: "STRING" },
          evidenceIds: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["name", "locationName", "country", "summary", "evidenceIds"],
        propertyOrdering: ["name", "locationName", "country", "summary", "date", "evidenceIds"],
      },
    },
  },
  required: ["title", "overview", "items"],
  propertyOrdering: ["title", "overview", "items"],
};

function maxOutputFor(task: string, requestedCount?: number): number {
  let n = TASK_MAX_OUTPUT[task] ?? FALLBACK_MAX_OUTPUT;
  if (task === "map_report" && typeof requestedCount === "number" && isFinite(requestedCount) && requestedCount > 0) {
    n = Math.max(n, 1000 + Math.round(requestedCount) * 180);
  }
  return Math.min(HARD_MAX_OUTPUT, n);
}

interface ImgPart { mime: string; b64: string; }
// (#R131) A single hosted-web-search citation the model emitted (Responses API url_citation
// annotation). Kept end-to-end so the client can show the sources the model ACTUALLY read/cited
// this turn, distinct from the articles IntMap gathered on the client. The old code threw these
// away, so a correctly web-verified source could vanish from the UI.
interface WebCitation { url: string; title: string; startIndex?: number; endIndex?: number; }
/* Decoded length of a base64 string, without decoding it. */
function b64Bytes(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor(b64.length / 4) * 3 - pad;
}
function parseDataUrl(d: string): ImgPart | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(d || "");
  if (!m) return null;
  const mime = m[1].toLowerCase(), b64 = m[2];
  /* ⚠ ALL THREE CHECKS ARE ABOUT THE SAME THING: what goes into the provider request must be an
     image, and it must be an image of a size somebody could actually have taken. The old regex
     checked neither the format nor the length, and `.*` accepted any character at all after the
     comma — including a second `data:` URL, or a megabyte of text that is not base64. */
  if (!IMAGE_MIME.has(mime)) return null;
  if (b64.length % 4 !== 0) return null;
  if (b64Bytes(b64) > MAX_IMAGE_BYTES) return null;
  return { mime, b64 };
}

// (#R113b) A hung/slow provider fetch must NOT run the isolate into the Edge-Function wall-clock limit (which
// terminates it with an opaque 546 the client can't parse). Abort each provider call well before that so it fails
// as a clean, classified 503 instead. 45s is generous for Gemini "low" yet safe for a MALFORMED retry (2×45<limit).
const PROVIDER_TIMEOUT_MS = 55_000;
async function fetchWithTimeout(url: string, init: RequestInit, ms = PROVIDER_TIMEOUT_MS): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError";
    /* ⚠ NOT `+ e.message`. A transport failure's message names the host it was resolving, the TLS
       state it got to and this file's own internals; the caller can act on «timed out» and «could not
       be reached», and nothing more specific is theirs. */
    throw new ProviderError("provider_unavailable", aborted ? "The AI provider timed out." : "Could not reach the AI provider.", 503, true, { timeout: aborted });
  } finally {
    clearTimeout(t);
  }
}

// (#R113) Typed provider failure → mapped to an HTTP status that is NEVER 429
// (429 means the IntMap daily quota) so the client can tell them apart.
type AIProxyErrorCode =
  | "provider_rate_limit"
  | "provider_quota"
  | "provider_malformed"
  | "provider_empty"
  | "provider_blocked"
  | "provider_unavailable"
  | "invalid_structured_output";

class ProviderError extends Error {
  code: AIProxyErrorCode;
  http: number;
  retryable: boolean;
  meta: Record<string, unknown>;
  constructor(code: AIProxyErrorCode, message: string, http: number, retryable: boolean, meta: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.http = http;
    this.retryable = retryable;
    this.meta = meta;
  }
}

// Classify a Google generativelanguage error body / finishReason into a typed error.
function classifyGemini(status: number, bodyText: string, finishReason: string, blockReason: string): ProviderError {
  const lc = (bodyText || "").toLowerCase();
  if (finishReason === "MALFORMED_FUNCTION_CALL") {
    return new ProviderError("provider_malformed", "Model emitted a malformed function/tool call.", 502, true, { finishReason });
  }
  if (finishReason === "SAFETY" || blockReason) {
    return new ProviderError("provider_blocked", "Blocked by the provider's safety filter." + (blockReason ? " (" + blockReason + ")" : ""), 502, false, { finishReason, blockReason });
  }
  // (#R114) OpenAI billing/quota exhaustion (out of prepaid balance, or the project hit its hard
  // spend limit) is a HARD stop — NOT a transient per-minute rate limit — so it must not be retried
  // or read as "try again shortly". (Checked before the generic 429 branch below.)
  if (lc.includes("insufficient_quota") || lc.includes("billing_hard_limit_reached") || lc.includes("billing hard limit")) {
    return new ProviderError("provider_quota", "The AI provider account balance / spend limit was reached.", 502, false, { providerStatus: status });
  }
  if (status === 429 || lc.includes("resource_exhausted") || lc.includes("exceeded your current quota") || lc.includes("rate limit")) {
    // (#R113e) Gemini's 429 body is IDENTICAL for a transient per-MINUTE rate limit (clears in ~1 min) and a hard
    // per-DAY / billing quota — both say "check your plan and billing". Distinguish by the quotaId so per-minute reads
    // as transient and only per-day/billing reads as a hard quota. quotaId + retryAfter go into meta for diagnosis.
    let quotaId = ""; try { const m = /quotaid["']?\s*[:=]\s*["']?([a-z0-9_.\-]+)/i.exec(bodyText || ""); if (m) quotaId = m[1].slice(0, 90); } catch (_) { /* */ }
    let retryAfter = ""; try { const m = /retry(?:delay|after)["']?\s*[:=]\s*["']?(\d+)\s*s/i.exec(bodyText || ""); if (m) retryAfter = m[1] + "s"; } catch (_) { /* */ }
    const qlc = (quotaId + " " + lc);
    const perDay = qlc.includes("perday") || qlc.includes("per day") || qlc.includes("requests per day");
    const perMinute = qlc.includes("perminute") || qlc.includes("per minute");
    if (perDay && !perMinute) {
      return new ProviderError("provider_quota", "The AI provider DAILY quota was reached.", 502, false, { providerStatus: status, quotaScope: "per-day", quotaId, retryAfter });
    }
    // per-minute or generic 429 → transient rate-limit (the caller just needs to wait ~a minute; do NOT auto-retry).
    return new ProviderError("provider_rate_limit", "The AI provider is rate-limiting requests" + (perMinute ? " (per-minute)" : "") + ". Try again shortly.", 503, true, { providerStatus: status, quotaScope: perMinute ? "per-minute" : "rate", quotaId, retryAfter });
  }
  if (status >= 500) {
    return new ProviderError("provider_unavailable", "The AI provider is temporarily unavailable.", 503, true, { providerStatus: status });
  }
  return new ProviderError("provider_unavailable", "AI provider error " + status + ".", 502, false, { providerStatus: status });
}

// ---------------------------------------------------------------------------
//  Provider calls (key lives only here, in the function's env).
// ---------------------------------------------------------------------------
async function callAnthropic(model: string, key: string, prompt: string, system: string, imgs: ImgPart[], web: boolean, maxTokens: number): Promise<{ text: string; finishReason: string }> {
  const content: unknown[] = [];
  for (const ip of imgs) content.push({ type: "image", source: { type: "base64", media_type: ip.mime, data: ip.b64 } });
  content.push({ type: "text", text: prompt });
  const body: Record<string, unknown> = { model, max_tokens: maxTokens, messages: [{ role: "user", content }] };
  if (system) body.system = system;
  // Anthropic has a NATIVE web-search tool; unlike Gemini it is safe to attach on demand.
  if (web) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }];
  const r = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = (await r.text().catch(() => "")).slice(0, 400);
    throw classifyGemini(r.status, t, "", "");   // same status→code mapping applies to Anthropic
  }
  const j = await r.json();
  const text = (j.content && j.content.map((b: { text?: string }) => b.text || "").join("")) || "";
  const finishReason = String(j?.stop_reason || "");
  if (!text) throw new ProviderError("provider_empty", "Empty response from Anthropic.", 502, true, { finishReason });
  return { text, finishReason };
}

async function callOpenAI(model: string, key: string, prompt: string, system: string, imgs: ImgPart[], web: boolean, maxTokens: number, wantJson: boolean, forceWeb: boolean, effort: string, imageDetail = "auto", _isFallback = false): Promise<{ text: string; finishReason: string; webAttached: boolean; webUsed: boolean; webCount: number; citations: WebCitation[] }> {
  // GPT-5.6 models (gpt-5.6-luna) work best through the Responses API. `max_output_tokens`
  // includes invisible reasoning tokens, so leave a reasoning allowance above IntMap's
  // visible-output budget — bigger when effort is "medium" (#R116) — under a hard ceiling.
  // (#R156) input_image `detail`: "high" tiles the image so the model reads SMALL text / fraction bars /
  // subscripts (the vision_read OCR/maths win); "auto" (default) is unchanged for every other caller.
  const content: unknown[] = [{ type: "input_text", text: prompt }];
  const _detail = (imageDetail === "high" || imageDetail === "low") ? imageDetail : "auto";
  for (const ip of imgs) content.push({ type: "input_image", image_url: `data:${ip.mime};base64,${ip.b64}`, detail: _detail });

  const build = (choice: string | null, json: boolean, tools: boolean): Record<string, unknown> => {
    const b: Record<string, unknown> = {
      model,
      input: [{ role: "user", content }],
      max_output_tokens: Math.min(12_000, maxTokens + (effort === "high" ? 5_000 : effort === "medium" ? 3_500 : 1_500)),
      reasoning: { effort: effort === "high" ? "high" : effort === "medium" ? "medium" : "low" },   /* (#R117) pass "high" through (the old mapping silently crushed anything ≠ medium down to low) */
      store: false,
    };
    if (system) b.instructions = system;
    // JSON mode. NOTE: OpenAI's json_object validator wants the word "JSON" in the request; the
    // task prompts carry it, but a rejection is survivable via the 400 ladder below anyway.
    if (json) b.text = { format: { type: "json_object" } };
    // Search is paid per tool call, so attach it only when the client explicitly
    // asks for auto/required web mode. Ordinary Atlas work stays tool-free.
    if (tools) { b.tools = [{ type: "web_search" }]; if (choice) b.tool_choice = choice; }
    return b;
  };
  const post = (body: Record<string, unknown>, ms: number) => fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
    body: JSON.stringify(body),
  }, ms);

  // (#R116) OUTAGE-PROOFING. The user hit a blanket "AI service temporarily unavailable": any
  // request-shape rejection (400) or a slow hosted web_search run must DEGRADE, never kill the
  // feature. Timeouts: a search-attached call gets a longer leash (searches legitimately run
  // long); if it still times out, ONE fast tool-free retry answers from the supplied evidence
  // (meta.webUsed stays false, so "latest" claims remain honest). 400s walk a fallback ladder:
  // forced tool_choice → model-choice → drop JSON mode (prompt-only JSON; the client parser
  // strips fences) → drop tools.
  // 90s + 40s fallback = 130s worst case — safely inside even a 150s wall-clock limit.
  const WEB_TIMEOUT = 90_000;
  let usedTools = web, usedJson = wantJson;
  let r: Response;
  try {
    r = await post(build(web && forceWeb ? "required" : null, wantJson, web), web ? WEB_TIMEOUT : PROVIDER_TIMEOUT_MS);
  } catch (e) {
    const timedOut = e instanceof ProviderError && e.meta && (e.meta as Record<string, unknown>).timeout === true;
    if (web && timedOut) {
      usedTools = false;
      r = await post(build(null, wantJson, false), 40_000);
    } else {
      throw e;
    }
  }
  if (!r.ok && r.status === 400 && usedTools && forceWeb) {
    r = await post(build(null, usedJson, true), WEB_TIMEOUT);
  }
  if (!r.ok && r.status === 400 && usedJson) {
    usedJson = false;
    r = await post(build(null, false, usedTools), usedTools ? WEB_TIMEOUT : PROVIDER_TIMEOUT_MS);
  }
  if (!r.ok && r.status === 400 && usedTools) {
    usedTools = false;
    r = await post(build(null, usedJson, false), PROVIDER_TIMEOUT_MS);
  }
  if (!r.ok) {
    const t = (await r.text().catch(() => "")).slice(0, 400);
    // (#R148) The configured model is unknown / not enabled on this OpenAI project (403/404
    // model_not_found · "does not have access to model"). This is exactly what broke Atlas when
    // AI_MODEL was set to a model the project can't reach — so instead of failing the whole call,
    // retry ONCE with the known-good FALLBACK_MODEL. Bounded by _isFallback (no recursion loop) and
    // skipped when we are already on the fallback model.
    if (!_isFallback && (r.status === 403 || r.status === 404) && model !== FALLBACK_MODEL &&
        /model_not_found|does not have access to model|does not exist|unknown model|no access/i.test(t)) {
      try { console.error("ai-proxy model fallback", JSON.stringify({ from: model, to: FALLBACK_MODEL, status: r.status })); } catch (_) { /* ignore */ }
      return await callOpenAI(FALLBACK_MODEL, key, prompt, system, imgs, web, maxTokens, wantJson, forceWeb, effort, imageDetail, true);
    }
    const pe = classifyGemini(r.status, t, "", "");
    /* ⚠ THE UPSTREAM BODY IS NOT OURS TO REPEAT. `pe.meta.bodySnippet = t.slice(0,160)` was written
       as «surfaced in the server log for diagnosis», but `meta` is spread into the JSON handed back
       to the browser at the bottom of this file — so 160 bytes of whatever OpenAI answered with went
       to the CALLER as well as to the log. A provider error body is not a controlled surface: it can
       echo the request (which contains the prompt), name an organisation or project, or carry an
       identifier from the account. The CLASSIFICATION is what anyone here can act on; the length
       says whether there was a body at all, which is the only part of it worth keeping. */
    pe.meta.bodyLen = t.length;
    throw pe;
  }
  const j = await r.json();
  // deno-lint-ignore no-explicit-any
  const outputArr: any[] = Array.isArray(j?.output) ? j.output : [];
  // deno-lint-ignore no-explicit-any
  const msgParts: any[] = outputArr
    .filter((item: { type?: string }) => item?.type === "message")
    .flatMap((item: { content?: unknown[] }) => Array.isArray(item.content) ? item.content : []);
  // deno-lint-ignore no-explicit-any
  const textParts: any[] = msgParts.filter((part: { type?: string; text?: string }) => part?.type === "output_text" && typeof part.text === "string");
  const text = (typeof j?.output_text === "string" && j.output_text ? j.output_text : "") ||
    textParts.map((part: { text?: string }) => part.text || "").join("");
  // (#R131) Preserve the hosted web-search CITATIONS. The Responses API attaches `url_citation`
  // annotations to the output_text parts (the URLs the model actually consulted this turn). The old
  // code only read `part.text` and discarded `part.annotations`, so even when the web search verified
  // the right article, the client had no way to show it and could only surface the client-gathered
  // headlines. Keep url/title/offsets so the client can render them as the primary, web-verified sources.
  const citations: WebCitation[] = [];
  const seenCite = new Set<string>();
  for (const part of textParts) {
    const anns = Array.isArray((part as { annotations?: unknown[] }).annotations) ? (part as { annotations: Array<Record<string, unknown>> }).annotations : [];
    for (const an of anns) {
      if (an && an.type === "url_citation" && typeof an.url === "string" && an.url) {
        const key = an.url.replace(/[#?].*$/, "");
        if (seenCite.has(key)) continue;
        seenCite.add(key);
        citations.push({
          url: an.url,
          title: String(an.title || ""),
          startIndex: typeof an.start_index === "number" ? an.start_index : undefined,
          endIndex: typeof an.end_index === "number" ? an.end_index : undefined,
        });
      }
    }
  }
  // (#R114) Did the hosted web-search tool ACTUALLY run this turn? Responses emits a
  // `web_search_call` item per search — count them so the client can honestly say whether
  // it got fresh info, instead of assuming "attached === searched".
  const webCount = outputArr.filter((item: { type?: string }) => typeof item?.type === "string" && item.type.indexOf("web_search") === 0).length;
  const finishReason = String(j?.status || j?.incomplete_details?.reason || "");
  if (!text) {
    const refused = outputArr.some((item: { content?: unknown[] }) =>
      Array.isArray(item?.content) && item.content.some((part: { type?: string }) => part?.type === "refusal"));
    if (refused) throw new ProviderError("provider_blocked", "Blocked by the provider's safety filter.", 502, false, { finishReason });
    throw new ProviderError("provider_empty", "Empty response from OpenAI.", 502, true, { finishReason });
  }
  return { text, finishReason, webAttached: usedTools, webUsed: webCount > 0, webCount, citations };
}

interface GeminiOpts {
  maxTokens: number;
  web: boolean;
  searchEnabled: boolean;
  wantJson: boolean;
  responseSchema?: unknown;
  noTools?: boolean;         // hardened retry: never attach a tool
}

async function callGemini(model: string, key: string, prompt: string, system: string, imgs: ImgPart[], opts: GeminiOpts): Promise<{ text: string; finishReason: string; webAttached: boolean }> {
  const parts: unknown[] = [{ text: prompt }];
  for (const ip of imgs) parts.push({ inline_data: { mime_type: ip.mime, data: ip.b64 } });

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: opts.maxTokens,
    thinkingConfig: { thinkingLevel: "low" },
  };
  // (#R113) Structured output — forces valid JSON without relying on the prompt, and
  // (with a schema) pins the exact shape. Google Search grounding + a responseSchema
  // can't be combined, so a schema is only sent when no search tool is attached.
  const attachSearch = opts.web && opts.searchEnabled && !opts.noTools;
  if (opts.wantJson) {
    generationConfig.responseMimeType = "application/json";
    if (opts.responseSchema && !attachSearch) generationConfig.responseSchema = opts.responseSchema;
  }

  const body: Record<string, unknown> = { contents: [{ role: "user", parts }], generationConfig };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (attachSearch) body.tools = [{ google_search: {} }];

  const r = await fetchWithTimeout(
    "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
    { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) },
  );

  if (!r.ok) {
    const err = (await r.text().catch(() => "")).slice(0, 1500);   // (#R113e) wide enough to see the quotaId in a 429 body
    throw classifyGemini(r.status, err, "", "");
  }

  const j = await r.json();
  const c = j?.candidates?.[0];
  const finishReason = String(c?.finishReason || "NO_CANDIDATE");
  const blockReason = String(j?.promptFeedback?.blockReason || "");

  if (finishReason === "MALFORMED_FUNCTION_CALL" || finishReason === "SAFETY" || blockReason) {
    throw classifyGemini(200, "", finishReason, blockReason);
  }

  // Ignore any thought-only parts and return only the user-visible answer.
  const text = Array.isArray(c?.content?.parts)
    ? c.content.parts
        .filter((p: { thought?: boolean; text?: string }) => p?.thought !== true && typeof p?.text === "string")
        .map((p: { text?: string }) => p.text || "")
        .join("")
        .trim()
    : "";

  // Do not silently turn a provider failure into an empty Atlas answer.
  if (!text) {
    throw new ProviderError("provider_empty", "gemini: empty response (finishReason=" + finishReason + (blockReason ? ", blockReason=" + blockReason : "") + ")", 502, finishReason === "MAX_TOKENS", { finishReason, blockReason });
  }

  return { text, finishReason, webAttached: attachSearch };
}

// (#R113c) Transient Google errors — 503 "the model is overloaded" / other 5xx / rate-limit — are common for a busy
// model and usually clear on a retry (Gemini's own guidance is to retry with backoff). Retry those up to twice with a
// short backoff. Timeouts and MALFORMED are handled elsewhere (retrying a timeout would just burn another 45s).
async function callGeminiRetry(model: string, key: string, prompt: string, system: string, imgs: ImgPart[], opts: GeminiOpts): Promise<{ text: string; finishReason: string; webAttached: boolean }> {
  const MAX = 3;   // 1 attempt + up to 2 retries
  for (let attempt = 1; ; attempt++) {
    try {
      return await callGemini(model, key, prompt, system, imgs, opts);
    } catch (e) {
      const ps = (e instanceof ProviderError && e.meta && typeof e.meta.providerStatus === "number") ? e.meta.providerStatus as number : 0;
      // (#R113e) Retry ONLY a 5xx overload — NOT a 429. Retrying a rate/quota 429 immediately just consumes another
      // request of the SAME per-minute/per-day budget (making it worse); those need the caller to wait ~a minute.
      const transient = e instanceof ProviderError && e.code === "provider_unavailable" && ps >= 500;
      if (transient && attempt < MAX) {
        await new Promise((r) => setTimeout(r, 700 * attempt));
        continue;
      }
      throw e;
    }
  }
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
 try {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1) Identify the user from their JWT. Login is required.
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "auth", message: "Login required." }, 401);

  // Service-role client for the quota table + plan lookup.
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 2) Plan → limit.
  let plan = "free";
  try {
    const { data: prof } = await db.from("profiles").select("plan").eq("id", user.id).maybeSingle();
    if (prof && typeof prof.plan === "string" && prof.plan) plan = prof.plan;
  } catch (_) { /* profiles.plan may not exist yet → default free */ }
  /* (#R31/#R32) Developer override → UNLIMITED AI, quota never consumed ("AI機能の使用は無制限に").
     ⚠ IT IS A USER ID NOW, AND THE ID LIVES IN A SECRET RATHER THAN IN THIS FILE. The rule used to be
     a hard-coded e-mail address compiled into a PUBLIC repository, which is three separate problems:
       · it publishes the maintainer's address to anyone who reads the source;
       · it makes the privilege depend on `auth.users.email`, a field that a provider can change
         (an Apple private-relay address is re-issued when the user turns off «Hide My Email») and
         that several identity providers let the account holder edit;
       · and it is unrevocable without a redeploy.
     The identity is the immutable `auth.users.id`, supplied through the DEV_USER_IDS secret
     (`supabase secrets set DEV_USER_IDS=<uuid>`), so the RIGHTS are unchanged — the same account is
     still exempt from consumption and still resolves to plan "unlimited" — while the address is gone
     from the tree and the grant can be moved or withdrawn without touching code. `profiles.plan`
     carries the same grant in the database, so the two agree even if the secret is ever unset. */
  const devIds = (Deno.env.get("DEV_USER_IDS") || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  const isDev = devIds.includes(String(user.id || "").toLowerCase());
  if (isDev) plan = "unlimited";
  const limit = PLAN_LIMITS[plan] ?? DEFAULT_LIMIT;

  /* (#R318) The turn key travels in a HEADER, not in the JSON body, because the body has not been
     read yet at this point and must not be: consumption happens before parsing precisely so an
     unbounded body cannot be parsed by an over-quota caller (the comment above MAX_BODY_BYTES).
     It is a client-supplied string and is treated as one — see the migration's header for the
     three things that make it safe to accept. */
  const turnId = String(req.headers.get("x-intmap-turn") || "").slice(0, MAX_TURN_KEY);

  // 3) Consume one use for TODAY, once per TURN (the developer is exempt — no consumption).
  let used = 0;
  let charged = false;
  if (!isDev) try {
    const { data: dec, error } = await db.rpc("consume_ai_turn", {
      p_user: user.id, p_limit: limit, p_turn: turnId,
      p_max_calls: TURN_MAX_CALLS, p_ttl_seconds: TURN_TTL_S,
    });
    if (error) throw error;
    const row = Array.isArray(dec) ? dec[0] : dec;
    used = row?.used ?? 0;
    charged = !!row?.charged;
    if (!row?.allowed) {
      /* Two different 429s, and the client must be able to tell them apart: one means "come back
         tomorrow", the other means "this one request has asked enough times". */
      const reason = String(row?.reason || "limit");
      if (reason === "turn_calls") return json({ error: "turn_calls", used, limit, calls: row?.calls ?? 0 }, 429);
      return json({ error: "limit", used, limit }, 429);
    }
  } catch (_e) {
    /* ⚠ NOT the database error. `String(e.message)` from a PostgREST/RPC failure names the schema,
       the function signature and sometimes the row that tripped a constraint. */
    return json({ error: "quota_unavailable", message: "The usage counter is unavailable — please try again." }, 500);
  }
  /* ⚠ (#R318) A REFUND RELEASES THE CHARGE **AND** THE TURN. Refunding the use while leaving the
     turn row behind would make the user's retry look like a free continuation of a turn nobody
     paid for — the failure would end up costing less than nothing. */
  const refund = async () => { if (!isDev) try { await db.rpc("refund_ai_turn", { p_user: user.id, p_turn: turnId }); charged = false; } catch (_) { /* best-effort */ } };

  // Parse the request body.
  // (#R113) `task` + `webMode` let the proxy configure output budget, JSON mode and
  // web policy per feature — instead of one MAX_TOKENS / one boolean for everything.
  let payload: {
    prompt?: string; system?: string; images?: string[]; lang?: string;
    web?: boolean; webMode?: string; task?: string; requestedCount?: number; schema?: unknown; imageDetail?: string;
    effortHint?: string; turnId?: string;
  } = {};
  /* ⚠ REFUSED BEFORE IT IS READ, when the caller declares a size. A body without content-length is
     still bounded, because the read below is capped and a longer one is discarded rather than parsed. */
  {
    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      await refund();
      return json({ error: "too_large", message: "Request body is too large." }, 413);
    }
    try {
      const raw = await req.arrayBuffer();
      if (raw.byteLength > MAX_BODY_BYTES) {
        await refund();
        return json({ error: "too_large", message: "Request body is too large." }, 413);
      }
      payload = JSON.parse(new TextDecoder("utf-8").decode(raw));
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) payload = {};
    } catch (_) { payload = {}; }
  }

  const task = String(payload.task || "free_text").toLowerCase();
  if (!TASKS.has(task)) {
    await refund();
    return json({ error: "bad_task", message: "Unknown task." }, 400);
  }
  // (#R156) input_image detail — "high" is the small-text/maths OCR lever for vision_read; clamp to a safe set.
  const imageDetail = (payload.imageDetail === "high" || payload.imageDetail === "low") ? payload.imageDetail : "auto";
  const webMode = String(payload.webMode || (payload.web === true ? "auto" : "off")).toLowerCase();
  // (#R117) client complexity hint: a long / multi-clause / previously-failed request may ask the
  // PLANNER (and analysis) to think at "high". Bounded: only these two tasks, only one step up —
  // it cannot raise budgets elsewhere or be abused by other tasks.
  const effortHint = String(payload.effortHint || "").toLowerCase();
  const web = webMode === "auto" || webMode === "required";
  const requestedCount = typeof payload.requestedCount === "number" ? payload.requestedCount : undefined;
  const prompt = String(payload.prompt || "").slice(0, MAX_PROMPT);
  const system = String(payload.system || "").slice(0, MAX_SYSTEM);   // (#R285) its own bound — see MAX_SYSTEM
  /* ⚠ THE PER-IMAGE CEILING IS IN parseDataUrl; THIS IS THE ONE FOR ALL OF THEM TOGETHER. Four
     images each just under the single-image limit is four times the single-image limit, and the
     provider request carries every one of them. */
  const imgs: ImgPart[] = [];
  {
    let total = 0;
    for (const d of (Array.isArray(payload.images) ? payload.images : [])) {
      if (imgs.length >= MAX_IMAGES) break;
      const part = typeof d === "string" ? parseDataUrl(d) : null;
      if (!part) continue;
      const n = b64Bytes(part.b64);
      if (total + n > MAX_IMAGES_BYTES) break;
      total += n;
      imgs.push(part);
    }
  }
  if (!prompt && !imgs.length) {
    await refund();
    return json({ error: "empty" }, 400);
  }

  const maxTokens = maxOutputFor(task, requestedCount);
  // 4) Provider call with the server-held key. (Provider read BEFORE wantJson — see below.)
  const provider = (Deno.env.get("AI_PROVIDER") || "anthropic").toLowerCase();
  // (#R115) On OpenAI, atlas_plan ALSO runs in JSON mode: the R113c exclusion was a GEMINI-latency
  // workaround (forced responseMimeType slowed the big planner prompt into 45s timeouts). OpenAI's
  // json_object format has no such issue and guarantees parseable plans — a large share of the
  // "Sorry, I could not interpret that" failures were the planner's JSON arriving malformed.
  const wantJson = JSON_TASKS.has(task) || (provider === "openai" && task === "atlas_plan");
  // Server owns the map_report schema; other JSON tasks may pass their own (validated shallowly).
  const responseSchema = task === "map_report" ? MAP_REPORT_SCHEMA
    : (wantJson && payload.schema && typeof payload.schema === "object" && schemaOk(payload.schema) ? payload.schema : undefined);
  const searchEnabled = (Deno.env.get("GEMINI_SEARCH_ENABLED") || "").toLowerCase() === "true";
  const model = Deno.env.get("AI_MODEL") ||
    (provider === "openai" ? OPENAI_DEFAULT_MODEL : provider === "gemini" ? "gemini-3.5-flash" : "claude-3-5-haiku-latest");   /* (#R151) OpenAI default = GPT-5.6 Terra (AI_MODEL secret = gpt-5.6-terra; re-verified reachable R150/R151). Luna stays the FALLBACK_MODEL only on 403/404 model_not_found so a model outage can never blanket-kill Atlas. */

  try {
    let out: { text: string; finishReason: string; webAttached?: boolean; webUsed?: boolean; webCount?: number; citations?: WebCitation[] };
    if (provider === "openai") {
      const key = Deno.env.get("OPENAI_API_KEY");
      if (!key) throw new ProviderError("provider_unavailable", "OPENAI_API_KEY not set", 502, false, {});
      // (#R114) webMode:"required" → force the hosted web search so a latest-info task really runs it.
      let effort = TASK_REASONING[task] || "low";   // (#R116) planner/analysis think at "medium"
      if (effortHint === "high" && (task === "atlas_plan" || task === "analysis" || task === "vision_read")) effort = "high";   // (#R117/#R156) complexity hint (vision reading small text + maths earns "high")
      try {
        out = await callOpenAI(model, key, prompt, system, imgs, web, maxTokens, wantJson, webMode === "required", effort, imageDetail);
      } catch (e) {
        // (#R115) Responses can come back EMPTY/incomplete when invisible reasoning tokens eat the whole
        // max_output_tokens budget. That is retryable and budget-dependent → retry ONCE with a bigger
        // budget (still capped) instead of surfacing "empty response" to the user.
        if (e instanceof ProviderError && e.code === "provider_empty" && e.retryable) {
          out = await callOpenAI(model, key, prompt, system, imgs, web, Math.min(HARD_MAX_OUTPUT, maxTokens + 1200), wantJson, webMode === "required", effort, imageDetail);
        } else {
          throw e;
        }
      }
    } else if (provider === "gemini") {
      const key = Deno.env.get("GEMINI_API_KEY");
      if (!key) throw new ProviderError("provider_unavailable", "GEMINI_API_KEY not set", 502, false, {});
      try {
        out = await callGeminiRetry(model, key, prompt, system, imgs, { maxTokens, web, searchEnabled, wantJson, responseSchema });
      } catch (e) {
        // (#R113) MALFORMED_FUNCTION_CALL → retry ONCE with tools stripped, a hardened
        // "do not call functions" system suffix, and JSON mode forced. No further retries.
        if (e instanceof ProviderError && e.code === "provider_malformed") {
          const hardened = (system ? system + "\n\n" : "") +
            "No web-search or function-calling tool is attached to this request. Do NOT call tools or functions. " +
            "The action/type names in the instructions are plain JSON string values, not callable functions. " +
            "Return the final answer directly" + (wantJson ? " as valid JSON." : ".");
          out = await callGemini(model, key, prompt, hardened, imgs, { maxTokens, web: false, searchEnabled: false, wantJson, responseSchema, noTools: true });
        } else if (e instanceof ProviderError && responseSchema && e.meta && e.meta.providerStatus === 400) {
          // (#R113) A 400 while a responseSchema was attached is most likely a schema-dialect rejection by this
          // model — retry ONCE without the schema. responseMimeType:"application/json" still forces valid JSON,
          // and the prompt + client-side validation enforce the shape, so map_report keeps working either way.
          out = await callGemini(model, key, prompt, system, imgs, { maxTokens, web, searchEnabled, wantJson, responseSchema: undefined });
        } else {
          throw e;
        }
      }
    } else {
      const key = Deno.env.get("ANTHROPIC_API_KEY");
      if (!key) throw new ProviderError("provider_unavailable", "ANTHROPIC_API_KEY not set", 502, false, {});
      out = await callAnthropic(model, key, prompt, system, imgs, web, maxTokens);
    }
    // 5) Success.
    return json({
      text: out.text, used, limit, remaining: Math.max(0, limit - used),
      /* (#R318) whether THIS call consumed a use. The UI shows the count honestly instead of
         letting the reader infer it from a number that sometimes moves and sometimes does not. */
      charged,
      // (#R114) webUsed = the search tool ACTUALLY ran this turn (not just attached); the client uses
      // it to keep "latest" features honest (never present a search-less answer as fresh intelligence).
      meta: { provider, model, task, webAttached: !!out.webAttached, webUsed: !!out.webUsed, webSearches: out.webCount || 0, finishReason: out.finishReason },
      // (#R131) Hosted web-search citation URLs (OpenAI url_citation annotations). The client shows
      // these as the primary, web-verified sources — separate from the client-gathered headlines.
      citations: Array.isArray(out.citations) ? out.citations : [],
    });
  } catch (e) {
    await refund();   // a failed provider call never costs the user a use (dev never consumed one)
    if (e instanceof ProviderError) {
      // Non-sensitive telemetry only (no prompt / key / JWT).
      try { console.error("ai-proxy provider fail", JSON.stringify({ provider, model, task, code: e.code, http: e.http, meta: e.meta })); } catch (_) { /* ignore */ }
      return json({ error: e.code, message: e.message, retryable: e.retryable, meta: { provider, model, task, ...e.meta } }, e.http);
    }
    /* ⚠ AN UNCLASSIFIED FAILURE IS STILL NOT A PLACE TO PUT AN EXCEPTION MESSAGE. Anything that
       reaches here came from code that has the prompt, the provider key and the caller's JWT in
       scope, so the message is a generic one and the detail stays in the log line above. */
    try { console.error("ai-proxy unclassified fail", JSON.stringify({ provider, model, task, name: String((e as Error)?.name || "") })); } catch (_) { /* ignore */ }
    return json({ error: "provider_unavailable", message: "The AI provider could not be reached.", retryable: false, meta: { provider, model, task } }, 502);
  }
 } catch (topErr) {
  // (#R113b) LAST-RESORT guard: any error not caught above (auth/parse/etc.) returns a clean, CLASSIFIED JSON error
  // instead of a bare 546 the client can't display. (A hard runtime resource-kill can't reach here — the per-fetch
  // timeouts above cover the slow/hung-call case that would otherwise hit the wall-clock limit.)
  try { console.error("ai-proxy UNCAUGHT", String((topErr as Error)?.name || ""), String((topErr as Error)?.message || topErr).slice(0, 300)); } catch (_) { /* ignore */ }
  return json({ error: "provider_unavailable", message: "The AI service hit an unexpected error — please try again.", retryable: true }, 500);
 }
});
