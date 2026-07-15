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
//    5. Returns { text, used, limit, remaining, meta }. On a provider failure the
//       consumed slot is refunded so a failed call never costs the user a use.
//
//  Deploy:   supabase functions deploy ai-proxy
//            (verify_jwt can stay ON; we also verify the user explicitly.)
//  Secrets:  supabase secrets set GEMINI_API_KEY=AIza...              (AI_PROVIDER=gemini)
//            supabase secrets set AI_PROVIDER=gemini                  (anthropic | openai | gemini)
//            supabase secrets set AI_MODEL=gemini-3.5-flash
//            # optional:
//            supabase secrets set GEMINI_SEARCH_ENABLED=false         (#R113 default OFF — see below)
//            supabase secrets set ANTHROPIC_API_KEY=sk-ant-...        (if AI_PROVIDER=anthropic)
//            supabase secrets set OPENAI_API_KEY=sk-...               (if AI_PROVIDER=openai)
//  (SUPABASE_URL, SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY are injected.)
//
// ----------------------------------------------------------------------------
//  (#R113) Gemini 3.5 Flash / thinkingLevel:"low" migration — RESPONSIBILITY SPLIT.
//  The old lightweight model hid design gaps by hallucinating; Gemini Low stops
//  instead of inventing, so the gaps surfaced as MALFORMED_FUNCTION_CALL / empty
//  responses. This function now:
//    • Reads a TASK type from the client (atlas_plan | map_report | analysis |
//      free_text | json_extract | brief) and configures per-task output budget,
//      JSON mode and web policy — instead of one MAX_TOKENS / one web flag for all.
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
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ---- Plan → daily free-use limit. Extend here for future paid tiers. --------
const PLAN_LIMITS: Record<string, number> = { free: 30, plus: 50, pro: 200, unlimited: 1_000_000 };   /* (#R101) free 10→30/day */
const DEFAULT_LIMIT = PLAN_LIMITS.free;

const MAX_PROMPT = 24_000;     // hard caps so a single call can't be abused
const MAX_IMAGES = 4;

// (#R113) Per-TASK output budgets (replaces the single MAX_TOKENS = 1600). A 20-item
// map_report can't fit in 1600 tokens; a quick json_extract shouldn't be allowed 3000.
// Kept modest for cost; map_report additionally scales with the requested item count.
const TASK_MAX_OUTPUT: Record<string, number> = {
  atlas_plan: 1800,
  map_report: 3200,
  analysis: 2400,
  free_text: 1800,
  json_extract: 1200,
  brief: 1800,
};
const FALLBACK_MAX_OUTPUT = 1800;
const HARD_MAX_OUTPUT = 5000;   // absolute ceiling (cost guard)

// (#R113) Which tasks want JSON output (structured-output / responseMimeType json).
// (#R113c) atlas_plan is INTENTIONALLY excluded: forcing responseMimeType on the very large planner prompt added
// latency (feeding the 45s timeouts) and the planner worked fine before with prompt-only JSON (aiParseJSON on the
// client strips any fence). map_report / json_extract keep structured output where it matters most.
const JSON_TASKS = new Set(["map_report", "json_extract"]);

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
function parseDataUrl(d: string): ImgPart | null {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(d || "");
  return m ? { mime: m[1], b64: m[2] } : null;
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
    throw new ProviderError("provider_unavailable", aborted ? "The AI provider timed out." : ("Network error contacting the AI provider: " + String((e as Error)?.message || e)), 503, true, { timeout: aborted });
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

async function callOpenAI(model: string, key: string, prompt: string, system: string, imgs: ImgPart[], maxTokens: number, wantJson: boolean): Promise<{ text: string; finishReason: string }> {
  const userContent: unknown = imgs.length
    ? [{ type: "text", text: prompt }, ...imgs.map((ip) => ({ type: "image_url", image_url: { url: `data:${ip.mime};base64,${ip.b64}` } }))]
    : prompt;
  const messages: unknown[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: userContent });
  const reqBody: Record<string, unknown> = { model, messages, temperature: 0.3, max_tokens: maxTokens };
  if (wantJson) reqBody.response_format = { type: "json_object" };
  const r = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
    body: JSON.stringify(reqBody),
  });
  if (!r.ok) {
    const t = (await r.text().catch(() => "")).slice(0, 400);
    throw classifyGemini(r.status, t, "", "");
  }
  const j = await r.json();
  const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
  const finishReason = String(j?.choices?.[0]?.finish_reason || "");
  if (!text) throw new ProviderError("provider_empty", "Empty response from OpenAI.", 502, true, { finishReason });
  return { text, finishReason };
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
  // (#R31/#R32) Developer override → UNLIMITED AI, quota never consumed ("AI機能の使用は無制限に").
  const DEFAULT_DEV_EMAILS = ["2ppzc4kk6r@privaterelay.appleid.com"];
  const devEmails = [...DEFAULT_DEV_EMAILS, ...(Deno.env.get("DEV_EMAILS") || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean)];
  const devIds = (Deno.env.get("DEV_USER_IDS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const isDev = (user.email && devEmails.includes(user.email.toLowerCase())) || devIds.includes(user.id);
  if (isDev) plan = "unlimited";
  const limit = PLAN_LIMITS[plan] ?? DEFAULT_LIMIT;

  // 3) Atomically consume one use for today (the developer is exempt — no consumption).
  let used = 0;
  if (!isDev) try {
    const { data: dec, error } = await db.rpc("increment_ai_usage", { p_user: user.id, p_limit: limit });
    if (error) throw error;
    const row = Array.isArray(dec) ? dec[0] : dec;
    used = row?.used ?? 0;
    if (!row?.allowed) return json({ error: "limit", used, limit }, 429);
  } catch (e) {
    return json({ error: "quota_unavailable", message: String((e as Error)?.message || e) }, 500);
  }
  const refund = async () => { if (!isDev) try { await db.rpc("refund_ai_usage", { p_user: user.id }); } catch (_) { /* best-effort */ } };

  // Parse the request body.
  // (#R113) `task` + `webMode` let the proxy configure output budget, JSON mode and
  // web policy per feature — instead of one MAX_TOKENS / one boolean for everything.
  let payload: {
    prompt?: string; system?: string; images?: string[]; lang?: string;
    web?: boolean; webMode?: string; task?: string; requestedCount?: number; schema?: unknown;
  } = {};
  try { payload = await req.json(); } catch (_) { payload = {}; }

  const task = String(payload.task || "free_text").toLowerCase();
  const webMode = String(payload.webMode || (payload.web === true ? "auto" : "off")).toLowerCase();
  const web = webMode === "auto" || webMode === "required";
  const requestedCount = typeof payload.requestedCount === "number" ? payload.requestedCount : undefined;
  const prompt = String(payload.prompt || "").slice(0, MAX_PROMPT);
  const system = String(payload.system || "").slice(0, MAX_PROMPT);
  const imgs = (Array.isArray(payload.images) ? payload.images : [])
    .map(parseDataUrl).filter((x): x is ImgPart => !!x).slice(0, MAX_IMAGES);
  if (!prompt && !imgs.length) {
    await refund();
    return json({ error: "empty" }, 400);
  }

  const maxTokens = maxOutputFor(task, requestedCount);
  const wantJson = JSON_TASKS.has(task);
  // Server owns the map_report schema; other JSON tasks may pass their own (validated shallowly).
  const responseSchema = task === "map_report" ? MAP_REPORT_SCHEMA
    : (wantJson && payload.schema && typeof payload.schema === "object" ? payload.schema : undefined);
  const searchEnabled = (Deno.env.get("GEMINI_SEARCH_ENABLED") || "").toLowerCase() === "true";

  // 4) Provider call with the server-held key.
  const provider = (Deno.env.get("AI_PROVIDER") || "anthropic").toLowerCase();
  const model = Deno.env.get("AI_MODEL") ||
    (provider === "openai" ? "gpt-4o-mini" : provider === "gemini" ? "gemini-3.5-flash" : "claude-3-5-haiku-latest");

  try {
    let out: { text: string; finishReason: string; webAttached?: boolean };
    if (provider === "openai") {
      const key = Deno.env.get("OPENAI_API_KEY");
      if (!key) throw new ProviderError("provider_unavailable", "OPENAI_API_KEY not set", 502, false, {});
      out = await callOpenAI(model, key, prompt, system, imgs, maxTokens, wantJson);
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
      meta: { provider, model, task, webAttached: !!out.webAttached, finishReason: out.finishReason },
    });
  } catch (e) {
    await refund();   // a failed provider call never costs the user a use (dev never consumed one)
    if (e instanceof ProviderError) {
      // Non-sensitive telemetry only (no prompt / key / JWT).
      try { console.error("ai-proxy provider fail", JSON.stringify({ provider, model, task, code: e.code, http: e.http, meta: e.meta })); } catch (_) { /* ignore */ }
      return json({ error: e.code, message: e.message, retryable: e.retryable, meta: { provider, model, task, ...e.meta } }, e.http);
    }
    return json({ error: "provider_unavailable", message: String((e as Error)?.message || e), retryable: false, meta: { provider, model, task } }, 502);
  }
 } catch (topErr) {
  // (#R113b) LAST-RESORT guard: any error not caught above (auth/parse/etc.) returns a clean, CLASSIFIED JSON error
  // instead of a bare 546 the client can't display. (A hard runtime resource-kill can't reach here — the per-fetch
  // timeouts above cover the slow/hung-call case that would otherwise hit the wall-clock limit.)
  try { console.error("ai-proxy UNCAUGHT", String((topErr as Error)?.name || ""), String((topErr as Error)?.message || topErr).slice(0, 300)); } catch (_) { /* ignore */ }
  return json({ error: "provider_unavailable", message: "The AI service hit an unexpected error — please try again.", retryable: true }, 500);
 }
});
