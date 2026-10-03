// ============================================================================
//  IntMap · ai-proxy · turn — protocol 2: the Atlas turn as items, the tools as functions
// ----------------------------------------------------------------------------
//  (atlas-core-split) Moved out of index.ts unchanged. normalizeTurn validates and bounds the
//  request; fnParameters / placeAttachments are what every provider (providers/*.ts) builds its
//  native shape from; cacheBasis is what the prompt-cache key is a hash of (ask.ts).
// ============================================================================

import { schemaOk } from "./schema.ts";

/* ══ ⚠⚠⚠ (atlas-native-tools) PROTOCOL 2 — THE TURN AS ITEMS, THE TOOLS AS THE PROVIDER'S OWN FUNCTIONS ══════════
   MEASURED before this: Atlas sent ONE string per step and this function kept `.slice(0, MAX_PROMPT)`
   of it — 24,000 characters. The client stacked map state, context, 48 lines of conversation,
   [REQUEST], then every call and result of the turn as JSON, so what the slice took was the END: the
   turn's own results (one find_capability answer measures up to 39,235 characters) and on a long
   conversation the request itself. Nobody was told — not the model, not the reader. And the calls
   themselves rode a JSON envelope in that string (`tool_calls[].arguments_json`), so every step
   re-sent the whole string and re-parsed the model's JSON instead of the provider's function calls.
   A protocol-2 request carries `input` — items: {type:"message", role, content},
   {type:"function_call", call_id, name, arguments}, {type:"function_call_output", call_id, output},
   {type:"reasoning", id, encrypted_content} (OpenAI's own, replayed), {type:"attachments", channels}
   (where the reader's files / documents / images go) — and `tools`, the functions Atlas holds. Each
   provider receives them in its own native shape; the answer comes back as `output`, the same items.
   ⚠ THE ONE-STRING REQUEST IS STILL ACCEPTED, unchanged: every other task speaks it, and GitHub Pages
   serves a cached bundle for a while after a deploy (the `atlas_plan` argument in tasks/atlas_plan.ts).
   meta.protocol says which one answered. (atlas-legacy-protocol-removal) The page no longer speaks the
   one-string form for an Atlas turn, and no longer falls back to it: js/ai-core.js treats a turn
   answered without protocol 2 as malformed.
   ⚠ THE FENCE HERE IS THE LAST LINE, NOT THE BUDGET. js/atlas-agent.js composeInput spends the real
   budget item by item (INPUT_BUDGET: 240,000 in total, 48,000 per item) and says what it gave up; the
   bounds below are set at twice those, so a conforming client never reaches them. When something does,
   what was cut is RETURNED (meta.inputTrimmed) and written into the item itself — never done silently.
   EXPIRES WHEN: the client's INPUT_BUDGET moves (tests/r809 holds these at or above it). */
export const MAX_INPUT_ITEMS = 600;          // 48 history + 8 steps × (reasoning + message + 8 calls + 8 outputs) + the rest, with room
export const MAX_INPUT_CHARS = 480_000;
export const MAX_ITEM_CHARS = 96_000;
export const MAX_FN_TOOLS = 64;
export const MAX_FN_DESC = 8_000;
export const FN_NAME_OK = /^[A-Za-z0-9_-]{1,64}$/;          // the name rule all three providers share
export const CALL_ID_OK = /^[A-Za-z0-9_.:-]{1,120}$/;
export type TurnItem =
  | { type: "message"; role: "user" | "assistant" | "developer"; content: string }
  | { type: "function_call"; call_id: string; name: string; arguments: string; signature?: string }
  | { type: "function_call_output"; call_id: string; output: string }
  | { type: "reasoning"; id: string; encrypted_content: string }
  | { type: "attachments"; channels: string[] };
export interface FnTool { name: string; description: string; parameters: Record<string, unknown>; promoted?: boolean; }   // (atlas-turn-engine) promoted = appended this turn from find_capability (js/atlas-agent.js)
export interface TurnReq { items: TurnItem[]; tools: FnTool[]; toolChoice: "none" | ""; trim: Record<string, unknown> | null; }
export const itemLen = (it: TurnItem): number =>
  it.type === "message" ? it.content.length
    : it.type === "function_call" ? it.arguments.length
    : it.type === "function_call_output" ? it.output.length : 0;
/* The cut is written INTO the item, after its content, so the model reads it where the text stops. */
export const cutText = (s: string, n: number) =>
  s.slice(0, n) + "\n[CUT BY THE SERVER TO FIT — this item was " + s.length + " characters; the first " + n + " are above.]";

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Validate and bound a protocol-2 request. `null` = not protocol 2; `{error}` = refused. */
export function normalizeTurn(payload: Record<string, unknown>): TurnReq | { error: string } | null {
  if (Number(payload.protocol) !== 2 || !Array.isArray(payload.input)) return null;
  const trim: Record<string, number> = {};
  const bump = (k: string, n = 1) => { trim[k] = (trim[k] || 0) + n; };
  const items: TurnItem[] = [];
  for (const raw of (payload.input as unknown[]).slice(0, MAX_INPUT_ITEMS)) {
    if (!raw || typeof raw !== "object") { bump("invalidItems"); continue; }
    const o = raw as Record<string, unknown>;
    const t = String(o.type || "");
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const bound = (s: string) => { if (s.length <= MAX_ITEM_CHARS) return s; bump("cutItems"); return cutText(s, MAX_ITEM_CHARS); };
    if (t === "message") {
      const role = String(o.role || "");
      if (role !== "user" && role !== "assistant" && role !== "developer") { bump("invalidItems"); continue; }
      const content = str(o.content);
      if (!content) continue;
      items.push({ type: "message", role: role as "user" | "assistant" | "developer", content: bound(content) });
    } else if (t === "function_call") {
      const call_id = str(o.call_id), name = str(o.name);
      if (!CALL_ID_OK.test(call_id) || !FN_NAME_OK.test(name)) { bump("invalidItems"); continue; }
      const sig = str(o.signature);
      items.push({ type: "function_call", call_id, name, arguments: bound(str(o.arguments) || "{}"), ...(sig && sig.length <= MAX_ITEM_CHARS ? { signature: sig } : {}) });
    } else if (t === "function_call_output") {
      const call_id = str(o.call_id);
      if (!CALL_ID_OK.test(call_id)) { bump("invalidItems"); continue; }
      items.push({ type: "function_call_output", call_id, output: bound(str(o.output)) });
    } else if (t === "reasoning") {
      /* opaque, the provider's own; it cannot be shortened, so an oversize one is left out and said */
      const enc = str(o.encrypted_content), id = str(o.id);
      if (!enc || !id || enc.length > MAX_ITEM_CHARS || !CALL_ID_OK.test(id)) { bump("droppedReasoning"); continue; }
      items.push({ type: "reasoning", id, encrypted_content: enc });
    } else if (t === "attachments") {
      const ch = (Array.isArray(o.channels) ? o.channels : []).map(String).filter((c) => c === "docs" || c === "files" || c === "images");
      if (ch.length) items.push({ type: "attachments", channels: ch });
    } else bump("invalidItems");
  }
  if ((payload.input as unknown[]).length > MAX_INPUT_ITEMS) bump("droppedItems", (payload.input as unknown[]).length - MAX_INPUT_ITEMS);
  /* over the total: the oldest conversation messages go — never a call, never an output, never the
     request — and one item says so. Where the history ends: js/atlas-agent.js puts the documents
     marker right before the request, so everything before the FIRST marker is history; a caller
     that sends no marker has its history end at the first call, and its request is the last user
     message before that. */
  let total = items.reduce((a, it) => a + itemLen(it), 0);
  if (total > MAX_INPUT_CHARS) {
    const marker = items.findIndex((it) => it.type === "attachments");
    let firstCall = items.findIndex((it) => it.type === "function_call");
    if (firstCall < 0) firstCall = items.length;
    if (marker >= 0 && marker < firstCall) firstCall = marker;
    let request = -1;
    if (marker < 0) for (let i = firstCall - 1; i >= 0; i--) { const it = items[i]; if (it.type === "message" && it.role === "user") { request = i; break; } }
    let n = 0, chars = 0;
    for (let i = 0; i < firstCall && total > MAX_INPUT_CHARS; i++) {
      const it = items[i];
      if (i === request || it.type !== "message") continue;
      total -= itemLen(it); chars += itemLen(it); n++;
      (items as (TurnItem | null)[])[i] = null;
    }
    if (n) {
      const kept = (items as (TurnItem | null)[]).filter((x): x is TurnItem => !!x);
      items.length = 0;
      items.push({ type: "message", role: "user", content: "[EARLIER CONVERSATION NOT SHOWN — the server left out the " + n + " oldest messages (" + chars + " characters) to fit. They are not in front of you: if the request depends on them, say so rather than guess.]" }, ...kept);
      bump("droppedMessages", n); bump("droppedChars", chars);
    }
    if (total > MAX_INPUT_CHARS) return { error: "too_large" };
  }
  const tools: FnTool[] = [];
  for (const raw of (Array.isArray(payload.tools) ? payload.tools : []).slice(0, MAX_FN_TOOLS)) {
    const o = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
    const name = String(o.name || "");
    const params = (o.parameters && typeof o.parameters === "object" && !Array.isArray(o.parameters)) ? o.parameters as Record<string, unknown> : { type: "object", properties: {} };
    if (!FN_NAME_OK.test(name) || !schemaOk(params) || tools.some((x) => x.name === name)) { bump("droppedTools"); continue; }
    let description = String(o.description || "");
    if (description.length > MAX_FN_DESC) { description = description.slice(0, MAX_FN_DESC); bump("cutToolDescriptions"); }
    tools.push({ name, description, parameters: params, ...(o.promoted === true ? { promoted: true } : {}) });
  }
  if (Array.isArray(payload.tools) && payload.tools.length > MAX_FN_TOOLS) bump("droppedTools", payload.tools.length - MAX_FN_TOOLS);
  if (!items.some((it) => it.type !== "attachments")) return { error: "empty" };
  return { items, tools, toolChoice: payload.toolChoice === "none" ? "none" : "", trim: Object.keys(trim).length ? trim : null };
}

/* A tool's parameters, as a provider's function declaration takes them. js/atlas-agent.js validates
   the ROOT `anyOf` ("a place OR a coordinate pair") itself before anything runs; a root combinator is
   what the providers' function-schema dialects are least consistent about, so it is not sent — it is
   SAID, in the description, from the schema's own `required` lists (nothing written by hand here). */
export function fnParameters(t: FnTool): { parameters: Record<string, unknown>; description: string } {
  const p = { ...t.parameters } as Record<string, unknown>;
  let description = t.description;
  for (const k of ["anyOf", "oneOf", "allOf"]) {
    const alts = p[k];
    if (!Array.isArray(alts)) continue;
    delete p[k];
    const said = alts.map((b) => (b && typeof b === "object" && Array.isArray((b as Record<string, unknown>).required)) ? ((b as Record<string, unknown>).required as unknown[]).join(" + ") : "").filter(Boolean);
    if (said.length) description += " (Arguments: give " + said.join(k === "allOf" ? ", and " : " or ") + ".)";
  }
  if (p.type !== "object") p.type = "object";
  if (!p.properties || typeof p.properties !== "object") p.properties = {};
  return { parameters: p, description };
}

/* (atlas-turn-engine) WHAT THE PROMPT-CACHE KEY IS A HASH OF. The instructions and the functions every call of
   a turn declares — and NOT the functions js/atlas-agent.js promoted from find_capability during it: those
   are appended after the fixed ones (the client orders them so) and marked `promoted`, and a key that moved
   with each promotion would route the next call away from the cache that holds the unchanged prefix.
   Without a promoted tool this is byte-for-byte the string the key was hashed from before. */
export function cacheBasis(system: string, tools: FnTool[]): string {
  return system + "\n" + JSON.stringify(tools.filter((t) => !t.promoted).map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })));
}

/* The reader's attachments, wherever the client's markers put them; a channel no marker names goes
   in a user message at the end. `build(channels)` returns the provider's parts for those channels. */
export function placeAttachments<P>(items: TurnItem[], build: (ch: string[]) => P[]): (TurnItem | { attach: P[] })[] {
  const out: (TurnItem | { attach: P[] })[] = [];
  const done = new Set<string>();
  for (const it of items) {
    if (it.type !== "attachments") { out.push(it); continue; }
    const ch = it.channels.filter((c) => !done.has(c));
    ch.forEach((c) => done.add(c));
    const parts = build(ch);
    if (parts.length) out.push({ attach: parts });
  }
  const rest = ["docs", "files", "images"].filter((c) => !done.has(c));
  const parts = rest.length ? build(rest) : [];
  if (parts.length) out.push({ attach: parts });
  return out;
}
