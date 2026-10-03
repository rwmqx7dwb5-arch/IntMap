// ============================================================================
//  IntMap · ai-proxy · models — the catalogue the developer's model picker offers
// ----------------------------------------------------------------------------
//  (atlas-core-split) Moved out of index.ts unchanged. Answered by ask.ts for `op: "models"`.
// ============================================================================

import { MODEL_ID_OK, WITHDRAWN_MODELS } from "./config.ts";
import { providerCall } from "./provider-call.ts";

/* == (#R722) THE MODEL CATALOGUE - ASKED, NOT WRITTEN DOWN ====================================
   The developer account may choose which model answers its own calls, so something has to say what
   there is to choose from. That something is each provider's own catalogue endpoint, once per call,
   never a list in this file: a list here would be a photograph of the day it was typed (#R707), and
   the thing it would fail to show is exactly the new model the developer opened the panel to pick.

   /!\ WHAT THE CATALOGUE DOES AND DOES NOT ANSWER, measured on this project 2026-09-15:
     · Gemini's ListModels states supportedGenerationMethods, so "can this model answer a prompt" is
       a FACT the upstream publishes, and this code reads it instead of guessing from the name.
     · OpenAI's /v1/models publishes no capability field at all, and - measured - it lists models the
       PROJECT cannot call: gpt-5.6-sol and gpt-5.6-terra were both listed while both answered 403
       "does not have access to model". So the list is shown as the list it is, and a pick the
       project cannot reach comes back as the provider's own 403 (see noFallbackForPick at the call
       site) - an error the developer can read, rather than a silent substitution.
   A provider whose key is unset is reported unavailable rather than guessed at.
   (edge-spend-and-models) A listing carries the key, so it goes through the same door as a call and
   takes one unit of the project ceiling — three per catalogue, developer only. */
export async function listModels(): Promise<{ provider: string; models: string[]; available: boolean; note?: string }[]> {
  const out: { provider: string; models: string[]; available: boolean; note?: string }[] = [];
  const keep = (id: string) => MODEL_ID_OK.test(id) && !WITHDRAWN_MODELS.has(id);
  const oa = Deno.env.get("OPENAI_API_KEY");
  if (!oa) out.push({ provider: "openai", models: [], available: false, note: "no key" });
  else {
    try {
      const r = await providerCall("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${oa}` } }, 15_000);
      const j = await r.json();
      const ids = (Array.isArray(j?.data) ? j.data : []).map((m: { id?: string }) => String(m?.id || "")).filter(keep);
      out.push({ provider: "openai", models: ids.sort(), available: r.ok, note: r.ok ? undefined : "list " + r.status });
    } catch (_) { out.push({ provider: "openai", models: [], available: false, note: "unreachable" }); }
  }
  const gk = Deno.env.get("GEMINI_API_KEY");
  if (!gk) out.push({ provider: "gemini", models: [], available: false, note: "no key" });
  else {
    try {
      /* (#R801) The key travels in the header the generateContent call already uses, not in the
         query string, where upstream access logs and any intermediary would keep it. */
      const r = await providerCall("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": gk } }, 15_000);
      const j = await r.json();
      const ids = (Array.isArray(j?.models) ? j.models : [])
        .filter((m: { supportedGenerationMethods?: string[] }) => (m?.supportedGenerationMethods || []).includes("generateContent"))
        .map((m: { name?: string }) => String(m?.name || "").replace(/^models\//, ""))
        .filter(keep);
      out.push({ provider: "gemini", models: ids.sort(), available: r.ok, note: r.ok ? undefined : "list " + r.status });
    } catch (_) { out.push({ provider: "gemini", models: [], available: false, note: "unreachable" }); }
  }
  const ak = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ak) out.push({ provider: "anthropic", models: [], available: false, note: "no key" });
  else {
    try {
      const r = await providerCall("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": ak, "anthropic-version": "2023-06-01" } }, 15_000);
      const j = await r.json();
      const ids = (Array.isArray(j?.data) ? j.data : []).map((m: { id?: string }) => String(m?.id || "")).filter(keep);
      out.push({ provider: "anthropic", models: ids.sort(), available: r.ok, note: r.ok ? undefined : "list " + r.status });
    } catch (_) { out.push({ provider: "anthropic", models: [], available: false, note: "unreachable" }); }
  }
  return out;
}
