// ============================================================================
//  IntMap · ai-proxy · provider-call — the one request door, and the failure taxonomy
// ----------------------------------------------------------------------------
//  (atlas-core-split) Moved out of index.ts unchanged. Every provider request of this function
//  (providers/*.ts, models.ts) goes through providerCall; every failure it reports is a
//  ProviderError, classified by classifyGemini whichever provider it came from.
// ============================================================================

/* (atlas-live-stream) The provider's server-sent events, read twice: as previews for the reader while
   they arrive, and folded back into the body the parsers below already read. */
import { providerStream, previewSink } from "../_shared/ai-stream.js";
import { providerFetch, ProviderFail, providerBudgetMs } from "../_shared/ai-provider.js";
import { CEILING } from "./config.ts";

/* (#R113b) A hung/slow provider fetch must NOT run the isolate into the Edge-Function wall-clock limit
   (an opaque 546); (#R801) the deadline covers the body as well as the headers, and the answer has a
   byte ceiling. Both numbers and the request itself are _shared/ai-provider.js's (PROVIDER_TIMEOUT_MS,
   PROVIDER_MAX_BYTES, providerFetch) — this used to be a private copy, one of three.
   What remains HERE is only the translation into this file's own failure type, because the callers
   below decide on ProviderError's fields (the OpenAI path retries a web call on meta.timeout, the
   Gemini path retries a 5xx on meta.providerStatus), and the ceiling that every request takes from. */
export async function providerCall(url: string, init: RequestInit, ms: number | undefined, meter?: Meter, onChunk?: (b: Uint8Array) => void): Promise<Response> {
  try { meter?.attempt?.(); } catch (_) { /* (atlas-turn-observability) counting a request must never stop it */ }
  try {
    /* ⚠ NO NUMBER OF OURS. `ms` is undefined for every call of this function: the request may take what the
       platform leaves it (providerBudgetMs — the reasoning is there), shared across the rungs of one reader
       request via meter.startedAt. A caller that really needs shorter passes it; none does. */
    const budget = (ms && ms > 0) ? ms : providerBudgetMs(typeof onChunk === "function", meter?.startedAt, Date.now());
    return await providerFetch(url, init, { ceiling: meter?.ceiling || CEILING, timeoutMs: budget, onChunk });
  } catch (e) {
    const code = e instanceof ProviderFail ? e.code : "";
    /* (ai-quota-fairness) The reader's COHORT has spent its share of the project ceiling; the rest of
       the day is held for everyone else. Same code and status as the project ceiling (it is the same
       kind of quota, separate from the reader's own uses, and the use is refunded), a different name. */
    if (code === "share_ceiling") throw new ProviderError("provider_quota", "Today's AI capacity for new accounts was reached. Please try again later.", 503, false, { ceiling: String(meter?.ceiling?.share || "share") + "_day" });
    /* The project-wide ceiling said no. `provider_quota` is the code the page already explains as
       «a quota that is separate from your IntMap free uses» — which is exactly this — and it is not
       retryable today. meta.ceiling names which quota it was, for the log and the panel. */
    if (code === "spend_ceiling") throw new ProviderError("provider_quota", "The project-wide daily AI ceiling was reached. Please try again later.", 503, false, { ceiling: "project_day" });
    if (code === "limiter_unavailable") throw new ProviderError("provider_unavailable", "The usage ceiling could not be checked — please try again.", 503, true, { ceiling: "unavailable" });
    const aborted = code === "timeout";
    /* ⚠ NOT `+ e.message`. A transport failure's message names the host it was resolving, the TLS
       state it got to and this file's own internals; the caller can act on «timed out» and «could not
       be reached», and nothing more specific is theirs. */
    const why = aborted ? "The AI provider timed out." : code === "too_large" ? "The AI provider's answer was too large." : "Could not reach the AI provider.";
    throw new ProviderError("provider_unavailable", why, 503, true, { timeout: aborted, tooLarge: code === "too_large" });
  }
}

// (#R113) Typed provider failure → mapped to an HTTP status that is NEVER 429
// (429 means the IntMap daily quota) so the client can tell them apart.
export type AIProxyErrorCode =
  | "provider_rate_limit"
  | "provider_quota"
  | "provider_malformed"
  | "provider_empty"
  | "provider_blocked"
  | "provider_unavailable"
  | "invalid_structured_output";

export class ProviderError extends Error {
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
export function classifyGemini(status: number, bodyText: string, finishReason: string, blockReason: string): ProviderError {
  const lc = (bodyText || "").toLowerCase();
  if (finishReason === "MALFORMED_FUNCTION_CALL") {
    return new ProviderError("provider_malformed", "Model emitted a malformed function/tool call.", 502, true, { finishReason });
  }
  if (finishReason === "SAFETY" || blockReason) {
    return new ProviderError("provider_blocked", "Blocked by the provider's safety filter." + (blockReason ? " (" + blockReason + ")" : ""), 502, false, { finishReason, blockReason });
  }
  // (#R114) OpenAI billing/quota exhaustion (out of prepaid balance, or the project hit its hard
  // spend limit) is a HARD stop — NOT a transient per-minute rate limit — so it must not be retried
  // or read as "try again shortly". (Checked before the generic 429 branch below.)
  if (lc.includes("insufficient_quota") || lc.includes("billing_hard_limit_reached") || lc.includes("billing hard limit")) {
    return new ProviderError("provider_quota", "The AI provider account balance / spend limit was reached.", 502, false, { providerStatus: status });
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

/* ══ (atlas-live-stream) THE STREAMED BODY, AND A FAILURE THAT ARRIVED INSIDE A 200 ══════════════════
   A turn call given a `sink` asks its provider to stream, and the bytes of the 2xx answer go through
   providerStream (_shared/ai-stream.js) while they arrive. When the body is complete this returns what
   `r.json()` would have returned for the same request without streaming, so everything after that line
   in each provider function is the code that already ran. A provider that reports an error INSIDE the
   stream (OpenAI `response.failed` / `error`, Anthropic `error`, Gemini an `error` chunk) is classified
   by the same classifyGemini the HTTP errors go through — one taxonomy, whichever way it arrived.
   A stream that simply stops — no terminal event — is `provider_unavailable`, retryable: nothing was
   answered, and nothing is pretended to have been. */
export type StreamSink = ReturnType<typeof previewSink>;
export type Streamed = ReturnType<typeof providerStream>;
export function streamedBody(ps: Streamed, provider: string, meter?: Meter): Record<string, unknown> {
  const out = ps.result() as { json?: Record<string, unknown>; fail?: { status: number; text: string; partial?: unknown } };
  if (out.fail) {
    /* what the provider had already billed when it failed — the caller's meter.add never runs on this path */
    if (out.fail.partial) meter?.add(provider, out.fail.partial);
    throw classifyGemini(out.fail.status, out.fail.text, "", "");
  }
  return out.json || {};
}

/* (ai-one-ledger) One request's usage meter (_shared/ai-usage.js usageMeter). Every provider answer
   this request READS is added to it the moment its body is parsed — before any check that may still
   throw — so a fallback step, a retry or an answer later refused as empty is counted too: each of
   them was a request on the same invoice. */
/* (ai-quota-fairness) …and the ceiling THIS request's provider calls come out of. The meter is the one
   object every provider call site of a request already receives, so the cohort's share travels with
   it rather than through a second parameter at each site; absent (the developer's model list, which
   has no request meter) means the project ceiling alone. */
export type Meter = { add(provider: string, answer: unknown): unknown; startedAt?: number; attempt?(): void; fallback?(to: string): void; ceiling?: { take(cost?: number): Promise<unknown>; share?: string } };

/* ══ (atlas-completion) WHAT THE ANSWER IS, BESIDES ITS TEXT — did it end, and what did the search do ══
   Two facts each provider used to read and then drop:
   ① WHETHER THE ANSWER ENDED. OpenAI says `status:"incomplete"` with `incomplete_details.reason`
     (max_output_tokens, content_filter), Anthropic a `stop_reason` that is not a natural end
     (max_tokens, pause_turn, refusal …), Gemini a `finishReason` other than STOP. A text that
     stopped there was returned as if it were the whole answer. Each provider states the reason in
     its OWN vocabulary (`incompleteReason`, null = it ended); nothing here translates it.
   ② WHAT THE HOSTED SEARCH DID. «webUsed:false» was one bit for four different events — never asked
     for, asked for and taken away after a timeout or a rejection, attached and not used, used and
     found nothing — and the page answered all four with the same «headline-based provisional»
     caveat. `webOutcome` tells them apart from what the provider reported, never from a guess:
       state  'not_run' (reason 'not_requested' | 'not_attached' | 'model_did_not_search')
              'failed'  (reason = what took it away: 'timeout' | 'rejected' | the provider's own error code)
              'empty'   (the search ran and the provider listed no result)
              'ok'
       searches  how many searches ran · sources  how many results/pages the provider reported
                 (null when this provider does not report them — not zero). */
export type WebFacts = { webAttached?: boolean; webCount?: number; citations?: unknown[]; webFailure?: string; webSources?: number | null };
export type WebOutcome = { state: "not_run" | "failed" | "empty" | "ok"; reason: string | null; searches: number; sources: number | null };
export function webOutcome(requested: boolean, out: WebFacts): WebOutcome {
  const searches = Math.max(0, Number(out.webCount) || 0);
  const cited = Array.isArray(out.citations) ? out.citations.length : 0;
  const listed = typeof out.webSources === "number" && Number.isFinite(out.webSources) ? out.webSources : null;
  const sources = listed !== null ? Math.max(listed, cited) : (cited || null);
  if (!requested) return { state: "not_run", reason: "not_requested", searches: 0, sources: null };
  if (out.webFailure) return { state: "failed", reason: String(out.webFailure), searches, sources };
  if (!out.webAttached) return { state: "not_run", reason: "not_attached", searches: 0, sources: null };
  if (!searches) return { state: "not_run", reason: "model_did_not_search", searches: 0, sources: null };
  if (listed === 0 && !cited) return { state: "empty", reason: "no_results", searches, sources: 0 };
  return { state: "ok", reason: null, searches, sources };
}
