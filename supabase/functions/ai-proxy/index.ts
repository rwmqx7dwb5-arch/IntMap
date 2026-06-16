// ============================================================================
//  IntMap · ai-proxy  —  Supabase Edge Function (Deno)
// ----------------------------------------------------------------------------
//  Account-based, first-party AI. Replaces the old BYOK (bring-your-own-key)
//  client flow. Every AI feature in index.html (askAI -> aiCallServer) POSTs
//  here with the user's Supabase session JWT. This function:
//
//    1. Verifies the JWT and resolves the user  (login REQUIRED → 401 if not).
//    2. Looks up the user's plan + daily quota   (free = 5/day; easily tiered).
//    3. Atomically consumes one use for today    (increment_ai_usage RPC).
//       → over quota returns 429 {error:"limit", used, limit}.
//    4. Calls the provider with a SERVER-HELD key (model fixed here — the user
//       never sees a key or a model picker).
//    5. Returns { text, used, limit, remaining }. On a provider failure the
//       consumed slot is refunded so a failed call never costs the user a use.
//
//  Deploy:   supabase functions deploy ai-proxy
//            (verify_jwt can stay ON; we also verify the user explicitly.)
//  Secrets:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...      (default provider)
//            # optional overrides:
//            supabase secrets set AI_MODEL=claude-3-5-haiku-latest
//            supabase secrets set AI_PROVIDER=anthropic              (anthropic | openai | gemini)
//            supabase secrets set OPENAI_API_KEY=sk-...              (if AI_PROVIDER=openai)
//            supabase secrets set GEMINI_API_KEY=AIza...             (if AI_PROVIDER=gemini; AI_MODEL default gemini-2.0-flash)
//  (SUPABASE_URL, SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY are injected.)
//
//  Run supabase_ai_usage.sql once to create the ai_usage table + RPCs + the
//  optional profiles.plan / profiles.login_count columns.
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
const PLAN_LIMITS: Record<string, number> = { free: 5, plus: 50, pro: 200, unlimited: 1_000_000 };
const DEFAULT_LIMIT = PLAN_LIMITS.free;

const MAX_PROMPT = 24_000;     // hard caps so a single call can't be abused
const MAX_IMAGES = 4;
const MAX_TOKENS = 1600;

interface ImgPart { mime: string; b64: string; }
function parseDataUrl(d: string): ImgPart | null {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(d || "");
  return m ? { mime: m[1], b64: m[2] } : null;
}

// ---------------------------------------------------------------------------
//  Provider calls (key lives only here, in the function's env).
// ---------------------------------------------------------------------------
async function callAnthropic(model: string, key: string, prompt: string, system: string, imgs: ImgPart[]): Promise<string> {
  const content: unknown[] = [];
  for (const ip of imgs) content.push({ type: "image", source: { type: "base64", media_type: ip.mime, data: ip.b64 } });
  content.push({ type: "text", text: prompt });
  const body: Record<string, unknown> = { model, max_tokens: MAX_TOKENS, messages: [{ role: "user", content }] };
  if (system) body.system = system;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("anthropic " + r.status + ": " + (await r.text().catch(() => "")).slice(0, 200));
  const j = await r.json();
  return (j.content && j.content.map((b: { text?: string }) => b.text || "").join("")) || "";
}

async function callOpenAI(model: string, key: string, prompt: string, system: string, imgs: ImgPart[]): Promise<string> {
  const userContent: unknown = imgs.length
    ? [{ type: "text", text: prompt }, ...imgs.map((ip) => ({ type: "image_url", image_url: { url: `data:${ip.mime};base64,${ip.b64}` } }))]
    : prompt;
  const messages: unknown[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: userContent });
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
    body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: MAX_TOKENS }),
  });
  if (!r.ok) throw new Error("openai " + r.status + ": " + (await r.text().catch(() => "")).slice(0, 200));
  const j = await r.json();
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
}

async function callGemini(model: string, key: string, prompt: string, system: string, imgs: ImgPart[]): Promise<string> {
  const parts: unknown[] = [{ text: prompt }];
  for (const ip of imgs) parts.push({ inline_data: { mime_type: ip.mime, data: ip.b64 } });
  const body: Record<string, unknown> = { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.3, maxOutputTokens: MAX_TOKENS } };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("gemini " + r.status + ": " + (await r.text().catch(() => "")).slice(0, 200));
  const j = await r.json();
  const c = j.candidates && j.candidates[0];
  if (c && c.finishReason === "SAFETY") throw new Error("gemini: blocked by safety filter");
  return (c && c.content && c.content.parts && c.content.parts.map((p: { text?: string }) => p.text || "").join("")) || "";
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
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
  // (#R31) Developer override → UNLIMITED AI, quota never consumed. Set the DEV_EMAILS and/or DEV_USER_IDS
  // secrets (comma-separated) to your own account so the developer has no AI limit ("AI機能の使用は無制限に").
  const devEmails = (Deno.env.get("DEV_EMAILS") || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
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

  // Parse the request body.
  let payload: { prompt?: string; system?: string; images?: string[] } = {};
  try { payload = await req.json(); } catch (_) { payload = {}; }
  const prompt = String(payload.prompt || "").slice(0, MAX_PROMPT);
  const system = String(payload.system || "").slice(0, MAX_PROMPT);
  const imgs = (Array.isArray(payload.images) ? payload.images : [])
    .map(parseDataUrl).filter((x): x is ImgPart => !!x).slice(0, MAX_IMAGES);
  if (!prompt && !imgs.length) {
    if (!isDev) try { await db.rpc("refund_ai_usage", { p_user: user.id }); } catch (_) { /* best-effort refund */ }
    return json({ error: "empty" }, 400);
  }

  // 4) Provider call with the server-held key.
  const provider = (Deno.env.get("AI_PROVIDER") || "anthropic").toLowerCase();
  try {
    let text = "";
    if (provider === "openai") {
      const key = Deno.env.get("OPENAI_API_KEY");
      if (!key) throw new Error("OPENAI_API_KEY not set");
      text = await callOpenAI(Deno.env.get("AI_MODEL") || "gpt-4o-mini", key, prompt, system, imgs);
    } else if (provider === "gemini") {
      const key = Deno.env.get("GEMINI_API_KEY");
      if (!key) throw new Error("GEMINI_API_KEY not set");
      text = await callGemini(Deno.env.get("AI_MODEL") || "gemini-2.0-flash", key, prompt, system, imgs);
    } else {
      const key = Deno.env.get("ANTHROPIC_API_KEY");
      if (!key) throw new Error("ANTHROPIC_API_KEY not set");
      text = await callAnthropic(Deno.env.get("AI_MODEL") || "claude-3-5-haiku-latest", key, prompt, system, imgs);
    }
    // 5) Success.
    return json({ text, used, limit, remaining: Math.max(0, limit - used) });
  } catch (e) {
    // Provider failed → refund the consumed slot so the user isn't charged a use (dev never consumed one).
    if (!isDev) try { await db.rpc("refund_ai_usage", { p_user: user.id }); } catch (_) { /* best-effort refund */ }
    return json({ error: "provider", message: String((e as Error)?.message || e) }, 502);
  }
});
