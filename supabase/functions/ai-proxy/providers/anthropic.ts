// ============================================================================
//  IntMap · ai-proxy · providers/anthropic — the Messages API, one-string and protocol 2
// ----------------------------------------------------------------------------
//  (atlas-core-split) Moved out of index.ts unchanged. The key lives only in the function's env and
//  is handed in by ask.ts.
// ============================================================================

import { PROVIDER_TIMEOUT_MS } from "../../_shared/ai-provider.js";
import { providerStream } from "../../_shared/ai-stream.js";
import { withPromptCache } from "../../_shared/ai-usage.js";
import { providerCall, ProviderError, classifyGemini, streamedBody } from "../provider-call.ts";
import type { Meter, StreamSink } from "../provider-call.ts";
import { filesBlock } from "../media.ts";
import type { ImgPart, FilePart, DocPart, WebCitation } from "../media.ts";
import { fnParameters, placeAttachments } from "../turn.ts";
import type { TurnReq, TurnItem } from "../turn.ts";

// ---------------------------------------------------------------------------
//  Provider calls (key lives only here, in the function's env).
// ---------------------------------------------------------------------------
/* == (#R722) "WHICH MODEL ANSWERED" IS THE PROVIDER'S ANSWER, NOT OUR REQUEST ==================
   meta.model was the id we SENT. That is the right thing to report only while nothing can change it
   between the request and the reply — and two things can: a developer's pick, and the fallback
   chain, which has been quietly answering for every reader since #R150 (AI_MODEL named a model that
   was 403ing, and nothing on screen ever said so). A field that says "sol" because we asked for sol
   cannot detect the case it exists to detect. All three providers echo the model that ran; that is
   what `served` carries, and meta reports both. */
/* ══ (edge-spend-and-models) WHAT ANTHROPIC'S HOSTED SEARCH ACTUALLY DID ═══════════════════════════
   Both Anthropic paths attach web_search_20250305 when the caller asks for the web — and neither
   said whether it ran. The OpenAI path has returned webAttached / webUsed / webSearches since #R114,
   and the page reads webUsed as «a page the reader never saw was in front of the model»
   (js/atlas-agent.js → turn.externalContentSeen, which decides whether an action needs the reader's
   confirmation). Switching AI_PROVIDER to anthropic therefore silently turned that mark off: a turn
   that had read the web looked like one that had not.
   The same facts, read from Anthropic's answer (Messages API, server tools):
     · a `server_tool_use` block named web_search is one search the model issued (OpenAI's
       `web_search_call` item), and usage.server_tool_use.web_search_requests is the provider's own
       count of them — the larger of the two is taken, so neither a missing block nor a missing usage
       field can make a search disappear;
     · a text block's `citations` of type web_search_result_location are the pages it cited
       (OpenAI's url_citation annotations), deduplicated on the address as that path does. */
// deno-lint-ignore no-explicit-any
export function anthropicWeb(j: any, attached: boolean): { webAttached: boolean; webUsed: boolean; webCount: number; citations: WebCitation[] } {
  const blocks: Array<Record<string, unknown>> = Array.isArray(j?.content) ? j.content : [];
  const issued = blocks.filter((b) => b && b.type === "server_tool_use" && b.name === "web_search").length;
  const reported = Number(j?.usage?.server_tool_use?.web_search_requests);
  const webCount = Math.max(issued, Number.isFinite(reported) ? reported : 0);
  const citations: WebCitation[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    if (!b || b.type !== "text" || !Array.isArray(b.citations)) continue;
    for (const c of b.citations as Array<Record<string, unknown>>) {
      if (!c || c.type !== "web_search_result_location" || typeof c.url !== "string" || !c.url) continue;
      const k = c.url.replace(/[#?].*$/, "");
      if (seen.has(k)) continue;
      seen.add(k);
      citations.push({ url: c.url, title: String(c.title || "") });
    }
  }
  return { webAttached: attached, webUsed: webCount > 0, webCount, citations };
}

export async function callAnthropic(model: string, key: string, prompt: string, system: string, imgs: ImgPart[], files: FilePart[], docs: DocPart[], web: boolean, maxTokens: number, meter?: Meter): Promise<{ text: string; finishReason: string; served?: string; webAttached: boolean; webUsed: boolean; webCount: number; citations: WebCitation[] }> {
  const content: unknown[] = [];
  for (const ip of imgs) content.push({ type: "image", source: { type: "base64", media_type: ip.mime, data: ip.b64 } });
  /* (#R540) documents → attached text → the user's prompt. The question is asked ABOUT material the
     model has already been handed, so the material comes first. */
  for (const dp of docs) content.push({ type: "document", source: { type: "base64", media_type: dp.mime, data: dp.b64 } });
  const attached = filesBlock(files);
  if (attached) content.push({ type: "text", text: attached });
  content.push({ type: "text", text: prompt });
  const body: Record<string, unknown> = { model, max_tokens: maxTokens, messages: [{ role: "user", content }] };
  if (system) body.system = system;
  // Anthropic has a NATIVE web-search tool; unlike Gemini it is safe to attach on demand.
  if (web) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }];
  /* (ai-one-ledger) the system prompt (and the web tool) end in a cache breakpoint — _shared/ai-usage.js */
  const r = await providerCall("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(withPromptCache(body)),
  }, PROVIDER_TIMEOUT_MS, meter);
  if (!r.ok) {
    const t = (await r.text().catch(() => "")).slice(0, 400);
    throw classifyGemini(r.status, t, "", "");   // same status→code mapping applies to Anthropic
  }
  const j = await r.json();
  meter?.add("anthropic", j);
  const text = (j.content && j.content.map((b: { text?: string }) => b.text || "").join("")) || "";
  const finishReason = String(j?.stop_reason || "");
  if (!text) throw new ProviderError("provider_empty", "Empty response from Anthropic.", 502, true, { finishReason });
  return { text, finishReason, served: String(j?.model || ""), ...anthropicWeb(j, web) };
}

/* ══ (atlas-native-tools) THE TURN, IN ANTHROPIC'S NATIVE SHAPE — tool_use / tool_result ══════════════════════
   Converted rather than flattened into one string: a dormant provider that answers through the
   envelope would lose exactly what this round gives the active one (the calls and their results as
   separate, un-cut items), and switching AI_PROVIDER must not be a step down. The Messages API
   alternates roles and opens with the user, so consecutive same-role items are merged and a
   conversation that opens mid-way is said to. No JSON mode here (the instruction states the final
   shape, and the client reads a prose final as the answer — as it always did on this provider). */
export async function callAnthropicTurn(model: string, key: string, turn: TurnReq, system: string, imgs: ImgPart[], files: FilePart[], docs: DocPart[], web: boolean, maxTokens: number, meter?: Meter, sink?: StreamSink): Promise<{ text: string; finishReason: string; served?: string; output: TurnItem[]; webAttached: boolean; webUsed: boolean; webCount: number; citations: WebCitation[] }> {
  const attached = filesBlock(files);
  const msgs: { role: string; content: unknown[] }[] = [];
  const add = (role: string, block: unknown) => {
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content.push(block); else msgs.push({ role, content: [block] });
  };
  for (const it of placeAttachments<unknown>(turn.items, (ch) => {
    const parts: unknown[] = [];
    if (ch.includes("docs")) for (const dp of docs) parts.push({ type: "document", source: { type: "base64", media_type: dp.mime, data: dp.b64 } });
    if (ch.includes("files") && attached) parts.push({ type: "text", text: attached });
    if (ch.includes("images")) for (const ip of imgs) parts.push({ type: "image", source: { type: "base64", media_type: ip.mime, data: ip.b64 } });
    return parts;
  })) {
    if ("attach" in it) { it.attach.forEach((p) => add("user", p)); continue; }
    if (it.type === "message") add(it.role === "assistant" ? "assistant" : "user", { type: "text", text: it.content });
    else if (it.type === "function_call") {
      let input: unknown = {};
      try { input = JSON.parse(it.arguments || "{}"); } catch (_) { input = {}; }
      add("assistant", { type: "tool_use", id: it.call_id.replace(/[^A-Za-z0-9_-]/g, "_"), name: it.name, input: (input && typeof input === "object") ? input : {} });
    } else if (it.type === "function_call_output") add("user", { type: "tool_result", tool_use_id: it.call_id.replace(/[^A-Za-z0-9_-]/g, "_"), content: it.output });
  }
  if (msgs.length && msgs[0].role !== "user") msgs.unshift({ role: "user", content: [{ type: "text", text: "[The conversation so far begins with your reply below.]" }] });
  const tools: Record<string, unknown>[] = turn.tools.map((t) => { const f = fnParameters(t); return { name: t.name, description: f.description, input_schema: f.parameters }; });
  /* (atlas-turn-engine) a breakpoint at the end of the FIXED functions too, when this turn promoted some after
     them (js/atlas-agent.js): the promoted ones move the last-tool breakpoint withPromptCache adds, and this
     one keeps the unchanged prefix a hit. At most three breakpoints in all — under Anthropic's four. */
  const lastFixed = turn.tools.map((t) => !t.promoted).lastIndexOf(true);
  if (lastFixed >= 0 && lastFixed < tools.length - 1) tools[lastFixed] = { ...tools[lastFixed], cache_control: { type: "ephemeral" } };
  if (web) tools.push({ type: "web_search_20250305", name: "web_search", max_uses: 3 });
  const body: Record<string, unknown> = { model, max_tokens: maxTokens, messages: msgs };
  if (system) body.system = system;
  if (tools.length) body.tools = tools;
  if (turn.toolChoice === "none" && turn.tools.length) body.tool_choice = { type: "none" };
  /* (ai-one-ledger) THE FIXED PREFIX IS CACHED. The functions and the instructions are the same on every
     call of one turn (up to TURN_MAX_CALLS of them) and, for the same page, on every turn; Anthropic
     re-bills that prefix in full unless the request marks it (no cache_control was sent before this).
     Breakpoints at the end of the tools and of the system prompt — _shared/ai-usage.js withPromptCache
     says why these two and why this changes nothing the model reads. */
  /* (atlas-live-stream) asked to stream when the page is watching; folded back into this same `j` below */
  const ps = sink ? providerStream("anthropic", sink) : null;
  if (ps) body.stream = true;
  const r = await providerCall("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(withPromptCache(body)),
  }, PROVIDER_TIMEOUT_MS, meter, ps ? ps.onChunk : undefined);
  if (!r.ok) throw classifyGemini(r.status, (await r.text().catch(() => "")).slice(0, 400), "", "");
  // deno-lint-ignore no-explicit-any
  const j: any = ps ? streamedBody(ps, "anthropic", meter) : await r.json();
  meter?.add("anthropic", j);
  const output: TurnItem[] = [];
  let text = "";
  for (const b of (Array.isArray(j?.content) ? j.content : [])) {
    if (b?.type === "text" && typeof b.text === "string") { text += b.text; output.push({ type: "message", role: "assistant", content: b.text }); }
    else if (b?.type === "tool_use" && typeof b.name === "string") output.push({ type: "function_call", call_id: String(b.id || ""), name: b.name, arguments: JSON.stringify(b.input || {}) });
  }
  const finishReason = String(j?.stop_reason || "");
  if (!text && !output.some((it) => it.type === "function_call")) throw new ProviderError("provider_empty", "Empty response from Anthropic.", 502, true, { finishReason });
  return { text, finishReason, served: String(j?.model || ""), output, ...anthropicWeb(j, web) };
}
