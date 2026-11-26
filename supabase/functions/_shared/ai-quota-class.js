// ============================================================================
//  IntMap · _shared/ai-quota-class.js — what a provider's 429 / quota answer MEANS  (atlas-jobs-reliability)
// ----------------------------------------------------------------------------
//  ONE taxonomy for «the provider said slow down / said no more», shared by ai-proxy (provider-call.ts classifyGemini) and the
//  durable-job runner (atlas-jobs/index.ts). It used to live only inside ai-proxy, so atlas-jobs read every 429 as a hard quota and
//  refused the task at once — a per-MINUTE rate limit (which clears in about a minute) ended a research piece for good.
//
//    quotaClass(status, bodyText) → null                      (not a quota answer: let the caller treat it as it treats any status)
//                                 | { kind: 'quota', scope }  a HARD stop: billing / spend limit / per-day — never retried
//                                 | { kind: 'rate',  scope, retryAfterSeconds?, quotaId? }   transient: wait, then ask again
//
//  Pure: a status and the body's TEXT in, a verdict out. The caller keeps the verdict, never the body
//  (_shared/ai-provider.js «THE UPSTREAM BODY IS NOT OURS TO REPEAT»).
//  ⚠ NO TYPE ANNOTATIONS — parsed as plain JavaScript by scripts/static-checks.mjs and imported by Deno and node alike.
// ============================================================================

export function quotaClass(status, bodyText) {
  const text = String(bodyText == null ? "" : bodyText);
  const lc = text.toLowerCase();
  /* OpenAI billing / quota exhaustion (out of prepaid balance, or the project hit its hard spend limit) is a HARD stop,
     NOT a per-minute rate limit — checked before the generic 429 branch. (ai-proxy #R114) */
  if (lc.includes("insufficient_quota") || lc.includes("billing_hard_limit_reached") || lc.includes("billing hard limit")) return { kind: "quota", scope: "billing" };
  if (Number(status) === 429 || lc.includes("resource_exhausted") || lc.includes("exceeded your current quota") || lc.includes("rate limit")) {
    /* Gemini's 429 body is IDENTICAL for a per-MINUTE rate limit (clears in ~1 min) and a per-DAY / billing quota; the quotaId tells them apart. (ai-proxy #R113e) */
    let quotaId = ""; try { const m = /quotaid["']?\s*[:=]\s*["']?([a-z0-9_.\-]+)/i.exec(text); if (m) quotaId = m[1].slice(0, 90); } catch (_) { /* */ }
    let retryAfter = ""; try { const m = /retry(?:delay|after)["']?\s*[:=]\s*["']?(\d+)\s*s/i.exec(text); if (m) retryAfter = m[1]; } catch (_) { /* */ }
    const qlc = quotaId + " " + lc;
    const perDay = qlc.includes("perday") || qlc.includes("per day") || qlc.includes("requests per day");
    const perMinute = qlc.includes("perminute") || qlc.includes("per minute");
    if (perDay && !perMinute) return { kind: "quota", scope: "per-day", quotaId, retryAfterSeconds: retryAfter ? Number(retryAfter) : undefined };
    return { kind: "rate", scope: perMinute ? "per-minute" : "rate", quotaId, retryAfterSeconds: retryAfter ? Number(retryAfter) : undefined };
  }
  return null;
}

/* The seconds a provider's `Retry-After` HEADER asks for (a number of seconds; an HTTP date is not used) — undefined when absent. */
export function retryAfterHeader(headers) {
  try {
    const v = headers && typeof headers.get === "function" ? headers.get("retry-after") : null;
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  } catch (_) { return undefined; }
}
