// ============================================================================
//  IntMap · ai-proxy · providers/anthropic — the Messages API, one-string and protocol 2
// ----------------------------------------------------------------------------
//  (atlas-core-split) Moved out of index.ts unchanged. The key lives only in the function's env and
//  is handed in by ask.ts.
// ============================================================================

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
export function anthropicWeb(j: any, attached: boolean): { webAttached: boolean; webUsed: boolean; webCount: number; webSources: number | null; webFailure?: string; citations: WebCitation[] } {
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
  /* (atlas-completion) …and what the searches RETURNED: a web_search_tool_result block holds the result
     list, or an error object (web_search_tool_result_error, with the provider's own error_code). The
     results are counted, the error code is the failure's reason — provider-call.ts webOutcome reads both. */
  const results = blocks.filter((b) => b && b.type === "web_search_tool_result");
  let listed: number | null = null;
  let webFailure = "";
  for (const b of results) {
    const c = b.content as unknown;
    if (Array.isArray(c)) listed = (listed || 0) + c.length;
    else if (c && typeof c === "object" && (c as Record<string, unknown>).error_code) webFailure = webFailure || String((c as Record<string, unknown>).error_code);
  }
  return { webAttached: attached, webUsed: webCount > 0, webCount, webSources: listed, ...(webFailure && listed === null ? { webFailure } : {}), citations };
}

/* (atlas-completion) Anthropic's stop_reason: end_turn, stop_sequence and tool_use are the ends the model
   chose; every other value (max_tokens, pause_turn, refusal, model_context_window_exceeded …) is the answer
   being stopped. The provider's documented natural ends are the list — a new stop reason is therefore
   reported as incomplete, never silently as finished. An absent stop_reason was not observed and claims nothing. */
const ANTHROPIC_NATURAL_END = new Set(["end_turn", "stop_sequence", "tool_use"]);
export function anthropicIncomplete(stopReason: string): string | null {
  return stopReason && !ANTHROPIC_NATURAL_END.has(stopReason) ? stopReason : null;
}

export async function callAnthropic(model: string, key: string, prompt: string, system: string, imgs: ImgPart[], files: FilePart[], docs: DocPart[], web: boolean, maxTokens: number, meter?: Meter): Promise<{ text: string; finishReason: string; incompleteReason: string | null; served?: string; webAttached: boolean; webUsed: boolean; webCount: number; webSources: number | null; webFailure?: string; citations: WebCitation[] }> {
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
  /* Anthropic has a NATIVE web-search tool; unlike Gemini it is safe to attach on demand.
     (atlas-mainloop-reliability) NO `max_uses`: it was a fixed 3 per request — a limit of ours on how much Atlas may search, which
     the project does not set anywhere else (the spending fences are the bound). */
  if (web) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  /* (ai-one-ledger) the system prompt (and the web tool) end in a cache breakpoint — _shared/ai-usage.js */
  const r = await providerCall("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(withPromptCache(body)),
  }, undefined, meter);
  if (!r.ok) {
    const t = (await r.text().catch(() => "")).slice(0, 400);
    throw classifyGemini(r.status, t, "", "");   // same status→code mapping applies to Anthropic
  }
  const j = await r.json();
  meter?.add("anthropic", j);
  const text = (j.content && j.content.map((b: { text?: string }) => b.text || "").join("")) || "";
  const finishReason = String(j?.stop_reason || "");
  if (!text) throw new ProviderError("provider_empty", "Empty response from Anthropic.", 502, true, { finishReason });
  return { text, finishReason, incompleteReason: anthropicIncomplete(finishReason), served: String(j?.model || ""), ...anthropicWeb(j, web) };
}

/* ══ (atlas-native-tools) THE TURN, IN ANTHROPIC'S NATIVE SHAPE — tool_use / tool_result ══════════════════════
   Converted rather than flattened into one string: a dormant provider that answers through the
   envelope would lose exactly what this round gives the active one (the calls and their results as
   separate, un-cut items), and switching AI_PROVIDER must not be a step down. The Messages API
   alternates roles and opens with the user, so consecutive same-role items are merged and a
   conversation that opens mid-way is said to. No JSON mode here (the instruction states the final
   shape, and the client reads a prose final as the answer — as it always did on this provider). */
export async function callAnthropicTurn(model: string, key: string, turn: TurnReq, system: string, imgs: ImgPart[], files: FilePart[], docs: DocPart[], web: boolean, maxTokens: number, meter?: Meter, sink?: StreamSink): Promise<{ text: string; finishReason: string; incompleteReason: string | null; served?: string; output: TurnItem[]; webAttached: boolean; webUsed: boolean; webCount: number; webSources: number | null; webFailure?: string; citations: WebCitation[] }> {
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
    if (it.type === "provider_block") { if (it.provider === "anthropic") add("assistant", it.block); continue; }   /* (atlas-mainloop-reliability) what the search left in the last reply, replayed as the provider wrote it */
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
  if (web) tools.push({ type: "web_search_20250305", name: "web_search" });
  const body: Record<string, unknown> = { model, max_tokens: maxTokens, messages: msgs };
  if (system) body.system = system;
  if (tools.length) body.tools = tools;
  if (turn.toolChoice === "none" && turn.tools.length) body.tool_choice = { type: "none" };
  /* (ai-one-ledger) THE FIXED PREFIX IS CACHED. The functions and the instructions are the same on every
     call of one turn (however many it makes) and, for the same page, on every turn; Anthropic
     re-bills that prefix in full unless the request marks it (no cache_control was sent before this).
     Breakpoints at the end of the tools and of the system prompt — _shared/ai-usage.js withPromptCache
     says why these two and why this changes nothing the model reads. */
  /* (atlas-live-stream) asked to stream when the page is watching; folded back into this same `j` below */
  /* (atlas-mainloop-reliability) ⚠ A reply that stops with stop_reason "pause_turn" is the hosted search being paused mid-way: the
     documented way on is to send the same conversation back with that reply appended. It used to be returned as an answer that
     ended there (reported incomplete, nothing continued it). The loop ends when the provider says it is done; what bounds it is
     the request's own time window and the spending ceilings every request here goes through, not a number of ours. */
  // deno-lint-ignore no-explicit-any
  const blocks: any[] = [];
  // deno-lint-ignore no-explicit-any
  let j: any = null;
  for (;;) {
    /* (atlas-live-stream) asked to stream when the page is watching; folded back into this same `j` below */
    const ps = sink ? providerStream("anthropic", sink) : null;
    if (ps) body.stream = true;
    const r = await providerCall("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(withPromptCache(body, { messages: true })),
    }, undefined, meter, ps ? ps.onChunk : undefined);
    if (!r.ok) throw classifyGemini(r.status, (await r.text().catch(() => "")).slice(0, 400), "", "");
    // deno-lint-ignore no-explicit-any
    const jj: any = ps ? streamedBody(ps, "anthropic", meter) : await r.json();
    meter?.add("anthropic", jj);
    j = jj;
    const got = Array.isArray(jj?.content) ? jj.content : [];
    blocks.push(...got);
    if (jj?.stop_reason !== "pause_turn" || !got.length) break;
    (body.messages as unknown[]).push({ role: "assistant", content: got });
  }
  if (blocks.length) j = { ...j, content: blocks };
  const output: TurnItem[] = [];
  let text = "";
  for (const b of (Array.isArray(j?.content) ? j.content : [])) {
    if (b?.type === "text" && typeof b.text === "string") { text += b.text; output.push({ type: "message", role: "assistant", content: b.text }); }
    else if (b?.type === "tool_use" && typeof b.name === "string") output.push({ type: "function_call", call_id: String(b.id || ""), name: b.name, arguments: JSON.stringify(b.input || {}) });
    /* (atlas-mainloop-reliability) the search itself: kept as the provider's own blocks, so the next call still has what it found (it was dropped, and every later step had to search again) */
    else if (b?.type === "server_tool_use" || b?.type === "web_search_tool_result") output.push({ type: "provider_block", provider: "anthropic", block: b });
  }
  const finishReason = String(j?.stop_reason || "");
  if (!text && !output.some((it) => it.type === "function_call")) throw new ProviderError("provider_empty", "Empty response from Anthropic.", 502, true, { finishReason });
  return { text, finishReason, incompleteReason: anthropicIncomplete(finishReason), served: String(j?.model || ""), output, ...anthropicWeb(j, web) };
}
