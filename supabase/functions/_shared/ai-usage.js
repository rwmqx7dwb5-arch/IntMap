// ============================================================================
//  IntMap · _shared/ai-usage.js — what one provider answer cost, in one shape  (ai-one-ledger)
// ----------------------------------------------------------------------------
//  WHAT WAS FOUND (audit, 2026-09-29): no function under supabase/functions read the provider's
//  `usage` at all — `usage`, `input_tokens`, `cached_tokens` and `usageMetadata` appeared in ai-proxy
//  and _shared zero times as something READ (the one hit was Anthropic's web-search count). So the
//  cost of one Atlas turn, and whether the prompt cache was being hit, were not measured anywhere:
//  the only counter was «requests» (the plan's daily turns and the project's spendCeiling), and a
//  provider bills tokens. A 7k-token prefix re-sent on each of up to 12 calls of one turn was
//  invisible as a number.
//
//  WHAT THIS FILE OWNS — pure functions, no Deno global, no network, so the node tests evaluate them
//  (tests/ai-one-ledger-checks.test.mjs) instead of reading them:
//    · normalizeUsage(provider, answer) — the three providers' usage blocks as ONE shape:
//        { input, cached_read, cache_write, output }
//        input        tokens read at the full input price (NOT counting cache reads or cache writes)
//        cached_read  tokens served from the provider's prompt cache (the discounted read)
//        cache_write  tokens written into the cache on this request (Anthropic prices the write)
//        output       tokens generated, reasoning/thinking included (every provider bills them as output)
//      ⚠ null — not zeros — when the answer carries no usage block. «The provider did not say» is not
//        «it cost nothing» (one-pass-or-a-reason §5: not observed is not a fact).
//    · usageMeter() — the running total over every provider answer one request reads, fallback
//      steps and retries included (each is a request on the same invoice).
//    · withPromptCache(body) — the Anthropic Messages body with cache breakpoints at the end of the
//      tools and the end of the system prompt.
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE — scripts/static-checks.mjs parses every committed .js as plain
//  JavaScript, and the node tests import this module directly.
// ============================================================================

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0;
};

/* The provider's own field names, per provider (read from each API's reference, 2026-09-29):
     anthropic  usage.input_tokens is the UNCACHED remainder already; the cache read and the cache
                write are reported beside it (cache_read_input_tokens, cache_creation_input_tokens).
     openai     Responses API: usage.input_tokens is the WHOLE prompt and input_tokens_details
                .cached_tokens the part of it served from cache; output_tokens includes reasoning.
                Chat Completions (the dormant shape, read for completeness): prompt_tokens /
                prompt_tokens_details.cached_tokens / completion_tokens. OpenAI does not price or
                report a cache write, so cache_write is 0.
     gemini     usageMetadata.promptTokenCount is the whole prompt (cachedContentTokenCount is part of
                it); toolUsePromptTokenCount is prompt the model read from its own tools; thinking is
                reported apart from candidates (thoughtsTokenCount) and billed as output. */
export function normalizeUsage(provider, answer) {
  const p = String(provider || "").toLowerCase();
  if (!answer || typeof answer !== "object") return null;
  if (p === "anthropic") {
    const u = answer.usage;
    if (!u || typeof u !== "object") return null;
    return {
      input: n(u.input_tokens),
      cached_read: n(u.cache_read_input_tokens),
      cache_write: n(u.cache_creation_input_tokens),
      output: n(u.output_tokens),
    };
  }
  if (p === "openai") {
    const u = answer.usage;
    if (!u || typeof u !== "object") return null;
    const whole = u.input_tokens != null ? n(u.input_tokens) : n(u.prompt_tokens);
    const det = u.input_tokens_details || u.prompt_tokens_details || {};
    const cached = Math.min(whole, n(det && det.cached_tokens));
    const output = u.output_tokens != null ? n(u.output_tokens) : n(u.completion_tokens);
    return { input: whole - cached, cached_read: cached, cache_write: 0, output };
  }
  if (p === "gemini") {
    const m = answer.usageMetadata;
    if (!m || typeof m !== "object") return null;
    const whole = n(m.promptTokenCount) + n(m.toolUsePromptTokenCount);
    const cached = Math.min(whole, n(m.cachedContentTokenCount));
    return { input: whole - cached, cached_read: cached, cache_write: 0, output: n(m.candidatesTokenCount) + n(m.thoughtsTokenCount) };
  }
  return null;
}

/* One request's running total. `calls` counts every provider answer that was READ (a body parsed);
   `unmetered` counts those among them that carried no usage block, so a total can never be mistaken
   for complete when part of it was not reported. */
export function usageMeter() {
  const t = { calls: 0, unmetered: 0, input: 0, cached_read: 0, cache_write: 0, output: 0 };
  return {
    add(provider, answer) {
      t.calls += 1;
      const u = normalizeUsage(provider, answer);
      if (!u) { t.unmetered += 1; return null; }
      t.input += u.input; t.cached_read += u.cached_read; t.cache_write += u.cache_write; t.output += u.output;
      return u;
    },
    total() { return { ...t }; },
  };
}

/* ══ THE ANTHROPIC PROMPT CACHE ════════════════════════════════════════════════════════════════
   Anthropic caches a prompt PREFIX only where the request marks one (`cache_control`), in the order
   tools → system → messages, with at most FOUR breakpoints in one request (Messages API, prompt
   caching). OpenAI caches a shared prefix on its own and ai-proxy already routes it with
   prompt_cache_key; Anthropic without a marker caches nothing — which is what ai-proxy sent until
   this file (zero `cache_control` in the function).
   Two breakpoints, at the end of the two parts that do not change between the calls of one Atlas
   turn: the last tool (caches the whole tool list) and the last system block (caches tools + system).
   ⚠ THIS IS NOT A LIMIT AND NOT A CHANGE OF WHAT IS SENT. The model receives the same tools, the same
   system text and the same messages; only the provider's billing of a repeated prefix changes. A
   prefix shorter than the model's minimum cacheable length is simply not cached (the API accepts the
   marker and ignores it), so the marker cannot make a request fail by being there.
   Pure: returns a new body, never edits the caller's. A body that already holds breakpoints keeps
   them, and none is added past the fourth. */
export const ANTHROPIC_MAX_CACHE_BREAKPOINTS = 4;
const EPHEMERAL = Object.freeze({ type: "ephemeral" });

function countBreakpoints(body) {
  let k = 0;
  const seen = (b) => { if (b && typeof b === "object" && b.cache_control) k += 1; };
  if (Array.isArray(body.tools)) body.tools.forEach(seen);
  if (Array.isArray(body.system)) body.system.forEach(seen);
  if (Array.isArray(body.messages)) {
    for (const m of body.messages) if (m && Array.isArray(m.content)) m.content.forEach(seen);
  }
  return k;
}

export function withPromptCache(body) {
  if (!body || typeof body !== "object") return body;
  const out = { ...body };
  let used = countBreakpoints(body);
  if (Array.isArray(body.tools) && body.tools.length && used < ANTHROPIC_MAX_CACHE_BREAKPOINTS) {
    const last = body.tools[body.tools.length - 1];
    if (last && typeof last === "object" && !last.cache_control) {
      out.tools = body.tools.slice(0, -1).concat([{ ...last, cache_control: { ...EPHEMERAL } }]);
      used += 1;
    }
  }
  if (used < ANTHROPIC_MAX_CACHE_BREAKPOINTS) {
    if (typeof body.system === "string" && body.system) {
      out.system = [{ type: "text", text: body.system, cache_control: { ...EPHEMERAL } }];
    } else if (Array.isArray(body.system) && body.system.length) {
      const last = body.system[body.system.length - 1];
      if (last && typeof last === "object" && !last.cache_control) {
        out.system = body.system.slice(0, -1).concat([{ ...last, cache_control: { ...EPHEMERAL } }]);
      }
    }
  }
  return out;
}
