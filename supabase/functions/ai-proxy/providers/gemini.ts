// ============================================================================
//  IntMap · ai-proxy · providers/gemini — generateContent, its retry policy, and protocol 2
// ----------------------------------------------------------------------------
//  (atlas-core-split) Moved out of index.ts unchanged. Wired, dormant while AI_PROVIDER=openai.
// ============================================================================

import { PROVIDER_TIMEOUT_MS } from "../../_shared/ai-provider.js";
import { providerStream } from "../../_shared/ai-stream.js";
import { providerCall, ProviderError, classifyGemini, streamedBody } from "../provider-call.ts";
import type { Meter, StreamSink } from "../provider-call.ts";
import { filesBlock } from "../media.ts";
import type { ImgPart, FilePart, DocPart, WebCitation } from "../media.ts";
import { fnParameters, placeAttachments } from "../turn.ts";
import type { TurnReq, TurnItem } from "../turn.ts";

export interface GeminiOpts {
  meter?: Meter;
  maxTokens: number;
  web: boolean;
  searchEnabled: boolean;
  wantJson: boolean;
  responseSchema?: unknown;
  noTools?: boolean;         // hardened retry: never attach a tool
}

export async function callGemini(model: string, key: string, prompt: string, system: string, imgs: ImgPart[], files: FilePart[], docs: DocPart[], opts: GeminiOpts): Promise<{ text: string; finishReason: string; webAttached: boolean; served?: string }> {
  /* (#R540) documents → attached text → the user's prompt; the images keep their place after it. */
  const parts: unknown[] = [];
  for (const dp of docs) parts.push({ inline_data: { mime_type: dp.mime, data: dp.b64 } });
  const attached = filesBlock(files);
  if (attached) parts.push({ text: attached });
  parts.push({ text: prompt });
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

  const r = await providerCall(
    "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
    { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) },
    PROVIDER_TIMEOUT_MS, opts.meter,
  );

  if (!r.ok) {
    const err = (await r.text().catch(() => "")).slice(0, 1500);   // (#R113e) wide enough to see the quotaId in a 429 body
    throw classifyGemini(r.status, err, "", "");
  }

  const j = await r.json();
  opts.meter?.add("gemini", j);
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

  return { text, finishReason, webAttached: attachSearch, served: String(j?.modelVersion || "") };
}

// (#R113c) Transient Google errors — 503 "the model is overloaded" / other 5xx / rate-limit — are common for a busy
// model and usually clear on a retry (Gemini's own guidance is to retry with backoff). Retry those up to twice with a
// short backoff. Timeouts and MALFORMED are handled elsewhere (retrying a timeout would just burn another 45s).
export async function callGeminiRetry(model: string, key: string, prompt: string, system: string, imgs: ImgPart[], files: FilePart[], docs: DocPart[], opts: GeminiOpts): Promise<{ text: string; finishReason: string; webAttached: boolean; served?: string }> {
  return await geminiRetry(() => callGemini(model, key, prompt, system, imgs, files, docs, opts));
}
/* (atlas-native-tools) the retry policy above, as a wrapper, so the turn path gets the SAME policy rather than a copy */
export async function geminiRetry<T>(call: () => Promise<T>): Promise<T> {
  const MAX = 3;   // 1 attempt + up to 2 retries
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
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

/* ══ (atlas-native-tools) THE TURN, IN GEMINI'S NATIVE SHAPE — functionCall / functionResponse ═════════════════
   Same argument as callAnthropicTurn. Three facts of this API decide the shape:
     · a functionResponse is matched by NAME, not id, so the name is looked up from the call it answers;
     · Gemini 3 hands back a `thoughtSignature` on each functionCall part and requires it on the replay
       — carried through the item as `signature` (the client stores items verbatim);
     · function declarations cannot be combined with JSON mode or with Google Search grounding on this
       endpoint, so a turn carries neither: the final shape is stated by the instruction, and the
       client reads a prose final as the answer (as it always did when JSON mode was dropped). */
export async function callGeminiTurn(model: string, key: string, turn: TurnReq, system: string, imgs: ImgPart[], files: FilePart[], docs: DocPart[], maxTokens: number, meter?: Meter, sink?: StreamSink): Promise<{ text: string; finishReason: string; webAttached: boolean; served?: string; output: TurnItem[] }> {
  const attached = filesBlock(files);
  const nameOf: Record<string, string> = {};
  const contents: { role: string; parts: unknown[] }[] = [];
  const add = (role: string, part: unknown) => {
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(part); else contents.push({ role, parts: [part] });
  };
  for (const it of placeAttachments<unknown>(turn.items, (ch) => {
    const parts: unknown[] = [];
    if (ch.includes("docs")) for (const dp of docs) parts.push({ inline_data: { mime_type: dp.mime, data: dp.b64 } });
    if (ch.includes("files") && attached) parts.push({ text: attached });
    if (ch.includes("images")) for (const ip of imgs) parts.push({ inline_data: { mime_type: ip.mime, data: ip.b64 } });
    return parts;
  })) {
    if ("attach" in it) { it.attach.forEach((p) => add("user", p)); continue; }
    if (it.type === "message") add(it.role === "assistant" ? "model" : "user", { text: it.content });
    else if (it.type === "function_call") {
      let args: unknown = {};
      try { args = JSON.parse(it.arguments || "{}"); } catch (_) { args = {}; }
      nameOf[it.call_id] = it.name;
      add("model", { functionCall: { name: it.name, args: (args && typeof args === "object") ? args : {} }, ...(it.signature ? { thoughtSignature: it.signature } : {}) });
    } else if (it.type === "function_call_output") add("user", { functionResponse: { name: nameOf[it.call_id] || "unknown", response: { content: it.output } } });
  }
  const body: Record<string, unknown> = { contents, generationConfig: { maxOutputTokens: maxTokens, thinkingConfig: { thinkingLevel: "low" } } };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (turn.tools.length) {
    body.tools = [{ functionDeclarations: turn.tools.map((t) => { const f = fnParameters(t); return { name: t.name, description: f.description, parametersJsonSchema: f.parameters }; }) }];
    if (turn.toolChoice === "none") body.toolConfig = { functionCallingConfig: { mode: "NONE" } };
  }
  /* (atlas-live-stream) the streaming method of the same model, when the page is watching. Its thought
     SUMMARIES are asked for too — the parse below already skips `thought` parts, so they reach the
     reader as a preview and never the answer. */
  const ps = sink ? providerStream("gemini", sink) : null;
  if (ps) body.generationConfig = { ...(body.generationConfig as Record<string, unknown>), thinkingConfig: { thinkingLevel: "low", includeThoughts: true } };
  const r = await providerCall(
    "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + (ps ? ":streamGenerateContent?alt=sse" : ":generateContent"),
    { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) },
    PROVIDER_TIMEOUT_MS, meter, ps ? ps.onChunk : undefined,
  );
  if (!r.ok) throw classifyGemini(r.status, (await r.text().catch(() => "")).slice(0, 1500), "", "");
  // deno-lint-ignore no-explicit-any
  const j: any = ps ? streamedBody(ps, "gemini", meter) : await r.json();
  meter?.add("gemini", j);
  const c = j?.candidates?.[0];
  const finishReason = String(c?.finishReason || "NO_CANDIDATE");
  const blockReason = String(j?.promptFeedback?.blockReason || "");
  if (finishReason === "MALFORMED_FUNCTION_CALL" || finishReason === "SAFETY" || blockReason) throw classifyGemini(200, "", finishReason, blockReason);
  const output: TurnItem[] = [];
  let text = "";
  (Array.isArray(c?.content?.parts) ? c.content.parts : []).forEach((p: Record<string, unknown>, i: number) => {
    if (p?.thought === true) return;
    const fc = p?.functionCall as { name?: string; args?: unknown } | undefined;
    if (fc && typeof fc.name === "string") {
      output.push({ type: "function_call", call_id: "g" + Date.now().toString(36) + "_" + i, name: fc.name, arguments: JSON.stringify(fc.args || {}),
        ...(typeof p.thoughtSignature === "string" ? { signature: p.thoughtSignature as string } : {}) });
    } else if (typeof p?.text === "string" && p.text) { text += p.text as string; output.push({ type: "message", role: "assistant", content: p.text as string }); }
  });
  if (!text.trim() && !output.some((it) => it.type === "function_call")) {
    throw new ProviderError("provider_empty", "gemini: empty response (finishReason=" + finishReason + ")", 502, finishReason === "MAX_TOKENS", { finishReason });
  }
  return { text: text.trim(), finishReason, webAttached: false, served: String(j?.modelVersion || ""), output };
}
