// ============================================================================
//  IntMap · ai-proxy · providers/openai — the Responses API, its 400 ladder and the fallback chain
// ----------------------------------------------------------------------------
//  (atlas-core-split) Moved out of index.ts unchanged. `summaryRefused` moved with it: it is this
//  provider's own isolate-lived memory, and only callOpenAI reads or writes it.
// ============================================================================

import { PROVIDER_TIMEOUT_MS, FALLBACK_CHAIN } from "../../_shared/ai-provider.js";
import { providerStream } from "../../_shared/ai-stream.js";
import type { Streamed } from "../provider-call.ts";
import { providerCall, ProviderError, classifyGemini, streamedBody } from "../provider-call.ts";
import type { Meter, StreamSink } from "../provider-call.ts";
import { filesBlock } from "../media.ts";
import type { ImgPart, FilePart, DocPart, WebCitation } from "../media.ts";
import { fnParameters, placeAttachments } from "../turn.ts";
import type { TurnReq, TurnItem } from "../turn.ts";

/* OpenAI refused a reasoning summary on this isolate (see callOpenAI `summary`). OBSERVED: not yet —
   whether this project is entitled to summaries is unknown until a stream asks. EXPIRES WITH THE
   ISOLATE, so an entitlement granted later is picked up without a deploy. */
let summaryRefused = false;

export async function callOpenAI(model: string, key: string, prompt: string, system: string, imgs: ImgPart[], files: FilePart[], docs: DocPart[], web: boolean, maxTokens: number, wantJson: boolean, forceWeb: boolean, effort: string, imageDetail = "auto", noFallback = false, schemaFormat: Record<string, unknown> | null = null, turn: TurnReq | null = null, cacheKey = "", meter?: Meter, sink?: StreamSink): Promise<{ text: string; finishReason: string; webAttached: boolean; webUsed: boolean; webCount: number; citations: WebCitation[]; schemaAttached: boolean; served?: string; output?: TurnItem[] }> {
  // GPT-5.6 models (gpt-5.6-luna) work best through the Responses API. `max_output_tokens`
  // includes invisible reasoning tokens, so leave a reasoning allowance above IntMap's
  // visible-output budget — bigger when effort is "medium" (#R116) — under a hard ceiling.
  // (#R156) input_image `detail`: "high" tiles the image so the model reads SMALL text / fraction bars /
  // subscripts (the vision_read OCR/maths win); "auto" (default) is unchanged for every other caller.
  /* (#R540) documents → attached text → the user's prompt (same order as the other two providers);
     the images keep their place after the prompt, where they have always been. */
  const content: unknown[] = [];
  for (const dp of docs) content.push({ type: "input_file", filename: dp.name, file_data: "data:" + dp.mime + ";base64," + dp.b64 });
  const attached = filesBlock(files);
  if (attached) content.push({ type: "input_text", text: attached });
  content.push({ type: "input_text", text: prompt });
  const _detail = (imageDetail === "high" || imageDetail === "low") ? imageDetail : "auto";
  for (const ip of imgs) content.push({ type: "input_image", image_url: `data:${ip.mime};base64,${ip.b64}`, detail: _detail });
  /* (atlas-native-tools) A PROTOCOL-2 TURN: the items as Responses input items, the attachments where the client's
     markers put them, and the tools as functions beside the hosted web search. `replay` = the
     provider's own reasoning items from earlier steps, sent back encrypted (store:false keeps nothing
     on OpenAI's side, so this is how the model keeps its thinking between calls) — dropped by the
     first 400 rung below, together with the cache key, as the extras a model may not accept. */
  let replay = !!turn;
  /* (atlas-live-stream) WHAT THE MODEL IS THINKING, IN ITS OWN SUMMARY. The longest wait in a turn is
     reasoning that produces no visible token; Responses publishes a summary of it as it goes, and that
     summary is the first thing the reader can be shown. Asked for only when someone is watching (a
     stream), and only on a turn. ⚠ A project may not be entitled to summaries (OpenAI gates them on
     organisation verification), so the FIRST 400 rung below drops exactly this and nothing else, and
     the isolate remembers the refusal so the next step does not pay for it again. */
  let summary = !!(turn && sink) && !summaryRefused;
  const turnInput = (): unknown[] => {
    const out: unknown[] = [];
    for (const it of placeAttachments<unknown>(turn!.items, (ch) => {
      const parts: unknown[] = [];
      if (ch.includes("docs")) for (const dp of docs) parts.push({ type: "input_file", filename: dp.name, file_data: "data:" + dp.mime + ";base64," + dp.b64 });
      if (ch.includes("files") && attached) parts.push({ type: "input_text", text: attached });
      if (ch.includes("images")) for (const ip of imgs) parts.push({ type: "input_image", image_url: `data:${ip.mime};base64,${ip.b64}`, detail: _detail });
      return parts;
    })) {
      if ("attach" in it) { out.push({ role: "user", content: it.attach }); continue; }
      if (it.type === "message") out.push({ role: it.role, content: it.content });
      else if (it.type === "function_call") out.push({ type: "function_call", call_id: it.call_id, name: it.name, arguments: it.arguments });
      else if (it.type === "function_call_output") out.push({ type: "function_call_output", call_id: it.call_id, output: it.output });
      else if (it.type === "reasoning" && replay) out.push({ type: "reasoning", id: it.id, encrypted_content: it.encrypted_content, summary: [] });
    }
    return out;
  };
  const fns = turn ? turn.tools.map((t) => { const f = fnParameters(t); return { type: "function", name: t.name, description: f.description, parameters: f.parameters, strict: false }; }) : [];

  /* jsonMode: "schema" = the caller's shape, enforced; "object" = bare must-be-JSON (what every
     call did before #R397); "off" = prose, the client parser strips fences. */
  const build = (choice: string | null, jsonMode: "schema" | "object" | "off", tools: boolean): Record<string, unknown> => {
    const b: Record<string, unknown> = {
      model,
      input: turn ? turnInput() : [{ role: "user", content }],
      max_output_tokens: Math.min(12_000, maxTokens + (effort === "high" ? 5_000 : effort === "medium" ? 3_500 : 1_500)),
      reasoning: { effort: effort === "high" ? "high" : effort === "medium" ? "medium" : "low", ...(summary ? { summary: "auto" } : {}) },   /* (#R117) pass "high" through (the old mapping silently crushed anything ≠ medium down to low) · (atlas-live-stream) summary — see `summary` above */
      store: false,
    };
    if (system) b.instructions = system;
    // JSON mode. NOTE: OpenAI's json_object validator wants the word "JSON" in the request; the
    // task prompts carry it, but a rejection is survivable via the 400 ladder below anyway.
    if (jsonMode === "schema" && schemaFormat) b.text = { format: schemaFormat };
    else if (jsonMode !== "off") b.text = { format: { type: "json_object" } };
    // Search is paid per tool call, so attach it only when the client explicitly
    // asks for auto/required web mode. Ordinary Atlas work stays tool-free.
    /* (atlas-native-tools) …and a turn's functions ride beside it. They are never dropped by the ladder: the
       rungs below take away what an answer can do without (the hosted search, the JSON shape), and a
       turn without its functions could no longer operate IntMap at all. */
    const all: unknown[] = fns.slice();
    if (tools) all.push({ type: "web_search" });
    if (all.length) b.tools = all;
    if (tools && choice) b.tool_choice = choice;
    else if (turn && turn.toolChoice === "none" && fns.length) b.tool_choice = "none";
    if (turn && replay) {
      b.include = ["reasoning.encrypted_content"];
      if (cacheKey) b.prompt_cache_key = cacheKey;
    }
    return b;
  };
  /* (atlas-live-stream) each request of the ladder is its own stream; the one whose answer is read is the last */
  let ps = null as Streamed | null;   /* the cast keeps the checker from narrowing to the initial null — it is assigned inside `post` */
  const post = (body: Record<string, unknown>, ms: number) => {
    ps = (turn && sink) ? providerStream("openai", sink) : null;
    if (ps) body.stream = true;
    return providerCall("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify(body),
    }, ms, meter, ps ? ps.onChunk : undefined);
  };

  // (#R116) OUTAGE-PROOFING. The user hit a blanket "AI service temporarily unavailable": any
  // request-shape rejection (400) or a slow hosted web_search run must DEGRADE, never kill the
  // feature. Timeouts: a search-attached call gets a longer leash (searches legitimately run
  // long); if it still times out, ONE fast tool-free retry answers from the supplied evidence
  // (meta.webUsed stays false, so "latest" claims remain honest). 400s walk a fallback ladder:
  // forced tool_choice → model-choice → drop JSON mode (prompt-only JSON; the client parser
  // strips fences) → drop tools.
  // 90s + 40s fallback = 130s worst case — safely inside even a 150s wall-clock limit.
  const WEB_TIMEOUT = 90_000;
  let usedTools = web;
  /* (#R397) THE RUNG ABOVE json_object. A caller schema is tried first and a 400 walks down to the
     bare json_object every call used before, so a dialect this model will not accept costs one
     extra request and never an answer. */
  let usedJson: "schema" | "object" | "off" = wantJson ? (schemaFormat ? "schema" : "object") : "off";
  let r: Response;
  try {
    r = await post(build(web && forceWeb ? "required" : null, usedJson, web), web ? WEB_TIMEOUT : PROVIDER_TIMEOUT_MS);
  } catch (e) {
    const timedOut = e instanceof ProviderError && e.meta && (e.meta as Record<string, unknown>).timeout === true;
    if (web && timedOut) {
      usedTools = false;
      r = await post(build(null, usedJson, false), 40_000);
    } else {
      throw e;
    }
  }
  /* (atlas-live-stream) the rung below every other: a summary this project may not request costs one request, once per isolate */
  if (!r.ok && r.status === 400 && summary) {
    summary = false;
    summaryRefused = true;
    r = await post(build(web && forceWeb ? "required" : null, usedJson, usedTools), usedTools ? WEB_TIMEOUT : PROVIDER_TIMEOUT_MS);
  }
  /* (atlas-native-tools) the first rung for a turn: the replayed reasoning and the cache key are optimisations,
     and a model that will not take another model's reasoning (the fallback chain) or the key must
     still answer the turn */
  if (!r.ok && r.status === 400 && turn && replay) {
    replay = false;
    r = await post(build(web && forceWeb ? "required" : null, usedJson, usedTools), usedTools ? WEB_TIMEOUT : PROVIDER_TIMEOUT_MS);
  }
  if (!r.ok && r.status === 400 && usedTools && forceWeb) {
    r = await post(build(null, usedJson, true), WEB_TIMEOUT);
  }
  if (!r.ok && r.status === 400 && usedJson === "schema") {
    usedJson = "object";
    r = await post(build(null, usedJson, usedTools), usedTools ? WEB_TIMEOUT : PROVIDER_TIMEOUT_MS);
  }
  if (!r.ok && r.status === 400 && usedJson === "object") {
    usedJson = "off";
    r = await post(build(null, usedJson, usedTools), usedTools ? WEB_TIMEOUT : PROVIDER_TIMEOUT_MS);
  }
  if (!r.ok && r.status === 400 && usedTools) {
    usedTools = false;
    r = await post(build(null, usedJson, false), PROVIDER_TIMEOUT_MS);
  }
  if (!r.ok) {
    const t = (await r.text().catch(() => "")).slice(0, 400);
    /* (#R148) The configured model is unknown / not enabled on this OpenAI project (403/404
       model_not_found · "does not have access to model"). This is exactly what broke Atlas when
       AI_MODEL was set to a model the project can't reach — so instead of failing the whole call,
       take the NEXT step of FALLBACK_CHAIN (#R722: sol → terra → luna).
       ⚠ THE POSITION IN THE CHAIN IS THE BOUND. Whichever model just failed, the next attempt is the
       one after it (a model that is not in the chain starts at its head), so each failure moves
       strictly right and the walk ends at the end of the array — there is no counter to get wrong.
       ⚠ noFallback is the OTHER reason to stop: a model the developer chose by name is not
       substituted, because a substitution answers a different question than the one being tested. */
    const nextModel = noFallback ? "" : (FALLBACK_CHAIN[FALLBACK_CHAIN.indexOf(model) + 1] || "");
    if (nextModel && (r.status === 403 || r.status === 404) &&
        /model_not_found|does not have access to model|does not exist|unknown model|no access/i.test(t)) {
      try { console.error("ai-proxy model fallback", JSON.stringify({ from: model, to: nextModel, status: r.status })); } catch (_) { /* ignore */ }
      return await callOpenAI(nextModel, key, prompt, system, imgs, files, docs, web, maxTokens, wantJson, forceWeb, effort, imageDetail, false, schemaFormat, turn, cacheKey, meter, sink);
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
  // deno-lint-ignore no-explicit-any
  const j: any = ps ? streamedBody(ps, "openai", meter) : await r.json();   /* (atlas-live-stream) the same body, folded from the stream */
  meter?.add("openai", j);
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
  /* (atlas-native-tools) a turn's answer is the provider's items, in the order it produced them: its encrypted
     reasoning (to be replayed), what it wrote, and every function call with the provider's own id.
     A reply that only calls functions is a complete reply — it is not "empty". */
  let output: TurnItem[] | undefined;
  if (turn) {
    output = [];
    for (const it of outputArr) {
      if (it?.type === "reasoning" && typeof it.encrypted_content === "string" && it.encrypted_content && typeof it.id === "string") {
        output.push({ type: "reasoning", id: it.id, encrypted_content: it.encrypted_content });
      } else if (it?.type === "function_call" && typeof it.name === "string" && typeof it.call_id === "string") {
        output.push({ type: "function_call", call_id: it.call_id, name: it.name, arguments: typeof it.arguments === "string" ? it.arguments : "{}" });
      } else if (it?.type === "message" && Array.isArray(it.content)) {
        const said = it.content.filter((p: { type?: string; text?: string }) => p?.type === "output_text" && typeof p.text === "string").map((p: { text: string }) => p.text).join("");
        if (said) output.push({ type: "message", role: "assistant", content: said });
      }
    }
  }
  if (!text && !(output && output.some((it) => it.type === "function_call"))) {
    const refused = outputArr.some((item: { content?: unknown[] }) =>
      Array.isArray(item?.content) && item.content.some((part: { type?: string }) => part?.type === "refusal"));
    if (refused) throw new ProviderError("provider_blocked", "Blocked by the provider's safety filter.", 502, false, { finishReason });
    throw new ProviderError("provider_empty", "Empty response from OpenAI.", 502, true, { finishReason });
  }
  return { text, finishReason, webAttached: usedTools, webUsed: webCount > 0, webCount, citations, schemaAttached: usedJson === "schema", served: String(j?.model || ""), output };
}
