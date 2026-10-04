// ============================================================================
//  IntMap · ai-proxy  —  Supabase Edge Function (Deno)
// ----------------------------------------------------------------------------
//  Account-based, first-party AI. Replaces the old BYOK (bring-your-own-key)
//  client flow. Every AI feature in index.html (askAI -> aiCallServer) POSTs
//  here with the user's Supabase session JWT. This function:
//
//    1. Verifies the JWT and resolves the user  (login REQUIRED → 401 if not).
//    2. Looks up the user's plan + daily quota   (free = 10/day; easily tiered).
//       ⚠ THE NUMBER IS PLAN_LIMITS IN _shared/ai-ledger.js, NOT THIS LINE. It read «30/day» for the
//       whole of the time #R147 had already moved free to 10 — a header that restates a constant is
//       a second copy, and the copy is the one a reader meets first.
//    3. Atomically consumes one use for today    (consume_ai_turn RPC, which charges increment_ai_usage
//       once per turn — through _shared/ai-ledger.js, the one door every charge goes through).
//       → over quota returns 429 {error:"limit", used, limit}.
//    4. Calls the provider with a SERVER-HELD key (model fixed here — the user
//       never sees a key or a model picker).
//    5. Returns { text, used, limit, remaining, charged, meta } (+ `output` for a protocol-2 turn, atlas-native-tools). On a provider failure the
//       consumed slot is refunded so a failed call never costs the user a use.
//       (atlas-live-stream) An Atlas turn that asks with `stream: true` gets the SAME body as the
//       `done` event of a text/event-stream, preceded by previews of what the provider is producing
//       (think / text / call / search / reset — _shared/ai-stream.js). Steps 1–3 and every refusal
//       before the provider call are unchanged plain JSON; the ledger settles before `done` is sent.
//    6. (ai-one-ledger) Records what the provider answers COST — input / cached read / cache write /
//       output tokens, normalised by _shared/ai-usage.js — in the same ledger (record_ai_usage).
//
//  Deploy:   supabase functions deploy ai-proxy --project-ref vpekfwdpurzejrrmacac
//            (verify_jwt can stay ON; we also verify the user explicitly.)
//  Secrets:  supabase secrets set AI_PROVIDER=openai                  (openai | anthropic | gemini)
//            supabase secrets set AI_MODEL=gpt-5.6-terra             (#R736; OVERRIDES OPENAI_DEFAULT_MODEL below, so the two are set together. For EVERY reader — except the developer account, which may choose one for its own calls: #R722 below.)
//            supabase secrets set OPENAI_API_KEY=sk-...               (CURRENT provider — Terra via /v1/responses)
//            # other providers stay wired but dormant:
//            supabase secrets set GEMINI_API_KEY=AIza...              (if AI_PROVIDER=gemini)
//            supabase secrets set GEMINI_SEARCH_ENABLED=false         (#R113 Gemini grounding, default OFF)
//            supabase secrets set ANTHROPIC_API_KEY=sk-ant-...        (if AI_PROVIDER=anthropic)
//            supabase secrets set AI_PROXY_GLOBAL_PER_DAY=<n>         (optional — moves the project-wide ceiling, GLOBAL_PER_DAY below)
//            supabase secrets set AI_PROXY_NEWCOMER_PER_DAY=<n>       (optional — the share accounts under a week old draw from, NEWCOMER_SHARE below)
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
//  (atlas-core-split) THIS FILE ROUTES. The steps above are ask.ts; what each TASK decides is
//  tasks/<task>.ts, registered by one line in tasks/all.ts; the bounds and ceilings are config.ts;
//  protocol 2 is turn.ts; the providers are providers/{openai,anthropic,gemini}.ts behind the one
//  door in provider-call.ts; the developer's model catalogue is models.ts; the held answer of a
//  keyed request is replay.ts. Each was moved out of this file unchanged.
// ============================================================================

import { cors, json } from "./config.ts";
import { ask } from "./ask.ts";
/* Read by tests/edge-spend-and-models-checks and tests/ai-quota-fairness-checks, which evaluate this
   module (Deno.serve stubbed) — config.ts says what it is. */
export { SPEND } from "./config.ts";

/* ══ THE ROUTES — checked in order; the first whose `match` says yes answers ═════════════════════
   A request no route matches is the 405 it always was. To add one: one entry, APPENDED. Each
   `match` must be exclusive of the others (method, then path), so the order of the list decides
   nothing and two additions cannot collide on it. */
type Route = { name: string; match: (req: Request) => boolean; handle: (req: Request) => Response | Promise<Response> };
const ROUTES: Route[] = [
  { name: "preflight", match: (req) => req.method === "OPTIONS", handle: () => new Response("ok", { headers: cors }) },
  { name: "ask", match: (req) => req.method === "POST", handle: ask },
];

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
 try {
  const route = ROUTES.find((r) => r.match(req));
  if (!route) return json({ error: "method" }, 405);
  return await route.handle(req);
 } catch (topErr) {
  // (#R113b) LAST-RESORT guard: any error not caught above (auth/parse/etc.) returns a clean, CLASSIFIED JSON error
  // instead of a bare 546 the client can't display. (A hard runtime resource-kill can't reach here — the per-fetch
  // timeouts above cover the slow/hung-call case that would otherwise hit the wall-clock limit.)
  try { console.error("ai-proxy UNCAUGHT", String((topErr as Error)?.name || ""), String((topErr as Error)?.message || topErr).slice(0, 300)); } catch (_) { /* ignore */ }
  return json({ error: "provider_unavailable", message: "The AI service hit an unexpected error — please try again.", retryable: true }, 500);
 }
});
