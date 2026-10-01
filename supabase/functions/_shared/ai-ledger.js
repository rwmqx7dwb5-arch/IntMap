// ============================================================================
//  IntMap · _shared/ai-ledger.js — every AI call a reader causes goes through ONE ledger  (ai-one-ledger)
// ----------------------------------------------------------------------------
//  WHAT WAS FOUND (audit, 2026-09-29):
//    ① monitor-run's «Run now» called the provider on the server's key and never touched the reader's
//       AI allowance. ai-proxy charged `consume_ai_turn`; monitor-run charged nothing, so one free
//       account with its five monitors (monitor_limit, free = 5) could start 5 × 120 = 600 manual
//       runs an hour (MANUAL_COOLDOWN_MS is 30 s per monitor), each allowed to call the provider,
//       while the same account was held to 10 turns a day in Atlas. The only
//       fence was the project-wide spendCeiling, which is a fence on the invoice, not on an account.
//    ② The plan table and the developer override lived inside ai-proxy, so a second caller that
//       wanted to charge the same allowance would have had to copy them — a second quota rule.
//    ③ No caller recorded what a call COST (see _shared/ai-usage.js).
//
//  WHAT THIS FILE OWNS, so that each of those is one thing in one place:
//    · the plan table                 (PLAN_LIMITS — the daily turn allowance per plan)
//    · who the account is             (accountFor: profiles.plan, and the DEV_USER_IDS override)
//    · which cohort it is in          (cohortOf: its age — ai-proxy draws a newcomer from a share of
//                                      the project ceiling, ai-quota-fairness)
//    · the turn ledger's four doors   (openTurn / refundTurn / settleTurn / recordUsage → the
//                                      SECURITY DEFINER RPCs of public.ai_turns and public.ai_usage)
//  ai-proxy and monitor-run both call these; neither spells a limit or an RPC of the ledger itself.
//
//  ⚠⚠ NOTHING HERE IS A NEW LIMIT (CONSTITUTION.md §5). The plan numbers are ai-proxy's, moved, not
//  changed; TURN_MAX_CALLS and TURN_TTL_S stay beside the Atlas turn they describe (ai-proxy). What is
//  new is that a second path that spends the same allowance is now counted by the same counter.
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE — scripts/static-checks.mjs parses it as plain JavaScript, and
//  the node tests import it directly.
// ============================================================================

/* ---- Plan → daily free-use limit (turns per day). ----
   (#R101) free 10→30/day; (#R147) 30→10/day. (supporter-funnel) The numbers are no longer written
   here: every value that differs by plan is one column of the plan table in _shared/plans.js, and
   this is its `aiTurnsPerDay` column under the name every caller already uses. A future tier is a row
   there, not an edit here. ai-proxy's header states the free number in prose and
   tests/process-doc-facts-claims holds the two to each other. */
import { planColumn, DEFAULT_PLAN as PLANS_DEFAULT } from "./plans.js";
export const PLAN_LIMITS = planColumn("aiTurnsPerDay");
export const DEFAULT_PLAN = PLANS_DEFAULT;

/* (#R31/#R32 → #R801) The developer override, by the immutable auth.users.id carried in the
   DEV_USER_IDS secret — never by e-mail (a mutable field, and a public repository). `env` is
   `(name) => string` so this file holds no Deno global. */
export function devUserIds(env) {
  const raw = (typeof env === "function" ? env("DEV_USER_IDS") : "") || "";
  return String(raw).toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
}

/* The account, as the ledger needs it: { id, plan, isDev, limit }.
   `db` is a service-role supabase-js client (profiles.plan is owner/admin-only under RLS).
   A missing profiles row or column → the default plan, as ai-proxy has always done. */
export async function accountFor(db, userId, env) {
  const id = String(userId || "");
  let plan = DEFAULT_PLAN;
  try {
    const { data: prof } = await db.from("profiles").select("plan").eq("id", id).maybeSingle();
    if (prof && typeof prof.plan === "string" && prof.plan) plan = prof.plan;
  } catch (_) { /* profiles.plan may not exist yet → default free */ }
  const isDev = devUserIds(env).includes(id.toLowerCase());
  if (isDev) plan = "unlimited";
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS[DEFAULT_PLAN];
  return { id, plan, isDev, limit };
}

/* ══ (ai-quota-fairness) WHICH COHORT AN ACCOUNT IS IN — its age, and nothing it can claim ═════════
   ai-proxy draws a NEWCOMER's provider requests from a share of the project ceiling
   (_shared/ai-provider.js shareCeiling), so that a batch of fresh accounts cannot spend the day the
   established readers need. The cohort is decided from auth.users.created_at — a value the database
   wrote when the account was made, which no request can move and no amount of waiting shortens.
   ⚠ NOT A PLAN AND NOT A LIMIT: a newcomer keeps the whole of its plan (PLAN_LIMITS, the gloss lane,
   every step of a turn). What differs is only which part of the invoice fence its requests come out of.
   NEWCOMER_AGE_DAYS = 7 (no-ad-hoc-hardcoding §4):
     · Observation — production, 2026-10-01 (public.ai_usage × auth.users): of the 16 accounts ever
       charged for AI, 14 were first charged on the day they signed up (the other two at 14 and 37
       days), and at most 9 accounts under a week old used AI on one day, 16 turns between them. So
       real newcomers DO use AI in this
       window and the share is sized for them (ai-proxy NEWCOMER_SHARE). The age is not what makes a
       reader welcome — the share is; the age is the delay an account factory must wait out.
     · It is an ESTIMATE of that delay's worth, not a measurement: a week turns «make 17 accounts and
       spend the day now» into «make them and wait a week, and then spend only the reserve's share».
     · Expires when a newcomer day is measured to meet the share (`provider_quota` with
       meta.ceiling "newcomer_day" on a day that was readers) — then the share moves, not this.
     · Canonical place: THIS constant.
   A created_at that is missing or unreadable is a NEWCOMER: «established» is a claim that needs the
   date, and the smaller pool is the direction that cannot spend anyone else's day. */
export const NEWCOMER_AGE_DAYS = 7;
export const NEWCOMER = "newcomer";
export const ESTABLISHED = "established";

export function cohortOf(createdAt, nowMs) {
  const t = Date.parse(String(createdAt || ""));
  const now = Number.isFinite(+nowMs) ? +nowMs : Date.now();
  if (!Number.isFinite(t)) return NEWCOMER;
  return (now - t) >= NEWCOMER_AGE_DAYS * 86400 * 1000 ? ESTABLISHED : NEWCOMER;
}

/* The ledger did not answer. Thrown, not returned as «allowed»: a quota that cannot be consulted
   cannot say the account is inside it (the direction ai-proxy has always failed in — 500
   quota_unavailable). ⚠ It carries no database message: PostgREST errors name the schema. */
export class LedgerUnavailable extends Error {
  constructor() { super("ledger_unavailable"); this.name = "LedgerUnavailable"; }
}

const firstRow = (data) => (Array.isArray(data) ? data[0] : data) || null;

/* openTurn — consume one use for TODAY, once per turn key (public.consume_ai_turn).
     → { allowed, charged, used, calls, reason }   reason '' | 'limit' | 'turn_calls'
   The developer consumes nothing (allowed, charged false). An empty turn key charges every call —
   consume_ai_turn's own rule. `maxCalls` and `ttlSeconds` are the CALLER's (Atlas's turn is not a
   monitor run); the database clamps both. */
export async function openTurn(db, account, o) {
  const opt = o || {};
  if (account && account.isDev) return { allowed: true, charged: false, used: 0, calls: 0, reason: "" };
  let row = null;
  try {
    const { data, error } = await db.rpc("consume_ai_turn", {
      p_user: account.id, p_limit: account.limit, p_turn: String(opt.turn || ""),
      p_max_calls: opt.maxCalls, p_ttl_seconds: opt.ttlSeconds,
    });
    if (error) throw error;
    row = firstRow(data);
  } catch (_) { throw new LedgerUnavailable(); }
  if (!row) throw new LedgerUnavailable();
  return {
    allowed: !!row.allowed,
    charged: !!row.charged,
    used: Number(row.used) || 0,
    calls: Number(row.calls) || 0,
    reason: row.allowed ? "" : String(row.reason || "limit"),
  };
}

/* refundTurn — give back the use a failed call charged (public.refund_ai_turn). The ledger refuses a
   refund for a turn that has already answered (#R801), and only a call that CHARGED asks. */
export async function refundTurn(db, account, turn) {
  if (!account || account.isDev) return false;
  try { await db.rpc("refund_ai_turn", { p_user: account.id, p_turn: String(turn || "") }); return true; }
  catch (_) { return false; }
}

/* settleTurn — the turn has produced an answer, so no later failure under its key can refund it. */
export async function settleTurn(db, account, turn) {
  if (!account || account.isDev || !turn) return false;
  try { await db.rpc("settle_ai_turn", { p_user: account.id, p_turn: String(turn) }); return true; }
  catch (_) { return false; }
}

/* recordUsage — what the provider answers of this request COST, added to the account's day
   (public.ai_usage) and, when the turn key names a live turn row, to that turn (public.ai_turns).
   `total` is usageMeter().total(). Recorded for EVERY account, the developer's included: the
   developer is exempt from the allowance, not from the invoice.
   Nothing is written for a request that read no provider answer.
   ⚠ BEST-EFFORT AND OFF THE ANSWER'S PATH. A measurement that fails must not fail the answer it
   measures; when the platform offers EdgeRuntime.waitUntil the write finishes after the response,
   otherwise it is awaited (a node test, a runtime without it). Returns the promise either way. */
export function usageArgs(userId, turn, total) {
  const t = total || {};
  return {
    p_user: String(userId || ""),
    p_turn: String(turn || ""),
    p_calls: Math.max(0, Math.floor(Number(t.calls) || 0)),
    p_unmetered: Math.max(0, Math.floor(Number(t.unmetered) || 0)),
    p_input: Math.max(0, Math.floor(Number(t.input) || 0)),
    p_cached_read: Math.max(0, Math.floor(Number(t.cached_read) || 0)),
    p_cache_write: Math.max(0, Math.floor(Number(t.cache_write) || 0)),
    p_output: Math.max(0, Math.floor(Number(t.output) || 0)),
  };
}

export function recordUsage(db, userId, turn, total) {
  const args = usageArgs(userId, turn, total);
  if (!args.p_user || args.p_calls === 0) return Promise.resolve(false);
  const p = (async () => {
    try { const { error } = await db.rpc("record_ai_usage", args); return !error; }
    catch (_) { return false; }
  })();
  const rt = globalThis.EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") {
    try { rt.waitUntil(p); return Promise.resolve(true); } catch (_) { /* fall through: await it */ }
  }
  return p;
}
